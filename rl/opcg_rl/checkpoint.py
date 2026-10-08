"""Points de sauvegarde : tout ce qu'il faut pour reprendre l'entraînement exactement où il s'est arrêté.

Contenu : poids du modèle et sa configuration, vocabulaire de cartes, état de l'optimiseur, nombre de mises à jour,
de parties et de décisions, niveau du programme d'entraînement et historique de ses évaluations, ligue (anciennes
versions), compteur des graines, états des générateurs aléatoires, configuration complète, empreinte de l'encodage,
statistiques. Écriture atomique (fichier temporaire puis renommage) : une coupure pendant l'écriture ne corrompt pas
le dernier point de sauvegarde.
"""
from __future__ import annotations

import os
import random
import shutil
from pathlib import Path

import numpy as np
import torch


def save(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    torch.save(state, tmp)
    os.replace(tmp, path)


def save_with_latest(run_dir: Path, update: int, state: dict, keep: int) -> Path:
    path = run_dir / f"ckpt_{update:07d}.pt"
    save(path, state)
    latest = run_dir / "latest.pt"
    tmp = latest.with_suffix(".pt.tmp")
    shutil.copyfile(path, tmp)
    os.replace(tmp, latest)
    old = sorted(run_dir.glob("ckpt_*.pt"))
    for p in old[:-keep] if keep > 0 else []:
        p.unlink(missing_ok=True)
    return path


def load(path: Path, map_location: str | torch.device = "cpu") -> dict:
    return torch.load(path, map_location=map_location, weights_only=False)


def find_latest(run_dir: Path) -> Path | None:
    latest = run_dir / "latest.pt"
    if latest.exists():
        return latest
    found = sorted(run_dir.glob("ckpt_*.pt"))
    return found[-1] if found else None


def rng_states(np_rng: np.random.Generator) -> dict:
    return {
        "python": random.getstate(), "numpy": np_rng.bit_generator.state, "torch": torch.get_rng_state(),
        "cuda": torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None,
    }


def restore_rng(states: dict, np_rng: np.random.Generator) -> None:
    random.setstate(states["python"])
    np_rng.bit_generator.state = states["numpy"]
    torch.set_rng_state(states["torch"])
    if states.get("cuda") and torch.cuda.is_available():
        try:
            torch.cuda.set_rng_state_all(states["cuda"])
        except RuntimeError:
            pass
