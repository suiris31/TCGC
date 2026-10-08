"""Robustesse : reprise (ligue déplacée, point de sauvegarde abîmé, options à effet unique), réglages, fermeture des
processus Node."""
from __future__ import annotations

import os
import shutil
import sys
import time

import torch

from conftest import needs_engine
from opcg_rl import checkpoint as ck
from opcg_rl.config import load_config
from opcg_rl.league import League


def test_league_survives_a_moved_folder_and_forgets_orphans(tmp_path):
    league = League(tmp_path / "a" / "league", max_snapshots=3)
    model = torch.nn.Linear(2, 2)
    for u in range(0, 50, 10):
        league.add(model, u, {}, keep={"u000010"})
    (tmp_path / "a" / "league" / "u000099.pt").write_bytes(b"histoire abandonnee")
    st = league.state()
    assert all("path" not in row for row in st["snapshots"]), "pas de chemins absolus dans le point de sauvegarde"
    shutil.move(str(tmp_path / "a"), str(tmp_path / "b"))       # dossier déplacé (autre ordinateur, renommage)
    moved = League(tmp_path / "b" / "league", max_snapshots=3)
    moved.load_state(st, keep={"u000010"}, warn=lambda m: None)
    assert [s.id for s in moved.snapshots] == [s.id for s in league.snapshots]
    assert all(str(tmp_path / "b") in s.path for s in moved.snapshots)
    retired = {s.id for s in moved.retired}
    assert "u000099" in retired and "u000010" not in retired, "orphelin à effacer, version de départ gardée"
    moved.purge(in_use=set())
    assert not (tmp_path / "b" / "league" / "u000099.pt").exists()
    assert (tmp_path / "b" / "league" / "u000010.pt").exists()


def test_resume_order_ignores_file_dates(tmp_path):
    for u in (10, 20, 30):
        ck.save_with_latest(tmp_path, u, {"state": {"update": u}}, keep=5, warn=lambda m: None)
    # copie sans les dates (ou horloge décalée) : le plus vieux fichier paraît le plus récent
    future = time.time() + 3600
    os.utime(tmp_path / "ckpt_0000010.pt", (future, future))
    path, data = ck.load_latest(tmp_path, warn=lambda m: None)
    assert path.name == "latest.pt" and data["state"]["update"] == 30
    ck.save_with_latest(tmp_path, 40, {"state": {"update": 40}}, keep=2, warn=lambda m: None)
    assert sorted(p.name for p in tmp_path.glob("ckpt_*.pt")) == ["ckpt_0000030.pt", "ckpt_0000040.pt"]


def test_resume_skips_an_unreadable_or_stale_latest(tmp_path):
    ck.save_with_latest(tmp_path, 10, {"state": {"update": 10}}, keep=5, warn=lambda m: None)
    ck.save_with_latest(tmp_path, 20, {"state": {"update": 20}}, keep=5, warn=lambda m: None)
    (tmp_path / "latest.pt").write_bytes(b"\0" * 64)              # coupure de courant
    warnings = []
    path, data = ck.load_latest(tmp_path, warn=warnings.append)
    assert path.name == "ckpt_0000020.pt" and data["state"]["update"] == 20 and warnings
    ck.save(tmp_path / "latest.pt", {"state": {"update": 10}})    # latest.pt resté verrouillé à la mise à jour 10
    path, data = ck.load_latest(tmp_path, warn=lambda m: None)
    assert path.name == "ckpt_0000020.pt"


def test_a_run_with_only_unreadable_checkpoints_is_never_restarted_over(tmp_path):
    for name in ("latest.pt", "ckpt_0000010.pt"):
        (tmp_path / name).write_bytes(b"illisible")
    try:
        ck.load_latest(tmp_path, warn=lambda m: None)
        raise AssertionError("doit s'arrêter")
    except SystemExit as err:
        assert "Aucun point de sauvegarde lisible" in str(err)
    assert ck.load_latest(tmp_path / "vide", warn=lambda m: None) is None


def test_abandoned_history_is_set_aside_not_deleted(tmp_path):
    for u in (100, 110, 120):
        ck.save_with_latest(tmp_path, u, {"state": {"update": u}}, keep=5, warn=lambda m: None)
    (tmp_path / "league").mkdir()
    for u in (50, 115):
        (tmp_path / "league" / f"u{u:06d}.pt").write_bytes(b"x")
    aside = ck.set_aside_after(tmp_path, 100, "t")                # reprise depuis la mise à jour 100
    assert sorted(p.name for p in aside.glob("ckpt_*.pt")) == ["ckpt_0000110.pt", "ckpt_0000120.pt"]
    assert (aside / "league" / "u000115.pt").exists() and (tmp_path / "league" / "u000050.pt").exists()
    assert [p.name for p in ck.numbered(tmp_path)] == ["ckpt_0000100.pt"]


def test_resume_from_another_run_copies_its_league(tmp_path):
    src = League(tmp_path / "a" / "league", max_snapshots=10)
    model = torch.nn.Linear(2, 2)
    for u in (0, 25, 50):
        src.add(model, u, {})
    st = src.state()
    dst = League(tmp_path / "b" / "league", max_snapshots=10)
    dst.load_state(st, keep={"u000025"}, warn=lambda m: None, source=src.dir, cleanup=False)
    assert [s.id for s in dst.snapshots] == ["u000000", "u000025", "u000050"]
    assert all((tmp_path / "b" / "league" / f"{s.id}.pt").exists() for s in dst.snapshots)
    assert all((tmp_path / "a" / "league" / f"{s.id}.pt").exists() for s in src.snapshots), "source intacte"


def test_config_numbers_and_run_name():
    cfg = load_config([], ["ppo.lr=1e-4", "ppo.target_kl=3e-2", "run=1e3"])
    assert cfg["ppo"]["lr"] == 1e-4 and isinstance(cfg["ppo"]["lr"], float)
    assert cfg["ppo"]["target_kl"] == 0.03 and cfg["run"] == "1e3"
    from opcg_rl.config import _load, dump
    assert _load(dump({"run": "1e3", "x": 1e-4}))["run"] == "1e3", "relu tel quel"


def test_resume_command_drops_one_shot_options(monkeypatch):
    import train
    monkeypatch.setattr(sys, "argv", ["train.py", "--config", "cpu", "--fresh", "--level", "3", "--resume=x.pt",
                                      "--run", "essai 2", "--set", "ppo.lr=0.0001"])
    quoted = '"essai 2"' if sys.platform == "win32" else "'essai 2'"
    assert train.resume_command() == f"python train.py --config cpu --run {quoted} --set ppo.lr=0.0001"


@needs_engine
def test_dead_node_process_is_reported_with_its_log_and_pool_closes_fast(tmp_path):
    from opcg_rl.envpool import EngineServerError, EnvPool
    p = EnvPool(workers=2, envs_per_worker=1, log_dir=tmp_path)
    try:
        p.workers[1].proc.kill()
        p.workers[1].proc.wait()
        try:
            p.run(resets=[{"env": 1, "seed": 1, "decks": ["ST-31", "ST-35"], "first": "random",
                           "seats": [{"kind": "random"}, {"kind": "random"}]}])
            raise AssertionError("un processus Node arrêté doit être signalé")
        except EngineServerError as err:
            assert "node-1.log" in str(err)
    finally:
        t0 = time.perf_counter()
        p.close()
        assert time.perf_counter() - t0 < 4, "fermeture : une seule attente commune"
    assert all(w.proc.poll() is not None for w in p.workers)
