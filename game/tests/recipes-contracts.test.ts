// Contrats de l'étape C (tâche 0, 01-contrats.md § 15) : ordre des sets, forme des fichiers de recettes, niveau de
// confiance, signatures des squelettes, et règle « aucun texte de carte dans le dépôt » pour les fichiers de l'étape.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CARDS, cardStatus, HIDDEN, playableCards } from '../engine/cards/index.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { confidence, isPlayableLevel } from '../engine/recipes/confidence.ts';
import { describe } from '../engine/recipes/describe.ts';
import { parseCard } from '../engine/recipes/parse/index.ts';
import { RECIPE_SETS } from '../engine/recipes/sets/index.ts';
import { SET_ORDER, SET_TASKS, setOf, taskOfSet } from '../engine/recipes/sets/ORDER.ts';
import { PLAYABLE_LEVELS, type Confidence, type Recipe } from '../engine/recipes/types.ts';

const nums = Object.keys(CARDS).filter((n) => n !== HIDDEN);

// Une recette type, écrite par le test (valeurs seulement) : « [Jouée] KO jusqu'à 1 Personnage adverse de coût 3 ou
// moins », plus un [Déclenchement] « jouer cette carte »
const SAMPLE: Recipe = {
  num: 'OP99-001',
  abilities: [{
    timing: 'onPlay',
    steps: [{ action: { kind: 'ko', target: { side: 'opp', zone: 'field', characters: true, count: 1, upTo: true, filter: { costMax: 3 } } } }],
  }],
  trigger: { timing: 'trigger', steps: [{ action: { kind: 'playSelf' } }] },
};

test('étape C : 20 tâches « set » dans l\'ordre, ports 3641 à 3660, aucun préfixe en double', () => {
  assert.equal(SET_TASKS.length, 20);
  SET_TASKS.forEach((t, i) => {
    assert.equal(t.task, `S${i + 1}`);
    assert.equal(t.port, 3641 + i);
    assert.equal(t.wave, Math.floor(i / 5) + 1, `${t.task} : vague`);
    assert.ok(t.sets.length > 0);
  });
  assert.equal(new Set(SET_ORDER).size, SET_ORDER.length, 'un préfixe dans deux tâches');
  assert.equal(SET_ORDER[0], 'EB05', 'le plus récent d\'abord');
  assert.equal(SET_TASKS.at(-1)!.sets.join(), 'P', 'les promos à la fin');
  assert.equal(setOf('OP17-001'), 'OP17');
  assert.equal(setOf('P-042'), 'P');
  assert.equal(taskOfSet('OP01')?.task, 'S19');
});

test('étape C : chaque set du catalogue a sa tâche (sinon : nouveau set à ajouter en tête de ORDER.ts)', (t) => {
  const unknown = [...new Set(nums.map(setOf))].filter((s) => !taskOfSet(s));
  // Pas d'échec : un catalogue téléchargé plus récent que le dépôt ne doit pas bloquer les autres tâches
  if (unknown.length) t.diagnostic(`sets sans tâche : ${unknown.join(', ')} (ajouter en tête de recipes/sets/ORDER.ts)`);
});

test('étape C : niveaux de confiance, seuls verified / coded / auto sont jouables', () => {
  const all: Confidence[] = ['todo', 'generated', 'doubt', 'verified', 'coded', 'auto'];
  assert.deepEqual(all.filter(isPlayableLevel), ['verified', 'coded', 'auto']);
  assert.deepEqual([...PLAYABLE_LEVELS].sort(), ['auto', 'coded', 'verified']);
  const playable = new Set(playableCards());
  for (const n of nums) {
    const level = confidence(n);
    assert.ok(all.includes(level), `${n} : niveau inconnu ${level}`);
    // une carte non jouable n'est jamais proposée (sauf carte d'un deck préconstruit : neededCards)
    if (!isPlayableLevel(level) && playable.has(n)) assert.equal(cardStatus(n), 'todo');
  }
});

test('étape C : signatures des squelettes (résultat ok, ou la liste de ce qui manque)', () => {
  const c = compileRecipe(SAMPLE);
  assert.ok(c.ok ? typeof c.behavior === 'object' : c.missing.length > 0);
  const d = describe(SAMPLE);
  assert.ok(d.ok ? d.en.length > 0 && d.fr.length > 0 : d.missing.length > 0);
  const p = parseCard({ num: 'OP99-001', effectEn: '', triggerEn: null });
  assert.ok(p.ok ? p.recipe.num === 'OP99-001' : Array.isArray(p.unknown));
});

test('étape C : fichiers de recettes bien formés', () => {
  const seen = new Set<string>();
  for (const rs of RECIPE_SETS) {
    assert.ok(taskOfSet(rs.set), `${rs.set} : set absent de ORDER.ts`);
    for (const [num, e] of Object.entries(rs.entries)) {
      assert.ok(!seen.has(num), `${num} : deux entrées`);
      seen.add(num);
      assert.equal(setOf(num), rs.set, `${num} rangé dans ${rs.set}`);
      assert.ok(e.recipe || e.handCoded, `${num} : ni recette ni code à la main`);
      if (e.recipe) assert.equal(e.recipe.num, num);
      if (e.level === 'doubt') assert.ok(e.doubt?.question && e.doubt.readings.length === 2, `${num} : doute sans question`);
    }
  }
});

// ---------- Aucun texte de carte dans les fichiers de l'étape C ----------

// Mots du texte, en minuscules, sans {types}, [noms], <attributs>, chiffres ni ponctuation
const words = (s: string) => s.toLowerCase().replace(/<[^>]*>|\[[^\]]*\]|\{[^}]*\}/g, ' ').match(/[a-z']+/g) ?? [];

// Données des recettes (recipes/sets/) : aucune suite de 8 mots du texte officiel (ni en commentaire, ni dans une note
// ou un doute). Code du traducteur, du compilateur et tests : la grammaire y reprend forcément des tournures (« up to
// N of your opponent's Characters »), mais jamais une phrase entière d'une carte (20 mots ou plus, reprise telle quelle).
const WINDOW = 8;
const LONG = 20;

const root = fileURLToPath(new URL('../', import.meta.url));
function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('étape C : aucune phrase de carte recopiée dans les recettes, le traducteur et leurs tests', () => {
  const windows = new Set<string>();
  const sentences = new Set<string>();
  for (const n of nums) {
    const d = CARDS[n]!;
    for (const text of [d.effectEn ?? '', d.triggerEn ?? '']) {
      const w = words(text);
      for (let i = 0; i + WINDOW <= w.length; i++) windows.add(w.slice(i, i + WINDOW).join(' '));
      for (const sentence of text.split(/[.!?\n]+/)) {
        const sw = words(sentence);
        if (sw.length >= LONG) sentences.add(` ${sw.join(' ')} `);
      }
    }
  }
  const data = tsFiles(join(root, 'engine', 'recipes', 'sets'));
  const code = [
    ...tsFiles(join(root, 'engine', 'recipes')).filter((f) => !data.includes(f)),
    ...readdirSync(join(root, 'tests')).filter((f) => /^recipes-.*\.test\.ts$/.test(f)).map((f) => join(root, 'tests', f)),
  ];
  assert.ok(data.length >= 2 && code.length >= 6, "fichiers de l'étape C introuvables");
  for (const f of data) {
    const w = words(readFileSync(f, 'utf8'));
    const copied = new Set<string>();
    for (let i = 0; i + WINDOW <= w.length; i++) {
      const s = w.slice(i, i + WINDOW).join(' ');
      if (windows.has(s)) copied.add(s);
    }
    assert.deepEqual([...copied], [], `${f} : texte de carte recopié`);
  }
  for (const f of code) {
    const stream = ` ${words(readFileSync(f, 'utf8')).join(' ')} `;
    const copied = [...sentences].filter((s) => stream.includes(s));
    assert.deepEqual(copied, [], `${f} : phrase de carte recopiée`);
  }
});
