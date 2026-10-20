// Cartes des adversaires de l'aventure, liste B (tâche 1.16 du plan « Aventure ») : un test par carte, avec sa condition
// vraie et fausse. Decks d'essai aux Leaders Baggy OP16-041 ({Impel Down}), Krieg OP15-001 ({East Blue}) et Arlong
// OP03-022 ({Hommes-poissons}, {East Blue}), et au Leader Luffy ST21-001 pour les conditions de Leader fausses ;
// adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { AVENTURE_B } from '../engine/cards/aventure-b.ts';
import { cardStatus } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { addMod, attackAbility, canBeRested, def, fieldCost, hasBlocker, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, Option, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon,
  setHand, setLife,
} from './helpers.ts';

// Bande de Baggy
const BAGGY_L = 'OP16-041';   // Leader {Impel Down}
const BAGGY_ID = 'OP16-048';  // coût 5, 6000, {Impel Down}
const BAGGY_1 = 'OP02-058';   // coût 1, 2000, {Impel Down}
const BAGGY_CG = 'ST25-004';  // coût 4, {Cross Guild}
const CABAJI = 'OP02-052';    // coût 2
const CABAJI_CG = 'ST25-002'; // coût 4, 1000, {Cross Guild}
const MORGE = 'OP09-053';     // coût 5, nom [Mohji], {Cross Guild}
const ALVIDA = 'OP01-064';    // coût 2, 3000
const ALVIDA_CG = 'OP12-042'; // coût 4, {Cross Guild}
const MUGGY = 'OP09-058';     // Maggy Ball spéciale, coût 2
const STEAM = 'OP09-059';     // Tour de passe-passe brouillard, coût 2
const MOHJI = 'OP02-060';     // coût 1, sans effet
const RICHIE = 'OP09-054';    // coût 2, [Bloqueur], {Cross Guild}
const BAGGY_6 = 'OP12-049';   // coût 6, 7000, {Cross Guild}, sans effet
const MC = 'OP12-055';        // Morge et Cabaji, coût 5, {Cross Guild}, sans effet
const PRISONER = 'OP16-042';  // Prisonniers d'Impel Down, coût 6, bleu {Impel Down}
// Armada de Krieg
const KRIEG_L = 'OP15-001';   // Leader {East Blue}, nommé [Krieg]
const GIN = 'OP15-007';       // coût 6
const KRIEG = 'OP15-008';     // coût 8
const PEARL = 'OP15-011';     // coût 4, 4000
const OUTCOME = 'OP15-037';   // Événement, coût 1, {East Blue}
const ORDERS = 'OP15-038';    // Événement, coût 1
const EB_ALVIDA = 'OP03-023'; // coût 1, {East Blue}, sans effet
const MOMOO = 'OP03-035';     // coût 2, {East Blue}, sans effet
// Arlong
const ARLONG_L = 'OP03-022';  // Leader {Hommes-poissons} {East Blue}
const ARLONG_3 = 'EB02-011';  // coût 3
const ARLONG_4 = 'OP06-023';  // coût 4, [Déclenchement]
// Cartes neutres (ST-21) : Jinbe et Stussy dans mes decks, l'adversaire joue ST-21
const JINBE = 'ST21-005';     // coût 2, 4000, pas {East Blue}
const STUSSY = 'ST21-006';    // coût 3, 5000
const O_VEGAPUNK = 'ST21-013';  // coût 1, 3000
const O_JINBE = 'ST21-005';     // coût 2, 4000
const O_STUSSY = 'ST21-006';    // coût 3, 5000
const O_CHOPPER = 'ST21-008';   // coût 4, 6000
const O_LUFFY = 'ST21-014';     // coût 5, 6000

const four = (nums: string[]) => Object.fromEntries(nums.map((n) => [n, 4]));
const BAGGY_CARDS = four([BAGGY_ID, BAGGY_1, BAGGY_CG, CABAJI, CABAJI_CG, MORGE, ALVIDA, ALVIDA_CG, MUGGY, STEAM, MOHJI, RICHIE, BAGGY_6, MC, PRISONER, JINBE]);
const KRIEG_CARDS = four([GIN, KRIEG, PEARL, OUTCOME, ORDERS, EB_ALVIDA, MOMOO, JINBE, STUSSY]);
const ARLONG_CARDS = four([ARLONG_3, ARLONG_4, MOMOO, JINBE, STUSSY]);
const BAGGY = 'TEST-AVB-BAGGY';
const BAGGY_LUFFY = 'TEST-AVB-BAGGY-LUFFY';
const KRIEGS = 'TEST-AVB-KRIEG';
const KRIEG_LUFFY = 'TEST-AVB-KRIEG-LUFFY';
const ARLONGS = 'TEST-AVB-ARLONG';
const ARLONG_LUFFY = 'TEST-AVB-ARLONG-LUFFY';
DECKS[BAGGY] = { id: BAGGY, name: 'Essai', series: 'TEST', leader: BAGGY_L, cards: BAGGY_CARDS };
DECKS[BAGGY_LUFFY] = { id: BAGGY_LUFFY, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: BAGGY_CARDS };
DECKS[KRIEGS] = { id: KRIEGS, name: 'Essai', series: 'TEST', leader: KRIEG_L, cards: KRIEG_CARDS };
DECKS[KRIEG_LUFFY] = { id: KRIEG_LUFFY, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: KRIEG_CARDS };
DECKS[ARLONGS] = { id: ARLONGS, name: 'Essai', series: 'TEST', leader: ARLONG_L, cards: ARLONG_CARDS };
DECKS[ARLONG_LUFFY] = { id: ARLONG_LUFFY, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards: ARLONG_CARDS };

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
// Numéro de la carte d'une option (carte du terrain, de la main ou du deck) ; cartes proposées par la question en cours
const numOf = (s: GameState, o: Option) => o.num ?? s.players.flatMap((P) => [P.leader, ...P.chars, ...P.hand]).find((c) => c.uid === o.uid)?.num;
const offered = (s: GameState) => s.decision!.options.filter((o) => o.uid !== undefined).map((o) => numOf(s, o));
const pick = (s: GameState, num: string) => choose(s, (o) => o.uid !== undefined && numOf(s, o) === num);
const inHandNum = (s: GameState, p: PlayerId, num: string) => s.players[p].hand.some((c) => c.num === num);
const inTrash = (s: GameState, p: PlayerId, num: string) => s.players[p].trash.some((c) => c.num === num);
const act1 = (s: GameState, num: string) => act(s, `act:${num === s.players[0].leader.num ? s.players[0].leader.uid : mine(s, num).uid}`);

// L'adversaire attaque avec Stussy (5000) : mon Leader, ou un de mes Personnages épuisés (`target`)
function oppAttacks(deck: string, setup: (g: GameState) => void, target?: string, attacker = O_STUSSY) {
  let s = scenario([deck, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 1, [{ num: attacker }]);
    setDon(g, 1, 0);
    setup(g);
  }, 1);
  s = attack(s, theirs(s, attacker).uid, target ? mine(s, target).uid : s.players[0].leader.uid);
  return s;
}

test('Liste B : les 19 cartes à faire sont codées, les 6 autres jouables d’office', () => {
  const todo = [
    'EB02-011', 'OP01-064', 'OP02-052', 'OP02-058', 'OP06-023', 'OP09-053', 'OP09-058', 'OP09-059', 'OP12-042', 'OP15-001',
    'OP15-007', 'OP15-008', 'OP15-011', 'OP15-037', 'OP15-038', 'OP16-041', 'OP16-048', 'ST25-002', 'ST25-004',
  ];
  assert.deepEqual(Object.keys(AVENTURE_B).sort(), todo);
  for (const num of todo) assert.equal(cardStatus(num), 'coded', num);
  for (const num of ['OP02-060', 'OP09-054', 'OP12-049', 'OP12-055', 'OP16-023', 'ST03-011']) assert.notEqual(cardStatus(num), 'todo', num);
});

// ===== Bande de Baggy =====

test('Baggy (OP02-058) : [Jouée] regarder 5 cartes, prendre une carte bleue {Impel Down} autre que [Baggy]', () => {
  const run = (top: string[]) => {
    let s = scenario([BAGGY, 'ST-21'], (g) => {
      setHand(g, 0, [BAGGY_1]);
      setDeckTop(g, 0, top);
      setDon(g, 0, 1);
    });
    s = play(s, BAGGY_1);
    return s;
  };
  let s = run([BAGGY_ID, MOHJI, PRISONER, JINBE, RICHIE]);
  expectTag(s, 'pick');
  assert.deepEqual(offered(s), [PRISONER], 'le Baggy OP16-048 est exclu, les autres ne sont pas {Impel Down}');
  aiAnswers(s);
  s = keepOrder(pick(s, PRISONER));
  assert.ok(inHandNum(s, 0, PRISONER));
  assert.equal(s.players[0].deck.slice(-4).map((c) => c.num).sort().join(), [BAGGY_ID, MOHJI, JINBE, RICHIE].sort().join());
  coherent(s);

  s = keepOrder(run([BAGGY_ID, MOHJI, JINBE, RICHIE, MC]));
  assert.notEqual(s.decision?.tag, 'pick', 'rien à prendre');
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Cabaji (OP02-052) : [Jouée] avec un [Morge], piocher 2 cartes et en défausser 1', () => {
  const run = (chars: string[]) => {
    let s = scenario([BAGGY, 'ST-21'], (g) => {
      setHand(g, 0, [CABAJI, JINBE]);
      setChars(g, 0, chars.map((num) => ({ num })));
      setDon(g, 0, 2);
    });
    s = play(s, CABAJI);
    return s;
  };
  for (const mohji of [MOHJI, MORGE]) {
    let s = run([mohji]);
    expectTag(s, 'discard');
    assert.equal(s.players[0].hand.length, 3);
    aiAnswers(s);
    s = pick(s, JINBE);
    assert.equal(s.players[0].hand.length, 2);
    assert.ok(inTrash(s, 0, JINBE));
    coherent(s);
  }
  // Morge et Cabaji (OP12-055) n'est pas un [Morge]
  const s = run([MC]);
  assert.equal(s.decision?.kind, 'main');
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [JINBE]);
});

test('Cabaji (ST25-002) : [Bloqueur] et +1 de coût avec 2 Personnages de coût de base 5 ou plus ; +5000 au tour adverse', () => {
  const run = (others: string[], active: PlayerId) => scenario([BAGGY, 'ST-21'], (g) => {
    setChars(g, 0, [CABAJI_CG, ...others].map((num) => ({ num })));
  }, active);
  let s = run([BAGGY_6, MC], 0);
  let c = mine(s, CABAJI_CG);
  assert.ok(hasBlocker(s, 0, c));
  assert.equal(fieldCost(s, c.uid), 5);
  assert.equal(power(s, c.uid), 1000);
  s = run([BAGGY_6, MC], 1);
  assert.equal(power(s, mine(s, CABAJI_CG).uid), 6000);
  // un seul Personnage de coût 5 ou plus (Cabaji lui-même, coût 4, ne compte pas)
  s = run([BAGGY_6, JINBE], 1);
  c = mine(s, CABAJI_CG);
  assert.equal(hasBlocker(s, 0, c), false);
  assert.equal(fieldCost(s, c.uid), 4);
  assert.equal(power(s, c.uid), 6000);
});

test('Alvida (OP12-042) : +1 de coût avec 2 Personnages de coût de base 5 ou plus ; [Jouée] coût de base 1 ou moins au-dessous du deck', () => {
  const run = (mine0: string[], opp: string[]) => {
    let s = scenario([BAGGY, 'ST-21'], (g) => {
      setHand(g, 0, [ALVIDA_CG]);
      setChars(g, 0, mine0.map((num) => ({ num })));
      setChars(g, 1, opp.map((num) => ({ num })));
      setDon(g, 0, 4);
    });
    s = play(s, ALVIDA_CG);
    return s;
  };
  let s = run([BAGGY_6, MC], [O_VEGAPUNK, O_JINBE]);
  expectTag(s, 'oppRemove');
  assert.deepEqual(offered(s), [O_VEGAPUNK], 'Jinbe coûte 2');
  aiAnswers(s);
  const vegapunk = theirs(s, O_VEGAPUNK).uid;
  s = pick(s, O_VEGAPUNK);
  assert.equal(s.players[1].deck.at(-1)!.uid, vegapunk);
  assert.equal(fieldCost(s, mine(s, ALVIDA_CG).uid), 5);
  coherent(s);
  // un coût baissé ne compte pas : coût de base
  s = scenario([BAGGY, 'ST-21'], (g) => {
    setHand(g, 0, [ALVIDA_CG]);
    const [jinbe] = setChars(g, 1, [{ num: O_JINBE }]);
    addMod(g, { uid: jinbe.uid, stat: 'cost', amount: -2, until: 'turn', source: 'Test' });
    setDon(g, 0, 4);
  });
  s = play(s, ALVIDA_CG);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(fieldCost(s, mine(s, ALVIDA_CG).uid), 4);
});

test('Baggy (ST25-004) : [Activation : Principale] défausser 1 carte et se placer dans la Défausse : jouer un Personnage {Cross Guild} de coût 6 ou moins', () => {
  const run = (deck: string, hand: string[]) => scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, hand);
    setChars(g, 0, [{ num: BAGGY_CG }]);
    setDon(g, 0, 0);
  });
  let s = run(BAGGY, [JINBE, BAGGY_6]);
  const self = mine(s, BAGGY_CG);
  assert.ok(def(BAGGY_CG).activateMain!.useful!(s, 0, self));
  s = act1(s, BAGGY_CG);
  expectTag(s, 'discard');
  s = pick(s, JINBE);
  expectTag(s, 'playFree');
  assert.deepEqual(offered(s), [BAGGY_6]);
  aiAnswers(s);
  s = pick(s, BAGGY_6);
  assert.ok(mine(s, BAGGY_6));
  assert.ok(inTrash(s, 0, BAGGY_CG) && inTrash(s, 0, JINBE));
  coherent(s);
  // conditions fausses : une seule carte en main, ou pas de Leader [Baggy] (l'effet se paie mais ne joue rien)
  s = run(BAGGY, [BAGGY_6]);
  assert.equal(def(BAGGY_CG).activateMain!.useful!(s, 0, mine(s, BAGGY_CG)), false);
  s = run(BAGGY_LUFFY, [JINBE, BAGGY_6]);
  assert.equal(def(BAGGY_CG).activateMain!.useful!(s, 0, mine(s, BAGGY_CG)), false);
  s = pick(act1(s, BAGGY_CG), JINBE);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(inHandNum(s, 0, BAGGY_6) && inTrash(s, 0, BAGGY_CG));
});

test('Morge (OP09-053) : [Jouée] regarder 5 cartes, prendre un [Richie], puis jouer un [Richie] de sa main', () => {
  const run = (top: string[], hand: string[] = []) => {
    let s = scenario([BAGGY, 'ST-21'], (g) => {
      setHand(g, 0, [MORGE, ...hand]);
      setDeckTop(g, 0, top);
      setDon(g, 0, 5);
    });
    s = play(s, MORGE);
    return s;
  };
  let s = run([MOHJI, RICHIE, JINBE, MC, BAGGY_6]);
  expectTag(s, 'pick');
  assert.deepEqual(offered(s), [RICHIE]);
  s = keepOrder(pick(s, RICHIE));
  expectTag(s, 'playFree');
  aiAnswers(s);
  s = pick(s, RICHIE);
  assert.ok(mine(s, RICHIE));
  coherent(s);
  // pas de [Richie] regardé, mais un dans la main : il peut le jouer
  s = keepOrder(run([MOHJI, JINBE, MC, BAGGY_6, CABAJI], [RICHIE]));
  expectTag(s, 'playFree');
  // ni l'un ni l'autre
  s = keepOrder(run([MOHJI, JINBE, MC, BAGGY_6, CABAJI]));
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].chars.some((c) => c.num === RICHIE), false);
});

test('Alvida (OP01-064) : [DON!! x1] [En attaquant] défausser 1 carte : renvoyer en main un Personnage adverse de coût 3 ou moins', () => {
  const run = (don: number, opp: string[], hand = [JINBE]) => {
    const s = scenario([BAGGY, 'ST-21'], (g) => {
      setHand(g, 0, hand);
      setChars(g, 0, [{ num: ALVIDA, extra: { don } }]);
      setChars(g, 1, opp.map((num) => ({ num })));
      setDon(g, 0, 0);
    });
    return attack(s, mine(s, ALVIDA).uid, s.players[1].leader.uid);
  };
  let s = run(1, [O_STUSSY, O_CHOPPER]);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'bounce');
  assert.deepEqual(offered(s), [O_STUSSY], 'Chopper coûte 4');
  s = pick(s, O_STUSSY);
  assert.ok(inHandNum(s, 1, O_STUSSY));
  assert.ok(inTrash(s, 0, JINBE));
  coherent(s);
  // conditions fausses : sans DON!!, sans cible, sans carte à défausser
  for (const [don, opp, hand] of [[0, [O_STUSSY], [JINBE]], [1, [O_CHOPPER], [JINBE]], [1, [O_STUSSY], []]] as const) {
    s = run(don, [...opp], [...hand]);
    assert.notEqual(s.decision?.tag, 'may', `DON!! ${don}, ${opp.join()}, main ${hand.length}`);
    assert.equal(s.players[1].chars.length, opp.length);
  }
});

test('Maggy Ball spéciale (OP09-058) : [Principale] renvoyer en main un Personnage adverse de coût 6 ou moins ; [Déclenchement] coût 3 ou moins, des deux côtés', () => {
  let s = scenario([BAGGY, 'ST-21'], (g) => {
    setHand(g, 0, [MUGGY]);
    const [, luffy] = setChars(g, 1, [{ num: O_VEGAPUNK }, { num: O_LUFFY }]);
    addMod(g, { uid: luffy.uid, stat: 'cost', amount: 1, until: 'turn', source: 'Test' });  // coût 6
    setDon(g, 0, 2);
  });
  assert.ok(def(MUGGY).mainUseful!(s, 0));
  s = play(s, MUGGY);
  expectTag(s, 'bounce');
  assert.deepEqual(offered(s), [O_VEGAPUNK, O_LUFFY]);
  aiAnswers(s);
  s = pick(s, O_LUFFY);
  assert.ok(inHandNum(s, 1, O_LUFFY));
  coherent(s);
  // coût 7 : rien à renvoyer
  s = scenario([BAGGY, 'ST-21'], (g) => {
    const [luffy] = setChars(g, 1, [{ num: O_LUFFY }]);
    addMod(g, { uid: luffy.uid, stat: 'cost', amount: 2, until: 'turn', source: 'Test' });
  });
  assert.equal(def(MUGGY).mainUseful!(s, 0), false);

  // [Déclenchement] : mes Personnages aussi
  s = oppAttacks(BAGGY, (g) => {
    setChars(g, 0, [{ num: BAGGY_1 }, { num: BAGGY_6 }]);
    setLife(g, 0, [MUGGY]);
    setHand(g, 0, []);
  });
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'bounce');
  assert.deepEqual(offered(s).sort(), [BAGGY_1, O_STUSSY].sort(), 'Baggy OP12-049 coûte 6');
  aiAnswers(s);
  assert.equal(heuristicChooser(s, s.decision!), s.decision!.options.find((o) => numOf(s, o) === O_STUSSY)!.id, 'l’IA renvoie le Personnage adverse');
  s = pick(s, O_STUSSY);
  assert.ok(inHandNum(s, 1, O_STUSSY));
  assert.ok(inTrash(s, 0, MUGGY));
  coherent(s);
});

test('Tour de passe-passe brouillard (OP09-059) : [Contre] +3000, puis défausser jusqu’à 2 cartes et autant du deck ; [Déclenchement] piocher 1 carte', () => {
  const run = (hand: string[]) => {
    let s = oppAttacks(BAGGY, (g) => {
      setHand(g, 0, hand);
      setDon(g, 0, 2);
    });
    assert.equal(s.decision?.kind, 'counter');
    s = choose(s, (o) => o.id.startsWith('cevent:'));
    return s;
  };
  let s = run([STEAM, JINBE, MOHJI, RICHIE]);
  assert.equal(power(s, s.players[0].leader.uid), 8000);
  expectTag(s, 'mayMill');
  assert.equal(heuristicChooser(s, s.decision!), 'no', 'l’IA ne défausse pas pour rien');
  const deck = s.players[0].deck.length;
  const trash = s.players[0].trash.length;
  s = choose(s, 'yes');
  expectTag(s, 'mayMillCount');
  s = choose(s, 'count:2');
  s = pick(s, JINBE);
  s = pick(s, MOHJI);
  assert.equal(s.players[0].deck.length, deck - 2);
  assert.equal(s.players[0].trash.length, trash + 4);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [RICHIE]);
  coherent(s);
  // refus : seulement le +3000
  s = choose(run([STEAM, JINBE]), 'no');
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [JINBE]);
  // une seule carte en main : pas de question sur le nombre
  s = choose(run([STEAM, JINBE]), 'yes');
  assert.notEqual(s.decision?.tag, 'mayMillCount');
  assert.ok(inTrash(s, 0, JINBE));
  // sans autre carte en main : pas de question
  s = run([STEAM]);
  assert.notEqual(s.decision?.tag, 'mayMill');

  // [Déclenchement]
  s = oppAttacks(BAGGY, (g) => {
    setLife(g, 0, [STEAM]);
    setHand(g, 0, []);
  });
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(inTrash(s, 0, STEAM));
});

test('Baggy (OP16-041, Leader) : [DON!! x1] [Une fois par tour] un Personnage {Impel Down} quitte le terrain : jouer un [Prisonniers d’Impel Down]', () => {
  // KO en combat
  const ko = (deckLeaderDon: number, hand = [PRISONER]) => {
    let s = oppAttacks(BAGGY, (g) => {
      setHand(g, 0, hand);
      setChars(g, 0, [{ num: BAGGY_1, extra: { rested: true } }]);
      g.players[0].leader.don = deckLeaderDon;
      setDon(g, 0, 0);
    }, BAGGY_1);
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    return s;
  };
  let s = ko(1);
  expectTag(s, 'playFree');
  aiAnswers(s);
  s = pick(s, PRISONER);
  assert.ok(mine(s, PRISONER));
  assert.ok(inTrash(s, 0, BAGGY_1));
  coherent(s);
  // conditions fausses : pas de DON!! sur le Leader, pas de Prisonnier en main
  for (const [don, hand] of [[0, [PRISONER]], [1, [JINBE]]] as const) {
    s = ko(don, [...hand]);
    assert.notEqual(s.decision?.tag, 'playFree');
    assert.ok(inTrash(s, 0, BAGGY_1));
    assert.equal(s.players[0].chars.length, 0);
  }
  // un Personnage qui n'est pas {Impel Down}
  s = oppAttacks(BAGGY, (g) => {
    setHand(g, 0, [PRISONER]);
    setChars(g, 0, [{ num: MOHJI, extra: { rested: true } }]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
  }, MOHJI);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  assert.notEqual(s.decision?.tag, 'playFree');

  // renvoyé en main par un effet (son propre [Déclenchement] de Maggy Ball spéciale)
  s = oppAttacks(BAGGY, (g) => {
    setHand(g, 0, [PRISONER]);
    setLife(g, 0, [MUGGY]);
    setChars(g, 0, [{ num: BAGGY_1 }]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
  });
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  s = choose(s, 'trigger');
  s = pick(s, BAGGY_1);
  expectTag(s, 'playFree');
  s = pick(s, PRISONER);
  assert.ok(mine(s, PRISONER));
  assert.ok(inHandNum(s, 0, BAGGY_1));
  assert.ok(s.players[0].leader.usedOpt.includes('baggyLeader'), 'une fois par tour');
  coherent(s);
});

test('Baggy (OP16-048) : [Jouée] avec un Leader {Impel Down}, piocher 1 et jouer un [Prisonniers d’Impel Down] ; [Bloqueur] à un Prisonnier quand l’adversaire attaque', () => {
  const run = (deck: string) => {
    let s = scenario([deck, 'ST-21'], (g) => {
      setHand(g, 0, [BAGGY_ID, PRISONER]);
      setDon(g, 0, 5);
    });
    s = play(s, BAGGY_ID);
    return s;
  };
  let s = run(BAGGY);
  expectTag(s, 'playFree');
  assert.equal(s.players[0].hand.length, 2, 'Prisonnier et la carte piochée');
  aiAnswers(s);
  s = pick(s, PRISONER);
  assert.ok(mine(s, PRISONER));
  coherent(s);
  s = run(BAGGY_LUFFY);
  assert.equal(s.decision?.kind, 'main');
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [PRISONER]);

  // [Bloqueur] donné quand l'adversaire attaque
  s = oppAttacks(BAGGY, (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: BAGGY_ID }, { num: PRISONER }]);
  });
  expectTag(s, 'ownGrant');
  aiAnswers(s);
  s = pick(s, PRISONER);
  assert.equal(s.decision?.kind, 'blocker');
  assert.ok(hasOption(s, `block:${mine(s, PRISONER).uid}`));
  assert.ok(mine(s, BAGGY_ID).usedOpt.includes('baggyBlocker'));
  // sans Prisonnier redressé : rien
  s = oppAttacks(BAGGY, (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: BAGGY_ID }, { num: PRISONER, extra: { rested: true } }]);
  });
  assert.notEqual(s.decision?.tag, 'ownGrant');
});

// ===== Armada de Krieg =====

test('Krieg (OP15-001, Leader) : [DON!! x1] [Tour adverse] −2000 aux Personnages adverses si tous les siens sont {East Blue}', () => {
  const run = (don: number, chars: string[], active: PlayerId) => scenario([KRIEGS, 'ST-21'], (g) => {
    setChars(g, 0, chars.map((num) => ({ num })));
    setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]);
    g.players[0].leader.don = don;
    setDon(g, 0, 0);
  }, active);
  let s = run(1, [EB_ALVIDA, MOMOO], 1);
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 3000);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 4000);
  for (const [don, chars, active] of [[1, [EB_ALVIDA], 0], [0, [EB_ALVIDA], 1], [1, [EB_ALVIDA, JINBE], 1], [1, [], 1]] as const) {
    s = run(don, [...chars], active);
    assert.equal(power(s, theirs(s, O_STUSSY).uid), 5000, `DON!! ${don}, ${chars.join()}, tour de ${active}`);
  }
});

test('Krieg (OP15-001, Leader) : [Activation : Principale] [Une fois par tour] épuiser un Personnage adverse ayant 2 DON!! ou plus', () => {
  const run = (don: number) => scenario([KRIEGS, 'ST-21'], (g) => {
    setChars(g, 1, [{ num: O_STUSSY, extra: { don } }, { num: O_CHOPPER, extra: { don: 1 } }]);
    setDon(g, 1, 0);
  });
  let s = run(2);
  const leader = s.players[0].leader.uid;
  assert.ok(hasOption(s, `act:${leader}`));
  s = act(s, `act:${leader}`);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_STUSSY]);
  aiAnswers(s);
  s = pick(s, O_STUSSY);
  assert.ok(theirs(s, O_STUSSY).rested);
  assert.equal(hasOption(s, `act:${leader}`), false, 'une fois par tour');
  coherent(s);
  s = run(1);
  assert.equal(def(KRIEG_L).activateMain!.useful!(s, 0, s.players[0].leader), false);
});

test('Gyn (OP15-007) : [Jouée] avec un Leader {East Blue}, jouer un Personnage de coût 5 ou moins de sa main', () => {
  const run = (deck: string) => {
    let s = scenario([deck, 'ST-21'], (g) => {
      setHand(g, 0, [GIN, PEARL, KRIEG]);
      setDon(g, 0, 6);
    });
    s = play(s, GIN);
    return s;
  };
  let s = run(KRIEGS);
  expectTag(s, 'playFree');
  assert.deepEqual(offered(s), [PEARL], 'Krieg coûte 8');
  aiAnswers(s);
  s = pick(s, PEARL);
  assert.ok(mine(s, PEARL));
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
  s = run(KRIEG_LUFFY);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].chars.length, 1);
});

test('Krieg (OP15-008) : [Jouée] 3 DON!! adverses à un Personnage adverse et [Initiative] ; le tour même, −1000 par DON!! à tous les Personnages adverses', () => {
  const run = (oppRested: number) => {
    let s = scenario([KRIEGS, 'ST-21'], (g) => {
      setHand(g, 0, [KRIEG]);
      setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]);
      setDon(g, 0, 8);
      setDon(g, 1, 2, oppRested);
    });
    s = play(s, KRIEG);
    return s;
  };
  let s = run(4);
  expectTag(s, 'oppDonTarget');
  aiAnswers(s);
  s = pick(s, O_STUSSY);
  assert.equal(theirs(s, O_STUSSY).don, 3);
  assert.equal(s.players[1].donRested, 1);
  const krieg = mine(s, KRIEG);
  assert.ok(hasKeyword(s, 0, krieg, 'Rush'));
  assert.ok(hasOption(s, `attack:${krieg.uid}`));
  assert.ok(def(KRIEG).activateMain!.useful!(s, 0, krieg));
  s = act1(s, KRIEG);
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 2000);
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 3000);
  assert.ok(logHas(s, '−3000'));
  assert.equal(hasOption(s, `act:${mine(s, KRIEG).uid}`), false, 'une fois par tour');
  coherent(s);
  // l'adversaire n'a que 2 DON!! épuisées : 2 données
  s = pick(run(2), O_CHOPPER);
  assert.equal(theirs(s, O_CHOPPER).don, 2);
  // aucune DON!! adverse épuisée : rien de donné, [Initiative] quand même, l'activation ne sert à rien
  s = run(0);
  assert.notEqual(s.decision?.tag, 'oppDonTarget');
  assert.ok(hasKeyword(s, 0, mine(s, KRIEG), 'Rush'));
  assert.equal(def(KRIEG).activateMain!.useful!(s, 0, mine(s, KRIEG)), false);
  // un tour où il n'a pas été joué : pas d'activation
  s = scenario([KRIEGS, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: KRIEG }]);
    setChars(g, 1, [{ num: O_STUSSY, extra: { don: 3 } }]);
    setDon(g, 1, 0);
  });
  assert.equal(hasOption(s, `act:${mine(s, KRIEG).uid}`), false);
});

test('Pearl (OP15-011) : [Tour adverse] [Bloqueur] et +2000 avec un Leader {East Blue} ; [En cas de KO] KO d’un Personnage adverse de 6000 de base ou moins', () => {
  let s = scenario([KRIEGS, 'ST-21'], (g) => { setChars(g, 0, [{ num: PEARL }]); }, 1);
  assert.ok(hasBlocker(s, 0, mine(s, PEARL)));
  assert.equal(power(s, mine(s, PEARL).uid), 6000);
  s = scenario([KRIEGS, 'ST-21'], (g) => { setChars(g, 0, [{ num: PEARL }]); }, 0);
  assert.equal(hasBlocker(s, 0, mine(s, PEARL)), false);
  assert.equal(power(s, mine(s, PEARL).uid), 4000);
  s = scenario([KRIEG_LUFFY, 'ST-21'], (g) => { setChars(g, 0, [{ num: PEARL }]); }, 1);
  assert.equal(hasBlocker(s, 0, mine(s, PEARL)), false);
  assert.equal(power(s, mine(s, PEARL).uid), 4000);

  // mise KO en combat par Chopper (6000 contre 6000)
  const ko = (deck: string, attacker: string) => {
    let t = oppAttacks(deck, (g) => {
      setHand(g, 0, []);
      setChars(g, 0, [{ num: PEARL, extra: { rested: true } }]);
      setChars(g, 1, [{ num: attacker }, { num: O_VEGAPUNK }]);
    }, PEARL, attacker);
    if (t.decision?.kind === 'counter') t = choose(t, 'pass');
    return t;
  };
  s = ko(KRIEGS, O_CHOPPER);
  expectTag(s, 'oppKo');
  assert.deepEqual(offered(s).sort(), [O_CHOPPER, O_VEGAPUNK].sort());
  aiAnswers(s);
  s = pick(s, O_CHOPPER);
  assert.ok(inTrash(s, 1, O_CHOPPER) && inTrash(s, 0, PEARL));
  coherent(s);
  s = ko(KRIEG_LUFFY, O_STUSSY);
  assert.notEqual(s.decision?.tag, 'oppKo');
  assert.ok(inTrash(s, 0, PEARL));
});

test('Événement de Krieg (OP15-037) : [Principale] prendre une carte {East Blue} autre que lui parmi 5 ; [Déclenchement] piocher 1 carte', () => {
  let s = scenario([KRIEGS, 'ST-21'], (g) => {
    setHand(g, 0, [OUTCOME]);
    setDeckTop(g, 0, [OUTCOME, JINBE, PEARL, ORDERS, STUSSY]);
    setDon(g, 0, 1);
  });
  s = play(s, OUTCOME);
  expectTag(s, 'pick');
  assert.deepEqual(offered(s).sort(), [ORDERS, PEARL].sort(), 'ni lui-même ni les cartes sans {East Blue}');
  aiAnswers(s);
  s = keepOrder(pick(s, PEARL));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [PEARL]);
  coherent(s);
  s = oppAttacks(KRIEGS, (g) => {
    setLife(g, 0, [OUTCOME]);
    setHand(g, 0, []);
  });
  s = choose(s, 'trigger');
  assert.equal(s.players[0].hand.length, 1);
});

test('Événement de Krieg (OP15-038) : [Principale] un Personnage adverse épuisé avec 2 DON!! reste épuisé ; [Contre] +4000 à un [Krieg]', () => {
  const run = (don: number, cost = 0) => scenario([KRIEGS, 'ST-21'], (g) => {
    setHand(g, 0, [ORDERS]);
    const [luffy] = setChars(g, 1, [{ num: O_LUFFY, extra: { rested: true, don } }, { num: O_STUSSY, extra: { don: 2 } }]);
    if (cost) addMod(g, { uid: luffy.uid, stat: 'cost', amount: cost, until: 'turn', source: 'Test' });
    setDon(g, 0, 1);
    setDon(g, 1, 0);
  });
  let s = run(2);
  assert.ok(def(ORDERS).mainUseful!(s, 0));
  s = play(s, ORDERS);
  expectTag(s, 'oppLock');
  assert.deepEqual(offered(s), [O_LUFFY], 'Stussy est redressé');
  aiAnswers(s);
  s = pick(s, O_LUFFY);
  const luffy = theirs(s, O_LUFFY).uid;
  assert.ok(s.mods.some((m) => m.uid === luffy && m.stat === 'noRefresh'));
  // la phase de Recharge adverse : Luffy reste épuisé
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.ok(theirs(s, O_LUFFY).rested);
  assert.equal(theirs(s, O_STUSSY).rested, false);
  // conditions fausses : 1 DON!!, coût 9
  assert.equal(def(ORDERS).mainUseful!(run(1), 0), false);
  assert.equal(def(ORDERS).mainUseful!(run(2, 4), 0), false);

  // [Contre] : sur le Leader Krieg, pas sur un autre Personnage
  s = oppAttacks(KRIEGS, (g) => {
    setHand(g, 0, [ORDERS]);
    setChars(g, 0, [{ num: EB_ALVIDA }]);
    setDon(g, 0, 1);
  });
  assert.equal(def(ORDERS).counterPower!(s, 0, s.players[0].leader.uid), 4000);
  assert.equal(def(ORDERS).counterPower!(s, 0, mine(s, EB_ALVIDA).uid), 0);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'ownPower');
  assert.deepEqual(offered(s), [KRIEG_L]);
  aiAnswers(s);
  const life = s.players[0].life.length;
  s = choose(s, (o) => o.uid === s.players[0].leader.uid);
  assert.ok(logHas(s, 'gagne +4000 de puissance pour le combat (Ordres de Krieg)'));
  assert.ok(logHas(s, "l'attaque est repoussée (5000 contre 9000)"));
  assert.equal(s.players[0].life.length, life);
  coherent(s);
});

// ===== Arlong =====

test('Arlong (EB02-011) : [Jouée] 1 DON!! épuisée au Leader {Hommes-poissons} ou {East Blue} ; un Personnage adverse de coût 5 ou moins ne peut pas être épuisé', () => {
  const run = (deck: string) => {
    let s = scenario([deck, 'ST-21'], (g) => {
      setHand(g, 0, [ARLONG_3]);
      setChars(g, 1, [{ num: O_LUFFY }, { num: O_STUSSY }]);
      setDon(g, 0, 3, 2);
    });
    s = play(s, ARLONG_3);
    return s;
  };
  let s = run(ARLONGS);
  assert.equal(s.players[0].leader.don, 1);
  expectTag(s, 'oppLock');
  aiAnswers(s);
  s = pick(s, O_LUFFY);
  const luffy = theirs(s, O_LUFFY);
  assert.equal(canBeRested(s, luffy.uid), false);
  assert.equal(attackAbility(s, 1, luffy).can, false);
  // jusqu'à la fin du prochain tour adverse
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.equal(canBeRested(s, theirs(s, O_LUFFY).uid), false);
  coherent(s);
  // Leader sans {Hommes-poissons} ni {East Blue} : pas de DON!!, le reste quand même
  s = run(ARLONG_LUFFY);
  assert.equal(s.players[0].leader.don, 0);
  expectTag(s, 'oppLock');
});

test('Arlong (OP06-023) : [Jouée] défausser 1 carte : le Leader adverse épuisé ne peut pas attaquer ; [Déclenchement] épuiser un Personnage adverse de coût 4 ou moins', () => {
  const run = (rested: boolean, hand = [ARLONG_4, JINBE]) => {
    let s = scenario([ARLONGS, 'ST-21'], (g) => {
      setHand(g, 0, hand);
      g.players[1].leader.rested = rested;
      setDon(g, 0, 4);
    });
    s = play(s, ARLONG_4);
    return s;
  };
  let s = run(true);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'oppLock');
  assert.ok(inTrash(s, 0, JINBE), 'seule carte en main : défaussée sans question');
  s = choose(s, (o) => o.uid === s.players[1].leader.uid);
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.equal(attackAbility(s, 1, s.players[1].leader).can, false, 'redressé, mais il ne peut pas attaquer');
  coherent(s);
  // Leader adverse redressé, ou rien à défausser : pas de question
  for (const [rested, hand] of [[false, [ARLONG_4, JINBE]], [true, [ARLONG_4]]] as const) {
    s = run(rested, [...hand]);
    assert.equal(s.decision?.kind, 'main');
  }
  // [Déclenchement]
  s = oppAttacks(ARLONGS, (g) => {
    setLife(g, 0, [ARLONG_4]);
    setHand(g, 0, []);
    setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }, { num: O_LUFFY }]);
  });
  s = choose(s, 'trigger');
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s).sort(), [O_CHOPPER], 'Stussy attaque (déjà épuisé), Luffy coûte 5');
  s = pick(s, O_CHOPPER);
  assert.ok(theirs(s, O_CHOPPER).rested);
});
