// OP10 (étape C, tâche S9) : les cartes que le traducteur ne comprend pas codées à la main d'après le texte officiel (VO
// et VF, jamais recopié). Le reste du set est en recettes (recipes/sets/op10.ts). Choix d'interprétation :
// game/docs/interpretations.md, section « EB02 et OP10 (tâche S9) ».
import {
  allField, bottomOrder, canBeRested, canPlayCharacters, def, describe, emit, fieldCost, findField, hasType, isNegated, knownFirst,
  log, may, other, playCharacter, removeByEffect, removeFromField, restByEffect, reveal, uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  all, card, characterCostAtLeast, discard, drawCards, effect, grant, handAtMost, ko, leaderNamed, oppChar, oppLeader,
  ownChar, playFromHand, readyDon, restDon, searchTop, selfDon, seq, setActiveTargets, when, withCost, returnOwnChar,
  type Condition, type Cost, type Effect,
} from './bricks.ts';
import { isNamed } from './common.ts';

const DRESSROSA = 'Dressrosa';
const ODYSSEY = 'ODYSSEY';

// Le même effet, mais joué par le propriétaire de `self` (remplacements résolus pendant un effet adverse : les questions
// vont au propriétaire)
const asOwner = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num, ask: (spec) => ctx.ask({ player: owner, ...spec }),
});
const name = (num: string) => def(num).name;

// « Vous pouvez [coût] : [effet] », proposé seulement si l'effet peut servir (convention n° 1000)
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// ---------- Trafalgar Law (OP10-022) ----------

// « Si le coût total de vos Personnages est de 5 ou plus » (coûts actuels ; un coût négatif compte pour 0)
const totalCostAtLeast = (n: number): Condition => (s, p) => s.players[p].chars.reduce((k, c) => k + Math.max(0, fieldCost(s, c.uid)), 0) >= n;
// « Révélez 1 carte du dessus de votre Vie ; si c'est une carte Personnage {Supernovas} de coût 5 ou moins, vous pouvez la
// jouer » (sinon elle reste dans la Vie, à sa place)
const lawReveal: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const top = P.life[0];
  if (!top) return;
  reveal(ctx.s, [top.uid], 'both');
  const d = def(top.num);
  log(ctx.s, ctx.me, `révèle la carte du dessus de sa Vie : ${d.name} (Trafalgar Law)`);
  if (d.category !== 'CHARACTER' || !d.types.includes('Supernovas') || (d.cost ?? 0) > 5 || !canPlayCharacters(ctx.s, ctx.me, top.num)) return;
  if (!may(ctx, `Trafalgar Law : jouer ${d.name} (carte du dessus de ta Vie) ?`)) return;
  P.life.shift();
  playCharacter(ctx, ctx.me, { uid: top.uid, num: top.num });
}, (s, p) => s.players[p].life.length > 0);

// ---------- Kin'emon (OP10-026, OP10-027) ----------

const KINEMON = "Kin'emon";
const kinemonInTrash = (power: number) => (c: Card) => isNamed(c.num, KINEMON) && def(c.num).category === 'CHARACTER' && (def(c.num).power ?? 0) === power;
// « placez ce Personnage et 1 [Kin'emon] de N de puissance de votre Défausse au-dessous de votre deck dans l'ordre de
// votre choix »
const kinemonCost = (power: number): Cost => ({
  label: `placer ce Personnage et 1 [Kin'emon] de ${power} de puissance de ta Défausse au-dessous de ton deck`,
  can: (s, p, self) => Boolean(findField(s, self)) && s.players[p].trash.some(kinemonInTrash(power)),
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const options = uniqueByNum(P.trash.filter(kinemonInTrash(power)));
    if (!options.length || !findField(ctx.s, ctx.source)) return false;
    const answer = options.length === 1 ? `card:${options[0].uid}` : ctx.ask({
      prompt: `Kin'emon : [Kin'emon] de ta Défausse à placer au-dessous de ton deck :`,
      options: options.map((c) => ({ id: `card:${c.uid}`, label: name(c.num), uid: c.uid, num: c.num })),
      tag: 'trashToDeck',
    });
    const [fromTrash] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    const f = removeFromField(ctx.s, ctx.source, 'deckBottom');
    if (!f) return false;
    P.deck.pop();
    emit(ctx.s, { type: 'leave', player: ctx.me, uid: f.card.uid, num: f.card.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
    const ordered = bottomOrder(ctx, [{ uid: f.card.uid, num: f.card.num }, fromTrash]);
    P.deck.push(...ordered);
    reveal(ctx.s, ordered.map((c) => c.uid), 'both');
    log(ctx.s, ctx.me, `place ${ordered.map((c) => name(c.num)).join(' et ')} au-dessous de son deck`);
    return true;
  },
});
const kinemon = (power: number): CardBehavior => {
  const play = playFromHand({ name: KINEMON, costMin: 6, costMax: 6 }, "Kin'emon");
  return card({
    activateMain: {
      label: `Kin'emon : placer ce Personnage et 1 [Kin'emon] de ${power} de puissance de ta Défausse au-dessous de ton deck, puis jouer un [Kin'emon] de coût 6`,
      // convention n° 1000 : proposé seulement si un [Kin'emon] de coût 6 peut être joué
      condition: (s, p, self) => play.useful(s, p, self),
      cost: kinemonCost(power),
      effect: play,
    },
  });
};

// ---------- Leo (OP10-057) ----------

// « Vous pouvez épuiser votre Leader ou 1 de vos Lieux »
const leaderOrStage = (s: GameState, p: PlayerId) => [s.players[p].leader, ...(s.players[p].stage ? [s.players[p].stage!] : [])]
  .filter((c) => !c.rested && canBeRested(s, c.uid));
const restLeaderOrStageCost: Cost = {
  label: 'épuiser ton Leader ou ton Lieu',
  can: (s, p) => leaderOrStage(s, p).length > 0,
  pay: (ctx) => {
    const options = leaderOrStage(ctx.s, ctx.me);
    if (!options.length) return false;
    const uid = options.length === 1 ? options[0].uid : Number(ctx.ask({
      prompt: 'Carte à épuiser pour payer le coût :',
      options: options.map((c) => ({ id: `card:${c.uid}`, label: describe(ctx.s, c.uid), uid: c.uid })),
      tag: 'restCost',
    }).split(':')[1]);
    const f = findField(ctx.s, uid)!;
    f.card.rested = true;
    log(ctx.s, ctx.me, `épuise ${name(f.card.num)}`);
    return true;
  },
};
// « Si votre Leader est [Usopp], regardez 5 cartes, révélez jusqu'à 2 cartes {Dressrosa} autres que [Leo] et ajoutez-les
// à votre main. Puis, placez le reste au-dessous de votre deck et défaussez 1 carte de votre main » : la condition ne
// couvre pas le « Puis » (la défausse se fait même sans [Usopp] ; le coût n'est alors pas proposé, convention n° 1000)
const leoEffect: Effect = {
  run: seq(when(leaderNamed('Usopp'), searchTop(5, 2, { type: DRESSROSA, notName: 'Leo' }, 'jusqu’à 2 cartes {Dressrosa} autres que [Leo]')), discard(1)).run,
  useful: (s, p) => leaderNamed('Usopp')(s, p, -1) && s.players[p].deck.length > 0,
};

// ---------- Rebecca (OP10-058) ----------

const rebeccaFits = (s: GameState, p: PlayerId) => (c: Card) => {
  const d = def(c.num);
  return d.category === 'CHARACTER' && d.types.includes(DRESSROSA) && (d.cost ?? 0) <= 7 && !isNamed(c.num, 'Rebecca') && canPlayCharacters(s, p, c.num);
};
// « Révélez jusqu'à 2 cartes Personnage {Dressrosa} de coût 7 ou moins autres que [Rebecca] de votre main. Jouez 1 des
// cartes révélées ; si l'autre a un coût de 4 ou moins, jouez-la épuisée » (sinon elle reste dans la main)
const rebeccaReveal: Effect = effect((ctx) => {
  const { s, me } = ctx;
  const P = s.players[me];
  const chosen: Card[] = [];
  for (let i = 0; i < 2; i++) {
    const left = uniqueByNum(knownFirst(s, me, P.hand.filter((c) => rebeccaFits(s, me)(c) && !chosen.some((x) => x.uid === c.uid))));
    if (!left.length) break;
    const answer = ctx.ask({
      prompt: `Rebecca : révéler jusqu’à 2 cartes Personnage {Dressrosa} de coût 7 ou moins de ta main (${i + 1}/2) :`,
      options: [...left.map((c) => ({ id: `card:${c.uid}`, label: `${name(c.num)} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: i ? 'Pas d’autre carte' : 'Aucune' }],
      tag: 'reveal',
    });
    if (answer === 'none') break;
    chosen.push(P.hand.find((c) => c.uid === Number(answer.split(':')[1]))!);
  }
  if (!chosen.length) return;
  reveal(s, chosen.map((c) => c.uid), 'both');
  log(s, me, `révèle ${chosen.map((c) => name(c.num)).join(' et ')} de sa main (Rebecca)`);
  const first = chosen.length === 1 ? chosen[0] : P.hand.find((c) => c.uid === Number(ctx.ask({
    prompt: 'Rebecca : carte révélée à jouer (l’autre est jouée épuisée si son coût est de 4 ou moins) :',
    options: chosen.map((c) => ({ id: `card:${c.uid}`, label: `${name(c.num)} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })),
    tag: 'playFree',
  }).split(':')[1]))!;
  const playOne = (c: Card, rested: boolean) => {
    const at = P.hand.findIndex((x) => x.uid === c.uid);
    if (at < 0 || !canPlayCharacters(s, me, c.num)) return;
    const [played] = P.hand.splice(at, 1);
    playCharacter(ctx, me, played, { rested, from: 'hand' });
  };
  playOne(first, false);
  const second = chosen.find((c) => c.uid !== first.uid);
  if (second && (def(second.num).cost ?? 0) <= 4) playOne(second, true);
}, (s, p) => s.players[p].hand.some(rebeccaFits(s, p)));

// ---------- Usopp (OP10-042) ----------

// Coût actuel d'un Personnage sans les effets permanents d'Usopp OP10-042 (« de coût 2 ou plus » : lu sans l'effet qui le
// change, sinon la règle se lirait elle-même)
function costWithoutUsopp(s: GameState, target: FieldCard): number {
  const f = findField(s, target.uid);
  if (!f || f.leader) return 0;
  const d = def(f.card.num);
  let c = (d.cost ?? 0) + (d.selfCost && !isNegated(s, f.card.uid) ? d.selfCost(s, f.player, f.card) : 0);
  for (const src of allField(s, f.player)) {
    const aura = def(src.num).costAura;
    if (aura && src.num !== 'OP10-042' && !isNegated(s, src.uid)) c += aura(s, f.player, src, f.card);
  }
  for (const src of allField(s, other(f.player))) {
    const aura = def(src.num).oppCostAura;
    if (aura && !isNegated(s, src.uid)) c += aura(s, other(f.player), src, f.card);
  }
  for (const m of s.mods) if (m.uid === f.card.uid && m.stat === 'cost') c += m.amount;
  return c;
}
// « [Tour adverse] [Une fois par tour] quand un de vos Personnages {Dressrosa} quitte le terrain à cause d'un effet adverse
// ou est mis KO » (KO en combat ou par n'importe quel effet)
const usoppKo = (s: GameState, owner: PlayerId, _self: FieldCard, e: GameEvent) =>
  s.active !== owner && e.player === owner && e.zone === 'character' && e.num !== undefined && hasType(e.num, DRESSROSA);
const usoppLeave = (s: GameState, owner: PlayerId, self: FieldCard, e: GameEvent) =>
  usoppKo(s, owner, self, e) && e.by === other(owner) && e.cause === 'effect';
const usoppDraw = (ctx: EffectCtx) => when(handAtMost(5), drawCards(1)).run(ctx);

// ---------- Libération (OP10-098) ----------

const fewerChars: Condition = (s, p) => s.players[p].chars.length <= s.players[other(p)].chars.length - 2;
const NEGATE = { stat: 'negated' } as const;

export const OP10: Record<string, CardBehavior> = {
  // Trafalgar Law : [DON!! x1] [Activation : Principale] [Une fois par tour] avec des Personnages de coût total 5 ou plus,
  // renvoyer 1 de ses Personnages dans sa main : révéler la carte du dessus de sa Vie, la jouer si c'est un Personnage
  // {Supernovas} de coût 5 ou moins
  'OP10-022': card({
    activateMain: {
      label: 'Trafalgar Law : renvoyer 1 de tes Personnages dans ta main, révéler la carte du dessus de ta Vie (jouée si Personnage {Supernovas} de coût 5 ou moins)',
      once: true,
      condition: all(selfDon(1), totalCostAtLeast(5)),
      cost: returnOwnChar(),
      effect: lawReveal,
    },
  }),

  // Kin'emon (0 de puissance, puis 1000 de puissance) : [Activation : Principale] placer ce Personnage et 1 [Kin'emon] de la
  // puissance dite de sa Défausse au-dessous de son deck : jouer un [Kin'emon] de coût 6 de sa main
  'OP10-026': kinemon(0),
  'OP10-027': kinemon(1000),

  // Smoker : [Exil] ; [Activation : Principale] redresser jusqu'à 1 DON!! ; puis plus de DON!! redressée par un effet de
  // Personnage ce tour-ci (lui compris : comme L'Oiseau EB04-016, une deuxième activation ne redresserait rien)
  'OP10-030': card({
    activateMain: {
      label: 'Smoker : redresser 1 DON!! (puis plus de DON!! redressée par un effet de Personnage ce tour-ci)',
      condition: (s, p) => s.players[p].noCharDonReadyTurn !== s.turn,
      effect: seq(readyDon(1), effect((ctx) => {
        ctx.s.players[ctx.me].noCharDonReadyTurn = ctx.s.turn;
        log(ctx.s, ctx.me, 'ne pourra plus redresser de DON!! grâce à l’effet d’un Personnage ce tour-ci (Smoker)');
      }, () => false)),
    },
  }),

  // Tashigi : à la place d'un de ses Personnages verts autre que [Tashigi] retiré par un effet adverse, s'épuiser
  'OP10-032': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Tashigi : s'épuiser, ${name(victim.num)} reste sur le terrain`,
      condition: (s, _p, self, victim) => victim.uid !== self.uid && !isNamed(victim.num, 'Tashigi') && def(victim.num).colors.includes('Green')
        && !self.rested && canBeRested(s, self.uid),
      apply: (s, p, self, victim, ctx) => {
        if (restByEffect(asOwner(ctx, p, self), self.uid)) log(s, p, `${name(victim.num)} reste sur le terrain (Tashigi)`);
      },
    },
  },

  // Lim : [Une fois par tour] au lieu de quitter le terrain à cause d'un effet adverse, épuiser 1 de ses Personnages
  // {ODYSSEY} (elle comprise, si elle est redressée) ; [Fin de votre tour] redresser jusqu'à 1 Personnage {ODYSSEY}
  'OP10-037': card({
    endOfTurn: setActiveTargets(ownChar({ type: ODYSSEY }), 'Lim'),
  }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: () => 'Lim : épuiser 1 de tes Personnages {ODYSSEY}, Lim reste sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid
        && s.players[p].chars.some((c) => hasType(c.num, ODYSSEY) && !c.rested && canBeRested(s, c.uid)),
      apply: (s, p, self, _victim, ctx) => {
        const own = asOwner(ctx, p, self);
        const list = s.players[p].chars.filter((c) => hasType(c.num, ODYSSEY) && !c.rested && canBeRested(s, c.uid)).map((c) => c.uid);
        const uid = list.length === 1 ? list[0] : Number(own.ask({
          prompt: 'Lim : Personnage {ODYSSEY} à épuiser :',
          options: list.map((u) => ({ id: `card:${u}`, label: describe(s, u), uid: u })),
          tag: 'restCost',
        }).split(':')[1]);
        if (restByEffect(own, uid)) log(s, p, 'Lim reste sur le terrain');
      },
    },
  }),

  // Usopp : +1 au coût de ses Personnages {Dressrosa} de coût 2 ou plus ; [Tour adverse] [Une fois par tour] quand un de
  // ses Personnages {Dressrosa} quitte le terrain à cause d'un effet adverse ou est mis KO : avec 5 cartes ou moins en
  // main, piocher 1 carte
  'OP10-042': {
    costAura: (s, owner, _source, target) => (s.players[owner].chars.some((c) => c.uid === target.uid)
      && hasType(target.num, DRESSROSA) && costWithoutUsopp(s, target) >= 2 ? 1 : 0),
    when: [
      { on: 'ko', once: 'OP10-042:draw', if: usoppKo, run: usoppDraw },
      { on: 'leave', once: 'OP10-042:draw', if: usoppLeave, run: usoppDraw },
    ],
  },

  // Sabo : à la place d'un de ses Personnages de coût de base 7 ou moins autre que [Sabo] retiré par un effet adverse, se
  // renvoyer dans sa main
  'OP10-049': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Sabo : te renvoyer dans ta main, ${name(victim.num)} reste sur le terrain`,
      condition: (_s, _p, self, victim) => victim.uid !== self.uid && !isNamed(victim.num, 'Sabo') && (def(victim.num).cost ?? 0) <= 7,
      apply: (s, p, self, victim, ctx) => {
        if (removeByEffect(asOwner(ctx, p, self), self.uid, 'hand')) log(s, p, `${name(victim.num)} reste sur le terrain (Sabo)`);
      },
    },
  },

  // Léo : [Jouée] épuiser son Leader ou son Lieu : avec le Leader [Usopp], prendre jusqu'à 2 cartes {Dressrosa} autres que
  // [Leo] dans les 5 du dessus ; puis défausser 1 carte
  'OP10-057': card({ onPlay: mayPay(restLeaderOrStageCost, leoEffect, 'Léo') }),

  // Rebecca : [Jouée] s'il y a un Personnage de coût 8 ou plus, piocher 1 carte ; puis révéler jusqu'à 2 Personnages
  // {Dressrosa} de coût 7 ou moins de sa main, en jouer 1, et l'autre épuisée si son coût est de 4 ou moins
  'OP10-058': card({ onPlay: seq(when(characterCostAtLeast(8), drawCards(1)), rebeccaReveal) }),

  // Pica : [Une fois par tour] au lieu d'être mis KO par un effet adverse, épuiser 2 de ses DON!! redressées
  'OP10-074': {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: true,
      label: () => 'Pica : épuiser 2 de tes DON!! redressées, Pica n’est pas mis KO',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].donActive >= 2,
      apply: (s, p, self, _victim, ctx) => {
        if (restDon(2).pay(asOwner(ctx, p, self))) log(s, p, 'Pica n’est pas mis KO');
      },
    },
  },

  // Libération : [Principale] avec au moins 2 Personnages de moins que l'adversaire, mettre KO jusqu'à 1 Personnage adverse
  // de coût de base 6 ou moins et jusqu'à 1 autre de coût de base 4 ou moins ; [Déclenchement] annuler pour le tour les
  // effets de jusqu'à 1 Leader adverse et de jusqu'à 1 Personnage adverse
  'OP10-098': card({
    onMain: when(fewerChars, seq(ko(oppChar({ baseCostMax: 6 }), 'Libération'), ko(oppChar({ baseCostMax: 4 }), 'Libération'))),
    onTrigger: seq(
      grant(oppLeader(), NEGATE, 'turn', 'Libération', 'perd ses effets'),
      grant(oppChar(), NEGATE, 'turn', 'Libération', 'perd ses effets'),
    ),
  }),
};

// Rien de codé à la main n'est appelé par une recette d'OP10 (sortie « manual », 01-contrats.md § 15.2)
export const MANUAL_OP10 = {};
