// OP03 noire (tâche 1.12 du plan « Aventure ») : une situation par carte, condition vraie et fausse. Trois decks d'essai
// faits des cartes noires d'OP03 (3 exemplaires de chacune) : au Leader Rob Lucci ({CP9}), au Leader Charlotte Linlin, et
// au Leader Luffy de ST-21 pour les conditions « Leader CP » fausses. L'adversaire joue ST-21, ou le deck noir quand il
// lui faut un Lieu.
import assert from 'node:assert/strict';
import test from 'node:test';
import { OP03_NOIRE } from '../engine/cards/op03-noire.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { addMod, canBeKO, def, fieldCost, hasKeyword } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand,
  setLife, take, takeField,
} from './helpers.ts';

const LUCCI_L = 'OP03-076';
const LINLIN_L = 'OP03-077';
const ISSHO = 'OP03-078';
const VERGO = 'OP03-079';
const KAKU = 'OP03-080';
const KALIFA = 'OP03-081';
const KUMADORI = 'OP03-082';  // coût 4, {CP9}, sans effet
const CORGY = 'OP03-083';
const JABRA = 'OP03-085';     // coût 5, {CP9}, sans effet
const SPANDAM = 'OP03-086';
const NERO = 'OP03-087';      // coût 3, {CP9}, sans effet
const FUKUROU = 'OP03-088';
const BRANNEW = 'OP03-089';
const BLUENO = 'OP03-090';
const HELMEPPO = 'OP03-091';
const LUCCI = 'OP03-092';
const WANZE = 'OP03-093';
const AIR_DOOR = 'OP03-094';
const SOAP = 'OP03-095';
const TEMPEST = 'OP03-096';
const GUN = 'OP03-097';
const ENIES = 'OP03-098';

const LEADERS = [LUCCI_L, LINLIN_L];
const cards = Object.fromEntries([...Object.keys(OP03_NOIRE), KUMADORI, 'OP03-084', JABRA, NERO].filter((n) => !LEADERS.includes(n)).map((n) => [n, 3]));
const LUCCI_DECK = 'TEST-OP03-LUCCI';
const LINLIN_DECK = 'TEST-OP03-LINLIN';
const PLAIN = 'TEST-OP03-LUFFY';
DECKS[LUCCI_DECK] = { id: LUCCI_DECK, name: 'Essai', series: 'TEST', leader: LUCCI_L, cards };
DECKS[LINLIN_DECK] = { id: LINLIN_DECK, name: 'Essai', series: 'TEST', leader: LINLIN_L, cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// adversaire ST-21
const O_BONNEY = 'ST21-004';     // coût 1, 3000, effet [En cas de KO]
const O_JINBE = 'ST21-005';      // coût 2, 4000, sans effet
const O_STUSSY = 'ST21-006';     // coût 3, 5000, sans effet
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_CHOPPER = 'ST21-008';    // coût 4, 6000, sans effet
const O_VEGAPUNK = 'ST21-013';   // coût 1, 3000, sans effet

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const leader = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const anyCard = (s: GameState) => choose(s, (o) => o.id.startsWith('card:'));
const toTrash = (g: GameState, p: PlayerId, nums: string[]) => { for (const n of nums) g.players[p].trash.push(take(g, p, n)); };
const inTrash = (s: GameState, p: PlayerId, num: string) => s.players[p].trash.some((c) => c.num === num);
// défausses demandées au joueur p (une question à une seule réponse est répondue d'office)
function discards(s: GameState, p: PlayerId = 0) {
  while (s.decision?.tag === 'discard' && s.decision.player === p) s = anyCard(s);
  return s;
}
// cartes de la Défausse placées sous le deck (coût de Kaku et Rob Lucci), dans l'ordre affiché
function trashToDeck(s: GameState) {
  while (s.decision?.tag === 'trashToDeck') s = anyCard(s);
  return keepOrder(s);
}
const noMay = (s: GameState) => assert.notEqual(s.decision?.tag, 'may', `question inattendue : ${s.decision?.prompt}`);

test('Rob Lucci (Leader) : pendant son tour, un Personnage adverse mis KO alors qu’il est épuisé : défausser 2 cartes pour le redresser, une fois par tour', () => {
  const setup = (g: GameState) => {
    setHand(g, 0, [KUMADORI, JABRA, NERO]);
    setChars(g, 1, [{ num: O_JINBE, extra: { rested: true } }, { num: O_STUSSY, extra: { rested: true } }]);
    setHand(g, 1, []);
    setDon(g, 0, 0);
  };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup);
  s = noCounter(attack(s, leader(s, 0), theirs(s, O_JINBE).uid));
  assert.ok(inTrash(s, 1, O_JINBE));
  expectTag(s, 'may');
  aiAnswers(s);
  s = discards(choose(s, 'yes'));
  assert.equal(s.players[0].leader.rested, false, 'Leader redressé');
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
  // second KO du tour : plus rien (une fois par tour)
  s = noCounter(attack(s, leader(s, 0), theirs(s, O_STUSSY).uid));
  assert.ok(inTrash(s, 1, O_STUSSY));
  noMay(s);
  assert.equal(s.players[0].leader.rested, true);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);

  // refusé : le Leader reste épuisé, et l'effet n'est pas compté
  s = scenario([LUCCI_DECK, 'ST-21'], setup);
  s = choose(noCounter(attack(s, leader(s, 0), theirs(s, O_JINBE).uid)), 'no');
  assert.equal(s.players[0].leader.rested, true);
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.players[0].leader.usedOpt.length, 0);
});

test('Wanze : défausser 1 carte : avec un Leader « CP », KO d’un Personnage de coût 1 ou moins (Rob Lucci redressé : rien) ; sans Leader « CP » : pas de question', () => {
  const setup = (g: GameState) => {
    setHand(g, 0, [WANZE, KUMADORI]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: O_BONNEY }, { num: O_JINBE }]);
  };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup);
  s = play(s, WANZE);
  expectTag(s, 'may');
  s = discards(choose(s, 'yes'));
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_JINBE).uid}`), false, 'coût 2');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  assert.ok(inTrash(s, 1, O_BONNEY));
  noMay(s);  // Leader Rob Lucci redressé : son effet ne se déclenche pas
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);

  s = scenario([PLAIN, 'ST-21'], setup);
  s = play(s, WANZE);
  noMay(s);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[1].chars.length, 2);
  coherent(s);
});

test('Charlotte Linlin (Leader) : [DON!! x2] [En attaquant] ② et défausser 1 : avec 1 Vie ou moins, +1 Vie depuis le deck', () => {
  const setup = (don: number, life: number) => (g: GameState) => {
    g.players[0].leader.don = don;
    setLife(g, 0, [KUMADORI, JABRA].slice(0, life));
    setHand(g, 0, [NERO]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setDon(g, 0, 2);
  };
  let s = scenario([LINLIN_DECK, 'ST-21'], setup(2, 1));
  const top = s.players[0].deck[0].uid;
  s = attack(s, leader(s, 0), leader(s, 1));
  expectTag(s, 'may');
  aiAnswers(s);
  s = discards(choose(s, 'yes'));
  assert.equal(s.players[0].life.length, 2);
  assert.equal(s.players[0].life[0].uid, top, 'la carte du dessus du deck');
  assert.equal(s.players[0].donActive, 0);
  assert.equal(s.players[0].hand.length, 0);
  coherent(noCounter(s));

  // refusé : rien
  s = scenario([LINLIN_DECK, 'ST-21'], setup(2, 1));
  s = choose(attack(s, leader(s, 0), leader(s, 1)), 'no');
  assert.equal(s.players[0].life.length, 1);
  assert.equal(s.players[0].donActive, 2);
  // 2 Vies, ou 1 seule DON!! donnée : pas de question
  for (const [don, life] of [[2, 2], [1, 1]]) {
    s = scenario([LINLIN_DECK, 'ST-21'], setup(don, life));
    s = attack(s, leader(s, 0), leader(s, 1));
    noMay(s);
    assert.equal(s.players[0].life.length, life);
    coherent(noCounter(s));
  }
});

test('Issho : [Jouée] l’adversaire à 6 cartes ou plus en défausse 2 au hasard ; [DON!! x1] [Votre tour] −3 de coût aux Personnages adverses', () => {
  const FILL = [O_BONNEY, O_JINBE, O_STUSSY, O_CHOPPER, O_SENTOMARU, O_VEGAPUNK];
  for (const n of [6, 5]) {
    let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [ISSHO]); setDon(g, 0, 8); setHand(g, 1, FILL.slice(0, n)); });
    const trash = s.players[1].trash.length;
    s = play(s, ISSHO);
    assert.equal(s.players[1].hand.length, n === 6 ? 4 : 5);
    assert.equal(s.players[1].trash.length, trash + (n === 6 ? 2 : 0));
    coherent(s);
  }
  const aura = (don: number, active: PlayerId) => {
    const s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setChars(g, 0, [{ num: ISSHO, extra: { don } }]); setDon(g, 0, 0); setChars(g, 1, [{ num: O_STUSSY }]); }, active);
    coherent(s);
    return fieldCost(s, theirs(s, O_STUSSY).uid);
  };
  assert.equal(aura(1, 0), 0);
  assert.equal(aura(0, 0), 3, 'sans DON!! donnée');
  assert.equal(aura(1, 1), 3, 'pendant le tour adverse');
});

test('Vergo : [DON!! x1] ne peut pas être mis KO en combat ; Fukurou : ne peut pas être mis KO par des effets', () => {
  const s = scenario([LUCCI_DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: VERGO, extra: { don: 1 } }, { num: VERGO }, { num: FUKUROU }]);
    setDon(g, 0, 0);
  });
  const [vergo1, vergo0, fukurou] = s.players[0].chars.map((c) => c.uid);
  assert.equal(canBeKO(s, vergo1, 'battle', 1), false);
  assert.equal(canBeKO(s, vergo1, 'effect', 1), true);
  assert.equal(canBeKO(s, vergo0, 'battle', 1), true, 'sans DON!! donnée');
  assert.equal(canBeKO(s, fukurou, 'effect', 1), false);
  assert.equal(canBeKO(s, fukurou, 'battle', 1), true);
  assert.ok(hasKeyword(s, 0, s.players[0].chars[2], 'Blocker'));
});

test('Kaku : placer 2 cartes « CP » de la Défausse sous le deck : KO d’un Personnage de coût 3 ou moins ; sans les 2 cartes ou sans cible : pas de question', () => {
  const setup = (trash: string[], opp: string[]) => (g: GameState) => {
    setHand(g, 0, [KAKU]);
    setDon(g, 0, 5);
    toTrash(g, 0, trash);
    setChars(g, 1, opp.map((num) => ({ num })));
  };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup([NERO, JABRA], [O_STUSSY, O_CHOPPER]));
  s = play(s, KAKU);
  expectTag(s, 'may');
  s = trashToDeck(choose(s, 'yes'));
  assert.deepEqual(s.players[0].deck.slice(-2).map((c) => c.num).sort(), [JABRA, NERO]);
  assert.ok(!inTrash(s, 0, NERO) && !inTrash(s, 0, JABRA));
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), false, 'coût 4');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(inTrash(s, 1, O_STUSSY));
  coherent(s);

  for (const [trash, opp] of [[[NERO], [O_STUSSY]], [[NERO, JABRA], [O_CHOPPER]]]) {
    s = play(scenario([LUCCI_DECK, 'ST-21'], setup(trash, opp)), KAKU);
    noMay(s);
    assert.equal(s.players[0].trash.length, trash.length);
    coherent(s);
  }
});

test('Kalifa : piocher 2, défausser 2, puis −2 de coût à un Personnage adverse', () => {
  let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [KALIFA]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_STUSSY }]); });
  const trash = s.players[0].trash.length;
  s = discards(play(s, KALIFA));
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].trash.length, trash + 2);
  expectTag(s, 'oppCost');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_STUSSY).uid), 1);
  coherent(s);
});

test('Corgy : regarder 5 cartes, en placer jusqu’à 2 dans la Défausse, le reste sous le deck', () => {
  for (const n of [2, 0]) {
    let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [CORGY]); setDon(g, 0, 1); setDeckTop(g, 0, [NERO, JABRA, KUMADORI, KAKU, ISSHO]); });
    const deck = s.players[0].deck.length;
    s = play(s, CORGY);
    expectTag(s, 'discard');
    aiAnswers(s);
    if (n === 2) s = choose(choose(s, (o) => o.num === NERO), (o) => o.num === JABRA);
    else s = choose(s, 'none');
    s = keepOrder(s);
    assert.equal(inTrash(s, 0, NERO), n === 2);
    assert.equal(inTrash(s, 0, JABRA), n === 2);
    assert.equal(s.players[0].deck.length, deck - n);
    assert.equal(s.players[0].deck.at(-1)!.num, ISSHO, 'le reste au-dessous');
    coherent(s);
  }
});

test('Spandam : avec un Leader « CP », une carte « CP » autre que [Spandam] parmi 3, le reste dans la Défausse ; sinon rien', () => {
  const setup = (g: GameState) => { setHand(g, 0, [SPANDAM]); setDon(g, 0, 1); setDeckTop(g, 0, [SPANDAM, KAKU, CORGY]); };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup);
  s = play(s, SPANDAM);
  expectTag(s, 'pick');
  assert.ok(!s.decision!.options.some((o) => o.num === SPANDAM || o.num === CORGY), 'ni Spandam, ni Corgy ({Gouvernement mondial})');
  s = choose(s, (o) => o.num === KAKU);
  assert.ok(s.players[0].hand.some((c) => c.num === KAKU));
  assert.ok(inTrash(s, 0, SPANDAM) && inTrash(s, 0, CORGY));
  coherent(s);

  s = scenario([PLAIN, 'ST-21'], setup);
  const top = s.players[0].deck.slice(0, 3).map((c) => c.uid);
  s = play(s, SPANDAM);
  assert.notEqual(s.decision?.tag, 'pick');
  assert.deepEqual(s.players[0].deck.slice(0, 3).map((c) => c.uid), top);
  coherent(s);
});

test('Brandnew : une carte {Marine} autre que [Brandnew] parmi 3, le reste dans la Défausse', () => {
  let s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, [BRANNEW]); setDon(g, 0, 2); setDeckTop(g, 0, [BRANNEW, KAKU, VERGO]); });
  s = play(s, BRANNEW);
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => o.num), [VERGO]);
  s = choose(s, (o) => o.num === VERGO);
  assert.ok(s.players[0].hand.some((c) => c.num === VERGO));
  assert.ok(inTrash(s, 0, BRANNEW) && inTrash(s, 0, KAKU));
  coherent(s);
});

test('Blueno : [DON!! x1] [Bloqueur] ; [En cas de KO] jouer épuisé un Personnage « CP » de coût 4 ou moins de sa Défausse', () => {
  let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setChars(g, 0, [{ num: BLUENO, extra: { don: 1 } }, { num: BLUENO }]); setDon(g, 0, 0); });
  assert.equal(hasKeyword(s, 0, s.players[0].chars[0], 'Blocker'), true);
  assert.equal(hasKeyword(s, 0, s.players[0].chars[1], 'Blocker'), false);

  s = scenario([LUCCI_DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: BLUENO, extra: { rested: true } }]);
    setHand(g, 0, []);
    toTrash(g, 0, [NERO, JABRA]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, O_CHOPPER).uid, mine(s, BLUENO).uid));
  assert.ok(inTrash(s, 0, BLUENO));
  expectTag(s, 'playFree');
  assert.ok(!s.decision!.options.some((o) => o.num === JABRA || o.num === BLUENO), 'coût 5');
  aiAnswers(s);
  s = choose(s, (o) => o.num === NERO);
  assert.equal(mine(s, NERO).rested, true);
  coherent(s);
});

test('Helmeppo : le coût d’un Personnage adverse sans effet de base devient 0 pour le tour', () => {
  let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [HELMEPPO]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_JINBE }, { num: O_SENTOMARU }, { num: O_BONNEY }]); });
  s = play(s, HELMEPPO);
  expectTag(s, 'oppCost');
  assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => o.uid), [theirs(s, O_JINBE).uid], 'Sentomaru ([Bloqueur]) et Bonney ont un texte');
  s = choose(s, `card:${theirs(s, O_JINBE).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_JINBE).uid), 0);
  coherent(s);

  s = play(scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [HELMEPPO]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_SENTOMARU }]); }), HELMEPPO);
  assert.notEqual(s.decision?.tag, 'oppCost');
  coherent(s);
});

test('Rob Lucci : placer 2 cartes « CP » de la Défausse sous le deck : [Initiative] pour le tour ; sans les 2 cartes : pas de question', () => {
  let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [LUCCI]); setDon(g, 0, 6); toTrash(g, 0, [NERO, KAKU]); });
  s = play(s, LUCCI);
  expectTag(s, 'may');
  aiAnswers(s);
  s = trashToDeck(choose(s, 'yes'));
  assert.ok(hasKeyword(s, 0, mine(s, LUCCI), 'Rush'));
  assert.ok(hasOption(s, `attack:${mine(s, LUCCI).uid}`), 'il peut attaquer ce tour-ci');
  coherent(s);

  s = play(scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [LUCCI]); setDon(g, 0, 6); toTrash(g, 0, [NERO]); }), LUCCI);
  noMay(s);
  assert.equal(hasKeyword(s, 0, mine(s, LUCCI), 'Rush'), false);
  assert.equal(hasOption(s, `attack:${mine(s, LUCCI).uid}`), false);
});

test('Air Door : avec un Leader « CP », jouer un Personnage « CP » de coût 5 ou moins parmi 5, le reste dans la Défausse ; [Déclenchement] un Personnage noir de coût 3 ou moins de la Défausse', () => {
  const setup = (g: GameState) => { setHand(g, 0, [AIR_DOOR]); setDon(g, 0, 4); setDeckTop(g, 0, [NERO, JABRA, LUCCI, CORGY, ISSHO]); };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup);
  assert.equal(def(AIR_DOOR).mainUseful!(s, 0), true);
  s = play(s, AIR_DOOR);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => o.num).sort(), [JABRA, NERO]);
  aiAnswers(s);
  s = choose(s, (o) => o.num === JABRA);
  assert.ok(mine(s, JABRA));
  for (const n of [NERO, LUCCI, CORGY, ISSHO, AIR_DOOR]) assert.ok(inTrash(s, 0, n), n);
  coherent(s);

  s = scenario([PLAIN, 'ST-21'], setup);
  assert.equal(def(AIR_DOOR).mainUseful!(s, 0), false, 'sans Leader « CP »');

  s = scenario([LUCCI_DECK, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [AIR_DOOR, KUMADORI]);
    toTrash(g, 0, [NERO, JABRA]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = choose(noCounter(attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0))), 'trigger');
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => o.num), [NERO]);
  s = choose(s, (o) => o.num === NERO);
  assert.equal(mine(s, NERO).rested, false);
  assert.ok(inTrash(s, 0, AIR_DOOR));
  coherent(s);
});

test('Soap Sheep : −2 de coût à jusqu’à 2 Personnages adverses ; [Déclenchement] l’adversaire défausse 1 carte', () => {
  let s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, [SOAP]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }, { num: O_JINBE }]); });
  s = play(s, SOAP);
  expectTag(s, 'oppCost');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.deepEqual([O_STUSSY, O_CHOPPER, O_JINBE].map((n) => fieldCost(s, theirs(s, n).uid)), [1, 2, 2]);
  coherent(s);

  s = scenario([LUCCI_DECK, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [SOAP, KUMADORI]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
    setHand(g, 1, [O_JINBE, O_STUSSY]);
  }, 1);
  s = choose(noCounter(attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0))), 'trigger');
  s = discards(s, 1);
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);
});

test('Tempest Kick Sky Slicer : KO d’un Personnage adverse de coût 0 ou du Lieu adverse de coût 3 ou moins ; [Déclenchement] piocher 2', () => {
  const setup = (g: GameState) => {
    setHand(g, 0, [TEMPEST]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: NERO }, { num: KUMADORI }]);
    g.players[1].stage = takeField(g, 1, ENIES);
    addMod(g, { uid: g.players[1].chars[0].uid, stat: 'cost', amount: -3, until: 'turn', source: 'Test' });
  };
  for (const target of ['stage', 'char'] as const) {
    let s = scenario([LUCCI_DECK, LUCCI_DECK], setup);
    assert.equal(def(TEMPEST).mainUseful!(s, 0), true);
    s = play(s, TEMPEST);
    expectTag(s, 'oppKo');
    const stage = s.players[1].stage!.uid;
    assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => Number(o.id.split(':')[1])).sort(), [theirs(s, NERO).uid, stage].sort());
    aiAnswers(s);
    s = choose(s, `card:${target === 'stage' ? stage : theirs(s, NERO).uid}`);
    assert.equal(s.players[1].stage === null || s.players[1].stage === undefined, target === 'stage');
    assert.equal(inTrash(s, 1, target === 'stage' ? ENIES : NERO), true);
    assert.equal(s.players[1].chars.length, target === 'stage' ? 2 : 1);
    coherent(s);
  }
  const s = scenario([LUCCI_DECK, 'ST-21'], (g) => { setChars(g, 1, [{ num: O_VEGAPUNK }]); });
  assert.equal(def(TEMPEST).mainUseful!(s, 0), false, 'coût 1, pas de Lieu');

  let t = scenario([LUCCI_DECK, 'ST-21'], (g) => { setHand(g, 0, []); setLife(g, 0, [TEMPEST, KUMADORI]); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  t = choose(noCounter(attack(t, theirs(t, O_CHOPPER).uid, leader(t, 0))), 'trigger');
  assert.equal(t.players[0].hand.length, 2);
  coherent(t);
});

test('Six Pouvoirs Gun : [Contre] défausser 1 carte : +3000 ; [Déclenchement] piocher 1, puis KO d’un Personnage de coût 1 ou moins', () => {
  const setup = (hand: string[]) => (g: GameState) => { setHand(g, 0, hand); setDon(g, 0, 0); setChars(g, 1, [{ num: O_CHOPPER }]); };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup([GUN, KUMADORI]), 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0));
  assert.equal(def(GUN).counterPower!(s, 0, leader(s, 0)), 3000);
  s = choose(s, `cevent:${s.players[0].hand.find((c) => c.num === GUN)!.uid}`);
  expectTag(s, 'may');
  s = noCounter(discards(choose(s, 'yes')));
  assert.ok(logHas(s, 'repoussée (6000 contre 8000)'));
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);

  s = scenario([LUCCI_DECK, 'ST-21'], setup([GUN]), 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0));
  assert.equal(def(GUN).counterPower!(s, 0, leader(s, 0)), 0, 'rien à défausser');

  s = scenario([LUCCI_DECK, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [GUN, KUMADORI]);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_VEGAPUNK }, { num: O_JINBE }]);
  }, 1);
  s = choose(noCounter(attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0))), 'trigger');
  assert.equal(s.players[0].hand.length, 1);
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.filter((o) => o.id !== 'none').map((o) => o.uid), [theirs(s, O_VEGAPUNK).uid]);
  s = choose(s, `card:${theirs(s, O_VEGAPUNK).uid}`);
  assert.ok(inTrash(s, 1, O_VEGAPUNK));
  coherent(s);
});

test('Enies Lobby : épuiser ce Lieu : avec un Leader « CP », −2 de coût à un Personnage adverse ; sinon l’effet ne sert à rien', () => {
  const setup = (g: GameState) => { g.players[0].stage = takeField(g, 0, ENIES); setDon(g, 0, 0); setChars(g, 1, [{ num: O_STUSSY }]); };
  let s = scenario([LUCCI_DECK, 'ST-21'], setup);
  const stage = s.players[0].stage!;
  assert.equal(def(ENIES).activateMain!.useful!(s, 0, stage), true);
  s = act(s, `act:${stage.uid}`);
  expectTag(s, 'oppCost');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_STUSSY).uid), 1);
  assert.equal(s.players[0].stage!.rested, true);
  assert.equal(hasOption(s, `act:${stage.uid}`), false, 'déjà épuisé');
  coherent(s);

  s = scenario([PLAIN, 'ST-21'], setup);
  assert.equal(def(ENIES).activateMain!.useful!(s, 0, s.players[0].stage!), false);
});
