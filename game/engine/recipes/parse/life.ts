// Traducteur, famille « Vie » (étape C, tâche C2.5) : ajouter des cartes à la Vie (du deck, de la main), prendre une
// carte de Vie en main (la sienne, celle de l'adversaire), placer une carte de Vie dans la Défausse, regarder la Vie et la
// remettre dans l'ordre, retourner une carte de Vie (coût), « vous ne pouvez pas ajouter de carte de Vie à votre main »,
// et les conditions sur le nombre de cartes de Vie.
//
// Pas ici : placer un Personnage dans la Vie (famille « retraits », C2.1), les valeurs calculées (« with a cost equal to
// or less than the number of your opponent's Life cards ») et les évènements « When a card is removed from ... Life
// cards » (C2.6), les remplacements (« ... instead »).
//
// Tournures douteuses (signalées aux tâches « set », game/docs/interpretations.md n° 1820 à 1830) : « from your Life
// area » (vieilles cartes, sans « top ») est lu « du dessus ».
import type { Cmp, Cond, CostPart, Filter } from '../types.ts';
import { fail } from './normalize.ts';
import type { Family } from './structure.ts';

const cmpOf = (w: string): Cmp => (/less|fewer/i.test(w) ? 'le' : 'ge');
const endOf = (w: string | undefined): 'top' | 'topOrBottom' => (w && /bottom/i.test(w) ? 'topOrBottom' : 'top');
const n1 = (m: string, what: string, part: string) => {
  // les coûts de Vie ne portent que sur 1 carte (les briques de coût n'en savent pas plus)
  if (+m !== 1) fail(part, `${what} : plusieurs cartes`);
};

// « card », « Character card with a [Trigger] », « {Supernovae} type Character card » (une carte de la main)
function handFilter(phrase: string, h: { filter(p: string): Filter }): Filter {
  const p = phrase.trim();
  if (/^cards?$/i.test(p)) return {};
  return h.filter(p);
}

// Bout de phrase « de quelle Vie » (actions) : « your », « your opponent's », « their »
const WHOSE = "(your opponent's|your|their)";
const END = '(top|top or bottom)';
const N = '(up to )?(\\d+) cards?';

export const LIFE: Family = {
  name: 'life',

  conds: [
    // « you have 2 or less Life cards », « your opponent has 3 or more Life cards »
    { re: /^you have (\d+) or (less|more|fewer) Life cards?$/i, make: (m) => ({ kind: 'life', side: 'own', cmp: cmpOf(m[2]), n: +m[1] }) },
    { re: /^your opponent has (\d+) or (less|more|fewer) Life cards?$/i, make: (m) => ({ kind: 'life', side: 'opp', cmp: cmpOf(m[2]), n: +m[1] }) },
    // « you have 0 Life cards », « your opponent has 1 Life card » : exactement
    { re: /^you have (\d+) Life cards?$/i, make: (m) => ({ kind: 'life', side: 'own', cmp: 'eq', n: +m[1] }) },
    { re: /^your opponent has (\d+) Life cards?$/i, make: (m) => ({ kind: 'life', side: 'opp', cmp: 'eq', n: +m[1] }) },
    { re: /^you have no Life cards$/i, make: () => ({ kind: 'life', side: 'own', cmp: 'eq', n: 0 }) },
    { re: /^your opponent has no Life cards$/i, make: () => ({ kind: 'life', side: 'opp', cmp: 'eq', n: 0 }) },
    // « you have a total of 4 or less cards in your Life area » (vieille tournure : seulement la Vie)
    { re: /^you have a total of (\d+) or (less|more) cards in your Life area$/i, make: (m) => ({ kind: 'life', side: 'own', cmp: cmpOf(m[2]), n: +m[1] }) },
    // « you and your opponent have a total of 5 or less Life cards »
    { re: /^you and your opponent have a total of (\d+) or (less|more) Life cards$/i, make: (m) => ({ kind: 'life', side: 'total', cmp: cmpOf(m[2]), n: +m[1] }) },
    // « either you or your opponent has 0 Life cards » : l'un OU l'autre
    {
      re: /^either you or your opponent has (\d+)(?: or (less|more))? Life cards?$/i,
      make: (m): Cond => {
        const cmp: Cmp = m[2] ? cmpOf(m[2]) : 'eq';
        return { kind: 'or', any: [{ kind: 'life', side: 'own', cmp, n: +m[1] }, { kind: 'life', side: 'opp', cmp, n: +m[1] }] };
      },
    },
    // « you have less Life cards than your opponent » (« fewer », « more »)
    { re: /^you have (less|fewer|more) Life cards than your opponent$/i, make: (m) => ({ kind: 'lifeVsOpp', cmp: /more/i.test(m[1]) ? 'gt' : 'lt' }) },
    { re: /^your opponent has (less|fewer|more) Life cards than you$/i, make: (m) => ({ kind: 'lifeVsOpp', cmp: /more/i.test(m[1]) ? 'lt' : 'gt' }) },
    // « the number of your Life cards is equal to or less than the number of your opponent's Life cards »
    {
      re: /^the number of your Life cards is equal to or (less|more) than the number of your opponent's Life cards$/i,
      make: (m) => ({ kind: 'lifeVsOpp', cmp: /less/i.test(m[1]) ? 'le' : 'ge' }),
    },
  ],

  costs: [
    // « add 1 card from the top (or bottom) of your Life cards to your hand »
    {
      re: /^add (\d+) cards? from the (top|top or bottom) of your Life cards to your hand$/i,
      make: (m): CostPart => { n1(m[1], 'coût Vie → main', m[0]); return { kind: 'lifeToHand', from: endOf(m[2]) }; },
    },
    // vieille tournure, sans « top » : la carte du dessus (n° 1821, tournure douteuse)
    {
      re: /^add (\d+) cards? from your Life area to your hand$/i,
      make: (m): CostPart => { n1(m[1], 'coût Vie → main', m[0]); return { kind: 'lifeToHand', from: 'top' }; },
    },
    // « trash 1 card from the top (or bottom) of your Life cards »
    {
      re: /^trash (\d+) cards? from the (top|top or bottom) of your Life cards$/i,
      make: (m): CostPart => { n1(m[1], 'coût Vie → Défausse', m[0]); return { kind: 'trashLife', from: endOf(m[2]) }; },
    },
    // « turn 1 card from the top of your Life cards face-up (face-down) »
    {
      re: /^turn (\d+) cards? from the top of your Life cards face-(up|down)$/i,
      make: (m): CostPart => { n1(m[1], 'coût retourner la Vie', m[0]); return { kind: 'flipLife', faceUp: m[2].toLowerCase() === 'up' }; },
    },
  ],

  actions: [
    // « Add up to 1 card from the top of your deck to the top of your Life cards (face-up) »
    {
      re: new RegExp(`^Add ${N} from the top of your deck to the top of your Life cards(?: face-(up|down))?$`, 'i'),
      make: (m) => [{ kind: 'lifeFromDeck', n: +m[2], upTo: Boolean(m[1]), ...(m[3]?.toLowerCase() === 'up' ? { faceUp: true } : {}) }],
    },
    // « Add (up to) 1 card from the top (or bottom) of your Life cards to your hand »
    {
      re: new RegExp(`^Add ${N} from the ${END} of your Life cards to your hand$`, 'i'),
      make: (m) => [{ kind: 'lifeToHand', n: +m[2], side: 'own', from: endOf(m[3]), ...(m[1] ? { upTo: true } : {}) }],
    },
    // vieille tournure (« from your Life area ») : la carte du dessus (n° 1821)
    {
      re: new RegExp(`^Add ${N} from your Life area to your hand$`, 'i'),
      make: (m) => [{ kind: 'lifeToHand', n: +m[2], side: 'own', from: 'top', ...(m[1] ? { upTo: true } : {}) }],
    },
    // « Add up to 1 card from the top of your opponent's Life cards to the owner's hand »
    {
      re: new RegExp(`^Add ${N} from the ${END} of your opponent's Life cards to (?:the owner's|their owner's|your opponent's|their) hand$`, 'i'),
      make: (m) => [{ kind: 'lifeToHand', n: +m[2], side: 'opp', from: endOf(m[3]), ...(m[1] ? { upTo: true } : {}) }],
    },
    // « Your opponent adds 1 card from the top of their Life cards (from their Life area) to their hand »
    {
      re: /^Your opponent adds (\d+) cards? from (?:the (top|top or bottom) of their Life cards|their Life area) to their hand$/i,
      make: (m) => {
        if (m[2] && /bottom/i.test(m[2])) fail(m[0], "Vie adverse → main : dessus ou dessous au choix de l'adversaire");
        return [{ kind: 'lifeToHand', n: +m[1], side: 'opp', from: 'top' }];
      },
    },
    // « Trash (up to) 1 card from the top (or bottom) of your (opponent's) Life cards »
    {
      re: new RegExp(`^Trash ${N} from the ${END} of ${WHOSE} Life cards$`, 'i'),
      make: (m) => {
        if (/their/i.test(m[4])) fail(m[0], 'Vie : « their » sans sujet');
        return [{ kind: 'trashLife', n: +m[2], side: /opponent/i.test(m[4]) ? 'opp' : 'own', from: endOf(m[3]), ...(m[1] ? { upTo: true } : {}) }];
      },
    },
    // « Trash 1 card from the top of each of your and your opponent's Life cards » : sa Vie, puis la Vie adverse
    {
      re: new RegExp(`^Trash (\\d+) cards? from the ${END} of each of your and your opponent's Life cards$`, 'i'),
      make: (m) => [
        { action: { kind: 'trashLife', n: +m[1], side: 'own', from: endOf(m[2]) } },
        { link: 'and', action: { kind: 'trashLife', n: +m[1], side: 'opp', from: endOf(m[2]) } },
      ],
    },
    // « Add (up to) 1 [card] from your hand to the top of your Life cards (face-up) »
    {
      re: /^Add (up to )?(\d+) (.+?) from your hand to the top of your Life cards(?: face-(up|down))?$/i,
      make: (m, h) => [{
        kind: 'handToLife', n: +m[2], upTo: Boolean(m[1]), filter: handFilter(m[3], h),
        ...(m[4]?.toLowerCase() === 'up' ? { faceUp: true } : {}),
      }],
    },
    // « Look at up to 1 card from the top of [camp] Life cards », suivi ou non de « and place it at the top or bottom ... »
    // (ranger la carte regardée)
    {
      re: /^Look at up to 1 card from the top of (your|your opponent's|your or your opponent's) Life cards(,? and place it at the top or bottom of (?:the|their) Life cards)?$/i,
      make: (m) => [{ kind: 'lookLife', side: m[1] === 'your' ? 'own' : /^your opponent's$/i.test(m[1]) ? 'opp' : 'any', arrange: Boolean(m[2]) }],
    },
    // « Look at all of your (opponent's) Life cards and place them back in your (their) Life area in any order »
    {
      re: /^Look at all (?:of )?(your|your opponent's) Life cards and place them back in (your|their) Life area in any order$/i,
      make: (m) => {
        const opp = /opponent/i.test(m[1]);
        if (opp !== (m[2].toLowerCase() === 'their')) fail(m[0], 'Vie : deux camps différents');
        return [{ kind: 'reorderLife', side: opp ? 'opp' : 'own' }];
      },
    },
    // « You cannot add Life cards to your hand using your own effects during this turn »
    { re: /^You cannot add Life cards to your hand using your own effects during this turn$/i, make: () => [{ kind: 'noLifeToHand' }] },
  ],
};
