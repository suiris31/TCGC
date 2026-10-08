"""Points de sauvegarde : tout ce qu'il faut pour reprendre l'entraînement exactement où il s'est arrêté.

Contenu : poids du modèle et sa configuration, vocabulaire de cartes, état de l'optimiseur, nombre de mises à jour,
de parties et de décisions, niveau du programme d'entraînement et historique de ses évaluations, ligue (anciennes
versions), compteur des graines, états des générateurs aléatoires, configuration complète, empreinte de l'encodage,
statistiques. Écriture atomique (fichier temporaire écrit jusqu'au disque, puis renommage) : une coupure pendant
l'écriture ne corrompt pas le dernier point de sauvegarde ; si latest.pt est illisible malgré tout, la reprise
utilise le point de sauvegarde précédent. L'ordre des fichiers vient de leur numéro de mise à jour, jamais de leur
date (une copie sans les dates ou une horloge décalée ne changent rien).
"""
from __future__ import annotations

import os
import random
import re
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
    # les `keep` plus récents (par numéro), jamais celui qui vient d'être écrit
    old = [p for p in numbered(run_dir) if p != path]
    for p in old[keep - 1:] if keep > 0 else []:
        try:
            retry(p.unlink, missing_ok=True)
        except PermissionError as err:
            warn(f"ancien point de sauvegarde non effacé ({err})")
    return path


def load(path: Path, map_location: str | torch.device = "cpu") -> dict:
    return torch.load(path, map_location=map_location, weights_only=False)


def update_of(path: Path) -> int:
    m = re.fullmatch(r"ckpt_(\d+)\.pt", path.name)
    return int(m.group(1)) if m else -1


def numbered(run_dir: Path) -> list[Path]:
    """ckpt_*.pt, du numéro de mise à jour le plus grand au plus petit."""
    return sorted((p for p in run_dir.glob("ckpt_*.pt") if update_of(p) >= 0), key=update_of, reverse=True)


def candidates(run_dir: Path) -> list[Path]:
    """Points de sauvegarde d'un entraînement dans l'ordre de reprise : latest.pt, puis ckpt_*.pt du plus grand
    numéro au plus petit."""
    latest = run_dir / "latest.pt"
    return ([latest] if latest.exists() else []) + numbered(run_dir)


def find_latest(run_dir: Path) -> Path | None:
    found = candidates(run_dir)
    return found[0] if found else None


def load_latest(run_dir: Path, warn: Callable[[str], None] = print) -> tuple[Path, dict] | None:
    """Le plus récent point de sauvegarde lisible (un fichier abîmé par une coupure de courant est sauté). None s'il
    n'y en a aucun ; s'il y en a mais qu'aucun ne se lit, arrêt (ne jamais repartir de zéro par-dessus)."""
    found = candidates(run_dir)
    last_error: Exception | None = None
    tried: dict[Path, dict] = {}
    order = list(found)
    latest = run_dir / "latest.pt"
    if latest in order:
        try:
            tried[latest] = load(latest)
            u = int(tried[latest].get("state", {}).get("update", -1))
            newer = [p for p in numbered(run_dir) if update_of(p) > u]
            if not newer:
                return latest, tried[latest]
            # latest.pt n'a pas pu être remplacé (fichier verrouillé) : le ckpt de numéro supérieur est plus récent
            warn(f"latest.pt (mise à jour {u}) est plus ancien que {newer[0].name} : reprise depuis ce dernier")
            order = newer + [latest] + [p for p in numbered(run_dir) if update_of(p) <= u]
        except Exception as err:
            last_error = err
            warn(f"Point de sauvegarde illisible, ignoré : {latest} ({err})")
            order = [p for p in order if p != latest]
    for path in order:
        if path in tried:
            return path, tried[path]
        try:
            return path, load(path)
        except Exception as err:
            last_error = err
            warn(f"Point de sauvegarde illisible, ignoré : {path} ({err})")
    if found:
        raise SystemExit(
            f"Aucun point de sauvegarde lisible dans {run_dir} ({len(found)} fichiers ; dernière erreur : {last_error}). "
            "Rien n'a été modifié. Vérifie le dossier (copie incomplète, fichiers OneDrive non téléchargés, versions de "
            "PyTorch ou numpy différentes), ou lance un autre entraînement (--run autre_nom, ou --fresh pour mettre "
            "celui-ci de côté).")
    return None


def set_aside_after(run_dir: Path, update: int, stamp: str) -> Path | None:
    """Reprise depuis un point plus ancien que les derniers fichiers de l'entraînement : les points de sauvegarde et
    anciennes versions de la ligue de l'histoire abandonnée sont déplacés (jamais effacés) dans un sous-dossier."""
    later = [p for p in numbered(run_dir) if update_of(p) > update]
    league = run_dir / "league"
    later_league = [p for p in league.glob("u*.pt") if p.stem[1:].isdigit() and int(p.stem[1:]) > update] if league.exists() else []
    if not later and not later_league:
        return None
    aside = run_dir / f"histoire-abandonnee-{stamp}"
    (aside / "league").mkdir(parents=True, exist_ok=True)
    for p in later:
        retry(os.replace, p, aside / p.name)
    for p in later_league:
        retry(os.replace, p, aside / "league" / p.name)
    return aside


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
