// Kaido du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from '../engine/engine.ts';
import { counterValue, hasMod, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const META = 'META-KAIDO-2026-10';
const KING = 'EB04-031';
const QUEEN1 = 'EB04-032';       // Queen coût 1
const TORCH = 'EB04-040';        // Torche du dragon
const BEAM = 'OP07-076';         // Ramollo Beam Sword
const ONE_PIECE = 'OP07-077';    // We're Going to Claim the One Piece!!!
const MARIA = 'OP08-074';        // Black Maria
const SUPERSTARS = 'OP17-061';
const KAIDO62 = 'OP17-062';
const KAIDO63 = 'OP17-063';
const QUEEN9 = 'OP17-065';       // Queen coût 9
const SASAKI = 'OP17-068';
const HAWKINS = 'OP17-073';
const YAMATO = 'OP17-074';       // {Pays de Wano}, pas {Équipage des cent bêtes}
const LINLIN = 'ST34-004';       // {Équipage de Big Mom}
// adversaire ST-31
const OPP_ZORO = 'OP14-015';     // coût 7, 8000
const OPP_ROBIN = 'OP11-009';    // coût 3, 4000
const OPP_NAMI = 'OP01-016';     // coût 1
const OPP_JINBE = 'ST31-002';    // coût 5, 6000

// le Leader Kaido propose son [Attaque adverse] (DON!! −1) à chaque attaque adverse : refuser
const skipLeader = (s: GameState) => (s.decision?.tag === 'may' && s.decision.prompt.startsWith('Kaido') ? choose(s, 'no') : s);
const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;

test('Leader Kaido : [Attaque adverse] DON!! −1 pour −2000 à un Personnage adverse ; une fois par tour', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [YAMATO, YAMATO, YAMATO]);
    setDon(g, 0, 0, 3);
    setChars(g, 1, [{ num: OPP_JINBE }, { num: OPP_ROBIN }]);
  }, 1);
  s = attack(s, theirs(s, OPP_JINBE).uid, s.players[0].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  s = choose(s, `card:${theirs(s, OPP_JINBE).uid}`);
  assert.equal(power(s, theirs(s, OPP_JINBE).uid), 4000);
  assert.equal(s.players[0].life.length, 3, '4000 contre 5000 : repoussée');
  s = attack(s, theirs(s, OPP_ROBIN).uid, s.players[0].leader.uid);
  assert.notEqual(s.decision?.tag, 'may', 'une fois par tour');
  coherent(s);
});

test('King : mis KO en combat, renvoyer 1 DON!! à la place ; activation : 1 DON!! redressée et 1 épuisée, sans autre King', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: KING, extra: { rested: true } }]);
    setDon(g, 0, 0, 2);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, mine(s, KING).uid);
  if (s.decision?.tag === 'oppPower') s = choose(s, 'none');
  s = skipLeader(s);
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  assert.ok(mine(s, KING), 'King reste en jeu');
  assert.equal(s.players[0].donRested, 1, '1 DON!! renvoyée');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: KING }]);
    setDon(g, 0, 2);
  });
  s = act(s, `act:${mine(s, KING).uid}`);
  assert.equal(s.players[0].donActive, 3);
  assert.equal(s.players[0].donRested, 1);
  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: KING }, { num: KING }]);
    setDon(g, 0, 2);
  });
  assert.equal(hasOption(s, `act:${s.players[0].chars[0].uid}`), false, 'un autre King en jeu');
});

test('Queen (EB04-032) : défausser une carte {Équipage des cent bêtes} pour piocher 2 ; épuiser 2 DON!! pour 1 DON!! épuisée', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [QUEEN1, HAWKINS, YAMATO]);
    setDon(g, 0, 4);
  });
  s = play(s, QUEEN1);
  s = choose(s, 'yes');
  assert.ok(s.players[0].trash.some((c) => c.num === HAWKINS), 'Yamato n’est pas {Équipage des cent bêtes}');
  assert.equal(s.players[0].hand.length, 3);
  s = act(s, `act:${mine(s, QUEEN1).uid}`);
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].donRested, 4, '1 payée, 2 épuisées, 1 ajoutée');
  assert.equal(hasOption(s, `act:${mine(s, QUEEN1).uid}`), false);
  coherent(s);
});

test('Torche du dragon : [Contre] DON!! −1 : Leader +4000 ; Ramollo Beam Sword : [Contre] DON!! −1 : +2000, puis épuiser un Personnage', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [TORCH, BEAM]);
    setLife(g, 0, [YAMATO, YAMATO]);
    setDon(g, 0, 3, 3);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_ROBIN }]);
  }, 1);
  s = skipLeader(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  s = choose(s, (o) => o.id.startsWith('cevent:') && s.players[0].hand.find((c) => c.uid === o.uid)?.num === TORCH);
  s = choose(s, 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 9000);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  s = choose(s, 'yes');
  expectTag(s, 'oppRest');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(theirs(s, OPP_ROBIN).rested);
  assert.equal(s.players[0].life.length, 2, '11000 contre 8000');
  coherent(s);
});

test('We’re Going to Claim the One Piece!!! : 5 cartes, 1 carte {Équipage des cent bêtes} ou {Équipage de Big Mom}', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [ONE_PIECE]);
    setDon(g, 0, 2);
    setDeckTop(g, 0, [YAMATO, LINLIN, KING, TORCH, BEAM]);
  });
  s = play(s, ONE_PIECE);
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KING, LINLIN, TORCH, 'none'].sort());
  s = keepOrder(choose(s, (o) => o.num === LINLIN));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [LINLIN]);
  coherent(s);
});

test('Black Maria : 5 DON!! épuisées, puis à la fin du tour autant de DON!! que l’adversaire', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: MARIA }]);
    setDon(g, 0, 4);
    g.players[1].donActive = 6;
    g.players[1].donDeck = 4;
  });
  s = act(s, `act:${mine(s, MARIA).uid}`);
  assert.equal(s.players[0].donRested, 5);
  s = act(s, 'end');
  const P = s.players[0];
  assert.equal(P.donActive + P.donRested + P.chars.reduce((n, c) => n + c.don, 0) + P.leader.don, 6, '9 DON!! ramenées à 6');
  coherent(s);
});

test('Les Superstars : DON!! −1 pour +1 Vie ; se placer dans la Défausse pour jouer Queen de sa main', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SUPERSTARS, QUEEN9]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_NAMI }]);
  });
  const life = s.players[0].life.length;
  s = play(s, SUPERSTARS);
  s = choose(s, 'yes');
  assert.equal(s.players[0].life.length, life + 1);
  s = act(s, `act:${mine(s, SUPERSTARS).uid}`);
  expectTag(s, 'playFree');
  s = choose(s, /Queen/);
  assert.ok(mine(s, QUEEN9));
  assert.ok(s.players[0].trash.some((c) => c.num === SUPERSTARS));
  coherent(s);
});

test('Kaido (OP17-062) : pendant son tour, une DON!! renvoyée au deck DON!! en fait revenir une redressée (une fois par tour)', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: KAIDO62 }]);
    setHand(g, 0, [QUEEN9]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_NAMI }]);
  });
  s = play(s, QUEEN9);
  s = choose(s, 'yes');
  s = choose(s, 'none');  // Queen : aucun Personnage adverse bloqué
  assert.ok(logHas(s, 'ajoute 1 DON!! redressée'));
  assert.equal(s.players[0].donActive, 3, '1 restante (9 payées) + 1 ajoutée + 1 redressée ; la DON!! renvoyée était épuisée');
  coherent(s);
});

test('Kaido (OP17-063) : Contre +1000 aux Personnages sans Contre de la main ; le tour où il arrive, DON!! −1 : annule et met KO un coût 6', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: KAIDO63 }]);
    setHand(g, 0, [KING, HAWKINS]);
  });
  assert.equal(counterValue(s, 0, KING), 1000, 'King n’a pas de Contre');
  assert.equal(counterValue(s, 0, HAWKINS), 2000, 'Hawkins garde son Contre');
  assert.equal(hasOption(s, `act:${mine(s, KAIDO63).uid}`), false, 'pas joué ce tour');

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KAIDO63]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_JINBE }, { num: OPP_ZORO }]);
  });
  s = play(s, KAIDO63);
  s = act(s, `act:${mine(s, KAIDO63).uid}`);
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.map((o) => o.uid ?? o.id).sort(), [theirs(s, OPP_JINBE).uid, 'none'].sort(), 'Zoro coûte 7');
  s = choose(s, `card:${theirs(s, OPP_JINBE).uid}`);
  assert.equal(theirs(s, OPP_JINBE), undefined);
  coherent(s);
});

test('Queen (OP17-065) : DON!! −1 : pioche 1 et 2 Personnages adverses de coût 5 ou moins ne peuvent pas attaquer', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [QUEEN9]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_JINBE }, { num: OPP_ROBIN }, { num: OPP_ZORO }]);
  });
  s = play(s, QUEEN9);
  s = choose(s, 'yes');
  expectTag(s, 'oppLock');
  assert.equal(s.decision!.options.some((o) => o.uid === theirs(s, OPP_ZORO).uid), false, 'Zoro coûte 7');
  s = choose(s, `card:${theirs(s, OPP_JINBE).uid}`);
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(hasMod(s, theirs(s, OPP_JINBE).uid, 'cantAttack') && hasMod(s, theirs(s, OPP_ROBIN).uid, 'cantAttack'));
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
});

test('Sasaki : en attaquant, défausser 2 cartes pour 2 DON!! épuisées ; Basil Hawkins : défausser 1 carte pour 1 DON!! redressée', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: SASAKI }]);
    setHand(g, 0, [HAWKINS, YAMATO, KING]);
    setHand(g, 1, []);
    setDon(g, 0, 3);
  });
  s = attack(s, mine(s, SASAKI).uid, s.players[1].leader.uid);
  s = choose(s, 'yes');
  s = choose(s, (o) => s.players[0].hand.find((c) => c.uid === o.uid)?.num === YAMATO);
  s = choose(s, (o) => s.players[0].hand.find((c) => c.uid === o.uid)?.num === KING);
  assert.equal(s.players[0].donRested, 2);
  s = play(s, HAWKINS);
  assert.equal(s.decision?.kind, 'main', 'plus de carte à défausser : pas de question');
  coherent(s);
});
