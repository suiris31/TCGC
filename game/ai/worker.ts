// Calculs de l'IA et du coach dans un fil séparé, pour que l'interface reste fluide
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData, GameState, PlayerId } from '../engine/types.ts';
import type { RlPolicy } from './rl.ts';
import { aiChoose, coachAnalyze, type CoachOptions, type Level } from './search.ts';

export type WorkerRequest =
  | { id: number; type: 'choose'; state: GameState; level: Level }
  | { id: number; type: 'coach'; state: GameState; opts: CoachOptions }
  | { id: number; type: 'chooseRl'; state: GameState; modelUrl: string };

// Premier message : les informations des cartes (le fil de calcul a ses propres modules, à remplir aussi)
export type CardsMessage = { type: 'cards'; data: Record<string, CardData> };

// IA entraînée : onnxruntime-web et le modèle ne sont chargés qu'au premier besoin
let rl: Promise<RlPolicy> | null = null;
async function loadPolicy(modelUrl: string): Promise<RlPolicy> {
  const [ort, { RlPolicy: Policy }] = await Promise.all([import('onnxruntime-web/wasm'), import('./rl.ts')]);
  ort.env.wasm.numThreads = 1;
  const base = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`;
  const [info, model] = await Promise.all([
    fetch(`${base}model.json`).then((r) => r.json()),
    fetch(`${base}model.onnx`).then((r) => r.arrayBuffer()),
  ]);
  return Policy.create(ort, new Uint8Array(model), info);
}

self.onmessage = async (e: MessageEvent<WorkerRequest | CardsMessage>) => {
  const msg = e.data;
  if (msg.type === 'cards') {
    loadCardData(msg.data);
  } else if (msg.type === 'choose') {
    postMessage({ id: msg.id, choice: aiChoose(msg.state, msg.state.decision!, msg.level) });
  } else if (msg.type === 'chooseRl') {
    try {
      rl ??= loadPolicy(msg.modelUrl);
      const policy = await rl;
      const d = msg.state.decision!;
      postMessage({ id: msg.id, choice: await policy.choose(msg.state, d.player as PlayerId) });
    } catch (err) {
      // modèle absent ou incompatible : l'IA simple joue à sa place
      console.error('IA entraînée indisponible :', err);
      rl = null;
      postMessage({ id: msg.id, choice: aiChoose(msg.state, msg.state.decision!, 1) });
    }
  } else {
    postMessage({ id: msg.id, analysis: coachAnalyze(msg.state, msg.opts) });
  }
};
