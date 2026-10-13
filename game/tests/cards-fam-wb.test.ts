// Famille du Leader Ace et Newgate (phase 4E) : cartes bleues « Équipage de Barbe Blanche », qui jouent avec le dessus
// du deck, renvoient des Personnages en main et se protègent. Deux decks d'essai au Leader Ace et Newgate (pour les
// effets adverses), un au Leader Luffy pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_WB } from '../engine/cards/fam-wb.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, def, hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_WB);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'EB01-039': 2, 'OP05-051': 2, 'ST22-004': 2, 'OP01-121': 1 };
const WBD = 'TEST-WB';
const PLAIN = 'TEST-WB-LUFFY';
DECKS[WBD] = { id: WBD, name: 'Essai', series: 'TEST', leader: 'ST22-001', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000
const NOT_WB = 'EB01-039';       // Événement sans type « Équipage de Barbe Blanche »

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const anyCard = (s: GameState) => choose(s, (o) => o.id.startsWith('card:'));

test('Namule : piocher 2, puis 2 cartes de la main au-dessus ou au-dessous du deck', () => {
  let s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-050', 'OP13-041', 'OP13-045']); setDon(g, 0, 3); });
  s = play(s, 'OP08-050');
  aiAnswers(s);
  s = choose(s, (o) => o.label === def('OP13-041').name);
  expectTag(s, 'scry');
  aiAnswers(s);
  s = choose(s, 'top');
  s = choose(s, (o) => o.label === def('OP13-045').name);
  s = choose(s, 'bottom');
  assert.equal(s.players[0].deck[0].num, 'OP13-041');
  assert.equal(s.players[0].deck.at(-1)!.num, 'OP13-045');
  assert.equal(s.players[0].hand.length, 2);
  coherent(s);
});

test('Portgas.D.Ace (OP08-052) : révéler le dessus, jouer un « Équipage de Barbe Blanche » de coût 4 ou moins, sinon dessus ou dessous ; « Je ferai de Barbe Blanche... » : avec [Initiative]', () => {
  let s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-052']); setDon(g, 0, 5); setDeckTop(g, 0, ['OP13-045']); });
  s = choose(play(s, 'OP08-052'), (o) => o.id.startsWith('card:'));
  assert.ok(mine(s, 'OP13-045'));
  coherent(s);
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-052']); setDon(g, 0, 5); setDeckTop(g, 0, ['OP13-042']); });
  s = choose(play(s, 'OP08-052'), 'bottom');
  assert.equal(s.players[0].deck.at(-1)!.num, 'OP13-042', 'coût 10');
  coherent(s);
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP12-058']); setDon(g, 0, 9); setDeckTop(g, 0, ['OP13-046']); });
  s = choose(play(s, 'OP12-058'), (o) => o.id.startsWith('card:'));
  assert.ok(attackAbility(s, 0, mine(s, 'OP13-046')).can, '[Initiative]');
  coherent(s);
});

test('Speed Jil : [Initiative] si la carte révélée est « Équipage de Barbe Blanche » ; Thank You...for Loving Me!! : 3 cartes, une en main, le reste au-dessus ou au-dessous', () => {
  for (const top of ['OP13-045', NOT_WB]) {
    let s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-049']); setDon(g, 0, 4); setDeckTop(g, 0, [top]); });
    s = choose(play(s, 'OP08-049'), 'top');
    assert.equal(attackAbility(s, 0, mine(s, 'OP08-049')).can, top !== NOT_WB);
    assert.equal(s.players[0].deck[0].num, top);
  }
  let s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-053']); setDon(g, 0, 1); setDeckTop(g, 0, [NOT_WB, 'OP13-041', 'OP05-051']); });
  s = play(s, 'OP08-053');
  assert.equal(s.decision!.options.filter((o) => o.id.startsWith('card:')).length, 1);
  s = choose(s, (o) => o.label === def('OP13-041').name);
  while (s.decision?.tag === 'scry') s = choose(s, (o) => o.id === 'bottom' || o.id.startsWith('card:'));
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP13-041'));
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP08-053']); setDon(g, 0, 1); });
  s = play(s, 'OP08-053');
  assert.equal(s.players[0].hand.length, 0, 'Leader Luffy : rien');
});

test('Edward.Newgate (OP08-043) : avec 2 Vies ou moins, les Personnages adverses n’attaquent qu’en défaussant 2 cartes jusqu’à la fin du prochain tour adverse', () => {
  let s = scenario([WBD, 'ST-21'], (g) => {
    setHand(g, 0, ['OP08-043']);
    setDon(g, 0, 10);
    setLife(g, 0, ['OP13-045', 'OP13-041']);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]);
    setHand(g, 1, [O_BONNEY, O_JINBE, O_STUSSY]);
  });
  s = play(s, 'OP08-043');
  s = act(s, 'end');
  while (s.active === 1 && s.decision?.kind !== 'main') s = choose(s, (o) => o.id !== 'none');
  const atk = theirs(s, O_CHOPPER);
  assert.ok(s.decision!.options.some((o) => o.id.startsWith(`attack:${atk.uid}:`) && o.label.includes('défausser 2 cartes')));
  const hand = s.players[1].hand.length;
  s = attack(s, atk.uid, s.players[0].leader.uid);
  expectTag(s, 'discard');
  aiAnswers(s);
  s = anyCard(anyCard(s));
  assert.equal(s.players[1].hand.length, hand - 2);
  assert.ok(logHas(s, `${def(O_CHOPPER).name} (6000) attaque`));
  s.players[1].hand = s.players[1].hand.slice(0, 1);
  assert.equal(attackAbility(s, 1, theirs(s, O_LUFFY)).can, false, '1 seule carte en main');
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-043']); setDon(g, 0, 10); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = play(s, 'OP08-043');
  assert.equal(s.mods.some((m) => m.stat === 'attackTax'), false, '5 Vies');
});

test('Thatch : mis KO (effet ou combat) ou retiré par un effet adverse : dans la Défausse et piocher 1 à la place', () => {
  // KO par un effet adverse (Ragnaraku)
  let s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'OP08-045' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  const hand = s.players[0].hand.length;
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP08-045').uid}`);
  aiAnswers(s);
  s = choose(s, 'yes');
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP08-045'));
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.equal(logHas(s, 'Thatch est mis KO'), false);
  coherent(s);
  // sous le deck par un effet adverse (Borsalino)
  s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'OP08-045' }]); setHand(g, 1, ['OP05-051']); setDon(g, 1, 7); }, 1);
  s = play(s, 'OP05-051', 1);
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP08-045').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP08-045'));
  coherent(s);
});

test('Vista (OP13-046) : [Une fois par tour] défausser une carte « Équipage de Barbe Blanche » au lieu d’être mis KO ; Fossa : se défausser à la place d’un autre', () => {
  let s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'OP13-046' }]); setHand(g, 0, ['OP13-045', NOT_WB]); setHand(g, 1, ['EB01-039', 'EB01-039']); setDon(g, 1, 10); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP13-046').uid}`);
  s = choose(s, 'yes');
  assert.ok(mine(s, 'OP13-046'));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [NOT_WB]);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP13-046').uid}`);
  assert.equal(s.players[0].chars.length, 0, 'une fois par tour');
  coherent(s);

  s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'OP13-047' }, { num: 'OP13-041' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  s = choose(s, `card:${mine(s, 'OP13-041').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP13-041']);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP13-047'));
  coherent(s);
});

test('Marco (OP09-052) : mis KO par un effet adverse pendant le tour adverse : défausser 1 carte pour se rejouer épuisé ; Marco (P-071) : reprendre en main', () => {
  let s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'OP09-052' }]); setHand(g, 0, [NOT_WB]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP09-052').uid}`);
  s = choose(s, 'yes');
  assert.ok(mine(s, 'OP09-052').rested);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
  const koCondition = FAM_WB['OP09-052'].onKOCondition!;
  const f = mine(s, 'OP09-052');
  assert.equal(koCondition(s, 0, f, 'battle', 1), false, 'en combat');
  assert.equal(koCondition({ ...s, active: 0 }, 0, f, 'effect', 1), false, 'pendant son tour');

  s = scenario([WBD, WBD], (g) => { setChars(g, 0, [{ num: 'P-071' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'P-071').uid}`);
  s = choose(s, 'yes');
  assert.ok(s.players[0].hand.some((c) => c.num === 'P-071'));
  coherent(s);
});

test('Moby Dick : pendant son tour, un Personnage « Équipage de Barbe Blanche » sort du terrain par un effet : piocher 1, puis 1 carte sur le deck ; Joz', () => {
  let s = scenario([WBD, 'ST-21'], (g) => {
    const c = take(g, 0, 'OP08-056');
    g.players[0].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setChars(g, 0, [{ num: 'OP13-041' }]);
    setHand(g, 0, ['OP08-047']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: O_LUFFY }]);
  });
  s = choose(play(s, 'OP08-047'), 'yes');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  while (s.decision?.kind === 'effect') s = choose(s, (o) => o.id.startsWith('card:') || o.id === 'bottom');
  assert.ok(logHas(s, 'Moby Dick'));
  assert.equal(s.players[0].hand.length, 1, 'Izo revenu en main, +1 pioché, 1 placé sur le deck');
  coherent(s);
});

test('Marshall D. Teach : défausser un autre « Équipage de Barbe Blanche » du terrain : piocher 1 et [Exil] ; Rakuyo, Haruta, Curiel', () => {
  let s = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP13-053' }, { num: 'OP13-045' }]); setHand(g, 0, []); });
  s = choose(attack(s, mine(s, 'OP13-053').uid, s.players[1].leader.uid), 'yes');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP13-053']);
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(hasKeyword(s, 0, mine(s, 'OP13-053'), 'Banish'));
  coherent(noCounter(s));
  s = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP13-055' }, { num: 'OP13-045' }]); setHand(g, 0, []); });
  s = attack(s, mine(s, 'OP13-055').uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, 'OP13-045').uid), 3000);
  coherent(noCounter(s));
  s = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP13-045' }]); setHand(g, 0, ['OP13-041', 'OP13-041', 'OP13-055', 'OP13-053', 'OP08-044']); });
  s = attack(s, mine(s, 'OP13-045').uid, s.players[1].leader.uid);
  assert.equal(s.players[0].hand.length, 5, 'Haruta : 5 cartes en main, rien');
  coherent(noCounter(s));
});

test('Portgas D. Ace (OP13-119) : [Initiative] avec 3 Vies ou moins ; renvoyer un Personnage adverse de coût 5 ou moins, l’adversaire joue un Personnage de coût 4 ou moins', () => {
  let s = scenario([WBD, 'ST-21'], (g) => {
    setHand(g, 0, ['OP13-119']);
    setDon(g, 0, 6, 1);
    setLife(g, 0, ['OP13-045', 'OP13-041', 'OP13-055']);
    setChars(g, 1, [{ num: O_LUFFY }]);
    setHand(g, 1, [O_CHOPPER, O_BONNEY]);
  });
  s = play(s, 'OP13-119');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.decision!.player, 1);
  aiAnswers(s);
  s = choose(s, (o) => o.label.startsWith(def(O_CHOPPER).name));
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  assert.equal(s.players[0].leader.don, 1);
  assert.ok(attackAbility(s, 0, mine(s, 'OP13-119')).can);
  coherent(s);
});

test('Vista (OP14-053) : pendant le tour adverse, puissance de base celle du Leader ; Kingdew : révéler 2 cartes : +2000 ; Atmos', () => {
  const s0 = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP14-053' }]); }, 1);
  assert.equal(power(s0, mine(s0, 'OP14-053').uid), def('ST22-001').power);
  const s1 = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP14-053' }]); });
  assert.equal(power(s1, mine(s1, 'OP14-053').uid), 4000);
  let s = scenario([WBD, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP08-044' }]); setHand(g, 0, ['OP13-045', 'OP13-041']); });
  s = act(s, `act:${mine(s, 'OP08-044').uid}`);
  while (s.decision?.tag === 'revealCost') s = anyCard(s);
  assert.equal(power(s, mine(s, 'OP08-044').uid), 6000);
  coherent(s);
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP08-040', 'OP13-045', 'OP13-041']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(play(s, 'OP08-040'), 'yes');
  while (s.decision?.tag === 'revealCost') s = anyCard(s);
  if (s.decision) s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
});

test('« Je ne suis pas né homme... » : avec 1 Vie ou moins, pas de [Bloqueur] contre son Leader ; Don du phénix, Phoenix Brand, Portgas D. Ace (EB02-028)', () => {
  let s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP13-057']); setDon(g, 0, 2); setLife(g, 0, ['OP13-045']); });
  s = choose(play(s, 'OP13-057'), 'yes');
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Unblockable'));
  coherent(s);
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['OP13-058']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_BONNEY }, { num: O_JINBE }]); });
  s = choose(play(s, 'OP13-058'), 'yes');
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_JINBE]);
  coherent(s);
  s = scenario([WBD, 'ST-21'], (g) => { setHand(g, 0, ['EB02-028']); setDon(g, 0, 5); setDeckTop(g, 0, ['OP13-045', 'OP13-047']); });
  s = play(s, 'EB02-028');
  assert.equal(s.decision!.options.filter((o) => o.id.startsWith('card:')).length, 1, 'Haruta : coût 1');
  s = choose(s, (o) => o.id.startsWith('card:'));
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  if (s.decision?.tag === 'playFree') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP13-047' && c.rested));
  coherent(s);
});
