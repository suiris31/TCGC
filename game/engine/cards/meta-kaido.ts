// KAIDO DU MÉTA (octobre 2026, violet, « Équipage des cent bêtes ») : cartes codées pour ce deck, d'après leur texte
// officiel (VF, ou VO pour OP07-077 qui n'existe qu'en anglais). Yamato (OP17-074), Trépas divin, Djambuwal, Mamaragan
// (decks Robin et Ener) et Charlotte Linlin (ST34-004) sont déjà codés. Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import {
  addDelayed, addMod, chooseUpTo1, def, donOnField, fieldCost, findField, log, lookTopPick, oppChars, other, removeByEffect, returnDon,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  addDon, any, card, discardCost, donMinus, drawCards, effect, grant, leaderType, lifeFromDeck, onceWithCost, oppChar,
  ownLeaderOrChar, powerMod, readyDon, rest, restDon, seq, trashSelf, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost, playCharFromHand } from './common.ts';

const AKP = 'Animal Kingdom Pirates';  // {Équipage des cent bêtes}
const BMP = 'Big Mom Pirates';         // {Équipage de Big Mom}
const akpLeader = leaderType(AKP);
const named = (s: GameState, p: PlayerId, name: string) => s.players[p].chars.filter((c) => def(c.num).names.includes(name)).length;

// « Votre Leader gagne +X de puissance pour tout le combat » ([Contre])
const leaderBattleBoost = (amount: number, source: string): Effect => effect((ctx) => {
  const leader = ctx.s.players[ctx.me].leader;
  addMod(ctx.s, { uid: leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
});

// Leader Kaido : [En attaquant] / [Attaque adverse], une seule fois par tour pour les deux
const kaidoLeader = onceWithCost('kaidoLeader', donMinus(1), powerMod(oppChar(), -2000, 'turn', 'Kaido'), 'Kaido');
// Ramollo Beam Sword : épuiser un Personnage adverse (utile même si l'attaque est déjà repoussée)
const ramolloRest = rest(oppChar(), 'Ramollo Beam Sword');

// Kaido (OP17-063) : « annulez les effets de jusqu'à 1 Personnage adverse ayant un coût de 6 ou moins pour tout le tour
// et mettez-le KO »
const negateAndKo: Effect = {
  run: (ctx: EffectCtx) => {
    const uid = chooseUpTo1(ctx, oppChars(ctx, (c) => fieldCost(ctx.s, c.uid) <= 6), 'Kaido : Personnage adverse de coût 6 ou moins dont les effets sont annulés, puis mis KO :', 'oppKo');
    if (uid === null) return;
    addMod(ctx.s, { uid, stat: 'negated', amount: 0, until: 'turn', source: 'Kaido' });
    log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} a ses effets annulés pour le tour (Kaido)`);
    removeByEffect(ctx, uid, 'ko');
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => fieldCost(s, c.uid) <= 6),
};

export const META_KAIDO: Record<string, CardBehavior> = {
  // Leader Kaido : [En attaquant] / [Attaque adverse] [Une fois par tour] DON!! −1 : −2000 à un Personnage adverse
  'OP17-058': card({ whenAttacking: kaidoLeader, onOpponentAttack: kaidoLeader }),

  // King : s'il devait être mis KO, renvoyer 1 DON!! du terrain au deck DON!! à la place ; [Activation : Principale]
  // [Une fois par tour] avec un Leader {Équipage des cent bêtes} et aucun autre [King], 1 DON!! redressée et 1 épuisée
  'EB04-031': card({
    activateMain: {
      label: 'King : ajouter 1 DON!! redressée et 1 épuisée',
      once: true,
      condition: (s, p) => akpLeader(s, p, -1) && named(s, p, 'King') === 1,
      effect: seq(addDon(1, 'active'), addDon(1, 'rested')),
    },
  }, {
    koReplace: {
      label: 'Renvoyer 1 DON!! de ton terrain dans ton deck DON!!',
      condition: (s, p) => donOnField(s, p) > 0,
      apply: (s, p, self) => {
        returnDon(s, p, 1);
        log(s, p, `${def(self.num).name} n'est pas mis KO (1 DON!! renvoyée à la place)`);
      },
    },
  }),

  // Queen (EB04-032) : [Jouée] défausser 1 carte {Équipage des cent bêtes} : piocher 2 ; [Activation : Principale] [Une
  // fois par tour] épuiser 2 DON!! : avec un Leader {Équipage des cent bêtes}, 1 DON!! épuisée du deck DON!!
  'EB04-032': card({
    onPlay: withCost(discardCost(1, { type: AKP }), drawCards(2), 'Queen'),
    activateMain: {
      label: 'Queen : épuiser 2 DON!! pour ajouter 1 DON!! épuisée',
      once: true,
      cost: restDon(2),
      effect: when(akpLeader, addDon(1, 'rested')),
    },
  }),

  // Torche du dragon : [Principale] épuiser 6 DON!! : +3000 à un de ses [Kaido] pour le tour, puis épuiser un Personnage
  // adverse ; [Contre] DON!! −1 : son Leader +4000 pour le combat
  'EB04-040': card({
    onMain: withCost(restDon(6), seq(powerMod(ownLeaderOrChar({ name: 'Kaido' }), 3000, 'turn', 'Torche du dragon'), rest(oppChar(), 'Torche du dragon')),
      'Torche du dragon'),
    onCounter: withCost(donMinus(1), leaderBattleBoost(4000, 'Torche du dragon'), 'Torche du dragon'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Ramollo Beam Sword : [Contre] DON!! −1 : +2000 à la carte attaquée, puis épuiser un Personnage adverse ;
  // [Déclenchement] 1 DON!! redressée du deck DON!!
  'OP07-076': card({
    onCounter: withCost(donMinus(1), seq(effect((ctx) => counterBoost(ctx, 2000, 'Ramollo Beam Sword')), ramolloRest), 'Ramollo Beam Sword'),
    onTrigger: addDon(1, 'active'),
  }, { counterExtra: (s, p) => donOnField(s, p) >= 1 && ramolloRest.useful(s, p, -1) }),

  // We're Going to Claim the One Piece!!! : [Principale] avec un Leader {Équipage des cent bêtes} ou {Équipage de Big
  // Mom}, 5 cartes du dessus, 1 carte de l'un de ces types ; [Déclenchement] activer son [Principale]
  'OP07-077': card({
    onMain: when(any(leaderType(AKP), leaderType(BMP)), effect((ctx) => {
      lookTopPick(ctx, 5, 1, (n) => def(n).types.includes(AKP) || def(n).types.includes(BMP), 'une carte {Équipage des cent bêtes} ou {Équipage de Big Mom}');
    }, (s, p) => s.players[p].deck.length > 0)),
  }),

  // Black Maria : [Activation : Principale] [Une fois par tour] sans autre [Black Maria], jusqu'à 5 DON!! épuisées du deck
  // DON!! ; à la fin du tour, renvoyer des DON!! jusqu'à en avoir autant que l'adversaire sur le terrain
  'OP08-074': card({
    activateMain: {
      label: 'Black Maria : ajouter 5 DON!! épuisées (à la fin du tour, autant de DON!! que l’adversaire)',
      once: true,
      condition: (s, p) => named(s, p, 'Black Maria') === 1,
      effect: seq(addDon(5, 'rested'), effect((ctx) => {
        addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'matchDon', amount: 0 });
      })),
    },
  }),

  // Les Superstars : [Jouée] DON!! −1 : avec un Leader {Équipage des cent bêtes}, la carte du dessus du deck au-dessus de
  // la Vie ; [Activation : Principale] se placer dans la Défausse : jouer de sa main un [King], [Queen] ou [Jack]
  'OP17-061': card({
    onPlay: withCost(donMinus(1), when(akpLeader, lifeFromDeck()), 'Les Superstars'),
    activateMain: {
      label: 'Les Superstars : se placer dans la Défausse pour jouer un [King], [Queen] ou [Jack] de ta main',
      cost: trashSelf(),
      effect: effect((ctx) => {
        playCharFromHand(ctx, (c) => def(c.num).names.some((n) => ['King', 'Queen', 'Jack'].includes(n)),
          'Les Superstars : jouer jusqu’à 1 [King], [Queen] ou [Jack] de ta main :');
      }, (s, p) => s.players[p].hand.some((c) => def(c.num).category === 'CHARACTER' && def(c.num).names.some((n) => ['King', 'Queen', 'Jack'].includes(n)))),
    },
  }),

  // Kaido (OP17-062) : [Bloqueur] ; [Votre tour] [Une fois par tour] quand une DON!! de son terrain retourne au deck
  // DON!!, 1 DON!! redressée du deck DON!!, puis redresser 1 DON!!
  'OP17-062': {
    when: [{
      on: 'donReturned',
      once: 'kaidoDon',
      if: (s, owner, self, e) => e.player === owner && s.active === owner && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => seq(addDon(1, 'active'), readyDon(1)).run(ctx),
    }],
  },

  // Kaido (OP17-063) : Contre +1000 aux Personnages sans Contre de sa main ; [Activation : Principale] [Une fois par
  // tour] DON!! −1 : le tour où il est joué, annuler les effets d'un Personnage adverse de coût 6 ou moins et le mettre KO
  'OP17-063': card({
    activateMain: {
      label: 'Kaido : DON!! −1 pour annuler les effets d’un Personnage adverse de coût 6 ou moins et le mettre KO',
      once: true,
      condition: (s, _p, self) => findField(s, self)?.card.playedTurn === s.turn,
      cost: donMinus(1),
      effect: negateAndKo,
    },
  }, { handCounterAura: () => 1000 }),

  // Queen (OP17-065) : [Exil] ; [Jouée] DON!! −1 : piocher 1, et 2 Personnages adverses de coût 5 ou moins ne peuvent
  // pas attaquer jusqu'à la fin du prochain tour adverse
  'OP17-065': card({
    onPlay: withCost(donMinus(1), seq(drawCards(1), grant(oppChar({ costMax: 5 }), { stat: 'cantAttack' }, 'oppNextEnd', 'Queen', 'ne peut pas attaquer', 2)),
      'Queen'),
  }),

  // Sasaki : [En attaquant] défausser 2 cartes : avec un Leader {Équipage des cent bêtes}, 2 DON!! épuisées
  'OP17-068': card({ whenAttacking: withCost(discardCost(2), when(akpLeader, addDon(2, 'rested')), 'Sasaki') }),

  // Basil Hawkins : [Jouée] défausser 1 carte : avec un Leader {Équipage des cent bêtes}, 1 DON!! redressée
  'OP17-073': card({ onPlay: withCost(discardCost(1), when(akpLeader, addDon(1, 'active')), 'Basil Hawkins') }),
};
