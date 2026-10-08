"""Choix du matériel : GPU NVIDIA (CUDA), GPU Apple (MPS) ou processeur, détecté automatiquement."""
from __future__ import annotations

import os
import platform

import torch


def select_device(name: str = "auto") -> torch.device:
    if name and name != "auto":
        dev = torch.device(name)
        if dev.type == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("device=cuda demandé mais aucun GPU CUDA n'est disponible pour PyTorch (voir rl/README.md)")
        if dev.type == "mps" and not torch.backends.mps.is_available():
            raise RuntimeError("device=mps demandé mais MPS n'est pas disponible")
        return dev
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def describe(device: torch.device) -> str:
    if device.type == "cuda":
        idx = device.index if device.index is not None else torch.cuda.current_device()
        props = torch.cuda.get_device_properties(idx)
        free, total = torch.cuda.mem_get_info(idx)
        return (f"GPU CUDA {idx} : {props.name}, {total / 2**30:.1f} Gio ({free / 2**30:.1f} Gio libres), "
                f"PyTorch {torch.__version__}, CUDA {torch.version.cuda}")
    if device.type == "mps":
        return f"GPU Apple (MPS), PyTorch {torch.__version__}"
    return (f"processeur : {platform.processor() or platform.machine()}, {os.cpu_count()} cœurs logiques, "
            f"PyTorch {torch.__version__} ({torch.get_num_threads()} fils de calcul) — aucun GPU compatible détecté")


def memory_stats(device: torch.device) -> dict:
    if device.type == "cuda":
        return {
            "gpu_mem_allocated_gb": torch.cuda.memory_allocated(device) / 2**30,
            "gpu_mem_peak_gb": torch.cuda.max_memory_allocated(device) / 2**30,
        }
    return {}
