// OP03 VERTE (tâche 1.9 du plan « Aventure ») : les cartes vertes de l'extension OP03, autour des Leaders Kuro
// (OP03-021) et Arlong (OP03-022, vert et jaune). Elles épuisent les Personnages adverses puis mettent KO ceux qui sont
// épuisés, et redressent leur Leader. Codées d'après le texte officiel anglais (OP03 n'existe pas en français) ;
// chaque condition se vérifie dans la partie. Choix d'interprétation : game/docs/interpretations.md (207, 208 et
// 260 à 269). Jouables d'office : Alvida OP03-023, Pearl OP03-031 ([Bloqueur]), Momoo OP03-035 ; [Déclenchement]
// « jouez cette carte » de Kuroobi, Chew et Nami : générique.
import { attackAbility } from '../rules.ts';
import type { CardBehavior } from '../types.ts';
import {
  bothCosts, card, charsAtLeast, chooseOne, discardCost, keywordWhile, ko, koImmuneInBattle, leaderType, not, oppChar,
  ownChar, ownLeaderOrChar, playFromHand, playThis, powerMod, readySelf, rest, restCost, restDon, restThis, searchTop,
  selfDon, seq, setActiveTargets, when, withCost, type Cost, type Effect,
} from './bricks.ts';

const EB = 'East Blue';
const ebLeader = leaderType(EB);

// « Jusqu'à 1 de vos Personnages gagne +X de puissance pendant ce tour » ([Principale] : son propre tour) : ne sert qu'à
// attaquer, donc seulement s'il a un Personnage qui peut encore attaquer
const attackBoost = (amount: number, source: string): Effect => {
  const e = powerMod(ownChar(), amount, 'turn', source);
  return { run: e.run, useful: (s, p) => s.players[p].chars.some((c) => attackAbility(s, p, c).can) };
};

// « Vous pouvez [coût] : [effet] », demandé seulement si l'effet peut faire quelque chose (interprétation 262) : payer
// ne servirait à rien, et l'IA, qui accepte d'office, paierait pour rien
const payFor = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// « Jouez jusqu'à 1 carte Personnage de coût 4 ou moins ayant un [Déclenchement] de votre main » (Arlong, Tooth Attack)
const playTriggerChar = (source: string) => playFromHand({ costMax: 4, trigger: true }, source);

export const OP03_VERTE: Record<string, CardBehavior> = {
  // Kuro (Leader) : [Activation : Principale] ③, épuiser 2 de ses Personnages {East Blue} : redresser ce Leader et
  // épuiser jusqu'à 1 Personnage adverse de coût 5 ou moins (pas une fois par tour)
  'OP03-021': card({
    activateMain: {
      label: 'Kuro : épuiser 3 DON!! et 2 Personnages {East Blue} pour se redresser et épuiser un Personnage adverse de coût 5 ou moins',
      cost: bothCosts(restDon(3), restCost(2, 'characters', { type: EB })),
      effect: seq(readySelf(), rest(oppChar({ costMax: 5 }), 'Kuro')),
    },
  }),
  // Arlong (Leader) : [DON!! x2] [En attaquant] ① : jouer de sa main jusqu'à 1 Personnage de coût 4 ou moins ayant un
  // [Déclenchement]
  'OP03-022': card({ whenAttacking: when(selfDon(2), payFor(restDon(1), playTriggerChar('Arlong'), 'Arlong')) }),
  // Gin : [Jouée] avec un Leader {East Blue}, épuiser jusqu'à 2 Personnages adverses de coût 4 ou moins
  'OP03-024': card({ onPlay: when(ebLeader, rest(oppChar({ costMax: 4 }), 'Gin', 2)) }),
  // Krieg : [Jouée] défausser 1 carte : mettre KO jusqu'à 2 Personnages adverses épuisés de coût 4 ou moins ;
  // [DON!! x1] [Double attaque]
  'OP03-025': card(
    { onPlay: payFor(discardCost(1), ko(oppChar({ rested: true, costMax: 4 }), 'Krieg', 2), 'Krieg') },
    { keywordAura: keywordWhile('Double Attack', selfDon(1)) },
  ),
  // Kuroobi : [Jouée] avec un Leader {East Blue}, épuiser jusqu'à 1 Personnage adverse
  'OP03-026': card({ onPlay: when(ebLeader, rest(oppChar(), 'Kuroobi')) }),
  // Sham : [Jouée] avec un Leader {East Blue}, épuiser jusqu'à 1 Personnage adverse de coût 2 ou moins et, sans [Buchi]
  // sur son terrain, jouer jusqu'à 1 [Buchi] de sa main (interprétation 207)
  'OP03-027': card({
    onPlay: when(ebLeader, seq(
      rest(oppChar({ costMax: 2 }), 'Sham'),
      when(not(charsAtLeast(1, { name: 'Buchi' })), playFromHand({ name: 'Buchi' }, 'Sham')),
    )),
  }),
  // Jango : [Jouée] au choix, redresser jusqu'à 1 Leader ou Personnage {East Blue} de coût 6 ou moins (interprétation
  // 208), ou épuiser ce Personnage et jusqu'à 1 Personnage adverse
  'OP03-028': card({
    onPlay: chooseOne('Jango', [
      { label: 'Redresser jusqu’à 1 de tes Leader ou Personnages {East Blue} de coût 6 ou moins', effect: setActiveTargets(ownLeaderOrChar({ type: EB, costMax: 6 }), 'Jango') },
      { label: 'Épuiser Jango et jusqu’à 1 Personnage adverse', effect: seq(restThis(), rest(oppChar(), 'Jango')) },
    ]),
  }),
  // Chew : [Jouée] mettre KO jusqu'à 1 Personnage adverse épuisé de coût 4 ou moins
  'OP03-029': card({ onPlay: ko(oppChar({ rested: true, costMax: 4 }), 'Chew') }),
  // Nami : [Jouée] regarder 5 cartes, en ajouter jusqu'à 1 verte {East Blue} autre que [Nami] à sa main
  'OP03-030': card({ onPlay: searchTop(5, 1, { color: 'Green', type: EB, notName: 'Nami' }, 'une carte verte {East Blue} autre que [Nami]') }),
  // Buggy : ne peut pas être mis KO en combat par des cartes <Tranche>
  'OP03-032': { cantBeKO: koImmuneInBattle({ attribute: 'Slash' }) },
  // Hatchan : [Déclenchement] avec un Leader {East Blue}, jouer cette carte
  'OP03-033': card({ onTrigger: when(ebLeader, playThis()) }),
  // Buchi : [Jouée] mettre KO jusqu'à 1 Personnage adverse épuisé de coût 2 ou moins
  'OP03-034': card({ onPlay: ko(oppChar({ rested: true, costMax: 2 }), 'Buchi') }),
  // Out-of-the-Bag : [Principale] épuiser 1 de ses Personnages {East Blue} : redresser jusqu'à 1 de ses cartes [Kuro] ;
  // [Déclenchement] mettre KO jusqu'à 1 Personnage adverse épuisé de coût 3 ou moins
  'OP03-036': card({
    onMain: payFor(restCost(1, 'characters', { type: EB }), setActiveTargets(ownLeaderOrChar({ name: 'Kuro' }), 'Out-of-the-Bag'), 'Out-of-the-Bag'),
    onTrigger: ko(oppChar({ rested: true, costMax: 3 }), 'Out-of-the-Bag'),
  }),
  // Tooth Attack : [Principale] épuiser 1 de ses Personnages {East Blue} : mettre KO jusqu'à 1 Personnage adverse épuisé
  // de coût 3 ou moins ; [Déclenchement] jouer de sa main jusqu'à 1 Personnage de coût 4 ou moins ayant un [Déclenchement]
  'OP03-037': card({
    onMain: payFor(restCost(1, 'characters', { type: EB }), ko(oppChar({ rested: true, costMax: 3 }), 'Tooth Attack'), 'Tooth Attack'),
    onTrigger: playTriggerChar('Tooth Attack'),
  }),
  // Deathly Poison Gas Bomb MH5 : [Principale] épuiser jusqu'à 2 Personnages adverses de coût 2 ou moins ;
  // [Déclenchement] épuiser jusqu'à 1 Personnage adverse de coût 5 ou moins
  'OP03-038': card({
    onMain: rest(oppChar({ costMax: 2 }), 'Deathly Poison Gas Bomb MH5', 2),
    onTrigger: rest(oppChar({ costMax: 5 }), 'Deathly Poison Gas Bomb MH5'),
  }),
  // One, Two, Jango : [Principale] épuiser jusqu'à 1 Personnage adverse de coût 1 ou moins, puis jusqu'à 1 de ses
  // Personnages gagne +1000 pour le tour ; [Déclenchement] épuiser jusqu'à 1 Personnage adverse de coût 4 ou moins
  'OP03-039': card({
    onMain: seq(rest(oppChar({ costMax: 1 }), 'One, Two, Jango'), attackBoost(1000, 'One, Two, Jango')),
    onTrigger: rest(oppChar({ costMax: 4 }), 'One, Two, Jango'),
  }),
};
