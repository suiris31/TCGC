// Archive des parties : tout ce qu'il faut pour revoir une partie coup par coup et suivre ta progression.
// Une partie se rejoue exactement à partir de l'état de départ (decks déjà mélangés) et de chaque choix des deux
// joueurs, le moteur étant déterministe. Pour chacune de tes décisions, on garde aussi la situation (Vies, main,
// terrain, combat en cours), ton temps de réflexion, le conseil du coach s'il était affiché et l'analyse du coach.
import { act } from '../engine/engine.ts';
import { def, findField, power } from '../engine/rules.ts';
import type { DecisionKind, GameState, HistoryEntry, LogEntry, PlayerId } from '../engine/types.ts';
import { gameStats, type GameStats, type Move, type MoveReview } from './review.ts';

export const ARCHIVE_FORMAT = 1;

// Ce que tu voyais au moment de décider (toi d'abord, l'adversaire ensuite)
export interface Situation {
  life: [number, number];
  hand: [number, number];
  deck: [number, number];
  don: [number, number];         // DON!! utilisables (redressées)
  donTotal: [number, number];    // DON!! en jeu (redressées, épuisées et données)
  field: [string[], string[]];   // Leader puis Personnages : « Nom puissance », épuisé, DON!! données
  myHand: string[];
  battle?: string;               // combat en cours : « Attaquant 6000 → Cible 5000 »
}

export interface HumanDecision {
  step: number;        // position dans steps
  move: number;        // identifiant de la décision (lien avec reviews)
  turn: number;
  kind: DecisionKind;
  tag?: string;
  choice: string;
  card?: string;       // carte concernée par ton choix
  bestCard?: string;   // carte concernée par le choix conseillé par le coach, s'il est différent
  ms?: number;         // temps de réflexion
  hint?: string;       // choix conseillé par le coach à ce moment, si le conseil était affiché
  sit: Situation;
}

export type GameStatus = 'playing' | 'won' | 'lost' | 'abandoned';

export interface GameConfig {
  myDeck: string;
  aiDeck: string;
  level: number;
  first: 'random' | 'me' | 'ai';
}

export interface GameRecord {
  format: number;
  id: string;
  engine: string;                 // version du programme (commit git)
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  status: GameStatus;
  winReason?: string;
  turns: number;
  config: GameConfig;
  human: PlayerId;
  wentFirst: boolean;
  practice?: { from: string | null; turn: number };  // partie reprise depuis un moment revu
  initial: GameState;
  steps: HistoryEntry[];          // chaque décision des deux joueurs, dans l'ordre
  decisions: HumanDecision[];
  reviews: MoveReview[];
  undos: { turn: number; undone: number }[];  // retours en arrière (Ctrl+Z) et nombre de coups annulés
  stats: GameStats;
  log: LogEntry[];
  mode?: 'solo' | 'online';       // partie en ligne contre un autre joueur (absent : contre l'IA)
  opponent?: string;              // partie en ligne : pseudo de l'adversaire
}

// Version légère, sans l'état de départ, les coups ni le journal (liste des parties)
export type GameSummary = Omit<GameRecord, 'initial' | 'steps' | 'log'>;

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// Nom de fichier : date et heure, decks, entraînement
export function recordId(date: Date, config: GameConfig, practice: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  return `${stamp}_${config.myDeck}-contre-${config.aiDeck}${practice ? '_entrainement' : ''}`;
}

function cardNum(s: GameState, uid: number | undefined): string | undefined {
  if (uid === undefined) return undefined;
  for (const P of s.players) {
    for (const c of [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.trash, ...P.life]) {
      if (c.uid === uid) return c.num;
    }
  }
  return undefined;
}

export function optionCard(s: GameState, id: string): string | undefined {
  const o = s.decision?.options.find((x) => x.id === id);
  return o?.num ?? cardNum(s, o?.uid);
}

export function situation(s: GameState, me: PlayerId): Situation {
  const opp = other(me);
  const P = s.players;
  const field = (p: PlayerId) => [P[p].leader, ...P[p].chars].map((c) =>
    `${def(c.num).name} ${power(s, c.uid)}${c.rested ? ' épuisé' : ''}${c.don ? ` (${c.don} DON!!)` : ''}`);
  const donInPlay = (p: PlayerId) => P[p].donActive + P[p].donRested + P[p].leader.don + P[p].chars.reduce((n, c) => n + c.don, 0) + (P[p].stage?.don ?? 0);
  const sit: Situation = {
    life: [P[me].life.length, P[opp].life.length],
    hand: [P[me].hand.length, P[opp].hand.length],
    deck: [P[me].deck.length, P[opp].deck.length],
    don: [P[me].donActive, P[opp].donActive],
    donTotal: [donInPlay(me), donInPlay(opp)],
    field: [field(me), field(opp)],
    myHand: P[me].hand.map((c) => def(c.num).name),
  };
  const a = s.battle && findField(s, s.battle.attacker);
  const t = s.battle && findField(s, s.battle.target);
  if (a && t) sit.battle = `${def(a.card.num).name} ${power(s, a.card.uid)} → ${def(t.card.num).name} ${power(s, t.card.uid)}`;
  return sit;
}

export interface RecordInput {
  id: string;
  engine: string;
  startedAt: string;
  now: string;
  endedAt?: string;
  config: GameConfig;
  human: PlayerId;
  practice?: { from: string | null; turn: number };
  initial: GameState;
  current: GameState;
  moves: Move[];                                         // tes décisions (avec l'état au moment de choisir)
  reviews: Map<number, MoveReview>;
  extra: Map<number, { ms?: number; hint?: string }>;    // temps de réflexion et conseil affiché, par décision
  undos: { turn: number; undone: number }[];
  abandoned?: boolean;
}

// Chaque appel au moteur ajoute exactement une entrée à l'historique : les coups de la partie sont l'historique de
// l'état actuel depuis l'état de départ (un retour en arrière les raccourcit tout seul)
export function buildRecord(x: RecordInput): GameRecord {
  const base = x.initial.history.length;
  const steps = x.current.history.slice(base);
  const own: Move[] = [];
  const decisions: HumanDecision[] = [];
  for (const m of x.moves) {
    const step = m.state.history.length - base;
    const h = steps[step];
    const d = m.state.decision;
    if (step < 0 || !h || !d || h.choice !== m.choice || h.player !== x.human) continue;
    const review = x.reviews.get(m.id);
    const extra = x.extra.get(m.id);
    own.push(m);
    decisions.push({
      step,
      move: m.id,
      turn: m.state.turn,
      kind: d.kind,
      tag: d.tag,
      choice: m.choice,
      card: optionCard(m.state, m.choice),
      bestCard: review && review.best !== m.choice ? optionCard(m.state, review.best) : undefined,
      ms: extra?.ms,
      hint: extra?.hint,
      sit: situation(m.state, x.human),
    });
  }
  const ids = new Set(decisions.map((d) => d.move));
  const s = x.current;
  const status: GameStatus = s.winner !== null ? (s.winner === x.human ? 'won' : 'lost') : x.abandoned ? 'abandoned' : 'playing';
  return {
    format: ARCHIVE_FORMAT,
    id: x.id,
    engine: x.engine,
    startedAt: x.startedAt,
    updatedAt: x.now,
    endedAt: status === 'playing' ? undefined : x.endedAt ?? x.now,
    status,
    winReason: s.winReason ?? undefined,
    turns: s.turn,
    config: x.config,
    human: x.human,
    wentFirst: x.initial.first === x.human,
    practice: x.practice,
    initial: x.initial,
    steps,
    decisions,
    reviews: [...x.reviews.values()].filter((r) => ids.has(r.id)).sort((a, b) => a.id - b.id),
    undos: x.undos,
    stats: gameStats(s, own, x.human),
    log: s.log,
  };
}

export interface Replayed {
  final: GameState;
  moves: Move[];   // tes décisions, avec l'état reconstitué au moment de choisir
}

// Rejoue une partie archivée. Échoue si le moteur a changé depuis (carte corrigée...) et que la partie diverge.
export function replayRecord(rec: GameRecord): Replayed {
  const wanted = new Set(rec.decisions.map((d) => d.step));
  const states = new Map<number, GameState>();
  let s = rec.initial;
  for (const [i, h] of rec.steps.entries()) {
    if (wanted.has(i)) states.set(i, s);
    if (!s.decision || s.decision.player !== h.player || !s.decision.options.some((o) => o.id === h.choice)) {
      throw new Error(`la partie ne se rejoue plus à l’identique à partir du coup ${i + 1} (le programme a changé depuis)`);
    }
    s = act(s, h.choice);
  }
  return { final: s, moves: rec.decisions.map((d) => ({ id: d.move, state: states.get(d.step)!, choice: d.choice })) };
}
