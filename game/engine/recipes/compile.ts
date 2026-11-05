// Compilateur des recettes (tâche C1.1) : recette → CardBehavior fait de briques existantes (cards/bricks.ts).
// Squelette de la tâche 0 : rien n'est encore compilé ; la signature est celle du contrat (01-contrats.md § 15.4).
import type { CardBehavior } from '../types.ts';
import type { ManualCode, Recipe } from './types.ts';

// ok : le comportement de la carte ; sinon, les morceaux que le compilateur ne sait pas encore traduire en briques
// (« action power », « cost manual:clé absent »...), pour le rapport de couverture
export type CompileResult =
  | { ok: true; behavior: CardBehavior }
  | { ok: false; missing: string[] };

export function compileRecipe(recipe: Recipe, manual?: ManualCode): CompileResult {
  void manual;
  return { ok: false, missing: [`${recipe.num} : compilateur pas encore écrit (tâche C1.1)`] };
}
