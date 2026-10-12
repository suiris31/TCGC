// ENER (ENEL) DU MÉTA (octobre 2026, violet) : cartes codées pour ce deck, d'après leur texte officiel. Le Leader n'a
// que 6 cartes DON!! et les remet en jeu chaque tour ; presque tout le deck paie en DON!! −1 ou −2, et beaucoup d'effets
// demandent « 6 cartes DON!! ou moins sur votre terrain ». Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import { attachedDon, def, discardFromHand, donOnField, findField, lookTopPick, other } from '../rules.ts';
import type { CardBehavior, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  addDon, card, costMod, discardCost, donMinus, drawCards, effect, giveDon, keepRested, ko, leaderNamed, lookTopArrange,
  oppChar, oppHandAtLeast, ownChar, ownLeaderOrChar, powerMod, readyDon, rest, restDon, seq, trashFromOppHand, trashToHand,
  when, withCost, type Condition, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const ENEL = 'Enel';  // [Ener]
const OHM = 'Ohm';    // [Om]

// « Si vous avez 6 cartes DON!! ou moins sur votre terrain »
const sixOrLess: Condition = (s, p) => donOnField(s, p) <= 6;

// [Contre] « Jusqu'à 1 de vos [Ener] gagne +2000 » : la carte attaquée, si c'est un [Ener] (Leader ou Personnage)
const enelCounter = (source: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, Number(ctx.pending.data?.target));
  if (f && f.player === ctx.me && def(f.card.num).names.includes(ENEL)) counterBoost(ctx, 2000, source);
});
const enelTarget = (s: GameState, _p: PlayerId, target: number) => Boolean(findField(s, target) && def(findField(s, target)!.card.num).names.includes(ENEL));

// Holy : pendant le tour adverse, la puissance de base de tous ses [Om] et d'elle-même passe à 6000 (plusieurs Holy ne
// s'additionnent pas pour les [Om] : seule la première compte)
function hollyAura(s: GameState, owner: PlayerId, source: FieldCard, target: FieldCard): number {
  if (s.active === owner) return 0;
  const isSelf = target.uid === source.uid;
  const firstHolly = s.players[owner].chars.find((c) => c.num === 'OP15-071')?.uid === source.uid;
  if (!isSelf && !(firstHolly && def(target.num).names.includes(OHM))) return 0;
  return 6000 - (def(target.num).power ?? 0);
}

// « DON!! −1 : Piochez 1 carte » ([Jouée] d'Om, Satori, Shura)
const drawForDon = (source: string) => withCost(donMinus(1), drawCards(1), source);

export const META_ENEL: Record<string, CardBehavior> = {
  // Leader Ener : deck DON!! de 6 cartes ; [Activation : Principale] [Une fois par tour] à partir de son deuxième tour,
  // 1 DON!! redressée et jusqu'à 4 épuisées du deck DON!!, puis jusqu'à 4 DON!! épuisées à un de ses Personnages
  'OP15-058': card({
    activateMain: {
      label: 'Ener (Leader) : ajouter 1 DON!! redressée et 4 épuisées, puis donner 4 DON!! épuisées à un Personnage',
      once: true,
      condition: (s, p) => s.players[p].turns >= 2,
      effect: seq(addDon(1, 'active'), addDon(4, 'rested'), giveDon(ownChar(), 4, 'Ener')),
    },
  }, { rules: { donDeck: 6 } }),

  // Ener (Personnage) : avec 6 DON!! ou moins, ne peut pas quitter le terrain à cause d'un effet adverse et +2000 ;
  // [Jouée] DON!! −1 : 5 cartes du dessus, 1 en main, le reste sous le deck, puis défausser 1 carte
  'OP15-118': card({
    onPlay: withCost(donMinus(1), effect((ctx) => {
      lookTopPick(ctx, 5, 1, () => true, 'une carte');
      discardFromHand(ctx, ctx.me, 1, 'Ener : carte à défausser');
    }), 'Ener'),
  }, {
    selfPower: (s, p) => (sixOrLess(s, p, -1) ? 2000 : 0),
    cantLeave: (s, p) => sixOrLess(s, p, -1),
  }),

  // Gamma Knife : [Principale] DON!! −1 : −5000 à un Personnage adverse ; [Déclenchement] 1 DON!! redressée
  'OP05-077': card({
    onMain: withCost(donMinus(1), powerMod(oppChar(), -5000, 'turn', 'Gamma Knife'), 'Gamma Knife'),
    onTrigger: addDon(1, 'active'),
  }),

  // Sanji (OP07-064) : [Bloqueur] ; coût −3 en main avec au moins 2 DON!! de moins que l'adversaire sur le terrain
  'OP07-064': card({}, { handCost: (s, p) => (donOnField(s, p) <= donOnField(s, other(p)) - 2 ? -3 : 0) }),

  // Gum Gum Foudre : [Principale] DON!! −2 : KO 1 Personnage adverse de 6000 ou moins ; [Déclenchement] 1 DON!! redressée
  'OP09-077': card({
    onMain: withCost(donMinus(2), ko(oppChar({ powerMax: 6000 }), 'Gum Gum Foudre'), 'Gum Gum Foudre'),
    onTrigger: addDon(1, 'active'),
  }),

  // Señor Pink : [Jouée] DON!! −1 : un Événement violet de coût 5 ou moins de la Défausse en main, puis 1 DON!! redressée
  'OP10-067': card({
    onPlay: withCost(donMinus(1), seq(trashToHand({ category: 'EVENT', color: 'Purple', costMax: 5 }, 'Señor Pink'), readyDon(1)), 'Señor Pink'),
  }),

  // Charlotte Pudding (OP12-071) : [Jouée] 4 cartes du dessus, 1 [Sanji] ou 1 Événement
  'OP12-071': card({
    onPlay: effect((ctx) => {
      lookTopPick(ctx, 4, 1, (n) => def(n).names.includes('Sanji') || def(n).category === 'EVENT', 'une carte [Sanji] ou un Événement');
    }, (s, p) => s.players[p].deck.length > 0),
  }),

  // Trépas divin : [Principale] épuiser 5 DON!! : avec des DON!! données, −8000 à un Personnage adverse ; [Contre]
  // défausser 1 carte : +3000 à la carte attaquée
  'OP13-076': card({
    onMain: withCost(restDon(5), when((s, p) => attachedDon(s, p) > 0, powerMod(oppChar(), -8000, 'turn', 'Trépas divin')), 'Trépas divin'),
    onCounter: withCost(discardCost(1), effect((ctx) => counterBoost(ctx, 3000, 'Trépas divin')), 'Trépas divin'),
  }),

  // Om : [Jouée] DON!! −1 : piocher 1 ; [En attaquant] avec 6 DON!! ou moins, −1000 à un Personnage adverse
  'OP15-061': card({ onPlay: drawForDon('Om'), whenAttacking: when(sixOrLess, powerMod(oppChar(), -1000, 'turn', 'Om')) }),

  // Satori : [Jouée] DON!! −1 : piocher 1 ; [En attaquant] avec 6 DON!! ou moins, regarder 2 cartes et les placer
  'OP15-066': card({ onPlay: drawForDon('Satori'), whenAttacking: when(sixOrLess, lookTopArrange(2, 'Satori')) }),

  // Shura : [Initiative] avec 6 DON!! ou moins ; [Jouée] DON!! −1 : piocher 1
  'OP15-067': card({ onPlay: drawForDon('Shura') }, { rush: (s, p) => sixOrLess(s, p, -1) }),

  // Holy : [Double attaque] pour tous ses [Om] et elle-même ; [Tour adverse] puissance de base 6000 pour eux
  'OP15-071': card({}, {
    keywordAura: (_s, _p, source, target, k) => k === 'Double Attack' && (target.uid === source.uid || def(target.num).names.includes(OHM)),
    aura: hollyAura,
  }),

  // Vally : [Principale] DON!! −1 : avec le Leader [Ener], piocher 1 ; puis +2 de coût à un de ses Personnages jusqu'à la
  // fin du prochain tour adverse ; [Contre] +2000 à un [Ener]
  'OP15-074': card({
    onMain: withCost(donMinus(1), seq(when(leaderNamed(ENEL), drawCards(1)), costMod(ownChar(), 2, 'oppNextEnd', 'Vally')), 'Vally'),
    onCounter: enelCounter('Vally'),
  }, { counterUseful: enelTarget }),

  // El Thor : [Principale] DON!! −1 : avec le Leader [Ener], +1000 à son Leader ou un Personnage pour le tour ; puis KO
  // 1 Personnage adverse de 3000 ou moins ; [Contre] +2000 à un [Ener]
  'OP15-075': card({
    onMain: withCost(donMinus(1), seq(when(leaderNamed(ENEL), powerMod(ownLeaderOrChar(), 1000, 'turn', 'El Thor')), ko(oppChar({ powerMax: 3000 }), 'El Thor')),
      'El Thor'),
    onCounter: enelCounter('El Thor'),
  }, { counterUseful: enelTarget }),

  // Kiten : [Principale] DON!! −1 : avec le Leader [Ener], piocher 1 ; puis −1000 à un Personnage adverse ; [Contre]
  // +2000 à un [Ener]
  'OP15-076': card({
    onMain: withCost(donMinus(1), seq(when(leaderNamed(ENEL), drawCards(1)), powerMod(oppChar(), -1000, 'turn', 'Kiten')), 'Kiten'),
    onCounter: enelCounter('Kiten'),
  }, { counterUseful: enelTarget }),

  // Djambuwal : [Principale] DON!! −1 : piocher 1, puis un Personnage adverse épuisé de 6000 ou moins ne se redressera
  // pas à la prochaine phase de Recharge adverse
  'OP15-077': card({
    onMain: withCost(donMinus(1), seq(drawCards(1), keepRested(oppChar({ rested: true, powerMax: 6000 }), 'Djambuwal', 1)), 'Djambuwal'),
  }),

  // Mamaragan : [Principale] DON!! −2 : piocher 1, puis épuiser un Personnage adverse de 5000 ou moins ; [Contre] +1000 à
  // la carte attaquée, puis piocher 1 avec 6 DON!! ou moins
  'OP15-078': card({
    onMain: withCost(donMinus(2), seq(drawCards(1), rest(oppChar({ powerMax: 5000 }), 'Mamaragan')), 'Mamaragan'),
    onCounter: effect((ctx) => {
      counterBoost(ctx, 1000, 'Mamaragan');
      if (sixOrLess(ctx.s, ctx.me, -1)) drawCards(1).run(ctx);
    }),
  }),

  // Trafalgar Law (ST10-010) : [Bloqueur] ; [Jouée] DON!! −1 : si l'adversaire a 7 cartes ou plus en main, en défausser 2
  // au hasard
  'ST10-010': card({ onPlay: withCost(donMinus(1), when(oppHandAtLeast(7), trashFromOppHand(2, 'Trafalgar Law')), 'Trafalgar Law') }),
};
