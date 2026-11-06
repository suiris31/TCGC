// OP14 (tâche S5) : un test par effet des cartes codées à la main (condition vraie et fausse), et les [Contre] des
// recettes que le banc d'essai ne sait pas mesurer (« pendant ce combat », 01-contrats.md § 15.4). Numéros et valeurs
// seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS, type DeckList } from '../engine/decks.ts';
import { act, advance, newGame } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { basePower, fieldCost, koCharacter, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, hasOption, play, setChars, setDeckTop, setDon, setHand, setLife, takeField } from './helpers.ts';

// ---------- Situations (comme eb-scene.ts de S4 : ces cartes ne sont dans aucun deck du registre) ----------

let n = 0;
// Une liste de 50 cartes : celles données (4 de chaque), puis des cartes de `filler` jusqu'à 50
function list(leader: string, nums: string[], filler = 'ST-36'): DeckList {
  const cards: Record<string, number> = {};
  for (const num of nums) cards[num] = 4;
  let total = nums.length * 4;
  for (const [num, k] of Object.entries(DECKS[filler].cards)) {
    if (total >= 50) break;
    if (cards[num] || num === leader) continue;
    const take = Math.min(k, 50 - total);
    cards[num] = take;
    total += take;
  }
  return { id: `PERSO-s5-${n++}`, name: 'Essai S5', series: 'PERSO', leader, cards };
}

function scene(decks: [DeckList | string, DeckList | string], setup: (s: GameState) => void, active: PlayerId = 0): GameState {
  const s = act(act(newGame({ decks, names: ['Moi', 'IA'], seed: 13, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 3;
  s.turn = 5;
  s.active = active;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

const leaderUid = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
const charUid = (s: GameState, p: PlayerId, num: string) => {
  const c = s.players[p].chars.find((x) => x.num === num);
  assert.ok(c, `${num} absent du terrain du joueur ${p}`);
  return c.uid;
};
const OPP = 'ST-36';

// L'adversaire (joueur 1, actif) attaque `target` avec son Leader ; on passe les [Bloqueur]
function oppAttacks(s: GameState, target: number): GameState {
  s = attack(s, leaderUid(s, 1), target);
  // Doflamingo (Leader OP14-060) propose de changer la cible : non
  while (s.decision?.kind === 'blocker' || (s.decision?.tag === 'may' && s.decision.prompt.includes('Doflamingo'))) s = choose(s, s.decision!.kind === 'blocker' ? 'noblock' : 'no');
  return s;
}

// L'adversaire attaque mon Leader ; je joue l'Événement [Contre] `event` : puissance gagnée pour le combat (lue au
// journal : le combat peut finir aussitôt)
function counterGain(s0: GameState, event: string, answer?: (s: GameState) => GameState): { s: GameState; gain: number } {
  let s = oppAttacks(s0, leaderUid(s0, 0));
  assert.equal(s.decision?.kind, 'counter', `décision attendue : counter, obtenue ${s.decision?.kind} (${s.decision?.prompt})`);
  const from = s.log.length;
  const opt = s.decision!.options.find((o) => o.id.startsWith('cevent:') && s.players[0].hand.some((c) => c.uid === o.uid && c.num === event));
  assert.ok(opt, `${event} absent des [Contre] proposés`);
  s = act(s, opt.id);
  if (answer) s = answer(s);
  const gain = s.log.slice(from).reduce((sum, l) => sum + [...l.text.matchAll(/gagne (?:encore )?\+(\d+) de puissance pour le combat/g)].reduce((t, m) => t + Number(m[1]), 0), 0);
  return { s, gain };
}

const oppLeaderDon = (s: GameState, k: number) => {
  s.players[1].leader.don += k;
  s.players[1].donDeck -= k;
};
const yes = (s: GameState) => choose(s, 'yes');
// Un Personnage adverse de coût 0 : OP10-103 (coût 1) reçoit −1 de coût pour le tour
const zeroCostOpp = (g: GameState) => {
  const [c] = setChars(g, 1, [{ num: 'OP10-103' }]);
  g.mods.push({ uid: c.uid, stat: 'cost', amount: -1, until: g.turn, source: 'essai' });
};

test('OP14 et ST29 : toutes les cartes jouables ou en doute', () => {
  const nums = Object.keys(CARDS).filter((num) => num.startsWith('OP14-') || num.startsWith('ST29-'));
  assert.equal(nums.length, 137);
  const left = nums.filter((num) => !['verified', 'coded', 'auto', 'doubt'].includes(confidence(num)));
  assert.deepEqual(left, []);
});

const N = 'ST-34';   // deck d'appoint sans {Supernovas}, {Donquixote Pirates}, « Baroque Works »...

test('Trafalgar Law (Leader OP14-001) : échange la puissance de base de 2 Personnages {Supernovas} ou {Heart Pirates}', () => {
  const me = list('OP14-001', ['OP14-002', 'OP14-007', 'OP14-006'], N);
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-002' }, { num: 'OP14-007' }, { num: 'ST34-003' }]));
  s = choose(s, `act:${leaderUid(s, 0)}`);
  assert.equal(basePower(s, charUid(s, 0, 'OP14-002')), 7000);
  assert.equal(basePower(s, charUid(s, 0, 'OP14-007')), 2000);
  assert.ok(!hasOption(s, `act:${leaderUid(s, 0)}`), 'une fois par tour');
  coherent(s);
  // un seul Personnage {Supernovas} ou {Heart Pirates} : rien à échanger
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-006' }, { num: 'ST34-002' }]));
  if (hasOption(s, `act:${leaderUid(s, 0)}`)) s = choose(s, `act:${leaderUid(s, 0)}`);
  assert.equal(basePower(s, charUid(s, 0, 'OP14-006')), 2000);
  assert.equal(basePower(s, charUid(s, 0, 'ST34-002')), 5000);
});

test('Capone Bege (OP14-003) : pas de KO par l’effet d’un Personnage adverse de 5000 de puissance de base ou moins', () => {
  const me = list('OP14-001', ['OP14-003'], N);
  const s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-003' }, { num: 'ST34-002' }]));
  const bege = charUid(s, 0, 'OP14-003');
  assert.equal(koCharacter(s, bege, 'effect', 1, 'ST36-003'), false, 'effet d’un Personnage de 4000');
  assert.equal(koCharacter(s, bege, 'effect', 1, 'OP13-116'), true, 'effet d’un Événement');
  const s2 = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-003' }]));
  assert.equal(koCharacter(s2, charUid(s2, 0, 'OP14-003'), 'effect', 1, 'ST36-005'), true, 'effet d’un Personnage de 7000');
  const s3 = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-003' }]));
  assert.equal(koCharacter(s3, charUid(s3, 0, 'OP14-003'), 'battle', 1), true, 'en combat');
});

test('Trafalgar Law (OP14-009) : sur une attaque adverse, défausser 2 cartes pour échanger la puissance de base du Leader et d’un Personnage', () => {
  const me = list('OP14-001', ['OP14-009', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-009' }]);
    setHand(g, 0, ['ST34-003', 'ST34-003', 'ST34-002']);
    oppLeaderDon(g, 2);
  }, 1);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  s = yes(s);
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(basePower(s, leaderUid(s, 0)), 10000);
  assert.equal(basePower(s, charUid(s, 0, 'OP14-009')), 5000);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
});

test('X-Drake (OP14-016) : au tour adverse, −2000 à son Leader à la place de la sortie d’un Personnage {Supernovas} ; [DON!! x1] [En attaquant] −2000', () => {
  const me = list('OP14-001', ['OP14-016', 'OP14-002'], N);
  const opp = list('OP14-040', ['OP14-048'], N);
  // Shiliew adverse renvoie Urouge : X-Drake le garde sur le terrain, le Leader reçoit −2000
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP14-016' }, { num: 'OP14-002' }]);
    setHand(g, 1, ['OP14-048']);
    setDon(g, 1, 10);
  }, 1);
  const urouge = charUid(s, 0, 'OP14-002');
  s = play(s, 'OP14-048', 1);
  s = choose(s, `card:${urouge}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(s.players[0].chars.some((c) => c.uid === urouge));
  assert.equal(power(s, leaderUid(s, 0)), 3000);
  coherent(s);
  // [DON!! x1] [En attaquant] : −2000 à un Personnage adverse ; sans DON!!, rien
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-016', extra: { don: 1 } }]);
    setChars(g, 1, [{ num: 'ST36-005', extra: { rested: true } }]);
  });
  const target = s.players[1].chars[0].uid;
  s = attack(s, charUid(s, 0, 'OP14-016'), leaderUid(s, 1));
  s = choose(s, `card:${target}`);
  assert.equal(power(s, target), 5000);
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-016' }]);
    setChars(g, 1, [{ num: 'ST36-005', extra: { rested: true } }]);
  });
  s = attack(s, charUid(s, 0, 'OP14-016'), leaderUid(s, 1));
  assert.ok(!hasOption(s, `card:${s.players[1].chars[0].uid}`));
});

test('Shambles (OP14-017) : échange la puissance de base de 2 Personnages adverses de 9000 de puissance de base ou moins', () => {
  const me = list('OP14-001', ['OP14-017'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-017']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST36-005' }, { num: 'ST36-004' }]);
  });
  const [a, b] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'OP14-017');
  assert.equal(basePower(s, a), 2000);
  assert.equal(basePower(s, b), 7000);
  coherent(s);
});

test('Issho (OP14-021) : épuisé à son tour, Vie du dessus en main pour qu’un Personnage adverse épuisé ne se redresse pas', () => {
  const me = list('OP14-020', ['OP14-021'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-021' }]);
    setChars(g, 1, [{ num: 'ST36-005', extra: { rested: true } }]);
  });
  const victim = s.players[1].chars[0].uid;
  const life = s.players[0].life.length;
  s = attack(s, charUid(s, 0, 'OP14-021'), leaderUid(s, 1));
  s = yes(s);
  s = choose(s, `card:${victim}`);
  assert.equal(s.players[0].life.length, life - 1);
  assert.ok(s.mods.some((m) => m.uid === victim && m.stat === 'noRefresh'));
  coherent(s);
  // refusée : rien
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-021' }]);
    setChars(g, 1, [{ num: 'ST36-005', extra: { rested: true } }]);
  });
  s = attack(s, charUid(s, 0, 'OP14-021'), leaderUid(s, 1));
  s = choose(s, 'no');
  assert.equal(s.players[0].life.length, life);
  assert.ok(!s.mods.some((m) => m.stat === 'noRefresh'));
});

test('Kinémon (OP14-024) : redresse 3 DON!!, puis plus de Personnage ce tour ; [En cas de KO] épuise une carte adverse', () => {
  const me = list('OP14-020', ['OP14-024', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-024', 'ST34-003']);
    setDon(g, 0, 4, 4);
  });
  s = play(s, 'OP14-024');
  assert.equal(s.players[0].donActive, 3);
  assert.equal(s.players[0].noCharsTurn, s.turn);
  coherent(s);
  // mis KO en combat (au tour adverse) : épuise le Leader adverse, qui vient d'attaquer... ou une DON!! redressée
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-024', extra: { rested: true } }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    oppLeaderDon(g, 1);
  }, 1);
  s = oppAttacks(s, charUid(s, 0, 'OP14-024'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  const opp = s.players[1].chars[0].uid;
  s = choose(s, `card:${opp}`);
  assert.equal(s.players[1].chars[0].rested, true);
});

test('Tashigi (OP14-029) : épuiser 2 cartes pour +2000 ; au tour adverse, épuiser 1 carte à la place de quitter le terrain', () => {
  const me = list('OP14-020', ['OP14-029'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-029' }]);
    setDon(g, 0, 2);
  });
  const tashigi = charUid(s, 0, 'OP14-029');
  s = choose(s, `act:${tashigi}`);
  while (s.decision?.tag === 'restCost') s = choose(s, 'don');
  assert.equal(power(s, tashigi), 8000);
  assert.ok(!hasOption(s, `act:${tashigi}`));
  coherent(s);
  // Shiliew adverse la renvoie : une DON!! épuisée à la place
  const opp = list('OP14-040', ['OP14-048'], N);
  s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP14-029' }]);
    setDon(g, 0, 2);
    setHand(g, 1, ['OP14-048']);
    setDon(g, 1, 10);
  }, 1);
  s = play(s, 'OP14-048', 1);
  s = choose(s, `card:${charUid(s, 0, 'OP14-029')}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  if (s.decision?.tag === 'restCost') s = choose(s, 'don');
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP14-029'));
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
});

test('Shiliew (OP14-048) : renvoie un Personnage adverse puis défausse toute la main (Kuroobi OP14-045 gagne [Initiative])', () => {
  const me = list('OP14-040', ['OP14-048', 'OP14-045', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-048', 'ST34-003', 'ST34-003']);
    setChars(g, 0, [{ num: 'OP14-045', extra: { playedTurn: 5 } }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    setDon(g, 0, 10);
  });
  const victim = s.players[1].chars[0].uid;
  s = play(s, 'OP14-048');
  s = choose(s, `card:${victim}`);
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.players[0].hand.length, 0);
  assert.ok(s.mods.some((m) => m.uid === charUid(s, 0, 'OP14-045') && m.keyword === 'Rush'));
  coherent(s);
});

test('Fisher Tiger (OP14-054) : pioche 3 avec un Leader {Fish-Man} ; à la fin du tour, défausse jusqu’à 5 cartes', () => {
  const me = list('OP14-040', ['OP14-054', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-054', 'ST34-003', 'ST34-003', 'ST34-003', 'ST34-003']);
    setDon(g, 0, 10);
  });
  s = play(s, 'OP14-054');
  assert.equal(s.players[0].hand.length, 7);
  s = act(s, 'end');
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, 5);
  // Leader sans {Fish-Man} : pas de pioche
  s = scene([list('OP14-020', ['OP14-054'], N), OPP], (g) => {
    setHand(g, 0, ['OP14-054']);
    setDon(g, 0, 10);
  });
  s = play(s, 'OP14-054');
  assert.equal(s.players[0].hand.length, 0);
});

test('Courant marin, Jet d’épaule (OP14-058) : 3 DON!! épuisées pour jouer un {Fish-Man} de coût 3 ou moins, puis renvoyer un 6000 de base ; [Contre] piocher 1 et Leader +3000', () => {
  const me = list('OP14-040', ['OP14-058', 'OP14-042'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-058', 'OP14-042']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: 'ST36-002' }, { num: 'ST36-005' }]);
  });
  const six = charUid(s, 1, 'ST36-002');
  s = play(s, 'OP14-058');
  s = yes(s);
  s = choose(s, (o) => o.num === 'OP14-042');
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-005')}`), 'seulement 6000 de base');
  s = choose(s, `card:${six}`);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP14-042'));
  assert.ok(!s.players[1].chars.some((c) => c.uid === six));
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
  const s0 = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-058']);
    setDon(g, 0, 2);
    oppLeaderDon(g, 2);
  }, 1);
  const hand = s0.players[0].hand.length;
  const { s: s1, gain } = counterGain(s0, 'OP14-058');
  assert.equal(gain, 3000);
  assert.equal(s1.players[0].hand.length, hand);   // la carte jouée, une carte piochée
});

test('Don Quijote Doflamingo (Leader OP14-060) : DON!! −1 pour changer la cible d’une attaque adverse', () => {
  const me = list('OP14-060', ['OP14-063'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-063', extra: { rested: true } }, { num: 'ST34-003' }]);
    setDon(g, 0, 2);
  }, 1);
  const sugar = charUid(s, 0, 'OP14-063');
  s = attack(s, leaderUid(s, 1), sugar);
  s = yes(s);
  assert.equal(s.battle?.target, leaderUid(s, 0));
  assert.equal(s.players[0].donActive + s.players[0].donRested, 1);
  coherent(s);
});

test('Vergo (OP14-061) : renvoie 1 DON!! à la place de la sortie d’un Personnage {Donquixote Pirates} ; [En attaquant] DON!! −1 : −2000', () => {
  const me = list('OP14-060', ['OP14-061', 'OP14-063'], N);
  const opp = list('OP14-040', ['OP14-048'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP14-061' }, { num: 'OP14-063' }]);
    setDon(g, 0, 2);
    setHand(g, 1, ['OP14-048']);
    setDon(g, 1, 10);
  }, 1);
  const sugar = charUid(s, 0, 'OP14-063');
  s = play(s, 'OP14-048', 1);
  s = choose(s, `card:${sugar}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(s.players[0].chars.some((c) => c.uid === sugar));
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-061' }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    setDon(g, 0, 2);
  });
  const target = s.players[1].chars[0].uid;
  s = attack(s, charUid(s, 0, 'OP14-061'), leaderUid(s, 1));
  s = yes(s);
  s = choose(s, `card:${target}`);
  assert.equal(power(s, target), 5000);
  assert.equal(s.players[0].donActive, 1);
});

test('Gladius (OP14-062) : [En cas de KO] DON!! −1 : KO ou épuiser un Personnage adverse de 6000 de base ou moins', () => {
  const me = list('OP14-060', ['OP14-062'], N);
  for (const which of [0, 1]) {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num: 'OP14-062', extra: { rested: true } }]);
      setChars(g, 1, [{ num: 'ST36-002' }, { num: 'ST36-005' }]);
      setDon(g, 0, 1);
      oppLeaderDon(g, 1);
    }, 1);
    const six = charUid(s, 1, 'ST36-002');
    s = oppAttacks(s, charUid(s, 0, 'OP14-062'));
    while (s.decision?.kind === 'counter') s = act(s, 'pass');
    s = yes(s);
    s = choose(s, `choice:${which}`);
    assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-005')}`));
    s = choose(s, `card:${six}`);
    if (which === 0) assert.ok(!s.players[1].chars.some((c) => c.uid === six));
    else assert.equal(s.players[1].chars.find((c) => c.uid === six)?.rested, true);
  }
});

test('Jora (OP14-064) et Dellinger (OP14-067) : [En cas de KO] 1 DON!! épuisée, puis KO d’un 0 de base / une carte {Donquixote Pirates}', () => {
  const me = list('OP14-060', ['OP14-064', 'OP14-067', 'OP14-063'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-064', extra: { rested: true } }]);
    setChars(g, 1, [{ num: 'OP10-103' }, { num: 'ST36-004' }]);
    setDon(g, 0, 1);
    oppLeaderDon(g, 1);
  }, 1);
  const zero = charUid(s, 1, 'OP10-103');
  s = oppAttacks(s, charUid(s, 0, 'OP14-064'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  assert.equal(s.players[0].donRested, 1);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-004')}`));
  s = choose(s, `card:${zero}`);
  assert.ok(!s.players[1].chars.some((c) => c.uid === zero));
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-067', extra: { rested: true } }]);
    setDeckTop(g, 0, ['OP14-063', 'ST34-003']);
    setDon(g, 0, 1);
    oppLeaderDon(g, 1);
  }, 1);
  s = oppAttacks(s, charUid(s, 0, 'OP14-067'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  assert.ok(s.decision!.options.some((o) => o.num === 'OP14-063'));
  assert.ok(!s.decision!.options.some((o) => o.num === 'ST34-003'));
  s = choose(s, (o) => o.num === 'OP14-063');
  if (s.decision?.tag === 'bottomOrder') s = act(s, 'keep');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP14-063'));
  assert.equal(s.players[0].donRested, 1);
});

test('Buffalo (OP14-070) : épuisé par l’effet d’un Personnage adverse, DON!! −1 pour se redresser', () => {
  const me = list('OP14-020', ['OP14-070'], N);
  const opp = list('OP14-020', ['OP14-032'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP14-070' }]);
    setChars(g, 1, [{ num: 'OP14-032' }]);
    setDon(g, 0, 1);
  }, 1);
  const buffalo = charUid(s, 0, 'OP14-070');
  // Mandrill humain (recette : quand il est épuisé à son tour, épuise un Personnage adverse de coût 4 ou moins)
  s = attack(s, charUid(s, 1, 'OP14-032'), leaderUid(s, 0));
  s = choose(s, `card:${buffalo}`);
  s = yes(s);
  assert.equal(s.players[0].chars[0].rested, false);
  assert.equal(s.players[0].donActive + s.players[0].donRested, 0);
  coherent(s);
});

test('Fils balistiques (OP14-078) : [Contre] DON!! −1 : avec un Leader {Donquixote Pirates}, +2000 pour le combat et +2000 pour le tour', () => {
  const me = list('OP14-060', ['OP14-078'], N);
  const s0 = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-078']);
    setDon(g, 0, 3);
    oppLeaderDon(g, 3);
  }, 1);
  const { s, gain } = counterGain(s0, 'OP14-078', yes);
  assert.equal(gain, 2000);
  assert.ok(s.mods.some((m) => m.uid === leaderUid(s, 0) && m.amount === 2000 && (m.until === 'turn' || m.until === s.turn)));
  // Leader sans {Donquixote Pirates} : rien
  const s1 = scene([list('OP14-020', ['OP14-078'], N), OPP], (g) => {
    setHand(g, 0, ['OP14-078']);
    setDon(g, 0, 3);
    oppLeaderDon(g, 3);
  }, 1);
  assert.equal(counterGain(s1, 'OP14-078', (x) => (x.decision?.tag === 'may' ? yes(x) : x)).gain, 0);
});

test('Crocodile (Leader OP14-079) : ses effets ne font pas quitter le terrain aux Personnages adverses ; KO d’un « Baroque Works » pour −10 de coût', () => {
  const me = list('OP14-079', ['OP14-087', 'OP14-048'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-087' }]);
    setChars(g, 1, [{ num: 'ST36-005' }]);
    setDon(g, 0, 1);
  });
  const target = s.players[1].chars[0].uid;
  s = choose(s, `act:${leaderUid(s, 0)}`);
  if (s.decision?.tag === 'trashOwn') s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, `card:${target}`);
  assert.equal(fieldCost(s, target), -4);
  if (s.decision?.tag === 'mayMill') s = choose(s, 'yes');
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
  // Shiliew du joueur de Crocodile ne peut pas renvoyer un Personnage adverse
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-048']);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  s = play(s, 'OP14-048');
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-005')}`));
  assert.equal(s.players[1].chars.length, 1);
});

test('Gecko Moria (Leader OP14-080) : KO d’un {Thriller Bark Pirates} pour +1000 à tout son camp ; [En attaquant] défausser 3 cartes : 1 carte du deck dans la Vie', () => {
  const me = list('OP14-080', ['OP14-081', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-081' }, { num: 'ST34-002' }]));
  const other = charUid(s, 0, 'ST34-002');
  s = choose(s, `act:${leaderUid(s, 0)}`);
  if (s.decision?.tag === 'trashOwn') s = choose(s, (o) => o.num === 'OP14-081' || o.id.startsWith('card:'));
  assert.equal(power(s, leaderUid(s, 0)), 6000);
  assert.equal(power(s, other), 6000);
  assert.ok(!s.players[0].chars.some((c) => c.num === 'OP14-081'));
  coherent(s);
  s = scene([me, OPP], (g) => setHand(g, 0, ['ST34-003', 'ST34-003', 'ST34-003']));
  const life = s.players[0].life.length;
  s = attack(s, leaderUid(s, 0), leaderUid(s, 1));
  s = yes(s);
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].life.length, life + 1);
  assert.equal(s.players[0].hand.length, 0);
});

test('Miss Wednesday (OP14-083) : se défausser pour −3000 à un Personnage adverse de coût 0', () => {
  const me = list('OP14-079', ['OP14-083'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-083' }]);
    zeroCostOpp(g);
    g.players[1].chars.push(takeField(g, 1, 'ST36-004'));
  });
  const zero = s.players[1].chars.find((c) => fieldCost(s, c.uid) === 0)!.uid;
  s = choose(s, `act:${charUid(s, 0, 'OP14-083')}`);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-004')}`));
  s = choose(s, `card:${zero}`);
  assert.ok(s.mods.some((m) => m.uid === zero && m.amount === -3000));
  assert.equal(s.players[0].chars.length, 0);
});

test('Miss Allsunday (OP14-084) : avec un Leader « Baroque Works », joue de sa Défausse un « Baroque Works » de coût 4 ou moins et un de coût 1', () => {
  const me = list('OP14-079', ['OP14-084', 'OP14-091', 'OP14-085'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-084']);
    setDon(g, 0, 10);
    const t1 = g.players[0].deck.findIndex((c) => c.num === 'OP14-091');
    g.players[0].trash.push(...g.players[0].deck.splice(t1, 1));
    const t2 = g.players[0].deck.findIndex((c) => c.num === 'OP14-085');
    g.players[0].trash.push(...g.players[0].deck.splice(t2, 1));
  });
  s = play(s, 'OP14-084');
  s = choose(s, (o) => o.num === 'OP14-091');
  s = choose(s, (o) => o.num === 'OP14-085');
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP14-084', 'OP14-085', 'OP14-091']);
  coherent(s);
  // Leader sans « Baroque Works » : rien
  s = scene([list('OP14-020', ['OP14-084', 'OP14-091'], N), OPP], (g) => {
    setHand(g, 0, ['OP14-084']);
    setDon(g, 0, 10);
    const t1 = g.players[0].deck.findIndex((c) => c.num === 'OP14-091');
    g.players[0].trash.push(...g.players[0].deck.splice(t1, 1));
  });
  s = play(s, 'OP14-084');
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP14-084']);
});

test('Miss Doublefinger (OP14-086) : avec 7 cartes ou plus dans la Défausse, +1000 et +2 de coût aux « Baroque Works »', () => {
  const me = list('OP14-079', ['OP14-086', 'OP14-085'], N);
  const s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-086' }, { num: 'OP14-085' }, { num: 'ST34-002' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 7));
  });
  assert.equal(power(s, charUid(s, 0, 'OP14-086')), 7000);
  assert.equal(fieldCost(s, charUid(s, 0, 'OP14-085')), 3);
  assert.equal(fieldCost(s, charUid(s, 0, 'OP14-086')), 7);
  assert.equal(fieldCost(s, charUid(s, 0, 'ST34-002')), 4);
  const s2 = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-086' }, { num: 'OP14-085' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 6));
  });
  assert.equal(power(s2, charUid(s2, 0, 'OP14-086')), 6000);
  assert.equal(fieldCost(s2, charUid(s2, 0, 'OP14-085')), 1);
});

test('Miss Merrychristmas (OP14-088) : [En cas de KO] avec un Leader « Baroque Works », piocher 1 et KO d’un Lieu adverse de coût 1', () => {
  const me = list('OP14-079', ['OP14-088'], N);
  const opp = list('OP14-020', ['OP14-039'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP14-088', extra: { rested: true } }]);
    const i = g.players[1].deck.findIndex((c) => c.num === 'OP14-039');
    const [st] = g.players[1].deck.splice(i, 1);
    g.players[1].stage = { uid: st.uid, num: st.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    oppLeaderDon(g, 1);
  }, 1);
  const hand = s.players[0].hand.length;
  s = oppAttacks(s, charUid(s, 0, 'OP14-088'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].stage, null);
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.ok(s.players[1].trash.some((c) => c.num === 'OP14-039'));
});

test('Mr 1 (OP14-090) : [Initiative : Personnage] avec un Personnage de coût 0 ou de 8 ou plus ; [Jouée] épuise un Personnage adverse de coût 0', () => {
  const me = list('OP14-079', ['OP14-090'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-090']);
    setDon(g, 0, 10);
    zeroCostOpp(g);
  });
  const zero = s.players[1].chars[0].uid;
  s = play(s, 'OP14-090');
  s = choose(s, `card:${zero}`);
  assert.equal(s.players[1].chars[0].rested, true);
  assert.ok(hasOption(s, `attack:${charUid(s, 0, 'OP14-090')}:${zero}`));
  assert.ok(!hasOption(s, `attack:${charUid(s, 0, 'OP14-090')}:${leaderUid(s, 1)}`));
  // sans Personnage de coût 0 ou de 8 ou plus : pas d'attaque le tour où il est joué
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-090']);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: 'ST36-002', extra: { rested: true } }]);
  });
  s = play(s, 'OP14-090');
  assert.ok(!hasOption(s, `attack:${charUid(s, 0, 'OP14-090')}`));
});

test('Mr 3 (OP14-092) : au tour adverse, une fois par tour, 3 cartes de la Défausse sous le deck à la place d’un KO', () => {
  const me = list('OP14-079', ['OP14-092'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-092', extra: { rested: true } }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 4));
    oppLeaderDon(g, 2);
  }, 1);
  s = oppAttacks(s, charUid(s, 0, 'OP14-092'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  s = yes(s);
  while (s.decision?.tag === 'trashToDeck') s = choose(s, (o) => o.id.startsWith('card:'));
  if (s.decision?.tag === 'bottomOrder') s = act(s, 'keep');
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP14-092'));
  assert.equal(s.players[0].trash.length, 1);
  coherent(s);
  // à son propre tour : pas de remplacement
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-092' }]);
    g.players[0].trash.push(...g.players[0].deck.splice(0, 4));
  });
  assert.equal(koCharacter(s, charUid(s, 0, 'OP14-092'), 'effect', 1), true);
});

test('Mr 5 (OP14-094) et Barchan (OP14-098) : avec un Personnage de coût 0 ou de 8 ou plus, piocher 2 et défausser 1 / +3 de coût aux « Baroque Works »', () => {
  const me = list('OP14-079', ['OP14-094', 'OP14-098', 'OP14-085'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-094']);
    setDon(g, 0, 10);
    zeroCostOpp(g);
  });
  s = play(s, 'OP14-094');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, 1);
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-094']);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: 'ST36-002' }]);
  });
  s = play(s, 'OP14-094');
  assert.equal(s.players[0].hand.length, 0);
  // Barchan : Mr 9 a un coût de 0 ? non : Miss Goldenweek (coût 1) gagne +3, le Personnage adverse de coût 0 aussi rend vrai
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-098']);
    setDon(g, 0, 5);
    setChars(g, 0, [{ num: 'OP14-085' }]);
    zeroCostOpp(g);
  });
  s = play(s, 'OP14-098');
  assert.equal(fieldCost(s, charUid(s, 0, 'OP14-085')), 4);
  const s0 = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-098']);
    setDon(g, 0, 5);
    oppLeaderDon(g, 2);
  }, 1);
  assert.equal(counterGain(s0, 'OP14-098').gain, 3000);
});

test('Gecko Moria (OP14-104) : un {Thriller Bark Pirates} de coût 4 ou moins de la Défausse, joué ou face visible dans la Vie ; [Déclenchement] jouer un coût 4 ou moins', () => {
  const me = list('OP14-080', ['OP14-104', 'OP14-100'], N);
  for (const where of ['play', 'life']) {
    let s = scene([me, OPP], (g) => {
      setHand(g, 0, ['OP14-104']);
      setDon(g, 0, 10);
      const i = g.players[0].deck.findIndex((c) => c.num === 'OP14-100');
      g.players[0].trash.push(...g.players[0].deck.splice(i, 1));
    });
    const life = s.players[0].life.length;
    s = play(s, 'OP14-104');
    s = choose(s, (o) => o.num === 'OP14-100');
    s = choose(s, where);
    if (where === 'play') assert.ok(s.players[0].chars.some((c) => c.num === 'OP14-100'));
    else {
      assert.equal(s.players[0].life.length, life + 1);
      assert.equal(s.players[0].life[0].num, 'OP14-100');
      assert.equal(s.players[0].life[0].faceUp, true);
    }
    coherent(s);
  }
});

test('Sœurs gorgones (OP14-105) : révéler 3 cartes {Amazon Lily} ou {Kuja Pirates} pour 1 DON!! épuisée à chaque carte', () => {
  const me = list('OP14-041', ['OP14-105', 'OP14-113', 'OP14-114'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-105' }, { num: 'ST34-002' }]);
    setHand(g, 0, ['OP14-113', 'OP14-114', 'OP14-113']);
    setDon(g, 0, 0, 5);
  });
  s = choose(s, `act:${charUid(s, 0, 'OP14-105')}`);
  while (s.decision?.tag === 'revealCost') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].leader.don, 1);
  assert.ok(s.players[0].chars.every((c) => c.don === 1));
  assert.equal(s.players[0].donRested, 2);
  coherent(s);
  // seulement 2 cartes du type en main : pas d'activation
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-105' }]);
    setHand(g, 0, ['OP14-113', 'ST34-003', 'OP14-114']);
    setDon(g, 0, 0, 5);
  });
  assert.ok(!hasOption(s, `act:${charUid(s, 0, 'OP14-105')}`));
});

test('Rindo (OP14-115) : [Tour adverse] [En cas de KO] 1 carte du deck dans la Vie, puis 1 dégât', () => {
  const me = list('OP14-041', ['OP14-115'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-115', extra: { rested: true } }]);
    oppLeaderDon(g, 1);
  }, 1);
  const life = s.players[0].life.length;
  const hand = s.players[0].hand.length;
  s = oppAttacks(s, charUid(s, 0, 'OP14-115'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  while (s.decision?.tag === 'trigger') s = act(s, s.decision!.options.find((o) => /no|keep|hand/.test(o.id))?.id ?? s.decision!.options[0].id);
  assert.equal(s.players[0].life.length, life);
  assert.equal(s.players[0].hand.length, hand + 1);
  // à son tour : rien
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP14-115' }]));
  koCharacter(s, charUid(s, 0, 'OP14-115'), 'effect', 1);
  assert.equal(s.pending.filter((p) => p.kind === 'onKO').length, 0);
});

test('Crocodile (OP14-120) : un Personnage adverse ne peut pas attaquer, puis pioche 1 si l’adversaire a un coût 0 ou 8 ou plus ; [En cas de KO] se rejouer', () => {
  const me = list('OP14-079', ['OP14-120', 'ST34-003'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-120']);
    setDon(g, 0, 10);
    zeroCostOpp(g);
  });
  const zero = s.players[1].chars[0].uid;
  s = play(s, 'OP14-120');
  s = choose(s, `card:${zero}`);
  assert.ok(s.mods.some((m) => m.uid === zero && m.stat === 'cantAttack'));
  assert.equal(s.players[0].hand.length, 1);
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP14-120']);
    setDon(g, 0, 10);
    setChars(g, 1, [{ num: 'ST36-002' }]);
  });
  s = play(s, 'OP14-120');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].hand.length, 0);
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP14-120', extra: { rested: true } }]);
    setHand(g, 0, ['ST34-003']);
    oppLeaderDon(g, 6);
  }, 1);
  s = oppAttacks(s, charUid(s, 0, 'OP14-120'));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  s = yes(s);
  if (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP14-120'));
  coherent(s);
});

// ---------- [Contre] des recettes (limite du banc : « pendant ce combat ») ----------

test('Ever White (OP14-076), Fils polychromes (OP14-077), Ground Death (OP14-096), Salamandre de feu (OP14-116), Brick Bat (OP14-117) : [Contre]', () => {
  const at = (leader: string, event: string, extra: (g: GameState) => void = () => {}) => scene([list(leader, [event], N), OPP], (g) => {
    setHand(g, 0, [event]);
    setDon(g, 0, 5);
    oppLeaderDon(g, 3);
    extra(g);
  }, 1);
  assert.equal(counterGain(at('OP14-060', 'OP14-076'), 'OP14-076').gain, 3000);
  // Fils polychromes : +4000, puis 1 DON!! épuisée si l'adversaire a un Personnage de 6000 ou plus
  let r = counterGain(at('OP14-060', 'OP14-077', (g) => setChars(g, 1, [{ num: 'ST36-005' }])), 'OP14-077');
  assert.equal(r.gain, 4000);
  assert.equal(r.s.players[0].donRested, 3);   // 2 pour le coût de l'Événement, 1 ajoutée
  r = counterGain(at('OP14-060', 'OP14-077', (g) => setChars(g, 1, [{ num: 'ST36-004' }])), 'OP14-077');
  assert.equal(r.gain, 4000);
  assert.equal(r.s.players[0].donRested, 2);
  // Ground Death : +4000 avec 10 cartes ou plus dans la Défausse (l'Événement activé y est déjà, comme pour toutes les cartes)
  assert.equal(counterGain(at('OP14-079', 'OP14-096', (g) => g.players[0].trash.push(...g.players[0].deck.splice(0, 10))), 'OP14-096').gain, 4000);
  assert.equal(counterGain(at('OP14-079', 'OP14-096', (g) => g.players[0].trash.push(...g.players[0].deck.splice(0, 8))), 'OP14-096').gain, 0);
  // Salamandre de feu : +2000, puis jouer un {Kuja Pirates} de coût 4 ou moins
  r = counterGain(at('OP14-041', 'OP14-116', (g) => { g.players[0].hand.push(...g.players[0].deck.splice(g.players[0].deck.findIndex((c) => c.num === 'ST34-003'), 1)); }), 'OP14-116');
  assert.equal(r.gain, 2000);
  // Brick Bat : +3000 à un {Thriller Bark Pirates} (le Leader Moria)
  const bb = at('OP14-080', 'OP14-117');
  assert.equal(counterGain(bb, 'OP14-117', (x) => choose(x, `card:${leaderUid(x, 0)}`)).gain, 3000);
  assert.equal(counterGain(at('OP14-079', 'OP14-117'), 'OP14-117').gain, 0);
});

test('Kaku (ST29-003) : +1000 tant que sa Vie n’est pas plus grande que celle de l’adversaire', () => {
  const me = list('ST29-001', ['ST29-003'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'ST29-003' }]);
    setLife(g, 0, g.players[0].life.slice(0, 3).map((c) => c.num));
  });
  assert.equal(power(s, charUid(s, 0, 'ST29-003')), 6000);
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'ST29-003' }]);
    g.players[1].life.splice(0, 2);
  });
  assert.equal(power(s, charUid(s, 0, 'ST29-003')), 5000);
});

// [Déclenchement] de la carte du dessus de la Vie de `me`, révélée par une attaque du Leader adverse
function triggerFromLife(me: DeckList, top: string, extra: (g: GameState) => void): GameState {
  let s = scene([me, OPP], (g) => {
    setLife(g, 0, [top, ...g.players[0].life.slice(1).map((c) => c.num)]);
    oppLeaderDon(g, 3);
    extra(g);
  }, 1);
  s = oppAttacks(s, leaderUid(s, 0));
  while (s.decision?.kind === 'counter') s = act(s, 'pass');
  return s;
}

test('Kaku (ST29-003) et Rob Lucci (ST29-013) : [Déclenchement] KO d’un coût 3 ou moins / d’un coût au plus égal au total des Vies', () => {
  const me = list('ST29-001', ['ST29-003', 'ST29-013'], N);
  let s = triggerFromLife(me, 'ST29-003', (g) => setChars(g, 1, [{ num: 'ST36-004' }, { num: 'ST36-002' }]));
  assert.ok(s.decision!.options.some((o) => o.id === 'yes' || o.id.startsWith('trigger')), s.decision!.prompt);
  s = act(s, s.decision!.options.find((o) => o.id === 'yes' || o.id.startsWith('trigger'))!.id);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-002')}`), 'coût 4 : non');
  s = choose(s, `card:${charUid(s, 1, 'ST36-004')}`);
  assert.ok(!s.players[1].chars.some((c) => c.num === 'ST36-004'));
  // Rob Lucci : 4 Vies (moi, après la carte révélée) + 5 (adverse) = 9 ; un coût 6 est proposé
  s = triggerFromLife(me, 'ST29-013', (g) => {
    g.players[0].life.splice(5);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  const total = s.players[0].life.length + s.players[1].life.length;
  s = act(s, s.decision!.options.find((o) => o.id === 'yes' || o.id.startsWith('trigger'))!.id);
  assert.ok(total >= 6);
  s = choose(s, `card:${charUid(s, 1, 'ST36-005')}`);
  assert.equal(s.players[1].chars.length, 0);
  // 0 Vie (moi, après la carte révélée) + 2 (adverse) = 2 : le coût 6 n'est pas proposé, le coût 1 l'est
  s = triggerFromLife(me, 'ST29-013', (g) => {
    g.players[0].life.splice(1);
    g.players[1].life.splice(2);
    setChars(g, 1, [{ num: 'ST36-005' }, { num: 'ST36-004' }]);
  });
  s = act(s, s.decision!.options.find((o) => o.id === 'yes' || o.id.startsWith('trigger'))!.id);
  assert.ok(!hasOption(s, `card:${charUid(s, 1, 'ST36-005')}`));
  assert.ok(hasOption(s, `card:${charUid(s, 1, 'ST36-004')}`));
});
