import '../../game/data/load-local.ts';
import { newGame } from '../../game/engine/engine.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
const [a, b, seed] = process.argv.slice(2);
const s = newGame({ decks: [a, b], names: [a, b], seed: Number(seed ?? 1), first: 0 }, heuristicChooser);
for (const e of s.log) console.log(`${e.turn} ${e.player === null ? '--' : s.players[e.player].name}${e.only !== undefined ? ' (secret)' : ''} : ${e.text}`);
console.log('Gagnant :', s.winner === null ? '?' : s.players[s.winner].name, s.winReason);
