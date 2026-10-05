// Requêtes sur le catalogue et la collection, mises en forme pour l'API.
// viewer = { userId, source } : l'utilisateur connecté (sa collection) et sa source de prix
import { db, transaction } from './db.js';
import { cdnImage } from './images.js';
import { priceInsight } from './insight.js';
import { estimateEurSql, priceJoins, toEur, valueHistory } from './valuation.js';

// Langues dans lesquelles on peut posséder une carte
export const LANGS = ['fr', 'en'];

export function viewerOf(user) {
  return { userId: user.id, source: user.price_source };
}

// Identifiant d'utilisateur inséré dans le SQL des jointures : toujours un entier venu de la base
function uid(viewer) {
  const id = Number(viewer.userId);
  if (!Number.isSafeInteger(id)) throw new Error('Utilisateur invalide');
  return id;
}

// L'estimation dépend de la source de prix choisie et du taux du jour : colonnes calculées à chaque requête.
// entries : une ligne par carte possédée et par langue (vue collection) au lieu d'une par carte (catalogue)
function cardColumns(viewer, entries = false) {
  return `
  c.product_id, c.name, c.name_fr, c.full_name, c.variant, c.number, c.rarity, c.color, c.card_type, c.cost,
  c.power, c.counter, c.life, c.attribute, c.subtypes, c.description, c.url,
  s.code AS set_code, s.name AS set_name, s.published_on,
  p.market, p.low, p.mid, p.date AS price_date,
  cm.trend AS cm_trend, cm.avg30 AS cm_avg30, cm.avg7 AS cm_avg7, cm.low AS cm_low, cm.date AS cm_date,
  ${estimateEurSql(viewer.source)} AS estimate_eur,
  (SELECT MIN(f.image_id) FROM fr_cards f WHERE f.product_id = c.product_id) AS fr_image,
  ${priceTwoWeeksAgo('cm', 'cm.date')} AS cm_14d,
  ${priceTwoWeeksAgo('market', 'p.date')} AS tcg_14d,
  own.owned, own.owned_fr, own.owned_en,
  w.lang AS wish_lang, w.target_eur AS wish_target, w.added_at AS wish_added,
  r.status AS reg_status, r.announced AS reg_announced, r.effective AS reg_effective
  ${entries ? ', col.lang AS entry_lang, col.quantity AS entry_quantity' : ''}`;
}

// Prix enregistré environ 14 jours avant le dernier prix connu (pour mesurer la variation récente)
function priceTwoWeeksAgo(column, dateColumn) {
  return `(SELECT h.${column} FROM price_history h WHERE h.product_id = c.product_id AND h.${column} IS NOT NULL
    AND h.date BETWEEN date(${dateColumn}, '-17 days') AND date(${dateColumn}, '-11 days')
    ORDER BY ABS(julianday(h.date) - julianday(${dateColumn}, '-14 days')) LIMIT 1)`;
}

// Quantités possédées par l'utilisateur pour chaque carte, toutes langues confondues et par langue
function ownedJoin(viewer) {
  return `
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS owned, MAX(updated_at) AS updated_at,
           SUM(CASE WHEN lang = 'fr' THEN quantity ELSE 0 END) AS owned_fr,
           SUM(CASE WHEN lang = 'en' THEN quantity ELSE 0 END) AS owned_en
    FROM collection WHERE user_id = ${uid(viewer)} GROUP BY product_id
  ) own ON own.product_id = c.product_id`;
}

function cardFrom(viewer, entries = false) {
  return `
  FROM cards c
  JOIN sets s ON s.group_id = c.group_id
  ${priceJoins('c.product_id')}
  ${ownedJoin(viewer)}
  LEFT JOIN wishlist w ON w.product_id = c.product_id AND w.user_id = ${uid(viewer)}
  LEFT JOIN regulations r ON r.number = c.number
  ${entries ? `JOIN collection col ON col.product_id = c.product_id AND col.user_id = ${uid(viewer)}` : ''}`;
}

function formatPrice(row, viewer) {
  const cmEur = row.cm_trend ?? row.cm_avg30 ?? row.cm_avg7 ?? null;
  const tcgUsd = row.market ?? row.low ?? row.mid ?? null;
  const cardmarket = cmEur == null ? null : {
    eur: cmEur,
    basis: row.cm_trend != null ? 'trend' : row.cm_avg30 != null ? 'avg30' : 'avg7',
    trend: row.cm_trend,
    avg7: row.cm_avg7,
    avg30: row.cm_avg30,
    low: row.cm_low,
    date: row.cm_date,
  };
  const tcgplayer = tcgUsd == null ? null : {
    eur: toEur(tcgUsd),
    usd: tcgUsd,
    basis: row.market != null ? 'market' : row.low != null ? 'low' : 'mid',
    marketEur: toEur(row.market),
    lowEur: toEur(row.low),
    date: row.price_date,
  };
  const order = viewer.source === 'tcgplayer' ? ['tcgplayer', 'cardmarket'] : ['cardmarket', 'tcgplayer'];
  const source = order.find((s) => (s === 'cardmarket' ? cardmarket : tcgplayer)) ?? null;
  const eur = source === 'cardmarket' ? cardmarket.eur : source === 'tcgplayer' ? tcgplayer.eur : null;
  return { eur, source, cardmarket, tcgplayer };
}

export function formatCard(row, viewer) {
  const price = formatPrice(row, viewer);
  return {
    id: row.product_id,
    name: row.name,
    nameFr: row.name_fr,
    fullName: row.full_name,
    variant: row.variant,
    number: row.number,
    rarity: row.rarity,
    color: row.color,
    type: row.card_type,
    cost: row.cost,
    power: row.power,
    counter: row.counter,
    life: row.life,
    attribute: row.attribute,
    subtypes: row.subtypes?.split(';').map((s) => s.trim()).filter(Boolean).join(' · ') ?? null,
    description: row.description,
    setCode: row.set_code,
    setName: row.set_name,
    releaseDate: row.published_on?.slice(0, 10) ?? null,
    image: `img/${row.product_id}.jpg`,
    imageLarge: cdnImage(row.product_id, 'in_1000x1000'),
    // Visuel VF officiel quand la carte existe en français
    imageFr: row.fr_image ? `img-fr/${row.fr_image}.jpg` : null,
    imageFrLarge: row.fr_image ? `img-fr-hd/${row.fr_image}.webp` : null,
    tcgplayerUrl: row.url,
    cardmarketUrl: row.number && row.number !== 'DON!!'
      ? `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(row.number)}`
      : null,
    price,
    // Bon moment pour l'acheter ? (voir insight.js)
    insight: priceInsight(row, price.eur),
    owned: row.owned ?? 0,
    ownedByLang: { fr: row.owned_fr ?? 0, en: row.owned_en ?? 0 },
    // Vue collection : la langue et la quantité de cet exemplaire
    entry: row.entry_lang ? { lang: row.entry_lang, quantity: row.entry_quantity } : null,
    // Carte dans les recherches de l'utilisateur
    wish: row.wish_added ? { lang: row.wish_lang, targetEur: row.wish_target, addedAt: row.wish_added } : null,
    // Bannie ou limitée en tournoi officiel
    regulation: row.reg_status ? { status: row.reg_status, announced: row.reg_announced, effective: row.reg_effective } : null,
  };
}

// Rareté de la plus haute à la plus basse
const RARITY_ORDER = `CASE c.rarity WHEN 'SEC' THEN 0 WHEN 'TR' THEN 1 WHEN 'L' THEN 2 WHEN 'SR' THEN 3 WHEN 'R' THEN 4
  WHEN 'UC' THEN 5 WHEN 'C' THEN 6 WHEN 'PR' THEN 7 ELSE 8 END`;

// Couleurs dans l'ordre habituel du jeu (une carte bicolore est classée avec sa première couleur)
const COLOR_ORDER = `CASE WHEN c.color LIKE 'Red%' THEN 0 WHEN c.color LIKE 'Green%' THEN 1 WHEN c.color LIKE 'Blue%' THEN 2
  WHEN c.color LIKE 'Purple%' THEN 3 WHEN c.color LIKE 'Black%' THEN 4 WHEN c.color LIKE 'Yellow%' THEN 5 ELSE 6 END`;

const SORTS = {
  price: `estimate_eur IS NULL, estimate_eur DESC`,
  'price-asc': `estimate_eur IS NULL, estimate_eur ASC`,
  // codes standards (OP01-001, ST10-005, P-001...) d'abord, puis DON!! et cartes spéciales
  number: `c.number NOT GLOB '*-[0-9][0-9][0-9]', c.number, c.product_id`,
  name: `COALESCE(c.name_fr, c.name) COLLATE NOCASE, c.number`,
  recent: `s.published_on DESC, c.number`,
  added: `own.updated_at DESC`,
  // set le plus récent d'abord, puis numéro
  set: `s.published_on DESC, s.group_id, c.number NOT GLOB '*-[0-9][0-9][0-9]', c.number, c.product_id`,
  color: `${COLOR_ORDER}, c.color, c.number`,
  rarity: `${RARITY_ORDER}, c.number`,
};

// "op1-1", "OP01 001", "st10-5", "op14018" -> "OP01-001", "ST10-005", "OP14-018" ; "p1", "P-001" -> "P-001"
function normalizeCode(q) {
  const s = q.trim();
  const m = s.match(/^([a-z]{1,3})\s*-?\s*(\d{1,2})\s*[- ]\s*(\d{1,3})$/i) ?? s.match(/^([a-z]{1,3})\s*-?\s*(\d{2})(\d{1,3})$/i);
  if (m) return `${m[1].toUpperCase()}${m[2].padStart(2, '0')}-${m[3].padStart(3, '0')}`;
  const promo = s.match(/^p\s*-?\s*(\d{1,3})$/i);
  return promo ? `P-${promo[1].padStart(3, '0')}` : null;
}

// owned : vue collection, une entrée par carte et par langue possédée (filtrable par langue)
// status (vue catalogue) : 'owned' = seulement les cartes possédées, 'missing' = seulement les manquantes
export function searchCards(viewer, { q, set, color, rarity, type, owned, lang, status, sort = 'number', limit = 60, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (q?.trim()) {
    const code = normalizeCode(q);
    if (code) {
      where.push('c.number = ?');
      params.push(code);
    } else {
      for (const word of q.trim().split(/\s+/)) {
        where.push('(c.full_name LIKE ? OR c.name_fr LIKE ? OR c.number LIKE ? OR s.name LIKE ? OR c.subtypes LIKE ?)');
        const like = `%${word}%`;
        params.push(like, like, like, like, like);
      }
    }
  }
  if (set) { where.push('c.group_id = ?'); params.push(Number(set)); }
  if (color) { where.push('c.color LIKE ?'); params.push(`%${color}%`); }
  if (rarity) { where.push('c.rarity = ?'); params.push(rarity); }
  if (type) { where.push('c.card_type = ?'); params.push(type); }
  if (owned && LANGS.includes(lang)) { where.push('col.lang = ?'); params.push(lang); }
  if (!owned && status === 'owned') where.push('own.owned > 0');
  if (!owned && status === 'missing') where.push('own.owned IS NULL');

  const entries = Boolean(owned);
  // à carte égale, l'exemplaire VF avant le VO
  let order = entries && sort === 'added' ? 'col.updated_at DESC' : `${SORTS[sort] ?? SORTS.number}${entries ? ', col.lang DESC' : ''}`;
  // Dans un set, ses propres numéros d'abord (OP14-xxx pour OP14) puis les cartes d'autres séries qu'il contient
  const orderParams = [];
  if (set && (sort ?? 'number') === 'number') {
    const code = db.prepare('SELECT code FROM sets WHERE group_id = ?').get(Number(set))?.code;
    // "OP14" -> OP14, "ST-31" -> ST31, "OP15-EB04" -> OP15, "OP14 RE" -> OP14
    const m = code?.match(/^([A-Z]+)-?(\d+)/);
    const prefix = m ? m[1] + m[2] : null;
    if (prefix) {
      order = `REPLACE(c.number, '-', '') NOT LIKE ?, ${order}`;
      orderParams.push(`${prefix}%`);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n ${cardFrom(viewer, entries)} ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT ${cardColumns(viewer, entries)} ${cardFrom(viewer, entries)} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, ...orderParams, Math.min(Number(limit) || 60, 500), Number(offset) || 0);
  return { total, cards: rows.map((r) => formatCard(r, viewer)) };
}

export function getCards(viewer, ids) {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT ${cardColumns(viewer)} ${cardFrom(viewer)} WHERE c.product_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.product_id, formatCard(r, viewer)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function getCard(viewer, id) {
  return getCards(viewer, [Number(id)])[0] ?? null;
}

export function getCardDetail(viewer, id) {
  const card = getCard(viewer, id);
  if (!card) return null;
  const versions = db.prepare(`SELECT ${cardColumns(viewer)} ${cardFrom(viewer)} WHERE c.number = ? AND c.product_id != ? ORDER BY s.published_on, c.product_id`)
    .all(card.number, card.id).map((r) => formatCard(r, viewer));
  // Historique dans la source du prix affiché (sans mélanger les deux marchés sur une même courbe)
  const history = db.prepare('SELECT date, market, low, cm FROM price_history WHERE product_id = ? ORDER BY date')
    .all(card.id)
    .map((h) => ({ date: h.date, eur: card.price.source === 'cardmarket' ? h.cm : toEur(h.market ?? h.low) }))
    .filter((h) => h.eur != null);
  return { ...card, versions: card.number === 'DON!!' ? [] : versions, history };
}

export function listSets(viewer) {
  return db.prepare(`
    SELECT s.group_id, s.code, s.name, s.published_on,
           COUNT(c.product_id) AS cards,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM collection col WHERE col.product_id = c.product_id AND col.user_id = ?)
             THEN 1 ELSE 0 END) AS owned
    FROM sets s
    JOIN cards c ON c.group_id = s.group_id
    GROUP BY s.group_id
    ORDER BY s.published_on DESC`).all(uid(viewer))
    .map((s) => ({ id: s.group_id, code: s.code, name: s.name, releaseDate: s.published_on?.slice(0, 10), cards: s.cards, owned: s.owned }));
}

// Sets (extensions) vus depuis la collection : progression, valeur possédée et carte d'illustration
export function collectionSets(viewer, { all = false } = {}) {
  const estimate = estimateEurSql(viewer.source);
  const sets = db.prepare(`
    SELECT s.group_id, s.code, s.name, s.published_on,
           COUNT(*) AS total,
           COUNT(own.product_id) AS owned_cards,
           COALESCE(SUM(own.owned), 0) AS copies,
           COALESCE(SUM(own.owned * ${estimate}), 0) AS value_eur
    FROM cards c
    JOIN sets s ON s.group_id = c.group_id
    ${priceJoins('c.product_id')}
    ${ownedJoin(viewer)}
    GROUP BY s.group_id
    ${all ? '' : 'HAVING owned_cards > 0'}
    ORDER BY s.published_on DESC, s.group_id`).all();

  // Illustration : la carte possédée la plus chère du set, à défaut la plus chère du set
  const covers = new Map(db.prepare(`
    SELECT group_id, product_id, fr_image, owned_fr, owned_en FROM (
      SELECT c.group_id, c.product_id, own.owned_fr, own.owned_en,
             (SELECT MIN(f.image_id) FROM fr_cards f WHERE f.product_id = c.product_id) AS fr_image,
             ROW_NUMBER() OVER (
               PARTITION BY c.group_id ORDER BY own.owned IS NULL, ${estimate} IS NULL, ${estimate} DESC, c.product_id
             ) AS rank
      FROM cards c
      ${priceJoins('c.product_id')}
      ${ownedJoin(viewer)}
    ) WHERE rank = 1`).all().map((r) => [r.group_id, r]));

  return sets.map((s) => {
    const cover = covers.get(s.group_id);
    return {
      id: s.group_id,
      code: s.code,
      name: s.name,
      releaseDate: s.published_on?.slice(0, 10) ?? null,
      total: s.total,
      owned: s.owned_cards,
      copies: s.copies,
      valueEur: Math.round(s.value_eur * 100) / 100,
      cover: cover && {
        id: cover.product_id,
        image: `img/${cover.product_id}.jpg`,
        imageFr: cover.fr_image ? `img-fr/${cover.fr_image}.jpg` : null,
        // langue de l'exemplaire possédé (VF en priorité), null si la carte n'est pas possédée
        ownedLang: cover.owned_fr > 0 ? 'fr' : cover.owned_en > 0 ? 'en' : null,
      },
    };
  });
}

export function setQuantity(viewer, productId, quantity, lang = 'fr') {
  if (!LANGS.includes(lang)) throw Object.assign(new Error(`Langue inconnue : ${lang}`), { status: 400, expose: true });
  if (!db.prepare('SELECT 1 FROM cards WHERE product_id = ?').get(productId)) return null;
  const now = new Date().toISOString();
  if (quantity <= 0) {
    db.prepare('DELETE FROM collection WHERE user_id = ? AND product_id = ? AND lang = ?').run(uid(viewer), productId, lang);
  } else {
    db.prepare(`INSERT INTO collection (user_id, product_id, lang, quantity, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, product_id, lang) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`)
      .run(uid(viewer), productId, lang, quantity, now, now);
    // Carte trouvée : elle sort des recherches si elle y était dans cette langue
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ? AND lang = ?').run(uid(viewer), productId, lang);
  }
  return getCard(viewer, productId);
}

export function addToCollection(viewer, productId, delta = 1, lang = 'fr') {
  const current = db.prepare('SELECT quantity FROM collection WHERE user_id = ? AND product_id = ? AND lang = ?')
    .get(uid(viewer), productId, lang)?.quantity ?? 0;
  return setQuantity(viewer, productId, current + delta, lang);
}

export function collectionStats(viewer) {
  const bySet = db.prepare(`
    SELECT s.code, s.name, SUM(col.quantity) AS cards, SUM(col.quantity * ${estimateEurSql(viewer.source)}) AS value_eur
    FROM collection col
    JOIN cards c ON c.product_id = col.product_id
    JOIN sets s ON s.group_id = c.group_id
    ${priceJoins('c.product_id')}
    WHERE col.user_id = ?
    GROUP BY s.group_id ORDER BY value_eur DESC`).all(uid(viewer))
    .map((r) => ({ code: r.code, name: r.name, cards: r.cards, valueEur: Math.round((r.value_eur ?? 0) * 100) / 100 }));
  const history = valueHistory(uid(viewer), viewer.source);
  const top = searchCards(viewer, { owned: true, sort: 'price', limit: 10 }).cards;
  return { bySet, history, top };
}

// uiLang 'en' : en-têtes en anglais et format numérique anglais (virgule séparateur, point décimal)
export function collectionCsv(viewer, uiLang = 'fr') {
  const english = uiLang === 'en';
  const rows = db.prepare(`SELECT ${cardColumns(viewer, true)} ${cardFrom(viewer, true)} ORDER BY c.number, col.lang`).all()
    .map((r) => formatCard(r, viewer));
  // Format Excel français : séparateur ";" et virgule décimale ; anglais : séparateur "," et point décimal
  const sep = english ? ',' : ';';
  const esc = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' && !english ? String(v).replace('.', ',') : String(v);
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [english
    ? ['Code', 'Name', 'Language', 'Variant', 'Set', 'Rarity', 'Quantity', 'Unit price (EUR)', 'Total (EUR)',
      'Price source', 'Cardmarket trend (EUR)', 'TCGplayer (EUR)', 'TCGplayer ID']
    : ['Code', 'Nom', 'Langue', 'Variante', 'Extension', 'Rareté', 'Quantité', 'Prix unitaire (EUR)', 'Total (EUR)',
      'Source du prix', 'Cardmarket tendance (EUR)', 'TCGplayer (EUR)', 'TCGplayer ID']];
  for (const c of rows) {
    const { lang, quantity } = c.entry;
    const total = c.price.eur == null ? null : Math.round(c.price.eur * quantity * 100) / 100;
    lines.push([c.number, lang === 'fr' ? (c.nameFr ?? c.name) : c.name, lang.toUpperCase(), c.variant, c.setName, c.rarity,
      quantity, c.price.eur, total, c.price.source, c.price.cardmarket?.trend ?? null, c.price.tcgplayer?.eur ?? null, String(c.id)]);
  }
  return lines.map((l) => l.map(esc).join(sep)).join('\r\n');
}

// ---------- Recherches (liste de souhaits) ----------

function invalid(code, message) {
  return Object.assign(new Error(message), { status: 400, expose: true, code });
}

export function wishlistCards(viewer) {
  return db.prepare(`SELECT ${cardColumns(viewer)} ${cardFrom(viewer)} WHERE w.product_id IS NOT NULL
    ORDER BY w.added_at DESC, c.number`).all().map((r) => formatCard(r, viewer));
}

// Les cartes recherchées, et les bonnes affaires parmi les cartes manquantes des sets commencés : au moins 10 % sous
// leur moyenne du mois et prix qui ne baisse plus (voir insight.js), à partir d'1 €
export function wishlist(viewer) {
  const cards = wishlistCards(viewer);
  const deals = db.prepare(`SELECT ${cardColumns(viewer)} ${cardFrom(viewer)}
    WHERE own.owned IS NULL AND w.product_id IS NULL AND cm.trend >= 1 AND cm.trend <= cm.avg30 * 0.9
      AND c.group_id IN (SELECT k.group_id FROM collection col JOIN cards k ON k.product_id = col.product_id WHERE col.user_id = ?)`)
    .all(uid(viewer))
    .map((r) => formatCard(r, viewer))
    .filter((c) => c.insight?.kind === 'good')
    .sort((a, b) => a.insight.change - b.insight.change)
    .slice(0, 24);
  return { cards, deals };
}

// Nombre de cartes recherchées et, parmi elles, celles dont le prix est passé sous le prix cible
export function wishlistCounts(viewer) {
  const row = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN w.target_eur IS NOT NULL AND ${estimateEurSql(viewer.source)} <= w.target_eur
      THEN 1 ELSE 0 END), 0) AS reached
    FROM wishlist w ${priceJoins('w.product_id')}
    WHERE w.user_id = ?`).get(uid(viewer));
  return { count: row.n, reached: row.reached };
}

// Ajoute une carte aux recherches ou modifie sa langue / son prix cible (null : pas de prix cible).
// Sans prix cible précisé, une nouvelle recherche prend le prix cible proposé par insight.js
export function setWish(viewer, productId, { lang, targetEur } = {}) {
  const card = getCard(viewer, productId);
  if (!card) return null;
  const nextLang = lang ?? card.wish?.lang ?? 'fr';
  if (!LANGS.includes(nextLang)) throw invalid('invalid_lang', 'Langue invalide');
  if (targetEur !== undefined && targetEur !== null && !(Number.isFinite(targetEur) && targetEur > 0 && targetEur <= 100000)) {
    throw invalid('invalid_target', 'Prix cible invalide');
  }
  const target = targetEur !== undefined ? targetEur : card.wish ? card.wish.targetEur : card.insight?.target ?? null;
  db.prepare(`INSERT INTO wishlist (user_id, product_id, lang, target_eur, added_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET lang = excluded.lang, target_eur = excluded.target_eur`)
    .run(uid(viewer), productId, nextLang, target == null ? null : Math.round(target * 100) / 100, new Date().toISOString());
  return getCard(viewer, productId);
}

export function removeWish(viewer, productId) {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(uid(viewer), productId);
  return getCard(viewer, productId);
}

// Toutes les cartes manquantes d'un set (pas encore possédées ni recherchées) passent dans les recherches
export function wishMissing(viewer, groupId, lang = 'fr') {
  if (!LANGS.includes(lang)) throw invalid('invalid_lang', 'Langue invalide');
  const cards = db.prepare(`SELECT ${cardColumns(viewer)} ${cardFrom(viewer)}
    WHERE c.group_id = ? AND own.owned IS NULL AND w.product_id IS NULL`).all(groupId).map((r) => formatCard(r, viewer));
  const insert = db.prepare('INSERT INTO wishlist (user_id, product_id, lang, target_eur, added_at) VALUES (?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  transaction(() => {
    for (const card of cards) insert.run(uid(viewer), card.id, lang, card.insight?.target ?? null, now);
  });
  return cards.length;
}

// ---------- Doubles ----------

// Exemplaires gardés par carte et par langue (1 pour une collection, 4 pour jouer...) : au-delà, ce sont des doubles
export const KEEP_MAX = 10;

export function setKeepCopies(userId, keep) {
  if (!Number.isInteger(keep) || keep < 1 || keep > KEEP_MAX) throw invalid('invalid_keep', "Nombre d'exemplaires invalide");
  db.prepare('UPDATE users SET keep_copies = ? WHERE id = ?').run(keep, userId);
}

// Cartes possédées en au moins minQuantity exemplaires (une ligne par carte et par langue), les plus chères d'abord
export function collectionEntries(viewer, minQuantity = 1) {
  return db.prepare(`SELECT ${cardColumns(viewer, true)} ${cardFrom(viewer, true)} WHERE col.quantity >= ?
    ORDER BY ${SORTS.price}, c.number, col.lang DESC`).all(minQuantity).map((r) => formatCard(r, viewer));
}

// Doubles : exemplaires au-delà de ceux qu'on garde, avec leur valeur
export function doubles(viewer, keep) {
  const cards = collectionEntries(viewer, keep + 1).map((c) => ({ ...c, extra: c.entry.quantity - keep }));
  const copies = cards.reduce((sum, c) => sum + c.extra, 0);
  const value = cards.reduce((sum, c) => sum + c.extra * (c.price.eur ?? 0), 0);
  return { keep, copies, distinct: cards.length, valueEur: Math.round(value * 100) / 100, cards };
}

// ---------- Échanges entre membres ----------
// Seuls les membres qui participent (users.trade_enabled) sont rapprochés, et seulement entre eux : une carte
// recherchée par l'un, en double chez l'autre, dans la même langue.

// Ses cartes recherchées que d'autres membres ont en double : { other, product_id, lang, extra }
export function tradeOffersFor(userId) {
  return db.prepare(`
    SELECT col.user_id AS other, col.product_id, col.lang, col.quantity - u.keep_copies AS extra
    FROM wishlist w
    JOIN collection col ON col.product_id = w.product_id AND col.lang = w.lang AND col.user_id != w.user_id
    JOIN users u ON u.id = col.user_id
    WHERE w.user_id = ? AND u.trade_enabled = 1 AND col.quantity > u.keep_copies`).all(userId);
}

const TRADE_CONTACT_MAX = 100;
const TRADE_REGION_MAX = 60;

function cleanText(value, max) {
  // une ligne, sans caractères de contrôle
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text.length > max) throw invalid('invalid_trade', 'Texte trop long');
  return text || null;
}

export function tradeSettings(user) {
  return { enabled: Boolean(user.trade_enabled), contact: user.trade_contact ?? '', region: user.trade_region ?? '' };
}

export function setTradeSettings(user, { enabled, contact, region } = {}) {
  const next = {
    enabled: typeof enabled === 'boolean' ? enabled : Boolean(user.trade_enabled),
    contact: contact === undefined ? user.trade_contact : cleanText(contact, TRADE_CONTACT_MAX),
    region: region === undefined ? user.trade_region : cleanText(region, TRADE_REGION_MAX),
  };
  db.prepare('UPDATE users SET trade_enabled = ?, trade_contact = ?, trade_region = ? WHERE id = ?')
    .run(Number(next.enabled), next.contact, next.region, user.id);
  return { enabled: next.enabled, contact: next.contact ?? '', region: next.region ?? '' };
}

// Échanges possibles pour un membre qui participe : pour chaque autre participant, les cartes qu'il a en double et
// que le membre cherche (theyHave), et les doubles du membre qu'il cherche (theyWant). Les plus intéressants d'abord.
export function tradeMatches(viewer, user) {
  if (!user.trade_enabled) return [];
  const keep = user.keep_copies;
  const theyWant = db.prepare(`
    SELECT w.user_id AS other, col.product_id, col.lang, col.quantity - ? AS extra
    FROM collection col
    JOIN wishlist w ON w.product_id = col.product_id AND w.lang = col.lang AND w.user_id != col.user_id
    JOIN users u ON u.id = w.user_id
    WHERE col.user_id = ? AND col.quantity > ? AND u.trade_enabled = 1`).all(keep, user.id, keep);
  const theyHave = tradeOffersFor(user.id);

  const byMember = new Map();
  const entry = (other) => {
    if (!byMember.has(other)) byMember.set(other, { other, theyHave: [], theyWant: [] });
    return byMember.get(other);
  };
  for (const r of theyHave) entry(r.other).theyHave.push(r);
  for (const r of theyWant) entry(r.other).theyWant.push(r);
  if (!byMember.size) return [];

  const members = [...byMember.values()]
    .sort((a, b) => b.theyHave.length - a.theyHave.length || b.theyWant.length - a.theyWant.length)
    .slice(0, 30);
  const ids = [...new Set(members.flatMap((m) => [...m.theyHave, ...m.theyWant].map((r) => r.product_id)))];
  const cards = new Map(getCards(viewer, ids).map((c) => [c.id, c]));
  const people = new Map(db.prepare(`SELECT id, pseudo, trade_contact, trade_region FROM users
    WHERE id IN (${members.map(() => '?').join(',')})`).all(...members.map((m) => m.other)).map((u) => [u.id, u]));
  const withCard = (r) => cards.has(r.product_id) && { ...cards.get(r.product_id), tradeLang: r.lang, extra: r.extra };
  return members.map((m) => {
    const person = people.get(m.other);
    return {
      pseudo: person.pseudo,
      contact: person.trade_contact ?? '',
      region: person.trade_region ?? '',
      theyHave: m.theyHave.map(withCard).filter(Boolean),
      theyWant: m.theyWant.map(withCard).filter(Boolean),
    };
  });
}

// ---------- Import ----------

// Lecture d'un CSV (séparateur ";" ou ",", champs entre guillemets possibles)
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.split(';').length >= firstLine.split(',').length) ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function invalidCsv() {
  return Object.assign(new Error('Fichier CSV non reconnu'), { status: 400, expose: true, code: 'invalid_csv' });
}

// Import d'un export CSV de TCGC (français ou anglais) : pour chaque carte et langue du fichier, la quantité de la
// collection prend la valeur du fichier ; les autres cartes ne sont pas touchées (réimporter ne double rien)
export function importCollection(viewer, csvText) {
  const rows = parseCsv(String(csvText ?? ''));
  if (rows.length < 2 || rows.length > 20001) throw invalidCsv();
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const idCol = col('tcgplayer id');
  const qtyCol = col('quantité', 'quantity');
  const langCol = col('langue', 'language');
  if (idCol < 0 || qtyCol < 0) throw invalidCsv();

  const exists = db.prepare('SELECT 1 FROM cards WHERE product_id = ?');
  const wanted = new Map(); // "id|lang" -> quantité
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const productId = Number(row[idCol]);
    const quantity = Number(String(row[qtyCol]).trim());
    const lang = langCol >= 0 ? String(row[langCol] ?? '').trim().toLowerCase() || 'fr' : 'fr';
    if (!Number.isSafeInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999
      || !LANGS.includes(lang) || !exists.get(productId)) {
      skipped++;
      continue;
    }
    const key = `${productId}|${lang}`;
    wanted.set(key, (wanted.get(key) ?? 0) + quantity);
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(`INSERT INTO collection (user_id, product_id, lang, quantity, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, product_id, lang) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`);
  transaction(() => {
    for (const [key, quantity] of wanted) {
      const [productId, lang] = key.split('|');
      upsert.run(uid(viewer), Number(productId), lang, quantity, now, now);
    }
  });
  const copies = [...wanted.values()].reduce((sum, q) => sum + q, 0);
  return { cards: wanted.size, copies, skipped };
}
