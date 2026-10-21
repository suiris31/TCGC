// Contrats de l'économie des Berry (tâche 0 de l'étape 2) : le barème de game/economy/config.ts est complet et
// cohérent avec le reste du jeu (niveaux de l'IA, extensions en boosters, raretés, chapitres d'East Blue)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { LEVELS, type Level } from '../ai/search.ts';
import { boosterSets, DISPLAY_SIZE } from '../boosters/open.ts';
import { ECONOMY, type Rarity } from '../economy/config.ts';

const RARITIES: Rarity[] = ['L', 'C', 'UC', 'R', 'SR', 'SEC'];
const levels = Object.keys(LEVELS).map(Number) as Level[];
const whole = (n: number, what: string) => assert.ok(Number.isInteger(n) && n >= 0, `${what} : ${n} n'est pas un entier positif`);

test('économie : la boutique ne vend que des extensions en boosters, le display moins cher à l’unité', () => {
  assert.ok(Object.keys(ECONOMY.shop).length > 0);
  for (const [set, offer] of Object.entries(ECONOMY.shop)) {
    assert.ok(boosterSets().includes(set), `${set} : pas de générateur de boosters`);
    assert.equal(offer.boostersPerDisplay, DISPLAY_SIZE, `${set} : un display = ${DISPLAY_SIZE} boosters`);
    whole(offer.booster, `${set} booster`);
    whole(offer.display, `${set} display`);
    assert.ok(offer.booster > 0 && offer.display < offer.booster * offer.boostersPerDisplay, `${set} : display pas avantageux`);
  }
  assert.ok(boosterSets().includes(ECONOMY.weeklyChest.set), 'coffre : extension sans boosters');
});

test('économie : un gain pour chaque niveau de l’IA, la victoire rapporte plus que la défaite', () => {
  assert.deepEqual(Object.keys(ECONOMY.ai.win).map(Number).sort(), levels.sort());
  assert.deepEqual(Object.keys(ECONOMY.ai.loss).map(Number).sort(), levels.sort());
  for (const l of levels) {
    whole(ECONOMY.ai.win[l], `IA ${l} victoire`);
    whole(ECONOMY.ai.loss[l], `IA ${l} défaite`);
    assert.ok(ECONOMY.ai.win[l] > ECONOMY.ai.loss[l], `IA ${l}`);
    assert.ok(ECONOMY.rules.aiAgreementMin[l] >= 0 && ECONOMY.rules.aiAgreementMin[l] <= 1, `accord IA ${l}`);
    if (l > 1) assert.ok(ECONOMY.ai.win[l] > ECONOMY.ai.win[(l - 1) as Level], 'plus l’IA est forte, plus ça rapporte');
  }
  // niveau 1 : l'IA simple, reproductible, vérifiée à 100 % (étude 2.1, § 5.3)
  assert.equal(ECONOMY.rules.aiAgreementMin[1], 1);
  assert.ok(ECONOMY.online.win > ECONOMY.online.loss);
});

test('économie : plafond, bonus, coffre, gains décroissants et règles cohérents', () => {
  for (const [what, n] of Object.entries({
    plafond: ECONOMY.dailyCap, bonus: ECONOMY.dailyBonus.amount, réserve: ECONOMY.dailyBonus.keepDays,
    coffre: ECONOMY.weeklyChest.wins, 'boosters du coffre': ECONOMY.weeklyChest.boosters, tours: ECONOMY.rules.minTurns,
    délai: ECONOMY.rules.claimWithinHours, 'âge du compte adverse': ECONOMY.rules.onlineOpponentMinDays,
  })) {
    whole(n, what);
    assert.ok(n > 0, what);
  }
  // une victoire de n'importe quel mode tient sous le plafond
  assert.ok(Math.max(...levels.map((l) => ECONOMY.ai.win[l]), ECONOMY.online.win) <= ECONOMY.dailyCap);
  for (const list of [ECONOMY.diminishing.sameAi, ECONOMY.diminishing.sameOnlineOpponent]) {
    assert.equal(list[0], 1, 'la première partie contre un adversaire rapporte en entier');
    for (let i = 1; i < list.length; i++) assert.ok(list[i] <= list[i - 1] && list[i] >= 0, 'coefficients décroissants');
  }
  assert.ok(Intl.DateTimeFormat(undefined, { timeZone: ECONOMY.timeZone }), 'fuseau horaire inconnu');
});

test('économie : doublons et comptoir pour chaque rareté, jamais une boucle d’achat et d’échange', () => {
  assert.deepEqual(Object.keys(ECONOMY.duplicates.value).sort(), [...RARITIES].sort());
  assert.deepEqual(Object.keys(ECONOMY.counter.price).sort(), [...RARITIES].sort());
  assert.ok(ECONOMY.counter.onlyFound, 'comptoir : seulement les cartes déjà trouvées (décision du 19 octobre 2026)');
  assert.equal(ECONOMY.counter.max, ECONOMY.duplicates.keep, 'le comptoir complète jusqu’au seuil des doublons');
  for (const r of RARITIES) {
    whole(ECONOMY.duplicates.value[r], `doublon ${r}`);
    whole(ECONOMY.counter.price[r], `comptoir ${r}`);
    // acheter au comptoir puis échanger ne rapporte jamais
    assert.ok(ECONOMY.counter.price[r] > ECONOMY.duplicates.value[r], `rareté ${r}`);
  }
});

test('économie : les chapitres d’East Blue sont prévus au barème de l’aventure', () => {
  const { firstWin, firstWinFinal, firstWinBonus } = ECONOMY.adventure;
  for (const n of [firstWin, firstWinFinal, firstWinBonus]) whole(n, 'aventure');
  // dernier chapitre de l'histoire (Smoker) : firstWinFinal ; défis : firstWinBonus ; les autres : firstWin
  const story = EAST_BLUE.chapters.filter((c) => !c.optional);
  assert.ok(story.length > 1 && EAST_BLUE.chapters.some((c) => c.optional));
  assert.ok(firstWinFinal > firstWin && firstWinBonus > firstWin);
});
