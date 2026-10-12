// Nico Robin du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { uselessReason } from '../ai/prune.ts';
import { CARDS } from '../engine/cards/index.ts';
import { act } from '../engine/engine.ts';
import { fieldCost, hasBlocker, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand,
  setLife, take,
} from './helpers.ts';

const META = 'META-ROBIN-2026-10';
const BORSALINO = 'EB04-058';
const DOUBLEFINGER = 'OP05-073';
const GIGANT = 'OP09-078';
const TEACH = 'OP16-119';
const YAMATO = 'OP17-074';
const OVEN = 'OP17-102';
const SMOOTHIE = 'OP17-106';
const DAIFUKU = 'OP17-107';      // 4000, [Déclenchement] « jouez cette carte », sans effet
const PUDDING = 'OP17-109';
const PEROSPERO = 'OP17-110';
const LINLIN = 'OP17-112';
const STREUSEN = 'OP17-113';
const GENERALS = 'OP17-114';
const BRULEE = 'ST34-003';
// adversaires
const OPP_ZORO = 'OP14-015';     // ST-31 : coût 7, 8000
const OPP_ROBIN = 'OP11-009';    // ST-31 : coût 3, 4000
const OPP_NAMI = 'OP01-016';     // ST-31 : coût 1, 2000
const SAURO = 'OP17-089';        // Sabo du méta : +12 de coût
const LOKI = 'OP17-119';         // Sabo du méta : 8000, +12 de coût

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const optionUids = (s: GameState) => s.decision!.options.map((o) => o.uid ?? o.id);
const optionNums = (s: GameState) => s.decision!.options.map((o) => o.num ?? o.id);
const toTrash = (g: GameState, p: PlayerId, nums: string[]) => g.players[p].trash.push(...nums.map((n) => take(g, p, n)));
// L'adversaire (joueur 1) attaque mon Leader ; je n'ai rien en main pour contrer
const attackMyLeader = (s: GameState, attacker: string) => attack(s, theirs(s, attacker).uid, s.players[0].leader.uid);

test('Leader Nico Robin : [Exil] ; en attaquant, défausser une carte à [Déclenchement] pour 1 DON!! épuisée ; texte VF réparé', () => {
  assert.equal(CARDS['OP09-062'].trigger, null, 'pas de [Déclenchement] (erreur de la liste officielle VF)');
  assert.ok(CARDS['OP09-062'].effect.includes('ayant [Déclenchement] : Ajoutez'));
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [DAIFUKU, YAMATO]);
    setHand(g, 1, []);
    setDon(g, 0, 2);
  });
  const leader = s.players[0].leader;
  assert.ok(hasKeyword(s, 0, leader, 'Banish'));
  const oppLife = s.players[1].life.length;
  const oppTrash = s.players[1].trash.length;
  s = attack(s, leader.uid, s.players[1].leader.uid);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(s.players[0].trash.some((c) => c.num === DAIFUKU), 'Daifuku défaussé (Yamato n’a pas de [Déclenchement])');
  assert.equal(s.players[0].donRested, 1);
  assert.equal(s.players[0].donDeck, 7);
  assert.equal(s.players[1].life.length, oppLife - 1);
  assert.equal(s.players[1].trash.length, oppTrash + 1, '[Exil] : la carte de Vie va dans la Défausse');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [YAMATO]);
    setHand(g, 1, []);
    setDon(g, 0, 2);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'may', 'aucune carte à [Déclenchement] en main');
  assert.equal(s.players[0].donDeck, 8);
});

test('Yamato : 1 DON!! épuisée du deck DON!! ; Borsalino : une Vie de plus seulement à 2 Vies ou moins', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [YAMATO, BORSALINO]);
    setDon(g, 0, 8);
  });
  s = play(s, YAMATO);
  assert.equal(s.players[0].donRested, 4, '3 payées + 1 ajoutée');
  s = play(s, BORSALINO);
  assert.equal(s.players[0].life.length, 4, '4 Vies : rien');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [BORSALINO]);
    setLife(g, 0, [DAIFUKU, DAIFUKU]);
    setDon(g, 0, 10);
  });
  s = play(s, BORSALINO);
  assert.equal(s.players[0].life.length, 3);
  assert.ok(hasBlocker(s, 0, mine(s, BORSALINO)));
  coherent(s);
});

test('Streusen : 3 cartes du dessus, 1 carte {Équipage de Big Mom}', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [STREUSEN]);
    setDon(g, 0, 3);
    setDeckTop(g, 0, [YAMATO, OVEN, TEACH]);
  });
  s = play(s, STREUSEN);
  expectTag(s, 'pick');
  assert.deepEqual(optionNums(s).sort(), [OVEN, 'none'].sort(), 'Yamato et Teach ne sont pas {Équipage de Big Mom}');
  s = keepOrder(choose(s, (o) => o.num === OVEN));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [OVEN]);
  coherent(s);
});

test('Charlotte Oven : mise KO, rejoue de la Défausse un Personnage de 4000 ou moins autre que [Charlotte Oven]', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, [{ num: OVEN, extra: { rested: true } }]);
    toTrash(g, 0, [DAIFUKU, LINLIN, OVEN]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, mine(s, OVEN).uid);
  s = choose(s, 'none');  // [En attaquant] de Zoro (−1000) : rien
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label.split(' (')[0]).sort(), ['Aucun', 'Charlotte Daifuku'].sort());
  s = choose(s, /Daifuku/);
  assert.ok(mine(s, DAIFUKU));
  coherent(s);
});

test('Trois généraux sucrés : épuiser 2 DON!! pour piocher, +1 Vie et −3000 à 2 Personnages ; joué par [Déclenchement], rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [GENERALS]);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_ROBIN }, { num: OPP_NAMI }]);
  });
  const life = s.players[0].life.length;
  s = play(s, GENERALS);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'oppPower');
  s = choose(s, `card:${theirs(s, OPP_ZORO).uid}`);
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(power(s, theirs(s, OPP_ZORO).uid), 5000);
  assert.equal(power(s, theirs(s, OPP_ROBIN).uid), 1000);
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].donActive, 2, '6 pour la carte, 2 épuisées pour le coût');
  coherent(s);

  // [Déclenchement] « jouez cette carte » pendant le tour adverse : [Votre tour] [Jouée] ne fait rien
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [GENERALS, DAIFUKU]);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attackMyLeader(s, OPP_ZORO);
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  assert.ok(mine(s, GENERALS));
  assert.notEqual(s.decision?.tag, 'may');
  assert.equal(s.players[0].life.length, 1);
  coherent(s);
});

test('Miss Doublefinger : défausser 1 carte pour 1 DON!! ; [Déclenchement] DON!! −1 pour se jouer, sans DON!! rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [DOUBLEFINGER, YAMATO]);
    setDon(g, 0, 4);
  });
  s = play(s, DOUBLEFINGER);
  s = choose(s, 'yes');
  assert.equal(s.players[0].donRested, 5);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);

  const setup = (don: number) => (g: GameState) => {
    setHand(g, 0, []);
    setLife(g, 0, [DOUBLEFINGER, DAIFUKU]);
    setDon(g, 0, 0, don);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  };
  s = attackMyLeader(scenario([META, 'ST-31'], setup(3), 1), OPP_ZORO);
  s = choose(s, 'trigger');
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.ok(mine(s, DOUBLEFINGER));
  assert.equal(s.players[0].donRested, 2, 'DON!! −1');
  coherent(s);
  s = attackMyLeader(scenario([META, 'ST-31'], setup(0), 1), OPP_ZORO);
  s = choose(s, 'trigger');
  assert.equal(s.players[0].chars.length, 0);
  assert.ok(s.players[0].trash.some((c) => c.num === DOUBLEFINGER));
});

test('Charlotte Pudding : défausser une carte à [Déclenchement] pour piocher 3 ; [Déclenchement] 5 cartes, 1 {Équipage de Big Mom}', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PUDDING, DAIFUKU]);
    setDon(g, 0, 3);
  });
  s = play(s, PUDDING);
  s = choose(s, 'yes');
  assert.equal(s.players[0].hand.length, 3);
  coherent(s);
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PUDDING, YAMATO]);
    setDon(g, 0, 3);
  });
  s = play(s, PUDDING);
  assert.equal(s.decision?.kind, 'main', 'pas de carte à [Déclenchement] à défausser');

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [PUDDING, DAIFUKU]);
    setDeckTop(g, 0, [YAMATO, TEACH, LINLIN, BORSALINO, DOUBLEFINGER]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attackMyLeader(s, OPP_ZORO);
  s = choose(s, 'trigger');
  expectTag(s, 'pick');
  assert.deepEqual(optionNums(s).sort(), [LINLIN, 'none'].sort());
  s = keepOrder(choose(s, (o) => o.num === LINLIN));
  assert.ok(s.players[0].hand.some((c) => c.num === LINLIN));
  coherent(s);
});

test('Charlotte Smoothie : épuiser 2 DON!! pour +1 Vie, puis l’adversaire défausse 1 carte', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SMOOTHIE]);
    setHand(g, 1, [OPP_NAMI, OPP_ROBIN]);
    setDon(g, 0, 10);
  });
  const life = s.players[0].life.length;
  s = play(s, SMOOTHIE);
  s = choose(s, 'yes');
  expectTag(s, 'discard');
  assert.equal(s.decision!.player, 1);
  s = choose(s, 'card');
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[1].hand.length, 1);
  coherent(s);
});

test('Charlotte Slurp (Perospero) : joue un {Équipage de Big Mom} de coût 6 ou moins de la main, puis gagne [Initiative]', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PEROSPERO, GENERALS, LINLIN]);
    setDon(g, 0, 8);
  });
  s = play(s, PEROSPERO);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label.split(' (')[0]).sort(), ['Aucun', 'Trois généraux sucrés'].sort(), 'Linlin coûte 10');
  s = choose(s, /généraux/);
  // [Jouée] des Trois généraux : 1 DON!! redressée seulement, pas assez pour leur coût
  assert.ok(mine(s, GENERALS));
  assert.ok(hasOption(s, `attack:${mine(s, PEROSPERO).uid}`), '[Initiative]');
  assert.equal(hasOption(s, `attack:${mine(s, GENERALS).uid}`), false, 'le Personnage joué n’a pas [Initiative]');
  coherent(s);
});

test('Marshall D. Teach : 3 cartes du dessus, 1 au-dessus de la Vie ; [Déclenchement] annule les effets d’un Personnage puis KO coût 5', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [TEACH]);
    setDon(g, 0, 10);
    setDeckTop(g, 0, [YAMATO, DAIFUKU, BORSALINO]);
  });
  const life = s.players[0].life.length;
  s = play(s, TEACH);
  expectTag(s, 'lookToLife');
  s = keepOrder(choose(s, (o) => o.num === DAIFUKU));
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[0].life[0].num, DAIFUKU);
  assert.deepEqual(s.players[0].deck.slice(-2).map((c) => c.num).sort(), [BORSALINO, YAMATO].sort());
  assert.ok(s.log.some((l) => l.only === 0 && l.text.includes('Charlotte Daifuku')), 'le joueur sait quelle carte il a placée');
  assert.equal(s.log.some((l) => l.only === undefined && l.text.includes('Charlotte Daifuku')), false, 'l’adversaire non');
  coherent(s);

  // Haguar D. Sauro (+12) perd ses effets : coût 4, mis KO
  s = scenario([META, 'META-SABO-2026-10'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [TEACH, DAIFUKU]);
    setChars(g, 1, [{ num: LOKI }, { num: SAURO }]);
  }, 1);
  s = attackMyLeader(s, LOKI);
  s = choose(s, 'trigger');
  expectTag(s, 'oppLock');
  assert.equal(fieldCost(s, theirs(s, SAURO).uid), 16);
  s = choose(s, `card:${theirs(s, SAURO).uid}`);
  assert.equal(fieldCost(s, theirs(s, SAURO).uid), 4, 'effets annulés : +12 de coût perdu');
  assert.equal(fieldCost(s, theirs(s, LOKI).uid), 18);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${theirs(s, SAURO).uid}`);
  assert.equal(theirs(s, SAURO), undefined);
  assert.ok(logHas(s, 'a ses effets annulés'));
  coherent(s);
});

test('Charlotte Linlin : ses Personnages à 4000 avec [Déclenchement] passent à 8000 pendant son tour (sans cumul) ; pioche puis choix', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: LINLIN }, { num: LINLIN }, { num: DAIFUKU }, { num: YAMATO }, { num: BRULEE }]);
  });
  assert.equal(power(s, mine(s, DAIFUKU).uid), 8000);
  assert.equal(power(s, mine(s, YAMATO).uid), 1000, 'Yamato : 1000, sans [Déclenchement]');
  assert.equal(power(s, mine(s, BRULEE).uid), 2000);
  s.active = 1;
  assert.equal(power(s, mine(s, DAIFUKU).uid), 4000, 'tour adverse');

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [LINLIN]);
    setHand(g, 1, []);
    setDon(g, 0, 10);
  });
  const oppLife = s.players[1].life.length;
  s = play(s, LINLIN);
  expectTag(s, 'chooseOne');
  s = choose(s, 'choice:1');
  assert.equal(s.players[1].life.length, oppLife - 1);
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(s.players[0].hand.length, 1, 'pioche 1');
  coherent(s);
});

test('Gum Gum Gigant : DON!! −2 et défausser 1 carte : +4000 avec un Leader Chapeau de paille, puis pioche 2 ; inutile sans carte à défausser', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [GIGANT, YAMATO]);
    setLife(g, 0, [DAIFUKU, DAIFUKU]);
    setDon(g, 0, 1, 4);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attackMyLeader(s, OPP_ZORO);
  s = choose(s, 'cevent');
  expectTag(s, 'may');
  s = choose(s, 'yes');
  assert.equal(s.players[0].life.length, 2, '5000 + 4000 contre 8000');
  assert.equal(s.players[0].donDeck, 7, '2 DON!! renvoyées');
  assert.ok(s.players[0].trash.some((c) => c.num === YAMATO));
  assert.equal(s.players[0].hand.length, 2);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [GIGANT]);
    setDon(g, 0, 1, 4);
    setChars(g, 1, [{ num: OPP_ZORO }]);
  }, 1);
  s = attackMyLeader(s, OPP_ZORO);
  const cevent = s.decision!.options.find((o) => o.id.startsWith('cevent:'))!;
  assert.ok(uselessReason(s, s.decision!, cevent), 'aucune carte à défausser');
});

test('Annuler les effets : plus de [Bloqueur] ni d’effet « quand ... » pour le tour, ce que donnent les autres cartes reste', () => {
  let s = scenario([META, 'META-SABO-2026-10'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [TEACH, DAIFUKU]);
    setChars(g, 1, [{ num: LOKI }, { num: SAURO }, { num: 'OP17-083' }]);  // Jinbe : [Bloqueur] avec un coût 12 en jeu
  }, 1);
  const jinbe = () => theirs(s, 'OP17-083');
  assert.ok(hasBlocker(s, 1, jinbe()));
  s = attackMyLeader(s, LOKI);
  s = choose(s, 'trigger');
  s = choose(s, `card:${jinbe().uid}`);
  assert.equal(hasBlocker(s, 1, jinbe()), false);
  assert.equal(power(s, jinbe().uid), 2000, 'plus de +3000');
  s = choose(s, 'none');
  // fin du tour : les effets reviennent
  s = act(s, 'end');
  assert.equal(s.active, 0);
  assert.ok(hasBlocker(s, 1, jinbe()));
  coherent(s);
});
