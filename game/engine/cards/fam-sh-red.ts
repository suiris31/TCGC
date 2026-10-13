// FAMILLE DU LEADER LUFFY ROUGE (phase 4E) : cartes rouges {Équipage de Chapeau de paille} jouables en format Standard,
// codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles jouent avec la
// puissance (bonus, malus, KO selon la puissance) et les DON!! données. Chaque condition se vérifie dans la partie. Les
// choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, chooseUpTo1, def, donOnField, findField, hasType, leaderHasType, log, other, power, removeByEffect,
} from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  bothCosts, card, discardCost, drawCards, effect, giveDon, ko, leaderPower, lifeToHandCost, lookTopPlay, oppChar, oppLeaderOrChar, ownChar,
  ownLeaderOrChar, playFromHand, powerMod, restSelf, revealCost, searchTop, selfDon, selfKeyword, seq, untilMyNextEnd, when,
  withCost, type Cost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const shLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SH);
const oppTurn = (s: GameState, p: PlayerId) => s.active !== p;
const givenDon = (s: GameState, p: PlayerId) => [s.players[p].leader, ...s.players[p].chars].reduce((n, c) => n + c.don, 0);
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));

// Mini-Merry : coût « placer 1 de ses Personnages de 1000 de puissance de base au-dessous de son deck »
const bottomOwn1000: Cost = {
  label: 'placer 1 de tes Personnages de 1000 de puissance de base au-dessous de ton deck',
  can: (s, p) => s.players[p].chars.some((c) => def(c.num).power === 1000),
  pay: (ctx) => {
    const list = ctx.s.players[ctx.me].chars.filter((c) => def(c.num).power === 1000).map((c) => c.uid);
    if (!list.length) return false;
    const answer = ctx.ask({
      prompt: 'Personnage de 1000 de puissance de base à placer au-dessous de ton deck :',
      options: list.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })),
      tag: 'returnOwn',
    });
    return removeByEffect(ctx, Number(answer.split(':')[1]), 'deckBottom');
  },
};

// Thousand Sunny : déplacer 1 DON!! donnée vers un de ses Personnages {Équipage de Chapeau de paille}
const moveGivenDon: Effect = {
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const from = chooseUpTo1(ctx, [P.leader, ...P.chars].filter((c) => c.don > 0).map((c) => c.uid), 'Thousand Sunny : carte dont tu déplaces 1 DON!! donnée :', 'donSource');
    if (from === null) return;
    const to = chooseUpTo1(ctx, P.chars.filter((c) => c.uid !== from && hasType(c.num, SH)).map((c) => c.uid), 'Thousand Sunny : Personnage {Équipage de Chapeau de paille} qui reçoit cette DON!! :', 'donTarget');
    if (to === null) return;
    findField(ctx.s, from)!.card.don--;
    findField(ctx.s, to)!.card.don++;
    log(ctx.s, ctx.me, `déplace 1 DON!! donnée vers ${def(findField(ctx.s, to)!.card.num).name} (Thousand Sunny)`);
  },
  // utile pour renforcer un Personnage qui peut encore attaquer avec une DON!! d'une carte qui a déjà attaqué
  useful: (s, p) => {
    const P = s.players[p];
    return [P.leader, ...P.chars].some((c) => c.don > 0 && c.rested) && P.chars.some((c) => !c.rested && hasType(c.num, SH));
  },
};

// Nami (EB03-006) : coût « donner −5000 pour le tour à son Leader redressé »
const leaderMinus5000: Cost = {
  label: 'donner −5000 pour le tour à ton Leader redressé',
  can: (s, p) => !s.players[p].leader.rested,
  pay: (ctx) => {
    const leader = ctx.s.players[ctx.me].leader;
    if (leader.rested) return false;
    addMod(ctx.s, { uid: leader.uid, stat: 'power', amount: -5000, until: 'turn', source: 'Nami' });
    log(ctx.s, ctx.me, 'son Leader reçoit −5000 de puissance pour le tour (Nami)');
    return true;
  },
};

// « Gum-Gum King Kong Gatling » : +3000, puis +1000 si l'adversaire a un Personnage de 7000 ou plus
const kingKong: Effect = seq(
  powerMod(ownLeaderOrChar(), 3000, 'turn', 'Gum-Gum King Kong Gatling'),
  when((s, p) => s.players[other(p)].chars.some((c) => power(s, c.uid) >= 7000), powerMod(ownLeaderOrChar(), 1000, 'turn', 'Gum-Gum King Kong Gatling')),
);

// « Meteor-Strike of Love » : [Principale]/[Contre] prendre en main la Vie du dessus : +3000 pour le tour
const meteor: Effect = withCost(lifeToHandCost('top'), powerMod(ownLeaderOrChar(), 3000, 'turn', 'Meteor-Strike of Love'), 'Meteor-Strike of Love');

// Monkey D. Luffy (OP16-015) : défausser un Personnage de 8000 de puissance : son Leader et lui ont une puissance de
// base de 7000 pour le tour
const luffy7000: Effect = withCost(discardCost(1, { category: 'CHARACTER', powerMin: 8000, powerMax: 8000 }), effect((ctx) => {
  for (const uid of [ctx.s.players[ctx.me].leader.uid, ctx.source]) {
    if (findField(ctx.s, uid)) addMod(ctx.s, { uid, stat: 'basePower', amount: 7000, until: 'turn', source: 'Monkey D. Luffy' });
  }
  log(ctx.s, ctx.me, 'son Leader et Monkey D. Luffy ont une puissance de base de 7000 pour le tour');
}), 'Monkey D. Luffy');

export const FAM_SH_RED: Record<string, CardBehavior> = {
  // Tony-Tony Chopper (EB01-006) : [Bloqueur] ; [DON!! x2] [En attaquant] −3000 à un Personnage adverse
  'EB01-006': card({ whenAttacking: when(selfDon(2), powerMod(oppChar(), -3000, 'turn', 'Tony-Tony Chopper')) }),

  // « Arrête de discuter et viens avec nous !! » : [Contre] 5 cartes du dessus, jouer un {Animal} de coût 3 ou moins
  'EB01-009': card({ onCounter: lookTopPlay(5, { type: 'Animal', costMax: 3 }, 'Arrête de discuter et viens avec nous !!') }, { counterUseful: () => false }),

  // « There's No Way You Could Defeat Me!! » : [Contre] KO d'un Personnage adverse de 6000 de base ou moins ;
  // [Déclenchement] de 5000 de base ou moins
  'EB01-010': card({
    onCounter: ko(oppChar({ basePowerMax: 6000 }), 'There’s No Way You Could Defeat Me!!'),
    onTrigger: ko(oppChar({ basePowerMax: 5000 }), 'There’s No Way You Could Defeat Me!!'),
  }),

  // Mini-Merry (Lieu) : [Activation : Principale] s'épuiser et placer un de ses Personnages de 1000 de base sous le deck :
  // piocher 1
  'EB01-011': card({ activateMain: { label: 'Mini-Merry : t’épuiser et placer un Personnage de 1000 sous ton deck pour piocher 1', cost: bothCosts(restSelf(), bottomOwn1000), effect: drawCards(1) } }),

  // Tony-Tony Chopper (EB02-003) : [DON!! x2] [Tour adverse] +2000 ; [Jouée] avec un Leader {Équipage de Chapeau de
  // paille}, 1 DON!! épuisée à son Leader ou un Personnage
  'EB02-003': card({ onPlay: when(shLeader, giveDon(ownLeaderOrChar(), 1, 'Tony-Tony Chopper')) }, {
    selfPower: (s, p, self) => (oppTurn(s, p) && self.don >= 2 ? 2000 : 0),
  }),

  // Sabot d'acier, Roséo Metel : [Principale] jusqu'à 3 de ses cartes +1000, puis KO d'un Personnage adverse de 3000 ou
  // moins ; [Déclenchement] KO de 4000 ou moins
  'EB02-007': card({
    onMain: seq(powerMod(ownLeaderOrChar(), 1000, 'turn', 'Sabot d’acier, Roséo Metel', 3), ko(oppChar({ powerMax: 3000 }), 'Sabot d’acier, Roséo Metel')),
    onTrigger: ko(oppChar({ powerMax: 4000 }), 'Sabot d’acier, Roséo Metel'),
  }),

  // Thousand Sunny (Lieu) : [Activation : Principale] s'épuiser : déplacer 1 DON!! donnée vers un de ses Personnages
  // {Équipage de Chapeau de paille}
  'EB02-009': card({ activateMain: { label: 'Thousand Sunny : t’épuiser pour déplacer 1 DON!! donnée', cost: restSelf(), effect: moveGivenDon } }),

  // Nami (EB03-006) : [Jouée] −5000 à son Leader redressé : piocher 1 ; [Activation : Principale] [Une fois par tour] avec
  // un Leader {Alabasta}, −1000 à un Personnage adverse
  'EB03-006': card({
    onPlay: withCost(leaderMinus5000, drawCards(1), 'Nami'),
    activateMain: { label: 'Nami : −1000 à un Personnage adverse', once: true, effect: when((s, p) => leaderHasType(s, p, 'Alabasta'), powerMod(oppChar(), -1000, 'turn', 'Nami')) },
  }),

  // Roronoa Zoro (EB04-007) : [Jouée] Leader +2000 jusqu'à la fin du prochain tour adverse ; [Activation : Principale]
  // [Une fois par tour] si l'adversaire a un Personnage de 8000 ou plus, [Initiative : Personnage] pour le tour
  'EB04-007': card({
    onPlay: leaderPower(2000, 'oppNextEnd', 'Roronoa Zoro'),
    activateMain: {
      label: 'Roronoa Zoro : gagner [Initiative : Personnage] pour le tour',
      once: true,
      effect: when((s, p) => s.players[other(p)].chars.some((c) => power(s, c.uid) >= 8000), selfKeyword('Rush: Character', 'Roronoa Zoro')),
    },
  }),

  // Nico Robin (OP05-010) : [Jouée] KO d'un Personnage adverse de 1000 ou moins
  'OP05-010': card({ onPlay: ko(oppChar({ powerMax: 1000 }), 'Nico Robin') }),

  // Monkey.D.Luffy (OP06-013) : [Jouée] et [Déclenchement] 3 cartes du dessus, une carte {FILM}
  'OP06-013': card({
    onPlay: searchTop(3, 1, { type: 'FILM' }, 'une carte {FILM}'),
    onTrigger: searchTop(3, 1, { type: 'FILM' }, 'une carte {FILM}'),
  }),

  // Meteor-Strike of Love : [Principale]/[Contre] prendre en main la Vie du dessus : +3000 pour le tour
  'OP06-017': card({ onMain: meteor, onCounter: meteor }),

  // Gum-Gum King Kong Gatling : [Principale] ; [Déclenchement] KO de 5000 ou moins
  'OP06-018': card({ onMain: kingKong, onTrigger: ko(oppChar({ powerMax: 5000 }), 'Gum-Gum King Kong Gatling') }),

  // Blue Dragon Seal Water Stream : [Principale] KO de 5000 ou moins ; [Déclenchement] de 4000 ou moins
  'OP06-019': card({
    onMain: ko(oppChar({ powerMax: 5000 }), 'Blue Dragon Seal Water Stream'),
    onTrigger: ko(oppChar({ powerMax: 4000 }), 'Blue Dragon Seal Water Stream'),
  }),

  // Tony Tony.Chopper (OP08-007) : [Votre tour] [Jouée]/[En attaquant] 5 cartes du dessus, jouer épuisé un {Animal} de
  // 4000 ou moins
  'OP08-007': card({
    onPlay: when((s, p) => s.active === p, lookTopPlay(5, { type: 'Animal', powerMax: 4000 }, 'Tony Tony.Chopper', { rested: true })),
    whenAttacking: lookTopPlay(5, { type: 'Animal', powerMax: 4000 }, 'Tony Tony.Chopper', { rested: true }),
  }, { attackUseful: () => false }),

  // Cloven Rose : [Principale] jusqu'à 3 Personnages +1000, puis −2000 à un Personnage adverse ; [Déclenchement] −3000 au
  // Leader ou à un Personnage adverse
  'OP08-018': card({
    onMain: seq(powerMod(ownChar(), 1000, 'turn', 'Cloven Rose', 3), powerMod(oppChar(), -2000, 'turn', 'Cloven Rose')),
    onTrigger: powerMod(oppLeaderOrChar(), -3000, 'turn', 'Cloven Rose'),
  }),

  // Sanji (OP10-005) : [Votre tour] +3000 ; [En cas de KO] piocher 1
  'OP10-005': card({ onKO: drawCards(1) }, { selfPower: (s, p) => (s.active === p ? 3000 : 0) }),

  // Tony-Tony Chopper (OP10-011) : [Bloqueur] ; [Tour adverse] +2000
  'OP10-011': { selfPower: (s, p) => (oppTurn(s, p) ? 2000 : 0) },

  // Gum Gum Soucoupe volante : [Principale] −4000 à un Personnage adverse, puis avec 2 Vies ou moins, +1000 ;
  // [Déclenchement] KO de 3000 ou moins
  'OP10-020': card({
    onMain: seq(powerMod(oppChar(), -4000, 'turn', 'Gum Gum Soucoupe volante'),
      when((s, p) => s.players[p].life.length <= 2, powerMod(ownLeaderOrChar(), 1000, 'turn', 'Gum Gum Soucoupe volante'))),
    onTrigger: ko(oppChar({ powerMax: 3000 }), 'Gum Gum Soucoupe volante'),
  }),

  // Roronoa Zoro (OP11-016) : [Activation : Principale] [Une fois par tour] 1 DON!! épuisée à son Leader ou un Personnage
  'OP11-016': card({ activateMain: { label: 'Roronoa Zoro : donner 1 DON!! épuisée', once: true, effect: giveDon(ownLeaderOrChar(), 1, 'Roronoa Zoro') } }),

  // Monkey D. Luffy (OP12-015) : +2000 avec 2 DON!! données ou plus ; [Jouée] révéler 2 Événements : jouer un Personnage
  // rouge de 3000 ou moins de sa main, puis 1 DON!! épuisée à son Leader ou un Personnage
  'OP12-015': card({
    onPlay: withCost(revealCost(2, { category: 'EVENT' }),
      seq(playFromHand({ color: 'Red', powerMax: 3000 }, 'Monkey D. Luffy'), giveDon(ownLeaderOrChar(), 1, 'Monkey D. Luffy')), 'Monkey D. Luffy'),
  }, { selfPower: (s, p) => (givenDon(s, p) >= 2 ? 2000 : 0) }),

  // Monkey D. Luffy (OP14-013) : [Jouée] 5 cartes du dessus, une {Supernovae} autre que [Monkey.D.Luffy] ; [En attaquant]
  // −1000 à un Personnage adverse
  'OP14-013': card({
    onPlay: searchTop(5, 1, { type: 'Supernovas', notName: 'Monkey.D.Luffy' }, 'une carte {Supernovae} autre que [Monkey.D.Luffy]'),
    whenAttacking: powerMod(oppChar(), -1000, 'turn', 'Monkey D. Luffy'),
  }),

  // Monkey D. Luffy (OP16-015) : −2 de coût en main avec un Leader dont le nom inclut « Ace » et 6 DON!! ou plus ;
  // [Attaque adverse] défausser un Personnage de 8000 : son Leader et lui à 7000 de base pour le tour
  'OP16-015': card({ onOpponentAttack: luffy7000 }, {
    handCost: (s, p) => (def(s.players[p].leader.num).names.some((n) => n.includes('Ace')) && donOnField(s, p) >= 6 ? -2 : 0),
  }),

  // Sanji (ST10-004) : [Jouée] si l'adversaire a un Personnage de 5000 ou plus, [Initiative] pour le tour
  'ST10-004': card({ onPlay: when((s, p) => s.players[other(p)].chars.some((c) => power(s, c.uid) >= 5000), selfKeyword('Rush', 'Sanji')) }),

  // Jinbe (ST10-005) : [DON!! x1] [En attaquant] −2000 à un Personnage adverse
  'ST10-005': card({ whenAttacking: when(selfDon(1), powerMod(oppChar(), -2000, 'turn', 'Jinbe')) }),

  // Monkey.D.Luffy (ST10-006) : [Initiative] ; [Une fois par tour] quand l'adversaire active [Bloqueur], KO d'un Personnage
  // adverse de 8000 ou moins
  'ST10-006': {
    when: [{
      on: 'block',
      once: 'luffy10006',
      if: (s, owner, self, e) => e.player === other(owner) && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => ko(oppChar({ powerMax: 8000 }), 'Monkey.D.Luffy').run(ctx),
    }],
  },

  // Gum-Gum Giant Sumo Slap : [Contre] +2000 et KO d'un Personnage adverse de 2000 ou moins
  'ST10-015': card({ onCounter: seq(counterOn(2000, 'Gum-Gum Giant Sumo Slap'), ko(oppChar({ powerMax: 2000 }), 'Gum-Gum Giant Sumo Slap')) }),

  // Gum-Gum Kong Gatling : [Principale] KO de 7000 ou moins ; [Déclenchement] Leader +1000 jusqu'à la fin de son
  // prochain tour
  'ST10-016': card({
    onMain: ko(oppChar({ powerMax: 7000 }), 'Gum-Gum Kong Gatling'),
    onTrigger: effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 1000, until: untilMyNextEnd(ctx.s, ctx.me), source: 'Gum-Gum Kong Gatling' });
      log(ctx.s, ctx.me, 'son Leader gagne +1000 de puissance jusqu’à la fin de son prochain tour (Gum-Gum Kong Gatling)');
    }),
  }),
};
