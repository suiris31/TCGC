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
  addDonFromDeck, addMod, addTopDeckToLife, canBeKO, canBeRested, canLeaveByEffect, chooseUpTo1, chooseUpToN, def,
  discardFromHand, donOnField, draw, fieldCost, findField, giveRestedDon, knownFirst, lifeToHand, log, lookTopPick, may,
  other, playCharacter, power, removeByEffect, restByEffect, returnDon, setActive, trashTopDeck, uniqueByNum,
  untilOpponentsNextEnd, untapDon,
} from '../rules.ts';
import type { Card, CardBehavior, CardData, Color, EffectCtx, FieldCard, GameState, Modifier, PlayerId } from '../types.ts';
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
  basePowerMax?: number;
  type?: string;           // type exact, en VO ({Navy})
  typeIncludes?: string;   // « dont le type contient » (« CP » : CP9, CP0...)
  name?: string;           // nom en VO
  notName?: string;        // « autre que [X] »
  color?: Color;
  attribute?: string;      // en VO (Slash...)
  rested?: boolean;        // true : épuisé ; false : redressé
}

// La carte correspond-elle au texte ? Sur le terrain : coût et puissance actuels ; ailleurs : ceux imprimés
function fits(d: CardData, cost: number, pw: number, rested: boolean | undefined, spec: CharSpec): boolean {
  return (spec.costMax === undefined || cost <= spec.costMax)
    && (spec.costMin === undefined || cost >= spec.costMin)
    && (spec.baseCostMax === undefined || (d.cost ?? 0) <= spec.baseCostMax)
    && (spec.powerMax === undefined || pw <= spec.powerMax)
    && (spec.powerMin === undefined || pw >= spec.powerMin)
    && (spec.basePowerMax === undefined || (d.power ?? 0) <= spec.basePowerMax)
    && (spec.type === undefined || d.types.includes(spec.type))
    && (spec.typeIncludes === undefined || d.types.some((t) => t.includes(spec.typeIncludes!)))
    && (spec.name === undefined || d.names.includes(spec.name))
    && (spec.notName === undefined || !d.names.includes(spec.notName))
    && (spec.color === undefined || d.colors.includes(spec.color))
    && (spec.attribute === undefined || d.attributes.includes(spec.attribute))
    && (spec.rested === undefined || rested === spec.rested);
}

export function matches(s: GameState, c: FieldCard, spec: CharSpec): boolean {
  const d = def(c.num);
  const f = findField(s, c.uid);
  const cost = f && !f.leader ? fieldCost(s, c.uid) : d.cost ?? 0;
  return fits(d, cost, f ? power(s, c.uid) : d.power ?? 0, c.rested, spec);
}

// Même chose pour une carte hors du terrain (main, deck, Défausse)
export function cardMatches(num: string, spec: CharSpec & { category?: CardData['category'] }): boolean {
  const d = def(num);
  return (spec.category === undefined || d.category === spec.category) && fits(d, d.cost ?? 0, d.power ?? 0, undefined, { ...spec, rested: undefined });
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

const ATTRIBUTE_FR: Record<string, string> = { Slash: 'Tranche', Strike: 'Frappe', Ranged: 'Distance', Special: 'Spécial', Wisdom: 'Sagesse' };
const COLOR_FR: Record<Color, string> = { Red: 'rouge', Green: 'vert', Blue: 'bleu', Purple: 'violet', Black: 'noir', Yellow: 'jaune' };

// « Personnage adverse de type {Marine} de coût 4 ou moins »
export function describeSpec(what: string, spec: CharSpec): string {
  const parts = [what];
  if (spec.rested === true) parts.push('épuisé');
  if (spec.rested === false) parts.push('redressé');
  if (spec.color) parts.push(COLOR_FR[spec.color]);
  if (spec.type) parts.push(`de type {${typeLabel(spec.type)}}`);
  if (spec.typeIncludes) parts.push(`dont le type contient « ${spec.typeIncludes} »`);
  if (spec.attribute) parts.push(`<${ATTRIBUTE_FR[spec.attribute] ?? spec.attribute}>`);
  if (spec.name) parts.push(`[${spec.name}]`);
  if (spec.notName) parts.push(`autre que [${spec.notName}]`);
  if (spec.costMax !== undefined) parts.push(`de coût ${spec.costMax} ou moins`);
  if (spec.costMin !== undefined) parts.push(`de coût ${spec.costMin} ou plus`);
  if (spec.baseCostMax !== undefined) parts.push(`de coût de base ${spec.baseCostMax} ou moins`);
  if (spec.powerMax !== undefined) parts.push(`de ${spec.powerMax} de puissance ou moins`);
  if (spec.powerMin !== undefined) parts.push(`de ${spec.powerMin} de puissance ou plus`);
  if (spec.basePowerMax !== undefined) parts.push(`de ${spec.basePowerMax} de puissance de base ou moins`);
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

export const oppChar = (spec: CharSpec = {}): Targets => ({ side: 'opp', leader: false, characters: true, spec, label: describeSpec('Personnage adverse', spec) });
export const ownChar = (spec: CharSpec = {}): Targets => ({ side: 'own', leader: false, characters: true, spec, label: describeSpec('Personnage', spec) });
export const anyChar = (spec: CharSpec = {}): Targets => ({ side: 'any', leader: false, characters: true, spec, label: describeSpec('Personnage', spec) });
export const oppLeaderOrChar = (spec: CharSpec = {}): Targets => ({ side: 'opp', leader: true, characters: true, spec, label: describeSpec('Leader ou Personnage adverse', spec) });
export const ownLeaderOrChar = (spec: CharSpec = {}): Targets => ({ side: 'own', leader: true, characters: true, spec, label: describeSpec('Leader ou Personnage', spec) });
export const ownLeader = (): Targets => ({ side: 'own', leader: true, characters: false, spec: {}, label: 'ton Leader' });
export const oppLeader = (): Targets => ({ side: 'opp', leader: true, characters: false, spec: {}, label: 'Leader adverse' });

export function candidates(s: GameState, p: PlayerId, t: Targets, extra: (c: FieldCard) => boolean = () => true): number[] {
  const sides = t.side === 'own' ? [p] : t.side === 'opp' ? [other(p)] : [other(p), p];
  return sides.flatMap((q) => [...(t.leader ? [s.players[q].leader] : []), ...(t.characters ? s.players[q].chars : [])])
    .filter((c) => matches(s, c, t.spec) && extra(c)).map((c) => c.uid);
}

const nameOf = (s: GameState, uid: number) => def(findField(s, uid)!.card.num).name;

// ---------- Actions sur des cartes du terrain ----------

// « Mettez KO jusqu'à N ... »
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
export const searchTop = (count: number, n: number, spec: CharSpec & { category?: CardData['category'] }, what: string): Effect =>
  effect((ctx) => { lookTopPick(ctx, count, n, (num) => cardMatches(num, spec), what); }, (s, p) => s.players[p].deck.length > 0);

// « Jouez jusqu'à 1 carte Personnage ... de votre main / Défausse » (sans payer son coût)
const playFrom = (zone: 'hand' | 'trash') => (spec: CharSpec, source: string, opts: { rested?: boolean } = {}): Effect => {
  const eligible = (c: Card) => def(c.num).category === 'CHARACTER' && cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const list = zone === 'hand' ? P.hand : P.trash;
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, list.filter(eligible)));
      if (!options.length) return;
      const where = zone === 'hand' ? 'de ta main' : 'de ta Défausse';
      const answer = ctx.ask({
        prompt: `${source} : jouer jusqu’à 1 ${describeSpec('Personnage', spec)} ${where} :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const [card] = list.splice(list.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      playCharacter(ctx, ctx.me, card, opts);
    },
    useful: (s, p) => (zone === 'hand' ? s.players[p].hand : s.players[p].trash).some(eligible),
  };
};
export const playFromHand = playFrom('hand');
export const playFromTrash = playFrom('trash');

// « Ajoutez jusqu'à 1 carte du dessus de votre deck au-dessus de votre Vie »
export const lifeFromDeck = (): Effect => effect((ctx) => { addTopDeckToLife(ctx.s, ctx.me); }, (s, p) => s.players[p].deck.length > 0);

// « Ajoutez à votre main 1 carte du dessus de votre Vie »
export const lifeIntoHand = (from: 'top' | 'bottom'): Effect => effect((ctx) => { lifeToHand(ctx.s, ctx.me, from); }, (s, p) => s.players[p].life.length > 0);

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

// « Défausser N cartes de votre main »
export const discardCost = (n: number, spec?: CharSpec & { category?: CardData['category'] }): Cost => ({
  label: `défausser ${n} carte${n > 1 ? 's' : ''} de ta main`,
  can: (s, p) => s.players[p].hand.filter((c) => !spec || cardMatches(c.num, spec)).length >= n,
  pay: (ctx) => discardFromHand(ctx, ctx.me, n, 'Carte à défausser :', spec ? (c) => cardMatches(c.num, spec) : undefined) === n,
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

// ---------- Une carte faite de briques ----------

export interface CardSpec {
  onPlay?: Effect;
  whenAttacking?: Effect;
  onKO?: Effect;
  endOfTurn?: Effect;
  onMain?: Effect;      // Événement [Principale]
  onCounter?: Effect;   // Événement [Contre]
  onTrigger?: Effect;   // [Déclenchement]
  activateMain?: { label: string; once?: boolean; cost?: Cost; effect: Effect };
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
  if (spec.activateMain) {
    const { label, once = false, cost, effect: e } = spec.activateMain;
    b.activateMain = {
      oncePerTurn: once,
      label,
      canActivate: (s, p, self) => cost?.can(s, p, self.uid) ?? true,
      useful: (s, p, self) => e.useful(s, p, self.uid),
      run: (ctx) => { if (!cost || cost.pay(ctx)) e.run(ctx); },
    };
  }
  return b;
}

