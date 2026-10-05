// Prix Cardmarket (marché européen, en €) depuis les fichiers publics quotidiens de Cardmarket.
//
// Ces fichiers ne disent pas à quelle variante (normale, parallèle, manga...) correspond chaque produit,
// ni à quelle langue correspond chaque extension. On reconstitue l'association avec le catalogue TCGplayer :
// 1. les produits scellés révèlent les extensions japonaises ("(Non-English)", "(Asia Region Legal)") :
//    on les écarte, les cartes françaises étant vendues dans les extensions internationales ;
// 2. chaque extension TCGplayer est associée à l'extension Cardmarket qui a le plus de codes en commun ;
// 3. pour un même code, les variantes sont appariées dans l'ordre d'ajout au catalogue, à condition que les
//    prix des deux marchés restent cohérents ; sinon par proximité de prix ; sinon on n'apparie pas.
// Les cartes non appariées gardent le prix TCGplayer.
import { db, setMeta, transaction } from './db.js';
import { usdPerEur } from './valuation.js';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const GAME = 18; // One Piece Card Game
const CODE_RE = /\(([A-Z0-9]+-\d+)\)/;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TCGC-personal-collection/0.1' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Prix de référence d'un produit Cardmarket : la tendance, à défaut les moyennes de ventes
function cmPrice(g) {
  return g?.trend || g?.avg30 || g?.avg7 || g?.avg || null;
}

// Deux prix du même produit sur les deux marchés restent dans un rapport raisonnable (les cartes à
// moins d'1 € sont trop bruitées pour en juger)
function consistent(a, b, factor) {
  if (a == null || b == null) return true;
  if (a < 1 && b < 1) return true;
  return a / b <= factor && b / a <= factor;
}

export async function syncCardmarket({ log = console.log } = {}) {
  const [singles, sealed, guide] = await Promise.all([
    getJson(`${BASE}/productList/products_singles_${GAME}.json`),
    getJson(`${BASE}/productList/products_nonsingles_${GAME}.json`),
    getJson(`${BASE}/priceGuide/price_guide_${GAME}.json`),
  ]);
  const guideById = new Map(guide.priceGuides.map((g) => [g.idProduct, g]));
  const priceDate = (guide.createdAt ?? new Date().toISOString()).slice(0, 10);

  // 1. Extensions japonaises
  const asia = new Set(sealed.products
    .filter((p) => /\(Non-English\)|Asia Region/i.test(p.name))
    .map((p) => p.idExpansion));

  const cmByExpCode = new Map(); // "exp|code" -> produits
  const cmCodesByExp = new Map();
  const cmByCode = new Map();
  for (const p of singles.products) {
    const code = p.name.match(CODE_RE)?.[1];
    if (!code || asia.has(p.idExpansion)) continue;
    const key = `${p.idExpansion}|${code}`;
    if (!cmByExpCode.has(key)) cmByExpCode.set(key, []);
    cmByExpCode.get(key).push(p);
    if (!cmCodesByExp.has(p.idExpansion)) cmCodesByExp.set(p.idExpansion, new Set());
    cmCodesByExp.get(p.idExpansion).add(code);
    if (!cmByCode.has(code)) cmByCode.set(code, []);
    cmByCode.get(code).push(p);
  }

  const rate = usdPerEur();
  const tcgCards = db.prepare(`SELECT c.product_id, c.group_id, c.number, COALESCE(p.market, p.low, p.mid) AS usd
    FROM cards c LEFT JOIN prices p ON p.product_id = c.product_id`).all()
    .map((r) => ({ id: r.product_id, group: r.group_id, number: r.number, eur: r.usd == null ? null : r.usd / rate }));
  const tcgCodesByGroup = new Map();
  const tcgByGroupCode = new Map();
  for (const c of tcgCards) {
    if (!tcgCodesByGroup.has(c.group)) tcgCodesByGroup.set(c.group, new Set());
    tcgCodesByGroup.get(c.group).add(c.number);
    const key = `${c.group}|${c.number}`;
    if (!tcgByGroupCode.has(key)) tcgByGroupCode.set(key, []);
    tcgByGroupCode.get(key).push(c);
  }

  // 2. Extension TCGplayer -> extension Cardmarket (indice de Jaccard sur les codes)
  const expOfGroup = new Map();
  for (const [group, codes] of tcgCodesByGroup) {
    let best = null;
    for (const [exp, expCodes] of cmCodesByExp) {
      let inter = 0;
      for (const code of codes) if (expCodes.has(code)) inter++;
      if (inter < Math.max(3, codes.size / 2)) continue;
      const jaccard = inter / (codes.size + expCodes.size - inter);
      if (!best || jaccard > best.jaccard) best = { exp, jaccard };
    }
    if (best) expOfGroup.set(group, best.exp);
  }

  // 3. Appariement des variantes
  const pairs = new Map(); // id TCGplayer -> produit Cardmarket
  const used = new Set();
  const take = (t, p) => { pairs.set(t.id, p); used.add(p.idProduct); };

  for (const [key, tcgList] of tcgByGroupCode) {
    const [group, code] = key.split('|');
    const exp = expOfGroup.get(Number(group));
    if (exp === undefined) continue;
    const cmList = (cmByExpCode.get(`${exp}|${code}`) ?? []).filter((p) => !used.has(p.idProduct));
    if (!cmList.length) continue;
    const tcgSorted = [...tcgList].sort((a, b) => a.id - b.id);
    const cmSorted = [...cmList].sort((a, b) => a.idProduct - b.idProduct);

    if (tcgSorted.length === 1 && cmSorted.length === 1) {
      take(tcgSorted[0], cmSorted[0]); // une seule version de chaque côté : sans ambiguïté
      continue;
    }
    if (tcgSorted.length === cmSorted.length) {
      const byOrder = tcgSorted.map((t, i) => [t, cmSorted[i]]);
      const eurOf = (p) => cmPrice(guideById.get(p.idProduct)) ?? 0;
      const cmByPrice = [...cmSorted].sort((a, b) => eurOf(a) - eurOf(b));
      const byPrice = [...tcgSorted].sort((a, b) => (a.eur ?? 0) - (b.eur ?? 0)).map((t, i) => [t, cmByPrice[i]]);
      const ok = (assignment) => assignment.every(([t, p]) => consistent(t.eur, cmPrice(guideById.get(p.idProduct)), 4));
      const chosen = ok(byOrder) ? byOrder : ok(byPrice) ? byPrice : null;
      if (chosen) for (const [t, p] of chosen) take(t, p);
      continue;
    }
    matchByPrice(tcgSorted, cmSorted, guideById, 3, take);
  }

  // Deuxième passe (promos, cartes restantes) : même code, toutes extensions internationales confondues
  const leftovers = new Map();
  for (const c of tcgCards) {
    if (pairs.has(c.id)) continue;
    if (!leftovers.has(c.number)) leftovers.set(c.number, []);
    leftovers.get(c.number).push(c);
  }
  for (const [code, tcgList] of leftovers) {
    const cmList = (cmByCode.get(code) ?? []).filter((p) => !used.has(p.idProduct));
    if (cmList.length) matchByPrice(tcgList, cmList, guideById, 3, take);
  }

  const upsert = db.prepare(`INSERT INTO cm_prices (product_id, cm_id, trend, avg30, avg7, avg1, avg, low, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET cm_id = excluded.cm_id, trend = excluded.trend, avg30 = excluded.avg30,
      avg7 = excluded.avg7, avg1 = excluded.avg1, avg = excluded.avg, low = excluded.low, date = excluded.date`);
  const history = db.prepare(`INSERT INTO price_history (product_id, date, cm, cm_trend, cm_avg, cm_avg1, cm_avg7, cm_avg30, cm_low)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, date) DO UPDATE SET cm = excluded.cm, cm_trend = excluded.cm_trend, cm_avg = excluded.cm_avg,
      cm_avg1 = excluded.cm_avg1, cm_avg7 = excluded.cm_avg7, cm_avg30 = excluded.cm_avg30, cm_low = excluded.cm_low`);
  // 0 dans le guide = pas de vente sur la période
  const value = (v) => v || null;
  transaction(() => {
    db.exec('DELETE FROM cm_prices');
    for (const [id, p] of pairs) {
      const g = guideById.get(p.idProduct);
      upsert.run(id, p.idProduct, value(g?.trend), value(g?.avg30), value(g?.avg7), value(g?.avg1), value(g?.avg), value(g?.low), priceDate);
      if (cmPrice(g) != null) {
        history.run(id, priceDate, cmPrice(g), value(g.trend), value(g.avg), value(g.avg1), value(g.avg7), value(g.avg30), value(g.low));
      }
    }
    setMeta('cm_price_date', priceDate);
  });
  log(`Cardmarket : ${pairs.size} cartes associées à un prix européen (${tcgCards.length - pairs.size} restent sur TCGplayer)`);
  return pairs.size;
}

// Appariement glouton par proximité de prix, en refusant les écarts supérieurs à `factor`
function matchByPrice(tcgList, cmList, guideById, factor, take) {
  const candidates = [];
  for (const t of tcgList) {
    for (const p of cmList) {
      const eur = cmPrice(guideById.get(p.idProduct));
      if (t.eur == null || eur == null || !consistent(t.eur, eur, factor)) continue;
      candidates.push({ t, p, distance: Math.abs(Math.log(Math.max(t.eur, 0.01) / Math.max(eur, 0.01))) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const doneT = new Set();
  const doneP = new Set();
  for (const { t, p } of candidates) {
    if (doneT.has(t.id) || doneP.has(p.idProduct)) continue;
    doneT.add(t.id);
    doneP.add(p.idProduct);
    take(t, p);
  }
}
