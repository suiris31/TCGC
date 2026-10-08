"""Réseau politique-valeur.

Entrées (une observation, voir obs.py) :
- cartes individuelles (préfixe a_) et cartes des zones résumées (préfixe p_ : Défausses, son deck restant ; p_group
  1, 2 ou 3 selon la zone) : caractéristiques statiques (catalogue), dynamiques (partie), identifiant appris
  (vocabulaire du modèle, 0 = carte inconnue), masque (1 = carte présente, 0 = remplissage) ;
- caractéristiques globales ;
- options : caractéristiques et pointeurs vers les cartes qu'elles désignent (k < nombre de cartes individuelles :
  carte individuelle k ; au-delà : carte résumée ; -1 : aucune).

Architecture :
- chaque jeton passe dans un petit réseau commun (même traitement pour toutes les cartes : une carte jamais vue est
  traitée d'après ses caractéristiques) ;
- les zones résumées sont additionnées par zone (comme un sac de cartes) et rejoignent le jeton global ;
- un transformeur (attention entre le jeton global et les cartes individuelles ; les zones résumées, deux tiers des
  cartes en moyenne, n'y passent pas : mesuré, c'est l'essentiel du temps de calcul) ;
- tête politique : un score par option, à partir de l'option, des cartes qu'elle désigne et du jeton global ; les
  options absentes (remplissage) sont masquées : la distribution ne porte que sur les options légales ;
- tête valeur : estimation de l'issue de la partie (−1 défaite, +1 victoire) pour le joueur qui observe.

Le calcul n'utilise que des opérations simples (pas de nn.MultiheadAttention) pour un export ONNX fidèle.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F

NEG = -1e9


@dataclass
class ModelConfig:
    static_dim: int
    dyn_dim: int
    glob_dim: int
    opt_dim: int
    vocab_size: int          # nombre de cartes du vocabulaire (+1 pour « inconnue »)
    groups: int = 4
    count_index: int = -1    # colonne « count » des caractéristiques dynamiques (poids des zones résumées)
    d_model: int = 128
    layers: int = 3
    heads: int = 4
    ffn_mult: int = 2
    id_dim: int = 16
    id_dropout: float = 0.25  # probabilité de remplacer l'identifiant par « inconnue » pendant l'entraînement

    def to_dict(self) -> dict:
        return asdict(self)


class Block(nn.Module):
    def __init__(self, d: int, heads: int, ffn_mult: int):
        super().__init__()
        self.heads = heads
        self.ln1 = nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d)
        self.out = nn.Linear(d, d)
        self.ln2 = nn.LayerNorm(d)
        self.ff = nn.Sequential(nn.Linear(d, ffn_mult * d), nn.GELU(), nn.Linear(ffn_mult * d, d))

    def forward(self, x: torch.Tensor, key_bias: torch.Tensor) -> torch.Tensor:
        B, L, d = x.shape
        h = self.heads
        q, k, v = self.qkv(self.ln1(x)).chunk(3, dim=-1)
        q = q.reshape(B, L, h, d // h).transpose(1, 2)
        k = k.reshape(B, L, h, d // h).transpose(1, 2)
        v = v.reshape(B, L, h, d // h).transpose(1, 2)
        att = torch.matmul(q, k.transpose(-1, -2)) * (1.0 / math.sqrt(d // h)) + key_bias
        att = torch.softmax(att, dim=-1)
        y = torch.matmul(att, v).transpose(1, 2).reshape(B, L, d)
        x = x + self.out(y)
        return x + self.ff(self.ln2(x))


class PolicyValueNet(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        d = cfg.d_model
        # première couche des cartes, en trois morceaux qui s'additionnent (équivalent à une couche sur leur
        # concaténation) : la partie statique ne dépend que de la carte, elle se calcule une fois par carte de la table
        # pendant l'entraînement (forward_table) au lieu d'une fois par carte de chaque observation (mesuré)
        self.tok_static = nn.Linear(cfg.static_dim, d)
        self.tok_dyn = nn.Linear(cfg.dyn_dim, d, bias=False)
        self.id_emb = nn.Embedding(cfg.vocab_size + 1, cfg.id_dim)
        self.tok_id = nn.Linear(cfg.id_dim, d, bias=False)
        self.tok_out = nn.Linear(d, d)
        self.tok_ln = nn.LayerNorm(d)
        self.glob = nn.Sequential(nn.Linear(cfg.glob_dim + (cfg.groups - 1) * d, d), nn.GELU(), nn.Linear(d, d))
        self.blocks = nn.ModuleList(Block(d, cfg.heads, cfg.ffn_mult) for _ in range(cfg.layers))
        self.ln_out = nn.LayerNorm(d)
        self.ln_pool = nn.LayerNorm(d)
        self.opt = nn.Sequential(nn.Linear(cfg.opt_dim, d), nn.GELU(), nn.Linear(d, d))
        # score d'une option : option + carte désignée + cible + contexte (somme de projections, sans concaténation)
        self.score_opt = nn.Linear(d, d)
        self.score_ref = nn.Linear(d, d, bias=False)
        self.score_target = nn.Linear(d, d, bias=False)
        self.score_ctx = nn.Linear(d, d, bias=False)
        self.score_out = nn.Linear(d, 1)
        self.value = nn.Sequential(nn.Linear(d, d), nn.GELU(), nn.Linear(d, 1))

    def embed(self, static_proj, dyn, ids):
        if self.training and self.cfg.id_dropout > 0:
            keep = (torch.rand(ids.shape, device=ids.device) >= self.cfg.id_dropout).long()
            ids = ids * keep
        h = F.gelu(static_proj + self.tok_dyn(dyn) + self.tok_id(self.id_emb(ids)))
        return self.tok_ln(self.tok_out(h))

    def forward(self, a_static, a_dyn, a_ids, a_mask, p_static, p_dyn, p_ids, p_group, p_mask, glob, opt, ptr, opt_mask):
        """Caractéristiques statiques de chaque carte en entrée (export ONNX, navigateur).
        Renvoie (logits [B, A] masqués sur les options absentes, valeur [B] entre −1 et 1)."""
        return self._forward(self.tok_static(a_static), a_dyn, a_ids, a_mask, self.tok_static(p_static), p_dyn, p_ids,
                             p_group, p_mask, glob, opt, ptr, opt_mask)

    def forward_table(self, table, a_idx, a_dyn, a_ids, a_mask, p_idx, p_dyn, p_ids, p_group, p_mask, glob, opt, ptr, opt_mask):
        """Même calcul, les cartes données par leur rang dans la table des caractéristiques statiques (entraînement)."""
        proj = self.tok_static(table)
        return self._forward(proj[a_idx], a_dyn, a_ids, a_mask, proj[p_idx], p_dyn, p_ids, p_group, p_mask, glob, opt, ptr, opt_mask)

    def _forward(self, a_sp, a_dyn, a_ids, a_mask, p_sp, p_dyn, p_ids, p_group, p_mask, glob, opt, ptr, opt_mask):
        cfg = self.cfg
        ea = self.embed(a_sp, a_dyn, a_ids)                                      # [B, Na, d]
        ep = self.embed(p_sp, p_dyn, p_ids)                                      # [B, Np, d]
        # zones résumées : somme des cartes de chaque zone, pondérée par le nombre d'exemplaires
        count = p_dyn[..., cfg.count_index] * 4.0 if cfg.count_index >= 0 else torch.ones_like(p_mask)
        pooled = []
        for g in range(1, cfg.groups):
            w = (p_group == g).to(ep.dtype) * p_mask * count                       # [B, Np]
            pooled.append(torch.matmul(w.unsqueeze(1), ep).squeeze(1) / 10.0)      # [B, d]
        g0 = self.glob(torch.cat([glob] + pooled, dim=-1)).unsqueeze(1)            # [B, 1, d]
        x = torch.cat([g0, ea], dim=1)                                            # [B, 1 + Na, d]
        attend = torch.cat([torch.ones_like(a_mask[:, :1]), a_mask], dim=1)
        key_bias = ((1.0 - attend) * NEG).unsqueeze(1).unsqueeze(1)               # [B, 1, 1, 1 + Na]
        for blk in self.blocks:
            x = blk(x, key_bias)
        x = self.ln_out(x)
        g = x[:, 0]                                                               # [B, d]
        # cartes pointées : 0 = aucune (vecteur nul), 1..Na = cartes individuelles, puis cartes résumées
        tokens = torch.cat([torch.zeros_like(x[:, :1]), x[:, 1:], self.ln_pool(ep)], dim=1)
        B, A, _ = opt.shape
        d = x.shape[-1]
        idx = (ptr + 1).clamp(min=0)                                              # [B, A, 2]
        t1 = torch.gather(tokens, 1, idx[..., 0:1].expand(B, A, d))
        t2 = torch.gather(tokens, 1, idx[..., 1:2].expand(B, A, d))
        h = self.score_opt(self.opt(opt)) + self.score_ref(t1) + self.score_target(t2) + self.score_ctx(g).unsqueeze(1)
        logits = self.score_out(F.gelu(h)).squeeze(-1)
        logits = torch.where(opt_mask > 0, logits, torch.full_like(logits, NEG))
        value = torch.tanh(self.value(g)).squeeze(-1)
        return logits, value


def masked_distribution(logits: torch.Tensor, opt_mask: torch.Tensor):
    """Probabilités et log-probabilités sur les seules options légales."""
    logp = F.log_softmax(logits, dim=-1)
    p = logp.exp() * opt_mask
    return p, logp


def entropy(logits: torch.Tensor, opt_mask: torch.Tensor) -> torch.Tensor:
    p, logp = masked_distribution(logits, opt_mask)
    return -(p * torch.where(opt_mask > 0, logp, torch.zeros_like(logp))).sum(-1)


def parameter_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
