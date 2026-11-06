// Famille « retraits » du traducteur (étape C, tâche C2.1) : traduction des tournures (KO, épuiser, redresser, renvoyer
// en main, sous le deck, dans la Vie, dans la Défausse, « ne se redresse pas »), aller-retour, compilation et jeu des
// nouvelles briques (cible obligatoire, « tous », Défausse, Vie au-dessus, la carte elle-même, coûts).
//
// Aucun texte de carte : les phrases sont construites ici à partir de valeurs (règle du § 15.8), et les cartes jouées
// sont inventées (ZZ21-...), avec l'adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecipeSet, CARDS, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { compareTexts, blocking } from '../engine/recipes/compare.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe as describeRecipe } from '../engine/recipes/describe.ts';
import { parseCard } from '../engine/recipes/parse/index.ts';
import { REMOVAL } from '../engine/recipes/parse/removal.ts';
import { testRecipe, formatReport } from '../engine/recipes/testgen.ts';
import type { Ability, Action, CostPart, Recipe, RecipeSet, Step, Target } from '../engine/recipes/types.ts';
import { addMod } from '../engine/rules.ts';
import type { CardData, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, logHas, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

// ---------- Traduction ----------

const parse = (effectEn: string, triggerEn: string | null = null) => parseCard({ num: 'ZZ21-900', effectEn, triggerEn }, [REMOVAL]);
const recipeOf = (effectEn: string, triggerEn: string | null = null): Recipe => {
  const r = parse(effectEn, triggerEn);
  assert.ok(r.ok, `${effectEn} → ${r.ok ? '' : r.unknown.join(' | ')}`);
  return r.recipe;
};
const firstAction = (effectEn: string): Action => {
  const st = recipeOf(effectEn).abilities[0].steps[0];
  assert.ok('action' in st, JSON.stringify(st));
  return st.action;
};
const costOf = (effectEn: string): CostPart[] => recipeOf(effectEn).abilities[0].cost ?? [];
const opp = "your opponent's";
const OPP = (n: number, filter = 'Characters') => `up to ${n} of ${opp} ${filter}`;

test('retraits : KO, épuiser, renvoyer, sous le deck, Défausse (cibles, camps, filtres)', () => {
  assert.deepEqual(firstAction(`[On Play] KO ${OPP(1)} with a cost of 3 or less.`),
    { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMax: 3 }, characters: true } });
  assert.deepEqual(firstAction(`[On Play] KO ${OPP(2, 'rested Characters')} with 5000 power or less.`),
    { kind: 'ko', target: { side: 'opp', zone: 'field', count: 2, upTo: true, filter: { rested: true, powerMax: 5000 }, characters: true } });
  assert.deepEqual(firstAction(`[Main] Rest ${OPP(1, 'Leader or Character cards')}.`),
    { kind: 'rest', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: {}, leader: true, characters: true } });
  // sans camp : les deux joueurs ; « to your hand » : ses propres cartes
  assert.deepEqual(firstAction("[On Play] Return up to 1 Character with a cost of 4 or less to the owner's hand."),
    { kind: 'bounce', target: { side: 'any', zone: 'field', count: 1, upTo: true, filter: { costMax: 4 }, characters: true } });
  assert.equal((firstAction('[On Play] Return up to 1 of your Characters to your hand.') as Extract<Action, { kind: 'bounce' }>).target.side, 'own');
  assert.deepEqual(firstAction("[On Play] Place up to 1 Character with a cost of 2 or less at the bottom of the owner's deck."),
    { kind: 'bottom', target: { side: 'any', zone: 'field', count: 1, upTo: true, filter: { costMax: 2 }, characters: true } });
  assert.deepEqual(firstAction(`[On Play] Trash ${OPP(1)} with a cost of 2 or less.`),
    { kind: 'trashChar', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMax: 2 }, characters: true } });
  // « Set ... as active » : ses propres cartes par défaut
  assert.deepEqual(firstAction('[On Play] Set up to 1 of your {Minks} type Characters as active.'),
    { kind: 'setActive', target: { side: 'own', zone: 'field', count: 1, upTo: true, filter: { types: ['Minks'] }, characters: true } });
  assert.deepEqual(firstAction(`[On Play] ${OPP(1, 'rested Characters').replace(/^u/, 'U')} will not become active in ${opp} next Refresh Phase.`),
    { kind: 'cantRefresh', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { rested: true }, characters: true } });
});

test('retraits : la carte elle-même, cible obligatoire, « tous », deux cibles', () => {
  const self = { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true };
  assert.deepEqual(firstAction('[Activate: Main] Set this Character as active.'), { kind: 'setActive', target: self });
  assert.deepEqual(firstAction("[Activate: Main] Return this Character to the owner's hand."), { kind: 'bounce', target: self });
  assert.deepEqual(firstAction("[On Play] Place this Character at the bottom of the owner's deck."), { kind: 'bottom', target: self });
  // sans « up to » : choix obligatoire
  assert.deepEqual(firstAction(`[On Play] Rest 1 of ${opp} Characters with a cost of 2 or less.`),
    { kind: 'rest', target: { side: 'opp', zone: 'field', count: 1, upTo: false, filter: { costMax: 2 }, characters: true } });
  assert.deepEqual(firstAction(`[On Play] KO all of ${opp} Characters with 3000 power or less.`),
    { kind: 'ko', target: { side: 'opp', zone: 'field', count: 'all', upTo: false, filter: { powerMax: 3000 }, characters: true } });
  // « KO up to 1 A and up to 1 B » : deux choix, le second lié par « and » ; redit en une phrase
  const two = recipeOf(`[On Play] KO ${OPP(1)} with a cost of 4 or less and ${OPP(1)} with a cost of 2 or less.`);
  const steps = two.abilities[0].steps as Extract<Step, { action: Action }>[];
  assert.equal(steps.length, 2);
  assert.equal(steps[1].link, 'and');
  assert.deepEqual(steps.map((s) => (s.action as Extract<Action, { kind: 'ko' }>).target.filter.costMax), [4, 2]);
  const d = describeRecipe(two);
  assert.ok(d.ok && (d.en.match(/\bKO\b/g) ?? []).length === 1, d.ok ? d.en : d.missing.join());
});

test('retraits : Vie du propriétaire (au-dessus seulement, ou au-dessus ou au-dessous ; face visible ou cachée)', () => {
  assert.deepEqual(firstAction(`[On Play] Add ${OPP(1)} with a cost of 3 or less to the top of ${opp} Life cards face-up.`),
    { kind: 'toLife', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMax: 3 }, characters: true }, faceUp: true, where: 'top' });
  assert.deepEqual(firstAction("[Main] Add up to 1 Character with a cost of 5 or less to the top or bottom of the owner's Life cards face-down."),
    { kind: 'toLife', target: { side: 'any', zone: 'field', count: 1, upTo: true, filter: { costMax: 5 }, characters: true }, faceUp: false, where: 'topOrBottom' });
  // la Vie d'un autre joueur que le propriétaire de la carte : pas lue
  assert.equal(parse(`[On Play] Add up to 1 of your Characters to the top of ${opp} Life cards face-up.`).ok, false);
});

test('retraits : ce qui n\'est pas de la famille (ou mal formé) n\'est pas lu', () => {
  for (const text of [
    "[On Play] Rest up to 1 of your opponent's DON!! cards.",       // DON!! (C2.4)
    '[On Play] Trash 1 card from your hand.',                       // main (C2.3)
    '[On Play] Trash 2 cards from the top of your deck.',
    '[On Play] Set up to 2 of your DON!! cards as active.',
    `[Main] KO up to 2 of ${opp} Characters with a total power of 4000 or less.`,   // somme : garde-fou « total »
    `[On Play] KO up to 1 of ${opp} Characters with a cost of 2 or less and this Character gains [Rush].`,  // la suite n'est pas de la famille
  ]) assert.equal(parse(text).ok, false, text);
  // « KO up to 1 ... and this Character gains [Rush] » : la première moitié est bien lue (rapport : seul le reste manque)
  const r = parse(`[On Play] KO ${OPP(1)} with a cost of 2 or less and draw 1 card.`);
  assert.ok(!r.ok && r.unknown.every((u) => !/\bKO\b/.test(u)), JSON.stringify(r));
});

test('retraits : coûts (cette carte, N de ses Personnages, ses cartes, son Leader)', () => {
  const pay = (cost: string) => costOf(`[Activate: Main] You may ${cost}: KO ${OPP(1)} with a cost of 1 or less.`);
  assert.deepEqual(pay('rest this Character'), [{ kind: 'restSelf' }]);
  assert.deepEqual(pay('trash this Character'), [{ kind: 'trashSelf' }]);
  assert.deepEqual(pay("return this Character to the owner's hand"), [{ kind: 'bounceSelf' }]);
  assert.deepEqual(pay("place this Character at the bottom of the owner's deck"), [{ kind: 'selfToBottom' }]);
  assert.deepEqual(pay('trash 1 of your {Navy} type Characters'), [{ kind: 'trashOwnChar', n: 1, filter: { types: ['Navy'] } }]);
  assert.deepEqual(pay('KO 1 of your Characters with a cost of 2 or more'), [{ kind: 'koOwnChar', n: 1, filter: { costMin: 2 } }]);
  assert.deepEqual(pay("return 2 of your Characters to the owner's hand"), [{ kind: 'returnOwnChar', n: 2, filter: {} }]);
  assert.deepEqual(pay('rest 1 of your cards'), [{ kind: 'restOwn', n: 1, what: 'cards' }]);
  assert.deepEqual(pay('rest 2 of your Characters'), [{ kind: 'restOwn', n: 2, what: 'characters' }]);
  assert.deepEqual(pay('rest 1 of your {Dressrosa} type Leader or Stage cards'),
    [{ kind: 'restOwn', n: 1, what: 'cards', filter: { types: ['Dressrosa'], category: ['LEADER', 'STAGE'] } }]);
  assert.deepEqual(pay('rest your Leader'), [{ kind: 'restOwn', n: 1, what: 'leader' }]);
  assert.deepEqual(pay("place 1 Stage with a cost of 1 at the bottom of the owner's deck"), [{ kind: 'bottomOwn', n: 1, filter: { category: ['STAGE'], costEq: 1 } }]);
  assert.deepEqual(pay("place 2 of your Characters at the bottom of the owner's deck"), [{ kind: 'bottomOwn', n: 2, filter: { category: ['CHARACTER'] } }]);
  // deux coûts
  assert.deepEqual(pay("rest this Character and return 1 of your Characters to the owner's hand"),
    [{ kind: 'restSelf' }, { kind: 'returnOwnChar', n: 1, filter: {} }]);
});

test('retraits : aller-retour sans écart (la phrase redite a les mêmes faits que le texte)', () => {
  const texts = [
    `[On Play] KO ${OPP(1)} with a cost of 3 or less.`,
    `[On Play] Rest 1 of ${opp} Characters with a cost of 2 or less.`,
    `[Main] KO all of ${opp} Characters with 3000 power or less.`,
    `[On Play] Trash ${OPP(1)} with 6000 power or less.`,
    `[On Play] KO ${OPP(1)} with a cost of 4 or less and ${OPP(1)} with a cost of 2 or less.`,
    `[On Play] Add ${OPP(1)} with a cost of 3 or less to the top of ${opp} Life cards face-up.`,
    "[Main] Add up to 1 Character with 5000 power or less to the top or bottom of the owner's Life cards face-up.",
    `[When Attacking] ${OPP(1, 'rested Characters').replace(/^u/, 'U')} will not become active in ${opp} next Refresh Phase.`,
    '[On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards: Set this Character as active.',
    `[Activate: Main] You may KO 1 of your Characters: Return up to 1 Character with a cost of 3 or less to the owner's hand.`,
  ];
  for (const en of texts) {
    const r = recipeOf(en);
    const gaps = blocking(compareTexts(r, { en }));
    assert.deepEqual(gaps.map((g) => g.message), [], en);
  }
  // une erreur d'un seul chiffre se voit
  const wrong = recipeOf(`[On Play] KO ${OPP(1)} with a cost of 3 or less.`);
  ((wrong.abilities[0].steps[0] as { action: Extract<Action, { kind: 'ko' }> }).action.target.filter).costMax = 4;
  assert.ok(blocking(compareTexts(wrong, { en: `[On Play] KO ${OPP(1)} with a cost of 3 or less.` })).length > 0);
});

// ---------- Compilation et jeu ----------

const C = {
  forcedKo: 'ZZ21-001', allKo: 'ZZ21-002', trash: 'ZZ21-003', lifeTop: 'ZZ21-004', selfBounce: 'ZZ21-005',
  forcedRest: 'ZZ21-006', koCost: 'ZZ21-007', returnCost: 'ZZ21-008', readyAll: 'ZZ21-009', leaderCost: 'ZZ21-010',
  bottomCost: 'ZZ21-011',
};
const O_BONNEY = 'ST21-004';   // coût 1, 3000
const O_STUSSY = 'ST21-006';   // coût 3, 5000
const O_CHOPPER = 'ST21-008';  // coût 4, 6000
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData(Object.fromEntries(Object.values(C).map((n) => [n, { ...base, number: n, name: `Essai ${n.slice(-3)}`, names: [`Essai ${n.slice(-3)}`] }])));

const oppT = (filter: Target['filter'], count: Target['count'] = 1, upTo = true): Target =>
  ({ side: 'opp', zone: 'field', characters: true, count, upTo, filter });
const ownT = (filter: Target['filter'], count: Target['count'] = 1, upTo = true): Target =>
  ({ side: 'own', zone: 'field', characters: true, count, upTo, filter });
const selfT: Target = { side: 'own', zone: 'field', self: true, characters: true, count: 1, upTo: false, filter: {} };
const ab = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;
const one = (timing: Ability['timing'], action: Action, extra: Partial<Ability> = {}): Recipe =>
  ({ num: '', abilities: [ab({ timing, steps: [{ action }], ...extra })] });
const RECIPES: Record<string, Recipe> = {
  [C.forcedKo]: one('onPlay', { kind: 'ko', target: oppT({ costMax: 3 }, 1, false) }),
  [C.allKo]: one('onPlay', { kind: 'ko', target: oppT({ costMax: 3 }, 'all', false) }),
  [C.trash]: one('onPlay', { kind: 'trashChar', target: oppT({ costMax: 4 }) }),
  [C.lifeTop]: one('onPlay', { kind: 'toLife', target: oppT({ costMax: 3 }), faceUp: true, where: 'top' }),
  [C.selfBounce]: one('activateMain', { kind: 'bounce', target: selfT }),
  [C.forcedRest]: one('onPlay', { kind: 'rest', target: oppT({ costMax: 3 }, 1, false) }),
  [C.koCost]: one('onPlay', { kind: 'ko', target: oppT({ costMax: 4 }) }, { cost: [{ kind: 'koOwnChar', n: 1, filter: {} }] }),
  [C.returnCost]: one('onPlay', { kind: 'bounce', target: oppT({ costMax: 4 }) }, { cost: [{ kind: 'returnOwnChar', n: 1, filter: { costMax: 1 } }] }),
  [C.readyAll]: one('onPlay', { kind: 'setActive', target: ownT({}, 'all', false) }),
  [C.leaderCost]: one('onPlay', { kind: 'ko', target: oppT({ costMax: 1 }) }, { cost: [{ kind: 'restOwn', n: 1, what: 'leader' }] }),
  [C.bottomCost]: one('onPlay', { kind: 'rest', target: oppT({}) }, { cost: [{ kind: 'bottomOwn', n: 1, filter: { category: ['CHARACTER'], costMax: 1 } }] }),
};
for (const [num, r] of Object.entries(RECIPES)) r.num = num;
const SET: RecipeSet = { set: 'ZZ21', entries: Object.fromEntries(Object.entries(RECIPES).map(([num, recipe]) => [num, { level: 'verified', recipe }])) };
addRecipeSet(SET);
const MINE = 'TEST-RETRAITS';
DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.values(C).map((n) => [n, 4])) } };

const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const cardOptions = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('card:'));
const three = (g: GameState) => setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }, { num: O_CHOPPER }]);

test('compilation : toutes les recettes d\'essai se compilent et passent les tests générés', () => {
  for (const [num, r] of Object.entries(RECIPES)) {
    assert.ok(compileRecipe(r).ok, num);
    const t = testRecipe(r);
    assert.ok(t.ok, `${num} : ${t.report ? formatReport(t.report) : t.failures.join(' | ')}`);
  }
});

test('jeu : KO obligatoire (sans « Aucune »), sans question quand le choix est imposé', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.forcedKo]); three(g); setDon(g, 0, 4); });
  s = play(s, C.forcedKo);
  expectTag(s, 'oppKo');
  assert.ok(!s.decision!.options.some((o) => o.id === 'none'), 'pas de refus possible');
  assert.deepEqual(cardOptions(s).map((o) => o.uid).sort(), [theirs(s, O_BONNEY).uid, theirs(s, O_STUSSY).uid].sort());
  s = choose(s, (o) => o.uid === theirs(s, O_STUSSY).uid);
  assert.ok(s.players[1].trash.some((c) => c.num === O_STUSSY));
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.forcedKo]); setChars(g, 1, [{ num: O_BONNEY }, { num: O_CHOPPER }]); setDon(g, 0, 4); });
  s = play(s, C.forcedKo);
  assert.equal(s.decision?.kind, 'main', 'une seule cible : aucune question');
  assert.ok(s.players[1].trash.some((c) => c.num === O_BONNEY));
  coherent(s);
});

test('jeu : KO de tous les Personnages qui correspondent ; épuiser obligatoire', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.allKo]); three(g); setDon(g, 0, 4); });
  s = play(s, C.allKo);
  assert.equal(s.decision?.kind, 'main');
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.forcedRest]); three(g); setDon(g, 0, 4); });
  s = play(s, C.forcedRest);
  expectTag(s, 'oppRest');
  assert.ok(!s.decision!.options.some((o) => o.id === 'none'));
  s = choose(s, (o) => o.uid === theirs(s, O_BONNEY).uid);
  assert.ok(theirs(s, O_BONNEY).rested);
  coherent(s);
});

test('jeu : placer dans la Défausse n\'est pas un KO (« ne peut pas être mis KO » n\'y fait rien)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => {
    setHand(g, 0, [C.trash]); three(g); setDon(g, 0, 4);
    addMod(g, { uid: g.players[1].chars.find((c) => c.num === O_CHOPPER)!.uid, stat: 'cantBeKO', amount: 0, until: 'turn', source: 'essai' });
  });
  s = play(s, C.trash);
  expectTag(s, 'oppKo');
  assert.ok(s.decision!.options.some((o) => o.id === 'none'), '« jusqu\'à » : refus possible');
  s = choose(s, (o) => o.uid === theirs(s, O_CHOPPER).uid);
  assert.ok(s.players[1].trash.some((c) => c.num === O_CHOPPER));
  assert.ok(logHas(s, 'placé dans la Défausse'));
  assert.ok(!logHas(s, 'est mis KO'));
  coherent(s);
});

test('jeu : Vie au-dessus seulement (pas de question au-dessus / au-dessous), face visible', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.lifeTop]); three(g); setDon(g, 0, 4); setLife(g, 1, ['ST21-013', 'ST21-005']); });
  const before = s.players[1].life.length;
  s = play(s, C.lifeTop);
  expectTag(s, 'oppToLife');
  s = choose(s, (o) => o.uid === theirs(s, O_STUSSY).uid);
  assert.equal(s.decision?.kind, 'main', 'aucune question de côté');
  assert.equal(s.players[1].life.length, before + 1);
  assert.equal(s.players[1].life[0].num, O_STUSSY);
  assert.equal(s.players[1].life[0].faceUp, true);
  coherent(s);
});

test('jeu : [Activation : Principale] « renvoyez cette carte » (proposée au joueur, l\'IA ne s\'en sert pas pour rien)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: C.selfBounce }]); setDon(g, 0, 2); });
  const uid = mine(s, C.selfBounce).uid;
  assert.ok(s.decision!.options.some((o) => o.id === `act:${uid}`));
  assert.equal(CARDS[C.selfBounce].activateMain!.useful!(s, 0, mine(s, C.selfBounce)), false);
  s = act(s, `act:${uid}`);
  assert.ok(s.players[0].hand.some((c) => c.uid === uid));
  assert.ok(!mine(s, C.selfBounce));
  coherent(s);
});

test('jeu : coûts « mettre KO 1 de vos Personnages », « renvoyer 1 de vos Personnages ... », « épuiser votre Leader »', () => {
  // KO : un vrai KO de son Personnage, puis l'effet
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.koCost]); setChars(g, 0, [{ num: O_BONNEY }]); three(g); setDon(g, 0, 4); });
  s = play(s, C.koCost);
  s = choose(s, 'yes');
  expectTag(s, 'trashOwn');
  s = choose(s, (o) => o.uid === mine(s, O_BONNEY).uid);
  assert.ok(logHas(s, 'est mis KO'));
  assert.ok(s.players[0].trash.some((c) => c.num === O_BONNEY));
  expectTag(s, 'oppKo');
  s = choose(s, (o) => o.uid === theirs(s, O_CHOPPER).uid);
  assert.ok(s.players[1].trash.some((c) => c.num === O_CHOPPER));
  coherent(s);

  // renvoyer : seulement un Personnage de coût 1 ou moins ; sans lui, pas de proposition
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.returnCost]); setChars(g, 0, [{ num: O_STUSSY }]); three(g); setDon(g, 0, 4); });
  s = play(s, C.returnCost);
  assert.equal(s.decision?.kind, 'main', 'aucun Personnage de coût 1 ou moins : pas de coût proposé');
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.returnCost]); setChars(g, 0, [{ num: O_STUSSY }, { num: O_BONNEY }]); three(g); setDon(g, 0, 4); });
  const bonney = mine(s, O_BONNEY).uid;
  s = play(s, C.returnCost);
  s = choose(s, 'yes');
  // un seul Personnage possible : le moteur répond d'office à la question
  if (s.decision?.tag === 'returnOwn') {
    assert.deepEqual(cardOptions(s).map((o) => o.uid), [bonney]);
    s = choose(s, (o) => o.uid === bonney);
  }
  assert.ok(s.players[0].hand.some((c) => c.uid === bonney));
  assert.ok(mine(s, O_STUSSY), 'le Personnage de coût 3 reste');
  expectTag(s, 'bounce');
  coherent(s);

  // épuiser son Leader (pas une DON!!, pas un Personnage)
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.leaderCost]); setChars(g, 0, [{ num: O_STUSSY }]); three(g); setDon(g, 0, 4); });
  s = play(s, C.leaderCost);
  s = choose(s, 'yes');
  if (s.decision?.tag === 'restCost') {
    assert.deepEqual(s.decision.options.map((o) => o.uid), [s.players[0].leader.uid]);
    s = choose(s, (o) => o.uid === s.players[0].leader.uid);
  }
  assert.ok(s.players[0].leader.rested);
  assert.ok(!mine(s, O_STUSSY).rested);
  coherent(s);
});

test('jeu : coût « placer 1 de vos Personnages ... au-dessous du deck »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [C.bottomCost]); setChars(g, 0, [{ num: O_STUSSY }, { num: O_BONNEY }]); three(g); setDon(g, 0, 4); });
  const bonney = mine(s, O_BONNEY).uid;
  s = play(s, C.bottomCost);
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.at(-1)?.uid, bonney, 'au-dessous du deck');
  assert.ok(mine(s, O_STUSSY));
  expectTag(s, 'oppRest');
  coherent(s);
});

test('jeu : redresser tous ses Personnages', () => {
  let s = scenario([MINE, 'ST-21'], (g) => {
    setHand(g, 0, [C.readyAll]); setChars(g, 0, [{ num: O_BONNEY, extra: { rested: true } }, { num: O_STUSSY, extra: { rested: true } }]); setDon(g, 0, 4);
  });
  s = play(s, C.readyAll);
  assert.ok(!mine(s, O_BONNEY).rested && !mine(s, O_STUSSY).rested);
  coherent(s);
});
