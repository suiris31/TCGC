// Famille du Leader Sabo (phase 4E), cartes noires {Armée révolutionnaire} et {Dressrosa} : même deck d'essai que
// cards-fam-sabo.test.ts (Leader Sabo, 2 exemplaires de chaque carte), et un deck au Leader Luffy pour les conditions
// fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_SABO } from '../engine/cards/fam-sabo.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, fieldCost, handCost, hasBlocker, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, keepOrder, play, scenario, setChars, setDeckTop, setDon, setHand, take } from './helpers.ts';

const FAMILY = Object.keys(FAM_SABO);
const TEST = 'TEST-SABO-NOIR';
const TEST_LUFFY = 'TEST-SABO-NOIR-LUFFY';
DECKS[TEST] = { id: TEST, name: 'Essai', series: 'TEST', leader: 'OP13-004', cards: { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP15-057': 2 } };
DECKS[TEST_LUFFY] = { id: TEST_LUFFY, name: 'Essai Luffy', series: 'TEST', leader: 'ST21-001', cards: Object.fromEntries(FAMILY.map((n) => [n, 2])) };

// adversaire ST-21
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000
const O_MOLE = 'ST21-017';       // −5000, puis KO 2000 ou moins avec un Personnage de 6000
const OPP_HAND5 = [O_JINBE, O_JINBE, O_BONNEY, O_BONNEY, O_STUSSY];

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
function setTrash(g: GameState, p: PlayerId, nums: string[]) {
  const cards = nums.map((n) => take(g, p, n));
  g.players[p].deck.push(...g.players[p].trash);
  g.players[p].trash = cards;
}
const fillTrash = (g: GameState, n: number) => setTrash(g, 0, Array.from({ length: n }, (_, i) => FAMILY[i % FAMILY.length]));

test('Scarlet : se défausser pour jouer épuisé un {Dressrosa} de coût 3 ou moins, puis −2 de coût ; Soldat unijambiste : −3 de coût', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP10-088', 'OP05-091']); setChars(g, 0, [{ num: 'EB01-042' }]); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = act(s, `act:${mine(s, 'EB01-042').uid}`);
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Rebecca')), false, 'Rebecca : coût 4');
  s = choose(s, (o) => o.label.startsWith('Nami'));
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(mine(s, 'OP10-088').rested);
  assert.ok(s.players[0].trash.some((c) => c.num === 'EB01-042'));
  assert.equal(fieldCost(s, theirs(s, O_STUSSY).uid), 1);
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP05-081' }]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(act(s, `act:${mine(s, 'OP05-081').uid}`), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_CHOPPER).uid), 1);
});

test('Trafalgar Law (EB02-045) : 2 cartes de la Défausse sous le deck, puis piocher ou faire défausser (adversaire à 5 cartes)', () => {
  const setup = (oppHand: string[]) => (g: GameState) => {
    setHand(g, 0, ['EB02-045']);
    setDon(g, 0, 5);
    setTrash(g, 0, ['OP10-088', 'OP10-083', 'OP10-087']);
    setHand(g, 1, oppHand);
  };
  let s = scenario([TEST, 'ST-21'], setup(OPP_HAND5));
  s = choose(play(s, 'EB02-045'), 'yes');
  s = keepOrder(choose(choose(s, (o) => o.label === 'Nami'), (o) => o.label === 'Momonosuké Kozuki'));
  expectTag(s, 'chooseOne');
  s = choose(s, (o) => o.label.startsWith('Ton adversaire'));
  s = choose(s, (o) => o.label === 'Jinbe');
  assert.equal(s.players[1].hand.length, 4);
  assert.deepEqual(s.players[0].trash.map((c) => c.num), ['OP10-087']);
  coherent(s);
  s = scenario([TEST, 'ST-21'], setup([O_JINBE]));
  s = keepOrder(choose(choose(choose(play(s, 'EB02-045'), 'yes'), (o) => o.label === 'Nami'), (o) => o.label === 'Momonosuké Kozuki'));
  assert.equal(s.players[0].hand.length, 1, 'seule la pioche est possible');
});

test('Koala (EB03-042) : +4 de coût avec un Leader {Armée révolutionnaire} ; mise KO pendant le tour adverse, rejoue un {Armée révolutionnaire}', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP12-095']);
    setTrash(g, 0, ['OP05-007', 'EB03-042']);
    setChars(g, 0, [{ num: 'EB03-042', extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  assert.equal(fieldCost(s, mine(s, 'EB03-042').uid), 8);
  s = noCounter(attack(s, theirs(s, O_CHOPPER).uid, mine(s, 'EB03-042').uid));
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Lindbergh (main)', 'Sabo (Défausse)', 'Aucun'], 'pas l’autre Koala');
  s = choose(s, (o) => o.label === 'Sabo (Défausse)');
  if (s.decision?.tag === 'oppKo') s = choose(s, 'none');
  assert.ok(mine(s, 'OP05-007'));
  coherent(s);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB03-042' }]); });
  assert.equal(fieldCost(s, mine(s, 'EB03-042').uid), 4);
});

test('Rebecca (EB03-048) : chercher un Lieu {Dressrosa}, puis jouer un Lieu {Dressrosa} de coût 1', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['EB03-048']); setDeckTop(g, 0, ['OP10-088', 'OP15-057', 'OP10-083']); setDon(g, 0, 2); });
  s = play(s, 'EB03-048');
  s = keepOrder(choose(s, (o) => o.label === 'Royaume de Dressrosa'));
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.label.startsWith('Royaume de Dressrosa'));
  assert.equal(s.players[0].stage?.num, 'OP15-057');
  coherent(s);
});

test('Ginney : s’épuiser, +1000 à un {Armée révolutionnaire} si 2 Personnages de coût 8 ou plus sont en jeu', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB04-045' }, { num: 'OP12-095' }, { num: 'OP12-089' }]); });
  const before = power(s, s.players[0].leader.uid);
  s = choose(act(s, `act:${mine(s, 'EB04-045').uid}`), `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), before + 1000, 'Lindbergh et Hack valent 8');
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB04-045' }, { num: 'OP12-095' }]); });
  s = act(s, `act:${mine(s, 'EB04-045').uid}`);
  assert.notEqual(s.decision?.tag, 'ownPower', 'un seul Personnage de coût 8');
});

test('Mansherry : ➀, s’épuiser et 2 cartes de la Défausse sous le deck, pour reprendre un Personnage noir de coût 3 à 5', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP05-088' }]);
    setTrash(g, 0, ['OP10-088', 'OP10-083', 'OP10-095', 'OP07-118']);
    setDon(g, 0, 1);
  });
  s = act(s, `act:${mine(s, 'OP05-088').uid}`);
  s = keepOrder(choose(choose(s, (o) => o.label === 'Nami'), (o) => o.label === 'Momonosuké Kozuki'));
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Roronoa Zoro', 'Aucune'], 'Sabo : coût 8');
  s = choose(s, (o) => o.label === 'Roronoa Zoro');
  assert.equal(s.players[0].donActive, 0);
  assert.ok(mine(s, 'OP05-088').rested);
  coherent(s);
});

test('Rebecca (OP05-091) : reprendre un Personnage noir de coût 3 à 7, puis jouer épuisé un Personnage noir de coût 3 ou moins', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP05-091', 'OP10-088']); setTrash(g, 0, ['OP10-095', 'OP07-118', 'OP05-091']); setDon(g, 0, 4); });
  s = play(s, 'OP05-091');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Roronoa Zoro', 'Aucune'], 'ni Sabo (8) ni Rebecca');
  s = choose(s, (o) => o.label === 'Roronoa Zoro');
  s = choose(s, (o) => o.label.startsWith('Nami'));
  assert.ok(mine(s, 'OP10-088').rested);
  coherent(s);
});

test('Haute Couture Patch★Work : −3 de coût, puis un Personnage de coût 0 ne se redresse pas ; Dragon Claw : +4000 et KO avec 15 cartes en Défausse', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP05-094']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_STUSSY, extra: { rested: true } }]); });
  s = choose(play(s, 'OP05-094'), `card:${theirs(s, O_STUSSY).uid}`);
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(s.mods.some((m) => m.stat === 'noRefresh' && m.uid === theirs(s, O_STUSSY).uid));
  coherent(s);
  const setup = (trash: number) => (g: GameState) => { setHand(g, 0, ['OP05-095']); setDon(g, 0, 2); fillTrash(g, trash); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); };
  s = scenario([TEST, 'ST-21'], setup(15), 1);
  s = choose(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid), (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), false, 'coût 5');
  s = noCounter(choose(s, `card:${theirs(s, O_CHOPPER).uid}`));
  coherent(s);
  // Dragon Claw compte lui-même (placé dans la Défausse en l'activant) : 13 + 1 cartes ne suffisent pas
  s = scenario([TEST, 'ST-21'], setup(13), 1);
  s = choose(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid), (o) => o.id.startsWith('cevent:'));
  assert.notEqual(s.decision?.tag, 'oppKo');
});

test('Sai : +2000 avec un Leader {Dressrosa} redressé ; Sabo (OP07-118) : défausser 1 carte, KO de coût 5 ou moins et 3 ou moins', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP06-088' }]); });
  assert.equal(power(s, mine(s, 'OP06-088').uid), 6000);
  s.players[0].leader.rested = true;
  assert.equal(power(s, mine(s, 'OP06-088').uid), 4000);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP06-088' }]); });
  assert.equal(power(s, mine(s, 'OP06-088').uid), 4000);

  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP07-118', 'OP10-088']); setDon(g, 0, 8); setChars(g, 1, [{ num: O_LUFFY }, { num: O_STUSSY }, { num: O_CHOPPER }]); });
  s = choose(play(s, 'OP07-118'), 'yes');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), false, 'coût 4 > 3');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(s);
});

test('Cartes OP10 {Dressrosa} : épuiser son Leader {Dressrosa} (Zoro, Nami, Chopper, Momonosuké, Brook) ; Leader Luffy : impossible', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP10-095']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }]); });
  const deck = s.players[0].deck.length;
  s = choose(choose(play(s, 'OP10-095'), 'yes'), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(s.players[0].leader.rested);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].deck.length, deck - 2);
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, []); setChars(g, 0, [{ num: 'OP10-088' }, { num: 'OP10-091' }]); setChars(g, 1, [{ num: O_BONNEY }]); });
  s = act(s, `act:${mine(s, 'OP10-088').uid}`);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(hasOption(s, `act:${mine(s, 'OP10-091').uid}`), false, 'Leader déjà épuisé');
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-087' }]); setHand(g, 1, OPP_HAND5); });
  s = choose(act(s, `act:${mine(s, 'OP10-087').uid}`), (o) => o.label === 'Stussy');
  assert.equal(s.players[1].hand.length, 4);
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-083' }, { num: 'OP10-091' }]); setChars(g, 1, [{ num: O_BONNEY }]); });
  s = choose(act(s, `act:${mine(s, 'OP10-091').uid}`), `card:${theirs(s, O_BONNEY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-088' }]); });
  assert.equal(hasOption(s, `act:${mine(s, 'OP10-088').uid}`), false, 'Leader Luffy : pas {Dressrosa}');
});

test('Jesus Burgess : [DON!! x1] [Initiative] avec 8 cartes en Défausse ; Franky (OP10-090) : KO, rejoue un {Dressrosa} de coût 3 ou moins', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { fillTrash(g, 8); setChars(g, 0, [{ num: 'OP10-085', extra: { don: 1, playedTurn: 5 } }, { num: 'OP10-085', extra: { playedTurn: 5 } }]); setDon(g, 0, 0); });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, true);
  assert.equal(attackAbility(s, 0, s.players[0].chars[1]).can, false);
  s = scenario([TEST, 'ST-21'], (g) => { setTrash(g, 0, ['OP10-088', 'OP10-095']); setChars(g, 0, [{ num: 'OP10-090', extra: { rested: true } }]); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = noCounter(attack(s, theirs(s, O_CHOPPER).uid, mine(s, 'OP10-090').uid));
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Nami (coût 2)', 'Aucun'], 'Zoro : coût 4');
  s = choose(s, (o) => o.label.startsWith('Nami'));
  assert.ok(mine(s, 'OP10-088').rested);
  coherent(s);
});

test('Gum Gum Rhino Schneider : +2000 à un {Dressrosa}, et [Exil] avec 10 cartes en Défausse', () => {
  // l'Événement compte lui-même (placé dans la Défausse en l'activant)
  for (const trash of [9, 8]) {
    let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP10-097']); setDon(g, 0, 1); fillTrash(g, trash); setChars(g, 0, [{ num: 'OP10-095' }]); });
    s = choose(play(s, 'OP10-097'), `card:${mine(s, 'OP10-095').uid}`);
    assert.equal(power(s, mine(s, 'OP10-095').uid), 8000);
    assert.equal(hasKeyword(s, 0, mine(s, 'OP10-095'), 'Banish'), trash + 1 >= 10);
  }
});

test('Monkey D. Luffy (OP10-118) : une fois par tour, pas mis KO par un effet adverse', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP10-118' }]);
    setHand(g, 1, [O_MOLE, O_MOLE]);
    setDon(g, 1, 8);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = play(s, O_MOLE, 1);
  s = choose(s, `card:${mine(s, 'OP10-118').uid}`);
  s = choose(s, `card:${mine(s, 'OP10-118').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP10-118'));
  s = play(s, O_MOLE, 1);
  s = choose(s, 'none');
  s = choose(s, `card:${mine(s, 'OP10-118').uid}`);
  assert.equal(mine(s, 'OP10-118'), undefined, 'deuxième fois : KO');
  coherent(s);
});

test('Ivankov (OP12-084), Corbeau, Koala (OP12-086), Hack, Lindbergh : avec ou sans Leader {Armée révolutionnaire}', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP12-084']); setDon(g, 0, 3); });
  s = play(s, 'OP12-084');
  assert.equal(s.players[0].trash.length, 3);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP12-084']); setDon(g, 0, 3); });
  s = play(s, 'OP12-084');
  assert.equal(s.players[0].trash.length, 0);

  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-085' }, { num: 'OP12-089' }, { num: 'OP12-095' }]); setHand(g, 1, OPP_HAND5); });
  assert.deepEqual(s.players[0].chars.map((c) => fieldCost(s, c.uid)), [8, 8, 8]);
  assert.equal(hasBlocker(s, 0, mine(s, 'OP12-089')), true);
  s = choose(attack(s, mine(s, 'OP12-085').uid, s.players[1].leader.uid), (o) => o.label === 'Stussy');
  assert.equal(s.players[1].hand.length, 4);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-085' }, { num: 'OP12-089' }]); });
  assert.deepEqual(s.players[0].chars.map((c) => fieldCost(s, c.uid)), [5, 4]);
  assert.equal(hasBlocker(s, 0, mine(s, 'OP12-089')), false);

  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP12-086']); setDeckTop(g, 0, ['OP10-083', 'OP10-088', 'OP12-095']); setDon(g, 0, 1); });
  s = play(s, 'OP12-086');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Lindbergh', 'Aucune'], 'ni Momonosuké ni Nami');
  s = choose(s, (o) => o.label === 'Lindbergh');
  assert.equal(s.players[0].trash.length, 2);
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-089', extra: { rested: true } }]); setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]); }, 1);
  s = noCounter(attack(s, theirs(s, O_LUFFY).uid, mine(s, 'OP12-089').uid));
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), false, 'coût de base 5');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(theirs(s, O_CHOPPER), undefined);
  coherent(s);
});

test('Monkey D. Dragon (OP12-094) : 3 cartes {Armée révolutionnaire} de la Défausse sous le deck, jouer un Personnage de coût 6 ou moins de la Défausse', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP12-094']); setDon(g, 0, 8); setTrash(g, 0, ['OP05-006', 'OP05-015', 'OP12-095', 'OP10-095', 'OP07-118']); });
  s = choose(play(s, 'OP12-094'), 'yes');
  s = choose(s, (o) => o.label === 'Koala');
  s = choose(s, (o) => o.label === 'Belo Betty');
  s = keepOrder(choose(s, (o) => o.label === 'Lindbergh'));
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Sabo')), false, 'Sabo : coût 8');
  s = choose(s, (o) => o.label.startsWith('Roronoa Zoro'));
  if (s.decision?.tag === 'may') s = choose(s, 'no');
  assert.ok(mine(s, 'OP10-095'));
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP12-094']); setDon(g, 0, 8); setTrash(g, 0, ['OP05-006', 'OP10-095', 'OP10-088']); });
  s = play(s, 'OP12-094');
  assert.notEqual(s.decision?.tag, 'may', 'une seule carte {Armée révolutionnaire} en Défausse');
});

test('Ursus Shock : KO de coût 4 ou moins, 6 ou moins avec un Personnage de coût 8 ; Sabo (OP13-120) : +2 de coût et 1 DON!! ; Kuma (OP16-093)', () => {
  const setup = (big: boolean) => (g: GameState) => { setHand(g, 0, ['OP12-096']); setDon(g, 0, 4); setChars(g, 0, big ? [{ num: 'OP12-095' }] : []); setChars(g, 1, [{ num: O_LUFFY }]); };
  let s = scenario([TEST, 'ST-21'], setup(true));
  s = choose(play(s, 'OP12-096'), `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  s = scenario([TEST, 'ST-21'], setup(false));
  s = play(s, 'OP12-096');
  assert.notEqual(s.decision?.tag, 'oppKo', 'Luffy : coût 5');

  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP13-120' }, { num: 'OP10-088' }]); setDon(g, 0, 0, 1); });
  s = choose(act(s, `act:${mine(s, 'OP13-120').uid}`), `card:${mine(s, 'OP10-088').uid}`);
  assert.equal(fieldCost(s, mine(s, 'OP10-088').uid), 4);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(hasOption(s, `act:${mine(s, 'OP13-120').uid}`), false);
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP16-093', 'OP10-088']); setDon(g, 0, 3, 1); });
  s = play(s, 'OP16-093');
  s = choose(choose(s, (o) => o.label === 'Nami'), (o) => o.id.startsWith('card:'));
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].leader.don, 1);
  coherent(s);
});

test('Sabo (PRB02-014) : −3 de coût en main avec 15 cartes en Défausse', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['PRB02-014']); fillTrash(g, 15); });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 3);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['PRB02-014']); fillTrash(g, 14); });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 6);
});
