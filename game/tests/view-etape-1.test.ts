// Étanchéité de la vue d'un joueur pour les cartes de l'étape 1 du plan « Aventure » (tâche 1.20) : view.test.ts ne joue
// que les decks du registre, où ne figure aucun deck de l'aventure ni la plupart des cartes d'OP03. Mêmes contrôles, à
// chaque coup et pour chaque joueur, sur les decks de l'aventure (et ST-01) les uns contre les autres, et sur un deck par
// Leader d'OP03 et de ST-01 fait des cartes de l'étape à ses couleurs. Les contrôles sont repris de view.test.ts (ses
// fonctions ne sont pas exportées : un fichier de test importé y lancerait ses propres tests).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADVENTURE_DECKS } from '../adventure/decks.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import { CARDS, cardStatus, HIDDEN } from '../engine/cards/index.ts';
import { DECK_SIZE, MAX_COPIES, playableErrors } from '../engine/deckRules.ts';
import { DECKS, type DeckList } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { knows } from '../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

function allowed(s: GameState, seat: PlayerId): Set<number> {
  const ok = new Set<number>();
  for (const P of s.players) for (const c of [...P.hand, ...P.deck, ...P.life]) if (knows(s, seat, c.uid)) ok.add(c.uid);
  const d = s.decision;
  if (d && d.player === seat) {
    for (const o of d.options) {
      if (o.uid !== undefined) ok.add(o.uid);
      if (o.target !== undefined) ok.add(o.target);
    }
    for (const c of d.cards ?? []) ok.add(c.uid);
  }
  const top = s.players[other(seat)].deck[0];
  if (top && s.peek[seat] === top.uid) ok.add(top.uid);
  return ok;
}

function secrets(s: GameState, seat: PlayerId): Card[] {
  const O = s.players[other(seat)];
  const P = s.players[seat];
  const ok = allowed(s, seat);
  return [...O.hand, ...O.deck, ...O.life.filter((c) => !c.faceUp), ...P.deck, ...P.life.filter((c) => !c.faceUp)].filter((c) => !ok.has(c.uid));
}

function citedUids(v: GameState): Set<number> {
  const out = new Set<number>();
  const json = JSON.stringify({ ...v, history: v.history.filter((h) => h.label === '') });
  for (const m of json.matchAll(/"(?:uid|target|source|attacker)":(-?\d+)/g)) out.add(Number(m[1]));
  for (const m of json.matchAll(/"(?:id|choice)":"(?!cost:|choice:)[a-z]+((?::\d+)+)"/gi)) for (const n of m[1].split(':').slice(1)) out.add(Number(n));
  return out;
}

function check(s: GameState, seat: PlayerId, stats: { views: number; revealed: number }) {
  const v = viewFor(s, seat);
  stats.views++;
  assert.equal(v.rng, 0);
  assert.equal(v.nextUid, 0);
  assert.equal(v.pending.length, 0);
  assert.ok(!JSON.stringify(v).includes('snapshot'), 'instantané d’effet dans la vue');
  for (const p of [0, 1] as PlayerId[]) {
    for (const zone of ['hand', 'deck', 'life'] as const) assert.equal(v.players[p][zone].length, s.players[p][zone].length);
  }
  const hiddenOnes = [...v.players[other(seat)].hand, ...v.players[other(seat)].deck, ...v.players[seat].deck, ...v.players[0].life, ...v.players[1].life]
    .filter((c) => c.num === HIDDEN);
  for (const c of hiddenOnes) assert.ok(c.uid < 0, 'carte cachée avec un vrai identifiant');
  const cited = citedUids(v);
  const secret = secrets(s, seat);
  for (const c of secret) assert.ok(!cited.has(c.uid), `carte cachée ${c.num} (uid ${c.uid}) visible par le joueur ${seat}`);
  assert.equal(hiddenOnes.length, secret.length);
  stats.revealed += [...v.players[other(seat)].hand, ...v.players[other(seat)].deck].filter((c) => c.num !== HIDDEN).length;
  assert.ok(v.log.every((l) => l.only === undefined || l.only === seat));
  if (s.decision && s.decision.player !== seat) {
    assert.equal(v.decision!.options.length, 0);
    assert.equal(v.decision!.prompt, '');
  }
  for (const h of v.history) if (h.player !== seat) assert.equal(h.label, '');
  assert.deepEqual(v.players[seat].hand, s.players[seat].hand);
  assert.deepEqual(v.players[0].chars, s.players[0].chars);
  assert.deepEqual(v.players[1].leader, s.players[1].leader);
  assert.deepEqual(v.players[0].trash, s.players[0].trash);
}

function playChecked(a: DeckList, b: DeckList, seed: number, stats: { views: number; revealed: number }) {
  let s = newGame({ decks: [a, b], names: ['A', 'B'], seed });
  for (let guard = 0; s.winner === null && guard < 2000; guard++) {
    check(s, 0, stats);
    check(s, 1, stats);
    s = act(s, heuristicChooser(s, s.decision!));
  }
  check(s, 0, stats);
  check(s, 1, stats);
}

// Deck d'un Leader fait des cartes jouables de l'étape (OP03, ST-01) à ses couleurs, 4 exemplaires chacune, en
// commençant à `offset` dans la liste (deux decks différents par Leader)
function stageDeck(leader: string, offset: number): DeckList {
  const L = CARDS[leader];
  const pool = Object.keys(CARDS).filter((n) => /^(OP03|ST01)-/.test(n) && cardStatus(n) !== 'todo' && CARDS[n].category !== 'LEADER'
    && CARDS[n].colors.length > 0 && CARDS[n].colors.every((c) => L.colors.includes(c)) && !L.rules?.deckRestriction?.(CARDS[n])).sort();
  const cards: Record<string, number> = {};
  let total = 0;
  for (let i = 0; total < DECK_SIZE; i++) {
    const n = pool[(offset + i) % pool.length];
    const add = Math.min(MAX_COPIES - (cards[n] ?? 0), DECK_SIZE - total);
    cards[n] = (cards[n] ?? 0) + add;
    total += add;
  }
  return { id: `TEST-VUE-${leader}-${offset}`, name: 'Essai', series: 'TEST', leader, cards };
}

test('vue d’un joueur : aucune carte cachée ne fuit, decks de l’aventure et ST-01 les uns contre les autres', () => {
  const decks = [...Object.values(ADVENTURE_DECKS), DECKS['ST-01']];
  const stats = { views: 0, revealed: 0 };
  let seed = 501;
  for (const a of decks) for (const b of decks) playChecked(a, b, seed++, stats);
  assert.ok(stats.views > 2000, `trop peu de situations vérifiées (${stats.views})`);
  assert.ok(stats.revealed > 0);
});

test('vue d’un joueur : aucune carte cachée ne fuit, decks des Leaders d’OP03 et de ST-01 faits des cartes de l’étape', () => {
  const leaders = Object.keys(CARDS).filter((n) => /^(OP03|ST01)-/.test(n) && CARDS[n].category === 'LEADER' && cardStatus(n) !== 'todo');
  assert.ok(leaders.length >= 9, `Leaders : ${leaders.join(' ')}`);
  const stats = { views: 0, revealed: 0 };
  let seed = 901;
  for (const leader of leaders) {
    for (const offset of [0, 7]) {
      const deck = stageDeck(leader, offset);
      assert.deepEqual(playableErrors(deck.leader, deck.cards), [], deck.id);
      playChecked(deck, DECKS['ST-01'], seed++, stats);
      playChecked(ADVENTURE_DECKS['AV-EB-SMOKER'], deck, seed++, stats);
    }
  }
  assert.ok(stats.views > 2000, `trop peu de situations vérifiées (${stats.views})`);
  assert.ok(stats.revealed > 0);
});
