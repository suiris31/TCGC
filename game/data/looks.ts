// Visuels choisis pour un deck : la version de chaque carte (parallèle, manga, SP...) et la DON!!. Purement
// cosmétique : le moteur ne les voit jamais. Gardés avec le deck (game_decks.looks, server/game-decks.js), envoyés à
// l'adversaire en ligne (seulement pour les cartes qu'il voit déjà) et rangés avec les parties.
// Un deck sans visuels choisis ('{}') montre la version de base de chaque carte et la DON!! standard.
import { findVersion } from '../boosters/sets/index.ts';
import type { CardData } from '../engine/types.ts';

export interface DeckLooks {
  arts?: Record<string, string>;  // numéro de carte -> version (variant) ; absent = 'base'
  don?: string;                   // identifiant d'une DON!! de GET /api/game/don ; absent = DON!! standard
}

export const NO_LOOKS: DeckLooks = {};

// Une version connue d'une carte : celles du catalogue (CardData.versions), ou d'un booster simulé (une impression
// gagnée doit rester utilisable même si le catalogue ne la connaît pas encore)
export function knownVersion(card: CardData | undefined, number: string, variant: string): boolean {
  return variant === 'base' || !!card?.versions?.some((v) => v.variant === variant) || !!findVersion(number, variant);
}

// Forme stockée : sans les choix par défaut, sans champ vide
export function compactLooks(looks: DeckLooks): DeckLooks {
  const arts = Object.fromEntries(Object.entries(looks.arts ?? {}).filter(([, v]) => v !== 'base').sort(([a], [b]) => a.localeCompare(b)));
  return { ...(Object.keys(arts).length ? { arts } : {}), ...(looks.don ? { don: looks.don } : {}) };
}

// Lecture tolérante d'une valeur stockée (JSON abîmé ou d'une autre forme : aucun visuel choisi)
export function parseLooks(json: unknown): DeckLooks {
  let v: unknown = json;
  if (typeof json === 'string') {
    try { v = JSON.parse(json); } catch { return {}; }
  }
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const arts = o.arts && typeof o.arts === 'object'
    ? Object.fromEntries(Object.entries(o.arts as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : {};
  return compactLooks({ arts, ...(typeof o.don === 'string' ? { don: o.don } : {}) });
}

// Numéros des cartes présentes dans un état de jeu (vue expurgée comprise : une carte cachée y vaut « ? »)
export function shownNumbers(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const x of value) shownNumbers(x, out);
  else if (value && typeof value === 'object') {
    for (const [k, x] of Object.entries(value)) {
      if (k === 'num' && typeof x === 'string') out.add(x);
      else if (typeof x === 'object') shownNumbers(x, out);
    }
  }
  return out;
}

// Visuels d'un adversaire tels qu'on peut les lui montrer : la DON!! (publique), et la version des seules cartes qu'il
// voit déjà. La table complète trahirait la liste du deck, qui ne quitte jamais le serveur.
export function visibleLooks(looks: DeckLooks | undefined, shown: Set<string>): DeckLooks | undefined {
  if (!looks) return undefined;
  const arts = Object.fromEntries(Object.entries(looks.arts ?? {}).filter(([num]) => shown.has(num)));
  return compactLooks({ arts, don: looks.don });
}
