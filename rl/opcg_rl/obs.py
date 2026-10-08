"""Observations reçues du serveur Node et mise en lots (tenseurs complétés à la même taille) pour le réseau.

Une observation (encodage TypeScript : game/rl/encode.ts) contient :
- n jetons de cartes : index dans la table des cartes (caractéristiques statiques), groupe, caractéristiques dynamiques ;
- les caractéristiques globales ;
- a options : caractéristiques et deux pointeurs vers des jetons (-1 : aucun).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch


@dataclass
class Obs:
    card_idx: np.ndarray   # int32 [n]
    group: np.ndarray      # int32 [n]
    dyn: np.ndarray        # float16/32 [n, D]
    glob: np.ndarray       # float32 [G]
    opt: np.ndarray        # float16/32 [a, O]
    ptr: np.ndarray        # int32 [a, 2]
    env: int = -1
    seat: int = -1
    final: bool = False
    # identifiants appris gardés pour cette décision (False : carte traitée comme inconnue, voir model.id_dropout) ;
    # tiré au moment où le modèle joue et gardé avec l'observation, pour que l'apprentissage évalue exactement la
    # politique qui a joué
    id_keep: np.ndarray | None = None

    @property
    def n(self) -> int:
        return int(self.card_idx.shape[0])

    @property
    def a(self) -> int:
        return int(self.opt.shape[0])

    def compact(self) -> "Obs":
        """Copie en float16 (garde en mémoire des dizaines de milliers d'observations)."""
        return Obs(self.card_idx.copy(), self.group.copy(), self.dyn.astype(np.float16), self.glob.astype(np.float32),
                   self.opt.astype(np.float16), self.ptr.copy(), self.env, self.seat, self.final,
                   None if self.id_keep is None else self.id_keep.copy())


def split_batch(header: dict, buffers: dict[str, np.ndarray], dyn_dim: int, glob_dim: int, opt_dim: int) -> list[Obs]:
    out: list[Obs] = []
    n_off = 0
    a_off = 0
    dyn = buffers["dyn"].reshape(-1, dyn_dim)
    glob = buffers["glob"].reshape(-1, glob_dim)
    opt = buffers["opt"].reshape(-1, opt_dim)
    ptr = buffers["ptr"].reshape(-1, 2)
    for k, meta in enumerate(header["observations"]):
        n, a = meta["n"], meta["a"]
        out.append(Obs(
            card_idx=buffers["cardIdx"][n_off:n_off + n], group=buffers["group"][n_off:n_off + n],
            dyn=dyn[n_off:n_off + n], glob=glob[k], opt=opt[a_off:a_off + a], ptr=ptr[a_off:a_off + a],
            env=meta["env"], seat=meta["seat"], final=meta["final"],
        ))
        n_off += n
        a_off += a
    return out


def onnx_feeds(static: torch.Tensor, batch: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    """Lot au format du modèle exporté (caractéristiques statiques de chaque carte au lieu de son rang dans la table)."""
    out = {k: v for k, v in batch.items() if k not in ("a_idx", "p_idx")}
    out["a_static"] = static[batch["a_idx"]]
    out["p_static"] = static[batch["p_idx"]]
    return out


class Collator:
    """Met des observations en lot : cartes individuelles et cartes résumées dans deux ensembles complétés (padding)
    à la plus grande observation du lot ; pointeurs des options renumérotés en conséquence.

    L'encodage (game/rl/encode.ts) place toujours les cartes individuelles (groupe 0) avant les zones résumées."""

    def __init__(self, static_table: np.ndarray, table_to_vocab: np.ndarray, device: torch.device):
        self.static = torch.as_tensor(static_table, dtype=torch.float32, device=device)
        self.to_vocab = torch.as_tensor(table_to_vocab, dtype=torch.long, device=device)
        self.device = device

    def __call__(self, items: list[Obs], with_options: bool = True) -> dict[str, torch.Tensor]:
        B = len(items)
        na_list = [int((o.group == 0).sum()) for o in items]
        Na = max(1, max(na_list))
        Np = max(1, max(o.n - na for o, na in zip(items, na_list)))
        A = max(1, max(o.a for o in items)) if with_options else 1
        D = items[0].dyn.shape[1]
        G = items[0].glob.shape[0]
        O = items[0].opt.shape[1] if items[0].opt.ndim == 2 else 0
        a_keep = np.ones((B, Na), np.int64)
        p_keep = np.ones((B, Np), np.int64)
        a_idx = np.zeros((B, Na), np.int64)
        a_dyn = np.zeros((B, Na, D), np.float32)
        a_mask = np.zeros((B, Na), np.float32)
        p_idx = np.zeros((B, Np), np.int64)
        p_dyn = np.zeros((B, Np, D), np.float32)
        p_group = np.zeros((B, Np), np.int64)
        p_mask = np.zeros((B, Np), np.float32)
        glob = np.zeros((B, G), np.float32)
        opt = np.zeros((B, A, O), np.float32)
        ptr = np.full((B, A, 2), -1, np.int64)
        opt_mask = np.zeros((B, A), np.float32)
        for i, (o, na) in enumerate(zip(items, na_list)):
            n, a = o.n, o.a
            if na and o.group[:na].any():
                raise ValueError("observation : cartes individuelles après les zones résumées")
            a_idx[i, :na] = o.card_idx[:na]
            if o.id_keep is not None:
                a_keep[i, :na] = o.id_keep[:na]
                p_keep[i, :n - na] = o.id_keep[na:]
            a_dyn[i, :na] = o.dyn[:na]
            a_mask[i, :na] = 1
            npool = n - na
            p_idx[i, :npool] = o.card_idx[na:]
            p_dyn[i, :npool] = o.dyn[na:]
            p_group[i, :npool] = o.group[na:]
            p_mask[i, :npool] = 1
            glob[i] = o.glob
            if with_options and a:
                opt[i, :a] = o.opt
                q = o.ptr.astype(np.int64)
                ptr[i, :a] = np.where(q < na, q, Na + (q - na))
                opt_mask[i, :a] = 1
        dev = self.device
        a_t = torch.from_numpy(a_idx).to(dev)
        p_t = torch.from_numpy(p_idx).to(dev)
        return {
            "a_idx": a_t, "a_dyn": torch.from_numpy(a_dyn).to(dev), "a_ids": self.to_vocab[a_t] * torch.from_numpy(a_keep).to(dev),
            "a_mask": torch.from_numpy(a_mask).to(dev),
            "p_idx": p_t, "p_dyn": torch.from_numpy(p_dyn).to(dev), "p_ids": self.to_vocab[p_t] * torch.from_numpy(p_keep).to(dev),
            "p_group": torch.from_numpy(p_group).to(dev), "p_mask": torch.from_numpy(p_mask).to(dev),
            "glob": torch.from_numpy(glob).to(dev), "opt": torch.from_numpy(opt).to(dev),
            "ptr": torch.from_numpy(ptr).to(dev), "opt_mask": torch.from_numpy(opt_mask).to(dev),
        }
