// La partie contre l'IA et son enregistrement (voir game/coach/archive.ts) : l'état de la partie, tes décisions et leur
// analyse par le coach, les retours en arrière, et la sauvegarde dans « Mes parties », mise à jour au fil des coups,
// puis à la fin quand le coach a analysé tes décisions. Si l'onglet se ferme, une copie attend dans le navigateur
// jusqu'au lancement suivant. Une partie quittée avant la fin est enregistrée comme abandonnée.
//
// Une seule remise à zéro, begin, pour toutes les façons de commencer : nouvelle partie, reprise d'une partie
// interrompue (même enregistrement), entraînement depuis un moment revu (récap ou « Mes parties »). Ce qui se fait une
// fois par partie (bilan, gain, fin d'aventure) est rattaché à l'identifiant de l'enregistrement (gameId).
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRecord, recordId, type GameRecord } from '../../coach/archive.ts';
import type { Move, MoveReview } from '../../coach/review.ts';
import { act } from '../../engine/engine.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { flushQueue, keepForLater, saveRecord } from '../archiveClient.ts';
import type { Config } from '../setup/config.ts';
import { gameLooks } from '../table/donLooks.ts';

// Version du programme enregistrée avec chaque partie
const ENGINE = typeof __ENGINE__ === 'string' ? __ENGINE__ : 'inconnue';

// Partie en cours d'enregistrement
interface Recording {
  id: string;
  startedAt: string;
  initial: GameState;
  config: Config;
  practice?: { from: string | null; turn: number };
  undos: { turn: number; undone: number }[];
  extra: Map<number, { ms?: number; hint?: string }>;  // temps de réflexion et conseil affiché, par décision
  endedAt?: string;
}

export interface Begin {
  state: GameState;
  config: Config;
  // entraînement depuis un moment revu : il ne compte pas (ni bilan, ni gain, ni aventure)
  practice?: Recording['practice'];
  // décisions déjà jouées (reprise, moment revu), avec leurs analyses par le coach
  moves?: Move[];
  reviews?: MoveReview[];
  // reprise d'une partie interrompue : l'enregistrement continue sous le même identifiant
  continues?: GameRecord;
  intro?: boolean;
}

// onBegin : après chaque remise à zéro (le plateau, le conseil et le gain repartent de zéro)
export function useGameRecording({ human, mode, onBegin }: { human: PlayerId; mode?: 'aventure'; onBegin: (opts: { intro?: boolean }) => void }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [session, setSession] = useState<Config | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [undo, setUndo] = useState<GameState[]>([]);
  // Décisions du joueur et leur analyse par le coach (useCoach), faite en arrière-plan pendant la partie
  const moves = useRef<Move[]>([]);
  const reviews = useRef(new Map<number, MoveReview>());
  const nextMove = useRef(1);
  const [reviewed, setReviewed] = useState(0);

  const recording = useRef<Recording | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const shownAt = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordMode = useRef(mode);
  const began = useRef(onBegin);
  began.current = onBegin;

  const snapshot = useCallback((abandoned = false): GameRecord | null => {
    const r = recording.current;
    const current = gameRef.current;
    if (!r || !current) return null;
    const rec = buildRecord({
      id: r.id, engine: ENGINE, startedAt: r.startedAt, now: new Date().toISOString(), endedAt: r.endedAt,
      config: r.config, human, practice: r.practice, initial: r.initial, current,
      moves: moves.current, reviews: reviews.current, extra: r.extra, undos: r.undos, abandoned,
      mode: recordMode.current, looks: gameLooks(current),
    });
    return rec.decisions.length ? rec : null; // quittée avant ton premier choix : rien à garder
  }, [human]);

  // Fin de l'enregistrement (nouvelle partie, menu) : une partie pas finie est notée abandonnée
  const close = useCallback(() => {
    clearTimeout(saveTimer.current);
    const rec = snapshot(gameRef.current?.winner === null);
    if (rec) void saveRecord(rec);
    recording.current = null;
  }, [snapshot]);

  // Sauvegarde au fil des coups (et des analyses), aussitôt la partie finie
  useEffect(() => {
    gameRef.current = game;
    const r = recording.current;
    if (!r || !game) return;
    if (game.winner !== null && !r.endedAt) r.endedAt = new Date().toISOString();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const rec = snapshot();
      if (rec) void saveRecord(rec);
    }, game.winner !== null ? 300 : 2500);
  }, [game, reviewed, snapshot]);

  // Partie en cours quand on quitte le jeu (autre page de l'appli) : enregistrée comme abandonnée
  useEffect(() => () => close(), [close]);

  useEffect(() => {
    flushQueue();
    const onHide = () => {
      const rec = snapshot();
      if (rec) keepForLater(rec);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [snapshot]);

  // Temps de réflexion : compté depuis l'affichage de ta décision
  const humanTurn = Boolean(game && game.decision && game.decision.player === human && game.winner === null);
  useEffect(() => {
    if (humanTurn) shownAt.current = Date.now();
  }, [game, humanTurn]);

  const begin = ({ state, config, practice, moves: earlier = [], reviews: known = [], continues, intro }: Begin) => {
    close();
    const now = new Date();
    recording.current = continues
      ? {
        id: continues.id, startedAt: continues.startedAt, initial: continues.initial, config, undos: [...continues.undos],
        extra: new Map(continues.decisions.map((x) => [x.move, { ms: x.ms, hint: x.hint }])),
      }
      : { id: recordId(now, config, Boolean(practice)), startedAt: now.toISOString(), initial: state, config, practice, undos: [], extra: new Map() };
    moves.current = earlier;
    nextMove.current = Math.max(nextMove.current, ...earlier.map((m) => m.id + 1));
    reviews.current = new Map(known.filter((r) => earlier.some((m) => m.id === r.id)).map((r) => [r.id, r]));
    setReviewed(reviews.current.size);
    setGameId(recording.current.id);
    setSession(config);
    setPractice(Boolean(practice));
    setUndo([]);
    setGame(state);
    began.current({ intro });
  };

  // Ton choix : joué par le moteur, noté pour le récap (temps de réflexion, conseil affiché)
  const play = useCallback((id: string, hint?: string) => {
    if (!game) return;
    const moveId = nextMove.current++;
    recording.current?.extra.set(moveId, { ms: Date.now() - shownAt.current, hint });
    moves.current = [...moves.current, { id: moveId, state: game, choice: id }];
    setUndo((u) => [...u.slice(-80), game]);
    setGame(act(game, id));
  }, [game]);

  // Retour en arrière d'une décision (et de ce que l'IA a joué depuis) ; false s'il n'y a rien à défaire
  const back = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return false;
    if (game) recording.current?.undos.push({ turn: game.turn, undone: game.history.length - previous.history.length });
    const last = moves.current[moves.current.length - 1];
    if (last) reviews.current.delete(last.id);
    moves.current = moves.current.slice(0, -1);
    setUndo(undo.slice(0, -1));
    setGame(previous);
    return true;
  };

  // La partie se ferme (retour à l'écran de départ)
  const quit = () => {
    close();
    setGame(null);
  };

  return {
    game, setGame, gameRef, gameId, session, practice, humanTurn,
    canUndo: undo.length > 0,
    moves, reviews, reviewed, setReviewed,
    snapshot, begin, play, back, quit,
    // enregistrement final, envoyé tout de suite (la sauvegarde au fil des coups est annulée) : son identifiant
    // une fois sur le serveur
    saveNow: (): Promise<string> | null => {
      clearTimeout(saveTimer.current);
      const rec = snapshot();
      return rec ? saveRecord(rec).then(() => rec.id) : null;
    },
  };
}

export type GameRecording = ReturnType<typeof useGameRecording>;

// Fin de la partie, une fois par partie (pas une partie reprise depuis un moment revu, qui ne compte pas) :
// - partie libre : enregistrée tout de suite, puis son gain (Berry) est demandé au serveur ;
// - partie imposée (Aventure) : finie et vue (écran de victoire ou de défaite passé, celebrate), elle est enregistrée
//   puis signalée à l'aventure, qui demande elle-même le gain avec le résultat du chapitre.
export function useRecordingEnd(rec: GameRecording, { human, celebrate, claim, onEnd }: {
  human: PlayerId;
  celebrate: boolean;
  claim: (saved: () => Promise<string>) => void;
  onEnd?: (end: { won: boolean; saved: Promise<string> }) => void;
}) {
  const { game, gameId, practice, saveNow } = rec;
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!game || game.winner === null || practice || !gameId || done.current === gameId) return;
    if (onEnd) {
      if (celebrate) return;
      done.current = gameId;
      onEnd({ won: game.winner === human, saved: saveNow() ?? Promise.reject(new Error('partie vide')) });
    } else {
      done.current = gameId;
      const saved = saveNow();
      if (saved) claim(() => saved);
    }
  }, [game, gameId, practice, celebrate, human, claim, onEnd, saveNow]);
}
