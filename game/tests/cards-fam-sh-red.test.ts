// Famille du Leader Luffy rouge (phase 4E) : cartes rouges {Équipage de Chapeau de paille}, qui jouent avec la
// puissance et les DON!! données. Un deck d'essai au Leader Luffy (ST21-001), un au Leader Ace et Newgate (nom incluant
// « Ace ») et un au Leader Kaido pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { FAM_SH_RED } from '../engine/cards/fam-sh-red.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, handCost, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_SH_RED);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP11-065': 2, 'OP06-043': 2 };
const LUFFY = 'TEST-SHRED';
const ACE = 'TEST-SHRED-ACE';
const KAIDO = 'TEST-SHRED-KAIDO';
DECKS[LUFFY] = { id: LUFFY, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };
DECKS[ACE] = { id: ACE, name: 'Essai', series: 'TEST', leader: 'ST22-001', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const toCounter = (s: GameState) => {
  while (s.decision && s.decision.kind !== 'counter') s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : 'no');
  return s;
};

test('Tony-Tony Chopper (EB01-006) [DON!! x2] et Jinbe (ST10-005) [DON!! x1] : [En attaquant] −3000 / −2000', () => {
  for (const [num, don, minus] of [['EB01-006', 2, 3000], ['ST10-005', 1, 2000], ['EB01-006', 1, 0]] as const) {
    let s = scenario([LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num, extra: { don } }]); setDon(g, 0, 0); setChars(g, 1, [{ num: O_CHOPPER }]); });
    s = attack(s, mine(s, num).uid, s.players[1].leader.uid);
    if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
    assert.equal(power(s, theirs(s, O_CHOPPER).uid), 6000 - minus);
    coherent(noCounter(s));
  }
});

test('« There’s No Way You Could Defeat Me!! » : [Contre] KO de l’attaquant de 6000 de base ou moins (l’IA le voit) ; Gum-Gum Giant Sumo Slap', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['EB01-010']); setDon(g, 0, 3); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = toCounter(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  assert.ok(heuristicChooser(s, s.decision!).startsWith('cevent:'), 'l’IA arrête l’attaque');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  s = noCounter(s);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].life.length, 5, 'pas de dégât');
  coherent(s);
  s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['ST10-015']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_SENTOMARU }]); }, 1);
  s = toCounter(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  while (s.decision?.kind === 'effect') s = choose(s, (o) => o.id === `card:${s.players[0].leader.uid}` || o.id === `card:${theirs(s, O_SENTOMARU)?.uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(noCounter(s));
});

test('Mini-Merry : s’épuiser et placer un Personnage de 1000 de base sous le deck : piocher 1 ; Thousand Sunny : déplacer une DON!! donnée', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => {
    const stage = g.players[0].deck.find((c) => c.num === 'EB01-011')!;
    g.players[0].deck.splice(g.players[0].deck.indexOf(stage), 1);
    g.players[0].stage = { uid: stage.uid, num: stage.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setChars(g, 0, [{ num: 'OP11-065' }]);
    setHand(g, 0, []);
  });
  s = act(s, `act:${s.players[0].stage!.uid}`);
  assert.equal(s.players[0].chars.length, 0);
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(s.players[0].stage!.rested);
  coherent(s);
  s = scenario([LUFFY, 'ST-21'], (g) => {
    const stage = g.players[0].deck.find((c) => c.num === 'EB02-009')!;
    g.players[0].deck.splice(g.players[0].deck.indexOf(stage), 1);
    g.players[0].stage = { uid: stage.uid, num: stage.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    g.players[0].leader.don = 2;
    g.players[0].leader.rested = true;
    setChars(g, 0, [{ num: 'OP10-005' }]);
    setDon(g, 0, 0);
  });
  s = act(s, `act:${s.players[0].stage!.uid}`);
  s = choose(s, `card:${s.players[0].leader.uid}`);
  s = choose(s, `card:${mine(s, 'OP10-005').uid}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(mine(s, 'OP10-005').don, 1);
  coherent(s);
});

test('Tony-Tony Chopper (EB02-003) : [DON!! x2] [Tour adverse] +2000 ; [Jouée] Leader {Équipage de Chapeau de paille} : 1 DON!! ; Sanji (OP10-005), Chopper (OP10-011)', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['EB02-003']); setDon(g, 0, 3, 1); });
  s = play(s, 'EB02-003');
  if (s.decision?.kind === 'effect') s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  for (const deck of [KAIDO]) {
    const t = play(scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['EB02-003']); setDon(g, 0, 3, 1); }), 'EB02-003');
    assert.equal(t.players[0].leader.don, 0, 'Leader Kaido');
  }
  const opp = scenario([LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB02-003', extra: { don: 2 } }, { num: 'OP10-005' }, { num: 'OP10-011' }]); setDon(g, 0, 0); }, 1);
  assert.equal(power(opp, mine(opp, 'EB02-003').uid), 5000);
  assert.equal(power(opp, mine(opp, 'OP10-005').uid), 3000);
  assert.equal(power(opp, mine(opp, 'OP10-011').uid), 6000);
  const own = scenario([LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-005' }, { num: 'OP10-011' }]); });
  assert.equal(power(own, mine(own, 'OP10-005').uid), 6000);
  assert.equal(power(own, mine(own, 'OP10-011').uid), 4000);
});

test('Sabot d’acier : 3 cartes +1000, puis KO de 3000 ou moins ; Gum-Gum King Kong Gatling : +3000, +1000 si l’adversaire a 7000 ; Soucoupe volante', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['EB02-007']); setDon(g, 0, 3); setChars(g, 0, [{ num: 'OP10-011' }]); setChars(g, 1, [{ num: O_BONNEY }, { num: O_JINBE }]); });
  s = play(s, 'EB02-007');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  s = choose(s, `card:${mine(s, 'OP10-011').uid}`);
  if (s.decision?.options.some((o) => o.id === 'none') && !s.decision.options.some((o) => o.id === `card:${theirs(s, O_BONNEY).uid}`)) s = choose(s, 'none');
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_JINBE]);
  coherent(s);
  for (const big of [true, false]) {
    let t = scenario([LUFFY, LUFFY], (g) => { setHand(g, 0, ['OP06-018']); setDon(g, 0, 2); setChars(g, 1, [{ num: big ? 'OP06-043' : 'OP10-005' }]); });
    t = choose(play(t, 'OP06-018'), `card:${t.players[0].leader.uid}`);
    if (t.decision?.kind === 'effect') t = choose(t, `card:${t.players[0].leader.uid}`);
    assert.equal(power(t, t.players[0].leader.uid), big ? 9000 : 8000);
  }
  for (const life of [2, 3]) {
    let t = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP10-020']); setDon(g, 0, 2); setLife(g, 0, ['OP05-010', 'OP05-010', 'OP10-005'].slice(0, life)); setChars(g, 1, [{ num: O_CHOPPER }]); });
    t = play(t, 'OP10-020');
    if (t.decision?.kind === 'effect') t = choose(t, `card:${t.players[1].chars[0].uid}`);
    if (t.decision?.kind === 'effect') t = choose(t, `card:${t.players[0].leader.uid}`);
    assert.equal(power(t, t.players[1].chars[0].uid), 2000);
    assert.equal(power(t, t.players[0].leader.uid), life <= 2 ? 6000 : 5000);
  }
});

test('Nami (EB03-006) : −5000 à son Leader redressé pour piocher (l’IA ne le fait que si le Leader ne peut pas attaquer) ; Roronoa Zoro (EB04-007)', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['EB03-006']); setDon(g, 0, 5); });
  s = play(s, 'EB03-006');
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'no', 'le Leader peut attaquer');
  s = choose(s, 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 0);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
  s = scenario([LUFFY, LUFFY], (g) => { setHand(g, 0, ['EB04-007']); setDon(g, 0, 7); setChars(g, 1, [{ num: 'OP06-043' }]); });
  s = play(s, 'EB04-007');
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  assert.equal(attackAbility(s, 0, mine(s, 'EB04-007')).can, false);
  s = act(s, `act:${mine(s, 'EB04-007').uid}`);
  assert.deepEqual(attackAbility(s, 0, mine(s, 'EB04-007')), { can: true, charsOnly: true });
  s = act(s, 'end');
  while (s.active === 1 && s.decision?.kind !== 'main') s = choose(s, (o) => o.id !== 'none');
  assert.equal(power(s, s.players[0].leader.uid), 7000, 'jusqu’à la fin du prochain tour adverse');
});

test('Meteor-Strike of Love : Vie du dessus en main : +3000 ; Tony Tony.Chopper (OP08-007) : jouer épuisé un {Animal} de 4000 ou moins parmi 5', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP06-017']); setDon(g, 0, 2); });
  const life = s.players[0].life.length;
  s = choose(play(s, 'OP06-017'), 'yes');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 8000);
  assert.equal(s.players[0].life.length, life - 1);
  coherent(s);
  s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP08-007']); setDon(g, 0, 3); setDeckTop(g, 0, ['EB02-003', 'EB01-006', 'OP08-007']); });
  s = play(s, 'OP08-007');
  assert.equal(s.decision!.options.some((o) => o.label === 'Tony Tony.Chopper' && o.num === 'OP08-007'), false, '5000');
  s = choose(s, (o) => o.num === 'EB01-006');
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  assert.ok(mine(s, 'EB01-006').rested);
  coherent(s);
});

test('Monkey D. Luffy (OP12-015) : +2000 avec 2 DON!! données ; révéler 2 Événements : jouer un Personnage rouge de 3000 ou moins, puis 1 DON!!', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP12-015', 'OP06-019', 'OP06-018', 'EB02-003']); setDon(g, 0, 4, 1); });
  s = choose(play(s, 'OP12-015'), 'yes');
  while (s.decision?.tag === 'revealCost') s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  if (s.decision?.kind === 'effect') s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.ok(mine(s, 'EB02-003'));
  assert.equal(power(s, mine(s, 'OP12-015').uid), 4000);
  s.players[0].leader.don = 2;
  assert.equal(power(s, mine(s, 'OP12-015').uid), 6000);
});

test('Monkey D. Luffy (OP16-015) : −2 en main avec un Leader « Ace » et 6 DON!! ; défausser un Personnage de 8000 : Leader et lui à 7000 de base', () => {
  for (const [deck, don, cost] of [[ACE, 6, 2], [ACE, 5, 4], [LUFFY, 6, 4]] as const) {
    const s = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['OP16-015']); setDon(g, 0, don); });
    assert.equal(handCost(s, 0, s.players[0].hand[0]), cost);
  }
  let s = scenario([LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP16-015' }]); setHand(g, 0, ['OP06-043']); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  aiAnswers(s);
  assert.equal(heuristicChooser(s, s.decision!), 'yes', '7000 repousse 6000');
  s = choose(s, 'yes');
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  assert.equal(power(s, mine(s, 'OP16-015').uid), 7000);
  while (s.decision && s.decision.kind !== 'main') s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : s.decision.kind === 'counter' ? 'pass' : 'no');
  coherent(s);
});

test('Monkey.D.Luffy (ST10-006) : quand l’adversaire active [Bloqueur], KO d’un Personnage adverse de 8000 ou moins ; Sanji (ST10-004) ; Gum-Gum Kong Gatling', () => {
  let s = scenario([LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'ST10-006' }]); setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_LUFFY }]); });
  s = attack(s, mine(s, 'ST10-006').uid, s.players[1].leader.uid);
  s = choose(s, (o) => o.id.startsWith('block:'));
  assert.ok(s.decision?.options.some((o) => o.id === `card:${theirs(s, O_LUFFY).uid}`));
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_SENTOMARU]);
  assert.ok(logHas(s, 'Monkey.D.Luffy'));
  coherent(noCounter(s));
  for (const big of [true, false]) {
    const t = play(scenario([LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['ST10-004']); setDon(g, 0, 6); setChars(g, 1, [{ num: big ? O_STUSSY : O_JINBE }]); }), 'ST10-004');
    assert.equal(attackAbility(t, 0, mine(t, 'ST10-004')).can, big);
  }
});
