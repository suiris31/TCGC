"""Apprentissage par renforcement pour le simulateur One Piece TCG (dossier game/ du dépôt).

Le moteur de règles reste celui du simulateur (TypeScript, game/engine/) : des processus Node le font tourner
(game/rl/server.ts) et ce paquet Python les pilote, entraîne le modèle (PyTorch), l'évalue et l'exporte (ONNX).
"""

__version__ = "1.0.0"
