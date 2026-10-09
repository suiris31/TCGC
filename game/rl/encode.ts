// Observation d'un joueur pour l'apprentissage par renforcement : des tableaux de nombres construits UNIQUEMENT à partir
// de sa vue de la partie (engine/view.ts, viewFor), qui ne contient aucune information cachée. Rien ici ne lit l'état
// complet : la fonction reçoit la vue, et un test vérifie que l'observation ne change pas quand on redistribue au hasard
// les cartes que le joueur ne peut pas connaître (game/tests/rl-env.test.ts).
//
// L'observation comprend :
// - un jeton par carte visible (Leaders, Personnages, Lieux, sa main, cartes de Vie face visible, cartes révélées ou
//   regardées, cartes montrées par la décision en cours) et un jeton par numéro de carte pour les zones résumées
//   (Défausses, cartes de son deck pas encore vues), avec leurs caractéristiques dynamiques (puissance, coût, épuisée,
//   DON!!, mots-clés effectifs, modifications...) ; les caractéristiques statiques sont dans features.ts ;
// - des caractéristiques globales (tour, phase, décision, Vies, mains, decks, DON!!, combat en cours...) ;
// - une ligne par option de la décision, avec des pointeurs vers les jetons des cartes qu'elle désigne : le modèle donne
//   un score à chaque option légale (aucune liste fixe d'actions, aucune combinaison à énumérer) ; chaque ligne porte
//   aussi les comparaisons qu'un joueur fait avant de choisir (attaquant contre cible, Contre suffisant ou non...),
//   calculées à partir de la même vue : des faits visibles, pas des règles de jeu.
//
// Ce qui n'est jamais utilisé : identifiants des cartes (uid) comme valeur, deck adverse (deckId), journal, historique,
// textes des questions et des options, graine du hasard, compteur d'événements.
import { DECKS } from '../engine/decks.ts';
import {
  attackAbility, attackTargets, canBeRested, def, fieldCost, findField, handCost, hasKeyword, hasMod, other, power,
} from '../engine/rules.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { KEYWORDS } from '../engine/keywords.ts';
import type { Card, FieldCard, GameState, Option, PlayerId } from '../engine/types.ts';
import {
  BATTLE_STEPS, DECISION_KINDS, DECK_OUT_RULES, FLOW_STAGES, OPTION_KINDS, optionKind, POOLED_ZONES, STATIC_FEATURES,
  TAG_FAMILIES, tagFamily, ZONES, type Zone,
} from './features.ts';

export const MAX_TOKENS = 160;

export const DYN_FEATURES: string[] = [
  ...ZONES.map((z) => `zone:${z}`),
  'mine', 'count', 'position', 'faceUp',
  'rested', 'don', 'power', 'powerDelta', 'cost', 'costDelta',
  'canAttack', 'attackCharsOnly', 'playedThisTurn', 'canBeRested',
  ...KEYWORDS.map((k) => `keyword:${k}`),
  'mod:cantAttack', 'mod:cantRest', 'mod:cantBeKO', 'mod:cantLeave', 'mod:noAttackLowCost', 'mod:tempPower', 'mod:tempCost',
  'oncePerTurnUsed', 'hasActivateMain',
  'battleAttacker', 'battleTarget', 'decisionSource',
  'typeShareOwnerLeader', 'nameShareOwnerLeader',
  'handCost', 'playableNow', 'knownToOpp',
];
export const DYN_DIM = DYN_FEATURES.length;

const sideFeatures = (side: string) => [
  'life', 'lifeFaceDown', 'hand', 'handKnown', 'deck', 'trash', 'donDeck', 'donActive', 'donRested', 'donAttached',
  'donField', 'chars', 'hasStage', 'discardedThisTurn', 'leaderRested', 'leaderDon', 'turns',
  ...DECK_OUT_RULES.map((r) => `deckOut:${r}`),
].map((f) => `${side}:${f}`);

export const GLOBAL_FEATURES: string[] = [
  'turn', 'myTurn', 'iAmFirst', 'firstTurnNoBattle',
  ...FLOW_STAGES.map((f) => `flow:${f}`),
  ...DECISION_KINDS.map((k) => `decision:${k}`), 'decision:inEffect', 'decision:none',
  ...TAG_FAMILIES.map((t) => `tag:${t}`),
  ...sideFeatures('my'), ...sideFeatures('opp'),
  'battle', ...BATTLE_STEPS.map((b) => `battleStep:${b}`), 'battleBlocked', 'battleAttackerMine', 'battleAttackerPower',
  'battleTargetPower', 'battleGap', 'battleTargetLeader',
  'optionCount', 'tokensDropped',
];
export const GLOBAL_DIM = GLOBAL_FEATURES.length;

const BASE_OPTION_FEATURES: string[] = [
  ...OPTION_KINDS.map((k) => `kind:${k}`),
  'arg', 'hasRef', 'hasTarget', 'refMine', 'refOnField', 'refInHand', 'targetIsLeader',
];
// Comparaisons par option (encodage 4), ajoutées APRÈS les colonnes de l'encodage 3 : un modèle de l'encodage 3 se
// prolonge avec des poids nuls pour elles (il joue d'abord exactement pareil, voir PREVIOUS_SPECS et rl/opcg_rl/migrate.py)
export const OPTION_COMPARISONS: string[] = [
  'atk:margin', 'atk:wins', 'atk:donNeeded', 'atk:donAffordable',
  'don:canAttack', 'don:reachesOppLeader', 'don:alreadyAboveOppLeader',
  'ctr:value', 'ctr:sufficient', 'ctr:repelled', 'ctr:need', 'ctr:handTotal',
  'blk:margin', 'blk:survives',
  'play:donLeft',
];
export const OPTION_FEATURES: string[] = [...BASE_OPTION_FEATURES, ...OPTION_COMPARISONS];
export const OPTION_DIM = OPTION_FEATURES.length;

// Empreinte de l'encodage : tout changement de colonnes la change (un modèle n'est utilisable qu'avec la même)
function fnvHex(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const ENCODING_VERSION = 4;
export const SPEC_HASH = fnvHex(JSON.stringify([ENCODING_VERSION, STATIC_FEATURES, DYN_FEATURES, GLOBAL_FEATURES, OPTION_FEATURES]));
// Encodages précédents dont un modèle se prolonge : identiques à l'actuel sauf les dernières colonnes des options
export const PREVIOUS_SPECS: { specHash: string; encodingVersion: number; optionDim: number }[] = [
  { specHash: fnvHex(JSON.stringify([3, STATIC_FEATURES, DYN_FEATURES, GLOBAL_FEATURES, BASE_OPTION_FEATURES])), encodingVersion: 3, optionDim: BASE_OPTION_FEATURES.length },
];

export interface Observation {
  seat: PlayerId;
  nums: string[];        // numéro de carte de chaque jeton (« ? » : carte cachée)
  group: Int32Array;     // 0 : jeton individuel ; 1, 2, 3 : zone résumée (voir POOLED_ZONES)
  dyn: Float32Array;     // nums.length × DYN_DIM
  global: Float32Array;  // GLOBAL_DIM
  options: string[];     // identifiants des options, dans l'ordre de la décision (vide : observation sans décision)
  opt: Float32Array;     // options.length × OPTION_DIM
  ptr: Int32Array;       // options.length × 2 : jeton de la carte désignée, jeton de la cible (-1 : aucun)
}

interface Token {
  num: string;
  zone: Zone;
  owner: PlayerId;
  uid?: number;
  count: number;
  pos: number;
  faceUp?: boolean;
  field?: FieldCard;
}

// Jetons, par ordre de priorité (si MAX_TOKENS est dépassé, les derniers sont abandonnés et comptés)
function tokensOf(v: GameState, me: PlayerId, optionCards: Map<number, string>, shownOwner: Map<number, PlayerId>): Token[] {
  const opp = other(me);
  const P = v.players[me];
  const O = v.players[opp];
  const out: Token[] = [];
  const add = (t: Omit<Token, 'count' | 'pos'> & { count?: number; pos?: number }) => out.push({ count: 1, pos: 0, ...t });
  const field = (p: PlayerId, side: 'my' | 'opp') => {
    const X = v.players[p];
    add({ num: X.leader.num, zone: `${side}Leader` as Zone, owner: p, uid: X.leader.uid, field: X.leader });
    X.chars.forEach((c, i) => add({ num: c.num, zone: `${side}Char` as Zone, owner: p, uid: c.uid, field: c, pos: i / 5 }));
    if (X.stage) add({ num: X.stage.num, zone: `${side}Stage` as Zone, owner: p, uid: X.stage.uid, field: X.stage });
  };
  field(me, 'my');
  field(opp, 'opp');
  P.hand.forEach((c, i) => add({ num: c.num, zone: 'myHand', owner: me, uid: c.uid, pos: i / 10 }));
  // main adverse : les cartes connues, sans leur place (l'ordre d'une main n'est pas public)
  for (const c of O.hand) if (c.num !== HIDDEN) add({ num: c.num, zone: 'oppHandKnown', owner: opp, uid: c.uid });
  P.life.forEach((c, i) => { if (c.num !== HIDDEN) add({ num: c.num, zone: 'myLifeUp', owner: me, uid: c.uid, pos: i / 5, faceUp: Boolean(c.faceUp) }); });
  O.life.forEach((c, i) => { if (c.num !== HIDDEN) add({ num: c.num, zone: 'oppLifeUp', owner: opp, uid: c.uid, pos: i / 5, faceUp: Boolean(c.faceUp) }); });
  P.deck.forEach((c, i) => { if (c.num !== HIDDEN) add({ num: c.num, zone: 'myDeckKnown', owner: me, uid: c.uid, pos: i / 40 }); });
  O.deck.forEach((c, i) => { if (c.num !== HIDDEN) add({ num: c.num, zone: 'oppDeckTop', owner: opp, uid: c.uid, pos: i / 40 }); });
  // cartes montrées par la décision mais dans aucune zone (cartes regardées pendant un effet, carte de Vie révélée)
  const placed = new Set(out.map((t) => t.uid));
  for (const z of [P.trash, O.trash]) for (const c of z) placed.add(c.uid);
  for (const [uid, num] of optionCards) if (!placed.has(uid)) add({ num, zone: 'limbo', owner: shownOwner.get(uid) ?? me, uid });
  // zones résumées : un jeton par numéro de carte, avec le nombre d'exemplaires
  const pooled = (cards: Card[], zone: Zone, owner: PlayerId) => {
    const byNum = new Map<string, number>();
    for (const c of cards) byNum.set(c.num, (byNum.get(c.num) ?? 0) + 1);
    for (const [num, count] of byNum) add({ num, zone, owner, count });
  };
  pooled(P.trash, 'myTrash', me);
  pooled(O.trash, 'oppTrash', opp);
  // son propre deck : sa liste moins les cartes qu'il voit (main, terrain, Défausse, Vies et cartes du deck connues)
  const list = P.list ?? (DECKS[P.deckId] ? { leader: DECKS[P.deckId].leader, cards: DECKS[P.deckId].cards } : null);
  if (list) {
    const left = new Map(Object.entries(list.cards));
    // ses cartes en suspens (regardées, révélées par un [Déclenchement], en train d'être jouées) ne sont plus dans le deck
    const limbo = out.filter((t) => t.zone === 'limbo' && t.owner === me);
    const seen = [...P.hand, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.trash, ...P.life, ...P.deck, ...limbo];
    for (const c of seen) if (c.num !== HIDDEN && left.has(c.num)) left.set(c.num, left.get(c.num)! - 1);
    for (const [num, count] of left) if (count > 0) add({ num, zone: 'myPool', owner: me, count });
  }
  return out;
}

function dynFeatures(v: GameState, me: PlayerId, t: Token, out: Float32Array, at: number) {
  let i = at;
  for (const z of ZONES) out[i++] = t.zone === z ? 1 : 0;
  const d = def(t.num);
  const P = v.players[t.owner];
  out[i++] = t.owner === me ? 1 : 0;
  out[i++] = t.count / 4;
  out[i++] = t.pos;
  out[i++] = t.faceUp ? 1 : 0;
  const f = t.field;
  const isStage = t.zone === 'myStage' || t.zone === 'oppStage';
  if (f) {
    const pw = isStage ? 0 : power(v, f.uid);
    const leader = t.zone === 'myLeader' || t.zone === 'oppLeader';
    const cost = leader || isStage ? d.cost ?? 0 : fieldCost(v, f.uid);
    out[i++] = f.rested ? 1 : 0;
    out[i++] = f.don / 5;
    out[i++] = pw / 10000;
    out[i++] = (pw - (isStage ? 0 : d.power ?? 0)) / 5000;
    out[i++] = cost / 10;
    out[i++] = (cost - (d.cost ?? 0)) / 5;
    const ability = isStage ? { can: false, charsOnly: false } : attackAbility(v, t.owner, f);
    out[i++] = ability.can && v.active === t.owner ? 1 : 0;
    out[i++] = ability.charsOnly ? 1 : 0;
    out[i++] = f.playedTurn === v.turn ? 1 : 0;
    out[i++] = canBeRested(v, f.uid) ? 1 : 0;
    for (const k of KEYWORDS) out[i++] = isStage ? 0 : hasKeyword(v, t.owner, f, k) ? 1 : 0;
    out[i++] = hasMod(v, f.uid, 'cantAttack') ? 1 : 0;
    out[i++] = hasMod(v, f.uid, 'cantRest') ? 1 : 0;
    out[i++] = hasMod(v, f.uid, 'cantBeKO') ? 1 : 0;
    out[i++] = hasMod(v, f.uid, 'cantLeave') ? 1 : 0;
    out[i++] = hasMod(v, f.uid, 'noAttackLowCost') ? 1 : 0;
    let tempPower = 0;
    let tempCost = 0;
    for (const m of v.mods) {
      if (m.uid !== f.uid) continue;
      if (m.stat === 'power') tempPower += m.amount;
      if (m.stat === 'cost') tempCost += m.amount;
    }
    out[i++] = tempPower / 5000;
    out[i++] = tempCost / 5;
    out[i++] = f.usedOpt.length ? 1 : 0;
  } else {
    // carte hors du terrain : coût et puissance imprimés (le coût en main est plus bas)
    out[i++] = 0;
    out[i++] = 0;
    out[i++] = (d.power ?? 0) / 10000;
    out[i++] = 0;
    out[i++] = (d.cost ?? 0) / 10;
    out[i++] = 0;
    i += 4 + KEYWORDS.length + 8;
  }
  out[i++] = d.activateMain ? 1 : 0;
  const b = v.battle;
  out[i++] = b && t.uid !== undefined && b.attacker === t.uid ? 1 : 0;
  out[i++] = b && t.uid !== undefined && b.target === t.uid ? 1 : 0;
  // seulement la décision du joueur lui-même : celle de l'adversaire (et sa carte source) ne le regarde pas
  const own = v.decision?.player === me ? v.decision : null;
  out[i++] = own?.source !== undefined && t.uid !== undefined && own.source === t.uid ? 1 : 0;
  const leader = def(P.leader.num);
  out[i++] = d.types.some((ty) => leader.types.includes(ty)) ? 1 : 0;
  out[i++] = d.names.some((n) => leader.names.includes(n)) ? 1 : 0;
  if (t.zone === 'myHand') {
    const cost = handCost(v, me, { uid: t.uid!, num: t.num });
    out[i++] = cost / 10;
    const playable = d.category === 'CHARACTER' || d.category === 'STAGE' || (d.category === 'EVENT' && Boolean(d.onMain));
    out[i++] = playable && cost <= v.players[me].donActive && v.active === me ? 1 : 0;
  } else {
    out[i++] = 0;
    out[i++] = 0;
  }
  // carte de sa main révélée à l'adversaire (il sait qu'il l'a)
  out[i++] = t.zone === 'myHand' && v.known?.some((k) => k.uid === t.uid && k.to !== me) ? 1 : 0;
  if (i !== at + DYN_DIM) throw new Error(`caractéristiques dynamiques : ${i - at} colonnes au lieu de ${DYN_DIM}`);
}

function globalFeatures(v: GameState, me: PlayerId, nOptions: number, dropped: number): Float32Array {
  const g = new Float32Array(GLOBAL_DIM);
  let i = 0;
  const P = v.players[me];
  g[i++] = v.turn / 20;
  g[i++] = v.active === me ? 1 : 0;
  g[i++] = v.first === me ? 1 : 0;
  g[i++] = P.turns <= 1 ? 1 : 0;
  for (const f of FLOW_STAGES) g[i++] = v.flow.stage === f ? 1 : 0;
  const d = v.decision && v.decision.player === me ? v.decision : null;
  for (const k of DECISION_KINDS) g[i++] = d?.kind === k ? 1 : 0;
  g[i++] = d?.inEffect ? 1 : 0;
  g[i++] = d ? 0 : 1;
  const family = d ? tagFamily(d.tag) : 'none';
  for (const t of TAG_FAMILIES) g[i++] = family === t ? 1 : 0;
  for (const p of [me, other(me)]) {
    const X = v.players[p];
    const attached = X.leader.don + X.chars.reduce((n, c) => n + c.don, 0);
    g[i++] = X.life.length / 5;
    g[i++] = X.life.filter((c) => c.num === HIDDEN).length / 5;
    g[i++] = X.hand.length / 10;
    g[i++] = X.hand.filter((c) => c.num !== HIDDEN).length / 10;
    g[i++] = X.deck.length / 40;
    g[i++] = X.trash.length / 40;
    g[i++] = X.donDeck / 10;
    g[i++] = X.donActive / 10;
    g[i++] = X.donRested / 10;
    g[i++] = attached / 10;
    g[i++] = (X.donActive + X.donRested + attached) / 10;
    g[i++] = X.chars.length / 5;
    g[i++] = X.stage ? 1 : 0;
    g[i++] = X.discardedTurn === v.turn ? 1 : 0;
    g[i++] = X.leader.rested ? 1 : 0;
    g[i++] = X.leader.don / 5;
    g[i++] = X.turns / 10;
    const rule = def(X.leader.num).rules?.deckOut ?? 'lose';
    for (const r of DECK_OUT_RULES) g[i++] = rule === r ? 1 : 0;
  }
  const b = v.battle;
  g[i++] = b ? 1 : 0;
  // étape du combat : seulement quand le joueur décide (sinon, une pause à l'étape Contre trahirait que l'adversaire
  // a de quoi contrer : cas de l'observation finale d'une partie tronquée)
  for (const step of BATTLE_STEPS) g[i++] = d && b?.step === step ? 1 : 0;
  if (b) {
    const atk = power(v, b.attacker);
    const dp = power(v, b.target);
    g[i++] = b.blocked ? 1 : 0;
    g[i++] = v.active === me ? 1 : 0;
    g[i++] = atk / 10000;
    g[i++] = dp / 10000;
    g[i++] = (atk - dp) / 5000;
    g[i++] = v.players[0].leader.uid === b.target || v.players[1].leader.uid === b.target ? 1 : 0;
  } else {
    i += 6;
  }
  g[i++] = nOptions / 32;
  g[i++] = dropped / 10;
  if (i !== GLOBAL_DIM) throw new Error(`caractéristiques globales : ${i} colonnes au lieu de ${GLOBAL_DIM}`);
  return g;
}

// Comparaisons d'une option (OPTION_COMPARISONS), à partir de la vue du joueur : les cartes comparées sont sur le
// terrain ou dans sa main, donc visibles. Puissances en milliers / 5, DON!! / 5 ou / 10.
interface Context {
  donActive: number;
  oppLeaderPower: number;
  battle: { atk: number; dp: number; need: number } | null;   // combat où le joueur décide (Contre, Bloqueur)
  handCounter: number;
}

function comparisons(v: GameState, me: PlayerId, o: Option, kind: string, ctx: Context, out: Float32Array, at: number) {
  const x = (k: string, value: number) => { out[at + OPTION_COMPARISONS.indexOf(k)] = value; };
  const onField = (uid: number | undefined) => (uid !== undefined ? findField(v, uid) : null);
  if (kind === 'attack:' && onField(o.uid) && onField(o.target)) {
    const margin = power(v, o.uid!) - power(v, o.target!);
    const n = margin >= 0 ? 0 : Math.ceil(-margin / 1000);
    x('atk:margin', margin / 5000);
    x('atk:wins', margin >= 0 ? 1 : 0);
    x('atk:donNeeded', n / 5);
    x('atk:donAffordable', n <= ctx.donActive ? 1 : 0);
  }
  if (kind === 'don:') {
    // cibles réelles : un Personnage joué ce tour avec [Initiative : Personnage] n'attaque que des Personnages
    const f = onField(o.uid);
    const targets = f ? attackTargets(v, me, f.card) : [];
    if (f && targets.length) {
      const pw = power(v, f.card.uid);
      x('don:canAttack', 1);
      if (targets.includes(v.players[other(me)].leader.uid)) {
        x('don:reachesOppLeader', pw < ctx.oppLeaderPower && pw + 1000 >= ctx.oppLeaderPower ? 1 : 0);
        x('don:alreadyAboveOppLeader', pw >= ctx.oppLeaderPower ? 1 : 0);
      }
    }
  }
  const b = ctx.battle;
  if (b && (kind === 'counter:' || kind === 'cevent:' || kind === 'pass')) {
    if (kind === 'counter:') {
      const card = v.players[me].hand.find((c) => c.uid === o.uid);
      const value = card ? def(card.num).counter ?? 0 : 0;
      x('ctr:value', value / 5000);
      x('ctr:sufficient', b.need > 0 && value >= b.need ? 1 : 0);
    }
    x('ctr:repelled', b.atk < b.dp ? 1 : 0);
    x('ctr:need', b.need / 5000);
    x('ctr:handTotal', ctx.handCounter / 5000);
  }
  if (b && kind === 'block:' && onField(o.uid)) {
    const pw = power(v, o.uid!);
    x('blk:margin', (pw - b.atk) / 5000);
    x('blk:survives', pw > b.atk ? 1 : 0);
  }
  if (kind === 'play:' || kind === 'event:') {
    const card = v.players[me].hand.find((c) => c.uid === o.uid);
    if (card) x('play:donLeft', (ctx.donActive - handCost(v, me, card)) / 10);
  }
}

// Cartes désignées par une option : uid et target (toute option qui désigne une carte les renseigne). L'identifiant de
// l'option n'est jamais lu : « cost:4 » ne désigne pas la carte 4.
function optionRefs(o: Option): { ref?: number; target?: number } {
  return { ref: o.uid, target: o.target };
}

// Observation du joueur `me` à partir de SA VUE (viewFor(état, me)). Sans décision de ce joueur (fin de partie
// tronquée, estimation de la valeur), la liste des options est vide.
export function encodeObservation(v: GameState, me: PlayerId): Observation {
  const d = v.decision && v.decision.player === me ? v.decision : null;
  const options = d?.options ?? [];
  // cartes des options : numéro connu par l'option (carte regardée) ou par sa zone
  // (une option qui nomme une carte sans identifiant, comme la carte de Vie d'un [Déclenchement], reçoit un
  // identifiant négatif propre à l'observation)
  const optionCards = new Map<number, string>();
  const named = new Map<number, number>();  // option -> identifiant de sa carte
  // cartes que la question montre (toutes les cartes regardées, même celles qu'on ne peut pas choisir)
  const shownOwner = new Map<number, PlayerId>();
  for (const c of d?.cards ?? []) {
    optionCards.set(c.uid, c.num);
    if (c.owner !== undefined) shownOwner.set(c.uid, c.owner);
  }
  options.forEach((o, a) => {
    const { ref } = optionRefs(o);
    if (ref !== undefined) {
      named.set(a, ref);
      if (o.num) optionCards.set(ref, o.num);
      else if (!findAnywhere(v, ref)) optionCards.set(ref, HIDDEN);
    } else if (o.num && optionKind(o.id) !== 'first:') {
      named.set(a, -1_000_000 - a);
      optionCards.set(-1_000_000 - a, o.num);
    }
  });
  let tokens = tokensOf(v, me, optionCards, shownOwner);
  const dropped = Math.max(0, tokens.length - MAX_TOKENS);
  if (dropped) tokens = tokens.slice(0, MAX_TOKENS);
  const n = tokens.length;
  const dyn = new Float32Array(n * DYN_DIM);
  const group = new Int32Array(n);
  const index = new Map<number, number>();  // uid -> jeton
  const trashToken = new Map<string, number>();  // « zone:numéro » -> jeton résumé
  tokens.forEach((t, k) => {
    dynFeatures(v, me, t, dyn, k * DYN_DIM);
    group[k] = POOLED_ZONES[t.zone] ?? 0;
    if (t.uid !== undefined && !index.has(t.uid)) index.set(t.uid, k);
    if (t.zone === 'myTrash' || t.zone === 'oppTrash') trashToken.set(`${t.zone}:${t.num}`, k);
  });
  // une carte de la Défausse désignée par une option pointe vers le jeton de son numéro
  const tokenOf = (uid: number | undefined): number => {
    if (uid === undefined) return -1;
    const k = index.get(uid);
    if (k !== undefined) return k;
    for (const [p, zone] of [[me, 'myTrash'], [other(me), 'oppTrash']] as const) {
      const c = v.players[p].trash.find((x) => x.uid === uid);
      if (c) return trashToken.get(`${zone}:${c.num}`) ?? -1;
    }
    return -1;
  };
  const opt = new Float32Array(options.length * OPTION_DIM);
  const ptr = new Int32Array(options.length * 2).fill(-1);
  const P = v.players[me];
  let battle: Context['battle'] = null;
  if (d && v.battle && (d.kind === 'counter' || d.kind === 'blocker')) {
    const atk = power(v, v.battle.attacker);
    const dp = power(v, v.battle.target);
    battle = { atk, dp, need: atk >= dp ? atk - dp + 1000 : 0 };
  }
  const ctx: Context = {
    donActive: P.donActive,
    oppLeaderPower: power(v, v.players[other(me)].leader.uid),
    battle,
    handCounter: P.hand.reduce((n, c) => n + (c.num !== HIDDEN && def(c.num).category === 'CHARACTER' ? def(c.num).counter ?? 0 : 0), 0),
  };
  options.forEach((o, a) => {
    let i = a * OPTION_DIM;
    const kind = optionKind(o.id);
    for (const k of OPTION_KINDS) opt[i++] = kind === k ? 1 : 0;
    const arg = o.id.split(':')[1];
    opt[i++] = kind === 'cost:' ? Number(arg) / 10 : kind === 'choice:' ? Number(arg) / 4 : 0;
    const { target } = optionRefs(o);
    let r = tokenOf(named.get(a));
    // « first:numéro » (ordre des effets) : la carte de ce numéro sur son terrain, sinon dans sa Défausse
    if (kind === 'first:' && o.num) {
      r = tokens.findIndex((t) => t.num === o.num && t.owner === me && t.field !== undefined);
      if (r < 0) r = tokens.findIndex((t) => t.num === o.num && t.zone === 'myTrash');
    }
    const tg = tokenOf(target);
    ptr[a * 2] = r;
    ptr[a * 2 + 1] = tg;
    opt[i++] = r >= 0 ? 1 : 0;
    opt[i++] = tg >= 0 ? 1 : 0;
    const rt = r >= 0 ? tokens[r] : null;
    opt[i++] = rt?.owner === me ? 1 : 0;
    opt[i++] = rt?.field ? 1 : 0;
    opt[i++] = rt?.zone === 'myHand' ? 1 : 0;
    opt[i++] = tg >= 0 && (tokens[tg].zone === 'oppLeader' || tokens[tg].zone === 'myLeader') ? 1 : 0;
    comparisons(v, me, o, kind, ctx, opt, i);
  });
  return {
    seat: me,
    nums: tokens.map((t) => t.num),
    group,
    dyn,
    global: globalFeatures(v, me, options.length, dropped),
    options: options.map((o) => o.id),
    opt,
    ptr,
  };
}

function findAnywhere(v: GameState, uid: number): boolean {
  for (const P of v.players) {
    if (P.leader.uid === uid || P.stage?.uid === uid) return true;
    for (const z of [P.chars, P.hand, P.trash, P.life, P.deck]) if (z.some((c) => c.uid === uid)) return true;
  }
  return false;
}
