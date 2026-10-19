// Decks personnalisés (onglet Jouer, phase 5) : chaque compte construit ses decks dans l'éditeur ; le serveur les garde
// et les relit pour une partie en ligne (la liste n'est jamais envoyée à l'adversaire). Un deck en cours de
// construction peut être enregistré incomplet : il n'est jouable que s'il respecte les règles (game/engine/deckRules.ts).
// Un deck a un mode, choisi à sa création : 'libre' (toutes les cartes, les decks d'avant l'aventure) ou 'aventure'
// (seulement des cartes de la Cale du mode Aventure, voir game-adventure.js).
//   GET    /api/game/decks          mes decks
//   PUT    /api/game/decks/:id      créer ou modifier un deck { name, leader, cards, mode? }
//   DELETE /api/game/decks/:id      supprimer un deck
//   GET    /api/game/owned          mes cartes possédées, par numéro (filtre « possédées » de l'éditeur)
//   POST   /api/game/decks-prices   pour une liste de numéros : possédées, prix de la moins chère, déjà recherchée
//   POST   /api/game/decks-wish     cartes manquantes d'un deck dans les recherches { missing: {numéro: n}, lang }
//   GET    /api/game/regulations    cartes bannies ou limitées en tournoi officiel { numéro: statut }
import { CARDS } from '../game/engine/cards/index.ts';
import { anyNumber, MAX_COPIES } from '../game/engine/deckRules.ts';
import { CUSTOM_SERIES } from '../game/engine/decks.ts';
import { deckCollection, ownedNumbers, viewerOf, wishDeckMissing } from './cards.js';
import { db } from './db.js';

export const DECK_ID = /^PERSO-[a-z0-9]{6,24}$/;
const NUMBER = /^[A-Z]{1,5}\d{0,2}-\d{3}$/;
const MAX_DECKS = 200;
const MAX_NAME = 40;
export const DECK_MODES = ['libre', 'aventure'];

function invalid(message) {
  return Object.assign(new Error(message), { code: 'invalid_deck', status: 400, expose: true });
}

// Contenu envoyé par l'éditeur : nom, Leader et quantités par numéro (vérifiés dans leur forme ; les règles du jeu sont
// vérifiées au moment de jouer)
export function cleanDeck(body) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, MAX_NAME) : '';
  if (!name) throw invalid('Donne un nom à ton deck');
  const leader = typeof body?.leader === 'string' ? body.leader : '';
  if (!NUMBER.test(leader)) throw invalid('Leader invalide');
  if (CARDS[leader] && CARDS[leader].category !== 'LEADER') throw invalid("Cette carte n'est pas un Leader");
  const cards = {};
  let total = 0;
  for (const [num, n] of Object.entries(body?.cards && typeof body.cards === 'object' ? body.cards : {})) {
    if (!NUMBER.test(num) || !Number.isInteger(n) || n < 0 || n > 50) throw invalid('Liste de cartes invalide');
    if (n === 0) continue;
    cards[num] = n;
    total += n;
  }
  if (total > 60) throw invalid('Trop de cartes');
  return { name, leader, cards };
}

const toDeck = (row) => ({
  id: row.id, name: row.name, series: CUSTOM_SERIES, leader: row.leader, cards: JSON.parse(row.cards), mode: row.mode,
  updatedAt: row.updated_at,
});

// Cartes de la Cale (mode Aventure) par numéro, toutes versions confondues
export function holdCounts(userId) {
  const rows = db.prepare('SELECT number, SUM(count) AS n FROM game_inventory WHERE user_id = ? GROUP BY number').all(userId);
  return Object.fromEntries(rows.map((r) => [r.number, Number(r.n)]));
}

// Deck d'aventure : seulement des cartes de la Cale (Leader compris), pas plus d'exemplaires que possédés, et 4 au plus
// d'un même numéro (sauf carte permise en autant d'exemplaires qu'on veut). Problèmes en français (aucun : deck permis)
export function holdErrors(userId, leader, cards) {
  const owned = holdCounts(userId);
  const label = (num) => (CARDS[num] ? `${CARDS[num].name} (${num})` : num);
  const errors = [];
  for (const [num, n] of [[leader, 1], ...Object.entries(cards)]) {
    const have = owned[num] ?? 0;
    if (n > have) errors.push(have ? `${label(num)} : ${n} dans le deck, ${have} dans ta Cale` : `${label(num)} : absente de ta Cale`);
    else if (num !== leader && n > MAX_COPIES && !(CARDS[num] && anyNumber(CARDS[num]))) errors.push(`${label(num)} : ${MAX_COPIES} exemplaires au plus`);
  }
  return errors;
}

export function listDecks(userId) {
  return db.prepare('SELECT * FROM game_decks WHERE user_id = ? ORDER BY updated_at DESC').all(userId).map(toDeck);
}

// Deck d'un compte, comme le moteur le joue (DeckList), ou null
export function deckOf(userId, id) {
  if (typeof id !== 'string' || !DECK_ID.test(id)) return null;
  const row = db.prepare('SELECT * FROM game_decks WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? toDeck(row) : null;
}

export function saveDeck(userId, id, body, now = new Date()) {
  if (!DECK_ID.test(id)) throw invalid('Identifiant de deck invalide');
  const deck = cleanDeck(body);
  const existing = db.prepare('SELECT mode FROM game_decks WHERE user_id = ? AND id = ?').get(userId, id);
  // le mode se choisit à la création (sans mode : 'libre') ; ensuite il ne change plus
  const mode = body?.mode ?? existing?.mode ?? 'libre';
  if (!DECK_MODES.includes(mode)) throw invalid('Mode de deck invalide');
  if (existing && mode !== existing.mode) throw invalid('Un deck ne change pas de mode : crée plutôt un nouveau deck');
  if (mode === 'aventure') {
    const errors = holdErrors(userId, deck.leader, deck.cards);
    if (errors.length) throw invalid(`Un deck d'aventure ne prend que des cartes de ta Cale (${errors[0]})`);
  }
  if (!existing && db.prepare('SELECT COUNT(*) AS n FROM game_decks WHERE user_id = ?').get(userId).n >= MAX_DECKS) {
    throw invalid(`${MAX_DECKS} decks au plus : supprimes-en un`);
  }
  const at = now.toISOString();
  db.prepare(`INSERT INTO game_decks (user_id, id, name, leader, cards, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, leader = excluded.leader, cards = excluded.cards,
      updated_at = excluded.updated_at`)
    .run(userId, id, deck.name, deck.leader, JSON.stringify(deck.cards), mode, at, at);
  return deckOf(userId, id);
}

export function deleteDeck(userId, id) {
  return db.prepare('DELETE FROM game_decks WHERE user_id = ? AND id = ?').run(userId, id).changes > 0;
}

export function deckRoutes(app) {
  app.get('/api/game/decks', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(listDecks(req.user.id));
  });
  app.put('/api/game/decks/:id', (req, res) => {
    res.json(saveDeck(req.user.id, req.params.id, req.body));
  });
  app.get('/api/game/regulations', (req, res) => {
    res.json(Object.fromEntries(db.prepare('SELECT number, status FROM regulations').all().map((r) => [r.number, r.status])));
  });
  app.get('/api/game/owned', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(ownedNumbers(viewerOf(req.user)));
  });
  app.post('/api/game/decks-prices', (req, res) => {
    res.json(deckCollection(viewerOf(req.user), req.body?.numbers));
  });
  app.post('/api/game/decks-wish', (req, res) => {
    res.json({ added: wishDeckMissing(viewerOf(req.user), req.body?.missing, req.body?.lang ?? 'fr') });
  });
  app.delete('/api/game/decks/:id', (req, res) => {
    if (!deleteDeck(req.user.id, req.params.id)) return res.status(404).json({ code: 'unknown_deck', error: 'Deck introuvable' });
    res.json({ ok: true });
  });
}
