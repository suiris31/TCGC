// Jeu d'icônes du jeu, dessiné pour TCGC (rien de Bandai) : traits sur une grille de 24 × 24, épaisseur 2, bouts
// arrondis, couleur du texte. Chaque icône est une liste de tracés SVG (attribut `d`). Pour en ajouter une : un nom,
// ses tracés et son libellé (affiché dans l'atelier « kit » et lu par les lecteurs d'écran quand l'icône est seule).

// Un cercle de centre (x, y) et de rayon r, en tracé (deux demi-arcs)
const circle = (x: number, y: number, r: number) => `M${x + r} ${y}a${r} ${r} 0 1 1-${2 * r} 0 ${r} ${r} 0 0 1 ${2 * r} 0`;
// Un rectangle aux coins arrondis (r) de coin haut gauche (x, y), de largeur w et de hauteur h
const rect = (x: number, y: number, w: number, h: number, r = 2) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1-${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1-${r}-${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r}-${r}z`;
// Le panneau « interdit » (cercle barré) qui entoure les icônes « ne peut pas »
const forbidden = [circle(12, 12, 9.5), 'M5.3 5.3l13.4 13.4'];

export const ICONS = {
  // ---------- Interface ----------
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  settings: [circle(12, 12, 3), circle(12, 12, 6.5), 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9L7 7', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  help: [circle(12, 12, 9.5), 'M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.4', 'M12 17.3v.1'],
  log: [rect(5, 3, 14, 18), 'M9 8h6', 'M9 12h6', 'M9 16h3.5'],
  deck: ['M9 3h9a2 2 0 0 1 2 2v12', rect(4, 6.5, 13, 15)],
  hold: ['M4 11V9a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2', 'M3 11h18v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z', 'M10.5 11v3.5h3V11', 'M3 15h7.5', 'M13.5 15H21'],
  shop: ['M3.5 9.5L5.5 4h13l2 5.5', 'M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0', 'M5 12.5V20h14v-7.5', 'M10 20v-4.5h4V20'],
  purse: ['M9 3.5h6L13.5 7h-3z', 'M8.5 7h7', 'M10 7c-3.6 1.8-6 5.3-6 8.7A4.8 4.8 0 0 0 8.8 20.5h6.4a4.8 4.8 0 0 0 4.8-4.8c0-3.4-2.4-6.9-6-8.7', 'M12 11.5v6', 'M10.3 13.2h2.9a1.3 1.3 0 0 1 0 2.6h-2.9'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 3.5V8H8', 'M12 7.5V12l3 2'],
  'sound-on': ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9a4.2 4.2 0 0 1 0 6', 'M18.3 6.3a8.2 8.2 0 0 1 0 11.4'],
  'sound-off': ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9.5l5 5', 'M20.5 9.5l-5 5'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  more: [circle(5, 12, 1), circle(12, 12, 1), circle(19, 12, 1)],
  drag: [circle(9, 6, 1), circle(15, 6, 1), circle(9, 12, 1), circle(15, 12, 1), circle(9, 18, 1), circle(15, 18, 1)],
  retry: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20.5 3.5V9H15'],
  alert: ['M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.3a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z', 'M12 9.5v4', 'M12 17v.1'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],

  // ---------- États d'une carte ----------
  // épuisée : une carte couchée, avec la flèche du quart de tour
  rested: [rect(3, 11, 14, 9.5), 'M13.5 3.5a7 7 0 0 1 7 7', 'M20.5 6.5v4h-4'],
  blocker: ['M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z'],
  frozen: ['M12 2.5v19', 'M3.8 7.2l16.4 9.6', 'M3.8 16.8l16.4-9.6', 'M9.5 4l2.5 2 2.5-2', 'M9.5 20l2.5-2 2.5 2'],
  'no-attack': [...forbidden, 'M12 6.5v8', 'M9 14.5h6', 'M12 14.5v3.5'],
  'no-block': [...forbidden, 'M12 7.5l4 1.5v3c0 2.3-1.7 4-4 4.5-2.3-.5-4-2.2-4-4.5V9z'],
  // KO impossible : un bouclier marqué d'une croix de soin
  'no-ko': ['M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z', 'M12 8.5v7', 'M8.5 12h7'],
  // retirée de la partie : une spirale qui disparaît
  exile: ['M12 12a1 1 0 0 1 1 1 2 2 0 0 1-2 2 3 3 0 0 1-3-3 4 4 0 0 1 4-4 5 5 0 0 1 5 5 6 6 0 0 1-6 6 7 7 0 0 1-7-7'],
  // renvoyée (en main ou dans le deck) : une flèche qui fait demi-tour vers une carte
  returned: [rect(12, 3.5, 9, 13), 'M3.5 10L6.5 7l3 3', 'M6.5 7v7.5a5 5 0 0 0 5 5h4'],
  attack: ['M20.5 3.5v3L11 16l-3-3 9.5-9.5z', 'M5.5 11.5l7 7', 'M8 16l-4 4', 'M3 19l2 2'],
  // protégée (des effets) : un dôme au-dessus de la carte
  protection: ['M3.5 18a8.5 8.5 0 0 1 17 0', 'M2 21h20', 'M12 6V3', 'M6.3 8.3L4.5 6.5', 'M17.7 8.3l1.8-1.8'],
  'power-up': ['M12 19.5v-15', 'M6 10.5l6-6 6 6'],
  'power-down': ['M12 4.5v15', 'M6 13.5l6 6 6-6'],
  // vient d'être jouée : « Zz », la carte dort encore
  asleep: ['M4 5.5h7.5L4 15h7.5', 'M14 11h6l-6 7.5h6'],
  // ne peut pas être épuisée : une carte couchée, barrée
  'no-rest': [...forbidden, rect(6.5, 9, 11, 6.5, 1.5)],
  // effets annulés : l'étincelle d'un effet, barrée
  negated: [...forbidden, 'M12 6.5l1.4 4.1 4.1 1.4-4.1 1.4-1.4 4.1-1.4-4.1-4.1-1.4 4.1-1.4z'],
  // [Double attaque] : deux épées croisées (celle d'« attack » et son reflet)
  'double-attack': ['M20.5 3.5v3L11 16l-3-3 9.5-9.5z', 'M5.5 11.5l7 7', 'M8 16l-4 4', 'M3 19l2 2', 'M3.5 3.5v3L13 16l3-3-9.5-9.5z', 'M18.5 11.5l-7 7', 'M16 16l4 4', 'M21 19l-2 2'],
  // [Imblocable] : un fantôme, qui passe à travers les Bloqueurs
  unblockable: ['M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z', circle(9.5, 11, 0.8), circle(14.5, 11, 0.8)],
  // panneau du plateau : le replier vers la droite, le déplier vers la gauche
  'panel-hide': ['M6 6l6 6-6 6', 'M13 6l6 6-6 6'],
  'panel-show': ['M18 6l-6 6 6 6', 'M11 6l-6 6 6 6'],
} satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

/** Ce que représente chaque icône, en français */
export const ICON_LABELS: Record<IconName, string> = {
  back: 'Retour',
  close: 'Fermer',
  settings: 'Réglages',
  help: 'Aide',
  log: 'Journal',
  deck: 'Deck',
  hold: 'Cale',
  shop: 'Boutique',
  purse: 'Bourse',
  history: 'Mes parties',
  'sound-on': 'Son activé',
  'sound-off': 'Son coupé',
  undo: 'Annuler',
  more: 'Plus d’actions',
  drag: 'Glisser',
  retry: 'Réessayer',
  alert: 'Attention',
  check: 'Validé',
  rested: 'Épuisée',
  blocker: 'Bloqueur',
  frozen: 'Gelée',
  'no-attack': 'Ne peut pas attaquer',
  'no-block': 'Ne peut pas bloquer',
  'no-ko': 'Ne peut pas être mise KO',
  exile: 'Retirée de la partie',
  returned: 'Renvoyée',
  attack: 'Attaque',
  protection: 'Protégée',
  'power-up': 'Puissance augmentée',
  'power-down': 'Puissance diminuée',
  asleep: 'Vient d’être jouée',
  'no-rest': 'Ne peut pas être épuisée',
  negated: 'Effets annulés',
  'double-attack': 'Double attaque',
  unblockable: 'Imblocable',
  'panel-hide': 'Replier le panneau',
  'panel-show': 'Déplier le panneau',
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
