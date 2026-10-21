// OP03 VIOLETTE (tâche 1.11 du plan « Aventure ») : les cartes violettes d'OP03 (Pillars of Strength), codées d'après
// leur texte officiel anglais (OP03 n'a pas de version française complète). Elles jouent autour du Leader Iceburg et de
// la {Galley-La Company} de Water Seven : DON!! −1 pour un effet, DON!! ajoutées depuis le deck DON!!. Chaque condition
// se vérifie dans la partie. Les choix d'interprétation sont dans game/docs/interpretations.md (320 à 349).
import type { CardBehavior } from '../types.ts';
import {
  addDon, all, bothCosts, bottomOfDeck, card, defenderPower, discard, discardCost, donMinus, donOnFieldAtLeast, drawCards, ko,
  leaderNamed, leaderType, oppChar, playFromHand, rest, restDon, restSelf, searchTop, selfDon, selfKeyword, seq, when, withCost, type Cost,
} from './bricks.ts';

const W7 = 'Water Seven';
const GALLEY = 'Galley-La Company';
const IMPEL = 'Impel Down';

// Iceburg : le Personnage joué de la main
const playGalley = playFromHand({ type: GALLEY, costMax: 5 }, 'Iceburg');
// Galley-La Company : la DON!! ajoutée
const galleyDon = when(leaderNamed('Iceburg'), addDon(1, 'rested'));
// Monkey D. Luffy : « défausser 1 carte Personnage de coût 5 » (coût imprimé : la carte est en main)
const discardCost5: Cost = { ...discardCost(1, { category: 'CHARACTER', costMin: 5, costMax: 5 }), label: 'défausser 1 carte Personnage de coût 5 de ta main' };

export const OP03_VIOLETTE: Record<string, CardBehavior> = {
  // Iceburg (Leader) : ne peut pas attaquer ; [Activation : Principale] DON!! −1 et s'épuiser : jouer de sa main un
  // Personnage {Galley-La Company} de coût 5 ou moins. Proposé seulement s'il y en a un à jouer (choix 320 : sinon l'IA
  // simple, qui active ces effets dès qu'elle le peut, perdrait une DON!! à chaque tour)
  'OP03-058': card({
    activateMain: {
      label: 'Iceburg : DON!! −1 et t’épuiser pour jouer de ta main un Personnage {Galley-La Company} de coût 5 ou moins',
      condition: playGalley.useful,
      cost: bothCosts(donMinus(1), restSelf()),
      effect: playGalley,
    },
  }, { cantAttack: () => true }),

  // Kaku : [En attaquant] DON!! −1 : [Exil] pour ce combat (ne sert qu'à une attaque qui inflige des dégâts)
  'OP03-059': card({ whenAttacking: withCost(donMinus(1), selfKeyword('Banish', 'Kaku', 'battle'), 'Kaku') }, { attackUseful: () => false }),

  // Kalifa : [En attaquant] DON!! −1 : piocher 2 cartes, puis en défausser 1
  'OP03-060': card({ whenAttacking: withCost(donMinus(1), seq(drawCards(2), discard(1)), 'Kalifa') }),

  // Kokoro : [Jouée] 5 cartes du dessus, une carte {Water Seven} autre que [Kokoro] en main
  'OP03-062': card({ onPlay: searchTop(5, 1, { type: W7, notName: 'Kokoro' }, 'une carte {Water Seven} autre que [Kokoro]') }),

  // Zambai : [Bloqueur] (générique) ; [Jouée] DON!! −1 : avec un Leader {Water Seven}, piocher 1 carte (choix 211)
  'OP03-063': card({ onPlay: withCost(donMinus(1), when(leaderType(W7), drawCards(1)), 'Zambai') }),

  // Tilestone : [En cas de KO] avec un Leader {Galley-La Company}, 1 DON!! épuisée
  'OP03-064': card({ onKO: when(leaderType(GALLEY), addDon(1, 'rested')) }),

  // Paulie : [Jouée] ➁ : 1 DON!! redressée, puis avec 8 DON!! ou plus sur son terrain, KO d'un Personnage adverse de coût 4
  // ou moins
  'OP03-066': card({
    onPlay: withCost(restDon(2), seq(addDon(1, 'active'), when(donOnFieldAtLeast(8), ko(oppChar({ costMax: 4 }), 'Paulie'))), 'Paulie'),
  }),

  // Peepley Lulu : [DON!! x1] [En attaquant] avec un Leader {Galley-La Company}, 1 DON!! épuisée
  'OP03-067': card({ whenAttacking: when(all(selfDon(1), leaderType(GALLEY)), addDon(1, 'rested')) }),

  // Minozebra : [Exil] (générique) ; [En cas de KO] avec un Leader {Impel Down}, 1 DON!! épuisée
  'OP03-068': card({ onKO: when(leaderType(IMPEL), addDon(1, 'rested')) }),

  // Minorhinoceros : [En cas de KO] avec un Leader {Impel Down}, piocher 2 cartes, puis en défausser 1
  'OP03-069': card({ onKO: when(leaderType(IMPEL), seq(drawCards(2), discard(1))) }),

  // Monkey D. Luffy : [Jouée] DON!! −1 et défausser un Personnage de coût 5 : [Initiative] pour le tour
  'OP03-070': card({
    onPlay: withCost(bothCosts(donMinus(1), discardCost5), selfKeyword('Rush', 'Monkey D. Luffy'), 'Monkey D. Luffy'),
  }),

  // Rob Lucci : [En attaquant] DON!! −1 : épuiser un Personnage adverse de coût 5 ou moins
  'OP03-071': card({ whenAttacking: withCost(donMinus(1), rest(oppChar({ costMax: 5 }), 'Rob Lucci'), 'Rob Lucci') }),

  // Gum Gum Jet Rafale : [Contre] défausser 1 carte : +3000 à la carte attaquée pour le combat ; [Déclenchement] 1 DON!!
  // redressée. La carte jouée n'est plus en main : il faut une autre carte à défausser
  'OP03-072': card({
    onCounter: withCost(discardCost(1), defenderPower(3000, 'Gum Gum Jet Rafale'), 'Gum Gum Jet Rafale'),
    onTrigger: addDon(1, 'active'),
  }, {
    counterUseful: (s, p) => s.players[p].hand.length >= 2,
    counterPower: (s, p) => (s.players[p].hand.length >= 2 ? 3000 : 0),
  }),

  // Hull Dismantler Slash : [Principale] DON!! −1 : avec un Leader {Water Seven}, KO d'un Personnage adverse de coût 2 ou
  // moins ; [Déclenchement] activer l'effet [Principale] (générique)
  'OP03-073': card({ onMain: withCost(donMinus(1), when(leaderType(W7), ko(oppChar({ costMax: 2 }), 'Hull Dismantler Slash')), 'Hull Dismantler Slash') }),

  // Top Knot : [Principale] DON!! −2 : un Personnage adverse de coût 4 ou moins au-dessous du deck de son propriétaire ;
  // [Déclenchement] activer l'effet [Principale] (générique)
  'OP03-074': card({ onMain: withCost(donMinus(2), bottomOfDeck(oppChar({ costMax: 4 }), 'Top Knot'), 'Top Knot') }),

  // Galley-La Company (Lieu) : [Activation : Principale] s'épuiser : avec le Leader [Iceburg], 1 DON!! épuisée. Proposé
  // seulement si c'est le cas et que le deck DON!! n'est pas vide (choix 320)
  'OP03-075': card({
    activateMain: {
      label: 'Galley-La Company : t’épuiser pour ajouter 1 DON!! épuisée (Leader Iceburg)',
      condition: galleyDon.useful,
      cost: restSelf(),
      effect: galleyDon,
    },
  }),
};
