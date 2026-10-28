// Decks de la Cale en ligne (server/game-online.js), sur une base temporaire : un deck d'aventure n'entre dans une
// partie que si son joueur possède encore toutes ses cartes (à la création de la salle, et pour l'hôte au moment où son
// ami le rejoint) ; la partie et ses enregistrements portent la marque « deck d'aventure »
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { DECKS } from '../engine/decks.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-en-ligne-'));
process.env.TCGC_DB = join(dir, 'essai.db');

// modules du serveur (JavaScript) : chemins dans des variables, comme dans decks-server.test.ts
const paths = { db: '../../server/db.js', decks: '../../server/game-decks.js', online: '../../server/game-online.js', records: '../../server/game-records.js' };
const { db } = await import(paths.db);
const decks = await import(paths.decks);
const online = await import(paths.online);
const records = await import(paths.records);
const { MatchError, play, viewOf } = await import('../online/match.ts');

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const A = { id: 1, pseudo: 'Luffy' };
const B = { id: 2, pseudo: 'Zoro' };
for (const u of [A, B]) {
  db.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(u.id, u.pseudo, `joueur${u.id}@example.invalid`, 'scrypt$essai', '2026-10-19T10:00:00Z');
}

const STARTER = DECKS['ST-01'];
const t0 = new Date('2026-10-21T18:00:00Z');
const later = (min: number) => new Date(t0.getTime() + min * 60_000);

// La Cale d'un compte : les cartes du deck de départ
function fillHold(userId: number) {
  const add = db.prepare(`INSERT INTO game_inventory (user_id, number, variant, count) VALUES (?, ?, 'base', ?)
    ON CONFLICT(user_id, number, variant) DO UPDATE SET count = count + excluded.count`);
  for (const [num, n] of [[STARTER.leader, 1], ...Object.entries(STARTER.cards)] as [string, number][]) add.run(userId, num, n);
}
// Nombre d'exemplaires d'une carte dans la Cale (0 : la carte n'y est plus)
function setCount(userId: number, num: string, n: number) {
  db.prepare("DELETE FROM game_inventory WHERE user_id = ? AND number = ? AND variant = 'base'").run(userId, num);
  if (n > 0) db.prepare("INSERT INTO game_inventory (user_id, number, variant, count) VALUES (?, ?, 'base', ?)").run(userId, num, n);
}

const refused = (fn: () => unknown, code: string, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof MatchError && e.code === code && (!re || re.test(e.message)));

fillHold(A.id);
fillHold(B.id);
const deckA = decks.saveDeck(A.id, 'PERSO-calea001', { name: 'Cale de Luffy', leader: STARTER.leader, cards: STARTER.cards, mode: 'aventure' });
const deckB = decks.saveDeck(B.id, 'PERSO-caleb001', { name: 'Cale de Zoro', leader: STARTER.leader, cards: STARTER.cards, mode: 'aventure' });
const freeA = decks.saveDeck(A.id, 'PERSO-librea01', { name: 'Libre', leader: STARTER.leader, cards: STARTER.cards });
const card = Object.keys(STARTER.cards)[0];

test('en ligne (serveur) : deux decks d’aventure complets, partie marquée et rangée avec la marque', () => {
  const room = online.openRoom(A, deckA.id, t0);
  assert.equal(room.host.hold, true);
  assert.equal(viewOf(room, 0).you.hold, true);
  const m = online.enterRoom(B, room.code.toLowerCase(), deckB.id, later(1));
  assert.equal(m.status, 'playing');
  assert.equal(viewOf(m, 1).you.hold, true);
  assert.equal(viewOf(m, 1).opponent!.hold, true);
  assert.equal(viewOf(m, 0).opponent!.deckName, 'Cale de Zoro');
  // quelques coups, puis abandon : la partie est rangée dans « Mes parties » des deux joueurs avec la marque
  for (let i = 0; i < 5 && m.status === 'playing'; i++) {
    const d = m.state.decision;
    play(m, d.player, m.state.history.length, heuristicChooser(m.state, d), later(2));
  }
  online.giveUp(B, m.id, () => {}, later(3));
  const summary = (userId: number) => JSON.parse(records.recordSummariesJson(userId)).find((r: { startedAt: string }) => r.startedAt === m.startedAt);
  assert.equal(summary(A.id).status, 'won');
  assert.equal(summary(A.id).holdDeck, true);
  assert.equal(summary(A.id).opponentHoldDeck, true);
  assert.equal(summary(B.id).status, 'lost');
  assert.equal(summary(B.id).holdDeck, true);
});

test('en ligne (serveur) : un deck d’aventure auquel il manque des cartes est refusé, avec un message clair', () => {
  setCount(A.id, card, 1);  // échangées contre des Berry, par exemple
  refused(() => online.openRoom(A, deckA.id, later(10)), 'hold_incomplete', new RegExp(`Cale de Luffy.*${card}.*${STARTER.cards[card]} dans le deck, 1 dans ta Cale.*Mes decks`));
  // un deck libre aux mêmes cartes reste permis
  const room = online.openRoom(A, freeA.id, later(10));
  assert.equal(room.host.hold, undefined);
  // l'invité à qui il manque des cartes ne rejoint pas, la salle reste ouverte
  refused(() => online.enterRoom(A, room.code, freeA.id, later(11)), 'own_room');
  setCount(B.id, STARTER.leader, 0);
  refused(() => online.enterRoom(B, room.code, deckB.id, later(11)), 'hold_incomplete', /absente de ta Cale/);
  assert.equal(online.enterRoom(B, room.code, 'ST-35', later(12)).status, 'playing');
  setCount(A.id, card, STARTER.cards[card]);
  setCount(B.id, STARTER.leader, 1);
});

test('en ligne (serveur) : l’hôte qui échange des cartes de son deck d’aventure avant l’arrivée de son ami ferme sa salle', () => {
  const room = online.openRoom(A, deckA.id, later(20));
  setCount(A.id, card, 0);
  refused(() => online.enterRoom(B, room.code, 'ST-35', later(21)), 'host_hold_incomplete', /Luffy n'a plus toutes les cartes de son deck d'aventure \(.*absente de sa Cale\).*fermée/);
  const row = db.prepare('SELECT status, code FROM game_matches WHERE id = ?').get(room.id);
  assert.deepEqual({ ...row }, { status: 'cancelled', code: null });
  refused(() => online.enterRoom(B, room.code, 'ST-35', later(22)), 'unknown_room');
  setCount(A.id, card, STARTER.cards[card]);
});

test('en ligne (serveur) : un deck d’un autre compte ou un adversaire de l’aventure restent refusés', () => {
  refused(() => online.openRoom(B, deckA.id, later(30)), 'invalid_deck');
  const adversary = Object.keys(DECKS).find((id) => DECKS[id].series === 'AVENTURE')!;
  refused(() => online.openRoom(A, adversary, later(30)), 'invalid_deck');
});

test('en ligne (serveur) : partie avec un seul deck d’aventure : seul son joueur a la marque', () => {
  const room = online.openRoom(A, deckA.id, later(40));
  const m = online.enterRoom(B, room.code, 'ST-35', later(41));
  online.giveUp(A, m.id, () => {}, later(42));
  const summary = (userId: number) => JSON.parse(records.recordSummariesJson(userId)).find((r: { startedAt: string }) => r.startedAt === m.startedAt);
  assert.equal(summary(A.id).holdDeck, true);
  assert.equal(summary(A.id).opponentHoldDeck, undefined);
  assert.equal(summary(B.id).holdDeck, undefined);
  assert.equal(summary(B.id).opponentHoldDeck, true);
});

test('en ligne (serveur) : les visuels choisis d’un deck arrivent chez l’adversaire sans trahir la liste, et restent avec la partie', () => {
  db.prepare("INSERT OR IGNORE INTO sets (group_id, name) VALUES (1, 'ST-01: Starter Deck 1')").run();
  db.prepare("INSERT OR IGNORE INTO cards (product_id, group_id, name, full_name, number) VALUES (498519, 1, 'DON!! Card', 'DON!! Card (Alternate Art)', 'DON!!')").run();
  // ST01-012 en carte SP (version des boosters d'OP03), DON!! « Alternate Art »
  const looks = { arts: { 'ST01-012': 'sp' }, don: '498519' };
  const styled = decks.saveDeck(A.id, 'PERSO-visuel01', { name: 'Libre stylé', leader: STARTER.leader, cards: STARTER.cards, looks });
  assert.deepEqual(styled.looks, looks);
  const room = online.openRoom(A, styled.id, later(50));
  assert.equal(room.host.list.looks, undefined, 'la liste jouée par le moteur n’a pas de visuels');
  assert.deepEqual(room.host.looks, looks);
  const m = online.enterRoom(B, room.code, 'ST-35', later(51));
  // l'hôte voit ses visuels ; l'invité voit la DON!!, et la carte SP seulement quand elle est visible
  assert.deepEqual(viewOf(m, 0).looks, { 0: looks });
  const seen = viewOf(m, 1).looks?.[0];
  assert.equal(seen?.don, '498519');
  const visible = JSON.stringify(viewOf(m, 1).state).includes('"num":"ST01-012"');
  assert.deepEqual(seen?.arts ?? {}, visible ? { 'ST01-012': 'sp' } : {});
  online.giveUp(B, m.id, () => {}, later(52));
  // la partie rangée garde les visuels des deux joueurs (elle contient déjà les deux decks)
  const record = (userId: number) => {
    const s = JSON.parse(records.recordSummariesJson(userId)).find((r: { startedAt: string }) => r.startedAt === m.startedAt);
    return s.looks;
  };
  assert.deepEqual(record(A.id), { 0: looks });
  assert.deepEqual(record(B.id), { 0: looks });
});
