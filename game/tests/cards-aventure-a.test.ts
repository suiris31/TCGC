// Cartes des adversaires de l'aventure, liste A (tâche 1.15) : la Marine de Shells Town (Leader Kobby), le Chat Noir
// (Kuro) et la Marine de Loguetown (Smoker). Decks d'essai faits des cartes de la liste, un par Leader, et un au Leader
// Luffy ST21-001 pour les conditions fausses ; l'adversaire joue ST-21 (ou la Marine de Smoker, pour ses effets).
import assert from 'node:assert/strict';
import test from 'node:test';
import { AVENTURE_A } from '../engine/cards/aventure-a.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { canBeKO, def, fieldCost, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon,
  setHand, setLife, take,
} from './helpers.ts';

const LIST = Object.keys(AVENTURE_A).filter((n) => def(n).category !== 'LEADER');
const FILLERS = ['OP02-107', 'OP04-023', 'OP11-094', 'ST06-007', 'ST06-011', 'ST06-013', 'OP11-017', 'OP03-023', 'OP15-027'];
const cards = Object.fromEntries([...LIST, ...FILLERS].map((n) => [n, 4]));
const KOBBY = 'TEST-AV-KOBBY';
const SMOKER = 'TEST-AV-SMOKER';
const KURO = 'TEST-AV-KURO';
const PLAIN = 'TEST-AV-LUFFY';
DECKS[KOBBY] = { id: KOBBY, name: 'Essai', series: 'TEST', leader: 'OP11-001', cards };
DECKS[SMOKER] = { id: SMOKER, name: 'Essai', series: 'TEST', leader: 'OP02-093', cards };
DECKS[KURO] = { id: KURO, name: 'Essai', series: 'TEST', leader: 'OP03-021', cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };

// cartes d'essai
const MOMONGA = 'ST06-011';   // {Marine} noir, coût 4, 6000
const MORGAN = 'OP11-094';    // {Marine} noir, coût 6, 8000
const DOBERMAN = 'OP02-107';  // {Marine} noir, coût 2, 4000
const TBONE = 'ST06-013';     // {Marine} noir, coût 3, 5000
const DRAKE = 'OP11-017';     // {Marine} {SWORD} rouge, coût 6, 7000
const ALVIDA = 'OP03-023';    // {East Blue} vert, coût 1, 3000
const KURO6 = 'OP04-023';     // Kuro {East Blue}, coût 6, 8000
const MIHAWK = 'OP15-027';    // lit les DON!! données aux Personnages adverses
// adversaire ST-21
const O_BONNEY = 'ST21-004';  // coût 1, 3000
const O_STUSSY = 'ST21-006';  // coût 3, 5000
const O_CHOPPER = 'ST21-008'; // coût 4, 6000
const O_LUFFY = 'ST21-014';   // coût 5, 6000

const mine = (s: GameState, num: string, p: PlayerId = 0) => s.players[p].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const anyCard = (s: GameState) => choose(s, (o) => o.id.startsWith('card:'));
// le défenseur ne bloque pas et ne contre pas
function noDefense(s: GameState) {
  while (s.decision && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
}
// questions répétées (défausses, cartes à placer sous le deck) : la première carte proposée, puis l'ordre gardé
function answerAll(s: GameState, tags: string[]) {
  while (s.decision && tags.includes(s.decision.tag ?? '')) s = s.decision.tag === 'bottomOrder' ? act(s, 'keep') : anyCard(s);
  return s;
}
const costMinus = (uid: number, amount: number) => ({ uid, stat: 'cost' as const, amount: -amount, until: 'turn' as const, source: 'essai' });
// Garp (ST06-012) du joueur 1 met KO un Personnage du joueur 0 (effet adverse)
function garpKo(s: GameState, victim: number) {
  s = answerAll(act(s, `act:${mine(s, 'ST06-012', 1).uid}`), ['discard']);
  expectTag(s, 'oppKo');
  return choose(s, `card:${victim}`);
}

test('Moteur : « aucun de vos Personnages ne peut être mis KO pour tout le tour » (White Out), Personnages joués ensuite compris', () => {
  // tour du joueur 1 : le joueur 0 est protégé pour ce tour
  let s = scenario(['ST-21', 'ST-21'], (g) => {
    setChars(g, 0, [{ num: O_STUSSY, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_LUFFY }]);
    g.players[0].noKoTurn = g.turn;
  }, 1);
  const stussy = mine(s, O_STUSSY).uid;
  assert.equal(canBeKO(s, stussy, 'effect', 1), false);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, stussy));
  assert.ok(s.players[0].chars.some((c) => c.uid === stussy), '6000 contre 5000 : pas mis KO');
  coherent(s);
  // un Personnage arrivé après l'effet est protégé aussi ; l'adversaire, lui, ne l'est pas
  const late = s.players[0].deck.find((c) => c.num === O_LUFFY)!;
  s.players[0].deck = s.players[0].deck.filter((c) => c !== late);
  s.players[0].chars.push({ ...late, rested: false, don: 0, playedTurn: s.turn, usedOpt: [] });
  assert.equal(canBeKO(s, late.uid, 'battle', 1), false);
  assert.equal(canBeKO(s, theirs(s, O_LUFFY).uid, 'effect', 0), true);
  // le tour suivant, la protection a pris fin
  s.turn++;
  assert.equal(canBeKO(s, stussy, 'battle', 1), true);
  // sans la protection : mis KO
  s = scenario(['ST-21', 'ST-21'], (g) => {
    setChars(g, 0, [{ num: O_STUSSY, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_LUFFY }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, mine(s, O_STUSSY).uid));
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
});

// ---------- Marine de Shells Town ----------

test('Kobby (Leader OP11-001) : ses Personnages {SWORD} attaquent un Personnage le tour où ils sont joués', () => {
  let s = scenario([KOBBY, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: DRAKE, extra: { playedTurn: g.turn } }, { num: MOMONGA, extra: { playedTurn: g.turn } }]);
    setChars(g, 1, [{ num: O_STUSSY, extra: { rested: true } }]);
  });
  assert.equal(hasKeyword(s, 0, mine(s, DRAKE), 'Rush: Character'), true);
  assert.equal(hasKeyword(s, 0, mine(s, MOMONGA), 'Rush: Character'), false, 'pas {SWORD}');
  assert.equal(hasKeyword(s, 0, s.players[0].leader, 'Rush: Character'), false, 'le Leader lui-même');
  assert.ok(hasOption(s, `attack:${mine(s, DRAKE).uid}:${theirs(s, O_STUSSY).uid}`));
  assert.equal(hasOption(s, `attack:${mine(s, DRAKE).uid}:${s.players[1].leader.uid}`), false, 'pas le Leader adverse');
  s = scenario([PLAIN, 'ST-21'], (g) => { setChars(g, 0, [{ num: DRAKE, extra: { playedTurn: g.turn } }]); });
  assert.equal(hasKeyword(s, 0, mine(s, DRAKE), 'Rush: Character'), false, 'autre Leader');
});

test('Kobby (Leader OP11-001) : [Une fois par tour] 3 cartes de la Défausse sous le deck au lieu de perdre un Personnage {Marine} de 7000 ou moins', () => {
  let s = scenario([KOBBY, SMOKER], (g) => {
    setChars(g, 0, [{ num: MOMONGA }, { num: MORGAN }]);
    g.players[0].trash = [take(g, 0, DOBERMAN), take(g, 0, TBONE), take(g, 0, ALVIDA)];
    setChars(g, 1, [{ num: 'ST06-012' }]);
    setHand(g, 1, ['ST06-010']);
  }, 1);
  const leader = s.players[0].leader;
  s = garpKo(s, mine(s, MOMONGA).uid);
  expectTag(s, 'replace');
  assert.equal(s.decision!.player, 0);
  aiAnswers(s);
  s = choose(s, `replace:${leader.uid}`);
  assert.equal(s.decision?.player, 0, 'le propriétaire choisit les cartes');
  s = answerAll(s, ['trashToDeck', 'bottomOrder']);
  assert.ok(mine(s, MOMONGA), 'Momonga reste');
  assert.equal(s.players[0].trash.length, 0);
  assert.deepEqual(s.players[0].deck.slice(-3).map((c) => c.num).sort(), [ALVIDA, DOBERMAN, TBONE].sort());
  assert.ok(s.players[0].leader.usedOpt.includes('replace'), 'une fois par tour');
  assert.ok(logHas(s, 'reste sur le terrain (Kobby)'));
  coherent(s);
  // conditions fausses : 8000 de base, moins de 3 cartes dans la Défausse, pas {Marine}
  const r = def('OP11-001').replaceRemoval!;
  s.players[0].leader.usedOpt = [];
  assert.equal(r.condition(s, 0, leader, mine(s, MORGAN)), false, '8000');
  s.players[0].trash = [take(s, 0, DOBERMAN)];
  assert.equal(r.condition(s, 0, leader, mine(s, MOMONGA)), false, '1 carte');
  s.players[0].trash.push(take(s, 0, TBONE), take(s, 0, TBONE));
  assert.equal(r.condition(s, 0, leader, mine(s, MOMONGA)), true);
  assert.equal(r.condition(s, 0, leader, { ...mine(s, MOMONGA), num: ALVIDA }), false, 'pas {Marine}');
  // sans assez de cartes dans la Défausse : mis KO sans question
  s = scenario([KOBBY, SMOKER], (g) => {
    setChars(g, 0, [{ num: MOMONGA }]);
    g.players[0].trash = [];
    setChars(g, 1, [{ num: 'ST06-012' }]);
    setHand(g, 1, ['ST06-010']);
  }, 1);
  s = garpKo(s, mine(s, MOMONGA).uid);
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
});

test('Kobby (OP15-009) : son Leader reçoit −2000 pour le tour au lieu de perdre un Personnage de 7000 de base ou moins', () => {
  let s = scenario([KOBBY, SMOKER], (g) => {
    setChars(g, 0, [{ num: 'OP15-009' }, { num: MOMONGA }, { num: MORGAN }]);
    g.players[0].trash = [];
    setChars(g, 1, [{ num: 'ST06-012' }]);
    setHand(g, 1, ['ST06-010']);
  }, 1);
  const kobby = mine(s, 'OP15-009');
  s = garpKo(s, mine(s, MOMONGA).uid);
  expectTag(s, 'replace');
  assert.ok(!hasOption(s, `replace:${s.players[0].leader.uid}`), 'Défausse vide : pas le Leader');
  s = choose(s, `replace:${kobby.uid}`);
  assert.ok(mine(s, MOMONGA));
  assert.equal(power(s, s.players[0].leader.uid), 3000);
  coherent(s);
  const r = def('OP15-009').replaceRemoval!;
  assert.equal(r.condition(s, 0, kobby, mine(s, MOMONGA)), true);
  assert.equal(r.condition(s, 0, kobby, mine(s, MORGAN)), false, '8000 de base');
  assert.equal(r.oncePerTurn, false);
  // refusé : mis KO
  s = scenario([KOBBY, SMOKER], (g) => {
    setChars(g, 0, [{ num: 'OP15-009' }, { num: MOMONGA }]);
    setChars(g, 1, [{ num: 'ST06-012' }]);
    setHand(g, 1, ['ST06-010']);
  }, 1);
  s = choose(garpKo(s, mine(s, MOMONGA).uid), 'none');
  assert.equal(mine(s, MOMONGA), undefined);
  assert.equal(power(s, s.players[0].leader.uid), 5000);
});

test('Ripper (OP11-096) : [Bloqueur] avec un autre Personnage {Marine} noir qu’un [Ripper]', () => {
  const blocker = (others: string[]) => {
    const s = scenario([KOBBY, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP11-096' }, ...others.map((num) => ({ num }))]); });
    return hasKeyword(s, 0, s.players[0].chars[0], 'Blocker');
  };
  assert.equal(blocker([MOMONGA]), true);
  assert.equal(blocker([]), false);
  assert.equal(blocker(['OP11-096']), false, 'un autre Ripper');
  assert.equal(blocker(['OP15-009']), false, 'Kobby est rouge');
  assert.equal(blocker([ALVIDA]), false, 'pas {Marine}');
});

test('« Je deviendrai officier de la marine !! » (OP11-099) : 1 carte {Marine} parmi 3, le reste dans la Défausse ; [Déclenchement] le même effet', () => {
  let s = scenario([KOBBY, 'ST-21'], (g) => { setHand(g, 0, ['OP11-099']); setDon(g, 0, 1); setDeckTop(g, 0, ['OP11-099', MOMONGA, ALVIDA]); });
  s = play(s, 'OP11-099');
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Momonga', 'Aucune'], 'ni lui-même, ni une carte sans {Marine}');
  aiAnswers(s);
  s = choose(s, (o) => o.label === 'Momonga');
  assert.ok(s.players[0].hand.some((c) => c.num === MOMONGA));
  assert.deepEqual(s.players[0].trash.map((c) => c.num).sort(), ['OP11-099', 'OP11-099', ALVIDA].sort());
  coherent(s);
  s = scenario([KOBBY, 'ST-21'], (g) => { setHand(g, 0, ['OP11-099']); setDon(g, 0, 1); setDeckTop(g, 0, [ALVIDA, ALVIDA, MIHAWK]); });
  s = play(s, 'OP11-099');
  assert.equal(s.decision?.kind, 'main', 'rien à prendre');
  assert.equal(s.players[0].trash.length, 4);
  // [Déclenchement]
  s = scenario([KOBBY, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, ['OP11-099', DOBERMAN]);
    setDeckTop(g, 0, [TBONE, ALVIDA, ALVIDA]);
    setChars(g, 1, [{ num: O_LUFFY }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'pick');
  s = choose(s, (o) => o.label === 'T-Bone');
  assert.ok(s.players[0].hand.some((c) => c.num === TBONE));
  coherent(s);
});

test('White Out (ST06-016) : [Contre] +2000 ; [Déclenchement] piocher 1 carte et aucun Personnage mis KO pour le tour', () => {
  let s = scenario([KOBBY, 'ST-21'], (g) => { setHand(g, 0, ['ST06-016']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_LUFFY }]); }, 1);
  s = attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid);
  if (s.decision?.kind === 'blocker') s = act(s, 'noblock');
  aiAnswers(s);
  const life = s.players[0].life.length;
  s = noDefense(choose(s, (o) => o.id.startsWith('cevent:')));
  assert.ok(logHas(s, 'gagne +2000 de puissance pour le combat (White Out)'));
  assert.equal(s.players[0].life.length, life, '6000 contre 7000 : attaque repoussée');
  coherent(s);
  // [Déclenchement]
  s = scenario([KOBBY, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, ['ST06-016', DOBERMAN]);
    setChars(g, 0, [{ num: MOMONGA, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  assert.equal(s.players[0].noKoTurn, s.turn);
  s = noDefense(attack(s, theirs(s, O_CHOPPER).uid, mine(s, MOMONGA).uid));
  assert.ok(mine(s, MOMONGA), '6000 contre 6000 : pas mis KO');
  coherent(s);
});

// ---------- Chat Noir ----------

test('Kuro (OP14-025) : [Jouée] avec le Leader [Kuro], jouer de sa main un Personnage {East Blue} de coût 6 ou moins', () => {
  let s = scenario([KURO, 'ST-21'], (g) => { setHand(g, 0, ['OP14-025', 'OP14-025', KURO6, MOMONGA]); setDon(g, 0, 7); });
  s = play(s, 'OP14-025');
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Kuro (coût 6)', 'Aucun'], 'ni coût 7, ni Momonga');
  aiAnswers(s);
  s = choose(s, (o) => o.label.startsWith('Kuro'));
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP14-025', KURO6].sort());
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP14-025', KURO6]); setDon(g, 0, 7); });
  s = play(s, 'OP14-025');
  assert.equal(s.decision?.kind, 'main', 'Leader Luffy : rien');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP14-025']);
});

test('Jango (OP15-026) : [Jouée] 1 carte {East Blue} parmi 3 ; [Activation : Principale] se défausser : 1 DON!! épuisée adverse à un Personnage adverse', () => {
  let s = scenario([KURO, 'ST-21'], (g) => { setHand(g, 0, ['OP15-026']); setDon(g, 0, 1); setDeckTop(g, 0, [MOMONGA, ALVIDA, KURO6]); });
  s = play(s, 'OP15-026');
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Alvida', 'Kuro', 'Aucune']);
  s = keepOrder(choose(s, (o) => o.label === 'Alvida'));
  assert.ok(s.players[0].hand.some((c) => c.num === ALVIDA));
  assert.deepEqual(s.players[0].deck.slice(-2).map((c) => c.num).sort(), [KURO6, MOMONGA].sort());
  coherent(s);
  // l'effet [Activation : Principale] ne sert que si une de ses cartes lit les DON!! données aux Personnages adverses
  for (const withMihawk of [false, true]) {
    s = scenario([KURO, 'ST-21'], (g) => {
      setHand(g, 0, withMihawk ? [MIHAWK] : []);
      setChars(g, 0, [{ num: 'OP15-026' }]);
      setChars(g, 1, [{ num: O_STUSSY }]);
      setDon(g, 1, 0, 3);
    });
    const jango = mine(s, 'OP15-026');
    assert.equal(def('OP15-026').activateMain!.useful!(s, 0, jango), withMihawk);
    s = act(s, `act:${jango.uid}`);
    expectTag(s, 'oppDonTarget');
    aiAnswers(s);
    s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
    assert.equal(theirs(s, O_STUSSY).don, 1);
    assert.equal(s.players[1].donRested, 2);
    assert.ok(s.players[0].trash.some((c) => c.uid === jango.uid));
    coherent(s);
  }
});

test('Les frères Nyaban (OP15-028) : [Jouée] avec un Leader {East Blue}, 1 DON!! de la zone de Coût adverse à un Personnage adverse', () => {
  for (const [active, rested] of [[2, 3], [0, 3]]) {
    let s = scenario([KURO, 'ST-21'], (g) => { setHand(g, 0, ['OP15-028']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_STUSSY }]); setDon(g, 1, active, rested); });
    s = play(s, 'OP15-028');
    expectTag(s, 'oppDonTarget');
    aiAnswers(s);
    s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
    assert.equal(theirs(s, O_STUSSY).don, 1);
    assert.deepEqual([s.players[1].donActive, s.players[1].donRested], active ? [active - 1, rested] : [0, rested - 1], 'une redressée d’abord');
    coherent(s);
  }
  let s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, ['OP15-028']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_STUSSY }]); setDon(g, 1, 2, 3); });
  s = play(s, 'OP15-028');
  assert.equal(s.decision?.kind, 'main', 'Leader Luffy : rien');
  assert.equal(theirs(s, O_STUSSY).don, 0);
});

// ---------- Marine de Loguetown ----------

test('Smoker (Leader OP02-093) : [DON!! x1] [Une fois par tour] −1 de coût, puis +1000 s’il y a un Personnage de coût 0', () => {
  for (const target of [O_BONNEY, O_STUSSY]) {
    let s = scenario([SMOKER, 'ST-21'], (g) => {
      g.players[0].leader.don = 1;
      setDon(g, 0, 2);
      setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }]);
    });
    const leader = s.players[0].leader.uid;
    s = act(s, `act:${leader}`);
    expectTag(s, 'oppCost');
    aiAnswers(s);
    s = choose(s, `card:${theirs(s, target).uid}`);
    assert.equal(fieldCost(s, theirs(s, target).uid), target === O_BONNEY ? 0 : 2);
    assert.equal(power(s, leader), target === O_BONNEY ? 7000 : 6000, '5000 + 1 DON!! (+1000 si coût 0)');
    assert.equal(hasOption(s, `act:${leader}`), false, 'une fois par tour');
    coherent(s);
  }
  const s = scenario([SMOKER, 'ST-21'], (g) => { setChars(g, 1, [{ num: O_BONNEY }]); });
  assert.equal(hasOption(s, `act:${s.players[0].leader.uid}`), false, 'sans DON!!');
});

test('Smoker (OP02-102) : pas mis KO par un effet ; [En attaquant] +2000 s’il y a un Personnage de coût 0', () => {
  for (const zero of [true, false]) {
    let s = scenario([SMOKER, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: 'OP02-102' }]);
      setChars(g, 1, [{ num: O_BONNEY }]);
      if (zero) g.mods.push(costMinus(g.players[1].chars[0].uid, 1));
    });
    const smoker = mine(s, 'OP02-102').uid;
    assert.equal(canBeKO(s, smoker, 'effect', 1), false);
    assert.equal(canBeKO(s, smoker, 'effect', 0), false, 'ses propres effets non plus');
    assert.equal(canBeKO(s, smoker, 'battle', 1), true);
    s = attack(s, smoker, s.players[1].leader.uid);
    assert.equal(power(s, smoker), zero ? 6000 : 4000);
  }
});

test('Ice Age (OP02-117) : [Principale] −5 de coût ; [Déclenchement] KO d’un Personnage adverse de coût 3 ou moins', () => {
  let s = scenario([SMOKER, 'ST-21'], (g) => { setHand(g, 0, ['OP02-117']); setDon(g, 0, 1); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(play(s, 'OP02-117'), `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_LUFFY).uid), 0);
  coherent(s);
  s = scenario([SMOKER, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, ['OP02-117', DOBERMAN]);
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_STUSSY }, { num: O_CHOPPER }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), false, 'coût 4');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(theirs(s, O_STUSSY), undefined);
  coherent(s);
});

test('Kobby (ST06-002) : [Jouée] défausser 1 carte : KO d’un Personnage adverse de coût 0', () => {
  let s = scenario([SMOKER, 'ST-21'], (g) => {
    setHand(g, 0, ['ST06-002', DOBERMAN]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }]);
    g.mods.push(costMinus(g.players[1].chars[0].uid, 1));
  });
  s = choose(play(s, 'ST06-002'), 'yes');
  s = answerAll(s, ['discard']);
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), false);
  s = choose(s, `card:${theirs(s, O_BONNEY).uid}`);
  assert.equal(theirs(s, O_BONNEY), undefined);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
  // aucun Personnage de coût 0 : la défausse n'est pas proposée (elle ne servirait à rien)
  s = scenario([SMOKER, 'ST-21'], (g) => { setHand(g, 0, ['ST06-002', DOBERMAN]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = play(s, 'ST06-002');
  assert.equal(s.decision?.kind, 'main', 'pas de question');
  assert.equal(s.players[0].hand.length, 1, 'rien défaussé');
});

test('Smoker (ST06-004) : pas mis KO par un effet ; [DON!! x1] [Double attaque] s’il y a un Personnage de coût 0', () => {
  const doubleAttack = (don: number, zero: boolean) => {
    const s = scenario([SMOKER, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: 'ST06-004', extra: { don } }]);
      setChars(g, 1, [{ num: O_BONNEY }]);
      setDon(g, 0, 0);
      if (zero) g.mods.push(costMinus(g.players[1].chars[0].uid, 1));
    });
    assert.equal(canBeKO(s, mine(s, 'ST06-004').uid, 'effect', 1), false);
    return hasKeyword(s, 0, mine(s, 'ST06-004'), 'Double Attack');
  };
  assert.equal(doubleAttack(1, true), true);
  assert.equal(doubleAttack(0, true), false);
  assert.equal(doubleAttack(1, false), false);
});

test('Tashigi (ST06-006), Hina (ST06-008), Hermep (ST06-010) : −2 (en s’épuisant), −4, −3 de coût', () => {
  let s = scenario([SMOKER, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'ST06-006' }]); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(act(s, `act:${mine(s, 'ST06-006').uid}`), `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(fieldCost(s, theirs(s, O_LUFFY).uid), 3);
  assert.equal(mine(s, 'ST06-006').rested, true);
  assert.equal(hasOption(s, `act:${mine(s, 'ST06-006').uid}`), false, 'épuisée');
  coherent(s);
  for (const [num, cost] of [['ST06-008', 1], ['ST06-010', 2]] as const) {
    s = scenario([SMOKER, 'ST-21'], (g) => { setHand(g, 0, [num]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_LUFFY }]); });
    s = play(s, num);
    expectTag(s, 'oppCost');
    aiAnswers(s);
    s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
    assert.equal(fieldCost(s, theirs(s, O_LUFFY).uid), cost);
    coherent(s);
  }
});

test('Monkey D. Garp (ST06-012) : défausser 1 carte et s’épuiser : KO d’un Personnage adverse de coût 4 ou moins', () => {
  let s = scenario([SMOKER, 'ST-21'], (g) => { setHand(g, 0, [DOBERMAN]); setChars(g, 0, [{ num: 'ST06-012' }]); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); });
  const garp = mine(s, 'ST06-012').uid;
  s = answerAll(act(s, `act:${garp}`), ['discard']);
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), false, 'coût 5');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(theirs(s, O_CHOPPER), undefined);
  assert.equal(mine(s, 'ST06-012').rested, true);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
  s = scenario([SMOKER, 'ST-21'], (g) => { setHand(g, 0, []); setChars(g, 0, [{ num: 'ST06-012' }]); setChars(g, 1, [{ num: O_CHOPPER }]); });
  assert.equal(hasOption(s, `act:${mine(s, 'ST06-012').uid}`), false, 'main vide');
});

test('Onde de choc (ST06-014) : [Contre] +4000 puis KO d’un Personnage adverse redressé de coût 3 ou moins ; [Déclenchement] KO coût 4 ou moins', () => {
  let s = scenario([SMOKER, 'ST-21'], (g) => {
    setHand(g, 0, ['ST06-014']);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_STUSSY }, { num: O_CHOPPER }, { num: O_BONNEY, extra: { rested: true } }]);
  }, 1);
  assert.equal(def('ST06-014').counterExtra!(s, 0), true);
  s = attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid);
  if (s.decision?.kind === 'blocker') s = act(s, 'noblock');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.equal(power(s, s.players[0].leader.uid), 9000);
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid), [theirs(s, O_STUSSY).uid], 'redressé, coût 3 ou moins');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(theirs(s, O_STUSSY), undefined);
  coherent(noDefense(s));
  // rien à mettre KO : le [Contre] ne sert qu'à la puissance
  s = scenario([SMOKER, 'ST-21'], (g) => { setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  assert.equal(def('ST06-014').counterExtra!(s, 0), false);
  // [Déclenchement]
  s = scenario([SMOKER, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, ['ST06-014', DOBERMAN]);
    setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER, extra: { rested: true } }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(theirs(s, O_CHOPPER), undefined);
  coherent(s);
});
