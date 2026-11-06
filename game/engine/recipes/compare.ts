// Aller-retour (tâche C1.2) : la recette, redite par describe(), est mise en face du texte officiel.
//
// On ne compare pas des phrases mot à mot (deux rédactions d'un même effet diffèrent toujours un peu) : on tire des deux
// textes leurs FAITS (nombres et leur signe, « or less » / « or more », « up to » / « all », camp et sorte des cibles,
// durées, moments, mots-clés, types, noms, attributs, couleurs, états, liens « Then » / « If you do », verbes) et on
// compare ces listes. Une recette fausse d'un seul chiffre, d'une cible ou d'une durée change un fait : elle ressort.
// Les mots qui diffèrent encore sont signalés à part, pour la relecture (écart « texte », sans gravité).
//
// Texte français (s'il existe) : ses valeurs sont comparées à celles de la recette (nombres, durées, moments, mots-clés,
// « jusqu'à », camp adverse, attributs), avec ses propres tournures ; les types et les noms y sont traduits, on ne les
// compare pas.
//
// Les écarts ne contiennent que des valeurs et des tournures à trous (chiffres, types et noms remplacés) : jamais une
// phrase de carte (01-contrats.md § 15.8).
import { CARDS } from '../cards/index.ts';
import { typeLabel } from '../cards/bricks.ts';
import { describe, type DescribeOptions } from './describe.ts';
import { normalize } from './parse/normalize.ts';
import { RECIPE_SETS } from './sets/index.ts';
import type { Category, Recipe } from './types.ts';

export type EcartKind =
  | 'nombre' | 'comparaison' | 'quantité' | 'cible' | 'durée' | 'moment' | 'mot-clé' | 'type' | 'nom' | 'attribut'
  | 'couleur' | 'état' | 'lien' | 'verbe' | 'texte' | 'recette' | 'description';

export interface Ecart {
  lang: 'en' | 'fr';
  kind: EcartKind;
  // 'erreur' : la recette ne dit pas la même chose que le texte ; 'info' : à relire (mots différents, ou valeur
  // peut-être portée par le code à la main d'une carte qui en a)
  severity: 'erreur' | 'info';
  text: string[];                 // valeurs que seul le texte officiel contient (une par occurrence)
  recipe: string[];               // valeurs que seule la recette contient
  message: string;
}

export interface CompareInput {
  en: string;                     // texte officiel anglais (effet, puis « [Trigger] ... » s'il y en a un)
  fr?: string | null;             // texte officiel français, s'il existe (effet, puis « [Déclenchement] ... »)
}

// ---------- Normalisation (celle du traducteur, étude C0 § 3) ----------

// Celle du traducteur (parse/normalize.ts, C1.4) : la phrase de describe se compare au texte lu par le traducteur
export function normalizeEn(t: string): string {
  return normalize(t);
}

export function normalizeFr(t: string): string {
  return t
    .replace(/\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/[−－–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/K\.O\./g, 'KO')
    .replace(/[➀①]/g, '①').replace(/[➁②]/g, '②').replace(/[➂③]/g, '③').replace(/[➃④]/g, '④')
    .replace(/[\s ]+/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/^\s*-\s*$/, '')
    .trim();
}

// Tournure à trous d'un morceau : chiffres, types, noms, attributs et guillemets remplacés (rien d'une carte ne reste)
export function template(part: string): string {
  return part.replace(/\{[^}]+\}/g, '{T}').replace(/<[^>]+>/g, '<A>')
    .replace(/\[(?!(?:On Play|When Attacking|Activate: Main|Main|Counter|Trigger|On KO|On Block|Blocker|Rush|Double Attack|Banish|Unblockable|Once Per Turn|Your Turn|Opponent's Turn|DON!! x\d+)\])[^\]]+\]/g, '[X]')
    .replace(/"[^"]+"/g, '"X"').replace(/\d+/g, 'N');
}

// ---------- Faits d'un texte ----------

export interface Fact { kind: EcartKind; value: string }

const EN_TAGS: Record<string, string> = {
  'On Play': 'onPlay', 'When Attacking': 'whenAttacking', 'On Block': 'onBlock', 'On KO': 'onKO',
  'End of Your Turn': 'endOfTurn', "End of Your Opponent's Turn": 'endOfOppTurn', "On Your Opponent's Attack": 'onOppAttack',
  'Activate: Main': 'activateMain', Main: 'main', Counter: 'counter', Trigger: 'trigger',
  'Your Turn': 'yourTurn', "Opponent's Turn": 'oppTurn', 'Once Per Turn': 'oncePerTurn',
};
const FR_TAGS: Record<string, string> = {
  Jouée: 'onPlay', 'En attaquant': 'whenAttacking', 'En bloquant': 'onBlock', 'En cas de KO': 'onKO',
  'Fin de votre tour': 'endOfTurn', 'Fin du tour adverse': 'endOfOppTurn', 'Attaque adverse': 'onOppAttack',
  'Activation : Principale': 'activateMain', 'Activation: Principale': 'activateMain', Principale: 'main', Contre: 'counter',
  Déclenchement: 'trigger', 'Votre tour': 'yourTurn', 'Tour adverse': 'oppTurn', 'Une fois par tour': 'oncePerTurn',
};
const EN_KEYWORDS = ['Blocker', 'Rush', 'Rush: Character', 'Double Attack', 'Banish', 'Unblockable'];
const FR_KEYWORDS: Record<string, string> = {
  Bloqueur: 'Blocker', Initiative: 'Rush', 'Initiative : Personnage': 'Rush: Character', 'Initiative: Personnage': 'Rush: Character',
  'Double attaque': 'Double Attack', Exil: 'Banish', Imblocable: 'Unblockable',
};
const FR_ATTRIBUTES: Record<string, string> = { Tranche: 'Slash', Frappe: 'Strike', Distance: 'Ranged', Spécial: 'Special', Sagesse: 'Wisdom' };

const EN_DURATIONS: [RegExp, string][] = [
  [/\b(?:during|for) this battle\b/gi, 'battle'],
  [/\b(?:during|for|until the end of) this turn\b/gi, 'turn'],
  [/\buntil the end of your opponent's next (?:End Phase|turn)\b/gi, 'oppNextEnd'],
  [/\bduring your opponent's next turn\b/gi, 'oppNextEnd'],
  // « until the start of your next turn » dure jusqu'à la fin du tour adverse (n° 389 et 1300), comme le lit le traducteur
  [/\buntil the start of your next turn\b/gi, 'oppNextEnd'],
  [/\buntil the end of your next turn\b/gi, 'nextTurn'],
];
const FR_DURATIONS: [RegExp, string][] = [
  [/\b(?:pour tout le|pendant ce|durant ce|lors de ce) combat\b/gi, 'battle'],
  [/\b(?:pour tout le|pendant ce|durant ce|jusqu'à la fin du|jusqu'à la fin de ce) tour(?:-ci)?(?! adverse| de votre adversaire| o[ùu])\b/gi, 'turn'],
  [/\bjusqu'à la fin (?:de la prochaine phase de Fin (?:de votre adversaire|adverse)|du prochain tour (?:adverse|de votre adversaire))/gi, 'oppNextEnd'],
  [/\b(?:pendant|durant) le prochain tour (?:adverse|de votre adversaire)\b/gi, 'oppNextEnd'],
  [/\bjusqu'au début de votre prochain tour\b/gi, 'oppNextEnd'],
  [/\bjusqu'à la fin de votre prochain tour\b/gi, 'nextTurn'],
];

const EN_VERBS: Record<string, string> = {
  ko: 'KO', "ko'd": 'KO', rest: 'rest', return: 'return', returns: 'return', place: 'place', places: 'place', trash: 'trash',
  trashes: 'trash', trashed: 'trash', give: 'give', gains: 'give', gain: 'give', draw: 'draw', look: 'look', reveal: 'reveal',
  play: 'play', plays: 'play', add: 'add', negate: 'negate', negated: 'negate', cannot: 'cannot', set: 'set', activate: 'activate',
};
const COLORS = ['red', 'green', 'blue', 'purple', 'black', 'yellow'];

// Faits du texte anglais normalisé (officiel, ou rédigé par describe : la même lecture des deux côtés)
export function factsEn(text: string): Fact[] {
  const out: Fact[] = [];
  const add = (kind: EcartKind, value: string) => out.push({ kind, value });
  let s = ` ${text.replace(/«[^»]*»/g, ' ')} `;   // morceaux « code à la main » : rien à comparer
  // « You may rest 1 of your DON!! cards: » et « ①: » : le même coût (le traducteur lit les deux en restDon)
  s = s.replace(/\b[Yy]ou may rest ([1-4]) of your DON!! cards?:/g, (_, n: string) => `${'①②③④'[+n - 1]}:`);
  // C2.4 : « You may rest 1 of your DON!! cards and (rest) this Character / trash ...: » : ① puis le reste du coût
  // (vieilles cartes : « Rest 1 of your DON!! cards and you may rest this Character: »)
  s = s.replace(/\b(?:[Yy]ou may )?[Rr]est ([1-4]) of your DON!! cards? and (?:you may )?(?=[^:.]*:)(this (?:Character|Leader|card)\b)?/g,
    (_, n: string, self?: string) => `${'①②③④'[+n - 1]}: You may ${self ? `rest ${self}` : ''}`);
  // C2.4 : « add up to 1 DON!! card as rested from your DON!! deck » (EB05, OP17) et « ... from your DON!! deck and rest
  // it » : le même effet (le traducteur lit les deux en addDon)
  s = s.replace(/\b([Aa]dd (?:up to )?(\d+) DON!! cards?) as (active|rested) from your DON!! deck\b/g,
    (_, head: string, n: string, st: string) => `${head} from your DON!! deck and ${st === 'active' ? 'set' : 'rest'} ${n === '1' ? 'it' : 'them'}${st === 'active' ? ' as active' : ''}`);
  // S4 : « your 1 active Leader » / « your active Leader » (coût leaderPowerMinus) ; « you only have X Characters » / « the
  // only Characters on your field are X Characters » (condition onlyChars) : les mêmes faits
  s = s.replace(/\byour 1 active Leader\b/g, 'your active Leader');
  s = s.replace(/\byou only have (?=[^,.:]*\bCharacters\b)/g, 'the only Characters on your field are ');
  // S1 : « up to 1 of your Leader or up to 1 of your Characters » (EB05) : la même cible que « up to 1 of your Leader or
  // Characters » (un seul choix parmi le Leader et les Personnages)
  s = s.replace(/\bup to (\d+) of your Leader or up to \1 of your Characters\b/g, 'up to $1 of your Leader or Characters');
  // « give 1 active DON!! card to 1 of your Leader » : le Leader, sans choix (describe écrit « to your Leader ») ; pas
  // « up to 1 of your Leader » (un choix)
  s = s.replace(/(?<![Uu]p )\bto 1 of your Leader\b(?!s| or)/g, 'to your Leader');
  s = s.replace(/\[([^\]]+)\]/g, (_, tag: string) => {
    let m: RegExpMatchArray | null;
    if (EN_TAGS[tag]) add('moment', EN_TAGS[tag]);
    else if ((m = tag.match(/^DON!! x(\d+)$/))) add('moment', `DON!! x${m[1]}`);
    else if (EN_KEYWORDS.includes(tag)) add('mot-clé', tag);
    else add('nom', tag);
    return ' § ';
  });
  s = s.replace(/\{([^}]+)\}/g, (_, t) => { add('type', t); return ' § '; });
  s = s.replace(/<([^>]+)>/g, (_, a) => { add('attribut', a); return ' § '; });
  s = s.replace(/"([^"]+)"/g, (_, t) => { add('type', `includes:${t}`); return ' § '; });
  for (const [re, d] of EN_DURATIONS) s = s.replace(re, () => { add('durée', d); return ' § '; });
  s = s.replace(/[①②③④]/g, (c) => { add('nombre', `①${'①②③④'.indexOf(c) + 1}`); return ' § '; });
  for (const m of s.matchAll(/(^|[^\w])([+-]?)(\d+)(?!\w)/g)) add('nombre', `${m[2]}${m[3]}`);
  for (const m of s.matchAll(/\bor (less|more)\b/gi)) add('comparaison', `or ${m[1].toLowerCase()}`);
  for (const _ of s.matchAll(/\bup to\b/gi)) add('quantité', 'up to');
  for (const _ of s.matchAll(/\ball\b/gi)) add('quantité', 'all');
  for (const _ of s.matchAll(/\byour opponent\b/gi)) add('cible', 'adverse');
  for (const m of s.matchAll(/\bthis (Character|Leader|Stage|card)\b/gi)) add('cible', `this ${m[1]}`);
  for (const m of s.replace(/\bthis (?:Character|Leader|Stage|card)\b/gi, ' ').matchAll(/\b(Leader|Character|Stage|Event)s?\b/g)) add('cible', m[1]);
  for (const m of s.matchAll(/\b(rested|active)\b/gi)) add('état', m[1].toLowerCase());
  for (const m of s.matchAll(new RegExp(`\\b(${COLORS.join('|')})\\b`, 'gi'))) add('couleur', m[1].toLowerCase());
  // « Then, B » et « A, then B » (dans une même phrase) : le même enchaînement
  for (const _ of s.matchAll(/\bthen\b/gi)) add('lien', 'then');
  // « If you do, » / « If you don't, » (et non « If you don't have [X], », qui est une condition)
  for (const _ of s.matchAll(/\bIf you do(?: so)?,/gi)) add('lien', 'ifYouDo');
  for (const _ of s.matchAll(/\bIf you don't,/gi)) add('lien', 'ifNotYouDo');
  for (const _ of s.replace(/\bIf you (?:do(?: so)?|don't),/gi, ' ').matchAll(/\bif\b/gi)) add('lien', 'if');
  for (const _ of s.matchAll(/\bChoose one\b/gi)) add('lien', 'chooseOne');
  for (const _ of s.matchAll(/\byou may\b/gi)) add('lien', 'may');
  for (const _ of s.matchAll(/\bWhen\b/g)) add('moment', 'when');
  for (const m of s.toLowerCase().matchAll(/[a-z']+/g)) if (EN_VERBS[m[0]]) add('verbe', EN_VERBS[m[0]]);
  return out;
}

// Faits du texte français officiel : seulement ceux qui se lisent sans ambiguïté dans les deux langues
export function factsFr(text: string): Fact[] {
  const out: Fact[] = [];
  const add = (kind: EcartKind, value: string) => out.push({ kind, value });
  let s = ` ${text} `;
  s = s.replace(/\[([^\]]+)\]/g, (_, tag: string) => {
    let m: RegExpMatchArray | null;
    if (FR_TAGS[tag]) add('moment', FR_TAGS[tag]);
    else if ((m = tag.match(/^DON!! ?x(\d+)$/i))) add('moment', `DON!! x${m[1]}`);
    else if (FR_KEYWORDS[tag]) add('mot-clé', FR_KEYWORDS[tag]);
    return ' § ';
  });
  s = s.replace(/\{[^}]+\}/g, ' § ');
  s = s.replace(/<([^>]+)>/g, (_, a: string) => { add('attribut', FR_ATTRIBUTES[a] ?? a); return ' § '; });
  s = s.replace(/"[^"]+"/g, ' § ');
  for (const [re, d] of FR_DURATIONS) s = s.replace(re, () => { add('durée', d); return ' § '; });
  s = s.replace(/[①②③④]/g, (c) => { add('nombre', `①${'①②③④'.indexOf(c) + 1}`); return ' § '; });
  for (const m of s.matchAll(/(^|[^\w])[+-]?(\d+)(?!\w)/g)) add('nombre', m[2]);
  // « jusqu'à 1 » (quantité), mais pas « jusqu'à la fin du tour » (durée) ; \b ne voit pas le « à »
  for (const _ of s.matchAll(/(?<![\wÀ-ÿ])jusqu'(?!à la fin|au début|à ce que)(?:à|au)(?=\s)/gi)) add('quantité', 'up to');
  return out;
}

// Les faits de l'anglais que le français permet de vérifier, sous la même forme. Les nombres sans leur signe (la VF
// écrit « réduisez de 2 le coût »), et sans les « 1 » : la VF en ajoute ou en retire au fil de sa rédaction (« jusqu'à 1
// Personnage ou jusqu'à 1 carte DON!! », ① écrit « 1 de vos cartes DON!! ») ; les autres valeurs suffisent, et l'anglais
// vérifie déjà chaque « 1 » (mesure sur les 1 857 cartes en VF du catalogue : 41 cartes à écart de nombres avant ce
// choix, presque toutes pour des « 1 » ; 2 après, dont une VF qui est celle d'une autre carte).
const FR_CHECKED: EcartKind[] = ['nombre', 'durée', 'moment', 'mot-clé', 'quantité', 'attribut'];
export function asFr(facts: Fact[]): Fact[] {
  return facts.filter((f) => FR_CHECKED.includes(f.kind) && !(f.kind === 'quantité' && f.value === 'all')
    && !(f.kind === 'moment' && f.value === 'when'))
    .map((f) => (f.kind === 'nombre' ? { ...f, value: f.value.replace(/^[+-]|^①/, '') } : f))
    .filter((f) => !(f.kind === 'nombre' && f.value === '1'))
    // « jusqu'à » : présent ou non (la VF le répète ou le met en facteur : 34 cartes sur 1 857 en comptant)
    .filter((f, i, all) => f.kind !== 'quantité' || all.findIndex((g) => g.kind === 'quantité') === i);
}

// ---------- Comparaison ----------

const KIND_ORDER: EcartKind[] = [
  'nombre', 'comparaison', 'quantité', 'cible', 'durée', 'moment', 'mot-clé', 'type', 'nom', 'attribut', 'couleur', 'état',
  'lien', 'verbe',
];
const KIND_LABEL: Record<EcartKind, string> = {
  nombre: 'nombres', comparaison: '« ou moins / ou plus »', quantité: '« jusqu\'à / tous »', cible: 'cibles', durée: 'durées',
  moment: 'moments', 'mot-clé': 'mots-clés', type: 'types', nom: 'noms', attribut: 'attributs', couleur: 'couleurs',
  état: 'états (épuisé / redressé)', lien: 'enchaînements et conditions', verbe: 'actions', texte: 'mots',
  recette: 'recette', description: 'description',
};

function diffFacts(lang: 'en' | 'fr', text: Fact[], recipe: Fact[], hasManual: boolean): Ecart[] {
  const out: Ecart[] = [];
  for (const kind of KIND_ORDER) {
    const count = (fs: Fact[]) => {
      const m = new Map<string, number>();
      for (const f of fs) if (f.kind === kind) m.set(f.value, (m.get(f.value) ?? 0) + 1);
      return m;
    };
    const a = count(text);
    const b = count(recipe);
    const onlyText: string[] = [];
    const onlyRecipe: string[] = [];
    for (const v of new Set([...a.keys(), ...b.keys()])) {
      const d = (a.get(v) ?? 0) - (b.get(v) ?? 0);
      for (let i = 0; i < Math.abs(d); i++) (d > 0 ? onlyText : onlyRecipe).push(v);
    }
    if (!onlyText.length && !onlyRecipe.length) continue;
    // Une carte en partie codée à la main : ce que le texte dit en plus est peut-être dans le code
    const severity = hasManual && !onlyRecipe.length ? 'info' : 'erreur';
    const show = (xs: string[]) => (xs.length ? xs.map((x) => (kind === 'nom' ? '[X]' : x)).join(', ') : '—');
    out.push({
      lang, kind, severity, text: onlyText, recipe: onlyRecipe,
      message: `${lang === 'en' ? 'VO' : 'VF'}, ${KIND_LABEL[kind]} : texte ${show(onlyText)} ; recette ${show(onlyRecipe)}`
        + (severity === 'info' ? ' (peut-être dans le code à la main)' : ''),
    });
  }
  return out;
}

// Mots comparés pour la relecture : minuscules, sans ponctuation ni petits mots, quelques équivalences de rédaction
function words(s: string): string[] {
  return s.replace(/«[^»]*»/g, ' ').toLowerCase()
    .replace(/\bk\.?o\.?'d\b/g, 'ko').replace(/\bk\.o\./g, 'ko')
    .replace(/\b(characters|cards|stages|leaders|events)\b/g, (w) => w.slice(0, -1))
    .replace(/\bgains\b/g, 'gain').replace(/\bthem\b/g, 'it').replace(/\btheir owner's\b/g, "the owner's")
    .replace(/\bfor this (battle|turn)\b/g, 'during this $1')
    .match(/[a-z0-9!+\-'{}<>[\]①②③④"]+/g)?.filter((w) => !['a', 'an', 'the', 'of', 'and', ','].includes(w)) ?? [];
}

// Plus longue sous-suite commune ; rend les morceaux qui diffèrent
function hunks(a: string[], b: string[]): { text: string[]; recipe: string[] }[] {
  const n = a.length; const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { text: string[]; recipe: string[] }[] = [];
  let i = 0; let j = 0; let cur: { text: string[]; recipe: string[] } | null = null;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { if (cur) { out.push(cur); cur = null; } i++; j++; continue; }
    cur ??= { text: [], recipe: [] };
    if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) cur.recipe.push(b[j++]);
    else cur.text.push(a[i++]);
  }
  if (cur) out.push(cur);
  return out;
}

function hasManualPart(recipe: Recipe): boolean {
  return /"kind":"manual"|"on":"other"/.test(JSON.stringify(recipe));
}

// Compare une recette à des textes officiels donnés (les tests construisent ces textes eux-mêmes)
export function compareTexts(recipe: Recipe, input: CompareInput, opts: DescribeOptions = {}): Ecart[] {
  const d = describe(recipe, opts);
  if (!d.ok) {
    return [{ lang: 'en', kind: 'description', severity: 'erreur', text: [], recipe: d.missing, message: `description impossible : ${d.missing.join(' ; ')}` }];
  }
  const manualPart = hasManualPart(recipe);
  const en = normalizeEn(input.en);
  const mine = factsEn(d.en);
  const out = diffFacts('en', factsEn(en), mine, manualPart);
  if (input.fr) out.push(...diffFacts('fr', asFr(factsFr(normalizeFr(input.fr))), asFr(mine), manualPart));
  // Relecture : les mots qui diffèrent encore (tournures à trous seulement)
  const diff = hunks(words(en), words(d.en)).filter((h) => h.text.length + h.recipe.length > 0);
  if (diff.length) {
    const show = (xs: string[]) => template(xs.join(' ')) || '—';
    out.push({
      lang: 'en', kind: 'texte', severity: 'info',
      text: diff.map((h) => show(h.text)), recipe: diff.map((h) => show(h.recipe)),
      message: `VO, mots : ${diff.slice(0, 4).map((h) => `« ${show(h.text)} » / « ${show(h.recipe)} »`).join(' ; ')}${diff.length > 4 ? ` ; ... (${diff.length})` : ''}`,
    });
  }
  return out;
}

// Texte officiel d'une carte du catalogue chargé, sous la forme attendue par compareTexts
export function officialTexts(num: string): CompareInput | null {
  const c = CARDS[num];
  if (!c) return null;
  const en = `${c.effectEn ?? ''}${c.triggerEn ? `\n[Trigger] ${c.triggerEn}` : ''}`;
  const fr = c.lang === 'fr' ? `${c.effect ?? ''}${c.trigger ? `\n[Déclenchement] ${c.trigger}` : ''}` : null;
  return { en, fr };
}

export function recipeOf(num: string): Recipe | undefined {
  for (const rs of RECIPE_SETS) {
    const e = rs.entries[num];
    if (e?.recipe) return e.recipe;
  }
  return undefined;
}

// Les écarts entre la recette d'une carte (recipes/sets/) et son texte officiel. Liste vide : rien ne diffère.
export function compare(num: string, recipe: Recipe | undefined = recipeOf(num)): Ecart[] {
  if (!recipe) return [{ lang: 'en', kind: 'recette', severity: 'erreur', text: [], recipe: [], message: `${num} : pas de recette` }];
  const texts = officialTexts(num);
  if (!texts) return [{ lang: 'en', kind: 'recette', severity: 'erreur', text: [], recipe: [], message: `${num} : carte absente du catalogue` }];
  const category: Category | undefined = CARDS[num]?.category;
  return compareTexts(recipe, texts, { category, typeLabel });
}

// Des écarts qui empêchent la carte de passer « verified » (preuve 2) ?
export const blocking = (ecarts: Ecart[]) => ecarts.filter((e) => e.severity === 'erreur');
