// DECK POUR DÉBUTANT -VIOLET Charlotte Katakuri- [ST-34] : effets codés d'après le texte officiel français
import {
  addDonFromDeck, addMod, addTopDeckToLife, baseCost, canBeRested, chooseUpTo1, declareAndReveal, def, discardFromHand,
  donOnField, fieldCards, findField, hasType, leaderHasType, log, lookTopPick, may, peekTop, power, queueReaction, restByEffect, returnDon,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import { baseCostAtMost, costAtMost, counterBoost, drawLog, isNamed, koOpp, ownPowerUp, playCharFromHand } from './common.ts';

const BIG_MOM = 'Big Mom Pirates';  // {Équipage de Big Mom}
const KATAKURI = 'Charlotte Katakuri';
const bigMomLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, BIG_MOM);

// Leader Katakuri : [En attaquant]/[Attaque adverse] [Une fois par tour] DON!! −1 : regarder la carte du dessus du deck
// adverse, puis +1000 pour le combat
function katakuriLeader(ctx: EffectCtx) {
  const { s } = ctx;
  const leader = s.players[ctx.me].leader;
  if (leader.uid !== ctx.source || leader.usedOpt.includes('katakuri') || donOnField(s, ctx.me) < 1 || !s.battle) return;
  if (!may(ctx, 'Katakuri (Leader) : DON!! −1 pour regarder la carte du dessus du deck adverse et gagner +1000 pour le combat ?', 'mayKatakuri')) return;
  leader.usedOpt.push('katakuri');
  returnDon(s, ctx.me, 1);
  peekTop(s, ctx.me);
  addMod(s, { uid: leader.uid, stat: 'power', amount: 1000, until: 'battle', source: KATAKURI });
  log(s, ctx.me, 'Katakuri (Leader) gagne +1000 de puissance pour le combat');
}

export const ST34: Record<string, CardBehavior> = {
  'OP11-062': {
    whenAttacking: katakuriLeader,
    attackUseful: (s, p, card, target) => !card.usedOpt.includes('katakuri') && donOnField(s, p) >= 1 && power(s, card.uid) + 1000 >= power(s, target),
    onOpponentAttack: { optKey: 'katakuri', run: katakuriLeader },
  },

  // Katakuri : [Votre tour] [Une fois par tour] quand des DON!! retournent au deck DON!!, avec un Leader
  // {Équipage de Big Mom}, ajoutez 2 DON!! épuisées ; [En cas de KO] jouez 1 Personnage de 8000 ou moins
  'ST34-001': {
    onDonReturned: (s, owner, card) => {
      if (s.active !== owner || card.usedOpt.includes('katakuriDon') || !s.players[owner].chars.some((c) => c.uid === card.uid) || !bigMomLeader(s, owner)) return;
      card.usedOpt.push('katakuriDon');
      queueReaction(s, owner, card, 'addDon');
    },
    reactions: {
      addDon: (ctx) => {
        log(ctx.s, ctx.me, 'Katakuri :');
        addDonFromDeck(ctx.s, ctx.me, 2, false);
      },
    },
    onKO: (ctx) => {
      playCharFromHand(ctx, (c) => (def(c.num).power ?? 0) <= 8000, 'Katakuri : jouer jusqu’à 1 Personnage de 8000 de puissance ou moins de ta main :');
    },
  },

  // Brûlée : [Jouée] 3 cartes du dessus, 1 carte {Équipage de Big Mom}
  'ST34-003': {
    onPlay: (ctx) => { lookTopPick(ctx, 3, 1, (n) => hasType(n, BIG_MOM), 'une carte {Équipage de Big Mom}'); },
  },

  // Linlin : [Jouée] DON!! −4 et défausser 1 carte : la carte du dessus du deck au-dessus de la Vie, puis puissance de
  // base à 0 pour 1 Personnage adverse
  'ST34-004': {
    onPlay: (ctx) => {
      const { s } = ctx;
      if (donOnField(s, ctx.me) < 4 || !s.players[ctx.me].hand.length) return;
      if (!may(ctx, 'Charlotte Linlin : DON!! −4 et défausser 1 carte pour gagner 1 Vie et passer à 0 la puissance de base d’un Personnage adverse ?', 'mayLinlin')) return;
      returnDon(s, ctx.me, 4);
      discardFromHand(ctx, ctx.me, 1, 'Charlotte Linlin : défausse 1 carte de ta main');
      addTopDeckToLife(s, ctx.me);
      const target = chooseUpTo1(ctx, s.players[ctx.opp].chars.map((c) => c.uid), 'Charlotte Linlin : Personnage adverse dont la puissance de base passe à 0 :', 'oppBase0');
      if (target !== null) {
        addMod(s, { uid: target, stat: 'basePower', amount: 0, until: 'turn', source: 'Charlotte Linlin' });
        log(s, ctx.me, `la puissance de base de ${def(findField(s, target)!.card.num).name} passe à 0 pour le tour`);
      }
    },
  },

  // Cracker : [Jouée] avec un Leader {Équipage de Big Mom}, 1 DON!! épuisée, puis KO 1 Personnage adverse de coût 2 ou moins
  'ST34-002': {
    onPlay: (ctx) => {
      if (bigMomLeader(ctx.s, ctx.me)) addDonFromDeck(ctx.s, ctx.me, 1, false);
      koOpp(ctx, costAtMost(ctx, 2), 'Charlotte Cracker');
    },
  },

  // Pekoms : [En attaquant] DON!! −1 : KO 1 Personnage adverse de 2000 de puissance de base ou moins
  'ST34-005': {
    attackUseful: (s, p) => donOnField(s, p) >= 1 && s.players[p === 0 ? 1 : 0].chars.some((c) => (def(c.num).power ?? 0) <= 2000),
    whenAttacking: (ctx) => {
      const eligible = (num: string) => (def(num).power ?? 0) <= 2000;
      if (donOnField(ctx.s, ctx.me) < 1 || !ctx.s.players[ctx.opp].chars.some((c) => eligible(c.num))) return;
      if (!may(ctx, 'Pekoms : DON!! −1 pour mettre KO un Personnage adverse de 2000 de puissance de base ou moins ?', 'mayPekoms')) return;
      returnDon(ctx.s, ctx.me, 1);
      koOpp(ctx, (c) => eligible(c.num), 'Pekoms');
    },
  },

  // Flampée : [Votre tour] [Jouée] 1 [Charlotte Katakuri] +2000 pour le tour
  'EB03-032': {
    onPlay: (ctx) => {
      if (ctx.s.active !== ctx.me) return;
      ownPowerUp(ctx, 2000, 'turn', 'Charlotte Flampée', fieldCards(ctx.s, ctx.me).filter((c) => isNamed(c.num, KATAKURI)).map((c) => c.uid));
    },
  },

  // Pudding : [Bloqueur] ; [Jouée] si vous n'avez pas plus de DON!! que l'adversaire, 1 DON!! épuisée
  'EB03-035': {
    blocker: () => true,
    onPlay: (ctx) => {
      if (donOnField(ctx.s, ctx.me) <= donOnField(ctx.s, ctx.opp)) addDonFromDeck(ctx.s, ctx.me, 1, false);
    },
  },

  // Ananas : [Bloqueur] avec un autre Personnage violet {Équipage de Big Mom}
  'OP11-065': {
    blocker: (s, p, card) => s.players[p].chars.some((c) => c.uid !== card.uid && !isNamed(c.num, 'Charlotte Anana')
      && hasType(c.num, BIG_MOM) && def(c.num).colors.includes('Purple')),
  },

  // Oven : [Activation : Principale] s'épuiser : déclarer un coût ; si c'est le bon, KO 1 Personnage adverse de coût de
  // base 3 ou moins ; puis 1 DON!! épuisée
  'OP11-066': {
    activateMain: {
      oncePerTurn: false,
      label: 'Oven : s’épuiser, déclarer un coût (KO d’un Personnage de coût de base 3 ou moins si c’est le bon) et gagner 1 DON!!',
      canActivate: (s, _p, card) => !card.rested && canBeRested(s, card.uid),
      run: (ctx, card) => {
        restByEffect(ctx, card.uid);
        if (declareAndReveal(ctx)) koOpp(ctx, baseCostAtMost(3), 'Charlotte Oven');
        addDonFromDeck(ctx.s, ctx.me, 1, false);
      },
    },
  },

  // Slurp : [Activation : Principale] [Une fois par tour] défausser 1 carte : déclarer un coût ; si c'est le bon,
  // piochez 1 carte et 1 DON!! redressée
  'OP11-071': {
    activateMain: {
      oncePerTurn: true,
      label: 'Slurp : défausser 1 carte et déclarer un coût (si c’est le bon : pioche 1 et 1 DON!! redressée)',
      canActivate: (s, p) => s.players[p].hand.length > 0,
      run: (ctx, card) => {
        card.usedOpt.push('main');
        if (!discardFromHand(ctx, ctx.me, 1, 'Slurp : défausse 1 carte de ta main')) return;
        if (declareAndReveal(ctx)) {
          drawLog(ctx, 1);
          addDonFromDeck(ctx.s, ctx.me, 1, true);
        }
      },
    },
  },

  // « Tes petits stratagèmes... » : [Contre] déclarer un coût ; si c'est le bon, +5000 ; [Déclenchement] piochez 1 carte
  'OP11-079': {
    onCounter: (ctx) => {
      if (declareAndReveal(ctx)) counterBoost(ctx, 5000, 'Tes petits stratagèmes...');
    },
    onTrigger: (ctx) => drawLog(ctx, 1),
  },

  // Sabre impérial : [Principale] déclarer un coût ; si c'est le bon, KO 1 Personnage adverse de coût de base 8 ou
  // moins ; [Déclenchement] 1 DON!! redressée
  'OP11-081': {
    mainUseful: (s, p) => s.players[p === 0 ? 1 : 0].chars.some((c) => baseCost(c.num) <= 8),
    onMain: (ctx) => {
      if (declareAndReveal(ctx)) koOpp(ctx, baseCostAtMost(8), 'Sabre impérial, lame destructrice');
    },
    onTrigger: (ctx) => { addDonFromDeck(ctx.s, ctx.me, 1, true); },
  },

  // Smoothie : [Tour adverse] [En cas de KO] DON!! −1 : jouez 1 Personnage {Équipage de Big Mom} autre que Smoothie de
  // coût inférieur ou égal au nombre de DON!! adverses
  'P-090': {
    onKOCondition: (s, owner) => s.active !== owner,
    onKO: (ctx) => {
      const { s } = ctx;
      const limit = donOnField(s, ctx.opp);
      const eligible = (num: string) => def(num).category === 'CHARACTER' && hasType(num, BIG_MOM) && !isNamed(num, 'Charlotte Smoothie') && baseCost(num) <= limit;
      if (donOnField(s, ctx.me) < 1 || !s.players[ctx.me].hand.some((c) => eligible(c.num))) return;
      if (!may(ctx, `Charlotte Smoothie : DON!! −1 pour jouer un Personnage {Équipage de Big Mom} de coût ${limit} ou moins ?`, 'maySmoothie')) return;
      returnDon(s, ctx.me, 1);
      playCharFromHand(ctx, (c) => eligible(c.num), `Smoothie : jouer jusqu’à 1 Personnage {Équipage de Big Mom} de coût ${limit} ou moins :`);
    },
  },
};
