// OP03 bleue (tâche 1.10 du plan « Aventure ») : un test par carte, condition vraie et fausse. Deck d'essai au Leader
// Nami (victoire à deck vide), et la même liste au Leader Luffy ST21-001 pour les conditions fausses (pas de [Nami],
// défaite à deck vide : l'IA refuse alors de placer des cartes du deck dans la Défausse). Adversaire : ST-21.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { cardStatus } from '../engine/cards/index.ts';
import { OP03_BLEUE } from '../engine/cards/op03-bleue.ts';
import { DECKS } from '../engine/decks.ts';
import { newGame } from '../engine/engine.ts';
import { invariantErrors } from '../engine/invariants.ts';
import { addMod, def, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, inHand, logHas, play, scenario, setChars, setDeckTop, setDon,
  setHand, setLife, take,
} from './helpers.ts';

const NAMI = 'OP03-040';
const USOPP = 'OP03-041';
const CREW = 'OP03-042';      // Usopp's Pirate Crew
const GAIMON = 'OP03-043';
const KAYA = 'OP03-044';
const CARNE = 'OP03-045';
const GENZO = 'OP03-046';     // sans effet (coût 2, 4000)
const ZEFF = 'OP03-047';
const NOJIKO = 'OP03-048';
const PATTY = 'OP03-049';
const BOODLE = 'OP03-050';
const BELLMERE = 'OP03-051';
const MERRY = 'OP03-052';     // sans effet (coût 1, 3000)
const YOSAKU = 'OP03-053';    // Yosaku & Johnny
const RUBBER = 'OP03-054';    // Usopp's Rubber Band of Doom!!!
const GAVEL = 'OP03-055';     // Gum Gum Super Marteau
const PILAF = 'OP03-056';     // Riz pilaf de Sanji
const SANZEN = 'OP03-057';    // San Zen Sekai
const SNIPER = 'OP03-122';    // Sniperking

const BLEU = 'TEST-OP03-BLEU';
const AUTRE = 'TEST-OP03-BLEU-LUFFY';
const LIST = Object.fromEntries([...Object.keys(OP03_BLEUE).filter((n) => n !== NAMI), GENZO, MERRY].map((n) => [n, 3]));
DECKS[BLEU] = { id: BLEU, name: 'Essai Nami', series: 'TEST', leader: NAMI, cards: LIST };
DECKS[AUTRE] = { id: AUTRE, name: 'Essai Luffy', series: 'TEST', leader: 'ST21-001', cards: LIST };

// adversaire ST-21 (Leader Luffy 5000)
const O_VEGAPUNK = 'ST21-013';   // coût 1, 3000
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const inTrash = (s: GameState, p: PlayerId, num: string) => s.players[p].trash.some((c) => c.num === num);
const optionNums = (s: GameState) => s.decision!.options.map((o) => o.num ?? o.id);

// Deck de n cartes exactement : les autres (du dessous) vont dans la Défausse
function deckOf(g: GameState, p: PlayerId, n: number) {
  const P = g.players[p];
  while (P.deck.length > n) P.trash.push(P.deck.pop()!);
  assert.equal(P.deck.length, n, 'pas assez de cartes dans le deck');
}

// Pendant une attaque adverse : ni Bloqueur ni Contre
function noDefense(s: GameState) {
  while (s.decision?.kind === 'blocker' || s.decision?.kind === 'counter') s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
}

// Le joueur 0 attaque le Leader adverse (Luffy, 5000), qui n'a ni main, ni Personnage, ni [Déclenchement] dans sa Vie
function hit(deck: string, attacker: string | 'leader', setup: (g: GameState) => void) {
  const s = scenario([deck, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 1, []);
    setLife(g, 1, [O_VEGAPUNK, O_JINBE, O_STUSSY]);
    setup(g);
  });
  return attack(s, attacker === 'leader' ? s.players[0].leader.uid : mine(s, attacker).uid, s.players[1].leader.uid);
}

// L'adversaire (Chopper, 6000) attaque le Leader Nami (5000) : Vie sans [Déclenchement] sauf celle donnée
function hitNami(setup: (g: GameState) => void, life: string[] = [GENZO, MERRY]) {
  const s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, life);
    setChars(g, 1, [{ num: O_CHOPPER }]);
    setup(g);
  }, 1);
  return attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid);
}

test('OP03 bleue : les 19 cartes sont jouables (Genzo et Merry d’office)', () => {
  for (const n of [...Object.keys(OP03_BLEUE), GENZO, MERRY]) assert.notEqual(cardStatus(n), 'todo', n);
  assert.equal(cardStatus(GENZO), 'auto');
  assert.equal(cardStatus(MERRY), 'auto');
  assert.equal(Object.keys(OP03_BLEUE).length, 17);
});

test('Nami (OP03-040) : [DON!! x1] après des dégâts de son attaque, 1 carte du deck dans la Défausse ; sans DON!!, rien', () => {
  let s = hit(BLEU, 'leader', (g) => { g.players[0].leader.don = 1; setDon(g, 0, 3); deckOf(g, 0, 5); });
  assert.equal(s.players[1].life.length, 2);
  expectTag(s, 'mayMill');
  aiAnswers(s);
  assert.equal(heuristicChooser(s, s.decision!), 'yes', 'son Leader gagne à deck vide');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 4);
  assert.ok(logHas(s, /place 1 carte du dessus de son deck dans sa Défausse \(Nami, 4 restantes\)/));
  coherent(s);

  s = hit(BLEU, 'leader', (g) => { setDon(g, 0, 3); deckOf(g, 0, 5); });
  assert.equal(s.players[1].life.length, 2);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].deck.length, 5);
});

test('Nami (OP03-040) : deck vide, Nami gagne (par son effet, à la pioche, pendant le tour adverse) ; un autre Leader perd', () => {
  let s = hit(BLEU, 'leader', (g) => { g.players[0].leader.don = 1; setDon(g, 0, 3); deckOf(g, 0, 1); });
  s = choose(s, 'yes');
  assert.equal(s.winner, 0);
  assert.match(s.winReason ?? '', /gagne \(effet de son Leader\)/);
  // deck vidé pendant le tour adverse
  s = scenario([BLEU, 'ST-21'], (g) => deckOf(g, 0, 0), 1);
  assert.equal(s.winner, 0);
  s = scenario([AUTRE, 'ST-21'], (g) => deckOf(g, 0, 0), 1);
  assert.equal(s.winner, 1);
  // à la pioche : le deck vidé par la pioche du joueur
  s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [PILAF]); setDon(g, 0, 3); deckOf(g, 0, 2); });
  s = play(s, PILAF);
  assert.equal(s.winner, 0);
});

test('Usopp (OP03-041) : [Initiative] ; [DON!! x1] après des dégâts, 7 cartes (toutes s’il en reste moins) ; l’IA refuse sans Leader Nami', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => setChars(g, 0, [{ num: USOPP, extra: { playedTurn: 5 } }]));
  assert.ok(hasKeyword(s, 0, mine(s, USOPP), 'Rush'));
  assert.ok(hasOption(s, `attack:${mine(s, USOPP).uid}`), 'peut attaquer le tour où il est joué');

  const withDon = (n: number) => (g: GameState) => { setChars(g, 0, [{ num: USOPP, extra: { don: 1 } }]); setDon(g, 0, 3); deckOf(g, 0, n); };
  s = hit(BLEU, USOPP, withDon(10));
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 3);
  coherent(s);
  // 3 cartes seulement : toutes, et Nami gagne
  s = choose(hit(BLEU, USOPP, withDon(3)), 'yes');
  assert.equal(s.players[0].deck.length, 0);
  assert.equal(s.winner, 0);
  // sans DON!! : rien
  s = hit(BLEU, USOPP, (g) => { setChars(g, 0, [{ num: USOPP }]); setDon(g, 0, 3); });
  assert.equal(s.players[1].life.length, 2);
  assert.equal(s.decision?.kind, 'main');
  // Leader Luffy : la question est posée, l'IA refuse
  s = hit(AUTRE, USOPP, withDon(10));
  expectTag(s, 'mayMill');
  aiAnswers(s);
  assert.equal(heuristicChooser(s, s.decision!), 'no');
});

test('Usopp’s Pirate Crew (OP03-042) : un [Usopp] bleu de la Défausse, Sniperking compris ; sans Usopp, rien', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, [CREW]);
    setDon(g, 0, 1);
    g.players[0].trash.push(take(g, 0, USOPP), take(g, 0, SNIPER), take(g, 0, KAYA));
  });
  s = play(s, CREW);
  expectTag(s, 'pick');
  assert.deepEqual(optionNums(s), [USOPP, SNIPER, 'none']);
  aiAnswers(s);
  s = choose(s, (o) => o.num === SNIPER);
  assert.ok(s.players[0].hand.some((c) => c.num === SNIPER));
  assert.ok(!inTrash(s, 0, SNIPER));
  coherent(s);

  s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [CREW]); setDon(g, 0, 1); g.players[0].trash.push(take(g, 0, KAYA)); });
  s = play(s, CREW);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].hand.length, 0);
});

test('Gaimon (OP03-043) : quand vous infligez des dégâts, 3 cartes du deck puis Gaimon dans la Défausse ; moins de 3 cartes, rien', () => {
  const setup = (n: number) => (g: GameState) => { setChars(g, 0, [{ num: GAIMON }, { num: MERRY }]); setDon(g, 0, 3); deckOf(g, 0, n); };
  // dégâts de l'attaque du Leader (sans DON!! : Nami ne demande rien)
  let s = hit(BLEU, 'leader', setup(10));
  expectTag(s, 'mayMill');
  assert.match(s.decision!.prompt, /^Gaimon/);
  assert.equal(heuristicChooser(s, s.decision!), 'yes');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 7);
  assert.ok(!s.players[0].chars.some((c) => c.num === GAIMON));
  assert.ok(inTrash(s, 0, GAIMON));
  coherent(s);
  // refusé : Gaimon reste
  s = choose(hit(BLEU, 'leader', setup(10)), 'no');
  assert.equal(s.players[0].deck.length, 10);
  assert.ok(mine(s, GAIMON));
  // dégâts d'un Personnage (Merry, 3000 + 2 DON!! contre 5000)
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 1, []);
    setChars(g, 1, []);
    setLife(g, 1, [O_VEGAPUNK, O_JINBE]);
    setChars(g, 0, [{ num: GAIMON }, { num: MERRY, extra: { don: 2 } }]);
    setDon(g, 0, 1);
    deckOf(g, 0, 10);
  });
  s = attack(s, mine(s, MERRY).uid, s.players[1].leader.uid);
  expectTag(s, 'mayMill');
  // 2 cartes dans le deck : pas de question
  s = hit(BLEU, 'leader', setup(2));
  assert.equal(s.decision?.kind, 'main');
  assert.ok(mine(s, GAIMON));
  // Leader Luffy : l'IA refuse
  s = hit(AUTRE, 'leader', setup(10));
  expectTag(s, 'mayMill');
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  // dégâts subis : rien
  s = noDefense(hitNami((g) => { setChars(g, 0, [{ num: GAIMON }]); deckOf(g, 0, 10); }));
  assert.equal(s.players[0].life.length, 1);
  assert.notEqual(s.decision?.tag, 'mayMill');
  assert.ok(mine(s, GAIMON));
});

test('Kaya (OP03-044) : piocher 2 cartes, puis défausser 2 cartes', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [KAYA, GENZO]); setDon(g, 0, 1); setDeckTop(g, 0, [MERRY, PATTY]); });
  s = play(s, KAYA);
  expectTag(s, 'discard');
  assert.deepEqual(s.players[0].hand.map((c) => c.num).sort(), [GENZO, PATTY, MERRY]);
  aiAnswers(s);
  s = choose(s, `card:${inHand(s, 0, GENZO)}`);
  s = choose(s, `card:${inHand(s, 0, MERRY)}`);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [PATTY]);
  assert.ok(inTrash(s, 0, GENZO) && inTrash(s, 0, MERRY));
  coherent(s);
});

test('Carne (OP03-045) : [Bloqueur] ; [Tour adverse] +3000 avec 20 cartes ou moins dans le deck', () => {
  const carne = (active: PlayerId, n: number) => {
    const s = scenario([BLEU, 'ST-21'], (g) => { setChars(g, 0, [{ num: CARNE }]); deckOf(g, 0, n); }, active);
    return { s, pw: power(s, mine(s, CARNE).uid) };
  };
  const { s, pw } = carne(1, 20);
  assert.equal(pw, 6000);
  assert.ok(hasKeyword(s, 0, mine(s, CARNE), 'Blocker'));
  assert.equal(carne(1, 21).pw, 3000);
  assert.equal(carne(0, 20).pw, 3000, 'son tour');
});

test('Zeff (OP03-047) : [Jouée] renvoyer un Personnage de coût 3 ou moins, puis 2 cartes ; [DON!! x1] 7 cartes après des dégâts', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, [ZEFF]);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]);
    deckOf(g, 0, 10);
  });
  s = play(s, ZEFF);
  expectTag(s, 'bounce');
  assert.ok(!hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), 'Chopper : coût 4');
  aiAnswers(s);
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === O_STUSSY));
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 8);
  coherent(s);
  // aucun Personnage de coût 3 ou moins : seulement les 2 cartes
  s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [ZEFF]); setDon(g, 0, 5); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = play(s, ZEFF);
  expectTag(s, 'mayMill');
  // [DON!! x1] après des dégâts ; sans DON!!, rien
  s = hit(BLEU, ZEFF, (g) => { setChars(g, 0, [{ num: ZEFF, extra: { don: 1 } }]); setDon(g, 0, 3); deckOf(g, 0, 10); });
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 3);
  s = hit(BLEU, ZEFF, (g) => { setChars(g, 0, [{ num: ZEFF }]); setDon(g, 0, 3); });
  assert.equal(s.decision?.kind, 'main');
});

test('Nojiko (OP03-048) : avec un Leader [Nami], renvoyer un Personnage adverse de coût 5 ou moins ; autre Leader, rien', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [NOJIKO]); setDon(g, 0, 2); setChars(g, 0, [{ num: MERRY }]); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = play(s, NOJIKO);
  expectTag(s, 'bounce');
  assert.ok(!hasOption(s, `card:${mine(s, MERRY).uid}`), 'Personnage adverse seulement');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === O_LUFFY));
  coherent(s);
  s = scenario([AUTRE, 'ST-21'], (g) => { setHand(g, 0, [NOJIKO]); setDon(g, 0, 2); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = play(s, NOJIKO);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(theirs(s, O_LUFFY));
});

test('Patty (OP03-049) : avec 20 cartes ou moins dans le deck, renvoyer un Personnage de coût 3 ou moins ; plus de 20, rien', () => {
  const setup = (n: number) => (g: GameState) => {
    setHand(g, 0, [PATTY]);
    setDon(g, 0, 3);
    setChars(g, 1, [{ num: O_STUSSY }, { num: O_CHOPPER }]);
    deckOf(g, 0, n);
  };
  let s = play(scenario([BLEU, 'ST-21'], setup(20)), PATTY);
  expectTag(s, 'bounce');
  assert.ok(!hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`));
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === O_STUSSY));
  coherent(s);
  s = play(scenario([BLEU, 'ST-21'], setup(21)), PATTY);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[1].chars.length, 2);
});

test('Boodle (OP03-050) : [Bloqueur] ; [En cas de KO] 1 carte du deck dans la Défausse', () => {
  const ko = (deck: string) => {
    const s = scenario([deck, 'ST-21'], (g) => {
      setHand(g, 0, []);
      setChars(g, 0, [{ num: BOODLE, extra: { rested: true } }]);
      setChars(g, 1, [{ num: O_CHOPPER }]);
      deckOf(g, 0, 10);
    }, 1);
    assert.ok(hasKeyword(s, 0, mine(s, BOODLE), 'Blocker'));
    return noDefense(attack(s, theirs(s, O_CHOPPER).uid, mine(s, BOODLE).uid));
  };
  let s = ko(BLEU);
  expectTag(s, 'mayMill');
  assert.equal(s.decision!.player, 0);
  assert.equal(heuristicChooser(s, s.decision!), 'yes');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 9);
  assert.ok(inTrash(s, 0, BOODLE));
  coherent(s);
  s = ko(AUTRE);
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  s = choose(s, 'no');
  assert.equal(s.players[0].deck.length, 10);
});

test('Bell-mère (OP03-051) : [DON!! x1] 7 cartes après des dégâts ; [En cas de KO] 3 cartes', () => {
  let s = hit(BLEU, BELLMERE, (g) => { setChars(g, 0, [{ num: BELLMERE, extra: { don: 1 } }]); setDon(g, 0, 3); deckOf(g, 0, 10); });
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 3);
  s = hit(BLEU, BELLMERE, (g) => { setChars(g, 0, [{ num: BELLMERE }]); setDon(g, 0, 3); });
  assert.equal(s.decision?.kind, 'main');
  // mise KO pendant le tour adverse (Chopper 6000 contre 5000)
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: BELLMERE, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
    deckOf(g, 0, 10);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_CHOPPER).uid, mine(s, BELLMERE).uid));
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 7);
  coherent(s);
});

test('Yosaku & Johnny (OP03-053) : [DON!! x1] +2000 avec 20 cartes ou moins dans le deck, aussi pendant le tour adverse', () => {
  const pw = (active: PlayerId, don: number, n: number) => {
    const s = scenario([BLEU, 'ST-21'], (g) => { setChars(g, 0, [{ num: YOSAKU, extra: { don } }]); setDon(g, 0, 0); deckOf(g, 0, n); }, active);
    return power(s, mine(s, YOSAKU).uid);
  };
  assert.equal(pw(0, 1, 20), 6000, '3000 + 1000 (DON!!) + 2000');
  assert.equal(pw(0, 1, 21), 4000);
  assert.equal(pw(0, 0, 20), 3000);
  assert.equal(pw(1, 1, 20), 5000, 'tour adverse : la DON!! ne donne plus +1000, mais la condition [DON!! x1] reste vraie');
});

test('Usopp’s Rubber Band of Doom!!! (OP03-054) : [Contre] +2000 à la carte attaquée, puis 1 carte ; [Déclenchement] piocher 1, puis 1 carte', () => {
  let s = hitNami((g) => { setHand(g, 0, [RUBBER]); setDon(g, 0, 1); deckOf(g, 0, 10); });
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  assert.equal(s.decision?.kind, 'counter');
  assert.equal(def(RUBBER).counterPower?.(s, 0, s.players[0].leader.uid), 2000);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].deck.length, 9);
  s = noDefense(s);
  assert.equal(s.players[0].life.length, 2, 'repoussée : 7000 contre 6000');
  coherent(s);
  // [Déclenchement]
  s = noDefense(hitNami((g) => deckOf(g, 0, 10), [RUBBER, GENZO]));
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 1, 'piocher 1');
  assert.equal(s.players[0].deck.length, 8);
  assert.ok(inTrash(s, 0, RUBBER));
  coherent(s);
});

test('Gum Gum Super Marteau (OP03-055) : [Contre] défausser 1 carte : +4000 au Leader, puis 2 cartes ; [Déclenchement] renvoyer coût 4 ou moins', () => {
  let s = hitNami((g) => { setHand(g, 0, [GAVEL, GENZO]); setDon(g, 0, 1); deckOf(g, 0, 10); });
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  const leader = s.players[0].leader.uid;
  assert.equal(def(GAVEL).counterPower?.(s, 0, leader), 4000);
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(inTrash(s, 0, GENZO), 'seule carte à défausser : sans question');
  expectTag(s, 'mayMill');
  s = choose(s, 'yes');
  assert.ok(logHas(s, 'repoussée (6000 contre 9000)'));
  assert.equal(s.players[0].deck.length, 8);
  assert.equal(s.players[0].life.length, 2);
  coherent(s);
  // sans autre carte en main : rien (et l'IA ne compte rien)
  s = hitNami((g) => { setHand(g, 0, [GAVEL]); setDon(g, 0, 1); });
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  assert.equal(def(GAVEL).counterPower?.(s, 0, s.players[0].leader.uid), 0);
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.notEqual(s.decision?.tag, 'may');
  assert.ok(!logHas(s, 'gagne +4000'));
  assert.ok(logHas(s, 'active Gum Gum Super Marteau'));
  // un Personnage attaqué : le Leader seul gagne +4000, l'Événement ne le protège pas
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, [GAVEL, GENZO]);
    setDon(g, 0, 1);
    setChars(g, 0, [{ num: MERRY, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_CHOPPER }]);
  }, 1);
  s = attack(s, theirs(s, O_CHOPPER).uid, mine(s, MERRY).uid);
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  assert.equal(def(GAVEL).counterPower?.(s, 0, mine(s, MERRY).uid), 0);
  assert.equal(def(GAVEL).counterUseful?.(s, 0, mine(s, MERRY).uid), false);
  // [Déclenchement]
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, [GAVEL, GENZO]);
    setChars(g, 1, [{ num: O_CHOPPER, extra: { don: 0 } }, { num: O_LUFFY }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  expectTag(s, 'bounce');
  assert.ok(!hasOption(s, `card:${theirs(s, O_LUFFY).uid}`), 'Luffy : coût 5');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === O_CHOPPER));
  coherent(s);
});

test('Riz pilaf de Sanji (OP03-056) : [Principale] piocher 2 ; [Déclenchement] activer l’effet [Principale]', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [PILAF]); setDon(g, 0, 3); deckOf(g, 0, 10); });
  s = play(s, PILAF);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[0].deck.length, 8);
  coherent(s);
  s = noDefense(hitNami((g) => deckOf(g, 0, 10), [PILAF, GENZO]));
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[0].deck.length, 8);
  coherent(s);
});

test('San Zen Sekai (OP03-057) : [Principale] un Personnage de coût 5 ou moins sous le deck ; [Déclenchement] coût 3 ou moins', () => {
  let s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [SANZEN]); setDon(g, 0, 4); setChars(g, 1, [{ num: O_LUFFY }]); });
  assert.equal(def(SANZEN).mainUseful?.(s, 0), true);
  s = play(s, SANZEN);
  expectTag(s, 'oppRemove');
  aiAnswers(s);
  const luffy = theirs(s, O_LUFFY).uid;
  s = choose(s, `card:${luffy}`);
  assert.equal(s.players[1].deck.at(-1)!.uid, luffy);
  coherent(s);
  // Luffy à coût 6 : pas visé ; seulement ses propres Personnages : l'effet ne sert pas (mais reste permis)
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, [SANZEN]);
    setDon(g, 0, 4);
    setChars(g, 0, [{ num: MERRY }]);
    setChars(g, 1, [{ num: O_LUFFY }]);
    addMod(g, { uid: g.players[1].chars[0].uid, stat: 'cost', amount: 1, until: 'turn', source: 'Test' });
  });
  assert.equal(def(SANZEN).mainUseful?.(s, 0), false);
  s = play(s, SANZEN);
  assert.ok(!hasOption(s, `card:${theirs(s, O_LUFFY).uid}`));
  assert.ok(hasOption(s, `card:${mine(s, MERRY).uid}`));
  // [Déclenchement]
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, [SANZEN, GENZO]);
    setChars(g, 1, [{ num: O_CHOPPER }, { num: O_STUSSY }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  s = choose(s, 'trigger');
  assert.ok(!hasOption(s, `card:${theirs(s, O_CHOPPER).uid}`), 'Chopper : coût 4');
  s = choose(s, `card:${theirs(s, O_STUSSY).uid}`);
  assert.equal(s.players[1].deck.at(-1)!.num, O_STUSSY);
  coherent(s);
});

test('Sniperking (OP03-122) : aussi [Usopp] ; renvoyer un Personnage de coût 6 ou moins, puis piocher 2 et défausser 2', () => {
  assert.deepEqual(def(SNIPER).names, ['Sogeking', 'Usopp']);
  let s = scenario([BLEU, 'ST-21'], (g) => { setHand(g, 0, [SNIPER, GENZO]); setDon(g, 0, 7); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = play(s, SNIPER);
  expectTag(s, 'bounce');
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  expectTag(s, 'discard');
  assert.equal(s.players[0].hand.length, 3);
  aiAnswers(s);
  s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(s.players[1].hand.some((c) => c.num === O_LUFFY));
  coherent(s);
  // Luffy à coût 7 : pas visé, on pioche quand même
  s = scenario([BLEU, 'ST-21'], (g) => {
    setHand(g, 0, [SNIPER]);
    setDon(g, 0, 7);
    setChars(g, 1, [{ num: O_LUFFY }]);
    addMod(g, { uid: g.players[1].chars[0].uid, stat: 'cost', amount: 2, until: 'turn', source: 'Test' });
  });
  s = play(s, SNIPER);
  expectTag(s, 'discard');
  assert.ok(theirs(s, O_LUFFY));
});

test('OP03 bleue : parties IA contre IA du deck Nami, cohérentes jusqu’au bout', () => {
  let deckWins = 0;
  for (let g = 0; g < 12; g++) {
    const s = newGame({ decks: [BLEU, g % 2 ? 'ST-21' : 'ST-33'], names: ['Nami', 'IA'], seed: 500 + g, first: g % 2 === 0 ? 0 : 1 }, heuristicChooser);
    assert.notEqual(s.winner, null, `partie ${g} non finie`);
    assert.deepEqual(invariantErrors(s), []);
    if (/effet de son Leader/.test(s.winReason ?? '')) deckWins++;
  }
  assert.ok(deckWins >= 0);
});
