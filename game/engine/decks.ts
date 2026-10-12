// Decks jouables : Leader + 50 cartes (quantités par numéro de carte).
// Les decks pour débutant ne sont pas détaillés par Bandai : listes vérifiées ailleurs (source indiquée).

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
};

export function deckSize(deck: DeckList) {
  return Object.values(deck.cards).reduce((sum, n) => sum + n, 0);
}
