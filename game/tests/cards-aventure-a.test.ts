// Cartes des adversaires de l'aventure, liste A (tâche 1.15) : la Marine de Shells Town (Leader Kobby), le Chat Noir
// (Kuro) et la Marine de Loguetown (Smoker). Decks d'essai faits des cartes de la liste, contre ST-21 (conditions
// fausses : autre Leader).
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from '../engine/engine.ts';
import { canBeKO } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { attack, coherent, scenario, setChars } from './helpers.ts';

// adversaire ST-21
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const mineOf = (s: GameState, p: 0 | 1, num: string) => s.players[p].chars.find((c) => c.num === num)!;
// le défenseur ne bloque pas et ne contre pas
function noDefense(s: GameState) {
  while (s.decision && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
}

test('Moteur : « aucun de vos Personnages ne peut être mis KO pour tout le tour » (White Out), Personnages joués ensuite compris', () => {
  // tour du joueur 1 : le joueur 0 est protégé pour ce tour
  let s = scenario(['ST-21', 'ST-21'], (g) => {
    setChars(g, 0, [{ num: O_STUSSY, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_LUFFY }]);
    g.players[0].noKoTurn = g.turn;
  }, 1);
  const stussy = mineOf(s, 0, O_STUSSY).uid;
  assert.equal(canBeKO(s, stussy, 'effect', 1), false);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, stussy));
  assert.ok(s.players[0].chars.some((c) => c.uid === stussy), '6000 contre 5000 : pas mis KO');
  coherent(s);
  // un Personnage arrivé après l'effet est protégé aussi ; l'adversaire, lui, ne l'est pas
  const late = s.players[0].deck.find((c) => c.num === O_LUFFY)!;
  s.players[0].deck = s.players[0].deck.filter((c) => c !== late);
  s.players[0].chars.push({ ...late, rested: false, don: 0, playedTurn: s.turn, usedOpt: [] });
  assert.equal(canBeKO(s, late.uid, 'battle', 1), false);
  assert.equal(canBeKO(s, theirs(s, O_LUFFY).uid, 'effect', 0), true);
  // le tour suivant, la protection a pris fin
  s.turn++;
  assert.equal(canBeKO(s, stussy, 'battle', 1), true);
  // sans la protection : mis KO
  s = scenario(['ST-21', 'ST-21'], (g) => {
    setChars(g, 0, [{ num: O_STUSSY, extra: { rested: true } }]);
    setChars(g, 1, [{ num: O_LUFFY }]);
  }, 1);
  s = noDefense(attack(s, theirs(s, O_LUFFY).uid, mineOf(s, 0, O_STUSSY).uid));
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
});
