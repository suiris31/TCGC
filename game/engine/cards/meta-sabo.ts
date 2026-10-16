// SABO DU MÉTA (octobre 2026, variante « Équipage de Chapeau de paille / Erbaf ») : cartes codées pour ce deck, d'après
// leur texte officiel (VF et VO). Le Leader Sabo (OP13-004), Nami (OP01-016) et Menu « Bonnes manières » (OP04-016) sont
// déjà dans st35.ts et st31.ts. Gerd (OP17-081) et « Je suis Luffy ! » (OP17-096), absents de la liste du méta, ont été
// ajoutés à la demande de l'utilisateur (16 octobre 2026) pour son propre deck. Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import { def, drawAndDiscard, log, reveal, uniqueByNum } from '../rules.ts';
import type { CardBehavior, GameState } from '../types.ts';
import {
  bothCosts, card, characterCostAtLeast, discardCost, drawCards, effect, giveActiveDon, giveDon, grant, koTotalCost, leaderType,
  oppChar, ownChar, ownLeaderOrChar, playFromTrash, powerMod, searchTop, seq, trashSelf, trashToHand, trashTopCost, when, withCost,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const SH = 'Straw Hat Crew';  // {Équipage de Chapeau de paille}
const ELBAPH = 'Elbaph';      // {Erbaf}

// « S'il y a un Personnage ayant un coût de 12 ou plus » (sur l'un ou l'autre terrain)
const big = characterCostAtLeast(12);
const bigBonus = (s: GameState) => (big(s, 0, -1) ? 3000 : 0);
const elbaphLeader = leaderType(ELBAPH);
const LUFFY_KING = 'Je suis Luffy ! Le futur roi des pirates !';

export const META_SABO: Record<string, CardBehavior> = {
  // Ace, Sabo et Luffy : [Activation : Principale] donner 1 DON!! redressée à son Leader ou un Personnage et placer cette
  // carte dans sa Défausse : −3000 à un Personnage adverse pour le tour
  'OP13-007': card({
    activateMain: {
      label: 'Ace, Sabo et Luffy : donner 1 DON!! redressée et placer cette carte dans ta Défausse pour donner −3000 à un Personnage adverse',
      cost: bothCosts(giveActiveDon(ownLeaderOrChar()), trashSelf()),
      effect: powerMod(oppChar(), -3000, 'turn', 'Ace, Sabo et Luffy'),
    },
  }),

  // Arrimage pirates 6 : +6 de coût ; [Jouée] placer 3 cartes du dessus du deck dans la Défausse : jouer un
  // {Équipage de Chapeau de paille} de coût 2 ou moins de sa Défausse
  'OP15-088': card({
    onPlay: withCost(trashTopCost(3), playFromTrash({ type: SH, costMax: 2 }, 'Arrimage pirates 6'), 'Arrimage pirates 6'),
  }, { selfCost: () => 6 }),

  // Usopp : +3000 avec un coût 12 ou plus en jeu ; [Jouée] 3 cartes du dessus, 1 carte {Erbaf}, le reste en Défausse
  'OP17-080': card({ onPlay: searchTop(3, 1, { type: ELBAPH }, 'une carte {Erbaf}', 'trash') }, { selfPower: bigBonus }),

  // Sanji : +3000 avec un coût 12 ou plus en jeu ; [Jouée] piocher 2 cartes, en défausser 2
  'OP17-082': card({ onPlay: effect((ctx) => drawAndDiscard(ctx, 2, 2)) }, { selfPower: bigBonus }),

  // Jinbe : avec un coût 12 ou plus en jeu, [Bloqueur] et +3000
  'OP17-083': { blocker: (s) => big(s, 0, -1), selfPower: bigBonus },

  // Chopper : [Jouée] avec un coût 12 ou plus en jeu, un de ses Personnages gagne [Imblocable] pour le tour
  'OP17-084': card({
    onPlay: when(big, grant(ownChar(), { stat: 'keyword', keyword: 'Unblockable' }, 'turn', 'Tony-Tony Chopper', 'gagne [Imblocable]')),
  }),

  // Nami : [Jouée] défausser 1 carte {Erbaf} de sa main : piocher 2 cartes
  'OP17-086': card({ onPlay: withCost(discardCost(1, { type: ELBAPH }), drawCards(2), 'Nami') }),

  // Nico Robin : +3000 avec un coût 12 ou plus en jeu ; [Jouée] dans ce cas, −3000 à un Personnage adverse pour le tour
  'OP17-087': card({ onPlay: when(big, powerMod(oppChar(), -3000, 'turn', 'Nico Robin')) }, { selfPower: bigBonus }),

  // Gerd : +12 de coût avec un Leader {Erbaf} ; [Jouée] défausser 1 carte : reprendre de sa Défausse un Personnage de
  // coût 8 ou moins autre que [Gerd]
  'OP17-081': card({
    onPlay: withCost(discardCost(1), trashToHand({ category: 'CHARACTER', costMax: 8, notName: 'Gerd' }, 'Gerd'), 'Gerd'),
  }, { selfCost: (s, p) => (elbaphLeader(s, p, -1) ? 12 : 0) }),

  // Haguar D. Sauro : +12 de coût ; [Jouée] 3 cartes du dessus, 1 carte {Erbaf}, le reste en Défausse
  'OP17-089': card({ onPlay: searchTop(3, 1, { type: ELBAPH }, 'une carte {Erbaf}', 'trash') }, { selfCost: () => 12 }),

  // Monkey D. Luffy : [Initiative] avec un coût 12 ou plus en jeu ; [Jouée] piocher 1, puis jouer un Personnage de coût
  // 2 ou moins de sa Défausse
  'OP17-093': card({ onPlay: seq(drawCards(1), playFromTrash({ costMax: 2 }, 'Monkey D. Luffy')) }, { rush: (s) => big(s, 0, -1) }),

  // Roronoa Zoro : +3000 avec un coût 12 ou plus en jeu ; si un de ses Personnages devait quitter le terrain à cause d'un
  // effet adverse, il peut placer 3 cartes de sa Défausse au-dessous de son deck à la place
  'OP17-095': {
    selfPower: bigBonus,
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Zoro : placer 3 cartes de ta Défausse au-dessous de ton deck à la place (${def(victim.num).name})`,
      condition: (s, p) => s.players[p].trash.length >= 3,
      apply: (s, p, _self, _victim, ctx) => {
        const P = s.players[p];
        const placed: string[] = [];
        for (let i = 0; i < 3 && P.trash.length; i++) {
          const answer = ctx.ask({
            player: p,
            prompt: `Zoro : carte de ta Défausse à placer au-dessous de ton deck (${i + 1}/3) :`,
            options: uniqueByNum(P.trash).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
            tag: 'trashToDeck',
          });
          const [card] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
          P.deck.push(card);
          reveal(s, [card.uid], 'both');
          placed.push(def(card.num).name);
        }
        log(s, p, `place ${placed.join(', ')} de sa Défausse au-dessous de son deck à la place (Zoro)`);
      },
    },
  },

  // Je suis Luffy ! Le futur roi des pirates ! : [Contre] avec un coût 12 ou plus en jeu, +4000 pour le combat ;
  // [Déclenchement] reprendre une carte {Erbaf} de sa Défausse
  'OP17-096': card({
    onCounter: when(big, effect((ctx) => counterBoost(ctx, 4000, LUFFY_KING))),
    onTrigger: trashToHand({ type: ELBAPH }, LUFFY_KING),
  }, { counterUseful: (s) => big(s, 0, -1) }),

  // Loki : +12 de coût, +3000 pendant le tour adverse ; [Jouée] mettre KO des Personnages adverses de coût total 4 ou moins
  'OP17-119': card({ onPlay: koTotalCost(oppChar(), 4, 'Loki') }, { selfCost: () => 12, selfPower: (s, p) => (s.active !== p ? 3000 : 0) }),

  // Brook : [Jouée] donner jusqu'à 2 DON!! épuisées à son Leader ou à un de ses Personnages
  'ST01-011': card({ onPlay: giveDon(ownLeaderOrChar(), 2, 'Brook') }),
};
