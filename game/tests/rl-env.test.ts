// Environnement d'apprentissage par renforcement (game/rl/) : déterminisme, robustesse sur des parties complètes,
// étanchéité des observations (rien de caché ne doit pouvoir en être déduit), pointeurs des options, plafond de
// sécurité, trajectoires rejouables, équivalence de actInPlace avec act, serveur pour Python.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { determinize } from '../ai/search.ts';
import { replayRecord } from '../coach/archive.ts';
import { DECKS } from '../engine/decks.ts';
import { act, actInPlace, newGame } from '../engine/engine.ts';
import { invariantErrors } from '../engine/invariants.ts';
import { random } from '../engine/rng.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { DYN_DIM, encodeObservation, GLOBAL_DIM, OPTION_DIM, type Observation } from '../rl/encode.ts';
import { RlEnv, type ResetOptions } from '../rl/env.ts';
import { STATIC_DIM, staticFeatures } from '../rl/features.ts';
import type { SeatSpec } from '../rl/opponents.ts';
import { makeTrajectory, narrate, replayTrajectory, toGameRecord } from '../rl/record.ts';
import { expectTag, play, scenario, setDeckTop, setDon, setHand } from './helpers.ts';

const ids = Object.keys(DECKS);
const pairs: [string, string][] = ids.flatMap((a) => ids.map((b) => [a, b] as [string, string]));
const AGENTS: [SeatSpec, SeatSpec] = [{ kind: 'agent' }, { kind: 'agent' }];

// Partie complète avec des choix au hasard (graine propre aux choix) ; visit est appelé avant chaque décision du modèle
function playRandom(opts: ResetOptions, choiceSeed: number, visit?: (env: RlEnv) => void): RlEnv {
  const env = new RlEnv().reset(opts);
  const r = { rng: choiceSeed };
  while (!env.done) {
    visit?.(env);
    env.step(Math.floor(random(r) * env.legal().length));
  }
  return env;
}

const same = (a: Observation, b: Observation) => {
  assert.deepEqual(a.nums, b.nums);
  assert.deepEqual([...a.group], [...b.group]);
  assert.deepEqual([...a.dyn], [...b.dyn]);
  assert.deepEqual([...a.global], [...b.global]);
  assert.deepEqual(a.options, b.options);
  assert.deepEqual([...a.opt], [...b.opt]);
  assert.deepEqual([...a.ptr], [...b.ptr]);
};

test('actInPlace donne exactement le même résultat que act, sur des parties complètes', () => {
  for (const [k, decks] of pairs.entries()) {
    const r1 = { rng: k + 1 };
    const r2 = { rng: k + 1 };
    let a = newGame({ decks, names: ['A', 'B'], seed: 300 + k, first: 'random' });
    let b = structuredClone(a);
    while (a.winner === null) {
      const c1 = a.decision!.options[Math.floor(random(r1) * a.decision!.options.length)].id;
      const c2 = b.decision!.options[Math.floor(random(r2) * b.decision!.options.length)].id;
      assert.equal(c1, c2);
      a = act(a, c1);
      b = actInPlace(b, c2);
      assert.deepEqual(b, a);
    }
  }
});

test('act ne modifie jamais l’état reçu (actInPlace le peut)', () => {
  const s = newGame({ decks: ['ST-31', 'ST-35'], names: ['A', 'B'], seed: 1, first: 0 });
  const before = JSON.stringify(s);
  act(s, 'keep');
  assert.equal(JSON.stringify(s), before);
});

test('déterminisme : même graine et mêmes choix -> même partie ; autre graine -> autre partie', () => {
  const opts: ResetOptions = { seed: 42, decks: ['ST-32', 'ST-34'], first: 'random', seats: AGENTS };
  const a = playRandom(opts, 7);
  const b = playRandom(opts, 7);
  assert.deepEqual(b.steps, a.steps);
  assert.deepEqual(b.result(), a.result());
  const c = playRandom({ ...opts, seed: 43 }, 7);
  assert.notDeepEqual(c.steps, a.steps);
});

test('parties complètes au hasard sur toutes les confrontations : cohérentes, observations bien formées', () => {
  let observed = 0;
  for (const [k, decks] of pairs.entries()) {
    for (const g of [0, 1]) {
      const env = playRandom({ seed: 1000 + 2 * k + g, decks, first: g as PlayerId, seats: AGENTS }, 17 + k, (e) => {
        const s = e.state;
        if (!s.decision!.inEffect) assert.deepEqual(invariantErrors(s), []);
        const seat = e.toAct!;
        assert.equal(s.decision!.player, seat);
        assert.ok(e.legal().length >= 2, 'les décisions à une seule option sont jouées automatiquement');
        const o = e.observe(seat);
        const n = o.nums.length;
        assert.equal(o.dyn.length, n * DYN_DIM);
        assert.equal(o.group.length, n);
        assert.equal(o.global.length, GLOBAL_DIM);
        assert.deepEqual(o.options, e.legal().map((x) => x.id));
        assert.equal(o.opt.length, o.options.length * OPTION_DIM);
        for (const x of [...o.dyn, ...o.global, ...o.opt]) assert.ok(Number.isFinite(x));
        for (const p of o.ptr) assert.ok(p >= -1 && p < n);
        // toute option qui désigne une carte pointe vers un jeton de cette carte
        e.legal().forEach((opt, a) => {
          if (opt.uid !== undefined) assert.ok(o.ptr[2 * a] >= 0, `option sans jeton : ${opt.id} (${opt.label})`);
          if (opt.target !== undefined) assert.ok(o.ptr[2 * a + 1] >= 0, `cible sans jeton : ${opt.id}`);
          if (opt.num && o.ptr[2 * a] >= 0) assert.equal(o.nums[o.ptr[2 * a]], opt.num);
        });
        observed++;
      });
      const r = env.result();
      assert.equal(r.error, null);
      assert.equal(r.truncated, false);
      assert.ok(r.winner === 0 || r.winner === 1);
    }
  }
  assert.ok(observed > 1000);
});

// Étanchéité : redistribuer au hasard tout ce que le joueur ne peut pas connaître (main adverse, decks, Vies face
// cachée, en gardant les cartes révélées) ne doit rien changer à son observation. Si une seule caractéristique dépendait
// d'une carte cachée, ce test la verrait.
test('observation : identique quand on redistribue les cartes cachées (aucune information cachée)', () => {
  let checked = 0;
  for (const [k, decks] of pairs.entries()) {
    playRandom({ seed: 5000 + k, decks, first: 'random', seats: AGENTS }, 31 + k, (e) => {
      const s: GameState = e.state;
      const seat = e.toAct!;
      if ((checked++ % 3) !== 0) return;
      const base = encodeObservation(viewFor(s, seat), seat);
      const opp: PlayerId = seat === 0 ? 1 : 0;
      // carte du dessus du deck adverse regardée plus tôt mais qui n'y est plus : sans effet sur la vue (viewFor ne
      // garde que la carte regardée encore au-dessus) ; la redistribution pourrait la remettre au-dessus par hasard
      const stalePeek = s.peek[seat] !== null && s.players[opp].deck[0]?.uid !== s.peek[seat];
      for (const seed of [11, 12]) {
        const d = determinize(s, seat, seed + checked);
        if (stalePeek) d.peek[seat] = null;
        same(encodeObservation(viewFor(d, seat), seat), base);
      }
    });
  }
  assert.ok(checked > 1000);
});

test('observation : la vue de l’adversaire ne change rien quand on change la main de l’autre joueur', () => {
  const env = new RlEnv().reset({ seed: 77, decks: ['ST-33', 'ST-36'], first: 0, seats: AGENTS });
  while (!env.done && env.state.turn < 4) env.step(0);
  const s = env.state;
  const seat = env.toAct!;
  const opp: PlayerId = seat === 0 ? 1 : 0;
  const t = structuredClone(s);
  // échange la main adverse avec des cartes de son deck (même nombre de cartes)
  const O = t.players[opp];
  const n = O.hand.length;
  const swapped = [...O.deck.splice(0, n)];
  O.deck.push(...O.hand);
  O.hand = swapped;
  same(encodeObservation(viewFor(t, seat), seat), encodeObservation(viewFor(s, seat), seat));
});

test('caractéristiques statiques : définies pour toutes les cartes des decks, différentes d’une carte à l’autre', () => {
  const seen = new Set<string>();
  for (const deck of Object.values(DECKS)) {
    for (const num of [deck.leader, ...Object.keys(deck.cards)]) {
      const f = staticFeatures(num);
      assert.equal(f.length, STATIC_DIM);
      for (const x of f) assert.ok(Number.isFinite(x));
      seen.add([...f].join(','));
    }
  }
  assert.ok(seen.size > 30);
});

test('plafond de sécurité : partie tronquée, sans gagnant', () => {
  const env = playRandom({ seed: 3, decks: ['ST-31', 'ST-31'], first: 0, seats: AGENTS, maxDecisions: 25 }, 5);
  const r = env.result();
  assert.equal(r.truncated, true);
  assert.equal(r.winner, null);
  assert.equal(r.decisions, 25);
  assert.equal(env.toAct, null);
});

test('adversaires intégrés : aléatoire, heuristique et Monte-Carlo reproductibles', () => {
  for (const kind of ['random', 'heuristic', 'mc'] as const) {
    const opts: ResetOptions = { seed: 21, decks: ['ST-35', 'ST-33'], first: 1, seats: [{ kind: 'agent' }, { kind, samples: 2 }] };
    const a = playRandom(opts, 9);
    const b = playRandom(opts, 9);
    assert.deepEqual(b.steps, a.steps, kind);
    assert.ok(a.steps.some((x) => x.p === 1 && x.by === 'builtin'), kind);
    assert.ok(a.steps.every((x) => x.p === 0 || x.by !== 'agent'), kind);
  }
});

test('trajectoire : rejouée à l’identique, racontée, et importable dans « Mes parties »', () => {
  const opts: ResetOptions = { seed: 8, decks: ['ST-34', 'ST-32'], first: 'random', seats: [{ kind: 'agent' }, { kind: 'heuristic' }] };
  const env = new RlEnv().reset(opts);
  const r = { rng: 4 };
  while (!env.done) {
    const n = env.legal().length;
    const probs = Array.from({ length: n }, () => 1 / n);
    env.step(Math.floor(random(r) * n), { probs, value: 0 });
  }
  const t = makeTrajectory(env.options, env.state, env.steps, env.result(), 'test');
  const back = JSON.parse(JSON.stringify(t));
  const { final, states } = replayTrajectory(back);
  assert.equal(final.winner, env.result().winner);
  assert.equal(states.length, t.steps.length);
  assert.match(narrate(back), /Gagnant/);
  const rec = toGameRecord(back, 0);
  assert.ok(rec.status === 'won' || rec.status === 'lost');
  assert.equal(rec.status === 'won', final.winner === 0);
  assert.equal(replayRecord(rec).final.winner, final.winner);
});

test('trajectoire : un rejeu qui diverge est signalé', () => {
  const env = playRandom({ seed: 2, decks: ['ST-31', 'ST-32'], first: 0, seats: AGENTS }, 3);
  const t = makeTrajectory(env.options, env.state, env.steps, env.result(), 'test');
  t.steps[5] = { ...t.steps[5], c: 'choix-inexistant' };
  assert.throws(() => replayTrajectory(t), /ne se rejoue plus/);
});

// Serveur pour Python : une session init / reset / step complète, en lisant les réponses binaires
test('serveur : init, reset et step par lots, réponses binaires cohérentes', async () => {
  const server = spawn(process.execPath, ['--no-warnings', join(import.meta.dirname, '..', 'rl', 'server.ts')], {
    env: { ...process.env, OPCG_CATALOG: process.env.OPCG_CATALOG ?? join(import.meta.dirname, '..', '..', 'data', 'game-catalog.json') },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let pending = Buffer.alloc(0);
  const waiters: ((b: Buffer) => void)[] = [];
  server.stdout.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4 && pending.length >= 4 + pending.readUInt32LE(0)) {
      const size = pending.readUInt32LE(0);
      const payload = pending.subarray(4, 4 + size);
      pending = pending.subarray(4 + size);
      waiters.shift()!(payload);
    }
  });
  const call = (cmd: object) => new Promise<{ header: any; buffers: Record<string, Float32Array | Int32Array> }>((resolve) => {
    waiters.push((payload) => {
      const hl = payload.readUInt32LE(0);
      const header = JSON.parse(payload.subarray(4, 4 + hl).toString('utf8'));
      let at = 4 + hl + ((4 - (hl % 4)) % 4);
      const buffers: Record<string, Float32Array | Int32Array> = {};
      for (const [name, dtype, count] of header.buffers ?? []) {
        const bytes = payload.subarray(at, at + count * 4);
        const copy = new Uint8Array(bytes).buffer;
        buffers[name] = dtype === 'f32' ? new Float32Array(copy) : new Int32Array(copy);
        at += count * 4;
      }
      resolve({ header, buffers });
    });
    server.stdin.write(`${JSON.stringify(cmd)}\n`);
  });
  try {
    const init = await call({ op: 'init' });
    assert.equal(init.header.error, undefined);
    const spec = init.header.spec;
    assert.equal(init.buffers.static.length, spec.cards.length * spec.staticDim);
    assert.equal(spec.cards[0], '?');
    let res = await call({ op: 'reset', envs: [0, 1, 2].map((env) => ({ env, seed: 100 + env, decks: ['ST-31', 'ST-36'], first: 'random', seats: [{ kind: 'agent' }, { kind: 'heuristic' }] })) });
    let steps = 0;
    for (;;) {
      const { header, buffers } = res;
      assert.equal(header.error, undefined);
      const N = header.observations.reduce((s: number, o: any) => s + o.n, 0);
      const A = header.observations.reduce((s: number, o: any) => s + o.a, 0);
      assert.equal(buffers.cardIdx.length, N);
      assert.equal(buffers.dyn.length, N * spec.dynDim);
      assert.equal(buffers.glob.length, header.observations.length * spec.globalDim);
      assert.equal(buffers.opt.length, A * spec.optionDim);
      const live = header.results.filter((r: any) => !r.done);
      if (!live.length) break;
      res = await call({ op: 'step', actions: live.map((r: any) => ({ env: r.env, index: 0 })) });
      steps++;
    }
    assert.ok(steps > 10);
    assert.ok(res.header.results.every((r: any) => r.done && (r.winner === 0 || r.winner === 1)));
    const bad = await call({ op: 'step', actions: [{ env: 99, index: 0 }] });
    assert.match(bad.header.error, /inconnu/);
  } finally {
    server.stdin.write('{"op":"close"}\n');
  }
});

// Le moteur doit donner la même partie qu'on lui donne les choix un par un (interface, parties en ligne, environnement
// d'apprentissage : act) ou d'un coup par une fonction (IA Monte-Carlo, simulations : advance avec chooser). Écart déjà
// rencontré : défaite pour deck vide constatée au milieu d'un effet, pendant que les cartes regardées sont hors du deck.
test('mêmes parties choix par choix (act) et avec une fonction de choix (chooser)', () => {
  const zones = (s: GameState) => s.players.map((P) => ({
    hand: P.hand.map((c) => c.uid), deck: P.deck.map((c) => c.uid), trash: P.trash.map((c) => c.uid), life: P.life.map((c) => c.uid),
    chars: P.chars.map((c) => c.uid), don: [P.donDeck, P.donActive, P.donRested],
  }));
  for (const [k, decks] of pairs.entries()) {
    for (const g of [0, 1, 2]) {
      const seed = 7000 + 3 * k + g;
      const r1 = { rng: seed };
      const viaChooser = newGame({ decks, names: ['A', 'B'], seed, first: 'random' }, (_s, d) => d.options[Math.floor(random(r1) * d.options.length)].id);
      const r2 = { rng: seed };
      let s = newGame({ decks, names: ['A', 'B'], seed, first: 'random' });
      while (s.winner === null) s = actInPlace(s, s.decision!.options[Math.floor(random(r2) * s.decision!.options.length)].id);
      assert.equal(s.winner, viaChooser.winner, `${decks.join('/')} graine ${seed} : ${s.winReason} / ${viaChooser.winReason}`);
      assert.equal(s.turn, viaChooser.turn);
      assert.deepEqual(zones(s), zones(viaChooser));
    }
  }
});

test('moteur : pas de défaite pour deck vide pendant qu’un effet regarde les cartes du dessus', () => {
  // Nami : « regardez 5 cartes du dessus de votre deck... » avec un deck de 3 cartes : les cartes regardées sont hors du
  // deck le temps du choix, mais la partie continue (elles retournent ensuite au-dessous du deck)
  const s = scenario(['ST-31', 'ST-35'], (st) => {
    setHand(st, 0, ['OP01-016']);
    setDeckTop(st, 0, ['ST31-002', 'ST31-003', 'OP11-012']);
    const P = st.players[0];
    P.trash.push(...P.deck.splice(3));
    setDon(st, 0, 10);
  });
  const after = play(s, 'OP01-016');
  assert.equal(after.winner, null, after.winReason ?? '');
  expectTag(after, 'pick');
  assert.equal(after.decision!.inEffect, true);
  const done = act(after, 'none');
  assert.equal(done.winner, null);
  assert.equal(done.players[0].deck.length, 3);
});
