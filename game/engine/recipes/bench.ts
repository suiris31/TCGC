// Banc d'essai des recettes (tâche C1.3) : la plomberie commune aux tests générés (testgen.ts), à la comparaison
// « code à la main ↔ recette » (crosscheck.ts) et aux parties au hasard (fuzz.ts).
//   - installer un comportement le temps d'un essai (CARDS est partagé : toujours restaurer, voir withBehavior) ;
//   - construire une situation (decks faits pour l'essai, zones remplies à la main, comme game/tests/helpers.ts) ;
//   - déclencher une capacité à son moment ([Jouée], [Principale], [Activation : Principale], [En attaquant],
//     [En cas de KO], [Fin de votre tour], [Contre], [Déclenchement]) et répondre aux questions de l'effet.
// Ce module ne sert qu'aux tests et aux scripts : la partie ne l'utilise jamais.
import { CARDS, cardData, cardStatus, HIDDEN } from '../cards/index.ts';
import { CUSTOM_SERIES, type DeckList } from '../decks.ts';
import { act, advance, newGame } from '../engine.ts';
import { invariantErrors } from '../invariants.ts';
import type { Card, CardBehavior, CardDef, Decision, FieldCard, GameState, PlayerId } from '../types.ts';
import type { Timing } from './types.ts';

export type Chooser = (s: GameState, d: Decision) => string;

// ---------- Comportement installé le temps d'un essai ----------

// Champs des données officielles (CardData) : tout le reste d'un CardDef est le comportement codé
const DATA_KEYS = new Set(['keywords', 'imageId', 'effect', 'trigger']);

function behaviorKeys(num: string): string[] {
  const raw = cardData()[num] ?? {};
  return Object.keys(CARDS[num]).filter((k) => !(k in raw) && !DATA_KEYS.has(k));
}

// Comportement actuel d'une carte (code à la main, recette chargée...) : ce que CARDS ajoute aux données officielles
export function currentBehavior(num: string): CardBehavior {
  const d = CARDS[num] as unknown as Record<string, unknown>;
  return Object.fromEntries(behaviorKeys(num).map((k) => [k, d[k]])) as CardBehavior;
}

// Remplace le comportement d'une carte (les données officielles restent) ; renvoie de quoi le remettre
export function installBehavior(num: string, b: CardBehavior): () => void {
  const original = CARDS[num];
  const base = { ...original } as Record<string, unknown>;
  for (const k of behaviorKeys(num)) delete base[k];
  CARDS[num] = { ...(base as unknown as CardDef), ...b };
  return () => { CARDS[num] = original; };
}

export function withBehavior<T>(num: string, b: CardBehavior, run: () => T): T {
  const restore = installBehavior(num, b);
  try {
    return run();
  } finally {
    restore();
  }
}

// Le même comportement sans l'effet d'un moment (référence des tests générés : la carte est jouée, son coût payé,
// mais son effet ne fait rien). L'Événement garde un [Principale] vide : sinon il ne pourrait pas être activé.
export function withoutTiming(b: CardBehavior, timing: Timing): CardBehavior {
  const noop = () => {};
  switch (timing) {
    case 'onPlay': return { ...b, onPlay: noop };
    case 'main': return { ...b, onMain: noop };
    case 'counter': return { ...b, onCounter: noop };
    case 'trigger': return { ...b, onTrigger: noop };
    case 'whenAttacking': return { ...b, whenAttacking: noop };
    case 'onKO': return { ...b, onKO: noop };
    case 'endOfTurn': return { ...b, endOfTurn: noop };
    case 'activateMain': return b.activateMain ? { ...b, activateMain: { ...b.activateMain, run: noop } } : b;
    default: return b;
  }
}

// Moments que le banc sait déclencher
export const DRIVEN_TIMINGS: readonly Timing[] = ['onPlay', 'main', 'activateMain', 'whenAttacking', 'onKO', 'endOfTurn', 'counter', 'trigger'];

// Le moment a-t-il du code dans ce comportement ?
export function hasTiming(b: CardBehavior, timing: Timing): boolean {
  switch (timing) {
    case 'onPlay': return Boolean(b.onPlay);
    case 'main': return Boolean(b.onMain);
    case 'counter': return Boolean(b.onCounter);
    case 'trigger': return Boolean(b.onTrigger);
    case 'whenAttacking': return Boolean(b.whenAttacking);
    case 'onKO': return Boolean(b.onKO);
    case 'endOfTurn': return Boolean(b.endOfTurn);
    case 'activateMain': return Boolean(b.activateMain);
    default: return false;
  }
}

// ---------- Cartes d'appoint ----------

// Carte « inerte » : aucun comportement codé ni mot-clé (une carte pas encore jouable n'a aucun effet en partie) ; elle
// sert de cible, de leurre ou de remplissage sans rien déclencher
export function isInert(num: string): boolean {
  const d = CARDS[num];
  return Boolean(d) && num !== HIDDEN && cardStatus(num) !== 'coded' && d.keywords.length === 0;
}

let inertCache: { chars: string[]; leaders: string[]; size: number } | null = null;
export function inertPool(): { chars: string[]; leaders: string[] } {
  const size = Object.keys(CARDS).length;
  if (!inertCache || inertCache.size !== size) {
    const nums = Object.keys(CARDS).filter(isInert).sort();
    inertCache = {
      chars: nums.filter((n) => CARDS[n].category === 'CHARACTER'),
      leaders: nums.filter((n) => CARDS[n].category === 'LEADER' && !CARDS[n].rules),
      size,
    };
  }
  return inertCache;
}

// ---------- Situations ----------

export interface SideSpec {
  leader: string;
  leaderDon?: number;
  leaderRested?: boolean;
  hand: string[];
  chars: { num: string; rested?: boolean; don?: number }[];
  stage?: string;
  life: string[];               // du dessus vers le dessous
  trash: string[];
  deckTop: string[];            // du dessus vers le dessous
  donActive: number;
  donRested: number;
}

export interface SituationSpec {
  sides: [SideSpec, SideSpec];
  active: PlayerId;
  filler: [string, string];     // carte qui complète chaque deck (inerte)
  seed: number;
}

export const emptySide = (leader: string): SideSpec => ({ leader, hand: [], chars: [], life: [], trash: [], deckTop: [], donActive: 0, donRested: 0 });

// Deck fait pour l'essai : exactement les cartes de la situation, complétées par la carte d'appoint (50 cartes au moins,
// plus de quoi piocher). La liste n'a pas à être légale : les contrôles de cohérence comparent à la liste de la partie.
function deckFor(side: SideSpec, filler: string, k: number): DeckList {
  const cards: Record<string, number> = {};
  const add = (n: string) => { cards[n] = (cards[n] ?? 0) + 1; };
  for (const n of [...side.hand, ...side.chars.map((c) => c.num), ...side.life, ...side.trash, ...side.deckTop]) add(n);
  if (side.stage) add(side.stage);
  const used = Object.values(cards).reduce((a, b) => a + b, 0);
  cards[filler] = (cards[filler] ?? 0) + Math.max(20, 50 - used);
  return { id: `PERSO-banc${k}`, name: `Banc d'essai ${k + 1}`, series: CUSTOM_SERIES, leader: side.leader, cards };
}

function takeCard(s: GameState, p: PlayerId, num: string): Card {
  const P = s.players[p];
  for (const zone of [P.deck, P.hand, P.life, P.trash]) {
    const i = zone.findIndex((c) => c.num === num);
    if (i >= 0) return zone.splice(i, 1)[0];
  }
  throw new Error(`banc d'essai : ${num} introuvable dans les cartes du joueur ${p}`);
}

const toField = (c: Card, extra: Partial<FieldCard> = {}): FieldCard => ({ uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra });

// Partie au tour 5 (les deux joueurs ont déjà joué), en phase principale du joueur actif, zones remplies d'après la
// spécification. Toutes les cartes posées sont prises dans le deck du joueur : la partie reste cohérente.
export function buildSituation(spec: SituationSpec): GameState {
  const decks = [deckFor(spec.sides[0], spec.filler[0], 0), deckFor(spec.sides[1], spec.filler[1], 1)] as [DeckList, DeckList];
  const s = act(act(newGame({ decks, names: ['Moi', 'IA'], seed: spec.seed, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 3;
  s.turn = 5;
  s.active = spec.active;
  s.decision = null;
  s.flow = { stage: 'main' };
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    const S = spec.sides[p];
    // tout revient dans le deck, puis chaque zone prend ses cartes
    P.deck.push(...P.hand, ...P.life);
    P.hand = [];
    P.life = [];
    P.hand = S.hand.map((n) => takeCard(s, p, n));
    P.life = S.life.map((n) => takeCard(s, p, n));
    P.trash = S.trash.map((n) => takeCard(s, p, n));
    P.chars = S.chars.map((c) => toField(takeCard(s, p, c.num), { rested: Boolean(c.rested), don: c.don ?? 0 }));
    P.stage = S.stage ? toField(takeCard(s, p, S.stage)) : null;
    const top = S.deckTop.map((n) => takeCard(s, p, n));
    P.deck.unshift(...top);
    P.leader.don = S.leaderDon ?? 0;
    P.leader.rested = Boolean(S.leaderRested);
    const attached = P.leader.don + P.chars.reduce((sum, c) => sum + c.don, 0);
    const total = 10;
    P.donActive = Math.min(S.donActive, total - attached);
    P.donRested = Math.max(0, Math.min(S.donRested, total - attached - P.donActive));
    P.donDeck = total - attached - P.donActive - P.donRested;
  }
  return advance(s);
}

// ---------- Déclencher une capacité ----------

export interface DriveResult {
  state: GameState;
  ran: boolean;                 // la capacité a pu être déclenchée
  reason?: string;              // sinon, pourquoi (« injouable »...)
}

// uid de la carte essayée selon son moment : en main ([Jouée], [Principale], [Contre]), sur le terrain ([Activation],
// [En attaquant], [Fin de votre tour] ; Leader ou Lieu compris), dans la Défausse ([En cas de KO]), en Vie
// ([Déclenchement]). Dans une situation construite par le banc, la carte essayée n'existe qu'en un exemplaire.
export function locate(s: GameState, num: string, p: PlayerId = 0): number | null {
  const P = s.players[p];
  const all = [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.trash, ...P.life, ...P.deck];
  return all.find((c) => c.num === num)?.uid ?? null;
}

// Déclenche la capacité de la carte `self` (joueur 0) à son moment, puis répond aux questions de l'effet avec
// `chooser` ; s'arrête à la première décision qui n'appartient plus à l'effet (phase principale, Bloqueur adverse...).
// Pour [Contre] et [Déclenchement], le joueur 1 (actif) attaque le Leader du joueur 0 avec le Personnage `attacker`.
export function drive(s0: GameState, timing: Timing, self: number, chooser: Chooser, attacker?: number): DriveResult {
  let s = structuredClone(s0);
  const me = s.players[0];
  const has = (id: string) => Boolean(s.decision?.options.some((o) => o.id === id));
  let first: string | null = null;
  switch (timing) {
    case 'onPlay': first = `play:${self}`; break;
    case 'main': first = `event:${self}`; break;
    case 'activateMain': first = `act:${self}`; break;
    case 'whenAttacking': first = `attack:${self}:${s.players[1].leader.uid}`; break;
    case 'counter':
    case 'trigger':
      if (attacker === undefined) return { state: s, ran: false, reason: 'pas d’attaquant' };
      first = `attack:${attacker}:${me.leader.uid}`;
      break;
    case 'onKO':
    case 'endOfTurn':
      s.decision = null;
      s.pending.push({ kind: timing, source: self, num: numOf(s, self), controller: 0, answers: [] });
      s = advance(s);
      break;
    default:
      return { state: s, ran: false, reason: `moment ${timing} non déclenché par le banc` };
  }
  if (first) {
    if (!has(first)) return { state: s, ran: false, reason: `injouable (${first} absent des choix)` };
    s = act(s, first);
  }
  let countered = false;
  let triggered = timing !== 'trigger';
  for (let guard = 0; guard < 400 && s.decision; guard++) {
    const d = s.decision;
    if (d.inEffect) {
      if (d.tag === 'trigger' && timing === 'trigger' && d.options.some((o) => o.id === 'trigger')) {
        // la carte de Vie révélée est-elle celle qu'on essaie ?
        const shown = d.options.find((o) => o.id === 'trigger')?.num;
        if (shown === numOf(s0, self)) triggered = true;
        s = act(s, shown === numOf(s0, self) ? 'trigger' : 'hand');
        continue;
      }
      s = act(s, chooser(s, d));
      continue;
    }
    // décisions hors de l'effet, pendant l'attaque adverse ([Contre], [Déclenchement])
    if ((timing === 'counter' || timing === 'trigger') && d.player === 0) {
      if (d.kind === 'blocker' && has('noblock')) { s = act(s, 'noblock'); continue; }
      if (d.kind === 'counter' && timing === 'counter' && !countered) {
        if (!has(`cevent:${self}`)) return { state: s, ran: false, reason: 'injouable ([Contre] absent des choix)' };
        countered = true;
        s = act(s, `cevent:${self}`);
        continue;
      }
      if (d.kind === 'counter' && timing === 'trigger' && has('pass')) { s = act(s, 'pass'); continue; }
    }
    break;
  }
  if (timing === 'counter' && !countered) return { state: s, ran: false, reason: 'pas de pas de Contre' };
  if (!triggered) return { state: s, ran: false, reason: 'pas de [Déclenchement]' };
  return { state: s, ran: true };
}

function numOf(s: GameState, uid: number): string {
  for (const P of s.players) {
    for (const c of [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.trash, ...P.life, ...P.deck]) if (c.uid === uid) return c.num;
  }
  return HIDDEN;
}

// Contrôles de cohérence après un essai (hors question au milieu d'un effet)
export function coherenceErrors(s: GameState): string[] {
  return s.decision?.inEffect ? [] : invariantErrors(s);
}

// Réponse « la plus forte » : accepter (« yes »), prendre la première carte proposée ; mode `none` : refuser les cibles
// « jusqu'à » (« none ») ; `refuse` : ne pas payer le coût / ne pas faire l'effet facultatif ; `branch` : effet choisi
// dans « choisissez un » ; le joueur 1 (questions posées à l'adversaire pendant l'effet) prend le premier choix.
export function maxChooser(mode: { branch?: number; none?: boolean; refuse?: boolean } = {}): Chooser {
  return (_s, d) => {
    const ids = d.options.map((o) => o.id);
    if (d.player !== 0) return ids[0];
    if (d.tag === 'chooseOne') return ids.includes(`choice:${mode.branch ?? 0}`) ? `choice:${mode.branch ?? 0}` : ids[0];
    if (ids.includes('yes') && ids.includes('no')) return mode.refuse ? 'no' : 'yes';
    if (ids.includes('keep')) return 'keep';
    if (mode.none && ids.includes('none')) return 'none';
    return ids.find((id) => id.startsWith('card:')) ?? ids.find((id) => id !== 'none' && id !== 'no') ?? ids[0];
  };
}
