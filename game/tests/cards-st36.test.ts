// ST-36 Kid (jaune) : un test par carte à effet, d'après le texte officiel
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { power } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, hasOption, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const D: [string, string] = ['ST-36', 'ST-35'];

test('Killer : [Votre tour] [Jouée] avec un Leader {Équipage de Kidd}, la carte du dessus du deck va sur la Vie', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST36-002']);
    setDon(g, 0, 4);
  });
  const life = s.players[0].life.length;
  s = play(s, 'ST36-002');
  assert.equal(s.players[0].life.length, life + 1);
  coherent(s);
});

test('Scratchmen Apoo : [Déclenchement] pioche 1, puissance de base du Leader {Supernovae} à 7000 pour le tour', () => {
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['ST36-003', 'OP10-101']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(power(s, s.players[1].leader.uid), 7000);
  coherent(s);
});

test('Kidd (ST36-005) : retourner une Vie face visible pour donner 1 DON!! épuisée au Leader (une fois par tour)', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST36-005' }]);
    setDon(g, 0, 0, 1);
  });
  const kidd = s.players[0].chars[0].uid;
  s = choose(s, `act:${kidd}`);
  expectTag(s, 'lifeSide');
  s = choose(s, 'top');
  assert.equal(s.players[0].life[0].faceUp, true);
  assert.equal(s.players[0].leader.don, 1);
  assert.ok(!hasOption(s, `act:${kidd}`));
  coherent(s);
});

test('Cavendish : [En cas de KO] défausser 1 carte pour ajouter la carte du dessus du deck à la Vie', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST36-001', extra: { rested: true } }]);
    setHand(g, 0, ['OP10-101']);
    setChars(g, 1, [{ num: 'OP13-017' }]);
  }, 1);
  const life = s.players[0].life.length;
  s = attack(s, s.players[1].chars[0].uid, s.players[0].chars[0].uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'mayDiscard');
  s = choose(s, 'yes');
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Bartolomeo : défausser 1 carte {Supernovae} pour piocher 2 cartes', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST36-004', 'OP10-101']);
    setDon(g, 0, 1);
  });
  s = play(s, 'ST36-004');
  expectTag(s, 'mayDiscard');
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 2);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP10-101'));
  coherent(s);
});

test('Capone Bege : une carte de la Vie en main, puis un Personnage {Supernovae} de la main face visible sur la Vie', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP10-103', 'ST36-002']);
    setDon(g, 0, 1);
    setLife(g, 0, ['OP10-101', 'ST36-001', 'ST36-004']);
  });
  s = play(s, 'OP10-103');
  expectTag(s, 'begeLife');
  s = choose(s, 'top');
  expectTag(s, 'toLife');
  s = choose(s, /Killer/);
  assert.equal(s.players[0].life.length, 3);
  assert.equal(s.players[0].life[0].num, 'ST36-002');
  assert.equal(s.players[0].life[0].faceUp, true);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP10-101'));
  coherent(s);
});

test('Basil Hawkins : [Déclenchement] pioche 2 cartes et en défausse 1', () => {
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['OP10-109', 'OP10-101']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  expectTag(s, 'discard');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);
});

test('Monkey D. Luffy (OP10-111) : 5 cartes du dessus, 1 carte {Supernovae} autre que Luffy', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP10-111']);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP10-111', 'P-088', 'OP10-101', 'ST36-003', 'P-085']);
  });
  s = play(s, 'OP10-111');
  expectTag(s, 'pick');
  assert.ok(!s.decision!.options.some((o) => o.label === 'Monkey D. Luffy'));
  s = choose(s, /Trafalgar Law/);
  assert.ok(s.players[0].hand.some((c) => c.num === 'P-088'));
  coherent(s);
});

test('X-Drake (OP10-114) : s’épuiser pour épuiser un coût 4 ou moins, si je n’ai pas plus de Vie que l’adversaire', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP10-114' }]);
    setChars(g, 1, [{ num: 'ST35-001' }]);
  });
  const xdrake = s.players[0].chars[0].uid;
  const hack = s.players[1].chars[0].uid;
  s = choose(s, `act:${xdrake}`);
  s = choose(s, `card:${hack}`);
  assert.equal(s.players[1].chars[0].rested, true);
  assert.equal(s.players[0].chars[0].rested, true);
  coherent(s);
  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP10-114' }]);
    setChars(g, 1, [{ num: 'ST35-001' }]);
    g.players[1].deck.push(...g.players[1].life.splice(0, 2));
  });
  assert.ok(!hasOption(s, `act:${s.players[0].chars[0].uid}`), 'plus de Vie que l’adversaire');
});

test('Roronoa Zoro (OP12-113) : [En cas de KO] joue épuisé un {Supernovae} de coût 4 ou moins ; [Déclenchement] KO d’un coût 1 et retour en main', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-113', extra: { rested: true } }]);
    setHand(g, 0, ['ST36-002', 'OP10-101']);
    setChars(g, 1, [{ num: 'OP13-017' }]);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].chars[0].uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => /Urouge/.test(o.label)), 'Urouge coûte 5');
  s = choose(s, /Killer/);
  const killer = s.players[0].chars.find((c) => c.num === 'ST36-002')!;
  assert.equal(killer.rested, true);
  coherent(s);

  // [Déclenchement] : Luffy (ST-31) touche le Leader Kidd, dont la Vie du dessus est Zoro
  s = scenario(['ST-31', 'ST-36'], (g) => {
    setChars(g, 0, [{ num: 'OP01-016' }]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['OP12-113', 'OP10-101']);
  });
  const nami = s.players[0].chars[0].uid;
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  s = choose(s, `card:${nami}`);
  assert.ok(s.players[0].trash.some((c) => c.uid === nami));
  assert.ok(s.players[1].hand.some((c) => c.num === 'OP12-113'));
  assert.ok(!s.players[1].trash.some((c) => c.num === 'OP12-113'));
  coherent(s);
});

test('« Le plus libre des hommes au monde... » : 5 cartes du dessus, 1 Personnage {Supernovae} ; [Déclenchement] idem', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP13-116']);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP13-116', 'OP10-101', 'ST36-002', 'ST36-003', 'P-085']);
  });
  s = play(s, 'OP13-116');
  expectTag(s, 'pick');
  assert.ok(!s.decision!.options.some((o) => o.label.startsWith('Le plus libre')), 'un Événement n’est pas un Personnage');
  s = choose(s, /Urouge/);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP10-101'));
  coherent(s);
});

test('Trafalgar Law : [Déclenchement] jouée si les deux Vies réunies font 5 ou moins', () => {
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
    setLife(g, 0, ['OP13-005', 'OP13-005', 'OP13-005']);
    setHand(g, 1, []);
    setLife(g, 1, ['P-088', 'OP10-101']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  assert.ok(s.players[1].chars.some((c) => c.num === 'P-088'));
  coherent(s);
});
