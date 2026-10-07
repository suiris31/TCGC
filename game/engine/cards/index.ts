// Toutes les cartes connues : informations officielles + comportement codé.
// Les informations officielles (nom, coût, texte...) viennent des listes française et anglaise de Bandai. Elles ne sont
// pas dans le dépôt : le serveur les télécharge (game/data/catalog.ts) et chacun les charge au démarrage avec
// loadCardData (navigateur et fils de calcul : depuis l'API ; tests et scripts : game/data/node.ts).
import { DECKS } from '../decks.ts';
import { onlyGenericEffects } from '../keywords.ts';
import type { CardBehavior, CardData, CardDef } from '../types.ts';
import { ST31 } from './st31.ts';
import { ST32 } from './st32.ts';
import { ST33 } from './st33.ts';
import { ST34 } from './st34.ts';
import { ST35 } from './st35.ts';
import { ST36 } from './st36.ts';

const BEHAVIORS: Record<string, CardBehavior> = { ...ST31, ...ST32, ...ST33, ...ST34, ...ST35, ...ST36 };

// Carte cachée, telle qu'un joueur la voit dans une partie en ligne (main adverse, decks, Vies face cachée : voir
// view.ts). L'interface peut la lire sans erreur ; elle l'affiche de dos.
export const HIDDEN = '?';
const HIDDEN_CARD: CardDef = {
  number: HIDDEN, imageId: '', lang: 'fr', rarity: '', category: 'CHARACTER', name: 'Carte cachée', names: [], cost: null,
  life: null, power: null, counter: null, colors: [], types: [], typeLabels: [], attributes: [], effect: '', trigger: null,
  effectEn: '', triggerEn: null, keywords: [], blocks: [],
};

// Rempli par loadCardData (toujours le même objet : les modules qui l'importent voient les cartes chargées)
export const CARDS: Record<string, CardDef> = { [HIDDEN]: HIDDEN_CARD };
let raw: Record<string, CardData> = {};

// Visuel d'une carte d'un deck préconstruit : celui de ce deck (le premier deck qui la contient)
function deckImage(num: string, d: CardData): string {
  for (const deck of Object.values(DECKS)) {
    const art = d.deckArt?.[deck.series];
    if (art && (deck.leader === num || deck.cards[num])) return art;
  }
  return d.imageId;
}

export function loadCardData(data: Record<string, CardData>) {
  raw = { ...raw, ...data };
  for (const [num, d] of Object.entries(data)) CARDS[num] = { ...d, imageId: deckImage(num, d), ...BEHAVIORS[num] };
}

// Carte jouable ? 'coded' : comportement codé et testé ; 'auto' : seulement des mots-clés et effets gérés par le moteur
// (ou aucun effet) ; 'todo' : pas encore codée
export type CardStatus = 'coded' | 'auto' | 'todo';

export function cardStatus(num: string): CardStatus {
  if (BEHAVIORS[num]) return 'coded';
  const d = raw[num];
  return d && onlyGenericEffects(d) ? 'auto' : 'todo';
}

// Données telles que chargées (à transmettre aux fils de calcul)
export function cardData(): Record<string, CardData> {
  return raw;
}

// Cartes dont l'interface et l'IA ont besoin : celles des decks jouables
export function neededCards(): string[] {
  return [...new Set(Object.values(DECKS).flatMap((deck) => [deck.leader, ...Object.keys(deck.cards)]))];
}

export function missingCards(data: Record<string, CardData>): string[] {
  return neededCards().filter((n) => !data[n]);
}
