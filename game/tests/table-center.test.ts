// Bande centrale du plateau sur ordinateur (tâche R2.3) : le dernier coup de l'adversaire, et le verdict de la
// prévision d'attaque
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState, LogEntry } from '../engine/types.ts';
import { lastMove, verdict } from '../ui/table/center.ts';

// un état réduit au journal : seule la partie que lit lastMove
const withLog = (log: LogEntry[]) => ({ log } as unknown as GameState);
const line = (player: 0 | 1 | null, text: string, only?: 0 | 1): LogEntry => ({ player, text, ...(only !== undefined ? { only } : {}) } as LogEntry);

test('bande centrale : le dernier coup de l’adversaire, pendant son tour', () => {
  const s = withLog([line(null, '— Tour 2 : IA —'), line(1, 'pioche 1 carte'), line(1, 'joue Nefeltari Vivi'), line(1, 'donne 1 DON!! à Vivi')]);
  assert.equal(lastMove(s, 0), 'donne 1 DON!! à Vivi');
  // la ligne du nouveau tour est au nom du joueur dont c'est le tour : ce n'est pas un coup
  const start = withLog([line(0, 'joue Karoo'), line(1, '— Tour 2 : IA —'), line(1, 'pioche 1 carte')]);
  assert.equal(lastMove(start, 0), null);
});

test('bande centrale : au tour suivant, le dernier vrai coup de l’adversaire (pas « termine son tour »)', () => {
  const s = withLog([
    line(null, '— Tour 2 : IA —'), line(1, 'joue Nefeltari Vivi'), line(1, 'termine son tour'),
    line(null, '— Tour 3 : Toi —'), line(0, 'pioche 1 carte'), line(0, 'joue Karoo'),
  ]);
  assert.equal(lastMove(s, 0), 'joue Nefeltari Vivi');
});

test('bande centrale : rien de plus vieux que le tour précédent, rien de secret ni de mes coups', () => {
  const old = withLog([
    line(null, '— Tour 2 : IA —'), line(1, 'joue Nefeltari Vivi'),
    line(null, '— Tour 3 : Toi —'), line(0, 'joue Karoo'),
    line(null, '— Tour 4 : IA —'), line(1, 'pioche 1 carte'),
  ]);
  assert.equal(lastMove(old, 0), null);
  const secret = withLog([line(null, '— Tour 2 : IA —'), line(1, 'joue Vivi'), line(1, 'ajoute Usopp à sa main', 1)]);
  assert.equal(lastMove(secret, 0), 'joue Vivi');
  assert.equal(lastMove(secret, 1), null, 'mes propres coups ne s’affichent pas');
});

test('bande centrale : la prévision d’attaque en une phrase', () => {
  assert.equal(verdict('6000 contre 5000 : ça passe, il perd 1 Vie (il en a 5). Pour repousser, l\'adversaire doit contrer d\'au moins +2000 (4 cartes en main).'),
    '6000 contre 5000 : ça passe, il perd 1 Vie (il en a 5)');
  assert.equal(verdict('4000 contre 5000 : l\'attaque échouera.'), '4000 contre 5000 : l\'attaque échouera');
});
