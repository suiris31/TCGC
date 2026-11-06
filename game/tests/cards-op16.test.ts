// OP16 (étape C, tâche S2) : cartes codées à la main, morceaux « manual » des recettes, et recettes que le banc d'essai
// ne sait pas vérifier ([Contre] « pendant ce combat », coût « épuisez ce Lieu », [En attaquant]...). Un test par effet,
// condition vraie et condition fausse. Aucun texte de carte : des numéros et des valeurs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardStatus } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { playableErrors } from '../engine/deckRules.ts';
import { act } from '../engine/engine.ts';
import { basePower, fieldCost, hasKeyword, isNegated, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const deck = (id: string, leader: string, nums: string[]) => {
  const cards: Record<string, number> = {};
  for (const n of nums) cards[n] = 4;
  const filler = nums[0];
  cards[filler] += 50 - nums.length * 4;
  DECKS[id] = { id, name: id, series: 'TEST', leader, cards };
};
// Rouge : Leader Ace
deck('T16-R', 'OP16-001', ['OP16-002', 'OP16-003', 'OP16-004', 'OP16-006', 'OP16-008', 'OP16-012', 'OP16-015', 'OP16-017', 'OP16-018', 'OP16-118']);
// Vert : Morley
deck('T16-G', 'OP16-022', ['OP16-025', 'OP16-033', 'OP16-024', 'OP16-028']);
// Bleu : Leader Baggy
deck('T16-B', 'OP16-041', ['OP16-042', 'OP16-048', 'OP16-047', 'OP16-055', 'OP16-057', 'OP16-058', 'OP16-059', 'OP16-050', 'OP16-072']);
// Violet : Leader Sengoku
deck('T16-P', 'OP16-060', ['OP16-061', 'OP16-063', 'OP16-065', 'OP16-073', 'OP16-068', 'OP16-076', 'OP16-078', 'OP16-064', 'OP16-072']);
// Noir : Leader Yamato
deck('T16-K', 'OP16-079', ['OP16-090', 'OP16-084', 'OP16-085', 'OP16-087', 'OP16-096', 'OP16-097', 'OP16-098', 'OP16-099', 'OP16-100', 'OP16-081']);
// Jaune : Leader Teach
deck('T16-Y', 'OP16-080', ['OP16-114', 'OP16-102', 'OP16-104', 'OP16-105', 'OP16-108', 'OP16-115', 'OP16-117', 'OP16-119', 'OP16-110', 'OP09-099', 'OP16-103']);
const OPP = 'ST-22';
const OPP_SMALL = 'ST22-004';  // coût 3, 5000
const OPP_BIG = 'ST22-013';    // coût 5, 7000

const mine = (s: GameState, num: string, p: PlayerId = 0) => s.players[p].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const noBlock = (s: GameState) => (s.decision?.kind === 'blocker' ? choose(s, (o) => /pas|aucun|none|pass/i.test(o.id + o.label)) : s);
const answerAll = (s: GameState, pick: (s: GameState) => string | null) => {
  for (let i = 0; i < 20 && s.decision?.inEffect; i++) {
    const id = pick(s);
    if (!id) break;
    s = act(s, id);
  }
  return s;
};
const yes = (s: GameState) => (s.decision && s.decision.options.some((o) => o.id === 'yes') ? choose(s, 'yes') : s);
const trashOf = (s: GameState, num: string, p: PlayerId = 0) => {
  const P = s.players[p];
  const i = P.deck.findIndex((c) => c.num === num);
  const [c] = P.deck.splice(i, 1);
  P.trash.push(c);
  return c;
};

test('OP16 : chaque carte du set est jouable (codée, vérifiée ou d’office), sauf les doutes', () => {
  const doubts = ['OP16-022'];
  for (let i = 1; i <= 119; i++) {
    const num = `OP16-${String(i).padStart(3, '0')}`;
    if (doubts.includes(num)) assert.equal(cardStatus(num), 'todo', num);
    else assert.notEqual(cardStatus(num), 'todo', `${num} pas encore jouable`);
  }
});

test('Prisonniers d’Impel Down (OP16-042) : autant d’exemplaires que voulu', () => {
  assert.deepEqual(playableErrors('OP16-041', { 'OP16-042': 46, 'OP16-048': 4 }), []);
  assert.ok(playableErrors('OP16-041', { 'OP16-050': 46, 'OP16-048': 4 }).length > 0, 'une autre carte reste limitée à 4');
});

test('Portgas D. Ace (Leader OP16-001) : [Initiative] à un Luffy ou un Barbe Blanche de 8000 ou plus', () => {
  let s = scenario(['T16-R', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-004', extra: { playedTurn: 5 } }, { num: 'OP16-002', extra: { playedTurn: 5 } }]);
  });
  const leader = s.players[0].leader.uid;
  const curiel = mine(s, 'OP16-004');
  assert.ok(!hasOption(s, `attack:${curiel.uid}`), 'joué ce tour : pas d’attaque');
  s = choose(s, `act:${leader}`);
  const opts = s.decision!.options.map((o) => o.uid);
  assert.ok(opts.includes(curiel.uid), 'Curiel (Barbe Blanche, 8000)');
  assert.ok(!opts.includes(mine(s, 'OP16-002').uid), 'Izo : 2000, trop faible');
  s = choose(s, `card:${curiel.uid}`);
  assert.ok(hasKeyword(s, 0, mine(s, 'OP16-004'), 'Rush'));
  assert.ok(!hasOption(s, `act:${leader}`), 'une fois par tour');
  coherent(s);
});

test('Squard (OP16-008) : placer un Personnage de 10000 de base dans la Défausse pour un KO de 8000 ou moins', () => {
  let s = scenario(['T16-R', OPP], (g) => {
    setHand(g, 0, ['OP16-008']);
    setChars(g, 0, [{ num: 'OP16-003' }, { num: 'OP16-004' }]);
    setChars(g, 1, [{ num: OPP_BIG }]);
    setDon(g, 0, 5);
  });
  s = play(s, 'OP16-008');
  const newgate = mine(s, 'OP16-003').uid;
  const big = mine(s, OPP_BIG, 1).uid;
  s = choose(s, 'yes');
  if (s.decision?.options.some((o) => o.uid === newgate)) {
    assert.deepEqual(s.decision.options.filter((o) => o.uid).map((o) => o.uid), [newgate], 'seul Newgate a 10000 de base');
    s = choose(s, `card:${newgate}`);
  }
  s = choose(s, `card:${big}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP16-003'));
  coherent(s);
  // sans Personnage de 10000 de base : pas de question
  s = scenario(['T16-R', OPP], (g) => {
    setHand(g, 0, ['OP16-008']);
    setChars(g, 0, [{ num: 'OP16-004' }]);
    setChars(g, 1, [{ num: OPP_BIG }]);
    setDon(g, 0, 5);
  });
  s = play(s, 'OP16-008');
  assert.ok(!s.decision?.inEffect);
  assert.equal(s.players[1].chars.length, 1);
});

test('Little Oz Junior (OP16-017) : −4000 sans Personnage Barbe Blanche de coût 8 ou plus (sans boucle infinie)', () => {
  let s = scenario(['T16-R', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-017' }]); });
  assert.equal(power(s, mine(s, 'OP16-017').uid), 4000);
  s = scenario(['T16-R', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-017' }, { num: 'OP16-003' }]); });
  assert.equal(power(s, mine(s, 'OP16-017').uid), 8000, 'Newgate (coût 8, Whitebeard Pirates)');
});

test('Rockstar (OP16-018) : une fois par tour, défausser un Personnage de 6000+ à la place du KO d’un Équipage du Roux', () => {
  let s = scenario(['T16-R', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-018' }, { num: 'OP16-006', extra: { rested: true } }, { num: 'OP16-012' }]);
    setHand(g, 0, ['OP16-015', 'OP16-002']);
    setChars(g, 1, [{ num: OPP_BIG, extra: { playedTurn: 0 } }]);
    setDon(g, 1, 0);
  }, 1);
  const shanks = mine(s, 'OP16-006');
  s = noBlock(attack(s, mine(s, OPP_BIG, 1).uid, shanks.uid));
  s = noCounter(s);
  assert.equal(s.decision?.tag, 'replace', s.decision?.prompt ?? '');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => s.players[0].hand.some((c) => c.uid === o.uid && c.num === 'OP16-015'));
  assert.ok(s.players[0].chars.some((c) => c.uid === shanks.uid), 'Shanks reste');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP16-015'), 'Luffy (6000) défaussé');
  coherent(s);
});

test('Rockstar (OP16-018) : pas de remplacement sans carte de 6000+, ni pour un autre type', () => {
  let s = scenario(['T16-R', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-018' }, { num: 'OP16-006', extra: { rested: true } }]);
    setHand(g, 0, ['OP16-002']);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, mine(s, 'OP16-006').uid)));
  assert.notEqual(s.decision?.tag, 'replace');
  assert.ok(!s.players[0].chars.some((c) => c.num === 'OP16-006'), 'Shanks mis KO');
  s = scenario(['T16-R', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-018' }, { num: 'OP16-004', extra: { rested: true } }]);
    setHand(g, 0, ['OP16-015']);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, mine(s, 'OP16-004').uid)));
  assert.notEqual(s.decision?.tag, 'replace', 'Curiel n’est pas de l’Équipage du Roux');
});

test('Morley (OP16-033) : épuiser 2 de ses cartes à la place de son KO', () => {
  let s = scenario(['T16-G', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-033', extra: { rested: true } }]);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  const morley = mine(s, 'OP16-033').uid;
  s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, morley)));
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  s = choose(s, 'don');
  s = choose(s, 'don');
  assert.ok(s.players[0].chars.some((c) => c.uid === morley), 'Morley reste');
  assert.equal(s.players[0].donRested, 2);
  coherent(s);
  // rien à épuiser : KO
  s = scenario(['T16-G', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-033', extra: { rested: true } }]);
    setDon(g, 0, 0);
    g.players[0].leader.rested = true;
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, mine(s, 'OP16-033').uid)));
  assert.ok(!s.players[0].chars.some((c) => c.num === 'OP16-033'));
});

test('Don Quijote Doflamingo (OP16-047) : l’adversaire à 8 cartes ou plus en place 2 sous son deck', () => {
  let s = scenario(['T16-B', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-047' }]);
    while (g.players[1].hand.length < 8) g.players[1].hand.push(g.players[1].deck.shift()!);
  });
  s = choose(s, `act:${mine(s, 'OP16-047').uid}`);
  s = answerAll(s, (g) => g.decision!.options[0].id);
  assert.equal(s.players[1].hand.length, 6);
  assert.ok(mine(s, 'OP16-047').rested);
  s = scenario(['T16-B', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-047' }]);
    while (g.players[1].hand.length > 7) g.players[1].deck.push(g.players[1].hand.pop()!);
  });
  const before = s.players[1].hand.length;
  assert.ok(!hasOption(s, `act:${mine(s, 'OP16-047').uid}`) || (() => {
    const t = answerAll(choose(s, `act:${mine(s, 'OP16-047').uid}`), (g) => g.decision!.options[0].id);
    return t.players[1].hand.length === before;
  })(), 'moins de 8 cartes : rien');
});

test('Mr 2 Bonclay (OP16-055) : [DON!! x1] [En attaquant] puissance de base = celle du Leader adverse', () => {
  let s = scenario(['T16-B', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-055', extra: { don: 1 } }]);
    setDon(g, 0, 0);
  });
  const mr2 = mine(s, 'OP16-055').uid;
  s = attack(s, mr2, s.players[1].leader.uid);
  assert.equal(basePower(s, mr2), power(s, s.players[1].leader.uid));
  s = scenario(['T16-B', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-055' }]); });
  s = attack(s, mine(s, 'OP16-055').uid, s.players[1].leader.uid);
  assert.equal(basePower(s, mine(s, 'OP16-055').uid), 1000, 'sans DON!! : rien');
});

// Les [Contre] « pendant ce combat » : l'attaque de 7000 sur le Leader de 5000 (ou sur un Personnage épuisé) est
// repoussée, ou non
function counterRun(d: string, ev: string, setup?: (g: GameState) => void, target?: string) {
  let s = scenario([d, OPP], (g) => {
    setup?.(g);
    setHand(g, 0, [ev]);
    setDon(g, 0, 3);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  const life = s.players[0].life.length;
  const t = target ? mine(s, target).uid : s.players[0].leader.uid;
  s = noBlock(attack(s, mine(s, OPP_BIG, 1).uid, t));
  if (hasOption(s, 'cevent')) s = choose(s, (o) => o.id.startsWith('cevent:'));
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.uid === t)?.id ?? g.decision!.options.at(-1)!.id);
  s = noCounter(s);
  coherent(s);
  return { s, lostLife: s.players[0].life.length < life, survived: !target || s.players[0].chars.some((c) => c.uid === t) };
}

test('Événements [Contre] d’OP16 (057, 059, 076, 099, 100) : la puissance pendant le combat', () => {
  const cases: [string, string, number, ((g: GameState) => void)?][] = [
    ['T16-B', 'OP16-057', 4000, (g) => setChars(g, 0, [{ num: 'OP16-042' }, { num: 'OP16-042' }])],
    ['T16-B', 'OP16-059', 3000],
    ['T16-P', 'OP16-076', 4000, (g) => setChars(g, 0, [{ num: 'OP16-063' }])],
    ['T16-K', 'OP16-099', 3000],
    ['T16-K', 'OP16-100', 3000],
  ];
  for (const [d, ev, bonus, setup] of cases) {
    const r = counterRun(d, ev, setup);
    assert.ok(!r.lostLife, `${ev} repousse l'attaque`);
    assert.ok(r.s.log.some((l) => l.text.includes(`+${bonus} de puissance`)), `${ev} : +${bonus}`);
  }
  // condition fausse : un seul [Prisonniers d'Impel Down] (057), aucun {Amiral} (076)
  assert.ok(counterRun('T16-B', 'OP16-057', (g) => setChars(g, 0, [{ num: 'OP16-042' }])).lostLife, '057 avec 1 Prisonnier');
  assert.ok(counterRun('T16-P', 'OP16-076', (g) => setChars(g, 0, [{ num: 'OP16-061' }])).lostLife, '076 sans Amiral');
});

test('« Les prisonniers sont hors de contrôle !! » (OP16-058) : [Contre] +4000 à un Baggy ; [Principale] base 7000 avec 10 DON!!', () => {
  const r = counterRun('T16-B', 'OP16-058', (g) => setChars(g, 0, [{ num: 'OP16-048', extra: { rested: true } }]), 'OP16-048');
  assert.ok(r.survived, 'Baggy (6000 + 4000) résiste à 7000');
  assert.ok(!counterRun('T16-B', 'OP16-058', (g) => setChars(g, 0, [{ num: 'OP16-050', extra: { rested: true } }]), 'OP16-050').survived, 'Miss Olive n’est pas Baggy');
  let s = scenario(['T16-B', OPP], (g) => {
    setHand(g, 0, ['OP16-058']);
    setChars(g, 0, [{ num: 'OP16-042' }, { num: 'OP16-042' }]);
    setDon(g, 0, 10);
  });
  s = play(s, 'OP16-058');
  assert.deepEqual(s.players[0].chars.map((c) => basePower(s, c.uid)), [7000, 7000]);
  s = scenario(['T16-B', OPP], (g) => {
    setHand(g, 0, ['OP16-058']);
    setChars(g, 0, [{ num: 'OP16-042' }]);
    setDon(g, 0, 9);
  });
  if (hasOption(s, 'event')) s = play(s, 'OP16-058');
  assert.equal(basePower(s, mine(s, 'OP16-042').uid), 6000, '9 DON!! : rien');
});

test('Sengoku (Leader OP16-060) : 8 DON!! redressées au deck DON!!, jusqu’à 3 {Amiral} de noms différents', () => {
  let s = scenario(['T16-P', OPP], (g) => {
    setHand(g, 0, ['OP16-063', 'OP16-063', 'OP16-065', 'OP16-073', 'OP16-061']);
    setChars(g, 0, []);
    setDon(g, 0, 8, 2);
  });
  s = choose(s, `act:${s.players[0].leader.uid}`);
  s = yes(s);
  expectTag(s, 'playFree');
  assert.equal(s.players[0].donActive, 0);
  assert.equal(s.players[0].donDeck, 8, '8 DON!! redressées renvoyées');
  assert.ok(!s.decision!.options.some((o) => o.num === 'OP16-061'), 'pas d’Amiral');
  s = choose(s, (o) => o.num === 'OP16-063');
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.num === 'OP16-065')?.id ?? g.decision!.options.find((o) => o.num === 'OP16-073')?.id ?? g.decision!.options.at(-1)!.id);
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP16-063', 'OP16-065', 'OP16-073']);
  coherent(s);
  // 7 DON!! redressées seulement : pas d'activation
  s = scenario(['T16-P', OPP], (g) => { setHand(g, 0, ['OP16-063']); setDon(g, 0, 7, 3); });
  assert.ok(!hasOption(s, `act:${s.players[0].leader.uid}`) || (() => {
    const t = choose(s, `act:${s.players[0].leader.uid}`);
    return t.players[0].donActive === 7 && !t.players[0].chars.some((c) => c.num === 'OP16-063');
  })());
});

test('Trafalgar Law (OP16-068) : [En attaquant] +3000 avec un Leader {Équipage de Don Quijote}', () => {
  DECKS['T16-DQ'] = { id: 'T16-DQ', name: 'x', series: 'TEST', leader: 'OP01-060', cards: { 'OP16-068': 4, 'OP16-069': 46 } };
  let s = scenario(['T16-DQ', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-068' }]); });
  s = attack(s, mine(s, 'OP16-068').uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, 'OP16-068').uid), 6000);
  s = scenario(['T16-P', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-068' }]); });
  s = attack(s, mine(s, 'OP16-068').uid, s.players[1].leader.uid);
  assert.equal(power(s, mine(s, 'OP16-068').uid), 3000, 'Leader Sengoku (Marine)');
});

test('Marineford (OP16-078) : DON!! −1 et épuiser ce Lieu : piocher 1 et défausser 1', () => {
  let s = scenario(['T16-P', OPP], (g) => {
    const P = g.players[0];
    const i = P.deck.findIndex((c) => c.num === 'OP16-078');
    const [c] = P.deck.splice(i, 1);
    P.stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setDon(g, 0, 2);
  });
  const hand = s.players[0].hand.length;
  s = choose(s, `act:${s.players[0].stage!.uid}`);
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.id === 'yes')?.id ?? g.decision!.options[0].id);
  assert.equal(s.players[0].hand.length, hand);
  assert.ok(s.players[0].stage!.rested);
  assert.equal(s.players[0].donDeck, 9);
  assert.ok(!hasOption(s, `act:${s.players[0].stage!.uid}`), 'Lieu épuisé : plus d’activation');
  coherent(s);
});

test('Yamato (Leader OP16-079) : un {Pays de Wano} joué depuis la Défausse gagne [Initiative]', () => {
  let s = scenario(['T16-K', OPP], (g) => {
    setHand(g, 0, ['OP16-099']);
    setDeckTop(g, 0, ['OP16-098', 'OP16-090', 'OP16-090', 'OP16-090', 'OP16-090']);
    setDon(g, 0, 7);
    setChars(g, 0, []);
  });
  s = play(s, 'OP16-099');
  s = yes(s);
  s = choose(s, (o) => o.num === 'OP16-098');
  s = answerAll(s, (g) => g.decision!.options[0].id);
  const yamato = mine(s, 'OP16-098');
  assert.ok(hasKeyword(s, 0, yamato, 'Rush'), 'joué de la Défausse');
  assert.ok(hasOption(s, `attack:${yamato.uid}`));
  // joué de la main : pas d'[Initiative]
  s = scenario(['T16-K', OPP], (g) => { setHand(g, 0, ['OP16-090']); setDon(g, 0, 3); setChars(g, 0, []); });
  s = play(s, 'OP16-090');
  s = answerAll(s, (g) => g.decision!.options.at(-1)!.id);
  assert.ok(!hasKeyword(s, 0, mine(s, 'OP16-090'), 'Rush'));
});

test('Marshall D. Teach (Leader OP16-080) : +1 de coût au tour adverse ; changer la cible d’une attaque', () => {
  let s = scenario(['T16-Y', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-114' }, { num: 'OP16-110' }]);
    setHand(g, 0, ['OP16-115']);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  assert.equal(fieldCost(s, mine(s, 'OP16-114').uid), 2, 'tour adverse : +1');
  s = attack(s, mine(s, OPP_BIG, 1).uid, s.players[0].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  expectTag(s, 'teachTarget');
  const life = s.players[0].life.length;
  s = choose(s, `card:${mine(s, 'OP16-114').uid}`);
  s = noCounter(noBlock(s));
  assert.ok(s.log.some((l) => l.text.includes('l\'attaque vise maintenant Laffitte')));
  assert.equal(s.players[0].life.length, life, 'le Leader n’est plus touché');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP16-115'));
  // son tour : coût normal ; sans carte à [Déclenchement] : pas de question
  s = scenario(['T16-Y', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-114' }]); });
  assert.equal(fieldCost(s, mine(s, 'OP16-114').uid), 1);
  s = scenario(['T16-Y', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-114' }]);
    setHand(g, 0, []);
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  s = attack(s, mine(s, OPP_BIG, 1).uid, s.players[0].leader.uid);
  assert.notEqual(s.decision?.tag, 'may');
});

test('Momonosuké Kozuki (OP16-084) : coût 20 ou plus, 9 DON!! : jouer un Momonosuké de coût 9 de la Défausse', () => {
  let s = scenario(['T16-K', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-084' }]);
    setHand(g, 0, ['OP16-087']);
    trashOf(g, 'OP16-085');
    setDon(g, 0, 9);
  });
  assert.ok(!hasOption(s, `act:${mine(s, 'OP16-084').uid}`), 'coût 5 : pas d’activation');
  s = play(s, 'OP16-087');
  s = choose(s, 'yes');
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.uid === mine(g, 'OP16-084').uid)?.id ?? g.decision!.options[0].id);
  assert.equal(fieldCost(s, mine(s, 'OP16-084').uid), 25);
  s = choose(s, `act:${mine(s, 'OP16-084').uid}`);
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.num === 'OP16-085')?.id ?? g.decision!.options[0].id);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP16-085'));
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP16-084'));
  coherent(s);
});

test('Yamato (OP16-098) : se placer dans la Défausse, jouer un [Yamato] noir de coût 8 (pas un autre coût)', () => {
  let s = scenario(['T16-K', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-098' }]);
    trashOf(g, 'OP16-096');
    g.players[0].trash.push({ uid: 99001, num: 'EB05-046' });
  });
  s = choose(s, `act:${mine(s, 'OP16-098').uid}`);
  s = yes(s);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.filter((o) => o.num).map((o) => o.num), ['OP16-096']);
  s = choose(s, (o) => o.num === 'OP16-096');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP16-096']);
});

test('Entaille de Glace Sacrée (OP16-100) : redresser le Leader Yamato si un Personnage adverse a été mis KO ce tour', () => {
  let s = scenario(['T16-K', OPP], (g) => {
    setHand(g, 0, ['OP16-090', 'OP16-100', 'OP16-100']);
    setChars(g, 0, []);
    setChars(g, 1, [{ num: 'ST22-009' }]);
    g.players[0].leader.rested = true;
    setDon(g, 0, 8);
  });
  s = play(s, 'OP16-100');
  s = yes(s);
  assert.ok(s.players[0].leader.rested, 'aucun KO ce tour : rien');
  s = play(s, 'OP16-090');
  const keep = (g: GameState, uid?: number) => g.players[0].hand.some((c) => c.uid === uid && c.num === 'OP16-100');
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.uid === mine(g, 'ST22-009', 1)?.uid)?.id
    ?? g.decision!.options.find((o) => !keep(g, o.uid))?.id ?? g.decision!.options[0].id);
  assert.equal(s.players[1].chars.length, 0, 'Chopper met KO le Personnage de coût 1');
  s = play(s, 'OP16-100');
  s = yes(s);
  assert.ok(!s.players[0].leader.rested, 'Leader redressé');
});

test('Avalo Pizarro (OP16-102) : [En cas de KO] piocher puis jouer une [Ruche] (un Lieu) de la main ou de la Défausse', () => {
  let s = scenario(['T16-Y', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-102', extra: { rested: true } }]);
    setHand(g, 0, []);
    trashOf(g, 'OP09-099');
    setChars(g, 1, [{ num: OPP_BIG }]);
  }, 1);
  s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, mine(s, 'OP16-102').uid)));
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.num === 'OP09-099')?.id ?? g.decision!.options[0].id);
  assert.equal(s.players[0].stage?.num, 'OP09-099');
  coherent(s);
});

test('Catarina Devon (OP16-104) : [En attaquant] puissance de base = celle du Personnage choisi', () => {
  let s = scenario(['T16-Y', OPP], (g) => {
    setChars(g, 0, [{ num: 'OP16-104' }]);
    setChars(g, 1, [{ num: OPP_BIG }, { num: OPP_SMALL }]);
  });
  const devon = mine(s, 'OP16-104').uid;
  s = attack(s, devon, s.players[1].leader.uid);
  s = choose(s, `card:${mine(s, OPP_BIG, 1).uid}`);
  assert.equal(basePower(s, devon), 7000);
  s = scenario(['T16-Y', OPP], (g) => { setChars(g, 0, [{ num: 'OP16-104' }]); setChars(g, 1, [{ num: OPP_BIG }]); });
  s = attack(s, mine(s, 'OP16-104').uid, s.players[1].leader.uid);
  s = choose(s, 'none');
  assert.equal(basePower(s, mine(s, 'OP16-104').uid), 3000, 'aucun choisi');
});

test('Gecko Moria (OP16-105) : [Déclenchement] avec 1 Vie ou moins, jouer Absalom, Hogback et Perona de la Défausse', () => {
  const run = (life: number) => {
    let s = scenario(['T16-Y', OPP], (g) => {
      setChars(g, 0, []);
      setLife(g, 0, ['OP16-105', ...Array(life - 1).fill('OP16-110')]);
      g.players[0].trash.push({ uid: 99011, num: 'OP14-100' }, { uid: 99012, num: 'OP14-110' }, { uid: 99013, num: 'OP14-111' }, { uid: 99014, num: 'OP14-033' });
      setChars(g, 1, [{ num: OPP_BIG }]);
    }, 1);
    s = noCounter(noBlock(attack(s, mine(s, OPP_BIG, 1).uid, s.players[0].leader.uid)));
    if (s.decision?.options.some((o) => o.id === 'trigger')) s = choose(s, 'trigger');
    s = answerAll(s, (g) => g.decision!.options.find((o) => o.num)?.id ?? g.decision!.options[0].id);
    return s;
  };
  assert.deepEqual(run(1).players[0].chars.map((c) => c.num).sort(), ['OP14-100', 'OP14-110', 'OP14-111'], 'Perona de coût 5 : non');
  assert.equal(run(3).players[0].chars.length, 0, '2 Vies : rien');
});

test('Shiliew (OP16-108) : défausser 1 carte : une carte Barbe Noire de coût 6 ou moins de la Défausse au-dessus de la Vie', () => {
  let s = scenario(['T16-Y', OPP], (g) => {
    setHand(g, 0, ['OP16-108', 'OP16-110']);
    trashOf(g, 'OP16-114');
    trashOf(g, 'OP16-119');
    setDon(g, 0, 6);
  });
  const life = s.players[0].life.length;
  s = play(s, 'OP16-108');
  s = choose(s, 'yes');
  expectTag(s, 'toLife');
  assert.ok(!s.decision!.options.some((o) => o.num === 'OP16-119'), 'Teach : coût 10');
  s = choose(s, (o) => o.num === 'OP16-114');
  assert.equal(s.players[0].life.length, life + 1);
  assert.ok(s.players[0].life[0].faceUp && s.players[0].life[0].num === 'OP16-114');
  coherent(s);
});

test('Tourbillon Noir et Black Hole (OP16-115, OP16-117) : annuler les effets d’un Personnage adverse', () => {
  let s = scenario(['T16-Y', OPP], (g) => {
    setHand(g, 0, ['OP16-117', 'OP16-114']);
    setChars(g, 1, [{ num: OPP_BIG }]);
    setDon(g, 0, 2);
  });
  s = play(s, 'OP16-117');
  s = choose(s, 'yes');
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.uid === mine(g, OPP_BIG, 1).uid)?.id ?? g.decision!.options.find((o) => o.num === 'OP16-114')?.id ?? g.decision!.options[0].id);
  assert.ok(isNegated(s, mine(s, OPP_BIG, 1).uid));
  // sans carte à [Déclenchement] en main : rien
  s = scenario(['T16-Y', OPP], (g) => { setHand(g, 0, ['OP16-117', 'OP16-119']); setChars(g, 1, [{ num: OPP_BIG }]); setDon(g, 0, 2); });
  s = play(s, 'OP16-117');
  s = answerAll(s, (g) => g.decision!.options.find((o) => o.id === 'no')?.id ?? g.decision!.options[0].id);
  assert.ok(!isNegated(s, mine(s, OPP_BIG, 1).uid));
  void keepOrder;
});
