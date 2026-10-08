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


def test_resume_skips_an_unreadable_latest(tmp_path):
    ck.save_with_latest(tmp_path, 10, {"state": {"update": 10}}, keep=5, warn=lambda m: None)
    time.sleep(0.01)
    ck.save_with_latest(tmp_path, 20, {"state": {"update": 20}}, keep=5, warn=lambda m: None)
    (tmp_path / "latest.pt").write_bytes(b"\0" * 64)              # coupure de courant
    later = time.time() + 5
    os.utime(tmp_path / "latest.pt", (later, later))
    warnings = []
    path, data = ck.load_latest(tmp_path, warn=warnings.append)
    assert path.name == "ckpt_0000020.pt" and data["state"]["update"] == 20 and warnings


def test_pruning_keeps_the_newest_files_not_the_highest_numbers(tmp_path):
    for u in (3000, 3010, 3020):
        ck.save(tmp_path / f"ckpt_{u:07d}.pt", {"u": u})
    time.sleep(0.01)
    for u in (1210, 1220):                                       # reprise depuis un point plus ancien
        time.sleep(0.01)
        ck.save_with_latest(tmp_path, u, {"u": u}, keep=2, warn=lambda m: None)
    assert sorted(p.name for p in tmp_path.glob("ckpt_*.pt")) == ["ckpt_0001210.pt", "ckpt_0001220.pt"]


def test_config_numbers_and_run_name():
    cfg = load_config([], ["ppo.lr=1e-4", "ppo.target_kl=3e-2", "run=2024"])
    assert cfg["ppo"]["lr"] == 1e-4 and isinstance(cfg["ppo"]["lr"], float)
    assert cfg["ppo"]["target_kl"] == 0.03 and cfg["run"] == "2024"


def test_resume_command_drops_one_shot_options(monkeypatch):
    import train
    monkeypatch.setattr(sys, "argv", ["train.py", "--config", "cpu", "--fresh", "--level", "3", "--resume=x.pt",
                                      "--run", "essai 2", "--set", "ppo.lr=0.0001"])
    assert train.resume_command() == 'python train.py --config cpu --run "essai 2" --set ppo.lr=0.0001'


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
