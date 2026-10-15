// DECK POUR DÉBUTANT EX -Luffy & Ace- [ST-30] : cartes codées d'après leur texte officiel (VF). Joz et Mr 2 Bonclay
// n'ont pas d'effet. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  basePower, canBeRested, canPlayCharacters, chooseUpTo1, def, draw, drawAndDiscard, giveRestedDon, log, playCharacter,
  removeFromField,
} from '../rules.ts';
import type { CardBehavior, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  card, charsAtLeast, discardCost, drawCards, effect, keepRested, ko, oppChar, powerMod, rest, restDon, restSelf, revealCost,
  searchTop, selfKeyword, seq, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost, isNamed } from './common.ts';

const ACE = 'Portgas.D.Ace';
const LUFFY = 'Monkey.D.Luffy';
// « carte Personnage ayant 6000 de puissance » (main, deck) ; « Personnage ayant 6000 de puissance de base » (terrain)
const SIX = { category: 'CHARACTER' as const, powerMin: 6000, powerMax: 6000 };
const six = (s: GameState, uid: number) => basePower(s, uid) === 6000;
// un Personnage [Portgas D. Ace] et un Personnage [Monkey D. Luffy] de 6000 de puissance de base
const aceAndLuffy = (s: GameState, p: PlayerId) => [ACE, LUFFY].every((n) => s.players[p].chars.some((c) => isNamed(c.num, n) && six(s, c.uid)));
const ownChar = (s: GameState, p: PlayerId, c: FieldCard) => s.players[p].chars.some((x) => x.uid === c.uid);

// « Regardez 5 cartes du dessus de votre deck, révélez jusqu'à 1 carte Personnage ayant 6000 de puissance »
const searchSix = searchTop(5, 1, SIX, 'un Personnage de 6000 de puissance');

// [Jouée] « Vous pouvez épuiser 1 de vos cartes DON!! : ce Personnage gagne [Initiative] pour tout le tour »
const rushForDon = (source: string): Effect => withCost(restDon(1), selfKeyword('Rush', source), source);

// « Si un de vos Personnages ayant 6000 de puissance de base quitte le terrain à cause d'un effet adverse, ... à la
// place » (Little Oz Junior, Baggy)
const protectsSix = (s: GameState, self: FieldCard, victim: FieldCard) => victim.uid !== self.uid && six(s, victim.uid);

export const ST30: Record<string, CardBehavior> = {
  // Leader Luffy et Ace : −2000 avec un Personnage de 7000 de puissance de base ou plus ; [Tour adverse] ses [Portgas D.
  // Ace] et [Monkey D. Luffy] gagnent +3000
  'ST30-001': {
    selfPower: (s, p) => (s.players[p].chars.some((c) => basePower(s, c.uid) >= 7000) ? -2000 : 0),
    aura: (s, p, _src, target) => (s.active !== p && (isNamed(target.num, ACE) || isNamed(target.num, LUFFY)) ? 3000 : 0),
  },

  // Inazuma : [Jouée] 5 cartes du dessus, 1 Personnage de 6000 de puissance
  'ST30-002': card({ onPlay: searchSix }),

  // Edward Newgate (ST30-003) : [Votre tour] ses Personnages de 6000 de puissance de base gagnent +1000
  'ST30-003': { aura: (s, p, _src, target) => (s.active === p && ownChar(s, p, target) && six(s, target.uid) ? 1000 : 0) },

  // Emporio Ivankov : [Jouée] révéler 2 Personnages de 6000 de puissance de sa main : piocher 3, défausser 2
  'ST30-004': card({
    onPlay: withCost(revealCost(2, SIX), effect((ctx) => drawAndDiscard(ctx, 3, 2), (s, p) => s.players[p].deck.length > 0), 'Emporio Ivankov'),
  }),

  // Jinbe : [Jouée] défausser 1 Personnage de 6000 de puissance : piocher 2
  'ST30-006': card({ onPlay: withCost(discardCost(1, SIX), drawCards(2), 'Jinbe') }),

  // Portgas D. Ace (ST30-007) : [Jouée] épuiser 1 DON!! : [Initiative] pour le tour ; [En attaquant] −1000 à un
  // Personnage adverse pour le tour
  'ST30-007': card({
    onPlay: rushForDon('Portgas D. Ace'),
    whenAttacking: powerMod(oppChar(), -1000, 'turn', 'Portgas D. Ace'),
  }),

  // Marco (ST30-008) : [Bloqueur] ; [En cas de KO] défausser 1 Personnage de 6000 de puissance : se jouer épuisé depuis
  // la Défausse
  'ST30-008': card({
    onKO: withCost(discardCost(1, SIX), effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      const i = P.trash.findIndex((c) => c.uid === ctx.source);
      if (i < 0 || !canPlayCharacters(ctx.s, ctx.me, P.trash[i].num)) return;
      const [self] = P.trash.splice(i, 1);
      playCharacter(ctx, ctx.me, self, { rested: true });
    }, (s, p, self) => canPlayCharacters(s, p) && s.players[p].trash.some((c) => c.uid === self)), 'Marco'),
  }),

  // Little Oz Junior (ST30-009) : à la place d'un de ses Personnages de 6000 de puissance de base qui quitterait le
  // terrain à cause d'un effet adverse, se placer dans la Défausse et piocher 1 carte
  'ST30-009': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Little Oz Junior : placer Little Oz Junior dans ta Défausse et piocher 1 carte, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, _p, self, victim) => protectsSix(s, self, victim),
      apply: (s, p, self, victim) => {
        removeFromField(s, self.uid, 'trash');
        log(s, p, `place Little Oz Junior dans sa Défausse à la place de ${def(victim.num).name}`);
        draw(s, p, 1);
        log(s, p, 'pioche 1 carte');
      },
    },
  },

  // Crocodile : [Bloqueur] ; [Jouée] un Personnage adverse épuisé ne se redressera pas à la prochaine phase de Recharge
  // adverse
  'ST30-010': card({ onPlay: keepRested(oppChar(), 'Crocodile', 1) }),

  // Baggy (ST30-011) : [Bloqueur] ; à la place d'un de ses Personnages de 6000 de puissance de base qui quitterait le
  // terrain à cause d'un effet adverse, s'épuiser
  'ST30-011': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Baggy : épuiser Baggy, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, _p, self, victim) => protectsSix(s, self, victim) && !self.rested && canBeRested(s, self.uid),
      apply: (s, p, self, victim) => {
        self.rested = true;
        log(s, p, `épuise Baggy à la place de ${def(victim.num).name}`);
      },
    },
  },

  // Monkey D. Luffy (ST30-012) : [Jouée] épuiser 1 DON!! : [Initiative] pour le tour ; [En attaquant] épuiser un
  // Personnage adverse ayant [Bloqueur]
  'ST30-012': card({
    onPlay: rushForDon('Monkey D. Luffy'),
    whenAttacking: rest(oppChar({ keyword: 'Blocker' }), 'Monkey D. Luffy'),
  }),

  // Mr 3 (Galdino) : [Activation : Principale] s'épuiser : jusqu'à 2 de ses Personnages de 6000 de puissance de base
  // reçoivent chacun jusqu'à 2 DON!! épuisées
  'ST30-014': card({
    activateMain: {
      label: 'Mr 3 : épuiser Mr 3 pour donner jusqu’à 2 DON!! épuisées à 2 de tes Personnages de 6000 de puissance de base',
      cost: restSelf(),
      effect: effect((ctx) => {
        const P = ctx.s.players[ctx.me];
        const chosen: number[] = [];
        for (let i = 0; i < 2 && P.donRested > 0; i++) {
          const left = P.chars.filter((c) => six(ctx.s, c.uid) && !chosen.includes(c.uid)).map((c) => c.uid);
          const uid = chooseUpTo1(ctx, left, `Mr 3 : Personnage de 6000 de puissance de base qui reçoit jusqu’à 2 DON!! épuisées (${i + 1}/2) :`, 'donTarget');
          if (uid === null) break;
          chosen.push(uid);
          giveRestedDon(ctx.s, ctx.me, uid, 2);
        }
      }, (s, p) => s.players[p].donRested > 0 && s.players[p].chars.some((c) => six(s, c.uid))),
    },
  }),

  // « Cette ère... c'est celle de Barbe Blanche !! » : [Contre] avec 2 Personnages ou plus de 6000 de puissance de
  // base, +4000 pour le combat ; [Déclenchement] KO d'un Personnage adverse de 6000 de puissance ou moins
  'ST30-015': card({
    onCounter: when(charsAtLeast(2, { basePowerMin: 6000, basePowerMax: 6000 }), effect((ctx) => counterBoost(ctx, 4000, 'Cette ère... c’est celle de Barbe Blanche !!'))),
    onTrigger: ko(oppChar({ powerMax: 6000 }), 'Cette ère... c’est celle de Barbe Blanche !!'),
  }, { counterUseful: (s, p) => charsAtLeast(2, { basePowerMin: 6000, basePowerMax: 6000 })(s, p, -1) }),

  // « Prêt à te battre, Luffy ?! Moi ? Toujours ! » : [Contre] +3000 pour le combat, puis piocher 1 carte avec un
  // Personnage [Portgas D. Ace] et un Personnage [Monkey D. Luffy] de 6000 de puissance de base
  'ST30-016': card({
    onCounter: seq(effect((ctx) => counterBoost(ctx, 3000, 'Prêt à te battre, Luffy ?!')), when(aceAndLuffy, drawCards(1))),
  }, { counterExtra: aceAndLuffy }),

  // « Tu fonces toujours tête baissée vers le danger !! » : [Principale] et [Déclenchement] 5 cartes du dessus, 1
  // Personnage de 6000 de puissance
  'ST30-017': card({ onMain: searchSix, onTrigger: searchSix }),
};
