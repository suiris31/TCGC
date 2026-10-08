"""Parties en parallèle : plusieurs processus Node (game/rl/server.ts), chacun avec plusieurs environnements.

Chaque processus tourne sur son propre cœur ; Python envoie à tous les processus leurs commandes (choix du modèle,
nouvelles parties), puis lit leurs réponses (observations des sièges qui doivent décider). Protocole : voir le
commentaire en tête de game/rl/server.ts.
"""
from __future__ import annotations

import errno
import json
import struct
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .obs import Obs, split_batch
from .paths import REPO_ROOT, SERVER_SCRIPT, catalog_path, node_executable

_DTYPES = {"f32": np.float32, "i32": np.int32}


class EngineServerError(RuntimeError):
    pass


@dataclass
class Spec:
    """Spécification de l'encodage, envoyée par le serveur Node au démarrage."""
    spec_hash: str
    encoding_version: int
    engine: str
    catalog: str
    synthetic: bool
    static_dim: int
    dyn_dim: int
    glob_dim: int
    opt_dim: int
    groups: int
    cards: list[str]
    static_table: np.ndarray
    decks: dict[str, dict]
    feature_names: dict[str, list[str]] = field(default_factory=dict)

    def feature_index(self, kind: str, name: str) -> int:
        return self.feature_names[kind].index(name)


_checked_nodes: set[str] = set()


def check_node_version(node: str) -> None:
    """Node.js 22.18+ exécute directement le TypeScript du simulateur (sans compilation)."""
    if node in _checked_nodes:
        return
    out = subprocess.run([node, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    major, minor = (int(x) for x in out.lstrip("v").split(".")[:2])
    if (major, minor) < (22, 18):
        raise RuntimeError(f"Node.js {out} trop ancien : il faut Node.js 22.18 ou plus récent (https://nodejs.org)")
    _checked_nodes.add(node)


class NodeWorker:
    def __init__(self, node: str, catalog: Path, log_file: Path | None = None):
        self.log_file = log_file
        # le journal est partagé par les sessions successives : seule la partie écrite par celle-ci est montrée
        self.log_start = log_file.stat().st_size if log_file and log_file.exists() else 0
        self.log = open(log_file, "ab") if log_file else None
        # groupe de processus à part : Ctrl+C dans le terminal n'arrête que Python, qui sauvegarde puis ferme les
        # processus Node lui-même (et un processus Node s'arrête seul quand Python disparaît : fin de son entrée)
        isolate = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if sys.platform == "win32"
                   else {"start_new_session": True})
        self.proc = subprocess.Popen(
            [node, "--no-warnings", str(SERVER_SCRIPT), "--catalog", str(catalog)],
            cwd=str(REPO_ROOT), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=self.log if self.log else None, bufsize=0, **isolate,
        )

    def _died(self) -> EngineServerError:
        """Erreur « processus Node arrêté », avec la fin de ses messages d'erreur (fichier journal ou console)."""
        try:
            code = self.proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            code = None
        where = "ses messages sont affichés ci-dessus"
        if self.log_file:
            if self.log:
                self.log.flush()
            try:
                tail = self.log_file.read_bytes()[self.log_start:][-2000:].decode("utf-8", errors="replace").strip()
            except OSError:
                tail = ""
            where = f"journal : {self.log_file}" + (f"\n--- fin du journal ---\n{tail}" if tail else "")
        return EngineServerError(f"le processus Node s'est arrêté (code {code}) ; {where}")

    def send(self, cmd: dict) -> None:
        assert self.proc.stdin is not None
        try:
            self.proc.stdin.write((json.dumps(cmd, separators=(",", ":")) + "\n").encode("utf-8"))
            self.proc.stdin.flush()
        except BrokenPipeError as err:
            raise self._died() from err
        except OSError as err:
            # Windows : écrire vers un processus déjà arrêté donne EINVAL plutôt que BrokenPipeError
            if err.errno in (errno.EINVAL, errno.EPIPE):
                raise self._died() from err
            raise

    def _read_exact(self, n: int) -> bytes:
        assert self.proc.stdout is not None
        chunks = []
        left = n
        while left:
            chunk = self.proc.stdout.read(left)
            if not chunk:
                raise self._died()
            chunks.append(chunk)
            left -= len(chunk)
        return b"".join(chunks)

    def recv(self) -> tuple[dict, dict[str, np.ndarray]]:
        (size,) = struct.unpack("<I", self._read_exact(4))
        payload = self._read_exact(size)
        (head_len,) = struct.unpack_from("<I", payload, 0)
        header = json.loads(payload[4:4 + head_len].decode("utf-8"))
        if header.get("error"):
            raise EngineServerError(header["error"])
        at = 4 + head_len + ((4 - head_len % 4) % 4)
        buffers: dict[str, np.ndarray] = {}
        for name, dtype, count in header.get("buffers", []):
            nbytes = count * 4
            buffers[name] = np.frombuffer(payload, dtype=_DTYPES[dtype], count=count, offset=at)
            at += nbytes
        return header, buffers

    def request_close(self) -> None:
        """Demande l'arrêt sans attendre : fin de son entrée (un processus Node bloqué sur une réponse non lue
        n'écoute plus, d'où l'arrêt forcé de finish())."""
        try:
            self.send({"op": "close"})
        except Exception:
            pass
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
        except Exception:
            pass

    def finish(self, deadline: float) -> None:
        try:
            self.proc.wait(timeout=max(0.0, deadline - time.monotonic()))
        except Exception:
            self.proc.kill()
            try:
                self.proc.wait(timeout=2)
            except Exception:
                pass
        if self.log:
            self.log.close()
            self.log = None

    def close(self) -> None:
        self.request_close()
        self.finish(time.monotonic() + 5)


def close_workers(workers: list[NodeWorker], timeout: float = 5.0) -> None:
    """Ferme tous les processus Node : demande d'arrêt à tous, puis une seule attente commune (et non 5 s chacun)."""
    for w in workers:
        w.request_close()
    deadline = time.monotonic() + timeout
    for w in workers:
        w.finish(deadline)


@dataclass
class StepResult:
    env: int
    done: bool
    to_act: int | None
    winner: int | None
    truncated: bool
    error: str | None
    reason: str | None
    turns: int
    decisions: int
    record: str | None
    obs: list[Obs]
    first: int | None = None


class EnvPool:
    """`workers` processus Node × `envs_per_worker` environnements ; identifiant global = worker * envs + local."""

    def __init__(self, workers: int, envs_per_worker: int, node: str | None = None, catalog: str | None = None,
                 record_dir: Path | None = None, anomaly_dir: Path | None = None, log_dir: Path | None = None):
        self.workers_count = workers
        self.envs_per_worker = envs_per_worker
        node_path = node_executable(node)
        check_node_version(node_path)
        cat = catalog_path(catalog)
        if not cat.exists():
            raise FileNotFoundError(
                f"Catalogue des cartes absent : {cat}\nLance « npm run game:cards » à la racine du dépôt (il télécharge "
                "les listes officielles), ou indique un fichier avec env.catalog / OPCG_CATALOG.")
        if log_dir:
            log_dir.mkdir(parents=True, exist_ok=True)
        self.workers: list[NodeWorker] = []
        init = {"op": "init"}
        # chemins absolus : Node tourne depuis la racine du dépôt, pas depuis le dossier de la commande
        if record_dir:
            init["recordDir"] = str(Path(record_dir).resolve())
        if anomaly_dir:
            init["anomalyDir"] = str(Path(anomaly_dir).resolve())
        try:
            for w in range(workers):
                self.workers.append(NodeWorker(node_path, cat, (log_dir / f"node-{w}.log") if log_dir else None))
            for w in self.workers:
                w.send(init)
            replies = [w.recv() for w in self.workers]
        except BaseException:
            close_workers(self.workers)       # pas de processus Node orphelins si le démarrage échoue
            raise
        header, buffers = replies[0]
        s = header["spec"]
        self.spec = Spec(
            spec_hash=s["specHash"], encoding_version=s["encodingVersion"], engine=s["engine"], catalog=s["catalog"],
            synthetic=s["synthetic"], static_dim=s["staticDim"], dyn_dim=s["dynDim"], glob_dim=s["globalDim"],
            opt_dim=s["optionDim"], groups=s["groups"], cards=s["cards"],
            static_table=buffers["static"].reshape(len(s["cards"]), s["staticDim"]).copy(),
            decks={d["id"]: d for d in s["decks"]},
            feature_names={"static": s["staticFeatures"], "dyn": s["dynFeatures"], "global": s["globalFeatures"],
                           "option": s["optionFeatures"]},
        )

    @property
    def size(self) -> int:
        return self.workers_count * self.envs_per_worker

    def _split(self, env: int) -> tuple[int, int]:
        return env // self.envs_per_worker, env % self.envs_per_worker

    def run(self, actions: list[dict] | None = None, resets: list[dict] | None = None) -> list[StepResult]:
        """Applique des choix ({env, index, probs?, value?}) et commence des parties ({env, seed, decks, seats...})."""
        per: dict[int, dict] = {}
        for a in actions or []:
            w, local = self._split(a["env"])
            per.setdefault(w, {"op": "step", "actions": [], "resets": []})["actions"].append({**a, "env": local})
        for r in resets or []:
            w, local = self._split(r["env"])
            per.setdefault(w, {"op": "step", "actions": [], "resets": []})["resets"].append({**r, "env": local})
        for w, cmd in per.items():
            self.workers[w].send(cmd)
        results: list[StepResult] = []
        sp = self.spec
        for w in per:
            header, buffers = self.workers[w].recv()
            obs = split_batch(header, buffers, sp.dyn_dim, sp.glob_dim, sp.opt_dim)
            base = w * self.envs_per_worker
            for o in obs:
                o.env += base
            for r in header["results"]:
                results.append(StepResult(
                    env=r["env"] + base, done=r["done"], to_act=r["toAct"], winner=r["winner"], truncated=r["truncated"],
                    error=r["error"], reason=r["reason"], turns=r["turns"], decisions=r["decisions"], record=r.get("record"),
                    obs=[obs[k] for k in r["obs"]], first=r.get("first"),
                ))
        return results

    def close(self) -> None:
        close_workers(self.workers)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
