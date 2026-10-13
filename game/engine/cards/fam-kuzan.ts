// FAMILLE DU LEADER KUZAN (phase 4E) : cartes bleues {Marine} jouables en format Standard, codées d'après leur texte
// officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Beaucoup placent des Personnages sous le deck ou font
// défausser (le Leader Kuzan pioche alors autant). Chaque condition se vérifie dans la partie. Les choix d'interprétation
// sont dans game/docs/interpretations.md.
import {
  addMod, canLeaveByEffect, def, discardFromHand, fieldCost, findField, hasKeyword, leaderHasType, log, other, removeByEffect,
  restByEffect,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  all, anyChar, bothCosts, bottomOfDeck, bounce, card, discardCost, drawCards, effect, giveDon, grant, handToBottom, leaderNamed,
  lookTopArrange, lookTopPlay, oppChar, oppHandToBottom, ownLeaderOrChar, playFromHand, powerMod, restDon, restSelf, searchTop,
  selfDon, seq, when, withCost, type Cost, type Effect,
} from './bricks.ts';

const NAVY = 'Navy';  // {Marine}
const navyLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, NAVY);
const onField = (s: GameState, p: PlayerId, uid: number) => s.players[p].chars.some((c) => c.uid === uid);

// Effet de remplacement d'une carte {Marine} pendant l'effet adverse : c'est sa carte qui s'épuise ou fait défausser
// (le Leader Kuzan pioche alors)
const ownCtx = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({ ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num });
function discardBySelf(ctx: EffectCtx, owner: PlayerId, self: FieldCard, prompt: string) {
  discardFromHand(ownCtx(ctx, owner, self), owner, 1, prompt);
}

// It's a Waste of Human Life!! : tous les Personnages de coût N ou moins (des deux camps) sous le deck de leur
// propriétaire
const bottomAll = (costMax: number, source: string): Effect => {
  const list = (s: GameState, p: PlayerId, side: PlayerId) => s.players[side].chars.filter((c) => fieldCost(s, c.uid) <= costMax && canLeaveByEffect(s, c.uid, p));
  return {
    run: (ctx) => {
      const uids = [...list(ctx.s, ctx.me, ctx.opp), ...list(ctx.s, ctx.me, ctx.me)].map((c) => c.uid);
      if (uids.length) log(ctx.s, ctx.me, `place sous le deck de leur propriétaire tous les Personnages de coût ${costMax} ou moins (${source})`);
      for (const uid of uids) if (findField(ctx.s, uid)) removeByEffect(ctx, uid, 'deckBottom');
    },
    // utile quand l'adversaire y perd plus que soi
    useful: (s, p) => list(s, p, other(p)).length > list(s, p, p).length,
  };
};

// « Vous et votre adversaire défaussez des cartes jusqu'à avoir 5 cartes en main »
const bothTrimTo5: Effect = effect((ctx) => {
  for (const p of [ctx.me, ctx.opp]) {
    const n = ctx.s.players[p].hand.length - 5;
    if (n > 0) discardFromHand(ctx, p, n, 'It’s a Waste of Human Life!! : carte à défausser (jusqu’à 5 cartes en main) :');
  }
});

// Aramaki : coût « placer 1 Personnage de coût 2 ou moins au-dessous du deck de son propriétaire »
const bottomCharCost = (costMax: number): Cost => {
  const list = (s: GameState, p: PlayerId) => [...s.players[other(p)].chars, ...s.players[p].chars]
    .filter((c) => fieldCost(s, c.uid) <= costMax && canLeaveByEffect(s, c.uid, p)).map((c) => c.uid);
  return {
    label: `placer 1 Personnage de coût ${costMax} ou moins au-dessous du deck de son propriétaire`,
    can: (s, p) => list(s, p).length > 0,
    pay: (ctx) => {
      const options = list(ctx.s, ctx.me);
      if (!options.length) return false;
      const answer = ctx.ask({
        prompt: `Personnage de coût ${costMax} ou moins à placer au-dessous du deck de son propriétaire :`,
        options: options.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })),
        tag: 'oppRemove',
      });
      removeByEffect(ctx, Number(answer.split(':')[1]), 'deckBottom');
      return true;
    },
  };
};

// Tsuru : « votre adversaire renvoie 1 de ses Personnages dans la main de son propriétaire » (il le choisit)
const oppReturnsOne: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.opp].chars.filter((c) => canLeaveByEffect(ctx.s, c.uid, ctx.me));
    if (!list.length) return;
    const answer = ctx.ask({
      player: ctx.opp,
      prompt: 'Tsuru : lequel de tes Personnages renvoyer dans ta main ?',
      options: list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'returnOwn',
    });
    removeByEffect(ctx, Number(answer.split(':')[1]), 'hand');
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => canLeaveByEffect(s, c.uid, p)),
};

// Monkey.D.Garp (OP06-055) : l'adversaire ne peut pas activer [Bloqueur] pendant ce combat
const noBlockersThisBattle: Effect = effect((ctx) => {
  for (const c of ctx.s.players[ctx.opp].chars) addMod(ctx.s, { uid: c.uid, stat: 'noBlocker', amount: 0, until: 'battle', source: 'Monkey.D.Garp' });
  log(ctx.s, ctx.me, 'l’adversaire ne peut pas activer [Bloqueur] pendant ce combat (Monkey.D.Garp)');
}, (s, p) => s.players[other(p)].chars.some((c) => !c.rested && hasKeyword(s, other(p), c, 'Blocker')));

// Épée céleste : jusqu'à 1 Personnage adverse de coût 2 ou moins et jusqu'à 1 de coût 1 ou moins sous le deck
const celestialSword: Effect = seq(bottomOfDeck(oppChar({ costMax: 2 }), 'Épée céleste'), bottomOfDeck(oppChar({ costMax: 1 }), 'Épée céleste'));

export const FAM_KUZAN: Record<string, CardBehavior> = {
  // Don Quijote Rosinante (EB02-025) : [Activation : Principale] épuiser 1 DON!! et lui-même : avec le Leader [Donquixote
  // Rosinante], 5 cartes du dessus, jouer épuisé un Personnage de coût 2 ou moins, le reste sous le deck
  'EB02-025': card({
    activateMain: {
      label: 'Don Quijote Rosinante : épuiser 1 DON!! et ce Personnage pour regarder 5 cartes',
      cost: bothCosts(restDon(1), restSelf()),
      effect: when(leaderNamed('Donquixote Rosinante'), lookTopPlay(5, { costMax: 2 }, 'Don Quijote Rosinante', { rested: true })),
    },
  }),

  // Iska : [Bloqueur] ; [Jouée] un Personnage de coût 4 ou moins sous le deck de son propriétaire
  'EB03-022': card({ onPlay: bottomOfDeck(anyChar({ costMax: 4 }), 'Iska') }),

  // Hina (EB03-025) : [Jouée] défausser 1 carte : renvoyer en main un Personnage de 6000 de puissance de base
  'EB03-025': card({ onPlay: withCost(discardCost(1), bounce(anyChar({ basePowerMin: 6000, basePowerMax: 6000 }), 'Hina'), 'Hina') }),

  // Issho (EB04-022) : [Jouée] défausser 2 cartes : si l'adversaire a 6 cartes ou plus en main, il en place 2 sous son
  // deck ; [DON!! x1] [En attaquant] défausser 1 carte : −2000 à un Personnage adverse
  'EB04-022': card({
    onPlay: withCost(discardCost(2), when((s, p) => s.players[other(p)].hand.length >= 6, oppHandToBottom(2, 'Issho')), 'Issho'),
    whenAttacking: when(selfDon(1), withCost(discardCost(1), powerMod(oppChar(), -2000, 'turn', 'Issho'), 'Issho')),
  }),

  // Borsalino (OP05-051) : [Jouée] un Personnage de coût 4 ou moins sous le deck de son propriétaire
  'OP05-051': card({ onPlay: bottomOfDeck(anyChar({ costMax: 4 }), 'Borsalino') }),

  // X.Drake (OP05-055) : [Bloqueur] ; [Jouée] 5 cartes du dessus remises au-dessus ou au-dessous dans l'ordre choisi
  'OP05-055': card({ onPlay: lookTopArrange(5, 'X.Drake') }),

  // Chien ardent : [Principale] +3000 pour le tour à son Leader ou un Personnage, puis un Personnage de coût 2 ou moins
  // sous le deck ; [Déclenchement] renvoyer en main un Personnage de coût 3 ou moins
  'OP05-057': card({
    onMain: seq(powerMod(ownLeaderOrChar(), 3000, 'turn', 'Chien ardent'), bottomOfDeck(anyChar({ costMax: 2 }), 'Chien ardent')),
    onTrigger: bounce(anyChar({ costMax: 3 }), 'Chien ardent'),
  }),

  // It's a Waste of Human Life!! : [Principale] tous les Personnages de coût 3 ou moins sous le deck, puis les deux joueurs
  // défaussent jusqu'à 5 cartes en main ; [Déclenchement] tous les Personnages de coût 2 ou moins sous le deck
  'OP05-058': card({
    onMain: seq(bottomAll(3, 'It’s a Waste of Human Life!!'), bothTrimTo5),
    onTrigger: bottomAll(2, 'It’s a Waste of Human Life!!'),
  }),

  // Aramaki : [Bloqueur] ; [Activation : Principale] [Une fois par tour] défausser 1 carte et placer un Personnage de coût
  // 2 ou moins sous le deck : +3000 pour le tour
  'OP06-043': card({
    activateMain: {
      label: 'Aramaki : défausser 1 carte et placer un Personnage de coût 2 ou moins sous le deck pour gagner +3000',
      once: true,
      cost: bothCosts(bottomCharCost(2), discardCost(1)),
      effect: effect((ctx) => {
        addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 3000, until: 'turn', source: 'Aramaki' });
        log(ctx.s, ctx.me, 'Aramaki gagne +3000 de puissance pour le tour');
      }, (s, p) => s.players[other(p)].chars.some((c) => fieldCost(s, c.uid) <= 2 && canLeaveByEffect(s, c.uid, p))),
    },
  }),

  // Gion : [Votre tour] [Une fois par tour] quand l'adversaire active un Événement, il place 1 carte de sa main sous son
  // deck
  'OP06-044': {
    when: [{
      on: 'event',
      once: 'gion',
      if: (s, owner, self, e) => e.player === other(owner) && s.active === owner && onField(s, owner, self.uid),
      run: (ctx) => oppHandToBottom(1, 'Gion').run(ctx),
    }],
  },

  // Kuzan (OP06-045) : [Jouée] piocher 2, puis 2 cartes de sa main sous son deck dans l'ordre choisi
  'OP06-045': card({ onPlay: seq(drawCards(2), handToBottom(2, 'Kuzan')) }),

  // Sakazuki (OP06-046) : [Jouée] un Personnage de coût 2 ou moins sous le deck de son propriétaire
  'OP06-046': card({ onPlay: bottomOfDeck(anyChar({ costMax: 2 }), 'Sakazuki') }),

  // Tashigi (OP06-050) : [Jouée] 5 cartes du dessus, une carte {Marine} autre que [Tashigi]
  'OP06-050': card({ onPlay: searchTop(5, 1, { type: NAVY, notName: 'Tashigi' }, 'une carte {Marine} autre que [Tashigi]') }),

  // Tsuru : [Jouée] défausser 2 cartes : l'adversaire renvoie 1 de ses Personnages dans sa main
  'OP06-051': card({ onPlay: withCost(discardCost(2), oppReturnsOne, 'Tsuru') }),

  // Tokikake : [DON!! x1] avec 4 cartes ou moins en main, pas mis KO en combat
  'OP06-052': { cantBeKO: (s, p, self, cause) => cause === 'battle' && self.don >= 1 && s.players[p].hand.length <= 4 },

  // Jaguar.D.Saul : [En cas de KO] un Personnage de coût 2 ou moins sous le deck de son propriétaire
  'OP06-053': card({ onKO: bottomOfDeck(anyChar({ costMax: 2 }), 'Jaguar.D.Saul') }),

  // Borsalino (OP06-054) : [Bloqueur] avec 5 cartes ou moins en main
  'OP06-054': { blocker: (s, p) => s.players[p].hand.length <= 5 },

  // Monkey.D.Garp (OP06-055) : [DON!! x2] [En attaquant] avec 4 cartes ou moins en main, pas de [Bloqueur] adverse
  'OP06-055': card({ whenAttacking: when(all(selfDon(2), (s, p) => s.players[p].hand.length <= 4), noBlockersThisBattle) }),

  // Épée céleste : [Principale] et [Déclenchement] (activer l'effet [Principale])
  'OP06-056': card({ onMain: celestialSword, onTrigger: celestialSword }),

  // Lame-gravité, tigre furieux : [Principale] jusqu'à 2 Personnages de coût 6 ou moins sous le deck ; [Déclenchement] un
  // de coût 5 ou moins
  'OP06-058': card({
    onMain: bottomOfDeck(anyChar({ costMax: 6 }), 'Lame-gravité, tigre furieux', 2),
    onTrigger: bottomOfDeck(anyChar({ costMax: 5 }), 'Lame-gravité, tigre furieux'),
  }),

  // White Snake : [Contre] +1000 pour le tour à son Leader ou un Personnage, et piocher 1 ; [Déclenchement] 5 cartes du
  // dessus remises au-dessus ou au-dessous
  'OP06-059': card({
    onCounter: seq(powerMod(ownLeaderOrChar(), 1000, 'turn', 'White Snake'), drawCards(1)),
    onTrigger: lookTopArrange(5, 'White Snake'),
  }),

  // Sengoku (OP07-046) : [Jouée] 5 cartes du dessus, une carte {Grand Corsaire}
  'OP07-046': card({ onPlay: searchTop(5, 1, { type: 'The Seven Warlords of the Sea' }, 'une carte {Grand Corsaire}') }),

  // Sakazuki (OP12-044) : [Jouée] avec un Leader {Marine}, piocher 2 ; [Activation : Principale] [Une fois par tour]
  // défausser 1 carte : 1 DON!! épuisée à son Leader ou un Personnage
  'OP12-044': card({
    onPlay: when(navyLeader, drawCards(2)),
    activateMain: {
      label: 'Sakazuki : défausser 1 carte pour donner 1 DON!! épuisée',
      once: true,
      cost: discardCost(1),
      effect: giveDon(ownLeaderOrChar(), 1, 'Sakazuki'),
    },
  }),

  // Don Quijote Rosinante (OP12-048) : [Tour adverse] à la place d'un de ses Personnages {Marine} bleus retiré par un
  // effet adverse, s'épuiser et défausser 1 carte
  'OP12-048': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Don Quijote Rosinante : s'épuiser et défausser 1 carte pour garder ${def(victim.num).name}`,
      condition: (s, p, self, victim) => s.active !== p && !self.rested && s.players[p].hand.length > 0
        && def(victim.num).types.includes(NAVY) && def(victim.num).colors.includes('Blue'),
      apply: (s, p, self, victim, ctx) => {
        restByEffect(ownCtx(ctx, p, self), self.uid);
        discardBySelf(ctx, p, self, 'Don Quijote Rosinante : carte à défausser :');
        log(s, p, `${def(victim.num).name} reste sur le terrain (Don Quijote Rosinante)`);
      },
    },
  },

  // Hina (OP12-051) : [Activation : Principale] s'épuiser et défausser 1 carte : un Personnage adverse de coût de base 4 ou
  // moins ne peut pas activer [Bloqueur] pour le tour
  'OP12-051': card({
    activateMain: {
      label: 'Hina : s’épuiser et défausser 1 carte pour qu’un Personnage adverse ne puisse pas activer [Bloqueur]',
      cost: bothCosts(restSelf(), discardCost(1)),
      effect: {
        ...grant(oppChar({ baseCostMax: 4 }), { stat: 'noBlocker' }, 'turn', 'Hina', 'ne peut pas activer [Bloqueur]'),
        useful: (s, p) => s.players[other(p)].chars.some((c) => (def(c.num).cost ?? 0) <= 4 && !c.rested && hasKeyword(s, other(p), c, 'Blocker')),
      },
    },
  }),

  // Borsalino (OP12-053) : [Une fois par tour] retiré par un effet adverse, défausser 1 carte à la place ; [Tour adverse]
  // avec un Leader {Marine}, [Bloqueur] et +1000
  'OP12-053': {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: () => 'Borsalino : défausser 1 carte pour rester sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].hand.length > 0,
      apply: (_s, p, self, _victim, ctx) => discardBySelf(ctx, p, self, 'Borsalino : carte à défausser :'),
    },
    blocker: (s, p) => s.active !== p && navyLeader(s, p),
    selfPower: (s, p) => (s.active !== p && navyLeader(s, p) ? 1000 : 0),
  },

  // Monkey D. Garp (OP12-056) : [Jouée] défausser 1 carte : jouer de sa main un Personnage {Marine} bleu de 8000 ou
  // moins autre que [Monkey.D.Garp]
  'OP12-056': card({
    onPlay: withCost(discardCost(1), playFromHand({ type: NAVY, color: 'Blue', powerMax: 8000, notName: 'Monkey.D.Garp' }, 'Monkey D. Garp'), 'Monkey D. Garp'),
  }),

  // Monkey.D.Garp (P-054) : [DON!! x1] pas mis KO en combat par une carte d'attribut <Frappe>
  'P-054': {
    cantBeKO: (s, _p, self, cause) => cause === 'battle' && self.don >= 1 && Boolean(s.battle)
      && def(findField(s, s.battle!.attacker)?.card.num ?? self.num).attributes.includes('Strike'),
  },
};
