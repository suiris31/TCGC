// Ouverture des boosters aux taux réels (version anglaise). Le tirage se fait sur le serveur, avec un aléatoire
// cryptographique : le navigateur ne reçoit que le résultat. Composition et taux : sets/*.ts et game/docs/boosters.md.
//
// Un booster de 12 cartes : 7 communes, 3 peu communes, un emplacement « libre » (une commune, ou un Leader, ou
// une surprise : parallèle, carte SP, manga) et un emplacement « rare » (R, SR ou SEC). Les taux ont été comptés par
// display japonais, qui contient autant de cartes que 12 boosters anglais : on tire donc les boosters par « lot » de
// 12, avec les garanties observées (3 ou 4 SR, 3 ou 4 Leaders, une SEC ou une à deux surprises). Un display en a deux.
import { BOOSTER_SETS, type BoosterSet, type Version, versionImage } from './sets/index.ts';
import type { BoosterContent, PulledCard, Rand } from './types.ts';

export const BOOSTER_SIZE = 12;
export const DISPLAY_SIZE = 24;

export const boosterSets = (): string[] => Object.keys(BOOSTER_SETS);

function setOf(set: string): BoosterSet {
  const s = BOOSTER_SETS[set];
  if (!s) throw new Error(`Pas de booster pour l’extension ${set}`);
  return s;
}

const index = (n: number, rand: Rand) => Math.min(n - 1, Math.floor(rand() * n));
const pick = <T>(list: readonly T[], rand: Rand): T => list[index(list.length, rand)];

// k éléments distincts (début d'un mélange de Fisher-Yates)
function sample<T>(list: readonly T[], k: number, rand: Rand): T[] {
  const a = [...list];
  for (let i = 0; i < k; i++) {
    const j = i + index(a.length - i, rand);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

function weighted<T>(items: readonly T[], weight: (item: T) => number, rand: Rand): T {
  let r = rand() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

// Ce que contiennent les deux derniers emplacements d'un booster
interface Plan { rare: 'R' | 'SR' | 'SEC'; free: 'C' | 'L' | Version }

function lotPlans(s: BoosterSet, rand: Rand): Plan[] {
  const { boosters, superRares, leaders, patterns } = s.lot;
  const plans: Plan[] = Array.from({ length: boosters }, () => ({ rare: 'R', free: 'C' }));
  const pattern = weighted(['sec', 'oneHit', 'twoHits'] as const, (p) => patterns[p], rand);
  const secs = pattern === 'sec' ? 1 : 0;
  const hits = pattern === 'twoHits' ? 2 : pattern === 'oneHit' ? 1 : 0;
  const srs = pick(superRares, rand);
  const ls = pick(leaders, rand);
  const all = plans.map((_, i) => i);
  // emplacement rare : SR et SEC dans des boosters différents ; emplacement libre : Leaders et surprises aussi
  sample(all, srs + secs, rand).forEach((b, i) => { plans[b].rare = i < srs ? 'SR' : 'SEC'; });
  sample(all, ls + hits, rand).forEach((b, i) => {
    plans[b].free = i < ls ? 'L' : pick(weighted(s.hits, (h) => h.weight, rand).versions, rand);
  });
  return plans;
}

// Ordre de révélation, comme dans un vrai booster : les plus rares à la fin, les versions spéciales en dernier
const RARITY_ORDER = ['C', 'UC', 'L', 'R', 'SR', 'SEC', 'SP CARD'];
const VARIANT_ORDER = ['base', 'parallele', 'sp', 'manga'];
const revealRank = (c: PulledCard) => VARIANT_ORDER.indexOf(c.variant) * 10 + RARITY_ORDER.indexOf(c.rarity);

const base = (rarity: string) => (number: string): PulledCard => ({ number, rarity, variant: 'base' });

function fill(s: BoosterSet, plan: Plan, rand: Rand): BoosterContent {
  const cards = [
    ...sample(s.cards.C, s.commons + (plan.free === 'C' ? 1 : 0), rand).map(base('C')),
    ...sample(s.cards.UC, s.uncommons, rand).map(base('UC')),
  ];
  if (plan.free === 'L') cards.push(base('L')(pick(s.cards.L, rand)));
  else if (plan.free !== 'C') {
    const v = plan.free;
    cards.push({ number: v.number, rarity: v.rarity, variant: v.variant, imageUrl: versionImage(v) });
  }
  cards.push(base(plan.rare)(pick(s.cards[plan.rare], rand)));
  cards.sort((a, b) => revealRank(a) - revealRank(b) || a.number.localeCompare(b.number));
  return { set: s.set, cards };
}

// Un booster seul (récompense d'un chapitre) : un booster pris au hasard dans un lot complet. Il a donc exactement les
// taux d'un display, sans ses garanties, comme un booster vendu à l'unité.
export function openBooster(set: string, rand: Rand): BoosterContent {
  const s = setOf(set);
  const plans = lotPlans(s, rand);
  return fill(s, plans[index(plans.length, rand)], rand);
}

// Un display : deux lots, boosters mélangés
export function openDisplay(set: string, rand: Rand): BoosterContent[] {
  const s = setOf(set);
  const plans: Plan[] = [];
  while (plans.length < DISPLAY_SIZE) plans.push(...lotPlans(s, rand));
  return sample(plans, DISPLAY_SIZE, rand).map((plan) => fill(s, plan, rand));
}
