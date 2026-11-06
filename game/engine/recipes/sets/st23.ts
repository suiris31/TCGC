// Recettes de ST23 (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).
// Écrit par `npm run cards:new -- ST23` (niveau 'generated'), puis relu par la tâche « set » : une recette relue
// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.
// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes
// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.
import type { RecipeSet } from '../types.ts';

export const RECIPES_ST23: RecipeSet = {
  set: 'ST23',
  entries: {
    'ST23-001': { level: 'verified', recipe: { num: 'ST23-001', abilities: [{ timing: 'static', steps: [{ action: { kind: 'cost', target: { side: 'own', zone: 'hand', self: true, count: 1, upTo: false, filter: {} }, amount: -4, until: 'permanent' }, cond: { kind: 'chars', side: 'own', cmp: 'ge', n: 1, filter: { powerMin: 10000, category: ['CHARACTER'] } } }] }], keywords: ['Blocker'] } },
    'ST23-002': { level: 'verified', recipe: { num: 'ST23-002', abilities: [{ timing: 'static', steps: [{ action: { kind: 'cost', target: { side: 'own', zone: 'hand', self: true, count: 1, upTo: false, filter: {} }, amount: -3, until: 'permanent' }, cond: { kind: 'chars', side: 'opp', cmp: 'ge', n: 1, filter: { basePowerMin: 8000, category: ['CHARACTER'] } } }] }, { timing: 'onPlay', steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', leader: true, count: 1, upTo: false, filter: {} }, amount: 2000, until: 'oppNextEnd' }, cond: { kind: 'or', any: [{ kind: 'leaderType', types: ['Red-Haired Pirates'] }, { kind: 'leaderIs', names: ['Uta'] }] } }] }] } },
    'ST23-003': { level: 'verified', recipe: { num: 'ST23-003', abilities: [{ timing: 'onPlay', steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { basePowerMax: 4000 }, characters: true } }, cond: { kind: 'leaderType', types: ['Red-Haired Pirates'] } }], cost: [{ kind: 'discard', n: 1 }] }] } },
    'ST23-005': { level: 'verified', recipe: { num: 'ST23-005', abilities: [{ timing: 'activateMain', oncePerTurn: true, steps: [{ action: { kind: 'giveDon', n: 1, upTo: true, rested: true, target: { side: 'own', zone: 'field', leader: true, characters: true, count: 1, upTo: false, filter: {} } } }] }] }, note: 'réimpression de OP14-005' },
    // cards:new : nouvelles entrées au-dessus de cette ligne
  },
};
