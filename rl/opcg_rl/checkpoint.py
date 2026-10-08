"""Points de sauvegarde : tout ce qu'il faut pour reprendre l'entraînement exactement où il s'est arrêté.

Contenu : poids du modèle et sa configuration, vocabulaire de cartes, état de l'optimiseur, nombre de mises à jour,
de parties et de décisions, niveau du programme d'entraînement et historique de ses évaluations, ligue (anciennes
versions), compteur des graines, états des générateurs aléatoires, configuration complète, empreinte de l'encodage,
statistiques. Écriture atomique (fichier temporaire écrit jusqu'au disque, puis renommage) : une coupure pendant
l'écriture ne corrompt pas le dernier point de sauvegarde ; si latest.pt est illisible malgré tout, la reprise
utilise le point de sauvegarde précédent.
"""
from __future__ import annotations

import os
import random
import shutil
import time
from pathlib import Path
from typing import Callable

import numpy as np
import torch


def retry(fn: Callable, *args, attempts: int = 10, delay: float = 0.5, **kw):
    """Windows : un fichier ouvert par un autre programme (évaluation lancée pendant l'entraînement, antivirus,
    OneDrive) ne peut être ni remplacé ni effacé pendant un instant ; on réessaie quelques secondes."""
    for i in range(attempts):
        try:
            return fn(*args, **kw)
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(delay)


def _fsync(path: Path) -> None:
    with open(path, "rb+") as f:
        os.fsync(f.fileno())


def save(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "wb") as f:
        torch.save(state, f)
        f.flush()
        os.fsync(f.fileno())
    retry(os.replace, tmp, path)


def save_with_latest(run_dir: Path, update: int, state: dict, keep: int, warn: Callable[[str], None] = print) -> Path:
    path = run_dir / f"ckpt_{update:07d}.pt"
    save(path, state)
    latest = run_dir / "latest.pt"
    tmp = latest.with_suffix(".pt.tmp")
    shutil.copyfile(path, tmp)
    _fsync(tmp)
    try:
        retry(os.replace, tmp, latest)
    except PermissionError as err:
        # la reprise choisit le fichier le plus récent : elle prendra `path`
        warn(f"latest.pt n'a pas pu être remplacé ({err}) ; {path.name} est à jour")
    # les `keep` derniers écrits (par date, pas par numéro : après une reprise depuis un point plus ancien, les
    # fichiers de numéro plus élevé sont ceux de l'histoire abandonnée)
    old = sorted(run_dir.glob("ckpt_*.pt"), key=lambda p: p.stat().st_mtime)
    for p in old[:-keep] if keep > 0 else []:
        try:
            retry(p.unlink, missing_ok=True)
        except PermissionError as err:
            warn(f"ancien point de sauvegarde non effacé ({err})")
    return path


def load(path: Path, map_location: str | torch.device = "cpu") -> dict:
    return torch.load(path, map_location=map_location, weights_only=False)


def candidates(run_dir: Path) -> list[Path]:
    """Points de sauvegarde d'un entraînement, du plus récent au plus ancien (latest.pt et ckpt_*.pt)."""
    files = [p for p in [run_dir / "latest.pt", *run_dir.glob("ckpt_*.pt")] if p.exists()]
    return sorted(files, key=lambda p: (p.stat().st_mtime, p.name == "latest.pt"), reverse=True)


def find_latest(run_dir: Path) -> Path | None:
    found = candidates(run_dir)
    return found[0] if found else None


def load_latest(run_dir: Path, warn: Callable[[str], None] = print) -> tuple[Path, dict] | None:
    """Le plus récent point de sauvegarde lisible (un fichier abîmé par une coupure de courant est sauté)."""
    for path in candidates(run_dir):
        try:
            return path, load(path)
        except Exception as err:
            warn(f"Point de sauvegarde illisible, ignoré : {path} ({err})")
    return None


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
