// Chargement des informations des cartes pour les tests et les scripts (Node) : fichier data/game-cards.json, créé par
// `npm run game:cards` (ou par le serveur à son démarrage). Le dossier data/ n'est pas dans le dépôt.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCardData, missingCards } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';

export const CARDS_FILE = join(import.meta.dirname, '..', '..', 'data', 'game-cards.json');

export function loadLocalCards(file = CARDS_FILE) {
  if (!existsSync(file)) throw new Error(`Informations des cartes absentes (${file}) : lance d'abord « npm run game:cards »`);
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, CardData>;
  const missing = missingCards(data);
  if (missing.length) throw new Error(`Cartes absentes de ${file} : ${missing.join(', ')}. Relance « npm run game:cards »`);
  loadCardData(data);
}
