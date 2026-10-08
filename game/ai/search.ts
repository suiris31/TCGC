// IA par simulation (Monte-Carlo avec informations cachées) : pour chaque choix possible, on joue la suite de la
// partie jusqu'au bout plusieurs fois, en redistribuant au hasard les cartes que le joueur ne peut pas connaître,
// et on garde le choix qui gagne le plus souvent. Sert aussi au coach pour évaluer les décisions du joueur.
import { act, type Chooser } from '../engine/engine.ts';
import { shuffle } from '../engine/rng.ts';
import { knows, other } from '../engine/rules.ts';
import type { Card, Decision, GameState, PlayerId } from '../engine/types.ts';
import { heuristicChooser } from './heuristic.ts';
import { uselessReason } from './prune.ts';

export type Level = 1 | 2 | 3;

export const LEVELS: Record<Level, { name: string; samples: number; budgetMs: number; margin: number }> = {
  1: { name: 'Débutant', samples: 0, budgetMs: 0, margin: 0 },
  2: { name: 'Confirmé', samples: 16, budgetMs: 500, margin: 0.06 },
  3: { name: 'Expert', samples: 48, budgetMs: 1800, margin: 0.03 },
};

export interface OptionStat {
  id: string;
  label: string;
  wins: number;
  n: number;
  rate: number;
  refined?: boolean;  // estimée à nouveau avec des simulations indépendantes (voir coachAnalyze)
}

export interface Analysis {
  player: PlayerId;
  stats: OptionStat[];  // du meilleur au moins bon
  best: string;
  heuristic: string;    // choix de l'IA simple, pour comparaison
  samples: number;
  refinedSamples?: number;
  ms: number;
  pruned: { id: string; label: string; reason: string }[];  // choix sans intérêt, non simulés
}

// Redistribue au hasard les cartes cachées de l'adversaire (main, deck, Vie face cachée), sauf celles que le joueur
// connaît (carte du dessus de son deck regardée, cartes révélées : voir rules.ts, reveal), qui restent à leur place
function shuffleOpponent(d: GameState, viewer: PlayerId, keepHand: boolean) {
  const O = d.players[other(viewer)];
  const knownTop = d.peek[viewer] !== null && O.deck[0]?.uid === d.peek[viewer] ? O.deck[0].uid : null;
  const fixed = (c: Card) => c.uid === knownTop || Boolean(c.faceUp) || knows(d, viewer, c.uid);
  const pool = [...(keepHand ? [] : O.hand), ...O.deck, ...O.life].filter((c) => !fixed(c));
  shuffle(d, pool);
  const refill = (cards: Card[]) => cards.map((c) => (fixed(c) ? c : pool.shift()!));
  if (!keepHand) O.hand = refill(O.hand);
  O.deck = refill(O.deck);
  O.life = refill(O.life);
}

// Redistribue son propre deck et sa Vie face cachée (le joueur ne connaît pas leur ordre), sauf les cartes qu'il
// connaît et les `keepTop` cartes du dessus de son deck
function shuffleOwn(d: GameState, viewer: PlayerId, keepTop: number, keepLife: boolean) {
  const P = d.players[viewer];
  const fixedDeck = (c: Card, i: number) => i < keepTop || knows(d, viewer, c.uid);
  const fixedLife = (c: Card) => keepLife || Boolean(c.faceUp) || knows(d, viewer, c.uid);
  const own = [...P.deck.filter((c, i) => !fixedDeck(c, i)), ...P.life.filter((c) => !fixedLife(c))];
  shuffle(d, own);
  P.life = P.life.map((c) => (fixedLife(c) ? c : own.shift()!));
  P.deck = P.deck.map((c, i) => (fixedDeck(c, i) ? c : own.shift()!));
}

// Ce que voit un joueur : sa main, le terrain, les cartes de Vie face visible et la carte du deck adverse qu'il a
// regardée. Le reste est redistribué au hasard entre les zones cachées concernées.
export function determinize(s: GameState, viewer: PlayerId, seed: number): GameState {
  const d = structuredClone(s);
  d.rng = seed | 0;
  shuffleOpponent(d, viewer, false);
  shuffleOwn(d, viewer, 0, false);
  // Décision au milieu d'un effet : la suite se rejoue depuis l'instantané pris au début de l'effet, qu'on redistribue
  // aussi, sans toucher aux cartes que les réponses déjà données peuvent désigner (dessus de son deck, sa Vie, main
  // adverse si l'adversaire y a choisi une carte)
  const p = d.pending[0];
  if (d.decision?.inEffect && p?.snapshot) {
    const snap = JSON.parse(p.snapshot) as GameState;
    snap.rng = (seed * 31 + 7) | 0;
    const named = new Set(p.answers.flatMap((a) => (/^[a-z]+:\d+$/i.test(a) ? [Number(a.split(':')[1])] : [])));
    shuffleOpponent(snap, viewer, snap.players[other(viewer)].hand.some((c) => named.has(c.uid)));
    shuffleOwn(snap, viewer, 6, true);
    p.snapshot = JSON.stringify(snap);
  }
  d.log = [];
  d.history = [];
  return d;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface AnalyzeOptions {
  samples: number;
  budgetMs?: number;
  minSamples?: number;
  seed?: number;
  rollout?: Chooser;
  only?: string[];   // n'évaluer que ces options
  prune?: boolean;   // écarter les choix sans intérêt (par défaut)
}

// Évalue chaque option de la décision en cours, du point de vue du joueur qui décide
export function analyze(s: GameState, opts: AnalyzeOptions): Analysis {
  const d = s.decision as Decision;
  const viewer = d.player;
  const rollout = opts.rollout ?? heuristicChooser;
  const pruned: Analysis['pruned'] = [];
  const candidates = d.options.filter((o) => {
    if (opts.only) return opts.only.includes(o.id);
    const reason = opts.prune === false ? null : uselessReason(s, d, o);
    if (reason) pruned.push({ id: o.id, label: o.label, reason });
    return !reason;
  });
  const stats: OptionStat[] = candidates.map((o) => ({ id: o.id, label: o.label, wins: 0, n: 0, rate: 0 }));
  const start = now();
  const seed = opts.seed ?? (s.rng ^ 0x5bd1e995);
  const minSamples = opts.minSamples ?? 4;
  let samples = 0;
  for (let i = 0; i < opts.samples; i++) {
    if (opts.budgetMs && i >= minSamples && now() - start > opts.budgetMs) break;
    const base = determinize(s, viewer, seed + i * 7919);
    // les options sont jouées sur la même redistribution ; un tirage où une suite a divergé (réponse rejouée devenue
    // impossible) est écarté pour toutes les options
    let wins: boolean[];
    try {
      wins = stats.map((stat) => act(base, stat.id, rollout).winner === viewer);
    } catch {
      continue;
    }
    stats.forEach((stat, k) => {
      stat.n++;
      if (wins[k]) stat.wins++;
    });
    samples++;
  }
  for (const stat of stats) stat.rate = stat.n ? stat.wins / stat.n : 0;
  const heuristic = heuristicChooser(s, d);
  stats.sort((a, b) => b.rate - a.rate || Number(b.id === heuristic) - Number(a.id === heuristic));
  return { player: viewer, stats, best: stats[0]?.id ?? heuristic, heuristic, samples, ms: Math.round(now() - start), pruned };
}

export interface CoachOptions {
  samples: number;
  budgetMs: number;
  minSamples: number;
  refineSamples: number;
  refineBudgetMs: number;
  refineMin: number;
  include?: string;  // option à réévaluer en tout cas (le choix du joueur)
  seed?: number;
}

// Analyse du coach en deux temps : toutes les options utiles, puis de nouvelles simulations, indépendantes des premières,
// pour les 3 meilleures et pour le choix du joueur. Sans ce deuxième temps, l'option qui a eu le plus de chance au
// premier tour paraîtrait meilleure qu'elle n'est (d'autant plus qu'il y a d'options).
export function coachAnalyze(s: GameState, opts: CoachOptions): Analysis {
  const seed = opts.seed ?? (s.rng ^ 0x5bd1e995);
  const first = analyze(s, { samples: opts.samples, budgetMs: opts.budgetMs, minSamples: opts.minSamples, seed });
  const top = first.stats.slice(0, 3).map((x) => x.id);
  if (opts.include && !top.includes(opts.include) && s.decision!.options.some((o) => o.id === opts.include)) top.push(opts.include);
  if (top.length < 2) return first;
  const second = analyze(s, { samples: opts.refineSamples, budgetMs: opts.refineBudgetMs, minSamples: opts.refineMin, seed: seed + 104729, only: top });
  const stats = [...second.stats.map((x) => ({ ...x, refined: true })), ...first.stats.filter((x) => !top.includes(x.id))];
  return {
    ...first,
    stats,
    best: stats[0].id,
    refinedSamples: second.samples,
    ms: first.ms + second.ms,
    pruned: first.pruned.filter((x) => !top.includes(x.id)),
  };
}

// Choix de l'IA selon son niveau. Les petites décisions au milieu d'un effet restent à l'IA simple ; quand la
// simulation ne départage pas nettement, le choix de bon sens est gardé (moins de coups bizarres dus au hasard).
export function aiChoose(s: GameState, d: Decision, level: Level): string {
  if (level === 1) return heuristicChooser(s, d);
  return mcChoose(s, d, LEVELS[level]);
}

// Choix Monte-Carlo (niveaux 2 et 3). Sans budgetMs, le nombre de tirages est fixe : le choix ne dépend que de l'état,
// ce qui rend reproductibles les parties d'entraînement et d'évaluation de l'IA par apprentissage (game/rl/).
export function mcChoose(s: GameState, d: Decision, cfg: { samples: number; budgetMs?: number; margin: number }): string {
  if (d.inEffect || d.options.length === 1 || s.decision !== d) return heuristicChooser(s, d);
  const analysis = analyze(s, { samples: cfg.samples, budgetMs: cfg.budgetMs });
  const best = analysis.stats[0];
  if (!best) return analysis.heuristic;
  const fallback = analysis.stats.find((x) => x.id === analysis.heuristic);
  if (fallback && fallback.rate >= best.rate - cfg.margin) return fallback.id;
  return best.id;
}
