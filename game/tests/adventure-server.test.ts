// Mode Aventure côté serveur (server/game-adventure.js), sur une base temporaire : départ donné une seule fois, victoire
// vérifiée en rejouant la partie enregistrée, refus (partie perdue, mauvais deck, mauvais niveau, partie truquée ou d'un
// autre compte), double envoi, boosters ouverts une seule fois, deck d'aventure limité à la Cale, suppression du compte
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import { BOOSTER_SIZE } from '../boosters/open.ts';
import type { GameConfig, GameRecord } from '../coach/archive.ts';
import type { GameStats } from '../coach/review.ts';
import { DECKS, type DeckList } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import type { GameState, PlayerId } from '../engine/types.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-aventure-'));
process.env.TCGC_DB = join(dir, 'essai.db');

// Base d'avant l'aventure : un deck personnalisé, sans la colonne mode
const OLD_DECK = 'PERSO-ancien1';
{
  const old = new DatabaseSync(process.env.TCGC_DB);
  old.exec(`CREATE TABLE game_decks (user_id INTEGER NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, leader TEXT NOT NULL,
    cards TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, id))`);
  old.prepare('INSERT INTO game_decks VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(1, OLD_DECK, 'Ancien deck', DECKS['ST-31'].leader, JSON.stringify(DECKS['ST-31'].cards), '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
  old.close();
}

// modules du serveur (JavaScript) : chemins dans des variables, comme dans decks-server.test.ts
const paths = { db: '../../server/db.js', auth: '../../server/auth.js', decks: '../../server/game-decks.js', records: '../../server/game-records.js', adventure: '../../server/game-adventure.js' };
const { db } = await import(paths.db);
const auth = await import(paths.auth);
const decks = await import(paths.decks);
const records = await import(paths.records);
const adv = await import(paths.adventure);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const A = 1;
const B = 2;
for (const id of [A, B]) {
  db.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `joueur${id}`, `joueur${id}@example.invalid`, 'scrypt$essai', '2026-10-19T10:00:00Z');
}

const HUMAN: PlayerId = 0;
const ARC = EAST_BLUE;
const ordered = [...ARC.chapters].sort((a, b) => a.order - b.order).filter((c) => !c.optional);
const [C1, C2] = ordered;
const STARTER = DECKS[ARC.starterDeck!];
const OTHER = Object.keys(DECKS).find((id) => id !== C1.opponent.deck && id !== STARTER.id)!;

// Tirage reproductible (mulberry32) pour ouvrir les boosters dans les tests
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Game { initial: GameState; final: GameState }

// Partie complète jouée par l'IA heuristique des deux côtés (déterministe pour une graine donnée)
function play(mine: DeckList | string, ai: string, seed: number): Game {
  const start = newGame({ decks: [mine, ai], names: ['Toi', 'IA'], seed, first: 'random' });
  const initial = JSON.parse(JSON.stringify(start)) as GameState;
  let s = start;
  while (s.winner === null) s = act(s, heuristicChooser(s, s.decision!));
  return { initial, final: s };
}

// Première partie gagnée (ou perdue) par le joueur à partir de la graine `from`
function find(mine: DeckList | string, ai: string, won: boolean, from = 1): Game {
  for (let seed = from; seed < from + 80; seed++) {
    const g = play(mine, ai, seed);
    if ((g.final.winner === HUMAN) === won) return g;
  }
  throw new Error(`aucune partie ${won ? 'gagnée' : 'perdue'} trouvée`);
}

let count = 0;
function makeRecord(g: Game, config: Partial<GameConfig>, extra: Partial<GameRecord> = {}): GameRecord {
  const id = `2026-10-19_12-00-${String(count++).padStart(2, '0')}_essai-aventure`;
  return {
    format: 1, id, engine: 'essai', startedAt: '2026-10-19T12:00:00.000Z', updatedAt: '2026-10-19T12:30:00.000Z',
    endedAt: '2026-10-19T12:30:00.000Z', status: g.final.winner === HUMAN ? 'won' : 'lost', turns: g.final.turn,
    config: { myDeck: '', aiDeck: C1.opponent.deck, level: C1.opponent.level, first: 'random', ...config },
    human: HUMAN, wentFirst: g.initial.first === HUMAN, initial: g.initial, steps: g.final.history.slice(g.initial.history.length),
    decisions: [], reviews: [], undos: [], stats: {} as GameStats, log: [], ...extra,
  };
}

// Enregistre la partie dans le compte (comme PUT /api/game/records/:id) et renvoie son identifiant
function store(userId: number, rec: GameRecord): string {
  records.saveRecord(userId, rec.id, rec, JSON.stringify(rec));
  return rec.id;
}

const holdOf = (userId: number): Record<string, number> => decks.holdCounts(userId);
const starterCounts = () => ({ [STARTER.leader]: 1, ...STARTER.cards });
const rewardBoosters = (c: typeof C1) => c.rewards.reduce((n, r) => n + (r.kind === 'booster' ? r.count : 0), 0);
const rows = (table: string, userId: number) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;

let deckId = '';
let myDeck: DeckList & { mode: string };

test('aventure (serveur) : une base d’avant l’aventure démarre, ses decks passent en mode libre', () => {
  const [old] = decks.listDecks(1);
  assert.equal(old.id, OLD_DECK);
  assert.equal(old.mode, 'libre');
  for (const table of ['game_inventory', 'game_boosters', 'game_progress', 'game_adventure', 'game_adventure_results']) {
    assert.equal(rows(table, A), 0, table);
  }
});

test('aventure (serveur) : départ une seule fois, deck de départ dans la Cale, deck d’aventure créé et choisi', () => {
  const before = adv.adventureState(A);
  assert.deepEqual(before.arcs[ARC.id], { started: false });
  assert.equal(before.deckId, null);
  assert.deepEqual(before.boosters, []);
  assert.deepEqual(before.chapters[C1.id], { wins: 0, firstWinAt: null });
  assert.equal(Object.keys(before.chapters).length, ARC.chapters.length);
  assert.throws(() => adv.chooseDeck(A, OLD_DECK), /Commence d'abord/);
  assert.throws(() => adv.startArc(A, 'mer-inconnue'), /Arc inconnu/);

  const state = adv.startArc(A, ARC.id, new Date('2026-10-19T11:00:00Z'));
  assert.deepEqual(state.arcs[ARC.id], { started: true });
  assert.match(state.deckId, /^PERSO-[a-z0-9]{12}$/);
  deckId = state.deckId;
  myDeck = decks.deckOf(A, deckId);
  assert.equal(myDeck.mode, 'aventure');
  assert.equal(myDeck.leader, STARTER.leader);
  assert.deepEqual(myDeck.cards, STARTER.cards);
  assert.deepEqual(holdOf(A), starterCounts());
  assert.deepEqual(adv.inventory(A).cards.find((c: { number: string }) => c.number === STARTER.leader), { number: STARTER.leader, variant: 'base', count: 1 });

  // une deuxième demande ne donne rien de plus
  const again = adv.startArc(A, ARC.id);
  assert.equal(again.deckId, deckId);
  assert.deepEqual(holdOf(A), starterCounts());
  assert.equal(decks.listDecks(A).length, 2);
});

test('aventure (serveur) : un deck d’aventure ne prend que des cartes de la Cale', () => {
  // même Leader que le deck de départ, autres cartes (celles de ST-21, absentes de la Cale)
  const other = { leader: STARTER.leader, cards: DECKS['ST-21'].cards };
  assert.ok(Object.keys(other.cards).every((n) => !STARTER.cards[n]));
  assert.throws(() => decks.saveDeck(A, 'PERSO-avessai1', { name: 'x', leader: other.leader, cards: other.cards, mode: 'aventure' }), /Cale/);
  const card = Object.keys(STARTER.cards).find((n) => STARTER.cards[n] === 4)!;
  assert.throws(() => decks.saveDeck(A, 'PERSO-avessai1', { name: 'x', leader: STARTER.leader, cards: { [card]: 5 }, mode: 'aventure' }), /5 dans le deck, 4 dans ta Cale/);
  // jamais plus de 4 exemplaires, même avec plus de cartes dans la Cale
  db.prepare("INSERT INTO game_inventory (user_id, number, variant, count) VALUES (?, ?, 'parallele', 2)").run(A, card);
  assert.throws(() => decks.saveDeck(A, 'PERSO-avessai1', { name: 'x', leader: STARTER.leader, cards: { [card]: 5 }, mode: 'aventure' }), /4 exemplaires au plus/);
  db.prepare("DELETE FROM game_inventory WHERE user_id = ? AND variant = 'parallele'").run(A);
  assert.throws(() => decks.saveDeck(A, 'PERSO-avessai1', { name: 'x', leader: STARTER.leader, cards: {}, mode: 'inconnu' }), /Mode/);
  // brouillon d'aventure (cartes possédées) : enregistrable, mais pas choisi comme deck d'aventure
  const draft = decks.saveDeck(A, 'PERSO-avessai1', { name: 'Brouillon', leader: STARTER.leader, cards: { [card]: 4 }, mode: 'aventure' });
  assert.equal(draft.mode, 'aventure');
  assert.throws(() => adv.chooseDeck(A, draft.id), /ne peut pas servir/);
  // modifié sans préciser le mode : il reste en mode aventure ; changer de mode est refusé
  assert.equal(decks.saveDeck(A, draft.id, { name: 'Brouillon 2', leader: STARTER.leader, cards: { [card]: 3 } }).mode, 'aventure');
  assert.throws(() => decks.saveDeck(A, draft.id, { name: 'x', leader: STARTER.leader, cards: {}, mode: 'libre' }), /ne change pas de mode/);
  // deck libre : toutes les cartes, mais pas comme deck d'aventure
  const free = decks.saveDeck(A, 'PERSO-libre001', { name: 'Libre', leader: other.leader, cards: other.cards });
  assert.equal(free.mode, 'libre');
  assert.throws(() => decks.saveDeck(A, free.id, { name: 'x', leader: other.leader, cards: other.cards, mode: 'aventure' }), /ne change pas de mode/);
  assert.throws(() => adv.chooseDeck(A, free.id), /pas un deck d'aventure/);
  assert.throws(() => adv.chooseDeck(A, 'PERSO-inconnu1'), /introuvable/);
  assert.throws(() => adv.chooseDeck(B, deckId), /Commence d'abord/);
  assert.equal(adv.chooseDeck(A, deckId).deckId, deckId);
  decks.deleteDeck(A, draft.id);
  decks.deleteDeck(A, free.id);
});

test('aventure (serveur) : victoire vérifiée en rejouant la partie, récompenses à la première victoire seulement', () => {
  const won = makeRecord(find(myDeck, C1.opponent.deck, true), { myDeck: deckId });
  // chapitre suivant encore fermé
  const ahead = makeRecord(find(myDeck, C2.opponent.deck, true), { myDeck: deckId, aiDeck: C2.opponent.deck, level: C2.opponent.level });
  store(A, ahead);
  assert.throws(() => adv.chapterResult(A, C2.id, ahead.id), /pas encore ouvert/);

  const first = adv.chapterResult(A, C1.id, store(A, won), new Date('2026-10-19T12:31:00Z'));
  assert.equal(first.won, true);
  assert.equal(first.firstWin, true);
  assert.deepEqual(first.rewards, C1.rewards);
  assert.equal(first.boosters.length, rewardBoosters(C1));
  assert.ok(first.boosters.length > 0);
  for (const b of first.boosters) {
    assert.equal(b.set, ARC.boosterSet);
    assert.equal(b.source, `chapitre ${C1.id}`);
    assert.equal(b.createdAt, '2026-10-19T12:31:00.000Z');
  }
  let state = adv.adventureState(A);
  assert.deepEqual(state.chapters[C1.id], { wins: 1, firstWinAt: '2026-10-19T12:31:00.000Z' });
  assert.deepEqual(state.boosters, first.boosters);

  // la même partie renvoyée : rien de plus
  assert.deepEqual(adv.chapterResult(A, C1.id, won.id), { won: true, firstWin: false, rewards: [], boosters: [] });
  assert.equal(adv.adventureState(A).chapters[C1.id].wins, 1);
  assert.throws(() => adv.chapterResult(A, C2.id, won.id), /déjà compté/);

  // une autre victoire : comptée, sans nouvelles récompenses
  const second = makeRecord(find(myDeck, C1.opponent.deck, true, 200), { myDeck: deckId });
  assert.deepEqual(adv.chapterResult(A, C1.id, store(A, second)), { won: true, firstWin: false, rewards: [], boosters: [] });
  // une défaite : rien
  const lost = makeRecord(find(myDeck, C1.opponent.deck, false), { myDeck: deckId });
  assert.deepEqual(adv.chapterResult(A, C1.id, store(A, lost)), { won: false, firstWin: false, rewards: [], boosters: [] });
  state = adv.adventureState(A);
  assert.equal(state.chapters[C1.id].wins, 2);
  assert.equal(state.boosters.length, rewardBoosters(C1));
  // le chapitre suivant est maintenant ouvert
  assert.equal(adv.chapterResult(A, C2.id, ahead.id).firstWin, true);
});

test('aventure (serveur) : refus d’une partie qui ne compte pas pour le chapitre', () => {
  const g = find(myDeck, C1.opponent.deck, true, 300);
  const send = (config: Partial<GameConfig>, extra: Partial<GameRecord> = {}, userId = A) =>
    () => adv.chapterResult(userId, C1.id, store(userId, makeRecord(g, { myDeck: deckId, ...config }, extra)));
  // mauvais niveau, partie d'entraînement ou en ligne
  assert.throws(send({ level: C1.opponent.level === 1 ? 2 : 1 }), /niveau/);
  assert.throws(send({}, { practice: { from: null, turn: 3 } }), /pas une partie de l'aventure/);
  assert.throws(send({}, { mode: 'online' }), /pas une partie de l'aventure/);
  // mauvais deck : le deck de départ du registre, ou des cartes absentes de la Cale sous l'identifiant du deck d'aventure
  assert.throws(() => adv.chapterResult(A, C1.id, store(A, makeRecord(find(STARTER.id, C1.opponent.deck, true), { myDeck: STARTER.id }))), /deck d'aventure/);
  const unowned = { ...myDeck, cards: DECKS['ST-31'].cards };
  assert.throws(() => adv.chapterResult(A, C1.id, store(A, makeRecord(find(unowned, C1.opponent.deck, true), { myDeck: deckId }))), /absentes de ta Cale/);
  // mauvais adversaire, déclaré tel quel ou caché sous celui du chapitre
  const vsOther = find(myDeck, OTHER, true);
  assert.throws(() => adv.chapterResult(A, C1.id, store(A, makeRecord(vsOther, { myDeck: deckId, aiDeck: OTHER }))), /adversaire de ce chapitre/);
  assert.throws(() => adv.chapterResult(A, C1.id, store(A, makeRecord(vsOther, { myDeck: deckId }))), /Partie invalide/);
  // parties truquées : deck adverse remélangé, coup inventé, partie pas finie
  const shuffled = structuredClone(g);
  shuffled.initial.players[1].deck.reverse();
  assert.throws(() => adv.chapterResult(A, C1.id, store(A, makeRecord(shuffled, { myDeck: deckId }))), /ne commence pas comme une partie/);
  const steps = g.final.history.map((h, i) => (i === 10 ? { ...h, choice: 'victoire' } : h));
  assert.throws(send({}, { steps }), /ne se rejoue plus/);
  assert.throws(send({}, { steps: g.final.history.slice(0, 40) }), /pas finie/);
  // partie d'un autre compte : introuvable
  const theirs = makeRecord(g, { myDeck: deckId });
  store(A, theirs);
  adv.startArc(B, ARC.id);
  assert.throws(() => adv.chapterResult(B, C1.id, theirs.id), /Partie introuvable/);
  assert.throws(() => adv.chapterResult(A, 'chapitre-inconnu', theirs.id), /Chapitre inconnu/);
  assert.throws(() => adv.chapterResult(A, C1.id, '../x'), /Partie introuvable/);
  // aucune de ces parties n'a compté
  assert.equal(adv.adventureState(A).chapters[C1.id].wins, 2);
  assert.equal(adv.adventureState(B).chapters[C1.id].wins, 0);
});

test('aventure (serveur) : un booster gagné s’ouvre une seule fois, seulement par son propriétaire', () => {
  const [booster, ...rest] = adv.adventureState(A).boosters;
  assert.throws(() => adv.openWonBooster(B, booster.id, seeded(1)), /Booster introuvable/);
  assert.throws(() => adv.openWonBooster(A, 'inconnu', seeded(1)), /Booster introuvable/);
  const before = holdOf(A);
  const opened = adv.openWonBooster(A, booster.id, seeded(7), new Date('2026-10-19T13:00:00Z'));
  assert.equal(opened.content.set, booster.set);
  assert.equal(opened.content.cards.length, BOOSTER_SIZE);
  assert.equal(opened.alreadyOpened, undefined);
  const expected = { ...before };
  for (const c of opened.content.cards) expected[c.number] = (expected[c.number] ?? 0) + 1;
  assert.deepEqual(holdOf(A), expected);
  // deuxième ouverture : le même contenu, rien de plus dans la Cale
  const again = adv.openWonBooster(A, booster.id, seeded(8));
  assert.deepEqual(again, { content: opened.content, alreadyOpened: true });
  assert.deepEqual(holdOf(A), expected);
  assert.deepEqual(adv.adventureState(A).boosters, rest);
  // l'aléatoire du serveur
  for (let i = 0; i < 1000; i++) {
    const r = adv.cryptoRand();
    assert.ok(r >= 0 && r < 1);
  }
});

test('aventure (serveur) : la suppression du compte efface ses données de l’aventure', async () => {
  const res = { setHeader() {} };
  const password = 'essai-cale-1234';
  const user = await auth.signup({ ip: '127.0.0.1', headers: {}, secure: false, body: { pseudo: 'essai_cale', email: 'essai-cale@example.invalid', password } }, res);
  const C = user.id;
  const deck = decks.deckOf(C, adv.startArc(C, ARC.id).deckId);
  const rec = makeRecord(find(deck, C1.opponent.deck, true), { myDeck: deck.id });
  const result = adv.chapterResult(C, C1.id, store(C, rec));
  adv.openWonBooster(C, result.boosters[0].id, seeded(3));
  const tables = ['game_inventory', 'game_boosters', 'game_progress', 'game_adventure', 'game_adventure_results', 'game_decks', 'game_records'];
  for (const table of tables) assert.ok(rows(table, C) > 0, table);
  await auth.deleteAccount({ user, headers: {}, secure: false, body: { password } }, res);
  for (const table of tables) assert.equal(rows(table, C), 0, table);
  // les autres comptes gardent tout
  assert.ok(rows('game_inventory', A) > 0 && rows('game_progress', A) > 0 && rows('game_adventure', B) > 0);
});

test('aventure (serveur) : le module se charge seul, comme premier module du jeu au démarrage du serveur', () => {
  // server/index.js importe game-adventure.js avant les autres modules du jeu : ses imports doivent passer par les
  // cartes avant le moteur (rules.ts et les fichiers de cartes s'importent l'un l'autre). Les tests préchargent les
  // cartes (load-local.ts) : seul un processus neuf voit ce problème.
  const out = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `await import(${JSON.stringify(new URL(paths.adventure, import.meta.url).href)})`], {
    env: { ...process.env, TCGC_DB: join(dir, 'chargement.db') },
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
});
