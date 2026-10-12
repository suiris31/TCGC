// Mihawk du méta (octobre 2026) : un test par carte nouvelle, condition vraie et condition fausse
import assert from 'node:assert/strict';
import test from 'node:test';
import { uselessReason } from '../ai/prune.ts';
import { act } from '../engine/engine.ts';
import { addMod, hasBlocker, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import {
  attack, choose, coherent, expectTag, hasOption, inHand, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon,
  setHand, setLife, takeField,
} from './helpers.ts';

const META = 'META-MIHAWK-2026-10';
const SAMURAI = 'OP01-055';
const VANDER = 'OP06-033';
const SEKAI = 'OP06-038';
const OTAMA = 'OP07-022';
const LUNA = 'OP08-036';
const KAWAMATSU = 'OP12-023';  // {Hommes-poissons}, coût 5, sans effet
const PERONA = 'OP12-034';
const LAW = 'OP13-031';
const MINABLES = 'OP14-038';   // « Si vous croyez que je me souviens de tous les minables... »
const BARQUE = 'OP14-039';
const SHANKS = 'OP17-022';
const YASOPP = 'OP17-031';
const KINEMON = 'ST32-001';
const ODEN = 'ST32-002';
// adversaire ST-31 (Leader Luffy <Frappe>)
const OPP_ROBIN = 'OP11-009';   // coût 3, 4000
const OPP_NAMI = 'OP01-016';    // coût 1, 2000
const OPP_JINBE = 'ST31-002';   // coût 5, 6000
const OPP_LUFFY = 'ST31-004';   // coût 7, 9000
const OPP_ZORO = 'OP14-015';    // coût 7, 8000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const optionUids = (s: GameState) => s.decision!.options.map((o) => o.uid ?? o.id);
const setStage = (g: GameState, p: PlayerId, num: string) => { g.players[p].stage = takeField(g, p, num); };

test('Leader Mihawk : 6000 face à un Leader <Tranche>, 5000 sinon', () => {
  let s = scenario([META, 'ST-32'], () => {});
  assert.equal(power(s, s.players[0].leader.uid), 6000);
  s = scenario([META, 'ST-31'], () => {});
  assert.equal(power(s, s.players[0].leader.uid), 5000);
});

test('Leader Mihawk : épuiser 1 carte, 3 DON!! redressées avec un Personnage de coût 5 ou plus, puis plus de Personnage joué ; une fois par tour', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: KAWAMATSU }]);
    setHand(g, 0, [OTAMA, BARQUE]);
    setDon(g, 0, 1, 5);
  });
  const leader = s.players[0].leader.uid;
  assert.ok(hasOption(s, `play:${inHand(s, 0, OTAMA)}`));
  s = act(s, `act:${leader}`);
  expectTag(s, 'restCost');
  assert.deepEqual(optionUids(s).sort(), [leader, mine(s, KAWAMATSU).uid, 'don'].sort());
  s = choose(s, 'don');
  assert.equal(s.players[0].donActive, 3, '1 épuisée pour le coût, 3 redressées');
  assert.equal(s.players[0].donRested, 3);
  assert.equal(hasOption(s, `play:${inHand(s, 0, OTAMA)}`), false, 'plus de Personnage ce tour-ci');
  assert.ok(hasOption(s, `play:${inHand(s, 0, BARQUE)}`), 'un Lieu reste permis');
  assert.equal(hasOption(s, `act:${leader}`), false, 'une fois par tour');
  coherent(s);

  // sans Personnage de coût 5 ou plus (d'un côté ou de l'autre) : aucune DON!! redressée, mais plus de Personnage
  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: OTAMA }]);
    setHand(g, 0, [PERONA]);
    setDon(g, 0, 1, 5);
  });
  s = act(s, `act:${s.players[0].leader.uid}`);
  s = choose(s, `card:${mine(s, OTAMA).uid}`);
  assert.equal(s.players[0].donActive, 1);
  assert.ok(mine(s, OTAMA).rested);
  assert.equal(hasOption(s, 'play'), false);
  coherent(s);
});

test('« Acceptez de devenir mes samouraïs !! » : épuiser 2 Personnages (ni le Leader ni les DON!!) pour piocher 2 cartes ; un seul, rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: OTAMA }, { num: KAWAMATSU }, { num: PERONA, extra: { rested: true } }]);
    setHand(g, 0, [SAMURAI]);
    setDon(g, 0, 3);
  });
  s = play(s, SAMURAI);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'restCost');
  assert.deepEqual(optionUids(s).sort(), [mine(s, OTAMA).uid, mine(s, KAWAMATSU).uid].sort());
  s = choose(s, `card:${mine(s, OTAMA).uid}`);
  assert.ok(mine(s, OTAMA).rested && mine(s, KAWAMATSU).rested);
  assert.equal(s.players[0].hand.length, 2);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: OTAMA }]);
    setHand(g, 0, [SAMURAI]);
    setDon(g, 0, 3);
  });
  s = play(s, SAMURAI);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].hand.length, 0);
});

test('Vander Decken IX : défausser 1 carte {Hommes-poissons} pour mettre KO 1 Personnage adverse épuisé ; sans elle, rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [VANDER, KAWAMATSU, OTAMA]);
    setChars(g, 1, [{ num: OPP_ROBIN, extra: { rested: true } }, { num: OPP_NAMI }]);
    setDon(g, 0, 5);
  });
  s = play(s, VANDER);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'oppKo');
  assert.deepEqual(optionUids(s).sort(), [theirs(s, OPP_ROBIN).uid, 'none'].sort(), 'Nami est redressée');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(s.players[0].trash.some((c) => c.num === KAWAMATSU), 'Kawamatsu défaussé (seule carte {Hommes-poissons})');
  assert.deepEqual(s.players[1].chars.map((c) => c.num), [OPP_NAMI]);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [VANDER, OTAMA]);
    setChars(g, 1, [{ num: OPP_ROBIN, extra: { rested: true } }]);
    setDon(g, 0, 5);
  });
  s = play(s, VANDER);
  assert.equal(s.decision?.kind, 'main');
  assert.ok(theirs(s, OPP_ROBIN));
});

test('Ichidai San Zen Dai Sen Sekai : [Contre] +2000, et +2000 de plus avec 8 cartes épuisées (DON!! de la zone de Coût comprises)', () => {
  const setup = (rested: boolean) => (g: GameState) => {
    setHand(g, 0, [SEKAI]);
    setLife(g, 0, [KAWAMATSU, ODEN]);
    setChars(g, 1, [{ num: OPP_ZORO }]);
    if (rested) {
      setDon(g, 0, 1, 6);
      g.players[0].leader.rested = true;
    } else {
      setDon(g, 0, 1);
    }
  };
  // 6 DON!! épuisées + le Leader + la DON!! payée : 8 cartes, 5000 + 4000 contre 8000
  let s = scenario([META, 'ST-31'], setup(true), 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  assert.equal(s.players[0].life.length, 2, 'attaque repoussée');
  assert.ok(logHas(s, '8 cartes épuisées'));
  // 1 carte épuisée : 5000 + 2000 contre 8000
  s = scenario([META, 'ST-31'], setup(false), 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  assert.equal(s.players[0].life.length, 1, 'attaque réussie');
  coherent(s);
});

test('Ichidai San Zen Dai Sen Sekai : [Déclenchement] KO 1 Personnage adverse épuisé de coût 3 ou moins', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, [SEKAI]);
    setChars(g, 1, [{ num: OPP_ZORO }, { num: OPP_ROBIN, extra: { rested: true } }, { num: OPP_NAMI }]);
  }, 1);
  s = attack(s, theirs(s, OPP_ZORO).uid, s.players[0].leader.uid);
  expectTag(s, 'trigger');
  s = choose(s, 'trigger');
  expectTag(s, 'oppKo');
  assert.deepEqual(optionUids(s).sort(), [theirs(s, OPP_ROBIN).uid, 'none'].sort(), 'Zoro (coût 7, épuisé) et Nami (redressée) exclus');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.equal(theirs(s, OPP_ROBIN), undefined);
  coherent(s);
});

test('Otama : 5 cartes du dessus, 1 carte {Pays de Wano} verte autre que [Otama]', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [OTAMA]);
    setDon(g, 0, 3);
    setDeckTop(g, 0, [OTAMA, KINEMON, LAW, SAMURAI, VANDER]);
  });
  s = play(s, OTAMA);
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KINEMON, SAMURAI, 'none'].sort());
  s = keepOrder(choose(s, (o) => o.num === KINEMON));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [KINEMON]);
  coherent(s);
});

test('Electrical Luna : les Personnages adverses épuisés de coût 7 ou moins ne se redressent pas à la prochaine phase de Recharge adverse', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [LUNA]);
    setDon(g, 0, 5);
    const [, , luffy] = setChars(g, 1, [
      { num: OPP_ROBIN, extra: { rested: true } }, { num: OPP_ZORO, extra: { rested: true } }, { num: OPP_LUFFY, extra: { rested: true } },
      { num: OPP_NAMI },
    ]);
    addMod(g, { uid: luffy.uid, stat: 'cost', amount: 1, until: 'turn', source: 'test' });  // coût 8
  });
  s = play(s, LUNA);
  assert.equal(s.decision?.kind, 'main', 'tous, sans question');
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.ok(theirs(s, OPP_ROBIN).rested && theirs(s, OPP_ZORO).rested, 'restent épuisés');
  assert.equal(theirs(s, OPP_LUFFY).rested, false, 'coût 8 : redressé');
  assert.ok(logHas(s, 'reste épuisé (Electrical Luna)'));
  assert.equal(s.mods.some((m) => m.stat === 'noRefresh'), false, 'effet consommé');
  coherent(s);
});

test('Perona (OP12-034) : avec un Leader <Tranche>, 1 carte <Tranche> ou 1 Événement vert parmi 5 ; sinon rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PERONA]);
    setDon(g, 0, 3);
    setDeckTop(g, 0, [LAW, OTAMA, SAMURAI, VANDER, KINEMON]);
  });
  s = play(s, PERONA);
  expectTag(s, 'pick');
  assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [KINEMON, LAW, SAMURAI, 'none'].sort());
  s = keepOrder(choose(s, (o) => o.num === LAW));
  assert.deepEqual(s.players[0].hand.map((c) => c.num), [LAW]);
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [PERONA]);
    setDon(g, 0, 3);
    g.players[0].leader.num = 'ST21-001';  // Leader <Frappe>
  });
  s = play(s, PERONA);
  assert.equal(s.decision?.kind, 'main');
});

test('Trafalgar Law : renvoyer un de ses Personnages en main pour jouer épuisé un Personnage de coût 5 ou moins ; [Bloqueur] à 1 Vie ou moins', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: OTAMA, extra: { rested: true } }]);
    setHand(g, 0, [LAW, ODEN]);
    setDon(g, 0, 10);
  });
  s = play(s, LAW);
  expectTag(s, 'may');
  s = choose(s, 'yes');
  expectTag(s, 'returnOwn');
  assert.deepEqual(optionUids(s).sort(), [mine(s, OTAMA).uid, mine(s, LAW).uid].sort(), 'Law lui-même compris');
  s = choose(s, `card:${mine(s, OTAMA).uid}`);
  expectTag(s, 'playFree');
  assert.deepEqual(s.decision!.options.map((o) => o.label.split(' (')[0]).sort(), ['Aucun', 'Oden Kozuki', 'Otama'].sort());
  s = choose(s, /Oden/);
  assert.ok(mine(s, ODEN).rested, 'joué épuisé');
  assert.ok(s.players[0].hand.some((c) => c.num === OTAMA));
  assert.equal(hasBlocker(s, 0, mine(s, LAW)), false, '5 Vies');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setChars(g, 0, [{ num: LAW }]);
    setLife(g, 0, [KAWAMATSU]);
  });
  assert.equal(hasBlocker(s, 0, mine(s, LAW)), true);
});

test('« Si vous croyez que je me souviens... » : épuiser 2 cartes, piocher 1 et épuiser 1 Personnage de 7000 de base ou moins ; [Contre] Leader +3000', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [MINABLES]);
    setStage(g, 0, BARQUE);
    setDon(g, 0, 3);
    setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_ZORO }]);
  });
  s = play(s, MINABLES);
  s = choose(s, 'yes');
  expectTag(s, 'restCost');
  assert.deepEqual(optionUids(s).sort(), [s.players[0].leader.uid, s.players[0].stage!.uid, 'don'].sort());
  s = choose(s, `card:${s.players[0].stage!.uid}`);
  s = choose(s, 'don');
  expectTag(s, 'oppRest');
  assert.deepEqual(optionUids(s).sort(), [theirs(s, OPP_ROBIN).uid, 'none'].sort(), 'Zoro a 8000 de base');
  s = choose(s, `card:${theirs(s, OPP_ROBIN).uid}`);
  assert.ok(theirs(s, OPP_ROBIN).rested && s.players[0].stage!.rested);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].donActive, 1, '1 payée, 1 épuisée pour le coût');
  coherent(s);

  // [Contre] : 5000 + 3000 contre Jinbe (6000) ; sur un Personnage attaqué, il ne sert à rien
  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [MINABLES]);
    setLife(g, 0, [KAWAMATSU, ODEN]);
    setChars(g, 0, [{ num: OTAMA, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_JINBE }, { num: OPP_ROBIN }]);
    setDon(g, 0, 1);
  }, 1);
  const robinAttack = attack(s, theirs(s, OPP_ROBIN).uid, mine(s, OTAMA).uid);
  const cevent = robinAttack.decision!.options.find((o) => o.id.startsWith('cevent:'))!;
  assert.ok(uselessReason(robinAttack, robinAttack.decision!, cevent));
  s = attack(s, theirs(s, OPP_JINBE).uid, s.players[0].leader.uid);
  s = choose(s, 'cevent');
  assert.equal(s.players[0].life.length, 2, 'attaque repoussée');
});

test('Barque mortuaire : avec le Leader Mihawk, pioche 1 carte en arrivant et redresse 1 DON!! à la fin du tour ; sinon rien', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [BARQUE]);
    setDon(g, 0, 2, 3);
  });
  s = play(s, BARQUE);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].donActive, 1);
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.equal(s.players[0].donActive, 2, '1 DON!! redressée à la fin du tour');
  coherent(s);

  s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [BARQUE]);
    setDon(g, 0, 2, 3);
    g.players[0].leader.num = 'ST21-001';
  });
  s = play(s, BARQUE);
  assert.equal(s.players[0].hand.length, 0);
});

test('Shanks : [Initiative], 2 DON!! redressées, puis tous les Personnages adverses épuisés (sauf ceux qui ne peuvent pas l’être)', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [SHANKS]);
    setDon(g, 0, 10);
    const [, jinbe] = setChars(g, 1, [{ num: OPP_ROBIN }, { num: OPP_JINBE }, { num: OPP_NAMI, extra: { rested: true } }]);
    addMod(g, { uid: jinbe.uid, stat: 'cantRest', amount: 0, until: 'turn', source: 'test' });
  });
  s = play(s, SHANKS);
  assert.equal(s.players[0].donActive, 2);
  assert.ok(theirs(s, OPP_ROBIN).rested && theirs(s, OPP_NAMI).rested);
  assert.equal(theirs(s, OPP_JINBE).rested, false);
  assert.ok(hasOption(s, `attack:${mine(s, SHANKS).uid}`), '[Initiative]');
  coherent(s);
});

test('Yasopp : pioche 1 et épuise 1 Personnage adverse de coût 8 ou moins ; à la fin du tour, redresse 1 Personnage {Équipage du Roux}', () => {
  let s = scenario([META, 'ST-31'], (g) => {
    setHand(g, 0, [YASOPP]);
    setDon(g, 0, 5);
    setChars(g, 0, [{ num: SHANKS, extra: { rested: true } }, { num: OTAMA, extra: { rested: true } }]);
    setChars(g, 1, [{ num: OPP_LUFFY }]);
  });
  s = play(s, YASOPP);
  expectTag(s, 'oppRest');
  s = choose(s, `card:${theirs(s, OPP_LUFFY).uid}`);
  assert.ok(theirs(s, OPP_LUFFY).rested);
  assert.equal(s.players[0].hand.length, 1);
  s = act(s, 'end');
  expectTag(s, 'ownReady');
  assert.deepEqual(optionUids(s).sort(), [mine(s, SHANKS).uid, 'none'].sort(), 'Otama n’est pas {Équipage du Roux}, Yasopp est redressé');
  s = choose(s, `card:${mine(s, SHANKS).uid}`);
  assert.equal(mine(s, SHANKS).rested, false);
  assert.ok(mine(s, OTAMA).rested);
  coherent(s);
});
