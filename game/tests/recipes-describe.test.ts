// Aller-retour (tâche C1.2) : describe (recette → phrase) et compare (phrase de la recette ↔ texte officiel).
// Aucun texte de carte : les « textes officiels » sont construits ici à partir de valeurs, avec les tournures de la
// grammaire (01-contrats.md § 15.8).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS, HIDDEN } from '../engine/cards/index.ts';
import { blocking, compare, compareTexts, factsEn, factsFr, normalizeEn, normalizeFr, officialTexts, template, type Ecart } from '../engine/recipes/compare.ts';
import { describe, describeAbility } from '../engine/recipes/describe.ts';
import type { Ability, Action, Recipe, Step, Target } from '../engine/recipes/types.ts';

// ---------- Recettes types, écrites par le test ----------

const opp = (over: Partial<Target> = {}): Target => ({ side: 'opp', zone: 'field', characters: true, count: 1, upTo: true, filter: {}, ...over });
const own = (over: Partial<Target> = {}): Target => ({ side: 'own', zone: 'field', leader: true, characters: true, count: 1, upTo: true, filter: {}, ...over });
const self: Target = { side: 'own', zone: 'field', self: true, characters: true, count: 1, upTo: false, filter: {} };
const rec = (abilities: Ability[], extra: Partial<Recipe> = {}): Recipe => ({ num: 'OP99-001', abilities, ...extra });
const ab = (timing: Ability['timing'], steps: Step[], extra: Partial<Ability> = {}): Ability => ({ timing, steps, ...extra });
const act = (action: Action, extra: Partial<Step> = {}): Step => ({ action, ...extra } as Step);

// [Jouée] KO jusqu'à 1 Personnage adverse de coût N ou moins
const koRecipe = (n: number) => rec([ab('onPlay', [act({ kind: 'ko', target: opp({ filter: { costMax: n } }) })])]);
const koText = (n: number) => `[On Play] K.O. up to 1 of your opponent's Characters with a cost of ${n} or less.`;

// [Contre] +N puissance à 1 de vos Leader ou Personnages pour ce combat. Puis, piochez 1 carte. [Déclenchement] jouer
const counterRecipe = (amount: number, until: 'battle' | 'turn' = 'battle') => rec(
  [ab('counter', [act({ kind: 'power', target: own(), amount, until }), act({ kind: 'draw', n: 1 }, { link: 'then' })])],
  { trigger: { timing: 'trigger', steps: [act({ kind: 'playSelf' })] } },
);
const counterText = `[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card.\n[Trigger] Play this card.`;

const errors = (es: Ecart[]) => blocking(es).map((e) => `${e.lang} ${e.kind}`);

// ---------- describe ----------

test('describe : phrase anglaise normalisée et phrase française', () => {
  const d = describe(koRecipe(3));
  assert.ok(d.ok);
  assert.equal(d.en, "[On Play] KO up to 1 of your opponent's Characters with a cost of 3 or less.");
  assert.equal(d.fr, '[Jouée] Mettez KO jusqu\'à 1 Personnage adverse ayant un coût de 3 ou moins.');
  const c = describe(counterRecipe(4000));
  assert.ok(c.ok);
  assert.equal(c.en, '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card.\n[Trigger] Play this card.');
  assert.match(c.fr, /^\[Contre\] Jusqu'à 1 de vos Leader ou Personnages gagne \+4000 de puissance pour tout le combat\. Puis, piochez 1 carte\.\n\[Déclenchement\] Jouez cette carte\.$/);
});

test('describe : moments, coûts, conditions, choix, capacités jumelles', () => {
  const r = rec([
    ab('whenAttacking', [act({ kind: 'power', target: self, amount: 1000, until: 'turn' })], { don: 1, oncePerTurn: true, cost: [{ kind: 'restDon', n: 1 }] }),
    ab('activateMain', [{ cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 }, action: { kind: 'draw', n: 2 } }], { cost: [{ kind: 'restSelf' }] }),
    ab('onPlay', [{ chooseOne: [[act({ kind: 'draw', n: 1 })], [act({ kind: 'rest', target: opp() })]] }]),
    ab('onPlay', [act({ kind: 'keyword', target: self, keyword: 'Rush', until: 'turn' }), act({ kind: 'power', target: self, amount: 2000, until: 'turn' })]),
    ab('whenAttacking', [act({ kind: 'keyword', target: self, keyword: 'Rush', until: 'turn' }), act({ kind: 'power', target: self, amount: 2000, until: 'turn' })]),
  ], { keywords: ['Blocker'] });
  const d = describe(r);
  assert.ok(d.ok);
  const lines = d.en.split('\n');
  assert.equal(lines[0], '[Blocker]');
  assert.equal(lines[1], '[DON!! x1] [When Attacking] [Once Per Turn] ①: This Character gains +1000 power during this turn.');
  assert.equal(lines[2], '[Activate: Main] You may rest this Character: If you have 2 or less Life cards, draw 2 cards.');
  assert.equal(lines[3], '[On Play] Choose one:');
  assert.match(lines[4], /^• Draw 1 card\.$/);
  assert.match(lines[5], /^• Rest up to 1 of your opponent's Characters\.$/);
  assert.equal(lines[6], '[On Play]/[When Attacking] This Character gains [Rush] and +2000 power during this turn.');
  assert.match(d.fr, /\[Bloqueur\]/);
  assert.match(d.fr, /\[Jouée\]\/\[En attaquant\] Ce Personnage gagne \[Initiative\] et \+2000 de puissance pour tout le tour\./);
  assert.equal(describeAbility(r.abilities[0], 'fr'), '[DON!! x1] [En attaquant] [Une fois par tour] ① : Ce Personnage gagne +1000 de puissance pour tout le tour.');
  // La catégorie de la carte choisit « this Leader »
  const l = describe(rec([ab('activateMain', [act({ kind: 'draw', n: 1 })], { cost: [{ kind: 'restSelf' }] })]), { category: 'LEADER' });
  assert.ok(l.ok && /You may rest this Leader:/.test(l.en) && /épuiser ce Leader/.test(l.fr));
});

test('describe : chaque sorte d\'action a sa phrase, sans « manque »', () => {
  const t = opp();
  const actions: Action[] = [
    { kind: 'ko', target: t }, { kind: 'rest', target: t }, { kind: 'setActive', target: own() }, { kind: 'bounce', target: t },
    { kind: 'bottom', target: t }, { kind: 'toLife', target: t, faceUp: false }, { kind: 'trashChar', target: t },
    { kind: 'power', target: t, amount: -2000, until: 'turn' }, { kind: 'cost', target: t, amount: -3, until: 'turn' },
    { kind: 'powerSet', target: t, value: 0, until: 'turn' }, { kind: 'keyword', target: own(), keyword: 'Blocker', until: 'turn' },
    { kind: 'cantAttack', target: t, until: 'oppNextEnd' }, { kind: 'cantBlock', target: t, until: 'turn' },
    { kind: 'cantBeKO', target: own(), until: 'battle', by: 'battle' }, { kind: 'cantRefresh', target: t },
    { kind: 'negate', target: t, until: 'turn' }, { kind: 'draw', n: 2 }, { kind: 'discard', n: 1 }, { kind: 'oppDiscard', n: 1 },
    { kind: 'trashTop', n: 2, side: 'own' },
    { kind: 'search', look: 5, take: 1, upTo: true, filter: { types: ['T1'] }, dest: 'hand', rest: 'bottom' },
    { kind: 'arrangeTop', look: 3, where: 'topOrBottom' },
    { kind: 'play', from: 'hand', count: 1, upTo: true, filter: { category: ['CHARACTER'], costMax: 4 } },
    { kind: 'playSelf' }, { kind: 'activate', which: 'main' },
    { kind: 'trashToHand', count: 1, upTo: true, filter: { category: ['EVENT'] } },
    { kind: 'trashToBottom', count: 2, side: 'own', filter: {} }, { kind: 'addDon', n: 1, upTo: true, state: 'rested' },
    { kind: 'readyDon', n: 2, upTo: true }, { kind: 'giveDon', n: 1, upTo: true, rested: true, target: own() },
    { kind: 'returnDon', n: 1, side: 'opp' }, { kind: 'restDon', n: 1, side: 'opp' },
    { kind: 'lifeFromDeck', n: 1, upTo: true }, { kind: 'lifeToHand', n: 1, side: 'own', from: 'top' },
    { kind: 'trashLife', n: 1, side: 'opp', from: 'top' }, { kind: 'lookLife', side: 'own', arrange: true },
    { kind: 'handToBottom', n: 1 }, { kind: 'oppHandToBottom', n: 1 }, { kind: 'handToLife', n: 1, upTo: true, filter: {} },
    { kind: 'noCharsThisTurn', what: 'play' }, { kind: 'trashSelfEnd' },
    { kind: 'oppChooses', n: 1, action: 'trash', filter: {} }, { kind: 'manual', reason: 'clé' },
  ];
  for (const a of actions) {
    const d = describe(rec([ab('main', [act(a)])]));
    assert.ok(d.ok, `${a.kind} : ${d.ok ? '' : d.missing}`);
    assert.ok(d.en.length > 8 && d.fr.length > 8, a.kind);
    assert.doesNotMatch(d.en, /undefined|NaN|\[object/, a.kind);
    assert.doesNotMatch(d.fr, /undefined|NaN|\[object/, a.kind);
  }
  // Une sorte inconnue (recette mal formée) est signalée, pas inventée
  const bad = describe(rec([ab('main', [act({ kind: 'inconnue' } as unknown as Action)])]));
  assert.ok(!bad.ok && bad.missing.some((m) => /inconnue/.test(m)));
});

// ---------- compare : l'aller-retour ----------

test('compare : une recette juste ne montre aucun écart bloquant', () => {
  assert.deepEqual(errors(compareTexts(koRecipe(3), { en: koText(3) })), []);
  assert.deepEqual(errors(compareTexts(counterRecipe(4000), { en: counterText })), []);
  // Rédactions équivalentes : « You may rest 1 of your DON!! cards: » et « ①: », « Then, » et « , then »
  const r = rec([ab('activateMain', [act({ kind: 'draw', n: 1 })], { cost: [{ kind: 'restDon', n: 1 }] })]);
  assert.deepEqual(errors(compareTexts(r, { en: '[Activate: Main] You may rest 1 of your DON!! cards: Draw 1 card.' })), []);
  assert.deepEqual(errors(compareTexts(r, { en: '[Activate: Main] ➀ (rappel de règle) Draw 1 card.' })), []);
});

test('compare : une recette fausse d\'un seul chiffre est détectée', () => {
  const e = errors(compareTexts(koRecipe(4), { en: koText(3) }));
  assert.ok(e.includes('en nombre'), e.join());
  const p = errors(compareTexts(counterRecipe(2000), { en: counterText }));
  assert.ok(p.includes('en nombre'), p.join());
  // le signe compte : -2000 n'est pas +2000
  const minus = rec([ab('main', [act({ kind: 'power', target: opp(), amount: 2000, until: 'turn' })])]);
  assert.ok(errors(compareTexts(minus, { en: "[Main] Give up to 1 of your opponent's Characters -2000 power during this turn." })).includes('en nombre'));
  // « ou plus » au lieu de « ou moins » : même chiffre, comparaison différente
  const more = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ filter: { costMin: 3 } }) })])]);
  assert.ok(errors(compareTexts(more, { en: koText(3) })).includes('en comparaison'));
});

test('compare : une cible fausse est détectée (camp, sorte, « jusqu\'à », carte elle-même)', () => {
  const side = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ side: 'own', filter: { costMax: 3 } }) })])]);
  assert.ok(errors(compareTexts(side, { en: koText(3) })).includes('en cible'));
  const leader = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ characters: false, leader: true, filter: { costMax: 3 } }) })])]);
  assert.ok(errors(compareTexts(leader, { en: koText(3) })).includes('en cible'));
  const exact = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ upTo: false, filter: { costMax: 3 } }) })])]);
  assert.ok(errors(compareTexts(exact, { en: koText(3) })).includes('en quantité'));
  const me = rec([ab('counter', [act({ kind: 'power', target: self, amount: 4000, until: 'battle' }), act({ kind: 'draw', n: 1 }, { link: 'then' })])],
    { trigger: { timing: 'trigger', steps: [act({ kind: 'playSelf' })] } });
  assert.ok(errors(compareTexts(me, { en: counterText })).includes('en cible'));
  const all = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ count: 'all', upTo: false, filter: { costMax: 3 } }) })])]);
  assert.ok(errors(compareTexts(all, { en: koText(3) })).includes('en quantité'));
});

test('compare : une durée fausse est détectée', () => {
  const e = errors(compareTexts(counterRecipe(4000, 'turn'), { en: counterText }));
  assert.ok(e.includes('en durée'), e.join());
  const next = rec([ab('onPlay', [act({ kind: 'cantAttack', target: opp(), until: 'turn' })])]);
  assert.ok(errors(compareTexts(next, { en: "[On Play] Up to 1 of your opponent's Characters cannot attack until the end of your opponent's next turn." })).includes('en durée'));
});

test('compare : moments, enchaînements, mots-clés et types faux sont détectés', () => {
  const timing = rec([ab('main', counterRecipe(4000).abilities[0].steps)], { trigger: counterRecipe(4000).trigger });
  assert.ok(errors(compareTexts(timing, { en: counterText })).includes('en moment'));
  const link = counterRecipe(4000);
  (link.abilities[0].steps[1] as { link?: string }).link = 'ifYouDo';
  assert.ok(errors(compareTexts(link, { en: counterText })).includes('en lien'));
  const noTrigger = rec(counterRecipe(4000).abilities);
  assert.ok(errors(compareTexts(noTrigger, { en: counterText })).includes('en moment'));
  const typed = rec([ab('onPlay', [act({ kind: 'search', look: 5, take: 1, upTo: true, filter: { types: ['T2'], color: ['Purple'], powerMin: 6000 }, dest: 'hand', rest: 'bottom' })])]);
  const text = '[On Play] Look at 5 cards from the top of your deck; reveal up to 1 purple {T1} type card with 6000 power or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.';
  assert.ok(errors(compareTexts(typed, { en: text })).includes('en type'));
  typed.abilities[0].steps = [act({ kind: 'search', look: 5, take: 1, upTo: true, filter: { types: ['T1'], color: ['Purple'], powerMin: 6000 }, dest: 'hand', rest: 'bottom' })];
  assert.deepEqual(errors(compareTexts(typed, { en: text })), []);
  const kw = rec([], { keywords: ['Rush'] });
  assert.ok(errors(compareTexts(kw, { en: '[Blocker] (rappel)' })).includes('en mot-clé'));
});

test('compare : le texte français vérifie les valeurs (nombres, durées, « jusqu\'à »)', () => {
  const fr = "[Jouée] Mettez KO jusqu'à 1 Personnage adverse ayant un coût de 3 ou moins.";
  assert.deepEqual(errors(compareTexts(koRecipe(3), { en: koText(3), fr })), []);
  // VO juste, VF différente : l'écart est signalé du côté français
  const e = errors(compareTexts(koRecipe(3), { en: koText(3), fr: fr.replace('3', '5') }));
  assert.deepEqual(e, ['fr nombre']);
  const counterFr = "[Contre] Jusqu'à 1 de vos Leader ou Personnages gagne +4000 de puissance pour tout le tour. Puis, piochez 1 carte.\n[Déclenchement] Jouez cette carte.";
  assert.deepEqual(errors(compareTexts(counterRecipe(4000), { en: counterText, fr: counterFr })), ['fr durée']);
  // le signe et les « 1 » ne sont pas comparés en VF (sa rédaction les déplace) ; « jusqu'à la fin » est une durée
  assert.deepEqual(factsFr(normalizeFr("Réduisez de 2 le coût de jusqu'à 1 Personnage adverse jusqu'à la fin du prochain tour adverse.")),
    [{ kind: 'durée', value: 'oppNextEnd' }, { kind: 'nombre', value: '2' }, { kind: 'nombre', value: '1' }, { kind: 'quantité', value: 'up to' }]);
});

test('compare : une carte en partie codée à la main n\'est pas bloquée par ce que porte le code', () => {
  const r = rec([ab('onPlay', [act({ kind: 'ko', target: opp({ filter: { costMax: 3 } }) }), act({ kind: 'manual', reason: 'suite' }, { link: 'then' })])]);
  const es = compareTexts(r, { en: `${koText(3).slice(0, -1)}. Then, draw 2 cards.` });
  assert.deepEqual(errors(es), [], es.map((e) => e.message).join(' | '));
  assert.ok(es.some((e) => e.severity === 'info' && e.kind === 'nombre'));
});

test('compare : les mots différents sont signalés pour la relecture, en tournure à trous', () => {
  const es = compareTexts(koRecipe(3), { en: koText(3).replace('K.O.', 'Rest') });
  const t = es.find((e) => e.kind === 'texte');
  assert.ok(t && t.severity === 'info');
  assert.equal(template('[On Play] up to 2 {Navy} type [Izo] <Slash> "CP"'), '[On Play] up to N {T} type [X] <A> "X"');
  assert.equal(normalizeEn('K.O. up to 1 (rappel (imbriqué)) Character −1000 ➀'), 'KO up to 1 Character -1000 ①');
  assert.deepEqual(factsEn('If you don\'t have [Izo], draw 1 card.').filter((f) => f.kind === 'lien'), [{ kind: 'lien', value: 'if' }]);
});

test('compare(num) : recette absente, carte du catalogue', () => {
  const num = Object.keys(CARDS).find((n) => n !== HIDDEN && CARDS[n]!.effectEn)!;
  assert.equal(compare(num)[0]?.kind, 'recette');
  const t = officialTexts(num);
  assert.ok(t && t.en.length > 0);
  assert.equal(compare('ZZ99-999', koRecipe(3))[0]?.kind, 'recette');
});
