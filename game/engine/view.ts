// Vue d'un joueur sur une partie en ligne : une copie de l'état de jeu qui ne contient que ce qu'il verrait à une
// vraie table. C'est la seule chose que le serveur envoie au navigateur d'un joueur ; l'état complet ne sort jamais.
//
// Ce qui est retiré ou masqué :
// - les cartes cachées : main adverse, decks (le sien aussi : on n'en connaît pas l'ordre), Vies face cachée. Elles
//   deviennent des cartes « ? » avec un identifiant opaque, qui dépend de leur place et non de la carte : les vrais
//   identifiants (uid) sont attribués dans l'ordre de la liste du deck, ils suffiraient à reconnaître une carte ;
// - la graine du hasard (elle permettrait de prévoir les mélanges) et le compteur d'identifiants ;
// - les effets en cours (leur instantané contient tout l'état) ;
// - les lignes secrètes du journal de l'adversaire, les libellés de ses choix, les options de ses décisions ;
// - les modifications qui visent une carte cachée.
// Ce qui reste visible : les cartes qu'une décision du joueur lui montre (cartes regardées, choisies...) et la carte
// du dessus du deck adverse s'il l'a regardée.
import { HIDDEN } from './cards/index.ts';
import { knows } from './rules.ts';
import type { Card, Decision, GameState, PlayerId } from './types.ts';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// Identifiants des cartes que la décision en cours du joueur lui montre (options « card:12 », « attack:3:7 »...)
function shownBy(d: Decision | null, seat: PlayerId): Set<number> {
  const shown = new Set<number>();
  if (!d || d.player !== seat) return shown;
  for (const o of d.options) {
    if (o.uid !== undefined) shown.add(o.uid);
    if (o.target !== undefined) shown.add(o.target);
    for (const part of o.id.split(':').slice(1)) if (/^\d+$/.test(part)) shown.add(Number(part));
  }
  return shown;
}

export function viewFor(s: GameState, seat: PlayerId): GameState {
  const v = structuredClone(s);
  const opp = other(seat);
  const shown = shownBy(s.decision, seat);
  const hidden = new Set<number>();
  // carte cachée -> carte « ? » dont l'identifiant ne dépend que de sa place (zone et position)
  const mask = (cards: Card[], base: number, keep: (c: Card) => boolean) => cards.map((c, i) => {
    if (keep(c)) return c;
    hidden.add(c.uid);
    return { uid: -(base + i), num: HIDDEN };
  });
  const O = v.players[opp];
  const P = v.players[seat];
  const knownTop = s.peek[seat] !== null && O.deck[0]?.uid === s.peek[seat] ? O.deck[0].uid : null;
  // cartes que le joueur connaît : révélées ou regardées (rules.ts, reveal), tant qu'elles restent dans leur zone
  const known = (c: Card) => shown.has(c.uid) || knows(s, seat, c.uid);
  O.hand = mask(O.hand, 1000, known);
  O.deck = mask(O.deck, 2000, (c) => c.uid === knownTop || known(c));
  O.life = mask(O.life, 3000, (c) => Boolean(c.faceUp) || known(c));
  P.deck = mask(P.deck, 4000, known);
  P.life = mask(P.life, 5000, (c) => Boolean(c.faceUp) || known(c));

  delete O.list;  // la liste du deck adverse est secrète
  v.rng = 0;
  v.nextUid = 0;
  v.peek = seat === 0 ? [knownTop, null] : [null, knownTop];
  v.pending = [];
  // ce que l'adversaire sait (cartes qu'il a regardées) reste secret
  v.known = s.known?.filter((k) => k.to === seat && !hidden.has(k.uid));
  v.mods = v.mods.filter((m) => !hidden.has(m.uid));
  v.log = v.log.filter((l) => l.only === undefined || l.only === seat);
  v.history = v.history.map((h) => (h.player === seat ? h : { ...h, prompt: '', choice: '', label: '' }));
  if (v.decision && v.decision.player !== seat) {
    const d = v.decision;
    v.decision = { player: d.player, kind: d.kind, prompt: '', options: [], tag: d.tag, source: d.source !== undefined && hidden.has(d.source) ? undefined : d.source, inEffect: d.inEffect };
  }
  return v;
}
