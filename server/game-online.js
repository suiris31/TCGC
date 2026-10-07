// Parties en ligne entre deux joueurs (onglet Jouer) : salle avec un code à transmettre à un ami, partie arbitrée par
// le serveur (game/online/match.ts), envoi en temps réel de la vue de chaque joueur par un flux SSE (Server-Sent
// Events). Le flux passe par le bloc nginx existant : pas de tampon (X-Accel-Buffering) et un signe de vie toutes les
// 25 s, sous le délai de 120 s de nginx.
//   POST /api/game/matches                 créer une salle { deck }
//   POST /api/game/matches/join            rejoindre une salle { code, deck }
//   GET  /api/game/matches/current         mes salles et parties en cours
//   GET  /api/game/matches/:id             ma vue de la partie
//   GET  /api/game/matches/:id/events      flux de ma vue, à chaque changement
//   POST /api/game/matches/:id/act         mon choix { seq, choice }
//   POST /api/game/matches/:id/resign      abandonner
//   POST /api/game/matches/:id/cancel      fermer ma salle en attente
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {
  checkDeck, CODE_ALPHABET, CODE_RE, createMatch, joinMatch, MatchError, play, recordFor, resign, seatOf, viewOf,
} from '../game/online/match.ts';
import { rateLimit } from './auth.js';
import { config } from './config.js';
import { db } from './db.js';
import { gameCards } from './game-cards.js';
import { saveRecord } from './game-records.js';

// Version du programme, notée avec chaque partie (pour la rejouer avec le même moteur)
const ENGINE = (() => {
  try {
    return execSync('git describe --always --dirty', { cwd: config.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'inconnue';
  }
})();

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
  const m = load(req.params.id);
  const seat = m ? seatOf(m, req.user.id) : null;
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

const player = (user, deck) => ({ userId: user.id, name: user.pseudo, deck: checkDeck(deck) });

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

// ---------- Routes (le compte est déjà vérifié par requireUser) ----------

export function onlineRoutes(app, { log }) {
  app.post('/api/game/matches', (req, res) => {
    rateLimit(`room:${req.user.id}`, 20, 10 * 60_000);
    requireCards();
    // une seule salle en attente par compte : la précédente est fermée
    for (const row of db.prepare("SELECT id FROM game_matches WHERE host_id = ? AND status = 'waiting'").all(req.user.id)) {
      const old = load(row.id);
      old.status = 'cancelled';
      old.code = null;
      save(old);
      broadcast(old);
    }
    const m = createMatch(crypto.randomBytes(16).toString('base64url'), newCode(), player(req.user, req.body?.deck), new Date(), ENGINE);
    save(m);
    log(`Salle ${m.code} créée par ${req.user.pseudo}`);
    res.status(201).json(viewOf(m, 0));
  });

  app.post('/api/game/matches/join', (req, res) => {
    // un code se devine difficilement (près d'un milliard de possibilités) ; les essais sont limités
    rateLimit(`join:${req.user.id}`, 20, 10 * 60_000);
    rateLimit(`join-ip:${req.ip}`, 40, 10 * 60_000);
    requireCards();
    const code = String(req.body?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const row = CODE_RE.test(code) ? db.prepare("SELECT id FROM game_matches WHERE code = ? AND status = 'waiting'").get(code) : null;
    if (!row) throw new MatchError('unknown_room', 'Aucune salle ouverte avec ce code', 404);
    const m = load(row.id);
    joinMatch(m, player(req.user, req.body?.deck), new Date(), crypto.randomInt(2 ** 31));
    save(m);
    broadcast(m);
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
      return { id: m.id, status: m.status, code: seat === 0 ? m.code : null, opponent: opp?.name ?? null, deck: (seat === 0 ? m.host : m.guest).deck };
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
    const { m, seat } = mine(req);
    resign(m, seat, new Date());
    save(m);
    broadcast(m);
    archive(m, log);
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
