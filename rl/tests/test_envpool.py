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
    assert finished == pool.size
    assert all(r.winner in (0, 1) and not r.truncated and r.error is None for r in results if r.done)


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
