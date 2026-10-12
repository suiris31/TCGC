// MIHAWK DU MÉTA (octobre 2026, variante « Pays de Wano / Équipage du Roux ») : cartes codées pour ce deck, d'après
// leur texte officiel (VF, ou VO pour les cartes qui n'existent qu'en anglais). Kinémon (ST32-001) et Oden Kozuki
// (ST32-002) sont déjà dans st32.ts ; Kawamatsu (OP12-023) n'a pas d'effet. Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import { addMod, def, discardFromHand, hasType, log, lookTopPick, removeFromField, restedCards, uniqueByNum } from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  card, characterCostAtLeast, drawCards, effect, keepRested, ko, leaderAttribute, leaderNamed, noCharactersThisTurn,
  oppChar, oppLeaderAttribute, ownChar, playFromHand, readyDon, rest, restAll, restCost, returnOwnChar, searchTop, seq,
  setActiveTargets, when, withCost, type Cost,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const SLASH = 'Slash';                  // <Tranche>
const MIHAWK = 'Dracule Mihawk';
const ARK_NOAH = 'The Ark Noah';        // [Arche Noah] (Lieu OP06-041)
const FISH_MAN = 'Fish-Man';            // {Hommes-poissons}

// « Votre Leader gagne +3000 de puissance pour tout le combat » ([Contre])
function leaderCounter(ctx: EffectCtx, amount: number, source: string) {
  const leader = ctx.s.players[ctx.me].leader;
  addMod(ctx.s, { uid: leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
}
const protectsLeader = (s: GameState, p: PlayerId, target: number) => target === s.players[p].leader.uid;

// Vander Decken IX : « placer dans votre Défausse 1 carte de type {Hommes-poissons} de votre main ou 1 [Arche Noah] de
// votre main ou de votre terrain »
const fishManOrArk: Cost = (() => {
  const fromHand = (c: Card) => hasType(c.num, FISH_MAN) || def(c.num).names.includes(ARK_NOAH);
  const arkOnField = (s: GameState, p: PlayerId) => {
    const P = s.players[p];
    return [...P.chars, ...(P.stage ? [P.stage] : [])].filter((c) => def(c.num).names.includes(ARK_NOAH));
  };
  return {
    label: 'placer dans ta Défausse 1 carte {Hommes-poissons} de ta main (ou 1 [Arche Noah] de ta main ou de ton terrain)',
    can: (s, p) => s.players[p].hand.some(fromHand) || arkOnField(s, p).length > 0,
    pay: (ctx) => {
      const field = arkOnField(ctx.s, ctx.me);
      if (!field.length) return discardFromHand(ctx, ctx.me, 1, 'Carte à placer dans ta Défausse :', fromHand) === 1;
      const P = ctx.s.players[ctx.me];
      const answer = ctx.ask({
        prompt: 'Carte à placer dans ta Défausse :',
        options: [
          ...uniqueByNum(P.hand.filter(fromHand)).map((c) => ({ id: `hand:${c.uid}`, label: `${def(c.num).name} (main)`, uid: c.uid })),
          ...field.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (terrain)`, uid: c.uid })),
        ],
        tag: 'discard',
      });
      const uid = Number(answer.split(':')[1]);
      if (answer.startsWith('hand:')) return discardFromHand(ctx, ctx.me, 1, 'Carte à placer dans ta Défausse :', (c) => c.uid === uid) === 1;
      const f = removeFromField(ctx.s, uid, 'trash');
      if (f) log(ctx.s, ctx.me, `place ${def(f.card.num).name} dans sa Défausse`);
      return Boolean(f);
    },
  };
})();

export const META_MIHAWK: Record<string, CardBehavior> = {
  // Leader Mihawk : +1000 si le Leader adverse a l'attribut <Tranche> ; [Activation : Principale] [Une fois par tour]
  // épuiser 1 de ses cartes : s'il y a un Personnage de coût 5 ou plus, redresser jusqu'à 3 DON!! ; puis, plus de
  // carte Personnage jouée ce tour-ci
  'OP14-020': card({
    activateMain: {
      label: 'Mihawk (Leader) : épuiser 1 de tes cartes pour redresser jusqu’à 3 DON!! (plus de Personnage joué ce tour-ci)',
      once: true,
      cost: restCost(1, 'cards'),
      effect: seq(when(characterCostAtLeast(5), readyDon(3)), noCharactersThisTurn('Dracule Mihawk')),
    },
  }, { selfPower: (s, p) => (oppLeaderAttribute(SLASH)(s, p, -1) ? 1000 : 0) }),

  // « Acceptez de devenir mes samouraïs !! » : [Principale] épuiser 2 de ses Personnages : piocher 2 cartes
  'OP01-055': card({ onMain: withCost(restCost(2, 'characters'), drawCards(2), 'Acceptez de devenir mes samouraïs !!') }),

  // Vander Decken IX : [Jouée] défausser 1 carte {Hommes-poissons} (ou 1 [Arche Noah]) : KO 1 Personnage adverse épuisé
  'OP06-033': card({ onPlay: withCost(fishManOrArk, ko(oppChar({ rested: true }), 'Vander Decken IX'), 'Vander Decken IX') }),

  // Ichidai San Zen Dai Sen Sekai : [Contre] +2000 pour le combat, puis +2000 encore avec 8 cartes épuisées ou plus ;
  // [Déclenchement] KO 1 Personnage adverse épuisé de coût 3 ou moins
  'OP06-038': card({
    onCounter: effect((ctx) => {
      counterBoost(ctx, 2000, 'Ichidai San Zen Dai Sen Sekai');
      if (restedCards(ctx.s, ctx.me) >= 8) counterBoost(ctx, 2000, 'Ichidai San Zen Dai Sen Sekai, 8 cartes épuisées');
    }),
    onTrigger: ko(oppChar({ rested: true, costMax: 3 }), 'Ichidai San Zen Dai Sen Sekai'),
  }),

  // Otama : [Jouée] 5 cartes du dessus, 1 carte {Pays de Wano} verte autre que [Otama]
  'OP07-022': card({ onPlay: searchTop(5, 1, { color: 'Green', type: 'Land of Wano', notName: 'Otama' }, 'une carte {Pays de Wano} verte autre que [Otama]') }),

  // Electrical Luna : [Principale] les Personnages adverses épuisés de coût 7 ou moins ne se redresseront pas à la
  // prochaine phase de Recharge adverse ; [Déclenchement] épuiser 1 Personnage adverse
  'OP08-036': card({
    onMain: keepRested(oppChar({ rested: true, costMax: 7 }), 'Electrical Luna'),
    onTrigger: rest(oppChar(), 'Electrical Luna'),
  }),

  // Perona : [Jouée] avec un Leader <Tranche>, 5 cartes du dessus, 1 carte <Tranche> ou 1 Événement vert
  'OP12-034': card({
    onPlay: when(leaderAttribute(SLASH), effect((ctx) => {
      lookTopPick(ctx, 5, 1, (n) => def(n).attributes.includes(SLASH) || (def(n).category === 'EVENT' && def(n).colors.includes('Green')),
        'une carte <Tranche> ou un Événement vert');
    })),
  }),

  // Trafalgar Law : [Bloqueur] avec 1 Vie ou moins ; [Jouée] renvoyer 1 de ses Personnages dans sa main : jouer épuisé
  // 1 Personnage de coût 5 ou moins de sa main
  'OP13-031': card({
    onPlay: withCost(returnOwnChar(), playFromHand({ costMax: 5 }, 'Trafalgar Law', { rested: true }), 'Trafalgar Law'),
  }, { blocker: (s, p) => s.players[p].life.length <= 1 }),

  // « Si vous croyez que je me souviens de tous les minables... » : [Principale] épuiser 2 de ses cartes : piocher 1
  // carte et épuiser 1 Personnage adverse de 7000 de puissance de base ou moins ; [Contre] Leader +3000
  'OP14-038': card({
    onMain: withCost(restCost(2, 'cards'), seq(drawCards(1), rest(oppChar({ basePowerMax: 7000 }), 'Si vous croyez que je me souviens...')),
      'Si vous croyez que je me souviens...'),
    onCounter: effect((ctx) => leaderCounter(ctx, 3000, 'Si vous croyez que je me souviens...')),
  }, { counterUseful: protectsLeader }),

  // Barque mortuaire (Lieu) : [Jouée] avec le Leader [Dracule Mihawk], piocher 1 carte ; [Fin de votre tour] dans ce
  // cas, redresser 1 DON!!
  'OP14-039': card({
    onPlay: when(leaderNamed(MIHAWK), drawCards(1)),
    endOfTurn: when(leaderNamed(MIHAWK), readyDon(1)),
  }),

  // Shanks : [Initiative] ; [Jouée] redresser jusqu'à 2 DON!!, puis épuiser tous les Personnages adverses
  'OP17-022': card({ onPlay: seq(readyDon(2), restAll(oppChar())) }),

  // Yasopp : [Jouée] piocher 1 carte et épuiser 1 Personnage adverse de coût 8 ou moins ; [Fin de votre tour] redresser
  // 1 de ses Personnages incluant « Équipage du Roux » dans son type
  'OP17-031': card({
    onPlay: seq(drawCards(1), rest(oppChar({ costMax: 8 }), 'Yasopp')),
    endOfTurn: setActiveTargets(ownChar({ typeIncludes: 'Red-Haired Pirates' }), 'Yasopp'),
  }),
};
