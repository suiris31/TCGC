// Compilateur des recettes (tâche C1.1) : recette → CardBehavior fait de briques existantes (cards/bricks.ts).
//
// Chaque morceau de la recette (moment, condition, coût, action, cible) devient une brique ; ce que les briques savent
// dire à l'IA (useful, attackUseful, mainUseful, counterPower) est rempli d'office par card(). Un morceau qu'aucune
// brique ne sait faire EXACTEMENT n'est pas approché : il est noté dans `missing` (texte normalisé, jamais une phrase de
// carte) et la carte reste non jouable. Les familles de la vague C2 ajoutent leurs `case` ici (01-contrats.md § 15.6).
//
// Conventions (game/docs/interpretations.md, section « Recettes compilées (tâche C1.1) ») :
// - un coût facultatif « Vous pouvez [coût] : [effet] » (et un effet « vous pouvez ... ») n'est proposé que si l'effet
//   peut servir au moment de le résoudre (comme OP03-093 codé à la main) ;
// - une cible sans « jusqu'à » (choix obligatoire) n'est pas compilée : les briques laissent toujours le choix « Aucune ».
//
// Point d'entrée sûr : cards/index.ts d'abord (les fichiers de cartes et le moteur s'importent l'un l'autre).
import '../cards/index.ts';
import * as B from '../cards/bricks.ts';
import * as R from '../cards/bricks-removal.ts';
import * as P from '../cards/bricks-power.ts';
import * as L from '../cards/bricks-life.ts';
import * as BC from '../cards/bricks-cards.ts';
import { addMod, allField, def, donOnField, findField, log, other, untilOpponentsNextEnd } from '../rules.ts';
import type { CardBehavior, Category, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import type {
  Ability, Action, Cmp, Cmp2, Cond, CostPart, Duration, Filter, ManualCode, Recipe, Step, Target,
} from './types.ts';

// ok : le comportement de la carte ; sinon, les morceaux que le compilateur ne sait pas encore traduire en briques
// (« action power : durée nextTurn », « coût manual:clé absent »...), pour le rapport de couverture
export type CompileResult =
  | { ok: true; behavior: CardBehavior }
  | { ok: false; missing: string[] };

type Spec = B.CharSpec & { category?: Category };

const NOTHING: B.Effect = { run: () => {}, useful: () => false };
const ALWAYS: B.Condition = () => true;

const cmp = (v: number, c: Cmp, n: number) => (c === 'le' ? v <= n : c === 'ge' ? v >= n : v === n);
const cmp2 = (a: number, c: Cmp2, b: number) => (c === 'lt' ? a < b : c === 'le' ? a <= b : c === 'gt' ? a > b : a >= b);

// Une recette en cours de compilation : ce qui manque est noté, la compilation continue (le rapport liste tout)
class Compiler {
  missing: string[] = [];
  readonly num: string;
  readonly src: string;
  readonly manual: ManualCode | undefined;
  constructor(num: string, src: string, manual: ManualCode | undefined) {
    this.num = num;
    this.src = src;
    this.manual = manual;
  }

  no<T>(what: string, value: T): T {
    if (!this.missing.includes(what)) this.missing.push(what);
    return value;
  }

  // ---------- Filtres et cibles ----------

  spec(f: Filter, where: 'field' | 'card'): Spec {
    const s: Spec = {};
    const groups: B.CharSpec[] = [];
    if (f.costMax !== undefined) s.costMax = f.costMax;
    if (f.costMin !== undefined) s.costMin = f.costMin;
    if (f.costEq !== undefined) {
      s.costMin = Math.max(s.costMin ?? -Infinity, f.costEq);
      s.costMax = Math.min(s.costMax ?? Infinity, f.costEq);
    }
    if (f.baseCostMax !== undefined) s.baseCostMax = f.baseCostMax;
    if (f.baseCostMin !== undefined) s.baseCostMin = f.baseCostMin;
    if (f.powerMax !== undefined) s.powerMax = f.powerMax;
    if (f.powerMin !== undefined) s.powerMin = f.powerMin;
    if (f.basePowerMax !== undefined) s.basePowerMax = f.basePowerMax;
    if (f.basePowerMin !== undefined) s.basePowerMin = f.basePowerMin;
    if (f.types?.length === 1) s.type = f.types[0];
    else if (f.types?.length) {
      if (f.typesMode === 'all') groups.push(...f.types.map((type) => ({ type })));
      else groups.push({ anyOf: f.types.map((type) => ({ type })) });
    }
    if (f.typeIncludes !== undefined) s.typeIncludes = f.typeIncludes;
    if (f.name?.length === 1) s.name = f.name[0];
    else if (f.name?.length) groups.push({ anyOf: f.name.map((name) => ({ name })) });
    if (f.notName !== undefined) s.notName = f.notName;
    if (f.color?.length === 1) s.color = f.color[0];
    else if (f.color?.length) groups.push({ anyOf: f.color.map((color) => ({ color })) });
    if (f.attribute !== undefined) s.attribute = f.attribute;
    if (f.rested !== undefined) {
      if (where === 'card') this.no('filtre rested hors du terrain', 0);
      s.rested = f.rested;
    }
    if (f.trigger !== undefined) s.trigger = f.trigger;
    if (f.keyword !== undefined) s.keyword = f.keyword;
    if (f.noKeyword !== undefined) s.noKeyword = f.noKeyword;
    if (f.vanilla !== undefined) s.vanilla = f.vanilla;
    if (f.donMin !== undefined) s.donMin = f.donMin;
    if (f.category?.length === 1 && where === 'card') s.category = f.category[0];
    else if (f.category?.length) s.categories = [...f.category];
    if (f.anyOf?.length) groups.push({ anyOf: f.anyOf.map((x) => this.spec(x, where)) });
    if (groups.length === 1 && groups[0].anyOf) s.anyOf = groups[0].anyOf;
    else if (groups.length) s.allOf = groups;
    return s;
  }

  // Cible sur le terrain : Leader et/ou Personnages (un Lieu n'est visé que par les briques qui le savent)
  targets(t: Target, kind: string): B.Targets {
    if (t.that) return this.no(`${kind} : « cette carte » (carte choisie avant)`, B.oppChar());
    if (t.zone !== 'field') return this.no(`${kind} : cible hors du terrain (${t.zone})`, B.oppChar());
    if (t.stage) this.no(`${kind} : cible Lieu`, 0);
    const spec = this.spec(t.filter, 'field');
    const leader = Boolean(t.leader);
    const characters = Boolean(t.characters) || (!leader && !t.stage);
    const what = leader && characters ? 'Leader ou Personnage' : leader ? 'Leader' : 'Personnage';
    const whose = t.side === 'opp' ? ' adverse' : '';
    let label: string | undefined;
    const r: B.Targets = {
      side: t.side, leader, characters, spec,
      get label() { return (label ??= leader && !characters && t.side === 'own' && !Object.keys(spec).length ? 'ton Leader' : B.describeSpec(`${what}${whose}`, spec)); },
    };
    return t.otherThanSelf ? B.otherThanSelf(r) : r;
  }

  // « jusqu'à N » : le nombre ; une cible obligatoire ou « tous » n'a pas de brique à choix (voir l'en-tête)
  upToN(t: Target, kind: string): number {
    if (t.count === 'all') return this.no(`${kind} : tous`, 1);
    if (!t.upTo) return this.no(`${kind} : cible obligatoire (sans « jusqu'à »)`, t.count);
    return t.count;
  }

  // Combien de cartes pour les briques de la famille « retraits » (C2.1) : « jusqu'à N », N obligatoires, toutes
  amount(t: Target): R.Amount {
    return t.count === 'all' ? { all: true } : { n: t.count, forced: !t.upTo };
  }

  // La brique « jusqu'à N » de bricks.ts quand la cible le permet (même jeu, mêmes questions), sinon celle de la
  // famille « retraits » (cible obligatoire, « tous »)
  removal(t: Target, k: string, to: R.RemovalTo, upTo: (t: B.Targets, src: string, n: number) => B.Effect): B.Effect {
    const tg = this.targets(t, k);
    if (t.count !== 'all' && t.upTo) return upTo(tg, this.src, t.count);
    return R.removeChars(tg, to, this.src, this.amount(t));
  }

  // Le Leader du joueur, sans choix (« votre Leader gagne ... »)
  // (sans « jusqu'à » : « up to 1 of your Leader » laisse le choix « Aucune », C2.2)
  ownLeaderOnly = (t: Target) => t.zone === 'field' && !t.self && t.side === 'own' && t.leader && !t.characters && !t.stage
    && !Object.keys(t.filter).length && t.count === 1 && !t.upTo;

  // Le Leader du joueur avec un filtre (« votre Leader {Marine} »), sans choix (C2.2)
  ownLeaderFiltered = (t: Target) => t.zone === 'field' && !t.self && t.side === 'own' && t.leader && !t.characters && !t.stage
    && t.count === 1 && !t.upTo && Object.keys(t.filter).length > 0;

  // Combien de cartes pour les briques de la famille « puissance » (C2.2) : « jusqu'à N », N obligatoires, toutes
  amountOf(t: Target): P.Amount {
    return t.count === 'all' ? { all: true } : { n: t.count, forced: !t.upTo };
  }

  // Durée d'une modification, « jusqu'à la fin de votre prochain tour » comprise (C2.2)
  until2(u: Duration, kind: string): P.Until {
    return u === 'permanent' ? this.no(`${kind} : durée ${u}`, 'turn') : u;
  }

  // Une modification (puissance, coût, mot-clé, interdit...) sur la cible d'une recette (C2.2) : la carte elle-même, le
  // Leader du joueur (avec ou sans filtre), sinon les cartes choisies. `upTo` : la brique de bricks.ts quand elle sait
  // faire exactement (« jusqu'à N », durée de bricks.ts : mêmes questions que les cartes codées à la main).
  modify(t: Target, k: string, mod: P.Mod, u: P.Until, text: string,
    upTo?: (tg: B.Targets, until: 'battle' | 'turn' | 'oppNextEnd', n: number) => B.Effect): B.Effect {
    if (t.zone !== 'field') return this.no(`${k} : cible hors du terrain (${t.zone})`, NOTHING);
    if (t.self) {
      if (t.stage) return this.no(`${k} : ce Lieu`, NOTHING);
      return P.modSelf(mod, u, this.src, text);
    }
    if (this.ownLeaderOnly(t)) return P.modOwnLeader({}, mod, u, this.src, text);
    if (this.ownLeaderFiltered(t)) return P.modOwnLeader(this.spec(t.filter, 'field'), mod, u, this.src, text);
    const tg = this.targets(t, k);
    if (upTo && t.upTo && t.count !== 'all' && u !== 'nextTurn') return upTo(tg, u, t.count);
    return P.modTargets(tg, mod, u, this.src, text, this.amountOf(t));
  }

  until(u: Duration, kind: string): 'battle' | 'turn' | 'oppNextEnd' {
    return u === 'battle' || u === 'turn' || u === 'oppNextEnd' ? u : this.no(`${kind} : durée ${u}`, 'turn');
  }

  // ---------- Conditions ----------

  cond(c: Cond): B.Condition {
    switch (c.kind) {
      case 'leaderIs': return B.any(...c.names.map(B.leaderNamed));
      case 'leaderType': return c.mode === 'all' ? B.all(...c.types.map(B.leaderType)) : B.any(...c.types.map(B.leaderType));
      case 'leaderTypeIncludes': return B.leaderTypeIncludes(c.part);
      case 'leaderColor': {
        const color = B.any(...c.colors.map(B.leaderColor));
        return c.multicolor ? B.all(color, (s, p) => def(s.players[p].leader.num).colors.length > 1) : color;
      }
      case 'leaderAttribute': return B.leaderAttribute(c.attribute);
      case 'life': return (s, p) => cmp(c.side === 'own' ? s.players[p].life.length : c.side === 'opp' ? s.players[other(p)].life.length
        : s.players[p].life.length + s.players[other(p)].life.length, c.cmp, c.n);
      case 'lifeVsOpp': return (s, p) => cmp2(s.players[p].life.length, c.cmp, s.players[other(p)].life.length);
      case 'hand': return (s, p) => cmp(s.players[c.side === 'own' ? p : other(p)].hand.length, c.cmp, c.n);
      case 'donField': return (s, p) => cmp(donOnField(s, c.side === 'own' ? p : other(p)), c.cmp, c.n);
      case 'donVsOpp': return (s, p) => cmp2(donOnField(s, p), c.cmp, donOnField(s, other(p)));
      case 'trash': {
        const spec = c.filter ? this.spec(c.filter, 'card') : undefined;
        return (s, p) => cmp(spec ? s.players[p].trash.filter((x) => B.cardMatches(x.num, spec)).length : s.players[p].trash.length, c.cmp, c.n);
      }
      case 'deck': return (s, p) => cmp(s.players[p].deck.length, c.cmp, c.n);
      case 'chars': {
        const spec = this.spec(c.filter, 'field');
        const sides = (p: PlayerId): PlayerId[] => (c.side === 'own' ? [p] : c.side === 'opp' ? [other(p)] : [p, other(p)]);
        return (s, p) => cmp(sides(p).reduce((k: number, q) => k + s.players[q].chars.filter((x) => B.matches(s, x, spec)).length, 0), c.cmp, c.n);
      }
      // cartes épuisées du terrain : Leader, Personnages, Lieu et DON!! épuisées de la zone de Coût (interprétation 1003)
      case 'fieldCards':
        if (c.rested !== true) return this.no(`condition fieldCards ${c.rested === false ? 'redressées' : 'toutes'}`, ALWAYS);
        return (s, p) => {
          const q = c.side === 'own' ? p : other(p);
          return cmp(allField(s, q).filter((x) => x.rested).length + s.players[q].donRested, c.cmp, c.n);
        };
      case 'selfState': return (s, _p, self) => {
        const f = findField(s, self);
        return Boolean(f) && (c.rested === undefined || f!.card.rested === c.rested) && (c.donMin === undefined || f!.card.don >= c.donMin);
      };
      case 'turn': return c.mine ? B.myTurn : B.oppTurn;
      case 'playedThisTurn': return (s, _p, self) => findField(s, self)?.card.playedTurn === s.turn;
      case 'firstTurns': return (s, p) => s.players[p].turns >= c.fromTurn;
      case 'and': return B.all(...c.all.map((x) => this.cond(x)));
      case 'or': return B.any(...c.any.map((x) => this.cond(x)));
      case 'not': return B.not(this.cond(c.cond));
      // seulement directement sur une étape (steps : BC.whenRevealed, qui voit l'effet en cours)
      case 'revealed': return this.no('condition revealed composée', ALWAYS);
      case 'manual': {
        const fn = this.manual?.conds?.[c.reason];
        if (!fn) return this.no(`condition manual:${c.reason} absente`, ALWAYS);
        return (s, p, self) => fn(readCtx(s, p, self, this.num));
      }
      default: return unreachable(c);
    }
  }

  // ---------- Coûts ----------

  costPart(c: CostPart): B.Cost {
    const none: B.Cost = { label: '', can: () => false, pay: () => false };
    switch (c.kind) {
      case 'donMinus': return B.donMinus(c.n);
      case 'restDon': return B.restDon(c.n);
      case 'restSelf': return B.restSelf();
      case 'trashSelf': return B.trashSelf();
      case 'discard': return B.discardCost(c.n, c.filter ? this.spec(c.filter, 'card') : undefined);
      case 'reveal': return B.revealCost(c.n, this.spec(c.filter ?? {}, 'card'));
      case 'trashTop': return B.trashTopCost(c.n);
      case 'lifeToHand': return B.lifeToHandCost(c.from === 'top' ? 'top' : 'both');
      case 'flipLife': return B.flipTopLife(c.faceUp);
      case 'trashOwnChar': return B.trashOwnCharCost(this.spec(c.filter, 'field'), c.n);
      case 'koOwnChar': return R.koOwnCharCost(this.spec(c.filter, 'field'), c.n);
      case 'bottomOwn': {
        const { category, ...rest } = c.filter;
        if (category?.length !== 1 || (category[0] !== 'CHARACTER' && category[0] !== 'STAGE')) return this.no('coût bottomOwn : catégorie', none);
        return R.bottomOwnCost(c.n, category[0], this.spec(rest, 'field'));
      }
      case 'returnOwnChar':
        if (c.n === 1 && !Object.keys(c.filter).length) return B.returnOwnChar();
        return R.returnOwnChars(c.n, this.spec(c.filter, 'field'));
      case 'restOwn':
        if (c.what === 'cards' && !c.filter) return B.restCost(c.n, 'cards');
        if (c.what === 'characters') return B.restCost(c.n, 'characters', c.filter ? this.spec(c.filter, 'field') : undefined);
        // un filtre exclut les DON!! (restCost) ; « votre Leader », « votre Lieu » : une carte de cette catégorie
        if (c.what === 'cards') return B.restCost(c.n, 'cards', this.spec(c.filter!, 'field'));
        return B.restCost(c.n, 'cards', { ...(c.filter ? this.spec(c.filter, 'field') : {}), categories: [c.what === 'leader' ? 'LEADER' : 'STAGE'] });
      case 'giveDon':
        if (c.n !== 1) return this.no('coût giveDon plusieurs', none);
        return B.giveActiveDon(this.targets(c.target, 'coût giveDon'));
      case 'trashToBottom': return B.trashToBottomCost(c.n, c.filter ? this.spec(c.filter, 'card') : {});
      case 'trashLife': return B.trashLifeCost(c.from === 'top' ? 'top' : 'both');
      // « give your 1 active Leader −N power » : le Leader doit être redressé (C2.2, comme Nami EB03-006)
      case 'leaderPowerMinus': return P.activeLeaderMinus(c.n, this.src);
      case 'selfToBottom': return B.selfToDeckBottom();
      case 'bounceSelf': return R.bounceSelfCost();
      case 'manual': {
        const m = this.manual?.costs?.[c.reason];
        if (!m) return this.no(`coût manual:${c.reason} absent`, none);
        return { label: 'payer le coût', can: (s, p, self) => m.canPay(readCtx(s, p, self, this.num)), pay: m.pay };
      }
      default: return unreachable(c);
    }
  }

  cost(parts: CostPart[]): B.Cost {
    const costs = parts.map((c) => this.costPart(c));
    return costs.length === 1 ? costs[0] : B.bothCosts(...costs);
  }

  // ---------- Actions ----------

  action(a: Action, ab: Ability): B.Effect {
    const src = this.src;
    const k = `action ${a.kind}`;
    switch (a.kind) {
      case 'ko':
        if (a.target.self) return a.target.leader || a.target.stage ? this.no(`${k} : ce Leader ou ce Lieu`, NOTHING) : R.removeSelf('ko');
        if (a.target.stage && !a.target.leader && !a.target.characters) {
          const f = a.target.filter;
          if (a.target.side !== 'opp' || a.target.count !== 1 || !a.target.upTo || f.costMax === undefined || Object.keys(f).length > 1) return this.no(`${k} : Lieu`, NOTHING);
          return B.koOppStage(f.costMax, src);
        }
        if (a.target.leader || a.target.stage) return this.no(`${k} : un Leader ou un Lieu`, NOTHING);
        return this.removal(a.target, k, 'ko', B.ko);
      case 'rest':
        if (a.target.self) return B.restThis();
        if (a.target.count === 'all') return B.restAll(this.targets(a.target, k));
        if (!a.target.upTo) return R.restTargets(this.targets(a.target, k), src, this.amount(a.target));
        return B.rest(this.targets(a.target, k), src, this.upToN(a.target, k));
      case 'setActive':
        if (a.target.self) return B.readySelf();
        if (a.target.count === 'all' || !a.target.upTo) return R.readyTargets(this.targets(a.target, k), src, this.amount(a.target));
        return B.setActiveTargets(this.targets(a.target, k), src, this.upToN(a.target, k));
      case 'bounce':
        if (a.target.self) return a.target.leader || a.target.stage ? this.no(`${k} : ce Leader ou ce Lieu`, NOTHING) : R.removeSelf('hand');
        if (a.target.leader || a.target.stage) return this.no(`${k} : un Leader ou un Lieu`, NOTHING);
        return this.removal(a.target, k, 'hand', B.bounce);
      case 'bottom':
        if (a.target.self) return a.target.leader || a.target.stage ? this.no(`${k} : ce Leader ou ce Lieu`, NOTHING) : R.removeSelf('deckBottom');
        if (a.target.leader || a.target.stage) return this.no(`${k} : un Leader ou un Lieu`, NOTHING);
        return this.removal(a.target, k, 'deckBottom', B.bottomOfDeck);
      case 'toLife': {
        if (a.target.self || a.target.leader || a.target.stage) return this.no(`${k} : ${a.target.self ? 'soi-même' : 'un Leader ou un Lieu'}`, NOTHING);
        // sans « where » (recette écrite avant C2.1) : la brique ne devine pas
        if (!a.where) return this.no(`${k} : dessus ou dessous non précisé`, NOTHING);
        // « jusqu'à 1 ... au-dessus ou au-dessous » : la brique de bricks.ts (Charlotte Katakuri OP03-123)
        if (a.where === 'topOrBottom' && a.target.upTo && a.target.count === 1) return B.toOwnersLife(this.targets(a.target, k), src, a.faceUp);
        return R.removeChars(this.targets(a.target, k), { life: a.where, faceUp: a.faceUp }, src, this.amount(a.target));
      }
      case 'trashChar':
        if (a.target.self) return a.target.leader || a.target.stage ? this.no(`${k} : ce Leader ou ce Lieu`, NOTHING) : B.trashThis();
        if (a.target.leader || a.target.stage) return this.no(`${k} : un Leader ou un Lieu`, NOTHING);
        return R.removeChars(this.targets(a.target, k), 'trash', src, this.amount(a.target));
      case 'power': {
        if (a.until === 'permanent') return this.no(`${k} : permanent hors effet permanent`, NOTHING);
        const u = this.until2(a.until, k);
        const verb = `${a.amount >= 0 ? `gagne +${a.amount}` : `reçoit −${-a.amount}`} de puissance`;
        if (u !== 'nextTurn') {
          if (a.target.self && a.target.zone === 'field' && !a.target.stage) return B.selfPowerMod(a.amount, u, src);
          if (this.ownLeaderOnly(a.target)) return B.leaderPower(a.amount, u, src);
        }
        // [Contre] « jusqu'à 1 de vos Leader ou Personnages gagne +X pendant ce combat » : la carte attaquée (interprétation 20)
        if (isDefenderPower(a, ab)) return B.defenderPower(a.amount, src);
        // « Puis, si ..., cette carte gagne encore +X pendant ce combat » : la même carte attaquée (C2.2) ; ailleurs, la
        // carte choisie avant n'est pas retenue par les briques
        if (a.target.that) {
          const prev = ab.steps.some((st) => 'action' in st && st.action !== a && isDefenderPower(st.action, ab));
          if (ab.timing !== 'counter' || a.until !== 'battle' || a.amount <= 0 || !prev) return this.no(`${k} : « cette carte » hors [Contre]`, NOTHING);
          return B.defenderPower(a.amount, src);
        }
        return this.modify(a.target, k, { stat: 'power', amount: a.amount }, u, verb, (tg, uu, n) => B.powerMod(tg, a.amount, uu, src, n));
      }
      case 'cost': {
        if (a.until === 'permanent') return this.no(`${k} : permanent hors effet permanent`, NOTHING);
        const u = this.until2(a.until, k);
        if (a.target.leader && !a.target.characters) return this.no(`${k} : un Leader n'a pas de coût`, NOTHING);
        const verb = `${a.amount >= 0 ? `gagne +${a.amount}` : `reçoit −${-a.amount}`} de coût`;
        return this.modify(a.target, k, { stat: 'cost', amount: a.amount }, u, verb,
          (tg, uu, n) => (uu === 'battle' ? P.modTargets(tg, { stat: 'cost', amount: a.amount }, uu, src, verb, { n }) : B.costMod(tg, a.amount, uu, src, n)));
      }
      // « la puissance de base de ... devient N » : modification 'basePower' (4-9-2-1 : la plus haute l'emporte si plusieurs)
      case 'powerSet': {
        if (a.until === 'permanent') return this.no(`${k} : permanent hors effet permanent`, NOTHING);
        return this.modify(a.target, k, { stat: 'basePower', amount: a.value }, this.until2(a.until, k), `a une puissance de base de ${a.value}`);
      }
      case 'keyword': {
        if (a.until === 'permanent') return this.no(`${k} : permanent hors effet permanent`, NOTHING);
        const u = this.until2(a.until, k);
        if (a.target.self && a.target.zone === 'field' && !a.target.stage && (u === 'turn' || u === 'battle')) return B.selfKeyword(a.keyword, src, u);
        if (this.ownLeaderOnly(a.target) && (u === 'turn' || u === 'battle')) return B.leaderKeyword(a.keyword, u, src);
        const text = `gagne [${KEYWORD_FR[a.keyword]}]`;
        return this.modify(a.target, k, { stat: 'keyword', keyword: a.keyword, amount: 0 }, u, text,
          (tg, uu, n) => B.grant(tg, { stat: 'keyword', keyword: a.keyword }, uu, src, text, n));
      }
      case 'cantAttack':
        if (a.what === 'leader') return this.no(`${k} : Leader seulement`, NOTHING);
        return this.grantOn(a.target, k, { stat: 'cantAttack' }, a.until, 'ne peut pas attaquer');
      case 'cantBlock':
        // « Votre adversaire ne peut pas activer [Bloqueur] pendant ce combat » ([En attaquant]) : la carte qui attaque est
        // imblocable pour le combat (comme blockerBan sans limite, bricks.ts)
        if (a.target.side === 'opp' && a.target.count === 'all' && !a.target.leader && !a.target.self) {
          const { powerMax, costMax, ...rest } = a.target.filter;
          if (ab.timing !== 'whenAttacking' || a.until !== 'battle' || Object.keys(rest).length) return this.no(`${k} : tous les Personnages adverses hors [En attaquant] pour le combat`, NOTHING);
          // « ... le [Bloqueur] d'un Personnage de 2000 de puissance ou moins » : blockerBan avec limite (Adio OP03-002)
          if (powerMax !== undefined || costMax !== undefined) return B.blockerBan({ ...(powerMax !== undefined ? { powerMax } : {}), ...(costMax !== undefined ? { costMax } : {}) }, src);
          return B.selfKeyword('Unblockable', src, 'battle');
        }
        return this.grantOn(a.target, k, { stat: 'noBlocker' }, a.until, 'ne peut pas activer [Bloqueur]');
      case 'cantBeKO': {
        if (a.byAttribute) return this.no(`${k} : par des cartes d'un attribut (hors effet permanent)`, NOTHING);
        const scope = a.by === 'battle' ? 'battle' : a.by === 'effect' ? 'effect' : a.by === 'oppEffect' ? 'oppEffect' : undefined;
        const how = a.by === 'battle' ? ' en combat' : a.by === 'effect' ? ' par un effet' : a.by === 'oppEffect' ? ' par un effet adverse' : '';
        return this.grantOn(a.target, k, { stat: 'cantBeKO', ...(scope ? { scope } : {}) }, a.until, `ne peut pas être mis KO${how}`);
      }
      case 'cantBeRested': return this.grantOn(a.target, k, { stat: 'cantRest' }, a.until, 'ne peut pas être épuisé');
      case 'cantLeave': return this.grantOn(a.target, k, { stat: 'cantLeave' }, a.until, 'ne peut pas quitter le terrain à cause des effets adverses');
      case 'attackActive': return this.grantOn(a.target, k, { stat: 'attackActive' }, a.until, 'peut aussi attaquer les Personnages redressés');
      case 'cantRefresh':
        // seulement des Personnages adverses déjà épuisés, pour la prochaine phase de Recharge adverse (keepRested)
        if (a.target.self || a.target.side !== 'opp' || a.target.filter.rested !== true) return this.no(`${k} : ${a.target.side === 'opp' ? 'cible non épuisée' : 'ses propres cartes'}`, NOTHING);
        return B.keepRested(this.targets(a.target, k), src, a.target.count === 'all' ? undefined : this.upToN(a.target, k));
      case 'negate': return this.grantOn(a.target, k, { stat: 'negated' }, a.until, 'perd ses effets');
      case 'draw': return B.drawCards(a.n);
      case 'discard':
        if (!a.filter && !a.upTo) return B.discard(a.n);
        return BC.discardSome(a.n, a.filter ? this.spec(a.filter, 'card') : undefined, Boolean(a.upTo), src);
      case 'oppDiscard': return B.oppDiscards(a.n);
      case 'trashTop': return a.side === 'own' ? B.trashTop(a.n) : BC.trashOppTop(a.n, src);
      case 'search': {
        if (!a.upTo) return this.no(`${k} : sans « jusqu'à »`, NOTHING);
        // les briques de bricks.ts pour ce qu'elles savent faire ; bricks-cards.ts (C2.3) pour les restes « au-dessus » et
        // « au-dessus ou au-dessous », plusieurs cartes à jouer, la carte prise sans être révélée, les cartes montrées
        const plain = !a.hidden && !a.shown && (a.rest === 'bottom' || a.rest === 'trash');
        if (a.dest === 'hand') {
          const spec = this.spec(a.filter, 'card');
          if (plain) return B.searchTop(a.look, a.take, spec, B.describeSpec(a.take > 1 ? 'cartes' : 'carte', spec), a.rest as 'bottom' | 'trash');
          return BC.lookTopTake(a.look, a.take, spec, a.rest, src, { hidden: a.hidden, shown: a.shown });
        }
        // jouer depuis le deck : seulement si le texte dit « Character card » (« play up to 1 [Upper Yard] » peut être un
        // Lieu : le nom seul ne suffit pas, interprétation n° 1663)
        if (a.dest === 'play' && a.filter.category?.length === 1 && a.filter.category[0] === 'CHARACTER' && !a.hidden) {
          const spec = this.spec({ ...a.filter, category: undefined }, 'card');
          if (plain && a.take === 1) return B.lookTopPlay(a.look, spec, src, { rested: a.rested, rest: a.rest as 'bottom' | 'trash' });
          return BC.lookTopPlayMany(a.look, a.take, spec, a.rest, src, { rested: a.rested, shown: a.shown });
        }
        return this.no(`${k} : vers ${a.dest}${a.dest === 'play' ? ' (pas « Character card »)' : ''}`, NOTHING);
      }
      case 'arrangeTop': return a.where === 'topOrBottom' ? B.lookTopArrange(a.look, src) : BC.lookTopReorder(a.look, a.where, src);
      case 'play': {
        if (a.from !== 'hand' && a.from !== 'trash') return this.no(`${k} : depuis ${a.from}`, NOTHING);
        if (a.count !== 1 || !a.upTo) return this.no(`${k} : ${a.count !== 1 ? 'plusieurs' : 'sans « jusqu\'à »'}`, NOTHING);
        if (!this.charactersOnly(a.filter)) return this.no(`${k} : autre chose qu'un Personnage`, NOTHING);
        const spec = this.spec({ ...a.filter, category: undefined }, 'card');
        return (a.from === 'hand' ? B.playFromHand : B.playFromTrash)(spec, src, { rested: a.rested });
      }
      case 'playSelf':
        if (ab.timing === 'trigger') return B.playThis({ rested: a.rested });
        if (ab.timing === 'onKO') return B.playSelfFromTrash(src, { rested: a.rested });
        return this.no(`${k} : moment ${ab.timing}`, NOTHING);
      case 'activate': return this.no(`${k} ${a.which}`, NOTHING);   // [Déclenchement] « activez l'effet [Principale] » : voir trigger()
      case 'trashToHand':
        if (a.count === 1 && a.upTo) return B.trashToHand(this.spec(a.filter, 'card'), src);
        return BC.trashToHandMany(a.count, a.upTo, this.spec(a.filter, 'card'), src);
      case 'trashToBottom': return BC.trashToDeckBottom(a.count, a.side, Boolean(a.upTo), this.spec(a.filter, 'card'), src);
      case 'addDon': return B.addDon(a.n, a.state);
      case 'readyDon': return B.readyDon(a.n);
      case 'giveDon':
        if (!a.rested) return this.no(`${k} : DON!! redressées`, NOTHING);
        if (a.target.count !== 1) return this.no(`${k} : plusieurs cartes`, NOTHING);
        return B.giveDon(this.targets(a.target, k), a.n, src);
      case 'returnDon': return this.no(`${k} ${a.side}`, NOTHING);
      case 'restDon': return this.no(`${k} ${a.side}`, NOTHING);
      // Vie (C2.5) : les briques de bricks.ts quand elles disent exactement la même chose (mêmes questions que les
      // cartes codées à la main), sinon celles de bricks-life.ts. « Jusqu'à N » cartes du deck vers la Vie, ou de la Vie
      // adverse : sans question (interprétation 381 et n° 1820)
      case 'lifeFromDeck':
        return a.n === 1 && !a.faceUp ? B.lifeFromDeck() : L.lifeFromDeckN(a.n, Boolean(a.faceUp), src);
      case 'lifeToHand':
        if (a.side === 'opp' && a.n === 1 && a.from === 'top') return B.oppLifeToHand();
        if (a.side === 'own' && a.n === 1 && a.from === 'top' && !a.upTo) return B.lifeIntoHand('top');
        return L.lifeToHandN(a.side, a.n, a.from, Boolean(a.upTo), src);
      case 'trashLife':
        if (a.side === 'opp' && a.from === 'top') return B.trashOppLife(a.n);
        return L.trashLifeN(a.side, a.n, a.from, Boolean(a.upTo), src);
      case 'lookLife': return a.side === 'any' && a.arrange ? B.lookLifeArrange(src) : this.no(`${k} ${a.side}${a.arrange ? '' : ' sans ranger'}`, NOTHING);
      case 'noLifeToHand': return L.noLifeToHandThisTurn(src);
      case 'reorderLife': return L.reorderLife(a.side, src);
      case 'handToBottom': return a.where ? BC.handToDeck(a.n, a.where, src) : B.handToBottom(a.n, src);
      case 'oppHandToBottom': return B.oppHandToBottom(a.n, src);
      case 'handToLife': return L.handToLifeN(a.n, this.spec(a.filter, 'card'), Boolean(a.faceUp), a.upTo, src);
      case 'noCharsThisTurn': return a.what === 'play' ? B.noCharactersThisTurn(src) : this.no(`${k} ${a.what}`, NOTHING);
      case 'trashSelfEnd': return B.trashAtEndOfTurn(src);
      case 'oppChooses': return this.no(`${k} ${a.action}`, NOTHING);
      case 'revealTop': return BC.revealTopCard(src);
      case 'playRevealed': return BC.playRevealed(src, { rested: a.rested });
      case 'revealedToBottom': return BC.revealedToBottom(src);
      case 'manual': {
        const fn = this.manual?.steps?.[a.reason];
        if (!fn) return this.no(`action manual:${a.reason} absente`, NOTHING);
        return B.effect(fn);
      }
      default: return unreachable(a);
    }
  }

  // Le filtre ne désigne que des cartes Personnage (les briques « jouer » ne jouent que des Personnages)
  charactersOnly(f: Filter): boolean {
    return !f.category || (f.category.length === 1 && f.category[0] === 'CHARACTER');
  }

  // « ... ne peut pas attaquer / être mis KO ... » sur une cible choisie, la carte elle-même ou le Leader
  grantOn(t: Target, k: string, mod: Parameters<typeof B.grant>[1], until: Duration, text: string): B.Effect {
    if (until === 'permanent') return this.no(`${k} : permanent hors effet permanent`, NOTHING);
    const u = this.until2(until, k);
    return this.modify(t, k, { amount: 0, ...mod }, u, text, (tg, uu, n) => B.grant(tg, mod, uu, this.src, text, n));
  }

  // ---------- Étapes et capacités ----------

  steps(list: Step[], ab: Ability): B.Effect {
    const parts: B.Effect[] = [];
    for (const st of list) {
      if (st.link === 'ifYouDo' || st.link === 'ifNotYouDo') this.no(`lien ${st.link}`, 0);
      let e: B.Effect;
      if ('action' in st) e = this.action(st.action, ab);
      else if ('chooseOne' in st) {
        e = B.chooseOne(this.src, st.chooseOne.map((option, i) => ({ label: this.optionLabel(option, i), effect: this.steps(option, ab) })));
      } else if ('may' in st) e = this.may(this.steps(st.may, ab));
      else e = this.steps(st.group, ab);
      if (st.cond?.kind === 'revealed') parts.push(BC.whenRevealed(this.spec(st.cond.filter, 'card'), e));
      else parts.push(st.cond ? B.when(this.cond(st.cond), e) : e);
    }
    return parts.length === 1 ? parts[0] : B.seq(...parts);
  }

  // « Vous pouvez ... » (sans coût) : proposé seulement si l'effet peut servir
  may(e: B.Effect): B.Effect {
    return B.withCost({ label: 'utiliser cet effet', can: (s, p, self) => e.useful(s, p, self), pay: () => true }, e, this.src);
  }

  // Libellé d'un choix de « Choisissez un » : l'action principale, en mots (sans texte de carte)
  optionLabel(option: Step[], i: number): string {
    const first = option.find((st): st is Extract<Step, { action: Action }> => 'action' in st)?.action;
    const label = first && actionLabel(first, (t) => this.targets(t, 'libellé').label);
    return label ? `${i + 1}. ${label}` : `Effet ${i + 1}`;
  }

  // Les verrous d'une capacité : [DON!! xN], [Votre tour], [Tour adverse], « Si ... » devant tout
  gates(ab: Ability, opts: { don?: boolean } = {}): B.Condition | undefined {
    const g: B.Condition[] = [];
    if (ab.condition) g.push(this.cond(ab.condition));
    if (ab.don && opts.don !== false) g.push(B.selfDon(ab.don));
    if (ab.yourTurn) g.push(B.myTurn);
    if (ab.oppTurn) g.push(B.oppTurn);
    return g.length === 0 ? undefined : g.length === 1 ? g[0] : B.all(...g);
  }

  // Capacité déclenchée : effet, coût facultatif, verrous ; [Une fois par tour] seulement avec un coût (onceWithCost)
  ability(ab: Ability, key: string, opts: { don?: boolean } = {}): B.Effect {
    let e = this.steps(ab.steps, ab);
    if (ab.cost) {
      const c = this.cost(ab.cost);
      const then = e;
      e = ab.oncePerTurn ? B.onceWithCost(key, c, then, this.src) : B.withCost(c, then, this.src);
      // convention : le coût n'est proposé que si l'effet peut servir (en-tête)
      e = B.when((s, p, self) => then.useful(s, p, self), e);
    } else if (ab.oncePerTurn) {
      // [Une fois par tour] sans coût (C2.2) : sur une carte du terrain seulement (la clé est rangée sur la carte)
      if (ab.timing === 'onPlay' || ab.timing === 'whenAttacking' || ab.timing === 'endOfTurn' || ab.timing === 'onOppAttack') e = P.oncePerTurn(key, e);
      else this.no(`[Une fois par tour] sans coût (${ab.timing})`, 0);
    }
    const g = this.gates(ab, opts);
    return g ? B.when(g, e) : e;
  }

  // [Déclenchement] : « jouez cette carte » et « activez l'effet [Principale] de cette carte » compris
  trigger(ab: Ability, main: B.Effect | undefined): B.Effect {
    const only = ab.steps.length === 1 && 'action' in ab.steps[0] && !ab.steps[0].cond ? ab.steps[0].action : undefined;
    if (only?.kind === 'activate' && only.which === 'main' && !ab.cost && !this.gates(ab)) {
      return main ?? this.no('[Déclenchement] « activez l\'effet [Principale] » sans effet [Principale]', NOTHING);
    }
    return this.ability(ab, 'trigger');
  }

  compile(r: Recipe): CardBehavior {
    const spec: B.CardSpec = {};
    const extra: CardBehavior = {};
    const statics: Ability[] = [];
    const add = (slot: 'onPlay' | 'whenAttacking' | 'onKO' | 'endOfTurn' | 'onMain' | 'onCounter' | 'onOpponentAttack', e: B.Effect) => {
      spec[slot] = spec[slot] ? B.seq(spec[slot]!, e) : e;
    };
    let trigger: Ability | undefined = r.trigger;
    r.abilities.forEach((ab, i) => {
      const key = `recipe:${i}`;
      switch (ab.timing) {
        case 'onPlay': add('onPlay', this.ability(ab, key)); break;
        case 'whenAttacking': add('whenAttacking', this.ability(ab, key)); break;
        case 'onKO': {
          // [DON!! xN] [En cas de KO] : lu au moment du KO, carte encore sur le terrain (CardBehavior.onKOCondition)
          if (ab.don) {
            const n = ab.don;
            const prev = extra.onKOCondition;
            extra.onKOCondition = (s, owner, card, cause, by) => card.don >= n && (prev?.(s, owner, card, cause, by) ?? true);
          }
          add('onKO', this.ability(ab, key, { don: false }));
          break;
        }
        case 'endOfTurn': add('endOfTurn', this.ability(ab, key)); break;
        case 'main': add('onMain', this.ability(ab, key)); break;
        case 'counter': add('onCounter', this.ability(ab, key)); break;
        case 'onOppAttack': add('onOpponentAttack', this.ability(ab, key)); break;
        case 'activateMain': {
          if (spec.activateMain) { this.no('deux effets [Activation : Principale]', 0); break; }
          const { cost, oncePerTurn, ...rest } = ab;
          spec.activateMain = {
            label: `${this.src} : effet [Activation : Principale]`,
            once: oncePerTurn,
            condition: this.gates(ab),
            cost: cost ? this.cost(cost) : undefined,
            effect: this.steps(rest.steps, ab),
          };
          break;
        }
        case 'trigger':
          if (trigger) this.no('deux [Déclenchement]', 0);
          trigger = ab;
          break;
        case 'static': statics.push(ab); break;
        case 'onBlock': case 'endOfOppTurn': case 'when':
          this.no(`moment ${ab.timing}${ab.event ? ` (${ab.event.on})` : ''}`, 0);
          break;
        default: unreachable(ab.timing);
      }
    });
    if (trigger) spec.onTrigger = this.trigger(trigger, spec.onMain);
    for (const ab of statics) this.static(ab, extra);
    return B.card(spec, extra);
  }

  // ---------- Effets permanents ----------

  // « [DON!! x1] Ce Personnage gagne +1000 / [Bloqueur] », « Tous vos Personnages {X} gagnent ... » : des fonctions de
  // CardBehavior (selfPower, aura, keywordAura...) lues par le moteur tant que les verrous sont vrais
  static(ab: Ability, extra: CardBehavior) {
    if (ab.cost || ab.oncePerTurn) { this.no('effet permanent avec coût ou [Une fois par tour]', 0); return; }
    for (const st of ab.steps) {
      if (!('action' in st)) { this.no('effet permanent : étape composée', 0); continue; }
      const gate = B.all(...[this.gates(ab), st.cond ? this.cond(st.cond) : undefined].filter((g): g is B.Condition => Boolean(g)));
      this.staticAction(st.action, gate, extra);
    }
  }

  staticAction(a: Action, gate: B.Condition, extra: CardBehavior) {
    const k = `effet permanent ${a.kind}`;
    if (!('target' in a) || ('until' in a && a.until !== 'permanent')) { this.no(k, 0); return; }
    const t = a.target;
    // « Si ..., donnez à cette carte de votre main −N de coût » (C2.2) : le coût à payer pour la jouer
    if (t.zone === 'hand' && t.self && a.kind === 'cost') {
      const n = a.amount;
      const prev = extra.handCost;
      extra.handCost = (s, p) => (gate(s, p, -1) ? n : 0) + (prev?.(s, p) ?? 0);
      return;
    }
    if (t.zone !== 'field' || t.stage) { this.no(`${k} : cible`, 0); return; }
    // les auras ne lisent ni puissance, ni coût, ni mot-clé (elles les calculent : le moteur tournerait en rond) : la
    // cible est lue sur ce qui est imprimé, plus son état (épuisée, DON!! données)
    const f = t.filter;
    if ([f.powerMax, f.powerMin, f.costMax, f.costMin, f.costEq, f.basePowerMax, f.basePowerMin].some((x) => x !== undefined)) { this.no(`${k} : filtre de puissance ou de coût`, 0); return; }
    if (!t.self && t.count !== 'all' && !this.ownLeaderOnly(t) && !this.ownLeaderFiltered(t)) { this.no(`${k} : cible choisie`, 0); return; }
    if (f.keyword || f.noKeyword || f.anyOf) { this.no(`${k} : filtre de mot-clé ou « ou »`, 0); return; }
    const { rested, donMin, ...onCard } = f;
    const printed = this.spec(onCard, 'card');
    const fits = (s: GameState, owner: PlayerId, source: FieldCard, target: FieldCard) => {
      if (t.self) return target.uid === source.uid;
      if (t.otherThanSelf && target.uid === source.uid) return false;
      const isLeader = Boolean(findField(s, target.uid)?.leader);
      return (isLeader ? Boolean(t.leader) : Boolean(t.characters) || (!t.leader && !t.stage)) && B.cardMatches(target.num, printed)
        && (rested === undefined || target.rested === rested) && (donMin === undefined || target.don >= donMin);
    };
    const on = (s: GameState, owner: PlayerId, source: FieldCard) => gate(s, owner, source.uid);
    switch (a.kind) {
      case 'power': {
        const n = a.amount;
        if (t.self) extra.selfPower = sum(extra.selfPower, (s, p, c) => (on(s, p, c) ? n : 0));
        else if (t.side === 'own') extra.aura = sum4(extra.aura, (s, p, src, tg) => (on(s, p, src) && fits(s, p, src, tg) ? n : 0));
        else if (t.side === 'opp') extra.oppAura = sum4(extra.oppAura, (s, p, src, tg) => (on(s, p, src) && fits(s, p, src, tg) ? n : 0));
        else this.no(`${k} : les deux joueurs`, 0);
        return;
      }
      case 'cost': {
        const n = a.amount;
        if (t.self) extra.selfCost = sum(extra.selfCost, (s, p, c) => (on(s, p, c) ? n : 0));
        else if (t.side === 'own' && !t.leader) extra.costAura = sum4(extra.costAura, (s, p, src, tg) => (on(s, p, src) && fits(s, p, src, tg) ? n : 0));
        else if (t.side === 'opp' && !t.leader) extra.oppCostAura = sum4(extra.oppCostAura, (s, p, src, tg) => (on(s, p, src) && fits(s, p, src, tg) ? n : 0));
        else this.no(`${k} : cible`, 0);
        return;
      }
      case 'keyword': {
        if (t.side !== 'own' && !t.self) { this.no(`${k} : cartes adverses`, 0); return; }
        const kw = a.keyword;
        const prev = extra.keywordAura;
        extra.keywordAura = (s, p, src, tg, kk) => (kk === kw && on(s, p, src) && fits(s, p, src, tg)) || (prev?.(s, p, src, tg, kk) ?? false);
        return;
      }
      case 'cantAttack': {
        if (!t.self) { this.no(`${k} : autre que soi-même`, 0); return; }
        const field = a.what === 'leader' ? 'cantAttackLeader' : 'cantAttack';
        const prev = extra[field];
        extra[field] = (s, p, c) => on(s, p, c) || (prev?.(s, p, c) ?? false);
        return;
      }
      case 'cantBeKO': {
        if (!t.self) { this.no(`${k} : autre que soi-même`, 0); return; }
        const by = a.by ?? 'any';
        const prev = extra.cantBeKO;
        // « ... en combat par des cartes <Tranche> » (C2.2) : la carte qui attaque a cet attribut (Buggy OP03-008 codé à la main)
        const attr = a.byAttribute !== undefined ? B.koImmuneInBattle({ attribute: a.byAttribute }) : undefined;
        if (attr && by !== 'battle') { this.no(`${k} : attribut hors combat`, 0); return; }
        extra.cantBeKO = (s, p, c, cause, who) => (on(s, p, c) && (attr ? attr(s, p, c, cause, who)
          : by === 'any' || by === cause || (by === 'oppEffect' && cause === 'effect' && who !== p))) || (prev?.(s, p, c, cause, who) ?? false);
        return;
      }
      // « Ce Personnage ne peut pas quitter le terrain à cause des effets adverses » (C2.2) : CardBehavior.cantLeave
      case 'cantLeave': {
        if (!t.self) { this.no(`${k} : autre que soi-même`, 0); return; }
        const prev = extra.cantLeave;
        extra.cantLeave = (s, p, c) => on(s, p, c) || (prev?.(s, p, c) ?? false);
        return;
      }
      default: this.no(k, 0);
    }
  }
}

// Contexte de lecture pour une condition ou un coût codés à la main, hors résolution d'un effet (l'IA demande si
// l'effet peut servir) : aucune question n'est permise
function readCtx(s: GameState, me: PlayerId, source: number, num: string): EffectCtx {
  return {
    s, me, opp: other(me), source, num, pending: { kind: 'system', action: 'read', source, num, controller: me, answers: [] },
    ask: () => { throw new Error(`${num} : question posée pendant une lecture`); },
  };
}

// [Contre] « jusqu'à 1 de vos Leader ou Personnages gagne +X pendant ce combat » : la carte attaquée (interprétation 20)
function isDefenderPower(a: Action, ab: Ability): boolean {
  return a.kind === 'power' && ab.timing === 'counter' && a.until === 'battle' && a.amount > 0 && !a.target.that && a.target.side === 'own'
    && Boolean(a.target.leader) && Boolean(a.target.characters) && a.target.count === 1 && a.target.upTo && !Object.keys(a.target.filter).length
    && !a.target.otherThanSelf;
}

const KEYWORD_FR: Record<string, string> = {
  Blocker: 'Bloqueur', Rush: 'Initiative', 'Rush: Character': 'Initiative : Personnage', 'Double Attack': 'Double attaque',
  Banish: 'Exil', Unblockable: 'Imblocable',
};

// Libellé court d'une action pour « Choisissez un » (null : libellé numéroté)
function actionLabel(a: Action, label: (t: Target) => string): string | null {
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
  switch (a.kind) {
    case 'ko': return a.target.self ? null : `Mettre KO : ${label(a.target)}`;
    case 'rest': return a.target.self ? null : `Épuiser : ${label(a.target)}`;
    case 'bounce': return `Renvoyer en main : ${label(a.target)}`;
    case 'bottom': return `Placer sous le deck : ${label(a.target)}`;
    case 'power': return `${a.amount >= 0 ? '+' : '−'}${Math.abs(a.amount)} de puissance${a.target.self ? '' : ` : ${label(a.target)}`}`;
    case 'cost': return `${a.amount >= 0 ? '+' : '−'}${Math.abs(a.amount)} de coût : ${label(a.target)}`;
    case 'draw': return `Piocher ${plural(a.n, 'carte')}`;
    case 'discard': return `Défausser ${plural(a.n, 'carte')}`;
    case 'oppDiscard': return `L'adversaire défausse ${plural(a.n, 'carte')}`;
    case 'search': return `Regarder ${plural(a.look, 'carte')} du dessus du deck`;
    case 'play': return `Jouer un Personnage ${a.from === 'hand' ? 'de la main' : 'de la Défausse'}`;
    case 'trashToHand': return 'Reprendre une carte de la Défausse';
    case 'addDon': return `Ajouter ${plural(a.n, 'DON!!')}`;
    case 'giveDon': return `Donner ${plural(a.n, 'DON!!')}`;
    case 'lifeFromDeck': return a.n > 1 ? `Ajouter ${plural(a.n, 'carte')} à la Vie` : 'Ajouter une carte à la Vie';
    case 'lifeToHand': return a.side === 'own' ? 'Prendre une carte de sa Vie en main' : 'Ajouter à sa main une carte de la Vie adverse';
    case 'trashLife': return a.side === 'own' ? 'Placer une carte de sa Vie dans la Défausse' : 'Placer une carte de la Vie adverse dans sa Défausse';
    case 'handToLife': return 'Placer une carte de sa main dans sa Vie';
    case 'reorderLife': return a.side === 'own' ? 'Remettre sa Vie dans l’ordre' : 'Remettre la Vie adverse dans l’ordre';
    default: return null;
  }
}

type Fn3 = (s: GameState, p: PlayerId, c: FieldCard) => number;
type Fn4 = (s: GameState, p: PlayerId, src: FieldCard, t: FieldCard) => number;
const sum = (a: Fn3 | undefined, b: Fn3): Fn3 => (a ? (s, p, c) => a(s, p, c) + b(s, p, c) : b);
const sum4 = (a: Fn4 | undefined, b: Fn4): Fn4 => (a ? (s, p, src, t) => a(s, p, src, t) + b(s, p, src, t) : b);

function unreachable(x: never): never {
  throw new Error(`recette : sorte inconnue ${JSON.stringify(x)}`);
}

// source : nom de la carte dans les questions et le journal (par défaut, son numéro)
export function compileRecipe(recipe: Recipe, manual?: ManualCode, source = recipe.num): CompileResult {
  const c = new Compiler(recipe.num, source, manual);
  let behavior: CardBehavior;
  try {
    behavior = c.compile(recipe);
  } catch (e) {
    return { ok: false, missing: [...c.missing, `erreur : ${(e as Error).message}`] };
  }
  return c.missing.length ? { ok: false, missing: c.missing } : { ok: true, behavior };
}
