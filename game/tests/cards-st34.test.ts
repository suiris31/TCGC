// ST-34 Katakuri (violet) : un test par carte à effet, d'après le texte officiel
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { def, donOnField, hasBlocker, power } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const D: [string, string] = ['ST-34', 'ST-36'];

test('Katakuri (Leader) : [Attaque adverse] DON!! −1 pour regarder le dessus du deck adverse et gagner +1000', () => {
  let s = scenario(D, (g) => {
    setChars(g, 1, [{ num: 'OP10-101' }]);
    setDon(g, 0, 2);
    setHand(g, 0, ['OP11-068']); // une carte de Contre : le combat s'arrête à la décision de Contre
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  expectTag(s, 'mayKatakuri');
  s = choose(s, 'yes');
  assert.equal(donOnField(s, 0), 1);
  assert.equal(s.peek[0], s.players[1].deck[0].uid);
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  coherent(s);
});

test('Katakuri (ST34-001) : [En cas de KO] joue un Personnage de 8000 ou moins de ma main', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST34-001', extra: { rested: true } }]);
    setHand(g, 0, ['OP11-068', 'ST34-004']);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].chars[0].uid);
  // [Attaque adverse] du Leader : il se déclenche à chaque attaque adverse, même sur un Personnage
  expectTag(s, 'mayKatakuri');
  s = choose(s, 'no');
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Linlin/.test(o.label)), '12000 de puissance');
  s = choose(s, /Daifuku/);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP11-068'));
  coherent(s);
});

test('Brûlée : 3 cartes du dessus, 1 carte {Équipage de Big Mom}', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST34-003']);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP11-068', 'OP11-079', 'EB03-032']);
  });
  s = play(s, 'ST34-003');
  expectTag(s, 'pick');
  assert.equal(s.decision!.options.length, 4);
  s = choose(s, /Tes petits stratagèmes/);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP11-079'));
  coherent(s);
});

test('Linlin : DON!! −4 et défausser 1 carte : 1 Vie de plus, puis puissance de base à 0 pour un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST34-004', 'OP11-068']);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const kidd = s.players[1].chars[0].uid;
  const life = s.players[0].life.length;
  s = play(s, 'ST34-004');
  expectTag(s, 'mayLinlin');
  s = choose(s, 'yes');
  expectTag(s, 'oppBase0');
  s = choose(s, `card:${kidd}`);
  assert.equal(power(s, kidd), 0);
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(donOnField(s, 0), 6);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP11-068'));
  coherent(s);
});

test('Cracker : 1 DON!! épuisée en plus, puis KO d’un Personnage adverse de coût 2 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST34-002']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'ST36-004' }, { num: 'ST36-001' }]);
  });
  const barto = s.players[1].chars[0].uid;
  s = play(s, 'ST34-002');
  expectTag(s, 'oppKo');
  s = choose(s, `card:${barto}`);
  assert.equal(s.players[0].donRested, 5);
  assert.ok(s.players[1].trash.some((c) => c.uid === barto));
  coherent(s);
});

test('Baron Delœuf et Pekoms : [En attaquant] DON!! −1 pour mettre KO un Personnage de 2000 de puissance de base ou moins', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST34-005' }]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: 'OP10-103' }, { num: 'ST36-001' }]);
  });
  const bege = s.players[1].chars[0].uid;
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'mayPekoms');
  s = choose(s, 'yes');
  expectTag(s, 'oppKo');
  assert.equal(s.decision!.options.length, 2, 'Bege seulement (Cavendish : 3000)');
  s = choose(s, `card:${bege}`);
  assert.equal(donOnField(s, 0), 0);
  assert.ok(s.players[1].trash.some((c) => c.uid === bege));
});

test('Flampée : [Votre tour] [Jouée] un [Charlotte Katakuri] (le Leader compris) gagne +2000', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['EB03-032']);
    setDon(g, 0, 1);
  });
  s = play(s, 'EB03-032');
  expectTag(s, 'ownPower');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  coherent(s);
});

test('Pudding : [Bloqueur] ; 1 DON!! épuisée si je n’ai pas plus de DON!! que l’adversaire', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['EB03-035']);
    setDon(g, 0, 4);
    setDon(g, 1, 6);
  });
  s = play(s, 'EB03-035');
  assert.equal(donOnField(s, 0), 5);
  assert.ok(hasBlocker(s, 0, s.players[0].chars[0]));
  s = scenario(D, (g) => {
    setHand(g, 0, ['EB03-035']);
    setDon(g, 0, 8);
    setDon(g, 1, 2);
  });
  s = play(s, 'EB03-035');
  assert.equal(donOnField(s, 0), 8);
});

test('Ananas : [Bloqueur] seulement avec un autre Personnage violet {Équipage de Big Mom} (pas une autre Ananas)', () => {
  const blocker = (others: string[]) => {
    const s = scenario(D, (g) => { setChars(g, 0, [{ num: 'OP11-065' }, ...others.map((num) => ({ num }))]); });
    return hasBlocker(s, 0, s.players[0].chars[0]);
  };
  assert.equal(blocker([]), false);
  assert.equal(blocker(['OP11-065']), false);
  assert.equal(blocker(['OP11-068']), true);
});

test('Oven : s’épuiser, déclarer un coût ; si c’est le bon, KO d’un coût de base 3 ou moins ; puis 1 DON!! épuisée', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-066' }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: 'ST36-001' }]);
    setDeckTop(g, 1, ['OP10-101']);
    g.peek[0] = g.players[1].deck[0].uid;
  });
  const cavendish = s.players[1].chars[0].uid;
  s = choose(s, `act:${s.players[0].chars[0].uid}`);
  expectTag(s, 'declareCost');
  s = choose(s, 'cost:5');
  expectTag(s, 'oppKo');
  s = choose(s, `card:${cavendish}`);
  assert.ok(s.players[1].trash.some((c) => c.uid === cavendish));
  assert.equal(s.players[0].donRested, 1);
  assert.equal(s.players[0].chars[0].rested, true);
  coherent(s);
  // coût raté : pas de KO, mais la DON!! quand même
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-066' }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: 'ST36-001' }]);
    setDeckTop(g, 1, ['OP10-101']);
  });
  s = choose(s, `act:${s.players[0].chars[0].uid}`);
  s = choose(s, 'cost:2');
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(s.players[0].donRested, 1);
});

test('« Tes petits stratagèmes... » : [Contre] coût déclaré juste : +5000 ; [Déclenchement] pioche 1', () => {
  let s = scenario(D, (g) => {
    setChars(g, 1, [{ num: 'OP10-101' }]);
    setHand(g, 0, ['OP11-079']);
    setDon(g, 0, 1);
    setDeckTop(g, 1, ['ST36-005']);
    g.peek[0] = g.players[1].deck[0].uid;
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  if (s.decision?.tag === 'mayKatakuri') s = choose(s, 'no');
  s = choose(s, 'cevent');
  expectTag(s, 'declareCost');
  s = choose(s, 'cost:6');
  assert.ok(s.log.some((l) => /repoussée \(7000 contre 10000\)/.test(l.text)));
  coherent(s);

  s = scenario(['ST-36', 'ST-34'], (g) => {
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['OP11-079', 'OP11-068']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  if (s.decision?.tag === 'mayKatakuri') s = choose(s, 'no');
  s = choose(s, 'trigger');
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);
});

test('Sabre impérial : coût déclaré juste : KO d’un coût de base 8 ou moins ; [Déclenchement] 1 DON!! redressée', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP11-081']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    setDeckTop(g, 1, ['ST36-004']);
    g.peek[0] = g.players[1].deck[0].uid;
  });
  const kidd = s.players[1].chars[0].uid;
  s = play(s, 'OP11-081');
  s = choose(s, `cost:${def('ST36-004').cost}`);
  s = choose(s, `card:${kidd}`);
  assert.ok(s.players[1].trash.some((c) => c.uid === kidd));
  coherent(s);

  s = scenario(['ST-36', 'ST-34'], (g) => {
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setDon(g, 1, 2);
    setLife(g, 1, ['OP11-081', 'OP11-068']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  if (s.decision?.tag === 'mayKatakuri') s = choose(s, 'no');
  s = choose(s, 'trigger');
  assert.equal(s.players[1].donActive, 3);
  coherent(s);
});

test('Smoothie : [Tour adverse] [En cas de KO] DON!! −1 pour jouer un {Équipage de Big Mom} de coût ≤ DON!! adverses', () => {
  let s = scenario(['ST-36', 'ST-34'], (g) => {
    setChars(g, 0, [{ num: 'ST36-005' }]);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'P-090', extra: { rested: true } }]);
    setHand(g, 1, ['OP11-068', 'EB03-032', 'ST34-002']);
    setDon(g, 1, 3);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].chars[0].uid);
  if (s.decision?.tag === 'mayKatakuri') s = choose(s, 'no');
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'maySmoothie');
  s = choose(s, 'yes');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Daifuku/.test(o.label)), 'Daifuku coûte 6, l’adversaire n’a que 5 DON!!');
  s = choose(s, /Cracker/);
  assert.ok(s.players[1].chars.some((c) => c.num === 'ST34-002'));
  coherent(s);
});
