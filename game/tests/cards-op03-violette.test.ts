// OP03 violette (tâche 1.11 du plan « Aventure ») : Leader Iceburg, {Galley-La Company} et {Water Seven}, DON!! −1 pour un
// effet, DON!! ajoutées depuis le deck DON!!. Decks d'essai aux Leaders Iceburg ({Water Seven}, {Galley-La Company}),
// Magellan ({Impel Down}) et Kaido (ni l'un ni l'autre) pour les conditions fausses ; l'adversaire joue ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { OP03_VIOLETTE } from '../engine/cards/op03-violette.ts';
import { cardStatus } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { addMod, attackAbility, def, donOnField, hasKeyword } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { useless } from '../ai/prune.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand,
  setLife, take,
} from './helpers.ts';

const PURPLE = [
  'OP03-059', 'OP03-060', 'OP03-061', 'OP03-062', 'OP03-063', 'OP03-064', 'OP03-065', 'OP03-066', 'OP03-067', 'OP03-068',
  'OP03-069', 'OP03-070', 'OP03-071', 'OP03-072', 'OP03-073', 'OP03-074', 'OP03-075',
];
const cards = Object.fromEntries(PURPLE.map((n) => [n, 3]));
const ICEBURG = 'TEST-OP03-V-ICEBURG';
const MAGELLAN = 'TEST-OP03-V-MAGELLAN';
const KAIDO = 'TEST-OP03-V-KAIDO';
DECKS[ICEBURG] = { id: ICEBURG, name: 'Essai', series: 'TEST', leader: 'OP03-058', cards };
DECKS[MAGELLAN] = { id: MAGELLAN, name: 'Essai', series: 'TEST', leader: 'OP02-071', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

const KAKU = 'OP03-059';
const KALIFA = 'OP03-060';      // {Galley-La Company}, coût 4
const KIWI = 'OP03-061';        // {Water Seven}, sans effet
const KOKORO = 'OP03-062';
const ZAMBAI = 'OP03-063';
const TILESTONE = 'OP03-064';   // {Galley-La Company}, coût 5
const CHIMNEY = 'OP03-065';     // {Water Seven}, [Bloqueur]
const PAULIE = 'OP03-066';
const LULU = 'OP03-067';
const MINOZEBRA = 'OP03-068';
const MINORHINO = 'OP03-069';
const LUFFY = 'OP03-070';       // {Water Seven}, coût 6 : pas {Galley-La Company}
const LUCCI = 'OP03-071';
const JET = 'OP03-072';
const HULL = 'OP03-073';
const TOPKNOT = 'OP03-074';
const GALLEY = 'OP03-075';

// adversaire ST-21
const O_VEGAPUNK = 'ST21-013';  // coût 1, 3000
const O_JINBE = 'ST21-005';     // coût 2, 4000
const O_STUSSY = 'ST21-006';    // coût 3, 5000
const O_CHOPPER = 'ST21-008';   // coût 4, 6000
const O_LUFFY = 'ST21-014';     // coût 5, 6000

const mine = (s: GameState, num: string, p: 0 | 1 = 0) => s.players[p].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const leader = (s: GameState, p: 0 | 1) => s.players[p].leader.uid;
const withStage = (g: GameState, p: 0 | 1, num: string) => {
  const c = take(g, p, num);
  g.players[p].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
};
const giveDon = (g: GameState, p: 0 | 1, num: string, n: number) => {
  mine(g, num, p).don = n;
  g.players[p].donActive -= n;
};

test('les cartes violettes d’OP03 sont toutes jouables', () => {
  assert.equal(Object.keys(OP03_VIOLETTE).length, 16);
  for (const n of ['OP03-058', ...PURPLE]) assert.notEqual(cardStatus(n), 'todo', n);
  assert.equal(cardStatus(KIWI), 'auto');
  assert.equal(cardStatus(CHIMNEY), 'auto');
});

test('Iceburg (Leader) : ne peut pas attaquer ; DON!! −1 et s’épuiser : jouer un {Galley-La Company} de coût 5 ou moins de sa main', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [TILESTONE, LUFFY, KIWI]); setDon(g, 0, 2, 1); });
  assert.equal(attackAbility(s, 0, s.players[0].leader).can, false);
  assert.ok(!s.decision!.options.some((o) => o.id.startsWith(`attack:${leader(s, 0)}:`)), 'aucune attaque du Leader');
  const don = useless(s, s.decision!, s.decision!.options.find((o) => o.id === `don:${leader(s, 0)}`)!);
  assert.equal(don?.kind, 'idleDon', 'une DON!! donnée au Leader ne sert à rien');
  s = choose(s, `act:${leader(s, 0)}`);
  expectTag(s, 'playFree');
  // Monkey D. Luffy (coût 6, pas {Galley-La Company}) et Kiwi & Mozu (pas {Galley-La Company}) ne sont pas proposés
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id), [TILESTONE, 'none']);
  aiAnswers(s);
  s = choose(s, (o) => o.num === TILESTONE);
  assert.ok(mine(s, TILESTONE), 'Tilestone joué sans payer son coût');
  assert.equal(s.players[0].leader.rested, true);
  assert.equal(donOnField(s, 0), 2, 'DON!! −1');
  assert.equal(s.players[0].donActive, 2, 'la DON!! épuisée part d’abord');
  assert.ok(!hasOption(s, `act:${leader(s, 0)}`), 'Leader épuisé : plus d’activation');
  coherent(s);
  // sans DON!! sur le terrain, ou sans {Galley-La Company} à jouer, l'effet n'est pas proposé (choix 320)
  s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [TILESTONE]); setDon(g, 0, 0); });
  assert.ok(!hasOption(s, `act:${leader(s, 0)}`));
  s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [LUFFY, KIWI]); setDon(g, 0, 3); });
  assert.ok(!hasOption(s, `act:${leader(s, 0)}`));
  // zone de Personnage pleine : il peut quand même jouer (en défaussant un Personnage)
  s = scenario([ICEBURG, 'ST-21'], (g) => {
    setHand(g, 0, [KALIFA]);
    setChars(g, 0, [{ num: KIWI }, { num: KIWI }, { num: KIWI }, { num: CHIMNEY }, { num: CHIMNEY }]);
    setDon(g, 0, 1);
  });
  assert.ok(hasOption(s, `act:${leader(s, 0)}`));
});

test('Kaku : [En attaquant] DON!! −1 : [Exil] pour ce combat', () => {
  for (const pay of [true, false]) {
    let s = scenario([ICEBURG, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: KAKU }]);
      setChars(g, 1, []);
      setHand(g, 1, []);
      setLife(g, 1, [O_VEGAPUNK, O_JINBE]);
      setDon(g, 0, 3);
    });
    s = attack(s, mine(s, KAKU).uid, leader(s, 1));
    expectTag(s, 'may');
    aiAnswers(s);
    s = choose(s, pay ? 'yes' : 'no');
    assert.equal(s.players[1].trash.some((c) => c.num === O_VEGAPUNK), pay, '[Exil] : la Vie va dans la Défausse');
    assert.equal(s.players[1].hand.some((c) => c.num === O_VEGAPUNK), !pay);
    assert.equal(donOnField(s, 0), pay ? 2 : 3);
    assert.equal(hasKeyword(s, 0, mine(s, KAKU), 'Banish'), false, 'seulement pendant ce combat');
    coherent(s);
  }
  // une attaque trop faible ne sert à rien malgré l'[En attaquant] ([Exil] ne compte que si elle touche)
  const s = scenario([ICEBURG, 'ST-21'], (g) => { setChars(g, 0, [{ num: KAKU }]); setDon(g, 0, 3); });
  const o = () => s.decision!.options.find((x) => x.id === `attack:${mine(s, KAKU).uid}:${leader(s, 1)}`)!;
  assert.equal(useless(s, s.decision!, o()), null, 'Kaku (6000) contre le Leader (5000)');
  addMod(s, { uid: leader(s, 1), stat: 'power', amount: 2000, until: 'turn', source: 'essai' });
  assert.equal(useless(s, s.decision!, o())?.kind, 'weakAttack', 'Kaku (6000) contre le Leader (7000)');
});

test('Kalifa : [En attaquant] DON!! −1 : piocher 2 cartes, puis en défausser 1', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setChars(g, 0, [{ num: KALIFA }]); setHand(g, 0, [KIWI]); setChars(g, 1, []); setDon(g, 0, 2); });
  const deck = s.players[0].deck.length;
  s = choose(attack(s, mine(s, KALIFA).uid, leader(s, 1)), 'yes');
  expectTag(s, 'discard');
  aiAnswers(s);
  s = choose(s, (o) => s.players[0].hand.some((c) => c.uid === o.uid && c.num === KIWI));
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[0].deck.length, deck - 2);
  assert.ok(s.players[0].trash.some((c) => c.num === KIWI));
  assert.equal(donOnField(s, 0), 1);
  coherent(s);
  // sans DON!! sur le terrain, pas de question
  s = scenario([ICEBURG, 'ST-21'], (g) => { setChars(g, 0, [{ num: KALIFA }]); setChars(g, 1, []); setDon(g, 0, 0); });
  s = attack(s, mine(s, KALIFA).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'may');
});

test('Kokoro : [Jouée] 5 cartes du dessus, une carte {Water Seven} autre que [Kokoro] en main', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [KOKORO]); setDeckTop(g, 0, [KOKORO, MINOZEBRA, KIWI, HULL, JET]); setDon(g, 0, 1); });
  s = play(s, KOKORO);
  expectTag(s, 'pick');
  // Kokoro (autre que [Kokoro]) et Minozebra ({Impel Down}) ne sont pas proposés ; Hull Dismantler Slash et Gum Gum Jet
  // Rafale sont des cartes {Water Seven}
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [HULL, JET, KIWI, 'none'].sort());
  aiAnswers(s);
  s = keepOrder(choose(s, (o) => o.num === HULL));
  assert.ok(s.players[0].hand.some((c) => c.num === HULL));
  assert.ok(logHas(s, 'regarde 5 cartes'));
  coherent(s);
});

test('Zambai : [Bloqueur] ; [Jouée] DON!! −1 : avec un Leader {Water Seven}, piocher 1 carte', () => {
  for (const deck of [ICEBURG, KAIDO]) {
    let s = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, [ZAMBAI]); setDon(g, 0, 4); });
    s = play(s, ZAMBAI);
    expectTag(s, 'may');
    const hand = s.players[0].hand.length;
    s = choose(s, 'yes');
    assert.equal(s.players[0].hand.length, hand + (deck === ICEBURG ? 1 : 0), deck);
    assert.equal(donOnField(s, 0), 3, 'le DON!! −1 se paie dans les deux cas (choix 211)');
    assert.ok(hasKeyword(s, 0, mine(s, ZAMBAI), 'Blocker'));
    coherent(s);
  }
});

test('Tilestone, Minozebra, Minorhinoceros : [En cas de KO] selon le type du Leader', () => {
  // ST-21 (joueur 0) met KO le Personnage épuisé du joueur 1 en l'attaquant
  const koed = (deck: string, num: string) => {
    let s = scenario(['ST-21', deck], (g) => {
      setChars(g, 0, [{ num: O_CHOPPER }]);
      setChars(g, 1, [{ num, extra: { rested: true } }]);
      setHand(g, 1, [KIWI]);
      setDon(g, 0, 3);
      setDon(g, 1, 4);
    });
    s = attack(s, mine(s, O_CHOPPER).uid, mine(s, num, 1).uid);
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    if (s.decision?.player === 1 && s.decision.tag === 'may') s = choose(s, 'no');  // [Attaque adverse] du Leader Kaido
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    return s;
  };
  for (const [num, good] of [[TILESTONE, ICEBURG], [MINOZEBRA, MAGELLAN]] as const) {
    for (const deck of [good, KAIDO]) {
      const s = koed(deck, num);
      assert.ok(s.players[1].trash.some((c) => c.num === num), `${num} mis KO`);
      assert.equal(s.players[1].donRested, deck === good ? 1 : 0, `${num}, ${deck}`);
      assert.equal(donOnField(s, 1), deck === good ? 5 : 4);
      coherent(s);
    }
  }
  for (const deck of [MAGELLAN, KAIDO]) {
    let s = koed(deck, MINORHINO);
    if (deck === MAGELLAN) {
      expectTag(s, 'discard');
      assert.equal(s.players[1].hand.length, 3);
      s = choose(s, (o) => s.players[1].hand.some((c) => c.uid === o.uid && c.num === KIWI));
      assert.ok(s.players[1].trash.some((c) => c.num === KIWI));
    }
    assert.equal(s.players[1].hand.length, deck === MAGELLAN ? 2 : 1);
    coherent(s);
  }
  // Minozebra a [Exil]
  const s = scenario([MAGELLAN, 'ST-21'], (g) => { setChars(g, 0, [{ num: MINOZEBRA }]); });
  assert.ok(hasKeyword(s, 0, mine(s, MINOZEBRA), 'Banish'));
});

test('Paulie : [Jouée] ➁ : 1 DON!! redressée, puis avec 8 DON!! ou plus, KO d’un Personnage adverse de coût 4 ou moins', () => {
  // joué de la main avec 9 DON!! : 5 pour Paulie, 2 épuisées (➁), +1 redressée = 10 DON!! sur le terrain
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [PAULIE]); setDon(g, 0, 9); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); });
  s = play(s, PAULIE);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  assert.equal(donOnField(s, 0), 10);
  assert.equal(s.players[0].donActive, 3);
  expectTag(s, 'oppKo');
  assert.ok(!hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), 'coût 5 : pas proposé');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(!theirs(s, O_CHOPPER));
  coherent(s);
  // joué par le Leader Iceburg avec 4 DON!! : 3 après le DON!! −1, 2 épuisées, +1 = 4 sur le terrain : pas de KO
  s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [PAULIE]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(choose(s, `act:${leader(s, 0)}`), (o) => o.num === PAULIE);
  s = choose(s, 'yes');
  assert.equal(donOnField(s, 0), 4);
  assert.equal(s.players[0].donActive, 2);
  assert.notEqual(s.decision?.tag, 'oppKo');
  assert.ok(theirs(s, O_CHOPPER), '4 DON!! : pas de KO');
  coherent(s);
  // sans 2 DON!! redressées après l'avoir joué, pas de question
  s = play(scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [PAULIE]); setDon(g, 0, 6); }), PAULIE);
  assert.notEqual(s.decision?.tag, 'may');
});

test('Peepley Lulu : [DON!! x1] [En attaquant] avec un Leader {Galley-La Company}, 1 DON!! épuisée', () => {
  for (const [deck, don, gain] of [[ICEBURG, 1, 1], [ICEBURG, 0, 0], [KAIDO, 1, 0]] as const) {
    let s = scenario([deck, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: LULU }]);
      setChars(g, 1, []);
      setHand(g, 1, []);
      setDon(g, 0, 4);
      if (don) giveDon(g, 0, LULU, don);
    });
    s = attack(s, mine(s, LULU).uid, leader(s, 1));
    assert.equal(donOnField(s, 0), 4 + gain, `${deck}, ${don} DON!!`);
    assert.equal(s.players[0].donRested, gain);
    coherent(s);
  }
});

test('Monkey D. Luffy : [Jouée] DON!! −1 et défausser un Personnage de coût 5 : [Initiative] pour le tour', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [LUFFY, TILESTONE, KALIFA]); setDon(g, 0, 8); });
  s = play(s, LUFFY);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  // seul Tilestone (coût 5) peut être défaussé : Kalifa coûte 4
  if (s.decision?.tag === 'discard') {
    assert.deepEqual(s.decision.options.map((o) => s.players[0].hand.find((c) => c.uid === o.uid)?.num), [TILESTONE]);
    s = choose(s, (o) => s.players[0].hand.some((c) => c.uid === o.uid && c.num === TILESTONE));
  }
  assert.ok(s.players[0].trash.some((c) => c.num === TILESTONE));
  assert.ok(attackAbility(s, 0, mine(s, LUFFY)).can, '[Initiative]');
  assert.equal(donOnField(s, 0), 7);
  coherent(s);
  // sans Personnage de coût 5 en main, pas de question et pas d'[Initiative]
  s = play(scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [LUFFY, KALIFA]); setDon(g, 0, 8); }), LUFFY);
  assert.notEqual(s.decision?.tag, 'may');
  assert.equal(attackAbility(s, 0, mine(s, LUFFY)).can, false);
});

test('Rob Lucci : [En attaquant] DON!! −1 : épuiser un Personnage adverse de coût 5 ou moins', () => {
  let s = scenario([ICEBURG, ICEBURG], (g) => {
    setChars(g, 0, [{ num: LUCCI }]);
    setChars(g, 1, [{ num: LUFFY }, { num: TILESTONE }]);
    setHand(g, 1, []);
    setDon(g, 0, 2);
  });
  s = choose(attack(s, mine(s, LUCCI).uid, leader(s, 1)), 'yes');
  expectTag(s, 'oppRest');
  assert.ok(!hasOption(s, `card:${mine(s, LUFFY, 1).uid}`), 'Luffy (coût 6) : pas proposé');
  aiAnswers(s);
  s = choose(s, `card:${mine(s, TILESTONE, 1).uid}`);
  assert.ok(mine(s, TILESTONE, 1).rested);
  assert.equal(donOnField(s, 0), 1);
  coherent(s);
});

test('Gum Gum Jet Rafale : [Contre] défausser 1 carte : +3000 à la carte attaquée ; [Déclenchement] 1 DON!! redressée', () => {
  // le deck Iceburg est celui du joueur 1 : ST-21 attaque
  let s = scenario(['ST-21', ICEBURG], (g) => {
    setChars(g, 0, [{ num: O_LUFFY }]);
    setChars(g, 1, []);
    setHand(g, 1, [JET, KIWI]);
    setDon(g, 0, 3);
    setDon(g, 1, 3);
  });
  assert.equal(def(JET).counterPower!(s, 1, leader(s, 1)), 3000);
  s = attack(s, mine(s, O_LUFFY).uid, leader(s, 1));
  assert.equal(s.decision?.kind, 'counter');
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => s.players[1].hand.some((c) => c.uid === o.uid && c.num === KIWI));
  assert.ok(s.players[1].trash.some((c) => c.num === KIWI));
  assert.ok(logHas(s, 'gagne +3000'));
  coherent(s);
  // seule carte en main : rien à défausser, l'IA ne la compte pas
  s = scenario(['ST-21', ICEBURG], (g) => { setChars(g, 0, [{ num: O_LUFFY }]); setHand(g, 1, [JET]); setDon(g, 1, 3); });
  assert.equal(def(JET).counterPower!(s, 1, leader(s, 1)), 0);
  assert.equal(def(JET).counterUseful!(s, 1, leader(s, 1)), false);
  // [Déclenchement] : 1 DON!! redressée depuis le deck DON!!
  s = scenario(['ST-21', ICEBURG], (g) => {
    setChars(g, 1, []);
    setHand(g, 1, []);
    setLife(g, 1, [JET, KIWI]);
    setDon(g, 0, 3);
    setDon(g, 1, 2);
  });
  s = attack(s, leader(s, 0), leader(s, 1));
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.equal(s.players[1].donActive, 3);
  assert.ok(s.players[1].trash.some((c) => c.num === JET));
  coherent(s);
});

test('Hull Dismantler Slash : [Principale] DON!! −1 : avec un Leader {Water Seven}, KO de coût 2 ou moins ; [Déclenchement]', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [HULL]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_JINBE }, { num: O_STUSSY }]); });
  s = choose(play(s, HULL), 'yes');
  expectTag(s, 'oppKo');
  assert.ok(!hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), 'coût 3 : pas proposé');
  s = choose(s, `card:${theirs(s, O_JINBE).uid}`);
  assert.ok(!theirs(s, O_JINBE));
  assert.equal(donOnField(s, 0), 2);
  coherent(s);
  // Leader Kaido : l'Événement ne sert à rien (l'IA ne le joue pas)
  s = scenario([KAIDO, 'ST-21'], (g) => { setHand(g, 0, [HULL]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_JINBE }]); });
  const o = s.decision!.options.find((x) => x.id.startsWith('event:'))!;
  assert.equal(useless(s, s.decision!, o)?.kind, 'idleEffect');
  // [Déclenchement] : activer l'effet [Principale]
  s = scenario(['ST-21', ICEBURG], (g) => {
    setChars(g, 0, [{ num: O_VEGAPUNK }]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setLife(g, 1, [HULL, KIWI]);
    setDon(g, 0, 3);
    setDon(g, 1, 2);
  });
  s = attack(s, leader(s, 0), leader(s, 1));
  s = choose(s, 'trigger');
  s = choose(s, 'yes');
  s = choose(s, `card:${mine(s, O_VEGAPUNK).uid}`);
  assert.equal(s.players[0].chars.length, 0);
  assert.equal(donOnField(s, 1), 1);
  coherent(s);
});

test('Top Knot : [Principale] DON!! −2 : un Personnage adverse de coût 4 ou moins au-dessous du deck de son propriétaire', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [TOPKNOT]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); });
  s = choose(play(s, TOPKNOT), 'yes');
  expectTag(s, 'oppRemove');
  assert.ok(!hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), 'coût 5 : pas proposé');
  const chopper = theirs(s, O_CHOPPER).uid;
  s = choose(s, `card:${chopper}`);
  assert.equal(s.players[1].deck.at(-1)?.uid, chopper);
  assert.equal(donOnField(s, 0), 2);
  coherent(s);
  // 2 DON!! : elles paient l'Événement, puis le DON!! −2 ; sans cible de coût 4 ou moins, il ne sert à rien
  for (const target of [O_CHOPPER, O_LUFFY]) {
    s = scenario([ICEBURG, 'ST-21'], (g) => { setHand(g, 0, [TOPKNOT]); setDon(g, 0, 2); setChars(g, 1, [{ num: target }]); });
    const o = s.decision!.options.find((x) => x.id.startsWith('event:'))!;
    assert.equal(useless(s, s.decision!, o)?.kind, target === O_CHOPPER ? undefined : 'idleEffect', target);
  }
});

test('Galley-La Company (Lieu) : s’épuiser : avec le Leader [Iceburg], 1 DON!! épuisée', () => {
  let s = scenario([ICEBURG, 'ST-21'], (g) => { withStage(g, 0, GALLEY); setDon(g, 0, 3); });
  const stage = s.players[0].stage!.uid;
  s = choose(s, `act:${stage}`);
  assert.ok(s.players[0].stage!.rested);
  assert.equal(s.players[0].donRested, 1);
  assert.equal(donOnField(s, 0), 4);
  assert.ok(!hasOption(s, `act:${stage}`), 'Lieu épuisé');
  coherent(s);
  // Leader Kaido, ou deck DON!! vide : l'effet n'est pas proposé (choix 320)
  s = scenario([KAIDO, 'ST-21'], (g) => { withStage(g, 0, GALLEY); setDon(g, 0, 3); });
  assert.ok(!hasOption(s, `act:${s.players[0].stage!.uid}`));
  s = scenario([ICEBURG, 'ST-21'], (g) => { withStage(g, 0, GALLEY); setDon(g, 0, 10); });
  assert.ok(!hasOption(s, `act:${s.players[0].stage!.uid}`));
});
