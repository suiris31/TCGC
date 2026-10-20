// OP03 NOIRE (tâche 1.12 du plan « Aventure ») : les cartes noires d'OP03 « Pillars of Strength », autour des Leaders
// Rob Lucci (OP03-076, {CP9}) et Charlotte Linlin (OP03-077, noir et jaune). Codées d'après leur texte officiel (VF quand
// elle existe, sinon VO) et l'inventaire de la tâche 1.1 (game/docs/inventaire-op03.md). Les cartes sans effet
// (Kumadori, Jerry, Jabra, Nero) sont jouables d'office. Chaque condition se vérifie dans la partie. Les choix
// d'interprétation sont dans game/docs/interpretations.md (numéros 350 et suivants).
import { canBeKO, canLeaveByEffect, chooseUpTo1, def, fieldCost, log, other, removeByEffect, removeFromField } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  all, bothCosts, card, costMod, costToZero, deckAtLeast, defenderPower, discard, discardCost, drawCards, effect, ko, leaderTypeIncludes,
  lifeAtMost, lifeFromDeck, lookTopPlay, lookTopTrash, myTurn, oppChar, oppDiscards, oppHandAtLeast, onceWithCost, playFromTrash,
  readySelf, restDon, restSelf, searchTop, selfDon, selfKeyword, seq, trashFromOppHand, trashToBottomCost, when, withCost,
  type Cost, type Effect,
} from './bricks.ts';

const CP = 'CP';  // « dont le type contient "CP" » (CP9, CP7, CP6, CP0...)
const cpLeader = leaderTypeIncludes(CP);

// « Vous pouvez [coût] : [effet] », proposé seulement quand l'effet peut faire quelque chose (interprétation 350) : le
// joueur n'a jamais intérêt à payer pour rien, et l'IA répondrait oui
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// Rob Lucci (Leader) : [Votre tour] [Une fois par tour] quand un Personnage adverse est mis KO, vous pouvez défausser 2
// cartes pour redresser ce Leader (compté une fois le coût payé ; proposé seulement s'il est épuisé)
const LUCCI_KEY = 'lucciReady';
const lucciReady = onceWithCost(LUCCI_KEY, discardCost(2), readySelf(), 'Rob Lucci');

// Tempest Kick Sky Slicer : un seul choix parmi les Personnages adverses de coût 0 et le Lieu adverse de coût 3 ou moins
// (un coût négatif vaut 0, 1-3-6-2)
const tempestTargets = (s: GameState, p: PlayerId): number[] => {
  const O = s.players[other(p)];
  const chars = O.chars.filter((c) => fieldCost(s, c.uid) <= 0 && canBeKO(s, c.uid, 'effect', p) && canLeaveByEffect(s, c.uid, p)).map((c) => c.uid);
  return [...chars, ...(O.stage && (def(O.stage.num).cost ?? 0) <= 3 ? [O.stage.uid] : [])];
};
const tempestKick = effect((ctx) => {
  const uid = chooseUpTo1(ctx, tempestTargets(ctx.s, ctx.me), 'Tempest Kick Sky Slicer : Personnage adverse de coût 0 ou Lieu adverse de coût 3 ou moins à mettre KO :', 'oppKo');
  if (uid === null) return;
  if (ctx.s.players[ctx.opp].stage?.uid !== uid) {
    removeByEffect(ctx, uid, 'ko');
    return;
  }
  const f = removeFromField(ctx.s, uid, 'trash');
  if (f) log(ctx.s, ctx.opp, `le Lieu ${def(f.card.num).name} est mis KO (Tempest Kick Sky Slicer)`);
}, (s, p) => tempestTargets(s, p).length > 0);

export const OP03_NOIRE: Record<string, CardBehavior> = {
  'OP03-076': {
    when: [{
      on: 'ko',
      if: (s, owner, self, e) => s.active === owner && e.player !== owner && e.zone === 'character' && self.rested && !self.usedOpt.includes(LUCCI_KEY),
      run: (ctx) => lucciReady.run(ctx),
    }],
  },

  // Charlotte Linlin (Leader) : [DON!! x2] [En attaquant] ② et défausser 1 carte : avec 1 Vie ou moins, ajouter la
  // carte du dessus du deck au-dessus de sa Vie
  'OP03-077': card({
    whenAttacking: when(all(selfDon(2), lifeAtMost(1), deckAtLeast(1)),
      mayPay(bothCosts(restDon(2), discardCost(1)), lifeFromDeck(), 'Charlotte Linlin')),
  }),

  // Issho : [DON!! x1] [Votre tour] −3 de coût à tous les Personnages adverses ; [Jouée] si l'adversaire a 6 cartes ou plus
  // en main, 2 cartes de sa main défaussées (au hasard, interprétation 212)
  'OP03-078': card({ onPlay: when(oppHandAtLeast(6), trashFromOppHand(2, 'Issho')) }, {
    oppCostAura: (s, owner, source) => (s.active === owner && source.don >= 1 ? -3 : 0),
  }),

  // Vergo : [DON!! x1] ne peut pas être mis KO en combat
  'OP03-079': { cantBeKO: (_s, _p, self, cause) => cause === 'battle' && self.don >= 1 },

  // Kaku : [Jouée] placer 2 cartes « CP » de sa Défausse sous son deck : mettre KO un Personnage adverse de coût 3 ou moins
  'OP03-080': card({ onPlay: mayPay(trashToBottomCost(2, { typeIncludes: CP }), ko(oppChar({ costMax: 3 }), 'Kaku'), 'Kaku') }),

  // Kalifa : [Jouée] piocher 2, défausser 2, puis −2 de coût à un Personnage adverse pour le tour
  'OP03-081': card({ onPlay: seq(drawCards(2), discard(2), costMod(oppChar(), -2, 'turn', 'Kalifa')) }),

  // Corgy : [Jouée] regarder 5 cartes, en placer jusqu'à 2 dans la Défausse, le reste sous le deck
  'OP03-083': card({ onPlay: lookTopTrash(5, 2, 'Corgy') }),

  // Spandam : [Jouée] avec un Leader « CP » : 3 cartes du dessus, une carte « CP » autre que [Spandam] en main, le reste
  // dans la Défausse
  'OP03-086': card({ onPlay: when(cpLeader, searchTop(3, 1, { typeIncludes: CP, notName: 'Spandam' }, 'une carte dont le type contient « CP » autre que [Spandam]', 'trash')) }),

  // Fukurou : ne peut pas être mis KO par des effets ; [Bloqueur] (d'office)
  'OP03-088': { cantBeKO: (_s, _p, _self, cause) => cause === 'effect' },

  // Brandnew : [Jouée] 3 cartes du dessus, une carte {Marine} autre que [Brandnew] en main, le reste dans la Défausse
  'OP03-089': card({ onPlay: searchTop(3, 1, { type: 'Navy', notName: 'Brannew' }, 'une carte {Marine} autre que [Brandnew]', 'trash') }),

  // Blueno : [DON!! x1] [Bloqueur] ; [En cas de KO] jouer épuisé un Personnage « CP » de coût 4 ou moins de sa Défausse
  'OP03-090': card({ onKO: playFromTrash({ typeIncludes: CP, costMax: 4 }, 'Blueno', { rested: true }) }, {
    blocker: (_s, _p, c) => c.don >= 1,
  }),

  // Helmeppo : [Jouée] le coût d'un Personnage adverse sans effet de base devient 0 pour le tour (interprétations 204, 205)
  'OP03-091': card({ onPlay: costToZero(oppChar({ vanilla: true }), 'turn', 'Helmeppo') }),

  // Rob Lucci : [Jouée] placer 2 cartes « CP » de sa Défausse sous son deck : [Initiative] pour le tour (proposé pendant
  // son tour seulement)
  'OP03-092': card({ onPlay: mayPay(trashToBottomCost(2, { typeIncludes: CP }), when(myTurn, selfKeyword('Rush', 'Rob Lucci')), 'Rob Lucci') }),

  // Wanze : [Jouée] défausser 1 carte : avec un Leader « CP », mettre KO un Personnage adverse de coût 1 ou moins
  'OP03-093': card({ onPlay: mayPay(discardCost(1), when(cpLeader, ko(oppChar({ costMax: 1 }), 'Wanze')), 'Wanze') }),

  // Air Door : [Principale] avec un Leader « CP » : regarder 5 cartes, jouer un Personnage « CP » de coût 5 ou moins, le
  // reste dans la Défausse ; [Déclenchement] jouer un Personnage noir de coût 3 ou moins de sa Défausse
  'OP03-094': card({
    onMain: when(cpLeader, lookTopPlay(5, { typeIncludes: CP, costMax: 5 }, 'Air Door', { rest: 'trash' })),
    onTrigger: playFromTrash({ color: 'Black', costMax: 3 }, 'Air Door'),
  }),

  // Soap Sheep : [Principale] −2 de coût à jusqu'à 2 Personnages adverses pour le tour ; [Déclenchement] l'adversaire
  // défausse 1 carte
  'OP03-095': card({ onMain: costMod(oppChar(), -2, 'turn', 'Soap Sheep', 2), onTrigger: oppDiscards(1) }),

  // Tempest Kick Sky Slicer : [Principale] mettre KO un Personnage adverse de coût 0 ou un Lieu adverse de coût 3 ou
  // moins ; [Déclenchement] piocher 2
  'OP03-096': card({ onMain: tempestKick, onTrigger: drawCards(2) }),

  // Six Pouvoirs Gun : [Contre] défausser 1 carte : +3000 pour le combat ; [Déclenchement] piocher 1, puis mettre KO un
  // Personnage adverse de coût 1 ou moins. Valeur pour l'IA : il faut une autre carte en main pour payer (la main
  // compte encore l'Événement quand l'IA l'estime)
  'OP03-097': card({
    onCounter: withCost(discardCost(1), defenderPower(3000, 'Six Pouvoirs Gun'), 'Six Pouvoirs Gun'),
    onTrigger: seq(drawCards(1), ko(oppChar({ costMax: 1 }), 'Six Pouvoirs Gun')),
  }, { counterPower: (s, p) => (s.players[p].hand.length >= 2 ? 3000 : 0) }),

  // Enies Lobby (Lieu) : [Activation : Principale] épuiser ce Lieu : avec un Leader « CP », −2 de coût à un Personnage
  // adverse pour le tour ; [Déclenchement] jouer cette carte (générique)
  'OP03-098': card({
    activateMain: { label: 'Enies Lobby : épuiser ce Lieu (−2 de coût à un Personnage adverse)', cost: restSelf(), effect: when(cpLeader, costMod(oppChar(), -2, 'turn', 'Enies Lobby')) },
  }),
};
