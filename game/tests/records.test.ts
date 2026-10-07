// Parties enregistrées sur le compte de chaque joueur (serveur TCGC, server/game-records.js), sur une base temporaire
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { heuristicChooser } from '../ai/heuristic.ts';
import { buildRecord, replayRecord, type GameRecord } from '../coach/archive.ts';
import type { Move } from '../coach/review.ts';
import { act, newGame } from '../engine/engine.ts';

const same = (a: unknown, b: unknown) => assert.equal(JSON.stringify(a), JSON.stringify(b));

// Une partie de 60 décisions jouées par l'IA simple, enregistrée comme le fait l'interface
function record(id: string): GameRecord {
  const initial = newGame({ decks: ['ST-35', 'ST-32'], names: ['Toi', 'IA'], seed: 17 });
  let s = initial;
  const moves: Move[] = [];
  while (s.winner === null && s.history.length < 60) {
    const choice = heuristicChooser(s, s.decision!);
    if (s.decision!.player === 0) moves.push({ id: moves.length + 1, state: s, choice });
    s = act(s, choice);
  }
  return buildRecord({
    id, engine: 'test', startedAt: '2026-10-01T18:00:00.000Z', now: '2026-10-01T18:20:00.000Z',
    config: { myDeck: 'ST-35', aiDeck: 'ST-32', level: 2, first: 'random' }, human: 0,
    initial, current: s, moves, reviews: new Map(), extra: new Map(), undos: [],
  });
}

test('serveur : chaque compte enregistre, liste et relit ses propres parties', async () => {
  // base temporaire : le module du serveur ouvre la base indiquée par TCGC_DB au moment où on le charge
  const dir = mkdtempSync(join(tmpdir(), 'tcgc-parties-'));
  process.env.TCGC_DB = join(dir, 'essai.db');
  const dbModule = '../../server/db.js';
  const recordsModule = '../../server/game-records.js';
  const { db } = await import(dbModule);
  const server = await import(recordsModule);
  try {
    const rec = record('2026-10-01_20-00-00_ST-35-contre-ST-32');
    const text = JSON.stringify(rec);
    // envoyée compressée par le navigateur, ou non
    const body = server.readRecordBody(gzipSync(text), true);
    assert.equal(body.text, text);
    server.saveRecord(1, rec.id, body.rec, body.text);
    const later = { ...rec, status: 'won' as const, updatedAt: '2026-10-01T18:30:00.000Z' };
    server.saveRecord(1, rec.id, later, JSON.stringify(later));  // mise à jour
    const older = { ...rec, status: 'abandoned' as const, updatedAt: '2026-10-01T18:00:00.000Z' };
    server.saveRecord(1, rec.id, older, JSON.stringify(older));  // envoi en retard : ignoré
    const list = JSON.parse(server.recordSummariesJson(1)) as Record<string, unknown>[];
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'won');
    assert.equal(list[0].initial, undefined);
    assert.equal(list[0].steps, undefined);
    assert.ok(Array.isArray(list[0].decisions));
    const full = JSON.parse(gunzipSync(server.recordBlob(1, rec.id)).toString('utf8')) as GameRecord;
    same(replayRecord(full).final, replayRecord(rec).final);
    // les parties d'un compte sont invisibles pour les autres
    assert.equal(server.recordSummariesJson(2), '[]');
    assert.equal(server.recordBlob(2, rec.id), null);
    assert.throws(() => server.saveRecord(1, '../evil', { ...rec, id: '../evil' }, text), /invalide/);
    assert.throws(() => server.saveRecord(1, 'autre-partie', rec, text), /incohérent/);
    assert.throws(() => server.saveRecord(1, 'x', { id: 'x' }, '{"id":"x"}'), /pas une partie/);
    assert.throws(() => server.readRecordBody(Buffer.from('pas du json'), false), /illisible/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
