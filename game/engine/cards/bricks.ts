// Briques d'effets : des morceaux d'effet qu'on assemble comme les phrases d'une carte (moment, coût, condition, cible,
// action). Chaque brique sait :
// - s'exécuter, avec les mêmes questions au joueur que les fonctions de rules.ts et common.ts (identifiants et ordre des
//   options stables : les parties enregistrées se rejouent) ;
// - dire si elle peut servir maintenant (useful) : l'IA, le coach et l'interface ne proposent pas un effet qui ne peut
//   rien faire ;
// - écrire son journal.
// Les conditions sont lues dans la partie au moment de l'effet, jamais supposées : une carte marche ou non selon son
// deck, comme à une vraie table.
import {
  addDonFromDeck, addMod, addTopDeckToLife, allField, basePower, canBeKO, canBeRested, canLeaveByEffect, canPlayCharacters, chooseUpTo1,
  bottomOrder, chooseUpToN, def, describe, discardFromHand, donOnField, draw, emit, fieldCost, findField, giveRestedDon, hasKeyword, knownFirst,
  lifeToHand, log, lookTopPick, may, other, playCharacter, power, privateLog, removeByEffect, removeFromField, restByEffect,
  returnDon, reveal, setActive, trashTopDeck, uniqueByNum, untilOpponentsNextEnd, untapDon,
} from '../rules.ts';
import type { Card, CardBehavior, CardData, Color, EffectCtx, FieldCard, GameState, Keyword, Modifier, PlayerId } from '../types.ts';
import { random } from '../rng.ts';
import { CARDS } from './index.ts';

// ---------- Effets, conditions, coûts ----------

export interface Effect {
  run(ctx: EffectCtx): void;
  // peut-il faire quelque chose maintenant ? (`self` : la carte qui porte l'effet)
  useful(s: GameState, p: PlayerId, self: number): boolean;
}

export type Condition = (s: GameState, p: PlayerId, self: number) => boolean;

// Coût facultatif « Vous pouvez [coût] : [effet] » (8-3) : payable ? puis le payer (faux : pas payé)
export interface Cost {
  label: string;
  can(s: GameState, p: PlayerId, self: number): boolean;
  pay(ctx: EffectCtx): boolean;
}

export const effect = (run: Effect['run'], useful: Effect['useful'] = () => true): Effect => ({ run, useful });

// « ... Puis, ... » : chaque partie se fait, même si la précédente n'a rien donné
export const seq = (...parts: Effect[]): Effect => ({
  run: (ctx) => { for (const e of parts) e.run(ctx); },
  useful: (s, p, self) => parts.some((e) => e.useful(s, p, self)),
});

// « Si ..., ... » : condition vérifiée au moment où l'effet se résout
export const when = (cond: Condition, then: Effect, otherwise?: Effect): Effect => ({
  run: (ctx) => {
    if (cond(ctx.s, ctx.me, ctx.source)) then.run(ctx);
    else otherwise?.run(ctx);
  },
  useful: (s, p, self) => (cond(s, p, self) ? then.useful(s, p, self) : otherwise?.useful(s, p, self) ?? false),
});

// « Vous pouvez [coût] : [effet] » : le joueur choisit de payer ou non (si le coût est payable)
export const withCost = (cost: Cost, then: Effect, source: string): Effect => ({
  run: (ctx) => {
    if (!cost.can(ctx.s, ctx.me, ctx.source)) return;
    if (!may(ctx, `${source} : ${cost.label} ?`)) return;
    if (cost.pay(ctx)) then.run(ctx);
  },
  useful: (s, p, self) => cost.can(s, p, self) && then.useful(s, p, self),
});

// [Une fois par tour] « Vous pouvez [coût] : [effet] » : l'effet compte comme utilisé quand le joueur paie (s'il refuse,
// il pourra s'en servir plus tard dans le tour). Plusieurs déclencheurs d'une carte partagent la même clé.
export const onceWithCost = (key: string, cost: Cost, then: Effect, source: string): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.usedOpt.includes(key) || !cost.can(ctx.s, ctx.me, ctx.source)) return;
    if (!may(ctx, `${source} : ${cost.label} ?`)) return;
    f.card.usedOpt.push(key);
    if (cost.pay(ctx)) then.run(ctx);
  },
  useful: (s, p, self) => !findField(s, self)?.card.usedOpt.includes(key) && cost.can(s, p, self) && then.useful(s, p, self),
});

// « Choisissez un effet parmi les suivants » (seuls ceux qui peuvent servir sont proposés)
export const chooseOne = (source: string, choices: { label: string; effect: Effect }[]): Effect => ({
  run: (ctx) => {
    const options = choices.flatMap((c, i) => (c.effect.useful(ctx.s, ctx.me, ctx.source) ? [{ id: `choice:${i}`, label: c.label }] : []));
    if (!options.length) return;
    const answer = ctx.ask({ prompt: `${source} : choisis un effet`, options, tag: 'chooseOne' });
    choices[Number(answer.split(':')[1])].effect.run(ctx);
  },
  useful: (s, p, self) => choices.some((c) => c.effect.useful(s, p, self)),
});

export const all = (...conds: Condition[]): Condition => (s, p, self) => conds.every((c) => c(s, p, self));
export const any = (...conds: Condition[]): Condition => (s, p, self) => conds.some((c) => c(s, p, self));
export const not = (cond: Condition): Condition => (s, p, self) => !cond(s, p, self);

// ---------- Conditions fréquentes ----------

export const leaderType = (type: string): Condition => (s, p) => def(s.players[p].leader.num).types.includes(type);
export const leaderTypeIncludes = (part: string): Condition => (s, p) => def(s.players[p].leader.num).types.some((t) => t.includes(part));
export const leaderNamed = (name: string): Condition => (s, p) => def(s.players[p].leader.num).names.includes(name);
export const leaderColor = (color: Color): Condition => (s, p) => def(s.players[p].leader.num).colors.includes(color);
export const leaderAttribute = (attribute: string): Condition => (s, p) => def(s.players[p].leader.num).attributes.includes(attribute);
export const oppLeaderAttribute = (attribute: string): Condition => (s, p) => def(s.players[other(p)].leader.num).attributes.includes(attribute);
export const lifeAtMost = (n: number): Condition => (s, p) => s.players[p].life.length <= n;
export const lifeAtLeast = (n: number): Condition => (s, p) => s.players[p].life.length >= n;
export const oppLifeAtMost = (n: number): Condition => (s, p) => s.players[other(p)].life.length <= n;
export const handAtMost = (n: number): Condition => (s, p) => s.players[p].hand.length <= n;
export const handAtLeast = (n: number): Condition => (s, p) => s.players[p].hand.length >= n;
export const oppHandAtLeast = (n: number): Condition => (s, p) => s.players[other(p)].hand.length >= n;
export const donOnFieldAtLeast = (n: number): Condition => (s, p) => donOnField(s, p) >= n;
export const donOnFieldAtMost = (n: number): Condition => (s, p) => donOnField(s, p) <= n;
export const trashAtLeast = (n: number): Condition => (s, p) => s.players[p].trash.length >= n;
export const charsAtLeast = (n: number, spec: CharSpec = {}): Condition => (s, p) => s.players[p].chars.filter((c) => matches(s, c, spec)).length >= n;
// « S'il y a un Personnage ayant un coût de N ou plus » : sur le terrain de l'un ou l'autre joueur
export const characterCostAtLeast = (n: number): Condition => (s) => s.players.some((P) => P.chars.some((c) => fieldCost(s, c.uid) >= n));
export const myTurn: Condition = (s, p) => s.active === p;
export const oppTurn: Condition = (s, p) => s.active !== p;
// [DON!! xN] : la carte qui porte l'effet a au moins N DON!! données
export const selfDon = (n: number): Condition => (s, _p, self) => (findField(s, self)?.card.don ?? 0) >= n;

// ---------- Cibles ----------

// Ce que dit le texte d'une carte : « Personnage de type {Marine} de coût 4 ou moins », « épuisé »...
export interface CharSpec {
  costMax?: number;        // coût actuel (avec les modifications)
  costMin?: number;
  baseCostMax?: number;    // coût de base (imprimé)
  powerMax?: number;       // puissance actuelle
  powerMin?: number;
  basePowerMax?: number;   // puissance de base (imprimée, ou fixée par un effet)
  basePowerMin?: number;
  type?: string;           // type exact, en VO ({Navy})
  typeIncludes?: string;   // « dont le type contient » (« CP » : CP9, CP0...)
  name?: string;           // nom en VO
  notName?: string;        // « autre que [X] »
  color?: Color;
  attribute?: string;      // en VO (Slash...)
  rested?: boolean;        // true : épuisé ; false : redressé
  trigger?: boolean;       // « ayant [Déclenchement] » (d'après le texte VO)
  keyword?: Keyword;       // « ayant [Bloqueur] » (sur le terrain : mot-clé actif, même donné par un effet)
}

// La carte correspond-elle au texte ? Sur le terrain : coût et puissance actuels ; ailleurs : ceux imprimés
function fits(d: CardData, cost: number, pw: number, base: number, rested: boolean | undefined, spec: CharSpec): boolean {
  return (spec.costMax === undefined || cost <= spec.costMax)
    && (spec.costMin === undefined || cost >= spec.costMin)
    && (spec.baseCostMax === undefined || (d.cost ?? 0) <= spec.baseCostMax)
    && (spec.powerMax === undefined || pw <= spec.powerMax)
    && (spec.powerMin === undefined || pw >= spec.powerMin)
    && (spec.basePowerMax === undefined || base <= spec.basePowerMax)
    && (spec.basePowerMin === undefined || base >= spec.basePowerMin)
    && (spec.type === undefined || d.types.includes(spec.type))
    && (spec.typeIncludes === undefined || d.types.some((t) => t.includes(spec.typeIncludes!)))
    && (spec.name === undefined || d.names.includes(spec.name))
    && (spec.notName === undefined || !d.names.includes(spec.notName))
    && (spec.color === undefined || d.colors.includes(spec.color))
    && (spec.attribute === undefined || d.attributes.includes(spec.attribute))
    && (spec.rested === undefined || rested === spec.rested)
    && (spec.trigger === undefined || Boolean(d.triggerEn) === spec.trigger);
}

export function matches(s: GameState, c: FieldCard, spec: CharSpec): boolean {
  const d = def(c.num);
  const f = findField(s, c.uid);
  const cost = f && !f.leader ? fieldCost(s, c.uid) : d.cost ?? 0;
  return fits(d, cost, f ? power(s, c.uid) : d.power ?? 0, f ? basePower(s, c.uid) : d.power ?? 0, c.rested, spec)
    && (spec.keyword === undefined || (f ? hasKeyword(s, f.player, c, spec.keyword) : d.keywords.includes(spec.keyword)));
}

// Même chose pour une carte hors du terrain (main, deck, Défausse)
export function cardMatches(num: string, spec: CharSpec & { category?: CardData['category'] }): boolean {
  const d = def(num);
  return (spec.category === undefined || d.category === spec.category) && fits(d, d.cost ?? 0, d.power ?? 0, d.power ?? 0, undefined, { ...spec, rested: undefined })
    && (spec.keyword === undefined || d.keywords.includes(spec.keyword));
}

// Libellé VF d'un type de la VO, d'après les cartes chargées (« Navy » -> « Marine »)
const typeLabelCache = new Map<string, string>();
export function typeLabel(type: string): string {
  const known = typeLabelCache.get(type);
  if (known) return known;
  for (const d of Object.values(CARDS)) {
    const i = d.types?.indexOf(type) ?? -1;
    if (i >= 0 && d.typeLabels?.[i]) {
      typeLabelCache.set(type, d.typeLabels[i]);
      return d.typeLabels[i];
    }
  }
  return type;
}

// Nom VF d'une carte d'après son nom VO (« Edward.Newgate » -> « Edward Newgate »), pris sur une carte à un seul nom
const nameLabelCache = new Map<string, string>();
export function nameLabel(name: string): string {
  const known = nameLabelCache.get(name);
  if (known) return known;
  const d = Object.values(CARDS).find((c) => c.names?.length === 1 && c.names[0] === name && c.lang === 'fr');
  if (!d) return name;
  nameLabelCache.set(name, d.name);
  return d.name;
}

const KEYWORD_FR: Record<Keyword, string> = {
  Blocker: 'Bloqueur', Rush: 'Initiative', 'Rush: Character': 'Initiative : Personnage', 'Double Attack': 'Double attaque',
  Banish: 'Exil', Unblockable: 'Imblocable',
};
const ATTRIBUTE_FR: Record<string, string> = { Slash: 'Tranche', Strike: 'Frappe', Ranged: 'Distance', Special: 'Spécial', Wisdom: 'Sagesse' };
const COLOR_FR: Record<Color, string> = { Red: 'rouge', Green: 'vert', Blue: 'bleu', Purple: 'violet', Black: 'noir', Yellow: 'jaune' };

// « Personnage adverse de type {Marine} de coût 4 ou moins »
export function describeSpec(what: string, spec: CharSpec): string {
  const parts = [what];
  if (spec.rested === true) parts.push('épuisé');
  if (spec.rested === false) parts.push('redressé');
  if (spec.color) parts.push(COLOR_FR[spec.color]);
  if (spec.type) parts.push(`de type {${typeLabel(spec.type)}}`);
  if (spec.typeIncludes) parts.push(`dont le type contient « ${typeLabel(spec.typeIncludes)} »`);
  if (spec.attribute) parts.push(`<${ATTRIBUTE_FR[spec.attribute] ?? spec.attribute}>`);
  if (spec.name) parts.push(`[${nameLabel(spec.name)}]`);
  if (spec.notName) parts.push(`autre que [${nameLabel(spec.notName)}]`);
  if (spec.costMax !== undefined) parts.push(`de coût ${spec.costMax} ou moins`);
  if (spec.costMin !== undefined) parts.push(`de coût ${spec.costMin} ou plus`);
  if (spec.baseCostMax !== undefined) parts.push(`de coût de base ${spec.baseCostMax} ou moins`);
  if (spec.powerMin !== undefined && spec.powerMin === spec.powerMax) parts.push(`de ${spec.powerMin} de puissance`);
  else {
    if (spec.powerMax !== undefined) parts.push(`de ${spec.powerMax} de puissance ou moins`);
    if (spec.powerMin !== undefined) parts.push(`de ${spec.powerMin} de puissance ou plus`);
  }
  if (spec.basePowerMin !== undefined && spec.basePowerMin === spec.basePowerMax) parts.push(`de ${spec.basePowerMin} de puissance de base`);
  else {
    if (spec.basePowerMax !== undefined) parts.push(`de ${spec.basePowerMax} de puissance de base ou moins`);
    if (spec.basePowerMin !== undefined) parts.push(`de ${spec.basePowerMin} de puissance de base ou plus`);
  }
  if (spec.trigger) parts.push('ayant [Déclenchement]');
  if (spec.keyword) parts.push(`ayant [${KEYWORD_FR[spec.keyword]}]`);
  return parts.join(' ');
}

// Ensemble de cartes visées : de quel côté, Leader et/ou Personnages, et ce que dit le texte
export interface Targets {
  side: 'own' | 'opp' | 'any';
  leader: boolean;
  characters: boolean;
  spec: CharSpec;
  label: string;
}

// Libellé écrit à la première lecture : les cartes sont décrites au chargement du module, avant les données des cartes
// (libellés VF des types)
const targets = (side: Targets['side'], leader: boolean, what: string, spec: CharSpec): Targets => {
  let label: string | undefined;
  return { side, leader, characters: true, spec, get label() { return (label ??= describeSpec(what, spec)); } };
};
export const oppChar = (spec: CharSpec = {}): Targets => targets('opp', false, 'Personnage adverse', spec);
export const ownChar = (spec: CharSpec = {}): Targets => targets('own', false, 'Personnage', spec);
export const anyChar = (spec: CharSpec = {}): Targets => targets('any', false, 'Personnage', spec);
export const oppLeaderOrChar = (spec: CharSpec = {}): Targets => targets('opp', true, 'Leader ou Personnage adverse', spec);
export const ownLeaderOrChar = (spec: CharSpec = {}): Targets => targets('own', true, 'Leader ou Personnage', spec);
export const ownLeader = (): Targets => ({ side: 'own', leader: true, characters: false, spec: {}, label: 'ton Leader' });
export const oppLeader = (): Targets => ({ side: 'opp', leader: true, characters: false, spec: {}, label: 'Leader adverse' });

export function candidates(s: GameState, p: PlayerId, t: Targets, extra: (c: FieldCard) => boolean = () => true): number[] {
  const sides = t.side === 'own' ? [p] : t.side === 'opp' ? [other(p)] : [other(p), p];
  return sides.flatMap((q) => [...(t.leader ? [s.players[q].leader] : []), ...(t.characters ? s.players[q].chars : [])])
    .filter((c) => matches(s, c, t.spec) && extra(c)).map((c) => c.uid);
}

const nameOf = (s: GameState, uid: number) => def(findField(s, uid)!.card.num).name;

// ---------- Actions sur des cartes du terrain ----------

// « Mettez KO des Personnages adverses ayant un coût total combiné de N ou moins » : le joueur les choisit un par un
// tant qu'il en reste un qui tient dans le total (sans « jusqu'à », il ne peut pas s'arrêter avant), puis ils sont mis
// KO ensemble
export const koTotalCost = (t: Targets, total: number, source: string): Effect => {
  const cost = (s: GameState, uid: number) => Math.max(0, fieldCost(s, uid));
  const list = (s: GameState, p: PlayerId, left: number, chosen: number[]) =>
    candidates(s, p, t, (c) => !chosen.includes(c.uid) && cost(s, c.uid) <= left && canBeKO(s, c.uid, 'effect', p) && canLeaveByEffect(s, c.uid, p));
  return {
    run: (ctx) => {
      const chosen: number[] = [];
      let left = total;
      for (let options = list(ctx.s, ctx.me, left, chosen); options.length; options = list(ctx.s, ctx.me, left, chosen)) {
        const answer = ctx.ask({
          prompt: `${source} : ${t.label} à mettre KO (coût total restant : ${left}) :`,
          options: options.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
          tag: 'oppKo',
        });
        const uid = Number(answer.split(':')[1]);
        chosen.push(uid);
        left -= cost(ctx.s, uid);
      }
      for (const uid of chosen) removeByEffect(ctx, uid, 'ko');
    },
    useful: (s, p) => list(s, p, total, []).length > 0,
  };
};

// « Mettez KO jusqu'à N ... »
// « Mettez KO jusqu'à N Personnages adverses ayant une puissance totale de X ou moins »
export const koTotalPower = (t: Targets, total: number, max: number, source: string): Effect => {
  const list = (s: GameState, p: PlayerId, left: number, chosen: number[]) =>
    candidates(s, p, t, (c) => !chosen.includes(c.uid) && power(s, c.uid) <= left && canBeKO(s, c.uid, 'effect', p) && canLeaveByEffect(s, c.uid, p));
  return {
    run: (ctx) => {
      const chosen: number[] = [];
      let left = total;
      for (let options = list(ctx.s, ctx.me, left, chosen); options.length && chosen.length < max; options = list(ctx.s, ctx.me, left, chosen)) {
        const answer = ctx.ask({
          prompt: `${source} : ${t.label} à mettre KO (puissance totale restante : ${left}) :`,
          options: [...options.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })), { id: 'none', label: 'Aucun autre' }],
          tag: 'oppKo',
        });
        if (answer === 'none') break;
        const uid = Number(answer.split(':')[1]);
        chosen.push(uid);
        left -= Math.max(0, power(ctx.s, uid));
      }
      for (const uid of chosen) removeByEffect(ctx, uid, 'ko');
    },
    useful: (s, p) => list(s, p, total, []).length > 0,
  };
};

// « Mettez KO jusqu'à 1 Lieu adverse ayant un coût de X ou moins » (le Lieu va dans la Défausse)
export const koOppStage = (costMax: number, source: string): Effect => effect((ctx) => {
  const stage = ctx.s.players[ctx.opp].stage;
  if (!stage || (def(stage.num).cost ?? 0) > costMax) return;
  const uid = chooseUpTo1(ctx, [stage.uid], `${source} : Lieu adverse de coût ${costMax} ou moins à mettre KO :`, 'oppKo');
  if (uid === null) return;
  const f = removeFromField(ctx.s, uid, 'trash');
  if (f) log(ctx.s, ctx.opp, `le Lieu ${def(f.card.num).name} est mis KO (${source})`);
}, (s, p) => {
  const stage = s.players[other(p)].stage;
  return Boolean(stage && (def(stage.num).cost ?? 0) <= costMax);
});

// Tour de fin de « jusqu'à la fin de votre prochain tour » (pendant son tour : le suivant des siens)
export const untilMyNextEnd = (s: GameState, me: PlayerId) => s.turn + (s.active === me ? 2 : 1);

export const ko = (t: Targets, source: string, n = 1): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => canBeKO(s, c.uid, 'effect', p) && canLeaveByEffect(s, c.uid, p));
  return {
    run: (ctx) => {
      for (const uid of chooseUpToN(ctx, list(ctx.s, ctx.me), n, `${source} : ${t.label} à mettre KO :`, t.side === 'opp' ? 'oppKo' : 'ko')) removeByEffect(ctx, uid, 'ko');
    },
    useful: (s, p) => list(s, p).length > 0,
  };
};

// « Épuisez jusqu'à N ... »
export const rest = (t: Targets, source: string, n = 1): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => !c.rested && canBeRested(s, c.uid));
  return {
    run: (ctx) => {
      for (const uid of chooseUpToN(ctx, list(ctx.s, ctx.me), n, `${source} : ${t.label} à épuiser :`, t.side === 'opp' ? 'oppRest' : 'rest')) restByEffect(ctx, uid);
    },
    useful: (s, p) => list(s, p).length > 0,
  };
};

// « Épuisez tous les ... »
export const restAll = (t: Targets): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => !c.rested && canBeRested(s, c.uid));
  return {
    run: (ctx) => { for (const uid of list(ctx.s, ctx.me)) restByEffect(ctx, uid); },
    useful: (s, p) => list(s, p).length > 0,
  };
};

// « Tous les ... épuisés ne pourront pas être redressés lors de la prochaine phase de Recharge de votre adversaire »
// (les cartes visées sont celles du moment : un Personnage épuisé ensuite sera redressé normalement) ; n : « jusqu'à N »
// au choix du joueur au lieu de « tous »
export const keepRested = (t: Targets, source: string, n?: number): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => c.rested);
  return {
    run: (ctx) => {
      // tour de la prochaine phase de Recharge adverse : le prochain tour si c'est le sien, sinon celui d'après
      const turn = ctx.s.turn + (ctx.s.active === ctx.me ? 1 : 2);
      const chosen = n === undefined ? list(ctx.s, ctx.me)
        : chooseUpToN(ctx, list(ctx.s, ctx.me), n, `${source} : ${t.label} qui ne pourra pas être redressé :`, 'oppLock');
      for (const uid of chosen) {
        addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: turn, source });
        log(ctx.s, ctx.me, `${nameOf(ctx.s, uid)} ne pourra pas être redressé lors de la prochaine phase de Recharge adverse (${source})`);
      }
    },
    useful: (s, p) => list(s, p).length > 0,
  };
};

// « Renvoyez jusqu'à N ... à la main de leur propriétaire » ; « placez ... au-dessous du deck de leur propriétaire »
const removal = (to: 'hand' | 'deckBottom', verb: string, tag: string) => (t: Targets, source: string, n = 1): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => canLeaveByEffect(s, c.uid, p));
  return {
    run: (ctx) => {
      for (const uid of chooseUpToN(ctx, list(ctx.s, ctx.me), n, `${source} : ${t.label} à ${verb} :`, tag)) removeByEffect(ctx, uid, to);
    },
    useful: (s, p) => list(s, p).length > 0,
  };
};
export const bounce = removal('hand', 'renvoyer dans la main de son propriétaire', 'bounce');
export const bottomOfDeck = removal('deckBottom', 'placer au-dessous du deck de son propriétaire', 'oppRemove');

const UNTIL_TEXT = (s: GameState, until: Modifier['until']) =>
  (until === 'battle' ? 'pour le combat' : until === 'turn' || until === s.turn ? 'pour le tour' : 'jusqu’à la fin du prochain tour adverse');

// « ... gagne +X de puissance » / « ... reçoit −X de puissance » (until : 'battle', 'turn' ou 'oppNextEnd')
export const powerMod = (t: Targets, amount: number, until: 'battle' | 'turn' | 'oppNextEnd', source: string, n = 1): Effect => ({
  run: (ctx) => {
    const verb = amount >= 0 ? `gagne +${amount}` : `reçoit −${-amount}`;
    const tag = t.side === 'opp' ? 'oppPower' : 'ownPower';
    for (const uid of chooseUpToN(ctx, candidates(ctx.s, ctx.me, t), n, `${source} : ${t.label} qui ${verb} de puissance :`, tag)) {
      const u = until === 'oppNextEnd' ? untilOpponentsNextEnd(ctx.s, ctx.me) : until;
      addMod(ctx.s, { uid, stat: 'power', amount, until: u, source });
      log(ctx.s, ctx.me, `${nameOf(ctx.s, uid)} ${verb} de puissance ${UNTIL_TEXT(ctx.s, u)} (${source})`);
    }
  },
  useful: (s, p) => candidates(s, p, t).length > 0,
});

// « ... reçoit −X de coût » / « +X de coût »
export const costMod = (t: Targets, amount: number, until: 'turn' | 'oppNextEnd', source: string, n = 1): Effect => ({
  run: (ctx) => {
    const verb = amount >= 0 ? `gagne +${amount}` : `reçoit −${-amount}`;
    for (const uid of chooseUpToN(ctx, candidates(ctx.s, ctx.me, t), n, `${source} : ${t.label} qui ${verb} de coût :`, t.side === 'opp' ? 'oppCost' : 'ownCost')) {
      const u = until === 'oppNextEnd' ? untilOpponentsNextEnd(ctx.s, ctx.me) : until;
      addMod(ctx.s, { uid, stat: 'cost', amount, until: u, source });
      log(ctx.s, ctx.me, `${nameOf(ctx.s, uid)} ${verb} de coût ${UNTIL_TEXT(ctx.s, u)} (${source})`);
    }
  },
  useful: (s, p) => candidates(s, p, t).length > 0,
});

// « La puissance de ... devient 0 » (4-12 : une baisse égale à sa puissance du moment)
export const powerToZero = (t: Targets, until: 'turn' | 'oppNextEnd', source: string): Effect => ({
  run: (ctx) => {
    const uid = chooseUpTo1(ctx, candidates(ctx.s, ctx.me, t), `${source} : ${t.label} dont la puissance devient 0 :`, 'oppBase0');
    if (uid === null) return;
    const u = until === 'oppNextEnd' ? untilOpponentsNextEnd(ctx.s, ctx.me) : until;
    addMod(ctx.s, { uid, stat: 'power', amount: -Math.max(0, power(ctx.s, uid)), until: u, source });
    log(ctx.s, ctx.me, `la puissance de ${nameOf(ctx.s, uid)} devient 0 ${UNTIL_TEXT(ctx.s, u)} (${source})`);
  },
  useful: (s, p) => candidates(s, p, t).length > 0,
});

// « ... ne peut pas attaquer / être épuisé / être mis KO ... », « gagne [Bloqueur] »...
export const grant = (t: Targets, mod: Pick<Modifier, 'stat' | 'keyword' | 'scope'>, until: 'battle' | 'turn' | 'oppNextEnd', source: string, text: string, n = 1): Effect => ({
  run: (ctx) => {
    for (const uid of chooseUpToN(ctx, candidates(ctx.s, ctx.me, t), n, `${source} : ${t.label} qui ${text} :`, t.side === 'opp' ? 'oppLock' : 'ownGrant')) {
      const u = until === 'oppNextEnd' ? untilOpponentsNextEnd(ctx.s, ctx.me) : until;
      addMod(ctx.s, { uid, amount: 0, until: u, source, ...mod });
      log(ctx.s, ctx.me, `${nameOf(ctx.s, uid)} ${text} ${UNTIL_TEXT(ctx.s, u)} (${source})`);
    }
  },
  useful: (s, p) => candidates(s, p, t).length > 0,
});

// « Redressez jusqu'à N ... »
export const setActiveTargets = (t: Targets, source: string, n = 1): Effect => {
  const list = (s: GameState, p: PlayerId) => candidates(s, p, t, (c) => c.rested);
  return {
    run: (ctx) => {
      for (const uid of chooseUpToN(ctx, list(ctx.s, ctx.me), n, `${source} : ${t.label} à redresser :`, 'ownReady')) setActive(ctx.s, ctx.me, uid);
    },
    useful: (s, p) => list(s, p).length > 0,
  };
};

// « Donnez jusqu'à N cartes DON!! épuisées à ... »
export const giveDon = (t: Targets, n: number, source: string): Effect => ({
  run: (ctx) => {
    if (ctx.s.players[ctx.me].donRested <= 0) return;
    const list = candidates(ctx.s, ctx.me, t);
    const uid = list.length === 1 ? list[0] : chooseUpTo1(ctx, list, `${source} : carte qui reçoit ${n} DON!! épuisée${n > 1 ? 's' : ''} :`, 'donTarget');
    if (uid !== null && uid !== undefined) giveRestedDon(ctx.s, ctx.me, uid, n);
  },
  useful: (s, p) => s.players[p].donRested > 0 && candidates(s, p, t).length > 0,
});

// ---------- Main, deck, Défausse, Vie, DON!! ----------

export const drawCards = (n: number): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const before = P.hand.length;
  draw(ctx.s, ctx.me, n);
  const k = P.hand.length - before;
  if (k) log(ctx.s, ctx.me, `pioche ${k} carte${k > 1 ? 's' : ''}`);
}, (s, p) => s.players[p].deck.length > 0);

// « Défaussez N cartes de votre main » (effet, pas coût)
export const discard = (n: number): Effect => effect((ctx) => { discardFromHand(ctx, ctx.me, n, 'Défausse 1 carte de ta main'); });

// « Votre adversaire défausse N cartes de sa main » (il choisit)
export const oppDiscards = (n: number): Effect => effect(
  (ctx) => { discardFromHand(ctx, ctx.opp, n, 'Défausse 1 carte de ta main (effet adverse)'); },
  (s, p) => s.players[other(p)].hand.length > 0,
);

// « Placez dans votre Défausse N cartes du dessus de votre deck »
export const trashTop = (n: number): Effect => effect((ctx) => {
  trashTopDeck(ctx.s, ctx.me, n);
  log(ctx.s, ctx.me, `place les ${n} cartes du dessus de son deck dans sa Défausse`);
});

// « Regardez X cartes du dessus de votre deck, révélez jusqu'à N cartes ... et ajoutez-les à votre main. Puis, placez
// les cartes restantes au-dessous de votre deck »
// rest : « Puis, placez les cartes restantes au-dessous de votre deck » (par défaut) ou « ... dans votre Défausse »
export const searchTop = (count: number, n: number, spec: CharSpec & { category?: CardData['category'] }, what: string, rest: 'bottom' | 'trash' = 'bottom'): Effect =>
  effect((ctx) => { lookTopPick(ctx, count, n, (num) => cardMatches(num, spec), what, rest); }, (s, p) => s.players[p].deck.length > 0);

// « Regardez N cartes du dessus de votre deck et jouez jusqu'à 1 carte Personnage ... Puis, placez les cartes restantes
// au-dessous de votre deck dans l'ordre de votre choix »
export const lookTopPlay = (count: number, spec: CharSpec, source: string, opts: { rested?: boolean } = {}): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const looked = P.deck.splice(0, count);
  const eligible = canPlayCharacters(ctx.s, ctx.me) ? uniqueByNum(looked.filter((c) => def(c.num).category === 'CHARACTER' && cardMatches(c.num, spec))) : [];
  const answer = eligible.length ? ctx.ask({
    prompt: `${source} : tu regardes ${looked.map((c) => def(c.num).name).join(', ')}. Jouer jusqu’à 1 ${describeSpec('Personnage', spec)} :`,
    options: [...eligible.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
    cards: looked.map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
  }) : 'none';
  log(ctx.s, ctx.me, `regarde ${count} cartes du dessus de son deck`);
  const played = answer === 'none' ? null : looked.splice(looked.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1)[0];
  const ordered = bottomOrder(ctx, looked);
  P.deck.push(...ordered);
  reveal(ctx.s, ordered.map((c) => c.uid), ctx.me);
  if (played) playCharacter(ctx, ctx.me, played, opts);
}, (s, p) => s.players[p].deck.length > 0 && canPlayCharacters(s, p));

// « Jouez jusqu'à 1 carte Personnage ... de votre main / Défausse » (sans payer son coût ; rested : « épuisée »)
const playFrom = (zone: 'hand' | 'trash') => (spec: CharSpec, source: string, opts: { rested?: boolean } = {}): Effect => {
  const eligible = (c: Card) => def(c.num).category === 'CHARACTER' && cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const list = zone === 'hand' ? P.hand : P.trash;
      if (!canPlayCharacters(ctx.s, ctx.me)) return;
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, list.filter(eligible)));
      if (!options.length) return;
      const where = zone === 'hand' ? 'de ta main' : 'de ta Défausse';
      const answer = ctx.ask({
        prompt: `${source} : jouer${opts.rested ? ' épuisé' : ''} jusqu’à 1 ${describeSpec('Personnage', spec)} ${where} :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const [card] = list.splice(list.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      playCharacter(ctx, ctx.me, card, opts);
    },
    useful: (s, p) => canPlayCharacters(s, p) && (zone === 'hand' ? s.players[p].hand : s.players[p].trash).some(eligible),
  };
};

// « Puis, vous ne pouvez pas jouer de carte Personnage pour tout le tour »
export const noCharactersThisTurn = (source: string): Effect => effect((ctx) => {
  ctx.s.players[ctx.me].noCharsTurn = ctx.s.turn;
  log(ctx.s, ctx.me, `ne peut plus jouer de carte Personnage ce tour-ci (${source})`);
}, () => false);
export const playFromHand = playFrom('hand');
export const playFromTrash = playFrom('trash');

// « Ajoutez jusqu'à 1 carte du dessus de votre deck au-dessus de votre Vie »
export const lifeFromDeck = (): Effect => effect((ctx) => { addTopDeckToLife(ctx.s, ctx.me); }, (s, p) => s.players[p].deck.length > 0);

// « Ajoutez à votre main 1 carte du dessus de votre Vie »
export const lifeIntoHand = (from: 'top' | 'bottom'): Effect => effect((ctx) => { lifeToHand(ctx.s, ctx.me, from); }, (s, p) => s.players[p].life.length > 0);

// « Ajoutez à la main de son propriétaire jusqu'à 1 carte du dessus de la Vie adverse » (pas des dégâts : pas de
// [Déclenchement])
export const oppLifeToHand = (): Effect => effect((ctx) => { lifeToHand(ctx.s, ctx.opp, 'top'); }, (s, p) => s.players[other(p)].life.length > 0);

// « Regardez N cartes du dessus de votre deck et ajoutez au-dessus de votre Vie jusqu'à 1 carte. Puis, placez les
// cartes restantes au-dessous de votre deck dans l'ordre de votre choix » (le joueur sait quelle carte il a placée)
export const lookTopToLife = (count: number, source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const looked = P.deck.splice(0, count);
  const answer = ctx.ask({
    prompt: `${source} : tu regardes ${looked.map((c) => def(c.num).name).join(', ')}. Carte à placer au-dessus de ta Vie :`,
    options: [...uniqueByNum(looked).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
    tag: 'lookToLife',
    cards: looked.map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
  });
  if (answer !== 'none') {
    const [card] = looked.splice(looked.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    P.life.unshift(card);
    reveal(ctx.s, [card.uid], ctx.me);
    log(ctx.s, ctx.me, `regarde ${count} cartes du dessus de son deck et en place 1 au-dessus de sa Vie (${P.life.length} Vie)`);
    privateLog(ctx.s, ctx.me, `carte placée au-dessus de ta Vie : ${def(card.num).name}`);
  } else {
    log(ctx.s, ctx.me, `regarde ${count} cartes du dessus de son deck`);
  }
  const ordered = bottomOrder(ctx, looked);
  P.deck.push(...ordered);
  reveal(ctx.s, ordered.map((c) => c.uid), ctx.me);
}, (s, p) => s.players[p].deck.length > 0);

// « Révélez 1 carte du dessus de votre deck ; si elle ..., ... » (elle reste au-dessus du deck, connue des deux joueurs)
export const revealTop = (test: (num: string) => boolean, then: Effect, source: string): Effect => ({
  run: (ctx) => {
    const top = ctx.s.players[ctx.me].deck[0];
    if (!top) return;
    reveal(ctx.s, [top.uid], 'both');
    log(ctx.s, ctx.me, `révèle ${def(top.num).name}, la carte du dessus de son deck (${source})`);
    if (test(top.num)) then.run(ctx);
  },
  useful: (s, p, self) => s.players[p].deck.length > 0 && then.useful(s, p, self),
});

// « Placez N cartes de votre main au-dessous de votre deck » (son propriétaire sait où elles sont)
export const handToBottom = (n: number, source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  for (let i = 0; i < n && P.hand.length; i++) {
    const answer = ctx.ask({
      prompt: `${source} : carte de ta main à placer au-dessous de ton deck${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
      options: uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand)).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'discard',
    });
    const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    P.deck.push(card);
    reveal(ctx.s, [card.uid], ctx.me);
    log(ctx.s, ctx.me, `place 1 carte de sa main au-dessous de son deck (${source})`);
  }
}, (s, p) => s.players[p].hand.length > 0);

// « Activez jusqu'à 1 Événement ... de votre main » : son effet [Principale] se résout après l'effet en cours, sans payer
// son coût
export const activateEventFromHand = (spec: CharSpec, source: string): Effect => {
  const eligible = (c: Card) => def(c.num).category === 'EVENT' && Boolean(def(c.num).onMain) && cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, ctx.s.players[ctx.me].hand.filter(eligible)));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: `${source} : activer jusqu’à 1 ${describeSpec('Événement', spec)} de ta main (sans payer son coût) :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const uid = Number(answer.split(':')[1]);
      const num = ctx.s.players[ctx.me].hand.find((c) => c.uid === uid)!.num;
      ctx.s.pending.unshift({ kind: 'system', action: 'activateEventFree', source: uid, num, controller: ctx.me, answers: [] });
    },
    useful: (s, p) => s.players[p].hand.some(eligible),
  };
};

// « Ce Personnage gagne [Initiative] pour tout le tour » (la carte qui porte l'effet)
export const selfKeyword = (keyword: Keyword, source: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, ctx.source);
  if (!f) return;
  addMod(ctx.s, { uid: ctx.source, stat: 'keyword', keyword, amount: 0, until: 'turn', source });
  log(ctx.s, ctx.me, `${def(f.card.num).name} gagne [${KEYWORD_FR[keyword]}] pour le tour (${source})`);
}, (s, _p, self) => Boolean(findField(s, self)));

// « Ajoutez à votre main jusqu'à 1 carte ... de votre Défausse » (carte connue de l'adversaire)
export const trashToHand = (spec: CharSpec & { category?: CardData['category'] }, source: string): Effect => {
  const eligible = (c: Card) => cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = uniqueByNum(P.trash.filter(eligible));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: `${source} : ajouter à ta main jusqu’à 1 ${describeSpec('carte', spec)} de ta Défausse :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
        tag: 'pick',
      });
      if (answer === 'none') return;
      const [card] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      P.hand.push(card);
      reveal(ctx.s, [card.uid], ctx.opp);
      log(ctx.s, ctx.me, `ajoute ${def(card.num).name} de sa Défausse à sa main`);
    },
    useful: (s, p) => s.players[p].trash.some(eligible),
  };
};

// « Regardez N cartes du dessus de votre deck, réorganisez-les dans l'ordre de votre choix et placez-les au-dessus ou
// au-dessous de votre deck » : pour chaque carte, dessus ou dessous, puis l'ordre de chaque groupe (le joueur les connaît)
export const lookTopArrange = (count: number, source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const looked = P.deck.splice(0, count);
  const top: Card[] = [];
  const bottom: Card[] = [];
  for (const c of looked) {
    const answer = ctx.ask({
      prompt: `${source} : tu regardes ${looked.map((x) => def(x.num).name).join(', ')}. Où placer ${def(c.num).name} ?`,
      options: [{ id: 'top', label: 'Au-dessus du deck' }, { id: 'bottom', label: 'Au-dessous du deck' }],
      tag: 'scry',
      cards: [{ uid: c.uid, num: c.num, owner: ctx.me }],
    });
    (answer === 'top' ? top : bottom).push(c);
  }
  // au-dessus : la première choisie sera la plus haute
  const ordered: Card[] = [];
  while (top.length >= 2) {
    const answer = ctx.ask({
      prompt: `${source} : carte à placer tout en haut de ton deck :`,
      options: top.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
      tag: 'scry',
      cards: top.map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    ordered.push(...top.splice(top.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
  }
  P.deck.unshift(...ordered, ...top);
  P.deck.push(...bottomOrder(ctx, bottom));
  reveal(ctx.s, looked.map((c) => c.uid), ctx.me);
  log(ctx.s, ctx.me, `regarde ${looked.length} cartes du dessus de son deck et en place ${looked.length - bottom.length} au-dessus, ${bottom.length} au-dessous`);
}, (s, p) => s.players[p].deck.length > 0);

// « Défaussez N cartes de la main adverse » : choisies au hasard (le joueur ne voit pas la main adverse)
export const trashFromOppHand = (n: number, source: string): Effect => effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  const names: string[] = [];
  for (let i = 0; i < n && O.hand.length; i++) {
    const [card] = O.hand.splice(Math.floor(random(ctx.s) * O.hand.length), 1);
    O.trash.push(card);
    names.push(def(card.num).name);
  }
  if (!names.length) return;
  O.discardedTurn = ctx.s.turn;
  log(ctx.s, ctx.me, `défausse au hasard ${names.join(', ')} de la main adverse (${source})`);
  emit(ctx.s, { type: 'discard', player: ctx.opp, count: names.length, by: ctx.me, sourceNum: ctx.num });
}, (s, p) => s.players[other(p)].hand.length > 0);

// « Ajoutez jusqu'à N cartes DON!! de votre deck DON!! et redressez-les / épuisez-les »
export const addDon = (n: number, state: 'active' | 'rested'): Effect =>
  effect((ctx) => { addDonFromDeck(ctx.s, ctx.me, n, state === 'active'); }, (s, p) => s.players[p].donDeck > 0);

// « Redressez jusqu'à N de vos cartes DON!! »
export const readyDon = (n: number): Effect => effect((ctx) => { untapDon(ctx.s, ctx.me, n); }, (s, p) => s.players[p].donRested > 0);

// ---------- Coûts ----------

// DON!! −X : renvoyer X DON!! de son terrain au deck DON!!
export const donMinus = (n: number): Cost => ({
  label: `renvoyer ${n} DON!! dans ton deck DON!!`,
  can: (s, p) => donOnField(s, p) >= n,
  pay: (ctx) => returnDon(ctx.s, ctx.me, n),
});

// « Défausser N cartes de votre main » (libellé écrit à la lecture : types en VF, voir targets)
export const discardCost = (n: number, spec?: CharSpec & { category?: CardData['category'] }): Cost => ({
  get label() { return `défausser ${n} ${spec ? describeSpec(n > 1 ? 'cartes' : 'carte', spec) : `carte${n > 1 ? 's' : ''}`} de ta main`; },
  can: (s, p) => s.players[p].hand.filter((c) => !spec || cardMatches(c.num, spec)).length >= n,
  pay: (ctx) => discardFromHand(ctx, ctx.me, n, 'Carte à défausser :', spec ? (c) => cardMatches(c.num, spec) : undefined) === n,
});

// « Révéler N cartes de votre main ... » : l'adversaire les connaît ensuite (tant qu'elles restent en main)
export const revealCost = (n: number, spec: CharSpec & { category?: CardData['category'] }): Cost => ({
  get label() { return `révéler ${n} ${describeSpec(n > 1 ? 'cartes' : 'carte', spec)} de ta main`; },
  can: (s, p) => s.players[p].hand.filter((c) => cardMatches(c.num, spec)).length >= n,
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const shown: Card[] = [];
    for (let i = 0; i < n; i++) {
      const left = P.hand.filter((c) => cardMatches(c.num, spec) && !shown.includes(c));
      if (!left.length) return false;
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, left));
      const answer = ctx.ask({
        prompt: `Carte à révéler (${i + 1}/${n}) :`,
        options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
        tag: 'revealCost',
      });
      shown.push(left.find((c) => c.uid === Number(answer.split(':')[1]))!);
    }
    reveal(ctx.s, shown.map((c) => c.uid), ctx.opp);
    log(ctx.s, ctx.me, `révèle ${shown.map((c) => def(c.num).name).join(', ')} de sa main`);
    return true;
  },
});

// « Épuiser cette carte »
export const restSelf = (): Cost => ({
  label: 'épuiser cette carte',
  can: (s, _p, self) => { const f = findField(s, self); return Boolean(f && !f.card.rested && canBeRested(s, self)); },
  pay: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.rested) return false;
    f.card.rested = true;
    log(ctx.s, ctx.me, `épuise ${def(f.card.num).name}`);
    return true;
  },
});

// « Épuiser N de vos cartes DON!! » (➀ : DON!! redressées de la zone de Coût)
export const restDon = (n: number): Cost => ({
  label: `épuiser ${n} de tes DON!!`,
  can: (s, p) => s.players[p].donActive >= n,
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    if (P.donActive < n) return false;
    P.donActive -= n;
    P.donRested += n;
    log(ctx.s, ctx.me, `épuise ${n} DON!!`);
    return true;
  },
});

// « Placer dans votre Défausse N cartes du dessus de votre deck »
export const trashTopCost = (n: number): Cost => ({
  label: `placer ${n} cartes du dessus de ton deck dans ta Défausse`,
  can: (s, p) => s.players[p].deck.length >= n,
  pay: (ctx) => {
    if (ctx.s.players[ctx.me].deck.length < n) return false;
    trashTopDeck(ctx.s, ctx.me, n);
    log(ctx.s, ctx.me, `place les ${n} cartes du dessus de son deck dans sa Défausse`);
    return true;
  },
});

// « Placer ce Personnage dans votre Défausse »
export const trashSelf = (): Cost => ({
  label: 'placer cette carte dans ta Défausse',
  can: (s, _p, self) => Boolean(findField(s, self)),
  pay: (ctx) => {
    const f = removeFromField(ctx.s, ctx.source, 'trash');
    if (!f) return false;
    log(ctx.s, ctx.me, `place ${def(f.card.num).name} dans sa Défausse`);
    return true;
  },
});

// « Placer ce Personnage au-dessous du deck de son propriétaire »
export const selfToDeckBottom = (): Cost => ({
  label: 'placer cette carte au-dessous de ton deck',
  can: (s, _p, self) => Boolean(findField(s, self)),
  pay: (ctx) => {
    const f = removeFromField(ctx.s, ctx.source, 'deckBottom');
    if (!f) return false;
    reveal(ctx.s, [f.card.uid], 'both');
    log(ctx.s, ctx.me, `place ${def(f.card.num).name} au-dessous de son deck`);
    return true;
  },
});

// « Placer N cartes (de type ...) de votre Défausse au-dessous de votre deck dans l'ordre de votre choix » (cartes
// publiques : les deux joueurs savent qu'elles sont au-dessous)
export const trashToBottomCost = (n: number, spec: CharSpec & { category?: CardData['category'] } = {}): Cost => {
  const eligible = (c: Card) => cardMatches(c.num, spec);
  return {
    get label() { return `placer ${n} ${describeSpec(n > 1 ? 'cartes' : 'carte', spec)} de ta Défausse au-dessous de ton deck`; },
    can: (s, p) => s.players[p].trash.filter(eligible).length >= n,
    pay: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const chosen: Card[] = [];
      for (let i = 0; i < n; i++) {
        const left = uniqueByNum(P.trash.filter((c) => eligible(c) && !chosen.includes(c)));
        if (!left.length) return false;
        const answer = left.length === 1 ? `card:${left[0].uid}` : ctx.ask({
          prompt: `Carte de ta Défausse à placer au-dessous de ton deck (${i + 1}/${n}) :`,
          options: left.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
          tag: 'trashToDeck',
        });
        chosen.push(P.trash.find((c) => c.uid === Number(answer.split(':')[1]))!);
      }
      P.trash = P.trash.filter((c) => !chosen.includes(c));
      const ordered = bottomOrder(ctx, chosen);
      P.deck.push(...ordered);
      reveal(ctx.s, ordered.map((c) => c.uid), 'both');
      log(ctx.s, ctx.me, `place ${ordered.map((c) => def(c.num).name).join(', ')} de sa Défausse au-dessous de son deck`);
      return true;
    },
  };
};

// « Épuiser 1 de vos Leaders ou Lieux de type {X} »
export const restLeaderOrStage = (type: string): Cost => {
  const list = (s: GameState, p: PlayerId) => [s.players[p].leader, ...(s.players[p].stage ? [s.players[p].stage!] : [])]
    .filter((c) => def(c.num).types.includes(type) && !c.rested && canBeRested(s, c.uid));
  return {
    get label() { return `épuiser ton Leader ou ton Lieu de type {${typeLabel(type)}}`; },
    can: (s, p) => list(s, p).length > 0,
    pay: (ctx) => {
      const options = list(ctx.s, ctx.me);
      if (!options.length) return false;
      const uid = options.length === 1 ? options[0].uid : Number(ctx.ask({
        prompt: 'Carte à épuiser pour payer le coût :',
        options: options.map((c) => ({ id: `card:${c.uid}`, label: describe(ctx.s, c.uid), uid: c.uid })),
        tag: 'restCost',
      }).split(':')[1]);
      const f = findField(ctx.s, uid)!;
      f.card.rested = true;
      log(ctx.s, ctx.me, `épuise ${def(f.card.num).name}`);
      return true;
    },
  };
};

// « Donner 1 de vos cartes DON!! redressées à ... »// « Donner 1 de vos cartes DON!! redressées à ... »
export const giveActiveDon = (t: Targets): Cost => ({
  label: `donner 1 de tes DON!! redressées (${t.label})`,
  can: (s, p) => s.players[p].donActive > 0 && candidates(s, p, t).length > 0,
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const list = candidates(ctx.s, ctx.me, t);
    if (P.donActive <= 0 || !list.length) return false;
    const answer = list.length === 1 ? `card:${list[0]}` : ctx.ask({
      prompt: 'Carte qui reçoit 1 DON!! redressée :',
      options: list.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
      tag: 'donTarget',
    });
    const f = findField(ctx.s, Number(answer.split(':')[1]))!;
    P.donActive--;
    f.card.don++;
    log(ctx.s, ctx.me, `donne 1 DON!! à ${def(f.card.num).name}`);
    return true;
  },
});

// « Épuiser N de vos cartes » (Leader, Personnages, Lieu ou DON!! redressées de la zone de Coût) ; « Épuiser N de vos
// Personnages » : le joueur les choisit une à une
export const restCost = (n: number, what: 'cards' | 'characters'): Cost => {
  const field = (s: GameState, p: PlayerId) => (what === 'cards' ? allField(s, p) : s.players[p].chars).filter((c) => !c.rested && canBeRested(s, c.uid));
  const dons = (s: GameState, p: PlayerId) => (what === 'cards' ? s.players[p].donActive : 0);
  return {
    label: `épuiser ${n} de tes ${what === 'cards' ? 'cartes' : 'Personnages'}`,
    can: (s, p) => field(s, p).length + dons(s, p) >= n,
    pay: (ctx) => {
      const P = ctx.s.players[ctx.me];
      for (let i = 0; i < n; i++) {
        const options = [
          ...field(ctx.s, ctx.me).map((c) => ({ id: `card:${c.uid}`, label: describe(ctx.s, c.uid), uid: c.uid })),
          ...(dons(ctx.s, ctx.me) > 0 ? [{ id: 'don', label: '1 DON!! redressée' }] : []),
        ];
        if (!options.length) return false;
        const answer = ctx.ask({ prompt: `Carte à épuiser pour payer le coût${n > 1 ? ` (${i + 1}/${n})` : ''} :`, options, tag: 'restCost' });
        if (answer !== 'don') restByEffect(ctx, Number(answer.split(':')[1]));
        else {
          P.donActive--;
          P.donRested++;
          log(ctx.s, ctx.me, 'épuise 1 DON!!');
        }
      }
      return true;
    },
  };
};

// « Renvoyer 1 de vos Personnages à la main de son propriétaire » (la carte qui porte l'effet comprise)
// (notSelf : « autre que celui-ci »)
export const returnOwnChar = (notSelf = false): Cost => ({
  label: `renvoyer 1 de tes Personnages${notSelf ? ' (autre que celui-ci)' : ''} dans ta main`,
  can: (s, p, self) => s.players[p].chars.some((c) => !notSelf || c.uid !== self),
  pay: (ctx) => {
    const list = ctx.s.players[ctx.me].chars.filter((c) => !notSelf || c.uid !== ctx.source).map((c) => c.uid);
    if (!list.length) return false;
    const answer = ctx.ask({
      prompt: 'Personnage à renvoyer dans ta main :',
      options: list.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
      tag: 'returnOwn',
    });
    return removeByEffect(ctx, Number(answer.split(':')[1]), 'hand');
  },
});

// Plusieurs coûts à payer ensemble (« ... et ... »)
export const bothCosts = (...costs: Cost[]): Cost => ({
  get label() { return costs.map((c) => c.label).join(' et '); },
  can: (s, p, self) => costs.every((c) => c.can(s, p, self)),
  pay: (ctx) => costs.every((c) => c.pay(ctx)),
});

// ---------- Une carte faite de briques ----------

export interface CardSpec {
  onPlay?: Effect;
  whenAttacking?: Effect;
  onKO?: Effect;
  endOfTurn?: Effect;
  onMain?: Effect;      // Événement [Principale]
  onCounter?: Effect;   // Événement [Contre]
  onTrigger?: Effect;   // [Déclenchement]
  onOpponentAttack?: Effect;  // [Attaque adverse]
  // condition : l'effet ne peut être activé que si elle est vraie (« À partir de votre deuxième tour »)
  activateMain?: { label: string; once?: boolean; condition?: Condition; cost?: Cost; effect: Effect };
}

// Comportement d'une carte à partir de ses briques ; les aides à l'IA (effet utile ou non) en découlent
export function card(spec: CardSpec, extra: CardBehavior = {}): CardBehavior {
  const b: CardBehavior = { ...extra };
  if (spec.onPlay) b.onPlay = spec.onPlay.run;
  if (spec.whenAttacking) {
    const e = spec.whenAttacking;
    b.whenAttacking = e.run;
    b.attackUseful ??= (s, p, self) => e.useful(s, p, self.uid);
  }
  if (spec.onKO) b.onKO = spec.onKO.run;
  if (spec.endOfTurn) b.endOfTurn = spec.endOfTurn.run;
  if (spec.onMain) {
    const e = spec.onMain;
    b.onMain = e.run;
    b.mainUseful ??= (s, p) => e.useful(s, p, -1);
  }
  if (spec.onCounter) b.onCounter = spec.onCounter.run;
  if (spec.onTrigger) b.onTrigger = spec.onTrigger.run;
  if (spec.onOpponentAttack) b.onOpponentAttack = { run: spec.onOpponentAttack.run };
  if (spec.activateMain) {
    const { label, once = false, condition, cost, effect: e } = spec.activateMain;
    b.activateMain = {
      oncePerTurn: once,
      label,
      canActivate: (s, p, self) => (condition?.(s, p, self.uid) ?? true) && (cost?.can(s, p, self.uid) ?? true),
      useful: (s, p, self) => e.useful(s, p, self.uid),
      run: (ctx, self) => {
        if (once) self.usedOpt.push('main');
        if (!cost || cost.pay(ctx)) e.run(ctx);
      },
    };
  }
  return b;
}

