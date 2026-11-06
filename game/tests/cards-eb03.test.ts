// EB03 (tâche S4) : un test par effet des cartes codées à la main (condition vraie et fausse), et les [Contre] des
// recettes que le banc d'essai ne sait pas mesurer (« pendant ce combat », 01-contrats.md § 15.4). Numéros et valeurs
// seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confidence } from '../engine/recipes/confidence.ts';
import { def, fieldCost, power } from '../engine/rules.ts';
import { act } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, keepOrder, play, setChars, setDeckTop, setDon, setHand, setLife } from './helpers.ts';
import { charUid, counterGain, leaderNamed, oppLeaderDon, leaderUid, list, scene } from './eb-scene.ts';

const OPP = 'ST-36';
const passAll = (s: GameState) => {
  while (s.decision && s.decision.player === 0 && (s.decision.kind === 'counter' || s.decision.kind === 'blocker')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
};

test('Nefertari Vivi (Leader EB03-001) : remplace une fois par tour le KO d’un Personnage de coût de base 4 ou plus', () => {
  const me = list('EB03-001', ['EB03-024', 'EB03-028']);
  // EB03-024 (coût 5) attaqué par le Leader adverse : défausser 1 carte à la place du KO
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-024', extra: { rested: true } }]);
    setHand(g, 0, ['EB03-028']);
    oppLeaderDon(g, 3);
  }, 1);
  const vivi = charUid(s, 0, 'EB03-024');
  s = passAll(attack(s, leaderUid(s, 1), vivi));
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.players[0].chars.some((c) => c.uid === vivi));
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
  // coût de base 2 (EB03-028) : pas de remplacement
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-028', extra: { rested: true } }]);
    setHand(g, 0, ['EB03-024']);
    oppLeaderDon(g, 3);
  }, 1);
  const yu = charUid(s, 0, 'EB03-028');
  s = passAll(attack(s, leaderUid(s, 1), yu));
  assert.notEqual(s.decision?.tag, 'replace');
  assert.ok(!s.players[0].chars.some((c) => c.uid === yu));
});

test('Nefertari Vivi (Leader EB03-001) : s’épuiser, −2000 à un Personnage adverse, puis [Initiative] à un Personnage sans [En attaquant]', () => {
  const me = list('EB03-001', ['EB03-028', 'EB03-008']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-028' }, { num: 'EB03-008' }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const target = s.players[1].chars[0].uid;
  const before = power(s, target);
  s = choose(s, `act:${leaderUid(s, 0)}`);
  s = choose(s, `card:${target}`);
  assert.equal(power(s, target), before - 2000);
  // EB03-008 a un effet [En attaquant] : seul EB03-028 est proposé
  assert.ok(hasOption(s, `card:${charUid(s, 0, 'EB03-028')}`));
  assert.ok(!hasOption(s, `card:${charUid(s, 0, 'EB03-008')}`));
  s = choose(s, `card:${charUid(s, 0, 'EB03-028')}`);
  assert.ok(s.mods.some((m) => m.uid === charUid(s, 0, 'EB03-028') && m.keyword === 'Rush'));
  assert.equal(s.players[0].leader.rested, true);
  coherent(s);
});

test('Monet (EB03-010) : un Personnage de 1000 de puissance ou moins ou un Événement parmi les 5 cartes du dessus', () => {
  const me = list('EB03-001', ['EB03-010', 'EB03-011', 'EB03-026']);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['EB03-010']);
    setDon(g, 0, 5);
    setDeckTop(g, 0, ['EB03-026', 'EB03-011']);
  });
  s = play(s, 'EB03-010');
  const names = s.decision!.options.map((o) => o.id);
  const ids = s.players[0].deck.length;
  void ids;
  // EB03-026 (8000) n'est pas proposé, EB03-011 (Événement) l'est
  assert.ok(s.decision!.options.some((o) => o.num === 'EB03-011'));
  assert.ok(!s.decision!.options.some((o) => o.num === 'EB03-026'), names.join(','));
  s = keepOrder(choose(s, (o) => o.num === 'EB03-011'));
  assert.ok(s.players[0].hand.some((c) => c.num === 'EB03-011'));
  coherent(s);
});

test('Carrot (EB03-013) : KO seulement si jouée ce tour, puis jouer [Zou] (un Lieu) de sa main', () => {
  const me = list('EB03-001', ['EB03-013', 'OP08-039']);
  // jouée ce tour : KO d'un Personnage adverse épuisé de coût 5 ou moins, puis [Zou] joué
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-013', extra: { playedTurn: 5 } }]);
    setHand(g, 0, ['OP08-039']);
    setChars(g, 1, [{ num: 'ST36-004', extra: { rested: true } }]);
  });
  const victim = s.players[1].chars[0].uid;
  s = choose(s, `act:${charUid(s, 0, 'EB03-013')}`);
  s = choose(s, `card:${victim}`);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(!s.players[1].chars.some((c) => c.uid === victim));
  assert.equal(s.players[0].stage?.num, 'OP08-039');
  assert.ok(!hasOption(s, `act:${charUid(s, 0, 'EB03-013')}`), 'une fois par tour');
  coherent(s);
  // jouée à un tour précédent : pas de KO, [Zou] quand même (le « puis » n'est pas soumis à la condition)
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-013', extra: { playedTurn: 3 } }]);
    setHand(g, 0, ['OP08-039']);
    setChars(g, 1, [{ num: 'ST36-004', extra: { rested: true } }]);
  });
  s = choose(s, `act:${charUid(s, 0, 'EB03-013')}`);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(s.players[0].stage?.num, 'OP08-039');
});

test('Nefertari Vivi (EB03-024) : joue un Personnage {Alabasta} de coût 5 ou moins, puis plus de Personnage ce tour', () => {
  const me = list('EB03-001', ['EB03-024', 'EB04-021', 'EB03-028']);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['EB03-024', 'EB04-021', 'EB03-028']);
    setDon(g, 0, 10);
  });
  s = play(s, 'EB03-024');
  // EB03-028 (Yû, {Animal Kingdom Pirates}) n'est pas proposé
  assert.ok(!s.decision!.options.some((o) => o.id.startsWith('card:') && s.players[0].hand.find((c) => c.uid === o.uid)?.num === 'EB03-028'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.players[0].chars.some((c) => c.num === 'EB04-021'));
  assert.equal(s.players[0].noCharsTurn, s.turn);
  assert.ok(!s.decision?.options.some((o) => o.id.startsWith('play:')), 'plus de Personnage à jouer');
  coherent(s);
});

test('Boa Hancock (EB03-026) : [Jouée] l’adversaire place 1 carte sous son deck seulement avec 5 cartes ou plus en main', () => {
  const me = list('EB03-001', ['EB03-026']);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-026']); setDon(g, 0, 6); });
  const oppHand = s.players[1].hand.length;
  assert.ok(oppHand >= 5);
  s = play(s, 'EB03-026');
  if (s.decision?.player === 1) s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].hand.length, oppHand - 1);
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-026']); setDon(g, 0, 6); g.players[1].deck.push(...g.players[1].hand.splice(0, g.players[1].hand.length - 4)); });
  s = play(s, 'EB03-026');
  assert.equal(s.players[1].hand.length, 4);
});

test('Boa Hancock (EB03-026) : placer un de ses Personnages sous le deck, 1 DON!! épuisée au Leader et à un Personnage', () => {
  const me = list('EB03-001', ['EB03-026', 'EB03-028']);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB03-026' }, { num: 'EB03-028' }]);
    setDon(g, 0, 0, 3);
  });
  const hancock = charUid(s, 0, 'EB03-026');
  s = choose(s, `act:${hancock}`);
  s = choose(s, `card:${charUid(s, 0, 'EB03-028')}`);   // coût : Yû sous le deck
  assert.equal(s.players[0].leader.don, 1);
  s = choose(s, `card:${hancock}`);
  assert.equal(s.players[0].chars.find((c) => c.uid === hancock)!.don, 1);
  assert.equal(s.players[0].donRested, 1);
  assert.ok(!hasOption(s, `act:${hancock}`));
  coherent(s);
});

test('Margaret (EB03-027) : renvoie en main un Personnage de 7000 de puissance de base exactement (l’un ou l’autre camp)', () => {
  const me = list('EB03-001', ['EB03-027', 'EB03-026']);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['EB03-027']);
    setDon(g, 0, 6);
    setChars(g, 0, [{ num: 'EB03-026' }]);                 // 8000 : non
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const own8000 = charUid(s, 0, 'EB03-026');
  s = play(s, 'EB03-027');
  const margaret = charUid(s, 0, 'EB03-027');               // elle-même : 7000
  assert.ok(hasOption(s, `card:${margaret}`));
  assert.ok(!hasOption(s, `card:${own8000}`));
  s = choose(s, `card:${margaret}`);
  assert.ok(s.players[0].hand.some((c) => c.num === 'EB03-027'));
  coherent(s);
});

test('Reiju Vinsmoke (EB03-031) : DON!! −1, avec un Leader [Sanji], active l’effet [Principale] d’un Événement de sa Défausse', () => {
  const leader = leaderNamed('Sanji');
  const me = list(leader, ['EB03-031', 'EB04-008']);
  let s = scene([me, OPP], (g) => {
    const ev = setHand(g, 0, ['EB04-008']);
    g.players[0].hand = [];
    g.players[0].trash.push(...ev);
    setHand(g, 0, ['EB03-031']);
    setDon(g, 0, 6);
    setLife(g, 0, []);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const victim = s.players[1].chars[0].uid;
  const before = power(s, victim);
  s = play(s, 'EB03-031');
  s = choose(s, 'yes');                                     // DON!! −1
  s = choose(s, (o) => o.num === 'EB04-008');
  s = choose(s, `card:${victim}`);                          // EB04-008 : 2 Vies ou moins, −3000
  assert.equal(power(s, victim), before - 3000);
  assert.ok(s.players[0].trash.some((c) => c.num === 'EB04-008'), 'l’Événement reste dans la Défausse');
  coherent(s);
  // autre Leader : le coût n'est même pas proposé
  s = scene([list('EB03-001', ['EB03-031', 'EB04-008']), OPP], (g) => {
    const ev = setHand(g, 0, ['EB04-008']);
    g.players[0].hand = [];
    g.players[0].trash.push(...ev);
    setHand(g, 0, ['EB03-031']);
    setDon(g, 0, 6);
  });
  const don = s.players[0].donActive;
  s = play(s, 'EB03-031');
  assert.notEqual(s.decision?.tag, 'may');
  assert.equal(s.players[0].donActive + s.players[0].donRested, don);
});

test('Kujaku (EB03-041) : [Tour adverse] +2000 à ses Personnages {SWORD} de coût 6 ou moins ; défausser 1 {Navy} pour piocher 2', () => {
  const me = list('EB03-001', ['EB03-041', 'EB04-044', 'EB03-028']);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB03-041' }, { num: 'EB04-044' }, { num: 'EB03-028' }]); }, 1);
  assert.equal(power(s, charUid(s, 0, 'EB03-041')), 8000);    // {SWORD}, coût 4
  assert.equal(power(s, charUid(s, 0, 'EB04-044')), 9000);    // {SWORD}, coût 6
  assert.equal(power(s, charUid(s, 0, 'EB03-028')), def('EB03-028').power ?? 0);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB03-041' }]); });
  assert.equal(power(s, charUid(s, 0, 'EB03-041')), 6000, 'pendant son tour : rien');
  // [Jouée]
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-041', 'EB04-044']); setDon(g, 0, 4); });
  const hand = s.players[0].hand.length;
  s = play(s, 'EB03-041');
  s = choose(s, 'yes');
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, hand - 1 - 1 + 2);
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-041', 'EB03-028']); setDon(g, 0, 4); });
  s = play(s, 'EB03-041');
  assert.notEqual(s.decision?.tag, 'may', 'pas de carte {Navy} en main');
  coherent(s);
});

test('Black Maria (EB03-044) : [Bloqueur] avec un Leader multicolore ; cherche puis joue [Onigashima Island] (un Lieu)', () => {
  const me = list('EB03-001', ['EB03-044', 'ST04-017']);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'EB03-044' }]); });
  assert.ok(def('EB03-044').blocker!(s, 0, s.players[0].chars[0]));
  s = scene([list('ST36-001', ['EB03-044']), OPP], (g) => { setChars(g, 0, [{ num: 'EB03-044' }]); });
  if (def('ST36-001').colors.length === 1) assert.ok(!def('EB03-044').blocker!(s, 0, s.players[0].chars[0]));
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-044']); setDon(g, 0, 10); setDeckTop(g, 0, ['ST04-017']); });
  s = play(s, 'EB03-044');
  s = keepOrder(choose(s, (o) => o.num === 'ST04-017'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].stage?.num, 'ST04-017');
  coherent(s);
});

test('Miss Doublefinger (EB03-046) : pioche s’il y a un Personnage de coût 0 ou de coût 8 ou plus ; [En cas de KO] 2 cartes du deck à la Défausse', () => {
  const me = list('EB03-001', ['EB03-046', 'EB04-013']);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-046']); setDon(g, 0, 4); setChars(g, 0, [{ num: 'EB04-013' }]); });
  const hand = s.players[0].hand.length;
  s = play(s, 'EB03-046');
  assert.equal(s.players[0].hand.length, hand);              // jouée (−1), piochée (+1)
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-046']); setDon(g, 0, 4); setChars(g, 0, []); setChars(g, 1, [{ num: 'ST36-005' }]); });
  const hand2 = s.players[0].hand.length;
  if (fieldCost(s, s.players[1].chars[0].uid) > 0 && fieldCost(s, s.players[1].chars[0].uid) < 8) {
    s = play(s, 'EB03-046');
    assert.equal(s.players[0].hand.length, hand2 - 1);
  }
  // [En cas de KO]
  s = scene([list('OP10-099', ['EB03-046']), OPP], (g) => { setChars(g, 0, [{ num: 'EB03-046', extra: { rested: true } }]); oppLeaderDon(g, 2); }, 1);
  const trash = s.players[0].trash.length;
  s = passAll(attack(s, leaderUid(s, 1), charUid(s, 0, 'EB03-046')));
  assert.equal(s.players[0].trash.length, trash + 3);        // elle et les 2 cartes du dessus
});

test('Événement EB03-049 : épuiser 7 DON!!, avec un Leader [Perona], jouer un {Thriller Bark Pirates} de coût 6 ou moins et un de coût 4 ou moins ; [Contre] +3000', () => {
  {
    const perona = leaderNamed('Perona');
    const me = list(perona, ['EB03-049', 'EB03-045', 'OP01-077']);
    let s = scene([me, OPP], (g) => {
      setHand(g, 0, ['EB03-049', 'EB03-045']);
      const t = setHand(g, 0, ['OP01-077']);
      g.players[0].hand = [];
      g.players[0].trash.push(...t);
      setHand(g, 0, ['EB03-049', 'EB03-045']);
      setDon(g, 0, 10);
    });
    s = play(s, 'EB03-049');
    s = choose(s, 'yes');
    s = choose(s, (o) => o.id.startsWith('card:'));
    s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(s.players[0].chars.length, 2);
    coherent(s);
  }
  // [Contre] : le Leader gagne +3000
  const me = list('EB03-001', ['EB03-049']);
  const s0 = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-049']); setDon(g, 0, 2); oppLeaderDon(g, 2); }, 1);
  assert.equal(def('EB03-049').counterPower!(s0, 0, leaderUid(s0, 0)), 3000);
  const { gain } = counterGain(s0, 'EB03-049');
  assert.equal(gain, 3000);
});

test('Charlotte Smoothie (EB03-051) : KO seulement avec une Vie face visible, puis toutes les Vies face cachée', () => {
  const me = list('EB03-001', ['EB03-051', 'EB03-028', 'EB03-024']);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['EB03-051']);
    setDon(g, 0, 3);
    setLife(g, 0, ['EB03-028', 'EB03-024']);
    g.players[0].life[0].faceUp = true;
    setChars(g, 1, [{ num: 'ST36-004' }]);
  });
  const target = s.players[1].chars[0].uid;
  const cheap = fieldCost(s, target) <= 2;
  s = play(s, 'EB03-051');
  if (cheap) s = choose(s, `card:${target}`);
  assert.ok(s.players[0].life.every((c) => !c.faceUp));
  if (cheap) assert.ok(!s.players[1].chars.some((c) => c.uid === target));
  coherent(s);
  // aucune Vie face visible : pas de KO
  s = scene([me, OPP], (g) => { setHand(g, 0, ['EB03-051']); setDon(g, 0, 3); setChars(g, 1, [{ num: 'ST36-004' }]); });
  s = play(s, 'EB03-051');
  assert.equal(s.players[1].chars.length, 1);
});

// ---------- [Contre] des recettes (EB03) ----------

// « jusqu'à 1 de vos ... » quand le [Contre] demande la cible : la première proposée
const pickCard = (s: GameState) => (s.decision?.options.some((o) => o.id.startsWith('card:')) ? choose(s, (o) => o.id.startsWith('card:')) : s);

test('EB03-011 [Contre] : +4000 avec un Leader [Nefeltari Vivi], rien sinon', () => {
  const s0 = scene([list('EB03-001', ['EB03-011']), OPP], (g) => { setHand(g, 0, ['EB03-011']); setDon(g, 0, 2); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s0, 'EB03-011').gain, 4000);
  const s1 = scene([list('ST36-001', ['EB03-011']), OPP], (g) => { setHand(g, 0, ['EB03-011']); setDon(g, 0, 2); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s1, 'EB03-011').gain, 0);
});

test('EB03-020 [Contre] : +2000, puis +2000 de plus avec 2 Personnages {FILM} ou plus', () => {
  const film = ['EB03-061', 'EB03-003'];
  const s0 = scene([list('EB03-001', ['EB03-020', ...film]), OPP], (g) => {
    setHand(g, 0, ['EB03-020']); setDon(g, 0, 2); oppLeaderDon(g, 2);
    setChars(g, 0, film.map((num) => ({ num })));
  }, 1);
  assert.equal(counterGain(s0, 'EB03-020').gain, 4000);
  const s1 = scene([list('EB03-001', ['EB03-020', ...film]), OPP], (g) => {
    setHand(g, 0, ['EB03-020']); setDon(g, 0, 2); oppLeaderDon(g, 2);
    setChars(g, 0, [{ num: film[0] }]);
  }, 1);
  assert.equal(counterGain(s1, 'EB03-020').gain, 2000);
});

test('EB03-029 [Contre] : +3000 à un [Boa Hancock] seulement', () => {
  {
    const hancock = leaderNamed('Boa Hancock');
    const s0 = scene([list(hancock, ['EB03-029']), OPP], (g) => { setHand(g, 0, ['EB03-029']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
    assert.equal(counterGain(s0, 'EB03-029', pickCard).gain, 3000);
  }
  const s1 = scene([list('EB03-001', ['EB03-029']), OPP], (g) => { setHand(g, 0, ['EB03-029']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s1, 'EB03-029').gain, 0);
});

test('EB03-038 [Contre] : +3000 au Leader', () => {
  const s0 = scene([list('EB03-001', ['EB03-038']), OPP], (g) => { setHand(g, 0, ['EB03-038']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s0, 'EB03-038').gain, 3000);
});
