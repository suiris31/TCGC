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

    def pack(self, items: list[Obs], with_options: bool = True, raw_ptr: bool = False,
             dtype: type | None = np.float32) -> dict[str, np.ndarray]:
        """Le lot en tableaux numpy, sans boucle Python par observation (concaténations puis affectations indexées) ;
        aussi le nombre de cartes individuelles (na), résumées (npool) et d'options (a) de chaque observation.
        raw_ptr : pointeurs laissés tels qu'encodés (Packed les renumérote par micro-lot) ; dtype : type des
        caractéristiques dynamiques et des options (None : celui des observations)."""
        B = len(items)
        n = np.fromiter((o.card_idx.shape[0] for o in items), np.int64, B)
        a = np.fromiter((o.opt.shape[0] for o in items), np.int64, B) if with_options else np.zeros(B, np.int64)
        group = np.concatenate([o.group for o in items]).astype(np.int64)
        start = np.zeros(B + 1, np.int64)
        np.cumsum(n, out=start[1:])
        is0 = group == 0
        c0 = np.zeros(len(group) + 1, np.int64)
        np.cumsum(is0, out=c0[1:])
        na = c0[start[1:]] - c0[start[:-1]]
        row = np.repeat(np.arange(B), n)
        pos = np.arange(len(group)) - start[:-1][row]          # rang de la carte dans son observation
        na_r = na[row]
        indiv = pos < na_r
        if (~is0 & indiv).any():
            raise ValueError("observation : cartes individuelles après les zones résumées")
        pool = ~indiv
        npool = n - na
        Na = max(1, int(na.max()))
        Np = max(1, int(npool.max()))
        A = max(1, int(a.max())) if with_options else 1
        card = np.concatenate([o.card_idx for o in items]).astype(np.int64)
        dyn = np.concatenate([o.dyn for o in items])
        dt = dyn.dtype if dtype is None else dtype
        D = dyn.shape[1]
        O = items[0].opt.shape[1] if items[0].opt.ndim == 2 else 0
        ri, pi = row[indiv], pos[indiv]
        rp, pp = row[pool], (pos - na_r)[pool]
        a_idx = np.zeros((B, Na), np.int64)
        a_idx[ri, pi] = card[indiv]
        a_dyn = np.zeros((B, Na, D), dt)
        a_dyn[ri, pi] = dyn[indiv]
        a_mask = np.zeros((B, Na), np.float32)
        a_mask[ri, pi] = 1
        p_idx = np.zeros((B, Np), np.int64)
        p_idx[rp, pp] = card[pool]
        p_dyn = np.zeros((B, Np, D), dt)
        p_dyn[rp, pp] = dyn[pool]
        p_group = np.zeros((B, Np), np.int64)
        p_group[rp, pp] = group[pool]
        p_mask = np.zeros((B, Np), np.float32)
        p_mask[rp, pp] = 1
        a_keep = np.ones((B, Na), np.int64)
        p_keep = np.ones((B, Np), np.int64)
        if any(o.id_keep is not None for o in items):
            keep = np.concatenate([o.id_keep if o.id_keep is not None else np.ones(o.card_idx.shape[0], np.int64)
                                   for o in items]).astype(np.int64)
            a_keep[ri, pi] = keep[indiv]
            p_keep[rp, pp] = keep[pool]
        glob = np.stack([o.glob for o in items]).astype(np.float32, copy=False)
        opt = np.zeros((B, A, O), dt)
        ptr = np.full((B, A, 2), -1, np.int64)
        opt_mask = np.zeros((B, A), np.float32)
        if with_options and a.sum():
            astart = np.zeros(B + 1, np.int64)
            np.cumsum(a, out=astart[1:])
            orow = np.repeat(np.arange(B), a)
            opos = np.arange(int(a.sum())) - astart[:-1][orow]
            opt[orow, opos] = np.concatenate([o.opt for o in items])
            q = np.concatenate([o.ptr for o in items]).astype(np.int64)
            if not raw_ptr:
                nq = na[orow][:, None]
                q = np.where(q < nq, q, Na + (q - nq))
            ptr[orow, opos] = q
            opt_mask[orow, opos] = 1
        return {"a_idx": a_idx, "a_dyn": a_dyn, "a_mask": a_mask, "a_keep": a_keep, "p_idx": p_idx, "p_dyn": p_dyn,
                "p_group": p_group, "p_mask": p_mask, "p_keep": p_keep, "glob": glob, "opt": opt, "ptr": ptr,
                "opt_mask": opt_mask, "na": na, "npool": npool, "a": a}

    def __call__(self, items: list[Obs], with_options: bool = True) -> dict[str, torch.Tensor]:
        x = self.pack(items, with_options)
        t = self.to_device({k: v for k, v in x.items() if k not in ("na", "npool", "a")})
        return {
            "a_idx": t["a_idx"], "a_dyn": t["a_dyn"], "a_ids": self.to_vocab[t["a_idx"]] * t["a_keep"], "a_mask": t["a_mask"],
            "p_idx": t["p_idx"], "p_dyn": t["p_dyn"], "p_ids": self.to_vocab[t["p_idx"]] * t["p_keep"],
            "p_group": t["p_group"], "p_mask": t["p_mask"], "glob": t["glob"], "opt": t["opt"], "ptr": t["ptr"],
            "opt_mask": t["opt_mask"],
        }


    def to_device(self, arrays: dict[str, np.ndarray]) -> dict[str, torch.Tensor]:
        """Tableaux envoyés sur l'appareil en deux copies (entiers, décimaux) redécoupées sur place : chaque copie vers
        le GPU a un coût fixe (~0,3 ms sous Windows), treize par lot coûtaient plus que le calcul du réseau (mesuré)."""
        if self.device.type == "cpu":
            return {k: torch.from_numpy(v) for k, v in arrays.items()}
        out: dict[str, torch.Tensor] = {}
        for dtype in (np.int64, np.float32):
            keys = [k for k, v in arrays.items() if v.dtype == dtype]
            flat = torch.from_numpy(np.concatenate([arrays[k].ravel() for k in keys])).to(self.device)
            at = 0
            for k in keys:
                size = arrays[k].size
                out[k] = flat[at:at + size].view(arrays[k].shape)
                at += size
        for k, v in arrays.items():
            if k not in out:
                out[k] = torch.from_numpy(v).to(self.device)
        return out


class Packed:
    """Les observations d'une mise à jour, mises en lot une seule fois et gardées sur l'appareil du modèle (GPU) :
    chaque micro-lot en est une sélection, complétée à sa propre plus grande observation, pointeurs renumérotés en
    conséquence — exactement le lot que ferait Collator sur ces observations, sans repasser par Python ni par la
    mémoire de l'ordinateur à chaque passe d'apprentissage. Caractéristiques gardées dans leur type (float16 pour les
    observations gardées, voir Obs.compact), converties en float32 par micro-lot."""

    def __init__(self, collate: Collator, items: list[Obs]):
        x = collate.pack(items, raw_ptr=True, dtype=None)
        self.collate = collate
        self.na, self.npool, self.n_opts = x.pop("na"), x.pop("npool"), x.pop("a")
        dev = collate.device
        self.t = {k: torch.from_numpy(v).to(dev) for k, v in x.items()}
        self.t["na"] = torch.from_numpy(self.na).to(dev)

    def __len__(self) -> int:
        return len(self.na)

    def batch(self, idx: np.ndarray, idx_t: torch.Tensor, with_options: bool = True) -> dict[str, torch.Tensor]:
        """Lot des observations de rangs idx (idx_t : les mêmes rangs, déjà sur l'appareil)."""
        Na = max(1, int(self.na[idx].max()))
        Np = max(1, int(self.npool[idx].max()))
        t = self.t
        to_vocab = self.collate.to_vocab
        a_idx = t["a_idx"][idx_t, :Na]
        p_idx = t["p_idx"][idx_t, :Np]
        out = {
            "a_idx": a_idx, "a_dyn": t["a_dyn"][idx_t, :Na].float(), "a_ids": to_vocab[a_idx] * t["a_keep"][idx_t, :Na],
            "a_mask": t["a_mask"][idx_t, :Na],
            "p_idx": p_idx, "p_dyn": t["p_dyn"][idx_t, :Np].float(), "p_ids": to_vocab[p_idx] * t["p_keep"][idx_t, :Np],
            "p_group": t["p_group"][idx_t, :Np], "p_mask": t["p_mask"][idx_t, :Np], "glob": t["glob"][idx_t],
        }
        if with_options:
            A = max(1, int(self.n_opts[idx].max()))
            q = t["ptr"][idx_t, :A]
            nq = t["na"][idx_t].view(-1, 1, 1)
            out.update(opt=t["opt"][idx_t, :A].float(), ptr=torch.where(q < nq, q, Na + (q - nq)),
                       opt_mask=t["opt_mask"][idx_t, :A])
        else:
            B, O = len(idx), t["opt"].shape[2]
            dev = idx_t.device
            out.update(opt=torch.zeros(B, 1, O, device=dev), ptr=torch.full((B, 1, 2), -1, dtype=torch.long, device=dev),
                       opt_mask=torch.zeros(B, 1, device=dev))
        return out
