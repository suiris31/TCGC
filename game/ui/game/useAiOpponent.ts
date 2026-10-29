// L'IA adverse d'une partie contre l'ordinateur : ses décisions sont calculées dans un fil séparé (créé au premier
// besoin), puis jouées avec un délai minimum (réglage « vitesse de l'IA ») pour qu'on puisse suivre. En pause, la
// décision calculée attend ; « pas à pas » en laisse passer une seule (table/pace.ts). Chaque décision jouée est gardée
// en une phrase, pour être revue dans la bande centrale.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AiWorker } from '../../ai/client.ts';
import { heuristicChooser } from '../../ai/heuristic.ts';
import type { Level } from '../../ai/search.ts';
import { act } from '../../engine/engine.ts';
import { other } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { aiMove, ready, remember, RUNNING, step as stepPace, type AiMove, type Pace } from '../table/pace.ts';

let aiWorker: AiWorker | null = null;
const worker = () => (aiWorker ??= new AiWorker());

export interface AiOpponent {
  thinking: boolean;       // l'IA réfléchit
  paused: boolean;         // en pause (elle ne joue plus d'elle-même)
  held: boolean;           // en pause, sa décision est prête et attend
  moves: AiMove[];         // ses dernières décisions, en phrases
  pause: () => void;
  resume: () => void;
  step: () => void;        // pas à pas : une décision
  reset: () => void;       // nouvelle partie : plus de pause, plus de décisions gardées
  forget: () => void;      // retour en arrière : plus de décisions gardées
}

export function useAiOpponent(game: GameState | null, setGame: Dispatch<SetStateAction<GameState | null>>, ai: PlayerId, level: Level, speed: number): AiOpponent {
  const [thinking, setThinking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [moves, setMoves] = useState<AiMove[]>([]);
  // lus par la décision quand elle est prête (sans relancer le calcul) ; release : jouer la décision qui attend
  const pace = useRef<Pace>(RUNNING);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!game || game.winner !== null || game.decision?.player !== ai) return;
    const current = game;
    const d = current.decision!;
    const started = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setThinking(true);
    // IA entraînée : toutes ses décisions (y compris au milieu d'un effet) viennent du modèle
    const pick = level === 4 && d.options.length > 1
      ? worker().chooseRl(current)
      : d.inEffect || level === 1 || level === 4 || d.options.length === 1
        ? Promise.resolve(heuristicChooser(current, d))
        : worker().choose(current, level);
    pick.then((choice) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        const play = () => {
          release.current = null;
          setHeld(false);
          const next = act(current, choice);
          setMoves((m) => remember(m, aiMove(current, next, ai, other(ai))));
          setGame((g) => (g === current ? next : g));
        };
        setThinking(false);
        const r = ready(pace.current);
        pace.current = r.next;
        if (r.play) return play();
        release.current = play;
        setHeld(true);
      }, Math.max(0, speed - (Date.now() - started)));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      release.current = null;
      setThinking(false);
      setHeld(false);
    };
  }, [game, setGame, ai, level, speed]);

  const pause = useCallback(() => {
    pace.current = { paused: true, credit: 0 };
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    pace.current = RUNNING;
    setPaused(false);
    release.current?.();
  }, []);
  const step = useCallback(() => {
    const r = stepPace(pace.current, release.current !== null);
    pace.current = r.next;
    if (r.play) release.current?.();
  }, []);
  const forget = useCallback(() => setMoves([]), []);
  const reset = useCallback(() => {
    pace.current = RUNNING;
    setPaused(false);
    setMoves([]);
    release.current?.();
  }, []);
  return { thinking, paused, held, moves, pause, resume, step, reset, forget };
}
