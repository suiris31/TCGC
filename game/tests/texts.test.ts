// Textes de l'interface (tâche R3.9) : le vocabulaire commun est appliqué partout (les anciens libellés de l'annexe A du
// cadrage ne reviennent pas dans game/ui), et un nom de carte qui contient une virgule ne fait plus croire à une carte de
// plus dans une liste (main de départ, cartes regardées)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { quoteCardNames } from '../ui/texts.ts';

const UI = join(import.meta.dirname, '..', 'ui');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(e.name) ? [path] : [];
  });
}

// ancien libellé → libellé retenu
const OLD: [RegExp, string][] = [
  [/decks? de la Cale/i, 'deck d’aventure'],
  [/Mon deck/, 'Deck d’aventure'],
  [/Deck de l[’']aventure/, 'Deck d’aventure'],
  [/🧭 Cale/, '🧭 deck d’aventure'],
  [/Jouer en ligne/, 'Jouer avec un ami'],
  [/Retour au (menu|jeu)/i, '← <écran parent>'],
  [/← (Jeu|Retour)\b/, '← <écran parent>'],
  [/>\s*Retour\s*</, '← <écran parent>'],
  [/label: 'Menu'|>\s*Menu\s*<|« Menu »/, 'Quitter (LEAVE_GAME)'],
];

test('textes : les anciens libellés ne sont plus dans game/ui', () => {
  const found: string[] = [];
  for (const file of sources(UI)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const [old, now] of OLD) {
        if (old.test(line)) found.push(`${relative(UI, file)}:${i + 1} : « ${line.trim().slice(0, 90)} » → ${now}`);
      }
    });
  }
  assert.deepEqual(found, []);
});

test('textes : un nom de carte avec une virgule est mis entre guillemets dans une liste', () => {
  const comma = Object.values(CARDS).find((c) => /^[^,]+, [^,]+$/.test(c.name))?.name;
  assert.ok(comma, 'au moins une carte du catalogue a une virgule dans son nom');
  assert.equal(
    quoteCardNames(`Main de départ : Nami, ${comma}, Zoro. La garder ?`),
    `Main de départ : Nami, « ${comma} », Zoro. La garder ?`,
  );
  // déjà entre guillemets, sans virgule, ou sans nom de carte : rien ne change
  assert.equal(quoteCardNames(`Ajouter « ${comma} » à ta main ?`), `Ajouter « ${comma} » à ta main ?`);
  assert.equal(quoteCardNames('Main de départ : Nami, Zoro. La garder ?'), 'Main de départ : Nami, Zoro. La garder ?');
  assert.equal(quoteCardNames('Choisis une carte'), 'Choisis une carte');
});
