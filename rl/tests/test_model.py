"""Réseau : formes, masquage des options absentes, pointeurs, invariance à l'ordre des cartes, avantages GAE, Elo,
ligue, statistiques."""
from __future__ import annotations

import numpy as np
import torch

from opcg_rl.elo import fit_elo
from opcg_rl.league import League
from opcg_rl.model import ModelConfig, PolicyValueNet, masked_distribution
from opcg_rl.ppo import Decision, Stats, Traj, compute_gae

S, D, G, O = 12, 9, 7, 5


def make_model(**kw) -> PolicyValueNet:
    torch.manual_seed(0)
    cfg = ModelConfig(static_dim=S, dyn_dim=D, glob_dim=G, opt_dim=O, vocab_size=20, groups=4, count_index=0,
                      d_model=32, layers=2, heads=4, id_dropout=0.0, **kw)
    return PolicyValueNet(cfg).eval()


def batch(B=3, Na=6, Np=4, A=4, seed=0):
    g = torch.Generator().manual_seed(seed)
    a_mask = torch.ones(B, Na)
    a_mask[0, 4:] = 0
    p_mask = torch.ones(B, Np)
    p_mask[0, 2:] = 0
    opt_mask = torch.ones(B, A)
    if B > 1:
        opt_mask[1, 2:] = 0
    ptr = torch.randint(-1, Na + Np, (B, A, 2), generator=g)
    return {
        "a_static": torch.randn(B, Na, S, generator=g), "a_dyn": torch.rand(B, Na, D, generator=g),
        "a_ids": torch.randint(0, 21, (B, Na), generator=g), "a_mask": a_mask,
        "p_static": torch.randn(B, Np, S, generator=g), "p_dyn": torch.rand(B, Np, D, generator=g),
        "p_ids": torch.randint(0, 21, (B, Np), generator=g), "p_group": torch.randint(1, 4, (B, Np), generator=g),
        "p_mask": p_mask, "glob": torch.randn(B, G, generator=g), "opt": torch.randn(B, A, O, generator=g),
        "ptr": ptr, "opt_mask": opt_mask,
    }


def test_shapes_and_mask():
    m = make_model()
    b = batch()
    logits, value = m(**b)
    assert logits.shape == (3, 4) and value.shape == (3,)
    p, _ = masked_distribution(logits, b["opt_mask"])
    assert torch.allclose(p.sum(-1), torch.ones(3), atol=1e-5)
    assert p[1, 2:].abs().max() < 1e-6, "aucune probabilité sur une option absente"
    assert (value.abs() <= 1).all()


def test_padding_does_not_change_outputs():
    m = make_model()
    b = batch(B=1, Na=5, Np=3, A=3)
    b["ptr"] = torch.tensor([[[0, 1], [6, -1], [-1, -1]]])     # carte individuelle 0, carte résumée 1 (6 = 5 + 1)
    logits, value = m(**b)
    pad = {k: v.clone() for k, v in b.items()}
    for k, extra in (("a_static", (1, 2, S)), ("a_dyn", (1, 2, D))):
        pad[k] = torch.cat([b[k], torch.randn(*extra)], dim=1)
    pad["a_ids"] = torch.cat([b["a_ids"], torch.zeros(1, 2, dtype=torch.long)], 1)
    pad["a_mask"] = torch.cat([b["a_mask"], torch.zeros(1, 2)], 1)
    for k, extra in (("p_static", (1, 3, S)), ("p_dyn", (1, 3, D))):
        pad[k] = torch.cat([b[k], torch.randn(*extra)], dim=1)
    pad["p_ids"] = torch.cat([b["p_ids"], torch.zeros(1, 3, dtype=torch.long)], 1)
    pad["p_group"] = torch.cat([b["p_group"], torch.ones(1, 3, dtype=torch.long)], 1)
    pad["p_mask"] = torch.cat([b["p_mask"], torch.zeros(1, 3)], 1)
    pad["ptr"] = torch.tensor([[[0, 1], [8, -1], [-1, -1]]])   # cartes résumées décalées de 2 (remplissage)
    pad["opt"] = torch.cat([b["opt"], torch.randn(1, 2, O)], 1)
    pad["ptr"] = torch.cat([pad["ptr"], torch.full((1, 2, 2), -1)], 1)
    pad["opt_mask"] = torch.cat([b["opt_mask"], torch.zeros(1, 2)], 1)
    l2, v2 = m(**pad)
    assert torch.allclose(l2[:, :3], logits, atol=1e-5)
    assert torch.allclose(v2, value, atol=1e-5)


def test_card_order_invariance():
    """Permuter les cartes individuelles (et les pointeurs avec) ne change rien : le réseau voit un ensemble."""
    m = make_model()
    b = batch(B=1, Na=6, Np=3, A=4)
    b["a_mask"][:] = 1
    b["p_mask"][:] = 1
    logits, value = m(**b)
    perm = torch.tensor([5, 2, 0, 4, 1, 3])
    inv = torch.argsort(perm)
    q = dict(b)
    for k in ("a_static", "a_dyn", "a_ids", "a_mask"):
        q[k] = b[k][:, perm]
    p = b["ptr"]
    q["ptr"] = torch.where((p >= 0) & (p < 6), inv[p.clamp(0, 5)], p)
    l2, v2 = m(**q)
    assert torch.allclose(l2, logits, atol=1e-5) and torch.allclose(v2, value, atol=1e-5)


def test_table_forward_equals_feature_forward():
    """forward_table (entraînement : rangs dans la table) = forward (navigateur, ONNX : caractéristiques par carte)."""
    from opcg_rl.obs import onnx_feeds
    m = make_model()
    table = torch.randn(15, S)
    b = batch()
    idx = {"a_idx": torch.randint(0, 15, b["a_ids"].shape), "p_idx": torch.randint(0, 15, b["p_ids"].shape)}
    tb = {k: v for k, v in b.items() if k not in ("a_static", "p_static")} | idx
    l1, v1 = m.forward_table(table, **tb)
    l2, v2 = m(**onnx_feeds(table, tb))
    assert torch.allclose(l1, l2, atol=1e-5) and torch.allclose(v1, v2, atol=1e-5)


def test_collator_splits_and_remaps_pointers():
    from opcg_rl.obs import Collator, Obs
    table = np.random.default_rng(0).normal(size=(10, S)).astype(np.float32)
    col = Collator(table, np.arange(10), torch.device("cpu"))
    mk = lambda na, npool, ptr: Obs(np.arange(na + npool, dtype=np.int32) % 10, np.array([0] * na + [1] * npool, np.int32),
                                     np.zeros((na + npool, D), np.float32), np.zeros(G, np.float32), np.zeros((len(ptr), O), np.float32),
                                     np.array(ptr, np.int32))
    b = col([mk(3, 2, [[0, 4], [3, -1]]), mk(5, 1, [[5, 2]])])
    assert b["a_idx"].shape == (2, 5) and b["p_idx"].shape == (2, 2)
    # obs 0 : carte résumée 4 (= 2e résumée) -> 5 + 1 = 6 ; carte résumée 3 -> 5 + 0 = 5
    assert b["ptr"][0].tolist() == [[0, 6], [5, -1]]
    assert b["ptr"][1].tolist() == [[5, 2], [-1, -1]]
    assert b["p_mask"].tolist() == [[1, 1], [1, 0]]


def test_network_is_deterministic():
    """Aucun hasard dans le réseau, ni en évaluation ni en apprentissage (l'oubli des identifiants est dans les données)."""
    torch.manual_seed(1)
    m = make_model()
    b = batch()
    a, _ = m(**b)
    m.train()
    c, _ = m(**b)
    assert torch.equal(a, c)


def test_collator_applies_stored_id_mask():
    from opcg_rl.obs import Collator, Obs
    table = np.zeros((10, S), np.float32)
    col = Collator(table, np.arange(10), torch.device("cpu"))
    o = Obs(np.array([1, 2, 3, 4], np.int32), np.array([0, 0, 1, 1], np.int32), np.zeros((4, D), np.float32),
            np.zeros(G, np.float32), np.zeros((1, O), np.float32), np.array([[0, -1]], np.int32),
            id_keep=np.array([1, 0, 0, 1]))
    b = col([o])
    assert b["a_ids"].tolist() == [[1, 0]] and b["p_ids"].tolist() == [[0, 4]]
    o.id_keep = None
    assert col([o])["a_ids"].tolist() == [[1, 2]]


def _traj(n, reward, truncated=False):
    t = Traj("x", 0, [Decision(None, 0, 0.0, 0.0, 0) for _ in range(n)], reward, truncated)
    return t


def test_gae_terminal_reward_only():
    trajs = [_traj(3, 1.0), _traj(2, -1.0)]
    values = np.array([0.2, 0.4, 0.6, 0.0, -0.5], np.float32)
    adv, ret = compute_gae(trajs, values, gamma=1.0, lam=1.0)
    # λ = 1, γ = 1 : la cible de chaque décision est le résultat final de sa partie
    assert np.allclose(ret, [1, 1, 1, -1, -1])
    assert np.allclose(adv, ret - values)


def test_gae_truncated_bootstraps_without_reward():
    trajs = [_traj(2, 0.0, truncated=True)]
    values = np.array([0.1, 0.3], np.float32)
    adv, ret = compute_gae(trajs, values, gamma=1.0, lam=1.0)
    assert np.allclose(ret, [0.3, 0.3]), "partie tronquée : la valeur de la dernière décision, pas 0"


def test_elo_orders_players():
    res = [("a", "heuristic", 1.0)] * 30 + [("a", "heuristic", 0.0)] * 10 + [("heuristic", "random", 1.0)] * 38 + [("heuristic", "random", 0.0)] * 2
    elo = fit_elo(res)
    assert elo["heuristic"] == 1000
    assert elo["a"] > elo["heuristic"] > elo["random"]


def test_elo_ignores_self_games():
    res = [("a", "heuristic", 1.0)] * 30 + [("a", "heuristic", 0.0)] * 30
    assert fit_elo(res + [("a", "a", 1.0)] * 50)["a"] == fit_elo(res)["a"]


def test_league_keeps_pinned_and_purges_retired(tmp_path):
    league = League(tmp_path, max_snapshots=3)
    model = torch.nn.Linear(2, 2)
    for u in range(0, 70, 10):
        league.add(model, u, {}, keep={"u000010"})
    ids = [s.id for s in league.snapshots]
    assert len(ids) == 3
    assert "u000000" in ids and "u000010" in ids and "u000060" in ids, "repère, version épinglée et dernière gardées"
    retired = {s.id for s in league.retired}
    assert retired == {"u000020", "u000030", "u000040", "u000050"}
    # une version retirée encore en jeu reste chargeable ; les autres sont effacées du disque
    assert league.purge(in_use={"u000050"}) == ["u000020", "u000030", "u000040"]
    assert not (tmp_path / "u000020.pt").exists() and league.find("u000050") is not None
    assert league.find("u000020") is None


def test_stats_pool_winrate_aggregates_snapshots():
    st = Stats()
    st.by_opp["pool:u000025"] += [1.0] * 10
    st.by_opp["pool:u000050"] += [0.0] * 2
    out = st.summary()
    assert out["games/pool"] == 12 and abs(out["winrate/pool"] - 10 / 12) < 1e-9


def test_fused_attention_equals_export_path():
    m = make_model()
    b = batch()
    with torch.no_grad():
        l1, v1 = m(**b)
        for blk in m.blocks:
            blk.fused = False
        l2, v2 = m(**b)
    mask = b["opt_mask"] > 0
    assert torch.allclose(l1[mask], l2[mask], atol=1e-5) and torch.allclose(v1, v2, atol=1e-5)


def test_migration_keeps_the_policy_and_the_optimizer():
    from types import SimpleNamespace

    from opcg_rl.migrate import adapt, adapt_optimizer
    old = make_model()
    opt = torch.optim.Adam(old.parameters(), lr=1e-3)
    b = batch()
    l, v = old(**b)
    (l[b["opt_mask"] > 0].sum() + v.sum()).backward()
    opt.step()
    spec = SimpleNamespace(spec_hash="nouveau", opt_dim=O + 3, previous_specs=[{"specHash": "ancien", "optionDim": O}])
    weights, cfg, was = adapt(old.state_dict(), old.cfg.to_dict(), "ancien", spec)
    assert was == O and cfg["opt_dim"] == O + 3
    new = PolicyValueNet(ModelConfig(**cfg)).eval()
    new.load_state_dict(weights)
    wide = {**b, "opt": torch.cat([b["opt"], torch.randn(*b["opt"].shape[:2], 3)], dim=-1)}
    with torch.no_grad():
        l1, v1 = old.eval()(**b)
        l2, v2 = new(**wide)
    mask = b["opt_mask"] > 0
    assert torch.allclose(l1[mask], l2[mask], atol=1e-6) and torch.allclose(v1, v2, atol=1e-6), "même jeu au départ"
    opt2 = torch.optim.Adam(new.parameters(), lr=1e-3)
    opt2.load_state_dict(adapt_optimizer(opt.state_dict(), new, O))
    l3, v3 = new.train()(**wide)
    (l3[mask].sum() + v3.sum()).backward()
    opt2.step()
    assert new.opt[0].weight[:, O:].abs().sum() > 0, "les nouvelles colonnes apprennent"
    try:
        adapt(old.state_dict(), old.cfg.to_dict(), "inconnu", spec)
        raise AssertionError("encodage inconnu : refusé")
    except RuntimeError:
        pass


def test_migrated_adam_moves_new_columns_at_a_normal_pace():
    from types import SimpleNamespace

    from opcg_rl.migrate import adapt, adapt_optimizer
    old = make_model().train()
    lr = 1e-3
    opt = torch.optim.Adam(old.parameters(), lr=lr, eps=1e-5)
    batches = [batch(seed=k) for k in range(20)]
    for k in range(1500):                        # un optimiseur qui a déjà longtemps servi
        b = batches[k % 20]
        opt.zero_grad()
        l, v = old(**b)
        (l[b["opt_mask"] > 0].sum() + v.sum()).backward()
        opt.step()
    st = opt.state_dict()
    spec = SimpleNamespace(spec_hash="nouveau", opt_dim=O + 3, previous_specs=[{"specHash": "ancien", "optionDim": O}])
    weights, cfg, _ = adapt(old.state_dict(), old.cfg.to_dict(), "ancien", spec)
    new = PolicyValueNet(ModelConfig(**cfg)).train()
    new.load_state_dict(weights)
    opt2 = torch.optim.Adam(new.parameters(), lr=lr, eps=1e-5)
    opt2.load_state_dict(adapt_optimizer(st, new, O))
    for seed in range(10):
        b = batch(seed=100 + seed)
        b["opt"] = torch.cat([b["opt"], torch.randn(*b["opt"].shape[:2], 3)], dim=-1)
        before = new.opt[0].weight[:, O:].detach().clone()
        opt2.zero_grad()
        l, v = new(**b)
        (l[b["opt_mask"] > 0].sum() + v.sum()).backward()
        opt2.step()
        step = (new.opt[0].weight[:, O:].detach() - before).abs().max().item()
        assert step <= 2 * lr, f"pas {seed} : {step / lr:.1f} × lr sur les nouvelles colonnes"
