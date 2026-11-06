// EB05 (tâche S1 de l'étape C) : cartes codées à la main, morceaux « code à la main » des recettes, et cas que les tests
// générés ne savent pas vérifier ([Contre] « pendant ce combat », effets permanents, carte qui se vise elle-même).
// Aucun texte de carte : les tests citent des numéros et des valeurs (01-contrats.md § 15.8).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS, cardStatus } from '../engine/cards/index.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { buildSituation, drive, emptySide, inertPool, maxChooser, type SideSpec } from '../engine/recipes/bench.ts';
import { act } from '../engine/engine.ts';
import { fieldCost, hasKeyword, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { choose, coherent, hasOption, play } from './helpers.ts';

const FILL = 'EB05-041';          // Personnage sans effet (coût 2, 4000)
const V3000 = 'EB05-003';         // Personnage sans effet (coût 1, 3000)
const V6000TB = 'ST12-005';       // Personnage sans effet {Thriller Bark Pirates} (coût 4, 6000)
const V9000BM = 'EB01-055';       // Personnage sans effet {Big Mom Pirates} (coût 7, 9000)
const ROBIN = 'EB05-010';         // Leader {Straw Hat Crew}, attribut <Wisdom>
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
// [Contre] joué pendant une attaque du joueur 1 sur le Leader du joueur 0 : l'attaquant a 1000 de plus que le Leader ;
// l'attaque est repoussée (le Leader garde ses 2 cartes de Vie) si l'effet donne au moins +2000 pour le combat
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

test('EB05 : chaque carte du set est jouable, en doute ou signalée (Gloriosa seule à coder)', () => {
  const nums = Object.keys(CARDS).filter((n) => n.startsWith('EB05-'));
  assert.ok(nums.length >= 60);
  const left = nums.filter((n) => !['verified', 'coded', 'auto', 'doubt'].includes(confidence(n)));
  assert.deepEqual(left, ['EB05-052']);
  assert.equal(confidence('EB05-061'), 'doubt');
  assert.equal(cardStatus('EB05-061'), 'todo');
});

test('EB05-008 [Contre] : sans Personnage de coût 5 ou plus, la carte attaquée gagne +4000 ; sinon rien', () => {
  assert.equal(counterRepels({ hand: ['EB05-008'] }, 'EB05-008'), true);
  // un Personnage de coût 5 : rien
  assert.equal(counterRepels({ hand: ['EB05-008'], chars: [{ num: 'EB05-015' }] }, 'EB05-008'), false);
});

test('EB05-009, EB05-039, EB05-060 [Contre] : le Leader (ou la carte attaquée) gagne la puissance pour le combat', () => {
  for (const num of ['EB05-009', 'EB05-039', 'EB05-060']) assert.equal(counterRepels({ hand: [num] }, num), true, num);
});

test('EB05-040 : renvoyer 1 DON!! redressée (pas une épuisée) pour piocher 3 et défausser 1 avec un Leader {Donquixote Pirates}', () => {
  let s = sit(side('OP14-060', { hand: ['EB05-040', FILL], donActive: 1, donRested: 3 }), side(leader()));
  const deck = s.players[0].donDeck;
  s = play(s, 'EB05-040');
  s = choose(s, 'yes');
  assert.equal(s.players[0].donActive, 0);
  assert.equal(s.players[0].donRested, 3);
  assert.equal(s.players[0].donDeck, deck + 1);
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].hand.length, 1 + 3 - 1);
  coherent(s);
  // aucune DON!! redressée : le coût ne peut pas être payé (l'Événement ne fait rien)
  s = sit(side('OP14-060', { hand: ['EB05-040'], donActive: 0, donRested: 4 }), side(leader()));
  assert.equal(CARDS['EB05-040'].mainUseful?.(s, 0), false);
  // [Contre] : Leader +2000 pour le combat
  assert.equal(counterRepels({ hand: ['EB05-040'] }, 'EB05-040'), true);
});

test('EB05-033 : 6 DON!! de moins que l\'adversaire avec un Leader {Straw Hat Crew} : piocher 3, défausser 2, puis 4 DON!! épuisées', () => {
  let s = sit(side(ROBIN, { hand: ['EB05-033'], donActive: 2 }), side(leader(), { donActive: 8 }));
  s = play(s, 'EB05-033');
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].hand.length, 3 - 2);
  assert.equal(s.players[0].donRested, 1 + 4);   // 1 épuisée pour la jouer
  coherent(s);
  // écart de 5 seulement : ni pioche ni défausse, mais les 4 DON!! (« Puis » hors de la condition)
  s = sit(side(ROBIN, { hand: ['EB05-033'], donActive: 2 }), side(leader(), { donActive: 7 }));
  s = play(s, 'EB05-033');
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].donRested, 1 + 4);
});

test('EB05-020 : épuiser son Leader [Shirahoshi] pour piocher 2 ; un autre Leader ne peut pas payer', () => {
  let s = sit(side('OP11-022', { hand: ['EB05-020'] }), side(leader()));
  s = play(s, 'EB05-020');
  s = choose(s, 'yes');
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].leader.rested, true);
  assert.equal(s.players[0].hand.length, 2);
  s = sit(side(ROBIN, { hand: ['EB05-020'] }), side(leader()));
  assert.equal(CARDS['EB05-020'].mainUseful?.(s, 0), false);
});

test('EB05-024, EB05-046 : effets permanents sous condition, les deux parties ensemble', () => {
  let s = sit(side('OP16-041', { chars: [{ num: 'EB05-024' }] }), side(leader()));
  const sadi = s.players[0].chars[0];
  const impel = CARDS[s.players[0].leader.num].types.includes('Impel Down');
  assert.equal(hasKeyword(s, 0, sadi, 'Blocker'), impel);
  assert.equal(fieldCost(s, sadi.uid), 1 + (impel ? 2 : 0));
  s = sit(side(ROBIN, { chars: [{ num: 'EB05-024' }] }), side(leader()));
  assert.equal(hasKeyword(s, 0, s.players[0].chars[0], 'Blocker'), false);
  assert.equal(fieldCost(s, s.players[0].chars[0].uid), 1);
  // Yamato : un Personnage adverse de 8000 de puissance de base ou plus
  s = sit(side(ROBIN, { chars: [{ num: 'EB05-046' }] }), side(leader(), { chars: [{ num: 'EB05-026' }] }), 1);
  assert.equal(hasKeyword(s, 0, s.players[0].chars[0], 'Blocker'), true);
  assert.equal(power(s, s.players[0].chars[0].uid), 5000 + 3000);
  s = sit(side(ROBIN, { chars: [{ num: 'EB05-046' }] }), side(leader(), { chars: [{ num: FILL }] }), 1);
  assert.equal(hasKeyword(s, 0, s.players[0].chars[0], 'Blocker'), false);
  assert.equal(power(s, s.players[0].chars[0].uid), 5000);
});

test('EB05-045 : [Jouée] peut se mettre KO elle-même (un de ses Personnages « Baroque Works »), puis son [En cas de KO]', () => {
  let s = sit(side(leader(), { hand: ['EB05-045'], deckTop: [FILL, FILL, FILL] }), side(leader()));
  s = play(s, 'EB05-045');
  const monday = uidOf(s, 0, 'EB05-045');
  s = choose(s, `card:${monday}`);
  while (s.decision?.inEffect) s = act(s, s.decision.options.find((o) => o.id === 'none')?.id ?? s.decision.options[0].id);
  assert.ok(s.players[0].trash.some((c) => c.num === 'EB05-045'));
  assert.ok(s.players[0].trash.filter((c) => c.num === FILL).length >= 3);
  coherent(s);
});

test('EB05-043 [En cas de KO] : mettre KO ou épuiser un Personnage adverse de coût 6 ou moins (au choix)', () => {
  for (const [branch, gone] of [[0, true], [1, false]] as const) {
    let s = sit(side(leader()), side(leader(), { chars: [{ num: FILL }] }));
    s.players[0].trash.push({ uid: 999001, num: 'EB05-043' });
    s.players[0].deck = s.players[0].deck.filter((c) => c.num !== 'EB05-043');
    const r = drive(s, 'onKO', 999001, maxChooser({ branch }));
    s = r.state;
    assert.equal(s.players[1].chars.length === 0, gone);
    if (!gone) assert.equal(s.players[1].chars[0].rested, true);
  }
});

test('EB05-059 [Principale] : seuls les {Big Mom Pirates} de 4000 de puissance de base exactement sont protégés', () => {
  // EB05-059 [Principale] : les Personnages {Big Mom Pirates} de 4000 de base exactement ne peuvent pas être mis KO en
  // combat ; un de 9000 si
  let g = sit(side(leader(), { hand: ['EB05-059'], chars: [{ num: 'EB05-054' }, { num: V9000BM }] }), side(leader()));
  g = play(g, 'EB05-059');
  while (g.decision?.inEffect) g = act(g, g.decision.options[0].id);
  const brulee = uidOf(g, 0, 'EB05-054');
  const big = uidOf(g, 0, V9000BM);
  assert.ok(g.mods.some((m) => m.uid === brulee && m.stat === 'cantBeKO'));
  assert.ok(!g.mods.some((m) => m.uid === big && m.stat === 'cantBeKO'));
  coherent(g);
});

test('EB05-029 : annuler puis renvoyer en main un Personnage adverse de coût 6 ou moins (défausser 1 carte)', () => {
  let s = sit(side(leader(), { hand: ['EB05-029', FILL], donActive: 6 }), side(leader(), { chars: [{ num: FILL }, { num: 'EB05-026' }] }));
  s = play(s, 'EB05-029');
  s = choose(s, 'yes');
  while (s.decision?.tag === 'discard') s = act(s, s.decision.options[0].id);
  // le Personnage de coût 7 n'est pas proposé
  assert.ok(!hasOption(s, `card:${uidOf(s, 1, 'EB05-026')}`));
  s = choose(s, `card:${uidOf(s, 1, FILL)}`);
  assert.deepEqual(s.players[1].chars.map((c) => c.num), ['EB05-026']);
  assert.ok(s.players[1].hand.some((c) => c.num === FILL));
  coherent(s);
});

test('EB05-048 : épuiser 1 DON!! et mettre KO un « Baroque Works » : les Personnages adverses de coût 0 perdent [Bloqueur]', () => {
  let s = sit(side(leader(), { hand: ['EB05-048'], chars: [{ num: 'EB05-045' }], donActive: 3 }), side(leader(), { chars: [{ num: 'OP17-108' }] }));
  // Charlotte Brûlée (OP17-108) a [Bloqueur] ; son coût ramené à 0 pour l'essai
  const blocker = s.players[1].chars[0];
  s.mods.push({ uid: blocker.uid, stat: 'cost', amount: -9, until: 'turn', source: 'essai' });
  assert.equal(hasKeyword(s, 1, blocker, 'Blocker'), true);
  s = play(s, 'EB05-048');
  s = choose(s, 'yes');
  while (s.decision?.inEffect) s = act(s, s.decision.options.find((o) => o.id !== 'none' && o.id !== 'no')?.id ?? s.decision.options[0].id);
  assert.equal(s.players[0].chars.length, 0);
  assert.equal(hasKeyword(s, 1, s.players[1].chars[0], 'Blocker'), false);
  coherent(s);
  // [Contre] : Leader +3000
  assert.equal(counterRepels({ hand: ['EB05-048'] }, 'EB05-048'), true);
});

test('EB05-061 (en doute) : prendre la Vie du dessus à la place, une fois par tour, Personnage de 6000 de base ou moins', () => {
  let s = sit(side(leader(), { chars: [{ num: 'EB05-061' }, { num: FILL, rested: true }], life: [V3000, V3000] }), side(leader(), { chars: [{ num: V6000TB, don: 2 }] }), 1);
  const target = uidOf(s, 0, FILL);
  s = act(s, `attack:${uidOf(s, 1, V6000TB)}:${target}`);
  for (let i = 0; i < 20 && s.decision && s.decision.tag !== 'replace'; i++) s = act(s, s.decision.options.find((o) => o.id === 'pass' || o.id === 'noblock')?.id ?? s.decision.options[0].id);
  assert.equal(s.decision?.tag, 'replace');
  s = choose(s, 'yes');
  assert.ok(s.players[0].chars.some((c) => c.uid === target));
  assert.equal(s.players[0].life.length, 1);
});

test('EB05-028 [Jouée] : l\'adversaire défausse 4 cartes s\'il en a 9 ou plus, sinon rien', () => {
  for (const [n, after] of [[9, 5], [8, 8]] as const) {
    let s = sit(side(leader(), { hand: ['EB05-028'] }), side(leader(), { hand: Array.from({ length: n }, () => FILL) }));
    s = play(s, 'EB05-028');
    for (let i = 0; i < 10 && s.decision?.inEffect; i++) s = act(s, s.decision.options[0].id);
    assert.equal(s.players[1].hand.length, after);
    coherent(s);
  }
});

test('EB05-046 [Attaque adverse] : défausser 1 carte ; avec 10 cartes ou plus en Défausse, Leader de base 7000 pour le tour', () => {
  for (const [trash, base] of [[9, 7000], [8, null]] as const) {
    let s = sit(side(ROBIN, { chars: [{ num: 'EB05-046' }], hand: [FILL], trash: Array.from({ length: trash }, () => V3000) }), side(leader(), { chars: [{ num: FILL }] }), 1);
    s = act(s, `attack:${uidOf(s, 1, FILL)}:${s.players[0].leader.uid}`);
    if (s.decision?.player === 0 && s.decision.options.some((o) => o.id === 'yes')) {
      s = choose(s, 'yes');
      for (let i = 0; i < 5 && s.decision?.tag === 'discard'; i++) s = act(s, s.decision.options[0].id);
    }
    const mod = s.mods.find((m) => m.uid === s.players[0].leader.uid && m.stat === 'basePower');
    assert.equal(mod?.amount ?? null, base);
  }
});
