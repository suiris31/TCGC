import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { frImagePath, frLargeImage } from './bandai-fr.js';
import { config } from './config.js';
import { getMeta } from './db.js';
import {
  addToCollection, collectionCsv, collectionSets, collectionStats, getCardDetail, getCards, LANGS, listSets, searchCards,
  setQuantity,
} from './cards.js';
import { downloadThumb, thumbPath } from './images.js';
import { buildIndex, identify, indexStatus } from './scan.js';
import { runSync, syncInProgress, syncIsStale } from './sync.js';
import { collectionTotals, priceSource, setPriceSource, snapshotCollectionValue } from './valuation.js';

const app = express();
app.use(express.json());

const log = (...args) => console.log(new Date().toLocaleTimeString('fr-FR'), ...args);

// Synchro des prix puis mise à jour de l'index de scan (nouvelles cartes), en tâche de fond
let lastError = null;
function refresh() {
  return runSync({ log })
    .then(() => buildIndex({ log }))
    .then(() => { lastError = null; })
    .catch((err) => { lastError = err.message; log('Erreur de mise à jour :', err.message); });
}

app.get('/api/status', (req, res) => {
  res.json({
    lastSync: getMeta('last_sync'),
    priceDate: getMeta('price_date'),
    cmPriceDate: getMeta('cm_price_date'),
    priceSource: priceSource(),
    usdPerEur: Number(getMeta('usd_per_eur')) || null,
    syncing: syncInProgress(),
    scan: indexStatus(),
    error: lastError,
    totals: collectionTotals(),
  });
});

app.put('/api/settings', (req, res) => {
  try {
    if (req.body?.priceSource) setPriceSource(req.body.priceSource);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  snapshotCollectionValue();
  res.json({ priceSource: priceSource(), totals: collectionTotals() });
});

app.post('/api/sync', (req, res) => {
  refresh();
  res.json({ started: true });
});

app.get('/api/sets', (req, res) => res.json(listSets()));

app.get('/api/cards', (req, res) => {
  const { q, set, color, rarity, type, owned, lang, status, sort, limit, offset } = req.query;
  res.json(searchCards({ q, set, color, rarity, type, owned: owned === '1' || owned === 'true', lang, status, sort, limit, offset }));
});

// all=1 : aussi les sets dont on ne possède aucune carte
app.get('/api/collection/sets', (req, res) => res.json(collectionSets({ all: req.query.all === '1' })));

app.get('/api/cards/:id', (req, res) => {
  const card = getCardDetail(req.params.id);
  if (!card) return res.status(404).json({ error: 'Carte inconnue' });
  res.json(card);
});

function logChange(card, lang, req) {
  log(`Collection : ${card.fullName} [${card.number}, ${card.setCode}] ${lang.toUpperCase()} -> x${card.ownedByLang[lang]} (depuis ${req.ip})`);
}

// Langue de l'exemplaire : 'fr' par défaut
function langOf(req) {
  const lang = req.body?.lang ?? 'fr';
  return LANGS.includes(lang) ? lang : null;
}

app.put('/api/collection/:id', (req, res) => {
  const quantity = Number(req.body?.quantity);
  const lang = langOf(req);
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Quantité invalide' });
  if (!lang) return res.status(400).json({ error: 'Langue invalide' });
  const card = setQuantity(Number(req.params.id), quantity, lang);
  if (!card) return res.status(404).json({ error: 'Carte inconnue' });
  logChange(card, lang, req);
  snapshotCollectionValue();
  res.json({ card, totals: collectionTotals() });
});

app.post('/api/collection/:id/add', (req, res) => {
  const delta = Number(req.body?.delta ?? 1);
  const lang = langOf(req);
  if (!Number.isInteger(delta)) return res.status(400).json({ error: 'Quantité invalide' });
  if (!lang) return res.status(400).json({ error: 'Langue invalide' });
  const card = addToCollection(Number(req.params.id), delta, lang);
  if (!card) return res.status(404).json({ error: 'Carte inconnue' });
  logChange(card, lang, req);
  snapshotCollectionValue();
  res.json({ card, totals: collectionTotals() });
});

app.get('/api/stats', (req, res) => res.json({ totals: collectionTotals(), ...collectionStats() }));

app.get('/api/export.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="collection-one-piece-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${collectionCsv()}`);
});

app.post('/api/scan', express.raw({ type: 'image/*', limit: '20mb' }), async (req, res) => {
  if (!req.body?.length) return res.status(400).json({ error: 'Aucune image reçue' });
  const status = indexStatus();
  if (!status.indexed) {
    return res.status(503).json({ error: `L'index de reconnaissance est en cours de construction (${status.indexed}/${status.total})` });
  }
  try {
    const started = Date.now();
    // mode=photo : photo entière prise avec l'appareil photo ; sinon image déjà recadrée sur le cadre de visée
    const { matches, margin } = await identify(req.body, { limit: 12, mode: req.query.mode === 'photo' ? 'photo' : 'guide' });
    const cards = new Map(getCards(matches.map((m) => m.productId)).map((c) => [c.id, c]));
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
  log('Erreur :', err);
  if (res.headersSent) return next(err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Erreur interne du serveur' });
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
