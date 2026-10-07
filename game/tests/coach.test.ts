// Tests du coach : analyse des décisions, récap de fin de partie
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { coachAnalyze } from '../ai/search.ts';
import { uselessReason } from '../ai/prune.ts';
import { buildRecap, isReviewable, reviewMoves, tips, type Move } from '../coach/review.ts';
import { act, advance, newGame } from '../engine/engine.ts';
import type { FieldCard, GameState } from '../engine/types.ts';

// simulations réduites pour que les tests restent rapides
const OPTS = { samples: 3, budgetMs: 0, minSamples: 3, refineSamples: 4, refineBudgetMs: 0, refineMin: 4 };
const syncAnalyze = (m: Move) => Promise.resolve(coachAnalyze(m.state, { ...OPTS, include: m.choice }));

// Partie où le joueur 0 suit l'IA simple, sauf qu'il termine parfois son tour sans attaquer
function recordedGame(seed: number): { final: GameState; moves: Move[] } {
  let s = newGame({ decks: ['ST-35', 'ST-36'], names: ['Toi', 'IA'], seed, first: 0 });
  const moves: Move[] = [];
  let id = 0;
  while (s.winner === null) {
    const d = s.decision!;
    let choice = heuristicChooser(s, d);
    if (d.player === 0) {
      if (d.kind === 'main' && s.turn % 4 === 3 && choice.startsWith('attack:')) choice = 'end';
      moves.push({ id: id++, state: s, choice });
    }
    s = act(s, choice);
  }
  return { final: s, moves };
}

test('coach : terminer son tour au lieu de porter le coup fatal est une grosse erreur', async () => {
  let s = act(act(newGame({ decks: ['ST-35', 'ST-35'], names: ['Toi', 'IA'], seed: 3, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 2;
  s.turn = 5;
  s.decision = null;
  s.flow = { stage: 'main' };
  // les deux joueurs n'ont plus de Vie ; si le joueur 0 ne porte pas le coup, les Personnages adverses (sans [Bloqueur]) le feront
  s.players[0].leader.don = 2;
  s.players[0].life = [];
  s.players[0].hand = [];
  s.players[0].chars = [];
  s.players[1].life = [];
  s.players[1].hand = [];
  s.players[1].chars = ['OP12-045', 'OP11-068', 'OP10-101'].map((num, i) => ({ uid: 9000 + i, num, rested: false, don: 0, playedTurn: 0, usedOpt: [] }));
  s = advance(s);
  const move: Move = { id: 1, state: s, choice: 'end' };
  assert.ok(isReviewable(move, 0));
  const reviews = await reviewMoves([move], 0, syncAnalyze);
  const r = reviews.get(1)!;
  assert.equal(r.bestRate, 1);
  assert.ok(r.stats.some((x) => x.id === `attack:${s.players[0].leader.uid}:${s.players[1].leader.uid}` && x.rate === 1));
  assert.ok(r.delta >= 0.3, `écart ${r.delta}`);
  const recap = buildRecap(s, [move], reviews, 0);
  assert.equal(recap.mistakes.length, 1);
});

test('coach : récap complet d’une partie (erreurs, courbe, statistiques, conseils)', async () => {
  const { final, moves } = recordedGame(5);
  const reviewable = moves.filter((m) => isReviewable(m, 0));
  let progress = 0;
  const reviews = await reviewMoves(moves, 0, syncAnalyze, (done) => { progress = done; });
  assert.equal(progress, reviewable.length);
  assert.equal(reviews.size, reviewable.length);
  const recap = buildRecap(final, moves, reviews, 0);
  assert.equal(recap.curve.length, reviewable.length);
  assert.ok(recap.stats.me.attacks > 0 && recap.stats.opp.attacks > 0);
  const last = recap.stats.lifeByTurn.at(-1)!;
  assert.deepEqual([last.me, last.opp], [final.players[0].life.length, final.players[1].life.length]);
  // les fins de tour sans attaque du Leader sont relevées
  assert.ok(recap.tips.some((t) => t.includes('Leader pouvait encore attaquer')), recap.tips.join('\n'));
  for (const r of recap.mistakes) assert.ok(r.delta >= 0.1);
});

// ---------- Choix sans intérêt, réserve de DON!! pour les Contres ----------

let uid = 9500;
const card = (num: string) => ({ uid: uid++, num });
const field = (num: string, extra: Partial<FieldCard> = {}): FieldCard => ({ uid: uid++, num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra });

function scenario(setup: (s: GameState) => void): GameState {
  const s = act(act(newGame({ decks: ['ST-35', 'ST-35'], names: ['Toi', 'IA'], seed: 21, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 2;
  s.turn = 5;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

const why = (s: GameState, id: string) => uselessReason(s, s.decision!, s.decision!.options.find((o) => o.id === id)!);

test('choix sans intérêt : attaque trop faible, DON!! sur une carte qui ne peut plus attaquer', () => {
  const hack = field('ST35-001');
  const tired = field('OP13-005', { rested: true });
  const s = scenario((g) => {
    g.players[0].chars = [hack, tired];
    g.players[0].donActive = 2;
    g.players[1].chars = [field('OP13-017')];
  });
  const opp = s.players[1].leader.uid;
  // Hack (4000) contre le Leader adverse (5000 −1000 avec 5 Vies = 4000) : égalité, l'attaque peut réussir
  assert.equal(why(s, `attack:${hack.uid}:${opp}`), null);
  // Sabo (Leader, 4000) n'a pas d'effet [En attaquant] : rien à signaler non plus à égalité
  assert.equal(why(s, `don:${hack.uid}`), null);
  assert.match(why(s, `don:${tired.uid}`)!, /ne peut pas attaquer ce tour/);
  const weak = scenario((g) => {
    g.players[0].chars = [field('ST35-001')];
    g.players[1].life = g.players[1].life.slice(0, 3); // plus de −1000 : Leader adverse à 5000
  });
  const attacker = weak.players[0].chars[0].uid;
  assert.match(why(weak, `attack:${attacker}:${weak.players[1].leader.uid}`)!, /puissance insuffisante \(4000 contre 5000\)/);
  // Belo Betty a un effet [En attaquant], mais il ne change rien au combat : son attaque trop faible reste sans intérêt
  const betty = scenario((g) => {
    g.players[0].chars = [field('OP12-090')];
    g.players[1].life = g.players[1].life.slice(0, 3);
    g.players[1].chars = [field('OP13-005')];
  });
  assert.match(why(betty, `attack:${betty.players[0].chars[0].uid}:${betty.players[1].leader.uid}`)!, /ne sert à rien ici/);
});

test('Les flammes d’Ace : sans effet avec moins de 5 DON!!, et leur [Contre] ne protège que le Leader', () => {
  const ace = card('OP13-019');
  const four = scenario((g) => {
    g.players[0].hand = [ace];
    g.players[0].donActive = 4;
    g.players[1].chars = [field('OP13-005')];
  });
  assert.match(why(four, `event:${ace.uid}`)!, /ne peut rien faire/);
  const five = scenario((g) => {
    g.players[0].hand = [card('OP13-019')];
    g.players[0].donActive = 5;
    g.players[1].chars = [field('OP13-005')];
  });
  assert.equal(why(five, `event:${five.players[0].hand[0].uid}`), null);

  // l'IA attaque un Personnage épuisé du joueur, qui n'a que l'Événement en main
  const victim = field('OP13-005', { rested: true });
  const aceCounter = card('OP13-019');
  let s = scenario((g) => {
    g.active = 1;
    g.players[1].turns = 3;
    g.players[1].chars = [field('OP13-017')];
    g.players[0].chars = [victim];
    g.players[0].hand = [aceCounter];
    g.players[0].donActive = 2;
  });
  s = act(s, `attack:${s.players[1].chars[0].uid}:${victim.uid}`);
  assert.equal(s.decision!.kind, 'counter');
  assert.match(why(s, `cevent:${aceCounter.uid}`)!, /ne protège pas/);
});

test('l’IA des simulations utilise un Événement [Contre] payé avec des DON!! restées libres', () => {
  const ace = card('OP13-019');
  let s = scenario((g) => {
    g.active = 1;
    g.players[1].turns = 3;
    g.players[1].chars = [field('OP13-081')]; // Koala 6000
    g.players[0].life = g.players[0].life.slice(0, 4); // Sabo (Leader) à 4000 avec 4 Vies
    g.players[0].hand = [ace, card('ST35-001')];
    g.players[0].donActive = 1;
  });
  s = act(s, `attack:${s.players[1].chars[0].uid}:${s.players[0].leader.uid}`);
  assert.equal(s.decision!.kind, 'counter');
  // 6000 contre 4000 : il faut +3000, que donne l'Événement à lui seul
  assert.equal(heuristicChooser(s, s.decision!), `cevent:${ace.uid}`);
});

test('coach : un choix sans intérêt n’est jamais conseillé, mais le choix du joueur est toujours évalué', () => {
  const s = scenario((g) => {
    g.players[0].chars = [field('ST35-001'), field('OP13-005', { rested: true })];
    g.players[0].donActive = 3;
    g.players[1].life = g.players[1].life.slice(0, 3);
  });
  const useless = s.decision!.options.find((o) => uselessReason(s, s.decision!, o))!;
  const a = coachAnalyze(s, { ...OPTS, include: useless.id });
  assert.ok(!a.pruned.some((x) => x.id === a.best));
  assert.ok(uselessReason(s, s.decision!, s.decision!.options.find((o) => o.id === a.best)!) === null);
  assert.ok(a.stats.some((x) => x.id === useless.id && x.refined));
});

test('conseils : les DON!! gardées pour payer un Événement [Contre] ne sont pas comptées comme gaspillées', () => {
  const keep = scenario((g) => {
    g.players[0].hand = [card('OP13-019'), card('OP12-090')];
    g.players[0].donActive = 3;
  });
  // 3 DON!! : 1 gardée pour l'Événement, il en reste 2 alors que Belo Betty (coût 3) n'est pas jouable avec
  assert.ok(!tips(keep, [{ id: 1, state: keep, choice: 'end' }], 0).some((t) => t.includes('DON!! inutilisées')));
  const waste = scenario((g) => {
    g.players[0].hand = [card('OP13-019'), card('OP12-090')];
    g.players[0].donActive = 5;
  });
  assert.ok(tips(waste, [{ id: 1, state: waste, choice: 'end' }], 0).some((t) => t.includes('DON!! inutilisées')));
});
