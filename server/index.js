import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AuthError, deleteAccount, loadUser, login, logout, publicUser, rateLimit, requireUser, signup } from './auth.js';
import { frImagePath, frLargeImage } from './bandai-fr.js';
import { config } from './config.js';
import { getMeta } from './db.js';
import {
  addToCollection, collectionCsv, collectionSets, collectionStats, getCardDetail, getCards, importCollection, LANGS, listSets,
  searchCards, setQuantity, viewerOf,
} from './cards.js';
import { downloadThumb, thumbPath } from './images.js';
import { buildIndex, identify, indexStatus } from './scan.js';
import { runSync, syncInProgress, syncIsStale } from './sync.js';
import { collectionTotals, setPriceSource, snapshotCollectionValue } from './valuation.js';

const app = express();

// Derrière un proxy HTTPS (nginx, Caddy...), TRUST_PROXY permet de connaître la vraie IP et le protocole :
// "loopback" par défaut (proxy sur la même machine), un nombre de proxys, ou une liste d'adresses
function trustProxy() {
  const value = process.env.TRUST_PROXY ?? 'loopback';
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}
app.set('trust proxy', trustProxy());
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json());
app.use(loadUser);

// Protection contre les requêtes envoyées depuis un autre site (CSRF) : toute modification doit venir de l'appli
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin && new URL(origin).host !== req.get('host')) {
    return res.status(403).json({ code: 'forbidden_origin', error: 'Origine non autorisée' });
  }
  next();
});

const log = (...args) => console.log(new Date().toLocaleTimeString('fr-FR'), ...args);

// Synchro des prix puis mise à jour de l'index de scan (nouvelles cartes), en tâche de fond
let lastError = null;
function refresh() {
  return runSync({ log })
    .then(() => buildIndex({ log }))
    .then(() => { lastError = null; })
    .catch((err) => { lastError = err.message; log('Erreur de mise à jour :', err.message); });
}

// ---------- Comptes ----------

app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

app.post('/api/auth/signup', async (req, res) => {
  const user = await signup(req, res);
  log(`Nouveau compte : ${user.pseudo}`);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const user = await login(req, res);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  logout(req, res);
  res.json({ ok: true });
});

app.delete('/api/auth/account', requireUser, async (req, res) => {
  const { pseudo } = req.user;
  await deleteAccount(req, res);
  log(`Compte supprimé avec toutes ses données : ${pseudo}`);
  res.json({ ok: true });
});

// Tout le reste de l'API demande d'être connecté
app.use('/api', requireUser);

// ---------- Collection et catalogue (pour l'utilisateur connecté) ----------

app.get('/api/status', (req, res) => {
  res.json({
    lastSync: getMeta('last_sync'),
    priceDate: getMeta('price_date'),
    cmPriceDate: getMeta('cm_price_date'),
    priceSource: req.user.price_source,
    usdPerEur: Number(getMeta('usd_per_eur')) || null,
    syncing: syncInProgress(),
    scan: indexStatus(),
    error: lastError,
    totals: collectionTotals(req.user.id, req.user.price_source),
  });
});

app.put('/api/settings', (req, res) => {
  try {
    if (req.body?.priceSource) setPriceSource(req.user.id, req.body.priceSource);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const source = req.body?.priceSource ?? req.user.price_source;
  res.json({ priceSource: source, totals: collectionTotals(req.user.id, source) });
});

// Mise à jour manuelle des prix : au plus une fois par heure, quel que soit le nombre d'utilisateurs
app.post('/api/sync', (req, res) => {
  if (!syncIsStale(1)) return res.json({ started: false });
  refresh();
  res.json({ started: true });
});

app.get('/api/sets', (req, res) => res.json(listSets(viewerOf(req.user))));

app.get('/api/cards', (req, res) => {
  const { q, set, color, rarity, type, owned, lang, status, sort, limit, offset } = req.query;
  res.json(searchCards(viewerOf(req.user), {
    q, set, color, rarity, type, owned: owned === '1' || owned === 'true', lang, status, sort, limit, offset,
  }));
});

// all=1 : aussi les sets dont on ne possède aucune carte
app.get('/api/collection/sets', (req, res) => res.json(collectionSets(viewerOf(req.user), { all: req.query.all === '1' })));

app.get('/api/cards/:id', (req, res) => {
  const card = getCardDetail(viewerOf(req.user), req.params.id);
  if (!card) return res.status(404).json({ code: 'unknown_card', error: 'Carte inconnue' });
  res.json(card);
});

function logChange(card, lang, req) {
  log(`Collection de ${req.user.pseudo} : ${card.fullName} [${card.number}, ${card.setCode}] ${lang.toUpperCase()} -> x${card.ownedByLang[lang]}`);
}

// Langue de l'exemplaire : 'fr' par défaut
function langOf(req) {
  const lang = req.body?.lang ?? 'fr';
  return LANGS.includes(lang) ? lang : null;
}

app.put('/api/collection/:id', (req, res) => {
  const quantity = Number(req.body?.quantity);
  const lang = langOf(req);
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ code: 'invalid_quantity', error: 'Quantité invalide' });
  if (!lang) return res.status(400).json({ code: 'invalid_lang', error: 'Langue invalide' });
  const card = setQuantity(viewerOf(req.user), Number(req.params.id), quantity, lang);
  if (!card) return res.status(404).json({ code: 'unknown_card', error: 'Carte inconnue' });
  logChange(card, lang, req);
  snapshotCollectionValue(req.user.id);
  res.json({ card, totals: collectionTotals(req.user.id, req.user.price_source) });
});

app.post('/api/collection/:id/add', (req, res) => {
  const delta = Number(req.body?.delta ?? 1);
  const lang = langOf(req);
  if (!Number.isInteger(delta)) return res.status(400).json({ code: 'invalid_quantity', error: 'Quantité invalide' });
  if (!lang) return res.status(400).json({ code: 'invalid_lang', error: 'Langue invalide' });
  const card = addToCollection(viewerOf(req.user), Number(req.params.id), delta, lang);
  if (!card) return res.status(404).json({ code: 'unknown_card', error: 'Carte inconnue' });
  logChange(card, lang, req);
  snapshotCollectionValue(req.user.id);
  res.json({ card, totals: collectionTotals(req.user.id, req.user.price_source) });
});

app.get('/api/stats', (req, res) => {
  res.json({ totals: collectionTotals(req.user.id, req.user.price_source), ...collectionStats(viewerOf(req.user)) });
});

app.get('/api/export.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="collection-one-piece-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${collectionCsv(viewerOf(req.user), req.query.lang === 'en' ? 'en' : 'fr')}`);
});

// Import d'un export CSV de TCGC (pour reprendre une collection d'une autre installation)
app.post('/api/collection/import', express.text({ type: () => true, limit: '2mb' }), (req, res) => {
  rateLimit(`import:${req.user.id}`, 20, 60 * 60_000);
  const result = importCollection(viewerOf(req.user), req.body);
  log(`Import CSV pour ${req.user.pseudo} : ${result.cards} cartes, ${result.copies} exemplaires, ${result.skipped} lignes ignorées`);
  snapshotCollectionValue(req.user.id);
  res.json({ ...result, totals: collectionTotals(req.user.id, req.user.price_source) });
});

app.post('/api/scan', express.raw({ type: 'image/*', limit: '20mb' }), async (req, res) => {
  // La reconnaissance sollicite le processeur : 60 scans par minute et par compte au maximum
  rateLimit(`scan:${req.user.id}`, 60, 60_000);
  if (!req.body?.length) return res.status(400).json({ code: 'no_image', error: 'Aucune image reçue' });
  const status = indexStatus();
  if (!status.indexed) {
    return res.status(503).json({
      code: 'index_building',
      indexed: status.indexed,
      total: status.total,
      error: `L'index de reconnaissance est en cours de construction (${status.indexed}/${status.total})`,
    });
  }
  try {
    const started = Date.now();
    // mode=photo : photo entière prise avec l'appareil photo ; sinon image déjà recadrée sur le cadre de visée
    const { matches, margin } = await identify(req.body, { limit: 12, mode: req.query.mode === 'photo' ? 'photo' : 'guide' });
    const cards = new Map(getCards(viewerOf(req.user), matches.map((m) => m.productId)).map((c) => [c.id, c]));
    res.json({
      ms: Date.now() - started,
      margin: Math.round(margin * 1000) / 1000,
      candidates: matches.filter((m) => cards.has(m.productId)).map((m) => ({
        card: cards.get(m.productId),
        score: Math.round(m.score * 1000) / 1000,
        sameArt: m.sameArt,
      })),
    });
  } catch (err) {
    log('Erreur de scan :', err);
    res.status(500).json({ error: err.message });
  }
});

// Miniatures servies depuis le cache local (téléchargées à la volée si besoin)
app.get('/img/:id.jpg', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.sendStatus(400);
  const file = fs.existsSync(thumbPath(id)) ? thumbPath(id) : await downloadThumb(id).catch(() => null);
  if (!file) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(file);
});

// Visuels VF (liste officielle française) : miniatures téléchargées avec l'index, grands visuels à la demande
const FR_IMAGE_ID = /^[A-Z0-9]+-[A-Z0-9]+(_[a-z]\d+)?$/i;

app.get('/img-fr/:id.jpg', (req, res) => {
  if (!FR_IMAGE_ID.test(req.params.id)) return res.sendStatus(400);
  const file = frImagePath(req.params.id);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(file);
});

app.get('/img-fr-hd/:id.webp', async (req, res) => {
  if (!FR_IMAGE_ID.test(req.params.id)) return res.sendStatus(400);
  const file = await frLargeImage(req.params.id).catch(() => null);
  if (!file) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(file);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Manifeste de l'appli installable dans la langue du téléphone (nom affiché sur l'écran d'accueil)
const MANIFEST_TEXTS = {
  fr: { name: 'Ma Collection One Piece', short_name: 'Ma Collection', description: 'Scan, inventaire et estimation de mes cartes One Piece TCG' },
  en: { name: 'My One Piece Collection', short_name: 'My Collection', description: 'Scan, track and value my One Piece TCG cards' },
};

app.get('/manifest.webmanifest', (req, res, next) => {
  const file = path.join(config.distDir, 'manifest.webmanifest');
  if (!fs.existsSync(file)) return next();
  const lang = req.acceptsLanguages('fr', 'en') === 'fr' ? 'fr' : 'en';
  const manifest = { ...JSON.parse(fs.readFileSync(file, 'utf8')), ...MANIFEST_TEXTS[lang], lang };
  res.setHeader('Vary', 'Accept-Language');
  res.type('application/manifest+json').send(JSON.stringify(manifest));
});

// Application web (build Vite)
if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, {
    setHeaders: (res, file) => {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Erreurs prévues (identifiants incorrects, pseudo déjà pris...) : code traduit par l'interface
  if (err instanceof AuthError) return res.status(err.status).json({ code: err.code, error: err.message });
  log('Erreur :', err);
  res.status(err.status ?? 500).json(err.expose ? { code: err.code, error: err.message } : { code: 'server', error: 'Erreur interne du serveur' });
});

app.listen(config.port, config.host, () => {
  log(`TCGC démarré sur le port ${config.port}`);
  console.log(`  Sur ce PC        : http://localhost:${config.port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Depuis le réseau : http://${a.address}:${config.port}`);
    }
  }
  if (!fs.existsSync(config.distDir)) console.log('  (interface web non construite : lance "npm run build" ou "npm run dev")');

  if (syncIsStale()) refresh();
  else buildIndex({ log }).catch((err) => log("Erreur d'index :", err.message));
  // Vérifie toutes les heures si les prix du jour sont disponibles
  setInterval(() => { if (syncIsStale() && !syncInProgress()) refresh(); }, 3600_000);
});
