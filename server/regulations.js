// Cartes bannies / limitées en tournoi officiel, depuis la page officielle française
// (fr.onepiece-cardgame.com/news/restriction.html), vérifiée à chaque mise à jour des prix.
// Un bannissement fait souvent chuter le prix d'une carte dès l'annonce : l'appli le signale sur la fiche et
// prévient (notification) ceux qui ont la carte ou la cherchent. La première lecture remplit la liste sans alerter.
import { db, getMeta, setMeta, transaction } from './db.js';

const URL = 'https://fr.onepiece-cardgame.com/news/restriction.html';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (TCGC personal collection)' };
const CODE_RE = /\b(?:[A-Z]{2,4}\d{2}-\d{3}|P-\d{3})\b/g;
const MONTHS = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

// "24 septembre 2026", "1er octobre 2026" -> "2026-09-24"
function frDate(text) {
  const m = text.match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i);
  const month = m && MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

// Texte de la page, une ligne par élément
function textLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .split('\n')
    .map((l) => l.replace(/[​\s]+/g, ' ').trim())
    .filter(Boolean);
}

// Liste en vigueur : la première section « Cartes bannies/limitées applicables à partir du ... », jusqu'à la
// section suivante (listes précédentes). Les cartes de l'annonce (avant « précédemment ») ont sa date.
// -> { effective, entries: Map(numéro -> { status: 'banned' | 'restricted' | 'pair', announced }) }
export function parseRegulations(html) {
  const lines = textLines(html);
  const start = lines.findIndex((l) => /applicables/i.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /applicables/i.test(l));
  if (end < 0) end = lines.length;
  const effective = frDate(`${lines[start]} ${lines[start + 1] ?? ''}`);
  const entries = new Map();
  let announced = null;
  let previous = false;
  let status = null;
  for (const line of lines.slice(start + 1, end)) {
    if (/^Annonce du/i.test(line)) announced = frDate(line);
    if (/précédemment/i.test(line)) previous = true;
    if (/^Cartes bannies\b(?!\/)/i.test(line)) status = 'banned';
    else if (/^Cartes limitées/i.test(line)) status = 'restricted';
    else if (/^Paires bannies/i.test(line)) status = 'pair';
    for (const code of line.match(CODE_RE) ?? []) {
      if (status && !entries.has(code)) entries.set(code, { status, announced: previous ? null : announced });
    }
  }
  return { effective, entries };
}

// Met à jour la table regulations ; renvoie le nombre de cartes nouvellement bannies ou limitées
export async function syncRegulations({ log = console.log } = {}) {
  const res = await fetch(URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`${URL} -> HTTP ${res.status}`);
  const parsed = parseRegulations(await res.text());
  if (!parsed?.entries.size) {
    log('Cartes bannies : page officielle non reconnue, liste inchangée');
    return 0;
  }
  const today = new Date().toISOString().slice(0, 10);
  // première lecture : on enregistre la liste sans alerter personne
  const seed = !getMeta('regulations_seeded');
  const current = new Map(db.prepare('SELECT number, status FROM regulations').all().map((r) => [r.number, r.status]));
  const upsert = db.prepare(`INSERT INTO regulations (number, status, announced, effective, first_seen, notified) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(number) DO UPDATE SET status = excluded.status, announced = excluded.announced, effective = excluded.effective,
      first_seen = excluded.first_seen, notified = excluded.notified`);
  let added = 0;
  transaction(() => {
    for (const [number, { status, announced }] of parsed.entries) {
      if (current.get(number) === status) continue;
      upsert.run(number, status, announced ?? (seed ? null : today), parsed.effective, today, seed ? 1 : 0);
      if (!seed) added++;
    }
    // cartes retirées de la liste (bannissement levé)
    const removed = [...current.keys()].filter((n) => !parsed.entries.has(n));
    for (const number of removed) db.prepare('DELETE FROM regulations WHERE number = ?').run(number);
    setMeta('regulations_seeded', '1');
    setMeta('regulations_checked', today);
  });
  if (added) log(`Cartes bannies / limitées : ${added} nouvelle(s) carte(s)`);
  return added;
}
