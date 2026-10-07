// Tests ciblés des effets du ST-35, sur des situations construites à la main
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, advance, newGame } from '../engine/engine.ts';
import { fieldCost, hasBlocker, power } from '../engine/rules.ts';
import type { Card, FieldCard, GameState, PlayerId } from '../engine/types.ts';

let uid = 5000;
const card = (num: string): Card => ({ uid: uid++, num });
const field = (num: string, extra: Partial<FieldCard> = {}): FieldCard => ({ uid: uid++, num, rested: false, don: 0, playedTurn: 0, usedOpt: [], ...extra });

// Partie après les mains de départ, tour du joueur 0, modifiée par setup puis relancée jusqu'à la décision suivante
function scenario(setup: (s: GameState) => void): GameState {
  const s = act(act(newGame({ decks: ['ST-35', 'ST-35'], names: ['Moi', 'IA'], seed: 7, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.turn = 5;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

const attack = (s: GameState, attacker: number, target: number) => act(s, `attack:${attacker}:${target}`);

const option = (s: GameState, pred: (id: string) => boolean) => {
  const o = s.decision!.options.find((x) => pred(x.id));
  assert.ok(o, `option introuvable parmi : ${s.decision!.options.map((x) => x.id).join(', ')}`);
  return o.id;
};

test('Sabo P-105 : coût 8 et [Bloqueur] avec un Leader Armée révolutionnaire', () => {
  const sabo = field('P-105');
  const s = scenario((g) => { g.players[1].chars = [sabo]; });
  assert.equal(fieldCost(s, sabo.uid), 8);
  assert.equal(hasBlocker(s, 1, s.players[1].chars[0]), true);
});

test('Pointe dépilatoire : +4000 avec un Personnage Armée révolutionnaire de coût 8 ou plus', () => {
  const pointe = card('OP12-098');
  let s = scenario((g) => {
    g.players[0].donActive = 3;
    g.players[0].leader.don = 0;
    g.players[1].hand = [pointe];
    g.players[1].donActive = 1;
    g.players[1].chars = [field('OP12-093')]; // Morley, coût 8
  });
  const leader = s.players[0].leader.uid;
  // 3 DON!! au Leader : 5000 −1000 +3000 = 7000
  for (let i = 0; i < 3; i++) s = act(s, `don:${leader}`);
  s = attack(s, leader, s.players[1].leader.uid);
  assert.equal(s.decision!.kind, 'counter');
  s = act(s, `cevent:${pointe.uid}`);
  // Leader adverse : 5000 −1000 (5 Vies) +4000 = 8000 > 7000 : l'attaque est repoussée et le combat se termine
  const texts = s.log.map((l) => l.text);
  assert.ok(texts.some((t) => t.includes('+4000 de puissance pour le combat')));
  assert.ok(texts.some((t) => t.includes('repoussée (7000 contre 8000)')));
  assert.equal(s.players[1].life.length, 5);
});

test('Emporio Ivankov remplace la mise KO par un effet adverse', () => {
  const corbeau = field('ST35-003', { rested: true });
  const ivankov = field('OP13-008');
  const ace = card('OP13-019');
  let s = scenario((g) => {
    g.players[0].hand = [ace];
    g.players[0].donActive = 5;
    g.players[1].chars = [corbeau, ivankov];
  });
  s = act(s, `event:${ace.uid}`);
  s = act(s, 'yes'); // épuiser 4 DON!!
  s = act(s, `card:${corbeau.uid}`); // −3000 sur Corbeau (4000 -> 1000)
  s = act(s, `card:${corbeau.uid}`); // KO de Corbeau
  assert.equal(s.decision!.player, 1);
  assert.equal(s.decision!.tag, 'replace');
  s = act(s, `replace:${ivankov.uid}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), ['ST35-003']);
  assert.ok(s.players[1].trash.some((c) => c.uid === ivankov.uid));
  assert.equal(s.players[0].donActive, 0);
});

test('Bartholomew Kuma joue Hack depuis la Défausse, dont l’effet [Jouée] se déclenche', () => {
  const kuma = card('ST35-005');
  const hack = card('ST35-001');
  const weak = field('OP13-008'); // Ivankov adverse, 3000 de base : pas une cible de Hack
  let s = scenario((g) => {
    g.players[0].hand = [kuma];
    g.players[0].trash = [hack];
    g.players[0].donActive = 5;
    g.players[0].donRested = 1;
    g.players[1].chars = [weak];
  });
  s = act(s, `play:${kuma.uid}`);
  assert.equal(s.decision!.tag, 'playFree');
  s = act(s, `trash:${hack.uid}`);
  const P = s.players[0];
  assert.deepEqual(P.chars.map((c) => c.num).sort(), ['ST35-001', 'ST35-005']);
  assert.equal(P.leader.don, 1); // DON!! épuisée donnée au Leader
  assert.equal(fieldCost(s, P.chars.find((c) => c.num === 'ST35-005')!.uid), 8);
  // Ivankov (3000 de base) n'est pas une cible de Hack : retour à la phase principale
  assert.equal(s.decision!.kind, 'main');
});

test('Attaque sur un Personnage : seul un Personnage épuisé peut être ciblé', () => {
  const awake = field('ST35-003');
  const tired = field('OP12-090', { rested: true });
  const s = scenario((g) => { g.players[1].chars = [awake, tired]; });
  const targets = s.decision!.options.filter((o) => o.uid === s.players[0].leader.uid && o.group === 'attack').map((o) => o.target);
  assert.ok(targets.includes(tired.uid));
  assert.ok(!targets.includes(awake.uid));
});

test('Dégâts sans Vie : défaite', () => {
  let s = scenario((g) => {
    g.players[1].life = [];
    g.players[0].donActive = 2;
  });
  const leader = s.players[0].leader.uid;
  s = act(s, `don:${leader}`);
  s = act(s, `don:${leader}`);
  s = attack(s, leader, s.players[1].leader.uid);
  while (s.decision && s.winner === null) s = act(s, s.decision.kind === 'counter' ? 'pass' : s.decision.kind === 'blocker' ? 'noblock' : s.decision.options[0].id);
  assert.equal(s.winner, 0 as PlayerId);
});
