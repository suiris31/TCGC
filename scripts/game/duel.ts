// Nouvelle IA simple contre l'ancienne (celle de l'étape A, scripts/old/heuristic-a.ts) :
// - duel direct sur toutes les confrontations, en alternant les camps ;
// - pour chaque deck, comparaison équitable : le deck joué par la nouvelle puis par l'ancienne IA, contre les mêmes
//   adversaires (les 6 decks joués par la nouvelle IA).
//   node --no-warnings scripts/game/duel.ts [parties par confrontation]
import '../../game/data/load-local.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { newGame, type Chooser } from '../../game/engine/engine.ts';
import type { PlayerId } from '../../game/engine/types.ts';
import { heuristicChooser as oldChooser } from './old/heuristic-a.ts';

const games = Number(process.argv[2] ?? 10);
const ids = Object.keys(DECKS);

function play(a: string, b: string, choosers: [Chooser, Chooser], seed: number) {
  return newGame({ decks: [a, b], names: [a, b], seed }, (st, d) => choosers[d.player](st, d)).winner;
}

let newWins = 0;
let total = 0;
for (const a of ids) {
  for (const b of ids) {
    for (let g = 0; g < games; g++) {
      const newSide = (g % 2) as PlayerId;
      const choosers: [Chooser, Chooser] = newSide === 0 ? [heuristicChooser, oldChooser] : [oldChooser, heuristicChooser];
      total++;
      if (play(a, b, choosers, 900 + g * 31 + ids.indexOf(a) * 7 + ids.indexOf(b)) === newSide) newWins++;
    }
  }
}
console.log(`Duel nouvelle IA contre ancienne : ${newWins}/${total} (${Math.round((newWins / total) * 100)} %)`);
console.log('Chaque deck contre les 6 decks joués par la nouvelle IA :');
for (const deck of ids) {
  const rate = (mine: Chooser) => {
    let w = 0;
    let n = 0;
    for (const opp of ids) {
      for (let g = 0; g < games * 2; g++) {
        const side = (g % 2) as PlayerId;
        const choosers: [Chooser, Chooser] = side === 0 ? [mine, heuristicChooser] : [heuristicChooser, mine];
        n++;
        if (play(side === 0 ? deck : opp, side === 0 ? opp : deck, choosers, 4000 + g * 17 + ids.indexOf(opp)) === side) w++;
      }
    }
    return Math.round((w / n) * 100);
  };
  console.log(`  ${deck} ${DECKS[deck].name.padEnd(20)} nouvelle IA ${rate(heuristicChooser)} %, ancienne ${rate(oldChooser)} %`);
}
