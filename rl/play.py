"""Faire jouer le modèle et analyser ses décisions.

    python play.py --checkpoint opcg --opponent heuristic --deck ST-31 --opp-deck ST-35
        une partie : chaque décision du modèle est affichée avec la probabilité de chaque option et sa valeur estimée ;
        la trajectoire est enregistrée (logs/<run>/games/) pour être rejouée
    python play.py --replay logs/opcg/trajectories/xxx.json [--seat 0] [--record partie.json]
        rejoue une trajectoire enregistrée (entraînement, évaluation, anomalie) et la raconte ;
        --record écrit la partie au format de l'interface (Jouer → Mes parties → importer)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.config import load_config  # noqa: E402
from opcg_rl.device import select_device  # noqa: E402
from opcg_rl.envpool import check_node_version  # noqa: E402
from opcg_rl.paths import LOGS_DIR, REPLAY_SCRIPT, REPO_ROOT, catalog_path, node_executable  # noqa: E402
from opcg_rl.runtime import agent_from_checkpoint, open_pool, resolve_checkpoint  # noqa: E402


def narrate(path: Path, seat: int | None, record: str | None, top: int, env: dict) -> None:
    # chemins absolus : Node tourne depuis la racine du dépôt, pas depuis le dossier où la commande a été lancée
    node = node_executable(env.get("node"))
    check_node_version(node)
    cmd = [node, "--no-warnings", str(REPLAY_SCRIPT), str(path.resolve()), "--top", str(top),
           "--catalog", str(catalog_path(env.get("catalog")))]
    if seat is not None:
        cmd += ["--seat", str(seat)]
    if record:
        cmd += ["--record", str(Path(record).resolve())]
    subprocess.run(cmd, cwd=str(REPO_ROOT), check=True)


def main() -> int:
    p = argparse.ArgumentParser(description="Partie du modèle, ou rejeu d'une trajectoire")
    p.add_argument("--checkpoint", help="point de sauvegarde (.pt) ou nom d'entraînement")
    p.add_argument("--replay", help="trajectoire enregistrée (.json) à rejouer et raconter")
    p.add_argument("--opponent", default="heuristic", help="random, heuristic, mc:N, model:chemin.pt")
    p.add_argument("--deck", default="ST-31")
    p.add_argument("--opp-deck", default="ST-35")
    p.add_argument("--seat", type=int, default=0, help="siège du modèle (0 ou 1)")
    p.add_argument("--seed", type=int, default=None, help="graine de la partie (par défaut : au hasard)")
    p.add_argument("--greedy", action="store_true", help="toujours l'option la plus probable")
    p.add_argument("--top", type=int, default=8, help="options affichées par décision")
    p.add_argument("--record", help="écrire aussi la partie au format de l'interface (fichier .json)")
    p.add_argument("--config", action="append", default=[])
    p.add_argument("--set", action="append", default=[])
    args = p.parse_args()
    cfg = load_config(args.config, args.set)
    if args.replay:
        narrate(Path(args.replay), None, args.record, args.top, cfg["env"])
        return 0
    if not args.checkpoint:
        p.error("indique --checkpoint (ou --replay)")
    path = resolve_checkpoint(args.checkpoint)
    out_dir = LOGS_DIR / path.parent.name / "games"
    pool = open_pool(cfg, 1, 1, record_dir=out_dir)
    try:
        device = select_device("auto")
        agent, _ = agent_from_checkpoint(path, pool.spec, device)
        agents = {"model": agent}
        seats = [{"kind": "agent"}, {"kind": "agent"}]
        ctrl = ["model", "model"]
        opp = 1 - args.seat
        if args.opponent.startswith("model:"):
            other, _ = agent_from_checkpoint(resolve_checkpoint(args.opponent.split(":", 1)[1]), pool.spec, device)
            agents["other"] = other
            ctrl[opp] = "other"
        else:
            kind, _, samples = args.opponent.partition(":")
            seats[opp] = {"kind": kind, **({"samples": int(samples)} if samples else {})}
            ctrl[opp] = None
        decks = [args.deck, args.opp_deck] if args.seat == 0 else [args.opp_deck, args.deck]
        seed = args.seed if args.seed is not None else int(time.time()) % (2 ** 30)
        rng = np.random.default_rng(seed)
        results = pool.run(resets=[{"env": 0, "seed": seed, "decks": decks, "first": "random", "seats": seats, "record": True,
                                    "models": [path.name if c == "model" else None for c in ctrl]}])
        while not results[0].done:
            o = results[0].obs[0]
            acts, _, vals, probs = agents[ctrl[o.seat]].act([o], rng, greedy=args.greedy)
            results = pool.run(actions=[{"env": 0, "index": acts[0], "probs": [round(float(x), 4) for x in probs[0]],
                                         "value": round(float(vals[0]), 4)}])
        r = results[0]
    finally:
        pool.close()
    print(f"Partie graine {seed} terminée : {'erreur ' + r.error if r.error else 'tronquée' if r.truncated else f'le joueur {r.winner + 1} gagne'} "
          f"({r.turns} tours, {r.decisions} décisions). Trajectoire : {r.record}\n")
    if r.record:
        narrate(Path(r.record), args.seat, args.record, args.top, cfg["env"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
