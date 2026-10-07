// DECK POUR DÉBUTANT -BLEU Kuzan- [ST-33] : effets codés d'après le texte officiel français
import {
  def, discardFromHand, draw, drawAndDiscard, hasType, leaderHasType, log, lookTopPick, power, queueReaction, removeFromField,
} from '../rules.ts';
import type { CardBehavior, EffectCtx } from '../types.ts';
import {
  bottomOpp, bounceAny, costAtMost, counterBoost, drawLog, isNamed, lockOpp, mayDiscard, playCharFromHand, typed,
} from './common.ts';

const MARINE = 'Navy';  // {Marine}
const marineLeader = (ctx: EffectCtx) => leaderHasType(ctx.s, ctx.me, MARINE);

export const ST33: Record<string, CardBehavior> = {
  // Leader Kuzan : quand des cartes de sa main sont défaussées par l'effet d'une de ses cartes {Marine}, il pioche autant
  'OP12-040': {
    onOwnDiscard: (s, owner, card, count, sourceNum) => {
      if (card.uid === s.players[owner].leader.uid && hasType(sourceNum, MARINE)) queueReaction(s, owner, card, 'draw', { count });
    },
    reactions: {
      draw: (ctx, data) => {
        const P = ctx.s.players[ctx.me];
        const before = P.hand.length;
        draw(ctx.s, ctx.me, Number(data.count));
        const n = P.hand.length - before;
        log(ctx.s, ctx.me, `Kuzan (Leader) : pioche ${n} carte${n > 1 ? 's' : ''}`);
      },
    },
  },

  // Bluegrass : [Jouée] 1 Personnage adverse de coût 1 ou moins au-dessous du deck ; [En attaquant] pioche 1, défausse 1
  'EB04-026': {
    onPlay: (ctx) => { bottomOpp(ctx, costAtMost(ctx, 1), 'Bluegrass'); },
    whenAttacking: (ctx) => drawAndDiscard(ctx, 1, 1),
  },

  // Ice Time : [Principale] défausser 1 carte : avec un Leader {Marine}, 2 Personnages adverses de 10000 ou moins ne
  // peuvent pas attaquer ; [Déclenchement] renvoyez en main 1 Personnage de coût 5 ou moins
  'EB04-028': {
    mainUseful: (s, p) => s.players[p].hand.length >= 2 && leaderHasType(s, p, MARINE)
      && s.players[p === 0 ? 1 : 0].chars.some((c) => power(s, c.uid) <= 10000),
    onMain: (ctx) => {
      if (!mayDiscard(ctx, 'Ice Time : défausser 1 carte pour empêcher 2 Personnages adverses d’attaquer ?')) return;
      if (marineLeader(ctx)) lockOpp(ctx, 'cantAttack', (c) => power(ctx.s, c.uid) <= 10000, 'Ice Time', 2);
    },
    onTrigger: (ctx) => { bounceAny(ctx, costAtMost(ctx, 5), 'Ice Time'); },
  },

  // Kuzan : +1 de coût avec 5 cartes en main ou plus ; [Jouée] défausser 1 carte : 1 Personnage adverse ne peut pas attaquer
  'OP12-043': {
    selfCost: (s, p) => (s.players[p].hand.length >= 5 ? 1 : 0),
    onPlay: (ctx) => {
      if (ctx.s.players[ctx.opp].chars.length && mayDiscard(ctx, 'Kuzan : défausser 1 carte pour qu’un Personnage adverse ne puisse pas attaquer ?')) {
        lockOpp(ctx, 'cantAttack', () => true, 'Kuzan');
      }
    },
  },

  // Zéphyr : [Jouée] défaussez 2 cartes ; [Activation : Principale] le placer dans la Défausse : renvoyez en main
  // 1 Personnage de coût 5 ou moins
  'OP12-046': {
    onPlay: (ctx) => { discardFromHand(ctx, ctx.me, 2, 'Zéphyr : défausse 2 cartes de ta main'); },
    activateMain: {
      oncePerTurn: false,
      label: 'Zéphyr : se placer dans la Défausse pour renvoyer en main 1 Personnage de coût 5 ou moins',
      canActivate: (s, p) => s.players[p === 0 ? 1 : 0].chars.length > 0,
      run: (ctx, card) => {
        removeFromField(ctx.s, card.uid, 'trash');
        log(ctx.s, ctx.me, 'place Zéphyr dans sa Défausse');
        bounceAny(ctx, costAtMost(ctx, 5), 'Zéphyr');
      },
    },
  },

  // Sengoku : [Jouée] défausser 1 carte : 5 cartes du dessus, jusqu'à 2 cartes {Marine} autres que Sengoku
  'OP12-047': {
    onPlay: (ctx) => {
      if (mayDiscard(ctx, 'Sengoku : défausser 1 carte pour chercher 2 cartes {Marine} ?')) {
        lookTopPick(ctx, 5, 2, (n) => hasType(n, MARINE) && !isNamed(n, 'Sengoku'), 'une carte {Marine} autre que Sengoku');
      }
    },
  },

  // Haguar D. Sauro : [Bloqueur]
  'OP12-050': { blocker: () => true },

  // Ice Block, bec de faisan : [Contre] +4000 pour le combat, puis défaussez 1 carte ; [Déclenchement] défausser 1 : pioche 1
  'OP12-057': {
    onCounter: (ctx) => {
      counterBoost(ctx, 4000, 'Ice Block, bec de faisan');
      discardFromHand(ctx, ctx.me, 1, 'Ice Block : défausse 1 carte de ta main');
    },
    onTrigger: (ctx) => {
      if (mayDiscard(ctx, 'Ice Block : défausser 1 carte pour piocher 1 carte ?')) drawLog(ctx, 1);
    },
  },

  // Kobby : [Bloqueur] ; [Jouée] défausser 1 carte : piochez 1 carte
  'ST33-001': {
    blocker: () => true,
    onPlay: (ctx) => {
      if (mayDiscard(ctx, 'Kobby : défausser 1 carte pour piocher 1 carte ?')) drawLog(ctx, 1);
    },
  },

  // Sakazuki : [En attaquant] défausser 1 carte : si l'adversaire a 6 cartes ou plus, il en défausse 1 ;
  // [En cas de KO] jouez 1 Personnage {Marine} de coût 4 ou moins
  'ST33-002': {
    attackUseful: (s, p) => s.players[p === 0 ? 1 : 0].hand.length >= 6 && s.players[p].hand.length > 0,
    whenAttacking: (ctx) => {
      if (ctx.s.players[ctx.opp].hand.length < 6 || !mayDiscard(ctx, 'Sakazuki : défausser 1 carte pour que l’adversaire en défausse 1 ?')) return;
      if (ctx.s.players[ctx.opp].hand.length >= 6) discardFromHand(ctx, ctx.opp, 1, 'Sakazuki : défausse 1 carte de ta main');
    },
    onKO: (ctx) => {
      playCharFromHand(ctx, (c) => hasType(c.num, MARINE) && (def(c.num).cost ?? 0) <= 4, 'Sakazuki : jouer jusqu’à 1 Personnage {Marine} de coût 4 ou moins de ta main :');
    },
  },

  // Smoker : [Jouée] défausser 1 carte : 2 Personnages adverses de coût 2 ou moins au-dessous du deck
  'ST33-003': {
    onPlay: (ctx) => {
      if (!ctx.s.players[ctx.opp].chars.some(costAtMost(ctx, 2))) return;
      if (mayDiscard(ctx, 'Smoker : défausser 1 carte pour placer au-dessous du deck 2 Personnages adverses de coût 2 ou moins ?')) {
        bottomOpp(ctx, costAtMost(ctx, 2), 'Smoker', 2);
      }
    },
  },

  // Borsalino : −3 de coût en main le tour où une carte de votre main a été défaussée par un effet ; [Bloqueur]
  'ST33-004': {
    handCost: (s, p) => (s.players[p].discardedTurn === s.turn ? -3 : 0),
    blocker: () => true,
  },

  // Garp : [Jouée] avec un Leader {Marine}, jouez 1 Personnage bleu {Marine} de 8000 ou moins autre que Garp
  'ST33-005': {
    onPlay: (ctx) => {
      if (!marineLeader(ctx)) return;
      playCharFromHand(ctx, (c) => typed(MARINE)(c) && def(c.num).colors.includes('Blue') && (def(c.num).power ?? 0) <= 8000 && !isNamed(c.num, 'Monkey.D.Garp'),
        'Garp : jouer jusqu’à 1 Personnage bleu {Marine} de 8000 de puissance ou moins de ta main :');
    },
  },
};
