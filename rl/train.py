"""Entraînement de l'IA par apprentissage par renforcement (PPO), niveau par niveau.

    python train.py                      # commence, ou reprend l'entraînement « opcg » là où il s'était arrêté
    python train.py --config cpu         # réglages pour un ordinateur sans GPU (config/cpu.yaml)
    python train.py --config smoke       # essai rapide de toute la chaîne
    python train.py --run essai2 --fresh # nouvel entraînement, depuis zéro
    python train.py --set ppo.lr=0.0001 --set env.workers=6
    python train.py --config gpu --deck META-ROBIN-2026-10   # IA spécialisée sur un deck (config/deck.yaml)

Ctrl+C : un point de sauvegarde est écrit avant de quitter ; la commande à lancer pour reprendre est affichée
(la même, sans --fresh, --level ni --resume, qui n'ont d'effet qu'une fois). Voir README.md pour le détail.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from collections import OrderedDict
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl import checkpoint as ck  # noqa: E402
from opcg_rl.config import dump, load_config  # noqa: E402
from opcg_rl.device import describe, memory_stats, select_device  # noqa: E402
from opcg_rl.elo import anchor_label, fit_elo  # noqa: E402
from opcg_rl.evaluation import plan_games, run_games, summarize, to_markdown  # noqa: E402
from opcg_rl.league import League, Snapshot  # noqa: E402
from opcg_rl.logger import Logger  # noqa: E402
from opcg_rl import migrate  # noqa: E402
from opcg_rl import specialize as sp  # noqa: E402
from opcg_rl.model import parameter_count  # noqa: E402
from opcg_rl.paths import CHECKPOINTS_DIR, LOGS_DIR  # noqa: E402
from opcg_rl.policy import Agent, build_model, vocab_from_decks  # noqa: E402
from opcg_rl.ppo import Collector, ppo_update  # noqa: E402
from opcg_rl.runtime import open_pool, resolve_checkpoint, resolve_workers  # noqa: E402
from opcg_rl.seeds import TrainSeeds  # noqa: E402

EXIT_GATE_FAILED = 3


def resume_command() -> str:
    """La commande qui reprend cet entraînement : celle qui l'a lancé, sans les options à effet unique (les
    abréviations d'options sont refusées par parse_args, elles ne peuvent pas passer au travers)."""
    out, skip = [], False
    for a in sys.argv[1:]:
        if skip:
            skip = False
            continue
        if a == "--fresh" or a.startswith(("--level=", "--resume=")):
            continue
        if a in ("--level", "--resume"):
            skip = True
            continue
        out.append(a)
    args = ["python", sys.argv[0] or "train.py", *out]
    return subprocess.list2cmdline(args) if sys.platform == "win32" else shlex.join(args)


def parse_args():
    p = argparse.ArgumentParser(description="Entraînement PPO de l'IA One Piece TCG", allow_abbrev=False)
    p.add_argument("--config", action="append", default=[], help="fichier de réglages en plus de default.yaml (ex. cpu, gpu, smoke)")
    p.add_argument("--set", action="append", default=[], metavar="CLÉ=VALEUR", help="change un réglage (ex. ppo.lr=0.0001)")
    p.add_argument("--run", help="nom de l'entraînement (dossiers checkpoints/<run>, logs/<run>)")
    p.add_argument("--resume", help="reprendre depuis ce point de sauvegarde (par défaut : le dernier de l'entraînement)")
    p.add_argument("--fresh", action="store_true", help="recommencer depuis zéro (les anciens fichiers sont mis de côté)")
    p.add_argument("--level", type=int, help="forcer le niveau (1 à 5) — y compris sans avoir validé le précédent")
    p.add_argument("--device", help="auto, cpu, cuda, mps")
    p.add_argument("--workers", help="processus Node (auto ou nombre)")
    p.add_argument("--max-updates", type=int, help="arrêt après ce nombre total de mises à jour")
    p.add_argument("--deck", help="IA spécialisée : le modèle ne joue que ce deck (réglages config/deck.yaml, "
                                  "entraînement deck-<deck>, départ : le modèle général specialize.base)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    deck = args.deck
    if deck and "deck" not in args.config:
        args.config.append("deck")
    cfg = load_config(args.config, args.set)
    if deck:
        cfg["run"] = f"deck-{deck}"
    if args.run:
        cfg["run"] = args.run
    if args.device:
        cfg["device"] = args.device
    if args.workers:
        cfg["env"]["workers"] = args.workers
    if args.max_updates:
        cfg["train"]["max_updates"] = args.max_updates
    cfg["run"] = str(cfg["run"])
    run_dir = CHECKPOINTS_DIR / cfg["run"]
    log_dir = LOGS_DIR / cfg["run"]
    if args.fresh and (run_dir.exists() or log_dir.exists()):
        # points de sauvegarde ET journaux mis de côté (sinon les courbes des deux entraînements se mélangeraient)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        aside = run_dir.with_name(f"{run_dir.name}-ancien-{stamp}")
        for d in (run_dir, log_dir):
            if d.exists():
                shutil.move(str(d), d.with_name(aside.name))
        print(f"Ancien entraînement mis de côté sous le nom {aside.name} (pour le reprendre : python train.py --run {aside.name})")
    if int(cfg["env"]["eval_envs_per_worker"]) < 1:
        raise SystemExit("env.eval_envs_per_worker doit valoir au moins 1 : les évaluations de passage de niveau en ont besoin.")

    device = select_device(cfg["device"])
    workers = resolve_workers(cfg["env"]["workers"], reserve_for_torch=device.type == "cpu")
    if cfg.get("torch_threads", "auto") == "auto":
        torch.set_num_threads(max(1, (os.cpu_count() or 2) - workers) if device.type == "cpu" else max(1, min(4, os.cpu_count() or 1)))
    else:
        torch.set_num_threads(int(cfg["torch_threads"]))
    logger = Logger(log_dir, use_tensorboard=cfg["train"].get("tensorboard", True))
    log = logger.text
    log(f"=== Entraînement « {cfg['run']} » — {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
    log(f"Matériel : {describe(device)}")
    n_train = int(cfg["env"]["envs_per_worker"])
    n_eval = int(cfg["env"]["eval_envs_per_worker"])
    log(f"Parties : {workers} processus Node × {n_train} parties simultanées (+{n_eval} pour l'évaluation)")

    pool = open_pool(cfg, n_train + n_eval, workers, log_dir=log_dir / "node", record_dir=log_dir / "trajectories",
                     anomaly_dir=log_dir / "anomalies")
    spec = pool.spec
    log(f"Moteur {spec.engine}, encodage {spec.spec_hash}, catalogue {spec.catalog} ({len(spec.cards) - 1} cartes)")
    if spec.synthetic:
        msg = "CATALOGUE SYNTHÉTIQUE (cartes inventées) : un modèle entraîné ainsi ne vaut rien pour le vrai jeu."
        if not cfg.get("allow_synthetic"):
            pool.close()
            raise SystemExit(f"{msg}\nLance « npm run game:cards » pour le vrai catalogue (ou allow_synthetic: true pour un test).")
        log(f"ATTENTION — {msg}")
    if deck and deck not in spec.decks:
        pool.close()
        raise SystemExit(f"Deck inconnu : {deck}. Decks du registre : {', '.join(spec.decks)}")
    train_envs = [w * (n_train + n_eval) + i for w in range(workers) for i in range(n_train)]
    eval_envs = [w * (n_train + n_eval) + n_train + i for w in range(workers) for i in range(n_eval)]
    levels = cfg["curriculum"]["levels"]

    rng = np.random.default_rng(cfg["seed"])
    torch.manual_seed(cfg["seed"])
    state = {"update": 0, "games": 0, "decisions": 0, "level": int(cfg["train"].get("start_level", 0)), "level_updates": 0,
             "streak": 0, "level_start": {}, "gate_history": [], "elo_results": [], "seed_counter": 0, "elapsed": 0.0}
    ckpt = None
    resume_path = None
    latest = None if args.fresh else ck.load_latest(run_dir, warn=log)
    if args.resume:
        wanted = str(Path(args.resume).resolve())
        if latest and latest[1].get("state", {}).get("resumed_from") == wanted:
            # même commande relancée : on continue cet entraînement au lieu de revenir en arrière
            log(f"--resume {args.resume} déjà appliqué à cet entraînement : reprise depuis son dernier point de sauvegarde")
            resume_path, ckpt = latest
        else:
            resume_path, ckpt = Path(args.resume), ck.load(Path(args.resume))
            ckpt.setdefault("state", {})["resumed_from"] = wanted
            ckpt["state"].pop("forced_level", None)      # marque d'un autre lancement : ne bloque pas un --level
    elif latest:
        resume_path, ckpt = latest
    # IA spécialisée qui commence : départ du modèle général (et de son optimiseur), état d'entraînement neuf
    base_start = None
    if deck and not ckpt:
        base_path = resolve_checkpoint(str(cfg["specialize"]["base"]))
        base_start = (base_path, ck.load(base_path))
    was = ((ckpt or {}).get("state", {}).get("specialize") or {}).get("deck")
    if ckpt and was != deck:
        pool.close()
        if was and not deck:
            raise SystemExit(f"Cet entraînement est une IA spécialisée sur le deck {was} : ajoute --deck {was}")
        raise SystemExit(f"Le point de sauvegarde {resume_path} n'est pas une IA spécialisée sur le deck {deck} "
                         f"({'deck ' + was if was else 'modèle général'}) : choisis un autre nom d'entraînement (--run)")
    # point de sauvegarde de cet entraînement (sinon : d'un autre dossier, dont la ligue sera copiée ici)
    own = resume_path is not None and run_dir.resolve() in resume_path.resolve().parents
    migrated_from = None
    if ckpt:
        try:
            weights, model_cfg, migrated_from = migrate.adapt(ckpt["model_state"], ckpt["model_config"], ckpt.get("spec_hash"),
                                                              spec, f"Le point de sauvegarde {resume_path}")
        except migrate.EncodingMismatch as err:
            raise SystemExit(f"{err}")
        vocab = ckpt["vocab"]
        model = build_model(spec, vocab, model_cfg)
        model.load_state_dict(weights)
        if migrated_from:
            log(f"Modèle prolongé vers l'encodage {spec.spec_hash} : {spec.opt_dim - migrated_from} nouvelles colonnes "
                "d'options, poids nuls au départ : il joue d'abord exactement comme avant")
        asked = {k: v for k, v in cfg["model"].items() if k in ckpt["model_config"] and ckpt["model_config"][k] != v}
        if asked:
            log(f"ATTENTION : la taille du modèle ne change pas à la reprise ; réglages ignorés : {json.dumps(asked)} "
                "(nouvel entraînement : --fresh ou --run)")
        state.update(ckpt["state"])
        log(f"Reprise depuis {resume_path} (mise à jour {state['update']}, {state['games']} parties, niveau {levels[state['level']]['name']})")
        if own:
            aside = ck.set_aside_after(run_dir, state["update"], time.strftime("%Y%m%d-%H%M%S"))
            if aside:
                log(f"Points de sauvegarde et versions de la ligue postérieurs à la mise à jour {state['update']} "
                    f"(histoire abandonnée) déplacés dans {aside}")
    elif base_start:
        base_path, base = base_start
        try:
            weights, model_cfg, base_migrated = migrate.adapt(base["model_state"], base["model_config"], base.get("spec_hash"),
                                                              spec, f"Le modèle général {base_path}")
        except migrate.EncodingMismatch as err:
            raise SystemExit(f"{err}")
        vocab = sp.extend_vocab(base["vocab"], spec)
        new_rows = len(vocab) - len(base["vocab"])
        model = build_model(spec, vocab, model_cfg)
        model.load_state_dict(sp.extend_weights(weights, new_rows))
        sp.save_base(run_dir, base_path, {**base, "model_state": weights, "model_config": model_cfg, "spec_hash": spec.spec_hash})
        base_update = base.get("state", {}).get("update")
        state["specialize"] = {"deck": deck, "base": str(base_path), "base_update": base_update}
        log(f"IA spécialisée sur le deck {deck} ({spec.decks[deck]['name']}) : départ du modèle général {base_path} "
            f"(mise à jour {base_update}) ; vocabulaire prolongé de {len(base['vocab'])} à {len(vocab)} cartes "
            "(nouvelles cartes : identifiant de la carte inconnue au départ)")
    else:
        deck_ids = sorted({d for lv in levels for d in (spec.decks if lv.get("decks", "all") == "all" else lv["decks"])})
        vocab = vocab_from_decks(spec, deck_ids)
        model = build_model(spec, vocab, cfg["model"])
        log("Nouvel entraînement")
    if args.level and state.get("forced_level") == args.level:
        log(f"--level {args.level} déjà appliqué à cet entraînement : ignoré (retire-le de la commande)")
    elif args.level:
        state["level"] = max(0, min(len(levels) - 1, args.level - 1))
        state["level_updates"] = 0
        state["streak"] = 0
        state["forced_level"] = args.level
        log(f"Niveau forcé : {levels[state['level']]['name']}")
    derived = ("static_dim", "dyn_dim", "glob_dim", "opt_dim", "vocab_size", "groups", "count_index")
    cfg["model"] = {k: v for k, v in model.cfg.to_dict().items() if k not in derived}   # celle du modèle réellement chargé
    agent = Agent(model, vocab, spec, device, "learner")
    # demi-précision (ppo.amp) : apprentissage calculé en float16 sur GPU NVIDIA (cœurs Tensor) ; poids, optimiseur et
    # pertes restent en float32. Pas pour jouer : les petits lots de chaque coup y sont plus lents (mesuré)
    amp = bool(cfg["ppo"].get("amp")) and device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda") if amp else None
    if amp:
        if ckpt and ckpt.get("scaler"):
            scaler.load_state_dict(ckpt["scaler"])
        log("Demi-précision (ppo.amp) : apprentissage calculé en float16")
    log(f"Modèle : {parameter_count(model) / 1e6:.2f} M paramètres, vocabulaire de {len(vocab)} cartes, {json.dumps(model.cfg.to_dict())}")
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg["ppo"]["lr"], eps=1e-5)
    league = League(run_dir / "league", pfsp_power=cfg["train"]["pfsp_power"], max_snapshots=cfg["train"]["max_snapshots"])
    if ckpt:
        if ckpt.get("optimizer_state"):
            opt_state = ckpt["optimizer_state"]
            if migrated_from:
                opt_state = migrate.adapt_optimizer(opt_state, model, migrated_from)
            optimizer.load_state_dict(opt_state)
            for g in optimizer.param_groups:
                g["lr"] = cfg["ppo"]["lr"]
        league.load_state(ckpt.get("league", {}), keep=set(state["level_start"].values()), warn=log,
                          source=None if own else resume_path.parent / "league",
                          cleanup=own and "league" in ckpt)
        if ckpt.get("rng"):
            ck.restore_rng(ckpt["rng"], rng)
    elif base_start and base_start[1].get("optimizer_state") and not base_migrated:
        optimizer.load_state_dict(sp.extend_optimizer(base_start[1]["optimizer_state"], model, new_rows))
        for g in optimizer.param_groups:
            g["lr"] = cfg["ppo"]["lr"]
    seeds = TrainSeeds(state["seed_counter"], salt=cfg["seed"])

    # IA spécialisée : le modèle général figé, adversaire d'entraînement (« base ») et référence des évaluations
    base_agent = None
    if deck:
        base_agent, base_data = sp.load_base(run_dir, spec, device)
        log(f"Deck joué : {deck} ; adversaire figé « base » : modèle général {base_data.get('source')} "
            f"(mise à jour {base_data.get('state', {}).get('update')})")
    elif any(o["kind"] in ("base", "experts") for lv in levels for o in lv["opponents"]) or \
            any(g.get("opponent") in ("base", "experts") for lv in levels for g in lv.get("gate", [])):
        pool.close()
        raise SystemExit("Adversaires « base » et « experts » (modèle général, autres IA spécialisées) : seulement pour "
                         "une IA spécialisée (--deck)")

    # Ligue des spécialistes : les autres IA spécialisées jouent leur deck contre celle-ci (adversaire « experts ») ;
    # relues au départ et à chaque évaluation, car elles progressent aussi. Quelques-unes par mise à jour
    # (specialize.experts_per_update) : chaque modèle de plus à faire jouer ralentit la collecte.
    spec_cfg = cfg.get("specialize") or {}
    experts_run = str(spec_cfg.get("experts_run", "deck-{deck}"))
    experts_per_update = int(spec_cfg.get("experts_per_update", 4) or 0)
    expert_agents: dict[str, Agent] = {}

    def refresh_experts() -> None:
        if not deck:
            return
        expert_agents.clear()
        found = {}
        for d in spec.decks:
            got = sp.load_expert(CHECKPOINTS_DIR / experts_run.format(deck=d), d, spec, device, warn=log) if d != deck else None
            if got:
                expert_agents[d], found[d] = got
        log(f"Ligue des spécialistes : {len(found)} IA spécialisée(s) adverse(s)"
            + (f" ({', '.join(f'{d} u{u}' for d, u in found.items())})" if found else " ; le modèle général joue à leur place"))

    refresh_experts()

    # anciennes versions chargées : toute la ligue peut jouer en même temps (tirage PFSP), le cache la contient entière
    loaded: OrderedDict[str, Agent] = OrderedDict()
    cache_size = league.max_snapshots + len(levels) + 8

    def load_snapshot(sid: str) -> Agent:
        if sid == sp.BASE_ID and base_agent is not None:
            return base_agent
        if sid.startswith("expert:") and base_agent is not None:
            return expert_agents.get(sid.split(":", 1)[1], base_agent)   # IA retirée depuis : le modèle général
        if sid in loaded:
            loaded.move_to_end(sid)
            return loaded[sid]
        snap = league.find(sid)
        if snap is None:
            raise KeyError(f"ancienne version inconnue : {sid}")
        data = torch.load(snap.path, map_location="cpu", weights_only=False)
        weights, model_cfg, _ = migrate.adapt(data["model_state"], data["model_config"], data.get("spec_hash"), spec,
                                              f"L'ancienne version {sid}")
        m = build_model(spec, vocab, model_cfg)
        m.load_state_dict(weights)
        loaded[sid] = Agent(m, vocab, spec, device, sid)
        while len(loaded) > cache_size:
            loaded.popitem(last=False)
        return loaded[sid]

    def add_snapshot() -> Snapshot:
        # les versions de départ des niveaux servent aux évaluations : jamais retirées de la ligue
        snap = league.add(model, state["update"], snapshot_extra(), keep=set(state["level_start"].values()))
        for sid in league.purge(collector.snapshots_in_play()):
            loaded.pop(sid, None)
        return snap

    model_config = model.cfg.to_dict()
    collector = Collector(pool, train_envs, agent, league, seeds, rng, cfg["env"], load_snapshot, deck=deck)

    def snapshot_extra():
        return {"model_config": model_config, "vocab": vocab, "spec_hash": spec.spec_hash}

    def save(reason: str) -> Path:
        state["seed_counter"] = seeds.counter
        payload = {
            "model_state": model.state_dict(), "optimizer_state": optimizer.state_dict(), "model_config": model_config,
            "vocab": vocab, "spec_hash": spec.spec_hash, "engine": spec.engine, "synthetic": spec.synthetic,
            "state": state, "league": league.state(), "rng": ck.rng_states(rng), "config": cfg, "reason": reason,
            "scaler": scaler.state_dict() if scaler else None,
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        path = ck.save_with_latest(run_dir, state["update"], payload, cfg["train"]["keep_checkpoints"], warn=log)
        (run_dir / "config.yaml").write_text(dump(cfg), encoding="utf-8")
        return path

    def ensure_level_start():
        if deck:                  # IA spécialisée : pas de niveaux, sa référence est le modèle général
            return
        key = str(state["level"])
        sid = state["level_start"].get(key)
        if sid and league.find(sid) is None:
            log(f"Version de départ du niveau introuvable ({sid}) : la version actuelle la remplace")
            sid = None
        if not sid:
            # enregistrée seulement une fois le fichier écrit
            state["level_start"][key] = f"u{state['update']:06d}"
            try:
                add_snapshot()
            except BaseException:
                state["level_start"].pop(key, None)
                raise

    def gate_eval(level: dict) -> bool:
        if deck and state["update"] > 0:
            refresh_experts()
        decks = list(spec.decks) if level.get("decks", "all") == "all" else list(level["decks"])
        # IA spécialisée : son deck contre chacun des decks
        pairs = [(deck, b) for b in decks] if deck else [(a, b) for a in decks for b in decks]
        t0 = time.perf_counter()
        agents = {"learner": agent}
        passed = True
        lines = []
        for item in level.get("gate", []):
            opp = item["opponent"]
            opponents: list[str] = []
            as_experts = False
            if opp == "level_start":
                sid = state["level_start"].get(str(state["level"]))
                if not sid:
                    continue
                agents[sid] = load_snapshot(sid)
                opponents = [f"model:{sid}"]
            elif opp == "latest_snapshots":
                # sans la copie prise à cette mise à jour même (ce serait le modèle contre lui-même), ni une version déjà
                # évaluée ci-dessus (version de départ du niveau)
                past = [s for s in league.snapshots if s.update < state["update"] and s.id not in agents]
                for snap in past[-int(item.get("count", 3)):]:
                    agents[snap.id] = load_snapshot(snap.id)
                    opponents.append(f"model:{snap.id}")
            elif opp == "base":
                if base_agent is None:
                    continue
                agents[sp.BASE_ID] = base_agent
                opponents = [f"model:{sp.BASE_ID}"]
            elif opp == "experts":
                if base_agent is None:
                    continue
                opponents = [f"model:{sp.BASE_ID}"]   # deck par deck ci-dessous
                as_experts = True
            else:
                opponents = [opp]
            if not opponents:
                continue
            sub = pairs
            if item.get("pairs") and item["pairs"] < len(pairs):
                order = np.random.default_rng(12345).permutation(len(pairs))[: item["pairs"]]
                sub = [pairs[i] for i in sorted(order)]
            games = plan_games(opponents, sub, int(level.get("gate_seeds_per_pair", 1)), int(cfg["evaluation"]["seed_offset"]))
            if as_experts:        # chaque deck adverse joué par son IA spécialisée (le modèle général s'il n'en a pas)
                for g in games:
                    key = f"expert:{g.decks[1]}" if g.decks[1] in expert_agents else sp.BASE_ID
                    g.opp_agent, g.opponent = key, "experts"
                    agents[key] = load_snapshot(key)
            outcomes = run_games(pool, eval_envs, agents, "learner", games, greedy=bool(cfg["evaluation"]["greedy"]),
                                 seed=cfg["seed"] + 1000, max_decisions=int(cfg["env"]["max_decisions"]))
            report = summarize(outcomes)
            if not report:                # aucune partie jouée : rien ne prouve le niveau
                passed = False
                lines.append(f"{', '.join(opponents)} : aucune partie jouée")
                continue
            for name, e in report.items():
                ok = e["winrate"] >= item.get("min_winrate", 0.0)
                passed = passed and ok
                lines.append(f"{name} {100 * e['winrate']:.1f} % [{100 * e['ci95'][0]:.0f}–{100 * e['ci95'][1]:.0f}] "
                             f"sur {e['games']} parties (seuil {100 * item.get('min_winrate', 0):.0f} % {'OK' if ok else 'non atteint'})")
                logger.log(state["update"], "eval", {f"{name}/winrate": e["winrate"], f"{name}/ci_low": e["ci95"][0],
                                                     f"{name}/turns": e["mean_turns"]})
                state["elo_results"].extend((f"u{state['update']:06d}", name, o["score"]) for o in outcomes if o["opponent"] == name)
            out = log_dir / "eval"
            out.mkdir(parents=True, exist_ok=True)
            label = "experts" if as_experts else opponents[0].replace(':', '-').replace('/', '-')
            (out / f"u{state['update']:06d}_{label}.md").write_text(
                to_markdown(report, f"Évaluation, mise à jour {state['update']}, niveau {level['name']}"), encoding="utf-8")
        state["elo_results"] = state["elo_results"][-20000:]
        try:
            elo = fit_elo(state["elo_results"])
            me = elo.get(f"u{state['update']:06d}")
            if me is not None:
                logger.log(state["update"], "eval", {"elo": me})
                lines.append(f"Elo {me:.0f} ({anchor_label(elo)})")
        except Exception:
            pass
        state["gate_history"].append({"update": state["update"], "level": level["name"], "passed": passed, "results": lines})
        log(f"  Évaluation ({time.perf_counter() - t0:.0f} s) — " + " ; ".join(lines))
        return passed

    stop = {"flag": False}

    def on_signal(signum, frame):
        if stop["flag"]:
            raise KeyboardInterrupt
        stop["flag"] = True
        log("Arrêt demandé : fin de la mise à jour en cours, puis point de sauvegarde (Ctrl+C encore pour quitter tout de suite).")

    signal.signal(signal.SIGINT, on_signal)
    warned = {"gpu": False}
    started = time.time() - state["elapsed"]
    exit_code = 0
    snapshot_kinds = ("pool",) if deck else ("self", "pool")
    try:
        if state["update"] >= int(cfg["train"]["max_updates"]):
            log(f"Déjà {state['update']} mises à jour (maximum {cfg['train']['max_updates']}) : rien à faire "
                "(pour continuer : --max-updates avec un nombre plus grand).")
            return 0
        ensure_level_start()
        if deck and state["update"] == 0 and "reference" not in state:
            log("Évaluation de départ : le modèle général avec ce deck (référence de la spécialisation)")
            gate_eval(levels[state["level"]])
            state["reference"] = state["gate_history"][-1]["results"]
        while True:
            level = levels[state["level"]]
            collector.level = level
            collector.version = state["update"]
            if deck:              # IA spécialisées adverses de cette mise à jour (parmi les decks adverses du niveau)
                allowed = level.get("decks", "all")
                cand = [d for d in expert_agents if allowed == "all" or d in allowed]
                k = min(experts_per_update, len(cand))
                collector.experts = sorted(rng.choice(cand, size=k, replace=False).tolist()) if k else []
            t0 = time.perf_counter()
            trajs = collector.collect(int(cfg["ppo"]["steps_per_update"]))
            t_collect = time.perf_counter() - t0
            learn = ppo_update(agent, optimizer, trajs, cfg["ppo"], rng, state["update"], scaler)
            state["update"] += 1
            state["level_updates"] += 1
            roll = collector.stats.summary()
            collector.stats.reset()
            state["games"] += roll["games"]
            state["decisions"] += learn["samples"]
            state["elapsed"] = time.time() - started
            timing = collector.timing
            dps = timing["decisions"] / max(1e-9, t_collect)
            perf = {"collect_s": t_collect, "decisions_per_s": dps, "games_per_s": roll["games"] / max(1e-9, t_collect + learn["learn_s"]),
                    "env_share": timing["env_s"] / max(1e-9, t_collect), "infer_share": timing["infer_s"] / max(1e-9, t_collect),
                    **memory_stats(device)}
            collector.timing = {"env_s": 0.0, "infer_s": 0.0, "decisions": 0}
            logger.log(state["update"], "train", {**roll, **learn, **perf, "level": state["level"] + 1,
                                                   "total_games": state["games"], "lr": cfg["ppo"]["lr"]})
            per_opp = ", ".join(f"{k.split('/')[1]} {100 * v:.0f} %" for k, v in roll.items() if k.startswith("winrate/"))
            log(f"[{state['update']:5d} | {level['name']}] parties {state['games']} (+{roll['games']}) | victoires {per_opp or '—'} "
                f"| tours {roll['mean_turns']:.1f} | tronquées {100 * roll['truncated_rate']:.1f} % | entropie {learn.get('entropy', 0):.2f} "
                f"| valeur {learn['value_mean']:+.2f} (var. expl. {learn['explained_variance']:.2f}) | π {learn.get('policy_loss', 0):+.3f} "
                f"v {learn.get('value_loss', 0):.3f} kl {learn.get('approx_kl', 0):.4f} | {dps:.0f} décisions/s, "
                f"{perf['games_per_s']:.1f} parties/s (Node {100 * perf['env_share']:.0f} %, réseau {100 * perf['infer_share']:.0f} %, "
                f"apprentissage {learn['learn_s']:.1f} s)"
                + (f" | GPU {perf['gpu_mem_reserved_peak_gb']:.1f}/{perf['gpu_mem_total_gb']:.1f} Gio" if "gpu_mem_total_gb" in perf else ""))
            if perf.get("gpu_mem_reserved_peak_gb", 0) > 0.9 * perf.get("gpu_mem_total_gb", float("inf")) and not warned["gpu"]:
                warned["gpu"] = True
                log(f"  ATTENTION : mémoire du GPU presque pleine ({perf['gpu_mem_reserved_peak_gb']:.1f} Gio sur "
                    f"{perf['gpu_mem_total_gb']:.1f}). Sous Windows, le pilote NVIDIA déborde alors sur la mémoire de "
                    "l'ordinateur et l'apprentissage devient très lent et irrégulier. Réduis ppo.microbatch_size "
                    "(ex. --set ppo.microbatch_size=256) : même apprentissage, moins de mémoire.")
            if roll.get("error_rate", 0) > 0:
                log(f"  ATTENTION : {roll['error_rate'] * 100:.2f} % de parties arrêtées par une erreur du moteur (voir {log_dir / 'anomalies'})")

            if state["update"] % int(cfg["train"]["snapshot_every"]) == 0 and any(o["kind"] in snapshot_kinds for o in level["opponents"]):
                add_snapshot()
            if state["update"] % int(level.get("eval_every", 25)) == 0:
                passed = gate_eval(level)
                is_last = state["level"] == len(levels) - 1
                state["streak"] = state["streak"] + 1 if passed else 0
                if passed and not is_last and state["streak"] >= int(level.get("consecutive", 1)):
                    ck.save(run_dir / f"niveau-{level['name']}-valide.pt", {"model_state": model.state_dict(), **snapshot_extra(),
                                                                            "state": dict(state), "config": cfg})
                    state["level"] += 1
                    state["level_updates"] = 0
                    state["streak"] = 0
                    state.pop("forced_level", None)
                    log(f"*** Niveau {level['name']} validé : passage au niveau {levels[state['level']]['name']} ***")
                    ensure_level_start()
                    save("niveau validé")
            if state["update"] % int(cfg["train"]["checkpoint_every"]) == 0:
                save("régulier")
            lv_max = int(level.get("max_updates", 0) or 0)
            if lv_max and state["level_updates"] >= lv_max and levels[state["level"]] is level:
                save("niveau non validé")
                log(f"Niveau {level['name']} NON validé après {lv_max} mises à jour : l'entraînement s'arrête sans passer au "
                    f"niveau suivant. Voir les évaluations dans {log_dir / 'eval'} et README.md (§ Niveau non validé).")
                exit_code = EXIT_GATE_FAILED
                break
            if state["update"] >= int(cfg["train"]["max_updates"]):
                save("nombre maximal de mises à jour")
                log(f"Nombre maximal de mises à jour atteint ({cfg['train']['max_updates']}).")
                break
            if cfg["train"].get("max_hours") and state["elapsed"] >= float(cfg["train"]["max_hours"]) * 3600:
                save("durée maximale")
                log("Durée maximale atteinte.")
                break
            if stop["flag"]:
                path = save("arrêt demandé")
                log(f"Point de sauvegarde : {path}. Pour reprendre : {resume_command()}")
                break
    except KeyboardInterrupt:
        try:
            path = save("interruption")
            log(f"Interrompu. Point de sauvegarde : {path}. Pour reprendre : {resume_command()}")
        except Exception as err:
            log(f"Interrompu ; point de sauvegarde impossible : {err}")
        exit_code = 130
    except Exception as err:
        log(f"ERREUR : {err}")
        try:
            path = save("erreur")
            log(f"Point de sauvegarde écrit malgré l'erreur : {path}")
        except Exception:
            pass
        raise
    finally:
        try:
            pool.close()
        except Exception:
            pass
        logger.close()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
