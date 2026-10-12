// Ener (Enel) du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, newGame } from '../engine/engine.ts';
import { canLeaveByEffect, donTotal, handCost, hasKeyword, hasMod, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, inHand, keepOrder, play, scenario, setChars, setDeckTop, setHand, setLife, take } from './helpers.ts';

const META = 'META-ENEL-2026-10';
const ENEL = 'OP15-118';
const GAMMA = 'OP05-077';
const SANJI = 'OP07-064';
const LIGHTNING = 'OP09-077';   // Gum Gum Foudre
const PINK = 'OP10-067';
const PUDDING = 'OP12-071';
const DEPARTURE = 'OP13-076';   // Trépas divin
const OHM = 'OP15-061';
const SATORI = 'OP15-066';
const SHURA = 'OP15-067';
const HOLLY = 'OP15-071';
const VALLY = 'OP15-074';
const EL_THOR = 'OP15-075';
const KITEN = 'OP15-076';
const DRAGON = 'OP15-077';      // Djambuwal
const MAMARAGAN = 'OP15-078';
const LAW = 'ST10-010';
// adversaire ST-31
const OPP_ZORO = 'OP14-015';    // 8000
const OPP_ROBIN = 'OP11-009';   // 4000
const OPP_NAMI = 'OP01-016';    // 2000
const OPP_JINBE = 'ST31-002';   // 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
// DON!! d'Ener : 6 en tout
function setEnelDon(g: GameState, p: PlayerId, active: number, rested = 0) {
  const P = g.players[p];
  const attached = [P.leader, ...P.chars].reduce((sum, c) => sum + c.don, 0);
  P.donActive = active;
  P.donRested = rested;
  P.donDeck = donTotal(P.leader.num) - active - rested - attached;
  assert.ok(P.donDeck >= 0);
}
const toTrash = (g: GameState, p: PlayerId, nums: string[]) => g.players[p].trash.push(...nums.map((n) => take(g, p, n)));

test('Leader Ener : 6 DON!! ; à partir du 2e tour, 1 DON!! redressée et 4 épuisées, puis 4 DON!! à un Personnage ; une fois par tour', () => {
  const g = newGame({ decks: [META, 'ST-31'], names: ['a', 'b'], seed: 3, first: 0 });
  assert.equal(g.players[0].donDeck, 6);
  let s = scenario([META, 'ST-31'], (x) => {
    setChars(x, 0, [{ num: OHM }]);
    setEnelDon(x, 0, 1);
  });
  const leader = s.players[0].leader.uid;
  s = act(s, `act:${leader}`);
  assert.equal(s.players[0].donActive, 2);
  assert.equal(s.players[0].donDeck, 0);
  assert.equal(mine(s, OHM).don, 4, 'seul Personnage : les 4 DON!! épuisées lui sont données');
  assert.equal(power(s, mine(s, OHM).uid), 6000);
  assert.equal(hasOption(s, `act:${leader}`), false, 'une fois par tour');
  coherent(s);
  s = scenario([META, 'ST-31'], (x) => {
    x.players[0].turns = 1;
    setEnelDon(x, 0, 1);
  });
  assert.equal(hasOption(s, `act:${s.players[0].leader.uid}`), false, 'premier tour');
});

test('Ener (Personnage) : 10000 et ne quitte pas le terrain par un effet adverse avec 6 DON!! ou moins ; DON!! −1 : 1 carte parmi 5, puis défausse 1', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [ENEL, OHM]);
    setEnelDon(g, 0, 6);
    setDeckTop(g, 0, [SHURA, KITEN, VALLY, PINK, LAW]);
  });
  s = play(s, ENEL);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'pick');
  s = keepOrder(choose(s, (o) => o.num === KITEN));
  expectTag(s, 'discard');
  s = choose(s, (o) => s.players[0].hand.find((c) => c.uid === o.uid)?.num === OHM);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [KITEN]);
  assert.equal(power(s, mine(s, ENEL).uid), 10000);
  assert.equal(canLeaveByEffect(s, mine(s, ENEL).uid, 1), false);
  assert.equal(s.players[0].donDeck, 1, 'DON!! −1');
  coherent(s);
});

test('Gamma Knife : DON!! −1 pour −5000 ; Gum Gum Foudre : DON!! −2 pour KO 6000 ou moins', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [GAMMA, LIGHTNING]);
    setEnelDon(g, 0, 6);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_JINBE }]);
  });
  s = play(s, GAMMA);
  s = choose(s, 'yes');
  s = choose(s, `card:${theirs(s, OPP_ZORO).uid}`);
  assert.equal(power(s, theirs(s, OPP_ZORO).uid), 3000);
  s = play(s, LIGHTNING);
  s = choose(s, 'yes');
  expectTag(s, 'oppKo');
  assert.equal(s.decision!.options.some((o) => o.uid === theirs(s, OPP_ZORO).uid), true, 'Zoro à 3000 ce tour-ci');
  s = choose(s, `card:${theirs(s, OPP_JINBE).uid}`);
  assert.equal(theirs(s, OPP_JINBE), undefined);
  assert.equal(s.players[0].donDeck, 3, '1 + 2 DON!! renvoyées');
  coherent(s);
});

test('Sanji (OP07-064) : coût 3 en main avec au moins 2 DON!! de moins que l’adversaire', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SANJI]);
    setEnelDon(g, 0, 2);
    g.players[1].donActive = 6;
    g.players[1].donDeck = 4;
  });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 3);
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SANJI]);
    setEnelDon(g, 0, 5);
    g.players[1].donActive = 6;
    g.players[1].donDeck = 4;
  });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 6);
});

test('Señor Pink : DON!! −1 : un Événement violet de coût 5 ou moins de la Défausse en main, puis 1 DON!! redressée', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PINK]);
    setEnelDon(g, 0, 5, 1);
    toTrash(g, 0, [KITEN, OHM]);
  });
  s = play(s, PINK);
  s = choose(s, 'yes');
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KITEN, 'none'].sort());
  s = choose(s, (o) => o.num === KITEN);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [KITEN]);
  assert.equal(s.players[0].donActive, 1, '5 − 5 payées + 1 redressée');
  coherent(s);
});

test('Charlotte Pudding (OP12-071) : 4 cartes du dessus, 1 [Sanji] ou 1 Événement', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PUDDING]);
    setEnelDon(g, 0, 1);
    setDeckTop(g, 0, [OHM, SANJI, KITEN, LAW]);
  });
  s = play(s, PUDDING);
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KITEN, SANJI, 'none'].sort());
  s = keepOrder(choose(s, (o) => o.num === SANJI));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [SANJI]);
  coherent(s);
});

test('Trépas divin : épuiser 5 DON!! pour −8000 s’il y a des DON!! données ; [Contre] défausser 1 carte : +3000', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [DEPARTURE]);
    setChars(g, 0, [{ num: OHM, extra: { don: 1 } }]);
    setEnelDon(g, 0, 5);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  });
  s = play(s, DEPARTURE);
  s = choose(s, 'yes');
  s = choose(s, `card:${theirs(s, OPP_ZORO).uid}`);
  assert.equal(power(s, theirs(s, OPP_ZORO).uid), 0);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [DEPARTURE, OHM]);
    setLife(g, 0, [OHM, OHM]);
    setEnelDon(g, 0, 0, 3);
    setChars(g, 1, [{ num: OPP_JINBE }]);
  }, 1);
  s = attack(s, theirs(s, OPP_JINBE).uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  s = choose(s, 'yes');
  assert.equal(s.players[0].life.length, 2, '5000 + 3000 contre 6000 : repoussée');
});

test('Om, Satori, Shura : DON!! −1 pour piocher ; Om −1000 en attaquant, Satori range 2 cartes, Shura [Initiative] (6 DON!! ou moins)', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SHURA]);
    setEnelDon(g, 0, 3);
    setChars(g, 0, [{ num: OHM }, { num: SATORI }]);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
    setHand(g, 1, []);
    setDeckTop(g, 0, [PINK, KITEN, LAW]);
  });
  s = play(s, SHURA);
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  assert.ok(hasKeyword(s, 0, mine(s, SHURA), 'Rush'));
  s = attack(s, mine(s, OHM).uid, s.players[1].leader.uid);
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(power(s, theirs(s, OPP_ROBIN).uid), 3000);
  s = attack(s, mine(s, SATORI).uid, s.players[1].leader.uid);
  expectTag(s, 'scry');
  s = choose(s, 'bottom');
  s = choose(s, 'top');
  assert.equal(s.players[0].deck[0].num, LAW, 'Law au-dessus');
  assert.equal(s.players[0].deck.at(-1)!.num, KITEN, 'Kiten au-dessous');
  coherent(s);
});

test('Holy : [Double attaque] pour elle et ses [Om] ; pendant le tour adverse, leur puissance de base passe à 6000', () => {
  const s = scenario([META, 'ST-31'], (g) => setChars(g, 0, [{ num: HOLLY }, { num: OHM }, { num: SATORI }]));
  assert.ok(hasKeyword(s, 0, mine(s, OHM), 'Double Attack'));
  assert.ok(hasKeyword(s, 0, mine(s, HOLLY), 'Double Attack'));
  assert.equal(hasKeyword(s, 0, mine(s, SATORI), 'Double Attack'), false);
  assert.equal(power(s, mine(s, OHM).uid), 2000);
  s.active = 1;
  assert.equal(power(s, mine(s, OHM).uid), 6000);
  assert.equal(power(s, mine(s, HOLLY).uid), 6000);
  assert.equal(power(s, mine(s, SATORI).uid), 2000);
});

test('Vally, El Thor, Kiten, Djambuwal, Mamaragan : leurs [Principale] (DON!! −1 ou −2) et [Contre]', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [VALLY, EL_THOR, KITEN, DRAGON, MAMARAGAN]);
    setEnelDon(g, 0, 6);
    setChars(g, 0, [{ num: OHM }]);
    setChars(g, 1, [{ num: OPP_NAMI }, { num: OPP_ROBIN, extra: { rested: true } }, { num: OPP_JINBE }]);
  });
  s = play(s, VALLY);
  s = choose(s, 'yes');
  expectTag(s, 'ownCost');
  s = choose(s, `card:${mine(s, OHM).uid}`);
  assert.ok(s.players[0].hand.length === 5, 'pioche 1 (Leader [Ener])');
  s = play(s, EL_THOR);
  s = choose(s, 'yes');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, OPP_NAMI).uid}`);
  assert.equal(theirs(s, OPP_NAMI), undefined);
  s = play(s, DRAGON);
  s = choose(s, 'yes');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(hasMod(s, theirs(s, OPP_ROBIN).uid, 'noRefresh'));
  s = play(s, MAMARAGAN);
  s = choose(s, 'yes');
  assert.equal(s.decision?.kind, 'main', 'Jinbe (6000) n’est pas une cible ; Robin est déjà épuisé');
  assert.equal(s.players[0].donDeck, 5, '5 DON!! renvoyées');
  coherent(s);

  // [Contre] : +2000 seulement à un [Ener]
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KITEN, MAMARAGAN]);
    setLife(g, 0, [OHM, OHM]);
    setEnelDon(g, 0, 0, 2);
    setChars(g, 1, [{ num: OPP_JINBE }]);
  }, 1);
  s = attack(s, theirs(s, OPP_JINBE).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id === `cevent:${inHand(s, 0, KITEN)}`);
  assert.ok(s.log.some((l) => l.text.includes('+2000') && l.text.includes('Kiten')), 'le Leader est un [Ener]');
});

test('Trafalgar Law (ST10-010) : DON!! −1 : 2 cartes défaussées au hasard si l’adversaire en a 7 ou plus ; sinon rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [LAW]);
    setEnelDon(g, 0, 6);
    setHand(g, 1, [OPP_NAMI, OPP_NAMI, OPP_ROBIN, OPP_ROBIN, OPP_JINBE, OPP_JINBE, OPP_ZORO]);
  });
  s = play(s, LAW);
  s = choose(s, 'yes');
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.players[1].trash.length, 2);
  coherent(s);
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [LAW]);
    setEnelDon(g, 0, 6);
    setHand(g, 1, [OPP_NAMI, OPP_ROBIN]);
  });
  s = play(s, LAW);
  s = choose(s, 'yes');
  assert.equal(s.players[1].hand.length, 2);
});
