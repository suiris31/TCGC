// Étanchéité de la vue d'un joueur (parties en ligne) : sur des parties complètes IA contre IA, à chaque coup et pour
// chaque joueur, la vue envoyée au navigateur ne contient aucune carte cachée (ni sa carte, ni son identifiant), ni
// graine du hasard, ni instantané d'effet, ni ligne secrète ou choix de l'adversaire.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// Cartes qu'un joueur a le droit de connaître parmi les zones cachées : celles que sa décision lui montre, et la carte
// du dessus du deck adverse s'il l'a regardée
function allowed(s: GameState, seat: PlayerId): Set<number> {
  const ok = new Set<number>();
  const d = s.decision;
  if (d && d.player === seat) {
    for (const o of d.options) {
      if (o.uid !== undefined) ok.add(o.uid);
      if (o.target !== undefined) ok.add(o.target);
      for (const part of o.id.split(':').slice(1)) if (/^\d+$/.test(part)) ok.add(Number(part));
    }
  }
  const top = s.players[other(seat)].deck[0];
  if (top && s.peek[seat] === top.uid) ok.add(top.uid);
  return ok;
}

function secrets(s: GameState, seat: PlayerId): Card[] {
  const O = s.players[other(seat)];
  const P = s.players[seat];
  const ok = allowed(s, seat);
  return [...O.hand, ...O.deck, ...O.life.filter((c) => !c.faceUp), ...P.deck, ...P.life.filter((c) => !c.faceUp)].filter((c) => !ok.has(c.uid));
}

// Tous les identifiants de cartes cités dans la vue : zones, combat, modifications, décision. (Les choix passés du
// joueur lui-même peuvent citer une carte qu'il a eue sous les yeux puis remise dans son deck : il le sait.)
function citedUids(v: GameState): Set<number> {
  const out = new Set<number>();
  const json = JSON.stringify({ ...v, history: v.history.filter((h) => h.label === '') });
  for (const m of json.matchAll(/"(?:uid|target|source|attacker)":(-?\d+)/g)) out.add(Number(m[1]));
  for (const m of json.matchAll(/"(?:id|choice)":"[a-z]+((?::\d+)+)"/gi)) for (const n of m[1].split(':').slice(1)) out.add(Number(n));
  return out;
}

function check(s: GameState, seat: PlayerId, stats: { views: number; revealed: number }) {
  const v = viewFor(s, seat);
  stats.views++;
  const json = JSON.stringify(v);
  assert.equal(v.rng, 0);
  assert.equal(v.nextUid, 0);
  assert.equal(v.pending.length, 0);
  assert.ok(!json.includes('snapshot'), 'instantané d’effet dans la vue');
  // les zones gardent leur taille, les cartes cachées sont des « ? » à identifiant négatif
  for (const p of [0, 1] as PlayerId[]) {
    for (const zone of ['hand', 'deck', 'life'] as const) assert.equal(v.players[p][zone].length, s.players[p][zone].length);
  }
  const hiddenOnes = [...v.players[other(seat)].hand, ...v.players[other(seat)].deck, ...v.players[seat].deck, ...v.players[0].life, ...v.players[1].life]
    .filter((c) => c.num === HIDDEN);
  for (const c of hiddenOnes) assert.ok(c.uid < 0, 'carte cachée avec un vrai identifiant');
  const cited = citedUids(v);
  const secret = secrets(s, seat);
  for (const c of secret) {
    assert.ok(!cited.has(c.uid), `carte cachée ${c.num} (uid ${c.uid}) visible par le joueur ${seat}`);
  }
  // une carte « ? » ne remplace qu'une carte secrète, et chaque carte secrète est devenue un « ? »
  assert.equal(hiddenOnes.length, secret.length);
  const shown = [...v.players[other(seat)].hand, ...v.players[other(seat)].deck].filter((c) => c.num !== HIDDEN).length;
  stats.revealed += shown;
  // journal : rien de ce qui est réservé à l'adversaire ; décision de l'adversaire : sans ses options
  assert.ok(v.log.every((l) => l.only === undefined || l.only === seat));
  if (s.decision && s.decision.player !== seat) {
    assert.equal(v.decision!.options.length, 0);
    assert.equal(v.decision!.prompt, '');
  }
  for (const h of v.history) if (h.player !== seat) assert.equal(h.label, '');
  // ce que le joueur voit de lui-même et du terrain reste intact
  assert.deepEqual(v.players[seat].hand, s.players[seat].hand);
  assert.deepEqual(v.players[0].chars, s.players[0].chars);
  assert.deepEqual(v.players[1].leader, s.players[1].leader);
  assert.deepEqual(v.players[0].trash, s.players[0].trash);
}

test('vue d’un joueur : aucune carte cachée ne fuit, sur toutes les confrontations', () => {
  const ids = Object.keys(DECKS);
  const stats = { views: 0, revealed: 0 };
  let seed = 1;
  for (const a of ids) {
    for (const b of ids) {
      let s = newGame({ decks: [a, b], names: ['A', 'B'], seed: seed++ });
      for (let guard = 0; s.winner === null && guard < 2000; guard++) {
        check(s, 0, stats);
        check(s, 1, stats);
        s = act(s, heuristicChooser(s, s.decision!));
      }
      check(s, 0, stats);
      check(s, 1, stats);
    }
  }
  assert.ok(stats.views > 5000, `trop peu de situations vérifiées (${stats.views})`);
  // des cartes regardées par un effet ou la carte du dessus regardée ont bien été montrées au bon joueur
  assert.ok(stats.revealed > 0);
});

test('vue d’un joueur : les vrais identifiants, qui suivent l’ordre de la liste du deck, ne sont jamais envoyés', () => {
  const s = newGame({ decks: ['ST-35', 'ST-36'], names: ['A', 'B'], seed: 7 });
  const v = viewFor(s, 0);
  // la main adverse : 5 cartes « ? » à identifiants opaques qui ne dépendent que de leur place
  assert.deepEqual(v.players[1].hand.map((c) => c.num), Array(5).fill(HIDDEN));
  assert.deepEqual(v.players[1].hand.map((c) => c.uid), [-1000, -1001, -1002, -1003, -1004]);
  assert.ok(v.players[0].deck.every((c) => c.num === HIDDEN));
  assert.ok(v.players[0].life.every((c) => c.num === HIDDEN));
});
