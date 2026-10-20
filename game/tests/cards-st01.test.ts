// Deck de départ ST-01 (tâche 1.14 du plan « Aventure ») : un test par carte à effet, condition vraie et condition
// fausse, [Déclenchement] compris
import assert from 'node:assert/strict';
import test from 'node:test';
import { uselessReason } from '../ai/prune.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, inHand, logHas, play, scenario, setChars, setDon, setHand, setLife,
  takeField,
} from './helpers.ts';

const DECK = 'ST-01';
const USOPP = 'ST01-002';
const KAROO = 'ST01-003';       // {Animal} {Royaume d'Alabasta}, sans effet
const SANJI = 'ST01-004';
const JINBE = 'ST01-005';
const NAMI = 'ST01-007';
const VIVI = 'ST01-009';        // {Royaume d'Alabasta}, sans effet
const FRANKY = 'ST01-010';      // 6000, {Équipage de Chapeau de paille}, sans effet
const LUFFY = 'ST01-012';
const ZORO = 'ST01-013';
const GUARD = 'ST01-014';       // Guard Point
const PISTOL = 'ST01-015';      // Gum-Gum Jet Pistol
const JAMBE = 'ST01-016';       // Diable Jambe
const SUNNY = 'ST01-017';       // Thousand Sunny
// adversaire ST-30
const MARCO = 'ST30-008';       // [Bloqueur], 6000, coût 5
const BAGGY = 'ST30-011';       // [Bloqueur], 1000, coût 2
// adversaire ST-33
const SAURO = 'OP12-050';       // Haguar D. Sauro, 7000
const KOBBY = 'ST33-001';       // [Bloqueur], 1000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const blockOptions = (s: GameState) => (s.decision?.kind === 'blocker' ? s.decision.options.filter((o) => o.id.startsWith('block:')).map((o) => o.uid) : []);
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const noBlock = (s: GameState) => (s.decision?.kind === 'blocker' ? choose(s, 'noblock') : s);

test('ST-01 : 50 cartes et un Leader, toutes jouables', async () => {
  const { DECKS, deckSize } = await import('../engine/decks.ts');
  const { cardStatus } = await import('../engine/cards/index.ts');
  const deck = DECKS[DECK];
  assert.equal(deckSize(deck), 50);
  assert.equal(Object.keys(DECKS).at(-1), DECK, 'ajouté à la fin du registre (graines des parties de vérification)');
  for (const num of [deck.leader, ...Object.keys(deck.cards)]) assert.notEqual(cardStatus(num), 'todo', num);
});

test('Luffy (Leader) et Nami : [Une fois par tour] jusqu’à 1 DON!! épuisée à son Leader ou à un Personnage', () => {
  for (const who of ['leader', NAMI] as const) {
    let s = scenario([DECK, 'ST-30'], (g) => {
      setChars(g, 0, [{ num: NAMI }, { num: FRANKY }]);
      setDon(g, 0, 1, 2);
    });
    const src = who === 'leader' ? s.players[0].leader.uid : mine(s, NAMI).uid;
    s = act(s, `act:${src}`);
    expectTag(s, 'donTarget');
    assert.ok(hasOption(s, `card:${s.players[0].leader.uid}`));
    s = choose(s, `card:${mine(s, FRANKY).uid}`);
    assert.equal(mine(s, FRANKY).don, 1);
    assert.equal(s.players[0].donRested, 1);
    assert.equal(s.players[0].donActive, 1, 'les DON!! redressées ne bougent pas');
    assert.equal(power(s, mine(s, FRANKY).uid), 7000);
    assert.equal(hasOption(s, `act:${src}`), false, 'une fois par tour');
    coherent(s);
  }

  // aucune DON!! épuisée : rien à donner (l'effet est signalé comme inutile)
  let s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: FRANKY }]);
    setDon(g, 0, 3, 0);
  });
  const leader = s.players[0].leader.uid;
  assert.ok(uselessReason(s, s.decision!, s.decision!.options.find((o) => o.id === `act:${leader}`)!));
  s = act(s, `act:${leader}`);
  assert.notEqual(s.decision?.tag, 'donTarget');
  assert.equal(mine(s, FRANKY).don + s.players[0].leader.don, 0);
  coherent(s);
});

test('Usopp : [DON!! x2] [En attaquant] l’adversaire ne peut pas bloquer avec un Personnage de 5000 ou plus', () => {
  for (const don of [2, 1]) {
    let s = scenario([DECK, 'ST-30'], (g) => {
      setChars(g, 0, [{ num: USOPP, extra: { don } }]);
      setDon(g, 0, 0);
      setChars(g, 1, [{ num: MARCO }, { num: BAGGY }]);
    });
    s = attack(s, mine(s, USOPP).uid, s.players[1].leader.uid);
    assert.equal(s.decision?.kind, 'blocker');
    const blockers = blockOptions(s);
    assert.ok(blockers.includes(theirs(s, BAGGY).uid), 'Baggy (1000) peut bloquer');
    assert.equal(blockers.includes(theirs(s, MARCO).uid), don === 1, don === 2 ? 'Marco (6000) ne peut pas bloquer' : '1 DON!! : Marco peut bloquer');
    s = noCounter(noBlock(s));
    coherent(s);
  }
});

test('Usopp : [Déclenchement] jouer cette carte', () => {
  let s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, [USOPP, KAROO]);
    setChars(g, 1, [{ num: MARCO }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  assert.ok(mine(s, USOPP), 'Usopp joué depuis la Vie');
  coherent(s);
});

test('Sanji : [DON!! x2] [Initiative]', () => {
  const s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: SANJI, extra: { don: 2, playedTurn: 5 } }, { num: SANJI, extra: { don: 1, playedTurn: 5 } }]);
  });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, true);
  assert.equal(attackAbility(s, 0, s.players[0].chars[1]).can, false, '1 DON!! seulement');
  assert.equal(power(s, s.players[0].chars[0].uid), 6000);
});

test('Jinbe : [DON!! x1] [En attaquant] +1000 pour le tour à un autre Leader ou Personnage', () => {
  let s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: JINBE, extra: { don: 1 } }, { num: FRANKY }]);
    setDon(g, 0, 0);
  });
  s = attack(s, mine(s, JINBE).uid, s.players[1].leader.uid);
  expectTag(s, 'ownPower');
  assert.equal(hasOption(s, `card:${mine(s, JINBE).uid}`), false, 'pas Jinbe lui-même');
  aiAnswers(s);
  s = choose(s, `card:${mine(s, FRANKY).uid}`);
  assert.equal(power(s, mine(s, FRANKY).uid), 7000);
  s = noCounter(noBlock(s));
  assert.equal(power(s, mine(s, FRANKY).uid), 7000, 'pour le tour, pas seulement le combat');
  coherent(s);

  s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: JINBE }, { num: FRANKY }]);
  });
  s = attack(s, mine(s, JINBE).uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'ownPower', 'sans DON!!');
});

test('Luffy (ST01-012) : [Initiative] ; [DON!! x2] [En attaquant] l’adversaire ne peut pas activer [Bloqueur]', () => {
  for (const don of [2, 1]) {
    let s = scenario([DECK, 'ST-30'], (g) => {
      setChars(g, 0, [{ num: LUFFY, extra: { don, playedTurn: 5 } }]);
      setDon(g, 0, 0);
      setChars(g, 1, [{ num: BAGGY }]);
    });
    assert.ok(attackAbility(s, 0, mine(s, LUFFY)).can, '[Initiative]');
    s = attack(s, mine(s, LUFFY).uid, s.players[1].leader.uid);
    if (don === 2) assert.notEqual(s.decision?.kind, 'blocker', 'Baggy ne peut pas bloquer');
    else assert.equal(s.decision?.kind, 'blocker', '1 DON!! : Baggy peut bloquer');
    s = noCounter(noBlock(s));
    coherent(s);
  }
});

test('Roronoa Zoro : [DON!! x1] +1000, aussi pendant le tour adverse', () => {
  const setup = (g: GameState) => setChars(g, 0, [{ num: ZORO, extra: { don: 1 } }, { num: ZORO }]);
  let s = scenario([DECK, 'ST-30'], setup);
  assert.equal(power(s, s.players[0].chars[0].uid), 7000, '5000 + 1000 (DON!!) + 1000');
  assert.equal(power(s, s.players[0].chars[1].uid), 5000, 'sans DON!!');
  s = scenario([DECK, 'ST-30'], setup, 1);
  assert.equal(power(s, s.players[0].chars[0].uid), 6000, 'tour adverse : la DON!! ne donne rien, l’effet reste');
});

test('Guard Point : [Contre] +3000 à la carte attaquée ; [Déclenchement] +1000 pour le tour', () => {
  let s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, [GUARD]);
    setChars(g, 0, []);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: MARCO }]);
  }, 1);
  s = attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid);
  assert.equal(s.decision?.kind, 'counter');
  const life = s.players[0].life.length;
  s = noCounter(act(s, `cevent:${inHand(s, 0, GUARD)}`));
  assert.ok(logHas(s, 'repoussée (6000 contre 8000)'));
  assert.equal(s.players[0].life.length, life, 'l’attaque échoue');
  assert.equal(power(s, s.players[0].leader.uid), 5000, 'pour le combat seulement');
  coherent(s);

  // sans DON!! redressée : pas de Contre possible
  s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, [GUARD]);
    setChars(g, 0, []);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: MARCO }]);
  }, 1);
  s = attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid);
  assert.equal(hasOption(s, `cevent:${inHand(s, 0, GUARD)}`), false);

  s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: FRANKY }]);
    setLife(g, 0, [GUARD, KAROO]);
    setChars(g, 1, [{ num: MARCO }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'ownPower');
  s = choose(s, `card:${mine(s, FRANKY).uid}`);
  assert.equal(power(s, mine(s, FRANKY).uid), 7000);
  coherent(s);
});

test('Gum-Gum Jet Pistol : KO d’un Personnage adverse de 6000 ou moins ; [Déclenchement] le même effet', () => {
  let s = scenario([DECK, 'ST-33'], (g) => {
    setHand(g, 0, [PISTOL]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: SAURO }, { num: KOBBY }]);
  });
  assert.ok(power(s, theirs(s, SAURO).uid) > 6000);
  s = play(s, PISTOL);
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, SAURO).uid}`), false, 'plus de 6000 : pas proposé');
  s = choose(s, `card:${theirs(s, KOBBY).uid}`);
  assert.equal(theirs(s, KOBBY), undefined);
  coherent(s);

  s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [PISTOL, KAROO]);
    setChars(g, 1, [{ num: MARCO }, { num: BAGGY }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, BAGGY).uid}`);
  assert.equal(theirs(s, BAGGY), undefined);
  coherent(s);
});

test('Diable Jambe : un {Équipage de Chapeau de paille} ne peut pas être bloqué ce tour-ci ; [Déclenchement] KO d’un [Bloqueur] de coût 3 ou moins', () => {
  let s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, [JAMBE]);
    setChars(g, 0, [{ num: VIVI }, { num: FRANKY }]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: MARCO }]);
  });
  s = play(s, JAMBE);
  expectTag(s, 'ownGrant');
  assert.equal(hasOption(s, `card:${mine(s, VIVI).uid}`), false, 'Vivi n’est pas {Équipage de Chapeau de paille}');
  assert.ok(hasOption(s, `card:${s.players[0].leader.uid}`), 'le Leader Luffy l’est');
  s = choose(s, `card:${mine(s, FRANKY).uid}`);
  s = attack(s, mine(s, FRANKY).uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.kind, 'blocker', 'Marco ne peut pas bloquer Franky');
  s = noCounter(s);
  s = attack(s, mine(s, VIVI).uid, s.players[1].leader.uid);
  assert.equal(s.decision?.kind, 'blocker', 'Marco peut bloquer Vivi');
  s = noCounter(noBlock(s));
  coherent(s);

  // sans [Bloqueur] adverse, l'Événement ne sert à rien (l'IA le garde)
  s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, [JAMBE]);
    setChars(g, 0, [{ num: FRANKY }]);
    setDon(g, 0, 1);
    setChars(g, 1, []);
  });
  const ev = s.decision!.options.find((o) => o.id === `event:${inHand(s, 0, JAMBE)}`)!;
  assert.ok(uselessReason(s, s.decision!, ev));

  s = scenario([DECK, 'ST-30'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [JAMBE, KAROO]);
    setChars(g, 1, [{ num: MARCO }, { num: BAGGY }]);
  }, 1);
  s = noCounter(attack(s, theirs(s, MARCO).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, MARCO).uid}`), false, 'Marco : coût 5');
  s = choose(s, `card:${theirs(s, BAGGY).uid}`);
  assert.equal(theirs(s, BAGGY), undefined);
  coherent(s);
});

test('Thousand Sunny : s’épuiser pour donner +1000 pour le tour à un {Équipage de Chapeau de paille}', () => {
  let s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: KAROO }, { num: FRANKY }]);
    g.players[0].stage = takeField(g, 0, SUNNY);
  });
  const sunny = s.players[0].stage!.uid;
  s = act(s, `act:${sunny}`);
  expectTag(s, 'ownPower');
  assert.equal(hasOption(s, `card:${mine(s, KAROO).uid}`), false, 'Karoo n’est pas {Équipage de Chapeau de paille}');
  s = choose(s, `card:${mine(s, FRANKY).uid}`);
  assert.equal(power(s, mine(s, FRANKY).uid), 7000);
  assert.equal(s.players[0].stage!.rested, true);
  assert.equal(hasOption(s, `act:${sunny}`), false, 'déjà épuisé');
  coherent(s);

  // personne ne peut plus attaquer : effet signalé comme inutile
  s = scenario([DECK, 'ST-30'], (g) => {
    setChars(g, 0, [{ num: FRANKY, extra: { rested: true } }]);
    g.players[0].leader.rested = true;
    g.players[0].stage = takeField(g, 0, SUNNY);
  });
  const opt = s.decision!.options.find((o) => o.id === `act:${s.players[0].stage!.uid}`)!;
  assert.ok(uselessReason(s, s.decision!, opt));
});
