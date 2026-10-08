"""Collecte des parties d'entraînement et apprentissage PPO (acteur-critique, avantages GAE).

Récompense : +1 victoire, −1 défaite, à la dernière décision du joueur ; aucune récompense intermédiaire ; γ = 1.
Partie tronquée par le plafond de sécurité : aucune récompense, la valeur de la dernière position où le joueur a
décidé (estimée par le réseau) complète l'avantage — atteindre le plafond ne rapporte ni ne coûte rien de plus que de
continuer à jouer.
Partie arrêtée par une erreur du moteur : écartée (aucune donnée apprise), comptée et enregistrée pour analyse.

Les parties continuent d'une mise à jour à l'autre : une partie commencée avant une mise à jour est finie avec le
nouveau réseau. Ses premières décisions ont donc été prises par la version précédente ; PPO en tient compte (rapport
de probabilités avec la politique qui a vraiment joué) et les valeurs sont recalculées avec le réseau actuel.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np
import torch
import torch.nn.functional as F

from .envpool import EnvPool, StepResult
from .league import League, OpponentChoice, choose_opponent
from .model import entropy
from .obs import Obs
from .policy import Agent
from .seeds import TrainSeeds


@dataclass
class Decision:
    obs: Obs
    action: int
    logp: float
    value: float
    version: int


@dataclass
class Traj:
    opponent: str
    version: int
    steps: list[Decision] = field(default_factory=list)
    reward: float = 0.0
    truncated: bool = False


@dataclass
class Game:
    opponent: OpponentChoice
    controllers: list[str | None]   # « learner », « snap:<id> » (ancienne version) ou None (IA intégrée)
    decks: list[str]
    seed: int
    record: bool


class Stats:
    """Statistiques des parties finies depuis la dernière lecture."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.games = 0
        self.by_opp: dict[str, list[float]] = defaultdict(list)
        self.turns: list[int] = []
        self.decisions: list[int] = []
        self.truncated = 0
        self.errors = 0
        self.records: list[str] = []

    def summary(self) -> dict:
        out = {
            "games": self.games, "truncated_rate": self.truncated / max(1, self.games),
            "error_rate": self.errors / max(1, self.games),
            "mean_turns": float(np.mean(self.turns)) if self.turns else 0.0,
            "mean_decisions": float(np.mean(self.decisions)) if self.decisions else 0.0,
        }
        all_scores = [s for v in self.by_opp.values() for s in v]
        out["winrate"] = float(np.mean(all_scores)) if all_scores else 0.0
        out["mean_reward"] = float(np.mean([2 * s - 1 for s in all_scores])) if all_scores else 0.0
        families: dict[str, list[float]] = defaultdict(list)       # « pool:u000025 », « pool:u000050 »... → « pool »
        for k, v in self.by_opp.items():
            families[k.split(":")[0]].extend(v)
        for k, v in sorted(families.items()):
            out[f"winrate/{k}"] = float(np.mean(v))
            out[f"games/{k}"] = len(v)
        return out


class Collector:
    def __init__(self, pool: EnvPool, env_ids: list[int], agent: Agent, league: League, seeds: TrainSeeds,
                 rng: np.random.Generator, cfg: dict, load_snapshot):
        self.pool = pool
        self.env_ids = env_ids
        self.agent = agent
        self.league = league
        self.seeds = seeds
        self.rng = rng
        self.cfg = cfg
        self.load_snapshot = load_snapshot           # id -> Agent (anciennes versions, en cache)
        self.level: dict = {}
        self.version = 0
        self.games: dict[int, Game] = {}
        self.pending: dict[int, Obs] = {}
        self.open: dict[tuple[int, int], Traj] = {}
        self.to_reset: list[dict] = []
        self.ready: list[Traj] = []
        self.ready_steps = 0
        self.stats = Stats()
        self.started = False
        self.games_started = 0
        self.timing = {"env_s": 0.0, "infer_s": 0.0, "decisions": 0}

    def snapshots_in_play(self) -> set[str]:
        """Anciennes versions qui jouent une partie en cours."""
        return {c.split(":", 1)[1] for g in self.games.values() for c in g.controllers if c and c.startswith("snap:")}

    # ---------- nouvelles parties ----------

    def _decks(self) -> tuple[str, str]:
        decks = self.level.get("decks") or "all"
        pool = list(self.pool.spec.decks) if decks == "all" else list(decks)
        a = pool[int(self.rng.integers(len(pool)))]
        b = a if self.level.get("mirror") else pool[int(self.rng.integers(len(pool)))]
        return a, b

    def _new_game(self, env: int) -> dict:
        opp = choose_opponent(self.level, self.league, self.rng)
        learner_deck, opp_deck = self._decks()
        ls = int(self.rng.integers(2))
        seats: list[dict] = [{"kind": "agent"}, {"kind": "agent"}]
        controllers: list[str | None] = ["learner", "learner"]
        if opp.kind == "pool":
            controllers[1 - ls] = f"snap:{opp.snapshot.id}"
        elif opp.kind != "self":
            seats[1 - ls] = {"kind": opp.kind, **({"samples": opp.samples} if opp.samples else {})}
            controllers[1 - ls] = None
        decks = [learner_deck, opp_deck] if ls == 0 else [opp_deck, learner_deck]
        seed = self.seeds.next()
        every = int(self.cfg.get("record_train_every", 0) or 0)
        record = bool(every) and self.games_started % every == 0
        self.games_started += 1
        self.games[env] = Game(opp, controllers, decks, seed, record)
        return {"env": env, "seed": seed, "decks": decks, "first": "random", "seats": seats,
                "maxDecisions": int(self.cfg.get("max_decisions", 3000)), "record": record}

    # ---------- collecte ----------

    def collect(self, target_steps: int) -> list[Traj]:
        if not self.started:
            self.started = True
            self._ingest(self.pool.run(resets=[self._new_game(e) for e in self.env_ids]))
        while self.ready_steps < target_steps:
            by_ctrl: dict[str, list[Obs]] = defaultdict(list)
            for env, o in self.pending.items():
                by_ctrl[self.games[env].controllers[o.seat]].append(o)
            actions = []
            t0 = time.perf_counter()
            drop = float(self.agent.model.cfg.id_dropout)
            for ctrl, obs_list in by_ctrl.items():
                agent = self.agent if ctrl == "learner" else self.load_snapshot(ctrl.split(":", 1)[1])
                if ctrl == "learner" and drop > 0:
                    for o in obs_list:
                        o.id_keep = (self.rng.random(o.n) >= drop).astype(np.int64)
                acts, logps, vals, probs = agent.act(obs_list, self.rng)
                for o, a, lp, v, p in zip(obs_list, acts, logps, vals, probs):
                    g = self.games[o.env]
                    if ctrl == "learner":
                        key = (o.env, o.seat)
                        if key not in self.open:
                            self.open[key] = Traj(g.opponent.label, self.version)
                        self.open[key].steps.append(Decision(o.compact(), a, lp, v, self.version))
                    act = {"env": o.env, "index": a}
                    if g.record:
                        act["probs"] = [round(float(x), 4) for x in p]
                        act["value"] = round(float(v), 4)
                    actions.append(act)
            self.timing["infer_s"] += time.perf_counter() - t0
            self.timing["decisions"] += len(actions)
            self.pending.clear()
            t0 = time.perf_counter()
            resets, self.to_reset = self.to_reset, []
            results = self.pool.run(actions=actions, resets=resets)
            self.timing["env_s"] += time.perf_counter() - t0
            self._ingest(results)
        out, self.ready, self.ready_steps = self.ready, [], 0
        return out

    def _ingest(self, results: list[StepResult]) -> None:
        for r in results:
            if r.done:
                self._finish(r)
                self.to_reset.append(self._new_game(r.env))
            else:
                self.pending[r.env] = r.obs[0]

    def _finish(self, r: StepResult) -> None:
        g = self.games.pop(r.env)
        st = self.stats
        st.games += 1
        st.turns.append(r.turns)
        st.decisions.append(r.decisions)
        if r.record:
            st.records.append(r.record)
        if r.truncated:
            st.truncated += 1
        if r.error:
            st.errors += 1
        learner_seats = [s for s in (0, 1) if g.controllers[s] == "learner"]
        for s in learner_seats:
            traj = self.open.pop((r.env, s), None) or Traj(g.opponent.label, self.version)
            if r.error:
                continue                       # erreur du moteur : rien n'est appris de cette partie
            if r.truncated:
                traj.truncated = True
                score = 0.5
            else:
                traj.reward = 1.0 if r.winner == s else -1.0
                score = 1.0 if r.winner == s else 0.0
            if g.opponent.kind != "self":
                st.by_opp[g.opponent.label].append(score)
                if g.opponent.kind == "pool":
                    self.league.record(g.opponent.snapshot.id, score)
            if traj.steps:
                self.ready.append(traj)
                self.ready_steps += len(traj.steps)
        if g.opponent.kind == "self" and not r.error:
            st.by_opp["self"].append(0.5)


# ---------- apprentissage ----------

def compute_gae(trajs: list[Traj], values: np.ndarray, gamma: float, lam: float):
    """Avantages GAE(λ) et cibles de valeur, partie par partie (récompense seulement à la fin). Partie tronquée : la
    valeur de la dernière décision du joueur tient lieu de suite (pas de récompense)."""
    n = sum(len(t.steps) for t in trajs)
    adv = np.zeros(n, np.float32)
    i = 0
    for k, t in enumerate(trajs):
        T = len(t.steps)
        v = values[i:i + T]
        last = float(v[-1]) if t.truncated else 0.0
        next_v = np.append(v[1:], last)
        rewards = np.zeros(T, np.float32)
        if not t.truncated:
            rewards[-1] = t.reward
        delta = rewards + gamma * next_v - v
        gae = 0.0
        for j in range(T - 1, -1, -1):
            gae = delta[j] + gamma * lam * gae
            adv[i + j] = gae
        i += T
    return adv, adv + values


def ppo_update(agent: Agent, optimizer: torch.optim.Optimizer, trajs: list[Traj], cfg: dict,
               rng: np.random.Generator, version: int) -> dict:
    model = agent.model
    steps = [d for t in trajs for d in t.steps]
    obs = [d.obs for d in steps]
    t0 = time.perf_counter()
    values = agent.values(obs)
    adv, ret = compute_gae(trajs, values, cfg["gamma"], cfg["gae_lambda"])
    actions = torch.tensor([d.action for d in steps], dtype=torch.long)
    old_logp = torch.tensor([d.logp for d in steps], dtype=torch.float32)
    adv_t = torch.from_numpy(adv)
    ret_t = torch.from_numpy(ret.astype(np.float32))
    n = len(steps)
    mb = int(cfg["minibatch_size"])
    stats = defaultdict(list)
    model.train()
    dev = agent.device
    stop = False
    for epoch in range(int(cfg["epochs"])):
        perm = rng.permutation(n)
        for start in range(0, n, mb):
            idx = perm[start:start + mb]
            batch = agent.collate([obs[j] for j in idx])
            logits, value = agent.forward(batch)
            logp_all = F.log_softmax(logits, dim=-1)
            a = actions[idx].to(dev)
            logp = logp_all.gather(1, a.unsqueeze(1)).squeeze(1)
            old = old_logp[idx].to(dev)
            mb_adv = adv_t[idx].to(dev)
            if cfg.get("normalize_advantages", True) and len(idx) > 1:
                mb_adv = (mb_adv - mb_adv.mean()) / (mb_adv.std() + 1e-8)
            ratio = torch.exp(logp - old)
            clip = cfg["clip"]
            pg_loss = -torch.min(ratio * mb_adv, torch.clamp(ratio, 1 - clip, 1 + clip) * mb_adv).mean()
            v_loss = 0.5 * ((value - ret_t[idx].to(dev)) ** 2).mean()
            ent = entropy(logits, batch["opt_mask"]).mean()
            loss = pg_loss + cfg["value_coef"] * v_loss - cfg["entropy_coef"] * ent
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), cfg["max_grad_norm"])
            optimizer.step()
            with torch.no_grad():
                log_ratio = logp - old
                approx_kl = ((ratio - 1) - log_ratio).mean().item()
                stats["policy_loss"].append(pg_loss.item())
                stats["value_loss"].append(v_loss.item())
                stats["entropy"].append(ent.item())
                stats["approx_kl"].append(approx_kl)
                stats["clip_frac"].append(((ratio - 1).abs() > clip).float().mean().item())
                stats["grad_norm"].append(float(grad_norm))
            target_kl = cfg.get("target_kl")
            if target_kl and approx_kl > 1.5 * target_kl:
                stop = True
                break
        if stop:
            break
    out = {k: float(np.mean(v)) for k, v in stats.items()}
    var = float(np.var(ret))
    out["explained_variance"] = float(1 - np.var(ret - values) / var) if var > 1e-8 else 0.0
    out["value_mean"] = float(np.mean(values))
    out["advantage_std"] = float(np.std(adv))
    out["epochs_done"] = epoch + 1
    out["samples"] = n
    # décisions prises par une version antérieure du réseau (parties commencées avant la mise à jour précédente)
    out["policy_lag"] = float(np.mean([version - d.version for d in steps]))
    out["learn_s"] = time.perf_counter() - t0
    return out
