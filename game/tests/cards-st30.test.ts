// Deck pour débutant EX Luffy & Ace (ST-30) : un test par carte à effet, condition vraie et condition fausse. Le deck
// n'a aucun Personnage de 7000 de puissance de base ou plus : un deck d'essai en ajoute (comme un deck personnalisé).
import assert from 'node:assert/strict';
import test from 'node:test';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, hasMod, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const DECK = 'ST-30';
const INAZUMA = 'ST30-002';
const NEWGATE = 'ST30-003';    // 6000, coût 8
const IVANKOV = 'ST30-004';
const JOZ = 'ST30-005';        // 6000, sans effet
const JINBE = 'ST30-006';      // 6000
const ACE = 'ST30-007';        // 6000
const MARCO = 'ST30-008';      // 6000, [Bloqueur]
const OARS = 'ST30-009';       // Little Oz Junior, 2000
const CROC = 'ST30-010';
const BUGGY = 'ST30-011';      // 1000, [Bloqueur]
const LUFFY = 'ST30-012';      // 6000
const MR3 = 'ST30-014';        // 3000
const ERA = 'ST30-015';        // « Cette ère... c'est celle de Barbe Blanche !! »
const READY = 'ST30-016';      // « Prêt à te battre, Luffy ?! »
const TROUBLE = 'ST30-017';    // « Tu fonces toujours tête baissée... »
const BIG = 'ST22-013';        // Little Oz Junior (ST-22) : 7000
// adversaire ST-22
const VISTA = 'ST22-009';      // [Bloqueur], 1000
const ELMY = 'ST22-004';       // 5000, coût 3
const OPP_OARS = 'ST22-013';   // 7000, coût 5
const OPP_MARCO = 'ST22-012';
const FIREFIST = 'ST22-017';   // révéler 2 cartes : piocher 1, puis un Personnage de coût 5 ou moins sous le deck

const TEST = 'TEST-ST30';
DECKS[TEST] = { id: TEST, name: 'Essai', series: 'TEST', leader: 'ST30-001', cards: { [ACE]: 4, [LUFFY]: 4, [BIG]: 4, [JOZ]: 4, [MR3]: 34 } };

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);

test('Leader Luffy et Ace : −2000 avec un Personnage de 7000 de base ou plus ; [Tour adverse] ses Ace et Luffy +3000', () => {
  let s = scenario([DECK, 'ST-22'], (g) => { setChars(g, 0, [{ num: ACE }, { num: LUFFY }, { num: JOZ }]); }, 1);
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  assert.equal(power(s, mine(s, ACE).uid), 9000);
  assert.equal(power(s, mine(s, LUFFY).uid), 9000);
  assert.equal(power(s, mine(s, JOZ).uid), 6000, 'Joz : rien');
  s = scenario([DECK, 'ST-22'], (g) => { setChars(g, 0, [{ num: ACE }]); });
  assert.equal(power(s, mine(s, ACE).uid), 6000, 'son tour : rien');
  s = scenario([TEST, 'ST-22'], (g) => { setChars(g, 0, [{ num: BIG }]); });
  assert.equal(power(s, s.players[0].leader.uid), 4000, 'Personnage de 7000 de base');
});

test('Inazuma et « Tu fonces toujours... » : 5 cartes du dessus, un Personnage de 6000 de puissance', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [INAZUMA]);
    setDeckTop(g, 0, [MR3, ACE, TROUBLE, BUGGY, JOZ]);
    setDon(g, 0, 1);
  });
  s = play(s, INAZUMA);
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Portgas D. Ace', 'Joz', 'Aucune']);
  s = keepOrder(choose(s, (o) => o.label === 'Joz'));
  assert.ok(s.players[0].hand.some((c) => c.num === JOZ));
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [TROUBLE, JOZ]);
    setDeckTop(g, 0, [MR3, BUGGY, OARS, CROC, INAZUMA]);
    setChars(g, 1, [{ num: OPP_OARS }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Crocodile', 'Aucune'], 'seul Crocodile a 6000');
});

test('Edward Newgate (ST30-003) : [Votre tour] ses Personnages de 6000 de puissance de base +1000', () => {
  let s = scenario([DECK, 'ST-22'], (g) => { setChars(g, 0, [{ num: NEWGATE }, { num: ACE }, { num: MR3 }]); });
  assert.equal(power(s, mine(s, NEWGATE).uid), 7000, 'lui-même');
  assert.equal(power(s, mine(s, ACE).uid), 7000);
  assert.equal(power(s, mine(s, MR3).uid), 3000);
  s = scenario([DECK, 'ST-22'], (g) => { setChars(g, 0, [{ num: NEWGATE }, { num: JOZ }]); }, 1);
  assert.equal(power(s, mine(s, JOZ).uid), 6000, 'tour adverse');
});

test('Emporio Ivankov et Jinbe : révéler 2 / défausser 1 Personnage de 6000 pour piocher', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [IVANKOV, ACE, LUFFY]);
    setDon(g, 0, 1);
  });
  s = play(s, IVANKOV);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  s = choose(s, (o) => o.label === 'Portgas D. Ace');
  expectTag(s, 'discard');
  s = choose(s, (o) => o.label === 'Portgas D. Ace');
  s = choose(s, (o) => o.label === 'Monkey D. Luffy');
  assert.equal(s.players[0].hand.length, 3, '2 + 3 − 2');
  coherent(s);
  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [IVANKOV, ACE, MR3]);
    setDon(g, 0, 1);
  });
  s = play(s, IVANKOV);
  assert.notEqual(s.decision?.tag, 'may', 'un seul Personnage de 6000');

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [JINBE, ACE]);
    setDon(g, 0, 5);
  });
  s = play(s, JINBE);
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 2);
  assert.ok(s.players[0].trash.some((c) => c.num === ACE));
  coherent(s);
  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [JINBE, MR3]);
    setDon(g, 0, 5);
  });
  s = play(s, JINBE);
  assert.notEqual(s.decision?.tag, 'may', 'Mr 3 n’a pas 6000');
});

test('Portgas D. Ace et Monkey D. Luffy (ST-30) : épuiser 1 DON!! pour [Initiative] ; en attaquant −1000 / épuiser un [Bloqueur]', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [ACE]);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: ELMY }]);
  });
  s = play(s, ACE);
  s = choose(s, 'yes');
  assert.ok(attackAbility(s, 0, mine(s, ACE)).can);
  assert.equal(s.players[0].donActive, 0);
  s = attack(s, mine(s, ACE).uid, s.players[1].leader.uid);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.equal(power(s, theirs(s, ELMY).uid), 4000);
  coherent(s);

  s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [LUFFY]);
    setDon(g, 0, 4);
  });
  s = play(s, LUFFY);
  assert.notEqual(s.decision?.tag, 'may', 'aucune DON!! redressée restante');
  assert.equal(attackAbility(s, 0, mine(s, LUFFY)).can, false);

  s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: LUFFY }]);
    setChars(g, 1, [{ num: VISTA }, { num: ELMY }]);
  });
  s = attack(s, mine(s, LUFFY).uid, s.players[1].leader.uid);
  expectTag(s, 'oppRest');
  assert.equal(hasOption(s, `card:${theirs(s, ELMY).uid}`), false, 'Elmy n’a pas [Bloqueur]');
  s = choose(s, `card:${theirs(s, VISTA).uid}`);
  assert.ok(theirs(s, VISTA).rested);
  assert.notEqual(s.decision?.kind, 'blocker');
  coherent(s);
});

test('Marco (ST30-008) : [En cas de KO] défausser un Personnage de 6000 : revenir épuisé depuis la Défausse', () => {
  const setup = (hand: string[]) => (g: GameState) => {
    setHand(g, 0, hand);
    setChars(g, 0, [{ num: MARCO, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_OARS }]);
  };
  let s = scenario([DECK, 'ST-22'], setup([ACE]), 1);
  s = noCounter(attack(s, theirs(s, OPP_OARS).uid, mine(s, MARCO).uid));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(mine(s, MARCO)?.rested, 'Marco revient épuisé');
  assert.ok(s.players[0].trash.some((c) => c.num === ACE));
  coherent(s);
  s = scenario([DECK, 'ST-22'], setup([MR3]), 1);
  s = noCounter(attack(s, theirs(s, OPP_OARS).uid, mine(s, MARCO).uid));
  assert.equal(mine(s, MARCO), undefined, 'aucun Personnage de 6000 en main');
});

test('Little Oz Junior et Baggy (ST-30) : à la place d’un Personnage de 6000 de base qui quitterait le terrain', () => {
  const setup = (protector: string, extra = {}) => (g: GameState) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: ACE }, { num: protector, extra }, { num: MR3 }]);
    setHand(g, 1, [FIREFIST, OPP_MARCO, ELMY]);
    setDon(g, 1, 5);
  };
  let s = scenario([DECK, 'ST-22'], setup(OARS), 1);
  s = play(s, FIREFIST, 1);
  s = choose(choose(s, 'yes'), (o) => o.label === 'Marco');
  s = choose(s, `card:${mine(s, ACE).uid}`);
  expectTag(s, 'replace');
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, ACE), 'Ace reste');
  assert.ok(s.players[0].trash.some((c) => c.num === OARS));
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  coherent(s);

  s = scenario([DECK, 'ST-22'], setup(BUGGY), 1);
  s = play(s, FIREFIST, 1);
  s = choose(choose(s, 'yes'), (o) => o.label === 'Marco');
  s = choose(s, `card:${mine(s, ACE).uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, ACE));
  assert.ok(mine(s, BUGGY).rested);
  coherent(s);

  s = scenario([DECK, 'ST-22'], setup(BUGGY, { rested: true }), 1);
  s = play(s, FIREFIST, 1);
  s = choose(choose(s, 'yes'), (o) => o.label === 'Marco');
  s = choose(s, `card:${mine(s, MR3).uid}`);
  assert.notEqual(s.decision?.tag, 'replace', 'Mr 3 n’a pas 6000 de base');
  assert.equal(mine(s, MR3), undefined);
});

test('Crocodile (ST30-010) : [Jouée] un Personnage adverse épuisé ne se redressera pas', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, [CROC]);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: ELMY, extra: { rested: true } }, { num: VISTA }]);
  });
  s = play(s, CROC);
  expectTag(s, 'oppLock');
  assert.equal(hasOption(s, `card:${theirs(s, VISTA).uid}`), false, 'Vista est redressée');
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.ok(hasMod(s, theirs(s, ELMY).uid, 'noRefresh'));
  coherent(s);
});

test('Mr 3 : s’épuiser : jusqu’à 2 DON!! épuisées à 2 Personnages de 6000 de base', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setChars(g, 0, [{ num: MR3 }, { num: ACE }, { num: LUFFY }, { num: OARS }]);
    setDon(g, 0, 0, 3);
  });
  s = act(s, `act:${mine(s, MR3).uid}`);
  expectTag(s, 'donTarget');
  assert.equal(hasOption(s, `card:${mine(s, OARS).uid}`), false, 'Little Oz Junior : 2000');
  s = choose(s, `card:${mine(s, ACE).uid}`);
  s = choose(s, `card:${mine(s, LUFFY).uid}`);
  assert.equal(mine(s, ACE).don, 2);
  assert.equal(mine(s, LUFFY).don, 1, 'plus qu’une DON!! épuisée');
  assert.ok(mine(s, MR3).rested);
  coherent(s);
});

test('« Cette ère... » : [Contre] avec 2 Personnages de 6000 de base, +4000 ; « Prêt à te battre » : +3000, pioche avec Ace et Luffy', () => {
  const setup = (hand: string[], chars: string[]) => scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, hand);
    setChars(g, 0, chars.map((num) => ({ num })));
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: OPP_OARS }]);
  }, 1);
  let s = setup([ERA], [ACE, JOZ]);
  s = attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.ok(logHas(s, 'repoussée (7000 contre 10000)'));
  coherent(s);
  s = setup([ERA], [ACE, MR3]);
  s = attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.equal(logHas(s, 'gagne +4000'), false, 'un seul Personnage de 6000');

  s = setup([READY], [ACE, LUFFY]);
  s = attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.ok(logHas(s, 'gagne +3000'));
  assert.ok(logHas(s, 'pioche 1 carte'));
  coherent(s);
  s = setup([READY], [ACE, JOZ]);
  s = attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.equal(logHas(s, 'pioche 1 carte'), false, 'pas de Luffy');
});

test('« Cette ère... » : [Déclenchement] KO d’un Personnage adverse de 6000 ou moins', () => {
  let s = scenario([DECK, 'ST-22'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [ERA, JOZ]);
    setChars(g, 1, [{ num: OPP_OARS }, { num: ELMY }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, OPP_OARS).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, OPP_OARS).uid}`), false, '7000');
  s = choose(s, `card:${theirs(s, ELMY).uid}`);
  assert.equal(theirs(s, ELMY), undefined);
  coherent(s);
});
