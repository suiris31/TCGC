// IA simple : décisions de bon sens, sans simulation. Elle n'utilise que ce qu'un joueur voit : sa main, le terrain,
// les cartes de Vie face visible, la carte du deck adverse qu'il a regardée, et le nombre de cartes de l'adversaire
// (jamais sa main ni ses cartes cachées). Elle joue aussi la suite des parties simulées par l'IA Monte-Carlo.
import { DECKS } from '../engine/decks.ts';
import {
  attackAbility, attackTargets, baseCost, def, donOnField, fieldCards, fieldCost, findField, handCost, hasBlocker, hasType,
  leaderHasType, other, power, triggerEffect,
} from '../engine/rules.ts';
import type { Decision, FieldCard, GameState, Option, PlayerId } from '../engine/types.ts';
import { uselessReason } from './prune.ts';
import { styleOf, type Style } from './style.ts';

const uidOf = (o: Option) => Number(o.id.split(':')[1]);
const isCard = (o: Option) => o.uid !== undefined && o.id !== 'none';

function cardNum(s: GameState, uid: number): string | null {
  const f = findField(s, uid);
  if (f) return f.card.num;
  for (const P of s.players) {
    const c = [...P.hand, ...P.trash, ...P.life].find((x) => x.uid === uid);
    if (c) return c.num;
  }
  return null;
}

// Valeur d'une carte sur le terrain (à protéger ou à abattre)
function fieldValue(s: GameState, uid: number) {
  const f = findField(s, uid);
  if (!f) return 0;
  if (f.leader) return 20;
  return power(s, uid) / 1000 + Math.max(0, fieldCost(s, uid)) * 0.6 + (hasBlocker(s, f.player, f.card) ? 1.5 : 0);
}

// Valeur d'une carte en main (pour choisir quoi défausser ou quoi prendre)
function handValue(s: GameState, p: PlayerId, num: string) {
  const d = def(num);
  const nextDon = Math.min(10, donOnField(s, p) + 2);
  let v = 0;
  if (d.category === 'CHARACTER') v += 2 + (d.power ?? 0) / 2000 + ((d.cost ?? 0) <= nextDon ? 1 : 0);
  if (d.category === 'EVENT') v += d.onCounter ? 2.5 : 1.5;
  if (d.category === 'STAGE') v += s.players[p].stage ? 0.5 : 1.5;
  v += (d.counter ?? 0) / 1000;
  const copies = s.players[p].hand.filter((c) => c.num === num).length;
  return v - (copies >= 3 ? 1 : 0);
}

const canAttack = (s: GameState, p: PlayerId, card: FieldCard) => s.active === p && attackAbility(s, p, card).can;
const attackers = (s: GameState, p: PlayerId) => fieldCards(s, p).filter((f) => canAttack(s, p, f));
const oppCharsWhere = (s: GameState, p: PlayerId, pred: (c: FieldCard) => boolean) => s.players[other(p)].chars.filter(pred);

// Un Personnage adverse épuisé deviendrait battable si sa puissance baissait de `amount`
function enablesKo(s: GameState, p: PlayerId, amount: number) {
  for (const a of attackers(s, p)) {
    for (const t of attackTargets(s, p, a)) {
      if (findField(s, t)?.leader) continue;
      const gap = power(s, t) - power(s, a.uid);
      if (gap > 0 && gap <= amount) return true;
    }
  }
  return false;
}

const knowsTop = (s: GameState, p: PlayerId) => {
  const top = s.players[other(p)].deck[0];
  return s.peek[p] !== null && top?.uid === s.peek[p];
};

// Coût le plus probable de la carte du dessus du deck adverse : la carte regardée si on la connaît, sinon le coût le
// plus fréquent parmi les cartes du deck adverse qu'on n'a pas encore vues
function likelyTopCost(s: GameState, p: PlayerId): number {
  const O = s.players[other(p)];
  if (knowsTop(s, p)) return def(O.deck[0].num).cost ?? 0;
  const counts = new Map<number, number>();
  for (const [num, n] of Object.entries(DECKS[O.deckId].cards)) {
    const cost = def(num).cost;
    if (cost !== null) counts.set(cost, (counts.get(cost) ?? 0) + n);
  }
  for (const c of [...O.chars, ...(O.stage ? [O.stage] : []), ...O.trash, ...O.life.filter((x) => x.faceUp)]) {
    const cost = def(c.num).cost;
    if (cost !== null && counts.has(cost)) counts.set(cost, counts.get(cost)! - 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
}

// ---------- Phase principale ----------

type Timing = 'early' | 'late' | 'end' | null;

// Quand utiliser un effet [Activation : Principale] : avant les combats (il ouvre des attaques ou donne des DON!!),
// après avoir joué ses cartes, en fin de tour, ou pas du tout
const ABILITY: Record<string, (s: GameState, p: PlayerId, card: FieldCard) => Timing> = {
  'OP13-081': (s, p) => (s.players[p].donRested > 0 ? 'early' : null),
  'ST21-001': (s, p) => (s.players[p].chars.some((c) => canAttack(s, p, c)) ? 'early' : null),
  'ST31-005': (s, p) => (attackers(s, p).length ? 'early' : null),
  'ST23-004': (s, p) => (enablesKo(s, p, 1000) ? 'early' : null),
  'OP12-020': () => 'early',
  'OP12-026': (s, p) => {
    const opens = oppCharsWhere(s, p, (c) => !c.rested && baseCost(c.num) <= 4
      && (hasBlocker(s, other(p), c) || attackers(s, p).some((a) => power(s, a.uid) >= power(s, c.uid))));
    if (opens.length) return 'early';
    return s.players[p].donRested > 0 && canAttack(s, p, s.players[p].leader) ? 'early' : null;
  },
  'OP12-028': (s, p) => (s.players[p].hand.length < 8 ? 'late' : null),
  'OP12-046': (s, p) => {
    const targets = oppCharsWhere(s, p, (c) => fieldCost(s, c.uid) <= 5 && fieldCost(s, c.uid) >= 3);
    if (!targets.length) return null;
    return targets.some((c) => hasBlocker(s, other(p), c)) ? 'early' : 'late';
  },
  'OP11-066': (s, p, card) => (canAttack(s, p, card) ? 'end' : 'late'),
  'OP11-071': (s, p) => (knowsTop(s, p) && s.players[p].hand.length >= 3 ? 'late' : null),
  'ST36-005': (s, p) => (s.players[p].donRested > 0 && canAttack(s, p, s.players[p].leader) ? 'early' : null),
  'OP10-114': (s, p, card) => {
    const others = attackers(s, p).filter((a) => a.uid !== card.uid);
    const opens = oppCharsWhere(s, p, (c) => !c.rested && fieldCost(s, c.uid) <= 4
      && (hasBlocker(s, other(p), c) || others.some((a) => power(s, a.uid) >= power(s, c.uid))));
    return opens.length ? 'early' : null;
  },
};

function abilityTiming(s: GameState, p: PlayerId, uid: number): Timing {
  const f = findField(s, uid);
  if (!f) return null;
  return ABILITY[f.card.num] ? ABILITY[f.card.num](s, p, f.card) : 'late';
}

const fakeField = (s: GameState, num: string): FieldCard => ({ uid: -1, num, rested: false, don: 0, playedTurn: s.turn, usedOpt: [] });
const inHand = (s: GameState, p: PlayerId, pred: (num: string) => boolean) => s.players[p].hand.filter((c) => pred(c.num)).length;
const hasCost8 = (s: GameState, p: PlayerId) => s.players[p].chars.some((c) => fieldCost(s, c.uid) >= 8);
const SH = 'Straw Hat Crew';

// Bonus selon l'effet [Jouée] et la situation
const PLAY_BONUS: Record<string, (s: GameState, p: PlayerId) => number> = {
  // ST-35 : les cartes qui donnent un Personnage de coût 8 au Leader Sabo
  'OP12-093': (s, p) => (hasCost8(s, p) ? 0 : 3),
  'P-105': (s, p) => (hasCost8(s, p) ? 0 : 3),
  'ST35-005': (s, p) => (hasCost8(s, p) ? 0 : 3),
  'ST35-004': (s, p) => (hasCost8(s, p) ? 0 : 3),
  'OP13-081': (s, p) => (hasCost8(s, p) ? 0 : 3),
  'ST35-002': (s, p) => (s.players[other(p)].chars.length ? 0 : -2),
  'ST35-001': (s, p) => (oppCharsWhere(s, p, (c) => (def(c.num).power ?? 0) <= 2000).length ? 2 : 0),
  'OP13-008': (s, p) => (s.players[p].chars.length >= 3 ? -1 : 0),
  // ST-31
  'OP01-016': () => 1,
  'OP14-015': () => 1,
  'P-101': () => 0.5,
  'ST31-001': (s, p) => (inHand(s, p, (n) => n !== 'ST31-001' && def(n).category === 'CHARACTER' && hasType(n, SH) && (def(n).cost ?? 0) <= 5) ? 2.5 : 1),
  'ST31-002': (s, p) => 1 + (inHand(s, p, (n) => def(n).cost === 1 && def(n).category !== 'EVENT' && hasType(n, SH)) ? 1 : 0),
  'ST31-004': (s, p) => (s.players[other(p)].chars.length ? 1.5 : 0),
  'ST31-005': (s, p) => (s.players[p].stage ? -3 : 1.5),
  // ST-32
  'OP15-036': (s, p) => (oppCharsWhere(s, p, (c) => c.rested && fieldCost(s, c.uid) <= 4).length ? 3 : 0),
  'OP12-031': (s, p) => (oppCharsWhere(s, p, (c) => !c.rested && baseCost(c.num) <= 6).length ? 1 : 0),
  'ST24-005': (s, p) => (oppCharsWhere(s, p, (c) => !c.rested && fieldCost(s, c.uid) <= 5).length ? 1 : 0),
  'ST32-004': (s, p) => Math.min(2, oppCharsWhere(s, p, (c) => !c.rested && fieldCost(s, c.uid) <= 2).length),
  'ST32-005': (s, p) => (oppCharsWhere(s, p, (c) => !c.rested && fieldCost(s, c.uid) <= 2).length ? 1 : 0),
  'ST32-002': () => 1.5,
  'ST32-003': (s, p) => (inHand(s, p, (n) => def(n).category === 'CHARACTER' && (def(n).cost ?? 0) <= 5 && (def(n).attributes.includes('Slash') || def(n).names.includes('Perona'))) ? 3 : 0),
  'ST32-001': () => 1,
  // ST-33
  'EB04-026': (s, p) => (oppCharsWhere(s, p, (c) => fieldCost(s, c.uid) <= 1).length ? 2 : 0.5),
  'ST33-003': (s, p) => 1.5 * Math.min(2, oppCharsWhere(s, p, (c) => fieldCost(s, c.uid) <= 2).length),
  'ST33-005': (s, p) => (inHand(s, p, (n) => n !== 'ST33-005' && def(n).category === 'CHARACTER' && hasType(n, 'Navy') && (def(n).power ?? 0) <= 8000) ? 3 : 0),
  'OP12-046': (s, p) => (leaderHasType(s, p, 'Navy') ? 0 : -2),
  'OP12-047': () => 1,
  'ST33-001': () => 0.5,
  'OP12-043': (s, p) => (s.players[other(p)].chars.length ? 1 : 0),
  // ST-34
  'ST34-002': (s, p) => 0.5 + (oppCharsWhere(s, p, (c) => fieldCost(s, c.uid) <= 2).length ? 2 : 0),
  'EB03-035': (s, p) => (donOnField(s, p) <= donOnField(s, other(p)) ? 1 : 0),
  'ST34-004': () => 3,
  'EB03-032': () => 1,
  'ST34-003': () => 1,
  // ST-36
  'ST36-002': () => 2,
  'P-085': (s, p) => (s.players[p].life.length <= s.players[other(p)].life.length && oppCharsWhere(s, p, (c) => fieldCost(s, c.uid) <= 4 && fieldValue(s, c.uid) >= 5).length ? 2 : 0),
  'OP10-111': () => 1,
  'ST36-004': (s, p) => (inHand(s, p, (n) => hasType(n, 'Supernovas')) >= 2 ? 1.5 : 0),
  'OP10-103': () => -1,
};

function playScore(s: GameState, p: PlayerId, num: string, st: Style = styleOf(s.players[p].deckId, p)) {
  const d = def(num);
  const score = (d.cost ?? 0) + st.playPower * ((d.power ?? 0) / 2000) + (hasBlocker(s, p, fakeField(s, num)) ? 0.5 : 0);
  return score + st.playEffect * (PLAY_BONUS[num] ? PLAY_BONUS[num](s, p) : d.onPlay ? 0.5 : 0);
}

// Événements [Principale] : intérêt de l'activer maintenant (null : pas maintenant)
const EVENT_SCORE: Record<string, (s: GameState, p: PlayerId) => number | null> = {
  'OP13-019': (s, p) => (s.players[p].donActive >= 5 && oppCharsWhere(s, p, (c) => power(s, c.uid) - 3000 <= 3000 && fieldValue(s, c.uid) >= 6).length ? 5 : null),
  'OP13-021': (s, p) => (enablesKo(s, p, 2000) ? 3 : null),
  'OP12-039': (s, p) => {
    const L = s.players[p].leader;
    return L.rested && s.players[p].turns > 1 && power(s, L.uid) >= power(s, s.players[other(p)].leader.uid) ? 4 : null;
  },
  'EB04-028': (s, p) => {
    const threats = oppCharsWhere(s, p, (c) => power(s, c.uid) >= 5000 && power(s, c.uid) <= 10000);
    return s.players[p].hand.length >= 2 && threats.length >= 2 ? 3 : null;
  },
  'OP11-081': (s, p) => (knowsTop(s, p) && oppCharsWhere(s, p, (c) => baseCost(c.num) <= 8 && fieldValue(s, c.uid) >= 5).length ? 5 : null),
  'OP13-116': (s, p) => (s.players[p].hand.length <= 6 ? 1 : null),
};

// ---------- Plan d'attaque ----------

interface AttackPlan {
  attacker: FieldCard;
  target: number;
  need: number;   // DON!! à donner à l'attaquant avant d'attaquer
  value: number;
}

// Personnages qui gagnent [Initiative] avec des DON!! données (Sanji : 2)
const RUSH_DON: Record<string, number> = { 'ST31-001': 2 };

// Événement clé gardé en réserve : Zoro redressé par « Luffy deviendra un jour le roi des pirates !! » attaque deux fois
function keyReserve(s: GameState, p: PlayerId, st: Style): number {
  if (st.keyReserve < 0.5 || donOnField(s, p) < st.keyMinDon) return 0;
  const P = s.players[p];
  const L = P.leader;
  if (L.num === 'OP12-020' && !L.rested && canAttack(s, p, L) && P.hand.some((c) => c.num === 'OP12-039')) return 3;
  return 0;
}

// DON!! gardées pour payer des Événements [Contre] pendant le tour adverse (seulement ceux qui pourront servir)
function counterReserveDon(s: GameState, p: PlayerId, st: Style): number {
  const P = s.players[p];
  const usable = (num: string) => (num === 'OP11-079' ? knowsTop(s, p) : num === 'OP04-016' ? P.hand.length >= 2 : true);
  const costs = P.hand.filter((c) => def(c.num).onCounter && usable(c.num)).map((c) => def(c.num).cost ?? 0).sort((a, b) => a - b);
  return costs.slice(0, Math.round(st.counterReserve)).reduce((sum, c) => sum + c, 0);
}

// Choisit les attaques du tour et les DON!! à donner pour les gagner, dans la limite du budget de DON!!
function planAttacks(s: GameState, p: PlayerId, st: Style, budget: number): AttackPlan[] {
  const P = s.players[p];
  const O = s.players[other(p)];
  const candidates: AttackPlan[] = [];
  const ready: { card: FieldCard; extra: number; charsOnly: boolean }[] = attackers(s, p).map((card) => ({ card, extra: 0, charsOnly: attackAbility(s, p, card).charsOnly }));
  // [Initiative] obtenue avec des DON!! (Sanji)
  for (const c of P.chars) {
    const need = RUSH_DON[c.num];
    if (need !== undefined && !c.rested && c.playedTurn === s.turn && c.don < need && P.turns > 1) ready.push({ card: c, extra: need - c.don, charsOnly: false });
  }
  for (const { card: a, extra, charsOnly } of ready) {
    const targets = extra ? [O.leader.uid, ...O.chars.filter((c) => c.rested).map((c) => c.uid)] : attackTargets(s, p, a);
    for (const t of targets) {
      const tf = findField(s, t);
      if (!tf || (charsOnly && tf.leader)) continue;
      const base = Math.max(extra, Math.ceil((power(s, t) - (power(s, a.uid) + extra * 1000) + st.minEdge * 1000) / 1000) + extra);
      let need = Math.max(0, base);
      let value: number;
      if (tf.leader) {
        value = st.leaderAggro + (O.life.length <= 2 ? st.lethalBonus : 0) + (O.life.length === 0 ? 100 : 0);
      } else {
        value = st.charKill * fieldValue(s, t);
        // Leader Zoro : après avoir combattu un Personnage, il se redresse (3 DON!!) et attaque encore
        if (a.uid === P.leader.uid && a.num === 'OP12-020' && !a.usedOpt.includes('main')) {
          need = Math.max(need, 3 - a.don);
          value += st.leaderAggro;
        }
      }
      if (a.uid !== P.leader.uid && hasBlocker(s, p, a)) value -= st.keepBlockers;
      candidates.push({ attacker: a, target: t, need, value });
    }
  }
  candidates.sort((x, y) => y.value / (y.need + 1) - x.value / (x.need + 1) || y.value - x.value);
  const chosen: AttackPlan[] = [];
  const usedAttackers = new Set<number>();
  const usedTargets = new Set<number>();
  let left = budget;
  for (const c of candidates) {
    if (c.value <= 0 || usedAttackers.has(c.attacker.uid) || usedTargets.has(c.target)) continue;
    const isLeader = c.target === O.leader.uid;
    // DON!! en plus pour passer les Contres adverses, si le budget le permet
    const want = isLeader ? c.need + Math.round(st.overkill) : c.need;
    const give = want <= left ? want : c.need <= left ? c.need : -1;
    if (give < 0) continue;
    chosen.push({ ...c, need: give });
    left -= give;
    usedAttackers.add(c.attacker.uid);
    if (!isLeader) usedTargets.add(c.target);
  }
  // ordre : les Personnages visés d'abord (le Leader Zoro doit combattre un Personnage avant de se redresser), puis le
  // Leader adverse, les plus forts attaquants d'abord
  return chosen.sort((x, y) => Number(x.target === O.leader.uid) - Number(y.target === O.leader.uid) || y.value - x.value);
}

// Leaders dont l'effet demande une DON!! : on la donne en premier
function leaderDonFirst(s: GameState, p: PlayerId): boolean {
  const P = s.players[p];
  const L = P.leader;
  if (L.don > 0) return false;
  if (L.num === 'OP13-004') return P.chars.some((c) => fieldCost(s, c.uid) >= 8);
  if (L.num === 'ST21-001') return !L.usedOpt.includes('main') && P.chars.some((c) => canAttack(s, p, c));
  return false;
}

function chooseMain(s: GameState, d: Decision): string {
  const p = d.player;
  const P = s.players[p];
  const O = s.players[other(p)];
  const st = styleOf(P.deckId, p);
  const byPrefix = (prefix: string) => d.options.filter((o) => o.id.startsWith(prefix));
  const ability = (timing: Timing) => byPrefix('act:').find((o) => abilityTiming(s, p, o.uid!) === timing);
  const key = keyReserve(s, p, st);
  const budget = Math.max(0, P.donActive - key - counterReserveDon(s, p, st));

  // l'adversaire est presque battu : attaquer avant de dépenser ses DON!! en cartes
  const rush = O.life.length <= st.holdLife;
  if (rush) {
    const plan = planAttacks(s, p, st, P.donActive);
    const lethal = plan.filter((x) => x.target === O.leader.uid);
    for (const x of lethal) if (x.need > 0 && d.options.some((o) => o.id === `don:${x.attacker.uid}`)) return `don:${x.attacker.uid}`;
    for (const x of lethal) if (d.options.some((o) => o.id === `attack:${x.attacker.uid}:${x.target}`)) return `attack:${x.attacker.uid}:${x.target}`;
  }

  const early = ability('early');
  if (early) return early.id;

  // Jouer la meilleure carte abordable (Personnage, Lieu, ou Événement utile maintenant), sans toucher à la réserve de
  // l'Événement clé ; zone de Personnage pleine : seulement ce qui vaut nettement plus que le plus faible
  const weakest = P.chars.length >= 5 ? Math.min(...P.chars.map((c) => (def(c.num).cost ?? 0) + (def(c.num).power ?? 0) / 2000)) : -Infinity;
  let best: { id: string; score: number } | null = null;
  for (const o of byPrefix('play:')) {
    const card = P.hand.find((c) => c.uid === o.uid)!;
    const num = card.num;
    if (key && handCost(s, p, card) > P.donActive - key) continue;
    const score = playScore(s, p, num, st);
    if (def(num).category === 'CHARACTER' && P.chars.length >= 5 && score < weakest + 2.5) continue;
    if (score > 0 && (!best || score > best.score)) best = { id: o.id, score };
  }
  for (const o of byPrefix('event:')) {
    const card = P.hand.find((c) => c.uid === o.uid)!;
    if (key && card.num !== 'OP12-039' && handCost(s, p, card) > P.donActive - key) continue;
    if (uselessReason(s, d, o)) continue;
    const score = EVENT_SCORE[card.num] ? EVENT_SCORE[card.num](s, p) : 1;
    if (score !== null && (!best || score > best.score)) best = { id: o.id, score };
  }
  if (best) return best.id;

  const late = ability('late');
  if (late) return late.id;

  // DON!! d'abord sur le Leader dont l'effet en demande une (Sabo : +1000 à tous ; Luffy : son effet)
  if (budget > 0 && leaderDonFirst(s, p)) return `don:${P.leader.uid}`;

  // Attaques prévues : les DON!! nécessaires, puis les attaques dans l'ordre du plan
  const plan = planAttacks(s, p, st, budget);
  for (const x of plan) if (x.need > 0 && d.options.some((o) => o.id === `don:${x.attacker.uid}`)) return `don:${x.attacker.uid}`;
  // DON!! encore libres : sur une attaque prévue (le Leader adverse d'abord), pour forcer l'adversaire à contrer plus
  if (budget > 0 && st.dumpDon >= 0.5) {
    const onLeader = plan.filter((x) => x.target === O.leader.uid);
    const target = (onLeader.find((x) => x.attacker.uid === P.leader.uid) ?? onLeader[0] ?? plan[0])?.attacker;
    if (target && d.options.some((o) => o.id === `don:${target.uid}`)) return `don:${target.uid}`;
  }
  for (const x of plan) {
    const id = `attack:${x.attacker.uid}:${x.target}`;
    if (d.options.some((o) => o.id === id)) return id;
  }

  const end = ability('end');
  return end ? end.id : 'end';
}

// ---------- Combat ----------

function chooseBlocker(s: GameState, d: Decision): string {
  const b = s.battle!;
  const st = styleOf(s.players[d.player].deckId, d.player);
  const atk = power(s, b.attacker);
  const target = findField(s, b.target)!;
  const blocks = d.options.filter((o) => o.id.startsWith('block:')).sort((x, y) => fieldValue(s, uidOf(x)) - fieldValue(s, uidOf(y)));
  const survivors = blocks.filter((o) => power(s, uidOf(o)) > atk);
  if (atk < power(s, b.target)) return 'noblock';
  if (target.leader) {
    if (survivors.length) return survivors[0].id;
    if (s.players[d.player].life.length <= st.blockLife && blocks.length) return blocks[0].id;
    return 'noblock';
  }
  if (survivors.length && fieldValue(s, b.target) >= st.protectValue - 1) return survivors[0].id;
  return 'noblock';
}

function counterEventValue(s: GameState, p: PlayerId, num: string, targetUid: number): number {
  switch (num) {
    case 'OP13-019': return findField(s, targetUid)?.leader ? 3000 : 0;
    case 'OP12-098': return s.players[p].chars.some((c) => hasType(c.num, 'Revolutionary Army') && fieldCost(s, c.uid) >= 8) ? 4000 : 2000;
    case 'OP04-016': return s.players[p].hand.length >= 2 ? 3000 : 0;
    case 'OP12-057': return 4000;
    case 'OP11-079': return knowsTop(s, p) ? 5000 : 0;
    default: return 2000;
  }
}

// Contrer coûte des cartes ; prendre un coup sur le Leader en donne une (la Vie va en main) mais rapproche de la
// défaite. Les Événements [Contre] se paient avec des DON!! qui, pendant le tour adverse, ne servent à rien d'autre.
function chooseCounter(s: GameState, d: Decision): string {
  const b = s.battle!;
  const atk = power(s, b.attacker);
  const dp = power(s, b.target);
  if (atk < dp) return 'pass';
  const need = atk - dp + 1000;
  const target = findField(s, b.target)!;
  const P = s.players[d.player];
  const values = d.options
    .filter((o) => o.id !== 'pass' && !uselessReason(s, d, o))
    .map((o) => {
      const num = cardNum(s, uidOf(o))!;
      const event = o.id.startsWith('cevent:');
      const value = event ? counterEventValue(s, d.player, num, b.target) : def(num).counter ?? 0;
      return { o, value, event };
    })
    .filter((x) => x.value > 0);
  const total = values.reduce((sum, x) => sum + x.value, 0);
  if (total < need) return 'pass';
  // une seule carte suffit, et c'est un Événement payé avec des DON!! inutilisées
  const cheapEvent = values.some((x) => x.event && x.value >= need);
  const st = styleOf(P.deckId, d.player);
  const life = P.life.length;
  const value = fieldValue(s, b.target);
  const small = st.counterSmall * 1000;
  const worth = target.leader
    ? life <= st.counterLife || (life <= st.counterMid && need <= small + 1000) || (need <= small && (P.hand.length >= 5 || cheapEvent))
      || (life <= st.counterMid + 1 && cheapEvent)
    : (value >= st.protectValue && need <= small) || (value >= st.protectValue + 2 && need <= small * 2) || (value >= st.protectValue - 1 && cheapEvent);
  if (!worth) return 'pass';
  // la plus petite carte suffisante (un Événement plutôt qu'un Personnage à valeur égale), sinon la plus forte
  const enough = values.filter((x) => x.value >= need).sort((x, y) => x.value - y.value || Number(y.event) - Number(x.event))[0];
  return (enough ?? values.sort((x, y) => y.value - x.value)[0]).o.id;
}

// ---------- Choix pendant les effets ----------

// [Déclenchement] : vaut-il mieux l'activer que prendre la carte en main ? (par défaut oui)
const TRIGGER_WORTH: Record<string, (s: GameState, p: PlayerId) => boolean> = {
  'ST36-002': (s, p) => s.players[other(p)].life.length <= 3,
  'P-088': (s, p) => leaderHasType(s, p, 'Supernovas') && s.players[0].life.length + s.players[1].life.length <= 5,
  'OP12-057': () => false,
  'OP11-079': () => false,
  'OP12-039': (s, p) => s.battle !== null && s.active !== p,
};

const amountIn = (prompt: string) => Number(prompt.match(/[−-](\d+)/)?.[1] ?? 0);

function chooseOppPower(s: GameState, d: Decision, cards: Option[]): string {
  const p = d.player;
  const b = s.battle;
  // Pendant une attaque adverse : affaiblir l'attaquant
  if (b && s.active !== p) {
    const atk = cards.find((o) => uidOf(o) === b.attacker);
    if (atk) return atk.id;
  }
  // Pendant sa propre attaque sur un Personnage : affaiblir la cible
  const amount = amountIn(d.prompt);
  if (b && s.active === p) {
    const target = cards.find((o) => uidOf(o) === b.target && !findField(s, b.target)?.leader);
    if (target && power(s, b.target) - amount <= power(s, b.attacker)) return target.id;
  }
  // Pendant son tour : rendre battable un Personnage adverse épuisé, le plus précieux d'abord
  const best = Math.max(0, ...attackers(s, p).map((a) => power(s, a.uid)));
  const opens = cards.filter((o) => {
    const f = findField(s, uidOf(o));
    return f && !f.leader && f.card.rested && power(s, uidOf(o)) - amount <= best;
  });
  const pool = opens.length ? opens : cards.filter((o) => !findField(s, uidOf(o))?.leader);
  return ([...pool].sort((a, c) => fieldValue(s, uidOf(c)) - fieldValue(s, uidOf(a)))[0] ?? cards[0] ?? d.options[0]).id;
}

const refundReady = (s: GameState, p: PlayerId) => s.active === p && s.players[p].chars.some((c) => c.num === 'ST34-001' && !c.usedOpt.includes('katakuriDon'));

function chooseEffect(s: GameState, d: Decision): string {
  const p = d.player;
  const P = s.players[p];
  const O = s.players[other(p)];
  const cards = d.options.filter(isCard);
  const byValue = (desc: boolean) => [...cards].sort((a, b) => (fieldValue(s, uidOf(b)) - fieldValue(s, uidOf(a))) * (desc ? 1 : -1));
  const numOf = (o: Option) => o.num ?? cardNum(s, uidOf(o))!;
  const byHand = (desc: boolean) => [...cards].sort((a, b) => (handValue(s, p, numOf(b)) - handValue(s, p, numOf(a))) * (desc ? 1 : -1));
  const yesNo = (yes: boolean) => (yes ? 'yes' : 'no');
  const first = () => (d.options.find((o) => o.id !== 'none' && o.id !== 'no') ?? d.options[0]).id;
  switch (d.tag) {
    case 'mayBetty':
      return yesNo(O.chars.some((c) => fieldCost(s, c.uid) >= 8) && P.deck.length >= 12);
    case 'mayCorbeau':
      return yesNo(O.hand.length >= 7 && P.deck.length >= 12);
    case 'lifeToHand':
      return P.life.length >= 4 ? 'top' : 'no';
    case 'donTarget': {
      // Le Leader s'il peut attaquer, sinon le Personnage prêt à attaquer le plus fort
      const ready = cards.filter((o) => canAttack(s, p, findField(s, uidOf(o))!.card)).sort((a, b) => power(s, uidOf(b)) - power(s, uidOf(a)));
      const leader = cards.find((o) => uidOf(o) === P.leader.uid);
      return (ready.find((o) => uidOf(o) === P.leader.uid) ?? ready[0] ?? leader ?? cards[0]).id;
    }
    case 'oppCost':
      return ([...cards].sort((a, b) => fieldCost(s, uidOf(b)) - fieldCost(s, uidOf(a)))[0] ?? d.options[0]).id;
    case 'oppPower':
      return chooseOppPower(s, d, cards);
    case 'ownPower': {
      const b = s.battle;
      const pick = b && cards.find((o) => uidOf(o) === (s.active === p ? b.attacker : b.target));
      const ready = cards.find((o) => canAttack(s, p, findField(s, uidOf(o))!.card));
      return (pick ?? ready ?? cards[0] ?? d.options[0]).id;
    }
    case 'oppRest': {
      // Épuiser d'abord les [Bloqueur], puis ce que nos attaquants peuvent battre
      const best = Math.max(0, ...attackers(s, p).map((a) => power(s, a.uid)));
      const restBlocker = styleOf(P.deckId, p).restBlocker;
      const score = (o: Option) => {
        const f = findField(s, uidOf(o))!;
        return (hasBlocker(s, f.player, f.card) ? restBlocker : 0) + (power(s, f.card.uid) <= best ? fieldValue(s, f.card.uid) : 0.1);
      };
      return ([...cards].sort((a, b) => score(b) - score(a))[0] ?? d.options[0]).id;
    }
    case 'oppKo':
    case 'oppRemove':
    case 'oppLock':
    case 'oppBase0':
      return (byValue(true)[0] ?? d.options[0]).id;
    case 'bounce': {
      const opp = byValue(true).filter((o) => findField(s, uidOf(o))?.player !== p);
      return (opp[0] ?? d.options.find((o) => o.id === 'none') ?? d.options[0]).id;
    }
    case 'oppToLife': {
      const top = byValue(true)[0];
      return top && fieldValue(s, uidOf(top)) >= 5 ? top.id : 'none';
    }
    case 'lifeSideOpp':
      return 'lifeBottom';
    case 'playFree': {
      const score = (o: Option) => playScore(s, p, cardNum(s, o.uid!)!) + (o.id.startsWith('trash:') ? 0.5 : 0);
      return ([...cards].sort((a, b) => score(b) - score(a))[0] ?? d.options[0]).id;
    }
    case 'fullZone':
      return (byValue(false)[0] ?? d.options[0]).id;
    case 'discard':
      return (byHand(false)[0] ?? d.options[0]).id;
    case 'pick':
      return (byHand(true)[0] ?? d.options[0]).id;
    case 'trigger': {
      const num = d.options.find((o) => o.id === 'trigger')?.num;
      return num && TRIGGER_WORTH[num] && !TRIGGER_WORTH[num](s, p) ? 'hand' : 'trigger';
    }
    case 'declareCost':
      return `cost:${likelyTopCost(s, p)}`;
    case 'mayDiscard':
      return yesNo(P.hand.length >= 1);
    case 'kinemonCost':
      if (d.options.some((o) => o.id === 'leader') && P.turns <= 1) return 'leader';
      return d.options.some((o) => o.id === 'don') ? 'don' : 'no';
    case 'mayKatakuri': {
      const b = s.battle;
      const flips = b && s.active !== p && b.target === P.leader.uid && power(s, b.attacker) >= power(s, b.target) && power(s, b.attacker) < power(s, b.target) + 1000;
      return yesNo(refundReady(s, p) || Boolean(flips) || donOnField(s, p) >= 9);
    }
    case 'mayPekoms': {
      const target = O.chars.some((c) => (def(c.num).power ?? 0) <= 2000 && fieldValue(s, c.uid) >= 3);
      return yesNo(refundReady(s, p) || target || donOnField(s, p) >= 9);
    }
    case 'ownReady': {
      const sorted = [...cards].sort((a, b) => {
        const fa = findField(s, uidOf(a))!.card;
        const fb = findField(s, uidOf(b))!.card;
        return Number(fb.rested) - Number(fa.rested) || power(s, fb.uid) - power(s, fa.uid);
      });
      return (sorted[0] ?? d.options[0]).id;
    }
    case 'kiddRedirect': {
      const b = s.battle;
      if (!b) return 'no';
      const atk = power(s, b.attacker);
      const kidds = fieldCards(s, p).filter((c) => def(c.num).names.includes('Eustass"Captain"Kid') && c.uid !== b.target && (def(c.num).power ?? 0) >= 5000);
      return atk >= power(s, b.target) && kidds.some((c) => power(s, c.uid) > atk) ? first() : 'no';
    }
    case 'kiddTarget':
      return (byValue(true)[0] ?? d.options[0]).id;
    case 'begeLife':
      return P.hand.some((c) => def(c.num).category === 'CHARACTER' && hasType(c.num, 'Supernovas') && triggerEffect(c.num)) ? 'top' : 'no';
    case 'toLife': {
      const withTrigger = cards.filter((o) => triggerEffect(cardNum(s, uidOf(o))!));
      return (withTrigger[0] ?? byHand(false)[0] ?? d.options[0]).id;
    }
    default:
      return (d.options.find((o) => o.id === 'yes') ?? d.options.find((o) => o.id.startsWith('replace:')) ?? d.options.find((o) => o.id !== 'none' && o.id !== 'no') ?? d.options[0]).id;
  }
}

export function heuristicChooser(s: GameState, d: Decision): string {
  switch (d.kind) {
    case 'mulligan': {
      const cheap = s.players[d.player].hand.filter((c) => def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) <= 4).length;
      return cheap >= styleOf(s.players[d.player].deckId, d.player).mulliganCheap ? 'keep' : 'mulligan';
    }
    case 'main':
      return chooseMain(s, d);
    case 'blocker':
      return chooseBlocker(s, d);
    case 'counter':
      return chooseCounter(s, d);
    case 'effect':
      return chooseEffect(s, d);
  }
}
