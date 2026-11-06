// Traducteur (tâche C1.4) : la STRUCTURE d'une carte. Lignes → capacités (moments, [DON!! xN], [Your Turn],
// [Once Per Turn], coûts ① et DON!! −N, « When ... , », « If ..., you may ...: », « You may ...: ») → phrases (« Then, »,
// « If you do, », « If you don't, », « If ..., », « ... if ... », « Choose one: », « you may ... », « A and B ») →
// actions, conditions, coûts et évènements, lus par les règles des FAMILLES (vague C2, parse/<famille>.ts).
//
// Interface des règles (fixée par C1.4, 01-contrats.md § 15.4) : une famille est un objet `Family` avec des listes de
// règles `{ re, make }` par sorte de morceau. Le squelette essaie les familles dans l'ordre de FAMILIES (parse/index.ts),
// et dans une famille les règles dans l'ordre : la première dont l'expression correspond ET dont `make` ne lève pas
// d'Unknown l'emporte ; une règle qui lit mal sa cible (Unknown) laisse la place aux suivantes. Rien ne correspond : le
// morceau est rapporté « non compris », avec sa sorte (action, condition, coût, évènement...).
//
// Les règles reçoivent le texte NORMALISÉ (normalize.ts : « KO », « DON!! -1 », ①), sans le point final. Une action
// s'écrit avec une majuscule (« KO up to 1 ... », « Draw 1 card ») : les morceaux coupés au milieu d'une phrase sont
// remis en majuscule avant d'être essayés.
import type { Ability, Action, Cond, CostPart, Duration, Filter, Link, Recipe, RecipeEvent, Side, Step, Target, Timing } from '../types.ts';
import { attempt, fail, KEYWORD_RE, protect, Unknown, unprotect } from './normalize.ts';
import { durationAfter, parseFilter, parseTarget } from './target.ts';
import type { Keyword } from '../types.ts';

// ---------- Interface des familles ----------

// Ce que le squelette prête aux règles : relire un morceau avec toute la grammaire (toutes les familles)
export interface Helpers {
  steps(phrase: string): Step[];             // une phrase d'action (avec ses « and », « then », « if »)
  cond(phrase: string): Cond;                // une condition (« your Leader is [X] and you have ... »)
  cost(phrase: string): CostPart[];          // un coût (« trash 1 card from your hand and rest this Character »)
  event(phrase: string): RecipeEvent;        // un évènement (ce qui suit « When »)
  target(phrase: string, defaultSide?: Side): Target;
  filter(phrase: string): Filter;
  duration(rest: string, absent?: Duration): Duration;
}

export interface Rule<T> {
  re: RegExp;
  make: (m: RegExpMatchArray, h: Helpers) => T;
}

// Une phrase qui complète l'étape précédente au lieu d'en ajouter une (« Then, place the rest at the bottom of your
// deck » après une recherche) : `make` rend la fonction qui modifie les étapes déjà lues de la capacité (et lève un
// Unknown si elle n'a rien à compléter).
export type Continuation = Rule<(steps: Step[]) => void>;

export interface Family {
  name: string;                              // 'removal', 'power', 'cards', 'don', 'life', 'play'... (le fichier)
  actions?: Rule<(Action | Step)[]>[];       // une action, ou plusieurs étapes (« gains [Rush] and +1000 power »)
  conds?: Rule<Cond>[];
  costs?: Rule<CostPart>[];
  events?: Rule<RecipeEvent>[];
  continuations?: Continuation[];
}

// ---------- Moments et étiquettes ----------

export const TIMINGS: Readonly<Record<string, Timing>> = {
  'On Play': 'onPlay', 'When Attacking': 'whenAttacking', 'Activate: Main': 'activateMain', Main: 'main',
  Counter: 'counter', 'On KO': 'onKO', 'End of Your Turn': 'endOfTurn', "End of Your Opponent's Turn": 'endOfOppTurn',
  "On Your Opponent's Attack": 'onOppAttack', 'On Block': 'onBlock', Trigger: 'trigger',
};
const CIRCLED = '①②③④⑤';

// ---------- Outils de découpage (sur le texte protégé : un point ou une virgule dans un [nom] ne coupe rien) ----------

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const trimEnd = (x: string) => x.trim().replace(/\.$/, '').trim();

// Toutes les façons de couper `s` en deux sur `re` : [avant, après], de la plus à gauche à la plus à droite
function cuts(s: string, re: RegExp): [string, string][] {
  const p = protect(s);
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...p.matchAll(g)].map((m) => [s.slice(0, m.index), s.slice(m.index! + m[0].length)]);
}
function splitAll(s: string, re: RegExp): string[] {
  const p = protect(s);
  const out: string[] = [];
  let last = 0;
  for (const m of p.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))) {
    out.push(s.slice(last, m.index));
    last = m.index! + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}
// Phrases : coupure après « . » suivi d'une majuscule ou d'une puce
export function sentences(body: string): string[] {
  return splitAll(body, /(?<=\.)\s+(?=[A-Z•])/).map((x) => x.trim()).filter(Boolean);
}

// ---------- Le traducteur d'une carte ----------

const isAction = (x: Action | Step): x is Action => 'kind' in x;

export class Parser {
  readonly families: readonly Family[];
  private memo = new Map<string, Step[] | Unknown>();
  readonly h: Helpers;

  constructor(families: readonly Family[]) {
    this.families = families;
    this.h = {
      steps: (p) => this.action(p),
      cond: (p) => this.cond(p),
      cost: (p) => this.cost(p),
      event: (p) => this.event(p),
      target: (p, d) => parseTarget(p, d),
      filter: (p) => parseFilter(p),
      duration: (r, a) => durationAfter(r, a),
    };
  }

  // Essaie les règles d'une sorte dans toutes les familles ; la première qui lit le morceau l'emporte
  private rules<T>(kind: 'actions' | 'conds' | 'costs' | 'events', s: string, why: string): T {
    let first: Unknown | undefined;
    for (const fam of this.families) {
      for (const rule of (fam[kind] ?? []) as Rule<T>[]) {
        const m = s.match(rule.re);
        if (!m) continue;
        const r = attempt(() => rule.make(m, this.h));
        if (!(r instanceof Unknown)) return r;
        first ??= r;
      }
    }
    if (first) throw first;
    return fail(s, why);
  }

  // ----- Conditions : « A and B » (chaque morceau commence par un sujet), sinon une seule condition -----
  cond(phrase: string): Cond {
    const p = trimEnd(phrase);
    const parts = splitAll(p.replace(/you and your opponent/gi, 'youyour opponent'), /,? and (?=(?:your|you have|you|there|this|the number|it is)\b)/i)
      .map((x) => x.replace(//g, ' and '));
    if (parts.length > 1 && parts.every((x) => /^(?:your|you|there|this|the|it is)\b/i.test(x))) {
      return { kind: 'and', all: parts.map((x) => this.rules<Cond>('conds', x.trim(), 'condition')) };
    }
    return this.rules<Cond>('conds', p, 'condition');
  }

  // ----- Coûts : « A and B » (chaque morceau commence par un verbe de coût) -----
  // « rest 1 of your DON!! cards and this Character », « rest this card and 1 of your DON!! cards » (C2.4) : un seul verbe
  // pour deux morceaux, le second le reprend
  cost(phrase: string): CostPart[] {
    const VERB = /^(rest|trash|reveal|return|place|add|give|turn|KO)\b/i;
    const parts = splitAll(trimEnd(phrase), /,? and (?=(?:rest|trash|reveal|return|place|add|give|turn|KO|this (?:Character|Leader|card)|\d+ of your)\b)/i)
      .map((x) => x.trim());
    for (let i = 1; i < parts.length; i++) {
      const verb = parts[i - 1].match(VERB);
      if (!VERB.test(parts[i]) && verb) parts[i] = `${verb[1]} ${parts[i]}`;
    }
    return parts.map((x) => this.rules<CostPart>('costs', x, 'coût'));
  }

  event(phrase: string): RecipeEvent {
    return this.rules<RecipeEvent>('events', trimEnd(phrase), 'évènement');
  }

  // ----- Une phrase d'action → étapes -----
  action(phrase: string): Step[] {
    const s = trimEnd(phrase);
    const known = this.memo.get(s);
    if (known instanceof Unknown) throw known;
    if (known) return known.map((x) => ({ ...x }));
    const r = attempt(() => this.actionUncached(s));
    this.memo.set(s, r);
    if (r instanceof Unknown) throw r;
    return r.map((x) => ({ ...x }));
  }

  private actionUncached(s: string): Step[] {
    let m: RegExpMatchArray | null;
    // « you may X » sans deux-points : effet facultatif
    if ((m = s.match(/^you may (.+)$/is)) && !protect(s).includes(':')) return [{ may: this.action(cap(m[1])) }];
    // les règles des familles
    const direct = attempt(() => this.rules<(Action | Step)[]>('actions', s, 'action'));
    if (!(direct instanceof Unknown)) return direct.map((x) => (isAction(x) ? { action: x } : x));
    // « Draw 1 card if you have 5 or less cards in your hand » : la condition couvre toute la phrase
    for (const [a, c] of cuts(s, / if /i)) {
      const r = attempt(() => {
        const cond = this.cond(c);
        const st = this.action(a);
        return st.length > 1 ? [{ cond, group: st } as Step] : [{ ...st[0], cond } as Step];
      });
      if (!(r instanceof Unknown)) return r;
    }
    // « X, then Y », « X and Y »
    const SEPS: [RegExp, Link][] = [
      [/, then,? /i, 'then'], [/ and then,? /i, 'then'], [/, and /i, 'and'],
      [/ and (?=(?:draw|trash|play|add|give|rest|KO|return|place|set|look|reveal|you|your|this|up to|that|it|gains?)\b)/i, 'and'],
    ];
    for (const [re, link] of SEPS) {
      for (const [a, b] of cuts(s, re)) {
        const r = attempt(() => {
          const left = this.action(a);
          const right = this.action(cap(b.trim()));
          right[0] = { ...right[0], link };
          return [...left, ...right];
        });
        if (!(r instanceof Unknown)) return r;
      }
    }
    throw direct;
  }

  // ----- Le corps d'une capacité : phrases, enchaînements, « Choose one: » -----
  // Les morceaux non compris vont dans `errors` ; on continue pour rapporter tous ceux de la capacité.
  steps(body: string, errors: Unknown[], isStatic: boolean): Step[] {
    const pb = protect(body);
    const bi = pb.indexOf('•');
    if (bi >= 0) return this.bullets(body, bi, errors, isStatic);
    if (/\bchoose one:/i.test(pb)) errors.push(new Unknown(body, 'structure : « Choose one » sans choix'));
    const out: Step[] = [];
    for (const sen of sentences(body)) {
      const r = attempt(() => this.sentence(sen, out, errors, isStatic));
      if (r instanceof Unknown) errors.push(r);
    }
    return out;
  }

  // Un texte à puces : « [phrases.] [If C,] choose one: • A • B ». Ce qui précède est lu avant, le choix suit avec
  // « then » ; « If C, choose one: » met la condition sur le choix. Autres introductions (« Your opponent chooses
  // one: », « Apply each of the following effects ...: ») : les puces sont lues (pour le rapport) et l'introduction est
  // rapportée non comprise, pour une famille ou une tâche « set ».
  private bullets(body: string, bi: number, errors: Unknown[], isStatic: boolean): Step[] {
    const header = body.slice(0, bi).trim();
    const options = splitAll(body.slice(bi), /•/).map((x) => x.trim()).filter(Boolean);
    const optionSteps = () => options.map((o) => this.steps(o, errors, isStatic));
    const m = protect(header).match(/^(.*?)\bchoose one:$/is);
    if (!m) {
      const intro = header.replace(/:$/, '');
      if (!header.endsWith(':')) errors.push(new Unknown(body, 'structure : puces sans introduction'));
      else if (/^Your opponent chooses one$/i.test(intro.split(/(?<=\.)\s+/).at(-1)!)) errors.push(new Unknown(intro, "choix de l'adversaire"));
      else errors.push(new Unknown(intro, 'introduction des puces'));
      optionSteps();
      return [];
    }
    let pre = header.slice(0, m[1].length).trim();
    let cond: Cond | undefined;
    // « If C, choose one: » : la condition est la dernière phrase avant le choix
    const ss = sentences(pre);
    const last = ss.at(-1);
    let cm: RegExpMatchArray | null;
    if (last && (cm = last.match(/^(?:Then,\s*)?if (.+),$/is))) {
      const r = attempt(() => this.cond(cm![1]));
      if (r instanceof Unknown) errors.push(r); else cond = r;
      pre = ss.slice(0, -1).join(' ');
    } else if ((cm = pre.match(/^(.+?),? then$/is))) {
      pre = `${cm[1]}.`;                                // « Draw 1 card, then choose one: »
    } else if (pre && !/[.]$/.test(pre)) {
      errors.push(new Unknown(header, 'structure : avant « choose one »'));
      pre = '';
    }
    const out = pre ? this.steps(pre, errors, isStatic) : [];
    const step: Step = { chooseOne: optionSteps() };
    if (out.length) step.link = 'then';
    if (cond) step.cond = cond;
    out.push(step);
    return out;
  }

  // Un morceau qui complète les étapes déjà lues (règles `continuations`) : vrai s'il a été appliqué
  private continuation(text: string, out: Step[]): boolean {
    for (const fam of this.families) {
      for (const rule of fam.continuations ?? []) {
        const mm = text.match(rule.re);
        if (!mm) continue;
        const r = attempt(() => rule.make(mm, this.h)(out));
        if (!(r instanceof Unknown)) return true;
      }
    }
    return false;
  }
  private isContinuation(text: string): boolean {
    return this.families.some((f) => (f.continuations ?? []).some((r) => r.re.test(text)));
  }

  private sentence(sentence: string, out: Step[], errors: Unknown[], isStatic: boolean, inherited?: Link) {
    let sen = trimEnd(sentence.replace(/^•\s*/, ''));
    let link: Link | undefined;
    let m: RegExpMatchArray | null;
    if ((m = sen.match(/^Then,\s*(.*)$/is))) { link = 'then'; sen = m[1]; }
    if ((m = sen.match(/^If you do(?: so)?,\s*(.*)$/is))) { link = 'ifYouDo'; sen = m[1]; }
    else if ((m = sen.match(/^If you (?:don't|do not)(?: do so)?,\s*(.*)$/is))) { link = 'ifNotYouDo'; sen = m[1]; }
    link ??= inherited;
    // une phrase qui complète l'étape précédente (« Then, place the rest at the bottom of your deck »)
    if (this.continuation(sen, out)) return;
    // la continuation en tête de phrase, puis le reste (« place the rest ... and play up to 1 ... ») : le « Then, » de la
    // phrase porte sur la continuation, le reste suit avec « and » (C2.3 : l'aller-retour redit « Then, » une seule fois ;
    // même jeu, « then » et « and » s'enchaînent de la même façon). « If you do, » garde son lien.
    for (const [a, b] of cuts(sen, / and /i)) {
      if (this.continuation(a, out)) { this.sentence(cap(b.trim()), out, errors, isStatic, link === 'then' || !link ? 'and' : link); return; }
    }
    // la continuation en fin de phrase (« ... and add it to your hand, then place the rest ... »)
    for (const [a, b] of cuts(sen, /,? (?:and )?then,? /i)) {
      if (!this.isContinuation(b.trim())) continue;
      this.sentence(link === 'then' ? `Then, ${a}` : a, out, errors, isStatic, link === 'then' ? undefined : link);
      if (!this.continuation(b.trim(), out)) errors.push(new Unknown(b, 'suite sans étape à compléter'));
      return;
    }
    // « If C, A » : la condition la plus courte qui se lit ; aucune : la première virgule, condition rapportée
    let cond: Cond | undefined;
    if (/^if /i.test(sen)) {
      const body = sen.slice(3);
      const options = cuts(body, /, /);
      if (!options.length) fail(sentence, 'structure : « If » sans virgule');
      let chosen: [string, string] | undefined;
      let condErr: Unknown | undefined;
      for (const [c, rest] of options) {
        const r = attempt(() => this.cond(c));
        if (r instanceof Unknown) { condErr ??= r; continue; }
        cond = r;
        chosen = [c, rest];
        break;
      }
      if (!chosen) {
        // le morceau d'action est lu quand même, pour rapporter tout ce qui manque
        errors.push(condErr!);
        const rest = options[0][1];
        this.checked(cap(rest.trim()), sentence, isStatic);
        return;
      }
      sen = cap(chosen[1].trim());
    }
    let steps = this.checked(sen, sentence, isStatic);
    if (cond && steps.length > 1) steps = [{ cond, group: steps }];
    else if (cond) steps[0] = { ...steps[0], cond };
    if (link) steps[0] = { ...steps[0], link };
    out.push(...steps);
  }

  // Lit une phrase d'action et applique le garde-fou des durées
  private checked(sen: string, sentence: string, isStatic: boolean): Step[] {
    const steps = this.action(sen);
    const bad = durationProblem(steps, isStatic);
    if (bad) fail(sentence, bad);
    return steps;
  }

  // ----- Une capacité (une ligne, ou la ligne du [Déclenchement]) -----
  // Rend les capacités lues (plusieurs si « [When Attacking]/[On Block] ») et les morceaux non compris.
  ability(line: string, isTrigger: boolean): { abilities: Ability[]; errors: Unknown[] } {
    const errors: Unknown[] = [];
    let s = line.trim();
    const base: Omit<Ability, 'timing' | 'steps'> = {};
    const timings: Timing[] = [];
    const cost: CostPart[] = [];
    let m: RegExpMatchArray | null;
    let costMark = false;
    for (;;) {
      if ((m = s.match(/^\[([^\]]+)\]\s*/))) {
        const tag = m[1];
        let dm: RegExpMatchArray | null;
        if (TIMINGS[tag]) timings.push(TIMINGS[tag]);
        else if ((dm = tag.match(/^DON!! x(\d+)$/))) base.don = +dm[1];
        else if (tag === 'Your Turn') base.yourTurn = true;
        else if (tag === "Opponent's Turn") base.oppTurn = true;
        else if (tag === 'Once Per Turn') base.oncePerTurn = true;
        else if (new RegExp(`^${KEYWORD_RE}$`).test(tag)) break;    // « [Rush] » au milieu : la phrase le lira
        else { errors.push(new Unknown(line, 'structure : étiquette inconnue', `[${tag}]`)); }
        s = s.slice(m[0].length);
        continue;
      }
      if ((m = s.match(/^\/\s*(?=\[)/))) { s = s.slice(m[0].length); continue; }   // « [On Play]/[When Attacking] »
      if ((m = s.match(new RegExp(`^([${CIRCLED}])\\s*([:,]?)\\s*`)))) {
        cost.push({ kind: 'restDon', n: CIRCLED.indexOf(m[1]) + 1 });
        costMark = m[2] !== ':';
        s = s.slice(m[0].length);
        continue;
      }
      if ((m = s.match(/^DON!! -(\d+)\s*([:,]?)\s*/))) {
        cost.push({ kind: 'donMinus', n: +m[1] });
        costMark = m[2] !== ':';
        s = s.slice(m[0].length);
        continue;
      }
      break;
    }
    if (timings.length === 0) timings.push(isTrigger ? 'trigger' : 'static');
    const noTiming = timings.length === 1 && timings[0] === 'static';

    // « When ..., ... » : réaction à un évènement (capacité sans moment)
    let event: RecipeEvent | undefined;
    const isWhen = noTiming && /^When /i.test(s);
    if (isWhen) {
      const options = cuts(s.slice(5), /, /);
      let found = false;
      let first: Unknown | undefined;
      for (const [e, rest] of options) {
        const r = attempt(() => this.event(e));
        if (r instanceof Unknown) { first ??= r; continue; }
        event = r;
        s = cap(rest.trim());
        found = true;
        break;
      }
      if (!found) {
        errors.push(first ?? new Unknown(line, 'structure : « When » sans virgule'));
        if (options.length) s = cap(options[0][1].trim());
      }
    }

    // « If C, you may X: Y » : condition sur toute la capacité, puis le coût
    let condition: Cond | undefined;
    const ps = protect(s);
    if ((m = ps.match(/^If (.+?), you may ([^:.]+?):\s*/is))) {
      const c = unprotect(m[1]);
      const r = attempt(() => this.cond(c));
      if (r instanceof Unknown) errors.push(r); else condition = r;
      s = `You may ${s.slice('If '.length + m[1].length + ', you may '.length)}`;
    }
    // « You may X: Y » (aussi « You can X: ») : le coût (pas « You may choose one: »). « X and you may Z: Y » (vieilles
    // cartes) : un coût en deux morceaux. « X: Y » sans « You may » (OP09-101) : X est lu comme un coût aussi.
    const ps2 = protect(s);
    if ((m = ps2.match(/^(?:You (?:may|can) )?([^:•.]+?):\s+(?!•)/i)) && !/choose(?:s)? one$/i.test(m[1])) {
      const text = unprotect(m[1]).replace(/ and you may /i, ' and ');
      const r = attempt(() => this.cost(text));
      if (r instanceof Unknown) errors.push(r); else cost.push(...r);
      s = s.slice(m[0].length);
      costMark = false;
    }
    if (costMark) errors.push(new Unknown(line, 'structure : coût sans deux-points'));
    s = s.trim();
    if (!s) {
      errors.push(new Unknown(line, 'structure : capacité sans effet'));
      return { abilities: [], errors };
    }
    // effet permanent : ni moment ni évènement (garde-fou des durées)
    const isStatic = noTiming && !isWhen;
    const steps = this.steps(s, errors, isStatic);
    const abilities = timings.map((timing) => {
      const a: Ability = { timing, ...base, steps: structuredClone(steps) };
      if (event) { a.timing = 'when'; a.event = event; }
      if (condition) a.condition = condition;
      if (cost.length) a.cost = structuredClone(cost);
      return a;
    });
    return { abilities, errors };
  }
}

// Garde-fou des durées : un effet ponctuel (moment, évènement, [Déclenchement]) sans durée, ou un effet permanent
// avec une durée, est une lecture fausse (étude C0 § 3, point 8)
function durationProblem(steps: Step[], isStatic: boolean): string | undefined {
  for (const st of steps) {
    const sub = 'chooseOne' in st ? st.chooseOne.flat() : 'may' in st ? st.may : 'group' in st ? st.group : undefined;
    if (sub) {
      const r = durationProblem(sub, isStatic);
      if (r) return r;
      continue;
    }
    if (!('action' in st)) continue;
    const a = st.action;
    if (a.kind === 'power' || a.kind === 'cost' || a.kind === 'keyword' || a.kind === 'powerSet') {
      if (!isStatic && a.until === 'permanent') return 'durée absente dans un effet ponctuel';
      if (isStatic && a.until !== 'permanent') return 'durée dans un effet permanent';
    }
  }
  return undefined;
}

// ---------- Une carte entière ----------

export interface CardAnalysis {
  recipe: Recipe;               // tout ce qui est compris (les capacités entièrement lues)
  errors: Unknown[];            // les morceaux non compris, dans l'ordre du texte
  abilities: number;            // capacités du texte (une capacité à deux moments compte pour deux)
  understood: number;           // capacités entièrement lues
}

const KEYWORD_LINE = new RegExp(`^\\[${KEYWORD_RE}\\]\\s*`);

// Lignes du texte normalisé : une capacité par ligne ; une puce « • » reste avec la ligne de son « Choose one: »
export function lines(normalized: string): string[] {
  return normalized.split('\n').reduce<string[]>((acc, l) => {
    if (/^•/.test(l) && acc.length) acc[acc.length - 1] += ` ${l}`;
    else acc.push(l);
    return acc;
  }, []).map((l) => l.trim()).filter(Boolean);
}

export function analyzeCard(num: string, effect: string, trigger: string, families: readonly Family[]): CardAnalysis {
  const parser = new Parser(families);
  const recipe: Recipe = { num, abilities: [] };
  const errors: Unknown[] = [];
  let abilities = 0;
  let understood = 0;
  const take = (line: string, isTrigger: boolean) => {
    const r = parser.ability(line, isTrigger);
    const n = Math.max(1, r.abilities.length);
    abilities += n;
    errors.push(...r.errors);
    if (r.errors.length) return;
    understood += n;
    if (isTrigger) recipe.trigger = r.abilities[0];
    else recipe.abilities.push(...r.abilities);
  };
  for (const raw of lines(effect)) {
    let line = raw;
    let m: RegExpMatchArray | null;
    while ((m = line.match(KEYWORD_LINE))) {
      (recipe.keywords ??= []).push(m[1] as Keyword);
      line = line.slice(m[0].length);
    }
    if (!line) continue;
    if ((m = protect(line).match(/^Also treat this card's name as ((?:\[[^\]]+\](?:,? and |,? or |, )?)+)(?: according to the rules)?\.?$/i))) {
      (recipe.alsoNamed ??= []).push(...[...unprotect(m[1]).matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]));
      continue;
    }
    // [Déclenchement] laissé dans le texte de l'effet (vieilles cartes)
    if ((m = line.match(/^\[Trigger\]\s*(.*)$/s))) {
      if (trigger) errors.push(new Unknown(line, 'structure : deux [Trigger]'));
      take(m[1], true);
      continue;
    }
    take(line, false);
  }
  if (trigger) {
    const t = lines(trigger).join(' ');
    if (t) take(t, true);
  }
  return { recipe, errors, abilities, understood };
}

// Les morceaux non compris qui viennent de la structure elle-même (et non d'une famille qui manque)
export const isStructural = (u: Unknown) => u.why.startsWith('structure');
