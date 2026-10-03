#!/usr/bin/env bash
# Met à jour TCGC depuis GitHub et redémarre le service : sudo bash /opt/tcgc/app/deploy/update.sh
# (sauvegarde la base avant, utilise le Node.js privé de /opt/tcgc/node)
set -euo pipefail
export PATH=/opt/tcgc/node/bin:$PATH
run() { sudo -H -u tcgc env PATH="$PATH" "$@"; }
cd /opt/tcgc/app
run npm run backup
run git pull --ff-only
run npm ci --no-audit --no-fund
run npm run build
systemctl restart tcgc
systemctl --no-pager status tcgc | head -5
