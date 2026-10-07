// Informations officielles des cartes jouables (onglet Jouer) : nom, coût, puissance, texte VF... Elles ne sont pas
// dans le dépôt : téléchargées depuis la liste officielle française au démarrage si elles manquent, gardées dans
// data/game-cards.json, puis servies à l'interface (/api/game/cards), qui les charge dans le moteur du jeu.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fetchCardData } from '../game/data/fetch.ts';
import { missingCards } from '../game/engine/cards/index.ts';
import { config } from './config.js';

const FILE = path.join(config.dataDir, 'game-cards.json');
let ready = null; // { json, gzip }
let running = null;

function use(data) {
  const json = JSON.stringify(data);
  ready = { json, gzip: zlib.gzipSync(json) };
}

function readFile() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return missingCards(data).length ? null : data;
  } catch {
    return null;
  }
}

// Au démarrage (et toutes les heures tant qu'elles manquent) : informations du fichier, sinon téléchargées
export function ensureGameCards({ log = console.log } = {}) {
  if (ready) return Promise.resolve();
  running ??= (async () => {
    const local = readFile();
    if (local) return use(local);
    log('Jeu : téléchargement des informations des cartes...');
    const data = await fetchCardData();
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
    use(data);
    log(`Jeu : ${Object.keys(data).length} cartes jouables`);
  })().catch((err) => log('Jeu : informations des cartes indisponibles :', err.message)).finally(() => { running = null; });
  return running;
}

export function gameCards() {
  return ready;
}
