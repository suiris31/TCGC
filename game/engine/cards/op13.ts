// OP13 et PRB02 (étape C, tâche S6) : les cartes que le traducteur ne comprend pas, ou qu'il ne sait pas compiler, codées
// à la main d'après le texte officiel (VO et VF, jamais recopié). Le reste des deux sets est en recettes
// (recipes/sets/op13.ts, recipes/sets/prb02.ts). Choix d'interprétation : game/docs/interpretations.md, section
// « OP13 et PRB02 (tâche S6) ».
import {
  addDelayed, addDonFromDeck, addMod, attachedDon, canPlayCharacters, canPlayFromHand, chooseUpTo1, def, describe, donOnField,
  emit, findField, hasType, log, may, other, playCharacter, playFromHandFree, playStage, power, removeFromField,
  shuffleDeck, uniqueByNum, untapDon, untilOpponentsNextEnd,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  any, bothCosts, card, chooseOne, defenderPower, discardCost, drawCards, effect, giveDon, keywordWhile, ko, leaderAttribute, leaderNamed, leaderType, lifeAtMost,
  oppChar, oppLeaderOrChar, ownLeaderOrChar, playFromHand, powerMod, readyDon, readySelf, rest, restDon, restSelf, revealCost,
  selfDon, selfKeyword, seq, trashOwnCharCost, trashThis, when, withCost, onceWithCost, type Condition, type Cost, type Effect,
} from './bricks.ts';
import { playFromHandOrTrash } from './bricks-play.ts';
import { trashByEffect } from './bricks-removal.ts';
import { pick } from './bricks-power.ts';
import type { ManualRegistry } from '../recipes/types.ts';

const SHC = 'Straw Hat Crew';
const CD = 'Celestial Dragons';
const ELDERS = 'Five Elders';
const ROGER = 'Roger Pirates';

const typeIncludes = (num: string, part: string) => def(num).types.some((t) => t.includes(part));
const givenDon: Condition = (s, p) => attachedDon(s, p) >= 1;

// ---------- Leaders ----------

// Monkey D. Luffy (OP13-001) : épuiser autant de DON!! que voulu ; la carte choisie (ce Leader ou 1 Personnage {Straw Hat
// Crew}) gagne +2000 pour le combat par DON!! épuisée (n° 2500). L'option proposée en premier est celle qui suffit à
// repousser l'attaque (l'IA prend la première).
const luffyBoost: Effect = effect((ctx) => {
  const { s } = ctx;
  const P = s.players[ctx.me];
  if (P.donActive < 1 || P.donActive > 5 || !s.battle) return;
  const targets = [P.leader.uid, ...P.chars.filter((c) => hasType(c.num, SHC)).map((c) => c.uid)];
  const attacked = s.battle.target;
  if (targets.includes(attacked)) targets.sort((a, b) => (a === attacked ? -1 : b === attacked ? 1 : 0));
  const need = targets[0] === attacked ? Math.max(0, power(s, s.battle.attacker) - power(s, attacked) + 1) : 0;
  const enough = Math.min(P.donActive, Math.max(1, Math.ceil(need / 2000)));
  const counts = [enough, ...Array.from({ length: P.donActive }, (_, i) => i + 1).filter((k) => k !== enough)];
  const answer = ctx.ask({
    prompt: 'Monkey D. Luffy : combien de DON!! épuiser (+2000 de puissance pour le combat chacune) ?',
    options: [...counts.map((k) => ({ id: `n:${k}`, label: `${k} DON!! (+${2000 * k})` })), { id: 'none', label: 'Aucune' }],
    tag: 'donCount',
  });
  if (answer === 'none') return;
  const n = Number(answer.split(':')[1]);
  const [uid] = targets.length === 1 ? targets : pick(ctx, targets, { n: 1, forced: true }, 'Monkey D. Luffy : carte qui gagne la puissance :', 'ownPower');
  P.donActive -= n;
  P.donRested += n;
  addMod(s, { uid, stat: 'power', amount: 2000 * n, until: 'battle', source: 'Monkey D. Luffy' });
  log(s, ctx.me, `épuise ${n} DON!! : ${describe(s, uid)} gagne +${2000 * n} de puissance pour le combat (Monkey D. Luffy)`);
}, (s, p) => s.players[p].donActive >= 1 && s.players[p].donActive <= 5);

// Portgas D. Ace (OP13-002) : « quand vous subissez des dégâts ou qu'un de vos Personnages de 6000 de puissance de base ou
// plus est mis KO » (puissance imprimée de la carte mise KO, n° 2501) ; [DON!! x1] [Une fois par tour] (clé commune)
const ACE_DRAW = 'ace002draw';
const aceDraw = (on: 'damage' | 'ko', test: (e: GameEvent) => boolean) => ({
  on,
  once: ACE_DRAW,
  if: (_s: GameState, owner: PlayerId, self: FieldCard, e: GameEvent) => e.player === owner && self.don >= 1 && test(e),
  run: (ctx: EffectCtx) => drawCards(1).run(ctx),
});

// Imu (OP13-079) : coût « placer dans sa Défausse 1 de ses Personnages {Celestial Dragons} ou 1 carte de sa main »
const eitherCost = (a: Cost, b: Cost, source: string): Cost => ({
  get label() { return `${a.label} ou ${b.label}`; },
  can: (s, p, self) => a.can(s, p, self) || b.can(s, p, self),
  pay: (ctx) => {
    const okA = a.can(ctx.s, ctx.me, ctx.source);
    const okB = b.can(ctx.s, ctx.me, ctx.source);
    if (okA && okB) {
      const answer = ctx.ask({
        prompt: `${source} : quel coût payer ?`,
        options: [{ id: 'b', label: b.label }, { id: 'a', label: a.label }],
        tag: 'chooseCost',
      });
      return answer === 'a' ? a.pay(ctx) : b.pay(ctx);
    }
    return okA ? a.pay(ctx) : b.pay(ctx);
  },
});

// Imu : au début de la partie, jouer jusqu'à 1 Lieu {Mary Geoise} de son deck (le deck est ensuite mélangé)
const imuStart = (ctx: EffectCtx) => {
  const P = ctx.s.players[ctx.me];
  const options = uniqueByNum(P.deck.filter((c) => def(c.num).category === 'STAGE' && hasType(c.num, 'Mary Geoise')));
  if (options.length) {
    const answer = ctx.ask({
      prompt: 'Imu : jouer jusqu’à 1 Lieu {Terre Sainte de Marie Joie} de ton deck :',
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
      tag: 'playFree',
    });
    if (answer !== 'none') {
      const [chosen] = P.deck.splice(P.deck.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      playStage(ctx, ctx.me, chosen);
    }
  }
  shuffleDeck(ctx.s, ctx.me);
};

// ---------- Personnages, Événements, Lieux ----------

// Silvers Rayleigh (OP13-066) : « puis, ajoutez jusqu'à 1 DON!! redressée de votre deck DON!! à la fin de ce tour » (VF :
// l'ajout lui-même a lieu à la fin du tour, n° 2504)
const donAtEndOfTurn: Effect = effect((ctx) => {
  addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'addDonActive', amount: 1, source: 'Silvers Rayleigh' });
  log(ctx.s, ctx.me, 'ajoutera 1 DON!! redressée à la fin du tour (Silvers Rayleigh)');
}, (s, p) => s.players[p].donDeck > 0);

// Gordon (OP13-024) : « redressez jusqu'à 2 de vos DON!! à la fin de ce tour »
const untapAtEndOfTurn: Effect = effect((ctx) => {
  addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'untapDon', amount: 2, source: 'Gordon' });
  log(ctx.s, ctx.me, 'redressera jusqu’à 2 DON!! à la fin du tour (Gordon)');
});

// Cinq Doyens (OP13-082) : Personnages {Five Elders} de 5000 de puissance (imprimée) de la Défausse
const elder5000 = (c: Card) => def(c.num).category === 'CHARACTER' && hasType(c.num, ELDERS) && def(c.num).power === 5000;
const fiveElders: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  for (const c of [...P.chars]) trashByEffect(ctx, c.uid);
  const names = new Set<string>();
  for (let i = 0; i < 5; i++) {
    if (!canPlayCharacters(ctx.s, ctx.me)) return;
    const options = uniqueByNum(P.trash.filter((c) => elder5000(c) && !def(c.num).names.some((n) => names.has(n)) && canPlayCharacters(ctx.s, ctx.me, c.num)));
    if (!options.length) return;
    const answer = ctx.ask({
      prompt: `Cinq Doyens : jouer un Personnage {Cinq Doyens} de 5000 de puissance de ta Défausse (noms différents, ${i} sur 5) :`,
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Arrêter' }],
      tag: 'playFree',
    });
    if (answer === 'none') return;
    const [chosen] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    for (const n of def(chosen.num).names) names.add(n);
    playCharacter(ctx, ctx.me, chosen, { from: 'trash' });
  }
}, (s, p) => {
  // utile s'il y a au moins autant de noms différents à rejouer que de Personnages à défausser (et au moins 2)
  const P = s.players[p];
  const names = new Set(P.trash.filter(elder5000).map((c) => def(c.num).names.join('/')));
  return names.size >= Math.max(2, P.chars.length);
});

// Saint Myosgard (OP13-092) : jouer jusqu'à 1 Lieu {Mary Geoise} de coût 1 de sa Défausse
const stageFromTrash = (c: Card) => def(c.num).category === 'STAGE' && hasType(c.num, 'Mary Geoise') && def(c.num).cost === 1;
const playStageFromTrash: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const options = uniqueByNum(P.trash.filter(stageFromTrash));
  if (!options.length) return;
  const answer = ctx.ask({
    prompt: 'Saint Myosgard : jouer jusqu’à 1 Lieu {Terre Sainte de Marie Joie} de coût 1 de ta Défausse :',
    options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
  });
  if (answer === 'none') return;
  const [chosen] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
  playStage(ctx, ctx.me, chosen);
}, (s, p) => s.players[p].trash.some(stageFromTrash));

// Aucun pays de ce nom... (OP13-098) : « mettez KO jusqu'à 1 Lieu adverse ayant un coût de 7 »
const NO_COUNTRY = 'Aucun pays de ce nom...';
const koOppStageCost7: Effect = effect((ctx) => {
  const stage = ctx.s.players[ctx.opp].stage;
  if (!stage || (def(stage.num).cost ?? 0) !== 7) return;
  const uid = chooseUpTo1(ctx, [stage.uid], `${NO_COUNTRY} : Lieu adverse de coût 7 à mettre KO :`, 'oppKo');
  if (uid === null) return;
  const f = removeFromField(ctx.s, uid, 'trash');
  if (f) log(ctx.s, ctx.opp, `le Lieu ${def(f.card.num).name} est mis KO (${NO_COUNTRY})`);
}, (s, p) => {
  const stage = s.players[other(p)].stage;
  return Boolean(stage && (def(stage.num).cost ?? 0) === 7);
});

// Le trône vide (OP13-099) : jouer de sa main jusqu'à 1 Personnage {Five Elders} noir de coût inférieur ou égal au nombre de
// DON!! de son terrain (compté à la résolution, après le coût)
const blackElder = (s: GameState, p: PlayerId, c: Card) => def(c.num).category === 'CHARACTER' && hasType(c.num, ELDERS)
  && def(c.num).colors.includes('Black') && (def(c.num).cost ?? 0) <= donOnField(s, p);
const emptyThrone: Effect = effect((ctx) => {
  playFromHandFree(ctx, (c) => blackElder(ctx.s, ctx.me, c), 'Le trône vide : jouer jusqu’à 1 Personnage {Cinq Doyens} noir de ta main :');
}, (s, p) => canPlayFromHand(s, p) && canPlayCharacters(s, p) && s.players[p].hand.some((c) => blackElder(s, p, c)));

// Boa Hancock (PRB02-017) : le Leader adverse épuisé, ou jusqu'à 1 Personnage adverse autre que [Monkey.D.Luffy], ne peut
// pas attaquer jusqu'à la fin du prochain tour adverse
const hancockTargets = (s: GameState, p: PlayerId) => {
  const O = s.players[other(p)];
  return [...(O.leader.rested ? [O.leader.uid] : []), ...O.chars.filter((c) => !def(c.num).names.includes('Monkey.D.Luffy')).map((c) => c.uid)];
};
const hancockLock: Effect = effect((ctx) => {
  const uid = chooseUpTo1(ctx, hancockTargets(ctx.s, ctx.me), 'Boa Hancock : carte adverse qui ne pourra pas attaquer :', 'oppLock');
  if (uid === null) return;
  const until = untilOpponentsNextEnd(ctx.s, ctx.me);
  addMod(ctx.s, { uid, stat: 'cantAttack', amount: 0, until, source: 'Boa Hancock' });
  log(ctx.s, ctx.me, `${describe(ctx.s, uid)} ne peut pas attaquer jusqu’à la fin du prochain tour adverse (Boa Hancock)`);
}, (s, p) => hancockTargets(s, p).length > 0);

export const OP13: Record<string, CardBehavior> = {
  // Monkey D. Luffy (Leader) : [DON!! x1] [Attaque adverse] avec 5 DON!! redressées ou moins, épuiser des DON!! : +2000 par
  // DON!! pour le combat à ce Leader ou à 1 Personnage {Straw Hat Crew}
  'OP13-001': card({ onOpponentAttack: when(selfDon(1), luffyBoost) }),

  // Portgas D. Ace (Leader) : [Attaque adverse] [Une fois par tour] défausser 1 : −2000 pour le combat à un Leader ou
  // Personnage adverse ; [DON!! x1] [Une fois par tour] piocher 1 quand il subit des dégâts ou qu'un de ses Personnages de
  // 6000 de puissance de base ou plus est mis KO
  'OP13-002': card({
    onOpponentAttack: onceWithCost('ace002', discardCost(1), powerMod(oppLeaderOrChar(), -2000, 'battle', 'Portgas D. Ace'), 'Portgas D. Ace'),
  }, {
    when: [
      aceDraw('damage', () => true),
      aceDraw('ko', (e) => e.zone === 'character' && (def(e.num ?? '').power ?? 0) >= 6000),
    ],
  }),

  // Gol D. Roger (Leader) : avec des DON!! sur son terrain, 1 DON!! placée pendant sa phase DON!! va à son Leader (condition
  // lue avant de placer, n° 2502) ; −2000 avec 9 DON!! ou moins sur son terrain
  'OP13-003': {
    donPhaseToLeader: (s, p) => donOnField(s, p) > 0,
    selfPower: (s, p) => (donOnField(s, p) <= 9 ? -2000 : 0),
  },

  // Curly Dadan : [Double attaque] tant qu'il y a un autre Personnage {Mountain Bandits} sur son terrain
  'OP13-009': {
    keywordAura: keywordWhile('Double Attack', (s, p, self) => s.players[p].chars.some((c) => c.uid !== self && hasType(c.num, 'Mountain Bandits'))),
  },

  // Kobby : [Bloqueur] ; [Jouée] avec un Leader {FILM} ou <Strike>, redresser jusqu'à 1 DON!! (recette en écart d'aller-retour :
  // « type ou attribut » d'un seul Leader)
  'OP13-025': card({ onPlay: when(any(leaderType('FILM'), leaderAttribute('Strike')), readyDon(1)) }),

  // Boa Hancock : [En cas de KO] avec le Leader [Boa Hancock] ou un Leader multicolore, piocher 2
  'OP13-051': card({ onKO: when(any(leaderNamed('Boa Hancock'), (s, p) => def(s.players[p].leader.num).colors.length > 1), drawCards(2)) }),

  // Uta : [Jouée] redresser jusqu'à 2 DON!!, puis plus de Personnage de coût de base 5 ou plus ce tour-ci ; [En cas de KO]
  // jouer épuisé un Personnage de coût 5 ou moins de sa main
  'OP13-023': card({
    onPlay: seq(readyDon(2), effect((ctx) => {
      ctx.s.players[ctx.me].noCharsFromCost = { turn: ctx.s.turn, cost: 5 };
      log(ctx.s, ctx.me, 'ne peut plus jouer de Personnage de coût de base 5 ou plus ce tour-ci (Uta)');
    }, () => false)),
    onKO: playFromHand({ costMax: 5 }, 'Uta', { rested: true }),
  }),

  // Gordon : [Jouée] révéler 1 carte {Music} ou {FILM} de sa main : redresser jusqu'à 2 DON!! à la fin du tour
  'OP13-024': card({
    onPlay: withCost(revealCost(1, { anyOf: [{ type: 'Music' }, { type: 'FILM' }] }), untapAtEndOfTurn, 'Gordon'),
  }),

  // Shanks : [Jouée] redresser toutes ses DON!!, puis plus de carte jouée de sa main ce tour-ci
  'OP13-028': card({
    onPlay: seq(effect((ctx) => { untapDon(ctx.s, ctx.me, ctx.s.players[ctx.me].donRested, ctx.num); }), effect((ctx) => {
      ctx.s.players[ctx.me].noHandPlayTurn = ctx.s.turn;
      log(ctx.s, ctx.me, 'ne peut plus jouer de carte de sa main ce tour-ci (Shanks)');
    }, () => false)),
  }),

  // Bepo : [Fin de votre tour] redresser ce Personnage ou jusqu'à 1 DON!!
  'OP13-035': card({
    endOfTurn: chooseOne('Bepo', [
      { label: 'Redresser Bepo', effect: readySelf() },
      { label: 'Redresser 1 DON!!', effect: readyDon(1) },
    ]),
  }),

  // Toki : si un de ses Personnages « Roger Pirates » devait être mis KO par un effet adverse, elle peut aller dans la
  // Défausse à la place (elle-même comprise)
  'OP13-060': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: true,
      label: (_s, _self, victim) => `Toki : la placer dans ta Défausse pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (_s, _owner, _self, victim) => typeIncludes(victim.num, ROGER),
      apply: (s, owner, self) => {
        const f = removeFromField(s, self.uid, 'trash');
        if (!f) return;
        log(s, owner, 'Toki est placée dans la Défausse à la place');
        emit(s, { type: 'leave', player: owner, uid: self.uid, num: self.num, zone: 'character', by: owner, cause: 'effect', sourceNum: self.num });
      },
    },
  },

  // Silvers Rayleigh : [Initiative] ; [Jouée] avec des DON!! données, épuiser un Personnage adverse de coût 5 ou moins ;
  // puis 1 DON!! redressée ajoutée à la fin du tour
  'OP13-066': card({
    onPlay: seq(when(givenDon, rest(oppChar({ costMax: 5 }), 'Silvers Rayleigh')), donAtEndOfTurn),
  }),

  // Oro Jackson (Lieu) : [Une fois par tour] quand un de ses Personnages « Roger Pirates » quitte le terrain à cause d'un
  // effet adverse, 1 DON!! épuisée
  'OP13-078': {
    when: (['ko', 'leave'] as const).map((on) => ({
      on,
      once: 'oro078',
      if: (_s: GameState, owner: PlayerId, _self: FieldCard, e: GameEvent) => e.player === owner && e.zone === 'character'
        && e.cause === 'effect' && e.by !== undefined && e.by !== owner && typeIncludes(e.num ?? '', ROGER),
      run: (ctx: EffectCtx) => { addDonFromDeck(ctx.s, ctx.me, 1, false); },
    })),
  },

  // Imu (Leader) : pas d'Événement de coût 2 ou plus dans son deck ; au début de la partie, un Lieu {Mary Geoise} de son
  // deck ; [Activation : Principale] [Une fois par tour] placer dans sa Défausse 1 Personnage {Celestial Dragons} ou 1 carte
  // de sa main : piocher 1
  'OP13-079': card({
    activateMain: {
      label: 'Imu : placer dans ta Défausse 1 Personnage {Dragon céleste} ou 1 carte de ta main pour piocher 1 carte',
      once: true,
      cost: eitherCost(trashOwnCharCost({ type: CD }), discardCost(1), 'Imu'),
      effect: drawCards(1),
    },
  }, {
    rules: { deckRestriction: (d) => (d.category === 'EVENT' && (d.cost ?? 0) >= 2 ? 'Imu : pas d’Événement de coût 2 ou plus' : null) },
    when: [{ on: 'gameStart', if: () => true, run: imuStart }],
  }),

  // Cinq Doyens : [Activation : Principale] avec le Leader [Imu], épuiser 1 DON!! et défausser 1 carte : placer tous ses
  // Personnages dans sa Défausse, puis jouer jusqu'à 5 Personnages {Five Elders} de 5000 de puissance et de noms différents
  // de sa Défausse
  'OP13-082': card({
    activateMain: {
      label: 'Cinq Doyens : placer tous tes Personnages dans ta Défausse et rejouer jusqu’à 5 {Cinq Doyens} de 5000',
      condition: leaderNamed('Imu'),
      cost: bothCosts(restDon(1), discardCost(1)),
      effect: fiveElders,
    },
  }),

  // Saint Ju Peter : ne peut pas quitter le terrain à cause d'un effet adverse avec 7 cartes ou plus dans sa Défausse ;
  // [Votre tour] avec 10 cartes ou plus, la puissance de base de ses Personnages {Five Elders} passe à 7000
  'OP13-084': {
    cantLeave: (s, p) => s.players[p].trash.length >= 7,
    basePowerAura: (s, p, _src, target) => (s.active === p && s.players[p].trash.length >= 10 && !findField(s, target.uid)?.leader
      && hasType(target.num, ELDERS) ? 7000 : null),
  },

  // Saint Myosgard : [Jouée] avec 3 Vies ou moins, jouer un Lieu {Mary Geoise} de coût 1 de sa Défausse
  'OP13-092': card({ onPlay: when(lifeAtMost(3), playStageFromTrash) }),

  // Aucun pays de ce nom... : [Principale] épuiser 1 DON!! : avec le Leader [Imu], KO d'un Lieu adverse de coût 7 ;
  // [Contre] avec le Leader [Imu], +4000 pour le combat à la carte attaquée
  'OP13-098': card({
    onMain: withCost(restDon(1), when(leaderNamed('Imu'), koOppStageCost7), NO_COUNTRY),
    onCounter: when(leaderNamed('Imu'), defenderPower(4000, NO_COUNTRY)),
  }),

  // Le trône vide (Lieu) : [Votre tour] avec 19 cartes ou plus dans sa Défausse, son Leader +1000 ; [Activation :
  // Principale] épuiser ce Lieu et 3 DON!! : jouer un Personnage {Five Elders} noir de coût au plus le nombre de ses DON!!
  'OP13-099': card({
    activateMain: {
      label: 'Le trône vide : épuiser ce Lieu et 3 DON!! pour jouer un Personnage {Cinq Doyens} noir de ta main',
      cost: bothCosts(restSelf(), restDon(3)),
      effect: emptyThrone,
    },
  }, {
    aura: (s, p, _src, target) => (s.active === p && target.uid === s.players[p].leader.uid && s.players[p].trash.length >= 19 ? 1000 : 0),
  }),

  // Jewelry Bonney (Leader) : [Votre tour] [Une fois par tour] quand il joue un Personnage ayant [Déclenchement], donner
  // jusqu'à 2 DON!! épuisées à 1 de ses Leader ou Personnages
  'OP13-100': {
    when: [{
      on: 'play',
      once: 'bonney100',
      if: (s, owner, _self, e) => s.active === owner && e.player === owner && e.zone === 'character' && Boolean(def(e.num ?? '').triggerEn),
      run: (ctx) => giveDon(ownLeaderOrChar(), 2, 'Jewelry Bonney').run(ctx),
    }],
  },

  // Conney : [Tour adverse] quand un [Déclenchement] est activé, [Bloqueur] pour le tour ; [Déclenchement] se jouer (lu
  // d'office dans le texte)
  'OP13-106': {
    when: [{
      on: 'trigger',
      if: (s, owner, self) => s.active !== owner && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => selfKeyword('Blocker', 'Conney').run(ctx),
    }],
  },
};

export const PRB02: Record<string, CardBehavior> = {
  // Trafalgar Law : [Une fois par tour] s'il devait quitter le terrain à cause d'un effet adverse, −2000 pour le tour à la
  // place ; [En attaquant] −2000 pour le tour à un Personnage adverse
  'PRB02-002': card({
    whenAttacking: powerMod(oppChar(), -2000, 'turn', 'Trafalgar Law'),
  }, {
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: () => 'Trafalgar Law : −2000 de puissance pour le tour pour rester sur le terrain',
      condition: (_s, _owner, self, victim) => victim.uid === self.uid,
      apply: (s, owner, self) => {
        addMod(s, { uid: self.uid, stat: 'power', amount: -2000, until: 'turn', source: 'Trafalgar Law' });
        log(s, owner, 'Trafalgar Law reste sur le terrain et perd 2000 de puissance pour le tour');
      },
    },
  }),

  // Mr 3 (Galdino) : [Bloqueur] ; quand il est épuisé par un effet adverse, il peut aller dans la Défausse et piocher 2
  'PRB02-009': {
    when: [{
      on: 'rest',
      if: (s, owner, self, e) => e.uid === self.uid && e.cause === 'effect' && e.by !== undefined && e.by !== owner
        && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => {
        if (!findField(ctx.s, ctx.source)) return;
        if (!may(ctx, 'Mr 3 : le placer dans ta Défausse et piocher 2 cartes ?')) return;
        seq(trashThis(), drawCards(2)).run(ctx);
      },
    }],
  },

  // Boa Hancock : [Jouée] défausser 1 carte ayant [Déclenchement] : le Leader adverse épuisé ou 1 Personnage adverse autre
  // que [Monkey.D.Luffy] ne peut pas attaquer jusqu'à la fin du prochain tour adverse ; [Déclenchement] KO d'un Personnage
  // adverse de coût 4 ou moins
  'PRB02-017': card({
    onPlay: withCost(discardCost(1, { trigger: true }), hancockLock, 'Boa Hancock'),
    onTrigger: ko(oppChar({ costMax: 4 }), 'Boa Hancock'),
  }),

  // Portgas D. Ace : [Jouée] avec une carte de Vie face visible, jouer de sa main ou de sa Défausse un [Sabo], [Portgas.D.Ace]
  // ou [Monkey.D.Luffy] de coût 2
  'PRB02-018': card({
    onPlay: when((s, p) => s.players[p].life.some((c) => c.faceUp), playFromHandOrTrash({
      costMin: 2, costMax: 2, anyOf: [{ name: 'Sabo' }, { name: 'Portgas.D.Ace' }, { name: 'Monkey.D.Luffy' }],
    }, 'Portgas D. Ace')),
  }),
};

// Rien de codé à la main n'est appelé par une recette d'OP13 ou de PRB02 (sortie « manual », 01-contrats.md § 15.2)
export const MANUAL_OP13: ManualRegistry = {};
