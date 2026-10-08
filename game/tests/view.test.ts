// Étanchéité de la vue d'un joueur (parties en ligne) : sur des parties complètes IA contre IA, à chaque coup et pour
// chaque joueur, la vue envoyée au navigateur ne contient aucune carte cachée (ni sa carte, ni son identifiant), ni
// graine du hasard, ni instantané d'effet, ni ligne secrète ou choix de l'adversaire.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { knows, lifeToHand, reveal } from '../engine/rules.ts';
import { hasOption, play, scenario, setDon, setHand } from './helpers.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// Cartes qu'un joueur a le droit de connaître parmi les zones cachées : celles que sa décision lui montre, celles qui
// lui ont été révélées (voir knowledge.test.ts) et la carte du dessus du deck adverse s'il l'a regardée
function allowed(s: GameState, seat: PlayerId): Set<number> {
  const ok = new Set<number>();
  for (const P of s.players) for (const c of [...P.hand, ...P.deck, ...P.life]) if (knows(s, seat, c.uid)) ok.add(c.uid);
  const d = s.decision;
  if (d && d.player === seat) {
    for (const o of d.options) {
      if (o.uid !== undefined) ok.add(o.uid);
      if (o.target !== undefined) ok.add(o.target);
    }
    for (const c of d.cards ?? []) ok.add(c.uid);
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
  // identifiants d'options qui désignent des cartes (« cost:4 », coût déclaré, et « choice:1 », effet choisi, n'en
  // désignent pas)
  for (const m of json.matchAll(/"(?:id|choice)":"(?!cost:|choice:)[a-z]+((?::\d+)+)"/gi)) for (const n of m[1].split(':').slice(1)) out.add(Number(n));
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

test('vue d’un joueur : un coût déclaré (« cost:4 ») ou un effet choisi (« choice:1 ») ne montre aucune carte', () => {
  // les cartes d'identifiant 0 à 10 sont celles du joueur 0 (deck et main) : elles restaient visibles par le joueur 1
  // quand une de ses options s'appelait « cost:n » (lecture des nombres de l'identifiant de l'option)
  const s = newGame({ decks: ['ST-34', 'ST-34'], names: ['A', 'B'], seed: 3, first: 0 });
  s.decision = {
    player: 1, kind: 'effect', prompt: 'Déclare un coût', tag: 'declareCost', inEffect: true,
    options: [...Array.from({ length: 11 }, (_, n) => ({ id: `cost:${n}`, label: `Coût ${n}` })), { id: 'choice:1', label: 'Effet 2' }],
  };
  const v = viewFor(s, 1);
  const P = v.players[0];
  assert.ok([...P.hand, ...P.deck, ...P.life].every((c) => c.num === HIDDEN && c.uid < 0));
});

// ---------- fuites indirectes (audit de l'étape RL) ----------

test('vue : ni les Contres ni les questions d’effet de l’adversaire (leur existence trahit sa main), ni l’étiquette de sa décision', () => {
  const s = newGame({ decks: ['ST-31', 'ST-35'], names: ['A', 'B'], seed: 5, first: 0 });
  s.history = [
    { turn: 2, player: 1, kind: 'main', prompt: 'p', choice: 'end', label: 'Fin du tour' },
    { turn: 3, player: 1, kind: 'counter', prompt: 'p', choice: 'pass', label: 'Ne pas contrer' },
    { turn: 3, player: 1, kind: 'effect', tag: 'trigger', prompt: 'p', choice: 'hand', label: 'Ajouter à la main' },
    { turn: 3, player: 0, kind: 'effect', tag: 'pick', prompt: 'p', choice: 'none', label: 'Aucune' },
  ];
  s.decision = { player: 1, kind: 'effect', tag: 'playFree', prompt: 'secret', options: [{ id: 'none', label: 'Aucun' }], source: 3, inEffect: true };
  const v = viewFor(s, 0);
  assert.deepEqual(v.history.map((h) => [h.player, h.kind]), [[1, 'main'], [0, 'effect']]);
  assert.equal(v.history[0].tag, undefined);
  assert.deepEqual(v.decision, { player: 1, kind: 'effect', prompt: '', options: [] });
});

test('vue : main adverse dans un ordre qui ne dit rien (cartes connues d’abord, puis cachées)', () => {
  const s = newGame({ decks: ['ST-31', 'ST-35'], names: ['A', 'B'], seed: 5, first: 0 });
  const O = s.players[1];
  const last = O.hand[O.hand.length - 1];
  reveal(s, [last.uid], 0);
  const v = viewFor(s, 0);
  assert.equal(v.players[1].hand[0].uid, last.uid);
  assert.deepEqual(v.players[1].hand.slice(1).map((c) => c.uid), [-1000, -1001, -1002, -1003]);
});

test('vue : deux exemplaires d’une carte, l’un connu de l’adversaire : c’est le connu qui est joué', () => {
  const s = scenario(['ST-31', 'ST-35'], (g) => {
    const [a, b] = setHand(g, 0, ['ST31-002', 'ST31-002']);
    reveal(g, [b.uid], 1);
    setDon(g, 0, 10);
    assert.ok(a.uid !== b.uid);
  });
  const [a, b] = s.players[0].hand;
  assert.ok(hasOption(s, `play:${b.uid}`), 'l’exemplaire connu de l’adversaire est proposé');
  assert.ok(!hasOption(s, `play:${a.uid}`));
  // après avoir joué « un Jinbe », l'adversaire ne voit plus aucun Jinbe connu dans la main
  const after = act(s, `play:${b.uid}`);
  assert.ok(viewFor(after, 1).players[0].hand.every((c) => c.num === HIDDEN));
});

test('vue : cartes regardées pendant un effet, toutes montrées au joueur (et à lui seul)', () => {
  let s = scenario(['ST-31', 'ST-35'], (g) => {
    setHand(g, 0, ['OP01-016']);
    setDon(g, 0, 10);
  });
  s = play(s, 'OP01-016');
  if (s.decision?.tag !== 'pick') return;  // aucune carte à prendre parmi les 5 : pas de question
  assert.equal(s.decision.cards?.length, 5);
  const mine = viewFor(s, 0);
  assert.equal(mine.decision?.cards?.length, 5);
  assert.equal(viewFor(s, 1).decision?.cards, undefined);
});

test('vue : une carte de Vie face visible ajoutée à la main reste connue de l’adversaire', () => {
  const s = newGame({ decks: ['ST-31', 'ST-35'], names: ['A', 'B'], seed: 9, first: 0 });
  const g = act(act(s, 'keep'), 'keep');
  const P = g.players[1];
  P.life[0].faceUp = true;
  const uid = P.life[0].uid;
  lifeToHand(g, 1, 'top');
  assert.ok(viewFor(g, 0).players[1].hand.some((c) => c.uid === uid && c.num !== HIDDEN));
});
