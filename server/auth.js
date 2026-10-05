// Comptes et sessions : inscription (pseudo, e-mail, mot de passe), connexion, déconnexion, suppression.
// - mots de passe hachés avec scrypt (sel aléatoire), jamais stockés ni journalisés en clair
// - session = jeton aléatoire dans un cookie HttpOnly ; la base ne garde que son hachage SHA-256
// - nombre de tentatives de connexion / inscription limité par adresse IP
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { db, LEGACY_USER, transaction } from './db.js';

const scrypt = promisify(crypto.scrypt);

const COOKIE = 'tcgc_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export class AuthError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------- Mots de passe ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, expected] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expectedBuf = Buffer.from(expected, 'base64');
  const hash = await scrypt(password, Buffer.from(salt, 'base64'), expectedBuf.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(hash, expectedBuf);
}

// Empreinte factice : une connexion avec un identifiant inconnu prend autant de temps qu'avec un mauvais mot de passe
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- Validation ----------

const PSEUDO_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanSignup({ pseudo, email, password }) {
  pseudo = String(pseudo ?? '').trim();
  email = String(email ?? '').trim().toLowerCase();
  password = String(password ?? '');
  if (!PSEUDO_RE.test(pseudo)) throw new AuthError('invalid_pseudo');
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new AuthError('invalid_email');
  if (password.length < 8 || password.length > 200) throw new AuthError('weak_password');
  return { pseudo, email, password };
}

// ---------- Limitation des tentatives ----------

const attempts = new Map(); // clé -> { count, resetAt }

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > max) throw new AuthError('too_many_attempts', 429);
}

// Nettoyage périodique des compteurs expirés
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.resetAt < now) attempts.delete(key);
}, 10 * 60_000).unref();

// ---------- Sessions ----------

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const parts = [`${COOKIE}=${token}`, `Path=${config.publicPath}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  // Derrière HTTPS (directement ou via un proxy déclaré avec TRUST_PROXY), le cookie n'est jamais envoyé en clair
  if (req.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, now.toISOString(), expires.toISOString());
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
}

export function publicUser(user) {
  return {
    id: user.id, pseudo: user.pseudo, email: user.email, createdAt: user.created_at, priceSource: user.price_source,
    keepCopies: user.keep_copies,
  };
}

// Middleware : req.user = utilisateur connecté (ou null)
export function loadUser(req, res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
    req.user = row ?? null;
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 'unauthorized', error: 'Connexion requise' });
  next();
}

// ---------- Actions ----------

export async function signup(req, res) {
  rateLimit(`signup:${req.ip}`, 10, 60 * 60_000);
  const { pseudo, email, password } = cleanSignup(req.body ?? {});
  if (db.prepare('SELECT 1 FROM users WHERE pseudo = ?').get(pseudo)) throw new AuthError('pseudo_taken', 409);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new AuthError('email_taken', 409);
  const passwordHash = await hashPassword(password);

  const user = transaction(() => {
    const first = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
    const { lastInsertRowid } = db.prepare('INSERT INTO users (pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(pseudo, email, passwordHash, new Date().toISOString());
    const id = Number(lastInsertRowid);
    // Le tout premier compte récupère la collection saisie avant l'arrivée des comptes
    if (first) {
      db.prepare('UPDATE collection SET user_id = ? WHERE user_id = ?').run(id, LEGACY_USER);
      db.prepare('UPDATE value_history SET user_id = ? WHERE user_id = ?').run(id, LEGACY_USER);
    }
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  startSession(req, res, user.id);
  return user;
}

export async function login(req, res) {
  rateLimit(`login:${req.ip}`, 20, 15 * 60_000);
  const identifier = String(req.body?.identifier ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR pseudo = ?').get(identifier.toLowerCase(), identifier);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new AuthError('invalid_credentials', 401);
  startSession(req, res, user.id);
  return user;
}

export function logout(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  setSessionCookie(req, res, '', 0);
}

// Supprime le compte et tout ce qui s'y rattache : collection, recherches, lien de partage, notifications, échanges,
// historique de valeur, sessions
export async function deleteAccount(req, res) {
  rateLimit(`delete:${req.user.id}`, 10, 15 * 60_000);
  const ok = await verifyPassword(String(req.body?.password ?? ''), req.user.password_hash);
  if (!ok) throw new AuthError('wrong_password', 403);
  transaction(() => {
    db.prepare('DELETE FROM collection WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM wishlist WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM shares WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM trade_seen WHERE user_id = ? OR other_id = ?').run(req.user.id, req.user.id);
    db.prepare('DELETE FROM value_history WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  });
  setSessionCookie(req, res, '', 0);
}

// Sessions expirées : nettoyage quotidien
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}, 24 * 3600_000).unref();
