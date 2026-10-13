// Famille du Leader Robin, cartes violettes (phase 4E) : {Équipage de Chapeau de paille} violets, qui jouent avec les
// DON!! (8 ou 10 sur le terrain, DON!! −X, « renvoyez 1 DON!! ou plus »). Decks d'essai aux Leaders Robin (multicolore),
// Sanji (OP12-041) et Kaido pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_ROBIN_PURPLE } from '../engine/cards/fam-robin-purple.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, donOnField, handCost, hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { aiAnswers, attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDon, setHand, take } from './helpers.ts';

const FAMILY = Object.keys(FAM_ROBIN_PURPLE);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'EB01-039': 2, 'OP09-062': 1 };
const ROBIN = 'TEST-ROBIN-V';
const SANJI = 'TEST-ROBIN-V-SANJI';
const KAIDO = 'TEST-ROBIN-V-KAIDO';
DECKS[ROBIN] = { id: ROBIN, name: 'Essai', series: 'TEST', leader: 'OP09-062', cards };
DECKS[SANJI] = { id: SANJI, name: 'Essai', series: 'TEST', leader: 'OP12-041', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const toMain = (s: GameState) => {
  for (let i = 0; i < 30 && s.decision && s.decision.kind !== 'main'; i++) {
    const d = s.decision;
    s = choose(s, d.kind === 'blocker' ? 'noblock' : d.kind === 'counter' ? 'pass' : d.options.some((o) => o.id === 'no') ? 'no' : d.options[0].id);
  }
  return s;
};

test('Sanji (OP09-065) : renvoyer 1 DON!! ou plus (au choix) : [Initiative], puis épuiser de coût 6 ou moins', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['OP09-065']); setDon(g, 0, 9); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(play(s, 'OP09-065'), 'yes');
  expectTag(s, 'donCount');
  assert.equal(s.decision!.options.length, 9);
  aiAnswers(s);
  s = choose(s, 'n:2');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(donOnField(s, 0), 7);
  assert.ok(attackAbility(s, 0, mine(s, 'OP09-065')).can);
  assert.ok(theirs(s, O_LUFFY).rested);
  coherent(s);
});

test('8 DON!! ou plus sur le terrain : O-Robi (KO de coût 3 ou moins) ; Jinbe (OP05-066) avec 10 DON!! pendant le tour adverse', () => {
  for (const don of [8, 7]) {
    let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['OP05-063']); setDon(g, 0, don); setChars(g, 1, [{ num: O_STUSSY }]); });
    s = play(s, 'OP05-063');
    if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
    assert.equal(s.players[1].chars.length, don >= 8 ? 0 : 1);
  }
  for (const don of [10, 9]) {
    const s = scenario([ROBIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP05-066' }]); setDon(g, 0, don); }, 1);
    assert.equal(power(s, mine(s, 'OP05-066').uid), don === 10 ? 7000 : 6000);
  }
});

test('Monkey D. Luffy (EB02-061) : [Initiative] (Leader multicolore, 5 DON!! adverses) ; [En attaquant] renvoyer 2 DON!! redressées : se redresser, Vie en main', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['EB02-061']); setDon(g, 0, 9); setDon(g, 1, 5); });
  s = play(s, 'EB02-061');
  assert.ok(attackAbility(s, 0, mine(s, 'EB02-061')).can);
  const life = s.players[0].life.length;
  s = choose(attack(s, mine(s, 'EB02-061').uid, s.players[1].leader.uid), 'yes');
  assert.equal(mine(s, 'EB02-061').rested, false);
  assert.equal(s.players[0].life.length, life - 1);
  assert.equal(s.players[0].donActive, 1);
  s = toMain(noCounter(s));
  s = attack(s, mine(s, 'EB02-061').uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'may', 'une fois par tour');
  const k = play(scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['EB02-061']); setDon(g, 0, 9); setDon(g, 1, 5); }), 'EB02-061');
  assert.equal(attackAbility(k, 0, k.players[0].chars[0]).can, false, 'Leader Kaido');
});

test('Thousand Sunny (OP09-080) : pendant le tour adverse, un Personnage {Équipage de Chapeau de paille} sorti par un effet adverse : s’épuiser, 1 DON!! épuisée', () => {
  let s = scenario([ROBIN, ROBIN], (g) => {
    const c = take(g, 0, 'OP09-080');
    g.players[0].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setChars(g, 0, [{ num: 'OP05-063' }]);
    setDon(g, 0, 3);
    setHand(g, 1, ['EB01-039']);
    setDon(g, 1, 6);
  }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP05-063').uid}`);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(s.players[0].stage!.rested);
  assert.equal(donOnField(s, 0), 4);
  coherent(s);
});

test('Sanji (OP12-070) : +1000 par 5 Événements ; renvoyer 1 DON!! au lieu de sortir ; O-Soba Mask (ST26-001) : −5 en main, renvoie les [Sanji]', () => {
  let s = scenario([ROBIN, ROBIN], (g) => {
    setChars(g, 0, [{ num: 'OP12-070' }]);
    g.players[0].trash = [take(g, 0, 'OP11-080'), take(g, 0, 'OP11-080'), take(g, 0, 'OP12-078'), take(g, 0, 'OP12-078'), take(g, 0, 'OP12-079')];
    setDon(g, 0, 2);
    setHand(g, 1, ['EB01-039']);
    setDon(g, 1, 6);
  }, 1);
  assert.equal(power(s, mine(s, 'OP12-070').uid), 6000);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP12-070').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP12-070'));
  assert.equal(donOnField(s, 0), 1);
  coherent(s);
  s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['ST26-001']); setChars(g, 0, [{ num: 'OP09-065' }, { num: 'ST18-003' }]); setDon(g, 0, 2); });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 2, 'Sanji de 7000');
  s = play(s, 'ST26-001');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['ST26-001']);
  assert.equal(s.players[0].hand.length, 2);
  coherent(s);
});

test('Tony-Tony Chopper (OP09-068) : [Fin de votre tour] renvoyer 1 DON!! ou plus : se redresser et [Bloqueur] ; Monkey D. Luffy (ST26-005) : Leader à 7000', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP09-068', extra: { rested: true } }]); setDon(g, 0, 3); });
  s = act(s, 'end');
  s = choose(s, 'yes');
  s = choose(s, 'n:1');
  assert.equal(mine(s, 'OP09-068').rested, false);
  s = toMain(s);
  assert.ok(hasKeyword(s, 0, mine(s, 'OP09-068'), 'Blocker'), 'pendant le tour adverse');
  s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['ST26-005']); setDon(g, 0, 8); setDon(g, 1, 5); });
  s = choose(play(s, 'ST26-005'), 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  coherent(s);
});

test('Vogue Merry : avec autant de DON!! ou moins, +2 de coût ; Stealth Black : Leader [Sanji], jouer un [Sanji] de la Défausse ; Luffytaro', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => {
    const c = take(g, 0, 'EB02-041');
    g.players[0].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setChars(g, 0, [{ num: 'OP12-070' }]);
    setDon(g, 0, 3);
    setDon(g, 1, 3);
  });
  s = act(s, `act:${s.players[0].stage!.uid}`);
  if (s.decision?.kind === 'effect') s = choose(s, `card:${mine(s, 'OP12-070').uid}`);
  assert.ok(logHas(s, 'coût'));
  coherent(s);
  for (const deck of [SANJI, ROBIN]) {
    let t = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['EB04-041']); g.players[0].trash = [take(g, 0, 'OP12-070')]; setDon(g, 0, 4); });
    t = play(t, 'EB04-041');
    if (deck === SANJI) t = choose(t, (o) => o.id.startsWith('trash:'));
    assert.equal(t.players[0].chars.length, deck === SANJI ? 1 : 0);
  }
  s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['ST18-005', 'OP05-063', 'OP09-065']); setDon(g, 0, 8); });
  s = choose(play(s, 'ST18-005'), 'yes');
  assert.equal(s.decision!.options.some((o) => o.num === 'OP09-065'), false, 'coût 7');
  s = choose(s, (o) => o.num === 'OP05-063');
  assert.ok(mine(s, 'OP05-063'));
});
