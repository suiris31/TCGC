// Catalogue du jeu : toutes les cartes des listes officielles de Bandai, en français (fr.onepiece-cardgame.com) et en
// anglais (en.onepiece-cardgame.com). Rien de Bandai n'est dans le dépôt : le serveur télécharge le catalogue au
// démarrage (server/game-cards.js), `npm run game:cards` fait de même pour les tests et les scripts.
//
// Chaque carte (un numéro) réunit toutes ses impressions :
// - ce que lisent les effets (types, couleurs, attributs, noms) est pris en VO, la seule langue où toutes les cartes
//   existent : ce sont des identifiants communs (« Revolutionary Army » = « Armée révolutionnaire ») ;
// - ce qui s'affiche (nom, types, texte, visuel) est en VF quand la carte existe en français, sinon en VO ;
// - quand les impressions diffèrent (errata, rééditions reformulées), c'est la plus récente qui compte.
import { leadingKeywords } from '../engine/keywords.ts';
import type { CardData, Category, Color } from '../engine/types.ts';

export { leadingKeywords, withoutReminders } from '../engine/keywords.ts';

export type Lang = 'fr' | 'en';

const SITES: Record<Lang, string> = { fr: 'https://fr.onepiece-cardgame.com', en: 'https://en.onepiece-cardgame.com' };
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (TCGC, simulateur de jeu)' };

// Une impression d'une carte, telle que la liste officielle d'une langue la présente
export interface Printing {
  lang: Lang;
  imageId: string;   // nom du visuel chez Bandai : numéro + suffixe de version (_p1 : illustration alternative, _r1 : réédition)
  number: string;
  series: string;    // extension : « OP-17 », « ST-35 », « OP15-EB04 »... ; « P » (promo) ou « AUTRE » (autres produits)
  rarity: string;
  category: Category;
  name: string;
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  colors: string[];
  types: string[];
  attributes: string[];
  effect: string;
  trigger: string | null;
  block: string;     // numéro de bloc imprimé (« 1 » à « 5 », « X »...)
}

export interface Catalog {
  fetchedAt: string;
  cards: Record<string, CardData>;
}

// Seules les vraies balises HTML sont retirées : les attributs sont écrits tels quels dans les textes (<Tranche>...)
const decode = (s: string) => s
  .replace(/<br\b[^>]*>/g, '\n').replace(/<\/?(?:h3|span|div|img|a|i|b|p|strong|em|ruby|rt|rp|small|sup|sub)\b[^>]*>/gi, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();

const num = (v: string | null) => (v == null || v === '-' || v === '' ? null : Number(v));

const CATEGORIES: Record<string, Category> = {
  LEADER: 'LEADER', CHARACTER: 'CHARACTER', EVENT: 'EVENT', STAGE: 'STAGE',
  PERSONNAGE: 'CHARACTER', 'ÉVÉNEMENTS': 'EVENT', 'ÉVÉNEMENT': 'EVENT', LIEU: 'STAGE',
};
const TRIGGER_LABEL: Record<Lang, RegExp> = { fr: /^\[Déclenchement\]\s*/, en: /^\[Trigger\]\s*/ };

// Extensions proposées par la liste officielle : identifiant de la page et code de l'extension
export function parseSeriesList(html: string): { id: string; series: string }[] {
  return [...html.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map(([, id, label]) => {
    const text = decode(decode(label));
    const code = text.match(/\[([A-Z0-9]+-[A-Z0-9]+)\]/)?.[1];
    return { id, series: code ?? (/promo/i.test(text) ? 'P' : 'AUTRE') };
  });
}

export function parsePrintings(html: string, lang: Lang, series: string): Printing[] {
  const out: Printing[] = [];
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
    const [, imageId, body] = m;
    const div = (cls: string) => {
      const d = body.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`));
      return d ? decode(d[1].replace(/<h3>[\s\S]*?<\/h3>/, '')) : null;
    };
    const infoCol = body.match(/<div class="infoCol">([\s\S]*?)<\/div>/);
    const name = body.match(/<div class="cardName">([\s\S]*?)<\/div>/);
    if (!infoCol || !name) continue;
    const info = [...infoCol[1].matchAll(/<span>(.*?)<\/span>/g)].map((x) => x[1]);
    const category = CATEGORIES[info[2]];
    if (!category) continue;
    const costLabel = body.match(/<div class="cost"><h3>(.*?)<\/h3>/)?.[1];
    const isLife = costLabel === 'Vie' || costLabel === 'Life';
    const costValue = num(div('cost'));
    const trigger = div('trigger');
    const list = (v: string | null) => (v ?? '').split('/').map((x) => x.trim()).filter((x) => x && x !== '-');
    out.push({
      lang, imageId, number: info[0], series, rarity: info[1], category,
      name: decode(name[1]),
      cost: isLife ? null : costValue,
      life: isLife ? costValue : null,
      power: num(div('power')),
      counter: num(div('counter')),
      colors: list(div('color')),
      types: list(div('feature')),
      attributes: list(body.match(/<div class="attribute">[\s\S]*?<i>(.*?)<\/i>/)?.[1] ?? null),
      effect: div('text') ?? '',
      trigger: trigger ? trigger.replace(TRIGGER_LABEL[lang], '') : null,
      block: div('block') ?? '',
    });
  }
  return out;
}

async function text(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// Toutes les impressions d'une langue : une page par extension, une requête à la fois
export async function fetchPrintings(lang: Lang, log: (msg: string) => void = () => {}): Promise<Printing[]> {
  const series = parseSeriesList(await text(`${SITES[lang]}/cardlist/`));
  if (!series.length) throw new Error(`liste officielle ${lang} : aucune extension trouvée`);
  const out: Printing[] = [];
  for (const s of series) out.push(...parsePrintings(await text(`${SITES[lang]}/cardlist/?series=${s.id}`), lang, s.series));
  log(`liste officielle ${lang} : ${series.length} extensions, ${out.length} impressions`);
  return out;
}

export async function fetchCatalog(log: (msg: string) => void = () => {}): Promise<Catalog> {
  const printings = [...await fetchPrintings('en', log), ...await fetchPrintings('fr', log)];
  return { fetchedAt: new Date().toISOString(), cards: buildCatalog(printings) };
}

// ---------- Réunir les impressions d'une carte ----------

// Extensions dans l'ordre de leur sortie en VO, de la plus ancienne à la plus récente (même rang : même jour). Sert à
// prendre la version la plus récente d'une carte rééditée. Une extension absente de cette liste est une nouveauté :
// elle passe avant toutes les autres ; les cartes promo et « autres produits » passent après les extensions.
const RELEASES = [
  'ST-01 ST-02 ST-03 ST-04 OP-01', 'ST-05', 'OP-02 ST-06', 'OP-03 ST-07', 'ST-08 ST-09', 'OP-04', 'ST-10', 'OP-05',
  'ST-11', 'OP-06 ST-12', 'ST-13', 'EB-01', 'OP-07', 'ST-14', 'OP-08', 'ST-15 ST-16 ST-17 ST-18 ST-19 ST-20', 'PRB-01',
  'OP-09', 'ST-21 OP-10', 'EB-02', 'OP-11 ST-23 ST-24 ST-25 ST-26 ST-27 ST-28', 'OP-12', 'ST-22', 'PRB-02', 'OP-13',
  'OP14-EB04 ST-29', 'EB-03', 'OP15-EB04', 'OP-16 ST-30', 'ST-31 ST-32 ST-33 ST-34 ST-35 ST-36', 'OP-17',
];
const RANK = new Map(RELEASES.flatMap((group, i) => group.split(' ').map((s) => [s, i] as const)));

function releaseRank(series: string) {
  if (series === 'P' || series === 'AUTRE') return -1;
  return RANK.get(series) ?? RELEASES.length;
}

const isParallel = (p: Printing) => /_p\d+$/.test(p.imageId);
const version = (p: Printing) => Number(p.imageId.match(/_[a-z](\d+)$/)?.[1] ?? 0);

// La plus récente d'abord ; dans une même extension, la version normale avant les illustrations alternatives
function newestFirst(list: Printing[]) {
  return [...list].sort((a, b) => releaseRank(b.series) - releaseRank(a.series)
    || Number(isParallel(a)) - Number(isParallel(b)) || version(a) - version(b) || a.imageId.localeCompare(b.imageId));
}

const COLORS: Color[] = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];

// Noms d'une carte pour les effets : son nom en VO, et ceux qu'elle porte aussi selon les règles
// (« Also treat this card's name as [Usopp] », Rosinante & Law EB04-038)
export function cardNames(nameEn: string, effectEn: string): string[] {
  const also = effectEn.match(/also treat this card's name as ((?:\[[^\]]+\](?:\s*(?:,|and|or)\s*)?)+)/i)?.[1];
  return [nameEn, ...(also ? [...also.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]) : [])];
}

// Libellé VF de chaque type de la VO : le plus fréquent sur les cartes qui existent dans les deux langues (même
// numéro, mêmes types dans le même ordre)
function typeLabels(en: Map<string, Printing>, fr: Map<string, Printing>): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const [n, f] of fr) {
    const e = en.get(n);
    if (!e || e.types.length !== f.types.length) continue;
    e.types.forEach((t, i) => {
      const v = votes.get(t) ?? new Map<string, number>();
      v.set(f.types[i], (v.get(f.types[i]) ?? 0) + 1);
      votes.set(t, v);
    });
  }
  return new Map([...votes].map(([t, v]) => [t, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
}

export function buildCatalog(printings: Printing[]): Record<string, CardData> {
  const byNumber = (lang: Lang) => {
    const m = new Map<string, Printing[]>();
    for (const p of printings) if (p.lang === lang) m.set(p.number, [...(m.get(p.number) ?? []), p]);
    return new Map([...m].map(([n, list]) => [n, newestFirst(list)]));
  };
  const en = byNumber('en');
  const fr = byNumber('fr');
  const newestEn = new Map([...en].map(([n, list]) => [n, list[0]]));
  const newestFr = new Map([...fr].map(([n, list]) => [n, list[0]]));
  const labels = typeLabels(newestEn, newestFr);

  // Une carte qui n'existerait qu'en VF (il n'y en a aucune) serait ignorée : les identifiants communs viennent de la VO
  const cards: Record<string, CardData> = {};
  for (const [number, list] of en) {
    const e = list[0];
    const frList = fr.get(number);
    const shown = frList ?? list;
    // texte de l'impression la plus récente ; visuel : la version normale qui porte ce texte plutôt qu'une
    // illustration alternative
    const d = shown[0];
    const image = shown.find((p) => !isParallel(p) && p.effect === d.effect && p.trigger === d.trigger && p.name === d.name) ?? d;
    // visuels des decks pour débutant (« ST-35 » -> « OP13-004_p2 ») : une carte d'un deck préconstruit garde
    // l'illustration de ce deck (voir cards/index.ts)
    const deckArt = Object.fromEntries(shown.filter((p) => p.series.startsWith('ST-')).reverse().map((p) => [p.series, p.imageId]));
    cards[number] = {
      number,
      imageId: image.imageId,
      ...(Object.keys(deckArt).length ? { deckArt } : {}),
      lang: d.lang,
      rarity: e.rarity,
      category: e.category,
      name: d.name,
      names: cardNames(e.name, e.effect),
      cost: e.cost,
      life: e.life,
      power: e.power,
      counter: e.counter,
      colors: e.colors.filter((c): c is Color => (COLORS as string[]).includes(c)),
      types: e.types,
      typeLabels: frList ? d.types : e.types.map((t) => labels.get(t) ?? t),
      attributes: e.attributes,
      effect: d.effect,
      trigger: d.trigger,
      effectEn: e.effect,
      triggerEn: e.trigger,
      keywords: leadingKeywords(e.effect),
      blocks: [...new Set([...list, ...(frList ?? [])].map((p) => p.block).filter(Boolean))].sort(),
    };
  }
  return cards;
}
