// Parties en ligne entre deux joueurs (onglet Jouer) : salle avec un code à transmettre à un ami, partie arbitrée par
// le serveur (game/online/match.ts), envoi en temps réel de la vue de chaque joueur par un flux SSE (Server-Sent
// Events). Le flux passe par le bloc nginx existant : pas de tampon (X-Accel-Buffering) et un signe de vie toutes les
// 25 s, sous le délai de 120 s de nginx.
// Un deck de la Cale (deck d'aventure, mode 'aventure') n'entre dans une partie que si son joueur possède encore toutes
// ses cartes (holdErrors, relu dans la Cale au moment de créer la salle et au moment où la partie commence).
//   POST /api/game/matches                 créer une salle { deck }
//   POST /api/game/matches/join            rejoindre une salle { code, deck }
//   GET  /api/game/matches/current         mes salles et parties en cours
//   GET  /api/game/matches/:id             ma vue de la partie
//   GET  /api/game/matches/:id/events      flux de ma vue, à chaque changement
//   POST /api/game/matches/:id/act         mon choix { seq, choice }
//   POST /api/game/matches/:id/resign      abandonner
//   POST /api/game/matches/:id/cancel      fermer ma salle en attente
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {
  checkDeck, CODE_ALPHABET, CODE_RE, createMatch, joinMatch, MatchError, play, recordFor, resign, seatOf, viewOf,
} from '../game/online/match.ts';
import { rateLimit } from './auth.js';
import { config } from './config.js';
import { db } from './db.js';
import { deckLooks, deckOf, holdErrors } from './game-decks.js';
import { gameCards } from './game-cards.js';
import { saveRecord } from './game-records.js';
import { ENGINE } from './version.js';

// ---------- Stockage : en mémoire pendant la partie, dans la base après chaque coup ----------

const live = new Map(); // id -> partie

function save(m) {
  db.prepare(`INSERT INTO game_matches (id, code, host_id, guest_id, status, data, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET code = excluded.code, guest_id = excluded.guest_id, status = excluded.status,
      data = excluded.data, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
    .run(m.id, m.code, m.host.userId, m.guest?.userId ?? null, m.status, zlib.gzipSync(JSON.stringify(m)), m.createdAt, m.updatedAt, m.expiresAt);
  live.set(m.id, m);
}

// Une partie, depuis la mémoire ou la base (après un redémarrage du serveur, elle reprend où elle en était)
function load(id) {
  if (live.has(id)) return live.get(id);
  const row = typeof id === 'string' ? db.prepare('SELECT data FROM game_matches WHERE id = ?').get(id) : null;
  if (!row) return null;
  const m = JSON.parse(zlib.gunzipSync(Buffer.from(row.data)).toString('utf8'));
  live.set(m.id, m);
  return m;
}

// Partie dont le compte connecté est l'un des joueurs
function mine(req) {
  return mineOf(req.user.id, req.params.id);
}

function mineOf(userId, id) {
  const m = load(id);
  const seat = m ? seatOf(m, userId) : null;
  if (!m || seat === null) throw new MatchError('unknown_match', 'Partie introuvable', 404);
  return { m, seat };
}

function newCode() {
  for (let i = 0; i < 20; i++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    if (!db.prepare("SELECT 1 FROM game_matches WHERE code = ? AND status = 'waiting'").get(code)) return code;
  }
  throw new MatchError('busy', 'Réessaie dans un instant', 503);
}

function requireCards() {
  if (!gameCards()) throw new MatchError('cards_loading', 'Informations des cartes en cours de téléchargement, réessaie dans un instant', 503);
}

// Problèmes d'un deck de la Cale : cartes qui manquent dans la Cale de son joueur (échangées depuis, par exemple)
function holdProblems(p) {
  return p.hold ? holdErrors(p.userId, p.list.leader, p.list.cards) : [];
}

// Premier problème (et le nombre des autres) ; others : message pour l'autre joueur (« sa Cale » au lieu de « ta Cale »)
function holdMessage(errors, others = false) {
  const more = errors.length > 1 ? ` (et ${errors.length - 1} autre${errors.length > 2 ? 's' : ''})` : '';
  return `${others ? errors[0].replace(/ta Cale/g, 'sa Cale') : errors[0]}${more}`;
}

// Deck personnalisé : relu dans la base (seulement ceux du compte) ; sa liste reste côté serveur. Un deck de la Cale est
// refusé s'il lui manque des cartes. Ses visuels (looks) sont gardés à part : la liste jouée par le moteur n'en a pas.
export function player(user, deck) {
  const saved = typeof deck === 'string' && deck.startsWith('PERSO-') ? deckOf(user.id, deck) : null;
  const looks = saved ? deckLooks(user.id, saved) : {};
  const list = saved ? { ...saved } : undefined;
  if (list) delete list.looks;
  const p = {
    userId: user.id, name: user.pseudo, deck: checkDeck(deck, list), ...(list ? { list } : {}), ...(list?.mode === 'aventure' ? { hold: true } : {}),
    ...(Object.keys(looks).length ? { looks } : {}),
  };
  const errors = holdProblems(p);
  if (errors.length) {
    throw new MatchError('hold_incomplete', `Il manque des cartes dans ta Cale pour jouer « ${list.name} » : ${holdMessage(errors)}. `
      + 'Elles ont pu être échangées contre des Berry : corrige le deck dans « Mes decks » ou choisis-en un autre.', 409);
  }
  return p;
}

// ---------- Temps réel ----------

const streams = new Map(); // id -> Set<{ seat, res }>

const online = (id, seat) => [...(streams.get(id) ?? [])].some((x) => x.seat === seat);

function payload(m, seat) {
  return JSON.stringify({ ...viewOf(m, seat), opponentOnline: online(m.id, seat === 0 ? 1 : 0) });
}

function broadcast(m) {
  for (const x of streams.get(m.id) ?? []) x.res.write(`data: ${payload(m, x.seat)}\n\n`);
}

setInterval(() => {
  for (const set of streams.values()) for (const x of set) x.res.write(': ping\n\n');
}, 25_000).unref();

// ---------- Fin de partie : rangée dans « Mes parties » des deux joueurs ----------

function archive(m, log) {
  const now = new Date();
  for (const seat of [0, 1]) {
    const userId = seat === 0 ? m.host.userId : m.guest?.userId;
    if (!userId || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) continue;
    try {
      const rec = recordFor(m, seat, now);
      saveRecord(userId, rec.id, rec, JSON.stringify(rec));
    } catch (err) {
      log(`Partie en ligne ${m.id} : enregistrement impossible pour le joueur ${seat} :`, err.message);
    }
  }
}

// Compte supprimé : ses salles et parties en ligne disparaissent
export function forgetUser(userId) {
  for (const [id, m] of live) if (m.host.userId === userId || m.guest?.userId === userId) live.delete(id);
  db.prepare('DELETE FROM game_matches WHERE host_id = ? OR guest_id = ?').run(userId, userId);
}

// ---------- Salles ----------

function close(m, status, now) {
  m.status = status;
  m.code = null;
  m.updatedAt = now.toISOString();
  save(m);
  broadcast(m);
}

// Créer une salle : le compte en est l'hôte
export function openRoom(user, deck, now = new Date()) {
  const host = player(user, deck);  // deck vérifié d'abord : un deck refusé ne ferme pas la salle en cours
  // une seule salle en attente par compte : la précédente est fermée
  for (const row of db.prepare("SELECT id FROM game_matches WHERE host_id = ? AND status = 'waiting'").all(user.id)) {
    close(load(row.id), 'cancelled', now);
  }
  const m = createMatch(crypto.randomBytes(16).toString('base64url'), newCode(), host, now, ENGINE);
  save(m);
  return m;
}

// Rejoindre la salle d'un ami avec son code : la partie commence
export function enterRoom(user, rawCode, deck, now = new Date()) {
  const code = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const row = CODE_RE.test(code) ? db.prepare("SELECT id FROM game_matches WHERE code = ? AND status = 'waiting'").get(code) : null;
  if (!row) throw new MatchError('unknown_room', 'Aucune salle ouverte avec ce code', 404);
  const m = load(row.id);
  const guest = player(user, deck);
  // l'hôte a pu échanger des cartes de son deck de la Cale depuis l'ouverture de la salle : elle se ferme
  const hostErrors = guest.userId === m.host.userId ? [] : holdProblems(m.host);
  if (hostErrors.length) {
    close(m, 'cancelled', now);
    throw new MatchError('host_hold_incomplete', `${m.host.name} n'a plus toutes les cartes de son deck de la Cale (${holdMessage(hostErrors, true)}) : `
      + 'la salle est fermée. Demande-lui d’en ouvrir une nouvelle.', 409);
  }
  joinMatch(m, guest, now, crypto.randomInt(2 ** 31));
  save(m);
  broadcast(m);
  return m;
}

// Abandonner : la partie est finie et rangée dans « Mes parties » des deux joueurs
export function giveUp(user, id, log, now = new Date()) {
  const { m, seat } = mineOf(user.id, id);
  resign(m, seat, now);
  save(m);
  broadcast(m);
  archive(m, log);
  return m;
}

// ---------- Routes (le compte est déjà vérifié par requireUser) ----------

export function onlineRoutes(app, { log }) {
  app.post('/api/game/matches', (req, res) => {
    rateLimit(`room:${req.user.id}`, 20, 10 * 60_000);
    requireCards();
    const m = openRoom(req.user, req.body?.deck);
    log(`Salle ${m.code} créée par ${req.user.pseudo}`);
    res.status(201).json(viewOf(m, 0));
  });

  app.post('/api/game/matches/join', (req, res) => {
    // un code se devine difficilement (près d'un milliard de possibilités) ; les essais sont limités
    rateLimit(`join:${req.user.id}`, 20, 10 * 60_000);
    rateLimit(`join-ip:${req.ip}`, 40, 10 * 60_000);
    requireCards();
    const m = enterRoom(req.user, req.body?.code, req.body?.deck);
    log(`Partie en ligne : ${m.host.name} contre ${m.guest.name}`);
    res.json(viewOf(m, 1));
  });

  app.get('/api/game/matches/current', (req, res) => {
    const rows = db.prepare(`SELECT id FROM game_matches WHERE (host_id = ? OR guest_id = ?) AND status IN ('waiting', 'playing')
      ORDER BY updated_at DESC LIMIT 5`).all(req.user.id, req.user.id);
    const now = new Date().toISOString();
    res.setHeader('Cache-Control', 'no-store');
    res.json(rows.map((r) => load(r.id)).filter((m) => m && !(m.status === 'waiting' && m.expiresAt < now)).map((m) => {
      const seat = seatOf(m, req.user.id);
      const opp = seat === 0 ? m.guest : m.host;
      const me = seat === 0 ? m.host : m.guest;
      return { id: m.id, status: m.status, code: seat === 0 ? m.code : null, opponent: opp?.name ?? null, deck: me.deck, deckName: me.list?.name ?? null, hold: me.hold === true };
    }));
  });

  app.get('/api/game/matches/:id', (req, res) => {
    const { m, seat } = mine(req);
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(payload(m, seat));
  });

  app.get('/api/game/matches/:id/events', (req, res) => {
    const { m, seat } = mine(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const entry = { seat, res };
    if (!streams.has(m.id)) streams.set(m.id, new Set());
    streams.get(m.id).add(entry);
    res.write('retry: 3000\n\n');
    broadcast(m); // ma vue, et à l'adversaire : je suis là
    req.on('close', () => {
      const set = streams.get(m.id);
      set?.delete(entry);
      if (set && !set.size) streams.delete(m.id);
      const current = live.get(m.id);
      if (current) broadcast(current); // l'adversaire voit que je suis parti
    });
  });

  app.post('/api/game/matches/:id/act', (req, res) => {
    rateLimit(`act:${req.user.id}`, 300, 60_000);
    const { m, seat } = mine(req);
    play(m, seat, Number(req.body?.seq), req.body?.choice, new Date());
    save(m);
    broadcast(m);
    if (m.status === 'over') {
      archive(m, log);
      log(`Partie en ligne terminée : ${m.host.name} contre ${m.guest.name}, ${m.state.winReason}`);
    }
    res.json({ ok: true, seq: m.state.history.length });
  });

  app.post('/api/game/matches/:id/resign', (req, res) => {
    giveUp(req.user, req.params.id, log);
    res.json({ ok: true });
  });

  app.post('/api/game/matches/:id/cancel', (req, res) => {
    const { m, seat } = mine(req);
    if (seat !== 0 || m.status !== 'waiting') throw new MatchError('not_waiting', 'Cette salle ne peut plus être fermée', 409);
    m.status = 'cancelled';
    m.code = null;
    m.updatedAt = new Date().toISOString();
    save(m);
    broadcast(m);
    res.json({ ok: true });
  });
}

// Salles en attente dont le délai est passé : fermées (vérifié toutes les heures)
export function expireRooms() {
  const now = new Date().toISOString();
  for (const row of db.prepare("SELECT id FROM game_matches WHERE status = 'waiting' AND expires_at < ?").all(now)) {
    const m = load(row.id);
    m.status = 'expired';
    m.code = null;
    save(m);
    broadcast(m);
  }
  // les parties finies quittent la mémoire
  for (const [id, m] of live) if (m.status !== 'waiting' && m.status !== 'playing' && !streams.has(id)) live.delete(id);
}
