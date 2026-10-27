// Lisibilité des cartes (tâche R2.5) : contraste des pastilles posées sur le visuel (puissance, coût, états, Contre,
// conseil), calculé d'après les couleurs de game/ui/styles/tokens.css. Le fond des pastilles est presque opaque : on
// le compose avec un visuel blanc (le pire cas pour un texte clair).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');
const tokens = readFileSync(join(ROOT, 'game/ui/styles/tokens.css'), 'utf8');
const card = readFileSync(join(ROOT, 'game/ui/styles/card.css'), 'utf8');

type Rgba = [number, number, number, number];

function color(name: string): Rgba {
  const value = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  assert.ok(value, `--${name} absent de tokens.css`);
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map((x) => Number(x.trim()));
  assert.ok(rgba, `--${name} : couleur illisible (${value})`);
  return [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
}

const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];

function luminance([r, g, b]: Rgba) {
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: Rgba, bg: Rgba) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const WHITE: Rgba = [255, 255, 255, 1];

test('cartes : les pastilles sont sur le fond presque opaque --ink-a92', () => {
  for (const sel of ['.badge {', '.op-card-state {', '.don-chips b {']) {
    const rule = card.slice(card.indexOf(sel), card.indexOf('}', card.indexOf(sel)));
    assert.match(rule, /background: var\(--ink-a92\)/, sel);
  }
});

test('cartes : contraste des pastilles ≥ 4,5:1, même sur un visuel blanc', () => {
  const badge = over(color('ink-a92'), WHITE);
  const pairs: [string, Rgba, Rgba][] = [
    ['puissance', color('text'), badge],
    ['puissance augmentée, coût réduit', color('green'), badge],
    ['puissance diminuée, trop cher', color('red-soft'), badge],
    ['état « atout »', color('accent-light'), badge],
    ['état « entrave »', color('red-soft'), badge],
    ['état « info »', color('text-ice'), badge],
    ['DON!! au-delà de 5', color('accent'), badge],
    ['valeur de Contre', color('on-green'), color('green')],
    ['conseil du coach (★)', color('accent-ink'), color('accent')],
  ];
  for (const [what, fg, bg] of pairs) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${what} : ${ratio.toFixed(2)}:1`);
  }
});
