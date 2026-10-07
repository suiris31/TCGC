// Tests des cinq autres decks : effets délicats sur des situations construites à la main, et parties complètes
// IA contre IA sur toutes les confrontations
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { determinize } from '../ai/search.ts';
import { DECKS } from '../engine/decks.ts';
import { act, advance, newGame } from '../engine/engine.ts';
import { canBeRested, def, donOnField, handCost, hasBlocker, power } from '../engine/rules.ts';
import type { Card, FieldCard, GameState } from '../engine/types.ts';

let uid = 8000;
const card = (num: string): Card => ({ uid: uid++, num });
const field = (num: string, extra: Partial<FieldCard> = {}): FieldCard => ({ uid: uid++, num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra });

// Partie après les mains de départ, tour 5 du joueur 0, modifiée par setup puis relancée jusqu'à la décision suivante
function scenario(decks: [string, string], setup: (s: GameState) => void): GameState {
  const s = act(act(newGame({ decks, names: ['Moi', 'IA'], seed: 11, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 2;
  s.turn = 5;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

const attack = (s: GameState, attacker: number, target: number) => act(s, `attack:${attacker}:${target}`);
const tagIs = (s: GameState, tag: string) => assert.equal(s.decision?.tag, tag, `décision attendue : ${tag}, obtenue : ${s.decision?.tag} (${s.decision?.prompt})`);

test('Thousand Sunny : Lieu joué hors de la zone de Personnage, activation, remplacement par un autre Lieu', () => {
  const sunny = card('ST31-005');
  const sunny2 = card('ST31-005');
  const jinbe = card('ST31-002');
  let s = scenario(['ST-31', 'ST-35'], (g) => {
    const P = g.players[0];
    P.hand = [sunny, sunny2];
    P.donActive = 2;
    P.donRested = 1;
    P.deck = [card('OP11-003'), jinbe, card('OP13-021'), card('OP11-009'), card('P-101'), ...P.deck];
  });
  s = act(s, `play:${sunny.uid}`);
  tagIs(s, 'pick');
  s = act(s, `card:${jinbe.uid}`);
  assert.equal(s.players[0].stage?.uid, sunny.uid);
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(s.players[0].hand.some((c) => c.uid === jinbe.uid));
  s = act(s, `act:${sunny.uid}`);
  assert.equal(s.players[0].stage!.rested, true);
  assert.equal(s.players[0].leader.don, 1);
  s = act(s, `play:${sunny2.uid}`);
  if (s.decision?.tag === 'pick') s = act(s, 'none');
  assert.equal(s.players[0].stage!.uid, sunny2.uid);
  assert.ok(s.players[0].trash.some((c) => c.uid === sunny.uid));
});

test('[Initiative] attaque le tour où il est joué ; [Initiative : Personnage] seulement les Personnages', () => {
  const zoro = card('OP14-015');
  let s = scenario(['ST-31', 'ST-35'], (g) => {
    g.players[0].hand = [zoro];
    g.players[0].donActive = 7;
  });
  s = act(s, `play:${zoro.uid}`);
  assert.ok(s.decision!.options.some((o) => o.id === `attack:${zoro.uid}:${s.players[1].leader.uid}`));

  const small = card('ST32-005');
  const rested = field('OP12-093', { rested: true });
  s = scenario(['ST-32', 'ST-35'], (g) => {
    g.players[0].hand = [small];
    g.players[0].donActive = 1;
    g.players[1].chars = [rested];
  });
  s = act(s, `play:${small.uid}`);
  const ids = s.decision!.options.map((o) => o.id);
  assert.ok(ids.includes(`attack:${small.uid}:${rested.uid}`));
  assert.ok(!ids.includes(`attack:${small.uid}:${s.players[1].leader.uid}`));
});

test('Kidd : retourne une Vie face cachée pour devenir la cible de l’attaque', () => {
  const kidd = field('ST36-005');
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 2;
    g.players[1].chars = [kidd];
    g.players[1].life[0].faceUp = true;
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  tagIs(s, 'kiddRedirect');
  assert.equal(s.decision!.player, 1);
  s = act(s, 'top');
  assert.equal(s.battle!.target, kidd.uid);
  assert.equal(s.players[1].life[0].faceUp, false);
});

test('Bonney : un Personnage adverse finit face visible au-dessous de la Vie de son propriétaire', () => {
  const bonney = card('P-085');
  const koshiro = field('OP12-027');
  let s = scenario(['ST-36', 'ST-32'], (g) => {
    g.players[0].hand = [bonney];
    g.players[0].donActive = 5;
    g.players[1].chars = [koshiro];
  });
  s = act(s, `play:${bonney.uid}`);
  tagIs(s, 'oppToLife');
  s = act(s, `card:${koshiro.uid}`);
  tagIs(s, 'lifeSideOpp');
  s = act(s, 'lifeBottom');
  const life = s.players[1].life;
  assert.equal(life.length, 6);
  assert.equal(life[5].uid, koshiro.uid);
  assert.equal(life[5].faceUp, true);
  assert.equal(s.players[1].chars.length, 0);
});

test('Killer : son [Déclenchement] le joue quand l’adversaire a 3 Vies ou moins', () => {
  const killer = card('ST36-002');
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].life = g.players[0].life.slice(0, 3);
    g.players[0].leader.don = 3;
    g.players[1].life[0] = killer;
    g.players[1].hand = [];
    g.players[1].chars = [];
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  tagIs(s, 'trigger');
  s = act(s, 'trigger');
  assert.ok(s.players[1].chars.some((c) => c.uid === killer.uid));
  assert.ok(!s.players[1].trash.some((c) => c.uid === killer.uid));
  // [Votre tour] [Jouée] : pas de Vie en plus pendant le tour adverse
  assert.equal(s.players[1].life.length, 4);
});

test('Katakuri : DON!! −1 du Leader, Katakuri rend 2 DON!!, carte du dessus adverse regardée, +1000', () => {
  const kat = field('ST34-001');
  let s = scenario(['ST-34', 'ST-35'], (g) => {
    const P = g.players[0];
    P.chars = [kat];
    P.donActive = 4;
    P.donRested = 0;
    P.donDeck = 6;
  });
  const leader = s.players[0].leader.uid;
  s = attack(s, leader, s.players[1].leader.uid);
  tagIs(s, 'mayKatakuri');
  s = act(s, 'yes');
  assert.equal(donOnField(s, 0), 5);
  assert.equal(s.players[0].donRested, 2);
  assert.equal(s.peek[0], s.players[1].deck[0].uid);
  assert.equal(power(s, leader), 6000);
  assert.ok(s.log.some((l) => l.only === 0 && l.text.includes('carte du dessus du deck adverse')));
});

test('Slurp : déclarer le coût de la carte regardée pioche 1 carte et donne 1 DON!! redressée', () => {
  const slurp = field('OP11-071');
  const fodder = card('OP11-068');
  let s = scenario(['ST-34', 'ST-35'], (g) => {
    g.players[0].chars = [slurp];
    g.players[0].hand = [fodder];
    g.players[0].donActive = 0;
    g.players[0].donDeck = 5;
    g.peek[0] = g.players[1].deck[0].uid;
  });
  const top = s.players[1].deck[0];
  s = act(s, `act:${slurp.uid}`);
  tagIs(s, 'declareCost');
  assert.ok(s.decision!.prompt.includes(def(top.num).name));
  assert.equal(heuristicChooser(s, s.decision!), `cost:${def(top.num).cost}`);
  s = act(s, `cost:${def(top.num).cost}`);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].donActive, 1);
});

test('Koshiro s’épuise à la place d’un Personnage <Tranche> mis KO par un effet adverse', () => {
  const cracker = card('ST34-002');
  const koshiro = field('OP12-027');
  const zoro = field('ST32-005');
  let s = scenario(['ST-34', 'ST-32'], (g) => {
    g.players[0].hand = [cracker];
    g.players[0].donActive = 4;
    g.players[1].chars = [koshiro, zoro];
  });
  s = act(s, `play:${cracker.uid}`);
  tagIs(s, 'oppKo');
  s = act(s, `card:${zoro.uid}`);
  tagIs(s, 'replace');
  assert.equal(s.decision!.player, 1);
  s = act(s, `replace:${koshiro.uid}`);
  assert.ok(s.players[1].chars.some((c) => c.uid === zoro.uid));
  assert.equal(s.players[1].chars.find((c) => c.uid === koshiro.uid)!.rested, true);
});

test('Kuzan (Leader) pioche après une défausse par une carte {Marine} ; Borsalino coûte 3 de moins', () => {
  const kobby = card('ST33-001');
  const borsalino = card('ST33-004');
  const junk = card('OP12-045');
  let s = scenario(['ST-33', 'ST-35'], (g) => {
    g.players[0].hand = [kobby, borsalino, junk];
    g.players[0].donActive = 5;
  });
  assert.equal(handCost(s, 0, borsalino), 6);
  s = act(s, `play:${kobby.uid}`);
  tagIs(s, 'mayDiscard');
  s = act(s, 'yes');
  s = act(s, `card:${junk.uid}`);
  // Kobby pioche 1 et le Leader pioche 1 : Borsalino + 2 cartes
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(handCost(s, 0, borsalino), 3);
});

test('Kidd (Leader) : en fin de tour, Vie face visible, Personnage redressé avec [Bloqueur] pendant le tour adverse', () => {
  const urouge = field('OP10-101', { rested: true });
  let s = scenario(['ST-36', 'ST-35'], (g) => { g.players[0].chars = [urouge]; });
  s = act(s, 'end');
  tagIs(s, 'mayKiddLeader');
  s = act(s, 'yes');
  tagIs(s, 'ownReady');
  s = act(s, `card:${urouge.uid}`);
  assert.equal(s.active, 1);
  assert.equal(s.players[0].life[0].faceUp, true);
  const u = s.players[0].chars[0];
  assert.equal(u.rested, false);
  assert.ok(hasBlocker(s, 0, u));
});

test('Hawkins mis KO : la carte du dessus de la Vie adverse va dans la Défausse', () => {
  const hawkins = field('OP10-109', { rested: true });
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 2;
    g.players[1].chars = [hawkins];
    g.players[1].hand = [];
  });
  const lifeBefore = s.players[0].life.length;
  const topLife = s.players[0].life[0];
  s = attack(s, s.players[0].leader.uid, hawkins.uid);
  assert.equal(s.players[0].life.length, lifeBefore - 1);
  assert.ok(s.players[0].trash.some((c) => c.uid === topLife.uid));
});

test('Oden : le Personnage visé ne peut plus être épuisé (ni attaquer ni bloquer)', () => {
  const oden = card('ST32-002');
  const target = field('OP12-093');
  let s = scenario(['ST-32', 'ST-35'], (g) => {
    g.players[0].hand = [oden];
    g.players[0].donActive = 5;
    g.players[1].chars = [target];
  });
  s = act(s, `play:${oden.uid}`);
  tagIs(s, 'oppLock');
  s = act(s, `card:${target.uid}`);
  assert.equal(canBeRested(s, target.uid), false);
});

test('Zoro (Leader) se redresse après avoir battu un Personnage et peut attaquer le Leader', () => {
  const morley = field('OP12-093', { rested: true });
  let s = scenario(['ST-32', 'ST-35'], (g) => {
    g.players[0].leader.don = 3;
    g.players[1].chars = [morley];
    g.players[1].hand = [];
  });
  const L = s.players[0].leader.uid;
  s = attack(s, L, morley.uid);
  assert.ok(s.decision!.options.some((o) => o.id === `act:${L}`));
  s = act(s, `act:${L}`);
  assert.equal(s.players[0].leader.rested, false);
  assert.ok(s.decision!.options.some((o) => o.id === `attack:${L}:${s.players[1].leader.uid}`));
});

test('Simulation : les Vies face visible et la carte regardée restent à leur place', () => {
  const s = scenario(['ST-34', 'ST-36'], (g) => {
    g.players[1].life[2].faceUp = true;
    g.peek[0] = g.players[1].deck[0].uid;
  });
  const faceUp = s.players[1].life[2].uid;
  const top = s.players[1].deck[0].uid;
  for (let seed = 1; seed <= 5; seed++) {
    const d = determinize(s, 0, seed);
    assert.equal(d.players[1].life[2].uid, faceUp);
    assert.equal(d.players[1].deck[0].uid, top);
  }
});

test('Toutes les confrontations se jouent jusqu’au bout (IA contre IA)', () => {
  const ids = Object.keys(DECKS);
  for (const a of ids) {
    for (const b of ids) {
      const s = newGame({ decks: [a, b], names: [a, b], seed: 42 + ids.indexOf(a) * 6 + ids.indexOf(b) }, heuristicChooser);
      assert.notEqual(s.winner, null, `${a} contre ${b}`);
    }
  }
});
