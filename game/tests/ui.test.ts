// Lecture des décisions pour l'interface : quelles actions sur quelle carte, fenêtres de choix, explications
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { attackPreview, readDecision, remainingActions, whyNot } from '../ui/decision.ts';
import { attack, play, scenario, setChars, setDeckTop, setDon, setHand, setLife } from './helpers.ts';

test('interface : actions de la phase principale rangées par carte, attaques par attaquant', () => {
  const s = scenario(['ST-31', 'ST-35'], (g) => {
    setHand(g, 0, ['OP01-016', 'OP11-003']);
    setChars(g, 0, [{ num: 'OP11-009' }]);
    setChars(g, 1, [{ num: 'OP13-005', extra: { rested: true } }]);
    setDon(g, 0, 2);
  });
  const view = readDecision(s, s.decision!);
  const nami = s.players[0].hand.find((c) => c.num === 'OP01-016')!.uid;
  const usopp = s.players[0].hand.find((c) => c.num === 'OP11-003')!.uid;
  const robin = s.players[0].chars[0].uid;
  assert.equal(view.byCard.get(nami)?.[0].kind, 'play');
  assert.ok(!view.byCard.has(usopp), 'Usopp coûte 5 : pas jouable');
  assert.match(whyNot(s, s.decision!, usopp)!, /il te manque 3 DON!!/);
  const robinActions = view.byCard.get(robin)!.map((a) => a.kind);
  assert.ok(robinActions.includes('don') && robinActions.includes('attack'));
  assert.equal(view.attacks.get(robin)?.length, 2, 'le Leader adverse et Inazuma épuisé');
  assert.deepEqual(view.buttons.map((o) => o.id), ['end']);
  assert.deepEqual(remainingActions(s, s.decision!).length > 0, true);
  const preview = attackPreview(s, robin, s.players[1].chars[0].uid);
  assert.equal(preview.ok, false);
  assert.match(preview.text, /4000 contre 5000/);
});

test('interface : cartes regardées dans une fenêtre de choix, « Aucune » en bouton', () => {
  let s = scenario(['ST-31', 'ST-35'], (g) => {
    setHand(g, 0, ['OP01-016']);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP11-003', 'OP11-009', 'P-101', 'OP04-016', 'OP14-015']);
  });
  s = play(s, 'OP01-016');
  const view = readDecision(s, s.decision!);
  assert.equal(view.picks.length, 5);
  assert.ok(view.picks.every((p) => p.zone === 'cartes regardées'));
  assert.deepEqual(view.buttons.map((o) => o.id), ['none']);
});

test('interface : Contre avec les cartes de la main, cible d’effet sur le plateau, Déclenchement en fenêtre', () => {
  // l'IA attaque mon Leader : Contre
  let s = scenario(['ST-35', 'ST-36'], (g) => {
    setChars(g, 1, [{ num: 'OP10-101' }]);
    setHand(g, 0, ['OP13-005', 'OP12-098']);
    setDon(g, 0, 1);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  let view = readDecision(s, s.decision!);
  const kinds = [...view.byCard.values()].flat().map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['cevent', 'counter']);
  assert.deepEqual(view.buttons.map((o) => o.id), ['pass']);

  // Lindbergh : la cible du −3000 se choisit sur le plateau
  s = scenario(['ST-35', 'ST-36'], (g) => {
    setHand(g, 0, ['ST35-002']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'OP10-101' }]);
  });
  s = play(s, 'ST35-002');
  view = readDecision(s, s.decision!);
  assert.equal(view.byCard.get(s.players[1].chars[0].uid)?.[0].kind, 'choose');
  assert.deepEqual(view.buttons.map((o) => o.id), ['none']);

  // carte de Vie avec [Déclenchement]
  s = scenario(['ST-35', 'ST-36'], (g) => {
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['ST36-003', 'OP10-101']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  assert.equal(readDecision(s, s.decision!).special, 'trigger');
  void act;
});
