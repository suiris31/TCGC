// Decks personnalisés gardés par le serveur (server/game-decks.js), sur une base temporaire : chaque compte ne voit et
// ne joue que ses propres decks ; leurs visuels (version des cartes, DON!!) sont gardés et vérifiés
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-decks-'));
process.env.TCGC_DB = join(dir, 'essai.db');
const dbModule = '../../server/db.js';
const decksModule = '../../server/game-decks.js';
const { db } = await import(dbModule);
const server = await import(decksModule);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('serveur : créer, modifier, lister et supprimer ses decks ; ceux des autres restent invisibles', () => {
  {
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
  }
});

// Refus attendu : code et statut documentés (01-contrats.md, § 14.5)
const refused = (fn: () => unknown, code: string, status = 400) =>
  assert.throws(fn, (e: { code?: string; status?: number }) => e.code === code && e.status === status);

test('serveur : visuels d’un deck libre, relus à l’identique, gardés sans looks, valeurs inconnues refusées', () => {
  const st01 = DECKS['ST-01'];
  const card = Object.keys(st01.cards)[0];
  // versions connues du catalogue pour cette carte (le test ne dépend pas du catalogue téléchargé)
  CARDS[card].versions = [{ variant: 'base', imageId: card, lang: 'en' }, { variant: 'parallele-en-p1', imageId: `${card}_p1`, lang: 'en' }];
  db.prepare("INSERT INTO sets (group_id, name) VALUES (1, 'ST-01: Starter Deck 1')").run();
  db.prepare("INSERT INTO cards (product_id, group_id, name, full_name, number) VALUES (434340, 1, 'DON!! Card', 'DON!! Card', 'DON!!')").run();
  db.prepare("INSERT INTO cards (product_id, group_id, name, full_name, number) VALUES (498519, 1, 'DON!! Card', 'DON!! Card (Alternate Art)', 'DON!!')").run();
  const looks = { arts: { [card]: 'parallele-en-p1', [st01.leader]: 'base' }, don: '498519' };
  const saved = server.saveDeck(3, 'PERSO-vis001', { name: 'Visuels', leader: st01.leader, cards: st01.cards, looks });
  assert.deepEqual(saved.looks, { arts: { [card]: 'parallele-en-p1' }, don: '498519' }, 'la version de base n’est pas gardée');
  assert.deepEqual(server.listDecks(3)[0].looks, saved.looks, 'relu à l’identique');
  // l'éditeur d'aujourd'hui n'envoie pas looks : le deck garde ses visuels
  assert.deepEqual(server.saveDeck(3, 'PERSO-vis001', { name: 'Visuels 2', leader: st01.leader, cards: st01.cards }).looks, saved.looks);
  // carte retirée du deck : son visuel disparaît sans refus
  const { [card]: _, ...rest } = st01.cards;
  assert.deepEqual(server.saveDeck(3, 'PERSO-vis001', { name: 'Visuels', leader: st01.leader, cards: rest }).looks, { don: '498519' });
  // retour aux visuels de base
  assert.deepEqual(server.saveDeck(3, 'PERSO-vis001', { name: 'Visuels', leader: st01.leader, cards: st01.cards, looks: {} }).looks, {});
  // valeurs refusées
  const body = (l: unknown) => ({ name: 'x', leader: st01.leader, cards: st01.cards, looks: l });
  refused(() => server.saveDeck(3, 'PERSO-vis001', body({ arts: { [card]: 'parallele-en-p9' } })), 'unknown_version');
  refused(() => server.saveDeck(3, 'PERSO-vis001', body({ don: '999999' })), 'unknown_don');
  refused(() => server.saveDeck(3, 'PERSO-vis001', body({ arts: { [card]: '<script>' } })), 'invalid_looks');
  refused(() => server.saveDeck(3, 'PERSO-vis001', body('parallele')), 'invalid_looks');
  refused(() => server.saveDeck(3, 'PERSO-vis001', body({ arts: [] })), 'invalid_looks');
  // un ancien deck sans visuels : visuels de base et DON!! standard
  db.prepare("UPDATE game_decks SET looks = '{}' WHERE id = 'PERSO-vis001'").run();
  assert.deepEqual(server.deckOf(3, 'PERSO-vis001').looks, {});
});

test('serveur : un deck d’aventure ne montre que les versions de sa Cale ; la DON!! reste libre', () => {
  const st01 = DECKS['ST-01'];
  const add = db.prepare(`INSERT INTO game_inventory (user_id, number, variant, count) VALUES (4, ?, ?, ?)
    ON CONFLICT(user_id, number, variant) DO UPDATE SET count = count + excluded.count`);
  for (const [num, n] of [[st01.leader, 1], ...Object.entries(st01.cards)] as [string, number][]) add.run(num, 'base', n);
  // ST01-012 en carte SP (version des boosters d'OP03), présente dans la Cale ; aucune parallèle d'une autre carte
  const sp = 'ST01-012';
  assert.ok(st01.cards[sp], 'ST01-012 est dans ST-01');
  add.run(sp, 'sp', 1);
  const other = Object.keys(st01.cards).find((n) => n !== sp)!;
  CARDS[other].versions = [{ variant: 'base', imageId: other, lang: 'en' }, { variant: 'parallele-en-p1', imageId: `${other}_p1`, lang: 'en' }];
  const deck = { name: 'Cale', leader: st01.leader, cards: st01.cards, mode: 'aventure' };
  const saved = server.saveDeck(4, 'PERSO-cale01', { ...deck, looks: { arts: { [sp]: 'sp' }, don: '498519' } });
  assert.deepEqual(saved.looks, { arts: { [sp]: 'sp' }, don: '498519' });
  refused(() => server.saveDeck(4, 'PERSO-cale01', { ...deck, looks: { arts: { [other]: 'parallele-en-p1' } } }), 'version_not_in_hold', 409);
  // la carte SP échangée depuis : le deck reste jouable, avec la version de base (visuel retiré à la lecture)
  db.prepare("DELETE FROM game_inventory WHERE user_id = 4 AND number = ? AND variant = 'sp'").run(sp);
  assert.deepEqual(server.listDecks(4)[0].looks, { don: '498519' });
  assert.deepEqual(server.deckLooks(4, server.deckOf(4, 'PERSO-cale01')), { don: '498519' });
  // un enregistrement sans looks ne fait pas refuser le deck
  assert.deepEqual(server.saveDeck(4, 'PERSO-cale01', deck).looks, { don: '498519' });
});
