// Traducteur, famille « puissance » (vague C2, tâche C2.2) : puissance et coût (+N / −N), puissance de base fixée
// (« ... base power becomes N »), mots-clés accordés, interdits et protections (« ne peut pas attaquer / activer
// [Bloqueur] / être mis KO / être épuisé / quitter le terrain », « peut aussi attaquer les Personnages redressés »),
// annulation des effets, et les mêmes tournures en effet permanent (auras : « [DON!! x1] ce Personnage gagne ... »,
// « tous vos Personnages {X} gagnent ... », « donnez à cette carte de votre main −N de coût »). Et le coût « donner −N
// de puissance à votre Leader redressé ».
//
// Les règles reçoivent le texte normalisé (structure.ts), sans le point final. La cible est lue par parseTarget
// (target.ts) ; la durée en fin de phrase par durationAfter, qui échoue sur tout autre reste (« for every ... » : valeur
// calculée, famille C2.6). Sans durée, l'action est « permanente » : le garde-fou des durées (structure.ts) la refuse
// dans un effet ponctuel, et seule une capacité sans moment (effet permanent) la garde.
import type { Action, Duration, Keyword, Step, Target } from '../types.ts';
import { fail, KEYWORD_RE } from './normalize.ts';
import type { Family, Helpers } from './structure.ts';

// ---------- Sujets et cibles ----------

// Le sujet d'une phrase « X gagne ... » / « X ne peut pas ... ». En plus de parseTarget :
// - « your {Navy} type Characters », « your opponent's Characters » (pluriel sans nombre) : tous (comme « all of ») ;
// - « your {Navy} type Leader » : le Leader du joueur s'il a ce type (sans choix, voir compile.ts) ;
// - « this card in your hand » : la carte elle-même, dans la main (coût réduit en main, effet permanent).
export function subject(phrase: string, h: Helpers, side: 'own' | 'any' = 'own'): Target {
  const p = phrase.trim().replace(/^the /i, '');
  if (/^this card in your hand$/i.test(p)) return { side: 'own', zone: 'hand', self: true, count: 1, upTo: false, filter: {} };
  const t = h.target(p, side);
  // pluriel sans nombre ni « all » (« your {X} type Characters », « your opponent's Leader and Characters ») : tous
  if (!t.self && t.count === 1 && !t.upTo && /^(?:your|your opponent's|their) /i.test(p) && /\b(?:Characters|cards)\b/.test(p)) {
    return { ...t, count: 'all' };
  }
  return t;
}

// « up to 1 of your Leader or Character cards' base power » : le sujet au génitif
const possessive = (x: string) => x.replace(/(?:'s|')$/, '');

const signed = (x: string) => Number(x.replace('+', ''));

// La durée d'une phrase (fin de phrase) ; sans durée : effet permanent (le garde-fou de structure.ts tranche)
const until = (rest: string, h: Helpers): Duration => h.duration(rest, 'permanent');

// Ce qu'une carte « gagne » : « [Blocker] », « +2000 power », « +1 cost », reliés par « and » ou des virgules
// (« gains [Rush] and +1000 power », « gains [Blocker], [Banish] and +2000 power »)
const GAIN_ITEM = new RegExp(`^(?:\\[${KEYWORD_RE}\\]|([+-]\\d+) (power|cost))$`);
function gains(target: Target, list: string, u: Duration): Action[] {
  const items = list.split(/,? and |, /).map((x) => x.trim());
  return items.map((it): Action => {
    const m = it.match(GAIN_ITEM);
    if (!m) return fail(list, 'mots-clés et valeurs gagnés', it);
    if (m[2]) return { kind: m[3] === 'power' ? 'power' : 'cost', target, amount: signed(m[2]), until: u };
    return { kind: 'keyword', target, keyword: m[1] as Keyword, until: u };
  });
}

// Une action par étape, sans lien : un seul prédicat (« gains [Rush] and +1000 power » ; describe les redit ensemble)
const linked = (actions: Action[]): Step[] => actions.map((action) => ({ action }));

// « Your opponent cannot activate [Blocker] » : tous les Personnages adverses (aucune carte de l'adversaire ne bloque)
const OPP_ALL: Target = { side: 'opp', zone: 'field', count: 'all', upTo: false, filter: {}, characters: true };

// « cannot be KO'd [in battle | by effects | by your opponent's effects] [in battle by <A> attribute cards] »
function koBy(how: string | undefined): { by: 'battle' | 'effect' | 'oppEffect' | 'any'; byAttribute?: string } {
  if (!how) return { by: 'any' };
  let m: RegExpMatchArray | null;
  if (/^in battle$/i.test(how)) return { by: 'battle' };
  if (/^by effects$/i.test(how)) return { by: 'effect' };
  if (/^by your opponent's effects$/i.test(how)) return { by: 'oppEffect' };
  // « ... attribute cards » seulement : « ... attribute Characters » (OP01-024) exclut un Leader qui attaque, ce que
  // byAttribute ne sait pas dire (intégration C2)
  if ((m = how.match(/^in battle by <([^>]+)> attribute cards$/i))) return { by: 'battle', byAttribute: m[1] };
  return fail(how, 'protection contre le KO');
}

const KW = `\\[${KEYWORD_RE}\\]`;
// (sans groupe capturant dans la liste : elle est lue en entier par gains())
const KW_NC = `\\[${KEYWORD_RE.replace('(', '(?:')}\\]`;
const GAINED = `((?:${KW_NC}|[+-]\\d+ (?:power|cost))(?:(?:,? and |, )(?:${KW_NC}|[+-]\\d+ (?:power|cost)))*)`;

export const POWER: Family = {
  name: 'power',
  actions: [
    // « Give up to 1 of your opponent's Characters −2000 power during this turn », « Give this card in your hand −1 cost »,
    // « Give your Leader and all of your Characters +1000 power » (rare : la cible échoue et la règle laisse la place)
    { re: /^Give (.+?) ([+-]\d+) (power|cost)(.*)$/i, make: (m, h) => [{
      kind: m[3].toLowerCase() === 'power' ? 'power' : 'cost', target: subject(m[1], h, 'any'), amount: signed(m[2]), until: until(m[4], h),
    }] },
    // « Give up to 1 of your Characters [Rush] during this turn »
    { re: new RegExp(`^Give (.+?) ${KW}(.*)$`, 'i'), make: (m, h) => [{ kind: 'keyword', target: subject(m[1], h), keyword: m[2] as Keyword, until: until(m[3], h) }] },
    // « This Character gains +2000 power », « Up to 1 of your Leader or Character cards gains +1000 power during this
    // battle », « This Character gains [Blocker] and +1000 power », « All of your {X} type Characters gain [Rush] »
    { re: new RegExp(`^(.+?) gains? ${GAINED}(.*)$`, 'i'), make: (m, h) => {
      const t = subject(m[1], h);
      return linked(gains(t, m[2], until(m[3], h)));
    } },
    // « Your Leader's base power becomes 7000 until the end of your opponent's next End Phase », « up to 1 of your
    // Leader or Character cards' base power becomes 7000 during this turn » (« becomes the same as ... » : valeur calculée,
    // pas lue ici)
    { re: /^(.+?(?:'s|')) base power becomes (\d+)(.*)$/i, make: (m, h) => [{ kind: 'powerSet', target: subject(possessive(m[1]), h), value: +m[2], until: until(m[3], h) }] },
    { re: /^The base power of (.+?) becomes (\d+)(.*)$/i, make: (m, h) => [{ kind: 'powerSet', target: subject(m[1], h), value: +m[2], until: until(m[3], h) }] },
    // « This Character can attack Characters on the turn in which it is played » : [Initiative : Personnage]
    { re: /^(.+?) can attack Characters on the turn in which (?:it is|they are) played(.*)$/i,
      make: (m, h) => [{ kind: 'keyword', target: subject(m[1], h), keyword: 'Rush: Character', until: until(m[2], h) }] },
    // « Up to 1 of your {SWORD} type Leader or Character cards can also attack active Characters during this turn »
    { re: /^(.+?) can (?:also )?attack (?:your opponent's )?active Characters(.*)$/i,
      make: (m, h) => [{ kind: 'attackActive', target: subject(m[1], h), until: until(m[2], h) }] },
    // « This Character cannot attack », « This Leader cannot attack », « ... cannot attack a Leader during this turn »
    { re: /^(.+?) cannot attack( a Leader| your opponent's Leader| Leaders)?(.*)$/i,
      make: (m, h) => [{ kind: 'cantAttack', target: subject(m[1], h, 'any'), until: until(m[3], h), what: m[2] ? 'leader' : 'any' }] },
    // « Your opponent cannot activate [Blocker] during this battle » ; « Up to 1 of your opponent's Characters cannot
    // activate [Blocker] during this turn » ; « ... cannot activate a [Blocker] Character that has 2000 or less power
    // during this battle », « ... the [Blocker] of any Character with a cost of 2 or less ... » : les Personnages visés
    { re: /^Your opponent cannot activate \[Blocker\](.*)$/i, make: (m, h) => [{ kind: 'cantBlock', target: { ...OPP_ALL, filter: {} }, until: until(m[1], h) }] },
    { re: /^Your opponent cannot activate (?:a \[Blocker\] Character that has (\d+) or less power|the \[Blocker\] of any Character with (\d+) or less power|the \[Blocker\] of any Character with a cost of (\d+) or less)(.*)$/i,
      make: (m, h) => [{
        kind: 'cantBlock', until: until(m[4], h),
        target: { ...OPP_ALL, filter: m[3] !== undefined ? { costMax: +m[3] } : { powerMax: +(m[1] ?? m[2]) } },
      }] },
    { re: /^(.+?) cannot activate \[Blocker\](.*)$/i, make: (m, h) => [{ kind: 'cantBlock', target: subject(m[1], h, 'any'), until: until(m[2], h) }] },
    // « This Character cannot be KO'd in battle », « ... cannot be KO'd by your opponent's effects during this turn »,
    // « This Character cannot be KO'd in battle by <Slash> attribute cards »
    { re: /^(.+?) cannot be KO'd( in battle by <[^>]+> attribute (?:cards|Characters)| in battle| by effects| by your opponent's effects)?(.*)$/i,
      make: (m, h) => [{ kind: 'cantBeKO', target: subject(m[1], h), until: until(m[3], h), ...cleanBy(koBy(m[2]?.trim())) }] },
    // « ... cannot be rested » avec une durée (ni par un effet, ni pour attaquer : modification 'cantRest')
    { re: /^(.+?) cannot be rested(.*)$/i, make: (m, h) => [{ kind: 'cantBeRested', target: subject(m[1], h, 'any'), until: until(m[2], h) }] },
    // « This Character cannot be removed from the field by your opponent's effects »
    { re: /^(.+?) cannot be removed from the field by your opponent's effects(.*)$/i,
      make: (m, h) => [{ kind: 'cantLeave', target: subject(m[1], h), until: until(m[2], h) }] },
    // « Negate the effect of up to 1 of your opponent's Characters during this turn » (une durée est exigée : sans durée,
    // la lecture n'est pas sûre)
    { re: /^Negate the effects? of (.+?)((?: during| until| for).*)?$/i, make: (m, h) => {
      const u = until(m[2] ?? '', h);
      if (u === 'permanent') fail(m[0], 'annulation sans durée');
      return [{ kind: 'negate', target: subject(m[1], h, 'any'), until: u }];
    } },
    // « This Character's effect is negated during this turn »
    { re: /^(.+?)'s effects? (?:is|are) negated(.*)$/i, make: (m, h) => {
      const u = until(m[2], h);
      if (u === 'permanent') fail(m[0], 'annulation sans durée');
      return [{ kind: 'negate', target: subject(m[1], h), until: u }];
    } },
    // « That card gains an additional +2000 power during this battle » (après « Up to 1 of your Leader or Character
    // cards gains +2000 power during this battle. Then, if ..., ») : la carte choisie par l'étape précédente (that)
    { re: /^That card gains an additional ([+-]\d+) power(.*)$/i, make: (m, h) => [{
      kind: 'power', target: { side: 'own', zone: 'field', that: true, count: 1, upTo: false, filter: {} }, amount: signed(m[1]), until: until(m[2], h),
    }] },
    // Un sujet, deux prédicats : « This Character cannot be removed from the field by your opponent's effects and gains
    // [Rush] », « ... gains [Blocker] and cannot be KO'd in battle » (chaque moitié relue avec le même sujet)
    { re: /^(.+?) ((?:cannot|can|gains?) .+?) and ((?:cannot|can|gains?) .+)$/i, make: (m, h) => {
      const a = h.steps(`${m[1]} ${m[2]}`);
      const b = h.steps(`${m[1]} ${m[3]}`);
      if (a.length !== 1 || b.length !== 1) fail(m[0], 'deux prédicats composés');
      return [a[0], { ...b[0], link: 'and' }];
    } },
  ],
  costs: [
    // « give your 1 active Leader −5000 power during this turn », « give your active Leader −5000 power during this
    // turn » : le Leader doit être redressé (comme Nami EB03-006 codée à la main)
    { re: /^give your (?:1 )?active Leader -(\d+) power during this turn$/i, make: (m) => ({ kind: 'leaderPowerMinus', n: +m[1] }) },
  ],
};

// `by: 'any'` est la valeur par défaut : on ne l'écrit pas (recettes plus courtes, comme le prototype)
function cleanBy(x: ReturnType<typeof koBy>): { by?: 'battle' | 'effect' | 'oppEffect'; byAttribute?: string } {
  return { ...(x.by !== 'any' ? { by: x.by } : {}), ...(x.byAttribute ? { byAttribute: x.byAttribute } : {}) };
}
