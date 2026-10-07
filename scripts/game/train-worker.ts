// Fil de calcul de l'auto-apprentissage : joue des parties IA contre IA avec les styles demandés
import '../../game/data/load-local.ts';
import { parentPort } from 'node:worker_threads';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { playerStyle, type Style } from '../../game/ai/style.ts';
import { newGame } from '../../game/engine/engine.ts';
import type { PlayerId } from '../../game/engine/types.ts';

export interface Job {
  id: number;
  deck: string;            // deck qui s'entraîne
  style: Style;            // style essayé pour ce deck
  opponent: string;        // deck adverse
  opponentStyle: Style;    // style actuel du deck adverse
  seeds: number[];
}

parentPort!.on('message', (job: Job) => {
  let wins = 0;
  for (const [k, seed] of job.seeds.entries()) {
    const side = (k % 2) as PlayerId;
    const decks: [string, string] = side === 0 ? [job.deck, job.opponent] : [job.opponent, job.deck];
    playerStyle[side] = job.style;
    playerStyle[side === 0 ? 1 : 0] = job.opponentStyle;
    const s = newGame({ decks, names: ['A', 'B'], seed, first: (Math.floor(k / 2) % 2) as PlayerId }, heuristicChooser);
    if (s.winner === side) wins++;
  }
  playerStyle[0] = null;
  playerStyle[1] = null;
  parentPort!.postMessage({ id: job.id, wins, games: job.seeds.length });
});
