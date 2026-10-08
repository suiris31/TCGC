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
// - les modifications qui visent une carte cachée ;
// - ce qui trahirait indirectement la main adverse : l'ordre de sa main (ordre d'arrivée des cartes), ses décisions
//   de Contre et ses questions au milieu d'un effet (elles n'existent que s'il a une carte qui le permet : le fait
//   même qu'il y ait eu une question en dirait trop), l'étiquette et la carte source de sa décision en cours.
// Ce qui reste visible : les cartes qu'une décision du joueur lui montre (cartes regardées, choisies...), la carte
// du dessus du deck adverse s'il l'a regardée, et les cartes de sa propre main que l'adversaire connaît (révélées).
import { HIDDEN } from './cards/index.ts';
import { knows } from './rules.ts';
import type { Card, Decision, GameState, PlayerId } from './types.ts';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// Identifiants des cartes que la décision en cours du joueur lui montre : la carte (uid) et la cible (target) de chaque
// option. Toute option qui désigne une carte les renseigne. Les nombres de l'identifiant d'une option ne sont pas lus :
// « cost:4 » (coût déclaré) ou « choice:1 » (effet choisi) ne désignent pas les cartes 4 et 1, et les lire comme tels
// montrait des cartes cachées (cartes d'identifiant 0 à 10).
function shownBy(d: Decision | null, seat: PlayerId): Set<number> {
  const shown = new Set<number>();
  if (!d || d.player !== seat) return shown;
  for (const o of d.options) {
    if (o.uid !== undefined) shown.add(o.uid);
    if (o.target !== undefined) shown.add(o.target);
  }
  for (const c of d.cards ?? []) shown.add(c.uid);
  return shown;
}

// Décisions de l'adversaire dont l'existence ne dépend que de ce qui est public (sa phase principale, son mulligan, un
// [Bloqueur] visible sur son terrain) ; les autres (Contre, questions d'un effet) ne sont pas montrées
const PUBLIC_KINDS: Decision['kind'][] = ['mulligan', 'main', 'blocker'];

export function viewFor(s: GameState, seat: PlayerId): GameState {
  // copie JSON : l'état est un objet JSON simple (le moteur le copie déjà ainsi pour ses instantanés) et cette copie
  // est deux fois plus rapide que structuredClone (mesuré : game/rl/bench.ts)
  const v = JSON.parse(JSON.stringify(s)) as GameState;
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
  // main adverse : les cartes connues d'abord (par numéro), puis les cartes cachées ; l'ordre d'arrivée n'est pas public
  const handKnown = O.hand.filter(known).sort((a, b) => (a.num < b.num ? -1 : a.num > b.num ? 1 : 0));
  O.hand = [...handKnown, ...mask(O.hand.filter((c) => !known(c)), 1000, () => false)];
  O.deck = mask(O.deck, 2000, (c) => c.uid === knownTop || known(c));
  O.life = mask(O.life, 3000, (c) => Boolean(c.faceUp) || known(c));
  P.deck = mask(P.deck, 4000, known);
  P.life = mask(P.life, 5000, (c) => Boolean(c.faceUp) || known(c));

  delete O.list;  // la liste du deck adverse est secrète
  v.rng = 0;
  v.nextUid = 0;
  v.peek = seat === 0 ? [knownTop, null] : [null, knownTop];
  v.pending = [];
  // ce que l'adversaire sait (cartes qu'il a regardées) reste secret, sauf les cartes de la main du joueur qui ont été
  // révélées : il sait que l'adversaire les connaît
  const myHand = new Set(P.hand.map((c) => c.uid));
  v.known = s.known?.filter((k) => !hidden.has(k.uid) && (k.to === seat || (k.to === opp && k.zone === 'hand' && myHand.has(k.uid))));
  v.mods = v.mods.filter((m) => !hidden.has(m.uid));
  v.log = v.log.filter((l) => l.only === undefined || l.only === seat);
  v.history = v.history.filter((h) => h.player === seat || PUBLIC_KINDS.includes(h.kind))
    .map((h) => (h.player === seat ? h : { ...h, tag: undefined, prompt: '', choice: '', label: '' }));
  if (v.decision && v.decision.player !== seat) {
    v.decision = { player: v.decision.player, kind: v.decision.kind, prompt: '', options: [] };
  }
  return v;
}
