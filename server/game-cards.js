// Catalogue des cartes du jeu (onglet Jouer) : toutes les cartes des listes officielles française et anglaise (nom,
// coût, puissance, types, textes VF et VO...). Il n'est pas dans le dépôt : téléchargé au démarrage s'il manque, gardé
// dans data/game-catalog.json, mis à jour une fois par jour (nouvelles extensions, textes corrigés). Le moteur du
// serveur (arbitre des parties en ligne) charge tout le catalogue ; l'interface reçoit les cartes des decks jouables
// avec la version du programme (/api/game/catalog).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { fetchCatalog } from '../game/data/catalog.ts';
import { CARDS, loadCardData, missingCards, neededCards } from '../game/engine/cards/index.ts';
import { config } from './config.js';
import { ENGINE } from './version.js';

const FILE = path.join(config.dataDir, 'game-catalog.json');
const OLD_FILE = path.join(config.dataDir, 'game-cards.json');  // ancien format (cartes des decks, VF seulement)
const MAX_AGE = 24 * 3600_000;
let ready = null; // { json, gzip, legacy, fetchedAt }
let running = null;

// Ancien format (VF, avant le 7 octobre 2026), pour une page ouverte avant cette mise à jour : son code attend des
// couleurs, types et attributs en français. À retirer quand plus aucune page de cette époque ne peut être ouverte.
const COLOR_FR = { Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune' };
const ATTRIBUTE_FR = { Slash: 'Tranche', Strike: 'Frappe', Ranged: 'Distance', Special: 'Spécial', Wisdom: 'Sagesse' };

function legacyCard(d) {
  return {
    number: d.number, imageId: d.imageId, rarity: d.rarity, category: d.category, name: d.name, cost: d.cost, life: d.life,
    power: d.power, counter: d.counter, colors: d.colors.map((c) => COLOR_FR[c] ?? c), types: d.typeLabels,
    attribute: d.attributes.map((a) => ATTRIBUTE_FR[a] ?? a).join('/'), effect: d.effect, trigger: d.trigger,
  };
}

const packed = (value) => {
  const json = JSON.stringify(value);
  return { json, gzip: zlib.gzipSync(json) };
};

function use(catalog) {
  loadCardData(catalog.cards);
  const needed = neededCards();
  ready = {
    ...packed({ engine: ENGINE, cards: Object.fromEntries(needed.map((n) => [n, catalog.cards[n]])) }),
    legacy: packed(Object.fromEntries(needed.map((n) => [n, legacyCard(CARDS[n])]))),
    fetchedAt: Date.parse(catalog.fetchedAt) || 0,
  };
}

function readFile() {
  try {
    const catalog = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return catalog?.cards && !missingCards(catalog.cards).length ? catalog : null;
  } catch {
    return null;
  }
}

async function download(log) {
  const catalog = await fetchCatalog();
  const missing = missingCards(catalog.cards);
  if (missing.length) throw new Error(`cartes des decks absentes : ${missing.join(', ')}`);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, `${JSON.stringify(catalog)}\n`);
  fs.renameSync(`${FILE}.tmp`, FILE);
  fs.rmSync(OLD_FILE, { force: true });
  log(`Jeu : catalogue de ${Object.keys(catalog.cards).length} cartes`);
  return catalog;
}

// Au démarrage, puis toutes les heures : catalogue du fichier, sinon téléchargé ; une fois par jour, mis à jour (en cas
// d'échec, le catalogue en place reste utilisé)
export function ensureGameCards({ log = console.log } = {}) {
  if (ready && Date.now() - ready.fetchedAt < MAX_AGE) return Promise.resolve();
  running ??= (async () => {
    if (!ready) {
      const local = readFile();
      if (local) use(local);
      if (ready && Date.now() - ready.fetchedAt < MAX_AGE) return;
    }
    log(ready ? 'Jeu : mise à jour du catalogue des cartes...' : 'Jeu : téléchargement du catalogue des cartes...');
    use(await download(log));
  })().catch((err) => log('Jeu : catalogue des cartes indisponible :', err.message)).finally(() => { running = null; });
  return running;
}

export function gameCards() {
  return ready;
}

// Grands visuels VO (cartes qui n'existent pas en VF) : téléchargés à la demande depuis la liste officielle anglaise,
// convertis en WebP comme ceux de la liste française, gardés en cache
const enLargeDir = path.join(config.dataDir, 'images-en-large');

export async function enLargeImage(imageId) {
  const file = path.join(enLargeDir, `${imageId}.webp`);
  if (fs.existsSync(file)) return file;
  const res = await fetch(`https://en.onepiece-cardgame.com/images/cardlist/card/${imageId}.png`, { headers: { 'User-Agent': 'Mozilla/5.0 (TCGC, simulateur de jeu)' } });
  if (!res.ok) return null;
  const webp = await sharp(Buffer.from(await res.arrayBuffer())).webp({ quality: 80 }).toBuffer();
  fs.mkdirSync(enLargeDir, { recursive: true });
  fs.writeFileSync(file, webp);
  return file;
}
