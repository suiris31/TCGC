"""Suivi de l'entraînement : une ligne lisible par mise à jour, toutes les mesures dans logs/<run>/metrics.jsonl, et
TensorBoard (logs/<run>/tensorboard) s'il est installé."""
from __future__ import annotations

import json
import time
from pathlib import Path


class Logger:
    def __init__(self, run_dir: Path, use_tensorboard: bool = True):
        self.dir = run_dir
        run_dir.mkdir(parents=True, exist_ok=True)
        self.jsonl = open(run_dir / "metrics.jsonl", "a", encoding="utf-8")
        self.tb = None
        if use_tensorboard:
            try:
                from torch.utils.tensorboard import SummaryWriter
                self.tb = SummaryWriter(str(run_dir / "tensorboard"))
            except Exception as err:  # tensorboard absent : seulement le fichier JSONL
                print(f"(TensorBoard indisponible : {err} — mesures dans {run_dir / 'metrics.jsonl'})")

    def log(self, step: int, kind: str, values: dict) -> None:
        row = {"time": time.time(), "update": step, "kind": kind, **values}
        self.jsonl.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.jsonl.flush()
        if self.tb:
            for k, v in values.items():
                if isinstance(v, (int, float)) and v == v:
                    self.tb.add_scalar(f"{kind}/{k}", v, step)
            self.tb.flush()

    def text(self, message: str) -> None:
        print(message, flush=True)
        with open(self.dir / "train.log", "a", encoding="utf-8") as f:
            f.write(message + "\n")

    def close(self) -> None:
        self.jsonl.close()
        if self.tb:
            self.tb.close()
