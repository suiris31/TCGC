// Reconnaissance de carte par similarité d'image : chaque visuel du catalogue est transformé en vecteur
// (embedding) par un modèle de vision qui tourne en local ; une photo est comparée à tous ces vecteurs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { env, pipeline, RawImage } from '@huggingface/transformers';
import { frImagePath, syncFrench } from './bandai-fr.js';
import { config } from './config.js';
import { db, transaction } from './db.js';
import { downloadMissingThumbs, thumbPath } from './images.js';
import { TCG_USD_SQL } from './valuation.js';

env.cacheDir = config.modelsDir;

// DINOv2 (petit modèle, ~90 Mo) : conçu pour retrouver des images semblables
const MODEL_ID = 'onnx-community/dinov2-small';
// À changer dès que le modèle ou le prétraitement change : l'index sera reconstruit automatiquement
const INDEX_NAME = 'scan-index-dinov2s-mask-v1';
const SIZE = 224;

let extractor = null;

function getExtractor() {
  extractor ??= pipeline('image-feature-extraction', MODEL_ID, { dtype: 'fp32' });
  return extractor;
}

// La plupart des visuels TCGplayer/Bandai portent un gros "SAMPLE" en travers du milieu de la carte, absent
// des vraies cartes. Sans précaution, une vraie photo ressemble davantage aux rares visuels sans filigrane.
// On floute donc cette bande partout (index et photos) pour que les deux se comparent à armes égales.
const BAND = { top: 0.42, height: 0.16 };

// L'image (photo ou visuel) est étirée en carré : même traitement pour l'index et pour les photos
async function toRawImage(input) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const top = Math.round(info.height * BAND.top);
  const height = Math.round(info.height * BAND.height);
  const band = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .extract({ left: 0, top, width: info.width, height })
    .blur(8)
    .raw()
    .toBuffer();
  band.copy(data, top * info.width * 3);
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

// Vecteur d'une image = token de classe + moyenne des patchs (meilleur que le token seul pour retrouver une image)
export async function embedImages(inputs) {
  const raws = await Promise.all(inputs.map(toRawImage));
  const out = await (await getExtractor())(raws);
  // last_hidden_state [B, T, D] : token 0 = CLS, les suivants = patchs de l'image
  const [batch, tokens, dim] = out.dims;
  const vectors = [];
  for (let b = 0; b < batch; b++) {
    const base = b * tokens * dim;
    const cls = normalize(new Float32Array(out.data.subarray(base, base + dim)));
    const mean = new Float32Array(dim);
    for (let t = 1; t < tokens; t++) {
      const off = base + t * dim;
      for (let d = 0; d < dim; d++) mean[d] += out.data[off + d];
    }
    normalize(mean);
    const v = new Float32Array(dim * 2);
    v.set(cls);
    v.set(mean, dim);
    vectors.push(normalize(v));
  }
  return vectors;
}

function normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}


// ---------- Index ----------
// Un vecteur par visuel : le visuel TCGplayer de chaque carte (source 'tcg') et, quand il existe, son visuel
// en français (source 'fr') rattaché à la même carte. Une carte peut donc avoir plusieurs vecteurs.

const files = {
  vectors: path.join(config.dataDir, `${INDEX_NAME}.bin`),
  ids: path.join(config.dataDir, `${INDEX_NAME}.json`),
};

let index = null;

function withLookups(raw) {
  const sources = raw.sources ?? raw.ids.map(() => 'tcg');
  // Position du visuel TCGplayer de chaque carte : sert à comparer deux cartes entre elles
  const tcgPos = new Map();
  sources.forEach((s, i) => { if (s === 'tcg') tcgPos.set(raw.ids[i], i); });
  return { ...raw, sources, frDone: raw.frDone ?? [], tcgPos };
}

export function loadIndex() {
  if (index || !fs.existsSync(files.ids)) return index;
  const meta = JSON.parse(fs.readFileSync(files.ids, 'utf8'));
  const buf = fs.readFileSync(files.vectors);
  const vectors = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  index = withLookups({ ...meta, vectors });
  return index;
}

function saveIndex({ ids, dim, sources, frDone, vectors }) {
  fs.writeFileSync(files.vectors, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  fs.writeFileSync(files.ids, JSON.stringify({ ids, dim, sources, frDone }));
  index = withLookups({ ids, dim, sources, frDone, vectors });
}

function appendToIndex(entries) {
  const current = index;
  const dim = current?.dim ?? entries[0].vector.length;
  const oldCount = current?.ids.length ?? 0;
  const vectors = new Float32Array((oldCount + entries.length) * dim);
  if (current) vectors.set(current.vectors);
  entries.forEach((e, i) => vectors.set(e.vector, (oldCount + i) * dim));
  saveIndex({
    ids: [...(current?.ids ?? []), ...entries.map((e) => e.productId)],
    sources: [...(current?.sources ?? []), ...entries.map((e) => e.source)],
    frDone: [...(current?.frDone ?? []), ...entries.filter((e) => e.imageId).map((e) => e.imageId)],
    dim,
    vectors,
  });
}

export function deleteIndex() {
  for (const file of Object.values(files)) fs.rmSync(file, { force: true });
  index = null;
}

export function indexStatus() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  return { indexed: loadIndex()?.tcgPos.size ?? 0, total, building: building !== null };
}

let building = null;

// Ajoute à l'index les cartes qui n'y sont pas encore (nouvelles extensions après une synchro)
export function buildIndex({ log = console.log, batchSize = 16 } = {}) {
  building ??= doBuildIndex(log, batchSize).finally(() => { building = null; });
  return building;
}

async function doBuildIndex(log, batchSize) {
  await downloadMissingThumbs({ log });
  loadIndex();
  const known = new Set(index?.tcgPos.keys() ?? []);
  const todo = db.prepare('SELECT product_id FROM cards ORDER BY product_id').all()
    .map((r) => r.product_id)
    .filter((id) => !known.has(id) && fs.existsSync(thumbPath(id)));
  if (todo.length) {
    log(`Index de reconnaissance : ${todo.length} cartes à analyser${index ? '' : ' (premier lancement : quelques minutes)'}...`);
    const started = Date.now();
    const entries = [];
    for (let i = 0; i < todo.length; i += batchSize) {
      const batch = todo.slice(i, i + batchSize);
      const vectors = await embedImages(batch.map(thumbPath));
      batch.forEach((productId, k) => entries.push({ productId, source: 'tcg', vector: vectors[k] }));
      if (i > 0 && (i / batchSize) % 50 === 0) log(`  ${i + batch.length}/${todo.length}`);
    }
    appendToIndex(entries);
    log(`Index prêt : ${index.tcgPos.size} cartes (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }

  try {
    await syncFrench({ log });
    await indexFrench(log, batchSize);
    if (db.prepare('SELECT 1 FROM fr_cards WHERE product_id IS NULL LIMIT 1').get()) saveFrenchMapping();
  } catch (err) {
    log(`Visuels VF indisponibles pour l'instant (${err.message})`);
  }
  return index;
}

// Rattache chaque visuel VF à la variante du catalogue qui a le même code et l'illustration la plus proche
async function indexFrench(log, batchSize) {
  const done = new Set(index.frDone);
  const todo = db.prepare('SELECT image_id, number FROM fr_cards ORDER BY image_id').all()
    .filter((r) => !done.has(r.image_id) && fs.existsSync(frImagePath(r.image_id)));
  if (!todo.length) return;

  const variants = new Map(); // code -> [{ productId, pos, common }]
  const rows = db.prepare(`SELECT c.product_id, c.number, c.variant, ${TCG_USD_SQL} AS price
    FROM cards c LEFT JOIN prices p ON p.product_id = c.product_id`).all();
  for (const r of rows) {
    const pos = index.tcgPos.get(r.product_id);
    if (pos === undefined) continue;
    if (!variants.has(r.number)) variants.set(r.number, []);
    variants.get(r.number).push({ productId: r.product_id, pos, variant: r.variant, price: r.price ?? Infinity });
  }

  log(`Index de reconnaissance : ${todo.length} visuels VF à analyser...`);
  const entries = [];
  let unmatched = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const vectors = await embedImages(batch.map((r) => frImagePath(r.image_id)));
    batch.forEach((r, k) => {
      const candidates = (variants.get(r.number) ?? [])
        .map((c) => ({ ...c, score: dot(vectors[k], c.pos) }))
        .sort((a, b) => b.score - a.score);
      // Illustration trop différente de toutes les versions connues : on ne rattache pas au hasard
      if (!candidates.length || candidates[0].score < MIN_FR_MATCH) {
        unmatched++;
        return;
      }
      // Versions quasi identiques (réimpressions...) : on rattache à la plus courante
      const close = candidates.filter((c) => c.score > candidates[0].score - 0.015);
      close.sort((a, b) => Number(a.variant !== null) - Number(b.variant !== null) || a.price - b.price);
      entries.push({ productId: close[0].productId, source: 'fr', imageId: r.image_id, vector: vectors[k] });
    });
    if (i > 0 && (i / batchSize) % 50 === 0) log(`  ${i + batch.length}/${todo.length}`);
  }
  if (entries.length) appendToIndex(entries);
  saveFrenchMapping();
  log(`Visuels VF : ${entries.length} ajoutés à la reconnaissance${unmatched ? `, ${unmatched} sans équivalent au catalogue` : ''}`);
}

// Recopie dans fr_cards la carte du catalogue à laquelle chaque visuel VF de l'index est rattaché
function saveFrenchMapping() {
  const frPositions = [];
  index.sources.forEach((s, i) => { if (s === 'fr') frPositions.push(i); });
  const update = db.prepare('UPDATE fr_cards SET product_id = ? WHERE image_id = ?');
  transaction(() => {
    frPositions.forEach((pos, k) => update.run(index.ids[pos], index.frDone[k]));
  });
}

// En dessous, un visuel VF ne ressemble vraiment à aucune version de son code dans le catalogue
const MIN_FR_MATCH = 0.6;

// ---------- Recherche ----------

function dot(query, pos) {
  const { dim, vectors } = index;
  let s = 0;
  const off = pos * dim;
  for (let d = 0; d < dim; d++) s += vectors[off + d] * query[d];
  return s;
}

function cosine(a, b) {
  const { dim, vectors } = index;
  let s = 0;
  for (let d = 0; d < dim; d++) s += vectors[a * dim + d] * vectors[b * dim + d];
  return s;
}

// Au-delà de ce seuil, deux visuels du catalogue sont quasi identiques (réimpression, version tamponnée...)
const SAME_ART = 0.95;

const CARD_RATIO = 63 / 88;

// On ne sait jamais exactement où est la carte dans l'image : on essaie plusieurs cadrages au format carte
// (plus l'image entière) et on garde le meilleur score de chaque carte.
// - 'photo' : photo entière prise avec l'appareil photo, la carte peut n'occuper que la moitié de l'image
//   et ne pas être centrée : les petits cadrages sont aussi essayés décalés (fraction de la taille de l'image)
// - 'guide' : image déjà recadrée sur le cadre de visée, la carte le remplit à peu près
const CROPS = {
  photo: { scales: [1, 0.85, 0.7, 0.55], shiftFrom: 0.7, shifts: [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]] },
  guide: { scales: [0.93, 0.86], shiftFrom: 0, shifts: [] },
};

async function cropsFor(image, mode) {
  const upright = await sharp(image).rotate().jpeg({ quality: 92 }).toBuffer();
  const { width, height } = await sharp(upright).metadata();
  const fitH = Math.min(height, width / CARD_RATIO);
  const { scales, shiftFrom, shifts } = CROPS[mode];
  const crops = [upright];
  for (const scale of scales) {
    const h = Math.round(fitH * scale);
    const w = Math.round(h * CARD_RATIO);
    if (w < 64 || h < 64) continue;
    const positions = [[0, 0], ...(scale <= shiftFrom ? shifts : [])];
    for (const [dx, dy] of positions) {
      const left = Math.round((width - w) / 2 + dx * width);
      const top = Math.round((height - h) / 2 + dy * height);
      if (left < 0 || top < 0 || left + w > width || top + h > height) continue;
      crops.push(await sharp(upright).extract({ left, top, width: w, height: h }).toBuffer());
    }
  }
  return crops;
}

export async function identify(image, { limit = 10, mode = 'guide' } = {}) {
  if (!loadIndex()) throw new Error("L'index de reconnaissance n'est pas encore construit");
  const queries = await embedImages(await cropsFor(image, mode));
  // Meilleur score de chaque carte, tous cadrages et tous visuels (VO/VF) confondus
  const best = new Map();
  for (let pos = 0; pos < index.ids.length; pos++) {
    let score = -1;
    for (const q of queries) score = Math.max(score, dot(q, pos));
    const productId = index.ids[pos];
    if (score > (best.get(productId) ?? -1)) best.set(productId, score);
  }
  const results = [...best].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([productId, score]) => ({ productId, score }));
  // Versions au visuel identique au meilleur résultat : la photo ne permet pas de les départager
  const [first] = results;
  const firstPos = index.tcgPos.get(first.productId);
  for (const r of results) {
    const pos = index.tcgPos.get(r.productId);
    r.sameArt = r === first || (pos !== undefined && firstPos !== undefined && cosine(firstPos, pos) > SAME_ART);
  }
  // Écart avec le premier visuel différent : plus il est faible, plus la reconnaissance est incertaine
  const rival = results.find((r) => !r.sameArt);
  const margin = rival ? first.score - rival.score : 1;
  return { matches: results, margin };
}
