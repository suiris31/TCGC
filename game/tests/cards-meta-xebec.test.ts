// Rocks D. Xebec du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from '../engine/engine.ts';
import { attackTargets, hasKeyword, hasMod, knows, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const META = 'META-XEBEC-2026-10';
const DREAM = 'EB02-030';       // « Quand les rêves de ses camarades ont été bafoués !! »
const BUCKIN = 'OP08-051';      // {Former Rocks Pirates}, Contre +1000
const NEWGATE = 'OP17-040';
const WANG = 'OP17-041';
const KAIDO = 'OP17-042';
const JOHN = 'OP17-044';
const KYO = 'OP17-045';
const GLORIOSA = 'OP17-046';
const SHIKI = 'OP17-048';
const LINLIN = 'OP17-049';
const STUSSY = 'OP17-054';
const AUTHORITY = 'OP17-055';   // « Aucun pouvoir n'est éternel !! »
const ROCKS = 'OP17-056';       // « Équipage de Rocks »
const XEBEC = 'OP17-118';
// adversaire ST-31
const OPP_ZORO = 'OP14-015';    // coût 7, 8000 ; [En attaquant] −1000 à un Personnage adverse
const OPP_ROBIN = 'OP11-009';   // coût 3, 4000
const OPP_NAMI = 'OP01-016';    // coût 1
const OPP_LUFFY1 = 'ST23-004';  // coût 1
const OPP_LUFFY7 = 'ST31-004';  // coût 7, 9000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const optionUids = (s: GameState) => s.decision!.options.map((o) => o.uid ?? o.id);
// l'[En attaquant] de Zoro (−1000 à un de mes Personnages) : rien
const skipZoro = (s: GameState) => (s.decision?.player === 1 && s.decision.tag === 'oppPower' ? choose(s, 'none') : s);

test('Leader Rocks D. Xebec : en attaquant, défausser 1 carte, révéler le dessus du deck, piocher 2 si « Équipage de Rocks »', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [WANG, KYO]);
    setHand(g, 1, []);
    setDeckTop(g, 0, [BUCKIN, JOHN]);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  s = choose(s, (o) => o.uid !== undefined && s.players[0].hand.find((c) => c.uid === o.uid)?.num === WANG);
  assert.deepEqual(s.players[0].hand.map((c) => c.num).sort(), [BUCKIN, JOHN, KYO].sort(), 'Buckin {Anciens de Rocks} : type incluant « Équipage de Rocks »');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KYO]);
    setHand(g, 1, []);
    setDeckTop(g, 0, [DREAM]);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 0, 'pas de pioche');
  assert.equal(s.players[0].deck[0].num, DREAM, 'la carte révélée reste au-dessus');
  assert.ok(knows(s, 1, s.players[0].deck[0].uid), 'l’adversaire la connaît');
});

test('« Quand les rêves... » : [Contre] pour le tour, défausser 1 carte au lieu d’un KO en combat ; [Déclenchement] pioche 1', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [DREAM, BUCKIN]);
    setChars(g, 0, [{ num: KYO, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
    setDon(g, 0, 2);
  }, 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, mine(s, KYO).uid));
  s = choose(s, 'cevent');
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  expectTag(s, 'koGuard');
  s = choose(s, 'yes');
  assert.ok(mine(s, KYO), 'Kyo sauvé');
  assert.ok(s.players[0].trash.some((c) => c.num === BUCKIN));
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [DREAM, KYO]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid);
  s = choose(s, 'trigger');
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
});

test('Edward Newgate : quand son Leader est attaqué, défausser 1 carte pour +3000 ; une fois par tour', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KYO, BUCKIN]);
    setChars(g, 0, [{ num: NEWGATE }]);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_LUFFY7 }]);
  }, 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  s = choose(s, 'card');
  assert.equal(power(s, s.players[0].leader.uid), 8000);
  // la suite du combat : pas de Contre, l'attaque est repoussée (8000 contre 8000 : touche)
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  s = attack(s, theirs(s, OPP_LUFFY7).uid, s.players[0].leader.uid);
  assert.notEqual(s.decision?.tag, 'may', 'déjà utilisé ce tour');
});

test('Wang Zhi : défausser 1 carte : tous les Personnages adverses de coût de base 1 sous le deck, ordre au choix de l’adversaire', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [WANG, KYO]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: OPP_NAMI }, { num: OPP_LUFFY1 }, { num: OPP_ROBIN }]);
  });
  s = play(s, WANG);
  s = choose(s, 'yes');
  expectTag(s, 'bottomOrder');
  assert.equal(s.decision!.player, 1);
  s = choose(s, `card:${theirs(s, OPP_LUFFY1).uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [OPP_ROBIN]);
  assert.deepEqual(s.players[1].deck.slice(-2).map((c) => c.num), [OPP_LUFFY1, OPP_NAMI], 'Luffy plus haut, Nami tout en bas');
  coherent(s);
});

test('Kaido : révéler 3 cartes « Équipage de Rocks » pour −3000 ; avec 2 seulement, rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KAIDO, KYO, JOHN, BUCKIN]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
  });
  s = play(s, KAIDO);
  s = choose(s, 'yes');
  expectTag(s, 'revealCost');
  s = choose(s, 'card');
  s = choose(s, 'card');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(power(s, theirs(s, OPP_ROBIN).uid), 1000);
  assert.ok(s.players[0].hand.every((c) => knows(s, 1, c.uid)), 'les 3 cartes révélées sont connues de l’adversaire');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KAIDO, KYO, DREAM]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
  });
  s = play(s, KAIDO);
  assert.equal(s.decision?.kind, 'main');
});

test('Captain John : épuisé, l’adversaire ne peut attaquer que lui ; s’épuiser pour piocher 1 et défausser 1', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: JOHN, extra: { rested: true } }, { num: KYO, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  assert.deepEqual(attackTargets(s, 1, theirs(s, OPP_ZORO)), [mine(s, JOHN).uid]);
  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: JOHN }, { num: KYO, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  assert.deepEqual(attackTargets(s, 1, theirs(s, OPP_ZORO)).sort(), [s.players[0].leader.uid, mine(s, KYO).uid].sort(), 'redressé : rien');

  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: JOHN }]);
    setHand(g, 0, [KYO]);
  });
  s = act(s, `act:${mine(s, JOHN).uid}`);
  expectTag(s, 'discard');
  s = choose(s, 'card');
  assert.ok(mine(s, JOHN).rested);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
});

test('Kyo : un de ses Personnages qui devait quitter le terrain par un effet adverse reste, contre 2 cartes défaussées', () => {
  let s = scenario([META, 'ST-35'], (g) => {
    setChars(g, 0, [{ num: BUCKIN }, { num: KYO }]);
    setHand(g, 0, [JOHN, WANG]);
    setHand(g, 1, ['ST35-001']);
    setDon(g, 1, 10);
  }, 1);
  s = play(s, 'ST35-001', 1);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${mine(s, BUCKIN).uid}`);
  expectTag(s, 'replace');
  s = choose(s, 'replace');
  expectTag(s, 'discard');
  s = choose(s, 'card');
  assert.ok(mine(s, BUCKIN), 'Buckin reste');
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('Gloriosa : un Personnage de coût 5 ou moins (des deux côtés) au-dessous du deck de son propriétaire', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [GLORIOSA]);
    setDon(g, 0, 4);
    setChars(g, 0, [{ num: KYO }]);
    setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_LUFFY7 }]);
  });
  s = play(s, GLORIOSA);
  assert.deepEqual(optionUids(s).sort(), [mine(s, KYO).uid, mine(s, GLORIOSA).uid, theirs(s, OPP_ROBIN).uid, 'none'].sort(), 'Luffy coûte 7 ; Gloriosa elle-même comprise');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(s.players[1].deck.at(-1)!.num, OPP_ROBIN);
  coherent(s);
});

test('Shiki : [Attaque adverse] défausser une carte « Équipage de Rocks » pour −3000 ; une fois par tour (avec [En attaquant])', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KYO, DREAM]);
    setChars(g, 0, [{ num: SHIKI }]);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_LUFFY7 }]);
  }, 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(s.players[0].trash.some((c) => c.num === KYO), 'seule carte « Équipage de Rocks » de la main');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ZORO).uid}`);
  assert.equal(power(s, theirs(s, OPP_ZORO).uid), 5000);
  assert.ok(mine(s, SHIKI).usedOpt.includes('shiki'));
  assert.ok(hasKeyword(s, 0, mine(s, SHIKI), 'Rush: Character'));
});

test('Charlotte Linlin (bleue) : l’adversaire choisit : elle pioche 2 ou il défausse 2 ; [Attaque adverse] +1000', () => {
  const setup = (g: GameState) => {
    setHand(g, 0, [LINLIN]);
    setHand(g, 1, [OPP_NAMI, OPP_ROBIN, OPP_ZORO]);
    setDon(g, 0, 5);
  };
  let s = play(scenario([META, 'ST-31'], setup), LINLIN);
  expectTag(s, 'oppChoice');
  assert.equal(s.decision!.player, 1);
  s = choose(s, 'choice:0');
  assert.equal(s.players[0].hand.length, 2);
  s = play(scenario([META, 'ST-31'], setup), LINLIN);
  s = choose(s, 'choice:1');
  s = choose(s, 'card');
  s = choose(s, 'card');
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [KYO]);
    setChars(g, 0, [{ num: LINLIN }]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  s = choose(s, 'yes');
  expectTag(s, 'ownPower');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.ok(logHas(s, 'gagne +1000 de puissance pour le combat (Charlotte Linlin)'));
});

test('Miss Buckingham Stussy : un Personnage adverse de coût de base 6 ou moins ne peut plus attaquer ; activation sans limite de coût', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [STUSSY]);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_LUFFY7 }]);
  });
  s = play(s, STUSSY);
  assert.deepEqual(optionUids(s).sort(), [theirs(s, OPP_ROBIN).uid, 'none'].sort());
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(hasMod(s, theirs(s, OPP_ROBIN).uid, 'cantAttack'));
  s = act(s, `act:${mine(s, STUSSY).uid}`);
  s = choose(s, `card:${theirs(s, OPP_LUFFY7).uid}`);
  assert.ok(hasMod(s, theirs(s, OPP_LUFFY7).uid, 'cantAttack'));
  assert.ok(mine(s, STUSSY).rested);
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
});

test('« Aucun pouvoir n’est éternel !! » : [Imblocable] à Xebec ; « Équipage de Rocks » : renvoyer un coût 6 ; leurs [Contre]', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [AUTHORITY, ROCKS]);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_LUFFY7 }]);
  });
  s = play(s, AUTHORITY);
  s = choose(s, 'yes');
  expectTag(s, 'ownGrant');
  s = choose(s, `card:${s.players[0].leader.uid}`);
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Unblockable'), 'le Leader s’appelle Rocks D. Xebec');
  s = play(s, ROCKS);
  s = choose(s, 'yes');
  expectTag(s, 'bounce');
  assert.equal(s.decision!.options.some((o) => o.uid === theirs(s, OPP_LUFFY7).uid), false, 'Luffy coûte 7');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(s.players[1].hand.some((c) => c.num === OPP_ROBIN));
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [AUTHORITY]);
    setLife(g, 0, [KYO, KYO]);
    setChars(g, 1, [{ num: OPP_ROBIN }]);
  }, 1);
  s = attack(s, theirs(s, OPP_ROBIN).uid, s.players[0].leader.uid);
  // 4000 contre 5000 : l'attaque échoue déjà ; [Contre] gratuit (coût 0)
  assert.ok(hasOption(s, 'cevent'));
});

test('Rocks D. Xebec (Personnage) : Contre +2000 en main si aucun de ses Personnages n’a de Contre ; joue 2 cartes de noms différents (coût 9)', () => {
  const setup = (chars: string[]) => (g: GameState) => {
    setHand(g, 0, [XEBEC]);
    setChars(g, 0, chars.map((num) => ({ num })));
    setChars(g, 1, [{ num: OPP_ZORO }]);
  };
  let s = scenario([META, 'ST-31'], setup([KYO]), 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  assert.ok(s.decision!.options.some((o) => o.label.startsWith('Contre +2000')), 'Kyo n’a pas de Contre');
  s = scenario([META, 'ST-31'], setup([BUCKIN]), 1);
  s = skipZoro(attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid));
  assert.equal(s.decision?.kind === 'counter' && s.decision.options.some((o) => o.id.startsWith('counter:')), false, 'Buckin a un Contre');

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [XEBEC, NEWGATE, KYO, JOHN]);
    setDon(g, 0, 10);
  });
  s = play(s, XEBEC);
  expectTag(s, 'playFree');
  s = choose(s, (o) => o.num === NEWGATE);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KYO, 'none'].sort(), 'reste 3 : John (4) trop cher');
  s = choose(s, (o) => o.num === KYO);
  assert.ok(mine(s, NEWGATE) && mine(s, KYO));
  coherent(s);
});
