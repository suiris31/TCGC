// Outils communs à `npm run cards:new` et `npm run game:coverage` (tâche C1.5) : choix des sets, réimpressions,
// essai du traducteur, écriture des fichiers de recettes (recipes/sets/<set>.ts) sans toucher aux relectures.
//
// Rien ici ne s'exécute pendant une partie : ce sont des outils de développement. Les rapports peuvent montrer le texte
// officiel à l'écran (pour la relecture), mais rien de ce qui est ÉCRIT dans le dépôt n'en contient : les recettes sont
// des structures, les tournures inconnues sont normalisées par le traducteur (01-contrats.md § 15.4 et § 15.8).
import { CARDS, cardStatus, HIDDEN } from '../../game/engine/cards/index.ts';
import { parseCard } from '../../game/engine/recipes/parse/index.ts';
import { RECIPE_SETS } from '../../game/engine/recipes/sets/index.ts';
import { SET_ORDER, SET_TASKS, setOf, taskOfSet } from '../../game/engine/recipes/sets/ORDER.ts';
import type { Recipe, RecipeEntry } from '../../game/engine/recipes/types.ts';
import type { CardDef } from '../../game/engine/types.ts';

export const allNums = (): string[] => Object.keys(CARDS).filter((n) => n !== HIDDEN).sort();

// Préfixes présents dans le catalogue : ceux de ORDER.ts d'abord (du plus récent au plus ancien), puis les nouveaux
export function catalogSets(): string[] {
  const present = new Set(allNums().map(setOf));
  return [...SET_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !taskOfSet(s)).sort()];
}

// « EB05 », « eb-05 », « EB05,OP17 », « S1 » (les sets de la tâche), « tout » → liste de préfixes du catalogue
export function resolveSets(arg: string): { sets: string[]; unknown: string[] } {
  const known = new Set(catalogSets());
  const sets: string[] = [];
  const unknown: string[] = [];
  for (const raw of arg.split(',').map((s) => s.trim()).filter(Boolean)) {
    const up = raw.toUpperCase().replace(/-/g, '');
    if (up === 'TOUT' || up === 'ALL') sets.push(...known);
    else if (/^S\d+$/.test(up) && SET_TASKS.some((t) => t.task === up)) sets.push(...SET_TASKS.find((t) => t.task === up)!.sets.filter((s) => known.has(s)));
    else if (known.has(up)) sets.push(up);
    else unknown.push(raw);
  }
  return { sets: [...new Set(sets)], unknown };
}

export const cardsOfSet = (set: string): string[] => allNums().filter((n) => setOf(n) === set);

// ---------- Recettes déjà écrites ----------

export interface IndexedEntry { set: string; entry: RecipeEntry }

export function recipeIndex(): Map<string, IndexedEntry> {
  const m = new Map<string, IndexedEntry>();
  for (const rs of RECIPE_SETS) for (const [num, entry] of Object.entries(rs.entries)) m.set(num, { set: rs.set, entry });
  return m;
}

// Niveau tel que l'écrivent les fichiers (une entrée l'emporte : un doute « handCoded » rend la carte non jouable),
// sinon l'ancien statut. Le jeu, lui, lit confidence() (C1.1) : les deux doivent finir par coïncider.
export function fileLevel(num: string, index: Map<string, IndexedEntry>): 'coded' | 'auto' | 'todo' | RecipeEntry['level'] {
  const e = index.get(num)?.entry;
  if (e?.level === 'doubt') return 'doubt';
  const status = cardStatus(num);
  if (status === 'coded') return 'coded';
  if (e) return e.level;
  return status;
}

// ---------- Réimpressions ----------

// Même texte anglais (effet et [Déclenchement]), rappels de règle et différences d'écriture retirés. Clé vide : la
// carte n'a pas d'effet (rien à reprendre).
export function textKey(d: Pick<CardDef, 'effectEn' | 'triggerEn'>): string {
  const norm = (s: string | null) => (s ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  const effect = norm(d.effectEn);
  const trigger = norm(d.triggerEn);
  return effect || trigger ? `${effect} || ${trigger}` : '';
}

// Numéros groupés par texte (seulement les textes partagés par au moins deux cartes)
export function sameTextGroups(): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const n of allNums()) {
    const k = textKey(CARDS[n]!);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), n]);
  }
  const out = new Map<string, string[]>();
  for (const [k, nums] of byKey) if (nums.length > 1) out.set(k, nums);
  return out;
}

export function sameTextAs(num: string, groups: Map<string, string[]>): string[] {
  const k = textKey(CARDS[num]!);
  return (groups.get(k) ?? []).filter((n) => n !== num);
}

// Ce qu'une réimpression peut reprendre : la recette d'une autre carte au même texte (vérifiée de préférence), ou le
// signalement d'une carte codée à la main (son CardBehavior se reprend dans cards/<set>.ts, une ligne).
export type Reprint =
  | { kind: 'recipe'; from: string; entry: RecipeEntry }
  | { kind: 'coded'; from: string };

// `others` : les autres cartes au même texte (sameTextAs)
export function findReprint(others: string[], index: Map<string, IndexedEntry>): Reprint | null {
  const rank = { verified: 0, doubt: 1, generated: 2 } as const;
  const withRecipe = others.map((n) => ({ n, e: index.get(n)?.entry })).filter((x) => x.e?.recipe)
    .sort((a, b) => rank[a.e!.level] - rank[b.e!.level] || a.n.localeCompare(b.n));
  if (withRecipe.length) return { kind: 'recipe', from: withRecipe[0]!.n, entry: withRecipe[0]!.e! };
  const coded = others.find((n) => cardStatus(n) === 'coded');
  return coded ? { kind: 'coded', from: coded } : null;
}

// Entrée reprise : même recette sous le nouveau numéro, même niveau (le doute aussi : c'est la même question)
export function reprintEntry(num: string, from: string, src: RecipeEntry): RecipeEntry {
  const out: RecipeEntry = { level: src.level, recipe: { ...src.recipe!, num }, note: `réimpression de ${from}` };
  if (src.doubt) out.doubt = src.doubt;
  return out;
}

// ---------- Essai du traducteur ----------

export interface Translation { num: string; ok: boolean; recipe?: Recipe; unknown: string[] }

export function translate(num: string): Translation {
  const d = CARDS[num]!;
  try {
    const r = parseCard({ num, effectEn: d.effectEn ?? '', triggerEn: d.triggerEn ?? null });
    return r.ok ? { num, ok: true, recipe: r.recipe, unknown: [] } : { num, ok: false, unknown: r.unknown };
  } catch (e) {
    return { num, ok: false, unknown: [`erreur du traducteur : ${(e as Error).message}`] };
  }
}

// Tournures inconnues classées par fréquence (nombre de cartes) ; chaque tournure est déjà normalisée par le traducteur
export interface Phrase { phrase: string; cards: string[] }
export function unknownByFrequency(results: Translation[]): Phrase[] {
  const m = new Map<string, Set<string>>();
  for (const r of results) for (const u of r.unknown) {
    // le squelette rend « OP01-001 : ... » : on retire le numéro pour regrouper
    const phrase = u.replace(/^[A-Z]+\d*-\d+\s*:\s*/, '');
    m.set(phrase, (m.get(phrase) ?? new Set()).add(r.num));
  }
  return [...m].map(([phrase, s]) => ({ phrase, cards: [...s].sort() }))
    .sort((a, b) => b.cards.length - a.cards.length || a.phrase.localeCompare(b.phrase));
}

// ---------- Formulations à risque (étude C0, § 6) : à relire avec attention, et à vérifier dans les Q&A ----------

const RISKS: [string, RegExp][] = [
  ['remplacement', /\bwould\b[^.]*\binstead\b/i],
  ['dépend du paiement (If you do / don\'t)', /If you (do|don't)/i],
  ['total combiné', /a total of|total cost/i],
  ['valeur calculée', /for every|equal to or (less|more) than the (number|total)|equal to the number/i],
  ['ne peut pas quitter le terrain', /cannot be removed from the field|cannot be (KO'd|rested)/i],
  ['annulation', /Negate/i],
  ['l\'adversaire choisit', /your opponent (chooses|may)/i],
  ['durée rare', /until the (start|end) of your next turn|during your opponent's next turn/i],
  ['règles changées', /Under the rules of this game|according to the rules/i],
  ['évènement « When »', /(^|\n|\] )When /],
  ['« Then » après un choix', /Choose one:[\s\S]*Then,/i],
];

export function risks(num: string): string[] {
  const d = CARDS[num]!;
  const text = `${d.effectEn ?? ''}\n${d.triggerEn ?? ''}`;
  return RISKS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

// ---------- Écriture des fichiers de recettes ----------

export const setFile = (set: string) => `${set.toLowerCase()}.ts`;
export const setExport = (set: string) => `RECIPES_${set.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
export const END_MARK = '// cards:new : nouvelles entrées au-dessus de cette ligne';

// Valeur → littéral TypeScript sur une ligne (clés sans guillemets quand c'est possible, chaînes entre apostrophes)
export function lit(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (typeof v === 'object') {
    const fields = Object.entries(v as object).filter(([, x]) => x !== undefined);
    if (!fields.length) return '{}';
    return `{ ${fields.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}: ${lit(x)}`).join(', ')} }`;
  }
  throw new Error(`valeur impossible à écrire : ${typeof v}`);
}

export const entryLine = (num: string, e: RecipeEntry) => `    ${lit(num)}: ${lit(e)},`;

// Une ligne écrite par cards:new et pas encore relue : seule sorte de ligne que --regenerer remplace
const generatedLine = (num: string) => new RegExp(`^\\s*${lit(num).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\{ level: 'generated', .*\\},\\s*$`);

export function newSetSource(set: string): string {
  return [
    `// Recettes de ${set} (étape C) : la structure des effets, jamais leur texte (01-contrats.md § 15.8).`,
    `// Écrit par \`npm run cards:new -- ${set}\` (niveau 'generated'), puis relu par la tâche « set » : une recette relue`,
    "// et prouvée passe 'verified' à la main ; une lecture douteuse passe 'doubt', avec sa question.",
    '// cards:new ajoute les nouvelles entrées au-dessus du repère de fin et, avec --regenerer, ne remplace que les lignes',
    "// 'generated' restées sur une ligne ; tout le reste (relectures, notes, mises en forme) est gardé tel quel.",
    "import type { RecipeSet } from '../types.ts';",
    '',
    `export const ${setExport(set)}: RecipeSet = {`,
    `  set: ${lit(set)},`,
    '  entries: {',
    `    ${END_MARK}`,
    '  },',
    '};',
    '',
  ].join('\n');
}

export interface SetUpdate { src: string; added: string[]; replaced: string[]; kept: string[] }

// Ajoute des entrées (nouveaux numéros) et en remplace (lignes 'generated' sur une ligne) ; les autres sont gardées et
// signalées dans `kept`. Fonction pure : le script lit et écrit le fichier.
export function updateSetSource(src: string | null, set: string, add: Map<string, RecipeEntry>, replace: Map<string, RecipeEntry>): SetUpdate {
  let text = src ?? newSetSource(set);
  const lines = text.split('\n');
  const added: string[] = [];
  const replaced: string[] = [];
  const kept: string[] = [];
  for (const [num, e] of replace) {
    const i = lines.findIndex((l) => generatedLine(num).test(l));
    if (i < 0) { kept.push(num); continue; }
    const line = entryLine(num, e);
    if (lines[i] !== line) { lines[i] = line; replaced.push(num); }
  }
  const mark = lines.findIndex((l) => l.trim() === END_MARK);
  if (add.size && mark < 0) throw new Error(`repère de fin absent dans ${setFile(set)} : remettre la ligne « ${END_MARK} » à la fin des entrées`);
  const fresh = [...add].filter(([num]) => !lines.some((l) => l.trimStart().startsWith(`${lit(num)}:`)));
  for (const [num] of add) if (!fresh.some(([n]) => n === num)) kept.push(num);
  if (fresh.length) {
    lines.splice(mark, 0, ...fresh.map(([num, e]) => entryLine(num, e)));
    added.push(...fresh.map(([num]) => num));
  }
  text = lines.join('\n');
  return { src: text, added, replaced, kept };
}

// Point d'enregistrement recipes/sets/index.ts : une ligne d'import et une entrée à la fin de RECIPE_SETS. null si le
// set y est déjà.
export function registerSet(indexSrc: string, set: string): string | null {
  const file = setFile(set);
  if (indexSrc.includes(`'./${file}'`)) return null;
  const name = setExport(set);
  const lines = indexSrc.split('\n');
  const lastImport = lines.reduce((at, l, i) => (l.startsWith('import ') ? i : at), -1);
  lines.splice(lastImport + 1, 0, `import { ${name} } from './${file}';`);
  const out = lines.join('\n');
  const m = out.match(/(export const RECIPE_SETS[^=]*=\s*\[[\s\S]*?)(\n\];)/);
  if (!m) throw new Error('RECIPE_SETS introuvable dans recipes/sets/index.ts');
  return out.replace(m[0], `${m[1]}\n  ${name},${m[2]}`);
}
