// Le jeu est affiché dans l'appli TCGC : aucune classe CSS ni animation ne doit exister dans les deux feuilles de style,
// sinon les règles de l'une s'appliqueraient aussi à l'autre (le jeu préfixe les siennes par op-)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');

function names(file: string) {
  const css = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set<string>();
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    if (selector.trim().startsWith('@')) continue;
    for (const [, name] of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) classes.add(name);
  }
  const keyframes = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  return { classes, keyframes };
}

test('styles : aucune classe ni animation commune entre TCGC et le jeu', () => {
  const tcgc = names('web/src/styles.css');
  const game = names('game/ui/styles.css');
  assert.ok(tcgc.classes.size > 100 && game.classes.size > 100);
  assert.deepEqual([...game.classes].filter((c) => tcgc.classes.has(c)), []);
  assert.deepEqual([...game.keyframes].filter((k) => tcgc.keyframes.has(k)), []);
});

test('styles : les variables et règles générales du jeu sont rangées sous son conteneur', () => {
  const css = readFileSync(join(ROOT, 'game/ui/styles.css'), 'utf8');
  assert.doesNotMatch(css, /^:root|^html \{|^body|^button|^img|^\* \{/m);
});
