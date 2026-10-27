// Quelle DON!! montrer pour chaque joueur (tâche R2.11, fonctions pures autour de table/DonArt.tsx) : la DON!! choisie
// pour son deck (looks.don), la standard sinon ; aucune quand le serveur a coupé les visuels.
import type { DeckLooks } from '../../data/looks.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { deckInfo, type MyDeck } from '../myDecks.ts';

// Les DON!! connues (GET /api/game/don) : l'adresse du visuel de chacune
export interface DonCatalog {
  drawn: boolean;               // visuels coupés par le serveur (retrait des images) : pas de visuel
  images: Map<string, string>;  // identifiant -> adresse du visuel
  standard: string | null;      // adresse du visuel de la DON!! standard (la première de la liste)
}

export function donCatalog(dons: { id: string; imageUrl: string }[], drawn = false, base = '/'): DonCatalog {
  return { drawn, images: new Map(dons.map((d) => [d.id, `${base}${d.imageUrl}`])), standard: dons.length ? `${base}${dons[0].imageUrl}` : null };
}

// Le visuel d'une DON!! choisie (une DON!! inconnue, ou retirée depuis : la standard) ; null : pas de visuel
export function donImage(catalog: DonCatalog | null, id: string | undefined): string | null {
  if (!catalog || catalog.drawn) return null;
  return (id !== undefined ? catalog.images.get(id) : undefined) ?? catalog.standard;
}

// Visuels de chaque siège
export type SeatLooks = { [seat in PlayerId]?: DeckLooks };

// Visuels choisis d'un de mes decks (un deck du registre n'en a pas)
export function myDeckLooks(deckId: string): DeckLooks | undefined {
  const looks = (deckInfo(deckId) as MyDeck | undefined)?.looks;
  return looks && Object.keys(looks).length ? looks : undefined;
}

// La DON!! choisie pour le joueur p : celle que dit le serveur (partie en ligne, given), sinon celle de mon deck
export function donChoice(s: GameState, p: PlayerId, given: SeatLooks | null, mine = myDeckLooks): string | undefined {
  return given ? given[p]?.don : mine(s.players[p].deckId)?.don;
}

// Visuels des decks d'une partie contre l'IA, gardés avec elle dans « Mes parties » (RecordInput.looks)
export function gameLooks(s: GameState, mine = myDeckLooks): SeatLooks | undefined {
  const out: SeatLooks = {};
  for (const p of [0, 1] as PlayerId[]) {
    const looks = mine(s.players[p].deckId);
    if (looks) out[p] = looks;
  }
  return Object.keys(out).length ? out : undefined;
}
