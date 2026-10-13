// Deck pour débutant EX Ace & Newgate (ST-22) : un test par carte à effet, condition vraie et condition fausse. Toutes
// les cartes du deck sont « Équipage de Barbe Blanche » : un deck d'essai mêlé de cartes d'ailleurs sert pour les
// conditions fausses (comme un deck personnalisé).
import assert from 'node:assert/strict';
import test from 'node:test';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { knows, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const DECK = 'ST-22';
const IZO = 'ST22-002';
const NEWGATE = 'ST22-003';
const ELMY = 'ST22-004';
const ODEN = 'ST22-005';
const JOZ = 'ST22-006';
const SQUARD = 'ST22-007';
const VISTA = 'ST22-009';
const WHITEY = 'ST22-011';
const MARCO = 'ST22-012';
const IAM = 'ST22-015';        // « Je suis "Barbe Blanche" !! »
const TAKEBACK = 'ST22-016';   // « Retire immédiatement... »
const FIREFIST = 'ST22-017';   // Poing ardent
const OTHER = 'ST21-005';      // Jinbe (ST-21) : pas « Équipage de Barbe Blanche »
// adversaire ST-21
const CHOPPER = 'ST21-008';    // coût 4, 6000
const SENTOMARU = 'ST21-007';  // coût 2
const MOLE = 'ST21-017';       // −5000, puis KO 2000 ou moins avec un Personnage de 6000

// deck d'essai : Leader Luffy (pas « Équipage de Barbe Blanche ») et cartes de ST-22 mêlées à des Jinbe
const TEST = 'TEST-ST22';
DECKS[TEST] = {
  id: TEST, name: 'Essai', series: 'TEST', leader: 'ST21-001',
  cards: { [NEWGATE]: 4, [JOZ]: 4, [SQUARD]: 4, [WHITEY]: 4, [MARCO]: 4, [IAM]: 4, [TAKEBACK]: 4, [FIREFIST]: 4, [OTHER]: 4, [ELMY]: 14 },
};

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const weaken = (s: GameState, uid: number, amount: number) => s.mods.push({ uid, stat: 'power', amount: -amount, until: 'turn', source: 'essai' });

test('Leader Ace et Newgate : révéler une carte « Équipage de Barbe Blanche », piocher 1, la carte révélée au-dessus du deck', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [MARCO]);
    setDeckTop(g, 0, [VISTA]);
  });
  const marco = s.players[0].hand[0].uid;
  s = act(s, `act:${s.players[0].leader.uid}`);
  expectTag(s, 'revealCost');
  s = choose(s, `card:${marco}`);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [VISTA]);
  assert.equal(s.players[0].deck[0].uid, marco, 'Marco au-dessus du deck');
  assert.ok(knows(s, 1, marco), 'l’adversaire sait quelle carte est au-dessus');
  assert.equal(hasOption(s, `act:${s.players[0].leader.uid}`), false, 'une fois par tour');
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => { setHand(g, 0, []); });
  assert.equal(hasOption(s, `act:${s.players[0].leader.uid}`), false, 'aucune carte à révéler');
});

test('Izo : [Jouée] 5 cartes, une « Équipage de Barbe Blanche » autre qu’Izo ; [Attaque adverse] se défausser : piocher 1, 1 carte sous le deck', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [IZO]);
    setDeckTop(g, 0, [IZO, ELMY, VISTA, ODEN, JOZ]);
    setDon(g, 0, 2);
  });
  s = play(s, IZO);
  expectTag(s, 'pick');
  assert.equal(s.decision!.options.some((o) => o.label === 'Izo'), false, 'pas un autre Izo');
  s = keepOrder(choose(s, (o) => o.label === 'Oden Kozuki'));
  assert.ok(s.players[0].hand.some((c) => c.num === ODEN));
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [ELMY]);
    setDeckTop(g, 0, [VISTA]);
    setChars(g, 0, [{ num: IZO }]);
    setChars(g, 1, [{ num: CHOPPER }]);
  }, 1);
  s = attack(s, theirs(s, CHOPPER).uid, s.players[0].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  s = choose(s, (o) => o.label === 'Elmy');
  assert.ok(s.players[0].trash.some((c) => c.num === IZO));
  assert.ok(s.players[0].hand.some((c) => c.num === VISTA), 'Vista piochée');
  assert.equal(s.players[0].hand.some((c) => c.num === ELMY), false);
  assert.equal(s.players[0].deck.at(-1)!.num, ELMY, 'Elmy au-dessous du deck');
  coherent(s);
});

test('Edward Newgate et Joz : [Jouée] révéler la carte du dessus ; si « Équipage de Barbe Blanche », piocher (et défausser)', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [NEWGATE]);
    setDeckTop(g, 0, [VISTA]);
    setDon(g, 0, 9);
  });
  s = play(s, NEWGATE);
  assert.equal(s.players[0].hand.length, 2);
  assert.ok(knows(s, 1, s.players[0].hand[0].uid), 'la carte révélée puis piochée reste connue');
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, [NEWGATE]);
    setDeckTop(g, 0, [OTHER]);
    setDon(g, 0, 9);
  });
  s = play(s, NEWGATE);
  assert.equal(s.players[0].hand.length, 0, 'Jinbe (ST-21) : rien');
  assert.equal(s.players[0].deck[0].num, OTHER, 'la carte révélée reste au-dessus');

  s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [JOZ]);
    setDeckTop(g, 0, [VISTA, ELMY]);
    setDon(g, 0, 7);
  });
  s = play(s, JOZ);
  expectTag(s, 'discard');
  s = choose(s, (o) => o.label === 'Vista');
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [ELMY]);
  coherent(s);
});

test('Oden Kozuki : défausser 2 cartes plutôt que quitter le terrain ; s’épuiser 3 DON!! et renvoyer un Personnage pour se redresser', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [ELMY, VISTA, JOZ]);
    setChars(g, 0, [{ num: ODEN }]);
    setHand(g, 1, [MOLE]);
    setDon(g, 1, 4);
    setChars(g, 1, [{ num: CHOPPER }]);
  }, 1);
  weaken(s, mine(s, ODEN).uid, 6000);
  s = play(s, MOLE, 1);
  s = choose(s, 'none');
  s = choose(s, `card:${mine(s, ODEN).uid}`);
  expectTag(s, 'replace');
  s = choose(s, (o) => o.id.startsWith('replace:'));
  s = choose(s, (o) => o.label === 'Elmy');
  s = choose(s, (o) => o.label === 'Vista');
  assert.ok(mine(s, ODEN), 'Oden reste');
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [JOZ]);
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: ODEN, extra: { rested: true } }, { num: VISTA }, { num: ELMY }]);
    setDon(g, 0, 3);
  });
  s = act(s, `act:${mine(s, ODEN).uid}`);
  expectTag(s, 'returnOwn');
  assert.equal(hasOption(s, `card:${mine(s, ODEN).uid}`), false, 'pas Oden lui-même');
  s = choose(s, `card:${mine(s, VISTA).uid}`);
  assert.equal(mine(s, ODEN).rested, false);
  assert.equal(s.players[0].donActive, 0);
  assert.ok(s.players[0].hand.some((c) => c.num === VISTA));
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: ODEN, extra: { rested: true } }]);
    setDon(g, 0, 3);
  });
  assert.equal(hasOption(s, `act:${mine(s, ODEN).uid}`), false, 'aucun autre Personnage à renvoyer');
});

test('Squardo : [Une fois par tour] révéler la carte du dessus ; si « Équipage de Barbe Blanche », 1 DON!! épuisée', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: SQUARD }]);
    setDeckTop(g, 0, [VISTA]);
    setDon(g, 0, 1, 2);
  });
  s = act(s, `act:${mine(s, SQUARD).uid}`);
  expectTag(s, 'donTarget');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(hasOption(s, `act:${mine(s, SQUARD).uid}`), false);
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: SQUARD }]);
    setDeckTop(g, 0, [OTHER]);
    setDon(g, 0, 1, 2);
  });
  s = act(s, `act:${mine(s, SQUARD).uid}`);
  assert.notEqual(s.decision?.tag, 'donTarget');
  assert.equal(s.players[0].leader.don, 0);
});

test('Whitey Bay : [Votre tour] [Jouée] révéler 2 cartes « Équipage de Barbe Blanche » : Leader « Équipage de Barbe Blanche » +2000', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [WHITEY, MARCO, ELMY]);
    setDon(g, 0, 1);
  });
  s = play(s, WHITEY);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  s = choose(s, (o) => o.label === 'Marco');  // Elmy, seule carte restante, est révélée d'office
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  assert.ok(s.players[0].hand.every((c) => knows(s, 1, c.uid)), 'cartes révélées');
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, [WHITEY, MARCO, ELMY]);
    setDon(g, 0, 1);
  });
  s = play(s, WHITEY);
  if (s.decision?.tag === 'may') s = choose(choose(s, 'yes'), (o) => o.label === 'Marco');
  assert.equal(power(s, s.players[0].leader.uid), 5000, 'Leader Luffy : rien');
});

test('Marco (ST22-012) : [Une fois par tour] défausser 1 carte plutôt qu’être mis KO par un effet ; [En attaquant] révéler : +1000', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [ELMY, VISTA]);
    setChars(g, 0, [{ num: MARCO }]);
    setHand(g, 1, [MOLE, MOLE]);
    setDon(g, 1, 8);
    setChars(g, 1, [{ num: CHOPPER }]);
  }, 1);
  weaken(s, mine(s, MARCO).uid, 3000);
  s = play(s, MOLE, 1);
  s = choose(s, 'none');
  s = choose(s, `card:${mine(s, MARCO).uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  s = choose(s, (o) => o.label === 'Elmy');
  assert.ok(mine(s, MARCO));
  s = play(s, MOLE, 1);
  s = choose(s, 'none');
  s = choose(s, `card:${mine(s, MARCO).uid}`);
  assert.notEqual(s.decision?.tag, 'replace', 'une fois par tour');
  assert.equal(mine(s, MARCO), undefined);
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: MARCO }]);
    setDeckTop(g, 0, [VISTA]);
  });
  s = attack(s, mine(s, MARCO).uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, MARCO).uid), 6000);
  s = scenario([TEST, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: MARCO }]);
    setDeckTop(g, 0, [OTHER]);
  });
  s = attack(s, mine(s, MARCO).uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, MARCO).uid), 5000);
});

test('« Je suis "Barbe Blanche" !! » : jouer Edward Newgate avec un Leader « Équipage de Barbe Blanche », puis Vie en main : Leader +2000', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [IAM, NEWGATE]);
    setLife(g, 0, [ELMY, VISTA, JOZ]);
    setDon(g, 0, 8);
  });
  s = play(s, IAM);
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.label.startsWith('Edward Newgate'));
  expectTag(s, 'lifeToHand');
  s = choose(s, 'bottom');
  assert.ok(mine(s, NEWGATE));
  assert.equal(s.players[0].hand[0].num, JOZ, 'carte du dessous de la Vie (puis Newgate pioche 2)');
  assert.equal(power(s, s.players[0].leader.uid), 7000);
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, [IAM, NEWGATE]);
    setDon(g, 0, 8);
  });
  s = play(s, IAM);
  assert.notEqual(s.decision?.tag, 'playFree', 'Leader Luffy : pas de Newgate');
  s = choose(s, 'no');
  assert.equal(power(s, s.players[0].leader.uid), 5000);
});

test('« Retire immédiatement... » : [Contre] révéler ; si « Équipage de Barbe Blanche », +4000 ; [Déclenchement] piocher 1', () => {
  const setup = (deck: string, top: string) => scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, [TAKEBACK]);
    setDeckTop(g, 0, [top]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: CHOPPER }]);
  }, 1);
  let s = setup(DECK, VISTA);
  s = attack(s, theirs(s, CHOPPER).uid, s.players[0].leader.uid);
  const life = s.players[0].life.length;
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.ok(logHas(s, 'repoussée (6000 contre 9000)'));
  assert.equal(s.players[0].life.length, life);
  coherent(s);
  s = setup(TEST, OTHER);
  s = attack(s, theirs(s, CHOPPER).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.equal(logHas(s, 'gagne +4000'), false);
  assert.equal(s.players[0].life.length, life - 1);
});

test('Poing ardent : révéler 2 cartes : piocher 1, puis un Personnage de coût 5 ou moins sous le deck ; [Déclenchement] coût 3 ou moins en main', () => {
  let s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [FIREFIST, MARCO, ELMY]);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: CHOPPER }]);
  });
  s = play(s, FIREFIST);
  s = choose(s, 'yes');
  s = choose(s, (o) => o.label === 'Marco');
  assert.equal(s.players[0].hand.length, 3);
  expectTag(s, 'oppRemove');
  s = choose(s, `card:${theirs(s, CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[1].deck.at(-1)!.num, CHOPPER);
  coherent(s);

  s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, [FIREFIST, MARCO]);
    setDon(g, 0, 5);
  });
  s = play(s, FIREFIST);
  assert.notEqual(s.decision?.tag, 'may', 'une seule carte à révéler');

  s = scenario([DECK, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [FIREFIST, ELMY]);
    setChars(g, 1, [{ num: CHOPPER }, { num: SENTOMARU }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  assert.equal(hasOption(s, `card:${theirs(s, CHOPPER).uid}`), false, 'coût 4');
  s = choose(s, `card:${theirs(s, SENTOMARU).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === SENTOMARU));
  coherent(s);
});
