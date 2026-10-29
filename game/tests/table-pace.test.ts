// Rythme de l'IA (tâche R2.10, game/ui/table/pace.ts) : en pause l'IA ne joue plus, « pas à pas » laisse passer une
// seule décision ; chaque décision de l'IA dite en une phrase (choix fait et conséquences), sans lire le journal
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { act, newGame } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { aiMove, ready, remember, RUNNING, shownMoves, step, type Pace } from '../ui/table/pace.ts';
import { attack, play, scenario, setChars, setDon, setHand } from './helpers.ts';

const ST01 = { sanji: 'ST01-004', jinbe: 'ST01-005', nami: 'ST01-007' };

// Simule l'IA d'useAiOpponent : chaque décision prête passe par ready ; step et resume comme les boutons
function pacer() {
  let pace: Pace = RUNNING;
  let held = 0;      // décisions en attente (jamais plus d'une : l'IA attend la sienne avant d'en calculer une autre)
  let played = 0;
  return {
    decide() {
      const r = ready(pace);
      pace = r.next;
      if (r.play) played++;
      else held++;
    },
    pause() { pace = { paused: true, credit: 0 }; },
    resume() { pace = RUNNING; played += held; held = 0; },
    step() {
      const r = step(pace, held > 0);
      pace = r.next;
      if (r.play) { held--; played++; }
    },
    get played() { return played; },
    get held() { return held; },
  };
}

test('sans pause, chaque décision prête est jouée', () => {
  const p = pacer();
  p.decide();
  p.decide();
  assert.equal(p.played, 2);
});

test('en pause, l’IA ne joue plus ; « pas à pas » joue exactement une décision ; Reprendre relance', () => {
  const p = pacer();
  p.pause();
  p.decide();
  assert.equal(p.played, 0, 'en pause : la décision attend');
  assert.equal(p.held, 1);
  p.step();
  assert.equal(p.played, 1, 'pas à pas : une décision');
  p.decide();
  assert.equal(p.played, 1, 'la suivante attend de nouveau');
  p.step();
  p.step();   // rien n'attend : la prochaine passera, une seule
  p.decide();
  p.decide();
  assert.equal(p.played, 3, 'deux appuis pendant la réflexion ne font passer qu’une décision');
  assert.equal(p.held, 1);
  p.resume();
  assert.equal(p.played, 4, 'Reprendre joue celle qui attend');
  p.decide();
  assert.equal(p.played, 5);
});

test('« pas à pas » sans pause ne fait rien', () => {
  const r = step(RUNNING, true);
  assert.equal(r.play, false);
  assert.deepEqual(r.next, RUNNING);
});

test('phrases : jouer une carte, donner une DON!!, attaquer', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setHand(s, 1, [ST01.sanji]);
    setDon(s, 1, 5);
    setChars(s, 1, [{ num: ST01.nami }]);
  }, 1);
  const b = play(a, ST01.sanji, 1);
  assert.equal(aiMove(a, b, 1, 0)?.text, 'joue Sanji');
  const nami = b.players[1].chars.find((c) => c.num === ST01.nami)!.uid;
  const c = act(b, `don:${nami}`);
  assert.equal(aiMove(b, c, 1, 0)?.text, 'donne 1 DON!! à Nami');
  const d = attack(c, nami, c.players[0].leader.uid);
  const said = aiMove(c, d, 1, 0)!.text;
  assert.match(said, /^attaque ton Leader \S.* avec Nami$/);
  // la décision de l'autre joueur n'est pas une décision de l'IA
  assert.equal(aiMove(d, d, 1, 0), null);
});

test('phrases : l’IA qui ne contre pas perd une Vie', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setDon(s, 0, 5);
    setChars(s, 0, [{ num: ST01.jinbe }]);
    setHand(s, 1, [ST01.nami, ST01.sanji]);
  });
  let s = attack(a, a.players[0].chars[0].uid, a.players[1].leader.uid);
  const said: string[] = [];
  for (let i = 0; i < 6 && s.decision?.player === 1; i++) {
    const before = s;
    const answer = s.decision.options.find((o) => o.id === 'noblock' || o.id === 'pass')?.id;
    if (!answer) break;
    s = act(s, answer);
    said.push(aiMove(before, s, 1, 0)?.text ?? '');
  }
  assert.ok(s.players[1].life.length < a.players[1].life.length, 'l’IA a perdu une Vie');
  assert.ok(said.some((x) => /perd 1 Vie/.test(x)), said.join(' / '));
});

test('parties simulées : une phrase pour chaque décision de l’IA, sans le libellé à la première personne', () => {
  for (let seed = 1; seed <= 6; seed++) {
    let s: GameState = newGame({ decks: ['ST-01', 'ST-21'], names: ['Toi', 'IA'], seed, first: seed % 2 ? 0 : 1 });
    let count = 0;
    for (let i = 0; i < 400 && s.winner === null && s.decision; i++) {
      const d = s.decision;
      const next = act(s, heuristicChooser(s, d));
      const move = aiMove(s, next, 1, 0);
      if (d.player === 1) {
        assert.ok(move, `décision ${i} sans phrase`);
        assert.ok(move.text.length > 3);
        assert.doesNotMatch(move.text, /\b(ma|mon|mes)\b/, move.text);
        assert.equal(move.turn, s.turn);
        count++;
      } else {
        assert.equal(move, null);
      }
      s = next;
    }
    assert.ok(count > 5, `l’IA a décidé ${count} fois`);
  }
});

test('décisions à revoir : celles du dernier tour de l’IA, tant qu’il est récent', () => {
  let moves = remember([], { turn: 3, text: 'joue Sanji' });
  moves = remember(moves, { turn: 5, text: 'joue Nami' });
  moves = remember(moves, { turn: 5, text: 'termine son tour' });
  moves = remember(moves, null);
  assert.deepEqual(shownMoves(moves, 5).map((m) => m.text), ['joue Nami', 'termine son tour']);
  assert.equal(shownMoves(moves, 6).length, 2, 'pendant ton tour suivant');
  assert.equal(shownMoves(moves, 7).length, 0, 'plus tard : rien');
  for (let i = 0; i < 60; i++) moves = remember(moves, { turn: 9, text: `${i}` });
  assert.equal(moves.length, 40);
});
