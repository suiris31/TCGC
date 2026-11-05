// Famille « puissance » du traducteur (étape C, tâche C2.2) : traduction des tournures (puissance, coût, puissance de
// base, mots-clés accordés, interdits et protections, annulation, effets permanents), aller-retour, compilation et jeu
// des nouvelles briques (durée « jusqu'à la fin de votre prochain tour », cible obligatoire, « tous », Leader filtré,
// [Une fois par tour] sans coût, coût « Leader redressé », coût réduit en main, protections permanentes).
//
// Aucun texte de carte : les phrases sont construites ici à partir de valeurs (règle du § 15.8), et les cartes jouées
// sont inventées (ZZ22-...), avec l'adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../engine/cards/bricks-power.ts';
import { addRecipeSet, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { blocking, compareTexts } from '../engine/recipes/compare.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe as describeRecipe } from '../engine/recipes/describe.ts';
import { parseCard } from '../engine/recipes/parse/index.ts';
import { POWER } from '../engine/recipes/parse/power.ts';
import { formatReport, testRecipe } from '../engine/recipes/testgen.ts';
import type { Ability, Action, Recipe, RecipeSet, Step, Target } from '../engine/recipes/types.ts';
import { attackTargets, canBeKO, canBeRested, canLeaveByEffect, def, handCost, hasKeyword, power } from '../engine/rules.ts';
import type { CardData, EffectCtx, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

// ---------- Traduction ----------

const parse = (effectEn: string, triggerEn: string | null = null) => parseCard({ num: 'ZZ22-900', effectEn, triggerEn }, [POWER]);
const recipeOf = (effectEn: string, triggerEn: string | null = null): Recipe => {
  const r = parse(effectEn, triggerEn);
  assert.ok(r.ok, `${effectEn} → ${r.ok ? '' : r.unknown.join(' | ')}`);
  return r.recipe;
};
const stepsOf = (effectEn: string): Step[] => recipeOf(effectEn).abilities[0].steps;
const firstAction = (effectEn: string): Action => {
  const st = stepsOf(effectEn)[0];
  assert.ok('action' in st, JSON.stringify(st));
  return st.action;
};
const opp = "your opponent's";
const OPP = (n: number, what = 'Characters') => `up to ${n} of ${opp} ${what}`;
const oppT = (filter: Target['filter'] = {}, count: Target['count'] = 1, upTo = true): Target =>
  ({ side: 'opp', zone: 'field', count, upTo, filter, characters: true });
const selfT: Target = { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true };
const leaderT: Target = { side: 'own', zone: 'field', leader: true, count: 1, upTo: false, filter: {} };

test('puissance : +N / −N, coût, cibles, durées (combat, tour, tour adverse, votre prochain tour)', () => {
  assert.deepEqual(firstAction(`[On Play] Give ${OPP(1)} -2000 power during this turn.`),
    { kind: 'power', target: oppT(), amount: -2000, until: 'turn' });
  assert.deepEqual(firstAction('[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle.'),
    { kind: 'power', target: { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, leader: true, characters: true }, amount: 3000, until: 'battle' });
  assert.deepEqual(firstAction("[On Play] Your Leader gains +1000 power until the end of your opponent's next End Phase."),
    { kind: 'power', target: leaderT, amount: 1000, until: 'oppNextEnd' });
  assert.deepEqual(firstAction('[On Play] This Character gains +2000 power until the end of your next turn.'),
    { kind: 'power', target: selfT, amount: 2000, until: 'nextTurn' });
  assert.deepEqual(firstAction(`[On Play] Give ${OPP(2)} with a cost of 4 or less -3 cost during this turn.`),
    { kind: 'cost', target: oppT({ costMax: 4 }, 2), amount: -3, until: 'turn' });
  assert.deepEqual(firstAction(`[Main] Give all of ${opp} Characters -1 cost during this turn.`),
    { kind: 'cost', target: oppT({}, 'all', false), amount: -1, until: 'turn' });
  // sans « up to » : cible obligatoire
  assert.deepEqual(firstAction(`[On Play] Give 1 of ${opp} Characters -1000 power during this turn.`),
    { kind: 'power', target: oppT({}, 1, false), amount: -1000, until: 'turn' });
  // pluriel sans nombre : tous
  assert.equal((firstAction('[Main] Your {Navy} type Characters gain +1000 power during this turn.') as Extract<Action, { kind: 'power' }>).target.count, 'all');
});

test('puissance : puissance de base, mots-clés accordés, plusieurs gains', () => {
  assert.deepEqual(firstAction("[On Play] Your Leader's base power becomes 7000 until the end of your opponent's next End Phase."),
    { kind: 'powerSet', target: leaderT, value: 7000, until: 'oppNextEnd' });
  assert.deepEqual(firstAction("[Main] Up to 1 of your Leader or Character cards' base power becomes 6000 during this turn."),
    { kind: 'powerSet', target: { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, leader: true, characters: true }, value: 6000, until: 'turn' });
  assert.deepEqual(firstAction('[On Play] This Character gains [Rush] during this turn.'), { kind: 'keyword', target: selfT, keyword: 'Rush', until: 'turn' });
  assert.deepEqual(firstAction('[On Play] Give up to 1 of your Characters [Banish] during this turn.'),
    { kind: 'keyword', target: { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, characters: true }, keyword: 'Banish', until: 'turn' });
  // « gains [Blocker] and +1000 power » : deux actions, un seul prédicat (sans lien)
  assert.deepEqual(stepsOf('[DON!! x1] This Character gains [Blocker] and +1000 power.'), [
    { action: { kind: 'keyword', target: selfT, keyword: 'Blocker', until: 'permanent' } },
    { action: { kind: 'power', target: selfT, amount: 1000, until: 'permanent' } },
  ]);
  // [Initiative : Personnage] écrit en toutes lettres
  assert.deepEqual(firstAction('This Character can attack Characters on the turn in which it is played.'),
    { kind: 'keyword', target: selfT, keyword: 'Rush: Character', until: 'permanent' });
});

test('puissance : interdits, protections, annulation, « cette carte »', () => {
  assert.deepEqual(firstAction(`[On Play] ${OPP(1).replace(/^u/, 'U')} cannot attack until the end of ${opp} next End Phase.`),
    { kind: 'cantAttack', target: oppT(), until: 'oppNextEnd', what: 'any' });
  assert.deepEqual(firstAction(`[When Attacking] Your opponent cannot activate [Blocker] during this battle.`),
    { kind: 'cantBlock', target: oppT({}, 'all', false), until: 'battle' });
  assert.deepEqual(firstAction(`[When Attacking] Your opponent cannot activate a [Blocker] Character that has 2000 or less power during this battle.`),
    { kind: 'cantBlock', target: oppT({ powerMax: 2000 }, 'all', false), until: 'battle' });
  assert.deepEqual(firstAction("[On Play] This Character cannot be KO'd by your opponent's effects during this turn."),
    { kind: 'cantBeKO', target: selfT, until: 'turn', by: 'oppEffect' });
  assert.deepEqual(firstAction("This Character cannot be KO'd in battle by <Slash> attribute cards."),
    { kind: 'cantBeKO', target: selfT, until: 'permanent', by: 'battle', byAttribute: 'Slash' });
  assert.deepEqual(firstAction(`[On Play] ${OPP(1).replace(/^u/, 'U')} with a cost of 6 or less cannot be rested until the end of ${opp} next End Phase.`),
    { kind: 'cantBeRested', target: oppT({ costMax: 6 }), until: 'oppNextEnd' });
  assert.deepEqual(firstAction('[On Play] Up to 1 of your Characters can also attack active Characters during this turn.'),
    { kind: 'attackActive', target: { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, characters: true }, until: 'turn' });
  assert.deepEqual(firstAction(`[On Play] Negate the effect of ${OPP(1)} during this turn.`), { kind: 'negate', target: oppT(), until: 'turn' });
  // un sujet, deux prédicats
  assert.deepEqual(stepsOf("This Character cannot be removed from the field by your opponent's effects and gains [Rush].")
    .map((st) => ('action' in st ? [st.action.kind, st.link ?? null] : null)), [['cantLeave', null], ['keyword', 'and']]);
  // « that card » : la carte choisie avant
  const two = stepsOf('[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +1000 power during this battle.');
  assert.deepEqual(two[1], { link: 'then', action: { kind: 'power', target: { side: 'own', zone: 'field', that: true, count: 1, upTo: false, filter: {} }, amount: 1000, until: 'battle' } });
});

test('puissance : effets permanents (coût réduit en main, Leader avec un type) et coût « Leader redressé »', () => {
  assert.deepEqual(firstAction('Give this card in your hand -1 cost.'),
    { kind: 'cost', target: { side: 'own', zone: 'hand', self: true, count: 1, upTo: false, filter: {} }, amount: -1, until: 'permanent' });
  assert.deepEqual(firstAction("[Opponent's Turn] Your {Navy} type Leader gains +1000 power."),
    { kind: 'power', target: { ...leaderT, filter: { types: ['Navy'] } }, amount: 1000, until: 'permanent' });
  assert.deepEqual(recipeOf('[When Attacking] You may give your 1 active Leader -5000 power during this turn: This Character gains +2000 power during this turn.').abilities[0].cost,
    [{ kind: 'leaderPowerMinus', n: 5000 }]);
});

test('puissance : ce qui n\'est pas sûr n\'est pas lu (garde-fous)', () => {
  for (const text of [
    '[On Play] This Character gains +1000 power.',                                    // durée absente dans un effet ponctuel
    'This Character gains +1000 power during this turn.',                             // durée dans un effet permanent
    '[On Play] This Character gains +1000 power for every 2 cards in your hand.',      // valeur calculée (C2.6)
    "[On Play] This Character's base power becomes the same as your Leader's power during this turn.",
    `[On Play] Negate the effect of ${OPP(1)}.`,                                      // annulation sans durée
    '[On Play] This Character gains [Rush] and draws 1 card during this turn.',
  ]) assert.equal(parse(text).ok, false, text);
});

test('puissance : aller-retour sans écart (la phrase redite a les mêmes faits que le texte)', () => {
  const texts = [
    `[On Play] Give ${OPP(1)} -2000 power during this turn.`,
    '[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle.',
    "[On Play] Your Leader gains +1000 power until the end of your opponent's next End Phase.",
    `[Main] Give all of ${opp} Characters -1 cost during this turn.`,
    "[On Play] Your Leader's base power becomes 7000 until the end of your opponent's next End Phase.",
    '[DON!! x1] This Character gains [Blocker] and +1000 power.',
    '[On Play] This Character gains [Rush] during this turn.',
    "[DON!! x1] [Your Turn] This Character gains +1000 power and cannot be KO'd by effects.",
    `[When Attacking] Your opponent cannot activate [Blocker] during this battle.`,
    `[When Attacking] Your opponent cannot activate a [Blocker] Character that has 2000 or less power during this battle.`,
    `[On Play] ${OPP(1).replace(/^u/, 'U')} with a cost of 6 or less cannot be rested until the end of ${opp} next End Phase.`,
    "This Character cannot be removed from the field by your opponent's effects.",
    'Give this card in your hand -1 cost.',
    `[On Play] Negate the effect of ${OPP(1)} during this turn.`,
  ];
  for (const en of texts) {
    const gaps = blocking(compareTexts(recipeOf(en), { en }));
    assert.deepEqual(gaps.map((g) => g.message), [], en);
  }
  // une erreur d'un seul chiffre ou d'une durée se voit
  const en = `[On Play] Give ${OPP(1)} -2000 power during this turn.`;
  const wrong = recipeOf(en);
  (wrong.abilities[0].steps[0] as { action: Extract<Action, { kind: 'power' }> }).action.amount = -3000;
  assert.ok(blocking(compareTexts(wrong, { en })).length > 0);
  const late = recipeOf(en);
  (late.abilities[0].steps[0] as { action: Extract<Action, { kind: 'power' }> }).action.until = 'oppNextEnd';
  assert.ok(blocking(compareTexts(late, { en })).length > 0);
  // français lisible
  const d = describeRecipe(recipeOf(`[When Attacking] Your opponent cannot activate [Blocker] during this battle.`));
  assert.ok(d.ok && /ne peut pas activer \[Bloqueur\]/.test(d.fr), d.ok ? d.fr : d.missing.join());
});

// ---------- Compilation et jeu ----------

const C = {
  nextTurn: 'ZZ22-001', forced: 'ZZ22-002', allCost: 'ZZ22-003', baseSet: 'ZZ22-004', leaderType: 'ZZ22-005',
  leaderCost: 'ZZ22-006', handCost: 'ZZ22-007', guard: 'ZZ22-008', slash: 'ZZ22-009', noRest: 'ZZ22-010', unblock: 'ZZ22-011',
  ban2000: 'ZZ22-012', that: 'ZZ22-013', once: 'ZZ22-014',
};
const O_BONNEY = 'ST21-004';   // coût 1, 3000
const O_STUSSY = 'ST21-006';   // coût 3, 5000
const O_CHOPPER = 'ST21-008';  // coût 4, 6000
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData(Object.fromEntries(Object.values(C).map((n) => [n, {
  ...base, number: n, name: `Essai ${n.slice(-3)}`, names: [`Essai ${n.slice(-3)}`], ...(n === C.that ? { category: 'EVENT' as const, power: null, counter: null } : {}),
}])));

const ab = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;
const one = (timing: Ability['timing'], action: Action, extra: Partial<Ability> = {}): Recipe =>
  ({ num: '', abilities: [ab({ timing, steps: [{ action }], ...extra })] });
const defender: Target = { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, leader: true, characters: true };
const RECIPES: Record<string, Recipe> = {
  [C.nextTurn]: one('onPlay', { kind: 'power', target: selfT, amount: 2000, until: 'nextTurn' }),
  [C.forced]: one('onPlay', { kind: 'power', target: oppT({}, 1, false), amount: -2000, until: 'turn' }),
  [C.allCost]: one('onPlay', { kind: 'cost', target: oppT({ costMax: 3 }, 'all', false), amount: -1, until: 'turn' }),
  [C.baseSet]: one('onPlay', { kind: 'powerSet', target: leaderT, value: 7000, until: 'oppNextEnd' }),
  [C.leaderType]: one('onPlay', { kind: 'power', target: { ...leaderT, filter: { types: ['Navy'] } }, amount: 1000, until: 'turn' }),
  [C.leaderCost]: one('onPlay', { kind: 'power', target: selfT, amount: 2000, until: 'turn' }, { cost: [{ kind: 'leaderPowerMinus', n: 5000 }] }),
  [C.handCost]: one('static', { kind: 'cost', target: { side: 'own', zone: 'hand', self: true, count: 1, upTo: false, filter: {} }, amount: -1, until: 'permanent' },
    { condition: { kind: 'life', side: 'own', cmp: 'le', n: 2 } }),
  [C.guard]: one('static', { kind: 'cantLeave', target: selfT, until: 'permanent' }),
  [C.slash]: one('static', { kind: 'cantBeKO', target: selfT, until: 'permanent', by: 'battle', byAttribute: 'Strike' }),
  [C.noRest]: one('onPlay', { kind: 'cantBeRested', target: oppT({ costMax: 4 }), until: 'oppNextEnd' }),
  [C.unblock]: one('whenAttacking', { kind: 'cantBlock', target: oppT({}, 'all', false), until: 'battle' }),
  [C.ban2000]: one('whenAttacking', { kind: 'cantBlock', target: oppT({ powerMax: 2000 }, 'all', false), until: 'battle' }),
  [C.that]: { num: '', abilities: [ab({ timing: 'counter', steps: [
    { action: { kind: 'power', target: defender, amount: 2000, until: 'battle' } },
    { link: 'then', cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 }, action: { kind: 'power', target: { side: 'own', zone: 'field', that: true, count: 1, upTo: false, filter: {} }, amount: 1000, until: 'battle' } },
  ] })] },
  [C.once]: one('whenAttacking', { kind: 'power', target: selfT, amount: 1000, until: 'turn' }, { oncePerTurn: true }),
};
for (const [num, r] of Object.entries(RECIPES)) r.num = num;
const SET: RecipeSet = { set: 'ZZ22', entries: Object.fromEntries(Object.entries(RECIPES).map(([num, recipe]) => [num, { level: 'verified', recipe }])) };
addRecipeSet(SET);
const MINE = 'TEST-PUISSANCE';
DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.values(C).map((n) => [n, 4])) } };

const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const three = (g: GameState) => setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }, { num: O_CHOPPER }]);

test('compilation : les recettes d\'essai se compilent et passent les tests générés', () => {
  for (const [num, r] of Object.entries(RECIPES)) {
    const c = compileRecipe(r);
    assert.ok(c.ok, `${num} : ${c.ok ? '' : c.missing.join(' | ')}`);
    // [Contre] pour le combat : le banc mesure après la fin du combat (modificateurs « combat » déjà retirés), voir la PR
    if (r.abilities[0].timing === 'counter') continue;
    const t = testRecipe(r);
    assert.ok(t.ok, `${num} : ${t.report ? formatReport(t.report) : t.failures.join(' | ')}`);
  }
  // ce qui reste signalé : « cette carte » hors [Contre], Bloqueur interdit hors [En attaquant]
  const off = compileRecipe(one('onPlay', { kind: 'power', target: { side: 'own', zone: 'field', that: true, count: 1, upTo: false, filter: {} }, amount: 1000, until: 'turn' }));
  assert.ok(!off.ok && off.missing.some((m) => /cette carte/.test(m)));
  const main = compileRecipe(one('main', { kind: 'cantBlock', target: oppT({}, 'all', false), until: 'turn' }));
  assert.ok(!main.ok && main.missing.some((m) => /hors \[En attaquant\]/.test(m)));
});

test('jeu : +2000 jusqu\'à la fin de votre prochain tour ; −2000 obligatoire (sans « Aucune ») ; −1 de coût à tous', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.nextTurn]); setDon(g, 0, 4); });
  s = play(s, C.nextTurn);
  const me = mine(s, C.nextTurn);
  assert.equal(power(s, me.uid), 5000);
  assert.equal(s.mods.find((m) => m.uid === me.uid)!.until, s.turn + 2, 'fin de mon prochain tour');
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.forced]); three(g); setDon(g, 0, 4); });
  s = play(s, C.forced);
  expectTag(s, 'oppPower');
  assert.ok(!s.decision!.options.some((o) => o.id === 'none'), 'pas de refus possible');
  s = choose(s, (o) => o.uid === theirs(s, O_CHOPPER).uid);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 4000);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.allCost]); three(g); setDon(g, 0, 4); });
  s = play(s, C.allCost);
  assert.equal(s.decision?.kind, 'main', 'tous : aucune question');
  assert.deepEqual(s.players[1].chars.map((c) => s.mods.filter((m) => m.uid === c.uid && m.stat === 'cost').length), [1, 1, 0]);
  coherent(s);
});

test('jeu : puissance de base du Leader ; Leader filtré par type ; coût « Leader redressé »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.baseSet, C.leaderType]); setDon(g, 0, 6); });
  s = play(s, C.baseSet);
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  s = play(s, C.leaderType);   // le Leader d'ST-21 n'a pas le type {Navy} : rien
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.leaderCost]); setDon(g, 0, 4); });
  s = play(s, C.leaderCost);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 0);
  assert.equal(power(s, mine(s, C.leaderCost).uid), 5000);
  // Leader épuisé : le coût n'est pas proposé
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.leaderCost]); setDon(g, 0, 4); g.players[0].leader.rested = true; });
  s = play(s, C.leaderCost);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(power(s, mine(s, C.leaderCost).uid), 3000);
  coherent(s);
});

test('jeu : effets permanents (coût réduit en main, ne quitte pas le terrain, pas de KO par les cartes <Strike>)', () => {
  const s = scenario([MINE, 'ST-21'], (g) => {
    setHand(g, 0, [C.handCost]); setLife(g, 0, ['ST21-013', 'ST21-005', 'ST21-003']);
    setChars(g, 0, [{ num: C.guard }, { num: C.slash }]);
  });
  const hc = s.players[0].hand.find((c) => c.num === C.handCost)!;
  assert.equal(handCost(s, 0, hc), 2, '3 cartes de Vie : coût normal');
  s.players[0].life.pop();
  assert.equal(handCost(s, 0, hc), 1, '2 cartes de Vie : −1');
  const guard = mine(s, C.guard);
  assert.equal(canLeaveByEffect(s, guard.uid, 1), false);
  assert.equal(canLeaveByEffect(s, guard.uid, 0), true, 'ses propres effets le peuvent');
  const slash = mine(s, C.slash);
  assert.equal(canBeKO(s, slash.uid, 'effect', 1), true);
  s.battle = { attacker: s.players[1].leader.uid, target: slash.uid } as GameState['battle'];   // Leader adverse <Strike>
  assert.equal(def(s.players[1].leader.num).attributes.includes('Strike'), true);
  assert.equal(canBeKO(s, slash.uid, 'battle', 1), false);
});

test('jeu : ne peut pas être épuisé (ni pour attaquer) ; imblocable ; [Bloqueur] de 2000 ou moins interdit', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.noRest]); three(g); setDon(g, 0, 4); });
  s = play(s, C.noRest);
  expectTag(s, 'oppLock');
  s = choose(s, (o) => o.uid === theirs(s, O_CHOPPER).uid);
  assert.equal(canBeRested(s, theirs(s, O_CHOPPER).uid), false);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: C.unblock }, { num: C.ban2000 }]); });
  const a = mine(s, C.unblock);
  assert.ok(attackTargets(s, 0, a).length > 0);
  s = choose(s, `attack:${a.uid}:${s.players[1].leader.uid}`);
  assert.ok(hasKeyword(s, 0, mine(s, C.unblock), 'Unblockable'));
  const b = compileRecipe(RECIPES[C.ban2000]);
  assert.ok(b.ok);
});

test('jeu : [Contre] « cette carte gagne encore » : la même carte attaquée, si la condition est vraie', () => {
  const s = scenario([MINE, 'ST-21'], (g) => { setLife(g, 0, ['ST21-013', 'ST21-005']); });
  const b = def(C.that);
  assert.equal(b.counterPower?.(s, 0, s.players[0].leader.uid), 3000);
  s.players[0].life.push(s.players[0].life[0], s.players[0].life[0]);
  assert.equal(b.counterPower?.(s, 0, s.players[0].leader.uid), 2000);
});

test('briques : [Une fois par tour] sans coût, une seule fois par tour et par carte', () => {
  const s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: C.once }]); });
  const c = mine(s, C.once);
  const e = P.oncePerTurn('k', P.modSelf({ stat: 'power', amount: 1000 }, 'turn', 'essai', 'gagne +1000'));
  const ctx = { s, me: 0, opp: 1, source: c.uid, num: C.once, pending: { kind: 'system', action: 'read', source: c.uid, num: C.once, controller: 0, answers: [] }, ask: () => { throw new Error('question'); } } as unknown as EffectCtx;
  assert.ok(e.useful(s, 0, c.uid));
  e.run(ctx);
  e.run(ctx);
  assert.equal(power(s, c.uid), 4000);
  assert.ok(!e.useful(s, 0, c.uid));
});
