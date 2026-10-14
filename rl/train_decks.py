"""IA spécialisées de plusieurs decks, l'une après l'autre ou plusieurs en même temps (README § 16).

    python train_decks.py --config gpu --decks all                     # les decks du registre, un par un
    python train_decks.py --config gpu --decks meta --parallel 2       # les decks du méta, deux à la fois
    python train_decks.py --config gpu --decks META-ROBIN-2026-10,ST-34 --max-updates 500

Chaque deck est un entraînement `train.py --deck <deck>` (dossiers checkpoints/deck-<deck>/ et logs/deck-<deck>/) :
un deck déjà commencé reprend où il s'était arrêté, un deck qui a atteint son nombre de mises à jour est passé ; la
même commande relancée reprend donc toute la file. Plusieurs à la fois (--parallel) : les cœurs du processeur sont
partagés (processus Node répartis), le débit total ne monte presque pas (~1,1 fois à deux) ; leurs messages vont dans
logs/deck-<deck>/console.txt, seules les étapes s'affichent ici.

Ctrl+C : chaque entraînement en cours finit sa mise à jour et sauvegarde, aucun autre deck n'est lancé.
"""
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from opcg_rl.config import load_config  # noqa: E402
from opcg_rl.paths import LOGS_DIR, RL_DIR  # noqa: E402
from opcg_rl.runtime import open_pool  # noqa: E402

GROUPS = {"meta": lambda d: d.startswith("META-"), "starter": lambda d: not d.startswith("META-"), "all": lambda d: True}


def main() -> int:
    p = argparse.ArgumentParser(description="IA spécialisées de plusieurs decks", allow_abbrev=False)
    p.add_argument("--decks", required=True,
                   help="all (tous les decks du registre), meta (decks du méta), starter (decks pour débutant), ou "
                        "liste séparée par des virgules (ex. META-ROBIN-2026-10,ST-34)")
    p.add_argument("--parallel", type=int, default=1, help="entraînements en même temps (2 au plus : au-delà, le processeur est partagé sans gain)")
    p.add_argument("--max-updates", type=int, help="mises à jour par deck (défaut : train.max_updates de config/deck.yaml)")
    p.add_argument("--workers", help="processus Node par entraînement (défaut : cœurs - 1, répartis entre eux)")
    p.add_argument("--config", action="append", default=[], help="réglages passés à train.py (ex. gpu)")
    p.add_argument("--set", action="append", default=[], metavar="CLÉ=VALEUR", help="réglage passé à train.py")
    args = p.parse_args()

    cfg = load_config([*args.config, "deck"], args.set)
    pool = open_pool(cfg, 1, 1)
    registry = list(pool.spec.decks)
    pool.close()
    if args.decks in GROUPS:
        decks = [d for d in registry if GROUPS[args.decks](d)]
    else:
        decks = [d.strip() for d in args.decks.split(",") if d.strip()]
        unknown = [d for d in decks if d not in registry]
        if unknown:
            p.error(f"deck(s) inconnu(s) : {', '.join(unknown)} ; decks du registre : {', '.join(registry)}")
    parallel = max(1, min(args.parallel, len(decks)))
    workers = args.workers or str(max(1, ((os.cpu_count() or 2) - 1) // parallel))
    common = [a for c in args.config for a in ("--config", c)] + [a for s in args.set for a in ("--set", s)]
    if args.max_updates:
        common += ["--max-updates", str(args.max_updates)]
    print(f"{len(decks)} deck(s) : {', '.join(decks)} ; {parallel} à la fois, {workers} processus Node chacun")

    stop = {"flag": False}

    def on_signal(signum, frame):
        if not stop["flag"]:
            print("Arrêt demandé : les entraînements en cours sauvegardent, aucun autre deck n'est lancé.", flush=True)
        stop["flag"] = True       # Ctrl+C arrive aussi aux entraînements (même console) : ils sauvegardent seuls

    signal.signal(signal.SIGINT, on_signal)
    queue = list(decks)
    running: dict[str, tuple[subprocess.Popen, object]] = {}
    failed: list[str] = []
    while queue or running:
        while queue and len(running) < parallel and not stop["flag"]:
            deck = queue.pop(0)
            cmd = [sys.executable, str(RL_DIR / "train.py"), *common, "--deck", deck, "--workers", workers]
            out = None
            if parallel > 1:
                log = LOGS_DIR / f"deck-{deck}" / "console.txt"
                log.parent.mkdir(parents=True, exist_ok=True)
                out = open(log, "ab")
            print(f"{time.strftime('%H:%M:%S')} {deck} : lancé" + (f" (messages : {out.name})" if out else ""), flush=True)
            running[deck] = (subprocess.Popen(cmd, cwd=str(RL_DIR), stdout=out, stderr=subprocess.STDOUT if out else None), out)
        for deck, (proc, out) in list(running.items()):
            code = proc.poll()
            if code is None:
                continue
            del running[deck]
            if out:
                out.close()
            if code != 0 and not stop["flag"]:
                failed.append(deck)
            what = {0: "terminé", 130: "interrompu (point de sauvegarde écrit)"}.get(code, f"arrêté avec le code {code}")
            print(f"{time.strftime('%H:%M:%S')} {deck} : {what} ; journal : {LOGS_DIR / f'deck-{deck}' / 'train.log'}", flush=True)
        if stop["flag"] and not running:
            break
        time.sleep(1)
    if failed:
        print(f"Entraînement(s) arrêté(s) sur une erreur : {', '.join(failed)} (voir leur train.log)")
        return 1
    if stop["flag"]:
        print("Pour reprendre la file : la même commande.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
