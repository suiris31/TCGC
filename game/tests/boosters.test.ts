// Boosters OP03 (tâche 1.5) : composition de chaque booster, taux mesurés sur 100 000 boosters, garanties de chaque
// display, numéros et versions spéciales cohérents avec le catalogue. Taux attendus : game/docs/boosters.md.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOSTER_SIZE, boosterSets, DISPLAY_SIZE, openBooster, openDisplay } from '../boosters/open.ts';
import { BOOSTER_SETS, findVersion, variantLabel, versionImageUrl } from '../boosters/sets/index.ts';
import type { BoosterContent, PulledCard, Rand } from '../boosters/types.ts';
import { CARDS, cardData } from '../engine/cards/index.ts';

// Tirage reproductible (mulberry32), comme le hasard des parties
function seeded(seed: number): Rand {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OP03 = BOOSTER_SETS.OP03;
const hit = (c: PulledCard) => c.variant !== 'base';
const isBase = (rarity: string) => (c: PulledCard) => c.variant === 'base' && c.rarity === rarity;
const count = (cards: PulledCard[], f: (c: PulledCard) => boolean) => cards.filter(f).length;

// Taux attendus par display (24 boosters = 2 lots ; 145 displays japonais comptés, voir boosters.md)
const WEIGHTS = { 'parallele-sr': 55, 'parallele-r': 30, 'parallele-l': 23, sp: 12, 'parallele-sec': 11, manga: 1.2 };
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
const HITS = 2 * (61 + 2 * 36) / 145;   // surprises par display : 1,83
const PER_DISPLAY = {
  SR: 7, L: 7, SEC: 2 * 48 / 145, hits: HITS,
  ...Object.fromEntries(Object.entries(WEIGHTS).map(([id, w]) => [id, (HITS * w) / TOTAL_WEIGHT])),
};
const kindOf = (c: PulledCard) => OP03.hits.find((h) => h.versions.some((v) => v.number === c.number && v.variant === c.variant))?.id;

// Écart toléré sur un nombre de tirages : 5 écarts-types (loi de Poisson), donc jamais atteint par hasard
const near = (observed: number, expected: number, label: string) =>
  assert.ok(Math.abs(observed - expected) <= 5 * Math.sqrt(expected) + 1, `${label} : ${observed} pour ${expected.toFixed(1)} attendus`);

// Un booster bien formé : 7 ou 8 C, 3 UC, une R, SR ou SEC (emplacement rare) et, à la place de la 8e commune, un
// Leader ou une surprise ; pas deux fois la même impression ; les cartes rares à la fin, les versions spéciales en dernier
function checkBooster(b: BoosterContent) {
  assert.equal(b.set, 'OP03');
  assert.equal(b.cards.length, BOOSTER_SIZE);
  const commons = count(b.cards, isBase('C'));
  assert.ok(commons === 7 || commons === 8, `${commons} communes`);
  assert.equal(count(b.cards, isBase('UC')), 3);
  assert.equal(count(b.cards, (c) => c.variant === 'base' && ['R', 'SR', 'SEC'].includes(c.rarity)), 1);
  assert.equal(commons - 7 + count(b.cards, isBase('L')) + count(b.cards, hit), 1);
  assert.equal(new Set(b.cards.map((c) => `${c.number}|${c.variant}`)).size, BOOSTER_SIZE);
  const firstHit = b.cards.findIndex(hit);
  if (firstHit >= 0) assert.equal(firstHit, BOOSTER_SIZE - 1, 'la surprise est la dernière carte');
  const order = ['C', 'UC', 'L', 'R', 'SR', 'SEC'];
  const ranks = b.cards.filter((c) => !hit(c)).map((c) => order.indexOf(c.rarity));
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
  for (const c of b.cards) {
    assert.ok(CARDS[c.number], `${c.number} absent du catalogue`);
    if (hit(c)) {
      const v = findVersion(c.number, c.variant);
      assert.ok(v, `${c.number} ${c.variant} : version inconnue`);
      assert.equal(c.rarity, v.rarity);
      assert.equal(c.imageUrl, `img-en-hd/${v.imageId}.webp`);
    } else {
      assert.equal(c.imageUrl, undefined);
      assert.ok(OP03.cards[c.rarity as keyof typeof OP03.cards].includes(c.number), `${c.number} n’est pas une ${c.rarity} d’OP03`);
    }
  }
}

test('boosters : contrat (OP03, 12 cartes, display de 24), même tirage = même booster', () => {
  assert.deepEqual(boosterSets(), ['OP03']);
  assert.equal(BOOSTER_SIZE, OP03.commons + OP03.uncommons + 2);
  assert.equal(DISPLAY_SIZE, 2 * OP03.lot.boosters);
  assert.deepEqual(openBooster('OP03', seeded(5)), openBooster('OP03', seeded(5)));
  assert.notDeepEqual(openBooster('OP03', seeded(5)), openBooster('OP03', seeded(6)));
  assert.deepEqual(openDisplay('OP03', seeded(5)), openDisplay('OP03', seeded(5)));
  assert.notDeepEqual(openDisplay('OP03', seeded(5)), openDisplay('OP03', seeded(6)));
  assert.throws(() => openBooster('OP99', seeded(1)), /OP99/);
  assert.throws(() => openDisplay('OP99', seeded(1)), /OP99/);
});

test('boosters : liste officielle d’OP03 (123 cartes, 27 parallèles, 4 cartes SP) cohérente avec le catalogue', () => {
  const sizes = Object.fromEntries(Object.entries(OP03.cards).map(([r, list]) => [r, list.length]));
  assert.deepEqual(sizes, { L: 8, C: 45, UC: 32, R: 26, SR: 10, SEC: 2 });
  const numbers = Object.values(OP03.cards).flat();
  assert.equal(new Set(numbers).size, 123);
  // le catalogue (liste officielle téléchargée) a les mêmes cartes, avec la même rareté
  const catalog = Object.values(cardData()).filter((d) => d.number.startsWith('OP03-'));
  assert.equal(catalog.length, 123);
  for (const [rarity, list] of Object.entries(OP03.cards)) {
    for (const n of list) assert.equal(cardData()[n]?.rarity, rarity, `${n} : rareté du catalogue`);
  }
  const versions = OP03.hits.flatMap((h) => h.versions);
  assert.equal(versions.filter((v) => v.variant !== 'sp').length, 27);
  assert.equal(versions.filter((v) => v.variant === 'sp').length, 4);
  assert.equal(new Set(versions.map((v) => v.imageId)).size, versions.length);
  for (const v of versions) {
    assert.ok(CARDS[v.number], `${v.number} absent du catalogue`);
    // nom du visuel accepté par le relais du serveur (/img-en-hd/:id.webp)
    assert.match(v.imageId, new RegExp(`^${v.number}_p\\d$`));
    assert.equal(findVersion(v.number, v.variant), v);
    if (v.variant === 'parallele') assert.ok(OP03.cards[v.rarity as keyof typeof OP03.cards].includes(v.number));
  }
  // toutes les SR, SEC et Leaders ont une parallèle
  for (const n of [...OP03.cards.SR, ...OP03.cards.SEC, ...OP03.cards.L]) assert.ok(findVersion(n, 'parallele'), n);
  assert.equal(versionImageUrl('OP03-122', 'manga'), 'img-en-hd/OP03-122_p2.webp');
  assert.equal(versionImageUrl('ST01-012', 'sp'), 'img-en-hd/ST01-012_p1.webp');
  assert.equal(findVersion('ST01-012', 'sp')?.rarity, 'SP CARD');
  assert.equal(versionImageUrl('OP03-001', 'base'), undefined);
  assert.equal(variantLabel('parallele'), 'Parallèle');
  assert.equal(variantLabel('base'), 'Normale');
});

test('boosters : taux sur 100 000 boosters (un par un) conformes aux comptages publiés', () => {
  const rand = seeded(2026);
  const n = 100_000;
  const tally: Record<string, number> = {};
  const perCard: Record<string, number> = {};
  const add = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };
  for (let i = 0; i < n; i++) {
    const b = openBooster('OP03', rand);
    if (i < 3000) checkBooster(b);
    for (const c of b.cards) {
      add(hit(c) ? kindOf(c) ?? '?' : c.rarity);
      if (hit(c)) add('hits');
      else perCard[c.number] = (perCard[c.number] ?? 0) + 1;
    }
  }
  const expected = (perDisplay: number) => (n * perDisplay) / DISPLAY_SIZE;
  for (const [key, perDisplay] of Object.entries(PER_DISPLAY)) near(tally[key] ?? 0, expected(perDisplay), key);
  assert.equal(tally.UC, 3 * n);
  near(tally.R, expected(DISPLAY_SIZE - PER_DISPLAY.SR - PER_DISPLAY.SEC), 'R');
  near(tally.C, expected(8 * DISPLAY_SIZE - PER_DISPLAY.L - PER_DISPLAY.hits), 'C');
  assert.equal(tally['?'], undefined);
  // dans une rareté, chaque carte a la même chance
  for (const [rarity, list] of Object.entries(OP03.cards)) {
    for (const num of list) near(perCard[num] ?? 0, tally[rarity] / list.length, `${num} (${rarity})`);
  }
});

test('boosters : garanties de chaque display (2 000 displays) et mêmes taux qu’un par un', () => {
  const rand = seeded(31);
  const n = 2000;
  const tally: Record<string, number> = {};
  const totals: Record<number, number> = {};
  for (let i = 0; i < n; i++) {
    const display = openDisplay('OP03', rand);
    assert.equal(display.length, DISPLAY_SIZE);
    display.forEach(checkBooster);
    const cards = display.flatMap((b) => b.cards);
    const sr = count(cards, isBase('SR'));
    const leaders = count(cards, isBase('L'));
    const sec = count(cards, isBase('SEC'));
    const hits = count(cards, hit);
    // chaque lot de 12 boosters : 3 ou 4 SR, 3 ou 4 Leaders, et une SEC ou une à deux surprises
    assert.ok(sr >= 6 && sr <= 8, `${sr} SR`);
    assert.ok(leaders >= 6 && leaders <= 8, `${leaders} Leaders`);
    assert.ok(sec <= 2 && sec + hits >= 2 && sec + hits <= 4, `${sec} SEC et ${hits} surprises`);
    totals[sec + hits] = (totals[sec + hits] ?? 0) + 1;
    for (const [key, value] of Object.entries({ SR: sr, L: leaders, SEC: sec, hits })) tally[key] = (tally[key] ?? 0) + value;
  }
  for (const key of ['SR', 'L', 'SEC', 'hits'] as const) near(tally[key], n * PER_DISPLAY[key], key);
  // un lot sur quatre environ a deux surprises : 2, 3 ou 4 cartes « SEC ou surprise » par display
  const single = (48 + 61) / 145;   // lot avec une seule SEC ou surprise
  near(totals[2] ?? 0, n * single ** 2, '2 SEC ou surprises');
  near(totals[3] ?? 0, n * 2 * single * (1 - single), '3 SEC ou surprises');
  near(totals[4] ?? 0, n * (1 - single) ** 2, '4 SEC ou surprises');
});
