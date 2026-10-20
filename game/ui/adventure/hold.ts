// La Cale, sans interface : ce qu'on sait de chaque impression possédée (rareté, extension, couleur...), filtres et tris
// de l'écran de la Cale, limites d'un deck d'aventure, et résumé des taux de tirage calculé depuis la description des
// boosters (game/boosters/sets). Une carte de la Cale peut manquer du catalogue du navigateur (cartes SP d'autres
// extensions, cartes pas encore jouables) : ses informations viennent alors de la description des boosters, ou manquent.
import { BOOSTER_SETS, findVersion, variantLabel } from '../../boosters/sets/index.ts';
import { cardData, cardStatus } from '../../engine/cards/index.ts';
import { anyNumber, DECK_SIZE, MAX_COPIES } from '../../engine/deckRules.ts';
import type { CardDef, Category, Color } from '../../engine/types.ts';
import type { HoldCard } from './api.ts';

// Des plus courantes aux plus rares ; « SP CARD » : carte SP (affiche « Wanted »)
export const RARITIES = ['C', 'UC', 'R', 'L', 'SR', 'SEC', 'SP CARD'];
export const RARITY_LABELS: Record<string, string> = {
  C: 'Commune', UC: 'Peu commune', R: 'Rare', L: 'Leader', SR: 'Super rare', SEC: 'Secrète', 'SP CARD': 'Carte SP',
};

// Une impression de la Cale (numéro et version), avec ce qu'on sait de la carte
export interface HoldEntry {
  number: string;
  variant: string;
  count: number;
  rarity: string;            // rareté imprimée ('?' si inconnue)
  set: string;               // extension, d'après le numéro (« OP03 », « ST01 »)
  name: string;              // le numéro si la carte manque du catalogue
  colors: Color[];
  category: Category | null;
  cost: number | null;
  known: boolean;            // dans le catalogue du navigateur
  playable: boolean;         // le jeu sait la jouer (elle peut aller dans un deck)
}

export const setOf = (number: string) => number.split('-')[0];

// Rareté imprimée d'une impression : celle de la version spéciale, sinon celle du catalogue, sinon celle de la
// description des boosters
export function rarityOf(number: string, variant: string): string {
  const v = variant === 'base' ? undefined : findVersion(number, variant);
  if (v) return v.rarity;
  const d = cardData()[number];
  if (d?.rarity) return d.rarity;
  for (const s of Object.values(BOOSTER_SETS)) {
    for (const [rarity, list] of Object.entries(s.cards)) if (list.includes(number)) return rarity;
  }
  return '?';
}

export function holdEntries(cards: HoldCard[]): HoldEntry[] {
  return cards.filter((c) => c.count > 0).map((c) => {
    const d = cardData()[c.number];
    return {
      number: c.number, variant: c.variant, count: c.count, rarity: rarityOf(c.number, c.variant), set: setOf(c.number),
      name: d?.name ?? c.number, colors: d?.colors ?? [], category: d?.category ?? null, cost: d?.cost ?? null,
      known: Boolean(d), playable: Boolean(d) && cardStatus(c.number) !== 'todo',
    };
  });
}

// ---------- Filtres et tris de l'écran de la Cale ----------

export interface HoldFilter {
  q: string;                 // nom ou numéro
  color: Color | '';
  category: Category | '';
  rarity: string;
  set: string;
  version: '' | 'base' | 'special';
}
export const NO_FILTER: HoldFilter = { q: '', color: '', category: '', rarity: '', set: '', version: '' };

export type HoldSort = 'number' | 'rarity' | 'color' | 'cost' | 'count';
export const SORT_LABELS: Record<HoldSort, string> = {
  number: 'Numéro', rarity: 'Rareté', color: 'Couleur', cost: 'Coût', count: 'Exemplaires',
};

export function filterHold(entries: HoldEntry[], f: HoldFilter): HoldEntry[] {
  const text = f.q.trim().toLowerCase();
  return entries.filter((e) => (!f.color || e.colors.includes(f.color))
    && (!f.category || e.category === f.category)
    && (!f.rarity || e.rarity === f.rarity)
    && (!f.set || e.set === f.set)
    && (!f.version || (f.version === 'base') === (e.variant === 'base'))
    && (!text || e.number.toLowerCase().includes(text) || e.name.toLowerCase().includes(text)));
}

const COLOR_ORDER: Color[] = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
const VARIANT_ORDER = ['base', 'parallele', 'manga', 'sp'];
const rank = (list: readonly string[], x: string) => (list.includes(x) ? list.indexOf(x) : list.length);
const byNumber = (a: HoldEntry, b: HoldEntry) => a.number.localeCompare(b.number, 'fr', { numeric: true })
  || rank(VARIANT_ORDER, a.variant) - rank(VARIANT_ORDER, b.variant);
// les versions spéciales passent devant la version de base de même rareté
const rarityRank = (e: HoldEntry) => rank(RARITIES, e.rarity) * 10 + (e.variant === 'base' ? 0 : 5);

export function sortHold(entries: HoldEntry[], sort: HoldSort): HoldEntry[] {
  const compare: Record<HoldSort, (a: HoldEntry, b: HoldEntry) => number> = {
    number: byNumber,
    rarity: (a, b) => rarityRank(b) - rarityRank(a) || byNumber(a, b),
    color: (a, b) => rank(COLOR_ORDER, a.colors[0] ?? '') - rank(COLOR_ORDER, b.colors[0] ?? '') || (a.cost ?? 99) - (b.cost ?? 99) || byNumber(a, b),
    cost: (a, b) => (a.cost ?? 99) - (b.cost ?? 99) || byNumber(a, b),
    count: (a, b) => b.count - a.count || byNumber(a, b),
  };
  return [...entries].sort(compare[sort]);
}

// Valeurs proposées par les filtres : celles qu'on trouve dans la Cale
export function filterChoices(entries: HoldEntry[]) {
  const sets = [...new Set(entries.map((e) => e.set))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const rarities = RARITIES.filter((r) => entries.some((e) => e.rarity === r));
  return { sets, rarities };
}

export function holdSummary(entries: HoldEntry[]) {
  return {
    cards: entries.reduce((s, e) => s + e.count, 0),
    kinds: new Set(entries.map((e) => e.number)).size,
    special: entries.filter((e) => e.variant !== 'base').reduce((s, e) => s + e.count, 0),
  };
}

export const versionName = (variant: string) => (variant === 'base' ? '' : variantLabel(variant));

// ---------- Deck d'aventure ----------

// Exemplaires d'une carte qu'un deck d'aventure peut contenir : ceux de la Cale (toutes versions confondues, voir
// holdByNumber de api.ts), et 4 au plus (sauf carte permise en autant d'exemplaires qu'on veut)
export const holdLimit = (hold: Record<string, number>, d: CardDef) => Math.min(hold[d.number] ?? 0, anyNumber(d) ? DECK_SIZE : MAX_COPIES);

// Ce qui empêche un deck d'être un deck d'aventure (comme holdErrors de server/game-decks.js), en français
export function holdProblems(hold: Record<string, number>, leader: string, cards: Record<string, number>): string[] {
  const label = (num: string) => (cardData()[num] ? `${cardData()[num].name} (${num})` : num);
  const problems: string[] = [];
  for (const [num, n] of [[leader, 1] as [string, number], ...Object.entries(cards)]) {
    const have = hold[num] ?? 0;
    if (n > have) problems.push(have ? `${label(num)} : ${n} dans le deck, ${have} dans ta Cale` : `${label(num)} : absente de ta Cale`);
  }
  return problems;
}

// ---------- Taux de tirage, pour le joueur ----------

// Chance qu'un booster contienne une carte de chaque genre, calculée depuis la description de l'extension, exactement
// comme le générateur tire (game/boosters/open.ts : un booster seul est un booster pris au hasard dans un lot)
export interface Rate { label: string; chance: number }

export function boosterRates(set: string): { composition: string; rates: Rate[] } | undefined {
  const s = BOOSTER_SETS[set];
  if (!s) return undefined;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const { boosters, superRares, leaders, patterns } = s.lot;
  const lots = patterns.sec + patterns.oneHit + patterns.twoHits;
  const sec = patterns.sec / lots / boosters;
  const hits = (patterns.oneHit + 2 * patterns.twoHits) / lots / boosters;
  const sr = mean(superRares) / boosters;
  const weights = s.hits.reduce((sum, h) => sum + h.weight, 0);
  return {
    composition: `${s.commons + s.uncommons + 2} cartes : ${s.commons} communes, ${s.uncommons} peu communes, une rare (ou mieux) et une dernière carte : une commune, un Leader ou une surprise`,
    rates: [
      { label: 'Rare (R)', chance: 1 - sr - sec },
      { label: 'Super rare (SR)', chance: sr },
      { label: 'Secrète (SEC)', chance: sec },
      { label: 'Leader', chance: mean(leaders) / boosters },
      { label: 'Une surprise (version spéciale)', chance: hits },
      ...s.hits.map((h) => ({ label: `dont ${h.label}`, chance: hits * h.weight / weights })),
    ],
  };
}

// « 29 % · 1 booster sur 3 »
export function chanceText(p: number): string {
  const pct = p * 100;
  const shown = pct >= 10 ? Math.round(pct).toString() : pct >= 1 ? pct.toFixed(1).replace('.', ',') : pct.toFixed(2).replace('.', ',');
  const one = 1 / p;
  return p >= 0.5 ? `${shown} %` : `${shown} % · 1 booster sur ${one >= 10 ? Math.round(one).toLocaleString('fr-FR') : one.toFixed(1).replace('.', ',').replace(',0', '')}`;
}
