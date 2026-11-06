// Chaîne « nouveau set » (tâche C1.5, 01-contrats.md § 15.5) : traduit les cartes d'un set qui ne sont ni codées ni
// déjà en recette, écrit recipes/sets/<set>.ts (niveau 'generated'), reprend les réimpressions, puis vérifie tout le set
// (compilation, aller-retour, tests générés, parties au hasard) et fait le rapport.
//
//   npm run cards:new -- <set>              EB05, « EB05,OP17 », S1 (les sets de la tâche), tout
//     --essai          ne rien écrire : traduire et vérifier ce qui peut l'être sans charger les recettes
//     --verifier       ne rien traduire : seulement vérifier et faire le rapport (après une relecture, par exemple)
//     --regenerer      retraduire aussi les recettes encore 'generated' (jamais celles relues : verified, doubt)
//     --parties N      parties au hasard (cards:fuzz) avec les recettes du set (20 par défaut, 0 : aucune)
//     --rapport f      rapport complet pour la relecture (textes officiels et descriptions) ; par défaut dans le
//                      dossier temporaire, jamais dans le dépôt
//     --json f         résumé en JSON (sans texte de carte), pour le suivi
//
// La vérification tourne dans un processus neuf, qui charge les fichiers de recettes comme le jeu : elle voit
// exactement ce que la partie verra (et une erreur d'écriture du fichier).
import '../../game/data/load-local.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARDS } from '../../game/engine/cards/index.ts';
import { compileRecipe } from '../../game/engine/recipes/compile.ts';
import { confidence } from '../../game/engine/recipes/confidence.ts';
import { describe } from '../../game/engine/recipes/describe.ts';
import { taskOfSet } from '../../game/engine/recipes/sets/ORDER.ts';
import type { ManualCode, Recipe, RecipeEntry } from '../../game/engine/recipes/types.ts';
import {
  cardsOfSet, fileLevel, findReprint, lit, recipeIndex, registerSet, reprintEntry, resolveSets, risks, sameTextAs,
  sameTextGroups, setFile, translate, unknownByFrequency, updateSetSource, type IndexedEntry, type Translation,
} from './cards-lib.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SETS_DIR = join(ROOT, 'game', 'engine', 'recipes', 'sets');

// ---------- Arguments ----------

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const valueArgs = new Set(['--parties', '--rapport', '--json'].map((o) => option(o)).filter(Boolean));
const target = argv.find((a) => !a.startsWith('--') && !valueArgs.has(a));
if (!target) {
  console.error('Usage : npm run cards:new -- <set> [--essai | --verifier] [--regenerer] [--parties N] [--rapport f] [--json f]');
  console.error('  <set> : EB05, « EB05,OP17 », S1 (les sets de la tâche) ou tout');
  process.exit(1);
}
const { sets, unknown: unknownSets } = resolveSets(target);
if (unknownSets.length || !sets.length) {
  console.error(`Set inconnu du catalogue : ${unknownSets.join(', ') || target}. Le catalogue est-il à jour (npm run game:cards) ?`);
  process.exit(1);
}
const essai = flag('--essai');
const verifyOnly = flag('--verifier');
const regenerate = flag('--regenerer');
const parties = Number(option('--parties') ?? 20);
if (!Number.isInteger(parties) || parties < 0) {
  console.error('--parties : un nombre entier (0 : pas de parties au hasard)');
  process.exit(1);
}
const label = sets.length > 4 ? `${target} (${sets.length} sets)` : sets.join(', ');
const reportPath = resolve(option('--rapport') ?? join(tmpdir(), `cards-new-${target.replace(/[^\w-]+/g, '_')}.md`));
if (!relative(ROOT, reportPath).startsWith('..')) {
  console.error(`Le rapport complet montre les textes officiels : il ne s'écrit pas dans le dépôt (${reportPath}).`);
  process.exit(1);
}

// ---------- 1. Traduire et écrire ----------

// Recettes produites par cette exécution (en --essai, elles ne sont pas écrites : la vérification les lit ici)
const pending = new Map<string, RecipeEntry>();

function translateSets() {
  const index = recipeIndex();
  const groups = sameTextGroups();
  console.log(`# cards:new ${label}${essai ? ' (essai : rien n\'est écrit)' : ''}\n`);
  for (const set of sets) {
    const add = new Map<string, RecipeEntry>();
    const replace = new Map<string, RecipeEntry>();
    let reprints = 0;
    for (const num of cardsOfSet(set)) {
      const level = fileLevel(num, index);
      if (level === 'coded' || level === 'auto') continue;
      const existing = index.get(num)?.entry;
      if (existing) {
        // une réimpression pas encore relue suit sa source (relue, regénérée, mise en doute)
        const from = existing.note?.match(/^réimpression de (\S+)$/)?.[1];
        if (from) {
          const src = index.get(from)?.entry;
          if (existing.level === 'generated' && src?.recipe) {
            const fresh = reprintEntry(num, from, src);
            if (lit(fresh) !== lit(existing)) replace.set(num, fresh);
          }
          continue;
        }
        // une recette relue (verified, doubt) n'est jamais retraduite
        if (!regenerate || existing.level !== 'generated') continue;
        const t = translate(num);
        if (t.ok) replace.set(num, { level: 'generated', recipe: t.recipe });
        continue;
      }
      const rp = findReprint(sameTextAs(num, groups), index);
      if (rp?.kind === 'recipe') {
        add.set(num, reprintEntry(num, rp.from, rp.entry));
        reprints++;
        continue;
      }
      const t = translate(num);
      if (t.ok) add.set(num, { level: 'generated', recipe: t.recipe });
    }
    for (const [n, e] of [...add, ...replace]) pending.set(n, e);
    const file = join(SETS_DIR, setFile(set));
    const shown = relative(ROOT, file).replace(/\\/g, '/');
    if (!add.size && !replace.size) {
      console.log(`- ${set} : aucune recette nouvelle${existsSync(file) ? '' : ' (pas de fichier créé)'}`);
      continue;
    }
    const up = updateSetSource(existsSync(file) ? readFileSync(file, 'utf8') : null, set, add, replace);
    const parts = [
      up.added.length || !up.replaced.length ? `${up.added.length} recette(s) ${essai ? 'à écrire' : 'écrite(s)'}${reprints ? ` dont ${reprints} réimpression(s)` : ''}` : '',
      up.replaced.length ? `${up.replaced.length} mise(s) à jour (retraduites, ou réimpressions qui suivent leur source)` : '',
      up.kept.length ? `${up.kept.length} gardée(s) telle(s) quelle(s) (mise en forme changée à la main)` : '',
    ].filter(Boolean);
    console.log(`- ${set} : ${parts.join(', ')} → ${shown}`);
    if (essai) continue;
    writeFileSync(file, up.src);
    const indexFile = join(SETS_DIR, 'index.ts');
    const reg = registerSet(readFileSync(indexFile, 'utf8'), set);
    if (reg) {
      writeFileSync(indexFile, reg);
      console.log(`  enregistré dans game/engine/recipes/sets/index.ts`);
    }
  }
  console.log('');
}

// ---------- 2. Vérifier ----------

type Check = { state: 'ok' } | { state: 'ko'; details: string[] } | { state: 'absent'; why: string };

// Modules des autres tâches de la vague C1, chargés s'ils existent (compare : C1.2 ; testgen : C1.3)
async function optionalModule(path: string): Promise<Record<string, unknown> | null> {
  const file = join(ROOT, path);
  if (!existsSync(file)) return null;
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

// Code à la main d'un set (sortie « manual » des recettes) : exports MANUAL... de game/engine/cards/<set>.ts
async function manualCode(set: string): Promise<Record<string, ManualCode>> {
  const mod = await optionalModule(`game/engine/cards/${setFile(set)}`);
  const out: Record<string, ManualCode> = {};
  for (const [k, v] of Object.entries(mod ?? {})) if (/^MANUAL/.test(k) && v && typeof v === 'object') Object.assign(out, v);
  return out;
}

const notWritten = (msgs: string[]) => msgs.some((m) => /pas encore écrit/.test(m));

function checkCompile(recipe: Recipe, manual?: ManualCode): Check {
  try {
    const r = compileRecipe(recipe, manual);
    if (r.ok) return { state: 'ok' };
    return notWritten(r.missing) ? { state: 'absent', why: 'compilateur pas encore livré (C1.1)' } : { state: 'ko', details: r.missing };
  } catch (e) {
    return { state: 'ko', details: [`erreur : ${(e as Error).message}`] };
  }
}

function checkDescribe(recipe: Recipe): { check: Check; en?: string; fr?: string } {
  try {
    const r = describe(recipe);
    if (r.ok) return { check: { state: 'ok' }, en: r.en, fr: r.fr };
    return { check: notWritten(r.missing) ? { state: 'absent', why: 'description pas encore livrée (C1.2)' } : { state: 'ko', details: r.missing } };
  } catch (e) {
    return { check: { state: 'ko', details: [`erreur : ${(e as Error).message}`] } };
  }
}

const show = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));

// compare(num) → liste des écarts (01-contrats.md § 15.4) ; n'a de sens que si la recette est chargée par le jeu
async function checkCompare(mod: Record<string, unknown> | null, num: string): Promise<Check> {
  if (essai) return { state: 'absent', why: 'essai : recettes pas chargées' };
  const fn = mod?.compare;
  if (typeof fn !== 'function') return { state: 'absent', why: 'aller-retour pas encore livré (C1.2)' };
  try {
    const gaps = await fn(num);
    const all = Array.isArray(gaps) ? gaps : gaps ? [gaps] : [];
    // seuls les écarts bloquants (preuve 2) font échouer ; les écarts « info » de rédaction ne comptent pas (vague S-1)
    const list = typeof mod?.blocking === 'function' ? await (mod.blocking as (g: unknown[]) => unknown[])(all) : all;
    return list.length ? { state: 'ko', details: list.map(show) } : { state: 'ok' };
  } catch (e) {
    return { state: 'ko', details: [`erreur : ${(e as Error).message}`] };
  }
}

// testRecipe(recipe, manual?) → { ok, failures } (recipes/testgen.ts, C1.3)
async function checkTests(mod: Record<string, unknown> | null, recipe: Recipe, manual?: ManualCode): Promise<Check> {
  const fn = mod?.testRecipe;
  if (typeof fn !== 'function') return { state: 'absent', why: mod ? 'testgen.ts sans testRecipe(recipe)' : 'tests générés pas encore livrés (C1.3)' };
  try {
    const r = await fn(recipe, manual);
    const failures: unknown[] = Array.isArray(r) ? r : r && typeof r === 'object'
      ? ((r as { failures?: unknown[] }).failures ?? ((r as { ok?: boolean }).ok === false ? ['échec'] : []))
      : r === false ? ['échec'] : [];
    return failures.length ? { state: 'ko', details: failures.map(show) } : { state: 'ok' };
  } catch (e) {
    return { state: 'ko', details: [`erreur : ${(e as Error).message}`] };
  }
}

interface CardReport {
  num: string;
  set: string;
  level: string;            // niveau écrit dans les fichiers (ou ancien statut)
  game: string;             // niveau lu par le jeu : confidence(num)
  note?: string;
  doubt?: string;
  risks: string[];
  sameText: string[];
  reprintOfCoded?: string;
  checks?: { compile: Check; describe: Check; compare: Check; tests: Check };
  en?: string;
  fr?: string;
  unknown?: string[];
}

async function verify(): Promise<number> {
  const index = recipeIndex();
  for (const [num, entry] of pending) if (essai) index.set(num, { set: num.split('-')[0]!, entry } satisfies IndexedEntry);
  const groups = sameTextGroups();
  const compareMod = await optionalModule('game/engine/recipes/compare.ts');
  const testMod = await optionalModule('game/engine/recipes/testgen.ts');
  const cards: CardReport[] = [];
  const failures: Translation[] = [];
  for (const set of sets) {
    const manual = await manualCode(set);
    for (const num of cardsOfSet(set)) {
      const e = index.get(num)?.entry;
      const level = essai && pending.has(num) ? pending.get(num)!.level : fileLevel(num, index);
      const c: CardReport = { num, set, level, game: confidence(num), risks: risks(num), sameText: sameTextAs(num, groups) };
      if (e?.note) c.note = e.note;
      if (e?.doubt) c.doubt = e.doubt.question;
      if (e?.recipe && level !== 'coded') {
        const d = checkDescribe(e.recipe);
        c.checks = {
          compile: checkCompile(e.recipe, manual[num]),
          describe: d.check,
          compare: await checkCompare(compareMod, num),
          tests: await checkTests(testMod, e.recipe, manual[num]),
        };
        c.en = d.en;
        c.fr = d.fr;
      } else if (level === 'todo') {
        const t = translate(num);
        c.unknown = t.unknown;
        failures.push(t);
        const rp = findReprint(sameTextAs(num, groups), index);
        if (rp?.kind === 'coded') c.reprintOfCoded = rp.from;
      }
      cards.push(c);
    }
  }

  // Parties au hasard (C1.3) avec les recettes 'generated' des sets
  let fuzz: { ran: boolean; status: number | null; output: string } = { ran: false, status: null, output: '' };
  const withRecipes = cards.some((c) => c.checks);
  if (!essai && parties > 0 && withRecipes) {
    const r = spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', 'game', 'cards-fuzz.ts'), String(parties), sets.join(','), '--generated'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    fuzz = { ran: true, status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  }

  return printReport(cards, failures, fuzz);
}

// ---------- 3. Rapport ----------

const COUNT_ORDER = ['verified', 'coded', 'auto', 'generated', 'doubt', 'todo'] as const;
const LEVEL_LABEL: Record<string, string> = {
  verified: 'vérifiées', coded: 'codées', auto: "jouables d'office", generated: 'générées (à relire)', doubt: 'en doute', todo: 'à coder à la main',
};
const list = (nums: string[], max = 12) => (nums.length > max ? `${nums.slice(0, max).join(', ')}... (+${nums.length - max})` : nums.join(', '));

function issues(c: CardReport): string[] {
  if (!c.checks) return [];
  const out: string[] = [];
  const names = { compile: 'compilation', describe: 'description', compare: 'aller-retour', tests: 'tests générés' } as const;
  for (const k of Object.keys(names) as (keyof typeof names)[]) {
    const ch = c.checks[k];
    if (ch.state === 'ko') out.push(`${names[k]} : ${ch.details.join(' ; ')}`);
  }
  return out;
}

function printReport(cards: CardReport[], failures: Translation[], fuzz: { ran: boolean; status: number | null; output: string }): number {
  const by = (level: string) => cards.filter((c) => c.level === level);
  const counts = COUNT_ORDER.map((l) => `${by(l).length} ${LEVEL_LABEL[l]}`).join(', ');
  const playable = cards.filter((c) => ['verified', 'coded', 'auto'].includes(c.level)).length;
  const out: string[] = [];
  const say = (s = '') => out.push(s);

  say(`## Bilan : ${label}`);
  say('');
  for (const set of sets) {
    const sc = cards.filter((c) => c.set === set);
    const ok = sc.filter((c) => ['verified', 'coded', 'auto'].includes(c.level)).length;
    say(`- ${set} (${taskOfSet(set)?.task ?? 'sans tâche : à ajouter en tête de ORDER.ts'}) : ${sc.length} cartes, ${ok} jouables` +
      ` (${sc.length ? Math.round((ok / sc.length) * 100) : 0} %) ; ${COUNT_ORDER.filter((l) => l !== 'coded' && l !== 'auto' && sc.some((c) => c.level === l))
        .map((l) => `${sc.filter((c) => c.level === l).length} ${LEVEL_LABEL[l]}`).join(', ') || 'rien à faire'}`);
  }
  say(`- Total : ${cards.length} cartes, ${playable} jouables ; ${counts}`);

  // Modules pas encore livrés (vague C1 en parallèle) : dit une fois, pas carte par carte
  const absent = new Set<string>();
  for (const c of cards) for (const ch of Object.values(c.checks ?? {})) if (ch.state === 'absent') absent.add(ch.why);
  if (absent.size) say(`- Vérifications pas encore disponibles : ${[...absent].join(' ; ')}`);
  const unread = cards.filter((c) => c.level !== c.game && c.level !== 'todo');
  if (unread.length && !essai) say(`- ${unread.length} carte(s) dont le niveau écrit n'est pas encore celui que lit le jeu (confidence, C1.1) : ${list(unread.map((c) => c.num), 6)}`);

  const toReview = cards.filter((c) => c.level === 'generated');
  if (toReview.length) {
    const checked = (c: CardReport) => Object.values(c.checks ?? {}).every((ch) => ch.state === 'ok');
    const ready = toReview.filter(checked);
    const partly = toReview.filter((c) => !checked(c) && !issues(c).length);
    say('');
    say(`## À relire : ${toReview.length} recette(s) générée(s)`);
    say('');
    say(`- Toutes les vérifications passent : ${ready.length}${ready.length ? ` (${list(ready.map((c) => c.num))})` : ''}`);
    if (partly.length) say(`- Sans erreur, mais pas encore toutes vérifiées (voir plus haut) : ${partly.length} (${list(partly.map((c) => c.num))})`);
    for (const c of toReview.filter((x) => issues(x).length)) say(`- ${c.num} : ${issues(c).join(' | ')}`);
    const risky = toReview.filter((c) => c.risks.length);
    if (risky.length) {
      say(`- Formulations à risque (Q&A officielles à consulter, sinon 'doubt') :`);
      for (const c of risky) say(`  - ${c.num} : ${c.risks.join(', ')}`);
    }
  }
  const relu = cards.filter((c) => c.level === 'verified' && issues(c).length);
  if (relu.length) {
    say('');
    say('## Recettes vérifiées qui ne passent plus');
    say('');
    for (const c of relu) say(`- ${c.num} : ${issues(c).join(' | ')}`);
  }

  const phrases = unknownByFrequency(failures);
  if (failures.length) {
    say('');
    say(`## Tournures inconnues (${phrases.length}), par nombre de cartes`);
    say('');
    for (const p of phrases.slice(0, 40)) say(`- ${p.cards.length} × ${p.phrase}  (${list(p.cards, 6)})`);
    if (phrases.length > 40) say(`- ... ${phrases.length - 40} autres (rapport complet)`);
    say('');
    say(`## À coder à la main : ${failures.length} carte(s)`);
    say('');
    const done = new Set<string>();
    for (const c of cards.filter((x) => x.level === 'todo')) {
      if (done.has(c.num)) continue;
      const twins = c.sameText.filter((n) => cards.some((x) => x.num === n && x.level === 'todo'));
      twins.forEach((n) => done.add(n));
      const extra = [
        `${c.unknown?.length ?? 0} morceau(x) non compris`,
        twins.length ? `même texte que ${twins.join(', ')} (à coder une fois)` : '',
        c.reprintOfCoded ? `réimpression de ${c.reprintOfCoded}, déjà codée à la main : reprendre son comportement` : '',
        c.risks.length ? `à risque : ${c.risks.join(', ')}` : '',
      ].filter(Boolean);
      say(`- ${c.num} : ${extra.join(' ; ')}`);
    }
  }

  const doubts = by('doubt');
  if (doubts.length) {
    say('');
    say(`## Doutes : ${doubts.length} (questions pour l'utilisateur)`);
    say('');
    for (const c of doubts) say(`- ${c.num} : ${c.doubt ?? '(question absente)'}`);
  }

  let code = 0;
  say('');
  say('## Parties au hasard');
  say('');
  if (essai) say('- essai : pas de parties (les recettes ne sont pas chargées)');
  else if (parties === 0) say('- --parties 0 : pas de parties');
  else if (!fuzz.ran) say('- aucune recette à essayer dans ces sets');
  else {
    const notYet = /pas encore écrit/.test(fuzz.output);
    if (notYet) say('- cards:fuzz pas encore livré (C1.3)');
    else {
      say(`- ${parties} partie(s), sets ${sets.join(',')}, recettes générées comprises : ${fuzz.status === 0 ? 'aucune erreur' : `ERREURS (code ${fuzz.status})`}`);
      for (const l of fuzz.output.split('\n').slice(-15)) say(`  ${l}`);
      if (fuzz.status !== 0) code = 1;
    }
  }

  console.log(out.join('\n'));

  // Rapport complet (hors dépôt) : le texte officiel à côté de la description, pour la relecture
  const full: string[] = [`# cards:new ${label} : rapport de relecture`, '', 'Hors dépôt : ce fichier montre les textes officiels.', '', ...out, '', '## Cartes', ''];
  for (const c of cards.filter((x) => x.level !== 'coded' && x.level !== 'auto')) {
    const d = CARDS[c.num]!;
    full.push(`### ${c.num} · ${d.name} · ${LEVEL_LABEL[c.level] ?? c.level}${c.note ? ` · ${c.note}` : ''}`, '');
    full.push(`- Texte (VO) : ${d.effectEn || '—'}${d.triggerEn ? ` / [Trigger] ${d.triggerEn}` : ''}`);
    if (d.lang === 'fr') full.push(`- Texte (VF) : ${d.effect || '—'}${d.trigger ? ` / [Déclenchement] ${d.trigger}` : ''}`);
    if (c.en) full.push(`- Recette relue en anglais : ${c.en}`);
    if (c.fr) full.push(`- Recette relue en français : ${c.fr}`);
    for (const i of issues(c)) full.push(`- ⚠ ${i}`);
    if (c.unknown?.length) full.push(`- Non compris : ${c.unknown.join(' | ')}`);
    if (c.doubt) full.push(`- Doute : ${c.doubt}`);
    if (c.risks.length) full.push(`- À risque : ${c.risks.join(', ')}`);
    if (c.sameText.length) full.push(`- Même texte : ${c.sameText.join(', ')}`);
    full.push('');
  }
  writeFileSync(reportPath, full.join('\n'));
  console.log(`\nRapport complet pour la relecture (textes officiels, hors dépôt) : ${reportPath}`);

  const jsonPath = option('--json');
  if (jsonPath) {
    const summary = {
      date: new Date().toISOString().slice(0, 10),
      sets,
      totals: Object.fromEntries(COUNT_ORDER.map((l) => [l, by(l).length])),
      playable,
      unavailable: [...absent],
      cards: cards.map((c) => ({
        num: c.num, level: c.level, game: c.game, note: c.note, doubt: c.doubt, risks: c.risks, sameText: c.sameText,
        reprintOfCoded: c.reprintOfCoded, unknown: c.unknown, issues: issues(c),
      })),
      unknownPhrases: phrases,
      fuzz: fuzz.ran ? { parties, status: fuzz.status } : null,
    };
    writeFileSync(resolve(jsonPath), JSON.stringify(summary, null, 2));
    console.log(`Résumé JSON : ${resolve(jsonPath)}`);
  }
  return code;
}

// ---------- Déroulement ----------

if (!verifyOnly) translateSets();
if (verifyOnly || essai) {
  process.exitCode = await verify();
} else {
  // processus neuf : il charge les fichiers qu'on vient d'écrire, comme le jeu
  const passOn = ['--parties', String(parties), '--rapport', reportPath, ...(option('--json') ? ['--json', option('--json')!] : [])];
  const r = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url), target, '--verifier', ...passOn], { cwd: ROOT, stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
}
