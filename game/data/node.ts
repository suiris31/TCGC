// Chargement du catalogue des cartes pour les tests et les scripts (Node) : fichier data/game-catalog.json, créé par
// `npm run game:cards` (ou par le serveur à son démarrage). Le dossier data/ n'est pas dans le dépôt.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCardData, missingCards } from '../engine/cards/index.ts';
import type { Catalog } from './catalog.ts';

export const CATALOG_FILE = join(import.meta.dirname, '..', '..', 'data', 'game-catalog.json');

export function readCatalog(file = CATALOG_FILE): Catalog {
  if (!existsSync(file)) throw new Error(`Catalogue des cartes absent (${file}) : lance d'abord « npm run game:cards »`);
  return JSON.parse(readFileSync(file, 'utf8')) as Catalog;
}

export function loadLocalCards(file = CATALOG_FILE) {
  const { cards } = readCatalog(file);
  const missing = missingCards(cards);
  if (missing.length) throw new Error(`Cartes absentes de ${file} : ${missing.join(', ')}. Relance « npm run game:cards »`);
  loadCardData(cards);
}
