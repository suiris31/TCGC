"""Apprentissage par renforcement pour le simulateur One Piece TCG (dossier game/ du dépôt).

Le moteur de règles reste celui du simulateur (TypeScript, game/engine/) : des processus Node le font tourner
(game/rl/server.ts) et ce paquet Python les pilote, entraîne le modèle (PyTorch), l'évalue et l'exporte (ONNX).
"""

__version__ = "1.0.0"


def _safe_console() -> None:
    """Windows : quand la sortie n'est pas une vraie console (Git Bash, redirection vers un fichier, Tee-Object),
    Python écrit en cp1252, qui n'a pas certains caractères des messages (π, ≈, →...) : ils deviennent « ? » au lieu
    d'arrêter le programme."""
    import sys
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:      # flux remplacé (tests, notebook) : rien à faire
            pass


_safe_console()
