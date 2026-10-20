// OP03 verte (tâche 1.9 du plan « Aventure ») : un test par carte à effet, avec sa condition vraie et fausse. Decks
// d'essai au Leader Kuro et au Leader Arlong ({East Blue}), et au Leader Zoro OP12-020 ({Supernovae}) pour les
// conditions « si votre Leader est de type {East Blue} » fausses ; adversaire ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardStatus } from '../engine/cards/index.ts';
import { OP03_VERTE } from '../engine/cards/op03-verte.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { addMod, def, hasKeyword, power, triggerEffect } from '../engine/rules.ts';
import type { GameState, Option } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon,
  setHand, setLife,
} from './helpers.ts';

// OP03-023 à OP03-039 (les Leaders à part), plus Jinbe et Stussy de ST-21 (rouges, pas {East Blue})
const GREEN = Array.from({ length: 17 }, (_, i) => `OP03-0${23 + i}`);
const cards = { ...Object.fromEntries(GREEN.map((n) => [n, 3])), 'ST21-005': 2, 'ST21-006': 2 };
const KURO = 'TEST-OP03V-KURO';
const ARLONG = 'TEST-OP03V-ARLONG';
const OTHER = 'TEST-OP03V-ZORO';
DECKS[KURO] = { id: KURO, name: 'Essai', series: 'TEST', leader: 'OP03-021', cards };
DECKS[ARLONG] = { id: ARLONG, name: 'Essai', series: 'TEST', leader: 'OP03-022', cards };
DECKS[OTHER] = { id: OTHER, name: 'Essai', series: 'TEST', leader: 'OP12-020', cards };

// Mes cartes
const ALVIDA = 'OP03-023';    // coût 1, {East Blue}, sans effet
const GIN = 'OP03-024';
const KRIEG = 'OP03-025';     // coût 6, {East Blue}
const KUROOBI = 'OP03-026';
const SHAM = 'OP03-027';
const JANGO = 'OP03-028';
const CHEW = 'OP03-029';      // coût 4, [Déclenchement]
const NAMI = 'OP03-030';
const BUGGY = 'OP03-032';
const HATCHAN = 'OP03-033';   // coût 4, [Déclenchement]
const BUCHI = 'OP03-034';
const MOMOO = 'OP03-035';     // coût 2, {East Blue}, sans effet
const BAG = 'OP03-036';       // Out-of-the-Bag
const TOOTH = 'OP03-037';     // Tooth Attack
const MH5 = 'OP03-038';       // Deathly Poison Gas Bomb MH5
const ONE_TWO = 'OP03-039';   // One, Two, Jango
const JINBE = 'ST21-005';     // rouge, pas {East Blue}
const STUSSY = 'ST21-006';    // rouge, pas {East Blue}

// Adversaire ST-21 (Personnages sans effet, sauf mention)
const O_VEGAPUNK = 'ST21-013';  // coût 1, 3000
const O_JINBE = 'ST21-005';     // coût 2, 4000
const O_STUSSY = 'ST21-006';    // coût 3, 5000
const O_CHOPPER = 'ST21-008';   // coût 4, 6000, <Sagesse>
const O_ZORO = 'ST21-015';      // coût 4, 5000, <Tranche>
const O_LUFFY = 'ST21-014';     // coût 5, 6000, [Initiative]

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
// Numéro de la carte d'une option (carte du terrain, de la main ou du deck) ; cartes proposées par la question en cours
const numOf = (s: GameState, o: Option) => o.num ?? s.players.flatMap((P) => [P.leader, ...P.chars, ...P.hand]).find((c) => c.uid === o.uid)?.num;
const offered = (s: GameState) => s.decision!.options.filter((o) => o.uid !== undefined).map((o) => numOf(s, o));
const pick = (s: GameState, num: string) => choose(s, (o) => o.uid !== undefined && numOf(s, o) === num);
const inTrash = (s: GameState, p: 0 | 1, num: string) => s.players[p].trash.some((c) => c.num === num);
const mainUseful = (s: GameState, num: string) => def(num).mainUseful!(s, 0);

// L'adversaire attaque mon Leader avec Stussy (5000 contre 5000 : l'attaque touche) ; ma Vie et ma main sont données
function hitMe(deck: string, life: string[], hand: string[] = [], opp: { num: string; extra?: { rested?: boolean } }[] = []) {
  let s = scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, hand);
    setChars(g, 0, []);
    setLife(g, 0, life);
    setChars(g, 1, [{ num: O_STUSSY }, ...opp]);
    setDon(g, 1, 0);
  }, 1);
  s = attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  return s;
}

test('OP03 verte : les 16 cartes à faire sont codées, Alvida, Pearl et Momoo jouables d’office', () => {
  assert.equal(Object.keys(OP03_VERTE).length, 16);
  for (let i = 21; i <= 39; i++) {
    const num = `OP03-0${i}`;
    assert.equal(cardStatus(num), ['OP03-023', 'OP03-031', 'OP03-035'].includes(num) ? 'auto' : 'coded', num);
  }
  // [Déclenchement] « jouez cette carte » génériques
  for (const num of [KUROOBI, CHEW, NAMI]) assert.ok(triggerEffect(num), num);
});

test('Kuro (OP03-021, Leader) : ③ et 2 Personnages {East Blue} épuisés : se redresser et épuiser un Personnage adverse de coût 5 ou moins', () => {
  const setup = (eb: string[], don: number) => (g: GameState) => {
    g.players[0].leader.rested = true;
    setChars(g, 0, [...eb, JINBE].map((num) => ({ num })));
    const [, chopper] = setChars(g, 1, [{ num: O_LUFFY }, { num: O_CHOPPER }]);
    addMod(g, { uid: chopper.uid, stat: 'cost', amount: 2, until: 'turn', source: 'Test' });  // coût 6
    setDon(g, 0, don);
  };
  let s = scenario([KURO, 'ST-21'], setup([ALVIDA, MOMOO, GIN, NAMI], 7));
  const leader = s.players[0].leader.uid;
  s = act(s, `act:${leader}`);
  expectTag(s, 'restCost');
  assert.deepEqual(offered(s), [ALVIDA, MOMOO, GIN, NAMI], 'Jinbe n’est pas {East Blue}');
  s = pick(s, ALVIDA);
  s = pick(s, MOMOO);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_LUFFY], 'Chopper est de coût 6');
  aiAnswers(s);
  s = pick(s, O_LUFFY);
  assert.equal(s.players[0].leader.rested, false);
  assert.equal(theirs(s, O_LUFFY).rested, true);
  assert.equal(s.players[0].donActive, 4);
  assert.ok(mine(s, ALVIDA).rested && mine(s, MOMOO).rested);
  coherent(s);
  // pas une fois par tour : encore 3 DON!! et 2 Personnages {East Blue} redressés
  assert.ok(hasOption(s, `act:${leader}`));
  // conditions fausses : un seul Personnage {East Blue} redressé, ou 2 DON!! seulement
  for (const [eb, don] of [[[ALVIDA], 7], [[ALVIDA, MOMOO], 2]] as const) {
    const t = scenario([KURO, 'ST-21'], setup([...eb], don));
    assert.equal(hasOption(t, `act:${t.players[0].leader.uid}`), false, `${eb.length} Personnages, ${don} DON!!`);
  }
});

test('Arlong (OP03-022, Leader) : [DON!! x2] [En attaquant] ① jouer un Personnage de coût 4 ou moins ayant un [Déclenchement]', () => {
  const run = (attached: number, active = 3, hand = [CHEW, GIN, KRIEG, HATCHAN]) => {
    const s = scenario([ARLONG, 'ST-21'], (g) => {
      setHand(g, 0, hand);
      setChars(g, 1, []);
      g.players[0].leader.don = attached;
      setDon(g, 0, active);
    });
    return attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  };
  let s = run(2);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'playFree');
  assert.deepEqual(offered(s), [CHEW, HATCHAN], 'Gin n’a pas de [Déclenchement], Krieg coûte 6');
  s = pick(s, CHEW);
  assert.ok(mine(s, CHEW));
  assert.equal(s.players[0].donActive, 2);
  assert.equal(s.decision?.player, 1, 'le combat continue');
  coherent(s);
  // 1 DON!! donnée, aucune DON!! redressée pour payer ①, ou aucun Personnage à jouer (① pas demandé) : rien
  for (const [attached, active, hand] of [[1, 3, [CHEW]], [2, 0, [CHEW]], [2, 3, [GIN, KRIEG]]] as const) {
    const t = run(attached, active, [...hand]);
    assert.equal(t.decision?.player, 1, `${attached} DON!! données, ${active} redressées, ${hand.length} cartes`);
    assert.equal(t.players[0].chars.length, 0);
    assert.equal(t.players[0].donActive, active);
  }
});

test('Gin (OP03-024) : avec un Leader {East Blue}, épuiser jusqu’à 2 Personnages adverses de coût 4 ou moins', () => {
  const run = (deck: string) => play(scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, [GIN]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: O_JINBE }, { num: O_CHOPPER }, { num: O_LUFFY }]);
  }), GIN);
  let s = run(KURO);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_JINBE, O_CHOPPER]);
  s = pick(s, O_JINBE);
  assert.deepEqual(offered(s), [O_CHOPPER]);
  s = pick(s, O_CHOPPER);
  assert.deepEqual(s.players[1].chars.map((c) => c.rested), [true, true, false]);
  coherent(s);
  s = run(OTHER);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(s.players[1].chars.every((c) => !c.rested));
});

test('Krieg (OP03-025) : défausser 1 carte pour mettre KO jusqu’à 2 Personnages adverses épuisés de coût 4 ou moins ; [DON!! x1] [Double attaque]', () => {
  const run = (hand: string[], rested = true) => play(scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, hand);
    setDon(g, 0, 6);
    setChars(g, 1, [
      { num: O_JINBE, extra: { rested } }, { num: O_CHOPPER, extra: { rested } }, { num: O_LUFFY, extra: { rested: true } },
      { num: O_STUSSY },
    ]);
  }), KRIEG);
  let s = run([KRIEG, ALVIDA]);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = pick(s, ALVIDA);
  expectTag(s, 'oppKo');
  assert.deepEqual(offered(s), [O_JINBE, O_CHOPPER], 'Luffy coûte 5, Stussy est redressé');
  s = pick(s, O_JINBE);
  s = pick(s, O_CHOPPER);
  assert.ok(inTrash(s, 1, O_JINBE) && inTrash(s, 1, O_CHOPPER) && inTrash(s, 0, ALVIDA));
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_LUFFY, O_STUSSY]);
  coherent(s);
  // refus de défausser, ou main vide : rien
  s = choose(run([KRIEG, ALVIDA]), 'no');
  assert.equal(s.players[1].chars.length, 4);
  s = run([KRIEG]);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[1].chars.length, 4);
  // aucun Personnage épuisé de coût 4 ou moins : la défausse n'est pas demandée (interprétation 262)
  s = run([KRIEG, ALVIDA], false);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].hand.length, 1);

  // [Double attaque] avec 1 DON!! donnée : 2 dégâts
  s = scenario([KURO, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: KRIEG }, { num: KRIEG, extra: { don: 1 } }]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setLife(g, 1, [O_JINBE, O_STUSSY, O_VEGAPUNK]);
    setDon(g, 0, 0);
  });
  const [bare, boosted] = s.players[0].chars;
  assert.equal(hasKeyword(s, 0, bare, 'Double Attack'), false);
  assert.equal(hasKeyword(s, 0, boosted, 'Double Attack'), true);
  s = attack(s, boosted.uid, s.players[1].leader.uid);
  for (let i = 0; i < 3 && s.decision?.player === 1; i++) s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  assert.equal(s.players[1].life.length, 1);
  coherent(s);
});

test('Kuroobi (OP03-026) : avec un Leader {East Blue}, épuiser jusqu’à 1 Personnage adverse ; [Déclenchement] jouez cette carte', () => {
  const run = (deck: string) => play(scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, [KUROOBI]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: O_LUFFY }]);
  }), KUROOBI);
  let s = run(KURO);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_LUFFY], 'quel que soit son coût');
  s = pick(s, O_LUFFY);
  assert.ok(theirs(s, O_LUFFY).rested);
  s = run(OTHER);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(theirs(s, O_LUFFY).rested, false);
  // [Déclenchement] : la carte est jouée, puis son [Jouée] épuise un Personnage adverse
  s = hitMe(KURO, [KUROOBI, ALVIDA], [], [{ num: O_LUFFY }]);
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.ok(mine(s, KUROOBI));
  expectTag(s, 'oppRest');
  s = pick(s, O_LUFFY);
  assert.ok(theirs(s, O_LUFFY).rested);
  coherent(s);
});

test('Sham (OP03-027) : avec un Leader {East Blue}, épuiser un Personnage adverse de coût 2 ou moins et, sans [Buchi], jouer [Buchi] de sa main', () => {
  const run = (deck: string, buchiOnField = false) => play(scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, [SHAM, BUCHI]);
    setDon(g, 0, 3);
    setChars(g, 0, buchiOnField ? [{ num: BUCHI }] : []);
    setChars(g, 1, [{ num: O_JINBE }, { num: O_STUSSY }]);
  }), SHAM);
  let s = run(KURO);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_JINBE]);
  s = pick(s, O_JINBE);
  expectTag(s, 'playFree');
  assert.deepEqual(offered(s), [BUCHI]);
  aiAnswers(s);
  s = pick(s, BUCHI);
  // Buchi [Jouée] : mettre KO Jinbe, épuisé par Sham
  expectTag(s, 'oppKo');
  s = pick(s, O_JINBE);
  assert.deepEqual(s.players[0].chars.map((c) => c.num), [SHAM, BUCHI]);
  assert.ok(inTrash(s, 1, O_JINBE));
  coherent(s);
  // [Buchi] déjà sur le terrain : pas de [Buchi] joué
  s = pick(run(KURO, true), O_JINBE);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(s.players[0].hand.some((c) => c.num === BUCHI));
  // Leader {Supernovae} : rien
  s = run(OTHER);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(s.players[1].chars.every((c) => !c.rested) && s.players[0].hand.some((c) => c.num === BUCHI));
});

test('Jango (OP03-028) : redresser un Leader ou Personnage {East Blue} de coût 6 ou moins, ou s’épuiser avec un Personnage adverse', () => {
  const run = (deck: string, restedLeader: boolean, mineRested: string[]) => play(scenario([deck, 'ST-21'], (g) => {
    g.players[0].leader.rested = restedLeader;
    setHand(g, 0, [JANGO]);
    setDon(g, 0, 5);
    setChars(g, 0, mineRested.map((num) => ({ num, extra: { rested: true } })));
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }), JANGO);
  let s = run(KURO, true, [KRIEG, JINBE]);
  expectTag(s, 'chooseOne');
  assert.ok(hasOption(s, 'choice:0') && hasOption(s, 'choice:1'));
  aiAnswers(s);
  s = choose(s, 'choice:0');
  expectTag(s, 'ownReady');
  assert.deepEqual(offered(s), ['OP03-021', KRIEG], 'le Leader Kuro (interprétation 208) et Krieg, pas Jinbe');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.rested, false);
  coherent(s);
  // second choix : Jango et un Personnage adverse épuisés
  s = choose(run(KURO, true, []), 'choice:1');
  expectTag(s, 'oppRest');
  s = pick(s, O_CHOPPER);
  assert.ok(mine(s, JANGO).rested && theirs(s, O_CHOPPER).rested);
  coherent(s);
  // rien à redresser (Leader {Supernovae} épuisé, Jinbe pas {East Blue}) : seul le second choix reste, pris d'office
  s = run(OTHER, true, [JINBE]);
  expectTag(s, 'oppRest');
  assert.ok(mine(s, JANGO).rested);
});

test('Chew (OP03-029) et Buchi (OP03-034) : mettre KO un Personnage adverse épuisé de coût 4 / 2 ou moins', () => {
  const run = (num: string, opp: string[]) => play(scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [num]);
    setDon(g, 0, 4);
    setChars(g, 1, opp.map((n) => ({ num: n, extra: { rested: true } })));
  }), num);
  let s = run(CHEW, [O_JINBE, O_CHOPPER, O_LUFFY]);
  expectTag(s, 'oppKo');
  assert.deepEqual(offered(s), [O_JINBE, O_CHOPPER]);
  s = pick(s, O_CHOPPER);
  assert.ok(inTrash(s, 1, O_CHOPPER));
  coherent(s);
  s = run(BUCHI, [O_JINBE, O_STUSSY]);
  assert.deepEqual(offered(s), [O_JINBE]);
  s = pick(s, O_JINBE);
  assert.ok(inTrash(s, 1, O_JINBE));
  // rien d'épuisé (ou trop cher) : pas de question
  assert.equal(run(CHEW, [O_LUFFY]).decision?.kind, 'main');
  assert.equal(run(BUCHI, [O_STUSSY]).decision?.kind, 'main');
  const t = play(scenario([KURO, 'ST-21'], (g) => { setHand(g, 0, [CHEW]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_JINBE }]); }), CHEW);
  assert.equal(t.decision?.kind, 'main', 'Jinbe redressé');
});

test('Nami (OP03-030) : regarder 5 cartes, en ajouter une verte {East Blue} autre que [Nami] à sa main', () => {
  let s = play(scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [NAMI]);
    setDon(g, 0, 2);
    setDeckTop(g, 0, [NAMI, JINBE, KRIEG, BAG, ALVIDA]);
  }), NAMI);
  expectTag(s, 'pick');
  assert.deepEqual(offered(s), [KRIEG, BAG, ALVIDA], 'ni [Nami], ni Jinbe (rouge)');
  aiAnswers(s);
  s = keepOrder(pick(s, KRIEG));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [KRIEG]);
  assert.deepEqual(s.players[0].deck.slice(-4).map((c) => c.num), [NAMI, JINBE, BAG, ALVIDA]);
  coherent(s);
  // aucune carte qui convient : rien à prendre
  s = play(scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [NAMI]);
    setDon(g, 0, 2);
    setDeckTop(g, 0, [NAMI, JINBE, STUSSY, JINBE, STUSSY]);
  }), NAMI);
  assert.notEqual(s.decision?.tag, 'pick');
  s = keepOrder(s);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Buggy (OP03-032) : ne peut pas être mis KO en combat par une carte <Tranche>', () => {
  const fight = (attacker: string) => {
    let s = scenario([KURO, 'ST-21'], (g) => {
      setHand(g, 0, []);
      setChars(g, 0, [{ num: BUGGY, extra: { rested: true } }]);
      setChars(g, 1, [{ num: attacker }]);
      setDon(g, 1, 0);
    }, 1);
    s = attack(s, theirs(s, attacker).uid, mine(s, BUGGY).uid);
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    return s;
  };
  let s = fight(O_ZORO);  // <Tranche>, 5000 contre 5000
  assert.ok(mine(s, BUGGY), 'Buggy reste');
  coherent(s);
  s = fight(O_CHOPPER);   // <Sagesse>, 6000
  assert.ok(inTrash(s, 0, BUGGY));
  coherent(s);
});

test('Hatchan (OP03-033) : [Déclenchement] avec un Leader {East Blue}, jouer cette carte', () => {
  let s = hitMe(KURO, [HATCHAN, ALVIDA]);
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.ok(mine(s, HATCHAN));
  coherent(s);
  // Leader {Supernovae} : le [Déclenchement] ne fait rien, la carte va dans la Défausse
  s = choose(hitMe(OTHER, [HATCHAN, ALVIDA]), 'trigger');
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(inTrash(s, 0, HATCHAN));
  coherent(s);
});

test('Out-of-the-Bag (OP03-036) : épuiser un Personnage {East Blue} pour redresser [Kuro] ; [Déclenchement] KO d’un Personnage épuisé de coût 3 ou moins', () => {
  const run = (deck: string, restedLeader: boolean, chars: string[]) => scenario([deck, 'ST-21'], (g) => {
    g.players[0].leader.rested = restedLeader;
    setHand(g, 0, [BAG]);
    setDon(g, 0, 3);
    setChars(g, 0, chars.map((num) => ({ num })));
  });
  let s = run(KURO, true, [ALVIDA, JINBE]);
  assert.equal(mainUseful(s, BAG), true);
  s = play(s, BAG);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  // coût : Alvida, seul Personnage {East Blue} (Jinbe ne l'est pas), épuisée d'office
  expectTag(s, 'ownReady');
  assert.deepEqual(offered(s), ['OP03-021']);
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.rested, false);
  assert.ok(mine(s, ALVIDA).rested);
  coherent(s);
  // Leader redressé, pas de Personnage {East Blue} à épuiser, ou pas de [Kuro] : l'effet ne peut rien faire
  assert.equal(mainUseful(run(KURO, false, [ALVIDA]), BAG), false);
  assert.equal(mainUseful(run(KURO, true, [JINBE]), BAG), false);
  assert.equal(mainUseful(run(OTHER, true, [ALVIDA]), BAG), false);
  // [Déclenchement] : Stussy (coût 3) est épuisé par son attaque, Chopper (coût 4) aussi
  s = hitMe(KURO, [BAG, ALVIDA], [], [{ num: O_CHOPPER, extra: { rested: true } }]);
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.deepEqual(offered(s), [O_STUSSY]);
  s = pick(s, O_STUSSY);
  assert.ok(inTrash(s, 1, O_STUSSY) && inTrash(s, 0, BAG));
  coherent(s);
});

test('Tooth Attack (OP03-037) : épuiser un Personnage {East Blue} pour mettre KO un Personnage épuisé de coût 3 ou moins ; [Déclenchement] jouer un Personnage à [Déclenchement]', () => {
  const run = (chars: string[]) => scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [TOOTH]);
    setDon(g, 0, 1);
    setChars(g, 0, chars.map((num) => ({ num })));
    setChars(g, 1, [{ num: O_STUSSY, extra: { rested: true } }, { num: O_CHOPPER, extra: { rested: true } }]);
  });
  let s = play(run([MOMOO, JINBE]), TOOTH);
  s = choose(s, 'yes');
  // coût : Momoo, seul Personnage {East Blue}, épuisé d'office
  expectTag(s, 'oppKo');
  assert.deepEqual(offered(s), [O_STUSSY]);
  s = pick(s, O_STUSSY);
  assert.ok(inTrash(s, 1, O_STUSSY) && mine(s, MOMOO).rested);
  coherent(s);
  assert.equal(mainUseful(run([JINBE]), TOOTH), false, 'pas de Personnage {East Blue}');
  // [Déclenchement] pendant l'attaque adverse : Chew, pas Gin (sans [Déclenchement]) ni Krieg (coût 6)
  s = choose(hitMe(KURO, [TOOTH, ALVIDA], [CHEW, GIN, KRIEG]), 'trigger');
  expectTag(s, 'playFree');
  assert.deepEqual(offered(s), [CHEW]);
  aiAnswers(s);
  s = pick(s, CHEW);
  assert.ok(mine(s, CHEW));
  if (s.decision?.tag === 'oppKo') s = choose(s, 'none');  // Chew [Jouée] : Stussy, épuisé par son attaque
  coherent(s);
});

test('Deathly Poison Gas Bomb MH5 (OP03-038) : épuiser jusqu’à 2 Personnages adverses de coût 2 ou moins ; [Déclenchement] 1 de coût 5 ou moins', () => {
  let s = scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [MH5]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: O_VEGAPUNK }, { num: O_JINBE }, { num: O_STUSSY }]);
  });
  s = play(s, MH5);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_VEGAPUNK, O_JINBE]);
  s = pick(pick(s, O_VEGAPUNK), O_JINBE);
  assert.deepEqual(s.players[1].chars.map((c) => c.rested), [true, true, false]);
  coherent(s);
  assert.equal(mainUseful(scenario([KURO, 'ST-21'], (g) => { setHand(g, 0, [MH5]); setChars(g, 1, [{ num: O_STUSSY }]); }), MH5), false);
  // [Déclenchement] : Luffy (coût 5), pas Chopper (coût 6 pour le tour)
  s = scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, [MH5, ALVIDA]);
    const [, , chopper] = setChars(g, 1, [{ num: O_STUSSY }, { num: O_LUFFY }, { num: O_CHOPPER }]);
    addMod(g, { uid: chopper.uid, stat: 'cost', amount: 2, until: 'turn', source: 'Test' });
    setDon(g, 1, 0);
  }, 1);
  s = attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid);
  s = choose(s, 'trigger');
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_LUFFY]);
  s = pick(s, O_LUFFY);
  assert.ok(theirs(s, O_LUFFY).rested);
  coherent(s);
});

test('One, Two, Jango (OP03-039) : épuiser un Personnage adverse de coût 1 ou moins, puis +1000 à un Personnage ; [Déclenchement] épuiser 1 de coût 4 ou moins', () => {
  const run = (opp: string[], playedTurn = 0) => scenario([KURO, 'ST-21'], (g) => {
    setHand(g, 0, [ONE_TWO]);
    setDon(g, 0, 1);
    setChars(g, 0, [{ num: ALVIDA, extra: { playedTurn } }]);
    setChars(g, 1, opp.map((num) => ({ num })));
  });
  let s = play(run([O_VEGAPUNK, O_JINBE]), ONE_TWO);
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_VEGAPUNK]);
  s = pick(s, O_VEGAPUNK);
  expectTag(s, 'ownPower');
  aiAnswers(s);
  s = pick(s, ALVIDA);
  assert.equal(power(s, mine(s, ALVIDA).uid), 4000);
  assert.ok(theirs(s, O_VEGAPUNK).rested);
  assert.ok(logHas(s, 'gagne +1000 de puissance pour le tour (One, Two, Jango)'));
  coherent(s);
  // +1000 seulement utile pour attaquer : Alvida jouée ce tour ne peut pas attaquer, et rien à épuiser
  assert.equal(mainUseful(run([O_JINBE], 5), ONE_TWO), false);
  assert.equal(mainUseful(run([O_JINBE]), ONE_TWO), true);
  assert.equal(mainUseful(run([O_VEGAPUNK], 5), ONE_TWO), true);
  // [Déclenchement] : Chopper (coût 4), pas Luffy (coût 5)
  s = choose(hitMe(KURO, [ONE_TWO, ALVIDA], [], [{ num: O_CHOPPER }, { num: O_LUFFY }]), 'trigger');
  expectTag(s, 'oppRest');
  assert.deepEqual(offered(s), [O_CHOPPER]);
  s = pick(s, O_CHOPPER);
  assert.ok(theirs(s, O_CHOPPER).rested);
  coherent(s);
});
