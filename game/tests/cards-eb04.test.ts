// EB04 (tâche S4) : un test par effet des cartes codées à la main (condition vraie et fausse), et les effets des
// recettes que le banc d'essai ne sait pas mesurer ([Contre] « pendant ce combat », évènement « When »). Numéros et
// valeurs seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { attackAbility, canLeaveByEffect, def, fieldCost, power, untapDon } from '../engine/rules.ts';
import type { EffectCtx, GameState } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, play, setChars, setDon, setHand, setLife } from './helpers.ts';
import { charUid, counterGain, leaderNamed, leaderTyped, leaderUid, list, oppLeaderDon, scene } from './eb-scene.ts';

const OPP = 'ST-36';
const passAll = (s: GameState) => {
  while (s.decision && s.decision.player === 0 && (s.decision.kind === 'counter' || s.decision.kind === 'blocker')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
};
const pickCard = (s: GameState) => (s.decision?.options.some((o) => o.id.startsWith('card:')) ? choose(s, (o) => o.id.startsWith('card:')) : s);
// Contexte minimal d'un effet du joueur `me` : chaque question reçoit la première réponse proposée
const ctxOf = (s: GameState, me: 0 | 1, num: string): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: -1, num, pending: { kind: 'system', source: -1, num, controller: me, answers: [] } as unknown as EffectCtx['pending'],
  ask: (spec) => spec.options[0].id,
});

test('Smoker et Tashigi (EB04-003) : [Tour adverse] la puissance de base du Leader {Navy} devient 7000, une seule fois', () => {
  const navy = leaderTyped('Navy');
  let s = scene([list(navy, ['EB04-003']), OPP], (g) => { setChars(g, 0, [{ num: 'EB04-003' }, { num: 'EB04-003' }]); }, 1);
  assert.equal(power(s, leaderUid(s, 0)), 7000);
  s = scene([list(navy, ['EB04-003']), OPP], (g) => { setChars(g, 0, [{ num: 'EB04-003' }]); });
  assert.equal(power(s, leaderUid(s, 0)), def(navy).power, 'pendant son tour : rien');
  s = scene([list('EB03-001', ['EB04-003']), OPP], (g) => { setChars(g, 0, [{ num: 'EB04-003' }]); }, 1);
  assert.equal(power(s, leaderUid(s, 0)), 5000, 'Leader sans {Navy}');
  coherent(s);
});

test('Trafalgar Law (EB04-005) : ne peut attaquer qu’avec au moins 2 Personnages adverses de 5000 de puissance de base ou plus', () => {
  const me = list('EB03-001', ['EB04-005']);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB04-005' }]); setChars(g, 1, [{ num: 'ST36-005' }]); });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, false);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB04-005' }]); setChars(g, 1, [{ num: 'ST36-005' }, { num: 'ST36-002' }]); });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, true);
});

test('Royaume de Rourucia (EB04-010) : [Tour adverse] +5000 à ses Personnages de coût de base 1 ; [Jouée] puissance d’un Personnage adverse à 0', () => {
  const me = list('EB03-001', ['EB04-010', 'EB04-056', 'EB04-046']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-056' }, { num: 'EB04-046' }]);
    g.players[0].stage = { ...setHand(g, 0, ['EB04-010'])[0], rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    g.players[0].hand = [];
  }, 1);
  assert.equal(power(s, charUid(s, 0, 'EB04-056')), 6000);   // coût de base 1
  assert.equal(power(s, charUid(s, 0, 'EB04-046')), 1000);   // coût de base 2
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB04-010']); setDon(g, 0, 7); setChars(g, 1, [{ num: 'ST36-005' }]); });
  const target = s.players[1].chars[0].uid;
  s = choose(play(s, 'EB04-010'), `card:${target}`);
  assert.equal(power(s, target), 0);
  assert.equal(s.players[0].stage?.num, 'EB04-010');
  coherent(s);
});

test('L’Écaillé (EB04-011) : pioche 1 carte par Personnage {Neptunian}, puis en défausse autant', () => {
  const me = list('EB03-001', ['EB04-011', 'EB04-016']);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['EB04-011']); setDon(g, 0, 7); setChars(g, 0, [{ num: 'EB04-016' }]); });
  const hand = s.players[0].hand.length;
  const trash = s.players[0].trash.length;
  s = play(s, 'EB04-011');
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, hand - 1);           // jouée, 2 piochées, 2 défaussées
  assert.equal(s.players[0].trash.length, trash + 2);
  coherent(s);
});

test('Carrot (EB04-013) : avec un Leader {Minks}, redresse 2 Personnages {Minks} et son Leader ; rien sinon', () => {
  const minks = leaderTyped('Minks');
  let s = scene([list(minks, ['EB04-013', 'EB04-017']), OPP], (g) => {
    setHand(g, 0, ['EB04-013']); setDon(g, 0, 8);
    setChars(g, 0, [{ num: 'EB04-017', extra: { rested: true } }]);
    g.players[0].leader.rested = true;
  });
  s = play(s, 'EB04-013');
  s = choose(s, `card:${charUid(s, 0, 'EB04-017')}`);
  if (s.decision?.tag === 'ownReady') s = choose(s, 'none');
  assert.equal(s.players[0].chars.find((c) => c.num === 'EB04-017')!.rested, false);
  assert.equal(s.players[0].leader.rested, false);
  s = scene([list('EB03-001', ['EB04-013']), OPP], (g) => { setHand(g, 0, ['EB04-013']); setDon(g, 0, 8); g.players[0].leader.rested = true; });
  s = play(s, 'EB04-013');
  assert.equal(s.players[0].leader.rested, true);
});

test('L’Oiseau (EB04-016) : redresse 1 DON!!, puis plus aucune DON!! redressée par un effet de Personnage ce tour', () => {
  const me = list('EB03-001', ['EB04-016', 'EB03-061']);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB04-016' }]); setDon(g, 0, 0, 3); });
  const bird = charUid(s, 0, 'EB04-016');
  s = choose(s, `act:${bird}`);
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].noCharDonReadyTurn, s.turn);
  assert.ok(!hasOption(s, `act:${bird}`), 'plus proposée');
  assert.equal(untapDon(s, 0, 1, 'EB03-061'), 0, 'effet d’un autre Personnage');
  assert.equal(untapDon(s, 0, 1, 'EB03-001'), 1, 'effet du Leader');
  coherent(s);
});

test('L’Oiseau (EB04-016) : [En attaquant] avec 3 Personnages {Neptunian}, épuise un Personnage adverse de coût 8 ou moins', () => {
  const me = list('EB03-001', ['EB04-016', 'EB04-011']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-016' }, { num: 'EB04-011' }, { num: 'EB04-011' }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const target = s.players[1].chars[0].uid;
  s = attack(s, charUid(s, 0, 'EB04-016'), leaderUid(s, 1));
  s = choose(s, `card:${target}`);
  assert.equal(s.players[1].chars[0].rested, true);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB04-016' }, { num: 'EB04-011' }]); setChars(g, 1, [{ num: 'ST36-005' }]); });
  s = attack(s, charUid(s, 0, 'EB04-016'), leaderUid(s, 1));
  assert.equal(s.players[1].chars[0].rested, false);
});

test('Rosinante et Law (EB04-038) : deux autres noms ; pioche avec autant de DON!! ou moins que l’adversaire, puis 1 DON!! redressée', () => {
  assert.ok(def('EB04-038').names.includes('Trafalgar Law') && def('EB04-038').names.includes('Donquixote Rosinante'));
  const me = list('EB03-001', ['EB04-038']);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['EB04-038']); setDon(g, 0, 6); setDon(g, 1, 6); });
  const hand = s.players[0].hand.length;
  s = play(s, 'EB04-038');
  assert.equal(s.players[0].hand.length, hand);               // jouée, 1 piochée
  assert.equal(s.players[0].donActive, 1);
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB04-038']); setDon(g, 0, 8); setDon(g, 1, 6); });
  const hand2 = s.players[0].hand.length;
  s = play(s, 'EB04-038');
  assert.equal(s.players[0].hand.length, hand2 - 1);
  coherent(s);
});

test('Kaku (EB04-043) : à la place d’un KO par effet adverse d’un Personnage noir de coût de base 5 ou moins, 3 cartes de la Défausse sous le deck', () => {
  const me = list('EB03-001', ['EB04-043', 'EB04-046', 'EB04-044']);
  const s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-043' }, { num: 'EB04-046' }, { num: 'EB04-044' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 3));
  }, 1);
  const r = def('EB04-043').replaceRemoval!;
  const kaku = s.players[0].chars[0];
  assert.equal(r.onlyKo, true);
  assert.equal(r.oncePerTurn, true);
  assert.ok(r.condition(s, 0, kaku, s.players[0].chars[1]), 'Doll, noir, coût 2');
  assert.ok(!r.condition(s, 0, kaku, s.players[0].chars[2]), 'Kobby, coût 6');
  const deck = s.players[0].deck.length;
  r.apply(s, 0, kaku, s.players[0].chars[1], ctxOf(s, 1, 'ST36-005'));
  assert.equal(s.players[0].trash.length, 0);
  assert.equal(s.players[0].deck.length, deck + 3);
  s.players[0].trash.push(...s.players[0].deck.splice(0, 2));
  assert.ok(!r.condition(s, 0, kaku, s.players[0].chars[1]), '2 cartes seulement');
});

test('Kobby (EB04-044) : avec un Leader « Navy », défausse 1 carte au lieu d’être mis KO, une fois par tour', () => {
  const navy = leaderTyped('Navy', true);
  let s = scene([list(navy, ['EB04-044', 'EB04-046']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-044', extra: { rested: true } }]);
    setHand(g, 0, ['EB04-046']);
    oppLeaderDon(g, 3);
  }, 1);
  const koby = charUid(s, 0, 'EB04-044');
  s = passAll(attack(s, leaderUid(s, 1), koby));
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.players[0].chars.some((c) => c.uid === koby));
  assert.ok(!def('EB04-044').koReplace!.condition(s, 0, s.players[0].chars[0]), 'une fois par tour');
  coherent(s);
  // autre Leader : pas de remplacement
  s = scene([list('EB03-001', ['EB04-044', 'EB04-046']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-044', extra: { rested: true } }]);
    setHand(g, 0, ['EB04-046']);
  }, 1);
  assert.ok(!def('EB04-044').koReplace!.condition(s, 0, s.players[0].chars[0]));
});

test('Kobby (EB04-044) : [Votre tour] [Une fois par tour] pioche quand un Personnage adverse est mis KO', () => {
  const me = list('EB03-001', ['EB04-044', 'EB04-049']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-044' }]);
    setHand(g, 0, ['EB04-049']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST36-004' }, { num: 'ST36-004' }]);
  });
  const hand = s.players[0].hand.length;
  s = play(s, 'EB04-049');                                     // [Principale] KO d'un coût de base 5 ou moins
  if (s.decision?.tag === 'may') s = choose(s, 'yes');
  s = pickCard(s);
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(s.players[0].hand.length, hand - 1 + 1);
  coherent(s);
});

test('Rob Lucci (EB04-048) : avec un Leader « CP », +1000 et +2 de coût par tranche de 5 cartes de la Défausse', () => {
  const cp = leaderTyped('CP', true);
  let s = scene([list(cp, ['EB04-048']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-048' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 11));
  });
  const lucci = charUid(s, 0, 'EB04-048');
  assert.equal(power(s, lucci), 8000);
  assert.equal(fieldCost(s, lucci), 8);
  s = scene([list('EB03-001', ['EB04-048']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-048' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 11));
  });
  assert.equal(power(s, charUid(s, 0, 'EB04-048')), 6000);
  // [Jouée] placer un de ses Personnages dans la Défausse : piocher 1 carte
  s = scene([list(cp, ['EB04-048']), OPP], (g) => { setHand(g, 0, ['EB04-048']); setDon(g, 0, 4); });
  const hand = s.players[0].hand.length;
  s = play(s, 'EB04-048');
  s = choose(s, 'yes');
  s = pickCard(s);
  assert.equal(s.players[0].hand.length, hand);
  coherent(s);
});

test('Emeth (EB04-051) : ne peut attaquer qu’avec un Personnage de 12000 de puissance de base ou plus ; [Déclenchement] −3000 et jouée à 0 Vie', () => {
  let s = scene([list('EB03-001', ['EB04-051']), OPP], (g) => { setChars(g, 0, [{ num: 'EB04-051' }]); });
  assert.equal(attackAbility(s, 0, s.players[0].chars[0]).can, false);
  s = scene([list('EB03-001', ['EB04-051']), OPP], (g) => {
    setHand(g, 0, []);
    setLife(g, 0, ['EB04-051']);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    oppLeaderDon(g, 2);
  }, 1);
  const target = s.players[1].chars[0].uid;
  const before = power(s, target);
  s = passAll(attack(s, leaderUid(s, 1), leaderUid(s, 0)));
  s = choose(s, 'trigger');
  assert.equal(power(s, target), before - 3000);
  assert.ok(s.players[0].chars.some((c) => c.num === 'EB04-051'), '0 Vie : jouée');
  coherent(s);
});

test('Végapunk (EB04-057) : avec 2 Vies ou moins, ses Personnages {Scientist} jaunes ne quittent pas le terrain par un effet adverse ; [DON!! x1] [Bloqueur]', () => {
  const me = list('EB04-001', ['EB04-057', 'EB04-056']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-057' }, { num: 'EB04-056' }]);
    setLife(g, 0, g.players[0].life.slice(0, 2).map((c) => c.num));
  });
  const vega = charUid(s, 0, 'EB04-057');
  assert.equal(canLeaveByEffect(s, vega, 1), false);
  assert.equal(canLeaveByEffect(s, vega, 0), true, 'ses propres effets');
  assert.equal(canLeaveByEffect(s, charUid(s, 0, 'EB04-056'), 1), true, 'Pacifista n’est pas {Scientist}');
  s.players[0].life.push(...s.players[0].deck.splice(0, 1));
  assert.equal(canLeaveByEffect(s, vega, 1), true, '3 Vies');
  assert.equal(def('EB04-057').blocker!(s, 0, s.players[0].chars[0]), false);
  s.players[0].chars[0].don = 1;
  assert.equal(def('EB04-057').blocker!(s, 0, s.players[0].chars[0]), true);
});

// ---------- Recettes : [Contre] et « When » ----------

test('EB04-008 et EB04-050 [Contre] : le Leader gagne +3000', () => {
  for (const ev of ['EB04-008', 'EB04-050']) {
    const s0 = scene([list('EB03-001', [ev]), OPP], (g) => { setHand(g, 0, [ev]); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
    assert.equal(counterGain(s0, ev).gain, 3000, ev);
  }
});

test('EB04-009 [Contre] : +2000 à un Personnage ou à un [Silvers Rayleigh] (pas à un autre Leader)', () => {
  const s0 = scene([list(leaderNamed('Silvers Rayleigh'), ['EB04-009']), OPP], (g) => { setHand(g, 0, ['EB04-009']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s0, 'EB04-009', pickCard).gain, 2000);
  const s1 = scene([list('EB03-001', ['EB04-009']), OPP], (g) => { setHand(g, 0, ['EB04-009']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s1, 'EB04-009', (s) => (s.decision?.options.some((o) => o.uid === leaderUid(s, 0)) ? assert.fail('Leader proposé') : pickCard(s))).gain, 0);
});

test('EB04-019 et EB04-020 [Contre] : +3000 à un Leader {Minks} / {Fish-Man}, rien pour un autre', () => {
  for (const [ev, type] of [['EB04-019', 'Minks'], ['EB04-020', 'Fish-Man']]) {
    const s0 = scene([list(leaderTyped(type), [ev]), OPP], (g) => { setHand(g, 0, [ev]); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
    assert.equal(counterGain(s0, ev, (s) => (s.decision?.tag === 'ownReady' ? choose(s, 'none') : pickCard(s))).gain, 3000, ev);
    const s1 = scene([list('EB03-001', [ev]), OPP], (g) => { setHand(g, 0, [ev]); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
    assert.equal(counterGain(s1, ev, (s) => (s.decision?.tag === 'ownReady' ? choose(s, 'none') : s)).gain, 0, ev);
  }
});

test('EB04-029 [Contre] : défausser 1 carte pour +4000 à un [Sanji]', () => {
  const s0 = scene([list(leaderNamed('Sanji'), ['EB04-029', 'EB03-028']), OPP], (g) => { setHand(g, 0, ['EB04-029', 'EB03-028']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  const { gain } = counterGain(s0, 'EB04-029', (s) => {
    let t = s;
    if (t.decision?.tag === 'may') t = choose(t, 'yes');
    if (t.decision?.tag === 'discard') t = choose(t, (o) => o.id.startsWith('card:'));
    return pickCard(t);
  });
  assert.equal(gain, 4000);
});

test('EB04-035 « When » : [Votre tour] [Une fois par tour] une DON!! renvoyée au deck DON!! : 1 DON!! épuisée, avec un Leader {Kid Pirates}', () => {
  const kid = leaderTyped('Kid Pirates');
  let s = scene([list(kid, ['EB04-035', 'EB04-036']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-035' }]);
    setHand(g, 0, ['EB04-036']);
    setDon(g, 0, 9);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  s = play(s, 'EB04-036');
  s = choose(s, 'yes');                                        // DON!! −1
  s = pickCard(s);                                             // épuiser un Personnage adverse
  assert.equal(s.players[0].donDeck, 1, 'renvoyée puis reprise');
  assert.ok(s.players[0].donDeck + s.players[0].donRested + s.players[0].donActive === 10);
  coherent(s);
  // autre Leader : rien
  s = scene([list('EB03-001', ['EB04-035', 'EB04-036']), OPP], (g) => {
    setChars(g, 0, [{ num: 'EB04-035' }]);
    setHand(g, 0, ['EB04-036']);
    setDon(g, 0, 9);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  s = play(s, 'EB04-036');
  s = choose(s, 'yes');
  s = pickCard(s);                                             // épuiser un Personnage adverse
  assert.equal(s.players[0].donDeck, 2);
});
