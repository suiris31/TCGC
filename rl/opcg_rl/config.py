"""Configuration : fichiers YAML (rl/config/), fusionnés, puis réglages en ligne de commande (--set clé=valeur)."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

from .paths import CONFIG_DIR


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in (over or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _parse_value(text: str) -> Any:
    return yaml.safe_load(text)


def set_dotted(cfg: dict, dotted: str, value: Any) -> None:
    """--set ppo.lr=0.0001, --set curriculum.levels.0.max_updates=500"""
    keys = dotted.split(".")
    node: Any = cfg
    for k in keys[:-1]:
        node = node[int(k)] if isinstance(node, list) else node.setdefault(k, {})
    last = keys[-1]
    if isinstance(node, list):
        node[int(last)] = value
    else:
        node[last] = value


def load_config(files: list[str] | None = None, overrides: list[str] | None = None) -> dict:
    """default.yaml, puis chaque fichier donné (chemin, ou nom d'un fichier de rl/config/), puis les --set."""
    cfg = yaml.safe_load((CONFIG_DIR / "default.yaml").read_text(encoding="utf-8"))
    for f in files or []:
        path = Path(f)
        if not path.exists():
            path = CONFIG_DIR / (f if f.endswith(".yaml") else f"{f}.yaml")
        cfg = deep_merge(cfg, yaml.safe_load(path.read_text(encoding="utf-8")) or {})
    for item in overrides or []:
        if "=" not in item:
            raise ValueError(f"réglage invalide (clé=valeur attendu) : {item}")
        key, value = item.split("=", 1)
        set_dotted(cfg, key.strip(), _parse_value(value))
    return cfg


def dump(cfg: dict) -> str:
    return yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True)
