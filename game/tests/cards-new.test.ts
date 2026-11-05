// Chaîne « nouveau set » (tâche C1.5) : choix des sets, réimpressions, écriture des fichiers de recettes sans toucher
// aux relectures, enregistrement dans recipes/sets/index.ts. Recettes et textes construits par le test (aucun texte de
// carte).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import {
  END_MARK, findReprint, lit, newSetSource, registerSet, reprintEntry, resolveSets, setExport, setFile, textKey,
  unknownByFrequency, updateSetSource, type IndexedEntry,
} from '../../scripts/game/cards-lib.ts';
import { CARDS, cardStatus, HIDDEN } from '../engine/cards/index.ts';
import { SET_TASKS } from '../engine/recipes/sets/ORDER.ts';
import type { Recipe, RecipeEntry, RecipeSet } from '../engine/recipes/types.ts';

const recipe = (num: string, costMax: number): Recipe => ({
  num,
  abilities: [{ timing: 'onPlay', steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', characters: true, count: 1, upTo: true, filter: { costMax, name: ["O'Neil"] } } } }] }],
  trigger: { timing: 'trigger', steps: [{ action: { kind: 'playSelf' } }] },
});
const gen = (num: string, costMax = 3): RecipeEntry => ({ level: 'generated', recipe: recipe(num, costMax) });

test('cards:new : sets désignés par préfixe, par tâche « set » ou « tout »', () => {
  assert.deepEqual(resolveSets('eb-05').sets, ['EB05']);
  assert.deepEqual(resolveSets('OP17, EB05').sets, ['OP17', 'EB05']);
  const s19 = resolveSets('S19').sets;
  assert.ok(s19.includes('OP01') && s19.every((s) => SET_TASKS[18]!.sets.includes(s)));
  assert.ok(resolveSets('tout').sets.length >= 50);
  assert.deepEqual(resolveSets('XX99').unknown, ['XX99']);
  assert.equal(setFile('PRB02'), 'prb02.ts');
  assert.equal(setExport('P'), 'RECIPES_P');
});

test('cards:new : une recette s\'écrit sur une ligne et se relit à l\'identique', async () => {
  const entries: Record<string, RecipeEntry> = {
    'OP99-001': gen('OP99-001'),
    'OP99-002': { level: 'doubt', recipe: recipe('OP99-002', 5), doubt: { question: "L'effet vaut-il aussi l'autre tour ?", readings: ['oui', 'non'] } },
  };
  const up = updateSetSource(null, 'OP99', new Map(Object.entries(entries)), new Map());
  assert.deepEqual(up.added, ['OP99-001', 'OP99-002']);
  assert.ok(up.src.includes(END_MARK));
  const dir = mkdtempSync(join(tmpdir(), 'cards-new-'));
  try {
    const file = join(dir, 'op99.ts');
    writeFileSync(file, up.src);
    const mod = (await import(pathToFileURL(file).href)) as Record<string, RecipeSet>;
    assert.deepEqual(mod.RECIPES_OP99, { set: 'OP99', entries });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(lit({ a: undefined, b: [1, 'x'] }), "{ b: [1, 'x'] }");
});

test('cards:new : les relectures sont gardées, seules les lignes « generated » sont regénérées', () => {
  let src = updateSetSource(null, 'OP99', new Map([['OP99-001', gen('OP99-001')], ['OP99-002', gen('OP99-002')], ['OP99-003', gen('OP99-003')]]), new Map()).src;
  // relecture : 001 vérifiée, 002 remise en forme sur plusieurs lignes, commentaire ajouté
  src = src.replace("'OP99-001': { level: 'generated'", "'OP99-001': { level: 'verified'")
    .replace(/^(\s*'OP99-002': \{ level: 'generated',)(.*)$/m, '$1\n     $2')
    .replace('  entries: {', '  entries: {\n    // relu le 5 novembre');
  // une relance n'ajoute rien de ce qui existe déjà
  const again = updateSetSource(src, 'OP99', new Map([['OP99-001', gen('OP99-001')]]), new Map());
  assert.equal(again.src, src);
  assert.deepEqual(again.kept, ['OP99-001']);
  // --regenerer : 003 (une ligne, generated) remplacée ; 001 (verified) et 002 (remise en forme) gardées
  const re = updateSetSource(src, 'OP99', new Map([['OP99-004', gen('OP99-004')]]),
    new Map([['OP99-001', gen('OP99-001', 9)], ['OP99-002', gen('OP99-002', 9)], ['OP99-003', gen('OP99-003', 9)]]));
  assert.deepEqual(re.replaced, ['OP99-003']);
  assert.deepEqual(re.kept.sort(), ['OP99-001', 'OP99-002']);
  assert.deepEqual(re.added, ['OP99-004']);
  assert.ok(re.src.includes('// relu le 5 novembre'));
  assert.match(re.src, /'OP99-001': \{ level: 'verified'.*costMax: 3/);
  assert.match(re.src, /'OP99-003': \{ level: 'generated'.*costMax: 9/);
  // la nouvelle entrée est avant le repère, le repère reste le dernier
  assert.ok(re.src.indexOf("'OP99-004'") < re.src.indexOf(END_MARK));
  // repère retiré à la main : on refuse d'ajouter plutôt que d'écrire n'importe où
  assert.throws(() => updateSetSource(src.replace(END_MARK, ''), 'OP99', new Map([['OP99-005', gen('OP99-005')]]), new Map()), /repère de fin/);
});

test('cards:new : enregistrement dans recipes/sets/index.ts (une fois, à la fin)', () => {
  const base = "import type { RecipeSet } from '../types.ts';\n\nexport const RECIPE_SETS: RecipeSet[] = [\n];\n";
  const one = registerSet(base, 'EB05')!;
  const two = registerSet(one, 'OP17')!;
  assert.equal(registerSet(two, 'EB05'), null);
  assert.equal(two, "import type { RecipeSet } from '../types.ts';\nimport { RECIPES_EB05 } from './eb05.ts';\nimport { RECIPES_OP17 } from './op17.ts';\n\n"
    + 'export const RECIPE_SETS: RecipeSet[] = [\n  RECIPES_EB05,\n  RECIPES_OP17,\n];\n');
  assert.ok(newSetSource('OP99').includes('export const RECIPES_OP99: RecipeSet'));
});

test('cards:new : réimpressions (même texte), recette vérifiée de préférence, sinon carte codée à la main', () => {
  // textes construits par le test : rappels de règle et écriture ignorés, le [Déclenchement] compte
  assert.equal(textKey({ effectEn: 'Draw 2 cards.  (A reminder.)', triggerEn: null }), textKey({ effectEn: 'draw 2 cards.', triggerEn: null }));
  assert.notEqual(textKey({ effectEn: 'Draw 2 cards.', triggerEn: 'Draw 1 card.' }), textKey({ effectEn: 'Draw 2 cards.', triggerEn: null }));
  assert.equal(textKey({ effectEn: '', triggerEn: null }), '');

  const index = new Map<string, IndexedEntry>([
    ['OP99-001', { set: 'OP99', entry: gen('OP99-001') }],
    ['OP99-002', { set: 'OP99', entry: { ...gen('OP99-002'), level: 'verified' } }],
  ]);
  assert.deepEqual(findReprint(['OP99-001', 'OP99-002'], index), { kind: 'recipe', from: 'OP99-002', entry: index.get('OP99-002')!.entry });
  assert.deepEqual(findReprint(['OP99-001'], index), { kind: 'recipe', from: 'OP99-001', entry: index.get('OP99-001')!.entry });
  const coded = Object.keys(CARDS).find((n) => n !== HIDDEN && cardStatus(n) === 'coded')!;
  assert.deepEqual(findReprint(['OP99-003', coded], index), { kind: 'coded', from: coded });
  assert.equal(findReprint(['OP99-003'], index), null);

  const from = reprintEntry('P-999', 'OP99-002', { ...gen('OP99-002'), level: 'verified' });
  assert.equal(from.level, 'verified');
  assert.equal(from.recipe!.num, 'P-999');
  assert.equal(from.note, 'réimpression de OP99-002');
  const doubt = reprintEntry('P-999', 'OP99-002', { ...gen('OP99-002'), level: 'doubt', doubt: { question: 'q', readings: ['a', 'b'] } });
  assert.equal(doubt.doubt?.question, 'q');
});

test('cards:new : tournures inconnues regroupées et classées par nombre de cartes', () => {
  const phrases = unknownByFrequency([
    { num: 'OP99-001', ok: false, unknown: ['OP99-001 : tournure A', 'tournure B'] },
    { num: 'OP99-002', ok: false, unknown: ['tournure A', 'tournure A'] },
    { num: 'OP99-003', ok: true, unknown: [] },
  ]);
  assert.deepEqual(phrases, [{ phrase: 'tournure A', cards: ['OP99-001', 'OP99-002'] }, { phrase: 'tournure B', cards: ['OP99-001'] }]);
});
