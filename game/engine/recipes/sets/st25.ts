// Recettes de ST25 (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).
// Écrit par `npm run cards:new -- ST25` (niveau 'generated'), puis relu par la tâche « set » : une recette relue
// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.
// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes
// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.
import type { RecipeSet } from '../types.ts';

export const RECIPES_ST25: RecipeSet = {
  set: 'ST25',
  entries: {
    'ST25-001': { level: 'verified', recipe: { num: 'ST25-001', abilities: [{ timing: 'static', steps: [{ action: { kind: 'cost', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 1, until: 'permanent' }, cond: { kind: 'chars', side: 'own', cmp: 'ge', n: 2, filter: { baseCostMin: 5, category: ['CHARACTER'] } } }] }, { timing: 'onPlay', steps: [{ cond: { kind: 'leaderIs', names: ['Buggy'] }, group: [{ action: { kind: 'draw', n: 3 } }, { action: { kind: 'discard', n: 2 }, link: 'and' }] }] }] } },
    'ST25-005': { level: 'verified', recipe: { num: 'ST25-005', abilities: [{ timing: 'static', steps: [{ cond: { kind: 'chars', side: 'own', cmp: 'ge', n: 2, filter: { baseCostMin: 5, category: ['CHARACTER'] } }, group: [{ action: { kind: 'keyword', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, keyword: 'Blocker', until: 'permanent' } }, { action: { kind: 'cost', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 1, until: 'permanent' } }] }] }, { timing: 'onKO', steps: [{ action: { kind: 'draw', n: 1 }, cond: { kind: 'and', all: [{ kind: 'leaderIs', names: ['Buggy'] }, { kind: 'hand', side: 'own', cmp: 'le', n: 3 }] } }] }] } },
    // cards:new : nouvelles entrées au-dessus de cette ligne
  },
};
