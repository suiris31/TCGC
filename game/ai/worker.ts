// Calculs de l'IA et du coach dans un fil séparé, pour que l'interface reste fluide
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData, GameState } from '../engine/types.ts';
import { aiChoose, coachAnalyze, type CoachOptions, type Level } from './search.ts';

export type WorkerRequest =
  | { id: number; type: 'choose'; state: GameState; level: Level }
  | { id: number; type: 'coach'; state: GameState; opts: CoachOptions };

// Premier message : les informations des cartes (le fil de calcul a ses propres modules, à remplir aussi)
export type CardsMessage = { type: 'cards'; data: Record<string, CardData> };

self.onmessage = (e: MessageEvent<WorkerRequest | CardsMessage>) => {
  const msg = e.data;
  if (msg.type === 'cards') {
    loadCardData(msg.data);
  } else if (msg.type === 'choose') {
    postMessage({ id: msg.id, choice: aiChoose(msg.state, msg.state.decision!, msg.level) });
  } else {
    postMessage({ id: msg.id, analysis: coachAnalyze(msg.state, msg.opts) });
  }
};
