// DECK POUR DÉBUTANT -ROUGE Monkey D. Luffy- [ST-31] : effets codés d'après le texte officiel français
import {
  addMod, allField, attachedDon, canBeRested, def, discardFromHand, hasType, log, lookTopPick, may, payDon, playFromHandFree,
  restByEffect,
} from '../rules.ts';
import type { CardBehavior, EffectCtx } from '../types.ts';
import { counterBoost, drawLog, isNamed, oppPowerDown, playCharFromHand, restedDonTo } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const LUFFY = 'Monkey.D.Luffy';

const luffies = (ctx: EffectCtx) => [ctx.s.players[ctx.me].leader, ...ctx.s.players[ctx.me].chars].filter((c) => isNamed(c.num, LUFFY));

export const ST31: Record<string, CardBehavior> = {
  // Leader Luffy : [DON!! x1] [Activation : Principale] [Une fois par tour] 2 DON!! épuisées à 1 Personnage
  'ST21-001': {
    activateMain: {
      oncePerTurn: true,
      label: 'Luffy (Leader) : donner jusqu’à 2 DON!! épuisées à 1 de tes Personnages',
      canActivate: (s, p, card) => card.don >= 1 && s.players[p].donRested > 0 && s.players[p].chars.length > 0,
      run: (ctx, card) => {
        card.usedOpt.push('main');
        restedDonTo(ctx, ctx.s.players[ctx.me].chars, 2, 'Personnage qui reçoit jusqu’à 2 DON!! épuisées :');
      },
    },
  },

  // Nami : [Jouée] 5 cartes du dessus, 1 {Équipage de Chapeau de paille} autre que Nami en main
  'OP01-016': {
    onPlay: (ctx) => { lookTopPick(ctx, 5, 1, (n) => hasType(n, SH) && !isNamed(n, 'Nami'), 'une carte {Équipage de Chapeau de paille} autre que Nami'); },
  },

  // Menu « Bonnes manières » : [Contre] défausser 1 carte : +3000 ; [Déclenchement] −3000 à un Leader ou Personnage adverse
  'OP04-016': {
    counterUseful: (s, p) => s.players[p].hand.length >= 2,
    onCounter: (ctx) => {
      if (!ctx.s.players[ctx.me].hand.length || !may(ctx, 'Défausser 1 carte de ta main pour donner +3000 à la carte attaquée ?', 'mayDiscard')) return;
      if (discardFromHand(ctx, ctx.me, 1, 'Carte à défausser :')) counterBoost(ctx, 3000, 'Menu « Bonnes manières »');
    },
    onTrigger: (ctx) => { oppPowerDown(ctx, 3000, 'turn', 'Menu « Bonnes manières »', true); },
  },

  // Nico Robin : [DON!! x2] [En attaquant] −2000 à 1 Personnage adverse jusqu'à la fin du prochain tour adverse
  'OP11-009': {
    attackUseful: (s, p, card) => card.don >= 2 && s.players[p === 0 ? 1 : 0].chars.length > 0,
    whenAttacking: (ctx) => {
      const self = ctx.s.players[ctx.me].chars.find((c) => c.uid === ctx.source);
      if (!self || self.don < 2) return;
      oppPowerDown(ctx, 2000, ctx.s.turn + 1, 'Nico Robin');
    },
  },

  // Franky : [Votre tour] [Une fois par tour] quand l'adversaire active un Événement, tous vos Personnages +2000
  'OP11-012': {
    when: [{
      on: 'event',
      once: 'franky',
      if: (s, owner, self, e) => e.player !== owner && s.active === owner && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => {
        for (const c of ctx.s.players[ctx.me].chars) addMod(ctx.s, { uid: c.uid, stat: 'power', amount: 2000, until: 'turn', source: 'Franky' });
        log(ctx.s, ctx.me, 'Franky : tous ses Personnages gagnent +2000 de puissance pour le tour');
      },
    }],
  },

  // Gum Gum Rafale : [Principale] 1 DON!! épuisée à un Luffy, puis −2000 ; [Déclenchement] −2000
  'OP13-021': {
    onMain: (ctx) => {
      restedDonTo(ctx, luffies(ctx), 1, 'Luffy qui reçoit 1 DON!! épuisée :');
      oppPowerDown(ctx, 2000, 'turn', 'Gum Gum Rafale');
    },
    onTrigger: (ctx) => { oppPowerDown(ctx, 2000, 'turn', 'Gum Gum Rafale'); },
  },

  // Roronoa Zoro : [Initiative] ; [En attaquant] −1000 à 1 Personnage adverse
  'OP14-015': {
    rush: () => true,
    attackUseful: (s, p) => s.players[p === 0 ? 1 : 0].chars.length > 0,
    whenAttacking: (ctx) => { oppPowerDown(ctx, 1000, 'turn', 'Roronoa Zoro'); },
  },

  // Tony-Tony Chopper : [Bloqueur] ; [Jouée] 1 DON!! épuisée au Leader
  'P-101': {
    blocker: () => true,
    onPlay: (ctx) => restedDonTo(ctx, [ctx.s.players[ctx.me].leader]),
  },

  // Luffy (ST23-004) : [Activation : Principale] épuiser 1 DON!! et ce Personnage : −1000 à 1 Personnage adverse
  'ST23-004': {
    activateMain: {
      oncePerTurn: false,
      label: 'Luffy : épuiser 1 DON!! et ce Personnage pour donner −1000 à 1 Personnage adverse',
      canActivate: (s, p, card) => !card.rested && canBeRested(s, card.uid) && s.players[p].donActive > 0,
      run: (ctx, card) => {
        payDon(ctx.s, ctx.me, 1);
        restByEffect(ctx, card.uid);
        oppPowerDown(ctx, 1000, 'turn', 'Luffy');
      },
    },
  },

  // Sanji : [DON!! x2] [Initiative] ; [Jouée] pioche 1 et joue 1 {Équipage de Chapeau de paille} de coût 5 ou moins
  'ST31-001': {
    rush: (_s, _p, card) => card.don >= 2,
    onPlay: (ctx) => {
      drawLog(ctx, 1);
      playCharFromHand(ctx, (c) => hasType(c.num, SH) && (def(c.num).cost ?? 0) <= 5 && !isNamed(c.num, 'Sanji'),
        'Sanji : jouer jusqu’à 1 Personnage {Équipage de Chapeau de paille} de coût 5 ou moins de ta main :');
    },
  },

  // Jinbe : [Bloqueur] ; [Jouée] pioche 1 et joue 1 carte {Équipage de Chapeau de paille} de coût 1
  'ST31-002': {
    blocker: () => true,
    onPlay: (ctx) => {
      drawLog(ctx, 1);
      playFromHandFree(ctx, (c) => def(c.num).category !== 'EVENT' && hasType(c.num, SH) && def(c.num).cost === 1,
        'Jinbe : jouer jusqu’à 1 carte {Équipage de Chapeau de paille} de coût 1 de ta main :');
    },
  },

  // Brook : [Tour adverse] avec 3 DON!! données ou plus, [Bloqueur] et +3000
  'ST31-003': {
    blocker: (s, p) => s.active !== p && attachedDon(s, p) >= 3,
    selfPower: (s, p) => (s.active !== p && attachedDon(s, p) >= 3 ? 3000 : 0),
  },

  // Luffy (ST31-004) : [Initiative] avec 3 DON!! données ; [Jouée] −1000 par carte {Équipage de Chapeau de paille}
  'ST31-004': {
    rush: (s, p) => attachedDon(s, p) >= 3,
    onPlay: (ctx) => {
      const count = allField(ctx.s, ctx.me).filter((c) => hasType(c.num, SH)).length;
      if (count) oppPowerDown(ctx, 1000 * count, 'turn', 'Luffy');
    },
  },

  // Thousand Sunny (Lieu) : [Jouée] 5 cartes du dessus, 1 {Équipage de Chapeau de paille} ; [Activation : Principale]
  // épuiser ce Lieu : 1 DON!! épuisée à un Luffy
  'ST31-005': {
    onPlay: (ctx) => { lookTopPick(ctx, 5, 1, (n) => hasType(n, SH), 'une carte {Équipage de Chapeau de paille}'); },
    activateMain: {
      oncePerTurn: false,
      label: 'Thousand Sunny : épuiser ce Lieu pour donner 1 DON!! épuisée à un Luffy',
      canActivate: (s, p, card) => !card.rested && s.players[p].donRested > 0,
      run: (ctx, card) => {
        card.rested = true;
        log(ctx.s, ctx.me, 'épuise Thousand Sunny');
        restedDonTo(ctx, luffies(ctx), 1, 'Luffy qui reçoit 1 DON!! épuisée :');
      },
    },
  },
};
