"""Adversaires des parties d'entraînement : IA intégrées (aléatoire, heuristique, Monte-Carlo), le modèle lui-même
(self-play), anciennes versions du modèle (ligue).

Ligue : une copie figée du modèle est ajoutée régulièrement (snapshot). Pour chaque partie contre la ligue, on tire une
ancienne version avec une probabilité qui favorise celles contre lesquelles le modèle gagne le moins souvent
(« prioritized fictitious self-play », poids (1 − taux de victoire)^p) : le modèle ne peut pas oublier comment battre
ses anciennes stratégies, ni se spécialiser contre sa seule version actuelle.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

BUILTIN = ("random", "heuristic", "mc")


@dataclass
class Snapshot:
    id: str
    path: str
    update: int
    games: int = 0
    wins: float = 0.0

    @property
    def winrate(self) -> float:
        # a priori 0,5 tant qu'il y a peu de parties
        return (self.wins + 1.0) / (self.games + 2.0)


@dataclass
class OpponentChoice:
    kind: str                     # random | heuristic | mc | self | pool
    label: str                    # pour les statistiques (« heuristic », « mc4 », « self », « pool:u000120 »)
    samples: int | None = None
    snapshot: Snapshot | None = None


@dataclass
class League:
    dir: Path
    pfsp_power: float = 2.0
    max_snapshots: int = 50
    snapshots: list[Snapshot] = field(default_factory=list)

    def add(self, model: torch.nn.Module, update: int, extra: dict) -> Snapshot:
        self.dir.mkdir(parents=True, exist_ok=True)
        sid = f"u{update:06d}"
        path = self.dir / f"{sid}.pt"
        torch.save({"model_state": model.state_dict(), **extra, "update": update}, path)
        snap = Snapshot(sid, str(path), update)
        self.snapshots = [s for s in self.snapshots if s.id != sid] + [snap]
        # au-delà de la limite, on retire la plus ancienne qui n'est pas la toute première (gardée comme repère)
        while len(self.snapshots) > self.max_snapshots:
            self.snapshots.pop(1)
        return snap

    def sample(self, rng: np.random.Generator) -> Snapshot | None:
        if not self.snapshots:
            return None
        w = np.array([(1.0 - s.winrate) ** self.pfsp_power + 1e-3 for s in self.snapshots])
        return self.snapshots[int(rng.choice(len(w), p=w / w.sum()))]

    def record(self, sid: str, learner_score: float) -> None:
        for s in self.snapshots:
            if s.id == sid:
                s.games += 1
                s.wins += learner_score
                return

    def state(self) -> dict:
        return {"snapshots": [vars(s) for s in self.snapshots], "pfsp_power": self.pfsp_power}

    def load_state(self, st: dict) -> None:
        self.snapshots = [Snapshot(**s) for s in st.get("snapshots", []) if Path(s["path"]).exists()]
        self.pfsp_power = st.get("pfsp_power", self.pfsp_power)


def choose_opponent(level: dict, league: League, rng: np.random.Generator) -> OpponentChoice:
    """Tire l'adversaire d'une partie selon les poids du niveau (ex. [{kind: heuristic, weight: 0.8}, ...])."""
    options = [o for o in level["opponents"] if o.get("weight", 1) > 0]
    if not league.snapshots:
        options = [o for o in options if o["kind"] != "pool"] or [{"kind": "self", "weight": 1}]
    w = np.array([o.get("weight", 1.0) for o in options], dtype=np.float64)
    o = options[int(rng.choice(len(options), p=w / w.sum()))]
    kind = o["kind"]
    if kind == "pool":
        snap = league.sample(rng)
        return OpponentChoice("pool", f"pool:{snap.id}", snapshot=snap)
    if kind == "mc":
        samples = int(o.get("samples", 4))
        return OpponentChoice("mc", f"mc{samples}", samples=samples)
    if kind in ("random", "heuristic", "self"):
        return OpponentChoice(kind, kind)
    raise ValueError(f"type d'adversaire inconnu : {kind}")
