// OP13 et PRB02 (tâche S6) : un test par effet des cartes codées à la main (condition vraie et fausse), et les recettes
// que le banc d'essai ne sait pas mesurer ([Contre] « pendant ce combat », coût « épuisez ce Lieu », [En attaquant] ;
// 01-contrats.md § 15.4). Numéros et valeurs seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { act, advance } from '../engine/engine.ts';
import { deckErrors } from '../engine/deckRules.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { basePower, canBeRested, def, hasKeyword, koCharacter, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { counterGain, charUid, leaderTyped, leaderUid, list, oppLeaderDon, scene } from './eb-scene.ts';
import { attack, choose, coherent, hasOption, play, setChars, setDon, setHand, setLife } from './helpers.ts';

const OPP = 'ST-36';
const N = 'ST-34';
const yes = (s: GameState) => choose(s, 'yes');
// Personnage à la main d'un joueur, par numéro
const handUid = (s: GameState, p: 0 | 1, num: string) => s.players[p].hand.find((c) => c.num === num)!.uid;
// KO par un effet adverse (hors d'un effet en cours), puis résolution de ce qui s'est déclenché
function koNow(s: GameState, uid: number): GameState {
  koCharacter(s, uid, 'effect', 1);
  s.decision = null;
  return advance(s);
}
// Passe les questions de [Bloqueur] et de [Contre] du joueur attaqué
function noDefense(s: GameState): GameState {
  while (s.decision && (s.decision.kind === 'blocker' || s.decision.kind === 'counter')) s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  return s;
}

test('OP13 et PRB02 : toutes les cartes jouables ou en doute', () => {
  const nums = Object.keys(CARDS).filter((num) => num.startsWith('OP13-') || num.startsWith('PRB02-'));
  assert.equal(nums.length, 138);
  const left = nums.filter((num) => !['verified', 'coded', 'auto', 'doubt'].includes(confidence(num)));
  assert.deepEqual(left, []);
  assert.deepEqual(nums.filter((num) => confidence(num) === 'doubt').sort(), ['OP13-064', 'OP13-097']);
});

// ---------- Leaders ----------

test('Monkey D. Luffy (Leader OP13-001) : [DON!! x1] [Attaque adverse] épuiser des DON!! pour +2000 chacune pendant le combat', () => {
  const me = list('OP13-001', ['OP13-015'], N);
  let s = scene([me, OPP], (g) => {
    g.players[0].leader.don = 1;
    g.players[0].donDeck -= 1;
    setDon(g, 0, 3);
    oppLeaderDon(g, 3);
  }, 1);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  assert.equal(s.decision?.tag, 'donCount');
  assert.equal(s.decision!.options[0].id, 'n:2', 'd’abord ce qui suffit (8000 contre 5000)');
  s = choose(s, 'n:2');
  assert.equal(power(s, leaderUid(s, 0)), 9000);
  assert.equal(s.players[0].donActive, 1);
  coherent(s);
  // sans DON!! donnée au Leader, ou avec 6 DON!! redressées : rien
  for (const [don, active] of [[0, 3], [1, 6]]) {
    let t = scene([me, OPP], (g) => {
      g.players[0].leader.don = don;
      g.players[0].donDeck -= don;
      setDon(g, 0, active);
      oppLeaderDon(g, 3);
    }, 1);
    t = attack(t, leaderUid(t, 1), leaderUid(t, 0));
    assert.notEqual(t.decision?.tag, 'donCount');
  }
});

test('Portgas D. Ace (Leader OP13-002) : [Attaque adverse] défausser 1 pour −2000 ; [DON!! x1] piocher 1 en subissant des dégâts', () => {
  const me = list('OP13-002', ['OP13-043'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP13-043', 'OP13-043']);
    oppLeaderDon(g, 1);
  }, 1);
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  s = yes(s);
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  if (s.decision?.options.some((o) => o.id === `card:${leaderUid(s, 1)}`)) s = choose(s, `card:${leaderUid(s, 1)}`);
  assert.equal(power(s, leaderUid(s, 1)), 4000);
  assert.equal(s.players[0].hand.length, 1);
  coherent(s);
  // dégâts subis : la carte de Vie en main, plus 1 pioche avec une DON!! donnée ; sans DON!!, seulement la Vie
  for (const don of [1, 0]) {
    let t = scene([me, OPP], (g) => {
      setHand(g, 0, []);
      g.players[0].leader.don = don;
      g.players[0].donDeck -= don;
      oppLeaderDon(g, 1);
    }, 1);
    t = attack(t, leaderUid(t, 1), leaderUid(t, 0));
    if (t.decision?.tag === 'may') t = choose(t, 'no');
    t = noDefense(t);
    while (t.decision?.tag === 'trigger') t = choose(t, 'hand');
    assert.equal(t.players[0].hand.length, 1 + don);
  }
});

test('Portgas D. Ace (Leader OP13-002) : piocher 1 quand un Personnage de 6000 de puissance de base ou plus est mis KO', () => {
  const me = list('OP13-002', ['OP13-054', 'OP13-043'], N);
  for (const [num, drawn] of [['OP13-054', 1], ['OP13-043', 0]] as const) {
    let s = scene([me, OPP], (g) => {
      setChars(g, 0, [{ num }]);
      g.players[0].leader.don = 1;
      g.players[0].donDeck -= 1;
    });
    const hand = s.players[0].hand.length;
    s = koNow(s, charUid(s, 0, num));
    assert.equal(s.players[0].hand.length, hand + drawn, num);
  }
});

test('Gol D. Roger (Leader OP13-003) : 1 DON!! de la phase DON!! va au Leader s’il y a déjà des DON!! ; −2000 avec 9 DON!! ou moins', () => {
  const me = list('OP13-003', ['OP13-065'], N);
  for (const [active, given] of [[3, 1], [0, 0]]) {
    let s = scene([me, OPP], (g) => {
      setDon(g, 0, active);
      g.flow = { stage: 'don' };
    });
    s = advance(s);
    assert.equal(s.players[0].leader.don, given, `${active} DON!! avant la phase`);
    assert.equal(s.players[0].donActive, active + 2 - given);
  }
  let s = scene([me, OPP], (g) => setDon(g, 0, 9));
  assert.equal(power(s, leaderUid(s, 0)), 5000);
  s = scene([me, OPP], (g) => setDon(g, 0, 10));
  assert.equal(power(s, leaderUid(s, 0)), 7000);
});

test('Imu (Leader OP13-079) : pas d’Événement de coût 2 ou plus ; un Lieu {Mary Geoise} au début de la partie ; défausser pour piocher', () => {
  assert.ok(def('OP13-079').rules!.deckRestriction!(def('OP13-097')) === null, 'Événement de coût 1');
  assert.ok(def('OP13-079').rules!.deckRestriction!(def('OP13-020')) !== null, 'Événement de coût 3');
  assert.equal(def('OP13-079').rules!.deckRestriction!(def('OP13-084')), null, 'Personnage');
  assert.ok(deckErrors('OP13-079', { 'OP13-020': 4 }).some((e) => e.includes('Imu')), 'refusé à la construction du deck');
  // [Activation : Principale] : 1 carte de la main ou 1 Personnage {Celestial Dragons} dans la Défausse, piocher 1
  const me = list('OP13-079', ['OP13-087', 'OP13-093'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP13-087' }]);
    setHand(g, 0, ['OP13-093']);
  });
  s = choose(s, `act:${leaderUid(s, 0)}`);
  s = choose(s, 'a');
  if (s.decision?.tag === 'trashOwn') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].chars.length, 0);
  assert.equal(s.players[0].hand.length, 2);
  assert.ok(!hasOption(s, `act:${leaderUid(s, 0)}`), 'une fois par tour');
  coherent(s);
});

test('Imu (Leader OP13-079) : au début de la partie, jouer un Lieu {Mary Geoise} de son deck', async () => {
  const { newGame } = await import('../engine/engine.ts');
  const me = list('OP13-079', ['OP05-097', 'OP13-087'], N);
  const deck = { ...me, cards: Object.fromEntries(Object.entries(me.cards).filter(([n]) => !(CARDS[n].category === 'EVENT' && (CARDS[n].cost ?? 0) >= 2))) };
  let total = Object.values(deck.cards).reduce((a, b) => a + b, 0);
  for (const n of ['OP13-093', 'OP13-094', 'OP13-086']) if (total < 50) { deck.cards[n] = Math.min(4, 50 - total); total += deck.cards[n]; }
  let s = newGame({ decks: [deck, OPP], names: ['Moi', 'IA'], seed: 5, first: 0 });
  assert.equal(s.decision?.tag, 'playFree');
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].stage?.num, 'OP05-097');
  assert.equal(s.players[0].deck.length + s.players[0].hand.length + s.players[0].life.length, 49);
});

test('Jewelry Bonney (Leader OP13-100) : [Votre tour] [Une fois par tour] jouer un Personnage ayant [Déclenchement] : 2 DON!! épuisées', () => {
  const me = list('OP13-100', ['OP13-102', 'OP13-112', 'OP13-093'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP13-102', 'OP13-102', 'OP13-093']);
    setDon(g, 0, 6, 3);
  });
  s = play(s, 'OP13-102');
  while (s.decision && s.decision.tag !== 'donTarget' && s.decision.kind !== 'main') s = choose(s, (o) => o.id === 'none' || o.id === 'keep' || o.id === 'no' || o.id.startsWith('card:'));
  if (s.decision?.tag === 'donTarget') s = choose(s, `card:${leaderUid(s, 0)}`);
  assert.equal(s.players[0].leader.don, 2);
  // une seule fois par tour
  s = play(s, 'OP13-102');
  while (s.decision && s.decision.kind !== 'main') s = choose(s, (o) => o.id === 'none' || o.id === 'keep' || o.id === 'no' || o.id.startsWith('card:'));
  assert.equal(s.players[0].leader.don + s.players[0].chars.reduce((a, c) => a + c.don, 0), 2);
  coherent(s);
  // un Personnage sans [Déclenchement] : rien
  let t = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-093']); setDon(g, 0, 4, 3); });
  t = play(t, 'OP13-093');
  assert.notEqual(t.decision?.tag, 'donTarget');
});

// ---------- Personnages ----------

test('Curly Dadan (OP13-009) : [Double attaque] avec un autre Personnage {Mountain Bandits}', () => {
  const me = list('OP13-001', ['OP13-009', 'OP13-013'], N);
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP13-009' }, { num: 'OP13-013' }]));
  assert.ok(hasKeyword(s, 0, s.players[0].chars[0], 'Double Attack'));
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP13-009' }]));
  assert.ok(!hasKeyword(s, 0, s.players[0].chars[0], 'Double Attack'));
});

test('Uta (OP13-023) : redresse 2 DON!!, puis plus de Personnage de coût de base 5 ou plus ; [En cas de KO] un Personnage épuisé', () => {
  const me = list('OP13-001', ['OP13-023', 'OP13-025', 'OP13-024'], N);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-023', 'OP13-025', 'OP13-024']); setDon(g, 0, 4, 2); });
  s = play(s, 'OP13-023');
  assert.equal(s.players[0].donActive, 2);
  assert.ok(!hasOption(s, `play:${handUid(s, 0, 'OP13-025')}`), 'coût de base 5');
  assert.ok(hasOption(s, `play:${handUid(s, 0, 'OP13-024')}`), 'coût de base 1');
  coherent(s);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP13-023' }]); setHand(g, 0, ['OP13-025']); });
  s = koNow(s, charUid(s, 0, 'OP13-023'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].chars[0].num, 'OP13-025');
  assert.equal(s.players[0].chars[0].rested, true);
});

test('Gordon (OP13-024) : révéler une carte {FILM} pour redresser 2 DON!! à la fin du tour', () => {
  const me = list('OP13-001', ['OP13-024', 'OP13-023', 'OP13-043'], N);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-024', 'OP13-023']); setDon(g, 0, 1, 3); });
  s = play(s, 'OP13-024');
  s = yes(s);
  if (s.decision?.tag !== 'main' && s.decision?.kind !== 'main') s = choose(s, (o) => o.id.startsWith('card:'));
  assert.ok(s.delayed.some((d) => d.action === 'untapDon' && d.amount === 2));
  coherent(s);
  // sans carte {Music} ni {FILM} : rien à révéler
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-024', 'OP13-043']); setDon(g, 0, 1, 3); });
  s = play(s, 'OP13-024');
  assert.equal(s.delayed.length, 0);
});

test('Shanks (OP13-028) : redresse toutes ses DON!!, puis plus aucune carte jouée de sa main', () => {
  const me = list('OP13-001', ['OP13-028', 'OP13-024', 'OP13-020'], N);
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-028', 'OP13-024', 'OP13-020']); setDon(g, 0, 10); });
  s = play(s, 'OP13-028');
  assert.equal(s.players[0].donActive, 10);
  assert.ok(!s.decision!.options.some((o) => o.id.startsWith('play:') || o.id.startsWith('event:')));
  coherent(s);
});

test('Bepo (OP13-035) : [Fin de votre tour] redresser ce Personnage ou 1 DON!!', () => {
  const me = list('OP13-001', ['OP13-035'], N);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP13-035', extra: { rested: true } }]); setDon(g, 0, 0, 2); });
  s = act(s, 'end');
  assert.equal(s.decision?.tag, 'chooseOne');
  s = choose(s, 'choice:0');
  assert.equal(s.players[0].chars[0].rested, false);
});

test('Kobby (OP13-025) : [Jouée] avec un Leader {FILM} ou <Strike>, redresse 1 DON!!', () => {
  const film = leaderTyped('FILM');
  for (const [leader, ready] of [[film, 1], ['OP13-079', 0]] as const) {
    const me = list(leader, ['OP13-025'], N);
    let s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-025']); setDon(g, 0, 5, 2); });
    s = play(s, 'OP13-025');
    assert.equal(s.players[0].donActive, ready, leader);
  }
});

test('Boa Hancock (OP13-051) : [En cas de KO] avec le Leader [Boa Hancock] ou un Leader multicolore, piocher 2', () => {
  for (const [leader, drawn] of [['OP14-041', 2], ['EB03-001', 2], ['OP13-079', 0]] as const) {
    const me = list(leader, ['OP13-051'], N);
    let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP13-051' }]));
    const hand = s.players[0].hand.length;
    s = koNow(s, charUid(s, 0, 'OP13-051'));
    assert.equal(s.players[0].hand.length, hand + drawn, leader);
  }
});

// L'adversaire (joueur 1) joue Chavipère (OP13-071, 10 DON!!) et vise `victim` : KO par un effet adverse
function oppKoes(s: GameState, victim: number): GameState {
  s = play(s, 'OP13-071', 1);
  return choose(s, `card:${victim}`);
}

test('Toki (OP13-060) : à la place du KO d’un Personnage « Roger Pirates » par un effet adverse, elle va dans la Défausse', () => {
  const me = list('OP13-003', ['OP13-060', 'OP13-072'], N);
  const opp = list('OP13-003', ['OP13-071'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP13-060' }, { num: 'OP13-072' }]);
    setHand(g, 1, ['OP13-071']);
    setDon(g, 1, 10);
  }, 1);
  const baggy = charUid(s, 0, 'OP13-072');
  s = oppKoes(s, baggy);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.deepEqual(s.players[0].chars.map((c) => c.num), ['OP13-072']);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP13-060'));
  coherent(s);
  // un Personnage sans « Roger Pirates » : pas de remplacement
  s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP13-060' }, { num: 'ST34-002' }]);
    setHand(g, 1, ['OP13-071']);
    setDon(g, 1, 10);
  }, 1);
  const other = s.players[0].chars[1];
  if (basePower(s, other.uid) <= 3000) {
    s = oppKoes(s, other.uid);
    assert.ok(!s.decision?.options.some((o) => o.id.startsWith('replace:')));
  }
});

test('Oro Jackson (OP13-078) : [Une fois par tour] un Personnage « Roger Pirates » sort par un effet adverse : 1 DON!! épuisée', () => {
  const me = list('OP13-003', ['OP13-078', 'OP13-072'], N);
  const opp = list('OP13-003', ['OP13-071'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'OP13-072' }]);
    const P = g.players[0];
    const i = P.deck.findIndex((c) => c.num === 'OP13-078');
    const [st] = P.deck.splice(i, 1);
    P.stage = { uid: st.uid, num: st.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setDon(g, 0, 2);
    setHand(g, 1, ['OP13-071']);
    setDon(g, 1, 10);
  }, 1);
  s = oppKoes(s, charUid(s, 0, 'OP13-072'));
  assert.equal(s.players[0].donRested, 1);
  assert.equal(s.players[0].chars.length, 0);
  coherent(s);
});

test('Silvers Rayleigh (OP13-066) : avec des DON!! données, épuise un Personnage adverse ; 1 DON!! redressée à la fin du tour', () => {
  const me = list('OP13-003', ['OP13-066'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP13-066']);
    setDon(g, 0, 8);
    g.players[0].leader.don = 1;
    g.players[0].donDeck -= 1;
    setChars(g, 1, [{ num: 'ST36-004' }]);
  });
  s = play(s, 'OP13-066');
  s = choose(s, `card:${s.players[1].chars[0].uid}`);
  assert.equal(s.players[1].chars[0].rested, true);
  const deck = s.players[0].donDeck;
  s = act(s, 'end');
  while (s.active === 0 && s.decision) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].donDeck, deck - 1);
  // sans DON!! donnée : pas d'épuisement, mais la DON!! de la fin du tour
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-066']); setDon(g, 0, 8); setChars(g, 1, [{ num: 'ST36-004' }]); });
  s = play(s, 'OP13-066');
  assert.equal(s.players[1].chars[0].rested, false);
  assert.ok(s.delayed.some((d) => d.action === 'addDonActive'));
});

test('Cinq Doyens (OP13-082) : avec le Leader [Imu], tous ses Personnages dans la Défausse, puis jusqu’à 5 {Five Elders} de 5000', () => {
  const me = list('OP13-079', ['OP13-082', 'OP13-080', 'OP13-083', 'OP13-089', 'OP13-087', 'OP13-093'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP13-082' }, { num: 'OP13-087' }]);
    const P = g.players[0];
    for (const num of ['OP13-080', 'OP13-083', 'OP13-089', 'OP13-083']) P.trash.push(P.deck.splice(P.deck.findIndex((c) => c.num === num), 1)[0]);
    setHand(g, 0, ['OP13-093']);
    setDon(g, 0, 2);
  });
  s = choose(s, `act:${charUid(s, 0, 'OP13-082')}`);
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  for (let i = 0; i < 3; i++) s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.decision?.tag === 'playFree', false, 'plus de nom différent');
  assert.deepEqual(s.players[0].chars.map((c) => c.num).sort(), ['OP13-080', 'OP13-083', 'OP13-089']);
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP13-082'));
  coherent(s);
  // autre Leader : pas activable
  s = scene([list('OP13-001', ['OP13-082'], N), OPP], (g) => { setChars(g, 0, [{ num: 'OP13-082' }]); setHand(g, 0, ['ST34-002']); setDon(g, 0, 2); });
  assert.ok(!hasOption(s, `act:${charUid(s, 0, 'OP13-082')}`));
});

test('Saint Ju Peter (OP13-084) : ne quitte pas le terrain avec 7 cartes en Défausse ; [Votre tour] 10 cartes : {Five Elders} à 7000 de base', () => {
  const me = list('OP13-079', ['OP13-084', 'OP13-083', 'OP13-087'], N);
  const withTrash = (k: number) => (g: GameState) => {
    setChars(g, 0, [{ num: 'OP13-084' }, { num: 'OP13-083' }, { num: 'OP13-087' }]);
    const P = g.players[0];
    P.trash.push(...P.deck.splice(0, k));
  };
  let s = scene([me, OPP], withTrash(10));
  assert.equal(basePower(s, charUid(s, 0, 'OP13-083')), 7000);
  assert.equal(power(s, charUid(s, 0, 'OP13-084')), 7000);
  assert.equal(basePower(s, charUid(s, 0, 'OP13-087')), 0, 'pas {Five Elders}');
  assert.equal(def('OP13-084').cantLeave!(s, 0, s.players[0].chars[0]), true);
  s = scene([me, OPP], withTrash(10), 1);
  assert.equal(basePower(s, charUid(s, 0, 'OP13-083')), 5000, 'tour adverse');
  s = scene([me, OPP], withTrash(6));
  assert.equal(basePower(s, charUid(s, 0, 'OP13-083')), 5000);
  assert.equal(def('OP13-084').cantLeave!(s, 0, s.players[0].chars[0]), false);
});

test('Saint Myosgard (OP13-092) : avec 3 Vies ou moins, joue un Lieu {Mary Geoise} de coût 1 de sa Défausse', () => {
  const me = list('OP13-001', ['OP13-092', 'OP05-097'], N);
  for (const [life, played] of [[3, true], [4, false]] as const) {
    let s = scene([me, OPP], (g) => {
      setHand(g, 0, ['OP13-092']);
      setDon(g, 0, 2);
      const P = g.players[0];
      P.trash.push(P.deck.splice(P.deck.findIndex((c) => c.num === 'OP05-097'), 1)[0]);
      P.deck.push(...P.life.splice(life));
    });
    s = play(s, 'OP13-092');
    if (s.decision?.tag === 'playFree') s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(s.players[0].stage?.num === 'OP05-097', played, `${life} Vies`);
  }
});

test('Aucun pays de ce nom... (OP13-098) : avec [Imu], KO d’un Lieu adverse de coût 7 ; [Contre] +4000', () => {
  const me = list('OP13-079', ['OP13-098'], N);
  const opp = list('OP13-001', ['OP13-099'], N);
  let s = scene([me, opp], (g) => {
    setHand(g, 0, ['OP13-098']);
    setDon(g, 0, 3);
    const P = g.players[1];
    const [st] = P.deck.splice(P.deck.findIndex((c) => c.num === 'OP13-099'), 1);
    P.stage = { uid: st.uid, num: st.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
  });
  s = play(s, 'OP13-098');
  s = yes(s);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].stage, null);
  coherent(s);
  const c = scene([me, OPP], (g) => { setHand(g, 0, ['OP13-098']); setDon(g, 0, 2); oppLeaderDon(g, 1); }, 1);
  assert.equal(counterGain(c, 'OP13-098').gain, 4000);
  const d = scene([list('OP13-001', ['OP13-098'], N), OPP], (g) => { setHand(g, 0, ['OP13-098']); setDon(g, 0, 2); oppLeaderDon(g, 1); }, 1);
  assert.equal(def('OP13-098').counterPower!(d, 0, leaderUid(d, 0)), 0, 'autre Leader');
});

test('Le trône vide (OP13-099) : [Votre tour] Leader +1000 avec 19 cartes en Défausse ; épuiser le Lieu et 3 DON!! pour jouer un {Five Elders} noir', () => {
  const me = list('OP13-001', ['OP13-099', 'OP13-084'], N);
  const setup = (k: number) => (g: GameState) => {
    const P = g.players[0];
    const [st] = P.deck.splice(P.deck.findIndex((c) => c.num === 'OP13-099'), 1);
    P.stage = { uid: st.uid, num: st.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setHand(g, 0, ['OP13-084']);
    P.trash.push(...P.deck.splice(0, k));
    setDon(g, 0, 7);
  };
  let s = scene([me, OPP], setup(19));
  assert.equal(power(s, leaderUid(s, 0)), 6000);
  s = choose(s, `act:${s.players[0].stage!.uid}`);
  s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[0].chars[0]?.num, 'OP13-084', 'coût 7, 7 DON!! sur le terrain');
  assert.equal(s.players[0].stage!.rested, true);
  assert.equal(s.players[0].donActive, 4);
  coherent(s);
  s = scene([me, OPP], setup(18));
  assert.equal(power(s, leaderUid(s, 0)), 5000);
});

test('Conney (OP13-106) : [Tour adverse] un [Déclenchement] est activé : [Bloqueur] pour le tour', () => {
  const me = list('OP13-100', ['OP13-106', 'OP13-102'], N);
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP13-106' }]);
    setLife(g, 0, ['OP13-102', 'OP13-102']);
    oppLeaderDon(g, 1);
  }, 1);
  const conney = s.players[0].chars[0];
  assert.ok(!hasKeyword(s, 0, conney, 'Blocker'));
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  s = noDefense(s);
  assert.equal(s.decision?.tag, 'trigger');
  s = choose(s, 'trigger');
  while (s.decision && s.active === 1 && s.decision.player === 0) s = choose(s, (o) => o.id === 'none' || o.id.startsWith('card:') || o.id === 'yes');
  assert.ok(hasKeyword(s, 0, s.players[0].chars.find((c) => c.uid === conney.uid)!, 'Blocker'));
});

// ---------- PRB02 ----------

test('Trafalgar Law (PRB02-002) : [Une fois par tour] −2000 pour le tour à la place de quitter le terrain ; [En attaquant] −2000', () => {
  const me = list('OP14-001', ['PRB02-002'], N);
  const opp = list('OP14-040', ['OP14-048'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'PRB02-002' }]);
    setHand(g, 1, ['OP14-048']);
    setDon(g, 1, 10);
  }, 1);
  const law = charUid(s, 0, 'PRB02-002');
  s = play(s, 'OP14-048', 1);
  s = choose(s, `card:${law}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(s.players[0].chars.some((c) => c.uid === law));
  assert.equal(power(s, law), 5000);
  coherent(s);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'PRB02-002' }]); setChars(g, 1, [{ num: 'ST36-005' }]); });
  s = attack(s, charUid(s, 0, 'PRB02-002'), leaderUid(s, 1));
  s = choose(s, `card:${s.players[1].chars[0].uid}`);
  assert.equal(power(s, s.players[1].chars[0].uid), 5000);
});

test('Mr 3 (PRB02-009) : épuisé par un effet adverse, il peut aller dans la Défausse pour piocher 2', () => {
  const me = list('OP14-040', ['PRB02-009'], N);
  const opp = list('OP13-100', ['OP13-102'], N);
  let s = scene([me, opp], (g) => {
    setChars(g, 0, [{ num: 'PRB02-009' }]);
    setChars(g, 1, [{ num: 'OP13-102' }]);
  }, 1);
  const hand = s.players[0].hand.length;
  s = choose(s, `act:${charUid(s, 1, 'OP13-102')}`);
  while (s.decision?.player === 1 && s.decision.tag !== 'oppRest') s = choose(s, (o) => o.id === 'yes' || o.id.startsWith('card:'));
  s = choose(s, (o) => o.id.startsWith('card:'));
  s = yes(s);
  assert.equal(s.players[0].chars.length, 0);
  assert.equal(s.players[0].hand.length, hand + 2);
  coherent(s);
  assert.ok(canBeRested(s, leaderUid(s, 0)));
});

test('Boa Hancock (PRB02-017) : défausser une carte ayant [Déclenchement] : 1 Personnage adverse autre que [Luffy] ne peut pas attaquer', () => {
  const me = list('OP13-001', ['PRB02-017', 'OP13-113'], N);
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['PRB02-017', 'OP13-113']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST36-004' }]);
  });
  const target = s.players[1].chars[0].uid;
  s = play(s, 'PRB02-017');
  s = yes(s);
  while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
  s = choose(s, `card:${target}`);
  assert.ok(s.mods.some((m) => m.uid === target && m.stat === 'cantAttack'));
  assert.ok(!s.decision!.options.some((o) => o.id === `card:${leaderUid(s, 1)}`), 'Leader adverse redressé : pas visé');
  coherent(s);
  // sans carte ayant [Déclenchement] en main : rien
  s = scene([me, OPP], (g) => { setHand(g, 0, ['PRB02-017', 'ST34-002']); setDon(g, 0, 5); setChars(g, 1, [{ num: 'ST36-004' }]); });
  s = play(s, 'PRB02-017');
  assert.ok(!s.mods.some((m) => m.stat === 'cantAttack'));
});

test('Portgas D. Ace (PRB02-018) : avec une Vie face visible, joue un [Sabo], [Ace] ou [Luffy] de coût 2 de sa main ou de sa Défausse', () => {
  const me = list('OP13-001', ['PRB02-018', 'ST13-007'], N);
  for (const [faceUp, played] of [[true, true], [false, false]] as const) {
    let s = scene([me, OPP], (g) => {
      setHand(g, 0, ['PRB02-018', 'ST13-007']);
      setDon(g, 0, 5);
      g.players[0].life[0].faceUp = faceUp;
    });
    s = play(s, 'PRB02-018');
    if (s.decision?.tag === 'playFree') s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(s.players[0].chars.some((c) => c.num === 'ST13-007'), played);
  }
});

// ---------- Recettes que le banc ne sait pas mesurer ----------

test('Village de Fuchsia (OP13-022, recette) : épuiser ce Lieu : +1000 à un Personnage de 2000 de puissance de base ou moins', () => {
  const me = list('OP13-001', ['OP13-022', 'OP13-015'], N);
  let s = scene([me, OPP], (g) => {
    const P = g.players[0];
    const [st] = P.deck.splice(P.deck.findIndex((c) => c.num === 'OP13-022'), 1);
    P.stage = { uid: st.uid, num: st.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setChars(g, 0, [{ num: 'OP13-015' }, { num: 'ST34-002' }]);
  });
  const makino = charUid(s, 0, 'OP13-015');
  s = choose(s, `act:${s.players[0].stage!.uid}`);
  if (s.decision?.tag === 'may') s = yes(s);
  assert.ok(!s.decision!.options.some((o) => o.uid === s.players[0].chars[1].uid && o.id.startsWith('card:')), '5000 de base : pas visé');
  s = choose(s, `card:${makino}`);
  assert.equal(power(s, makino), 1000);
  assert.equal(s.players[0].stage!.rested, true);
  coherent(s);
});

test('Crocus (OP13-062, recette) : [En attaquant] renvoie en main un Personnage adverse de 3000 de puissance de base ou moins', () => {
  const me = list('OP13-003', ['OP13-062'], N);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP13-062' }]); setChars(g, 1, [{ num: 'ST36-004' }, { num: 'ST36-005' }]); });
  const [small, big] = s.players[1].chars.map((c) => c.uid);
  s = attack(s, charUid(s, 0, 'OP13-062'), leaderUid(s, 1));
  assert.ok(!hasOption(s, `card:${big}`));
  s = choose(s, `card:${small}`);
  assert.ok(s.players[1].hand.some((c) => c.uid === small));
});

test('[Contre] des recettes : Leader +3000 (OP13-075, OP13-077), +3000 puis +1000 sous condition de Vie adverse (OP13-115)', () => {
  for (const ev of ['OP13-075', 'OP13-077']) {
    const me = list('OP13-003', [ev], N);
    const s = scene([me, OPP], (g) => { setHand(g, 0, [ev]); setDon(g, 0, 2); oppLeaderDon(g, 1); }, 1);
    assert.equal(counterGain(s, ev).gain, 3000, ev);
  }
  const me = list('OP13-100', ['OP13-115'], N);
  for (const [life, extra] of [[2, 1000], [3, 0]] as const) {
    const s0 = scene([me, OPP], (g) => {
      setHand(g, 0, ['OP13-115']);
      setDon(g, 0, 2);
      oppLeaderDon(g, 1);
      g.players[1].deck.push(...g.players[1].life.splice(life));
    }, 1);
    const { s, gain } = counterGain(s0, 'OP13-115', (t) => {
      let u = t;
      while (u.decision?.player === 0 && u.decision.kind !== 'counter') u = choose(u, (o) => o.id === `card:${leaderUid(u, 0)}` || o.id.startsWith('card:'));
      return u;
    });
    assert.equal(gain, 3000);
    const turn = s.mods.filter((m) => m.stat === 'power' && m.until !== 'battle' && m.amount === 1000).length;
    assert.equal(turn * 1000, extra, `${life} Vies adverses`);
  }
});

test('Hiyori (OP13-104) et Doflamingo (PRB02-011), recettes : « Leader multicolore »', () => {
  for (const [leader, added] of [['EB03-001', 1], ['OP13-079', 0]] as const) {
    const me = list(leader, ['PRB02-011'], N);
    let s = scene([me, OPP], (g) => { setHand(g, 0, ['PRB02-011']); setDon(g, 0, 5); });
    const deck = s.players[0].donDeck;
    s = play(s, 'PRB02-011');
    assert.equal(deck - s.players[0].donDeck, added, leader);
  }
});

test('Effets permanents « si ..., A et B » (OP13-080, PRB02-015, recettes) : les deux effets sous la même condition', () => {
  const me = list('OP13-079', ['OP13-080'], N);
  let s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP13-080', extra: { playedTurn: 5 } }]); g.players[0].trash.push(...g.players[0].deck.splice(0, 7)); });
  const nus = s.players[0].chars[0];
  assert.ok(hasKeyword(s, 0, nus, 'Rush'));
  assert.equal(def('OP13-080').cantLeave!(s, 0, nus), true);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'OP13-080' }]); g.players[0].trash.push(...g.players[0].deck.splice(0, 6)); });
  assert.ok(!hasKeyword(s, 0, s.players[0].chars[0], 'Rush'));
  for (const [leader, cost] of [['OP16-080', 8], ['OP13-079', 4]] as const) {
    const t = scene([list(leader, ['PRB02-015'], N), OPP], (g) => setChars(g, 0, [{ num: 'PRB02-015' }]));
    const shiliew = t.players[0].chars[0];
    assert.equal(hasKeyword(t, 0, shiliew, 'Blocker'), cost === 8, leader);
    assert.equal(def('PRB02-015').selfCost?.(t, 0, shiliew) ?? 0, cost - 4, leader);
  }
});

