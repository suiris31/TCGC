// CARTES DES ADVERSAIRES DE L'AVENTURE, LISTE A (tâche 1.15 du plan « Aventure ») : les cartes hors OP03 et ST-01 des
// decks de la Marine de Shells Town (Leader Kobby OP11-001), du Chat Noir (Kuro) et de la Marine de Loguetown (Smoker
// OP02-093), listés dans game/docs/aventure-east-blue.md. Codées d'après leur texte officiel (VF, ou VO pour celles qui
// n'existent qu'en anglais) ; chaque condition se vérifie dans la partie, sans hypothèse sur le deck. Les choix
// d'interprétation sont dans game/docs/interpretations.md (430 à 459).
import { addMod, basePower, def, findField, log, other } from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameState, PlayerId } from '../types.ts';
import {
  all, bothCosts, candidates, card, characterCostAtMost, costMod, defenderPower, discardCost, drawCards, effect,
  giveRestedDonToOwner, keywordWhile, ko, leaderNamed, leaderType, oppChar, playFromHand, restSelf, searchTop,
  selfDon, selfPowerMod, seq, trashSelf, trashToBottomCost, when, withCost, type Condition, type Cost, type Effect,
} from './bricks.ts';

const NAVY = 'Navy';  // {Marine}
const EAST_BLUE = 'East Blue';

// « Ce Personnage ne peut pas être mis KO par un effet » (les siens compris)
const koImmuneToEffects: NonNullable<CardBehavior['cantBeKO']> = (_s, _p, _self, cause) => cause === 'effect';

// Effet de remplacement résolu pendant l'effet adverse : c'est le propriétaire de la carte qui choisit
const asOwner = (ctx: EffectCtx, owner: PlayerId, self: FieldCard): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), source: self.uid, num: self.num, ask: (spec) => ctx.ask({ player: owner, ...spec }),
});

// Une de vos cartes (Leader, Personnages, main) tire parti des DON!! données aux Personnages adverses (Krieg OP15-001,
// Morge OP15-018, Dracule Mihawk OP15-027...), d'après son texte VO. Sinon, donner une DON!! épuisée adverse à un
// Personnage adverse ne sert à rien : elle revient dans sa zone de Coût à sa phase de Recharge, sans jamais compter
// pendant son tour.
const OPP_DON_TEXT = /opponent's (rested )?Characters?[^.]*(with|that has) (a|\d+ or more) DON!! cards? given/i;
const oppDonMatters: Condition = (s, p) => [s.players[p].leader, ...s.players[p].chars, ...s.players[p].hand]
  .some((c) => OPP_DON_TEXT.test(def(c.num).effectEn ?? ''));

// « Donnez jusqu'à 1 carte DON!! de la zone de Coût de votre adversaire à 1 de ses Personnages » (les frères Nyaban
// OP15-028) : une DON!! redressée s'il en a (elle lui manquera pour payer un [Contre] pendant ce tour), sinon épuisée
const giveFromOppCostArea = (source: string): Effect => {
  const list = (s: GameState, p: PlayerId) => (s.players[other(p)].donActive + s.players[other(p)].donRested > 0 ? candidates(s, p, oppChar()) : []);
  return effect((ctx) => {
    const options = list(ctx.s, ctx.me);
    if (!options.length) return;
    const answer = ctx.ask({
      prompt: `${source} : Personnage adverse qui reçoit 1 DON!! de la zone de Coût adverse :`,
      options: [...options.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })), { id: 'none', label: 'Aucun' }],
      tag: 'oppDonTarget',
    });
    if (answer === 'none') return;
    const f = findField(ctx.s, Number(answer.split(':')[1]))!;
    const O = ctx.s.players[ctx.opp];
    const active = O.donActive > 0;
    if (active) O.donActive--;
    else O.donRested--;
    f.card.don++;
    log(ctx.s, ctx.me, `donne 1 DON!! ${active ? 'redressée' : 'épuisée'} adverse à ${def(f.card.num).name} (${source})`);
  }, (s, p) => list(s, p).length > 0);
};

// « ... et aucun de vos Personnages ne peut être mis KO pour tout le tour » (White Out ST06-016) : protection du joueur,
// valable aussi pour les Personnages joués ensuite (lue par canBeKO)
const noKoThisTurn = (source: string): Effect => effect((ctx) => {
  ctx.s.players[ctx.me].noKoTurn = ctx.s.turn;
  log(ctx.s, ctx.me, `aucun de ses Personnages ne peut être mis KO pour le tour (${source})`);
}, (s, p) => s.players[p].chars.length > 0);

// « Vous pouvez [coût] : [effet] », proposé seulement si l'effet peut servir : payer pour rien n'apporte rien (l'IA
// accepte toujours de payer)
const withCostIfUseful = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// Onde de choc (ST06-014) : la mise KO de son [Contre]
const onde = ko(oppChar({ rested: false, costMax: 3 }), 'Onde de choc');
// Jango (OP15-026) : l'IA ne l'active que si une de ses cartes en tire parti
const jangoDon = giveRestedDonToOwner(oppChar(), 1, 'Jango');

export const AVENTURE_A: Record<string, CardBehavior> = {
  // ---------- Marine de Shells Town (Leader Kobby) ----------

  // Kobby (Leader OP11-001) : ses Personnages {SWORD} peuvent attaquer un Personnage le tour où ils sont joués ;
  // [Une fois par tour] si un de ses Personnages {Marine} de 7000 de puissance de base ou moins devait quitter le terrain
  // à cause d'un effet adverse, il peut placer 3 cartes de sa Défausse au-dessous de son deck à la place
  'OP11-001': {
    keywordAura: (_s, _p, src, target, k) => k === 'Rush: Character' && target.uid !== src.uid && def(target.num).types.includes('SWORD'),
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: (_s, _self, victim) => `Kobby : placer 3 cartes de ta Défausse au-dessous de ton deck pour garder ${def(victim.num).name}`,
      condition: (s, p, _self, victim) => def(victim.num).types.includes(NAVY) && basePower(s, victim.uid) <= 7000 && s.players[p].trash.length >= 3,
      apply: (s, p, self, victim, ctx) => {
        if (trashToBottomCost(3).pay(asOwner(ctx, p, self))) log(s, p, `${def(victim.num).name} reste sur le terrain (Kobby)`);
      },
    },
  },

  // Ripper (OP11-096) : [Bloqueur] s'il a un autre Personnage {Marine} noir qu'un [Ripper]
  'OP11-096': {
    blocker: (s, p, self) => s.players[p].chars.some((c) => c.uid !== self.uid && !def(c.num).names.includes('Ripper')
      && def(c.num).types.includes(NAVY) && def(c.num).colors.includes('Black')),
  },

  // « Quoi qu'il arrive... je deviendrai officier de la marine !! » (OP11-099) : [Principale] regarder 3 cartes, en
  // ajouter 1 {Marine} (autre que cet Événement) à sa main, le reste dans la Défausse ; [Déclenchement] le même effet
  // (générique : « activez l'effet [Principale] »)
  'OP11-099': card({
    onMain: searchTop(3, 1, { type: NAVY, notName: 'I\'m Gonna Be a Navy Officer!!!' }, 'une carte {Marine}', 'trash'),
  }),

  // Kobby (OP15-009) : si un de ses Personnages de 7000 de puissance de base ou moins devait quitter le terrain à cause
  // d'un effet adverse, son Leader peut recevoir −2000 de puissance pour le tour à la place
  'OP15-009': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      label: (_s, _self, victim) => `Kobby : ton Leader reçoit −2000 de puissance pour le tour pour garder ${def(victim.num).name}`,
      condition: (s, _p, _self, victim) => basePower(s, victim.uid) <= 7000,
      apply: (s, p, _self, victim) => {
        addMod(s, { uid: s.players[p].leader.uid, stat: 'power', amount: -2000, until: 'turn', source: 'Kobby' });
        log(s, p, `son Leader reçoit −2000 de puissance pour le tour : ${def(victim.num).name} reste sur le terrain (Kobby)`);
      },
    },
  },

  // White Out (ST06-016) : [Contre] +2000 pour le combat ; [Déclenchement] piocher 1 carte, et aucun de ses Personnages
  // ne peut être mis KO pour le tour
  'ST06-016': card({
    onCounter: defenderPower(2000, 'White Out'),
    onTrigger: seq(drawCards(1), noKoThisTurn('White Out')),
  }),

  // ---------- Chat Noir (Kuro) ----------

  // Kuro (OP14-025) : [Jouée] avec le Leader [Kuro], jouer de sa main un Personnage {East Blue} de coût 6 ou moins
  'OP14-025': card({ onPlay: when(leaderNamed('Kuro'), playFromHand({ type: EAST_BLUE, costMax: 6 }, 'Kuro')) }),

  // Jango (OP15-026) : [Jouée] regarder 3 cartes, en ajouter 1 {East Blue} à sa main, le reste au-dessous du deck ;
  // [Activation : Principale] se placer dans la Défausse : donner 1 DON!! épuisée adverse à un Personnage adverse
  'OP15-026': card({
    onPlay: searchTop(3, 1, { type: EAST_BLUE }, 'une carte {East Blue}'),
    activateMain: {
      label: 'Jango : se placer dans la Défausse pour donner 1 DON!! épuisée adverse à un Personnage adverse',
      cost: trashSelf(),
      effect: { run: jangoDon.run, useful: (s, p, self) => oppDonMatters(s, p, self) && jangoDon.useful(s, p, self) },
    },
  }),

  // Les frères Nyaban (OP15-028) : [Jouée] avec un Leader {East Blue}, donner 1 DON!! de la zone de Coût adverse à un
  // Personnage adverse
  'OP15-028': card({ onPlay: when(leaderType(EAST_BLUE), giveFromOppCostArea('Les frères Nyaban')) }),

  // ---------- Marine de Loguetown (Smoker) ----------

  // Smoker (Leader OP02-093) : [DON!! x1] [Activation : Principale] [Une fois par tour] −1 de coût à un Personnage
  // adverse pour le tour ; puis, s'il y a un Personnage de coût 0, +1000 pour le tour
  'OP02-093': card({
    activateMain: {
      label: 'Smoker : −1 de coût à un Personnage adverse, puis +1000 s’il y a un Personnage de coût 0',
      once: true,
      condition: selfDon(1),
      effect: seq(costMod(oppChar(), -1, 'turn', 'Smoker'), when(characterCostAtMost(0), selfPowerMod(1000, 'turn', 'Smoker'))),
    },
  }),

  // Smoker (OP02-102) : ne peut pas être mis KO par un effet ; [En attaquant] s'il y a un Personnage de coût 0, +2000
  // pour le combat
  'OP02-102': card({ whenAttacking: when(characterCostAtMost(0), selfPowerMod(2000, 'battle', 'Smoker')) }, { cantBeKO: koImmuneToEffects }),

  // Ice Age (OP02-117) : [Principale] −5 de coût à un Personnage adverse pour le tour ; [Déclenchement] mettre KO un
  // Personnage adverse de coût 3 ou moins
  'OP02-117': card({
    onMain: costMod(oppChar(), -5, 'turn', 'Ice Age'),
    onTrigger: ko(oppChar({ costMax: 3 }), 'Ice Age'),
  }),

  // Kobby (ST06-002) : [Jouée] défausser 1 carte : mettre KO un Personnage adverse de coût 0
  'ST06-002': card({ onPlay: withCostIfUseful(discardCost(1), ko(oppChar({ costMax: 0 }), 'Kobby'), 'Kobby') }),

  // Smoker (ST06-004) : ne peut pas être mis KO par un effet ; [DON!! x1] s'il y a un Personnage de coût 0, [Double
  // attaque]
  'ST06-004': {
    cantBeKO: koImmuneToEffects,
    keywordAura: keywordWhile('Double Attack', all(selfDon(1), characterCostAtMost(0))),
  },

  // Tashigi (ST06-006) : [Activation : Principale] s'épuiser : −2 de coût à un Personnage adverse pour le tour
  'ST06-006': card({
    activateMain: { label: 'Tashigi : s’épuiser pour donner −2 de coût à un Personnage adverse', cost: restSelf(), effect: costMod(oppChar(), -2, 'turn', 'Tashigi') },
  }),

  // Hina (ST06-008) : [Jouée] −4 de coût à un Personnage adverse pour le tour
  'ST06-008': card({ onPlay: costMod(oppChar(), -4, 'turn', 'Hina') }),

  // Hermep (ST06-010) : [Jouée] −3 de coût à un Personnage adverse pour le tour
  'ST06-010': card({ onPlay: costMod(oppChar(), -3, 'turn', 'Hermep') }),

  // Monkey D. Garp (ST06-012) : [Activation : Principale] défausser 1 carte et s'épuiser : mettre KO un Personnage adverse
  // de coût 4 ou moins
  'ST06-012': card({
    activateMain: {
      label: 'Monkey D. Garp : défausser 1 carte et s’épuiser pour mettre KO un Personnage adverse de coût 4 ou moins',
      cost: bothCosts(discardCost(1), restSelf()),
      effect: ko(oppChar({ costMax: 4 }), 'Monkey D. Garp'),
    },
  }),

  // Onde de choc (ST06-014) : [Contre] +4000 pour le combat, puis mettre KO un Personnage adverse redressé de coût 3 ou
  // moins ; [Déclenchement] mettre KO un Personnage adverse de coût 4 ou moins
  'ST06-014': card({
    onCounter: seq(defenderPower(4000, 'Onde de choc'), onde),
    onTrigger: ko(oppChar({ costMax: 4 }), 'Onde de choc'),
  }, { counterExtra: (s, p) => onde.useful(s, p, -1) }),
};
