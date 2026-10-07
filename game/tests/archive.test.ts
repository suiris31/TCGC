// Archive des parties : enregistrement complet, relecture exacte, progression sur plusieurs parties
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { coachAnalyze } from '../ai/search.ts';
import { buildRecord, replayRecord, type GameRecord, type GameSummary, type RecordInput } from '../coach/archive.ts';
import { mistakeKind, progress } from '../coach/progress.ts';
import { isReviewable, toReview, type Move, type MoveReview } from '../coach/review.ts';
import { act, newGame } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';

// simulations réduites pour que les tests restent rapides
const OPTS = { samples: 3, budgetMs: 0, minSamples: 3, refineSamples: 4, refineBudgetMs: 0, refineMin: 4 };

// Partie jouée comme dans l'interface : le joueur 0 suit l'IA simple (en terminant parfois son tour trop tôt) et le
// coach analyse quelques-unes de ses décisions
function play(start: GameState, firstId = 1, stopAt?: number) {
  let s = start;
  const moves: Move[] = [];
  const reviews = new Map<number, MoveReview>();
  const extra = new Map<number, { ms?: number; hint?: string }>();
  let id = firstId;
  while (s.winner === null && (stopAt === undefined || s.history.length < stopAt)) {
    const d = s.decision!;
    let choice = heuristicChooser(s, d);
    if (d.player === 0) {
      if (d.kind === 'main' && s.turn % 4 === 3 && choice.startsWith('attack:')) choice = 'end';
      const m = { id: id++, state: s, choice };
      moves.push(m);
      if (isReviewable(m, 0) && reviews.size < 5) reviews.set(m.id, toReview(m, coachAnalyze(s, { ...OPTS, include: choice })));
      extra.set(m.id, { ms: 1000 + m.id * 10, hint: m.id % 3 ? undefined : choice });
    }
    s = act(s, choice);
  }
  return { final: s, moves, reviews, extra };
}

const fresh = (seed: number) => newGame({ decks: ['ST-35', 'ST-32'], names: ['Toi', 'IA'], seed });

function input(initial: GameState, g: ReturnType<typeof play>, patch: Partial<RecordInput> = {}): RecordInput {
  return {
    id: 'essai', engine: 'test', startedAt: '2026-10-01T18:00:00.000Z', now: '2026-10-01T18:20:00.000Z',
    config: { myDeck: 'ST-35', aiDeck: 'ST-32', level: 2, first: 'random' }, human: 0,
    initial, current: g.final, moves: g.moves, reviews: g.reviews, extra: g.extra, undos: [], ...patch,
  };
}

const same = (a: unknown, b: unknown) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('archive : une partie enregistrée se rejoue exactement, avec chacune de tes décisions', () => {
  const initial = fresh(11);
  const g = play(initial);
  const rec = JSON.parse(JSON.stringify(buildRecord(input(initial, g)))) as GameRecord;
  assert.equal(rec.status, g.final.winner === 0 ? 'won' : 'lost');
  assert.equal(rec.steps.length, g.final.history.length);
  assert.equal(rec.decisions.length, g.moves.length);
  assert.equal(rec.reviews.length, g.reviews.size);
  assert.ok(rec.decisions.every((d) => d.sit.field[0].length >= 1 && d.ms !== undefined));
  assert.ok(rec.decisions.some((d) => d.hint));
  const r = replayRecord(rec);
  same(r.final, g.final);
  r.moves.forEach((m, i) => {
    same(m.state, g.moves[i].state);
    assert.equal(m.choice, g.moves[i].choice);
    assert.equal(m.id, g.moves[i].id);
  });
});

test('archive : après un retour en arrière, seuls les coups gardés sont enregistrés', () => {
  const initial = fresh(12);
  const g = play(initial);
  const k = Math.floor(g.moves.length / 2);
  const back = { ...g, final: g.moves[k].state, moves: g.moves.slice(0, k) };
  const rec = buildRecord(input(initial, back, { undos: [{ turn: g.final.turn, undone: 9 }] }));
  assert.equal(rec.status, 'playing');
  assert.equal(rec.endedAt, undefined);
  assert.equal(rec.steps.length, g.moves[k].state.history.length);
  assert.equal(rec.decisions.length, k);
  assert.equal(rec.undos.length, 1);
  same(replayRecord(rec).final, g.moves[k].state);
});

test('archive : une partie reprise depuis un moment revu commence à ce moment', () => {
  const initial = fresh(13);
  const g = play(initial);
  const k = Math.floor(g.moves.length / 2);
  const from = g.moves[k].state;
  const again = play(from, 500);
  // comme dans l'interface : les décisions d'avant le moment repris restent dans la liste
  const rec = buildRecord(input(from, { ...again, moves: [...g.moves.slice(0, k), ...again.moves] }, { practice: { from: 'essai', turn: from.turn } }));
  assert.equal(rec.decisions.length, again.moves.length);
  assert.equal(rec.decisions[0].step, 0);
  assert.ok(rec.practice);
  same(replayRecord(rec).final, again.final);
});

test('archive : partie interrompue, puis abandonnée', () => {
  const initial = fresh(14);
  const g = play(initial, 1, 40);
  assert.equal(buildRecord(input(initial, g)).status, 'playing');
  const quit = buildRecord(input(initial, g, { abandoned: true }));
  assert.equal(quit.status, 'abandoned');
  assert.equal(quit.endedAt, '2026-10-01T18:20:00.000Z');
});

test('archive : une partie qui ne se rejoue plus (programme modifié) est signalée', () => {
  const initial = fresh(15);
  const rec = buildRecord(input(initial, play(initial)));
  rec.steps[3] = { ...rec.steps[3], choice: 'inexistant' };
  assert.throws(() => replayRecord(rec), /ne se rejoue plus/);
});

test('progression : chaque erreur est rangée dans un thème', () => {
  const k = (kind: string, choice: string, best: string, tag?: string) => mistakeKind({ kind, choice, best, tag });
  assert.equal(k('main', 'end', 'attack:1:2'), 'endEarly');
  assert.equal(k('main', 'attack:1:2', 'end'), 'extra');
  assert.equal(k('main', 'attack:1:2', 'attack:3:2'), 'attackChoice');
  assert.equal(k('main', 'don:3', 'don:1'), 'donChoice');
  assert.equal(k('main', 'play:3', 'event:4'), 'playChoice');
  assert.equal(k('main', 'play:3', 'attack:1:2'), 'order');
  assert.equal(k('counter', 'pass', 'counter:5'), 'counterMissing');
  assert.equal(k('counter', 'counter:5', 'pass'), 'counterWasted');
  assert.equal(k('counter', 'counter:5', 'cevent:6'), 'counterChoice');
  assert.equal(k('blocker', 'noblock', 'block:4'), 'block');
  assert.equal(k('effect', 'hand', 'trigger', 'trigger'), 'trigger');
  assert.equal(k('effect', 'target:4', 'target:5', 'target'), 'effect');
  assert.equal(k('mulligan', 'keep', 'mulligan'), 'mulligan');
});

test('progression : résultats, précision, thèmes qui reculent, cartes, habitudes', () => {
  const initial = fresh(16);
  const g = play(initial);
  const base = buildRecord(input(initial, g)) as GameSummary;
  const endTurn = g.moves.find((m) => m.choice === 'end' && m.state.decision!.kind === 'main')!;
  const mistake = (id: number): MoveReview => ({
    ...g.reviews.values().next().value!, id, kind: 'main', choice: 'end', choiceLabel: 'Fin du tour', best: 'attack:1:2', bestLabel: 'Attaquer', delta: 0.3,
  });
  const fine = (id: number): MoveReview => ({ ...mistake(id), choice: 'attack:1:2', delta: 0.01 });
  // 12 parties : les 6 premières avec 3 tours terminés trop tôt, les suivantes sans erreur ; 2 victoires sur 3
  const games: GameSummary[] = Array.from({ length: 12 }, (_, i) => ({
    ...base,
    id: `p${i}`,
    startedAt: `2026-10-${String(i + 1).padStart(2, '0')}T18:00:00.000Z`,
    status: i % 3 === 2 ? 'lost' : 'won',
    decisions: base.decisions.map((d) => (d.move === endTurn.id ? { ...d, card: 'OP13-004' } : d)),
    reviews: i < 6 ? [mistake(endTurn.id), mistake(endTurn.id + 1000), mistake(endTurn.id + 2000), fine(5)] : [fine(endTurn.id), fine(5)],
  }));
  games.push({ ...base, id: 'entrainement', startedAt: '2026-10-20T18:00:00.000Z', practice: { from: 'p1', turn: 3 } });
  games.push({ ...base, id: 'abandon', startedAt: '2026-10-21T18:00:00.000Z', status: 'abandoned', reviews: [] });
  const p = progress(games);
  assert.equal(p.rows.length, 14);
  assert.equal(p.rows[0].id, 'abandon');
  assert.equal(p.totals.games, 12);
  assert.equal(p.totals.wins, 8);
  assert.equal(p.totals.practice, 1);
  assert.equal(p.totals.unfinished, 1);
  assert.equal(p.totals.decisions, 6 * 4 + 6 * 2);
  assert.ok(Math.abs(p.totals.accuracy! - (1 - 18 / 36)) < 1e-9);
  assert.equal(p.series.win.length, 12);
  assert.equal(p.series.accuracy.length, 12);
  // les 6 dernières parties (sans erreur) comparées aux 6 premières
  assert.equal(p.recent!.games, 6);
  assert.equal(p.recent!.accuracy, 1);
  assert.equal(p.before!.mistakesPerGame, 3);
  const axis = p.axes[0];
  assert.equal(axis.key, 'endEarly');
  assert.equal(axis.count, 18);
  assert.equal(axis.games, 6);
  assert.equal(axis.recentPerGame, 0);
  assert.equal(axis.beforePerGame, 3);
  assert.equal(axis.examples.length, 3);
  assert.equal(new Set(axis.examples.map((e) => e.game)).size, 3);
  assert.equal(p.cards[0].num, 'OP13-004');
  assert.equal(p.cards[0].count, 6);
  assert.ok(p.habits.thinkSec! > 1);
  assert.ok(p.habits.hintShare !== null);
  assert.equal(p.matchups[0].games, 12);
});
