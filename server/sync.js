// Synchronise le catalogue One Piece et les prix depuis tcgcsv.com (miroir quotidien de TCGplayer)
// et le taux EUR/USD depuis la BCE.
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { db, getMeta, setMeta, transaction } from './db.js';
import { syncCardmarket } from './cardmarket.js';
import { snapshotCollectionValue } from './valuation.js';

const USER_AGENT = 'TCGC-personal-collection/0.1';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = await res.json();
  if (body.success === false) throw new Error(`${url} -> ${JSON.stringify(body.errors)}`);
  return body.results ?? body;
}

// "Monkey.D.Luffy (119) (Alternate Art) (Manga)" -> { name: "Monkey.D.Luffy", variant: "Alternate Art · Manga" }
export function parseName(fullName) {
  let name = fullName.trim();
  const labels = [];
  let m;
  while ((m = name.match(/\s*(?:\(([^()]*)\)|\[([^[\]]*)\])\s*$/))) {
    const inner = (m[1] ?? m[2]).trim();
    // "(001)", "(OP01-120)", "(P-001)" : c'est le numéro de carte, pas une variante
    if (!/^(?:[A-Z]+\d*-)?\d{3}$/.test(inner)) labels.unshift(inner);
    name = name.slice(0, m.index);
  }
  // "Roronoa Zoro - OP01-001" (promos) -> "Roronoa Zoro"
  name = name.replace(/\s+-\s+[A-Z]+\d*-\d{3}$/, '');
  return { name: name || fullName, variant: labels.length ? labels.join(' · ') : null };
}

function ext(product, key) {
  return product.extendedData?.find((e) => e.name === key)?.value ?? null;
}

function stripHtml(s) {
  return s == null ? null : s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

async function fetchUsdPerEur() {
  const res = await fetch(config.ecbRatesUrl, { headers: { 'User-Agent': USER_AGENT } });
  const xml = await res.text();
  const m = xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/);
  if (!m) throw new Error('Taux USD introuvable dans le flux BCE');
  return Number(m[1]);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

let running = null;

export function syncInProgress() {
  return running !== null;
}

export function runSync({ log = console.log } = {}) {
  running ??= doSync(log).finally(() => { running = null; });
  return running;
}

async function doSync(log) {
  const started = Date.now();
  const base = `${config.tcgcsvBase}/${config.tcgplayerCategory}`;

  const lastUpdated = await fetch('https://tcgcsv.com/last-updated.txt', { headers: { 'User-Agent': USER_AGENT } })
    .then((r) => r.text()).catch(() => '');
  const priceDate = /^\d{4}-\d{2}-\d{2}/.test(lastUpdated) ? lastUpdated.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const groups = await getJson(`${base}/groups`);
  log(`${groups.length} extensions trouvées, téléchargement des cartes et des prix...`);

  const perGroup = await mapLimit(groups, 4, async (g) => {
    const [products, prices] = await Promise.all([
      getJson(`${base}/${g.groupId}/products`),
      getJson(`${base}/${g.groupId}/prices`),
    ]);
    return { group: g, products, prices };
  });

  let usdPerEur = null;
  try {
    usdPerEur = await fetchUsdPerEur();
  } catch (err) {
    log(`Taux BCE indisponible (${err.message}), on garde le précédent`);
  }

  const upsertSet = db.prepare(`
    INSERT INTO sets (group_id, code, name, published_on, modified_on) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET code = excluded.code, name = excluded.name,
      published_on = excluded.published_on, modified_on = excluded.modified_on`);
  const upsertCard = db.prepare(`
    INSERT INTO cards (product_id, group_id, name, full_name, variant, number, rarity, color, card_type,
      cost, power, counter, life, attribute, subtypes, description, image_url, url, modified_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET group_id = excluded.group_id, name = excluded.name,
      full_name = excluded.full_name, variant = excluded.variant, number = excluded.number,
      rarity = excluded.rarity, color = excluded.color, card_type = excluded.card_type, cost = excluded.cost,
      power = excluded.power, counter = excluded.counter, life = excluded.life, attribute = excluded.attribute,
      subtypes = excluded.subtypes, description = excluded.description, image_url = excluded.image_url,
      url = excluded.url, modified_on = excluded.modified_on`);
  const upsertPrice = db.prepare(`
    INSERT INTO prices (product_id, sub_type, market, low, mid, high, direct_low, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET sub_type = excluded.sub_type, market = excluded.market, low = excluded.low,
      mid = excluded.mid, high = excluded.high, direct_low = excluded.direct_low, date = excluded.date`);
  const upsertHistory = db.prepare(`
    INSERT INTO price_history (product_id, date, market, low) VALUES (?, ?, ?, ?)
    ON CONFLICT(product_id, date) DO UPDATE SET market = excluded.market, low = excluded.low`);

  let cardCount = 0;
  let priceCount = 0;
  transaction(() => {
    for (const { group, products, prices } of perGroup) {
      upsertSet.run(group.groupId, group.abbreviation ?? null, group.name, group.publishedOn ?? null, group.modifiedOn ?? null);

      const cardIds = new Set();
      for (const p of products) {
        // Les produits scellés (boosters, displays...) n'ont ni numéro ni type de carte ; les DON!! n'ont pas de numéro
        const cardType = ext(p, 'CardType');
        const number = ext(p, 'Number') ?? (cardType ? 'DON!!' : null);
        if (!number) continue;
        const { name, variant } = parseName(p.name);
        upsertCard.run(
          p.productId, group.groupId, name, p.name, variant, number,
          ext(p, 'Rarity'), ext(p, 'Color'), cardType, ext(p, 'Cost'), ext(p, 'Power'),
          ext(p, 'Counterplus'), ext(p, 'Life'), ext(p, 'Attribute'), ext(p, 'Subtypes'),
          stripHtml(ext(p, 'Description')), p.imageUrl ?? null, p.url ?? null, p.modifiedOn ?? null,
        );
        cardIds.add(p.productId);
        cardCount++;
      }

      // Une carte peut avoir plusieurs lignes de prix (Normal / Foil) : on garde "Normal" en priorité
      const best = new Map();
      for (const pr of prices) {
        if (!cardIds.has(pr.productId)) continue;
        const current = best.get(pr.productId);
        if (!current || (current.subTypeName !== 'Normal' && pr.subTypeName === 'Normal')) best.set(pr.productId, pr);
      }
      for (const pr of best.values()) {
        upsertPrice.run(pr.productId, pr.subTypeName, pr.marketPrice, pr.lowPrice, pr.midPrice, pr.highPrice, pr.directLowPrice, priceDate);
        upsertHistory.run(pr.productId, priceDate, pr.marketPrice, pr.lowPrice);
        priceCount++;
      }
    }
    if (usdPerEur) setMeta('usd_per_eur', usdPerEur);
    setMeta('price_date', priceDate);
    setMeta('last_sync', new Date().toISOString());
  });

  try {
    await syncCardmarket({ log });
  } catch (err) {
    log(`Prix Cardmarket indisponibles (${err.message}), on garde les précédents`);
  }

  snapshotCollectionValue();

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`Synchro terminée en ${seconds}s : ${cardCount} cartes, ${priceCount} prix (date ${priceDate}), 1 € = ${getMeta('usd_per_eur')} $`);
  return { cards: cardCount, prices: priceCount, priceDate, usdPerEur: Number(getMeta('usd_per_eur')) };
}

export function syncIsStale() {
  const last = getMeta('last_sync');
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > config.syncMaxAgeHours * 3600_000;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
