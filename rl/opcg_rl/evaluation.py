"""Évaluation, séparée de l'entraînement : parties jouées pour mesurer, jamais apprises.

- graines d'évaluation (seeds.eval_seeds), disjointes de celles de l'entraînement ;
- parties dupliquées : chaque graine est jouée deux fois, le modèle à chaque siège (mêmes mélanges ; le premier joueur
  est tiré de la graine, donc le modèle commence dans l'une et joue second dans l'autre) ;
- adversaires : aléatoire, heuristique, Monte-Carlo (tirages fixés), autres modèles (anciennes versions) ;
- résultats par adversaire, par deck du modèle, par confrontation, premier/second joueur, avec intervalles de confiance.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

from .envpool import EnvPool
from .policy import Agent
from .seeds import eval_seeds


@dataclass
class EvalGame:
    opponent: str                 # libellé (« random », « heuristic », « mc16 », « u000120 »...)
    opp_seat_spec: dict | None    # adversaire intégré : {"kind": ..., "samples": ...} ; None : modèle `opp_agent`
    opp_agent: str | None         # clé dans le dictionnaire des modèles
    agent_seat: int
    decks: tuple[str, str]        # (deck du modèle évalué, deck adverse)
    seed: int


def wilson(wins: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = wins / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def parse_opponent(text: str) -> tuple[str, dict | None, str | None]:
    """« random », « heuristic », « mc », « mc:16 », « model:<chemin> » -> (libellé, siège intégré, clé de modèle)."""
    if text in ("random", "heuristic"):
        return text, {"kind": text}, None
    if text.startswith("mc"):
        samples = int(text.split(":")[1]) if ":" in text else 16
        return f"mc{samples}", {"kind": "mc", "samples": samples}, None
    if text.startswith("model:"):
        key = text.split(":", 1)[1]
        return key, None, key
    raise ValueError(f"adversaire inconnu : {text} (random, heuristic, mc:N, model:chemin)")


def plan_games(opponents: list[str], deck_pairs: list[tuple[str, str]], seeds_per_pair: int, seed_offset: int = 0
               ) -> list[EvalGame]:
    games = []
    seeds = eval_seeds(len(deck_pairs) * seeds_per_pair, seed_offset)
    for opp in opponents:
        label, spec, key = parse_opponent(opp)
        k = 0
        for decks in deck_pairs:
            for _ in range(seeds_per_pair):
                for seat in (0, 1):
                    games.append(EvalGame(label, spec, key, seat, decks, seeds[k]))
                k += 1
    return games


def run_games(pool: EnvPool, env_ids: list[int], agents: dict[str, Agent], evaluated: str, games: list[EvalGame],
              greedy: bool, seed: int, max_decisions: int = 3000, record: int = 0) -> list[dict]:
    """Joue toutes les parties sur les environnements `env_ids` ; renvoie un résultat par partie."""
    rng = np.random.default_rng(seed)
    queue = list(enumerate(games))
    running: dict[int, tuple[int, EvalGame, list[str | None]]] = {}
    pending: dict[int, object] = {}
    outcomes: list[dict | None] = [None] * len(games)
    free = list(env_ids)

    def start(env: int) -> dict:
        i, g = queue.pop(0)
        seats: list[dict] = [{"kind": "agent"}, {"kind": "agent"}]
        ctrl: list[str | None] = [evaluated, evaluated]
        if g.opp_seat_spec:
            seats[1 - g.agent_seat] = g.opp_seat_spec
            ctrl[1 - g.agent_seat] = None
        else:
            ctrl[1 - g.agent_seat] = g.opp_agent
        decks = [g.decks[0], g.decks[1]] if g.agent_seat == 0 else [g.decks[1], g.decks[0]]
        running[env] = (i, g, ctrl)
        return {"env": env, "seed": g.seed, "decks": decks, "first": "random", "seats": seats,
                "maxDecisions": max_decisions, "record": i < record}

    resets = [start(free.pop(0)) for _ in range(min(len(free), len(queue)))]
    actions: list[dict] = []
    while running:
        results = pool.run(actions=actions, resets=resets)
        resets, actions = [], []
        for r in results:
            if r.done:
                i, g, _ = running.pop(r.env)
                score = 0.5 if (r.truncated or r.error) else (1.0 if r.winner == g.agent_seat else 0.0)
                outcomes[i] = {
                    "opponent": g.opponent, "agent_seat": g.agent_seat, "agent_deck": g.decks[0], "opp_deck": g.decks[1],
                    "seed": g.seed, "score": score, "winner": r.winner, "turns": r.turns, "decisions": r.decisions,
                    "truncated": r.truncated, "error": r.error, "record": r.record,
                    "agent_first": (r.first == g.agent_seat) if r.first is not None else None,
                }
                if queue:
                    resets.append(start(r.env))
            else:
                pending[r.env] = r.obs[0]
        by_ctrl: dict[str, list] = defaultdict(list)
        for env, o in pending.items():
            by_ctrl[running[env][2][o.seat]].append(o)
        pending.clear()
        for ctrl, obs_list in by_ctrl.items():
            acts, _, vals, probs = agents[ctrl].act(obs_list, rng, greedy=greedy)
            for o, a, v, p in zip(obs_list, acts, vals, probs):
                act = {"env": o.env, "index": a}
                if running[o.env][0] < record:
                    act["probs"] = [round(float(x), 4) for x in p]
                    act["value"] = round(float(v), 4)
                actions.append(act)
    return [o for o in outcomes if o is not None]


def summarize(outcomes: list[dict]) -> dict:
    """Taux de victoire (parties tronquées ou en erreur comptées comme une demi-victoire, et signalées)."""
    report: dict = {}
    by_opp: dict[str, list[dict]] = defaultdict(list)
    for o in outcomes:
        by_opp[o["opponent"]].append(o)
    for opp, rows in by_opp.items():
        n = len(rows)
        wins = sum(r["score"] for r in rows)
        lo, hi = wilson(wins, n)
        entry = {
            "games": n, "winrate": wins / n, "ci95": [lo, hi],
            "mean_turns": float(np.mean([r["turns"] for r in rows])),
            "mean_decisions": float(np.mean([r["decisions"] for r in rows])),
            "truncated": sum(r["truncated"] for r in rows), "errors": sum(bool(r["error"]) for r in rows),
            "by_agent_deck": {}, "by_opp_deck": {}, "by_matchup": {}, "first": None, "second": None,
        }
        for key, field in (("by_agent_deck", "agent_deck"), ("by_opp_deck", "opp_deck")):
            groups: dict[str, list[float]] = defaultdict(list)
            for r in rows:
                groups[r[field]].append(r["score"])
            entry[key] = {k: {"games": len(v), "winrate": float(np.mean(v))} for k, v in sorted(groups.items())}
        mu: dict[str, list[float]] = defaultdict(list)
        for r in rows:
            mu[f"{r['agent_deck']}|{r['opp_deck']}"].append(r["score"])
        entry["by_matchup"] = {k: {"games": len(v), "winrate": float(np.mean(v))} for k, v in sorted(mu.items())}
        for name, flag in (("first", True), ("second", False)):
            sel = [r["score"] for r in rows if r.get("agent_first") is flag]
            entry[name] = {"games": len(sel), "winrate": float(np.mean(sel)) if sel else None}
        report[opp] = entry
    return report


def to_markdown(report: dict, title: str) -> str:
    lines = [f"# {title}", "", "| Adversaire | Parties | Victoires | IC 95 % | 1er joueur | 2e joueur | Tours moyens | Tronquées | Erreurs |",
             "|---|---|---|---|---|---|---|---|---|"]
    pct = lambda x: "—" if x is None else f"{100 * x:.1f} %"
    for opp, e in report.items():
        lines.append(f"| {opp} | {e['games']} | {pct(e['winrate'])} | {pct(e['ci95'][0])} – {pct(e['ci95'][1])} | "
                     f"{pct(e['first']['winrate'])} | {pct(e['second']['winrate'])} | {e['mean_turns']:.1f} | {e['truncated']} | {e['errors']} |")
    for opp, e in report.items():
        lines += ["", f"## Contre {opp} : par deck du modèle", "", "| Deck | Parties | Victoires |", "|---|---|---|"]
        for deck, v in e["by_agent_deck"].items():
            lines.append(f"| {deck} | {v['games']} | {pct(v['winrate'])} |")
        decks = sorted({k.split('|')[0] for k in e["by_matchup"]} | {k.split('|')[1] for k in e["by_matchup"]})
        if len(decks) > 1:
            lines += ["", f"Confrontations (ligne : deck du modèle, colonne : deck adverse)", "",
                      "| | " + " | ".join(decks) + " |", "|---" * (len(decks) + 1) + "|"]
            for a in decks:
                cells = [pct(e["by_matchup"][f"{a}|{b}"]["winrate"]) if f"{a}|{b}" in e["by_matchup"] else "" for b in decks]
                lines.append(f"| {a} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"
