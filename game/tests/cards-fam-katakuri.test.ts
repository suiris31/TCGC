// Famille du Leader Katakuri (phase 4E) : cartes violettes {Équipage de Big Mom}, qui jouent avec les DON!! renvoyées
// et la Vie. Un deck d'essai au Leader Katakuri (2 exemplaires de chaque carte) et un au Leader Luffy pour les
// conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_KATAKURI } from '../engine/cards/fam-katakuri.ts';
import { playableErrors } from '../engine/deckRules.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { donOnField, fieldCost, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_KATAKURI);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP08-075': 4, 'OP08-077': 2, 'OP17-077': 2 };
const KATA = 'TEST-KATAKURI';
const PLAIN = 'TEST-KATAKURI-LUFFY';
DECKS[KATA] = { id: KATA, name: 'Essai', series: 'TEST', leader: 'OP11-062', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
// Attaque adverse : l'effet de la carte essayée d'abord, le Leader Katakuri refusé, pas de blocage ni de Contre
function defend(s: GameState, num: string | null, yes = true): GameState {
  for (let i = 0; i < 30 && s.decision && s.active === 1 && s.decision.player !== 1; i++) {
    const d = s.decision;
    if (d.options.some((o) => o.id.startsWith('first:'))) s = choose(s, (o) => o.id === `first:${num}` || (!num && o.id.startsWith('first:')));
    else if (d.tag === 'may' || d.tag === 'mayKatakuri') s = choose(s, d.prompt.startsWith('Katakuri (Leader)') || !yes ? 'no' : 'yes');
    else if (d.kind === 'blocker') s = choose(s, 'noblock');
    else if (d.kind === 'counter') s = choose(s, 'pass');
    else if (d.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
    else s = choose(s, (o) => o.id !== 'none');
  }
  return s;
}

test('Sanji et Pudding : [Jouée] piocher 1 avec autant de DON!! ou moins que l’adversaire ; 2 DON!! renvoyées pendant son tour : 1 DON!! redressée', () => {
  for (const oppDon of [5, 4]) {
    const s = play(scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['EB02-035']); setDon(g, 0, 5); setDon(g, 1, oppDon); }), 'EB02-035');
    assert.equal(s.players[0].hand.length, oppDon === 5 ? 1 : 0);
  }
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-077']); setChars(g, 0, [{ num: 'EB02-035' }]); setDon(g, 0, 6); });
  s = choose(play(s, 'OP08-077'), 'yes');
  while (s.decision?.kind === 'effect') s = choose(s, 'none');
  assert.equal(donOnField(s, 0), 5);
  assert.ok(logHas(s, 'redressée'));
  coherent(s);
});

test('Charlotte Pudding (OP08-067) et Randolph : une DON!! renvoyée pendant son tour : 1 DON!! épuisée / +2 de coût', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-075']); setChars(g, 0, [{ num: 'OP08-067' }]); setDon(g, 0, 3); });
  s = choose(play(s, 'OP08-075'), 'yes');
  assert.equal(donOnField(s, 0), 3);
  coherent(s);
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-075']); setChars(g, 0, [{ num: 'OP11-077' }, { num: 'OP08-061' }]); setDon(g, 0, 3); });
  s = choose(play(s, 'OP08-075'), 'yes');
  s = choose(s, `card:${mine(s, 'OP08-061').uid}`);
  assert.equal(fieldCost(s, mine(s, 'OP08-061').uid), 7);
  coherent(s);
});

test('Charlotte Brûlée (EB03-033) : DON!! renvoyée par son propre effet pendant le tour adverse, avec un Leader {Équipage de Big Mom} : 1 DON!! épuisée', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB03-033' }]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  s = choose(s, 'yes');  // Leader Katakuri : DON!! −1
  assert.equal(donOnField(s, 0), 3);
  coherent(defend(s, null));
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP17-077']); setChars(g, 0, [{ num: 'EB03-033' }]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  while (s.decision?.kind !== 'counter') s = choose(s, s.decision!.kind === 'blocker' ? 'noblock' : 'no');
  s = choose(choose(s, (o) => o.id.startsWith('cevent:')), 'yes');
  assert.equal(donOnField(s, 0), 2, 'Leader Luffy');
});

test('Charlotte Pudding (EB04-034) : [Attaque adverse] défausser 1 carte : +2000 avec 4 Événements ou plus dans la Défausse', () => {
  for (const events of [4, 3]) {
    let s = scenario([KATA, 'ST-21'], (g) => {
      setHand(g, 0, ['OP11-077']);
      setChars(g, 0, [{ num: 'EB04-034' }]);
      g.players[0].trash = Array.from({ length: events }, () => take(g, 0, 'OP08-075'));
      setChars(g, 1, [{ num: O_CHOPPER }]);
    }, 1);
    const before = power(s, s.players[0].leader.uid);
    s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
    s = choose(s, 'first:EB04-034');
    s = choose(s, 'yes');
    if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
    if (s.decision?.options.some((o) => o.id === `card:${s.players[0].leader.uid}`)) s = choose(s, `card:${s.players[0].leader.uid}`);
    assert.equal(power(s, s.players[0].leader.uid), before + (events === 4 ? 2000 : 0));
    coherent(defend(s, null));
  }
});

test('Charlotte Oven : [En attaquant] DON!! −1 : KO de coût 3 ou moins', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP08-061' }]); setDon(g, 0, 2); setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]); });
  s = choose(attack(s, mine(s, 'OP08-061').uid, s.players[1].leader.uid), 'yes');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(noCounter(s));
});

test('Charlotte Katakuri (OP08-062) : se défausser pour jouer un [Charlotte Katakuri] de coût 3 à N (DON!! adverses) ; OP08-063 : Vie face cachée : 1 DON!!', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-063', 'OP11-067']); setChars(g, 0, [{ num: 'OP08-062' }]); setDon(g, 1, 6); });
  s = act(s, `act:${mine(s, 'OP08-062').uid}`);
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.filter((o) => o.id.startsWith('card:')).length, 1, 'coût 8 : trop cher');
  s = choose(s, (o) => o.label.startsWith('Charlotte Katakuri'));
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP08-063']);
  coherent(s);

  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-063']); setDon(g, 0, 6); });
  s.players[0].life[0].faceUp = true;
  s = choose(play(s, 'OP08-063'), 'yes');
  assert.equal(s.players[0].life[0].faceUp, false);
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
});

test('Charlotte Cracker : DON!! −1 : jouer un [Biscuit Warrior] ; Biscuit Warrior : autant d’exemplaires qu’on veut', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-072']); setChars(g, 0, [{ num: 'OP08-064' }]); setDon(g, 0, 1); });
  s = act(s, `act:${mine(s, 'OP08-064').uid}`);
  s = choose(s, (o) => o.label.startsWith('Biscuit Warrior'));
  assert.ok(mine(s, 'OP08-072'));
  assert.equal(donOnField(s, 0), 0);
  coherent(s);
  const copies = (e: string[]) => e.filter((x) => x.includes('exemplaires'));
  assert.deepEqual(copies(playableErrors('OP11-062', { 'OP08-072': 10, 'OP08-064': 4 })), []);
  assert.equal(copies(playableErrors('OP11-062', { 'OP08-072': 4, 'OP08-064': 5 })).length, 1);
});

test('Baron Tamago, Count Niwatori : [En cas de KO] DON!! −1 : jouer [Viscount Hiyoko] de la main / [Baron Tamago] du deck (tour adverse)', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, ['OP08-073']);
    setChars(g, 0, [{ num: 'OP08-070', extra: { rested: true } }]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: O_LUFFY }]);
  }, 1);
  s = defend(attack(s, theirs(s, O_LUFFY).uid, mine(s, 'OP08-070').uid), null);
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP08-073']);
  assert.equal(donOnField(s, 0), 1);
  coherent(s);

  s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP08-071', extra: { rested: true } }]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: O_LUFFY, extra: { don: 2 } }]);
    setDon(g, 1, 0);
  }, 1);
  s = defend(attack(s, theirs(s, O_LUFFY).uid, mine(s, 'OP08-071').uid), null);
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP08-070']);
  assert.ok(logHas(s, 'mélange son deck'));
  coherent(s);
  const f = s.players[0].chars[0];
  const koCondition = FAM_KATAKURI['OP08-071'].onKOCondition!;
  assert.equal(koCondition({ ...s, active: 1 }, 0, f), true);
  assert.equal(koCondition({ ...s, active: 0 }, 0, f), false, 'pendant son tour à lui, rien');
});

test('Charlotte Linlin (OP08-069) : DON!! −1 et défausser 1 : +1 Vie, puis un Personnage adverse de coût 6 ou moins face visible dans la Vie adverse', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-069', 'OP11-077']); setDon(g, 0, 10); setChars(g, 1, [{ num: O_LUFFY }]); });
  const [life, oppLife] = [s.players[0].life.length, s.players[1].life.length];
  s = choose(play(s, 'OP08-069'), 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  aiAnswers(s);
  s = choose(s, 'lifeBottom');
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[1].life.length, oppLife + 1);
  assert.equal(s.players[1].life.at(-1)!.num, O_LUFFY);
  assert.equal(s.players[1].life.at(-1)!.faceUp, true);
  coherent(s);
});

test('Candy Maiden : DON!! −1 : épuiser un Personnage adverse de coût 2 ou moins, puis toute sa Vie face cachée', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP08-075']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_STUSSY }]); });
  for (const c of s.players[0].life) c.faceUp = true;
  s = choose(play(s, 'OP08-075'), 'yes');
  s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.ok(theirs(s, O_SENTOMARU).rested);
  assert.ok(s.players[0].life.every((c) => !c.faceUp));
  coherent(s);
});

test('Charlotte Katakuri (OP11-067) : [Fin de votre tour] redresser 2 Personnages {Équipage de Big Mom} de coût 3 ou plus, puis 1 DON!! épuisée', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP11-067', extra: { rested: true } }, { num: 'OP08-061', extra: { rested: true } }, { num: 'OP11-077', extra: { rested: true } }]);
    setDon(g, 0, 2);
  });
  s = act(s, 'end');
  while (s.active === 0 && s.decision?.kind === 'effect') {
    const c = s.decision.options.find((o) => o.id.startsWith('card:'));
    s = choose(s, c ? c.id : 'none');
  }
  assert.equal(mine(s, 'OP11-067').rested, false);
  assert.equal(mine(s, 'OP08-061').rested, false);
  assert.equal(mine(s, 'OP11-077').rested, true, 'Randolph : coût 1');
  assert.equal(donOnField(s, 0), 3);
  coherent(s);
});

test('Charlotte Brûlée (OP11-069) : Vie du dessus en main : avec un Leader {Équipage de Big Mom}, 1 DON!! redressée', () => {
  for (const deck of [KATA, PLAIN]) {
    let s = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['OP11-069']); setDon(g, 0, 3); });
    const life = s.players[0].life.length;
    s = choose(play(s, 'OP11-069'), 'yes');
    assert.equal(s.players[0].life.length, life - 1);
    assert.equal(s.players[0].donActive, deck === KATA ? 1 : 0);
    coherent(s);
  }
});

test('Charlotte Pudding (OP11-070) : 5 cartes, une {Équipage de Big Mom} de coût 2 ou plus ; DON!! −1 : regarder le dessus du deck adverse ; Streusen : coût déclaré juste, épuiser', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP11-070']); setDon(g, 0, 1); setDeckTop(g, 0, ['OP11-077', 'OP08-061', 'OP08-075']); });
  expectTag(s = play(s, 'OP11-070'), 'pick');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Randolph')), false, 'coût 1');
  s = choose(s, (o) => o.label.startsWith('Charlotte Oven'));
  while (s.decision?.tag === 'bottomOrder') s = choose(s, 'keep');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP08-061'));
  coherent(s);

  s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP11-070' }, { num: 'OP11-074' }]); setDon(g, 0, 2); setDeckTop(g, 1, [O_STUSSY]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = act(s, `act:${mine(s, 'OP11-070').uid}`);
  assert.equal(s.peek[0], s.players[1].deck[0].uid);
  s = act(s, `act:${mine(s, 'OP11-074').uid}`);
  s = choose(s, 'cost:3');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(theirs(s, O_CHOPPER).rested);
  coherent(s);
});

test('Charlotte Mont d’or : DON!! −1 et s’épuiser : l’adversaire place 2 cartes de sa Défausse sous son deck, puis Vie du dessus en main', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP11-072' }]);
    setDon(g, 0, 1);
    g.players[1].trash = [take(g, 1, O_BONNEY), take(g, 1, O_STUSSY), take(g, 1, O_CHOPPER)];
  });
  const [hand, life, deck] = [s.players[0].hand.length, s.players[0].life.length, s.players[1].deck.length];
  s = act(s, `act:${mine(s, 'OP11-072').uid}`);
  assert.equal(s.decision!.player, 1, 'c’est l’adversaire qui choisit');
  s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].trash.length, 1);
  assert.equal(s.players[1].deck.length, deck + 2);
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.equal(s.players[0].life.length, life - 1);
  coherent(s);
});

test('Héra : jouer de sa main un {Homies} de 3000 ou moins ; Charlotte Pudding (PRB02-010) : DON!! −2 : piocher 2, puis un {Équipage de Big Mom} de 6000 à 8000', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['OP13-074', 'OP11-077']); setDon(g, 0, 4); });
  s = choose(play(s, 'OP13-074'), (o) => o.label.startsWith('Randolph'));
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP11-077', 'OP13-074']);
  coherent(s);
  for (const oppDon of [6, 5]) {
    s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, ['PRB02-010', 'OP08-063', 'OP11-067']); setDon(g, 0, 9); setDon(g, 1, oppDon); });
    s = choose(play(s, 'PRB02-010'), 'yes');
    if (oppDon === 6) {
      expectTag(s, 'playFree');
      assert.equal(s.decision!.options.some((o) => o.label.startsWith('Charlotte Katakuri (coût 8)')), true);
      s = choose(s, (o) => o.label.startsWith('Charlotte Katakuri (coût 6)'));
      assert.equal(s.players[0].chars.length, 2);
      assert.equal(s.players[0].hand.length, 3);
    } else assert.equal(s.players[0].hand.length, 2);
    coherent(s);
  }
});
