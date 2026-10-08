// Accès aux calculs du fil séparé (worker.ts) depuis l'interface
import { cardData } from '../engine/cards/index.ts';
import type { GameState } from '../engine/types.ts';
import type { Analysis, CoachOptions, Level } from './search.ts';
import type { WorkerRequest } from './worker.ts';

type Request = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

// Dossier du modèle entraîné, à côté de l'application (chemins relatifs : l'appli peut être dans un sous-dossier)
export const rlModelUrl = () => new URL(`${import.meta.env.BASE_URL}rl-model/`, location.href).href;

// Un modèle entraîné est-il installé ? (vérifié une fois)
let rlChecked: Promise<boolean> | null = null;
export function rlModelAvailable(): Promise<boolean> {
  rlChecked ??= fetch(`${rlModelUrl()}model.json`, { method: 'GET' })
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false);
  return rlChecked;
}

export class AiWorker {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private waiting = new Map<number, (data: { choice?: string; analysis?: Analysis }) => void>();

  constructor() {
    this.worker.postMessage({ type: 'cards', data: cardData() });
    this.worker.onmessage = (e) => {
      const resolve = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      resolve?.(e.data);
    };
  }

  private send(msg: Request) {
    const id = this.nextId++;
    return new Promise<{ choice?: string; analysis?: Analysis }>((resolve) => {
      this.waiting.set(id, resolve);
      this.worker.postMessage({ ...msg, id });
    });
  }

  async choose(state: GameState, level: Level): Promise<string> {
    return (await this.send({ type: 'choose', state, level })).choice!;
  }

  // IA entraînée (niveau 4) : modèle ONNX servi avec l'application (web/public/rl-model/)
  async chooseRl(state: GameState): Promise<string> {
    return (await this.send({ type: 'chooseRl', state, modelUrl: rlModelUrl() })).choice!;
  }

  // Analyse du coach (deux temps, voir coachAnalyze)
  async coach(state: GameState, opts: CoachOptions): Promise<Analysis> {
    return (await this.send({ type: 'coach', state, opts })).analysis!;
  }
}
