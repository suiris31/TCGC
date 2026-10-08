"""Export du modèle entraîné au format ONNX, avec vérification de l'équivalence, puis installation dans le simulateur.

    python export_onnx.py --checkpoint opcg                 # rl/models/opcg/model.onnx + model.json, vérifiés
    python export_onnx.py --checkpoint opcg --install       # et copie dans web/public/rl-model/ (niveau « IA entraînée »)

Vérifications :
1. PyTorch contre ONNX Runtime (Python) sur des observations de vraies parties : écarts des probabilités et de la
   valeur, même option préférée ;
2. le code du navigateur (game/ai/rl.ts + onnxruntime-web, exécuté dans Node par game/rl/check-onnx.ts) joue
   quelques parties ; les mêmes parties sont rejouées ici avec PyTorch : mêmes options, mêmes probabilités.
L'export est refusé si un écart dépasse la tolérance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.config import load_config  # noqa: E402
from opcg_rl.envpool import check_node_version  # noqa: E402
from opcg_rl.model import masked_distribution  # noqa: E402
from opcg_rl.obs import onnx_feeds  # noqa: E402
from opcg_rl.paths import CHECK_ONNX_SCRIPT, MODELS_DIR, REPO_ROOT, WEB_MODEL_DIR, catalog_path, node_executable  # noqa: E402
from opcg_rl.runtime import agent_from_checkpoint, open_pool, resolve_checkpoint  # noqa: E402

INPUTS = ["a_static", "a_dyn", "a_ids", "a_mask", "p_static", "p_dyn", "p_ids", "p_group", "p_mask", "glob", "opt", "ptr", "opt_mask"]
TOL = 1e-4


def export(model: torch.nn.Module, spec, path: Path) -> str:
    model.eval()
    Na, Np, A = 12, 7, 5
    example = (torch.zeros(1, Na, spec.static_dim), torch.zeros(1, Na, spec.dyn_dim), torch.zeros(1, Na, dtype=torch.long),
               torch.ones(1, Na), torch.zeros(1, Np, spec.static_dim), torch.zeros(1, Np, spec.dyn_dim),
               torch.zeros(1, Np, dtype=torch.long), torch.ones(1, Np, dtype=torch.long), torch.ones(1, Np),
               torch.zeros(1, spec.glob_dim), torch.zeros(1, A, spec.opt_dim), torch.full((1, A, 2), -1, dtype=torch.long),
               torch.ones(1, A))
    axes = {n: {0: "batch", 1: "cards"} for n in INPUTS[:4]}
    axes.update({n: {0: "batch", 1: "pooled"} for n in INPUTS[4:9]})
    axes.update({"glob": {0: "batch"}, "opt": {0: "batch", 1: "options"}, "ptr": {0: "batch", 1: "options"},
                 "opt_mask": {0: "batch", 1: "options"}, "logits": {0: "batch", 1: "options"}, "value": {0: "batch"}})
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            torch.onnx.export(model, example, str(path), input_names=INPUTS, output_names=["logits", "value"],
                              dynamic_axes=axes, opset_version=17, dynamo=False)
            return "torchscript"
        except Exception as err:  # exportateur classique absent (versions futures de PyTorch) : celui de torch.export
            print(f"(exportateur classique indisponible : {err} ; essai avec torch.export)")
            B, Nd, Pd, Ad = torch.export.Dim("batch"), torch.export.Dim("cards"), torch.export.Dim("pooled"), torch.export.Dim("options")
            shapes = {n: {0: B, 1: Nd} for n in INPUTS[:4]}
            shapes.update({n: {0: B, 1: Pd} for n in INPUTS[4:9]})
            shapes.update({"glob": {0: B}, "opt": {0: B, 1: Ad}, "ptr": {0: B, 1: Ad}, "opt_mask": {0: B, 1: Ad}})
            torch.onnx.export(model, example, str(path), input_names=INPUTS, output_names=["logits", "value"],
                              dynamic_shapes=shapes, opset_version=18, dynamo=True)
            return "dynamo"


def collect_observations(pool, agent, count: int, seed: int) -> list:
    """Observations de vraies parties (modèle contre heuristique), pour comparer PyTorch et ONNX Runtime."""
    rng = np.random.default_rng(seed)
    decks = list(pool.spec.decks)
    out = []
    env = 0
    results = pool.run(resets=[{"env": env, "seed": 2 ** 30 + 5000 + seed, "decks": [decks[0], decks[-1]],
                                "seats": [{"kind": "agent"}, {"kind": "heuristic"}]}])
    games = 0
    while len(out) < count and games < 50:
        r = results[0]
        if r.done:
            games += 1
            d = [decks[games % len(decks)], decks[(games * 5 + 1) % len(decks)]]
            results = pool.run(resets=[{"env": env, "seed": 2 ** 30 + 5000 + seed + games, "decks": d,
                                        "seats": [{"kind": "agent"}, {"kind": "heuristic"}]}])
            continue
        o = r.obs[0]
        out.append(o)
        a, _, _, _ = agent.act([o], rng)
        results = pool.run(actions=[{"env": env, "index": a[0]}])
    return out


def compare_onnxruntime(agent, path: Path, observations: list) -> dict:
    import onnxruntime as ort
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    worst_p = worst_v = 0.0
    same = 0
    for o in observations:
        batch = agent.collate([o])
        with torch.no_grad():
            logits, value = agent.forward(batch)
        p, _ = masked_distribution(logits, batch["opt_mask"])
        feeds = {k: v.cpu().numpy() for k, v in onnx_feeds(agent.collate.static, batch).items()}
        ol, ov = sess.run(None, feeds)
        oe = np.exp(ol - ol.max(-1, keepdims=True))
        op = oe / oe.sum(-1, keepdims=True)
        tp = p.cpu().numpy()
        worst_p = max(worst_p, float(np.abs(op - tp).max()))
        worst_v = max(worst_v, float(np.abs(ov - value.cpu().numpy()).max()))
        same += int(np.argmax(op[0, :o.a]) == np.argmax(tp[0, :o.a]))
    return {"observations": len(observations), "max_prob_diff": worst_p, "max_value_diff": worst_v,
            "same_best_option": same / max(1, len(observations))}


def compare_browser(agent, pool, model_dir: Path, games: int, env: dict) -> dict:
    out = model_dir / "check-browser.json"
    node = node_executable(env.get("node"))
    check_node_version(node)
    cmd = [node, "--no-warnings", str(CHECK_ONNX_SCRIPT), str(model_dir), str(out), "--games", str(games),
           "--catalog", str(catalog_path(env.get("catalog")))]
    subprocess.run(cmd, cwd=str(REPO_ROOT), check=True)
    data = json.loads(out.read_text(encoding="utf-8"))
    worst = 0.0
    worst_v = 0.0
    decisions = 0
    mismatched_options = 0
    for g in data["games"]:
        results = pool.run(resets=[{"env": 0, "seed": g["seed"], "decks": g["decks"], "first": "random",
                                    "seats": [{"kind": "agent"}, {"kind": "heuristic"}]}])
        for step in g["steps"]:
            r = results[0]
            assert not r.done, "la partie rejouée s'est arrêtée trop tôt"
            o = r.obs[0]
            if o.a != len(step["options"]):
                mismatched_options += 1
            batch = agent.collate([o])
            with torch.no_grad():
                logits, value = agent.forward(batch)
            p, _ = masked_distribution(logits, batch["opt_mask"])
            tp = p[0, :o.a].cpu().numpy()
            worst = max(worst, float(np.abs(tp - np.array(step["probs"])).max()))
            worst_v = max(worst_v, abs(float(value[0]) - step["value"]))
            decisions += 1
            results = pool.run(actions=[{"env": 0, "index": step["index"]}])
        assert results[0].done and results[0].winner == g["winner"], "la partie rejouée n'a pas la même fin"
    return {"games": len(data["games"]), "decisions": decisions, "max_prob_diff": worst, "max_value_diff": worst_v,
            "option_mismatches": mismatched_options, "browser_ms_per_decision": data["msPerDecision"]}


def main() -> int:
    p = argparse.ArgumentParser(description="Export ONNX du modèle, vérification et installation dans le simulateur")
    p.add_argument("--checkpoint", required=True, help="point de sauvegarde (.pt) ou nom d'entraînement")
    p.add_argument("--name", help="nom du modèle exporté (défaut : nom de l'entraînement)")
    p.add_argument("--out", help="dossier de sortie (défaut : rl/models/<nom>)")
    p.add_argument("--samples", type=int, default=300, help="observations comparées PyTorch / ONNX Runtime")
    p.add_argument("--browser-games", type=int, default=3, help="parties jouées par le code du navigateur (0 : pas de vérification)")
    p.add_argument("--install", action="store_true", help="copier le modèle dans web/public/rl-model/ pour le simulateur")
    p.add_argument("--force", action="store_true", help="installer même un modèle entraîné sur le catalogue synthétique")
    p.add_argument("--config", action="append", default=[])
    p.add_argument("--set", action="append", default=[])
    args = p.parse_args()
    cfg = load_config(args.config, args.set)
    path = resolve_checkpoint(args.checkpoint)
    name = args.name or path.parent.name
    out_dir = (Path(args.out) if args.out else MODELS_DIR / name).resolve()   # absolu : Node tourne depuis la racine
    out_dir.mkdir(parents=True, exist_ok=True)
    pool = open_pool(cfg, 1, 1)
    try:
        agent, ckpt = agent_from_checkpoint(path, pool.spec, torch.device("cpu"), name)
        agent.model.eval()
        onnx_path = out_dir / "model.onnx"
        exporter = export(agent.model, pool.spec, onnx_path)
        size = onnx_path.stat().st_size
        print(f"Export ONNX ({exporter}) : {onnx_path} ({size / 1024:.0f} Kio)")
        state = ckpt.get("state", {})
        info = {
            "name": name, "createdAt": time.strftime("%Y-%m-%d %H:%M:%S"), "specHash": pool.spec.spec_hash,
            "encodingVersion": pool.spec.encoding_version, "engine": ckpt.get("engine", pool.spec.engine),
            "synthetic": bool(ckpt.get("synthetic", pool.spec.synthetic)), "vocab": ckpt["vocab"],
            "modelConfig": ckpt["model_config"], "inputs": INPUTS, "outputs": ["logits", "value"],
            "training": {"checkpoint": str(path.relative_to(REPO_ROOT)) if path.is_relative_to(REPO_ROOT) else str(path),
                         "update": state.get("update"), "games": state.get("games"), "level": state.get("level"),
                         "gateHistory": state.get("gate_history", [])[-3:]},
            "sha256": hashlib.sha256(onnx_path.read_bytes()).hexdigest(),
        }
        (out_dir / "model.json").write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding="utf-8")
        obs = collect_observations(pool, agent, args.samples, seed=1)
        check = {"onnxruntime": compare_onnxruntime(agent, onnx_path, obs)}
        print(f"PyTorch / ONNX Runtime : {json.dumps(check['onnxruntime'])}")
        ok = check["onnxruntime"]["max_prob_diff"] < TOL and check["onnxruntime"]["max_value_diff"] < TOL
        if args.browser_games:
            check["browser"] = compare_browser(agent, pool, out_dir, args.browser_games, cfg["env"])
            print(f"PyTorch / navigateur (onnxruntime-web) : {json.dumps(check['browser'])}")
            ok = (ok and check["browser"]["max_prob_diff"] < TOL and check["browser"]["max_value_diff"] < TOL
                  and check["browser"]["option_mismatches"] == 0)
        info["check"] = check
        (out_dir / "model.json").write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding="utf-8")
    finally:
        pool.close()
    if not ok:
        print(f"ÉCHEC de la vérification (tolérance {TOL}) : modèle non installé.")
        return 1
    print("Vérification réussie : le modèle ONNX prend les mêmes décisions que le modèle PyTorch.")
    if args.install:
        if info["synthetic"] and not args.force:
            print("Modèle entraîné sur le catalogue SYNTHÉTIQUE : pas installé dans le simulateur (--force pour le faire quand même).")
            return 1
        WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(onnx_path, WEB_MODEL_DIR / "model.onnx")
        shutil.copyfile(out_dir / "model.json", WEB_MODEL_DIR / "model.json")
        print(f"Installé dans {WEB_MODEL_DIR} : le simulateur propose le niveau « IA entraînée » (après `npm run build` en production).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
