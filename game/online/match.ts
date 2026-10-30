// Partie en ligne entre deux joueurs : le serveur garde l'état complet et arbitre avec le moteur ; chaque joueur ne
// reçoit que sa vue (engine/view.ts) et n'envoie que l'identifiant de son choix, avec le numéro du coup.
// Ce module ne touche ni au disque ni au réseau : le serveur (server/game-online.js) s'occupe de la base et du temps
// réel, ce qui permet de tout tester ici.
import { buildRecord, type GameRecord } from '../coach/archive.ts';
import { shownNumbers, visibleLooks, type DeckLooks } from '../data/looks.ts';
import type { Move } from '../coach/review.ts';
import { playableErrors } from '../engine/deckRules.ts';
import { DECKS, isAdventureOnly, isCustomDeck, type DeckList } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';

export type Seat = PlayerId;  // 0 : l'hôte (qui a créé la salle), 1 : l'invité
export type MatchStatus = 'waiting' | 'playing' | 'over' | 'cancelled' | 'expired';

export interface MatchPlayer {
  userId: number;
  name: string;
  deck: string;      // identifiant : deck du registre, ou PERSO-... (deck personnalisé du joueur)
  list?: DeckList;   // deck personnalisé : sa liste, lue dans la base par le serveur ; jamais envoyée à l'adversaire
  hold?: boolean;    // deck d'aventure (cartes de la Cale) : le serveur a vérifié que le joueur en possède toutes les cartes
  looks?: DeckLooks; // visuels choisis du deck personnalisé (cosmétique : jamais dans le moteur)
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
  you: { name: string; deck: string; deckName: string; hold?: true };   // hold : deck d'aventure (absent sinon)
  opponent: { name: string; deck: string; deckName: string; hold?: true } | null;
  seq: number;                // numéro du coup attendu (à renvoyer avec le choix)
  state: GameState | null;    // vue expurgée
  expiresAt: string | null;
  // visuels de chaque joueur (absent : visuels de base et DON!! standard) ; ceux de l'adversaire seulement pour les
  // cartes que la vue montre déjà, sa liste restant secrète
  looks?: { [seat in Seat]?: DeckLooks };
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

export function checkDeck(deck: unknown, list?: DeckList): string {
  // les adversaires de l'aventure ne se jouent pas en ligne
  if (typeof deck === 'string' && DECKS[deck] && !isAdventureOnly(deck)) return deck;
  if (typeof deck === 'string' && isCustomDeck(deck) && list?.id === deck) {
    if (playableErrors(list.leader, list.cards).length) throw new MatchError('invalid_deck', 'Ce deck n’est pas jouable : ouvre-le dans l’éditeur pour voir pourquoi');
    return deck;
  }
  throw new MatchError('invalid_deck', 'Deck inconnu');
}

const deckName = (p: MatchPlayer) => p.list?.name ?? DECKS[p.deck]?.name ?? p.deck;
const holdDeck = (p: MatchPlayer | null | undefined) => p?.hold === true;
const holdMark = (p: MatchPlayer) => (holdDeck(p) ? { hold: true as const } : {});

// Partie « entre decks d'aventure » : les deux joueurs jouent un deck d'aventure (préparation du classé de l'étape 3)
export const holdMatch = (m: Match) => holdDeck(m.host) && holdDeck(m.guest);

export function createMatch(id: string, code: string, host: MatchPlayer, now: Date, engine: string): Match {
  checkDeck(host.deck, host.list);
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
  checkDeck(guest.deck, guest.list);
  if (m.status !== 'waiting' || (m.expiresAt && m.expiresAt < now.toISOString())) throw new MatchError('room_closed', 'Cette salle n’est plus ouverte', 410);
  if (guest.userId === m.host.userId) throw new MatchError('own_room', 'C’est ta propre salle : envoie le code à ton ami');
  m.guest = guest;
  m.code = null;
  m.expiresAt = null;
  m.status = 'playing';
  m.initial = newGame({ decks: [m.host.list ?? m.host.deck, guest.list ?? guest.deck], names: [m.host.name, guest.name], seed, first: 'random' });
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

// Visuels envoyés à un joueur : les siens en entier, ceux de l'adversaire réduits aux cartes de sa vue
function looksFor(seat: Seat, me: MatchPlayer, opp: MatchPlayer | null, state: GameState | null): MatchView['looks'] {
  const theirs = opp?.looks && visibleLooks(opp.looks, shownNumbers(state));
  const looks: NonNullable<MatchView['looks']> = {};
  if (me.looks && Object.keys(me.looks).length) looks[seat] = me.looks;
  if (theirs && Object.keys(theirs).length) looks[seat === 0 ? 1 : 0] = theirs;
  return Object.keys(looks).length ? looks : undefined;
}

export function viewOf(m: Match, seat: Seat): MatchView {
  const me = seat === 0 ? m.host : m.guest!;
  const opp = seat === 0 ? m.guest : m.host;
  const state = m.state ? viewFor(m.state, seat) : null;
  const looks = looksFor(seat, me, opp, state);
  return {
    id: m.id,
    status: m.status,
    code: seat === 0 && m.status === 'waiting' ? m.code : null,
    seat,
    you: { name: me.name, deck: me.deck, deckName: deckName(me), ...holdMark(me) },
    opponent: opp ? { name: opp.name, deck: opp.deck, deckName: deckName(opp), ...holdMark(opp) } : null,
    seq: m.state?.history.length ?? 0,
    state,
    expiresAt: m.expiresAt,
    ...(looks ? { looks } : {}),
  };
}

// La partie terminée, telle qu'elle est rangée dans « Mes parties » de chaque joueur (sans analyse du coach : il
// était désactivé pendant la partie). Les décisions du joueur sont retrouvées en rejouant les coups.
// holdDeck / opponentHoldDeck : présents (true) seulement pour un deck d'aventure.
export function recordFor(m: Match, seat: Seat, now: Date): GameRecord & { mode: 'online'; opponent: string; holdDeck?: true; opponentHoldDeck?: true } {
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
    config: { myDeck: me.deck, aiDeck: opp.deck, level: 0, first: 'random', myDeckName: deckName(me), aiDeckName: deckName(opp) },
    human: seat,
    initial: m.initial,
    current: m.state,
    moves,
    reviews: new Map(),
    extra: new Map(),
    undos: [],
    abandoned: m.status !== 'over',
  });
  // visuels des deux joueurs : la partie rangée contient déjà les deux decks (état de départ)
  const looks: NonNullable<GameRecord['looks']> = {};
  if (me.looks && Object.keys(me.looks).length) looks[seat] = me.looks;
  if (opp.looks && Object.keys(opp.looks).length) looks[seat === 0 ? 1 : 0] = opp.looks;
  return {
    ...rec, mode: 'online', opponent: opp.name, ...(Object.keys(looks).length ? { looks } : {}),
    ...(holdDeck(me) ? { holdDeck: true as const } : {}), ...(holdDeck(opp) ? { opponentHoldDeck: true as const } : {}),
  };
}
