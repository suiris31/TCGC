// Banc d'essai des recettes (tâche C1.3), trois modes :
//   npm run cards:fuzz -- [parties] [sets] [--generated] [--hasard] [--json fichier]
//       parties au hasard : decks légaux tirés parmi toutes les cartes jouables (sets : préfixes séparés par des
//       virgules, leurs Leaders et leurs cartes d'abord ; --generated : avec les cartes « generated » de ces sets),
//       IA contre IA, contrôles de cohérence à chaque décision ; rapport par carte
//   npm run cards:fuzz -- --tests [sets]
//       tests générés de chaque recette des sets (recipes/sets/), compilée
//   npm run cards:fuzz -- --comparer [sets] [--situations N] [--sensibilite]
//       cartes codées à la main dont une recette existe (fichier de set, sinon le traducteur) : code à la main et
//       recette compilée joués dans les mêmes situations ; --sensibilite : recette faussée (chaque nombre décalé)
import '../../game/data/load-local.ts';
import { writeFileSync } from 'node:fs';
import { CARDS, cardStatus, HIDDEN, recipeCompiled } from '../../game/engine/cards/index.ts';
import { currentBehavior } from '../../game/engine/recipes/bench.ts';
import { compileRecipe } from '../../game/engine/recipes/compile.ts';
import { compareBehaviors, mutateRecipe } from '../../game/engine/recipes/crosscheck.ts';
import { fuzz } from '../../game/engine/recipes/fuzz.ts';
import { parseCard } from '../../game/engine/recipes/parse/index.ts';
import { RECIPE_SETS } from '../../game/engine/recipes/sets/index.ts';
import { setOf } from '../../game/engine/recipes/sets/ORDER.ts';
import { formatReport, runGeneratedTests } from '../../game/engine/recipes/testgen.ts';
import type { Recipe } from '../../game/engine/recipes/types.ts';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const value = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const valued = new Set([value('--json'), value('--situations')]);
const plain = args.filter((a) => !a.startsWith('--') && !valued.has(a));
const t0 = Date.now();
const secs = () => `${Math.round((Date.now() - t0) / 1000)} s`;

function recipesOf(sets: string[]): Recipe[] {
  return RECIPE_SETS.filter((s) => !sets.length || sets.includes(s.set))
    .flatMap((s) => Object.values(s.entries).flatMap((e) => (e.recipe ? [e.recipe] : [])));
}

if (flag('--tests')) {
  const sets = plain[0] ? plain[0].split(',') : [];
  let ok = 0, failed = 0, notCompiled = 0;
  for (const r of recipesOf(sets)) {
    const c = recipeCompiled(r.num) ?? compileRecipe(r);  // avec le code à la main enregistré (MANUAL)
    if (!c.ok) { notCompiled++; continue; }
    const rep = runGeneratedTests(r, c.behavior);
    if (rep.ok) ok++; else { failed++; console.log(formatReport(rep)); }
  }
  console.log(`tests générés : ${ok} recettes sans échec, ${failed} en échec, ${notCompiled} non compilées (${secs()})`);
  if (failed) process.exitCode = 1;
} else if (flag('--comparer')) {
  const sets = plain[0] ? plain[0].split(',') : [];
  const situations = Number(value('--situations') ?? 20);
  const known = new Map(recipesOf(sets).map((r) => [r.num, r]));
  let same = 0, differ = 0, skipped = 0;
  for (const num of Object.keys(CARDS).sort()) {
    if (num === HIDDEN || (sets.length && !sets.includes(setOf(num))) || cardStatus(num) !== 'coded') continue;
    const d = CARDS[num];
    let recipe = known.get(num);
    if (!recipe) {
      const p = parseCard({ num, effectEn: d.effectEn ?? '', triggerEn: d.triggerEn });
      if (p.ok) recipe = p.recipe;
    }
    if (!recipe) { skipped++; continue; }
    const c = compileRecipe(flag('--sensibilite') ? mutateRecipe(recipe) : recipe);
    if (!c.ok) { skipped++; continue; }
    const res = compareBehaviors(num, currentBehavior(num), c.behavior, { situations });
    if (!res.compared) { skipped++; continue; }
    if (res.differ.length) { differ++; console.log(`- ${num} : ${res.differ.length}/${res.compared} situations différentes (ex. ${res.differ[0]})`); } else same++;
  }
  console.log(`comparaison : ${same} cartes identiques, ${differ} différentes, ${skipped} non comparées (${secs()})`);
} else {
  const games = Number(plain[0] ?? 20);
  const sets = plain[1] ? plain[1].split(',') : undefined;
  const rep = fuzz({ games, sets, generated: flag('--generated'), random: flag('--hasard'), onGame: (g) => { if (g && g % 50 === 0) console.log(`${g} parties (${secs()})`); } });
  for (const f of rep.failures) console.log(`- partie ${f.game} (graine ${f.seed}, ${f.decks.join(' contre ')}) : ${f.message}${f.suspects.length ? ` [soupçonnées : ${f.suspects.join(', ')}]` : ''}`);
  const cards = Object.entries(rep.cards).filter(([n]) => !sets || sets.includes(setOf(n)));
  const never = cards.filter(([n, c]) => !c.triggered && CARDS[n].category !== 'LEADER').map(([n]) => n);
  const suspected = cards.filter(([, c]) => c.errors).map(([n, c]) => `${n} (${c.errors})`);
  console.log(`${rep.games} parties${flag('--hasard') ? ' (choix au hasard)' : ''} en ${secs()} (${Math.round(rep.turns / Math.max(1, rep.games))} tours en moyenne), ${rep.failures.length} problème(s)`);
  console.log(`${cards.length} cartes dans les decks${sets ? ` des sets ${sets.join(', ')}` : ''}, ${cards.length - never.length} dont un effet s'est déclenché`);
  if (suspected.length) console.log(`cartes soupçonnées : ${suspected.join(' ')}`);
  if (rep.notCompiled.length) console.log(`cartes « generated » non compilées : ${rep.notCompiled.join(' ')}`);
  const json = value('--json');
  if (json) writeFileSync(json, JSON.stringify(rep, null, 2));
  if (rep.failures.length) process.exitCode = 1;
}
