// Familles des Leaders du méta (phase 4E) : Rocks D. Xebec ({Équipage de Rocks}), Ener ({Île céleste}) et Dracule
// Mihawk (Grands corsaires). Un deck d'essai par Leader (2 exemplaires de chaque carte de la famille et quelques cartes
// d'appui), et des decks à un autre Leader pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAM_META } from '../engine/cards/fam-meta.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { canBeRested, hasBlocker, hasKeyword, hasMod, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_META);
const cards = (extra: Record<string, number>) => ({ ...Object.fromEntries(FAMILY.map((n) => [n, 2])), ...extra });
const XEBEC = 'TEST-XEBEC';
const ENEL = 'TEST-ENEL';
const MIHAWK = 'TEST-MIHAWK';
const ODYSSEY = 'TEST-ODYSSEY';
const PLAIN = 'TEST-META-LUFFY';
DECKS[XEBEC] = { id: XEBEC, name: 'Essai', series: 'TEST', leader: 'OP17-039', cards: cards({ 'OP17-055': 2, 'OP17-044': 2 }) };
DECKS[ENEL] = { id: ENEL, name: 'Essai', series: 'TEST', leader: 'OP15-058', cards: cards({ 'OP15-066': 2, 'OP15-067': 2 }) };
DECKS[MIHAWK] = { id: MIHAWK, name: 'Essai', series: 'TEST', leader: 'OP14-020', cards: cards({ 'OP05-024': 2, 'OP10-036': 2, 'OP12-027': 2, 'OP12-031': 2 }) };
DECKS[ODYSSEY] = { id: ODYSSEY, name: 'Essai', series: 'TEST', leader: 'OP09-022', cards: cards({}) };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: cards({ 'OP15-066': 2 }) };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_MOLE = 'ST21-017';       // −5000, puis KO 2000 ou moins avec un Personnage de 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const noBlock = (s: GameState) => (s.decision?.kind === 'blocker' ? choose(s, 'noblock') : s);
function setTrash(g: GameState, p: PlayerId, nums: string[]) {
  const list = nums.map((n) => take(g, p, n));
  g.players[p].deck.push(...g.players[p].trash);
  g.players[p].trash = list;
}
function setStage(g: GameState, p: PlayerId, num: string) {
  const c = take(g, p, num);
  g.players[p].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
}
// Leader Ener : 6 DON!! en tout
const enelDon = (g: GameState, active: number, rested = 0) => {
  const P = g.players[0];
  P.donActive = active;
  P.donRested = rested;
  P.donDeck = 6 - active - rested - [P.leader, ...P.chars].reduce((n, c) => n + c.don, 0);
};

// ---------- Rocks D. Xebec ----------

test('Ganzui : [Jouée] puissance de base du Leader 6000 ; mis KO en combat, 2 cartes défaussées à la place', () => {
  let s = scenario([XEBEC, 'ST-21'], (g) => { setHand(g, 0, ['OP17-043', 'OP17-050', 'OP17-052']); setDon(g, 0, 5); });
  s = play(s, 'OP17-043');
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  assert.equal(s.mods.find((m) => m.source === 'Ganzui')!.until, s.turn + 1);
  coherent(s);
  s = scenario([XEBEC, 'ST-21'], (g) => {
    setHand(g, 0, ['OP17-050', 'OP17-052']);
    setChars(g, 0, [{ num: 'OP17-043', extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 2 } }]);
    setDon(g, 1, 0);
  }, 1);
  s = noCounter(attack(s, theirs(s, O_CHOPPER).uid, mine(s, 'OP17-043').uid));
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  s = choose(s, (o) => o.label === 'Streusen');
  assert.ok(mine(s, 'OP17-043'));
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Streusen : regarder 2 cartes, les remettre dessus ou dessous, puis piocher ; Don Marlon : reprendre un Événement bleu de coût 0', () => {
  let s = scenario([XEBEC, 'ST-21'], (g) => { setHand(g, 0, ['OP17-050']); setDeckTop(g, 0, ['OP17-052', 'OP17-053']); setDon(g, 0, 1); });
  s = play(s, 'OP17-050');
  while (s.decision?.tag === 'scry' || s.decision?.tag === 'bottomOrder') s = choose(s, (o) => /dessous|bottom|Garder/i.test(o.label) || o.id === 'keep') ;
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  coherent(s);
  s = scenario([XEBEC, 'ST-21'], (g) => { setHand(g, 0, ['OP17-052']); setTrash(g, 0, ['OP17-055', 'OP17-044']); setDon(g, 0, 3); });
  s = play(s, 'OP17-052');
  assert.equal(s.decision!.options.length, 2, 'seul l’Événement bleu de coût 0 (Jozu est un Personnage)');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand[0].num, 'OP17-055');
  coherent(s);
});

test('Barbell : défausser 1 carte pour +3000 ; mis KO, l’adversaire place 2 cartes de sa main sous son deck', () => {
  let s = scenario([XEBEC, 'ST-21'], (g) => { setHand(g, 0, ['OP17-050']); setChars(g, 0, [{ num: 'OP17-053' }]); });
  s = act(s, `act:${mine(s, 'OP17-053').uid}`);
  assert.equal(power(s, mine(s, 'OP17-053').uid), 10000);
  assert.equal(hasOption(s, `act:${mine(s, 'OP17-053').uid}`), false);
  coherent(s);
  s = scenario([XEBEC, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP17-053', extra: { rested: true } }]);
    setHand(g, 1, [O_JINBE, O_BONNEY, O_STUSSY]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 2 } }]);
    setDon(g, 1, 0);
  }, 1);
  s = noCounter(attack(s, theirs(s, O_CHOPPER).uid, mine(s, 'OP17-053').uid));
  expectTag(s, 'discard');
  assert.equal(s.decision!.player, 1, 'l’adversaire choisit');
  s = choose(choose(s, (o) => o.label === 'Jinbe'), (o) => o.label === 'Stussy');
  assert.deepEqual(s.players[1].hand.map((c) => c.num), [O_BONNEY]);
  assert.deepEqual(s.players[1].deck.slice(-2).map((c) => c.num), [O_JINBE, O_STUSSY]);
  coherent(s);
});

test('Ruche (Lieu) : [Attaque adverse] s’épuiser et défausser 1 carte : +1000 à un Leader ou Personnage « Équipage de Rocks »', () => {
  let s = scenario([XEBEC, 'ST-21'], (g) => { setStage(g, 0, 'OP17-057'); setHand(g, 0, ['OP17-050']); setChars(g, 1, [{ num: O_STUSSY }]); }, 1);
  s = attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.ok(s.players[0].stage!.rested);
  s = noCounter(s);
  assert.ok(logHas(s, 'repoussée (5000 contre 6000)'));
  coherent(s);
});

// ---------- Ener ----------

test('Amazon : [Attaque adverse] s’épuiser : l’adversaire renvoie 1 DON!! redressée, sinon −2000', () => {
  for (const pays of [true, false]) {
    let s = scenario([ENEL, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-059' }]); enelDon(g, 0); setChars(g, 1, [{ num: O_STUSSY }]); setDon(g, 1, 2); }, 1);
    s = attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid);
    s = choose(s, 'yes');
    expectTag(s, 'oppPayDon');
    assert.equal(s.decision!.player, 1);
    aiAnswers(s);
    s = choose(s, pays ? 'yes' : 'no');
    if (pays) assert.equal(s.players[1].donActive, 1);
    else {
      s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
      assert.equal(power(s, theirs(s, O_STUSSY).uid), 3000);
    }
    assert.ok(mine(s, 'OP15-059').rested);
    coherent(noCounter(s));
  }
});

test('Ener (OP15-060) : +2000 et protégé avec 6 DON!! ou moins ; DON!! −1 : [Bloqueur] jusqu’au prochain tour adverse, puis défausser 1', () => {
  let s = scenario([ENEL, 'ST-21'], (g) => { setHand(g, 0, ['OP15-063']); setChars(g, 0, [{ num: 'OP15-060' }]); enelDon(g, 2); });
  assert.equal(power(s, mine(s, 'OP15-060').uid), 10000);
  s = act(s, `act:${mine(s, 'OP15-060').uid}`);
  assert.equal(hasBlocker(s, 0, mine(s, 'OP15-060')), true);
  assert.equal(s.players[0].hand.length, 0, '1 carte défaussée');
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-060' }]); setDon(g, 0, 7); });
  assert.equal(power(s, mine(s, 'OP15-060').uid), 8000, '7 DON!! sur le terrain');
});

test('Gedatsu : [Jouée] DON!! −1 pour piocher ; [En cas de KO] avec 6 DON!! ou moins, KO de 2000 ou moins ; Garde sacrée : [Bloqueur]', () => {
  let s = scenario([ENEL, 'ST-21'], (g) => { setHand(g, 0, ['OP15-063']); enelDon(g, 3); });
  s = choose(play(s, 'OP15-063'), 'yes');
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
  s = scenario([ENEL, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-063', extra: { rested: true } }, { num: 'OP15-068' }]); enelDon(g, 0); setChars(g, 1, [{ num: O_STUSSY }, { num: O_SENTOMARU }]); }, 1);
  assert.equal(hasBlocker(s, 0, mine(s, 'OP15-068')), true);
  s = noCounter(noBlock(attack(s, theirs(s, O_STUSSY).uid, mine(s, 'OP15-063').uid)));
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.equal(theirs(s, O_SENTOMARU), undefined);
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-068' }]); setDon(g, 0, 7); });
  assert.equal(hasBlocker(s, 0, mine(s, 'OP15-068')), false, '7 DON!!');
});

test('Kotori et Hotori : DON!! −2 et s’épuiser, effet seulement avec les deux autres du trio', () => {
  let s = scenario([ENEL, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP15-064' }, { num: 'OP15-072' }, { num: 'OP15-066' }]);
    enelDon(g, 4);
    setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]);
  });
  s = act(s, `act:${mine(s, 'OP15-064').uid}`);
  expectTag(s, 'oppRest');
  assert.equal(hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), false, '6000');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(theirs(s, O_STUSSY).rested);
  s = choose(act(s, `act:${mine(s, 'OP15-072').uid}`), `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 3000);
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
  s = scenario([ENEL, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-064' }, { num: 'OP15-066' }]); enelDon(g, 2); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = act(s, `act:${mine(s, 'OP15-064').uid}`);
  assert.notEqual(s.decision?.tag, 'oppRest', 'pas de Hotori');
});

test('Nora : à la place d’un Personnage de 7000 de base ou moins retiré par un effet adverse, renvoyer 1 DON!!', () => {
  let s = scenario([ENEL, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP15-069' }, { num: 'OP15-063' }]);
    enelDon(g, 0, 2);
    setHand(g, 1, [O_MOLE]);
    setDon(g, 1, 4);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = play(s, O_MOLE, 1);
  s = choose(s, 'none');
  s = choose(s, `card:${mine(s, 'OP15-063').uid}`);
  expectTag(s, 'replace');
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'OP15-063'));
  assert.equal(s.players[0].donRested, 1);
  coherent(s);
});

test('Fuza : lui et ses [Shura] ont [Imblocable] ; pendant le tour adverse, leur puissance de base devient 6000 ; Yama joue une [Garde sacrée]', () => {
  let s = scenario([ENEL, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-070' }, { num: 'OP15-067' }, { num: 'OP15-066' }]); enelDon(g, 0); }, 1);
  assert.equal(power(s, mine(s, 'OP15-070').uid), 6000);
  assert.equal(power(s, mine(s, 'OP15-067').uid), 6000);
  assert.equal(hasKeyword(s, 0, mine(s, 'OP15-067'), 'Unblockable'), true);
  assert.equal(hasKeyword(s, 0, mine(s, 'OP15-066'), 'Unblockable'), false, 'Satori');
  s = scenario([ENEL, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-070' }]); enelDon(g, 0); });
  assert.equal(power(s, mine(s, 'OP15-070').uid), 4000, 'son tour');

  s = scenario([ENEL, 'ST-21'], (g) => { setHand(g, 0, ['OP15-073', 'OP15-068', 'OP15-060']); enelDon(g, 3); });
  s = play(s, 'OP15-073');
  assert.deepEqual(s.decision!.options.map((o) => o.label.split(' (')[0]), ['Garde sacrée', 'Aucune']);
  s = choose(s, (o) => o.label.startsWith('Garde sacrée'));
  assert.ok(mine(s, 'OP15-068'));
  coherent(s);
});

// ---------- Dracule Mihawk ----------

test('Off-White : [Contre] +4000, puis un Personnage {Équipage de Don Quijote} parmi 3 cartes', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['EB01-019']); setDeckTop(g, 0, ['OP12-027', 'OP05-024', 'OP10-040']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = choose(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid), (o) => o.id.startsWith('cevent:'));
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Kuween', 'Aucune']);
  s = noCounter(keepOrder(choose(s, (o) => o.label === 'Kuween')));
  assert.ok(logHas(s, 'repoussée'));
  coherent(s);
});

test('Crocodile (OP09-025) : avec un Leader {ODYSSEY}, pas mis KO en combat par un Leader', () => {
  for (const deck of [ODYSSEY, MIHAWK]) {
    let s = scenario([deck, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP09-025', extra: { rested: true } }]); g.players[1].leader.don = 2; setDon(g, 1, 0); }, 1);
    s = noCounter(attack(s, s.players[1].leader.uid, mine(s, 'OP09-025').uid));
    assert.equal(Boolean(mine(s, 'OP09-025')), deck === ODYSSEY);
  }
});

test('Doflamingo (OP09-031) : se redresse en fin de tour avec 2 Personnages épuisés ; Mihawk (OP10-029) redresse un {ODYSSEY}', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP09-031', extra: { rested: true } }, { num: 'OP10-036', extra: { rested: true } }]); });
  s = act(s, 'end');
  assert.equal(mine(s, 'OP09-031').rested, false);
  s = scenario([MIHAWK, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP09-031', extra: { rested: true } }]); });
  s = act(s, 'end');
  assert.equal(mine(s, 'OP09-031').rested, true, 'un seul Personnage épuisé');

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP10-029']); setDon(g, 0, 5); setChars(g, 0, [{ num: 'OP10-036', extra: { rested: true } }, { num: 'OP12-027', extra: { rested: true } }]); });
  s = play(s, 'OP10-029');
  expectTag(s, 'ownReady');
  assert.equal(hasOption(s, `card:${mine(s, 'OP12-027').uid}`), false, 'Koshiro n’est pas {ODYSSEY}');
  s = choose(s, `card:${mine(s, 'OP10-036').uid}`);
  assert.equal(mine(s, 'OP10-036').rested, false);
  coherent(s);
});

test('« Les faibles... » et « Je passe juste le temps » : KO d’un Personnage épuisé ; « Pour espérer me surpasser, Zoro !! » : épuiser 1 carte pour +4000', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP10-040']); setDon(g, 0, 5); setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }, { num: O_STUSSY }]); });
  s = play(s, 'OP10-040');
  assert.equal(hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), false, 'redressé');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 1);

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP14-037']); setDon(g, 0, 4); setChars(g, 0, [{ num: 'OP12-027' }, { num: 'OP12-031' }]); setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]); });
  s = choose(play(s, 'OP14-037'), 'yes');
  while (s.decision?.tag === 'restCost') s = choose(s, (o) => o.id.startsWith('card:') || o.id === 'don');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP14-036']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP12-027' }]); setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 2 } }]); setDon(g, 1, 0); }, 1);
  s = choose(noBlock(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid)), (o) => o.id.startsWith('cevent:'));
  s = choose(s, 'yes');
  s = noCounter(choose(s, `card:${mine(s, 'OP12-027').uid}`));
  assert.ok(mine(s, 'OP12-027').rested);
  assert.ok(logHas(s, 'repoussée (8000 contre 9000)'));
  coherent(s);
});

test('Mihawk (OP12-030) : redresser 4 DON!!, puis plus de Personnage de coût de base 7 ou plus ce tour-ci', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP12-030', 'OP14-119', 'OP12-027']); setDon(g, 0, 8, 2); });
  s = play(s, 'OP12-030');
  assert.equal(s.players[0].donActive, 4);
  assert.equal(s.decision!.options.some((o) => o.id.startsWith('play:') && s.players[0].hand.find((c) => c.uid === o.uid)?.num === 'OP14-119'), false, 'coût 9');
  assert.ok(s.decision!.options.some((o) => o.id.startsWith('play:') && s.players[0].hand.find((c) => c.uid === o.uid)?.num === 'OP12-027'));
  coherent(s);
});

test('Mihawk (OP14-119) : épuisé pendant son tour, bloque un Personnage adverse ; [Attaque adverse] défausser 1 carte : +2000', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP14-119' }]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = attack(s, mine(s, 'OP14-119').uid, s.players[1].leader.uid);
  expectTag(s, 'oppLock');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(canBeRested(s, theirs(s, O_CHOPPER).uid), false);
  coherent(noCounter(s));
  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP12-027']); setChars(g, 0, [{ num: 'OP14-119' }]); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  s = choose(s, 'yes');
  s = noCounter(noBlock(choose(s, `card:${s.players[0].leader.uid}`)));
  assert.ok(logHas(s, 'repoussée (6000 contre 7000)'));
  coherent(s);
});

test('Mihawk (OP15-027), Kuma (OP15-029), Hancock (OP16-032), Mihawk (ST12-003)', () => {
  let s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP15-027']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 1 } }, { num: O_STUSSY }]); });
  s = play(s, 'OP15-027');
  assert.equal(hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), false, 'sans DON!!');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(theirs(s, O_CHOPPER).rested);

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP15-029']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }, { num: 'ST21-014' }]); });
  s = play(s, 'OP15-029');
  assert.ok(hasOption(s, `card:${theirs(s, 'ST21-014').uid}`), 'Luffy : coût 5');
  s = choose(s, `card:${theirs(s, 'ST21-014').uid}`);
  assert.equal(canBeRested(s, theirs(s, 'ST21-014').uid), false);
  coherent(s);

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['OP16-032']); setDon(g, 0, 7); setChars(g, 1, [{ num: O_CHOPPER }, { num: 'ST21-014' }]); });
  s = play(s, 'OP16-032');
  assert.equal(hasOption(s, `card:${theirs(s, 'ST21-014').uid}`), false, 'pas Monkey D. Luffy');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(hasMod(s, theirs(s, O_CHOPPER).uid, 'cantRest'));
  assert.ok(hasKeyword(s, 0, mine(s, 'OP16-032'), 'Unblockable'));
  coherent(s);

  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['ST12-003', 'OP12-027', 'OP12-031']); setDon(g, 0, 3); setChars(g, 0, [{ num: 'OP10-036' }]); });
  s = play(s, 'ST12-003');
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.label.startsWith('Koshiro'));
  assert.ok(mine(s, 'OP12-027').rested);
  coherent(s);
  s = scenario([MIHAWK, 'ST-21'], (g) => { setHand(g, 0, ['ST12-003', 'OP12-027']); setDon(g, 0, 3); setChars(g, 0, [{ num: 'OP10-036' }, { num: 'OP09-025' }]); });
  s = play(s, 'ST12-003');
  assert.notEqual(s.decision?.tag, 'playFree', '3 Personnages');
});
