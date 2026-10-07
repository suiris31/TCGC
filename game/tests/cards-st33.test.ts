// ST-33 Kuzan (bleu) : un test par carte à effet, d'après le texte officiel
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { fieldCost, hasBlocker, hasMod } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const D: [string, string] = ['ST-33', 'ST-36'];

test('Bluegrass : [Jouée] un Personnage adverse de coût 1 ou moins au-dessous du deck ; [En attaquant] pioche 1, défausse 1', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['EB04-026']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'ST36-004' }, { num: 'ST36-001' }]);
  });
  const [barto, cavendish] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'EB04-026');
  expectTag(s, 'oppRemove');
  assert.ok(!s.decision!.options.some((o) => o.id === `card:${cavendish}`), 'Cavendish coûte 3');
  s = choose(s, `card:${barto}`);
  assert.equal(s.players[1].deck.at(-1)?.uid, barto);
  coherent(s);

  // en attaquant : pioche 1 et défausse 1 (Marine : le Leader Kuzan pioche 1 ensuite)
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'EB04-026' }]);
    setHand(g, 0, ['OP12-045']);
    setDeckTop(g, 0, ['OP12-052', 'OP12-050']);
    setDon(g, 0, 0);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'discard');
  s = choose(s, /Jango/);
  assert.deepEqual(s.players[0].hand.map((c) => c.num).sort(), ['OP12-050', 'OP12-052']);
});

test('Ice Time : défausser 1 carte, 2 Personnages adverses de 10000 ou moins ne peuvent pas attaquer ; [Déclenchement] renvoi en main', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['EB04-028', 'OP12-045']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'OP10-101' }, { num: 'ST36-005' }, { num: 'ST36-001' }]);
  });
  const [urouge, kidd] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'EB04-028');
  expectTag(s, 'mayDiscard');
  s = choose(s, 'yes');
  expectTag(s, 'oppLock');
  s = choose(s, `card:${urouge}`);
  s = choose(s, `card:${kidd}`);
  assert.ok(hasMod(s, urouge, 'cantAttack') && hasMod(s, kidd, 'cantAttack'));
  assert.equal(s.mods.find((m) => m.uid === urouge && m.stat === 'cantAttack')?.until, s.turn + 1);
  assert.equal(s.players[0].hand.length, 1, 'le Leader Kuzan a pioché 1 carte après la défausse');
  coherent(s);

  // [Déclenchement] : Kidd touche mon Leader, ma Vie du dessus est Ice Time
  s = scenario(['ST-36', 'ST-33'], (g) => {
    setChars(g, 0, [{ num: 'OP10-101', extra: { rested: true } }]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['EB04-028', 'OP12-045']);
  });
  const target = s.players[0].chars[0].uid;
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  expectTag(s, 'bounce');
  s = choose(s, `card:${target}`);
  assert.ok(s.players[0].hand.some((c) => c.uid === target));
  coherent(s);
});

test('Kuzan (OP12-043) : +1 de coût avec 5 cartes en main ; [Jouée] défausser 1 carte, un Personnage adverse ne peut pas attaquer', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-043' }]);
    setHand(g, 0, ['OP12-045', 'OP12-045', 'OP12-052', 'OP12-052', 'OP12-050']);
  });
  assert.equal(fieldCost(s, s.players[0].chars[0].uid), 7);
  s = scenario(D, (g) => {
    setHand(g, 0, ['OP12-043', 'OP12-045']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: 'OP10-101' }]);
  });
  const urouge = s.players[1].chars[0].uid;
  assert.equal(s.players[0].hand.length, 2);
  s = play(s, 'OP12-043');
  s = choose(s, 'yes');
  s = choose(s, `card:${urouge}`);
  assert.ok(hasMod(s, urouge, 'cantAttack'));
  assert.equal(fieldCost(s, s.players[0].chars[0].uid), 6);
  coherent(s);
});

test('Zéphyr : [Jouée] défausse 2 cartes (le Leader Kuzan en pioche 2) ; se placer dans la Défausse pour renvoyer un coût 5 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP12-046', 'OP12-045', 'OP12-052', 'OP12-050']);
    setDon(g, 0, 5);
  });
  s = play(s, 'OP12-046');
  expectTag(s, 'discard');
  s = choose(s, /Jango/);
  s = choose(s, /Fullbody/);
  assert.equal(s.players[0].hand.length, 3);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP12-050'));
  coherent(s);

  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-046' }]);
    setChars(g, 1, [{ num: 'OP10-101' }, { num: 'ST36-005' }]);
  });
  const [urouge, kidd] = s.players[1].chars.map((c) => c.uid);
  s = choose(s, `act:${s.players[0].chars[0].uid}`);
  expectTag(s, 'bounce');
  assert.ok(!s.decision!.options.some((o) => o.id === `card:${kidd}`), 'Kidd coûte 6');
  s = choose(s, `card:${urouge}`);
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP12-046'));
  assert.ok(s.players[1].hand.some((c) => c.uid === urouge));
  coherent(s);
});

test('Sengoku : défausser 1 carte, 2 cartes {Marine} parmi les 5 du dessus ; le Leader Kuzan pioche APRÈS', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP12-047', 'OP12-045']);
    setDon(g, 0, 3);
    setDeckTop(g, 0, ['OP12-047', 'OP12-052', 'OP12-050', 'ST33-001', 'ST33-005', 'OP12-045']);
  });
  s = play(s, 'OP12-047');
  s = choose(s, 'yes');
  expectTag(s, 'pick');
  assert.ok(!s.decision!.options.some((o) => o.label === 'Sengoku'));
  s = choose(s, /Garp/);
  s = choose(s, /Sauro/);
  // les 5 cartes regardées sont celles d'avant la pioche du Leader, qui prend ensuite la 6e (Jango)
  assert.deepEqual(s.players[0].hand.map((c) => c.num).sort(), ['OP12-045', 'OP12-050', 'ST33-005']);
  coherent(s);
});

test('Haguar D. Sauro : [Bloqueur] ; Ice Block : [Contre] +4000 puis défausse 1, [Déclenchement] défausser 1 pour piocher 1', () => {
  let s = scenario(D, (g) => {
    setChars(g, 1, [{ num: 'OP10-101' }]);
    setChars(g, 0, [{ num: 'OP12-050', extra: { rested: true } }]);
    setHand(g, 0, ['OP12-057', 'OP12-045']);
    setDon(g, 0, 1);
  }, 1);
  assert.ok(hasBlocker(s, 0, s.players[0].chars[0]));
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  // +4000 (Urouge 7000 contre 9000), défausse de Jango (seule carte), puis le Leader Kuzan pioche 1
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP12-045'));
  assert.ok(s.log.some((l) => /repoussée \(7000 contre 9000\)/.test(l.text)));
  coherent(s);

  s = scenario(['ST-36', 'ST-33'], (g) => {
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setHand(g, 1, ['OP12-045']);
    setLife(g, 1, ['OP12-057', 'OP12-052']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  s = choose(s, 'trigger');
  s = choose(s, 'yes');
  // défausse Jango, pioche 1, et le Leader Kuzan pioche 1 (Ice Block est {Marine})
  assert.equal(s.players[1].hand.length, 2);
  assert.ok(s.players[1].trash.some((c) => c.num === 'OP12-057'));
  coherent(s);
});

test('Sakazuki : [En attaquant] défausser 1 carte pour que l’adversaire (6 cartes ou plus) en défausse 1 ; [En cas de KO] joue un {Marine} de coût 4 ou moins', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST33-002' }]);
    setHand(g, 0, ['OP12-045']);
    setHand(g, 1, ['OP10-101', 'OP10-101', 'ST36-001', 'ST36-001', 'ST36-004', 'ST36-004']);
    setDon(g, 0, 0);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'mayDiscard');
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  assert.equal(s.decision!.player, 1);
  s = choose(s, /Bartolomeo/);
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.players[0].hand.length, 1, 'le Leader Kuzan pioche après la défausse de Sakazuki');
  coherent(s);

  // mis KO par Urouge pendant le tour adverse : joue Fullbody (coût 4) de ma main
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST33-002', extra: { rested: true } }]);
    setHand(g, 0, ['OP12-052', 'ST33-005']);
    setChars(g, 1, [{ num: 'OP10-101' }]);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].chars[0].uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Garp/.test(o.label)), 'Garp coûte 6');
  s = choose(s, /Fullbody/);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP12-052'));
  coherent(s);
});

test('Smoker : défausser 1 carte pour placer au-dessous du deck 2 Personnages adverses de coût 2 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST33-003', 'OP12-045']);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: 'ST36-004' }, { num: 'OP10-111' }, { num: 'ST36-001' }]);
  });
  const [barto, luffy] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'ST33-003');
  s = choose(s, 'yes');
  s = choose(s, `card:${barto}`);
  s = choose(s, `card:${luffy}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), ['ST36-001']);
  assert.deepEqual(s.players[1].deck.slice(-2).map((c) => c.uid), [barto, luffy]);
  coherent(s);
});

test('Garp : avec un Leader {Marine}, joue un Personnage bleu {Marine} de 8000 ou moins autre que Garp', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST33-005', 'ST33-005', 'OP12-045', 'OP12-050']);
    setDon(g, 0, 6);
  });
  s = play(s, 'ST33-005');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Garp/.test(o.label)));
  s = choose(s, /Jango/);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP12-045'));
  coherent(s);
  void act;
});
