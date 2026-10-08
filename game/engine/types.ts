// Types du moteur. L'état d'une partie est un objet JSON simple (copiable), ce qui permet à l'IA de simuler des
// suites de partie et au coach de rejouer une décision.

export type PlayerId = 0 | 1;
export type Category = 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE';

// Couleurs, types, attributs et noms tels que les lisent les effets : libellés officiels de la VO, qui servent
// d'identifiants communs aux deux langues (les libellés affichés sont à part)
export type Color = 'Red' | 'Green' | 'Blue' | 'Purple' | 'Black' | 'Yellow';
// Mots-clés gérés par le moteur pour toutes les cartes
export type Keyword = 'Blocker' | 'Rush' | 'Rush: Character' | 'Double Attack' | 'Banish' | 'Unblockable';

// Informations d'une carte, tirées des listes officielles française et anglaise (game/data/catalog.ts, chargées par
// cards/index.ts)
export interface CardData {
  number: string;
  imageId: string;            // visuel affiché, dans la langue affichée
  deckArt?: Record<string, string>;  // visuel de la carte dans chaque deck pour débutant qui la contient (« ST-35 »)
  lang: 'fr' | 'en';          // langue affichée (nom, types, texte, visuel) : VF si la carte existe en français
  rarity: string;
  category: Category;
  name: string;               // nom affiché
  names: string[];            // nom(s) en VO, auxquels les effets font référence ([Monkey.D.Luffy])
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  colors: Color[];
  types: string[];            // types en VO ({Revolutionary Army})
  typeLabels: string[];       // types affichés
  attributes: string[];       // attributs en VO (Slash, Strike, Ranged, Special, Wisdom)
  effect: string;             // texte affiché, avec les rappels de règle entre parenthèses
  trigger: string | null;     // [Déclenchement] affiché, sans le mot-clé
  effectEn: string;           // texte officiel en VO
  triggerEn: string | null;
  keywords: Keyword[];        // mots-clés toujours actifs (en tête du texte)
  blocks: string[];           // numéros de bloc de ses impressions (format Standard)
}

// Une carte physique : identifiant unique dans la partie + numéro de carte
export interface Card {
  uid: number;
  num: string;
  faceUp?: boolean;  // carte de Vie face visible (information publique)
}

// Leader ou Personnage sur le terrain
export interface FieldCard extends Card {
  rested: boolean;
  don: number;          // cartes DON!! données
  playedTurn: number;   // tour où le Personnage a été joué (ne peut pas attaquer ce tour-là)
  usedOpt: string[];    // effets [Une fois par tour] déjà utilisés ce tour
  battledCharTurn?: number;  // dernier tour où il a combattu un Personnage adverse en attaquant
}

export interface PlayerState {
  name: string;
  deckId: string;
  // liste du deck joué (Leader et cartes) : la partie la garde, même si le deck change ensuite (decks personnalisés) ;
  // absente des parties enregistrées avant octobre 2026 (voir decks.ts). Secrète pour l'adversaire en ligne.
  list?: { leader: string; cards: Record<string, number> };
  leader: FieldCard;
  deck: Card[];   // index 0 = dessus du deck
  hand: Card[];
  trash: Card[];  // dernier = dessus de la Défausse
  life: Card[];   // index 0 = dessus de la Vie
  chars: FieldCard[];
  stage: FieldCard | null;
  donDeck: number;
  donActive: number;  // DON!! redressées dans la zone de Coût
  donRested: number;  // DON!! épuisées dans la zone de Coût
  turns: number;      // nombre de tours commencés
  discardedTurn: number;  // dernier tour où une carte de sa main a été défaussée par un effet
}

// Modification temporaire. until : 'battle' (pour tout le combat), 'turn' (pour tout le tour en cours), ou le numéro
// du tour à la fin duquel elle expire (« jusqu'à la fin de la prochaine phase de Fin de votre adversaire » = tour + 1)
export interface Modifier {
  uid: number;
  stat: 'power' | 'cost' | 'basePower' | 'cantAttack' | 'cantRest' | 'blocker' | 'keyword' | 'noAttackLowCost' | 'cantBeKO' | 'cantLeave';
  scope?: 'battle' | 'effect' | 'oppEffect';  // stat 'cantBeKO' : seulement en combat, par un effet, par un effet adverse
  keyword?: Keyword;  // stat 'keyword' : mot-clé accordé
  amount: number;
  until: 'battle' | 'turn' | number;
  source: string;
}

// Effet différé, appliqué à la fin d'un tour (ex. « redressez 1 DON!! à la fin de ce tour »)
export interface DelayedEffect {
  turn: number;
  player: PlayerId;
  action: 'untapDon';
  amount: number;
}

export interface Battle {
  attacker: number;
  target: number;
  step: 'block' | 'counter' | 'damage' | 'end';
  blocked: boolean;
}

export type Flow =
  | { stage: 'setup'; effectsDone?: boolean }
  | { stage: 'mulligan'; player: PlayerId }
  | { stage: 'refresh'; effectsDone?: boolean }
  | { stage: 'draw' }
  | { stage: 'don' }
  | { stage: 'main' }
  | { stage: 'battle' }
  | { stage: 'end'; effectsDone?: boolean }
  | { stage: 'over' };

export type DecisionKind = 'mulligan' | 'main' | 'blocker' | 'counter' | 'effect';

export interface Option {
  id: string;
  label: string;
  uid?: number;     // carte concernée (attaquant pour une attaque)
  target?: number;  // cible d'une attaque
  num?: string;     // carte concernée quand elle n'est dans aucune zone (carte de Vie révélée)
  group?: string;
}

// Ce que le moteur attend d'un joueur
export interface Decision {
  player: PlayerId;
  kind: DecisionKind;
  prompt: string;
  options: Option[];
  // nature de la question dans un effet (utile à l'IA et au coach) : 'may', 'target', 'attackTarget', 'replace'...
  tag?: string;
  source?: number;
  inEffect?: boolean;
  // cartes que la question montre au joueur sans qu'elles soient dans une zone (cartes regardées pendant un effet,
  // toutes, même celles qu'il ne peut pas choisir)
  cards?: { uid: number; num: string; owner?: PlayerId }[];
}

export type EffectKind = 'onPlay' | 'whenAttacking' | 'onOpponentAttack' | 'activateMain' | 'onKO' | 'endOfTurn' | 'when' | 'system';

// Événement de la partie, annoncé par le moteur (rules.ts, emit) : les effets « quand ... » des cartes y réagissent
export interface GameEvent {
  type: 'gameStart' | 'turnStart' | 'mainStart' | 'turnEnd' | 'play' | 'ko' | 'rest' | 'attack' | 'block' | 'donReturned' | 'event'
    | 'discard';
  player: PlayerId;          // joueur concerné : propriétaire de la carte, ou joueur qui agit
  uid?: number;              // carte concernée
  num?: string;
  zone?: 'leader' | 'character' | 'stage';  // où était la carte ('rest', 'ko')
  by?: PlayerId;             // joueur dont l'effet (ou l'attaque) est la cause
  cause?: 'effect' | 'battle' | 'attack';
  sourceNum?: string;        // carte dont l'effet est la cause
  count?: number;            // cartes défaussées, DON!! renvoyées
  target?: number;           // 'attack' : carte attaquée
  timing?: 'main' | 'counter';  // 'event' : [Principale] ou [Contre]
}

// Effet « quand ... » (automatique) : la condition est vérifiée au moment de l'événement ; si elle est vraie, l'effet est
// mis en attente et résolu après l'effet ou l'action en cours (8-6), même si la condition a changé entre-temps
export interface WhenEffect {
  on: GameEvent['type'];
  once?: string;             // [Une fois par tour] : clé propre à l'effet (une fois par exemplaire)
  if: (s: GameState, owner: PlayerId, self: FieldCard, e: GameEvent) => boolean;
  run: (ctx: EffectCtx, e: GameEvent) => void;
}

export interface LeaderRules {
  donDeck?: number;                                  // taille du deck DON!! (10 sinon)
  deckOut?: 'win' | 'loseAtEndOfTurn';               // deck vide : victoire, ou défaite seulement à la fin du tour
  deckRestriction?: (d: CardData) => string | null;  // carte interdite dans le deck : la raison
}

// Effet en attente de résolution. Pendant une partie jouée par un humain, une décision au milieu d'un effet est
// gérée en rejouant l'effet depuis un instantané avec les réponses déjà données.
export interface PendingEffect {
  kind: EffectKind;
  source: number;
  num: string;
  controller: PlayerId;
  answers: string[];
  snapshot?: string;
  action?: string;
  data?: Record<string, number | string>;
  event?: GameEvent;   // 'when' : l'événement déclencheur
  index?: number;      // 'when' : rang de l'effet dans CardBehavior.when
  batch?: number;      // 'when' : effets déclenchés par le même événement (ordre au choix du joueur, 8-6-1-1)
}

export interface LogEntry {
  turn: number;
  player: PlayerId | null;
  text: string;
  only?: PlayerId;  // information secrète : visible seulement par ce joueur
}

// Décision prise pendant la partie (pour le récap du coach)
export interface HistoryEntry {
  turn: number;
  player: PlayerId;
  kind: DecisionKind;
  tag?: string;
  prompt: string;
  choice: string;
  label: string;
}

export interface GameState {
  rng: number;
  nextUid: number;
  turn: number;
  active: PlayerId;
  first: PlayerId;
  players: [PlayerState, PlayerState];
  mods: Modifier[];
  delayed: DelayedEffect[];
  // carte du dessus du deck adverse connue de chaque joueur (regardée ou révélée), tant qu'elle reste au-dessus
  peek: [number | null, number | null];
  battle: Battle | null;
  flow: Flow;
  pending: PendingEffect[];
  decision: Decision | null;
  winner: PlayerId | null;
  winReason: string | null;
  log: LogEntry[];
  history: HistoryEntry[];
  events?: number;  // nombre d'événements annoncés (numérote les effets déclenchés ensemble)
  // cartes de zones cachées connues d'un joueur (révélées, regardées), tant qu'elles restent dans cette zone
  known?: { uid: number; to: PlayerId; zone: HiddenZone }[];
}

export type HiddenZone = 'hand' | 'deck' | 'life';

// Contexte d'un effet en cours de résolution
export interface EffectCtx {
  s: GameState;
  me: PlayerId;
  opp: PlayerId;
  source: number;
  num: string;
  pending: PendingEffect;
  ask(spec: { player?: PlayerId; prompt: string; options: Option[]; tag?: string; cards?: { uid: number; num: string; owner?: PlayerId }[] }): string;
  // [Déclenchement] en cours : la carte révélée, et si l'effet l'a déplacée (jouée, ajoutée à la main)
  trigger?: { card: Card; moved: boolean };
}

// Comportement d'une carte, codé à la main d'après son texte officiel
export interface CardBehavior {
  blocker?: (s: GameState, owner: PlayerId, card: FieldCard) => boolean;
  rush?: (s: GameState, owner: PlayerId, card: FieldCard) => boolean;       // [Initiative]
  rushChar?: (s: GameState, owner: PlayerId, card: FieldCard) => boolean;   // [Initiative : Personnage]
  handCost?: (s: GameState, owner: PlayerId) => number;                     // modification du coût en main
  selfPower?: (s: GameState, owner: PlayerId, card: FieldCard) => number;
  selfCost?: (s: GameState, owner: PlayerId, card: FieldCard) => number;
  // bonus de puissance donné par cette carte (sur le terrain) à une carte du même joueur, elle comprise
  aura?: (s: GameState, owner: PlayerId, source: FieldCard, target: FieldCard) => number;
  // bonus ou malus de puissance donné en permanence par cette carte aux cartes adverses
  oppAura?: (s: GameState, owner: PlayerId, source: FieldCard, target: FieldCard) => number;
  // « ne peut pas être mis KO » (en combat, par un effet ; `by` : joueur qui attaque ou dont l'effet met KO)
  cantBeKO?: (s: GameState, owner: PlayerId, self: FieldCard, cause: 'battle' | 'effect', by: PlayerId) => boolean;
  // « ne peut pas quitter le terrain à cause d'un effet adverse »
  cantLeave?: (s: GameState, owner: PlayerId, self: FieldCard) => boolean;
  // Règles changées par un Leader (effets permanents valables « selon les règles du jeu », 5-1-2-4)
  rules?: LeaderRules;
  onPlay?: (ctx: EffectCtx) => void;
  whenAttacking?: (ctx: EffectCtx) => void;
  // [Attaque adverse] : quand l'adversaire déclare une attaque (clé [Une fois par tour] partagée possible)
  onOpponentAttack?: { optKey?: string; run: (ctx: EffectCtx) => void };
  onKO?: (ctx: EffectCtx) => void;                  // [En cas de KO], résolu depuis la Défausse
  onKOCondition?: (s: GameState, owner: PlayerId) => boolean;
  endOfTurn?: (ctx: EffectCtx) => void;             // [Fin de votre tour]
  when?: WhenEffect[];                              // effets « quand ... » (carte sur le terrain)
  activateMain?: {
    oncePerTurn: boolean;
    label: string;
    canActivate?: (s: GameState, owner: PlayerId, card: FieldCard) => boolean;
    // l'effet peut-il faire quelque chose maintenant ? (l'IA, le coach et l'interface ne proposent pas un effet inutile)
    useful?: (s: GameState, owner: PlayerId, card: FieldCard) => boolean;
    run: (ctx: EffectCtx, card: FieldCard) => void;
  };
  onMain?: (ctx: EffectCtx) => void;    // Événement [Principale]
  onCounter?: (ctx: EffectCtx) => void; // Événement [Contre] (la valeur de Contre d'un Personnage est CardData.counter)
  // l'effet [Principale] peut-il faire quelque chose maintenant (coût de l'Événement pas encore payé) ? Sinon, jouer
  // la carte ne sert à rien : l'IA et le coach ne le proposent pas, l'interface le signale
  mainUseful?: (s: GameState, owner: PlayerId) => boolean;
  // une attaque vouée à l'échec (puissance insuffisante) sert-elle quand même grâce à l'effet [En attaquant] ?
  // (sans ce test, toute carte qui a un effet [En attaquant] est supposée pouvoir en profiter)
  attackUseful?: (s: GameState, owner: PlayerId, card: FieldCard, target: number) => boolean;
  // l'effet [Contre] protège-t-il la carte attaquée ?
  counterUseful?: (s: GameState, owner: PlayerId, target: number) => boolean;
  onTrigger?: (ctx: EffectCtx) => void; // [Déclenchement] (le texte officiel est dans CardData.trigger)
  // Effet de remplacement quand un Personnage du même joueur va quitter le terrain à cause d'un effet adverse
  replaceRemoval?: {
    oncePerTurn: boolean;
    onlyKo: boolean;  // false : aussi quand le Personnage quitte le terrain autrement (renvoyé en main, sous le deck...)
    label: (s: GameState, self: FieldCard, victim: FieldCard) => string;
    condition: (s: GameState, owner: PlayerId, self: FieldCard, victim: FieldCard) => boolean;
    apply: (s: GameState, owner: PlayerId, self: FieldCard, victim: FieldCard) => void;
  };
}

export type CardDef = CardData & CardBehavior;
