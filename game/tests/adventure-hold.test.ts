// La Cale sans interface (tâche 1.18, game/ui/adventure/hold.ts) : rareté et extension de chaque impression, même
// absente du catalogue ; filtres et tris de l'écran ; limites d'un deck d'aventure ; taux de tirage affichés au joueur,
// comparés à ceux du générateur sur 30 000 boosters.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openBooster } from '../boosters/open.ts';
import { BOOSTER_SETS } from '../boosters/sets/index.ts';
import type { PulledCard, Rand } from '../boosters/types.ts';
import { CARDS } from '../engine/cards/index.ts';
import { anyNumber } from '../engine/deckRules.ts';
import {
  boosterRates, chanceText, filterChoices, filterHold, holdEntries, holdLimit, holdProblems, holdSummary, NO_FILTER, rarityOf, sortHold,
} from '../ui/adventure/hold.ts';

function seeded(seed: number): Rand {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOLD = [
  { number: 'ST01-001', variant: 'base', count: 1 },
  { number: 'OP03-001', variant: 'base', count: 1 },
  { number: 'OP03-001', variant: 'parallele', count: 2 },
  { number: 'OP03-122', variant: 'manga', count: 1 },
  { number: 'OP03-006', variant: 'base', count: 4 },
  { number: 'ST01-012', variant: 'sp', count: 1 },
  { number: 'OP03-013', variant: 'base', count: 0 },   // ligne vide : ignorée
];

test('Cale : rareté et extension de chaque impression, même hors du catalogue', () => {
  assert.equal(rarityOf('OP03-001', 'base'), 'L');
  assert.equal(rarityOf('OP03-001', 'parallele'), 'L');
  assert.equal(rarityOf('OP03-122', 'manga'), 'SEC');
  assert.equal(rarityOf('ST01-012', 'sp'), 'SP CARD');
  assert.equal(rarityOf('OP03-006', 'base'), 'C');
  // une carte d'OP03 se retrouve dans la description des boosters, sans le catalogue
  for (const [rarity, list] of Object.entries(BOOSTER_SETS.OP03.cards)) for (const n of list) assert.equal(rarityOf(n, 'base'), rarity, n);
  assert.equal(rarityOf('ZZ99-999', 'base'), '?');
  const entries = holdEntries(HOLD);
  assert.equal(entries.length, 6);
  assert.deepEqual([...new Set(entries.map((e) => e.set))].sort(), ['OP03', 'ST01']);
  const unknown = holdEntries([{ number: 'ZZ99-999', variant: 'base', count: 2 }])[0];
  assert.equal(unknown.known, false);
  assert.equal(unknown.playable, false);
  assert.equal(unknown.name, 'ZZ99-999');
  assert.deepEqual(holdSummary(entries), { cards: 10, kinds: 5, special: 4 });
});

test('Cale : filtres et tris', () => {
  const entries = holdEntries(HOLD);
  const keys = (list: typeof entries) => list.map((e) => `${e.number}|${e.variant}`);
  assert.deepEqual(keys(filterHold(entries, { ...NO_FILTER, version: 'special' })), ['OP03-001|parallele', 'OP03-122|manga', 'ST01-012|sp']);
  assert.deepEqual(keys(filterHold(entries, { ...NO_FILTER, set: 'ST01' })), ['ST01-001|base', 'ST01-012|sp']);
  assert.deepEqual(keys(filterHold(entries, { ...NO_FILTER, rarity: 'L' })), ['ST01-001|base', 'OP03-001|base', 'OP03-001|parallele']);
  assert.deepEqual(keys(filterHold(entries, { ...NO_FILTER, q: 'op03-00' })), ['OP03-001|base', 'OP03-001|parallele', 'OP03-006|base']);
  if (CARDS['ST01-001']) {
    assert.deepEqual(keys(filterHold(entries, { ...NO_FILTER, category: 'LEADER', set: 'ST01' })), ['ST01-001|base']);
    assert.ok(filterHold(entries, { ...NO_FILTER, color: 'Red' }).some((e) => e.number === 'ST01-001'));
  }
  // par numéro, la version de base avant ses versions spéciales ; par rareté, la plus rare d'abord
  assert.deepEqual(keys(sortHold(entries, 'number')).slice(0, 3), ['OP03-001|base', 'OP03-001|parallele', 'OP03-006|base']);
  assert.deepEqual(keys(sortHold(entries, 'rarity')).slice(0, 2), ['ST01-012|sp', 'OP03-122|manga']);
  assert.equal(sortHold(entries, 'count')[0].number, 'OP03-006');
  const choices = filterChoices(entries);
  assert.deepEqual(choices.sets, ['OP03', 'ST01']);
  assert.deepEqual(choices.rarities, ['C', 'L', 'SEC', 'SP CARD'].filter((r) => entries.some((e) => e.rarity === r)));
});

test('Deck d’aventure : au plus min(Cale, 4) exemplaires, problèmes comme le serveur', () => {
  const nums = Object.keys(CARDS).filter((n) => CARDS[n].category === 'CHARACTER');
  const plain = CARDS[nums.find((n) => !anyNumber(CARDS[n]))!];
  assert.equal(holdLimit({ [plain.number]: 2 }, plain), 2);
  assert.equal(holdLimit({ [plain.number]: 9 }, plain), 4);
  assert.equal(holdLimit({}, plain), 0);
  const many = nums.find((n) => anyNumber(CARDS[n]));
  if (many) assert.equal(holdLimit({ [many]: 9 }, CARDS[many]), 9);
  const leader = Object.keys(CARDS).find((n) => CARDS[n].category === 'LEADER')!;
  assert.deepEqual(holdProblems({ [leader]: 1, [plain.number]: 3 }, leader, { [plain.number]: 3 }), []);
  const problems = holdProblems({ [plain.number]: 2 }, leader, { [plain.number]: 3 });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /absente de ta Cale/);
  assert.match(problems[1], /3 dans le deck, 2 dans ta Cale/);
});

test('Taux de tirage affichés : ceux du générateur (30 000 boosters)', () => {
  const r = boosterRates('OP03')!;
  assert.match(r.composition, /^12 cartes : 7 communes, 3 peu communes/);
  assert.equal(boosterRates('XX99'), undefined);
  const rate = (label: string) => r.rates.find((x) => x.label === label)!.chance;
  const N = 30_000;
  const rand = seeded(118);
  const seen: Record<string, number> = {};
  const add = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
  const base = (c: PulledCard, rarity: string) => c.variant === 'base' && c.rarity === rarity;
  for (let i = 0; i < N; i++) {
    const cards = openBooster('OP03', rand).cards;
    if (cards.some((c) => base(c, 'R'))) add('Rare (R)');
    if (cards.some((c) => base(c, 'SR'))) add('Super rare (SR)');
    if (cards.some((c) => base(c, 'SEC'))) add('Secrète (SEC)');
    if (cards.some((c) => base(c, 'L'))) add('Leader');
    const special = cards.find((c) => c.variant !== 'base');
    if (special) {
      add('Une surprise (version spéciale)');
      const kind = BOOSTER_SETS.OP03.hits.find((h) => h.versions.some((v) => v.number === special.number && v.variant === special.variant))!;
      add(`dont ${kind.label}`);
    }
  }
  // genres exclusifs dans l'emplacement rare : leur somme fait 1
  assert.ok(Math.abs(rate('Rare (R)') + rate('Super rare (SR)') + rate('Secrète (SEC)') - 1) < 1e-9);
  for (const { label, chance } of r.rates) {
    const expected = chance * N;
    const observed = seen[label] ?? 0;
    assert.ok(Math.abs(observed - expected) <= 5 * Math.sqrt(expected) + 2, `${label} : ${observed} pour ${expected.toFixed(1)} attendus`);
  }
});

test('Taux de tirage : écriture pour le joueur', () => {
  assert.equal(chanceText(0.68), '68 %');
  assert.equal(chanceText(0.2917), '29 % · 1 booster sur 3,4');
  assert.equal(chanceText(0.0276), '2,8 % · 1 booster sur 36');
  assert.equal(chanceText(1 / 1440), '0,07 % · 1 booster sur 1 440');   // espace fine insécable de toLocaleString
});
