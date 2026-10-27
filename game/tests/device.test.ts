// La mise en page « compacte » n'a qu'une source : les requêtes de device.ts, traduites en classes posées sur .opc.
// Les feuilles de styles/ lisent ces classes et ne recopient plus les requêtes en @media.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { COMPACT, deviceClasses, LANDSCAPE, PORTRAIT } from '../ui/device.ts';

test('appareil : classes posées sur .opc selon le format', () => {
  assert.equal(deviceClasses({ portrait: false, landscape: false }), '');
  assert.equal(deviceClasses({ portrait: true, landscape: false }), ' is-compact is-portrait');
  assert.equal(deviceClasses({ portrait: false, landscape: true }), ' is-compact is-landscape');
  assert.equal(COMPACT, `${PORTRAIT}, ${LANDSCAPE}`);
});

test('appareil : aucune feuille du jeu ne recopie les requêtes de device.ts', () => {
  const dir = join(import.meta.dirname, '..', 'ui', 'styles');
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const css = norm(readFileSync(join(dir, f), 'utf8'));
    for (const q of [PORTRAIT, LANDSCAPE]) assert.ok(!css.includes(`@media ${q}`), `${f} : @media ${q}`);
  }
});
