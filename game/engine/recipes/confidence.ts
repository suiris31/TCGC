// Niveau de confiance d'une carte (01-contrats.md § 15.3). Seuls 'verified', 'coded' et 'auto' la rendent jouable.
// Squelette de la tâche 0 : renvoie l'ancien statut (coded / auto / todo) ; la tâche C1.1 y ajoute les recettes chargées
// (recipes/sets/) et les doutes.
import { cardStatus } from '../cards/index.ts';
import { PLAYABLE_LEVELS, type Confidence } from './types.ts';

export function confidence(num: string): Confidence {
  return cardStatus(num);
}

export function isPlayableLevel(level: Confidence): boolean {
  return PLAYABLE_LEVELS.includes(level);
}
