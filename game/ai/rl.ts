// IA entraînée par apprentissage par renforcement (rl/ à la racine du dépôt) : un modèle ONNX exécuté par
// onnxruntime-web, dans le fil de calcul de l'IA (worker.ts) ou dans Node (game/rl/check-onnx.ts).
//
// Le modèle ne reçoit que la vue du joueur (viewFor), encodée par le même code que pendant l'entraînement
// (game/rl/encode.ts) : il joue avec exactement les informations d'un joueur humain. Le fichier model.json qui
// accompagne le modèle donne l'empreinte de l'encodage (refusé s'il ne correspond pas au code actuel) et le
// vocabulaire des cartes.
import type * as Ort from 'onnxruntime-web';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { DYN_DIM, encodeObservation, GLOBAL_DIM, OPTION_DIM, SPEC_HASH } from '../rl/encode.ts';
import { STATIC_DIM, staticFeatures } from '../rl/features.ts';

export interface RlModelInfo {
  name: string;
  specHash: string;
  vocab: string[];           // cartes du vocabulaire (identifiant appris = rang + 1 ; 0 = carte inconnue)
  synthetic?: boolean;
  [key: string]: unknown;
}

export interface RlEvaluation {
  options: string[];
  probs: number[];
  value: number;             // estimation de l'issue pour le joueur qui décide (−1 défaite, +1 victoire)
}

export class RlPolicy {
  readonly info: RlModelInfo;
  private ort: typeof Ort;
  private session: Ort.InferenceSession;
  private vocab: Map<string, number>;

  private constructor(ort: typeof Ort, session: Ort.InferenceSession, info: RlModelInfo) {
    this.ort = ort;
    this.session = session;
    this.info = info;
    this.vocab = new Map(info.vocab.map((num, i) => [num, i + 1]));
  }

  static async create(ort: typeof Ort, model: Uint8Array, info: RlModelInfo): Promise<RlPolicy> {
    if (info.specHash !== SPEC_HASH) {
      throw new Error(`modèle « ${info.name} » entraîné avec un autre encodage (${info.specHash}, actuel ${SPEC_HASH}) : à réentraîner`);
    }
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    return new RlPolicy(ort, session, info);
  }

  // Probabilité de chaque option de la décision en cours du joueur `seat`
  async evaluate(state: GameState, seat: PlayerId): Promise<RlEvaluation> {
    const o = encodeObservation(viewFor(state, seat), seat);
    const n = o.nums.length;
    const a = o.options.length;
    if (!a) throw new Error('aucune décision à prendre pour ce joueur');
    // cartes individuelles d'abord (groupe 0), puis cartes des zones résumées (au moins une place, même vide)
    let na = 0;
    while (na < n && o.group[na] === 0) na++;
    const np = n - na;
    const P = Math.max(1, np);
    const T = this.ort.Tensor;
    const statics = (from: number, count: number, size: number) => {
      const out = new Float32Array(size * STATIC_DIM);
      for (let i = 0; i < count; i++) out.set(staticFeatures(o.nums[from + i]), i * STATIC_DIM);
      return out;
    };
    const ids = (from: number, count: number, size: number) => {
      const out = new BigInt64Array(size);
      for (let i = 0; i < count; i++) out[i] = BigInt(this.vocab.get(o.nums[from + i]) ?? 0);
      return out;
    };
    const pDyn = new Float32Array(P * DYN_DIM);
    pDyn.set(o.dyn.subarray(na * DYN_DIM));
    const pGroup = new BigInt64Array(P);
    for (let i = 0; i < np; i++) pGroup[i] = BigInt(o.group[na + i]);
    const pMask = new Float32Array(P);
    pMask.fill(1, 0, np);
    // pointeurs : avec une seule observation, les cartes résumées suivent directement les cartes individuelles
    const ptr = BigInt64Array.from(o.ptr, (p) => BigInt(p));
    const feeds: Record<string, Ort.Tensor> = {
      a_static: new T('float32', statics(0, na, na), [1, na, STATIC_DIM]),
      a_dyn: new T('float32', o.dyn.slice(0, na * DYN_DIM), [1, na, DYN_DIM]),
      a_ids: new T('int64', ids(0, na, na), [1, na]),
      a_mask: new T('float32', new Float32Array(na).fill(1), [1, na]),
      p_static: new T('float32', statics(na, np, P), [1, P, STATIC_DIM]),
      p_dyn: new T('float32', pDyn, [1, P, DYN_DIM]),
      p_ids: new T('int64', ids(na, np, P), [1, P]),
      p_group: new T('int64', pGroup, [1, P]),
      p_mask: new T('float32', pMask, [1, P]),
      glob: new T('float32', o.global, [1, GLOBAL_DIM]),
      opt: new T('float32', o.opt, [1, a, OPTION_DIM]),
      ptr: new T('int64', ptr, [1, a, 2]),
      opt_mask: new T('float32', new Float32Array(a).fill(1), [1, a]),
    };
    const out = await this.session.run(feeds);
    const logits = out.logits.data as Float32Array;
    const max = Math.max(...logits);
    const exp = Array.from(logits, (x) => Math.exp(x - max));
    const sum = exp.reduce((s, x) => s + x, 0);
    return { options: o.options, probs: exp.map((x) => x / sum), value: (out.value.data as Float32Array)[0] };
  }

  // Choix : selon les probabilités du modèle (sa vraie politique), ou toujours la plus probable (greedy)
  async choose(state: GameState, seat: PlayerId, greedy = false, rand: () => number = Math.random): Promise<string> {
    const { options, probs } = await this.evaluate(state, seat);
    if (greedy) return options[probs.indexOf(Math.max(...probs))];
    let r = rand();
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r <= 0) return options[i];
    }
    return options[options.length - 1];
  }
}
