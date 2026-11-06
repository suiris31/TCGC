// Cartes d'OP15 (étape C, tâche S3) : un test par effet codé à la main (game/engine/cards/op15.ts), condition vraie et
// fausse, et les recettes que les tests générés ne savent pas vérifier ([Contre] « pendant ce combat », retraits en
// chaîne). Decks d'essai faits des cartes d'OP15 ; l'adversaire met KO avec Monkey.D.Garp ST06-012 (effet adverse) ou
// attaque avec les Personnages de ST-21. Les tests citent des numéros et des valeurs, jamais un texte de carte.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardStatus } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { def, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const MINE = [
  'OP15-003', 'OP15-015', 'OP15-023', 'OP15-031', 'OP15-035', 'OP15-042', 'OP15-043', 'OP15-046', 'OP15-047', 'OP15-050',
  'OP15-052', 'OP15-054', 'OP15-055', 'OP15-057', 'OP15-080', 'OP15-082', 'OP15-086', 'OP15-090', 'OP15-094', 'OP15-095',
  'OP15-096', 'OP15-106', 'OP15-107', 'OP15-110', 'OP15-114', 'OP15-041', 'OP03-023',
];
const OPP = ['ST06-012', 'ST06-010', 'ST21-004', 'ST21-006', 'ST21-008', 'ST21-014', 'OP03-023', 'OP15-057'];
const four = (nums: string[]) => Object.fromEntries(nums.map((n) => [n, 4]));
const deck = (id: string, leader: string, cards: string[]) => {
  DECKS[id] = { id, name: 'Essai', series: 'TEST', leader, cards: four(cards) };
  return id;
};
const LUCY = deck('TEST-OP15-LUCY', 'OP15-002', MINE);
const REBECCA = deck('TEST-OP15-REBECCA', 'OP15-039', MINE);
const BROOK = deck('TEST-OP15-BROOK', 'OP15-022', MINE);
const SKY = deck('TEST-OP15-LUFFY', 'OP15-098', MINE);
const MORIA = deck('TEST-OP15-MORIA', 'OP14-080', MINE);
const PLAIN = deck('TEST-OP15-PLAIN', 'ST21-001', MINE);
const GARP = deck('TEST-OP15-GARP', 'OP02-093', OPP);

const mine = (s: GameState, num: string, p: PlayerId = 0) => s.players[p].chars.find((c) => c.num === num)!;
const anyCard = (s: GameState) => choose(s, (o) => o.id.startsWith('card:'));
function noDefense(s: GameState) {
  while (s.decision && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
}
// Garp (ST06-012) du joueur 1 met KO un Personnage du joueur 0 de coût 4 ou moins (effet adverse)
function garpKo(s: GameState, victim: number) {
  s = act(s, `act:${mine(s, 'ST06-012', 1).uid}`);
  while (s.decision?.tag === 'discard') s = anyCard(s);
  expectTag(s, 'oppKo');
  return choose(s, `card:${victim}`);
}
// coût « donner 1 DON!! épuisée adverse à un Personnage adverse » payé, puis la DON!! de l'effet va à son Leader
function giveToLeader(s: GameState) {
  while (s.decision?.inEffect) {
    const leader = `card:${s.players[0].leader.uid}`;
    s = s.decision.tag === 'may' ? choose(s, 'yes') : hasOption(s, leader) ? choose(s, leader) : anyCard(s);
  }
  return s;
}
// adversaire actif, Garp sur son terrain et une carte à défausser
const garpTurn = (leaderDeck: string, setup: (g: GameState) => void) => scenario([leaderDeck, GARP], (g) => {
  setChars(g, 1, [{ num: 'ST06-012' }]);
  setHand(g, 1, ['ST06-010']);
  setup(g);
}, 1);

test('OP15 : les cartes codées à la main sont jouables, les trois cartes que le moteur ne sait pas dire ne le sont pas', () => {
  for (const n of ['OP15-002', 'OP15-003', 'OP15-022', 'OP15-023', 'OP15-031', 'OP15-035', 'OP15-042', 'OP15-046', 'OP15-050',
    'OP15-052', 'OP15-054', 'OP15-080', 'OP15-086', 'OP15-090', 'OP15-094', 'OP15-106']) assert.equal(cardStatus(n), 'coded', n);
  for (const n of ['OP15-025', 'OP15-092', 'OP15-093']) assert.equal(cardStatus(n), 'todo', n);
  // Leader Luffy : codé, mais en doute (même tournure que EB05-061, vague S-1) : pas jouable
  assert.equal(confidence('OP15-098'), 'doubt');
});

// ---------- Remplacements « à la place » ----------

test('Laboon (OP15-035) : épuiser 2 de ses cartes au lieu de perdre un Personnage de 7000 de base ou moins', () => {
  let s = garpTurn(PLAIN, (g) => {
    setChars(g, 0, [{ num: 'OP15-035' }, { num: 'OP15-110' }]);
    setDon(g, 0, 2, 0);
  });
  const braham = mine(s, 'OP15-110');
  s = garpKo(s, braham.uid);
  expectTag(s, 'replace');
  s = choose(s, `replace:${mine(s, 'OP15-035').uid}`);
  while (s.decision?.tag === 'restCost') s = choose(s, 'don');
  assert.ok(mine(s, 'OP15-110'), 'Braham reste');
  assert.equal(s.players[0].donRested, 2);
  coherent(s);
  const r = def('OP15-035').replaceRemoval!;
  s.players[0].donActive = 0;
  s.players[0].donRested = 2;
  s.players[0].leader.rested = true;
  mine(s, 'OP15-035').rested = true;
  mine(s, 'OP15-110').rested = true;
  assert.equal(r.condition(s, 0, mine(s, 'OP15-035'), mine(s, 'OP15-110')), false, 'plus rien à épuiser');
});

test('Laboon, Léo, Perona : rien pour un Personnage de plus de 7000 de puissance de base', () => {
  const s = scenario([PLAIN, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-035' }, { num: 'OP15-052' }, { num: 'OP15-090' }, { num: 'OP15-046' }]); setDon(g, 0, 4); });
  const sabo = mine(s, 'OP15-046');  // 9000
  for (const n of ['OP15-035', 'OP15-052', 'OP15-090']) {
    const r = def(n).replaceRemoval!;
    assert.equal(r.condition(s, 0, mine(s, n), sabo), false, n);
    assert.equal(r.condition(s, 0, mine(s, n), mine(s, 'OP15-090')), true, `${n} : Perona, 2000`);
    assert.equal(r.onlyKo, false, `${n} : toute sortie du terrain`);
  }
});

test('Léo (OP15-052) : placer un autre de ses Personnages au-dessous du deck à la place', () => {
  let s = garpTurn(PLAIN, (g) => { setChars(g, 0, [{ num: 'OP15-052' }, { num: 'OP15-110' }, { num: 'OP15-041' }]); });
  const braham = mine(s, 'OP15-110');
  const orlumbus = mine(s, 'OP15-041');
  s = garpKo(s, braham.uid);
  s = choose(s, `replace:${mine(s, 'OP15-052').uid}`);
  expectTag(s, 'bottomOwn');
  assert.ok(!hasOption(s, `card:${braham.uid}`), 'pas le Personnage menacé lui-même');
  s = choose(s, `card:${orlumbus.uid}`);
  assert.ok(mine(s, 'OP15-110'));
  assert.equal(mine(s, 'OP15-041'), undefined);
  assert.equal(s.players[0].deck.at(-1)!.uid, orlumbus.uid);
  coherent(s);
  const r = def('OP15-052').replaceRemoval!;
  const t = scenario([PLAIN, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-052' }]); });
  assert.equal(r.condition(t, 0, mine(t, 'OP15-052'), mine(t, 'OP15-052')), false, 'seul : aucun autre Personnage');
});

test('Perona (OP15-090) : défausser 1 carte à la place ; main vide : rien', () => {
  let s = garpTurn(PLAIN, (g) => { setChars(g, 0, [{ num: 'OP15-090' }, { num: 'OP15-110' }]); setHand(g, 0, ['OP03-023']); });
  s = garpKo(s, mine(s, 'OP15-110').uid);
  s = choose(s, `replace:${mine(s, 'OP15-090').uid}`);
  if (s.decision?.tag === 'discard') s = anyCard(s);
  assert.ok(mine(s, 'OP15-110'));
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].trash.at(-1)!.num, 'OP03-023');
  coherent(s);
  s.players[0].hand = [];
  assert.equal(def('OP15-090').replaceRemoval!.condition(s, 0, mine(s, 'OP15-090'), mine(s, 'OP15-110')), false);
});

test('Roronoa Zoro (OP15-094) : se placer dans la Défausse à la place d’un autre Personnage {Équipage de Chapeau de paille}', () => {
  let s = garpTurn(PLAIN, (g) => { setChars(g, 0, [{ num: 'OP15-094' }, { num: 'OP15-047' }, { num: 'OP15-110' }]); });
  const zoro = mine(s, 'OP15-094');
  s = garpKo(s, mine(s, 'OP15-047').uid);
  s = choose(s, `replace:${zoro.uid}`);
  assert.ok(mine(s, 'OP15-047'), 'Sanji reste');
  assert.equal(mine(s, 'OP15-094'), undefined);
  assert.ok(s.players[0].trash.some((c) => c.uid === zoro.uid));
  coherent(s);
  const r = def('OP15-094').replaceRemoval!;
  const t = scenario([PLAIN, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-094' }, { num: 'OP15-110' }]); });
  assert.equal(r.condition(t, 0, mine(t, 'OP15-094'), mine(t, 'OP15-110')), false, 'pas {Équipage de Chapeau de paille}');
  assert.equal(r.condition(t, 0, mine(t, 'OP15-094'), mine(t, 'OP15-094')), false, 'pas lui-même');
  assert.equal(hasKeyword(t, 0, mine(t, 'OP15-094'), 'Blocker'), true);
});

test('Monkey D. Luffy (Leader OP15-098) : prendre la Vie du dessus en main au lieu de perdre un Personnage {Île céleste} de 6000 de base ou plus', () => {
  // effet adverse
  let s = garpTurn(SKY, (g) => { setChars(g, 0, [{ num: 'OP15-107' }, { num: 'OP15-110' }]); });
  const life = s.players[0].life.length;
  s = garpKo(s, mine(s, 'OP15-107').uid);
  s = choose(s, `replace:${s.players[0].leader.uid}`);
  assert.ok(mine(s, 'OP15-107'));
  assert.equal(s.players[0].life.length, life - 1);
  coherent(s);
  // 4000 de base : rien à remplacer, Braham est mis KO
  s = garpTurn(SKY, (g) => { setChars(g, 0, [{ num: 'OP15-110' }]); });
  s = garpKo(s, mine(s, 'OP15-110').uid);
  assert.equal(s.decision?.tag === 'replace', false);
  assert.equal(mine(s, 'OP15-110'), undefined);
  // KO en combat contre une attaque adverse
  s = scenario([SKY, GARP], (g) => {
    setChars(g, 0, [{ num: 'OP15-107', extra: { rested: true } }]);
    setChars(g, 1, [{ num: 'ST21-014' }]);
    setHand(g, 0, []);
  }, 1);
  const lifeBefore = s.players[0].life.length;
  s = noDefense(attack(s, mine(s, 'ST21-014', 1).uid, mine(s, 'OP15-107').uid));
  expectTag(s, 'replace');
  s = choose(s, (o) => o.id === 'yes');
  assert.ok(mine(s, 'OP15-107'), 'reste après le combat');
  assert.equal(s.players[0].life.length, lifeBefore - 1);
  coherent(s);
  // Vie vide : rien
  const t = scenario([SKY, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-107' }]); });
  t.players[0].life = [];
  assert.equal(def('OP15-098').replaceRemoval!.condition(t, 0, t.players[0].leader, mine(t, 'OP15-107')), false);
  // pas pendant son propre tour en combat (seulement contre une attaque adverse)
  assert.equal(def('OP15-098').koReplaceAlly!.condition(t, 0, t.players[0].leader, mine(t, 'OP15-107')), false);
});

test('Alvida (OP15-003) : défausser un Personnage de 6000 ou moins au lieu d’être mise KO ; donner des DON!!', () => {
  let s = garpTurn(PLAIN, (g) => {
    setChars(g, 0, [{ num: 'OP15-003' }]);
    setHand(g, 0, ['OP15-110']);
    g.mods.push({ uid: g.players[0].chars[0].uid, stat: 'cost', amount: -1, until: 'turn', source: 'essai' });
  });
  const alvida = mine(s, 'OP15-003');
  s = garpKo(s, alvida.uid);
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = anyCard(s);
  assert.ok(mine(s, 'OP15-003'));
  assert.equal(s.players[0].trash.at(-1)!.num, 'OP15-110');
  coherent(s);
  const k = def('OP15-003').koReplace!;
  s.players[0].hand = [];
  assert.equal(k.condition(s, 0, mine(s, 'OP15-003')), false, 'pas de Personnage en main');
  // [Activation : Principale] : 1 DON!! épuisée adverse à un Personnage adverse, puis 1 DON!! épuisée à son Leader
  s = scenario([PLAIN, GARP], (g) => {
    setChars(g, 0, [{ num: 'OP15-003' }]);
    setChars(g, 1, [{ num: 'ST21-004' }]);
    setDon(g, 0, 0, 2);
    setDon(g, 1, 0, 2);
  });
  s = giveToLeader(act(s, `act:${mine(s, 'OP15-003').uid}`));
  assert.equal(mine(s, 'ST21-004', 1).don, 1);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(s.players[0].donRested, 1);
  coherent(s);
});

// ---------- Leaders ----------

test('Lucy (Leader OP15-002) : +1000 par Événement ou Lieu défaussé en attaquant ; pioche après un Événement de coût 3 ou plus', () => {
  let s = scenario([LUCY, GARP], (g) => {
    setHand(g, 0, ['OP15-055', 'OP15-057', 'OP15-110']);
    setChars(g, 1, []);
    setDon(g, 0, 6);
  });
  const leader = s.players[0].leader;
  assert.ok(!hasOption(s, `act:${leader.uid}`), 'aucun Événement activé ce tour');
  s = attack(s, leader.uid, s.players[1].leader.uid);
  s = choose(s, 'yes');
  s = choose(s, `card:${s.players[0].hand.find((c) => c.num === 'OP15-055')!.uid}`);
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = anyCard(s);
  assert.equal(s.players[0].hand.map((c) => c.num).join(), 'OP15-110', 'plus d’Événement ni de Lieu : plus de question');
  assert.equal(power(s, leader.uid), 7000);
  coherent(s);
  // un Événement de coût 3 (OP15-055) activé : l'[Activation : Principale] pioche 1 carte
  s = scenario([LUCY, GARP], (g) => { setHand(g, 0, ['OP15-055']); setDon(g, 0, 6); });
  s = play(s, 'OP15-055');
  if (s.decision?.tag === 'chooseOne') s = choose(s, 'choice:0');
  const hand = s.players[0].hand.length;
  s = act(s, `act:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.ok(!hasOption(s, `act:${s.players[0].leader.uid}`), 'une fois par tour');
  // un Événement de coût 1 : rien
  s = scenario([LUCY, GARP], (g) => { setHand(g, 0, ['OP15-096']); setDon(g, 0, 6); });
  s = play(s, 'OP15-096');
  while (s.decision?.tag === 'may') s = choose(s, 'no');
  assert.ok(!hasOption(s, `act:${s.players[0].leader.uid}`));
});

test('Brook (Leader OP15-022) : défausser 4 cartes du deck, redresser un Personnage à deck vide, perdre seulement à la fin du tour', () => {
  let s = scenario([BROOK, GARP], (g) => {
    setChars(g, 0, [{ num: 'OP15-110', extra: { rested: true } }]);
    g.players[0].trash.push(...g.players[0].deck.splice(4));
  });
  assert.equal(s.players[0].deck.length, 4);
  s = act(s, `act:${s.players[0].leader.uid}`);
  if (s.decision?.tag === 'ownReady') s = anyCard(s);
  assert.equal(s.players[0].deck.length, 0);
  assert.equal(mine(s, 'OP15-110').rested, false);
  assert.equal(s.winner, null, 'pas de défaite pendant le tour');
  s = act(s, 'end');
  assert.equal(s.winner, 1, 'défaite à la fin du tour');
  // deck encore plein : rien à redresser
  s = scenario([BROOK, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-110', extra: { rested: true } }]); });
  s = act(s, `act:${s.players[0].leader.uid}`);
  assert.equal(mine(s, 'OP15-110').rested, true);
  assert.equal(s.decision?.tag === 'ownReady', false);
});

// ---------- Personnages et Événements ----------

test('Arlong (OP15-023) : [En cas de KO] 2 cartes adverses épuisées (DON!! comprises) restent épuisées ; DON!! de la zone de Coût', () => {
  let s = garpTurn(PLAIN, (g) => {
    setChars(g, 0, [{ num: 'OP15-023' }]);
    setChars(g, 1, [{ num: 'ST06-012' }, { num: 'ST21-004', extra: { rested: true } }]);
    setDon(g, 1, 3, 2);
  });
  s = garpKo(s, mine(s, 'OP15-023').uid);
  expectTag(s, 'oppLock');
  s = choose(s, `card:${mine(s, 'ST21-004', 1).uid}`);
  s = choose(s, 'don');
  assert.ok(s.mods.some((m) => m.stat === 'noRefresh' && m.uid === mine(s, 'ST21-004', 1).uid && m.until === 7));
  assert.deepEqual(s.players[1].donNoRefresh, { turn: 7, count: 1 });
  coherent(s);
  // [Activation : Principale] : une de ses cartes reçoit une DON!! épuisée de sa zone de Coût
  s = scenario([PLAIN, GARP], (g) => {
    setChars(g, 0, [{ num: 'OP15-023' }]);
    setChars(g, 1, [{ num: 'ST21-004' }]);
    setDon(g, 0, 2, 1);
    setDon(g, 1, 0, 1);
  });
  s = giveToLeader(act(s, `act:${mine(s, 'OP15-023').uid}`));
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(s.players[0].donRested, 0, 'une DON!! épuisée');
  assert.equal(s.players[0].donActive, 2);
  coherent(s);
});

test('Pudding (OP15-031) : KO d’un Personnage adverse épuisé dont le coût égale ses DON!! données', () => {
  let s = scenario([PLAIN, GARP], (g) => {
    setHand(g, 0, ['OP15-031']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'ST21-006', extra: { rested: true, don: 3 } }, { num: 'ST21-008', extra: { rested: true, don: 3 } }, { num: 'ST21-004', extra: { don: 1 } }]);
    setDon(g, 1, 0, 0);
  });
  const stussy = mine(s, 'ST21-006', 1);  // coût 3, 3 DON!!
  s = play(s, 'OP15-031');
  expectTag(s, 'oppKo');
  assert.ok(!hasOption(s, `card:${mine(s, 'ST21-008', 1).uid}`), 'coût 4, 3 DON!!');
  assert.ok(!hasOption(s, `card:${mine(s, 'ST21-004', 1).uid}`), 'redressé');
  s = choose(s, `card:${stussy.uid}`);
  assert.equal(mine(s, 'ST21-006', 1), undefined);
  coherent(s);
});

test('Kyros (OP15-042) : [Initiative] avec le Leader [Rebecca] ; revient en main après un KO', () => {
  let s = scenario([REBECCA, GARP], (g) => { setHand(g, 0, ['OP15-042', 'OP03-023']); setDon(g, 0, 3); });
  s = play(s, 'OP15-042');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = anyCard(s);
  assert.equal(hasKeyword(s, 0, mine(s, 'OP15-042'), 'Rush'), true);
  s = scenario([PLAIN, GARP], (g) => { setHand(g, 0, ['OP15-042', 'OP03-023']); setDon(g, 0, 3); });
  s = play(s, 'OP15-042');
  assert.equal(s.decision?.tag === 'may', false, 'Leader autre que [Rebecca] : pas de coût à payer pour rien');
  assert.equal(hasKeyword(s, 0, mine(s, 'OP15-042'), 'Rush'), false);
  s = garpTurn(PLAIN, (g) => { setChars(g, 0, [{ num: 'OP15-042' }]); });
  const kyros = mine(s, 'OP15-042');
  s = garpKo(s, kyros.uid);
  assert.ok(s.players[0].hand.some((c) => c.uid === kyros.uid));
  coherent(s);
});

test('Sabo (OP15-046) : avec un Leader {Dressrosa}, activer un Événement {Dressrosa} de sa main', () => {
  let s = scenario([REBECCA, GARP], (g) => { setHand(g, 0, ['OP15-046', 'OP15-055']); setDon(g, 0, 7); });
  s = play(s, 'OP15-046');
  expectTag(s, 'playFree');
  s = anyCard(s);
  if (s.decision?.tag === 'chooseOne') s = choose(s, 'choice:0');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP15-055'));
  assert.equal(s.players[0].donActive, 0, 'Événement activé sans payer');
  s = scenario([PLAIN, GARP], (g) => { setHand(g, 0, ['OP15-046', 'OP15-055']); setDon(g, 0, 7); });
  s = play(s, 'OP15-046');
  assert.equal(s.decision?.tag === 'playFree', false);
});

test('OP15-054 : avec le Leader [Lucy], piocher-défausser-jouer, ou renvoyer un Lieu', () => {
  let s = scenario([LUCY, GARP], (g) => { setHand(g, 0, ['OP15-054', 'OP15-047']); setDon(g, 0, 4); });
  s = play(s, 'OP15-054');
  if (s.decision?.tag === 'chooseOne') s = choose(s, 'choice:0');
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined && s.players[0].hand.find((c) => c.uid === o.uid)?.num !== 'OP15-047');
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.num === 'OP15-047');
  assert.ok(mine(s, 'OP15-047'));
  coherent(s);
  // renvoyer le Lieu adverse
  s = scenario([LUCY, GARP], (g) => {
    setHand(g, 0, ['OP15-054']);
    setDon(g, 0, 4);
    const st = g.players[1].deck.findIndex((c) => c.num === 'OP15-057');
    const [c] = g.players[1].deck.splice(st, 1);
    g.players[1].stage = { uid: c.uid, num: c.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
  });
  const stage = s.players[1].stage!;
  s = play(s, 'OP15-054');
  s = choose(s, 'choice:1');
  s = choose(s, `card:${stage.uid}`);
  assert.equal(s.players[1].stage, null);
  assert.ok(s.players[1].hand.some((c) => c.uid === stage.uid));
  coherent(s);
  // autre Leader : rien
  s = scenario([PLAIN, GARP], (g) => { setHand(g, 0, ['OP15-054']); setDon(g, 0, 4); });
  const hand = s.players[0].hand.length;
  s = play(s, 'OP15-054');
  assert.equal(s.decision?.tag === 'chooseOne', false);
  assert.equal(s.players[0].hand.length, hand - 1);
});

test('Oz (OP15-080) : +7000 avec un [Gecko Moria] de 10000 ou plus et sans autre [Oars] ; revient de la Défausse', () => {
  const s = scenario([MORIA, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-080' }]); });
  const oz = mine(s, 'OP15-080');
  assert.equal(power(s, oz.uid), 0);
  s.players[0].leader.don = 5;   // Leader Gecko Moria 5000 + 5000 pendant son tour
  assert.equal(power(s, oz.uid), 7000);
  const t = scenario([MORIA, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-080' }, { num: 'OP15-080' }]); });
  t.players[0].leader.don = 5;
  assert.equal(power(t, t.players[0].chars[0].uid), 0, 'un autre [Oars]');
  const u = scenario([PLAIN, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-080' }]); });
  u.players[0].leader.don = 5;
  assert.equal(power(u, mine(u, 'OP15-080').uid), 0, 'pas de [Gecko Moria]');
  // [En cas de KO] : 3 cartes de la Défausse sous le deck, Oz revient
  let k = garpTurn(MORIA, (g) => { setChars(g, 0, [{ num: 'OP15-080' }]); g.players[0].trash.push(...g.players[0].deck.splice(0, 3)); });
  const ozK = mine(k, 'OP15-080');
  k = garpKo(k, ozK.uid);
  k = choose(k, 'yes');
  while (k.decision?.tag && k.decision.tag !== 'replace' && k.decision.options.some((o) => o.id.startsWith('card:'))) k = anyCard(k);
  if (k.decision?.tag === 'bottomOrder') k = act(k, 'keep');
  assert.ok(k.players[0].chars.some((c) => c.uid === ozK.uid), 'Oz rejoué');
  coherent(k);
});

test('Nami (OP15-086) : avec un Leader {Équipage de Chapeau de paille}, jouer de la Défausse un Personnage du même type, qui gagne [Initiative]', () => {
  let s = scenario([BROOK, GARP], (g) => {
    setHand(g, 0, ['OP15-086']);
    setDon(g, 0, 8);
    const i = g.players[0].deck.findIndex((c) => c.num === 'OP15-047');
    g.players[0].trash.push(...g.players[0].deck.splice(i, 1));
  });
  s = play(s, 'OP15-086');
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.num === 'OP15-047');
  if (s.decision?.tag === 'ownGrant') s = choose(s, 'none');
  assert.equal(hasKeyword(s, 0, mine(s, 'OP15-047'), 'Rush'), true);
  coherent(s);
  s = scenario([REBECCA, GARP], (g) => {
    setHand(g, 0, ['OP15-086']);
    setDon(g, 0, 8);
    const i = g.players[0].deck.findIndex((c) => c.num === 'OP15-047');
    g.players[0].trash.push(...g.players[0].deck.splice(i, 1));
  });
  s = play(s, 'OP15-086');
  assert.equal(s.decision?.tag === 'playFree', false, 'Leader {Dressrosa} : pas de ce type');
});

test('Pieuvre ballon (OP15-106) : [Déclenchement] piocher 1 carte, puis jouer une carte Personnage ou Lieu jaune de coût 2 ou moins', () => {
  let s = scenario([SKY, GARP], (g) => {
    setLife(g, 0, ['OP15-106']);
    setHand(g, 0, ['OP15-107']);  // jaune, coût 4 : pas proposé
    setChars(g, 1, [{ num: 'ST21-014' }]);
  }, 1);
  s = noDefense(attack(s, mine(s, 'ST21-014', 1).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  if (s.decision?.tag === 'playFree') {
    assert.ok(!s.decision.options.some((o) => o.num === 'OP15-107'));
  }
  assert.ok(s.players[0].hand.length >= 2, 'pioche 1 carte');
  const eligible = def('OP15-106');
  assert.ok(eligible.onTrigger);
});

test('Bobby Funk (OP15-050) : +3000 avec un Personnage [Kelly Funk] ; Kelly Funk (OP15-043) le joue de sa main', () => {
  let s = scenario([PLAIN, GARP], (g) => { setHand(g, 0, ['OP15-043', 'OP15-050']); setDon(g, 0, 5); });
  s = play(s, 'OP15-043');
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.num === 'OP15-050');
  assert.equal(power(s, mine(s, 'OP15-050').uid), (def('OP15-050').power ?? 0) + 3000);
  const t = scenario([PLAIN, GARP], (g) => { setChars(g, 0, [{ num: 'OP15-050' }]); });
  assert.equal(power(t, mine(t, 'OP15-050').uid), def('OP15-050').power ?? 0);
  coherent(s);
});

// ---------- Recettes que les tests générés ne vérifient pas ----------

test('Wiper (OP15-114, recette) : retourner une Vie face visible, −2000 à tous les Personnages adverses, puis KO de ceux à 0 ou moins', () => {
  let s = scenario([SKY, GARP], (g) => {
    setHand(g, 0, ['OP15-114']);
    setDon(g, 0, 8);
    setChars(g, 1, [{ num: 'ST21-004' }, { num: 'ST21-006' }, { num: 'ST21-008' }]);   // 3000, 5000, 6000
    g.mods.push({ uid: g.players[1].chars[0].uid, stat: 'power', amount: -1000, until: 'turn', source: 'essai' });  // 2000
  });
  const [bonney, stussy, chopper] = s.players[1].chars;
  s = play(s, 'OP15-114');
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.equal(s.players[0].life[0].faceUp, true);
  assert.ok(!s.players[1].chars.some((c) => c.uid === bonney.uid), '2000 − 2000 = 0 : mis KO');
  assert.equal(power(s, stussy.uid), 3000);
  assert.equal(power(s, chopper.uid), 4000);
  coherent(s);
  // coût refusé : rien
  s = scenario([SKY, GARP], (g) => { setHand(g, 0, ['OP15-114']); setDon(g, 0, 8); setChars(g, 1, [{ num: 'ST21-004' }]); });
  s = choose(play(s, 'OP15-114'), 'no');
  assert.equal(power(s, s.players[1].chars[0].uid), 3000);
});

test('Gum Gum Storm (OP15-095, recette) : [Contre] +4000 pour le combat avec 15 cartes ou plus dans la Défausse', () => {
  const run = (trash: number) => {
    let s = scenario([SKY, GARP], (g) => {
      setHand(g, 0, ['OP15-095']);
      setDon(g, 0, 2);
      g.players[0].trash.push(...g.players[0].deck.splice(0, trash));
      setChars(g, 1, [{ num: 'ST21-014' }]);
    }, 1);
    const life = s.players[0].life.length;
    s = attack(s, mine(s, 'ST21-014', 1).uid, s.players[0].leader.uid);
    while (s.decision?.kind === 'blocker') s = act(s, 'noblock');
    s = choose(s, 'cevent');
    if (s.decision?.tag === 'ownPower') s = choose(s, `card:${s.players[0].leader.uid}`);
    while (s.decision?.kind === 'counter') s = act(s, 'pass');
    return { s, lost: life - s.players[0].life.length };
  };
  const yes = run(15);
  assert.ok(logHas(yes.s, '+4000'));
  assert.equal(yes.lost, 0, 'attaque repoussée (6000 contre 9000)');
  const no = run(5);
  assert.ok(!logHas(no.s, '+4000'));
});

test('Swallow Bond Avant (OP15-096, recette) : [Contre] défausser 1 carte : +3000 pour le combat ; sans payer, rien', () => {
  const run = (pay: boolean) => {
    let s = scenario([SKY, GARP], (g) => {
      setHand(g, 0, ['OP15-096', 'OP03-023']);
      setDon(g, 0, 2);
      setChars(g, 1, [{ num: 'ST21-014' }]);
    }, 1);
    const life = s.players[0].life.length;
    s = attack(s, mine(s, 'ST21-014', 1).uid, s.players[0].leader.uid);
    while (s.decision?.kind === 'blocker') s = act(s, 'noblock');
    s = choose(s, 'cevent');
    expectTag(s, 'may');
    s = choose(s, pay ? 'yes' : 'no');
    if (s.decision?.tag === 'discard') s = anyCard(s);
    if (s.decision?.tag === 'ownPower') s = choose(s, `card:${s.players[0].leader.uid}`);
    while (s.decision?.kind === 'counter') s = act(s, 'pass');
    return { s, lost: life - s.players[0].life.length };
  };
  const yes = run(true);
  assert.ok(logHas(yes.s, '+3000'));
  assert.equal(yes.lost, 0, 'attaque repoussée (6000 contre 8000)');
  const no = run(false);
  assert.ok(!logHas(no.s, '+3000'));
  assert.equal(no.lost, 1);
});
