// ST-35 Sabo (rouge/noir) : les cartes à effet pas encore couvertes par st35.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldCost, hasBlocker, power } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, onField, play, scenario, setChars, setDon, setHand,
} from './helpers.ts';

const D: [string, string] = ['ST-35', 'ST-36'];

test('Belo Betty : [En attaquant] 2 cartes du deck à la Défausse pour −2 de coût à un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-090', extra: { don: 2 } }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const kidd = s.players[1].chars[0].uid;
  const trash = s.players[0].trash.length;
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'mayBetty');
  s = choose(s, 'yes');
  s = choose(s, `card:${kidd}`);
  assert.equal(fieldCost(s, kidd), 4);
  assert.equal(s.players[0].trash.length, trash + 2);
});

test('Corbeau : [En attaquant] 2 cartes du deck à la Défausse ; l’adversaire avec 7 cartes ou plus en défausse 1', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST35-003', extra: { don: 2 } }]);
    setDon(g, 0, 0);
    setHand(g, 1, ['OP10-101', 'OP10-101', 'ST36-001', 'ST36-001', 'ST36-004', 'ST36-004', 'OP10-111']);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'mayCorbeau');
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  assert.equal(s.decision!.player, 1);
  s = choose(s, /Bartolomeo/);
  assert.equal(s.players[1].hand.length, 6);
});

test('Morley et Koala (OP13-081) : coût 8 avec un Leader {Armée révolutionnaire} ; Koala recycle la Défausse pour 1 DON!!', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-093' }, { num: 'OP13-081' }]);
    setDon(g, 0, 0, 1);
    g.players[0].trash.push(g.players[0].deck.shift()!);
  });
  const [morley, koala] = s.players[0].chars.map((c) => c.uid);
  assert.equal(fieldCost(s, morley), 8);
  assert.equal(fieldCost(s, koala), 8);
  s = choose(s, `act:${koala}`);
  s = choose(s, (o) => o.id.startsWith('card:'));
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(s.players[0].trash.length, 0);
  coherent(s);
});

test('Inazuma : [Jouée] 1 DON!! épuisée au Leader ; Lindbergh : −3000 à un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP13-005', 'ST35-002']);
    setDon(g, 0, 8);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const kidd = s.players[1].chars[0].uid;
  s = play(s, 'OP13-005');
  assert.equal(s.players[0].leader.don, 1);
  s = play(s, 'ST35-002');
  s = choose(s, `card:${kidd}`);
  assert.equal(power(s, kidd), 4000);
  coherent(s);
});

test('Sabo (P-105) : [Jouée] une carte du dessus ou du dessous de la Vie en main, puis 1 DON!! épuisée', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['P-105']);
    setDon(g, 0, 4);
  });
  const bottom = s.players[0].life.at(-1)!.uid;
  s = play(s, 'P-105');
  expectTag(s, 'lifeToHand');
  s = choose(s, 'bottom');
  assert.ok(s.players[0].hand.some((c) => c.uid === bottom));
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  coherent(s);
});

test('Monkey D. Dragon : remplace la sortie d’un Personnage {Armée révolutionnaire} par −2000 sur lui-même', () => {
  // l'IA (Katakuri) joue Charlotte Cracker et vise Ivankov (coût 2)
  let s = scenario(['ST-35', 'ST-34'], (g) => {
    setChars(g, 0, [{ num: 'OP13-017' }, { num: 'OP13-008' }]);
    setHand(g, 1, ['ST34-002']);
    setDon(g, 1, 4);
  }, 1);
  const [dragon, ivankov] = s.players[0].chars.map((c) => c.uid);
  s = play(s, 'ST34-002', 1);
  s = choose(s, `card:${ivankov}`);
  expectTag(s, 'replace');
  assert.equal(s.decision!.player, 0);
  s = choose(s, `replace:${dragon}`);
  assert.ok(onField(s, 0, ivankov));
  assert.equal(power(s, dragon), 5000);
  coherent(s);
});

test('Koala (ST35-004) : [Bloqueur], coût 8 ; [Jouée] 1 DON!! au Leader puis joue un {Armée révolutionnaire} de 4000 ou moins (main ou Défausse)', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST35-004']);
    setDon(g, 0, 7);
    const hack = g.players[0].deck.findIndex((c) => c.num === 'ST35-001');
    g.players[0].trash.push(...g.players[0].deck.splice(hack, 1));
  });
  s = play(s, 'ST35-004');
  assert.equal(s.players[0].leader.don, 1);
  expectTag(s, 'playFree');
  s = choose(s, /Hack \(Défausse\)/);
  if (s.decision?.tag === 'oppKo') s = choose(s, 'none');
  const koala = s.players[0].chars.find((c) => c.num === 'ST35-004')!;
  assert.equal(fieldCost(s, koala.uid), 8);
  assert.ok(hasBlocker(s, 0, koala));
  assert.ok(s.players[0].chars.some((c) => c.num === 'ST35-001'));
  coherent(s);
});

test('Les flammes d’Ace : épuiser 4 DON!! : −3000 à un Personnage adverse, puis KO d’un Personnage de 3000 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP13-019']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST36-005' }, { num: 'ST36-001' }]);
  });
  const [kidd, cavendish] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'OP13-019');
  expectTag(s, 'mayAce');
  s = choose(s, 'yes');
  s = choose(s, `card:${kidd}`);
  expectTag(s, 'oppKo');
  assert.ok(!s.decision!.options.some((o) => o.id === `card:${kidd}`), 'Kidd a encore 4000');
  s = choose(s, `card:${cavendish}`);
  assert.equal(power(s, kidd), 4000);
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
});
