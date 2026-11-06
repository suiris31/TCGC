// Famille « jouer » du traducteur (étape C, tâche C2.6) : jouer des cartes, conditions générales, coûts de cartes,
// évènements « When ... », [En bloquant], valeurs calculées, « Si vous le faites », choix laissé à l'adversaire.
//
// Les phrases sont construites par le test (tournures à trous remplies par des valeurs inventées) : aucune n'est
// recopiée d'une carte. Les cartes jouées sont inventées (ZZ26-...), avec des adversaires de ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecipeSet, loadCardData } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { describe } from '../engine/recipes/describe.ts';
import { normalize } from '../engine/recipes/parse/normalize.ts';
import { parseCard, type Family } from '../engine/recipes/parse/index.ts';
import { PLAY } from '../engine/recipes/parse/play.ts';
import type { Ability, Recipe, RecipeSet, Step } from '../engine/recipes/types.ts';
import { def, power } from '../engine/rules.ts';
import type { CardData, GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, play, scenario, setChars, setDon, setHand, setLife, take } from './helpers.ts';

// ---------- Traduction ----------

// Quelques actions des autres familles, juste assez pour lire les phrases du test
const AIDE: Family = {
  name: 'aide',
  actions: [
    { re: /^Draw (\d+) cards?$/i, make: (m) => [{ kind: 'draw', n: +m[1] }] },
    { re: /^KO (.+)$/i, make: (m, h) => [{ kind: 'ko', target: h.target(m[1]) }] },
    { re: /^(.+?) gains? ([+-]\d+) (power|cost)(.*)$/i,
      make: (m, h) => [{ kind: m[3] as 'power', target: h.target(m[1], 'own'), amount: +m[2], until: h.duration(m[4]) }] },
  ],
};
const parse = (t: string) => parseCard({ num: 'ZZ26-900', effectEn: t, triggerEn: null }, [PLAY, AIDE]);
const one = (t: string): Ability => {
  const r = parse(t);
  assert.ok(r.ok, `${t} : ${JSON.stringify(!r.ok && r.unknown)}`);
  assert.equal(r.recipe.abilities.length, 1);
  return r.recipe.abilities[0];
};
const step = (t: string): Step => one(t).steps[0];
const cond = (c: string) => step(`[On Play] If ${c}, draw 1 card.`).cond;
// aller-retour : la recette redite donne la phrase lue (même normalisation)
const roundTrip = (t: string) => {
  const r = parse(t);
  assert.ok(r.ok, t);
  const d = describe(r.recipe);
  assert.ok(d.ok, JSON.stringify(!d.ok && d.missing));
  assert.equal(d.en, normalize(t));
};

test('jouer : conditions générales (Leader, main, Défausse, deck, terrain, puissance, tour)', () => {
  assert.deepEqual(cond('your Leader is [Alpha] or [Beta]'), { kind: 'leaderIs', names: ['Alpha', 'Beta'] });
  assert.deepEqual(cond('your Leader has the {Ga} or {Gb} type'), { kind: 'leaderType', types: ['Ga', 'Gb'], mode: 'any' });
  assert.deepEqual(cond('your Leader\'s type includes "Gc"'), { kind: 'leaderTypeIncludes', part: 'Gc' });
  assert.deepEqual(cond('your Leader is multicolored'), { kind: 'leaderColor', colors: [], multicolor: true });
  assert.deepEqual(cond('your Leader is [Alpha] or has the {Ga} type'),
    { kind: 'or', any: [{ kind: 'leaderIs', names: ['Alpha'] }, { kind: 'leaderType', types: ['Ga'] }] });
  assert.deepEqual(cond('your Leader has 0 power or less'), { kind: 'power', who: 'leader', cmp: 'le', n: 0 });
  assert.deepEqual(cond('this Character has 6000 power or more'), { kind: 'power', who: 'self', cmp: 'ge', n: 6000 });
  assert.deepEqual(cond('you have 4 or less cards in your hand'), { kind: 'hand', side: 'own', cmp: 'le', n: 4 });
  assert.deepEqual(cond('your opponent has 6 or more cards in their hand'), { kind: 'hand', side: 'opp', cmp: 'ge', n: 6 });
  assert.deepEqual(cond('you have 9 or more cards in your trash'), { kind: 'trash', cmp: 'ge', n: 9 });
  assert.deepEqual(cond('you have 3 or more Events in your trash'), { kind: 'trash', cmp: 'ge', n: 3, filter: { category: ['EVENT'] } });
  assert.deepEqual(cond('there are 7 or less cards in your deck'), { kind: 'deck', cmp: 'le', n: 7 });
  assert.deepEqual(cond('this Character was played on this turn'), { kind: 'playedThisTurn' });
  assert.deepEqual(cond('it is your opponent\'s turn'), { kind: 'turn', mine: false });
  assert.deepEqual(cond('you have [Alpha]'), { kind: 'chars', side: 'own', cmp: 'ge', n: 1, filter: { name: ['Alpha'], category: ['CHARACTER'] } });
  assert.deepEqual(cond('you don\'t have [Alpha]'), { kind: 'chars', side: 'own', cmp: 'eq', n: 0, filter: { name: ['Alpha'], category: ['CHARACTER'] } });
  // « you do not have 4 X » : moins de 4
  assert.deepEqual(cond('you do not have 4 Characters with a cost of 6 or more'),
    { kind: 'chars', side: 'own', cmp: 'le', n: 3, filter: { costMin: 6, category: ['CHARACTER'] } });
  assert.deepEqual(cond('the only Characters on your field are {Ga} type Characters'), { kind: 'onlyChars', filter: { types: ['Ga'] } });
  assert.deepEqual(cond('you have 7 or more rested cards'), { kind: 'fieldCards', side: 'own', cmp: 'ge', n: 7, rested: true });
  // « cards » sans catégorie : pas des Personnages (garde-fou de l'étude)
  assert.equal(parse('[On Play] If you have 2 or more {Ga} cards, draw 1 card.').ok, true);
  assert.equal(parse('[On Play] If you have 2 or more cards on your field, draw 1 card.').ok, false);
});

test('jouer : coûts qui prennent des cartes (main, deck, Défausse)', () => {
  assert.deepEqual(one('[On Play] You may trash 2 cards from your hand: Draw 3 cards.').cost, [{ kind: 'discard', n: 2 }]);
  assert.deepEqual(one('[On Play] You may trash 1 {Ga} type card from your hand: Draw 1 card.').cost, [{ kind: 'discard', n: 1, filter: { types: ['Ga'] } }]);
  assert.deepEqual(one('[On Play] You may reveal 2 Events from your hand: Draw 1 card.').cost, [{ kind: 'reveal', n: 2, filter: { category: ['EVENT'] } }]);
  assert.deepEqual(one('[On Play] You may trash 3 cards from the top of your deck: Draw 1 card.').cost, [{ kind: 'trashTop', n: 3 }]);
  assert.deepEqual(one('[On Play] You may place 4 cards from your trash at the bottom of your deck in any order: Draw 1 card.').cost, [{ kind: 'trashToBottom', n: 4 }]);
});

test('jouer : jouer des cartes (main, Défausse, les deux, cette carte), « Activate this card\'s ... »', () => {
  assert.deepEqual(step('[On Play] Play up to 1 {Ga} type Character card with a cost of 3 or less from your hand rested.'),
    { action: { kind: 'play', from: 'hand', count: 1, upTo: true, filter: { costMax: 3, types: ['Ga'], category: ['CHARACTER'] }, rested: true } });
  assert.deepEqual(step('[On Play] Play up to 2 Character cards with a cost of 2 from your hand or trash.'),
    { action: { kind: 'play', from: 'handOrTrash', count: 2, upTo: true, filter: { costEq: 2, category: ['CHARACTER'] } } });
  assert.deepEqual(step('[On Play] Play up to 1 {Ga} type Character card from your trash with a cost of 5 or less.'),
    { action: { kind: 'play', from: 'trash', count: 1, upTo: true, filter: { costMax: 5, types: ['Ga'], category: ['CHARACTER'] } } });
  assert.deepEqual(step('[On Play] Play up to 1 [Alpha] from your hand.'),
    { action: { kind: 'play', from: 'hand', count: 1, upTo: true, filter: { name: ['Alpha'] } } });
  assert.deepEqual(step('[On KO] Play this Character card from your trash rested.'), { action: { kind: 'playSelf', rested: true } });
  const r = parseCard({ num: 'ZZ26-901', effectEn: '-', triggerEn: "Activate this card's [On Play] effect." }, [PLAY]);
  assert.ok(r.ok);
  assert.deepEqual(r.recipe.trigger!.steps, [{ action: { kind: 'activate', which: 'onPlay' } }]);
});

test('jouer : évènements « When ... »', () => {
  const ev = (e: string) => one(`[Your Turn] When ${e}, draw 1 card.`).event;
  assert.deepEqual(ev('one of your {Ga} type Characters is KO\'d'), { on: 'koOwnChar', filter: { types: ['Ga'] } });
  assert.deepEqual(ev('your Character with 6000 base power or more is KO\'d by your opponent\'s effect'), { on: 'koOwnChar', filter: { basePowerMin: 6000 }, byOpponent: true });
  assert.deepEqual(ev('your opponent\'s Character is KO\'d'), { on: 'koOppChar', filter: {} });
  assert.deepEqual(ev('a Character is KO\'d'), { on: 'koChar' });
  assert.deepEqual(ev('this Character is KO\'d by your opponent\'s effect'), { on: 'koOwnChar', self: true, byOpponent: true });
  assert.deepEqual(ev('a DON!! card on your field is returned to your DON!! deck'), { on: 'donReturned' });
  assert.deepEqual(ev('this Character becomes rested'), { on: 'rested' });
  assert.deepEqual(ev('you play a {Ga} type Character'), { on: 'playChar', filter: { types: ['Ga'] } });
  assert.deepEqual(ev('your opponent activates an Event'), { on: 'activateEvent', byOpponent: true });
  assert.deepEqual(ev('a card is trashed from your hand by an effect'), { on: 'trashFromHand' });
  assert.equal(one('[Your Turn] When you take damage, draw 1 card.').timing, 'when');
});

test('jouer : valeurs calculées (« for every », coût égal à un compte), garde-fous', () => {
  assert.deepEqual(step('[Your Turn] This Character gains +2000 power for every 3 cards in your trash.'), {
    action: { kind: 'power', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 2000, until: 'permanent', per: { every: 3, count: { kind: 'trash' } } },
  });
  assert.deepEqual((step('[On Play] This Character gains +1000 power during this turn for every card in your hand.') as { action: { per: unknown } }).action.per,
    { every: 1, count: { kind: 'hand', side: 'own' } });
  assert.deepEqual((step('[On Play] KO up to 2 of your opponent\'s Characters with a cost equal to or less than the number of DON!! cards on your field.') as { action: { target: unknown } }).action.target,
    { side: 'opp', zone: 'field', count: 2, upTo: true, filter: { costMaxOf: { kind: 'donField', side: 'own' } }, characters: true });
  assert.deepEqual((step('[Main] Play up to 1 {Ga} type Character card with a cost equal to or less than the total of your and your opponent\'s Life cards from your trash.') as { action: { filter: unknown } }).action.filter,
    { types: ['Ga'], category: ['CHARACTER'], costMaxOf: { kind: 'life', side: 'total' } });
  // un compte qu'on ne sait pas lire (cartes défaussées par le coût) : échec plutôt qu'une fausse lecture
  assert.equal(parse('[On Play] This Character gains +1000 power during this turn for every card trashed.').ok, false);
});

test('jouer : « Your opponent chooses one » et « If you do / If you don\'t »', () => {
  const st = one('[On Play] Your opponent chooses one:\n• Draw 2 cards.\n• KO up to 1 of your opponent\'s Characters with a cost of 4 or less.').steps;
  assert.equal(st.length, 1);
  assert.ok('action' in st[0] && st[0].action.kind === 'oppChooseOne' && st[0].action.options.length === 2);
  const r = one('[On Play] Play up to 1 {Ga} type Character card from your hand. If you do, draw 2 cards. If you don\'t, draw 1 card.');
  assert.deepEqual(r.steps.map((x) => x.link), [undefined, 'ifYouDo', 'ifNotYouDo']);
});

test('jouer : aller-retour des tournures (la recette redite donne la phrase lue)', () => {
  for (const t of [
    '[On Play] If your Leader has 0 power or less, draw 1 card.',
    '[On Play] If the only Characters on your field are {Ga} type Characters, draw 2 cards.',
    '[Your Turn] This Character gains +2000 power for every 3 cards in your trash.',
    "[On Play] KO up to 2 of your opponent's Characters with a cost equal to or less than the number of DON!! cards on your field.",
    '[Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, draw 1 card.',
    "When this Character is KO'd by your opponent's effect, draw 2 cards.",
    '[On Block] Draw 1 card.',
    '[On Play] Play up to 1 {Ga} type Character card with a cost of 2 or less from your hand or trash.',
    '[On Play] Play up to 1 {Ga} type Character card with a cost of 3 or less from your hand. If you do, draw 2 cards.',
    '[On Play] You may trash 2 cards from your hand: Draw 3 cards.',
  ]) roundTrip(t);
});

// ---------- Compilation, jouée dans une partie ----------

const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: ['Ga'], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
const C = (n: number) => `ZZ26-${String(n).padStart(3, '0')}`;
const KO_LIFE = C(1);      // [Jouée] KO adverse de coût ≤ cartes de Vie adverses
const PER_TRASH = C(2);    // +1000 pour chaque lot de 2 cartes de la Défausse (permanent)
const PLAY_DRAW = C(3);    // [Jouée] jouer un {Ga} de coût ≤ 2 de la main ; si vous le faites, piocher 1 ; sinon, piocher 2
const SMALL = C(4);        // Personnage {Ga} coût 1, sans effet
const WATCHER = C(5);      // [Votre tour] [Une fois par tour] quand un Personnage adverse est mis KO, piocher 1
const BLOCKER = C(6);      // [Bloqueur] [En bloquant] piocher 1
const OPP_CHOICE = C(7);   // [Jouée] l'adversaire choisit : piocher 2, ou KO adverse coût ≤ 4
const FROM_TRASH = C(8);   // [Jouée] jouer un {Ga} coût ≤ 1 de la main ou de la Défausse
const STRONG = C(9);       // [Jouée] si ce Personnage a 6000 de puissance ou plus, piocher 1
const SELF_KO = C(10);     // quand ce Personnage est mis KO par un effet adverse, piocher 1
const NAMES: Record<string, Partial<CardData>> = {
  [KO_LIFE]: { cost: 4 }, [PER_TRASH]: { cost: 3 }, [PLAY_DRAW]: { cost: 3 }, [SMALL]: { cost: 1, power: 2000 },
  [WATCHER]: { cost: 2 }, [BLOCKER]: { keywords: ['Blocker'], effect: '[Blocker]', effectEn: '[Blocker]' }, [OPP_CHOICE]: { cost: 3 }, [FROM_TRASH]: { cost: 2 },
  [STRONG]: { cost: 5, power: 6000 }, [SELF_KO]: { cost: 2 },
};
loadCardData(Object.fromEntries(Object.entries(NAMES).map(([n, x]) => [n, { ...base, number: n, ...x }])));

const own = (filter = {}) => ({ side: 'own' as const, zone: 'field' as const, self: true, count: 1, upTo: false, filter, characters: true });
const oppUpTo1 = (filter: Record<string, unknown>) => ({ side: 'opp' as const, zone: 'field' as const, count: 1, upTo: true, filter, characters: true });
const R = (num: string, abilities: Ability[], keywords?: Recipe['keywords']): [string, { level: 'verified'; recipe: Recipe }] =>
  [num, { level: 'verified', recipe: { num, abilities, ...(keywords ? { keywords } : {}) } }];
const playGa = (costMax: number, from: 'hand' | 'handOrTrash') =>
  ({ action: { kind: 'play' as const, from, count: 1, upTo: true, filter: { costMax, types: ['Ga'], category: ['CHARACTER' as const] } } });
const SET: RecipeSet = {
  set: 'ZZ26',
  entries: Object.fromEntries([
    R(KO_LIFE, [{ timing: 'onPlay', steps: [{ action: { kind: 'ko', target: oppUpTo1({ costMaxOf: { kind: 'life', side: 'opp' } }) } }] }]),
    R(PER_TRASH, [{ timing: 'static', steps: [{ action: { kind: 'power', target: own(), amount: 1000, until: 'permanent', per: { every: 2, count: { kind: 'trash' } } } }] }]),
    R(PLAY_DRAW, [{ timing: 'onPlay', steps: [playGa(2, 'hand'), { link: 'ifYouDo', action: { kind: 'draw', n: 1 } }, { link: 'ifNotYouDo', action: { kind: 'draw', n: 2 } }] }]),
    R(WATCHER, [{ timing: 'when', yourTurn: true, oncePerTurn: true, event: { on: 'koOppChar', filter: {} }, steps: [{ action: { kind: 'draw', n: 1 } }] }]),
    R(BLOCKER, [{ timing: 'onBlock', steps: [{ action: { kind: 'draw', n: 1 } }] }], ['Blocker']),
    R(OPP_CHOICE, [{ timing: 'onPlay', steps: [{ action: { kind: 'oppChooseOne', options: [[{ action: { kind: 'draw', n: 2 } }], [{ action: { kind: 'ko', target: oppUpTo1({ costMax: 4 }) } }]] } }] }]),
    R(FROM_TRASH, [{ timing: 'onPlay', steps: [playGa(1, 'handOrTrash')] }]),
    R(STRONG, [{ timing: 'onPlay', steps: [{ cond: { kind: 'power', who: 'self', cmp: 'ge', n: 6000 }, action: { kind: 'draw', n: 1 } }] }]),
    R(SELF_KO, [{ timing: 'when', event: { on: 'koOwnChar', self: true, byOpponent: true }, steps: [{ action: { kind: 'draw', n: 1 } }] }]),
  ]),
};
for (const [n, e] of Object.entries(SET.entries)) {
  const c = compileRecipe(e.recipe!);
  assert.ok(c.ok, `${n} : ${JSON.stringify(!c.ok && c.missing)}`);
}
addRecipeSet(SET);
const MINE = 'TEST-JOUER';
DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: { ...DECKS['ST-21'].cards, ...Object.fromEntries(Object.keys(NAMES).map((n) => [n, 4])) } };

// adversaire ST-21 : coûts 1, 3 et 4
const O1 = 'ST21-004';
const O3 = 'ST21-006';
const O4 = 'ST21-008';
const OPP3 = (g: GameState) => setChars(g, 1, [{ num: O1 }, { num: O3 }, { num: O4 }]);
const optionUids = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid);
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const hand = (s: GameState, p: PlayerId = 0) => s.players[p].hand.length;
const life = (g: GameState, p: PlayerId, n: number) => setLife(g, p, Array.from({ length: n }, () => 'ST21-013'));

test('jouer, partie : KO d\'un coût au plus égal au nombre de cartes de Vie adverses, lu à la résolution', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [KO_LIFE]); OPP3(g); life(g, 1, 3); setDon(g, 0, 6); });
  s = play(s, KO_LIFE);
  expectTag(s, 'oppKo');
  assert.deepEqual(optionUids(s).sort(), [theirs(s, O1).uid, theirs(s, O3).uid].sort(), '3 cartes de Vie : coût 3 ou moins');
  coherent(s);
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [KO_LIFE]); OPP3(g); life(g, 1, 1); setDon(g, 0, 6); });
  s = play(s, KO_LIFE);
  assert.deepEqual(optionUids(s), [theirs(s, O1).uid], '1 carte de Vie : coût 1 ou moins');
});

test('jouer, partie : +1000 de puissance pour chaque lot de 2 cartes de la Défausse (permanent)', () => {
  const s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: PER_TRASH }]); g.players[0].trash = g.players[0].deck.splice(0, 5); });
  assert.equal(power(s, mine(s, PER_TRASH).uid), 3000 + 2000);
  s.players[0].trash.push(s.players[0].deck.shift()!);
  assert.equal(power(s, mine(s, PER_TRASH).uid), 3000 + 3000);
});

test('jouer, partie : « Si vous le faites » / « Sinon » suivent ce que l\'étape précédente a fait', () => {
  // une carte jouée : « si vous le faites » (1 carte), pas « sinon »
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [PLAY_DRAW, SMALL]); setDon(g, 0, 6); });
  s = play(s, PLAY_DRAW);
  expectTag(s, 'playFree');
  const before = hand(s);
  s = choose(s, (o) => o.num === SMALL);
  assert.ok(mine(s, SMALL));
  assert.equal(hand(s), before - 1 + 1);
  coherent(s);
  // rien de joué (« Aucun ») : « sinon » (2 cartes)
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [PLAY_DRAW, SMALL]); setDon(g, 0, 6); });
  s = play(s, PLAY_DRAW);
  const h = hand(s);
  s = choose(s, 'none');
  assert.equal(hand(s), h + 2);
  coherent(s);
});

test('jouer, partie : « quand un Personnage adverse est mis KO » (une fois par tour, pendant votre tour)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: WATCHER }]); setHand(g, 0, [KO_LIFE, KO_LIFE]); OPP3(g); life(g, 1, 4); setDon(g, 0, 10); });
  const h = hand(s);
  s = play(s, KO_LIFE);
  s = choose(s, (o) => o.uid === theirs(s, O1).uid);
  assert.equal(hand(s), h - 1 + 1, 'pioche après le KO');
  s = play(s, KO_LIFE);
  s = choose(s, (o) => o.uid === theirs(s, O3).uid);
  assert.equal(hand(s), h - 2 + 1, 'une fois par tour');
  coherent(s);
});

test('jouer, partie : [En bloquant] et [Bloqueur] de la recette', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: BLOCKER }]); setChars(g, 1, [{ num: O4 }]); setHand(g, 0, []); }, 1);
  s = attack(s, theirs(s, O4).uid, s.players[0].leader.uid);
  assert.equal(s.decision?.kind, 'blocker');
  s = act(s, `block:${mine(s, BLOCKER).uid}`);
  assert.equal(hand(s), 1);
  coherent(s);
});

test('jouer, partie : l\'adversaire choisit l\'effet, le joueur de la carte le fait', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [OPP_CHOICE]); OPP3(g); setDon(g, 0, 6); });
  s = play(s, OPP_CHOICE);
  assert.equal(s.decision?.player, 1, 'question posée à l\'adversaire');
  assert.equal(s.decision?.options.length, 2);
  const h = hand(s);
  s = act(s, 'choice:0');
  assert.equal(hand(s), h + 2);
  coherent(s);
});

test('jouer, partie : jouer depuis la main ou la Défausse ; condition sur la puissance de la carte', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FROM_TRASH]); g.players[0].trash.push(take(g, 0, SMALL)); setDon(g, 0, 6); });
  s = play(s, FROM_TRASH);
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.num === SMALL);
  assert.ok(mine(s, SMALL) && !s.players[0].trash.some((c) => c.num === SMALL));
  coherent(s);
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [STRONG]); setDon(g, 0, 6); });
  const h = hand(s);
  s = play(s, STRONG);
  assert.equal(hand(s), h - 1 + 1, '6000 de puissance : pioche');
});

test('jouer, partie : « quand ce Personnage est mis KO par un effet adverse » (pas en combat, pas par ses effets)', () => {
  const s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: SELF_KO }]); });
  const c = mine(s, SELF_KO);
  const d = def(SELF_KO);
  assert.ok(d.onKO && d.onKOCondition);
  assert.equal(d.onKOCondition!(s, 0, c, 'effect', 1), true);
  assert.equal(d.onKOCondition!(s, 0, c, 'battle', 1), false);
  assert.equal(d.onKOCondition!(s, 0, c, 'effect', 0), false);
});
