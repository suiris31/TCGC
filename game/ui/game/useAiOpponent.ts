// L'IA adverse d'une partie contre l'ordinateur : ses décisions sont calculées dans un fil séparé (créé au premier
// besoin), puis jouées avec un délai minimum (réglage « vitesse de l'IA ») pour qu'on puisse suivre
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { AiWorker } from '../../ai/client.ts';
import { heuristicChooser } from '../../ai/heuristic.ts';
import type { Level } from '../../ai/search.ts';
import { act } from '../../engine/engine.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';

let aiWorker: AiWorker | null = null;
const worker = () => (aiWorker ??= new AiWorker());

// Renvoie true pendant que l'IA réfléchit
export function useAiOpponent(game: GameState | null, setGame: Dispatch<SetStateAction<GameState | null>>, ai: PlayerId, level: Level, speed: number) {
  const [thinking, setThinking] = useState(false);
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
        setThinking(false);
        setGame((g) => (g === current ? act(g, choice) : g));
      }, Math.max(0, speed - (Date.now() - started)));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setThinking(false);
    };
  }, [game, setGame, ai, level, speed]);
  return thinking;
}
