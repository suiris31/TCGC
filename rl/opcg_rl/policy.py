"""Un modèle prêt à jouer : réseau + vocabulaire de cartes + mise en lots ; choix d'options pour des observations."""
from __future__ import annotations

import numpy as np
import torch

from .envpool import Spec
from .model import ModelConfig, PolicyValueNet, masked_distribution
from .obs import Collator, Obs


def vocab_from_decks(spec: Spec, deck_ids: list[str]) -> list[str]:
    """Vocabulaire des identifiants appris : les cartes (et Leaders) des decks d'entraînement."""
    nums: set[str] = set()
    for d in deck_ids:
        deck = spec.decks[d]
        nums.add(deck["leader"])
        nums.update(deck["cards"].keys())
    return sorted(nums)


def build_model(spec: Spec, vocab: list[str], model_cfg: dict) -> PolicyValueNet:
    cfg = ModelConfig(
        static_dim=spec.static_dim, dyn_dim=spec.dyn_dim, glob_dim=spec.glob_dim, opt_dim=spec.opt_dim,
        vocab_size=len(vocab), groups=spec.groups, count_index=spec.feature_index("dyn", "count"),
        **{k: v for k, v in model_cfg.items() if k in ModelConfig.__dataclass_fields__ and k not in (
            "static_dim", "dyn_dim", "glob_dim", "opt_dim", "vocab_size", "groups", "count_index")},
    )
    return PolicyValueNet(cfg)


class Agent:
    def __init__(self, model: PolicyValueNet, vocab: list[str], spec: Spec, device: torch.device, name: str = "modèle"):
        self.model = model.to(device)
        self.vocab = vocab
        self.name = name
        index = {num: i + 1 for i, num in enumerate(vocab)}
        self.table_to_vocab = np.array([index.get(num, 0) for num in spec.cards], dtype=np.int64)
        self.collate = Collator(spec.static_table, self.table_to_vocab, device)
        self.device = device

    def forget_card_ids(self) -> None:
        """Toutes les cartes deviennent « inconnues » du vocabulaire : le modèle joue d'après leurs seules
        caractéristiques, comme avec des cartes jamais vues (mesure de la généralisation)."""
        self.table_to_vocab[:] = 0
        self.collate.to_vocab.zero_()
        self.name = f"{self.name} (sans identifiants)"

    def forward(self, batch: dict):
        """(logits, valeur) d'un lot préparé par self.collate."""
        return self.model.forward_table(self.collate.static, **batch)

    @torch.no_grad()
    def act(self, obs: list[Obs], rng: np.random.Generator, greedy: bool = False, temperature: float = 1.0,
            chunk: int = 1024):
        """Choix pour chaque observation : (rangs choisis, log-prob, valeurs, probabilités par observation)."""
        was_training = self.model.training
        self.model.eval()
        actions, logps, values, probs = [], [], [], []
        for start in range(0, len(obs), chunk):
            part = obs[start:start + chunk]
            batch = self.collate(part)
            logits, value = self.forward(batch)
            if temperature != 1.0 and not greedy:
                logits = torch.where(batch["opt_mask"] > 0, logits / temperature, logits)
            p, logp = masked_distribution(logits, batch["opt_mask"])
            p = p.float().cpu().numpy()
            logp = logp.float().cpu().numpy()
            for i, o in enumerate(part):
                pi = p[i, :o.a].astype(np.float64)
                pi /= pi.sum()
                a = int(np.argmax(pi)) if greedy else int(min(np.searchsorted(np.cumsum(pi), rng.random()), o.a - 1))
                actions.append(a)
                logps.append(float(logp[i, a]))
                probs.append(pi)
            values.extend(value.float().cpu().numpy().tolist())
        self.model.train(was_training)
        return actions, logps, values, probs

    @torch.no_grad()
    def values(self, obs: list[Obs], chunk: int = 1024) -> np.ndarray:
        was_training = self.model.training
        self.model.eval()
        out = []
        for start in range(0, len(obs), chunk):
            batch = self.collate(obs[start:start + chunk], with_options=False)
            out.append(self.forward(batch)[1].float().cpu().numpy())
        self.model.train(was_training)
        return np.concatenate(out) if out else np.zeros(0, np.float32)
