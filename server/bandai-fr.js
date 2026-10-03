// Cartes en français depuis la liste officielle Bandai (fr.onepiece-cardgame.com) : noms français et
// visuels VF, ajoutés à l'index de reconnaissance pour que les cartes françaises soient bien reconnues
// (le texte d'une carte VF diffère de la VO, ce qui gêne surtout les cartes Événement).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import { db, getMeta, setMeta, transaction } from './db.js';

const BASE = 'https://fr.onepiece-cardgame.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (TCGC personal collection)' };
const imagesDir = path.join(config.dataDir, 'images-fr');
fs.mkdirSync(imagesDir, { recursive: true });

export function frImagePath(imageId) {
  return path.join(imagesDir, `${imageId}.jpg`);
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&(?:apos|#0?39);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

export function parseCardList(html) {
  const cards = [];
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
    const imageId = m[1];
    const name = m[2].match(/<div class="cardName">([\s\S]*?)<\/div>/)?.[1];
    if (!name) continue;
    cards.push({ imageId, number: imageId.replace(/_[a-z]\d+$/i, ''), name: decodeHtml(name) });
  }
  return cards;
}

let running = null;

// Liste des cartes VF + téléchargement des visuels manquants. Rapide quand tout est déjà là.
export function syncFrench({ log = console.log, force = false } = {}) {
  running ??= doSync(log, force).finally(() => { running = null; });
  return running;
}

async function doSync(log, force) {
  const last = getMeta('fr_sync');
  const fresh = last && Date.now() - new Date(last).getTime() < 7 * 86400_000;
  if (!fresh || force) {
    const home = await getText(`${BASE}/cardlist/`);
    const series = [...home.matchAll(/<option value="(\d+)"[^>]*>([^<]*)/g)].map((m) => ({ id: m[1], name: decodeHtml(m[2]) }));
    log(`Cartes VF : ${series.length} séries sur le site officiel français...`);
    const all = [];
    for (const s of series) {
      const html = await getText(`${BASE}/cardlist/?series=${s.id}`);
      for (const card of parseCardList(html)) all.push({ ...card, series: s.name });
    }
    const upsert = db.prepare(`INSERT INTO fr_cards (image_id, number, name, series) VALUES (?, ?, ?, ?)
      ON CONFLICT(image_id) DO UPDATE SET number = excluded.number, name = excluded.name, series = excluded.series`);
    transaction(() => {
      for (const c of all) upsert.run(c.imageId, c.number, c.name, c.series);
      db.exec(`UPDATE cards SET name_fr = (SELECT f.name FROM fr_cards f WHERE f.number = cards.number ORDER BY f.image_id LIMIT 1)`);
    });
    setMeta('fr_sync', new Date().toISOString());
    log(`Cartes VF : ${all.length} visuels référencés`);
  }

  const missing = db.prepare('SELECT image_id FROM fr_cards ORDER BY image_id').all()
    .map((r) => r.image_id)
    .filter((id) => !fs.existsSync(frImagePath(id)));
  if (!missing.length) return;
  log(`Téléchargement de ${missing.length} visuels VF...`);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < missing.length) {
      const id = missing[next++];
      try {
        const res = await fetch(`${BASE}/images/cardlist/card/${id}.webp`, { headers: HEADERS });
        if (!res.ok) continue;
        // même taille que les miniatures TCGplayer
        await sharp(Buffer.from(await res.arrayBuffer())).resize(240, 335, { fit: 'fill' }).jpeg({ quality: 85 })
          .toFile(frImagePath(id));
      } catch {
        // visuel indisponible : ignoré
      }
    }
  }));
}

// Grand visuel VF (600 px) pour la fiche d'une carte, téléchargé à la première demande puis gardé en cache
const largeDir = path.join(config.dataDir, 'images-fr-large');

export async function frLargeImage(imageId) {
  const file = path.join(largeDir, `${imageId}.webp`);
  if (fs.existsSync(file)) return file;
  const res = await fetch(`${BASE}/images/cardlist/card/${imageId}.webp`, { headers: HEADERS });
  if (!res.ok) return null;
  fs.mkdirSync(largeDir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
