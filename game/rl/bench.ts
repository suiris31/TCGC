// Mesure du débit de simulation, sans modèle : où passe le temps d'une décision ?
//   node --no-warnings game/rl/bench.ts [parties] [--catalog fichier]
// 1. moteur seul avec act (copie de l'état à chaque décision, comme l'interface) ;
// 2. moteur seul avec actInPlace (sans copie, comme l'environnement) ;
// 3. environnement complet : choix au hasard pour les deux sièges, observation encodée à chaque décision ;
// 4. idem contre l'IA heuristique (un siège piloté, l'autre heuristique).
import { DECKS } from '../engine/decks.ts';
import { act, actInPlace, newGame } from '../engine/engine.ts';
import { random } from '../engine/rng.ts';
import type { GameState } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { loadRlCatalog } from './catalog.ts';
import { encodeObservation } from './encode.ts';
import { RlEnv } from './env.ts';
import type { SeatSpec } from './opponents.ts';

const argv = process.argv.slice(2);
const catalog = argv.indexOf('--catalog') >= 0 ? argv[argv.indexOf('--catalog') + 1] : undefined;
const games = Number(argv.find((a) => /^\d+$/.test(a)) ?? 200);
const cat = loadRlCatalog(catalog);
if (cat.synthetic) console.log('ATTENTION : catalogue synthétique (données inventées) — mesures indicatives seulement');
const ids = Object.keys(DECKS);
const decksOf = (g: number): [string, string] => [ids[g % ids.length], ids[Math.floor(g / ids.length) % ids.length]];

function engineOnly(apply: (s: GameState, c: string) => GameState) {
  const r = { rng: 99 };
  let decisions = 0;
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    let s = newGame({ decks: decksOf(g), names: ['A', 'B'], seed: 5000 + g, first: 'random' });
    while (s.winner === null) {
      const d = s.decision!;
      s = apply(s, d.options[Math.floor(random(r) * d.options.length)].id);
      s.log = [];
      s.history = [];
      decisions++;
    }
  }
  return { ms: performance.now() - t0, decisions };
}

function envRun(seats: [SeatSpec, SeatSpec]) {
  const r = { rng: 7 };
  const env = new RlEnv();
  let decisions = 0;
  let agent = 0;
  let observeMs = 0;
  let maxDecisions = 0;
  let maxTurns = 0;
  let maxTokens = 0;
  let maxOptions = 0;
  let truncated = 0;
  let errors = 0;
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    env.reset({ seed: 9000 + g, decks: decksOf(g), first: 'random', seats });
    while (!env.done) {
      const t1 = performance.now();
      const o = encodeObservation(viewFor(env.state, env.toAct!), env.toAct!);
      observeMs += performance.now() - t1;
      maxTokens = Math.max(maxTokens, o.nums.length);
      maxOptions = Math.max(maxOptions, o.options.length);
      env.step(Math.floor(random(r) * o.options.length));
      agent++;
    }
    const res = env.result();
    decisions += res.decisions;
    maxDecisions = Math.max(maxDecisions, res.decisions);
    maxTurns = Math.max(maxTurns, res.turns);
    if (res.truncated) truncated++;
    if (res.error) errors++;
  }
  return { ms: performance.now() - t0, decisions, agent, observeMs, maxDecisions, maxTurns, maxTokens, maxOptions, truncated, errors };
}

const line = (label: string, ms: number, decisions: number) =>
  console.log(`${label.padEnd(44)} ${(games / ms * 1000).toFixed(1).padStart(7)} parties/s  ${(decisions / ms * 1000).toFixed(0).padStart(7)} décisions/s  (${(ms / decisions * 1000).toFixed(0)} µs/décision)`);

console.log(`${games} parties par mesure, un seul cœur`);
const a = engineOnly(act);
line('moteur, act (copie de l\'état)', a.ms, a.decisions);
const b = engineOnly(actInPlace);
line('moteur, actInPlace (sans copie)', b.ms, b.decisions);
for (const [label, seats] of [
  ['environnement, aléatoire contre aléatoire', [{ kind: 'agent' }, { kind: 'agent' }]],
  ['environnement, aléatoire contre heuristique', [{ kind: 'agent' }, { kind: 'heuristic' }]],
] as [string, [SeatSpec, SeatSpec]][]) {
  const e = envRun(seats);
  line(label, e.ms, e.decisions);
  console.log(`  observations : ${e.agent} (${(e.observeMs / e.agent * 1000).toFixed(0)} µs chacune, ${(e.observeMs / e.ms * 100).toFixed(0)} % du temps) · `
    + `max ${e.maxDecisions} décisions, ${e.maxTurns} tours, ${e.maxTokens} jetons, ${e.maxOptions} options · tronquées ${e.truncated}, erreurs ${e.errors}`);
}
