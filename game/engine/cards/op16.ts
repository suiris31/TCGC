// OP16 (étape C, tâche S2) : cartes que le traducteur ne comprend pas, codées à la main d'après leur texte officiel
// (VO et VF), et morceaux de code appelés par les recettes de recipes/sets/op16.ts (sortie « manual », MANUAL_OP16).
// Aucun texte de carte ici : seulement ce que fait l'effet. Choix d'interprétation : game/docs/interpretations.md,
// section « OP16 (tâche S2) ».
import {
  addMod, def, discardFromHand, emit, fieldCards, fieldCost, findField, hasType, knownFirst, log, other, playableByEffect,
  playCharacter, power, reveal, uniqueByNum, canPlayCharacters,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import type { ManualRegistry } from '../recipes/types.ts';
import {
  card, cardMatches, discardCost, donOnFieldAtLeast, grant, lifeAtMost, oppHandAtLeast, oppHandToBottom, ownChar, playFromTrash, restCost,
  restSelf, seq, trashSelf, when, type CharSpec, type Cost,
} from './bricks.ts';
import { isNamed } from './common.ts';

// Contexte d'un effet de remplacement, vu du propriétaire de la carte (l'effet en cours peut être celui de l'adversaire)
const ownerCtx = (ctx: EffectCtx, owner: PlayerId): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), ask: (spec) => ctx.ask({ player: owner, ...spec }),
});

// « Choisissez jusqu'à 1 Personnage adverse » puis la puissance de base de ce Personnage devient celle du choisi
const setBasePower = (ctx: EffectCtx, value: number, source: string) => {
  const self = findField(ctx.s, ctx.source);
  if (!self || self.leader) return;
  addMod(ctx.s, { uid: ctx.source, stat: 'basePower', amount: value, until: 'turn', source });
  log(ctx.s, ctx.me, `${def(self.card.num).name} a une puissance de base de ${value} pour le tour (${source})`);
};

// ---------- Code à la main appelé par les recettes ----------

const ADMIRAL: CharSpec & { category: 'CHARACTER' } = { category: 'CHARACTER', type: 'Admiral' };
const BLACKBEARD_6: CharSpec = { type: 'Blackbeard Pirates', costMax: 6 };

export const MANUAL_OP16: ManualRegistry = {
  // Mr 2 Bonclay : [DON!! x1] [En attaquant] puissance de base = puissance actuelle du Leader adverse, pour le tour
  'OP16-055': {
    steps: {
      copyOppLeader: (ctx) => setBasePower(ctx, power(ctx.s, ctx.s.players[ctx.opp].leader.uid), 'Mr 2 Bonclay'),
    },
  },

  // Sengoku (Leader) : renvoyer 8 DON!! redressées au deck DON!! : jouer jusqu'à 3 {Amiral} de noms différents
  'OP16-060': {
    costs: {
      returnActiveDon8: {
        canPay: (ctx) => ctx.s.players[ctx.me].donActive >= 8,
        pay: (ctx) => {
          const P = ctx.s.players[ctx.me];
          if (P.donActive < 8) return false;
          P.donActive -= 8;
          P.donDeck += 8;
          log(ctx.s, ctx.me, 'renvoie 8 DON!! redressées dans son deck DON!!');
          emit(ctx.s, { type: 'donReturned', player: ctx.me, count: 8 });
          return true;
        },
      },
    },
    steps: {
      playAdmirals: (ctx) => {
        const P = ctx.s.players[ctx.me];
        const names: string[] = [];
        for (let i = 0; i < 3; i++) {
          if (!canPlayCharacters(ctx.s, ctx.me)) return;
          const fits = (c: Card) => cardMatches(c.num, ADMIRAL) && playableByEffect(c.num) && canPlayCharacters(ctx.s, ctx.me, c.num)
            && !def(c.num).names.some((n) => names.includes(n));
          const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter(fits)));
          if (!options.length) return;
          const answer = ctx.ask({
            prompt: `Sengoku : jouer jusqu’à 1 Personnage {Amiral} de ta main (${i + 1}/3, noms différents) :`,
            options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
            tag: 'playFree',
          });
          if (answer === 'none') return;
          const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
          names.push(...def(card.num).names);
          playCharacter(ctx, ctx.me, card, { from: 'hand' });
        }
      },
    },
  },

  // Entaille de Glace Sacrée : « si un Personnage adverse a été mis KO durant ce tour »
  'OP16-100': {
    conds: { oppKoThisTurn: (ctx) => ctx.s.players[ctx.opp].charKoTurn === ctx.s.turn },
  },

  // Avalo Pizarro : « jouez jusqu'à 1 [Ruche] de votre main ou de votre Défausse » ([Ruche] est un Lieu)
  'OP16-102': {
    steps: {
      playFullalead: (ctx) => {
        const P = ctx.s.players[ctx.me];
        const fits = (c: Card) => isNamed(c.num, 'Fullalead') && def(c.num).category === 'STAGE';
        const hand = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => fits(c) && playableByEffect(c.num))));
        const trash = uniqueByNum(P.trash.filter(fits));
        if (!hand.length && !trash.length) return;
        const answer = ctx.ask({
          prompt: 'Avalo Pizarro : jouer jusqu’à 1 [Ruche] de ta main ou de ta Défausse :',
          options: [
            ...hand.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (main)`, uid: c.uid, num: c.num })),
            ...trash.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (Défausse)`, uid: c.uid, num: c.num })),
            { id: 'none', label: 'Aucune' },
          ],
          tag: 'playFree',
        });
        if (answer === 'none') return;
        const uid = Number(answer.split(':')[1]);
        const zone = P.hand.some((c) => c.uid === uid) ? P.hand : P.trash;
        const [card] = zone.splice(zone.findIndex((c) => c.uid === uid), 1);
        playCharacter(ctx, ctx.me, card);   // un Lieu : playStage (l'ancien Lieu est défaussé)
      },
    },
  },

  // Catarina Devon : [En attaquant] choisir jusqu'à 1 Personnage adverse ; puissance de base = sa puissance, pour le tour
  'OP16-104': {
    steps: {
      copySelected: (ctx) => {
        const opp = ctx.s.players[ctx.opp].chars;
        if (!opp.length || !findField(ctx.s, ctx.source)) return;
        const answer = ctx.ask({
          prompt: 'Catarina Devon : choisis jusqu’à 1 Personnage adverse (sa puissance devient la puissance de base de Catarina Devon) :',
          options: [...opp.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (${power(ctx.s, c.uid)})`, uid: c.uid })), { id: 'none', label: 'Aucun' }],
          tag: 'target',
        });
        if (answer === 'none') return;
        setBasePower(ctx, power(ctx.s, Number(answer.split(':')[1])), 'Catarina Devon');
      },
    },
  },

  // Shiliew : jusqu'à 1 carte {Équipage de Barbe Noire} de coût 6 ou moins de la Défausse, face visible au-dessus de la Vie
  'OP16-108': {
    steps: {
      trashToLife: (ctx) => {
        const P = ctx.s.players[ctx.me];
        const options = uniqueByNum(P.trash.filter((c) => cardMatches(c.num, BLACKBEARD_6)));
        if (!options.length) return;
        const answer = ctx.ask({
          prompt: 'Shiliew : carte de ta Défausse à placer face visible au-dessus de ta Vie :',
          options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
          tag: 'toLife',
        });
        if (answer === 'none') return;
        const [c] = P.trash.splice(P.trash.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
        P.life.unshift({ ...c, faceUp: true });
        reveal(ctx.s, [c.uid], 'both');
        log(ctx.s, ctx.me, `place ${def(c.num).name} face visible au-dessus de sa Vie (Shiliew)`);
      },
    },
  },
};

// ---------- Cartes codées entièrement à la main ----------

const isOwnChar = (s: GameState, p: PlayerId, c: FieldCard) => s.players[p].chars.some((x) => x.uid === c.uid);
// « placer ce Personnage ayant un coût de 20 ou plus dans la Défausse » (Momonosuké Kozuki OP16-084)
const trashSelfCost20: Cost = {
  label: 'placer ce Personnage (coût 20 ou plus) dans ta Défausse',
  can: (s, _p, self) => Boolean(findField(s, self)) && fieldCost(s, self) >= 20,
  pay: (ctx) => fieldCost(ctx.s, ctx.source) >= 20 && trashSelf().pay(ctx),
};
const SIX_K: CharSpec & { category: 'CHARACTER' } = { category: 'CHARACTER', powerMin: 6000 };

export const OP16: Record<string, CardBehavior> = {
  // Portgas D. Ace (Leader) : [Activation : Principale] [Une fois par tour] jusqu'à 1 de ses [Monkey D. Luffy] ou
  // Personnages incluant « Whitebeard Pirates » dans son type, de 8000 de puissance ou plus (les deux), gagne
  // [Initiative] pour le tour
  'OP16-001': card({
    activateMain: {
      label: 'Portgas D. Ace : [Initiative] à un Luffy ou un Personnage Barbe Blanche de 8000 ou plus',
      once: true,
      effect: grant(ownChar({ powerMin: 8000, anyOf: [{ name: 'Monkey.D.Luffy' }, { typeIncludes: 'Whitebeard Pirates' }] }), { stat: 'keyword', keyword: 'Rush' }, 'turn', 'Portgas D. Ace', 'gagne [Initiative]'),
    },
  }),

  // Rockstar : [Une fois par tour] à la place du KO d'un de ses Personnages {Équipage du Roux}, défausser 1 carte
  // Personnage de 6000 de puissance ou plus (combat ou effet ; Rockstar lui-même compris)
  'OP16-018': {
    koReplaceAlly: {
      label: (_s, _self, victim) => `Rockstar : défausser 1 Personnage de 6000 de puissance ou plus pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, p, self, victim) => !self.usedOpt.includes('rockstar') && hasType(victim.num, 'Red-Haired Pirates')
        && s.players[p].hand.some((c) => cardMatches(c.num, SIX_K)),
      apply: (s, p, self, _victim, ctx) => {
        self.usedOpt.push('rockstar');
        discardFromHand(ownerCtx(ctx, p), p, 1, 'Rockstar : Personnage de 6000 de puissance ou plus à défausser à la place du KO :', (c) => cardMatches(c.num, SIX_K));
        log(s, p, 'Rockstar : le Personnage n’est pas mis KO (carte défaussée à la place)');
      },
    },
  },

  // Morley : à la place de son KO, épuiser 2 de ses cartes (Leader, Personnages, Lieu, DON!! : comme le coût
  // « épuisez N de vos cartes ») ; [Imblocable] est lu par le moteur
  'OP16-033': {
    koReplace: {
      label: 'Épuiser 2 de tes cartes',
      condition: (s, p, self) => restCost(2, 'cards').can(s, p, self.uid),
      apply: (s, p, self, ctx) => {
        restCost(2, 'cards').pay({ ...ownerCtx(ctx, p), source: self.uid, num: self.num });
        log(s, p, 'Morley n’est pas mis KO (2 cartes épuisées à la place)');
      },
    },
  },

  // Prisonniers d'Impel Down : autant d'exemplaires que voulu dans le deck (règle lue par deckRules.anyNumber) ; aucun
  // autre effet
  'OP16-042': {},

  // Don Quijote Doflamingo : [Activation : Principale] s'épuiser : si l'adversaire a 8 cartes ou plus en main, il en
  // place 2 au-dessous de son deck (il les choisit)
  'OP16-047': card({
    activateMain: {
      label: 'Don Quijote Doflamingo : l’adversaire place 2 cartes de sa main sous son deck',
      cost: restSelf(),
      effect: when(oppHandAtLeast(8), oppHandToBottom(2, 'Don Quijote Doflamingo')),
    },
  }),

  // Yamato (Leader) : un Personnage {Pays de Wano} joué depuis sa Défausse gagne [Initiative] pour le tour (les cartes
  // jouées par les briques communes ; voir GameEvent.from)
  'OP16-079': {
    when: [{
      on: 'play',
      if: (s, p, _self, e) => e.player === p && e.from === 'trash' && e.zone === 'character' && e.uid !== undefined
        && s.players[p].chars.some((c) => c.uid === e.uid) && hasType(e.num ?? '', 'Land of Wano'),
      run: (ctx, e) => {
        const c = ctx.s.players[ctx.me].chars.find((x) => x.uid === e.uid);
        if (!c) return;
        addMod(ctx.s, { uid: c.uid, stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source: 'Yamato' });
        log(ctx.s, ctx.me, `${def(c.num).name} gagne [Initiative] pour le tour (Yamato)`);
      },
    }],
  },

  // Momonosuké Kozuki : [Activation : Principale] se placer dans la Défausse (coût 20 ou plus) : avec 9 DON!! ou plus
  // sur le terrain, jouer jusqu'à 1 [Momonosuké Kozuki] de coût 9 de la Défausse
  'OP16-084': card({
    activateMain: {
      label: 'Momonosuké Kozuki : jouer un Momonosuké de coût 9 de la Défausse',
      cost: trashSelfCost20,
      effect: when(donOnFieldAtLeast(9), playFromTrash({ name: 'Kouzuki Momonosuke', costMin: 9, costMax: 9 }, 'Momonosuké Kozuki')),
    },
  }),

  // Gecko Moria : [Déclenchement] avec 1 Vie ou moins, jouer de la Défausse jusqu'à 1 [Absalom], 1 [Docteur Hogback] et 1
  // [Perona], de coût 4 ou moins chacun
  'OP16-105': card({
    onTrigger: when(lifeAtMost(1), seq(
      playFromTrash({ name: 'Absalom', costMax: 4 }, 'Gecko Moria'),
      playFromTrash({ name: 'Dr. Hogback', costMax: 4 }, 'Gecko Moria'),
      playFromTrash({ name: 'Perona', costMax: 4 }, 'Gecko Moria'),
    )),
  }),

  // Marshall D. Teach (Leader) : [Tour adverse] ses Personnages +1 de coût ; [Attaque adverse] [Une fois par tour]
  // défausser 1 carte ayant [Déclenchement] : l'attaque vise ce Leader ou un de ses Personnages {Équipage de Barbe Noire}
  'OP16-080': {
    costAura: (s, p, _src, target) => (s.active !== p && isOwnChar(s, p, target) ? 1 : 0),
    onOpponentAttack: {
      run: (ctx) => {
        const { s } = ctx;
        const self = s.players[ctx.me].leader;
        const b = s.battle;
        if (self.uid !== ctx.source || !b || self.usedOpt.includes('teach')) return;
        const targets = fieldCards(s, ctx.me).filter((c) => c.uid !== b.target && (c.uid === self.uid || hasType(c.num, 'Blackbeard Pirates')));
        const cost = discardCost(1, { trigger: true });
        if (!targets.length || !cost.can(s, ctx.me, ctx.source)) return;
        if (ctx.ask({ prompt: 'Marshall D. Teach : défausser 1 carte ayant [Déclenchement] pour changer la cible de l’attaque ?', options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }], tag: 'may' }) !== 'yes') return;
        self.usedOpt.push('teach');
        if (!cost.pay(ctx)) return;
        const answer = targets.length === 1 ? targets[0].uid : Number(ctx.ask({
          prompt: 'Nouvelle cible de l’attaque :',
          options: targets.map((c) => ({ id: `card:${c.uid}`, label: c.uid === self.uid ? `${def(c.num).name} (Leader)` : def(c.num).name, uid: c.uid })),
          tag: 'teachTarget',
        }).split(':')[1]);
        b.target = answer;
        log(s, ctx.me, `Marshall D. Teach : l'attaque vise maintenant ${def(fieldCards(s, ctx.me).find((c) => c.uid === answer)!.num).name}`);
      },
    },
  },
};
