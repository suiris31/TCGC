// Famille « cartes » du traducteur (étape C, tâche C2.3) : traduction des tournures (piocher, défausser, dessus du deck
// dans la Défausse, chercher dans le deck, réorganiser, Défausse vers la main ou sous le deck, main sur ou sous le deck,
// carte révélée du dessus du deck, coûts), aller-retour, compilation, jeu des nouvelles briques (cards/bricks-cards.ts)
// et vérifications sur tout le catalogue.
//
// Aucun texte de carte : les phrases sont construites ici à partir de valeurs (règle du § 15.8), et les cartes jouées
// sont inventées (ZZ23-...), avec l'adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecipeSet, CARDS, HIDDEN, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { blocking, compare, compareTexts } from '../engine/recipes/compare.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe as describeRecipe } from '../engine/recipes/describe.ts';
import { CARDS_FAMILY } from '../engine/recipes/parse/cards.ts';
import { FAMILIES, parseCard } from '../engine/recipes/parse/index.ts';
import { normalize } from '../engine/recipes/parse/normalize.ts';
import { formatReport, testRecipe } from '../engine/recipes/testgen.ts';
import type { Ability, Action, CostPart, Recipe, RecipeSet, Step } from '../engine/recipes/types.ts';
import { knows } from '../engine/rules.ts';
import type { CardData, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, keepOrder, logHas, play, scenario, setDeckTop, setDon, setHand, take } from './helpers.ts';

// ---------- Traduction ----------

const parse = (effectEn: string, triggerEn: string | null = null) => parseCard({ num: 'ZZ23-900', effectEn, triggerEn }, [CARDS_FAMILY]);
const recipeOf = (effectEn: string): Recipe => {
  const r = parse(effectEn);
  assert.ok(r.ok, `${effectEn} → ${r.ok ? '' : r.unknown.join(' | ')}`);
  return r.recipe;
};
const stepsOf = (effectEn: string): Step[] => recipeOf(effectEn).abilities[0].steps;
const firstAction = (effectEn: string): Action => {
  const st = stepsOf(effectEn)[0];
  assert.ok('action' in st, JSON.stringify(st));
  return st.action;
};
const costOf = (effectEn: string): CostPart[] => recipeOf(effectEn).abilities[0].cost ?? [];
const TOP = 'from the top of your deck';

test('cartes : piocher, défausser (filtre, « jusqu\'à »), défausse adverse, dessus du deck dans la Défausse', () => {
  assert.deepEqual(firstAction('[On Play] Draw 3 cards.'), { kind: 'draw', n: 3 });
  assert.deepEqual(firstAction('[On Play] Draw a card.'), { kind: 'draw', n: 1 });
  assert.deepEqual(firstAction('[Main] Trash 2 cards from your hand.'), { kind: 'discard', n: 2 });
  assert.deepEqual(firstAction('[Main] Trash 1 green {Minks} type card from your hand.'), { kind: 'discard', n: 1, filter: { types: ['Minks'], color: ['Green'] } });
  assert.deepEqual(firstAction('[Main] Trash up to 4 cards from your hand.'), { kind: 'discard', n: 4, upTo: true });
  assert.deepEqual(firstAction('[On Play] Your opponent trashes 2 cards from their hand.'), { kind: 'oppDiscard', n: 2 });
  assert.deepEqual(firstAction(`[On Play] Trash 3 cards ${TOP}.`), { kind: 'trashTop', n: 3, side: 'own' });
  assert.deepEqual(firstAction("[On Play] Trash 2 cards from the top of your opponent's deck."), { kind: 'trashTop', n: 2, side: 'opp' });
  // deux actions de la famille dans une phrase
  const two = stepsOf('[On Play] Draw 2 cards and trash 2 cards from your hand.');
  assert.deepEqual(two, [{ action: { kind: 'draw', n: 2 } }, { link: 'and', action: { kind: 'discard', n: 2 } }]);
  // « instead » (remplacement) n'est pas de la famille : pas lu
  assert.equal(parse('[On Play] Trash 1 card from your hand instead.').ok, false);
});

test('cartes : recherches (main, terrain, sans révéler, carte montrée) et cartes restantes', () => {
  const base = { kind: 'search', look: 4, take: 1, upTo: true, filter: { types: ['Minks'], costMin: 3 }, dest: 'hand' } as const;
  const look = `[On Play] Look at 4 cards ${TOP}; reveal up to 1 {Minks} type card with a cost of 3 or more and add it to your hand.`;
  assert.deepEqual(stepsOf(`${look} Then, place the rest at the bottom of your deck in any order.`), [{ action: { ...base, rest: 'bottom' } }]);
  assert.deepEqual(stepsOf(`${look} Then, trash the rest.`), [{ action: { ...base, rest: 'trash' } }]);
  assert.deepEqual(stepsOf(`${look} Then, place the rest at the top of your deck in any order.`), [{ action: { ...base, rest: 'top' } }]);
  assert.deepEqual(stepsOf(`${look} Then, place the rest at the top or bottom of the deck in any order.`), [{ action: { ...base, rest: 'topOrBottom' } }]);
  // le reste dans la même phrase (« ..., add it to your hand and place the rest ... »)
  assert.deepEqual(stepsOf(`[On Play] Look at 4 cards ${TOP}; reveal up to 1 {Minks} type card with a cost of 3 or more, add it to your hand and trash the rest.`),
    [{ action: { ...base, rest: 'trash', joined: true } }]);
  // « Then, place the rest ... and draw 1 card » : la suite reprend avec « and »
  assert.deepEqual(stepsOf(`${look} Then, place the rest at the bottom of your deck in any order and draw 1 card.`),
    [{ action: { ...base, rest: 'bottom' } }, { link: 'and', action: { kind: 'draw', n: 1 } }]);
  // plusieurs cartes, « a total of »
  assert.deepEqual(firstAction(`[On Play] Look at 6 cards ${TOP}; reveal up to a total of 2 [Essai A] or [Essai B] and add them to your hand. Then, trash the rest.`),
    { kind: 'search', look: 6, take: 2, upTo: true, filter: { name: ['Essai A', 'Essai B'] }, dest: 'hand', rest: 'trash' });
  // sans révéler : seulement « card », sans filtre
  assert.deepEqual(firstAction(`[On Play] Look at 2 cards ${TOP} and add up to 1 card to your hand. Then, trash the rest.`),
    { kind: 'search', look: 2, take: 1, upTo: true, filter: {}, dest: 'hand', rest: 'trash', hidden: true });
  assert.equal(parse(`[On Play] Look at 2 cards ${TOP} and add up to 1 Event to your hand. Then, trash the rest.`).ok, false);
  // jouer depuis le deck ; « Reveal 1 card » : la carte est montrée aux deux joueurs
  assert.deepEqual(firstAction(`[On Play] Look at 4 cards ${TOP} and play up to 2 {Minks} type Character cards with a cost of 2 or less rested. Then, trash the rest.`),
    { kind: 'search', look: 4, take: 2, upTo: true, filter: { types: ['Minks'], costMax: 2, category: ['CHARACTER'] }, dest: 'play', rest: 'trash', rested: true });
  assert.deepEqual(firstAction(`[On Play] Reveal 1 card ${TOP} and play up to 1 green Character card with a cost of 2. Then, place the rest at the top or bottom of your deck.`),
    { kind: 'search', look: 1, take: 1, upTo: true, filter: { color: ['Green'], costEq: 2, category: ['CHARACTER'] }, dest: 'play', rest: 'topOrBottom', shown: true });
  assert.deepEqual(firstAction(`[On Play] Reveal 1 card ${TOP} and add up to 1 green card to your hand. Then, trash the rest.`),
    { kind: 'search', look: 1, take: 1, upTo: true, filter: { color: ['Green'] }, dest: 'hand', rest: 'trash', shown: true });
  // une phrase « the rest » sans recherche avant : non comprise
  assert.equal(parse('[On Play] Draw 1 card. Then, trash the rest.').ok, false);
});

test('cartes : réorganiser le dessus du deck, Défausse vers la main ou sous le deck, main sur ou sous le deck', () => {
  assert.deepEqual(firstAction(`[On Play] Look at 4 cards ${TOP} and place them at the top or bottom of the deck in any order.`),
    { kind: 'arrangeTop', look: 4, where: 'topOrBottom' });
  assert.deepEqual(firstAction(`[On Play] Look at 2 cards ${TOP} and place them at the top of the deck in any order.`), { kind: 'arrangeTop', look: 2, where: 'top' });
  assert.deepEqual(firstAction('[On Play] Add up to 2 {Minks} type cards from your trash to your hand.'),
    { kind: 'trashToHand', count: 2, upTo: true, filter: { types: ['Minks'] } });
  assert.deepEqual(firstAction('[On Play] Add 1 Event from your trash to your hand.'), { kind: 'trashToHand', count: 1, upTo: false, filter: { category: ['EVENT'] } });
  assert.deepEqual(firstAction('[On Play] Place up to 3 cards from your trash at the bottom of your deck in any order.'),
    { kind: 'trashToBottom', count: 3, side: 'own', filter: {}, upTo: true });
  assert.deepEqual(firstAction("[On Play] Place 2 Events from your opponent's trash at the bottom of their deck in any order."),
    { kind: 'trashToBottom', count: 2, side: 'opp', filter: { category: ['EVENT'] } });
  assert.deepEqual(firstAction('[On Play] Return 2 cards from your trash to the bottom of your deck in any order.'),
    { kind: 'trashToBottom', count: 2, side: 'own', filter: {}, wording: 'return' });
  assert.deepEqual(firstAction('[On Play] Place 2 cards from your hand at the bottom of your deck in any order.'), { kind: 'handToBottom', n: 2 });
  assert.deepEqual(firstAction('[On Play] Place 1 card from your hand at the top of your deck.'), { kind: 'handToBottom', n: 1, where: 'top' });
  assert.deepEqual(firstAction('[On Play] Place 3 cards from your hand at the top or bottom of your deck in any order.'), { kind: 'handToBottom', n: 3, where: 'topOrBottom' });
  assert.deepEqual(firstAction('[On Play] Your opponent places 3 cards from their hand at the bottom of their deck in any order.'), { kind: 'oppHandToBottom', n: 3 });
});

test('cartes : coûts (défausser, révéler, dessus du deck, Défausse sous le deck)', () => {
  assert.deepEqual(costOf('[On Play] You may trash 2 cards from your hand: Draw 3 cards.'), [{ kind: 'discard', n: 2 }]);
  assert.deepEqual(costOf('[On Play] You may trash 1 card with a [Trigger] from your hand: Draw 1 card.'), [{ kind: 'discard', n: 1, filter: { trigger: true } }]);
  assert.deepEqual(costOf('[On Play] You may reveal 2 green Events from your hand: Draw 1 card.'), [{ kind: 'reveal', n: 2, filter: { color: ['Green'], category: ['EVENT'] } }]);
  assert.deepEqual(costOf(`[On Play] You may trash 2 cards ${TOP}: Draw 1 card.`), [{ kind: 'trashTop', n: 2 }]);
  assert.deepEqual(costOf('[Activate: Main] You may place 4 {Minks} type cards from your trash at the bottom of your deck in any order: Draw 1 card.'),
    [{ kind: 'trashToBottom', n: 4, filter: { types: ['Minks'] } }]);
  assert.deepEqual(costOf('[Activate: Main] You may return 3 cards from your trash to the bottom of your deck in any order: Draw 1 card.'),
    [{ kind: 'trashToBottom', n: 3, wording: 'return' }]);
});

test('cartes : carte révélée du dessus du deck (condition, la jouer, la placer au-dessous)', () => {
  const reveal = `[On Play] Reveal 1 card ${TOP}.`;
  assert.deepEqual(stepsOf(`${reveal} If the revealed card has a cost of 6 or more, draw 1 card. Then, place the revealed card at the bottom of your deck.`), [
    { action: { kind: 'revealTop' } },
    { cond: { kind: 'revealed', filter: { costMin: 6 } }, action: { kind: 'draw', n: 1 } },
    { link: 'then', action: { kind: 'revealedToBottom' } },
  ]);
  assert.deepEqual(stepsOf(`${reveal} If that card's type includes "Mink", draw 1 card and trash 1 card from your hand.`), [
    { action: { kind: 'revealTop' } },
    { cond: { kind: 'revealed', filter: { typeIncludes: 'Mink' } }, group: [{ action: { kind: 'draw', n: 1 } }, { link: 'and', action: { kind: 'discard', n: 1 } }] },
  ]);
  assert.deepEqual(stepsOf(`${reveal} If that card is a green {Minks} type Character card, you may play that card rested. Then, place the rest at the bottom of your deck.`), [
    { action: { kind: 'revealTop' } },
    { cond: { kind: 'revealed', filter: { types: ['Minks'], color: ['Green'], category: ['CHARACTER'] } }, may: [{ action: { kind: 'playRevealed', rested: true } }] },
    { link: 'then', action: { kind: 'revealedToBottom', asRest: true } },
  ]);
  // « that card » sans carte révélée juste avant : désigne autre chose, non compris
  assert.equal(parse('[On Play] Draw 1 card. If that card is a green Character card, draw 1 card.').ok, false);
  assert.equal(parse('[On Play] Draw 1 card. Then, place the revealed card at the bottom of your deck.').ok, false);
});

// ---------- Aller-retour ----------

const ROUND_TRIP = [
  '[On Play] Draw 3 cards.',
  '[Main] Trash up to 4 cards from your hand.',
  '[Main] Trash 1 green {Minks} type card from your hand.',
  "[On Play] Trash 2 cards from the top of your opponent's deck.",
  `[On Play] Look at 4 cards ${TOP}; reveal up to 1 {Minks} type card with a cost of 3 or more and add it to your hand. Then, place the rest at the top or bottom of your deck in any order.`,
  `[On Play] Look at 4 cards ${TOP}; reveal up to 1 {Minks} type card with a cost of 3 or more, add it to your hand and trash the rest.`,
  `[On Play] Look at 2 cards ${TOP} and add up to 1 card to your hand. Then, trash the rest.`,
  `[On Play] Reveal 1 card ${TOP} and play up to 1 green Character card with a cost of 2. Then, place the rest at the top or bottom of your deck in any order.`,
  `[On Play] Look at 2 cards ${TOP} and place them at the top of the deck in any order.`,
  '[On Play] Add up to 2 {Minks} type cards from your trash to your hand.',
  "[On Play] Place 2 Events from your opponent's trash at the bottom of their deck in any order.",
  '[On Play] Return 2 cards from your trash to the bottom of your deck in any order.',
  '[On Play] Place 1 card from your hand at the top of your deck in any order.',
  '[Activate: Main] You may return 3 cards from your trash to the bottom of your deck in any order: Draw 1 card.',
  `[On Play] Reveal 1 card ${TOP}. If the revealed card has a cost of 6 or more, draw 1 card. Then, place the revealed card at the bottom of your deck.`,
  `[On Play] Reveal 1 card ${TOP}. If that card is a green Character card, you may play that card rested. Then, place the rest at the bottom of your deck.`,
];

test('cartes : aller-retour (la phrase redite se relit en la même recette, sans écart avec le texte)', () => {
  for (const text of ROUND_TRIP) {
    const r = recipeOf(text);
    const d = describeRecipe(r);
    assert.ok(d.ok, `${text} : ${d.ok ? '' : d.missing.join()}`);
    const again = parseCard({ num: r.num, effectEn: d.en, triggerEn: null }, [CARDS_FAMILY]);
    assert.ok(again.ok, `${d.en} → ${again.ok ? '' : again.unknown.join(' | ')}`);
    assert.deepEqual(again.recipe, r, d.en);
    assert.deepEqual(blocking(compareTexts(r, { en: text })), [], text);
  }
  // une valeur fausse ressort
  const r = recipeOf(ROUND_TRIP[4]);
  const st = r.abilities[0].steps[0] as Extract<Step, { action: Action }>;
  (st.action as Extract<Action, { kind: 'search' }>).look = 5;
  assert.ok(blocking(compareTexts(r, { en: ROUND_TRIP[4] })).length > 0);
});

// ---------- Compilation et jeu ----------

const C = {
  discardUpTo: 'ZZ23-001', discardNavy: 'ZZ23-002', oppTop: 'ZZ23-003', searchTop: 'ZZ23-004', searchEither: 'ZZ23-005',
  searchHidden: 'ZZ23-006', playTwo: 'ZZ23-007', reorder: 'ZZ23-008', trashTwo: 'ZZ23-009', oppTrashBottom: 'ZZ23-010',
  handTop: 'ZZ23-011', reveal: 'ZZ23-012', revealPlay: 'ZZ23-013', revealGuarded: 'ZZ23-014', revealCost: 'ZZ23-015',
};
const NAVY = 'ZZ23-050';      // Personnage {Navy}, coût 2, sans effet
const OTHER = 'ZZ23-051';     // Personnage, coût 5, sans effet
const EVENT = 'ZZ23-052';     // Événement, sans effet
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 1, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData({
  ...Object.fromEntries(Object.values(C).map((n) => [n, { ...base, number: n, name: `Essai ${n.slice(-3)}`, names: [`Essai ${n.slice(-3)}`] }])),
  [NAVY]: { ...base, number: NAVY, name: 'Marin', names: ['Marin'], cost: 2, types: ['Navy'] },
  [OTHER]: { ...base, number: OTHER, name: 'Autre', names: ['Autre'], cost: 5 },
  [EVENT]: { ...base, number: EVENT, name: 'Évent', names: ['Évent'], category: 'EVENT', power: null, counter: null },
});

const ab = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;
const one = (action: Action, extra: Partial<Ability> = {}): Recipe => ({ num: '', abilities: [ab({ timing: 'onPlay', steps: [{ action }], ...extra })] });
const navy = { types: ['Navy'] };
const RECIPES: Record<string, Recipe> = {
  [C.discardUpTo]: one({ kind: 'discard', n: 2, upTo: true }),
  [C.discardNavy]: one({ kind: 'discard', n: 1, filter: navy }),
  [C.oppTop]: one({ kind: 'trashTop', n: 2, side: 'opp' }),
  [C.searchTop]: one({ kind: 'search', look: 3, take: 1, upTo: true, filter: navy, dest: 'hand', rest: 'top' }),
  [C.searchEither]: one({ kind: 'search', look: 2, take: 1, upTo: true, filter: navy, dest: 'hand', rest: 'topOrBottom' }),
  [C.searchHidden]: one({ kind: 'search', look: 3, take: 1, upTo: true, filter: {}, dest: 'hand', rest: 'trash', hidden: true }),
  [C.playTwo]: one({ kind: 'search', look: 4, take: 2, upTo: true, filter: { ...navy, category: ['CHARACTER'] }, dest: 'play', rest: 'trash', rested: true }),
  [C.reorder]: one({ kind: 'arrangeTop', look: 3, where: 'top' }),
  [C.trashTwo]: one({ kind: 'trashToHand', count: 2, upTo: false, filter: navy }),
  [C.oppTrashBottom]: one({ kind: 'trashToBottom', count: 2, side: 'opp', upTo: true, filter: {} }),
  [C.handTop]: one({ kind: 'handToBottom', n: 1, where: 'top' }),
  [C.reveal]: {
    num: '',
    abilities: [ab({ timing: 'onPlay', steps: [
      { action: { kind: 'revealTop' } },
      { cond: { kind: 'revealed', filter: navy }, action: { kind: 'draw', n: 2 } },
      { link: 'then', action: { kind: 'revealedToBottom' } },
    ] })],
  },
  [C.revealPlay]: {
    num: '',
    abilities: [ab({ timing: 'onPlay', steps: [
      { action: { kind: 'revealTop' } },
      { cond: { kind: 'revealed', filter: { ...navy, category: ['CHARACTER'] } }, may: [{ action: { kind: 'playRevealed', rested: true } }] },
      { link: 'then', action: { kind: 'revealedToBottom', asRest: true } },
    ] })],
  },
  [C.revealGuarded]: {
    num: '',
    abilities: [ab({ timing: 'onPlay', steps: [
      { cond: { kind: 'leaderIs', names: ['Personne'] }, action: { kind: 'revealTop' } },
      { cond: { kind: 'revealed', filter: {} }, action: { kind: 'draw', n: 1 } },
    ] })],
  },
  [C.revealCost]: one({ kind: 'trashToHand', count: 1, upTo: true, filter: navy }, { cost: [{ kind: 'reveal', n: 1, filter: { category: ['EVENT'] } }] }),
};
for (const [num, r] of Object.entries(RECIPES)) r.num = num;
const SET: RecipeSet = { set: 'ZZ23', entries: Object.fromEntries(Object.entries(RECIPES).map(([num, recipe]) => [num, { level: 'verified', recipe }])) };
addRecipeSet(SET);
const MINE = 'TEST-CARTES';
DECKS[MINE] = {
  id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001',
  cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.values(C).map((n) => [n, 1])), [NAVY]: 4, [OTHER]: 4, [EVENT]: 4 },
};

const names = (s: GameState, zone: 'hand' | 'trash' | 'deck', p: 0 | 1 = 0) => s.players[p][zone].map((c) => c.num);
// La carte jouée, et les cartes connues en main, dans la Défausse et au-dessus du deck (prises dans le deck)
const start = (num: string, z: { hand?: string[]; trash?: string[]; top?: string[]; extra?: (g: GameState) => void } = {}) => {
  const s = scenario([MINE, 'ST-21'], (g) => {
    setHand(g, 0, [num, ...(z.hand ?? [])]);
    g.players[0].trash.push(...(z.trash ?? []).map((n) => take(g, 0, n)));
    setDeckTop(g, 0, z.top ?? []);
    setDon(g, 0, 4);
    z.extra?.(g);
  });
  return play(s, num);
};

test('compilation : les recettes d\'essai se compilent et passent les tests générés', () => {
  for (const [num, r] of Object.entries(RECIPES)) {
    assert.ok(compileRecipe(r).ok, `${num} : ${JSON.stringify(compileRecipe(r))}`);
    const t = testRecipe(r);
    assert.ok(t.ok, `${num} : ${t.report ? formatReport(t.report) : t.failures.join(' | ')}`);
  }
});

test('jeu : défausser « jusqu\'à » (refus possible), défausser filtré (seules les cartes qui conviennent)', () => {
  let s = start(C.discardUpTo, { hand: [OTHER, OTHER, EVENT] });
  expectTag(s, 'discard');
  assert.ok(s.decision!.options.some((o) => o.id === 'none'));
  s = choose(s, (o) => o.label === 'Autre');
  s = choose(s, 'none');
  assert.equal(names(s, 'trash').filter((n) => n === OTHER).length, 1);
  coherent(s);

  // une seule carte qui convient : le moteur la prend sans question
  s = start(C.discardNavy, { hand: [OTHER, NAVY] });
  assert.ok(names(s, 'trash').includes(NAVY) && names(s, 'hand').includes(OTHER));
  coherent(s);
});

test('jeu : dessus du deck adverse dans sa Défausse', () => {
  const s = start(C.oppTop);
  assert.equal(s.players[1].trash.length, 2);
  assert.ok(logHas(s, 'du dessus du deck adverse'));
  coherent(s);
});

test('jeu : recherche, reste au-dessus (ordre choisi) ou au-dessus / au-dessous ; carte prise sans la révéler', () => {
  let s = start(C.searchTop, { top: [OTHER, NAVY, EVENT] });
  expectTag(s, 'pick');
  s = choose(s, (o) => o.label === 'Marin');
  expectTag(s, 'scry');
  s = choose(s, (o) => o.label === 'Évent');
  assert.deepEqual(names(s, 'deck').slice(0, 2), [EVENT, OTHER]);
  assert.ok(names(s, 'hand').includes(NAVY));
  coherent(s);

  s = start(C.searchEither, { top: [NAVY, OTHER] });
  s = choose(s, (o) => o.label === 'Marin');
  expectTag(s, 'scry');
  s = choose(s, 'bottom');
  assert.equal(names(s, 'deck').at(-1), OTHER);
  coherent(s);

  s = start(C.searchHidden, { top: [NAVY, OTHER, EVENT] });
  s = choose(s, (o) => o.label === 'Autre');
  const taken = s.players[0].hand.find((c) => c.num === OTHER)!;
  assert.ok(!knows(s, 1, taken.uid), "l'adversaire ne connaît pas la carte prise");
  assert.equal(s.players[0].trash.filter((c) => c.num === NAVY || c.num === EVENT).length, 2);
  coherent(s);
});

test('jeu : jouer jusqu\'à 2 Personnages du deck (épuisés), réorganiser le dessus du deck', () => {
  let s = start(C.playTwo, { top: [NAVY, OTHER, NAVY, EVENT] });
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.label === 'Marin');
  s = choose(s, (o) => o.label === 'Marin');
  const played = s.players[0].chars.filter((c) => c.num === NAVY);
  assert.equal(played.length, 2);
  assert.ok(played.every((c) => c.rested));
  assert.ok(names(s, 'trash').includes(OTHER) && names(s, 'trash').includes(EVENT));
  coherent(s);

  s = start(C.reorder, { top: [NAVY, OTHER, EVENT] });
  expectTag(s, 'scry');
  s = choose(s, (o) => o.label === 'Évent');
  s = choose(s, (o) => o.label === 'Marin');
  assert.deepEqual(names(s, 'deck').slice(0, 3), [EVENT, NAVY, OTHER]);
  coherent(s);
});

test('jeu : Défausse vers la main (2, obligatoire), Défausse adverse sous son deck, main au-dessus du deck', () => {
  // obligatoire, une seule carte différente qui convient : prise deux fois, sans question (pas de « Aucune »)
  let s = start(C.trashTwo, { trash: [NAVY, OTHER, NAVY] });
  assert.equal(names(s, 'hand').filter((n) => n === NAVY).length, 2);
  assert.ok(names(s, 'trash').includes(OTHER));
  coherent(s);

  s = start(C.oppTrashBottom, { extra: (g) => { g.players[1].trash.push(...g.players[1].deck.splice(0, 3)); } });
  const deckBefore = s.players[1].deck.length;
  s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, 'none');
  assert.equal(s.players[1].deck.length, deckBefore + 1);
  assert.equal(s.players[1].trash.length, 2);
  coherent(s);

  s = start(C.handTop, { hand: [OTHER] });
  assert.equal(names(s, 'deck')[0], OTHER);
  coherent(s);
});

test('jeu : carte révélée (condition vraie ou fausse, la jouer, au-dessous ensuite ; rien si rien n\'a été révélé)', () => {
  let s = start(C.reveal, { top: [NAVY, OTHER, EVENT] });
  s = keepOrder(s);
  assert.ok(names(s, 'hand').includes(NAVY), 'condition vraie : 2 cartes piochées (dont la révélée)');
  assert.ok(names(s, 'hand').includes(OTHER));
  coherent(s);

  s = start(C.reveal, { top: [OTHER, NAVY] });
  assert.ok(!names(s, 'hand').includes(OTHER), 'condition fausse : rien pioché');
  assert.equal(names(s, 'deck').at(-1), OTHER, 'la carte révélée va au-dessous');
  assert.equal(names(s, 'deck')[0], NAVY);
  assert.ok(knows(s, 1, s.players[0].deck.at(-1)!.uid), "l'adversaire la connaît");
  coherent(s);

  s = start(C.revealPlay, { top: [NAVY] });
  s = choose(s, 'yes');
  assert.ok(s.players[0].chars.some((c) => c.num === NAVY && c.rested));
  coherent(s);

  s = start(C.revealPlay, { top: [EVENT] });
  assert.equal(names(s, 'deck').at(-1), EVENT);
  coherent(s);

  // la révélation n'a pas eu lieu (condition fausse) : la carte du dessus n'est pas « la carte révélée »
  s = start(C.revealGuarded, { top: [NAVY] });
  assert.equal(names(s, 'deck')[0], NAVY);
  assert.ok(!logHas(s, 'pioche'));
  coherent(s);
});

test('jeu : coût « révéler » (proposé seulement si l\'effet peut servir)', () => {
  let s = start(C.revealCost, { hand: [EVENT], trash: [NAVY] });
  expectTag(s, 'may');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'reveal' || s.decision?.options.some((o) => o.label === 'Évent')) s = choose(s, (o) => o.label === 'Évent');
  if (s.decision?.tag === 'pick') s = choose(s, (o) => o.label === 'Marin');
  assert.ok(names(s, 'hand').includes(NAVY));
  assert.ok(names(s, 'hand').includes(EVENT), 'la carte révélée reste en main');
  coherent(s);

  s = start(C.revealCost, { hand: [EVENT] });
  assert.notEqual(s.decision?.tag, 'may', 'rien dans la Défausse : coût pas proposé');
  coherent(s);
});

// ---------- Tout le catalogue ----------

const nums = Object.keys(CARDS).filter((n) => n !== HIDDEN && !n.startsWith('ZZ'));
const actionsOf = (steps: Step[]): Action[] => steps.flatMap((st) => ('action' in st ? [st.action]
  : 'group' in st ? actionsOf(st.group) : 'may' in st ? actionsOf(st.may) : st.chooseOne.flatMap(actionsOf)));

// Écarts bloquants de l'aller-retour, une fois toutes les familles de la vague C2 réunies (intégration C2, mesuré le
// 6 novembre 2026 : 74 cartes sur 2 275 traduites sans reste ; 70 après S1, « up to 1 of your Leader or up to 1 of your
// Characters » et « to 1 of your Leader » lus par compare.ts). Tous viennent de la rédaction redite (describe) ou lue
// (compare), pas de la recette : « 1 of your Leader » / « your Leader », « this card » / « this Character », « can attack
// Characters on the turn in which it is played » / [Rush: Character], « played on this turn » / « during this turn »,
// « your X type Characters » / « all of your ... » (n° 1581), deux gains d'une même phrase redits en deux, « place » /
// « add » dans la Vie et « the owner's » (n° 1509), P-008 (obligatoire en VO, « jusqu'à » en VF)... Une carte en écart
// n'atteint jamais `verified` : la tâche de son set relit la recette. Le plafond ne doit que baisser.
const MAX_GAPS = 44;   // 74 après C2 ; 58 après la vague S-1 : S1 (« up to 1 of your Leader or up to 1 of your Characters »), S4 (« your 1 active Leader », « you only have », « played on this turn », « or [X] »), S5 (« is negated ») ; 44 après S8 (« can attack Characters on the turn in which it is played », « If you have [X] », « the owner's Life » d'un Personnage adverse)

test('catalogue : cartes restantes toujours écrites, « that card » toujours après une révélation, aller-retour sans écart', () => {
  let searches = 0;
  const gaps: string[] = [];
  for (const n of nums) {
    const d = CARDS[n]!;
    const r = parseCard({ num: n, effectEn: d.effectEn ?? '', triggerEn: d.triggerEn ?? null }, FAMILIES);
    if (!r.ok) continue;
    const abilities = [...r.recipe.abilities, ...(r.recipe.trigger ? [r.recipe.trigger] : [])];
    const all = abilities.flatMap((a) => actionsOf(a.steps));
    // interprétation n° 1661 : une recherche traduite a sa phrase « the rest » (sinon rest serait supposé)
    if (all.some((a) => a.kind === 'search')) {
      searches++;
      assert.match(normalize(`${d.effectEn ?? ''}\n${d.triggerEn ?? ''}`),/\bthe rest\b/, `${n} : recherche sans « the rest »`);
    }
    for (const a of abilities) {
      a.steps.forEach((st, i) => {
        if (st.cond?.kind !== 'revealed') return;
        const prev = a.steps[i - 1];
        assert.ok(prev && 'action' in prev && prev.action.kind === 'revealTop', `${n} : « that card » sans révélation juste avant`);
      });
    }
    if (all.length && blocking(compare(n, r.recipe)).length) gaps.push(n);
  }
  assert.ok(searches >= 60, `recherches traduites : ${searches}`);
  assert.ok(gaps.length <= MAX_GAPS, `${gaps.length} cartes en écart à l'aller-retour (plafond ${MAX_GAPS}) : ${gaps.join(', ')}`);
});

test('catalogue : les tournures de la famille dans 3 cartes ou plus sont comprises (morceaux non compris de la famille)', () => {
  const FAMILY = /\b(?:draw|look at|from (?:the top of )?your (?:opponent's )?deck|from (?:your|their) hand|from your trash|reveal|the rest|trashes)\b/i;
  // hors de la famille : remplacements (« instead »), conditions générales, jouer depuis la main ou la Défausse, Vie,
  // révélation de la Vie ou du deck adverse, et ce qui suit une phrase non comprise d'une autre famille
  const OTHERS = /instead|^condition|Play (?:up to|this)|play up to|Life|opponent's deck|^évènement|cards? if you have|Choose a cost|place the rest|trash the rest|and (?:give|rest|KO|play)/i;
  const counts = new Map<string, Set<string>>();
  for (const n of nums) {
    const d = CARDS[n]!;
    const r = parseCard({ num: n, effectEn: d.effectEn ?? '', triggerEn: d.triggerEn ?? null }, FAMILIES);
    if (r.ok) continue;
    for (const u of r.unknown) if (FAMILY.test(u) && !OTHERS.test(u)) counts.set(u, (counts.get(u) ?? new Set()).add(n));
  }
  const frequent = [...counts].filter(([, s]) => s.size >= 3).map(([u, s]) => `${s.size} ${u}`);
  assert.deepEqual(frequent, []);
});
