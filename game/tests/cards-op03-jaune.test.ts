// OP03 jaune (tâche 1.13 du plan « Aventure ») : Leader Charlotte Katakuri et cartes « Équipage de Big Mom ». Un deck
// d'essai au Leader Katakuri, un au Leader Luffy (pas {Équipage de Big Mom}) avec les mêmes cartes ; l'adversaire joue
// ST-21. Chaque carte est essayée avec sa condition vraie et fausse ; l'IA répond à chaque question.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { useless } from '../ai/prune.ts';
import { OP03_JAUNE } from '../engine/cards/op03-jaune.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { addMod, def, hasKeyword, knows, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const KATA_L = 'OP03-099';      // Leader, 5000
const KINGBAUM = 'OP03-100';    // coût 3, 5000, [Déclenchement]
const CAMIE = 'OP03-101';       // coût 1, 3000, {Hommes-poissons}, sans effet
const SANJI = 'OP03-102';       // coût 2, 3000
const BOBBIN = 'OP03-103';      // coût 2, 4000, sans effet
const SHIRLEY = 'OP03-104';     // coût 3, 3000, [Bloqueur]
const OVEN = 'OP03-105';        // coût 3, 4000
const OPERA = 'OP03-106';       // coût 4, 6000, sans effet
const CRACKER = 'OP03-108';     // coût 4, 5000, [Déclenchement]
const CHIFFON = 'OP03-109';     // coût 2, 3000
const SMOOTHIE = 'OP03-110';    // coût 4, 5000, [Déclenchement]
const PUDDING = 'OP03-112';     // coût 1, 2000
const SLURP = 'OP03-113';       // coût 3, 5000, [Déclenchement]
const LINLIN = 'OP03-114';      // coût 10, 12000
const STREUSEN = 'OP03-115';    // coût 1, 1000
const SHIRAHOSHI = 'OP03-116';  // coût 5, [Déclenchement] « jouez cette carte »
const NAPOLEON = 'OP03-117';    // coût 3, 3000
const TEREBRATION = 'OP03-118'; // Événement [Contre], coût 2
const MOCHI = 'OP03-119';       // Événement, coût 2
const TROPICAL = 'OP03-120';    // Événement, coût 3
const COLONNE = 'OP03-121';     // Événement, coût 2
const KATAKURI = 'OP03-123';    // coût 8, 8000
// adversaire ST-21
const O_LUFFY_L = 'ST21-001';   // Leader, 5000
const O_JINBE = 'ST21-005';     // coût 2, 4000
const O_STUSSY = 'ST21-006';    // coût 3, 5000
const O_CHOPPER = 'ST21-008';   // coût 4, 6000
const O_VEGAPUNK = 'ST21-013';  // coût 1, 3000
const O_ZORO = 'ST21-015';      // coût 4, 5000

const YELLOW = Object.keys(OP03_JAUNE).filter((n) => n !== KATA_L);
const cards = { ...Object.fromEntries(YELLOW.map((n) => [n, 4])), [CAMIE]: 4, [BOBBIN]: 4, [OPERA]: 4 };
const KATA = 'TEST-OP03-KATAKURI';
const PLAIN = 'TEST-OP03-LUFFY-JAUNE';
DECKS[KATA] = { id: KATA, name: 'Essai', series: 'TEST', leader: KATA_L, cards };
DECKS[PLAIN] = { id: PLAIN, name: 'Essai', series: 'TEST', leader: O_LUFFY_L, cards };

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const leader = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
const nums = (cs: { num: string }[]) => cs.map((c) => c.num);
const optionNums = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.num ?? [...s.players[0].chars, ...s.players[1].chars].find((c) => c.uid === o.uid)!.num);
const inTrash = (s: GameState, p: PlayerId, num: string) => s.players[p].trash.some((c) => c.num === num);
const inHandNum = (s: GameState, p: PlayerId, num: string) => s.players[p].hand.some((c) => c.num === num);
// l'adversaire ne bloque pas et ne contre pas
const noDefense = (s: GameState) => {
  while (s.decision && s.decision.player === 1 && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
};
// le joueur 0 ne bloque pas et ne contre pas (attaque adverse)
const iDontDefend = (s: GameState) => {
  while (s.decision && s.decision.player === 0 && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
};
// Vie adverse sans [Déclenchement]
const plainLife = (g: GameState, n = 3) => setLife(g, 1, [O_VEGAPUNK, O_JINBE, O_STUSSY, O_CHOPPER, O_ZORO].slice(0, n));
// Pendant le tour adverse : son Leader attaque le mien, je ne me défends pas
const hitMe = (setup: (g: GameState) => void) => {
  const s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, []); setChars(g, 1, []); setHand(g, 1, []); setup(g); }, 1);
  return iDontDefend(attack(s, leader(s, 1), leader(s, 0)));
};

test('Leader Charlotte Katakuri : [DON!! x1] en attaquant, regarder une Vie et la placer dessous, +1000 pour le combat ; sans DON!!, rien', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 1, []);
    plainLife(g);
    setLife(g, 0, [KINGBAUM, CAMIE, BOBBIN]);
    g.players[0].leader.don = 1;
    setDon(g, 0, 0);
  });
  s = attack(s, leader(s, 0), leader(s, 1));
  expectTag(s, 'lifeLook');
  aiAnswers(s);
  assert.deepEqual(s.decision!.options.map((o) => o.id), ['mine', 'opp', 'none']);
  s = choose(s, 'mine');
  expectTag(s, 'lifeArrange');
  assert.equal(s.decision!.cards?.[0].num, KINGBAUM);
  // ma Vie : l'IA garde au-dessus une carte à [Déclenchement]
  assert.equal(heuristicChooser(s, s.decision!), 'top');
  assert.ok(!JSON.stringify(viewFor(s, 1).decision ?? {}).includes(KINGBAUM), 'l’adversaire ne voit pas la carte regardée');
  s = choose(s, 'bottom');
  s = noDefense(s);
  assert.deepEqual(nums(s.players[0].life), [CAMIE, BOBBIN, KINGBAUM]);
  assert.equal(knows(s, 0, s.players[0].life[2].uid), true);
  assert.equal(knows(s, 1, s.players[0].life[2].uid), false);
  assert.ok(logHas(s, "l'attaque touche le Leader adverse (7000 contre 5000)"), '5000 + 1 DON!! + 1000');
  assert.equal(s.players[1].life.length, 2);
  assert.equal(power(s, leader(s, 0)), 6000, 'le +1000 ne dure que le combat');
  coherent(s);

  // « Aucune » : rien à regarder, mais le +1000 s'applique quand même (« Puis »)
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 1, []); setChars(g, 1, []); plainLife(g); g.players[0].leader.don = 1; setDon(g, 0, 0); });
  s = noDefense(choose(attack(s, leader(s, 0), leader(s, 1)), 'none'));
  assert.ok(logHas(s, "l'attaque touche le Leader adverse (7000 contre 5000)"));
  coherent(s);

  // sans DON!! : aucune question
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 1, []); setChars(g, 1, []); plainLife(g); });
  s = noDefense(attack(s, leader(s, 0), leader(s, 1)));
  assert.notEqual(s.decision?.tag, 'lifeLook');
  assert.ok(logHas(s, "l'attaque touche le Leader adverse (5000 contre 5000)"));
  coherent(s);
});

test('Kingbaum : [Déclenchement] placer la Vie du dessus ou du dessous dans la Défausse pour se jouer ; sans Vie, il va dans la Défausse', () => {
  let s = hitMe((g) => setLife(g, 0, [KINGBAUM, CAMIE, BOBBIN]));
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'trigger', 'il reste 2 Vies');
  s = choose(s, 'trigger');
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'lifeSide');
  s = choose(s, 'bottom');
  assert.ok(mine(s, KINGBAUM));
  assert.ok(inTrash(s, 0, BOBBIN));
  assert.deepEqual(nums(s.players[0].life), [CAMIE]);
  assert.ok(logHas(s, 'place dans sa Défausse la carte du dessous de sa Vie'));
  coherent(s);

  // dernière Vie : le coût ne peut pas être payé, la carte va dans la Défausse ; l'IA préfère la prendre en main
  s = hitMe((g) => setLife(g, 0, [KINGBAUM]));
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'hand');
  s = choose(s, 'trigger');
  assert.notEqual(s.decision?.tag, 'may');
  assert.ok(inTrash(s, 0, KINGBAUM));
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
});

test('Sanji : [DON!! x2] en attaquant, une Vie en main puis la carte du dessus du deck au-dessus de la Vie ; avec 1 DON!!, rien', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 1, []);
    plainLife(g);
    setChars(g, 0, [{ num: SANJI, extra: { don: 2 } }]);
    setDon(g, 0, 0);
    setLife(g, 0, [CAMIE, BOBBIN]);
    setDeckTop(g, 0, [OPERA]);
  });
  const hand = s.players[0].hand.length;
  s = attack(s, mine(s, SANJI).uid, leader(s, 1));
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'lifeSide');
  aiAnswers(s);
  s = choose(s, 'top');
  s = noDefense(s);
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.ok(inHandNum(s, 0, CAMIE));
  assert.deepEqual(nums(s.players[0].life), [OPERA, BOBBIN]);
  coherent(s);

  // 1 DON!! seulement : pas de question
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 1, []); setChars(g, 1, []); plainLife(g); setChars(g, 0, [{ num: SANJI, extra: { don: 1 } }]); setDon(g, 0, 0); });
  s = attack(s, mine(s, SANJI).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'may');
  coherent(s);
});

test('Shirley : [Jouée] regarder la carte du dessus d’une Vie et la laisser ou la placer dessous', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [SHIRLEY]); setDon(g, 0, 3); setLife(g, 1, [O_JINBE, O_STUSSY, O_CHOPPER]); });
  s = play(s, SHIRLEY);
  expectTag(s, 'lifeLook');
  assert.equal(heuristicChooser(s, s.decision!), 'opp');
  s = choose(s, 'opp');
  expectTag(s, 'lifeArrange');
  assert.equal(s.decision!.cards?.[0].num, O_JINBE);
  aiAnswers(s);
  s = choose(s, 'bottom');
  assert.deepEqual(nums(s.players[1].life), [O_STUSSY, O_CHOPPER, O_JINBE]);
  assert.equal(knows(s, 0, s.players[1].life[2].uid), true);
  assert.equal(knows(s, 1, s.players[1].life[2].uid), false);
  assert.ok(hasKeyword(s, 0, mine(s, SHIRLEY), 'Blocker'));
  coherent(s);

  // « Aucune » : rien ne bouge
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [SHIRLEY]); setDon(g, 0, 3); setLife(g, 1, [O_JINBE, O_STUSSY]); });
  s = choose(play(s, SHIRLEY), 'none');
  assert.deepEqual(nums(s.players[1].life), [O_JINBE, O_STUSSY]);
  coherent(s);
});

test('Charlotte Oven : [DON!! x1] en attaquant, défausser une carte à [Déclenchement] pour +3000 ; l’IA ne paie que si le bonus suffit', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [KINGBAUM, CAMIE]);
    setHand(g, 1, []);
    setChars(g, 0, [{ num: OVEN, extra: { don: 1 } }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
  });
  // 5000 contre 6000 : l'attaque ne sert que grâce à l'effet
  const atk = s.decision!.options.find((o) => o.id === `attack:${mine(s, OVEN).uid}:${theirs(s, O_CHOPPER).uid}`)!;
  assert.equal(useless(s, s.decision!, atk), null);
  s = attack(s, mine(s, OVEN).uid, theirs(s, O_CHOPPER).uid);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'yes');
  // une seule carte à [Déclenchement] (Kingbaum, pas Camie) : défaussée sans autre question
  s = noDefense(choose(s, 'yes'));
  assert.ok(logHas(s, 'défausse Kingbaum'));
  assert.ok(logHas(s, "l'attaque gagne le combat (8000 contre 6000)"));
  assert.ok(!s.players[1].chars.some((c) => c.num === O_CHOPPER), 'Chopper mis KO');
  assert.ok(inTrash(s, 0, KINGBAUM));
  coherent(s);

  // l'attaque passe déjà : l'IA ne défausse pas
  s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [KINGBAUM]);
    setHand(g, 1, []);
    setChars(g, 1, []);
    plainLife(g);
    setChars(g, 0, [{ num: OVEN, extra: { don: 1 } }]);
    setDon(g, 0, 0);
  });
  s = attack(s, mine(s, OVEN).uid, leader(s, 1));
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  coherent(s);

  // sans DON!! : aucune question, et l'attaque trop faible ne sert à rien
  s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [KINGBAUM]);
    setChars(g, 0, [{ num: OVEN }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
  });
  const weak = s.decision!.options.find((o) => o.id === `attack:${mine(s, OVEN).uid}:${theirs(s, O_CHOPPER).uid}`)!;
  assert.equal(useless(s, s.decision!, weak)?.kind, 'weakAttack');
  s = attack(s, mine(s, OVEN).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'may');
  coherent(s);
});

test('Charlotte Cracker : [DON!! x1] avec moins de Vie, [Double attaque] et +1000 ; [Déclenchement] défausser 1 carte pour se jouer', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: CRACKER, extra: { don: 1 } }]);
    setDon(g, 0, 0);
    setLife(g, 0, [CAMIE, BOBBIN]);
    plainLife(g);
  });
  const cracker = mine(s, CRACKER);
  assert.equal(power(s, cracker.uid), 7000, '5000 + 1 DON!! + 1000');
  assert.equal(hasKeyword(s, 0, cracker, 'Double Attack'), true);
  // Vies égales : plus rien
  s.players[0].life.push(s.players[0].deck.shift()!);
  assert.equal(power(s, cracker.uid), 6000);
  assert.equal(hasKeyword(s, 0, cracker, 'Double Attack'), false);
  // sans DON!! : rien, même avec moins de Vie
  s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: CRACKER }]); setLife(g, 0, [CAMIE]); plainLife(g); });
  assert.equal(power(s, mine(s, CRACKER).uid), 5000);
  assert.equal(hasKeyword(s, 0, mine(s, CRACKER), 'Double Attack'), false);

  // [Déclenchement] : défausser 1 carte pour le jouer
  s = hitMe((g) => { setLife(g, 0, [CRACKER, BOBBIN]); setHand(g, 0, [CAMIE]); });
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'may');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.ok(mine(s, CRACKER));
  assert.ok(inTrash(s, 0, CAMIE));
  coherent(s);
  // main vide : l'IA prend la carte en main
  s = hitMe((g) => { setLife(g, 0, [CRACKER, BOBBIN]); setHand(g, 0, []); });
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'hand');
});

test('Charlotte Chiffon : [Jouée] une Vie (dessus ou dessous) dans la Défausse, puis la carte du dessus du deck au-dessus de la Vie', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [CHIFFON]);
    setDon(g, 0, 2);
    setLife(g, 0, [CAMIE, BOBBIN]);
    setDeckTop(g, 0, [OPERA]);
  });
  s = play(s, CHIFFON);
  expectTag(s, 'may');
  aiAnswers(s);
  s = choose(s, 'yes');
  expectTag(s, 'lifeSide');
  s = choose(s, 'bottom');
  assert.deepEqual(nums(s.players[0].life), [OPERA, CAMIE]);
  assert.ok(inTrash(s, 0, BOBBIN));
  coherent(s);

  // « Non » : rien ; sans Vie : aucune question
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [CHIFFON]); setDon(g, 0, 2); setLife(g, 0, [CAMIE]); });
  s = choose(play(s, CHIFFON), 'no');
  assert.deepEqual(nums(s.players[0].life), [CAMIE]);
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [CHIFFON]); setDon(g, 0, 2); setLife(g, 0, []); });
  s = play(s, CHIFFON);
  assert.notEqual(s.decision?.tag, 'may');
  assert.equal(s.players[0].life.length, 0);
  coherent(s);
});

test('Charlotte Smoothie : en attaquant, une Vie en main pour +2000 (l’IA seulement si ça fait passer l’attaque) ; [Déclenchement] défausser pour se jouer', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 0, [{ num: SMOOTHIE }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
    setLife(g, 0, [CAMIE, BOBBIN, OPERA]);
  });
  const hand = s.players[0].hand.length;
  s = attack(s, mine(s, SMOOTHIE).uid, theirs(s, O_CHOPPER).uid);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'yes', '5000 + 2000 contre 6000');
  s = choose(s, 'yes');
  s = noDefense(choose(s, 'top'));
  assert.ok(logHas(s, "l'attaque gagne le combat (7000 contre 6000)"));
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.equal(s.players[0].life.length, 2);
  assert.ok(!s.players[1].chars.some((c) => c.num === O_CHOPPER));
  coherent(s);

  // dernière Vie : l'IA refuse ; sans Vie : aucune question
  s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 0, [{ num: SMOOTHIE }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
    setLife(g, 0, [CAMIE]);
  });
  s = attack(s, mine(s, SMOOTHIE).uid, theirs(s, O_CHOPPER).uid);
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: SMOOTHIE }]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]);
    setLife(g, 0, []);
  });
  const weak = s.decision!.options.find((o) => o.id === `attack:${mine(s, SMOOTHIE).uid}:${theirs(s, O_CHOPPER).uid}`)!;
  assert.equal(useless(s, s.decision!, weak)?.kind, 'weakAttack');
  s = attack(s, mine(s, SMOOTHIE).uid, theirs(s, O_CHOPPER).uid);
  assert.notEqual(s.decision?.tag, 'may');

  // [Déclenchement]
  s = hitMe((g) => { setLife(g, 0, [SMOOTHIE, BOBBIN]); setHand(g, 0, [CAMIE]); });
  s = choose(choose(s, 'trigger'), 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.ok(mine(s, SMOOTHIE));
  coherent(s);
});

test('Charlotte Pudding : [Jouée] 4 cartes du dessus, une [Sanji] ou {Équipage de Big Mom} autre que [Charlotte Pudding]', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [PUDDING]);
    setDon(g, 0, 1);
    setDeckTop(g, 0, [CAMIE, SANJI, PUDDING, BOBBIN]);
  });
  s = play(s, PUDDING);
  expectTag(s, 'pick');
  assert.deepEqual(optionNums(s).sort(), [SANJI, BOBBIN].sort(), 'ni Camie ({Hommes-poissons}), ni Pudding');
  assert.equal(s.decision!.cards?.length, 4);
  aiAnswers(s);
  s = keepOrder(choose(s, (o) => o.num === SANJI));
  assert.ok(inHandNum(s, 0, SANJI));
  assert.deepEqual(nums(s.players[0].deck.slice(-3)), [CAMIE, PUDDING, BOBBIN]);
  assert.ok(logHas(s, 'regarde 4 cartes du dessus de son deck et ajoute Sanji à sa main'));
  coherent(s);

  // aucune carte qui convienne : rien à prendre
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [PUDDING]); setDon(g, 0, 1); setDeckTop(g, 0, [CAMIE, PUDDING, SHIRAHOSHI, CAMIE]); });
  s = keepOrder(play(s, PUDDING));
  assert.notEqual(s.decision?.tag, 'pick');
  assert.ok(!inHandNum(s, 0, CAMIE));
  coherent(s);
});

test('Charlotte Slurp : [En cas de KO] 3 cartes du dessus, une {Équipage de Big Mom} ; [Déclenchement] défausser pour se jouer', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: SLURP, extra: { rested: true } }]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setDeckTop(g, 0, [CAMIE, OPERA, SHIRAHOSHI]);
  }, 1);
  s = iDontDefend(attack(s, leader(s, 1), mine(s, SLURP).uid));
  expectTag(s, 'pick');
  assert.deepEqual(optionNums(s), [OPERA]);
  s = keepOrder(choose(s, (o) => o.num === OPERA));
  assert.ok(inHandNum(s, 0, OPERA));
  assert.ok(inTrash(s, 0, SLURP));
  coherent(s);

  // [Déclenchement] avec une carte à défausser
  s = hitMe((g) => { setLife(g, 0, [SLURP, BOBBIN]); setHand(g, 0, [CAMIE]); });
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  s = choose(choose(s, 'trigger'), 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.ok(mine(s, SLURP));
  coherent(s);
});

test('Charlotte Linlin : [Jouée] avec un Leader {Équipage de Big Mom}, +1 Vie depuis le deck et la Vie adverse du dessus dans la Défausse ; sinon rien', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [LINLIN]);
    setDon(g, 0, 10);
    setLife(g, 0, [CAMIE]);
    setDeckTop(g, 0, [OPERA]);
    plainLife(g);
  });
  s = play(s, LINLIN);
  assert.deepEqual(nums(s.players[0].life), [OPERA, CAMIE]);
  assert.deepEqual(nums(s.players[1].life), [O_JINBE, O_STUSSY]);
  assert.ok(inTrash(s, 1, O_VEGAPUNK));
  assert.ok(logHas(s, 'la carte du dessus de sa Vie va dans sa Défausse'));
  coherent(s);

  // Leader Luffy : rien
  s = scenario([PLAIN, 'ST-21'], (g) => { setHand(g, 0, [LINLIN]); setDon(g, 0, 10); setLife(g, 0, [CAMIE]); plainLife(g); });
  s = play(s, LINLIN);
  assert.equal(s.players[0].life.length, 1);
  assert.equal(s.players[1].life.length, 3);
  coherent(s);
});

test('Streusen : [Jouée] défausser une carte à [Déclenchement] pour mettre KO un Personnage adverse de coût 1 ou moins', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [STREUSEN, KINGBAUM, CAMIE]);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: O_VEGAPUNK }, { num: O_JINBE }]);
  });
  s = play(s, STREUSEN);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'yes');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') {
    assert.deepEqual(optionNums(s), [KINGBAUM]);
    s = choose(s, (o) => o.uid !== undefined);
  }
  expectTag(s, 'oppKo');
  assert.deepEqual(optionNums(s), [O_VEGAPUNK]);
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_VEGAPUNK).uid}`);
  assert.ok(inTrash(s, 1, O_VEGAPUNK));
  assert.ok(inTrash(s, 0, KINGBAUM));
  coherent(s);

  // aucun Personnage de coût 1 ou moins : l'IA ne défausse pas ; aucune carte à [Déclenchement] : aucune question
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [STREUSEN, KINGBAUM]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_JINBE }]); });
  s = play(s, STREUSEN);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [STREUSEN, CAMIE]); setDon(g, 0, 1); setChars(g, 1, [{ num: O_VEGAPUNK }]); });
  s = play(s, STREUSEN);
  assert.notEqual(s.decision?.tag, 'may');
  assert.ok(theirs(s, O_VEGAPUNK));
  coherent(s);
});

test('Shirahoshi : [Jouée] piocher 3 cartes et en défausser 2 ; [Déclenchement] se jouer', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [SHIRAHOSHI, CAMIE]); setDon(g, 0, 5); });
  s = play(s, SHIRAHOSHI);
  assert.equal(s.players[0].hand.length, 4);
  expectTag(s, 'discard');
  aiAnswers(s);
  s = choose(s, (o) => o.uid !== undefined);
  s = choose(s, (o) => o.uid !== undefined);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[0].trash.length, 2);
  assert.equal(s.players[0].discardedTurn, s.turn);
  coherent(s);

  s = hitMe((g) => setLife(g, 0, [SHIRAHOSHI, BOBBIN]));
  s = choose(s, 'trigger');
  assert.ok(mine(s, SHIRAHOSHI));
  coherent(s);
});

test('Napoleon : s’épuiser pour +1000 à son [Charlotte Linlin] jusqu’à son prochain tour ; sans Linlin, l’effet ne sert à rien', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: NAPOLEON }, { num: LINLIN }, { num: BOBBIN }]); });
  const napoleon = mine(s, NAPOLEON);
  const act1 = s.decision!.options.find((o) => o.id === `act:${napoleon.uid}`)!;
  assert.ok(act1);
  assert.equal(useless(s, s.decision!, act1), null);
  s = act(s, act1.id);
  expectTag(s, 'ownPower');
  assert.deepEqual(optionNums(s), [LINLIN], 'seulement [Charlotte Linlin]');
  aiAnswers(s);
  s = choose(s, `card:${mine(s, LINLIN).uid}`);
  assert.equal(mine(s, NAPOLEON).rested, true);
  assert.equal(power(s, mine(s, LINLIN).uid), 13000);
  assert.equal(s.decision!.options.some((o) => o.id === `act:${napoleon.uid}`), false, 'déjà épuisé');
  // toujours là pendant le tour adverse, plus au tour suivant
  s = choose(s, 'end');
  assert.equal(s.active, 1);
  assert.equal(power(s, mine(s, LINLIN).uid), 13000);
  coherent(s);

  s = scenario([KATA, 'ST-21'], (g) => { setChars(g, 0, [{ num: NAPOLEON }, { num: BOBBIN }]); });
  const act2 = s.decision!.options.find((o) => o.id === `act:${mine(s, NAPOLEON).uid}`)!;
  assert.equal(useless(s, s.decision!, act2)?.kind, 'idleEffect');
});

test('Térébration : [Contre] +5000 à la carte attaquée (valeur connue de l’IA) ; [Déclenchement] défausser 2 cartes pour +1 Vie', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [TEREBRATION]); setDon(g, 0, 2); setChars(g, 0, []); setChars(g, 1, []); }, 1);
  assert.equal(def(TEREBRATION).counterPower?.(s, 0, leader(s, 0)), 5000);
  s = attack(s, leader(s, 1), leader(s, 0));
  assert.equal(s.decision?.kind, 'counter');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  assert.ok(logHas(s, 'gagne +5000 de puissance pour le combat (Térébration)'));
  assert.equal(s.players[0].life.length, 5);
  coherent(s);

  // [Déclenchement] : défausser 2 cartes, la carte du dessus du deck au-dessus de la Vie
  s = hitMe((g) => { setLife(g, 0, [TEREBRATION, BOBBIN]); setHand(g, 0, [CAMIE, OPERA]); setDeckTop(g, 0, [SANJI]); });
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'hand', 'son [Contre] vaut mieux en main');
  s = choose(choose(s, 'trigger'), 'yes');
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.deepEqual(nums(s.players[0].life), [SANJI, BOBBIN]);
  assert.ok(inTrash(s, 0, CAMIE) && inTrash(s, 0, OPERA) && inTrash(s, 0, TEREBRATION));
  coherent(s);
  // une seule carte en main : le coût ne peut pas être payé
  s = hitMe((g) => { setLife(g, 0, [TEREBRATION, BOBBIN]); setHand(g, 0, [CAMIE]); });
  s = choose(s, 'trigger');
  assert.notEqual(s.decision?.tag, 'may');
  assert.equal(s.players[0].life.length, 1);
  coherent(s);
});

test('Buzz Cut Mochi : avec moins de Vie, KO d’un Personnage adverse de coût 4 ou moins ; [Déclenchement] jouer un Personnage à [Déclenchement] de coût 4 ou moins', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [MOCHI]);
    setDon(g, 0, 2);
    setLife(g, 0, [CAMIE]);
    plainLife(g);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_STUSSY }]);
  });
  s = play(s, MOCHI);
  expectTag(s, 'oppKo');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(inTrash(s, 1, O_CHOPPER));
  coherent(s);

  // autant de Vie que l'adversaire : l'effet ne sert à rien
  s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [MOCHI]);
    setDon(g, 0, 2);
    setLife(g, 0, [CAMIE, BOBBIN, OPERA]);
    plainLife(g);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  });
  const ev = s.decision!.options.find((o) => o.id.startsWith('event:'))!;
  assert.equal(useless(s, s.decision!, ev)?.kind, 'idleEffect');
  s = play(s, MOCHI);
  assert.ok(theirs(s, O_CHOPPER));
  coherent(s);

  // [Déclenchement] : seulement les Personnages à [Déclenchement] de coût 4 ou moins
  s = hitMe((g) => { setLife(g, 0, [MOCHI, BOBBIN]); setHand(g, 0, [CAMIE, KINGBAUM, KATAKURI]); });
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.num), [KINGBAUM]);
  s = choose(s, (o) => o.num === KINGBAUM);
  assert.ok(mine(s, KINGBAUM));
  coherent(s);
  s = hitMe((g) => { setLife(g, 0, [MOCHI, BOBBIN]); setHand(g, 0, [CAMIE]); });
  assert.equal(heuristicChooser(s, s.decision!), 'hand');
});

test('Tropical Torment : si l’adversaire a 4 Vies ou plus, sa Vie du dessus dans sa Défausse ; [Déclenchement] le même effet', () => {
  let s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [TROPICAL]); setDon(g, 0, 3); plainLife(g, 4); });
  s = play(s, TROPICAL);
  assert.equal(s.players[1].life.length, 3);
  assert.ok(inTrash(s, 1, O_VEGAPUNK));
  coherent(s);

  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [TROPICAL]); setDon(g, 0, 3); plainLife(g, 3); });
  const ev = s.decision!.options.find((o) => o.id.startsWith('event:'))!;
  assert.equal(useless(s, s.decision!, ev)?.kind, 'idleEffect');
  s = play(s, TROPICAL);
  assert.equal(s.players[1].life.length, 3);

  // [Déclenchement] : l'adversaire (joueur 1) a 4 Vies
  s = hitMe((g) => { setLife(g, 0, [TROPICAL, BOBBIN]); plainLife(g, 4); });
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  s = choose(s, 'trigger');
  assert.equal(s.players[1].life.length, 3);
  assert.ok(inTrash(s, 0, TROPICAL));
  coherent(s);
  s = hitMe((g) => { setLife(g, 0, [TROPICAL, BOBBIN]); plainLife(g, 3); });
  assert.equal(heuristicChooser(s, s.decision!), 'hand');
});

test('Colonne foudroyante : la Vie du dessus dans la Défausse pour un KO de coût 5 ou moins ; [Déclenchement] KO sans coût', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [COLONNE]);
    setDon(g, 0, 2);
    setLife(g, 0, [CAMIE, BOBBIN]);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_ZORO }]);
  });
  // Chopper passe à 6 de coût
  addMod(s, { uid: theirs(s, O_CHOPPER).uid, stat: 'cost', amount: 2, until: 'turn', source: 'essai' });
  s = play(s, COLONNE);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'oppKo');
  assert.deepEqual(optionNums(s), [O_ZORO]);
  s = choose(s, `card:${theirs(s, O_ZORO).uid}`);
  assert.deepEqual(nums(s.players[0].life), [BOBBIN]);
  assert.ok(inTrash(s, 0, CAMIE));
  assert.ok(inTrash(s, 1, O_ZORO));
  coherent(s);

  // sans Vie : rien (et l'effet ne sert à rien)
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [COLONNE]); setDon(g, 0, 2); setLife(g, 0, []); setChars(g, 1, [{ num: O_ZORO }]); });
  const ev = s.decision!.options.find((o) => o.id.startsWith('event:'))!;
  assert.equal(useless(s, s.decision!, ev)?.kind, 'idleEffect');
  s = play(s, COLONNE);
  assert.ok(theirs(s, O_ZORO));

  // [Déclenchement] : pendant le tour adverse, KO d'un Personnage adverse de coût 5 ou moins
  s = hitMe((g) => { setLife(g, 0, [COLONNE, BOBBIN]); setChars(g, 1, [{ num: O_ZORO }]); });
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, O_ZORO).uid}`);
  assert.ok(inTrash(s, 1, O_ZORO));
  coherent(s);
});

test('Charlotte Katakuri (OP03-123) : [Jouée] un Personnage de coût 8 ou moins, les siens compris, face visible dans la Vie de son propriétaire', () => {
  let s = scenario([KATA, 'ST-21'], (g) => {
    setHand(g, 0, [KATAKURI]);
    setDon(g, 0, 8);
    setChars(g, 0, [{ num: BOBBIN }]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
    plainLife(g);
  });
  s = play(s, KATAKURI);
  expectTag(s, 'oppToLife');
  assert.deepEqual(optionNums(s).sort(), [O_CHOPPER, BOBBIN, KATAKURI].sort(), 'les siens compris');
  assert.equal(heuristicChooser(s, s.decision!), `card:${theirs(s, O_CHOPPER).uid}`);
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  expectTag(s, 'lifeSideOpp');
  s = choose(s, 'lifeTop');
  assert.equal(s.players[1].life[0].num, O_CHOPPER);
  assert.equal(s.players[1].life[0].faceUp, true);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);

  // un des siens : dans sa propre Vie
  s = scenario([KATA, 'ST-21'], (g) => { setHand(g, 0, [KATAKURI]); setDon(g, 0, 8); setChars(g, 0, [{ num: BOBBIN }]); setChars(g, 1, []); });
  s = play(s, KATAKURI);
  s = choose(choose(s, `card:${mine(s, BOBBIN).uid}`), 'lifeBottom');
  assert.equal(s.players[0].life.at(-1)!.num, BOBBIN);
  assert.equal(s.players[0].life.at(-1)!.faceUp, true);
  coherent(s);
});
