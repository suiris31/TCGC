// Recettes de ST29 (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).
// Écrit par `npm run cards:new -- ST29` (niveau 'generated'), puis relu par la tâche « set » : une recette relue
// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.
// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes
// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.
import type { RecipeSet } from '../types.ts';

export const RECIPES_ST29: RecipeSet = {
  set: 'ST29',
  entries: {
    'ST29-001': { level: 'verified', recipe: { num: 'ST29-001', abilities: [{ timing: 'whenAttacking', steps: [{ cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 }, group: [{ action: { kind: 'draw', n: 1 } }, { action: { kind: 'discard', n: 1 }, link: 'and' }] }] }] } },
    'ST29-003': { level: 'verified', note: 'S5 : effet et [Déclenchement] vérifiés par cards-op14.test.ts', recipe: { num: 'ST29-003', abilities: [{ timing: 'static', steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 1000, until: 'permanent' }, cond: { kind: 'lifeVsOpp', cmp: 'le' } }] }], trigger: { timing: 'trigger', steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMax: 3 }, characters: true } } }] } } },
    'ST29-013': { level: 'verified', note: 'S5 : effet et [Déclenchement] vérifiés par cards-op14.test.ts', recipe: { num: 'ST29-013', abilities: [], trigger: { timing: 'trigger', steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { costMaxOf: { kind: 'life', side: 'total' } }, characters: true } } }] } } },
    // cards:new : nouvelles entrées au-dessus de cette ligne
  },
};
