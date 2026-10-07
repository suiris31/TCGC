// Tests du moteur : règles de base, cartes du ST-35 et parties complètes IA contre IA
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { DECKS } from '../engine/decks.ts';
import { act, advance, newGame } from '../engine/engine.ts';
import { fieldCost, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';

const game = (seed: number, first: PlayerId = 0) => newGame({ decks: ['ST-35', 'ST-35'], names: ['Joueur', 'IA'], seed, first });

// Joue toutes les décisions avec l'IA jusqu'à une condition
function playUntil(s: GameState, done: (s: GameState) => boolean) {
  let state = s;
  for (let i = 0; i < 2000 && !done(state) && state.winner === null; i++) state = act(state, heuristicChooser(state, state.decision!));
  return state;
}

test('préparation : 5 cartes en main, 5 Vies, premier joueur', () => {
  const s = game(1);
  assert.equal(s.decision?.kind, 'mulligan');
  assert.equal(s.decision?.player, 0);
  assert.equal(s.players[0].hand.length, 5);
  assert.equal(s.players[0].deck.length, 45);
  const after = act(act(s, 'keep'), 'keep');
  for (const P of after.players) assert.equal(P.life.length, 5);
  assert.equal(after.players[0].deck.length, 40);
});

test('premier tour : 1 DON!!, pas de pioche, pas d’attaque', () => {
  const s = act(act(game(2), 'keep'), 'keep');
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].hand.length, 5);
  assert.ok(!s.decision!.options.some((o) => o.id.startsWith('attack:')));
  // Second joueur : pioche et 2 DON!!, mais pas d'attaque non plus à son premier tour (6-5-6-1)
  const t2 = act(s, 'end');
  assert.equal(t2.active, 1);
  assert.equal(t2.players[1].donActive, 2);
  assert.equal(t2.players[1].hand.length, 6);
  assert.ok(!t2.decision!.options.some((o) => o.id.startsWith('attack:')));
  // Tour 3 : le Leader du premier joueur peut attaquer
  const t3 = act(t2, 'end');
  assert.ok(t3.decision!.options.some((o) => o.id === `attack:${t3.players[0].leader.uid}:${t3.players[1].leader.uid}`));
});

test('Leader Sabo : −1000 avec 4 Vies ou plus, +1000 avec DON!! x1 et un Personnage de coût 8', () => {
  const s = act(act(game(3), 'keep'), 'keep');
  const leader = s.players[0].leader.uid;
  assert.equal(power(s, leader), 4000);
  // Morley sur le terrain (coût 4 +4 = 8) et 1 DON!! donnée au Leader
  const t = structuredClone(s);
  t.players[0].chars.push({ uid: 999, num: 'OP12-093', rested: false, don: 0, playedTurn: 0, usedOpt: [] });
  assert.equal(fieldCost(t, 999), 8);
  t.players[0].leader.don = 1;
  // 5000 −1000 (Vie) +1000 (DON!!, son tour) +1000 (aura)
  assert.equal(power(t, leader), 6000);
  assert.equal(power(t, 999), 6000);
  // Pendant le tour adverse : la DON!! ne donne plus +1000 mais la condition [DON!! x1] reste remplie
  t.active = 1;
  assert.equal(power(t, leader), 5000);
  assert.equal(power(t, 999), 6000);
});

test('parties complètes IA contre IA : elles se terminent toutes', () => {
  const wins = [0, 0];
  let turns = 0;
  const n = 60;
  for (let seed = 1; seed <= n; seed++) {
    const s = newGame({ decks: ['ST-35', 'ST-35'], names: ['A', 'B'], seed }, heuristicChooser);
    assert.notEqual(s.winner, null, `partie ${seed} sans vainqueur`);
    wins[s.winner!]++;
    turns += s.turn;
  }
  assert.ok(wins[0] > 5 && wins[1] > 5, `répartition des victoires suspecte : ${wins}`);
  assert.ok(turns / n > 5 && turns / n < 40, `durée moyenne suspecte : ${turns / n} tours`);
});

test('partie humaine (act) et partie simulée (advance) donnent le même résultat', () => {
  const ids = Object.keys(DECKS);
  const pairs: [string, string][] = [['ST-35', 'ST-35'], ...ids.map((id, i): [string, string] => [id, ids[(i + 1) % ids.length]])];
  for (const [i, decks] of pairs.entries()) {
    const seed = 11 + i;
    const simulated = newGame({ decks, names: ['A', 'B'], seed }, heuristicChooser);
    const played = playUntil(newGame({ decks, names: ['A', 'B'], seed }), () => false);
    assert.equal(played.winner, simulated.winner, decks.join(' contre '));
    assert.equal(played.turn, simulated.turn);
    assert.deepEqual(played.log.map((l) => l.text), simulated.log.map((l) => l.text));
  }
});

test('advance avec un chooser reprend une partie en cours', () => {
  const s = act(act(game(21), 'keep'), 'keep');
  const done = advance(structuredClone(s), heuristicChooser);
  assert.notEqual(done.winner, null);
});

test('analyse par simulation : toutes les options évaluées, informations cachées redistribuées', async () => {
  const { analyze, determinize } = await import('../ai/search.ts');
  const s = act(act(game(31), 'keep'), 'keep');
  // la vue du joueur 0 ne change ni sa main ni le terrain, mais mélange la main adverse avec son deck
  const d = determinize(s, 0, 123);
  assert.deepEqual(d.players[0].hand.map((c) => c.uid), s.players[0].hand.map((c) => c.uid));
  assert.equal(d.players[1].hand.length, s.players[1].hand.length);
  assert.notDeepEqual(d.players[1].deck.map((c) => c.uid), s.players[1].deck.map((c) => c.uid));
  const a = analyze(s, { samples: 3 });
  assert.equal(a.stats.length + a.pruned.length, s.decision!.options.length);
  assert.ok(a.stats.every((x) => x.n === 3 && x.rate >= 0 && x.rate <= 1));
});
