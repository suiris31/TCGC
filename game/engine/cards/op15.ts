// CARTES D'OP15 CODÉES À LA MAIN (étape C, tâche S3) : celles que le traducteur ne comprend pas ou que le format des
// recettes ne sait pas dire (remplacements, règles d'un Leader, choix faits à la résolution). Codées d'après leur texte
// officiel VO (et la VF quand elle existe), avec les briques existantes ; les choix d'interprétation sont dans
// game/docs/interpretations.md (section « OP15 (tâche S3) », 2200 à 2299). Aucun texte de carte ici.
//
// Pas encore codées (le moteur ne sait pas les dire exactement, voir la PR de la tâche S3) : Kuro OP15-025 (effet
// différé avec un choix « à la fin de ce tour »), Monkey D. Luffy OP15-092 (puissance de base fixée en permanence par
// un effet permanent), les frères Risky OP15-093 (attribut <Tranche> donné par un effet).
import {
  addMod, allField, basePower, canPlayCharacters, chooseUpTo1, def, discardFromHand, drawAndDiscard, emit, fieldCost,
  findField, hasType, knownFirst, lifeToHand, log, other, playableByEffect, playCharacter, power, removeByEffect,
  removeFromField, reveal, uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  activateEventFromHand, candidates, card, chooseOne, discardCost, drawCards, effect, giveRestedDonToOwner,
  leaderNamed, leaderType, oppChar, playFromHand, playSelfFromTrash, restCost, selfKeyword, seq, setActiveTargets,
  trashSelf, trashToBottomCost, trashTop, when, withCost, ownChar, type Cost, type Effect, type Targets,
} from './bricks.ts';
import { giveOppRestedDonCost } from './bricks-don.ts';
import { trashByEffect } from './bricks-removal.ts';

const DRESSROSA = 'Dressrosa';
const SHC = 'Straw Hat Crew';           // {Équipage de Chapeau de paille}
const SKY = 'Sky Island';               // {Île céleste}

// « its owner's Leader or 1 of their Characters » : un Leader ou un Personnage de l'un ou l'autre camp
const anyLeaderOrChar: Targets = { side: 'any', leader: true, characters: true, spec: {}, label: 'Leader ou Personnage' };

// Effet de remplacement résolu pendant l'effet adverse : c'est le propriétaire de la carte qui choisit et agit
const asOwner = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num, ask: (spec) => ctx.ask({ player: owner, ...spec }),
});

// « Vous pouvez [coût] : [effet] », proposé seulement si l'effet peut servir (convention n° 1000)
const withCostIfUseful = (cost: Cost, then: Effect, source: string): Effect =>
  when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

const name = (s: GameState, uid: number) => def(findField(s, uid)!.card.num).name;

// ---------- Lucy (Leader OP15-002) ----------

// [En attaquant]/[Attaque adverse] défausser autant de cartes Événement ou Lieu qu'il veut : +1000 pour le combat par
// carte défaussée (une question par carte : « encore une ? »)
const isEventOrStage = (c: Card) => def(c.num).category === 'EVENT' || def(c.num).category === 'STAGE';
const lucyBattle: Effect = {
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    let n = 0;
    while (P.hand.some(isEventOrStage)) {
      const answer = ctx.ask({
        prompt: `Lucy : défausser une carte Événement ou Lieu de ta main (+1000 pour le combat)${n ? ` (déjà ${n})` : ''} ?`,
        options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }],
        tag: 'may',
      });
      if (answer !== 'yes') break;
      if (!discardFromHand(ctx, ctx.me, 1, 'Lucy : carte Événement ou Lieu à défausser :', isEventOrStage)) break;
      n++;
    }
    if (!n) return;
    addMod(ctx.s, { uid: P.leader.uid, stat: 'power', amount: 1000 * n, until: 'battle', source: 'Lucy' });
    log(ctx.s, ctx.me, `son Leader gagne +${1000 * n} de puissance pour le combat (Lucy)`);
  },
  useful: (s, p) => s.players[p].hand.some(isEventOrStage),
};

// « un de vos Événements de coût de base 3 ou plus a été activé durant ce tour » : noté sur le Leader au moment où
// l'Événement s'active (évènement 'event' du moteur) ; usedOpt est vidé au début de chaque tour
const LUCY_EVENT = 'lucy:event3';

// ---------- Effets propres à quelques cartes ----------

// « Give up to 1 DON!! card from its owner's cost area to its owner's Leader or 1 of their Characters » (Arlong
// OP15-023) : une DON!! redressée ou épuisée de la zone de Coût du propriétaire de la carte choisie. Sans question
// sur l'état de la DON!! : le joueur prend celle qui l'arrange (épuisée pour une de ses cartes, redressée pour une carte
// adverse, comme les frères Nyaban OP15-028), interprétation n° 2201
const giveFromOwnersCostArea = (source: string): Effect => {
  const list = (s: GameState, p: PlayerId, self?: number) => candidates(s, p, anyLeaderOrChar, (c) => {
    const O = s.players[findField(s, c.uid)!.player];
    return O.donActive + O.donRested > 0;
  }, self);
  return effect((ctx) => {
    const uid = chooseUpTo1(ctx, list(ctx.s, ctx.me, ctx.source), `${source} : carte qui reçoit 1 DON!! de la zone de Coût de son propriétaire :`, 'donTarget');
    if (uid === null) return;
    const f = findField(ctx.s, uid)!;
    const O = ctx.s.players[f.player];
    const useActive = f.player === ctx.me ? O.donRested === 0 : O.donActive > 0;
    if (useActive) O.donActive--;
    else O.donRested--;
    f.card.don++;
    log(ctx.s, ctx.me, `donne 1 DON!! ${useActive ? 'redressée' : 'épuisée'}${f.player === ctx.me ? '' : ' adverse'} à ${def(f.card.num).name} (${source})`);
  }, (s, p, self) => list(s, p, self).length > 0);
};

// « Up to 2 of your opponent's rested cards will not become active in your opponent's next Refresh Phase » (Arlong) :
// Leader, Personnages, Lieu ou DON!! épuisés, choisis un à un (comme Jewelry Bonney OP07-026, fam-sn-green.ts)
const lockOppRestedCards = (n: number, source: string): Effect => {
  const cards = (s: GameState, p: PlayerId) => {
    const O = s.players[other(p)];
    return [O.leader, ...O.chars, ...(O.stage ? [O.stage] : [])].filter((c) => c.rested);
  };
  return {
    run: (ctx) => {
      const O = ctx.s.players[ctx.opp];
      const turn = ctx.s.turn + (ctx.s.active === ctx.me ? 1 : 2);
      const chosen: number[] = [];
      let dons = 0;
      for (let i = 0; i < n; i++) {
        const options = [
          ...cards(ctx.s, ctx.me).filter((c) => !chosen.includes(c.uid)).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
          ...(O.donRested > dons ? [{ id: 'don', label: '1 DON!! épuisée adverse' }] : []),
        ];
        if (!options.length) return;
        const answer = ctx.ask({
          prompt: `${source} : carte adverse épuisée qui ne sera pas redressée lors de la prochaine phase de Recharge adverse${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
          options: [...options, { id: 'none', label: 'Aucune' }],
          tag: 'oppLock',
        });
        if (answer === 'none') return;
        if (answer === 'don') {
          dons++;
          const before = O.donNoRefresh?.turn === turn ? O.donNoRefresh.count : 0;
          O.donNoRefresh = { turn, count: Math.min(before + 1, O.donRested) };
          log(ctx.s, ctx.me, `1 DON!! épuisée adverse ne sera pas redressée lors de la prochaine phase de Recharge adverse (${source})`);
          continue;
        }
        const uid = Number(answer.split(':')[1]);
        chosen.push(uid);
        addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: turn, source });
        log(ctx.s, ctx.me, `${name(ctx.s, uid)} ne sera pas redressé lors de la prochaine phase de Recharge adverse (${source})`);
      }
    },
    useful: (s, p) => cards(s, p).length > 0 || s.players[other(p)].donRested > 0,
  };
};

// Pudding (OP15-031) : « Choisissez jusqu'à 1 Personnage adverse épuisé ; si son coût est égal au nombre de DON!! qui
// lui sont données, mettez-le KO ». Choisir un autre Personnage ne fait rien : seuls ceux qui seraient mis KO sont
// proposés (même jeu, interprétation n° 2202)
const puddingKo: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.opp].chars.filter((c) => c.rested && fieldCost(ctx.s, c.uid) === c.don).map((c) => c.uid);
    const uid = chooseUpTo1(ctx, list, 'Pudding : Personnage adverse épuisé (coût égal à ses DON!! données) à mettre KO :', 'oppKo');
    if (uid !== null) removeByEffect(ctx, uid, 'ko');
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => c.rested && fieldCost(s, c.uid) === c.don),
};

// « Ajoutez à votre main cette carte Personnage de votre Défausse » ([En cas de KO] de Kyros OP15-042)
const selfFromTrashToHand = (source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const i = P.trash.findIndex((c) => c.uid === ctx.source);
  if (i < 0) return;
  const [self] = P.trash.splice(i, 1);
  P.hand.push(self);
  reveal(ctx.s, [self.uid], ctx.opp);
  log(ctx.s, ctx.me, `ajoute ${def(self.num).name} de sa Défausse à sa main (${source})`);
}, (s, p, self) => s.players[p].trash.some((c) => c.uid === self));

// « Renvoyez à la main de son propriétaire jusqu'à 1 Lieu » (l'un ou l'autre camp ; OP15-054)
const bounceStage = (source: string): Effect => {
  const list = (s: GameState) => s.players.flatMap((P) => (P.stage ? [P.stage.uid] : []));
  return effect((ctx) => {
    const uid = chooseUpTo1(ctx, list(ctx.s), `${source} : Lieu à renvoyer dans la main de son propriétaire :`, 'bounce');
    if (uid === null) return;
    const owner = findField(ctx.s, uid)!.player;
    const f = removeFromField(ctx.s, uid, 'hand');
    if (!f) return;
    log(ctx.s, owner, `le Lieu ${def(f.card.num).name} est renvoyé dans la main de son propriétaire (${source})`);
    emit(ctx.s, { type: 'leave', player: owner, uid, num: f.card.num, zone: 'stage', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
  }, (s) => list(s).length > 0);
};

// « Jouez jusqu'à 1 carte ... de votre main / Défausse » quand la carte peut être un Lieu (Pieuvre ballon OP15-106), ou
// quand le Personnage joué reçoit ensuite un effet (Nami OP15-086 : [Initiative] pour le tour)
const playCard = (zone: 'hand' | 'trash', eligible: (num: string) => boolean, what: string, source: string, after?: (ctx: EffectCtx, uid: number) => void): Effect => {
  const ok = (s: GameState, p: PlayerId, c: Card) => eligible(c.num) && (zone !== 'hand' || playableByEffect(c.num))
    && (def(c.num).category === 'STAGE' || canPlayCharacters(s, p, c.num));
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const list = zone === 'hand' ? P.hand : P.trash;
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, list.filter((c) => ok(ctx.s, ctx.me, c))));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: `${source} : jouer jusqu’à 1 ${what} ${zone === 'hand' ? 'de ta main' : 'de ta Défausse'} :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const [c] = list.splice(list.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
      playCharacter(ctx, ctx.me, c);
      if (after && findField(ctx.s, c.uid)) after(ctx, c.uid);
    },
    useful: (s, p) => (zone === 'hand' ? s.players[p].hand : s.players[p].trash).some((c) => ok(s, p, c)),
  };
};

// Oz (OP15-080) : un [Gecko Moria] de 10000 de puissance ou plus sur son terrain (Leader compris), et aucune autre
// carte [Oars] sur son terrain (interprétation n° 2203)
const ozBonus = (s: GameState, p: PlayerId, self: FieldCard) =>
  allField(s, p).some((c) => def(c.num).names.includes('Gecko Moria') && power(s, c.uid) >= 10000)
  && !allField(s, p).some((c) => c.uid !== self.uid && def(c.num).names.includes('Oars'));

// Monkey D. Luffy (Leader OP15-098) : un de ses Personnages {Île céleste} de 6000 de puissance de base ou plus
const skyVictim = (s: GameState, p: PlayerId, victim: FieldCard) =>
  hasType(victim.num, SKY) && basePower(s, victim.uid) >= 6000 && s.players[p].life.length > 0;

export const OP15: Record<string, CardBehavior> = {
  // Lucy (Leader) : [En attaquant]/[Attaque adverse] défausser des Événements ou Lieux : +1000 par carte pour le combat ;
  // [Activation : Principale] [Une fois par tour] si un de ses Événements de coût de base 3 ou plus a été activé ce
  // tour, piocher 1 carte
  'OP15-002': card({
    whenAttacking: lucyBattle,
    onOpponentAttack: lucyBattle,
    activateMain: {
      label: 'Lucy : piocher 1 carte',
      once: true,
      condition: (s, _p, self) => Boolean(findField(s, self)?.card.usedOpt.includes(LUCY_EVENT)),
      effect: drawCards(1),
    },
  }, {
    // l'IA ne compte pas sur ce bonus pour attaquer : il dépend des cartes qu'elle voudra bien défausser
    attackUseful: () => false,
    when: [{
      on: 'event',
      // rien n'est déclenché : l'Événement activé est seulement noté sur le Leader (lu par l'[Activation : Principale])
      if: (s, p, self, e) => {
        if (e.player === p && e.num && (def(e.num).cost ?? 0) >= 3 && !self.usedOpt.includes(LUCY_EVENT) && findField(s, self.uid)) {
          self.usedOpt.push(LUCY_EVENT);
        }
        return false;
      },
      run: () => {},
    }],
  }),

  // Alvida : si elle devait être mise KO, défausser à la place 1 carte Personnage de 6000 de puissance ou moins ;
  // [Activation : Principale] [Une fois par tour] donner 1 DON!! épuisée adverse à un Personnage adverse : donner jusqu'à
  // 1 DON!! épuisée de son propriétaire à un Leader ou un Personnage
  'OP15-003': card({
    activateMain: {
      label: 'Alvida : donner 1 DON!! épuisée adverse à un Personnage adverse, puis donner 1 DON!! épuisée',
      once: true,
      cost: giveOppRestedDonCost(oppChar(), 1),
      effect: giveRestedDonToOwner(anyLeaderOrChar, 1, 'Alvida'),
    },
  }, {
    koReplace: {
      label: 'Alvida : défausser 1 carte Personnage de 6000 de puissance ou moins de ta main',
      condition: (s, p) => s.players[p].hand.some((c) => def(c.num).category === 'CHARACTER' && (def(c.num).power ?? 0) <= 6000),
      apply: (s, p, self, ctx) => {
        discardFromHand(ctx, p, 1, 'Alvida : carte Personnage de 6000 de puissance ou moins à défausser :',
          (c) => def(c.num).category === 'CHARACTER' && (def(c.num).power ?? 0) <= 6000);
        log(s, p, `${def(self.num).name} n'est pas mis KO (Alvida)`);
      },
    },
  }),

  // Brook (Leader) : il ne perd pas avec un deck vide, mais à la fin du tour où son deck est vide ; [Activation :
  // Principale] [Une fois par tour] placer 4 cartes du dessus de son deck dans sa Défausse ; puis, deck vide : redresser
  // jusqu'à 1 de ses Personnages
  'OP15-022': card({
    activateMain: {
      label: 'Brook : placer les 4 cartes du dessus de ton deck dans ta Défausse',
      once: true,
      effect: seq(effect(trashTop(4).run, (s, p) => s.players[p].deck.length > 0),
        when((s, p) => s.players[p].deck.length === 0, setActiveTargets(ownChar(), 'Brook'))),
    },
  }, { rules: { deckOut: 'loseAtEndOfTurn' } }),

  // Arlong : [En cas de KO] jusqu'à 2 cartes adverses épuisées ne seront pas redressées ; [Activation : Principale] [Une
  // fois par tour] donner 1 DON!! épuisée adverse à un Personnage adverse : donner 1 DON!! de la zone de Coût de son
  // propriétaire à un Leader ou un Personnage
  'OP15-023': card({
    onKO: lockOppRestedCards(2, 'Arlong'),
    activateMain: {
      label: 'Arlong : donner 1 DON!! épuisée adverse à un Personnage adverse, puis donner 1 DON!! de la zone de Coût',
      once: true,
      cost: giveOppRestedDonCost(oppChar(), 1),
      effect: giveFromOwnersCostArea('Arlong'),
    },
  }),

  // Pudding : [Jouée] mettre KO un Personnage adverse épuisé dont le coût égale ses DON!! données
  'OP15-031': card({ onPlay: puddingKo }),

  // Laboon : à la place d'un de ses Personnages de 7000 de puissance de base ou moins retiré par un effet adverse,
  // épuiser 2 de ses cartes
  'OP15-035': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Laboon : épuiser 2 de tes cartes, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, self, victim) => basePower(s, victim.uid) <= 7000 && restCost(2, 'cards').can(s, p, self.uid),
      apply: (s, p, self, victim, ctx) => {
        if (restCost(2, 'cards').pay(asOwner(ctx, p, self))) log(s, p, `${def(victim.num).name} reste sur le terrain (Laboon)`);
      },
    },
  },

  // Kyros : [Jouée] défausser 1 carte : avec le Leader [Rebecca], [Initiative] pour le tour ; [En cas de KO] revenir de
  // la Défausse dans la main
  'OP15-042': card({
    onPlay: withCostIfUseful(discardCost(1), when(leaderNamed('Rebecca'), selfKeyword('Rush', 'Kyros')), 'Kyros'),
    onKO: selfFromTrashToHand('Kyros'),
  }),

  // Sabo : [Bloqueur] ; [Jouée] avec un Leader {Dressrosa}, activer jusqu'à 1 Événement {Dressrosa} de sa main
  'OP15-046': card({ onPlay: when(leaderType(DRESSROSA), activateEventFromHand({ type: DRESSROSA }, 'Sabo')) }),

  // Léo : à la place d'un de ses Personnages de 7000 de puissance de base ou moins retiré par un effet adverse, placer
  // un autre de ses Personnages au-dessous du deck de son propriétaire (interprétation n° 2204)
  'OP15-052': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Léo : placer un autre de tes Personnages au-dessous de ton deck, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, _self, victim) => basePower(s, victim.uid) <= 7000 && s.players[p].chars.some((c) => c.uid !== victim.uid),
      apply: (s, p, self, victim, ctx) => {
        const own = asOwner(ctx, p, self);
        const list = s.players[p].chars.filter((c) => c.uid !== victim.uid).map((c) => c.uid);
        const answer = own.ask({
          prompt: `Léo : Personnage à placer au-dessous de ton deck à la place de ${def(victim.num).name} :`,
          options: list.map((uid) => ({ id: `card:${uid}`, label: name(s, uid), uid })),
          tag: 'bottomOwn',
        });
        removeByEffect(own, Number(answer.split(':')[1]), 'deckBottom');
        log(s, p, `${def(victim.num).name} reste sur le terrain (Léo)`);
      },
    },
  },

  // C'est le seul « souvenir »... : [Principale] avec le Leader [Lucy], au choix : piocher 2 cartes et en défausser 1,
  // puis jouer un Personnage {Dressrosa} de coût 4 ou moins de sa main ; ou renvoyer jusqu'à 1 Lieu en main
  'OP15-054': card({
    onMain: when(leaderNamed('Lucy'), chooseOne('C’est le seul « souvenir »', [
      {
        label: 'Piocher 2 cartes et en défausser 1, puis jouer un Personnage {Dressrosa} de coût 4 ou moins',
        effect: seq(effect((ctx) => drawAndDiscard(ctx, 2, 1)), playFromHand({ type: DRESSROSA, costMax: 4 }, 'C’est le seul « souvenir »')),
      },
      { label: 'Renvoyer jusqu’à 1 Lieu dans la main de son propriétaire', effect: bounceStage('C’est le seul « souvenir »') },
    ])),
  }),

  // Bobby Funk : +3000 s'il a un Personnage [Kelly Funk] (aucun Leader ne porte ce nom). Codé à la main : la recette
  // compilée relisait sa propre puissance en cherchant [Kelly Funk] parmi ses Personnages (récursion sans fin)
  'OP15-050': {
    selfPower: (s, p, self) => (s.players[p].chars.some((c) => c.uid !== self.uid && def(c.num).names.includes('Kelly Funk')) ? 3000 : 0),
  },

  // Oz : +7000 avec un [Gecko Moria] de 10000 de puissance ou plus et sans autre [Oars] ; [En cas de KO] placer 3
  // cartes de sa Défausse au-dessous de son deck : se jouer depuis la Défausse
  'OP15-080': card({
    onKO: withCostIfUseful(trashToBottomCost(3), playSelfFromTrash('Oz'), 'Oz'),
  }, { selfPower: (s, p, self) => (ozBonus(s, p, self) ? 7000 : 0) }),

  // Nami : [Jouée] avec un Leader {Équipage de Chapeau de paille}, jouer de sa Défausse un Personnage {Équipage de
  // Chapeau de paille} de coût 7 ou moins, qui gagne [Initiative] pour le tour
  'OP15-086': card({
    onPlay: when(leaderType(SHC), playCard('trash',
      (num) => def(num).category === 'CHARACTER' && def(num).types.includes(SHC) && (def(num).cost ?? 0) <= 7,
      'Personnage de type {Équipage de Chapeau de paille} de coût 7 ou moins', 'Nami',
      (ctx, uid) => {
        addMod(ctx.s, { uid, stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source: 'Nami' });
        log(ctx.s, ctx.me, `${name(ctx.s, uid)} gagne [Initiative] pour le tour (Nami)`);
      })),
  }),

  // Perona : à la place d'un de ses Personnages de 7000 de puissance de base ou moins retiré par un effet adverse,
  // défausser 1 carte
  'OP15-090': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Perona : défausser 1 carte, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, _self, victim) => basePower(s, victim.uid) <= 7000 && s.players[p].hand.length > 0,
      apply: (s, p, _self, victim, ctx) => {
        if (discardFromHand(ctx, p, 1, 'Perona : carte à défausser :')) log(s, p, `${def(victim.num).name} reste sur le terrain (Perona)`);
      },
    },
  },

  // Roronoa Zoro : à la place d'un autre de ses Personnages {Équipage de Chapeau de paille} retiré par un effet adverse,
  // se placer dans la Défausse ; [Bloqueur]
  'OP15-094': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Roronoa Zoro : se placer dans ta Défausse, ${def(victim.num).name} reste sur le terrain`,
      condition: (_s, _p, self, victim) => victim.uid !== self.uid && hasType(victim.num, SHC),
      apply: (s, p, self, victim, ctx) => {
        if (trashByEffect(asOwner(ctx, p, self), self.uid)) log(s, p, `${def(victim.num).name} reste sur le terrain (Roronoa Zoro)`);
      },
    },
  },

  // Monkey D. Luffy (Leader) : à la place d'un de ses Personnages {Île céleste} de 6000 de puissance de base ou plus
  // retiré à cause de l'adversaire (effet adverse, ou KO en combat contre une attaque adverse), prendre en main la carte
  // du dessus de sa Vie (interprétation n° 2205)
  'OP15-098': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Monkey D. Luffy : prendre en main la carte du dessus de ta Vie, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, _self, victim) => skyVictim(s, p, victim),
      apply: (s, p) => { lifeToHand(s, p, 'top'); },
    },
    koReplaceAlly: {
      label: (_s, _self, victim) => `Monkey D. Luffy : prendre en main la carte du dessus de ta Vie pour garder ${def(victim.num).name}`,
      // seulement le KO en combat (les effets adverses passent par replaceRemoval ci-dessus)
      condition: (s, p, _self, victim) => Boolean(s.battle && s.battle.target === victim.uid && s.active !== p) && skyVictim(s, p, victim),
      apply: (s, p) => { lifeToHand(s, p, 'top'); },
    },
  },

  // Pieuvre ballon : [Déclenchement] piocher 1 carte ; puis jouer de sa main jusqu'à 1 carte Personnage ou Lieu jaune
  // de coût 2 ou moins
  'OP15-106': card({
    onTrigger: seq(drawCards(1), playCard('hand',
      (num) => (def(num).category === 'CHARACTER' || def(num).category === 'STAGE') && def(num).colors.includes('Yellow') && (def(num).cost ?? 0) <= 2,
      'carte Personnage ou Lieu jaune de coût 2 ou moins', 'Pieuvre ballon')),
  }),
};

// Rien de codé à la main n'est appelé par une recette d'OP15 pour l'instant (sortie « manual », 01-contrats.md § 15.2)
export const MANUAL_OP15 = {};
