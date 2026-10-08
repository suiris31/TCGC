// Rejoue une trajectoire enregistrée et la raconte : journal de la partie et, à chaque décision du modèle, ses options
// avec la probabilité qu'il leur donnait et sa valeur estimée.
//   node --no-warnings game/rl/replay.ts trajectoire.json [--seat 0|1] [--top 8] [--record partie.json] [--catalog f]
// --record écrit la partie au format de l'interface : à importer dans « Mes parties » pour la revoir coup par coup.
import { readFileSync, writeFileSync } from 'node:fs';
import type { PlayerId } from '../engine/types.ts';
import { loadRlCatalog } from './catalog.ts';
import { narrate, toGameRecord, type Trajectory } from './record.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
const file = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!file) {
  console.error('usage : node --no-warnings game/rl/replay.ts trajectoire.json [--seat 0|1] [--top 8] [--record partie.json]');
  process.exit(2);
}
loadRlCatalog(opt('--catalog'));
const t = JSON.parse(readFileSync(file, 'utf8')) as Trajectory;
const seat = opt('--seat') !== undefined ? (Number(opt('--seat')) as PlayerId) : undefined;
console.log(narrate(t, { seat, top: Number(opt('--top') ?? 8) }));
const out = opt('--record');
if (out) {
  const agentSeat = seat ?? (t.seats[0].kind === 'agent' ? 0 : 1);
  writeFileSync(out, JSON.stringify(toGameRecord(t, agentSeat)));
  console.log(`\nPartie au format de l'interface : ${out} (Jouer → Mes parties → importer)`);
}
