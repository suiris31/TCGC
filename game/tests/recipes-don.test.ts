// Famille « DON!! » du traducteur (étape C, tâche C2.4) : traduction des tournures (ajouter, redresser, donner, renvoyer,
// épuiser des DON!!), coûts écrits en toutes lettres, conditions sur les DON!!, évènement « une DON!! retourne au deck
// DON!! », aller-retour, compilation et jeu des nouvelles briques (bricks-don.ts).
//
// Aucun texte de carte : les phrases sont construites ici à partir de valeurs (règle du § 15.8), et les cartes jouées
// sont inventées (ZZ24-...), avec l'adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecipeSet, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { blocking, compareTexts } from '../engine/recipes/compare.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe as describeRecipe } from '../engine/recipes/describe.ts';
import { DON } from '../engine/recipes/parse/don.ts';
import { parseCard, type Family } from '../engine/recipes/parse/index.ts';
import { formatReport, testRecipe } from '../engine/recipes/testgen.ts';
import type { Ability, Action, Cond, CostPart, Recipe, RecipeSet, Target } from '../engine/recipes/types.ts';
import { donOnField } from '../engine/rules.ts';
import type { CardData, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, logHas, play, scenario, setChars, setDon, setHand } from './helpers.ts';

// ---------- Traduction ----------

// « rest this Character » est de la famille des retraits (C2.1) : une règle d'essai, pour le coût en deux morceaux
const SELF_COST: Family = { name: 'essai', costs: [{ re: /^rest this Character$/i, make: (): CostPart => ({ kind: 'restSelf' }) }] };
const parse = (effectEn: string, families: Family[] = [DON]) => parseCard({ num: 'ZZ24-900', effectEn, triggerEn: null }, families);
const recipeOf = (effectEn: string, families?: Family[]): Recipe => {
  const r = parse(effectEn, families);
  assert.ok(r.ok, `${effectEn} → ${r.ok ? '' : r.unknown.join(' | ')}`);
  return r.recipe;
};
const actionOf = (effectEn: string): Action => {
  const st = recipeOf(effectEn).abilities[0].steps[0];
  assert.ok('action' in st, JSON.stringify(st));
  return st.action;
};
const condOf = (c: string): Cond => {
  const st = recipeOf(`[On Play] If ${c}, set up to 1 of your DON!! cards as active.`).abilities[0].steps[0];
  assert.ok(st.cond, JSON.stringify(st));
  return st.cond;
};
const notUnderstood = (effectEn: string) => assert.ok(!parse(effectEn).ok, `${effectEn} ne devrait pas être compris`);
const opp = "your opponent's";
const ownPair: Target = { side: 'own', zone: 'field', leader: true, characters: true, count: 1, upTo: false, filter: {} };

test('DON!! : ajouter, redresser (anciennes et nouvelles rédactions)', () => {
  assert.deepEqual(actionOf('[On Play] Add up to 1 DON!! card from your DON!! deck and rest it.'), { kind: 'addDon', n: 1, upTo: true, state: 'rested' });
  assert.deepEqual(actionOf('[On Play] Add up to 2 DON!! cards from your DON!! deck and set them as active.'), { kind: 'addDon', n: 2, upTo: true, state: 'active' });
  assert.deepEqual(actionOf('[On Play] Add 1 DON!! card from your DON!! deck and set it as active.'), { kind: 'addDon', n: 1, upTo: false, state: 'active' });
  // rédaction d'EB05 / OP17
  assert.deepEqual(actionOf('[On Play] Add up to 3 DON!! cards as rested from your DON!! deck.'), { kind: 'addDon', n: 3, upTo: true, state: 'rested' });
  // « ..., and add up to 1 additional DON!! card and rest it » : deux ajouts
  const two = recipeOf('[On Play] Add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 1 additional DON!! card and rest it.').abilities[0].steps;
  assert.deepEqual(two, [
    { action: { kind: 'addDon', n: 1, upTo: true, state: 'active' } },
    { link: 'and', action: { kind: 'addDon', n: 1, upTo: true, state: 'rested' } },
  ]);
  assert.deepEqual(actionOf('[Main] Set up to 2 of your DON!! cards as active.'), { kind: 'readyDon', n: 2, upTo: true });
});

test('DON!! : donner (les vôtres, à la carte elle-même, celles du propriétaire, celles de l\'adversaire)', () => {
  assert.deepEqual(actionOf('[On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.'),
    { kind: 'giveDon', n: 2, upTo: true, rested: true, target: ownPair });
  assert.deepEqual(actionOf('[On Play] Give up to 1 rested DON!! card to 1 of your {Navy} type Leader or Character cards.'),
    { kind: 'giveDon', n: 1, upTo: true, rested: true, target: { side: 'own', zone: 'field', count: 1, upTo: false, filter: { types: ['Navy'] }, leader: true, characters: true } });
  assert.deepEqual(actionOf('[Activate: Main] Give this Character up to 2 rested DON!! cards.'),
    { kind: 'giveDon', n: 2, upTo: true, rested: true, target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true } });
  assert.deepEqual(actionOf("[On Play] Give up to 1 rested DON!! card to its owner's Leader or 1 of their Characters."),
    { kind: 'giveDon', n: 1, upTo: true, rested: true, from: 'owner', target: { ...ownPair, side: 'any' } });
  assert.deepEqual(actionOf(`[On Play] Give up to 1 of ${opp} rested DON!! cards to 1 of ${opp} Characters.`),
    { kind: 'giveDon', n: 1, upTo: true, rested: true, from: 'opp', target: { side: 'opp', zone: 'field', count: 1, upTo: false, filter: {}, characters: true } });
  // garde-fous : ses DON!! à une carte adverse, plusieurs cartes qui reçoivent, état des DON!! non dit
  notUnderstood(`[On Play] Give up to 1 rested DON!! card to 1 of ${opp} Characters.`);
  notUnderstood('[On Play] Give up to 1 rested DON!! card to 2 of your Characters.');
  notUnderstood('[On Play] Give up to 1 DON!! card to your Leader or 1 of your Characters.');
});

test('DON!! : renvoyer, épuiser (les vôtres, celles de l\'adversaire, « DON!! ou Personnages »)', () => {
  assert.deepEqual(actionOf(`[On KO] Your opponent returns 2 DON!! cards from their field to their DON!! deck.`), { kind: 'returnDon', n: 2, side: 'opp' });
  assert.deepEqual(actionOf('[On Play] Return 1 DON!! card from your field to your DON!! deck.'), { kind: 'returnDon', n: 1, side: 'own' });
  assert.deepEqual(actionOf(`[On Play] Rest up to 1 of ${opp} DON!! cards.`), { kind: 'restDon', n: 1, side: 'opp' });
  assert.deepEqual(actionOf(`[On Play] Rest up to 1 of ${opp} DON!! cards or Characters with a cost of 3 or less.`),
    { kind: 'restDon', n: 1, side: 'opp', orCharacters: { costMax: 3 } });
  assert.deepEqual(actionOf(`[On Play] Rest up to a total of 2 of ${opp} Characters or DON!! cards.`), { kind: 'restDon', n: 2, side: 'opp', orCharacters: {} });
  // « with a DON!! card given » (filtre lu par target.ts)
  assert.deepEqual(actionOf(`[On Play] Rest up to 1 of ${opp} DON!! cards or Characters with a DON!! card given.`),
    { kind: 'restDon', n: 1, side: 'opp', orCharacters: { donMin: 1 } });
  assert.deepEqual(actionOf('[On Play] Rest 1 of your DON!! cards.'), { kind: 'restDon', n: 1, side: 'own' });
  // « ... DON!! cards or Leader » : pas des Personnages, pas compris
  notUnderstood(`[On Play] Rest up to 1 of ${opp} DON!! cards or Leader.`);
});

test('DON!! : coûts écrits en toutes lettres', () => {
  const costOf = (effectEn: string, families?: Family[]) => recipeOf(effectEn, families).abilities[0].cost;
  assert.deepEqual(costOf('[On Play] You may rest 2 of your DON!! cards: Set up to 1 of your DON!! cards as active.'), [{ kind: 'restDon', n: 2 }]);
  assert.deepEqual(costOf('[Main] You may give 1 active DON!! card to 1 of your Leader: Set up to 1 of your DON!! cards as active.'),
    [{ kind: 'giveDon', n: 1, target: { side: 'own', zone: 'field', count: 1, upTo: false, filter: {}, leader: true } }]);
  assert.deepEqual(costOf(`[Activate: Main] You may give 1 of ${opp} rested DON!! cards to 1 of ${opp} Characters: Set up to 1 of your DON!! cards as active.`),
    [{ kind: 'giveDon', n: 1, from: 'opp', target: { side: 'opp', zone: 'field', count: 1, upTo: false, filter: {}, characters: true } }]);
  // un verbe pour deux morceaux (structure.ts) : « rest 1 of your DON!! cards and this Character »
  assert.deepEqual(costOf('[Activate: Main] You may rest 1 of your DON!! cards and this Character: Set up to 1 of your DON!! cards as active.', [DON, SELF_COST]),
    [{ kind: 'restDon', n: 1 }, { kind: 'restSelf' }]);
  assert.deepEqual(costOf('[Activate: Main] You may rest this Character and 2 of your DON!! cards: Set up to 1 of your DON!! cards as active.', [DON, SELF_COST]),
    [{ kind: 'restSelf' }, { kind: 'restDon', n: 2 }]);
  notUnderstood(`[Main] You may give 1 active DON!! card to 1 of ${opp} Characters: Set up to 1 of your DON!! cards as active.`);
});

test('DON!! : conditions', () => {
  assert.deepEqual(condOf('you have 6 or more DON!! cards on your field'), { kind: 'donField', side: 'own', cmp: 'ge', n: 6 });
  assert.deepEqual(condOf('you have 10 DON!! cards on your field'), { kind: 'donField', side: 'own', cmp: 'eq', n: 10 });
  assert.deepEqual(condOf('you have any DON!! cards on your field'), { kind: 'donField', side: 'own', cmp: 'ge', n: 1 });
  assert.deepEqual(condOf(`your opponent has 5 or more DON!! cards on their field`), { kind: 'donField', side: 'opp', cmp: 'ge', n: 5 });
  assert.deepEqual(condOf("the number of DON!! cards on your field is equal to or less than the number on your opponent's field"), { kind: 'donVsOpp', cmp: 'le' });
  assert.deepEqual(condOf('your opponent has more DON!! cards on their field than you'), { kind: 'donVsOpp', cmp: 'lt' });
  assert.deepEqual(condOf('you have 2 or more active DON!! cards'), { kind: 'donCards', side: 'own', what: 'active', cmp: 'ge', n: 2 });
  assert.deepEqual(condOf('you have any DON!! cards given'), { kind: 'donCards', side: 'own', what: 'given', cmp: 'ge', n: 1 });
  assert.deepEqual(condOf('your opponent has any DON!! cards given'), { kind: 'donCards', side: 'opp', what: 'given', cmp: 'ge', n: 1 });
  assert.deepEqual(condOf('you have a total of 4 or more given DON!! cards'), { kind: 'donCards', side: 'own', what: 'given', cmp: 'ge', n: 4 });
  assert.deepEqual(condOf('this Character has 2 or more DON!! cards given'), { kind: 'selfState', donMin: 2 });
  assert.deepEqual(condOf('you have 0 or 3 or more DON!! cards on your field'),
    { kind: 'or', any: [{ kind: 'donField', side: 'own', cmp: 'eq', n: 0 }, { kind: 'donField', side: 'own', cmp: 'ge', n: 3 }] });
  assert.deepEqual(condOf('either you or your opponent has 10 DON!! cards on the field'),
    { kind: 'or', any: [{ kind: 'donField', side: 'own', cmp: 'eq', n: 10 }, { kind: 'donField', side: 'opp', cmp: 'eq', n: 10 }] });
});

test('DON!! : évènement « quand une DON!! de votre terrain retourne au deck DON!! »', () => {
  const a = recipeOf('[Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, add up to 1 DON!! card from your DON!! deck and rest it.').abilities[0];
  assert.equal(a.timing, 'when');
  assert.deepEqual(a.event, { on: 'donReturned' });
  assert.equal(a.yourTurn, true);
  // « N or more DON!! cards ... are returned » et « by your effect » : pas encore dans le format
  notUnderstood('When 2 or more DON!! cards on your field are returned to your DON!! deck, set up to 1 of your DON!! cards as active.');
  notUnderstood('When a DON!! card on your field is returned to your DON!! deck by your effect, set up to 1 of your DON!! cards as active.');
});

// ---------- Aller-retour ----------

test('aller-retour : la recette redite correspond aux phrases construites, une recette faussée ne correspond pas', () => {
  const texts = [
    '[On Play] Add up to 1 DON!! card from your DON!! deck and rest it.',
    '[On Play] Add up to 2 DON!! cards as active from your DON!! deck.',
    '[Main] Set up to 2 of your DON!! cards as active.',
    '[On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.',
    "[On Play] Give up to 1 rested DON!! card to its owner's Leader or 1 of their Characters.",
    '[Activate: Main] Give this Character up to 2 rested DON!! cards.',
    `[On KO] Your opponent returns 1 DON!! card from their field to their DON!! deck.`,
    `[On Play] Rest up to 1 of ${opp} DON!! cards or Characters with a cost of 4 or less.`,
    '[On Play] If you have any DON!! cards given, set up to 1 of your DON!! cards as active.',
    '[On Play] If you have 2 or more active DON!! cards, add up to 1 DON!! card from your DON!! deck and rest it.',
    '[On Play] If either you or your opponent has 10 DON!! cards on the field, set up to 1 of your DON!! cards as active.',
    '[On Play] You may rest 1 of your DON!! cards: Add up to 1 DON!! card from your DON!! deck and set it as active.',
  ];
  for (const en of texts) {
    const r = recipeOf(en);
    const d = describeRecipe(r);
    assert.ok(d.ok, `${en} : ${d.ok ? '' : d.missing.join()}`);
    assert.deepEqual(blocking(compareTexts(r, { en })), [], `${en}\n→ ${d.en}`);
  }
  // un chiffre, un camp ou un état faussé ressort
  const wrong = (en: string, mutate: (a: Action) => void) => {
    const r = structuredClone(recipeOf(en));
    const st = r.abilities[0].steps[0];
    assert.ok('action' in st);
    mutate(st.action);
    assert.ok(blocking(compareTexts(r, { en })).length > 0, `${en} : l'erreur n'est pas vue`);
  };
  wrong('[On Play] Add up to 1 DON!! card from your DON!! deck and rest it.', (a) => { (a as Extract<Action, { kind: 'addDon' }>).n = 2; });
  wrong('[On Play] Add up to 1 DON!! card from your DON!! deck and rest it.', (a) => { (a as Extract<Action, { kind: 'addDon' }>).state = 'active'; });
  wrong(`[On KO] Your opponent returns 1 DON!! card from their field to their DON!! deck.`, (a) => { (a as Extract<Action, { kind: 'returnDon' }>).side = 'own'; });
  wrong('[On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.', (a) => { (a as Extract<Action, { kind: 'giveDon' }>).n = 1; });
});

// ---------- Compilation et jeu ----------

const C = {
  oppReturn: 'ZZ24-001', ownReturn: 'ZZ24-002', oppRest: 'ZZ24-003', oppRestOrChar: 'ZZ24-004', ownRest: 'ZZ24-005',
  selfGive: 'ZZ24-006', ownerGive: 'ZZ24-007', oppGiveCost: 'ZZ24-008', given: 'ZZ24-009', active: 'ZZ24-010',
};
const O_BONNEY = 'ST21-004';   // coût 1
const O_STUSSY = 'ST21-006';   // coût 3
const O_CHOPPER = 'ST21-008';  // coût 4
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData(Object.fromEntries(Object.values(C).map((n) => [n, { ...base, number: n, name: `Essai ${n.slice(-3)}`, names: [`Essai ${n.slice(-3)}`] }])));

const selfT: Target = { side: 'own', zone: 'field', self: true, characters: true, count: 1, upTo: false, filter: {} };
const oppChars: Target = { side: 'opp', zone: 'field', characters: true, count: 1, upTo: false, filter: {} };
const ab = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;
const one = (timing: Ability['timing'], action: Action, extra: Partial<Ability> = {}): Recipe =>
  ({ num: '', abilities: [ab({ timing, steps: [{ action }], ...extra })] });
const ready: Action = { kind: 'readyDon', n: 1, upTo: true };
const RECIPES: Record<string, Recipe> = {
  [C.oppReturn]: one('onPlay', { kind: 'returnDon', n: 2, side: 'opp' }),
  [C.ownReturn]: one('onPlay', { kind: 'returnDon', n: 1, side: 'own' }),
  [C.oppRest]: one('onPlay', { kind: 'restDon', n: 2, side: 'opp' }),
  [C.oppRestOrChar]: one('onPlay', { kind: 'restDon', n: 1, side: 'opp', orCharacters: { costMax: 3 } }),
  [C.ownRest]: one('onPlay', { kind: 'restDon', n: 2, side: 'own' }),
  [C.selfGive]: one('activateMain', { kind: 'giveDon', n: 2, upTo: true, rested: true, target: selfT }, { oncePerTurn: true, cost: [{ kind: 'restDon', n: 1 }] }),
  [C.ownerGive]: one('onPlay', { kind: 'giveDon', n: 1, upTo: true, rested: true, from: 'owner', target: { ...ownPair, side: 'any' } }),
  [C.oppGiveCost]: one('onPlay', ready, { cost: [{ kind: 'giveDon', n: 1, from: 'opp', target: oppChars }] }),
  [C.given]: { num: '', abilities: [ab({ timing: 'onPlay', steps: [{ action: { kind: 'addDon', n: 1, upTo: true, state: 'active' }, cond: { kind: 'donCards', side: 'own', what: 'given', cmp: 'ge', n: 1 } }] })] },
  [C.active]: { num: '', abilities: [ab({ timing: 'onPlay', steps: [{ action: { kind: 'addDon', n: 1, upTo: true, state: 'rested' }, cond: { kind: 'donCards', side: 'own', what: 'active', cmp: 'ge', n: 2 } }] })] },
};
for (const [num, r] of Object.entries(RECIPES)) r.num = num;
const SET: RecipeSet = { set: 'ZZ24', entries: Object.fromEntries(Object.entries(RECIPES).map(([num, recipe]) => [num, { level: 'verified', recipe }])) };
addRecipeSet(SET);
const MINE = 'TEST-DON';
DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.values(C).map((n) => [n, 4])) } };

const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;

test('compilation : toutes les recettes d\'essai se compilent et passent les tests générés', () => {
  for (const [num, r] of Object.entries(RECIPES)) {
    const c = compileRecipe(r);
    assert.ok(c.ok, `${num} : ${c.ok ? '' : c.missing.join()}`);
    const t = testRecipe(r);
    assert.ok(t.ok, `${num} : ${t.report ? formatReport(t.report) : t.failures.join(' | ')}`);
  }
  // ce qui n'a pas de brique exacte n'est pas approché : donner sans « jusqu'à », des DON!! redressées
  assert.ok(!compileRecipe(one('onPlay', { kind: 'giveDon', n: 1, upTo: false, rested: true, target: ownPair })).ok);
  assert.ok(!compileRecipe(one('onPlay', { kind: 'giveDon', n: 1, upTo: true, rested: false, target: ownPair })).ok);
});

test('jeu : l\'adversaire renvoie N DON!! (épuisées d\'abord)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.oppReturn]); setDon(g, 0, 4); setDon(g, 1, 2, 1); });
  const before = donOnField(s, 1);
  s = play(s, C.oppReturn);
  assert.equal(donOnField(s, 1), before - 2);
  assert.equal(s.players[1].donRested, 0, 'l\'épuisée part la première');
  assert.equal(s.players[1].donActive, 1);
  assert.equal(s.players[1].donDeck, 9);
  assert.ok(logHas(s, 'renvoie 2 DON!! dans son deck DON!!'));
  coherent(s);
});

test('jeu : renvoyer 1 de ses DON!! ; épuiser 2 de ses DON!! (obligatoire)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.ownReturn]); setDon(g, 0, 3); });
  s = play(s, C.ownReturn);
  assert.equal(donOnField(s, 0), 2);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.ownRest]); setDon(g, 0, 5); });
  s = play(s, C.ownRest);
  assert.equal(s.players[0].donActive, 1, '5 − 2 pour jouer la carte − 2 par l\'effet');
  assert.equal(s.players[0].donRested, 4);
  coherent(s);
});

test('jeu : épuiser jusqu\'à 2 DON!! adverses (une à une, refus possible), « DON!! ou Personnages »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.oppRest]); setDon(g, 0, 4); setDon(g, 1, 3); setChars(g, 1, [{ num: O_BONNEY }]); });
  s = play(s, C.oppRest);
  expectTag(s, 'oppRest');
  assert.deepEqual(s.decision!.options.map((o) => o.id), ['don', 'none'], 'pas de Personnage proposé');
  s = choose(s, 'don');
  s = choose(s, 'none');
  assert.equal(s.players[1].donActive, 2);
  assert.equal(s.players[1].donRested, 1);
  assert.ok(!theirs(s, O_BONNEY).rested);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.oppRestOrChar]); setDon(g, 0, 4); setDon(g, 1, 2); setChars(g, 1, [{ num: O_BONNEY }, { num: O_CHOPPER }]); });
  s = play(s, C.oppRestOrChar);
  expectTag(s, 'oppRest');
  const ids = s.decision!.options.map((o) => o.id);
  assert.ok(ids.includes(`card:${theirs(s, O_BONNEY).uid}`) && !ids.includes(`card:${theirs(s, O_CHOPPER).uid}`), 'seulement coût 3 ou moins');
  assert.ok(ids.includes('don'));
  s = choose(s, (o) => o.uid === theirs(s, O_BONNEY).uid);
  assert.ok(theirs(s, O_BONNEY).rested);
  assert.equal(s.players[1].donActive, 2);
  coherent(s);
});

test('jeu : donner 2 DON!! épuisées à la carte elle-même ([Activation : Principale], ①)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: C.selfGive }, { num: O_STUSSY }]); setDon(g, 0, 2, 3); });
  const uid = mine(s, C.selfGive).uid;
  s = act(s, `act:${uid}`);
  assert.equal(mine(s, C.selfGive).don, 2, 'sans choix de carte');
  assert.equal(mine(s, O_STUSSY).don, 0);
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].donRested, 2, '3 + 1 (①) − 2 données');
  coherent(s);
});

test('jeu : DON!! du propriétaire (« its owner\'s ») ; coût « donner 1 DON!! épuisée adverse »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.ownerGive]); setDon(g, 0, 4); setDon(g, 1, 0, 2); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = play(s, C.ownerGive);
  expectTag(s, 'oppDonTarget');
  s = choose(s, (o) => o.uid === theirs(s, O_STUSSY).uid);
  assert.equal(theirs(s, O_STUSSY).don, 1);
  assert.equal(s.players[1].donRested, 1, 'la DON!! vient de l\'adversaire');
  assert.equal(s.players[0].donRested, 2, 'les miennes ne bougent pas (2 pour jouer la carte)');
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.oppGiveCost]); setDon(g, 0, 4); setDon(g, 1, 0, 2); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = play(s, C.oppGiveCost);
  s = choose(s, 'yes');
  assert.equal(theirs(s, O_STUSSY).don, 1, 'une seule cible : donnée d\'office');
  assert.equal(s.players[1].donRested, 1);
  assert.equal(s.players[0].donActive, 3, 'puis 1 de mes DON!! redressée');
  coherent(s);

  // sans DON!! épuisée adverse : le coût n'est pas proposé
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.oppGiveCost]); setDon(g, 0, 4); setDon(g, 1, 2, 0); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = play(s, C.oppGiveCost);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(theirs(s, O_STUSSY).don, 0);
});

test('jeu : conditions « DON!! données » et « DON!! redressées »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.given]); setChars(g, 0, [{ num: O_STUSSY, extra: { don: 1 } }]); setDon(g, 0, 3); });
  const deck = s.players[0].donDeck;
  s = play(s, C.given);
  assert.equal(s.players[0].donDeck, deck - 1);
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.given]); setChars(g, 0, [{ num: O_STUSSY }]); setDon(g, 0, 3); });
  const deck2 = s.players[0].donDeck;
  s = play(s, C.given);
  assert.equal(s.players[0].donDeck, deck2, 'aucune DON!! donnée : rien');

  // 2 redressées ou plus au moment de l'effet (après avoir payé la carte)
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.active]); setDon(g, 0, 4); });
  s = play(s, C.active);
  assert.equal(s.players[0].donRested, 3, '2 pour la carte + 1 ajoutée épuisée');
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.active]); setDon(g, 0, 3); });
  s = play(s, C.active);
  assert.equal(s.players[0].donRested, 2, 'une seule redressée : rien');
});
