// CARTES DES ADVERSAIRES DE L'AVENTURE, LISTE B (tâche 1.16 du plan « Aventure ») : la bande de Baggy (Orange Town, défi
// de Loguetown avec Alvida), l'armada de Don Krieg (Baratie) et les hommes-poissons d'Arlong (Arlong Park), hors OP03 et
// ST-01. Listes des decks : game/adventure/decks.ts ; choix des cartes : game/docs/aventure-east-blue.md. Codées d'après
// le texte officiel (VF quand elle existe, relue avec la VO) ; chaque condition se vérifie dans la partie, sans
// hypothèse sur le deck. Choix d'interprétation : game/docs/interpretations.md (460 à 472).
// Déjà jouables (rien à coder) : Morge OP02-060, Richie OP09-054, Baggy OP12-049, Morge et Cabaji OP12-055, Arlong
// OP16-023, Baggy ST03-011.
import {
  addMod, baseCost, def, discardFromHand, findField, hasType, log, may, other, trashTopDeck,
} from '../rules.ts';
import type { CardBehavior, FieldCard, GameEvent, GameState, PlayerId, WhenEffect } from '../types.ts';
import {
  any, anyChar, bothCosts, bounce, bottomOfDeck, card, charsAtLeast, defenderPower, discard, discardCost, drawCards, effect,
  giveDon, giveRestedDonToOwner, grant, keepRested, ko, leaderNamed, leaderType, oppChar, ownChar, ownLeader, ownLeaderOrChar,
  playFromHand, powerMod, rest, searchTop, selfDon, selfKeyword, seq, trashSelf, when, withCost, type Cost, type Effect,
  type Targets,
} from './bricks.ts';
import { isNamed } from './common.ts';

const EB = 'East Blue';
const ebLeader = leaderType(EB);
const PRISONER = 'Prisoner of Impel Down';  // [Prisonniers d'Impel Down] OP16-042
const CROSS_GUILD = 'Cross Guild';

// « Vous pouvez [coût] : [effet] », demandé seulement si l'effet peut faire quelque chose (interprétation 460) : payer
// ne servirait à rien, et l'IA, qui accepte d'office, paierait pour rien
const payFor = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// « Si vous avez 2 Personnages ou plus ayant un coût de base de 5 ou plus » (Alvida OP12-042, Cabaji ST25-002) : coût
// imprimé ; la carte elle-même (coût 4) ne compte jamais
const twoBigChars = (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => baseCost(c.num) >= 5).length >= 2;

// « Jusqu'à 1 Leader adverse épuisé » (Arlong OP06-023)
const restedOppLeader: Targets = { side: 'opp', leader: true, characters: false, spec: { rested: true }, label: 'Leader adverse épuisé' };

// ---------- Baggy (Leader OP16-041 et Personnage OP16-048) ----------

// « Jouez jusqu'à 1 carte [Prisonniers d'Impel Down] de votre main »
const playPrisoner = (source: string) => playFromHand({ name: PRISONER }, source);

// Leader Baggy : [DON!! x1] [Une fois par tour] quand un de ses Personnages {Impel Down} quitte le terrain (mis KO, en
// combat ou par un effet, ou renvoyé ailleurs par un effet : événements 'ko' et 'leave'), il peut jouer un [Prisonniers
// d'Impel Down] de sa main. Proposé seulement s'il en a un à jouer (interprétation 461).
const baggyLeaderWhen = (on: GameEvent['type']): WhenEffect => {
  const play = playPrisoner('Baggy (Leader)');
  return {
    on,
    once: 'baggyLeader',
    if: (s, owner, self, e) => e.player === owner && e.zone === 'character' && Boolean(e.num && hasType(e.num, 'Impel Down'))
      && self.don >= 1 && play.useful(s, owner, self.uid),
    run: (ctx) => play.run(ctx),
  };
};

// Baggy OP16-048 : [Une fois par tour] quand l'adversaire attaque, jusqu'à 1 de ses [Prisonniers d'Impel Down] gagne
// [Bloqueur] pour le tour ; proposé seulement s'il en a un redressé (sinon le [Bloqueur] ne servirait pas)
const prisonerBlocker = grant(ownChar({ name: PRISONER }), { stat: 'keyword', keyword: 'Blocker' }, 'turn', 'Baggy', 'gagne [Bloqueur]');
const baggyBlockerWhen: WhenEffect = {
  on: 'attack',
  once: 'baggyBlocker',
  if: (s, owner, _self, e) => e.player !== owner && s.players[owner].chars.some((c) => isNamed(c.num, PRISONER) && !c.rested),
  run: (ctx) => prisonerBlocker.run(ctx),
};

// ---------- Krieg (Personnage OP15-008) ----------

// Le Personnage adverse qui a reçu les DON!! de l'effet [Jouée] est noté sur Krieg (effets « une fois par tour » du
// tour, vidés au début de chaque tour : l'effet [Activation : Principale] ne sert que le tour où Krieg est joué)
const KRIEG_MARK = 'kriegDon:';
const kriegTarget = (s: GameState, krieg: FieldCard) => {
  const mark = krieg.usedOpt.find((k) => k.startsWith(KRIEG_MARK));
  return mark ? findField(s, Number(mark.slice(KRIEG_MARK.length))) : null;
};
// « pour chaque carte DON!! qui lui est attachée » : les DON!! données à ce Personnage au moment de l'effet
// (interprétation 466) ; 0 s'il a quitté le terrain
const kriegDonCount = (s: GameState, krieg: FieldCard) => kriegTarget(s, krieg)?.card.don ?? 0;

// [Jouée] « Donnez jusqu'à 3 cartes DON!! adverses épuisées à 1 Personnage adverse. Puis, ce Personnage gagne
// [Initiative] pour tout le tour »
const giveOppDon = giveRestedDonToOwner(oppChar(), 3, 'Krieg');
const kriegOnPlay: Effect = effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  const before = new Map(O.chars.map((c) => [c.uid, c.don]));
  giveOppDon.run(ctx);
  const target = O.chars.find((c) => c.don > (before.get(c.uid) ?? 0));
  const self = findField(ctx.s, ctx.source);
  if (target && self) self.card.usedOpt.push(`${KRIEG_MARK}${target.uid}`);
  selfKeyword('Rush', 'Krieg').run(ctx);
});

// ---------- Tour de passe-passe brouillard (OP09-059) ----------

// « Puis, défaussez jusqu'à 2 cartes de votre main. Placez dans votre Défausse autant de cartes du dessus de votre deck
// que de cartes défaussées » : question 'mayMill' (l'IA ne défausse que si son Leader gagne à deck vide), puis combien
const STEAM_BATH = 'Tour de passe-passe brouillard';
const discardThenMill: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (!P.hand.length) return;
  if (!may(ctx, `${STEAM_BATH} : défausser jusqu’à 2 cartes de ta main et placer autant de cartes du dessus de ton deck dans ta Défausse ?`, 'mayMill')) return;
  const count = P.hand.length < 2 ? 1 : Number(ctx.ask({
    prompt: `${STEAM_BATH} : combien de cartes défausser ?`,
    options: [{ id: 'count:1', label: '1 carte' }, { id: 'count:2', label: '2 cartes' }],
    tag: 'mayMillCount',
  }).split(':')[1]);
  const k = discardFromHand(ctx, ctx.me, count, `${STEAM_BATH} : carte à défausser`);
  const milled = Math.min(k, P.deck.length);
  trashTopDeck(ctx.s, ctx.me, milled);
  if (milled) log(ctx.s, ctx.me, `place ${milled} carte${milled > 1 ? 's' : ''} du dessus de son deck dans sa Défausse (${STEAM_BATH})`);
}, (s, p) => s.players[p].hand.length > 0);

// ---------- Baggy ST25-004 ----------

// « Si votre Leader est [Baggy], jouez jusqu'à 1 carte Personnage de type {Cross Guild} de coût 6 ou moins de votre
// main » : utile s'il reste un tel Personnage une fois 1 carte défaussée pour le coût
const playCrossGuild = playFromHand({ type: CROSS_GUILD, costMax: 6 }, 'Baggy');
const crossGuildAfterDiscard: Effect = {
  run: playCrossGuild.run,
  useful: (s, p, self) => s.players[p].hand.length >= 2 && playCrossGuild.useful(s, p, self),
};

export const AVENTURE_B: Record<string, CardBehavior> = {
  // ===== Bande de Baggy (Orange Town ; Loguetown avec Alvida) =====

  // Baggy (Leader) : [DON!! x1] [Une fois par tour] quand un de ses Personnages {Impel Down} quitte le terrain, jouer
  // jusqu'à 1 [Prisonniers d'Impel Down] de sa main
  'OP16-041': { when: [baggyLeaderWhen('ko'), baggyLeaderWhen('leave')] },
  // Baggy : [Jouée] avec un Leader {Impel Down}, piocher 1 carte et jouer jusqu'à 1 [Prisonniers d'Impel Down] de sa
  // main ; [Une fois par tour] quand l'adversaire attaque, [Bloqueur] pour le tour à un [Prisonniers d'Impel Down]
  'OP16-048': card(
    { onPlay: when(leaderType('Impel Down'), seq(drawCards(1), playPrisoner('Baggy'))) },
    { when: [baggyBlockerWhen] },
  ),
  // Baggy : [Jouée] regarder 5 cartes, ajouter à sa main jusqu'à 1 carte bleue {Impel Down} autre que [Baggy]
  'OP02-058': card({ onPlay: searchTop(5, 1, { color: 'Blue', type: 'Impel Down', notName: 'Buggy' }, 'une carte bleue {Impel Down} autre que [Baggy]') }),
  // Baggy : [Activation : Principale] défausser 1 carte et placer ce Personnage dans la Défausse : avec un Leader
  // [Baggy], jouer jusqu'à 1 Personnage {Cross Guild} de coût 6 ou moins de sa main
  'ST25-004': card({
    activateMain: {
      label: 'Baggy : défausser 1 carte et le placer dans la Défausse pour jouer un Personnage {Cross Guild} de coût 6 ou moins de ta main',
      cost: bothCosts(discardCost(1), trashSelf()),
      effect: when(leaderNamed('Buggy'), crossGuildAfterDiscard),
    },
  }),
  // Cabaji : [Jouée] s'il a un [Morge] sur son terrain, piocher 2 cartes et défausser 1 carte (interprétation 462)
  'OP02-052': card({ onPlay: when(charsAtLeast(1, { name: 'Mohji' }), seq(drawCards(2), discard(1))) }),
  // Cabaji : avec 2 Personnages de coût de base 5 ou plus, [Bloqueur] et +1 de coût ; [Tour adverse] +5000
  'ST25-002': {
    blocker: (s, p) => twoBigChars(s, p),
    selfCost: (s, p) => (twoBigChars(s, p) ? 1 : 0),
    selfPower: (s, p) => (s.active !== p ? 5000 : 0),
  },
  // Morge : [Jouée] regarder 5 cartes, ajouter à sa main jusqu'à 1 [Richie], puis jouer jusqu'à 1 [Richie] de sa main
  'OP09-053': card({ onPlay: seq(searchTop(5, 1, { name: 'Richie' }, '[Richie]'), playFromHand({ name: 'Richie' }, 'Morge')) }),
  // Alvida : [DON!! x1] [En attaquant] défausser 1 carte : renvoyer dans la main de son propriétaire jusqu'à 1
  // Personnage adverse de coût 3 ou moins
  'OP01-064': card({ whenAttacking: when(selfDon(1), payFor(discardCost(1), bounce(oppChar({ costMax: 3 }), 'Alvida'), 'Alvida')) }),
  // Alvida : avec 2 Personnages de coût de base 5 ou plus, +1 de coût ; [Jouée] placer au-dessous du deck de son
  // propriétaire jusqu'à 1 Personnage adverse de coût de base 1 ou moins
  'OP12-042': card(
    { onPlay: bottomOfDeck(oppChar({ baseCostMax: 1 }), 'Alvida') },
    { selfCost: (s, p) => (twoBigChars(s, p) ? 1 : 0) },
  ),
  // Maggy Ball spéciale : [Principale] renvoyer dans la main de son propriétaire jusqu'à 1 Personnage adverse de coût 6
  // ou moins (texte VO, interprétation 463) ; [Déclenchement] jusqu'à 1 Personnage de coût 3 ou moins, des deux côtés
  'OP09-058': card({
    onMain: bounce(oppChar({ costMax: 6 }), 'Maggy Ball spéciale'),
    onTrigger: bounce(anyChar({ costMax: 3 }), 'Maggy Ball spéciale'),
  }),
  // Tour de passe-passe brouillard : [Contre] +3000 pour le combat, puis défausser jusqu'à 2 cartes et autant de cartes
  // du dessus du deck ; [Déclenchement] piocher 1 carte
  'OP09-059': card({ onCounter: seq(defenderPower(3000, STEAM_BATH), discardThenMill), onTrigger: drawCards(1) }),

  // ===== Armada de Don Krieg (Baratie) =====

  // Krieg (Leader) : [DON!! x1] [Tour adverse] si tous ses Personnages sont {East Blue}, −2000 à tous les Personnages
  // adverses (interprétation 464) ; [Activation : Principale] [Une fois par tour] épuiser jusqu'à 1 Personnage adverse
  // ayant 2 DON!! données ou plus
  'OP15-001': card(
    { activateMain: { label: 'Krieg : épuiser un Personnage adverse ayant 2 DON!! données ou plus', once: true, effect: rest(oppChar({ donMin: 2 }), 'Krieg') } },
    {
      oppAura: (s, owner, src) => {
        const chars = s.players[owner].chars;
        return src.don >= 1 && s.active !== owner && chars.length > 0 && chars.every((c) => hasType(c.num, EB)) ? -2000 : 0;
      },
    },
  ),
  // Gyn : [Jouée] avec un Leader {East Blue}, jouer jusqu'à 1 Personnage de coût 5 ou moins de sa main
  'OP15-007': card({ onPlay: when(ebLeader, playFromHand({ costMax: 5 }, 'Gyn')) }),
  // Krieg : [Jouée] donner jusqu'à 3 DON!! adverses épuisées à 1 Personnage adverse, puis [Initiative] pour le tour ;
  // [Activation : Principale] [Une fois par tour] le tour où il est joué, −1000 à tous les Personnages adverses pour le
  // tour par DON!! donnée à ce Personnage-là (interprétations 465 et 466)
  'OP15-008': card({ onPlay: kriegOnPlay }, {
    activateMain: {
      oncePerTurn: true,
      label: 'Krieg : tous les Personnages adverses reçoivent −1000 de puissance par DON!! donnée au Personnage choisi',
      canActivate: (s, _p, self) => self.playedTurn === s.turn,
      useful: (s, p, self) => kriegDonCount(s, self) > 0 && s.players[other(p)].chars.length > 0,
      run: (ctx, self) => {
        self.usedOpt.push('main');
        const n = kriegDonCount(ctx.s, self);
        if (!n || self.playedTurn !== ctx.s.turn) return;
        for (const c of ctx.s.players[ctx.opp].chars) addMod(ctx.s, { uid: c.uid, stat: 'power', amount: -1000 * n, until: 'turn', source: 'Krieg' });
        log(ctx.s, ctx.me, `tous les Personnages adverses reçoivent −${1000 * n} de puissance pour le tour (Krieg)`);
      },
    },
  }),
  // Pearl : [Tour adverse] avec un Leader {East Blue}, [Bloqueur] et +2000 ; [En cas de KO] avec un Leader {East Blue},
  // mettre KO jusqu'à 1 Personnage adverse de 6000 de puissance de base ou moins
  'OP15-011': card(
    { onKO: when(ebLeader, ko(oppChar({ basePowerMax: 6000 }), 'Pearl')) },
    {
      blocker: (s, p) => s.active !== p && ebLeader(s, p, -1),
      selfPower: (s, p) => (s.active !== p && ebLeader(s, p, -1) ? 2000 : 0),
    },
  ),
  // Événement de Krieg : [Principale] regarder 5 cartes, ajouter à sa main jusqu'à 1 carte {East Blue} autre que
  // celle-ci ; [Déclenchement] piocher 1 carte
  'OP15-037': card({
    onMain: searchTop(5, 1, { type: EB, notName: 'The Outcome Will Tell Us Who\'s Strong and Who\'s Weak' }, 'une carte {East Blue} autre que cet Événement'),
    onTrigger: drawCards(1),
  }),
  // Événement de Krieg : [Principale] jusqu'à 1 Personnage adverse épuisé de coût 8 ou moins ayant 2 DON!! données ou
  // plus ne sera pas redressé lors de la prochaine phase de Recharge adverse ; [Contre] jusqu'à 1 de ses [Krieg] gagne
  // +4000 pour le combat (interprétation 467)
  'OP15-038': card(
    {
      onMain: keepRested(oppChar({ rested: true, costMax: 8, donMin: 2 }), 'Ordres de Krieg', 1),
      onCounter: powerMod(ownLeaderOrChar({ name: 'Krieg' }), 4000, 'battle', 'Ordres de Krieg'),
    },
    {
      counterPower: (s, _p, target) => {
        const f = findField(s, target);
        return f && isNamed(f.card.num, 'Krieg') ? 4000 : 0;
      },
    },
  ),

  // ===== Hommes-poissons d'Arlong (Arlong Park) =====

  // Arlong : [Jouée] avec un Leader {Hommes-poissons} ou {East Blue}, donner jusqu'à 1 DON!! épuisée à son Leader ;
  // puis, jusqu'à 1 Personnage adverse de coût 5 ou moins ne peut pas être épuisé jusqu'à la fin du prochain tour adverse
  // (interprétation 468)
  'EB02-011': card({
    onPlay: seq(
      when(any(leaderType('Fish-Man'), ebLeader), giveDon(ownLeader(), 1, 'Arlong')),
      grant(oppChar({ costMax: 5 }), { stat: 'cantRest' }, 'oppNextEnd', 'Arlong', 'ne peut pas être épuisé'),
    ),
  }),
  // Arlong : [Jouée] défausser 1 carte : jusqu'à 1 Leader adverse épuisé ne peut pas attaquer jusqu'à la fin du prochain
  // tour adverse ; [Déclenchement] épuiser jusqu'à 1 Personnage adverse de coût 4 ou moins
  'OP06-023': card({
    onPlay: payFor(discardCost(1), grant(restedOppLeader, { stat: 'cantAttack' }, 'oppNextEnd', 'Arlong', 'ne peut pas attaquer'), 'Arlong'),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Arlong'),
  }),
};
