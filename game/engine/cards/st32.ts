// DECK POUR DÉBUTANT -VERT Roronoa Zoro- [ST-32] : effets codés d'après le texte officiel français
import {
  addDelayed, addMod, canBeRested, def, drawAndDiscard, fieldCost, giveRestedDon, leaderHasAttribute, leaderHasType, log,
  lookTopPick, payDon, queueReaction, restByEffect, setActive, untapDon,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  baseCostAtMost, costAtMost, drawLog, hasAttribute, isNamed, koOpp, lockOpp, ownPowerUp, playCharFromHand, restOpp,
} from './common.ts';

const ZORO = 'Roronoa Zoro';
const SLASH = 'Slash';  // <Tranche>
const zoroLeader = (s: GameState, p: PlayerId) => isNamed(s.players[p].leader.num, ZORO);
const slashLeader = (s: GameState, p: PlayerId) => leaderHasAttribute(s, p, SLASH);

// « Donnez jusqu'à 3 cartes DON!! épuisées à votre Leader [Roronoa Zoro] »
function donToZoroLeader(ctx: EffectCtx) {
  if (zoroLeader(ctx.s, ctx.me)) giveRestedDon(ctx.s, ctx.me, ctx.s.players[ctx.me].leader.uid, 3);
}

export const ST32: Record<string, CardBehavior> = {
  // Leader Zoro : [DON!! x3] [Activation : Principale] [Une fois par tour] s'il a combattu un Personnage ce tour,
  // redressez-le ; il ne peut plus attaquer les Personnages de coût de base 7 ou moins ce tour
  'OP12-020': {
    activateMain: {
      oncePerTurn: true,
      label: 'Zoro (Leader) : se redresser après avoir combattu un Personnage (il pourra attaquer le Leader adverse)',
      canActivate: (s, _p, card) => card.don >= 3 && card.rested && card.battledCharTurn === s.turn && canBeRested(s, card.uid),
      run: (ctx, card) => {
        card.usedOpt.push('main');
        if (card.battledCharTurn === ctx.s.turn) setActive(ctx.s, ctx.me, card.uid);
        addMod(ctx.s, { uid: card.uid, stat: 'noAttackLowCost', amount: 0, until: 'turn', source: 'Roronoa Zoro' });
      },
    },
  },

  // Perona : [Votre tour] [Une fois par tour] quand un Personnage est épuisé par vos effets, redressez 1 DON!!
  'OP10-036': {
    onRestedByEffect: (s, owner, card) => {
      if (card.usedOpt.includes('perona') || !s.players[owner].chars.some((c) => c.uid === card.uid)) return;
      card.usedOpt.push('perona');
      queueReaction(s, owner, card, 'untap');
    },
    reactions: {
      untap: (ctx) => {
        if (!ctx.s.players[ctx.me].donRested) return;
        log(ctx.s, ctx.me, 'Perona :');
        untapDon(ctx.s, ctx.me, 1);
      },
    },
  },

  // Kuina : [Activation : Principale] épuiser ce Personnage : épuisez 1 Personnage adverse de coût de base 4 ou moins,
  // puis 3 DON!! épuisées au Leader Zoro
  'OP12-026': {
    activateMain: {
      oncePerTurn: false,
      label: 'Kuina : s’épuiser pour épuiser 1 Personnage adverse de coût de base 4 ou moins (+3 DON!! au Leader Zoro)',
      canActivate: (s, _p, card) => !card.rested && canBeRested(s, card.uid),
      run: (ctx, card) => {
        restByEffect(ctx, card.uid);
        restOpp(ctx, baseCostAtMost(4), 'Kuina');
        donToZoroLeader(ctx);
      },
    },
  },

  // Koshiro : s'épuise à la place d'un Personnage <Tranche> de coût 5 ou moins mis KO par un effet adverse ; [Bloqueur]
  'OP12-027': {
    blocker: () => true,
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: true,
      label: (_s, _self, victim) => `Koshiro : épuiser Koshiro à la place de ${def(victim.num).name}`,
      condition: (s, _p, self, victim) => victim.uid !== self.uid && !self.rested && canBeRested(s, self.uid)
        && hasAttribute(victim.num, SLASH) && fieldCost(s, victim.uid) <= 5,
      apply: (s, p, self, victim) => {
        self.rested = true;
        log(s, p, `épuise Koshiro à la place de ${def(victim.num).name}`);
      },
    },
  },

  // Hiyori : [Activation : Principale] épuiser 1 DON!! et ce Personnage : avec le Leader Zoro, 5 cartes du dessus,
  // 1 carte <Tranche> ou 1 Événement vert
  'OP12-028': {
    activateMain: {
      oncePerTurn: false,
      label: 'Hiyori : épuiser 1 DON!! et Hiyori pour chercher une carte <Tranche> ou un Événement vert',
      canActivate: (s, p, card) => !card.rested && canBeRested(s, card.uid) && s.players[p].donActive > 0 && zoroLeader(s, p),
      run: (ctx, card) => {
        payDon(ctx.s, ctx.me, 1);
        restByEffect(ctx, card.uid);
        if (zoroLeader(ctx.s, ctx.me)) {
          lookTopPick(ctx, 5, 1, (n) => hasAttribute(n, SLASH) || (def(n).category === 'EVENT' && def(n).colors.includes('Green')), 'une carte <Tranche> ou un Événement vert');
        }
      },
    },
  },

  // Tashigi : [Jouée] épuisez 1 Personnage adverse de coût de base 6 ou moins, puis 3 DON!! épuisées au Leader Zoro
  'OP12-031': {
    onPlay: (ctx) => {
      restOpp(ctx, baseCostAtMost(6), 'Tashigi');
      donToZoroLeader(ctx);
    },
  },

  // « Luffy deviendra un jour le roi des pirates !! » : [Principale] redressez le Leader Zoro ; [Déclenchement] +1000
  'OP12-039': {
    mainUseful: (s, p) => s.players[p].leader.rested && isNamed(s.players[p].leader.num, ZORO),
    onMain: (ctx) => {
      const leader = ctx.s.players[ctx.me].leader;
      if (isNamed(leader.num, ZORO)) setActive(ctx.s, ctx.me, leader.uid);
    },
    onTrigger: (ctx) => { ownPowerUp(ctx, 1000, 'turn', 'Luffy deviendra un jour le roi des pirates !!'); },
  },

  // Ryuma : [Jouée]/[En attaquant] mettez KO 1 Personnage adverse épuisé de coût 4 ou moins
  'OP15-036': {
    onPlay: (ctx) => { koOpp(ctx, (c) => c.rested && costAtMost(ctx, 4)(c), 'Ryuma'); },
    whenAttacking: (ctx) => { koOpp(ctx, (c) => c.rested && costAtMost(ctx, 4)(c), 'Ryuma'); },
    attackUseful: (s, p) => s.players[p === 0 ? 1 : 0].chars.some((c) => c.rested && fieldCost(s, c.uid) <= 4),
  },

  // X-Drake : [Jouée] avec un Leader {Supernovae}, épuisez 1 Personnage adverse de coût 5 ou moins, puis redressez
  // 1 DON!! à la fin du tour
  'ST24-005': {
    onPlay: (ctx) => {
      if (!leaderHasType(ctx.s, ctx.me, 'Supernovas')) return;
      restOpp(ctx, costAtMost(ctx, 5), 'X-Drake');
      addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'untapDon', amount: 1 });
    },
  },

  // Kinémon : [Jouée] épuiser le Leader <Tranche> ou 1 DON!! : piochez 2 cartes, défaussez 1 carte
  'ST32-001': {
    onPlay: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = [
        ...(slashLeader(ctx.s, ctx.me) && !P.leader.rested && canBeRested(ctx.s, P.leader.uid) ? [{ id: 'leader', label: 'Épuiser mon Leader' }] : []),
        ...(P.donActive > 0 ? [{ id: 'don', label: 'Épuiser 1 DON!!' }] : []),
      ];
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: 'Kinémon : payer un coût pour piocher 2 cartes et en défausser 1 ?',
        options: [...options, { id: 'no', label: 'Non' }],
        tag: 'kinemonCost',
      });
      if (answer === 'no') return;
      if (answer === 'leader') restByEffect(ctx, P.leader.uid);
      else payDon(ctx.s, ctx.me, 1);
      drawAndDiscard(ctx, 2, 1);
    },
  },

  // Oden : [Jouée] piochez 1 carte ; 1 Personnage adverse de coût de base 6 ou moins ne peut pas être épuisé
  'ST32-002': {
    onPlay: (ctx) => {
      drawLog(ctx, 1);
      lockOpp(ctx, 'cantRest', baseCostAtMost(6), 'Oden Kozuki');
    },
  },

  // Mihawk : [Votre tour] quand il est épuisé, piochez 1 et défaussez 1 ; [Jouée] avec un Leader <Tranche>, jouez
  // [Perona] ou un Personnage <Tranche> de coût 5 ou moins
  'ST32-003': {
    onRested: (ctx) => drawAndDiscard(ctx, 1, 1),
    onPlay: (ctx) => {
      if (!slashLeader(ctx.s, ctx.me)) return;
      playCharFromHand(ctx, (c) => (isNamed(c.num, 'Perona') || hasAttribute(c.num, SLASH)) && (def(c.num).cost ?? 0) <= 5,
        'Mihawk : jouer jusqu’à 1 [Perona] ou Personnage <Tranche> de coût 5 ou moins de ta main :');
    },
  },

  // Rayleigh : [Initiative : Personnage] avec un Leader <Tranche> ; [Jouée] épuisez 2 Personnages adverses de coût 2 ou moins
  'ST32-004': {
    rushChar: (s, p) => slashLeader(s, p),
    onPlay: (ctx) => { restOpp(ctx, costAtMost(ctx, 2), 'Silvers Rayleigh', 2); },
  },

  // Zoro : [Initiative : Personnage] ; [Jouée] avec un Leader <Tranche>, épuisez 1 Personnage adverse de coût 2 ou moins
  'ST32-005': {
    rushChar: () => true,
    onPlay: (ctx) => {
      if (slashLeader(ctx.s, ctx.me)) restOpp(ctx, costAtMost(ctx, 2), 'Roronoa Zoro');
    },
  },
};
