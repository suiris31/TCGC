// Famille du Leader Kuzan (phase 4E) : cartes bleues {Marine}, qui placent des Personnages sous le deck et font
// défausser (le Leader Kuzan pioche alors autant). Un deck d'essai au Leader Kuzan (2 exemplaires de chaque carte), un
// au Leader Don Quijote Rosinante et un au Leader Luffy pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_KUZAN } from '../engine/cards/fam-kuzan.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { canBeKO, hasKeyword, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_KUZAN);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP07-040': 2, 'ST33-002': 2 };
const KUZAN = 'TEST-KUZAN';
const ROSI = 'TEST-KUZAN-ROSINANTE';
const PLAIN = 'TEST-KUZAN-LUFFY';
DECKS[KUZAN] = { id: KUZAN, name: 'Essai', series: 'TEST', leader: 'OP12-040', cards };
DECKS[ROSI] = { id: ROSI, name: 'Essai', series: 'TEST', leader: 'OP12-061', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000, <Sagesse>
const O_LUFFY = 'ST21-014';      // coût 5, 6000, <Frappe>
const FILL = [O_BONNEY, O_JINBE, O_STUSSY, O_CHOPPER, O_SENTOMARU, 'ST21-013', 'ST21-002'];

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const anyCard = (s: GameState) => choose(s, (o) => o.id.startsWith('card:'));
// défausses demandées au joueur 0 (une question à une seule réponse est répondue d'office)
function discards(s: GameState) {
  while (s.decision?.tag === 'discard' && s.decision.player === 0) s = anyCard(s);
  return s;
}

test('Issho : défausser 2 cartes (le Leader Kuzan pioche 2) : l’adversaire à 6 cartes ou plus en place 2 sous son deck ; [DON!! x1] [En attaquant] −2000', () => {
  for (const oppHand of [6, 5]) {
    let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['EB04-022', 'OP06-045', 'OP06-046', 'OP06-050']); setDon(g, 0, 5); setHand(g, 1, FILL.slice(0, oppHand)); });
    const deck = s.players[1].deck.length;
    s = choose(play(s, 'EB04-022'), 'yes');
    s = anyCard(anyCard(s));
    if (oppHand === 6) s = anyCard(anyCard(s));
    assert.equal(s.players[0].hand.length, 3, 'Kuzan pioche 2');
    assert.equal(s.players[1].hand.length, oppHand === 6 ? 4 : 5);
    assert.equal(s.players[1].deck.length, deck + (oppHand === 6 ? 2 : 0));
    coherent(s);
  }
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-045']); setChars(g, 0, [{ num: 'EB04-022', extra: { don: 1 } }]); setDon(g, 0, 0); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = discards(choose(attack(s, mine(s, 'EB04-022').uid, s.players[1].leader.uid), 'yes'));
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 4000);
  coherent(noCounter(s));
});

test('Iska, Borsalino, Sakazuki : un Personnage sous le deck de son propriétaire ; Hina (EB03-025) : renvoyer un Personnage de 6000 de base', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['EB03-022']); setDon(g, 0, 6); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); });
  s = play(s, 'EB03-022');
  assert.equal(hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), false, 'coût 5');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].deck.at(-1)!.num, O_CHOPPER);
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['EB03-025', 'OP06-045']); setDon(g, 0, 5); setChars(g, 1, [{ num: O_STUSSY }, { num: O_LUFFY }]); });
  s = discards(choose(play(s, 'EB03-025'), 'yes'));
  assert.equal(hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), false, '5000');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === O_LUFFY));
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);
});

test('Chien ardent : +3000, puis un Personnage de coût 2 ou moins sous le deck ; Épée céleste : coût 2 ou moins et coût 1 ou moins', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP05-057']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_JINBE }, { num: O_STUSSY }]); });
  const before = power(s, s.players[0].leader.uid);
  s = choose(play(s, 'OP05-057'), `card:${s.players[0].leader.uid}`);
  s = choose(s, `card:${theirs(s, O_JINBE).uid}`);
  assert.equal(power(s, s.players[0].leader.uid), before + 3000);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-056']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_JINBE }, { num: O_BONNEY }, { num: O_STUSSY }]); });
  s = choose(play(s, 'OP06-056'), `card:${theirs(s, O_JINBE).uid}`);
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
});

test('It’s a Waste of Human Life!! : tous les Personnages de coût 3 ou moins sous le deck, puis chacun défausse jusqu’à 5 (Kuzan pioche autant)', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-058', 'OP06-045', 'OP06-046', 'OP06-050', 'OP06-051', 'OP06-052', 'OP06-053', 'OP06-054']);
    setChars(g, 0, [{ num: 'OP06-053' }, { num: 'OP12-044' }]);
    setDon(g, 0, 8);
    setHand(g, 1, FILL);
    setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }, { num: O_CHOPPER }]);
  });
  s = play(s, 'OP05-058');
  while (s.decision?.tag === 'discard') s = anyCard(s);
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP12-044']);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.players[0].hand.length, 7, '7 − 2 défaussées + 2 piochées');
  coherent(s);
});

test('Aramaki : défausser 1 carte et placer un Personnage de coût 2 ou moins sous le deck : +3000 ; Kuzan (OP06-045) : piocher 2, 2 cartes sous le deck', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-045']); setChars(g, 0, [{ num: 'OP06-043' }]); setChars(g, 1, [{ num: O_JINBE }]); });
  s = discards(act(s, `act:${mine(s, 'OP06-043').uid}`));
  assert.equal(power(s, mine(s, 'OP06-043').uid), 11000);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-045', 'OP06-046']); setDon(g, 0, 3); });
  const deck = s.players[0].deck.length;
  s = play(s, 'OP06-045');
  s = anyCard(anyCard(s));
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].deck.length, deck);
  coherent(s);
});

test('Gion : pendant son tour, quand l’adversaire active un Événement, il place 1 carte de sa main sous son deck', () => {
  let s = scenario([KUZAN, KUZAN], (g) => {
    setChars(g, 0, [{ num: 'OP06-044' }, { num: 'OP12-044', extra: { playedTurn: 0 } }]);
    setHand(g, 1, ['OP06-059', 'OP06-045']);
    setDon(g, 1, 2);
  });
  const deck = s.players[1].deck.length;
  s = attack(s, mine(s, 'OP12-044').uid, s.players[1].leader.uid);
  while (s.decision?.kind !== 'counter') s = choose(s, s.decision!.kind === 'blocker' ? 'noblock' : 'no');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  while (s.decision && s.decision.kind !== 'counter' && s.decision.kind !== 'main') s = choose(s, (o) => o.id.startsWith('card:') || o.id === 'yes');
  assert.ok(logHas(s, 'Gion'));
  assert.equal(s.players[1].deck.length, deck, 'pioche 1 (White Snake), 1 carte sous le deck');
  assert.equal(s.players[1].deck.at(-1)!.num, 'OP06-045');
  coherent(noCounter(s));
});

test('Tashigi, Sengoku : 5 cartes du dessus ; Tsuru : défausser 2 : l’adversaire renvoie un de ses Personnages en main', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-050']); setDon(g, 0, 1); setDeckTop(g, 0, ['OP06-050', 'OP06-046', 'OP07-040']); });
  s = play(s, 'OP06-050');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Tashigi')), false);
  s = choose(s, (o) => o.label.startsWith('Sakazuki'));
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-051', 'OP06-045', 'OP06-046']); setDon(g, 0, 5); setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]); });
  s = discards(choose(play(s, 'OP06-051'), 'yes'));
  assert.equal(s.decision!.player, 1, 'l’adversaire choisit');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(s);
});

test('Tokikake, Borsalino (OP06-054), Monkey.D.Garp (P-054) : protections et [Bloqueur] selon la main', () => {
  const s = scenario([KUZAN, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP06-052', extra: { don: 1 } }, { num: 'OP06-054' }, { num: 'P-054', extra: { don: 1 } }]);
    setDon(g, 0, 0);
    setHand(g, 0, ['OP06-045', 'OP06-046', 'OP06-050', 'OP06-051']);
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]);
  });
  assert.equal(canBeKO(s, mine(s, 'OP06-052').uid, 'battle', 1), false, '4 cartes en main');
  assert.ok(hasKeyword(s, 0, mine(s, 'OP06-054'), 'Blocker'));
  s.players[0].hand.push(take(s, 0, 'OP06-053'), take(s, 0, 'OP06-056'));
  assert.equal(canBeKO(s, mine(s, 'OP06-052').uid, 'battle', 1), true, '6 cartes');
  assert.equal(hasKeyword(s, 0, mine(s, 'OP06-054'), 'Blocker'), false);
  const garp = mine(s, 'P-054').uid;
  s.battle = { attacker: theirs(s, O_LUFFY).uid, target: garp } as GameState['battle'];
  assert.equal(canBeKO(s, garp, 'battle', 1), false, '<Frappe>');
  s.battle = { attacker: theirs(s, O_CHOPPER).uid, target: garp } as GameState['battle'];
  assert.equal(canBeKO(s, garp, 'battle', 1), true, '<Sagesse>');
});

test('Monkey.D.Garp (OP06-055) : [DON!! x2] avec 4 cartes ou moins, pas de [Bloqueur] ; Hina (OP12-051) : un Personnage de coût de base 4 ou moins sans [Bloqueur]', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP06-055', extra: { don: 2 } }]); setDon(g, 0, 0); setHand(g, 0, []); setChars(g, 1, [{ num: O_SENTOMARU }]); });
  s = attack(s, mine(s, 'OP06-055').uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.kind, 'blocker');
  assert.equal(hasKeyword(s, 1, theirs(s, O_SENTOMARU), 'Blocker'), false);
  coherent(noCounter(s));
  s = scenario([KUZAN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP12-051' }]); setHand(g, 0, ['OP06-045']); setChars(g, 1, [{ num: O_SENTOMARU }]); });
  s = discards(act(s, `act:${mine(s, 'OP12-051').uid}`));
  if (s.decision?.options.some((o) => o.id === `card:${theirs(s, O_SENTOMARU).uid}`)) s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.equal(hasKeyword(s, 1, theirs(s, O_SENTOMARU), 'Blocker'), false);
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);
});

test('Lame-gravité : 2 Personnages de coût 6 ou moins ; White Snake : [Contre] +1000 et piocher 1 ; Jaguar.D.Saul : [En cas de KO]', () => {
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-058']); setDon(g, 0, 7); setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }, { num: O_STUSSY }]); });
  s = choose(choose(play(s, 'OP06-058'), `card:${theirs(s, O_LUFFY).uid}`), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_STUSSY]);
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-059']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  while (s.decision?.kind !== 'counter') s = choose(s, 'noblock');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  assert.equal(s.players[0].hand.length, 1);
  coherent(noCounter(s));
});

test('Sakazuki (OP12-044) : [Jouée] Leader {Marine} : piocher 2 ; défausser 1 carte : 1 DON!! épuisée ; Monkey D. Garp (OP12-056) : jouer un {Marine} bleu de 8000 ou moins', () => {
  for (const deck of [KUZAN, PLAIN]) {
    const s = play(scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['OP12-044']); setDon(g, 0, 7); }), 'OP12-044');
    assert.equal(s.players[0].hand.length, deck === KUZAN ? 2 : 0);
  }
  let s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP06-045']); setChars(g, 0, [{ num: 'OP12-044' }]); setDon(g, 0, 0, 1); });
  s = discards(act(s, `act:${mine(s, 'OP12-044').uid}`));
  s = choose(s, `card:${mine(s, 'OP12-044').uid}`);
  assert.equal(mine(s, 'OP12-044').don, 1);
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);
  s = scenario([KUZAN, 'ST-21'], (g) => { setHand(g, 0, ['OP12-056', 'OP06-055', 'OP06-043', 'OP06-045']); setDon(g, 0, 8); });
  s = choose(play(s, 'OP12-056'), 'yes');
  s = choose(s, (o) => o.label.startsWith('Kuzan'));
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Monkey')), false, 'autre que Garp');
  s = choose(s, (o) => o.label.startsWith('Aramaki'));
  assert.ok(mine(s, 'OP06-043'));
  coherent(s);
});

test('Don Quijote Rosinante (OP12-048) et Borsalino (OP12-053) : retirés par un effet adverse, s’épuiser et défausser / défausser à la place', () => {
  let s = scenario([KUZAN, KUZAN], (g) => {
    setChars(g, 0, [{ num: 'OP12-048' }, { num: 'OP06-044' }]);
    setHand(g, 0, ['OP06-045']);
    setHand(g, 1, ['OP05-051']);
    setDon(g, 1, 7);
  }, 1);
  s = play(s, 'OP05-051', 1);
  s = choose(s, `card:${mine(s, 'OP06-044').uid}`);
  aiAnswers(s);
  s = discards(choose(s, (o) => o.id.startsWith('replace:')));
  assert.ok(mine(s, 'OP06-044'), 'Gion reste');
  assert.ok(mine(s, 'OP12-048').rested);
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);

  s = scenario([KUZAN, KUZAN], (g) => {
    setChars(g, 0, [{ num: 'OP12-053' }]);
    setHand(g, 0, ['OP06-045']);
    setHand(g, 1, ['OP05-051']);
    setDon(g, 1, 7);
  }, 1);
  assert.ok(hasKeyword(s, 0, mine(s, 'OP12-053'), 'Blocker'), 'tour adverse, Leader {Marine}');
  assert.equal(power(s, mine(s, 'OP12-053').uid), 6000);
  s = play(s, 'OP05-051', 1);
  s = choose(s, `card:${mine(s, 'OP12-053').uid}`);
  s = discards(choose(s, (o) => o.id.startsWith('replace:')));
  assert.ok(mine(s, 'OP12-053'));
  assert.equal(s.players[0].hand.length, 1, 'Kuzan pioche 1');
  coherent(s);
});

test('Don Quijote Rosinante (EB02-025) : avec le Leader [Donquixote Rosinante], jouer épuisé un Personnage de coût 2 ou moins parmi 5', () => {
  for (const deck of [ROSI, KUZAN]) {
    let s = scenario([deck, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB02-025' }]); setDon(g, 0, 1); setDeckTop(g, 0, ['OP06-052', 'OP12-044']); });
    s = act(s, `act:${mine(s, 'EB02-025').uid}`);
    if (deck === ROSI) {
      s = choose(s, (o) => o.label.startsWith('Tokikake'));
      while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
      assert.ok(mine(s, 'OP06-052').rested);
    } else assert.equal(s.players[0].chars.length, 1);
    assert.ok(mine(s, 'EB02-025').rested);
    coherent(s);
  }
});
