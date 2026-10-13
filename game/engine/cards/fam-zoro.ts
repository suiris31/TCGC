// FAMILLE DU LEADER ZORO (phase 4E) : cartes vertes {Équipage de Chapeau de paille} jouables en format Standard, codées
// d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles épuisent (cartes adverses,
// DON!! comprises), redressent leurs DON!! et leurs Personnages, et se protègent. Chaque condition se vérifie dans la
// partie. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addDelayed, addMod, canBeRested, canPlayCharacters, chooseUpTo1, def, donOnField, drawAndDiscard, fieldCost, findField, hasType,
  leaderHasType, lifeToHand, log, other, playCharacter, restByEffect, setActive, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  all, any, card, chooseOne, describeSpec, discardCost, effect, giveDon, grant, keepRested, ko, leaderPower, leaderType,
  lifeToHandCost, matches, onceWithCost, oppChar, oppLeader, oppLeaderOrChar, ownChar, ownLeader, ownLeaderOrChar, playFromHand, powerMod, readyDon, rest,
  restDon, restOppCards, searchTop, selfDon, selfKeyword, seq, setActiveTargets, trashSelf, when, withCost, type CharSpec,
  type Cost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const ODY = 'ODYSSEY';
const shLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SH);
const filmOrShLeader = any(leaderType('FILM'), leaderType(SH));
const odysseyLeader = leaderType(ODY);
const restedChars = (n: number) => (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => c.rested).length >= n;
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const selfActive = (source: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, ctx.source);
  if (!f || !f.card.rested) return;
  setActive(ctx.s, ctx.me, ctx.source);
  log(ctx.s, ctx.me, `redresse ${source}`);
}, (s, _p, self) => Boolean(findField(s, self)?.card.rested));
// « Redressez jusqu'à N de vos DON!! à la fin de ce tour »
const untapDonAtEnd = (n: number, source: string): Effect => effect((ctx) => {
  addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'untapDon', amount: n });
  log(ctx.s, ctx.me, `redressera jusqu’à ${n} DON!! à la fin du tour (${source})`);
});
const allOppCards = { leader: true, stage: true, don: true };

// « Vous pouvez épuiser 1 de vos Personnages de coût 3 ou plus » (coût)
const restOwnChar = (spec: CharSpec): Cost => {
  const list = (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => !c.rested && canBeRested(s, c.uid) && matches(s, c, spec));
  return {
    get label() { return `épuiser 1 de tes ${describeSpec('Personnages', spec)}`; },
    can: (s, p) => list(s, p).length > 0,
    pay: (ctx) => {
      const options = list(ctx.s, ctx.me);
      if (!options.length) return false;
      const answer = ctx.ask({
        prompt: 'Personnage à épuiser :',
        options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
        tag: 'restCost',
      });
      return restByEffect(ctx, Number(answer.split(':')[1]));
    },
  };
};

// Sanji (OP09-028) : jouer épuisé de sa Défausse un Personnage {ODYSSEY} ou {Équipage de Chapeau de paille} de coût 4 ou
// moins
const odysseyFromTrash: Effect = {
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    if (!canPlayCharacters(ctx.s, ctx.me)) return;
    const ok = (num: string) => def(num).category === 'CHARACTER' && (hasType(num, ODY) || hasType(num, SH)) && (def(num).cost ?? 0) <= 4;
    const options = uniqueByNum(P.trash.filter((c) => ok(c.num) && canPlayCharacters(ctx.s, ctx.me, c.num)));
    if (!options.length) return;
    const answer = ctx.ask({
      prompt: 'Sanji : jouer épuisé jusqu’à 1 Personnage {ODYSSEY} ou {Équipage de Chapeau de paille} de coût 4 ou moins de ta Défausse :',
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
      tag: 'playFree',
    });
    if (answer === 'none') return;
    const [c] = P.trash.splice(P.trash.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    playCharacter(ctx, ctx.me, c, { rested: true });
  },
  useful: (s, p) => canPlayCharacters(s, p) && s.players[p].trash.some((c) => def(c.num).category === 'CHARACTER' && (hasType(c.num, ODY) || hasType(c.num, SH)) && (def(c.num).cost ?? 0) <= 4),
};

// Gum Gum Gigant Pistol : un de ses Personnages {Équipage de Chapeau de paille} +6000 pour le tour, et il ne sera pas
// redressé lors de sa prochaine phase de Recharge
const gigantPistol: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.me].chars.filter((c) => hasType(c.num, SH)).map((c) => c.uid);
    const uid = chooseUpTo1(ctx, list, 'Gum Gum Gigant Pistol : Personnage {Équipage de Chapeau de paille} qui gagne +6000 :', 'ownPower');
    if (uid === null) return;
    addMod(ctx.s, { uid, stat: 'power', amount: 6000, until: 'turn', source: 'Gum Gum Gigant Pistol' });
    addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: ctx.s.turn + (ctx.s.active === ctx.me ? 2 : 1), source: 'Gum Gum Gigant Pistol' });
    log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} gagne +6000 pour le tour et ne sera pas redressé lors de sa prochaine phase de Recharge`);
  },
  useful: (s, p) => s.players[p].chars.some((c) => hasType(c.num, SH)),
};

// Robin (OP09-033) : ses Personnages {ODYSSEY} et {Équipage de Chapeau de paille} ne peuvent pas être mis KO par des
// effets jusqu'à la fin du prochain tour adverse
const odysseyShield: Effect = effect((ctx) => {
  const until = untilOpponentsNextEnd(ctx.s, ctx.me);
  for (const c of ctx.s.players[ctx.me].chars) {
    if (hasType(c.num, ODY) || hasType(c.num, SH)) addMod(ctx.s, { uid: c.uid, stat: 'cantBeKO', scope: 'effect', amount: 0, until, source: 'Nico Robin' });
  }
  log(ctx.s, ctx.me, 'ses Personnages {ODYSSEY} et {Équipage de Chapeau de paille} ne peuvent pas être mis KO par des effets jusqu’à la fin du prochain tour adverse (Nico Robin)');
});

// Monkey D. Luffy (OP14-034) : à la place d'un de ses Personnages {Équipage de Chapeau de paille} mis KO par un effet
// adverse, épuiser un de ses Personnages
function restOneOwn(ctx: EffectCtx, p: PlayerId, prompt: string) {
  const list = ctx.s.players[p].chars.filter((c) => !c.rested);
  const answer = ctx.ask({
    player: p,
    prompt,
    options: list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
    tag: 'restCost',
  });
  const f = findField(ctx.s, Number(answer.split(':')[1]));
  if (f) {
    f.card.rested = true;
    log(ctx.s, p, `épuise ${def(f.card.num).name} à la place`);
  }
}

// En route pour le quartier général !! / Gum Gum Marteau Carabine : cartes nommées sur son terrain
const hasNamed = (s: GameState, p: PlayerId, name: string) => [s.players[p].leader, ...s.players[p].chars].some((c) => def(c.num).names.includes(name));

export const FAM_ZORO: Record<string, CardBehavior> = {
  // Sanji (EB01-014) : [DON!! x1] [Votre tour] +1000 par 3 DON!! épuisées
  'EB01-014': { selfPower: (s, p, self) => (s.active === p && self.don >= 1 ? 1000 * Math.floor(s.players[p].donRested / 3) : 0) },

  // Chopperman : [Jouée] jouer de sa main un {Animal} de coût 3 ou moins
  'EB02-016': card({ onPlay: playFromHand({ type: 'Animal', costMax: 3 }, 'Chopperman') }),

  // Nami (EB02-017) : [Jouée] 5 cartes du dessus, une {Équipage de Chapeau de paille} autre que [Nami]
  'EB02-017': card({ onPlay: searchTop(5, 1, { type: SH, notName: 'Nami' }, 'une carte {Équipage de Chapeau de paille} autre que [Nami]') }),

  // Roronoa Zoro (EB02-019) : attaque des Personnages le tour où il est joué si l'adversaire en a 2 ou plus ; [Jouée] avec
  // un Leader {Équipage de Chapeau de paille}, épuiser un Personnage adverse de coût 4 ou moins
  'EB02-019': card({ onPlay: when(shLeader, rest(oppChar({ costMax: 4 }), 'Roronoa Zoro')) }, {
    rushChar: (s, p) => s.players[other(p)].chars.length >= 2,
  }),

  // Gum Gum Gigant Pistol : [Principale] ; [Déclenchement] épuiser un Personnage adverse de coût 4 ou moins
  'EB02-021': card({ onMain: gigantPistol, onTrigger: rest(oppChar({ costMax: 4 }), 'Gum Gum Gigant Pistol') }),

  // You Ain't Even Worth Killing Time!! : [Principale] et [Déclenchement] au choix : épuiser un Personnage adverse de coût
  // 6 ou moins, ou KO d'un Personnage adverse épuisé de coût 6 ou moins
  'OP06-039': card({
    onMain: chooseOne('You Ain’t Even Worth Killing Time!!', [
      { label: 'Épuiser un Personnage adverse de coût 6 ou moins', effect: rest(oppChar({ costMax: 6 }), 'You Ain’t Even Worth Killing Time!!') },
      { label: 'Mettre KO un Personnage adverse épuisé de coût 6 ou moins', effect: ko(oppChar({ rested: true, costMax: 6 }), 'You Ain’t Even Worth Killing Time!!') },
    ]),
    onTrigger: chooseOne('You Ain’t Even Worth Killing Time!!', [
      { label: 'Épuiser un Personnage adverse de coût 6 ou moins', effect: rest(oppChar({ costMax: 6 }), 'You Ain’t Even Worth Killing Time!!') },
      { label: 'Mettre KO un Personnage adverse épuisé de coût 6 ou moins', effect: ko(oppChar({ rested: true, costMax: 6 }), 'You Ain’t Even Worth Killing Time!!') },
    ]),
  }),

  // Roronoa Zoro (OP06-118) : [En attaquant] [Une fois par tour] épuiser 1 DON!! : se redresser ; [Activation : Principale]
  // [Une fois par tour] épuiser 2 DON!! : se redresser
  'OP06-118': card({
    whenAttacking: onceWithCost('zoro118', restDon(1), selfActive('Roronoa Zoro'), 'Roronoa Zoro'),
    activateMain: { label: 'Roronoa Zoro : épuiser 2 DON!! pour te redresser', once: true, cost: restDon(2), effect: selfActive('Roronoa Zoro') },
  }, { attackUseful: () => false }),

  // Roronoa Zoro (OP07-034) : [En attaquant] avec 3 Personnages ou plus, +2000 pour le tour
  'OP07-034': card({
    whenAttacking: when((s, p) => s.players[p].chars.length >= 3, effect((ctx) => {
      addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 2000, until: 'turn', source: 'Roronoa Zoro' });
      log(ctx.s, ctx.me, 'Roronoa Zoro gagne +2000 de puissance pour le tour');
    })),
  }),

  // Esprit démoniaque, Ashura, neuf éclairs démoniaques : [Principale] +3000, puis épuiser un de ses Personnages de coût 3
  // ou plus : épuiser un Personnage adverse de coût 5 ou moins ; [Déclenchement] épuiser de coût 4 ou moins
  'OP07-036': card({
    onMain: seq(powerMod(ownLeaderOrChar(), 3000, 'turn', 'Ashura, neuf éclairs démoniaques'),
      withCost(restOwnChar({ costMin: 3 }), rest(oppChar({ costMax: 5 }), 'Ashura, neuf éclairs démoniaques'), 'Ashura, neuf éclairs démoniaques')),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Ashura, neuf éclairs démoniaques'),
  }),

  // Usopp (OP09-024) : [Jouée] avec 2 Personnages épuisés ou plus, piocher 2, défausser 2
  'OP09-024': card({ onPlay: when(restedChars(2), effect((ctx) => drawAndDiscard(ctx, 2, 2))) }),

  // Sanji (OP09-028) : [En cas de KO] prendre en main la Vie du dessus ou du dessous : jouer épuisé de sa Défausse un
  // Personnage {ODYSSEY} ou {Équipage de Chapeau de paille} de coût 4 ou moins
  'OP09-028': card({ onKO: withCost(lifeToHandCost('both'), odysseyFromTrash, 'Sanji') }),

  // Tony-Tony Chopper (OP09-029) : [Fin de votre tour] redresser un de ses Personnages {ODYSSEY} de coût 4 ou moins
  'OP09-029': card({ endOfTurn: setActiveTargets(ownChar({ type: ODY, costMax: 4 }), 'Tony-Tony Chopper') }),

  // Nico Robin (OP09-033) : [Jouée] avec 2 Personnages épuisés ou plus, protection contre les KO par effet
  'OP09-033': card({ onPlay: when(restedChars(2), odysseyShield) }),

  // Monkey D. Luffy (OP09-036) : [Jouée] avec 2 Personnages épuisés ou plus, épuiser une DON!! adverse ou un Personnage
  // adverse de coût 6 ou moins
  'OP09-036': card({ onPlay: when(restedChars(2), restOppCards(1, 'Monkey D. Luffy', { don: true, spec: { costMax: 6 } })) }),

  // Gum Gum Cuatro Jet Cross Shock Bazooka : [Contre] avec un Leader {ODYSSEY} et 2 Personnages épuisés, +2000 pour le
  // tour ; [Déclenchement] KO d'un Personnage adverse épuisé de coût 4 ou moins
  'OP09-039': card({
    onCounter: when(all(odysseyLeader, restedChars(2)), powerMod(ownLeaderOrChar(), 2000, 'turn', 'Gum Gum Cuatro Jet Cross Shock Bazooka')),
    onTrigger: ko(oppChar({ rested: true, costMax: 4 }), 'Gum Gum Cuatro Jet Cross Shock Bazooka'),
  }),

  // Thunder Lance Flip Caliber Phoenix Shot : [Principale] avec 2 Personnages épuisés, KO de coût 4 ou moins ;
  // [Déclenchement] épuiser de coût 4 ou moins
  'OP09-040': card({
    onMain: when(restedChars(2), ko(oppChar({ costMax: 4 }), 'Thunder Lance Flip Caliber Phoenix Shot')),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Thunder Lance Flip Caliber Phoenix Shot'),
  }),

  // Soul Franky Swing Arm Boxing Solid : [Contre] +2000, puis avec un Leader {ODYSSEY} et 2 Personnages épuisés, redresser
  // 2 de ses Personnages ; [Déclenchement] épuiser de coût 4 ou moins
  'OP09-041': card({
    onCounter: seq(counterOn(2000, 'Soul Franky Swing Arm Boxing Solid'), when(all(odysseyLeader, restedChars(2)), setActiveTargets(ownChar(), 'Soul Franky Swing Arm Boxing Solid', 2))),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Soul Franky Swing Arm Boxing Solid'),
  }),

  // Franky (OP10-034) : [Une fois par tour] mis KO en combat : prendre en main la Vie du dessus à la place
  'OP10-034': {
    koReplace: {
      label: 'Ajouter la carte du dessus de ta Vie à ta main',
      condition: (s, p, self) => !self.usedOpt.includes('franky034') && s.battle?.target === self.uid && s.players[p].life.length > 0,
      apply: (s, p, self) => {
        self.usedOpt.push('franky034');
        lifeToHand(s, p, 'top');
      },
    },
  },

  // Brook (OP10-035) : [En cas de KO] épuiser le Leader ou un Personnage adverse de coût 5 ou moins
  'OP10-035': card({ onKO: rest(oppLeaderOrChar({ costMax: 5 }), 'Brook') }),

  // Roronoa Zoro (OP10-038) : [Tour adverse] avec 2 Personnages épuisés ou plus, +2000
  'OP10-038': { selfPower: (s, p) => (s.active !== p && restedChars(2)(s, p) ? 2000 : 0) },

  // Gum Gum Dragon Fire Pistol Twister Star : [Principale] avec un Leader {ODYSSEY}, 5 cartes du dessus, jusqu'à 2
  // Personnages {ODYSSEY} en main ; [Déclenchement] épuiser de coût 5 ou moins
  'OP10-039': card({
    onMain: when(odysseyLeader, searchTop(5, 2, { type: ODY, category: 'CHARACTER' }, 'des Personnages {ODYSSEY}')),
    onTrigger: rest(oppChar({ costMax: 5 }), 'Gum Gum Dragon Fire Pistol Twister Star'),
  }),

  // Gum Gum Elephant Rafale : [Principale] épuiser 1 DON!! : épuiser de coût 5 ou moins ; [Contre] Leader +3000
  'OP11-038': card({
    onMain: withCost(restDon(1), rest(oppChar({ costMax: 5 }), 'Gum Gum Elephant Rafale'), 'Gum Gum Elephant Rafale'),
    onCounter: leaderPower(3000, 'battle', 'Gum Gum Elephant Rafale'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Ashura, sabres au clair, facétie des revenants : [Principale] épuiser 3 DON!! : épuiser jusqu'à 2 Personnages ou DON!!
  // adverses ; [Contre] Leader +3000
  'OP12-037': card({
    onMain: withCost(restDon(3), restOppCards(2, 'Ashura, sabres au clair', { don: true }), 'Ashura, sabres au clair'),
    onCounter: leaderPower(3000, 'battle', 'Ashura, sabres au clair'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Technique à deux sabres, Rashomon : [Principale] épuiser 2 DON!! : KO de jusqu'à 2 Personnages adverses épuisés de
  // coût de base 4 ou moins ; [Contre] Leader +3000
  'OP12-038': card({
    onMain: withCost(restDon(2), ko(oppChar({ rested: true, baseCostMax: 4 }), 'Rashomon', 2), 'Rashomon'),
    onCounter: leaderPower(3000, 'battle', 'Rashomon'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Sunny (OP13-026) : [Activation : Principale] [Une fois par tour] épuiser 1 DON!! : +2000 jusqu'à la fin du prochain
  // tour adverse
  'OP13-026': card({
    activateMain: {
      label: 'Sunny : épuiser 1 DON!! pour gagner +2000 jusqu’à la fin du prochain tour adverse',
      once: true,
      cost: restDon(1),
      effect: effect((ctx) => {
        addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 2000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Sunny' });
        log(ctx.s, ctx.me, 'Sunny gagne +2000 de puissance jusqu’à la fin du prochain tour adverse');
      }),
    },
  }),

  // Sanji (OP13-027) : [Jouée] redresser 2 DON!! ; [Fin de votre tour] avec un Leader {FILM} ou {Équipage de Chapeau de
  // paille}, redresser 1 DON!!
  'OP13-027': card({ onPlay: readyDon(2), endOfTurn: when(filmOrShLeader, readyDon(1)) }),

  // Tony-Tony Chopper (OP13-030) : [Jouée] redresser 2 DON!!
  'OP13-030': card({ onPlay: readyDon(2) }),

  // Nico Robin (OP13-032) : [Jouée] un Personnage adverse de coût 8 ou moins ne peut pas être épuisé jusqu'à la fin du
  // prochain tour adverse
  'OP13-032': card({ onPlay: grant(oppChar({ costMax: 8 }), { stat: 'cantRest' }, 'oppNextEnd', 'Nico Robin', 'ne peut pas être épuisé') }),

  // Franky (OP13-033) : [En cas de KO] épuiser jusqu'à 2 cartes adverses
  'OP13-033': card({ onKO: restOppCards(2, 'Franky', allOppCards) }),

  // Brook (OP13-034) : [Jouée] avec un Leader {FILM} ou {Équipage de Chapeau de paille}, redresser 1 DON!!
  'OP13-034': card({ onPlay: when(filmOrShLeader, readyDon(1)) }),

  // Roronoa Zoro (OP13-037) : [Jouée] avec un tel Leader, redresser 2 DON!! ; [Fin de votre tour] se redresser
  'OP13-037': card({ onPlay: when(filmOrShLeader, readyDon(2)), endOfTurn: selfActive('Roronoa Zoro') }),

  // Gum Gum Elephant Gun : [Principale] épuiser de coût 5 ou moins, puis redresser 2 DON!! à la fin du tour ;
  // [Déclenchement] épuiser de coût 5 ou moins
  'OP13-038': card({
    onMain: seq(rest(oppChar({ costMax: 5 }), 'Gum Gum Elephant Gun'), untapDonAtEnd(2, 'Gum Gum Elephant Gun')),
    onTrigger: rest(oppChar({ costMax: 5 }), 'Gum Gum Elephant Gun'),
  }),

  // Gum Gum Snake Shot : [Contre] et [Déclenchement] KO d'un Personnage adverse épuisé de coût 4 ou moins
  'OP13-039': card({
    onCounter: ko(oppChar({ rested: true, costMax: 4 }), 'Gum Gum Snake Shot'),
    onTrigger: ko(oppChar({ rested: true, costMax: 4 }), 'Gum Gum Snake Shot'),
  }),

  // « S'il est aussi fort que vous le dites... » : [Principale] épuiser 2 DON!! : jusqu'à 2 Personnages adverses épuisés de
  // coût 7 ou moins ne seront pas redressés ; [Contre] Leader +3000
  'OP13-040': card({
    onMain: withCost(restDon(2), keepRested(oppChar({ rested: true, costMax: 7 }), 'S’il est aussi fort que vous le dites...', 2), 'S’il est aussi fort que vous le dites...'),
    onCounter: leaderPower(3000, 'battle', 'S’il est aussi fort que vous le dites...'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Monkey D. Luffy (OP13-118) : [Double attaque] ; [Jouée] avec un Leader multicolore, redresser 4 DON!! ; puis plus de
  // Personnage de coût de base 5 ou plus ce tour-ci
  'OP13-118': card({
    onPlay: seq(when((s, p) => def(s.players[p].leader.num).colors.length >= 2, readyDon(4)), effect((ctx) => {
      ctx.s.players[ctx.me].noCharsFromCost = { turn: ctx.s.turn, cost: 5 };
      log(ctx.s, ctx.me, 'ne peut plus jouer de Personnage de coût de base 5 ou plus ce tour-ci (Monkey D. Luffy)');
    }, () => false)),
  }),

  // Usopp (OP14-022) : [Fin de votre tour] avec un tel Leader, redresser 2 DON!!
  'OP14-022': card({ endOfTurn: when(filmOrShLeader, readyDon(2)) }),

  // Nami (OP14-031) : [Bloqueur] ; [Jouée] épuiser jusqu'à 2 Personnages adverses de coût 8 ou moins, puis redresser 5
  // DON!! à la fin du tour
  'OP14-031': card({ onPlay: seq(rest(oppChar({ costMax: 8 }), 'Nami', 2), untapDonAtEnd(5, 'Nami')) }),

  // Monkey D. Luffy (OP14-034) : [Votre tour] ses Personnages verts {Équipage de Chapeau de paille} de coût de base 4 ou
  // plus +1000 ; [Une fois par tour] à la place d'un tel Personnage mis KO par un effet adverse, épuiser un de ses
  // Personnages
  'OP14-034': {
    aura: (s, p, _src, target) => (s.active === p && !findField(s, target.uid)?.leader && hasType(target.num, SH)
      && def(target.num).colors.includes('Green') && (def(target.num).cost ?? 0) >= 4 ? 1000 : 0),
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: true,
      label: (_s, _self, victim) => `Monkey D. Luffy : épuiser un de tes Personnages pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, p, _self, victim) => hasType(victim.num, SH) && s.players[p].chars.some((c) => !c.rested),
      apply: (_s, p, _self, _victim, ctx) => restOneOwn(ctx, p, 'Monkey D. Luffy : Personnage à épuiser à la place :'),
    },
  },

  // Brook (OP15-032) : [Jouée] épuiser une carte adverse ; [Activation : Principale] se placer dans la Défausse : avec un
  // Leader {Équipage de Chapeau de paille}, redresser un de ses Personnages de coût de base 8 ou moins
  'OP15-032': card({
    onPlay: restOppCards(1, 'Brook', allOppCards),
    activateMain: {
      label: 'Brook : te placer dans ta Défausse pour redresser un Personnage de coût de base 8 ou moins',
      cost: trashSelf(),
      effect: when(shLeader, setActiveTargets(ownChar({ baseCostMax: 8 }), 'Brook')),
    },
  }),

  // Roronoa Zoro (OP16-035) : [Jouée] épuiser une carte adverse, puis défausser 1 carte : 3 DON!! épuisées à son Leader
  'OP16-035': card({
    onPlay: seq(restOppCards(1, 'Roronoa Zoro', allOppCards), withCost(discardCost(1), giveDon(ownLeader(), 3, 'Roronoa Zoro'), 'Roronoa Zoro')),
  }),

  // Monkey D. Luffy (OP16-034) : [DON!! x1] [Votre tour] +1000 par nom différent parmi ses Personnages ; [Jouée] 3 cartes
  // du dessus, une carte {Impel Down}
  'OP16-034': card({ onPlay: searchTop(3, 1, { type: 'Impel Down' }, 'une carte {Impel Down}') }, {
    selfPower: (s, p, self) => (s.active === p && self.don >= 1 ? 1000 * new Set(s.players[p].chars.map((c) => def(c.num).names[0])).size : 0),
  }),

  // En route pour le quartier général !! : [Principale] épuiser 6 DON!! : avec 5 Personnages {Impel Down} de noms
  // différents, redresser son Leader et tous ses Personnages ; [Contre] Leader +3000
  'OP16-038': card({
    onMain: withCost(restDon(6), when((s, p) => new Set(s.players[p].chars.filter((c) => hasType(c.num, 'Impel Down')).map((c) => def(c.num).names[0])).size >= 5,
      effect((ctx) => {
        for (const c of [ctx.s.players[ctx.me].leader, ...ctx.s.players[ctx.me].chars]) if (c.rested) setActive(ctx.s, ctx.me, c.uid);
        log(ctx.s, ctx.me, 'redresse son Leader et tous ses Personnages (En route pour le quartier général !!)');
      })), 'En route pour le quartier général !!'),
    onCounter: leaderPower(3000, 'battle', 'En route pour le quartier général !!'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Gum Gum Twin Jet Pistol : [Principale] un de ses [Monkey.D.Luffy] gagne [Double attaque], puis avec un Leader {Impel
  // Down}, épuiser jusqu'à 2 Personnages adverses de coût 3 ou moins ; [Déclenchement] épuiser le Leader adverse
  'OP16-039': card({
    onMain: seq(grant(ownLeaderOrChar({ name: 'Monkey.D.Luffy' }), { stat: 'keyword', keyword: 'Double Attack' }, 'turn', 'Gum Gum Twin Jet Pistol', 'gagne [Double attaque]'),
      when(leaderType('Impel Down'), rest(oppChar({ costMax: 3 }), 'Gum Gum Twin Jet Pistol', 2))),
    onTrigger: rest(oppLeader(), 'Gum Gum Twin Jet Pistol'),
  }),

  // Gum Gum Marteau Carabine : [Principale] avec [Monkey.D.Luffy] et [Mr.3(Galdino)], un Personnage adverse épuisé de
  // coût 6 ou moins ne sera pas redressé ; [Contre] Leader +3000
  'OP16-040': card({
    onMain: when((s, p) => hasNamed(s, p, 'Monkey.D.Luffy') && hasNamed(s, p, 'Mr.3(Galdino)'), keepRested(oppChar({ rested: true, costMax: 6 }), 'Gum Gum Marteau Carabine', 1)),
    onCounter: leaderPower(3000, 'battle', 'Gum Gum Marteau Carabine'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Monkey D. Luffy (OP17-030) : [Jouée] épuiser 1 DON!! : [Initiative] ; [Activation : Principale] [Une fois par tour]
  // avec 5 cartes ou moins en main, redresser 1 DON!!
  'OP17-030': card({
    onPlay: withCost(restDon(1), selfKeyword('Rush', 'Monkey D. Luffy'), 'Monkey D. Luffy'),
    activateMain: { label: 'Monkey D. Luffy : redresser 1 DON!!', once: true, effect: when((s, p) => s.players[p].hand.length <= 5, readyDon(1)) },
  }),

  // Nami (P-102) : [Jouée] avec un Leader {Équipage de Chapeau de paille}, redresser 2 DON!!
  'P-102': card({ onPlay: when(shLeader, readyDon(2)) }),

  // Nico Robin (P-111) : [Une fois par tour] à la place d'un de ses Personnages {Équipage de Chapeau de paille} retiré par
  // un effet adverse, épuiser 1 DON!!
  'P-111': {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Nico Robin : épuiser 1 DON!! pour garder ${def(victim.num).name}`,
      condition: (s, p, _self, victim) => hasType(victim.num, SH) && s.players[p].donActive > 0,
      apply: (s, p) => {
        s.players[p].donActive--;
        s.players[p].donRested++;
        log(s, p, 'épuise 1 DON!! à la place (Nico Robin)');
      },
    },
  },

  // Monkey D. Luffy (OP07-033) : avec 3 Personnages ou plus, ses Personnages de coût 3 ou moins autres que
  // [Monkey.D.Luffy] ne peuvent pas être mis KO par des effets adverses
  'OP07-033': {
    koShield: (s, p, _src, target, cause, by) => cause === 'effect' && by !== p && s.players[p].chars.length >= 3
      && s.players[p].chars.some((c) => c.uid === target.uid) && fieldCost(s, target.uid) <= 3 && !def(target.num).names.includes('Monkey.D.Luffy'),
  },

  // Nami (OP10-033) : [Jouée] avec 2 Personnages {ODYSSEY} épuisés ou plus, une DON!! épuisée adverse ne sera pas
  // redressée lors de la prochaine phase de Recharge adverse
  'OP10-033': card({
    onPlay: when((s, p) => s.players[p].chars.filter((c) => c.rested && hasType(c.num, ODY)).length >= 2, effect((ctx) => {
      const O = ctx.s.players[ctx.opp];
      if (!O.donRested) return;
      const turn = ctx.s.turn + (ctx.s.active === ctx.me ? 1 : 2);
      const before = O.donNoRefresh?.turn === turn ? O.donNoRefresh.count : 0;
      O.donNoRefresh = { turn, count: Math.min(before + 1, O.donRested) };
      log(ctx.s, ctx.me, '1 DON!! épuisée adverse ne sera pas redressée lors de la prochaine phase de Recharge adverse (Nami)');
    }, (s, p) => s.players[other(p)].donRested > 0)),
  }),

  // Roronoa Zoro (OP12-036) : ne peut pas être joué de la main par un effet ; avec un Leader <Slash>, +1000 et pas mis KO
  // en combat par une carte <Slash>
  'OP12-036': {
    noPlayByEffect: true,
    selfPower: (s, p) => (def(s.players[p].leader.num).attributes.includes('Slash') ? 1000 : 0),
    cantBeKO: (s, p, self, cause) => cause === 'battle' && def(s.players[p].leader.num).attributes.includes('Slash') && Boolean(s.battle)
      && def(findField(s, s.battle!.attacker)?.card.num ?? self.num).attributes.includes('Slash') && s.battle!.attacker !== self.uid,
  },

  // Usopp (OP15-024) : [Tour adverse] pas épuisé par les effets du Leader ou des Personnages adverses, et [Bloqueur] ;
  // [En cas de KO] épuiser le Leader ou un Personnage adverse de coût 7 ou moins
  'OP15-024': card({ onKO: rest(oppLeaderOrChar({ costMax: 7 }), 'Usopp') }, {
    blocker: (s, p) => s.active !== p,
    cantBeRestedBy: (s, p, _self, num) => s.active !== p && ['LEADER', 'CHARACTER'].includes(def(num).category),
  }),

  // Nami (OP17-023) : à la place d'un de ses Personnages {East Blue} ou {Équipage de Chapeau de paille} mis KO, s'épuiser
  'OP17-023': {
    koReplaceAlly: {
      label: (_s, _self, victim) => `Nami : t'épuiser pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, _p, self, victim) => !self.rested && canBeRested(s, self.uid) && (hasType(victim.num, 'East Blue') || hasType(victim.num, SH)),
      apply: (s, p, self) => {
        self.rested = true;
        log(s, p, 'Nami s’épuise à la place');
      },
    },
  },

  // Monkey D. Luffy (PRB02-005) : [Votre tour] [Jouée] avec un Leader multicolore et 7 DON!! adverses ou moins sur le
  // terrain, l'adversaire épuise 1 DON!! redressée au début de sa prochaine phase principale
  'PRB02-005': card({
    onPlay: when(all((s, p) => s.active === p, (s, p) => def(s.players[p].leader.num).colors.length >= 2, (s, p) => donOnField(s, other(p)) <= 7), effect((ctx) => {
      ctx.s.players[ctx.opp].restDonAtMain = ctx.s.turn + 1;
      log(ctx.s, ctx.me, 'l’adversaire épuisera 1 DON!! au début de sa prochaine phase principale (Monkey D. Luffy)');
    })),
  }),

  // Roronoa Zoro (PRB02-006) : [Tour adverse] épuisé par l'effet d'un Personnage adverse : épuiser un autre de ses
  // Personnages à la place ; [Bloqueur]
  'PRB02-006': {
    restReplace: {
      label: 'Épuiser un autre de tes Personnages',
      condition: (s, p, self, ctx) => s.active !== p && def(ctx.num).category === 'CHARACTER'
        && s.players[p].chars.some((c) => c.uid !== self.uid && !c.rested && canBeRested(s, c.uid)),
      apply: (s, p, self, ctx) => {
        const list = s.players[p].chars.filter((c) => c.uid !== self.uid && !c.rested && canBeRested(s, c.uid));
        const answer = ctx.ask({
          player: p,
          prompt: 'Roronoa Zoro : Personnage à épuiser à sa place :',
          options: list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
          tag: 'restCost',
        });
        const f = findField(s, Number(answer.split(':')[1]));
        if (!f) return;
        f.card.rested = true;
        log(s, p, `épuise ${def(f.card.num).name} à la place de Roronoa Zoro`);
      },
    },
  },

  // Monkey D. Luffy (P-135) : [Bloqueur] ; [Jouée] épuiser un Personnage adverse de coût 5 ou moins
  'P-135': card({ onPlay: rest(oppChar({ costMax: 5 }), 'Monkey D. Luffy') }),

  // Roronoa Zoro (ST12-008) : [DON!! x1] [En attaquant] épuiser un Personnage adverse de coût 6 ou moins
  'ST12-008': card({ whenAttacking: when(selfDon(1), rest(oppChar({ costMax: 6 }), 'Roronoa Zoro')) }),

  // Lion Strike : [Principale]/[Contre] et [Déclenchement] épuiser le Leader ou un Personnage adverse de coût 4 ou moins
  'ST12-016': card({
    onMain: rest(oppLeaderOrChar({ costMax: 4 }), 'Lion Strike'),
    onCounter: rest(oppLeaderOrChar({ costMax: 4 }), 'Lion Strike'),
    onTrigger: rest(oppLeaderOrChar({ costMax: 4 }), 'Lion Strike'),
  }, { counterUseful: () => false }),

  // Monkey D. Luffy (ST16-005) : avec un [Uta] épuisé, +1000
  'ST16-005': {
    selfPower: (s, p) => ([s.players[p].leader, ...s.players[p].chars].some((c) => c.rested && def(c.num).names.includes('Uta')) ? 1000 : 0),
  },
};

