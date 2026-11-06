// Traducteur, famille « cartes » (vague C2, tâche C2.3) : piocher, défausser (soi ou l'adversaire), placer des cartes du
// dessus du deck dans la Défausse, regarder et chercher dans le deck (vers la main ou le terrain), réorganiser le dessus
// du deck, Défausse vers la main ou sous le deck, main sous (ou sur) le deck ; et les coûts qui prennent des cartes de la
// main, du deck ou de la Défausse (« trash 1 card from your hand », « reveal 1 ... from your hand »...).
//
// Les règles reçoivent le texte normalisé (structure.ts), sans point final. Une description de carte hors du terrain
// (« {Navy} type card other than [Izo] ») est lue par parseFilter (target.ts), qui échoue sur tout reste : une tournure
// que la règle ne connaît pas fait échouer la règle (Unknown) plutôt que de donner une fausse traduction.
//
// « Regardez N cartes ... ajoutez-la à votre main. Puis, placez les cartes restantes ... » : la recherche est lue d'abord
// (rest : 'bottom' en attendant), la phrase « Then, place the rest ... » la complète (continuation). La destination des
// cartes restantes est toujours écrite sur les cartes ; le test de la famille vérifie sur tout le catalogue qu'une
// recherche traduite a bien sa phrase « the rest » (interprétation n° 1661).
import type { Action, CostPart, Filter, Step } from '../types.ts';
import { fail, Unknown } from './normalize.ts';
import type { Continuation, Family, Helpers } from './structure.ts';

// « 1 », « a », « an » → nombre
const N = '(\\d+|an?)';
const num = (x: string) => (/^an?$/i.test(x) ? 1 : +x);
const DECK = '(?:your|the) deck';
const ANY_ORDER = '(?: in any order)?';

// Description d'une carte hors du terrain ; vide → undefined (« trash 1 card from your hand »)
function cardFilter(phrase: string, h: Helpers): Filter | undefined {
  const f = h.filter(phrase);
  return Object.keys(f).length ? f : undefined;
}
// Une description qui ne dit que « card(s) » (aucun filtre) : « add up to 1 card to your hand »
function plainCards(phrase: string) {
  if (!/^cards?$/i.test(phrase.trim())) fail(phrase, 'cartes : filtre sans révéler');
}

// Où vont les cartes restantes d'une recherche
type Rest = Extract<Action, { kind: 'search' }>['rest'];
function restOf(phrase: string): Rest {
  const p = phrase.trim();
  if (/^trash the rest$/i.test(p)) return 'trash';
  const m = p.match(new RegExp(`^place the rest at the (top or bottom|top|bottom) of ${DECK}${ANY_ORDER}$`, 'i'));
  if (!m) return fail(p, 'cartes : cartes restantes');
  return m[1] === 'top or bottom' ? 'topOrBottom' : (m[1] as 'top' | 'bottom');
}

// La dernière étape lue d'une capacité, en entrant dans « If C, A and B » et « you may A » : c'est elle que complète une
// phrase « Then, place the rest ... »
function lastAction(steps: Step[]): Action | undefined {
  const st = steps.at(-1);
  if (!st) return undefined;
  if ('action' in st) return st.action;
  if ('group' in st) return lastAction(st.group);
  if ('may' in st) return lastAction(st.may);
  return undefined;
}

// « Look at N cards ...; reveal up to N <description> and add it to your hand » (et « ..., add it to your hand and
// place the rest ... » en une phrase, OP16 : joined)
function searchHand(look: string, take: string, what: string, rest: string | undefined, h: Helpers, shown: boolean): Action {
  const a: Action = {
    kind: 'search', look: +look, take: num(take), upTo: true, filter: h.filter(what), dest: 'hand',
    rest: rest ? restOf(rest) : 'bottom',
  };
  if (shown) a.shown = true;
  if (rest) a.joined = true;
  return a;
}

// Le début d'une recherche : « Look at N cards from the top of your deck » ou, pour une seule carte, « Reveal 1 card
// from the top of your deck » : la carte est alors montrée aux deux joueurs (shown), même si elle n'est pas prise
const LOOK = `(?:Look at (\\d+) cards?|Reveal (1) card) from the top of your deck`;
const look = (m: RegExpMatchArray) => m[1] ?? m[2];

const REST_INLINE = '(?:,? and (place the rest .+|trash the rest))?';

export const CARDS_FAMILY: Family = {
  name: 'cards',
  actions: [
    // « Draw 2 cards »
    { re: new RegExp(`^Draw ${N} cards?$`, 'i'), make: (m) => [{ kind: 'draw', n: num(m[1]) }] },
    // « Trash 1 card from your hand », « Trash 1 {Navy} type card from your hand », « Trash up to 2 cards from your hand »
    {
      re: new RegExp(`^Trash (up to )?${N} (.+?) from your hand$`, 'i'),
      make: (m, h) => {
        const a: Action = { kind: 'discard', n: num(m[2]) };
        const f = cardFilter(m[3], h);
        if (f) a.filter = f;
        if (m[1]) a.upTo = true;
        return [a];
      },
    },
    // « Your opponent trashes 1 card from their hand »
    { re: new RegExp(`^Your opponent trashes ${N} cards? from their hand$`, 'i'), make: (m) => [{ kind: 'oppDiscard', n: num(m[1]) }] },
    // « Trash 2 cards from the top of your deck », « ... of your opponent's deck »
    {
      re: new RegExp(`^Trash ${N} cards? from the top of (your|your opponent's) deck$`, 'i'),
      make: (m) => [{ kind: 'trashTop', n: num(m[1]), side: m[2].toLowerCase() === 'your' ? 'own' : 'opp' }],
    },
    // « Look at N cards ...; reveal up to N <description> and add it (them) to your hand »
    {
      re: new RegExp(`^${LOOK}; reveal up to (?:a total of )?${N} (.+?)(?:,| and) add (?:it|them|that card|those cards) to your hand${REST_INLINE}$`, 'i'),
      make: (m, h) => [searchHand(look(m), m[3], m[4], m[5], h, Boolean(m[2]))],
    },
    // « Reveal 1 card ... and add up to N <description> to your hand » (ST11-001)
    {
      re: new RegExp(`^Reveal (1) card from the top of your deck and add up to ${N} (.+?) to your hand${REST_INLINE}$`, 'i'),
      make: (m, h) => [searchHand(m[1], m[2], m[3], m[4], h, true)],
    },
    // « Look at N cards ... and add up to N card to your hand » : sans révéler, donc sans filtre
    // (la carte prise reste cachée à l'adversaire)
    {
      re: new RegExp(`^Look at (\\d+) cards? from the top of your deck and add up to ${N} (cards?) to your hand${REST_INLINE}$`, 'i'),
      make: (m) => {
        plainCards(m[3]);
        const a: Action = { kind: 'search', look: +m[1], take: num(m[2]), upTo: true, filter: {}, dest: 'hand', rest: m[4] ? restOf(m[4]) : 'bottom', hidden: true };
        if (m[4]) a.joined = true;
        return [a];
      },
    },
    // « Look at N cards ... and play up to N <description> (rested) », « Reveal 1 card ... and play up to N ... »
    {
      re: new RegExp(`^${LOOK}(?: and|;|,) play up to ${N} (.+?)( rested)?${REST_INLINE}$`, 'i'),
      make: (m, h) => {
        const a: Action = { kind: 'search', look: +look(m), take: num(m[3]), upTo: true, filter: h.filter(m[4]), dest: 'play', rest: m[6] ? restOf(m[6]) : 'bottom' };
        if (m[5]) a.rested = true;
        if (m[2]) a.shown = true;
        if (m[6]) a.joined = true;
        return [a];
      },
    },
    // « Reveal 1 card from the top of your deck » seule : la carte reste au-dessus, les phrases suivantes la lisent
    // (« If that card is ..., ... », « Then, place the revealed card at the bottom of your deck » : continuations)
    { re: /^Reveal 1 card from the top of your deck$/i, make: () => [{ kind: 'revealTop' }] },
    // « Look at N cards ... and place them at the top or bottom of the deck (in any order) »
    // (aussi « ..., reorganize them in any order and place them ... », « ... and return them to ... »)
    {
      re: new RegExp(`^Look at (\\d+) cards? from the top of your deck(?:, reorganize them in any order)? and (?:place|return) (?:them|it) (?:at|to) the (top or bottom|top|bottom) of ${DECK}${ANY_ORDER}$`, 'i'),
      make: (m) => [{ kind: 'arrangeTop', look: +m[1], where: m[2] === 'top or bottom' ? 'topOrBottom' : (m[2] as 'top' | 'bottom') }],
    },
    // « Add up to 1 {Navy} type card from your trash to your hand », « Add 1 ... » (sans « jusqu'à »)
    {
      re: new RegExp(`^Add (up to )?${N} (.+?) from your trash to your hand$`, 'i'),
      make: (m, h) => [{ kind: 'trashToHand', count: num(m[2]), upTo: Boolean(m[1]), filter: h.filter(m[3]) }],
    },
    // « Place up to 3 cards from your trash at the bottom of your deck in any order », « ... from your opponent's trash
    // at the bottom of their deck »
    {
      re: new RegExp(`^(Place|Return) (up to )?${N} (.+?) from (your|your opponent's) trash (?:at|to) the bottom of (?:your|their|the owner's) deck${ANY_ORDER}$`, 'i'),
      make: (m, h) => {
        const a: Action = { kind: 'trashToBottom', count: num(m[3]), side: m[5].toLowerCase() === 'your' ? 'own' : 'opp', filter: h.filter(m[4]) };
        if (m[2]) a.upTo = true;
        if (/^return$/i.test(m[1])) a.wording = 'return';
        return [a];
      },
    },
    // « Place 1 card from your hand at the bottom of your deck », « ... at the top or bottom of your deck in any order »
    {
      re: new RegExp(`^Place ${N} cards? from your hand at the (top or bottom|top|bottom) of your deck${ANY_ORDER}$`, 'i'),
      make: (m) => {
        const a: Action = { kind: 'handToBottom', n: num(m[1]) };
        if (m[2] !== 'bottom') a.where = m[2] === 'top' ? 'top' : 'topOrBottom';
        return [a];
      },
    },
    // « Your opponent places 1 card from their hand at the bottom of their deck (in any order) »
    {
      re: new RegExp(`^Your opponent places ${N} cards? from their hand at the bottom of their deck${ANY_ORDER}$`, 'i'),
      make: (m) => [{ kind: 'oppHandToBottom', n: num(m[1]) }],
    },
  ],
  costs: [
    // « trash 1 card from your hand », « trash 1 {Navy} type card from your hand », « trash 1 card with a [Trigger] ... »
    {
      re: new RegExp(`^trash ${N} (.+?) from your hand$`, 'i'),
      make: (m, h): CostPart => {
        const f = cardFilter(m[2], h);
        return f ? { kind: 'discard', n: num(m[1]), filter: f } : { kind: 'discard', n: num(m[1]) };
      },
    },
    // « reveal 2 Events from your hand », « reveal a total of 2 ... from your hand »
    {
      re: new RegExp(`^reveal (?:a total of )?${N} (.+?) from your hand$`, 'i'),
      make: (m, h): CostPart => {
        const f = cardFilter(m[2], h);
        return f ? { kind: 'reveal', n: num(m[1]), filter: f } : { kind: 'reveal', n: num(m[1]) };
      },
    },
    // « trash 2 cards from the top of your deck »
    { re: new RegExp(`^trash ${N} cards? from the top of your deck$`, 'i'), make: (m): CostPart => ({ kind: 'trashTop', n: num(m[1]) }) },
    // « place 3 cards from your trash at the bottom of your deck in any order », « return 2 cards from your trash to the
    // bottom of your deck »
    {
      re: new RegExp(`^(place|return) ${N} (.+?) from your trash (?:at|to) the bottom of your deck${ANY_ORDER}$`, 'i'),
      make: (m, h): CostPart => {
        const c: CostPart = { kind: 'trashToBottom', n: num(m[2]) };
        const f = cardFilter(m[3], h);
        if (f) c.filter = f;
        if (/^return$/i.test(m[1])) c.wording = 'return';
        return c;
      },
    },
  ],
  continuations: [
    // « Then, place the rest at the bottom of your deck in any order », « Then, trash the rest » : complète la recherche
    // qui précède (la dernière étape lue). Après « Reveal 1 card from the top of your deck. If that card is ..., you may
    // play that card » (OP07-048), « the rest » est la carte révélée si elle n'a pas été jouée : elle va au-dessous
    {
      re: /^(?:place the rest at the (?:top or bottom|top|bottom) of (?:your|the) deck(?: in any order)?|trash the rest)$/i,
      make: (m) => (steps: Step[]) => {
        const a = lastAction(steps);
        if (a?.kind === 'search') { a.rest = restOf(m[0]); return; }
        if (hasRevealTop(steps) && restOf(m[0]) === 'bottom') { steps.push({ link: 'then', action: { kind: 'revealedToBottom', asRest: true } }); return; }
        throw new Unknown(m[0], 'cartes : cartes restantes sans recherche');
      },
    } satisfies Continuation,
    // « Then, place the revealed card at the bottom of your deck » (après « Reveal 1 card from the top of your deck »)
    {
      re: /^place the revealed card at the bottom of your deck$/i,
      make: (m) => (steps: Step[]) => {
        if (!hasRevealTop(steps)) throw new Unknown(m[0], 'cartes : carte révélée sans révélation');
        steps.push({ link: 'then', action: { kind: 'revealedToBottom' } });
      },
    } satisfies Continuation,
    // « If that card is a {Navy} type Character card, ... », « If the revealed card has a cost of 4 or more, ... »,
    // « If that card's type includes "X", ... » : seulement juste après « Reveal 1 card from the top of your deck » (ailleurs,
    // « that card » désigne autre chose : une carte de Vie, une carte de la main adverse, la cible d'un effet)
    {
      re: /^If (?:that card|the revealed card)(?:'s| is| has) /i,
      make: (m, h) => (steps: Step[]) => {
        const last = steps.at(-1);
        if (!last || !('action' in last) || last.action.kind !== 'revealTop') throw new Unknown(m.input!, 'cartes : « that card » sans carte révélée');
        steps.push(...revealedStep(m.input!, h));
      },
    } satisfies Continuation,
  ],
};

function hasRevealTop(steps: Step[]): boolean {
  return steps.some((st) => 'action' in st && st.action.kind === 'revealTop');
}

// « If that card is a X, A » → A sous la condition « carte révélée » ; la condition la plus courte qui se lit (une virgule
// peut être dans la description : « {A}, {B} or {C} type »)
function revealedStep(sentence: string, h: Helpers): Step[] {
  const body = sentence.replace(/^If (?:that card|the revealed card)/i, '');
  let first: Unknown | undefined;
  for (let i = body.indexOf(', '); i >= 0; i = body.indexOf(', ', i + 1)) {
    const c = body.slice(0, i);
    const rest = body.slice(i + 2).trim();
    try {
      const filter = revealedFilter(c, h);
      const p = rest.match(/^(you may )?play that card( rested)?$/i);
      const steps: Step[] = p
        ? [p[1] ? { may: [{ action: { kind: 'playRevealed', ...(p[2] ? { rested: true } : {}) } }] } : { action: { kind: 'playRevealed', ...(p[2] ? { rested: true } : {}) } }]
        : h.steps(rest.charAt(0).toUpperCase() + rest.slice(1));
      const cond = { kind: 'revealed' as const, filter };
      return [steps.length > 1 ? { cond, group: steps } : { ...steps[0], cond }];
    } catch (e) {
      if (!(e instanceof Unknown)) throw e;
      first ??= e;
    }
  }
  throw first ?? new Unknown(sentence, 'cartes : « If that card » sans virgule');
}

// « 's type includes "X" », « is a {Navy} type Character card », « has a cost of 4 or more »
function revealedFilter(c: string, h: Helpers): Filter {
  let m: RegExpMatchArray | null;
  if ((m = c.match(/^'s type includes "([^"]+)"$/i))) return { typeIncludes: m[1] };
  if ((m = c.match(/^ is an? (.+)$/i))) return h.filter(m[1]);
  if ((m = c.match(/^ has (.+)$/i))) return h.filter(`card with ${m[1]}`);
  return fail(c, 'cartes : carte révélée');
}
