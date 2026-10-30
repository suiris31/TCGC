// Ce qui s'est passé entre deux états de la partie, déduit en les comparant (fonction pure, sans React ni DOM, testée
// par game/tests/table-events.test.ts) : cartes arrivées sur le terrain ou parties (KO...), cartes piochées, DON!!
// données ou gagnées, puissance, Vie, attaque, Contre, Événement activé, [Déclenchement], nouveau tour. Les effets du
// plateau (Fx.tsx) s'en servent ; le moteur ne change pas.
// Le journal n'est pas lu : il dit la même chose en phrases, et une carte s'y retrouvait par son nom (deux cartes
// peuvent porter le même). En ligne, les cartes cachées (main adverse, decks, Vies face cachée) ont un identifiant qui
// dépend de leur place (engine/view.ts) : une carte qui en sort est reconnue à ce qu'elle n'était visible nulle part.
// Une activation se reconnaît au choix que proposait la décision d'avant (et aux DON!! payées) ; une défausse par un
// effet n'en est pas une. Vérifié contre l'ancienne lecture du journal sur 120 parties simulées (R2.9) : mêmes
// annonces, plus les [Déclenchement] dont la carte n'était dans aucune zone (l'ancienne recherche par nom les ratait).
import { def, findField, hasKeyword, power } from '../../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../../engine/types.ts';

// Où va une carte qui quitte le terrain : Défausse (KO), main, Vie, deck, ou ailleurs (zone cachée en ligne)
export type LeftTo = 'trash' | 'hand' | 'life' | 'deck' | 'gone';

export type TableEvent =
  | { kind: 'left'; uid: number; num: string; owner: PlayerId; to: LeftTo }
  | { kind: 'entered'; uid: number; owner: PlayerId }        // carte jouée (ou arrivée) sur le terrain
  | { kind: 'drawn'; uid: number }                           // carte arrivée dans ta main
  | { kind: 'don'; uid: number; owner: PlayerId; count: number }      // DON!! données à une carte
  | { kind: 'power'; uid: number; owner: PlayerId; delta: number }    // puissance changée par un effet (≥ 1000)
  | { kind: 'life'; player: PlayerId; leader: number; delta: number } // Vie perdue (< 0) ou gagnée
  | { kind: 'donGained'; player: PlayerId; count: number }            // nouvelles DON!! (phase DON!!, effets)
  | { kind: 'attack'; attacker: number; target: number }
  | { kind: 'counter'; player: PlayerId; uid: number; num: string }   // Contre d'un Personnage défaussé
  | { kind: 'activate'; player: PlayerId; uid: number; num: string; timing: 'main' | 'counter' | 'trigger' }
  | { kind: 'turn'; player: PlayerId; turn: number };

const PLAYERS: PlayerId[] = [0, 1];

function fieldOf(s: GameState, p: PlayerId): Card[] {
  const P = s.players[p];
  return [P.leader, ...P.chars, ...(P.stage ? [P.stage] : [])];
}

function fieldUids(s: GameState): Map<number, PlayerId> {
  const m = new Map<number, PlayerId>();
  for (const p of PLAYERS) for (const c of fieldOf(s, p)) m.set(c.uid, p);
  return m;
}

// Toutes les cartes visibles d'un joueur (un identifiant de carte cachée ne désigne pas la carte : il est exclu)
function visibleUids(s: GameState, p: PlayerId): Set<number> {
  const P = s.players[p];
  return new Set([...fieldOf(s, p), ...P.hand, ...P.trash, ...P.life, ...P.deck].filter((c) => c.uid >= 0).map((c) => c.uid));
}

const donCount = (s: GameState, p: PlayerId) => {
  const P = s.players[p];
  return P.donActive + P.donRested + [P.leader, ...P.chars].reduce((n, c) => n + c.don, 0);
};

// Cartes arrivées dans la Défausse ou sur le terrain d'un joueur, et d'où elles viennent : de sa main, de sa Vie,
// d'une autre zone visible (terrain, deck), ou d'une zone cachée (ou d'aucune zone : carte de Vie révélée pendant son
// [Déclenchement])
interface Arrival { card: Card; from: 'hand' | 'life' | 'seen' | 'hidden'; trash: boolean }

function arrivals(a: GameState, b: GameState, p: PlayerId): Arrival[] {
  const A = a.players[p];
  const B = b.players[p];
  const hand = new Set(A.hand.map((c) => c.uid));
  const life = new Set(A.life.map((c) => c.uid));
  const field = new Set(fieldOf(a, p).map((c) => c.uid));
  const trash = new Set(A.trash.map((c) => c.uid));
  const seen = visibleUids(a, p);
  const from = (c: Card): Arrival['from'] => (hand.has(c.uid) ? 'hand' : life.has(c.uid) ? 'life' : seen.has(c.uid) ? 'seen' : 'hidden');
  const out: Arrival[] = [];
  for (const c of B.trash) if (!trash.has(c.uid)) out.push({ card: c, from: from(c), trash: true });
  for (const c of [...B.chars, ...(B.stage ? [B.stage] : [])]) if (!field.has(c.uid)) out.push({ card: c, from: from(c), trash: false });
  return out;
}

// Événements [Principale] ou [Contre] activés, Contres de Personnage, [Déclenchement] d'un joueur
function activations(a: GameState, b: GameState, p: PlayerId): TableEvent[] {
  const A = a.players[p];
  const B = b.players[p];
  const out: TableEvent[] = [];
  const battle = a.battle;
  const defender = battle ? findField(a, battle.target)?.player : undefined;
  const counterStep = battle?.step === 'counter' && defender === p;
  // cartes montrées par la question en cours (carte de Vie révélée pendant son [Déclenchement], cartes regardées) :
  // déjà annoncées, ou pas jouées
  const shown = new Set((a.decision?.cards ?? []).map((c) => c.uid));
  const list = arrivals(a, b, p).filter((x) => x.from !== 'seen' && !shown.has(x.card.uid));
  // question d'un [Déclenchement] visible : traitée plus bas, par le choix fait
  const asked = a.decision?.tag === 'trigger' && a.decision.player === p;
  // Une carte cachée qui arrive vient de la main pendant un Contre sans Vie perdue (l'Événement peut faire piocher), ou
  // tant que la main a perdu assez de cartes ; sinon de la Vie ou d'aucune zone (la carte de Vie révélée par un
  // [Déclenchement] n'est dans aucune zone pendant son effet)
  const lifeLost = B.life.length < A.life.length;
  let handLeft = Math.max(0, A.hand.length - B.hand.length) - list.filter((x) => x.from === 'hand').length;
  const origin = (x: Arrival): 'hand' | 'life' => {
    if (x.from === 'hand' || (counterStep && !lifeLost)) return 'hand';
    if (x.from === 'life') return 'life';
    if (handLeft > 0) {
      handLeft--;
      return 'hand';
    }
    return 'life';
  };
  // Un Événement s'active (et un Personnage contre) par un choix du joueur que sa décision proposait ; une carte de la
  // main défaussée par un effet (coût d'une capacité...) vient d'une autre question. La décision de l'adversaire, en
  // ligne, est masquée (sans ses choix) : sa phase principale, ou sa décision pendant son Contre.
  const d0 = a.decision?.player === p ? a.decision : null;
  const masked = Boolean(d0 && !d0.options.length);
  const offered = (id: string) => Boolean(d0 && (masked ? d0.kind === 'main' || counterStep : d0.options.some((o) => o.id === id)));
  const paid = A.donActive - B.donActive;  // DON!! redressées épuisées pour payer (l'effet peut en donner ensuite)
  // décision masquée : une carte défaussée par un effet (pendant un Événement [Contre]...) n'est ni un Contre ni une
  // activation
  const discarded = A.discardedTurn !== B.discardedTurn;
  let activated = false;
  for (const x of list) {
    const d = def(x.card.num);
    const at = origin(x);
    const uid = x.card.uid;
    if (at === 'hand' && x.trash && d.category === 'EVENT' && !activated && (offered(`event:${uid}`) || offered(`cevent:${uid}`)) && paid >= (d.cost ?? 0) && (!masked || !discarded)) {
      // l'Événement activé va dans la Défausse avant son effet : le premier arrivé (une défausse vient après)
      activated = true;
      out.push({ kind: 'activate', player: p, uid: x.card.uid, num: x.card.num, timing: counterStep ? 'counter' : 'main' });
    } else if (at === 'hand' && x.trash && d.category === 'CHARACTER' && counterStep && offered(`counter:${uid}`) && (!masked || !discarded)) {
      out.push({ kind: 'counter', player: p, uid: x.card.uid, num: x.card.num });
    } else if (at === 'life' && d.trigger && battle && defender === p && !asked && !banish(a)) {
      out.push({ kind: 'activate', player: p, uid: x.card.uid, num: x.card.num, timing: 'trigger' });
    }
  }
  // [Déclenchement] choisi à sa question (décision visible : la tienne, ou toutes contre l'IA) : annoncé tout de suite,
  // même si la carte va dans la main ou si son effet pose une question (elle n'est alors dans aucune zone)
  if (asked) {
    const chosen = b.history.slice(a.history.length).some((h) => h.player === p && h.tag === 'trigger' && h.choice === 'trigger');
    const num = a.decision!.options.find((o) => o.id === 'trigger')?.num;
    if (chosen && num) {
      const there = [...B.hand, ...B.trash, ...B.chars, ...(b.decision?.cards ?? [])].filter((c) => c.num === num).at(-1);
      out.push({ kind: 'activate', player: p, uid: there?.uid ?? -1, num, timing: 'trigger' });
    }
  }
  return out;
}

// [Exil] : les cartes de Vie touchées vont dans la Défausse, sans [Déclenchement]
function banish(s: GameState): boolean {
  const f = s.battle ? findField(s, s.battle.attacker) : null;
  return Boolean(f && hasKeyword(s, f.player, f.card, 'Banish'));
}

// seat : ta place (les cartes piochées sont celles de ta main). Dans l'ordre où les effets les montrent.
export function tableEvents(a: GameState, b: GameState, seat: PlayerId): TableEvent[] {
  const out: TableEvent[] = [];
  const before = fieldUids(a);
  const after = fieldUids(b);
  // cartes qui ont quitté le terrain (pas le Leader, qui ne part jamais)
  for (const [uid, owner] of before) {
    if (after.has(uid)) continue;
    const num = fieldOf(a, owner).find((c) => c.uid === uid)?.num;
    if (!num || a.players[owner].leader.uid === uid) continue;
    const P = b.players[owner];
    const has = (cards: Card[]) => cards.some((c) => c.uid === uid);
    const to: LeftTo = has(P.trash) ? 'trash' : has(P.hand) ? 'hand' : has(P.life) ? 'life' : has(P.deck) ? 'deck' : 'gone';
    out.push({ kind: 'left', uid, num, owner, to });
  }
  // cartes arrivées sur le terrain, puis dans ta main
  for (const [uid, owner] of after) if (!before.has(uid)) out.push({ kind: 'entered', uid, owner });
  const handBefore = new Set(a.players[seat].hand.map((c) => c.uid));
  for (const c of b.players[seat].hand) if (!handBefore.has(c.uid)) out.push({ kind: 'drawn', uid: c.uid });
  // DON!! données et puissance (pas au changement de tour, ni la puissance qui retombe à la fin d'un combat)
  const turnChanged = a.turn !== b.turn || a.active !== b.active;
  const battleEnded = Boolean(a.battle) && !b.battle;
  for (const [uid, owner] of after) {
    if (!before.has(uid)) continue;
    const fa = findField(a, uid)!;
    const fb = findField(b, uid)!;
    const dDon = fb.card.don - fa.card.don;
    if (dDon > 0) out.push({ kind: 'don', uid, owner, count: dDon });
    if (fb.stage || turnChanged || dDon !== 0 || (battleEnded && power(b, uid) < power(a, uid))) continue;
    const dp = power(b, uid) - power(a, uid);
    if (Math.abs(dp) >= 1000) out.push({ kind: 'power', uid, owner, delta: dp });
  }
  // Vies (sauf la mise en place, après les mains de départ)
  if (a.flow.stage !== 'mulligan') {
    for (const p of PLAYERS) {
      const delta = b.players[p].life.length - a.players[p].life.length;
      if (delta) out.push({ kind: 'life', player: p, leader: b.players[p].leader.uid, delta });
    }
  }
  // nouvelles DON!! (phase DON!! ou effets)
  for (const p of PLAYERS) {
    const gained = donCount(b, p) - donCount(a, p);
    if (gained > 0) out.push({ kind: 'donGained', player: p, count: gained });
  }
  if (!a.battle && b.battle) out.push({ kind: 'attack', attacker: b.battle.attacker, target: b.battle.target });
  for (const p of PLAYERS) out.push(...activations(a, b, p));
  if (a.turn !== b.turn && b.turn > 0 && b.flow.stage !== 'mulligan') out.push({ kind: 'turn', player: b.active, turn: b.turn });
  return out;
}
