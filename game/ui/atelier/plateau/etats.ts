// États fixés du plateau pour l'atelier (#play/atelier/plateau-<état>) : de vraies parties du moteur, construites comme
// dans les tests (scenario() de game/tests/helpers.ts, sans node:assert pour tourner dans le navigateur), puis avancées
// par des choix écrits ici. Ni IA, ni serveur, ni hasard : le même état à chaque ouverture.
import '../../../engine/cards/index.ts';  // les cartes avant le moteur (voir game/engine/cards/index.ts)
import type { Analysis } from '../../../ai/search.ts';
import { toReview, type Move, type MoveReview } from '../../../coach/review.ts';
import { act, advance, newGame } from '../../../engine/engine.ts';
import type { Card, FieldCard, GameState, Modifier, Option, PlayerId } from '../../../engine/types.ts';

// Toi : Luffy (rouge, ST-31) ; l'IA : Mihawk (vert, méta d'octobre 2026). Deux couleurs, des Bloqueurs, des
// [Déclenchement], un Lieu de chaque côté.
export const MY_DECK = 'ST-31';
export const AI_DECK = 'META-MIHAWK-2026-10';
const ME: PlayerId = 0;
const AI: PlayerId = 1;

// Ce que la page de l'atelier montre : l'état, et ce qui n'est pas dans l'état (attaque en préparation, récap)
export interface BoardState {
  state: GameState;
  aim?: { attacker: number; target: number };  // attaque choisie, cible visée : le résultat prévu s'affiche
  moves?: Move[];                               // décisions passées et leur analyse par le coach (récap de fin)
  reviews?: MoveReview[];
}

function fail(message: string): never {
  throw new Error(message);
}

// ---------- Construction d'une situation (comme game/tests/helpers.ts) ----------

// Les cartes ajoutées sont prises dans les cartes du joueur, pour garder une partie cohérente
function take(s: GameState, p: PlayerId, num: string): Card {
  const P = s.players[p];
  for (const zone of [P.deck, P.hand, P.life, P.trash]) {
    const i = zone.findIndex((c) => c.num === num);
    if (i >= 0) return zone.splice(i, 1)[0];
  }
  return fail(`${num} introuvable dans les cartes du joueur ${p}`);
}

function takeField(s: GameState, p: PlayerId, num: string, extra: Partial<FieldCard> = {}): FieldCard {
  const c = take(s, p, num);
  return { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra };
}

function setHand(s: GameState, p: PlayerId, nums: string[]) {
  const P = s.players[p];
  const cards = nums.map((n) => take(s, p, n));
  P.deck.push(...P.hand);
  P.hand = cards;
}

function setChars(s: GameState, p: PlayerId, chars: [string, Partial<FieldCard>?][]): FieldCard[] {
  const P = s.players[p];
  const list = chars.map(([num, extra]) => takeField(s, p, num, extra));
  P.deck.push(...P.chars.map((c) => ({ uid: c.uid, num: c.num })));
  P.donRested += P.chars.reduce((sum, c) => sum + c.don, 0);
  P.chars = list;
  return list;
}

// Vie : les cartes données sont au-dessus, les autres gardées (count : nombre de cartes en tout)
function setLife(s: GameState, p: PlayerId, count: number, top: string[] = []) {
  const P = s.players[p];
  const known = top.map((n) => take(s, p, n));
  const rest = P.life.splice(0);
  P.life = [...known, ...rest].slice(0, count);
  P.deck.push(...[...known, ...rest].slice(count));
}

function setTrash(s: GameState, p: PlayerId, nums: string[]) {
  s.players[p].trash.push(...nums.map((n) => take(s, p, n)));
}

// DON!! : actives, épuisées, le reste dans le deck DON!!
function setDon(s: GameState, p: PlayerId, active: number, rested = 0) {
  const P = s.players[p];
  const attached = [P.leader, ...P.chars].reduce((sum, c) => sum + c.don, 0);
  P.donActive = active;
  P.donRested = rested;
  P.donDeck = 10 - active - rested - attached;
  if (P.donDeck < 0) fail('trop de DON!!');
}

const power = (uid: number, amount: number, source: string): Modifier => ({ uid, stat: 'power', amount, until: 'turn', source });

// Partie après les mains de départ, au tour `turn`, en phase principale du joueur `active` ; setup place les cartes
function scenario(turn: number, active: PlayerId, setup: (s: GameState) => void): GameState {
  const s = act(act(newGame({ decks: [MY_DECK, AI_DECK], names: ['Toi', 'IA'], seed: 13, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = Math.ceil(turn / 2);
  s.players[1].turns = Math.floor(turn / 2);
  s.turn = turn;
  s.active = active;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

// Choix de la décision en cours : par identifiant exact ou préfixe (« attack:12 »), ou par une fonction
function pick(s: GameState, choice: string | ((o: Option) => boolean)): GameState {
  const d = s.decision ?? fail('aucune décision en cours');
  const o = d.options.find((x) => (typeof choice === 'function' ? choice(x) : x.id === choice || x.id.startsWith(`${choice}:`)));
  if (!o) fail(`choix introuvable (${String(choice)}) parmi : ${d.options.map((x) => x.id).join(', ')} (${d.prompt})`);
  return act(s, o.id);
}

// Répond « non » à toutes les questions d'un joueur (pas de Bloqueur, pas de Contre...) jusqu'à celles de l'autre
function passAll(s: GameState, p: PlayerId): GameState {
  for (let i = 0; i < 20 && s.decision?.player === p && s.winner === null; i++) {
    s = pick(s, (o) => ['noblock', 'pass', 'none', 'no', 'skip'].includes(o.id));
  }
  return s;
}

const playCard = (s: GameState, num: string) => pick(s, (o) => (o.id.startsWith('play:') || o.id.startsWith('event:')) && s.players[s.decision!.player].hand.some((c) => c.uid === o.uid && c.num === num));

// ---------- Les situations ----------

// Plateau du milieu de partie, commun à plusieurs états : 3 Personnages par camp, un Lieu de l'IA
function midGame(s: GameState) {
  setHand(s, ME, ['OP04-016', 'OP11-003', 'P-101', 'OP13-021', 'OP11-012']);
  setChars(s, ME, [['ST31-002'], ['OP11-009', { don: 1 }], ['ST23-004', { rested: true }]]);
  setLife(s, ME, 3);
  setDon(s, ME, 4, 2);
  setHand(s, AI, ['OP06-038', 'OP12-023', 'OP17-031', 'ST32-001']);
  setChars(s, AI, [['ST32-002'], ['OP12-034', { rested: true }], ['OP17-031']]);
  s.players[AI].stage = takeField(s, AI, 'OP14-039');
  setLife(s, AI, 3);
  setDon(s, AI, 0, 6);
}

const builders: Record<string, () => BoardState> = {
  // Début de partie : garder sa main ou en repiocher une
  mulligan: () => ({ state: newGame({ decks: [MY_DECK, AI_DECK], names: ['Toi', 'IA'], seed: 7, first: 0 }) }),

  // Tour 1 : 5 cartes en main, 1 DON!!, rien sur le terrain
  'tour-1': () => {
    const s = act(act(newGame({ decks: [MY_DECK, AI_DECK], names: ['Toi', 'IA'], seed: 7, first: 0 }), 'keep'), 'keep');
    if (s.decision?.player !== ME || s.decision.kind !== 'main') fail('tour 1 : on attendait ta phase principale');
    return { state: s };
  },

  // Plateau chargé : 5 Personnages par camp, un Lieu chacun, DON!! données, bonus et malus, cartes épuisées
  charge: () => ({
    state: scenario(9, ME, (s) => {
      setHand(s, ME, ['OP04-016', 'OP13-021', 'OP11-003', 'P-101', 'ST31-001', 'OP14-015']);
      const mine = setChars(s, ME, [
        ['ST31-002', { don: 2 }], ['OP11-009', { don: 1 }], ['OP11-012', { rested: true }], ['ST23-004'], ['ST31-003', { rested: true, don: 1 }],
      ]);
      s.players[ME].stage = takeField(s, ME, 'ST31-005');
      s.players[ME].leader.don = 2;
      setLife(s, ME, 2);
      setTrash(s, ME, ['OP01-016', 'OP13-021', 'OP04-016']);
      setDon(s, ME, 3, 1);
      const theirs = setChars(s, AI, [
        ['OP17-022', { don: 1 }], ['ST32-002', { rested: true }], ['OP12-023'], ['OP12-034', { rested: true }], ['ST32-001'],
      ]);
      s.players[AI].stage = takeField(s, AI, 'OP14-039', { rested: true });
      setLife(s, AI, 4);
      setTrash(s, AI, ['OP06-038', 'OP01-055']);
      setDon(s, AI, 0, 7);
      s.mods.push(power(mine[0].uid, 2000, 'OP04-016'), power(mine[3].uid, 1000, 'ST21-001'), power(theirs[2].uid, -2000, 'OP11-009'), power(theirs[0].uid, -1000, 'OP13-021'));
    }),
  }),

  // Ton Leader attaque : la cible est visée, le résultat prévu s'affiche
  attaque: () => {
    const s = scenario(5, ME, (s) => {
      midGame(s);
      s.players[ME].leader.don = 1;
      setDon(s, ME, 3, 2);
    });
    const leader = s.players[ME].leader.uid;
    const target = s.players[AI].chars[1].uid;  // Perona, épuisée
    return { state: s, aim: { attacker: leader, target } };
  },

  // Réponse défensive : un Personnage de l'IA attaque ton Leader ; tu peux bloquer avec Jinbe
  bloqueur: () => {
    let s = scenario(6, AI, midGame);
    s = pick(s, `attack:${s.players[AI].chars[0].uid}:${s.players[ME].leader.uid}`);
    if (s.decision?.player !== ME || s.decision.kind !== 'blocker') fail(`bloqueur : décision inattendue ${s.decision?.kind}`);
    return { state: s };
  },

  // Réponse défensive, après le Bloqueur : jouer des Contres depuis la main
  contre: () => {
    let s = scenario(6, AI, midGame);
    s = pick(s, `attack:${s.players[AI].chars[0].uid}:${s.players[ME].leader.uid}`);
    s = pick(s, 'noblock');
    if (s.decision?.player !== ME || s.decision.kind !== 'counter') fail(`contre : décision inattendue ${s.decision?.kind}`);
    return { state: s };
  },

  // Déclenchement : la carte de Vie retournée par l'attaque a un [Déclenchement]
  declenchement: () => {
    let s = scenario(6, AI, (s) => {
      midGame(s);
      setLife(s, ME, 3, ['OP13-021']);
    });
    s = pick(s, `attack:${s.players[AI].chars[0].uid}:${s.players[ME].leader.uid}`);
    s = pick(pick(s, 'noblock'), 'pass');
    if (s.decision?.player !== ME || s.decision.tag !== 'trigger') fail(`déclenchement : question inattendue ${s.decision?.tag}`);
    return { state: s };
  },

  // Choix d'une carte parmi les 5 du dessus du deck (Nami : [Jouée])
  recherche: () => {
    let s = scenario(5, ME, (s) => {
      midGame(s);
      setHand(s, ME, ['OP01-016', 'OP04-016', 'OP11-003', 'OP13-021']);
      const top = ['ST31-001', 'OP11-012', 'OP04-016', 'OP14-015', 'P-101'].map((n) => take(s, ME, n));
      s.players[ME].deck.unshift(...top);
    });
    s = playCard(s, 'OP01-016');
    if (s.decision?.player !== ME || !s.decision.cards?.length) fail(`recherche : question inattendue ${s.decision?.tag}`);
    return { state: s };
  },

  // Contre suffisant : l'attaque est déjà repoussée, les cartes de Contre ne sont plus entourées, « Ne plus contrer »
  'contre-repousse': () => {
    let s = scenario(6, AI, midGame);
    s = pick(s, `attack:${s.players[AI].chars[0].uid}:${s.players[ME].leader.uid}`);
    s = pick(s, 'noblock');
    // les cartes de Contre de la main, une à une, jusqu'à repousser l'attaque
    for (let i = 0; i < 5 && s.decision?.kind === 'counter' && !s.decision.prompt.includes('déjà repoussée'); i++) s = pick(s, 'counter');
    if (s.decision?.player !== ME || s.decision.kind !== 'counter' || !s.decision.prompt.includes('déjà repoussée')) fail(`contre repoussé : question inattendue ${s.decision?.prompt}`);
    return { state: s };
  },

  // Coût à déclarer : Streusen (OP11-074, prêté pour l'occasion) utilise son effet
  cout: () => {
    let s = scenario(5, ME, (s) => {
      midGame(s);
      const c = take(s, ME, 'OP14-015');
      s.players[ME].chars.push({ uid: c.uid, num: 'OP11-074', rested: false, don: 0, playedTurn: 0, usedOpt: [] });
    });
    const streusen = s.players[ME].chars.find((c) => c.num === 'OP11-074')!.uid;
    s = pick(s, `act:${streusen}`);
    if (s.decision?.player !== ME || s.decision.tag !== 'declareCost') fail(`coût : question inattendue ${s.decision?.tag}`);
    return { state: s };
  },

  // Fins de partie, avec le récap du coach
  victoire: () => ending(true),
  defaite: () => ending(false),

  // DON!! : aucune, 5 et 10 (zone de Coût, données, épuisées)
  'don-0': () => ({
    state: scenario(5, ME, (s) => {
      midGame(s);
      s.players[ME].chars.forEach((c) => { c.don = 0; });
      setDon(s, ME, 0, 0);
      s.players[ME].donDeck = 10;
    }),
  }),
  'don-5': () => ({
    state: scenario(5, ME, (s) => {
      midGame(s);
      s.players[ME].chars.forEach((c) => { c.don = 0; });
      s.players[ME].leader.don = 1;
      setDon(s, ME, 3, 1);
      s.players[ME].donDeck = 5;
    }),
  }),
  'don-10': () => ({
    state: scenario(11, ME, (s) => {
      midGame(s);
      s.players[ME].chars.forEach((c) => { c.don = 0; });
      s.players[ME].leader.don = 2;
      s.players[ME].chars[1].don = 1;
      setDon(s, ME, 5, 2);
      s.players[AI].chars[0].don = 2;
      setDon(s, AI, 3, 5);
    }),
  }),
};

// Fin de partie : quelques décisions jouées (et leur analyse inventée, comme la ferait le coach), puis le coup final
function ending(won: boolean): BoardState {
  const moves: Move[] = [];
  const reviews: MoveReview[] = [];
  let next = 1;
  // Joue une décision du joueur et note son analyse : taux de victoire par choix (le premier est le meilleur)
  const mine = (s: GameState, choice: string, rates: [string, number][]) => {
    const m: Move = { id: next++, state: s, choice };
    const d = s.decision!;
    const stats = rates.map(([id, rate]) => ({ id, label: d.options.find((o) => o.id === id)?.label ?? id, wins: Math.round(rate * 32), n: 32, rate }));
    const analysis: Analysis = { player: ME, stats, best: stats[0].id, heuristic: stats[0].id, samples: 32, ms: 0, pruned: [] };
    moves.push(m);
    reviews.push(toReview(m, analysis));
    return act(s, choice);
  };
  const option = (s: GameState, f: (o: Option) => boolean) => (s.decision?.options.find(f) ?? fail('choix introuvable')).id;

  if (won) {
    let s = scenario(7, ME, (s) => {
      midGame(s);
      setLife(s, AI, 0);
      s.players[ME].leader.don = 0;
      setDon(s, ME, 5, 0);
    });
    // une DON!! au Leader (bon choix), un Personnage joué (erreur : il fallait attaquer d'abord), puis l'attaque finale
    const leader = s.players[ME].leader.uid;
    s = mine(s, `don:${leader}`, [[`don:${leader}`, 0.92], ['end', 0.55]]);
    const chopper = option(s, (o) => o.id.startsWith('play:') && s.players[ME].hand.some((c) => c.uid === o.uid && c.num === 'P-101'));
    s = mine(s, chopper, [[`attack:${leader}:${s.players[AI].leader.uid}`, 0.95], [chopper, 0.8], ['end', 0.4]]);
    s = mine(s, `attack:${leader}:${s.players[AI].leader.uid}`, [[`attack:${leader}:${s.players[AI].leader.uid}`, 0.97], ['end', 0.6]]);
    s = passAll(s, AI);
    for (let i = 0; i < 10 && s.winner === null && s.decision; i++) s = passAll(passAll(s, AI), ME);
    if (s.winner !== ME) fail('victoire : la partie n’est pas gagnée');
    return { state: s, moves, reviews };
  }

  let s = scenario(8, AI, (s) => {
    midGame(s);
    setLife(s, ME, 0);
  });
  s = pick(s, `attack:${s.players[AI].chars[0].uid}:${s.players[ME].leader.uid}`);
  // pas de Bloqueur (erreur : Jinbe pouvait bloquer), pas de Contre
  const block = option(s, (o) => o.id.startsWith('block:'));
  s = mine(s, 'noblock', [[block, 0.48], ['noblock', 0.02]]);
  if (s.decision?.player === ME && s.decision.kind === 'counter') s = mine(s, 'pass', [['pass', 0.02]]);
  for (let i = 0; i < 10 && s.winner === null && s.decision; i++) s = passAll(passAll(s, ME), AI);
  if (s.winner !== AI) fail('défaite : la partie n’est pas perdue');
  return { state: s, moves, reviews };
}

export const BOARD_STATES = Object.keys(builders);

// Construit l'état demandé (une erreur explique ce qui n'a pas marché : la page de l'atelier l'affiche)
export function boardState(name: string): BoardState {
  const build = builders[name] ?? fail(`état inconnu : ${name}`);
  return build();
}
