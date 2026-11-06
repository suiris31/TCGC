// OP12, ST25 et ST28 (étape C, tâche S7) : les cartes que le traducteur ne comprend pas, ou qu'il ne sait pas compiler,
// codées à la main d'après le texte officiel (VO et VF, jamais recopié). Le reste des sets est en recettes
// (recipes/sets/op12.ts, st23.ts, st25.ts, st27.ts, st28.ts).
// Choix d'interprétation : game/docs/interpretations.md, section « OP12 et ST23 à ST28 (tâche S7) ».
import {
  addDonFromDeck, addMod, chooseUpTo1, def, describe, donOnField, fieldCost, findField, lifeToHand, log, may, other, reveal,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  activateEventFromHand, card, discard, discardCost, donMinus, drawCards, effect, ko, oppChar, ownChar, playFromHand,
  playThis, powerMod, revealCost, selfKeyword, selfPowerMod, seq, withCost, type Cost, type Effect,
  type Targets,
} from './bricks.ts';

const RAYLEIGH = 'Silvers Rayleigh';
const LAW = 'Trafalgar Law';

const named = (num: string, name: string) => def(num).names.includes(name);

// Le même effet, mais joué par le propriétaire de `self` (remplacements résolus pendant un effet adverse : les questions
// vont au propriétaire)
const ownerCtx = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num,
  ask: (d) => ctx.ask({ ...d, player: d.player ?? owner }),
});

// « jusqu'à 1 de vos Personnages ou [Silvers Rayleigh] » : un Personnage, ou le Leader s'il s'appelle Silvers Rayleigh
const charOrRayleigh: Targets = {
  side: 'own', leader: true, characters: true, label: 'Personnage ou [Silvers Rayleigh]',
  spec: { anyOf: [{ categories: ['CHARACTER'] }, { name: RAYLEIGH }] },
};
// [Contre] « jusqu'à 1 de vos Personnages ou [Silvers Rayleigh] gagne +2000 pendant ce combat » : l'IA connaît la valeur
// quand la carte attaquée en fait partie
const rayleighCounter = (source: string): Effect => ({
  ...powerMod(charOrRayleigh, 2000, 'battle', source),
  power: (s, p, target) => {
    const f = findField(s, target);
    return f && f.player === p && (!f.leader || named(f.card.num, RAYLEIGH)) ? 2000 : 0;
  },
});
const rayleighCounterUseful = (s: GameState, p: PlayerId, target: number) => {
  const f = findField(s, target);
  return Boolean(f && f.player === p && (!f.leader || named(f.card.num, RAYLEIGH)));
};

// Vos [Silvers Rayleigh] sur le terrain (Leader ou Personnages)
const rayleighs = (s: GameState, p: PlayerId) => [s.players[p].leader, ...s.players[p].chars].filter((c) => named(c.num, RAYLEIGH));

// « Vous pouvez donner N cartes DON!! redressées à 1 de vos [Silvers Rayleigh] : ... » ; then reçoit la carte choisie
function giveActiveDonToRayleigh(n: number, then: (ctx: EffectCtx, uid: number) => void, useful: (s: GameState, p: PlayerId) => boolean, source: string): Effect {
  const can = (s: GameState, p: PlayerId) => s.players[p].donActive >= n && rayleighs(s, p).length > 0;
  return effect((ctx) => {
    if (!can(ctx.s, ctx.me)) return;
    if (!may(ctx, `${source} : donner ${n} DON!! redressée${n > 1 ? 's' : ''} à 1 de tes [Silvers Rayleigh] ?`)) return;
    const list = rayleighs(ctx.s, ctx.me).map((c) => c.uid);
    const uid = list.length === 1 ? list[0] : Number(ctx.ask({
      prompt: `${source} : [Silvers Rayleigh] qui reçoit ${n} DON!! :`,
      options: list.map((u) => ({ id: `card:${u}`, label: describe(ctx.s, u), uid: u })),
      tag: 'donTarget',
    }).split(':')[1]);
    const f = findField(ctx.s, uid)!;
    ctx.s.players[ctx.me].donActive -= n;
    f.card.don += n;
    log(ctx.s, ctx.me, `donne ${n} DON!! à ${def(f.card.num).name} (${source})`);
    then(ctx, uid);
  }, (s, p) => can(s, p) && useful(s, p));
}

// « Si cette carte attaque ce tour-ci, votre adversaire ne peut pas activer [Bloqueur] » : la carte est imblocable pour
// le tour (comme n° 1588)
function unblockableThisTurn(ctx: EffectCtx, uid: number, source: string) {
  addMod(ctx.s, { uid, stat: 'keyword', keyword: 'Unblockable', amount: 0, until: 'turn', source });
  log(ctx.s, ctx.me, `l'adversaire ne pourra pas activer [Bloqueur] si ${describe(ctx.s, uid)} attaque ce tour-ci (${source})`);
}
const oppHasBlocker = (s: GameState, p: PlayerId) => s.players[other(p)].chars.some((c) => !c.rested);

// Fluide royal : « puis, vous pouvez épuiser 1 de vos DON!!. Si vous le faites, le Leader et tous les Personnages
// adverses reçoivent −1000 pour le tour » (une DON!! redressée de la zone de Coût)
const supremeKing: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (P.donActive <= 0) return;
  if (!may(ctx, 'Fluide royal : épuiser 1 de tes DON!! pour donner −1000 au Leader et à tous les Personnages adverses ?')) return;
  P.donActive--;
  P.donRested++;
  log(ctx.s, ctx.me, 'épuise 1 DON!! (Fluide royal)');
  const O = ctx.s.players[ctx.opp];
  for (const c of [O.leader, ...O.chars]) addMod(ctx.s, { uid: c.uid, stat: 'power', amount: -1000, until: 'turn', source: 'Fluide royal' });
  log(ctx.s, ctx.me, 'le Leader et tous les Personnages adverses reçoivent −1000 de puissance pour le tour (Fluide royal)');
}, (s, p) => s.players[p].donActive > 0);

// Miss Allsunday : « puis, votre adversaire peut ajouter 1 DON!! redressée de son deck DON!! » (son choix)
const oppMayAddDon: Effect = effect((ctx) => {
  if (ctx.s.players[ctx.opp].donDeck <= 0) return;
  const answer = ctx.ask({
    player: ctx.opp,
    prompt: 'Miss Allsunday : ajouter 1 DON!! redressée de ton deck DON!! ?',
    options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }],
    tag: 'may',
  });
  if (answer === 'yes' && addDonFromDeck(ctx.s, ctx.opp, 1, true)) log(ctx.s, ctx.opp, 'ajoute 1 DON!! redressée (Miss Allsunday)');
}, () => false);

// Technique du son : « jusqu'à 1 de vos [Trafalgar Law] gagne +2000 pour le tour. Puis, si la carte choisie attaque ce
// tour-ci, votre adversaire ne peut pas activer [Bloqueur] »
const silentTechnique: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const list = [P.leader, ...P.chars].filter((c) => named(c.num, LAW)).map((c) => c.uid);
  const uid = chooseUpTo1(ctx, list, 'Technique du son : [Trafalgar Law] qui gagne +2000 de puissance :', 'ownPower');
  if (uid === null) return;
  addMod(ctx.s, { uid, stat: 'power', amount: 2000, until: 'turn', source: 'Technique du son' });
  log(ctx.s, ctx.me, `${describe(ctx.s, uid)} gagne +2000 de puissance pour le tour (Technique du son)`);
  unblockableThisTurn(ctx, uid, 'Technique du son');
}, (s, p) => [s.players[p].leader, ...s.players[p].chars].some((c) => named(c.num, LAW)));

// « Ajoutez cette carte à votre main » ([Déclenchement])
const triggerToHand: Effect = effect((ctx) => {
  if (!ctx.trigger) return;
  ctx.trigger.moved = true;
  ctx.s.players[ctx.me].hand.push(ctx.trigger.card);
  reveal(ctx.s, [ctx.trigger.card.uid], 'both');
  log(ctx.s, ctx.me, `ajoute ${def(ctx.trigger.card.num).name} à sa main`);
});

// Momonosuké : « renvoyer épuisées dans votre zone de Coût un total de 2 de vos DON!! déjà données » (coût)
const returnGivenDon = (n: number): Cost => {
  const given = (s: GameState, p: PlayerId) => [s.players[p].leader, ...s.players[p].chars].filter((c) => c.don > 0);
  return {
    label: `renvoyer épuisées dans ta zone de Coût ${n} de tes DON!! données`,
    can: (s, p) => given(s, p).reduce((t, c) => t + c.don, 0) >= n,
    pay: (ctx) => {
      const P = ctx.s.players[ctx.me];
      if (given(ctx.s, ctx.me).reduce((t, c) => t + c.don, 0) < n) return false;
      for (let i = 0; i < n; i++) {
        const list = given(ctx.s, ctx.me);
        const uid = list.length === 1 ? list[0].uid : Number(ctx.ask({
          prompt: `Momonosuké Kozuki : carte dont 1 DON!! revient épuisée dans ta zone de Coût (${i + 1}/${n}) :`,
          options: list.map((c) => ({ id: `card:${c.uid}`, label: `${describe(ctx.s, c.uid)} (${c.don} DON!!)`, uid: c.uid })),
          tag: 'returnDon',
        }).split(':')[1]);
        findField(ctx.s, uid)!.card.don--;
        P.donRested++;
      }
      log(ctx.s, ctx.me, `renvoie ${n} DON!! données, épuisées, dans sa zone de Coût (Momonosuké Kozuki)`);
      return true;
    },
  };
};

const ROSI_KEY = 'rosinante061';

export const OP12: Record<string, CardBehavior> = {
  // Silvers Rayleigh (Leader) : pas de carte de coût 5 ou plus dans le deck ; [Activation : Principale] [Une fois par
  // tour] révéler 2 Événements de sa main : +2000 pour le tour à un de ses Personnages de 4000 de puissance de base ou moins
  'OP12-001': card({
    activateMain: {
      label: 'Silvers Rayleigh : révéler 2 Événements de ta main pour +2000 à un de tes Personnages de 4000 de puissance de base ou moins',
      once: true,
      cost: revealCost(2, { category: 'EVENT' }),
      effect: powerMod(ownChar({ basePowerMax: 4000 }), 2000, 'turn', 'Silvers Rayleigh'),
    },
  }, { rules: { deckRestriction: (d) => ((d.cost ?? 0) >= 5 ? 'coût 5 ou plus, interdit par le Leader Silvers Rayleigh' : null) } }),

  // Une détermination sans faille : [Principale] donner 2 DON!! redressées à 1 de ses [Silvers Rayleigh] : cette carte est
  // imblocable si elle attaque ce tour-ci ; [Contre] un Personnage ou [Silvers Rayleigh] +2000 pour le combat
  'OP12-016': card({
    onMain: giveActiveDonToRayleigh(2, (ctx, uid) => unblockableThisTurn(ctx, uid, 'Une détermination sans faille'), oppHasBlocker, 'Une détermination sans faille'),
    onCounter: rayleighCounter('Une détermination sans faille'),
  }, { counterUseful: rayleighCounterUseful }),

  // Fluide royal : [Contre] un Personnage ou [Silvers Rayleigh] +2000 pour le combat, puis épuiser 1 DON!! (facultatif) :
  // −1000 pour le tour au Leader et à tous les Personnages adverses
  'OP12-018': card({
    onCounter: seq(rayleighCounter('Fluide royal'), supremeKing),
  }, { counterUseful: rayleighCounterUseful }),

  // Ipponmatsu : [Bloqueur] ; avec un Leader <Tranche> et 6 DON!! épuisées ou plus, ne peut pas être épuisé par les
  // effets adverses
  'OP12-021': {
    cantBeRestedBy: (s, owner) => def(s.players[owner].leader.num).attributes.includes('Slash') && s.players[owner].donRested >= 6,
  },

  // Sanji (Leader) : [Activation : Principale] [Une fois par tour] DON!! −1 : activer un Événement {Straw Hat Crew} de coût
  // de base 3 ou moins de sa main ; [En attaquant] avec autant ou moins de DON!! que l'adversaire, 1 DON!! épuisée
  'OP12-041': card({
    activateMain: {
      label: 'Sanji : DON!! −1 pour activer un Événement {Équipage de Chapeau de paille} de coût de base 3 ou moins de ta main',
      once: true,
      cost: donMinus(1),
      effect: activateEventFromHand({ type: 'Straw Hat Crew', baseCostMax: 3 }, 'Sanji'),
    },
    whenAttacking: effect((ctx) => {
      if (donOnField(ctx.s, ctx.me) > donOnField(ctx.s, ctx.opp)) return;
      if (addDonFromDeck(ctx.s, ctx.me, 1, false)) log(ctx.s, ctx.me, 'ajoute 1 DON!! épuisée (Sanji)');
    }, (s, p) => s.players[p].donDeck > 0 && donOnField(s, p) <= donOnField(s, other(p))),
  }),

  // Don Quijote Rosinante (Leader) : [Une fois par tour] si un de ses [Trafalgar Law] devait être mis KO, il peut ajouter
  // la carte du dessus de sa Vie à sa main à la place ; [Activation : Principale] [Une fois par tour] DON!! −1 : le
  // prochain [Trafalgar Law] de coût 4 ou plus joué de sa main ce tour-ci coûte 2 de moins
  'OP12-061': card({
    activateMain: {
      label: 'Don Quijote Rosinante : DON!! −1 pour que ton prochain [Trafalgar Law] de coût 4 ou plus coûte 2 de moins ce tour-ci',
      once: true,
      cost: donMinus(1),
      effect: effect((ctx) => {
        ctx.s.players[ctx.me].nextPlayDiscount = { turn: ctx.s.turn, name: LAW, costMin: 4, amount: 2 };
        log(ctx.s, ctx.me, 'le prochain [Trafalgar Law] de coût 4 ou plus joué de sa main ce tour-ci coûtera 2 de moins (Don Quijote Rosinante)');
      }, (s, p) => s.players[p].hand.some((c) => named(c.num, LAW) && def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) >= 4)),
    },
  }, {
    koReplaceAlly: {
      label: (_s, _self, victim) => `Don Quijote Rosinante : ajouter la carte du dessus de ta Vie à ta main pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, owner, self, victim) => named(victim.num, LAW) && !self.usedOpt.includes(ROSI_KEY) && s.players[owner].life.length > 0,
      apply: (s, owner, self) => {
        self.usedOpt.push(ROSI_KEY);
        if (lifeToHand(s, owner, 'top')) log(s, owner, 'ajoute la carte du dessus de sa Vie à sa main à la place (Don Quijote Rosinante)');
      },
    },
  }),

  // Miss Allsunday : [Jouée] KO d'un Personnage adverse de coût 3 ou moins, puis l'adversaire peut ajouter 1 DON!!
  // redressée ; [Déclenchement] DON!! −1 : se jouer
  'OP12-075': card({
    onPlay: seq(ko(oppChar({ costMax: 3 }), 'Miss Allsunday'), oppMayAddDon),
    onTrigger: withCost(donMinus(1), playThis(), 'Miss Allsunday'),
  }),

  // Technique du son : [Principale] un de ses [Trafalgar Law] +2000 pour le tour et imblocable s'il attaque ce tour-ci ;
  // [Déclenchement] piocher 1
  'OP12-077': card({ onMain: silentTechnique, onTrigger: drawCards(1) }),

  // Koala (Leader) : quand il attaque le Leader adverse, avec 2 Personnages de coût 8 ou plus, piocher 1 ; [Une fois par
  // tour] quand l'adversaire joue un Personnage de coût de base 8 ou plus, ou un Personnage par l'effet d'un Personnage,
  // l'adversaire ajoute la carte du dessus de sa Vie à sa main
  'OP12-081': {
    when: [
      {
        on: 'attack',
        if: (s, owner, self, e) => e.uid === self.uid && e.target === s.players[other(owner)].leader.uid,
        run: (ctx) => {
          const big = ctx.s.players[ctx.me].chars.filter((c) => fieldCost(ctx.s, c.uid) >= 8).length;
          if (big >= 2) drawCards(1).run(ctx);
        },
      },
      {
        on: 'play',
        once: 'koala081',
        if: (_s, owner, _self, e) => e.player !== owner && e.zone === 'character' && e.num !== undefined
          && ((def(e.num).cost ?? 0) >= 8 || (e.cause === 'effect' && e.sourceNum !== undefined && def(e.sourceNum).category === 'CHARACTER')),
        run: (ctx) => {
          if (lifeToHand(ctx.s, ctx.opp, 'top', ctx.me)) log(ctx.s, ctx.opp, 'ajoute la carte du dessus de sa Vie à sa main (Koala)');
        },
      },
    ],
  },

  // Shirahoshi : si un de ses Personnages de coût de base 6 ou moins devait quitter le terrain à cause d'un effet
  // adverse, il peut retourner face visible la carte du dessus de sa Vie à la place ; [Tour adverse] sans autre
  // [Shirahoshi] de coût de base 2, ses Personnages {Neptunian} +2000
  'OP12-102': {
    aura: (s, owner, source, target) => (s.active !== owner && s.players[owner].chars.some((c) => c.uid === target.uid)
      && def(target.num).types.includes('Neptunian')
      && !s.players[owner].chars.some((c) => c.uid !== source.uid && named(c.num, 'Shirahoshi') && (def(c.num).cost ?? 0) === 2) ? 2000 : 0),
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Shirahoshi : retourner face visible la carte du dessus de ta Vie pour que ${def(victim.num).name} reste sur le terrain`,
      condition: (s, owner, _self, victim) => (def(victim.num).cost ?? 0) <= 6 && s.players[owner].life.length > 0 && !s.players[owner].life[0].faceUp,
      apply: (s, owner) => {
        const top = s.players[owner].life[0];
        top.faceUp = true;
        reveal(s, [top.uid], 'both');
        log(s, owner, `retourne la carte du dessus de sa Vie face visible à la place (${def(top.num).name}, Shirahoshi)`);
      },
    },
  },

  // Pacifista : [Déclenchement] KO d'un Personnage adverse de coût 1 ou moins et ajouter cette carte à sa main
  'OP12-109': card({ onTrigger: seq(ko(oppChar({ costMax: 1 }), 'Pacifista'), triggerToHand) }),
};

// ST25 et ST28 : cartes à la main de la tâche S7
export const ST_S7: Record<string, CardBehavior> = {
  // Crocodile et Mihawk : [Jouée] piocher 2 et défausser 1, puis jouer un Personnage {Cross Guild} de coût 4 ou moins de
  // sa main ; [Une fois par tour] si un de ses Personnages {Cross Guild} devait quitter le terrain à cause d'un effet
  // adverse, il peut défausser 1 carte de sa main à la place
  'ST25-003': card({
    onPlay: seq(drawCards(2), discard(1), playFromHand({ type: 'Cross Guild', costMax: 4 }, 'Crocodile et Mihawk')),
  }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Crocodile et Mihawk : défausser 1 carte de ta main pour que ${def(victim.num).name} reste sur le terrain`,
      condition: (s, owner, _self, victim) => def(victim.num).types.includes('Cross Guild') && s.players[owner].hand.length > 0,
      apply: (_s, owner, self, _victim, ctx) => {
        if (discardCost(1).pay(ownerCtx(ctx, owner, self))) log(ctx.s, owner, 'défausse 1 carte à la place (Crocodile et Mihawk)');
      },
    },
  }),

  // Momonosuké Kozuki : [Votre tour] avec 2 Vies ou moins, son Leader +1000 ; [Activation : Principale] [Une fois par
  // tour] renvoyer 2 DON!! données, épuisées, dans sa zone de Coût : [Initiative] et +1000 pour le tour
  'ST28-004': card({
    activateMain: {
      label: 'Momonosuké Kozuki : renvoyer 2 DON!! données dans ta zone de Coût pour [Initiative] et +1000 de puissance',
      once: true,
      cost: returnGivenDon(2),
      effect: seq(selfKeyword('Rush', 'Momonosuké Kozuki'), selfPowerMod(1000, 'turn', 'Momonosuké Kozuki')),
    },
  }, {
    aura: (s, owner, _source, target) => (s.active === owner && target.uid === s.players[owner].leader.uid && s.players[owner].life.length <= 2 ? 1000 : 0),
  }),
};
