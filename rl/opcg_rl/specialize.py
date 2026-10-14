"""IA spécialisée sur un deck : le modèle général continue d'apprendre en ne jouant QUE ce deck.

Départ : les poids du modèle général (« base », ex. le dernier point de sauvegarde de rtx2070-main) et l'état de son
optimiseur. Le vocabulaire des identifiants de cartes est prolongé avec toutes les cartes des decks du registre (le
modèle général n'en connaissait que 90) : chaque nouvelle carte reçoit l'identifiant appris de la carte « inconnue »,
le modèle joue donc d'abord exactement comme le modèle général, puis apprend à reconnaître les cartes de son deck et
de ses adversaires.

Le modèle général est copié dans le dossier de l'entraînement (base.pt) : il reste un adversaire figé (il joue bien
tous les decks) et la référence des évaluations, même si l'entraînement général reprend et efface ses anciens points
de sauvegarde.
"""
from __future__ import annotations

from pathlib import Path

import torch

from . import checkpoint as ck
from .envpool import Spec
from .migrate import adapt
from .policy import Agent, build_model

BASE_ID = "base"
ID_WEIGHT = "id_emb.weight"   # identifiants appris des cartes (model.PolicyValueNet.id_emb, ligne 0 : carte inconnue)
BASE_FILE = "base.pt"


def extend_vocab(vocab: list[str], spec: Spec) -> list[str]:
    """Vocabulaire du modèle général, puis les cartes des decks du registre qu'il ne connaît pas (les rangs des cartes
    déjà connues ne changent pas)."""
    known = set(vocab)
    extra: set[str] = set()
    for deck in spec.decks.values():
        extra.add(deck["leader"])
        extra.update(deck["cards"].keys())
    return list(vocab) + sorted(extra - known)


def extend_weights(model_state: dict, new_rows: int) -> dict:
    """Nouvelles lignes d'identifiants : copies de celle de la carte inconnue (même jeu qu'avant au départ)."""
    if not new_rows:
        return model_state
    state = dict(model_state)
    w = state[ID_WEIGHT]
    state[ID_WEIGHT] = torch.cat([w, w[:1].expand(new_rows, -1).clone()], dim=0)
    return state


def extend_optimizer(optimizer_state: dict, model: torch.nn.Module, new_rows: int) -> dict:
    """État d'Adam prolongé pour les nouvelles lignes d'identifiants : premier moment nul, second moment de la ligne de
    la carte inconnue (même échelle de pas)."""
    if not new_rows:
        return optimizer_state
    index = [n for n, _ in model.named_parameters()].index(ID_WEIGHT)
    state = {**optimizer_state, "state": dict(optimizer_state["state"])}
    entry = state["state"].get(index)
    if entry is not None:
        entry = dict(entry)
        for k in ("exp_avg", "exp_avg_sq", "max_exp_avg_sq"):
            t = entry.get(k)
            if t is not None and t.dim() == 2:
                extra = t.new_zeros(new_rows, t.shape[1]) if k == "exp_avg" else t[:1].expand(new_rows, -1).clone()
                entry[k] = torch.cat([t, extra], dim=0)
        state["state"][index] = entry
    return state


def save_base(run_dir: Path, source: Path, ckpt: dict) -> None:
    """Copie allégée du modèle général (poids, configuration, vocabulaire) dans le dossier de l'entraînement."""
    st = ckpt.get("state", {})
    ck.save(run_dir / BASE_FILE, {
        "model_state": ckpt["model_state"], "model_config": ckpt["model_config"], "vocab": ckpt["vocab"],
        "spec_hash": ckpt.get("spec_hash"), "engine": ckpt.get("engine"), "source": str(source),
        "state": {"update": st.get("update"), "games": st.get("games")},
    })


def load_base(run_dir: Path, spec: Spec, device: torch.device) -> tuple[Agent, dict]:
    path = run_dir / BASE_FILE
    if not path.exists():
        raise SystemExit(f"Modèle général de cette IA spécialisée introuvable : {path}")
    data = ck.load(path)
    weights, model_cfg, _ = adapt(data["model_state"], data["model_config"], data.get("spec_hash"), spec,
                                  f"Le modèle général {path}")
    model = build_model(spec, data["vocab"], model_cfg)
    model.load_state_dict(weights)
    model.eval()
    return Agent(model, data["vocab"], spec, device, BASE_ID), data
