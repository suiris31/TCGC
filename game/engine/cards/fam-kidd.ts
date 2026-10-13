// FAMILLE DU LEADER KIDD (phase 4E) : cartes jaunes {Supernovae} et {Équipage de Kidd} jouables en format Standard, codées
// d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Beaucoup jouent avec la Vie : la
// retourner, en prendre une carte, y placer un Personnage. Chaque condition se vérifie dans la partie. Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, basePower, canBeRested, chooseUpTo1, def, draw, drawAndDiscard, giveRestedDon, hasType, knownFirst, leaderHasType,
  lifeToHand, log, lookTopPick, removeByEffect, removeFromField, restByEffect, reveal, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  card, discardCost, drawCards, effect, flipTopLife, ko, lifeToHandCost, oppChar, ownChar, powerMod, restDon, restSelf, seq,
  setActiveTargets, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost, isNamed, playTriggerCard } from './common.ts';

const SN = 'Supernovas';  // {Supernovae}
const KP = 'Kid Pirates';  // {Équipage de Kidd}
const snLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SN);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const leaderBattle = (amount: number, source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
});
const drawTrash = (draw: number, trash: number): Effect => effect((ctx) => drawAndDiscard(ctx, draw, trash), (s, p) => s.players[p].deck.length > 0);

// [Déclenchement] « jouez cette carte » sous condition
const playIf = (cond: (s: GameState, p: PlayerId) => boolean): Effect => effect((ctx) => { if (cond(ctx.s, ctx.me)) playTriggerCard(ctx); });

// « KO d'un Personnage adverse ayant un coût inférieur ou égal au nombre de Vies adverses »
const koByOppLife = (source: string): Effect => ({
  run: (ctx) => ko(oppChar({ costMax: ctx.s.players[ctx.opp].life.length }), source).run(ctx),
  useful: (s, p) => s.players[opp(p)].chars.some((c) => (def(c.num).cost ?? 0) <= s.players[opp(p)].life.length),
});

// Damned Punk : regarder la carte du dessus de sa Vie ou de celle de l'adversaire, la laisser dessus ou la mettre dessous
const damnedPunkLook: Effect = effect((ctx) => {
  const whose = ctx.ask({
    prompt: 'Damned Punk : regarder la carte du dessus de quelle Vie ?',
    options: [
      ...(ctx.s.players[ctx.me].life.length ? [{ id: 'me', label: 'Ma Vie' }] : []),
      ...(ctx.s.players[ctx.opp].life.length ? [{ id: 'opp', label: 'La Vie adverse' }] : []),
      { id: 'none', label: 'Aucune' },
    ],
    tag: 'lifeSide',
  });
  if (whose === 'none') return;
  const p = whose === 'me' ? ctx.me : ctx.opp;
  const life = ctx.s.players[p].life;
  const top = life[0];
  reveal(ctx.s, [top.uid], ctx.me);
  const where = ctx.ask({
    prompt: `Damned Punk : tu regardes ${def(top.num).name}. La laisser au-dessus ou la placer au-dessous de la Vie ?`,
    options: [{ id: 'top', label: 'La laisser au-dessus' }, { id: 'bottom', label: 'La placer au-dessous' }],
    tag: 'lifeSide',
    cards: [{ uid: top.uid, num: top.num, owner: p }],
  });
  if (where === 'bottom') life.push(life.shift()!);
  log(ctx.s, ctx.me, `regarde la carte du dessus de ${p === ctx.me ? 'sa' : 'la'} Vie${p === ctx.me ? '' : ' adverse'}${where === 'bottom' ? ' et la place au-dessous' : ''}`);
}, (s, p) => s.players[p].life.length + s.players[opp(p)].life.length > 0);

// « Ajoutez jusqu'à 1 Personnage de coût 9 ou moins au-dessus ou au-dessous de la Vie de son propriétaire, face cachée »
const slamGibson: Effect = {
  run: (ctx) => {
    const list = [...ctx.s.players[ctx.opp].chars, ...ctx.s.players[ctx.me].chars].filter((c) => (def(c.num).cost ?? 0) <= 9).map((c) => c.uid);
    const uid = chooseUpTo1(ctx, list, 'Slam Gibson : Personnage de coût 9 ou moins à placer dans la Vie de son propriétaire :', 'oppRemove');
    if (uid === null) return;
    const where = ctx.ask({
      prompt: 'Au-dessus ou au-dessous de la Vie ?',
      options: [{ id: 'top', label: 'Au-dessus' }, { id: 'bottom', label: 'Au-dessous' }],
      tag: 'lifeSideOpp',
    });
    removeByEffect(ctx, uid, where === 'top' ? 'lifeTopHidden' : 'lifeBottomHidden');
  },
  useful: (s, p) => s.players[opp(p)].chars.some((c) => (def(c.num).cost ?? 0) <= 9),
};

export const FAM_KIDD: Record<string, CardBehavior> = {
  // Black Rope, Great Dragon Twister : [Principale] retourner la Vie du dessus face visible : avec moins de Personnages que
  // l'adversaire, KO d'un Personnage adverse de coût 6 ou moins et d'un de coût 5 ou moins ; [Déclenchement] piocher 2,
  // défausser 1
  'EB04-059': card({
    onMain: withCost(flipTopLife(true), when((s, p) => s.players[p].chars.length < s.players[opp(p)].chars.length,
      seq(ko(oppChar({ costMax: 6 }), 'Black Rope'), ko(oppChar({ costMax: 5 }), 'Black Rope'))), 'Black Rope'),
    onTrigger: drawTrash(2, 1),
  }),

  // Caribou (OP10-104) : [DON!! x1] avec un Leader {Supernovae} et 3 Vies adverses ou plus, pas mis KO en combat
  'OP10-104': {
    cantBeKO: (s, p, self, cause) => cause === 'battle' && self.don >= 1 && snLeader(s, p) && s.players[opp(p)].life.length >= 3,
  },

  // Killer (OP10-106) : [En cas de KO] avec un Leader {Supernovae}, 3 cartes du dessus, une {Supernovae} ou {Équipage de
  // Kidd}
  'OP10-106': card({
    onKO: when(snLeader, effect((ctx) => {
      lookTopPick(ctx, 3, 1, (n) => def(n).types.includes(SN) || def(n).types.includes(KP), 'une carte {Supernovae} ou {Équipage de Kidd}');
    }, (s, p) => s.players[p].deck.length > 0)),
  }),

  // Jewelry Bonney (OP10-107) : [Bloqueur] ; [Jouée] prendre en main la carte du dessus ou du dessous de sa Vie : placer
  // face visible au-dessus de sa Vie un Personnage {Supernovae} de coût 5 de sa main
  'OP10-107': card({
    onPlay: withCost(lifeToHandCost('both'), effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => def(c.num).category === 'CHARACTER' && hasType(c.num, SN) && def(c.num).cost === 5)));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: 'Jewelry Bonney : Personnage {Supernovae} de coût 5 à placer face visible au-dessus de ta Vie :',
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: 'Aucun' }],
        tag: 'toLife',
      });
      if (answer === 'none') return;
      const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
      P.life.unshift({ ...c, faceUp: true });
      log(ctx.s, ctx.me, `place ${def(c.num).name} face visible au-dessus de sa Vie (Jewelry Bonney)`);
    }), 'Jewelry Bonney'),
  }),

  // Scratchmen Apoo (OP10-108) : [Bloqueur] avec un autre Personnage {Supernovae} jaune
  'OP10-108': { blocker: (s, p) => s.players[p].chars.some((c) => hasType(c.num, SN) && def(c.num).colors.includes('Yellow') && !isNamed(c.num, 'Scratchmen Apoo')) },

  // Heat et Wire : [Jouée] épuiser un Personnage adverse de coût inférieur ou égal au nombre de Vies adverses ;
  // [Déclenchement] avec 2 Vies ou moins, se jouer
  'OP10-110': card({
    onPlay: {
      run: (ctx) => {
        const max = ctx.s.players[ctx.opp].life.length;
        const list = ctx.s.players[ctx.opp].chars.filter((c) => !c.rested && canBeRested(ctx.s, c.uid) && (def(c.num).cost ?? 0) <= max).map((c) => c.uid);
        const uid = chooseUpTo1(ctx, list, `Heat et Wire : Personnage adverse de coût ${max} ou moins à épuiser :`, 'oppRest');
        if (uid !== null) restByEffect(ctx, uid);
      },
      useful: (s, p) => s.players[opp(p)].chars.some((c) => !c.rested && (def(c.num).cost ?? 0) <= s.players[opp(p)].life.length),
    },
    onTrigger: playIf((s, p) => s.players[p].life.length <= 2),
  }),

  // Eustass "Captain" Kidd (OP10-112) : [Jouée] s'épuiser : la carte du dessus de la Vie adverse va dans sa Défausse ;
  // [Fin de votre tour] avec 2 Vies adverses ou moins, piocher 1 et défausser 1
  'OP10-112': card({
    onPlay: withCost(restSelf(), effect((ctx) => {
      const O = ctx.s.players[ctx.opp];
      const top = O.life.shift();
      if (!top) return;
      O.trash.push({ uid: top.uid, num: top.num });
      log(ctx.s, ctx.opp, `la carte du dessus de sa Vie va dans sa Défausse : ${def(top.num).name} (${O.life.length} Vie)`);
    }, (s, p) => s.players[opp(p)].life.length > 0), 'Eustass "Captain" Kidd'),
    endOfTurn: when((s, p) => s.players[opp(p)].life.length <= 2, drawTrash(1, 1)),
  }),

  // Roronoa Zoro (OP10-113) : [Initiative] avec moins de Vies que l'adversaire ; [Déclenchement] défausser 1 carte : avec
  // un Leader {Supernovae}, se jouer
  'OP10-113': card({
    onTrigger: withCost(discardCost(1), playIf(snLeader), 'Roronoa Zoro'),
  }, { rush: (s, p) => s.players[p].life.length < s.players[opp(p)].life.length }),

  // « À bientôt... dans le Nouveau Monde » : [Contre] +4000, puis sans Vie, piocher 1 ; [Déclenchement] KO d'un
  // Personnage adverse de coût inférieur ou égal au nombre de Vies adverses
  'OP10-115': card({
    onCounter: seq(counterOn(4000, 'À bientôt... dans le Nouveau Monde'), when((s, p) => s.players[p].life.length === 0, drawCards(1))),
    onTrigger: koByOppLife('À bientôt... dans le Nouveau Monde'),
  }),

  // Damned Punk : [Principale] regarder la Vie du dessus (la sienne ou l'adverse), dessus ou dessous, puis KO de coût 5
  // ou moins ; [Déclenchement] piocher 2, défausser 1
  'OP10-116': card({ onMain: seq(damnedPunkLook, ko(oppChar({ costMax: 5 }), 'Damned Punk')), onTrigger: drawTrash(2, 1) }),

  // ROOM : [Contre] avec 1 Vie ou moins, +3000, puis redresser un de ses Personnages de coût 5 ou moins ; [Déclenchement]
  // piocher 1
  'OP10-117': card({
    onCounter: when((s, p) => s.players[p].life.length <= 1, seq(counterOn(3000, 'ROOM'), setActiveTargets(ownChar({ costMax: 5 }), 'ROOM'))),
    onTrigger: drawCards(1),
  }, { counterUseful: (s, p) => s.players[p].life.length <= 1 }),

  // Trafalgar Law (OP10-119) : [Jouée] révéler un Personnage {Supernovae} de sa main et le placer face cachée au-dessus
  // de sa Vie, puis 1 DON!! épuisée à son Leader {Supernovae}
  'OP10-119': card({
    onPlay: seq(effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => def(c.num).category === 'CHARACTER' && hasType(c.num, SN))));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: 'Trafalgar Law : Personnage {Supernovae} de ta main à révéler et placer face cachée au-dessus de ta Vie :',
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: 'Aucun' }],
        tag: 'toLife',
      });
      if (answer === 'none') return;
      const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
      P.life.unshift(c);
      reveal(ctx.s, [c.uid], 'both');
      log(ctx.s, ctx.me, `révèle ${def(c.num).name} et la place face cachée au-dessus de sa Vie (Trafalgar Law)`);
    }), effect((ctx) => {
      if (snLeader(ctx.s, ctx.me) && ctx.s.players[ctx.me].donRested > 0) giveRestedDon(ctx.s, ctx.me, ctx.s.players[ctx.me].leader.uid, 1);
    })),
  }),

  // Capone "Gang" Bege (OP11-101) : [Bloqueur] ; [Une fois par tour] à la place d'un autre de ses Personnages {Supernovae}
  // retiré par un effet adverse, le placer face cachée au-dessus de sa Vie
  'OP11-101': {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Capone "Gang" Bege : placer ${def(victim.num).name} face cachée au-dessus de ta Vie`,
      condition: (_s, _p, self, victim) => victim.uid !== self.uid && hasType(victim.num, SN),
      apply: (s, p, _self, victim) => {
        removeFromField(s, victim.uid, 'lifeTopHidden');
        log(s, p, `place ${def(victim.num).name} face cachée au-dessus de sa Vie (Capone "Gang" Bege)`);
      },
    },
  },

  // Jewelry Bonney (OP12-101) : [Activation : Principale] s'épuiser : son Leader {Supernovae} +1000 jusqu'à la fin du
  // prochain tour adverse ; [Déclenchement] avec un Leader {Supernovae}, se jouer
  'OP12-101': card({
    activateMain: {
      label: 'Jewelry Bonney : s’épuiser pour donner +1000 à ton Leader {Supernovae} jusqu’à la fin du prochain tour adverse',
      cost: restSelf(),
      effect: when(snLeader, effect((ctx) => {
        addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 1000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Jewelry Bonney' });
        log(ctx.s, ctx.me, 'son Leader gagne +1000 de puissance jusqu’à la fin du prochain tour adverse (Jewelry Bonney)');
      })),
    },
    onTrigger: playIf(snLeader),
  }),

  // Slam Gibson : [Principale] épuiser 5 DON!! : avec un Leader {Supernovae}, un Personnage de coût 9 ou moins va face
  // cachée dans la Vie de son propriétaire ; [Contre] Leader +3000
  'OP12-117': card({
    onMain: withCost(restDon(5), when(snLeader, slamGibson), 'Slam Gibson'),
    onCounter: leaderBattle(3000, 'Slam Gibson'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Jewelry Bonney (OP13-109) : retirée par un effet adverse, retourner la Vie du dessus face visible à la place ;
  // [Déclenchement] piocher 2, défausser 1
  'OP13-109': card({ onTrigger: drawTrash(2, 1) }, {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: () => 'Jewelry Bonney : retourner la carte du dessus de ta Vie face visible pour rester sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].life.length > 0 && !s.players[p].life[0].faceUp,
      apply: (s, p) => {
        const top = s.players[p].life[0];
        top.faceUp = true;
        reveal(s, [top.uid], 'both');
        log(s, p, `retourne la carte du dessus de sa Vie face visible (${def(top.num).name}) : Jewelry Bonney reste sur le terrain`);
      },
    },
  }),

  // Urouge (OP15-099) : [Jouée] défausser une carte {Supernovae} : [Initiative] pour le tour ; [Activation : Principale]
  // retourner la Vie du dessus face cachée : 1 DON!! épuisée à son Leader ou un Personnage
  'OP15-099': card({
    onPlay: withCost(discardCost(1, { type: SN }), effect((ctx) => {
      addMod(ctx.s, { uid: ctx.source, stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source: 'Urouge' });
      log(ctx.s, ctx.me, 'Urouge gagne [Initiative] pour le tour');
    }), 'Urouge'),
    activateMain: {
      label: 'Urouge : retourner la carte du dessus de ta Vie face cachée pour donner 1 DON!! épuisée',
      cost: flipTopLife(false),
      effect: effect((ctx) => {
        const list = [ctx.s.players[ctx.me].leader, ...ctx.s.players[ctx.me].chars].map((c) => c.uid);
        const uid = chooseUpTo1(ctx, list, 'Urouge : carte qui reçoit 1 DON!! épuisée :', 'donTarget');
        if (uid !== null) giveRestedDon(ctx.s, ctx.me, uid, 1);
      }, (s, p) => s.players[p].donRested > 0),
    },
  }),

  // Jewelry Bonney (OP15-105) : à la place d'un de ses Personnages de 7000 de puissance de base ou moins retiré par un
  // effet adverse, prendre en main la carte du dessus de sa Vie
  'OP15-105': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Jewelry Bonney : prendre en main la carte du dessus de ta Vie, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, _self, victim) => basePower(s, victim.uid) <= 7000 && s.players[p].life.length > 0,
      apply: (s, p) => { lifeToHand(s, p, 'top'); },
    },
  },

  // Caribou (OP17-101) : [Activation : Principale] [Une fois par tour] prendre en main la Vie du dessus : −3000 à un
  // Personnage adverse ; [Déclenchement] défausser 1 carte : KO de coût 5 ou moins
  'OP17-101': card({
    activateMain: {
      label: 'Caribou : prendre en main la carte du dessus de ta Vie pour donner −3000 à un Personnage adverse',
      once: true,
      cost: lifeToHandCost('top'),
      effect: powerMod(oppChar(), -3000, 'turn', 'Caribou'),
    },
    onTrigger: withCost(discardCost(1), ko(oppChar({ costMax: 5 }), 'Caribou'), 'Caribou'),
  }),

  // Trafalgar Law (P-155) : [En attaquant] défausser une carte à [Déclenchement] : −2000 ; [Déclenchement] avec 3 Vies
  // adverses ou moins, se jouer
  'P-155': card({
    whenAttacking: withCost(discardCost(1, { trigger: true }), powerMod(oppChar(), -2000, 'turn', 'Trafalgar Law'), 'Trafalgar Law'),
    onTrigger: playIf((s, p) => s.players[opp(p)].life.length <= 3),
  }),

  // Monkey D. Luffy (ST13-015) : [Activation : Principale] [Une fois par tour] +2000 jusqu'au début de son prochain tour,
  // puis avec 1 Vie ou plus, piocher 1 et la Vie du dessus va dans la Défausse
  'ST13-015': card({
    activateMain: {
      label: 'Luffy : +2000 jusqu’à ton prochain tour, puis piocher 1 carte et défausser la carte du dessus de ta Vie',
      once: true,
      effect: seq(effect((ctx) => {
        addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 2000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Monkey D. Luffy' });
        log(ctx.s, ctx.me, 'Monkey D. Luffy gagne +2000 de puissance jusqu’au début de son prochain tour');
      }), when((s, p) => s.players[p].life.length > 0, effect((ctx) => {
        draw(ctx.s, ctx.me, 1);
        const P = ctx.s.players[ctx.me];
        const top = P.life.shift()!;
        P.trash.push({ uid: top.uid, num: top.num });
        log(ctx.s, ctx.me, `pioche 1 carte et place la carte du dessus de sa Vie dans sa Défausse (${def(top.num).name})`);
      }))),
    },
  }),
};

