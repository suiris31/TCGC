// Famille du Leader Luffy et Ace (phase 4E) : cartes rouges et vertes {Impel Down} et « Équipage de Barbe Blanche »,
// autour des Personnages de 8000 et du Leader [Edward.Newgate]. Decks d'essai aux Leaders Luffy et Ace (multicolore),
// Edward.Newgate (OP17-001, monocolore) et Kaido pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_LUFFY_ACE } from '../engine/cards/fam-luffy-ace.ts';
import { DECKS } from '../engine/decks.ts';
import { basePower, counterValue, def, handCost, hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { aiAnswers, attack, choose, coherent, expectTag, play, scenario, setChars, setDon, setHand, take } from './helpers.ts';

const FAMILY = Object.keys(FAM_LUFFY_ACE);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'EB01-039': 2, 'OP05-051': 2, 'OP09-080': 1 };
const LA = 'TEST-LA';
const NEWGATE = 'TEST-LA-NEWGATE';
const KAIDO = 'TEST-LA-KAIDO';
DECKS[LA] = { id: LA, name: 'Essai', series: 'TEST', leader: 'ST30-001', cards };
DECKS[NEWGATE] = { id: NEWGATE, name: 'Essai', series: 'TEST', leader: 'OP17-001', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);

test('Namur (OP16-010) : révéler un Personnage de 8000 de sa main : KO de 2000 de base ou moins ; sans Personnage de 8000, rien', () => {
  let s = scenario([LA, 'ST-21'], (g) => { setHand(g, 0, ['OP16-010', 'OP16-014']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_STUSSY }]); });
  s = choose(play(s, 'OP16-010'), 'yes');
  s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
  s = play(scenario([LA, 'ST-21'], (g) => { setHand(g, 0, ['OP16-010', 'OP16-118']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_SENTOMARU }]); }), 'OP16-010');
  assert.equal(s.decision?.kind, 'main', 'Ace : 6000, pas 8000');
});

test('Edward Newgate (OP16-003) : pendant son tour, son Leader gagne [Double attaque] et +2000 ; Thatch (OP16-005) : −3 en main', () => {
  // le Leader Luffy et Ace prend −2000 avec un Personnage de 7000 de base ou plus (Newgate) : on compare les deux tours
  const s = scenario([LA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP16-003' }]); setHand(g, 0, ['OP16-005']); });
  const o = scenario([LA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP16-003' }]); }, 1);
  assert.equal(power(s, s.players[0].leader.uid), power(o, o.players[0].leader.uid) + 2000);
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'));
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 5, 'Newgate 10000 « Équipage de Barbe Blanche »');
  assert.equal(hasKeyword(o, 0, o.players[0].leader, 'Double Attack'), false, 'tour adverse');
});

test('Marco (OP16-014) : se mettre KO à la place d’un Personnage retiré par un effet adverse, puis défausser un Personnage de 8000 pour se rejouer', () => {
  let s = scenario([LA, LA], (g) => {
    setChars(g, 0, [{ num: 'OP16-014' }, { num: 'OP16-010' }]);
    setHand(g, 0, ['OP16-005']);
    setHand(g, 1, ['OP05-051']);
    setDon(g, 1, 7);
  }, 1);
  s = play(s, 'OP05-051', 1);
  s = choose(s, `card:${mine(s, 'OP16-010').uid}`);
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP16-010', 'OP16-014']);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP16-005'));
  coherent(s);
});

test('Portgas D. Ace (OP16-118) : le Contre des Personnages de 8000 en main devient +2000 ; Atmos (ST15-001) : plus de Vie en main par ses effets', () => {
  const s = scenario([LA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP16-118' }]); });
  assert.equal(counterValue(s, 0, 'OP16-005'), 2000, '8000, Contre +1000');
  assert.equal(counterValue(s, 0, 'OP16-014'), 2000, '8000, sans Contre');
  assert.equal(counterValue(s, 0, 'OP16-010'), 2000, '2000 de puissance : son propre Contre');
  let t = scenario([NEWGATE, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'ST15-001' }]); setHand(g, 0, ['ST15-004']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_CHOPPER }]); });
  t = noCounter(attack(t, mine(t, 'ST15-001').uid, t.players[1].leader.uid));
  const life = t.players[0].life.length;
  t = play(t, 'ST15-004');
  if (t.decision?.kind === 'effect') t = choose(t, `card:${theirs(t, O_CHOPPER).uid}`);
  assert.equal(t.players[0].life.length, life, 'pas de Vie en main ce tour-ci');
  assert.equal(power(t, theirs(t, O_CHOPPER).uid), 4000);
  coherent(t);
});

test('Edward Newgate (OP17-005) : −4 en main face à un Personnage de 10000 ; Leader monocolore à 8000 de base ; Joz (OP17-008)', () => {
  let s = scenario([NEWGATE, LA], (g) => { setHand(g, 0, ['OP17-005']); setDon(g, 0, 6); setChars(g, 1, [{ num: 'OP16-003' }]); });
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 6);
  s = play(s, 'OP17-005');
  assert.equal(power(s, s.players[0].leader.uid), 8000);
  coherent(s);
  const multi = play(scenario([LA, 'ST-21'], (g) => { setHand(g, 0, ['OP17-005']); setDon(g, 0, 10); }), 'OP17-005');
  assert.equal(basePower(multi, multi.players[0].leader.uid), def('ST30-001').power, 'Leader Luffy et Ace multicolore');
  for (const deck of [NEWGATE, LA]) {
    const t = play(scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['OP17-008']); setDon(g, 0, 6); }), 'OP17-008');
    assert.equal(basePower(t, t.players[0].leader.uid), deck === NEWGATE ? 8000 : def('ST30-001').power);
  }
});

test('Portgas D. Ace (ST15-005) : [Initiative] avec un Leader « Barbe Blanche » ; −2000 au lieu de sortir (une fois par tour) ; Inazuma (OP16-024)', () => {
  let s = scenario([LA, LA], (g) => { setChars(g, 0, [{ num: 'ST15-005' }]); setHand(g, 1, ['EB01-039', 'EB01-039']); setDon(g, 1, 10); }, 1);
  const before = power(s, s.players[0].chars[0].uid);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'ST15-005').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'ST15-005'));
  assert.equal(power(s, mine(s, 'ST15-005').uid), before - 2000);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'ST15-005').uid}`);
  assert.equal(s.players[0].chars.length, 0, 'une fois par tour');
  coherent(s);
  const k = play(scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['ST15-005']); setDon(g, 0, 5); }), 'ST15-005');
  assert.equal(k.players[0].chars[0].playedTurn, k.turn);
  s = scenario([LA, LA], (g) => { setChars(g, 0, [{ num: 'OP16-024' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); setChars(g, 1, [{ num: 'OP16-118' }]); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP16-024').uid}`);
  if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, 'OP16-118').uid}`);
  assert.ok(theirs(s, 'OP16-118').rested);
  coherent(s);
});

test('Le pouvoir de détruire le monde : épuiser 2 DON!! : KO d’un Lieu adverse ; [Contre] +4000 avec 2 Personnages de 8000 de base', () => {
  let s = scenario([LA, LA], (g) => {
    setHand(g, 0, ['OP17-018']);
    setDon(g, 0, 3);
    const c = take(g, 1, 'OP09-080');
    g.players[1].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
  });
  s = choose(play(s, 'OP17-018'), 'yes');
  if (s.decision?.kind === 'effect') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].stage, null);
  coherent(s);
  for (const n of [2, 1]) {
    let t = scenario([LA, 'ST-21'], (g) => { setHand(g, 0, ['OP17-018']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP16-014' }, { num: 'OP16-003' }].slice(0, n)); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
    const life = t.players[0].life.length;
    t = attack(t, theirs(t, O_CHOPPER).uid, t.players[0].leader.uid);
    while (t.decision?.kind !== 'counter') t = choose(t, t.decision!.kind === 'blocker' ? 'noblock' : 'no');
    t = choose(t, (o) => o.id.startsWith('cevent:'));
    t = noCounter(t);
    assert.equal(t.players[0].life.length, n === 2 ? life : life - 1, n === 2 ? '+4000 : repoussée' : 'sans effet');
  }
});
