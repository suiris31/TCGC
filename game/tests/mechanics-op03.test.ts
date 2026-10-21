// Mécanismes et briques ajoutés pour OP03 et ST-01 (tâche 1.1 du plan « Aventure ») : dégâts infligés à la Vie, [Bloqueur]
// interdit pendant un combat, retrait différé à la fin du tour, coûts permanents, « ne peut pas attaquer », cibles « autre
// que celui-ci », « sans effet de base », Vie regardée et réorganisée, [Déclenchement] « jouez cette carte » sous
// condition... Les effets sont donnés pour l'occasion à des cartes de ST-21 qui ne les ont pas (aucune vraie carte d'OP03).
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import {
  afterDamage, anyChar, blockerBan, card, defenderPower, giveRestedDonToOwner, grant, leaderKeyword, lifeAtMost, cardMatches, characterCostAtMost, costToZero, deckAtLeast, deckAtMost, describeSpec,
  discardCost, effect, handAtLeast, keywordWhile, koImmuneInBattle, lessLifeThanOpp, lookLifeArrange, lookTopPlay, lookTopTrash,
  matches, mayTrashTop, noBaseEffect, oppChar, oppLifeAtLeast, otherThanSelf, ownLeaderOrChar, playSelfFromTrash, playThis, powerMod,
  readySelf, restCost, restThis, selfDon, selfKeyword, selfPowerMod, seq, toOwnersLife, trashAtEndOfTurn, trashLifeCost, trashOppLife,
  trashOwnCharCost, when, withCost,
} from '../engine/cards/bricks.ts';
import { CARDS } from '../engine/cards/index.ts';
import { addMod, attackTargets, def, fieldCost, hasKeyword, knows, log, power, removeFromField } from '../engine/rules.ts';
import type { CardDef, GameEvent, GameState } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, hasOption, keepOrder, logHas, play, scenario, setChars, setDeckTop, setDon, setHand,
  setLife,
} from './helpers.ts';

function withCards(changes: Record<string, Partial<CardDef>>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(changes).map((n) => [n, CARDS[n]]));
  try {
    for (const [n, c] of Object.entries(changes)) CARDS[n] = { ...CARDS[n], ...c };
    run();
  } finally {
    Object.assign(CARDS, saved);
  }
}

// Cartes de ST-21 (deck des deux joueurs)
const LUFFY = 'ST21-001';     // Leader, 5000
const JINBE = 'ST21-005';     // 4000, coût 2, <Frappe>, sans effet
const STUSSY = 'ST21-006';    // 5000, coût 3, sans effet
const SENTOMARU = 'ST21-007'; // 2000, coût 2, <Tranche>, [Bloqueur]
const CHOPPER = 'ST21-008';   // 6000, coût 4, <Sagesse>, sans effet
const VEGAPUNK = 'ST21-013';  // 3000, coût 1, sans effet
const ZORO = 'ST21-015';      // 5000, coût 4, <Tranche>
const WHIP = 'ST21-016';      // Événement de coût 2

const DECKS: [string, string] = ['ST-21', 'ST-21'];
const uidOf = (s: GameState, p: 0 | 1, num: string) => s.players[p].chars.find((c) => c.num === num)!.uid;
const leaderOf = (s: GameState, p: 0 | 1) => s.players[p].leader.uid;
const attackOptions = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('attack:'));

// Le joueur 0 attaque le Leader adverse avec son Leader : l'adversaire n'a ni main, ni Personnage, ni [Déclenchement]
function hitLeader(setup: (g: GameState) => void = () => {}) {
  let s = scenario(DECKS, (g) => {
    setHand(g, 1, []);
    setChars(g, 1, []);
    setLife(g, 1, [VEGAPUNK, JINBE, STUSSY]);
    setDon(g, 0, 4);
    setup(g);
  });
  s = attack(s, leaderOf(s, 0), leaderOf(s, 1));
  return s;
}

test('dégâts infligés : un événement par attaque qui touche (Double attaque comprise), rien si elle est repoussée', () => {
  const seen: GameEvent[] = [];
  withCards({ [LUFFY]: { when: [{ on: 'damage', if: () => true, run: (_ctx, e) => { seen.push(e); } }] } }, () => {
    let s = hitLeader();
    assert.equal(s.players[1].life.length, 2);
    assert.equal(seen.length, 2, 'les deux Leaders réagissent à chaque événement : un seul événement attendu');
    const e = seen[0];
    assert.deepEqual([e.type, e.player, e.by, e.cause, e.uid, e.count, e.target], ['damage', 1, 0, 'attack', leaderOf(s, 0), 1, leaderOf(s, 1)]);
    coherent(s);

    seen.length = 0;
    s = hitLeader((g) => addMod(g, { uid: g.players[0].leader.uid, stat: 'keyword', keyword: 'Double Attack', amount: 0, until: 'turn', source: 'Test' }));
    assert.equal(s.players[1].life.length, 1);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].count, 2);

    seen.length = 0;
    s = hitLeader((g) => addMod(g, { uid: g.players[1].leader.uid, stat: 'power', amount: 5000, until: 'turn', source: 'Test' }));
    assert.equal(s.players[1].life.length, 3);
    assert.equal(seen.length, 0);
  });
});

test('afterDamage : « quand l’attaque de ce Leader inflige des dégâts » sous [DON!! x1] ; « quand vous infligez des dégâts »', () => {
  const mark = (text: string) => effect((ctx) => { log(ctx.s, ctx.me, text); });
  withCards({
    [LUFFY]: { when: [afterDamage('self', mark('Leader : dégâts'), selfDon(1))] },
    [STUSSY]: { when: [afterDamage('any', mark('Stussy : dégâts'))] },
  }, () => {
    // sans DON!! donnée : seul l'effet « quand vous infligez des dégâts » de Stussy (joueur 0) se déclenche
    let s = hitLeader((g) => setChars(g, 0, [{ num: STUSSY }]));
    assert.ok(logHas(s, 'Stussy : dégâts'));
    assert.ok(!logHas(s, 'Leader : dégâts'));
    // avec 1 DON!! donnée au Leader : les deux (le joueur choisit l'ordre)
    s = hitLeader((g) => {
      setChars(g, 0, [{ num: STUSSY }]);
      g.players[0].leader.don = 1;
      g.players[0].donActive -= 1;
    });
    if (s.decision?.tag === 'order') s = choose(s, `first:${LUFFY}`);
    assert.ok(logHas(s, 'Leader : dégâts'));
    assert.ok(logHas(s, 'Stussy : dégâts'));
    coherent(s);
  });
  // les dégâts subis ne comptent pas : Stussy est chez le joueur qui est touché
  withCards({ [STUSSY]: { when: [afterDamage('any', mark('Stussy : dégâts'))] } }, () => {
    const s = hitLeader((g) => setChars(g, 1, [{ num: STUSSY }]));
    assert.ok(!logHas(s, 'Stussy : dégâts'));
  });
});

test('blockerBan : l’adversaire ne peut pas activer le [Bloqueur] d’un Personnage de 2000 ou moins pendant ce combat', () => {
  withCards({
    [JINBE]: card({ whenAttacking: blockerBan({ powerMax: 2000 }, 'Test') }),
    [STUSSY]: { blocker: () => true },
  }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: JINBE }]);
      setChars(g, 1, [{ num: SENTOMARU }, { num: STUSSY }]);
    });
    s = attack(s, uidOf(s, 0, JINBE), leaderOf(s, 1));
    assert.equal(s.decision?.kind, 'blocker');
    assert.ok(hasOption(s, `block:${uidOf(s, 1, STUSSY)}`));
    assert.ok(!hasOption(s, `block:${uidOf(s, 1, SENTOMARU)}`));
    s = choose(s, 'noblock');
    while (s.decision?.kind === 'counter') s = choose(s, 'pass');
    assert.ok(!s.mods.some((m) => m.stat === 'blockerBan'), 'la restriction finit avec le combat');
    coherent(s);
    // l'effet ne sert que s'il y a un [Bloqueur] visé redressé
    const e = blockerBan({ powerMax: 2000 }, 'Test');
    assert.equal(e.useful(s, 0, uidOf(s, 0, JINBE)), true);
    s.players[1].chars.find((c) => c.num === SENTOMARU)!.rested = true;
    assert.equal(e.useful(s, 0, uidOf(s, 0, JINBE)), false);
  });
  // sans l'effet, les deux peuvent bloquer
  withCards({ [STUSSY]: { blocker: () => true } }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: JINBE }]);
      setChars(g, 1, [{ num: SENTOMARU }, { num: STUSSY }]);
    });
    s = attack(s, uidOf(s, 0, JINBE), leaderOf(s, 1));
    assert.ok(hasOption(s, `block:${uidOf(s, 1, SENTOMARU)}`));
  });
});

test('trashAtEndOfTurn : le Personnage va dans la Défausse à la fin du tour, sauf s’il a quitté le terrain avant', () => {
  withCards({
    [STUSSY]: card({ activateMain: { label: 'Test', once: true, effect: seq(selfPowerMod(2000, 'turn', 'Test'), trashAtEndOfTurn('Test')) } }),
  }, () => {
    let s = scenario(DECKS, (g) => setChars(g, 0, [{ num: STUSSY }]));
    const stussy = uidOf(s, 0, STUSSY);
    s = choose(s, `act:${stussy}`);
    assert.equal(power(s, stussy), 7000);
    assert.equal(s.delayed.length, 1);
    s = choose(s, 'end');
    assert.ok(s.players[0].trash.some((c) => c.uid === stussy));
    assert.ok(!s.players[0].chars.some((c) => c.uid === stussy));
    assert.equal(s.delayed.length, 0);
    coherent(s);

    // renvoyé en main avant la fin du tour : le retrait différé est oublié
    s = scenario(DECKS, (g) => setChars(g, 0, [{ num: STUSSY }]));
    s = choose(s, `act:${uidOf(s, 0, STUSSY)}`);
    const f = removeFromField(s, uidOf(s, 0, STUSSY), 'hand');
    assert.ok(f);
    assert.equal(s.delayed.length, 0);
    s = choose(s, 'end');
    assert.ok(s.players[0].hand.some((c) => c.uid === f!.card.uid));
    coherent(s);
  });
});

test('coûts permanents : −3 aux Personnages adverses pendant son tour (oppCostAura), +2 aux siens pendant le tour adverse (costAura)', () => {
  withCards({
    [STUSSY]: {
      oppCostAura: (s, owner) => (s.active === owner ? -3 : 0),
      costAura: (s, owner, _src, target) => (s.active !== owner && target.num !== STUSSY ? 2 : 0),
    },
  }, () => {
    const s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: STUSSY }, { num: JINBE }]);
      setChars(g, 1, [{ num: CHOPPER }]);
    });
    const chopper = uidOf(s, 1, CHOPPER);
    const jinbe = uidOf(s, 0, JINBE);
    assert.equal(fieldCost(s, chopper), 1);
    assert.equal(fieldCost(s, jinbe), 2);
    s.active = 1;
    assert.equal(fieldCost(s, chopper), 4);
    assert.equal(fieldCost(s, jinbe), 4);
    assert.equal(fieldCost(s, uidOf(s, 0, STUSSY)), 3);
    // effets annulés : plus rien
    addMod(s, { uid: uidOf(s, 0, STUSSY), stat: 'negated', amount: 0, until: 'turn', source: 'Test' });
    assert.equal(fieldCost(s, jinbe), 2);
    assert.equal(characterCostAtMost(1)(s, 0, -1), false);
    s.active = 0;
    assert.equal(fieldCost(s, chopper), 4);
  });
});

test('cantAttack et cantAttackLeader : Leader qui ne peut pas attaquer ; Personnage qui n’attaque pas de Leader le tour où il est joué', () => {
  withCards({
    [LUFFY]: { cantAttack: () => true },
    [ZORO]: { rush: () => true, cantAttackLeader: (s, _o, self) => self.playedTurn === s.turn },
  }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 1, [{ num: CHOPPER, extra: { rested: true } }]);
      setHand(g, 0, [ZORO]);
      setDon(g, 0, 6);
    });
    assert.ok(!attackOptions(s).some((o) => o.uid === leaderOf(s, 0)));
    s = play(s, ZORO);
    const zoro = uidOf(s, 0, ZORO);
    assert.deepEqual(attackTargets(s, 0, s.players[0].chars.find((c) => c.uid === zoro)!), [uidOf(s, 1, CHOPPER)]);
    // le tour suivant du joueur, Zoro peut attaquer le Leader
    s.players[0].chars.find((c) => c.uid === zoro)!.playedTurn = s.turn - 2;
    assert.ok(attackTargets(s, 0, s.players[0].chars.find((c) => c.uid === zoro)!).includes(leaderOf(s, 1)));
    // effets annulés : le Leader attaque de nouveau
    addMod(s, { uid: leaderOf(s, 0), stat: 'negated', amount: 0, until: 'turn', source: 'Test' });
    assert.ok(attackTargets(s, 0, s.players[0].leader).length > 0);
  });
});

test('« sans effet de base » ([Déclenchement] compris) et « ayant N DON!! données »', () => {
  assert.equal(noBaseEffect(def(VEGAPUNK)), true);
  assert.equal(noBaseEffect(def(SENTOMARU)), false);           // [Bloqueur] est un texte de carte
  assert.equal(noBaseEffect({ effectEn: '-', triggerEn: 'Play this card.' }), false);  // 2-11-2
  assert.equal(cardMatches(VEGAPUNK, { vanilla: true }), true);
  assert.equal(cardMatches(SENTOMARU, { vanilla: true }), false);
  assert.equal(cardMatches(VEGAPUNK, { donMin: 1 }), false);
  assert.match(describeSpec('Personnage adverse', { vanilla: true, donMin: 2 }), /sans effet de base ayant 2 DON!! données ou plus/);
  const s = scenario(DECKS, (g) => setChars(g, 1, [{ num: CHOPPER, extra: { don: 2 } }, { num: SENTOMARU, extra: { don: 1 } }]));
  const [chopper, sentomaru] = s.players[1].chars;
  assert.equal(matches(s, chopper, { donMin: 2, vanilla: true }), true);
  assert.equal(matches(s, sentomaru, { donMin: 2 }), false);
  assert.equal(matches(s, sentomaru, { vanilla: false }), true);
});

test('otherThanSelf : « jusqu’à 1 de vos Leader ou Personnages autre que celui-ci »', () => {
  withCards({ [JINBE]: card({ whenAttacking: powerMod(otherThanSelf(ownLeaderOrChar()), 1000, 'turn', 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: JINBE }, { num: STUSSY }]);
      setChars(g, 1, []);
      setHand(g, 1, []);
    });
    const jinbe = uidOf(s, 0, JINBE);
    s = attack(s, jinbe, leaderOf(s, 1));
    expectTag(s, 'ownPower');
    assert.match(s.decision!.prompt, /autre que celui-ci/);
    const uids = s.decision!.options.map((o) => o.uid).filter((u) => u !== undefined);
    assert.deepEqual(uids.sort(), [leaderOf(s, 0), uidOf(s, 0, STUSSY)].sort());
    s = choose(s, `card:${uidOf(s, 0, STUSSY)}`);
    assert.equal(power(s, uidOf(s, 0, STUSSY)), 6000);
  });
});

test('coûts : épuiser 2 de vos Personnages <Tranche> ; placer un de vos Personnages de 5000 ou plus dans la Défausse ; une carte de la Vie', () => {
  const rest2 = restCost(2, 'characters', { attribute: 'Slash' });
  assert.match(rest2.label, /épuiser 2 de tes Personnages <Tranche>/);
  let s = scenario(DECKS, (g) => setChars(g, 0, [{ num: SENTOMARU }, { num: JINBE }]));
  assert.equal(rest2.can(s, 0, -1), false);
  s = scenario(DECKS, (g) => setChars(g, 0, [{ num: SENTOMARU }, { num: ZORO }, { num: JINBE }]));
  assert.equal(rest2.can(s, 0, -1), true);

  withCards({ [VEGAPUNK]: card({ onPlay: withCost(trashOwnCharCost({ powerMin: 5000 }), selfPowerMod(1000, 'turn', 'Test'), 'Test') }) }, () => {
    let s2 = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: STUSSY }, { num: JINBE }]);
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
    });
    s2 = play(s2, VEGAPUNK);
    s2 = choose(s2, 'yes');
    // un seul Personnage de 5000 ou plus : choisi d'office
    assert.ok(s2.players[0].trash.some((c) => c.num === STUSSY));
    assert.ok(s2.players[0].chars.some((c) => c.num === JINBE));
    assert.equal(power(s2, uidOf(s2, 0, VEGAPUNK)), 4000);
    coherent(s2);
  });

  withCards({ [VEGAPUNK]: card({ onPlay: withCost(trashLifeCost('both'), selfPowerMod(1000, 'turn', 'Test'), 'Test') }) }, () => {
    let s3 = scenario(DECKS, (g) => {
      setLife(g, 0, [JINBE, STUSSY, CHOPPER]);
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
    });
    s3 = play(s3, VEGAPUNK);
    s3 = choose(s3, 'yes');
    expectTag(s3, 'lifeSide');
    s3 = choose(s3, 'bottom');
    assert.deepEqual(s3.players[0].life.map((c) => c.num), [JINBE, STUSSY]);
    assert.ok(s3.players[0].trash.some((c) => c.num === CHOPPER));
    coherent(s3);
  });
});

test('readySelf, restThis, selfKeyword pour le combat', () => {
  withCards({ [LUFFY]: card({ activateMain: { label: 'Test', effect: seq(readySelf(), restThis()) } }) }, () => {
    const s = scenario(DECKS, (g) => { g.players[0].leader.rested = true; });
    assert.equal(readySelf().useful(s, 0, leaderOf(s, 0)), true);
    assert.equal(restThis().useful(s, 0, leaderOf(s, 0)), false);
    const s2 = choose(s, `act:${leaderOf(s, 0)}`);
    // redressé puis épuisé : l'ordre du texte est respecté
    assert.equal(s2.players[0].leader.rested, true);
    assert.ok(logHas(s2, 'redresse'));
  });
  withCards({ [JINBE]: card({ whenAttacking: selfKeyword('Banish', 'Test', 'battle') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: JINBE }]);
      setChars(g, 1, []);
      setHand(g, 1, []);
      setLife(g, 1, [VEGAPUNK, STUSSY]);
      setDon(g, 0, 4);
      g.players[0].chars[0].don = 2;
      g.players[0].donActive -= 2;
    });
    s = attack(s, uidOf(s, 0, JINBE), leaderOf(s, 1));
    // [Exil] : la carte de Vie va dans la Défausse
    assert.ok(s.players[1].trash.some((c) => c.num === VEGAPUNK));
    assert.equal(hasKeyword(s, 0, s.players[0].chars[0], 'Banish'), false, '[Exil] seulement pendant ce combat');
    coherent(s);
  });
});

test('mayTrashTop : question « mayMill », l’IA n’accepte que si son Leader gagne à deck vide', () => {
  withCards({ [VEGAPUNK]: card({ onPlay: mayTrashTop(3, 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
    });
    s = play(s, VEGAPUNK);
    expectTag(s, 'mayMill');
    aiAnswers(s);
    assert.equal(heuristicChooser(s, s.decision!), 'no');
    withCards({ [LUFFY]: { rules: { deckOut: 'win' } } }, () => assert.equal(heuristicChooser(s, s.decision!), 'yes'));
    const deck = s.players[0].deck.length;
    const trash = s.players[0].trash.length;
    s = choose(s, 'yes');
    assert.equal(s.players[0].deck.length, deck - 3);
    assert.equal(s.players[0].trash.length, trash + 3);
    coherent(s);
  });
});

test('lookTopTrash et lookTopPlay (reste dans la Défausse)', () => {
  withCards({ [VEGAPUNK]: card({ onPlay: lookTopTrash(4, 2, 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setDeckTop(g, 0, [JINBE, STUSSY, CHOPPER, ZORO]);
    });
    const trash = s.players[0].trash.length;
    s = play(s, VEGAPUNK);
    expectTag(s, 'discard');
    aiAnswers(s);
    s = choose(s, (o) => o.num === JINBE);
    s = choose(s, 'none');
    s = keepOrder(s);
    assert.equal(s.players[0].trash.length, trash + 1);
    assert.ok(s.players[0].trash.some((c) => c.num === JINBE));
    assert.deepEqual(s.players[0].deck.slice(-3).map((c) => c.num), [STUSSY, CHOPPER, ZORO]);
    coherent(s);
  });
  withCards({ [VEGAPUNK]: card({ onPlay: lookTopPlay(3, { costMax: 3 }, 'Test', { rest: 'trash' }) }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setDeckTop(g, 0, [JINBE, CHOPPER, ZORO]);
    });
    s = play(s, VEGAPUNK);
    expectTag(s, 'playFree');
    s = choose(s, (o) => o.num === JINBE);
    assert.ok(s.players[0].chars.some((c) => c.num === JINBE));
    assert.ok(s.players[0].trash.some((c) => c.num === CHOPPER) && s.players[0].trash.some((c) => c.num === ZORO));
    coherent(s);
  });
});

test('Vie : trashOppLife, lookLifeArrange (seul celui qui regarde connaît la carte), toOwnersLife face visible', () => {
  withCards({ [VEGAPUNK]: card({ onPlay: trashOppLife() }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setLife(g, 1, [JINBE, STUSSY]);
    });
    s = play(s, VEGAPUNK);
    assert.deepEqual(s.players[1].life.map((c) => c.num), [STUSSY]);
    assert.ok(s.players[1].trash.some((c) => c.num === JINBE));
    coherent(s);
  });
  withCards({ [VEGAPUNK]: card({ onPlay: lookLifeArrange('Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setLife(g, 1, [JINBE, STUSSY, CHOPPER]);
    });
    s = play(s, VEGAPUNK);
    expectTag(s, 'lifeLook');
    assert.equal(heuristicChooser(s, s.decision!), 'opp');
    s = choose(s, 'opp');
    expectTag(s, 'lifeArrange');
    assert.equal(s.decision!.cards?.[0].num, JINBE);
    aiAnswers(s);
    // l'adversaire ne voit pas la carte regardée
    assert.ok(!JSON.stringify(viewFor(s, 1).decision ?? {}).includes(JINBE));
    s = choose(s, 'bottom');
    const jinbe = s.players[1].life[2];
    assert.equal(jinbe.num, JINBE);
    assert.equal(knows(s, 0, jinbe.uid), true);
    assert.equal(knows(s, 1, jinbe.uid), false);
    assert.equal(viewFor(s, 0).players[1].life[2].num, JINBE);
    assert.notEqual(viewFor(s, 1).players[1].life[2].num, JINBE);
    assert.ok(!viewFor(s, 1).log.some((l) => l.text.includes(def(JINBE).name) && l.text.includes('regardée')));
    coherent(s);
  });
  withCards({ [VEGAPUNK]: card({ onPlay: toOwnersLife(anyChar({ costMax: 4 }), 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setChars(g, 1, [{ num: CHOPPER }]);
      setLife(g, 1, [JINBE]);
    });
    s = play(s, VEGAPUNK);
    expectTag(s, 'oppToLife');
    // l'IA ne vise pas ses propres Personnages
    assert.notEqual(heuristicChooser(s, s.decision!), `card:${uidOf(s, 0, VEGAPUNK)}`);
    s = choose(s, `card:${uidOf(s, 1, CHOPPER)}`);
    s = choose(s, 'lifeTop');
    assert.equal(s.players[1].life[0].num, CHOPPER);
    assert.equal(s.players[1].life[0].faceUp, true);
    coherent(s);
  });
});

test('playThis : [Déclenchement] « vous pouvez défausser 1 carte : jouez cette carte » ; sous une condition fausse, la carte va dans la Défausse', () => {
  const withTrigger = (onTrigger: CardDef['onTrigger']) => ({ trigger: 'Test', triggerEn: 'Test', onTrigger });
  withCards({ [VEGAPUNK]: withTrigger(withCost(discardCost(1), playThis(), 'Test').run) }, () => {
    let s = hitLeader((g) => {
      setLife(g, 1, [VEGAPUNK, STUSSY]);
      setHand(g, 1, [JINBE]);
    });
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    expectTag(s, 'trigger');
    s = choose(s, 'trigger');
    s = choose(s, 'yes');
    assert.ok(s.players[1].chars.some((c) => c.num === VEGAPUNK));
    assert.ok(s.players[1].trash.some((c) => c.num === JINBE));
    coherent(s);
  });
  withCards({ [VEGAPUNK]: withTrigger(when(handAtLeast(10), playThis()).run) }, () => {
    let s = hitLeader((g) => setLife(g, 1, [VEGAPUNK, STUSSY]));
    s = choose(s, 'trigger');
    assert.ok(s.players[1].trash.some((c) => c.num === VEGAPUNK));
    assert.ok(!s.players[1].chars.some((c) => c.num === VEGAPUNK));
    coherent(s);
  });
});

test('playSelfFromTrash : [En cas de KO] se rejouer épuisé depuis la Défausse', () => {
  withCards({ [STUSSY]: card({ onKO: playSelfFromTrash('Test', { rested: true }) }) }, () => {
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: CHOPPER }]);
      setChars(g, 1, [{ num: STUSSY, extra: { rested: true } }]);
      setHand(g, 1, []);
    });
    const stussy = uidOf(s, 1, STUSSY);
    s = attack(s, uidOf(s, 0, CHOPPER), stussy);
    const back = s.players[1].chars.find((c) => c.uid === stussy);
    assert.ok(back, 'Stussy revient sur le terrain');
    assert.equal(back!.rested, true);
    assert.ok(!s.players[1].trash.some((c) => c.uid === stussy));
    coherent(s);
  });
});

test('costToZero : le coût d’un Personnage adverse sans effet de base devient 0 pour le tour', () => {
  withCards({ [VEGAPUNK]: card({ onPlay: costToZero(oppChar({ vanilla: true }), 'turn', 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setChars(g, 1, [{ num: CHOPPER }, { num: SENTOMARU }]);
    });
    s = play(s, VEGAPUNK);
    // un seul candidat (Sentomaru a [Bloqueur]) : choix « jusqu'à 1 » proposé quand même
    expectTag(s, 'oppCost');
    assert.ok(!hasOption(s, `card:${uidOf(s, 1, SENTOMARU)}`));
    s = choose(s, `card:${uidOf(s, 1, CHOPPER)}`);
    assert.equal(fieldCost(s, uidOf(s, 1, CHOPPER)), 0);
    assert.equal(characterCostAtMost(0)(s, 0, -1), true);
    s = choose(s, 'end');
    assert.equal(fieldCost(s, uidOf(s, 1, CHOPPER)), 4);
    coherent(s);
  });
});

test('keywordWhile : [DON!! x1] ce Personnage gagne [Double attaque] ; koImmuneInBattle : pas mis KO en combat par une carte <Tranche>', () => {
  withCards({ [JINBE]: { keywordAura: keywordWhile('Double Attack', selfDon(1)) } }, () => {
    const s = scenario(DECKS, (g) => setChars(g, 0, [{ num: JINBE }]));
    const jinbe = s.players[0].chars[0];
    assert.equal(hasKeyword(s, 0, jinbe, 'Double Attack'), false);
    jinbe.don = 1;
    assert.equal(hasKeyword(s, 0, jinbe, 'Double Attack'), true);
  });
  withCards({ [STUSSY]: { cantBeKO: koImmuneInBattle({ attribute: 'Slash' }) } }, () => {
    // Zoro <Tranche> 5000 contre Stussy 5000 : l'attaque gagne mais Stussy reste
    let s = scenario(DECKS, (g) => {
      setChars(g, 0, [{ num: ZORO }, { num: CHOPPER }]);
      setChars(g, 1, [{ num: STUSSY, extra: { rested: true } }]);
      setHand(g, 1, []);
    });
    const stussy = uidOf(s, 1, STUSSY);
    s = attack(s, uidOf(s, 0, ZORO), stussy);
    assert.ok(s.players[1].chars.some((c) => c.uid === stussy));
    assert.ok(logHas(s, 'ne peut pas être mis KO'));
    // Chopper <Sagesse> : mis KO
    s = attack(s, uidOf(s, 0, CHOPPER), stussy);
    assert.ok(!s.players[1].chars.some((c) => c.uid === stussy));
    coherent(s);
  });
});

test('conditions : deck, Vie, coût de 0 sur le terrain', () => {
  const s = scenario(DECKS, (g) => {
    setLife(g, 0, [JINBE, STUSSY]);
    setLife(g, 1, [VEGAPUNK, CHOPPER, ZORO, SENTOMARU]);
    g.players[0].deck.splice(20);
  });
  assert.equal(deckAtMost(20)(s, 0, -1), true);
  assert.equal(deckAtMost(19)(s, 0, -1), false);
  assert.equal(deckAtLeast(20)(s, 0, -1), true);
  assert.equal(lessLifeThanOpp(s, 0, -1), true);
  assert.equal(lessLifeThanOpp(s, 1, -1), false);
  assert.equal(oppLifeAtLeast(4)(s, 0, -1), true);
  assert.equal(oppLifeAtLeast(3)(s, 1, -1), false);
});

test('defenderPower : [Contre] +3000 à la carte attaquée, valeur connue de l’IA ; leaderKeyword', () => {
  withCards({ [WHIP]: card({ onCounter: seq(defenderPower(3000, 'Test'), mayTrashTop(1, 'Test')) }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [WHIP]);
      setDon(g, 0, 2);
      setChars(g, 0, []);
    }, 1);
    assert.equal(def(WHIP).counterPower?.(s, 0, leaderOf(s, 0)), 3000);
    s = attack(s, leaderOf(s, 1), leaderOf(s, 0));
    assert.equal(s.decision?.kind, 'counter');
    const whip = s.decision!.options.find((o) => o.id.startsWith('cevent:'))!;
    assert.equal(heuristicChooser(s, s.decision!), whip.id, 'l’IA contre avec l’Événement (+3000 suffit)');
    s = choose(s, whip.id);
    expectTag(s, 'mayMill');
    s = choose(s, 'no');
    if (s.decision?.kind === 'counter') s = choose(s, 'pass');
    assert.ok(logHas(s, 'gagne +3000 de puissance pour le combat (Test)'));
    assert.ok(logHas(s, 'repoussée'));
    assert.equal(s.players[0].life.length, 5);
    coherent(s);
  });
  // sous une condition fausse, la valeur est nulle
  withCards({ [WHIP]: card({ onCounter: when(lifeAtMost(0), defenderPower(3000, 'Test')) }) }, () => {
    const s = scenario(DECKS, () => {}, 1);
    assert.equal(def(WHIP).counterPower?.(s, 0, leaderOf(s, 0)), 0);
  });
  withCards({ [VEGAPUNK]: card({ onPlay: leaderKeyword('Double Attack', 'turn', 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
    });
    s = play(s, VEGAPUNK);
    assert.equal(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'), true);
    s = choose(s, 'end');
    assert.equal(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'), false);
  });
});

test('attackActive : attaquer aussi les Personnages redressés ; giveRestedDonToOwner : DON!! épuisées adverses données à un Personnage adverse', () => {
  withCards({ [VEGAPUNK]: card({ onPlay: grant(ownLeaderOrChar(), { stat: 'attackActive' }, 'turn', 'Test', 'peut aussi attaquer les Personnages redressés') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setChars(g, 1, [{ num: CHOPPER }]);
    });
    const chopper = uidOf(s, 1, CHOPPER);
    assert.ok(!attackTargets(s, 0, s.players[0].leader).includes(chopper));
    s = play(s, VEGAPUNK);
    s = choose(s, `card:${leaderOf(s, 0)}`);
    assert.ok(attackTargets(s, 0, s.players[0].leader).includes(chopper));
    s = attack(s, leaderOf(s, 0), chopper);
    while (s.decision?.kind === 'counter' || s.decision?.kind === 'blocker') s = choose(s, s.decision.kind === 'counter' ? 'pass' : 'noblock');
    coherent(s);
    s = choose(s, 'end');
    assert.ok(!s.mods.some((m) => m.stat === 'attackActive'));
  });
  withCards({ [VEGAPUNK]: card({ onPlay: giveRestedDonToOwner(oppChar(), 3, 'Test') }) }, () => {
    let s = scenario(DECKS, (g) => {
      setHand(g, 0, [VEGAPUNK]);
      setDon(g, 0, 3);
      setDon(g, 1, 0, 2);
      setChars(g, 1, [{ num: CHOPPER }]);
    });
    s = play(s, VEGAPUNK);
    expectTag(s, 'oppDonTarget');
    aiAnswers(s);
    s = choose(s, `card:${uidOf(s, 1, CHOPPER)}`);
    assert.equal(s.players[1].chars[0].don, 2);
    assert.equal(s.players[1].donRested, 0);
    // pendant le tour du joueur 0, ces DON!! ne donnent rien au Personnage adverse
    assert.equal(power(s, uidOf(s, 1, CHOPPER)), 6000);
    assert.ok(logHas(s, 'donne 2 DON!! épuisées adverses à'));
    coherent(s);
  });
});
