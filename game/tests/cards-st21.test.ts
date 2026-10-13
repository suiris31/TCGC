// Deck pour débutant EX Gear 5 (ST-21) : un test par carte à effet, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from '../engine/engine.ts';
import { attackAbility, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

const DECK = 'ST-21';
const USOPP = 'ST21-002';
const SANJI = 'ST21-003';
const BONNEY = 'ST21-004';
const JINBE = 'ST21-005';       // 4000 de base, {Équipage de Chapeau de paille}, sans effet
const CHOPPER = 'ST21-008';     // 6000, {Équipage de Chapeau de paille}, sans effet
const NAMI = 'ST21-009';
const ROBIN = 'ST21-010';
const FRANKY = 'ST21-011';
const BROOK = 'ST21-012';
const VEGAPUNK = 'ST21-013';    // pas {Équipage de Chapeau de paille}
const LUFFY = 'ST21-014';
const ZORO = 'ST21-015';
const DAWN = 'ST21-016';        // Gum Gum Dawn Whip
const MOLE = 'ST21-017';        // Gum Gum Taupe Bullet
// adversaire ST-22
const VISTA = 'ST22-009';       // [Bloqueur], 1000
const DECALVAN = 'ST22-008';    // 4000
const ELMY = 'ST22-004';        // 5000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);

test('Usopp : [DON!! x2] [Tour adverse] +2000', () => {
  const s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: USOPP, extra: { don: 2 } }, { num: USOPP, extra: { don: 1 } }]);
  }, 1);
  assert.equal(power(s, s.players[0].chars[0].uid), 5000);
  assert.equal(power(s, s.players[0].chars[1].uid), 3000, '1 DON!! seulement');
  const mineTurn = scenario([DECK, 'ST-22'], (g) => { setChars(g, 0, [{ num: USOPP, extra: { don: 2 } }]); });
  assert.equal(power(mineTurn, mineTurn.players[0].chars[0].uid), 5000, 'son tour : +2000 des DON!! seulement');
});

test('Sanji : [Jouée] un Personnage {Équipage de Chapeau de paille} de 6000 ou plus ne peut pas être bloqué ce tour-ci', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [SANJI]);
    setChars(g, 0, [{ num: CHOPPER }, { num: JINBE }]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: VISTA }]);
  });
  s = play(s, SANJI);
  expectTag(s, 'ownGrant');
  assert.equal(hasOption(s, `card:${mine(s, JINBE).uid}`), false, '4000 : pas proposé');
  s = choose(s, `card:${mine(s, CHOPPER).uid}`);
  s = attack(s, mine(s, CHOPPER).uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.kind, 'blocker', 'Vista ne peut pas bloquer');
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [SANJI]);
    setChars(g, 0, [{ num: JINBE }]);
    setDon(g, 0, 2);
  });
  s = play(s, SANJI);
  assert.notEqual(s.decision?.tag, 'ownGrant', 'aucun Personnage de 6000 ou plus');
});

test('Jewelry Bonney : [DON!! x2] [En cas de KO] piocher 1 carte', () => {
  for (const don of [2, 1]) {
    let s = scenario([DECK, 'ST-22'], (g) => {
      setHand(g, 0, []);
      setChars(g, 0, [{ num: BONNEY, extra: { don, rested: true } }]);
      setDon(g, 0, 0);
      setChars(g, 1, [{ num: ELMY }]);
    }, 1);
    s = noCounter(attack(s, theirs(s, ELMY).uid, mine(s, BONNEY).uid));
    assert.equal(s.players[0].chars.length, 0, 'Bonney mise KO');
    assert.equal(s.players[0].hand.length, don === 2 ? 1 : 0);
    coherent(s);
  }
});

test('Nami : [Une fois par tour] jusqu’à 2 DON!! épuisées à son Leader ou à un Personnage {Équipage de Chapeau de paille}', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: NAMI }, { num: CHOPPER }, { num: VEGAPUNK }]);
    setDon(g, 0, 1, 3);
  });
  s = act(s, `act:${mine(s, NAMI).uid}`);
  expectTag(s, 'donTarget');
  assert.equal(hasOption(s, `card:${mine(s, VEGAPUNK).uid}`), false, 'Végapunk n’est pas {Équipage de Chapeau de paille}');
  assert.ok(hasOption(s, `card:${s.players[0].leader.uid}`));
  s = choose(s, `card:${mine(s, CHOPPER).uid}`);
  assert.equal(mine(s, CHOPPER).don, 2);
  assert.equal(s.players[0].donRested, 1);
  assert.equal(hasOption(s, `act:${mine(s, NAMI).uid}`), false, 'une fois par tour');
  coherent(s);
});

test('Nico Robin : [DON!! x2] [En attaquant] KO d’un Personnage adverse de 4000 ou moins', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: ROBIN, extra: { don: 2 } }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: DECALVAN }, { num: ELMY }]);
  });
  s = attack(s, mine(s, ROBIN).uid, s.players[1].leader.uid);
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, ELMY).uid}`), false, '5000 : pas proposé');
  s = choose(s, `card:${theirs(s, DECALVAN).uid}`);
  assert.equal(theirs(s, DECALVAN), undefined);
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: ROBIN, extra: { don: 1 } }]);
    setChars(g, 1, [{ num: DECALVAN }]);
  });
  s = attack(s, mine(s, ROBIN).uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'oppKo', '1 DON!! seulement');
});

test('Franky : [DON!! x2] [Tour adverse] ses Personnages {Équipage de Chapeau de paille} de 4000 de base ou moins +1000', () => {
  const setup = (don: number) => (g: GameState) => {
    setChars(g, 0, [{ num: FRANKY, extra: { don } }, { num: USOPP }, { num: CHOPPER }, { num: VEGAPUNK }]);
  };
  let s = scenario([DECK, 'ST-22'], setup(2), 1);
  assert.equal(power(s, mine(s, FRANKY).uid), 5000, 'lui-même');
  assert.equal(power(s, mine(s, USOPP).uid), 4000);
  assert.equal(power(s, mine(s, CHOPPER).uid), 6000, '6000 de base : rien');
  assert.equal(power(s, mine(s, VEGAPUNK).uid), 3000, 'pas {Équipage de Chapeau de paille}');
  assert.equal(power(s, s.players[0].leader.uid), 5000, 'pas le Leader');
  s = scenario([DECK, 'ST-22'], setup(1), 1);
  assert.equal(power(s, mine(s, USOPP).uid), 3000, '1 DON!! seulement');
  s = scenario([DECK, 'ST-22'], setup(2));
  assert.equal(power(s, mine(s, USOPP).uid), 3000, 'son tour');
});

test('Brook et Luffy (ST21-014) : [En attaquant] DON!! épuisées à son Leader ou à un Personnage ; Luffy a [Initiative]', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: BROOK }, { num: CHOPPER }]);
    setDon(g, 0, 0, 3);
  });
  s = attack(s, mine(s, BROOK).uid, s.players[1].leader.uid);
  expectTag(s, 'donTarget');
  s = choose(s, `card:${mine(s, BROOK).uid}`);
  assert.equal(mine(s, BROOK).don, 2);
  assert.equal(s.players[0].donRested, 1);
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [LUFFY]);
    setDon(g, 0, 5, 2);
  });
  s = play(s, LUFFY);
  assert.ok(attackAbility(s, 0, mine(s, LUFFY)).can, '[Initiative]');
  s = attack(s, mine(s, LUFFY).uid, s.players[1].leader.uid);
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(s.players[0].donRested, 6, '1 DON!! seulement (5 épuisées pour jouer Luffy)');
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: BROOK }]);
    setDon(g, 0, 3, 0);
  });
  s = attack(s, mine(s, BROOK).uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'donTarget', 'aucune DON!! épuisée');
});

test('Roronoa Zoro : [DON!! x2] [Initiative] ; [En cas de KO] jouer un Personnage rouge de 6000 ou moins autre que Zoro', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: ZORO, extra: { don: 2, playedTurn: 5 } }, { num: ZORO, extra: { don: 1, playedTurn: 5 } }]);
  });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, true);
  assert.equal(attackAbility(s, 0, s.players[0].chars[1]).can, false, '1 DON!! seulement');

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [CHOPPER, ZORO, LUFFY]);
    setChars(g, 0, [{ num: ZORO, extra: { rested: true } }]);
    setChars(g, 1, [{ num: ELMY }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, ELMY).uid, mine(s, ZORO).uid));
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Roronoa Zoro')), false, 'pas un autre Zoro');
  s = choose(s, (o) => o.label.startsWith('Tony-Tony Chopper'));
  assert.ok(mine(s, CHOPPER));
  coherent(s);
});

test('Gum Gum Dawn Whip : +1000, puis un Personnage de 4000 ou moins ne peut pas bloquer ; [Déclenchement] KO 4000 ou moins', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [DAWN]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: VISTA }, { num: ELMY }]);
  });
  s = play(s, DAWN);
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  expectTag(s, 'oppLock');
  assert.equal(hasOption(s, `card:${theirs(s, ELMY).uid}`), false, '5000 : pas proposé');
  s = choose(s, `card:${theirs(s, VISTA).uid}`);
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.kind, 'blocker', 'Vista ne peut plus bloquer');
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [DAWN, CHOPPER]);
    setChars(g, 1, [{ num: ELMY }, { num: DECALVAN }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, ELMY).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, ELMY).uid}`), false);
  s = choose(s, `card:${theirs(s, DECALVAN).uid}`);
  assert.equal(theirs(s, DECALVAN), undefined);
  coherent(s);
});

test('Gum Gum Taupe Bullet : −5000, puis avec un Personnage de 6000 ou plus, KO d’un Personnage de 2000 ou moins', () => {
  const setup = (withChopper: boolean) => (g: GameState) => {
    setHand(g, 0, [MOLE]);
    setDon(g, 0, 4);
    setChars(g, 0, withChopper ? [{ num: CHOPPER }] : [{ num: JINBE }]);
    setChars(g, 1, [{ num: ELMY }]);
  };
  let s = scenario([DECK, 'ST-22'], setup(true));
  s = play(s, MOLE);
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.equal(power(s, theirs(s, ELMY).uid), 0);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);

  s = scenario([DECK, 'ST-22'], setup(false));
  s = play(s, MOLE);
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.notEqual(s.decision?.tag, 'oppKo', 'aucun Personnage de 6000 ou plus');
  assert.equal(s.players[1].chars.length, 1);
});
