// Vérifie un modèle ONNX exporté avec le code du navigateur (game/ai/rl.ts, onnxruntime-web) : joue quelques parties
// en le faisant décider (toujours l'option la plus probable) et écrit, pour chaque décision, les probabilités
// calculées. rl/export_onnx.py rejoue ensuite les mêmes parties avec PyTorch et compare : même encodage, mêmes
// probabilités, mêmes choix.
//   node --no-warnings game/rl/check-onnx.ts dossier-du-modèle sortie.json [--games 4] [--catalog fichier]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { RlPolicy, type RlModelInfo } from '../ai/rl.ts';
import { DECKS } from '../engine/decks.ts';
import type { PlayerId } from '../engine/types.ts';
import { loadRlCatalog } from './catalog.ts';
import { RlEnv } from './env.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const [dir, out] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!dir || !out) {
  console.error('usage : node --no-warnings game/rl/check-onnx.ts dossier-du-modèle sortie.json [--games 4]');
  process.exit(2);
}
loadRlCatalog(opt('--catalog'));
ort.env.wasm.numThreads = 1;
const info = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')) as RlModelInfo;
const policy = await RlPolicy.create(ort, readFileSync(join(dir, 'model.onnx')), info);
const ids = Object.keys(DECKS);
const games = [];
const count = Number(opt('--games') ?? 4);
const t0 = performance.now();
let decisions = 0;
for (let g = 0; g < count; g++) {
  const decks: [string, string] = [ids[g % ids.length], ids[(g * 5 + 2) % ids.length]];
  const seed = 2 ** 30 + 777 + g;
  const env = new RlEnv().reset({ seed, decks, first: 'random', seats: [{ kind: 'agent' }, { kind: 'heuristic' }] });
  const steps = [];
  while (!env.done) {
    const seat = env.toAct as PlayerId;
    const { options, probs, value } = await policy.evaluate(env.state, seat);
    const index = probs.indexOf(Math.max(...probs));
    steps.push({ index, options, probs, value });
    env.step(index);
    decisions++;
  }
  games.push({ seed, decks, steps, winner: env.result().winner });
}
const ms = performance.now() - t0;
writeFileSync(out, JSON.stringify({ model: info.name, games, msPerDecision: ms / Math.max(1, decisions) }));
console.log(`${count} parties, ${decisions} décisions du modèle, ${(ms / Math.max(1, decisions)).toFixed(2)} ms par décision (onnxruntime-web, 1 fil)`);
