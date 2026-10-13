// Famille du Leader Kaido (phase 4E) : cartes violettes {Équipage des cent bêtes} et {Quatre Empereurs}, qui jouent avec
// les DON!!. Un deck d'essai au Leader Kaido (2 exemplaires de chaque carte), un au Leader Katakuri ({Équipage de Big
// Mom}) et un au Leader Luffy pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_KAIDO } from '../engine/cards/fam-kaido.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, canLeaveByEffect, donOnField, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife, take } from './helpers.ts';

const FAMILY = Object.keys(FAM_KAIDO);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'ST04-017': 2, 'OP11-065': 2 };
const KAIDO = 'TEST-KAIDO';
const BIGMOM = 'TEST-KAIDO-BIGMOM';
const PLAIN = 'TEST-KAIDO-LUFFY';
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };
DECKS[BIGMOM] = { id: BIGMOM, name: 'Essai', series: 'TEST', leader: 'OP11-062', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
// le Leader Kaido propose son [Attaque adverse] (DON!! −1) à chaque attaque adverse : refuser
const skipLeader = (s: GameState) => (s.decision?.tag === 'may' && s.decision.prompt.startsWith('Kaido') ? choose(s, 'no') : s);
function setStage(g: GameState, p: PlayerId, num: string, rested = false) {
  const c = take(g, p, num);
  g.players[p].stage = { uid: c.uid, num: c.num, rested, don: 0, playedTurn: 0, usedOpt: [] };
}

test('Ragnaraku : DON!! −1 : KO de coût 8 ou moins ; Gum Gum Saut à la corde : DON!! −2 : épuiser, puis piocher', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['EB01-039']); setDon(g, 0, 6); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(play(s, 'EB01-039'), 'yes');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(donOnField(s, 0), 5);
  coherent(s);
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP09-079']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(choose(play(s, 'OP09-079'), 'yes'), `card:${theirs(s, O_LUFFY).uid}`);
  assert.ok(theirs(s, O_LUFFY).rested);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
});

test('Kaido (EB04-030) : DON!! −2 : [Initiative] avec un Leader {Équipage des cent bêtes}, puis épuiser ; KO remplacé par 1 DON!! renvoyée', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['EB04-030']); setDon(g, 0, 9); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(play(s, 'EB04-030'), 'yes');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.ok(attackAbility(s, 0, mine(s, 'EB04-030')).can);
  assert.ok(theirs(s, O_LUFFY).rested);
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['EB04-030']); setDon(g, 0, 9); });
  s = choose(play(s, 'EB04-030'), 'yes');
  assert.equal(attackAbility(s, 0, mine(s, 'EB04-030')).can, false, 'Leader Luffy');
});

test('Monkey D. Luffy (OP05-119) : DON!! −10, ses autres Personnages sous le deck, puis un tour supplémentaire', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-119']);
    setChars(g, 0, [{ num: 'OP17-072' }, { num: 'OP17-071' }]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: O_STUSSY }]);
  });
  s.mods.push({ uid: s.players[1].chars[0].uid, stat: 'power', amount: -1000, until: s.turn + 1, source: 'essai' });
  s = play(s, 'OP05-119');
  s = choose(s, 'yes');
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP05-119']);
  assert.equal(s.players[0].extraTurn, 5);
  const turn = s.turn;
  s = act(s, 'end');
  assert.equal(s.active, 0, 'il rejoue');
  assert.equal(s.turn, turn + 1);
  assert.ok(logHas(s, 'joue un tour supplémentaire'));
  assert.equal(s.mods.find((m) => m.source === 'essai')!.until, turn + 2, 'échéance décalée d’un tour');
});

test('Alber : se défausser pour jouer un [King] de coût 7 ou moins (Leader {Équipage des cent bêtes} et 10 DON!!) ; King (OP08-060) : [Initiative] si l’adversaire a 5 DON!!', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP08-060']); setChars(g, 0, [{ num: 'OP08-059' }]); setDon(g, 0, 10); setDon(g, 1, 5); });
  s = act(s, `act:${mine(s, 'OP08-059').uid}`);
  s = choose(s, (o) => o.label.startsWith('King'));
  s = choose(s, 'yes');  // [Jouée] de King : DON!! −1
  assert.ok(attackAbility(s, 0, mine(s, 'OP08-060')).can, 'l’adversaire a 5 DON!!');
  coherent(s);
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP08-060']); setChars(g, 0, [{ num: 'OP08-059' }]); setDon(g, 0, 9); });
  s = act(s, `act:${mine(s, 'OP08-059').uid}`);
  assert.equal(s.players[0].hand.length, 1, '9 DON!! : rien');
});

test('« Un vrai délice... » : 1 DON!! redressée, une de plus si l’adversaire a un Personnage de 6000 ; Conquest of the Sea : 2 KO', () => {
  for (const big of [true, false]) {
    let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP08-076']); setDon(g, 0, 3); setChars(g, 1, [{ num: big ? O_CHOPPER : O_STUSSY }]); });
    s = play(s, 'OP08-076');
    assert.equal(s.players[0].donActive, big ? 2 : 1);
  }
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP08-077']); setDon(g, 0, 8); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }, { num: O_STUSSY }]); });
  s = choose(play(s, 'OP08-077'), 'yes');
  s = choose(choose(s, `card:${theirs(s, O_CHOPPER).uid}`), `card:${theirs(s, O_LUFFY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
});

test('Kaido & Linlin : en attaquant, DON!! −10 : KO de tous les autres Personnages, +1 Vie, −1 Vie adverse', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP08-119', extra: { playedTurn: 0 } }, { num: 'OP17-072' }]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_STUSSY }]);
  });
  const [mineLife, theirLife] = [s.players[0].life.length, s.players[1].life.length];
  s = choose(attack(s, mine(s, 'OP08-119').uid, s.players[1].leader.uid), 'yes');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP08-119']);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].life.length, mineLife + 1);
  assert.equal(s.players[1].life.length, theirLife - 1);
  coherent(noCounter(s));
});

test('Charlotte Linlin (OP11-073) : [Initiative] avec un Leader {Équipage de Big Mom} ; DON!! −5 et coût déclaré juste : Leader +2000', () => {
  let s = scenario([BIGMOM, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP11-073', extra: { playedTurn: 5 } }]); });
  assert.ok(attackAbility(s, 0, mine(s, 'OP11-073')).can);
  s = scenario([KAIDO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP11-073', extra: { playedTurn: 5 } }]); });
  assert.equal(attackAbility(s, 0, mine(s, 'OP11-073')).can, false);
  s = scenario([BIGMOM, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP11-073' }]); setDon(g, 0, 5); setDeckTop(g, 1, [O_STUSSY]); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  const before = power(s, s.players[0].leader.uid);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  s = choose(s, 'first:OP11-073');
  s = choose(s, 'yes');
  expectTag(s, 'declareCost');
  s = choose(s, 'cost:3');
  while (s.decision?.tag === 'may') s = choose(s, 'no');  // effet du Leader Katakuri
  assert.equal(power(s, s.players[0].leader.uid), before + 2000);
  coherent(noCounter(s));
});

test('Ulti et Page One : 1 DON!! (Leader {Équipage des cent bêtes}), puis KO de 3000 ou moins ; Jack : DON!! −1, −2000 ; Who’s Who : 2 KO de coût 2 ou moins', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-060']); setDon(g, 0, 6); setChars(g, 1, [{ num: O_BONNEY }, { num: O_JINBE }]); });
  s = play(s, 'OP17-060');
  assert.equal(s.players[0].donActive, 1);
  assert.equal(hasOption(s, `card:${theirs(s, O_JINBE).uid}`), false, '4000');
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  coherent(s);
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-069']); setDon(g, 0, 10); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(choose(play(s, 'OP17-069'), 'yes'), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 4000);
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-071']); setDon(g, 0, 3); setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_JINBE }, { num: O_STUSSY }]); });
  s = choose(play(s, 'OP17-071'), 'yes');
  s = choose(choose(s, `card:${theirs(s, O_SENTOMARU).uid}`), `card:${theirs(s, O_JINBE).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
});

test('King (OP17-064) et Black Maria (OP17-072) : [Attaque adverse] [Une fois par tour] défausser 1 carte pour +2000 / +1000', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-071', 'OP17-075']); setChars(g, 0, [{ num: 'OP17-064' }, { num: 'OP17-072' }]); setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 2 } }, { num: O_LUFFY }]); setDon(g, 1, 0); }, 1);
  const before = power(s, s.players[0].leader.uid);
  s = skipLeader(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  let answered = 0;
  for (let i = 0; i < 20 && s.decision && s.decision.kind !== 'blocker' && s.decision.kind !== 'counter'; i++) {
    const d = s.decision;
    if (d.options.some((o) => o.id.startsWith('first:'))) s = choose(s, (o) => o.id.startsWith('first:') && o.id !== 'first:OP17-058');
    else if (d.tag === 'may') {
      const leader = d.prompt.startsWith('Kaido');
      s = choose(s, leader ? 'no' : 'yes');
      if (!leader) answered++;
    } else s = choose(s, d.tag === 'discard' ? (o) => o.id.startsWith('card:') : `card:${s.players[0].leader.uid}`);
  }
  assert.equal(answered, 2);
  assert.equal(power(s, s.players[0].leader.uid), before + 3000);
  if (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  s = noCounter(s);
  s = skipLeader(attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid));
  assert.notEqual(s.decision?.tag, 'may', 'une fois par tour');
});

test('X-Drake : DON!! −2, une carte de la main adverse au hasard ; « Wo lo lo lo lo ! » : [Contre] défausser 1 carte pour +3000', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-075']); setDon(g, 0, 4); setHand(g, 1, [O_BONNEY, O_JINBE]); });
  s = choose(play(s, 'OP17-075'), 'yes');
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['OP17-076', 'OP17-071']); setDon(g, 0, 0); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = skipLeader(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  s = choose(s, 'yes');
  s = noCounter(s);
  assert.ok(logHas(s, 'repoussée (6000 contre 8000)'));
  coherent(s);
});

test('Kundali et Ivresse du Dragon Divin : épuiser 3 ou 2 DON!! et défausser 2 cartes, 3 DON!! épuisées ; [Contre] Leader +4000', () => {
  for (const [num, rest] of [['OP17-077', 3], ['OP17-078', 2]] as const) {
    let s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, [num, 'OP17-071', 'OP17-075']); setDon(g, 0, 5); });
    const total = donOnField(s, 0);
    s = choose(play(s, num), 'yes');
    for (let i = 0; i < rest; i++) if (s.decision?.tag === 'restCost') s = choose(s, (o) => o.id === 'don' || o.id.startsWith('card:'));
    while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(donOnField(s, 0), total + 3);
    coherent(s);
  }
  let s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP17-078', 'OP17-071', 'OP17-075']); setDon(g, 0, 5); });
  const total = donOnField(s, 0);
  s = choose(play(s, 'OP17-078'), 'yes');
  while (s.decision) {
    if (s.decision.kind === 'main') break;
    s = choose(s, (o) => o.id === 'don' || o.id.startsWith('card:'));
  }
  assert.equal(donOnField(s, 0), total, 'Leader Luffy : pas de DON!!');
});

test('Ulti (P-077) : quand 2 DON!! sont renvoyées, 1 DON!! épuisée et un Lieu violet redressé ; Luffy (P-099) ; Shanks (P-104)', () => {
  let s = scenario([KAIDO, 'ST-21'], (g) => {
    setHand(g, 0, ['OP08-077']);
    setChars(g, 0, [{ num: 'P-077' }]);
    setStage(g, 0, 'ST04-017', true);
    setDon(g, 0, 8);
  });
  s = choose(play(s, 'OP08-077'), 'yes');
  while (s.decision?.kind === 'effect') s = choose(s, 'none');
  assert.ok(logHas(s, 'Ulti'), 'Ulti réagit');
  coherent(s);

  s = scenario([KAIDO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'P-099' }]); setDon(g, 0, 10); });
  s = choose(attack(s, mine(s, 'P-099').uid, s.players[1].leader.uid), 'yes');
  assert.equal(mine(s, 'P-099').rested, false);
  coherent(noCounter(s));

  s = scenario([KAIDO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'P-104' }]); setDon(g, 0, 10); });
  assert.equal(canLeaveByEffect(s, mine(s, 'P-104').uid, 1), false);
  s = scenario([KAIDO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'P-104' }]); setDon(g, 0, 9); });
  assert.equal(canLeaveByEffect(s, mine(s, 'P-104').uid, 1), true);
  void setLife;
});
