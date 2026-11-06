// EB04 (étape C, tâche S4) : les cartes que le traducteur ne comprend pas, ou qu'il ne sait pas compiler, codées à la
// main d'après le texte officiel (VO et VF, jamais recopié). Le reste du set est en recettes (recipes/sets/eb04.ts).
// Choix d'interprétation : game/docs/interpretations.md, section « EB03 et EB04 (tâche S4) ».
import {
  addMod, baseCost, basePower, def, discardFromHand, donOnField, draw, hasType, log, other, setActive,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  addDon, card, charsAtLeast, drawCards, effect, leaderType, leaderTypeIncludes, oppChar, ownChar, playThis, powerToZero,
  readyDon, rest, seq, setActiveTargets, trashOwnCharCost, trashToBottomCost, trashTop, when, withCost, type Cost,
  type Effect,
} from './bricks.ts';
import { drawLog } from './common.ts';

// « Vous pouvez [coût] : [effet] » proposé seulement si l'effet peut servir (convention n° 1000 des recettes)
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// Le contexte d'un effet adverse, vu du propriétaire de la carte qui le remplace : ses questions vont à ce joueur
const ownerCtx = (ctx: EffectCtx, owner: PlayerId): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), ask: (spec) => ctx.ask({ player: owner, ...spec }),
});

const NEPTUNIAN = 'Neptunian';

// Kobby : [Une fois par tour] remplacement (KO, ou sortie du terrain par un effet adverse), clé partagée
const KOBY_KEY = 'replace';
const kobyCan = (s: GameState, p: PlayerId, self: { usedOpt: string[] }) =>
  !self.usedOpt.includes(KOBY_KEY) && leaderTypeIncludes('Navy')(s, p, -1) && s.players[p].hand.length > 0;

export const EB04: Record<string, CardBehavior> = {
  // Smoker et Tashigi : [Initiative] ; [Tour adverse] la puissance de base de son Leader {Navy} devient 7000 (plusieurs
  // exemplaires ne s'additionnent pas : seul le premier compte)
  'EB04-003': {
    aura: (s, owner, source, target) => {
      const leader = s.players[owner].leader;
      if (s.active === owner || target.uid !== leader.uid || !hasType(leader.num, 'Navy')) return 0;
      if (s.players[owner].chars.find((c) => c.num === 'EB04-003')?.uid !== source.uid) return 0;
      return 7000 - basePower(s, leader.uid);
    },
  },

  // Trafalgar Law : ne peut pas attaquer si l'adversaire n'a pas au moins 2 Personnages de 5000 de puissance de base ou plus
  'EB04-005': {
    cantAttack: (s, p) => s.players[other(p)].chars.filter((c) => basePower(s, c.uid) >= 5000).length < 2,
  },

  // Royaume de Rourucia (Lieu) : [Tour adverse] ses Personnages de coût de base 1 gagnent +5000 ; [Jouée] la puissance
  // d'un Personnage adverse devient 0 pour le tour
  'EB04-010': card({
    onPlay: powerToZero(oppChar(), 'turn', 'Royaume de Rourucia'),
  }, {
    aura: (s, owner, _source, target) => (s.active !== owner && s.players[owner].chars.some((c) => c.uid === target.uid)
      && baseCost(target.num) === 1 ? 5000 : 0),
  }),

  // L'Écaillé : [Initiative : Personnage] ; [Jouée] piocher 1 carte par Personnage {Neptunian} (lui compris), puis
  // défausser autant de cartes que de cartes piochées
  'EB04-011': card({
    onPlay: effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      const n = P.chars.filter((c) => hasType(c.num, NEPTUNIAN)).length;
      const before = P.hand.length;
      draw(ctx.s, ctx.me, n);
      const k = P.hand.length - before;
      if (!k) return;
      log(ctx.s, ctx.me, `pioche ${k} carte${k > 1 ? 's' : ''} (L'Écaillé)`);
      discardFromHand(ctx, ctx.me, k, `L'Écaillé : carte à défausser (autant que de cartes piochées)`);
    }),
  }),

  // Carrot : [Jouée] avec un Leader {Minks}, redresser jusqu'à 2 de ses Personnages {Minks} et son Leader
  'EB04-013': card({
    onPlay: when(leaderType('Minks'), seq(
      setActiveTargets(ownChar({ type: 'Minks' }), 'Carrot', 2),
      effect((ctx) => {
        const leader = ctx.s.players[ctx.me].leader;
        if (leader.rested) setActive(ctx.s, ctx.me, leader.uid);
      }, (s, p) => s.players[p].leader.rested),
    )),
  }),

  // L'Oiseau : [Activation : Principale] redresser 1 DON!! ; puis, plus de DON!! redressée par un effet de Personnage ce
  // tour-ci (lui compris : une deuxième activation ne redresse rien) ; [En attaquant] avec 3 Personnages {Neptunian} ou
  // plus, épuiser un Personnage adverse de coût 8 ou moins
  'EB04-016': card({
    activateMain: {
      label: 'L’Oiseau : redresser 1 DON!! (puis plus de DON!! redressée par un effet de Personnage ce tour-ci)',
      // une fois la restriction posée, l'activer ne ferait plus rien : elle n'est plus proposée (pas de boucle sans fin)
      condition: (s, p) => s.players[p].noCharDonReadyTurn !== s.turn,
      effect: seq(readyDon(1), effect((ctx) => {
        ctx.s.players[ctx.me].noCharDonReadyTurn = ctx.s.turn;
        log(ctx.s, ctx.me, 'ne pourra plus redresser de DON!! grâce à l’effet d’un Personnage ce tour-ci (L’Oiseau)');
      }, () => false)),
    },
    whenAttacking: when(charsAtLeast(3, { type: NEPTUNIAN }), rest(oppChar({ costMax: 8 }), 'L’Oiseau')),
  }),

  // Rosinante et Law (aussi [Trafalgar Law] et [Donquixote Rosinante] : noms du catalogue) : [Bloqueur] ; [Jouée] avec
  // autant de DON!! ou moins que l'adversaire sur le terrain, piocher 1 carte ; puis 1 DON!! redressée du deck DON!!
  'EB04-038': card({
    onPlay: seq(when((s, p) => donOnField(s, p) <= donOnField(s, other(p)), drawCards(1)), addDon(1, 'active')),
  }),

  // Kaku : [Une fois par tour] si un de ses Personnages noirs de coût de base 5 ou moins devait être mis KO par un effet
  // adverse, placer 3 cartes de sa Défausse au-dessous de son deck à la place ; [Jouée] les 2 cartes du dessus du deck
  // dans la Défausse
  'EB04-043': card({ onPlay: trashTop(2) }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: true,
      label: (_s, _self, victim) => `Kaku : placer 3 cartes de ta Défausse au-dessous de ton deck pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (s, p, _self, victim) => def(victim.num).colors.includes('Black') && baseCost(victim.num) <= 5 && s.players[p].trash.length >= 3,
      apply: (s, p, _self, victim, ctx) => {
        if (trashToBottomCost(3).pay(ownerCtx(ctx, p))) log(s, p, `${def(victim.num).name} reste sur le terrain (Kaku)`);
      },
    },
  }),

  // Kobby : [Une fois par tour] avec un Leader dont le type inclut « Navy », s'il devait quitter le terrain, défausser 1
  // carte à la place (KO en combat ou par un effet, sortie par un effet adverse : comme Ganzui OP17-043) ; [Votre tour]
  // [Une fois par tour] quand un Personnage adverse est mis KO, piocher 1 carte
  'EB04-044': {
    koReplace: {
      label: 'Défausser 1 carte de ta main',
      condition: (s, p, self) => kobyCan(s, p, self),
      apply: (s, p, self, ctx) => {
        self.usedOpt.push(KOBY_KEY);
        if (discardFromHand(ctx, p, 1, 'Kobby : carte à défausser à la place') === 1) log(s, p, `${def(self.num).name} reste sur le terrain`);
      },
    },
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      exceptKo: true,
      label: () => 'Kobby : défausser 1 carte de ta main pour qu’il reste sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && kobyCan(s, p, self),
      apply: (_s, p, _self, _victim, ctx) => { discardFromHand(ctx, p, 1, 'Kobby : carte à défausser à la place'); },
    },
    when: [{
      on: 'ko',
      once: 'kobyDraw',
      if: (s, owner, _self, e) => s.active === owner && e.player !== owner && e.zone === 'character',
      run: (ctx) => drawLog(ctx, 1),
    }],
  },

  // Rob Lucci : avec un Leader dont le type inclut « CP », +1000 de puissance et +2 de coût par tranche de 5 cartes de sa
  // Défausse ; [Jouée] placer 1 de ses Personnages (lui compris) dans sa Défausse : piocher 1 carte
  'EB04-048': card({
    onPlay: mayPay(trashOwnCharCost({}), drawCards(1), 'Rob Lucci'),
  }, {
    selfPower: (s, p) => (leaderTypeIncludes('CP')(s, p, -1) ? 1000 * Math.floor(s.players[p].trash.length / 5) : 0),
    selfCost: (s, p) => (leaderTypeIncludes('CP')(s, p, -1) ? 2 * Math.floor(s.players[p].trash.length / 5) : 0),
  }),

  // Emeth : ne peut pas attaquer s'il n'y a pas de Personnage (de l'un ou l'autre camp) de 12000 de puissance de base ou
  // plus ; [Déclenchement] −3000 à tous les Personnages adverses pour le tour ; puis, avec 0 carte de Vie, jouer cette carte
  'EB04-051': card({
    onTrigger: seq(
      effect((ctx) => {
        const chars = ctx.s.players[ctx.opp].chars;
        for (const c of chars) addMod(ctx.s, { uid: c.uid, stat: 'power', amount: -3000, until: 'turn', source: 'Emeth' });
        if (chars.length) log(ctx.s, ctx.me, 'tous les Personnages adverses reçoivent −3000 de puissance pour le tour (Emeth)');
      }),
      when((s, p) => s.players[p].life.length === 0, playThis()),
    ),
  }, {
    cantAttack: (s) => !s.players.some((P) => P.chars.some((c) => basePower(s, c.uid) >= 12000)),
  }),

  // Végapunk : avec 2 cartes de Vie ou moins, ses Personnages {Scientist} jaunes (lui compris) ne peuvent pas quitter le
  // terrain à cause d'un effet adverse ; [DON!! x1] [Bloqueur]
  'EB04-057': {
    leaveShield: (s, owner, _source, target) => s.players[owner].life.length <= 2 && s.players[owner].chars.some((c) => c.uid === target.uid)
      && def(target.num).colors.includes('Yellow') && hasType(target.num, 'Scientist'),
    blocker: (_s, _p, self) => self.don >= 1,
  },
};
