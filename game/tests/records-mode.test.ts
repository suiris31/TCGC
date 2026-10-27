// Mode des parties enregistrées (tâche R3.8) : contre l'IA, Aventure ou en ligne, y compris pour les anciennes parties
// d'aventure enregistrées sans le champ mode ; le bilan de la partie rapide ne compte que les parties contre l'IA
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRecord, inQuickRecord, playMode, type GameSummary, type RecordInput } from '../coach/archive.ts';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { newGame } from '../engine/engine.ts';

type Shape = Pick<GameSummary, 'mode' | 'config' | 'practice' | 'status'>;
const game = (aiDeck: string, patch: Partial<Shape> = {}): Shape => ({
  config: { myDeck: 'ST-01', aiDeck, level: 1, first: 'random' }, status: 'won', ...patch,
});

test('mode : une partie en ligne, une partie d’aventure et une partie contre l’IA', () => {
  assert.equal(playMode(game('ST-32', { mode: 'online' })), 'online');
  assert.equal(playMode(game('AV-EB-BAGGY', { mode: 'aventure' })), 'aventure');
  assert.equal(playMode(game('ST-32')), 'solo');
  assert.equal(playMode(game('ST-32', { mode: 'solo' })), 'solo');
});

test('mode : les anciennes parties d’aventure sont reconnues par leur deck adverse', () => {
  for (const ch of EAST_BLUE.chapters.filter((c) => c.opponent.deck.startsWith('AV-EB-'))) {
    assert.equal(playMode(game(ch.opponent.deck)), 'aventure', ch.id);
  }
  // une partie en ligne contre un deck d'aventure reste une partie en ligne
  assert.equal(playMode(game('AV-EB-SMOKER', { mode: 'online' })), 'online');
});

test('bilan de la partie rapide : seulement les parties terminées contre l’IA, hors entraînement', () => {
  assert.equal(inQuickRecord(game('ST-32')), true);
  assert.equal(inQuickRecord(game('ST-32', { status: 'lost' })), true);
  assert.equal(inQuickRecord(game('AV-EB-KURO')), false);
  assert.equal(inQuickRecord(game('ST-32', { mode: 'aventure' })), false);
  assert.equal(inQuickRecord(game('ST-32', { mode: 'online' })), false);
  assert.equal(inQuickRecord(game('ST-32', { practice: { from: null, turn: 3 } })), false);
  assert.equal(inQuickRecord(game('ST-32', { status: 'abandoned' })), false);
  assert.equal(inQuickRecord(game('ST-32', { status: 'playing' })), false);
});

test('enregistrement : le mode donné est gardé, absent il n’apparaît pas', () => {
  const initial = newGame({ decks: ['ST-01', 'ST-32'], names: ['Toi', 'IA'], seed: 3 });
  const input: RecordInput = {
    id: 'essai', engine: 'test', startedAt: '2026-10-26T10:00:00.000Z', now: '2026-10-26T10:05:00.000Z',
    config: { myDeck: 'ST-01', aiDeck: 'ST-32', level: 1, first: 'random' }, human: 0,
    initial, current: initial, moves: [], reviews: new Map(), extra: new Map(), undos: [],
  };
  const adventure = JSON.parse(JSON.stringify(buildRecord({ ...input, mode: 'aventure' }))) as GameSummary;
  assert.equal(adventure.mode, 'aventure');
  assert.equal(playMode(adventure), 'aventure');
  const free = JSON.parse(JSON.stringify(buildRecord(input))) as GameSummary;
  assert.equal('mode' in free, false);
  assert.equal(playMode(free), 'solo');
});
