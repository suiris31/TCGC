// Point d'enregistrement des recettes : chaque tâche « set » ajoute l'import de son fichier recipes/sets/<set>.ts et
// son RecipeSet à la fin de RECIPE_SETS (une ligne chacun, sans réorganiser le reste). Chargées par C1.1 après le
// code à la main (le code à la main l'emporte).
import type { RecipeSet } from '../types.ts';
import { RECIPES_OP15 } from './op15.ts';

export const RECIPE_SETS: RecipeSet[] = [
  RECIPES_OP15,
];
