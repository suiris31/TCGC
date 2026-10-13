// Famille du Leader Kidd (phase 4E) : cartes jaunes {Supernovae} et {Équipage de Kidd}, qui jouent avec la Vie. Un deck
// d'essai au Leader Kidd (2 exemplaires de chaque carte) et un autre au Leader Luffy pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_KIDD } from '../engine/cards/fam-kidd.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, canBeKO, hasBlocker, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_KIDD);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP10-102': 2 };
const KIDD = 'TEST-KIDD';
const PLAIN = 'TEST-KIDD-LUFFY';
DECKS[KIDD] = { id: KIDD, name: 'Essai', series: 'TEST', leader: 'OP10-099', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000
const O_MOLE = 'ST21-017';       // −5000, puis KO 2000 ou moins avec un Personnage de 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const noBlock = (s: GameState) => (s.decision?.kind === 'blocker' ? choose(s, 'noblock') : s);
function setTrash(g: GameState, p: PlayerId, nums: string[]) {
  const list = nums.map((n) => take(g, p, n));
  g.players[p].deck.push(...g.players[p].trash);
  g.players[p].trash = list;
}
// l'adversaire joue Gum Gum Taupe Bullet : −5000 à la cible, puis KO de 2000 ou moins (il a Chopper à 6000)
function oppMole(setup: (g: GameState) => void) {
  return scenario([KIDD, 'ST-21'], (g) => { setup(g); setHand(g, 1, [O_MOLE]); setDon(g, 1, 4); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
}

test('Black Rope : retourner la Vie du dessus ; avec moins de Personnages que l’adversaire, KO de coût 6 et 5 ou moins', () => {
  const setup = (mineChars: string[]) => (g: GameState) => {
    setHand(g, 0, ['EB04-059']); setDon(g, 0, 6); setChars(g, 0, mineChars.map((num) => ({ num })));
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]);
  };
  let s = scenario([KIDD, 'ST-21'], setup([]));
  s = choose(play(s, 'EB04-059'), 'yes');
  assert.ok(s.players[0].life[0].faceUp);
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
  s = scenario([KIDD, 'ST-21'], setup(['OP10-108', 'OP10-108']));
  s = choose(play(s, 'EB04-059'), 'yes');
  assert.notEqual(s.decision?.tag, 'oppKo', 'autant de Personnages');
});

test('Caribou (OP10-104) : [DON!! x1] pas mis KO en combat (Leader {Supernovae}, 3 Vies adverses ou plus)', () => {
  const s = scenario([KIDD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-104', extra: { don: 1 } }, { num: 'OP10-104' }]); setDon(g, 0, 0); });
  assert.equal(canBeKO(s, s.players[0].chars[0].uid, 'battle', 1), false);
  assert.equal(canBeKO(s, s.players[0].chars[1].uid, 'battle', 1), true, 'sans DON!!');
  assert.equal(canBeKO(s, s.players[0].chars[0].uid, 'effect', 1), true, 'par un effet');
  const t = scenario([PLAIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-104', extra: { don: 1 } }]); setDon(g, 0, 0); });
  assert.equal(canBeKO(t, t.players[0].chars[0].uid, 'battle', 1), true, 'Leader Luffy');
});

test('Killer (OP10-106) : mis KO, cherche une carte {Supernovae} ou {Équipage de Kidd} ; Scratchmen Apoo : [Bloqueur] avec un autre {Supernovae} jaune', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP10-106', extra: { rested: true } }, { num: 'OP10-108' }]);
    setDeckTop(g, 0, ['OP10-110', 'EB04-059', 'OP10-113']);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  assert.equal(hasBlocker(s, 0, mine(s, 'OP10-108')), true, 'Killer est {Supernovae} jaune');
  s = noCounter(noBlock(attack(s, theirs(s, O_CHOPPER).uid, mine(s, 'OP10-106').uid)));
  expectTag(s, 'pick');
  assert.equal(s.decision!.options.length, 4, 'les 3 cartes conviennent');
  s = keepOrder(choose(s, (o) => o.label === 'Heat et Wire'));
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP10-110'));
  coherent(s);
  s = scenario([KIDD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-108' }]); });
  assert.equal(hasBlocker(s, 0, mine(s, 'OP10-108')), false, 'seul');
});

test('Jewelry Bonney (OP10-107) : prendre une Vie en main pour placer un {Supernovae} de coût 5 face visible dans sa Vie', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-107', 'OP17-101', 'OP10-113']); setLife(g, 0, ['OP10-102', 'OP10-110']); setDon(g, 0, 3); });
  s = choose(play(s, 'OP10-107'), 'yes');
  s = choose(s, 'bottom');
  expectTag(s, 'toLife');
  assert.equal(s.decision!.options.some((o) => o.label === 'Roronoa Zoro'), false, 'Zoro : coût 3');
  s = choose(s, (o) => o.label === 'Caribou');
  assert.equal(s.players[0].life[0].num, 'OP17-101');
  assert.ok(s.players[0].life[0].faceUp);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP10-110'));
  coherent(s);
});

test('Heat et Wire : épuiser un Personnage de coût ≤ nombre de Vies adverses ; [Déclenchement] se joue avec 2 Vies ou moins', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-110']); setDon(g, 0, 3); setLife(g, 1, [O_BONNEY, O_BONNEY, O_JINBE]); setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]); });
  s = play(s, 'OP10-110');
  assert.equal(hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), false, 'coût 4 > 3 Vies');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(theirs(s, O_STUSSY).rested);
  for (const life of [['OP10-110', 'OP10-102'], ['OP10-110', 'OP10-102', 'OP10-102']]) {
    let t = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, []); setLife(g, 0, life); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
    t = noCounter(attack(t, theirs(t, O_CHOPPER).uid, t.players[0].leader.uid));
    t = choose(t, 'trigger');
    assert.equal(Boolean(mine(t, 'OP10-110')), life.length - 1 <= 2, `${life.length - 1} Vies`);
  }
});

test('Eustass "Captain" Kidd (OP10-112) : s’épuiser pour défausser la Vie du dessus adverse ; fin de tour, piocher 1 et défausser 1', () => {
  let s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP10-112', 'OP10-113']); setDon(g, 0, 8); setLife(g, 1, [O_BONNEY, O_JINBE, O_STUSSY]); });
  s = choose(play(s, 'OP10-112'), 'yes');
  assert.equal(s.players[1].life.length, 2);
  assert.ok(s.players[1].trash.some((c) => c.num === O_BONNEY));
  assert.ok(mine(s, 'OP10-112').rested);
  s = act(s, 'end');
  expectTag(s, 'discard');
  coherent(choose(s, (o) => o.id.startsWith('card:')));
});

test('Zoro (OP10-113) : [Initiative] avec moins de Vies ; « À bientôt... » +4000 et pioche sans Vie ; ROOM avec 1 Vie ou moins', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setLife(g, 0, ['OP10-102']); setChars(g, 0, [{ num: 'OP10-113', extra: { playedTurn: 5 } }]); });
  assert.ok(attackAbility(s, 0, mine(s, 'OP10-113')).can);
  s = scenario([KIDD, 'ST-21'], (g) => { setLife(g, 0, ['OP10-102', 'OP10-102', 'OP10-110', 'OP10-110', 'OP10-108', 'OP10-108']); setChars(g, 0, [{ num: 'OP10-113', extra: { playedTurn: 5 } }]); });
  assert.equal(attackAbility(s, 0, mine(s, 'OP10-113')).can, false);

  s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-115']); setLife(g, 0, []); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = choose(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid), (o) => o.id.startsWith('cevent:'));
  assert.ok(logHas(s, 'pioche 1 carte'));
  coherent(noCounter(s));

  s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-117']); setLife(g, 0, ['OP10-102']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP10-108', extra: { rested: true } }]); setChars(g, 1, [{ num: O_STUSSY }]); }, 1);
  s = choose(attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid), (o) => o.id.startsWith('cevent:'));
  s = choose(s, `card:${mine(s, 'OP10-108').uid}`);
  assert.equal(mine(s, 'OP10-108').rested, false);
  s = noCounter(s);
  assert.ok(logHas(s, 'repoussée (5000 contre 8000)'));
});

test('Damned Punk : regarder la Vie adverse du dessus et la mettre dessous, puis KO de coût 5 ou moins', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-116']); setDon(g, 0, 4); setLife(g, 1, [O_BONNEY, O_JINBE]); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = play(s, 'OP10-116');
  s = choose(s, 'opp');
  s = choose(s, 'bottom');
  assert.deepEqual(s.players[1].life.map((c) => c.num), [O_JINBE, O_BONNEY]);
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
});

test('Trafalgar Law (OP10-119) : un {Supernovae} de la main face cachée sur la Vie, puis 1 DON!! au Leader {Supernovae}', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-119', 'OP10-113']); setDon(g, 0, 7, 1); });
  s = play(s, 'OP10-119');
  s = choose(s, (o) => o.label === 'Roronoa Zoro');
  assert.equal(s.players[0].life[0].num, 'OP10-113');
  assert.equal(Boolean(s.players[0].life[0].faceUp), false);
  assert.equal(s.players[0].leader.don, 1);
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP10-119']); setDon(g, 0, 7, 1); });
  s = play(s, 'OP10-119');
  assert.equal(s.players[0].leader.don, 0, 'Leader Luffy');
});

test('Remplacements : Capone (Vie face cachée), Bonney OP13-109 (Vie retournée), Bonney OP15-105 (Vie en main)', () => {
  // Capone protège un autre {Supernovae}
  let s = oppMole((g) => { setChars(g, 0, [{ num: 'OP11-101' }, { num: 'OP10-108' }]); });
  s = play(s, O_MOLE, 1);
  s = choose(s, `card:${mine(s, 'OP10-108').uid}`);
  s = choose(s, `card:${mine(s, 'OP10-108').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.equal(mine(s, 'OP10-108'), undefined);
  assert.equal(s.players[0].life[0].num, 'OP10-108');
  assert.equal(Boolean(s.players[0].life[0].faceUp), false);
  coherent(s);
  // Bonney OP13-109 se protège en retournant sa Vie du dessus
  s = oppMole((g) => { setChars(g, 0, [{ num: 'OP13-109' }]); });
  s = play(s, O_MOLE, 1);
  s = choose(choose(s, `card:${mine(s, 'OP13-109').uid}`), `card:${mine(s, 'OP13-109').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP13-109'));
  assert.ok(s.players[0].life[0].faceUp);
  coherent(s);
  // Bonney OP15-105 protège un Personnage de 7000 de base ou moins
  s = oppMole((g) => { setHand(g, 0, []); setChars(g, 0, [{ num: 'OP15-105' }, { num: 'OP10-108' }]); });
  const lives = s.players[0].life.length;
  s = play(s, O_MOLE, 1);
  s = choose(choose(s, `card:${mine(s, 'OP10-108').uid}`), `card:${mine(s, 'OP10-108').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP10-108'));
  assert.equal(s.players[0].life.length, lives - 1);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
});

test('Jewelry Bonney (OP12-101) : s’épuiser, Leader {Supernovae} +1000 ; Slam Gibson : un Personnage adverse dans sa Vie face cachée', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-101' }]); });
  const before = power(s, s.players[0].leader.uid);
  s = act(s, `act:${mine(s, 'OP12-101').uid}`);
  assert.equal(power(s, s.players[0].leader.uid), before + 1000);
  s = scenario([PLAIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-101' }]); });
  s = act(s, `act:${mine(s, 'OP12-101').uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 5000, 'Leader Luffy');

  s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP12-117']); setDon(g, 0, 6); setChars(g, 1, [{ num: O_LUFFY }]); });
  const lives = s.players[1].life.length;
  s = choose(play(s, 'OP12-117'), 'yes');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  s = choose(s, 'bottom');
  assert.equal(s.players[1].life.length, lives + 1);
  assert.equal(s.players[1].life.at(-1)!.num, O_LUFFY);
  coherent(s);
});

test('Urouge : défausser un {Supernovae} pour [Initiative] ; retourner sa Vie face cachée pour 1 DON!! ; Caribou (OP17-101) : une Vie en main pour −3000', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP15-099', 'OP10-108']); setDon(g, 0, 6); });
  s = choose(play(s, 'OP15-099'), 'yes');
  assert.ok(attackAbility(s, 0, mine(s, 'OP15-099')).can);
  coherent(s);
  s = scenario([KIDD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-099' }]); setDon(g, 0, 0, 1); g.players[0].life[0].faceUp = true; });
  s = act(s, `act:${mine(s, 'OP15-099').uid}`);
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(Boolean(s.players[0].life[0].faceUp), false);
  assert.equal(s.players[0].leader.don, 1);
  coherent(s);

  s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, []); setChars(g, 0, [{ num: 'OP17-101' }]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(act(s, `act:${mine(s, 'OP17-101').uid}`), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 3000);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(hasOption(s, `act:${mine(s, 'OP17-101').uid}`), false);
  coherent(s);
});

test('Trafalgar Law (P-155) : en attaquant, défausser une carte à [Déclenchement] pour −2000 ; Luffy (ST13-015) : +2000, pioche et Vie défaussée', () => {
  let s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, ['OP10-110', 'OP10-108']); setChars(g, 0, [{ num: 'P-155' }]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(attack(s, mine(s, 'P-155').uid, s.players[1].leader.uid), 'yes');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), ['OP10-108'], 'seule Heat et Wire a un [Déclenchement]');
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 4000);
  coherent(noCounter(s));

  s = scenario([KIDD, 'ST-21'], (g) => { setHand(g, 0, []); setChars(g, 0, [{ num: 'ST13-015' }]); });
  const lives = s.players[0].life.length;
  s = act(s, `act:${mine(s, 'ST13-015').uid}`);
  assert.equal(power(s, mine(s, 'ST13-015').uid), 8000);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].life.length, lives - 1);
  coherent(s);
  void setTrash;
  void O_SENTOMARU;
});
