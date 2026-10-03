import { db, getMeta, setMeta } from './db.js';

export const PRICE_SOURCES = ['cardmarket', 'tcgplayer'];

// Source de prix principale : Cardmarket (marché européen, en €) par défaut, TCGplayer (USA) au choix.
// Quand la source principale n'a pas de prix pour une carte, on prend l'autre.
export function priceSource() {
  return getMeta('price_source') === 'tcgplayer' ? 'tcgplayer' : 'cardmarket';
}

export function setPriceSource(source) {
  if (!PRICE_SOURCES.includes(source)) throw new Error(`Source de prix inconnue : ${source}`);
  setMeta('price_source', source);
}

export function usdPerEur() {
  return Number(getMeta('usd_per_eur')) || 1.1;
}

export function toEur(usd) {
  return usd == null ? null : Math.round((usd / usdPerEur()) * 100) / 100;
}

// Jointures des prix d'une carte (alias p : TCGplayer en $, cm : Cardmarket en €)
export function priceJoins(productIdColumn) {
  return `LEFT JOIN prices p ON p.product_id = ${productIdColumn}
    LEFT JOIN cm_prices cm ON cm.product_id = ${productIdColumn}`;
}

// TCGplayer : "market price" (moyenne des ventes récentes), à défaut l'annonce la moins chère puis la médiane.
// Cardmarket : tendance des prix, à défaut les moyennes des ventes sur 30 puis 7 jours.
export const TCG_USD_SQL = 'COALESCE(p.market, p.low, p.mid)';
export const CM_EUR_SQL = 'COALESCE(cm.trend, cm.avg30, cm.avg7)';

export function estimateEurSql(source = priceSource()) {
  const tcg = `(${TCG_USD_SQL} / ${usdPerEur()})`;
  return source === 'cardmarket' ? `COALESCE(${CM_EUR_SQL}, ${tcg})` : `COALESCE(${tcg}, ${CM_EUR_SQL})`;
}

export function collectionTotals(source = priceSource()) {
  const estimate = estimateEurSql(source);
  const row = db.prepare(`
    SELECT COUNT(DISTINCT col.product_id) AS distinct_cards,
           COALESCE(SUM(col.quantity), 0) AS cards,
           COALESCE(SUM(col.quantity * ${estimate}), 0) AS value_eur,
           COALESCE(SUM(CASE WHEN ${estimate} IS NULL THEN 1 ELSE 0 END), 0) AS unpriced
    FROM collection col ${priceJoins('col.product_id')}`).get();
  return {
    distinctCards: row.distinct_cards,
    cards: row.cards,
    valueEur: Math.round(row.value_eur * 100) / 100,
    unpriced: row.unpriced,
  };
}

// Une ligne par jour, pour tracer l'évolution de la valeur de la collection, selon chacune des deux sources
export function snapshotCollectionValue() {
  const cm = collectionTotals('cardmarket');
  const tcg = collectionTotals('tcgplayer');
  const date = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO value_history (date, value_eur, value_cm, value_tcg, cards) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET value_eur = excluded.value_eur, value_cm = excluded.value_cm,
      value_tcg = excluded.value_tcg, cards = excluded.cards`)
    .run(date, tcg.valueEur, cm.valueEur, tcg.valueEur, cm.cards);
}

// Évolution de la valeur dans la source choisie ; les jours d'avant l'arrivée de Cardmarket n'ont que TCGplayer
export function valueHistory(source = priceSource()) {
  const rows = db.prepare('SELECT date, value_cm, value_tcg, value_eur, cards FROM value_history ORDER BY date').all();
  const pick = (r) => (source === 'cardmarket' ? r.value_cm : r.value_tcg ?? r.value_eur);
  const own = rows.filter((r) => pick(r) != null);
  return (own.length ? own : rows).map((r) => ({ date: r.date, valueEur: pick(r) ?? r.value_eur, cards: r.cards }));
}
