// EB05 (tâche S1 de l'étape C) : cartes que le traducteur ne comprend pas, codées à la main d'après le texte officiel,
// et morceaux « code à la main » des recettes de recipes/sets/eb05.ts (MANUAL_EB05). Aucun texte de carte ici : les
// commentaires disent l'effet avec nos mots.
import {
  addMod, basePower, canTakeLife, chooseUpTo1, def, donOnField, emit, findField, lifeToHand, log, other, removeByEffect,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import type { ManualRegistry } from '../recipes/types.ts';
import {
  bothCosts, candidates, card, chooseOne, discard, discardCost, drawCards, effect, ko, leaderPower, leaderType, oppChar,
  oppDiscards, oppHandAtLeast, playFromHand, rest, restDon, seq, trashAtLeast, when, withCost, type Cost, type Effect,
} from './bricks.ts';
import { modTargets } from './bricks-power.ts';
import { koOwnCharCost } from './bricks-removal.ts';

// « Vous pouvez [coût] : [effet] » : proposé seulement si l'effet peut servir (convention n° 1000 des recettes)
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// Cage Extensible (EB05-029) : les effets d'un Personnage adverse de coût 6 ou moins sont annulés pour le tour, puis il
// retourne dans la main de son propriétaire (annulé d'abord : ses effets de remplacement ne le protègent plus)
const negateThenBounce = (costMax: number, source: string): Effect => {
  const t = oppChar({ costMax });
  return {
    run: (ctx) => {
      const uid = chooseUpTo1(ctx, candidates(ctx.s, ctx.me, t, undefined, ctx.source), `${source} : ${t.label} dont les effets sont annulés, puis renvoyé dans la main de son propriétaire :`, 'bounce');
      if (uid === null) return;
      addMod(ctx.s, { uid, stat: 'negated', amount: 0, until: 'turn', source });
      log(ctx.s, ctx.me, `les effets de ${def(findField(ctx.s, uid)!.card.num).name} sont annulés pour le tour (${source})`);
      removeByEffect(ctx, uid, 'hand');
    },
    useful: (s, p, self) => candidates(s, p, t, undefined, self).length > 0,
  };
};

// Stinger Hedgehog (EB05-048) : tous les Personnages adverses de coût 0 (au moment où l'effet se résout) ne peuvent pas
// activer [Bloqueur] pour le tour
const noBlockerCost0 = (source: string): Effect => modTargets(oppChar({ costMax: 0 }), { stat: 'noBlocker', amount: 0 }, 'turn', source,
  'ne peut pas activer [Bloqueur]', { all: true });

// Nami (EB05-061) : une fois par tour, si un de ses Personnages de 6000 de puissance de base ou moins devait quitter le
// terrain à cause de l'adversaire, elle peut ajouter à sa main la carte du dessus de sa Vie à la place. Lecture retenue
// (en doute, recipes/sets/eb05.ts) : les effets adverses ET la mise KO en combat par une attaque adverse.
const NAMI_KEY = 'replace';
const namiFits = (s: GameState, owner: PlayerId, self: { uid: number; usedOpt: string[] }, victimUid: number) =>
  !self.usedOpt.includes(NAMI_KEY) && Boolean(findField(s, self.uid)) && s.players[owner].chars.some((c) => c.uid === victimUid)
  && basePower(s, victimUid) <= 6000 && s.players[owner].life.length > 0 && canTakeLife(s, owner);
const namiApply = (s: GameState, owner: PlayerId) => {
  lifeToHand(s, owner, 'top');
  log(s, owner, 'Nami : ajoute la carte du dessus de sa Vie à sa main à la place');
};
const NAMI: CardBehavior = {
  replaceRemoval: {
    oncePerTurn: true,
    onlyKo: false,
    label: (_s, _self, victim) => `Nami : prendre la carte du dessus de ta Vie pour que ${def(victim.num).name} reste sur le terrain`,
    condition: (s, owner, self, victim) => namiFits(s, owner, self, victim.uid),
    apply: (s, owner) => namiApply(s, owner),
  },
  // mise KO en combat par une attaque adverse (les KO par un effet passent par replaceRemoval)
  koReplaceAlly: {
    label: (_s, _self, victim) => `Nami : prendre la carte du dessus de ta Vie pour que ${def(victim.num).name} ne soit pas mis KO`,
    condition: (s, owner, self, victim) => Boolean(s.battle) && s.active === other(owner) && s.battle!.target === victim.uid
      && namiFits(s, owner, self, victim.uid),
    apply: (s, owner, self) => {
      self.usedOpt.push(NAMI_KEY);
      namiApply(s, owner);
    },
  },
};

// Sadi (EB05-024) : avec un Leader {Impel Down}, [Bloqueur] et +2 de coût (les deux sous la même condition)
const impelLeader = (s: GameState, p: PlayerId) => leaderType('Impel Down')(s, p, -1);
// Yamato (EB05-046) : avec un Personnage adverse de 8000 de puissance de base ou plus, [Bloqueur] et +3000
const bigOpp = (s: GameState, p: PlayerId) => s.players[other(p)].chars.some((c) => basePower(s, c.uid) >= 8000);
// Yamato [Attaque adverse] : avec 10 cartes ou plus dans la Défausse (lu après le coût), puissance de base du Leader 7000
const leaderBase7000 = (source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'basePower', amount: 7000, until: 'turn', source });
  log(ctx.s, ctx.me, `la puissance de base de son Leader devient 7000 pour le tour (${source})`);
});
const PERONA = 'Perona';

export const EB05: Record<string, CardBehavior> = {
  'EB05-024': { blocker: impelLeader, selfCost: (s, p) => (impelLeader(s, p) ? 2 : 0) },
  // Boa Hancock : [Jouée] si l'adversaire a 9 cartes ou plus en main, il en défausse 4
  'EB05-028': card({ onPlay: when(oppHandAtLeast(9), oppDiscards(4)) }),
  // Perona : [En cas de KO] mettre KO ou épuiser jusqu'à 1 Personnage adverse de coût 6 ou moins (n° 2001)
  'EB05-043': card({
    onKO: chooseOne(PERONA, [
      { label: '1. Mettre KO un Personnage adverse de coût 6 ou moins', effect: ko(oppChar({ costMax: 6 }), PERONA) },
      { label: '2. Épuiser un Personnage adverse de coût 6 ou moins', effect: rest(oppChar({ costMax: 6 }), PERONA) },
    ]),
  }),
  'EB05-046': card({
    // proposé si la Défausse aura 10 cartes une fois la carte du coût défaussée (le coût compte pour la condition)
    onOpponentAttack: when((s, p) => s.players[p].trash.length + 1 >= 10,
      withCost(discardCost(1), when(trashAtLeast(10), leaderBase7000('Yamato')), 'Yamato')),
  }, { blocker: bigOpp, selfPower: (s, p) => (bigOpp(s, p) ? 3000 : 0) }),
  // Cage Extensible : [Principale] défausser 1 carte pour annuler puis renvoyer un Personnage adverse de coût 6 ou moins ;
  // [Déclenchement] piocher 2 cartes et en défausser 1
  'EB05-029': card({
    onMain: mayPay(discardCost(1), negateThenBounce(6, 'Cage Extensible'), 'Cage Extensible'),
    onTrigger: seq(drawCards(2), discard(1)),
  }),
  // Stinger Hedgehog : [Principale] épuiser 1 DON!! et mettre KO 1 de ses Personnages « Baroque Works » : les Personnages
  // adverses de coût 0 perdent [Bloqueur] pour le tour ; [Contre] Leader +3000 pour le combat
  'EB05-048': card({
    onMain: mayPay(bothCosts(restDon(1), koOwnCharCost({ typeIncludes: 'Baroque Works' })), noBlockerCost0('Stinger Hedgehog'), 'Stinger Hedgehog'),
    onCounter: leaderPower(3000, 'battle', 'Stinger Hedgehog'),
  }),
  // Nami : remplacement ci-dessus ; [Jouée] jouer de sa main un Personnage rouge de coût 2 ou moins
  'EB05-061': card({ onPlay: playFromHand({ color: 'Red', costMax: 2 }, 'Nami') }, NAMI),
};

// ---------- Morceaux « code à la main » des recettes (recipes/sets/eb05.ts) ----------

export const MANUAL_EB05: ManualRegistry = {
  // Nico Robin (EB05-033) : au moins 6 DON!! de moins sur son terrain que sur celui de l'adversaire
  'EB05-033': {
    conds: { donGap6: (ctx: EffectCtx) => donOnField(ctx.s, ctx.me) <= donOnField(ctx.s, ctx.opp) - 6 },
  },
  // EB05-040 : coût « renvoyer 1 de ses DON!! redressées au deck DON!! » (seulement une DON!! redressée de la zone de Coût)
  'EB05-040': {
    costs: {
      returnActiveDon: {
        canPay: (ctx: EffectCtx) => ctx.s.players[ctx.me].donActive >= 1,
        pay: (ctx: EffectCtx) => {
          const P = ctx.s.players[ctx.me];
          if (P.donActive < 1) return false;
          P.donActive--;
          P.donDeck++;
          log(ctx.s, ctx.me, 'renvoie 1 DON!! redressée dans son deck DON!!');
          emit(ctx.s, { type: 'donReturned', player: ctx.me, count: 1 });
          return true;
        },
      },
    },
  },
};

