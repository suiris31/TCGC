"""Serveur de parties (processus Node) piloté depuis Python : parties complètes, résultats, observations."""
from __future__ import annotations

import numpy as np

from conftest import needs_engine
from opcg_rl.obs import Collator
from opcg_rl.policy import Agent, build_model, vocab_from_decks


@needs_engine
def test_random_games_complete(pool):
    spec = pool.spec
    assert spec.cards[0] == "?"
    assert spec.static_table.shape == (len(spec.cards), spec.static_dim)
    rng = np.random.default_rng(0)
    seats = [{"kind": "agent"}, {"kind": "heuristic"}]
    results = pool.run(resets=[{"env": e, "seed": 100 + e, "decks": ["ST-31", "ST-35"], "first": "random", "seats": seats}
                               for e in range(pool.size)])
    finished = 0
    flaws: dict[str, int] = {}
    for _ in range(3000):
        live = [r for r in results if not r.done]
        finished += sum(r.done for r in results)
        if not live:
            break
        actions = []
        for r in live:
            o = r.obs[0]
            assert o.seat == r.to_act == 0
            assert o.a >= 2 and o.ptr.shape == (o.a, 2)
            assert o.dyn.shape == (o.n, spec.dyn_dim)
            assert (o.ptr < o.n).all()
            actions.append({"env": r.env, "index": int(rng.integers(o.a))})
        results = pool.run(actions=actions)
        for r in results:
            if r.flaw:                         # choix inutile du modèle (siège 0, seul piloté)
                assert r.flaw[0] == 0
                flaws[r.flaw[1]] = flaws.get(r.flaw[1], 0) + 1
    assert finished == pool.size
    assert all(r.winner in (0, 1) and not r.truncated and r.error is None for r in results if r.done)
    assert flaws.get("weakAttack", 0) > 0, f"des choix au hasard font des attaques vouées à l'échec : {flaws}"


@needs_engine
def test_agent_plays_through_collator(pool):
    spec = pool.spec
    vocab = vocab_from_decks(spec, list(spec.decks))
    model = build_model(spec, vocab, {"d_model": 32, "layers": 1, "heads": 2})
    import torch
    agent = Agent(model, vocab, spec, torch.device("cpu"))
    seats = [{"kind": "agent"}, {"kind": "agent"}]
    results = pool.run(resets=[{"env": 0, "seed": 5, "decks": ["ST-33", "ST-34"], "seats": seats}])
    rng = np.random.default_rng(1)
    steps = 0
    while not results[0].done and steps < 2000:
        o = results[0].obs[0]
        acts, logps, vals, probs = agent.act([o], rng)
        assert 0 <= acts[0] < o.a and abs(sum(probs[0]) - 1) < 1e-6 and -1 <= vals[0] <= 1
        results = pool.run(actions=[{"env": 0, "index": acts[0]}])
        steps += 1
    assert results[0].done and results[0].winner in (0, 1)
    # mise en lot : la table des cartes et le vocabulaire sont cohérents
    col = Collator(spec.static_table, agent.table_to_vocab, torch.device("cpu"))
    assert col.to_vocab[0].item() == 0, "la carte cachée « ? » est toujours inconnue du vocabulaire"


@needs_engine
def test_microbatches_give_the_same_update(pool):
    import copy

    import torch

    from opcg_rl.ppo import Decision, Traj, ppo_update
    spec = pool.spec
    vocab = vocab_from_decks(spec, list(spec.decks))
    torch.manual_seed(0)
    model = build_model(spec, vocab, {"d_model": 32, "layers": 1, "heads": 2, "id_dropout": 0.0})
    agent = Agent(model, vocab, spec, torch.device("cpu"))
    rng = np.random.default_rng(3)
    trajs = []
    results = pool.run(resets=[{"env": 0, "seed": 9, "decks": ["ST-31", "ST-36"], "seats": [{"kind": "agent"}, {"kind": "random"}]}])
    t = Traj("random", 0)
    while not results[0].done:
        o = results[0].obs[0]
        acts, logps, vals, _ = agent.act([o], rng)
        t.steps.append(Decision(o.compact(), acts[0], logps[0], vals[0], 0))
        results = pool.run(actions=[{"env": 0, "index": acts[0]}])
    t.reward = 1.0 if results[0].winner == 0 else -1.0
    trajs.append(t)
    cfg = {"gamma": 1.0, "gae_lambda": 0.95, "minibatch_size": 64, "epochs": 1, "clip": 0.2, "value_coef": 0.5,
           "entropy_coef": 0.01, "max_grad_norm": 0.5, "target_kl": None}
    params = []
    for micro in (64, 7):
        a = Agent(copy.deepcopy(model), vocab, spec, torch.device("cpu"))
        # SGD : Adam amplifierait au premier pas les différences d'arrondi des gradients presque nuls
        opt = torch.optim.SGD(a.model.parameters(), lr=0.1)
        ppo_update(a, opt, trajs, {**cfg, "microbatch_size": micro}, np.random.default_rng(5), 0)
        params.append(torch.cat([p.detach().flatten() for p in a.model.parameters()]))
    assert (params[0] - params[1]).abs().max() < 1e-6, "micro-lots : même mise à jour"
    assert (params[0] - torch.cat([p.detach().flatten() for p in model.parameters()])).abs().max() > 1e-4, "le modèle a appris"


@needs_engine
def test_half_precision_update_follows_the_full_precision_one(pool):
    """Demi-précision (ppo.amp) sur GPU : même mise à jour qu'en float32, aux arrondis près (sens et ampleur)."""
    import copy

    import pytest
    import torch

    from opcg_rl.ppo import Decision, Traj, ppo_update
    if not torch.cuda.is_available():
        pytest.skip("pas de GPU NVIDIA")
    spec = pool.spec
    vocab = vocab_from_decks(spec, list(spec.decks))
    torch.manual_seed(0)
    dev = torch.device("cuda")
    model = build_model(spec, vocab, {"d_model": 64, "layers": 2, "heads": 4, "id_dropout": 0.0})
    agent = Agent(copy.deepcopy(model), vocab, spec, dev)
    rng = np.random.default_rng(3)
    trajs = []
    for seed in (9, 10, 11):
        results = pool.run(resets=[{"env": 0, "seed": seed, "decks": ["ST-31", "ST-36"], "seats": [{"kind": "agent"}, {"kind": "random"}]}])
        t = Traj("random", 0)
        while not results[0].done:
            o = results[0].obs[0]
            acts, logps, vals, _ = agent.act([o], rng)
            t.steps.append(Decision(o.compact(), acts[0], logps[0], vals[0], 0))
            results = pool.run(actions=[{"env": 0, "index": acts[0]}])
        t.reward = 1.0 if results[0].winner == 0 else -1.0
        trajs.append(t)
    cfg = {"gamma": 1.0, "gae_lambda": 0.95, "minibatch_size": 128, "microbatch_size": 64, "epochs": 1, "clip": 0.2,
           "value_coef": 0.5, "entropy_coef": 0.01, "max_grad_norm": 0.5, "target_kl": None}
    start = torch.cat([p.detach().flatten() for p in model.parameters()]).to(dev)
    moves, outs = [], []
    for scaler in (None, torch.amp.GradScaler("cuda", init_scale=2.0 ** 10)):
        a = Agent(copy.deepcopy(model), vocab, spec, dev)
        opt = torch.optim.SGD(a.model.parameters(), lr=0.1)
        outs.append(ppo_update(a, opt, trajs, cfg, np.random.default_rng(5), 0, scaler))
        moves.append(torch.cat([p.detach().flatten() for p in a.model.parameters()]) - start)
    cos = float(torch.nn.functional.cosine_similarity(moves[0], moves[1], dim=0))
    ratio = float(moves[1].norm() / moves[0].norm())
    assert outs[1].get("amp_skipped", 0) == 0 and all(np.isfinite(v) for v in outs[1].values())
    assert cos > 0.99 and 0.95 < ratio < 1.05, (cos, ratio)
