// Partie en ligne entre deux joueurs : le serveur garde l'état complet et arbitre avec le moteur ; chaque joueur ne
// reçoit que sa vue (engine/view.ts) et n'envoie que l'identifiant de son choix, avec le numéro du coup.
// Ce module ne touche ni au disque ni au réseau : le serveur (server/game-online.js) s'occupe de la base et du temps
// réel, ce qui permet de tout tester ici.
import { buildRecord, type GameRecord } from '../coach/archive.ts';
import type { Move } from '../coach/review.ts';
import { DECKS } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';

export type Seat = PlayerId;  // 0 : l'hôte (qui a créé la salle), 1 : l'invité
export type MatchStatus = 'waiting' | 'playing' | 'over' | 'cancelled' | 'expired';

export interface MatchPlayer {
  userId: number;
  name: string;
  deck: string;
}

export interface Match {
  id: string;
  code: string | null;        // code de la salle, tant qu'elle attend un adversaire
  host: MatchPlayer;
  guest: MatchPlayer | null;
  status: MatchStatus;
  engine: string;             // version du programme au lancement
  initial: GameState | null;
  state: GameState | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;   // salle en attente : fermée à cette date
  startedAt: string | null;
  endedAt: string | null;
}

// Ce que reçoit un joueur
export interface MatchView {
  id: string;
  status: MatchStatus;
  code: string | null;        // seulement pour l'hôte d'une salle en attente
  seat: Seat;
  you: { name: string; deck: string };
  opponent: { name: string; deck: string } | null;
  seq: number;                // numéro du coup attendu (à renvoyer avec le choix)
  state: GameState | null;    // vue expurgée
  expiresAt: string | null;
}

export class MatchError extends Error {
  code: string;
  status: number;
  expose = true;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Code de salle : 6 caractères sans ambiguïté à la lecture (ni 0/O, ni 1/I/L)
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const WAIT_MINUTES = 15;

export function checkDeck(deck: unknown): string {
  if (typeof deck !== 'string' || !DECKS[deck]) throw new MatchError('invalid_deck', 'Deck inconnu');
  return deck;
}

export function createMatch(id: string, code: string, host: MatchPlayer, now: Date, engine: string): Match {
  checkDeck(host.deck);
  return {
    id, code, host, guest: null, status: 'waiting', engine, initial: null, state: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
    startedAt: null, endedAt: null,
  };
}

export function seatOf(m: Match, userId: number): Seat | null {
  if (m.host.userId === userId) return 0;
  if (m.guest?.userId === userId) return 1;
  return null;
}

// L'invité rejoint la salle : la partie commence (qui joue en premier est tiré au sort par le moteur)
export function joinMatch(m: Match, guest: MatchPlayer, now: Date, seed: number) {
  checkDeck(guest.deck);
  if (m.status !== 'waiting' || (m.expiresAt && m.expiresAt < now.toISOString())) throw new MatchError('room_closed', 'Cette salle n’est plus ouverte', 410);
  if (guest.userId === m.host.userId) throw new MatchError('own_room', 'C’est ta propre salle : envoie le code à ton ami');
  m.guest = guest;
  m.code = null;
  m.expiresAt = null;
  m.status = 'playing';
  m.initial = newGame({ decks: [m.host.deck, guest.deck], names: [m.host.name, guest.name], seed, first: 'random' });
  m.state = m.initial;
  m.startedAt = m.updatedAt = now.toISOString();
}

// Un choix d'un joueur : refusé s'il ne lui revient pas, s'il arrive en retard (numéro du coup) ou s'il n'existe pas
export function play(m: Match, seat: Seat, seq: number, choice: string, now: Date) {
  const s = m.state;
  if (m.status !== 'playing' || !s) throw new MatchError('not_playing', 'La partie n’est pas en cours', 409);
  if (seq !== s.history.length) throw new MatchError('stale', 'Ce coup a déjà été joué', 409);
  if (!s.decision || s.decision.player !== seat) throw new MatchError('not_your_turn', 'Ce n’est pas à toi de choisir', 409);
  if (typeof choice !== 'string' || !s.decision.options.some((o) => o.id === choice)) throw new MatchError('invalid_choice', 'Choix impossible');
  m.state = act(s, choice);
  m.updatedAt = now.toISOString();
  if (m.state.winner !== null) {
    m.status = 'over';
    m.endedAt = m.updatedAt;
  }
}

export function resign(m: Match, seat: Seat, now: Date) {
  if (m.status !== 'playing' || !m.state) throw new MatchError('not_playing', 'La partie n’est pas en cours', 409);
  const s = structuredClone(m.state);
  const name = s.players[seat].name;
  s.winner = seat === 0 ? 1 : 0;
  s.winReason = `${name} abandonne la partie`;
  s.log.push({ turn: s.turn, player: null, text: s.winReason });
  s.decision = null;
  s.battle = null;
  s.pending = [];
  s.flow = { stage: 'over' };
  m.state = s;
  m.status = 'over';
  m.updatedAt = m.endedAt = now.toISOString();
}

export function viewOf(m: Match, seat: Seat): MatchView {
  const me = seat === 0 ? m.host : m.guest!;
  const opp = seat === 0 ? m.guest : m.host;
  return {
    id: m.id,
    status: m.status,
    code: seat === 0 && m.status === 'waiting' ? m.code : null,
    seat,
    you: { name: me.name, deck: me.deck },
    opponent: opp ? { name: opp.name, deck: opp.deck } : null,
    seq: m.state?.history.length ?? 0,
    state: m.state ? viewFor(m.state, seat) : null,
    expiresAt: m.expiresAt,
  };
}

// La partie terminée, telle qu'elle est rangée dans « Mes parties » de chaque joueur (sans analyse du coach : il
// était désactivé pendant la partie). Les décisions du joueur sont retrouvées en rejouant les coups.
export function recordFor(m: Match, seat: Seat, now: Date): GameRecord & { mode: 'online'; opponent: string } {
  if (!m.initial || !m.state || !m.guest || !m.startedAt) throw new MatchError('not_started', 'La partie n’a pas commencé', 409);
  const moves: Move[] = [];
  let s = m.initial;
  for (const h of m.state.history) {
    if (!s.decision) break;
    if (h.player === seat) moves.push({ id: moves.length + 1, state: s, choice: h.choice });
    s = act(s, h.choice);
  }
  const me = seat === 0 ? m.host : m.guest;
  const opp = seat === 0 ? m.guest : m.host;
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date(m.startedAt);
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const rec = buildRecord({
    id: `${stamp}_${me.deck}-contre-${opp.deck}_en-ligne`,
    engine: m.engine,
    startedAt: m.startedAt,
    now: now.toISOString(),
    endedAt: m.endedAt ?? undefined,
    config: { myDeck: me.deck, aiDeck: opp.deck, level: 0, first: 'random' },
    human: seat,
    initial: m.initial,
    current: m.state,
    moves,
    reviews: new Map(),
    extra: new Map(),
    undos: [],
    abandoned: m.status !== 'over',
  });
  return { ...rec, mode: 'online', opponent: opp.name };
}
