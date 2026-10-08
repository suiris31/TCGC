"""Tests du paquet opcg_rl. Ceux qui lancent le moteur (processus Node) ont besoin d'un catalogue des cartes :
data/game-catalog.json (« npm run game:cards »), ou celui indiqué par OPCG_CATALOG (le catalogue synthétique de
game/rl/testing/ suffit pour tester la mécanique)."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

import pytest

RL_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RL_DIR))

from opcg_rl.paths import catalog_path  # noqa: E402


def engine_available() -> bool:
    return shutil.which(os.environ.get("OPCG_NODE") or "node") is not None and catalog_path().exists()


needs_engine = pytest.mark.skipif(not engine_available(), reason="Node.js ou catalogue des cartes absent")


@pytest.fixture(scope="session")
def pool():
    from opcg_rl.envpool import EnvPool
    p = EnvPool(workers=2, envs_per_worker=4)
    yield p
    p.close()
