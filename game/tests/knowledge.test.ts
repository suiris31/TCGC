// Ce que chaque joueur sait des cartes cachées : une carte révélée (renvoyée en main, ajoutée à la main en la
// révélant, placée sous le deck) est connue tant qu'elle reste dans sa zone. La vue en ligne la montre, l'IA la garde
// à sa place quand elle imagine les cartes inconnues, et un mélange fait tout oublier.
import assert from 'node:assert/strict';
import test from 'node:test';
import { determinize } from '../ai/search.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { knows, lookTopPick, pruneKnown, removeByEffect, shuffleDeck } from '../engine/rules.ts';
import type { EffectCtx, GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { coherent, scenario, setChars, setDeckTop } from './helpers.ts';

const BETTY = 'OP12-090';
const CORBEAU = 'ST35-003';
const MORLEY = 'OP12-093';

// Effet du joueur `me` ; `answers` : réponses aux questions, dans l'ordre
const effectOf = (s: GameState, me: PlayerId, answers: string[] = []): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: s.players[me].leader.uid, num: s.players[me].leader.num,
  pending: { kind: 'system', source: 0, num: '', controller: me, answers: [] },
  ask: (spec) => {
    const a = answers.shift();
    if (!a) throw new Error(`question inattendue : ${spec.prompt}`);
    return a;
  },
});

const visible = (v: GameState, p: PlayerId, zone: 'hand' | 'deck' | 'life') => v.players[p][zone].filter((c) => c.num !== HIDDEN).map((c) => c.num);

test('carte renvoyée dans la main adverse : connue des deux joueurs, et l’IA la garde dans cette main', () => {
  const s = scenario(['ST-35', 'ST-35'], (g) => setChars(g, 1, [{ num: BETTY }]));
  const betty = s.players[1].chars[0].uid;
  removeByEffect(effectOf(s, 0), betty, 'hand');
  assert.ok(knows(s, 0, betty));
  assert.deepEqual(visible(viewFor(s, 0), 1, 'hand'), [BETTY], 'le joueur 0 voit Betty dans la main adverse, et rien d’autre');
  for (let seed = 1; seed <= 20; seed++) {
    assert.ok(determinize(s, 0, seed).players[1].hand.some((c) => c.uid === betty), 'l’IA n’oublie pas ce qu’elle a vu');
  }
  coherent(s);
});

test('carte ajoutée à la main en la révélant : l’adversaire la connaît ; les cartes remises sous le deck : seul le joueur', () => {
  const s = scenario(['ST-35', 'ST-35'], (g) => setDeckTop(g, 0, [CORBEAU, BETTY, MORLEY]));
  const [corbeau, betty] = s.players[0].deck;
  lookTopPick(effectOf(s, 0, [`card:${corbeau.uid}`]), 3, 1, () => true, 'une carte');
  assert.ok(knows(s, 1, corbeau.uid), 'révélée à l’adversaire');
  assert.ok(knows(s, 0, betty.uid), 'le joueur sait qu’elle est sous son deck');
  assert.ok(!knows(s, 1, betty.uid), 'l’adversaire ne l’a pas vue');
  assert.deepEqual(visible(viewFor(s, 1), 0, 'hand'), [CORBEAU]);
  assert.deepEqual(visible(viewFor(s, 1), 0, 'deck'), []);
  assert.deepEqual(visible(viewFor(s, 0), 0, 'deck').sort(), [BETTY, MORLEY].sort());
  assert.equal(viewFor(s, 1).known?.some((k) => k.uid === betty.uid), false, 'ce que le joueur 0 sait reste secret');
  coherent(s);
});

test('la connaissance se perd : carte qui change de zone, deck mélangé', () => {
  const s = scenario(['ST-35', 'ST-35'], (g) => setChars(g, 1, [{ num: BETTY }, { num: CORBEAU }]));
  const [betty, corbeau] = s.players[1].chars.map((c) => c.uid);
  removeByEffect(effectOf(s, 0), betty, 'deckBottom');
  removeByEffect(effectOf(s, 0), corbeau, 'hand');
  assert.ok(knows(s, 0, betty));
  shuffleDeck(s, 1);
  assert.ok(!knows(s, 0, betty), 'deck mélangé');
  // la carte connue en main passe dans le deck : elle n'est plus connue, même si elle revient en main plus tard
  const P = s.players[1];
  P.deck.push(...P.hand.splice(P.hand.findIndex((c) => c.uid === corbeau), 1));
  assert.ok(!knows(s, 0, corbeau));
  pruneKnown(s);  // le moteur le fait à chaque pas
  P.hand.push(...P.deck.splice(P.deck.findIndex((c) => c.uid === corbeau), 1));
  assert.ok(!knows(s, 0, corbeau));
});
