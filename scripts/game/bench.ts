// Mesure la force des niveaux d'IA : node --no-warnings scripts/game/bench.ts [parties] [niveauA] [niveauB] [deckA] [deckB]
import '../../game/data/load-local.ts';
import { aiChoose, type Level } from '../../game/ai/search.ts';
import { newGame } from '../../game/engine/engine.ts';
import type { GameState, PlayerId } from '../../game/engine/types.ts';

const [games = '10', la = '2', lb = '1', deckA = 'ST-35', deckB = 'ST-35'] = process.argv.slice(2);
const levels: [Level, Level] = [Number(la) as Level, Number(lb) as Level];
const wins = [0, 0];
const start = Date.now();
let decisions = 0;
for (let g = 0; g < Number(games); g++) {
  // on alterne qui commence
  const first = (g % 2) as PlayerId;
  const s: GameState = newGame({ decks: [deckA, deckB], names: ['A', 'B'], seed: 1000 + g, first }, (state, d) => {
    decisions++;
    return aiChoose(state, d, levels[d.player]);
  });
  wins[s.winner!]++;
  process.stdout.write(`partie ${g + 1} : ${s.winner === 0 ? 'A' : 'B'} gagne en ${s.turn} tours (${s.winReason})\n`);
}
const seconds = (Date.now() - start) / 1000;
console.log(`A (niveau ${levels[0]}, ${deckA}) ${wins[0]} – ${wins[1]} B (niveau ${levels[1]}, ${deckB}) · ${seconds.toFixed(0)} s, ${(seconds * 1000 / decisions).toFixed(1)} ms par décision`);
