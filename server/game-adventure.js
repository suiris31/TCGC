// Mode Aventure (onglet Jouer) : progression dans les arcs, la Cale (cartes gagnées), les boosters gagnés et le deck
// d'aventure. Tout est gardé et vérifié par le serveur, un navigateur ne peut s'attribuer ni victoire ni carte :
// - une victoire ne compte qu'après avoir rejoué avec le moteur la partie enregistrée (game_records) : départ identique
//   à celui d'une vraie partie, coups permis, vainqueur, adversaire et niveau du chapitre, deck d'aventure du joueur ;
// - les boosters sont tirés ici à l'ouverture (aléatoire cryptographique) : le navigateur ne reçoit que le résultat.
//   GET  /api/game/adventure                              mon état : arcs commencés, victoires, deck, boosters à ouvrir
//   POST /api/game/adventure/:arcId/start                 commencer un arc (une seule fois) : deck de départ dans la Cale
//   PUT  /api/game/adventure/deck                         choisir mon deck d'aventure { deckId }
//   POST /api/game/adventure/chapters/:chapterId/result   faire compter une partie gagnée { recordId }
//   GET  /api/game/inventory                              ma Cale
//   POST /api/game/boosters/:id/open                      ouvrir un booster gagné
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import zlib from 'node:zlib';
// Les cartes d'abord : rules.ts et les fichiers de cartes s'importent l'un l'autre, et les fichiers de cartes lisent
// des constantes de rules.ts dès leur chargement. Entrer par le moteur (archive.ts, engine.ts) avant les cartes fait
// planter le démarrage du serveur quand ce module est le premier à charger le jeu (server/index.js).
import { cardData } from '../game/engine/cards/index.ts';
import { ARCS, findArc, findChapter } from '../game/adventure/arcs.ts';
import { chapterStatuses } from '../game/adventure/progress.ts';
import { openBooster } from '../game/boosters/open.ts';
import { replayRecord } from '../game/coach/archive.ts';
import { deckErrors } from '../game/engine/deckRules.ts';
import { CUSTOM_PREFIX, CUSTOM_SERIES, DECKS } from '../game/engine/decks.ts';
import { newGame } from '../game/engine/engine.ts';
import { rateLimit } from './auth.js';
import { db, transaction } from './db.js';
import { DECK_ID, deckOf, holdErrors, saveDeck } from './game-decks.js';
import { RECORD_ID, recordBlob } from './game-records.js';

const BOOSTER_ID = /^[\w-]{1,40}$/;
// Une partie normale fait quelques centaines de coups : au-delà, le rejeu coûterait trop cher au serveur
const MAX_STEPS = 10_000;
const MAX_JSON = 20 * 1024 * 1024;

function refuse(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, expose: true });
}

function requireCards() {
  if (!Object.keys(cardData()).length) {
    throw refuse('cards_loading', 'Informations des cartes en cours de téléchargement, réessaie dans un instant', 503);
  }
}

// Nombre aléatoire dans [0, 1), cryptographique (48 bits)
export const cryptoRand = () => crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

// ---------- La Cale ----------

function addToHold(userId, number, variant, count) {
  db.prepare(`INSERT INTO game_inventory (user_id, number, variant, count) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, number, variant) DO UPDATE SET count = count + excluded.count`).run(userId, number, variant, count);
}

// Les cartes d'un deck du registre (Leader compris), dans leur version de base
function addDeckToHold(userId, deck) {
  addToHold(userId, deck.leader, 'base', 1);
  for (const [num, n] of Object.entries(deck.cards)) addToHold(userId, num, 'base', n);
}

export function inventory(userId) {
  const rows = db.prepare('SELECT number, variant, count FROM game_inventory WHERE user_id = ? ORDER BY number, variant').all(userId);
  return { cards: rows.map((r) => ({ number: r.number, variant: r.variant, count: r.count })) };
}

// ---------- Boosters ----------

const toBooster = (row) => ({ id: row.id, set: row.set_code, source: row.source, createdAt: row.created_at });

function addBooster(userId, set, source, at) {
  const id = crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO game_boosters (id, user_id, set_code, source, created_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, set, source, at);
  return { id, set, source, createdAt: at };
}

// Ouvre un booster gagné : tiré une seule fois, ses cartes vont dans la Cale. Une nouvelle demande (réponse perdue en
// route...) renvoie le même contenu, sans rien ajouter.
export function openWonBooster(userId, id, rand = cryptoRand, now = new Date()) {
  const row = typeof id === 'string' && BOOSTER_ID.test(id)
    ? db.prepare('SELECT * FROM game_boosters WHERE id = ? AND user_id = ?').get(id, userId) : null;
  if (!row) throw refuse('unknown_booster', 'Booster introuvable', 404);
  if (row.opened_at) return { content: JSON.parse(row.content), alreadyOpened: true };
  requireCards();
  const content = openBooster(row.set_code, rand);
  transaction(() => {
    db.prepare('UPDATE game_boosters SET opened_at = ?, content = ? WHERE id = ?').run(now.toISOString(), JSON.stringify(content), id);
    for (const c of content.cards) addToHold(userId, c.number, c.variant, 1);
  });
  return { content };
}

// ---------- État du joueur ----------

const startedArcs = (userId) => db.prepare('SELECT arc, deck_id FROM game_adventure WHERE user_id = ? ORDER BY started_at').all(userId);

// Deck d'aventure choisi (le même pour tous les arcs), s'il existe encore
function adventureDeck(userId) {
  const id = startedArcs(userId).at(-1)?.deck_id;
  const deck = id ? deckOf(userId, id) : null;
  return deck?.mode === 'aventure' ? deck : null;
}

function wonChapters(userId) {
  return new Set(db.prepare('SELECT chapter FROM game_progress WHERE user_id = ? AND wins > 0').all(userId).map((r) => r.chapter));
}

export function adventureState(userId) {
  const started = new Set(startedArcs(userId).map((r) => r.arc));
  const progress = new Map(db.prepare('SELECT chapter, wins, first_win_at FROM game_progress WHERE user_id = ?').all(userId).map((r) => [r.chapter, r]));
  const chapters = {};
  for (const c of ARCS.flatMap((arc) => arc.chapters)) {
    const p = progress.get(c.id);
    chapters[c.id] = { wins: p?.wins ?? 0, firstWinAt: p?.first_win_at ?? null };
  }
  const boosters = db.prepare('SELECT * FROM game_boosters WHERE user_id = ? AND opened_at IS NULL ORDER BY created_at, rowid').all(userId);
  return {
    arcs: Object.fromEntries(ARCS.map((arc) => [arc.id, { started: started.has(arc.id) }])),
    chapters,
    deckId: adventureDeck(userId)?.id ?? null,
    boosters: boosters.map(toBooster),
  };
}

// ---------- Départ d'un arc et deck d'aventure ----------

function newDeckId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return CUSTOM_PREFIX + Array.from({ length: 12 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}

// Une seule fois par arc : les cartes du deck de départ vont dans la Cale, et un deck d'aventure avec ces cartes est
// créé et choisi. Une nouvelle demande ne donne rien de plus.
export function startArc(userId, arcId, now = new Date()) {
  const arc = typeof arcId === 'string' ? findArc(arcId) : undefined;
  if (!arc) throw refuse('unknown_arc', 'Arc inconnu', 404);
  if (db.prepare('SELECT 1 FROM game_adventure WHERE user_id = ? AND arc = ?').get(userId, arc.id)) return adventureState(userId);
  transaction(() => {
    let deckId = adventureDeck(userId)?.id ?? null;
    const starter = arc.starterDeck ? DECKS[arc.starterDeck] : undefined;
    if (starter) {
      addDeckToHold(userId, starter);
      deckId = newDeckId();
      saveDeck(userId, deckId, { name: `Aventure : ${starter.name}`, leader: starter.leader, cards: starter.cards, mode: 'aventure' }, now);
    }
    db.prepare('INSERT INTO game_adventure (user_id, arc, started_at, deck_id) VALUES (?, ?, ?, ?)').run(userId, arc.id, now.toISOString(), deckId);
    db.prepare('UPDATE game_adventure SET deck_id = ? WHERE user_id = ?').run(deckId, userId);
  });
  return adventureState(userId);
}

// Choix du deck d'aventure : un deck du joueur en mode 'aventure', complet, avec seulement des cartes de sa Cale
export function chooseDeck(userId, deckId) {
  if (!startedArcs(userId).length) throw refuse('not_started', "Commence d'abord l'aventure", 409);
  const deck = typeof deckId === 'string' && DECK_ID.test(deckId) ? deckOf(userId, deckId) : null;
  if (!deck) throw refuse('unknown_deck', 'Deck introuvable', 404);
  if (deck.mode !== 'aventure') throw refuse('invalid_deck', "Ce deck n'est pas un deck d'aventure");
  requireCards();
  const errors = [...deckErrors(deck.leader, deck.cards), ...holdErrors(userId, deck.leader, deck.cards)];
  if (errors.length) throw refuse('invalid_deck', `Ce deck ne peut pas servir pour l'aventure : ${errors[0]}`);
  db.prepare('UPDATE game_adventure SET deck_id = ? WHERE user_id = ?').run(deck.id, userId);
  return adventureState(userId);
}

// ---------- Vérification d'une partie gagnée ----------

function readRecord(userId, recordId) {
  const blob = typeof recordId === 'string' && RECORD_ID.test(recordId) ? recordBlob(userId, recordId) : null;
  if (!blob) throw refuse('unknown_record', 'Partie introuvable', 404);
  try {
    return JSON.parse(zlib.gunzipSync(blob, { maxOutputLength: MAX_JSON }).toString('utf8'));
  } catch {
    throw invalidGame('enregistrement illisible');
  }
}

function invalidGame(detail) {
  return refuse('invalid_game', `Partie invalide : ${detail}`);
}

const validList = (list) => list && typeof list === 'object' && typeof list.leader === 'string' && list.cards
  && typeof list.cards === 'object' && Object.values(list.cards).every((n) => Number.isInteger(n) && n > 0 && n <= 50);

// La partie commence exactement comme une partie créée par le moteur avec ces decks : même ordre des cartes mélangées,
// mêmes mains, même premier joueur. Le hasard du moteur avance d'un pas fixe à chaque tirage, et le nombre de tirages
// avant la première décision ne dépend pas du mélange : l'état du hasard au départ donne la graine de la partie.
function freshStart(rec, aiDeckId) {
  const { initial, human } = rec;
  const ai = human === 0 ? 1 : 0;
  const names = initial.players.map((p) => p?.name);
  if (!names.every((n) => typeof n === 'string' && n.length <= 40) || !Number.isInteger(initial.rng)) return false;
  const mine = initial.players[human];
  const decks = [];
  decks[human] = { id: mine.deckId, name: '', series: CUSTOM_SERIES, leader: mine.list.leader, cards: mine.list.cards };
  decks[ai] = aiDeckId;
  const first = rec.config.first === 'me' ? human : rec.config.first === 'ai' ? ai : 'random';
  try {
    const probe = newGame({ decks, names, first, seed: 0 });
    const fresh = newGame({ decks, names, first, seed: (initial.rng - probe.rng) | 0 });
    return isDeepStrictEqual(JSON.parse(JSON.stringify(fresh)), initial);
  } catch {
    return false;
  }
}

// Rejoue la partie et dit si le joueur l'a gagnée ; refuse une partie qui ne compte pas pour ce chapitre
function verifyGame(userId, rec, chapter, deckId) {
  if (!rec || typeof rec !== 'object' || !rec.config || typeof rec.config !== 'object') throw invalidGame('enregistrement illisible');
  if (rec.mode === 'online' || rec.practice) throw refuse('not_adventure_game', "Cette partie n'est pas une partie de l'aventure");
  const { config, human } = rec;
  if (config.aiDeck !== chapter.opponent.deck) throw refuse('wrong_opponent', "Cette partie n'a pas été jouée contre l'adversaire de ce chapitre");
  if (config.level !== chapter.opponent.level) throw refuse('wrong_level', "Cette partie n'a pas été jouée au niveau de ce chapitre");
  if (!deckId || config.myDeck !== deckId) throw refuse('wrong_deck', "Cette partie n'a pas été jouée avec ton deck d'aventure");
  if ((human !== 0 && human !== 1) || !Array.isArray(rec.initial?.players) || rec.initial.players.length !== 2
    || !Array.isArray(rec.steps) || !Array.isArray(rec.decisions)) {
    throw invalidGame('enregistrement incomplet');
  }
  if (rec.steps.length > MAX_STEPS) throw invalidGame('trop de coups');
  const mine = rec.initial.players[human];
  if (!validList(mine?.list) || mine.deckId !== deckId) throw refuse('wrong_deck', "Cette partie n'a pas été jouée avec ton deck d'aventure");
  // la liste jouée, telle qu'elle était au début de la partie : complète et faite de cartes de la Cale
  const rules = deckErrors(mine.list.leader, mine.list.cards);
  if (rules.length) throw refuse('wrong_deck', `Le deck de cette partie ne respecte pas les règles (${rules[0]})`);
  const missing = holdErrors(userId, mine.list.leader, mine.list.cards);
  if (missing.length) throw refuse('wrong_deck', `Le deck de cette partie contient des cartes absentes de ta Cale (${missing[0]})`);
  if (!freshStart(rec, chapter.opponent.deck)) throw invalidGame("elle ne commence pas comme une partie du jeu");
  let final;
  try {
    final = replayRecord(rec).final;
  } catch (err) {
    throw invalidGame(err.message);
  }
  if (final.winner === null) throw refuse('game_not_over', "Cette partie n'est pas finie", 409);
  return final.winner === human;
}

// Récompenses d'une première victoire. Les Berry arrivent avec l'étape 2 : pas encore données.
function grant(userId, rewards, source, at) {
  const given = [];
  const boosters = [];
  for (const r of rewards) {
    if (r.kind === 'booster') for (let i = 0; i < r.count; i++) boosters.push(addBooster(userId, r.set, source, at));
    else if (r.kind === 'card') addToHold(userId, r.number, 'base', r.count);
    else if (r.kind === 'deck' && DECKS[r.deck]) addDeckToHold(userId, DECKS[r.deck]);
    else continue;
    given.push(r);
  }
  return { rewards: given, boosters };
}

const nothing = (won) => ({ won, firstWin: false, rewards: [], boosters: [] });

// Partie gagnée contre l'adversaire d'un chapitre : vérifiée en la rejouant, comptée une seule fois ; les récompenses
// du chapitre ne sont données qu'à la première victoire
export function chapterResult(userId, chapterId, recordId, now = new Date()) {
  const found = typeof chapterId === 'string' ? findChapter(chapterId) : undefined;
  if (!found) throw refuse('unknown_chapter', 'Chapitre inconnu', 404);
  const { arc, chapter } = found;
  if (!db.prepare('SELECT 1 FROM game_adventure WHERE user_id = ? AND arc = ?').get(userId, arc.id)) {
    throw refuse('not_started', "Commence d'abord l'aventure", 409);
  }
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId)) throw refuse('unknown_record', 'Partie introuvable', 404);
  const used = db.prepare('SELECT chapter FROM game_adventure_results WHERE user_id = ? AND record_id = ?').get(userId, recordId);
  if (used) {
    if (used.chapter !== chapter.id) throw refuse('record_used', 'Cette partie a déjà compté pour un autre chapitre', 409);
    return nothing(true);
  }
  if (chapterStatuses(arc, wonChapters(userId))[chapter.id] === 'locked') {
    throw refuse('chapter_locked', "Ce chapitre n'est pas encore ouvert", 409);
  }
  requireCards();
  const rec = readRecord(userId, recordId);
  if (!verifyGame(userId, rec, chapter, adventureDeck(userId)?.id)) return nothing(false);
  const at = now.toISOString();
  return transaction(() => {
    db.prepare('INSERT INTO game_adventure_results (user_id, record_id, chapter, at) VALUES (?, ?, ?, ?)').run(userId, recordId, chapter.id, at);
    const before = db.prepare('SELECT first_win_at FROM game_progress WHERE user_id = ? AND chapter = ?').get(userId, chapter.id);
    db.prepare(`INSERT INTO game_progress (user_id, chapter, wins, first_win_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, chapter) DO UPDATE SET wins = wins + 1, first_win_at = COALESCE(first_win_at, excluded.first_win_at)`)
      .run(userId, chapter.id, at);
    if (before?.first_win_at) return nothing(true);
    return { won: true, firstWin: true, ...grant(userId, chapter.rewards, `chapitre ${chapter.id}`, at) };
  });
}

// ---------- Routes ----------

export function adventureRoutes(app) {
  app.get('/api/game/adventure', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(adventureState(req.user.id));
  });
  app.post('/api/game/adventure/:arcId/start', (req, res) => {
    rateLimit(`adventure-start:${req.user.id}`, 20, 60_000);
    res.json(startArc(req.user.id, req.params.arcId));
  });
  app.put('/api/game/adventure/deck', (req, res) => {
    res.json(chooseDeck(req.user.id, req.body?.deckId));
  });
  // le rejeu d'une partie occupe le serveur une fraction de seconde : nombre de demandes limité
  app.post('/api/game/adventure/chapters/:chapterId/result', (req, res) => {
    rateLimit(`adventure-result:${req.user.id}`, 30, 60_000);
    res.json(chapterResult(req.user.id, req.params.chapterId, req.body?.recordId));
  });
  app.get('/api/game/inventory', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(inventory(req.user.id));
  });
  app.post('/api/game/boosters/:id/open', (req, res) => {
    rateLimit(`booster-open:${req.user.id}`, 120, 60_000);
    res.json(openWonBooster(req.user.id, req.params.id));
  });
}
