// Traducteur, famille « DON!! » (vague C2, tâche C2.4) : ajouter des DON!! depuis le deck DON!!, les redresser, les
// donner (les siennes, celles de l'adversaire ou celles du propriétaire de la carte), les renvoyer au deck DON!! (soi ou
// l'adversaire), les épuiser (soi ou l'adversaire, « DON!! ou Personnages ») ; les coûts écrits en toutes lettres
// (« rest 1 of your DON!! cards », « give 1 active DON!! card to ... ») ; les conditions sur les DON!! (nombre sur le
// terrain, comparé à l'adversaire, redressées, données) ; l'évènement « quand une DON!! retourne au deck DON!! ».
//
// Les symboles ① et « DON!! −N » sont lus par la structure (structure.ts). Les règles reçoivent le texte normalisé ; une
// cible qui ne se lit pas laisse la place aux suivantes (et aux autres familles). Les tournures douteuses et leurs
// lectures retenues sont dans game/docs/interpretations.md (1740 à 1819).
import type { Action, Cmp, Cond, CostPart, Filter, RecipeEvent, Target } from '../types.ts';
import { fail } from './normalize.ts';
import type { Family, Helpers } from './structure.ts';

const cmpOf = (w: string): Cmp => (/less|fewer/i.test(w) ? 'le' : 'ge');

// Celui qui reçoit les DON!! : « your Leader or 1 of your Characters » (la tournure la plus courante, que parseTarget ne
// lit pas), « its owner's Leader or 1 of their Characters » (OP15 : DON!! du propriétaire), sinon parseTarget
function receiver(phrase: string, h: Helpers): { target: Target; owner?: boolean } {
  let m: RegExpMatchArray | null;
  if ((m = phrase.match(/^(your|your opponent's|its owner's) Leader or (?:up to )?1 of (?:your|their|your opponent's) Characters$/i))) {
    const w = m[1].toLowerCase();
    const side = w === 'your' ? 'own' : w === "your opponent's" ? 'opp' : 'any';
    return { target: { side, zone: 'field', leader: true, characters: true, count: 1, upTo: false, filter: {} }, owner: side === 'any' || undefined };
  }
  const t = h.target(phrase, 'own');
  if (t.count !== 1) fail(phrase, 'DON!! : plusieurs cartes reçoivent');
  return { target: t };
}

const restOrActive = (w: string): 'active' | 'rested' => (/rest/i.test(w) ? 'rested' : 'active');

// « DON!! cards or Characters with a cost of 3 or less » → le filtre des Personnages (« Characters » seulement)
function orCharacters(phrase: string, h: Helpers): Filter {
  const t = h.target(`up to 1 of your opponent's ${phrase}`, 'opp');
  if (t.leader || t.stage || !t.characters || t.self || t.otherThanSelf) fail(phrase, 'DON!! : ou autre chose que des Personnages');
  return t.filter;
}

const action = (a: Action): Action[] => [a];

export const DON: Family = {
  name: 'don',
  actions: [
    // « Add up to 1 DON!! card from your DON!! deck and set it as active / and rest it »
    { re: /^Add (up to )?(\d+) (?:additional )?DON!! cards? from your DON!! deck and (set (?:it|them) as active|rest (?:it|them))$/i,
      make: (m) => action({ kind: 'addDon', n: +m[2], upTo: Boolean(m[1]), state: restOrActive(m[3]) }) },
    // EB05 : « Add up to 1 DON!! card as active / as rested from your DON!! deck »
    { re: /^Add (up to )?(\d+) DON!! cards? as (active|rested) from your DON!! deck$/i,
      make: (m) => action({ kind: 'addDon', n: +m[2], upTo: Boolean(m[1]), state: restOrActive(m[3]) }) },
    // « ... and add up to 1 additional DON!! card and rest it » (la suite d'un premier ajout)
    { re: /^Add (up to )?(\d+) additional DON!! cards? and (set (?:it|them) as active|rest (?:it|them))$/i,
      make: (m) => action({ kind: 'addDon', n: +m[2], upTo: Boolean(m[1]), state: restOrActive(m[3]) }) },
    // « Set up to 2 of your DON!! cards as active »
    { re: /^Set (up to )?(\d+) of your DON!! cards? as active$/i, make: (m) => action({ kind: 'readyDon', n: +m[2], upTo: Boolean(m[1]) }) },
    // « Give this Character up to 2 rested DON!! cards »
    { re: /^Give (this Character|this Leader) up to (\d+) rested DON!! cards?$/i,
      make: (m, h) => action({ kind: 'giveDon', n: +m[2], upTo: true, rested: true, target: h.target(m[1]) }) },
    // « Give up to 1 of your opponent's rested DON!! cards to 1 of your opponent's Characters »
    { re: /^Give (up to )?(\d+) of your opponent's rested DON!! cards? to (.+)$/i, make: (m, h) => {
      const { target } = receiver(m[3], h);
      if (target.side !== 'opp') fail(m[3], 'DON!! adverses à une carte non adverse');
      return action({ kind: 'giveDon', n: +m[2], upTo: Boolean(m[1]), rested: true, target, from: 'opp' });
    } },
    // « Give up to 1 rested DON!! card to your Leader or 1 of your Characters », « ... to its owner's Leader or 1 of their
    // Characters » (DON!! du propriétaire de la carte choisie)
    { re: /^Give (up to )?(\d+) (rested|active) DON!! cards? to (.+)$/i, make: (m, h) => {
      const { target, owner } = receiver(m[4], h);
      if (!owner && target.side !== 'own') fail(m[4], 'DON!! à une carte adverse');
      const a: Action = { kind: 'giveDon', n: +m[2], upTo: Boolean(m[1]), rested: m[3].toLowerCase() === 'rested', target };
      if (owner) a.from = 'owner';
      return action(a);
    } },
    // « Your opponent returns 1 DON!! card from their field to their DON!! deck »
    { re: /^Your opponent returns (\d+) DON!! cards? from their field to their DON!! deck$/i, make: (m) => action({ kind: 'returnDon', n: +m[1], side: 'opp' }) },
    // « Return 1 DON!! card from your field to your DON!! deck »
    { re: /^Return (\d+) DON!! cards? from your field to your DON!! deck$/i, make: (m) => action({ kind: 'returnDon', n: +m[1], side: 'own' }) },
    // « Rest up to 1 of your opponent's DON!! cards »
    { re: /^Rest up to (\d+) of your opponent's DON!! cards?$/i, make: (m) => action({ kind: 'restDon', n: +m[1], side: 'opp' }) },
    // « Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 3 or less », « Rest up to a total of 2 of
    // your opponent's Characters or DON!! cards »
    { re: /^Rest up to (?:a total of )?(\d+) of your opponent's DON!! cards or (.+)$/i,
      make: (m, h) => action({ kind: 'restDon', n: +m[1], side: 'opp', orCharacters: orCharacters(m[2], h) }) },
    { re: /^Rest up to (?:a total of )?(\d+) of your opponent's (.+?) or DON!! cards$/i,
      make: (m, h) => action({ kind: 'restDon', n: +m[1], side: 'opp', orCharacters: orCharacters(m[2], h) }) },
    // « Rest 1 of your DON!! cards » (un effet : « you may rest 1 of your DON!! cards. If you do, ... »)
    { re: /^Rest (\d+) of your DON!! cards?$/i, make: (m) => action({ kind: 'restDon', n: +m[1], side: 'own' }) },
  ],
  costs: [
    // « rest 1 of your DON!! cards » (le même coût que ①)
    { re: /^rest (\d+) of your DON!! cards?$/i, make: (m): CostPart => ({ kind: 'restDon', n: +m[1] }) },
    // « give 1 active DON!! card to 1 of your Leader », « ... to 1 of your [Silvers Rayleigh] »
    { re: /^give (\d+) active DON!! cards? to (.+)$/i, make: (m, h): CostPart => {
      const { target, owner } = receiver(m[2], h);
      if (owner || target.side !== 'own') fail(m[2], 'coût : DON!! à une carte non alliée');
      return { kind: 'giveDon', n: +m[1], target };
    } },
    // OP15 : « give 1 of your opponent's rested DON!! cards to 1 of your opponent's Characters »
    { re: /^give (\d+) of your opponent's rested DON!! cards? to (.+)$/i, make: (m, h): CostPart => {
      const { target } = receiver(m[2], h);
      if (target.side !== 'opp') fail(m[2], 'coût : DON!! adverses à une carte non adverse');
      return { kind: 'giveDon', n: +m[1], target, from: 'opp' };
    } },
  ],
  conds: [
    // « you have 6 or more DON!! cards on your field », « you have 10 DON!! cards on your field »
    { re: /^you have (\d+) or (less|more|fewer) DON!! cards on your field$/i, make: (m): Cond => ({ kind: 'donField', side: 'own', cmp: cmpOf(m[2]), n: +m[1] }) },
    { re: /^you have (\d+) DON!! cards on your field$/i, make: (m): Cond => ({ kind: 'donField', side: 'own', cmp: 'eq', n: +m[1] }) },
    { re: /^you have any DON!! cards on your field$/i, make: (): Cond => ({ kind: 'donField', side: 'own', cmp: 'ge', n: 1 }) },
    // « you have 0 or 3 or more DON!! cards on your field » (OP05-060)
    { re: /^you have (\d+) or (\d+) or (less|more) DON!! cards on your field$/i, make: (m): Cond => ({
      kind: 'or', any: [{ kind: 'donField', side: 'own', cmp: 'eq', n: +m[1] }, { kind: 'donField', side: 'own', cmp: cmpOf(m[3]), n: +m[2] }],
    }) },
    { re: /^your opponent has (\d+) or (less|more|fewer) DON!! cards on (?:their|the) field$/i, make: (m): Cond => ({ kind: 'donField', side: 'opp', cmp: cmpOf(m[2]), n: +m[1] }) },
    { re: /^your opponent has (\d+) DON!! cards on (?:their|the) field$/i, make: (m): Cond => ({ kind: 'donField', side: 'opp', cmp: 'eq', n: +m[1] }) },
    // « either you or your opponent has 10 DON!! cards on the field » (P-107)
    { re: /^either you or your opponent has (\d+) DON!! cards on the field$/i, make: (m): Cond => ({
      kind: 'or', any: [{ kind: 'donField', side: 'own', cmp: 'eq', n: +m[1] }, { kind: 'donField', side: 'opp', cmp: 'eq', n: +m[1] }],
    }) },
    // comparés à l'adversaire
    { re: /^the number of DON!! cards on your field is equal to or (less|more) than the number on your opponent's field$/i,
      make: (m): Cond => ({ kind: 'donVsOpp', cmp: m[1].toLowerCase() === 'less' ? 'le' : 'ge' }) },
    { re: /^your opponent has (more|less|fewer) DON!! cards on their field than you$/i,
      make: (m): Cond => ({ kind: 'donVsOpp', cmp: m[1].toLowerCase() === 'more' ? 'lt' : 'gt' }) },
    { re: /^you have (more|less|fewer) DON!! cards on your field than your opponent$/i,
      make: (m): Cond => ({ kind: 'donVsOpp', cmp: m[1].toLowerCase() === 'more' ? 'gt' : 'lt' }) },
    // redressées / épuisées de la zone de Coût
    { re: /^you have (\d+) or (less|more|fewer) (active|rested) DON!! cards$/i,
      make: (m): Cond => ({ kind: 'donCards', side: 'own', what: m[3].toLowerCase() as 'active' | 'rested', cmp: cmpOf(m[2]), n: +m[1] }) },
    // données (au Leader et aux Personnages)
    { re: /^(you have|your opponent has) any DON!! cards given$/i,
      make: (m): Cond => ({ kind: 'donCards', side: /opponent/i.test(m[1]) ? 'opp' : 'own', what: 'given', cmp: 'ge', n: 1 }) },
    { re: /^you have a total of (\d+) or (less|more|fewer) given DON!! cards$/i,
      make: (m): Cond => ({ kind: 'donCards', side: 'own', what: 'given', cmp: cmpOf(m[2]), n: +m[1] }) },
    // « this Character has 2 or more DON!! cards given »
    { re: /^this (?:Character|Leader) has (\d+) or more DON!! cards given$/i, make: (m): Cond => ({ kind: 'selfState', donMin: +m[1] }) },
    { re: /^this (?:Character|Leader) has (?:a|any) DON!! cards? given$/i, make: (): Cond => ({ kind: 'selfState', donMin: 1 }) },
  ],
  events: [
    // « When a DON!! card on your field is returned to your DON!! deck, ... » (pas « N or more », ni « by your effect »)
    { re: /^a DON!! card on (?:your|the) field is returned to your DON!! deck$/i, make: (): RecipeEvent => ({ on: 'donReturned' }) },
  ],
};
