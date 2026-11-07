// CARTES D'OP11 CODÉES À LA MAIN (étape C, tâche S8) : celles que le traducteur ne comprend pas ou que le format des
// recettes ne sait pas dire (remplacements, moments « peut être activé quand ... », effets différés, choix de
// l'adversaire). Codées d'après leur texte officiel VO et VF, avec les briques existantes ; les choix d'interprétation
// sont dans game/docs/interpretations.md (section « OP11 (tâche S8) », 2700 à 2799). Aucun texte de carte ici. Le reste
// du set est en recettes (recipes/sets/op11.ts).
import {
  addDelayed, addMod, canLeaveByEffect, canPlayCharacters, chooseUpTo1, def, describe, donOnField, findField, hasBlocker,
  hasType, knownFirst, log, other, playCharacter, power, removeByEffect, restedCards, reveal, bottomOrder, setActive,
  uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  anyChar, candidates, card, discardCost, drawCards, effect, flipTopLife, grant, ko, leaderNamed, leaderPower, lifeToHandCost, onceWithCost,
  oppChar, ownChar, ownLeaderOrChar, powerMod, readyDon, rest, selfDon, selfPowerMod, seq, setActiveTargets, trashTop,
  when, withCost, type CharSpec, type Condition, type Effect,
} from './bricks.ts';
import { lookTopTake } from './bricks-cards.ts';
import { oncePerTurn } from './bricks-power.ts';

const FISH_OR_MERFOLK: CharSpec = { anyOf: [{ type: 'Fish-Man' }, { type: 'Merfolk' }] };
const leaderFishOrMerfolk: Condition = (s, p) => ['Fish-Man', 'Merfolk'].some((t) => def(s.players[p].leader.num).types.includes(t));

// « Si tous vos Personnages incluent "GERMA" dans leur type » : la carte qui porte l'effet est elle-même un Personnage
// {GERMA 66} sur le terrain, il y a donc toujours au moins un Personnage (la question n° 1902, terrain sans Personnage,
// ne se pose pas)
const onlyGerma = (s: GameState, p: PlayerId) => s.players[p].chars.every((c) => def(c.num).types.some((t) => t.includes('GERMA')));

// Le même effet, joué par l'adversaire (« votre adversaire place ... » : c'est lui qui choisit)
const oppCtx = (ctx: EffectCtx): EffectCtx => ({
  ...ctx, me: ctx.opp, opp: ctx.me,
  ask: (d) => ctx.ask({ ...d, player: d.player ?? ctx.opp }),
});

// Prince Grus : « tous les Personnages adverses de 2000 de puissance ou moins ne peuvent pas activer [Bloqueur] pour
// tout le tour » (ceux du moment, puissance lue à la résolution)
const GRUS = 'Prince Grus';
const lowBlockers = (s: GameState, p: PlayerId) => s.players[other(p)].chars.filter((c) => power(s, c.uid) <= 2000);
const grusNoBlock: Effect = effect((ctx) => {
  const list = lowBlockers(ctx.s, ctx.me);
  for (const c of list) addMod(ctx.s, { uid: c.uid, stat: 'noBlocker', amount: 0, until: 'turn', source: GRUS });
  if (list.length) log(ctx.s, ctx.me, `${list.map((c) => def(c.num).name).join(', ')} ne peu${list.length > 1 ? 'vent' : 't'} pas activer [Bloqueur] pour le tour (${GRUS})`);
}, (s, p) => lowBlockers(s, p).some((c) => hasBlocker(s, other(p), c)));

// Gotti : « renvoyez à la main de son propriétaire jusqu'à 1 Personnage de coût 1 ou moins ou placez-le au-dessous du
// deck de son propriétaire » (le joueur choisit la carte, puis où elle va)
const GOTTI = 'Gotti';
const gottiList = (s: GameState, p: PlayerId) => candidates(s, p, anyChar({ costMax: 1 }), (c) => canLeaveByEffect(s, c.uid, p));
const gottiRemove: Effect = effect((ctx) => {
  const uid = chooseUpTo1(ctx, gottiList(ctx.s, ctx.me), `${GOTTI} : Personnage de coût 1 ou moins à renvoyer en main ou sous le deck :`, 'bounce');
  if (uid === null) return;
  const where = ctx.ask({
    prompt: `${GOTTI} : ${describe(ctx.s, uid)} va...`,
    options: [{ id: 'hand', label: 'Dans la main de son propriétaire' }, { id: 'bottom', label: 'Au-dessous du deck de son propriétaire' }],
    tag: 'removeWhere',
  });
  removeByEffect(ctx, uid, where === 'hand' ? 'hand' : 'deckBottom');
}, (s, p) => gottiList(s, p).length > 0);

// Verygood : « votre adversaire place 3 Événements de sa Défausse au-dessous de son deck dans l'ordre de son choix »
// (moins de 3 : tous ceux qu'il a ; c'est l'adversaire qui les choisit et les range)
const VERYGOOD = 'Verygood';
const verygood: Effect = effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  const isEvent = (c: Card) => def(c.num).category === 'EVENT';
  const octx = oppCtx(ctx);
  let chosen: Card[];
  if (O.trash.filter(isEvent).length <= 3) chosen = O.trash.filter(isEvent);
  else {
    chosen = [];
    for (let i = 0; i < 3; i++) {
      const options = uniqueByNum(O.trash.filter((c) => isEvent(c) && !chosen.includes(c)));
      const answer = octx.ask({
        prompt: `${VERYGOOD} : Événement de ta Défausse à placer au-dessous de ton deck (${i + 1}/3) :`,
        options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
        tag: 'trashToBottom',
      });
      chosen.push(O.trash.find((c) => c.uid === Number(answer.split(':')[1]))!);
    }
  }
  if (!chosen.length) return;
  O.trash = O.trash.filter((c) => !chosen.includes(c));
  O.deck.push(...bottomOrder(octx, chosen));
  reveal(ctx.s, chosen.map((c) => c.uid), 'both');
  log(ctx.s, ctx.opp, `place ${chosen.map((c) => def(c.num).name).join(', ')} de sa Défausse au-dessous de son deck (${VERYGOOD})`);
}, (s, p) => s.players[other(p)].trash.some((c) => def(c.num).category === 'EVENT'));

// Hermep : « piochez 1 carte et jouez jusqu'à 1 carte Personnage {SWORD} de coût 8 ou moins autre que [Helmeppo] de votre
// Défausse. Puis, placez le Personnage joué ainsi au-dessous du deck de son propriétaire à la fin de ce tour »
const HERMEP = 'Hermep';
const hermepEligible = (c: Card) => def(c.num).category === 'CHARACTER' && hasType(c.num, 'SWORD') && (def(c.num).cost ?? 0) <= 8
  && !def(c.num).names.includes('Helmeppo');
const hermepPlay: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (!canPlayCharacters(ctx.s, ctx.me)) return;
  const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.trash.filter((c) => hermepEligible(c) && canPlayCharacters(ctx.s, ctx.me, c.num))));
  if (!options.length) return;
  const answer = ctx.ask({
    prompt: `${HERMEP} : jouer jusqu’à 1 Personnage {SWORD} de coût 8 ou moins de ta Défausse (placé au-dessous de ton deck à la fin du tour) :`,
    options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
  });
  if (answer === 'none') return;
  const [chosen] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
  playCharacter(ctx, ctx.me, chosen, { from: 'trash' });
  if (P.chars.some((c) => c.uid === chosen.uid)) {
    addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'bottomChar', amount: 0, uid: chosen.uid, source: HERMEP });
  }
}, (s, p) => canPlayCharacters(s, p) && s.players[p].trash.some(hermepEligible));

// Keimi : « placez 1 carte du dessus de la Vie de chaque joueur dans leur Défausse respective »
const KEIMI = 'Keimi';
const trashTopLifeBoth: Effect = effect((ctx) => {
  for (const p of [ctx.me, ctx.opp]) {
    const P = ctx.s.players[p];
    const top = P.life.shift();
    if (!top) continue;
    P.trash.push({ uid: top.uid, num: top.num });
    log(ctx.s, p, `place ${def(top.num).name}, la carte du dessus de sa Vie, dans sa Défausse (${KEIMI}, ${P.life.length} Vie)`);
  }
});

// Le Chignon : « redressez ce Personnage à la fin de ce tour » (repère sur la carte, oublié si elle quitte le terrain ;
// usedOpt est vidé au début de chaque tour)
const CHIGNON = 'Le Chignon';
const READY_AT_END = 'readyAtEnd';

// Fukaboshi : « s'il devait être mis KO, vous pouvez épuiser 1 de vos [Fish-Man Island] ou votre Leader [Shirahoshi] à
// la place » (le Lieu ou le Leader doit être redressé)
const FUKABOSHI = 'Fukaboshi';
const fukaboshiRestable = (s: GameState, p: PlayerId) => {
  const P = s.players[p];
  return [
    ...(P.stage && !P.stage.rested && def(P.stage.num).names.includes('Fish-Man Island') ? [P.stage] : []),
    ...(!P.leader.rested && def(P.leader.num).names.includes('Shirahoshi') ? [P.leader] : []),
  ];
};

export const OP11: Record<string, CardBehavior> = {
  // Smoker : [Bloqueur] ; [DON!! x1] ne peut pas être mis KO par l'effet d'un Personnage (de l'un ou l'autre camp) qui
  // n'a pas l'attribut <Spécial> (carte dont vient l'effet connue ; un Événement ou un Leader ne le protège pas)
  'OP11-005': {
    cantBeKO: (_s, _owner, self, cause, _by, sourceNum) => cause === 'effect' && self.don >= 1 && sourceNum !== undefined
      && def(sourceNum).category === 'CHARACTER' && !def(sourceNum).attributes.includes('Special'),
  },

  // Prince Grus : [En attaquant] les Personnages adverses de 2000 de puissance ou moins ne peuvent pas activer [Bloqueur]
  // pour tout le tour (n° 2701)
  'OP11-013': card({ whenAttacking: grusNoBlock }, { attackUseful: () => false }),

  // X Calibur : la VO du catalogue est une copie de celle d'OP11-019 ; la carte est codée d'après la VF (n° 2700) :
  // [Principale] jusqu'à 2 Personnages adverses −2000 pour le tour, puis jusqu'à 1 de vos Personnages {Navy} +1000 pour
  // le tour ; [Déclenchement] KO d'un Personnage adverse de 4000 de puissance ou moins
  'OP11-020': card({
    onMain: seq(powerMod(oppChar(), -2000, 'turn', 'X Calibur', 2), powerMod(ownChar({ type: 'Navy' }), 1000, 'turn', 'X Calibur')),
    onTrigger: ko(oppChar({ powerMax: 4000 }), 'X Calibur'),
  }),

  // Jinbe (Leader) : [Fin de votre tour] avec 6 cartes ou moins en main, redresser jusqu'à 1 Personnage {Fish-Man} ou
  // {Merfolk} et 1 DON!! (n° 2702)
  'OP11-021': card({
    endOfTurn: when((s, p) => s.players[p].hand.length <= 6, seq(setActiveTargets(ownChar(FISH_OR_MERFOLK), 'Jinbe'), readyDon(1))),
  }),

  // Arlong : −3 de coût en main avec un Leader {Fish-Man}, 3 Vies ou moins et 5 cartes épuisées ou plus chez l'adversaire
  // (DON!! comprises) ; [Déclenchement] épuiser un Personnage adverse de coût 4 ou moins
  'OP11-023': card({ onTrigger: rest(oppChar({ costMax: 4 }), 'Arlong') }, {
    handCost: (s, p) => (def(s.players[p].leader.num).types.includes('Fish-Man') && s.players[p].life.length <= 3
      && restedCards(s, other(p)) >= 5 ? -3 : 0),
  }),

  // Jinbe : [Jouée] avec un Leader {Fish-Man} ou {Merfolk}, épuiser un Personnage adverse de coût 5 ou moins ;
  // [Activation : Principale] [Une fois par tour] jusqu'à 1 Personnage {Fish-Man} ou {Merfolk} peut attaquer les
  // Personnages le tour où il est joué ([Initiative : Personnage] pour le tour)
  'OP11-031': card({
    onPlay: when(leaderFishOrMerfolk, rest(oppChar({ costMax: 5 }), 'Jinbe')),
    activateMain: {
      label: 'Jinbe : un Personnage {Hommes-poissons} ou {Sirènes} peut attaquer les Personnages le tour où il est joué',
      once: true,
      effect: {
        ...grant(ownChar(FISH_OR_MERFOLK), { stat: 'keyword', keyword: 'Rush: Character' }, 'turn', 'Jinbe', 'peut attaquer les Personnages le tour où il est joué'),
        // utile seulement pour un Personnage joué ce tour-ci
        useful: (s, p) => s.players[p].chars.some((c) => c.playedTurn === s.turn && !c.rested
          && ['Fish-Man', 'Merfolk'].some((t) => hasType(c.num, t))),
      },
    },
  }),

  // Monkey D. Luffy (Leader) : au début de son tour, avec 8 DON!! ou plus sur son terrain, regarder 5 cartes, en prendre
  // jusqu'à 1 {Straw Hat Crew}, le reste au-dessus ou au-dessous du deck (n° 2703)
  'OP11-040': {
    when: [{
      on: 'turnStart',
      if: (s, owner, _self, e) => e.player === owner && donOnField(s, owner) >= 8,
      run: (ctx) => {
        if (donOnField(ctx.s, ctx.me) < 8) return;
        lookTopTake(5, 1, { type: 'Straw Hat Crew' }, 'topOrBottom', 'Monkey D. Luffy').run(ctx);
      },
    }],
  },

  // Nami (Leader) : [Votre tour] [Une fois par tour] quand une carte quitte la Vie d'un joueur, piocher 1 avec 7 cartes ou
  // moins en main (n° 2704) ; [DON!! x1] [Attaque adverse] [Une fois par tour] défausser 1 carte : ce Leader +2000 pour
  // le tour
  'OP11-041': card({
    onOpponentAttack: when(selfDon(1), onceWithCost('oppAttack', discardCost(1), leaderPower(2000, 'turn', 'Nami'), 'Nami')),
  }, {
    when: [{
      on: 'lifeRemoved',
      once: 'OP11-041:life',
      if: (s, owner) => s.active === owner,
      run: (ctx) => { if (ctx.s.players[ctx.me].hand.length <= 7) drawCards(1).run(ctx); },
    }],
  }),

  // Ichiji Vinsmoke : [Bloqueur] ; [Attaque adverse] [Une fois par tour] si tous ses Personnages incluent « GERMA » dans
  // leur type : jusqu'à 1 Leader ou Personnage +1000 pour le combat, puis 2 cartes du dessus du deck dans la Défausse
  'OP11-043': card({
    onOpponentAttack: when(onlyGerma, oncePerTurn('oppAttack', seq(powerMod(ownLeaderOrChar(), 1000, 'battle', 'Ichiji Vinsmoke'), trashTop(2)))),
  }),

  // Yonji Vinsmoke : [Bloqueur] ; si tous ses Personnages incluent « GERMA » dans leur type, ne peut être ni mis KO ni
  // épuisé par un effet adverse (n° 2705)
  'OP11-046': {
    cantBeKO: (s, owner, _self, cause, by) => cause === 'effect' && by !== owner && onlyGerma(s, owner),
    cantBeRestedBy: (s, owner) => onlyGerma(s, owner),
  },

  // Gotti : [En attaquant] défausser 1 carte {Firetank Pirates} : un Personnage de coût 1 ou moins renvoyé en main ou
  // placé au-dessous du deck de son propriétaire
  'OP11-050': card({ whenAttacking: withCost(discardCost(1, { type: 'Firetank Pirates' }), gottiRemove, GOTTI) }),

  // Shu : [Bloqueur] ; [Une fois par tour] quand un Personnage adverse attaque : s'il a l'attribut <Tranche>, ce
  // Personnage +5000 pour le combat (n° 2706 : la limite compte dès le déclenchement, comme n° 1907)
  'OP11-088': {
    when: [{
      on: 'attack',
      once: 'OP11-088:attack',
      if: (_s, owner, _self, e) => e.player !== owner && e.zone === 'character',
      run: (ctx, e) => {
        if (e.num && def(e.num).attributes.includes('Slash')) selfPowerMod(5000, 'battle', 'Shu').run(ctx);
      },
    }],
  },

  // Verygood : [Jouée] l'adversaire place 3 Événements de sa Défausse au-dessous de son deck (n° 2707)
  'OP11-091': card({ onPlay: verygood }),

  // Hermep : [Jouée] défausser 1 carte : piocher 1 et jouer un {SWORD} de coût 8 ou moins de la Défausse, placé au-dessous
  // du deck de son propriétaire à la fin du tour
  'OP11-092': card({ onPlay: withCost(discardCost(1), seq(drawCards(1), hermepPlay), HERMEP) }),

  // Keimi : [Votre tour] [Une fois par tour] quand l'adversaire active un Événement ou un [Déclenchement] : s'il a 2 Vies
  // ou plus, la carte du dessus de la Vie de chaque joueur va dans sa Défausse (n° 2708)
  'OP11-102': {
    when: (['event', 'trigger'] as const).map((on) => ({
      on,
      once: 'OP11-102:oppActivates',
      if: (s: GameState, owner: PlayerId, _self: FieldCard, e: { player: PlayerId }) => s.active === owner && e.player === other(owner),
      run: (ctx: EffectCtx) => { if (ctx.s.players[ctx.opp].life.length >= 2) trashTopLifeBoth.run(ctx); },
    })),
  },

  // Le Chignon : [Bloqueur] ; [Activation : Principale] [Une fois par tour] avec le Leader [Shirahoshi], retourner la Vie
  // du dessus face cachée : ce Personnage sera redressé à la fin du tour
  'OP11-107': card({
    activateMain: {
      label: 'Le Chignon : se redresser à la fin du tour',
      once: true,
      condition: leaderNamed('Shirahoshi'),
      cost: flipTopLife(false),
      effect: effect((ctx) => {
        findField(ctx.s, ctx.source)?.card.usedOpt.push(READY_AT_END);
        log(ctx.s, ctx.me, `${CHIGNON} sera redressé à la fin du tour`);
      }, (s, _p, self) => Boolean(findField(s, self)?.card.rested)),
    },
  }, {
    when: [{
      on: 'turnEnd',
      if: (_s, owner, self, e) => e.player === owner && self.usedOpt.includes(READY_AT_END),
      run: (ctx) => { setActive(ctx.s, ctx.me, ctx.source); },
    }],
  }),

  // Fukaboshi : s'il devait être mis KO (combat ou effet), épuiser à la place son [Fish-Man Island] ou son Leader
  // [Shirahoshi] redressé ; [Jouée] ajouter à sa main la Vie du dessus ou du dessous : KO d'un Personnage adverse de coût
  // 1 ou moins
  'OP11-110': card({
    onPlay: withCost(lifeToHandCost('both'), ko(oppChar({ costMax: 1 }), FUKABOSHI), FUKABOSHI),
  }, {
    koReplace: {
      label: `${FUKABOSHI} : épuiser ton [Île des hommes-poissons] ou ton Leader [Shirahoshi]`,
      condition: (s, p) => fukaboshiRestable(s, p).length > 0,
      apply: (s, p, self, ctx) => {
        const options = fukaboshiRestable(s, p);
        const uid = options.length === 1 ? options[0].uid : Number(ctx.ask({
          player: p,
          prompt: `${FUKABOSHI} : carte à épuiser à la place du KO :`,
          options: options.map((c) => ({ id: `card:${c.uid}`, label: describe(s, c.uid), uid: c.uid })),
          tag: 'replace',
        }).split(':')[1]);
        const f = findField(s, uid);
        if (!f) return;
        f.card.rested = true;
        log(s, p, `épuise ${def(f.card.num).name} : ${def(self.num).name} n'est pas mis KO (${FUKABOSHI})`);
      },
    },
  }),
};

// Morceaux de recettes codés à la main (aucun pour l'instant)
export const MANUAL_OP11 = {};
