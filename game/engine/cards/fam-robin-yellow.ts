// FAMILLE DU LEADER ROBIN, CARTES JAUNES (phase 4E) : cartes jaunes {Équipage de Chapeau de paille} jouables en format
// Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles jouent avec la
// Vie (la retourner, la défausser, y ajouter des cartes) et les [Déclenchement]. Chaque condition se vérifie dans la
// partie. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, addTopDeckToLife, basePower, def, discardFromHand, donOnField, drawAndDiscard, findField, hasType, knownFirst, leaderHasType,
  log, reveal, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  bothCosts, bounce, card, discardCost, drawCards, effect, flipTopLife, giveDon, grant, ko, leaderNamed, leaderPower, leaderType,
  lifeFromDeck, lifeIntoHand, lifeToHandCost, oppChar, oppLeaderOrChar, oppLifeToHand, ownChar, ownLeader, ownLeaderOrChar,
  playFromHand, powerMod, rest, restDon, restSelf, searchTop, seq, trashSelf, untilMyNextEnd, when, withCost, type Cost, type Effect,
} from './bricks.ts';
import { counterBoost, playCharFromHand, playTriggerCard } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const EGG = 'Egghead';
const shLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SH);
const eggLeader = leaderType(EGG);
const luffyLeader = leaderNamed('Monkey.D.Luffy');
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const lifeAtMost = (n: number) => (s: GameState, p: PlayerId) => s.players[p].life.length <= n;
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const drawTrash = (n: number, trash: number): Effect => effect((ctx) => drawAndDiscard(ctx, n, trash), (s, p) => s.players[p].deck.length > 0);
const playSelf: Effect = effect((ctx) => playTriggerCard(ctx));
const playSelfIf = (cond: (s: GameState, p: PlayerId, self: number) => boolean): Effect => when(cond, playSelf);
const luffyCard = ownLeaderOrChar({ name: 'Monkey.D.Luffy' });

// « Placez 1 carte du dessus de votre Vie dans votre Défausse » (coût)
const trashTopLifeCost: Cost = {
  label: 'placer la carte du dessus de ta Vie dans ta Défausse',
  can: (s, p) => s.players[p].life.length > 0,
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const top = P.life.shift();
    if (!top) return false;
    P.trash.push({ uid: top.uid, num: top.num });
    reveal(ctx.s, [top.uid], 'both');
    log(ctx.s, ctx.me, `place la carte du dessus de sa Vie dans sa Défausse : ${def(top.num).name} (${P.life.length} Vie)`);
    return true;
  },
};
const trashTopLife: Effect = effect((ctx) => { trashTopLifeCost.pay(ctx); }, (s, p) => s.players[p].life.length > 0);

// « Ajoutez jusqu'à N cartes du dessus de votre deck au-dessus de votre Vie »
const lifeFromDeckN = (n: number): Effect => effect((ctx) => {
  for (let i = 0; i < n; i++) addTopDeckToLife(ctx.s, ctx.me);
}, (s, p) => s.players[p].deck.length > 0);

// « Ajoutez jusqu'à 1 carte de votre main au-dessus de votre Vie » (face cachée ; le joueur sait laquelle)
const handToLife = (source: string, filter: (num: string) => boolean = () => true, faceUp = false): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => filter(c.num))));
  if (!options.length) return;
  const answer = ctx.ask({
    prompt: `${source} : carte de ta main à placer au-dessus de ta Vie${faceUp ? ' face visible' : ''} :`,
    options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
    tag: 'toLife',
  });
  if (answer === 'none') return;
  const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
  P.life.unshift(faceUp ? { ...c, faceUp: true } : c);
  reveal(ctx.s, [c.uid], faceUp ? 'both' : ctx.me);
  log(ctx.s, ctx.me, faceUp ? `place ${def(c.num).name} face visible au-dessus de sa Vie (${source})` : `place 1 carte de sa main au-dessus de sa Vie (${source})`);
}, (s, p) => s.players[p].hand.some((c) => filter(c.num)));

// « Ajoutez cette carte à votre main » ([Déclenchement])
const triggerToHand: Effect = effect((ctx) => {
  if (!ctx.trigger) return;
  ctx.trigger.moved = true;
  ctx.s.players[ctx.me].hand.push(ctx.trigger.card);
  reveal(ctx.s, [ctx.trigger.card.uid], 'both');
  log(ctx.s, ctx.me, `ajoute ${def(ctx.trigger.card.num).name} à sa main`);
});

// « Placez la carte du dessus de la Vie adverse dans sa Défausse » (sans [Déclenchement])
const trashOppTopLife: Effect = effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  const top = O.life.shift();
  if (!top) return;
  O.trash.push({ uid: top.uid, num: top.num });
  reveal(ctx.s, [top.uid], 'both');
  log(ctx.s, ctx.opp, `la carte du dessus de sa Vie va dans sa Défausse : ${def(top.num).name} (${O.life.length} Vie)`);
}, (s, p) => s.players[opp(p)].life.length > 0);

// Nico Robin (EB03-055) : « vous pouvez infliger 1 dégât à votre adversaire »
const dealDamage: Effect = effect((ctx) => {
  const answer = ctx.ask({ prompt: 'Nico Robin : infliger 1 dégât à ton adversaire ?', options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }], tag: 'may' });
  if (answer !== 'yes') return;
  const O = ctx.s.players[ctx.opp];
  log(ctx.s, ctx.me, 'inflige 1 dégât à son adversaire (Nico Robin)');
  ctx.s.pending.unshift({ kind: 'system', action: 'leaderDamage', source: O.leader.uid, num: O.leader.num, controller: ctx.opp, answers: [], data: { amount: 1 } });
});

// Monkey D. Luffy (OP15-119) : quand l'adversaire active un Événement ou [Bloqueur], révéler la Vie du dessus : +1000 par
// point de coût
const luffyRevealIf = (s: GameState, owner: PlayerId, self: FieldCard, e: GameEvent) => e.player === opp(owner) && s.players[owner].chars.some((c) => c.uid === self.uid);
const luffyRevealRun = (ctx: EffectCtx) => {
  const top = ctx.s.players[ctx.me].life[0];
  if (!top || !findField(ctx.s, ctx.source)) return;
  reveal(ctx.s, [top.uid], 'both');
  const cost = def(top.num).cost ?? 0;
  log(ctx.s, ctx.me, `révèle la carte du dessus de sa Vie : ${def(top.num).name} (coût ${cost})`);
  if (!cost) return;
  addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 1000 * cost, until: 'turn', source: 'Monkey D. Luffy' });
  log(ctx.s, ctx.me, `Monkey D. Luffy gagne +${1000 * cost} de puissance pour le tour`);
};

// Sanji (EB04-052) : sa puissance de base devient celle du Leader adverse pour le tour
const copyOppLeaderBase: Effect = effect((ctx) => {
  const amount = basePower(ctx.s, ctx.s.players[ctx.opp].leader.uid);
  addMod(ctx.s, { uid: ctx.source, stat: 'basePower', amount, until: 'turn', source: 'Sanji' });
  log(ctx.s, ctx.me, `la puissance de base de Sanji devient ${amount} pour le tour`);
});

export const FAM_ROBIN_YELLOW: Record<string, CardBehavior> = {
  // Sanji (EB02-054) : [Bloqueur] ; [Jouée] avec 2 Vies ou moins, piocher 2 et défausser 1
  'EB02-054': card({ onPlay: when(lifeAtMost(2), drawTrash(2, 1)) }),

  // Jinbe (EB02-055) : [Déclenchement] avec un Leader {Homme-poisson} ou {Triton} et 2 Vies ou moins, se jouer
  'EB02-055': card({ onTrigger: playSelfIf((s, p) => (leaderHasType(s, p, 'Fish-Man') || leaderHasType(s, p, 'Merfolk')) && lifeAtMost(2)(s, p)) }),

  // « Sans toi... jamais je ne pourrai devenir le roi des pirates !! » : [Contre] +1000, puis avec 1 Vie ou moins, jouer de
  // sa main un Personnage jaune {Équipage de Chapeau de paille} ou [Sanji] de coût 5 ou moins
  'EB02-059': card({
    onCounter: seq(counterOn(1000, 'Sans toi...'), when(lifeAtMost(1), effect((ctx) => {
      playCharFromHand(ctx, (c) => ((def(c.num).colors.includes('Yellow') && hasType(c.num, SH)) || def(c.num).names.includes('Sanji')) && (def(c.num).cost ?? 0) <= 5,
        'Sans toi... : jouer un Personnage jaune {Équipage de Chapeau de paille} ou [Sanji] de coût 5 ou moins de ta main :');
    }))),
  }),

  // Vogue Merry (Lieu, EB02-060) : [Activation : Principale] s'épuiser et retourner la Vie du dessus face visible : un
  // Personnage {Équipage de Chapeau de paille} +1000 jusqu'à la fin du prochain tour adverse
  'EB02-060': card({
    activateMain: {
      label: 'Vogue Merry : t’épuiser et retourner ta Vie du dessus pour donner +1000',
      cost: bothCosts(restSelf(), flipTopLife(true)),
      effect: powerMod(ownChar({ type: SH }), 1000, 'oppNextEnd', 'Vogue Merry'),
    },
  }),

  // Nami (EB03-053) : [Jouée] 1 DON!! épuisée à son Leader, puis si l'adversaire a 3 Vies ou plus, la Vie du dessus
  // adverse dans sa main ; [En cas de KO] retourner la Vie du dessus face visible : jouer de sa main un Personnage de
  // 6000 ou moins
  'EB03-053': card({
    onPlay: seq(giveDon(ownLeader(), 1, 'Nami'), when((s, p) => s.players[opp(p)].life.length >= 3, oppLifeToHand())),
    onKO: withCost(flipTopLife(true), playFromHand({ powerMax: 6000 }, 'Nami'), 'Nami'),
  }),

  // Nico Robin (EB03-054) : [Jouée] défausser la Vie du dessus : la carte du dessus du deck dans la Vie ; [Déclenchement]
  // défausser 1 carte : se jouer
  'EB03-054': card({ onPlay: withCost(trashTopLifeCost, lifeFromDeck(), 'Nico Robin'), onTrigger: withCost(discardCost(1), playSelf, 'Nico Robin') }),

  // Nico Robin (EB03-055) : [Jouée] défausser la Vie du dessus : avec un Leader {Équipage de Chapeau de paille}, 2 cartes
  // du deck dans la Vie ; [Tour adverse] [En cas de KO] infliger 1 dégât à l'adversaire
  'EB03-055': card({ onPlay: withCost(trashTopLifeCost, when(shLeader, lifeFromDeckN(2)), 'Nico Robin'), onKO: dealDamage }, {
    onKOCondition: (s, owner) => s.active !== owner,
  }),

  // « Accepterais-tu de devenir mon serviteur ? » : [Principale] et [Déclenchement] avec le Leader [Nami], 4 cartes du
  // dessus, une de coût 2 à 8
  'EB03-060': card({
    onMain: when(leaderNamed('Nami'), searchTop(4, 1, { costMin: 2, costMax: 8 }, 'une carte de coût 2 à 8')),
    onTrigger: when(leaderNamed('Nami'), searchTop(4, 1, { costMin: 2, costMax: 8 }, 'une carte de coût 2 à 8')),
  }),

  // Sanji (EB04-052) : [En attaquant] puissance de base celle du Leader adverse ; [En cas de KO] avec 2 Vies ou moins,
  // jouer de sa main un Personnage jaune de 6000 ou moins
  'EB04-052': card({ whenAttacking: copyOppLeaderBase, onKO: when(lifeAtMost(2), playFromHand({ color: 'Yellow', powerMax: 6000 }, 'Sanji')) }),

  // Gum Gum Hawk Rafale : [Principale] Vie du dessus ou du dessous en main : un Personnage {Egghead} de sa main face visible
  // au-dessus de sa Vie, puis −1000 ; [Déclenchement] piocher 2, défausser 1
  'EB04-060': card({
    onMain: withCost(lifeToHandCost('both'), seq(handToLife('Gum Gum Hawk Rafale', (n) => def(n).category === 'CHARACTER' && hasType(n, EGG), true),
      powerMod(oppChar(), -1000, 'turn', 'Gum Gum Hawk Rafale')), 'Gum Gum Hawk Rafale'),
    onTrigger: drawTrash(2, 1),
  }),

  // Monkey D. Luffy (EB04-061) : −1 en main avec 1 Vie ou moins ; [Jouée] défausser 1 carte : Leader +2000 et [Bloqueur]
  // jusqu'à la fin du prochain tour adverse
  'EB04-061': card({
    onPlay: withCost(discardCost(1), seq(leaderPower(2000, 'oppNextEnd', 'Monkey D. Luffy'), effect((ctx) => {
      addMod(ctx.s, { uid: ctx.source, stat: 'keyword', keyword: 'Blocker', amount: 0, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Monkey D. Luffy' });
      log(ctx.s, ctx.me, 'Monkey D. Luffy gagne [Bloqueur] jusqu’à la fin du prochain tour adverse');
    })), 'Monkey D. Luffy'),
  }, { handCost: (s, p) => (s.players[p].life.length <= 1 ? -1 : 0) }),

  // O-Nami (OP06-101) : [Jouée] [Exil] pour le tour à son Leader ou un Personnage ; [Déclenchement] KO de coût 5 ou moins
  'OP06-101': card({
    onPlay: grant(ownLeaderOrChar(), { stat: 'keyword', keyword: 'Banish' }, 'turn', 'O-Nami', 'gagne [Exil]'),
    onTrigger: ko(oppChar({ costMax: 5 }), 'O-Nami'),
  }),

  // Usopp (OP07-099) : [Déclenchement] son Leader ou un Personnage {Egghead} +2000 jusqu'à la fin de son prochain tour
  'OP07-099': card({
    onTrigger: effect((ctx) => {
      const list = [ctx.s.players[ctx.me].leader, ...ctx.s.players[ctx.me].chars].filter((c) => hasType(c.num, EGG)).map((c) => c.uid);
      if (!list.length) return;
      const answer = ctx.ask({
        prompt: 'Usopp : Leader ou Personnage {Egghead} qui gagne +2000 jusqu’à la fin de ton prochain tour :',
        options: [...list.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })), { id: 'none', label: 'Aucun' }],
        tag: 'ownPower',
      });
      if (answer === 'none') return;
      addMod(ctx.s, { uid: Number(answer.split(':')[1]), stat: 'power', amount: 2000, until: untilMyNextEnd(ctx.s, ctx.me), source: 'Usopp' });
      log(ctx.s, ctx.me, '+2000 jusqu’à la fin de son prochain tour (Usopp)');
    }),
  }),

  // Jinbe (OP07-102) : [Déclenchement] renvoyer un Personnage adverse de coût 4 ou moins, et cette carte en main
  'OP07-102': card({ onTrigger: seq(bounce(oppChar({ costMax: 4 }), 'Jinbe'), triggerToHand) }),

  // Tony Tony.Chopper (OP07-103) : [Déclenchement] un Personnage {Egghead} gagne [Bloqueur] pour le tour, et cette carte en
  // main
  'OP07-103': card({
    onTrigger: seq(grant(ownChar({ type: EGG }), { stat: 'keyword', keyword: 'Blocker' }, 'turn', 'Tony Tony.Chopper', 'gagne [Bloqueur]'), triggerToHand),
  }),

  // Nico Robin (OP07-104) : [Déclenchement] avec un Leader {Egghead}, piocher 2
  'OP07-104': card({ onTrigger: when(eggLeader, drawCards(2)) }),

  // Franky (OP07-107) : [Déclenchement] piocher 1, puis avec 1 Vie ou moins, se jouer
  'OP07-107': card({ onTrigger: seq(drawCards(1), playSelfIf(lifeAtMost(1))) }),

  // Monkey D. Luffy (OP07-109) : [Activation : Principale] se placer dans la Défausse : avec 2 Vies ou moins, KO de coût 4
  // ou moins, puis piocher 1 ; [Déclenchement] KO de coût 4 ou moins
  'OP07-109': card({
    activateMain: {
      label: 'Monkey D. Luffy : te placer dans ta Défausse pour mettre KO et piocher',
      cost: trashSelf(),
      effect: seq(when(lifeAtMost(2), ko(oppChar({ costMax: 4 }), 'Monkey D. Luffy')), drawCards(1)),
    },
    onTrigger: ko(oppChar({ costMax: 4 }), 'Monkey D. Luffy'),
  }),

  // Roronoa Zoro (OP07-113) : [Déclenchement] avec un Leader {Egghead}, épuiser le Leader ou un Personnage adverse
  'OP07-113': card({ onTrigger: when(eggLeader, rest(oppLeaderOrChar(), 'Roronoa Zoro')) }),

  // Nami (OP08-106) : [Jouée] et [Déclenchement] défausser une carte à [Déclenchement] : KO de coût 5 ou moins, puis avec 3
  // cartes ou moins en main, piocher 1
  'OP08-106': card({
    onPlay: withCost(discardCost(1, { trigger: true }), seq(ko(oppChar({ costMax: 5 }), 'Nami'), when((s, p) => s.players[p].hand.length <= 3, drawCards(1))), 'Nami'),
    onTrigger: withCost(discardCost(1, { trigger: true }), seq(ko(oppChar({ costMax: 5 }), 'Nami'), when((s, p) => s.players[p].hand.length <= 3, drawCards(1))), 'Nami'),
  }),

  // Sanji (OP09-105) : [Déclenchement] avec un Leader {Egghead}, la carte du dessus du deck dans la Vie, puis défausser 2
  'OP09-105': card({ onTrigger: when(eggLeader, seq(lifeFromDeck(), effect((ctx) => { discardFromHand(ctx, ctx.me, 2, 'Sanji : carte à défausser :'); }))) }),

  // Nico Robin (OP09-107) : [Jouée] si l'adversaire a 3 Vies ou plus, sa Vie du dessus dans sa Défausse ; [Déclenchement]
  // jouer de sa main un Personnage jaune de coût 3 ou moins
  'OP09-107': card({
    onPlay: when((s, p) => s.players[opp(p)].life.length >= 3, trashOppTopLife),
    onTrigger: playFromHand({ color: 'Yellow', costMax: 3 }, 'Nico Robin'),
  }),

  // Brook (OP09-111) : [Déclenchement] avec un Leader {Egghead} et 6 cartes ou plus dans la main adverse, l'adversaire
  // défausse 2 cartes
  'OP09-111': card({
    onTrigger: when((s, p) => eggLeader(s, p, -1) && s.players[opp(p)].hand.length >= 6, effect((ctx) => { discardFromHand(ctx, ctx.opp, 2, 'Brook : carte à défausser :'); })),
  }),

  // Gum Gum Red Hawk : [Principale] épuiser 3 DON!! : avec 5 Vies ou plus au total, KO de coût de base 5 ou moins ; [Contre]
  // Leader +3000
  'OP11-114': card({
    onMain: withCost(restDon(3), when((s) => s.players[0].life.length + s.players[1].life.length >= 5, ko(oppChar({ baseCostMax: 5 }), 'Gum Gum Red Hawk')), 'Gum Gum Red Hawk'),
    onCounter: leaderPower(3000, 'battle', 'Gum Gum Red Hawk'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Gum Gum Dawn Stamp : [Principale] retourner la Vie du dessus face visible : KO de coût de base 6 ou moins ;
  // [Déclenchement] piocher 1
  'OP13-117': card({ onMain: withCost(flipTopLife(true), ko(oppChar({ baseCostMax: 6 }), 'Gum Gum Dawn Stamp'), 'Gum Gum Dawn Stamp'), onTrigger: drawCards(1) }),

  // Nami (OP15-108) : [Jouée] 3 cartes du dessus, une {Île céleste}
  'OP15-108': card({ onPlay: searchTop(3, 1, { type: 'Sky Island' }, 'une carte {Île céleste}') }),

  // Nico Robin (OP15-109) : [Jouée] Vie du dessus en main : avec un Leader {Équipage de Chapeau de paille}, la carte du
  // dessus du deck dans la Vie, puis jouer de sa main un {Île céleste} de coût 5 ou moins
  'OP15-109': card({
    onPlay: withCost(lifeToHandCost('top'), when(shLeader, seq(lifeFromDeck(), playFromHand({ type: 'Sky Island', costMax: 5 }, 'Nico Robin'))), 'Nico Robin'),
  }),

  // Roronoa Zoro (OP15-113) : [Jouée] défausser 1 carte : la carte du dessus du deck dans la Vie
  'OP15-113': card({ onPlay: withCost(discardCost(1), lifeFromDeck(), 'Roronoa Zoro') }),

  // Impact Dial : [Principale] KO de coût 4 ou moins, puis la Vie du dessus en main ; [Déclenchement] KO de coût 4 ou moins
  'OP15-115': card({ onMain: seq(ko(oppChar({ costMax: 4 }), 'Impact Dial'), lifeIntoHand('top')), onTrigger: ko(oppChar({ costMax: 4 }), 'Impact Dial') }),

  // Gum Gum Carabine Dorée : [Principale] avec un Leader {Équipage de Chapeau de paille}, la Vie du dessus dans la
  // Défausse, puis la carte du dessus du deck dans la Vie et défausser 1 carte ; [Contre] Leader +4000
  'OP15-116': card({
    onMain: when(shLeader, seq(trashTopLife, lifeFromDeck(), effect((ctx) => { discardFromHand(ctx, ctx.me, 1, 'Gum Gum Carabine Dorée : carte à défausser :'); }))),
    onCounter: leaderPower(4000, 'battle', 'Gum Gum Carabine Dorée'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Monkey D. Luffy (OP15-119) : [Initiative] avec 6 DON!! ou plus ; quand l'adversaire active un Événement ou [Bloqueur],
  // révéler la Vie du dessus : +1000 par point de coût
  'OP15-119': {
    rush: (s, p) => donOnField(s, p) >= 6,
    when: [
      { on: 'event', if: luffyRevealIf, run: luffyRevealRun },
      { on: 'block', if: luffyRevealIf, run: luffyRevealRun },
    ],
  },

  // Roronoa Zoro (P-042) : [Déclenchement] KO de coût 4 ou moins
  'P-042': card({ onTrigger: ko(oppChar({ costMax: 4 }), 'Roronoa Zoro') }),

  // Monkey D. Luffy (P-106) : [Fin de votre tour] retourner la Vie du dessus face visible : redresser un Personnage
  // {Egghead} ; [Déclenchement] piocher 1 et KO de coût 2 ou moins
  'P-106': card({
    endOfTurn: withCost(flipTopLife(true), effect((ctx) => {
      const list = ctx.s.players[ctx.me].chars.filter((c) => c.rested && hasType(c.num, EGG));
      if (!list.length) return;
      const answer = ctx.ask({
        prompt: 'Monkey D. Luffy : Personnage {Egghead} à redresser :',
        options: [...list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: 'Aucun' }],
        tag: 'ownReady',
      });
      if (answer !== 'none') findField(ctx.s, Number(answer.split(':')[1]))!.card.rested = false;
    }, (s, p) => s.players[p].chars.some((c) => c.rested && hasType(c.num, EGG))), 'Monkey D. Luffy'),
    onTrigger: seq(drawCards(1), ko(oppChar({ costMax: 2 }), 'Monkey D. Luffy')),
  }),

  // Gum-Gum Jet Spear : [Contre] +2000, puis sans Vie, piocher 1 ; [Déclenchement] Vie du dessus ou du dessous en main : une
  // carte de sa main au-dessus de sa Vie
  'ST13-018': card({
    onCounter: seq(counterOn(2000, 'Gum-Gum Jet Spear'), when(lifeAtMost(0), drawCards(1))),
    onTrigger: withCost(lifeToHandCost('both'), handToLife('Gum-Gum Jet Spear'), 'Gum-Gum Jet Spear'),
  }),

  // Usopp (ST29-002) : [Jouée]/[En attaquant] épuiser un Personnage adverse de coût inférieur ou égal au nombre de Vies
  // adverses
  'ST29-002': card({
    onPlay: effect((ctx) => rest(oppChar({ costMax: ctx.s.players[ctx.opp].life.length }), 'Usopp').run(ctx), (s, p) => s.players[opp(p)].chars.some((c) => (def(c.num).cost ?? 0) <= s.players[opp(p)].life.length)),
    whenAttacking: effect((ctx) => rest(oppChar({ costMax: ctx.s.players[ctx.opp].life.length }), 'Usopp').run(ctx), (s, p) => s.players[opp(p)].chars.some((c) => (def(c.num).cost ?? 0) <= s.players[opp(p)].life.length)),
  }, { attackUseful: () => false }),

  // Sanji (ST29-004) : [Jouée] 4 cartes du dessus, une {Équipage de Chapeau de paille} ; [Déclenchement] défausser 1
  // carte : se jouer
  'ST29-004': card({ onPlay: searchTop(4, 1, { type: SH }, 'une carte {Équipage de Chapeau de paille}'), onTrigger: withCost(discardCost(1), playSelf, 'Sanji') }),

  // Jinbe (ST29-005), Nico Robin (ST29-009) : [Déclenchement] avec le Leader [Monkey.D.Luffy], se jouer
  'ST29-005': card({ onTrigger: playSelfIf(luffyLeader) }),
  'ST29-009': card({ onTrigger: playSelfIf(luffyLeader) }),

  // Tony-Tony Chopper (ST29-007) : [En cas de KO] Vie du dessus ou du dessous en main : une carte de sa main au-dessus de
  // sa Vie ; [Déclenchement] un de ses [Monkey.D.Luffy] +2000 pour le tour
  'ST29-007': card({
    onKO: withCost(lifeToHandCost('both'), handToLife('Tony-Tony Chopper'), 'Tony-Tony Chopper'),
    onTrigger: powerMod(luffyCard, 2000, 'turn', 'Tony-Tony Chopper'),
  }),

  // Nami (ST29-008) : à la place d'un de ses Personnages {Egghead} mis KO par un effet adverse, retourner la Vie du dessus
  // face visible ; [Déclenchement] avec le Leader [Monkey.D.Luffy], se jouer
  'ST29-008': card({ onTrigger: playSelfIf(luffyLeader) }, {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: true,
      label: (_s, _self, victim) => `Nami : retourner ta Vie du dessus face visible pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, p, _self, victim) => hasType(victim.num, EGG) && s.players[p].life.length > 0 && !s.players[p].life[0].faceUp,
      apply: (s, p) => {
        const top = s.players[p].life[0];
        top.faceUp = true;
        reveal(s, [top.uid], 'both');
        log(s, p, `retourne la carte du dessus de sa Vie face visible (${def(top.num).name}) à la place (Nami)`);
      },
    },
  }),

  // Monkey D. Luffy (ST29-012) : [Activation : Principale] [Une fois par tour] 1 DON!! épuisée à un de ses
  // [Monkey.D.Luffy] ; [Déclenchement] se jouer
  'ST29-012': card({
    activateMain: { label: 'Monkey D. Luffy : donner 1 DON!! épuisée à un [Monkey.D.Luffy]', once: true, effect: giveDon(luffyCard, 1, 'Monkey D. Luffy') },
    onTrigger: playSelf,
  }),

  // Roronoa Zoro (ST29-014) : [Initiative : Personnage] ; [Activation : Principale] [Une fois par tour] défausser une carte à
  // [Déclenchement] : piocher 1 et 1 DON!! épuisée à son Leader ou un Personnage
  'ST29-014': card({
    activateMain: {
      label: 'Roronoa Zoro : défausser une carte à [Déclenchement] pour piocher et donner 1 DON!!',
      once: true,
      cost: discardCost(1, { trigger: true }),
      effect: seq(drawCards(1), giveDon(ownLeaderOrChar(), 1, 'Roronoa Zoro')),
    },
  }),

  // Saignant Strike : [Contre] +2000, puis avec 1 Vie ou moins, −2000 au Leader ou à un Personnage adverse ;
  // [Déclenchement] piocher 1
  'ST29-015': card({
    onCounter: seq(counterOn(2000, 'Saignant Strike'), when(lifeAtMost(1), powerMod(oppLeaderOrChar(), -2000, 'turn', 'Saignant Strike'))),
    onTrigger: drawCards(1),
  }),

  // « Kizaru ! Mon équipage et moi... » : [Principale] son Leader [Monkey.D.Luffy] gagne [Inesquivable] pour le tour ;
  // [Contre] Leader +3000
  'ST29-016': card({
    onMain: when(luffyLeader, effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'keyword', keyword: 'Unblockable', amount: 0, until: 'turn', source: 'Kizaru !' });
      log(ctx.s, ctx.me, 'son Leader gagne [Inesquivable] pour le tour');
    })),
    onCounter: leaderPower(3000, 'battle', 'Kizaru !'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Iai, le chant funèbre du lion : [Contre] +4000, puis avec 2 Vies ou moins, KO de coût 3 ou moins ; [Déclenchement]
  // piocher 2, défausser 1
  'ST29-017': card({
    onCounter: seq(counterOn(4000, 'Iai, le chant funèbre du lion'), when(lifeAtMost(2), ko(oppChar({ costMax: 3 }), 'Iai, le chant funèbre du lion'))),
    onTrigger: drawTrash(2, 1),
  }),
};
