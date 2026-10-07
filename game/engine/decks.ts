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
};

export function deckSize(deck: DeckList) {
  return Object.values(deck.cards).reduce((sum, n) => sum + n, 0);
}
