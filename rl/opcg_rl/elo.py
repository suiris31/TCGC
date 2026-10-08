"""Classement Elo de joueurs (versions du modèle, IA intégrées) à partir de leurs résultats deux à deux.

Modèle de Bradley-Terry ajusté par l'algorithme MM (Hunter, 2004), converti en points Elo (400 · log10). Une demi
victoire (partie tronquée) compte pour moitié. L'échelle est ancrée sur un joueur de référence (heuristique = 1000).
"""
from __future__ import annotations

import math
from collections import defaultdict


def fit_elo(results: list[tuple[str, str, float]], anchor: str | None = "heuristic", anchor_rating: float = 1000.0,
            iterations: int = 500) -> dict[str, float]:
    """results : (joueur A, joueur B, score de A entre 0 et 1) pour chaque partie. Une partie d'un joueur contre
    lui-même est ignorée (elle ne dit rien de sa force)."""
    results = [(a, b, s) for a, b, s in results if a != b]
    players = sorted({p for a, b, _ in results for p in (a, b)})
    wins: dict[str, float] = defaultdict(float)
    games: dict[tuple[str, str], float] = defaultdict(float)
    for a, b, s in results:
        wins[a] += s
        wins[b] += 1 - s
        games[(a, b)] += 1
        games[(b, a)] += 1
    # un peu de partage a priori (une demi-partie nulle contre chaque adversaire RÉELLEMENT rencontré) : pas de note
    # infinie pour qui gagne tout, et un a priori qui ne grossit pas avec le nombre de joueurs classés
    for a, b in [k for k in games if games[k] > 0]:
        wins[a] += 0.25
        games[(a, b)] += 0.5
    gamma = {p: 1.0 for p in players}
    for _ in range(iterations):
        new = {}
        for p in players:
            denom = sum(games[(p, q)] / (gamma[p] + gamma[q]) for q in players if q != p and games[(p, q)])
            new[p] = wins[p] / denom if denom > 0 else gamma[p]
        norm = math.exp(sum(math.log(v) for v in new.values()) / len(new))
        gamma = {p: v / norm for p, v in new.items()}
    elo = {p: 400 * math.log10(g) for p, g in gamma.items()}
    # ancrage : l'heuristique à 1000 ; sans elle, l'IA aléatoire à 0 ; sinon la moyenne à 1000
    if anchor in elo:
        shift = anchor_rating - elo[anchor]
    elif "random" in elo:
        shift = -elo["random"]
    else:
        shift = 1000.0 - sum(elo.values()) / max(1, len(elo))
    return {p: round(v + shift, 1) for p, v in sorted(elo.items(), key=lambda kv: -kv[1])}


def anchor_label(elo: dict[str, float]) -> str:
    return "heuristique = 1000" if "heuristic" in elo else "aléatoire = 0" if "random" in elo else "moyenne = 1000"
