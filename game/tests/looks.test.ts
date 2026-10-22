// Visuels d'un deck (tâche R3.11) : versions des cartes dans le catalogue, migration d'une ancienne base, DON!!
// proposées, forme stockée des visuels et visuels montrés à l'adversaire
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { buildCatalog, cardVersions, variantOf, type Printing } from '../data/catalog.ts';
import { compactLooks, knownVersion, parseLooks, shownNumbers, visibleLooks } from '../data/looks.ts';

// ---------- Ancienne base (préparée avant tout test : les modules du serveur l'ouvrent à leur chargement) ----------

const dir = mkdtempSync(join(tmpdir(), 'tcgc-looks-'));
const file = join(dir, 'ancienne.db');
{
  // base d'avant la tâche : game_decks sans looks (ni mode), un deck enregistré
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE game_decks (user_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, leader TEXT NOT NULL,
    cards TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, id))`);
  old.prepare('INSERT INTO game_decks VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'PERSO-ancien1', 'Ancien', 'ST01-001', '{"ST01-002":4}', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
  old.close();
}
process.env.TCGC_DB = file;
const { db } = await import('../../server/db.js' as string);
const decks = await import('../../server/game-decks.js' as string);
const don = await import('../../server/game-don.js' as string);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// ---------- Versions du catalogue ----------

const printing = (lang: 'fr' | 'en', imageId: string, series: string, rarity = 'SR'): Printing => ({
  lang, imageId, number: imageId.split('_')[0], series, rarity, category: 'CHARACTER', name: 'Essai', cost: 3, life: null,
  power: 5000, counter: 1000, colors: ['Red'], types: ['Straw Hat Crew'], attributes: ['Strike'], effect: '', trigger: null, block: '1',
});

test('catalogue : les versions des boosters gardent le nom de la Cale, les autres ont genre, langue et suffixe', () => {
  assert.equal(variantOf(printing('en', 'OP03-001_p1', 'OP-03', 'L')), 'parallele');
  assert.equal(variantOf(printing('en', 'OP03-122_p2', 'OP-03', 'SEC')), 'manga');
  assert.equal(variantOf(printing('en', 'ST01-012_p1', 'OP-03', 'SP CARD')), 'sp');
  // même suffixe en VF : un autre visuel, un autre nom
  assert.equal(variantOf(printing('fr', 'OP03-001_p1', 'OP-03', 'L')), 'parallele-fr-p1');
  assert.equal(variantOf(printing('en', 'OP05-119_p6', 'OP-09', 'SP CARD')), 'sp-en-p6');
  assert.equal(variantOf(printing('en', 'OP05-119_r1', 'PRB-01', 'SEC')), 'reedition-en-r1');
  assert.equal(variantOf(printing('en', 'OP01-120_p5', 'PRB-01', 'TR')), 'tr-en-p5');
  assert.equal(variantOf(printing('en', 'OP05-119', 'OP-05', 'SEC')), 'normale-en');
});

test('catalogue : versions d’une carte, la base d’abord, sans doublon, l’illustration normale gardée quand la base est une parallèle', () => {
  const list = [
    printing('en', 'OP05-119', 'OP-05'), printing('en', 'OP05-119_p1', 'OP-05'), printing('en', 'OP05-119_p1', 'PRB-01'),
    printing('en', 'OP05-119_r1', 'PRB-01'), printing('fr', 'OP05-119_p2', 'OP-11', 'SP CARD'), printing('fr', 'OP05-119_p1', 'OP-09', 'SP CARD'),
  ];
  const versions = cardVersions({ imageId: 'OP05-119_p1', lang: 'fr' }, list);
  assert.deepEqual(versions.map((v) => `${v.variant}:${v.lang}:${v.imageId}`), [
    'base:fr:OP05-119_p1', 'sp-fr-p2:fr:OP05-119_p2', 'normale-en:en:OP05-119', 'parallele-en-p1:en:OP05-119_p1', 'reedition-en-r1:en:OP05-119_r1',
  ]);
  // base normale : son impression dans l'autre langue n'est pas répétée
  const plain = cardVersions({ imageId: 'OP05-119', lang: 'fr' }, [printing('fr', 'OP05-119', 'OP-05'), ...list]);
  assert.equal(plain.filter((v) => !/_/.test(v.imageId)).length, 1);
  // une nouvelle impression ne renomme pas les autres
  const more = cardVersions({ imageId: 'OP05-119_p1', lang: 'fr' }, [printing('en', 'OP05-119_p9', 'OP-20'), ...list]);
  for (const v of versions) assert.ok(more.some((x) => x.variant === v.variant && x.imageId === v.imageId && x.lang === v.lang));
});

test('catalogue : une carte sans autre impression n’a pas de champ versions', () => {
  const cards = buildCatalog([printing('en', 'OP03-001', 'OP-03', 'L'), printing('en', 'OP03-001_p1', 'OP-03', 'L'), printing('en', 'OP03-002', 'OP-03', 'UC')]);
  assert.deepEqual(cards['OP03-001'].versions?.map((v) => v.variant), ['base', 'parallele']);
  assert.equal(cards['OP03-002'].versions, undefined);
  assert.ok(knownVersion(cards['OP03-001'], 'OP03-001', 'parallele'));
  assert.ok(!knownVersion(cards['OP03-002'], 'OP03-002', 'parallele'));
  // une version gagnée dans un booster reste connue même si le catalogue ne la donne pas
  assert.ok(knownVersion(undefined, 'OP03-122', 'manga'));
});

// ---------- Forme des visuels ----------

test('visuels : forme stockée sans choix par défaut, lecture tolérante', () => {
  assert.deepEqual(compactLooks({ arts: { 'OP03-002': 'base', 'OP03-001': 'parallele' }, don: undefined }), { arts: { 'OP03-001': 'parallele' } });
  assert.deepEqual(parseLooks('{}'), {});
  assert.deepEqual(parseLooks('pas du JSON'), {});
  assert.deepEqual(parseLooks('{"arts":{"OP03-001":"parallele","OP03-002":7},"don":"434340"}'), { arts: { 'OP03-001': 'parallele' }, don: '434340' });
});

test('visuels : l’adversaire ne reçoit que la DON!! et la version des cartes qu’il voit', () => {
  const looks = { arts: { 'OP03-001': 'parallele', 'OP03-122': 'manga' }, don: '498519' };
  const shown = shownNumbers({ players: [{ leader: { uid: 1, num: 'OP03-001' }, hand: [{ uid: 2, num: '?' }] }] });
  assert.deepEqual([...shown].sort(), ['?', 'OP03-001']);
  assert.deepEqual(visibleLooks(looks, shown), { arts: { 'OP03-001': 'parallele' }, don: '498519' });
  assert.deepEqual(visibleLooks({ arts: { 'OP03-122': 'manga' } }, shown), {});
  assert.equal(visibleLooks(undefined, shown), undefined);
});

// ---------- Migration et DON!! ----------

test('migration : une ancienne base démarre, garde ses decks, chacun sans visuel choisi', () => {
  const columns = db.prepare('PRAGMA table_info(game_decks)').all().map((c: { name: string }) => c.name);
  assert.ok(columns.includes('looks'));
  const row = db.prepare('SELECT * FROM game_decks').get();
  assert.equal(row.looks, '{}');
  assert.equal(row.mode, 'libre');
  const [deck] = decks.listDecks(1);
  assert.deepEqual({ id: deck.id, name: deck.name, cards: deck.cards, looks: deck.looks }, { id: 'PERSO-ancien1', name: 'Ancien', cards: { 'ST01-002': 4 }, looks: {} });
});

test('DON!! : la standard d’abord, un visuel par groupe, les « Alternate Art » séparées par extension', () => {
  const set = db.prepare('INSERT INTO sets (group_id, name) VALUES (?, ?)');
  set.run(1, 'ST-01: Starter Deck 1');
  set.run(2, 'ST-10: Ultra Deck');
  set.run(3, 'Pillars of Strength');
  set.run(4, 'Kingdoms of Intrigue');
  set.run(5, 'Premium Booster -The Best-');
  set.run(6, 'Premium Booster -The Best- Vol. 2');
  set.run(7, 'One Piece Promotion Cards');
  const card = db.prepare("INSERT INTO cards (product_id, group_id, name, full_name, number) VALUES (?, ?, ?, ?, 'DON!!')");
  card.run(498519, 3, 'DON!! Card', 'DON!! Card (Alternate Art)');
  card.run(517476, 4, 'DON!! Card', 'DON!! Card (Alternate Art)');
  card.run(527633, 2, 'DON!! Card', 'DON!! Card');
  card.run(434340, 1, 'DON!! Card', 'DON!! Card');
  card.run(600001, 5, 'DON!! Card', 'DON!! Card (Yamato) (Gold)');
  card.run(600002, 6, 'DON!! Card', 'DON!! Card (Yamato) (Gold)');
  card.run(600003, 7, 'DON!! Card // Green Compass', 'DON!! Card // Green Compass');
  card.run(518691, 7, 'Monkey.D.Luffy', 'Monkey.D.Luffy (Leader Pack) (Sealed Battle 2023 Vol. 1)');   // rangée par erreur en DON!!
  const list = don.allDons();
  assert.deepEqual(list, [
    { id: '434340', label: 'DON!! standard', imageUrl: 'img/434340.jpg' },
    { id: '498519', label: 'Illustration alternative · Pillars of Strength', imageUrl: 'img/498519.jpg' },
    { id: '517476', label: 'Illustration alternative · Kingdoms of Intrigue', imageUrl: 'img/517476.jpg' },
    { id: '600001', label: 'Yamato · dorée', imageUrl: 'img/600001.jpg' },
    { id: '600003', label: 'Green Compass', imageUrl: 'img/600003.jpg' },
  ]);
  assert.ok(don.isKnownDon('498519'));
  assert.ok(!don.isKnownDon('527633'), 'seul le premier produit d’un groupe sert d’identifiant');
  assert.ok(!don.isKnownDon('518691'));
  assert.ok(!don.isKnownDon('1; DROP TABLE cards'));
});
