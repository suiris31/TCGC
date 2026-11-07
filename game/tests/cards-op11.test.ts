// OP11 (tâche S8) : un test par effet des cartes codées à la main (condition vraie et fausse), et les recettes que le
// banc d'essai ne sait pas mesurer ([Contre] « pendant ce combat », [Déclenchement], [En attaquant] qui change l'issue
// du combat, cible mise KO après une baisse de puissance : 01-contrats.md § 15.4). Numéros et valeurs seulement, aucun
// texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import type { DeckList } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { canBeRested, def, hasKeyword, koCharacter, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { charUid, counterGain, leaderUid, list, oppLeaderDon, scene } from './eb-scene.ts';
import { attack, choose, coherent, hasOption, logHas, play, setChars, setDeckTop, setDon, setHand, setLife } from './helpers.ts';

const F = 'ST-21';      // deck d'appoint (Personnages presque tous sans effet)
const OPP = 'ST-21';
const NAVY = 'OP11-001';        // Leader {Navy} codé à la main (Kobby)
const JINBE_L = 'OP11-021';       // Leader {Fish-Man}
const SHIRAHOSHI_L = 'OP11-022';  // Leader [Shirahoshi]
const yes = (s: GameState) => choose(s, 'yes');

// Répond « non » aux [Bloqueur], passe les [Contre] et garde les cartes de Vie en main tant que c'est au joueur `p`
function passAll(s: GameState, p: PlayerId, keepTrigger = false): GameState {
  for (let i = 0; i < 20 && s.decision?.player === p; i++) {
    const d = s.decision;
    if (d.kind === 'blocker') s = choose(s, 'noblock');
    else if (d.kind === 'counter') s = act(s, 'pass');
    else if (d.tag === 'trigger' && !keepTrigger) s = choose(s, 'hand');
    else break;
  }
  return s;
}

// [Déclenchement] de la carte du dessus de ma Vie, révélée par une attaque du Leader adverse
function triggerFromLife(me: DeckList, top: string, extra: (g: GameState) => void, opp: DeckList | string = OPP): GameState {
  let s = scene([me, opp], (g) => {
    setLife(g, 0, [top, ...g.players[0].life.slice(1).map((c) => c.num)]);
    oppLeaderDon(g, 3);
    extra(g);
  }, 1);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  while (s.decision?.kind === 'blocker' || s.decision?.kind === 'counter') s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  assert.equal(s.decision?.tag, 'trigger', `[Déclenchement] attendu (${s.decision?.prompt})`);
  return choose(s, 'trigger');
}

test('OP11 : toutes les cartes jouables ou en doute', () => {
  const nums = Object.keys(CARDS).filter((num) => num.startsWith('OP11-'));
  assert.equal(nums.length, 119);
  const left = nums.filter((num) => !['verified', 'coded', 'auto', 'doubt'].includes(confidence(num)));
  assert.deepEqual(left, []);
});

test('Smoker (OP11-005) : [DON!! x1] pas de KO par l’effet d’un Personnage sans <Spécial>', () => {
  const me = list(NAVY, ['OP11-005'], F);
  const at = (don: number) => scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP11-005', extra: { don } }]); setDon(g, 0, 0); });
  let s = at(1);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-005'), 'effect', 1, 'ST21-010'), false, 'Personnage <Frappe>');
  s = at(1);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-005'), 'effect', 1, 'ST21-006'), true, 'Personnage <Spécial>');
  s = at(1);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-005'), 'effect', 1, 'ST21-017'), true, 'Événement');
  s = at(0);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-005'), 'effect', 1, 'ST21-010'), true, 'sans DON!!');
});

test('Prince Grus (OP11-013) : [En attaquant] les Personnages adverses de 2000 ou moins ne peuvent pas bloquer pour le tour', () => {
  const me = list(NAVY, ['OP11-013'], F);
  const at = (boost: number) => {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num: 'OP11-013' }]);
      const [b] = setChars(g, 1, [{ num: 'ST21-007' }, { num: 'ST21-008' }]);
      if (boost) g.mods.push({ uid: b.uid, stat: 'power', amount: boost, until: 'turn', source: 'essai' });
    });
    s = attack(s, charUid(s, 0, 'OP11-013'), leaderUid(s, 1));
    return s;
  };
  let s = at(0);
  const blocker = s.players[1].chars.find((c) => c.num === 'ST21-007')!;
  assert.ok(s.mods.some((m) => m.uid === blocker.uid && m.stat === 'noBlocker' && m.until === s.turn));
  assert.ok(!hasKeyword(s, 1, blocker, 'Blocker'));
  assert.notEqual(s.decision?.kind, 'blocker');
  const big = s.players[1].chars.find((c) => c.num === 'ST21-008')!;
  assert.ok(!s.mods.some((m) => m.uid === big.uid && m.stat === 'noBlocker'));
  // 3000 de puissance au moment de l'effet : il peut bloquer
  s = at(1000);
  assert.equal(s.decision?.kind, 'blocker');
});

test('X Calibur (OP11-020, d’après la VF) : −2000 à 2 Personnages adverses puis +1000 à un {Navy} ; [Déclenchement] KO 4000 ou moins', () => {
  const me = list(NAVY, ['OP11-020'], F);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP11-020']);
    setDon(g, 0, 2);
    setChars(g, 0, [{ num: 'ST21-007' }]);
    setChars(g, 1, [{ num: 'ST21-006' }, { num: 'ST21-008' }]);
  });
  s = play(s, 'OP11-020');
  s = choose(s, `card:${charUid(s, 1, 'ST21-006')}`);
  s = choose(s, `card:${charUid(s, 1, 'ST21-008')}`);
  s = choose(s, `card:${charUid(s, 0, 'ST21-007')}`);
  assert.equal(power(s, charUid(s, 1, 'ST21-006')), 3000);
  assert.equal(power(s, charUid(s, 1, 'ST21-008')), 4000);
  assert.equal(power(s, charUid(s, 0, 'ST21-007')), 3000);
  coherent(s);
  s = triggerFromLife(me, 'OP11-020', (g) => setChars(g, 1, [{ num: 'ST21-005' }, { num: 'ST21-006' }]));
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-006')}`), '5000 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-005')}`);
  assert.ok(!s.players[1].chars.some((c) => c.num === 'ST21-005'));
});

test('Jinbe (Leader OP11-021) : [Fin de votre tour] avec 6 cartes ou moins, redresse un {Fish-Man} et 1 DON!!', () => {
  const me = list(JINBE_L, [], F);
  const at = (hand: number) => {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num: 'ST21-005', extra: { rested: true } }, { num: 'ST21-006', extra: { rested: true } }]);
      setHand(g, 0, g.players[0].deck.slice(0, hand).map((c) => c.num));
      setDon(g, 0, 0, 3);
    });
    s = act(s, 'end');
    return s;
  };
  let s = at(6);
  assert.ok(!hasOption(s, `card:${charUid(s, 0, 'ST21-006')}`), '{Egghead} : non');
  s = choose(s, `card:${charUid(s, 0, 'ST21-005')}`);
  assert.equal(s.players[0].chars.find((c) => c.num === 'ST21-005')!.rested, false);
  assert.equal(s.players[0].donRested, 2);
  assert.equal(s.players[0].donActive, 1);
  s = at(7);
  assert.equal(s.players[0].chars.find((c) => c.num === 'ST21-005')!.rested, true);
  assert.equal(s.players[0].donRested, 3);
});

test('Arlong (OP11-023) : −3 de coût en main sous conditions ; [Déclenchement] épuise un coût 4 ou moins', () => {
  const me = list(JINBE_L, ['OP11-023'], F);
  const cost = (life: number, rested: number, leader = JINBE_L) => {
    const s = scene([leader === JINBE_L ? me : list(NAVY, ['OP11-023'], F), OPP], (g) => {
      g.players[0].life.splice(life);
      setDon(g, 1, 0, rested);
    });
    return def('OP11-023').handCost!(s, 0);
  };
  assert.equal(cost(3, 5), -3);
  assert.equal(cost(4, 5), 0, '4 Vies');
  assert.equal(cost(3, 4), 0, '4 cartes épuisées');
  assert.equal(cost(3, 5, NAVY), 0, 'Leader {Navy}');
  let s = triggerFromLife(me, 'OP11-023', (g) => setChars(g, 1, [{ num: 'ST21-008' }, { num: 'ST21-014' }]));
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-014')}`), 'coût 5 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-008')}`);
  assert.ok(s.players[1].chars.find((c) => c.num === 'ST21-008')!.rested);
});

test('Jinbe (OP11-031) : [Jouée] épuise avec un Leader {Fish-Man} ; [Initiative : Personnage] donnée à un {Fish-Man} joué ce tour', () => {
  const at = (leader: string) => scene([list(leader, ['OP11-031'], F), OPP], (g) => {
    setHand(g, 0, ['OP11-031']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: 'ST21-014' }]);
  });
  let s = play(at(JINBE_L), 'OP11-031');
  s = choose(s, `card:${charUid(s, 1, 'ST21-014')}`);
  assert.ok(s.players[1].chars[0].rested);
  s = play(at(NAVY), 'OP11-031');
  assert.ok(!s.players[1].chars[0].rested);
  assert.notEqual(s.decision?.tag, 'oppRest');
  // [Activation : Principale]
  s = scene([list(JINBE_L, ['OP11-031'], F), OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-031' }, { num: 'ST21-005', extra: { playedTurn: 5 } }, { num: 'ST21-006', extra: { playedTurn: 5 } }]);
  });
  const jinbe = charUid(s, 0, 'OP11-031');
  s = act(s, `act:${jinbe}`);
  assert.ok(!hasOption(s, `card:${charUid(s, 0, 'ST21-006')}`), '{Egghead} : non');
  s = choose(s, `card:${charUid(s, 0, 'ST21-005')}`);
  assert.ok(hasKeyword(s, 0, s.players[0].chars.find((c) => c.num === 'ST21-005')!, 'Rush: Character'));
  assert.ok(!hasOption(s, `act:${jinbe}`), 'une fois par tour');
  coherent(s);
});

test('Monkey D. Luffy (Leader OP11-040) : au début de son tour, avec 8 DON!! ou plus, prend un {Straw Hat Crew} parmi 5', () => {
  const me = list('OP11-040', [], F);
  const at = (don: number) => {
    let s = scene([me, OPP], (g) => {
      setDon(g, 0, don);
      setDeckTop(g, 0, ['ST21-013', 'ST21-005']);
    }, 1);
    s = act(s, 'end');
    return s;
  };
  let s = at(8);
  assert.equal(s.decision?.tag, 'pick');
  const hand = s.players[0].hand.length;
  s = choose(s, (o) => o.num === 'ST21-005');
  while (s.decision?.tag === 'scry' || s.decision?.tag === 'bottomOrder' || s.decision?.tag === 'topOrder') s = act(s, s.decision.options[s.decision.tag === 'scry' ? 1 : 0].id);
  assert.ok(s.players[0].hand.length >= hand + 1);
  assert.ok(s.players[0].hand.some((c) => c.num === 'ST21-005'));
  s = at(7);
  assert.notEqual(s.decision?.tag, 'pick');
});

test('Nami (Leader OP11-041) : [Votre tour] pioche quand une carte quitte une Vie ; [DON!! x1] [Attaque adverse] +2000', () => {
  const me = list('OP11-041', ['OP11-106'], F);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP11-106', 'OP11-106']); setDon(g, 0, 10); setChars(g, 1, [{ num: 'ST21-013' }, { num: 'ST21-006' }]); });
  s = play(s, 'OP11-106');
  s = yes(s);
  if (s.decision?.tag === 'lifeSide') s = choose(s, 'top');
  if (s.decision?.tag === 'oppKo') s = choose(s, 'none');
  // 2 cartes - 1 jouée + 1 de la Vie + 1 piochée
  assert.equal(s.players[0].hand.length, 3);
  assert.ok(logHas(s, /pioche/));
  // une fois par tour
  s = play(s, 'OP11-106');
  s = yes(s);
  if (s.decision?.tag === 'lifeSide') s = choose(s, 'top');
  if (s.decision?.tag === 'oppKo') s = choose(s, 'none');
  assert.equal(s.players[0].hand.length, 3);
  // au tour adverse : rien (dégât reçu), puis [Attaque adverse] avec 1 DON!! : défausser 1 carte pour +2000
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP11-106']); g.players[0].leader.don = 1; g.players[0].donDeck--; oppLeaderDon(g, 3); }, 1);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  assert.equal(s.decision?.tag, 'may');
  s = yes(s);
  assert.equal(power(s, leaderUid(s, 0)), 7000);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP11-106'), 'carte défaussée');
  // l'attaque (8000) passe : la carte de Vie va en main, sans pioche au tour adverse
  s = passAll(s, 0);
  assert.equal(s.players[0].life.length, 3);
  assert.equal(s.players[0].hand.length, 1, 'carte de Vie en main, pas de pioche au tour adverse');
});

test('Ichiji (OP11-043) et Yonji (OP11-046) Vinsmoke : seulement des Personnages « GERMA »', () => {
  const me = list(NAVY, ['OP11-043', 'OP11-046'], F);
  const at = (extra: string[]) => scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-043' }, { num: 'OP11-046' }, ...extra.map((num) => ({ num }))]);
    oppLeaderDon(g, 3);
  }, 1);
  let s = at([]);
  const yonji = charUid(s, 0, 'OP11-046');
  assert.equal(canBeRested(s, yonji, { player: 1, num: 'ST21-017' }), false);
  assert.equal(koCharacter(s, yonji, 'effect', 1, 'ST21-010'), false);
  s = at([]);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-046'), 'battle', 1), true, 'en combat');
  s = at(['ST21-005']);
  assert.equal(canBeRested(s, charUid(s, 0, 'OP11-046'), { player: 1, num: 'ST21-017' }), true);
  assert.equal(koCharacter(s, charUid(s, 0, 'OP11-046'), 'effect', 1, 'ST21-010'), true);
  // Ichiji : [Attaque adverse] +1000 pour le combat puis 2 cartes du deck dans la Défausse
  s = at([]);
  const trash = s.players[0].trash.length;
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  s = choose(s, `card:${leaderUid(s, 0)}`);
  assert.equal(power(s, leaderUid(s, 0)), def(s.players[0].leader.num).power! + 1000);
  assert.equal(s.players[0].trash.length, trash + 2);
  s = at(['ST21-005']);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  assert.equal(s.players[0].trash.length, trash);
  assert.notEqual(s.decision?.prompt.includes('Ichiji'), true);
});

test('Gotti (OP11-050) : [En attaquant] défausser un {Firetank Pirates} : un coût 1 ou moins en main ou sous le deck', () => {
  const me = list(NAVY, ['OP11-050', 'OP11-042'], F);
  const at = () => {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num: 'OP11-050' }]);
      setHand(g, 0, ['OP11-042']);
      setChars(g, 1, [{ num: 'ST21-013' }, { num: 'ST21-005' }]);
    });
    s = attack(s, charUid(s, 0, 'OP11-050'), leaderUid(s, 1));
    return yes(s);
  };
  let s = at();
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-005')}`), 'coût 2 : non');
  const u = charUid(s, 1, 'ST21-013');
  s = choose(s, `card:${u}`);
  s = choose(s, 'bottom');
  assert.equal(s.players[1].deck.at(-1)!.uid, u);
  s = at();
  const u2 = charUid(s, 1, 'ST21-013');
  s = choose(s, `card:${u2}`);
  s = choose(s, 'hand');
  assert.ok(s.players[1].hand.some((c) => c.uid === u2));
  // sans carte {Firetank Pirates} en main : rien
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP11-050' }]); setHand(g, 0, ['ST21-005']); setChars(g, 1, [{ num: 'ST21-013' }]); });
  s = attack(s, charUid(s, 0, 'OP11-050'), leaderUid(s, 1));
  assert.notEqual(s.decision?.tag, 'may');
});

test('Shu (OP11-088) : +5000 pour le combat quand un Personnage adverse <Tranche> attaque, une fois par tour', () => {
  const me = list(NAVY, ['OP11-088'], F);
  const at = (attacker: string) => {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num: 'OP11-088' }]);
      setChars(g, 1, [{ num: attacker }, { num: 'ST21-015' }]);
    }, 1);
    s = attack(s, charUid(s, 1, attacker), leaderUid(s, 0));
    return s;
  };
  let s = at('ST21-012');
  assert.equal(power(s, charUid(s, 0, 'OP11-088')), 10000);
  s = at('ST21-010');
  assert.equal(power(s, charUid(s, 0, 'OP11-088')), 5000);
  // le premier attaquant (sans <Tranche>) a pris la limite du tour : le second (<Tranche>) ne donne rien
  s = passAll(s, 0);
  s = attack(s, charUid(s, 1, 'ST21-015'), leaderUid(s, 0));
  assert.equal(power(s, charUid(s, 0, 'OP11-088')), 5000);
});

test('Verygood (OP11-091) : l’adversaire place 3 Événements de sa Défausse au-dessous de son deck', () => {
  const me = list(NAVY, ['OP11-091'], F);
  const opp = list('ST21-001', ['ST21-016', 'ST21-017'], F);
  const at = (events: string[]) => scene([me, opp], (g) => {
    setHand(g, 0, ['OP11-091']);
    setDon(g, 0, 4);
    const O = g.players[1];
    for (const num of events) O.trash.push(O.deck.splice(O.deck.findIndex((c) => c.num === num), 1)[0]);
    O.trash.push(O.deck.splice(O.deck.findIndex((c) => def(c.num).category === 'CHARACTER'), 1)[0]);
  });
  let s = play(at(['ST21-016', 'ST21-016', 'ST21-017', 'ST21-017']), 'OP11-091');
  for (let i = 0; i < 3; i++) {
    assert.equal(s.decision?.player, 1);
    s = act(s, s.decision!.options[0].id);
  }
  while (s.decision?.tag === 'bottomOrder') s = act(s, 'keep');
  assert.equal(s.players[1].trash.filter((c) => def(c.num).category === 'EVENT').length, 1);
  assert.equal(s.players[1].trash.length, 2);
  assert.ok(s.players[1].deck.slice(-3).every((c) => def(c.num).category === 'EVENT'));
  s = play(at(['ST21-016']), 'OP11-091');
  while (s.decision?.tag === 'bottomOrder') s = act(s, 'keep');
  assert.equal(s.players[1].trash.length, 1);
  coherent(s);
});

test('Hermep (OP11-092) : défausser 1 : piocher et jouer un {SWORD} de la Défausse, placé sous le deck à la fin du tour', () => {
  const me = list(NAVY, ['OP11-092', 'OP11-013'], F);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP11-092', 'ST21-005']);
    setDon(g, 0, 6);
    const P = g.players[0];
    P.trash.push(P.deck.splice(P.deck.findIndex((c) => c.num === 'OP11-013'), 1)[0]);
    P.trash.push(P.deck.splice(P.deck.findIndex((c) => c.num === 'OP11-092'), 1)[0]);
  });
  s = play(s, 'OP11-092');
  s = yes(s);
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.ok(!hasOption(s, `card:${s.players[0].trash.find((c) => c.num === 'OP11-092')!.uid}`), '[Helmeppo] : non');
  const grus = s.players[0].trash.find((c) => c.num === 'OP11-013')!.uid;
  s = choose(s, `card:${grus}`);
  assert.ok(s.players[0].chars.some((c) => c.uid === grus));
  s = act(s, 'end');
  assert.ok(!s.players[0].chars.some((c) => c.uid === grus));
  assert.equal(s.players[0].deck.at(-1)!.uid, grus);
});

test('Keimi (OP11-102) : [Votre tour] quand l’adversaire active un [Déclenchement] ou un Événement, Vie du dessus de chacun dans la Défausse', () => {
  const me = list(NAVY, ['OP11-102'], F);
  // [Déclenchement] adverse
  const opp0 = list('ST21-001', ['ST21-016'], F);
  let s = scene([me, opp0], (g) => {
    setChars(g, 0, [{ num: 'OP11-102', extra: { don: 5 } }]);
    setDon(g, 0, 0);
    setLife(g, 1, ['ST21-016', ...g.players[1].life.slice(1).map((c) => c.num)]);
  });
  const mine = s.players[0].life.length;
  s = attack(s, charUid(s, 0, 'OP11-102'), leaderUid(s, 1));
  s = passAll(s, 1, true);
  assert.equal(s.decision?.tag, 'trigger');
  s = choose(s, 'trigger');
  while (s.decision?.player === 1 && s.decision.inEffect) s = act(s, s.decision.options.at(-1)!.id);
  assert.equal(s.players[0].life.length, mine - 1);
  assert.equal(s.players[1].life.length, 3);
  // [Contre] adverse, adversaire à 1 Vie : rien
  const opp = list('ST21-001', ['OP11-115'], F);
  s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP11-102', extra: { don: 5 } }]);
    setDon(g, 0, 0);
    setHand(g, 1, ['OP11-115']);
    setDon(g, 1, 2);
    g.players[1].life.splice(1);
  });
  s = attack(s, charUid(s, 0, 'OP11-102'), leaderUid(s, 1));
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  assert.equal(s.players[0].life.length, mine);
});

test('Le Chignon (OP11-107) : avec le Leader [Shirahoshi], retourner la Vie face cachée pour se redresser à la fin du tour', () => {
  const at = (leader: string) => scene([list(leader, ['OP11-107'], F), OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-107', extra: { rested: true } }]);
    g.players[0].life[0].faceUp = true;
  });
  let s = at(SHIRAHOSHI_L);
  const u = charUid(s, 0, 'OP11-107');
  s = act(s, `act:${u}`);
  if (s.decision?.tag === 'may') s = yes(s);
  assert.equal(s.players[0].life[0].faceUp, false);
  assert.ok(s.players[0].chars[0].rested);
  s = act(s, 'end');
  assert.equal(s.players[0].chars.find((c) => c.uid === u)!.rested, false);
  s = at(NAVY);
  assert.ok(!hasOption(s, `act:${charUid(s, 0, 'OP11-107')}`));
});

test('Fukaboshi (OP11-110) : épuiser le Leader [Shirahoshi] à la place d’un KO ; [Jouée] Vie en main : KO coût 1 ou moins', () => {
  const me = list(SHIRAHOSHI_L, ['OP11-110'], F);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-110', extra: { rested: true } }]);
    setChars(g, 1, [{ num: 'ST21-008' }]);
  }, 1);
  s = attack(s, charUid(s, 1, 'ST21-008'), charUid(s, 0, 'OP11-110'));
  s = passAll(s, 0);
  assert.equal(s.decision?.tag, 'replace');
  s = yes(s);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP11-110'));
  assert.ok(s.players[0].leader.rested);
  // Leader déjà épuisé : KO
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-110', extra: { rested: true } }]);
    setChars(g, 1, [{ num: 'ST21-008' }]);
    g.players[0].leader.rested = true;
  }, 1);
  s = attack(s, charUid(s, 1, 'ST21-008'), charUid(s, 0, 'OP11-110'));
  s = passAll(s, 0);
  assert.ok(!s.players[0].chars.some((c) => c.num === 'OP11-110'));
  // [Jouée]
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP11-110']); setDon(g, 0, 3); setChars(g, 1, [{ num: 'ST21-013' }, { num: 'ST21-005' }]); });
  s = play(s, 'OP11-110');
  s = yes(s);
  if (s.decision?.tag === 'lifeSide') s = choose(s, 'bottom');
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-005')}`));
  s = choose(s, `card:${charUid(s, 1, 'ST21-013')}`);
  assert.equal(s.players[1].chars.length, 1);
  assert.equal(s.players[0].hand.length, 1);
});

test('Aïn (OP11-002) et Honesty Impact (OP11-018) : baisse de puissance, puis KO selon la puissance', () => {
  const me = list(NAVY, ['OP11-002', 'OP11-018'], F);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP11-002']); setDon(g, 0, 5); setChars(g, 1, [{ num: 'ST21-009' }, { num: 'ST21-013' }]); });
  s = play(s, 'OP11-002');
  s = choose(s, `card:${charUid(s, 1, 'ST21-009')}`);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-013')}`), '3000 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-009')}`);
  assert.equal(s.players[1].chars.length, 1);
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP11-018']); setDon(g, 0, 6); setChars(g, 1, [{ num: 'ST21-014' }, { num: 'ST21-008' }]); });
  s = play(s, 'OP11-018');
  s = choose(s, `card:${charUid(s, 1, 'ST21-008')}`);
  assert.equal(power(s, charUid(s, 1, 'ST21-008')), 2000);
  s = choose(s, `card:${charUid(s, 1, 'ST21-014')}`);
  assert.equal(s.players[1].chars.length, 1);
  coherent(s);
  // [Déclenchement] d'Honesty Impact : KO d'un Personnage adverse de 6000 ou moins
  s = triggerFromLife(me, 'OP11-018', (g) => setChars(g, 1, [{ num: 'ST21-008' }, { num: 'ST34-001' }]), list('ST21-001', ['ST34-001'], F));
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST34-001')}`), '7000 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-008')}`);
  assert.ok(!s.players[1].chars.some((c) => c.num === 'ST21-008'));
});

test('[Contre] des recettes : OP11-019, OP11-039, OP11-059, OP11-097, OP11-115', () => {
  const at = (leader: string, event: string, extra: (g: GameState) => void = () => {}) => scene([list(leader, [event], F), OPP], (g) => {
    setHand(g, 0, [event]);
    setDon(g, 0, 5);
    oppLeaderDon(g, 3);
    extra(g);
  }, 1);
  const pickLeader = (s: GameState) => (s.decision?.options.some((o) => o.id === `card:${leaderUid(s, 0)}`) ? choose(s, `card:${leaderUid(s, 0)}`) : s);
  // OP11-019 : +2000 pour le combat, puis +1000 pour le tour si l'adversaire a un 6000 ou plus
  let r = counterGain(at(NAVY, 'OP11-019', (g) => setChars(g, 1, [{ num: 'ST21-008' }])), 'OP11-019', (s) => pickLeader(pickLeader(s)));
  assert.equal(r.gain, 2000);
  assert.ok(logHas(r.s, /\+1000 de puissance pour le tour/));
  r = counterGain(at(NAVY, 'OP11-019', (g) => setChars(g, 1, [{ num: 'ST21-006' }])), 'OP11-019', (s) => pickLeader(pickLeader(s)));
  assert.equal(r.gain, 2000);
  assert.ok(!logHas(r.s, /\+1000 de puissance pour le tour/));
  // OP11-039 : +3000 à un Leader {Fish-Man}, puis épuiser un coût 3 ou moins
  r = counterGain(at(JINBE_L, 'OP11-039', (g) => setChars(g, 1, [{ num: 'ST21-006' }])), 'OP11-039', (s) => {
    s = pickLeader(s);
    return s.decision?.tag === 'oppRest' ? choose(s, (o) => o.uid !== undefined) : s;
  });
  assert.equal(r.gain, 3000);
  assert.equal(counterGain(at(NAVY, 'OP11-039'), 'OP11-039', pickLeader).gain, 0);
  // OP11-059 : +2000, puis encore +2000 avec 4 cartes ou moins en main
  assert.equal(counterGain(at(NAVY, 'OP11-059'), 'OP11-059', pickLeader).gain, 4000);
  assert.equal(counterGain(at(NAVY, 'OP11-059', (g) => g.players[0].hand.push(...g.players[0].deck.splice(0, 5))), 'OP11-059', pickLeader).gain, 2000);
  // OP11-097 : +1000, puis un Personnage noir de coût 3 ou moins de la Défausse avec 10 cartes ou plus dans la Défausse
  assert.equal(counterGain(at(NAVY, 'OP11-097'), 'OP11-097', pickLeader).gain, 1000);
  // ... avec 10 cartes dans la Défausse : le Personnage noir de coût 3 ou moins va en main
  r = counterGain(scene([list(NAVY, ['OP11-097', 'OP11-086'], F), OPP], (g) => {
    setHand(g, 0, ['OP11-097']);
    setDon(g, 0, 5);
    oppLeaderDon(g, 3);
    const P = g.players[0];
    P.trash.push(P.deck.splice(P.deck.findIndex((c) => c.num === 'OP11-086'), 1)[0], ...P.deck.splice(0, 9));
  }, 1), 'OP11-097', (s) => {
    s = pickLeader(s);
    return s.decision?.options.some((o) => o.num === 'OP11-086') ? choose(s, (o) => o.num === 'OP11-086') : s;
  });
  assert.equal(r.gain, 1000);
  assert.ok(r.s.players[0].hand.some((c) => c.num === 'OP11-086'));
  // OP11-115 : +4000 avec le Leader [Shirahoshi] seulement
  assert.equal(counterGain(at(SHIRAHOSHI_L, 'OP11-115'), 'OP11-115', pickLeader).gain, 4000);
  assert.equal(counterGain(at(NAVY, 'OP11-115'), 'OP11-115', pickLeader).gain, 0);
});

test('[Déclenchement] des recettes : Maître des lieux (OP11-028) et Désolée... (OP11-115) : KO', () => {
  let s = triggerFromLife(list(NAVY, ['OP11-028'], F), 'OP11-028', (g) => setChars(g, 1, [{ num: 'ST21-006', extra: { rested: true } }, { num: 'ST21-008', extra: { rested: true } }, { num: 'ST21-013' }]));
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-008')}`), 'coût 4 : non');
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-013')}`), 'redressé : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-006')}`);
  assert.ok(!s.players[1].chars.some((c) => c.num === 'ST21-006'));
  s = triggerFromLife(list(NAVY, ['OP11-115'], F), 'OP11-115', (g) => setChars(g, 1, [{ num: 'ST21-005' }, { num: 'ST21-006' }]));
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-006')}`), 'coût 3 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST21-005')}`);
  assert.ok(!s.players[1].chars.some((c) => c.num === 'ST21-005'));
});

test('Monkey D. Luffy (OP11-118) : [En attaquant] défausser 1 : renvoie un coût 4 ou moins, puis 1 DON!! épuisée', () => {
  const me = list(NAVY, ['OP11-118'], F);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP11-118' }]);
    setHand(g, 0, ['ST21-005']);
    setDon(g, 0, 0, 2);
    setChars(g, 1, [{ num: 'ST21-008' }, { num: 'ST21-014' }]);
  });
  const luffy = charUid(s, 0, 'OP11-118');
  s = attack(s, luffy, leaderUid(s, 1));
  s = yes(s);
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.uid !== undefined);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST21-014')}`), 'coût 5 : non');
  const u = charUid(s, 1, 'ST21-008');
  s = choose(s, `card:${u}`);
  assert.ok(s.players[1].hand.some((c) => c.uid === u));
  if (s.decision?.tag === 'donTarget') s = choose(s, `card:${luffy}`);
  assert.equal(s.players[0].chars[0].don + s.players[0].leader.don, 1);
  assert.equal(s.players[0].donRested, 1);
});
