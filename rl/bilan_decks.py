"""Bilan de toutes les IA spécialisées : les évaluations faites pendant leur entraînement, un deck par ligne.

    python bilan_decks.py                  # départ, avant-dernière et dernière évaluation de chaque deck
    python bilan_decks.py --all            # toutes les évaluations

Lit logs/deck-<deck>/metrics.jsonl (rien n'est rejoué : ce sont les évaluations faites par train.py, 240 parties par
adversaire) : victoires contre chaque adversaire, et choix inutiles par partie (mesurés depuis le 15 octobre 2026).
Utilisable pendant l'entraînement. Repère : sur 240 parties, un écart de moins de ~8 points entre deux
évaluations peut venir du hasard ; « experts » (contre les autres IA spécialisées) baisse quand elles progressent.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.paths import LOGS_DIR  # noqa: E402

OPPONENTS = (("heuristic", "Heuristique"), ("base", "Modèle général"), ("experts", "Autres IA"))


def evaluations(path: Path) -> dict[int, dict]:
    """Évaluations par mise à jour ; après une reprise, une évaluation refaite remplace la précédente."""
    out: dict[int, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line.replace("NaN", "null"))
        except json.JSONDecodeError:
            continue                          # ligne en cours d'écriture
        if row.get("kind") == "eval":
            out.setdefault(row["update"], {}).update(row)
    return out


def pct(v: float) -> str:
    return f"{100 * v:4.0f}"


def flaws(v: float) -> str:
    return f"{v:4.2f}"


def table(rows: dict[str, dict[int, dict]], key: str, fmt, gain_fmt, show_all: bool) -> None:
    for deck, ev in rows.items():
        # évaluations où cette mesure existe (« Autres IA » : depuis la ligue des spécialistes ; choix inutiles : depuis
        # leur ajout)
        us = sorted(u for u in ev if ev[u].get(key) is not None)
        shown = us if show_all else sorted({us[0], *us[-2:]}) if us else []
        cells = "  ".join(f"u{u}:{fmt(ev[u][key])}" for u in shown)
        gain = f"   ({gain_fmt(ev[us[-1]][key] - ev[us[0]][key])} depuis u{us[0]})" if len(us) >= 2 else ""
        print(f"{deck:<20} {cells or '   -'}{gain}")


def main() -> int:
    p = argparse.ArgumentParser(description="Bilan de toutes les IA spécialisées")
    p.add_argument("--all", action="store_true", help="toutes les évaluations, pas seulement départ, avant-dernière, dernière")
    args = p.parse_args()
    runs = sorted(d for d in LOGS_DIR.glob("deck-*") if (d / "metrics.jsonl").exists())
    if not runs:
        print(f"Aucune IA spécialisée dans {LOGS_DIR}")
        return 1
    rows = {d.name[5:]: evaluations(d / "metrics.jsonl") for d in runs}
    for opp, title in OPPONENTS:
        print(f"\n--- Contre : {title} (% de victoires) ---")
        table(rows, f"{opp}/winrate", pct, lambda d: f"{100 * d:+.0f}", args.all)
    print("\n--- Choix inutiles par partie, contre l'heuristique (game/ai/prune.ts : attaques vouées à l'échec, Contres et "
          "Bloqueurs sur une attaque déjà repoussée, DON!! et effets qui ne servent à rien) ---")
    table(rows, "heuristic/flaws", flaws, lambda d: f"{d:+.2f}", args.all)
    print("\nRepère : sur 240 parties, moins de ~8 points d'écart entre deux évaluations peut venir du hasard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
