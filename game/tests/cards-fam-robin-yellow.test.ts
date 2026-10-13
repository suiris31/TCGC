// Famille du Leader Robin, cartes jaunes (phase 4E) : {Équipage de Chapeau de paille} jaunes, qui jouent avec la Vie et
// les [Déclenchement]. Decks d'essai aux Leaders Robin, Luffy {Egghead} (ST29-001) et Kaido pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_ROBIN_YELLOW } from '../engine/cards/fam-robin-yellow.ts';
import { DECKS } from '../engine/decks.ts';
import { handCost, hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { aiAnswers, attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

const FAMILY = Object.keys(FAM_ROBIN_YELLOW);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'EB01-039': 2 };
const ROBIN = 'TEST-ROBIN-J';
const LUFFY = 'TEST-ROBIN-J-LUFFY';
const KAIDO = 'TEST-ROBIN-J-KAIDO';
DECKS[ROBIN] = { id: ROBIN, name: 'Essai', series: 'TEST', leader: 'OP09-062', cards };
DECKS[LUFFY] = { id: LUFFY, name: 'Essai', series: 'TEST', leader: 'ST29-001', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const toTrigger = (s: GameState) => {
  for (let i = 0; i < 10 && s.decision && s.decision.tag !== 'trigger'; i++) s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : s.decision.kind === 'counter' ? 'pass' : 'no');
  return s;
};

test('Jinbe (OP07-102) : [Déclenchement] renvoyer un Personnage adverse de coût 4 ou moins, et la carte va en main', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setLife(g, 0, ['OP07-102', 'OP15-108']); setHand(g, 0, []); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = toTrigger(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  if (s.decision?.tag === 'bounce') s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP07-102'));
  assert.equal(s.players[0].trash.length, 0);
  coherent(s);
});

test('Nico Robin (EB03-055) : défausser la Vie du dessus : 2 cartes du deck dans la Vie ; mis KO pendant le tour adverse : 1 dégât à l’adversaire', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['EB03-055']); setDon(g, 0, 7); });
  const life = s.players[0].life.length;
  s = choose(play(s, 'EB03-055'), 'yes');
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[0].trash.length, 1);
  coherent(s);
  const k0 = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, ['EB03-055']); setDon(g, 0, 7); });
  const k = choose(play(k0, 'EB03-055'), 'yes');
  assert.equal(k.players[0].life.length, k0.players[0].life.length - 1, 'Leader Kaido : la Vie est défaussée, rien n’est ajouté');
  s = scenario([ROBIN, ROBIN], (g) => { setChars(g, 0, [{ num: 'EB03-055' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  const oppLife = s.players[1].life.length;
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1 && s.decision.tag !== 'trigger') s = choose(s, `card:${mine(s, 'EB03-055').uid}`);
  s = choose(s, 'yes');
  while (s.decision?.tag === 'trigger') s = choose(s, 'hand');
  assert.equal(s.players[1].life.length, oppLife - 1);
  coherent(s);
});

test('Monkey D. Luffy (OP15-119) : quand l’adversaire active [Bloqueur], révéler la Vie du dessus : +1000 par point de coût', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-119' }]); setLife(g, 0, ['EB03-055', 'OP15-108']); setChars(g, 1, [{ num: O_SENTOMARU }]); });
  s = attack(s, mine(s, 'OP15-119').uid, s.players[1].leader.uid);
  s = choose(s, (o) => o.id.startsWith('block:'));
  assert.equal(power(s, mine(s, 'OP15-119').uid), 7000 + 7000);
  assert.ok(logHas(s, 'révèle la carte du dessus de sa Vie'));
  coherent(noCounter(s));
});

test('Nami (ST29-008) : un Personnage {Egghead} mis KO par un effet adverse : retourner la Vie du dessus à la place ; Nico Robin (OP09-107)', () => {
  let s = scenario([LUFFY, LUFFY], (g) => { setChars(g, 0, [{ num: 'ST29-008' }, { num: 'EB04-052' }]); setHand(g, 1, ['EB01-039']); setDon(g, 1, 6); }, 1);
  s = choose(play(s, 'EB01-039', 1), 'yes');
  s = choose(s, `card:${mine(s, 'EB04-052').uid}`);
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'EB04-052'));
  assert.ok(s.players[0].life[0].faceUp);
  coherent(s);
  for (const oppLife of [3, 2]) {
    let t = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['OP09-107']); setDon(g, 0, 6); });
    t.players[1].life = t.players[1].life.slice(0, oppLife);
    t = play(t, 'OP09-107');
    assert.equal(t.players[1].life.length, oppLife === 3 ? 2 : 2);
    assert.equal(t.players[1].trash.length, oppLife === 3 ? 1 : 0);
  }
});

test('Monkey D. Luffy (EB04-061) : −1 en main avec 1 Vie ; défausser 1 : Leader +2000 et [Bloqueur] ; Sanji (EB04-052) : base du Leader adverse', () => {
  for (const life of [1, 2]) {
    const s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['EB04-061']); setLife(g, 0, ['OP15-108', 'OP15-113'].slice(0, life)); });
    assert.equal(handCost(s, 0, s.players[0].hand[0]), life === 1 ? 9 : 10);
  }
  let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['EB04-061', 'OP15-108']); setDon(g, 0, 10); });
  s = choose(play(s, 'EB04-061'), 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  assert.ok(hasKeyword(s, 0, mine(s, 'EB04-061'), 'Blocker'));
  coherent(s);
  s = scenario([ROBIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB04-052' }]); });
  s = attack(s, mine(s, 'EB04-052').uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, 'EB04-052').uid), 5000);
  coherent(noCounter(s));
});

test('Gum Gum Red Hawk : 5 Vies au total : KO de coût de base 5 ou moins ; Nami (OP08-106) : défausser une carte à [Déclenchement] : KO, puis piocher', () => {
  for (const total of [5, 4]) {
    let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['OP11-114']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_LUFFY }]); });
    s.players[0].life = s.players[0].life.slice(0, 2);
    s.players[1].life = s.players[1].life.slice(0, total - 2);
    s = choose(play(s, 'OP11-114'), 'yes');
    if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
    assert.equal(s.players[1].chars.length, total >= 5 ? 0 : 1);
  }
  let s = scenario([ROBIN, 'ST-21'], (g) => { setHand(g, 0, ['OP08-106', 'P-042', 'OP15-108']); setDon(g, 0, 5); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = choose(play(s, 'OP08-106'), 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.label.startsWith('Roronoa'));
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].hand.length, 2, '1 carte restante + 1 piochée');
  coherent(s);
});

test('Gum-Gum Jet Spear : [Déclenchement] une Vie en main, puis une carte de la main dans la Vie ; Kizaru ! : Leader [Monkey.D.Luffy] inesquivable', () => {
  let s = scenario([ROBIN, 'ST-21'], (g) => { setLife(g, 0, ['ST13-018', 'OP15-108', 'OP15-113']); setHand(g, 0, ['EB03-055']); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = toTrigger(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  s = choose(s, 'yes');
  s = choose(s, 'bottom');
  s = choose(s, (o) => o.num === 'EB03-055');
  assert.equal(s.players[0].life[0].num, 'EB03-055');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP15-113'));
  coherent(s);
  for (const deck of [LUFFY, ROBIN]) {
    const t = play(scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['ST29-016']); setDon(g, 0, 1); }), 'ST29-016');
    assert.equal(hasKeyword(t, 0, t.players[0].leader, 'Unblockable'), deck === LUFFY);
  }
});
