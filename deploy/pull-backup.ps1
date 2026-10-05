# Sauvegarde hors du serveur : copie sur ce PC la dernière sauvegarde de la base TCGC faite par le serveur
# (deploy/tcgc.cron, chaque nuit à 4 h). À lancer à la main ou chaque jour par le Planificateur de tâches.
#
# Usage : powershell -NoProfile -ExecutionPolicy Bypass -File pull-backup.ps1 -Server ubuntu@mon-serveur
# Prérequis : connexion SSH par clé, sans mot de passe (voir README, « Sauvegarde hors du serveur »).
# La copie contient les comptes (e-mails, mots de passe hachés) : garde ce dossier pour toi.
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Remote = '/opt/tcgc/app/data/backups',
  [string]$Destination = (Join-Path $env:USERPROFILE 'Documents\TCGC-sauvegardes'),
  [int]$Keep = 14
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$log = Join-Path $Destination 'pull-backup.log'
function Write-Log($message) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Output $line
}

try {
  # BatchMode : échoue au lieu de demander un mot de passe (tâche sans surveillance)
  $latest = (ssh -o BatchMode=yes -o ConnectTimeout=20 $Server "ls -1t $Remote/tcgc-*.db 2>/dev/null | head -n 1")
  if ($LASTEXITCODE -ne 0 -or -not $latest) { throw "aucune sauvegarde trouvée dans $Remote sur $Server" }
  $latest = $latest.Trim()
  $name = Split-Path $latest -Leaf
  $target = Join-Path $Destination $name
  if (Test-Path $target) {
    Write-Log "déjà copiée : $name"
  } else {
    scp -o BatchMode=yes -o ConnectTimeout=20 "${Server}:$latest" "$target"
    if ($LASTEXITCODE -ne 0) { throw "copie de $name échouée" }
    Write-Log "copiée : $name ($([math]::Round((Get-Item $target).Length / 1MB, 1)) Mo)"
  }
  # On garde les $Keep plus récentes
  Get-ChildItem -Path $Destination -Filter 'tcgc-*.db' | Sort-Object Name -Descending | Select-Object -Skip $Keep |
    ForEach-Object { Remove-Item $_.FullName; Write-Log "supprimée (ancienne) : $($_.Name)" }
} catch {
  Write-Log "ERREUR : $($_.Exception.Message)"
  exit 1
}
