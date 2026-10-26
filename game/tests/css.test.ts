// Styles du jeu (game/ui/styles/*.css, et toute autre feuille de style de game/ui, comme kit/).
// Le jeu est affiché dans l'appli TCGC : aucune classe CSS ni animation ne doit exister dans les deux feuilles de style,
// sinon les règles de l'une s'appliqueraient aussi à l'autre (le jeu préfixe les siennes par op-). Les couleurs et les
// plans (z-index) passent par les tokens de styles/tokens.css.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');
const UI = join(ROOT, 'game', 'ui');
const TOKENS = 'game/ui/styles/tokens.css';

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return f.endsWith('.css') ? [relative(ROOT, p).replace(/\\/g, '/')] : [];
  });
}
const GAME = cssFiles(UI);
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function names(css: string) {
  const classes = new Set<string>();
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    if (selector.trim().startsWith('@')) continue;
    for (const [, name] of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) classes.add(name);
  }
  const keyframes = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  return { classes, keyframes };
}

// Déclarations (propriété, valeur) de chaque règle, avec le sélecteur qui les porte
function declarations(css: string) {
  const out: { selector: string; prop: string; value: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const [, selector, body] of css.matchAll(re)) {
    for (const d of body.split(';')) {
      const k = d.indexOf(':');
      if (k > 0) out.push({ selector: selector.trim(), prop: d.slice(0, k).trim(), value: d.slice(k + 1).trim() });
    }
  }
  return out;
}

test('styles : les feuilles du jeu sont toutes importées par GameApp.tsx, tokens et base en premier', () => {
  const app = readFileSync(join(UI, 'GameApp.tsx'), 'utf8');
  const imported = [...app.matchAll(/^import '\.\/(styles\/[\w-]+\.css)';$/gm)].map((m) => `game/ui/${m[1]}`);
  assert.deepEqual(imported.slice(0, 2), [TOKENS, 'game/ui/styles/base.css']);
  const styles = GAME.filter((f) => f.startsWith('game/ui/styles/'));
  assert.deepEqual([...imported].sort(), [...styles].sort());
  assert.ok(styles.length >= 10);
});

test('styles : aucune classe ni animation commune entre TCGC et le jeu', () => {
  const tcgc = names(read('web/src/styles.css'));
  const game = names(GAME.map(read).join('\n'));
  assert.ok(tcgc.classes.size > 100 && game.classes.size > 100);
  assert.deepEqual([...game.classes].filter((c) => tcgc.classes.has(c)), []);
  assert.deepEqual([...game.keyframes].filter((k) => tcgc.keyframes.has(k)), []);
});

test('styles : les variables et règles générales du jeu sont rangées sous son conteneur', () => {
  for (const file of GAME) assert.doesNotMatch(read(file), /^\s*(:root|html \{|body|button|input|img|h[1-6]|\* \{)/m, file);
});

// Couleurs littérales permises hors de tokens.css, avec leur raison
const COLOR_EXCEPTIONS: { file: string; selector: string; value: RegExp; why: string }[] = [
  {
    file: 'game/ui/styles/fx.css', selector: '.confetti i', value: /^hsl\(calc\(var\(--i\) \* 37deg\), 85%, 62%\)$/,
    why: 'une teinte différente par confetti, calculée à partir de son numéro',
  },
];

test('styles : aucune couleur littérale hors de tokens.css', () => {
  const COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
  const NAMED = /(^|[\s,(])(white|black|red|green|blue|yellow|orange|gold|grey|gray|silver|pink|purple|navy|teal|cyan|magenta)($|[\s,)])/i;
  const found: string[] = [];
  for (const file of GAME) {
    if (file === TOKENS) continue;
    for (const { selector, prop, value } of declarations(read(file))) {
      if (!COLOR.test(value) && !NAMED.test(value)) continue;
      if (COLOR_EXCEPTIONS.some((e) => e.file === file && e.selector === selector && e.value.test(value))) continue;
      found.push(`${file} : ${selector} { ${prop}: ${value} }`);
    }
  }
  assert.deepEqual(found, []);
});

test('styles : tokens.css ne contient que des variables sous .opc', () => {
  const css = read(TOKENS);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.deepEqual(rules.map((r) => r[1].trim()), ['.opc']);
  for (const { prop } of declarations(css)) assert.match(prop, /^--[\w-]+$/);
});

test('styles : chaque token utilisé existe, et les plans (z-index) passent par l’échelle --z-*', () => {
  const defined = new Set(declarations(read(TOKENS)).map((d) => d.prop));
  // variables posées par les règles (--cw, --c1, --glow…) ou par le code des composants (style={{ '--i': … }})
  const local = new Set<string>();
  for (const file of GAME) for (const { prop } of declarations(read(file))) if (prop.startsWith('--')) local.add(prop);
  const code = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? code(p) : /\.tsx?$/.test(f) ? [readFileSync(p, 'utf8')] : [];
  });
  for (const src of code(UI)) for (const [name] of src.matchAll(/--[a-z][\w-]*/g)) local.add(name);
  const unknown: string[] = [];
  const zIndex: string[] = [];
  for (const file of GAME) {
    const css = read(file);
    for (const [, name, fallback] of css.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
      if (!defined.has(name) && !local.has(name) && !fallback) unknown.push(`${file} : ${name}`);
    }
    for (const { selector, prop, value } of declarations(css)) {
      if (prop === 'z-index' && !/^var\(--z-[\w-]+\)$/.test(value)) zIndex.push(`${file} : ${selector} { z-index: ${value} }`);
    }
  }
  assert.deepEqual(unknown, []);
  assert.deepEqual(zIndex, []);
  for (const z of [...defined].filter((d) => d.startsWith('--z-'))) assert.match(z, /^--z-[a-z][\w-]*$/);
});
