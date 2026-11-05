// Traducteur, famille « jouer » (tâche C2.6) : jouer des cartes (main, Défausse, deck, Vie, cette carte), conditions
// générales (Leader, cartes en main, dans la Défausse ou le deck, Personnages, puissance, état de la carte, tour), coûts
// qui prennent des cartes (main, deck, Défausse), évènements « When ... », valeurs calculées (« for every N ... »,
// « with a cost equal to or less than the number of ... »).
//
// Les conditions sur la Vie (C2.5) et sur les DON!! (C2.4) ne sont pas ici. Les règles reçoivent le texte normalisé,
// sans point final (structure.ts). Une règle qui lit mal sa cible lève un Unknown : la suivante prend le relais.
import type { Action, Cmp, Cond, CostPart, Count, Filter, Per, RecipeEvent, Step } from '../types.ts';
import { fail } from './normalize.ts';
import type { Family, Helpers, Rule } from './structure.ts';
import { fieldFilter, parseFilter } from './target.ts';

const cmpOf = (w: string): Cmp => (/^(?:less|fewer)$/i.test(w) ? 'le' : /^more$/i.test(w) ? 'ge' : 'eq');
const COLOR_NAMES = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'] as const;
const names = (list: string) => [...list.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
const types = (list: string) => [...list.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
const nonEmpty = (f: Filter) => (Object.keys(f).length ? f : undefined);
const num = (w: string) => (/^(?:a|an|one)$/i.test(w) ? 1 : +w);

// ---------- Comptes (valeurs calculées) ----------

// « the number of your opponent's Life cards », « 2 cards in your trash »... Un compte qu'on ne sait pas lire échoue.
export function parseCount(phrase: string): Count {
  const p = phrase.trim().replace(/^the number of /i, '');
  let m: RegExpMatchArray | null;
  if (/^(?:the total of )?your and your opponent's Life cards$/i.test(p)) return { kind: 'life', side: 'total' };
  if (/^(?:cards in )?your opponent's Life(?: cards| area)?$/i.test(p)) return { kind: 'life', side: 'opp' };
  if (/^(?:cards in )?your Life(?: cards| area)?$/i.test(p)) return { kind: 'life', side: 'own' };
  if (/^DON!! cards on your field$/i.test(p)) return { kind: 'donField', side: 'own' };
  if (/^DON!! cards on your opponent's field$/i.test(p)) return { kind: 'donField', side: 'opp' };
  if (/^cards? in your hand$/i.test(p)) return { kind: 'hand', side: 'own' };
  if (/^cards? in your opponent's hand$/i.test(p)) return { kind: 'hand', side: 'opp' };
  if (/^cards? in your trash$/i.test(p)) return { kind: 'trash' };
  if ((m = p.match(/^(.+?) in your trash$/i))) {
    const f = parseFilter(m[1]);
    if (!Object.keys(f).length) fail(phrase, 'compte : cartes de la Défausse');
    return { kind: 'trash', filter: f };
  }
  if ((m = p.match(/^(?:of )?your opponent's (.+)$/i))) return { kind: 'chars', side: 'opp', filter: charsOnly(m[1], phrase) };
  if ((m = p.match(/^(?:of )?your (.+)$/i))) return { kind: 'chars', side: 'own', filter: charsOnly(m[1], phrase) };
  return fail(phrase, 'compte');
}
// Des Personnages en jeu (« {Navy} type Characters ») : la catégorie est retirée, seuls les Personnages sont comptés
function charsOnly(p: string, phrase: string): Filter {
  const f = fieldFilter(p);
  if (f.category?.length !== 1 || f.category[0] !== 'CHARACTER') fail(phrase, 'compte : autre chose que des Personnages');
  delete f.category;
  return f;
}

// « for every 2 cards in your trash », « for every card in your hand », « for every 3 Events in your trash »
function parsePer(phrase: string): Per {
  const m = phrase.match(/^(\d+|a|an)? ?(.+)$/i)!;
  const every = m[1] ? num(m[1]) : 1;
  // « for every card ... » : « card » est le nom compté (une à une)
  return { every, count: parseCount(m[2]) };
}

// Les phrases de compte connues, pour savoir où s'arrête « ... equal to or less than <compte> » dans une phrase
const COUNT_PHRASE = "the (?:number of (?:your opponent's Life cards|your Life cards|DON!! cards on your field|DON!! cards on your opponent's field|cards in your hand|cards in your opponent's hand|cards in your trash)|total of your and your opponent's Life cards)";

// Un nombre qui ne sert qu'à marquer une borne calculée le temps de relire la phrase avec toute la grammaire
const MARK = 987654;

// Remplace la borne marquée par la valeur calculée dans les filtres des étapes ; faux si aucune n'est trouvée
function replaceMark(x: unknown, count: Count): boolean {
  if (!x || typeof x !== 'object') return false;
  let found = false;
  const o = x as Record<string, unknown>;
  if (o.costMax === MARK) { delete o.costMax; (o as Filter).costMaxOf = count; found = true; }
  for (const v of Object.values(o)) if (replaceMark(v, count)) found = true;
  return found;
}

// ---------- Conditions ----------

// Une condition sur des cartes du terrain (« you have 2 or more {Navy} type Characters ») : « cards » sans catégorie
// est lu à part (fieldCards), comme l'étude l'a appris sur OP12-118 ; un nom seul (« you have [Izo] ») désigne un
// Personnage de ce nom (le Leader n'est pas « à vous » dans ce sens : il se lit « your Leader is »)
function chars(side: 'own' | 'opp' | 'any', cmp: Cmp, n: number, phrase: string): Cond {
  let p = phrase;
  if (/^(?:\[[^\]]+\](?:,? or )?)+$/.test(p.trim())) p = `${p.trim()} Character`;
  return { kind: 'chars', side, cmp, n, filter: fieldFilter(p) };
}
const ONLY_CHARS = (phrase: string): Cond => {
  const f = fieldFilter(phrase);
  if (f.category && (f.category.length !== 1 || f.category[0] !== 'CHARACTER')) fail(phrase, 'condition : seulement des Personnages');
  delete f.category;
  if (!Object.keys(f).length) fail(phrase, 'condition : seulement des Personnages sans filtre');
  return { kind: 'onlyChars', filter: f };
};

const CONDS: Rule<Cond>[] = [
  // ----- Leader -----
  { re: /^your Leader is ((?:\[[^\]]+\](?:,? or )?)+)$/i, make: (m) => ({ kind: 'leaderIs', names: names(m[1]) }) },
  { re: /^your Leader has the ((?:\{[^}]+\}(?:,? or |,? and )?)+) type$/i,
    make: (m) => {
      const t = types(m[1]);
      return t.length > 1 ? { kind: 'leaderType', types: t, mode: / and /.test(m[1]) ? 'all' : 'any' } : { kind: 'leaderType', types: t };
    } },
  { re: /^your Leader(?:'s type includes| has a type including) "([^"]+)"$/i, make: (m) => ({ kind: 'leaderTypeIncludes', part: m[1] }) },
  { re: /^your Leader has the <([^>]+)> attribute$/i, make: (m) => ({ kind: 'leaderAttribute', attribute: m[1] }) },
  { re: /^your Leader is multicolored$/i, make: () => ({ kind: 'leaderColor', colors: [], multicolor: true }) },
  { re: /^your Leader is (red|green|blue|purple|black|yellow)$/i,
    make: (m) => ({ kind: 'leaderColor', colors: [COLOR_NAMES.find((c) => c.toLowerCase() === m[1].toLowerCase())!] }) },
  // « your Leader is [A] or has the {T} type », « your Leader has the {T} type or is [A] » : un OU entre deux sortes
  { re: /^your Leader is ((?:\[[^\]]+\](?:,? or )?)+?) or has the (\{[^}]+\}) type$/i,
    make: (m) => ({ kind: 'or', any: [{ kind: 'leaderIs', names: names(m[1]) }, { kind: 'leaderType', types: types(m[2]) }] }) },
  { re: /^your Leader has the (\{[^}]+\}) type or is ((?:\[[^\]]+\](?:,? or )?)+)$/i,
    make: (m) => ({ kind: 'or', any: [{ kind: 'leaderType', types: types(m[1]) }, { kind: 'leaderIs', names: names(m[2]) }] }) },
  { re: /^your Leader has (\d+) power or (less|more)$/i, make: (m) => ({ kind: 'power', who: 'leader', cmp: cmpOf(m[2]), n: +m[1] }) },
  // ----- Main -----
  { re: /^you have (\d+) or (less|more|fewer) cards in your hand$/i, make: (m) => ({ kind: 'hand', side: 'own', cmp: cmpOf(m[2]), n: +m[1] }) },
  { re: /^you have (\d+) cards? in your hand$/i, make: (m) => ({ kind: 'hand', side: 'own', cmp: 'eq', n: +m[1] }) },
  { re: /^you have no cards in your hand$/i, make: () => ({ kind: 'hand', side: 'own', cmp: 'eq', n: 0 }) },
  { re: /^your opponent has (\d+) or (less|more|fewer) cards in their hand$/i, make: (m) => ({ kind: 'hand', side: 'opp', cmp: cmpOf(m[2]), n: +m[1] }) },
  // ----- Défausse et deck -----
  { re: /^you have (\d+) or (less|more|fewer) cards in your trash$/i, make: (m) => ({ kind: 'trash', cmp: cmpOf(m[2]), n: +m[1] }) },
  { re: /^you have (\d+) or (less|more|fewer) (.+?) in your trash$/i,
    make: (m) => {
      const f = parseFilter(m[3]);
      if (!Object.keys(f).length) fail(m[3], 'condition : cartes de la Défausse');
      return { kind: 'trash', cmp: cmpOf(m[2]), n: +m[1], filter: f };
    } },
  { re: /^(?:you have|there are) (\d+) or (less|more|fewer) cards in your deck$/i, make: (m) => ({ kind: 'deck', cmp: cmpOf(m[2]), n: +m[1] }) },
  // ----- La carte elle-même -----
  { re: /^this (?:Character|Leader|card|Stage) is rested$/i, make: () => ({ kind: 'selfState', rested: true }) },
  { re: /^this (?:Character|Leader|card|Stage) is active$/i, make: () => ({ kind: 'selfState', rested: false }) },
  { re: /^this (?:Character|Leader) has (\d+) or more DON!! cards given$/i, make: (m) => ({ kind: 'selfState', donMin: +m[1] }) },
  { re: /^this (?:Character|Leader) has (\d+) power or (less|more)$/i, make: (m) => ({ kind: 'power', who: 'self', cmp: cmpOf(m[2]), n: +m[1] }) },
  { re: /^this Character was played (?:on|during) this turn$/i, make: () => ({ kind: 'playedThisTurn' }) },
  // ----- Tour -----
  { re: /^it is your turn$/i, make: () => ({ kind: 'turn', mine: true }) },
  { re: /^it is your opponent's turn$/i, make: () => ({ kind: 'turn', mine: false }) },
  // ----- Cartes du terrain -----
  // « you have 8 or more rested cards » : toutes les cartes du terrain, DON!! comprises (OP12-118)
  { re: /^you have (\d+) or (less|more|fewer) (rested |active )?cards$/i,
    make: (m) => ({ kind: 'fieldCards', side: 'own', cmp: cmpOf(m[2]), n: +m[1], ...(m[3] ? { rested: /rested/i.test(m[3]) } : {}) }) },
  { re: /^your opponent has (\d+) or (less|more|fewer) (rested |active )?cards$/i,
    make: (m) => ({ kind: 'fieldCards', side: 'opp', cmp: cmpOf(m[2]), n: +m[1], ...(m[3] ? { rested: /rested/i.test(m[3]) } : {}) }) },
  // « the only Characters on your field are {X} type Characters », « you only have Characters with a type including "X" »
  { re: /^the only Characters on your field are (.+)$/i, make: (m) => ONLY_CHARS(m[1]) },
  { re: /^you only have (.+)$/i, make: (m) => ONLY_CHARS(m[1]) },
  { re: /^you have (\d+) or (less|more|fewer) (.+)$/i, make: (m) => chars('own', cmpOf(m[2]), +m[1], m[3]) },
  { re: /^your opponent has (\d+) or (less|more|fewer) (.+)$/i, make: (m) => chars('opp', cmpOf(m[2]), +m[1], m[3]) },
  // « you do not have 5 Characters with a cost of 5 or more » : moins de 5
  { re: /^you (?:do not|don't) have (\d+) (.+)$/i, make: (m) => chars('own', 'le', +m[1] - 1, m[2]) },
  { re: /^you (?:have no|don't have any|do not have any) (.+)$/i, make: (m) => chars('own', 'eq', 0, m[1]) },
  { re: /^you (?:don't|do not) have (\[.+)$/i, make: (m) => chars('own', 'eq', 0, m[1]) },
  { re: /^your opponent has no (.+)$/i, make: (m) => chars('opp', 'eq', 0, m[1]) },
  { re: /^there (?:are|is) no (.+)$/i, make: (m) => chars('any', 'eq', 0, m[1]) },
  { re: /^you have (?:a|an|1 or more) (.+)$/i, make: (m) => chars('own', 'ge', 1, m[1]) },
  { re: /^you have (\[.+)$/i, make: (m) => chars('own', 'ge', 1, m[1]) },
  { re: /^your opponent has (?:a|an|1 or more) (.+)$/i, make: (m) => chars('opp', 'ge', 1, m[1]) },
  { re: /^there is (?:a|an) (.+)$/i, make: (m) => chars('any', 'ge', 1, m[1]) },
];

// ---------- Coûts ----------

const COSTS: Rule<CostPart>[] = [
  { re: /^trash (\d+|a|an) (.+?) from your hand$/i,
    make: (m) => {
      const f = nonEmpty(parseFilter(m[2]));
      return { kind: 'discard', n: num(m[1]), ...(f ? { filter: f } : {}) };
    } },
  { re: /^reveal (?:a total of )?(\d+|a|an) (.+?) from your hand$/i,
    make: (m) => ({ kind: 'reveal', n: num(m[1]), filter: parseFilter(m[2]) }) },
  { re: /^trash (\d+) cards? from the top of your deck$/i, make: (m) => ({ kind: 'trashTop', n: +m[1] }) },
  { re: /^(?:place|return) (\d+) (.*?)cards? from your trash (?:at|to) the bottom of your deck(?: in any order)?$/i,
    make: (m) => {
      const f = m[2].trim() ? nonEmpty(parseFilter(`${m[2].trim()} card`)) : undefined;
      return { kind: 'trashToBottom', n: +m[1], ...(f ? { filter: f } : {}) };
    } },
];

// ---------- Évènements « When ... » ----------

const EVENTS: Rule<RecipeEvent>[] = [
  // « When this Character is KO'd by your opponent's effect » : un [En cas de KO] limité aux effets adverses
  { re: /^this Character is KO'd by your opponent's effect$/i, make: () => ({ on: 'koOwnChar', self: true, byOpponent: true }) },
  { re: /^(?:a|one) of your (.+?) is KO'd( by your opponent's effect)?$/i,
    make: (m) => ({ on: 'koOwnChar', filter: characters(m[1]), ...(m[2] ? { byOpponent: true } : {}) }) },
  { re: /^your (.+?) is KO'd( by your opponent's effect)?$/i,
    make: (m) => ({ on: 'koOwnChar', filter: characters(m[1]), ...(m[2] ? { byOpponent: true } : {}) }) },
  { re: /^(?:a|one) of your opponent's (.+?) is KO'd$/i, make: (m) => ({ on: 'koOppChar', filter: characters(m[1]) }) },
  { re: /^your opponent's (.+?) is KO'd$/i, make: (m) => ({ on: 'koOppChar', filter: characters(m[1]) }) },
  { re: /^a Character is KO'd$/i, make: () => ({ on: 'koChar' }) },
  { re: /^(?:you take damage|your Leader takes damage)$/i, make: () => ({ on: 'damage' }) },
  { re: /^your opponent plays (?:a|an) (.+)$/i, make: (m) => ({ on: 'oppPlayChar', ...withFilter(characters(m[1])) }) },
  { re: /^you play (?:a|an) (.+)$/i, make: (m) => ({ on: 'playChar', ...withFilter(characters(m[1])) }) },
  { re: /^(?:a|one or more) DON!! cards? on your field (?:is|are) returned to your DON!! deck$/i, make: () => ({ on: 'donReturned' }) },
  { re: /^this (?:Character|Leader) (?:is|becomes) rested$/i, make: () => ({ on: 'rested' }) },
  { re: /^a card is trashed from your hand by an effect$/i, make: () => ({ on: 'trashFromHand' }) },
  { re: /^you activate an Event$/i, make: () => ({ on: 'activateEvent' }) },
  { re: /^your opponent activates an Event$/i, make: () => ({ on: 'activateEvent', byOpponent: true }) },
  { re: /^a \[Trigger\] activates$/i, make: () => ({ on: 'trigger' }) },
];
// Des Personnages (« Characters with a cost of 3 or less », « {Navy} type Characters ») : la catégorie est retirée
function characters(p: string): Filter {
  const f = fieldFilter(p);
  if (f.category?.length !== 1 || f.category[0] !== 'CHARACTER') fail(p, 'évènement : autre chose que des Personnages');
  delete f.category;
  return f;
}
const withFilter = (f: Filter) => (Object.keys(f).length ? { filter: f } : {});

// ---------- Actions ----------

const ZONES: Record<string, Extract<Action, { kind: 'play' }>['from']> = {
  hand: 'hand', trash: 'trash', 'hand or trash': 'handOrTrash', deck: 'deck', 'life cards': 'life', 'life area': 'life',
};

function play(count: string, what: string, zone: string, rested: string | undefined, upTo: boolean): Action[] {
  const from = ZONES[zone.toLowerCase()];
  if (!from) fail(zone, 'jouer : zone');
  return [{ kind: 'play', from, count: +count, upTo, filter: parseFilter(what), ...(rested ? { rested: true } : {}) }];
}

// « for every N ... » : la phrase sans le compte est relue avec toute la grammaire ; chaque puissance ou coût lu est
// multiplié (« +1000 power and +1 cost for every 5 cards in your trash » : les deux). Rien à multiplier : échec.
function perRule(m: RegExpMatchArray, h: Helpers): Step[] {
  const per = parsePer(m[2]);
  const steps = h.steps(`${m[1]}${m[3] ?? ''}`);
  let found = 0;
  const visit = (list: Step[]) => {
    for (const st of list) {
      if ('action' in st) {
        if (st.action.kind === 'power' || st.action.kind === 'cost') { st.action.per = per; found++; }
      } else if ('may' in st) visit(st.may);
      else if ('group' in st) visit(st.group);
      else fail(m[0], 'valeur calculée dans un choix');
    }
  };
  visit(steps);
  if (!found) fail(m[0], 'valeur calculée : rien à multiplier');
  return steps;
}

const ZONE_RE = '(hand or trash|hand|trash|deck|Life cards|Life area)';
const ACTIONS: Rule<(Action | Step)[]>[] = [
  // « Play up to 1 {Navy} type Character card with a cost of 4 or less from your hand (rested) »
  { re: new RegExp(`^Play up to (\\d+) (.+?) from your ${ZONE_RE}( rested)?$`, 'i'), make: (m) => play(m[1], m[2], m[3], m[4], true) },
  { re: new RegExp(`^Play (\\d+) (.+?) from your ${ZONE_RE}( rested)?$`, 'i'), make: (m) => play(m[1], m[2], m[3], m[4], false) },
  // « Play up to 1 {Navy} type Character card from your hand with a cost of 4 or less » (la valeur après la zone)
  { re: new RegExp(`^Play up to (\\d+) (.+?) from your ${ZONE_RE} (with .+?)( rested)?$`, 'i'), make: (m) => play(m[1], `${m[2]} ${m[4]}`, m[3], m[5], true) },
  { re: /^Play this (?:card|Character card|Character)( rested)?$/i, make: (m) => [{ kind: 'playSelf', ...(m[1] ? { rested: true } : {}) }] },
  // [En cas de KO] « play this Character card from your trash (rested) » : la carte elle-même, depuis la Défausse
  { re: /^Play this Character card from your trash( rested)?$/i, make: (m) => [{ kind: 'playSelf', ...(m[1] ? { rested: true } : {}) }] },
  { re: /^Activate this card's \[(Main|On Play|Counter|On KO|When Attacking)\] effect$/i,
    make: (m) => [{ kind: 'activate', which: ({ Main: 'main', 'On Play': 'onPlay', Counter: 'counter', 'On KO': 'onKO', 'When Attacking': 'whenAttacking' } as const)[m[1] as 'Main'] }] },
  { re: /^You cannot play Character cards(?: during this turn| this turn)?$/i, make: () => [{ kind: 'noCharsThisTurn', what: 'play' }] },
  // ----- valeurs calculées -----
  // « <cible> gains +N power for every N <compte> », « ... during this battle for every ... »
  { re: /^(.+? (?:power|cost)(?: during this (?:battle|turn))?) for every (.+?)( during this (?:battle|turn))?$/i, make: perRule },
  // « <action> ... with a cost equal to or less than <compte> » : la borne est relue comme un nombre marqué, puis
  // remplacée par le compte (costMaxOf)
  { re: new RegExp(`^(.+?) with a cost equal to or less than (${COUNT_PHRASE})(.*)$`, 'i'),
    make: (m, h) => {
      const count = parseCount(m[2]);
      const steps = h.steps(`${m[1]} with a cost of ${MARK} or less${m[3]}`);
      if (!replaceMark(steps, count)) fail(m[0], 'valeur calculée : borne perdue');
      return steps;
    } },
];

export const PLAY: Family = {
  name: 'play',
  actions: ACTIONS,
  conds: CONDS,
  costs: COSTS,
  events: EVENTS,
};
