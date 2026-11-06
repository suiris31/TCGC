// Recettes de ST27 (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).
// Écrit par `npm run cards:new -- ST27` (niveau 'generated'), puis relu par la tâche « set » : une recette relue
// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.
// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes
// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.
import type { RecipeSet } from '../types.ts';

export const RECIPES_ST27: RecipeSet = {
  set: 'ST27',
  entries: {
    'ST27-001': { level: 'verified', recipe: { num: 'ST27-001', abilities: [{ timing: 'activateMain', oncePerTurn: true, steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 4000, until: 'turn' }, cond: { kind: 'leaderType', types: ['Blackbeard Pirates'] } }], cost: [{ kind: 'restOwn', n: 1, what: 'cards', filter: { name: ['Fullalead'] } }] }, { timing: 'onKO', steps: [{ action: { kind: 'draw', n: 1 } }] }] } },
    'ST27-002': { level: 'verified', recipe: { num: 'ST27-002', abilities: [{ timing: 'activateMain', steps: [{ action: { kind: 'cost', target: { side: 'opp', zone: 'field', count: 1, upTo: true, filter: {}, characters: true }, amount: -1, until: 'turn' }, cond: { kind: 'leaderType', types: ['Blackbeard Pirates'] } }], cost: [{ kind: 'trashSelf' }] }, { timing: 'onKO', steps: [{ action: { kind: 'draw', n: 1 } }] }] } },
    'ST27-003': { level: 'verified', recipe: { num: 'ST27-003', abilities: [{ timing: 'onKO', steps: [{ action: { kind: 'play', from: 'trash', count: 1, upTo: true, filter: { costMax: 5, types: ['Blackbeard Pirates'], category: ['CHARACTER'] }, rested: true } }] }], keywords: ['Blocker'] } },
    'ST27-004': { level: 'verified', recipe: { num: 'ST27-004', abilities: [{ timing: 'static', steps: [{ cond: { kind: 'leaderType', types: ['Blackbeard Pirates'] }, group: [{ action: { kind: 'keyword', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, keyword: 'Blocker', until: 'permanent' } }, { action: { kind: 'cost', target: { side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {}, characters: true }, amount: 1, until: 'permanent', per: { every: 4, count: { kind: 'trash' } } } }] }] }, { timing: 'onPlay', steps: [{ action: { kind: 'discard', n: 1 } }] }] } },
    'ST27-005': { level: 'verified', recipe: { num: 'ST27-005', abilities: [{ timing: 'activateMain', steps: [{ action: { kind: 'ko', target: { side: 'any', zone: 'field', count: 1, upTo: true, filter: { costMax: 3 }, characters: true } } }], cost: [{ kind: 'restSelf' }] }, { timing: 'onKO', steps: [{ action: { kind: 'trashToHand', count: 1, upTo: true, filter: { color: ['Black'] } } }] }] } },
    // cards:new : nouvelles entrées au-dessus de cette ligne
  },
};
