// OP03 rouge (tâche 1.8 du plan « Aventure ») : Leader Portgas.D.Ace et cartes « Équipage de Barbe Blanche ». Un deck
// d'essai au Leader Ace (avec quelques cartes d'autres couleurs pour les conditions fausses), un au Leader Luffy (ni Ace ni
// « Équipage de Barbe Blanche ») ; l'adversaire joue ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { useless } from '../ai/prune.ts';
import { OP03_ROUGE } from '../engine/cards/op03-rouge.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, attackTargets, def, hasKeyword, koCharacter, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const ACE_L = 'OP03-001';
const ADIO = 'OP03-002';       // coût 4, 5000, ODYSSEY
const IZO = 'OP03-003';        // coût 1, 2000
const CURIEL = 'OP03-004';     // coût 3, 4000
const THATCH = 'OP03-005';     // coût 1, 2000
const JIL = 'OP03-006';        // coût 4, 6000, sans effet
const NAMULE = 'OP03-007';     // coût 3, 5000, sans effet
const BAGGY = 'OP03-008';      // coût 1, 3000, {Buggy Pirates}
const HARUTA = 'OP03-009';     // coût 2, 3000
const FOSSA = 'OP03-010';      // coût 2, 2000, [Bloqueur]
const BLAMENCO = 'OP03-011';   // coût 2, 3000
const TEACH = 'OP03-012';      // coût 4, 6000
const MARCO = 'OP03-013';      // coût 5, 6000
const GARP = 'OP03-014';       // coût 3, 5000, {Navy}
const LIM = 'OP03-015';        // coût 3, 2000, [Bloqueur], ODYSSEY
const FLAME = 'OP03-016';      // Événement, coût 7
const CROSS = 'OP03-017';      // Événement, coût 2
const FIST = 'OP03-018';       // Événement, coût 3
const DOLL = 'OP03-019';       // Événement, coût 2
const STRIKER = 'OP03-020';    // Lieu, coût 1
const MOBY = 'OP08-056';       // Lieu bleu « Équipage de Barbe Blanche »
const SAKAZUKI = 'ST33-002';   // Personnage bleu, 5000
const ICE = 'OP12-057';        // Événement bleu
// adversaire ST-21
const O_LUFFY_L = 'ST21-001';  // Leader, 5000
const O_BONNEY = 'ST21-004';   // coût 1, 3000
const O_JINBE = 'ST21-005';    // coût 2, 4000, <Frappe>
const O_STUSSY = 'ST21-006';   // coût 3, 5000
const O_SENTOMARU = 'ST21-007'; // coût 2, 2000, <Tranche>, [Bloqueur]
const O_CHOPPER = 'ST21-008';  // coût 4, 6000
const O_NAMI = 'ST21-009';     // coût 3, 1000
const O_VEGAPUNK = 'ST21-013'; // coût 1, 3000
const O_ZORO = 'ST21-015';     // coût 4, 5000, <Tranche>
const O_WHIP = 'ST21-016';     // Événement rouge

const RED = Object.keys(OP03_ROUGE).filter((n) => n !== ACE_L);
const cards = { ...Object.fromEntries(RED.map((n) => [n, 4])), [JIL]: 4, [NAMULE]: 4, [FOSSA]: 2, [MOBY]: 1, [SAKAZUKI]: 2, [ICE]: 2 };
const ACE = 'TEST-OP03-ACE';
const PLAIN = 'TEST-OP03-LUFFY';
DECKS[ACE] = { id: ACE, name: 'Essai', series: 'TEST', leader: ACE_L, cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: O_LUFFY_L, cards };

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const leader = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
const cardNums = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.num ?? def(s.players.flatMap((P) => [...P.hand, ...P.chars]).find((c) => c.uid === o.uid)!.num).number);
const inTrash = (s: GameState, p: PlayerId, num: string) => s.players[p].trash.some((c) => c.num === num);
const inHandNum = (s: GameState, p: PlayerId, num: string) => s.players[p].hand.some((c) => c.num === num);
// l'adversaire ne bloque pas et ne contre pas
const noDefense = (s: GameState) => {
  while (s.decision && s.decision.player === 1 && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
};
// le joueur 0 ne contre pas (attaque adverse)
const iPass = (s: GameState) => (s.decision?.kind === 'counter' && s.decision.player === 0 ? act(s, 'pass') : s);
// Vie adverse sans [Déclenchement]
const plainLife = (g: GameState) => setLife(g, 1, [O_VEGAPUNK, O_JINBE, O_STUSSY]);

test('Leader Portgas.D.Ace : en attaquant, défausser des Événements et des Lieux un par un, +1000 par carte pour le combat', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL, STRIKER, IZO]); setHand(g, 1, []); setChars(g, 1, []); plainLife(g); });
  const ace = leader(s, 0);
  s = attack(s, ace, leader(s, 1));
  expectTag(s, 'discard');
  assert.deepEqual(cardNums(s).sort(), [DOLL, STRIKER].sort(), 'Événements et Lieux seulement');
  assert.ok(s.decision!.options.some((o) => o.id === 'none' && o.label === 'Aucun'));
  aiAnswers(s);
  s = choose(s, (o) => o.num === DOLL);
  assert.equal(power(s, ace), 6000);
  assert.ok(s.decision!.options.some((o) => o.id === 'none' && o.label === 'Aucun autre'));
  s = choose(s, (o) => o.num === STRIKER);
  // plus d'Événement ni de Lieu en main : l'effet s'arrête de lui-même, et le combat se joue (ni Bloqueur ni Contre)
  assert.ok(logHas(s, "l'attaque touche le Leader adverse (7000 contre 5000)"));
  assert.ok(inTrash(s, 0, DOLL) && inTrash(s, 0, STRIKER));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [IZO]);
  assert.equal(s.players[0].discardedTurn, s.turn);
  assert.ok(logHas(s, 'Portgas.D.Ace gagne +2000 de puissance pour le combat (2 cartes défaussées)'));
  assert.equal(s.players[1].life.length, 2);
  assert.equal(power(s, ace), 5000, 'le bonus ne dure que le combat');
  coherent(s);

  // « Aucun » tout de suite : pas de bonus
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL, IZO]); setHand(g, 1, []); setChars(g, 1, []); plainLife(g); });
  s = choose(attack(s, leader(s, 0), leader(s, 1)), 'none');
  assert.equal(power(s, leader(s, 0)), 5000);
  assert.equal(s.players[0].hand.length, 2);
  coherent(s);

  // sans Événement ni Lieu en main : aucune question
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [IZO, CURIEL]); setHand(g, 1, []); setChars(g, 1, []); plainLife(g); });
  s = attack(s, leader(s, 0), leader(s, 1));
  assert.notEqual(s.decision?.tag, 'discard');
  assert.equal(s.decision?.kind, 'main');
  coherent(s);

  // un Personnage d'Ace qui attaque : rien
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL]); setChars(g, 0, [{ num: NAMULE }]); setHand(g, 1, []); setChars(g, 1, []); plainLife(g); });
  s = attack(s, mine(s, NAMULE).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'discard');
  coherent(s);
});

test('Leader Portgas.D.Ace : aussi quand il est attaqué (pas quand un de ses Personnages l’est)', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FIST, IZO]); setChars(g, 0, [{ num: NAMULE, extra: { rested: true } }]); setDon(g, 1, 0); }, 1);
  s = attack(s, leader(s, 1), leader(s, 0));
  expectTag(s, 'discard');
  assert.equal(s.decision!.player, 0);
  aiAnswers(s);
  s = choose(s, (o) => o.num === FIST);
  assert.equal(power(s, leader(s, 0)), 6000);
  s = iPass(s);
  assert.ok(logHas(s, 'l\'attaque est repoussée (5000 contre 6000)'));
  assert.equal(s.players[0].life.length, 5);
  coherent(s);

  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FIST]); setChars(g, 0, [{ num: NAMULE, extra: { rested: true } }]); setDon(g, 1, 0); }, 1);
  s = attack(s, leader(s, 1), mine(s, NAMULE).uid);
  assert.notEqual(s.decision?.tag, 'discard');
  coherent(s);
});

test('Leader Portgas.D.Ace, IA : défausser juste ce qu’il faut pour gagner le combat, rien sans combat à gagner', () => {
  // Ace (5000) attaque un Personnage de 6000 : une carte suffit
  let s = scenario([ACE, 'ST-21'], (g) => {
    setHand(g, 0, [FLAME, DOLL, STRIKER]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
    setHand(g, 1, []);
  });
  s = attack(s, leader(s, 0), theirs(s, O_CHOPPER).uid);
  expectTag(s, 'discard');
  const first = heuristicChooser(s, s.decision!);
  assert.ok(first.startsWith('card:'));
  s = act(s, first);
  assert.equal(power(s, leader(s, 0)), 6000);
  assert.equal(heuristicChooser(s, s.decision!), 'none', 'déjà assez');
  // Ace (5000) attaque le Leader adverse (5000) : rien à défausser
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL, STRIKER]); setHand(g, 1, []); });
  s = attack(s, leader(s, 0), leader(s, 1));
  assert.equal(heuristicChooser(s, s.decision!), 'none');
  // attaqué par 7000 avec 1 Vie : défausser 3 cartes s'il les a
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FLAME, DOLL, STRIKER]); setLife(g, 0, [IZO]); setDon(g, 1, 2); }, 1);
  s.players[1].leader.don = 2;
  s.players[1].donActive -= 2;
  s = attack(s, leader(s, 1), leader(s, 0));
  for (let i = 0; i < 3; i++) s = act(s, heuristicChooser(s, s.decision!));
  assert.ok(logHas(s, "l'attaque est repoussée (7000 contre 8000)"));
  coherent(s);
});

test('Adio : [DON!! x1] [En attaquant] l’adversaire ne peut pas bloquer avec un Personnage de 2000 ou moins', () => {
  for (const don of [1, 0]) {
    let s = scenario([ACE, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: ADIO, extra: { don } }]);
      setDon(g, 0, 0);
      setChars(g, 1, [{ num: O_SENTOMARU }]);
      setHand(g, 1, []);
    });
    s = attack(s, mine(s, ADIO).uid, leader(s, 1));
    if (don) {
      assert.notEqual(s.decision?.kind, 'blocker', 'Sentomaru (2000) ne peut pas bloquer');
      assert.ok(logHas(s, 'ne peut pas activer le [Bloqueur] de ses Personnages de 2000 de puissance ou moins'));
    } else {
      assert.equal(s.decision?.kind, 'blocker');
    }
    coherent(s);
  }
  // un Bloqueur de plus de 2000 bloque encore
  let s = scenario([ACE, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: ADIO, extra: { don: 1 } }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: O_SENTOMARU }]);
    setHand(g, 1, []);
  });
  s.mods.push({ uid: s.players[1].chars[0].uid, stat: 'power', amount: 1000, until: 'turn', source: 'Essai' });
  s = attack(s, mine(s, ADIO).uid, leader(s, 1));
  assert.equal(s.decision?.kind, 'blocker', 'Sentomaru à 3000');
  assert.equal(def(ADIO).attackUseful!(s, 0, mine(s, ADIO), leader(s, 1)), false);
});

test('Izo : 5 cartes du dessus, une carte « Équipage de Barbe Blanche » autre que [Izo] en main', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [IZO]); setDon(g, 0, 1); setDeckTop(g, 0, [IZO, ADIO, THATCH, LIM, CURIEL]); });
  s = play(s, IZO);
  expectTag(s, 'pick');
  assert.deepEqual(cardNums(s).sort(), [THATCH, CURIEL].sort(), 'ni Izo, ni Adio et Lim (ODYSSEY)');
  aiAnswers(s);
  s = keepOrder(choose(s, (o) => o.num === THATCH));
  assert.ok(inHandNum(s, 0, THATCH));
  assert.equal(s.players[0].deck.at(-1)!.num, CURIEL);
  coherent(s);
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [IZO]); setDon(g, 0, 1); setDeckTop(g, 0, [IZO, ADIO, LIM, SAKAZUKI, ICE]); });
  s = keepOrder(play(s, IZO));
  assert.notEqual(s.decision?.tag, 'pick');
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Curiel : [DON!! x1] [Initiative], mais pas d’attaque sur un Leader le tour où il est joué', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [CURIEL]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_JINBE, extra: { rested: true } }]); });
  s = play(s, CURIEL);
  const c = mine(s, CURIEL);
  assert.equal(attackAbility(s, 0, c).can, false, 'sans DON!!');
  s = act(s, `don:${c.uid}`);
  assert.deepEqual(attackTargets(s, 0, mine(s, CURIEL)), [theirs(s, O_JINBE).uid], 'Personnages seulement');
  coherent(s);
  // joué un tour précédent : il attaque le Leader
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: CURIEL }]); });
  assert.ok(attackTargets(s, 0, mine(s, CURIEL)).includes(leader(s, 1)));
});

test('Thatch : +2000 pour le tour, puis dans la Défausse à la fin du tour (pas une mise KO) ; seulement s’il peut attaquer', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: THATCH }]); setChars(g, 1, [{ num: O_JINBE, extra: { rested: true } }]); });
  const t = mine(s, THATCH);
  assert.equal(def(THATCH).activateMain!.useful!(s, 0, t), true);
  s = act(s, `act:${t.uid}`);
  assert.equal(power(s, t.uid), 4000);
  assert.equal(s.decision!.options.some((o) => o.id === `act:${t.uid}`), false, '[Une fois par tour]');
  s = act(s, 'end');
  assert.ok(inTrash(s, 0, THATCH));
  assert.equal(logHas(s, 'Thatch est mis KO'), false);
  coherent(s);
  // épuisé : l'effet ne sert à rien
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: THATCH, extra: { rested: true } }]); });
  assert.equal(def(THATCH).activateMain!.useful!(s, 0, mine(s, THATCH)), false);
  assert.equal(useless(s, s.decision!, s.decision!.options.find((o) => o.id === `act:${mine(s, THATCH).uid}`)!)?.kind, 'idleEffect');
  // IA : seulement si le bonus lui fait gagner une attaque (Jinbe 4000 épuisé)
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: THATCH }]); setChars(g, 1, [{ num: O_JINBE, extra: { rested: true } }]); setHand(g, 0, []); setDon(g, 0, 0); });
  assert.equal(heuristicChooser(s, s.decision!), `act:${mine(s, THATCH).uid}`);
});

test('Baggy : pas mis KO en combat par une carte <Tranche> ; 5 cartes du dessus, un Événement rouge en main', () => {
  for (const [attacker, survives] of [[O_ZORO, true], [O_JINBE, false]] as const) {
    let s = scenario([ACE, 'ST-21'], (g) => {
      setChars(g, 0, [{ num: BAGGY, extra: { rested: true } }]);
      setChars(g, 1, [{ num: attacker }]);
      setHand(g, 0, []);
    }, 1);
    s = iPass(attack(s, theirs(s, attacker).uid, mine(s, BAGGY).uid));
    assert.equal(Boolean(mine(s, BAGGY)), survives, attacker);
    coherent(s);
  }
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [BAGGY]); setDon(g, 0, 1); setDeckTop(g, 0, [ICE, DOLL, STRIKER, CURIEL, FIST]); });
  s = play(s, BAGGY);
  expectTag(s, 'pick');
  assert.deepEqual(cardNums(s).sort(), [DOLL, FIST].sort(), 'ni l’Événement bleu, ni le Lieu');
  s = keepOrder(choose(s, (o) => o.num === FIST));
  assert.ok(inHandNum(s, 0, FIST));
  coherent(s);
});

test('Haruta : [Une fois par tour] 1 DON!! épuisée à son Leader ou à un de ses Personnages', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: HARUTA }, { num: NAMULE }]); setDon(g, 0, 2, 3); });
  const h = mine(s, HARUTA);
  s = act(s, `act:${h.uid}`);
  expectTag(s, 'donTarget');
  aiAnswers(s);
  s = choose(s, `card:${mine(s, NAMULE).uid}`);
  assert.equal(mine(s, NAMULE).don, 1);
  assert.equal(s.players[0].donRested, 2);
  assert.equal(s.decision!.options.some((o) => o.id === `act:${h.uid}`), false);
  coherent(s);
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: HARUTA }]); setDon(g, 0, 2, 0); });
  assert.equal(def(HARUTA).activateMain!.useful!(s, 0, mine(s, HARUTA)), false, 'aucune DON!! épuisée');
});

test('Blamenco : [DON!! x1] [En attaquant] −2000 à un Personnage adverse pour le tour', () => {
  for (const don of [1, 0]) {
    let s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: BLAMENCO, extra: { don } }]); setDon(g, 0, 0); setChars(g, 1, [{ num: O_STUSSY }]); setHand(g, 1, []); });
    s = attack(s, mine(s, BLAMENCO).uid, leader(s, 1));
    if (don) {
      expectTag(s, 'oppPower');
      aiAnswers(s);
      s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
      assert.equal(power(s, theirs(s, O_STUSSY).uid), 3000);
    } else {
      assert.notEqual(s.decision?.tag, 'oppPower');
    }
    coherent(s);
  }
});

test('Marshall.D.Teach : placer un Personnage rouge de 4000 ou plus dans la Défausse pour piocher 1 et +1000 ; lui-même : pioche seule', () => {
  let s = scenario([ACE, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: TEACH }, { num: JIL }, { num: BAGGY }, { num: SAKAZUKI }]);
    setHand(g, 0, []);
    setHand(g, 1, []);
  });
  const teach = mine(s, TEACH);
  s = attack(s, teach.uid, leader(s, 1));
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'no', 'IA : pas de Personnage qui partira de toute façon');
  s = choose(s, 'yes');
  expectTag(s, 'trashOwn');
  assert.deepEqual(cardNums(s).sort(), [TEACH, JIL].sort(), 'ni Baggy (3000), ni Sakazuki (bleu)');
  s = choose(s, `card:${mine(s, JIL).uid}`);
  assert.ok(inTrash(s, 0, JIL));
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(logHas(s, 'Marshall.D.Teach gagne +1000 de puissance pour le combat'));
  assert.ok(logHas(s, /\(7000 contre/));
  coherent(s);
  // lui-même : il pioche, l'attaque s'arrête (plus d'attaquant)
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: TEACH }]); setHand(g, 0, []); setHand(g, 1, []); plainLife(g); });
  s = choose(attack(s, mine(s, TEACH).uid, leader(s, 1)), 'yes');
  assert.ok(inTrash(s, 0, TEACH));
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[1].life.length, 3, 'pas de dégâts');
  coherent(s);
});

test('Marshall.D.Teach : avec Thatch qui partira à la fin du tour, l’IA le donne ; Moby Dick voit le Personnage quitter le terrain', () => {
  let s = scenario([ACE, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: TEACH }, { num: THATCH }, { num: JIL }]);
    setHand(g, 0, []);
    setHand(g, 1, []);
    g.players[0].stage = { ...g.players[0].deck.splice(g.players[0].deck.findIndex((c) => c.num === MOBY), 1)[0], rested: false, don: 0, playedTurn: 0, usedOpt: [] };
  });
  s = act(s, `act:${mine(s, THATCH).uid}`);
  assert.equal(def(TEACH).attackUseful!(s, 0, mine(s, TEACH), leader(s, 1)), true);
  s = attack(s, mine(s, TEACH).uid, leader(s, 1));
  const yes = heuristicChooser(s, s.decision!);
  assert.equal(yes, 'yes');
  s = act(s, yes);
  const pick = heuristicChooser(s, s.decision!);
  assert.equal(pick, `card:${mine(s, THATCH).uid}`);
  s = act(s, pick);
  // Moby Dick : piocher 1, puis 1 carte de la main au-dessus ou au-dessous du deck
  assert.ok(logHas(s, /pioche 1 carte/));
  assert.equal(s.decision?.tag, 'discard', 'Moby Dick : carte à placer sur le deck');
  coherent(s);
});

test('Marco : [Votre tour] [Jouée] KO d’un Personnage adverse de 3000 ou moins ; [En cas de KO] défausser 1 Événement pour revenir épuisé', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [MARCO]); setDon(g, 0, 5); setChars(g, 1, [{ num: O_BONNEY }, { num: O_JINBE }]); });
  s = play(s, MARCO);
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid), [theirs(s, O_BONNEY).uid], 'Jinbe a 4000');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].chars.length, 1);
  coherent(s);
  // mis KO en combat pendant le tour adverse : il revient épuisé, sans KO (ce n'est pas son tour)
  s = scenario([ACE, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: MARCO, extra: { rested: true } }]);
    setHand(g, 0, [DOLL]);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_BONNEY }]);
  }, 1);
  s = iPass(attack(s, theirs(s, O_CHOPPER).uid, mine(s, MARCO).uid));
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(mine(s, MARCO)?.rested, 'rejoué épuisé');
  assert.ok(inTrash(s, 0, DOLL));
  assert.ok(theirs(s, O_BONNEY), '[Votre tour] : pas de KO');
  coherent(s);
  // sans Événement en main : il reste dans la Défausse
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: MARCO, extra: { rested: true } }]); setHand(g, 0, [IZO]); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = iPass(attack(s, theirs(s, O_CHOPPER).uid, mine(s, MARCO).uid));
  assert.notEqual(s.decision?.tag, 'may');
  assert.ok(inTrash(s, 0, MARCO));
  coherent(s);
});

test('Monkey.D.Garp : [En attaquant] jouer un Personnage rouge de coût 1 de sa main', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: GARP }]); setHand(g, 0, [IZO, HARUTA, SAKAZUKI]); setHand(g, 1, []); });
  s = attack(s, mine(s, GARP).uid, leader(s, 1));
  expectTag(s, 'playFree');
  assert.deepEqual(cardNums(s), [IZO], 'ni Haruta (coût 2), ni Sakazuki');
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(mine(s, IZO));
  coherent(s);
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: GARP }]); setHand(g, 0, [HARUTA]); setHand(g, 1, []); });
  s = attack(s, mine(s, GARP).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'playFree');
  coherent(s);
});

test('Lim : [Tour adverse] mis KO : −2000 à un Leader ou Personnage adverse pour le tour', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: LIM, extra: { rested: true } }]); setHand(g, 0, []); setChars(g, 1, [{ num: O_STUSSY }]); }, 1);
  s = iPass(attack(s, theirs(s, O_STUSSY).uid, mine(s, LIM).uid));
  expectTag(s, 'oppPower');
  assert.equal(s.decision!.player, 0);
  aiAnswers(s);
  s = choose(s, `card:${leader(s, 1)}`);
  assert.equal(power(s, leader(s, 1)), 3000 + s.players[1].leader.don * 1000);
  coherent(s);
  // mis KO pendant son propre tour : rien
  s = scenario([ACE, 'ST-21'], (g) => { setChars(g, 0, [{ num: LIM }]); });
  koCharacter(s, mine(s, LIM).uid, 'effect', 1);
  assert.equal(s.pending.some((x) => x.kind === 'onKO'), false);
});

test('Flame Emperor : avec le Leader Ace, KO d’un Personnage de 8000 ou moins, [Double attaque] et +3000 pour le tour ; sinon rien', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FLAME]); setDon(g, 0, 7); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = play(s, FLAME);
  expectTag(s, 'oppKo');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(power(s, leader(s, 0)), 8000);
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'));
  coherent(s);
  // Leader épuisé et rien à mettre KO : l'Événement ne sert à rien
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FLAME]); setDon(g, 0, 7); setChars(g, 1, []); g.players[0].leader.rested = true; });
  assert.equal(def(FLAME).mainUseful!(s, 0), false);
  // Leader Luffy : rien
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, [FLAME]); setDon(g, 0, 7); setChars(g, 1, [{ num: O_CHOPPER }]); });
  assert.equal(def(FLAME).mainUseful!(s, 0), false);
  s = play(s, FLAME);
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'), false);
  coherent(s);
});

test('Cross Fire : [Principale] / [Contre] −4000 à un Personnage adverse avec un Leader « Équipage de Barbe Blanche »', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [CROSS]); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(play(s, CROSS), (o) => o.id.startsWith('card:'));
  assert.equal(power(s, theirs(s, O_CHOPPER).uid), 2000);
  coherent(s);
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, [CROSS]); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); });
  assert.equal(def(CROSS).mainUseful!(s, 0), false, 'Leader Luffy');
  // [Contre] : un Personnage adverse attaque, il reçoit −4000
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [CROSS]); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0));
  if (s.decision?.tag === 'discard') s = choose(s, 'none');
  assert.equal(s.decision?.kind, 'counter');
  assert.equal(def(CROSS).counterPower!(s, 0, leader(s, 0)), 4000);
  s = act(s, s.decision!.options.find((o) => o.id.startsWith('cevent:'))!.id);
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  s = iPass(s);
  assert.ok(logHas(s, 'l\'attaque est repoussée (2000 contre 5000)'));
  coherent(s);
  // le Leader adverse attaque : le [Contre] ne protège pas
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [CROSS]); setDon(g, 0, 2); }, 1);
  s = attack(s, leader(s, 1), leader(s, 0));
  if (s.decision?.tag === 'discard') s = choose(s, 'none');
  assert.equal(def(CROSS).counterPower!(s, 0, leader(s, 0)), 0);
  assert.equal(def(CROSS).counterUseful!(s, 0, leader(s, 0)), false);
});

test('Fire Fist : défausser 1 Événement pour mettre KO un Personnage de 5000 ou moins et un de 4000 ou moins ; [Déclenchement] 5000 ou moins', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FIST, DOLL]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_STUSSY }, { num: O_JINBE }, { num: O_CHOPPER }]); });
  s = choose(play(s, FIST), 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  expectTag(s, 'oppKo');
  assert.deepEqual(s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid).sort(), [theirs(s, O_STUSSY).uid, theirs(s, O_JINBE).uid].sort());
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, O_JINBE).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  assert.ok(inTrash(s, 0, DOLL));
  coherent(s);
  // sans autre Événement en main : rien
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [FIST, IZO]); setDon(g, 0, 3); setChars(g, 1, [{ num: O_JINBE }]); });
  assert.equal(def(FIST).mainUseful!(s, 0), false);
  // [Déclenchement]
  s = scenario([ACE, 'ST-21'], (g) => { setLife(g, 0, [FIST]); setHand(g, 0, []); setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]); }, 1);
  s = iPass(attack(s, leader(s, 1), leader(s, 0)));
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.deepEqual(s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid), [theirs(s, O_STUSSY).uid]);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [O_CHOPPER]);
  coherent(s);
});

test('Fiery Doll : son Leader +4000 pour le tour (seulement s’il peut attaquer) ; [Déclenchement] −10000', () => {
  let s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL]); setDon(g, 0, 2); });
  assert.equal(def(DOLL).mainUseful!(s, 0), true);
  s = play(s, DOLL);
  assert.equal(power(s, leader(s, 0)), 9000);
  coherent(s);
  s = scenario([ACE, 'ST-21'], (g) => { setHand(g, 0, [DOLL]); setDon(g, 0, 2); g.players[0].leader.rested = true; });
  assert.equal(def(DOLL).mainUseful!(s, 0), false, 'Leader épuisé');
  s = scenario([ACE, 'ST-21'], (g) => { setLife(g, 0, [DOLL]); setHand(g, 0, []); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = iPass(attack(s, theirs(s, O_CHOPPER).uid, leader(s, 0)));
  s = choose(s, 'trigger');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${leader(s, 1)}`);
  assert.equal(power(s, leader(s, 1)), Math.max(-10000, 5000 + s.players[1].leader.don * 1000 - 10000));
  coherent(s);
});

test('Striker : épuiser 2 DON!! et ce Lieu, avec le Leader Ace : un Événement parmi les 5 cartes du dessus', () => {
  const withStriker = (g: GameState) => {
    const P = g.players[0];
    const c = P.deck.splice(P.deck.findIndex((x) => x.num === STRIKER), 1)[0];
    P.stage = { ...c, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
  };
  let s = scenario([ACE, 'ST-21'], (g) => { withStriker(g); setDon(g, 0, 3); setDeckTop(g, 0, [IZO, CROSS, STRIKER, CURIEL, ICE]); });
  const st = s.players[0].stage!.uid;
  s = act(s, `act:${st}`);
  expectTag(s, 'pick');
  assert.deepEqual(cardNums(s).sort(), [CROSS, ICE].sort(), 'les Événements, pas le Lieu');
  s = keepOrder(choose(s, (o) => o.num === CROSS));
  assert.ok(inHandNum(s, 0, CROSS));
  assert.equal(s.players[0].donActive, 1);
  assert.ok(s.players[0].stage!.rested);
  assert.equal(s.decision!.options.some((o) => o.id === `act:${st}`), false, 'Lieu épuisé');
  coherent(s);
  // Leader Luffy : l'effet ne sert à rien
  s = scenario([PLAIN, 'ST-21'], (g) => { withStriker(g); setDon(g, 0, 3); });
  assert.equal(def(STRIKER).activateMain!.useful!(s, 0, s.players[0].stage!), false);
  // pas assez de DON!! : pas proposé
  s = scenario([ACE, 'ST-21'], (g) => { withStriker(g); setDon(g, 0, 1); });
  assert.equal(s.decision!.options.some((o) => o.id === `act:${s.players[0].stage!.uid}`), false);
});
