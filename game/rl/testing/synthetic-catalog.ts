// FAUSSES DONNÉES DE CARTES — uniquement pour tester le pipeline RL sans accès au catalogue officiel (environnement
// sans réseau, intégration continue). Les numéros, catégories, mots-clés et effets codés sont ceux des decks jouables,
// mais les noms, coûts, puissances, Contres, types et textes sont INVENTÉS. Un modèle entraîné sur ces données ne vaut
// rien pour le vrai jeu : l'environnement le signale (catalogue « synthetic ») et l'entraînement refuse de s'en servir
// sans l'option explicite allow_synthetic.
//   node --no-warnings game/rl/testing/synthetic-catalog.ts [fichier]   (défaut : data/game-catalog.synthetic.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import '../../engine/cards/index.ts';  // en premier : les fichiers de cartes et le registre s'importent mutuellement
import { ST31 } from '../../engine/cards/st31.ts';
import { ST32 } from '../../engine/cards/st32.ts';
import { ST33 } from '../../engine/cards/st33.ts';
import { ST34 } from '../../engine/cards/st34.ts';
import { ST35 } from '../../engine/cards/st35.ts';
import { ST36 } from '../../engine/cards/st36.ts';
import { DECKS } from '../../engine/decks.ts';
import type { CardBehavior, CardData, Category, Color } from '../../engine/types.ts';

export const SYNTHETIC_FILE = join(import.meta.dirname, '..', '..', '..', 'data', 'game-catalog.synthetic.json');

const BEHAVIORS: Record<string, CardBehavior> = { ...ST31, ...ST32, ...ST33, ...ST34, ...ST35, ...ST36 };

// Commentaire qui précède chaque carte codée (« // Nom : effet ») : nom et mots-clés approximatifs
function comments(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['st31', 'st32', 'st33', 'st34', 'st35', 'st36']) {
    const lines = readFileSync(join(import.meta.dirname, '..', '..', 'engine', 'cards', `${f}.ts`), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^ {2}'([A-Z0-9-]+)': /);
      if (!m) return;
      const block: string[] = [];
      for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) block.unshift(lines[j].replace(/^\s*\/\/\s?/, ''));
      out[m[1]] = block.join(' ');
    });
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SERIES: Record<string, { colors: Color[]; types: string[]; attributes: string[] }> = {
  'ST-31': { colors: ['Red'], types: ['Straw Hat Crew'], attributes: ['Strike'] },
  'ST-32': { colors: ['Green'], types: ['Land of Wano'], attributes: ['Slash'] },
  'ST-33': { colors: ['Blue'], types: ['Navy'], attributes: ['Special'] },
  'ST-34': { colors: ['Purple'], types: ['Big Mom Pirates'], attributes: ['Strike'] },
  'ST-35': { colors: ['Red', 'Black'], types: ['Revolutionary Army'], attributes: ['Special'] },
  'ST-36': { colors: ['Yellow'], types: ['Supernovas', 'Kid Pirates'], attributes: ['Strike'] },
};

const EN_NAMES: [RegExp, string][] = [
  [/Luffy/, 'Monkey.D.Luffy'], [/Zoro/, 'Roronoa Zoro'], [/Kidd?\b/, 'Eustass"Captain"Kid'], [/Katakuri/, 'Charlotte Katakuri'],
  [/Linlin/, 'Charlotte Linlin'], [/Perona/, 'Perona'], [/Nami/, 'Nami'], [/Sanji/, 'Sanji'], [/Sabo/, 'Sabo'],
  [/Kuzan/, 'Kuzan'], [/Sengoku/, 'Sengoku'], [/Garp/, 'Monkey.D.Garp'], [/Tashigi/, 'Tashigi'], [/Ryuma/, 'Ryuma'],
];

export function syntheticCatalog(): { fetchedAt: string; synthetic: true; cards: Record<string, CardData> } {
  const notes = comments();
  const cards: Record<string, CardData> = {};
  for (const deck of Object.values(DECKS)) {
    const series = SERIES[deck.series];
    for (const num of [deck.leader, ...Object.keys(deck.cards)]) {
      if (cards[num]) continue;
      const b = BEHAVIORS[num] ?? {};
      const note = notes[num] ?? '';
      const h = hash(num);
      const category: Category = num === deck.leader ? 'LEADER'
        : /\(Lieu\)/.test(note) ? 'STAGE'
        : (b.onMain || b.onCounter) && !b.onPlay && !b.whenAttacking ? 'EVENT' : 'CHARACTER';
      const name = (note.split(' : ')[0] || `Carte ${num}`).replace(/^Leader /, '').replace(/\s*\([^)]*\)/g, '').replace(/[«»"]/g, '').trim();
      const keywords: string[] = [];
      if (num !== deck.leader && /\[Bloqueur\]/.test(note) && !b.blocker) keywords.push('[Blocker]');
      if (/\[Initiative\](?! :)/.test(note) && !b.rush) keywords.push('[Rush]');
      if (/\[Initiative : Personnage\]/.test(note) && !b.rushChar) keywords.push('[Rush: Character]');
      const timings = [
        b.onPlay && '[On Play]', b.whenAttacking && '[When Attacking]', b.activateMain && '[Activate: Main]', b.onMain && '[Main]',
        b.onCounter && '[Counter]', b.onKO && '[On K.O.]', b.endOfTurn && '[End of Your Turn]',
      ].filter(Boolean);
      const effectEn = [...keywords, ...timings, timings.length ? 'Synthetic effect.' : ''].join(' ').trim() || '-';
      const cost = category === 'LEADER' ? null : category === 'EVENT' ? h % 4 : category === 'STAGE' ? 1 + (h % 2) : 1 + (h % 8);
      const power = category === 'LEADER' ? 5000 : category === 'CHARACTER' ? Math.max(0, 1000 * ((cost ?? 0) + 1) + ((h >> 3) % 3 - 1) * 1000) : null;
      const counter = category === 'CHARACTER' ? ((cost ?? 0) <= 3 ? 1000 + 1000 * ((h >> 5) % 2) : (h >> 5) % 3 ? 1000 : null) : null;
      const colors = category === 'LEADER' || series.colors.length === 1 ? series.colors : [series.colors[h % series.colors.length]];
      cards[num] = {
        number: num, imageId: num, lang: 'en', rarity: 'C', category, name: `${name} (synthétique)`,
        names: [EN_NAMES.find(([re]) => re.test(name))?.[1] ?? name],
        cost, life: category === 'LEADER' ? 4 + (h % 2) : null, power, counter, colors,
        types: series.types, typeLabels: series.types, attributes: series.attributes,
        effect: effectEn, trigger: b.onTrigger ? 'Déclenchement synthétique.' : null, effectEn,
        triggerEn: b.onTrigger ? 'Synthetic trigger.' : null, keywords: [], blocks: ['5'],
      };
    }
  }
  return { fetchedAt: new Date(0).toISOString(), synthetic: true, cards };
}

if (import.meta.main) {
  const file = process.argv[2] ?? SYNTHETIC_FILE;
  mkdirSync(dirname(file), { recursive: true });
  const catalog = syntheticCatalog();
  writeFileSync(file, `${JSON.stringify(catalog)}\n`);
  console.log(`${Object.keys(catalog.cards).length} cartes FICTIVES écrites dans ${file} (tests du pipeline uniquement)`);
}
