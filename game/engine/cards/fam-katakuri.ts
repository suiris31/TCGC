// FAMILLE DU LEADER KATAKURI (phase 4E) : cartes violettes {Équipage de Big Mom} (et {Homies}) jouables en format
// Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles jouent avec
// les DON!! renvoyées (DON!! −X) et rendues, et avec la Vie. Chaque condition se vérifie dans la partie. Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import {
  canLeaveByEffect, canPlayCharacters, chooseUpTo1, declareAndReveal, def, donOnField, leaderHasType, log, peekTop, playCharacter,
  removeByEffect, reveal, shuffleDeck, uniqueByNum,
} from '../rules.ts';
import type { CardBehavior, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  addDon, all, bothCosts, candidates, card, cardMatches, costMod, describeSpec, discardCost, donMinus, drawCards, effect, flipTopLife,
  ko, lifeFromDeck, lifeIntoHand, lifeToHandCost, onceWithCost, oppChar, ownChar, ownLeaderOrChar, playFromHand, powerMod,
  rest, restSelf, searchTop, seq, setActiveTargets, trashSelf, when, withCost, type CharSpec, type Effect,
} from './bricks.ts';
import { isNamed, playCharFromHand, playTriggerCard } from './common.ts';

const BMP = 'Big Mom Pirates';  // {Équipage de Big Mom}
const bmpLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, BMP);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const onField = (s: GameState, p: PlayerId, uid: number) => s.players[p].chars.some((c) => c.uid === uid);

// « Quand une DON!! (ou N DON!! ou plus) de votre terrain retourne au deck DON!! » [Une fois par tour], pendant son tour
// ou pendant le tour adverse selon la carte
const onDonReturned = (key: string, turn: 'mine' | 'opp', min: number, extra: (s: GameState, owner: PlayerId, e: GameEvent) => boolean, run: Effect['run']) => ({
  when: [{
    on: 'donReturned' as const,
    once: key,
    if: (s: GameState, owner: PlayerId, self: { uid: number }, e: GameEvent) => e.player === owner && (e.count ?? 0) >= min
      && (turn === 'mine' ? s.active === owner : s.active !== owner) && onField(s, owner, self.uid) && extra(s, owner, e),
    run,
  }],
});

// « Jouez jusqu'à 1 [Nom] de coût N ou moins de votre deck. Puis, mélangez votre deck »
const playFromDeck = (spec: CharSpec, source: string): Effect => {
  const eligible = (s: GameState, p: PlayerId, num: string) => def(num).category === 'CHARACTER' && cardMatches(num, spec) && canPlayCharacters(s, p, num);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const options = canPlayCharacters(ctx.s, ctx.me) ? uniqueByNum(P.deck.filter((c) => eligible(ctx.s, ctx.me, c.num))) : [];
      if (options.length) {
        const answer = ctx.ask({
          prompt: `${source} : jouer jusqu’à 1 ${describeSpec('Personnage', spec)} de ton deck :`,
          options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
          tag: 'playFree',
        });
        if (answer !== 'none') {
          const [c] = P.deck.splice(P.deck.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
          playCharacter(ctx, ctx.me, c);
        }
      }
      shuffleDeck(ctx.s, ctx.me);
      log(ctx.s, ctx.me, `mélange son deck (${source})`);
    },
    useful: (s, p) => canPlayCharacters(s, p) && s.players[p].deck.some((c) => eligible(s, p, c.num)),
  };
};

// Charlotte Linlin (OP08-069) : un Personnage adverse de coût 6 ou moins au-dessus ou au-dessous de la Vie de son
// propriétaire, face visible
const linlinTargets = (s: GameState, p: PlayerId) => candidates(s, p, oppChar({ costMax: 6 }), (c) => canLeaveByEffect(s, c.uid, p));
const linlinToLife: Effect = {
  run: (ctx) => {
    const uid = chooseUpTo1(ctx, linlinTargets(ctx.s, ctx.me), 'Charlotte Linlin : Personnage adverse de coût 6 ou moins à placer face visible dans sa Vie :', 'oppRemove');
    if (uid === null) return;
    const where = ctx.ask({
      prompt: 'Au-dessus ou au-dessous de sa Vie ?',
      options: [{ id: 'top', label: 'Au-dessus' }, { id: 'bottom', label: 'Au-dessous' }],
      tag: 'lifeSideOpp',
    });
    removeByEffect(ctx, uid, where === 'top' ? 'lifeTop' : 'lifeBottom');
  },
  useful: (s, p) => linlinTargets(s, p).length > 0,
};

// Candy Maiden : « retournez toutes les cartes de votre Vie face cachée »
const allLifeFaceDown: Effect = effect((ctx) => {
  const life = ctx.s.players[ctx.me].life;
  if (!life.some((c) => c.faceUp)) return;
  for (const c of life) c.faceUp = false;
  log(ctx.s, ctx.me, 'retourne toutes les cartes de sa Vie face cachée');
}, (s, p) => s.players[p].life.some((c) => c.faceUp));

// Charlotte Mont d'or : « votre adversaire place 2 cartes de sa Défausse au-dessous de son deck dans l'ordre de son
// choix » (il les choisit ; la Défausse est publique, les deux joueurs savent lesquelles)
const oppTrashToBottom = (n: number, source: string): Effect => effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  for (let i = 0; i < n && O.trash.length; i++) {
    const options = uniqueByNum(O.trash);
    const answer = ctx.ask({
      player: ctx.opp,
      prompt: `${source} : carte de ta Défausse à placer au-dessous de ton deck (${i + 1}/${n}) :`,
      options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
      tag: 'trashToDeck',
    });
    const [c] = O.trash.splice(O.trash.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    O.deck.push(c);
    reveal(ctx.s, [c.uid], 'both');
    log(ctx.s, ctx.opp, `place ${def(c.num).name} de sa Défausse au-dessous de son deck (${source})`);
  }
}, (s, p) => s.players[opp(p)].trash.length > 0);

export const FAM_KATAKURI: Record<string, CardBehavior> = {
  // Sanji et Pudding : [Votre tour] [Une fois par tour] quand 2 DON!! ou plus de son terrain retournent au deck DON!!,
  // 1 DON!! redressée ; [Jouée] avec autant de DON!! ou moins que l'adversaire sur le terrain, piocher 1
  'EB02-035': card({
    onPlay: when((s, p) => donOnField(s, p) <= donOnField(s, opp(p)), drawCards(1)),
  }, onDonReturned('sanjiPudding', 'mine', 2, () => true, (ctx) => addDon(1, 'active').run(ctx))),

  // Charlotte Brûlée (EB03-033) : [Tour adverse] [Une fois par tour] quand une DON!! de son terrain retourne au deck
  // DON!! par son propre effet, avec un Leader {Équipage de Big Mom}, 1 DON!! épuisée
  'EB03-033': onDonReturned('brulee033', 'opp', 1, (s, owner, e) => (e.by ?? owner) === owner && bmpLeader(s, owner), (ctx) => addDon(1, 'rested').run(ctx)),

  // Charlotte Pudding (EB04-034) : [Bloqueur] ; [Attaque adverse] [Une fois par tour] défausser 1 carte : avec 4
  // Événements ou plus dans sa Défausse, +2000 pour le combat à son Leader ou un Personnage
  'EB04-034': card({
    onOpponentAttack: onceWithCost('pudding034', discardCost(1),
      when((s, p) => s.players[p].trash.filter((c) => def(c.num).category === 'EVENT').length >= 4, powerMod(ownLeaderOrChar(), 2000, 'battle', 'Charlotte Pudding')),
      'Charlotte Pudding'),
  }),

  // Charlotte Oven : [En attaquant] DON!! −1 : KO d'un Personnage adverse de coût 3 ou moins
  'OP08-061': card({ whenAttacking: withCost(donMinus(1), ko(oppChar({ costMax: 3 }), 'Charlotte Oven'), 'Charlotte Oven') }),

  // Charlotte Katakuri (OP08-062) : [Activation : Principale] se placer dans la Défausse : avec un Leader {Équipage de Big
  // Mom}, jouer de sa main un [Charlotte Katakuri] de coût 3 ou plus et au plus égal au nombre de DON!! adverses
  'OP08-062': card({
    activateMain: {
      label: 'Charlotte Katakuri : se placer dans ta Défausse pour jouer un [Charlotte Katakuri] de ta main',
      cost: trashSelf(),
      effect: when(bmpLeader, effect((ctx) => {
        const max = donOnField(ctx.s, ctx.opp);
        playCharFromHand(ctx, (c) => isNamed(c.num, 'Charlotte Katakuri') && (def(c.num).cost ?? 0) >= 3 && (def(c.num).cost ?? 0) <= max,
          `Charlotte Katakuri : jouer un [Charlotte Katakuri] de coût 3 à ${max} de ta main :`);
      }, (s, p) => s.players[p].hand.some((c) => isNamed(c.num, 'Charlotte Katakuri') && (def(c.num).cost ?? 0) >= 3
        && (def(c.num).cost ?? 0) <= donOnField(s, opp(p)) && canPlayCharacters(s, p, c.num)))),
    },
  }),

  // Charlotte Katakuri (OP08-063) : [Jouée] retourner la Vie du dessus face cachée : 1 DON!! redressée
  'OP08-063': card({ onPlay: withCost(flipTopLife(false), addDon(1, 'active'), 'Charlotte Katakuri') }),

  // Charlotte Cracker : [Activation : Principale] [Une fois par tour] DON!! −1 : jouer un [Biscuit Warrior] de sa main
  'OP08-064': card({
    activateMain: {
      label: 'Charlotte Cracker : DON!! −1 pour jouer un [Biscuit Warrior] de ta main',
      once: true,
      cost: donMinus(1),
      effect: playFromHand({ name: 'Biscuit Warrior' }, 'Charlotte Cracker'),
    },
  }),

  // Charlotte Brulee (OP08-066) : [Bloqueur] ; [En cas de KO] 1 DON!! épuisée
  'OP08-066': card({ onKO: addDon(1, 'rested') }),

  // Charlotte Pudding (OP08-067) : [Votre tour] [Une fois par tour] quand une DON!! de son terrain retourne au deck DON!!,
  // 1 DON!! épuisée
  'OP08-067': onDonReturned('pudding067', 'mine', 1, () => true, (ctx) => addDon(1, 'rested').run(ctx)),

  // Charlotte Perospero : [En cas de KO] 1 DON!! épuisée ; [Déclenchement] DON!! −1 : se jouer
  'OP08-068': card({
    onKO: addDon(1, 'rested'),
    onTrigger: withCost(donMinus(1), effect((ctx) => playTriggerCard(ctx)), 'Charlotte Perospero'),
  }),

  // Charlotte Linlin (OP08-069) : [Jouée] DON!! −1 et défausser 1 carte : la carte du dessus de son deck au-dessus de sa
  // Vie, puis un Personnage adverse de coût 6 ou moins face visible dans la Vie adverse (dessus ou dessous)
  'OP08-069': card({ onPlay: withCost(bothCosts(donMinus(1), discardCost(1)), seq(lifeFromDeck(), linlinToLife), 'Charlotte Linlin') }),

  // Baron Tamago : [Bloqueur] ; [En cas de KO] DON!! −1 : jouer de sa main un [Viscount Hiyoko] de coût 5 ou moins
  'OP08-070': card({ onKO: withCost(donMinus(1), playFromHand({ name: 'Viscount Hiyoko', costMax: 5 }, 'Baron Tamago'), 'Baron Tamago') }),

  // Count Niwatori : [Tour adverse] [En cas de KO] DON!! −1 : jouer de son deck un [Baron Tamago] de coût 4 ou moins,
  // puis mélanger
  'OP08-071': card({ onKO: withCost(donMinus(1), playFromDeck({ name: 'Baron Tamago', costMax: 4 }, 'Count Niwatori'), 'Count Niwatori') }, {
    onKOCondition: (s, owner) => s.active !== owner,
  }),

  // Biscuit Warrior : autant d'exemplaires qu'on veut dans le deck (deckRules.ts) ; [Bloqueur]
  'OP08-072': {},

  // Viscount Hiyoko : [Tour adverse] [En cas de KO] DON!! −1 : jouer de son deck un [Count Niwatori] de coût 6 ou moins,
  // puis mélanger
  'OP08-073': card({ onKO: withCost(donMinus(1), playFromDeck({ name: 'Count Niwatori', costMax: 6 }, 'Viscount Hiyoko'), 'Viscount Hiyoko') }, {
    onKOCondition: (s, owner) => s.active !== owner,
  }),

  // Candy Maiden : [Principale] DON!! −1 : épuiser un Personnage adverse de coût 2 ou moins, puis toute sa Vie face
  // cachée ; [Déclenchement] 1 DON!! redressée
  'OP08-075': card({
    onMain: withCost(donMinus(1), seq(rest(oppChar({ costMax: 2 }), 'Candy Maiden'), allLifeFaceDown), 'Candy Maiden'),
    onTrigger: addDon(1, 'active'),
  }),

  // Charlotte Katakuri (OP11-067) : [Bloqueur] ; [Fin de votre tour] redresser jusqu'à 2 de ses Personnages {Équipage de
  // Big Mom} de coût 3 ou plus, puis 1 DON!! épuisée
  'OP11-067': card({ endOfTurn: seq(setActiveTargets(ownChar({ type: BMP, costMin: 3 }), 'Charlotte Katakuri', 2), addDon(1, 'rested')) }),

  // Charlotte Brûlée (OP11-069) : [Jouée] prendre en main la Vie du dessus : avec un Leader {Équipage de Big Mom}, 1 DON!!
  // redressée
  'OP11-069': card({ onPlay: withCost(lifeToHandCost('top'), when(bmpLeader, addDon(1, 'active')), 'Charlotte Brûlée') }),

  // Charlotte Pudding (OP11-070) : [Jouée] 5 cartes du dessus, une {Équipage de Big Mom} de coût 2 ou plus ; [Activation :
  // Principale] DON!! −1 et s'épuiser : regarder la carte du dessus du deck adverse
  'OP11-070': card({
    onPlay: searchTop(5, 1, { type: BMP, costMin: 2 }, 'une carte {Équipage de Big Mom} de coût 2 ou plus'),
    activateMain: {
      label: 'Charlotte Pudding : DON!! −1 et s’épuiser pour regarder la carte du dessus du deck adverse',
      cost: bothCosts(donMinus(1), restSelf()),
      effect: effect((ctx) => peekTop(ctx.s, ctx.me), (s, p) => {
        // utile seulement avant de déclarer un coût (Streusen) quand la carte du dessus n'est pas déjà connue
        const top = s.players[opp(p)].deck[0];
        return Boolean(top) && s.peek[p] !== top.uid && s.players[p].chars.some((c) => c.num === 'OP11-074' && !c.rested && !c.usedOpt.includes('main'));
      }),
    },
  }),

  // Charlotte Mont d'or : [Activation : Principale] [Une fois par tour] DON!! −1 et s'épuiser : l'adversaire place 2
  // cartes de sa Défausse sous son deck, puis la Vie du dessus en main
  'OP11-072': card({
    activateMain: {
      label: 'Charlotte Mont d’or : DON!! −1 et s’épuiser pour renvoyer 2 cartes de la Défausse adverse sous son deck',
      once: true,
      cost: bothCosts(donMinus(1), restSelf()),
      effect: seq(oppTrashToBottom(2, 'Charlotte Mont d’or'), effect((ctx) => lifeIntoHand('top').run(ctx), (s, p) => s.players[p].life.length >= 3)),
    },
  }),

  // Streusen (OP11-074) : [Activation : Principale] [Une fois par tour] DON!! −1 et s'épuiser : déclarer un coût et
  // révéler la carte du dessus du deck adverse : si c'est ce coût, épuiser un Personnage adverse de coût 4 ou moins
  'OP11-074': card({
    activateMain: {
      label: 'Streusen : DON!! −1 et s’épuiser pour déclarer un coût',
      once: true,
      cost: bothCosts(donMinus(1), restSelf()),
      effect: effect((ctx) => {
        if (declareAndReveal(ctx)) rest(oppChar({ costMax: 4 }), 'Streusen').run(ctx);
      }, (s, p) => s.players[opp(p)].deck.length > 0 && rest(oppChar({ costMax: 4 }), 'Streusen').useful(s, p, -1)),
    },
  }),

  // Randolph : [Votre tour] [Une fois par tour] quand une DON!! de son terrain retourne au deck DON!!, un de ses
  // Personnages {Équipage de Big Mom} gagne +2 de coût jusqu'à la fin du prochain tour adverse
  'OP11-077': onDonReturned('randolph', 'mine', 1, () => true, (ctx) => costMod(ownChar({ type: BMP }), 2, 'oppNextEnd', 'Randolph').run(ctx)),

  // Héra : [Jouée] jouer de sa main un Personnage {Homies} de 3000 de puissance ou moins
  'OP13-074': card({ onPlay: playFromHand({ type: 'Homies', powerMax: 3000 }, 'Héra') }),

  // Charlotte Pudding (PRB02-010) : [Jouée] DON!! −2 : avec un Leader {Équipage de Big Mom} et 6 DON!! adverses ou plus,
  // piocher 2, puis jouer de sa main un Personnage {Équipage de Big Mom} de 6000 à 8000 de puissance
  'PRB02-010': card({
    onPlay: withCost(donMinus(2), when(all(bmpLeader, (s, p) => donOnField(s, opp(p)) >= 6),
      seq(drawCards(2), playFromHand({ type: BMP, powerMin: 6000, powerMax: 8000 }, 'Charlotte Pudding'))), 'Charlotte Pudding'),
  }),
};
