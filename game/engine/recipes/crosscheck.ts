// Comparaison « code à la main ↔ recette compilée » (tâche C1.3, banc d'essai, volet 3 ; d'après l'étude C0 § 4).
// Deux comportements d'une même carte sont joués dans les mêmes situations tirées au hasard (mêmes graines), l'IA
// heuristique répond aux questions, et l'état de la partie après l'effet est comparé (mains, terrains, Vies, Défausses,
// ordre du deck, DON!!, modificateurs). L'étude y a trouvé une erreur dans chaque sens en une journée : c'est l'outil
// principal de l'audit des cartes codées (CF.2).
import { CARDS } from '../cards/index.ts';
import { heuristicChooser } from '../../ai/heuristic.ts';
import { DECKS } from '../decks.ts';
import { random } from '../rng.ts';
import type { CardBehavior, GameState } from '../types.ts';
import {
  buildSituation, drive, DRIVEN_TIMINGS, emptySide, hasTiming, inertPool, locate, withBehavior, type Chooser, type SituationSpec,
} from './bench.ts';
import type { Recipe, Timing } from './types.ts';

export interface CompareResult {
  num: string;
  compared: number;             // situations jouées avec les deux comportements
  differ: string[];             // « onPlay graine 5097 » : situations où l'état diffère
  unplayable: number;           // situations où la carte n'a pas pu être jouée (par l'un des deux)
}

// Contrôle de sensibilité : chaque nombre de la recette décalé (un chiffre faux doit se voir)
export function mutateRecipe(r: Recipe): Recipe {
  const keys = ['n', 'amount', 'costMax', 'powerMax', 'look', 'take', 'count', 'costMin', 'powerMin', 'basePowerMax', 'basePowerMin', 'value'];
  return JSON.parse(JSON.stringify(r), (k, v) => (typeof v === 'number' && keys.includes(k)
    ? (k === 'amount' || k === 'value' || k.toLowerCase().includes('power') ? v + 1000 : v + 1) : v)) as Recipe;
}

// État comparé après l'effet
function snapshot(s: GameState): string {
  const nums = (l: { num: string }[]) => l.map((c) => c.num).sort().join(',');
  return JSON.stringify({
    players: s.players.map((P) => ({
      hand: nums(P.hand), chars: P.chars.map((c) => `${c.num}${c.rested ? 'R' : ''}${c.don}`).sort().join(','),
      life: P.life.map((c) => c.num).join(','), trash: nums(P.trash), deck: P.deck.map((c) => c.num).join(','),
      leader: `${P.leader.rested}${P.leader.don}`, stage: P.stage?.num ?? '', don: [P.donActive, P.donRested, P.donDeck],
    })),
    mods: s.mods.map((m) => `${m.stat}:${m.keyword ?? ''}:${m.amount}:${typeof m.until === 'number' ? m.until - s.turn : m.until}`).sort().join(','),
    delayed: s.delayed.length,
    winner: s.winner,
  });
}

// Situation tirée au hasard pour une carte et un moment : terrains, mains, Vies et Défausses variés (cartes inertes),
// le Leader d'un deck préconstruit qui contient la carte s'il y en a un (conditions de Leader), sinon un Leader inerte
function randomSituation(num: string, timing: Timing, seed: number): SituationSpec {
  const pool = inertPool();
  const state = { rng: seed } as GameState;
  const r = (n: number) => Math.floor(random(state) * n);
  const pick = () => pool.chars[r(pool.chars.length)];
  const d = CARDS[num];
  const deck = Object.values(DECKS).find((x) => x.leader === num || x.cards[num]);
  const leader = d.category === 'LEADER' ? num : deck?.leader ?? pool.leaders[0];
  const me = emptySide(leader);
  const op = emptySide(pool.leaders[1] ?? pool.leaders[0]);
  const inHand = timing === 'onPlay' || timing === 'main' || timing === 'counter';
  me.hand = [...(inHand ? [num] : []), ...Array.from({ length: 1 + r(5) }, pick)];
  op.hand = Array.from({ length: 2 + r(4) }, pick);
  me.chars = Array.from({ length: r(4) }, () => ({ num: pick(), rested: r(3) === 0 }));
  op.chars = Array.from({ length: 1 + r(4) }, () => ({ num: pick(), rested: r(2) === 0 }));
  const onField = timing === 'activateMain' || timing === 'whenAttacking' || timing === 'endOfTurn';
  if (onField && d.category === 'CHARACTER') me.chars.unshift({ num, rested: false, don: r(3) });
  if (onField && d.category === 'STAGE') me.stage = num;
  if (onField && d.category === 'LEADER') me.leaderDon = r(3);
  me.life = [...(timing === 'trigger' ? [num] : []), ...Array.from({ length: 1 + r(5) }, pick)];
  op.life = Array.from({ length: 1 + r(5) }, pick);
  me.trash = [...Array.from({ length: r(5) }, pick), ...(timing === 'onKO' ? [num] : [])];
  op.trash = Array.from({ length: r(3) }, pick);
  me.donActive = Math.max(7, (inHand ? d.cost ?? 0 : 0) + r(3));
  me.donRested = r(2);
  op.donActive = 3 + r(5);
  if (timing === 'counter' || timing === 'trigger') op.chars = [...op.chars.slice(0, 4), { num: pick() }];
  return { sides: [me, op], active: timing === 'counter' || timing === 'trigger' ? 1 : 0, filler: [pool.chars[0], pool.chars[0]], seed };
}

function runOnce(num: string, b: CardBehavior, s0: GameState, timing: Timing, chooser: Chooser): string | null {
  const self = locate(s0, num);
  if (self === null) return null;
  const res = withBehavior(num, b, () => drive(s0, timing, self, chooser, s0.players[1].chars.at(-1)?.uid));
  return res.ran ? snapshot(res.state) : null;
}

// Compare deux comportements d'une carte, moment par moment (ceux que les deux codent, ou ceux demandés)
export function compareBehaviors(num: string, a: CardBehavior, b: CardBehavior, opts: { situations?: number; seed?: number; timings?: Timing[]; chooser?: Chooser } = {}): CompareResult {
  const runs = opts.situations ?? 20;
  const chooser = opts.chooser ?? heuristicChooser;
  const timings = (opts.timings ?? DRIVEN_TIMINGS).filter((t) => hasTiming(a, t) || hasTiming(b, t));
  const out: CompareResult = { num, compared: 0, differ: [], unplayable: 0 };
  for (const timing of timings) {
    for (let k = 0; k < runs; k++) {
      const seed = (opts.seed ?? 5000) + k * 97;
      const s0 = withBehavior(num, a, () => {
        const s = buildSituation(randomSituation(num, timing, seed));
        if (timing === 'counter' || timing === 'trigger') {
          const atk = s.players[1].chars.at(-1);
          if (atk) s.mods.push({ uid: atk.uid, stat: 'power', amount: 20000, until: 'turn', source: 'banc d’essai' });
        }
        return s;
      });
      const x = runOnce(num, a, s0, timing, chooser);
      const y = runOnce(num, b, s0, timing, chooser);
      if (x === null || y === null) {
        out.unplayable++;
        if ((x === null) !== (y === null)) out.differ.push(`${timing} graine ${seed} : jouable avec un seul des deux`);
        continue;
      }
      out.compared++;
      if (x !== y) out.differ.push(`${timing} graine ${seed}`);
    }
  }
  return out;
}
