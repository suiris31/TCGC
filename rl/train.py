"""Entraînement de l'IA par apprentissage par renforcement (PPO), niveau par niveau.

    python train.py                      # commence, ou reprend l'entraînement « opcg » là où il s'était arrêté
    python train.py --config cpu         # réglages pour un ordinateur sans GPU (config/cpu.yaml)
    python train.py --config smoke       # essai rapide de toute la chaîne
    python train.py --run essai2 --fresh # nouvel entraînement, depuis zéro
    python train.py --set ppo.lr=0.0001 --set env.workers=6

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
from opcg_rl.model import parameter_count  # noqa: E402
from opcg_rl.paths import CHECKPOINTS_DIR, LOGS_DIR  # noqa: E402
from opcg_rl.policy import Agent, build_model, vocab_from_decks  # noqa: E402
from opcg_rl.ppo import Collector, ppo_update  # noqa: E402
from opcg_rl.runtime import open_pool, resolve_workers  # noqa: E402
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
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = load_config(args.config, args.set)
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
    # point de sauvegarde de cet entraînement (sinon : d'un autre dossier, dont la ligue sera copiée ici)
    own = resume_path is not None and run_dir.resolve() in resume_path.resolve().parents
    if ckpt:
        if ckpt.get("spec_hash") != spec.spec_hash:
            raise SystemExit(f"Le point de sauvegarde {resume_path} utilise un autre encodage ({ckpt.get('spec_hash')}) que "
                             f"le code actuel ({spec.spec_hash}). Lance un nouvel entraînement (--fresh ou --run).")
        vocab = ckpt["vocab"]
        model = build_model(spec, vocab, ckpt["model_config"])
        model.load_state_dict(ckpt["model_state"])
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
    log(f"Modèle : {parameter_count(model) / 1e6:.2f} M paramètres, vocabulaire de {len(vocab)} cartes, {json.dumps(model.cfg.to_dict())}")
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg["ppo"]["lr"], eps=1e-5)
    league = League(run_dir / "league", pfsp_power=cfg["train"]["pfsp_power"], max_snapshots=cfg["train"]["max_snapshots"])
    if ckpt:
        if ckpt.get("optimizer_state"):
            optimizer.load_state_dict(ckpt["optimizer_state"])
            for g in optimizer.param_groups:
                g["lr"] = cfg["ppo"]["lr"]
        league.load_state(ckpt.get("league", {}), keep=set(state["level_start"].values()), warn=log,
                          source=None if own else resume_path.parent / "league",
                          cleanup=own and "league" in ckpt)
        if ckpt.get("rng"):
            ck.restore_rng(ckpt["rng"], rng)
    seeds = TrainSeeds(state["seed_counter"], salt=cfg["seed"])

    # anciennes versions chargées : toute la ligue peut jouer en même temps (tirage PFSP), le cache la contient entière
    loaded: OrderedDict[str, Agent] = OrderedDict()
    cache_size = league.max_snapshots + len(levels) + 8

    def load_snapshot(sid: str) -> Agent:
        if sid in loaded:
            loaded.move_to_end(sid)
            return loaded[sid]
        snap = league.find(sid)
        if snap is None:
            raise KeyError(f"ancienne version inconnue : {sid}")
        data = torch.load(snap.path, map_location="cpu", weights_only=False)
        m = build_model(spec, vocab, data["model_config"])
        m.load_state_dict(data["model_state"])
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
    collector = Collector(pool, train_envs, agent, league, seeds, rng, cfg["env"], load_snapshot)

    def snapshot_extra():
        return {"model_config": model_config, "vocab": vocab, "spec_hash": spec.spec_hash}

    def save(reason: str) -> Path:
        state["seed_counter"] = seeds.counter
        payload = {
            "model_state": model.state_dict(), "optimizer_state": optimizer.state_dict(), "model_config": model_config,
            "vocab": vocab, "spec_hash": spec.spec_hash, "engine": spec.engine, "synthetic": spec.synthetic,
            "state": state, "league": league.state(), "rng": ck.rng_states(rng), "config": cfg, "reason": reason,
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        path = ck.save_with_latest(run_dir, state["update"], payload, cfg["train"]["keep_checkpoints"], warn=log)
        (run_dir / "config.yaml").write_text(dump(cfg), encoding="utf-8")
        return path

    def ensure_level_start():
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
        decks = list(spec.decks) if level.get("decks", "all") == "all" else list(level["decks"])
        pairs = [(a, b) for a in decks for b in decks]
        t0 = time.perf_counter()
        agents = {"learner": agent}
        passed = True
        lines = []
        for item in level.get("gate", []):
            opp = item["opponent"]
            opponents: list[str] = []
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
            else:
                opponents = [opp]
            if not opponents:
                continue
            sub = pairs
            if item.get("pairs") and item["pairs"] < len(pairs):
                order = np.random.default_rng(12345).permutation(len(pairs))[: item["pairs"]]
                sub = [pairs[i] for i in sorted(order)]
            games = plan_games(opponents, sub, int(level.get("gate_seeds_per_pair", 1)), int(cfg["evaluation"]["seed_offset"]))
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
            (out / f"u{state['update']:06d}_{opponents[0].replace(':', '-').replace('/', '-')}.md").write_text(
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
    try:
        ensure_level_start()
        while True:
            level = levels[state["level"]]
            collector.level = level
            collector.version = state["update"]
            t0 = time.perf_counter()
            trajs = collector.collect(int(cfg["ppo"]["steps_per_update"]))
            t_collect = time.perf_counter() - t0
            learn = ppo_update(agent, optimizer, trajs, cfg["ppo"], rng, state["update"])
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

            if state["update"] % int(cfg["train"]["snapshot_every"]) == 0 and any(o["kind"] in ("self", "pool") for o in level["opponents"]):
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
