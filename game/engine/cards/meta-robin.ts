// NICO ROBIN DU MÉTA (octobre 2026, violet / jaune, variante « Équipage de Big Mom ») : cartes codées pour ce deck,
// d'après leur texte officiel. Charlotte Brûlée (ST34-003) est déjà dans st34.ts ; Charlotte Daifuku (OP17-107) n'a
// qu'un [Déclenchement] « jouez cette carte » (géré par le moteur). Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import { def, donOnField } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  addDon, bothCosts, card, chooseOne, discardCost, donMinus, drawCards, effect, grant, ko, leaderType, lifeAtMost,
  lifeFromDeck, lookTopToLife, myTurn, oppChar, oppDiscards, oppLifeToHand, playFromHand, playFromTrash, powerMod,
  restDon, searchTop, selfKeyword, seq, when, withCost,
} from './bricks.ts';
import { counterBoost, playTriggerCard } from './common.ts';

const BMP = 'Big Mom Pirates';  // {Équipage de Big Mom}
const SH = 'Straw Hat Crew';    // {Équipage de Chapeau de paille}

// Charlotte Linlin : « la puissance de base de vos Personnages ayant 4000 de puissance de base et [Déclenchement]
// passe à 8000 » pendant son tour ; plusieurs Linlin ne s'additionnent pas (seule la première compte)
function linlinAura(s: GameState, owner: PlayerId, source: { uid: number }, target: { uid: number; num: string }): number {
  if (s.active !== owner || target.uid === s.players[owner].leader.uid) return 0;
  if (s.players[owner].chars.find((c) => c.num === 'OP17-112')?.uid !== source.uid) return 0;
  const d = def(target.num);
  return d.power === 4000 && d.triggerEn ? 4000 : 0;
}

export const META_ROBIN: Record<string, CardBehavior> = {
  // Leader Nico Robin : [Exil] ; [En attaquant] défausser 1 carte ayant [Déclenchement] : 1 DON!! épuisée du deck DON!!
  'OP09-062': card({ whenAttacking: withCost(discardCost(1, { trigger: true }), addDon(1, 'rested'), 'Nico Robin') }),

  // Yamato : [Bloqueur] ; [Jouée] 1 DON!! épuisée du deck DON!!
  'OP17-074': card({ onPlay: addDon(1, 'rested') }),

  // Borsalino : [Bloqueur] ; [Jouée] avec 2 Vies ou moins, la carte du dessus du deck au-dessus de la Vie
  'EB04-058': card({ onPlay: when(lifeAtMost(2), lifeFromDeck()) }),

  // Streusen : [Jouée] 3 cartes du dessus, 1 carte {Équipage de Big Mom}
  'OP17-113': card({ onPlay: searchTop(3, 1, { type: BMP }, 'une carte {Équipage de Big Mom}') }),

  // Charlotte Oven : [En cas de KO] jouer de sa Défausse un Personnage de 4000 de puissance ou moins autre que [Charlotte
  // Oven] ; [Déclenchement] jouez cette carte
  'OP17-102': card({ onKO: playFromTrash({ powerMax: 4000, notName: 'Charlotte Oven' }, 'Charlotte Oven') }),

  // Trois généraux sucrés : [Votre tour] [Jouée] épuiser 2 DON!! : piocher 1, la carte du dessus du deck au-dessus de la
  // Vie, puis −3000 à 2 Personnages adverses pour le tour ; [Déclenchement] jouez cette carte
  'OP17-114': card({
    onPlay: when(myTurn, withCost(restDon(2), seq(drawCards(1), lifeFromDeck(), powerMod(oppChar(), -3000, 'turn', 'Trois généraux sucrés', 2)),
      'Trois généraux sucrés')),
  }),

  // Miss Doublefinger (Zala) : [Jouée] défausser 1 carte : 1 DON!! épuisée du deck DON!! ; [Déclenchement] DON!! −1 :
  // jouez cette carte
  'OP05-073': card({
    onPlay: withCost(discardCost(1), addDon(1, 'rested'), 'Miss Doublefinger (Zala)'),
    onTrigger: withCost(donMinus(1), effect(playTriggerCard), 'Miss Doublefinger (Zala)'),
  }),

  // Charlotte Pudding : [Jouée] défausser 1 carte ayant [Déclenchement] : piocher 3 cartes ; [Déclenchement] 5 cartes du
  // dessus, 1 carte {Équipage de Big Mom}
  'OP17-109': card({
    onPlay: withCost(discardCost(1, { trigger: true }), drawCards(3), 'Charlotte Pudding'),
    onTrigger: searchTop(5, 1, { type: BMP }, 'une carte {Équipage de Big Mom}'),
  }),

  // Charlotte Smoothie : [Votre tour] [Jouée] épuiser 2 DON!! : la carte du dessus du deck au-dessus de la Vie, puis
  // l'adversaire défausse 1 carte ; [Déclenchement] jouez cette carte
  'OP17-106': card({ onPlay: when(myTurn, withCost(restDon(2), seq(lifeFromDeck(), oppDiscards(1)), 'Charlotte Smoothie')) }),

  // Charlotte Slurp (Perospero en VO) : [Votre tour] [Jouée] jouer de sa main un Personnage {Équipage de Big Mom} de
  // coût 6 ou moins, puis Slurp lui-même gagne [Initiative] pour le tour ; [Déclenchement] jouez cette carte
  'OP17-110': card({
    onPlay: when(myTurn, seq(playFromHand({ type: BMP, costMax: 6 }, 'Charlotte Slurp'), selfKeyword('Rush', 'Charlotte Slurp'))),
  }),

  // Marshall D. Teach : [Jouée] 3 cartes du dessus, 1 au-dessus de la Vie, le reste sous le deck ; [Déclenchement]
  // annuler les effets d'un Personnage adverse pour le tour, puis KO 1 Personnage adverse de coût 5 ou moins
  'OP16-119': card({
    onPlay: lookTopToLife(3, 'Marshall D. Teach'),
    onTrigger: seq(
      grant(oppChar(), { stat: 'negated' }, 'turn', 'Marshall D. Teach', 'a ses effets annulés'),
      ko(oppChar({ costMax: 5 }), 'Marshall D. Teach'),
    ),
  }),

  // Charlotte Linlin : [Votre tour] puissance de base 8000 pour ses Personnages à 4000 avec [Déclenchement] ; [Jouée]
  // piocher 1, puis au choix : la carte du dessus du deck au-dessus de sa Vie, ou la carte du dessus de la Vie adverse
  // dans la main de l'adversaire
  'OP17-112': card({
    onPlay: seq(drawCards(1), chooseOne('Charlotte Linlin', [
      { label: 'Ajouter au-dessus de ta Vie la carte du dessus de ton deck', effect: lifeFromDeck() },
      { label: 'Ajouter à la main adverse la carte du dessus de sa Vie', effect: oppLifeToHand() },
    ])),
  }, { aura: linlinAura }),

  // Gum Gum Gigant : [Contre] DON!! −2 et défausser 1 carte : avec un Leader {Équipage de Chapeau de paille}, +4000 pour
  // le combat ; puis piocher 2 cartes
  'OP09-078': card({
    onCounter: withCost(bothCosts(donMinus(2), discardCost(1)), seq(
      when(leaderType(SH), effect((ctx) => counterBoost(ctx, 4000, 'Gum Gum Gigant'))),
      drawCards(2),
    ), 'Gum Gum Gigant'),
  }, {
    counterUseful: (s, p) => donOnField(s, p) >= 2 && s.players[p].hand.length >= 2 && leaderType(SH)(s, p, -1),
    counterExtra: (s, p) => donOnField(s, p) >= 2 && s.players[p].hand.length >= 2,
  }),
};
