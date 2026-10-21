// STARTER DECK -Straw Hat Crew- [ST-01] (deck de départ de l'Aventure, tâche 1.14) : cartes codées d'après leur texte
// officiel (VO ; VF quand le catalogue la donne). Karoo, Chopper, Nico Robin, Vivi et Franky n'ont que des mots-clés ou
// rien ; Brook (ST01-011) est dans meta-sabo.ts. Briques et classement : game/docs/inventaire-op03.md ; choix
// d'interprétation : game/docs/interpretations.md (215, puis 410 et suivants).
import { attackAbility, hasBlocker, other } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  blockerBan, candidates, card, defenderPower, giveDon, grant, ko, oppChar, otherThanSelf, ownLeaderOrChar, powerMod,
  restSelf, selfDon, selfKeyword, when, type Effect, type Targets,
} from './bricks.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}

// Un effet qui ne sert qu'à attaquer (+1000 pour le tour, [Imblocable] pour le tour) : utile seulement pendant son tour,
// si l'une des cartes visées peut encore attaquer (l'IA ne le gaspille pas, l'interface le signale)
const forAttack = (e: Effect, t: Targets, also: (s: GameState, p: PlayerId) => boolean = () => true): Effect => ({
  ...e,
  useful: (s, p, self) => s.active === p && also(s, p) && candidates(s, p, t, (c) => attackAbility(s, p, c).can, self).length > 0,
});

// [Imblocable] ne sert que face à un [Bloqueur] adverse redressé
const oppHasBlocker = (s: GameState, p: PlayerId) => s.players[other(p)].chars.some((c) => !c.rested && hasBlocker(s, other(p), c));

const SH_CARD = ownLeaderOrChar({ type: SH });
const JINBE_TARGET = otherThanSelf(ownLeaderOrChar());

export const ST01: Record<string, CardBehavior> = {
  // Monkey.D.Luffy (Leader) : [Activation : Principale] [Une fois par tour] jusqu'à 1 DON!! épuisée à ce Leader ou à 1
  // de ses Personnages
  'ST01-001': card({
    activateMain: {
      label: 'Luffy : donner jusqu’à 1 DON!! épuisée à ton Leader ou à 1 de tes Personnages',
      once: true,
      effect: giveDon(ownLeaderOrChar(), 1, 'Monkey D. Luffy'),
    },
  }),

  // Usopp : [DON!! x2] [En attaquant] l'adversaire ne peut pas activer le [Bloqueur] d'un Personnage de 5000 de puissance
  // ou plus pendant ce combat ; [Déclenchement] jouer cette carte (générique)
  'ST01-002': card({ whenAttacking: when(selfDon(2), blockerBan({ powerMin: 5000 }, 'Usopp')) }),

  // Sanji : [DON!! x2] ce Personnage gagne [Initiative]
  'ST01-004': { rush: (_s, _p, c) => c.don >= 2 },

  // Jinbe : [DON!! x1] [En attaquant] jusqu'à 1 de ses Leader ou Personnages autre que celui-ci gagne +1000 pour le tour
  'ST01-005': card({ whenAttacking: when(selfDon(1), forAttack(powerMod(JINBE_TARGET, 1000, 'turn', 'Jinbe'), JINBE_TARGET)) }),

  // Nami : [Activation : Principale] [Une fois par tour] jusqu'à 1 DON!! épuisée à son Leader ou à 1 de ses Personnages
  'ST01-007': card({
    activateMain: {
      label: 'Nami : donner jusqu’à 1 DON!! épuisée à ton Leader ou à 1 de tes Personnages',
      once: true,
      effect: giveDon(ownLeaderOrChar(), 1, 'Nami'),
    },
  }),

  // Monkey D. Luffy (SR) : [Initiative] (mot-clé, d'office) ; [DON!! x2] [En attaquant] l'adversaire ne peut pas activer
  // [Bloqueur] pendant ce combat (= [Imblocable] pour le combat, interprétation 215)
  'ST01-012': card({ whenAttacking: when(selfDon(2), selfKeyword('Unblockable', 'Monkey D. Luffy', 'battle')) }),

  // Roronoa Zoro : [DON!! x1] ce Personnage gagne +1000 (pendant les deux tours : la DON!! reste donnée jusqu'à la
  // phase de Recharge de son propriétaire)
  'ST01-013': { selfPower: (_s, _p, c) => (c.don >= 1 ? 1000 : 0) },

  // Guard Point : [Contre] +3000 pour le combat à la carte attaquée ; [Déclenchement] jusqu'à 1 de ses Leader ou
  // Personnages gagne +1000 pour le tour
  'ST01-014': card({
    onCounter: defenderPower(3000, 'Guard Point'),
    onTrigger: powerMod(ownLeaderOrChar(), 1000, 'turn', 'Guard Point'),
  }),

  // Gum-Gum Jet Pistol : [Principale] KO d'un Personnage adverse de 6000 de puissance ou moins ; [Déclenchement] activer
  // l'effet [Principale] (générique)
  'ST01-015': card({ onMain: ko(oppChar({ powerMax: 6000 }), 'Gum-Gum Jet Pistol') }),

  // Diable Jambe : [Principale] un de ses Leader ou Personnages {Équipage de Chapeau de paille} : l'adversaire ne peut pas
  // activer [Bloqueur] s'il attaque ce tour-ci (= [Imblocable] pour le tour, interprétation 215) ; [Déclenchement] KO
  // d'un Personnage adverse [Bloqueur] de coût 3 ou moins
  'ST01-016': card({
    onMain: forAttack(grant(SH_CARD, { stat: 'keyword', keyword: 'Unblockable' }, 'turn', 'Diable Jambe',
      'ne peut pas être bloqué s’il attaque'), SH_CARD, oppHasBlocker),
    onTrigger: ko(oppChar({ keyword: 'Blocker', costMax: 3 }), 'Diable Jambe'),
  }),

  // Thousand Sunny (Lieu) : [Activation : Principale] épuiser ce Lieu : jusqu'à 1 de ses Leader ou Personnages
  // {Équipage de Chapeau de paille} gagne +1000 pour le tour
  'ST01-017': card({
    activateMain: {
      label: 'Thousand Sunny : s’épuiser pour donner +1000 pour le tour à ton Leader ou à 1 Personnage {Équipage de Chapeau de paille}',
      cost: restSelf(),
      effect: forAttack(powerMod(SH_CARD, 1000, 'turn', 'Thousand Sunny'), SH_CARD),
    },
  }),
};
