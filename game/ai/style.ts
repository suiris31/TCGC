// Style de jeu de l'IA : les réglages qui orientent ses choix. Chaque deck a le sien (son plan de jeu) : un point de
// départ écrit à la main d'après la couleur et les cartes du deck, puis ajusté par auto-apprentissage
// (scripts/game/train.ts), dont le résultat est enregistré dans styles.json.
import tuned from './styles.json' with { type: 'json' };
import type { PlayerId } from '../engine/types.ts';

export interface Style {
  // Phase principale
  playPower: number;       // intérêt de la puissance d'un Personnage joué (par tranche de 2000)
  playEffect: number;      // intérêt des effets [Jouée] utiles (multiplie les bonus de chaque carte)
  holdLife: number;        // quand l'adversaire a ce nombre de Vies ou moins, attaquer avant de jouer ses cartes
  // DON!!
  counterReserve: number;  // nombre d'Événements [Contre] de la main pour lesquels garder des DON!! (0 à 2)
  keyReserve: number;      // garder les DON!! de l'Événement clé du deck (> 0,5 : oui)
  keyMinDon: number;       // ... à partir de ce nombre de DON!! sur le terrain (avant, on développe son jeu)
  overkill: number;        // DON!! en plus du nécessaire sur une attaque contre le Leader (contre les Contres)
  dumpDon: number;         // DON!! restantes après le plan : sur une attaque (> 0,5) ou gardées
  // Attaques
  leaderAggro: number;     // intérêt d'une attaque sur le Leader adverse
  lethalBonus: number;     // en plus quand l'adversaire a 2 Vies ou moins
  charKill: number;        // intérêt d'abattre un Personnage épuisé (multiplie sa valeur)
  minEdge: number;         // avance de puissance exigée pour attaquer (en milliers ; 0 : l'égalité suffit)
  keepBlockers: number;    // réticence à attaquer avec un [Bloqueur] (qui ne pourra plus bloquer)
  // Défense
  counterLife: number;     // à partir de cette Vie (ou moins), on contre tout ce qu'on peut
  counterMid: number;      // Vie « moyenne » : on contre si l'écart est petit
  counterSmall: number;    // écart jugé petit (en milliers de puissance)
  protectValue: number;    // valeur minimale d'un Personnage qu'on protège par un Contre
  blockLife: number;       // à partir de cette Vie (ou moins), on bloque même en perdant le bloqueur
  // Effets
  restBlocker: number;     // intérêt d'épuiser un [Bloqueur] adverse avec un effet
  mulliganCheap: number;   // Personnages de coût 4 ou moins nécessaires pour garder sa main de départ
}

export const DEFAULT_STYLE: Style = {
  playPower: 1,
  playEffect: 1,
  holdLife: 0,
  counterReserve: 2,
  keyReserve: 1,
  keyMinDon: 6,
  overkill: 0,
  dumpDon: 1,
  leaderAggro: 3,
  lethalBonus: 3,
  charKill: 1,
  minEdge: 0,
  keepBlockers: 0,
  counterLife: 2,
  counterMid: 3,
  counterSmall: 2,
  protectValue: 6,
  blockLife: 2,
  restBlocker: 5,
  mulliganCheap: 2,
};

// Bornes explorées par l'auto-apprentissage (larges, pour laisser la place à des styles inattendus)
export const STYLE_RANGES: Record<keyof Style, [number, number]> = {
  playPower: [0, 3],
  playEffect: [0, 3],
  holdLife: [0, 3],
  counterReserve: [0, 2],
  keyReserve: [0, 1],
  keyMinDon: [3, 10],
  overkill: [0, 3],
  dumpDon: [0, 1],
  leaderAggro: [0, 8],
  lethalBonus: [0, 10],
  charKill: [0, 3],
  minEdge: [0, 3],
  keepBlockers: [0, 6],
  counterLife: [0, 5],
  counterMid: [0, 5],
  counterSmall: [0, 5],
  protectValue: [2, 12],
  blockLife: [0, 5],
  restBlocker: [0, 10],
  mulliganCheap: [0, 4],
};

// Plan de jeu de départ de chaque deck, d'après sa couleur et ses cartes
export const BASE_STYLES: Record<string, Partial<Style>> = {
  // Sabo (rouge/noir) : poser un Personnage de coût 8, DON!! sur le Leader pour le bonus de +1000 à tous
  'ST-35': {},
  // Luffy (rouge) : agression, attaques nombreuses sur le Leader, DON!! en plus pour passer les Contres
  'ST-31': { leaderAggro: 4, overkill: 1, lethalBonus: 4 },
  // Zoro (vert) : épuiser les Personnages adverses puis les abattre ; double attaque du Leader (Événement clé)
  'ST-32': { charKill: 1.3, restBlocker: 6, keyReserve: 1 },
  // Kuzan (bleu) : contrôle, protéger ses Personnages et garder des Bloqueurs, avantage de cartes
  'ST-33': { leaderAggro: 2.5, charKill: 1.3, protectValue: 5, keepBlockers: 2, counterReserve: 2 },
  // Katakuri (violet) : DON!! et déclarer un coût ; un Leader solide en défense
  'ST-34': { counterMid: 3, counterSmall: 2 },
  // Kid (jaune) : la Vie est une ressource (Déclenchements, Vie face visible) : contrer moins, attaquer plus
  'ST-36': { counterLife: 1, counterMid: 2, counterSmall: 1, leaderAggro: 3.5 },
};

const TUNED = tuned as Record<string, Partial<Style>>;

// Styles utilisés par l'IA (modifiables par l'auto-apprentissage pendant ses parties d'essai)
export const STYLES: Record<string, Style> = {};
export function resetStyles(useTuned = true) {
  for (const id of Object.keys(BASE_STYLES)) STYLES[id] = { ...DEFAULT_STYLE, ...BASE_STYLES[id], ...(useTuned ? TUNED[id] : {}) };
}
resetStyles();

// Style imposé à un joueur pour une partie d'essai (sinon : celui de son deck)
export const playerStyle: [Style | null, Style | null] = [null, null];

export function styleOf(deckId: string, p: PlayerId): Style {
  return playerStyle[p] ?? STYLES[deckId] ?? DEFAULT_STYLE;
}
