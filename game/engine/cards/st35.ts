// DECK POUR DÉBUTANT -ROUGE/NOIR Sabo- [ST-35] : effets codés d'après le texte officiel français
import {
  RA, addMod, chooseUpTo1, def, draw, fieldCards, fieldCost, findField, giveRestedDon, hasType, koByEffect, leaderHasType,
  log, may, payDon, playCharacter, power, removeFromField, trashTopDeck,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';

const raLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, RA);
const hasCost8 = (s: GameState, p: PlayerId) => s.players[p].chars.some((c) => fieldCost(s, c.uid) >= 8);
const hasRaCost8 = (s: GameState, p: PlayerId) => s.players[p].chars.some((c) => hasType(c.num, RA) && fieldCost(s, c.uid) >= 8);

// « Donnez jusqu'à 1 carte DON!! épuisée à votre Leader » (toujours avantageux : appliqué d'office)
function restedDonToLeader(ctx: EffectCtx) {
  const P = ctx.s.players[ctx.me];
  if (P.donRested > 0) giveRestedDon(ctx.s, ctx.me, P.leader.uid);
}

// « Donnez jusqu'à 1 carte DON!! épuisée à votre Leader ou à 1 de vos Personnages »
function restedDonToLeaderOrCharacter(ctx: EffectCtx) {
  if (ctx.s.players[ctx.me].donRested <= 0) return;
  const target = chooseUpTo1(ctx, fieldCards(ctx.s, ctx.me).map((c) => c.uid), 'Donner 1 DON!! épuisée à :', 'donTarget');
  if (target !== null) giveRestedDon(ctx.s, ctx.me, target);
}

// Une seule option par carte différente (plusieurs exemplaires identiques dans la Défausse)
function uniqueByNum(cards: Card[]) {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.num) ? false : (seen.add(c.num), true)));
}

// Kuma, Koala ST35-004 : « jouez jusqu'à 1 carte Personnage de type {Armée révolutionnaire} de votre main ou votre
// Défausse ayant 4000 de puissance ou moins »
function playRevolutionaryFromHandOrTrash(ctx: EffectCtx) {
  const P = ctx.s.players[ctx.me];
  const eligible = (c: Card) => {
    const d = def(c.num);
    return d.category === 'CHARACTER' && d.types.includes(RA) && (d.power ?? 0) <= 4000;
  };
  const options = [
    ...uniqueByNum(P.hand.filter(eligible)).map((c) => ({ id: `hand:${c.uid}`, label: `${def(c.num).name} (main)`, uid: c.uid })),
    ...uniqueByNum(P.trash.filter(eligible)).map((c) => ({ id: `trash:${c.uid}`, label: `${def(c.num).name} (Défausse)`, uid: c.uid })),
  ];
  if (!options.length) return;
  const answer = ctx.ask({
    prompt: 'Jouer jusqu’à 1 Personnage {Armée révolutionnaire} de 4000 de puissance ou moins, depuis ta main ou ta Défausse :',
    options: [...options, { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
  });
  if (answer === 'none') return;
  const [zone, uid] = answer.split(':');
  const list = zone === 'hand' ? P.hand : P.trash;
  const [card] = list.splice(list.findIndex((c) => c.uid === Number(uid)), 1);
  playCharacter(ctx, ctx.me, card);
}

export const ST35: Record<string, CardBehavior> = {
  // Leader Sabo : −1000 avec 4 Vies ou plus ; [DON!! x1] avec un Personnage de coût 8 ou plus, +1000 à tout le monde
  'OP13-004': {
    selfPower: (s, p) => (s.players[p].life.length >= 4 ? -1000 : 0),
    aura: (s, p, source) => (source.don >= 1 && hasCost8(s, p) ? 1000 : 0),
  },

  // Emporio Ivankov : se défausse à la place d'un Personnage {Armée révolutionnaire} mis KO par un effet adverse
  'OP13-008': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: true,
      label: (_s, _self, victim) => `Emporio Ivankov : défausser Ivankov à la place de ${def(victim.num).name}`,
      condition: (_s, _p, self, victim) => victim.uid !== self.uid && hasType(victim.num, RA),
      apply: (s, p, self, victim) => {
        removeFromField(s, self.uid, 'trash');
        log(s, p, `place Emporio Ivankov dans sa Défausse à la place de ${def(victim.num).name}`);
      },
    },
  },

  // Belo Betty : [En attaquant] 2 cartes du deck à la Défausse : −2 de coût à 1 Personnage adverse pour le tour
  'OP12-090': {
    // le −2 de coût ne change pas l'issue du combat et aucune carte de ces decks n'en profite
    attackUseful: () => false,
    whenAttacking: (ctx) => {
      const opp = ctx.s.players[ctx.opp];
      if (!opp.chars.length || !ctx.s.players[ctx.me].deck.length) return;
      if (!may(ctx, 'Belo Betty : placer 2 cartes du dessus de ton deck dans ta Défausse pour donner −2 de coût à 1 Personnage adverse pour tout le tour ?', 'mayBetty')) return;
      trashTopDeck(ctx.s, ctx.me, 2);
      log(ctx.s, ctx.me, 'place 2 cartes du dessus de son deck dans sa Défausse (Belo Betty)');
      const target = chooseUpTo1(ctx, opp.chars.map((c) => c.uid), 'Personnage adverse qui reçoit −2 de coût pour tout le tour :', 'oppCost');
      if (target !== null) {
        addMod(ctx.s, { uid: target, stat: 'cost', amount: -2, until: 'turn', source: 'Belo Betty' });
        log(ctx.s, ctx.me, `${def(findField(ctx.s, target)!.card.num).name} reçoit −2 de coût pour le tour`);
      }
    },
  },

  // Corbeau : [En attaquant] 2 cartes du deck à la Défausse : si l'adversaire a 7 cartes ou plus en main, il en défausse 1
  'ST35-003': {
    attackUseful: (s, p) => s.players[p === 0 ? 1 : 0].hand.length >= 7,
    whenAttacking: (ctx) => {
      const me = ctx.s.players[ctx.me];
      const opp = ctx.s.players[ctx.opp];
      if (!me.deck.length) return;
      if (!may(ctx, `Corbeau : placer 2 cartes du dessus de ton deck dans ta Défausse ? Si l'adversaire a 7 cartes ou plus en main (il en a ${opp.hand.length}), il en défausse 1.`, 'mayCorbeau')) return;
      trashTopDeck(ctx.s, ctx.me, 2);
      log(ctx.s, ctx.me, 'place 2 cartes du dessus de son deck dans sa Défausse (Corbeau)');
      if (opp.hand.length >= 7) {
        const answer = ctx.ask({
          player: ctx.opp,
          prompt: 'Corbeau : défausse 1 carte de ta main.',
          options: opp.hand.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
          tag: 'discard',
        });
        const [card] = opp.hand.splice(opp.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
        opp.trash.push(card);
        log(ctx.s, ctx.opp, `défausse ${def(card.num).name}`);
      }
    },
  },

  // Morley : +4 de coût si le Leader est {Armée révolutionnaire}
  'OP12-093': {
    selfCost: (s, p) => (raLeader(s, p) ? 4 : 0),
  },

  // Inazuma : [Jouée] 1 DON!! épuisée au Leader
  'OP13-005': {
    onPlay: restedDonToLeader,
  },

  // Sabo (P-105) : [Bloqueur] et +4 de coût si Leader {Armée révolutionnaire} ; [Jouée] 1 carte de la Vie en main :
  // 1 DON!! épuisée au Leader ou à 1 Personnage
  'P-105': {
    blocker: (s, p) => raLeader(s, p),
    selfCost: (s, p) => (raLeader(s, p) ? 4 : 0),
    onPlay: (ctx) => {
      const P = ctx.s.players[ctx.me];
      if (!P.life.length) return;
      const answer = ctx.ask({
        prompt: `Sabo : ajouter à ta main 1 carte de ta Vie (il t'en reste ${P.life.length}) pour donner 1 DON!! épuisée à ton Leader ou à 1 Personnage ?`,
        options: [
          { id: 'top', label: 'Oui, la carte du dessus de ma Vie' },
          { id: 'bottom', label: 'Oui, la carte du dessous de ma Vie' },
          { id: 'no', label: 'Non' },
        ],
        tag: 'lifeToHand',
      });
      if (answer === 'no') return;
      const card = answer === 'top' ? P.life.shift()! : P.life.pop()!;
      P.hand.push({ uid: card.uid, num: card.num });
      log(ctx.s, ctx.me, `ajoute 1 carte de sa Vie à sa main (il lui reste ${P.life.length} Vie)`);
      restedDonToLeaderOrCharacter(ctx);
    },
  },

  // Hack : [Bloqueur] ; [Jouée] KO 1 Personnage adverse de 2000 de puissance de base ou moins
  'ST35-001': {
    blocker: () => true,
    onPlay: (ctx) => {
      const targets = ctx.s.players[ctx.opp].chars.filter((c) => (def(c.num).power ?? 0) <= 2000).map((c) => c.uid);
      const target = chooseUpTo1(ctx, targets, 'Hack : mettre KO jusqu’à 1 Personnage adverse de 2000 de puissance de base ou moins :', 'oppKo');
      if (target !== null) koByEffect(ctx, target);
    },
  },

  // Lindbergh : [Jouée] −3000 de puissance à 1 Personnage adverse pour le tour
  'ST35-002': {
    onPlay: (ctx) => {
      const targets = ctx.s.players[ctx.opp].chars.map((c) => c.uid);
      const target = chooseUpTo1(ctx, targets, 'Lindbergh : Personnage adverse qui reçoit −3000 de puissance pour tout le tour :', 'oppPower');
      if (target !== null) {
        addMod(ctx.s, { uid: target, stat: 'power', amount: -3000, until: 'turn', source: 'Lindbergh' });
        log(ctx.s, ctx.me, `${def(findField(ctx.s, target)!.card.num).name} reçoit −3000 de puissance pour le tour`);
      }
    },
  },

  // Koala (OP13-081) : +3 de coût si Leader {Armée révolutionnaire} ; [Activation : Principale] [Une fois par tour]
  // 1 carte de la Défausse sous le deck : 1 DON!! épuisée au Leader ou à 1 Personnage
  'OP13-081': {
    selfCost: (s, p) => (raLeader(s, p) ? 3 : 0),
    activateMain: {
      oncePerTurn: true,
      label: 'Koala : placer 1 carte de ta Défausse sous ton deck, puis donner 1 DON!! épuisée',
      canActivate: (s, p) => s.players[p].trash.length > 0,
      run: (ctx, card) => {
        const P = ctx.s.players[ctx.me];
        if (!P.trash.length) return;
        const answer = ctx.ask({
          prompt: 'Koala : quelle carte de ta Défausse placer au-dessous de ton deck ?',
          options: [
            ...uniqueByNum(P.trash).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
            { id: 'none', label: 'Annuler' },
          ],
          tag: 'trashToDeck',
        });
        if (answer === 'none') return;
        card.usedOpt.push('main');
        const [moved] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
        P.deck.push(moved);
        log(ctx.s, ctx.me, `place ${def(moved.num).name} de sa Défausse au-dessous de son deck (Koala)`);
        restedDonToLeaderOrCharacter(ctx);
      },
    },
  },

  // Bartholomew Kuma : +3 de coût ; [Jouée] 1 DON!! épuisée au Leader, puis joue 1 Personnage {Armée révolutionnaire}
  // de 4000 ou moins depuis la main ou la Défausse
  'ST35-005': {
    selfCost: () => 3,
    onPlay: (ctx) => {
      restedDonToLeader(ctx);
      playRevolutionaryFromHandOrTrash(ctx);
    },
  },

  // Monkey D. Dragon : [Une fois par tour] si un Personnage {Armée révolutionnaire} quitte le terrain à cause d'un effet
  // adverse, Dragon reçoit −2000 de puissance pour le tour à la place
  'OP13-017': {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Monkey D. Dragon : Dragon reçoit −2000 de puissance pour le tour, ${def(victim.num).name} reste sur le terrain`,
      condition: (_s, _p, _self, victim) => hasType(victim.num, RA),
      apply: (s, p, self, victim) => {
        addMod(s, { uid: self.uid, stat: 'power', amount: -2000, until: 'turn', source: 'Monkey D. Dragon' });
        log(s, p, `Monkey D. Dragon reçoit −2000 de puissance : ${def(victim.num).name} reste sur le terrain`);
      },
    },
  },

  // Koala (ST35-004) : [Bloqueur] et +1 de coût ; [Jouée] comme Kuma
  'ST35-004': {
    blocker: () => true,
    selfCost: () => 1,
    onPlay: (ctx) => {
      restedDonToLeader(ctx);
      playRevolutionaryFromHandOrTrash(ctx);
    },
  },

  // Pointe dépilatoire : [Contre] +2000 (et +2000 de plus avec un {Armée révolutionnaire} de coût 8 ou plus) ;
  // [Déclenchement] pioche 1 et 1 carte du deck à la Défausse
  'OP12-098': {
    onCounter: (ctx) => {
      const target = Number(ctx.pending.data?.target);
      const f = findField(ctx.s, target);
      if (!f || f.player !== ctx.me) return;
      const bonus = hasRaCost8(ctx.s, ctx.me) ? 4000 : 2000;
      addMod(ctx.s, { uid: target, stat: 'power', amount: bonus, until: 'battle', source: 'Pointe dépilatoire' });
      log(ctx.s, ctx.me, `${def(f.card.num).name} gagne +${bonus} de puissance pour le combat (Pointe dépilatoire)`);
    },
    onTrigger: (ctx) => {
      draw(ctx.s, ctx.me, 1);
      trashTopDeck(ctx.s, ctx.me, 1);
      log(ctx.s, ctx.me, 'pioche 1 carte et place 1 carte du dessus de son deck dans sa Défausse');
    },
  },

  // Les flammes d'Ace : [Principale] épuiser 4 DON!! : −3000 à 1 Personnage adverse puis KO 1 Personnage adverse de 3000
  // ou moins ; [Contre] Leader +3000 pour le combat
  'OP13-019': {
    mainUseful: (s, p) => s.players[p].donActive >= 5 && s.players[p === 0 ? 1 : 0].chars.length > 0,
    counterUseful: (s, p, target) => target === s.players[p].leader.uid,
    onMain: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const opp = ctx.s.players[ctx.opp];
      if (P.donActive < 4 || !may(ctx, 'Épuiser 4 DON!! pour donner −3000 de puissance à 1 Personnage adverse, puis mettre KO 1 Personnage adverse de 3000 de puissance ou moins ?', 'mayAce')) {
        log(ctx.s, ctx.me, 'l’effet de Les flammes d’Ace n’est pas appliqué');
        return;
      }
      payDon(ctx.s, ctx.me, 4);
      const weakened = chooseUpTo1(ctx, opp.chars.map((c) => c.uid), 'Personnage adverse qui reçoit −3000 de puissance pour tout le tour :', 'oppPower');
      if (weakened !== null) {
        addMod(ctx.s, { uid: weakened, stat: 'power', amount: -3000, until: 'turn', source: 'Les flammes d’Ace' });
        log(ctx.s, ctx.me, `${def(findField(ctx.s, weakened)!.card.num).name} reçoit −3000 de puissance pour le tour`);
      }
      const targets = opp.chars.filter((c) => power(ctx.s, c.uid) <= 3000).map((c) => c.uid);
      const ko = chooseUpTo1(ctx, targets, 'Mettre KO jusqu’à 1 Personnage adverse de 3000 de puissance ou moins :', 'oppKo');
      if (ko !== null) koByEffect(ctx, ko);
    },
    onCounter: (ctx) => {
      const leader = ctx.s.players[ctx.me].leader;
      addMod(ctx.s, { uid: leader.uid, stat: 'power', amount: 3000, until: 'battle', source: 'Les flammes d’Ace' });
      log(ctx.s, ctx.me, 'son Leader gagne +3000 de puissance pour le combat (Les flammes d’Ace)');
    },
  },
};
