"""Adversaires des parties d'entraînement : IA intégrées (aléatoire, heuristique, Monte-Carlo), le modèle lui-même
(self-play), anciennes versions du modèle (ligue).

Ligue : une copie figée du modèle est ajoutée régulièrement (snapshot). Pour chaque partie contre la ligue, on tire une
ancienne version avec une probabilité qui favorise celles contre lesquelles le modèle gagne le moins souvent
(« prioritized fictitious self-play », poids (1 − taux de victoire)^p) : le modèle ne peut pas oublier comment battre
ses anciennes stratégies, ni se spécialiser contre sa seule version actuelle.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

BUILTIN = ("random", "heuristic", "mc")


@dataclass
class Snapshot:
    id: str
    path: str                     # toujours <dossier de la ligue>/<id>.pt (recalculé à la reprise, voir League)
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
    label: str                    # pour les statistiques (« heuristic », « heuristic50 », « mc4 », « self », « pool:u000120 »)
    samples: int | None = None
    noise: float | None = None    # heuristic : probabilité de jouer une décision au hasard
    snapshot: Snapshot | None = None


@dataclass
class League:
    dir: Path
    pfsp_power: float = 2.0
    max_snapshots: int = 50
    snapshots: list[Snapshot] = field(default_factory=list)
    retired: list[Snapshot] = field(default_factory=list)    # retirées de la ligue, fichier encore sur le disque

    def _path(self, sid: str) -> Path:
        return self.dir / f"{sid}.pt"

    def add(self, model: torch.nn.Module, update: int, extra: dict, keep: set[str] = frozenset()) -> Snapshot:
        """Ajoute une copie figée du modèle. Au-delà de max_snapshots, retire la plus ancienne, sauf la toute première
        (repère), la nouvelle et celles de `keep` (versions de départ des niveaux, adversaires des évaluations)."""
        self.dir.mkdir(parents=True, exist_ok=True)
        sid = f"u{update:06d}"
        path = self._path(sid)
        tmp = path.with_suffix(".pt.tmp")
        torch.save({"model_state": model.state_dict(), **extra, "update": update}, tmp)
        os.replace(tmp, path)            # écriture atomique : jamais de fichier à moitié écrit
        snap = Snapshot(sid, str(path), update)
        self.snapshots = [s for s in self.snapshots if s.id != sid] + [snap]
        self.retired = [s for s in self.retired if s.id != sid]
        while len(self.snapshots) > self.max_snapshots:
            i = next((i for i in range(1, len(self.snapshots) - 1) if self.snapshots[i].id not in keep), None)
            if i is None:
                break
            self.retired.append(self.snapshots.pop(i))
        return snap

    def find(self, sid: str) -> Snapshot | None:
        """Version de la ligue, ou retirée mais pas encore effacée, ou seulement présente sur le disque."""
        snap = next((s for s in self.snapshots + self.retired if s.id == sid), None)
        if snap is None and self._path(sid).exists():
            snap = Snapshot(sid, str(self._path(sid)), int(sid[1:]) if sid[1:].isdigit() else 0)
        return snap

    def purge(self, in_use: set[str]) -> list[str]:
        """Efface les fichiers des versions retirées qu'aucune partie en cours n'utilise plus (sinon la ligue
        grossirait sans fin sur le disque). Renvoie leurs identifiants. N'efface que dans le dossier de la ligue."""
        gone = [s for s in self.retired if s.id not in in_use]
        self.retired = [s for s in self.retired if s.id in in_use]
        for s in gone:
            try:
                self._path(s.id).unlink(missing_ok=True)
            except PermissionError:       # Windows : fichier ouvert ailleurs ; il sera repris à la reprise suivante
                pass
        return [s.id for s in gone]

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
        # identifiants seulement, pas de chemins : le dossier peut être déplacé ou copié sur un autre ordinateur ;
        # pfsp_power n'est pas sauvegardé : il vient toujours de la configuration (modifiable à la reprise)
        strip = lambda s: {k: v for k, v in vars(s).items() if k != "path"}  # noqa: E731
        return {"snapshots": [strip(s) for s in self.snapshots], "retired": [strip(s) for s in self.retired]}

    def load_state(self, st: dict, keep: set[str] = frozenset(), warn=print) -> None:
        """Reprise : chaque version est cherchée dans le dossier de la ligue de CET entraînement. Les fichiers de ce
        dossier que plus rien n'utilise (versions retirées, histoire abandonnée après une reprise depuis un point plus
        ancien) sont marqués à effacer, sauf ceux de `keep` (versions de départ des niveaux)."""
        def build(rows):
            out = []
            for row in rows:
                row = {k: v for k, v in row.items() if k != "path"}
                if self._path(row["id"]).exists():
                    out.append(Snapshot(path=str(self._path(row["id"])), **row))
            return out

        rows = st.get("snapshots", [])
        self.snapshots = build(rows)
        if len(self.snapshots) < len(rows):
            warn(f"Ligue : {len(rows) - len(self.snapshots)} ancienne(s) version(s) introuvable(s) dans {self.dir}, ignorée(s)")
        self.retired = build(st.get("retired", []))
        known = {s.id for s in self.snapshots + self.retired} | set(keep)
        if self.dir.exists():
            for f in sorted(self.dir.glob("u*.pt")):
                if f.stem not in known:
                    self.retired.append(Snapshot(f.stem, str(f), int(f.stem[1:]) if f.stem[1:].isdigit() else 0))


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
    if kind == "heuristic" and float(o.get("noise", 0) or 0) > 0:
        noise = float(o["noise"])
        return OpponentChoice("heuristic", f"heuristic{round(100 * noise)}", noise=noise)
    if kind in ("random", "heuristic", "self"):
        return OpponentChoice(kind, kind)
    raise ValueError(f"type d'adversaire inconnu : {kind}")
