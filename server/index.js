import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import {
  AuthError, deleteAccount, loadUser, login, logout, publicUser, rateLimit, requestPasswordReset, requireUser, resetPassword, signup,
} from './auth.js';
import { frImagePath, frLargeImage } from './bandai-fr.js';
import { config } from './config.js';
import { getMeta } from './db.js';
import { addDeck, deckContents, starterDecks } from './decks.js';
import { enLargeImage, ensureGameCards, gameCards } from './game-cards.js';
import { expireRooms, forgetUser, onlineRoutes } from './game-online.js';
import { readRecordBody, RECORD_ID, recordBlob, recordSummariesJson, saveRecord } from './game-records.js';
import { mailConfigured } from './mail.js';
import {
  addToCollection, collectionCsv, collectionSets, collectionStats, doubles, getCardDetail, getCards, importCollection, LANGS,
  listSets, removeWish, searchCards, setKeepCopies, setQuantity, setTradeSettings, setWish, tradeMatches, tradeSettings,
  viewerOf, wishlist, wishlistCounts, wishMissing,
} from './cards.js';
import { downloadThumb, thumbPath } from './images.js';
import { buildIndex, identify, indexStatus } from './scan.js';
import { notifyAfterSync, notifyPrefs, pushPublicKey, sendTest, setNotifyPrefs, subscribe, unsubscribe } from './notify.js';
import { deleteShare, getShare, regenerateShare, saveShare, sharedView } from './share.js';
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
// Les parties du jeu (jusqu'à quelques centaines de Ko, souvent compressées) ont leur propre lecture du corps
const jsonBody = express.json();
app.use((req, res, next) => (req.path.startsWith('/api/game/records/') ? next() : jsonBody(req, res, next)));
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

// Synchro des prix, notifications (prix cibles atteints...), puis mise à jour de l'index de scan (nouvelles cartes),
// en tâche de fond
let lastError = null;
function refresh() {
  return runSync({ log })
    .then(() => notifyAfterSync({ log }).catch((err) => log('Erreur de notification :', err.message)))
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

// Fonctions disponibles avant connexion (mot de passe oublié seulement si l'envoi d'e-mails est configuré)
app.get('/api/auth/config', (req, res) => res.json({ passwordReset: mailConfigured() }));

app.post('/api/auth/forgot', (req, res) => {
  requestPasswordReset(req, log);
  res.json({ ok: true });
});

app.post('/api/auth/reset', async (req, res) => {
  const user = await resetPassword(req, res);
  log(`Mot de passe réinitialisé : ${user.pseudo}`);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  logout(req, res);
  res.json({ ok: true });
});

app.delete('/api/auth/account', requireUser, async (req, res) => {
  const { id, pseudo } = req.user;
  await deleteAccount(req, res);
  forgetUser(id);
  log(`Compte supprimé avec toutes ses données : ${pseudo}`);
  res.json({ ok: true });
});

// Mentions légales : éditeur, contact et hébergeur du site (variables d'environnement, voir deploy/tcgc.env.example)
app.get('/api/legal', (req, res) => {
  res.json({
    publisher: process.env.LEGAL_PUBLISHER ?? '',
    contact: process.env.LEGAL_CONTACT ?? '',
    host: process.env.LEGAL_HOST ?? '',
  });
});

// Page publique d'un lien de partage : sans compte, en lecture seule
app.get('/api/shared/:token', (req, res) => {
  rateLimit(`shared:${req.ip}`, 120, 60_000);
  const view = sharedView(req.params.token);
  if (!view) return res.status(404).json({ code: 'share_not_found', error: 'Lien de partage introuvable' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(view);
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
    wishlist: wishlistCounts(viewerOf(req.user)),
  });
});

app.put('/api/settings', (req, res) => {
  try {
    if (req.body?.priceSource) setPriceSource(req.user.id, req.body.priceSource);
    if (req.body?.keepCopies !== undefined) setKeepCopies(req.user.id, Number(req.body.keepCopies));
    if (req.body?.notify) req.user.notify_prefs = JSON.stringify(setNotifyPrefs(req.user, req.body.notify));
  } catch (err) {
    return res.status(400).json({ code: err.code, error: err.message });
  }
  const source = req.body?.priceSource ?? req.user.price_source;
  res.json({
    priceSource: source,
    keepCopies: req.body?.keepCopies !== undefined ? Number(req.body.keepCopies) : req.user.keep_copies,
    notify: notifyPrefs(req.user),
    totals: collectionTotals(req.user.id, source),
  });
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

// ---------- Decks préconstruits ----------

app.get('/api/decks', (req, res) => res.json(starterDecks()));

app.get('/api/decks/:id', (req, res) => {
  const deck = deckContents(viewerOf(req.user), Number(req.params.id));
  if (!deck) return res.status(404).json({ code: 'unknown_deck', error: 'Deck inconnu' });
  res.json(deck);
});

// Ajoute à la collection les cartes d'un deck : { lang, items: [{ id, quantity }] }
app.post('/api/decks/:id/add', (req, res) => {
  const result = addDeck(viewerOf(req.user), Number(req.params.id), req.body?.lang ?? 'fr', req.body?.items);
  if (!result) return res.status(404).json({ code: 'unknown_deck', error: 'Deck inconnu' });
  log(`Deck ${result.set.code} ajouté à la collection de ${req.user.pseudo} : ${result.copies} cartes`);
  snapshotCollectionValue(req.user.id);
  res.json({ ...result, totals: collectionTotals(req.user.id, req.user.price_source) });
});

// ---------- Recherches (liste de souhaits) ----------

app.get('/api/wishlist', (req, res) => res.json(wishlist(viewerOf(req.user))));

// targetEur : prix cible en € (null : aucun) ; absent : prix cible proposé pour une nouvelle recherche
app.put('/api/wishlist/:id', (req, res) => {
  const raw = req.body?.targetEur;
  const targetEur = raw === undefined || raw === null ? raw : Number(raw);
  const card = setWish(viewerOf(req.user), Number(req.params.id), { lang: req.body?.lang, targetEur });
  if (!card) return res.status(404).json({ code: 'unknown_card', error: 'Carte inconnue' });
  res.json({ card });
});

app.delete('/api/wishlist/:id', (req, res) => {
  const card = removeWish(viewerOf(req.user), Number(req.params.id));
  if (!card) return res.status(404).json({ code: 'unknown_card', error: 'Carte inconnue' });
  res.json({ card });
});

// Toutes les cartes manquantes d'un set dans les recherches
app.post('/api/wishlist/missing/:setId', (req, res) => {
  const lang = langOf(req);
  if (!lang) return res.status(400).json({ code: 'invalid_lang', error: 'Langue invalide' });
  const added = wishMissing(viewerOf(req.user), Number(req.params.setId), lang);
  log(`Recherches de ${req.user.pseudo} : ${added} cartes manquantes du set ${req.params.setId} ajoutées`);
  res.json({ added });
});

// ---------- Doubles et lien de partage ----------

app.get('/api/doubles', (req, res) => res.json(doubles(viewerOf(req.user), req.user.keep_copies)));

app.get('/api/share', (req, res) => res.json({ share: getShare(req.user.id) }));

// Crée le lien de partage ou change ce qu'il montre (scope, showPrices, showWishlist)
app.put('/api/share', (req, res) => {
  const existed = Boolean(getShare(req.user.id));
  const share = saveShare(req.user.id, req.body ?? {});
  if (!existed) log(`Lien de partage créé par ${req.user.pseudo}`);
  res.json({ share });
});

app.post('/api/share/regenerate', (req, res) => {
  if (!getShare(req.user.id)) return res.status(404).json({ code: 'share_not_found', error: 'Aucun lien de partage' });
  res.json({ share: regenerateShare(req.user.id) });
});

app.delete('/api/share', (req, res) => {
  deleteShare(req.user.id);
  res.json({ share: null });
});

// ---------- Échanges entre membres ----------

app.get('/api/trades', (req, res) => {
  res.json({ settings: tradeSettings(req.user), matches: tradeMatches(viewerOf(req.user), req.user) });
});

app.put('/api/trades/settings', (req, res) => {
  const settings = setTradeSettings(req.user, req.body ?? {});
  if (settings.enabled !== Boolean(req.user.trade_enabled)) {
    log(`Échanges : ${req.user.pseudo} ${settings.enabled ? 'participe' : 'ne participe plus'}`);
  }
  res.json({ settings });
});

// ---------- Notifications ----------

app.get('/api/push', (req, res) => res.json({ publicKey: pushPublicKey(), prefs: notifyPrefs(req.user) }));

app.post('/api/push/subscribe', (req, res) => {
  subscribe(req.user.id, req.body?.subscription, req.body?.lang);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  unsubscribe(req.user.id, req.body?.endpoint);
  res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  rateLimit(`push-test:${req.user.id}`, 10, 60 * 60_000);
  res.json({ sent: await sendTest(req.user.id) });
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

// Visuels VO des cartes du jeu qui n'existent pas en VF (liste officielle anglaise)
app.get('/img-en-hd/:id.webp', async (req, res) => {
  if (!FR_IMAGE_ID.test(req.params.id)) return res.sendStatus(400);
  const file = await enLargeImage(req.params.id).catch(() => null);
  if (!file) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(file);
});

// ---------- Jeu (onglet Jouer) ----------

// Réponse JSON compressée quand le navigateur l'accepte (gros volumes : informations des cartes, parties)
function sendJson(req, res, json, gzipped = null) {
  res.setHeader('Vary', 'Accept-Encoding');
  res.type('application/json');
  if (!req.acceptsEncodings('gzip')) return res.send(gzipped ? zlib.gunzipSync(gzipped) : json);
  res.setHeader('Content-Encoding', 'gzip');
  res.send(gzipped ?? zlib.gzipSync(json));
}

app.get('/api/game/cards', (req, res) => {
  const cards = gameCards();
  if (!cards) {
    ensureGameCards({ log });
    return res.status(503).json({ code: 'cards_loading', error: 'Informations des cartes en cours de téléchargement' });
  }
  res.setHeader('Cache-Control', 'no-cache');
  sendJson(req, res, cards.json, cards.gzip);
});

app.get('/api/game/records', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  sendJson(req, res, recordSummariesJson(req.user.id));
});

app.get('/api/game/records/:id', (req, res) => {
  const blob = RECORD_ID.test(req.params.id) ? recordBlob(req.user.id, req.params.id) : null;
  if (!blob) return res.status(404).json({ code: 'unknown_record', error: 'Partie introuvable' });
  res.setHeader('Cache-Control', 'no-store');
  sendJson(req, res, null, blob);
});

// Enregistrement d'une partie (2,5 s après chaque coup, et à la fin) : JSON, compressé par le navigateur s'il le peut
app.put('/api/game/records/:id', express.raw({ type: ['application/json', 'application/gzip'], limit: '5mb' }), (req, res) => {
  rateLimit(`game-save:${req.user.id}`, 120, 60_000);
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ code: 'invalid_record', error: 'Partie absente' });
  const { rec, text } = readRecordBody(req.body, req.is('application/gzip') === 'application/gzip');
  saveRecord(req.user.id, req.params.id, rec, text);
  res.json({ ok: true });
});

// Parties en ligne entre deux joueurs (salles, arbitrage, temps réel)
onlineRoutes(app, { log });

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
  // les refus prévus (choix déjà joué, code inconnu...) ne sont pas des erreurs du serveur
  if (!(err.expose && (err.status ?? 500) < 500)) log('Erreur :', err);
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
  ensureGameCards({ log });
  // Vérifie toutes les heures si les prix du jour sont disponibles (et les informations des cartes du jeu, si elles
  // n'ont pas pu être téléchargées)
  setInterval(() => {
    if (syncIsStale() && !syncInProgress()) refresh();
    ensureGameCards({ log });
    expireRooms();
  }, 3600_000);
});
