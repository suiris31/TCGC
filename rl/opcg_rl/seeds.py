"""Graines des parties : celles de l'entraînement et celles de l'évaluation ne se recouvrent jamais.

- entraînement : [0, 2^30), dans un ordre pseudo-aléatoire sans répétition (compteur sauvegardé avec le modèle) ;
- évaluation : [2^30, 2^31), toujours les mêmes graines (comparaisons d'une version à l'autre sur les mêmes parties).
"""
from __future__ import annotations

TRAIN_START = 0
EVAL_START = 2 ** 30
SPAN = 2 ** 30
_MULT = 2654435761 % SPAN | 1   # impair : la suite parcourt tout l'intervalle sans répétition


class TrainSeeds:
    def __init__(self, counter: int = 0, salt: int = 0):
        self.counter = counter
        self.salt = salt % SPAN

    def next(self) -> int:
        seed = TRAIN_START + (self.counter * _MULT + self.salt) % SPAN
        self.counter += 1
        return seed


def eval_seeds(count: int, offset: int = 0) -> list[int]:
    return [EVAL_START + offset + i for i in range(count)]


def is_eval_seed(seed: int) -> bool:
    return EVAL_START <= seed < EVAL_START + SPAN
