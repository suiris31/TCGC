"""Configuration : fichiers YAML (rl/config/), fusionnés, puis réglages en ligne de commande (--set clé=valeur)."""
from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any

import yaml

from .paths import CONFIG_DIR


class _Loader(yaml.SafeLoader):
    """YAML 1.1 lit « 1e-4 » (sans point décimal) comme du texte ; ici, comme un nombre."""


class _Dumper(yaml.SafeDumper):
    """Écrit entre guillemets un texte qui ressemblerait à un nombre (« 1e3 »), pour le relire tel quel."""


_FLOAT = re.compile(r"""^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?
    |[-+]?(?:[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)
    |\.[0-9_]+(?:[eE][-+]?[0-9]+)?
    |[-+]?\.(?:inf|Inf|INF)
    |\.(?:nan|NaN|NAN))$""", re.X)
for _cls in (_Loader, _Dumper):
    _cls.add_implicit_resolver("tag:yaml.org,2002:float", _FLOAT, list("-+0123456789."))


def _load(text: str) -> Any:
    return yaml.load(text, Loader=_Loader)


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in (over or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _parse_value(text: str) -> Any:
    return _load(text)


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
    cfg = _load((CONFIG_DIR / "default.yaml").read_text(encoding="utf-8"))
    for f in files or []:
        path = Path(f)
        if not path.exists():
            path = CONFIG_DIR / (f if f.endswith(".yaml") else f"{f}.yaml")
        cfg = deep_merge(cfg, _load(path.read_text(encoding="utf-8")) or {})
    for item in overrides or []:
        if "=" not in item:
            raise ValueError(f"réglage invalide (clé=valeur attendu) : {item}")
        key, value = item.split("=", 1)
        # le nom d'un entraînement est gardé tel qu'il est écrit (« 1e3 », « 007 » ne sont pas des nombres)
        set_dotted(cfg, key.strip(), value.strip() if key.strip() == "run" else _parse_value(value))
    if not isinstance(cfg.get("run"), str):
        raise ValueError(f"run : le nom de l'entraînement doit être un texte (mets-le entre guillemets) : {cfg.get('run')!r}")
    return cfg


def dump(cfg: dict) -> str:
    return yaml.dump(cfg, Dumper=_Dumper, sort_keys=False, allow_unicode=True)
