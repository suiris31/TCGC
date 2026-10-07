// Parties du jeu (onglet Jouer) : chaque partie appartient à un compte. La partie complète (état de départ, coups des
// deux joueurs, analyses du coach...) est gardée compressée ; son résumé léger sert à la liste « Mes parties », à la
// progression et au bilan des victoires.
import zlib from 'node:zlib';
import { db } from './db.js';

export const RECORD_ID = /^[\w-]{1,120}$/;
const HEAVY = ['initial', 'steps', 'log'];
const STATUSES = ['playing', 'won', 'lost', 'abandoned'];
// Taille maximale d'une partie une fois décompressée (une partie fait environ 130 Ko) : protège des envois piégés
const MAX_JSON = 20 * 1024 * 1024;

function invalid(message) {
  return Object.assign(new Error(message), { code: 'invalid_record', status: 400, expose: true });
}

// Corps de la requête d'enregistrement : la partie en JSON, compressée (gzip) ou non
export function readRecordBody(buffer, gzipped) {
  let text;
  try {
    text = (gzipped ? zlib.gunzipSync(buffer, { maxOutputLength: MAX_JSON }) : buffer).toString('utf8');
  } catch {
    throw invalid('Partie illisible');
  }
  if (text.length > MAX_JSON) throw invalid('Partie trop volumineuse');
  try {
    return { rec: JSON.parse(text), text };
  } catch {
    throw invalid('Partie illisible');
  }
}

// Enregistre (ou met à jour) une partie. Une version plus ancienne que celle déjà enregistrée est ignorée (envois en
// retard de la file de secours du navigateur).
export function saveRecord(userId, id, rec, text) {
  if (!RECORD_ID.test(id)) throw invalid('Identifiant de partie invalide');
  if (!rec || typeof rec !== 'object' || rec.id !== id) throw invalid('Identifiant incohérent');
  if (typeof rec.format !== 'number' || !STATUSES.includes(rec.status) || typeof rec.startedAt !== 'string'
    || typeof rec.updatedAt !== 'string' || !rec.config || typeof rec.config !== 'object') {
    throw invalid("Ce fichier n'est pas une partie");
  }
  const summary = { ...rec };
  for (const key of HEAVY) delete summary[key];
  db.prepare(`INSERT INTO game_records (user_id, id, mode, status, summary, record, started_at, updated_at)
    VALUES (?, ?, 'solo', ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET status = excluded.status, summary = excluded.summary, record = excluded.record,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= game_records.updated_at`)
    .run(userId, id, rec.status, JSON.stringify(summary), zlib.gzipSync(text), rec.startedAt, rec.updatedAt);
}

// Résumés de toutes les parties d'un compte, de la plus ancienne à la plus récente (texte JSON prêt à envoyer)
export function recordSummariesJson(userId) {
  const rows = db.prepare('SELECT summary FROM game_records WHERE user_id = ? ORDER BY started_at').all(userId);
  return `[${rows.map((r) => r.summary).join(',')}]`;
}

// Partie complète, compressée (gzip)
export function recordBlob(userId, id) {
  const row = db.prepare('SELECT record FROM game_records WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? Buffer.from(row.record) : null;
}
