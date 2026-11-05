// Parties au hasard (tâche C1.3, banc d'essai, volet 2) : decks légaux tirés au hasard parmi toutes les cartes jouables
// (en option : les cartes « generated » de sets visés, essayées avant d'être rendues jouables), IA contre IA,
// contrôles de cohérence à chaque décision. Rapport par carte : decks et parties où elle était, fois où un de ses effets
// s'est déclenché, erreurs dont elle est soupçonnée.
import { CARDS, cardStatus, HIDDEN, playableCards } from '../cards/index.ts';
import { heuristicChooser } from '../../ai/heuristic.ts';
import { DECK_SIZE, MAX_COPIES, playableErrors } from '../deckRules.ts';
import { CUSTOM_SERIES, type DeckList } from '../decks.ts';
import { newGame } from '../engine.ts';
import { invariantErrors } from '../invariants.ts';
import type { CardBehavior, EffectCtx, GameEvent } from '../types.ts';
import { currentBehavior, installBehavior } from './bench.ts';
import { compileRecipe } from './compile.ts';
import { RECIPE_SETS } from './sets/index.ts';
import { setOf } from './sets/ORDER.ts';

export interface FuzzOptions {
  games: number;
  sets?: string[];              // préfixes visés : leurs Leaders d'abord, et leurs cartes en majorité dans les decks
  generated?: boolean;          // ajouter les cartes « generated » des sets visés (recettes compilées)
  seed?: number;
  random?: boolean;             // choix des effets au hasard (plus de chemins essayés)
  force?: string[];             // cartes mises en 4 exemplaires dans chaque deck (essai d'une carte précise)
  onGame?: (i: number) => void; // avancement
}

export interface CardStats { decks: number; games: number; triggered: number; errors: number }
export interface FuzzFailure { game: number; seed: number; decks: [string, string]; message: string; suspects: string[] }
export interface FuzzReport {
  games: number;
  turns: number;                // tours joués en tout (une partie trop courte n'essaie pas grand-chose)
  failures: FuzzFailure[];
  cards: Record<string, CardStats>;
  notCompiled: string[];        // cartes « generated » dont la recette ne se compile pas
}

const EFFECT_KEYS = ['onPlay', 'whenAttacking', 'onKO', 'endOfTurn', 'onMain', 'onCounter', 'onTrigger'] as const;

export function fuzz(opts: FuzzOptions): FuzzReport {
  let seed = opts.seed ?? 20261105;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const report: FuzzReport = { games: 0, turns: 0, failures: [], cards: {}, notCompiled: [] };
  const stats = (n: string) => (report.cards[n] ??= { decks: 0, games: 0, triggered: 0, errors: 0 });
  const restores: (() => void)[] = [];
  const inSets = (n: string) => !opts.sets?.length || opts.sets.includes(setOf(n));

  // cartes « generated » des sets visés : recette compilée installée le temps des parties
  const extra: string[] = [];
  if (opts.generated) {
    for (const set of RECIPE_SETS) {
      for (const [num, e] of Object.entries(set.entries)) {
        if (e.level !== 'generated' || !e.recipe || !CARDS[num] || !inSets(num)) continue;
        const c = compileRecipe(e.recipe);
        if (!c.ok) { report.notCompiled.push(num); continue; }
        restores.push(installBehavior(num, c.behavior));
        extra.push(num);
      }
    }
  }
  const playable = [...new Set([...playableCards().filter((n) => n !== HIDDEN && CARDS[n] && cardStatus(n) !== 'todo'), ...extra])];

  // chaque effet compté et surveillé : la carte dont l'effet tourne est soupçonnée si la partie devient incohérente
  let recent = new Set<string>();
  let thrower: string | null = null;
  const wrap = <A extends unknown[]>(num: string, f: (...a: A) => void) => (...a: A) => {
    stats(num).triggered++;
    recent.add(num);
    try {
      f(...a);
    } catch (err) {
      thrower ??= num;
      throw err;
    }
  };
  for (const num of playable) {
    const b = currentBehavior(num);
    const w: CardBehavior = { ...b };
    let touched = false;
    for (const k of EFFECT_KEYS) if (b[k]) { w[k] = wrap(num, b[k] as (ctx: EffectCtx) => void); touched = true; }
    if (b.activateMain) { w.activateMain = { ...b.activateMain, run: wrap(num, b.activateMain.run) }; touched = true; }
    if (b.onOpponentAttack) { w.onOpponentAttack = { ...b.onOpponentAttack, run: wrap(num, b.onOpponentAttack.run) }; touched = true; }
    if (b.when) { w.when = b.when.map((x) => ({ ...x, run: wrap(num, x.run as (ctx: EffectCtx, e: GameEvent) => void) })); touched = true; }
    if (touched) restores.push(installBehavior(num, w));
  }

  try {
    const leaders = playable.filter((n) => CARDS[n].category === 'LEADER' && !n.startsWith('AV-'));
    const targetLeaders = leaders.filter(inSets);
    const force = opts.force ?? [];
    const pickLeader = () => {
      const fit = force.length ? leaders.filter((l) => force.every((n) => CARDS[n].colors.every((c) => CARDS[l].colors.includes(c)))) : [];
      const list = fit.length ? fit : targetLeaders.length && rand() < 0.7 ? targetLeaders : leaders;
      return list[Math.floor(rand() * list.length)];
    };
    const randomDeck = (leader: string, k: number): DeckList => {
      const L = CARDS[leader];
      const pool = playable.filter((n) => {
        const d = CARDS[n];
        return d.category !== 'LEADER' && d.colors.length > 0 && d.colors.every((c) => L.colors.includes(c)) && !L.rules?.deckRestriction?.(d);
      });
      const focus = pool.filter(inSets);
      const cards: Record<string, number> = {};
      let total = 0;
      for (const n of force) if (pool.includes(n)) { cards[n] = MAX_COPIES; total += MAX_COPIES; }
      for (let guard = 0; total < DECK_SIZE && guard < 10000; guard++) {
        const from = focus.length && opts.sets?.length && rand() < 0.6 ? focus : pool;
        const n = from[Math.floor(rand() * from.length)];
        const add = Math.min(MAX_COPIES - (cards[n] ?? 0), 2 + Math.floor(rand() * 3), DECK_SIZE - total);
        if (add <= 0) continue;
        cards[n] = (cards[n] ?? 0) + add;
        total += add;
      }
      return { id: `PERSO-hasard${k}`, name: `Hasard ${k}`, series: CUSTOM_SERIES, leader, cards };
    };

    for (let g = 0; g < opts.games; g++) {
      opts.onGame?.(g);
      const decks = [randomDeck(pickLeader(), 2 * g), randomDeck(pickLeader(), 2 * g + 1)] as [DeckList, DeckList];
      for (const d of decks) {
        const errors = playableErrors(d.leader, d.cards).filter((e) => !extra.some((n) => e.includes(n)));
        if (errors.length || Object.values(d.cards).reduce((a, b) => a + b, 0) !== DECK_SIZE) {
          report.failures.push({ game: g, seed: 0, decks: [decks[0].leader, decks[1].leader], message: `deck illégal : ${errors.join(' ; ')}`, suspects: [] });
        }
      }
      const inGame = new Set(decks.flatMap((d) => [d.leader, ...Object.keys(d.cards)]));
      for (const d of decks) for (const n of [d.leader, ...Object.keys(d.cards)]) stats(n).decks++;
      for (const n of inGame) stats(n).games++;
      const gameSeed = Math.floor(rand() * 2 ** 31);
      recent = new Set();
      thrower = null;
      try {
        const end = newGame({ decks, names: ['A', 'B'], seed: gameSeed, first: g % 2 ? 1 : 0 }, (st, d) => {
          if (!d.inEffect) {
            const bad = invariantErrors(st);
            if (bad.length) throw new Error(`incohérence : ${bad.join(' ; ')}`);
            recent = new Set();
          }
          const ai = heuristicChooser(st, d);
          if (!d.options.some((o) => o.id === ai)) throw new Error(`réponse de l'IA hors des choix : ${ai} (${d.tag ?? d.kind})`);
          return opts.random && (d.kind === 'effect' || rand() < 0.3) ? d.options[Math.floor(rand() * d.options.length)].id : ai;
        });
        if (end.winner === null) throw new Error('partie inachevée');
        report.games++;
        report.turns += end.turn;
      } catch (err) {
        report.games++;
        const suspects = thrower ? [thrower] : [...recent];
        for (const n of suspects) stats(n).errors++;
        report.failures.push({
          game: g, seed: gameSeed, decks: [decks[0].leader, decks[1].leader], suspects,
          message: err instanceof Error ? err.message.split('\n')[0] : String(err),
        });
      }
    }
  } finally {
    for (const r of restores.reverse()) r();
  }
  return report;
}
