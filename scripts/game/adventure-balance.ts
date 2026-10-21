// Difficulté de l'aventure : le deck de départ de l'arc (ST-01), joué par l'IA simple comme par un joueur correct, contre
// l'adversaire de chaque chapitre à son niveau. Le deck du joueur est joué comme un deck personnalisé (c'est un deck
// d'aventure) : l'IA adverse ne connaît pas sa liste, comme dans l'aventure. Premier joueur alterné, graines fixes.
//   node --no-warnings scripts/game/adventure-balance.ts [parties par chapitre] [--chapitres id,id] [--joueur deck]
//     [--niveau n] [--recrues] [--fils n] [--rapport fichier.md]
// --niveau impose un niveau à tous les adversaires (pour comparer la force des listes sans le coût de la simulation).
// --recrues : le deck du joueur reçoit les recrues (cartes données) des chapitres obligatoires d'avant, chacune à la
// place d'un exemplaire de sa carte la plus faible (Karoo, puis Vivi), comme un joueur qui les met dans son deck.
// Niveaux : 1 IA simple ; 2 et 3 IA par simulation avec un nombre FIXE de tirages (16 et 48, ceux de l'interface sans sa
// limite de temps : la partie ne dépend que de la graine) ; 4 IA entraînée (modèle de web/public/rl-model/, celui du
// deck adverse s'il en a un, toujours le choix le plus probable, comme le navigateur ; IA simple faute de modèle).
import '../../game/data/load-local.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { EAST_BLUE } from '../../game/adventure/east-blue.ts';
import type { Chapter } from '../../game/adventure/types.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import type { RlPolicy } from '../../game/ai/rl.ts';
import { LEVELS, mcChoose, type Level } from '../../game/ai/search.ts';
import { CUSTOM_PREFIX, CUSTOM_SERIES, DECKS, type DeckList } from '../../game/engine/decks.ts';
import { actInPlace, newGame } from '../../game/engine/engine.ts';
import type { GameState, PlayerId } from '../../game/engine/types.ts';

interface Job { chapter: string; index: number; seed: number; human: PlayerId; first: PlayerId }
interface Done { chapter: string; index: number; won: boolean; turns: number; error?: string }
interface Setup { player: string; level?: Level; recruits?: boolean }

const MODEL_DIR = 'web/public/rl-model';

// Deck du joueur, comme un deck d'aventure : liste secrète pour l'IA adverse
function playerDeck(id: string, before?: Chapter): DeckList {
  const d = DECKS[id];
  if (!d) throw new Error(`deck inconnu : ${id}`);
  const cards = { ...d.cards };
  if (before) {
    const recruits = EAST_BLUE.chapters.filter((c) => !c.optional && c.order < before.order)
      .flatMap((c) => c.rewards.flatMap((r) => (r.kind === 'card' ? Array(r.count).fill(r.number) as string[] : [])));
    for (const num of recruits) {
      const out = WEAKEST.find((n) => cards[n] > 0);
      if (!out) break;
      cards[out]--;
      if (!cards[out]) delete cards[out];
      cards[num] = (cards[num] ?? 0) + 1;
    }
  }
  return { ...d, id: `${CUSTOM_PREFIX}EQUILIBRAGE-${id}`, series: CUSTOM_SERIES, cards };
}
const WEAKEST = ['ST01-003', 'ST01-009'];

// ---------- Fil de calcul : joue les parties qu'on lui donne ----------

async function worker() {
  const { player, level: forced, recruits } = workerData as Setup;
  const chapters = new Map(EAST_BLUE.chapters.map((c) => [c.id, c]));
  const policies = new Map<string, Promise<RlPolicy | null>>();
  const policyFor = (deck: string) => {
    let p = policies.get(deck);
    if (!p) {
      p = loadPolicy(deck);
      policies.set(deck, p);
    }
    return p;
  };

  async function play(job: Job): Promise<Done> {
    const chapter = chapters.get(job.chapter)!;
    const { deck } = chapter.opponent;
    const level = forced ?? chapter.opponent.level;
    const ai = (job.human === 0 ? 1 : 0) as PlayerId;
    const mine = playerDeck(player, recruits ? chapter : undefined);
    const decks: [DeckList | string, DeckList | string] = job.human === 0 ? [mine, deck] : [deck, mine];
    const policy = level === 4 ? await policyFor(deck) : null;
    const cfg = level === 2 || level === 3 ? { samples: LEVELS[level].samples, margin: LEVELS[level].margin } : null;
    let s: GameState = newGame({ decks, names: ['Joueur', 'Adversaire'], seed: job.seed, first: job.first });
    let guard = 0;
    while (s.winner === null && s.decision) {
      if (++guard > 5000) return { chapter: job.chapter, index: job.index, won: false, turns: s.turn, error: 'partie trop longue' };
      const d = s.decision;
      let choice: string;
      if (d.player !== ai) choice = heuristicChooser(s, d);
      else if (policy && d.options.length > 1) choice = await policy.choose(s, ai, true);
      else if (cfg) choice = mcChoose(s, d, cfg);
      else choice = heuristicChooser(s, d);
      s = actInPlace(s, choice);  // une réponse au milieu d'un effet renvoie un autre état
    }
    return { chapter: job.chapter, index: job.index, won: s.winner === job.human, turns: s.turn };
  }

  parentPort!.on('message', async (job: Job | null) => {
    if (!job) return process.exit(0);
    try {
      parentPort!.postMessage(await play(job));
    } catch (err) {
      parentPort!.postMessage({ chapter: job.chapter, index: job.index, won: false, turns: 0, error: (err as Error).message });
    }
  });
  parentPort!.postMessage('prêt');
}

// Modèle de l'IA entraînée pour ce deck (spécialisé, sinon général), avec onnxruntime-web comme le navigateur
async function loadPolicy(deck: string): Promise<RlPolicy | null> {
  const own = join(MODEL_DIR, 'decks', deck);
  const dir = existsSync(join(own, 'model.onnx')) ? own : MODEL_DIR;
  if (!existsSync(join(dir, 'model.onnx'))) return null;
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const { RlPolicy: Policy } = await import('../../game/ai/rl.ts');
  return Policy.create(ort, readFileSync(join(dir, 'model.onnx')), JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')));
}

// ---------- Fil principal : répartit les parties et fait le bilan ----------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Intervalle de confiance à 95 % d'une proportion (Wilson)
function wilson(wins: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const mid = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z / (1 + (z * z) / n)) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

async function main() {
  const games = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 200);
  const player = arg('--joueur') ?? EAST_BLUE.starterDeck ?? 'ST-01';
  const only = arg('--chapitres')?.split(',');
  const threads = Number(arg('--fils') ?? Math.max(1, Math.min(6, availableParallelism() - 2)));
  const report = arg('--rapport');
  const forced = arg('--niveau') ? (Number(arg('--niveau')) as Level) : undefined;
  const recruits = process.argv.includes('--recrues');
  const chapters = [...EAST_BLUE.chapters].sort((a, b) => a.order - b.order).filter((c) => !only || only.includes(c.id));
  if (!chapters.length) throw new Error('aucun chapitre');
  playerDeck(player);

  const jobs: Job[] = [];
  for (const c of chapters) for (let g = 0; g < games; g++) {
    // même graine pour les deux places : chaque donne est jouée une fois de chaque côté
    jobs.push({ chapter: c.id, index: g, seed: 7700 + Math.floor(g / 2) * 7919 + c.order * 131, human: (g % 2) as PlayerId, first: (Math.floor(g / 2) % 2) as PlayerId });
  }
  const results = new Map<string, Done[]>(chapters.map((c) => [c.id, []]));
  const t0 = Date.now();
  let next = 0;
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let i = 0; i < Math.min(threads, jobs.length); i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { player, level: forced, recruits } satisfies Setup, execArgv: ['--no-warnings'] });
      alive++;
      const feed = () => w.postMessage(next < jobs.length ? jobs[next++] : null);
      w.on('message', (m: Done | 'prêt') => {
        if (m !== 'prêt') {
          results.get(m.chapter)!.push(m);
          done++;
          if (done % 50 === 0) console.error(`${done}/${jobs.length} parties (${Math.round((Date.now() - t0) / 1000)} s)`);
        }
        feed();
      });
      w.on('error', reject);
      w.on('exit', () => { if (--alive === 0) resolve(); });
    }
  });

  const seconds = Math.round((Date.now() - t0) / 1000);
  const lines = [
    `Deck du joueur : ${player}${recruits ? ' avec les recrues des chapitres précédents' : ''} (IA simple), ${games} parties par chapitre, ${seconds} s.`,
    '',
    '| Ordre | Chapitre | Adversaire | Deck | Niveau | Victoires du joueur | Intervalle à 95 % | Tours (moyenne) |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const errors: string[] = [];
  for (const c of chapters as Chapter[]) {
    const r = results.get(c.id)!;
    const wins = r.filter((x) => x.won).length;
    const [lo, hi] = wilson(wins, r.length);
    const turns = r.reduce((sum, x) => sum + x.turns, 0) / Math.max(1, r.length);
    const lv = forced ?? (c.opponent.level as Level);
    const level = LEVELS[lv].name;
    const ai = lv === 4 && !existsSync(join(MODEL_DIR, 'model.onnx')) ? ' (IA simple : pas de modèle)' : '';
    lines.push(`| ${c.order}${c.optional ? ' (défi)' : ''} | ${c.title} | ${c.opponent.name} | ${c.opponent.deck} | ${level}${ai} | ${wins}/${r.length} (${pct(wins / Math.max(1, r.length))}) | ${pct(lo)} à ${pct(hi)} | ${turns.toFixed(1)} |`);
    for (const x of r) if (x.error) errors.push(`${c.id} partie ${x.index} : ${x.error}`);
  }
  if (errors.length) lines.push('', `Parties en erreur (comptées perdues) : ${errors.length}`, ...errors.slice(0, 10).map((e) => `- ${e}`));
  console.log(lines.join('\n'));
  if (report) writeFileSync(report, `${lines.join('\n')}\n`);
}

if (isMainThread) await main();
else await worker();
