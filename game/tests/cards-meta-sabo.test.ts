// Sabo du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldCost, hasBlocker, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { choose, coherent, expectTag, hasOption, option, play, scenario, setChars, setDeckTop, setDon, setHand, take } from './helpers.ts';
import { act } from '../engine/engine.ts';

const META = 'META-SABO-2026-10';
const ACE_SABO_LUFFY = 'OP13-007';
const ARRIMAGE = 'OP15-088';
const USOPP = 'OP17-080';
const SANJI = 'OP17-082';
const JINBE = 'OP17-083';
const CHOPPER = 'OP17-084';
const NAMI = 'OP17-086';
const ROBIN = 'OP17-087';
const SAURO = 'OP17-089';
const LUFFY = 'OP17-093';
const ZORO = 'OP17-095';
const LOKI = 'OP17-119';
const BROOK = 'ST01-011';
const NAMI_ST = 'OP01-016';  // {Équipage de Chapeau de paille}, pas {Erbaf}
// adversaire ST-31
const OPP_ROBIN = 'OP11-009';  // coût 3, 4000
const OPP_NAMI = 'OP01-016';   // coût 1
const OPP_LUFFY = 'ST23-004';  // coût 1
const OPP_BROOK = 'ST31-003';  // coût 2

const toTrash = (g: GameState, p: PlayerId, nums: string[]) => g.players[p].trash.push(...nums.map((n) => take(g, p, n)));
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;

test('Haguar D. Sauro et Usopp : +12 de coût ; +3000 avec un Personnage de coût 12 ou plus en jeu (sinon rien)', () => {
  let s = scenario([META, 'ST-31'], (g) => setChars(g, 0, [{ num: USOPP }]));
  assert.equal(power(s, mine(s, USOPP).uid), 2000, 'pas de coût 12 : pas de bonus');
  s = scenario([META, 'ST-31'], (g) => setChars(g, 0, [{ num: USOPP }, { num: SAURO }]));
  assert.equal(fieldCost(s, mine(s, SAURO).uid), 16);
  assert.equal(power(s, mine(s, USOPP).uid), 5000);
});

test('Usopp et Sauro : 3 cartes du dessus, 1 carte {Erbaf} en main, les autres dans la Défausse', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [USOPP]);
    setDon(g, 0, 10);
    setDeckTop(g, 0, [SAURO, LOKI, NAMI_ST]);
  });
  s = play(s, USOPP);
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [LOKI, SAURO, 'none'].sort(), 'Nami (OP01-016) n’est pas {Erbaf}');
  s = choose(s, (o) => o.num === SAURO);
  assert.ok(s.players[0].hand.some((c) => c.num === SAURO));
  assert.deepEqual(s.players[0].trash.map((c) => c.num).sort(), [LOKI, NAMI_ST].sort());
  coherent(s);
});

test('Sanji : pioche 2 cartes et en défausse 2', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SANJI, NAMI]);
    setDon(g, 0, 10);
  });
  s = play(s, SANJI);
  expectTag(s, 'discard');
  s = choose(s, 'card');
  expectTag(s, 'discard');
  s = choose(s, 'card');
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].trash.length, 2);
  coherent(s);
});

test('Jinbe : [Bloqueur] et 5000 seulement avec un Personnage de coût 12 ou plus en jeu', () => {
  let s = scenario([META, 'ST-31'], (g) => setChars(g, 0, [{ num: JINBE }]));
  assert.equal(hasBlocker(s, 0, mine(s, JINBE)), false);
  s = scenario([META, 'ST-31'], (g) => setChars(g, 0, [{ num: JINBE }, { num: LOKI }]));
  assert.equal(hasBlocker(s, 0, mine(s, JINBE)), true);
  assert.equal(power(s, mine(s, JINBE).uid), 5000);
});

test('Chopper : [Imblocable] à un de ses Personnages, seulement avec un coût 12 ou plus en jeu', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: USOPP }]);
    setHand(g, 0, [CHOPPER]);
    setDon(g, 0, 10);
  });
  s = play(s, CHOPPER);
  assert.equal(s.decision?.kind, 'main', 'pas de coût 12 : rien');
  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: SAURO }]);
    setHand(g, 0, [CHOPPER]);
    setDon(g, 0, 10);
  });
  s = play(s, CHOPPER);
  expectTag(s, 'ownGrant');
  s = choose(s, `card:${mine(s, SAURO).uid}`);
  assert.ok(hasKeyword(s, 0, mine(s, SAURO), 'Unblockable'));
  coherent(s);
});

test('Nami (OP17-086) : défausser une carte {Erbaf} pour piocher 2 ; sans carte {Erbaf} en main, rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [NAMI, SANJI]);
    setDon(g, 0, 10);
  });
  s = play(s, NAMI);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(s.players[0].trash.some((c) => c.num === SANJI));
  assert.equal(s.players[0].hand.length, 2);
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [NAMI, NAMI_ST]);
    setDon(g, 0, 10);
  });
  s = play(s, NAMI);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].hand.length, 1);
});

test('Nico Robin : avec un coût 12 ou plus, 5000 et −3000 à un Personnage adverse ; sinon rien', () => {
  const setup = (withGiant: boolean) => (g: GameState) => {
    setChars(g, 0, withGiant ? [{ num: SAURO }] : []);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
    setHand(g, 0, [ROBIN]);
    setDon(g, 0, 10);
  };
  let s = play(scenario([META, 'ST-31'], setup(false)), ROBIN);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(power(s, mine(s, ROBIN).uid), 2000);
  s = play(scenario([META, 'ST-31'], setup(true)), ROBIN);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(power(s, theirs(s, OPP_ROBIN).uid), 1000);
  assert.equal(power(s, mine(s, ROBIN).uid), 5000);
  coherent(s);
});

test('Monkey D. Luffy : pioche, rejoue un Personnage de coût 2 ou moins de la Défausse ; [Initiative] avec un coût 12 ou plus', () => {
  const setup = (withGiant: boolean) => (g: GameState) => {
    setChars(g, 0, withGiant ? [{ num: SAURO }] : []);
    setHand(g, 0, [LUFFY]);
    toTrash(g, 0, [USOPP, LOKI]);
    setDon(g, 0, 10);
  };
  let s = play(scenario([META, 'ST-31'], setup(true)), LUFFY);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [USOPP, 'none'].sort(), 'Loki coûte 6');
  s = choose(s, (o) => o.num === USOPP);
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  assert.ok(mine(s, USOPP));
  // l'Usopp rejoué a son propre [Jouée] (recherche dans le deck)
  if (s.decision?.tag === 'pick') s = choose(s, 'none');
  assert.ok(hasOption(s, `attack:${mine(s, LUFFY).uid}`), '[Initiative]');
  s = play(scenario([META, 'ST-31'], setup(false)), LUFFY);
  s = choose(s, 'none');
  assert.equal(hasOption(s, `attack:${mine(s, LUFFY).uid}`), false, 'pas de coût 12 : pas d’[Initiative]');
  coherent(s);
});

test('Roronoa Zoro : remplace la sortie du terrain par 3 cartes de la Défausse sous le deck ; pas assez de cartes, pas de remplacement', () => {
  const setup = (trash: string[]) => (g: GameState) => {
    setChars(g, 0, [{ num: ZORO }]);
    toTrash(g, 0, trash);
    setHand(g, 1, ['ST35-001']);
    setDon(g, 1, 10);
  };
  let s = play(scenario([META, 'ST-35'], setup([USOPP, LOKI, SANJI]), 1), 'ST35-001', 1);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${mine(s, ZORO).uid}`);
  expectTag(s, 'replace');
  assert.equal(s.decision!.player, 0);
  s = choose(s, 'replace');
  for (let i = 0; i < 2; i++) {
    expectTag(s, 'trashToDeck');
    s = choose(s, 'card');
  }
  assert.ok(mine(s, ZORO), 'Zoro reste en jeu');
  assert.equal(s.players[0].trash.length, 0);
  assert.deepEqual(s.players[0].deck.slice(-3).map((c) => c.num).sort(), [LOKI, SANJI, USOPP].sort());
  coherent(s);

  s = play(scenario([META, 'ST-35'], setup([USOPP, LOKI]), 1), 'ST35-001', 1);
  s = choose(s, `card:${mine(s, ZORO).uid}`);
  assert.equal(s.players[0].chars.length, 0, '2 cartes seulement : mis KO');
});

test('Loki : met KO des Personnages adverses pour un coût total de 4 au plus (le joueur choisit, sans s’arrêter avant) ; 11000 pendant le tour adverse', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [LOKI]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_NAMI }, { num: OPP_LUFFY }, { num: OPP_BROOK }]);
  });
  s = play(s, LOKI);
  expectTag(s, 'oppKo');
  assert.equal(s.decision!.options.some((o) => o.id === 'none'), false);
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.map((o) => o.uid).sort(), [theirs(s, OPP_NAMI).uid, theirs(s, OPP_LUFFY).uid].sort(), 'reste 1');
  s = choose(s, `card:${theirs(s, OPP_NAMI).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num).sort(), [OPP_BROOK, OPP_LUFFY].sort());
  const loki = mine(s, LOKI);
  assert.equal(fieldCost(s, loki.uid), 18);
  assert.equal(power(s, loki.uid), 8000);
  s.active = 1;
  assert.equal(power(s, loki.uid), 11000);
});

test('Arrimage pirates 6 : 11 en jeu ; 3 cartes du deck en Défausse pour rejouer un Chapeau de paille de coût 2 ou moins ; deck trop court, pas de question', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [ARRIMAGE]);
    setDon(g, 0, 10);
    toTrash(g, 0, [USOPP]);
    setDeckTop(g, 0, [LOKI, SAURO, BROOK]);
  });
  s = play(s, ARRIMAGE);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [BROOK, USOPP, 'none'].sort(), 'Loki et Sauro ne sont pas Chapeau de paille');
  s = choose(s, (o) => o.num === BROOK);
  assert.ok(mine(s, BROOK));
  assert.equal(fieldCost(s, mine(s, ARRIMAGE).uid), 11);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [ARRIMAGE]);
    setDon(g, 0, 10);
    g.players[0].trash.push(...g.players[0].deck.splice(2));
  });
  s = play(s, ARRIMAGE);
  assert.equal(s.decision?.kind, 'main');
});

test('Ace, Sabo et Luffy : donner 1 DON!! redressée et se placer dans la Défausse pour −3000 ; sans DON!! redressée, pas proposé', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: ACE_SABO_LUFFY }]);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
    setDon(g, 0, 3);
  });
  s = act(s, option(s, `act:${mine(s, ACE_SABO_LUFFY).uid}`));
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(power(s, theirs(s, OPP_ROBIN).uid), 1000);
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(s.players[0].trash.some((c) => c.num === ACE_SABO_LUFFY));
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(s.players[0].donActive, 2);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: ACE_SABO_LUFFY }]);
    setDon(g, 0, 0, 3);
  });
  assert.equal(hasOption(s, `act:${mine(s, ACE_SABO_LUFFY).uid}`), false);
});

test('Brook (ST01-011) : 2 DON!! épuisées à son Leader ou à un de ses Personnages', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: USOPP }]);
    setHand(g, 0, [BROOK]);
    setDon(g, 0, 2, 3);
  });
  s = play(s, BROOK);
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 2);
  assert.equal(s.players[0].donRested, 3);
  coherent(s);
});
