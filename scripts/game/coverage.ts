// Rapport de couverture des cartes : combien sont jouables (codées, ou jouables d'office : aucun effet, seulement des
// mots-clés), par couleur, par extension, par type, et quels Leaders. Sert à choisir où ajouter des cartes pour que
// la construction de decks ait de vrais choix.
//   npm run game:coverage [-- --format standard]
import '../../game/data/load-local.ts';
import { CARDS, cardStatus, HIDDEN, type CardStatus } from '../../game/engine/cards/index.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { COLOR_LABEL } from '../../game/ui/labels.ts';

const standardOnly = process.argv.includes('standard');
// Format Standard (depuis avril 2026) : blocs 2 à 5 (une carte l'est si une de ses impressions l'est)
const STANDARD_BLOCKS = ['2', '3', '4', '5'];

const cards = Object.values(CARDS).filter((d) => d.number !== HIDDEN && (!standardOnly || d.blocks.some((b) => STANDARD_BLOCKS.includes(b))));
const statusOf = new Map(cards.map((d) => [d.number, cardStatus(d.number)]));

type Row = Record<CardStatus, number>;
const empty = (): Row => ({ coded: 0, auto: 0, todo: 0 });
function tally(key: (d: (typeof cards)[number]) => string[]) {
  const m = new Map<string, Row>();
  for (const d of cards) for (const k of key(d)) {
    const r = m.get(k) ?? empty();
    r[statusOf.get(d.number)!]++;
    m.set(k, r);
  }
  return m;
}
const pct = (r: Row) => {
  const total = r.coded + r.auto + r.todo;
  return total ? Math.round(((r.coded + r.auto) / total) * 100) : 0;
};
function table(title: string, m: Map<string, Row>, limit = Infinity) {
  console.log(`\n## ${title}\n\n| | Codées | D'office | À faire | Jouables |\n|---|---|---|---|---|`);
  [...m].sort((a, b) => (b[1].coded + b[1].auto) - (a[1].coded + a[1].auto) || a[0].localeCompare(b[0])).slice(0, limit)
    .forEach(([k, r]) => console.log(`| ${k} | ${r.coded} | ${r.auto} | ${r.todo} | ${pct(r)} % |`));
}

const total = tally(() => ['toutes']).get('toutes')!;
console.log(`# Couverture des cartes${standardOnly ? ' (format Standard)' : ''}\n`);
console.log(`${cards.length} cartes : ${total.coded} codées, ${total.auto} jouables d'office, ${total.todo} à faire (${pct(total)} % jouables).`);
table('Par couleur', tally((d) => d.colors.map((c) => COLOR_LABEL[c])));
table('Par catégorie', tally((d) => [d.category]));
table('Par extension', tally((d) => [d.number.split('-')[0]]));
table('Par type (20 premiers)', tally((d) => d.typeLabels), 20);

const leaders = cards.filter((d) => d.category === 'LEADER' && statusOf.get(d.number) !== 'todo');
console.log(`\n## Leaders jouables (${leaders.length})\n`);
for (const d of leaders) console.log(`- ${d.name} (${d.number}, ${d.colors.map((c) => COLOR_LABEL[c]).join('/')})`);

console.log('\n## Decks\n');
for (const deck of Object.values(DECKS)) {
  const nums = [deck.leader, ...Object.keys(deck.cards)];
  const missing = nums.filter((n) => cardStatus(n) === 'todo');
  console.log(`- ${deck.name} (${deck.id}) : ${missing.length ? `${missing.length} carte(s) à faire : ${missing.join(', ')}` : 'complet'}`);
}
