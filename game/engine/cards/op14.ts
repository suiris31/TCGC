// OP14 (étape C, tâche S5) : les cartes que le traducteur ne comprend pas, ou qu'il ne sait pas compiler, codées à la
// main d'après le texte officiel (VO et VF, jamais recopié). Le reste du set est en recettes (recipes/sets/op14.ts).
// Choix d'interprétation : game/docs/interpretations.md, section « OP14 et ST29 (tâche S5) ».
import {
  addMod, allField, basePower, def, describe, discardFromHand, donOnField, emit, fieldCost, findField, hasType, log,
  other, reveal, returnDon, setActive, uniqueByNum, knownFirst, canPlayCharacters, playCharacter, giveRestedDon,
  lifeToHand, chooseUpTo1,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  addDon, bounce, candidates, card, chooseOne, costMod, discard, discardCost, donMinus, drawCards, effect, grant, ko,
  leaderPower, leaderType, leaderTypeIncludes, lifeFromDeck, mayTrashTop, noCharactersThisTurn, oppChar, ownChar,
  ownLeaderOrChar, playFromHand, playFromTrash, playSelfFromTrash, playThis, powerMod, readyDon, rest, restCost,
  restDon, restOppCards, revealCost, searchTop, selfDon, selfPowerMod, seq, trashSelf, trashToBottomCost, when,
  withCost, onceWithCost, anyChar, type Condition, type Effect,
} from './bricks.ts';
import { koOwnCharCost } from './bricks-removal.ts';
import { modTargets, pick } from './bricks-power.ts';

const BW = 'Baroque Works';
const TB = 'Thriller Bark Pirates';
const DQ = 'Donquixote Pirates';
const KUJA = 'Kuja Pirates';

// Le même effet, mais joué par le propriétaire de `self` (remplacements résolus pendant un effet adverse ou un combat :
// les questions vont au propriétaire, les cartes épuisées le sont par lui)
const ownerCtx = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num,
  ask: (d) => ctx.ask({ ...d, player: d.player ?? owner }),
});

// [Contre] « Votre Leader gagne +N de puissance pendant ce combat » : l'IA connaît la valeur quand le Leader est attaqué
const leaderCounter = (amount: number, source: string): Effect => ({
  ...leaderPower(amount, 'battle', source),
  power: (s, p, target) => (target === s.players[p].leader.uid ? amount : 0),
});
const leaderCounterUseful = (s: GameState, p: PlayerId, target: number) => target === s.players[p].leader.uid;

// « S'il y a un Personnage ayant un coût de 0 ou de 8 ou plus » (de l'un ou l'autre camp ; un coût négatif vaut 0) ;
// side : seulement les Personnages adverses (Crocodile OP14-120)
const zeroOrEight = (c: FieldCard, s: GameState) => Math.max(0, fieldCost(s, c.uid)) === 0 || fieldCost(s, c.uid) >= 8;
const zeroOrEightAny: Condition = (s) => s.players.some((P) => P.chars.some((c) => zeroOrEight(c, s)));
const zeroOrEightOpp: Condition = (s, p) => s.players[other(p)].chars.some((c) => zeroOrEight(c, s));

// « Échangez la puissance de base des cartes choisies » : chacune prend la puissance de base de l'autre (celle du moment,
// 4-9-2-1), pour le tour ou pour le combat
function swapBasePower(ctx: EffectCtx, a: number, b: number, until: 'turn' | 'battle', source: string) {
  const pa = basePower(ctx.s, a);
  const pb = basePower(ctx.s, b);
  addMod(ctx.s, { uid: a, stat: 'basePower', amount: pb, until, source });
  addMod(ctx.s, { uid: b, stat: 'basePower', amount: pa, until, source });
  log(ctx.s, ctx.me, `${describe(ctx.s, a)} et ${describe(ctx.s, b)} échangent leur puissance de base ${until === 'battle' ? 'pour le combat' : 'pour le tour'} (${source})`);
}

// « Choisissez 2 ... Échangez leur puissance de base » : 2 cartes obligatoires (rien sans 2 cartes possibles)
const swapTwo = (list: (s: GameState, p: PlayerId) => number[], until: 'turn' | 'battle', source: string, what: string): Effect => effect((ctx) => {
  const options = list(ctx.s, ctx.me);
  if (options.length < 2) return;
  const [a, b] = pick(ctx, options, { n: 2, forced: true }, `${source} : ${what} dont la puissance de base est échangée :`, 'swapPower');
  swapBasePower(ctx, a, b, until, source);
}, (s, p) => list(s, p).length >= 2);

// « Défaussez toute votre main » : défausse par un effet (Kuroobi, Jinbe, Wadatsumi réagissent)
const trashWholeHand = (source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const count = P.hand.length;
  if (!count) return;
  P.trash.push(...P.hand);
  P.hand = [];
  P.discardedTurn = ctx.s.turn;
  log(ctx.s, ctx.me, `défausse toute sa main (${count} carte${count > 1 ? 's' : ''}, ${source})`);
  emit(ctx.s, { type: 'discard', player: ctx.me, count, by: ctx.me, sourceNum: ctx.num });
}, () => false);

// Doflamingo (Leader) : « changez la cible de l'attaque par votre Leader ou 1 de vos Personnages {Donquixote Pirates} »
const redirectTargets = (s: GameState, p: PlayerId) => {
  if (!s.battle) return [];
  const P = s.players[p];
  return [P.leader, ...P.chars.filter((c) => hasType(c.num, DQ))].map((c) => c.uid).filter((uid) => uid !== s.battle!.target);
};
const redirect: Effect = effect((ctx) => {
  const options = redirectTargets(ctx.s, ctx.me);
  if (!options.length || !ctx.s.battle) return;
  const uid = options.length === 1 ? options[0] : Number(ctx.ask({
    prompt: 'Don Quijote Doflamingo : nouvelle cible de l’attaque :',
    options: options.map((u) => ({ id: `card:${u}`, label: describe(ctx.s, u), uid: u })),
    tag: 'redirect',
  }).split(':')[1]);
  ctx.s.battle.target = uid;
  log(ctx.s, ctx.me, `la cible de l’attaque devient ${describe(ctx.s, uid)} (Don Quijote Doflamingo)`);
}, (s, p) => redirectTargets(s, p).length > 0);

// Issho : « jusqu'à 1 Personnage adverse épuisé ou jusqu'à 1 Lieu adverse épuisé ne sera pas redressé lors de la prochaine
// phase de Recharge adverse »
const issoLock = (s: GameState, p: PlayerId) => {
  const O = s.players[other(p)];
  return [...O.chars, ...(O.stage ? [O.stage] : [])].filter((c) => c.rested).map((c) => c.uid);
};

// Gecko Moria (OP14-104) : jouer, ou placer face visible au-dessus de sa Vie, un Personnage {Thriller Bark Pirates} de coût
// 4 ou moins de sa Défausse
const moriaEligible = (c: Card) => def(c.num).category === 'CHARACTER' && hasType(c.num, TB) && (def(c.num).cost ?? 0) <= 4;
const moriaPlayOrLife: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.trash.filter(moriaEligible)));
  if (!options.length) return;
  const answer = ctx.ask({
    prompt: 'Gecko Moria : Personnage {Thriller Bark Pirates} de coût 4 ou moins de ta Défausse :',
    options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
  });
  if (answer === 'none') return;
  const uid = Number(answer.split(':')[1]);
  const canPlay = canPlayCharacters(ctx.s, ctx.me, P.trash.find((c) => c.uid === uid)!.num);
  const where = canPlay ? ctx.ask({
    prompt: 'Gecko Moria : jouer cette carte, ou la placer face visible au-dessus de ta Vie ?',
    options: [{ id: 'play', label: 'La jouer' }, { id: 'life', label: 'Au-dessus de ma Vie, face visible' }],
    tag: 'moriaWhere',
  }) : 'life';
  const [chosen] = P.trash.splice(P.trash.findIndex((c) => c.uid === uid), 1);
  if (where === 'play') {
    playCharacter(ctx, ctx.me, chosen);
    return;
  }
  P.life.unshift({ uid: chosen.uid, num: chosen.num, faceUp: true });
  reveal(ctx.s, [chosen.uid], 'both');
  log(ctx.s, ctx.me, `place ${def(chosen.num).name} de sa Défausse face visible au-dessus de sa Vie (Gecko Moria, ${P.life.length} Vie)`);
}, (s, p) => s.players[p].trash.some(moriaEligible));

// Sœurs gorgones : « donnez à votre Leader et à chacun de vos Personnages jusqu'à 1 DON!! épuisée » (sans assez de DON!!
// épuisées, le joueur choisit lesquelles en reçoivent)
const donToEach: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const cards = [P.leader, ...P.chars].map((c) => c.uid);
  const chosen = P.donRested >= cards.length ? cards
    : pick(ctx, cards, { n: P.donRested, forced: true }, 'Sœurs gorgones : carte qui reçoit 1 DON!! épuisée', 'donTarget');
  for (const uid of chosen) {
    if (giveRestedDon(ctx.s, ctx.me, uid, 1)) log(ctx.s, ctx.me, `donne 1 DON!! épuisée à ${describe(ctx.s, uid)} (Sœurs gorgones)`);
  }
}, (s, p) => s.players[p].donRested > 0);

// Rindo : « puis, vous subissez 1 dégât » (cartes de Vie en main, [Déclenchement] au choix ; sans Vie, la partie est
// perdue)
const takeDamage: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  log(ctx.s, ctx.me, 'subit 1 dégât (Rindo)');
  ctx.s.pending.unshift({ kind: 'system', action: 'leaderDamage', source: P.leader.uid, num: P.leader.num, controller: ctx.me, answers: [], data: { amount: 1 } });
}, () => false);

// Miss Merrychristmas : « mettez KO jusqu'à 1 Lieu adverse ayant un coût de 1 »
const koOppStageCost1: Effect = effect((ctx) => {
  const stage = ctx.s.players[ctx.opp].stage;
  if (!stage || (def(stage.num).cost ?? 0) !== 1) return;
  const uid = chooseUpTo1(ctx, [stage.uid], 'Miss Merrychristmas : Lieu adverse de coût 1 à mettre KO :', 'oppKo');
  if (uid === null) return;
  const P = ctx.s.players[ctx.opp];
  P.trash.push({ uid: stage.uid, num: stage.num });
  P.stage = null;
  log(ctx.s, ctx.opp, `le Lieu ${def(stage.num).name} est mis KO (Miss Merrychristmas)`);
}, (s, p) => {
  const stage = s.players[other(p)].stage;
  return Boolean(stage && (def(stage.num).cost ?? 0) === 1);
});

// Fils balistiques : « jusqu'à 1 de vos Leader ou Personnages gagne +2000 pendant ce combat. Puis, cette carte gagne
// encore +2000 pour tout le tour » : la carte attaquée (comme defenderPower)
const ballisticThreads: Effect = {
  run: (ctx) => {
    const target = ctx.s.battle?.target ?? Number(ctx.pending.data?.target);
    const f = findField(ctx.s, target);
    if (!f || f.player !== ctx.me) return;
    addMod(ctx.s, { uid: target, stat: 'power', amount: 2000, until: 'battle', source: 'Fils balistiques' });
    log(ctx.s, ctx.me, `${def(f.card.num).name} gagne +2000 de puissance pour le combat (Fils balistiques)`);
    addMod(ctx.s, { uid: target, stat: 'power', amount: 2000, until: 'turn', source: 'Fils balistiques' });
    log(ctx.s, ctx.me, `${def(f.card.num).name} gagne encore +2000 de puissance pour le tour (Fils balistiques)`);
  },
  useful: (s, p) => Boolean(s.battle && findField(s, s.battle.target)?.player === p),
  power: () => 4000,
};

const MR3_KEY = 'mr3Replace';

export const OP14: Record<string, CardBehavior> = {
  // Trafalgar Law (Leader) : [Activation : Principale] [Une fois par tour] échanger la puissance de base de 2 de ses
  // Personnages {Supernovas} ou {Heart Pirates} pour le tour
  'OP14-001': card({
    activateMain: {
      label: 'Trafalgar Law : échanger la puissance de base de 2 de tes Personnages {Supernovae} ou {Équipage du Heart}',
      once: true,
      effect: swapTwo((s, p) => s.players[p].chars.filter((c) => hasType(c.num, 'Supernovas') || hasType(c.num, 'Heart Pirates')).map((c) => c.uid),
        'turn', 'Trafalgar Law', 'Personnage'),
    },
  }),

  // Capone "Gang" Bege : ne peut pas être mis KO par l'effet d'un Personnage adverse de 5000 de puissance de base ou moins
  // (puissance imprimée de la carte dont vient l'effet, n° 2401)
  'OP14-003': {
    cantBeKO: (_s, owner, _self, cause, by, sourceNum) => cause === 'effect' && by !== owner && sourceNum !== undefined
      && def(sourceNum).category === 'CHARACTER' && (def(sourceNum).power ?? 0) <= 5000,
  },

  // Trafalgar Law : [Initiative] ; [Attaque adverse] [Une fois par tour] défausser 2 cartes : échanger la puissance de base
  // de son Leader et d'un de ses Personnages pour le combat
  'OP14-009': card({
    onOpponentAttack: onceWithCost('law009', discardCost(2), effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      if (!P.chars.length) return;
      const [uid] = pick(ctx, P.chars.map((c) => c.uid), { n: 1, forced: true }, 'Trafalgar Law : Personnage qui échange sa puissance de base avec ton Leader :', 'swapPower');
      swapBasePower(ctx, P.leader.uid, uid, 'battle', 'Trafalgar Law');
    }, (s, p) => s.players[p].chars.length > 0), 'Trafalgar Law'),
  }),

  // X-Drake : [Tour adverse] [Une fois par tour] si un de ses Personnages {Supernovas} devait quitter le terrain à cause
  // d'un effet adverse, son Leader peut recevoir −2000 pour le tour à la place ; [DON!! x1] [En attaquant] −2000 à un
  // Personnage adverse pour le tour
  'OP14-016': card({
    whenAttacking: when(selfDon(1), powerMod(oppChar(), -2000, 'turn', 'X-Drake')),
  }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `X-Drake : ton Leader reçoit −2000 de puissance pour le tour pour que ${def(victim.num).name} reste sur le terrain`,
      condition: (s, owner, _self, victim) => s.active !== owner && hasType(victim.num, 'Supernovas'),
      apply: (s, owner) => {
        addMod(s, { uid: s.players[owner].leader.uid, stat: 'power', amount: -2000, until: 'turn', source: 'X-Drake' });
        log(s, owner, 'son Leader reçoit −2000 de puissance pour le tour à la place (X-Drake)');
      },
    },
  }),

  // Shambles : [Principale] échanger la puissance de base de 2 Personnages adverses de 9000 de puissance de base ou moins
  'OP14-017': card({
    onMain: swapTwo((s, p) => candidates(s, p, oppChar({ basePowerMax: 9000 })), 'turn', 'Shambles', 'Personnage adverse'),
  }),

  // Issho : [Votre tour] quand il est épuisé, vous pouvez ajouter la Vie du dessus à votre main ; si vous le faites, un
  // Personnage ou un Lieu adverse épuisé ne sera pas redressé lors de la prochaine phase de Recharge adverse
  'OP14-021': {
    when: [{
      on: 'rest',
      if: (s, owner, self, e) => e.uid === self.uid && s.active === owner,
      run: (ctx) => {
        const P = ctx.s.players[ctx.me];
        if (!P.life.length) return;
        if (ctx.ask({ prompt: 'Issho : ajouter la carte du dessus de ta Vie à ta main ?', options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }], tag: 'may' }) !== 'yes') return;
        if (!lifeToHand(ctx.s, ctx.me, 'top')) return;
        const uid = chooseUpTo1(ctx, issoLock(ctx.s, ctx.me), 'Issho : Personnage ou Lieu adverse épuisé qui ne sera pas redressé :', 'oppLock');
        if (uid === null) return;
        addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: ctx.s.turn + 1, source: 'Issho' });
        log(ctx.s, ctx.me, `${describe(ctx.s, uid)} ne pourra pas être redressé lors de la prochaine phase de Recharge adverse (Issho)`);
      },
    }],
  },

  // Kinémon : [Jouée] redresser jusqu'à 3 DON!!, puis plus de carte Personnage jouée ce tour ; [En cas de KO] épuiser
  // jusqu'à 1 carte adverse
  'OP14-024': card({
    onPlay: seq(readyDon(3), noCharactersThisTurn('Kinémon')),
    onKO: restOppCards(1, 'Kinémon', { leader: true, stage: true, don: true }),
  }),

  // Tashigi : [Tour adverse] si elle devait quitter le terrain à cause d'un effet adverse, épuiser 1 de ses cartes à la
  // place ; [Activation : Principale] [Une fois par tour] épuiser 2 de ses cartes : +2000 jusqu'à la fin du prochain tour
  // adverse
  'OP14-029': card({
    activateMain: {
      label: 'Tashigi : épuiser 2 de tes cartes pour +2000 de puissance jusqu’à la fin du prochain tour adverse',
      once: true,
      cost: restCost(2, 'cards'),
      effect: selfPowerMod(2000, 'oppNextEnd', 'Tashigi'),
    },
  }, {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: () => 'Tashigi : épuiser 1 de tes cartes pour qu’elle reste sur le terrain',
      condition: (s, owner, self, victim) => victim.uid === self.uid && s.active !== owner && restCost(1, 'cards').can(s, owner, self.uid),
      apply: (_s, owner, self, _victim, ctx) => {
        if (restCost(1, 'cards').pay(ownerCtx(ctx, owner, self))) log(ctx.s, owner, 'Tashigi reste sur le terrain (une de ses cartes épuisée à la place)');
      },
    },
  }),

  // Shiliew : [Jouée] renvoyer en main un Personnage adverse, puis défausser toute sa main
  'OP14-048': card({ onPlay: seq(bounce(oppChar(), 'Shiliew'), trashWholeHand('Shiliew')) }),

  // Fisher Tiger : [Jouée] avec un Leader {Fish-Man}, piocher 3 ; [Fin de votre tour] défausser jusqu'à n'avoir plus que 5
  // cartes en main
  'OP14-054': card({
    onPlay: when(leaderType('Fish-Man'), drawCards(3)),
    endOfTurn: effect((ctx) => {
      const extra = ctx.s.players[ctx.me].hand.length - 5;
      if (extra > 0) discardFromHand(ctx, ctx.me, extra, 'Fisher Tiger : carte à défausser');
    }, (s, p) => s.players[p].hand.length > 5),
  }),

  // Courant marin, Jet d'épaule : [Principale] épuiser 3 DON!! : jouer un Personnage {Fish-Man} de coût 3 ou moins de sa
  // main, puis renvoyer en main un Personnage de 6000 de puissance de base ; [Contre] piocher 1 et Leader +3000
  'OP14-058': card({
    onMain: withCost(restDon(3), seq(
      playFromHand({ type: 'Fish-Man', costMax: 3 }, 'Courant marin, Jet d’épaule'),
      bounce(anyChar({ basePowerMin: 6000, basePowerMax: 6000 }), 'Courant marin, Jet d’épaule'),
    ), 'Courant marin, Jet d’épaule'),
    onCounter: seq(drawCards(1), leaderCounter(3000, 'Courant marin, Jet d’épaule')),
  }, { counterUseful: leaderCounterUseful, counterExtra: () => true }),

  // Don Quijote Doflamingo (Leader) : [Attaque adverse] [Une fois par tour] DON!! −1 : la cible de l'attaque devient son
  // Leader ou un de ses Personnages {Donquixote Pirates}
  'OP14-060': card({ onOpponentAttack: onceWithCost('dofla060', donMinus(1), redirect, 'Don Quijote Doflamingo') }),

  // Vergo : [Une fois par tour] si un de ses Personnages {Donquixote Pirates} devait quitter le terrain à cause d'un effet
  // adverse, renvoyer 1 DON!! de son terrain au deck DON!! à la place ; [En attaquant] DON!! −1 : −2000 à un Personnage
  // adverse pour le tour
  'OP14-061': card({
    whenAttacking: withCost(donMinus(1), powerMod(oppChar(), -2000, 'turn', 'Vergo'), 'Vergo'),
  }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Vergo : renvoyer 1 DON!! dans ton deck DON!! pour que ${def(victim.num).name} reste sur le terrain`,
      condition: (s, owner, _self, victim) => hasType(victim.num, DQ) && donOnField(s, owner) >= 1,
      apply: (s, owner) => { returnDon(s, owner, 1); },
    },
  }),

  // Gladius : [En cas de KO] DON!! −1 : mettre KO ou épuiser un Personnage adverse de 6000 de puissance de base ou moins
  'OP14-062': card({
    onKO: withCost(donMinus(1), chooseOne('Gladius', [
      { label: 'Mettre KO un Personnage adverse de 6000 de puissance de base ou moins', effect: ko(oppChar({ basePowerMax: 6000 }), 'Gladius') },
      { label: 'Épuiser un Personnage adverse de 6000 de puissance de base ou moins', effect: rest(oppChar({ basePowerMax: 6000 }), 'Gladius') },
    ]), 'Gladius'),
  }),

  // Jora : [En cas de KO] 1 DON!! épuisée, puis KO d'un Personnage adverse de 0 de puissance de base
  'OP14-064': card({ onKO: seq(addDon(1, 'rested'), ko(oppChar({ basePowerMax: 0 }), 'Jora')) }),

  // Dellinger : [En cas de KO] 1 DON!! épuisée et 5 cartes du dessus : 1 carte {Donquixote Pirates}
  'OP14-067': card({ onKO: seq(addDon(1, 'rested'), searchTop(5, 1, { type: DQ }, 'une carte {Équipage de Don Quijote}')) }),

  // Buffalo : [Bloqueur] ; quand il est épuisé par l'effet d'un Personnage adverse, DON!! −1 : le redresser
  'OP14-070': {
    when: [{
      on: 'rest',
      if: (s, owner, self, e) => e.uid === self.uid && e.cause === 'effect' && e.by !== owner && e.sourceNum !== undefined
        && def(e.sourceNum).category === 'CHARACTER' && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => withCost(donMinus(1), effect((c) => { setActive(c.s, c.me, c.source); }), 'Buffalo').run(ctx),
    }],
  },

  // Fils balistiques : [Contre] DON!! −1 : avec un Leader {Donquixote Pirates}, +2000 pour le combat puis encore +2000
  // pour le tour à la carte attaquée
  'OP14-078': card({ onCounter: withCost(donMinus(1), when(leaderType(DQ), ballisticThreads), 'Fils balistiques') }),

  // Crocodile (Leader) : les Personnages adverses ne peuvent pas quitter le terrain à cause de ses effets ; [Activation :
  // Principale] [Une fois par tour] mettre KO un de ses Personnages « Baroque Works » : −10 de coût à un Personnage adverse
  // pour le tour, puis il peut placer les 2 cartes du dessus de son deck dans sa Défausse
  'OP14-079': card({
    activateMain: {
      label: 'Crocodile : mettre KO un de tes Personnages « Baroque Works » pour donner −10 de coût à un Personnage adverse',
      once: true,
      cost: koOwnCharCost({ typeIncludes: BW }),
      effect: seq(costMod(oppChar(), -10, 'turn', 'Crocodile'), mayTrashTop(2, 'Crocodile')),
    },
  }, { oppCantLeave: () => true }),

  // Gecko Moria (Leader) : [Activation : Principale] [Une fois par tour] mettre KO un de ses Personnages {Thriller Bark
  // Pirates} : son Leader et tous ses Personnages +1000 pour le tour ; [En attaquant] défausser 3 cartes : la carte du
  // dessus du deck au-dessus de sa Vie
  'OP14-080': card({
    activateMain: {
      label: 'Gecko Moria : mettre KO un de tes Personnages {Équipage de Thriller Bark} pour +1000 à ton Leader et à tous tes Personnages',
      once: true,
      cost: koOwnCharCost({ type: TB }),
      effect: modTargets(ownLeaderOrChar(), { stat: 'power', amount: 1000 }, 'turn', 'Gecko Moria', 'gagne +1000 de puissance', { all: true }),
    },
    whenAttacking: withCost(discardCost(3), lifeFromDeck(), 'Gecko Moria'),
  }),

  // Miss Wednesday : [Activation : Principale] se placer dans la Défausse : −3000 pour le tour à un Personnage adverse de
  // coût 0
  'OP14-083': card({
    activateMain: {
      label: 'Miss Wednesday : te placer dans ta Défausse pour −3000 à un Personnage adverse de coût 0',
      cost: trashSelf(),
      effect: powerMod(oppChar({ costMax: 0 }), -3000, 'turn', 'Miss Wednesday'),
    },
  }),

  // Miss Allsunday : [Jouée] avec un Leader « Baroque Works », jouer de sa Défausse un Personnage « Baroque Works » de coût
  // 4 ou moins et un de coût 1
  'OP14-084': card({
    onPlay: when(leaderTypeIncludes(BW), seq(
      playFromTrash({ typeIncludes: BW, costMax: 4 }, 'Miss Allsunday'),
      playFromTrash({ typeIncludes: BW, costMax: 1, costMin: 1 }, 'Miss Allsunday'),
    )),
  }),

  // Miss Doublefinger : avec 7 cartes ou plus dans sa Défausse, +1000 et +2 de coût à tous ses Personnages « Baroque
  // Works » (elle comprise)
  'OP14-086': {
    selfPower: (s, owner) => (s.players[owner].trash.length >= 7 ? 1000 : 0),
    costAura: (s, owner, _source, target) => (s.players[owner].trash.length >= 7 && def(target.num).types.some((t) => t.includes(BW)) ? 2 : 0),
  },

  // Miss Merrychristmas : [En cas de KO] avec un Leader « Baroque Works », piocher 1 et KO d'un Lieu adverse de coût 1
  'OP14-088': card({ onKO: when(leaderTypeIncludes(BW), seq(drawCards(1), koOppStageCost1)) }),

  // Mr 1 : [Initiative : Personnage] s'il y a un Personnage de coût 0 ou de 8 ou plus ; [Jouée] épuiser un Personnage
  // adverse de coût 0
  'OP14-090': card({ onPlay: rest(oppChar({ costMax: 0 }), 'Mr 1') }, { rushChar: (s, p) => zeroOrEightAny(s, p, -1) }),

  // Mr 3 : [Tour adverse] [Une fois par tour] s'il devait être mis KO, placer 3 cartes de sa Défausse au-dessous de son deck
  // à la place
  'OP14-092': {
    koReplace: {
      label: 'Mr 3 : placer 3 cartes de ta Défausse au-dessous de ton deck',
      condition: (s, owner, self) => s.active !== owner && !self.usedOpt.includes(MR3_KEY) && s.players[owner].trash.length >= 3,
      apply: (_s, owner, self, ctx) => {
        self.usedOpt.push(MR3_KEY);
        if (trashToBottomCost(3).pay(ownerCtx(ctx, owner, self))) log(ctx.s, owner, 'Mr 3 n’est pas mis KO (3 cartes de la Défausse placées au-dessous du deck)');
      },
    },
  },

  // Mr 5 : [Bloqueur] ; [Jouée] s'il y a un Personnage de coût 0 ou de 8 ou plus, piocher 2 et défausser 1
  'OP14-094': card({ onPlay: when(zeroOrEightAny, seq(drawCards(2), discard(1))) }),

  // Barchan : [Principale] s'il y a un Personnage de coût 0 ou de 8 ou plus, +3 de coût à tous ses Personnages « Baroque
  // Works » jusqu'à la fin du prochain tour adverse ; [Contre] Leader +3000
  'OP14-098': card({
    onMain: when(zeroOrEightAny, modTargets(ownChar({ typeIncludes: BW }), { stat: 'cost', amount: 3 }, 'oppNextEnd', 'Barchan', 'gagne +3 de coût', { all: true })),
    onCounter: leaderCounter(3000, 'Barchan'),
  }, { counterUseful: leaderCounterUseful }),

  // Gecko Moria : [Jouée] un Personnage {Thriller Bark Pirates} de coût 4 ou moins de sa Défausse, joué ou placé face
  // visible au-dessus de sa Vie ; [Déclenchement] jouer un Personnage de coût 4 ou moins de sa Défausse
  'OP14-104': card({ onPlay: moriaPlayOrLife, onTrigger: playFromTrash({ costMax: 4 }, 'Gecko Moria') }),

  // Sœurs gorgones : [Activation : Principale] [Une fois par tour] révéler 3 cartes {Amazon Lily} ou {Kuja Pirates} de sa
  // main : 1 DON!! épuisée à son Leader et à chacun de ses Personnages ; [Déclenchement] avec un Leader {Kuja Pirates}, se
  // jouer
  'OP14-105': card({
    activateMain: {
      label: 'Sœurs gorgones : révéler 3 cartes {Amazon Lily} ou {Équipage des Kuja} pour donner 1 DON!! épuisée à chacune de tes cartes',
      once: true,
      cost: revealCost(3, { anyOf: [{ type: 'Amazon Lily' }, { type: KUJA }] }),
      effect: donToEach,
    },
    onTrigger: when(leaderType(KUJA), playThis()),
  }),

  // Rindo : [Tour adverse] [En cas de KO] la carte du dessus du deck au-dessus de sa Vie, puis il subit 1 dégât ;
  // [Déclenchement] avec un Leader {Kuja Pirates}, se jouer
  'OP14-115': card({
    onKO: seq(lifeFromDeck(), takeDamage),
    onTrigger: when(leaderType(KUJA), playThis()),
  }, { onKOCondition: (s, owner) => s.active !== owner }),

  // Crocodile : [Jouée] un Personnage adverse de coût 9 ou moins ne peut pas attaquer jusqu'à la fin du prochain tour
  // adverse, puis piocher 1 si l'adversaire a un Personnage de coût 0 ou de 8 ou plus ; [En cas de KO] défausser 1 carte :
  // se jouer depuis la Défausse
  'OP14-120': card({
    onPlay: seq(
      grant(oppChar({ costMax: 9 }), { stat: 'cantAttack' }, 'oppNextEnd', 'Crocodile', 'ne peut pas attaquer'),
      when(zeroOrEightOpp, drawCards(1)),
    ),
    onKO: withCost(discardCost(1), playSelfFromTrash('Crocodile'), 'Crocodile'),
  }),
};

