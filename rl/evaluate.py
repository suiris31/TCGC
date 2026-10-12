"""Évaluation d'un modèle entraîné, séparée de l'entraînement (graines d'évaluation, aucune donnée apprise).

    python evaluate.py --checkpoint opcg                          # dernier point de sauvegarde de l'entraînement « opcg »
    python evaluate.py --checkpoint opcg --opponents random heuristic mc:16
    python evaluate.py --checkpoint checkpoints/opcg/ckpt_0000500.pt --decks ST-31,ST-35 --seeds 10
    python evaluate.py --compare checkpoints/opcg/ckpt_0000200.pt checkpoints/opcg/latest.pt   # versions + Elo

Chaque graine est jouée deux fois (le modèle à chaque siège), sur toutes les confrontations de decks choisies. Le
rapport (taux de victoire avec intervalle de confiance, par deck, par confrontation, premier/second joueur, durée des
parties) est affiché et enregistré dans logs/<run>/eval/.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.config import load_config  # noqa: E402
from opcg_rl.device import describe, select_device  # noqa: E402
from opcg_rl.elo import anchor_label, fit_elo  # noqa: E402
from opcg_rl.evaluation import plan_games, run_games, spread_pairs, summarize, to_markdown  # noqa: E402
from opcg_rl.paths import LOGS_DIR  # noqa: E402
from opcg_rl.runtime import agent_from_checkpoint, open_pool, resolve_checkpoint, resolve_workers  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Évaluation d'un modèle entraîné")
    p.add_argument("--checkpoint", help="point de sauvegarde (.pt) ou nom d'entraînement")
    p.add_argument("--compare", nargs="+", help="plusieurs points de sauvegarde : chacun contre chacun + IA intégrées, Elo")
    p.add_argument("--opponents", nargs="+", default=["random", "heuristic", "mc:16"],
                   help="random, heuristic, heuristic:0.25 (1 décision sur 4 au hasard), mc:N (Monte-Carlo, N tirages ; "
                        "16 = niveau Confirmé), model:<chemin.pt ou nom d'entraînement>")
    p.add_argument("--decks", default="all", help="all, ou liste séparée par des virgules (ex. ST-31,ST-35)")
    p.add_argument("--seeds", type=int, default=2, help="graines par confrontation de decks (×2 sièges)")
    p.add_argument("--mc-pairs", type=int, default=12,
                   help="confrontations jouées contre le Monte-Carlo (lent), réparties sur tous les decks des deux côtés")
    p.add_argument("--greedy", action="store_true", help="le modèle prend toujours l'option la plus probable")
    p.add_argument("--no-card-ids", action="store_true",
                   help="toutes les cartes traitées comme inconnues (seules leurs caractéristiques) : mesure de la "
                        "généralisation à des cartes jamais vues")
    p.add_argument("--record", type=int, default=0, help="enregistrer les N premières parties (trajectoires rejouables)")
    p.add_argument("--workers", default="auto")
    p.add_argument("--envs", type=int, default=8, help="parties simultanées par processus Node")
    p.add_argument("--device", default="auto")
    p.add_argument("--seed-offset", type=int, default=0)
    p.add_argument("--config", action="append", default=[])
    p.add_argument("--set", action="append", default=[])
    p.add_argument("--out", help="dossier du rapport (défaut : logs/<run>/eval)")
    args = p.parse_args()
    if not args.checkpoint and not args.compare:
        p.error("indique --checkpoint ou --compare")
    cfg = load_config(args.config, args.set)
    device = select_device(args.device)
    workers = resolve_workers(args.workers, reserve_for_torch=device.type == "cpu")
    print(f"Matériel : {describe(device)} ; {workers} processus Node × {args.envs} parties")
    paths = [resolve_checkpoint(c) for c in (args.compare or [args.checkpoint])]
    run = paths[0].parent.name
    out_dir = (Path(args.out) if args.out else LOGS_DIR / run / "eval").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    pool = open_pool(cfg, args.envs, workers, record_dir=out_dir / "trajectories", anomaly_dir=out_dir / "anomalies")
    spec = pool.spec
    if spec.synthetic:
        print("ATTENTION : catalogue synthétique (cartes inventées) — résultats sans valeur pour le vrai jeu")
    agents = {}
    for path in paths:
        agent, ckpt = agent_from_checkpoint(path, spec, device)
        key = f"{path.parent.name}/{path.stem}"
        if args.no_card_ids:
            agent.forget_card_ids()
            key += "-sans-id"
        agents[key] = agent
        print(f"Modèle {key} : mise à jour {ckpt.get('state', {}).get('update', '?')}, {ckpt.get('state', {}).get('games', '?')} parties d'entraînement")
    # adversaires « model:<chemin ou entraînement> » : chargés à part (ils jouent, ils ne sont pas évalués)
    opponent_agents = {}
    for opp in args.opponents:
        if opp.startswith("model:"):
            ref = opp.split(":", 1)[1]
            path = resolve_checkpoint(ref)
            opponent_agents[ref], ock = agent_from_checkpoint(path, spec, device, name=ref)
            print(f"Adversaire {ref} : {path}, mise à jour {ock.get('state', {}).get('update', '?')}")
    decks = list(spec.decks) if args.decks == "all" else args.decks.split(",")
    pairs = [(a, b) for a in decks for b in decks]
    t0 = time.perf_counter()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    reports = {}
    elo_rows = []
    try:
        for key, agent in agents.items():
            opponents = list(args.opponents)
            for other_key, other in agents.items():
                if other_key != key:
                    opponents.append(f"model:{other_key}")
            all_outcomes = []
            for opp in opponents:
                sub = pairs
                if opp.startswith("mc") and args.mc_pairs and args.mc_pairs < len(pairs):
                    # sous-ensemble équilibré : chaque deck joue et est affronté autant de fois
                    sub = spread_pairs(decks, args.mc_pairs)
                games = plan_games([opp], sub, args.seeds, args.seed_offset)
                print(f"{key} contre {opp} : {len(games)} parties...", flush=True)
                outcomes = run_games(pool, list(range(pool.size)), {**opponent_agents, **agents}, key, games, greedy=args.greedy, seed=12345,
                                     max_decisions=int(cfg["env"]["max_decisions"]), record=args.record)
                all_outcomes += outcomes
                elo_rows += [(key, o["opponent"], o["score"]) for o in outcomes]
            report = summarize(all_outcomes)
            reports[key] = report
            md = to_markdown(report, f"Évaluation de {key} ({'meilleur choix' if args.greedy else 'politique stochastique'})")
            print(md)
            safe = key.replace("/", "_")
            (out_dir / f"{stamp}_{safe}.md").write_text(md, encoding="utf-8")
            (out_dir / f"{stamp}_{safe}.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
        if len(agents) > 1 or len(args.opponents) > 1:
            elo = fit_elo(elo_rows)
            lines = [f"# Classement Elo ({anchor_label(elo)})", "", "| Joueur | Elo |", "|---|---|"] + [f"| {k} | {v:.0f} |" for k, v in elo.items()]
            print("\n".join(lines))
            (out_dir / f"{stamp}_elo.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    finally:
        pool.close()
    print(f"Terminé en {time.perf_counter() - t0:.0f} s. Rapports : {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
