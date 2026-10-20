// OP03 JAUNE (tâche 1.13 du plan « Aventure ») : les cartes jaunes d'OP03 « Pillars of Strength », autour du Leader
// Charlotte Katakuri et de l'« Équipage de Big Mom ». Elles jouent avec la Vie : la regarder et la réordonner, la placer
// dans la Défausse ou la prendre en main pour payer un coût, la remplir depuis le deck, et avec les cartes à
// [Déclenchement]. OP03 n'a pas de version française complète : le texte de référence est l'anglais officiel (effectEn),
// relu avec le texte français quand il existe. Chaque condition se vérifie dans la partie. Camie, Bobbin, Opéra, Galette
// et Praline n'ont que des mots-clés (jouables d'office). Les choix d'interprétation sont dans
// game/docs/interpretations.md (section « OP03 jaune »).
import { canTakeLife, def, lookTopPick, power } from '../rules.ts';
import type { CardBehavior, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  all, anyChar, card, defenderPower, discard, discardCost, drawCards, effect, keywordWhile, ko, leaderType, lessLifeThanOpp,
  lifeFromDeck, lifeToHandCost, lookLifeArrange, oppChar, oppLifeAtLeast, ownLeaderOrChar, playFromHand, playThis, powerMod,
  restSelf, searchTop, selfDon, selfPowerMod, seq, toOwnersLife, trashLifeCost, trashOppLife, when, withCost, type Effect,
} from './bricks.ts';

const BMP = 'Big Mom Pirates';  // {Équipage de Big Mom}

// [DON!! x1] « si votre Vie comporte moins de cartes que celle de votre adversaire » (Charlotte Cracker) : lu en
// permanence, pendant le tour adverse aussi (les DON!! données restent jusqu'à sa phase de Recharge)
const crackerOn = all(selfDon(1), lessLifeThanOpp);

// [En attaquant] « ce Personnage gagne +X pendant ce combat » contre un coût : une attaque trop faible ne sert que si le
// bonus suffit à la faire passer (aide à l'IA, prune.ts)
const boostWins = (bonus: number, can: (s: GameState, p: PlayerId, self: FieldCard) => boolean) =>
  (s: GameState, p: PlayerId, self: FieldCard, target: number) => can(s, p, self) && power(s, self.uid) + bonus >= power(s, target);

// Charlotte Pudding : « une carte [Sanji] ou de type {Équipage de Big Mom} autre que [Charlotte Pudding] » (CharSpec ne
// sait pas dire « ou »)
const puddingPick = (num: string) => {
  const d = def(num);
  return !d.names.includes('Charlotte Pudding') && (d.names.includes('Sanji') || d.types.includes(BMP));
};
const puddingLook: Effect = effect((ctx) => {
  lookTopPick(ctx, 4, 1, puddingPick, 'une carte [Sanji] ou {Équipage de Big Mom} autre que [Charlotte Pudding]');
}, (s, p) => s.players[p].deck.length > 0);

// [Déclenchement] « Vous pouvez défausser 1 carte de votre main : jouez cette carte » (Cracker, Smoothie, Slurp)
const discardToPlay = (source: string) => withCost(discardCost(1), playThis(), source);

export const OP03_JAUNE: Record<string, CardBehavior> = {
  // Leader Charlotte Katakuri : [DON!! x1] [En attaquant] regarder la carte du dessus de sa Vie ou de la Vie adverse, la
  // laisser ou la placer dessous ; puis +1000 pour le combat
  'OP03-099': card({
    whenAttacking: when(selfDon(1), seq(lookLifeArrange('Charlotte Katakuri'), selfPowerMod(1000, 'battle', 'Charlotte Katakuri'))),
  }),

  // Kingbaum : [Déclenchement] placer dans sa Défausse la carte du dessus ou du dessous de sa Vie : se jouer
  'OP03-100': card({ onTrigger: withCost(trashLifeCost('both'), playThis(), 'Kingbaum') }),

  // Sanji : [DON!! x2] [En attaquant] prendre en main la carte du dessus ou du dessous de sa Vie : la carte du dessus de
  // son deck au-dessus de sa Vie
  'OP03-102': card({ whenAttacking: when(selfDon(2), withCost(lifeToHandCost('both'), lifeFromDeck(), 'Sanji')) }),

  // Shirley : [Bloqueur] ; [Jouée] regarder la carte du dessus de sa Vie ou de la Vie adverse, la laisser ou la placer
  // dessous
  'OP03-104': card({ onPlay: lookLifeArrange('Shirley') }),

  // Charlotte Oven : [DON!! x1] [En attaquant] défausser 1 carte à [Déclenchement] : +3000 pour le combat
  'OP03-105': card({
    whenAttacking: when(selfDon(1), withCost(discardCost(1, { trigger: true }), selfPowerMod(3000, 'battle', 'Charlotte Oven'), 'Charlotte Oven')),
  }, {
    attackUseful: boostWins(3000, (s, p, self) => self.don >= 1 && s.players[p].hand.some((c) => Boolean(def(c.num).triggerEn))),
  }),

  // Charlotte Cracker : [DON!! x1] avec moins de Vie que l'adversaire, [Double attaque] et +1000 ; [Déclenchement]
  // défausser 1 carte : se jouer
  'OP03-108': card({ onTrigger: discardToPlay('Charlotte Cracker') }, {
    selfPower: (s, owner, c) => (crackerOn(s, owner, c.uid) ? 1000 : 0),
    keywordAura: keywordWhile('Double Attack', crackerOn),
  }),

  // Charlotte Chiffon : [Jouée] placer dans sa Défausse la carte du dessus ou du dessous de sa Vie : la carte du dessus de
  // son deck au-dessus de sa Vie
  'OP03-109': card({ onPlay: withCost(trashLifeCost('both'), lifeFromDeck(), 'Charlotte Chiffon') }),

  // Charlotte Smoothie : [En attaquant] prendre en main la carte du dessus ou du dessous de sa Vie : +2000 pour le
  // combat ; [Déclenchement] défausser 1 carte : se jouer
  'OP03-110': card({
    whenAttacking: withCost(lifeToHandCost('both'), selfPowerMod(2000, 'battle', 'Charlotte Smoothie'), 'Charlotte Smoothie'),
    onTrigger: discardToPlay('Charlotte Smoothie'),
  }, {
    attackUseful: boostWins(2000, (s, p) => s.players[p].life.length > 0 && canTakeLife(s, p)),
  }),

  // Charlotte Pudding : [Jouée] 4 cartes du dessus, une [Sanji] ou {Équipage de Big Mom} autre que [Charlotte Pudding]
  'OP03-112': card({ onPlay: puddingLook }),

  // Charlotte Slurp (Perospero en VO) : [En cas de KO] 3 cartes du dessus, une {Équipage de Big Mom} ; [Déclenchement]
  // défausser 1 carte : se jouer
  'OP03-113': card({
    onKO: searchTop(3, 1, { type: BMP }, 'une carte {Équipage de Big Mom}'),
    onTrigger: discardToPlay('Charlotte Slurp'),
  }),

  // Charlotte Linlin : [Jouée] avec un Leader {Équipage de Big Mom}, la carte du dessus de son deck au-dessus de sa Vie,
  // puis la carte du dessus de la Vie adverse dans la Défausse adverse
  'OP03-114': card({ onPlay: when(leaderType(BMP), seq(lifeFromDeck(), trashOppLife())) }),

  // Streusen : [Jouée] défausser 1 carte à [Déclenchement] : KO d'un Personnage adverse de coût 1 ou moins
  'OP03-115': card({ onPlay: withCost(discardCost(1, { trigger: true }), ko(oppChar({ costMax: 1 }), 'Streusen'), 'Streusen') }),

  // Shirahoshi : [Jouée] piocher 3 cartes et en défausser 2 ; [Déclenchement] se jouer (générique)
  'OP03-116': card({ onPlay: seq(drawCards(3), discard(2)) }),

  // Napoleon : [Activation : Principale] s'épuiser : +1000 à son [Charlotte Linlin] (Leader ou Personnage) jusqu'au début
  // de son prochain tour ; [Déclenchement] se jouer (générique)
  'OP03-117': card({
    activateMain: {
      label: 'Napoleon : s’épuiser pour donner +1000 de puissance à ton [Charlotte Linlin] jusqu’à ton prochain tour',
      cost: restSelf(),
      effect: powerMod(ownLeaderOrChar({ name: 'Charlotte Linlin' }), 1000, 'oppNextEnd', 'Napoleon'),
    },
  }),

  // Térébration : [Contre] +5000 pour le combat ; [Déclenchement] défausser 2 cartes : la carte du dessus de son deck
  // au-dessus de sa Vie
  'OP03-118': card({
    onCounter: defenderPower(5000, 'Térébration'),
    onTrigger: withCost(discardCost(2), lifeFromDeck(), 'Térébration'),
  }),

  // Buzz Cut Mochi : [Principale] avec moins de Vie que l'adversaire, KO d'un Personnage adverse de coût 4 ou moins ;
  // [Déclenchement] jouer de sa main un Personnage de coût 4 ou moins ayant [Déclenchement]
  'OP03-119': card({
    onMain: when(lessLifeThanOpp, ko(oppChar({ costMax: 4 }), 'Buzz Cut Mochi')),
    onTrigger: playFromHand({ costMax: 4, trigger: true }, 'Buzz Cut Mochi'),
  }),

  // Tropical Torment : [Principale] si l'adversaire a 4 Vies ou plus, la carte du dessus de sa Vie dans sa Défausse ;
  // [Déclenchement] activer l'effet [Principale] (générique)
  'OP03-120': card({ onMain: when(oppLifeAtLeast(4), trashOppLife()) }),

  // Colonne foudroyante : [Principale] placer dans sa Défausse la carte du dessus de sa Vie : KO d'un Personnage adverse
  // de coût 5 ou moins ; [Déclenchement] KO d'un Personnage adverse de coût 5 ou moins
  'OP03-121': card({
    onMain: withCost(trashLifeCost('top'), ko(oppChar({ costMax: 5 }), 'Colonne foudroyante'), 'Colonne foudroyante'),
    onTrigger: ko(oppChar({ costMax: 5 }), 'Colonne foudroyante'),
  }),

  // Charlotte Katakuri : [Jouée] un Personnage de coût 8 ou moins (les siens compris) face visible au-dessus ou au-dessous
  // de la Vie de son propriétaire
  'OP03-123': card({ onPlay: toOwnersLife(anyChar({ costMax: 8 }), 'Charlotte Katakuri') }),
};
