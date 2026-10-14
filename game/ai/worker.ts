// Calculs de l'IA et du coach dans un fil séparé, pour que l'interface reste fluide
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData, GameState, PlayerId } from '../engine/types.ts';
import type { RlPolicy } from './rl.ts';
import { aiChoose, coachAnalyze, type CoachOptions, type Level } from './search.ts';

export type WorkerRequest =
  | { id: number; type: 'choose'; state: GameState; level: Level }
  | { id: number; type: 'coach'; state: GameState; opts: CoachOptions }
  | { id: number; type: 'chooseRl'; state: GameState; modelUrls: string[] };

// Premier message : les informations des cartes (le fil de calcul a ses propres modules, à remplir aussi)
export type CardsMessage = { type: 'cards'; data: Record<string, CardData> };

// IA entraînée : onnxruntime-web et chaque modèle ne sont chargés qu'au premier besoin (une seule fois : un échec n'est
// pas retenté à chaque coup). Plusieurs modèles possibles (un par deck, IA spécialisées) : les 3 derniers utilisés
// restent chargés.
const policies = new Map<string, Promise<RlPolicy>>();
async function policyFor(urls: string[]): Promise<RlPolicy> {
  let error: unknown;
  for (const url of urls) {
    let p = policies.get(url);
    if (p) policies.delete(url);
    p ??= loadPolicy(url).catch((err) => {
      console.warn(`IA entraînée : modèle ${url} indisponible`, err);
      throw err;
    });
    policies.set(url, p);
    while (policies.size > 3) {
      const [oldest, old] = policies.entries().next().value!;
      policies.delete(oldest);
      old.then((policy) => policy.release(), () => {});
    }
    try {
      return await p;
    } catch (err) {
      error = err;   // modèle du deck indisponible : modèle suivant (le général)
    }
  }
  throw error;
}

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
      const policy = await policyFor(msg.modelUrls);
      const d = msg.state.decision!;
      postMessage({ id: msg.id, choice: await policy.choose(msg.state, d.player as PlayerId) });
    } catch (err) {
      // modèle absent ou incompatible : l'IA simple joue à sa place pour le reste de la session
      console.error('IA entraînée indisponible, l’IA Débutant joue à sa place :', err);
      postMessage({ id: msg.id, choice: aiChoose(msg.state, msg.state.decision!, 1) });
    }
  } else {
    postMessage({ id: msg.id, analysis: coachAnalyze(msg.state, msg.opts) });
  }
};
