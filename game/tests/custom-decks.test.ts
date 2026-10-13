// Decks personnalisés (phase 5) : le moteur joue n'importe quelle liste valide, l'IA prend le style d'un deck du même
// Leader et ne connaît pas la liste d'un deck personnalisé adverse, le jeu en ligne garde cette liste secrète, et les
// règles de construction disent si le deck est jouable dans l'appli et en tournoi.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { determinize } from '../ai/search.ts';
import { STYLES, styleOf } from '../ai/style.ts';
import { cardStatus, CARDS } from '../engine/cards/index.ts';
import { formatIssues, playableErrors } from '../engine/deckRules.ts';
import { CUSTOM_SERIES, DECKS, type DeckList } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { invariantErrors } from '../engine/invariants.ts';
import { createMatch, joinMatch, MatchError, recordFor, viewOf } from '../online/match.ts';

// Luffy (ST-31) avec 4 Gum Gum Taupe Bullet (ST-21) à la place des 4 Gum Gum Rafale
const custom: DeckList = {
  id: 'PERSO-essai01', name: 'Mon Luffy', series: CUSTOM_SERIES, leader: 'ST21-001',
  cards: { ...Object.fromEntries(Object.entries(DECKS['ST-31'].cards).filter(([n]) => n !== 'OP13-021')), 'ST21-017': 4 },
};

test('deck personnalisé : partie complète IA contre IA, liste notée dans la partie, cohérence à chaque étape', () => {
  assert.deepEqual(playableErrors(custom.leader, custom.cards), []);
  for (const seed of [1, 2, 3]) {
    const s = newGame({ decks: [custom, 'ST-36'], names: ['A', 'B'], seed, first: 0 }, (st, d) => {
      if (!d.inEffect) assert.deepEqual(invariantErrors(st), []);
      return heuristicChooser(st, d);
    });
    assert.notEqual(s.winner, null);
    assert.equal(s.players[0].deckId, 'PERSO-essai01');
    assert.deepEqual(s.players[0].list, { leader: custom.leader, cards: custom.cards });
  }
});

test('deck personnalisé : l’IA joue avec le style du deck préconstruit de son Leader', () => {
  assert.equal(styleOf('PERSO-essai01', 0, 'ST21-001'), STYLES['ST-31']);
  assert.notEqual(styleOf('PERSO-autre', 0, 'OP15-022'), STYLES['ST-31']);
});

test('deck personnalisé adverse : l’IA par simulation devine ses cartes cachées au lieu de lire sa liste', () => {
  let state = newGame({ decks: [custom, 'ST-36'], names: ['Toi', 'IA'], seed: 7, first: 0 });
  // quelques coups de l'IA simple pour avancer la partie
  for (let i = 0; i < 40 && state.decision && state.winner === null; i++) state = act(state, heuristicChooser(state, state.decision));
  const viewer = 1;
  const hidden = (g: typeof state) => [...g.players[0].hand, ...g.players[0].deck, ...g.players[0].life];
  const real = hidden(state).map((c) => c.num).sort();
  let differs = 0;
  for (let k = 0; k < 5; k++) {
    const d = determinize(state, viewer, 100 + k, true);
    const guessed = hidden(d);
    assert.equal(guessed.length, real.length, 'autant de cartes cachées');
    for (const c of guessed) {
      assert.ok(CARDS[c.num].colors.every((x) => CARDS['ST21-001'].colors.includes(x)), `${c.num} : couleurs du Leader`);
      assert.notEqual(cardStatus(c.num), 'todo');
    }
    if (guessed.map((c) => c.num).sort().join() !== real.join()) differs++;
  }
  assert.ok(differs > 0, 'la liste devinée n’est pas la vraie');
  // sans secret (coach, deck du registre), on redistribue les vraies cartes
  const d = determinize(state, viewer, 100, false);
  assert.deepEqual(hidden(d).map((c) => c.num).sort(), real);
});

test('en ligne : un deck personnalisé jouable est accepté, sa liste reste secrète', () => {
  const host = { userId: 1, name: 'Luffy', deck: custom.id, list: custom };
  const m = createMatch('partie-perso', 'K7MQ2P', host, new Date('2026-10-13T18:00:00Z'), 'test');
  joinMatch(m, { userId: 2, name: 'Zoro', deck: 'ST-32' }, new Date('2026-10-13T18:01:00Z'), 5);
  const theirs = viewOf(m, 1);
  assert.deepEqual(theirs.opponent, { name: 'Luffy', deck: custom.id, deckName: 'Mon Luffy' });
  assert.equal(theirs.state!.players[0].list, undefined, 'liste secrète');
  assert.equal(JSON.stringify(theirs).includes('ST21-017'), false, 'aucune carte cachée du deck dans la vue adverse');
  assert.equal(viewOf(m, 0).you.deckName, 'Mon Luffy');
  assert.equal(recordFor(m, 1, new Date('2026-10-13T18:02:00Z')).config.aiDeckName, 'Mon Luffy');

  const bad: DeckList = { ...custom, cards: { ...custom.cards, 'ST21-017': 5 } };
  assert.throws(() => createMatch('x', 'K7MQ2P', { ...host, list: bad }, new Date(), 'test'), (e: unknown) => e instanceof MatchError && e.code === 'invalid_deck');
  assert.throws(() => createMatch('x', 'K7MQ2P', { ...host, list: undefined }, new Date(), 'test'), (e: unknown) => e instanceof MatchError && e.code === 'invalid_deck');
});

test('règles de construction : carte pas encore gérée, cartes bannies ou limitées, Standard', () => {
  const todo = Object.keys(CARDS).find((n) => cardStatus(n) === 'todo' && CARDS[n].colors.includes('Red') && CARDS[n].colors.length === 1 && CARDS[n].category === 'CHARACTER')!;
  const withTodo = { ...custom.cards, 'ST21-017': 3, [todo]: 1 };
  assert.match(playableErrors(custom.leader, withTodo).join(' ; '), /effet pas encore géré/);
  const f = formatIssues(custom.leader, custom.cards, { 'ST21-017': 'restricted', 'OP11-003': 'banned', 'P-101': 'pair' });
  assert.equal(f.errors.length, 2);
  assert.ok(f.errors.some((e) => e.includes('OP11-003') && e.endsWith('bannie')));
  assert.ok(f.errors.some((e) => e.includes('ST21-017') && e.endsWith('limitée à 1 exemplaire')));
  assert.equal(f.pairs.length, 1);
  const sabo = DECKS['META-SABO-2026-10'];
  assert.ok(formatIssues(sabo.leader, sabo.cards).standard.some((e) => e.includes('ST01-011')), 'bloc 1 d’après le catalogue : avertissement');
  assert.deepEqual(formatIssues(sabo.leader, sabo.cards).errors, []);
});

test('listes en texte : export « 4xOP13-008 », import des formats courants (Leader reconnu, lignes inconnues signalées)', async () => {
  const { deckText, parseDeckText } = await import('../ui/deckText.ts');
  const isLeader = (n: string) => CARDS[n]?.category === 'LEADER';
  const text = deckText(custom);
  assert.ok(text.startsWith('1xST21-001\n'));
  const back = parseDeckText(text, isLeader);
  assert.equal(back.leader, custom.leader);
  assert.deepEqual(back.cards, custom.cards);
  const loose = parseDeckText('1 x OP13-004 Sabo\n4xOP13-008\nOP12-090 x2\n2 op12-093\nST35-001\nBonjour', isLeader);
  assert.equal(loose.leader, 'OP13-004');
  assert.deepEqual(loose.cards, { 'OP13-008': 4, 'OP12-090': 2, 'OP12-093': 2, 'ST35-001': 1 });
  assert.deepEqual(loose.unknown, ['Bonjour']);
});
