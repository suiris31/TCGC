// DECK POUR DÉBUTANT EX -Ace & Newgate- [ST-22] : cartes codées d'après leur texte officiel (VF). Elmy, les frères
// Decalvan, Vista, Portgas D. Ace, Little Oz Junior et A.O n'ont que des mots-clés ou rien. Les choix d'interprétation
// sont dans game/docs/interpretations.md.
import {
  addMod, def, discardFromHand, drawAndDiscard, findField, knownFirst, lifeToHand, log, reveal, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, EffectCtx } from '../types.ts';
import {
  anyChar, bothCosts, bottomOfDeck, bounce, card, drawCards, effect, giveDon, handToBottom, leaderTypeIncludes, myTurn,
  ownLeader, ownLeaderOrChar, playFromHand, powerMod, restDon, returnOwnChar, revealCost, revealTop, searchTop, seq, trashSelf, when,
  withCost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const WB = 'Whitebeard Pirates';  // « Équipage de Barbe Blanche »
const wbType = (num: string) => def(num).types.some((t) => t.includes(WB));
const wbLeader = leaderTypeIncludes(WB);

// Leader Ace & Newgate : révéler 1 carte « Équipage de Barbe Blanche » de sa main, piocher 1 carte, puis placer la carte
// révélée au-dessus de son deck (les deux joueurs savent quelle carte est au-dessus)
const aceNewgateLeader: Effect = {
  run: (ctx: EffectCtx) => {
    const P = ctx.s.players[ctx.me];
    const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => wbType(c.num))));
    if (!options.length) return;
    const answer = ctx.ask({
      prompt: 'Ace et Newgate : carte « Équipage de Barbe Blanche » à révéler (elle ira au-dessus de ton deck) :',
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: 'Aucune' }],
      tag: 'revealCost',
    });
    if (answer === 'none') return;
    const uid = Number(answer.split(':')[1]);
    reveal(ctx.s, [uid], ctx.opp);
    log(ctx.s, ctx.me, `révèle ${def(P.hand.find((c) => c.uid === uid)!.num).name} de sa main`);
    drawCards(1).run(ctx);
    const i = P.hand.findIndex((c) => c.uid === uid);
    if (i < 0) return;
    const [shown] = P.hand.splice(i, 1);
    P.deck.unshift(shown);
    reveal(ctx.s, [shown.uid], 'both');
    log(ctx.s, ctx.me, `place ${def(shown.num).name} au-dessus de son deck`);
  },
  useful: (s, p) => s.players[p].hand.some((c) => wbType(c.num)),
};

// « Je suis "Barbe Blanche" !! » : avec un Leader « Équipage de Barbe Blanche », jouer un [Edward Newgate] de sa main ;
// puis, s'il le veut, ajouter à sa main la carte du dessus ou du dessous de sa Vie : son Leader gagne alors +2000
// jusqu'à la fin du prochain tour adverse
const iAmWhitebeard: Effect = seq(
  when(wbLeader, playFromHand({ name: 'Edward.Newgate' }, 'Je suis "Barbe Blanche" !!')),
  effect((ctx) => {
    const P = ctx.s.players[ctx.me];
    if (!P.life.length) return;
    const answer = ctx.ask({
      prompt: `Je suis "Barbe Blanche" !! : ajouter à ta main 1 carte de ta Vie (il t'en reste ${P.life.length}) pour donner +2000 à ton Leader jusqu'à la fin du prochain tour adverse ?`,
      options: [
        { id: 'top', label: 'Oui, la carte du dessus de ma Vie' },
        { id: 'bottom', label: 'Oui, la carte du dessous de ma Vie' },
        { id: 'no', label: 'Non' },
      ],
      tag: 'lifeToHand',
    });
    if (answer === 'no' || !lifeToHand(ctx.s, ctx.me, answer === 'top' ? 'top' : 'bottom')) return;
    const leader = P.leader;
    addMod(ctx.s, { uid: leader.uid, stat: 'power', amount: 2000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Je suis "Barbe Blanche" !!' });
    log(ctx.s, ctx.me, 'son Leader gagne +2000 de puissance jusqu’à la fin du prochain tour adverse (Je suis "Barbe Blanche" !!)');
  }, (s, p) => s.players[p].life.length > 0),
);

export const ST22: Record<string, CardBehavior> = {
  // Leader Ace et Newgate : [Activation : Principale] [Une fois par tour]
  'ST22-001': card({
    activateMain: {
      label: 'Ace et Newgate : révéler 1 carte « Équipage de Barbe Blanche » de ta main pour piocher 1 carte',
      once: true,
      condition: (s, p) => s.players[p].hand.some((c) => wbType(c.num)),
      effect: aceNewgateLeader,
    },
  }),

  // Izo : [Jouée] 5 cartes du dessus, 1 carte « Équipage de Barbe Blanche » autre que [Izo] ; [Attaque adverse] se placer
  // dans la Défausse : piocher 1 carte et placer 1 carte de sa main au-dessous de son deck
  'ST22-002': card({
    onPlay: searchTop(5, 1, { typeIncludes: WB, notName: 'Izo' }, 'une carte « Équipage de Barbe Blanche » autre que [Izo]'),
    onOpponentAttack: withCost(trashSelf(), seq(drawCards(1), handToBottom(1, 'Izo')), 'Izo'),
  }),

  // Edward Newgate (ST22-003) : [Double attaque] ; [Jouée] révéler la carte du dessus : piocher 2 si elle est « Équipage
  // de Barbe Blanche »
  'ST22-003': card({ onPlay: revealTop(wbType, drawCards(2), 'Edward Newgate') }),

  // Oden Kozuki : s'il devait quitter le terrain à cause d'un effet adverse, défausser 2 cartes à la place ;
  // [Activation : Principale] [Une fois par tour] épuiser 3 DON!! et renvoyer un autre de ses Personnages dans sa main :
  // se redresser
  'ST22-005': card({
    activateMain: {
      label: 'Oden Kozuki : épuiser 3 DON!! et renvoyer un autre de tes Personnages dans ta main pour redresser Oden',
      once: true,
      condition: (s, _p, self) => Boolean(findField(s, self)?.card.rested),
      cost: bothCosts(restDon(3), returnOwnChar(true)),
      effect: effect((ctx) => {
        const f = findField(ctx.s, ctx.source);
        if (!f || !f.card.rested) return;
        f.card.rested = false;
        log(ctx.s, ctx.me, 'redresse Oden Kozuki');
      }),
    },
  }, {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: () => 'Oden Kozuki : défausser 2 cartes de ta main pour qu’Oden reste sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].hand.length >= 2,
      apply: (_s, p, _self, _victim, ctx) => { discardFromHand(ctx, p, 2, 'Oden Kozuki : carte à défausser'); },
    },
  }),

  // Joz : [Jouée] révéler la carte du dessus : si elle est « Équipage de Barbe Blanche », piocher 2 et défausser 1
  'ST22-006': card({ onPlay: revealTop(wbType, effect((ctx) => drawAndDiscard(ctx, 2, 1)), 'Joz') }),

  // Squardo : [Activation : Principale] [Une fois par tour] révéler la carte du dessus : si elle est « Équipage de Barbe
  // Blanche », 1 DON!! épuisée à son Leader ou à un Personnage
  'ST22-007': card({
    activateMain: {
      label: 'Squardo : révéler la carte du dessus de ton deck',
      once: true,
      effect: revealTop(wbType, giveDon(ownLeaderOrChar(), 1, 'Squardo'), 'Squardo'),
    },
  }),

  // Whitey Bay : [Votre tour] [Jouée] révéler 2 cartes « Équipage de Barbe Blanche » de sa main : son Leader « Équipage
  // de Barbe Blanche » gagne +2000 pour le tour
  'ST22-011': card({
    onPlay: when(myTurn, withCost(revealCost(2, { typeIncludes: WB }), when(wbLeader, powerMod(ownLeader(), 2000, 'turn', 'Whitey Bay')), 'Whitey Bay')),
  }),

  // Marco (ST22-012) : [Une fois par tour] s'il devait être mis KO par un effet adverse, défausser 1 carte à la place ;
  // [En attaquant] révéler la carte du dessus : si elle est « Équipage de Barbe Blanche », +1000 jusqu'à la fin du
  // prochain tour adverse
  'ST22-012': card({
    whenAttacking: revealTop(wbType, effect((ctx) => {
      const f = findField(ctx.s, ctx.source);
      if (!f) return;
      addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 1000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Marco' });
      log(ctx.s, ctx.me, 'Marco gagne +1000 de puissance jusqu’à la fin du prochain tour adverse');
    }), 'Marco'),
  }, {
    attackUseful: () => false,
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: true,
      label: () => 'Marco : défausser 1 carte de ta main pour que Marco ne soit pas mis KO',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].hand.length >= 1,
      apply: (_s, p, _self, _victim, ctx) => { discardFromHand(ctx, p, 1, 'Marco : carte à défausser'); },
    },
  }),

  // « Je suis "Barbe Blanche" !! » : [Principale]
  'ST22-015': card({ onMain: iAmWhitebeard }),

  // « Retire immédiatement... ce que tu viens de dire !! » : [Contre] révéler la carte du dessus : si elle est
  // « Équipage de Barbe Blanche », +4000 pour le combat ; [Déclenchement] piocher 1 carte
  'ST22-016': card({
    onCounter: revealTop(wbType, effect((ctx) => counterBoost(ctx, 4000, 'Retire immédiatement...')), 'Retire immédiatement...'),
    onTrigger: drawCards(1),
  }),

  // Poing ardent : [Principale] révéler 2 cartes « Équipage de Barbe Blanche » de sa main : piocher 1 carte, puis placer
  // au-dessous du deck de son propriétaire un Personnage de coût 5 ou moins ; [Déclenchement] renvoyer dans la main de
  // son propriétaire un Personnage de coût 3 ou moins
  'ST22-017': card({
    onMain: withCost(revealCost(2, { typeIncludes: WB }), seq(drawCards(1), bottomOfDeck(anyChar({ costMax: 5 }), 'Poing ardent')), 'Poing ardent'),
    onTrigger: bounce(anyChar({ costMax: 3 }), 'Poing ardent'),
  }),
};
