// FAMILLE DU LEADER ACE ET NEWGATE (phase 4E) : cartes bleues dont le type inclut « Équipage de Barbe Blanche »,
// jouables en format Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais).
// Elles jouent avec le dessus du deck (révéler, replacer au-dessus ou au-dessous), renvoient des Personnages en main et
// se protègent. Chaque condition se vérifie dans la partie. Les choix d'interprétation sont dans
// game/docs/interpretations.md.
import {
  addMod, basePower, canLeaveByEffect, canPlayCharacters, chooseUpTo1, def, drawAndDiscard, emit, fieldCost, findField, knownFirst, log,
  lookTopPick, may, other, playCharacter, removeByEffect, removeFromField, reveal, uniqueByNum, untilOpponentsNextEnd,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, FieldCard, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  all, anyChar, bottomOfDeck, bounce, card, cardMatches, discardCost, drawCards, effect, giveDon, leaderTypeIncludes,
  lookTopArrange, oppChar, ownChar, ownLeader, ownLeaderOrChar, playFromHand, restDon, restSelf, returnOwnChar, revealCost, revealTop,
  searchTop, selfKeyword, seq, when, withCost, type CharSpec, type Cost, type Effect,
} from './bricks.ts';
import { counterBoost, isNamed, playTriggerCard } from './common.ts';

const WB = 'Whitebeard Pirates';  // type incluant « Équipage de Barbe Blanche »
const wbType = (num: string) => def(num).types.some((t) => t.includes(WB));
const wbLeader = leaderTypeIncludes(WB);
const handAtMost = (n: number) => (s: GameState, p: PlayerId) => s.players[p].hand.length <= n;
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));
const drawTrash = (n: number, trash: number): Effect => effect((ctx) => drawAndDiscard(ctx, n, trash), (s, p) => s.players[p].deck.length > 0);

// « Placez N cartes de votre main au-dessus ou au-dessous de votre deck dans l'ordre de votre choix » : une par une, la
// dernière placée au-dessus est la plus haute
function handToTopOrBottom(ctx: EffectCtx, n: number, source: string) {
  const P = ctx.s.players[ctx.me];
  for (let i = 0; i < n && P.hand.length; i++) {
    const answer = ctx.ask({
      prompt: `${source} : carte de ta main à placer sur ton deck${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
      options: uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand)).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
      tag: 'discard',
    });
    const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    const where = ctx.ask({
      prompt: `${source} : placer ${def(c.num).name} au-dessus ou au-dessous de ton deck ?`,
      options: [{ id: 'top', label: 'Au-dessus' }, { id: 'bottom', label: 'Au-dessous' }],
      tag: 'scry',
      cards: [{ uid: c.uid, num: c.num, owner: ctx.me }],
    });
    if (where === 'top') P.deck.unshift(c);
    else P.deck.push(c);
    reveal(ctx.s, [c.uid], ctx.me);
    log(ctx.s, ctx.me, `place 1 carte de sa main ${where === 'top' ? 'au-dessus' : 'au-dessous'} de son deck (${source})`);
  }
}
const drawThenPlace = (n: number, source: string): Effect => effect((ctx) => {
  drawCards(n).run(ctx);
  handToTopOrBottom(ctx, n, source);
}, (s, p) => s.players[p].deck.length > 0);

// « Révélez la carte du dessus de votre deck et jouez jusqu'à 1 Personnage ... Puis, placez le reste au-dessus ou
// au-dessous de votre deck » (rest 'stay' : la carte non jouée reste au-dessus)
const revealTopPlay = (spec: CharSpec, source: string, opts: { rush?: boolean; rest?: 'choose' | 'stay' } = {}): Effect => ({
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const top = P.deck[0];
    if (!top) return;
    reveal(ctx.s, [top.uid], 'both');
    log(ctx.s, ctx.me, `révèle ${def(top.num).name}, la carte du dessus de son deck (${source})`);
    if (def(top.num).category === 'CHARACTER' && cardMatches(top.num, spec) && canPlayCharacters(ctx.s, ctx.me, top.num)) {
      const answer = ctx.ask({
        prompt: `${source} : jouer ${def(top.num).name}${opts.rush ? ' (il gagne [Initiative] pour le tour)' : ''} ?`,
        options: [{ id: `card:${top.uid}`, label: `Jouer ${def(top.num).name}`, uid: top.uid, num: top.num }, { id: 'none', label: 'Non' }],
        tag: 'playFree',
      });
      if (answer !== 'none') {
        P.deck.shift();
        playCharacter(ctx, ctx.me, top);
        if (opts.rush && findField(ctx.s, top.uid)) {
          addMod(ctx.s, { uid: top.uid, stat: 'keyword', keyword: 'Rush', amount: 0, until: 'turn', source });
          log(ctx.s, ctx.me, `${def(top.num).name} gagne [Initiative] pour le tour (${source})`);
        }
        return;
      }
    }
    if (opts.rest === 'stay') return;
    const where = ctx.ask({
      prompt: `${source} : laisser ${def(top.num).name} au-dessus de ton deck ou la placer au-dessous ?`,
      options: [{ id: 'top', label: 'Au-dessus' }, { id: 'bottom', label: 'Au-dessous' }],
      tag: 'scry',
      cards: [{ uid: top.uid, num: top.num, owner: ctx.me }],
    });
    if (where === 'bottom') {
      P.deck.push(P.deck.shift()!);
      log(ctx.s, ctx.me, `place ${def(top.num).name} au-dessous de son deck`);
    }
  },
  useful: (s, p) => s.players[p].deck.length > 0,
});

// Speed Jil : révéler la carte du dessus, la replacer au-dessus ou au-dessous ; [Initiative] si elle est « Équipage de
// Barbe Blanche »
const speedJil: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const top = P.deck[0];
  if (!top) return;
  reveal(ctx.s, [top.uid], 'both');
  log(ctx.s, ctx.me, `révèle ${def(top.num).name}, la carte du dessus de son deck (Speed Jil)`);
  const where = ctx.ask({
    prompt: `Speed Jil : laisser ${def(top.num).name} au-dessus de ton deck ou la placer au-dessous ?`,
    options: [{ id: 'top', label: 'Au-dessus' }, { id: 'bottom', label: 'Au-dessous' }],
    tag: 'scry',
    cards: [{ uid: top.uid, num: top.num, owner: ctx.me }],
  });
  if (where === 'bottom') P.deck.push(P.deck.shift()!);
  if (wbType(top.num)) selfKeyword('Rush', 'Speed Jil').run(ctx);
}, (s, p) => s.players[p].deck.length > 0);

// « Thank You...for Loving Me!! » : 3 cartes du dessus, une « Équipage de Barbe Blanche » ou [Monkey.D.Luffy] en main,
// les autres au-dessus ou au-dessous dans l'ordre choisi
const thankYou: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const looked = P.deck.slice(0, 3);
  reveal(ctx.s, looked.map((c) => c.uid), ctx.me);
  log(ctx.s, ctx.me, `regarde ${looked.length} cartes du dessus de son deck`);
  const ok = uniqueByNum(looked.filter((c) => wbType(c.num) || isNamed(c.num, 'Monkey.D.Luffy')));
  let picked = false;
  if (ok.length) {
    const answer = ctx.ask({
      prompt: `Thank You...for Loving Me!! : tu regardes ${looked.map((c) => def(c.num).name).join(', ')}. Carte « Équipage de Barbe Blanche » ou [Monkey.D.Luffy] à ajouter à ta main :`,
      options: [...ok.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
      tag: 'pick',
      cards: looked.map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    if (answer !== 'none') {
      const [c] = P.deck.splice(P.deck.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
      P.hand.push(c);
      reveal(ctx.s, [c.uid], 'both');
      log(ctx.s, ctx.me, `révèle ${def(c.num).name} et l'ajoute à sa main`);
      picked = true;
    }
  }
  const rest = looked.length - (picked ? 1 : 0);
  if (rest) lookTopArrange(rest, 'Thank You...for Loving Me!!').run(ctx);
}, (s, p) => s.players[p].deck.length > 0);

// Marshall D. Teach (OP13-053) : coût « placez 1 de vos Personnages ... dans votre Défausse »
const trashOwnChar = (spec: CharSpec): Cost => {
  const list = (s: GameState, p: PlayerId, self: number) => s.players[p].chars.filter((c) => c.uid !== self && cardMatches(c.num, spec)).map((c) => c.uid);
  return {
    label: 'placer 1 autre de tes Personnages « Équipage de Barbe Blanche » dans ta Défausse',
    can: (s, p, self) => list(s, p, self).length > 0,
    pay: (ctx) => {
      const options = list(ctx.s, ctx.me, ctx.source);
      if (!options.length) return false;
      const answer = ctx.ask({
        prompt: 'Personnage à placer dans ta Défausse :',
        options: options.map((uid) => ({ id: `card:${uid}`, label: def(findField(ctx.s, uid)!.card.num).name, uid })),
        tag: 'returnOwn',
      });
      const uid = Number(answer.split(':')[1]);
      const f = removeFromField(ctx.s, uid, 'trash');
      if (!f) return false;
      log(ctx.s, ctx.me, `place ${def(f.card.num).name} dans sa Défausse`);
      emit(ctx.s, { type: 'leave', player: ctx.me, uid, num: f.card.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
      return true;
    },
  };
};

// Portgas D. Ace (OP13-119) : renvoyer un Personnage adverse de coût 5 ou moins ; s'il l'a fait, l'adversaire joue un
// Personnage de coût 4 ou moins de sa main
const aceBounce: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.opp].chars.filter((c) => fieldCost(ctx.s, c.uid) <= 5 && canLeaveByEffect(ctx.s, c.uid, ctx.me)).map((c) => c.uid);
    const uid = chooseUpTo1(ctx, list, 'Portgas D. Ace : Personnage adverse de coût 5 ou moins à renvoyer dans la main (l’adversaire pourra jouer un Personnage de coût 4 ou moins) :', 'bounce');
    if (uid === null || !removeByEffect(ctx, uid, 'hand')) return;
    const O = ctx.s.players[ctx.opp];
    if (!canPlayCharacters(ctx.s, ctx.opp)) return;
    const options = uniqueByNum(knownFirst(ctx.s, ctx.opp, O.hand.filter((c) => def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) <= 4 && canPlayCharacters(ctx.s, ctx.opp, c.num))));
    if (!options.length) return;
    const answer = ctx.ask({
      player: ctx.opp,
      prompt: 'Portgas D. Ace : jouer jusqu’à 1 Personnage de coût 4 ou moins de ta main :',
      options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
      tag: 'playFree',
    });
    if (answer === 'none') return;
    const [c] = O.hand.splice(O.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
    playCharacter(ctx, ctx.opp, c);
  },
  useful: (s, p) => s.players[other(p)].chars.some((c) => fieldCost(s, c.uid) <= 5 && canLeaveByEffect(s, c.uid, p)),
};

// Marco (OP09-052) : se jouer épuisé depuis la Défausse
const replaySelfRested: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const i = P.trash.findIndex((c) => c.uid === ctx.source);
  if (i < 0 || !canPlayCharacters(ctx.s, ctx.me, P.trash[i].num)) return;
  const [c] = P.trash.splice(i, 1);
  playCharacter(ctx, ctx.me, c, { rested: true });
}, (s, p) => canPlayCharacters(s, p));

// Moby Dick : un Personnage « Équipage de Barbe Blanche » sorti du terrain par un effet (KO ou autre), pendant son tour
const mobyDickIf = (s: GameState, owner: PlayerId, self: FieldCard, e: GameEvent) => e.player === owner && s.active === owner
  && e.cause === 'effect' && e.zone === 'character' && Boolean(e.num) && wbType(e.num!) && s.players[owner].stage?.uid === self.uid;
const mobyDickRun = (ctx: EffectCtx) => {
  drawCards(1).run(ctx);
  handToTopOrBottom(ctx, 1, 'Moby Dick');
};

// Vista (OP13-046) : [Une fois par tour] mis KO, ou retiré par un effet adverse : défausser une carte « Équipage de
// Barbe Blanche » à la place (même [Une fois par tour] pour les deux cas)
const vistaCan = (s: GameState, p: PlayerId, self: FieldCard) => !self.usedOpt.includes('vista046') && s.players[p].hand.some((c) => wbType(c.num));
const vistaApply = (p: PlayerId, self: FieldCard, ctx: EffectCtx) => {
  self.usedOpt.push('vista046');
  const options = uniqueByNum(knownFirst(ctx.s, p, ctx.s.players[p].hand.filter((c) => wbType(c.num))));
  const answer = ctx.ask({
    player: p,
    prompt: 'Vista : carte « Équipage de Barbe Blanche » à défausser :',
    options: options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
    tag: 'discard',
  });
  const P = ctx.s.players[p];
  const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
  P.trash.push(c);
  P.discardedTurn = ctx.s.turn;
  log(ctx.s, p, `défausse ${def(c.num).name} : Vista reste sur le terrain`);
  emit(ctx.s, { type: 'discard', player: p, count: 1, by: p, sourceNum: self.num });
};

// Thatch : mis KO, ou retiré par un effet adverse : placé dans la Défausse et piocher 1 à la place
const thatchApply = (s: GameState, p: PlayerId, self: FieldCard, ctx: EffectCtx) => {
  removeFromField(s, self.uid, 'trash');
  log(s, p, 'Thatch est placé dans la Défausse à la place');
  drawCards(1).run({ ...ctx, me: p, opp: other(p) });
};

export const FAM_WB: Record<string, CardBehavior> = {
  // Vista (EB02-027) : [Jouée] un Personnage adverse de 1000 ou moins sous le deck
  'EB02-027': card({ onPlay: bottomOfDeck(oppChar({ powerMax: 1000 }), 'Vista') }),

  // Portgas D. Ace (EB02-028) : [Jouée] avec un Leader « Équipage de Barbe Blanche », 5 cartes du dessus, un Personnage de
  // coût 2 en main, le reste sous le deck, puis jouer épuisé un Personnage de coût 2 de sa main
  'EB02-028': card({
    onPlay: when(wbLeader, seq(
      searchTop(5, 1, { category: 'CHARACTER', costMin: 2, costMax: 2 }, 'un Personnage de coût 2'),
      playFromHand({ costMin: 2, costMax: 2 }, 'Portgas D. Ace', { rested: true }),
    )),
  }),

  // Portgas D. Ace (OP07-053) : [Bloqueur] ; [Jouée] piocher 2, puis 2 cartes de sa main au-dessus ou au-dessous du deck
  'OP07-053': card({ onPlay: drawThenPlace(2, 'Portgas D. Ace') }),

  // Atmos : [Jouée] révéler 2 cartes « Équipage de Barbe Blanche » de sa main : avec un tel Leader, renvoyer un Personnage
  // adverse de coût 4 ou moins
  'OP08-040': card({ onPlay: withCost(revealCost(2, { typeIncludes: WB }), when(wbLeader, bounce(oppChar({ costMax: 4 }), 'Atmos')), 'Atmos') }),

  // Edward.Newgate (OP08-043) : [Jouée] avec un Leader « Équipage de Barbe Blanche » et 2 Vies ou moins, jusqu'à la fin
  // du prochain tour adverse, les Personnages adverses présents ne peuvent attaquer qu'en défaussant 2 cartes
  'OP08-043': card({
    onPlay: when(all(wbLeader, (s, p) => s.players[p].life.length <= 2), effect((ctx) => {
      const until = untilOpponentsNextEnd(ctx.s, ctx.me);
      for (const c of ctx.s.players[ctx.opp].chars) addMod(ctx.s, { uid: c.uid, stat: 'attackTax', amount: 2, until, source: 'Edward.Newgate', num: 'OP08-043' });
      log(ctx.s, ctx.me, 'jusqu’à la fin du prochain tour adverse, les Personnages adverses ne peuvent attaquer qu’en défaussant 2 cartes (Edward.Newgate)');
    }, (s, p) => s.players[other(p)].chars.length > 0)),
  }),

  // Kingdew : [Activation : Principale] [Une fois par tour] révéler 2 cartes « Équipage de Barbe Blanche » : +2000
  'OP08-044': card({
    activateMain: {
      label: 'Kingdew : révéler 2 cartes « Équipage de Barbe Blanche » de ta main pour gagner +2000',
      once: true,
      cost: revealCost(2, { typeIncludes: WB }),
      effect: effect((ctx) => {
        addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 2000, until: 'turn', source: 'Kingdew' });
        log(ctx.s, ctx.me, 'Kingdew gagne +2000 de puissance pour le tour');
      }),
    },
  }),

  // Thatch : mis KO, ou retiré par un effet adverse : placé dans la Défausse et piocher 1 à la place
  'OP08-045': {
    koReplace: { label: 'Placer Thatch dans ta Défausse et piocher 1 carte', condition: () => true, apply: thatchApply },
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      exceptKo: true,
      label: () => 'Thatch : le placer dans ta Défausse et piocher 1 carte',
      condition: (_s, _p, self, victim) => victim.uid === self.uid,
      apply: (s, p, self, _victim, ctx) => thatchApply(s, p, self, ctx),
    },
  },

  // Joz (OP08-047) : [Jouée] renvoyer un autre de ses Personnages en main : renvoyer un Personnage de coût 6 ou moins
  'OP08-047': card({ onPlay: withCost(returnOwnChar(true), bounce(anyChar({ costMax: 6 }), 'Joz'), 'Joz') }),

  // Speed Jil : [Jouée] révéler la carte du dessus, au-dessus ou au-dessous ; [Initiative] si « Équipage de Barbe Blanche »
  'OP08-049': card({ onPlay: speedJil }),

  // Namule : [Bloqueur] ; [Jouée] piocher 2, puis 2 cartes de sa main au-dessus ou au-dessous du deck
  'OP08-050': card({ onPlay: drawThenPlace(2, 'Namule') }),

  // Portgas.D.Ace (OP08-052) : [Jouée] révéler la carte du dessus : jouer un Personnage « Équipage de Barbe Blanche » de
  // coût 4 ou moins, sinon la replacer au-dessus ou au-dessous
  'OP08-052': card({ onPlay: revealTopPlay({ typeIncludes: WB, costMax: 4 }, 'Portgas.D.Ace') }),

  // Thank You...for Loving Me!! : [Principale] avec un Leader « Équipage de Barbe Blanche » ; [Déclenchement] piocher 1
  'OP08-053': card({ onMain: when(wbLeader, thankYou), onTrigger: drawCards(1) }),

  // You Can't Take Our King This Early in the Game. : [Contre] +3000, puis révéler la carte du dessus : jouer un
  // Personnage « Équipage de Barbe Blanche » de coût 3 ou moins, sinon la replacer au-dessus ou au-dessous
  'OP08-054': card({ onCounter: seq(counterOn(3000, 'You Can’t Take Our King'), revealTopPlay({ typeIncludes: WB, costMax: 3 }, 'You Can’t Take Our King')) }),

  // Moby Dick (Lieu) : [Votre tour] [Une fois par tour] quand un de ses Personnages « Équipage de Barbe Blanche » sort du
  // terrain par un effet, piocher 1 puis 1 carte de sa main au-dessus ou au-dessous du deck ; [Déclenchement] se jouer
  'OP08-056': {
    when: [
      { on: 'ko', once: 'mobyDick', if: mobyDickIf, run: mobyDickRun },
      { on: 'leave', once: 'mobyDick', if: mobyDickIf, run: mobyDickRun },
    ],
    onTrigger: (ctx) => playTriggerCard(ctx),
  },

  // Izo (OP09-044) : [En attaquant] 5 cartes du dessus, une {Pays des Wa} ou « Équipage de Barbe Blanche », le reste sous
  // le deck, puis défausser 1 carte
  'OP09-044': card({
    whenAttacking: effect((ctx) => {
      lookTopPick(ctx, 5, 1, (n) => def(n).types.includes('Land of Wano') || wbType(n), 'une carte {Pays des Wa} ou « Équipage de Barbe Blanche »');
      drawAndDiscard(ctx, 0, 1);
    }, (s, p) => s.players[p].deck.length > 0),
  }, { attackUseful: () => false }),

  // Oden Kozuki (OP09-047) : [Double attaque] ; [En cas de KO] piocher 2, défausser 1
  'OP09-047': card({ onKO: drawTrash(2, 1) }),

  // Marco (OP09-052) : [Tour adverse] mis KO par un effet adverse : défausser 1 carte pour se rejouer épuisé
  'OP09-052': card({ onKO: withCost(discardCost(1), replaySelfRested, 'Marco') }, {
    onKOCondition: (s, owner, _card, cause, by) => s.active !== owner && cause === 'effect' && by !== owner,
  }),

  // Marco (OP10-055) : [Bloqueur] ; [En cas de KO] renvoyer un Personnage adverse de coût 4 ou moins
  'OP10-055': card({ onKO: bounce(oppChar({ costMax: 4 }), 'Marco') }),

  // « Je ferai de Barbe Blanche... le roi des pirates » : [Principale] avec un Leader « Équipage de Barbe Blanche »,
  // révéler la carte du dessus : un tel Personnage de coût 9 ou moins peut être joué, avec [Initiative] ; [Déclenchement]
  // piocher 1
  'OP12-058': card({
    onMain: when(wbLeader, revealTopPlay({ typeIncludes: WB, costMax: 9 }, 'Je ferai de Barbe Blanche... le roi des pirates', { rush: true, rest: 'stay' })),
    onTrigger: drawCards(1),
  }),

  // Izo (OP13-041) : [Jouée] piocher 2
  'OP13-041': card({ onPlay: drawCards(2) }),

  // Edward Newgate (OP13-042) : [Bloqueur] ; [Jouée] piocher 2, défausser 1, puis 2 DON!! épuisées à son Leader et 2 à
  // un Personnage
  'OP13-042': card({
    onPlay: seq(drawTrash(2, 1), giveDon(ownLeader(), 2, 'Edward Newgate'), giveDon(ownChar(), 2, 'Edward Newgate')),
  }),

  // Curiel : [En attaquant] 1 DON!! épuisée à son Leader ou un Personnage « Équipage de Barbe Blanche » ; [En cas de KO]
  // piocher 1
  'OP13-044': card({ whenAttacking: giveDon(ownLeaderOrChar({ typeIncludes: WB }), 1, 'Curiel'), onKO: drawCards(1) }, { attackUseful: () => false }),

  // Haruta : [En attaquant] avec 4 cartes ou moins en main, piocher 1
  'OP13-045': card({ whenAttacking: when(handAtMost(4), drawCards(1)) }, { attackUseful: () => false }),

  // Vista (OP13-046) : [Double attaque] ; [Une fois par tour] mis KO ou retiré par un effet adverse : défausser une carte
  // « Équipage de Barbe Blanche » à la place
  'OP13-046': {
    koReplace: {
      label: 'Défausser 1 carte « Équipage de Barbe Blanche » de ta main',
      condition: (s, p, self) => vistaCan(s, p, self),
      apply: (_s, p, self, ctx) => vistaApply(p, self, ctx),
    },
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: false,
      exceptKo: true,
      label: () => 'Vista : défausser 1 carte « Équipage de Barbe Blanche » pour rester sur le terrain',
      condition: (s, p, self, victim) => victim.uid === self.uid && vistaCan(s, p, self),
      apply: (_s, p, self, _victim, ctx) => vistaApply(p, self, ctx),
    },
  },

  // Fossa : un autre de ses Personnages « Équipage de Barbe Blanche » mis KO par un effet adverse : se placer dans la
  // Défausse à la place
  'OP13-047': {
    replaceRemoval: {
      oncePerTurn: false,
      onlyKo: true,
      label: (_s, _self, victim) => `Fossa : se placer dans ta Défausse pour que ${def(victim.num).name} ne soit pas mis KO`,
      condition: (_s, _p, self, victim) => victim.uid !== self.uid && wbType(victim.num),
      apply: (s, p, self) => {
        removeFromField(s, self.uid, 'trash');
        log(s, p, 'Fossa est placé dans la Défausse à la place');
      },
    },
  },

  // Marshall D. Teach (OP13-053) : [En attaquant] placer un autre de ses Personnages « Équipage de Barbe Blanche » dans la
  // Défausse : piocher 1 et [Exil] pour le tour
  'OP13-053': card({
    whenAttacking: withCost(trashOwnChar({ typeIncludes: WB }), seq(drawCards(1), selfKeyword('Banish', 'Marshall D. Teach')), 'Marshall D. Teach'),
  }, { attackUseful: () => false }),

  // Rakuyo : [En attaquant] avec 4 cartes ou moins en main, ses Personnages « Équipage de Barbe Blanche » +1000 pour le tour
  'OP13-055': card({
    whenAttacking: when(handAtMost(4), effect((ctx) => {
      for (const c of ctx.s.players[ctx.me].chars) if (wbType(c.num)) addMod(ctx.s, { uid: c.uid, stat: 'power', amount: 1000, until: 'turn', source: 'Rakuyo' });
      log(ctx.s, ctx.me, 'ses Personnages « Équipage de Barbe Blanche » gagnent +1000 de puissance pour le tour (Rakuyo)');
    })),
  }, { attackUseful: () => false }),

  // « Je ne suis pas né homme pour céder devant la force » : [Principale] épuiser 1 DON!! : avec 1 Vie ou moins, pas de
  // [Bloqueur] adverse quand son Leader attaque ce tour-ci ; [Contre] Leader +3000
  'OP13-057': card({
    onMain: withCost(restDon(1), when((s, p) => s.players[p].life.length <= 1, effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'keyword', keyword: 'Unblockable', amount: 0, until: 'turn', source: 'Je ne suis pas né homme pour céder devant la force' });
      log(ctx.s, ctx.me, 'l’adversaire ne peut pas activer [Bloqueur] quand son Leader attaque ce tour-ci');
    })), 'Je ne suis pas né homme pour céder devant la force'),
    onCounter: effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 3000, until: 'battle', source: 'Je ne suis pas né homme pour céder devant la force' });
      log(ctx.s, ctx.me, 'son Leader gagne +3000 de puissance pour le combat');
    }),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Brilliant Punk : [Principale] renvoyer un de ses Personnages en main : renvoyer un Personnage de coût 6 ou moins ;
  // [Déclenchement] piocher 1
  'OP13-059': card({ onMain: withCost(returnOwnChar(), bounce(anyChar({ costMax: 6 }), 'Brilliant Punk'), 'Brilliant Punk'), onTrigger: drawCards(1) }),

  // Portgas D. Ace (OP13-119) : [Initiative] avec 3 Vies ou moins ; [Jouée] 1 DON!! épuisée à son Leader, puis renvoyer un
  // Personnage adverse de coût 5 ou moins : l'adversaire joue alors un Personnage de coût 4 ou moins de sa main
  'OP13-119': card({ onPlay: seq(giveDon(ownLeader(), 1, 'Portgas D. Ace'), aceBounce) }, { rush: (s, p) => s.players[p].life.length <= 3 }),

  // Edward Newgate (OP14-044) : [Bloqueur] ; [Jouée] révéler la carte du dessus : si « Équipage de Barbe Blanche »,
  // piocher 2 et défausser 1
  'OP14-044': card({ onPlay: revealTop(wbType, drawTrash(2, 1), 'Edward Newgate') }),

  // Vista (OP14-053) : [Bloqueur] ; [Tour adverse] avec 7 cartes ou moins en main, sa puissance de base devient celle de
  // son Leader
  'OP14-053': {
    selfPower: (s, p, self) => (s.active !== p && s.players[p].hand.length <= 7 ? basePower(s, s.players[p].leader.uid) - (def(self.num).power ?? 0) : 0),
  },

  // Portgas D. Ace (OP16-049) : [Activation : Principale] s'épuiser : piocher 1
  'OP16-049': card({ activateMain: { label: 'Portgas D. Ace : s’épuiser pour piocher 1 carte', cost: restSelf(), effect: drawCards(1) } }),

  // Marco (P-071) : [En cas de KO] reprendre cette carte en main
  'P-071': card({
    onKO: effect((ctx) => {
      const P = ctx.s.players[ctx.me];
      const i = P.trash.findIndex((c) => c.uid === ctx.source);
      if (i < 0 || !may(ctx, 'Marco : reprendre Marco de ta Défausse dans ta main ?', 'may')) return;
      const [c] = P.trash.splice(i, 1);
      P.hand.push(c);
      reveal(ctx.s, [c.uid], 'both');
      log(ctx.s, ctx.me, 'reprend Marco dans sa main');
    }),
  }),

  // Portgas D. Ace (P-074) : [Activation : Principale] se renvoyer en main : 5 cartes du dessus remises au-dessus ou
  // au-dessous dans l'ordre choisi
  'P-074': card({
    activateMain: {
      label: 'Portgas D. Ace : te renvoyer dans ta main pour arranger les 5 cartes du dessus de ton deck',
      cost: { label: 'renvoyer ce Personnage dans ta main', can: () => true, pay: (ctx) => removeByEffect(ctx, ctx.source, 'hand') },
      effect: lookTopArrange(5, 'Portgas D. Ace'),
    },
  }),

  // Phoenix Brand : [Principale] révéler 2 cartes « Équipage de Barbe Blanche » de sa main : un Personnage de coût 6 ou
  // moins sous le deck de son propriétaire
  'OP08-055': card({ onMain: withCost(revealCost(2, { typeIncludes: WB }), bottomOfDeck(anyChar({ costMax: 6 }), 'Phoenix Brand'), 'Phoenix Brand') }),

  // Little Oz Junior (OP13-056) : [En attaquant] avec un Leader « Équipage de Barbe Blanche », piocher 1
  'OP13-056': card({ whenAttacking: when(wbLeader, drawCards(1)) }, { attackUseful: () => false }),

  // Don du phénix : [Principale] épuiser 1 DON!! : un Personnage adverse de 3000 ou moins sous le deck ; [Contre] Leader
  // +3000
  'OP13-058': card({
    onMain: withCost(restDon(1), bottomOfDeck(oppChar({ powerMax: 3000 }), 'Don du phénix'), 'Don du phénix'),
    onCounter: effect((ctx) => {
      addMod(ctx.s, { uid: ctx.s.players[ctx.me].leader.uid, stat: 'power', amount: 3000, until: 'battle', source: 'Don du phénix' });
      log(ctx.s, ctx.me, 'son Leader gagne +3000 de puissance pour le combat (Don du phénix)');
    }),
  }, { counterUseful: (s, p, target) => target === s.players[p].leader.uid }),

  // Marco (PRB02-008) : [Bloqueur] ; [En cas de KO] piocher 2
  'PRB02-008': card({ onKO: drawCards(2) }),

  // Portgas D. Ace (P-103) : [Jouée] piocher 2, 2 cartes de sa main au-dessus ou au-dessous du deck, puis 1 DON!! épuisée
  // à son Leader
  'P-103': card({ onPlay: seq(drawThenPlace(2, 'Portgas D. Ace'), giveDon(ownLeader(), 1, 'Portgas D. Ace')) }),
};
