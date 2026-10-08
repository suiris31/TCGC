"""Emplacements : racine du dépôt (moteur du jeu), dossiers de l'apprentissage."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

RL_DIR = Path(__file__).resolve().parent.parent          # rl/
REPO_ROOT = RL_DIR.parent                                 # racine du dépôt TCGC
SERVER_SCRIPT = REPO_ROOT / "game" / "rl" / "server.ts"
REPLAY_SCRIPT = REPO_ROOT / "game" / "rl" / "replay.ts"
CHECK_ONNX_SCRIPT = REPO_ROOT / "game" / "rl" / "check-onnx.ts"
DEFAULT_CATALOG = REPO_ROOT / "data" / "game-catalog.json"
CONFIG_DIR = RL_DIR / "config"
CHECKPOINTS_DIR = RL_DIR / "checkpoints"
LOGS_DIR = RL_DIR / "logs"
MODELS_DIR = RL_DIR / "models"
# où l'interface du simulateur cherche le modèle entraîné (servi avec l'application)
WEB_MODEL_DIR = REPO_ROOT / "web" / "public" / "rl-model"


def node_executable(configured: str | None = None) -> str:
    """Chemin de Node.js : réglage explicite, variable OPCG_NODE, sinon « node » trouvé dans le PATH."""
    for candidate in (configured, os.environ.get("OPCG_NODE")):
        if candidate:
            return candidate
    found = shutil.which("node")
    if not found:
        raise RuntimeError(
            "Node.js introuvable. Installe Node.js 22.18 ou plus récent (https://nodejs.org) ou indique son chemin "
            "avec la variable OPCG_NODE ou le réglage env.node."
        )
    return found


def catalog_path(configured: str | None = None) -> Path:
    path = Path(configured or os.environ.get("OPCG_CATALOG") or DEFAULT_CATALOG)
    return path if path.is_absolute() else (REPO_ROOT / path)
