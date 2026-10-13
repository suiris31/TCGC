// ROCKS D. XEBEC DU MÉTA (octobre 2026, bleu) : cartes codées pour ce deck, d'après leur texte officiel (VF, ou VO pour
// Buckin qui n'existe qu'en anglais). Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, canLeaveByEffect, canPlayCharacters, def, discardFromHand, drawAndDiscard, findField, knownFirst, log, other,
  playCharacter, removeByEffect, reveal, uniqueByNum,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  anyChar, bothCosts, bottomOfDeck, bounce, card, discardCost, drawCards, effect, grant, leaderTypeIncludes, myTurn, oppChar,
  onceWithCost, ownLeaderOrChar, powerMod, restDon, restSelf, revealCost, seq, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const RP = 'Rocks Pirates';  // « Équipage de Rocks »
const rocksLeader = leaderTypeIncludes(RP);
const rocksType = (num: string) => def(num).types.some((t) => t.includes(RP));

// [Contre] « Jusqu'à 1 de vos Leaders ou Personnages incluant « Équipage de Rocks » dans son type gagne +2000 » : la
// carte attaquée, si elle est de ce type
const rocksCounter = (source: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, Number(ctx.pending.data?.target));
  if (f && f.player === ctx.me && rocksType(f.card.num)) counterBoost(ctx, 2000, source);
});
const rocksTarget = (s: GameState, _p: PlayerId, target: number) => {
  const f = findField(s, target);
  return Boolean(f && rocksType(f.card.num));
};

// « Votre Leader gagne +3000 de puissance pour tout le combat »
const leaderBattleBoost = (amount: number, source: string): Effect => effect((ctx) => {
  const leader = ctx.s.players[ctx.me].leader;
  addMod(ctx.s, { uid: leader.uid, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `son Leader gagne +${amount} de puissance pour le combat (${source})`);
});

// Shiki : [En attaquant] / [Attaque adverse], une seule fois par tour pour les deux
const shiki = onceWithCost('shiki', discardCost(1, { typeIncludes: RP }), powerMod(oppChar(), -3000, 'turn', 'Shiki'), 'Shiki');

// Wang Zhi : « placez tous les Personnages adverses ayant un coût de base de 1 au-dessous du deck de leur propriétaire
// dans l'ordre de son choix » : l'adversaire choisit lequel part en premier (le plus haut), et ainsi de suite
const bottomAllBaseCost1: Effect = {
  run: (ctx) => {
    const eligible = () => ctx.s.players[ctx.opp].chars.filter((c) => (def(c.num).cost ?? 0) === 1 && canLeaveByEffect(ctx.s, c.uid, ctx.me)).map((c) => c.uid);
    const tried: number[] = [];
    for (let left = eligible(); left.length; left = eligible().filter((uid) => !tried.includes(uid))) {
      const uid = left.length === 1 ? left[0] : Number(ctx.ask({
        player: ctx.opp,
        prompt: 'Wang Zhi : tes Personnages de coût de base 1 vont au-dessous de ton deck. Lequel placer en premier (le plus haut) ?',
        options: left.map((x) => ({ id: `card:${x}`, label: def(findField(ctx.s, x)!.card.num).name, uid: x })),
        tag: 'bottomOrder',
      }).split(':')[1]);
      tried.push(uid);
      removeByEffect(ctx, uid, 'deckBottom');
    }
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => (def(c.num).cost ?? 0) === 1),
};

// Rocks D. Xebec (Personnage) : « jouez jusqu'à 2 cartes de type {Équipage de Rocks} de votre main ayant des noms
// différents et un coût total combiné de 9 ou moins »
const playTwoRocks: Effect = effect((ctx) => {
  let budget = 9;
  const names: string[] = [];
  for (let i = 0; i < 2; i++) {
    const P = ctx.s.players[ctx.me];
    const eligible = P.hand.filter((c) => {
      const d = def(c.num);
      return (d.category === 'STAGE' || (d.category === 'CHARACTER' && canPlayCharacters(ctx.s, ctx.me, c.num))) && d.types.includes(RP)
        && (d.cost ?? 0) <= budget && !d.names.some((n) => names.includes(n));
    });
    const options = uniqueByNum(knownFirst(ctx.s, ctx.me, eligible));
    if (!options.length) return;
    const answer = ctx.ask({
      prompt: `Rocks D. Xebec : jouer jusqu’à 1 carte {Équipage de Rocks} de ta main de coût ${budget} ou moins (${i + 1}/2) :`,
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
      tag: 'playFree',
    });
    if (answer === 'none') return;
    const [played] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    budget -= def(played.num).cost ?? 0;
    names.push(...def(played.num).names);
    playCharacter(ctx, ctx.me, played);
  }
});

// Linlin (bleue) : « votre adversaire effectue l'un des choix suivants : piochez 2 cartes ; votre adversaire défausse 2
// cartes de sa main » (c'est l'adversaire qui choisit)
const linlinChoice: Effect = effect((ctx) => {
  const answer = ctx.ask({
    player: ctx.opp,
    prompt: 'Charlotte Linlin : choisis. Ton adversaire pioche 2 cartes, ou tu défausses 2 cartes de ta main.',
    options: [{ id: 'choice:0', label: 'Ton adversaire pioche 2 cartes' }, { id: 'choice:1', label: 'Défausser 2 cartes de ta main' }],
    tag: 'oppChoice',
  });
  if (answer === 'choice:0') drawCards(2).run(ctx);
  else discardFromHand(ctx, ctx.opp, 2, 'Charlotte Linlin : carte à défausser');
});

// Leader Xebec : révéler la carte du dessus du deck ; si son type inclut « Équipage de Rocks », piocher 2 cartes
const xebecReveal: Effect = effect((ctx) => {
  const top = ctx.s.players[ctx.me].deck[0];
  if (!top) return;
  reveal(ctx.s, [top.uid], 'both');
  log(ctx.s, ctx.me, `révèle ${def(top.num).name} (carte du dessus de son deck)`);
  if (rocksType(top.num)) drawCards(2).run(ctx);
}, (s, p) => s.players[p].deck.length > 0);

export const META_XEBEC: Record<string, CardBehavior> = {
  // Leader Rocks D. Xebec : [En attaquant] défausser 1 carte : révéler la carte du dessus, piocher 2 si elle est
  // « Équipage de Rocks »
  'OP17-039': card({ whenAttacking: withCost(discardCost(1), xebecReveal, 'Rocks D. Xebec') }),

  // « Quand les rêves de ses camarades ont été bafoués !! » : [Contre] pour le tour, un de ses Personnages mis KO en
  // combat peut être sauvé en défaussant 1 carte ; [Déclenchement] piocher 1 carte
  'EB02-030': card({
    onCounter: effect((ctx) => {
      ctx.s.players[ctx.me].koGuardTurn = ctx.s.turn;
      log(ctx.s, ctx.me, 'pour ce tour, un de ses Personnages mis KO en combat peut être sauvé en défaussant 1 carte');
    }),
    onTrigger: drawCards(1),
  }, { counterUseful: (s, p, target) => target !== s.players[p].leader.uid && s.players[p].hand.length >= 2 }),

  // Buckin : [Votre tour] [Jouée] un de ses [Edward Weevil] gagne +2000 pour le tour
  'OP08-051': card({ onPlay: when(myTurn, powerMod(ownLeaderOrChar({ name: 'Edward Weevil' }), 2000, 'turn', 'Buckin')) }),

  // Edward Newgate : [Jouée] piocher 1 ; [Une fois par tour] quand son Leader « Équipage de Rocks » attaque ou est
  // attaqué, défausser 1 carte : +3000 au Leader pour le combat
  'OP17-040': card({ onPlay: drawCards(1) }, {
    when: [{
      on: 'attack',
      if: (s, owner, self, e) => !self.usedOpt.includes('newgate') && s.players[owner].chars.some((c) => c.uid === self.uid)
        && rocksLeader(s, owner, -1) && (e.uid === s.players[owner].leader.uid || e.target === s.players[owner].leader.uid),
      run: (ctx) => onceWithCost('newgate', discardCost(1), leaderBattleBoost(3000, 'Edward Newgate'), 'Edward Newgate').run(ctx),
    }],
  }),

  // Wang Zhi : [Bloqueur] ; [Jouée] défausser 1 carte : tous les Personnages adverses de coût de base 1 sous leur deck
  'OP17-041': card({ onPlay: withCost(discardCost(1), bottomAllBaseCost1, 'Wang Zhi') }),

  // Kaido : [Bloqueur] ; [Jouée] révéler 3 cartes « Équipage de Rocks » de sa main : −3000 à un Personnage adverse
  'OP17-042': card({ onPlay: withCost(revealCost(3, { typeIncludes: RP }), powerMod(oppChar(), -3000, 'turn', 'Kaido'), 'Kaido') }),

  // Captain John : épuisé, avec un Leader « Équipage de Rocks », l'adversaire ne peut attaquer que [Captain John] ;
  // [Activation : Principale] s'épuiser : piocher 1, défausser 1
  'OP17-044': card({
    activateMain: {
      label: 'Captain John : s’épuiser pour piocher 1 carte et en défausser 1 (l’adversaire ne pourra attaquer que lui)',
      cost: restSelf(),
      effect: effect((ctx) => drawAndDiscard(ctx, 1, 1), (s, p) => s.players[p].deck.length > 0),
    },
  }, { taunt: (s, p, self) => self.rested && rocksLeader(s, p, -1) }),

  // Kyo : si un de ses Personnages devait quitter le terrain à cause d'un effet adverse, défausser 2 cartes à la place ;
  // [Jouée] piocher 1 carte
  'OP17-045': card({ onPlay: drawCards(1) }, {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Kyo : défausser 2 cartes de ta main à la place (${def(victim.num).name})`,
      condition: (s, p) => s.players[p].hand.length >= 2,
      apply: (_s, p, _self, victim, ctx: EffectCtx) => {
        discardFromHand(ctx, p, 2, `Kyo : carte à défausser à la place de la sortie de ${def(victim.num).name}`);
      },
    },
  }),

  // Gloriosa : [Bloqueur] ; [Jouée] placer un Personnage de coût 5 ou moins au-dessous du deck de son propriétaire
  'OP17-046': card({ onPlay: bottomOfDeck(anyChar({ costMax: 5 }), 'Gloriosa') }),

  // Shiki : [Initiative : Personnage] ; [En attaquant] / [Attaque adverse] [Une fois par tour] défausser 1 carte
  // « Équipage de Rocks » : −3000 à un Personnage adverse pour le tour
  'OP17-048': card({ whenAttacking: shiki, onOpponentAttack: shiki }),

  // Charlotte Linlin (bleue) : [Jouée] l'adversaire choisit : elle pioche 2, ou il défausse 2 ; [Attaque adverse] [Une fois
  // par tour] défausser 1 carte : +1000 à son Leader ou un de ses Personnages pour le combat
  'OP17-049': card({
    onPlay: linlinChoice,
    onOpponentAttack: onceWithCost('linlinRocks', discardCost(1), powerMod(ownLeaderOrChar(), 1000, 'battle', 'Charlotte Linlin'), 'Charlotte Linlin'),
  }),

  // Miss Buckingham Stussy : [Jouée] un Personnage adverse de coût de base 6 ou moins ne peut pas attaquer jusqu'à la fin
  // du prochain tour adverse ; [Activation : Principale] épuiser 3 DON!! et Stussy : même chose, sans limite de coût
  'OP17-054': card({
    onPlay: grant(oppChar({ baseCostMax: 6 }), { stat: 'cantAttack' }, 'oppNextEnd', 'Miss Buckingham Stussy', 'ne peut pas attaquer'),
    activateMain: {
      label: 'Miss Buckingham Stussy : épuiser 3 DON!! et Stussy pour qu’un Personnage adverse ne puisse pas attaquer',
      cost: bothCosts(restDon(3), restSelf()),
      effect: grant(oppChar(), { stat: 'cantAttack' }, 'oppNextEnd', 'Miss Buckingham Stussy', 'ne peut pas attaquer'),
    },
  }),

  // « Aucun pouvoir n'est éternel !! » : [Principale] épuiser 1 DON!! : un de ses [Rocks D. Xebec] gagne [Imblocable] ;
  // [Contre] +2000 à la carte attaquée « Équipage de Rocks »
  'OP17-055': card({
    onMain: withCost(restDon(1), grant(ownLeaderOrChar({ name: 'Rocks.D.Xebec' }), { stat: 'keyword', keyword: 'Unblockable' }, 'turn',
      'Aucun pouvoir n’est éternel !!', 'gagne [Imblocable]'), 'Aucun pouvoir n’est éternel !!'),
    onCounter: rocksCounter('Aucun pouvoir n’est éternel !!'),
  }, { counterUseful: rocksTarget }),

  // « Équipage de Rocks » : [Principale] épuiser 5 DON!! : renvoyer en main un Personnage de coût 6 ou moins ; [Contre]
  // +2000 à la carte attaquée « Équipage de Rocks »
  'OP17-056': card({
    onMain: withCost(restDon(5), bounce(anyChar({ costMax: 6 }), 'Équipage de Rocks'), 'Équipage de Rocks'),
    onCounter: rocksCounter('Équipage de Rocks'),
  }, { counterUseful: rocksTarget }),

  // Rocks D. Xebec (Personnage) : Contre +2000 en main si aucun de ses Personnages n'a de Contre ; [Jouée] piocher 1,
  // puis jouer jusqu'à 2 cartes {Équipage de Rocks} de noms différents, coût total 9 ou moins
  'OP17-118': card({ onPlay: seq(drawCards(1), playTwoRocks) }, {
    handCounter: (s, p) => (s.players[p].chars.every((c) => !def(c.num).counter) ? 2000 : 0),
  }),
};
