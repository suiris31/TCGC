// FAMILLES DES LEADERS DU MÉTA (phase 4E) : cartes jouables en format Standard qui manquaient autour des Leaders Rocks D.
// Xebec ({Équipage de Rocks}, bleu), Ener ({Île céleste}, violet) et Dracule Mihawk (Grands corsaires, vert), codées
// d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Chaque condition se vérifie dans la
// partie. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, basePower, canBeRested, chooseUpTo1, def, discardFromHand, donOnField, emit, findField, hasType, knownFirst, log,
  restByEffect, reveal, returnDon, setActive, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  bothCosts, card, discard, discardCost, donMinus, donOnFieldAtMost, drawCards, effect, grant, ko, lookTopArrange, onceWithCost,
  oppChar, oppLeaderOrChar, ownChar, ownLeaderOrChar, powerMod, readyDon, rest, restCost, restSelf, searchTop, seq, setActiveTargets,
  trashToHand, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost, isNamed, playCharFromHand } from './common.ts';

const SIX_DON = donOnFieldAtMost(6);
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const leaderBattle = (amount: number, source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
});
const named = (s: GameState, p: PlayerId, name: string) => s.players[p].chars.some((c) => isNamed(c.num, name));
const restedChars = (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => c.rested).length;

// « Ce Personnage gagne +X / [mot-clé] » (la carte qui porte l'effet)
function selfMod(ctx: EffectCtx, mod: { stat: 'power'; amount: number } | { stat: 'keyword'; keyword: 'Blocker' }, until: 'turn' | 'oppNextEnd', source: string) {
  const f = findField(ctx.s, ctx.source);
  if (!f) return;
  const u = until === 'oppNextEnd' ? untilOpponentsNextEnd(ctx.s, ctx.me) : 'turn';
  addMod(ctx.s, { uid: ctx.source, amount: 0, ...mod, until: u, source });
  const what = mod.stat === 'power' ? `+${mod.amount} de puissance` : '[Bloqueur]';
  log(ctx.s, ctx.me, `${def(f.card.num).name} gagne ${what} ${u === 'turn' ? 'pour le tour' : 'jusqu’à la fin du prochain tour adverse'} (${source})`);
}

// Barbell : « votre adversaire place 2 cartes de sa main au-dessous de son deck dans l'ordre de son choix » (il les
// choisit ; lui seul sait lesquelles)
const oppHandToBottom = (n: number, source: string): Effect => effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  for (let i = 0; i < n && O.hand.length; i++) {
    const options = uniqueByNum(knownFirst(ctx.s, ctx.opp, O.hand));
    const answer = ctx.ask({
      player: ctx.opp,
      prompt: `${source} : carte de ta main à placer au-dessous de ton deck (${i + 1}/${n}) :`,
      options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'discard',
    });
    const [c] = O.hand.splice(O.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    O.deck.push(c);
    reveal(ctx.s, [c.uid], ctx.opp);
    log(ctx.s, ctx.opp, `place 1 carte de sa main au-dessous de son deck (${source})`);
  }
}, (s, p) => s.players[p === 0 ? 1 : 0].hand.length > 0);

// Amazon : « votre adversaire peut renvoyer 1 de ses DON!! redressées ; s'il ne le fait pas, −2000 »
const amazon: Effect = {
  run: (ctx) => {
    const O = ctx.s.players[ctx.opp];
    const pay = O.donActive > 0 && ctx.ask({
      player: ctx.opp,
      prompt: 'Amazon : renvoyer 1 de tes DON!! redressées dans ton deck DON!! ? Sinon, un de tes Personnages ou ton Leader reçoit −2000.',
      options: [{ id: 'yes', label: 'Oui, renvoyer 1 DON!!' }, { id: 'no', label: 'Non' }],
      tag: 'oppPayDon',
    }) === 'yes';
    if (pay) {
      O.donActive--;
      O.donDeck++;
      log(ctx.s, ctx.opp, 'renvoie 1 DON!! redressée dans son deck DON!! (Amazon)');
      emit(ctx.s, { type: 'donReturned', player: ctx.opp, count: 1, by: ctx.me, cause: 'effect', sourceNum: ctx.num });
      return;
    }
    powerMod(oppLeaderOrChar(), -2000, 'turn', 'Amazon').run(ctx);
  },
  useful: () => true,
};

// Fuza : lui et les [Shura]
const fuzaTarget = (src: FieldCard, target: FieldCard) => target.uid === src.uid || isNamed(target.num, 'Shura');

export const FAM_META: Record<string, CardBehavior> = {
  // ---------- Rocks D. Xebec : {Équipage de Rocks} ----------

  // Ganzui : s'il devait quitter le terrain, défausser 2 cartes à la place ; [Jouée] la puissance de base de son Leader
  // devient 6000 jusqu'à la fin du prochain tour adverse
  'OP17-043': card({
    onPlay: effect((ctx) => {
      const leader = ctx.s.players[ctx.me].leader;
      addMod(ctx.s, { uid: leader.uid, stat: 'basePower', amount: 6000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Ganzui' });
      log(ctx.s, ctx.me, 'la puissance de base de son Leader devient 6000 jusqu’à la fin du prochain tour adverse (Ganzui)');
    }),
  }, {
    koReplace: {
      label: 'Défausser 2 cartes de ta main',
      condition: (s, p) => s.players[p].hand.length >= 2,
      apply: (s, p, self, ctx) => {
        if (discardFromHand(ctx, p, 2, 'Ganzui : carte à défausser à la place') === 2) log(s, p, `${def(self.num).name} reste sur le terrain (2 cartes défaussées)`);
      },
    },
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      exceptKo: true,
      label: () => 'Ganzui : défausser 2 cartes de ta main pour qu’il reste sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[p].hand.length >= 2,
      apply: (_s, p, _self, _victim, ctx) => { discardFromHand(ctx, p, 2, 'Ganzui : carte à défausser à la place'); },
    },
  }),

  // Streusen : [Jouée] regarder 2 cartes du dessus, les remettre dessus ou dessous dans l'ordre de son choix, puis piocher
  'OP17-050': card({ onPlay: seq(lookTopArrange(2, 'Streusen'), drawCards(1)) }),

  // Don Marlon : [Jouée] ajouter à sa main un Événement bleu de coût 0 de sa Défausse
  'OP17-052': card({ onPlay: trashToHand({ color: 'Blue', category: 'EVENT', costMax: 0 }, 'Don Marlon') }),

  // Barbell : [En cas de KO] l'adversaire place 2 cartes de sa main sous son deck ; [Activation : Principale] [Une fois
  // par tour] défausser 1 carte : +3000 pour le tour
  'OP17-053': card({
    onKO: oppHandToBottom(2, 'Barbell'),
    activateMain: {
      label: 'Barbell : défausser 1 carte pour gagner +3000 pour le tour',
      once: true,
      cost: discardCost(1),
      effect: effect((ctx) => selfMod(ctx, { stat: 'power', amount: 3000 }, 'turn', 'Barbell')),
    },
  }),

  // Ruche (Lieu) : [Attaque adverse] s'épuiser et défausser 1 carte : +1000 pour le combat à son Leader ou un Personnage
  // incluant « Équipage de Rocks » dans son type
  'OP17-057': card({
    onOpponentAttack: withCost(bothCosts(restSelf(), discardCost(1)), powerMod(ownLeaderOrChar({ typeIncludes: 'Rocks Pirates' }), 1000, 'battle', 'Ruche'), 'Ruche'),
  }),

  // ---------- Ener : {Île céleste} ----------

  // Amazon : [Attaque adverse] s'épuiser : l'adversaire renvoie 1 DON!! redressée, sinon −2000 à un de ses Leaders ou
  // Personnages
  'OP15-059': card({ onOpponentAttack: withCost(restSelf(), amazon, 'Amazon') }),

  // Ener (OP15-060) : avec 6 DON!! ou moins sur son terrain, +2000 et ne quitte pas le terrain à cause d'un effet adverse ;
  // [Activation : Principale] DON!! −1 : [Bloqueur] jusqu'à la fin du prochain tour adverse, puis défausser 1 carte
  'OP15-060': card({
    activateMain: {
      label: 'Ener : DON!! −1 pour gagner [Bloqueur] jusqu’à la fin du prochain tour adverse (puis défausser 1 carte)',
      cost: donMinus(1),
      effect: seq(effect((ctx) => selfMod(ctx, { stat: 'keyword', keyword: 'Blocker' }, 'oppNextEnd', 'Ener')), discard(1)),
    },
  }, {
    selfPower: (s, p) => (SIX_DON(s, p, -1) ? 2000 : 0),
    cantLeave: (s, p) => SIX_DON(s, p, -1),
  }),

  // Gedatsu : [Jouée] DON!! −1 : piocher 1 carte ; [En cas de KO] avec 6 DON!! ou moins, KO d'un Personnage adverse de
  // 2000 ou moins
  'OP15-063': card({
    onPlay: withCost(donMinus(1), drawCards(1), 'Gedatsu'),
    onKO: when(SIX_DON, ko(oppChar({ powerMax: 2000 }), 'Gedatsu')),
  }),

  // Kotori : [Activation : Principale] DON!! −2 et s'épuiser : avec [Satori] et [Hotori], épuiser un Personnage adverse de
  // 5000 ou moins
  'OP15-064': card({
    activateMain: {
      label: 'Kotori : DON!! −2 et s’épuiser pour épuiser un Personnage adverse de 5000 ou moins (avec Satori et Hotori)',
      cost: bothCosts(donMinus(2), restSelf()),
      effect: when((s, p) => named(s, p, 'Satori') && named(s, p, 'Hotori'), rest(oppChar({ powerMax: 5000 }), 'Kotori')),
    },
  }),

  // Garde sacrée : [Bloqueur] avec 6 DON!! ou moins sur son terrain
  'OP15-068': { blocker: (s, p) => SIX_DON(s, p, -1) },

  // Nora : à la place d'un de ses Personnages de 7000 de puissance de base ou moins qui quitterait le terrain à cause
  // d'un effet adverse, renvoyer 1 DON!! de son terrain
  'OP15-069': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Nora : renvoyer 1 DON!! de ton terrain, ${def(victim.num).name} reste sur le terrain`,
      condition: (s, p, _self, victim) => basePower(s, victim.uid) <= 7000 && donOnField(s, p) > 0,
      apply: (s, p, _self, victim) => {
        returnDon(s, p, 1);
        log(s, p, `renvoie 1 DON!! à la place : ${def(victim.num).name} reste sur le terrain (Nora)`);
      },
    },
  },

  // Fuza : lui et ses [Shura] gagnent [Imblocable] ; [Tour adverse] leur puissance de base devient 6000
  'OP15-070': {
    keywordAura: (_s, _p, src, target, k) => k === 'Unblockable' && fuzaTarget(src, target),
    aura: (s, p, src, target) => (s.active !== p && fuzaTarget(src, target) ? 6000 - basePower(s, target.uid) : 0),
  },

  // Hotori : [Activation : Principale] DON!! −2 et s'épuiser : avec [Kotori] et [Satori], −3000 à un Personnage adverse
  'OP15-072': card({
    activateMain: {
      label: 'Hotori : DON!! −2 et s’épuiser pour donner −3000 à un Personnage adverse (avec Kotori et Satori)',
      cost: bothCosts(donMinus(2), restSelf()),
      effect: when((s, p) => named(s, p, 'Kotori') && named(s, p, 'Satori'), powerMod(oppChar(), -3000, 'turn', 'Hotori')),
    },
  }),

  // Yama : [Bloqueur] ; [Jouée] jouer de sa main une [Garde sacrée] de coût 1 ou un Personnage {Vassaux} de coût 1
  'OP15-073': card({
    onPlay: effect((ctx) => {
      playCharFromHand(ctx, (c) => def(c.num).cost === 1 && (isNamed(c.num, 'Heavenly Warriors') || hasType(c.num, 'Vassals')),
        'Yama : jouer une [Garde sacrée] ou un Personnage {Vassaux} de coût 1 de ta main :');
    }),
  }),

  // ---------- Dracule Mihawk : Grands corsaires ----------

  // Off-White : [Contre] +4000, puis 3 cartes du dessus, un Personnage {Équipage de Don Quijote}
  'EB01-019': card({
    onCounter: seq(counterOn(4000, 'Off-White'), searchTop(3, 1, { type: 'Donquixote Pirates', category: 'CHARACTER' }, 'un Personnage {Équipage de Don Quijote}')),
  }),

  // Crocodile (OP09-025) : avec un Leader {ODYSSEY}, ne peut pas être mis KO en combat par un Leader
  'OP09-025': {
    cantBeKO: (s, owner, _self, cause, by) => cause === 'battle' && def(s.players[owner].leader.num).types.includes('ODYSSEY')
      && s.battle?.attacker === s.players[by].leader.uid,
  },

  // Don Quijote Doflamingo (OP09-031) : [Bloqueur] ; [Fin de votre tour] avec 2 Personnages épuisés ou plus, se redresser
  'OP09-031': card({
    endOfTurn: when((s, p) => restedChars(s, p) >= 2, effect((ctx) => { setActive(ctx.s, ctx.me, ctx.source); })),
  }),

  // Dracule Mihawk (OP10-029) : [Jouée] avec 2 Personnages épuisés ou plus, redresser un {ODYSSEY} épuisé de coût 5 ou
  // moins
  'OP10-029': card({
    onPlay: when((s, p) => restedChars(s, p) >= 2, setActiveTargets(ownChar({ type: 'ODYSSEY', costMax: 5 }), 'Dracule Mihawk')),
  }),

  // « Les faibles ne peuvent pas choisir leur mort » : [Principale] et [Contre] KO d'un Personnage adverse épuisé de coût 7
  // ou moins
  'OP10-040': card({
    onMain: ko(oppChar({ rested: true, costMax: 7 }), 'Les faibles ne peuvent pas choisir leur mort'),
    onCounter: ko(oppChar({ rested: true, costMax: 7 }), 'Les faibles ne peuvent pas choisir leur mort'),
  }),

  // Dracule Mihawk (OP12-030) : [Bloqueur] ; [Jouée] redresser jusqu'à 4 DON!!, puis plus de Personnage de coût de base 7
  // ou plus ce tour-ci
  'OP12-030': card({
    onPlay: seq(readyDon(4), effect((ctx) => {
      ctx.s.players[ctx.me].noCharsFromCost = { turn: ctx.s.turn, cost: 7 };
      log(ctx.s, ctx.me, 'ne peut plus jouer de Personnage de coût de base 7 ou plus ce tour-ci (Dracule Mihawk)');
    })),
  }),

  // « Pour espérer pouvoir un jour me surpasser, Zoro !! » : [Contre] épuiser 1 de ses cartes : +4000 ; [Déclenchement]
  // épuiser 1 de ses cartes : épuiser un Personnage adverse de 7000 de puissance de base ou moins
  'OP14-036': card({
    onCounter: withCost(restCost(1, 'cards'), counterOn(4000, 'Pour espérer me surpasser, Zoro !!'), 'Pour espérer me surpasser, Zoro !!'),
    onTrigger: withCost(restCost(1, 'cards'), rest(oppChar({ basePowerMax: 7000 }), 'Pour espérer me surpasser, Zoro !!'), 'Pour espérer me surpasser, Zoro !!'),
  }),

  // « Je passe juste le temps » : [Principale] épuiser 3 de ses cartes : KO d'un Personnage adverse épuisé de 7000 de
  // puissance de base ou moins ; [Contre] Leader +3000
  'OP14-037': card({
    onMain: withCost(restCost(3, 'cards'), ko(oppChar({ rested: true, basePowerMax: 7000 }), 'Je passe juste le temps'), 'Je passe juste le temps'),
    onCounter: leaderBattle(3000, 'Je passe juste le temps'),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Dracule Mihawk (OP14-119) : [Votre tour] quand il est épuisé, un Personnage adverse de coût 9 ou moins ne peut pas
  // être épuisé jusqu'à la fin du prochain tour adverse ; [Attaque adverse] [Une fois par tour] défausser 1 carte : +2000
  // pour le combat à son Leader ou un Personnage
  'OP14-119': card({
    onOpponentAttack: onceWithCost('mihawk119', discardCost(1), powerMod(ownLeaderOrChar(), 2000, 'battle', 'Dracule Mihawk'), 'Dracule Mihawk'),
  }, {
    when: [{
      on: 'rest',
      if: (s, owner, self, e) => e.uid === self.uid && s.active === owner,
      run: (ctx) => grant(oppChar({ costMax: 9 }), { stat: 'cantRest' }, 'oppNextEnd', 'Dracule Mihawk', 'ne peut pas être épuisé').run(ctx),
    }],
  }),

  // Dracule Mihawk (OP15-027) : [Jouée] épuiser un Personnage adverse qui a une DON!! donnée
  'OP15-027': card({
    onPlay: {
      run: (ctx) => {
        const list = ctx.s.players[ctx.opp].chars.filter((c) => c.don > 0 && !c.rested && canBeRested(ctx.s, c.uid)).map((c) => c.uid);
        const uid = chooseUpTo1(ctx, list, 'Dracule Mihawk : Personnage adverse avec une DON!! donnée à épuiser :', 'oppRest');
        if (uid !== null) restByEffect(ctx, uid);
      },
      useful: (s, p) => s.players[p === 0 ? 1 : 0].chars.some((c) => c.don > 0 && !c.rested),
    },
  }),

  // Bartholomew Kuma (OP15-029) : [Jouée] un Personnage adverse de coût 5 ou moins ne peut pas être épuisé jusqu'à la fin
  // du prochain tour adverse
  'OP15-029': card({ onPlay: grant(oppChar({ costMax: 5 }), { stat: 'cantRest' }, 'oppNextEnd', 'Bartholomew Kuma', 'ne peut pas être épuisé') }),

  // Boa Hancock (OP16-032) : [Imblocable] ; [Jouée] un Personnage adverse autre que [Monkey D. Luffy] ne peut pas être
  // épuisé jusqu'à la fin du prochain tour adverse
  'OP16-032': card({ onPlay: grant(oppChar({ notName: 'Monkey.D.Luffy' }), { stat: 'cantRest' }, 'oppNextEnd', 'Boa Hancock', 'ne peut pas être épuisé') }),

  // Dracule Mihawk (ST12-003) : [Jouée] avec 2 Personnages ou moins, jouer épuisé de sa main un {Royaume de Muggy} ou un
  // <Tranche> de coût 4 ou moins autre que [Dracule Mihawk]
  'ST12-003': card({
    onPlay: when((s, p) => s.players[p].chars.length <= 2, effect((ctx) => {
      playCharFromHand(ctx, (c) => {
        const d = def(c.num);
        return (d.cost ?? 0) <= 4 && !d.names.includes('Dracule Mihawk') && (d.types.includes('Muggy Kingdom') || d.attributes.includes('Slash'));
      }, 'Dracule Mihawk : jouer épuisé un {Royaume de Muggy} ou un <Tranche> de coût 4 ou moins de ta main :', { rested: true });
    })),
  }),
};

