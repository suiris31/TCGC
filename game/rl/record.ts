// Trajectoires : une partie de l'environnement enregistrée pour être rejouée et analysée après coup.
//
// Une trajectoire contient la graine, les decks, le premier joueur, le contrôleur de chaque siège, la version du
// moteur, l'empreinte de l'encodage et le modèle utilisé, puis chaque décision appliquée (joueur, choix) avec, pour
// les décisions du modèle, la probabilité qu'il donnait à chaque option et sa valeur estimée. Le moteur étant
// déterministe, la partie se rejoue exactement (replayTrajectory) : on retrouve chaque état intermédiaire, le journal
// complet et les options de chaque décision.
//
// toGameRecord la convertit au format des parties de l'interface (coach/archive.ts) : le fichier s'importe dans
// « Mes parties » (bouton d'import) pour revoir la partie coup par coup dans le simulateur.
import { buildRecord, type GameRecord } from '../coach/archive.ts';
import type { Move } from '../coach/review.ts';
import { act, newGame } from '../engine/engine.ts';
import { def } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { SPEC_HASH } from './encode.ts';
import type { ResetOptions, Result, Step } from './env.ts';
import type { SeatSpec } from './opponents.ts';

export const TRAJECTORY_FORMAT = 'opcg-rl-trajectory';

export interface Trajectory {
  format: typeof TRAJECTORY_FORMAT;
  version: 1;
  engine: string;                       // version du programme (git describe)
  specHash: string;                     // empreinte de l'encodage des observations
  models?: [string | null, string | null];  // modèle de chaque siège piloté par le modèle (nom + empreinte)
  seed: number;
  decks: [string, string];
  first: PlayerId | 'random';           // option donnée à newGame
  wentFirst: PlayerId;                  // joueur qui a effectivement commencé
  seats: [SeatSpec, SeatSpec];
  maxDecisions?: number;
  steps: Step[];
  result: Result;
  createdAt: string;
}

export function makeTrajectory(opts: ResetOptions, state: GameState, steps: Step[], result: Result, engine: string,
  models?: [string | null, string | null], createdAt = new Date().toISOString()): Trajectory {
  return {
    format: TRAJECTORY_FORMAT, version: 1, engine, specHash: SPEC_HASH, models, seed: opts.seed, decks: opts.decks,
    first: opts.first ?? 'random', wentFirst: state.first, seats: opts.seats, maxDecisions: opts.maxDecisions, steps,
    result, createdAt,
  };
}

export interface Replayed {
  initial: GameState;
  states: GameState[];  // état au moment de chaque décision (states[i] : avant steps[i])
  final: GameState;
}

// Rejoue la trajectoire avec le moteur actuel. Échoue si la partie ne se rejoue plus à l'identique (moteur modifié).
export function replayTrajectory(t: Trajectory): Replayed {
  const initial = newGame({ decks: t.decks, names: ['Joueur 1', 'Joueur 2'], seed: t.seed, first: t.first });
  const states: GameState[] = [];
  let s = initial;
  for (const [i, step] of t.steps.entries()) {
    const d = s.decision;
    if (!d || d.player !== step.p || !d.options.some((o) => o.id === step.c)) {
      throw new Error(`la trajectoire ne se rejoue plus à l'identique à la décision ${i + 1} (programme modifié depuis ?)`);
    }
    states.push(s);
    s = act(s, step.c);
  }
  if (!t.result.truncated && !t.result.error && s.winner !== t.result.winner) {
    throw new Error(`résultat différent au rejeu : gagnant ${s.winner} au lieu de ${t.result.winner}`);
  }
  return { initial, states, final: s };
}

// Récit lisible de la partie : journal du moteur, et pour chaque décision du modèle les options avec leur probabilité
export function narrate(t: Trajectory, opts: { seat?: PlayerId; top?: number } = {}): string {
  const { states, final } = replayTrajectory(t);
  const lines: string[] = [];
  const name = (p: PlayerId) => `J${p + 1} (${t.seats[p].kind}, ${def(final.players[p].leader.num).name})`;
  lines.push(`Graine ${t.seed} · ${t.decks[0]} contre ${t.decks[1]} · ${name(t.wentFirst)} commence · moteur ${t.engine}`);
  let logAt = 0;
  for (const [i, step] of t.steps.entries()) {
    const s = states[i];
    for (const l of s.log.slice(logAt)) lines.push(`  [T${l.turn}] ${l.player === null ? '' : `J${l.player + 1} `}${l.text}`);
    logAt = s.log.length;
    if (step.by !== 'agent' || (opts.seat !== undefined && step.p !== opts.seat)) continue;
    const d = s.decision!;
    lines.push(`> J${step.p + 1} décide (${d.kind}${d.tag ? `, ${d.tag}` : ''}) : ${d.prompt}${step.value !== undefined ? `  [valeur estimée ${step.value.toFixed(2)}]` : ''}`);
    const ranked = d.options.map((o, k) => ({ o, p: step.probs?.[k] })).sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
    for (const { o, p } of ranked.slice(0, opts.top ?? 8)) {
      lines.push(`    ${o.id === step.c ? '→' : ' '} ${p === undefined ? '   ' : `${(p * 100).toFixed(1).padStart(5)} %`}  ${o.label}`);
    }
    if (ranked.length > (opts.top ?? 8)) lines.push(`      ... ${ranked.length - (opts.top ?? 8)} autres options`);
  }
  for (const l of final.log.slice(logAt)) lines.push(`  [T${l.turn}] ${l.player === null ? '' : `J${l.player + 1} `}${l.text}`);
  const r = t.result;
  lines.push(r.error ? `Erreur du moteur : ${r.error}` : r.truncated ? `Partie tronquée (${r.reason})` : `Gagnant : ${name(r.winner!)} (${r.reason})`);
  return lines.join('\n');
}

// Partie au format de l'interface (« Mes parties ») vue depuis le siège `seat`
export function toGameRecord(t: Trajectory, seat: PlayerId): GameRecord {
  const initial = newGame({ decks: t.decks, names: [seat === 0 ? 'IA entraînée' : 'Adversaire', seat === 1 ? 'IA entraînée' : 'Adversaire'], seed: t.seed, first: t.first });
  const moves: Move[] = [];
  let s = initial;
  for (const step of t.steps) {
    if (step.p === seat && step.by !== 'forced') moves.push({ id: moves.length + 1, state: s, choice: step.c });
    s = act(s, step.c);
  }
  const date = new Date(t.createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  return buildRecord({
    id: `${stamp}_${t.decks[seat]}-contre-${t.decks[1 - seat]}_rl-${t.seed}`,
    engine: t.engine,
    startedAt: t.createdAt,
    now: t.createdAt,
    endedAt: t.createdAt,
    config: { myDeck: t.decks[seat], aiDeck: t.decks[1 - seat], level: 0, first: t.wentFirst === seat ? 'me' : 'ai' },
    human: seat,
    initial,
    current: s,
    moves,
    reviews: new Map(),
    extra: new Map(),
    undos: [],
    abandoned: s.winner === null,
  });
}
