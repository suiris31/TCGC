"""Résumé texte d'un entraînement, à lire ou à copier-coller pour le partager : réglages, évaluations, tendances par
tranches de mises à jour (d'après logs/<run>/metrics.jsonl et logs/<run>/train.log).

    python report.py --run rtx2070-main
    python report.py --run rtx2070-main --window 50 --last 1000 --evals 40
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.paths import LOGS_DIR  # noqa: E402

# colonnes des tendances : (titre, clé dans metrics.jsonl, format)
COLUMNS = [
    ("entropie", "entropy", "{:.2f}"), ("kl", "approx_kl", "{:.3f}"), ("passes", "epochs_done", "{:.1f}"),
    ("clip", "clip_frac", "{:.2f}"), ("var.expl", "explained_variance", "{:.2f}"), ("valeur", "value_mean", "{:+.2f}"),
    ("tours", "mean_turns", "{:.1f}"), ("tronq%", "truncated_rate", "{:.1%}"), ("parties/s", "games_per_s", "{:.1f}"),
    ("appr.s", "learn_s", "{:.1f}"), ("GPU Gio", "gpu_mem_reserved_peak_gb", "{:.1f}"),
]


def read_rows(path: Path) -> tuple[dict[int, dict], dict[int, dict]]:
    """Mesures par mise à jour ; après une reprise, une mise à jour rejouée remplace la précédente."""
    train: dict[int, dict] = {}
    evals: dict[int, dict] = defaultdict(dict)
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue                          # ligne en cours d'écriture
        if row.get("kind") == "train":
            train[row["update"]] = row
        elif row.get("kind") == "eval":
            evals[row["update"]].update(row)
    return train, dict(evals)


def pct(x) -> str:
    return "  -  " if x is None else f"{100 * x:4.0f}%"


def main() -> int:
    p = argparse.ArgumentParser(description="Résumé texte d'un entraînement")
    p.add_argument("--run", default="opcg", help="nom de l'entraînement (dossier logs/<run>)")
    p.add_argument("--window", type=int, default=25, help="mises à jour par ligne de tendance")
    p.add_argument("--last", type=int, default=1000, help="tendances sur les N dernières mises à jour")
    p.add_argument("--evals", type=int, default=30, help="nombre d'évaluations affichées (les plus récentes)")
    args = p.parse_args()
    log_dir = LOGS_DIR / args.run
    metrics = log_dir / "metrics.jsonl"
    if not metrics.exists():
        print(f"Introuvable : {metrics}")
        return 1
    train, evals = read_rows(metrics)
    if not train:
        print("Aucune mise à jour enregistrée.")
        return 1
    updates = sorted(train)
    last = train[updates[-1]]
    hours = (last["time"] - train[updates[0]]["time"]) / 3600

    print(f"=== Entraînement « {args.run} » : mise à jour {updates[-1]}, {last.get('total_games', '?')} parties, "
          f"niveau {last.get('level', '?')}, {hours:.1f} h entre la première et la dernière mesure ===")
    log = log_dir / "train.log"
    if log.exists():
        lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
        keep = ("Matériel", "Parties :", "Moteur", "Modèle :", "Reprise", "ATTENTION", "Niveau forcé")
        header = {}
        for line in lines:
            for k in keep:
                if line.startswith(k) or line.strip().startswith(k):
                    header[k] = line.strip()
        for k in keep:
            if k in header:
                print(header[k])
        for line in lines:
            if "***" in line or "NON validé" in line:
                print(line.strip())

    # évaluations (parties à graines fixes, jamais apprises)
    print(f"\n--- Évaluations ({min(args.evals, len(evals))} dernières sur {len(evals)}) : taux de victoire (borne basse de l'IC 95 %) ---")
    for u in sorted(evals)[-args.evals:]:
        e = evals[u]
        names = sorted({k.split("/")[0] for k in e if k.endswith("/winrate")})
        parts = [f"{n} {100 * e[n + '/winrate']:.1f}% (>={100 * e.get(n + '/ci_low', 0):.0f})" for n in names]
        elo = f" | Elo {e['elo']:.0f}" if "elo" in e else ""
        print(f"u{u:6d} | " + " · ".join(parts) + elo)

    # tendances par tranches
    shown = [u for u in updates if u > updates[-1] - args.last]
    families = sorted({k.split("/", 1)[1] for u in shown for k in train[u] if k.startswith("winrate/")})
    head = ["mises à jour", "niv"] + [f.replace("heuristic", "heur") for f in families] + [c[0] for c in COLUMNS]
    print(f"\n--- Tendances par tranches de {args.window} mises à jour (parties d'entraînement ; moyennes) ---")
    print(" ".join(f"{h:>9}" if i else f"{h:<13}" for i, h in enumerate(head)))
    for start in range(shown[0] - shown[0] % args.window, updates[-1] + 1, args.window):
        chunk = [train[u] for u in shown if start <= u < start + args.window]
        if not chunk:
            continue
        lv = sorted({r.get("level", "?") for r in chunk}, key=str)
        cells = [f"{chunk[0]['update']}-{chunk[-1]['update']}", f"{lv[0]}-{lv[-1]}" if len(lv) > 1 else str(lv[0])]
        for f in families:
            # moyenne pondérée par le nombre de parties contre cet adversaire
            games = sum(r.get(f"games/{f}", 0) for r in chunk)
            wins = sum(r.get(f"winrate/{f}", 0) * r.get(f"games/{f}", 0) for r in chunk)
            cells.append(pct(wins / games) if games else pct(None))
        for _, key, fmt in COLUMNS:
            vals = [r[key] for r in chunk if isinstance(r.get(key), (int, float))]
            cells.append(fmt.format(sum(vals) / len(vals)) if vals else "-")
        print(" ".join(f"{c:>9}" if i else f"{c:<13}" for i, c in enumerate(cells)))
    print("\nniv : niveau du programme ; passes : passes d'apprentissage faites sur 4 (moins : arrêt par le seuil de kl) ; "
          "clip : part des décisions dont le changement de probabilité a été plafonné ; var.expl : qualité de "
          "l'estimation de la valeur (vers 1 = bonne)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
