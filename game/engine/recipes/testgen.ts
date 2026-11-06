// Tests générés d'après une recette (tâche C1.3, banc d'essai, volet 1).
//
// Pour chaque capacité d'une recette, on fabrique des situations (cibles qui conviennent tout juste, leurres qui ne
// conviennent pas de peu, condition vraie puis fausse à la valeur limite, cible absente, « jusqu'à » avec 0 cible, coût
// refusé...), on joue la carte deux fois depuis la même situation : avec son comportement, puis sans l'effet de ce
// moment (référence). L'écart entre les deux parties doit être celui que prédit un petit modèle de la recette, écrit
// ici sans rien reprendre du compilateur : nombre de cartes de chaque zone, DON!!, cartes épuisées, modificateurs
// (puissance, coût, mots-clés et leur durée), leurres intacts, partie cohérente.
//
// Le modèle ne connaît qu'une partie des actions, conditions et coûts : ce qu'il ne sait pas prédire rend le cas « non
// vérifié » (la carte est quand même jouée : ni erreur ni incohérence permise), et le rapport le dit.
import { CARDS } from '../cards/index.ts';
import { noBaseEffect, untilMyNextEnd } from '../cards/bricks.ts';
import { untilOpponentsNextEnd } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  buildSituation, coherenceErrors, drive, DRIVEN_TIMINGS, emptySide, inertPool, locate, maxChooser, withBehavior, withoutTiming,
  type SideSpec, type SituationSpec,
} from './bench.ts';
import { compileRecipe } from './compile.ts';
import type { Ability, Action, Cond, CostPart, Duration, Filter, ManualCode, Recipe, Step, Target, Timing } from './types.ts';

// ---------- Filtres (lecture indépendante du compilateur) ----------

interface CardState { rested?: boolean; don?: number }

const NUMERIC: [keyof Filter, 'cost' | 'power', 'max' | 'min' | 'eq'][] = [
  ['costMax', 'cost', 'max'], ['costMin', 'cost', 'min'], ['costEq', 'cost', 'eq'], ['baseCostMax', 'cost', 'max'],
  ['baseCostMin', 'cost', 'min'], ['powerMax', 'power', 'max'], ['powerMin', 'power', 'min'], ['basePowerMax', 'power', 'max'],
  ['basePowerMin', 'power', 'min'],
];

// La carte convient-elle au filtre ? Hors du terrain, l'état (épuisé, DON!!) est ignoré ; sur le terrain, le banc ne
// pose aucune modification de coût ni de puissance : valeurs imprimées et valeurs actuelles sont les mêmes.
export function fitsFilter(num: string, f: Filter, st?: CardState): boolean {
  const d = CARDS[num];
  if (!d) return false;
  if (f.anyOf?.length) {
    const { anyOf, ...rest } = f;
    return fitsFilter(num, rest, st) && anyOf.some((alt) => fitsFilter(num, alt, st));
  }
  if (f.category && !f.category.includes(d.category)) return false;
  for (const [key, stat, kind] of NUMERIC) {
    const bound = f[key] as number | undefined;
    if (bound === undefined) continue;
    const v = (stat === 'cost' ? d.cost : d.power) ?? 0;
    if (kind === 'max' ? v > bound : kind === 'min' ? v < bound : v !== bound) return false;
  }
  if (f.types?.length) {
    const has = (t: string) => d.types.includes(t);
    if (f.typesMode === 'all' ? !f.types.every(has) : !f.types.some(has)) return false;
  }
  if (f.typeIncludes !== undefined && !d.types.some((t) => t.includes(f.typeIncludes!))) return false;
  if (f.name?.length && !f.name.some((n) => d.names.includes(n))) return false;
  if (f.notName !== undefined && d.names.includes(f.notName)) return false;
  if (f.color?.length && !f.color.some((c) => d.colors.includes(c))) return false;
  if (f.attribute !== undefined && !d.attributes.includes(f.attribute)) return false;
  if (f.trigger !== undefined && Boolean(d.triggerEn) !== f.trigger) return false;
  if (f.keyword !== undefined && !d.keywords.includes(f.keyword)) return false;
  if (f.noKeyword !== undefined && d.keywords.includes(f.noKeyword)) return false;
  if (f.vanilla !== undefined && noBaseEffect(d) !== f.vanilla) return false;
  if (st) {
    if (f.rested !== undefined && Boolean(st.rested) !== f.rested) return false;
    if (f.donMin !== undefined && (st.don ?? 0) < f.donMin) return false;
  } else if (f.donMin !== undefined && f.donMin > 0) return false;
  return true;
}

// Écart aux bornes du filtre : 0 pour une carte « tout juste » (coût 4 pour « coût 4 ou moins »)
function boundaryGap(num: string, f: Filter): number {
  const d = CARDS[num];
  let gap = 0;
  for (const [key, stat] of NUMERIC) {
    const bound = f[key] as number | undefined;
    if (bound !== undefined) gap += Math.abs(((stat === 'cost' ? d.cost : d.power) ?? 0) - bound) / (stat === 'power' ? 1000 : 1);
  }
  return gap;
}

const filterIsEmpty = (f: Filter) => Object.values(f).every((v) => v === undefined);

// Cartes inertes (sans comportement ni mot-clé) d'une catégorie qui conviennent au filtre, les plus proches des bornes d'abord
function matching(f: Filter, exclude: string[], category: string = 'CHARACTER'): string[] {
  const pool = inertPool();
  const nums = category === 'LEADER' ? pool.leaders : category === 'CHARACTER' ? pool.chars : Object.keys(CARDS).filter((n) => CARDS[n]?.category === category && !exclude.includes(n));
  return nums.filter((n) => !exclude.includes(n) && fitsFilter(n, { ...f, rested: undefined, donMin: undefined }))
    .sort((a, b) => boundaryGap(a, f) - boundaryGap(b, f));
}

// Leurres : pour chaque contrainte du filtre, une carte qui respecte toutes les autres mais pas celle-là, au plus près
// de la borne (coût 5 pour « coût 4 ou moins »). Contraintes d'état (épuisé, DON!!) : la même carte dans l'autre état.
interface Placed { num: string; rested?: boolean; don?: number }
function decoys(f: Filter, exclude: string[], max: number, base: Placed): Placed[] {
  const out: Placed[] = [];
  for (const key of Object.keys(f) as (keyof Filter)[]) {
    if (out.length >= max || f[key] === undefined || key === 'typesMode') continue;
    if (key === 'rested') { out.push({ ...base, rested: !f.rested }); continue; }
    if (key === 'donMin') { if ((f.donMin ?? 0) > 0) out.push({ ...base, don: (f.donMin ?? 1) - 1 }); continue; }
    const relaxed: Filter = { ...f, [key]: undefined, rested: undefined, donMin: undefined };
    if (key === 'types') relaxed.typesMode = undefined;
    const pool = inertPool().chars.filter((n) => !exclude.includes(n) && fitsFilter(n, relaxed) && !fitsFilter(n, { ...f, rested: undefined, donMin: undefined }))
      .sort((a, b) => boundaryGap(a, f) - boundaryGap(b, f));
    if (pool.length && !out.some((o) => o.num === pool[0])) out.push({ ...base, num: pool[0] });
  }
  return out;
}

// ---------- Parcours de la recette ----------

interface CondRef { id: number; cond: Cond }

// Conditions d'une capacité (capacité entière, étapes, groupes), numérotées dans l'ordre de lecture
function condsOf(ab: Ability): CondRef[] {
  const out: CondRef[] = [];
  if (ab.condition) out.push({ id: out.length, cond: ab.condition });
  const walk = (steps: Step[]) => {
    for (const st of steps) {
      if (st.cond) out.push({ id: out.length, cond: st.cond });
      if ('group' in st) walk(st.group);
      if ('may' in st) walk(st.may);
      if ('chooseOne' in st) st.chooseOne.forEach(walk);
    }
  };
  walk(ab.steps);
  return out;
}

function actionsOf(steps: Step[], branch?: number): Action[] {
  return steps.flatMap((st) => ('action' in st ? [st.action] : 'group' in st ? actionsOf(st.group, branch) : 'may' in st ? actionsOf(st.may, branch)
    : branch === undefined ? st.chooseOne.flatMap((b) => actionsOf(b)) : actionsOf(st.chooseOne[Math.min(branch, st.chooseOne.length - 1)] ?? [])));
}

const fieldTarget = (a: Action): Target | null => ('target' in a && a.target.zone === 'field' ? a.target : null);

// Filtres de la recette qui portent sur des cartes hors du terrain (main, deck, Défausse) : la carte d'appoint ne doit
// convenir à aucun
function zoneFilters(r: Recipe): Filter[] {
  const out: Filter[] = [];
  const abilities = [...r.abilities, ...(r.trigger ? [r.trigger] : [])];
  for (const ab of abilities) {
    for (const a of actionsOf(ab.steps)) if ('filter' in a && a.filter) out.push(a.filter);
    for (const c of ab.cost ?? []) if ('filter' in c && c.filter) out.push(c.filter);
  }
  return out;
}

// ---------- Situation d'un cas ----------

export interface Variant {
  branch?: number;      // effet choisi dans « choisissez un »
  falseCond?: number;   // condition rendue fausse (numéro de condsOf)
  absent?: boolean;     // seulement des leurres : aucune cible
  none?: boolean;       // « jusqu'à » : refuser toutes les cibles
  refuse?: boolean;     // coût ou effet facultatif refusé
}

interface Draft {
  leader: [string, string];
  hand: [string[], string[]];
  handFill: [number, number];
  chars: [Placed[], Placed[]];
  trash: [string[], string[]];
  trashFill: [number, number];
  lifeFill: [number, number];
  deckTop: [string[], string[]];
  donActive: [number, number];
  donRested: [number, number];
  selfDon: number;
  selfRested: boolean;
  decoys: { side: PlayerId; num: string; zone: 'chars' | 'hand' | 'trash' | 'deck' }[];
}

interface CaseCtx {
  num: string;
  timing: Timing;
  ability: Ability;
  variant: Variant;
  filler: string;
  attacker: string;
  exclude: string[];
}

const selfInHand = (t: Timing) => t === 'onPlay' || t === 'main' || t === 'counter';
const selfOnFieldAtResolution = (t: Timing, category: string) =>
  (t === 'onPlay' && category !== 'EVENT') || t === 'activateMain' || t === 'whenAttacking' || t === 'endOfTurn';
const sideOf = (side: Target['side']): PlayerId => (side === 'own' ? 0 : 1);

function playCost(num: string, timing: Timing): number {
  return selfInHand(timing) ? CARDS[num].cost ?? 0 : 0;
}

// Place les cibles d'une action sur le terrain : count + 1 cartes qui conviennent (le nombre maximal se voit), ou 2 pour
// « tous », plus des leurres ; sans aucune cible si le cas l'exige (leurres seulement)
function placeTargets(d: Draft, c: CaseCtx, a: Action, t: Target) {
  if (t.self || t.stage || (t.leader && !t.characters)) return;
  const side = sideOf(t.side);
  const want: boolean | undefined = a.kind === 'rest' ? false : a.kind === 'setActive' || a.kind === 'cantRefresh' ? true : undefined;
  const rested = t.filter.rested ?? want ?? false;
  // 5 Personnages au plus : la carte essayée (de mon côté) et l'attaquant adverse ([Contre], [Déclenchement]) comptent
  const attacking = c.timing === 'counter' || c.timing === 'trigger';
  const room = 5 - d.chars[side].length - (side === 0 && selfOnFieldAtResolution(c.timing, CARDS[c.num].category) ? 1 : 0) - (side === 1 && attacking ? 1 : 0);
  const n = t.count === 'all' ? 2 : t.count + 1;
  const fits = matching({ ...t.filter, rested: undefined, donMin: undefined }, c.exclude);
  const base: Placed = { num: fits[0] ?? c.filler, rested, don: t.filter.donMin ?? 0 };
  const bad = filterIsEmpty(t.filter) ? [] : decoys(t.filter, c.exclude, 2, base);
  const targets = c.variant.absent || !fits.length ? [] : Array.from({ length: n }, () => base);
  const placed = [...bad, ...targets].slice(0, Math.max(0, room));
  for (const p of placed) {
    d.chars[side].push(p);
    if (bad.includes(p)) d.decoys.push({ side, num: p.num, zone: 'chars' });
  }
}

// Cartes hors du terrain que l'action demande (main, Défausse, dessus du deck)
function placeZone(d: Draft, c: CaseCtx, zone: 'hand' | 'trash' | 'deck', side: PlayerId, f: Filter, n: number, look?: number) {
  const fits = matching(f, c.exclude, f.category?.length === 1 ? f.category[0] : 'CHARACTER');
  const bad = filterIsEmpty(f) ? [] : decoys(f, c.exclude, 2, { num: fits[0] ?? c.filler }).map((p) => p.num);
  const good = c.variant.absent || !fits.length ? [] : Array.from({ length: n }, () => fits[0]);
  const list = zone === 'deck' ? [...good, ...bad] : [...bad, ...good];
  if (zone === 'deck') {
    // les cartes regardées : celles qui conviennent, puis des leurres et la carte d'appoint
    while (list.length < (look ?? n)) list.push(bad[list.length % Math.max(1, bad.length)] ?? c.filler);
    d.deckTop[side].push(...list.slice(0, look ?? n));
  } else {
    (zone === 'hand' ? d.hand : d.trash)[side].push(...list);
  }
  for (const b of bad) d.decoys.push({ side, num: b, zone: zone === 'deck' ? 'deck' : zone });
}

function requireAction(d: Draft, c: CaseCtx, a: Action) {
  const t = fieldTarget(a);
  if (t) placeTargets(d, c, a, t);
  switch (a.kind) {
    case 'discard': if (a.filter && !filterIsEmpty(a.filter)) placeZone(d, c, 'hand', 0, a.filter, a.n); else d.handFill[0] = Math.max(d.handFill[0], a.n + 1); break;
    case 'oppDiscard': case 'oppHandToBottom': d.handFill[1] = Math.max(d.handFill[1], a.n + 1); break;
    case 'handToBottom': d.handFill[0] = Math.max(d.handFill[0], a.n + 1); break;
    case 'handToLife': placeZone(d, c, 'hand', 0, a.filter, a.n); break;
    case 'search': placeZone(d, c, 'deck', 0, a.filter, a.take, a.look); break;
    case 'play':
      if (a.from === 'hand' || a.from === 'trash') placeZone(d, c, a.from, 0, { category: ['CHARACTER'], ...a.filter }, a.count + 1);
      break;
    case 'trashToHand': placeZone(d, c, 'trash', 0, a.filter, a.count + 1); break;
    case 'trashToBottom': placeZone(d, c, 'trash', sideOf(a.side), a.filter, a.count + 1); break;
    case 'readyDon': d.donRested[0] = Math.max(d.donRested[0], a.n); break;
    case 'giveDon': {
      // C2.4 : DON!! adverses (from 'opp') ou du propriétaire (« its owner's ») : les deux camps en ont
      const sides: PlayerId[] = a.from === 'opp' ? [1] : a.from === 'owner' ? [0, 1] : [0];
      for (const q of sides) if (a.rested) d.donRested[q] = Math.max(d.donRested[q], a.n); else d.donActive[q] += a.n;
      break;
    }
    case 'restDon': if (a.side === 'opp') d.donActive[1] = Math.max(d.donActive[1], a.n + 1); else d.donActive[0] += a.n; break;
    case 'returnDon': if (a.side === 'opp') d.donActive[1] = Math.max(d.donActive[1], a.n + 1); else d.donRested[0] = Math.max(d.donRested[0], a.n); break;
    default:
  }
}

function requireCost(d: Draft, c: CaseCtx, cost: CostPart) {
  switch (cost.kind) {
    case 'discard': if (cost.filter && !filterIsEmpty(cost.filter)) placeZone(d, c, 'hand', 0, cost.filter, cost.n); else d.handFill[0] = Math.max(d.handFill[0], cost.n + 1); break;
    case 'restDon': d.donActive[0] += cost.n; break;
    case 'donMinus': d.donRested[0] = Math.max(d.donRested[0], cost.n); break;
    default:
  }
}

// Réglages qui rendent une condition vraie (want) ou fausse ; faux si le banc ne sait pas
function knob(d: Draft, c: CaseCtx, cond: Cond, want: boolean): boolean {
  const own = (side: string) => (side === 'opp' ? 1 : 0) as PlayerId;
  // valeur qui rend « cmp n » vraie ou fausse (valeur limite)
  const value = (cmp: 'le' | 'ge' | 'eq', n: number) => (want ? n : cmp === 'ge' ? n - 1 : n + 1);
  switch (cond.kind) {
    case 'life': {
      const v = value(cond.cmp, cond.n);
      if (v < 0) return false;
      // total des deux Vies (C2.5) : partagé entre les deux joueurs
      if (cond.side === 'total') d.lifeFill = [Math.ceil(v / 2), Math.floor(v / 2)];
      else d.lifeFill[own(cond.side)] = v;
      return true;
    }
    case 'lifeVsOpp': {
      const pairs: Record<string, [[number, number], [number, number]]> = {
        lt: [[2, 3], [3, 3]], le: [[3, 3], [3, 2]], gt: [[3, 2], [3, 3]], ge: [[3, 3], [2, 3]],
      };
      d.lifeFill = [...pairs[cond.cmp][want ? 0 : 1]];
      return true;
    }
    case 'hand': {
      const p = own(cond.side);
      const v = value(cond.cmp, cond.n) - d.hand[p].length;
      if (v < 0) return false;
      d.handFill[p] = v;
      return true;
    }
    case 'donField': {
      const p = own(cond.side);
      const attached = p === 0 ? d.selfDon + d.chars[0].reduce((s, x) => s + (x.don ?? 0), 0) : d.chars[1].reduce((s, x) => s + (x.don ?? 0), 0);
      const rested = value(cond.cmp, cond.n) - d.donActive[p] - attached;
      if (rested < 0) return false;
      d.donRested[p] = rested;
      return true;
    }
    // C2.4 : DON!! redressées ou épuisées de la zone de Coût (les DON!! données ne se règlent pas ici)
    case 'donCards': {
      if (cond.what === 'given') return false;
      const v = value(cond.cmp, cond.n);
      if (v < 0) return false;
      (cond.what === 'active' ? d.donActive : d.donRested)[own(cond.side)] = v;
      return true;
    }
    case 'trash': {
      const event = c.timing === 'main' || c.timing === 'counter' ? 1 : 0;
      const v = value(cond.cmp, cond.n);
      if (cond.filter && !filterIsEmpty(cond.filter)) {
        const fits = matching(cond.filter, c.exclude);
        const already = d.trash[0].filter((n) => fitsFilter(n, cond.filter!)).length + (event && fitsFilter(c.num, cond.filter) ? 1 : 0);
        if (!fits.length || v < already) return false;
        d.trash[0].push(...Array.from({ length: v - already }, () => fits[0]));
        return true;
      }
      const fill = v - d.trash[0].length - event;
      if (fill < 0) return false;
      d.trashFill[0] = fill;
      return true;
    }
    case 'chars': {
      if (cond.side === 'any') return false;
      const p = own(cond.side);
      const st = (x: Placed) => ({ rested: x.rested, don: x.don });
      const selfCounts = p === 0 && selfOnFieldAtResolution(c.timing, CARDS[c.num].category) && fitsFilter(c.num, cond.filter, { rested: d.selfRested || c.timing === 'whenAttacking', don: d.selfDon });
      const have = d.chars[p].filter((x) => fitsFilter(x.num, cond.filter, st(x))).length + (selfCounts ? 1 : 0);
      const v = value(cond.cmp, cond.n);
      if (v < have) return false;
      const fits = matching(cond.filter, c.exclude);
      if (!fits.length && v > have) return false;
      for (let i = have; i < v; i++) d.chars[p].push({ num: fits[0], rested: cond.filter.rested ?? false, don: cond.filter.donMin ?? 0 });
      return true;
    }
    case 'selfState': {
      if (!selfOnFieldAtResolution(c.timing, CARDS[c.num].category) || c.timing === 'onPlay') return false;
      if (cond.rested !== undefined) d.selfRested = want ? cond.rested : !cond.rested;
      if (cond.donMin !== undefined) d.selfDon = want ? cond.donMin : Math.max(0, cond.donMin - 1);
      return !(cond.rested !== undefined && c.timing === 'whenAttacking');
    }
    case 'leaderIs': case 'leaderType': case 'leaderTypeIncludes': case 'leaderColor': case 'leaderAttribute': {
      if (CARDS[c.num].category === 'LEADER' && c.timing !== 'trigger') return false;
      const leader = inertPool().leaders.find((n) => evalLeader(cond, n) === want);
      if (!leader) return false;
      d.leader[0] = leader;
      return true;
    }
    case 'turn': return want === (c.timing !== 'counter' && c.timing !== 'trigger') ? true : false;
    case 'and': return want ? cond.all.every((x) => knob(d, c, x, true)) : knob(d, c, cond.all[0], false) && cond.all.slice(1).every((x) => knob(d, c, x, true));
    case 'or': return want ? knob(d, c, cond.any[0], true) : cond.any.every((x) => knob(d, c, x, false));
    case 'not': return knob(d, c, cond.cond, !want);
    // famille « cartes » (C2.3) : la carte du dessus du deck, que l'effet révèle (revealTop)
    case 'revealed': {
      const cat = cond.filter.category?.length === 1 ? cond.filter.category[0] : 'CHARACTER';
      const fits = matching(cond.filter, c.exclude, cat);
      const top = want ? fits[0] : decoys(cond.filter, c.exclude, 1, { num: fits[0] ?? c.filler })[0]?.num;
      if (!top || fitsFilter(top, cond.filter) !== want) return false;
      d.deckTop[0].unshift(top);
      return true;
    }
    default: return false;
  }
}

function evalLeader(cond: Cond, leader: string): boolean | null {
  const L = CARDS[leader];
  switch (cond.kind) {
    case 'leaderIs': return cond.names.some((n) => L.names.includes(n));
    case 'leaderType': return cond.mode === 'all' ? cond.types.every((t) => L.types.includes(t)) : cond.types.some((t) => L.types.includes(t));
    case 'leaderTypeIncludes': return L.types.some((t) => t.includes(cond.part));
    case 'leaderColor': return cond.colors.some((x) => L.colors.includes(x)) && (!cond.multicolor || L.colors.length > 1);
    case 'leaderAttribute': return L.attributes.includes(cond.attribute);
    default: return null;
  }
}

function buildDraft(c: CaseCtx, conds: CondRef[]): { draft: Draft; ok: boolean; why?: string } {
  const pool = inertPool();
  const leader = pool.leaders[0];
  const d: Draft = {
    leader: [leader, leader], hand: [[], []], handFill: [2, 4], chars: [[], []], trash: [[], []], trashFill: [1, 1], lifeFill: [4, 4],
    deckTop: [[], []], donActive: [playCost(c.num, c.timing), 4], donRested: [0, 0], selfDon: 0, selfRested: false, decoys: [],
  };
  const ab = c.ability;
  if (ab.don) d.selfDon = ab.don;
  for (const cost of ab.cost ?? []) requireCost(d, c, cost);
  for (const a of actionsOf(ab.steps, c.variant.branch ?? 0)) requireAction(d, c, a);
  // conditions : toutes vraies, sauf celle que le cas rend fausse
  for (const ref of conds) {
    const want = ref.id !== c.variant.falseCond;
    if (!knob(d, c, ref.cond, want)) {
      return { draft: d, ok: false, why: `condition ${ref.cond.kind} ${want ? 'vraie' : 'fausse'} : situation non construite` };
    }
  }
  // DON!! : jamais plus de 10 en jeu
  const attached = d.selfDon + d.chars[0].reduce((s, x) => s + (x.don ?? 0), 0);
  if (d.donActive[0] + d.donRested[0] + attached > 10) return { draft: d, ok: false, why: 'trop de DON!! demandées' };
  return { draft: d, ok: true };
}

function specOf(c: CaseCtx, d: Draft, seed: number): SituationSpec {
  const me: SideSpec = emptySide(d.leader[0]);
  const op: SideSpec = emptySide(d.leader[1]);
  const fill = (n: number) => Array.from({ length: Math.max(0, n) }, () => c.filler);
  const category = CARDS[c.num].category;
  me.hand = [...(selfInHand(c.timing) ? [c.num] : []), ...d.hand[0], ...fill(d.handFill[0])];
  op.hand = [...d.hand[1], ...fill(d.handFill[1])];
  me.trash = [...d.trash[0], ...fill(d.trashFill[0]), ...(c.timing === 'onKO' ? [c.num] : [])];
  op.trash = [...d.trash[1], ...fill(d.trashFill[1])];
  me.life = [...(c.timing === 'trigger' ? [c.num] : []), ...fill(d.lifeFill[0])];
  op.life = fill(d.lifeFill[1]);
  me.deckTop = d.deckTop[0];
  op.deckTop = d.deckTop[1];
  me.chars = [...d.chars[0]];
  op.chars = [...d.chars[1]];
  const onField = c.timing === 'activateMain' || c.timing === 'whenAttacking' || c.timing === 'endOfTurn';
  if (onField) {
    if (category === 'LEADER') { me.leader = c.num; me.leaderDon = d.selfDon; me.leaderRested = d.selfRested; }
    else if (category === 'STAGE') me.stage = c.num;
    else me.chars.unshift({ num: c.num, rested: d.selfRested, don: d.selfDon });
  }
  if (c.timing === 'counter' || c.timing === 'trigger') op.chars.push({ num: c.attacker });
  me.donActive = d.donActive[0];
  me.donRested = d.donRested[0];
  op.donActive = d.donActive[1];
  op.donRested = d.donRested[1];
  return { sides: [me, op], active: c.timing === 'counter' || c.timing === 'trigger' ? 1 : 0, filler: [c.filler, c.filler], seed };
}

// ---------- Modèle : ce que la recette doit faire ----------

interface MCard { uid: number; num: string; rested: boolean; don: number }
interface MSide {
  leader: MCard; chars: MCard[]; hand: MCard[]; deck: MCard[]; trash: MCard[]; life: MCard[];
  donActive: number; donRested: number; donDeck: number;
}
interface Model {
  sides: [MSide, MSide];
  active: PlayerId;
  turn: number;
  self: number;
  mods: string[];
  free: Set<string>;        // mesures que le modèle ne sait pas prédire exactement
  unchecked: string[];      // morceaux de la recette que le modèle ne connaît pas
  touched: Set<number>;     // cartes visées par l'effet (un leurre visé ailleurs n'est plus un leurre)
  noLifeToHand?: boolean;   // « vous ne pouvez pas ajouter de carte de Vie à votre main ... » (C2.5)
  truth: Map<number, boolean | null>;
  variant: Variant;
  revealed?: number;        // famille « cartes » (C2.3) : la carte révélée du dessus du deck (revealTop)
}

const mc = (c: { uid: number; num: string; rested?: boolean; don?: number }): MCard => ({ uid: c.uid, num: c.num, rested: Boolean(c.rested), don: c.don ?? 0 });

function modelOf(s: GameState, self: number, timing: Timing, variant: Variant): Model {
  const sides = s.players.map((P) => ({
    leader: mc(P.leader), chars: P.chars.map(mc), hand: P.hand.map(mc), deck: P.deck.map(mc), trash: P.trash.map(mc), life: P.life.map(mc),
    donActive: P.donActive, donRested: P.donRested, donDeck: P.donDeck,
  })) as [MSide, MSide];
  const me = sides[0];
  // la situation au moment où l'effet se résout
  const cost = selfInHand(timing) ? CARDS[numIn(sides, self)].cost ?? 0 : 0;
  me.donActive -= cost;
  me.donRested += cost;
  const fromHand = () => me.hand.splice(me.hand.findIndex((c) => c.uid === self), 1)[0];
  if (timing === 'onPlay') { const c = fromHand(); if (CARDS[c.num].category === 'CHARACTER') me.chars.push(c); }
  if (timing === 'main' || timing === 'counter') me.trash.push(fromHand());
  if (timing === 'trigger') me.life.shift();
  if (timing === 'whenAttacking') for (const c of [me.leader, ...me.chars]) if (c.uid === self) c.rested = true;
  if (timing === 'counter' || timing === 'trigger') { const atk = sides[1].chars.at(-1); if (atk) atk.rested = true; }
  return {
    sides, active: s.active, turn: s.turn, self, mods: [], free: new Set(), unchecked: [], touched: new Set(), truth: new Map(), variant,
  };
}

function numIn(sides: MSide[], uid: number): string {
  for (const S of sides) for (const c of [S.leader, ...S.chars, ...S.hand, ...S.trash, ...S.life, ...S.deck]) if (c.uid === uid) return c.num;
  return '?';
}

function evalCond(m: Model, cond: Cond): boolean | null {
  const S = (side: string) => m.sides[side === 'opp' ? 1 : 0];
  const cmp = (v: number, c: 'le' | 'ge' | 'eq', n: number) => (c === 'le' ? v <= n : c === 'ge' ? v >= n : v === n);
  const donField = (x: MSide) => x.donActive + x.donRested + [x.leader, ...x.chars].reduce((sum, c) => sum + c.don, 0);
  const selfCard = [m.sides[0].leader, ...m.sides[0].chars].find((c) => c.uid === m.self);
  switch (cond.kind) {
    case 'leaderIs': case 'leaderType': case 'leaderTypeIncludes': case 'leaderColor': case 'leaderAttribute':
      return evalLeader(cond, m.sides[0].leader.num);
    case 'life': return cmp(cond.side === 'total' ? m.sides[0].life.length + m.sides[1].life.length : S(cond.side).life.length, cond.cmp, cond.n);
    case 'lifeVsOpp': {
      const a = m.sides[0].life.length;
      const b = m.sides[1].life.length;
      return cond.cmp === 'lt' ? a < b : cond.cmp === 'le' ? a <= b : cond.cmp === 'gt' ? a > b : a >= b;
    }
    case 'hand': return cmp(S(cond.side).hand.length, cond.cmp, cond.n);
    case 'donField': return cmp(donField(S(cond.side)), cond.cmp, cond.n);
    case 'donVsOpp': {
      const a = donField(m.sides[0]);
      const b = donField(m.sides[1]);
      return cond.cmp === 'lt' ? a < b : cond.cmp === 'le' ? a <= b : cond.cmp === 'gt' ? a > b : a >= b;
    }
    case 'donCards': {
      const x = S(cond.side);
      return cmp(cond.what === 'active' ? x.donActive : cond.what === 'rested' ? x.donRested : [x.leader, ...x.chars].reduce((sum, c) => sum + c.don, 0), cond.cmp, cond.n);
    }
    case 'trash': return cmp(m.sides[0].trash.filter((c) => !cond.filter || fitsFilter(c.num, cond.filter)).length, cond.cmp, cond.n);
    case 'deck': return cmp(m.sides[0].deck.length, cond.cmp, cond.n);
    case 'chars': {
      const list = cond.side === 'any' ? [...m.sides[0].chars, ...m.sides[1].chars] : S(cond.side).chars;
      return cmp(list.filter((c) => fitsFilter(c.num, cond.filter, c)).length, cond.cmp, cond.n);
    }
    case 'selfState':
      if (!selfCard) return null;
      return (cond.rested === undefined || selfCard.rested === cond.rested) && (cond.donMin === undefined || selfCard.don >= cond.donMin);
    case 'turn': return (m.active === 0) === cond.mine;
    case 'and': { const v = cond.all.map((x) => evalCond(m, x)); return v.includes(null) ? null : v.every(Boolean); }
    case 'or': { const v = cond.any.map((x) => evalCond(m, x)); return v.includes(null) ? null : v.some(Boolean); }
    case 'not': { const v = evalCond(m, cond.cond); return v === null ? null : !v; }
    case 'revealed': {
      const top = m.sides[0].deck[0];
      return Boolean(top) && top.uid === m.revealed && fitsFilter(top.num, cond.filter);
    }
    default: return null;
  }
}

const relUntil = (m: Model, u: Duration): string | null => {
  const fake = { active: m.active, turn: m.turn } as GameState;
  switch (u) {
    case 'battle': return 'battle';
    case 'turn': return 'turn';
    case 'oppNextEnd': { const t = untilOpponentsNextEnd(fake, 0) - m.turn; return t === 0 ? 'turn' : `+${t}`; }
    case 'nextTurn': { const t = untilMyNextEnd(fake, 0) - m.turn; return t === 0 ? 'turn' : `+${t}`; }
    default: return null;
  }
};

const MOD_STAT: Partial<Record<Action['kind'], string>> = {
  power: 'power', cost: 'cost', keyword: 'keyword', cantRefresh: 'noRefresh',
  // famille « puissance » (C2.2) : une modification par carte visée, comme power
  powerSet: 'basePower', cantAttack: 'cantAttack', cantBlock: 'noBlocker', cantBeKO: 'cantBeKO', cantBeRested: 'cantRest',
  cantLeave: 'cantLeave', attackActive: 'attackActive', negate: 'negated',
};

// Cartes du terrain visées : les premières qui conviennent, dans l'ordre où le moteur les propose (côté adverse d'abord
// pour « any », Leader avant les Personnages) ; c'est aussi l'ordre de la réponse « première carte » du banc
function chooseField(m: Model, a: Action, t: Target): { card: MCard; side: PlayerId }[] {
  if (t.self) {
    for (const p of [0, 1] as PlayerId[]) {
      const c = [m.sides[p].leader, ...m.sides[p].chars].find((x) => x.uid === m.self);
      if (c) return [{ card: c, side: p }];
    }
    return [];
  }
  const sides: PlayerId[] = t.side === 'own' ? [0] : t.side === 'opp' ? [1] : [1, 0];
  const removal = ['ko', 'bounce', 'bottom', 'trashChar', 'toLife'].includes(a.kind);
  const leaderOk = Boolean(t.leader) && !removal;
  const charsOk = t.characters !== false && !(t.leader && t.characters === undefined);
  const list = sides.flatMap((p) => [...(leaderOk ? [m.sides[p].leader] : []), ...(charsOk ? m.sides[p].chars : [])].map((card) => ({ card, side: p })))
    .filter(({ card }) => !(t.otherThanSelf && card.uid === m.self) && fitsFilter(card.num, t.filter, card))
    .filter(({ card }) => (a.kind === 'rest' ? !card.rested : a.kind === 'setActive' || a.kind === 'cantRefresh' ? card.rested : true));
  if (t.count === 'all') return list;
  if (m.variant.none && t.upTo) return [];
  return list.slice(0, t.count);
}

function removeFromField(m: Model, side: PlayerId, card: MCard, to: 'trash' | 'hand' | 'deck' | 'life') {
  const S = m.sides[side];
  S.chars = S.chars.filter((c) => c.uid !== card.uid);
  S.donRested += card.don;
  const moved = { ...card, rested: false, don: 0 };
  if (to === 'deck') S.deck.push(moved);
  else S[to].push(moved);
}

const n0 = (n: number, have: number) => Math.max(0, Math.min(n, have));

// Applique une action au modèle ; renvoie vrai si elle a fait quelque chose (« si vous le faites »)
function apply(m: Model, a: Action): boolean {
  const me = m.sides[0];
  const opp = m.sides[1];
  const S = (side: 'own' | 'opp') => m.sides[side === 'own' ? 0 : 1];
  const t = fieldTarget(a);
  if (t && t.stage) { m.unchecked.push(`${a.kind} sur un Lieu`); return true; }
  switch (a.kind) {
    case 'ko': case 'bounce': case 'bottom': case 'trashChar': case 'toLife': {
      const chosen = chooseField(m, a, a.target);
      const to = a.kind === 'ko' || a.kind === 'trashChar' ? 'trash' : a.kind === 'bounce' ? 'hand' : a.kind === 'bottom' ? 'deck' : 'life';
      for (const x of chosen) { m.touched.add(x.card.uid); removeFromField(m, x.side, x.card, to); }
      return chosen.length > 0;
    }
    case 'rest': case 'setActive': {
      const chosen = chooseField(m, a, a.target);
      for (const x of chosen) { m.touched.add(x.card.uid); x.card.rested = a.kind === 'rest'; }
      return chosen.length > 0;
    }
    // famille « puissance » (C2.2) : ce que le compilateur ne traduit pas en une modification par carte visée
    case 'powerSet': case 'cantAttack': case 'cantBlock': case 'cantBeKO': case 'cantBeRested': case 'cantLeave': case 'attackActive': case 'negate':
      if ((a.kind === 'cantBlock' && a.target.side === 'opp' && a.target.count === 'all') || (a.kind === 'cantBeKO' && a.byAttribute)) {
        m.unchecked.push(`${a.kind} (tous les Personnages adverses ou attribut)`);
        return true;
      }
    // eslint-disable-next-line no-fallthrough
    case 'power': case 'cost': case 'keyword': case 'cantRefresh': {
      const until = a.kind === 'cantRefresh' ? `+${m.active === 0 ? 1 : 2}` : relUntil(m, a.until);
      if (until === null) { m.unchecked.push(`${a.kind} (durée ${a.kind === 'cantRefresh' ? '' : a.until})`); return true; }
      const chosen = chooseField(m, a, a.target);
      const amount = a.kind === 'power' || a.kind === 'cost' ? a.amount : a.kind === 'powerSet' ? a.value : 0;
      const stat = a.kind === 'keyword' ? `keyword:${a.keyword}` : MOD_STAT[a.kind]!;
      for (const x of chosen) { m.touched.add(x.card.uid); m.mods.push(`${x.side}|${stat}|${amount}|${until}`); }
      return chosen.length > 0;
    }
    case 'draw': { const k = n0(a.n, me.deck.length); me.hand.push(...me.deck.splice(0, k)); return k > 0; }
    case 'discard': {
      const list = me.hand.filter((c) => !a.filter || fitsFilter(c.num, a.filter));
      const k = m.variant.none && a.upTo ? 0 : n0(a.n, list.length);
      for (const c of list.slice(0, k)) { me.hand.splice(me.hand.indexOf(c), 1); me.trash.push(c); m.touched.add(c.uid); }
      return k > 0;
    }
    case 'oppDiscard': { const k = n0(a.n, opp.hand.length); opp.trash.push(...opp.hand.splice(0, k)); return k > 0; }
    case 'trashTop': { const P = S(a.side); const k = n0(a.n, P.deck.length); P.trash.push(...P.deck.splice(0, k)); return k > 0; }
    case 'search': {
      const look = me.deck.splice(0, Math.min(a.look, me.deck.length));
      const fits = look.filter((c) => fitsFilter(c.num, { ...a.filter, rested: undefined }));
      const take = m.variant.none && a.upTo ? [] : fits.slice(0, a.take);
      const rest = look.filter((c) => !take.includes(c));
      for (const c of take) m.touched.add(c.uid);
      if (a.dest === 'hand') me.hand.push(...take);
      else if (a.dest === 'life') me.life.unshift(...take);
      else me.chars.push(...take.map((c) => ({ ...c, rested: Boolean(a.rested) })));
      if (a.rest === 'trash') me.trash.push(...rest);
      else if (a.rest === 'top') me.deck.unshift(...rest);
      else me.deck.push(...rest);
      for (const c of rest) m.touched.add(c.uid);
      return take.length > 0;
    }
    case 'play': {
      if (a.from !== 'hand' && a.from !== 'trash') { m.unchecked.push(`play depuis ${a.from}`); return true; }
      const zone = me[a.from];
      const list = zone.filter((c) => fitsFilter(c.num, { category: ['CHARACTER'], ...a.filter, rested: undefined }));
      const k = m.variant.none && a.upTo ? 0 : n0(Math.min(a.count, 5 - me.chars.length), list.length);
      for (const c of list.slice(0, k)) { zone.splice(zone.indexOf(c), 1); me.chars.push({ ...c, rested: Boolean(a.rested) }); m.touched.add(c.uid); }
      return k > 0;
    }
    case 'trashToHand': case 'trashToBottom': {
      const P = a.kind === 'trashToBottom' ? S(a.side) : me;
      const list = P.trash.filter((c) => fitsFilter(c.num, a.filter));
      const upTo = Boolean(a.upTo);
      const k = m.variant.none && upTo ? 0 : n0(a.count, list.length);
      for (const c of list.slice(0, k)) { P.trash.splice(P.trash.indexOf(c), 1); (a.kind === 'trashToHand' ? P.hand : P.deck).push(c); m.touched.add(c.uid); }
      return k > 0;
    }
    case 'addDon': {
      const k = n0(a.n, me.donDeck);
      me.donDeck -= k;
      if (a.state === 'active') me.donActive += k; else me.donRested += k;
      return k > 0;
    }
    case 'readyDon': { const k = n0(a.n, me.donRested); me.donRested -= k; me.donActive += k; return k > 0; }
    case 'giveDon': {
      // C2.4 : les DON!! viennent du camp de la carte choisie (from 'opp' / 'owner'), sinon du vôtre ; la carte qui porte
      // l'effet n'est pas choisie ; « jusqu'à » refusé (mode none) : rien, sauf la brique des vôtres qui prend d'office la
      // seule carte possible (B.giveDon)
      let chosen = chooseField(m, a, { ...a.target, count: 1, upTo: false });
      if (a.from) chosen = chosen.filter((x) => (x.side === 0 ? me : opp)[a.rested ? 'donRested' : 'donActive'] > 0);
      const all = a.target.self ? chosen : chooseField(m, a, { ...a.target, count: 'all' });
      if (m.variant.none && a.upTo && !a.target.self && (a.from || all.length > 1)) chosen = [];
      const P = chosen[0]?.side === 1 ? opp : me;
      const pool = a.rested ? P.donRested : P.donActive;
      const k = chosen.length ? n0(a.n, pool) : 0;
      if (a.rested) P.donRested -= k; else P.donActive -= k;
      if (chosen[0]) { chosen[0].card.don += k; m.touched.add(chosen[0].card.uid); }
      return k > 0;
    }
    case 'returnDon': {
      const P = S(a.side);
      const side = a.side === 'own' ? 0 : 1;
      const k = n0(a.n, P.donActive + P.donRested + [P.leader, ...P.chars].reduce((sum, c) => sum + c.don, 0));
      // d'où viennent les DON!! renvoyées : au choix du joueur ; seul le total est prédit
      P.donDeck += k;
      P.donRested -= k;
      for (const key of ['donActive', 'donRested', 'donGiven']) m.free.add(`${side}.${key}`);
      return k > 0;
    }
    case 'restDon': {
      // C2.4 : « DON!! ou Personnages » adverses : le choix entre les deux n'est pas prédit (seul l'état des DON!! et des
      // Personnages adverses change) ; DON!! adverses « jusqu'à » : rien en mode none
      if (a.orCharacters) { for (const key of ['donActive', 'donRested', 'rested']) m.free.add(`1.${key}`); return true; }
      const P = S(a.side);
      const k = a.side === 'opp' && m.variant.none ? 0 : n0(a.n, P.donActive);
      P.donActive -= k;
      P.donRested += k;
      return k > 0;
    }
    case 'lifeFromDeck': { const k = n0(a.n, me.deck.length); me.life.unshift(...me.deck.splice(0, k)); return k > 0; }
    case 'lifeToHand': case 'trashLife': {
      const P = S(a.side);
      // « jusqu'à N » de sa propre Vie : le joueur peut s'arrêter (C2.5) ; la Vie adverse : sans question (n° 381)
      const blocked = a.kind === 'lifeToHand' && a.side === 'own' && m.noLifeToHand;
      const k = blocked || (m.variant.none && a.upTo && a.side === 'own') ? 0 : n0(a.n, P.life.length);
      const cards = P.life.splice(0, k);
      (a.kind === 'lifeToHand' ? P.hand : P.trash).push(...cards);
      return k > 0;
    }
    case 'handToBottom': {
      // au-dessus ou au-dessous (where, C2.3) : le nombre de cartes de chaque zone est le même
      const k = n0(a.n, me.hand.length);
      me.deck.push(...me.hand.splice(0, k));
      return k > 0;
    }
    // famille « cartes » (C2.3) : réorganiser le dessus du deck ne change aucun nombre
    case 'arrangeTop': return me.deck.length > 0;
    case 'revealTop': {
      const top = me.deck[0];
      if (!top) return false;
      m.revealed = top.uid;
      return true;
    }
    case 'playRevealed': {
      const top = me.deck[0];
      if (!top || top.uid !== m.revealed || CARDS[top.num]?.category !== 'CHARACTER' || me.chars.length >= 5) return false;
      me.deck.shift();
      me.chars.push({ ...top, rested: Boolean(a.rested) });
      m.touched.add(top.uid);
      return true;
    }
    case 'revealedToBottom': {
      const top = me.deck[0];
      if (!top || top.uid !== m.revealed) return false;
      me.deck.push(me.deck.shift()!);
      return true;
    }
    case 'oppHandToBottom': { const k = n0(a.n, opp.hand.length); opp.deck.push(...opp.hand.splice(0, k)); return k > 0; }
    case 'handToLife': {
      const list = me.hand.filter((c) => fitsFilter(c.num, a.filter));
      const k = m.variant.none && a.upTo ? 0 : n0(a.n, list.length);
      for (const c of list.slice(0, k)) { me.hand.splice(me.hand.indexOf(c), 1); me.life.unshift(c); m.touched.add(c.uid); }
      return k > 0;
    }
    // rien qui se compte (C2.5) : une interdiction pour le tour, l'ordre de la Vie
    case 'noLifeToHand': m.noLifeToHand = true; return true;
    case 'reorderLife': return S(a.side).life.length > 0;
    default:
      m.unchecked.push(`action ${a.kind}`);
      return true;
  }
}

// Coût : payable ? puis payé
function payCost(m: Model, parts: CostPart[]): boolean | null {
  const me = m.sides[0];
  const selfOnField = me.chars.find((c) => c.uid === m.self) ?? (me.leader.uid === m.self ? me.leader : undefined);
  for (const c of parts) {
    switch (c.kind) {
      case 'restDon': if (me.donActive < c.n) return false; break;
      case 'donMinus': if (me.donActive + me.donRested + [me.leader, ...me.chars].reduce((s, x) => s + x.don, 0) < c.n) return false; break;
      case 'discard': if (me.hand.filter((x) => !c.filter || fitsFilter(x.num, c.filter)).length < c.n) return false; break;
      case 'trashTop': if (me.deck.length < c.n) return false; break;
      // famille « cartes » (C2.3)
      case 'reveal': if (me.hand.filter((x) => !c.filter || fitsFilter(x.num, c.filter)).length < c.n) return false; break;
      case 'trashToBottom': if (me.trash.filter((x) => !c.filter || fitsFilter(x.num, c.filter)).length < c.n) return false; break;
      case 'lifeToHand': if (!me.life.length || m.noLifeToHand) return false; break;
      case 'trashLife': if (!me.life.length) return false; break;
      // le banc pose la Vie face cachée : seul « retourner face visible » se paie
      case 'flipLife': if (!c.faceUp || !me.life.length) return false; break;
      case 'restSelf': if (!selfOnField || selfOnField.rested) return false; break;
      case 'trashSelf': if (!selfOnField || selfOnField === me.leader) return false; break;
      case 'leaderPowerMinus': if (me.leader.rested) return false; break;   // C2.2 : Leader redressé
      default: m.unchecked.push(`coût ${c.kind}`); return null;
    }
  }
  if (m.variant.refuse) return false;
  for (const c of parts) {
    switch (c.kind) {
      case 'restDon': me.donActive -= c.n; me.donRested += c.n; break;
      case 'donMinus': me.donDeck += c.n; me.donRested -= c.n; for (const key of ['donActive', 'donRested', 'donGiven']) m.free.add(`0.${key}`); break;
      case 'discard': {
        const list = me.hand.filter((x) => !c.filter || fitsFilter(x.num, c.filter)).slice(0, c.n);
        for (const x of list) { me.hand.splice(me.hand.indexOf(x), 1); me.trash.push(x); m.touched.add(x.uid); }
        break;
      }
      case 'trashTop': me.trash.push(...me.deck.splice(0, c.n)); break;
      case 'trashToBottom': {
        const list = me.trash.filter((x) => !c.filter || fitsFilter(x.num, c.filter)).slice(0, c.n);
        for (const x of list) { me.trash.splice(me.trash.indexOf(x), 1); me.deck.push(x); m.touched.add(x.uid); }
        break;
      }
      case 'lifeToHand': me.hand.push(...me.life.splice(0, 1)); break;
      case 'trashLife': me.trash.push(...me.life.splice(0, 1)); break;
      case 'restSelf': selfOnField!.rested = true; break;
      case 'trashSelf': removeFromField(m, 0, selfOnField!, 'trash'); break;
      case 'leaderPowerMinus': m.mods.push(`0|power|${-c.n}|turn`); break;
      default:
    }
  }
  return true;
}

function runSteps(m: Model, steps: Step[]): void {
  let did = true;
  for (const st of steps) {
    // condition vérifiée au moment où l'étape se résout (après les étapes précédentes), comme le moteur
    let ok = true;
    if (st.cond) {
      const v = evalCond(m, st.cond);
      if (v === null) m.unchecked.push(`condition ${st.cond.kind}`); else ok = v;
    }
    if (st.link === 'ifYouDo' && !did) ok = false;
    if (st.link === 'ifNotYouDo' && did) ok = false;
    if (!ok) { did = false; continue; }
    if ('action' in st) did = apply(m, st.action);
    else if ('group' in st) { runSteps(m, st.group); did = true; }
    else if ('may' in st) {
      if (m.variant.refuse) did = false; else { runSteps(m, st.may); did = true; }
    } else {
      runSteps(m, st.chooseOne[Math.min(m.variant.branch ?? 0, st.chooseOne.length - 1)] ?? []);
      did = true;
    }
  }
}

// Ce que dit `useful` de la brique compilée (pas « ce que l'effet ferait ») : vrai, faux, ou null si le modèle ne le sait
// pas. Famille « cartes » (C2.3) seulement ; les étapes : seq (l'une sert), when (condition, puis l'effet), may.
function usefulSteps(m: Model, steps: Step[]): boolean | null {
  let unknown = false;
  for (const st of steps) {
    let v: boolean | null;
    if ('chooseOne' in st) v = null;
    else {
      const inner = 'action' in st ? usefulAction(m, st.action) : usefulSteps(m, 'group' in st ? st.group : st.may);
      const c = st.cond ? (st.cond.kind === 'revealed' ? m.sides[0].deck.length > 0 : evalCond(m, st.cond)) : true;
      v = c === false ? false : c === null || inner === null ? null : inner;
    }
    if (v === true) return true;
    if (v === null) unknown = true;
  }
  return unknown ? null : false;
}

function usefulAction(m: Model, a: Action): boolean | null {
  const [me, opp] = m.sides;
  const fits = (list: MCard[], f?: Filter) => list.some((c) => !f || fitsFilter(c.num, f));
  switch (a.kind) {
    case 'draw': case 'search': case 'arrangeTop': case 'revealTop': return me.deck.length > 0;
    case 'discard': return !a.filter && !a.upTo ? true : a.upTo ? false : fits(me.hand, a.filter);
    case 'oppDiscard': case 'oppHandToBottom': return opp.hand.length > 0;
    case 'trashTop': return a.side === 'own' ? true : opp.deck.length > 0;
    case 'trashToHand': return fits(me.trash, a.filter);
    case 'trashToBottom': return fits(m.sides[a.side === 'own' ? 0 : 1].trash, a.filter);
    case 'handToBottom': return me.hand.length > 0;
    case 'playRevealed': return Boolean(me.deck[0]) && CARDS[me.deck[0].num]?.category === 'CHARACTER';
    case 'revealedToBottom': return false;
    default: return null;
  }
}

// L'effet d'une capacité change-t-il quelque chose ? (sur une copie du modèle ; ce qui n'est pas prédit compte comme utile)
function usefulEffect(m: Model, ab: Ability): boolean {
  const copy: Model = { ...structuredClone(m), variant: { ...m.variant, none: false, refuse: false } };
  copy.unchecked = [];
  runSteps(copy, ab.steps);
  if (copy.unchecked.length || copy.free.size > m.free.size) return true;
  const before = measureSides(m.sides);
  const after = measureSides(copy.sides);
  return copy.mods.length !== m.mods.length || Object.keys(before).some((k) => before[k] !== after[k])
    || JSON.stringify(copy.sides) !== JSON.stringify(m.sides);
}

function simulate(m: Model, ab: Ability): void {
  if (ab.condition) {
    const v = evalCond(m, ab.condition);
    if (v === null) m.unchecked.push(`condition ${ab.condition.kind}`);
    else if (!v) return;
  }
  if (ab.don && ab.timing !== 'onKO') {
    const selfCard = [m.sides[0].leader, ...m.sides[0].chars].find((c) => c.uid === m.self);
    if (!selfCard || selfCard.don < ab.don) return;
  }
  if (ab.yourTurn && m.active !== 0) return;
  if (ab.oppTurn && m.active === 0) return;
  if (ab.cost?.length) {
    // convention n° 1000 : un coût facultatif n'est proposé que si l'effet peut servir ([Activation : Principale] :
    // activer, c'est payer, sans question). Le modèle lit d'abord ce que dit `useful` de la brique compilée, quand il le
    // sait (C2.3) ; sinon l'effet est joué à blanc sur une copie, sans refus ni « jusqu'à » refusé, et s'il ne change
    // rien, rien n'est payé (C2.4, C2.6 : ① et DON!! −N devant une cible absente, « jouez jusqu'à 1 » sans carte)
    if (ab.timing !== 'activateMain' && !(usefulSteps(m, ab.steps) ?? usefulEffect(m, ab))) return;
    const paid = payCost(m, ab.cost);
    if (paid === null) return;
    if (!paid) return;
  }
  runSteps(m, ab.steps);
}

// ---------- Mesures ----------

type Measures = Record<string, number>;
const KEYS = ['hand', 'deck', 'trash', 'life', 'chars', 'rested', 'donActive', 'donRested', 'donDeck', 'donGiven', 'donField'];

function measureSides(sides: { leader: MCard; chars: MCard[]; hand: unknown[]; deck: unknown[]; trash: unknown[]; life: unknown[]; donActive: number; donRested: number; donDeck: number }[]): Measures {
  const out: Measures = {};
  sides.forEach((S, p) => {
    const given = [S.leader, ...S.chars].reduce((sum, c) => sum + c.don, 0);
    Object.assign(out, {
      [`${p}.hand`]: S.hand.length, [`${p}.deck`]: S.deck.length, [`${p}.trash`]: S.trash.length, [`${p}.life`]: S.life.length,
      [`${p}.chars`]: S.chars.length, [`${p}.rested`]: [S.leader, ...S.chars].filter((c) => c.rested).length,
      [`${p}.donActive`]: S.donActive, [`${p}.donRested`]: S.donRested, [`${p}.donDeck`]: S.donDeck, [`${p}.donGiven`]: given,
      [`${p}.donField`]: S.donActive + S.donRested + given,
    });
  });
  return out;
}

const measureState = (s: GameState) => measureSides(s.players.map((P) => ({ ...P, leader: mc(P.leader), chars: P.chars.map(mc) })));

function ownerOf(s: GameState, uid: number): PlayerId | null {
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    if (P.leader.uid === uid || P.chars.some((c) => c.uid === uid) || P.stage?.uid === uid) return p;
  }
  return null;
}

function modSigs(s: GameState): string[] {
  return s.mods.flatMap((x) => {
    const side = ownerOf(s, x.uid);
    if (side === null) return [];
    const until = x.until === 'battle' ? 'battle' : x.until === 'turn' || x.until === s.turn ? 'turn' : `+${x.until - s.turn}`;
    const stat = x.stat === 'keyword' ? `keyword:${x.keyword}` : x.stat;
    return [`${side}|${stat}|${x.amount}|${until}`];
  });
}

function multisetDiff(after: string[], before: string[]): string[] {
  const left = [...before];
  const out: string[] = [];
  for (const x of after) {
    const i = left.indexOf(x);
    if (i >= 0) left.splice(i, 1); else out.push(x);
  }
  return [...out, ...left.map((x) => `−${x}`)].sort();
}

// État d'une carte posée par le banc : zone, épuisée, nombre de modificateurs
function cardState(s: GameState, uid: number): string {
  for (const [p, P] of s.players.entries()) {
    const zones: [string, { uid: number; rested?: boolean }[]][] = [['leader', [P.leader]], ['chars', P.chars], ['hand', P.hand], ['deck', P.deck], ['trash', P.trash], ['life', P.life]];
    for (const [z, list] of zones) {
      const c = list.find((x) => x.uid === uid);
      if (c) return `${p}.${z}${c.rested ? '.épuisé' : ''}.${s.mods.filter((x) => x.uid === uid).length}`;
    }
  }
  return 'ailleurs';
}

// ---------- Cas et rapport ----------

export type CaseStatus = 'ok' | 'fail' | 'unchecked' | 'skipped';
export interface CaseResult {
  ability: number;              // rang dans recipe.abilities (le [Déclenchement] : abilities.length)
  timing: Timing;
  label: string;
  status: CaseStatus;
  detail?: string;
}
export interface TestgenReport {
  num: string;
  cases: CaseResult[];
  uncovered: string[];          // capacités ou morceaux que le banc ne sait pas essayer
  ok: boolean;                  // aucun cas en échec
}

export interface GenCase { ability: number; timing: Timing; label: string; variant: Variant }

function abilitiesOf(r: Recipe): { ab: Ability; index: number }[] {
  return [...r.abilities.map((ab, index) => ({ ab, index })), ...(r.trigger ? [{ ab: r.trigger, index: r.abilities.length }] : [])];
}

const hasUpTo = (ab: Ability) => actionsOf(ab.steps).some((a) => ('target' in a && a.target.upTo && a.target.count !== 'all') || ('upTo' in a && a.upTo));
const hasTargets = (ab: Ability) => actionsOf(ab.steps).some((a) => {
  const t = fieldTarget(a);
  return (t && !t.self && !(t.leader && !t.characters)) || ['search', 'play', 'trashToHand', 'trashToBottom', 'handToLife'].includes(a.kind) || (a.kind === 'discard' && a.filter);
});
const hasMay = (steps: Step[]): boolean => steps.some((st) => 'may' in st || ('group' in st && hasMay(st.group)));

// Les cas d'une recette : effet, chaque autre effet de « choisissez un », chaque condition fausse, cible absente,
// « jusqu'à » avec 0 cible, coût ou effet facultatif refusé
export function generateCases(r: Recipe): { cases: GenCase[]; uncovered: string[] } {
  const cases: GenCase[] = [];
  const uncovered: string[] = [];
  for (const { ab, index } of abilitiesOf(r)) {
    const timing = index === r.abilities.length ? 'trigger' : ab.timing;
    if (!DRIVEN_TIMINGS.includes(timing)) { uncovered.push(`capacité ${index + 1} : moment ${timing}`); continue; }
    if (CARDS[r.num]?.category === 'LEADER' && (timing === 'onPlay' || timing === 'onKO')) { uncovered.push(`capacité ${index + 1} : ${timing} d'un Leader`); continue; }
    const add = (label: string, variant: Variant) => cases.push({ ability: index, timing, label, variant });
    add('effet', {});
    const choose = ab.steps.find((st) => 'chooseOne' in st);
    if (choose && 'chooseOne' in choose) for (let k = 1; k < choose.chooseOne.length; k++) add(`effet n° ${k + 1} au choix`, { branch: k });
    for (const ref of condsOf(ab)) add(`condition ${ref.id + 1} (${ref.cond.kind}) fausse`, { falseCond: ref.id });
    if (hasTargets(ab)) add('cible absente (leurres seulement)', { absent: true });
    if (hasUpTo(ab)) add('« jusqu’à » : aucune cible choisie', { none: true });
    // [Activation : Principale] : activer, c'est payer (le moteur ne pose pas de question) ; ne pas payer = ne pas activer
    if (ab.cost?.length) { if (timing !== 'activateMain') add('coût refusé', { refuse: true }); }
    else if (hasMay(ab.steps)) add('effet facultatif refusé', { refuse: true });
  }
  return { cases, uncovered };
}

function fillerFor(r: Recipe, avoid: string[]): string {
  const filters = zoneFilters(r);
  const pool = inertPool().chars.filter((n) => !avoid.includes(n));
  const quiet = pool.filter((n) => !CARDS[n].triggerEn && !CARDS[n].counter && (CARDS[n].cost ?? 0) <= 2);
  return quiet.find((n) => filters.every((f) => !fitsFilter(n, f))) ?? pool.find((n) => filters.every((f) => !fitsFilter(n, f))) ?? pool[0];
}

function attackerFor(r: Recipe, avoid: string[]): string {
  const filters = abilitiesOf(r).flatMap(({ ab }) => actionsOf(ab.steps).flatMap((a) => (fieldTarget(a) ? [fieldTarget(a)!.filter] : [])));
  const pool = inertPool().chars.filter((n) => !avoid.includes(n) && filters.every((f) => !fitsFilter(n, f)));
  return pool.sort((a, b) => (CARDS[b].power ?? 0) - (CARDS[a].power ?? 0))[0] ?? inertPool().chars[0];
}

// Joue tous les cas générés d'une recette avec le comportement donné (compilé depuis la recette, ou codé à la main :
// la recette sert alors de référence pour juger le code)
export function runGeneratedTests(r: Recipe, behavior: CardBehavior, opts: { seed?: number } = {}): TestgenReport {
  const { cases, uncovered } = generateCases(r);
  const results: CaseResult[] = [];
  const exclude = [r.num];
  const filler = fillerFor(r, exclude);
  const attacker = attackerFor(r, [...exclude, filler]);
  for (const gc of cases) {
    const ability = gc.ability === r.abilities.length ? r.trigger! : r.abilities[gc.ability];
    const result: CaseResult = { ability: gc.ability, timing: gc.timing, label: gc.label, status: 'ok' };
    results.push(result);
    try {
      runCase(r, behavior, gc, ability, { num: r.num, timing: gc.timing, ability, variant: gc.variant, filler, attacker, exclude: [...exclude, filler, attacker] }, opts.seed ?? 7, result);
    } catch (err) {
      result.status = 'fail';
      result.detail = `erreur : ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { num: r.num, cases: results, uncovered, ok: results.every((c) => c.status !== 'fail') };
}

function runCase(r: Recipe, behavior: CardBehavior, gc: GenCase, ab: Ability, c: CaseCtx, seed: number, out: CaseResult) {
  const conds = condsOf(ab);
  const { draft, ok, why } = buildDraft(c, conds);
  if (!ok) { out.status = 'skipped'; out.detail = why; return; }
  const spec = specOf(c, draft, seed);
  const base = withoutTiming(behavior, gc.timing);
  const s0 = withBehavior(r.num, behavior, () => {
    const s = buildSituation(spec);
    if (gc.timing === 'counter' || gc.timing === 'trigger') {
      // l'attaquant adverse touche à coup sûr ; le modificateur est le même dans les deux parties
      const atk = s.players[1].chars.at(-1)!;
      s.mods.push({ uid: atk.uid, stat: 'power', amount: 20000, until: 'turn', source: 'banc d’essai' });
    }
    return s;
  });
  const self = locate(s0, r.num);
  if (self === null) { out.status = 'skipped'; out.detail = 'carte essayée introuvable'; return; }
  const attackerUid = s0.players[1].chars.at(-1)?.uid;
  const chooser = maxChooser(gc.variant);
  const withEffect = withBehavior(r.num, behavior, () => drive(s0, gc.timing, self, chooser, attackerUid));
  const reference = withBehavior(r.num, base, () => drive(s0, gc.timing, self, chooser, attackerUid));
  if (!reference.ran) { out.status = 'skipped'; out.detail = reference.reason; return; }
  if (!withEffect.ran) { out.status = 'fail'; out.detail = `la carte ne se joue pas avec son effet : ${withEffect.reason}`; return; }
  const bad = coherenceErrors(withEffect.state);
  if (bad.length) { out.status = 'fail'; out.detail = `partie incohérente : ${bad.join(' ; ')}`; return; }
  if (withEffect.state.decision?.inEffect) { out.status = 'fail'; out.detail = 'effet resté au milieu d’une question'; return; }

  // ce que la recette doit faire
  const model = modelOf(s0, self, gc.timing, gc.variant);
  const before = measureSides(model.sides);
  for (const ref of conds) model.truth.set(ref.id, evalCond(model, ref.cond));
  const falseOk = gc.variant.falseCond === undefined || model.truth.get(gc.variant.falseCond) === false;
  const trueOk = conds.every((ref) => ref.id === gc.variant.falseCond || model.truth.get(ref.id) !== false);
  if (!falseOk || !trueOk) { out.status = 'skipped'; out.detail = 'situation : conditions pas dans l’état voulu'; return; }
  simulate(model, ab);
  const after = measureSides(model.sides);

  const got = measureState(withEffect.state);
  const ref = measureState(reference.state);
  const diffs: string[] = [];
  for (const p of [0, 1]) {
    for (const k of KEYS) {
      const key = `${p}.${k}`;
      if (model.free.has(key)) continue;
      const want = after[key] - before[key];
      const have = got[key] - ref[key];
      if (want !== have) diffs.push(`${p === 0 ? 'moi' : 'adversaire'} ${k} : attendu ${want >= 0 ? '+' : ''}${want}, obtenu ${have >= 0 ? '+' : ''}${have}`);
    }
  }
  const modsWant = [...model.mods].sort();
  const modsHave = multisetDiff(modSigs(withEffect.state), modSigs(reference.state));
  const modsCheck = !model.unchecked.some((u) => u.startsWith('power') || u.startsWith('cost') || u.startsWith('keyword'));
  if (modsCheck && modsWant.join() !== modsHave.join()) diffs.push(`modificateurs : attendu [${modsWant.join(', ')}], obtenu [${modsHave.join(', ')}]`);
  // leurres : intacts, sauf ceux qu'une autre partie de l'effet vise légitimement
  for (const dc of draft.decoys) {
    const uids = cardsOf(s0, dc.side, dc.num, dc.zone);
    for (const uid of uids) {
      if (model.touched.has(uid)) continue;
      if (cardState(withEffect.state, uid) !== cardState(reference.state, uid)) diffs.push(`leurre ${dc.num} (${dc.zone}) touché par l’effet`);
    }
  }
  if (model.unchecked.length) {
    out.status = 'unchecked';
    out.detail = `non prédit : ${[...new Set(model.unchecked)].join(', ')}${diffs.length ? ` (écarts non jugés : ${diffs.join(' ; ')})` : ''}`;
    return;
  }
  if (diffs.length) { out.status = 'fail'; out.detail = diffs.join(' ; '); }
}

function cardsOf(s: GameState, side: PlayerId, num: string, zone: string): number[] {
  const P = s.players[side];
  const list = zone === 'chars' ? P.chars : zone === 'hand' ? P.hand : zone === 'trash' ? P.trash : P.deck;
  // leurres : pas les cartes qui conviennent (même numéro qu'une cible : impossible, une cible convient et pas un leurre)
  return list.filter((c) => c.num === num).map((c) => c.uid);
}

// Tests générés d'une recette compilée par le vrai compilateur (C1.1), avec son code à la main s'il y en a : c'est
// l'appel de `cards:new` (C1.5). Une recette qui ne se compile pas échoue avec ce qui manque.
export function testRecipe(r: Recipe, manual?: ManualCode): { ok: boolean; failures: string[]; report?: TestgenReport } {
  const c = compileRecipe(r, manual, CARDS[r.num]?.name ?? r.num);
  if (!c.ok) return { ok: false, failures: c.missing.map((m) => `non compilée : ${m}`) };
  const report = runGeneratedTests(r, c.behavior);
  const failures = report.cases.filter((x) => x.status === 'fail').map((x) => `capacité ${x.ability + 1} (${x.timing}) ${x.label} : ${x.detail ?? ''}`);
  return { ok: report.ok, failures, report };
}

// Résumé d'un rapport, une ligne par cas qui n'est pas « ok »
export function formatReport(rep: TestgenReport): string {
  const count = (st: CaseStatus) => rep.cases.filter((c) => c.status === st).length;
  const lines = [`${rep.num} : ${count('ok')} ok, ${count('fail')} en échec, ${count('unchecked')} non vérifiés, ${count('skipped')} non construits`];
  for (const c of rep.cases) if (c.status !== 'ok') lines.push(`  [${c.status}] capacité ${c.ability + 1} (${c.timing}) ${c.label} : ${c.detail ?? ''}`);
  for (const u of rep.uncovered) lines.push(`  [non couvert] ${u}`);
  return lines.join('\n');
}
