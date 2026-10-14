// Accès aux calculs du fil séparé (worker.ts) depuis l'interface
import { cardData } from '../engine/cards/index.ts';
import { SPEC_HASH } from '../rl/encode.ts';
import type { GameState } from '../engine/types.ts';
import type { Analysis, CoachOptions, Level } from './search.ts';
import type { WorkerRequest } from './worker.ts';

type Request = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

// Dossier du modèle entraîné, à côté de l'application (chemins relatifs : l'appli peut être dans un sous-dossier)
export const rlModelUrl = () => new URL(`${import.meta.env.BASE_URL}rl-model/`, location.href).href;

// Un modèle entraîné est-il installé, et entraîné avec l'encodage du code actuel ? (vérifié une fois)
let rlChecked: Promise<boolean> | null = null;
export function rlModelAvailable(): Promise<boolean> {
  rlChecked ??= fetch(`${rlModelUrl()}model.json`)
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return false;
      const info = await r.json();
      if (info.specHash !== SPEC_HASH) console.warn(`IA entraînée : modèle « ${info.name} » d'un autre encodage (${info.specHash}, actuel ${SPEC_HASH}), à réexporter`);
      return info.specHash === SPEC_HASH;
    })
    .catch(() => false);
  return rlChecked;
}

// IA spécialisées (rl/README.md § 16) : un modèle par deck, dans rl-model/decks/<deck>/, listés dans decks.json ; seuls
// ceux de l'encodage actuel comptent. Lu une fois.
let deckModels: Promise<Set<string>> | null = null;
export function rlDeckModels(): Promise<Set<string>> {
  deckModels ??= fetch(`${rlModelUrl()}decks.json`)
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return new Set<string>();
      const decks: Record<string, { specHash?: string }> = (await r.json()).decks ?? {};
      return new Set(Object.keys(decks).filter((id) => decks[id].specHash === SPEC_HASH));
    })
    .catch(() => new Set<string>());
  return deckModels;
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

  // IA entraînée (niveau 4) : modèle ONNX servi avec l'application (web/public/rl-model/) ; celui du deck qu'elle joue
  // quand il existe (IA spécialisée), sinon le modèle général
  async chooseRl(state: GameState): Promise<string> {
    const deck = state.players[state.decision!.player].deckId;
    const own = (await rlDeckModels()).has(deck) ? [`${rlModelUrl()}decks/${encodeURIComponent(deck)}/`] : [];
    return (await this.send({ type: 'chooseRl', state, modelUrls: [...own, rlModelUrl()] })).choice!;
  }

  // Analyse du coach (deux temps, voir coachAnalyze)
  async coach(state: GameState, opts: CoachOptions): Promise<Analysis> {
    return (await this.send({ type: 'coach', state, opts })).analysis!;
  }
}
