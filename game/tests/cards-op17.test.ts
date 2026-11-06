// OP17 (tâche S1 de l'étape C) : cartes codées à la main, morceaux « code à la main » des recettes, et cas que les tests
// générés ne savent pas vérifier ([Contre] « pendant ce combat », effets permanents, remplacements). Aucun texte de
// carte : les tests citent des numéros et des valeurs (01-contrats.md § 15.8).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { buildSituation, drive, emptySide, inertPool, maxChooser, type SideSpec } from '../engine/recipes/bench.ts';
import { act } from '../engine/engine.ts';
import { basePower, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { aiAnswers, choose, coherent, play } from './helpers.ts';

const FILL = 'EB05-041';          // Personnage sans effet (coût 2, 4000)
const V3000 = 'EB05-003';         // Personnage sans effet (coût 1, 3000)
const ELBAPH7 = 'OP17-088';       // Personnage sans effet {Elbaph} (coût 7)
const leader = () => inertPool().leaders[0];

const side = (lead: string, o: Partial<SideSpec> = {}): SideSpec => ({ ...emptySide(lead), donActive: 6, ...o });
const sit = (a: SideSpec, b: SideSpec, active: PlayerId = 0): GameState =>
  buildSituation({ sides: [a, b], active, filler: [FILL, FILL], seed: 5 });
const uidOf = (s: GameState, p: PlayerId, num: string) => {
  const P = s.players[p];
  const c = [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.trash, ...P.life, ...P.deck].find((x) => x.num === num);
  assert.ok(c, `${num} introuvable`);
  return c.uid;
};
// Répond aux questions de l'effet en cours (premier choix utile, sinon le premier)
const finish = (s: GameState) => {
  for (let i = 0; i < 40 && s.decision?.inEffect; i++) s = act(s, s.decision.options.find((o) => o.id !== 'none' && o.id !== 'no')?.id ?? s.decision.options[0].id);
  return s;
};

// [Contre] joué pendant une attaque du joueur 1 sur le Leader du joueur 0 (voir cards-eb05.test.ts)
function counterRepels(me: Partial<SideSpec>, num: string, lead = leader()): boolean {
  const s = sit(side(lead, { life: [V3000, V3000], ...me }), side(leader(), { chars: [{ num: FILL }] }), 1);
  const d = (power(s, s.players[0].leader.uid) + 1000 - 4000) / 1000;
  s.players[1].chars[0].don = d;
  s.players[1].donDeck -= d;
  const r = drive(s, 'counter', uidOf(s, 0, num), maxChooser(), uidOf(s, 1, FILL));
  assert.ok(r.ran, `${num} : ${r.reason}`);
  coherent(r.state);
  return r.state.players[0].life.length === 2;
}

test('OP17 : toutes les cartes du set sont jouables', () => {
  const nums = Object.keys(CARDS).filter((n) => n.startsWith('OP17-'));
  assert.ok(nums.length >= 119);
  assert.deepEqual(nums.filter((n) => !['verified', 'coded', 'auto'].includes(confidence(n))), []);
});

test('OP17 [Contre] : Leader ou carte attaquée renforcés pour le combat (036, 038, 097, 098, 115, 116, 117)', () => {
  for (const num of ['OP17-038', 'OP17-097', 'OP17-098']) assert.equal(counterRepels({ hand: [num, FILL] }, num), true, num);
  // [Charlotte Linlin] / [Shanks] seulement
  assert.equal(counterRepels({ hand: ['OP17-115'] }, 'OP17-115', 'OP17-099'), true);
  assert.equal(counterRepels({ hand: ['OP17-117'] }, 'OP17-117', 'OP17-099'), true);
  assert.equal(counterRepels({ hand: ['OP17-036'] }, 'OP17-036', 'OP17-020'), true);
  assert.equal(counterRepels({ hand: ['OP17-115'] }, 'OP17-115'), false);
  // Fulgora : 2 Personnages ayant un [Déclenchement]
  assert.equal(counterRepels({ hand: ['OP17-116'], chars: [{ num: 'OP17-108' }, { num: 'OP17-108' }] }, 'OP17-116'), true);
  assert.equal(counterRepels({ hand: ['OP17-116'], chars: [{ num: 'OP17-108' }] }, 'OP17-116'), false);
});

test('OP17-079 (Leader) : ses Personnages de coût 12 ou plus ont [Bloqueur], pas les autres ni ceux de l\'adversaire', () => {
  const s = sit(side('OP17-079', { chars: [{ num: 'OP17-085' }, { num: ELBAPH7 }] }), side('OP17-079', { chars: [{ num: ELBAPH7 }] }));
  const [dorry, giant] = s.players[0].chars;
  assert.equal(hasKeyword(s, 0, dorry, 'Blocker'), true);   // 5 + 12
  assert.equal(hasKeyword(s, 0, giant, 'Blocker'), false);
  assert.equal(hasKeyword(s, 0, s.players[0].leader, 'Blocker'), false);
  const other = sit(side(leader(), { chars: [{ num: 'OP17-085' }] }), side('OP17-079'));
  assert.equal(hasKeyword(other, 0, other.players[0].chars[0], 'Blocker'), false);
});

test('OP17-090 : +3000 et [Jouée] avec un Personnage de coût 12 ou plus sur l\'un ou l\'autre terrain', () => {
  let s = sit(side(leader(), { hand: ['OP17-090'] }), side(leader(), { chars: [{ num: 'OP17-085' }, { num: V3000 }] }));
  s = finish(play(s, 'OP17-090'));
  assert.deepEqual(s.players[1].chars.map((c) => c.num), ['OP17-085']);
  assert.equal(power(s, uidOf(s, 0, 'OP17-090')), (CARDS['OP17-090'].power ?? 0) + 3000);
  coherent(s);
  s = sit(side(leader(), { hand: ['OP17-090'] }), side(leader(), { chars: [{ num: V3000 }] }));
  s = finish(play(s, 'OP17-090'));
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(power(s, uidOf(s, 0, 'OP17-090')), CARDS['OP17-090'].power ?? 0);
});

test('OP17-020 (Leader) : défausser 1 carte OU épuiser 1 DON!! pour garder épuisé un Personnage adverse', () => {
  for (const pay of ['discard', 'don'] as const) {
    let s = sit(side('OP17-020', { hand: [FILL], donActive: 2 }), side(leader(), { chars: [{ num: FILL, rested: true }] }));
    s = choose(s, `act:${s.players[0].leader.uid}`);
    if (s.decision?.tag === 'costChoice') s = choose(s, pay);
    s = finish(s);
    const P = s.players[0];
    if (pay === 'discard') assert.equal(P.hand.length, 0);
    else assert.equal(P.donActive, 1);
    assert.ok(s.mods.some((m) => m.uid === s.players[1].chars[0].uid && m.stat === 'noRefresh'));
    coherent(s);
  }
});

test('OP17-034 : DON!! redressée si le Leader adverse a 6000 ou plus ; puis puissance de base 6000 du Leader {Red-Haired Pirates}', () => {
  let s = sit(side('OP17-020', { chars: [{ num: 'OP17-034' }], donActive: 0, donRested: 3 }), side(leader()));
  s.mods.push({ uid: s.players[1].leader.uid, stat: 'power', amount: 6000, until: 'turn', source: 'essai' });
  s = finish(choose(s, `act:${uidOf(s, 0, 'OP17-034')}`));
  assert.equal(s.players[0].donActive, 1);
  assert.equal(basePower(s, s.players[0].leader.uid), 6000);
  // Leader adverse faible : pas de DON!!, mais la puissance de base quand même (« Puis » hors de la condition)
  s = sit(side('OP17-020', { chars: [{ num: 'OP17-034' }], donActive: 0, donRested: 3 }), side(leader()));
  s.mods.push({ uid: s.players[1].leader.uid, stat: 'power', amount: -5000, until: 'turn', source: 'essai' });
  s = finish(choose(s, `act:${uidOf(s, 0, 'OP17-034')}`));
  assert.equal(s.players[0].donActive, 0);
  assert.equal(basePower(s, s.players[0].leader.uid), 6000);
});

test('OP17-021 : un « Red-Haired Pirates » retiré par un effet adverse reste si l\'on épuise 1 de ses cartes', () => {
  let s = sit(side(leader(), { hand: ['EB05-027'], donActive: 6 }), side(leader(), { chars: [{ num: 'OP17-021' }], donActive: 2 }));
  s = play(s, 'EB05-027');
  for (let i = 0; i < 10 && s.decision?.tag === 'discard'; i++) s = act(s, s.decision.options[0].id);
  s = choose(s, `card:${uidOf(s, 1, 'OP17-021')}`);
  assert.equal(s.decision?.tag, 'replace');
  assert.equal(s.decision?.player, 1);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  s = act(s, s.decision!.options.find((o) => o.id === 'don')?.id ?? s.decision!.options[0].id);
  assert.ok(s.players[1].chars.some((c) => c.num === 'OP17-021'));
  assert.equal(s.players[1].donRested, 1);
  coherent(s);
});

test('OP17-099 (Leader) : l\'adversaire choisit ; l\'IA sait répondre', () => {
  for (const branch of [0, 1]) {
    let s = sit(side('OP17-099', { hand: [FILL, V3000], deckTop: [FILL], life: [V3000] }), side(leader(), { hand: [FILL, FILL] }));
    s = choose(s, `attack:${s.players[0].leader.uid}:${s.players[1].leader.uid}`);
    s = choose(s, 'yes');
    s = act(s, s.decision!.options[0].id);   // carte défaussée (coût)
    assert.equal(s.decision?.tag, 'oppChooseOne');
    assert.equal(s.decision?.player, 1);
    aiAnswers(s);
    s = choose(s, `choice:${branch}`);
    s = finish(s);
    if (branch === 0) {
      assert.equal(s.players[0].hand.length, 0);
      assert.equal(s.players[0].life.length, 2);
    } else {
      assert.equal(s.players[0].hand.length, 1);
      assert.equal(s.players[1].hand.length, 1);
    }
    coherent(s);
  }
});

test('OP17-116 : épuiser 2 DON!! pour mettre KO un Lieu adverse (pas proposé sans Lieu)', () => {
  let s = sit(side(leader(), { hand: ['OP17-116'], donActive: 4 }), side(leader(), { stage: 'OP05-097' }));
  s = play(s, 'OP17-116');
  s = finish(choose(s, 'yes'));
  assert.equal(s.players[1].stage, null);
  assert.ok(s.players[1].trash.some((c) => c.num === 'OP05-097'));
  coherent(s);
  s = sit(side(leader(), { hand: ['OP17-116'] }), side(leader()));
  assert.equal(CARDS['OP17-116'].mainUseful?.(s, 0), false);
});

test('OP17-117 [Déclenchement] : l\'adversaire défausse 3 cartes, sinon KO d\'un Personnage de coût 6 ou moins', () => {
  for (const discard of [true, false]) {
    let s = sit(side(leader(), { life: ['OP17-117'] }), side(leader(), { chars: [{ num: FILL, don: 2 }], hand: [FILL, FILL, FILL, V3000] }), 1);
    s.players[1].donDeck -= 2;
    const r = drive(s, 'trigger', uidOf(s, 0, 'OP17-117'), (st, d) => (d.player === 1 ? (d.tag === 'oppMayDiscard' ? (discard ? 'yes' : 'no') : d.options[0].id) : maxChooser()(st, d)), uidOf(s, 1, FILL));
    assert.ok(r.ran, r.reason ?? "");
    s = r.state;
    if (discard) {
      assert.equal(s.players[1].hand.length, 1);
      assert.equal(s.players[1].chars.length, 1);
    } else {
      assert.equal(s.players[1].hand.length, 4);
      assert.equal(s.players[1].chars.length, 0);
    }
  }
});
