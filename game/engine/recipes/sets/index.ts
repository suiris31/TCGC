// Point d'enregistrement des recettes : chaque tâche « set » ajoute l'import de son fichier recipes/sets/<set>.ts et
// son RecipeSet à la fin de RECIPE_SETS (une ligne chacun, sans réorganiser le reste). Chargées par C1.1 après le
// code à la main (le code à la main l'emporte).
import type { RecipeSet } from '../types.ts';
import { RECIPES_EB05 } from './eb05.ts';
import { RECIPES_OP17 } from './op17.ts';
import { RECIPES_OP16 } from './op16.ts';
import { RECIPES_OP15 } from './op15.ts';
import { RECIPES_EB03 } from './eb03.ts';
import { RECIPES_EB04 } from './eb04.ts';
import { RECIPES_OP14 } from './op14.ts';
import { RECIPES_ST29 } from './st29.ts';
import { RECIPES_OP12 } from './op12.ts';
import { RECIPES_ST28 } from './st28.ts';
import { RECIPES_ST27 } from './st27.ts';
import { RECIPES_ST25 } from './st25.ts';
import { RECIPES_ST23 } from './st23.ts';

export const RECIPE_SETS: RecipeSet[] = [
  RECIPES_EB05,
  RECIPES_OP17,
  RECIPES_OP16,
  RECIPES_OP15,
  RECIPES_EB03,
  RECIPES_EB04,
  RECIPES_OP14,
  RECIPES_ST29,
  RECIPES_OP12,
  RECIPES_ST28,
  RECIPES_ST27,
  RECIPES_ST25,
  RECIPES_ST23,
];
