// FAMILLE DU LEADER KAIDO (phase 4E) : cartes violettes {Équipage des cent bêtes} et {Quatre Empereurs} jouables en
// format Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Beaucoup
// jouent avec les DON!! (DON!! −X, DON!! ajoutées du deck DON!!). Chaque condition se vérifie dans la partie. Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, bottomOrder, declareAndReveal, def, donOnField, log, power, removeByEffect, removeFromField, returnDon, setActive,
} from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  addDon, any, bothCosts, card, discardCost, donMinus, drawCards, effect, ko, leaderType, oppChar, onceWithCost, ownLeaderOrChar, powerMod,
  rest, restDon, selfKeyword, seq, trashFromOppHand, trashSelf, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost, isNamed, playCharFromHand } from './common.ts';

const AKP = 'Animal Kingdom Pirates';  // {Équipage des cent bêtes}
const BMP = 'Big Mom Pirates';         // {Équipage de Big Mom}
const akpLeader = leaderType(AKP);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const leaderBattle = (amount: number, source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
});
const protectsLeader = (s: GameState, p: PlayerId, target: number) => target === s.players[p].leader.uid;
const tenDon = (s: GameState, p: PlayerId) => donOnField(s, p) >= 10;

// « [Attaque adverse] [Une fois par tour] Vous pouvez défausser 1 carte : +X pour le combat à son Leader ou un Personnage »
const defend = (key: string, amount: number, source: string) => onceWithCost(key, discardCost(1), powerMod(ownLeaderOrChar(), amount, 'battle', source), source);

// « Épuisez N DON!! et défaussez 2 cartes : avec un Leader {Équipage des cent bêtes}, 3 DON!! épuisées du deck DON!! »
const dragonDon = (rested: number, source: string): Effect => withCost(bothCosts(restDon(rested), discardCost(2)), when(akpLeader, addDon(3, 'rested')), source);

// Luffy (OP05-119) : ses autres Personnages sous son deck (ordre au choix), puis un tour supplémentaire
const luffyExtraTurn: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const others = P.chars.filter((c) => c.uid !== ctx.source).map((c) => ({ uid: c.uid, num: c.num }));
  const ordered = bottomOrder(ctx, others);
  for (const c of ordered) removeFromField(ctx.s, c.uid, 'deckBottom');
  if (ordered.length) log(ctx.s, ctx.me, `place ${ordered.map((c) => def(c.num).name).join(', ')} au-dessous de son deck`);
  P.extraTurn = ctx.s.turn;
  log(ctx.s, ctx.me, 'jouera un tour supplémentaire après celui-ci (Monkey D. Luffy)');
});

// Kaido & Linlin : KO de tous les Personnages autres que lui (les deux camps), puis la carte du dessus de son deck
// au-dessus de sa Vie, et la Vie du dessus adverse dans la Défausse
const kaidoLinlin: Effect = effect((ctx) => {
  for (const p of [ctx.opp, ctx.me]) {
    for (const c of [...ctx.s.players[p].chars]) if (c.uid !== ctx.source) removeByEffect(ctx, c.uid, 'ko');
  }
  const P = ctx.s.players[ctx.me];
  const top = P.deck.shift();
  if (top) {
    P.life.unshift(top);
    log(ctx.s, ctx.me, `ajoute la carte du dessus de son deck au-dessus de sa Vie (${P.life.length} Vie)`);
  }
  const O = ctx.s.players[ctx.opp];
  const lost = O.life.shift();
  if (lost) {
    O.trash.push({ uid: lost.uid, num: lost.num });
    log(ctx.s, ctx.opp, `la carte du dessus de sa Vie va dans sa Défausse : ${def(lost.num).name} (${O.life.length} Vie)`);
  }
});

export const FAM_KAIDO: Record<string, CardBehavior> = {
  // Conquerer of Three Worlds Ragnaraku : [Principale] DON!! −1 : KO d'un Personnage adverse de coût 8 ou moins ;
  // [Déclenchement] 1 DON!! redressée du deck DON!!
  'EB01-039': card({
    onMain: withCost(donMinus(1), ko(oppChar({ costMax: 8 }), 'Ragnaraku'), 'Ragnaraku'),
    onTrigger: addDon(1, 'active'),
  }),

  // Kaido (EB04-030) : s'il devait être mis KO, renvoyer 1 DON!! à la place ; [Jouée] DON!! −2 : avec un Leader
  // {Équipage des cent bêtes}, [Initiative] pour le tour, puis épuiser un Personnage adverse de coût 7 ou moins
  'EB04-030': card({
    onPlay: withCost(donMinus(2), seq(when(akpLeader, selfKeyword('Rush', 'Kaido')), rest(oppChar({ costMax: 7 }), 'Kaido')), 'Kaido'),
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

  // Monkey D. Luffy (OP05-119) : [Jouée] DON!! −10 : ses autres Personnages sous son deck, puis un tour supplémentaire ;
  // [Activation : Principale] [Une fois par tour] épuiser 1 DON!! : 1 DON!! redressée du deck DON!!
  'OP05-119': card({
    onPlay: withCost(donMinus(10), luffyExtraTurn, 'Monkey D. Luffy'),
    activateMain: { label: 'Luffy : épuiser 1 DON!! pour ajouter 1 DON!! redressée', once: true, cost: restDon(1), effect: addDon(1, 'active') },
  }),

  // Alber : [Activation : Principale] se placer dans la Défausse : avec un Leader {Équipage des cent bêtes} et 10 DON!! sur
  // son terrain, jouer de sa main un [King] de coût 7 ou moins
  'OP08-059': card({
    activateMain: {
      label: 'Alber : se placer dans ta Défausse pour jouer un [King] de coût 7 ou moins de ta main',
      cost: trashSelf(),
      effect: when((s, p) => akpLeader(s, p, -1) && tenDon(s, p), effect((ctx) => {
        playCharFromHand(ctx, (c) => isNamed(c.num, 'King') && (def(c.num).cost ?? 0) <= 7, 'Alber : jouer un [King] de coût 7 ou moins de ta main :');
      })),
    },
  }),

  // King (OP08-060) : [Jouée] DON!! −1 : avec 5 DON!! ou plus sur le terrain adverse, [Initiative] pour le tour
  'OP08-060': card({ onPlay: withCost(donMinus(1), when((s, p) => donOnField(s, opp(p)) >= 5, selfKeyword('Rush', 'King')), 'King') }),

  // « Un vrai délice... à en mourir ! » : [Principale] 1 DON!! redressée, puis une autre si l'adversaire a un Personnage de
  // 6000 ou plus ; [Déclenchement] 1 DON!! redressée
  'OP08-076': card({
    onMain: seq(addDon(1, 'active'), when((s, p) => s.players[opp(p)].chars.some((c) => power(s, c.uid) >= 6000), addDon(1, 'active'))),
    onTrigger: addDon(1, 'active'),
  }),

  // Conquest of the Sea : [Principale] DON!! −2 : avec un Leader {Équipage des cent bêtes} ou {Équipage de Big Mom}, KO
  // de jusqu'à 2 Personnages adverses de coût 6 ou moins
  'OP08-077': card({
    onMain: withCost(donMinus(2), when(any(akpLeader, leaderType(BMP)), ko(oppChar({ costMax: 6 }), 'Conquest of the Sea', 2)), 'Conquest of the Sea'),
  }),

  // Kaido & Linlin : [En attaquant] DON!! −10
  'OP08-119': card({ whenAttacking: withCost(donMinus(10), kaidoLinlin, 'Kaido & Linlin') }, { attackUseful: () => false }),

  // Gum Gum Saut à la corde : [Principale] DON!! −2 : épuiser un Personnage adverse de coût 5 ou moins, puis piocher 1 ;
  // [Déclenchement] 1 DON!! redressée
  'OP09-079': card({
    onMain: withCost(donMinus(2), seq(rest(oppChar({ costMax: 5 }), 'Gum Gum Saut à la corde'), drawCards(1)), 'Gum Gum Saut à la corde'),
    onTrigger: addDon(1, 'active'),
  }),

  // Charlotte Linlin (OP11-073) : [Initiative] avec un Leader {Équipage de Big Mom} ; [Attaque adverse] [Une fois par tour]
  // DON!! −5 : déclarer un coût et révéler la carte du dessus du deck adverse : si c'est ce coût, Leader +2000 pour le tour
  'OP11-073': card({
    onOpponentAttack: onceWithCost('linlin073', donMinus(5), effect((ctx) => {
      if (!declareAndReveal(ctx)) return;
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 2000, until: 'turn', source: 'Charlotte Linlin' });
      log(ctx.s, ctx.me, 'son Leader gagne +2000 de puissance pour le tour (Charlotte Linlin)');
    }, (s, p) => s.players[opp(p)].deck.length > 0), 'Charlotte Linlin'),
  }, { rush: (s, p) => leaderType(BMP)(s, p, -1) }),

  // Ulti et Page One : [Jouée] avec un Leader {Équipage des cent bêtes}, 1 DON!! redressée, puis KO d'un Personnage
  // adverse de 3000 ou moins
  'OP17-060': card({ onPlay: seq(when(akpLeader, addDon(1, 'active')), ko(oppChar({ powerMax: 3000 }), 'Ulti et Page One')) }),

  // King (OP17-064) : [Bloqueur] ; [Attaque adverse] [Une fois par tour] défausser 1 carte : +2000 pour le combat
  'OP17-064': card({ onOpponentAttack: defend('king064', 2000, 'King') }),

  // Jack (OP17-069) : [Initiative : Personnage] ; [Jouée] DON!! −1 : avec un Leader {Équipage des cent bêtes}, −2000
  'OP17-069': card({ onPlay: withCost(donMinus(1), when(akpLeader, powerMod(oppChar(), -2000, 'turn', 'Jack')), 'Jack') }),

  // Who's Who : [Jouée] DON!! −1 : KO de jusqu'à 2 Personnages adverses de coût 2 ou moins ; [Déclenchement] se jouer
  'OP17-071': card({ onPlay: withCost(donMinus(1), ko(oppChar({ costMax: 2 }), 'Who’s Who', 2), 'Who’s Who') }),

  // Black Maria (OP17-072) : [Bloqueur] ; [Attaque adverse] [Une fois par tour] défausser 1 carte : +1000 pour le combat
  'OP17-072': card({ onOpponentAttack: defend('maria072', 1000, 'Black Maria') }),

  // X-Drake (OP17-075) : [Jouée] DON!! −2 : 1 carte de la main adverse (au hasard) dans la Défausse
  'OP17-075': card({ onPlay: withCost(donMinus(2), trashFromOppHand(1, 'X-Drake'), 'X-Drake') }),

  // « Wo lo lo lo lo ! Me voilà redevenu complètement sobre » : [Contre] défausser 1 carte : +3000 ; [Déclenchement]
  // DON!! −1 : piocher 2
  'OP17-076': card({
    onCounter: withCost(discardCost(1), counterOn(3000, 'Wo lo lo lo lo !'), 'Wo lo lo lo lo !'),
    onTrigger: withCost(donMinus(1), drawCards(2), 'Wo lo lo lo lo !'),
  }, { counterUseful: (s, p) => s.players[p].hand.length >= 2 }),

  // Kundali, Météores du Dragon : [Principale] épuiser 3 DON!! et défausser 2 cartes : 3 DON!! épuisées (Leader {Équipage
  // des cent bêtes}) ; [Contre] DON!! −1 : Leader +4000
  'OP17-077': card({
    onMain: dragonDon(3, 'Kundali, Météores du Dragon'),
    onCounter: withCost(donMinus(1), leaderBattle(4000, 'Kundali, Météores du Dragon'), 'Kundali, Météores du Dragon'),
  }, { counterUseful: protectsLeader }),

  // Ivresse du Dragon Divin : [Principale] épuiser 2 DON!! et défausser 2 cartes : 3 DON!! épuisées (Leader {Équipage des
  // cent bêtes}) ; [Contre] +4000
  'OP17-078': card({ onMain: dragonDon(2, 'Ivresse du Dragon Divin'), onCounter: counterOn(4000, 'Ivresse du Dragon Divin') }),

  // Ulti (P-077) : [Une fois par tour] quand 2 DON!! ou plus de son terrain retournent au deck DON!!, 1 DON!! épuisée, puis
  // redresser un de ses Lieux violets
  'P-077': {
    when: [{
      on: 'donReturned',
      once: 'ulti077',
      if: (s, owner, self, e) => e.player === owner && (e.count ?? 0) >= 2 && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => {
        addDon(1, 'rested').run(ctx);
        const stage = ctx.s.players[ctx.me].stage;
        if (stage?.rested && def(stage.num).colors.includes('Purple')) {
          setActive(ctx.s, ctx.me, stage.uid);
          log(ctx.s, ctx.me, `redresse le Lieu ${def(stage.num).name} (Ulti)`);
        }
      },
    }],
  },

  // Monkey D. Luffy (P-099) : [En attaquant] DON!! −10 : se redresser
  'P-099': card({ whenAttacking: withCost(donMinus(10), effect((ctx) => { setActive(ctx.s, ctx.me, ctx.source); }), 'Monkey D. Luffy') }, { attackUseful: () => false }),

  // Shanks (P-104) : ne quitte pas le terrain à cause d'un effet adverse si l'un des joueurs a 10 DON!! sur son terrain
  'P-104': { cantLeave: (s, p) => tenDon(s, p) || tenDon(s, opp(p)) },
};
