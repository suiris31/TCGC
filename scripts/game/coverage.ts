// Rapport de couverture des cartes (étape C, 01-contrats.md § 15.5) : niveau de confiance de chaque carte du catalogue,
// par set (du plus récent au plus ancien, avec sa tâche « set ») et au total ; puis, comme avant, par couleur, par
// catégorie et par type, les Leaders jouables et l'état des decks préconstruits.
//   npm run game:coverage                       sortie lisible
//   npm run game:coverage -- --json f           et le même bilan en JSON (suivi de l'étape)
//   npm run game:coverage -- --traducteur       et l'essai du traducteur sur les cartes pas encore jouables
//                                               (part traduite sans reste, tournures inconnues par fréquence : C2)
//   npm run game:coverage -- --format standard  seulement les cartes du format Standard
// Le niveau est celui que lit le jeu (confidence, recipes/confidence.ts) ; la colonne « recettes » compte les entrées
// des fichiers recipes/sets/ (utile tant que le jeu ne les lit pas encore, et pour repérer un écart).
import '../../game/data/load-local.ts';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARDS, HIDDEN } from '../../game/engine/cards/index.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { confidence, isPlayableLevel } from '../../game/engine/recipes/confidence.ts';
import { setOf, taskOfSet } from '../../game/engine/recipes/sets/ORDER.ts';
import type { Confidence } from '../../game/engine/recipes/types.ts';
import { COLOR_LABEL } from '../../game/ui/labels.ts';
import { catalogSets, recipeIndex, translate, unknownByFrequency, type Translation } from './cards-lib.ts';

const argv = process.argv.slice(2);
const standardOnly = argv.includes('standard');
const jsonPath = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : undefined;
const withTranslator = argv.includes('--traducteur');
// Format Standard (depuis avril 2026) : blocs 2 à 5 (une carte l'est si une de ses impressions l'est)
const STANDARD_BLOCKS = ['2', '3', '4', '5'];

const cards = Object.values(CARDS).filter((d) => d.number !== HIDDEN && (!standardOnly || d.blocks.some((b) => STANDARD_BLOCKS.includes(b))));
const levelOf = new Map(cards.map((d) => [d.number, confidence(d.number)]));
const index = recipeIndex();

const LEVELS: Confidence[] = ['coded', 'auto', 'verified', 'generated', 'doubt', 'todo'];
const LABEL: Record<Confidence, string> = {
  coded: 'Codées', auto: "D'office", verified: 'Vérifiées', generated: 'Générées', doubt: 'Doutes', todo: 'À faire',
};
type Row = Record<Confidence, number> & { recipes: number };
const empty = (): Row => ({ coded: 0, auto: 0, verified: 0, generated: 0, doubt: 0, todo: 0, recipes: 0 });
const total = (r: Row) => LEVELS.reduce((s, l) => s + r[l], 0);
const playable = (r: Row) => LEVELS.filter(isPlayableLevel).reduce((s, l) => s + r[l], 0);
const pct = (r: Row) => (total(r) ? Math.round((playable(r) / total(r)) * 1000) / 10 : 0);

function tally(key: (d: (typeof cards)[number]) => string[]) {
  const m = new Map<string, Row>();
  for (const d of cards) for (const k of key(d)) {
    const r = m.get(k) ?? empty();
    r[levelOf.get(d.number)!]++;
    if (index.has(d.number)) r.recipes++;
    m.set(k, r);
  }
  return m;
}

function table(title: string, rows: [string, Row][], first = '') {
  const lvl = LEVELS.map((l) => LABEL[l]).join(' | ');
  console.log(`\n## ${title}\n\n| ${first} | ${lvl} | Jouables | Recettes |\n|---|${LEVELS.map(() => '---|').join('')}---|---|`);
  for (const [k, r] of rows) console.log(`| ${k} | ${LEVELS.map((l) => r[l]).join(' | ')} | ${pct(r)} % | ${r.recipes} |`);
}
const byPlayable = (m: Map<string, Row>) => [...m].sort((a, b) => playable(b[1]) - playable(a[1]) || a[0].localeCompare(b[0]));

const all = tally(() => ['toutes']).get('toutes') ?? empty();
const bySet = tally((d) => [setOf(d.number)]);
const setRows: [string, Row][] = catalogSets().filter((s) => bySet.has(s)).map((s) => [s, bySet.get(s)!]);

console.log(`# Couverture des cartes${standardOnly ? ' (format Standard)' : ''}\n`);
console.log(`${cards.length} cartes : ${playable(all)} jouables (${pct(all)} %) — ${LEVELS.map((l) => `${all[l]} ${LABEL[l].toLowerCase()}`).join(', ')}.`);
console.log(`Recettes écrites (recipes/sets/) : ${all.recipes}.`);
const unread = cards.filter((d) => {
  const e = index.get(d.number)?.entry;
  return e && e.level !== levelOf.get(d.number) && levelOf.get(d.number) !== 'coded';
});
if (unread.length) console.log(`⚠ ${unread.length} recette(s) dont le niveau n'est pas celui que lit le jeu (chargement des recettes : C1.1) : ${unread.slice(0, 8).map((d) => d.number).join(', ')}${unread.length > 8 ? '...' : ''}`);

table('Par set (du plus récent au plus ancien)', setRows.map(([s, r]) => [`${s} (${taskOfSet(s)?.task ?? 'sans tâche'})`, r]), 'Set (tâche)');
table('Par couleur', byPlayable(tally((d) => d.colors.map((c) => COLOR_LABEL[c]))));
table('Par catégorie', byPlayable(tally((d) => [d.category])));
table('Par type (20 premiers)', byPlayable(tally((d) => d.typeLabels)).slice(0, 20));

const doubts = cards.filter((d) => levelOf.get(d.number) === 'doubt' || index.get(d.number)?.entry.level === 'doubt');
if (doubts.length) {
  console.log(`\n## Doutes (${doubts.length}) : questions pour l'utilisateur\n`);
  for (const d of doubts) console.log(`- ${d.number} : ${index.get(d.number)?.entry.doubt?.question ?? '(question absente)'}`);
}

const leaders = cards.filter((d) => d.category === 'LEADER' && isPlayableLevel(levelOf.get(d.number)!));
console.log(`\n## Leaders jouables (${leaders.length})\n`);
for (const d of leaders) console.log(`- ${d.name} (${d.number}, ${d.colors.map((c) => COLOR_LABEL[c]).join('/')})`);

console.log('\n## Decks\n');
for (const deck of Object.values(DECKS)) {
  const nums = [deck.leader, ...Object.keys(deck.cards)];
  const missing = nums.filter((n) => !isPlayableLevel(confidence(n)));
  console.log(`- ${deck.name} (${deck.id}) : ${missing.length ? `${missing.length} carte(s) pas jouable(s) : ${missing.join(', ')}` : 'complet'}`);
}

// Essai du traducteur sur ce qui n'est pas encore jouable (ni recette relue) : le gain d'une tâche de la vague C2
let translator: { cards: number; ok: number; bySet: Record<string, { cards: number; ok: number }>; phrases: ReturnType<typeof unknownByFrequency> } | undefined;
if (withTranslator) {
  const results: Translation[] = [];
  const perSet: Record<string, { cards: number; ok: number }> = {};
  for (const d of cards) {
    const level = levelOf.get(d.number)!;
    if (isPlayableLevel(level) || level === 'doubt') continue;
    const t = translate(d.number);
    results.push(t);
    const s = (perSet[setOf(d.number)] ??= { cards: 0, ok: 0 });
    s.cards++;
    if (t.ok) s.ok++;
  }
  const ok = results.filter((r) => r.ok).length;
  const phrases = unknownByFrequency(results);
  translator = { cards: results.length, ok, bySet: perSet, phrases };
  const p = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  console.log(`\n## Traducteur : ${ok} sur ${results.length} cartes pas encore jouables traduites sans reste (${p(ok, results.length)} %)\n`);
  console.log('| Set | Cartes | Sans reste | % |\n|---|---|---|---|');
  for (const s of catalogSets()) if (perSet[s]) console.log(`| ${s} | ${perSet[s]!.cards} | ${perSet[s]!.ok} | ${p(perSet[s]!.ok, perSet[s]!.cards)} % |`);
  const multi = phrases.filter((x) => x.cards.length >= 3).length;
  console.log(`\n${phrases.length} tournures inconnues, dont ${multi} dans 3 cartes ou plus. Les 40 plus fréquentes :\n`);
  for (const x of phrases.slice(0, 40)) console.log(`- ${x.cards.length} × ${x.phrase}  (${x.cards.slice(0, 5).join(', ')}${x.cards.length > 5 ? '...' : ''})`);
}

if (jsonPath) {
  const row = (r: Row) => ({ ...r, total: total(r), playable: playable(r), pct: pct(r) });
  const out = {
    date: new Date().toISOString().slice(0, 10),
    standardOnly,
    total: row(all),
    sets: setRows.map(([set, r]) => ({ set, task: taskOfSet(set)?.task ?? null, ...row(r) })),
    doubts: doubts.map((d) => ({ num: d.number, question: index.get(d.number)?.entry.doubt?.question ?? null })),
    unread: unread.map((d) => d.number),
    translator: translator && { cards: translator.cards, ok: translator.ok, bySet: translator.bySet, phrases: translator.phrases.slice(0, 200) },
  };
  writeFileSync(resolve(jsonPath), JSON.stringify(out, null, 2));
  console.log(`\nJSON : ${resolve(jsonPath)}`);
}
