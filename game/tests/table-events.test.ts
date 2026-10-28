// Événements du plateau déduits en comparant deux états (tâche R2.9, game/ui/table/events.ts) : carte jouée, KO,
// attaque, Contre, Événement activé, [Déclenchement], Vie perdue, DON!!, pioche, nouveau tour ; aussi sur la vue
// d'un joueur en ligne (cartes cachées de l'adversaire) et sans confondre une défausse avec une activation
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from '../engine/engine.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { tableEvents, type TableEvent } from '../ui/table/events.ts';
import { keepLooks } from '../ui/table/looks.ts';
import { attack, choose, inHand, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

const ST01 = { sanji: 'ST01-004', karoo: 'ST01-003', jinbe: 'ST01-005', nami: 'ST01-007', guard: 'ST01-014', pistol: 'ST01-015', jambe: 'ST01-016', usopp: 'ST01-002' };
const kinds = (events: TableEvent[]) => events.map((e) => e.kind);
const only = <K extends TableEvent['kind']>(events: TableEvent[], kind: K) => events.filter((e): e is Extract<TableEvent, { kind: K }> => e.kind === kind);
const copy = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

test('carte jouée : arrivée sur le terrain, pas d’activation ; puissance qui monte avec une DON!!', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setHand(s, 0, [ST01.sanji]);
    setDon(s, 0, 5);
  });
  const sanji = inHand(a, 0, ST01.sanji);
  const b = play(a, ST01.sanji);
  const e = tableEvents(a, b, 0);
  assert.deepEqual(only(e, 'entered'), [{ kind: 'entered', uid: sanji, owner: 0 }]);
  assert.equal(only(e, 'activate').length, 0);
  // une DON!! donnée : « +1 DON!! », sans nombre de puissance (déjà dit par la DON!!)
  const c = act(b, `don:${sanji}`);
  const e2 = tableEvents(b, c, 0);
  assert.deepEqual(only(e2, 'don'), [{ kind: 'don', uid: sanji, owner: 0, count: 1 }]);
  assert.equal(only(e2, 'power').length, 0);
});

test('Événement [Principale] : la carte activée est reconnue par son identifiant, pas par son nom', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setHand(s, 0, [ST01.pistol, ST01.pistol]);
    setDon(s, 0, 6);
    setChars(s, 1, [{ num: ST01.jinbe }]);
  });
  const b = play(a, ST01.pistol);
  const e = only(tableEvents(a, b, 0), 'activate');
  assert.equal(e.length, 1);
  assert.equal(e[0].timing, 'main');
  assert.equal(e[0].player, 0);
  // l'exemplaire joué (dans la Défausse), pas l'autre resté en main
  assert.ok(b.players[0].trash.some((c) => c.uid === e[0].uid));
  assert.ok(!b.players[0].hand.some((c) => c.uid === e[0].uid));
});

test('attaque, Contre d’un Personnage, Événement [Contre], Vie perdue et carte de Vie en main', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setChars(s, 0, [{ num: ST01.jinbe }]);
    setHand(s, 1, [ST01.karoo, ST01.guard]);
    setDon(s, 1, 3);
  });
  const jinbe = a.players[0].chars[0].uid;
  const leader1 = a.players[1].leader.uid;
  const b = attack(a, jinbe, leader1);
  assert.deepEqual(only(tableEvents(a, b, 0), 'attack'), [{ kind: 'attack', attacker: jinbe, target: leader1 }]);
  // le défenseur (joueur 1) contre avec Karoo
  let s = b;
  while (s.decision && s.decision.kind !== 'counter') s = choose(s, (o) => o.id === 'pass' || o.id.startsWith('pass') || o.id === 'noblock');
  assert.equal(s.decision?.kind, 'counter', 'décision de Contre attendue');
  const karoo = s.players[1].hand.find((c) => c.num === ST01.karoo)!.uid;
  const c = act(s, `counter:${karoo}`);
  const ec = tableEvents(s, c, 0);
  assert.deepEqual(only(ec, 'counter'), [{ kind: 'counter', player: 1, uid: karoo, num: ST01.karoo }]);
  assert.equal(only(ec, 'activate').length, 0);
  // puis Guard Point, Événement [Contre]
  assert.equal(c.decision?.kind, 'counter');
  const guard = c.players[1].hand.find((x) => x.num === ST01.guard)!.uid;
  const d = act(c, `cevent:${guard}`);
  const ed = only(tableEvents(c, d, 0), 'activate');
  assert.deepEqual(ed.map((x) => [x.uid, x.timing]), [[guard, 'counter']]);
});

test('Vie perdue, puis [Déclenchement] activé (la carte révélée n’est dans aucune zone pendant la question)', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setChars(s, 0, [{ num: ST01.jinbe }]);
    setHand(s, 1, []);
    setLife(s, 1, [ST01.jambe, ST01.nami]);
    setChars(s, 1, [{ num: ST01.karoo }]);
  });
  const jinbe = a.players[0].chars[0].uid;
  let s = attack(a, jinbe, a.players[1].leader.uid);
  const steps: TableEvent[] = [...tableEvents(a, s, 0)];
  let guard = 0;
  while (s.decision && s.decision.tag !== 'trigger' && guard++ < 10) {
    const next = choose(s, (o) => !o.id.startsWith('counter') && !o.id.startsWith('cevent') && !o.id.startsWith('block:'));
    steps.push(...tableEvents(s, next, 0));
    s = next;
  }
  assert.equal(s.decision?.tag, 'trigger', '[Déclenchement] attendu');
  const before = s;
  const after = choose(s, 'trigger');
  const all = [...steps, ...tableEvents(before, after, 0)];
  assert.ok(only(all, 'life').some((x) => x.player === 1 && x.delta === -1), 'Vie perdue');
  const t = only(all, 'activate').filter((x) => x.timing === 'trigger');
  assert.equal(t.length, 1);
  assert.equal(t[0].num, ST01.jambe);
  assert.equal(t[0].player, 1);
});

test('[Exil] : la carte de Vie va dans la Défausse sans [Déclenchement]', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setChars(s, 0, [{ num: ST01.jinbe }]);
    setLife(s, 1, [ST01.jambe]);
  });
  const jinbe = a.players[0].chars[0].uid;
  const s = copy(a);
  s.battle = { attacker: jinbe, target: s.players[1].leader.uid, step: 'damage', blocked: false };
  s.mods.push({ uid: jinbe, stat: 'keyword', keyword: 'Banish', amount: 0, until: 'battle', source: 'test' } as GameState['mods'][number]);
  const b = copy(s);
  b.players[1].trash.push(b.players[1].life.shift()!);
  const e = tableEvents(s, b, 0);
  assert.equal(only(e, 'activate').length, 0);
  assert.ok(only(e, 'life').some((x) => x.player === 1 && x.delta === -1));
});

test('une défausse par un effet n’est pas une activation', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => setHand(s, 0, [ST01.pistol, ST01.sanji]));
  const b = copy(a);
  const P = b.players[0];
  P.trash.push(P.hand.shift()!);
  P.discardedTurn = b.turn;
  assert.equal(only(tableEvents(a, b, 0), 'activate').length, 0);
});

test('en ligne : l’Événement activé par l’adversaire sort de sa main cachée et reste reconnu', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setHand(s, 1, [ST01.pistol, ST01.sanji, ST01.nami]);
    setDon(s, 1, 6);
    setChars(s, 0, [{ num: ST01.jinbe }]);
  }, 1);
  const b = play(a, ST01.pistol, 1);
  const seat: PlayerId = 0;
  const va = viewFor(a, seat);
  const vb = viewFor(b, seat);
  assert.ok(va.players[1].hand.every((c) => c.uid < 0), 'main adverse cachée dans la vue');
  const e = only(tableEvents(va, vb, seat), 'activate');
  assert.equal(e.length, 1);
  assert.equal(e[0].num, ST01.pistol);
  assert.equal(e[0].player, 1);
  // et un Personnage joué depuis la main cachée n’est qu’une carte arrivée sur le terrain
  const c = play(b.decision?.player === 1 && b.decision.kind === 'main' ? b : a, ST01.sanji, 1);
  const ev = tableEvents(viewFor(a, seat), viewFor(c, seat), seat);
  assert.ok(only(ev, 'entered').some((x) => x.owner === 1));
});

test('KO en combat, nouveau tour et nouvelles DON!!', () => {
  const a = scenario(['ST-01', 'ST-01'], (s) => {
    setChars(s, 0, [{ num: ST01.jinbe }]);
    setChars(s, 1, [{ num: ST01.nami, extra: { rested: true } }]);
    setHand(s, 1, []);
  });
  const jinbe = a.players[0].chars[0].uid;
  const nami = a.players[1].chars[0].uid;
  let s = attack(a, jinbe, nami);
  const all: TableEvent[] = [...tableEvents(a, s, 0)];
  let guard = 0;
  while (s.decision && s.decision.player === 1 && guard++ < 10) {
    const next = choose(s, (o) => !o.id.startsWith('block:'));
    all.push(...tableEvents(s, next, 0));
    s = next;
  }
  assert.deepEqual(only(all, 'left').map((x) => [x.uid, x.to]), [[nami, 'trash']]);
  const end = act(s, 'end');
  let t = end;
  const turn: TableEvent[] = [...tableEvents(s, end, 0)];
  guard = 0;
  while (t.active !== 1 && guard++ < 5) {
    const next = choose(t, () => true);
    turn.push(...tableEvents(t, next, 0));
    t = next;
  }
  assert.ok(only(turn, 'turn').some((x) => x.player === 1), 'nouveau tour de l’adversaire');
  assert.ok(only(turn, 'donGained').some((x) => x.player === 1 && x.count === 2), '+2 DON!!');
  assert.ok(kinds(turn).length > 0);
});

test('la main de départ ne compte pas comme une Vie gagnée ni une pioche après coup', () => {
  const a = scenario(['ST-01', 'ST-01'], () => {});
  assert.deepEqual(tableEvents(a, a, 0), []);
});

test('looks : un look inchangé garde son objet (la carte en memo n’est pas redessinée)', () => {
  const prev = new Map([[1, { actionable: true }], [2, { dim: true }], [3, { grab: true, selected: false }]]);
  const next = keepLooks(prev, new Map([[1, { actionable: true }], [2, { dim: true, badge: '+1000' }], [3, { grab: true, selected: true }], [4, {}]]));
  assert.equal(next.get(1), prev.get(1));
  assert.notEqual(next.get(2), prev.get(2));
  assert.notEqual(next.get(3), prev.get(3));
  assert.deepEqual(next.get(4), {});
});
