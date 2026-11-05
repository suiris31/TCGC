// Traducteur des cartes, squelette (tâche C1.4) : normalisation, filtres, cibles, durées, structure des capacités et
// des phrases, branchement des familles, et découpage de tout le catalogue sans erreur de structure.
//
// Les textes d'essai sont écrits par le test (tournures et valeurs), jamais recopiés d'une carte : 01-contrats.md § 15.8.
// Les règles d'actions, de conditions et de coûts ci-dessous sont une famille d'ESSAI (la vraie grammaire est le travail
// de la vague C2) : elles servent à vérifier que le squelette essaie les familles et assemble les morceaux.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS, HIDDEN } from '../engine/cards/index.ts';
import { FAMILIES, parseCard, parseCardReport, type Family } from '../engine/recipes/parse/index.ts';
import { normalize, template, Unknown } from '../engine/recipes/parse/normalize.ts';
import { lines, sentences } from '../engine/recipes/parse/structure.ts';
import { durationAfter, fieldFilter, parseFilter, parseTarget, takeDuration } from '../engine/recipes/parse/target.ts';
import type { Ability, Recipe, Step } from '../engine/recipes/types.ts';

// ---------- Famille d'essai ----------

const ESSAI: Family = {
  name: 'essai',
  actions: [
    { re: /^KO (.+)$/i, make: (m, h) => [{ kind: 'ko', target: h.target(m[1]) }] },
    { re: /^Draw (\d+) cards?$/i, make: (m) => [{ kind: 'draw', n: +m[1] }] },
    { re: /^Trash (\d+) cards? from your hand$/i, make: (m) => [{ kind: 'discard', n: +m[1] }] },
    { re: /^Give (.+?) ([+-]\d+) power(.*)$/i, make: (m, h) => [{ kind: 'power', target: h.target(m[1]), amount: +m[2], until: h.duration(m[3]) }] },
    { re: /^(.+?) gains? ([+-]\d+) power(.*)$/i, make: (m, h) => [{ kind: 'power', target: h.target(m[1], 'own'), amount: +m[2], until: h.duration(m[3]) }] },
    { re: /^Play this card$/i, make: () => [{ kind: 'playSelf' }] },
    {
      re: /^Look at (\d+) cards from the top of your deck; reveal up to (\d+) (.+?) and add it to your hand$/i,
      make: (m, h) => [{ kind: 'search', look: +m[1], take: +m[2], upTo: true, filter: h.filter(m[3]), dest: 'hand', rest: 'bottom' }],
    },
  ],
  conds: [
    { re: /^your Leader is \[([^\]]+)\]$/i, make: (m) => ({ kind: 'leaderIs', names: [m[1]] }) },
    { re: /^you have (\d+) or less Life cards$/i, make: (m) => ({ kind: 'life', side: 'own', cmp: 'le', n: +m[1] }) },
    { re: /^your opponent has (\d+) or more cards in their hand$/i, make: (m) => ({ kind: 'hand', side: 'opp', cmp: 'ge', n: +m[1] }) },
  ],
  costs: [
    { re: /^trash (\d+) cards? from your hand$/i, make: (m) => ({ kind: 'discard', n: +m[1] }) },
    { re: /^rest this Character$/i, make: () => ({ kind: 'restSelf' }) },
  ],
  events: [
    { re: /^your opponent plays a Character$/i, make: () => ({ on: 'oppPlayChar' }) },
  ],
  continuations: [
    {
      re: /^(?:place the rest at the bottom of your deck in any order|trash the rest)$/i,
      make: (m) => (steps: Step[]) => {
        const prev = [...steps].reverse().find((s) => 'action' in s && s.action.kind === 'search');
        if (!prev || !('action' in prev) || prev.action.kind !== 'search') throw new Unknown(m[0], 'reste sans recherche');
        prev.action.rest = /trash/i.test(m[0]) ? 'trash' : 'bottom';
      },
    },
  ],
};

const parse = (effectEn: string, triggerEn: string | null = null, families: Family[] = [ESSAI]) =>
  parseCard({ num: 'OP99-001', effectEn, triggerEn }, families);
const recipe = (effectEn: string, triggerEn: string | null = null): Recipe => {
  const r = parse(effectEn, triggerEn);
  assert.ok(r.ok, `non compris : ${r.ok ? '' : r.unknown.join(' / ')}`);
  return r.recipe;
};
const one = (effectEn: string): Ability => {
  const r = recipe(effectEn);
  assert.equal(r.abilities.length, 1);
  return r.abilities[0];
};
const unknown = (effectEn: string, triggerEn: string | null = null, families: Family[] = [ESSAI]): string[] => {
  const r = parse(effectEn, triggerEn, families);
  assert.ok(!r.ok, 'compris alors que la carte ne devait pas l\'être');
  return r.unknown;
};

const KO3 = { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMax: 3 }, characters: true } } as const;

// ---------- Normalisation ----------

test('traducteur : normalisation (rappels, KO, tirets, chiffres cerclés, noms protégés, lignes vides)', () => {
  assert.equal(normalize('[On Play] K.O. up to 1 Character. (A reminder (nested) here.)'), '[On Play] KO up to 1 Character.');
  assert.equal(normalize('DON!! −2 : Draw 1 card .'), 'DON!! -2: Draw 1 card.');
  assert.equal(normalize('➀: x ➃: y'), '①: x ④: y');
  assert.equal(normalize('Give it ＜Slash＞ and ’quote’ “type”'), "Give it <Slash> and 'quote' \"type\"");
  // une parenthèse dans un nom n'est pas un rappel de règle
  assert.equal(normalize('Play up to 1 [Mr.9(Test)] from your hand.'), 'Play up to 1 [Mr.9(Test)] from your hand.');
  // ligne « - » (carte sans effet), lignes vides, rappel seul sur sa ligne
  assert.equal(normalize('-'), '');
  assert.equal(normalize('[Blocker]\n(A reminder.)\n\n[On Play] Draw 1 card.'), '[Blocker]\n[On Play] Draw 1 card.');
  // capacité collée à la précédente sans retour à la ligne
  assert.equal(normalize('[On Play] Draw 1 card.[Once Per Turn] Draw 2 cards.'), '[On Play] Draw 1 card.\n[Once Per Turn] Draw 2 cards.');
});

test('traducteur : gabarits du rapport (valeurs, types, noms, attributs remplacés ; étiquettes gardées)', () => {
  assert.equal(template('[On Play] [DON!! x2] Give [Izo] or {Navy} <Slash> "CP" [Blocker] 3000'),
    '[On Play] [DON!! xN] Give [X] or {T} <A> "X" [Blocker] N');
  assert.equal(template('[Dr. Test] [Once Per Turn]'), '[X] [Once Per Turn]');
});

test('traducteur : phrases et lignes (un point dans un nom ne coupe pas, les puces restent avec leur ligne)', () => {
  assert.deepEqual(sentences('KO [Dr. Test]. Then, draw 1 card.'), ['KO [Dr. Test].', 'Then, draw 1 card.']);
  assert.deepEqual(lines('[Main] Choose one:\n• Draw 1 card.\n• Draw 2 cards.\n[Counter] Draw 1 card.'),
    ['[Main] Choose one: • Draw 1 card. • Draw 2 cards.', '[Counter] Draw 1 card.']);
});

// ---------- Filtres, cibles, durées ----------

test('traducteur : filtres (coût, puissance, de base ou non, types, noms, attributs, couleurs, états, mots-clés)', () => {
  assert.deepEqual(parseFilter('Characters with a cost of 3 or less'), { costMax: 3, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character with a cost of 2'), { costEq: 2, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character card with a base cost of 5 or more'), { baseCostMin: 5, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Characters with 5000 power or less'), { powerMax: 5000, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Characters with 4000 base power or more'), { basePowerMin: 4000, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character with a base power of 3000 or less'), { basePowerMax: 3000, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('{Navy} type Character card'), { types: ['Navy'], category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('{A} or {B} type card'), { types: ['A', 'B'], typesMode: 'any' });
  assert.deepEqual(parseFilter('Character with both the {A} type and the {B} type'), { types: ['A', 'B'], typesMode: 'all', category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('card with a type including "CP"'), { typeIncludes: 'CP' });
  assert.deepEqual(parseFilter('[Izo] or [Tama]'), { name: ['Izo', 'Tama'] });
  assert.deepEqual(parseFilter('Character other than [Izo]'), { notName: 'Izo', category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character with the <Slash> attribute'), { attribute: 'Slash', category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('red or green Character card'), { color: ['Red', 'Green'], category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('rested Characters'), { rested: true, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('card with a [Trigger]'), { trigger: true });
  assert.deepEqual(parseFilter('Character with [Blocker]'), { keyword: 'Blocker', category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character without [Rush]'), { noKeyword: 'Rush', category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Character card with no base effect'), { vanilla: true, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Characters with 2 or more DON!! cards given'), { donMin: 2, category: ['CHARACTER'] });
  assert.deepEqual(parseFilter('Event or Stage card'), { category: ['EVENT', 'STAGE'] });
});

test('traducteur : OU mélangés (anyOf) entre un nom, un type et une catégorie', () => {
  assert.deepEqual(parseFilter('[Izo] or {Navy} type card'), { anyOf: [{ name: ['Izo'] }, { types: ['Navy'] }] });
  assert.deepEqual(parseFilter('Event or {Navy} type Character card'), { anyOf: [{ category: ['EVENT'] }, { types: ['Navy'], category: ['CHARACTER'] }] });
});

test('traducteur : garde-fous des filtres (OU entre deux valeurs, mot inconnu) : échec plutôt qu\'une fausse lecture', () => {
  assert.throws(() => parseFilter('Character with a cost of 0 or with a cost of 8 or more'), (e: unknown) => e instanceof Unknown && /OU entre deux valeurs/.test(e.why));
  assert.throws(() => parseFilter('Character with a cost equal to the number of cards'), (e: unknown) => e instanceof Unknown && e.why === 'filtre');
  // « 8 or more cards » sans catégorie : toutes les cartes du terrain, pas seulement les Personnages
  assert.throws(() => fieldFilter('rested cards'), Unknown);
  assert.deepEqual(fieldFilter('{Navy} type Characters'), { types: ['Navy'], category: ['CHARACTER'] });
});

test('traducteur : cibles (quantité, camp, Leader / Personnages / Lieu, cette carte, autre que cette carte)', () => {
  assert.deepEqual(parseTarget("up to 1 of your opponent's Characters with a cost of 3 or less"), KO3.target);
  assert.deepEqual(parseTarget('all of your Characters'), { side: 'own', zone: 'field', count: 'all', upTo: false, filter: {}, characters: true });
  assert.deepEqual(parseTarget("2 of your opponent's rested Characters"), { side: 'opp', zone: 'field', count: 2, upTo: false, filter: { rested: true }, characters: true });
  assert.deepEqual(parseTarget('up to 1 of your Leader or Character cards'), { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, leader: true, characters: true });
  assert.deepEqual(parseTarget('this Character'), { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true });
  assert.deepEqual(parseTarget('your Leader'), { side: 'own', zone: 'field', leader: true, count: 1, upTo: false, filter: {} });
  assert.deepEqual(parseTarget("your opponent's Leader"), { side: 'opp', zone: 'field', leader: true, count: 1, upTo: false, filter: {} });
  assert.deepEqual(parseTarget('up to 1 of your Characters other than this Character'), { side: 'own', zone: 'field', count: 1, upTo: true, filter: {}, otherThanSelf: true, characters: true });
  assert.deepEqual(parseTarget("up to 1 of your opponent's Stages"), { side: 'opp', zone: 'field', count: 1, upTo: true, filter: {}, stage: true });
  // un nom seul : Leader ou Personnage de ce nom (étude C0 § 6, doute 3)
  assert.deepEqual(parseTarget('up to 1 of your [Izo] cards'), { side: 'own', zone: 'field', count: 1, upTo: true, filter: { name: ['Izo'] }, leader: true, characters: true });
  assert.deepEqual(parseTarget('up to 1 Character', 'any').side, 'any');
  assert.throws(() => parseTarget('up to 1 of your opponent\'s cards'), Unknown);     // sans catégorie
  assert.throws(() => parseTarget('up to 1 of your Event cards'), Unknown);           // un Évènement n'est pas en jeu
});

test('traducteur : durées et garde-fou « reste après la valeur »', () => {
  assert.deepEqual(takeDuration('+1000 power during this battle'), ['+1000 power', 'battle']);
  assert.equal(durationAfter(' during this turn'), 'turn');
  assert.equal(durationAfter(' until the end of this turn'), 'turn');
  assert.equal(durationAfter(" until the end of your opponent's next End Phase"), 'oppNextEnd');
  assert.equal(durationAfter(" until the end of your opponent's next turn"), 'oppNextEnd');
  // « jusqu'au début de votre prochain tour » = fin du prochain tour adverse (interprétations 389 et 1300)
  assert.equal(durationAfter(' until the start of your next turn'), 'oppNextEnd');
  assert.equal(durationAfter(' until the end of your next turn'), 'nextTurn');
  assert.equal(durationAfter(''), 'permanent');
  assert.throws(() => durationAfter(' for every 2 cards in your trash'), (e: unknown) => e instanceof Unknown && e.why === 'reste après la valeur');
  assert.throws(() => durationAfter(" during your opponent's next turn"), Unknown);
});

// ---------- Structure des capacités ----------

test('traducteur : moments et étiquettes ([DON!! xN], [Your Turn], [Once Per Turn], deux moments, mots-clés)', () => {
  assert.deepEqual(one("[On Play] KO up to 1 of your opponent's Characters with a cost of 3 or less."), { timing: 'onPlay', steps: [{ action: KO3 }] });
  assert.deepEqual(one('[DON!! x1] [Your Turn] [Once Per Turn] [When Attacking] Draw 1 card.'),
    { timing: 'whenAttacking', don: 1, yourTurn: true, oncePerTurn: true, steps: [{ action: { kind: 'draw', n: 1 } }] });
  assert.equal(one('[On K.O.] Draw 1 card.').timing, 'onKO');
  assert.equal(one("[Opponent's Turn] [Activate: Main] Draw 1 card.").oppTurn, true);
  const dual = recipe('[On Play]/[When Attacking] Draw 1 card.');
  assert.deepEqual(dual.abilities.map((a) => a.timing), ['onPlay', 'whenAttacking']);
  const kw = recipe('[Blocker] (A reminder.)\n[Rush]\n[End of Your Turn] Draw 1 card.');
  assert.deepEqual(kw.keywords, ['Blocker', 'Rush']);
  assert.equal(kw.abilities[0].timing, 'endOfTurn');
  assert.deepEqual(recipe("Also treat this card's name as [Izo] according to the rules.").alsoNamed, ['Izo']);
  // effet permanent sans moment
  assert.deepEqual(one('[DON!! x1] This Character gains +1000 power.'),
    { timing: 'static', don: 1, steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 1000, until: 'permanent' } }] });
});

test('traducteur : coûts (①, DON!! −N, « You may ...: », « You can ...: », coût sans « You may », « If C, you may ...: »)', () => {
  assert.deepEqual(one('[Activate: Main] ➁ (A reminder.): Draw 1 card.').cost, [{ kind: 'restDon', n: 2 }]);
  assert.deepEqual(one('[On Play] DON!! −1 (A reminder.): Draw 1 card.').cost, [{ kind: 'donMinus', n: 1 }]);
  assert.deepEqual(one('[On Play] DON!! −2, You may trash 1 card from your hand: Draw 1 card.').cost, [{ kind: 'donMinus', n: 2 }, { kind: 'discard', n: 1 }]);
  assert.deepEqual(one('[Activate: Main] You may rest this Character and trash 1 card from your hand: Draw 2 cards.').cost,
    [{ kind: 'restSelf' }, { kind: 'discard', n: 1 }]);
  assert.deepEqual(one('[Activate: Main] You can trash 1 card from your hand: Draw 1 card.').cost, [{ kind: 'discard', n: 1 }]);
  assert.deepEqual(one('[Activate: Main] Trash 1 card from your hand: Draw 1 card.').cost, [{ kind: 'discard', n: 1 }]);
  assert.deepEqual(one('[Activate: Main] Rest this Character and you may trash 1 card from your hand: Draw 1 card.').cost,
    [{ kind: 'restSelf' }, { kind: 'discard', n: 1 }]);
  const a = one('[On Play] If your Leader is [Izo], you may trash 1 card from your hand: Draw 2 cards.');
  assert.deepEqual(a.condition, { kind: 'leaderIs', names: ['Izo'] });
  assert.deepEqual(a.cost, [{ kind: 'discard', n: 1 }]);
  assert.deepEqual(a.steps, [{ action: { kind: 'draw', n: 2 } }]);
});

test('traducteur : évènement « When ..., » et sa condition', () => {
  const a = one('[Your Turn] [Once Per Turn] When your opponent plays a Character, if you have 2 or less Life cards, draw 1 card.');
  assert.equal(a.timing, 'when');
  assert.deepEqual(a.event, { on: 'oppPlayChar' });
  assert.deepEqual(a.steps, [{ action: { kind: 'draw', n: 1 }, cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 } }]);
  // une durée est attendue dans un effet « When » (ponctuel)
  assert.equal(one('When your opponent plays a Character, this Character gains +1000 power during this turn.').steps.length, 1);
});

// ---------- Structure des phrases ----------

test('traducteur : enchaînements « Then, », « If you do, », « If you don\'t, », « and », « , then »', () => {
  assert.deepEqual(one('[On Play] Draw 2 cards. Then, trash 1 card from your hand.').steps,
    [{ action: { kind: 'draw', n: 2 } }, { action: { kind: 'discard', n: 1 }, link: 'then' }]);
  assert.deepEqual(one('[On Play] Draw 2 cards and trash 1 card from your hand.').steps,
    [{ action: { kind: 'draw', n: 2 } }, { action: { kind: 'discard', n: 1 }, link: 'and' }]);
  assert.deepEqual(one('[On Play] Draw 2 cards, then trash 1 card from your hand.').steps,
    [{ action: { kind: 'draw', n: 2 } }, { action: { kind: 'discard', n: 1 }, link: 'then' }]);
  assert.deepEqual(one('[On Play] You may trash 1 card from your hand. If you do, draw 2 cards. If you don\'t, draw 1 card.').steps,
    [{ may: [{ action: { kind: 'discard', n: 1 } }] }, { action: { kind: 'draw', n: 2 }, link: 'ifYouDo' }, { action: { kind: 'draw', n: 1 }, link: 'ifNotYouDo' }]);
});

test('traducteur : portée d\'une condition (« If C, A and B » couvre les deux ; « If C, A. Then, B » non ; « A if C »)', () => {
  const life = { kind: 'life', side: 'own', cmp: 'le', n: 2 } as const;
  assert.deepEqual(one('[On Play] If you have 2 or less Life cards, draw 1 card and trash 1 card from your hand.').steps,
    [{ cond: life, group: [{ action: { kind: 'draw', n: 1 } }, { action: { kind: 'discard', n: 1 }, link: 'and' }] }]);
  assert.deepEqual(one('[On Play] If you have 2 or less Life cards, draw 1 card. Then, trash 1 card from your hand.').steps,
    [{ action: { kind: 'draw', n: 1 }, cond: life }, { action: { kind: 'discard', n: 1 }, link: 'then' }]);
  assert.deepEqual(one('[On Play] Draw 1 card if you have 2 or less Life cards.').steps, [{ action: { kind: 'draw', n: 1 }, cond: life }]);
  assert.deepEqual(one('[On Play] Draw 1 card. Then, if you have 2 or less Life cards, draw 1 card.').steps,
    [{ action: { kind: 'draw', n: 1 } }, { action: { kind: 'draw', n: 1 }, cond: life, link: 'then' }]);
});

test('traducteur : « Choose one: », « If C, choose one: », « ..., then choose one: »', () => {
  assert.deepEqual(one('[Main] Choose one:\n• Draw 1 card.\n• Draw 2 cards.').steps,
    [{ chooseOne: [[{ action: { kind: 'draw', n: 1 } }], [{ action: { kind: 'draw', n: 2 } }]] }]);
  assert.deepEqual(one('[Main] If your opponent has 5 or more cards in their hand, choose one:\n• Draw 1 card.\n• Draw 2 cards.').steps,
    [{ chooseOne: [[{ action: { kind: 'draw', n: 1 } }], [{ action: { kind: 'draw', n: 2 } }]], cond: { kind: 'hand', side: 'opp', cmp: 'ge', n: 5 } }]);
  assert.deepEqual(one('[Main] Draw 1 card, then choose one:\n• Draw 1 card.\n• Trash 1 card from your hand.').steps,
    [{ action: { kind: 'draw', n: 1 } }, { chooseOne: [[{ action: { kind: 'draw', n: 1 } }], [{ action: { kind: 'discard', n: 1 } }]], link: 'then' }]);
  // l'adversaire choisit : rapporté (pas d'erreur de structure), les puces sont lues quand même
  const r = parseCardReport({ num: 'OP99-001', effectEn: '[On Play] Your opponent chooses one:\n• Draw 1 card.\n• Fly away.', triggerEn: null }, [ESSAI]);
  assert.deepEqual(r.structure, []);
  assert.ok(!r.result.ok && r.result.unknown.some((u) => u.startsWith("choix de l'adversaire")) && r.result.unknown.some((u) => u.startsWith('action')));
});

test('traducteur : « you may X » (facultatif), suites d\'une recherche (« Then, place the rest », « ..., then trash the rest »)', () => {
  assert.deepEqual(one('[On Play] You may draw 1 card.').steps, [{ may: [{ action: { kind: 'draw', n: 1 } }] }]);
  const search = { kind: 'search', look: 5, take: 1, upTo: true, filter: { types: ['Navy'], color: ['Red'] }, dest: 'hand' } as const;
  assert.deepEqual(one('[On Play] Look at 5 cards from the top of your deck; reveal up to 1 red {Navy} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.').steps,
    [{ action: { ...search, rest: 'bottom' } }]);
  assert.deepEqual(one('[On Play] Look at 5 cards from the top of your deck; reveal up to 1 red {Navy} type card and add it to your hand, then trash the rest.').steps,
    [{ action: { ...search, rest: 'trash' } }]);
  // la suite en tête de phrase, puis le reste de la phrase (que le prototype de l'étude perdait) ; le « Then, » porte sur
  // la suite, le reste suit avec « and » (C2.3 : l'aller-retour ne redit pas un second « Then »)
  assert.deepEqual(one('[On Play] Look at 5 cards from the top of your deck; reveal up to 1 red {Navy} type card and add it to your hand. Then, trash the rest and draw 1 card.').steps,
    [{ action: { ...search, rest: 'trash' } }, { action: { kind: 'draw', n: 1 }, link: 'and' }]);
});

test('traducteur : [Déclenchement] (champ à part, ou laissé dans le texte de l\'effet)', () => {
  assert.deepEqual(recipe('[On Play] Draw 1 card.', 'Play this card.').trigger, { timing: 'trigger', steps: [{ action: { kind: 'playSelf' } }] });
  const r = recipe('[Trigger] Play this card.');
  assert.deepEqual(r.abilities, []);
  assert.deepEqual(r.trigger, { timing: 'trigger', steps: [{ action: { kind: 'playSelf' } }] });
  assert.deepEqual(recipe('', 'You may trash 1 card from your hand: Play this card.').trigger?.cost, [{ kind: 'discard', n: 1 }]);
});

test('traducteur : garde-fou des durées (effet ponctuel sans durée, effet permanent avec une durée)', () => {
  assert.ok(unknown('[On Play] This Character gains +1000 power.').some((u) => u.startsWith('durée absente dans un effet ponctuel')));
  assert.ok(unknown('[DON!! x1] This Character gains +1000 power during this turn.').some((u) => u.startsWith('durée dans un effet permanent')));
  assert.ok(unknown('[On Play] This Character gains +1000 power for every 2 cards in your trash.').some((u) => u.startsWith('reste après la valeur')));
});

// ---------- Rapport et familles ----------

test('traducteur : rapport (tous les morceaux non compris, normalisés ; recette partielle de ce qui est compris)', () => {
  const r = parse('[Rush]\n[On Play] Draw 1 card.\n[When Attacking] If your Leader is red, fly 2 [Izo] {Navy} away.');
  assert.ok(!r.ok);
  // la condition ET l'action sont rapportées, sans chiffres, noms ni types
  assert.deepEqual(r.unknown, ['condition : « your Leader is red »', 'action : « Fly N [X] {T} away »']);
  assert.deepEqual(r.partial, { num: 'OP99-001', keywords: ['Rush'], abilities: [{ timing: 'onPlay', steps: [{ action: { kind: 'draw', n: 1 } }] }] });
  const rep = parseCardReport({ num: 'OP99-001', effectEn: '[On Play] Draw 1 card.\n[Main] Fly.', triggerEn: null }, [ESSAI]);
  assert.equal(rep.abilities, 2);
  assert.equal(rep.understood, 1);
  // étiquette inconnue : erreur de structure
  assert.ok(parseCardReport({ num: 'OP99-001', effectEn: '[Sometimes] Draw 1 card.', triggerEn: null }, [ESSAI]).structure.length === 1);
  // carte sans effet ou seulement des mots-clés : comprise
  assert.deepEqual(recipe('-'), { num: 'OP99-001', abilities: [] });
  assert.deepEqual(recipe('[Blocker] (A reminder.)'), { num: 'OP99-001', keywords: ['Blocker'], abilities: [] });
});

test('traducteur : familles essayées dans l\'ordre ; une règle qui lit mal sa cible laisse la place à la suivante', () => {
  const first: Family = { name: 'a', actions: [{ re: /^Draw (\d+) cards?$/i, make: (m) => [{ kind: 'draw', n: +m[1] * 10 }] }] };
  const r1 = parse('[On Play] Draw 1 card.', null, [first, ESSAI]);
  assert.ok(r1.ok && 'action' in r1.recipe.abilities[0].steps[0] && r1.recipe.abilities[0].steps[0].action.kind === 'draw'
    && r1.recipe.abilities[0].steps[0].action.n === 10);
  const picky: Family = { name: 'b', actions: [{ re: /^KO (.+)$/i, make: (m) => { throw new Unknown(m[1], 'cible'); } }] };
  const r2 = parse("[On Play] KO up to 1 of your opponent's Characters with a cost of 3 or less.", null, [picky, ESSAI]);
  assert.ok(r2.ok);
  assert.deepEqual(r2.recipe.abilities[0].steps, [{ action: KO3 }]);
  // aucune famille : tout est rapporté, la structure reste lue
  assert.deepEqual(unknown('[On Play] Draw 1 card.', null, []), ['action : « Draw N card »']);
  // les familles enregistrées sont bien formées
  for (const f of FAMILIES) assert.ok(f.name && (f.actions || f.conds || f.costs || f.events || f.continuations), `famille ${f.name}`);
});

// ---------- Tout le catalogue ----------

test('traducteur : la structure de toutes les cartes du catalogue se découpe sans erreur, et le rapport dit quoi', () => {
  const nums = Object.keys(CARDS).filter((n) => n !== HIDDEN);
  assert.ok(nums.length > 2000, 'catalogue chargé');
  const structural: string[] = [];
  let ok = 0;
  for (const n of nums) {
    const d = CARDS[n]!;
    const rep = parseCardReport({ num: n, effectEn: d.effectEn ?? '', triggerEn: d.triggerEn ?? null });
    for (const s of rep.structure) structural.push(`${n} ${s}`);
    if (rep.result.ok) { ok++; continue; }
    assert.ok(rep.result.unknown.length > 0, `${n} : non compris sans morceau en cause`);
    for (const u of rep.result.unknown) {
      // le rapport ne contient jamais de valeur, de nom ni de type de carte
      assert.ok(!/\d/.test(u), `${n} : chiffre dans le rapport`);
      assert.ok(!/\{(?!T\})/.test(u) && !/<(?!A>)/.test(u), `${n} : type ou attribut dans le rapport`);
      for (const [, inner] of u.matchAll(/\[([^\]]+)\]/g)) {
        assert.ok(inner === 'X' || /^(?:On Play|When Attacking|Activate: Main|Main|Counter|On KO|End of Your Turn|End of Your Opponent's Turn|On Your Opponent's Attack|On Block|Trigger|Once Per Turn|Your Turn|Opponent's Turn|DON!! xN|Blocker|Rush|Rush: Character|Double Attack|Banish|Unblockable)$/.test(inner), `${n} : nom dans le rapport (${inner})`);
      }
    }
  }
  assert.deepEqual(structural, [], 'erreurs de structure');
  // sans famille (vague C2 pas encore fusionnée), seules les cartes sans effet ou à mots-clés sont comprises
  assert.ok(ok > 0);
});
