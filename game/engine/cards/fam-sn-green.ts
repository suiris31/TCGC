// FAMILLE DU LEADER ZORO, {SUPERNOVAE} VERTS (phase 4E) : cartes vertes {Supernovae} jouables en format Standard, codées
// d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais). Elles épuisent, empêchent les cartes
// adverses d'être redressées et redressent leurs DON!!. Chaque condition se vérifie dans la partie. Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import {
  addDelayed, addMod, canPlayCharacters, def, drawAndDiscard, findField, knownFirst, leaderHasType, log, other, playableByEffect, playCharacter,
  removeByEffect, restByEffect, restedCards, setActive, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  card, drawCards, effect, grant, keepRested, ko, oppChar, playFromHand, readyDon, rest, returnOwnChar, searchTop,
  seq, trashSelf, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const SN = 'Supernovas';  // {Supernovae}
const snLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SN);
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const drawTrash = (n: number, trash: number): Effect => effect((ctx) => drawAndDiscard(ctx, n, trash), (s, p) => s.players[p].deck.length > 0);
const nextOppTurn = (s: GameState, me: PlayerId) => s.turn + (s.active === me ? 1 : 2);

// « Jusqu'à 1 Personnage épuisé (ou DON!! épuisée, Jewelry Bonney OP07-026) adverse ne sera pas redressé lors de la
// prochaine phase de Recharge adverse »
const lockCharOrDon: Effect = {
  run: (ctx) => {
    const O = ctx.s.players[ctx.opp];
    const chars = O.chars.filter((c) => c.rested);
    const options = [
      ...chars.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      ...(O.donRested > 0 ? [{ id: 'don', label: '1 DON!! épuisée adverse' }] : []),
    ];
    if (!options.length) return;
    const answer = ctx.ask({ prompt: 'Jewelry Bonney : carte adverse épuisée qui ne sera pas redressée lors de la prochaine phase de Recharge adverse :', options: [...options, { id: 'none', label: 'Aucune' }], tag: 'oppLock' });
    if (answer === 'none') return;
    const turn = nextOppTurn(ctx.s, ctx.me);
    if (answer === 'don') {
      const before = O.donNoRefresh?.turn === turn ? O.donNoRefresh.count : 0;
      O.donNoRefresh = { turn, count: Math.min(before + 1, O.donRested) };
      log(ctx.s, ctx.me, '1 DON!! épuisée adverse ne sera pas redressée lors de la prochaine phase de Recharge adverse (Jewelry Bonney)');
      return;
    }
    const uid = Number(answer.split(':')[1]);
    addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: turn, source: 'Jewelry Bonney' });
    log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} ne sera pas redressé lors de la prochaine phase de Recharge adverse (Jewelry Bonney)`);
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => c.rested) || s.players[other(p)].donRested > 0,
};

// Chambres : renvoyer 1 de ses Personnages en main, puis jouer de sa main un Personnage de coût 2 ou moins d'une autre
// couleur
const chambres: Effect = {
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    if (!P.chars.length) return;
    const answer = ctx.ask({
      prompt: 'Chambres : Personnage à renvoyer dans ta main :',
      options: P.chars.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'returnOwn',
    });
    const returned = findField(ctx.s, Number(answer.split(':')[1]))!.card;
    const colors = def(returned.num).colors;
    if (!removeByEffect(ctx, returned.uid, 'hand') || !canPlayCharacters(ctx.s, ctx.me)) return;
    const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) <= 2
      && playableByEffect(c.num) && canPlayCharacters(ctx.s, ctx.me, c.num) && def(c.num).colors.some((col) => !colors.includes(col)))));
    if (!options.length) return;
    const pick = ctx.ask({
      prompt: 'Chambres : jouer jusqu’à 1 Personnage de coût 2 ou moins d’une autre couleur de ta main :',
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
      tag: 'playFree',
    });
    if (pick === 'none') return;
    const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(pick.split(':')[1])), 1);
    playCharacter(ctx, ctx.me, c);
  },
  // utile seulement pour rejouer un Personnage à effet [Jouée] ou en sauver un, l'IA ne le joue pas
  useful: () => false,
};

// Law et Bepo : épuiser un Personnage adverse, qui ne sera pas redressé ; puis Leader +2000 si l'adversaire a 2
// Personnages épuisés ou plus
const lawBepo: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.opp].chars.filter((c) => !c.rested).map((c) => c.uid);
    const answer = list.length ? ctx.ask({
      prompt: 'Law et Bepo : Personnage adverse à épuiser (il ne sera pas redressé lors de la prochaine phase de Recharge adverse) :',
      options: [...list.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })), { id: 'none', label: 'Aucun' }],
      tag: 'oppRest',
    }) : 'none';
    if (answer !== 'none') {
      const uid = Number(answer.split(':')[1]);
      if (restByEffect(ctx, uid)) {
        addMod(ctx.s, { uid, stat: 'noRefresh', amount: 0, until: nextOppTurn(ctx.s, ctx.me), source: 'Law et Bepo' });
        log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} ne sera pas redressé lors de la prochaine phase de Recharge adverse`);
      }
    }
    if (ctx.s.players[ctx.opp].chars.filter((c) => c.rested).length >= 2) {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 2000, until: untilOpponentsNextEnd(ctx.s, ctx.me), source: 'Law et Bepo' });
      log(ctx.s, ctx.me, 'son Leader gagne +2000 de puissance jusqu’à la fin du prochain tour adverse (Law et Bepo)');
    }
  },
  useful: () => true,
};

// [Attaque adverse] [Une fois par tour] sans coût
const oncePerOppAttack = (key: string, then: Effect): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.usedOpt.includes(key)) return;
    f.card.usedOpt.push(key);
    then.run(ctx);
  },
  useful: then.useful,
});

export const FAM_SN_GREEN: Record<string, CardBehavior> = {
  // Cavendish (EB01-012) : [Jouée]/[En attaquant] avec un Leader {Supernovae} et sans autre [Cavendish], redresser 2 DON!!
  'EB01-012': card({
    onPlay: when((s, p, self) => snLeader(s, p) && !s.players[p].chars.some((c) => c.uid !== self && def(c.num).names.includes('Cavendish')), readyDon(2)),
    whenAttacking: when((s, p, self) => snLeader(s, p) && !s.players[p].chars.some((c) => c.uid !== self && def(c.num).names.includes('Cavendish')), readyDon(2)),
  }, { attackUseful: () => false }),

  // Scratchmen Apoo (EB01-015) : [Jouée] épuiser un Personnage adverse de coût 2 ou moins
  'EB01-015': card({ onPlay: rest(oppChar({ costMax: 2 }), 'Scratchmen Apoo') }),

  // Chambres : [Principale] et [Déclenchement] avec un Leader {Supernovae}
  'EB01-020': card({ onMain: when(snLeader, chambres), onTrigger: when(snLeader, chambres) }),

  // Jewelry Bonney (EB02-015) : [Jouée] un Personnage adverse épuisé ne sera pas redressé, puis 1 DON!! redressée à la fin
  // du tour
  'EB02-015': card({
    onPlay: seq(keepRested(oppChar({ rested: true }), 'Jewelry Bonney', 1), effect((ctx) => {
      addDelayed(ctx.s, { turn: ctx.s.turn, player: ctx.me, action: 'untapDon', amount: 1 });
      log(ctx.s, ctx.me, 'redressera jusqu’à 1 DON!! à la fin du tour (Jewelry Bonney)');
    })),
  }),

  // Jewelry Bonney (EB03-017) : [Jouée] avec un Leader {Supernovae}, redresser 1 DON!!, puis un Personnage adverse de coût
  // 8 ou moins ne peut pas être épuisé jusqu'à la fin du prochain tour adverse
  'EB03-017': card({
    onPlay: seq(when(snLeader, readyDon(1)), grant(oppChar({ costMax: 8 }), { stat: 'cantRest' }, 'oppNextEnd', 'Jewelry Bonney', 'ne peut pas être épuisé')),
  }),

  // Urouge (OP07-021) : [Bloqueur] ; [Fin de votre tour] redresser 1 DON!!
  'OP07-021': card({ endOfTurn: readyDon(1) }),

  // Caribou (OP07-023) : avec 6 DON!! épuisées ou plus, +1000 ; [Bloqueur]
  'OP07-023': { selfPower: (s, p) => (s.players[p].donRested >= 6 ? 1000 : 0) },

  // Coribou : [Jouée] jouer épuisé de sa main un [Caribou] de coût 4 ou moins
  'OP07-025': card({ onPlay: playFromHand({ name: 'Caribou', costMax: 4 }, 'Coribou', { rested: true }) }),

  // Jewelry Bonney (OP07-026) : [Jouée] un Personnage ou une DON!! adverse épuisé ne sera pas redressé
  'OP07-026': card({ onPlay: lockCharOrDon }),

  // Basil Hawkins (OP07-029) : [Bloqueur] avec un Leader {Supernovae} ; [Une fois par tour] retiré par un effet adverse,
  // épuiser un Personnage adverse à la place
  'OP07-029': {
    blocker: (s, p) => snLeader(s, p),
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: false,
      label: () => 'Basil Hawkins : épuiser un Personnage adverse pour rester sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && s.players[other(p)].chars.some((c) => !c.rested),
      apply: (s, p, self, _victim, ctx) => {
        const list = s.players[other(p)].chars.filter((c) => !c.rested);
        const answer = ctx.ask({
          player: p,
          prompt: 'Basil Hawkins : Personnage adverse à épuiser :',
          options: list.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
          tag: 'oppRest',
        });
        restByEffect({ ...ctx, me: p, opp: other(p), source: self.uid, num: self.num }, Number(answer.split(':')[1]));
      },
    },
  },

  // Bartolomeo (OP07-031) : [Bloqueur] ; [Votre tour] [Une fois par tour] quand un Personnage est épuisé par son effet,
  // piocher 1 et défausser 1
  'OP07-031': {
    when: [{
      on: 'rest',
      once: 'barto031',
      if: (s, owner, self, e) => e.by === owner && e.cause === 'effect' && e.zone === 'character' && s.active === owner
        && s.players[owner].chars.some((c) => c.uid === self.uid),
      run: (ctx) => drawAndDiscard(ctx, 1, 1),
    }],
  },

  // Karmic Punishment : [Contre] +2000, puis +1000 de plus avec 3 Personnages ou plus ; [Déclenchement] KO d'un Personnage
  // adverse épuisé de coût 4 ou moins
  'OP07-035': card({
    onCounter: seq(counterOn(2000, 'Karmic Punishment'), when((s, p) => s.players[p].chars.length >= 3, counterOn(1000, 'Karmic Punishment'))),
    onTrigger: ko(oppChar({ rested: true, costMax: 4 }), 'Karmic Punishment'),
  }),

  // Apportez-moi des pizzas !! : [Principale] 5 cartes du dessus, une {Supernovae} autre que [More Pizza!!] ;
  // [Déclenchement] piocher 1
  'OP07-037': card({ onMain: searchTop(5, 1, { type: SN, notName: 'More Pizza!!' }, 'une carte {Supernovae} autre que [Apportez-moi des pizzas !!]'), onTrigger: drawCards(1) }),

  // Trafalgar Law (OP09-030) : [Jouée] renvoyer un de ses Personnages en main : jouer de sa main un {ODYSSEY} de coût 3 ou
  // moins autre que [Trafalgar Law]
  'OP09-030': card({ onPlay: withCost(returnOwnChar(), playFromHand({ type: 'ODYSSEY', costMax: 3, notName: 'Trafalgar Law' }, 'Trafalgar Law'), 'Trafalgar Law') }),

  // Radio Knife : [Principale] épuiser de coût 6 ou moins, puis KO d'un Personnage adverse épuisé de coût 5 ou moins ;
  // [Déclenchement] épuiser de coût 4 ou moins
  'OP10-041': card({
    onMain: seq(rest(oppChar({ costMax: 6 }), 'Radio Knife'), ko(oppChar({ rested: true, costMax: 5 }), 'Radio Knife')),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Radio Knife'),
  }),

  // Jewelry Bonney (OP12-118) : [Bloqueur] ; [Jouée] avec 8 cartes épuisées ou plus, piocher 2 et défausser 1, puis
  // redresser 1 DON!!
  'OP12-118': card({ onPlay: seq(when((s, p) => restedCards(s, p) >= 8, drawTrash(2, 1)), readyDon(1)) }),

  // Trafalgar Law (OP16-030) : [Jouée] un Personnage adverse épuisé ne sera pas redressé ; [Fin de votre tour] redresser
  // tous ses Personnages verts de coût 5 ou moins
  'OP16-030': card({
    onPlay: keepRested(oppChar({ rested: true }), 'Trafalgar Law', 1),
    endOfTurn: effect((ctx) => {
      const ready = ctx.s.players[ctx.me].chars.filter((c) => c.rested && def(c.num).colors.includes('Green') && (def(c.num).cost ?? 0) <= 5);
      for (const c of ready) setActive(ctx.s, ctx.me, c.uid);
      if (ready.length) log(ctx.s, ctx.me, 'redresse ses Personnages verts de coût 5 ou moins (Trafalgar Law)');
    }),
  }),

  // Jewelry Bonney (PRB02-004) : [Bloqueur] ; [Attaque adverse] [Une fois par tour] redresser 1 DON!!
  'PRB02-004': card({ onOpponentAttack: oncePerOppAttack('bonney004', readyDon(1)) }),

  // Capone "Gang" Bege (ST24-001) : [Bloqueur] ; [Jouée] avec 6 cartes épuisées ou plus, piocher 1 et défausser 1
  'ST24-001': card({ onPlay: when((s, p) => restedCards(s, p) >= 6, drawTrash(1, 1)) }),

  // Kidd et Killer : [Jouée] 5 cartes du dessus, une {Supernovae} ; [Attaque adverse] se placer dans la Défausse :
  // redresser 1 DON!!
  'ST24-002': card({
    onPlay: searchTop(5, 1, { type: SN }, 'une carte {Supernovae}'),
    onOpponentAttack: withCost(trashSelf(), readyDon(1), 'Kidd et Killer'),
  }),

  // Basil Hawkins (ST24-003) : [Fin de votre tour] redresser 1 DON!!
  'ST24-003': card({ endOfTurn: readyDon(1) }),

  // Law et Bepo : [Jouée] épuiser un Personnage adverse qui ne sera pas redressé, puis Leader +2000 si l'adversaire a 2
  // Personnages épuisés ou plus
  'ST24-004': card({ onPlay: lawBepo }),
};

