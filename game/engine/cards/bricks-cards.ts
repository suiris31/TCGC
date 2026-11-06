// Briques de la famille « cartes » (vague C2, tâche C2.3) : ce que bricks.ts ne sait pas encore dire exactement pour la
// main, le deck et la Défausse. Elles suivent les mêmes règles que bricks.ts : questions stables (identifiants et ordre
// des options), `useful` qui dit si l'effet peut servir, journal, et cartes révélées comme le dit le texte (view.ts ne
// montre une carte cachée qu'à ceux qui la connaissent).
//
// Utilisées par le compilateur des recettes (recipes/compile.ts) ; aucune carte codée à la main ne s'en sert (l'empreinte
// des decks existants ne bouge pas).
import {
  bottomOrder, def, discardFromHand, emit, knownFirst, log, playCharacter, reveal, trashTopDeck, uniqueByNum,
  canPlayCharacters,
} from '../rules.ts';
import type { Card, CardData, EffectCtx, GameState, PlayerId } from '../types.ts';
import { cardMatches, describeSpec, effect, type CharSpec, type Effect } from './bricks.ts';

type CardSpec = CharSpec & { category?: CardData['category'] };
const names = (cards: Card[]) => cards.map((c) => def(c.num).name).join(', ');
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

// ---------- Main ----------

// « Défaussez N cartes ... de votre main » (filtrées : comme discardFromHand) ; upTo : « jusqu'à N », chaque choix
// propose « Aucune autre »
export const discardSome = (n: number, spec: CardSpec | undefined, upTo: boolean, source: string): Effect => {
  const fits = (c: Card) => !spec || cardMatches(c.num, spec);
  const what = spec ? describeSpec('carte', spec) : 'carte';
  if (!upTo) {
    return effect((ctx) => { discardFromHand(ctx, ctx.me, n, `${source} : ${what} de ta main à défausser`, fits); }, (s, p) => s.players[p].hand.some(fits));
  }
  return effect((ctx) => {
    const P = ctx.s.players[ctx.me];
    let count = 0;
    for (let i = 0; i < n; i++) {
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter(fits)));
      if (!options.length) break;
      const answer = ctx.ask({
        prompt: `${source} : défausser jusqu’à ${n} ${what}${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })), { id: 'none', label: i ? 'Aucune autre' : 'Aucune' }],
        tag: 'discard',
      });
      if (answer === 'none') break;
      const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      P.trash.push(card);
      log(ctx.s, ctx.me, `défausse ${def(card.num).name}`);
      count++;
    }
    if (count) {
      P.discardedTurn = ctx.s.turn;
      emit(ctx.s, { type: 'discard', player: ctx.me, count, by: ctx.me, sourceNum: ctx.num });
    }
  }, () => false);
};

// « Placez N cartes de votre main au-dessus de votre deck » / « au-dessus ou au-dessous » (chaque carte, au choix) ; le
// propriétaire sait où elles sont. L'ordre : la première placée au-dessus est ensuite recouverte par la suivante.
export const handToDeck = (n: number, where: 'top' | 'topOrBottom', source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  for (let i = 0; i < n && P.hand.length; i++) {
    const answer = ctx.ask({
      prompt: `${source} : carte de ta main à placer ${where === 'top' ? 'au-dessus' : 'au-dessus ou au-dessous'} de ton deck${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
      options: uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand)).map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'discard',
    });
    const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    const top = where === 'top' || ctx.ask({
      prompt: `${source} : où placer ${def(card.num).name} ?`,
      options: [{ id: 'top', label: 'Au-dessus du deck' }, { id: 'bottom', label: 'Au-dessous du deck' }],
      tag: 'scry',
      cards: [{ uid: card.uid, num: card.num, owner: ctx.me }],
    }) === 'top';
    if (top) P.deck.unshift(card); else P.deck.push(card);
    reveal(ctx.s, [card.uid], ctx.me);
    log(ctx.s, ctx.me, `place 1 carte de sa main ${top ? 'au-dessus' : 'au-dessous'} de son deck (${source})`);
  }
}, (s, p) => s.players[p].hand.length > 0);

// ---------- Deck ----------

// « Placez dans sa Défausse les N cartes du dessus du deck adverse » (cartes publiques ensuite)
export const trashOppTop = (n: number, source: string): Effect => effect((ctx) => {
  const O = ctx.s.players[ctx.opp];
  const k = Math.min(n, O.deck.length);
  const cards = O.deck.slice(0, k);
  trashTopDeck(ctx.s, ctx.opp, k);
  if (k) log(ctx.s, ctx.me, `place ${names(cards)}, ${k > 1 ? `les ${k} cartes` : 'la carte'} du dessus du deck adverse, dans la Défausse adverse (${source})`);
}, (s, p) => s.players[p === 0 ? 1 : 0].deck.length > 0);

// Les cartes regardées qui restent : au-dessous du deck (ordre au choix), au-dessus (ordre au choix), chacune au-dessus ou
// au-dessous (comme lookTopArrange), ou dans la Défausse. shown : elles ont été montrées aux deux joueurs
// (« Reveal 1 card from the top of your deck ... »), qui les connaissent toujours une fois remises dans le deck.
export function placeRest(ctx: EffectCtx, cards: Card[], rest: 'bottom' | 'top' | 'topOrBottom' | 'trash', source: string, shown = false) {
  const P = ctx.s.players[ctx.me];
  if (!cards.length) return;
  if (rest === 'trash') {
    P.trash.push(...cards);
    log(ctx.s, ctx.me, `place ${names(cards)} dans sa Défausse`);
    return;
  }
  const top: Card[] = [];
  const bottom: Card[] = [];
  for (const c of cards) {
    if (rest !== 'topOrBottom') { (rest === 'top' ? top : bottom).push(c); continue; }
    const answer = ctx.ask({
      prompt: `${source} : où placer ${def(c.num).name} ?`,
      options: [{ id: 'top', label: 'Au-dessus du deck' }, { id: 'bottom', label: 'Au-dessous du deck' }],
      tag: 'scry',
      cards: [{ uid: c.uid, num: c.num, owner: ctx.me }],
    });
    (answer === 'top' ? top : bottom).push(c);
  }
  P.deck.unshift(...topOrder(ctx, top, source));
  P.deck.push(...bottomOrder(ctx, bottom));
  reveal(ctx.s, cards.map((c) => c.uid), shown ? 'both' : ctx.me);
  if (rest === 'topOrBottom') log(ctx.s, ctx.me, `place ${plural(top.length, 'carte', 'cartes')} au-dessus de son deck et ${bottom.length} au-dessous`);
}

// Ordre des cartes placées au-dessus du deck : la première choisie sera la plus haute (comme lookTopArrange)
function topOrder(ctx: EffectCtx, cards: Card[], source: string): Card[] {
  const left = [...cards];
  const ordered: Card[] = [];
  while (left.length >= 2) {
    const answer = ctx.ask({
      prompt: `${source} : carte à placer tout en haut de ton deck :`,
      options: left.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
      tag: 'scry',
      cards: left.map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    ordered.push(...left.splice(left.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
  }
  return [...ordered, ...left];
}

// « Regardez X cartes du dessus de votre deck (; révélez) jusqu'à N cartes ... et ajoutez-les à votre main. Puis, placez
// les cartes restantes ... » : comme lookTopPick (rules.ts), avec les restes « au-dessus » et « au-dessus ou au-dessous »,
// hidden (« ajoutez jusqu'à 1 carte à votre main », sans la révéler) et shown (les cartes regardées sont montrées aux
// deux joueurs)
export const lookTopTake = (look: number, take: number, spec: CardSpec, rest: 'bottom' | 'top' | 'topOrBottom' | 'trash', source: string,
  opts: { hidden?: boolean; shown?: boolean } = {}): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (opts.shown) reveal(ctx.s, P.deck.slice(0, look).map((c) => c.uid), 'both');
  const looked = P.deck.splice(0, look);
  const picked: Card[] = [];
  const what = describeSpec(take > 1 ? 'cartes' : 'carte', spec);
  for (let i = 0; i < take; i++) {
    const candidates = uniqueByNum(looked.filter((c) => cardMatches(c.num, spec)));
    if (!candidates.length) break;
    const answer = ctx.ask({
      prompt: `${source} : tu regardes ${names(looked)}. Ajouter à ta main ${what}${take > 1 ? ` (${i + 1}/${take})` : ''} ?`,
      options: [...candidates.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
      tag: 'pick',
      cards: [...picked, ...looked].map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    if (answer === 'none') break;
    picked.push(...looked.splice(looked.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
  }
  P.hand.push(...picked);
  if (!opts.hidden) reveal(ctx.s, picked.map((c) => c.uid), ctx.opp);
  log(ctx.s, ctx.me, `regarde ${plural(look, 'carte', 'cartes')} du dessus de son deck${picked.length ? ` et ajoute ${opts.hidden ? plural(picked.length, 'carte', 'cartes') : names(picked)} à sa main` : ''} (${source})`);
  placeRest(ctx, looked, rest, source, opts.shown);
}, (s, p) => s.players[p].deck.length > 0);

// « Regardez X cartes du dessus de votre deck et jouez jusqu'à N cartes Personnage ... (épuisées). Puis, placez les
// cartes restantes ... » : comme lookTopPlay (bricks.ts), avec plusieurs cartes, les restes « au-dessus » et « au-dessus
// ou au-dessous », et shown. Les cartes choisies sont jouées une à une, après que les autres ont été rangées.
export const lookTopPlayMany = (look: number, take: number, spec: CharSpec, rest: 'bottom' | 'top' | 'topOrBottom' | 'trash', source: string,
  opts: { rested?: boolean; shown?: boolean } = {}): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (opts.shown) reveal(ctx.s, P.deck.slice(0, look).map((c) => c.uid), 'both');
  const looked = P.deck.splice(0, look);
  const chosen: Card[] = [];
  log(ctx.s, ctx.me, `regarde ${plural(look, 'carte', 'cartes')} du dessus de son deck (${source})`);
  for (let i = 0; i < take; i++) {
    // la place sur le terrain et les limites de jeu sont comptées avec les cartes déjà choisies
    const room = 5 - P.chars.length - chosen.length;
    const eligible = room > 0 ? uniqueByNum(looked.filter((c) => def(c.num).category === 'CHARACTER' && cardMatches(c.num, spec) && canPlayCharacters(ctx.s, ctx.me, c.num))) : [];
    if (!eligible.length) break;
    const answer = ctx.ask({
      prompt: `${source} : tu regardes ${names(looked)}. Jouer jusqu’à ${take} ${describeSpec('Personnage', spec)}${take > 1 ? ` (${i + 1}/${take})` : ''} :`,
      options: [...eligible.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
      tag: 'playFree',
      cards: [...chosen, ...looked].map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    if (answer === 'none') break;
    chosen.push(...looked.splice(looked.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
  }
  placeRest(ctx, looked, rest, source, opts.shown);
  for (const c of chosen) playCharacter(ctx, ctx.me, c, { rested: opts.rested });
}, (s, p) => s.players[p].deck.length > 0 && canPlayCharacters(s, p));

// « Regardez N cartes du dessus de votre deck et placez-les au-dessus (ou au-dessous) du deck dans l'ordre de votre
// choix » : le joueur les connaît ensuite
export const lookTopReorder = (look: number, where: 'top' | 'bottom', source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  const looked = P.deck.splice(0, look);
  log(ctx.s, ctx.me, `regarde ${plural(looked.length, 'carte', 'cartes')} du dessus de son deck et les replace ${where === 'top' ? 'au-dessus' : 'au-dessous'} (${source})`);
  placeRest(ctx, looked, where, source);
}, (s, p) => s.players[p].deck.length > 0);

// ---------- Défausse ----------

// « Ajoutez à votre main (jusqu'à) N cartes ... de votre Défausse » (cartes connues de l'adversaire) ; sans « jusqu'à »,
// le joueur en prend autant qu'il peut (pas de « Aucune »)
export const trashToHandMany = (count: number, upTo: boolean, spec: CardSpec, source: string): Effect => {
  const fits = (c: Card) => cardMatches(c.num, spec);
  return {
    run: (ctx) => {
      const P = ctx.s.players[ctx.me];
      const taken: Card[] = [];
      for (let i = 0; i < count; i++) {
        const options = uniqueByNum(P.trash.filter(fits));
        if (!options.length) break;
        const answer = ctx.ask({
          prompt: `${source} : ajouter à ta main ${upTo ? 'jusqu’à ' : ''}${count} ${describeSpec(count > 1 ? 'cartes' : 'carte', spec)} de ta Défausse${count > 1 ? ` (${i + 1}/${count})` : ''} :`,
          options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), ...(upTo ? [{ id: 'none', label: i ? 'Aucune autre' : 'Aucune' }] : [])],
          tag: 'pick',
        });
        if (answer === 'none') break;
        taken.push(...P.trash.splice(P.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
      }
      if (!taken.length) return;
      P.hand.push(...taken);
      reveal(ctx.s, taken.map((c) => c.uid), ctx.opp);
      log(ctx.s, ctx.me, `ajoute ${names(taken)} de sa Défausse à sa main (${source})`);
    },
    useful: (s, p) => s.players[p].trash.some(fits),
  };
};

// « Placez (jusqu'à) N cartes ... de votre Défausse (de la Défausse adverse) au-dessous du deck de leur propriétaire dans
// l'ordre de votre choix » : c'est le joueur qui choisit les cartes et l'ordre ; tous les connaissent (Défausse publique)
export const trashToDeckBottom = (count: number, side: 'own' | 'opp', upTo: boolean, spec: CardSpec, source: string): Effect => {
  const fits = (c: Card) => cardMatches(c.num, spec);
  const owner = (ctx: { me: PlayerId; opp: PlayerId }) => (side === 'own' ? ctx.me : ctx.opp);
  return {
    run: (ctx) => {
      const O = ctx.s.players[owner(ctx)];
      const placed: Card[] = [];
      for (let i = 0; i < count; i++) {
        const options = uniqueByNum(O.trash.filter(fits));
        if (!options.length) break;
        const answer = ctx.ask({
          prompt: `${source} : carte de ${side === 'own' ? 'ta' : 'la'} Défausse${side === 'own' ? '' : ' adverse'} à placer au-dessous du deck${count > 1 ? ` (${i + 1}/${count})` : ''} :`,
          options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), ...(upTo ? [{ id: 'none', label: i ? 'Aucune autre' : 'Aucune' }] : [])],
          tag: 'pick',
        });
        if (answer === 'none') break;
        placed.push(...O.trash.splice(O.trash.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
      }
      if (!placed.length) return;
      const ordered = side === 'own' ? bottomOrder(ctx, placed) : placed;
      O.deck.push(...ordered);
      reveal(ctx.s, ordered.map((c) => c.uid), 'both');
      log(ctx.s, ctx.me, `place ${names(placed)} de ${side === 'own' ? 'sa' : 'la'} Défausse${side === 'own' ? '' : ' adverse'} au-dessous du deck (${source})`);
    },
    useful: (s: GameState, p: PlayerId) => s.players[side === 'own' ? p : p === 0 ? 1 : 0].trash.some(fits),
  };
};

// ---------- Carte révélée du dessus du deck ----------

// La carte révélée par l'effet en cours (le même ctx passe d'une étape à l'autre : seq, when, withCost) ; une partie
// rejouée refait l'effet depuis le début, donc la retrouve
const REVEALED = new WeakMap<EffectCtx, number>();
// La carte révélée, si elle est toujours au-dessus du deck
const revealedTop = (ctx: EffectCtx): Card | undefined => {
  const top = ctx.s.players[ctx.me].deck[0];
  return top && top.uid === REVEALED.get(ctx) ? top : undefined;
};

// « Révélez 1 carte du dessus de votre deck » : elle reste au-dessus, connue des deux joueurs (comme revealTop de
// bricks.ts, sans la condition)
export const revealTopCard = (source: string): Effect => effect((ctx) => {
  const top = ctx.s.players[ctx.me].deck[0];
  if (!top) return;
  REVEALED.set(ctx, top.uid);
  reveal(ctx.s, [top.uid], 'both');
  log(ctx.s, ctx.me, `révèle ${def(top.num).name}, la carte du dessus de son deck (${source})`);
}, (s, p) => s.players[p].deck.length > 0);

// « Si la carte révélée est ..., ... » : la carte révélée par cet effet, si elle est toujours au-dessus du deck (rien si
// l'effet n'a rien révélé, par exemple quand une condition plus haut était fausse). Une Condition ne voit pas l'effet en
// cours : c'est donc un effet qui enveloppe la suite (le compilateur s'en sert à la place de when)
export const whenRevealed = (spec: CardSpec, then: Effect): Effect => ({
  run: (ctx) => {
    const top = revealedTop(ctx);
    if (top && cardMatches(top.num, spec)) then.run(ctx);
  },
  useful: (s, p, self) => s.players[p].deck.length > 0 && then.useful(s, p, self),
});

// « (Vous pouvez) jouer cette carte (épuisée) » : la carte révélée, si c'est un Personnage qu'on peut jouer
export const playRevealed = (source: string, opts: { rested?: boolean } = {}): Effect => ({
  run: (ctx) => {
    const top = revealedTop(ctx);
    if (!top || def(top.num).category !== 'CHARACTER' || !canPlayCharacters(ctx.s, ctx.me, top.num)) return;
    ctx.s.players[ctx.me].deck.shift();
    log(ctx.s, ctx.me, `joue ${def(top.num).name}, la carte révélée (${source})`);
    playCharacter(ctx, ctx.me, top, opts);
  },
  useful: (s, p) => {
    const top = s.players[p].deck[0];
    return Boolean(top) && def(top.num).category === 'CHARACTER' && canPlayCharacters(s, p, top.num);
  },
});

// « Puis, placez la carte révélée (les cartes restantes) au-dessous de votre deck » : si elle est encore au-dessus
// (toujours connue des deux joueurs)
export const revealedToBottom = (source: string): Effect => effect((ctx) => {
  const top = revealedTop(ctx);
  if (!top) return;
  const P = ctx.s.players[ctx.me];
  P.deck.push(P.deck.shift()!);
  reveal(ctx.s, [top.uid], 'both');
  log(ctx.s, ctx.me, `place ${def(top.num).name} au-dessous de son deck (${source})`);
}, () => false);
