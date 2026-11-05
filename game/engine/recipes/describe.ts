// Aller-retour (tâche C1.2) : recette → phrase anglaise normalisée (même normalisation que le traducteur) et phrase
// française lisible. Squelette de la tâche 0 : rien n'est encore décrit (01-contrats.md § 15.4).
import type { Recipe } from './types.ts';

export type DescribeResult =
  | { ok: true; en: string; fr: string }
  | { ok: false; missing: string[] };

export function describe(recipe: Recipe): DescribeResult {
  return { ok: false, missing: [`${recipe.num} : description pas encore écrite (tâche C1.2)`] };
}
