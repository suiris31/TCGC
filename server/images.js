// Cache local des visuels de cartes (miniatures TCGplayer 200px), utilisés pour l'affichage
// dans les grilles et pour construire l'index de reconnaissance.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

fs.mkdirSync(config.imagesDir, { recursive: true });

export function thumbPath(productId) {
  return path.join(config.imagesDir, `${productId}.jpg`);
}

export function cdnImage(productId, size = '200w') {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`;
}

// Visuel absent chez TCGplayer : on le note pour ne pas réessayer à chaque démarrage (re-tentative après 3 jours)
function missingMarker(productId) {
  return path.join(config.imagesDir, `${productId}.missing`);
}

function knownMissing(productId) {
  try {
    return Date.now() - fs.statSync(missingMarker(productId)).mtimeMs < 3 * 86400_000;
  } catch {
    return false;
  }
}

export async function downloadThumb(productId) {
  const file = thumbPath(productId);
  if (fs.existsSync(file)) return file;
  if (knownMissing(productId)) return null;
  const res = await fetch(cdnImage(productId));
  if (res.status === 404 || res.status === 403) {
    fs.writeFileSync(missingMarker(productId), '');
    return null;
  }
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(`${file}.tmp`, buf);
  fs.renameSync(`${file}.tmp`, file);
  return file;
}

export async function downloadMissingThumbs({ log = console.log, concurrency = 8 } = {}) {
  const ids = db.prepare('SELECT product_id FROM cards ORDER BY product_id').all()
    .map((r) => r.product_id)
    .filter((id) => !fs.existsSync(thumbPath(id)) && !knownMissing(id));
  if (!ids.length) return 0;
  log(`Téléchargement de ${ids.length} visuels de cartes...`);
  let done = 0;
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await downloadThumb(id);
      } catch {
        // visuel indisponible : la carte sera juste absente de l'index de scan
      }
      if (++done % 500 === 0) log(`  ${done}/${ids.length}`);
    }
  }));
  return ids.length;
}
