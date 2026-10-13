// Famille du Leader Zoro, {Supernovae} verts (phase 4E) : cartes qui épuisent, empêchent les cartes adverses d'être
// redressées et redressent leurs DON!!. Deck d'essai au Leader Zoro ({Supernovae}), un au Leader Kaido pour les
// conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_SN_GREEN } from '../engine/cards/fam-sn-green.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { aiAnswers, attack, choose, coherent, logHas, play, scenario, setChars, setDon, setHand } from './helpers.ts';

const FAMILY = Object.keys(FAM_SN_GREEN);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP13-030': 2, 'EB03-022': 2, 'OP15-099': 2, 'ST21-005': 2, 'EB01-039': 2 };
const ZORO = 'TEST-SNGREEN';
const KAIDO = 'TEST-SNGREEN-KAIDO';
DECKS[ZORO] = { id: ZORO, name: 'Essai', series: 'TEST', leader: 'OP12-020', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const toMain = (s: GameState) => {
  for (let i = 0; i < 30 && s.decision && s.decision.kind !== 'main'; i++) {
    const d = s.decision;
    s = choose(s, d.kind === 'blocker' ? 'noblock' : d.kind === 'counter' ? 'pass' : d.options.some((o) => o.id === 'no') ? 'no' : d.options[0].id);
  }
  return s;
};

test('Cavendish (EB01-012) : avec un Leader {Supernovae} et sans autre [Cavendish], redresser 2 DON!!', () => {
  for (const [deck, other, ready] of [[ZORO, false, 2], [ZORO, true, 0], [KAIDO, false, 0]] as const) {
    const s = play(scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['EB01-012']); setDon(g, 0, 5, 2); setChars(g, 0, other ? [{ num: 'EB01-012' }] : []); }), 'EB01-012');
    assert.equal(s.players[0].donActive, ready, `${deck} ${other}`);
  }
});

test('Chambres : renvoyer un Personnage, puis jouer un Personnage de coût 2 ou moins d’une autre couleur', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['EB01-020', 'ST21-005', 'EB01-015']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP13-030' }]); });
  s = play(s, 'EB01-020');  // un seul Personnage : renvoyé d'office
  assert.equal(s.decision!.options.some((o) => o.num === 'EB01-015'), false, 'vert comme Chopper');
  s = choose(s, (o) => o.num === 'ST21-005');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['ST21-005']);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP13-030'));
  coherent(s);
});

test('Jewelry Bonney (OP07-026) : une DON!! ou un Personnage adverse épuisé ne sera pas redressé ; Trafalgar Law (OP16-030)', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP07-026']); setDon(g, 0, 5); setDon(g, 1, 2, 3); setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]); });
  s = play(s, 'OP07-026');
  aiAnswers(s);
  s = choose(s, 'don');
  s = toMain(act(s, 'end'));
  assert.equal(s.active, 1);
  assert.equal(s.players[1].donRested, 1);
  assert.equal(theirs(s, O_CHOPPER).rested, false);
  coherent(s);
  s = scenario([ZORO, 'ST-21'], (g) => {
    setHand(g, 0, ['OP16-030']);
    setDon(g, 0, 8);
    setChars(g, 0, [{ num: 'OP13-030', extra: { rested: true } }, { num: 'EB03-022', extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
  });
  s = choose(play(s, 'OP16-030'), `card:${theirs(s, O_CHOPPER).uid}`);
  s = act(s, 'end');
  assert.equal(mine(s, 'OP13-030').rested, false, 'vert, coût 5');
  assert.equal(mine(s, 'EB03-022').rested, true, 'bleu');
  s = toMain(s);
  assert.ok(theirs(s, O_CHOPPER).rested, 'pas redressé');
});

test('Basil Hawkins (OP07-029) : [Bloqueur] avec un Leader {Supernovae} ; retiré par un effet adverse, épuiser un Personnage adverse à la place', () => {
  const k = scenario([KAIDO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP07-029' }]); });
  assert.equal(hasKeyword(k, 0, mine(k, 'OP07-029'), 'Blocker'), false);
  let s = scenario([ZORO, ZORO], (g) => { setChars(g, 0, [{ num: 'OP07-029' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); setChars(g, 1, [{ num: 'OP13-030' }]); }, 1);
  assert.ok(hasKeyword(s, 0, mine(s, 'OP07-029'), 'Blocker'));
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP07-029').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP07-029'));
  assert.ok(s.players[1].chars.find((c) => c.num === 'OP13-030')!.rested);
  coherent(s);
});

test('Bartolomeo (OP07-031) : quand son effet épuise un Personnage, piocher 1 et défausser 1 (une fois par tour) ; Scratchmen Apoo', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['EB01-015', 'EB01-015', 'OP13-030']); setDon(g, 0, 2); setChars(g, 0, [{ num: 'OP07-031' }]); setChars(g, 1, [{ num: O_SENTOMARU }, { num: 'ST21-005' }]); });
  s = choose(play(s, 'EB01-015'), `card:${theirs(s, O_SENTOMARU).uid}`);
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.num === 'OP13-030' || (o.id.startsWith('card:') && !s.players[0].hand.some((c) => c.uid === o.uid && c.num === 'EB01-015')));
  assert.ok(logHas(s, 'pioche'));
  assert.equal(s.players[0].trash.length, 1);
  s = choose(play(s, 'EB01-015'), `card:${theirs(s, 'ST21-005').uid}`);
  assert.equal(s.players[0].trash.length, 1, 'une fois par tour');
  coherent(s);
});

test('Karmic Punishment : [Contre] +2000, +1000 de plus avec 3 Personnages ; Jewelry Bonney (PRB02-004) : [Attaque adverse] redresser 1 DON!!', () => {
  for (const n of [3, 2]) {
    let s = scenario([ZORO, 'ST-21'], (g) => {
      setHand(g, 0, ['OP07-035']);
      setDon(g, 0, 1);
      setChars(g, 0, [{ num: 'OP13-030' }, { num: 'EB03-022' }, { num: 'OP15-099' }].slice(0, n));
      setChars(g, 1, [{ num: O_LUFFY }]);
    }, 1);
    s = attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid);
    while (s.decision?.kind !== 'counter') s = choose(s, s.decision!.kind === 'blocker' ? 'noblock' : 'no');
    s = choose(s, (o) => o.id.startsWith('cevent:'));
    assert.ok(logHas(s, `repoussée (6000 contre ${5000 + (n >= 3 ? 3000 : 2000)})`));
  }
  let s = scenario([ZORO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'PRB02-004' }]); setDon(g, 0, 0, 2); setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid);
  assert.equal(s.players[0].donActive, 1);
  s = toMain(s);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  assert.equal(s.players[0].donActive, 1, 'une fois par tour');
});

test('Jewelry Bonney (OP12-118) : avec 8 cartes épuisées, piocher 2 et défausser 1, puis 1 DON!! ; Law et Bepo', () => {
  for (const rested of [3, 1]) {
    // le coût (5) épuise 5 DON!! : 8 ou 6 cartes épuisées quand l'effet se résout
    let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP12-118']); setDon(g, 0, 5, rested); });
    s = play(s, 'OP12-118');
    if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(s.players[0].hand.length, rested === 3 ? 1 : 0);
    assert.equal(s.players[0].donActive, 1);
  }
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['ST24-004']); setDon(g, 0, 10); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_STUSSY, extra: { rested: true } }]); });
  s = choose(play(s, 'ST24-004'), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(theirs(s, O_CHOPPER).rested);
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  s = toMain(act(s, 'end'));
  assert.ok(theirs(s, O_CHOPPER).rested, 'pas redressé');
  assert.equal(power(s, s.players[0].leader.uid), 7000, 'jusqu’à la fin du prochain tour adverse');
});
