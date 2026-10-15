// Choix inutiles (game/ai/prune.ts) : exceptions des règles générales, et sortes pénalisées par l'entraînement
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useless } from '../ai/prune.ts';
import { act } from '../engine/engine.ts';
import { power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { attack, scenario, setChars, setDon, setHand } from './helpers.ts';

const kindOf = (s: GameState, id: string) => {
  const o = s.decision!.options.find((x) => x.id === id);
  assert.ok(o, `choix introuvable : ${id} parmi ${s.decision!.options.map((x) => x.id).join(', ')}`);
  return useless(s, s.decision!, o)?.kind ?? null;
};

test('DON!! sur une carte qui ne peut plus attaquer : utile si son effet compte au tour adverse (ST-21)', () => {
  const s = scenario(['ST-21', 'ST-35'], (g) => {
    setChars(g, 0, [
      { num: 'ST21-002', extra: { rested: true } },           // Usopp : [DON!! x2] [Tour adverse] +2000
      { num: 'ST21-004', extra: { rested: true } },           // Bonney : [DON!! x2] [En cas de KO] piocher 1
      { num: 'ST21-011', extra: { rested: true, don: 2 } },   // Franky : a déjà ses 2 DON!!
      { num: 'ST21-005', extra: { rested: true } },           // Jinbe : aucun effet
    ]);
    setDon(g, 0, 3);
  });
  const [usopp, bonney, franky, jinbe] = s.players[0].chars;
  assert.equal(kindOf(s, `don:${usopp.uid}`), null);
  assert.equal(kindOf(s, `don:${bonney.uid}`), null);
  assert.equal(kindOf(s, `don:${franky.uid}`), 'idleDon');
  assert.equal(kindOf(s, `don:${jinbe.uid}`), 'idleDon');
});

test('DON!! sur Zoro (ST21-015) joué ce tour : 2 DON!! lui donnent [Initiative]', () => {
  const s = scenario(['ST-21', 'ST-35'], (g) => {
    setChars(g, 0, [{ num: 'ST21-015', extra: { playedTurn: g.turn } }, { num: 'ST21-003', extra: { playedTurn: g.turn } }]);
    setDon(g, 0, 3);
  });
  const [zoro, sanji] = s.players[0].chars;
  assert.equal(kindOf(s, `don:${zoro.uid}`), null);
  assert.equal(kindOf(s, `don:${sanji.uid}`), 'idleDon');
});

test('attaque trop faible : utile si elle déclenche un effet « quand ... » (Mihawk ST32-003 pioche en s’épuisant)', () => {
  const s = scenario(['ST-32', 'ST-32'], (g) => {
    setChars(g, 0, [{ num: 'ST32-003' }, { num: 'OP12-023' }]);
    setChars(g, 1, [{ num: 'OP15-036', extra: { rested: true } }]);   // Ryuma, 8000
  });
  const [mihawk, kawamatsu] = s.players[0].chars;
  const ryuma = s.players[1].chars[0].uid;
  assert.ok(power(s, mihawk.uid) < power(s, ryuma) && power(s, kawamatsu.uid) < power(s, ryuma));
  assert.equal(kindOf(s, `attack:${mihawk.uid}:${ryuma}`), null);
  assert.equal(kindOf(s, `attack:${kawamatsu.uid}:${ryuma}`), 'weakAttack');
});

test('attaque trop faible du Leader Xebec : Newgate peut lui donner +3000 ; pas aux Personnages', () => {
  const s = scenario(['META-XEBEC-2026-10', 'META-XEBEC-2026-10'], (g) => {
    setChars(g, 0, [{ num: 'OP17-040' }, { num: 'OP17-045' }]);   // Newgate, Kyo (4000)
    setChars(g, 1, [{ num: 'OP17-049', extra: { rested: true } }]);   // Linlin, 7000
  });
  const leader = s.players[0].leader.uid;
  const kyo = s.players[0].chars[1].uid;
  const linlin = s.players[1].chars[0].uid;
  assert.ok(power(s, leader) < power(s, linlin));
  assert.equal(kindOf(s, `attack:${leader}:${linlin}`), null);
  assert.equal(kindOf(s, `attack:${kyo}:${linlin}`), 'weakAttack');
});

// L'adversaire (joueur 1) attaque le Leader Kaido (5000) avec Hack (4000) : l'attaque échoue déjà
function repelled(others: string[], hand: string[], blockers: string[] = []) {
  let s = scenario(['META-KAIDO-2026-10', 'ST-35'], (g) => {
    setChars(g, 0, blockers.map((num) => ({ num })));
    setHand(g, 0, hand);
    setDon(g, 0, 3);
    setChars(g, 1, [{ num: 'ST35-001' }, ...others.map((num) => ({ num }))]);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  if (s.decision!.tag === 'may') s = act(s, 'no');   // [Attaque adverse] du Leader Kaido (DON!! −1 : −2000) : non
  assert.ok(power(s, s.battle!.attacker) < power(s, s.battle!.target));
  return s;
}

test('Contre sur une attaque déjà repoussée : inutile, sauf un Événement qui fait autre chose (Ramollo Beam Sword)', () => {
  // un Personnage adverse encore redressé : Ramollo Beam Sword l'épuise (il ne pourra plus attaquer ce tour)
  let s = repelled(['OP13-008'], ['OP07-076', 'EB04-040']);
  assert.equal(s.decision!.kind, 'counter');
  const [ramollo, torche] = s.players[0].hand;
  assert.equal(kindOf(s, `cevent:${ramollo.uid}`), null);
  assert.equal(kindOf(s, `cevent:${torche.uid}`), 'repelled');
  // aucun Personnage adverse à épuiser : Ramollo Beam Sword ne sert plus à rien
  s = repelled([], ['OP07-076']);
  assert.equal(kindOf(s, `cevent:${s.players[0].hand[0].uid}`), 'repelled');
});

test('Bloqueur sur une attaque déjà repoussée : inutile', () => {
  const s = repelled([], [], ['OP17-074']);   // Yamato, [Bloqueur]
  assert.equal(s.decision!.kind, 'blocker');
  assert.equal(kindOf(s, `block:${s.players[0].chars[0].uid}`), 'repelled');
});
