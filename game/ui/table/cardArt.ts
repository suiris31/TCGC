// Le visuel de chaque carte sur le plateau (tâche R3.12) : la version choisie pour le deck de son propriétaire
// (looks.arts, éditeur de decks), la version de base sinon. Même source que les DON!! (table/donLooks.ts) : contre
// l'IA, mes decks ; en ligne, la vue du serveur (MatchView.looks, réduite aux cartes que je vois déjà).
import type { GameState, PlayerId } from '../../engine/types.ts';
import { myDeckLooks, type SeatLooks } from './donLooks.ts';

// Propriétaire d'une carte, où qu'elle soit (terrain, main, Défausse, Vie, deck) ; undefined si elle n'est nulle part
export function cardOwner(s: GameState, uid: number): PlayerId | undefined {
  for (const p of [0, 1] as PlayerId[]) {
    const pl = s.players[p];
    if (pl.leader.uid === uid || pl.stage?.uid === uid || pl.chars.some((f) => f.uid === uid)
      || pl.hand.some((c) => c.uid === uid) || pl.trash.some((c) => c.uid === uid) || pl.life.some((c) => c.uid === uid)
      || pl.deck.some((c) => c.uid === uid)) return p;
  }
  return undefined;
}

// La version choisie d'une carte du joueur p : celle que dit le serveur (partie en ligne, given), sinon celle de mon deck
export function artChoice(s: GameState, p: PlayerId | undefined, num: string, given: SeatLooks | null, mine = myDeckLooks): string | undefined {
  if (p === undefined) return undefined;
  return (given ? given[p] : mine(s.players[p].deckId))?.arts?.[num];
}
