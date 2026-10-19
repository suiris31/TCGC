// Decks des adversaires de l'aventure (tâche 1.2) : listes à thème, identifiants AV-EB-<NOM>, series 'AVENTURE'.
// Ils ne sont pas encore jouables (leurs cartes sont codées à la vague 1B) : les chapitres utilisent en attendant des
// decks du registre déjà jouables. La tâche 1.19 enregistre ces decks dans game/engine/decks.ts et les branche.
import type { DeckList } from '../engine/decks.ts';

export const ADVENTURE_DECKS: Record<string, DeckList> = {};

// Vrai deck de chaque chapitre d'East Blue : identifiant du chapitre -> identifiant du deck (dans ADVENTURE_DECKS) ;
// la clé 'starterDeck' donne le vrai deck de départ de l'arc ('ST-01', tâche 1.14)
export const EAST_BLUE_REAL_DECKS: Record<string, string> = {};
