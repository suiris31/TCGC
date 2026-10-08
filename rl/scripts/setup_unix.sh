#!/usr/bin/env bash
# Installation de l'entraînement sous Linux ou macOS, depuis le dossier rl/ :
#   bash scripts/setup_unix.sh
# Crée l'environnement Python rl/.venv, installe PyTorch (CUDA sous Linux si une carte NVIDIA est détectée, MPS sur Mac
# Apple Silicon) et les autres dépendances, installe les dépendances Node du simulateur et télécharge le catalogue des
# cartes s'il manque.
set -euo pipefail
RL="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$RL")"
cd "$RL"
command -v node >/dev/null || { echo "Node.js introuvable : installe Node.js 22.18 ou plus récent (https://nodejs.org)"; exit 1; }
PY=$(command -v python3 || command -v python || true)
[ -n "$PY" ] || { echo "Python 3.10+ introuvable"; exit 1; }
echo "Node.js $(node --version), $($PY --version)"
[ -d .venv ] || "$PY" -m venv .venv
VPY="$RL/.venv/bin/python"
"$VPY" -m pip install --upgrade pip
if [ "$(uname)" = "Linux" ] && command -v nvidia-smi >/dev/null; then
  echo "Carte NVIDIA détectée : PyTorch avec CUDA (paquet par défaut de PyPI sous Linux)"
  "$VPY" -m pip install torch
elif [ "$(uname)" = "Linux" ]; then
  echo "Pas de carte NVIDIA : PyTorch pour processeur (plus léger)"
  "$VPY" -m pip install torch --index-url https://download.pytorch.org/whl/cpu || "$VPY" -m pip install torch
else
  "$VPY" -m pip install torch
fi
"$VPY" -m pip install -r requirements.txt
cd "$REPO"
npm install
[ -f data/game-catalog.json ] || npm run game:cards
cd "$RL"
"$VPY" -c "import torch; print('PyTorch', torch.__version__, '| CUDA :', torch.cuda.is_available(), '| MPS :', torch.backends.mps.is_available())"
echo
echo "Installation terminée. Active l'environnement :  source .venv/bin/activate"
echo "puis :  python benchmark.py   (mesure)   et   python train.py   (entraînement)"
