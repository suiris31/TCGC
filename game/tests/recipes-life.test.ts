// Famille « Vie » du traducteur (étape C, tâche C2.5) : traduction des tournures (ajouter à la Vie depuis le deck ou la
// main, prendre une carte de Vie en main, placer une carte de Vie dans la Défausse, regarder la Vie, la remettre dans
// l'ordre, « vous ne pouvez pas ajouter de carte de Vie à votre main », coûts et conditions sur la Vie), aller-retour,
// compilation et jeu des nouvelles briques (bricks-life.ts).
//
// Aucun texte de carte : les phrases sont construites ici à partir de valeurs (règle du § 15.8), et les cartes jouées
// sont inventées (ZZ25-...), avec l'adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecipeSet, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { blocking, compareTexts } from '../engine/recipes/compare.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe as describeRecipe } from '../engine/recipes/describe.ts';
import { parseCard } from '../engine/recipes/parse/index.ts';
import { LIFE } from '../engine/recipes/parse/life.ts';
import { formatReport, testRecipe } from '../engine/recipes/testgen.ts';
import type { Ability, Action, Cond, CostPart, Recipe, RecipeSet, Step } from '../engine/recipes/types.ts';
import type { CardData, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, logHas, play, scenario, setDeckTop, setDon, setHand, setLife } from './helpers.ts';

// ---------- Traduction ----------

const parse = (effectEn: string) => parseCard({ num: 'ZZ25-900', effectEn, triggerEn: null }, [LIFE]);
const recipeOf = (effectEn: string): Recipe => {
  const r = parse(effectEn);
  assert.ok(r.ok, `${effectEn} → ${r.ok ? '' : r.unknown.join(' | ')}`);
  return r.recipe;
};
const actionsOf = (effectEn: string): Action[] => recipeOf(effectEn).abilities[0].steps.map((st) => {
  assert.ok('action' in st, JSON.stringify(st));
  return st.action;
});
const firstAction = (effectEn: string): Action => actionsOf(effectEn)[0];
const condOf = (cond: string): Cond => {
  const st = recipeOf(`[On Play] If ${cond}, add up to 1 card from the top of your deck to the top of your Life cards.`).abilities[0].steps[0];
  assert.ok(st.cond, JSON.stringify(st));
  return st.cond;
};
const costOf = (cost: string): CostPart[] => recipeOf(`[On Play] You may ${cost}: Add up to 1 card from the top of your deck to the top of your Life cards.`).abilities[0].cost ?? [];
// Aller-retour : la phrase redite par describe ne contredit pas la phrase d'origine (aucun écart bloquant)
const roundTrip = (effectEn: string) => {
  const r = recipeOf(effectEn);
  const d = describeRecipe(r);
  assert.ok(d.ok, `${effectEn} : ${d.ok ? '' : d.missing.join()}`);
  const e = blocking(compareTexts(r, { en: effectEn }));
  assert.deepEqual(e.map((x) => x.message), [], `${effectEn}\n  → ${d.en}`);
};

const deckToLife = (n: number, upTo: boolean, face = '') => `Add ${upTo ? 'up to ' : ''}${n} ${n > 1 ? 'cards' : 'card'} from the top of your deck to the top of your Life cards${face}`;
// « regarder la carte du dessus d'une Vie (et la ranger) », « regarder toute une Vie et la remettre dans l'ordre »
const lookTop = (whose: string, arrange: string) => `Look at up to 1 card from the top of ${whose} Life cards${arrange}`;
const ARRANGE = ', and place it at the top or bottom of the Life cards';
const lookAll = (whose: string, back: string) => `Look at all of ${whose} Life cards and place them back in ${back} Life area in any order`;
const lifeToHand = (n: number, upTo: boolean, end: string, whose = 'your', to = 'your hand') =>
  `Add ${upTo ? 'up to ' : ''}${n} ${n > 1 ? 'cards' : 'card'} from the ${end} of ${whose} Life cards to ${to}`;

test('Vie : conditions (sa Vie, la Vie adverse, total, l\'un ou l\'autre, comparaison)', () => {
  assert.deepEqual(condOf('you have 2 or less Life cards'), { kind: 'life', side: 'own', cmp: 'le', n: 2 });
  assert.deepEqual(condOf('you have 3 or more Life cards'), { kind: 'life', side: 'own', cmp: 'ge', n: 3 });
  assert.deepEqual(condOf('your opponent has 1 or less Life cards'), { kind: 'life', side: 'opp', cmp: 'le', n: 1 });
  assert.deepEqual(condOf('you have 0 Life cards'), { kind: 'life', side: 'own', cmp: 'eq', n: 0 });
  assert.deepEqual(condOf('your opponent has 1 Life card'), { kind: 'life', side: 'opp', cmp: 'eq', n: 1 });
  assert.deepEqual(condOf('you and your opponent have a total of 4 or less Life cards'), { kind: 'life', side: 'total', cmp: 'le', n: 4 });
  assert.deepEqual(condOf('either you or your opponent has 0 Life cards'),
    { kind: 'or', any: [{ kind: 'life', side: 'own', cmp: 'eq', n: 0 }, { kind: 'life', side: 'opp', cmp: 'eq', n: 0 }] });
  assert.deepEqual(condOf('you have less Life cards than your opponent'), { kind: 'lifeVsOpp', cmp: 'lt' });
  assert.deepEqual(condOf('you have more Life cards than your opponent'), { kind: 'lifeVsOpp', cmp: 'gt' });
  assert.deepEqual(condOf("the number of your Life cards is equal to or less than the number of your opponent's Life cards"), { kind: 'lifeVsOpp', cmp: 'le' });
  assert.deepEqual(condOf('you have a total of 4 or less cards in your Life area'), { kind: 'life', side: 'own', cmp: 'le', n: 4 });
  // « Life area and hand » : la Vie ET la main, pas lue ici
  assert.equal(parse('[On Play] If you have a total of 4 or less cards in your Life area and hand, draw 1 card.').ok, false);
});

test('Vie : coûts (prendre en main, placer dans la Défausse, retourner), une seule carte', () => {
  assert.deepEqual(costOf('add 1 card from the top of your Life cards to your hand'), [{ kind: 'lifeToHand', from: 'top' }]);
  assert.deepEqual(costOf('add 1 card from the top or bottom of your Life cards to your hand'), [{ kind: 'lifeToHand', from: 'topOrBottom' }]);
  assert.deepEqual(costOf('add 1 card from your Life area to your hand'), [{ kind: 'lifeToHand', from: 'top' }]);
  assert.deepEqual(costOf('trash 1 card from the top or bottom of your Life cards'), [{ kind: 'trashLife', from: 'topOrBottom' }]);
  assert.deepEqual(costOf('turn 1 card from the top of your Life cards face-up'), [{ kind: 'flipLife', faceUp: true }]);
  assert.deepEqual(costOf('turn 1 card from the top of your Life cards face-down'), [{ kind: 'flipLife', faceUp: false }]);
  // deux cartes : aucune brique de coût ne le sait
  assert.equal(parse('[On Play] You may turn 2 cards from the top of your Life cards face-up: Draw 1 card.').ok, false);
});

test('Vie : actions (deck → Vie, Vie → main, Vie → Défausse, main → Vie, regarder, remettre dans l\'ordre, interdiction)', () => {
  assert.deepEqual(firstAction(`[On Play] ${deckToLife(1, true)}.`), { kind: 'lifeFromDeck', n: 1, upTo: true });
  assert.deepEqual(firstAction(`[On Play] ${deckToLife(2, false, ' face-up')}.`), { kind: 'lifeFromDeck', n: 2, upTo: false, faceUp: true });
  assert.deepEqual(firstAction(`[On Play] ${lifeToHand(1, false, 'top')}.`), { kind: 'lifeToHand', n: 1, side: 'own', from: 'top' });
  assert.deepEqual(firstAction(`[On Play] ${lifeToHand(1, true, 'top or bottom')}.`), { kind: 'lifeToHand', n: 1, side: 'own', from: 'topOrBottom', upTo: true });
  assert.deepEqual(firstAction(`[On Play] ${lifeToHand(1, true, 'top', "your opponent's", "the owner's hand")}.`),
    { kind: 'lifeToHand', n: 1, side: 'opp', from: 'top', upTo: true });
  assert.deepEqual(firstAction('[On Play] Your opponent adds 1 card from the top of their Life cards to their hand.'), { kind: 'lifeToHand', n: 1, side: 'opp', from: 'top' });
  assert.deepEqual(firstAction("[On KO] Trash up to 1 card from the top of your opponent's Life cards."), { kind: 'trashLife', n: 1, side: 'opp', from: 'top', upTo: true });
  assert.deepEqual(firstAction('[On Play] Trash 1 card from the top or bottom of your Life cards.'), { kind: 'trashLife', n: 1, side: 'own', from: 'topOrBottom' });
  assert.deepEqual(actionsOf("[On Play] Trash 1 card from the top of each of your and your opponent's Life cards."), [
    { kind: 'trashLife', n: 1, side: 'own', from: 'top' }, { kind: 'trashLife', n: 1, side: 'opp', from: 'top' },
  ]);
  assert.deepEqual(firstAction('[On Play] Add up to 1 card from your hand to the top of your Life cards.'), { kind: 'handToLife', n: 1, upTo: true, filter: {} });
  assert.deepEqual(firstAction('[On Play] Add up to 1 {Navy} type Character card from your hand to the top of your Life cards face-up.'),
    { kind: 'handToLife', n: 1, upTo: true, filter: { types: ['Navy'], category: ['CHARACTER'] }, faceUp: true });
  assert.deepEqual(firstAction('[On Play] Add up to 1 Character card with a [Trigger] from your hand to the top of your Life cards face-up.'),
    { kind: 'handToLife', n: 1, upTo: true, filter: { trigger: true, category: ['CHARACTER'] }, faceUp: true });
  assert.deepEqual(firstAction(`[On Play] ${lookTop("your or your opponent's", ARRANGE)}.`),
    { kind: 'lookLife', side: 'any', arrange: true });
  assert.deepEqual(firstAction(`[On Play] ${lookAll('your', 'your')}.`), { kind: 'reorderLife', side: 'own' });
  assert.deepEqual(firstAction(`[On Play] ${lookAll("your opponent's", 'their')}.`), { kind: 'reorderLife', side: 'opp' });
  assert.deepEqual(firstAction('[Main] You cannot add Life cards to your hand using your own effects during this turn.'), { kind: 'noLifeToHand' });
  // pas lus : deux camps différents ; « their » sans sujet ; l'adversaire choisit dessus ou dessous
  assert.equal(parse(`[On Play] ${lookAll('your', 'their')}.`).ok, false);
  assert.equal(parse('[On Play] Trash 1 card from the top of their Life cards.').ok, false);
  assert.equal(parse('[On Play] Your opponent adds 1 card from the top or bottom of their Life cards to their hand.').ok, false);
});

test('Vie : aller-retour (la recette redite ne contredit pas la phrase)', () => {
  for (const effect of [
    `[On Play] ${deckToLife(1, true)}.`,
    `[On Play] ${deckToLife(2, false, ' face-up')}.`,
    `[On Play] ${lifeToHand(1, false, 'top')}.`,
    `[End of Your Turn] ${lifeToHand(1, true, 'top or bottom')}.`,
    `[On KO] ${lifeToHand(1, true, 'top', "your opponent's", "the owner's hand")}.`,
    '[On Play] Your opponent adds 1 card from the top of their Life cards to their hand.',
    "[On KO] Trash up to 1 card from the top of your opponent's Life cards.",
    '[On Play] Add up to 1 {Navy} type Character card from your hand to the top of your Life cards face-up.',
    `[On Play] ${lookTop("your or your opponent's", ARRANGE)}.`,
    `[On Play] ${lookAll('your', 'your')}.`,
    '[Main] You cannot add Life cards to your hand using your own effects during this turn.',
    `[On Play] If you have 2 or less Life cards, ${deckToLife(1, true).replace(/^A/, 'a')}.`,
    `[On Play] If you have less Life cards than your opponent, ${deckToLife(1, true).replace(/^A/, 'a')}.`,
    `[On Play] If the number of your Life cards is equal to or less than the number of your opponent's Life cards, ${deckToLife(1, true).replace(/^A/, 'a')}.`,
    `[On Play] If you and your opponent have a total of 5 or less Life cards, ${deckToLife(1, true).replace(/^A/, 'a')}.`,
    `[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: ${deckToLife(1, true)}.`,
    `[Activate: Main] [Once Per Turn] You may trash 1 card from the top of your Life cards: ${deckToLife(1, true)}.`,
    `[When Attacking] You may turn 1 card from the top of your Life cards face-up: ${deckToLife(1, true)}.`,
  ]) roundTrip(effect);
});

// ---------- Compilation et jeu ----------

const C = {
  deck2Up: 'ZZ25-001', ownUpTo: 'ZZ25-002', ownBottom: 'ZZ25-003', noLife: 'ZZ25-004', handUp: 'ZZ25-005',
  reorder: 'ZZ25-006', trashOwn: 'ZZ25-007', oppToHand: 'ZZ25-008', bothTrash: 'ZZ25-009', total: 'ZZ25-010',
};
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Yellow'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData(Object.fromEntries(Object.values(C).map((n) => [n, { ...base, number: n, name: `Essai ${n.slice(-3)}`, names: [`Essai ${n.slice(-3)}`] }])));

const ab = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;
const one = (timing: Ability['timing'], action: Action, extra: Partial<Ability> = {}): Recipe => ({ num: '', abilities: [ab({ timing, steps: [{ action }], ...extra })] });
const steps = (...list: Step[]): Recipe => ({ num: '', abilities: [ab({ timing: 'onPlay', steps: list })] });
const RECIPES: Record<string, Recipe> = {
  [C.deck2Up]: one('onPlay', { kind: 'lifeFromDeck', n: 2, upTo: true, faceUp: true }),
  [C.ownUpTo]: one('onPlay', { kind: 'lifeToHand', n: 1, side: 'own', from: 'top', upTo: true }),
  [C.ownBottom]: one('onPlay', { kind: 'lifeToHand', n: 1, side: 'own', from: 'topOrBottom' }),
  [C.noLife]: steps({ action: { kind: 'noLifeToHand' } }, { link: 'then', action: { kind: 'lifeToHand', n: 1, side: 'own', from: 'top' } }),
  [C.handUp]: one('onPlay', { kind: 'handToLife', n: 1, upTo: true, filter: { costMax: 1 }, faceUp: true }),
  [C.reorder]: one('onPlay', { kind: 'reorderLife', side: 'own' }),
  [C.trashOwn]: one('onPlay', { kind: 'trashLife', n: 2, side: 'own', from: 'top', upTo: true }),
  [C.oppToHand]: one('onPlay', { kind: 'lifeToHand', n: 1, side: 'opp', from: 'top', upTo: true }),
  [C.bothTrash]: steps({ action: { kind: 'trashLife', n: 1, side: 'own', from: 'top' } }, { link: 'and', action: { kind: 'trashLife', n: 1, side: 'opp', from: 'top' } }),
  [C.total]: { num: '', abilities: [ab({ timing: 'onPlay', steps: [{ cond: { kind: 'life', side: 'total', cmp: 'le', n: 4 }, action: { kind: 'lifeFromDeck', n: 1, upTo: true } }] })] },
};
for (const [num, r] of Object.entries(RECIPES)) r.num = num;
const SET: RecipeSet = { set: 'ZZ25', entries: Object.fromEntries(Object.entries(RECIPES).map(([num, recipe]) => [num, { level: 'verified', recipe }])) };
addRecipeSet(SET);
const MINE = 'TEST-VIE';
DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.values(C).map((n) => [n, 4])) } };

const LIFE3 = ['ST21-013', 'ST21-005', 'ST21-006'];
const nums = (cards: { num: string }[]) => cards.map((c) => c.num);
const ready = (num: string, more: (g: GameState) => void = () => {}) => scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [num]); setDon(g, 0, 4); more(g); });

test('compilation : toutes les recettes d\'essai se compilent et passent les tests générés', () => {
  for (const [num, r] of Object.entries(RECIPES)) {
    assert.ok(compileRecipe(r).ok, num);
    const t = testRecipe(r);
    assert.ok(t.ok, `${num} : ${t.report ? formatReport(t.report) : t.failures.join(' | ')}`);
  }
});

test('jeu : 2 cartes du deck au-dessus de la Vie, face visible, sans question', () => {
  let s = ready(C.deck2Up, (g) => { setLife(g, 0, ['ST21-013']); setDeckTop(g, 0, ['ST21-005', 'ST21-006']); });
  s = play(s, C.deck2Up);
  assert.equal(s.decision?.kind, 'main', 'aucune question');
  assert.deepEqual(nums(s.players[0].life), ['ST21-006', 'ST21-005', 'ST21-013']);
  assert.ok(s.players[0].life[0].faceUp && s.players[0].life[1].faceUp && !s.players[0].life[2].faceUp);
  coherent(s);
});

test('jeu : « jusqu\'à 1 » de sa Vie en main : le joueur peut refuser ; dessus ou dessous au choix', () => {
  let s = ready(C.ownUpTo, (g) => setLife(g, 0, LIFE3));
  s = play(s, C.ownUpTo);
  expectTag(s, 'lifeToHandUpTo');
  s = choose(s, 'none');
  assert.equal(s.players[0].life.length, 3);
  coherent(s);

  s = ready(C.ownUpTo, (g) => setLife(g, 0, LIFE3));
  const hand = s.players[0].hand.length;
  s = play(s, C.ownUpTo);
  s = choose(s, 'yes');
  assert.equal(s.players[0].life.length, 2);
  assert.equal(s.players[0].hand.length, hand, 'la carte jouée part, la carte de Vie arrive');
  assert.ok(s.players[0].hand.some((c) => c.num === 'ST21-013'));
  coherent(s);

  s = ready(C.ownBottom, (g) => setLife(g, 0, LIFE3));
  s = play(s, C.ownBottom);
  expectTag(s, 'lifeSide');
  s = choose(s, 'bottom');
  assert.deepEqual(nums(s.players[0].life), ['ST21-013', 'ST21-005']);
  assert.ok(s.players[0].hand.some((c) => c.num === 'ST21-006'));
  coherent(s);
});

test('jeu : « vous ne pouvez pas ajouter de carte de Vie à votre main » empêche la suite', () => {
  let s = ready(C.noLife, (g) => setLife(g, 0, LIFE3));
  s = play(s, C.noLife);
  assert.equal(s.players[0].life.length, 3);
  assert.equal(s.players[0].noLifeToHandTurn, s.turn);
  assert.ok(logHas(s, 'ne peut plus ajouter de carte de Vie'));
  coherent(s);
});

test('jeu : une carte de la main au-dessus de la Vie, face visible, seulement celles qui conviennent', () => {
  let s = ready(C.handUp, (g) => { setHand(g, 0, [C.handUp, 'ST21-004', 'ST21-006']); setLife(g, 0, ['ST21-013']); });
  s = play(s, C.handUp);
  expectTag(s, 'toLife');
  const offered = s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.num);
  assert.deepEqual(offered, ['ST21-004'], 'coût 1 ou moins seulement');
  assert.ok(s.decision!.options.some((o) => o.id === 'none'));
  s = choose(s, (o) => o.num === 'ST21-004');
  assert.equal(s.players[0].life[0].num, 'ST21-004');
  assert.equal(s.players[0].life[0].faceUp, true);
  coherent(s);
});

test('jeu : regarder toute sa Vie et la remettre dans l\'ordre choisi', () => {
  let s = ready(C.reorder, (g) => setLife(g, 0, LIFE3));
  s = play(s, C.reorder);
  expectTag(s, 'lifeOrder');
  s = choose(s, (o) => o.num === 'ST21-006');
  expectTag(s, 'lifeOrder');
  s = choose(s, (o) => o.num === 'ST21-013');
  assert.deepEqual(nums(s.players[0].life), ['ST21-006', 'ST21-013', 'ST21-005']);
  coherent(s);
});

test('jeu : sa Vie dans la Défausse « jusqu\'à 2 » (une question par carte) ; la Vie adverse sans question', () => {
  let s = ready(C.trashOwn, (g) => setLife(g, 0, LIFE3));
  s = play(s, C.trashOwn);
  expectTag(s, 'trashLifeUpTo');
  s = choose(s, 'yes');
  expectTag(s, 'trashLifeUpTo');
  s = choose(s, 'none');
  assert.deepEqual(nums(s.players[0].life), ['ST21-005', 'ST21-006']);
  assert.ok(s.players[0].trash.some((c) => c.num === 'ST21-013'));
  coherent(s);

  s = ready(C.oppToHand, (g) => setLife(g, 1, LIFE3));
  const theirHand = s.players[1].hand.length;
  s = play(s, C.oppToHand);
  assert.equal(s.decision?.kind, 'main', 'Vie adverse : aucune question');
  assert.equal(s.players[1].life.length, 2);
  assert.equal(s.players[1].hand.length, theirHand + 1);
  coherent(s);

  s = ready(C.bothTrash, (g) => { setLife(g, 0, LIFE3); setLife(g, 1, ['ST21-013', 'ST21-005']); });
  s = play(s, C.bothTrash);
  assert.equal(s.players[0].life.length, 2);
  assert.equal(s.players[1].life.length, 1);
  coherent(s);
});

test('jeu : condition sur le total des deux Vies', () => {
  let s = ready(C.total, (g) => { setLife(g, 0, ['ST21-013', 'ST21-005']); setLife(g, 1, ['ST21-013', 'ST21-005']); });
  s = play(s, C.total);
  assert.equal(s.players[0].life.length, 3, '2 + 2 ≤ 4 : une carte ajoutée');
  s = ready(C.total, (g) => { setLife(g, 0, LIFE3); setLife(g, 1, ['ST21-013', 'ST21-005']); });
  s = play(s, C.total);
  assert.equal(s.players[0].life.length, 3, '3 + 2 > 4 : rien');
  coherent(s);
});
