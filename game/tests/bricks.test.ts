// Briques d'effets : chaque famille testée sur une carte qui reçoit l'effet pour l'occasion ([Jouée] d'Inazuma), avec la
// condition vraie et fausse, et l'aide à l'IA (effet utile ou non).
import assert from 'node:assert/strict';
import test from 'node:test';
import { uselessReason } from '../ai/prune.ts';
import {
  bounce, card, chooseOne, describeSpec, discardCost, donMinus, drawCards, giveDon, ko, leaderType, lifeAtMost, oppChar,
  playFromTrash, powerMod, rest, restSelf, searchTop, seq, typeLabel, when, withCost, ownLeaderOrChar, anyChar,
} from '../engine/cards/bricks.ts';
import { CARDS } from '../engine/cards/index.ts';
import { addMod, power } from '../engine/rules.ts';
import type { CardBehavior, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, play, scenario, setChars, setDeckTop, setDon, setHand, setLife } from './helpers.ts';

function withCards(changes: Record<string, CardBehavior>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(changes).map((n) => [n, CARDS[n]]));
  try {
    for (const [n, c] of Object.entries(changes)) CARDS[n] = { ...CARDS[n], ...c };
    run();
  } finally {
    Object.assign(CARDS, saved);
  }
}

const INAZUMA = 'OP13-005';  // la carte qui reçoit l'effet testé ([Jouée])
const MORLEY = 'OP12-093';   // 5000, coût 4 (8 avec un Leader {Armée révolutionnaire})
const BETTY = 'OP12-090';    // 4000, coût 3
const IVANKOV = 'OP13-008';  // 3000, coût 2
const CORBEAU = 'ST35-003';  // 4000, coût 3
const SABO = 'OP13-004';     // Leader ST-35, {Armée révolutionnaire}

// Le joueur 0 joue Inazuma, dont le [Jouée] est l'effet testé ; le joueur 1 a Betty, Ivankov et Morley
function playInazuma(setup: (g: GameState) => void = () => {}): GameState {
  const s = scenario(['ST-35', 'ST-35'], (g) => {
    setChars(g, 1, [{ num: BETTY }, { num: IVANKOV }, { num: MORLEY }]);
    setHand(g, 0, [INAZUMA]);
    setDon(g, 0, 8);
    setup(g);
  });
  return play(s, INAZUMA);
}
const opp = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!.uid;

test('mettre KO : seules les cibles qui correspondent au texte sont proposées', () => {
  withCards({ [INAZUMA]: card({ onPlay: ko(oppChar({ costMax: 3 }), 'Test') }) }, () => {
    let s = playInazuma();
    expectTag(s, 'oppKo');
    assert.deepEqual(s.decision!.options.map((o) => o.uid ?? o.id).sort(), [opp(s, BETTY), opp(s, IVANKOV), 'none'].sort());
    assert.match(s.decision!.prompt, /Personnage adverse de coût 3 ou moins/);
    s = choose(s, `card:${opp(s, BETTY)}`);
    // Ivankov peut se sacrifier à la place (effet de remplacement de l'adversaire) : il refuse
    expectTag(s, 'replace');
    assert.equal(s.decision!.player, 1);
    s = choose(s, 'none');
    assert.equal(s.players[1].chars.some((c) => c.num === BETTY), false);
    coherent(s);
  });
});

test('mettre KO : une carte qui ne peut pas être mise KO n’est pas proposée ; sans cible, l’effet ne sert à rien', () => {
  const effect = ko(oppChar({ costMax: 3 }), 'Test');
  const s = scenario(['ST-35', 'ST-35'], (g) => setChars(g, 1, [{ num: BETTY }]));
  assert.equal(effect.useful(s, 0, -1), true);
  addMod(s, { uid: s.players[1].chars[0].uid, stat: 'cantBeKO', amount: 0, until: 'turn', source: 'test' });
  assert.equal(effect.useful(s, 0, -1), false);
});

test('« si » : condition vérifiée au moment de l’effet (vraie, puis fausse)', () => {
  withCards({ [INAZUMA]: card({ onPlay: when(leaderType('Revolutionary Army'), rest(oppChar({ costMax: 4 }), 'Test')) }) }, () => {
    expectTag(playInazuma(), 'oppRest');
  });
  withCards({ [INAZUMA]: card({ onPlay: when(leaderType('Navy'), rest(oppChar({ costMax: 4 }), 'Test')) }) }, () => {
    assert.equal(playInazuma().decision?.kind, 'main', 'Leader Sabo : pas de {Marine}, rien ne se passe');
  });
  withCards({ [INAZUMA]: card({ onPlay: when(lifeAtMost(2), drawCards(1)) }) }, () => {
    const before = playInazuma();
    assert.equal(before.players[0].hand.length, 0, '5 Vies : pas de pioche');
    const after = playInazuma((g) => setLife(g, 0, [BETTY, CORBEAU]));
    assert.equal(after.players[0].hand.length, 1);
  });
});

test('puissance : −2000 pour le tour à un Personnage adverse ; renvoyer en main', () => {
  withCards({ [INAZUMA]: card({ onPlay: seq(powerMod(oppChar(), -2000, 'turn', 'Test'), bounce(anyChar({ costMax: 2 }), 'Test')) }) }, () => {
    let s = playInazuma();
    expectTag(s, 'oppPower');
    const morley = opp(s, MORLEY);
    s = choose(s, `card:${morley}`);
    assert.equal(power(s, morley), 3000);
    expectTag(s, 'bounce');
    s = choose(s, `card:${opp(s, IVANKOV)}`);
    assert.ok(s.players[1].hand.some((c) => c.num === IVANKOV));
    coherent(s);
  });
});

test('regarder le dessus du deck et en prendre une carte d’un type ; jouer depuis la Défausse', () => {
  withCards({ [INAZUMA]: card({ onPlay: seq(searchTop(3, 1, { type: 'Revolutionary Army', category: 'CHARACTER' }, 'un Personnage {Armée révolutionnaire}'), playFromTrash({ powerMax: 4000 }, 'Test')) }) }, () => {
    let s = playInazuma((g) => {
      setDeckTop(g, 0, [CORBEAU, 'OP12-098', BETTY]);
      g.players[0].trash.push(...setHand(g, 0, [INAZUMA, IVANKOV]).filter((c) => c.num === IVANKOV));
      g.players[0].hand = g.players[0].hand.filter((c) => c.num === INAZUMA);
    });
    expectTag(s, 'pick');
    assert.deepEqual(s.decision!.options.map((o) => o.num ?? o.id).sort(), [BETTY, CORBEAU, 'none'].sort(), 'l’Événement n’est pas proposé');
    s = choose(s, (o) => o.num === CORBEAU);
    assert.ok(s.players[0].hand.some((c) => c.num === CORBEAU));
    expectTag(s, 'playFree');
    s = choose(s, (o) => o.num === IVANKOV);
    assert.ok(s.players[0].chars.some((c) => c.num === IVANKOV));
    coherent(s);
  });
});

test('« vous pouvez [coût] : » : proposé seulement si le coût est payable, payé avant l’effet', () => {
  withCards({ [INAZUMA]: card({ onPlay: withCost(donMinus(1), drawCards(2), 'Test') }) }, () => {
    let s = playInazuma();
    expectTag(s, 'may');
    const don = s.players[0].donDeck;
    s = choose(s, 'yes');
    assert.equal(s.players[0].hand.length, 2);
    assert.equal(s.players[0].donDeck, don + 1);
    coherent(s);
  });
  withCards({ [INAZUMA]: card({ onPlay: withCost(discardCost(1), drawCards(2), 'Test') }) }, () => {
    assert.equal(playInazuma().decision?.kind, 'main', 'main vide : rien à défausser, pas de question');
  });
});

test('« choisissez un effet » : seuls les effets possibles sont proposés', () => {
  withCards({
    [INAZUMA]: card({ onPlay: chooseOne('Test', [{ label: 'KO un coût 1 ou moins', effect: ko(oppChar({ costMax: 1 }), 'Test') }, { label: 'Piocher 1 carte', effect: drawCards(1) }]) }),
  }, () => {
    const s = playInazuma();
    assert.equal(s.decision?.kind, 'main', 'un seul effet possible : appliqué sans question');
    assert.equal(s.players[0].hand.length, 1);
  });
});

test('[Activation : Principale] avec coût : l’IA ne propose pas un effet qui ne peut rien faire', () => {
  withCards({
    [MORLEY]: card({ activateMain: { label: 'Morley : épuiser Morley pour donner 1 DON!! épuisée', once: true, cost: restSelf(), effect: giveDon(ownLeaderOrChar(), 1, 'Morley') } }),
  }, () => {
    const s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setDon(g, 0, 3, 0);
    });
    const act = s.decision!.options.find((o) => o.id.startsWith('act:'))!;
    assert.ok(act, 'proposée (coût payable)');
    assert.equal(uselessReason(s, s.decision!, act), 'son effet ne peut rien faire maintenant', 'aucune DON!! épuisée à donner');
  });
});

test('libellés : types en VF, description du texte', () => {
  assert.equal(typeLabel('Navy'), 'Marine');
  assert.equal(typeLabel('Revolutionary Army'), 'Armée révolutionnaire');
  assert.equal(describeSpec('Personnage adverse', { type: 'Navy', costMax: 4, rested: true }), 'Personnage adverse épuisé de type {Marine} de coût 4 ou moins');
  assert.ok(CARDS[SABO]);
});
