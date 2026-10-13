// FAMILLE DU LEADER ROBIN, CARTES VIOLETTES (phase 4E) : cartes violettes {Équipage de Chapeau de paille} jouables en
// format Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles jouent
// avec les DON!! (8 ou 10 sur le terrain, DON!! −X, « renvoyez 1 DON!! ou plus »). Chaque condition se vérifie dans la
// partie. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, basePower, canPlayCharacters, def, discardFromHand, donOnField, draw, drawAndDiscard, emit, findField, hasType, knownFirst,
  leaderHasType, lifeToHand, log, playableByEffect, playCharacter, power, removeByEffect, returnDon, setActive, uniqueByNum,
  untilOpponentsNextEnd,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  addDon, bothCosts, card, costMod, discardCost, donMinus, drawCards, effect, giveDon, ko, leaderPower, leaderNamed, onceWithCost, oppChar,
  ownChar, ownLeaderOrChar, playFromHand, powerMod, rest, restDon, restOppCards, restSelf, searchTop, selfDon, selfKeyword, seq,
  when, withCost, type Cost, type Effect,
} from './bricks.ts';
import { playTriggerCard } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const shLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SH);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const donAtLeast = (n: number) => (s: GameState, p: PlayerId) => donOnField(s, p) >= n;
const notMoreDon = (s: GameState, p: PlayerId) => donOnField(s, p) <= donOnField(s, opp(p));
const multicolor = (s: GameState, p: PlayerId) => def(s.players[p].leader.num).colors.length >= 2;
const drawTrash = (n: number, trash: number): Effect => effect((ctx) => drawAndDiscard(ctx, n, trash), (s, p) => s.players[p].deck.length > 0);
const selfActive = (source: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, ctx.source);
  if (!f || !f.card.rested) return;
  setActive(ctx.s, ctx.me, ctx.source);
  log(ctx.s, ctx.me, `redresse ${source}`);
}, (s, _p, self) => Boolean(findField(s, self)?.card.rested));
// [Une fois par tour] sans coût
const oncePerTurn = (key: string, then: Effect): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.usedOpt.includes(key)) return;
    f.card.usedOpt.push(key);
    then.run(ctx);
  },
  useful: then.useful,
});

// « Vous pouvez renvoyer 1 carte DON!! ou plus de votre terrain dans votre deck DON!! » : le joueur choisit combien
export const donMinusAny: Cost = {
  label: 'renvoyer 1 DON!! ou plus de ton terrain dans ton deck DON!!',
  can: (s, p) => donOnField(s, p) >= 1,
  pay: (ctx) => {
    const max = donOnField(ctx.s, ctx.me);
    if (max < 1) return false;
    const answer = ctx.ask({
      prompt: 'Combien de DON!! renvoyer dans ton deck DON!! ?',
      options: Array.from({ length: max }, (_, i) => ({ id: `n:${i + 1}`, label: `${i + 1} DON!!` })),
      tag: 'donCount',
    });
    return returnDon(ctx.s, ctx.me, Number(answer.split(':')[1]));
  },
};

// Monkey D. Luffy (EB02-061) : coût « renvoyer 2 de vos DON!! redressées dans votre deck DON!! »
const returnTwoActive: Cost = {
  label: 'renvoyer 2 de tes DON!! redressées dans ton deck DON!!',
  can: (s, p) => s.players[p].donActive >= 2,
  pay: (ctx) => {
    const P = ctx.s.players[ctx.me];
    if (P.donActive < 2) return false;
    P.donActive -= 2;
    P.donDeck += 2;
    log(ctx.s, ctx.me, 'renvoie 2 DON!! redressées dans son deck DON!!');
    emit(ctx.s, { type: 'donReturned', player: ctx.me, count: 2 });
    return true;
  },
};

// Stealth Black : jouer un [Sanji] de 6000 ou moins de sa main ou de sa Défausse
const sanjiFromHandOrTrash: Effect = {
  run: (ctx) => {
    if (!canPlayCharacters(ctx.s, ctx.me)) return;
    const P = ctx.s.players[ctx.me];
    const ok = (c: Card) => def(c.num).category === 'CHARACTER' && def(c.num).names.includes('Sanji') && (def(c.num).power ?? 0) <= 6000 && canPlayCharacters(ctx.s, ctx.me, c.num);
    const fromHand = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => ok(c) && playableByEffect(c.num))));
    const fromTrash = uniqueByNum(P.trash.filter(ok));
    if (!fromHand.length && !fromTrash.length) return;
    const answer = ctx.ask({
      prompt: 'Stealth Black : jouer jusqu’à 1 [Sanji] de 6000 de puissance ou moins de ta main ou de ta Défausse :',
      options: [
        ...fromHand.map((c) => ({ id: `hand:${c.uid}`, label: `${def(c.num).name} (main)`, uid: c.uid, num: c.num })),
        ...fromTrash.map((c) => ({ id: `trash:${c.uid}`, label: `${def(c.num).name} (Défausse)`, uid: c.uid, num: c.num })),
        { id: 'none', label: 'Aucun' },
      ],
      tag: 'playFree',
    });
    if (answer === 'none') return;
    const zone = answer.startsWith('hand:') ? P.hand : P.trash;
    const [c] = zone.splice(zone.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    playCharacter(ctx, ctx.me, c);
  },
  useful: (s, p) => canPlayCharacters(s, p) && [...s.players[p].hand, ...s.players[p].trash].some((c) => def(c.num).category === 'CHARACTER' && def(c.num).names.includes('Sanji') && (def(c.num).power ?? 0) <= 6000),
};

// Thousand Sunny (OP09-080) : un de ses Personnages {Équipage de Chapeau de paille} sorti par un effet adverse pendant le
// tour adverse
const sunnyIf = (s: GameState, owner: PlayerId, self: { uid: number }, e: { player: PlayerId; by?: PlayerId; cause?: string; zone?: string; num?: string }) =>
  e.player === owner && s.active !== owner && e.by !== undefined && e.by !== owner && e.cause === 'effect' && e.zone === 'character'
  && Boolean(e.num) && hasType(e.num!, SH) && s.players[owner].stage?.uid === self.uid && !s.players[owner].stage.rested;
const sunnyRun = (ctx: EffectCtx) => {
  const stage = ctx.s.players[ctx.me].stage;
  if (!stage || stage.rested) return;
  const answer = ctx.ask({
    prompt: 'Thousand Sunny : t’épuiser pour ajouter 1 DON!! épuisée de ton deck DON!! ?',
    options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }],
    tag: 'may',
  });
  if (answer !== 'yes') return;
  stage.rested = true;
  log(ctx.s, ctx.me, 'épuise Thousand Sunny');
  addDon(1, 'rested').run(ctx);
};

const sanjiLike = (num: string) => def(num).names.includes('Sanji') || def(num).names.includes('San-Gorou');

export const FAM_ROBIN_PURPLE: Record<string, CardBehavior> = {
  // Nico Robin (EB02-036) : [Bloqueur] ; [En cas de KO] DON!! −1 : 3 cartes du dessus, une {Équipage de Chapeau de paille}
  'EB02-036': card({ onKO: withCost(donMinus(1), searchTop(3, 1, { type: SH }, 'une carte {Équipage de Chapeau de paille}'), 'Nico Robin') }),

  // Franky (EB02-037) : [Jouée]/[En attaquant] avec un Leader {Équipage de Chapeau de paille} et autant de DON!! ou moins
  // que l'adversaire, 1 DON!! épuisée
  'EB02-037': card({
    onPlay: when((s, p) => shLeader(s, p) && notMoreDon(s, p), addDon(1, 'rested')),
    whenAttacking: when((s, p) => shLeader(s, p) && notMoreDon(s, p), addDon(1, 'rested')),
  }, { attackUseful: () => false }),

  // Vogue Merry (Lieu) : [Jouée] avec un tel Leader, piocher 1 ; [Activation : Principale] s'épuiser : avec autant de
  // DON!! ou moins que l'adversaire, un Personnage {Équipage de Chapeau de paille} +2 de coût
  'EB02-041': card({
    onPlay: when(shLeader, drawCards(1)),
    activateMain: {
      label: 'Vogue Merry : t’épuiser pour donner +2 de coût à un Personnage {Équipage de Chapeau de paille}',
      cost: restSelf(),
      effect: when(notMoreDon, costMod(ownChar({ type: SH }), 2, 'oppNextEnd', 'Vogue Merry')),
    },
  }),

  // Monkey D. Luffy (EB02-061) : [Initiative] avec un Leader multicolore et 5 DON!! adverses ou plus ; [En attaquant] [Une
  // fois par tour] renvoyer 2 DON!! redressées : se redresser, puis la Vie du dessus en main
  'EB02-061': card({
    whenAttacking: onceWithCost('luffy061', returnTwoActive, seq(selfActive('Monkey D. Luffy'), effect((ctx) => { lifeToHand(ctx.s, ctx.me, 'top'); })), 'Monkey D. Luffy'),
  }, {
    rush: (s, p) => multicolor(s, p) && donOnField(s, opp(p)) >= 5,
    attackUseful: () => false,
  }),

  // Stealth Black : [Principale] avec le Leader [Sanji] et 4 DON!! ou plus, jouer un [Sanji] de 6000 ou moins de sa main ou
  // de sa Défausse ; [Déclenchement] piocher 2, défausser 1
  'EB04-041': card({ onMain: when((s, p) => leaderNamed('Sanji')(s, p, -1) && donAtLeast(4)(s, p), sanjiFromHandOrTrash), onTrigger: drawTrash(2, 1) }),

  // Usohachi (OP05-061) : [DON!! x1] [En attaquant] avec 8 DON!! ou plus, épuiser de coût 4 ou moins
  'OP05-061': card({ whenAttacking: when((s, p, self) => selfDon(1)(s, p, self) && donAtLeast(8)(s, p), rest(oppChar({ costMax: 4 }), 'Usohachi')) }),

  // O-Robi : [Jouée] avec 8 DON!! ou plus, KO de coût 3 ou moins
  'OP05-063': card({ onPlay: when(donAtLeast(8), ko(oppChar({ costMax: 3 }), 'O-Robi')) }),

  // Jinbe (OP05-066) : [Bloqueur] ; [Tour adverse] avec 10 DON!!, +1000
  'OP05-066': { selfPower: (s, p) => (s.active !== p && donOnField(s, p) >= 10 ? 1000 : 0) },

  // Zorojuro (OP05-067) : [En attaquant] avec 3 Vies ou moins, 1 DON!! redressée
  'OP05-067': card({ whenAttacking: when((s, p) => s.players[p].life.length <= 3, addDon(1, 'active')) }, { attackUseful: () => false }),

  // Choppaemon : [Jouée] avec 8 DON!! ou plus, redresser un Personnage violet {Équipage de Chapeau de paille} de 6000 ou
  // moins
  'OP05-068': card({
    onPlay: when(donAtLeast(8), effect((ctx) => {
      const list = ctx.s.players[ctx.me].chars.filter((c) => c.rested && hasType(c.num, SH) && def(c.num).colors.includes('Purple') && power(ctx.s, c.uid) <= 6000);
      if (!list.length) return;
      const answer = ctx.ask({
        prompt: 'Choppaemon : Personnage violet {Équipage de Chapeau de paille} de 6000 ou moins à redresser :',
        options: [...list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: 'Aucun' }],
        tag: 'ownReady',
      });
      if (answer !== 'none') setActive(ctx.s, ctx.me, Number(answer.split(':')[1]));
    })),
  }),

  // Fransuké : [DON!! x1] avec 8 DON!! ou plus, [Initiative]
  'OP05-070': { rush: (s, p, self) => self.don >= 1 && donOnField(s, p) >= 8 },

  // Brookichi : [Jouée] avec 8 DON!! ou plus, −2000 à jusqu'à 2 Personnages adverses
  'OP05-072': card({ onPlay: when(donAtLeast(8), powerMod(oppChar(), -2000, 'turn', 'Brookichi', 2)) }),

  // Monkey.D.Luffy (OP07-073) : [Activation : Principale] [Une fois par tour] DON!! −3 : avec 3 Personnages adverses ou
  // plus, se redresser
  'OP07-073': card({
    activateMain: {
      label: 'Monkey.D.Luffy : DON!! −3 pour te redresser',
      once: true,
      cost: donMinus(3),
      effect: when((s, p) => s.players[opp(p)].chars.length >= 3, selfActive('Monkey.D.Luffy')),
    },
  }),

  // Sanji (OP09-065) : [Jouée] renvoyer 1 DON!! ou plus : [Initiative], puis épuiser de coût 6 ou moins
  'OP09-065': card({ onPlay: withCost(donMinusAny, seq(selfKeyword('Rush', 'Sanji'), rest(oppChar({ costMax: 6 }), 'Sanji')), 'Sanji') }),

  // Tony-Tony Chopper (OP09-068) : [Fin de votre tour] renvoyer 1 DON!! ou plus : se redresser, puis [Bloqueur] jusqu'à la
  // fin du prochain tour adverse
  'OP09-068': card({
    endOfTurn: withCost(donMinusAny, seq(selfActive('Tony-Tony Chopper'), effect((ctx) => {
      addMod(ctx.s, { uid: ctx.source, stat: 'keyword', keyword: 'Blocker', amount: 0, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Tony-Tony Chopper' });
      log(ctx.s, ctx.me, 'Tony-Tony Chopper gagne [Bloqueur] jusqu’à la fin du prochain tour adverse');
    })), 'Tony-Tony Chopper'),
  }),

  // Nami (OP09-070) : [Jouée] renvoyer 1 DON!! ou plus : 2 DON!! épuisées à son Leader ou un Personnage
  'OP09-070': card({ onPlay: withCost(donMinusAny, giveDon(ownLeaderOrChar(), 2, 'Nami'), 'Nami') }),

  // Franky (OP09-072) : [Bloqueur] ; [Jouée] DON!! −2 et défausser 1 carte : piocher 2
  'OP09-072': card({ onPlay: withCost(bothCosts(donMinus(2), discardCost(1)), drawCards(2), 'Franky') }),

  // Brook (OP09-073) : [En attaquant] renvoyer 1 DON!! ou plus : −2000 à jusqu'à 2 Personnages adverses
  'OP09-073': card({ whenAttacking: withCost(donMinusAny, powerMod(oppChar(), -2000, 'turn', 'Brook', 2), 'Brook') }),

  // Roronoa Zoro (OP09-076) : [Jouée] renvoyer 1 DON!! ou plus : 1 DON!! redressée
  'OP09-076': card({ onPlay: withCost(donMinusAny, addDon(1, 'active'), 'Roronoa Zoro') }),

  // Thousand Sunny (Lieu, OP09-080) : [Tour adverse] s'épuiser : quand un de ses Personnages {Équipage de Chapeau de
  // paille} sort du terrain par un effet adverse, 1 DON!! épuisée
  'OP09-080': {
    when: [
      { on: 'ko', if: sunnyIf, run: sunnyRun },
      { on: 'leave', if: sunnyIf, run: sunnyRun },
    ],
  },

  // Monkey D. Luffy (OP09-119) : [Jouée] renvoyer 1 DON!! ou plus : piocher 1 et [Initiative]
  'OP09-119': card({ onPlay: withCost(donMinusAny, seq(drawCards(1), selfKeyword('Rush', 'Monkey D. Luffy')), 'Monkey D. Luffy') }),

  // Gear Second : [Principale] épuiser 2 DON!! : avec un Leader bleu, 1 DON!! épuisée ; [Contre] Leader +3000
  'OP11-080': card({
    onMain: withCost(restDon(2), when((s, p) => def(s.players[p].leader.num).colors.includes('Blue'), addDon(1, 'rested')), 'Gear Second'),
    onCounter: leaderPower(3000, 'battle', 'Gear Second'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Sanji (OP12-070) : +1000 par 5 Événements dans sa Défausse ; retiré par un effet adverse : renvoyer 1 DON!! à la place
  'OP12-070': {
    selfPower: (s, p) => 1000 * Math.floor(s.players[p].trash.filter((c) => def(c.num).category === 'EVENT').length / 5),
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: () => 'Sanji : renvoyer 1 DON!! de ton terrain dans ton deck DON!!',
      condition: (s, p, self, victim) => victim.uid === self.uid && donOnField(s, p) >= 1,
      apply: (s, p) => { returnDon(s, p, 1); },
    },
  },

  // Brochette : [Principale] avec autant de DON!! ou moins que l'adversaire, piocher 1 ; puis −3000 à un Personnage adverse
  'OP12-078': card({ onMain: seq(when(notMoreDon, drawCards(1)), powerMod(oppChar(), -3000, 'turn', 'Brochette')) }),

  // « Luffy est l'homme qui deviendra le roi des pirates !! » : [Principale] avec le Leader [Sanji], 3 cartes du dessus,
  // une en main
  'OP12-079': card({ onMain: when(leaderNamed('Sanji'), searchTop(3, 1, {}, 'une carte')) }),

  // Nami (PRB02-012) : [Jouée] 5 cartes du dessus, une {Équipage de Chapeau de paille} autre que [Nami] ; [Déclenchement]
  // se jouer
  'PRB02-012': card({
    onPlay: searchTop(5, 1, { type: SH, notName: 'Nami' }, 'une carte {Équipage de Chapeau de paille} autre que [Nami]'),
    onTrigger: effect((ctx) => playTriggerCard(ctx)),
  }),

  // Usohachi (ST18-001) : [Jouée] avec 8 DON!! ou plus, épuiser de coût 5 ou moins
  'ST18-001': card({ onPlay: when(donAtLeast(8), rest(oppChar({ costMax: 5 }), 'Usohachi')) }),

  // O-Nami : [Bloqueur] ; [Jouée] avec 8 DON!! ou plus, défausser 1 carte et piocher 2
  'ST18-002': card({
    onPlay: when(donAtLeast(8), effect((ctx) => {
      discardFromHand(ctx, ctx.me, 1, 'O-Nami : carte à défausser :');
      draw(ctx.s, ctx.me, 2);
      log(ctx.s, ctx.me, 'pioche 2 cartes (O-Nami)');
    })),
  }),

  // Sangoro : [En attaquant] [Une fois par tour] avec 8 DON!! ou plus, piocher 1
  'ST18-003': card({ whenAttacking: oncePerTurn('sangoro', when(donAtLeast(8), drawCards(1))) }, { attackUseful: () => false }),

  // Zorojuro (ST18-004) : [Jouée] 5 cartes du dessus, une carte {Équipage de Chapeau de paille} violette
  'ST18-004': card({ onPlay: searchTop(5, 1, { type: SH, color: 'Purple' }, 'une carte {Équipage de Chapeau de paille} violette') }),

  // Luffytaro : [Jouée] DON!! −1 : jouer de sa main un Personnage violet {Équipage de Chapeau de paille} de coût 5 ou moins
  'ST18-005': card({ onPlay: withCost(donMinus(1), playFromHand({ type: SH, color: 'Purple', costMax: 5 }, 'Luffytaro'), 'Luffytaro') }),

  // O-Soba Mask : −5 en main avec un [San-Gorou] ou [Sanji] de 7000 de base ou plus ; [Jouée] renvoyer en main tous ses
  // [San-Gorou] et [Sanji]
  'ST26-001': card({
    onPlay: effect((ctx) => {
      for (const c of [...ctx.s.players[ctx.me].chars]) if (sanjiLike(c.num)) removeByEffect(ctx, c.uid, 'hand');
    }),
  }, {
    handCost: (s, p) => (s.players[p].chars.some((c) => sanjiLike(c.num) && basePower(s, c.uid) >= 7000) ? -5 : 0),
  }),

  // Tony-Tony Chopper (ST26-002) : [Bloqueur] ; [Jouée] DON!! −2 : épuiser une DON!! ou un Personnage adverse de coût 1 ou
  // moins
  'ST26-002': card({ onPlay: withCost(donMinus(2), restOppCards(1, 'Tony-Tony Chopper', { don: true, spec: { costMax: 1 } }), 'Tony-Tony Chopper') }),

  // Nico Robin (ST26-003) : [Jouée] DON!! −2 : 1 DON!! redressée
  'ST26-003': card({ onPlay: withCost(donMinus(2), addDon(1, 'active'), 'Nico Robin') }),

  // Général Franky : [Jouée] DON!! −2 : −2000 à jusqu'à 2 Personnages adverses
  'ST26-004': card({ onPlay: withCost(donMinus(2), powerMod(oppChar(), -2000, 'turn', 'Général Franky', 2), 'Général Franky') }),

  // Monkey D. Luffy (ST26-005) : [Jouée]/[En attaquant] DON!! −2 : avec un Leader multicolore et 5 DON!! adverses ou plus,
  // son Leader {Équipage de Chapeau de paille} a une puissance de base de 7000 jusqu'à la fin du prochain tour adverse
  'ST26-005': card({
    onPlay: withCost(donMinus(2), when((s, p) => multicolor(s, p) && donOnField(s, opp(p)) >= 5 && shLeader(s, p), effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'basePower', amount: 7000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Monkey D. Luffy' });
      log(ctx.s, ctx.me, 'son Leader a une puissance de base de 7000 jusqu’à la fin du prochain tour adverse (Monkey D. Luffy)');
    })), 'Monkey D. Luffy'),
    whenAttacking: withCost(donMinus(2), when((s, p) => multicolor(s, p) && donOnField(s, opp(p)) >= 5 && shLeader(s, p), effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'basePower', amount: 7000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Monkey D. Luffy' });
      log(ctx.s, ctx.me, 'son Leader a une puissance de base de 7000 jusqu’à la fin du prochain tour adverse (Monkey D. Luffy)');
    })), 'Monkey D. Luffy'),
  }, { attackUseful: () => false }),
};

