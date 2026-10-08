"""Chaîne complète, en petit : entraînement (2 mises à jour), reprise depuis le point de sauvegarde, évaluation,
export ONNX vérifié (PyTorch, ONNX Runtime et code du navigateur). Environ deux minutes."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys

import pytest

from conftest import RL_DIR, needs_engine

RUN = "pytest-pipeline"


def run(*args: str) -> str:
    out = subprocess.run([sys.executable, *args], cwd=RL_DIR, capture_output=True, text=True, timeout=900,
                         env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    assert out.returncode == 0, f"{args[0]} a échoué :\n{out.stdout[-3000:]}\n{out.stderr[-3000:]}"
    return out.stdout


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for d in ("checkpoints", "logs", "models"):
        shutil.rmtree(RL_DIR / d / RUN, ignore_errors=True)


@needs_engine
def test_train_resume_evaluate_export():
    common = ["--config", "smoke", "--run", RUN, "--set", "allow_synthetic=true"]
    out = run("train.py", *common, "--fresh", "--max-updates", "2")
    assert "[    2 |" in out and (RL_DIR / "checkpoints" / RUN / "latest.pt").exists()
    out = run("train.py", *common, "--max-updates", "3")
    assert "Reprise depuis" in out and "mise à jour 2" in out and "[    3 |" in out
    out = run("evaluate.py", "--checkpoint", RUN, "--opponents", "random", "--decks", "ST-31,ST-35", "--seeds", "1",
              "--workers", "1", "--envs", "4", "--set", "allow_synthetic=true")
    assert "Évaluation de" in out and "random" in out
    out = run("export_onnx.py", "--checkpoint", RUN, "--samples", "40", "--browser-games", "1")
    assert "Vérification réussie" in out
    assert (RL_DIR / "models" / RUN / "model.onnx").exists() and (RL_DIR / "models" / RUN / "model.json").exists()
