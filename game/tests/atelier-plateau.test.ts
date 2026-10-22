// Atelier du plateau (tâche R0.2) : chaque état fixé se construit, reste cohérent, et a sa page #play/atelier/plateau-<état>
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { invariantErrors } from '../engine/invariants.ts';
import { BOARD_STATES, boardState } from '../ui/atelier/plateau/etats.ts';

const HERE = new URL('../ui/atelier/', import.meta.url);

test('chaque état du plateau se construit, cohérent et toujours le même', () => {
  for (const name of BOARD_STATES) {
    const b = boardState(name);
    const s = b.state;
    if (!s.decision?.inEffect) assert.deepEqual(invariantErrors(s), [], name);
    assert.deepEqual(boardState(name).state, s, `${name} : pas toujours le même état`);
  }
});

test('les états attendus montrent la bonne situation', () => {
  const at = (name: string) => boardState(name).state;
  assert.equal(at('mulligan').decision?.kind, 'mulligan');
  assert.equal(at('tour-1').turn, 1);
  assert.equal(at('bloqueur').decision?.kind, 'blocker');
  assert.equal(at('contre').decision?.kind, 'counter');
  assert.equal(at('declenchement').decision?.tag, 'trigger');
  assert.ok(at('recherche').decision?.cards?.length);
  const charged = at('charge');
  assert.ok(charged.players.every((p) => p.chars.length === 5 && p.stage));
  assert.ok(charged.mods.some((m) => m.stat === 'power' && m.amount > 0) && charged.mods.some((m) => m.stat === 'power' && m.amount < 0));
  const attack = boardState('attaque');
  assert.ok(attack.state.decision?.options.some((o) => o.id === `attack:${attack.aim!.attacker}:${attack.aim!.target}`));
  for (const [name, winner] of [['victoire', 0], ['defaite', 1]] as const) {
    const end = boardState(name);
    assert.equal(end.state.winner, winner, name);
    assert.ok(end.moves!.length >= 2 && end.reviews!.length === end.moves!.length, name);
  }
  const don = (name: string) => {
    const p = at(name).players[0];
    return p.donActive + p.donRested + [p.leader, ...p.chars].reduce((sum, c) => sum + c.don, 0);
  };
  assert.deepEqual(['don-0', 'don-5', 'don-10'].map(don), [0, 5, 10]);
});

test('chaque état a sa page dans l’atelier', () => {
  const pages = readdirSync(HERE).filter((f) => f.startsWith('plateau-')).map((f) => f.replace(/^plateau-|\.atelier\.tsx$/g, ''));
  assert.deepEqual(pages.sort(), [...BOARD_STATES].sort());
});
