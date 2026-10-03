// Requêtes sur le catalogue et la collection, mises en forme pour l'API
import { db } from './db.js';
import { cdnImage } from './images.js';
import { estimateEurSql, priceJoins, priceSource, toEur, valueHistory } from './valuation.js';

// Langues dans lesquelles on peut posséder une carte
export const LANGS = ['fr', 'en'];

// L'estimation dépend de la source de prix choisie et du taux du jour : colonnes calculées à chaque requête.
// entries : une ligne par carte possédée et par langue (vue collection) au lieu d'une par carte (catalogue)
function cardColumns(entries = false) {
  return `
  c.product_id, c.name, c.name_fr, c.full_name, c.variant, c.number, c.rarity, c.color, c.card_type, c.cost,
  c.power, c.counter, c.life, c.attribute, c.subtypes, c.description, c.url,
  s.code AS set_code, s.name AS set_name, s.published_on,
  p.market, p.low, p.mid, p.date AS price_date,
  cm.trend AS cm_trend, cm.avg30 AS cm_avg30, cm.avg7 AS cm_avg7, cm.low AS cm_low, cm.date AS cm_date,
  ${estimateEurSql()} AS estimate_eur,
  (SELECT MIN(f.image_id) FROM fr_cards f WHERE f.product_id = c.product_id) AS fr_image,
  own.owned, own.owned_fr, own.owned_en
  ${entries ? ', col.lang AS entry_lang, col.quantity AS entry_quantity' : ''}`;
}

// Quantités possédées par carte, toutes langues confondues et par langue
const OWNED_JOIN = `
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS owned, MAX(updated_at) AS updated_at,
           SUM(CASE WHEN lang = 'fr' THEN quantity ELSE 0 END) AS owned_fr,
           SUM(CASE WHEN lang = 'en' THEN quantity ELSE 0 END) AS owned_en
    FROM collection GROUP BY product_id
  ) own ON own.product_id = c.product_id`;

function cardFrom(entries = false) {
  return `
  FROM cards c
  JOIN sets s ON s.group_id = c.group_id
  ${priceJoins('c.product_id')}
  ${OWNED_JOIN}
  ${entries ? 'JOIN collection col ON col.product_id = c.product_id' : ''}`;
}

function formatPrice(row) {
  const cmEur = row.cm_trend ?? row.cm_avg30 ?? row.cm_avg7 ?? null;
  const tcgUsd = row.market ?? row.low ?? row.mid ?? null;
  const cardmarket = cmEur == null ? null : {
    eur: cmEur,
    basis: row.cm_trend != null ? 'trend' : row.cm_avg30 != null ? 'avg30' : 'avg7',
    trend: row.cm_trend,
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
  const order = priceSource() === 'cardmarket' ? ['cardmarket', 'tcgplayer'] : ['tcgplayer', 'cardmarket'];
  const source = order.find((s) => (s === 'cardmarket' ? cardmarket : tcgplayer)) ?? null;
  const eur = source === 'cardmarket' ? cardmarket.eur : source === 'tcgplayer' ? tcgplayer.eur : null;
  return { eur, source, cardmarket, tcgplayer };
}

export function formatCard(row) {
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
    image: `/img/${row.product_id}.jpg`,
    imageLarge: cdnImage(row.product_id, 'in_1000x1000'),
    // Visuel VF officiel quand la carte existe en français
    imageFr: row.fr_image ? `/img-fr/${row.fr_image}.jpg` : null,
    imageFrLarge: row.fr_image ? `/img-fr-hd/${row.fr_image}.webp` : null,
    tcgplayerUrl: row.url,
    cardmarketUrl: row.number && row.number !== 'DON!!'
      ? `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(row.number)}`
      : null,
    price: formatPrice(row),
    owned: row.owned ?? 0,
    ownedByLang: { fr: row.owned_fr ?? 0, en: row.owned_en ?? 0 },
    // Vue collection : la langue et la quantité de cet exemplaire
    entry: row.entry_lang ? { lang: row.entry_lang, quantity: row.entry_quantity } : null,
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
export function searchCards({ q, set, color, rarity, type, owned, lang, status, sort = 'number', limit = 60, offset = 0 } = {}) {
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
  const total = db.prepare(`SELECT COUNT(*) AS n ${cardFrom(entries)} ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT ${cardColumns(entries)} ${cardFrom(entries)} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, ...orderParams, Math.min(Number(limit) || 60, 500), Number(offset) || 0);
  return { total, cards: rows.map(formatCard) };
}

export function getCards(ids) {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT ${cardColumns()} ${cardFrom()} WHERE c.product_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.product_id, formatCard(r)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function getCard(id) {
  return getCards([Number(id)])[0] ?? null;
}

export function getCardDetail(id) {
  const card = getCard(id);
  if (!card) return null;
  const versions = db.prepare(`SELECT ${cardColumns()} ${cardFrom()} WHERE c.number = ? AND c.product_id != ? ORDER BY s.published_on, c.product_id`)
    .all(card.number, card.id).map(formatCard);
  // Historique dans la source du prix affiché (sans mélanger les deux marchés sur une même courbe)
  const history = db.prepare('SELECT date, market, low, cm FROM price_history WHERE product_id = ? ORDER BY date')
    .all(card.id)
    .map((h) => ({ date: h.date, eur: card.price.source === 'cardmarket' ? h.cm : toEur(h.market ?? h.low) }))
    .filter((h) => h.eur != null);
  return { ...card, versions: card.number === 'DON!!' ? [] : versions, history };
}

export function listSets() {
  return db.prepare(`
    SELECT s.group_id, s.code, s.name, s.published_on,
           COUNT(c.product_id) AS cards,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM collection col WHERE col.product_id = c.product_id) THEN 1 ELSE 0 END) AS owned
    FROM sets s
    JOIN cards c ON c.group_id = s.group_id
    GROUP BY s.group_id
    ORDER BY s.published_on DESC`).all()
    .map((s) => ({ id: s.group_id, code: s.code, name: s.name, releaseDate: s.published_on?.slice(0, 10), cards: s.cards, owned: s.owned }));
}

// Sets (extensions) vus depuis la collection : progression, valeur possédée et carte d'illustration
export function collectionSets({ all = false } = {}) {
  const estimate = estimateEurSql();
  const sets = db.prepare(`
    SELECT s.group_id, s.code, s.name, s.published_on,
           COUNT(*) AS total,
           COUNT(own.product_id) AS owned_cards,
           COALESCE(SUM(own.owned), 0) AS copies,
           COALESCE(SUM(own.owned * ${estimate}), 0) AS value_eur
    FROM cards c
    JOIN sets s ON s.group_id = c.group_id
    ${priceJoins('c.product_id')}
    ${OWNED_JOIN}
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
      ${OWNED_JOIN}
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
        image: `/img/${cover.product_id}.jpg`,
        imageFr: cover.fr_image ? `/img-fr/${cover.fr_image}.jpg` : null,
        // langue de l'exemplaire possédé (VF en priorité), null si la carte n'est pas possédée
        ownedLang: cover.owned_fr > 0 ? 'fr' : cover.owned_en > 0 ? 'en' : null,
      },
    };
  });
}

export function setQuantity(productId, quantity, lang = 'fr') {
  if (!LANGS.includes(lang)) throw Object.assign(new Error(`Langue inconnue : ${lang}`), { status: 400, expose: true });
  if (!db.prepare('SELECT 1 FROM cards WHERE product_id = ?').get(productId)) return null;
  const now = new Date().toISOString();
  if (quantity <= 0) {
    db.prepare('DELETE FROM collection WHERE product_id = ? AND lang = ?').run(productId, lang);
  } else {
    db.prepare(`INSERT INTO collection (product_id, lang, quantity, added_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(product_id, lang) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`)
      .run(productId, lang, quantity, now, now);
  }
  return getCard(productId);
}

export function addToCollection(productId, delta = 1, lang = 'fr') {
  const current = db.prepare('SELECT quantity FROM collection WHERE product_id = ? AND lang = ?').get(productId, lang)?.quantity ?? 0;
  return setQuantity(productId, current + delta, lang);
}

export function collectionStats() {
  const bySet = db.prepare(`
    SELECT s.code, s.name, SUM(col.quantity) AS cards, SUM(col.quantity * ${estimateEurSql()}) AS value_eur
    FROM collection col
    JOIN cards c ON c.product_id = col.product_id
    JOIN sets s ON s.group_id = c.group_id
    ${priceJoins('c.product_id')}
    GROUP BY s.group_id ORDER BY value_eur DESC`).all()
    .map((r) => ({ code: r.code, name: r.name, cards: r.cards, valueEur: Math.round((r.value_eur ?? 0) * 100) / 100 }));
  const history = valueHistory();
  const top = searchCards({ owned: true, sort: 'price', limit: 10 }).cards;
  return { bySet, history, top };
}

// uiLang 'en' : en-têtes en anglais et format numérique anglais (virgule séparateur, point décimal)
export function collectionCsv(uiLang = 'fr') {
  const english = uiLang === 'en';
  const rows = db.prepare(`SELECT ${cardColumns(true)} ${cardFrom(true)} ORDER BY c.number, col.lang`).all().map(formatCard);
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
