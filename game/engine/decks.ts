// Decks jouables : Leader + 50 cartes (quantités par numéro de carte).
// Les decks pour débutant ne sont pas détaillés par Bandai : listes vérifiées ailleurs (source indiquée).
import { ADVENTURE_DECKS } from '../adventure/decks.ts';

export interface DeckList {
  id: string;
  name: string;
  // extension du deck (ex. "ST-35") : ses cartes gardent leur illustration de ce deck (voir cards/index.ts)
  series: string;
  leader: string;
  cards: Record<string, number>;
}

export const DECKS: Record<string, DeckList> = {
  // https://x.com/OPMerchandise/status/2073454304040820780
  'ST-35': {
    id: 'ST-35',
    name: 'Sabo (rouge/noir)',
    series: 'ST-35',
    leader: 'OP13-004',
    cards: {
      'OP13-008': 4, 'OP12-090': 4, 'ST35-003': 4, 'OP12-093': 4, 'OP13-005': 4, 'P-105': 4, 'ST35-001': 4,
      'ST35-002': 2, 'OP13-081': 4, 'ST35-005': 2, 'OP13-017': 4, 'ST35-004': 2, 'OP12-098': 4, 'OP13-019': 4,
    },
  },
  // https://x.com/OPMerchandise/status/2073444961509605822
  'ST-31': {
    id: 'ST-31',
    name: 'Luffy (rouge)',
    series: 'ST-31',
    leader: 'ST21-001',
    cards: { 'ST31-001': 2, 'ST31-004': 2, 'ST31-005': 2, 'ST31-002': 4, 'ST31-003': 4, 'OP01-016': 4, 'OP04-016': 4, 'OP11-003': 4, 'OP11-009': 4, 'OP11-012': 4, 'OP13-021': 4, 'OP14-015': 4, 'P-101': 4, 'ST23-004': 4 },
  },
  // https://x.com/OPMerchandise/status/2073446851483951406
  'ST-32': {
    id: 'ST-32',
    name: 'Zoro (vert)',
    series: 'ST-32',
    leader: 'OP12-020',
    cards: { 'ST32-002': 2, 'ST32-003': 2, 'ST32-005': 2, 'ST32-001': 4, 'ST32-004': 4, 'OP10-036': 4, 'OP12-023': 4, 'OP12-026': 4, 'OP12-027': 4, 'OP12-028': 4, 'OP12-031': 4, 'OP12-039': 4, 'OP15-036': 4, 'ST24-005': 4 },
  },
  // https://x.com/OPMerchandise/status/2073449244451815538
  'ST-33': {
    id: 'ST-33',
    name: 'Kuzan (bleu)',
    series: 'ST-33',
    leader: 'OP12-040',
    cards: { 'ST33-003': 2, 'ST33-004': 2, 'ST33-005': 2, 'ST33-001': 4, 'ST33-002': 4, 'EB04-026': 4, 'EB04-028': 4, 'OP12-043': 4, 'OP12-045': 4, 'OP12-046': 4, 'OP12-047': 4, 'OP12-050': 4, 'OP12-052': 4, 'OP12-057': 4 },
  },
  // https://x.com/OPMerchandise/status/2073452499948978618
  'ST-34': {
    id: 'ST-34',
    name: 'Katakuri (violet)',
    series: 'ST-34',
    leader: 'OP11-062',
    cards: { 'ST34-001': 2, 'ST34-003': 2, 'ST34-004': 2, 'ST34-002': 4, 'ST34-005': 4, 'EB03-032': 4, 'EB03-035': 4, 'OP11-065': 4, 'OP11-066': 4, 'OP11-068': 4, 'OP11-071': 4, 'OP11-079': 4, 'OP11-081': 4, 'P-090': 4 },
  },
  // https://x.com/OPMerchandise/status/2073456328232804634
  'ST-36': {
    id: 'ST-36',
    name: 'Kid (jaune)',
    series: 'ST-36',
    leader: 'OP10-099',
    cards: { 'ST36-002': 2, 'ST36-003': 2, 'ST36-005': 2, 'ST36-001': 4, 'ST36-004': 4, 'OP10-101': 4, 'OP10-103': 4, 'OP10-109': 4, 'OP10-111': 4, 'OP10-114': 4, 'OP12-113': 4, 'OP13-116': 4, 'P-085': 4, 'P-088': 4 },
  },
  // Méta d'octobre 2026, variante « Équipage de Chapeau de paille / Erbaf » : 1re place d'un tournoi qualificatif en
  // boutique (Asie, format Standard), 30 septembre 2026 ; liste validée par l'utilisateur le 12 octobre 2026.
  // https://opmetagame.com/tournaments/oo-gumgum-cs-store-qualifier-2026-09-30/
  // Une liste publiée ne change plus : une nouvelle version portera un autre identifiant.
  'META-SABO-2026-10': {
    id: 'META-SABO-2026-10',
    name: 'Sabo (méta, octobre 2026)',
    series: 'META',
    leader: 'OP13-004',
    cards: {
      'OP01-016': 3, 'OP04-016': 2, 'OP13-007': 3, 'OP15-088': 4, 'OP17-080': 4, 'OP17-082': 4, 'OP17-083': 2, 'OP17-084': 3,
      'OP17-086': 3, 'OP17-087': 4, 'OP17-089': 4, 'OP17-093': 3, 'OP17-095': 4, 'OP17-119': 4, 'ST01-011': 3,
    },
  },
  // Méta d'octobre 2026, variante « Pays de Wano / Équipage du Roux » : 1re place d'un tournoi Flagship (Asie, format
  // Standard), 4 octobre 2026 ; liste validée par l'utilisateur le 12 octobre 2026.
  // https://opmetagame.com/tournaments/oo-gumgum-flagship-2026-10-04/
  'META-MIHAWK-2026-10': {
    id: 'META-MIHAWK-2026-10',
    name: 'Mihawk (méta, octobre 2026)',
    series: 'META',
    leader: 'OP14-020',
    cards: {
      'OP01-055': 3, 'OP06-033': 3, 'OP06-038': 3, 'OP07-022': 4, 'OP08-036': 3, 'OP12-023': 4, 'OP12-034': 4, 'OP13-031': 4,
      'OP14-038': 3, 'OP14-039': 3, 'OP17-022': 4, 'OP17-031': 4, 'ST32-001': 4, 'ST32-002': 4,
    },
  },
  // Méta d'octobre 2026, variante « Équipage de Big Mom » : 1re place (5-0) d'un tournoi Flagship (Japon, format
  // Standard), liste publiée le 6 octobre 2026 ; choisie sans validation, à la demande de l'utilisateur (la plus récente
  // des listes OP-17 trouvées, même ossature que les autres).
  // https://gumgum.gg/one-piece/decklist/OP09-062/nico-robin/OP17
  'META-ROBIN-2026-10': {
    id: 'META-ROBIN-2026-10',
    name: 'Nico Robin (méta, octobre 2026)',
    series: 'META',
    leader: 'OP09-062',
    cards: {
      'EB04-058': 3, 'OP05-073': 2, 'OP09-078': 4, 'OP16-119': 4, 'OP17-074': 4, 'OP17-102': 4, 'OP17-106': 3, 'OP17-107': 4,
      'OP17-109': 4, 'OP17-110': 2, 'OP17-112': 4, 'OP17-113': 4, 'OP17-114': 4, 'ST34-003': 4,
    },
  },
  // Méta d'octobre 2026 : 1re place d'un tournoi Flagship (Asie, format Standard), 4 octobre 2026 ; choisie sans
  // validation, à la demande de l'utilisateur (la plus récente des listes OP-17 trouvées, même base que les autres).
  // https://opmetagame.com/tournaments/oo-gumgum-flagship-2026-10-04/
  'META-XEBEC-2026-10': {
    id: 'META-XEBEC-2026-10',
    name: 'Rocks D. Xebec (méta, octobre 2026)',
    series: 'META',
    leader: 'OP17-039',
    cards: {
      'EB02-030': 1, 'OP08-051': 4, 'OP17-040': 4, 'OP17-041': 3, 'OP17-042': 2, 'OP17-044': 4, 'OP17-045': 4, 'OP17-046': 4,
      'OP17-048': 4, 'OP17-049': 4, 'OP17-054': 4, 'OP17-055': 4, 'OP17-056': 4, 'OP17-118': 4,
    },
  },
  // Méta d'octobre 2026 : 2e place d'un Regional (format Standard), 4 octobre 2026 ; choisie sans validation, à la
  // demande de l'utilisateur (le plus gros tournoi parmi les listes d'octobre trouvées, proche de leur médiane).
  // https://opmetagame.com/tournaments/oo-egman-organized-play-events-london-regionals-2026-10-04/
  'META-ENEL-2026-10': {
    id: 'META-ENEL-2026-10',
    name: 'Ener (méta, octobre 2026)',
    series: 'META',
    leader: 'OP15-058',
    cards: {
      'OP05-077': 2, 'OP07-064': 2, 'OP09-077': 1, 'OP10-067': 3, 'OP12-071': 4, 'OP13-076': 1, 'OP15-061': 4, 'OP15-066': 2,
      'OP15-067': 4, 'OP15-071': 4, 'OP15-074': 3, 'OP15-075': 4, 'OP15-076': 4, 'OP15-077': 4, 'OP15-078': 4, 'OP15-118': 1,
      'ST10-010': 3,
    },
  },
  // Méta d'octobre 2026 : 1re place d'un tournoi Standard Battle (Japon, format Standard), 4 octobre 2026 ; choisie sans
  // validation, à la demande de l'utilisateur (la seule liste d'octobre publiée trouvée).
  // https://opmetagame.com/tournaments/oo-gumgum-standard-battle-2026-10-04/
  'META-KAIDO-2026-10': {
    id: 'META-KAIDO-2026-10',
    name: 'Kaido (méta, octobre 2026)',
    series: 'META',
    leader: 'OP17-058',
    cards: {
      'EB04-031': 4, 'EB04-032': 4, 'EB04-040': 1, 'OP07-076': 3, 'OP07-077': 4, 'OP08-074': 3, 'OP13-076': 2, 'OP15-077': 1,
      'OP15-078': 4, 'OP17-061': 3, 'OP17-062': 4, 'OP17-063': 3, 'OP17-065': 2, 'OP17-068': 1, 'OP17-073': 4, 'OP17-074': 4,
      'ST34-004': 3,
    },
  },
  // Decks pour débutant EX (phase 4D) : listes officielles relevées sur https://cardgamebase.com (quantités par numéro
  // de carte, total vérifié : 50 cartes).
  // https://cardgamebase.com/one-piece-st21-decklist-card-list/
  'ST-21': {
    id: 'ST-21',
    name: 'Luffy Gear 5 (rouge)',
    series: 'ST-21',
    leader: 'ST21-001',
    cards: {
      'ST21-002': 2, 'ST21-003': 2, 'ST21-004': 4, 'ST21-005': 4, 'ST21-006': 4, 'ST21-007': 4, 'ST21-008': 4, 'ST21-009': 4,
      'ST21-010': 2, 'ST21-011': 4, 'ST21-012': 4, 'ST21-013': 4, 'ST21-014': 2, 'ST21-015': 2, 'ST21-016': 2, 'ST21-017': 2,
    },
  },
  // https://cardgamebase.com/one-piece-st22-decklist-card-list/
  'ST-22': {
    id: 'ST-22',
    name: 'Ace et Newgate (bleu)',
    series: 'ST-22',
    leader: 'ST22-001',
    cards: {
      'ST22-002': 2, 'ST22-003': 2, 'ST22-004': 4, 'ST22-005': 4, 'ST22-006': 4, 'ST22-007': 4, 'ST22-008': 4, 'ST22-009': 4,
      'ST22-010': 2, 'ST22-011': 4, 'ST22-012': 4, 'ST22-013': 4, 'ST22-014': 2, 'ST22-015': 2, 'ST22-016': 2, 'ST22-017': 2,
    },
  },
  // https://cardgamebase.com/one-piece-st30-decklist-card-list/ (les noms des Événements y sont mélangés : les numéros
  // font foi)
  'ST-30': {
    id: 'ST-30',
    name: 'Luffy et Ace (rouge/vert)',
    series: 'ST-30',
    leader: 'ST30-001',
    cards: {
      'ST30-002': 2, 'ST30-003': 4, 'ST30-004': 2, 'ST30-005': 4, 'ST30-006': 4, 'ST30-007': 2, 'ST30-008': 4, 'ST30-009': 4,
      'ST30-010': 4, 'ST30-011': 2, 'ST30-012': 2, 'ST30-013': 4, 'ST30-014': 2, 'ST30-015': 4, 'ST30-016': 2, 'ST30-017': 4,
    },
  },
  // Deck de départ de l'Aventure (tâche 1.14) : STARTER DECK -Straw Hat Crew- [ST-01], liste relevée sur
  // https://laughtale-pirates.com/askerbert/one-piece-cardlist-starterdeck01 (quantités par carte, 51 cartes avec le
  // Leader comme l'annonce Bandai ; d'autres sites se contredisent ou ne totalisent pas 50)
  'ST-01': {
    id: 'ST-01',
    name: 'Chapeaux de paille (rouge)',
    series: 'ST-01',
    leader: 'ST01-001',
    cards: {
      'ST01-002': 4, 'ST01-003': 4, 'ST01-004': 4, 'ST01-005': 4, 'ST01-006': 4, 'ST01-007': 4, 'ST01-008': 4, 'ST01-009': 4,
      'ST01-010': 4, 'ST01-011': 2, 'ST01-012': 2, 'ST01-013': 2, 'ST01-014': 2, 'ST01-015': 2, 'ST01-016': 2, 'ST01-017': 2,
    },
  },
  // Adversaires de l'arc East Blue (tâche 1.19) : listes dans game/adventure/decks.ts, toujours à la fin (l'ordre de
  // DECKS sert aux graines des parties de vérification)
  ...ADVENTURE_DECKS,
};

// Decks réservés à l'aventure (adversaires des chapitres) : jouables, mais absents du choix libre des decks, du tirage
// « Aléatoire » et du salon en ligne
export const ADVENTURE_SERIES = 'AVENTURE';
export const isAdventureOnly = (id: string) => DECKS[id]?.series === ADVENTURE_SERIES;
// Decks du registre proposés hors de l'aventure, dans l'ordre de DECKS
export const freeDeckIds = () => Object.keys(DECKS).filter((id) => !isAdventureOnly(id));

export function deckSize(deck: Pick<DeckList, 'cards'>) {
  return Object.values(deck.cards).reduce((sum, n) => sum + n, 0);
}

// Decks personnalisés (phase 5) : construits par un joueur, gardés par le serveur pour son compte. Leur identifiant
// commence par PERSO- ; leur liste est secrète pour l'adversaire (en ligne comme pour l'IA, qui la devine).
export const CUSTOM_PREFIX = 'PERSO-';
export const CUSTOM_SERIES = 'PERSO';
export const isCustomDeck = (id: string) => id.startsWith(CUSTOM_PREFIX);

// Deck d'une partie : l'identifiant d'un deck du registre, ou la liste complète (deck personnalisé)
export type DeckSource = string | DeckList;

export function resolveDeck(deck: DeckSource): DeckList {
  if (typeof deck !== 'string') return deck;
  const found = DECKS[deck];
  if (!found) throw new Error(`Deck inconnu : ${deck}`);
  return found;
}

// Liste connue de tous (deck du registre : préconstruit ou du méta) ; null pour un deck personnalisé
export const publicList = (deckId: string): DeckList | null => DECKS[deckId] ?? null;
