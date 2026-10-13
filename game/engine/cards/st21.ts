// DECK POUR DÉBUTANT EX -Gear 5- [ST-21] : cartes codées d'après leur texte officiel (VF). Le Leader Luffy (ST21-001)
// est dans st31.ts ; Jinbe, Stussy, Sentomaru, Chopper et Végapunk n'ont que des mots-clés ou rien. Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import { basePower, hasType } from '../rules.ts';
import type { CardBehavior } from '../types.ts';
import {
  card, charsAtLeast, drawCards, giveDon, grant, ko, oppChar, ownChar, ownLeaderOrChar, playFromHand, powerMod, selfDon,
  seq, when, type Effect,
} from './bricks.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}

// Gum Gum Taupe Bullet : −5000 à un Personnage adverse, puis, avec un Personnage de 6000 de puissance ou plus, KO d'un
// Personnage adverse de 2000 de puissance ou moins
const moleBullet: Effect = seq(
  powerMod(oppChar(), -5000, 'turn', 'Gum Gum Taupe Bullet'),
  when(charsAtLeast(1, { powerMin: 6000 }), ko(oppChar({ powerMax: 2000 }), 'Gum Gum Taupe Bullet')),
);

export const ST21: Record<string, CardBehavior> = {
  // Usopp : [DON!! x2] [Tour adverse] +2000
  'ST21-002': { selfPower: (s, p, c) => (s.active !== p && c.don >= 2 ? 2000 : 0) },

  // Sanji : [Jouée] un de ses Personnages {Équipage de Chapeau de paille} de 6000 de puissance ou plus ne peut pas être
  // bloqué s'il attaque ce tour-ci
  'ST21-003': card({
    onPlay: grant(ownChar({ type: SH, powerMin: 6000 }), { stat: 'keyword', keyword: 'Unblockable' }, 'turn', 'Sanji',
      'ne peut pas être bloqué s’il attaque'),
  }),

  // Jewelry Bonney : [DON!! x2] [En cas de KO] piocher 1 carte
  'ST21-004': card({ onKO: drawCards(1) }, { onKOCondition: (_s, _p, c) => c.don >= 2 }),

  // Nami : [Activation : Principale] [Une fois par tour] jusqu'à 2 DON!! épuisées à son Leader ou à un Personnage
  // {Équipage de Chapeau de paille}
  'ST21-009': card({
    activateMain: {
      label: 'Nami : donner jusqu’à 2 DON!! épuisées à ton Leader ou à 1 Personnage {Équipage de Chapeau de paille}',
      once: true,
      effect: giveDon(ownLeaderOrChar({ type: SH }), 2, 'Nami'),
    },
  }),

  // Nico Robin : [DON!! x2] [En attaquant] KO d'un Personnage adverse de 4000 de puissance ou moins
  'ST21-010': card({ whenAttacking: when(selfDon(2), ko(oppChar({ powerMax: 4000 }), 'Nico Robin')) }),

  // Franky : [DON!! x2] [Tour adverse] ses Personnages {Équipage de Chapeau de paille} de 4000 de puissance de base ou
  // moins gagnent +1000
  'ST21-011': {
    aura: (s, p, src, target) => (s.active !== p && src.don >= 2 && s.players[p].chars.some((c) => c.uid === target.uid)
      && hasType(target.num, SH) && basePower(s, target.uid) <= 4000 ? 1000 : 0),
  },

  // Brook : [En attaquant] jusqu'à 2 DON!! épuisées à son Leader ou à un Personnage
  'ST21-012': card({ whenAttacking: giveDon(ownLeaderOrChar(), 2, 'Brook') }),

  // Luffy (ST21-014) : [Initiative] ; [En attaquant] jusqu'à 1 DON!! épuisée à son Leader ou à un Personnage
  'ST21-014': card({ whenAttacking: giveDon(ownLeaderOrChar(), 1, 'Luffy') }),

  // Roronoa Zoro : [DON!! x2] [Initiative] ; [En cas de KO] jouer de sa main un Personnage rouge de 6000 de puissance ou
  // moins autre que [Roronoa Zoro]
  'ST21-015': card({
    onKO: playFromHand({ color: 'Red', powerMax: 6000, notName: 'Roronoa Zoro' }, 'Roronoa Zoro'),
  }, { rush: (_s, _p, c) => c.don >= 2 }),

  // Gum Gum Dawn Whip : [Principale] +1000 pour le tour à son Leader ou à un Personnage, puis un Personnage adverse de
  // 4000 de puissance ou moins ne peut pas activer [Bloqueur] ce tour-ci ; [Déclenchement] KO d'un Personnage adverse de
  // 4000 de puissance ou moins
  'ST21-016': card({
    onMain: seq(
      powerMod(ownLeaderOrChar(), 1000, 'turn', 'Gum Gum Dawn Whip'),
      grant(oppChar({ powerMax: 4000 }), { stat: 'noBlocker' }, 'turn', 'Gum Gum Dawn Whip', 'ne peut pas activer [Bloqueur]'),
    ),
    onTrigger: ko(oppChar({ powerMax: 4000 }), 'Gum Gum Dawn Whip'),
  }),

  // Gum Gum Taupe Bullet : [Principale] et [Déclenchement]
  'ST21-017': card({ onMain: moleBullet, onTrigger: moleBullet }),
};
