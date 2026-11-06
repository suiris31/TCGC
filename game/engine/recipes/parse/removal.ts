// Traducteur, famille « retraits » (vague C2, tâche C2.1) : mettre KO, renvoyer en main, placer sous le deck, dans la
// Vie ou dans la Défausse, épuiser, redresser, « ne se redresse pas lors de la prochaine phase de Recharge » ; et les
// coûts qui retirent ou épuisent ses propres cartes (« rest this Character », « return 1 of your Characters to the
// owner's hand »...).
//
// Les règles reçoivent le texte normalisé (structure.ts). La cible est lue par parseTarget (target.ts), qui échoue sur
// tout reste : « KO up to 1 ... and this Character gains ... » échoue ici et le squelette coupe la phrase sur « and ».
// Une règle qui ne sait pas lire sa cible laisse la place aux suivantes (et aux autres familles) : « Rest up to 1 of your
// opponent's DON!! cards » est pour la famille des DON!! (C2.4).
import type { Action, CostPart, Filter, Step, Target } from '../types.ts';
import { attempt, fail, Unknown } from './normalize.ts';
import type { Family, Helpers } from './structure.ts';
import { parseFilter } from './target.ts';

// « up to 1 of A and up to 1 of B » : deux cibles, deux choix l'un après l'autre (OP01-096, OP04-044, OP05-093)
function targets(phrase: string, h: Helpers, side?: 'own'): Target[] {
  const one = attempt(() => h.target(phrase, side));
  if (!(one instanceof Unknown)) return [one];
  const m = phrase.match(/^(up to .+?) and (up to .+)$/i);
  if (!m) throw one;
  return [h.target(m[1], side), h.target(m[2], side)];
}

// Une action par cible ; la seconde suit la première (« and »)
const each = (ts: Target[], make: (t: Target) => Action): Step[] =>
  ts.map((t, i) => (i === 0 ? { action: make(t) } : { link: 'and' as const, action: make(t) }));

// Une cible de Personnages seulement (pas un Leader ni un Lieu) : ce que les retraits visent
function characters(t: Target, phrase: string): Target {
  if (t.leader && !t.self) fail(phrase, 'retrait : un Leader');
  return t;
}

// Le filtre d'une carte de son propre terrain dans un coût (« 1 of your {Navy} type Characters ») : des Personnages
function ownChars(phrase: string): Filter {
  const f = parseFilter(phrase);
  if (!f.category || f.category.length !== 1 || f.category[0] !== 'CHARACTER') fail(phrase, 'coût : autre chose que des Personnages');
  delete f.category;
  return f;
}

const OWNER = "(?:the|their) owner's";

export const REMOVAL: Family = {
  name: 'removal',
  actions: [
    // « KO up to 1 of your opponent's Characters with a cost of 3 or less »
    { re: /^KO (.+)$/i, make: (m, h) => each(targets(m[1], h), (t) => ({ kind: 'ko', target: characters(t, m[1]) })) },
    // « Rest up to 1 of your opponent's Characters », « Rest this Character » (pas les DON!! : la cible échoue)
    { re: /^Rest (.+)$/i, make: (m, h) => each(targets(m[1], h), (t) => ({ kind: 'rest', target: t })) },
    // « Set up to 1 of your {Navy} type Characters as active », « Set this Character as active »
    { re: /^Set (.+?) as active$/i, make: (m, h) => each(targets(m[1], h, 'own'), (t) => ({ kind: 'setActive', target: t })) },
    // « Return up to 1 Character with a cost of 4 or less to the owner's hand »
    { re: new RegExp(`^Return (.+?) to ${OWNER} hands?$`, 'i'), make: (m, h) => each(targets(m[1], h), (t) => ({ kind: 'bounce', target: characters(t, m[1]) })) },
    { re: /^Return (.+?) to your hand$/i, make: (m, h) => {
      const ts = targets(m[1], h, 'own');
      if (ts.some((t) => t.side === 'opp')) fail(m[1], 'retrait : main du joueur pour une carte adverse');
      return each(ts, (t) => ({ kind: 'bounce', target: characters(t, m[1]) }));
    } },
    // « Place up to 1 Character with a cost of 3 or less at the bottom of the owner's deck »
    { re: new RegExp(`^Place (.+?) at the bottom of ${OWNER} decks?$`, 'i'), make: (m, h) => each(targets(m[1], h), (t) => ({ kind: 'bottom', target: characters(t, m[1]) })) },
    // « Add up to 1 of your opponent's Characters ... to the top or bottom of your opponent's Life cards face-up »,
    // « Place ... at the top of the owner's Life cards face-down » : la Vie du propriétaire de la carte
    { re: /^(?:Add|Place) (.+?) (?:to|at) the (top|top or bottom) of (the owner's|their owner's|their|your opponent's|your) Life cards face-(up|down)$/i,
      make: (m, h) => {
        const t = characters(h.target(m[1]), m[1]);
        const whose = m[3].toLowerCase();
        if ((whose === "your opponent's" && t.side !== 'opp') || (whose === 'your' && t.side !== 'own')) fail(m[0], 'retrait : Vie d\'un autre joueur que le propriétaire');
        if (t.self) fail(m[1], 'retrait : cette carte dans la Vie');
        return [{ kind: 'toLife', target: t, faceUp: m[4].toLowerCase() === 'up', where: m[2].toLowerCase() === 'top' ? 'top' : 'topOrBottom' }];
      } },
    // « Trash up to 1 of your opponent's Characters with a cost of 2 or less », « Trash this Character » (une carte du
    // terrain : « Trash 1 card from your hand » ne se lit pas comme une cible et passe aux autres familles)
    { re: /^Trash (?!the rest)(.+)$/i, make: (m, h) => each(targets(m[1], h), (t) => ({ kind: 'trashChar', target: characters(t, m[1]) })) },
    // « Up to 1 of your opponent's rested Characters ... will not become active in your opponent's next Refresh Phase »
    { re: /^(.+?) will not become active in your opponent's next Refresh Phase$/i,
      make: (m, h) => [{ kind: 'cantRefresh', target: h.target(m[1], 'opp') }] },
  ],
  costs: [
    { re: /^rest this (?:Character|Leader|Stage|card)$/i, make: () => ({ kind: 'restSelf' }) },
    { re: /^trash this (?:Character|Stage|card)$/i, make: () => ({ kind: 'trashSelf' }) },
    { re: /^return this (?:Character|card) to (?:the owner's|your) hand$/i, make: () => ({ kind: 'bounceSelf' }) },
    { re: /^place this (?:Character|Stage|card) at the bottom of (?:the owner's|your) deck$/i, make: () => ({ kind: 'selfToBottom' }) },
    // « trash 1 of your {Navy} type Characters », « return 1 of your Characters with a cost of 3 or more to the owner's hand »
    { re: /^trash (\d+) of your (.+)$/i, make: (m) => ({ kind: 'trashOwnChar', n: +m[1], filter: ownChars(m[2]) }) },
    { re: /^KO (\d+) of your (.+)$/i, make: (m) => ({ kind: 'koOwnChar', n: +m[1], filter: ownChars(m[2]) }) },
    // « place 1 of your Characters ... / 1 Stage with a cost of 1 at the bottom of the owner's deck » (ses propres cartes :
    // un coût se paie toujours avec les siennes)
    { re: /^place (\d+) (?:of your )?(.+?) at the bottom of (?:the owner's|your) deck$/i, make: (m) => {
      const f = parseFilter(m[2]);
      if (f.category?.length !== 1 || (f.category[0] !== 'CHARACTER' && f.category[0] !== 'STAGE')) fail(m[2], 'coût : Personnages ou Lieu à placer sous le deck');
      return { kind: 'bottomOwn', n: +m[1], filter: f };
    } },
    { re: /^return (\d+) of your (.+?) to (?:the owner's|your) hand$/i, make: (m) => ({ kind: 'returnOwnChar', n: +m[1], filter: ownChars(m[2]) }) },
    // « rest 1 of your cards » (Leader, Personnages, Lieu, DON!!) ; « rest 2 of your Characters » ; « rest 1 of your {X}
    // type Leader or Stage cards » ; « rest 1 of your [Usopp] cards » (DON!! exclues dès qu'il y a un filtre)
    { re: /^rest (\d+) of your (.+)$/i, make: (m): CostPart => {
      if (/^cards?$/i.test(m[2])) return { kind: 'restOwn', n: +m[1], what: 'cards' };
      if (/DON!!/.test(m[2])) fail(m[2], 'coût : DON!!');
      const f = parseFilter(m[2]);
      const cats = f.category ?? [];
      if (cats.length === 1 && cats[0] === 'CHARACTER') {
        delete f.category;
        return Object.keys(f).length ? { kind: 'restOwn', n: +m[1], what: 'characters', filter: f } : { kind: 'restOwn', n: +m[1], what: 'characters' };
      }
      if (cats.includes('EVENT')) fail(m[2], 'coût : un Évènement en jeu');
      if (!Object.keys(f).length) fail(m[2], 'coût : cartes à épuiser');
      return { kind: 'restOwn', n: +m[1], what: 'cards', filter: f };
    } },
    // « rest your Leader » (pas « this Leader » : une autre carte que celle qui porte l'effet)
    { re: /^rest your (?:1 )?(Leader|Stage)$/i, make: (m) => ({ kind: 'restOwn', n: 1, what: m[1].toLowerCase() === 'leader' ? 'leader' : 'stage' }) },
  ],
};
