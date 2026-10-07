// Moteur de partie : préparation, tours, combats et résolution des effets, selon les règles complètes.
// Le moteur avance tout seul jusqu'à la prochaine décision d'un joueur (state.decision).
// - act(state, choix) : applique la décision d'un joueur (partie humaine) et renvoie le nouvel état
// - advance(state, chooser) : fait jouer toutes les décisions par une fonction (IA, simulations)
import { DECKS } from './decks.ts';
import { random, shuffle } from './rng.ts';
import {
  addMod, allField, attackTargets, canBeRested, def, describe, donTotal, draw, emit, fieldCards, findField, handCost, hasBlocker,
  hasKeyword, koCharacter, log, name, onField, other, payDon, playCharacter, power, restForAttack, triggerEffect, untapDon,
} from './rules.ts';
import type {
  Decision, EffectCtx, GameState, HistoryEntry, Option, PendingEffect, PlayerId, PlayerState,
} from './types.ts';

export type Chooser = (s: GameState, d: Decision) => string;

class NeedDecision {
  decision: Decision;
  constructor(decision: Decision) {
    this.decision = decision;
  }
}

export interface NewGameOptions {
  decks: [string, string];
  names: [string, string];
  seed?: number;
  first?: PlayerId | 'random';
}

// ---------- Préparation (5-2) ----------

function makePlayer(s: GameState, deckId: string, playerName: string): PlayerState {
  const deck = DECKS[deckId];
  if (!deck) throw new Error(`Deck inconnu : ${deckId}`);
  const cards = Object.entries(deck.cards).flatMap(([num, n]) => Array.from({ length: n }, () => ({ uid: s.nextUid++, num })));
  return {
    name: playerName,
    deckId,
    leader: { uid: s.nextUid++, num: deck.leader, rested: false, don: 0, playedTurn: 0, usedOpt: [] },
    deck: cards,
    hand: [],
    trash: [],
    life: [],
    chars: [],
    stage: null,
    donDeck: donTotal(deck.leader),
    donActive: 0,
    donRested: 0,
    turns: 0,
    discardedTurn: 0,
  };
}

export function newGame(opts: NewGameOptions, chooser?: Chooser): GameState {
  const s = {
    rng: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    nextUid: 1,
    turn: 0,
    active: 0,
    first: 0,
    mods: [],
    delayed: [],
    peek: [null, null],
    battle: null,
    flow: { stage: 'mulligan', player: 0 },
    pending: [],
    decision: null,
    winner: null,
    winReason: null,
    log: [],
    history: [],
  } as unknown as GameState;
  s.players = [makePlayer(s, opts.decks[0], opts.names[0]), makePlayer(s, opts.decks[1], opts.names[1])];
  const first: PlayerId = opts.first === 0 || opts.first === 1 ? opts.first : random(s) < 0.5 ? 0 : 1;
  s.first = first;
  s.active = first;
  for (const p of [0, 1] as PlayerId[]) shuffle(s, s.players[p].deck);
  s.flow = { stage: 'setup' };
  return advance(s, chooser);
}

// ---------- Boucle principale ----------

export function advance(s: GameState, chooser?: Chooser): GameState {
  for (let guard = 0; guard < 50000; guard++) {
    checkDefeat(s);
    if (s.winner !== null) {
      s.flow = { stage: 'over' };
      s.decision = null;
      s.pending = [];
      s.battle = null;
      return s;
    }
    if (s.decision) {
      if (!chooser) return s;
      const choice = chooser(s, s.decision);
      if (s.decision.inEffect) s = replayEffect(s, choice);
      else applyDecision(s, choice);
      continue;
    }
    if (s.pending.length) {
      resolvePending(s, chooser);
      continue;
    }
    stepFlow(s);
  }
  throw new Error('Le moteur ne progresse plus (boucle infinie ?)');
}

// Décision d'un joueur : renvoie un nouvel état (l'ancien n'est pas modifié). Avec un chooser, la suite de la partie
// est jouée par celui-ci (simulations).
export function act(state: GameState, choice: string, chooser?: Chooser): GameState {
  const d = state.decision;
  if (!d) throw new Error('Aucune décision attendue');
  if (!d.options.some((o) => o.id === choice)) throw new Error(`Choix invalide : ${choice}`);
  if (d.inEffect) return advance(replayEffect(state, choice), chooser);
  const s = structuredClone(state);
  applyDecision(s, choice);
  return advance(s, chooser);
}

// Décision au milieu d'un effet : on rejoue l'effet depuis son début avec la nouvelle réponse
function replayEffect(state: GameState, choice: string): GameState {
  const d = state.decision!;
  const p = state.pending[0];
  const s = JSON.parse(p.snapshot!) as GameState;
  s.pending[0].snapshot = p.snapshot;
  s.pending[0].answers = [...p.answers, choice];
  s.history = [...state.history, historyEntry(state, d, choice)];
  s.decision = null;
  return s;
}

function historyEntry(s: GameState, d: Decision, choice: string): HistoryEntry {
  return {
    turn: s.turn,
    player: d.player,
    kind: d.kind,
    tag: d.tag,
    prompt: d.prompt,
    choice,
    label: d.options.find((o) => o.id === choice)?.label ?? choice,
  };
}

// Défaite (9-2) : plus de cartes dans le deck (les dégâts sans Vie sont traités pendant les dégâts). Certains Leaders
// changent cette règle : victoire à deck vide, ou défaite seulement à la fin du tour (voir endOfTurnDefeat).
function checkDefeat(s: GameState) {
  if (s.winner !== null || s.flow.stage === 'setup' || s.flow.stage === 'mulligan') return;
  for (const p of [s.active, other(s.active)]) {
    if (s.players[p].deck.length !== 0) continue;
    const rule = def(s.players[p].leader.num).rules?.deckOut;
    if (rule === 'loseAtEndOfTurn') continue;
    s.winner = rule === 'win' ? p : other(p);
    s.winReason = rule === 'win'
      ? `${s.players[p].name} n'a plus de cartes dans son deck et gagne (effet de son Leader)`
      : `${s.players[p].name} n'a plus de cartes dans son deck`;
    log(s, null, s.winReason);
    return;
  }
}

function endOfTurnDefeat(s: GameState) {
  for (const p of [s.active, other(s.active)]) {
    if (s.players[p].deck.length === 0 && def(s.players[p].leader.num).rules?.deckOut === 'loseAtEndOfTurn') {
      s.winner = other(p);
      s.winReason = `${s.players[p].name} n'a plus de cartes dans son deck à la fin du tour`;
      log(s, null, s.winReason);
      return;
    }
  }
}

// ---------- Résolution des effets ----------

function resolvePending(s: GameState, chooser?: Chooser) {
  const p = s.pending[0];
  // Un effet automatique ne se résout pas si sa carte a quitté le terrain entre-temps (8-1-3-1-3) ; [En cas de KO] se
  // résout depuis la Défausse
  if (p.kind !== 'system' && p.kind !== 'onKO' && !onField(s, p.source)) {
    s.pending.shift();
    return;
  }
  if (!chooser && p.snapshot === undefined) p.snapshot = JSON.stringify(s);
  let next = 0;
  const ask: EffectCtx['ask'] = (spec) => {
    const decision: Decision = {
      player: spec.player ?? p.controller,
      kind: 'effect',
      prompt: spec.prompt,
      options: spec.options,
      tag: spec.tag,
      source: p.source,
      inEffect: true,
    };
    if (decision.options.length === 1) return decision.options[0].id; // choix imposé
    if (next < p.answers.length) {
      // réponse déjà donnée : elle doit correspondre à la même question (sinon la partie rejouée a divergé)
      const answer = p.answers[next++];
      if (!decision.options.some((o) => o.id === answer)) throw new Error(`Réponse rejouée invalide : ${answer}`);
      return answer;
    }
    if (chooser) {
      const answer = chooser(s, decision);
      p.answers.push(answer);
      next++;
      s.history.push(historyEntry(s, decision, answer));
      return answer;
    }
    throw new NeedDecision(decision);
  };
  const ctx: EffectCtx = { s, me: p.controller, opp: other(p.controller), source: p.source, num: p.num, pending: p, ask };
  try {
    runEffect(ctx, p);
    const index = s.pending.indexOf(p);
    if (index >= 0) s.pending.splice(index, 1);
  } catch (err) {
    if (!(err instanceof NeedDecision)) throw err;
    // L'état reste tel qu'au moment de la question (le joueur voit ce que l'effet a déjà fait) ; la réponse sera
    // appliquée en rejouant l'effet depuis son instantané (voir act)
    s.decision = err.decision;
  }
}

function runEffect(ctx: EffectCtx, p: PendingEffect) {
  const { s } = ctx;
  switch (p.kind) {
    case 'onPlay':
      log(s, p.controller, `effet [Jouée] de ${def(p.num).name}`);
      def(p.num).onPlay?.(ctx);
      return;
    case 'whenAttacking':
      def(p.num).whenAttacking?.(ctx);
      return;
    case 'onOpponentAttack':
      def(p.num).onOpponentAttack?.run(ctx);
      return;
    case 'onKO':
      log(s, p.controller, `effet [En cas de KO] de ${def(p.num).name}`);
      def(p.num).onKO?.(ctx);
      return;
    case 'endOfTurn':
      def(p.num).endOfTurn?.(ctx);
      return;
    case 'when':
      def(p.num).when?.[p.index!]?.run(ctx, p.event!);
      return;
    case 'activateMain': {
      const f = findField(s, p.source);
      if (f) def(p.num).activateMain!.run(ctx, f.card);
      return;
    }
    case 'system':
      SYSTEM[p.action!](ctx, p);
  }
}

// Actions de jeu qui peuvent demander des choix : elles passent par la file des effets
const SYSTEM: Record<string, (ctx: EffectCtx, p: PendingEffect) => void> = {
  // Plusieurs effets différents du même joueur déclenchés ensemble (8-6-1-1) : il choisit lequel résoudre d'abord, et
  // ainsi de suite (les exemplaires d'une même carte se suivent)
  order(ctx, p) {
    const { s } = ctx;
    const batch = Number(p.data?.batch);
    const inGroup = (x: PendingEffect) => x !== p && x.batch === batch && x.controller === ctx.me;
    const positions = s.pending.flatMap((x, i) => (inGroup(x) ? [i] : []));
    let left = positions.map((i) => s.pending[i]);
    const ordered: PendingEffect[] = [];
    while (new Set(left.map((x) => x.num)).size > 1) {
      const nums = [...new Set(left.map((x) => x.num))];
      const answer = ctx.ask({
        prompt: 'Plusieurs de tes effets se déclenchent en même temps : lequel résoudre d’abord ?',
        options: nums.map((n) => ({ id: `first:${n}`, label: def(n).name, num: n })),
        tag: 'order',
      });
      const chosen = answer.slice('first:'.length);
      ordered.push(...left.filter((x) => x.num === chosen));
      left = left.filter((x) => x.num !== chosen);
    }
    ordered.push(...left);
    positions.forEach((pos, k) => { s.pending[pos] = ordered[k]; });
  },

  playFromHand(ctx, p) {
    const P = ctx.s.players[ctx.me];
    const index = P.hand.findIndex((c) => c.uid === p.source);
    if (index < 0) return;
    const cost = handCost(ctx.s, ctx.me, P.hand[index]);
    const [card] = P.hand.splice(index, 1);
    payDon(ctx.s, ctx.me, cost);
    playCharacter(ctx, ctx.me, card);
  },

  playEvent(ctx, p) {
    const P = ctx.s.players[ctx.me];
    const index = P.hand.findIndex((c) => c.uid === p.source);
    if (index < 0) return;
    const cost = handCost(ctx.s, ctx.me, P.hand[index]);
    const [card] = P.hand.splice(index, 1);
    const d = def(card.num);
    payDon(ctx.s, ctx.me, cost);
    P.trash.push(card);
    log(ctx.s, ctx.me, `active ${d.name} [Principale]`);
    emit(ctx.s, { type: 'event', player: ctx.me, uid: card.uid, num: card.num, timing: 'main' });
    d.onMain?.(ctx);
  },

  counterEvent(ctx, p) {
    const P = ctx.s.players[ctx.me];
    const index = P.hand.findIndex((c) => c.uid === p.source);
    if (index < 0) return;
    const [card] = P.hand.splice(index, 1);
    const d = def(card.num);
    payDon(ctx.s, ctx.me, d.cost ?? 0);
    P.trash.push(card);
    log(ctx.s, ctx.me, `active ${d.name} [Contre]`);
    // l'adversaire (joueur actif) peut réagir à l'activation d'un Événement (Franky)
    emit(ctx.s, { type: 'event', player: ctx.me, uid: card.uid, num: card.num, timing: 'counter' });
    d.onCounter?.(ctx);
  },

  // Étape d'Attaque (7-1-1) : épuiser l'attaquant, effets [En attaquant] (la cible est choisie avec l'attaque)
  declareAttack(ctx, p) {
    const { s } = ctx;
    const attacker = findField(s, p.source);
    const target = Number(p.data?.target);
    if (!attacker || attacker.player !== ctx.me || !attackTargets(s, ctx.me, attacker.card).includes(target)) return;
    const uid = attacker.card.uid;
    s.battle = { attacker: uid, target, step: 'block', blocked: false };
    s.flow = { stage: 'battle' };
    log(s, ctx.me, `${def(attacker.card.num).name} (${power(s, uid)}) attaque ${describe(s, target)}`);
    restForAttack(s, uid);
    const effects: PendingEffect[] = [];
    if (def(attacker.card.num).whenAttacking) effects.push({ kind: 'whenAttacking', source: uid, num: attacker.card.num, controller: ctx.me, answers: [] });
    // [Attaque adverse] : après les effets [En attaquant] (10-2-16)
    for (const c of allField(s, ctx.opp)) {
      if (def(c.num).onOpponentAttack) effects.push({ kind: 'onOpponentAttack', source: c.uid, num: c.num, controller: ctx.opp, answers: [] });
    }
    emit(s, { type: 'attack', player: ctx.me, uid, num: attacker.card.num, zone: attacker.leader ? 'leader' : 'character', by: ctx.me, cause: 'attack', target }, effects);
  },

  // Dégâts au Leader (4-6, 7-1-4-1-1) : cartes de Vie en main, [Déclenchement] au choix
  leaderDamage(ctx, p) {
    const { s } = ctx;
    const P = s.players[ctx.me];
    const amount = Number(p.data?.amount ?? 1);
    for (let i = 0; i < amount; i++) {
      if (!P.life.length) {
        s.winner = ctx.opp;
        s.winReason = `${s.players[ctx.opp].name} touche le Leader de ${P.name}, qui n'a plus de Vie`;
        log(s, null, s.winReason);
        return;
      }
      const lifeCard = P.life.shift()!;
      const card = { uid: lifeCard.uid, num: lifeCard.num };
      const d = def(card.num);
      // [Exil] : la carte de Vie va dans la Défausse, sans [Déclenchement] (10-1-6)
      if (p.data?.banish) {
        P.trash.push(card);
        log(s, ctx.me, `perd 1 Vie : ${d.name} va dans la Défausse ([Exil], il lui en reste ${P.life.length})`);
        continue;
      }
      const onTrigger = triggerEffect(card.num);
      if (d.trigger && onTrigger) {
        const answer = ctx.ask({
          prompt: `Carte de Vie : ${d.name}. [Déclenchement] ${d.trigger} L'activer ?`,
          options: [
            { id: 'trigger', label: `Activer le [Déclenchement] de ${d.name}`, num: card.num },
            { id: 'hand', label: 'Ajouter la carte à ma main' },
          ],
          tag: 'trigger',
        });
        if (answer === 'trigger') {
          log(s, ctx.me, `perd 1 Vie, révèle ${d.name} et active son [Déclenchement]`);
          // la carte n'est dans aucune zone pendant son [Déclenchement], puis va dans la Défausse (10-1-5-3), sauf si
          // l'effet l'a jouée ou ajoutée à la main
          const trigger = { card, moved: false };
          onTrigger({ ...ctx, num: card.num, trigger });
          if (!trigger.moved) P.trash.push(card);
          continue;
        }
      }
      P.hand.push(card);
      log(s, ctx.me, `perd 1 Vie (il lui en reste ${P.life.length})`);
    }
  },
};

// ---------- Déroulement du tour (6) ----------

function stepFlow(s: GameState) {
  const flow = s.flow;
  switch (flow.stage) {
    case 'setup': {
      // Effets « au début de la partie » des Leaders (5-2-1-5-1), puis mains de départ (5-2-1-6)
      if (!flow.effectsDone) {
        flow.effectsDone = true;
        emit(s, { type: 'gameStart', player: s.first });
        return;
      }
      for (const p of [0, 1] as PlayerId[]) draw(s, p, 5);
      log(s, null, `${s.players[s.first].name} joue en premier`);
      s.flow = { stage: 'mulligan', player: s.first };
      return;
    }
    case 'mulligan': {
      const P = s.players[flow.player];
      s.decision = {
        player: flow.player,
        kind: 'mulligan',
        prompt: `Main de départ : ${P.hand.map((c) => def(c.num).name).join(', ')}. La garder ?`,
        options: [
          { id: 'keep', label: 'Garder cette main' },
          { id: 'mulligan', label: 'Repiocher 5 cartes (une seule fois)' },
        ],
      };
      return;
    }
    case 'refresh': {
      // Phase de Recharge (6-2). Les effets « jusqu'au début de votre prochain tour » sont déjà finis : ils durent
      // jusqu'à la fin du tour adverse (Modifier.until), rien ne se passe entre les deux.
      const p = s.active;
      const P = s.players[p];
      if (!flow.effectsDone) {
        // effets « au début de votre tour / du tour adverse » (6-2-2)
        flow.effectsDone = true;
        P.turns++;
        log(s, p, `— Tour ${s.turn} : ${P.name} —`);
        for (const c of [...allField(s, 0), ...allField(s, 1)]) c.usedOpt = [];
        emit(s, { type: 'turnStart', player: p });
        return;
      }
      // DON!! données renvoyées épuisées, puis tout est redressé (6-2-3, 6-2-4)
      for (const c of fieldCards(s, p)) {
        P.donRested += c.don;
        c.don = 0;
      }
      for (const c of allField(s, p)) c.rested = false;
      P.donActive += P.donRested;
      P.donRested = 0;
      s.flow = { stage: 'draw' };
      return;
    }
    case 'draw': {
      // Phase de Pioche (6-3) : le premier joueur ne pioche pas à son premier tour
      const p = s.active;
      if (!(p === s.first && s.players[p].turns === 1)) draw(s, p, 1);
      s.flow = { stage: 'don' };
      return;
    }
    case 'don': {
      // Phase DON!! (6-4) : 2 DON!! (1 pour le premier joueur à son premier tour)
      const p = s.active;
      const P = s.players[p];
      const n = Math.min(P.donDeck, p === s.first && P.turns === 1 ? 1 : 2);
      P.donDeck -= n;
      P.donActive += n;
      // effets « au début de la phase principale » (6-5-1)
      s.flow = { stage: 'main' };
      emit(s, { type: 'mainStart', player: p });
      return;
    }
    case 'main':
      s.decision = mainDecision(s);
      return;
    case 'battle':
      stepBattle(s);
      return;
    case 'end': {
      // Phase de Fin (6-6) : effets [Fin de votre tour] et effets différés, puis fin des effets du tour
      if (!flow.effectsDone) {
        flow.effectsDone = true;
        const effects: PendingEffect[] = allField(s, s.active).filter((c) => def(c.num).endOfTurn)
          .map((c) => ({ kind: 'endOfTurn', source: c.uid, num: c.num, controller: s.active, answers: [] }));
        emit(s, { type: 'turnEnd', player: s.active }, effects);
        for (const d of s.delayed.filter((x) => x.turn === s.turn)) {
          if (d.action === 'untapDon') untapDon(s, d.player, d.amount);
        }
        s.delayed = s.delayed.filter((x) => x.turn !== s.turn);
        return;
      }
      endOfTurnDefeat(s);
      if (s.winner !== null) return;
      s.mods = s.mods.filter((m) => m.until !== 'turn' && m.until !== s.turn);
      s.active = other(s.active);
      s.turn++;
      s.flow = { stage: 'refresh' };
      return;
    }
    case 'over':
      return;
  }
}

// Une option par carte différente de la main (plusieurs exemplaires identiques)
function firstOfEachNum<T extends { num: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.num) ? false : (seen.add(c.num), true)));
}

function mainDecision(s: GameState): Decision {
  const p = s.active;
  const P = s.players[p];
  const options: Option[] = [];
  for (const c of firstOfEachNum(P.hand)) {
    const d = def(c.num);
    const cost = handCost(s, p, c);
    if (cost > P.donActive) continue;
    if (d.category === 'CHARACTER' || d.category === 'STAGE') {
      options.push({ id: `play:${c.uid}`, label: `Jouer ${d.name} (coût ${cost})`, uid: c.uid, group: 'play' });
    }
    if (d.category === 'EVENT' && d.onMain) options.push({ id: `event:${c.uid}`, label: `Activer ${d.name} (coût ${cost})`, uid: c.uid, group: 'play' });
  }
  for (const f of allField(s, p)) {
    const a = def(f.num).activateMain;
    if (a && !(a.oncePerTurn && f.usedOpt.includes('main')) && (a.canActivate?.(s, p, f) ?? true)) {
      options.push({ id: `act:${f.uid}`, label: a.label, uid: f.uid, group: 'ability' });
    }
  }
  if (P.donActive > 0) {
    for (const f of fieldCards(s, p)) options.push({ id: `don:${f.uid}`, label: `Donner 1 DON!! à ${describe(s, f.uid)}`, uid: f.uid, group: 'don' });
  }
  // Pas de combat pendant son premier tour (6-5-6-1) ; un Personnage joué ce tour ne peut pas attaquer (3-7-4)
  // Une option par attaquant et par cible : le Leader adverse ou un Personnage adverse épuisé (7-1)
  for (const f of fieldCards(s, p)) {
    for (const target of attackTargets(s, p, f)) {
      options.push({
        id: `attack:${f.uid}:${target}`,
        label: `${def(f.num).name} (${power(s, f.uid)}) attaque ${describe(s, target)}`,
        uid: f.uid,
        target,
        group: 'attack',
      });
    }
  }
  options.push({ id: 'end', label: 'Fin du tour', group: 'end' });
  return { player: p, kind: 'main', prompt: 'Phase principale : que fais-tu ?', options };
}

// ---------- Combat (7) ----------

function counterDecision(s: GameState): Decision | null {
  const b = s.battle!;
  const defender = other(s.active);
  const P = s.players[defender];
  const options: Option[] = [];
  for (const c of firstOfEachNum(P.hand)) {
    const d = def(c.num);
    if (d.category === 'CHARACTER' && (d.counter ?? 0) > 0) {
      options.push({ id: `counter:${c.uid}`, label: `Contre +${d.counter} : défausser ${d.name}`, uid: c.uid, group: 'counter' });
    }
    if (d.category === 'EVENT' && d.onCounter && (d.cost ?? 0) <= P.donActive) {
      options.push({ id: `cevent:${c.uid}`, label: `Activer ${d.name} [Contre] (coût ${d.cost})`, uid: c.uid, group: 'counter' });
    }
  }
  if (!options.length) return null;
  options.push({ id: 'pass', label: 'Ne pas contrer davantage', group: 'end' });
  const atk = power(s, b.attacker);
  const dp = power(s, b.target);
  const gap = atk >= dp ? ` Il te manque ${atk - dp + 1000} de puissance pour repousser l'attaque.` : ' L’attaque est déjà repoussée.';
  return {
    player: defender,
    kind: 'counter',
    prompt: `${name(s, b.attacker)} (${atk}) attaque ${describe(s, b.target)}.${gap}`,
    options,
  };
}

function stepBattle(s: GameState) {
  const b = s.battle!;
  // Attaquant ou cible partis du terrain : fin du combat (7-1-1-4, 7-1-2-3, 7-1-3-1-3)
  if (b.step !== 'end' && (!onField(s, b.attacker) || !onField(s, b.target))) b.step = 'end';
  switch (b.step) {
    case 'block': {
      const defender = other(s.active);
      const blockers = s.players[defender].chars.filter((c) => !c.rested && c.uid !== b.target && canBeRested(s, c.uid) && hasBlocker(s, defender, c));
      // [Imblocable] : l'adversaire ne peut pas bloquer (10-1-7)
      const unblockable = hasKeyword(s, s.active, findField(s, b.attacker)!.card, 'Unblockable');
      if (b.blocked || !blockers.length || unblockable) {
        b.step = 'counter';
        return;
      }
      s.decision = {
        player: defender,
        kind: 'blocker',
        prompt: `${name(s, b.attacker)} (${power(s, b.attacker)}) attaque ${describe(s, b.target)}. Bloquer avec un [Bloqueur] ?`,
        options: [
          ...blockers.map((c) => ({ id: `block:${c.uid}`, label: `Bloquer avec ${describe(s, c.uid)}`, uid: c.uid })),
          { id: 'noblock', label: 'Ne pas bloquer' },
        ],
      };
      return;
    }
    case 'counter': {
      const d = counterDecision(s);
      if (d) s.decision = d;
      else b.step = 'damage';
      return;
    }
    case 'damage': {
      const atk = power(s, b.attacker);
      const dp = power(s, b.target);
      const target = findField(s, b.target)!;
      if (!target.leader) {
        const attacker = findField(s, b.attacker);
        if (attacker) attacker.card.battledCharTurn = s.turn;
      }
      if (atk >= dp) {
        if (target.leader) {
          // [Double attaque] : 2 dégâts (10-1-3) ; [Exil] : les cartes de Vie vont dans la Défausse (10-1-6)
          const attacker = findField(s, b.attacker)!.card;
          const amount = hasKeyword(s, s.active, attacker, 'Double Attack') ? 2 : 1;
          const banish = hasKeyword(s, s.active, attacker, 'Banish');
          log(s, s.active, `l'attaque touche le Leader adverse (${atk} contre ${dp})${amount > 1 ? ' : [Double attaque], 2 dégâts' : ''}`);
          s.pending.push({
            kind: 'system', action: 'leaderDamage', source: b.target, num: target.card.num, controller: target.player, answers: [],
            data: { amount, ...(banish ? { banish: 1 } : {}) },
          });
        } else {
          log(s, s.active, `l'attaque gagne le combat (${atk} contre ${dp})`);
          koCharacter(s, b.target, 'battle', s.active);
        }
      } else {
        log(s, s.active, `l'attaque est repoussée (${atk} contre ${dp})`);
      }
      b.step = 'end';
      return;
    }
    case 'end':
      s.mods = s.mods.filter((m) => m.until !== 'battle');
      s.battle = null;
      s.flow = { stage: 'main' };
  }
}

// ---------- Décisions hors effets ----------

function applyDecision(s: GameState, choice: string) {
  const d = s.decision!;
  s.history.push(historyEntry(s, d, choice));
  s.decision = null;
  const [kind, id] = choice.split(':');
  const uid = Number(id);
  switch (d.kind) {
    case 'mulligan': {
      const p = d.player;
      const P = s.players[p];
      if (choice === 'mulligan') {
        P.deck.push(...P.hand);
        P.hand = [];
        shuffle(s, P.deck);
        draw(s, p, 5);
        log(s, p, 'repioche sa main de départ');
      } else {
        log(s, p, 'garde sa main de départ');
      }
      if (p === s.first) {
        s.flow = { stage: 'mulligan', player: other(p) };
      } else {
        // Vie (5-2-1-7) : la carte du dessus du deck finit au-dessous de la Vie
        for (const q of s.players) q.life = q.deck.splice(0, def(q.leader.num).life ?? 5).reverse();
        s.turn = 1;
        s.active = s.first;
        s.flow = { stage: 'refresh' };
      }
      return;
    }
    case 'main': {
      const p = s.active;
      const P = s.players[p];
      const num = findField(s, uid)?.card.num ?? P.hand.find((c) => c.uid === uid)?.num ?? '';
      switch (kind) {
        case 'play':
          s.pending.push({ kind: 'system', action: 'playFromHand', source: uid, num, controller: p, answers: [] });
          return;
        case 'event':
          s.pending.push({ kind: 'system', action: 'playEvent', source: uid, num, controller: p, answers: [] });
          return;
        case 'act':
          log(s, p, `active l'effet de ${def(num).name}`);
          s.pending.push({ kind: 'activateMain', source: uid, num, controller: p, answers: [] });
          return;
        case 'don': {
          const f = findField(s, uid)!;
          P.donActive--;
          f.card.don++;
          log(s, p, `donne 1 DON!! à ${def(f.card.num).name}`);
          return;
        }
        case 'attack':
          s.pending.push({ kind: 'system', action: 'declareAttack', source: uid, num, controller: p, answers: [], data: { target: Number(choice.split(':')[2]) } });
          return;
        case 'end':
          log(s, p, 'termine son tour');
          s.flow = { stage: 'end' };
          return;
      }
      return;
    }
    case 'blocker': {
      const b = s.battle!;
      if (kind === 'block') {
        const f = findField(s, uid)!;
        f.card.rested = true;
        b.target = uid;
        b.blocked = true;
        log(s, d.player, `bloque avec ${def(f.card.num).name}`);
        // [En bloquant] et effets « quand vous bloquez » (7-1-2-2)
        emit(s, { type: 'block', player: d.player, uid, num: f.card.num, zone: 'character', by: d.player });
      }
      b.step = 'counter';
      return;
    }
    case 'counter': {
      const b = s.battle!;
      const P = s.players[d.player];
      if (kind === 'counter') {
        const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === uid), 1);
        P.trash.push(card);
        const value = def(card.num).counter ?? 0;
        addMod(s, { uid: b.target, stat: 'power', amount: value, until: 'battle', source: def(card.num).name });
        log(s, d.player, `contre avec ${def(card.num).name} : +${value} à ${name(s, b.target)}`);
      } else if (kind === 'cevent') {
        const num = P.hand.find((c) => c.uid === uid)!.num;
        s.pending.push({ kind: 'system', action: 'counterEvent', source: uid, num, controller: d.player, answers: [], data: { target: b.target } });
      } else {
        b.step = 'damage';
      }
      return;
    }
    case 'effect':
      throw new Error('Décision d’effet traitée par act()');
  }
}
