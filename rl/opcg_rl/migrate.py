"""Prolonger un modèle entraîné avec un encodage précédent (game/rl/encode.ts, PREVIOUS_SPECS).

Seules les dernières colonnes des options diffèrent (encodage 4 : comparaisons par option ajoutées après celles de
l'encodage 3). La première couche des options reçoit des poids nuls pour les nouvelles colonnes : le modèle joue
d'abord exactement comme avant, puis l'apprentissage se sert des nouvelles informations. L'état de l'optimiseur
(Adam) est prolongé de la même façon (moments nuls pour les nouveaux poids).
"""
from __future__ import annotations

import torch

from .envpool import Spec

OPT_WEIGHT = "opt.0.weight"   # première couche des options (model.PolicyValueNet.opt)


class EncodingMismatch(RuntimeError):
    pass


def previous_option_dim(spec: Spec, spec_hash: str | None, model_config: dict) -> int | None:
    """Nombre de colonnes d'options de l'encodage précédent `spec_hash` s'il se prolonge vers l'actuel, sinon None."""
    for prev in spec.previous_specs:
        if prev["specHash"] == spec_hash and int(model_config.get("opt_dim", -1)) == int(prev["optionDim"]):
            return int(prev["optionDim"]) if int(prev["optionDim"]) < spec.opt_dim else None
    return None


def adapt(model_state: dict, model_config: dict, spec_hash: str | None, spec: Spec, what: str = "modèle"
          ) -> tuple[dict, dict, int | None]:
    """Poids et configuration utilisables avec l'encodage actuel. Renvoie aussi l'ancien nombre de colonnes d'options
    si le modèle a été prolongé (None s'il était déjà à jour). Lève EncodingMismatch sinon."""
    if spec_hash is None or spec_hash == spec.spec_hash:
        return model_state, model_config, None
    old = previous_option_dim(spec, spec_hash, model_config)
    if old is None:
        raise EncodingMismatch(
            f"{what} a été entraîné avec un autre encodage des observations ({spec_hash}, actuel {spec.spec_hash}) : "
            "le code de game/rl/ a changé depuis. Réentraîne (--fresh ou --run), ou reviens à la version du dépôt de ce modèle.")
    state = dict(model_state)
    w = state[OPT_WEIGHT]
    state[OPT_WEIGHT] = torch.cat([w, w.new_zeros(w.shape[0], spec.opt_dim - old)], dim=1)
    return state, {**model_config, "opt_dim": spec.opt_dim}, old


def adapt_optimizer(optimizer_state: dict, model: torch.nn.Module, old_dim: int) -> dict:
    """État d'Adam prolongé pour les nouvelles colonnes de la première couche des options (moments nuls)."""
    names = [n for n, _ in model.named_parameters()]
    index = names.index(OPT_WEIGHT)
    new_dim = dict(model.named_parameters())[OPT_WEIGHT].shape[1]
    state = {**optimizer_state, "state": dict(optimizer_state["state"])}
    entry = state["state"].get(index)
    if entry is not None:
        entry = dict(entry)
        for k in ("exp_avg", "exp_avg_sq", "max_exp_avg_sq"):
            t = entry.get(k)
            if t is not None and t.dim() == 2 and t.shape[1] == old_dim:
                entry[k] = torch.cat([t, t.new_zeros(t.shape[0], new_dim - old_dim)], dim=1)
        state["state"][index] = entry
    return state
