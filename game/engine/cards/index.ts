// Toutes les cartes connues : informations officielles + comportement codé.
// Les informations officielles (nom, coût, texte VF...) viennent de la liste française de Bandai. Elles ne sont pas
// dans le dépôt : le serveur les télécharge (game/data/fetch.ts) et chacun les charge au démarrage avec loadCardData
// (navigateur et fils de calcul : depuis l'API ; tests et scripts : game/data/node.ts).
import { DECKS } from '../decks.ts';
import type { CardBehavior, CardData, CardDef } from '../types.ts';
import { ST31 } from './st31.ts';
import { ST32 } from './st32.ts';
import { ST33 } from './st33.ts';
import { ST34 } from './st34.ts';
import { ST35 } from './st35.ts';
import { ST36 } from './st36.ts';

const BEHAVIORS: Record<string, CardBehavior> = { ...ST31, ...ST32, ...ST33, ...ST34, ...ST35, ...ST36 };

// Rempli par loadCardData (toujours le même objet : les modules qui l'importent voient les cartes chargées)
export const CARDS: Record<string, CardDef> = {};
let raw: Record<string, CardData> = {};

export function loadCardData(data: Record<string, CardData>) {
  raw = { ...raw, ...data };
  for (const [num, d] of Object.entries(data)) CARDS[num] = { ...d, ...BEHAVIORS[num] };
}

// Données telles que chargées (à transmettre aux fils de calcul)
export function cardData(): Record<string, CardData> {
  return raw;
}

// Cartes dont le moteur a besoin : celles des decks jouables, rangées par extension de la liste officielle où les
// chercher (une carte rééditée dans un deck est prise dans la liste de ce deck)
export function neededCards(): Map<string, string[]> {
  const bySeries = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const deck of Object.values(DECKS)) {
    const nums = [deck.leader, ...Object.keys(deck.cards)].filter((n) => !seen.has(n));
    nums.forEach((n) => seen.add(n));
    bySeries.set(deck.series, [...(bySeries.get(deck.series) ?? []), ...nums]);
  }
  return bySeries;
}

export function missingCards(data: Record<string, CardData>): string[] {
  return [...neededCards().values()].flat().filter((n) => !data[n]);
}
