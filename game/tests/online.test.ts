// Parties en ligne (game/online/match.ts) : salle, arbitrage des choix, reprise après redémarrage, abandon, partie
// rangée dans « Mes parties » de chaque joueur
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { replayRecord } from '../coach/archive.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { createMatch, joinMatch, MatchError, play, recordFor, resign, seatOf, viewOf, type Match } from '../online/match.ts';

const t0 = new Date('2026-10-08T18:00:00Z');
const later = (min: number) => new Date(t0.getTime() + min * 60_000);
const host = { userId: 1, name: 'Luffy', deck: 'ST-35' };
const guest = { userId: 2, name: 'Zoro', deck: 'ST-32' };

function room(): Match {
  return createMatch('partie-essai', 'K7MQ2P', host, t0, 'test');
}

const fails = (fn: () => void, code: string) => assert.throws(fn, (e: unknown) => e instanceof MatchError && e.code === code);

test('en ligne : la salle attend son invité, seul l’hôte voit le code', () => {
  const m = room();
  assert.equal(m.status, 'waiting');
  assert.equal(viewOf(m, 0).code, 'K7MQ2P');
  assert.equal(viewOf(m, 0).state, null);
  fails(() => joinMatch(m, { ...host }, later(1), 5), 'own_room');
  fails(() => joinMatch(m, { ...guest, deck: 'ST-99' }, later(1), 5), 'invalid_deck');
  fails(() => joinMatch(structuredClone(m), guest, later(16), 5), 'room_closed');  // salle fermée après 15 min
  joinMatch(m, guest, later(2), 5);
  assert.equal(m.status, 'playing');
  assert.equal(m.code, null);
  assert.equal(seatOf(m, 2), 1);
  assert.equal(seatOf(m, 3), null);
  fails(() => joinMatch(m, { userId: 3, name: 'Nami', deck: 'ST-31' }, later(3), 6), 'room_closed');
  // chacun voit sa main, pas celle de l'autre
  const v = viewOf(m, 1);
  assert.equal(v.opponent?.name, 'Luffy');
  assert.ok(v.state!.players[1].hand.every((c) => c.num !== HIDDEN));
  assert.ok(v.state!.players[0].hand.every((c) => c.num === HIDDEN));
});

test('en ligne : un choix est refusé s’il ne revient pas au joueur, s’il arrive en retard ou s’il n’existe pas', () => {
  const m = room();
  joinMatch(m, guest, later(1), 9);
  const d = m.state!.decision!;
  const seat = d.player;
  const otherSeat = seat === 0 ? 1 : 0;
  const choice = heuristicChooser(m.state!, d);
  fails(() => play(m, otherSeat, 0, choice, later(2)), 'not_your_turn');
  fails(() => play(m, seat, 3, choice, later(2)), 'stale');
  fails(() => play(m, seat, 0, 'tricher', later(2)), 'invalid_choice');
  play(m, seat, 0, choice, later(2));
  fails(() => play(m, seat, 0, choice, later(2)), 'stale');  // double clic : le même coup n'est pas joué deux fois
  assert.equal(viewOf(m, 0).seq, 1);
});

test('en ligne : partie complète, reprise après un redémarrage du serveur, rangée chez les deux joueurs', () => {
  let m = room();
  joinMatch(m, guest, later(1), 21);
  let moves = 0;
  while (m.status === 'playing') {
    const d = m.state!.decision!;
    play(m, d.player, viewOf(m, d.player).seq, heuristicChooser(m.state!, d), later(2));
    // à mi-partie, le serveur redémarre : la partie est relue depuis la base (JSON)
    if (++moves === 40) m = JSON.parse(JSON.stringify(m)) as Match;
  }
  assert.equal(m.status, 'over');
  assert.ok(m.endedAt);
  fails(() => play(m, 0, viewOf(m, 0).seq, 'end', later(3)), 'not_playing');
  const recs = [recordFor(m, 0, later(30)), recordFor(m, 1, later(30))];
  assert.deepEqual(recs.map((r) => r.status).sort(), ['lost', 'won']);
  assert.deepEqual(recs.map((r) => r.opponent), ['Zoro', 'Luffy']);
  for (const r of recs) {
    assert.equal(r.mode, 'online');
    assert.match(r.id, /^[\w-]{1,120}$/);
    assert.ok(r.decisions.length > 0);
    assert.equal(replayRecord(r).final.winner, m.state!.winner);  // se rejoue à l'identique
  }
});

test('en ligne : abandon', () => {
  const m = room();
  joinMatch(m, guest, later(1), 33);
  resign(m, 1, later(5));
  assert.equal(m.status, 'over');
  assert.equal(m.state!.winner, 0);
  assert.match(m.state!.winReason!, /Zoro abandonne/);
  assert.equal(recordFor(m, 1, later(6)).status, 'lost');
  assert.equal(recordFor(m, 0, later(6)).status, 'won');
  fails(() => resign(m, 0, later(7)), 'not_playing');
});
