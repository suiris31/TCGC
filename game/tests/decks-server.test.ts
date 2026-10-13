// Decks personnalisés gardés par le serveur (server/game-decks.js), sur une base temporaire : chaque compte ne voit et
// ne joue que ses propres decks
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DECKS } from '../engine/decks.ts';

test('serveur : créer, modifier, lister et supprimer ses decks ; ceux des autres restent invisibles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tcgc-decks-'));
  process.env.TCGC_DB = join(dir, 'essai.db');
  const dbModule = '../../server/db.js';
  const decksModule = '../../server/game-decks.js';
  const { db } = await import(dbModule);
  const server = await import(decksModule);
  try {
    const st31 = DECKS['ST-31'];
    const saved = server.saveDeck(1, 'PERSO-abc123', { name: '  Mon Luffy  ', leader: st31.leader, cards: { ...st31.cards, 'OP01-016': 0 } }, new Date('2026-10-13T10:00:00Z'));
    assert.equal(saved.name, 'Mon Luffy');
    assert.equal(saved.series, 'PERSO');
    assert.equal(saved.cards['OP01-016'], undefined, 'quantité 0 retirée');
    // brouillon incomplet : enregistrable
    server.saveDeck(1, 'PERSO-def456', { name: 'Brouillon', leader: 'OP15-058', cards: {} }, new Date('2026-10-13T11:00:00Z'));
    assert.deepEqual(server.listDecks(1).map((d: { id: string }) => d.id), ['PERSO-def456', 'PERSO-abc123'], 'le plus récent d’abord');
    server.saveDeck(1, 'PERSO-abc123', { name: 'Luffy 2', leader: st31.leader, cards: st31.cards }, new Date('2026-10-13T12:00:00Z'));
    assert.equal(server.deckOf(1, 'PERSO-abc123').name, 'Luffy 2');
    // un autre compte ne voit rien
    assert.deepEqual(server.listDecks(2), []);
    assert.equal(server.deckOf(2, 'PERSO-abc123'), null);
    assert.equal(server.deleteDeck(2, 'PERSO-abc123'), false);
    // contenus refusés
    const bad = (id: string, body: unknown, re: RegExp) => assert.throws(() => server.saveDeck(1, id, body), re);
    bad('../x', { name: 'x', leader: st31.leader, cards: {} }, /Identifiant/);
    bad('PERSO-ghi789', { name: ' ', leader: st31.leader, cards: {} }, /nom/);
    bad('PERSO-ghi789', { name: 'x', leader: 'OP01-016', cards: {} }, /pas un Leader/);
    bad('PERSO-ghi789', { name: 'x', leader: st31.leader, cards: { 'OP01-016': 2.5 } }, /invalide/);
    bad('PERSO-ghi789', { name: 'x', leader: st31.leader, cards: { 'DROP TABLE': 1 } }, /invalide/);
    bad('PERSO-ghi789', { name: 'x', leader: st31.leader, cards: { 'OP01-016': 50, 'OP04-016': 50 } }, /Trop/);
    assert.equal(server.deleteDeck(1, 'PERSO-def456'), true);
    assert.equal(server.listDecks(1).length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
