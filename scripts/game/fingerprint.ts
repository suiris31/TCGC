// Empreinte de parties IA contre IA (IA simple, graines fixes, toutes les confrontations des decks préconstruits) :
// journal et décisions de chaque partie réduits à une empreinte. Sert à vérifier qu'une modification du moteur ne
// change rien aux decks existants : on compare les empreintes avant et après.
//   npm run game:fingerprint -- [parties par confrontation] [fichier où les écrire] [fichier de référence à comparer]
import '../../game/data/load-local.ts';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { newGame } from '../../game/engine/engine.ts';

const games = Number(process.argv[2] ?? 50);
const out = process.argv[3];
const ref = process.argv[4];

const ids = Object.keys(DECKS);
const result: Record<string, string> = {};
const all = createHash('sha256');
const t0 = Date.now();
for (const a of ids) for (const b of ids) for (let g = 0; g < games; g++) {
  const seed = 9100 + g * 7919 + ids.indexOf(a) * 131 + ids.indexOf(b) * 17;
  const s = newGame({ decks: [a, b], names: [a, b], seed, first: g % 2 === 0 ? 0 : 1 }, heuristicChooser);
  const text = JSON.stringify({ log: s.log, history: s.history, winner: s.winner, reason: s.winReason, turn: s.turn });
  const h = createHash('sha256').update(text).digest('hex').slice(0, 16);
  result[`${a}/${b}/${seed}`] = h;
  all.update(h);
}
console.log(`${Object.keys(result).length} parties en ${Math.round((Date.now() - t0) / 1000)} s, empreinte globale ${all.digest('hex').slice(0, 16)}`);
if (out) writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
if (ref) {
  const before = JSON.parse(readFileSync(ref, 'utf8')) as Record<string, string>;
  const changed = Object.keys(before).filter((k) => k in result && before[k] !== result[k]);
  console.log(`comparées à ${ref} : ${changed.length} partie(s) différente(s)${changed.length ? ` (${changed.slice(0, 5).join(', ')}...)` : ''}`);
  if (changed.length) process.exitCode = 1;
}
