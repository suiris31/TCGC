// Traducteur (tâche C1.4) : filtres, cibles et durées, le cœur commun à toutes les familles (décision de l'étude C0).
// Repris du prototype (Plan-aventure/etudes/cartes/traducteur.ts) avec ses garde-fous : un morceau qu'on ne sait pas
// lire fait échouer (Unknown) plutôt que de donner une fausse traduction.
//
// Les familles (vague C2) s'en servent dans leurs règles : parseTarget(« up to 1 of your opponent's Characters with a
// cost of 3 or less ») pour une carte en jeu, parseFilter(« {Navy} type Character card ») pour une carte de la main, du
// deck ou de la Défausse, takeDuration / durationAfter pour la fin de phrase.
import type { Category, Color, Duration, Filter, Keyword, Side, Target } from '../types.ts';
import { fail, KEYWORDS } from './normalize.ts';

// ---------- Durées ----------

// Fin de phrase → durée. « until the start of your next turn » dure jusqu'à la fin du prochain tour adverse : rien ne
// se passe entre les deux (interprétations n° 389 et 1300 ; le prototype de l'étude la lisait à tort 'nextTurn', qui
// dure tout votre prochain tour). « during your opponent's next turn » (aucune carte aujourd'hui) n'est pas lu : l'effet
// ne commence qu'au tour adverse, ce que 'oppNextEnd' ne dit pas.
export const DURATIONS: readonly [RegExp, Duration][] = [
  [/\s*,?\s*(?:during|for) this battle$/i, 'battle'],
  [/\s*,?\s*(?:during|for|until the end of) this turn$/i, 'turn'],
  [/\s*,?\s*until the end of your opponent's next (?:End Phase|turn)$/i, 'oppNextEnd'],
  [/\s*,?\s*until the start of your next turn$/i, 'oppNextEnd'],
  [/\s*,?\s*until the end of your next turn$/i, 'nextTurn'],
];

// Retire la durée en fin de phrase ; [reste, durée ou undefined]
export function takeDuration(s: string): [string, Duration | undefined] {
  for (const [re, d] of DURATIONS) if (re.test(s)) return [s.replace(re, ''), d];
  return [s, undefined];
}

// Ce qui suit une valeur (« +2000 power⟨ during this turn⟩ ») : seulement une durée, sinon la phrase dit autre chose
// (« for every 5 cards in your trash », « for each ... ») et la règle échoue (garde-fou « reste après la valeur »).
// Sans durée : `absent` (souvent 'permanent', vérifié ensuite par le garde-fou des durées de structure.ts).
export function durationAfter(rest: string, absent: Duration = 'permanent'): Duration {
  const [left, d] = takeDuration(rest);
  if (left.trim()) fail(rest.trim(), 'reste après la valeur', left.trim());
  return d ?? absent;
}

// ---------- Filtres ----------

const COLORS: Record<string, Color> = {
  red: 'Red', green: 'Green', blue: 'Blue', purple: 'Purple', black: 'Black', yellow: 'Yellow',
};
const COLOR_RE = '(red|green|blue|purple|black|yellow)';
const KW_INNER = '(Blocker|Rush: Character|Rush|Double Attack|Banish|Unblockable)';
const lessMore = (f: Filter, w: string, max: keyof Filter, min: keyof Filter, n: number) => {
  (f as Record<string, number>)[w === 'less' || w === 'fewer' ? max : min] = n;
};

// Lit la description d'une carte : retire de la phrase les morceaux connus et remplit le filtre ; ce qui reste ne doit
// être que des mots de liaison (« card », « or », « with »...), sinon la règle échoue avec le reste en cause.
// Garde-fou : « with a cost of 0 or with a cost of 8 or more » (OU entre deux valeurs) échoue au lieu d'être lu comme
// un ET.
export function parseFilter(phrase: string): Filter {
  const f: Filter = {};
  if (/ or with /.test(` ${phrase} `)) fail(phrase, 'filtre : OU entre deux valeurs');
  // « with a total power of 4000 or less » (OP09-018) : une somme sur toutes les cartes choisies, pas une borne pour
  // chacune ; sans ce garde-fou, « total » passait pour un mot de liaison (correction de la tâche C2.1)
  if (/\btotal (?:power|cost)\b/i.test(phrase)) fail(phrase, 'filtre : total combiné');
  // « {A} type Characters or Characters with a [Trigger] » (OP05-002) : deux descriptions complètes reliées par « or »
  // (l'une OU l'autre) ; sans ce garde-fou, elles étaient fusionnées en une seule (l'une ET l'autre). Intégration C2.
  if (/\b(Leader|Character|Event|Stage)s?(?: cards?)? or (?:up to \d+ )?(?:of )?(?:your )?\1s?\b/.test(phrase)) {
    fail(phrase, 'filtre : OU entre deux descriptions');
  }
  let s = ` ${phrase.trim()} `;
  const eat = (re: RegExp, fn: (...m: string[]) => void) => {
    s = s.replace(re, (...m) => { fn(...(m.slice(0, -2) as string[])); return ' '; });
  };
  eat(/ other than \[([^\]]+)\]/g, (_, n) => { f.notName = n; });
  eat(/ (?:with |and )?(?:a )?type including "([^"]+)"/g, (_, t) => { f.typeIncludes = t; });
  // coût de base, puis coût (le coût « actuel » : modifié, comme CharSpec.costMax)
  eat(/ (?:with |and )?(?:a )?base cost of (\d+) or (less|more)/g, (_, n, w) => lessMore(f, w, 'baseCostMax', 'baseCostMin', +n));
  eat(/ (?:with |and )?(?:a )?base cost of (\d+)(?= )/g, (_, n) => { f.baseCostMax = +n; f.baseCostMin = +n; });
  eat(/ (?:with |and )?(?:a )?cost of (\d+) or (less|more)/g, (_, n, w) => lessMore(f, w, 'costMax', 'costMin', +n));
  eat(/ (?:with |and )?(?:a )?cost of (\d+)(?= )/g, (_, n) => { f.costEq = +n; });
  // puissance de base, puis puissance
  eat(/ (?:with |and )?(?:a )?base power of (\d+) or (less|more)/g, (_, n, w) => lessMore(f, w, 'basePowerMax', 'basePowerMin', +n));
  eat(/ (?:with |and )?(\d+) base power or (less|more)/g, (_, n, w) => lessMore(f, w, 'basePowerMax', 'basePowerMin', +n));
  eat(/ (?:with |and )?(?:a )?power of (\d+) or (less|more)/g, (_, n, w) => lessMore(f, w, 'powerMax', 'powerMin', +n));
  eat(/ (?:with |and )?(\d+) power or (less|more)/g, (_, n, w) => lessMore(f, w, 'powerMax', 'powerMin', +n));
  eat(/ (?:with |and )?(?:the )?<([^>]+)> attribute/g, (_, a) => { f.attribute = a; });
  eat(/ (?:with |and )?(?:a )?\[Trigger\]/g, () => { f.trigger = true; });
  eat(/ (?:with )?no base effect/g, () => { f.vanilla = true; });
  eat(/ (?:with|that has|that have) (\d+) or more DON!! cards? given/g, (_, n) => { f.donMin = +n; });
  eat(/ with (?:a|any) DON!! cards? given/g, () => { f.donMin = 1; });   // C2.4 : « with a DON!! card given » (OP15)
  eat(new RegExp(` (?:with|that has|that have|having) (?:a )?\\[${KW_INNER}\\]`, 'g'), (_, k) => { f.keyword = k as Keyword; });
  eat(new RegExp(` without (?:a )?\\[${KW_INNER}\\]`, 'g'), (_, k) => { f.noKeyword = k as Keyword; });
  // types : « {A} or {B} type », « both the {A} type and the {B} type », « {A} type »
  let typesAnd = false;
  eat(/ (?:with )?(?:both )?(?:the )?((?:\{[^}]+\}(?:,? or |,? and |, )?)+) type/g, (_, list: string) => {
    f.types = [...(f.types ?? []), ...[...list.matchAll(/\{([^}]+)\}/g)].map((x) => x[1])];
    if (/ and /.test(list)) typesAnd = true;
  });
  eat(/ (?:with )?(?:the )?\{([^}]+)\}/g, (_, t) => { f.types = [...(f.types ?? []), t]; });
  // plusieurs types : « both ... and ... » ou « {A} and {B} » → tous ; « {A} or {B} » → l'un des deux
  if (f.types && f.types.length > 1) f.typesMode = typesAnd || /\bboth\b/.test(phrase) ? 'all' : 'any';
  // noms : « [A] or [B] », « [A] »
  eat(/ ((?:\[[^\]]+\](?:,? or |, )?)+)(?= )/g, (_, list: string) => {
    const names = [...list.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]).filter((n) => !KEYWORDS.includes(n as Keyword));
    if (names.length) f.name = [...(f.name ?? []), ...names];
  });
  eat(/ (rested|active)(?= )/g, (_, w) => { f.rested = w === 'rested'; });
  eat(new RegExp(` ${COLOR_RE}(?:(?:,? or |, )${COLOR_RE})?(?= )`, 'gi'), (_, a, b) => {
    f.color = [COLORS[a.toLowerCase()], ...(b ? [COLORS[b.toLowerCase()]] : [])];
  });
  const cats: Category[] = [];
  eat(/ (Leader|Character|Event|Stage)s?(?: cards?)?(?= )/g, (_, c) => { cats.push(c.toUpperCase() as Category); });
  if (cats.length) f.category = [...new Set(cats)];
  const rest = s.replace(/\b(?:cards?|or|and|with|both|the|a|an|of|type|total)\b|,/g, ' ').trim();
  if (rest) fail(phrase, 'filtre', rest);
  mixedOr(phrase, f);
  return f;
}

// « [Megalo] or {Neptunian} type cards », « Event or {Punk Hazard} type cards » : deux sortes différentes reliées par
// « or » → l'une OU l'autre (anyOf), au lieu de l'une ET l'autre. Les autres champs s'appliquent aux deux.
function mixedOr(phrase: string, f: Filter) {
  const piece = '(\\[[^\\]]+\\]|\\{[^}]+\\}(?: type)?|\\b(?:Leader|Character|Event|Stage)s?\\b)';
  const m = phrase.match(new RegExp(`${piece}(?: cards?)? or ${piece}`));
  if (!m) return;
  const kind = (x: string) => (x.startsWith('[') ? 'name' : x.startsWith('{') ? 'type' : 'cat');
  const [a, b] = [m[1], m[2]];
  if (kind(a) === kind(b)) return;
  const one = (x: string): Filter => (kind(x) === 'name' ? { name: [x.slice(1, -1)] }
    : kind(x) === 'type' ? { types: [x.replace(/ type$/, '').slice(1, -1)] }
      : { category: [x.replace(/s$/, '').toUpperCase() as Category] });
  const pa = one(a);
  const pb = one(b);
  if (pa.name || pb.name) {
    f.name = (f.name ?? []).filter((n) => n !== pa.name?.[0] && n !== pb.name?.[0]);
    if (!f.name.length) delete f.name;
  }
  if (pa.types || pb.types) {
    f.types = (f.types ?? []).filter((t) => t !== pa.types?.[0] && t !== pb.types?.[0]);
    if (!f.types.length) { delete f.types; delete f.typesMode; }
  }
  if (pa.category || pb.category) {
    const cat = (pa.category ?? pb.category)![0];
    const others = (f.category ?? []).filter((c) => c !== cat);
    // « Event or {Punk Hazard} type Character cards » : la catégorie restante va avec le type
    if (pb.types && others.length) pb.category = others;
    if (pa.types && others.length) pa.category = others;
    delete f.category;
  }
  f.anyOf = [pa, pb];
}

// Description d'un nombre de cartes du terrain dans une condition (« you have 2 or more {Navy} type Characters ») :
// « cards » sans catégorie ni nom ni type désigne toutes les cartes du terrain (Leader, Personnages, Lieu, DON!!), pas
// seulement les Personnages (erreur trouvée par l'étude sur OP12-118) : la règle échoue, une famille la lit à part.
export function fieldFilter(phrase: string): Filter {
  const p = phrase.replace(/ (?:on your field|on their field|in play)$/, '');
  const f = parseFilter(p);
  if (!f.category && !f.anyOf && /\bcards?\b/.test(p) && !f.name && !f.types) fail(phrase, 'cartes du terrain (toutes catégories)');
  return f;
}

// ---------- Cibles ----------

// Une carte en jeu visée : quantité (« up to N », « all », « N », « a »), camp (« your », « your opponent's »,
// « their »), Leader / Personnages / Lieu, « this Character », « other than this Character », puis le filtre.
// `defaultSide` : le camp quand la phrase n'en dit rien (« Give up to 1 Character » : 'any' ; « gains » : 'own').
export function parseTarget(phrase: string, defaultSide: Side = 'any'): Target {
  let p = phrase.trim().replace(/^the /i, '');
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^this (Character|Leader|card|Stage)(?: card)?$/i))) {
    return clean({
      side: 'own', zone: 'field', self: true, count: 1, upTo: false, filter: {},
      leader: /Leader/i.test(m[1]) || undefined, characters: /Character/i.test(m[1]) || undefined, stage: /Stage/i.test(m[1]) || undefined,
    });
  }
  if (/^your Leader$/i.test(p)) return { side: 'own', zone: 'field', leader: true, count: 1, upTo: false, filter: {} };
  if (/^your opponent's Leader$/i.test(p)) return { side: 'opp', zone: 'field', leader: true, count: 1, upTo: false, filter: {} };
  if ((m = p.match(/^up to 1 of your (opponent's )?Leader or up to 1 of (?:your|their) (?:opponent's )?Characters?$/i))) {
    return { side: m[1] ? 'opp' : 'own', zone: 'field', leader: true, characters: true, count: 1, upTo: true, filter: {} };
  }
  let count: number | 'all' = 1;
  let upTo = false;
  let side: Side = defaultSide;
  if ((m = p.match(/^up to (?:a total of )?(\d+) (?:of )?(.*)$/i))) { count = +m[1]; upTo = true; p = m[2]; }
  else if ((m = p.match(/^all (?:of )?(.*)$/i))) { count = 'all'; p = m[1]; }
  else if ((m = p.match(/^(\d+) (?:of )?(.*)$/))) { count = +m[1]; p = m[2]; }
  else if ((m = p.match(/^(?:a|an) (.*)$/i))) { count = 1; p = m[1]; }
  if ((m = p.match(/^(?:your opponent's|their) (.*)$/i))) { side = 'opp'; p = m[1]; }
  else if ((m = p.match(/^your (.*)$/i))) { side = 'own'; p = m[1]; }
  let otherThanSelf = false;
  p = p.replace(/,? other than this (?:Character|card|Leader)/i, () => { otherThanSelf = true; return ''; });
  if (!p.trim()) fail(phrase, 'cible');
  const filter = parseFilter(p);
  const cats = filter.category ?? [];
  delete filter.category;
  // « up to 1 of your [Usopp] cards » : une carte en jeu de ce nom, Leader ou Personnage (étude C0 § 6, doute 3)
  if (!cats.length && (filter.name || filter.anyOf?.some((x) => x.name))) cats.push('LEADER', 'CHARACTER');
  if (!cats.length && filter.anyOf?.some((x) => x.category)) cats.push(...filter.anyOf.flatMap((x) => x.category ?? []));
  if (!cats.length) fail(phrase, 'cible sans catégorie');
  if (cats.includes('EVENT')) fail(phrase, 'cible en jeu : un Évènement');
  return clean({
    side, zone: 'field', count, upTo, filter,
    otherThanSelf: otherThanSelf || undefined,
    leader: cats.includes('LEADER') || undefined,
    characters: cats.includes('CHARACTER') || undefined,
    stage: cats.includes('STAGE') || undefined,
  });
}

// Retire les champs absents (undefined) : une recette s'écrit telle quelle dans un fichier de set
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}
