#!/usr/bin/env bash
# Met à jour TCGC depuis GitHub et redémarre le service : sudo bash /opt/tcgc/app/deploy/update.sh
set -euo pipefail
cd /opt/tcgc/app
sudo -u tcgc npm run backup
sudo -u tcgc git pull --ff-only
sudo -u tcgc npm ci --no-audit --no-fund
sudo -u tcgc npm run build
systemctl restart tcgc
systemctl --no-pager status tcgc | head -5
