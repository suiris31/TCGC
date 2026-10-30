// Textes de l'interface du jeu qui reviennent d'un écran à l'autre (tâche R3.9) : le vocabulaire commun (annexe A du
// cadrage de la refonte, Plan-aventure/etudes/refonte-jouer.md) et la mise en forme des noms de cartes dans une phrase.
// Le jeu reste en français : ce fichier n'est pas une table de traduction. Les textes propres à un seul écran restent
// dans cet écran. game/tests/texts.test.ts vérifie que les anciens libellés ne reviennent pas.
import { CARDS } from '../engine/cards/index.ts';

// ---------- Les modes de jeu (accueil, Mes parties) ----------

// Le mode en ligne s'appelle « Jouer avec un ami » (accueil, salon), « Avec un ami » dans une liste
export const MODES = {
  quick: 'Partie rapide',        // contre l'IA, hors de l'aventure (#play/rapide)
  adventure: 'Aventure',
} as const;

// ---------- Le deck d'aventure (deck limité aux cartes de la Cale) ----------

export const ADVENTURE_DECK = {
  title: 'Deck d’aventure',      // bouton de la carte, titre de son écran ; dans une phrase : « deck d’aventure »
  mark: '🧭 deck d’aventure',    // repère à côté du nom d'un deck (Mes parties, partie avec un ami)
  markHelp: 'Deck d’aventure : seulement des cartes gagnées dans l’Aventure',
} as const;

// ---------- Boutons de retour : « ← <écran parent> » (prop back de Screen, ou bouton écrit à la main) ----------

export const BACK = {
  home: 'Accueil',               // l'accueil du jeu (#play)
  map: 'Carte',                  // la carte de l'aventure
  chapter: 'Chapitre',           // l'écran d'un chapitre (partie d'aventure qui n'a pas pu se lancer)
  shop: 'Boutique',
  hold: 'Cale',
  history: 'Mes parties',
} as const;

export const backText = (parent: string) => `← ${parent}`;

// Pendant une partie, le bouton de l'en-tête : c'est une sortie, pas un retour (la partie se reprend ensuite)
export const LEAVE_GAME = { label: 'Quitter', title: 'Quitter la partie' } as const;

// ---------- Noms de cartes dans une phrase ----------

// Noms de cartes qui contiennent une virgule (« Kamazo, le tueur à la faucille »), du plus long au plus court ;
// recalculés quand le catalogue change (il est chargé après le premier affichage)
let commaNames: { size: number; names: string[] } = { size: -1, names: [] };
function namesWithComma(): string[] {
  const size = Object.keys(CARDS).length;
  if (commaNames.size !== size) {
    const names = new Set(Object.values(CARDS).map((c) => c.name).filter((n) => n.includes(',')));
    commaNames = { size, names: [...names].sort((a, b) => b.length - a.length) };
  }
  return commaNames.names;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Le moteur écrit les listes de cartes avec des virgules (« Main de départ : Nami, Kamazo, le tueur à la faucille,
// Zoro. La garder ? ») : un nom qui contient lui-même une virgule fait croire à une carte de plus. On met ces noms
// entre guillemets (« Kamazo, le tueur à la faucille »), sauf s'ils y sont déjà.
export function quoteCardNames(text: string): string {
  if (!text.includes(',')) return text;
  const names = namesWithComma().filter((n) => text.includes(n));
  if (!names.length) return text;
  const pattern = new RegExp(names.map(escape).join('|'), 'g');
  return text.replace(pattern, (name, at: number) => (/«\s*$/.test(text.slice(Math.max(0, at - 2), at)) ? name : `« ${name} »`));
}
