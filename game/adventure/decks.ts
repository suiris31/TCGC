// Decks des adversaires de l'aventure (tâche 1.2) : listes à thème, identifiants AV-EB-<NOM>, series 'AVENTURE'.
// Ils ne sont pas encore jouables (leurs cartes sont codées à la vague 1B) : les chapitres utilisent en attendant des
// decks du registre déjà jouables. La tâche 1.19 enregistre ces decks dans game/engine/decks.ts et les branche.
// Choix des cartes, listes à coder (A et B) et difficulté : game/docs/aventure-east-blue.md
import type { DeckList } from '../engine/decks.ts';

const deck = (id: string, name: string, leader: string, cards: Record<string, number>): DeckList =>
  ({ id, name, series: 'AVENTURE', leader, cards });

const DECK_LIST: DeckList[] = [
  // Chapitre 1, Shells Town (liste A) : la base de la Marine du capitaine Morgan, volontairement simple (beaucoup de
  // Personnages sans effet). Aucun Leader Morgan n'existe : Kobby (rouge/noir), présent à Shells Town.
  deck('AV-EB-MORGAN', 'Marine de Shells Town (Morgan)', 'OP11-001', {
    'OP03-091': 4, 'OP11-096': 4, 'OP15-009': 4, 'OP03-089': 4, 'OP02-107': 4, 'OP03-014': 4, 'ST06-013': 4,
    'ST06-011': 4, 'OP03-079': 4, 'OP11-094': 4, 'OP03-078': 2, 'OP11-099': 4, 'ST06-016': 4,
  }),
  // Chapitre 2, Orange Town (liste B) : Baggy, Cabaji, Morge et Richie, les boulets Baggy
  deck('AV-EB-BAGGY', 'Bande de Baggy (Orange Town)', 'OP16-041', {
    'ST03-011': 4, 'OP02-060': 4, 'OP02-058': 4, 'OP02-052': 4, 'OP09-054': 4, 'ST25-002': 4, 'ST25-004': 4,
    'OP12-055': 4, 'OP09-053': 4, 'OP16-048': 2, 'OP12-049': 4, 'OP09-058': 4, 'OP09-059': 4,
  }),
  // Chapitre 3, village de Sirop (liste A) : l'équipage du Chat Noir, qui épuise et met KO les Personnages épuisés
  deck('AV-EB-KURO', 'Pirates du Chat Noir (Kuro)', 'OP03-021', {
    'OP15-026': 4, 'OP15-028': 4, 'OP03-023': 4, 'OP03-039': 4, 'OP03-031': 4, 'OP03-035': 4, 'OP03-027': 4,
    'OP03-036': 4, 'OP03-034': 4, 'OP03-024': 2, 'OP03-028': 4, 'OP04-023': 4, 'OP14-025': 2, 'OP03-038': 2,
  }),
  // Chapitre 4, Baratie (liste B) : l'armada de Don Krieg, seulement des Personnages {East Blue} (effet du Leader)
  deck('AV-EB-KRIEG', 'Armada de Don Krieg (Baratie)', 'OP15-001', {
    'OP03-023': 4, 'OP03-031': 4, 'OP03-035': 4, 'OP03-024': 4, 'OP15-011': 4, 'OP03-033': 4, 'OP03-029': 4,
    'OP03-025': 4, 'OP15-007': 4, 'OP15-008': 2, 'OP15-037': 4, 'OP03-038': 4, 'OP15-038': 4,
  }),
  // Chapitre 5, Arlong Park (liste B) : les hommes-poissons et leurs [Déclenchement], que le Leader joue en attaquant
  deck('AV-EB-ARLONG', 'Pirates d’Arlong (Arlong Park)', 'OP03-022', {
    'OP03-101': 4, 'OP16-023': 2, 'OP03-030': 4, 'OP03-035': 4, 'EB02-011': 4, 'OP03-111': 4, 'OP03-104': 2,
    'OP03-026': 4, 'OP03-029': 4, 'OP03-033': 4, 'OP06-023': 4, 'OP03-116': 2, 'OP03-037': 4, 'OP03-118': 4,
  }),
  // Défi de Loguetown (liste B) : Baggy et Alvida alliés, la bande de Baggy renforcée (renvois en main, Alvida)
  deck('AV-EB-BAGGY-ALVIDA', 'Baggy et Alvida (Loguetown)', 'OP16-041', {
    'OP02-060': 4, 'OP02-058': 4, 'OP02-052': 4, 'OP09-054': 4, 'OP01-064': 4, 'ST25-002': 4, 'OP12-042': 4,
    'OP12-055': 4, 'OP16-048': 4, 'OP09-053': 2, 'OP12-049': 4, 'OP09-058': 4, 'OP09-059': 4,
  }),
  // Chapitre 6, Loguetown (liste A) : la Marine de Smoker, qui baisse les coûts adverses puis met KO les coûts 0
  deck('AV-EB-SMOKER', 'Marine de Loguetown (Smoker)', 'OP02-093', {
    'ST06-002': 4, 'OP03-091': 4, 'ST06-010': 4, 'OP03-089': 4, 'ST06-007': 2, 'ST06-006': 4, 'ST06-008': 4,
    'OP02-102': 4, 'ST06-011': 2, 'ST06-004': 4, 'ST06-012': 2, 'OP03-079': 2, 'OP03-078': 2, 'ST06-014': 4,
    'ST06-016': 2, 'OP02-117': 2,
  }),
];

export const ADVENTURE_DECKS: Record<string, DeckList> = Object.fromEntries(DECK_LIST.map((d) => [d.id, d]));

// Vrai deck de chaque chapitre d'East Blue : identifiant du chapitre -> identifiant du deck (dans ADVENTURE_DECKS) ;
// la clé 'starterDeck' donne le vrai deck de départ de l'arc ('ST-01', tâche 1.14). Le défi de Mihawk n'y figure pas :
// il joue déjà son vrai deck (META-MIHAWK-2026-10).
export const EAST_BLUE_REAL_DECKS: Record<string, string> = {
  starterDeck: 'ST-01',
  'eb-1-shells-town': 'AV-EB-MORGAN',
  'eb-2-orange-town': 'AV-EB-BAGGY',
  'eb-3-sirop': 'AV-EB-KURO',
  'eb-4-baratie': 'AV-EB-KRIEG',
  'eb-5-arlong-park': 'AV-EB-ARLONG',
  'eb-defi-baggy': 'AV-EB-BAGGY-ALVIDA',
  'eb-6-loguetown': 'AV-EB-SMOKER',
};
