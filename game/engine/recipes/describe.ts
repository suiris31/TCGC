// Aller-retour (tâche C1.2) : recette → phrase anglaise normalisée et phrase française lisible.
//
// L'anglais suit les tournures du texte officiel telles que le traducteur les lit (grammaire du prototype de l'étude C0,
// etudes/cartes/traducteur.ts), sous la même normalisation : sans rappels de règle, « K.O. » écrit « KO », tirets et
// guillemets unifiés, ➀ écrit ①. compare.ts en tire les valeurs (nombres, cibles, durées, moments...) et les met en face
// de celles du texte officiel. Le français sert à la relecture, au coach et aux infobulles : il dit la même chose avec
// les mots de l'appli ([Jouée], [Bloqueur], Défausse...), sans chercher à reproduire la VF officielle.
//
// Aucune phrase de carte ici : seulement des tournures à trous, remplies par les valeurs de la recette.
// Contrat : 01-contrats.md § 15.4. Le `switch` sur chaque `kind` est exhaustif : une sorte ajoutée au format sans sa
// description casse `npm run typecheck` (voulu, § 15.2).
import type {
  Ability, Action, Category, Color, CostPart, Cond, Duration, Filter, Keyword, Recipe, RecipeEvent, Step, Target, Timing,
} from './types.ts';

export type DescribeResult =
  | { ok: true; en: string; fr: string }
  | { ok: false; missing: string[] };

export interface DescribeOptions {
  // catégorie de la carte décrite : « rest this Leader », « trash this Stage » (par défaut : Personnage)
  category?: Category;
  // libellé français d'un type ({Navy} → {Marine}) ; par défaut le type en VO
  typeLabel?: (type: string) => string;
}

export function describe(recipe: Recipe, opts: DescribeOptions = {}): DescribeResult {
  const missing: string[] = [];
  const ctx: Ctx = { self: opts.category ?? 'CHARACTER', typeLabel: opts.typeLabel ?? ((t) => t), missing };
  const en = lines(recipe, ctx, EN);
  const fr = lines(recipe, ctx, FR);
  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  return { ok: true, en, fr };
}

// Une capacité seule (utile au coach : l'infobulle d'un effet), dans une langue
export function describeAbility(ability: Ability, lang: 'en' | 'fr', opts: DescribeOptions = {}): string {
  const ctx: Ctx = { self: opts.category ?? 'CHARACTER', typeLabel: opts.typeLabel ?? ((t) => t), missing: [] };
  return (lang === 'en' ? EN : FR).ability(ability, ctx);
}

interface Ctx {
  self: Category;
  typeLabel: (type: string) => string;
  missing: string[];
}

interface Lang {
  keyword: (k: Keyword) => string;
  alsoNamed: (name: string) => string;
  // timings : plusieurs moments pour une même capacité (« [On Play]/[When Attacking] ... »)
  ability: (a: Ability, ctx: Ctx, timings?: Timing[]) => string;
  triggerTag: string;
}

function lines(recipe: Recipe, ctx: Ctx, L: Lang): string {
  const out: string[] = [];
  if (recipe.keywords?.length) out.push(recipe.keywords.map((k) => `[${L.keyword(k)}]`).join(' '));
  // Le texte officiel écrit une fois « [A]/[B] effet » ; le traducteur en fait deux capacités, qu'on regroupe ici
  const same = (a: Ability, b: Ability) => JSON.stringify({ ...a, timing: '' }) === JSON.stringify({ ...b, timing: '' });
  for (let i = 0; i < recipe.abilities.length; i++) {
    const a = recipe.abilities[i];
    const timings: Timing[] = [a.timing];
    while (a.timing !== 'static' && a.timing !== 'when' && i + 1 < recipe.abilities.length
      && same(a, recipe.abilities[i + 1]) && !timings.includes(recipe.abilities[i + 1].timing)) timings.push(recipe.abilities[++i].timing);
    out.push(L.ability(a, ctx, timings));
  }
  for (const n of recipe.alsoNamed ?? []) out.push(L.alsoNamed(n));
  if (recipe.trigger) out.push(`[${L.triggerTag}] ${L.ability({ ...recipe.trigger, timing: 'static' }, ctx)}`);
  return out.join('\n');
}

// ---------- Outils communs ----------

const plural = (n: number | 'all') => n === 'all' || n > 1;
// Première lettre en minuscule après « Then, », « and », « you may » : sauf un mot en capitales (KO, DON!!) ou un repère
const lower = (s: string) => (/^(?:KO\b|DON!!|[[{<«①②③④])/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sign = (n: number) => (n >= 0 ? `+${n}` : `-${-n}`);
const orList = (xs: string[], or: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${or} ${xs.at(-1)}`);
const andList = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);
const manual = (where: string, reason: string, ctx: Ctx) => {
  void ctx;
  return `«${where}:${reason}»`;
};
// Sorte inconnue (recette mal formée, hors du type) : notée dans `missing`
function unknown(what: string, x: never, ctx: Ctx): string {
  const kind = (x as { kind?: string } | undefined)?.kind ?? JSON.stringify(x);
  ctx.missing.push(`${what} ${kind}`);
  return `«${what}:${kind}»`;
}

// ======================================================================================================================
// Anglais normalisé
// ======================================================================================================================

const EN_TIMING: Record<Exclude<Timing, 'when' | 'static'>, string> = {
  onPlay: 'On Play', whenAttacking: 'When Attacking', onBlock: 'On Block', onKO: 'On KO', endOfTurn: 'End of Your Turn',
  endOfOppTurn: "End of Your Opponent's Turn", onOppAttack: "On Your Opponent's Attack", activateMain: 'Activate: Main',
  main: 'Main', counter: 'Counter', trigger: 'Trigger',
};
const EN_DURATION: Record<Duration, string> = {
  battle: ' during this battle', turn: ' during this turn', oppNextEnd: " until the end of your opponent's next turn",
  nextTurn: ' until the end of your next turn', permanent: '',
};
const EN_COLOR: Record<Color, string> = { Red: 'red', Green: 'green', Blue: 'blue', Purple: 'purple', Black: 'black', Yellow: 'yellow' };
const EN_CAT: Record<Category, [string, string]> = {
  LEADER: ['Leader', 'Leaders'], CHARACTER: ['Character', 'Characters'], EVENT: ['Event', 'Events'], STAGE: ['Stage', 'Stages'],
};
const EN_CMP = { le: 'or less', ge: 'or more', eq: '' } as const;
const EN_SELF: Record<Category, string> = { LEADER: 'this Leader', CHARACTER: 'this Character', EVENT: 'this card', STAGE: 'this Stage' };
const enCount = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const enCmp = (n: number, cmp: 'le' | 'ge' | 'eq') => (cmp === 'eq' ? `${n}` : `${n} ${EN_CMP[cmp]}`);

// « with a cost of 3 or less and 5000 power or less » : les morceaux qui suivent le nom
function enWith(f: Filter): string[] {
  const out: string[] = [];
  const range = (min: number | undefined, max: number | undefined, fmt: (v: string) => string) => {
    if (min !== undefined && max !== undefined) out.push(min === max ? fmt(`${min}`) : fmt(`${min} to ${max}`));
    else if (max !== undefined) out.push(fmt(`${max} or less`));
    else if (min !== undefined) out.push(fmt(`${min} or more`));
  };
  if (f.costEq !== undefined) out.push(`a cost of ${f.costEq}`);
  range(f.costMin, f.costMax, (v) => `a cost of ${v}`);
  range(f.baseCostMin, f.baseCostMax, (v) => `a base cost of ${v}`);
  range(f.powerMin, f.powerMax, (v) => (/ to /.test(v) ? `a power of ${v}` : `${v.replace(/ or /, ' power or ')}`));
  range(f.basePowerMin, f.basePowerMax, (v) => (/ to /.test(v) ? `a base power of ${v}` : `${v.replace(/ or /, ' base power or ')}`));
  if (f.attribute) out.push(`the <${f.attribute}> attribute`);
  if (f.typeIncludes) out.push(`a type including "${f.typeIncludes}"`);
  if (f.trigger) out.push('a [Trigger]');
  if (f.keyword) out.push(`[${f.keyword}]`);
  if (f.vanilla) out.push('no base effect');
  if (f.donMin !== undefined) out.push(`${f.donMin} or more DON!! cards given`);
  return out;
}

// Groupe nominal d'un filtre : « rested black {Navy} type Characters with a cost of 3 or less other than [Izo] »
function enNoun(f: Filter, cats: Category[], many: boolean, card = false): string {
  if (f.anyOf?.length) {
    const rest: Filter = { ...f, anyOf: undefined };
    const pieces = f.anyOf.map((p) => enNoun({ ...p }, p.category ?? [], many, card).replace(/ cards?$/, ''));
    const tail = enNoun(rest, cats.length ? cats : [], many, true).replace(/^cards?\s*/, '');
    return `${orList(pieces, 'or')} ${many ? 'cards' : 'card'}${tail ? ` ${tail}` : ''}`.replace(/\s+/g, ' ').trim();
  }
  const pre: string[] = [];
  if (f.rested !== undefined) pre.push(f.rested ? 'rested' : 'active');
  if (f.color?.length) pre.push(orList(f.color.map((c) => EN_COLOR[c]), 'or'));
  if (f.name?.length) pre.push(orList(f.name.map((n) => `[${n}]`), 'or'));
  if (f.types?.length) pre.push(`${(f.typesMode === 'all' ? andList : orList)(f.types.map((t) => `{${t}}`), f.typesMode === 'all' ? 'and' : 'or')} type`);
  const c = f.category?.length ? f.category : cats;
  let noun: string;
  if (!c.length) noun = many ? 'cards' : 'card';
  else if (c.length === 2 && c.includes('LEADER') && c.includes('CHARACTER')) {
    // « up to 1 of your [Usopp] cards » : une carte en jeu de ce nom, Leader ou Personnage
    noun = f.name?.length ? (many ? 'cards' : 'card') : many ? 'Leader or Character cards' : 'Leader or Character card';
  } else noun = orList(c.map((x) => EN_CAT[x][many && !card ? 1 : 0]), 'or') + (card ? (many ? ' cards' : ' card') : '');
  const withs = enWith(f);
  const neg: string[] = [];
  if (f.noKeyword) neg.push(`without [${f.noKeyword}]`);
  let s = [...pre, noun].join(' ');
  if (withs.length) s += ` with ${andList(withs, 'and')}`;
  if (neg.length) s += `${withs.length ? ' and' : ''} ${neg.join(' ')}`;
  if (f.notName) s += ` other than [${f.notName}]`;
  return s;
}

function enTarget(t: Target, ctx: Ctx): string {
  if (t.that) return 'that card';
  if (t.self && t.zone === 'hand') return 'this card in your hand';
  if (t.self) return t.leader ? 'this Leader' : t.characters ? 'this Character' : t.stage ? 'this Stage' : 'this card';
  const cats: Category[] = [...(t.leader ? ['LEADER' as const] : []), ...(t.characters ? ['CHARACTER' as const] : []), ...(t.stage ? ['STAGE' as const] : [])];
  void ctx;
  const plain = !Object.keys(t.filter).length;
  if (t.leader && !t.characters && !t.stage && t.count === 1 && !t.upTo) {
    // « your Leader », « your {Navy} type Leader », « your [Lucy] Leader » : sans nombre
    const who = t.side === 'opp' ? "your opponent's" : 'your';
    return plain ? `${who} Leader` : `${who} ${enNoun(t.filter, ['LEADER'], false)}`;
  }
  if (t.leader && t.characters && t.upTo && t.count === 1 && plain && t.side === 'own' && !t.otherThanSelf) {
    // tournure la plus courante, « up to 1 of your Leader or Character cards »
    return 'up to 1 of your Leader or Character cards';
  }
  const side = t.side === 'opp' ? "your opponent's " : t.side === 'own' ? 'your ' : '';
  const ofForm = t.side !== 'any';
  const quant = t.count === 'all' ? (ofForm ? 'all of ' : 'all ') : `${t.upTo ? 'up to ' : ''}${t.count}${ofForm ? ' of' : ''} `;
  const many = ofForm || plural(t.count);
  let s = `${quant}${side}${enNoun(t.filter, cats, many)}`;
  if (t.otherThanSelf) s += ` other than ${EN_SELF[ctx.self]}`;
  return s;
}

// Filtre d'une carte hors du terrain (main, deck, Défausse) : « up to 1 {Navy} type Character card with a cost of 3 »
const enCards = (n: number, f: Filter) => enNoun(f, [], plural(n), true);

function enCond(c: Cond, ctx: Ctx): string {
  switch (c.kind) {
    case 'leaderIs': return `your Leader is ${orList(c.names.map((n) => `[${n}]`), 'or')}`;
    case 'leaderType': return `your Leader has the ${(c.mode === 'all' ? andList : orList)(c.types.map((t) => `{${t}}`), c.mode === 'all' ? 'and' : 'or')} type`;
    case 'leaderTypeIncludes': return `your Leader's type includes "${c.part}"`;
    case 'leaderColor': return c.multicolor ? 'your Leader is multicolored' : `your Leader is ${orList(c.colors.map((x) => EN_COLOR[x]), 'or')}`;
    case 'leaderAttribute': return `your Leader has the <${c.attribute}> attribute`;
    case 'life':
      if (c.side === 'total') return `you and your opponent have a total of ${enCmp(c.n, c.cmp)} Life cards`;
      return `${c.side === 'own' ? 'you have' : 'your opponent has'} ${enCmp(c.n, c.cmp)} Life cards`;
    case 'lifeVsOpp': return `you have ${c.cmp === 'lt' ? 'less' : c.cmp === 'gt' ? 'more' : c.cmp === 'le' ? 'equal to or less' : 'equal to or more'} Life cards than your opponent`;
    case 'hand': return c.side === 'own' ? `you have ${enCmp(c.n, c.cmp)} cards in your hand` : `your opponent has ${enCmp(c.n, c.cmp)} cards in their hand`;
    case 'donField': return c.side === 'own' ? `you have ${enCmp(c.n, c.cmp)} DON!! cards on your field` : `your opponent has ${enCmp(c.n, c.cmp)} DON!! cards on their field`;
    case 'donVsOpp':
      if (c.cmp === 'le' || c.cmp === 'ge') return `the number of DON!! cards on your field is equal to or ${c.cmp === 'le' ? 'less' : 'more'} than the number on your opponent's field`;
      return `your opponent has ${c.cmp === 'lt' ? 'more' : 'less'} DON!! cards on their field than you`;
    case 'trash': return `you have ${enCmp(c.n, c.cmp)} ${c.filter ? enCards(2, c.filter) : 'cards'} in your trash`;
    case 'deck': return `you have ${enCmp(c.n, c.cmp)} cards in your deck`;
    case 'chars': {
      const subj = c.side === 'opp' ? 'your opponent has' : 'you have';
      if (c.cmp === 'eq' && c.n === 0) return c.side === 'any' ? `there is no ${enNoun(c.filter, [], false)}` : `${subj} no ${enNoun(c.filter, [], true)}`;
      if (c.cmp === 'ge' && c.n === 1) {
        const noun = enNoun(c.filter, [], false);
        return `${c.side === 'any' ? 'there is' : subj} ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
      }
      return `${c.side === 'any' ? 'there are' : subj} ${enCmp(c.n, c.cmp)} ${enNoun(c.filter, [], c.n !== 1)}`;
    }
    case 'fieldCards': return `${c.side === 'own' ? 'you have' : 'your opponent has'} ${enCmp(c.n, c.cmp)} ${c.rested === true ? 'rested ' : c.rested === false ? 'active ' : ''}cards`;
    case 'selfState': {
      const me = EN_SELF[ctx.self];
      if (c.donMin !== undefined) return `${me} has ${c.donMin} or more DON!! cards given`;
      return `${me} is ${c.rested ? 'rested' : 'active'}`;
    }
    case 'turn': return c.mine ? 'it is your turn' : "it is your opponent's turn";
    case 'playedThisTurn': return `${EN_SELF[ctx.self]} was played during this turn`;
    case 'firstTurns': return `it is turn ${c.fromTurn} or later`;
    case 'and': return andList(c.all.map((x) => enCond(x, ctx)), 'and');
    case 'or': return orList(c.any.map((x) => enCond(x, ctx)), 'or');
    case 'not': return `not: ${enCond(c.cond, ctx)}`;
    case 'manual': return manual('cond', c.reason, ctx);
    default: return unknown('condition', c, ctx);
  }
}

function enCost(p: CostPart, ctx: Ctx): string {
  const me = EN_SELF[ctx.self];
  switch (p.kind) {
    case 'donMinus': return `DON!! -${p.n}`;
    case 'restDon': return '①②③④'[p.n - 1] ?? `rest ${p.n} of your DON!! cards`;
    case 'restSelf': return `rest ${me}`;
    case 'trashSelf': return `trash ${me}`;
    case 'discard': return `trash ${p.n} ${p.filter ? enCards(p.n, p.filter) : p.n === 1 ? 'card' : 'cards'} from your hand`;
    case 'reveal': return `reveal ${p.n} ${enCards(p.n, p.filter ?? {})} from your hand`;
    case 'trashTop': return `trash ${enCount(p.n, 'card', 'cards')} from the top of your deck`;
    case 'lifeToHand': return `add 1 card from the ${p.from === 'top' ? 'top' : 'top or bottom'} of your Life cards to your hand`;
    case 'flipLife': return `turn 1 card from the top of your Life cards face-${p.faceUp ? 'up' : 'down'}`;
    case 'trashOwnChar': return `trash ${p.n} of your ${enNoun(p.filter, ['CHARACTER'], true)}`;
    case 'returnOwnChar': return `return ${p.n} of your ${enNoun(p.filter, ['CHARACTER'], true)} to the owner's hand`;
    case 'restOwn':
      if (p.what === 'leader') return p.filter && Object.keys(p.filter).length ? `rest your ${enNoun(p.filter, ['LEADER'], false)}` : 'rest your Leader';
      if (p.what === 'stage') return 'rest your Stage';
      if (p.what === 'cards') return `rest ${p.n} of your cards`;
      return `rest ${p.n} of your ${enNoun(p.filter ?? {}, ['CHARACTER'], true)}`;
    case 'giveDon': return `give ${p.n} active DON!! ${p.n === 1 ? 'card' : 'cards'} to ${enTarget(p.target, ctx)}`;
    case 'trashToBottom': return `place ${p.n} ${p.filter ? enCards(p.n, p.filter) : p.n === 1 ? 'card' : 'cards'} from your trash at the bottom of your deck in any order`;
    case 'trashLife': return `trash 1 card from the ${p.from === 'top' ? 'top' : 'top or bottom'} of your Life cards`;
    case 'leaderPowerMinus': return `give your 1 active Leader -${p.n} power during this turn`;
    case 'bounceSelf': return `return ${me} to the owner's hand`;
    case 'selfToBottom': return `place ${me} at the bottom of the owner's deck`;
    case 'manual': return manual('cost', p.reason, ctx);
    default: return unknown('coût', p, ctx);
  }
}

// Ses propres cartes sont le sujet de « gains » (« Up to 1 of your Leader or Character cards gains »), celles de
// l'adversaire le complément de « Give »
const enSubject = (t: Target) => t.self || t.side === 'own';
// « Your opponent cannot activate [Blocker] » : tous les Personnages adverses, sans filtre (C2.2)
// (filtre : seulement une limite de puissance ou de coût, « ... a [Blocker] Character that has 2000 or less power »)
const allOpp = (t: Target) => t.side === 'opp' && t.count === 'all' && !t.leader && !t.stage && !t.self
  && Object.keys(t.filter).every((k) => k === 'powerMax' || k === 'costMax');
const enBlockerLimit = (f: Filter) => (f.powerMax !== undefined ? `a [Blocker] Character that has ${f.powerMax} or less power`
  : f.costMax !== undefined ? `the [Blocker] of any Character with a cost of ${f.costMax} or less` : '[Blocker]');
const frBlockerLimit = (f: Filter) => (f.powerMax !== undefined ? `le [Bloqueur] d'un Personnage de ${f.powerMax} de puissance ou moins`
  : f.costMax !== undefined ? `le [Bloqueur] d'un Personnage de coût ${f.costMax} ou moins` : '[Bloqueur]');

function enAction(a: Action, ctx: Ctx): string {
  const T = (t: Target) => enTarget(t, ctx);
  switch (a.kind) {
    case 'ko': return `KO ${T(a.target)}`;
    case 'rest': return `Rest ${T(a.target)}`;
    case 'setActive': return `Set ${T(a.target)} as active`;
    case 'bounce': return `Return ${T(a.target)} to the owner's hand`;
    case 'bottom': return `Place ${T(a.target)} at the bottom of the owner's deck`;
    case 'toLife': return `Place ${T(a.target)} at the top of the owner's Life cards face-${a.faceUp ? 'up' : 'down'}`;
    case 'trashChar': return `Trash ${T(a.target)}`;
    case 'power': return enSubject(a.target)
      ? `${upper(T(a.target))} gains ${a.target.that ? 'an additional ' : ''}${sign(a.amount)} power${EN_DURATION[a.until]}`
      : `Give ${T(a.target)} ${sign(a.amount)} power${EN_DURATION[a.until]}`;
    case 'cost': return enSubject(a.target)
      ? `${upper(T(a.target))} gains ${sign(a.amount)} cost${EN_DURATION[a.until]}`
      : `Give ${T(a.target)} ${sign(a.amount)} cost${EN_DURATION[a.until]}`;
    case 'powerSet': return `${upper(T(a.target))}'s base power becomes ${a.value}${EN_DURATION[a.until]}`;
    case 'keyword': return `${upper(T(a.target))} gains [${a.keyword}]${EN_DURATION[a.until]}`;
    case 'cantAttack': return `${upper(T(a.target))} cannot attack${a.what === 'leader' ? ' a Leader' : ''}${EN_DURATION[a.until]}`;
    case 'cantBlock': return allOpp(a.target)
      ? `Your opponent cannot activate ${enBlockerLimit(a.target.filter)}${EN_DURATION[a.until]}`
      : `${upper(T(a.target))} cannot activate [Blocker]${EN_DURATION[a.until]}`;
    case 'cantBeKO': {
      const by = a.byAttribute ? ` in battle by <${a.byAttribute}> attribute cards` : a.by === 'battle' ? ' in battle' : a.by === 'effect' ? ' by effects'
        : a.by === 'oppEffect' ? " by your opponent's effects" : '';
      return `${upper(T(a.target))} cannot be KO'd${by}${EN_DURATION[a.until]}`;
    }
    case 'cantBeRested': return `${upper(T(a.target))} cannot be rested${EN_DURATION[a.until]}`;
    case 'cantLeave': return `${upper(T(a.target))} cannot be removed from the field by your opponent's effects${EN_DURATION[a.until]}`;
    case 'attackActive': return `${upper(T(a.target))} can also attack active Characters${EN_DURATION[a.until]}`;
    case 'cantRefresh': return `${upper(T(a.target))} will not become active in your opponent's next Refresh Phase`;
    case 'negate': return `Negate the effect of ${T(a.target)}${EN_DURATION[a.until]}`;
    case 'draw': return `Draw ${enCount(a.n, 'card', 'cards')}`;
    case 'discard': return `Trash ${a.n} ${a.filter ? enCards(a.n, a.filter) : a.n === 1 ? 'card' : 'cards'} from your hand`;
    case 'oppDiscard': return `Your opponent trashes ${enCount(a.n, 'card', 'cards')} from their hand`;
    case 'trashTop': return `Trash ${enCount(a.n, 'card', 'cards')} from the top of ${a.side === 'own' ? 'your' : "your opponent's"} deck`;
    case 'search': {
      const what = `${a.upTo ? 'up to ' : ''}${a.take} ${enCards(a.take, a.filter)}`;
      const it = a.take === 1 ? 'it' : 'them';
      const look = `Look at ${enCount(a.look, 'card', 'cards')} from the top of your deck`;
      const head = a.dest === 'hand' ? `${look}; reveal ${what} and add ${it} to your hand`
        : a.dest === 'play' ? `${look} and play ${what}${a.rested ? ' rested' : ''}`
          : `${look}; reveal ${what} and add ${it} to the top of your Life cards`;
      const rest = a.rest === 'trash' ? 'trash the rest' : `place the rest at the ${a.rest === 'top' ? 'top' : 'bottom'} of your deck in any order`;
      return `${head}. Then, ${rest}`;
    }
    case 'arrangeTop': return `Look at ${enCount(a.look, 'card', 'cards')} from the top of your deck and place them at the ${a.where === 'topOrBottom' ? 'top or bottom' : a.where} of the deck in any order`;
    case 'play': {
      const from = a.from === 'handOrTrash' ? 'your hand or trash' : a.from === 'life' ? 'your Life cards' : `your ${a.from}`;
      return `Play ${a.upTo ? 'up to ' : ''}${a.count} ${enCards(a.count, a.filter)} from ${from}${a.rested ? ' rested' : ''}`;
    }
    case 'playSelf': return `Play this card${a.rested ? ' rested' : ''}`;
    case 'activate': return `Activate this card's [${({ main: 'Main', onPlay: 'On Play', counter: 'Counter', onKO: 'On KO', whenAttacking: 'When Attacking' } as const)[a.which]}] effect`;
    case 'trashToHand': return `Add ${a.upTo ? 'up to ' : ''}${a.count} ${enCards(a.count, a.filter)} from your trash to your hand`;
    case 'trashToBottom': return a.side === 'own'
      ? `Place ${a.count} ${enCards(a.count, a.filter)} from your trash at the bottom of your deck in any order`
      : `Place ${a.count} ${enCards(a.count, a.filter)} from your opponent's trash at the bottom of their deck in any order`;
    case 'addDon': return `Add ${a.upTo ? 'up to ' : ''}${a.n} DON!! ${a.n === 1 ? 'card' : 'cards'} from your DON!! deck and ${a.state === 'active' ? `set ${a.n === 1 ? 'it' : 'them'} as active` : `rest ${a.n === 1 ? 'it' : 'them'}`}`;
    case 'readyDon': return `Set ${a.upTo ? 'up to ' : ''}${a.n} of your DON!! cards as active`;
    case 'giveDon': return `Give ${a.upTo ? 'up to ' : ''}${a.n} ${a.rested ? 'rested' : 'active'} DON!! ${a.n === 1 ? 'card' : 'cards'} to ${T(a.target)}`;
    case 'returnDon': return a.side === 'opp'
      ? `Your opponent returns ${a.n} DON!! ${a.n === 1 ? 'card' : 'cards'} from their field to their DON!! deck`
      : `Return ${a.n} DON!! ${a.n === 1 ? 'card' : 'cards'} from your field to your DON!! deck`;
    case 'restDon': return a.side === 'opp' ? `Rest up to ${a.n} of your opponent's DON!! cards` : `Rest ${a.n} of your DON!! cards`;
    case 'lifeFromDeck': return `Add ${a.upTo ? 'up to ' : ''}${enCount(a.n, 'card', 'cards')} from the top of your deck to the top of your Life cards${a.faceUp ? ' face-up' : ''}`;
    case 'lifeToHand': return a.side === 'own'
      ? `Add ${enCount(a.n, 'card', 'cards')} from the ${a.from === 'top' ? 'top' : 'top or bottom'} of your Life cards to your hand`
      : `Add ${enCount(a.n, 'card', 'cards')} from the ${a.from === 'top' ? 'top' : 'top or bottom'} of your opponent's Life cards to the owner's hand`;
    case 'trashLife': return `Trash ${enCount(a.n, 'card', 'cards')} from the ${a.from === 'top' ? 'top' : 'top or bottom'} of ${a.side === 'own' ? 'your' : "your opponent's"} Life cards`;
    case 'lookLife': {
      const whose = a.side === 'own' ? 'your' : a.side === 'opp' ? "your opponent's" : "your or your opponent's";
      return `Look at up to 1 card from the top of ${whose} Life cards${a.arrange ? ', and place it at the top or bottom of the Life cards' : ''}`;
    }
    case 'handToBottom': return `Place ${enCount(a.n, 'card', 'cards')} from your hand at the bottom of your deck in any order`;
    case 'oppHandToBottom': return `Your opponent places ${enCount(a.n, 'card', 'cards')} from their hand at the bottom of their deck in any order`;
    case 'handToLife': return `Add ${a.upTo ? 'up to ' : ''}${a.n} ${enCards(a.n, a.filter)} from your hand to the top of your Life cards`;
    case 'noCharsThisTurn': return `You cannot play Character cards${a.what === 'playByEffect' ? ' by effects' : ''} during this turn`;
    case 'trashSelfEnd': return `Trash ${EN_SELF[ctx.self]} at the end of this turn`;
    case 'oppChooses': {
      const verb = { ko: 'KO', trash: 'trash', bounce: 'return to the owner\'s hand', rest: 'rest' }[a.action];
      return `Your opponent chooses ${a.n} of their ${enNoun(a.filter, ['CHARACTER'], true)} and must ${verb} ${a.n === 1 ? 'it' : 'them'}`;
    }
    case 'manual': return manual('step', a.reason, ctx);
    default: return unknown('action', a, ctx);
  }
}

// « This Character gains [Blocker] and +1000 power during this battle » : le traducteur en fait deux actions (mot-clé,
// puis puissance ou coût, même cible, même durée, sans lien) ; on les redit en une phrase
type KwPair = { kw: Extract<Action, { kind: 'keyword' }>; mod: Extract<Action, { kind: 'power' | 'cost' }> };
function kwPair(steps: Step[], i: number): KwPair | null {
  const a = steps[i]; const b = steps[i + 1];
  if (!a || !b || !('action' in a) || !('action' in b) || b.link || b.cond) return null;
  const kw = a.action; const mod = b.action;
  if (kw.kind !== 'keyword' || (mod.kind !== 'power' && mod.kind !== 'cost')) return null;
  if (kw.until !== mod.until || JSON.stringify(kw.target) !== JSON.stringify(mod.target)) return null;
  return { kw, mod };
}
function joinSteps(steps: Step[], render: (st: Step, pair: KwPair | null) => string): { st: Step; body: string }[] {
  const out: { st: Step; body: string }[] = [];
  for (let i = 0; i < steps.length; i++) {
    const pair = kwPair(steps, i);
    out.push({ st: steps[i], body: render(steps[i], pair) });
    if (pair) i++;
  }
  return out;
}

// « This Character gains +1000 power and cannot be KO'd by effects » : deux étapes liées par « and » au même sujet (le
// traducteur les lit avec le même sujet, C2.2) ; on ne redit pas le sujet de la seconde
function sharedSubject(list: { st: Step }[], i: number, subject: (t: Target) => string): string | null {
  const a = list[i - 1]?.st; const b = list[i]?.st;
  if (!a || !b || b.link !== 'and' || b.cond || !('action' in a) || !('action' in b) || !('target' in a.action) || !('target' in b.action)) return null;
  if (JSON.stringify(a.action.target) !== JSON.stringify(b.action.target)) return null;
  return upper(subject(b.action.target));
}

function enSteps(steps: Step[], ctx: Ctx): string {
  let out = '';
  const list = joinSteps(steps, (st, pair) => (pair ? enKwPair(pair, ctx) : enStep(st, ctx)));
  list.forEach(({ st, body: b }, i) => {
    let body = b;
    const same = sharedSubject(list, i, (t) => enTarget(t, ctx));
    if (same && body.startsWith(`${same} `)) body = body.slice(same.length + 1);
    if (st.cond) body = `If ${enCond(st.cond, ctx)}, ${lower(body)}`;
    if (i === 0 && !st.link) { out = upper(body); return; }
    switch (st.link) {
      case 'and': out += ` and ${lower(body)}`; break;
      case 'then': out += `. Then, ${lower(body)}`; break;
      case 'ifYouDo': out += `. If you do, ${lower(body)}`; break;
      case 'ifNotYouDo': out += `. If you don't, ${lower(body)}`; break;
      default: out += `${out ? '. ' : ''}${upper(body)}`;
    }
  });
  return out;
}

function enKwPair({ kw, mod }: KwPair, ctx: Ctx): string {
  const what = `[${kw.keyword}] and ${sign(mod.amount)} ${mod.kind}${EN_DURATION[kw.until]}`;
  return enSubject(kw.target) ? `${upper(enTarget(kw.target, ctx))} gains ${what}` : `Give ${enTarget(kw.target, ctx)} ${what}`;
}

function enStep(st: Step, ctx: Ctx): string {
  if ('action' in st) return enAction(st.action, ctx);
  if ('may' in st) return `you may ${lower(enSteps(st.may, ctx))}`;
  if ('chooseOne' in st) return `Choose one:\n${st.chooseOne.map((o) => `• ${enSteps(o, ctx)}.`).join('\n')}`.replace(/\.$/, '');
  return enSteps(st.group, ctx);   // la condition du groupe est ajoutée par enSteps
}

function enEvent(e: RecipeEvent, ctx: Ctx): string {
  const by = e.byOpponent ? " by your opponent's effect" : '';
  const f = e.filter ?? {};
  const has = Object.keys(f).length > 0;
  switch (e.on) {
    case 'koOwnChar': return has ? `one of your ${enNoun(f, ['CHARACTER'], true)} is KO'd${by}` : `${EN_SELF[ctx.self]} is KO'd${by}`;
    case 'koOppChar': return `one of your opponent's ${enNoun(f, ['CHARACTER'], true)} is KO'd`;
    case 'leaveOwnChar': return `one of your ${enNoun(f, ['CHARACTER'], true)} is removed from the field${by}`;
    case 'damage': return 'your Leader takes damage';
    case 'lifeRemoved': return 'a card is removed from your Life cards';
    case 'drawOutsideDraw': return 'you draw a card outside of your Draw Phase';
    case 'trashFromHand': return `a card is trashed from your hand${by}`;
    case 'playChar': { const n = enNoun(f, ['CHARACTER'], false); return `you play ${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`; }
    case 'oppPlayChar': return 'your opponent plays a Character';
    case 'donReturned': return 'a DON!! card on your field is returned to your DON!! deck';
    case 'attacked': return `${EN_SELF[ctx.self]} is attacked`;
    case 'rested': return `${EN_SELF[ctx.self]} becomes rested`;
    case 'other': return manual('event', 'other', ctx);
    default: return unknown('évènement', e.on as never, ctx);
  }
}

const EN: Lang = {
  keyword: (k) => k,
  alsoNamed: (n) => `Also treat this card's name as [${n}] according to the rules.`,
  triggerTag: 'Trigger',
  ability(a, ctx, timings) {
    const tags: string[] = [];
    if (a.don) tags.push(`[DON!! x${a.don}]`);
    if (a.yourTurn) tags.push('[Your Turn]');
    if (a.oppTurn) tags.push("[Opponent's Turn]");
    const ts = (timings ?? [a.timing]).filter((t): t is Exclude<Timing, 'static' | 'when'> => t !== 'static' && t !== 'when');
    if (ts.length) tags.push(ts.map((t) => `[${EN_TIMING[t]}]`).join('/'));
    if (a.oncePerTurn) tags.push('[Once Per Turn]');
    let head = tags.join(' ');
    const prefix = (a.cost ?? []).filter((p) => p.kind === 'donMinus' || (p.kind === 'restDon' && p.n <= 4));
    const others = (a.cost ?? []).filter((p) => !prefix.includes(p));
    for (const p of prefix) head += `${head ? ' ' : ''}${enCost(p, ctx)}:`;
    let body = '';
    if (a.timing === 'when' && a.event) body += `When ${enEvent(a.event, ctx)}, `;
    if (a.condition) body += `If ${enCond(a.condition, ctx)}, `;
    if (others.length) body += `${body ? 'you' : 'You'} may ${andList(others.map((p) => enCost(p, ctx)), 'and')}: `;
    const steps = enSteps(a.steps, ctx);
    body += body && !/: $/.test(body) ? lower(steps) : steps;
    return `${head}${head ? ' ' : ''}${body}${/[.:]$/.test(body) || !body ? '' : '.'}`.trim();
  },
};

// ======================================================================================================================
// Français lisible
// ======================================================================================================================

const FR_TIMING: Record<Exclude<Timing, 'when' | 'static'>, string> = {
  onPlay: 'Jouée', whenAttacking: 'En attaquant', onBlock: 'En bloquant', onKO: 'En cas de KO', endOfTurn: 'Fin de votre tour',
  endOfOppTurn: 'Fin du tour adverse', onOppAttack: 'Attaque adverse', activateMain: 'Activation : Principale',
  main: 'Principale', counter: 'Contre', trigger: 'Déclenchement',
};
const FR_DURATION: Record<Duration, string> = {
  battle: ' pour tout le combat', turn: ' pour tout le tour', oppNextEnd: " jusqu'à la fin du prochain tour adverse",
  nextTurn: " jusqu'à la fin de votre prochain tour", permanent: '',
};
// Libellés de l'appli (game/ui/labels.ts), repris ici pour que le moteur ne dépende pas de l'interface
const FR_KEYWORD: Record<Keyword, string> = {
  Blocker: 'Bloqueur', Rush: 'Initiative', 'Rush: Character': 'Initiative : Personnage', 'Double Attack': 'Double attaque',
  Banish: 'Exil', Unblockable: 'Imblocable',
};
const FR_ATTRIBUTE: Record<string, string> = { Slash: 'Tranche', Strike: 'Frappe', Ranged: 'Distance', Special: 'Spécial', Wisdom: 'Sagesse' };
const FR_COLOR: Record<Color, [string, string]> = {
  Red: ['rouge', 'rouges'], Green: ['verte', 'vertes'], Blue: ['bleue', 'bleues'], Purple: ['violette', 'violettes'],
  Black: ['noire', 'noires'], Yellow: ['jaune', 'jaunes'],
};
const FR_CAT: Record<Category, [string, string]> = {
  LEADER: ['Leader', 'Leaders'], CHARACTER: ['Personnage', 'Personnages'], EVENT: ['Évènement', 'Évènements'], STAGE: ['Lieu', 'Lieux'],
};
const FR_SELF: Record<Category, string> = { LEADER: 'ce Leader', CHARACTER: 'ce Personnage', EVENT: 'cette carte', STAGE: 'ce Lieu' };
const FR_CMP = { le: 'ou moins', ge: 'ou plus', eq: '' } as const;
const frCmp = (n: number, cmp: 'le' | 'ge' | 'eq') => (cmp === 'eq' ? `${n}` : `${n} ${FR_CMP[cmp]}`);
const cartes = (n: number) => `${n} carte${n > 1 ? 's' : ''}`;

function frWith(f: Filter, ctx: Ctx): string[] {
  const out: string[] = [];
  const range = (min: number | undefined, max: number | undefined, fmt: (v: string) => string) => {
    if (min !== undefined && max !== undefined) out.push(min === max ? fmt(`${min}`) : fmt(`compris entre ${min} et ${max}`));
    else if (max !== undefined) out.push(fmt(`${max} ou moins`));
    else if (min !== undefined) out.push(fmt(`${min} ou plus`));
  };
  void ctx;
  if (f.costEq !== undefined) out.push(`un coût de ${f.costEq}`);
  range(f.costMin, f.costMax, (v) => (v.startsWith('compris') ? `un coût ${v}` : `un coût de ${v}`));
  range(f.baseCostMin, f.baseCostMax, (v) => (v.startsWith('compris') ? `un coût de base ${v}` : `un coût de base de ${v}`));
  range(f.powerMin, f.powerMax, (v) => (v.startsWith('compris') ? `une puissance ${v}` : `${v.replace(/ ou /, ' de puissance ou ')}`));
  range(f.basePowerMin, f.basePowerMax, (v) => (v.startsWith('compris') ? `une puissance de base ${v}` : `${v.replace(/ ou /, ' de puissance de base ou ')}`));
  if (f.attribute) out.push(`l'attribut <${FR_ATTRIBUTE[f.attribute] ?? f.attribute}>`);
  if (f.trigger) out.push('un [Déclenchement]');
  if (f.keyword) out.push(`[${FR_KEYWORD[f.keyword]}]`);
  if (f.donMin !== undefined) out.push(`${f.donMin} cartes DON!! ou plus attachées`);
  return out;
}

// « Personnages {Marine} noirs épuisés ayant un coût de 3 ou moins, autres que [Izo] »
function frNoun(f: Filter, cats: Category[], many: boolean, ctx: Ctx, card = false, adj = ''): string {
  if (f.anyOf?.length) {
    const pieces = f.anyOf.map((p) => frNoun(p, p.category ?? [], many, ctx, true).replace(/^cartes? /, ''));
    const tail = frNoun({ ...f, anyOf: undefined }, cats, many, ctx, true).replace(/^cartes?\s*/, '');
    return `${many ? 'cartes' : 'carte'} ${orList(pieces, 'ou')}${tail ? ` ${tail}` : ''}`.replace(/\s+/g, ' ').trim();
  }
  const c = f.category?.length ? f.category : cats;
  let noun: string;
  if (!c.length) noun = many ? 'cartes' : 'carte';
  else if (c.length === 2 && c.includes('LEADER') && c.includes('CHARACTER')) noun = many ? 'Leader ou Personnages' : 'Leader ou Personnage';
  else noun = (card ? (many ? 'cartes ' : 'carte ') : '') + orList(c.map((x) => FR_CAT[x][card ? 0 : many ? 1 : 0]), 'ou');
  const parts = [noun];
  if (adj) parts.push(adj);
  if (f.name?.length) parts.push(orList(f.name.map((n) => `[${n}]`), 'ou'));
  if (f.types?.length) parts.push(`de type ${(f.typesMode === 'all' ? andList : orList)(f.types.map((t) => `{${ctx.typeLabel(t)}}`), f.typesMode === 'all' ? 'et' : 'ou')}`);
  if (f.color?.length) parts.push(orList(f.color.map((x) => FR_COLOR[x][many ? 1 : 0]), 'ou'));
  if (f.rested !== undefined) parts.push(f.rested ? (many ? 'épuisés' : 'épuisé') : (many ? 'redressés' : 'redressé'));
  if (f.vanilla) parts.push('sans effet de base');
  const withs = frWith(f, ctx);
  if (f.typeIncludes) withs.push(`un type incluant «${f.typeIncludes}»`);
  let s = parts.join(' ');
  if (withs.length) s += ` ayant ${andList(withs, 'et')}`;
  if (f.noKeyword) s += `${withs.length ? ' et' : ''} n'ayant pas [${FR_KEYWORD[f.noKeyword]}]`;
  if (f.notName) s += ` autre${many ? 's' : ''} que [${f.notName}]`;
  return s;
}

function frTarget(t: Target, ctx: Ctx): string {
  if (t.that) return 'cette carte';
  if (t.self && t.zone === 'hand') return 'cette carte de votre main';
  if (t.self) return t.leader ? 'ce Leader' : t.characters ? 'ce Personnage' : t.stage ? 'ce Lieu' : 'cette carte';
  const cats: Category[] = [...(t.leader ? ['LEADER' as const] : []), ...(t.characters ? ['CHARACTER' as const] : []), ...(t.stage ? ['STAGE' as const] : [])];
  const plain = !Object.keys(t.filter).length;
  if (t.leader && !t.characters && !t.stage && t.count === 1 && !t.upTo) {
    const who = t.side === 'opp' ? 'le Leader adverse' : 'votre Leader';
    return plain ? who : `${who}${frNoun(t.filter, [], false, ctx).replace(/^carte/, '')}`;
  }
  const many = t.count === 'all' || (t.side === 'own') || plural(t.count);
  const adj = t.side === 'opp' ? (many ? 'adverses' : 'adverse') : '';
  const noun = frNoun(t.filter, cats, many, ctx, false, adj);
  let s: string;
  if (t.count === 'all') s = t.side === 'own' ? `tous vos ${noun}` : `tous les ${noun}`;
  else {
    const q = `${t.upTo ? "jusqu'à " : ''}${t.count}`;
    s = t.side === 'own' ? `${q} de vos ${noun}` : `${q} ${noun}`;
  }
  if (t.otherThanSelf) s += ` autre${many ? 's' : ''} que ${FR_SELF[ctx.self]}`;
  return s;
}

const frCards = (n: number, f: Filter, ctx: Ctx) => frNoun(f, [], plural(n), ctx, true);

function frCond(c: Cond, ctx: Ctx): string {
  switch (c.kind) {
    case 'leaderIs': return `votre Leader est ${orList(c.names.map((n) => `[${n}]`), 'ou')}`;
    case 'leaderType': return `votre Leader est de type ${(c.mode === 'all' ? andList : orList)(c.types.map((t) => `{${ctx.typeLabel(t)}}`), c.mode === 'all' ? 'et' : 'ou')}`;
    case 'leaderTypeIncludes': return `le type de votre Leader inclut «${c.part}»`;
    case 'leaderColor': return c.multicolor ? 'votre Leader est multicolore' : `votre Leader est ${orList(c.colors.map((x) => FR_COLOR[x][0]), 'ou')}`;
    case 'leaderAttribute': return `votre Leader a l'attribut <${FR_ATTRIBUTE[c.attribute] ?? c.attribute}>`;
    case 'life':
      if (c.side === 'total') return `vous et votre adversaire avez ${frCmp(c.n, c.cmp)} cartes de Vie au total`;
      return `${c.side === 'own' ? 'vous avez' : 'votre adversaire a'} ${frCmp(c.n, c.cmp)} cartes de Vie`;
    case 'lifeVsOpp': return `vous avez ${c.cmp === 'lt' ? 'moins' : c.cmp === 'gt' ? 'plus' : c.cmp === 'le' ? 'autant ou moins' : 'autant ou plus'} de cartes de Vie que votre adversaire`;
    case 'hand': return c.side === 'own' ? `vous avez ${frCmp(c.n, c.cmp)} cartes en main` : `votre adversaire a ${frCmp(c.n, c.cmp)} cartes en main`;
    case 'donField': return c.side === 'own' ? `vous avez ${frCmp(c.n, c.cmp)} cartes DON!! sur votre terrain` : `votre adversaire a ${frCmp(c.n, c.cmp)} cartes DON!! sur son terrain`;
    case 'donVsOpp':
      if (c.cmp === 'le' || c.cmp === 'ge') return `vous avez autant ou ${c.cmp === 'le' ? 'moins' : 'plus'} de cartes DON!! sur votre terrain que votre adversaire`;
      return `votre adversaire a ${c.cmp === 'lt' ? 'plus' : 'moins'} de cartes DON!! sur son terrain que vous`;
    case 'trash': return `vous avez ${frCmp(c.n, c.cmp)} ${c.filter ? frCards(2, c.filter, ctx) : 'cartes'} dans votre Défausse`;
    case 'deck': return `vous avez ${frCmp(c.n, c.cmp)} cartes dans votre deck`;
    case 'chars': {
      const subj = c.side === 'opp' ? 'votre adversaire a' : c.side === 'own' ? 'vous avez' : 'il y a';
      if (c.cmp === 'eq' && c.n === 0) return c.side === 'opp' ? `votre adversaire n'a aucun ${frNoun(c.filter, [], false, ctx)}`
        : c.side === 'own' ? `vous n'avez aucun ${frNoun(c.filter, [], false, ctx)}` : `il n'y a aucun ${frNoun(c.filter, [], false, ctx)}`;
      if (c.cmp === 'ge' && c.n === 1) return `${subj} au moins 1 ${frNoun(c.filter, [], false, ctx)}`;
      return `${subj} ${frCmp(c.n, c.cmp)} ${frNoun(c.filter, [], c.n !== 1, ctx)}`;
    }
    case 'fieldCards': return `${c.side === 'own' ? 'vous avez' : 'votre adversaire a'} ${frCmp(c.n, c.cmp)} cartes${c.rested === true ? ' épuisées' : c.rested === false ? ' redressées' : ''} sur le terrain`;
    case 'selfState': {
      const me = FR_SELF[ctx.self];
      if (c.donMin !== undefined) return `${me} a ${c.donMin} cartes DON!! ou plus attachées`;
      return `${me} est ${c.rested ? 'épuisé' : 'redressé'}`;
    }
    case 'turn': return c.mine ? "c'est votre tour" : "c'est le tour adverse";
    case 'playedThisTurn': return `${FR_SELF[ctx.self]} a été joué pendant ce tour`;
    case 'firstTurns': return `c'est au moins le tour ${c.fromTurn}`;
    case 'and': return andList(c.all.map((x) => frCond(x, ctx)), 'et');
    case 'or': return orList(c.any.map((x) => frCond(x, ctx)), 'ou');
    case 'not': return `non : ${frCond(c.cond, ctx)}`;
    case 'manual': return manual('cond', c.reason, ctx);
    default: return unknown('condition', c, ctx);
  }
}

// Coûts à l'infinitif : « Vous pouvez épuiser ce Personnage : »
function frCost(p: CostPart, ctx: Ctx): string {
  const me = FR_SELF[ctx.self];
  switch (p.kind) {
    case 'donMinus': return `DON!! -${p.n}`;
    case 'restDon': return '①②③④'[p.n - 1] ?? `épuiser ${p.n} de vos cartes DON!!`;
    case 'restSelf': return `épuiser ${me}`;
    case 'trashSelf': return `placer ${me} dans votre Défausse`;
    case 'discard': return `défausser ${p.n} ${p.filter ? frCards(p.n, p.filter, ctx) : p.n === 1 ? 'carte' : 'cartes'} de votre main`;
    case 'reveal': return `révéler ${p.n} ${frCards(p.n, p.filter ?? {}, ctx)} de votre main`;
    case 'trashTop': return `placer les ${cartes(p.n)} du dessus de votre deck dans votre Défausse`;
    case 'lifeToHand': return `ajouter à votre main 1 carte du ${p.from === 'top' ? 'dessus' : 'dessus ou du dessous'} de votre Vie`;
    case 'flipLife': return `retourner face ${p.faceUp ? 'visible' : 'cachée'} 1 carte du dessus de votre Vie`;
    case 'trashOwnChar': return `placer ${p.n} de vos ${frNoun(p.filter, ['CHARACTER'], true, ctx)} dans votre Défausse`;
    case 'returnOwnChar': return `renvoyer ${p.n} de vos ${frNoun(p.filter, ['CHARACTER'], true, ctx)} dans la main de son propriétaire`;
    case 'restOwn':
      if (p.what === 'leader') return 'épuiser votre Leader';
      if (p.what === 'stage') return 'épuiser votre Lieu';
      if (p.what === 'cards') return `épuiser ${p.n} de vos cartes`;
      return `épuiser ${p.n} de vos ${frNoun(p.filter ?? {}, ['CHARACTER'], true, ctx)}`;
    case 'giveDon': return `donner ${p.n} carte${p.n > 1 ? 's' : ''} DON!! redressée${p.n > 1 ? 's' : ''} à ${frTarget(p.target, ctx)}`;
    case 'trashToBottom': return `placer ${p.n} ${p.filter ? frCards(p.n, p.filter, ctx) : p.n === 1 ? 'carte' : 'cartes'} de votre Défausse au-dessous de votre deck dans l'ordre de votre choix`;
    case 'trashLife': return `placer dans votre Défausse 1 carte du ${p.from === 'top' ? 'dessus' : 'dessus ou du dessous'} de votre Vie`;
    case 'leaderPowerMinus': return `donner -${p.n} de puissance à votre Leader redressé pour tout le tour`;
    case 'bounceSelf': return `renvoyer ${me} dans la main de son propriétaire`;
    case 'selfToBottom': return `placer ${me} au-dessous du deck de son propriétaire`;
    case 'manual': return manual('cost', p.reason, ctx);
    default: return unknown('coût', p, ctx);
  }
}

function frAction(a: Action, ctx: Ctx): string {
  const T = (t: Target) => frTarget(t, ctx);
  switch (a.kind) {
    case 'ko': return `Mettez KO ${T(a.target)}`;
    case 'rest': return `Épuisez ${T(a.target)}`;
    case 'setActive': return `Redressez ${T(a.target)}`;
    case 'bounce': return `Renvoyez ${T(a.target)} dans la main de son propriétaire`;
    case 'bottom': return `Placez ${T(a.target)} au-dessous du deck de son propriétaire`;
    case 'toLife': return `Placez ${T(a.target)} au-dessus de la Vie de son propriétaire, face ${a.faceUp ? 'visible' : 'cachée'}`;
    case 'trashChar': return `Placez ${T(a.target)} dans la Défausse de son propriétaire`;
    case 'power': return `${upper(T(a.target))} gagne ${a.target.that ? 'encore ' : ''}${sign(a.amount)} de puissance${FR_DURATION[a.until]}`;
    case 'cost': return `${upper(T(a.target))} gagne ${sign(a.amount)} de coût${FR_DURATION[a.until]}`;
    case 'powerSet': return `La puissance de base de ${T(a.target)} devient ${a.value}${FR_DURATION[a.until]}`;
    case 'keyword': return `${upper(T(a.target))} gagne [${FR_KEYWORD[a.keyword]}]${FR_DURATION[a.until]}`;
    case 'cantAttack': return `${upper(T(a.target))} ne peut pas attaquer${a.what === 'leader' ? ' de Leader' : ''}${FR_DURATION[a.until]}`;
    case 'cantBlock': return allOpp(a.target)
      ? `Votre adversaire ne peut pas activer ${frBlockerLimit(a.target.filter)}${FR_DURATION[a.until]}`
      : `${upper(T(a.target))} ne peut pas activer [Bloqueur]${FR_DURATION[a.until]}`;
    case 'cantBeKO': {
      const by = a.byAttribute ? ` au combat par des cartes <${a.byAttribute}>` : a.by === 'battle' ? ' au combat' : a.by === 'effect' ? ' par des effets'
        : a.by === 'oppEffect' ? ' par les effets adverses' : '';
      return `${upper(T(a.target))} ne peut pas être mis KO${by}${FR_DURATION[a.until]}`;
    }
    case 'cantBeRested': return `${upper(T(a.target))} ne peut pas être épuisé${FR_DURATION[a.until]}`;
    case 'cantLeave': return `${upper(T(a.target))} ne peut pas quitter le terrain à cause des effets adverses${FR_DURATION[a.until]}`;
    case 'attackActive': return `${upper(T(a.target))} peut aussi attaquer les Personnages redressés${FR_DURATION[a.until]}`;
    case 'cantRefresh': return `${upper(T(a.target))} ne se redresse pas lors de la prochaine phase de Redressement adverse`;
    case 'negate': return `Annulez les effets de ${T(a.target)}${FR_DURATION[a.until]}`;
    case 'draw': return `Piochez ${cartes(a.n)}`;
    case 'discard': return `Défaussez ${a.n} ${a.filter ? frCards(a.n, a.filter, ctx) : a.n === 1 ? 'carte' : 'cartes'} de votre main`;
    case 'oppDiscard': return `Votre adversaire défausse ${cartes(a.n)} de sa main`;
    case 'trashTop': return `Placez les ${cartes(a.n)} du dessus ${a.side === 'own' ? 'de votre deck dans votre Défausse' : 'du deck adverse dans la Défausse adverse'}`;
    case 'search': {
      const what = `${a.upTo ? "jusqu'à " : ''}${a.take} ${frCards(a.take, a.filter, ctx)}`;
      const it = a.take === 1 ? 'la' : 'les';
      const look = `Regardez les ${cartes(a.look)} du dessus de votre deck`;
      const head = a.dest === 'hand' ? `${look}, révélez ${what} et ajoutez-${it} à votre main`
        : a.dest === 'play' ? `${look} et jouez ${what}${a.rested ? (a.take > 1 ? ' épuisées' : ' épuisée') : ''}`
          : `${look}, révélez ${what} et ajoutez-${it} au-dessus de votre Vie`;
      const rest = a.rest === 'trash' ? 'placez les cartes restantes dans votre Défausse'
        : `placez les cartes restantes au-${a.rest === 'top' ? 'dessus' : 'dessous'} de votre deck dans l'ordre de votre choix`;
      return `${head}. Puis, ${rest}`;
    }
    case 'arrangeTop': return `Regardez les ${cartes(a.look)} du dessus de votre deck et placez-les au-${a.where === 'topOrBottom' ? 'dessus ou au-dessous' : a.where === 'top' ? 'dessus' : 'dessous'} du deck dans l'ordre de votre choix`;
    case 'play': {
      const from = { hand: 'de votre main', trash: 'de votre Défausse', handOrTrash: 'de votre main ou de votre Défausse', deck: 'de votre deck', life: 'de votre Vie' }[a.from];
      return `Jouez ${a.upTo ? "jusqu'à " : ''}${a.count} ${frCards(a.count, a.filter, ctx)} ${from}${a.rested ? (a.count > 1 ? ', épuisées' : ', épuisée') : ''}`;
    }
    case 'playSelf': return `Jouez cette carte${a.rested ? ', épuisée' : ''}`;
    case 'activate': return `Activez l'effet [${({ main: 'Principale', onPlay: 'Jouée', counter: 'Contre', onKO: 'En cas de KO', whenAttacking: 'En attaquant' } as const)[a.which]}] de cette carte`;
    case 'trashToHand': return `Ajoutez à votre main ${a.upTo ? "jusqu'à " : ''}${a.count} ${frCards(a.count, a.filter, ctx)} de votre Défausse`;
    case 'trashToBottom': return a.side === 'own'
      ? `Placez ${a.count} ${frCards(a.count, a.filter, ctx)} de votre Défausse au-dessous de votre deck dans l'ordre de votre choix`
      : `Placez ${a.count} ${frCards(a.count, a.filter, ctx)} de la Défausse adverse au-dessous du deck adverse dans l'ordre de votre choix`;
    case 'addDon': return `Ajoutez ${a.upTo ? "jusqu'à " : ''}${a.n} carte${a.n > 1 ? 's' : ''} DON!! de votre deck DON!!, ${a.state === 'active' ? 'redressée' : 'épuisée'}${a.n > 1 ? 's' : ''}`;
    case 'readyDon': return `Redressez ${a.upTo ? "jusqu'à " : ''}${a.n} de vos cartes DON!!`;
    case 'giveDon': return `Donnez ${a.upTo ? "jusqu'à " : ''}${a.n} carte${a.n > 1 ? 's' : ''} DON!! ${a.rested ? 'épuisée' : 'redressée'}${a.n > 1 ? 's' : ''} à ${T(a.target)}`;
    case 'returnDon': return a.side === 'opp'
      ? `Votre adversaire renvoie ${a.n} carte${a.n > 1 ? 's' : ''} DON!! de son terrain dans son deck DON!!`
      : `Renvoyez ${a.n} carte${a.n > 1 ? 's' : ''} DON!! de votre terrain dans votre deck DON!!`;
    case 'restDon': return a.side === 'opp' ? `Épuisez jusqu'à ${a.n} cartes DON!! adverses` : `Épuisez ${a.n} de vos cartes DON!!`;
    case 'lifeFromDeck': return `Ajoutez au-dessus de votre Vie ${a.upTo ? "jusqu'à " : ''}${cartes(a.n)} du dessus de votre deck${a.faceUp ? ', face visible' : ''}`;
    case 'lifeToHand': return a.side === 'own'
      ? `Ajoutez à votre main ${cartes(a.n)} du ${a.from === 'top' ? 'dessus' : 'dessus ou du dessous'} de votre Vie`
      : `Ajoutez à la main de son propriétaire ${cartes(a.n)} du ${a.from === 'top' ? 'dessus' : 'dessus ou du dessous'} de la Vie adverse`;
    case 'trashLife': return `Placez dans la Défausse ${cartes(a.n)} du ${a.from === 'top' ? 'dessus' : 'dessus ou du dessous'} ${a.side === 'own' ? 'de votre Vie' : 'de la Vie adverse'}`;
    case 'lookLife': {
      const whose = a.side === 'own' ? 'de votre Vie' : a.side === 'opp' ? 'de la Vie adverse' : 'de votre Vie ou de la Vie adverse';
      return `Regardez jusqu'à 1 carte du dessus ${whose}${a.arrange ? ' et placez-la au-dessus ou au-dessous de la Vie' : ''}`;
    }
    case 'handToBottom': return `Placez ${cartes(a.n)} de votre main au-dessous de votre deck dans l'ordre de votre choix`;
    case 'oppHandToBottom': return `Votre adversaire place ${cartes(a.n)} de sa main au-dessous de son deck dans l'ordre de son choix`;
    case 'handToLife': return `Ajoutez au-dessus de votre Vie ${a.upTo ? "jusqu'à " : ''}${a.n} ${frCards(a.n, a.filter, ctx)} de votre main`;
    case 'noCharsThisTurn': return `Vous ne pouvez pas jouer de cartes Personnage${a.what === 'playByEffect' ? ' par des effets' : ''} pour tout le tour`;
    case 'trashSelfEnd': return `À la fin de ce tour, placez ${FR_SELF[ctx.self]} dans votre Défausse`;
    case 'oppChooses': {
      const them = a.n === 1 ? 'le' : 'les';
      const verb = { ko: `${them} mettre KO`, trash: `${them} placer dans sa Défausse`, bounce: `${them} renvoyer dans sa main`, rest: `${them} épuiser` }[a.action];
      return `Votre adversaire choisit ${a.n} de ses ${frNoun(a.filter, ['CHARACTER'], true, ctx)} et doit ${verb}`;
    }
    case 'manual': return manual('step', a.reason, ctx);
    default: return unknown('action', a, ctx);
  }
}

function frSteps(steps: Step[], ctx: Ctx): string {
  let out = '';
  const list = joinSteps(steps, (st, pair) => (pair ? frKwPair(pair, ctx) : frStep(st, ctx)));
  list.forEach(({ st, body: b }, i) => {
    let body = b;
    const same = sharedSubject(list, i, (t) => frTarget(t, ctx));
    if (same && body.startsWith(`${same} `)) body = body.slice(same.length + 1);
    if (st.cond) body = `Si ${frCond(st.cond, ctx)}, ${lower(body)}`;
    if (i === 0 && !st.link) { out = upper(body); return; }
    switch (st.link) {
      case 'and': out += ` et ${lower(body)}`; break;
      case 'then': out += `. Puis, ${lower(body)}`; break;
      case 'ifYouDo': out += `. Si vous le faites, ${lower(body)}`; break;
      case 'ifNotYouDo': out += `. Sinon, ${lower(body)}`; break;
      default: out += `${out ? '. ' : ''}${upper(body)}`;
    }
  });
  return out;
}

function frKwPair({ kw, mod }: KwPair, ctx: Ctx): string {
  return `${upper(frTarget(kw.target, ctx))} gagne [${FR_KEYWORD[kw.keyword]}] et ${sign(mod.amount)} de ${mod.kind === 'power' ? 'puissance' : 'coût'}${FR_DURATION[kw.until]}`;
}

function frStep(st: Step, ctx: Ctx): string {
  if ('action' in st) return frAction(st.action, ctx);
  if ('may' in st) return `si vous le souhaitez, ${lower(frSteps(st.may, ctx))}`;
  if ('chooseOne' in st) return `Choisissez un effet :\n${st.chooseOne.map((o) => `• ${frSteps(o, ctx)}.`).join('\n')}`.replace(/\.$/, '');
  return frSteps(st.group, ctx);
}

function frEvent(e: RecipeEvent, ctx: Ctx): string {
  const by = e.byOpponent ? ' par un effet adverse' : '';
  const f = e.filter ?? {};
  const has = Object.keys(f).length > 0;
  switch (e.on) {
    case 'koOwnChar': return has ? `un de vos ${frNoun(f, ['CHARACTER'], true, ctx)} est mis KO${by}` : `${FR_SELF[ctx.self]} est mis KO${by}`;
    case 'koOppChar': return `un ${frNoun(f, ['CHARACTER'], false, ctx)} adverse est mis KO`;
    case 'leaveOwnChar': return `un de vos ${frNoun(f, ['CHARACTER'], true, ctx)} quitte le terrain${by}`;
    case 'damage': return 'votre Leader subit des dégâts';
    case 'lifeRemoved': return 'une carte quitte votre Vie';
    case 'drawOutsideDraw': return 'vous piochez une carte en dehors de votre phase de Pioche';
    case 'trashFromHand': return `une carte de votre main est placée dans la Défausse${by}`;
    case 'playChar': return `vous jouez un ${frNoun(f, ['CHARACTER'], false, ctx)}`;
    case 'oppPlayChar': return 'votre adversaire joue un Personnage';
    case 'donReturned': return 'une carte DON!! de votre terrain est renvoyée dans votre deck DON!!';
    case 'attacked': return `${FR_SELF[ctx.self]} est attaqué`;
    case 'rested': return `${FR_SELF[ctx.self]} est épuisé`;
    case 'other': return manual('event', 'other', ctx);
    default: return unknown('évènement', e.on as never, ctx);
  }
}

const FR: Lang = {
  keyword: (k) => FR_KEYWORD[k],
  alsoNamed: (n) => `Cette carte est aussi considérée comme [${n}].`,
  triggerTag: 'Déclenchement',
  ability(a, ctx, timings) {
    const tags: string[] = [];
    if (a.don) tags.push(`[DON!! x${a.don}]`);
    if (a.yourTurn) tags.push('[Votre tour]');
    if (a.oppTurn) tags.push('[Tour adverse]');
    const ts = (timings ?? [a.timing]).filter((t): t is Exclude<Timing, 'static' | 'when'> => t !== 'static' && t !== 'when');
    if (ts.length) tags.push(ts.map((t) => `[${FR_TIMING[t]}]`).join('/'));
    if (a.oncePerTurn) tags.push('[Une fois par tour]');
    let head = tags.join(' ');
    const prefix = (a.cost ?? []).filter((p) => p.kind === 'donMinus' || (p.kind === 'restDon' && p.n <= 4));
    const others = (a.cost ?? []).filter((p) => !prefix.includes(p));
    for (const p of prefix) head += `${head ? ' ' : ''}${frCost(p, ctx)} :`;
    let body = '';
    if (a.timing === 'when' && a.event) body += `Quand ${frEvent(a.event, ctx)}, `;
    if (a.condition) body += `Si ${frCond(a.condition, ctx)}, `;
    if (others.length) body += `${body ? 'vous' : 'Vous'} pouvez ${andList(others.map((p) => frCost(p, ctx)), 'et')} : `;
    const steps = frSteps(a.steps, ctx);
    body += body && !/: $/.test(body) ? lower(steps) : steps;
    return `${head}${head ? ' ' : ''}${body}${/[.:]$/.test(body) || !body ? '' : '.'}`.trim();
  },
};
