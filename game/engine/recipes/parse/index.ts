// Traducteur (tâche C1.4, familles en C2) : texte officiel anglais → recette. Squelette de la tâche 0 : rien n'est encore
// compris (01-contrats.md § 15.4). Le texte n'est lu que pendant le développement (cards:new), jamais pendant la partie.
import type { Recipe } from '../types.ts';

// ok : recette sans reste ; sinon, la recette partielle (ce qui est compris) et les morceaux non compris, normalisés
// (chiffres, {types}, [noms] remplacés : jamais une phrase de carte telle quelle dans un fichier du dépôt)
export type ParseResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; partial?: Recipe; unknown: string[] };

export interface ParseInput {
  num: string;
  effectEn: string;
  triggerEn: string | null;
}

export function parseCard(input: ParseInput): ParseResult {
  return { ok: false, unknown: [`${input.num} : traducteur pas encore écrit (tâche C1.4)`] };
}
