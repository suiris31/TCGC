// Recettes des cartes (étape C) : la STRUCTURE d'un effet, jamais son texte.
//
// Une recette dit des moments, des conditions, des coûts, des actions et des cibles, avec des nombres, des types
// ({Navy}), des noms ([Izo]) et des attributs (<Slash>) en VO. Elle ne contient aucune phrase de carte : rien de Bandai
// dans le dépôt. Le traducteur (parse/) la produit d'après le texte officiel téléchargé ; le compilateur (compile.ts)
// en fait un CardBehavior avec les briques de cards/bricks.ts ; describe.ts en refait une phrase normalisée pour
// l'aller-retour.
//
// Contrat : Plan-aventure/01-contrats.md § 15 (format repris de l'étude C0, etudes/cartes/recette.ts). On ne le change
// pas seul : un champ FACULTATIF de plus est permis s'il est signalé dans la PR.
import type { Category, Color, EffectCtx, Keyword } from '../types.ts';

export type { Category, Color, Keyword };

// ---------- Cibles et filtres ----------

export type Side = 'own' | 'opp' | 'any';
export type Zone = 'field' | 'hand' | 'deck' | 'trash' | 'life' | 'don';

// Ce que dit le texte d'une carte visée ; correspond au CharSpec des briques (plus « category », « anyOf »...)
export interface Filter {
  category?: Category[];          // « Leader or Character cards », « Event or Stage »
  costMax?: number;               // coût actuel (modifié), comme CharSpec.costMax
  costMin?: number;
  costEq?: number;
  baseCostMax?: number;           // coût imprimé
  baseCostMin?: number;
  powerMax?: number;
  powerMin?: number;
  basePowerMax?: number;
  basePowerMin?: number;
  types?: string[];               // {Navy} ; plusieurs : « {A} or {B} » (typesMode 'any') ou « both {A} and {B} » ('all')
  typesMode?: 'any' | 'all';
  typeIncludes?: string;          // « type includes "CP" »
  name?: string[];                // [Izo] ; plusieurs : « [A] or [B] »
  notName?: string;               // « other than [Izo] »
  color?: Color[];
  attribute?: string;             // <Slash>
  rested?: boolean;               // true : épuisé ; false : redressé
  trigger?: boolean;              // « with a [Trigger] »
  keyword?: Keyword;              // « with [Blocker] »
  noKeyword?: Keyword;            // « without [Blocker] »
  vanilla?: boolean;              // « with no base effect »
  donMin?: number;                // « with N or more DON!! cards given »
  // « [Megalo] or {Neptunian} type cards » : l'un OU l'autre ; les autres champs s'appliquent aux deux
  anyOf?: Filter[];
}

// Une cible : « up to 1 of your opponent's Characters with a cost of 4 or less »
export interface Target {
  side: Side;
  zone: Zone;                     // 'field' pour les cartes en jeu
  self?: boolean;                 // « this Character », « this Leader », « this card »
  leader?: boolean;               // le Leader peut-il être visé ?
  characters?: boolean;           // les Personnages peuvent-ils être visés ?
  stage?: boolean;                // les Lieux peuvent-ils être visés ?
  count: number | 'all';
  upTo: boolean;                  // « up to » : 0 accepté
  filter: Filter;
  otherThanSelf?: boolean;        // « other than this Character »
  that?: boolean;                 // « that card » : la carte choisie par l'étape précédente (C2.2)
}

// ---------- Durées ----------

// 'battle' : ce combat ; 'turn' : ce tour ; 'oppNextEnd' : jusqu'à la fin du prochain tour adverse ;
// 'nextTurn' : jusqu'à la fin de votre prochain tour ; 'permanent' : effet permanent (aura, [DON!! xN]...)
export type Duration = 'battle' | 'turn' | 'oppNextEnd' | 'nextTurn' | 'permanent';

// ---------- Conditions ----------

export type Cmp = 'le' | 'ge' | 'eq';
export type Cmp2 = 'lt' | 'le' | 'gt' | 'ge';
export type Cond =
  | { kind: 'leaderIs'; names: string[] }
  | { kind: 'leaderType'; types: string[]; mode?: 'any' | 'all' }
  | { kind: 'leaderTypeIncludes'; part: string }
  | { kind: 'leaderColor'; colors: Color[]; multicolor?: boolean }
  | { kind: 'leaderAttribute'; attribute: string }
  | { kind: 'life'; side: 'own' | 'opp' | 'total'; cmp: Cmp; n: number }
  | { kind: 'lifeVsOpp'; cmp: Cmp2 }
  | { kind: 'hand'; side: 'own' | 'opp'; cmp: Cmp; n: number }
  | { kind: 'donField'; side: 'own' | 'opp'; cmp: Cmp; n: number }
  | { kind: 'donVsOpp'; cmp: Cmp2 }
  | { kind: 'trash'; cmp: Cmp; n: number; filter?: Filter }
  | { kind: 'deck'; cmp: Cmp; n: number }
  // « you have no ... » : cmp 'eq', n 0
  | { kind: 'chars'; side: Side; cmp: Cmp; n: number; filter: Filter }
  // toutes les cartes du terrain, DON!! comprises (« If you have 8 or more rested cards », OP12-118)
  | { kind: 'fieldCards'; side: 'own' | 'opp'; cmp: Cmp; n: number; rested?: boolean }
  | { kind: 'selfState'; rested?: boolean; donMin?: number }
  | { kind: 'turn'; mine: boolean }
  | { kind: 'playedThisTurn' }
  | { kind: 'firstTurns'; fromTurn: number }
  | { kind: 'and'; all: Cond[] }
  | { kind: 'or'; any: Cond[] }
  | { kind: 'not'; cond: Cond }
  // la carte révélée par revealTop (C2.3) : « If the revealed card has a cost of 4 or more », « If that card is a ... »
  | { kind: 'revealed'; filter: Filter }
  | { kind: 'manual'; reason: string };   // condition codée à la main (MANUAL_CONDS, voir ManualCode)

// ---------- Coûts (« You may [coût]: [effet] », DON!! −N, ➀) ----------

export type CostPart =
  | { kind: 'donMinus'; n: number }                         // DON!! −N : renvoyer N DON!! au deck DON!!
  | { kind: 'restDon'; n: number }                          // ➀ ➁ : épuiser N DON!!
  | { kind: 'restSelf' }                                    // « rest this Character/Leader »
  | { kind: 'trashSelf' }                                   // « trash this Character »
  | { kind: 'discard'; n: number; filter?: Filter }         // « trash N card(s) from your hand »
  | { kind: 'reveal'; n: number; filter?: Filter }          // « reveal N ... from your hand »
  | { kind: 'trashTop'; n: number }                         // « trash N cards from the top of your deck »
  | { kind: 'lifeToHand'; from: 'top' | 'topOrBottom' }     // Vie → main
  | { kind: 'flipLife'; faceUp: boolean }
  | { kind: 'trashOwnChar'; n: number; filter: Filter }     // « trash 1 of your Characters ... »
  | { kind: 'koOwnChar'; n: number; filter: Filter }        // « KO 1 of your Characters ... » (C2.1 : un KO, pas la Défausse)
  // « place 1 of your Characters / 1 Stage ... at the bottom of the owner's deck » (C2.1) ; filter.category : CHARACTER ou STAGE
  | { kind: 'bottomOwn'; n: number; filter: Filter }
  | { kind: 'returnOwnChar'; n: number; filter: Filter }    // « return 1 of your Characters to the owner's hand »
  | { kind: 'restOwn'; n: number; what: 'cards' | 'characters' | 'leader' | 'stage'; filter?: Filter }
  | { kind: 'giveDon'; n: number; target: Target }          // « give 1 active DON!! card to 1 of your Leader »
  // wording (C2.3) : « return N cards from your trash to the bottom of your deck » (même jeu que « place ... at »)
  | { kind: 'trashToBottom'; n: number; filter?: Filter; wording?: 'return' }   // Défausse → sous le deck
  | { kind: 'trashLife'; from: 'top' | 'topOrBottom' }
  | { kind: 'leaderPowerMinus'; n: number }                 // « give your Leader −N power during this turn »
  | { kind: 'bounceSelf' }
  | { kind: 'selfToBottom' }
  | { kind: 'manual'; reason: string };                     // coût codé à la main (MANUAL_COSTS, voir ManualCode)

// ---------- Actions ----------

export type Action =
  | { kind: 'ko'; target: Target }
  | { kind: 'rest'; target: Target }
  | { kind: 'setActive'; target: Target }
  | { kind: 'bounce'; target: Target }                      // renvoyer en main
  | { kind: 'bottom'; target: Target }                      // sous le deck du propriétaire
  // dans la Vie du propriétaire ; where (C1.1) : « au-dessus » seulement, ou « au-dessus ou au-dessous » au choix
  | { kind: 'toLife'; target: Target; faceUp: boolean; where?: 'top' | 'topOrBottom' }
  | { kind: 'trashChar'; target: Target }                   // placer dans la Défausse (pas un KO)
  | { kind: 'power'; target: Target; amount: number; until: Duration }
  | { kind: 'cost'; target: Target; amount: number; until: Duration }
  | { kind: 'powerSet'; target: Target; value: number; until: Duration }   // « base power becomes N »
  | { kind: 'keyword'; target: Target; keyword: Keyword; until: Duration }
  | { kind: 'cantAttack'; target: Target; until: Duration; what?: 'leader' | 'any' }
  | { kind: 'cantBlock'; target: Target; until: Duration }
  // by 'oppEffect' (C2.2) : « by your opponent's effects » ; byAttribute (C2.2) : « in battle by <Slash> attribute cards »
  | { kind: 'cantBeKO'; target: Target; until: Duration; by?: 'battle' | 'effect' | 'oppEffect' | 'any'; byAttribute?: string }
  | { kind: 'cantBeRested'; target: Target; until: Duration }  // « cannot be rested » (C2.2)
  | { kind: 'cantLeave'; target: Target; until: Duration }     // « cannot be removed from the field by your opponent's effects » (C2.2)
  | { kind: 'attackActive'; target: Target; until: Duration }  // « can also attack active Characters » (C2.2)
  | { kind: 'cantRefresh'; target: Target }                 // « will not become active in ... next Refresh Phase »
  | { kind: 'negate'; target: Target; until: Duration }
  | { kind: 'draw'; n: number }
  // upTo (C2.3) : « trash up to N cards from your hand » (0 accepté)
  | { kind: 'discard'; n: number; filter?: Filter; upTo?: boolean }
  | { kind: 'oppDiscard'; n: number }
  | { kind: 'trashTop'; n: number; side: 'own' | 'opp' }
  // C2.3 : rest 'topOrBottom' (« place the rest at the top or bottom of the deck », chaque carte au choix, comme
  // arrangeTop) ; hidden : la carte prise n'est pas révélée (« add up to 1 card to your hand », sans filtre) ; shown :
  // « Reveal 1 card from the top of your deck and ... » (la carte regardée est montrée aux deux joueurs)
  | { kind: 'search'; look: number; take: number; upTo: boolean; filter: Filter; dest: 'hand' | 'play' | 'life';
      rest: 'bottom' | 'trash' | 'top' | 'topOrBottom'; rested?: boolean; hidden?: boolean; shown?: boolean;
      joined?: boolean }   // joined (C2.3) : « ..., add it to your hand and place the rest ... » (une seule phrase)
  | { kind: 'arrangeTop'; look: number; where: 'topOrBottom' | 'top' | 'bottom' }
  | { kind: 'play'; from: 'hand' | 'trash' | 'handOrTrash' | 'deck' | 'life'; count: number; upTo: boolean;
      filter: Filter; rested?: boolean }
  | { kind: 'playSelf'; rested?: boolean }                  // « Play this card » (souvent [Déclenchement])
  | { kind: 'activate'; which: 'main' | 'onPlay' | 'counter' | 'onKO' | 'whenAttacking' }
  | { kind: 'trashToHand'; count: number; upTo: boolean; filter: Filter }
  | { kind: 'trashToBottom'; count: number; side: 'own' | 'opp'; filter: Filter; upTo?: boolean; wording?: 'return' }   // upTo, wording : C2.3
  | { kind: 'addDon'; n: number; upTo: boolean; state: 'active' | 'rested' }
  | { kind: 'readyDon'; n: number; upTo: boolean }
  | { kind: 'giveDon'; n: number; upTo: boolean; rested: boolean; target: Target }
  | { kind: 'returnDon'; n: number; side: 'own' | 'opp' }   // renvoyer N DON!! au deck DON!!
  | { kind: 'restDon'; n: number; side: 'own' | 'opp' }
  | { kind: 'lifeFromDeck'; n: number; upTo: boolean; faceUp?: boolean }
  // upTo (C2.5) : « jusqu'à N » ; side 'opp' sans upTo : « votre adversaire ajoute à sa main ... »
  | { kind: 'lifeToHand'; n: number; side: 'own' | 'opp'; from: 'top' | 'topOrBottom'; upTo?: boolean }
  | { kind: 'trashLife'; n: number; side: 'own' | 'opp'; from: 'top' | 'topOrBottom'; upTo?: boolean }
  | { kind: 'lookLife'; side: Side; arrange: boolean }
  // where (C2.3) : « at the top of your deck », « at the top or bottom of your deck » (absent : au-dessous)
  | { kind: 'handToBottom'; n: number; where?: 'top' | 'topOrBottom' }
  | { kind: 'oppHandToBottom'; n: number }
  | { kind: 'handToLife'; n: number; upTo: boolean; filter: Filter; faceUp?: boolean }   // faceUp : C2.5
  // C2.5 : « vous ne pouvez pas ajouter de carte de Vie à votre main par vos propres effets pour tout le tour »
  | { kind: 'noLifeToHand' }
  // C2.5 : « regardez toutes vos cartes de Vie (de votre adversaire) et replacez-les dans l'ordre de votre choix »
  | { kind: 'reorderLife'; side: 'own' | 'opp' }
  | { kind: 'noCharsThisTurn'; what: 'play' | 'playByEffect' }
  | { kind: 'trashSelfEnd' }                                // « trash this Character at the end of this turn »
  | { kind: 'oppChooses'; n: number; action: 'ko' | 'trash' | 'bounce' | 'rest'; filter: Filter }
  // « Reveal 1 card from the top of your deck. If that card is ..., ... » (C2.3) : la carte reste au-dessus, connue des
  // deux joueurs ; la condition 'revealed' la lit, playRevealed la joue, revealedToBottom la place au-dessous du deck
  | { kind: 'revealTop' }
  | { kind: 'playRevealed'; rested?: boolean }              // « (you may) play that card (rested) »
  // « place the revealed card at the bottom of your deck » ; asRest : écrit « place the rest at the bottom ... »
  | { kind: 'revealedToBottom'; asRest?: boolean }
  | { kind: 'manual'; reason: string };                     // morceau codé à la main (MANUAL_STEPS, voir ManualCode)

export type ActionKind = Action['kind'];

// ---------- Étapes et capacités ----------

// Comment une étape suit la précédente. Portée d'une condition : « If C, A and B » couvre A et B (group) ;
// « If C, A. Then, B » ne couvre pas B (interpretations.md, « Vérifiés avec le texte anglais »).
export type Link = 'and' | 'then' | 'ifYouDo' | 'ifNotYouDo';
export type Step =
  | { link?: Link; cond?: Cond; action: Action }
  | { link?: Link; cond?: Cond; chooseOne: Step[][] }
  | { link?: Link; cond?: Cond; may: Step[] }               // « you may X » sans « : » (effet facultatif)
  | { link?: Link; cond: Cond; group: Step[] };             // « If C, A and B » : la condition couvre A et B

export type Timing =
  | 'onPlay' | 'whenAttacking' | 'onBlock' | 'onKO' | 'endOfTurn' | 'endOfOppTurn' | 'onOppAttack'
  | 'activateMain' | 'main' | 'counter' | 'trigger'
  | 'when'      // « When ... » : réaction à un évènement (voir `event`)
  | 'static';   // effet permanent (« [DON!! x1] This Character gains [Blocker] »)

// Évènement d'une capacité « When ... » (proche de GameEvent['type'] du moteur)
export interface RecipeEvent {
  on: 'koOwnChar' | 'koOppChar' | 'leaveOwnChar' | 'damage' | 'lifeRemoved' | 'drawOutsideDraw' | 'trashFromHand'
    | 'playChar' | 'oppPlayChar' | 'donReturned' | 'attacked' | 'rested' | 'other';
  filter?: Filter;
  byOpponent?: boolean;
}

export interface Ability {
  timing: Timing;
  event?: RecipeEvent;
  don?: number;                   // [DON!! xN]
  yourTurn?: boolean;             // [Your Turn]
  oppTurn?: boolean;              // [Opponent's Turn]
  oncePerTurn?: boolean;          // [Once Per Turn]
  condition?: Cond;               // « If ..., » devant toute la capacité (avant le coût)
  cost?: CostPart[];              // « You may ...: » ; DON!! −N ; ➀
  steps: Step[];
}

export interface Recipe {
  num: string;
  keywords?: Keyword[];           // mots-clés en tête (déjà lus par le moteur)
  abilities: Ability[];
  trigger?: Ability;              // [Déclenchement] (aussi quand la VO l'a laissé dans le texte de l'effet)
  alsoNamed?: string[];           // « Also treat this card's name as [X] »
}

// ---------- Niveau de confiance (§ 15.3 du contrat) ----------

// Seuls 'verified', 'coded' et 'auto' rendent une carte jouable.
export type Confidence = 'todo' | 'generated' | 'doubt' | 'verified' | 'coded' | 'auto';
export const PLAYABLE_LEVELS: readonly Confidence[] = ['verified', 'coded', 'auto'];

// Lecture douteuse : deux lectures raisonnables qui donnent deux jeux différents. Écrite avec nos mots (aucune phrase
// de carte) ; recopiée dans Plan-aventure/AVANCEMENT.md (« Questions ouvertes ») par le chef de projet.
export interface Doubt {
  question: string;               // « Le "Then" est-il couvert par la condition ? »
  readings: [string, string];     // ce que fait chaque lecture
  sources?: string;               // où la réponse officielle a été cherchée (règles, Q&A, errata), sans citation
}

// Une entrée d'un fichier de set. Soit une recette (générée puis relue), soit une carte codée à la main dont on
// déclare un doute (handCoded : le CardBehavior de cards/ reste, mais la carte n'est plus jouable tant que le doute
// n'est pas levé ; seul usage permis : CF.2 et tâches « set », signalé au chef de projet).
export interface RecipeEntry {
  level: 'generated' | 'verified' | 'doubt';
  recipe?: Recipe;                // absent seulement si handCoded
  handCoded?: boolean;
  doubt?: Doubt;                  // obligatoire si level === 'doubt'
  note?: string;                  // remarque de relecture (sans texte de carte)
}

// Un fichier recipes/sets/<set>.ts exporte un RecipeSet
export interface RecipeSet {
  set: string;                    // préfixe des numéros : 'EB05', 'OP17', 'ST31', 'P'
  entries: Record<string, RecipeEntry>;  // numéro → entrée
}

// ---------- Code à la main dans une recette (sortie « manual ») ----------

// Un morceau { kind: 'manual', reason: 'clé' } est cherché par le compilateur sous MANUAL[num][clé], exporté par le
// fichier de cartes à la main du set (cards/<set>.ts). Une carte peut ainsi être à 90 % recette et 10 % code.
export interface ManualCode {
  steps?: Record<string, (ctx: EffectCtx) => void>;
  conds?: Record<string, (ctx: EffectCtx) => boolean>;
  costs?: Record<string, { canPay: (ctx: EffectCtx) => boolean; pay: (ctx: EffectCtx) => boolean }>;
}
export type ManualRegistry = Record<string, ManualCode>;  // numéro → code
