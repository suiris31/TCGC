// Catalogue des cartes pour les processus Node de l'apprentissage (serveur d'environnements, tests, outils).
// Par défaut data/game-catalog.json (créé par « npm run game:cards » à partir des listes officielles) ; la variable
// d'environnement OPCG_CATALOG ou l'option --catalog désigne un autre fichier. Un catalogue marqué « synthetic »
// (game/rl/testing/synthetic-catalog.ts, données inventées pour tester le pipeline sans réseau) est signalé partout.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardData, HIDDEN, loadCardData, missingCards } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';
import { CATALOG_FILE } from '../data/node.ts';
import { clearStaticCache, STATIC_DIM, staticFeatures } from './features.ts';

export interface LoadedCatalog {
  file: string;
  synthetic: boolean;
  count: number;
}

let loaded: LoadedCatalog | null = null;

export function loadRlCatalog(file = process.env.OPCG_CATALOG || CATALOG_FILE): LoadedCatalog {
  if (loaded && loaded.file === file) return loaded;
  if (!existsSync(file)) {
    throw new Error(`Catalogue des cartes absent (${file}). Lance d'abord « npm run game:cards » (accès à `
      + `fr.onepiece-cardgame.com et en.onepiece-cardgame.com nécessaire), ou donne un fichier avec OPCG_CATALOG.`);
  }
  const json = JSON.parse(readFileSync(file, 'utf8')) as { cards: Record<string, CardData>; synthetic?: boolean };
  const missing = missingCards(json.cards);
  if (missing.length) throw new Error(`Cartes des decks absentes de ${file} : ${missing.join(', ')}. Relance « npm run game:cards ».`);
  loadCardData(json.cards);
  clearStaticCache();
  loaded = { file, synthetic: Boolean(json.synthetic), count: Object.keys(json.cards).length };
  return loaded;
}

// Table des cartes : « ? » (carte cachée) en premier, puis tout le catalogue par numéro
export function cardTable(): string[] {
  return [HIDDEN, ...Object.keys(cardData()).sort()];
}

// Caractéristiques statiques de toutes les cartes de la table (lignes dans l'ordre de cardTable())
export function staticMatrix(table: string[]): Float32Array {
  const m = new Float32Array(table.length * STATIC_DIM);
  table.forEach((num, i) => m.set(staticFeatures(num), i * STATIC_DIM));
  return m;
}

// Version du programme (commit git), enregistrée avec les trajectoires et les modèles
export function engineVersion(): string {
  try {
    return execSync('git describe --always --dirty', { cwd: join(import.meta.dirname, '..', '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'inconnue';
  }
}
