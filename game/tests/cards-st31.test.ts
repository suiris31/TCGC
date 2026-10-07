// ST-31 Luffy (rouge) : un test par carte à effet, d'après le texte officiel
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { hasBlocker, power } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, hasOption, logHas, onField, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const D: [string, string] = ['ST-31', 'ST-35'];

test('Luffy (Leader) : [DON!! x1] donne jusqu’à 2 DON!! épuisées à 1 Personnage, une fois par tour', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-003' }]);
    setDon(g, 0, 0, 3);
  });
  const L = s.players[0].leader.uid;
  assert.ok(!hasOption(s, `act:${L}`), 'sans DON!! sur le Leader, pas d’effet');
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-003' }]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0, 3);
  });
  s = choose(s, `act:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].chars[0].don, 2);
  assert.equal(s.players[0].donRested, 1);
  assert.ok(!hasOption(s, `act:${s.players[0].leader.uid}`), 'une fois par tour');
  coherent(s);
});

test('Nami : 5 cartes du dessus, 1 carte {Équipage de Chapeau de paille} autre que Nami', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP01-016']);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP01-016', 'OP11-003', 'OP11-009', 'P-101', 'OP04-016']);
  });
  s = play(s, 'OP01-016');
  expectTag(s, 'pick');
  assert.ok(!s.decision!.options.some((o) => o.label === 'Nami'));
  s = choose(s, /Usopp/);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP11-003'));
  assert.equal(s.players[0].deck.slice(-4).filter((c) => ['OP01-016', 'OP11-009', 'P-101', 'OP04-016'].includes(c.num)).length, 4);
  coherent(s);
});

test('Menu « Bonnes manières » : [Contre] défausser 1 carte pour +3000 ; [Déclenchement] −3000 au Leader adverse', () => {
  // l'IA (Sabo) attaque mon Leader avec Inazuma
  let s = scenario(D, (g) => {
    setChars(g, 1, [{ num: 'OP13-005' }]);
    setHand(g, 0, ['OP04-016', 'OP11-003']);
    setDon(g, 0, 0);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  expectTag(s, 'mayDiscard');
  s = choose(s, 'yes');
  assert.ok(logHas(s, '+3000 de puissance pour le combat'));
  assert.ok(logHas(s, /repoussée \(5000 contre 8000\)/));
  coherent(s);

  // je (Sabo) touche le Leader Luffy, dont la Vie du dessus est le Menu
  s = scenario(['ST-35', 'ST-31'], (g) => {
    g.players[0].leader.don = 2;
    setDon(g, 0, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['OP04-016', 'OP11-003', 'OP11-003']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 6000 - 3000); // Sabo : 5000 −1000 (5 Vies) +2000 (DON!!)
  coherent(s);
});

test('Nico Robin : [DON!! x2] [En attaquant] −2000 jusqu’à la fin du prochain tour adverse', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-009', extra: { don: 2 } }]);
    setChars(g, 1, [{ num: 'OP13-005' }]);
    setDon(g, 0, 0);
  });
  const target = s.players[1].chars[0].uid;
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${target}`);
  const mod = s.mods.find((m) => m.source === 'Nico Robin');
  assert.equal(mod?.until, s.turn + 1);
  // avec 1 seule DON!!, pas d'effet
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-009', extra: { don: 1 } }]);
    setChars(g, 1, [{ num: 'OP13-005' }]);
    setDon(g, 0, 0);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'oppPower');
});

test('Franky : pendant mon tour, quand l’adversaire active un Événement, tous mes Personnages +2000', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP11-012' }, { num: 'OP11-003' }]);
    setDon(g, 0, 0);
    setHand(g, 1, ['OP12-098']);
    setDon(g, 1, 1);
  });
  const usopp = s.players[0].chars[1].uid;
  s = attack(s, usopp, s.players[1].leader.uid);
  s = choose(s, 'cevent');
  assert.ok(logHas(s, 'Franky : tous ses Personnages gagnent +2000'));
  assert.equal(power(s, usopp), 8000);
  coherent(s);
});

test('Gum Gum Rafale : 1 DON!! épuisée à un Luffy, puis −2000 à un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP13-021']);
    setDon(g, 0, 1, 1);
    setChars(g, 1, [{ num: 'OP13-005' }]);
  });
  const target = s.players[1].chars[0].uid;
  s = play(s, 'OP13-021');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${target}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(power(s, target), 3000);
  coherent(s);
});

test('Tony-Tony Chopper : [Bloqueur] ; [Jouée] 1 DON!! épuisée au Leader', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['P-101']);
    setDon(g, 0, 4, 1);
  });
  s = play(s, 'P-101');
  assert.equal(s.players[0].leader.don, 1);
  assert.ok(hasBlocker(s, 0, s.players[0].chars[0]));
  coherent(s);
});

test('Luffy (ST23-004) : épuiser 1 DON!! et ce Personnage pour −1000 à un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST23-004' }]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: 'OP13-005' }]);
  });
  const luffy = s.players[0].chars[0].uid;
  const target = s.players[1].chars[0].uid;
  s = choose(s, `act:${luffy}`);
  s = choose(s, `card:${target}`);
  assert.equal(s.players[0].chars[0].rested, true);
  assert.equal(s.players[0].donActive, 0);
  assert.equal(power(s, target), 4000);
  coherent(s);
});

test('Sanji : [Jouée] pioche 1 et joue un {Équipage de Chapeau de paille} de coût 5 ou moins ; [DON!! x2] [Initiative]', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST31-001', 'OP11-003', 'ST31-003']);
    setDon(g, 0, 7);
    setDeckTop(g, 0, ['OP11-009']);
  });
  s = play(s, 'ST31-001');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Sanji/.test(o.label)));
  assert.ok(s.decision!.options.some((o) => /Nico Robin/.test(o.label)), 'la carte piochée est jouable');
  s = choose(s, /Usopp/);
  const sanji = s.players[0].chars.find((c) => c.num === 'ST31-001')!.uid;
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP11-003'));
  assert.ok(!hasOption(s, `attack:${sanji}`), 'sans DON!!, pas d’Initiative');
  s = choose(s, `don:${sanji}`);
  s = choose(s, `don:${sanji}`);
  assert.ok(hasOption(s, `attack:${sanji}:${s.players[1].leader.uid}`));
  coherent(s);
});

test('Jinbe : [Bloqueur] ; [Jouée] pioche 1 et joue une carte {Équipage de Chapeau de paille} de coût 1 (même un Lieu)', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST31-002', 'ST31-005']);
    setDon(g, 0, 5);
  });
  s = play(s, 'ST31-002');
  expectTag(s, 'playFree');
  s = choose(s, /Thousand Sunny/);
  if (s.decision?.tag === 'pick') s = choose(s, 'none');
  assert.equal(s.players[0].stage?.num, 'ST31-005');
  assert.ok(hasBlocker(s, 0, s.players[0].chars.find((c) => c.num === 'ST31-002')!));
  coherent(s);
});

test('Brook : [Tour adverse] avec 3 DON!! données ou plus, [Bloqueur] et +3000', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST31-003' }]);
    g.players[0].leader.don = 3;
    setDon(g, 0, 0);
  }, 1);
  const brook = s.players[0].chars[0];
  assert.equal(power(s, brook.uid), 6000);
  assert.ok(hasBlocker(s, 0, brook));
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST31-003' }]);
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
  }, 1);
  assert.equal(power(s, s.players[0].chars[0].uid), 3000);
  assert.ok(!hasBlocker(s, 0, s.players[0].chars[0]));
  // pendant mon tour : rien
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST31-003' }]);
    g.players[0].leader.don = 3;
    setDon(g, 0, 0);
  });
  assert.ok(!hasBlocker(s, 0, s.players[0].chars[0]));
});

test('Luffy (ST31-004) : [Initiative] avec 3 DON!! données ; [Jouée] −1000 par carte {Équipage de Chapeau de paille}', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST31-004']);
    g.players[0].leader.don = 3;
    setDon(g, 0, 7);
    setChars(g, 1, [{ num: 'OP13-005' }]);
  });
  const target = s.players[1].chars[0].uid;
  s = play(s, 'ST31-004');
  expectTag(s, 'oppPower');
  assert.match(s.decision!.prompt, /−2000/); // le Leader et Luffy lui-même
  s = choose(s, `card:${target}`);
  assert.equal(power(s, target), 3000);
  const luffy = s.players[0].chars.find((c) => c.num === 'ST31-004')!.uid;
  assert.ok(hasOption(s, `attack:${luffy}:${s.players[1].leader.uid}`));
  coherent(s);
});

test('Roronoa Zoro (OP14-015) : [En attaquant] −1000 à un Personnage adverse', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP14-015' }]);
    setChars(g, 1, [{ num: 'OP13-005' }]);
    setDon(g, 0, 0);
  });
  const target = s.players[1].chars[0].uid;
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${target}`);
  assert.equal(power(s, target), 4000);
  assert.ok(onField(s, 1, target));
  void act;
});
