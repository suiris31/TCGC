"""Outils communs aux scripts : démarrage des processus Node, chargement d'un modèle depuis un point de sauvegarde."""
from __future__ import annotations

import os
from pathlib import Path

import torch

from .checkpoint import find_latest, load
from .envpool import EnvPool, Spec
from .paths import CHECKPOINTS_DIR
from .policy import Agent, build_model


def resolve_workers(value, reserve_for_torch: bool) -> int:
    cores = os.cpu_count() or 2
    if value in (None, "auto"):
        return max(1, cores - 1) if not reserve_for_torch else max(1, cores // 2)
    return max(1, int(value))


def resolve_checkpoint(text: str | None) -> Path:
    """Chemin d'un fichier .pt, ou nom d'un entraînement (son dernier point de sauvegarde)."""
    if not text:
        raise ValueError("indique un point de sauvegarde (--checkpoint chemin.pt ou nom d'entraînement)")
    path = Path(text)
    if path.is_file():
        return path
    found = find_latest(CHECKPOINTS_DIR / text)
    if found:
        return found
    raise FileNotFoundError(f"point de sauvegarde introuvable : {text}")


def agent_from_checkpoint(path: Path, spec: Spec, device: torch.device, name: str | None = None) -> tuple[Agent, dict]:
    ckpt = load(path, map_location="cpu")
    if ckpt.get("spec_hash") and ckpt["spec_hash"] != spec.spec_hash:
        raise RuntimeError(
            f"{path} a été entraîné avec un autre encodage des observations ({ckpt['spec_hash']}, actuel {spec.spec_hash}) : "
            "le code de game/rl/ a changé depuis. Réentraîne, ou reviens à la version du dépôt de ce modèle.")
    model = build_model(spec, ckpt["vocab"], ckpt["model_config"])
    model.load_state_dict(ckpt["model_state"])
    return Agent(model, ckpt["vocab"], spec, device, name or path.stem), ckpt


def open_pool(cfg: dict, envs: int, workers: int, log_dir: Path | None = None, record_dir: Path | None = None,
              anomaly_dir: Path | None = None) -> EnvPool:
    e = cfg["env"]
    return EnvPool(workers, envs, node=e.get("node"), catalog=e.get("catalog"), record_dir=record_dir,
                   anomaly_dir=anomaly_dir, log_dir=log_dir)
