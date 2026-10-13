// Famille du Leader Sabo (phase 4E) : cartes {Armée révolutionnaire} et {Dressrosa} rouges et noires. Un deck d'essai
// (Leader Sabo, 2 exemplaires de chaque carte) sert pour la plupart des tests, et un autre au Leader Luffy (ni
// {Armée révolutionnaire} ni {Dressrosa}) pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, counterValue, fieldCost, handCost, hasKeyword, hasBlocker, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife, take,
} from './helpers.ts';
import { FAM_SABO } from '../engine/cards/fam-sabo.ts';

const FAMILY = Object.keys(FAM_SABO);
const EXTRA = ['OP15-057', 'OP09-062'];  // Lieu {Dressrosa} de coût 1, Nico Robin (Leader : jamais dans le deck)
const TEST = 'TEST-SABO';
const TEST_LUFFY = 'TEST-SABO-LUFFY';
DECKS[TEST] = { id: TEST, name: 'Essai', series: 'TEST', leader: 'OP13-004', cards: { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'OP15-057': 2 } };
DECKS[TEST_LUFFY] = { id: TEST_LUFFY, name: 'Essai Luffy', series: 'TEST', leader: 'ST21-001', cards: Object.fromEntries(FAMILY.map((n) => [n, 2])) };
void EXTRA;

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_BONNEY = 'ST21-004';     // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000
const O_MOLE = 'ST21-017';       // −5000, puis KO 2000 ou moins avec un Personnage de 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
function setTrash(g: GameState, p: PlayerId, nums: string[]) {
  const cards = nums.map((n) => take(g, p, n));
  g.players[p].deck.push(...g.players[p].trash);
  g.players[p].trash = cards;
}
function setStage(g: GameState, p: PlayerId, num: string, rested = false) {
  const c = take(g, p, num);
  g.players[p].stage = { uid: c.uid, num: c.num, rested, don: 0, playedTurn: 0, usedOpt: [] };
}
const fillTrash = (g: GameState, n: number) => setTrash(g, 0, Array.from({ length: n }, (_, i) => FAMILY[i % FAMILY.length]).slice(0, n));

// ---------- Rouge ----------

test('Sabo (EB02-002) : s’épuiser pour +2000 à un autre {Armée révolutionnaire}', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'EB02-002' }, { num: 'OP05-006' }, { num: 'OP10-088' }]); });
  s = act(s, `act:${mine(s, 'EB02-002').uid}`);
  expectTag(s, 'ownPower');
  assert.equal(hasOption(s, `card:${mine(s, 'OP10-088').uid}`), false, 'Nami n’est pas {Armée révolutionnaire}');
  assert.equal(hasOption(s, `card:${mine(s, 'EB02-002').uid}`), false, 'pas lui-même');
  s = choose(s, `card:${mine(s, 'OP05-006').uid}`);
  assert.equal(power(s, mine(s, 'OP05-006').uid), 5000);
  assert.ok(mine(s, 'EB02-002').rested);
  coherent(s);
});

test('Emporio Ivankov (OP05-004) : à 7000 ou plus, jouer un {Armée révolutionnaire} de 5000 ou moins de la main', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-006', 'OP05-007']);
    setChars(g, 0, [{ num: 'OP05-004', extra: { don: 2 } }]);
    setDon(g, 0, 0);
  });
  s = act(s, `act:${mine(s, 'OP05-004').uid}`);
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Sabo')), false, 'Sabo : 7000');
  s = choose(s, (o) => o.label.startsWith('Koala'));  // son [Jouée] (−3000) : aucun Personnage adverse
  assert.ok(mine(s, 'OP05-006'));
  assert.equal(hasOption(s, `act:${mine(s, 'OP05-004').uid}`), false, 'une fois par tour');
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP05-006']); setChars(g, 0, [{ num: 'OP05-004' }]); });
  assert.equal(hasOption(s, `act:${mine(s, 'OP05-004').uid}`), false, '5000 seulement');
});

test('Koala (OP05-006) : [Jouée] −3000 avec un Leader {Armée révolutionnaire} seulement', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP05-006']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = choose(play(s, 'OP05-006'), `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 2000);
  s = scenario([TEST_LUFFY, 'ST-21'], (g) => { setHand(g, 0, ['OP05-006']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = play(s, 'OP05-006');
  assert.notEqual(s.decision?.tag, 'oppPower');
});

test('Sabo (OP05-007) : KO de 2 Personnages adverses au plus, 4000 de puissance au total', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-007']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_SENTOMARU }, { num: O_BONNEY }, { num: O_STUSSY }]);
  });
  s = play(s, 'OP05-007');
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_STUSSY).uid}`), false, '5000');
  s = choose(s, `card:${s.players[1].chars[0].uid}`);
  assert.equal(hasOption(s, `card:${theirs(s, O_BONNEY).uid}`), false, '2000 + 3000 > 4000');
  s = choose(s, `card:${s.players[1].chars[1].uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_BONNEY, O_STUSSY]);
  coherent(s);
});

test('Belo Betty (OP05-015), Commandants réunis (OP12-097) : chercher une carte {Armée révolutionnaire}', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-015']);
    setDeckTop(g, 0, ['OP10-083', 'OP10-088', 'OP05-007', 'OP06-016', 'OP10-081']);
    setDon(g, 0, 1);
  });
  s = play(s, 'OP05-015');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Sabo', 'Raise Max', 'Aucune'], 'ni Belo Betty ni les {Dressrosa}');
  s = keepOrder(choose(s, (o) => o.label === 'Sabo'));
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP12-097']);
    setDeckTop(g, 0, ['OP10-083', 'OP10-088', 'OP12-095']);
    setDon(g, 0, 1);
  });
  s = play(s, 'OP12-097');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Lindbergh', 'Aucune']);
  s = choose(s, (o) => o.label === 'Lindbergh');
  assert.deepEqual(s.players[0].trash.map((c) => c.num).sort(), ['OP10-083', 'OP10-088', 'OP12-097'], 'le reste et l’Événement dans la Défausse');
  coherent(s);
});

test('Emporio Energy Hormone : [Contre] +3000, puis jouer un {Armée révolutionnaire} de 5000 ou moins', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP05-018', 'OP05-006', 'OP05-007']);
    setDon(g, 0, 3);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label.startsWith('Sabo')), false);
  s = choose(s, (o) => o.label.startsWith('Koala'));
  if (s.decision?.tag === 'oppPower') s = choose(s, 'none');
  s = noCounter(s);
  assert.ok(mine(s, 'OP05-006'));
  assert.ok(logHas(s, 'repoussée (6000 contre 7000)'), 'Leader Sabo à 4000 avec 4 Vies ou plus, +3000');
  coherent(s);
});

test('Fire Fist (OP05-019) : −4000, puis avec 2 Vies ou moins, KO d’un Personnage de 0 ou moins', () => {
  const setup = (life: string[]) => (g: GameState) => {
    setHand(g, 0, ['OP05-019']);
    setLife(g, 0, life);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: O_JINBE }]);
  };
  let s = scenario([TEST, 'ST-21'], setup(['OP05-006', 'OP05-006']));
  s = choose(play(s, 'OP05-019'), `card:${theirs(s, O_JINBE).uid}`);
  s = choose(s, `card:${theirs(s, O_JINBE).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
  s = scenario([TEST, 'ST-21'], setup(['OP05-006', 'OP05-006', 'OP05-015']));
  s = choose(play(s, 'OP05-019'), `card:${theirs(s, O_JINBE).uid}`);
  assert.equal(s.players[1].chars.length, 1, '3 Vies');
});

test('Four Thousand-Brick Fist : +2000, puis KO d’un Personnage de 2000 ou moins ; [Déclenchement] +1000', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP05-020']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_SENTOMARU }, { num: O_BONNEY }]); });
  const before = power(s, s.players[0].leader.uid);
  s = choose(play(s, 'OP05-020'), `card:${s.players[0].leader.uid}`);
  assert.equal(power(s, s.players[0].leader.uid), before + 2000);
  expectTag(s, 'oppKo');
  assert.equal(hasOption(s, `card:${theirs(s, O_BONNEY).uid}`), false);
  s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.equal(s.players[1].chars.length, 1);
  coherent(s);
});

test('Quartier général de l’Armée révolutionnaire (Lieu) : défausser 1 carte et s’épuiser pour chercher une carte', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setStage(g, 0, 'OP05-021');
    setHand(g, 0, ['OP10-088']);
    setDeckTop(g, 0, ['OP10-081', 'OP05-006', 'OP10-083']);
  });
  const stage = s.players[0].stage!.uid;
  s = act(s, `act:${stage}`);
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Koala', 'Aucune']);
  s = keepOrder(choose(s, (o) => o.label === 'Koala'));
  assert.ok(s.players[0].stage!.rested);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), ['OP05-006']);
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setStage(g, 0, 'OP05-021'); setHand(g, 0, []); });
  assert.equal(hasOption(s, `act:${s.players[0].stage!.uid}`), false, 'main vide');
});

test('Inazuma (OP06-002) : [Exil] à 7000 ou plus ; Cavendish (OP14-004) : [Initiative] à 5000 ou plus ; Bartolomeo (OP14-011) : [DON!! x2] [Bloqueur]', () => {
  const s = scenario([TEST, 'ST-21'], (g) => {
    setChars(g, 0, [
      { num: 'OP06-002', extra: { don: 2 } }, { num: 'OP06-002' },
      { num: 'OP14-004', extra: { don: 3, playedTurn: 5 } }, { num: 'OP14-004', extra: { don: 2, playedTurn: 5 } },
      { num: 'OP14-011', extra: { don: 2 } },
    ]);
    setDon(g, 0, 0);
  });
  const [i1, i2, c1, c2] = s.players[0].chars;
  assert.equal(hasKeyword(s, 0, i1, 'Banish'), true);
  assert.equal(hasKeyword(s, 0, i2, 'Banish'), false);
  assert.equal(attackAbility(s, 0, c1).can, true);
  assert.equal(attackAbility(s, 0, c2).can, false, '4000');
  assert.equal(hasBlocker(s, 0, mine(s, 'OP14-011')), true);
});

test('Emporio Ivankov (OP06-003) : 3 cartes du dessus, jouer un {Armée révolutionnaire} de 5000 ou moins', () => {
  let s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP06-003']);
    setDeckTop(g, 0, ['OP05-007', 'OP06-016', 'OP10-088']);
    setDon(g, 0, 5);
  });
  s = play(s, 'OP06-003');
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['Raise Max', 'Aucun']);
  s = keepOrder(choose(s, (o) => o.label === 'Raise Max'));
  assert.ok(mine(s, 'OP06-016'));
  assert.deepEqual(s.players[0].deck.slice(-2).map((c) => c.num).sort(), ['OP05-007', 'OP10-088']);
  coherent(s);
});

test('Raise Max : se placer sous le deck pour −3000 ; Monkey D. Dragon (OP07-015) : [Initiative], 2 DON!! épuisées', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP06-016' }]); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = act(s, `act:${mine(s, 'OP06-016').uid}`);
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(s.players[0].deck.at(-1)!.num, 'OP06-016');
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 2000);
  coherent(s);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP07-015']); setDon(g, 0, 8, 2); });
  s = play(s, 'OP07-015');
  s = choose(s, `card:${mine(s, 'OP07-015').uid}`);
  assert.equal(mine(s, 'OP07-015').don, 2);
  assert.ok(attackAbility(s, 0, mine(s, 'OP07-015')).can);
  coherent(s);
});

test('Galaxy Wink, Souffle du dragon (Lieu adverse de coût 1), KEEP OUT (+2000 jusqu’à la fin de son prochain tour)', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP07-016']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP05-006' }]); setChars(g, 1, [{ num: O_STUSSY }]); });
  s = choose(play(s, 'OP07-016'), `card:${mine(s, 'OP05-006').uid}`);
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(power(s, mine(s, 'OP05-006').uid), 5000);
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 4000);
  coherent(s);

  s = scenario([TEST, 'ST-31'], (g) => {
    setHand(g, 0, ['OP07-017']);
    setDon(g, 0, 2);
    setChars(g, 1, [{ num: 'OP11-003' }]);  // Usopp ST-31 : coût 1, 3000 ? (puissance lue ci-dessous)
    setStage(g, 1, 'ST31-005');
  });
  const target = s.players[1].chars[0];
  s = play(s, 'OP07-017');
  if (power(s, target.uid) <= 3000) s = choose(s, `card:${target.uid}`);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${s.players[1].stage!.uid}`);
  assert.equal(s.players[1].stage, null);
  assert.ok(s.players[1].trash.some((c) => c.num === 'ST31-005'));
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP07-018']); setDon(g, 0, 1); setChars(g, 0, [{ num: 'OP05-006', extra: { rested: true } }]); setChars(g, 1, [{ num: O_STUSSY }]); }, 1);
  // le [Contre] peut renforcer un autre Personnage {Armée révolutionnaire} que celui attaqué, pour plus tard
  s = attack(s, theirs(s, O_STUSSY).uid, s.players[0].leader.uid);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  s = noCounter(choose(s, `card:${mine(s, 'OP05-006').uid}`));
  assert.equal(power(s, mine(s, 'OP05-006').uid), 5000);
  assert.equal(s.mods.find((m) => m.source === 'KEEP OUT')!.until, s.turn + 1, 'jusqu’à la fin du prochain tour du joueur');
  coherent(s);
});

test('Cavendish (OP15-006) +2000 avec 4 Événements dans la Défausse ; « Regarde-moi bien, Ace !! » −3 de coût en main', () => {
  const events = ['OP05-019', 'OP05-020', 'OP07-016', 'OP07-017'];
  let s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-006' }]); setHand(g, 0, ['OP15-021']); setTrash(g, 0, events); });
  assert.equal(power(s, mine(s, 'OP15-006').uid), 6000);
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 1);
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP15-006' }]); setHand(g, 0, ['OP15-021']); setTrash(g, 0, events.slice(0, 3)); });
  assert.equal(power(s, mine(s, 'OP15-006').uid), 4000);
  assert.equal(handCost(s, 0, s.players[0].hand[0]), 4);
});

test('Bartolomeo (OP15-014) : [Jouée] activer un Événement {Dressrosa} de coût de base 3 ou moins sans payer ; KO remplacé par un Événement défaussé', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP15-014', 'OP15-019', 'OP15-020']); setDon(g, 0, 4); });
  s = play(s, 'OP15-014');
  expectTag(s, 'playFree');
  assert.equal(s.decision!.options.some((o) => o.label === 'Poing ardent'), false, 'coût 7');
  const before = power(s, s.players[0].leader.uid);
  s = choose(s, (o) => o.label === 'Barrier Bulls');
  assert.equal(s.players[0].donActive, 0, 'seul Bartolomeo a été payé');
  assert.equal(power(s, s.players[0].leader.uid), before + 1000);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP15-019'));
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => {
    setHand(g, 0, ['OP15-019']);
    setChars(g, 0, [{ num: 'OP15-014' }]);
    setHand(g, 1, [O_MOLE]);
    setDon(g, 1, 4);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = play(s, O_MOLE, 1);
  s = choose(s, `card:${mine(s, 'OP15-014').uid}`);
  s = choose(s, `card:${mine(s, 'OP15-014').uid}`);
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  assert.ok(mine(s, 'OP15-014'), 'Bartolomeo reste');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP15-019'));
  coherent(s);
});

test('Barrier Bulls, Poing ardent (OP15-020)', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP15-019']); setDon(g, 0, 3); });
  s = play(s, 'OP15-019');
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.mods.find((m) => m.source === 'Barrier Bulls')!.until, s.turn + 1);
  coherent(s);

  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP15-020', 'OP10-088', 'OP10-083']); setDon(g, 0, 7); setChars(g, 1, [{ num: O_CHOPPER }]); });
  const before = power(s, s.players[0].leader.uid);
  s = choose(play(s, 'OP15-020'), `card:${theirs(s, O_CHOPPER).uid}`);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  s = choose(s, (o) => o.label === 'Nami');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(power(s, s.players[0].leader.uid), before + 3000);
  coherent(s);
});

test('Sabo (P-044) : [DON!! x1] +2000 avec 4 cartes ou moins en main ; Koala (P-069) : 1 DON!! épuisée par tour', () => {
  let s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP10-088']); setChars(g, 0, [{ num: 'P-044', extra: { don: 1 } }, { num: 'P-069' }]); setDon(g, 0, 0, 2); }, 1);
  assert.equal(power(s, mine(s, 'P-044').uid), 6000);
  s = scenario([TEST, 'ST-21'], (g) => { setHand(g, 0, ['OP10-088', 'OP10-088', 'OP10-083', 'OP10-083', 'OP10-087']); setChars(g, 0, [{ num: 'P-044', extra: { don: 1 } }]); setDon(g, 0, 0); }, 1);
  assert.equal(power(s, mine(s, 'P-044').uid), 4000, '5 cartes');
  s = scenario([TEST, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'P-069' }]); setDon(g, 0, 0, 2); });
  s = act(s, `act:${mine(s, 'P-069').uid}`);
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.equal(s.players[0].leader.don, 1);
  assert.equal(hasOption(s, `act:${mine(s, 'P-069').uid}`), false);
  coherent(s);
});
