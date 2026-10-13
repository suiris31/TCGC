// FAMILLE DU LEADER LUFFY ET ACE (phase 4E) : cartes rouges et vertes {Impel Down} et « Équipage de Barbe Blanche »
// jouables en format Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais).
// Beaucoup tournent autour des Personnages de 8000 de puissance (à révéler ou défausser) et du Leader [Edward.Newgate].
// Chaque condition se vérifie dans la partie. Les choix d'interprétation sont dans game/docs/interpretations.md.
import {
  addMod, basePower, canPlayCharacters, def, findField, hasType, koCharacter, leaderHasType, lifeToHand, log, lookTopPick,
  playCharacter, power, untilOpponentsNextEnd,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  bothCosts, card, discardCost, drawCards, effect, giveDon, ko, koOppStage, leaderNamed, leaderPower,
  oppChar, oppLeaderOrChar, ownLeaderOrChar, playFromHand, powerMod, rest, restDon, restSelf, revealCost, searchTop,
  selfDon, selfKeyword, seq, trashSelf, when, withCost, type CharSpec, type Effect,
} from './bricks.ts';
import { counterBoost, playCharFromHand } from './common.ts';

const WB = 'Whitebeard Pirates';  // type incluant « Équipage de Barbe Blanche »
const WANO = 'Land of Wano';
const wbType = (num: string) => def(num).types.some((t) => t.includes(WB));
const wbLeaderIncl = (s: GameState, p: PlayerId) => def(s.players[p].leader.num).types.some((t) => t.includes(WB));
const newgateLeader = leaderNamed('Edward.Newgate');
const newgateOrWano = (s: GameState, p: PlayerId, self: number) => newgateLeader(s, p, self) || leaderHasType(s, p, WANO);
const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const oppHas10000 = (s: GameState, p: PlayerId) => s.players[opp(p)].chars.some((c) => power(s, c.uid) >= 10000);
const restedChars = (n: number) => (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => c.rested).length >= n;
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const selfPowerUntil = (amount: number, source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.source, stat: 'power', amount, until: untilOpponentsNextEnd(ctx.s, ctx.me), source });
  log(ctx.s, ctx.me, `${source} gagne +${amount} de puissance jusqu’à la fin du prochain tour adverse`);
});
// Personnage de 8000 de puissance de sa main (à révéler ou défausser)
const C8000: CharSpec & { category: 'CHARACTER' } = { category: 'CHARACTER', powerMin: 8000, powerMax: 8000 };
const reveal8000 = (n = 1) => revealCost(n, C8000);
const leaderBase8000 = (source: string): Effect => effect((ctx) => {
  addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'basePower', amount: 8000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source });
  log(ctx.s, ctx.me, `la puissance de base de son Leader devient 8000 jusqu’à la fin du prochain tour adverse (${source})`);
});
const copyOppLeaderBase = (source: string): Effect => effect((ctx) => {
  const amount = basePower(ctx.s, ctx.s.players[ctx.opp].leader.uid);
  addMod(ctx.s, { uid: ctx.source, stat: 'basePower', amount, until: 'turn', source });
  log(ctx.s, ctx.me, `la puissance de base de ${source} devient ${amount} pour le tour`);
});

// Marco (OP16-014, OP17-015) : à la place d'un de ses Personnages retiré par un effet adverse, se mettre KO ; [En cas de
// KO] payer pour se rejouer depuis la Défausse
const marcoReplace: NonNullable<CardBehavior['replaceRemoval']> = {
  oncePerTurn: false,
  onlyKo: false,
  label: (_s, _self, victim) => `Marco : te mettre KO pour que ${def(victim.num).name} reste sur le terrain`,
  condition: (s, _p, self) => Boolean(findField(s, self.uid)),
  apply: (s, p, self) => {
    log(s, p, 'Marco est mis KO à la place');
    koCharacter(s, self.uid, 'effect', p, self.num);
  },
};
const replayFromTrash = (source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const i = P.trash.findIndex((c) => c.uid === ctx.source);
  if (i < 0) return;
  const [c] = P.trash.splice(i, 1);
  playCharacterFromTrash(ctx, c, source);
});
function playCharacterFromTrash(ctx: EffectCtx, c: Card, source: string) {
  if (!canPlayCharacters(ctx.s, ctx.me, c.num)) {
    ctx.s.players[ctx.me].trash.push(c);
    return;
  }
  log(ctx.s, ctx.me, `rejoue ${def(c.num).name} depuis sa Défausse (${source})`);
  playCharacter(ctx, ctx.me, c);
}

// [Une fois par tour] sans coût
const oncePerTurn = (key: string, then: Effect): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.usedOpt.includes(key)) return;
    f.card.usedOpt.push(key);
    then.run(ctx);
  },
  useful: then.useful,
});

export const FAM_LUFFY_ACE: Record<string, CardBehavior> = {
  // Izo (EB01-002) : [Jouée] 1 DON!! épuisée ; [Attaque adverse] [Une fois par tour] défausser 1 carte : avec un Leader
  // {Pays des Wa} ou {Équipage de Barbe Blanche}, −2000 au Leader ou à un Personnage adverse
  'EB01-002': card({
    onPlay: giveDon(ownLeaderOrChar(), 1, 'Izo'),
    onOpponentAttack: oncePerTurn('izo002', withCost(discardCost(1), when((s, p) => leaderHasType(s, p, WANO) || leaderHasType(s, p, WB),
      powerMod(oppLeaderOrChar(), -2000, 'turn', 'Izo')), 'Izo')),
  }),

  // Portgas D. Ace (OP09-035) : [Jouée] avec 2 Personnages épuisés, épuiser de coût 5 ou moins
  'OP09-035': card({ onPlay: when(restedChars(2), rest(oppChar({ costMax: 5 }), 'Portgas D. Ace')) }),

  // Edward Newgate (OP10-024) : [Jouée] avec 2 Personnages épuisés, épuiser de coût 5 ou moins, puis KO d'un Personnage
  // adverse épuisé de coût 3 ou moins
  'OP10-024': card({ onPlay: when(restedChars(2), seq(rest(oppChar({ costMax: 5 }), 'Edward Newgate'), ko(oppChar({ rested: true, costMax: 3 }), 'Edward Newgate'))) }),

  // Izo (OP16-002) : [Jouée] révéler un Personnage de 8000 : piocher 1
  'OP16-002': card({ onPlay: withCost(reveal8000(), drawCards(1), 'Izo') }),

  // Edward Newgate (OP16-003) : [Votre tour] son Leader gagne [Double attaque] et +2000 ; [Jouée] révéler 2 Personnages de
  // 8000 : −6000 à un Personnage adverse
  'OP16-003': card({ onPlay: withCost(reveal8000(2), powerMod(oppChar(), -6000, 'turn', 'Edward Newgate'), 'Edward Newgate') }, {
    aura: (s, p, _src, target) => (s.active === p && target.uid === s.players[p].leader.uid ? 2000 : 0),
    keywordAura: (s, p, _src, target, k) => k === 'Double Attack' && s.active === p && target.uid === s.players[p].leader.uid,
  }),

  // Thatch (OP16-005) : −3 en main avec un Personnage « Équipage de Barbe Blanche » de 8000 ou plus ; [Bloqueur]
  'OP16-005': { handCost: (s, p) => (s.players[p].chars.some((c) => wbType(c.num) && power(s, c.uid) >= 8000) ? -3 : 0) },

  // Joz (OP16-007) : [Bloqueur] ; [Jouée] révéler un Personnage de 8000 : −1000
  'OP16-007': card({ onPlay: withCost(reveal8000(), powerMod(oppChar(), -1000, 'turn', 'Joz'), 'Joz') }),

  // Speed Jill (OP16-009) : [Jouée] défausser un Personnage de 8000 : [Initiative] et +2000 jusqu'à la fin du prochain tour
  // adverse
  'OP16-009': card({ onPlay: withCost(discardCost(1, C8000), seq(selfKeyword('Rush', 'Speed Jill'), selfPowerUntil(2000, 'Speed Jill')), 'Speed Jill') }),

  // Namur (OP16-010) : [Jouée] révéler un Personnage de 8000 : KO de 2000 de base ou moins
  'OP16-010': card({ onPlay: withCost(reveal8000(), ko(oppChar({ basePowerMax: 2000 }), 'Namur'), 'Namur') }),

  // Vista (OP16-011) : [Jouée] révéler un Personnage de 8000 : piocher 1 ; [DON!! x1] [En attaquant] KO de jusqu'à 2
  // Personnages adverses de 2000 de base ou moins
  'OP16-011': card({
    onPlay: withCost(reveal8000(), drawCards(1), 'Vista'),
    whenAttacking: when(selfDon(1), ko(oppChar({ basePowerMax: 2000 }), 'Vista', 2)),
  }),

  // Marco (OP16-014) : remplacement ; [En cas de KO] défausser un Personnage de 8000 : se rejouer depuis la Défausse
  'OP16-014': card({ onKO: withCost(discardCost(1, C8000), replayFromTrash('Marco'), 'Marco') }, { replaceRemoval: marcoReplace }),

  // « On va leur montrer de quoi on est capables !! » : [Principale] jouer de sa main jusqu'à 2 Personnages « Équipage de
  // Barbe Blanche » de 8000 ; [Déclenchement] Leader +1000 pour le tour
  'OP16-019': card({
    onMain: seq(playFromHand({ typeIncludes: WB, powerMin: 8000, powerMax: 8000 }, 'On va leur montrer...'), playFromHand({ typeIncludes: WB, powerMin: 8000, powerMax: 8000 }, 'On va leur montrer...')),
    onTrigger: leaderPower(1000, 'turn', 'On va leur montrer...'),
  }),

  // « Que tous ceux qui décident de me suivre... » : [Principale] épuiser 1 DON!! et révéler un Personnage de 8000 :
  // piocher 1 ; [Contre] défausser 1 carte : +3000
  'OP16-020': card({
    onMain: withCost(bothCosts(restDon(1), reveal8000()), drawCards(1), 'Que tous ceux qui décident de me suivre...'),
    onCounter: withCost(discardCost(1), counterOn(3000, 'Que tous ceux qui décident de me suivre...'), 'Que tous ceux qui décident de me suivre...'),
  }, { counterUseful: (s, p) => s.players[p].hand.length >= 2 }),

  // Moby Dick (Lieu, OP16-021) : [Jouée] avec un Leader {Équipage de Barbe Blanche}, 3 cartes du dessus, une en main ;
  // [Activation : Principale] se placer dans la Défausse : 1 DON!! épuisée à son Leader ou un Personnage
  'OP16-021': card({
    onPlay: when((s, p) => leaderHasType(s, p, WB), searchTop(3, 1, {}, 'une carte')),
    activateMain: { label: 'Moby Dick : te placer dans ta Défausse pour donner 1 DON!! épuisée', cost: trashSelf(), effect: giveDon(ownLeaderOrChar(), 1, 'Moby Dick') },
  }),

  // Inazuma (OP16-024) : mis KO par un effet adverse, épuiser un Personnage adverse ; [Bloqueur]
  'OP16-024': card({ onKO: rest(oppChar(), 'Inazuma') }, { onKOCondition: (_s, owner, _c, cause, by) => cause === 'effect' && by !== owner }),

  // Lapikov / Cornikov : [En attaquant] avec [Antlerkov] / [Bunkov], jouer de sa main un Personnage de coût 2 ou moins
  'OP16-025': card({ whenAttacking: when((s, p) => s.players[p].chars.some((c) => def(c.num).names.includes('Antlerkov')), playFromHand({ costMax: 2 }, 'Lapikov')) }, { attackUseful: () => false }),
  'OP16-029': card({ whenAttacking: when((s, p) => s.players[p].chars.some((c) => def(c.num).names.includes('Bunkov')), playFromHand({ costMax: 2 }, 'Cornikov')) }, { attackUseful: () => false }),

  // Emporio Ivankov (OP16-026) : [Jouée] 3 cartes du dessus, une {Impel Down}, puis jouer de sa main un Personnage de coût
  // 2 ou moins
  'OP16-026': card({ onPlay: seq(searchTop(3, 1, { type: 'Impel Down' }, 'une carte {Impel Down}'), playFromHand({ costMax: 2 }, 'Emporio Ivankov')) }),

  // Jinbe (OP16-027) : [DON!! x1] +2000
  'OP16-027': { selfPower: (_s, _p, self) => (self.don >= 1 ? 2000 : 0) },

  // Baggy (OP16-031) : [En cas de KO] jouer de sa main un [Prisoner of Impel Down]
  'OP16-031': card({ onKO: playFromHand({ name: 'Prisoner of Impel Down' }, 'Baggy') }),

  // Mr 2 Bonclay (OP16-036) : [Jouée] épuiser de coût 4 ou moins ; [En attaquant] puissance de base du Leader adverse
  'OP16-036': card({ onPlay: rest(oppChar({ costMax: 4 }), 'Mr 2 Bonclay'), whenAttacking: copyOppLeaderBase('Mr 2 Bonclay') }),

  // Mr 3 (OP16-037) : [Jouée] avec un Leader {Impel Down}, épuiser de coût 5 ou moins
  'OP16-037': card({ onPlay: when((s, p) => leaderHasType(s, p, 'Impel Down'), rest(oppChar({ costMax: 5 }), 'Mr 3')) }),

  // Portgas D. Ace (OP16-118) : le Contre de ses Personnages de 8000 en main devient +2000 ; [Jouée]/[En cas de KO] 5 cartes
  // du dessus, un [Monkey.D.Luffy] ou une carte « Équipage de Barbe Blanche »
  'OP16-118': card({
    onPlay: effect((ctx) => { lookTopPick(ctx, 5, 1, (n) => def(n).names.includes('Monkey.D.Luffy') || wbType(n), 'un [Monkey.D.Luffy] ou une carte « Équipage de Barbe Blanche »'); }, (s, p) => s.players[p].deck.length > 0),
    onKO: effect((ctx) => { lookTopPick(ctx, 5, 1, (n) => def(n).names.includes('Monkey.D.Luffy') || wbType(n), 'un [Monkey.D.Luffy] ou une carte « Équipage de Barbe Blanche »'); }, (s, p) => s.players[p].deck.length > 0),
  }, {
    handCounterOverride: (_s, _p, _src, num) => (def(num).category === 'CHARACTER' && def(num).power === 8000 ? 2000 : null),
  }),

  // Atmos (OP17-002), Haruta (OP17-009) : [Tour adverse] +3000 ; Haruta : [Jouée] KO de 2000 de base ou moins
  'OP17-002': { selfPower: (s, p) => (s.active !== p ? 3000 : 0) },
  'OP17-009': card({ onPlay: ko(oppChar({ basePowerMax: 2000 }), 'Haruta') }, { selfPower: (s, p) => (s.active !== p ? 3000 : 0) }),

  // Izo (OP17-003) : [Initiative : Personnage] ; [Jouée] avec le Leader [Edward.Newgate] ou {Pays des Wa}, −6000 à un
  // Personnage adverse épuisé
  'OP17-003': card({ onPlay: when(newgateOrWano, powerMod(oppChar({ rested: true }), -6000, 'turn', 'Izo')) }),

  // Caborage et Chavipère : [Jouée] un de ses Personnages {Pays des Wa} ou « Équipage de Barbe Blanche » gagne
  // [Initiative] pour le tour
  'OP17-004': card({
    onPlay: effect((ctx) => {
      const list = ctx.s.players[ctx.me].chars.filter((c) => hasType(c.num, WANO) || wbType(c.num)).map((c) => c.uid);
      if (!list.length) return;
      const answer = ctx.ask({
        prompt: 'Caborage et Chavipère : Personnage qui gagne [Initiative] pour le tour :',
        options: [...list.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })), { id: 'none', label: 'Aucun' }],
        tag: 'ownGrant',
      });
      if (answer === 'none') return;
      addMod(ctx.s, { uid: Number(answer.split(':')[1]), stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source: 'Caborage et Chavipère' });
      log(ctx.s, ctx.me, '[Initiative] pour le tour (Caborage et Chavipère)');
    }),
  }),

  // Edward Newgate (OP17-005) : −4 en main si l'adversaire a un Personnage de 10000 ou plus ; [Jouée] son Leader monocolore
  // a une puissance de base de 8000 jusqu'à la fin du prochain tour adverse
  'OP17-005': card({ onPlay: when((s, p) => def(s.players[p].leader.num).colors.length === 1, leaderBase8000('Edward Newgate')) }, {
    handCost: (s, p) => (oppHas10000(s, p) ? -4 : 0),
  }),

  // Oden Kozuki (OP17-007) : [Jouée] avec le Leader [Edward.Newgate] ou {Pays des Wa}, jouer de sa main un Personnage {Pays
  // des Wa} ou « Équipage de Barbe Blanche » de 6000 ou moins
  'OP17-007': card({
    onPlay: when(newgateOrWano, effect((ctx) => {
      playCharFromHand(ctx, (c) => (hasType(c.num, WANO) || wbType(c.num)) && (def(c.num).power ?? 0) <= 6000, 'Oden Kozuki : jouer un Personnage {Pays des Wa} ou « Équipage de Barbe Blanche » de 6000 ou moins de ta main :');
    })),
  }),

  // Joz (OP17-008) : [Jouée] son Leader [Edward.Newgate] a une puissance de base de 8000 jusqu'à la fin du prochain tour
  // adverse
  'OP17-008': card({ onPlay: when(newgateLeader, leaderBase8000('Joz')) }),

  // Fossa (OP17-010) : [Activation : Principale] [Une fois par tour] si l'adversaire a un Personnage de 10000 ou plus et
  // sans autre [Fossa], [Bloqueur] et +2000 jusqu'à la fin du prochain tour adverse
  'OP17-010': card({
    activateMain: {
      label: 'Fossa : gagner [Bloqueur] et +2000',
      once: true,
      effect: when((s, p, self) => oppHas10000(s, p) && !s.players[p].chars.some((c) => c.uid !== self && def(c.num).names.includes('Fossa')), seq(
        effect((ctx) => {
          addMod(ctx.s, { uid: ctx.source, stat: 'keyword', keyword: 'Blocker', amount: 0, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Fossa' });
          log(ctx.s, ctx.me, 'Fossa gagne [Bloqueur] jusqu’à la fin du prochain tour adverse');
        }),
        selfPowerUntil(2000, 'Fossa'),
      )),
    },
  }),

  // Blamenco : [DON!! x2] [En attaquant] −4000 à un Personnage adverse
  'OP17-011': card({ whenAttacking: when(selfDon(2), powerMod(oppChar(), -4000, 'turn', 'Blamenco')) }),

  // Blenheim : [Bloqueur] ; [En cas de KO] jouer de sa main une carte « Équipage de Barbe Blanche » de coût 1
  'OP17-012': card({ onKO: playFromHand({ typeIncludes: WB, costMin: 1, costMax: 1 }, 'Blenheim') }),

  // Portgas D. Ace (OP17-013) : −2 en main si l'adversaire a un Personnage de 10000 ou plus ; [Jouée] avec le Leader
  // [Edward.Newgate], −6000 à un Personnage adverse épuisé
  'OP17-013': card({ onPlay: when(newgateLeader, powerMod(oppChar({ rested: true }), -6000, 'turn', 'Portgas D. Ace')) }, {
    handCost: (s, p) => (oppHas10000(s, p) ? -2 : 0),
  }),

  // Marco (OP17-015) : remplacement ; [En cas de KO] défausser une carte « Équipage de Barbe Blanche » : se rejouer
  'OP17-015': card({ onKO: withCost(discardCost(1, { typeIncludes: WB }), replayFromTrash('Marco'), 'Marco') }, { replaceRemoval: marcoReplace }),

  // Rakuyo (OP17-016) : [Jouée] KO de jusqu'à 2 Personnages adverses de 2000 de base ou moins
  'OP17-016': card({ onPlay: ko(oppChar({ basePowerMax: 2000 }), 'Rakuyo', 2) }),

  // Gra ha ha ha ha !! : [Contre] +2000 à son Leader ou un Personnage « Équipage de Barbe Blanche », puis −2000 au Leader
  // ou à un Personnage adverse
  'OP17-017': card({
    onCounter: seq(effect((ctx) => {
      const f = findField(ctx.s, Number(ctx.pending.data?.target));
      if (f && wbType(f.card.num)) counterBoost(ctx, 2000, 'Gra ha ha ha ha !!');
    }), powerMod(oppLeaderOrChar(), -2000, 'turn', 'Gra ha ha ha ha !!')),
  }),

  // Le pouvoir de détruire le monde : [Principale] épuiser 2 DON!! : KO d'un Lieu adverse ; [Contre] avec 2 Personnages de
  // 8000 de base ou plus, +4000
  'OP17-018': card({
    onMain: withCost(restDon(2), koOppStage(99, 'Le pouvoir de détruire le monde'), 'Le pouvoir de détruire le monde'),
    onCounter: when((s, p) => s.players[p].chars.filter((c) => basePower(s, c.uid) >= 8000).length >= 2, counterOn(4000, 'Le pouvoir de détruire le monde')),
  }, { counterUseful: (s, p) => s.players[p].chars.filter((c) => basePower(s, c.uid) >= 8000).length >= 2 }),

  // « J'ai aucune envie de discuter avec un avorton comme toi ! » : [Principale] 5 cartes du dessus, une « Équipage de
  // Barbe Blanche » ; [Déclenchement] Leader +1000 pour le tour
  'OP17-019': card({ onMain: searchTop(5, 1, { typeIncludes: WB }, 'une carte « Équipage de Barbe Blanche »'), onTrigger: leaderPower(1000, 'turn', 'J’ai aucune envie de discuter...') }),

  // Atmos (ST15-001) : [En attaquant] avec le Leader [Edward.Newgate], plus de Vie en main par ses propres effets ce
  // tour-ci
  'ST15-001': card({
    whenAttacking: when(newgateLeader, effect((ctx) => {
      ctx.s.players[ctx.me].noLifeToHandTurn = ctx.s.turn;
      log(ctx.s, ctx.me, 'ne peut plus ajouter de carte de Vie à sa main par ses effets ce tour-ci (Atmos)');
    }, () => false)),
  }),

  // Edward Newgate (ST15-002) : [Jouée] 1 DON!! épuisée ; [Activation : Principale] s'épuiser : KO de 5000 ou moins
  'ST15-002': card({
    onPlay: giveDon(ownLeaderOrChar(), 1, 'Edward Newgate'),
    activateMain: { label: 'Edward Newgate : t’épuiser pour mettre KO un Personnage de 5000 ou moins', cost: restSelf(), effect: ko(oppChar({ powerMax: 5000 }), 'Edward Newgate') },
  }),

  // Kingdew (ST15-003) : [Bloqueur] ; [Tour adverse] mis KO par un effet, Leader +2000 pour le tour
  'ST15-003': card({ onKO: leaderPower(2000, 'turn', 'Kingdew') }, { onKOCondition: (s, owner, _c, cause) => s.active !== owner && cause === 'effect' }),

  // Thatch (ST15-004) : [Jouée] avec un Leader « Équipage de Barbe Blanche », −2000, puis la Vie du dessus en main
  'ST15-004': card({
    onPlay: when(wbLeaderIncl, seq(powerMod(oppChar(), -2000, 'turn', 'Thatch'), effect((ctx) => { lifeToHand(ctx.s, ctx.me, 'top'); }))),
  }),

  // Portgas D. Ace (ST15-005) : [Initiative] avec un Leader « Équipage de Barbe Blanche » ; [Une fois par tour] retiré par
  // un effet adverse, −2000 pour le tour à la place
  'ST15-005': {
    rush: (s, p) => wbLeaderIncl(s, p),
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: () => 'Portgas D. Ace : prendre −2000 pour le tour pour rester sur le terrain',
      condition: (_s, _p, self, victim) => victim.uid === self.uid,
      apply: (s, p, self) => {
        addMod(s, { uid: self.uid, stat: 'power', amount: -2000, until: 'turn', source: 'Portgas D. Ace' });
        log(s, p, 'Portgas D. Ace reçoit −2000 pour le tour et reste sur le terrain');
      },
    },
  },
};

