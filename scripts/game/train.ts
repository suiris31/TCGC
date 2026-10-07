// Auto-apprentissage des styles de jeu, deck par deck, par un algorithme d'évolution :
// - chaque génération essaie des variantes du style actuel (réglages tirés au hasard autour de lui) ;
// - chaque variante joue contre les 6 decks (miroir compris), des deux côtés, avec les styles actuels des adversaires ;
// - les meilleures variantes donnent le style de la génération suivante ;
// - le nouveau style n'est gardé que s'il bat l'ancien sur de nouvelles parties.
// Les decks sont entraînés à tour de rôle, plusieurs tours, pour que chacun s'adapte aux progrès des autres.
//   node --no-warnings scripts/game/train.ts [tours] [générations] [parties par adversaire] [variantes]
import fs from 'node:fs';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { BASE_STYLES, DEFAULT_STYLE, STYLE_RANGES, type Style } from '../../game/ai/style.ts';
import { DECKS } from '../../game/engine/decks.ts';
import type { Job } from './train-worker.ts';

const [rounds = 3, generations = 30, perOpponent = 48, lambda = 14] = process.argv.slice(2).map(Number);
const ids = Object.keys(DECKS);
const KEYS = Object.keys(STYLE_RANGES) as (keyof Style)[];
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;

// ---------- Fils de calcul ----------

const workers = Array.from({ length: Math.max(1, os.availableParallelism() - 1) }, () => new Worker(new URL('./train-worker.ts', import.meta.url)));
let nextJob = 1;
const waiting = new Map<number, (r: { wins: number; games: number }) => void>();
for (const w of workers) w.on('message', (r: { id: number; wins: number; games: number }) => { waiting.get(r.id)?.(r); waiting.delete(r.id); });
const queue: { job: Job; resolve: (r: { wins: number; games: number }) => void }[] = [];
const idle = [...workers];
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop()!;
    const { job, resolve } = queue.shift()!;
    waiting.set(job.id, (r) => { idle.push(w); resolve(r); pump(); });
    w.postMessage(job);
  }
}
const run = (job: Omit<Job, 'id'>) => new Promise<{ wins: number; games: number }>((resolve) => {
  queue.push({ job: { ...job, id: nextJob++ }, resolve });
  pump();
});

// Taux de victoire de chaque style candidat pour `deck`, contre tous les decks (styles du groupe `pool`)
async function evaluate(deck: string, candidates: Style[], pool: Record<string, Style>, seeds: number[]): Promise<number[]> {
  return Promise.all(candidates.map(async (style) => {
    const results = await Promise.all(ids.map((opponent) => run({ deck, style, opponent, opponentStyle: pool[opponent], seeds })));
    return results.reduce((sum, r) => sum + r.wins, 0) / results.reduce((sum, r) => sum + r.games, 0);
  }));
}

// ---------- Réglages normalisés entre 0 et 1 ----------

const toVec = (st: Style) => KEYS.map((k) => (st[k] - STYLE_RANGES[k][0]) / (STYLE_RANGES[k][1] - STYLE_RANGES[k][0]));
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const fromVec = (v: number[]) => Object.fromEntries(KEYS.map((k, i) => [k, +(STYLE_RANGES[k][0] + clamp(v[i]) * (STYLE_RANGES[k][1] - STYLE_RANGES[k][0])).toFixed(3)])) as unknown as Style;

let rngState = 20261006;
const rand = () => {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
let seedBase = 1;
const freshSeeds = (n: number) => Array.from({ length: n }, () => 100000 + seedBase++ * 7919);

// ---------- Évolution ----------

const base: Record<string, Style> = Object.fromEntries(ids.map((id) => [id, { ...DEFAULT_STYLE, ...BASE_STYLES[id] }]));
const pool: Record<string, Style> = Object.fromEntries(ids.map((id) => [id, { ...base[id] }]));
const history: Record<string, { round: number; before: number; after: number; kept: boolean }[]> = Object.fromEntries(ids.map((id) => [id, []]));

async function train(deck: string, round: number) {
  let mean = toVec(pool[deck]);
  let sigma = round === 1 ? 0.18 : 0.1;
  const mu = Math.max(2, Math.floor(lambda / 3));
  const weights = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  for (let g = 1; g <= generations; g++) {
    const seeds = freshSeeds(perOpponent);
    const vecs = [mean, ...Array.from({ length: lambda - 1 }, () => mean.map((x) => clamp(x + sigma * gauss())))];
    const fits = await evaluate(deck, vecs.map(fromVec), pool, seeds);
    const order = fits.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
    mean = mean.map((_, k) => order.slice(0, mu).reduce((sum, o, j) => sum + weights[j] * vecs[o.i][k], 0) / wsum);
    sigma = Math.max(0.03, sigma * 0.94);
    if (g % 10 === 0 || g === generations) process.stdout.write(`  ${deck} génération ${g} : meilleure variante ${(order[0].f * 100).toFixed(1)} %, style moyen ${(fits[0] * 100).toFixed(1)} % (${elapsed()})\n`);
  }
  // le nouveau style doit battre l'ancien sur de nouvelles parties, plus nombreuses
  const seeds = freshSeeds(perOpponent * 4);
  const [before, after] = await evaluate(deck, [pool[deck], fromVec(mean)], pool, seeds);
  const kept = after > before + 0.005;
  history[deck].push({ round, before, after, kept });
  console.log(`${deck} ${DECKS[deck].name} (tour ${round}) : ${(before * 100).toFixed(1)} % → ${(after * 100).toFixed(1)} % ${kept ? 'gardé' : 'non gardé'} (${elapsed()})`);
  if (kept) pool[deck] = fromVec(mean);
}

for (let r = 1; r <= rounds; r++) {
  console.log(`— Tour ${r}/${rounds} —`);
  for (const deck of ids) await train(deck, r);
}

// ---------- Bilan ----------

const LABELS: Record<keyof Style, string> = {
  playPower: 'intérêt de la puissance des Personnages joués',
  playEffect: 'intérêt des effets [Jouée]',
  holdLife: 'Vies adverses à partir desquelles il attaque avant de jouer ses cartes',
  counterReserve: 'Événements [Contre] pour lesquels il garde des DON!!',
  keyReserve: 'réserve de DON!! pour l’Événement clé',
  keyMinDon: 'DON!! sur le terrain à partir desquelles il garde cette réserve',
  overkill: 'DON!! en plus sur les attaques contre le Leader',
  dumpDon: 'DON!! restantes mises sur une attaque (plutôt que gardées)',
  leaderAggro: 'intérêt d’attaquer le Leader adverse',
  lethalBonus: 'bonus d’attaque quand l’adversaire a 2 Vies ou moins',
  charKill: 'intérêt d’abattre les Personnages adverses',
  minEdge: 'avance de puissance exigée pour attaquer',
  keepBlockers: 'réticence à attaquer avec un [Bloqueur]',
  counterLife: 'Vie à partir de laquelle il contre tout',
  counterMid: 'Vie « moyenne » (contre si l’écart est petit)',
  counterSmall: 'écart jugé petit pour contrer (milliers)',
  protectValue: 'valeur minimale d’un Personnage protégé par un Contre',
  blockLife: 'Vie à partir de laquelle il bloque même en perdant le bloqueur',
  restBlocker: 'intérêt d’épuiser un [Bloqueur] adverse',
  mulliganCheap: 'Personnages de coût 4 ou moins exigés pour garder sa main',
};

// Évaluation finale, sur de nouvelles parties : style de départ contre style appris, face aux styles appris des autres
const finalSeeds = freshSeeds(perOpponent * 6);
const lines = ['# Auto-apprentissage des styles de jeu', ''];
lines.push(`${rounds} tours × ${ids.length} decks × ${generations} générations de ${lambda} variantes, ${perOpponent} parties par adversaire et par variante. Durée : ${elapsed()}.`, '');
lines.push('| Deck | Style de départ | Style appris |', '|---|---|---|');
const tuned: Record<string, Partial<Style>> = {};
const notes: string[] = [];
for (const deck of ids) {
  const [b, a] = await evaluate(deck, [base[deck], pool[deck]], pool, finalSeeds);
  lines.push(`| ${deck} ${DECKS[deck].name} | ${(b * 100).toFixed(1)} % | ${(a * 100).toFixed(1)} % |`);
  tuned[deck] = pool[deck];
  // réglages sans effet pour ce deck (seul Zoro a un Événement clé à garder)
  const irrelevant = deck === 'ST-32' ? [] : ['keyReserve', 'keyMinDon'];
  const moved = KEYS.filter((k) => !irrelevant.includes(k)).map((k) => ({ k, from: base[deck][k], to: pool[deck][k], d: Math.abs(pool[deck][k] - base[deck][k]) / (STYLE_RANGES[k][1] - STYLE_RANGES[k][0]) }))
    .filter((x) => x.d >= 0.12).sort((x, y) => y.d - x.d);
  notes.push(`### ${deck} ${DECKS[deck].name}`, '');
  if (!moved.length) notes.push('- peu de changements par rapport au style de départ', '');
  for (const m of moved) notes.push(`- ${LABELS[m.k]} : ${+m.from.toFixed(2)} → ${+m.to.toFixed(2)}`);
  notes.push('');
}
lines.push('', 'Taux de victoire contre les 6 decks (styles appris), sur de nouvelles parties.', '', '## Ce que l’apprentissage a changé', '', ...notes);
lines.push('## Historique', '');
for (const deck of ids) for (const h of history[deck]) lines.push(`- ${deck} tour ${h.round} : ${(h.before * 100).toFixed(1)} % → ${(h.after * 100).toFixed(1)} % (${h.kept ? 'gardé' : 'non gardé'})`);
fs.writeFileSync('game/ai/styles.json', `${JSON.stringify(tuned, null, 1)}\n`);
fs.writeFileSync('game/docs/apprentissage.md', `${lines.join('\n')}\n`);
console.log(`Terminé en ${elapsed()} : game/ai/styles.json et game/docs/apprentissage.md`);
for (const w of workers) await w.terminate();
