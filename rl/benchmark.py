"""Mesure ce que ton ordinateur peut faire, avant de lancer un long entraînement.

    python benchmark.py                 # avec les réglages par défaut
    python benchmark.py --config cpu    # avec ceux d'un fichier de config/

Mesures :
1. simulation seule (processus Node, coups au hasard) : parties et décisions par seconde ;
2. collecte réelle (Node + réseau qui choisit, contre l'IA heuristique) : décisions par seconde ;
3. apprentissage (passes avant/arrière du réseau sur le processeur ou le GPU) : exemples par seconde ;
puis une estimation du temps par mise à jour et des parties jouées par heure.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.config import load_config  # noqa: E402
from opcg_rl.device import describe, select_device  # noqa: E402
from opcg_rl.model import parameter_count  # noqa: E402
from opcg_rl.policy import Agent, build_model, vocab_from_decks  # noqa: E402
from opcg_rl.runtime import open_pool, resolve_workers  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Mesure des performances de l'ordinateur pour l'entraînement")
    p.add_argument("--config", action="append", default=[])
    p.add_argument("--set", action="append", default=[])
    p.add_argument("--seconds", type=float, default=20, help="durée de chaque mesure de simulation")
    args = p.parse_args()
    cfg = load_config(args.config, args.set)
    device = select_device(cfg["device"])
    workers = resolve_workers(cfg["env"]["workers"], reserve_for_torch=device.type == "cpu")
    envs = int(cfg["env"]["envs_per_worker"])
    if cfg.get("torch_threads", "auto") == "auto":
        torch.set_num_threads(max(1, (os.cpu_count() or 2) - workers) if device.type == "cpu" else max(1, min(4, os.cpu_count() or 1)))
    print(f"Matériel : {describe(device)}")
    print(f"Réglages : {workers} processus Node × {envs} parties, modèle {cfg['model']}, {cfg['ppo']['steps_per_update']} décisions par mise à jour\n")
    pool = open_pool(cfg, envs, workers)
    spec = pool.spec
    if spec.synthetic:
        print("(catalogue synthétique : mesures indicatives)")
    rng = np.random.default_rng(0)
    decks = list(spec.decks)

    def new(env, k, opponent):
        return {"env": env, "seed": 10_000 + k, "decks": [decks[k % len(decks)], decks[(k // len(decks)) % len(decks)]],
                "seats": [{"kind": "agent"}, opponent]}

    def run(chooser, opponent, label):
        k = 0
        results = pool.run(resets=[new(e, (k := k + 1), opponent) for e in range(pool.size)])
        games = decisions = 0
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < args.seconds:
            live = [r for r in results if not r.done]
            done = [r for r in results if r.done]
            games += len(done)
            acts = chooser([r.obs[0] for r in live]) if live else []
            decisions += len(acts)
            resets = []
            for r in done:
                k += 1
                resets.append(new(r.env, k, opponent))
            results = pool.run(actions=[{"env": r.env, "index": a} for r, a in zip(live, acts)], resets=resets)
        dt = time.perf_counter() - t0
        print(f"{label:52s} {games / dt:7.1f} parties/s  {decisions / dt:8.0f} décisions/s du joueur mesuré")
        return games / dt, decisions / dt

    try:
        run(lambda obs: [int(rng.integers(o.a)) for o in obs], {"kind": "agent"}, "1. simulation seule (hasard contre hasard)")
        vocab = vocab_from_decks(spec, decks)
        model = build_model(spec, vocab, cfg["model"])
        agent = Agent(model, vocab, spec, device)
        print(f"   modèle : {parameter_count(model) / 1e6:.2f} M paramètres")
        _, dps = run(lambda obs: agent.act(obs, rng)[0], {"kind": "heuristic"}, "2. collecte (réseau contre heuristique)")
        # apprentissage : passes avant/arrière sur des observations réelles
        obs = []
        results = pool.run(resets=[new(e, 1000 + e, {"kind": "heuristic"}) for e in range(pool.size)])
        while len(obs) < 2048:
            live = [r for r in results if not r.done]
            obs += [r.obs[0].compact() for r in live]
            results = pool.run(actions=[{"env": r.env, "index": int(rng.integers(r.obs[0].a))} for r in live],
                               resets=[new(r.env, 5000 + len(obs) + r.env, {"kind": "heuristic"}) for r in results if r.done])
    finally:
        pool.close()
    mb = int(cfg["ppo"]["minibatch_size"])
    opt = torch.optim.Adam(agent.model.parameters(), lr=1e-4)
    agent.model.train()
    batches = [agent.collate(obs[i:i + mb]) for i in range(0, len(obs), mb)]
    for b in batches[:1]:  # échauffement
        l, v = agent.forward(b)
        (l.logsumexp(-1).mean() + v.pow(2).mean()).backward()
    if device.type == "cuda":
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    reps = 3
    for _ in range(reps):
        for b in batches:
            l, v = agent.forward(b)
            loss = l.logsumexp(-1).mean() + v.pow(2).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
    if device.type == "cuda":
        torch.cuda.synchronize()
    learn_sps = reps * len(obs) / (time.perf_counter() - t0)
    print(f"{'3. apprentissage (passes avant/arrière)':52s} {learn_sps:8.0f} exemples/s")
    steps = int(cfg["ppo"]["steps_per_update"])
    epochs = int(cfg["ppo"]["epochs"])
    t_collect = steps / max(1e-9, dps)
    t_learn = steps * epochs / learn_sps + steps / (learn_sps * 3)
    per_update = t_collect + t_learn
    games_per_update = steps / 70  # environ 70 décisions du modèle par partie
    print(f"\nEstimation : {per_update:.0f} s par mise à jour (collecte {t_collect:.0f} s, apprentissage {t_learn:.0f} s), "
          f"≈ {3600 / per_update * games_per_update:.0f} parties d'entraînement par heure, "
          f"{3600 / per_update:.0f} mises à jour par heure.")
    print("Repères (decks préconstruits) : niveau 1 en quelques dizaines de mises à jour ; niveau 2 en quelques centaines ; "
          "un adversaire solide demande des milliers de mises à jour (dizaines d'heures sur processeur).")
    if per_update > 120:
        print("→ Ordinateur lent pour cet entraînement : essaie config/cpu.yaml, réduis model.d_model, ou utilise un GPU.")
    elif per_update > 40:
        print("→ Utilisable : compte une nuit ou plus pour les premiers niveaux.")
    else:
        print("→ Bon débit pour cet entraînement.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
