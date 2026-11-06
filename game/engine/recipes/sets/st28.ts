// Recettes de ST28 (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).
// Écrit par `npm run cards:new -- ST28` (niveau 'generated'), puis relu par la tâche « set » : une recette relue
// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.
// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes
// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.
import type { RecipeSet } from '../types.ts';

export const RECIPES_ST28: RecipeSet = {
  set: 'ST28',
  entries: {
    'ST28-001': { level: 'verified', recipe: { num: 'ST28-001', abilities: [{ timing: 'onPlay', steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: { baseCostMax: 5 }, characters: true } }, cond: { kind: 'and', all: [{ kind: 'leaderType', types: ['Land of Wano'] }, { kind: 'life', side: 'opp', cmp: 'ge', n: 3 }] } }] }] } },
    'ST28-002': { level: 'verified', recipe: { num: 'ST28-002', abilities: [{ timing: 'static', don: 2, steps: [{ action: { kind: 'keyword', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, keyword: 'Blocker', until: 'permanent' } }] }, { timing: 'onPlay', steps: [{ action: { kind: 'keyword', target: { side: 'own', zone: 'field', count: 1, upTo: false, filter: { types: ['Land of Wano'] }, leader: true }, keyword: 'Banish', until: 'turn' } }] }] } },
    'ST28-003': { level: 'verified', recipe: { num: 'ST28-003', abilities: [], trigger: { timing: 'trigger', steps: [{ action: { kind: 'playSelf' }, cond: { kind: 'and', all: [{ kind: 'leaderType', types: ['Land of Wano'] }, { kind: 'life', side: 'opp', cmp: 'le', n: 3 }] } }] } } },
    'ST28-005': { level: 'verified', recipe: { num: 'ST28-005', abilities: [{ timing: 'static', don: 2, yourTurn: true, steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 3000, until: 'permanent' } }] }, { timing: 'onPlay', steps: [{ action: { kind: 'search', look: 5, take: 1, upTo: true, filter: { costMin: 2, types: ['Land of Wano'] }, dest: 'hand', rest: 'bottom' } }] }] } },
    // cards:new : nouvelles entrées au-dessus de cette ligne
  },
};
