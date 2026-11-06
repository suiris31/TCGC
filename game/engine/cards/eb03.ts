// EB03 (étape C, tâche S4) : les cartes que le traducteur ne comprend pas, ou qu'il comprend mal, codées à la main
// d'après le texte officiel (VO et VF, jamais recopié). Le reste du set est en recettes (recipes/sets/eb03.ts). Choix
// d'interprétation : game/docs/interpretations.md, section « EB03 et EB04 (tâche S4) ».
import {
  addMod, baseCost, chooseUpTo1, def, discardFromHand, emit, fieldCost, findField, hasType, log, myChars,
  playFromHandFree, reveal, uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  anyChar, bounce, card, cardMatches, discardCost, donMinus, drawCards, effect, ko, leaderNamed, leaderPower,
  myTurn, oppChar, oppHandAtLeast, oppHandToBottom, playFromHand, powerMod, restDon, restSelf, searchTop, seq, trashTop,
  when, withCost, type CharSpec, type Cost, type Effect,
} from './bricks.ts';
import { bottomOwnCost } from './bricks-removal.ts';
import { playFromHandOrTrash } from './bricks-play.ts';
import { isNamed } from './common.ts';

// « Vous pouvez [coût] : [effet] » proposé seulement si l'effet peut servir (convention n° 1000 des recettes)
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// [Contre] « Votre Leader gagne +N de puissance pendant ce combat » : l'IA connaît la valeur quand le Leader est attaqué
const leaderCounter = (amount: number, source: string): Effect => ({
  ...leaderPower(amount, 'battle', source),
  power: (s, p, target) => (target === s.players[p].leader.uid ? amount : 0),
});

const multicolorLeader = (s: GameState, p: PlayerId) => def(s.players[p].leader.num).colors.length >= 2;

// « Jouez jusqu'à 1 [nom] de votre main » quand ce nom est celui d'un Lieu (Zou, Onigashima Island) : le traducteur lit
// « Personnage » (playFromHand ne joue que des Personnages), d'où le code à la main
const playNamedFromHand = (name: string, source: string): Effect => effect((ctx) => {
  playFromHandFree(ctx, (c) => isNamed(c.num, name), `${source} : jouer jusqu’à 1 [${name}] de ta main :`);
}, (s, p) => s.players[p].hand.some((c) => isNamed(c.num, name)));

// « Activez l'effet [Principale] de jusqu'à 1 Événement ... de votre Défausse » (Reiju) : l'Événement reste dans la
// Défausse, son effet [Principale] se résout aussitôt (coût facultatif « vous pouvez ... : » compris, sans payer son coût
// de DON!!)
const activateEventFromTrash = (spec: CharSpec, source: string): Effect => {
  const eligible = (c: Card) => def(c.num).category === 'EVENT' && Boolean(def(c.num).onMain) && cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = uniqueByNum(P.trash.filter(eligible));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: `${source} : activer l’effet [Principale] de jusqu’à 1 Événement de ta Défausse :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const event = P.trash.find((c) => c.uid === Number(answer.split(':')[1]))!;
      log(ctx.s, ctx.me, `active l’effet [Principale] de ${def(event.num).name} (dans sa Défausse, ${source})`);
      emit(ctx.s, { type: 'event', player: ctx.me, uid: event.uid, num: event.num, timing: 'main' });
      def(event.num).onMain!({ ...ctx, source: event.uid, num: event.num });
    },
    useful: (s, p) => s.players[p].trash.some(eligible),
  };
};

// Vivi (Leader) : [Une fois par tour] remplacement du KO d'un de ses Personnages de coût de base 4 ou plus
const VIVI_KEY = 'viviReplace';

// Vivi (Leader) : « jusqu'à 1 de vos Personnages n'ayant pas d'effet [En attaquant] gagne [Initiative] » (texte imprimé)
const noWhenAttacking = (num: string) => !(def(num).effectEn ?? '').includes('[When Attacking]');
const rushWithoutWhenAttacking: Effect = effect((ctx) => {
  const uid = chooseUpTo1(ctx, myChars(ctx, (c) => noWhenAttacking(c.num)), 'Nefertari Vivi : Personnage sans effet [En attaquant] qui gagne [Initiative] pour le tour :', 'ownGrant');
  if (uid === null) return;
  addMod(ctx.s, { uid, stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source: 'Nefertari Vivi' });
  log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} gagne [Initiative] pour le tour (Nefertari Vivi)`);
}, (s, p) => s.players[p].chars.some((c) => noWhenAttacking(c.num)));

// Thriller Bark : « jouez jusqu'à 1 Personnage {Thriller Bark Pirates} de coût N ou moins de votre main ou Défausse »
const TB = 'Thriller Bark Pirates';

export const EB03: Record<string, CardBehavior> = {
  // Nefertari Vivi (Leader) : [Une fois par tour] si un de ses Personnages de coût de base 4 ou plus devait être mis KO,
  // défausser 1 carte à la place ; [Activation : Principale] s'épuiser : −2000 à un Personnage adverse pour le tour, puis
  // [Initiative] à un de ses Personnages sans effet [En attaquant]
  'EB03-001': card({
    activateMain: {
      label: 'Nefertari Vivi : t’épuiser pour donner −2000 à un Personnage adverse, puis [Initiative] à un de tes Personnages',
      cost: restSelf(),
      effect: seq(powerMod(oppChar(), -2000, 'turn', 'Nefertari Vivi'), rushWithoutWhenAttacking),
    },
  }, {
    koReplaceAlly: {
      label: (_s, _self, victim) => `Nefertari Vivi : défausser 1 carte de ta main pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, p, self, victim) => !self.usedOpt.includes(VIVI_KEY) && baseCost(victim.num) >= 4 && s.players[p].hand.length > 0,
      apply: (s, p, self, victim, ctx) => {
        self.usedOpt.push(VIVI_KEY);
        if (discardFromHand(ctx, p, 1, 'Nefertari Vivi : carte à défausser à la place du KO') === 1) log(s, p, `${def(victim.num).name} reste sur le terrain (Nefertari Vivi)`);
      },
    },
  }),

  // Monet : [Bloqueur] ; [Jouée] 5 cartes du dessus : 1 Personnage de 1000 de puissance ou moins, ou 1 Événement
  'EB03-010': card({
    onPlay: searchTop(5, 1, { anyOf: [{ categories: ['CHARACTER'], powerMax: 1000 }, { categories: ['EVENT'] }] }, 'un Personnage de 1000 de puissance ou moins ou un Événement'),
  }),

  // Carrot : [Activation : Principale] [Une fois par tour] si elle a été jouée ce tour, KO d'un Personnage adverse épuisé
  // de coût 5 ou moins ; puis jouer jusqu'à 1 [Zou] (un Lieu) de sa main (le « puis » n'est pas soumis à la condition)
  'EB03-013': card({
    activateMain: {
      label: 'Carrot : mettre KO un Personnage adverse épuisé (si jouée ce tour), puis jouer [Zou]',
      once: true,
      effect: seq(
        when((s, _p, self) => findField(s, self)?.card.playedTurn === s.turn, ko(oppChar({ costMax: 5, rested: true }), 'Carrot')),
        playNamedFromHand('Zou', 'Carrot'),
      ),
    },
  }),

  // Nefertari Vivi : [Bloqueur] ; [Jouée] jouer un Personnage {Alabasta} ou {Straw Hat Crew} de coût 5 ou moins de sa
  // main ; puis plus de carte Personnage jouée ce tour
  'EB03-024': card({
    onPlay: seq(
      playFromHand({ anyOf: [{ type: 'Alabasta' }, { type: 'Straw Hat Crew' }], costMax: 5 }, 'Nefertari Vivi'),
      effect((ctx) => {
        ctx.s.players[ctx.me].noCharsTurn = ctx.s.turn;
        log(ctx.s, ctx.me, 'ne peut plus jouer de carte Personnage ce tour-ci (Nefertari Vivi)');
      }),
    ),
  }),

  // Boa Hancock : [Jouée] si l'adversaire a 5 cartes ou plus en main, il en place 1 au-dessous de son deck ;
  // [Activation : Principale] [Une fois par tour] placer 1 de ses Personnages au-dessous du deck : 1 DON!! épuisée à son
  // Leader et 1 à un de ses Personnages
  'EB03-026': card({
    onPlay: when(oppHandAtLeast(5), oppHandToBottom(1, 'Boa Hancock')),
    activateMain: {
      label: 'Boa Hancock : placer un de tes Personnages au-dessous de ton deck pour donner 1 DON!! épuisée à ton Leader et à un Personnage',
      once: true,
      cost: bottomOwnCost(1, 'CHARACTER', {}),
      effect: effect((ctx) => {
        const P = ctx.s.players[ctx.me];
        if (P.donRested > 0) {
          P.donRested--;
          P.leader.don++;
          log(ctx.s, ctx.me, 'donne 1 DON!! épuisée à son Leader (Boa Hancock)');
        }
        if (P.donRested <= 0 || !P.chars.length) return;
        const uid = chooseUpTo1(ctx, P.chars.map((c) => c.uid), 'Boa Hancock : Personnage qui reçoit 1 DON!! épuisée :', 'donTarget');
        if (uid === null) return;
        P.donRested--;
        findField(ctx.s, uid)!.card.don++;
        log(ctx.s, ctx.me, `donne 1 DON!! épuisée à ${def(findField(ctx.s, uid)!.card.num).name} (Boa Hancock)`);
      }, (s, p) => s.players[p].donRested > 0),
    },
  }),

  // Margaret : [Jouée] renvoyer en main un Personnage (de l'un ou l'autre camp) de puissance de base 7000 exactement
  'EB03-027': card({ onPlay: bounce(anyChar({ basePowerMin: 7000, basePowerMax: 7000 }), 'Margaret') }),

  // Reiju Vinsmoke : [Votre tour] [Jouée] DON!! −1 : avec un Leader [Sanji], activer l'effet [Principale] d'un Événement
  // de coût 7 ou moins de sa Défausse
  'EB03-031': card({
    onPlay: when(myTurn, mayPay(donMinus(1), when(leaderNamed('Sanji'), activateEventFromTrash({ costMax: 7 }, 'Reiju Vinsmoke')), 'Reiju Vinsmoke')),
  }),

  // Kujaku : [Tour adverse] ses Personnages {SWORD} de coût 6 ou moins gagnent +2000 ; [Jouée] défausser 1 carte {Navy} :
  // piocher 2 cartes
  'EB03-041': card({
    onPlay: mayPay(discardCost(1, { type: 'Navy' }), drawCards(2), 'Kujaku'),
  }, {
    aura: (s, owner, _source, target) => (s.active !== owner && target.uid !== s.players[owner].leader.uid
      && s.players[owner].chars.some((c) => c.uid === target.uid) && hasType(target.num, 'SWORD') && fieldCost(s, target.uid) <= 6 ? 2000 : 0),
  }),

  // Black Maria : [Bloqueur] avec un Leader multicolore ; [Jouée] 5 cartes du dessus : 1 [Onigashima Island] ; puis
  // jouer jusqu'à 1 [Onigashima Island] (un Lieu) de sa main
  'EB03-044': card({
    onPlay: seq(
      searchTop(5, 1, { name: 'Onigashima Island' }, 'un [Onigashima Island]'),
      playNamedFromHand('Onigashima Island', 'Black Maria'),
    ),
  }, { blocker: (s, p) => multicolorLeader(s, p) }),

  // Miss Doublefinger (Zala) : [Jouée] s'il y a un Personnage (de l'un ou l'autre camp) de coût 0 ou de coût 8 ou plus,
  // piocher 1 carte ; [En cas de KO] les 2 cartes du dessus du deck dans la Défausse
  'EB03-046': card({
    onPlay: when((s) => s.players.some((P) => P.chars.some((c) => Math.max(0, fieldCost(s, c.uid)) === 0 || fieldCost(s, c.uid) >= 8)), drawCards(1)),
    onKO: trashTop(2),
  }),

  // Événement Thriller Bark : [Principale] épuiser 7 DON!! : avec un Leader [Perona], jouer de sa main ou de sa Défausse
  // jusqu'à 1 Personnage {Thriller Bark Pirates} de coût 6 ou moins et jusqu'à 1 de coût 4 ou moins ; [Contre] son Leader
  // gagne +3000 pour le combat
  'EB03-049': card({
    onMain: mayPay(restDon(7), when(leaderNamed('Perona'), seq(
      playFromHandOrTrash({ type: TB, costMax: 6 }, 'Perona'),
      playFromHandOrTrash({ type: TB, costMax: 4 }, 'Perona'),
    )), 'Événement Thriller Bark'),
    onCounter: leaderCounter(3000, 'Événement Thriller Bark'),
  }),

  // Charlotte Smoothie : [Jouée] si elle a une carte de Vie face visible, KO d'un Personnage adverse de coût 2 ou moins ;
  // puis toutes ses cartes de Vie face cachée (le « puis » n'est pas soumis à la condition)
  'EB03-051': card({
    onPlay: seq(
      when((s, p) => s.players[p].life.some((c) => c.faceUp), ko(oppChar({ costMax: 2 }), 'Charlotte Smoothie')),
      effect((ctx) => {
        const up = ctx.s.players[ctx.me].life.filter((c) => c.faceUp);
        if (!up.length) return;
        for (const c of up) c.faceUp = false;
        // retournées face cachée, les cartes restent connues des deux joueurs, qui les ont vues
        reveal(ctx.s, up.map((c) => c.uid), 'both');
        log(ctx.s, ctx.me, `retourne face cachée ${up.length} carte${up.length > 1 ? 's' : ''} de sa Vie (Charlotte Smoothie)`);
      }),
    ),
  }),
};
