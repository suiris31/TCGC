// Niveau de confiance d'une carte (01-contrats.md § 15.3). Seuls 'verified', 'coded' et 'auto' la rendent jouable.
//   1. un doute ('doubt') l'emporte sur tout, même sur une carte codée à la main (entrée handCoded) ;
//   2. code à la main : 'coded' ;
//   3. recette d'un fichier de set : son niveau ('verified' ou 'generated') si elle se compile entièrement, sinon 'todo'
//      (recette incomplète) ;
//   4. seulement des mots-clés gérés par le moteur (ou aucun effet) : 'auto' ;
//   5. sinon 'todo'.
import { genericOnly, handCoded, recipeCompiled, recipeEntry } from '../cards/index.ts';
import { PLAYABLE_LEVELS, type Confidence } from './types.ts';

export function confidence(num: string): Confidence {
  const entry = recipeEntry(num);
  if (entry?.level === 'doubt') return 'doubt';
  if (handCoded(num)) return 'coded';
  if (entry) return recipeCompiled(num)?.ok ? entry.level : 'todo';
  return genericOnly(num) ? 'auto' : 'todo';
}

export function isPlayableLevel(level: Confidence): boolean {
  return PLAYABLE_LEVELS.includes(level);
}
