// Outils communs aux tests de cartes : situations construites à la main et réponses aux décisions
import assert from 'node:assert/strict';
import { act, advance, newGame } from '../engine/engine.ts';
import { invariantErrors } from '../engine/invariants.ts';
import type { Card, FieldCard, GameState, Option, PlayerId } from '../engine/types.ts';

let uid = 20000;
export const card = (num: string): Card => ({ uid: uid++, num });
export const field = (num: string, extra: Partial<FieldCard> = {}): FieldCard => ({ uid: uid++, num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra });

// Partie après les mains de départ, tour 5 en phase principale du joueur `active` (0 par défaut), les deux joueurs
// ayant déjà joué. setup modifie la situation (les cartes ajoutées remplacent celles du deck : voir swap), puis la
// partie avance jusqu'à la décision suivante.
export function scenario(decks: [string, string], setup: (s: GameState) => void, active: PlayerId = 0): GameState {
  const s = act(act(newGame({ decks, names: ['Moi', 'IA'], seed: 13, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 3;
  s.turn = 5;
  s.active = active;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

// Option de la décision en cours : par identifiant exact, préfixe (« attack:12 »), texte du libellé ou fonction
export function option(s: GameState, pick: string | RegExp | ((o: Option) => boolean)): string {
  const d = s.decision;
  assert.ok(d, 'aucune décision en cours');
  const o = d.options.find((x) => (typeof pick === 'function' ? pick(x) : pick instanceof RegExp ? pick.test(x.label) || pick.test(x.id) : x.id === pick || x.id.startsWith(`${pick}:`)));
  assert.ok(o, `choix introuvable (${String(pick)}) parmi : ${d.options.map((x) => `${x.id} « ${x.label} »`).join(', ')} — question : ${d.prompt}`);
  return o.id;
}

export const choose = (s: GameState, pick: string | RegExp | ((o: Option) => boolean)) => act(s, option(s, pick));
export const hasOption = (s: GameState, id: string) => Boolean(s.decision?.options.some((o) => o.id === id || o.id.startsWith(`${id}:`)));
export const tag = (s: GameState) => s.decision?.tag;

export function expectTag(s: GameState, expected: string) {
  assert.equal(s.decision?.tag, expected, `question attendue : ${expected}, obtenue : ${s.decision?.tag ?? s.decision?.kind} (${s.decision?.prompt})`);
}

// uid d'une carte de la main d'un joueur
export function inHand(s: GameState, p: PlayerId, num: string): number {
  const c = s.players[p].hand.find((x) => x.uid !== undefined && x.num === num);
  assert.ok(c, `${num} absente de la main du joueur ${p}`);
  return c.uid;
}

// Joue un exemplaire de la carte (le moteur choisit lequel : celui que l'adversaire connaît d'abord, voir knownFirst)
export const play = (s: GameState, num: string, p: PlayerId = 0) => {
  inHand(s, p, num);
  return act(s, option(s, (o) => (o.id.startsWith('play:') || o.id.startsWith('event:')) && s.players[p].hand.some((c) => c.uid === o.uid && c.num === num)));
};
export const attack = (s: GameState, attacker: number, target: number) => act(s, `attack:${attacker}:${target}`);
export const logHas = (s: GameState, text: string | RegExp) => s.log.some((l) => (typeof text === 'string' ? l.text.includes(text) : text.test(l.text)));
export const onField = (s: GameState, p: PlayerId, u: number) => s.players[p].chars.some((c) => c.uid === u);

// Vérifie que la partie est restée cohérente (hors décisions au milieu d'un effet)
export function coherent(s: GameState) {
  if (s.decision?.inEffect) return;
  assert.deepEqual(invariantErrors(s), []);
}

// Les cartes ajoutées à la main ou au terrain par un test sont prises dans le deck, pour garder une partie cohérente
export function take(s: GameState, p: PlayerId, num: string): Card {
  const P = s.players[p];
  for (const zone of [P.deck, P.hand, P.life, P.trash]) {
    const i = zone.findIndex((c) => c.num === num);
    if (i >= 0) return zone.splice(i, 1)[0];
  }
  assert.fail(`${num} introuvable dans les cartes du joueur ${p}`);
}

export const takeField = (s: GameState, p: PlayerId, num: string, extra: Partial<FieldCard> = {}): FieldCard => {
  const c = take(s, p, num);
  return { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra };
};

// Remplace la main d'un joueur : les anciennes cartes retournent au-dessous du deck
export function setHand(s: GameState, p: PlayerId, nums: string[]): Card[] {
  const P = s.players[p];
  const cards = nums.map((n) => take(s, p, n));
  P.deck.push(...P.hand);
  P.hand = cards;
  return cards;
}

// Place des cartes connues au-dessus du deck d'un joueur
export function setDeckTop(s: GameState, p: PlayerId, nums: string[]): Card[] {
  const cards = nums.map((n) => take(s, p, n));
  s.players[p].deck.unshift(...cards);
  return cards;
}

// Remplace les Personnages d'un joueur (les anciens retournent au-dessous du deck)
export function setChars(s: GameState, p: PlayerId, chars: { num: string; extra?: Partial<FieldCard> }[]): FieldCard[] {
  const P = s.players[p];
  const list = chars.map((c) => takeField(s, p, c.num, c.extra));
  P.deck.push(...P.chars.map((c) => ({ uid: c.uid, num: c.num })));
  P.donRested += P.chars.reduce((sum, c) => sum + c.don, 0);
  P.chars = list;
  return list;
}

// Vie connue (les anciennes cartes de Vie retournent au-dessous du deck)
export function setLife(s: GameState, p: PlayerId, nums: string[]): Card[] {
  const P = s.players[p];
  const cards = nums.map((n) => take(s, p, n));
  P.deck.push(...P.life.map((c) => ({ uid: c.uid, num: c.num })));
  P.life = cards;
  return cards;
}

// DON!! : actives, épuisées, le reste dans le deck DON!!
export function setDon(s: GameState, p: PlayerId, active: number, rested = 0) {
  const P = s.players[p];
  const attached = [P.leader, ...P.chars].reduce((sum, c) => sum + c.don, 0);
  P.donActive = active;
  P.donRested = rested;
  P.donDeck = 10 - active - rested - attached;
  assert.ok(P.donDeck >= 0, 'trop de DON!!');
}
