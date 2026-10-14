"""Chaîne complète, en petit : entraînement (2 mises à jour), reprise depuis le point de sauvegarde, évaluation,
export ONNX vérifié (PyTorch, ONNX Runtime et code du navigateur) ; puis une IA spécialisée sur un deck, à partir de
ce modèle. Environ trois minutes."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

import pytest

from conftest import RL_DIR, needs_engine

RUN = "pytest-pipeline"
DECK_RUN = "pytest-deck"


def run(*args: str, ok: bool = True) -> str:
    # encoding : sous Windows, la sortie serait sinon lue dans le jeu de caractères de la console (accents perdus)
    out = subprocess.run([sys.executable, *args], cwd=RL_DIR, capture_output=True, text=True, encoding="utf-8",
                         timeout=900, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if not ok:
        assert out.returncode != 0, f"{args[0]} aurait dû refuser :\n{out.stdout[-3000:]}"
        return out.stdout + out.stderr
    assert out.returncode == 0, f"{args[0]} a échoué :\n{out.stdout[-3000:]}\n{out.stderr[-3000:]}"
    return out.stdout


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for d in ("checkpoints", "logs", "models"):
        for name in (RUN, DECK_RUN):
            shutil.rmtree(RL_DIR / d / name, ignore_errors=True)


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


@needs_engine
def test_specialized_deck_from_the_general_model():
    """IA spécialisée : départ du modèle de test_train_resume_evaluate_export, ne joue que ST-35, évaluation de départ,
    reprise (refusée sans --deck), évaluation de ce deck, export ONNX vérifié en jouant ce deck."""
    if not (RL_DIR / "checkpoints" / RUN / "latest.pt").exists():
        run("train.py", "--config", "smoke", "--run", RUN, "--set", "allow_synthetic=true", "--fresh", "--max-updates", "1")
    common = ["--config", "smoke", "--deck", "ST-35", "--run", DECK_RUN, "--set", "allow_synthetic=true",
              "--set", f"specialize.base={RUN}", "--set", "curriculum.levels.0.decks=[ST-31, ST-35]",
              "--set", "curriculum.levels.0.gate_seeds_per_pair=1", "--set", "curriculum.levels.0.eval_every=2"]
    out = run("train.py", *common, "--fresh", "--max-updates", "2")
    assert "IA spécialisée sur le deck ST-35" in out and "Évaluation de départ" in out and "[    2 |" in out
    assert "base " in out and (RL_DIR / "checkpoints" / DECK_RUN / "base.pt").exists()
    out = run("train.py", *common, "--max-updates", "3")
    assert "Reprise depuis" in out and "[    3 |" in out and "Évaluation de départ" not in out
    out = run("train.py", *common, "--max-updates", "3")
    assert "rien à faire" in out and "[    4 |" not in out
    out = run("train.py", "--config", "smoke", "--run", DECK_RUN, "--set", "allow_synthetic=true", ok=False)
    assert "ajoute --deck ST-35" in out
    out = run("evaluate.py", "--checkpoint", DECK_RUN, "--deck", "ST-35", "--opponents", "heuristic", "--decks", "ST-31,ST-32",
              "--seeds", "1", "--workers", "1", "--envs", "4", "--set", "allow_synthetic=true")
    assert "ST-35" in out and "ST-36" not in out
    out = run("export_onnx.py", "--checkpoint", DECK_RUN, "--samples", "30", "--browser-games", "1")
    assert "Vérification réussie" in out
    info = json.loads((RL_DIR / "models" / DECK_RUN / "model.json").read_text(encoding="utf-8"))
    assert info["deck"] == "ST-35" and len(info["vocab"]) > 90


def test_deck_index_lists_installed_specialized_models(tmp_path, monkeypatch):
    import export_onnx
    monkeypatch.setattr(export_onnx, "WEB_MODEL_DIR", tmp_path)
    for deck, ok in (("ST-35", True), ("ST-31", True), ("ST-34", False)):
        d = tmp_path / "decks" / deck
        d.mkdir(parents=True)
        (d / "model.json").write_text(json.dumps({"name": f"deck-{deck}", "deck": deck, "specHash": "abc",
                                                  "training": {"update": 300}}), encoding="utf-8")
        if ok:
            (d / "model.onnx").write_bytes(b"onnx")
    index = export_onnx.write_deck_index()
    assert list(index) == ["ST-31", "ST-35"], "un modèle sans son fichier ONNX n'est pas proposé"
    saved = json.loads((tmp_path / "decks.json").read_text(encoding="utf-8"))
    assert saved["decks"]["ST-35"] == {"name": "deck-ST-35", "update": 300, "createdAt": None, "specHash": "abc"}
