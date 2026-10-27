// Glisser-déposer du plateau (tâche R2.7) : la correspondance entre un geste et une option du moteur (une seule
// option, sinon aucun effet), ce qui se saisit, où on peut lâcher, et le seuil qui sépare le glisser du défilement
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import type { Decision, GameState } from '../engine/types.ts';
import { dropCards, gestureIntent, gestureKind, gestureOption, grabbableCards, shortPreview, type GestureDrop } from '../ui/table/gestures.ts';
import { attackPreview } from '../ui/decision.ts';
import { scenario, setChars, setDon, setHand } from './helpers.ts';

const uidIn = (cards: { uid: number; num: string }[], num: string) => cards.find((c) => c.num === num)!.uid;
const onMine = (uid: number): GestureDrop => ({ on: 'card', uid, mine: true });
const onTheirs = (uid: number): GestureDrop => ({ on: 'card', uid, mine: false });
const myZone: GestureDrop = { on: 'zone', mine: true };
const theirZone: GestureDrop = { on: 'zone', mine: false };
const nowhere: GestureDrop = { on: 'none' };

// Robin peut attaquer le Leader adverse et un Personnage adverse épuisé ; Nami (coût 1) se joue, Usopp (coût 5) non
function setup(): { s: GameState; nami: number; usopp: number; robin: number; leader: number; theirLeader: number; rested: number } {
  const s = scenario(['ST-31', 'ST-35'], (g) => {
    setHand(g, 0, ['OP01-016', 'OP11-003']);
    setChars(g, 0, [{ num: 'OP11-009' }]);
    setChars(g, 1, [{ num: 'OP13-005', extra: { rested: true } }]);
    setDon(g, 0, 2);
  });
  return {
    s,
    nami: uidIn(s.players[0].hand, 'OP01-016'),
    usopp: uidIn(s.players[0].hand, 'OP11-003'),
    robin: s.players[0].chars[0].uid,
    leader: s.players[0].leader.uid,
    theirLeader: s.players[1].leader.uid,
    rested: s.players[1].chars[0].uid,
  };
}

test('gestes : une carte de la main lâchée sur ton terrain la joue, ailleurs rien', () => {
  const { s, nami, usopp, robin } = setup();
  const d = s.decision!;
  const hand = { from: 'hand', uid: nami } as const;
  assert.equal(gestureKind(d, hand), 'play');
  assert.equal(gestureOption(d, hand, myZone)?.id, `play:${nami}`);
  assert.equal(gestureOption(d, hand, onMine(robin))?.id, `play:${nami}`, 'lâchée sur une de tes cartes : sur ton terrain');
  assert.equal(gestureOption(d, hand, theirZone), null, 'sur le terrain adverse : rien');
  assert.equal(gestureOption(d, hand, nowhere), null, 'hors du plateau : rien');
  assert.equal(dropCards(d, hand).size, 0, 'jouer se lâche sur le terrain, pas sur une carte');
  // trop chère : ne se saisit pas
  assert.equal(gestureKind(d, { from: 'hand', uid: usopp }), null);
  assert.equal(gestureOption(d, { from: 'hand', uid: usopp }, myZone), null);
  // l'option choisie est bien celle du moteur : Nami arrive sur le terrain
  const after = act(s, gestureOption(d, hand, myZone)!.id);
  assert.ok(after.players[0].chars.some((c) => c.uid === nami));
});

test('gestes : un attaquant lâché sur une cible attaque cette cible, sur une autre carte rien', () => {
  const { s, nami, robin, leader, theirLeader, rested } = setup();
  const d = s.decision!;
  const atk = { from: 'field', uid: robin } as const;
  assert.equal(gestureKind(d, atk), 'attack');
  assert.deepEqual([...dropCards(d, atk)].sort(), [theirLeader, rested].sort());
  assert.equal(gestureOption(d, atk, onTheirs(theirLeader))?.id, `attack:${robin}:${theirLeader}`);
  assert.equal(gestureOption(d, atk, onTheirs(rested))?.id, `attack:${robin}:${rested}`);
  assert.equal(gestureOption(d, atk, theirZone), null, 'à côté des cartes : rien');
  assert.equal(gestureOption(d, atk, onMine(leader)), null, 'sur ta propre carte : rien');
  assert.equal(gestureOption(d, atk, onTheirs(nami)), null, 'sur une carte qui n’est pas une cible : rien');
  // ton Leader se saisit seulement s’il a une attaque
  assert.equal(gestureKind(d, { from: 'field', uid: leader }) === 'attack', d.options.some((o) => o.id.startsWith(`attack:${leader}:`)));
  // une carte adverse ne se saisit jamais
  assert.equal(gestureKind(d, { from: 'field', uid: theirLeader }), null);
  const g = grabbableCards(d);
  assert.ok(g.has(nami) && g.has(robin) && !g.has(theirLeader) && !g.has(rested));
});

test('gestes : une DON!! lâchée sur une de tes cartes la lui donne, sur une carte adverse rien', () => {
  const { s, robin, leader, theirLeader, nami } = setup();
  const d = s.decision!;
  const don = { from: 'don' } as const;
  assert.equal(gestureKind(d, don), 'don');
  assert.ok(dropCards(d, don).has(robin) && dropCards(d, don).has(leader));
  assert.equal(gestureOption(d, don, onMine(robin))?.id, `don:${robin}`);
  assert.equal(gestureOption(d, don, onMine(leader))?.id, `don:${leader}`);
  assert.equal(gestureOption(d, don, onTheirs(theirLeader)), null);
  assert.equal(gestureOption(d, don, myZone), null, 'à côté des cartes : rien');
  assert.equal(gestureOption(d, don, onMine(nami)), null, 'une carte de la main ne reçoit pas de DON!!');
  const after = act(s, gestureOption(d, don, onMine(robin))!.id);
  assert.equal(after.players[0].chars[0].don, 1);
});

test('gestes : seulement en phase principale, et une seule option à la fois', () => {
  const { s, nami } = setup();
  // pas de décision (pas à toi), ou décision d'un combat : rien ne se saisit
  assert.equal(gestureKind(null, { from: 'hand', uid: nami }), null);
  assert.equal(grabbableCards(null).size, 0);
  const counter: Decision = { player: 0, kind: 'counter', prompt: '', options: [{ id: `counter:${nami}`, label: '', uid: nami }, { id: 'pass', label: '' }] };
  assert.equal(gestureKind(counter, { from: 'hand', uid: nami }), null);
  assert.equal(gestureOption(counter, { from: 'hand', uid: nami }, myZone), null);
  // un Événement [Principal] se joue aussi en le lâchant sur ton terrain
  const main = (ids: string[]): Decision => ({ player: 0, kind: 'main', prompt: '', options: ids.map((id) => ({ id, label: '' })) });
  assert.equal(gestureOption(main(['event:7', 'end']), { from: 'hand', uid: 7 }, myZone)?.id, 'event:7');
  // deux options pour le même geste (jamais produit par le moteur) : aucun effet plutôt qu'un choix au hasard
  assert.equal(gestureOption(main(['play:7', 'event:7', 'end']), { from: 'hand', uid: 7 }, myZone), null);
  assert.equal(gestureKind(main(['end']), { from: 'don' }), null, 'pas de DON!! utilisable : la réserve ne se saisit pas');
});

test('gestes : au doigt, vers le haut on joue, à l’horizontale on fait défiler la main', () => {
  assert.equal(gestureIntent(3, -4, 'hand', true), 'wait', 'sous le seuil : rien encore (un toucher ouvre le menu)');
  assert.equal(gestureIntent(2, -14, 'hand', true), 'drag');
  assert.equal(gestureIntent(9, -12, 'hand', true), 'drag', 'vers le haut, un peu de biais');
  assert.equal(gestureIntent(14, -3, 'hand', true), 'scroll');
  assert.equal(gestureIntent(-14, 6, 'hand', true), 'scroll');
  assert.equal(gestureIntent(0, 14, 'hand', true), 'scroll', 'vers le bas : pas un geste');
  assert.equal(gestureIntent(12, 8, 'field', true), 'drag', 'depuis le terrain, toute direction');
  assert.equal(gestureIntent(-8, 9, 'don', true), 'drag');
  // à la souris : la main ne défile pas au glisser, seuil plus petit
  assert.equal(gestureIntent(7, 0, 'hand', false), 'drag');
  assert.equal(gestureIntent(4, 3, 'hand', false), 'wait');
});

test('gestes : la prévision courte affichée pendant une attaque', () => {
  const { s, robin, theirLeader } = setup();
  const text = attackPreview(s, robin, theirLeader).text;
  const short = shortPreview(text);
  assert.ok(text.startsWith(short) && short.endsWith('.'));
  assert.match(short, /^\d+ contre \d+ : /);
  assert.ok(!short.includes('Pour repousser'));
  assert.equal(shortPreview('5000 contre 6000 : l’attaque échouera.'), '5000 contre 6000 : l’attaque échouera.');
});
