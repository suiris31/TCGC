// Interactions entre decks : effets de remplacement, restrictions, [Déclenchement] et zones pleines
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import {
  attack, choose, coherent, expectTag, onField, play, scenario, setChars, setDon, setHand, setLife,
} from './helpers.ts';

test('Bonney contre Dragon : un renvoi dans la Vie peut être remplacé par Dragon (« quitte le terrain »), pas par Ivankov (« mis KO »)', () => {
  let s = scenario(['ST-36', 'ST-35'], (g) => {
    setHand(g, 0, ['P-085']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'OP13-017' }, { num: 'OP13-008' }, { num: 'OP13-005' }]);
  });
  const [dragon, , inazuma] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'P-085');
  s = choose(s, `card:${inazuma}`);
  s = choose(s, 'lifeBottom');
  expectTag(s, 'replace');
  const ids = s.decision!.options.map((o) => o.id);
  assert.deepEqual(ids, [`replace:${dragon}`, 'none']);
  s = choose(s, `replace:${dragon}`);
  assert.ok(onField(s, 1, inazuma));
  assert.equal(s.players[1].life.length, 5);
  coherent(s);
});

test('Bonney contre Koshiro : Koshiro ne remplace que les mises KO', () => {
  let s = scenario(['ST-36', 'ST-32'], (g) => {
    setHand(g, 0, ['P-085']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'OP12-027' }, { num: 'ST32-005' }]);
  });
  const zoro = s.players[1].chars[1].uid;
  s = play(s, 'P-085');
  s = choose(s, `card:${zoro}`);
  s = choose(s, 'lifeTop');
  assert.notEqual(s.decision?.tag, 'replace');
  assert.ok(!onField(s, 1, zoro));
  assert.equal(s.players[1].life[0].uid, zoro);
  assert.equal(s.players[1].life[0].faceUp, true);
  coherent(s);
});

test('Une carte de Vie face visible (Bonney) revient en main face cachée quand le Leader est touché', () => {
  let s = scenario(['ST-36', 'ST-32'], (g) => {
    setHand(g, 0, ['P-085']);
    setDon(g, 0, 6);
    g.players[0].leader.don = 0;
    setChars(g, 1, [{ num: 'ST32-005' }]);
    setHand(g, 1, []);
  });
  const zoro = s.players[1].chars[0].uid;
  s = play(s, 'P-085');
  s = choose(s, `card:${zoro}`);
  s = choose(s, 'lifeTop');
  s = choose(s, `don:${s.players[0].leader.uid}`);
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  const back = s.players[1].hand.find((c) => c.uid === zoro);
  assert.ok(back, 'la carte est revenue en main');
  assert.equal(back!.faceUp, undefined);
  coherent(s);
});

test('Oden contre un Bloqueur : un Personnage qui ne peut pas être épuisé ne peut ni bloquer ni attaquer', () => {
  let s = scenario(['ST-32', 'ST-35'], (g) => {
    setHand(g, 0, ['ST32-002']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST35-001' }]); // Hack, [Bloqueur], coût de base 4
    setHand(g, 1, []);
  });
  const hack = s.players[1].chars[0].uid;
  s = play(s, 'ST32-002');
  s = choose(s, `card:${hack}`);
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.kind, 'blocker', 'Hack ne peut pas bloquer');
  coherent(s);
  // pendant le tour adverse, Hack ne peut pas non plus attaquer
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.ok(!s.decision!.options.some((o) => o.id.startsWith(`attack:${hack}:`)));
});

test('[Déclenchement] « jouez cette carte » avec 5 Personnages : il faut en défausser un', () => {
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    setLife(g, 0, ['OP13-005', 'OP13-005', 'OP13-005']); // 3 Vies : le [Déclenchement] de Killer s'applique
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setChars(g, 1, [{ num: 'OP10-101' }, { num: 'OP10-101' }, { num: 'ST36-001' }, { num: 'ST36-004' }, { num: 'OP10-111' }]);
    setLife(g, 1, ['ST36-002', 'OP10-101']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  if (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  s = choose(s, 'trigger');
  expectTag(s, 'fullZone');
  s = choose(s, /Bartolomeo/);
  assert.equal(s.players[1].chars.length, 5);
  assert.ok(s.players[1].chars.some((c) => c.num === 'ST36-002'));
  assert.ok(s.players[1].trash.some((c) => c.num === 'ST36-004'));
  coherent(s);
});
