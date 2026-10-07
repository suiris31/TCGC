// Parties rapides IA simple contre IA simple sur toutes les confrontations : vérifie qu'aucune partie ne plante et
// donne les taux de victoire. node --no-warnings scripts/game/smoke.ts [parties par confrontation]
import '../../game/data/load-local.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { newGame } from '../../game/engine/engine.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';

const games = Number(process.argv[2] ?? 4);
const ids = Object.keys(DECKS);
const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
const played: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
let errors = 0;
let turns = 0;
let total = 0;
const t0 = Date.now();
for (const a of ids) {
  for (const b of ids) {
    for (let g = 0; g < games; g++) {
      const seed = 1000 + g * 7919 + ids.indexOf(a) * 31 + ids.indexOf(b);
      try {
        const s = newGame({ decks: [a, b], names: [a, b], seed, first: g % 2 === 0 ? 0 : 1 }, heuristicChooser);
        total++;
        turns += s.turn;
        played[a]++;
        played[b]++;
        wins[s.winner === 0 ? a : b]++;
      } catch (err) {
        errors++;
        console.error(`${a} contre ${b} (graine ${seed}) :`, err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : err);
      }
    }
  }
}
console.log(`${total} parties en ${Date.now() - t0} ms, ${errors} erreur(s), ${(turns / Math.max(1, total)).toFixed(1)} tours en moyenne`);
for (const id of ids) console.log(`${id} ${DECKS[id].name.padEnd(20)} ${((wins[id] / Math.max(1, played[id])) * 100).toFixed(0)} % de victoires`);
