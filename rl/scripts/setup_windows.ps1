# Installation de l'entraînement sous Windows (PowerShell), depuis le dossier rl\ :
#   powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1
# Crée l'environnement Python rl\.venv, installe PyTorch (avec CUDA si une carte NVIDIA est détectée) et les autres
# dépendances, installe les dépendances Node du simulateur et télécharge le catalogue des cartes s'il manque.
$ErrorActionPreference = "Stop"
$rl = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $rl
Set-Location $rl

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "Introuvable : $cmd. $hint" -ForegroundColor Red; exit 1 }
}
Need "node" "Installe Node.js 22.18 ou plus récent : https://nodejs.org"
Need "npm" "Installe Node.js (npm est fourni avec) : https://nodejs.org"
$py = if (Get-Command "py" -ErrorAction SilentlyContinue) { "py" } elseif (Get-Command "python" -ErrorAction SilentlyContinue) { "python" } else { $null }
if (-not $py) { Write-Host "Python introuvable. Installe Python 3.10+ : https://www.python.org/downloads/ (coche « Add to PATH »)" -ForegroundColor Red; exit 1 }

Write-Host "Node.js $(node --version)"
if (-not (Test-Path ".venv")) {
  Write-Host "Création de l'environnement Python rl\.venv..."
  if ($py -eq "py") { py -3 -m venv .venv } else { python -m venv .venv }
}
$venvPy = Join-Path $rl ".venv\Scripts\python.exe"
& $venvPy -m pip install --upgrade pip

$gpu = $false
if (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue) { $gpu = $true }
if ($gpu) {
  Write-Host "Carte NVIDIA détectée : installation de PyTorch avec CUDA 12.6"
  & $venvPy -m pip install torch --index-url https://download.pytorch.org/whl/cu126
} else {
  Write-Host "Pas de carte NVIDIA détectée : PyTorch pour processeur"
  & $venvPy -m pip install torch
}
& $venvPy -m pip install -r requirements.txt

Write-Host "Dépendances Node du simulateur..."
Set-Location $repo
npm install
if (-not (Test-Path "data\game-catalog.json")) {
  Write-Host "Téléchargement du catalogue des cartes (listes officielles)..."
  npm run game:cards
}
Set-Location $rl
& $venvPy -c "import torch; print('PyTorch', torch.__version__, '| GPU CUDA :', torch.cuda.is_available())"
Write-Host ""
Write-Host "Installation terminée. Active l'environnement :  .venv\Scripts\Activate.ps1" -ForegroundColor Green
Write-Host "puis :  python benchmark.py   (mesure)   et   python train.py   (entraînement)" -ForegroundColor Green
