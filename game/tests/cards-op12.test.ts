// OP12 et ST23 à ST28 (tâche S7) : un test par effet des cartes codées à la main (condition vraie et fausse), et les
// recettes que le banc d'essai ne sait pas mesurer ([Contre] « pendant ce combat », Lieu, choix entre deux effets).
// Numéros et valeurs seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { deckErrors } from '../engine/deckRules.ts';
import { act } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { canBeRested, fieldCost, handCost, hasKeyword, power, removeByEffect } from '../engine/rules.ts';
import type { EffectCtx, GameState, PlayerId } from '../engine/types.ts';
import { charUid, counterGain, leaderUid, list, oppLeaderDon, scene } from './eb-scene.ts';
import { attack, choose, coherent, hasOption, play, setChars, setDeckTop, setDon, setHand, setLife } from './helpers.ts';

const OPP = 'ST-36';
const yes = (s: GameState) => choose(s, 'yes');
const no = (s: GameState) => choose(s, 'no');

// Contexte d'un effet du joueur `me` (retraits par un effet adverse : removeByEffect)
const ctxOf = (s: GameState, me: PlayerId, num: string): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: -1, num,
  pending: { kind: 'onPlay', source: -1, num, controller: me, answers: [] },
  ask: (d: Parameters<EffectCtx['ask']>[0]) => {
    // les questions du test : on accepte le remplacement proposé
    const o = d.options.find((x: { id: string }) => x.id.startsWith('replace:') || x.id === 'yes') ?? d.options[0];
    return o.id;
  },
} as unknown as EffectCtx);

test('OP12, ST22 à ST28 : toutes les cartes jouables ou en doute, sauf Calgara (OP12-099, attend le moteur)', () => {
  const nums = Object.keys(CARDS).filter((num) => /^(OP12|ST2[2-8])-/.test(num));
  assert.equal(nums.length, 166);
  const left = nums.filter((num) => !['verified', 'coded', 'auto', 'doubt'].includes(confidence(num)));
  assert.deepEqual(left, ['OP12-099']);
});

test('Silvers Rayleigh (Leader OP12-001) : pas de carte de coût 5 ou plus ; révéler 2 Événements pour +2000 à un Personnage de 4000 de base ou moins', () => {
  assert.ok(deckErrors('OP12-001', { 'OP16-005': 4 }).some((e) => e.includes('interdit par le Leader')));
  assert.ok(!deckErrors('OP12-001', { 'OP12-006': 4 }).some((e) => e.includes('interdit par le Leader')));
  const me = list('OP12-001', ['OP12-006', 'OP12-016', 'OP12-018'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP12-006' }]);
    setHand(g, 0, ['OP12-016', 'OP12-018']);
  });
  s = choose(s, `act:${leaderUid(s, 0)}`);
  while (s.decision?.tag === 'revealCost') s = choose(s, (o) => o.id.startsWith('card:'));
  if (s.decision?.tag === 'ownPower') s = choose(s, `card:${charUid(s, 0, 'OP12-006')}`);
  assert.equal(power(s, charUid(s, 0, 'OP12-006')), 4000);
  assert.ok(!hasOption(s, `act:${leaderUid(s, 0)}`), 'une fois par tour');
  coherent(s);
  // un seul Événement en main : rien à activer
  s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'OP12-006' }]);
    setHand(g, 0, ['OP12-016']);
  });
  assert.ok(!hasOption(s, `act:${leaderUid(s, 0)}`));
});

test('Une détermination sans faille (OP12-016) : 2 DON!! données à Rayleigh, imblocable ce tour-ci ; [Contre] +2000', () => {
  const me = list('OP12-001', ['OP12-016'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP12-016']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'ST36-005' }]);
  });
  s = play(s, 'OP12-016');
  s = yes(s);
  const L = leaderUid(s, 0);
  assert.equal(s.players[0].leader.don, 2);
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Unblockable'));
  coherent(s);
  // sans assez de DON!! redressées : pas de question, rien
  s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP12-016']);
    setDon(g, 0, 1);
  });
  s = play(s, 'OP12-016');
  assert.equal(s.players[0].leader.don, 0);
  assert.ok(!hasKeyword(s, 0, s.players[0].leader, 'Unblockable'));
  // [Contre] : le Leader Rayleigh attaqué gagne +2000
  const at = (event: string) => scene([list('OP12-001', [event], 'ST-01'), OPP], (g) => {
    setHand(g, 0, [event]);
    setDon(g, 0, 5);
    oppLeaderDon(g, 3);
  }, 1);
  assert.equal(counterGain(at('OP12-016'), 'OP12-016', (x) => (x.decision?.tag === 'ownPower' ? choose(x, `card:${leaderUid(x, 0)}`) : x)).gain, 2000);
  assert.ok(L > 0);
});

test('Fluide royal (OP12-018) : [Contre] +2000, puis épuiser 1 DON!! pour −1000 au Leader et aux Personnages adverses', () => {
  const at = () => scene([list('OP12-001', ['OP12-018'], 'ST-01'), OPP], (g) => {
    setHand(g, 0, ['OP12-018']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'ST36-005', extra: { rested: true } }]);
    oppLeaderDon(g, 3);
  }, 1);
  const pickLeader = (x: GameState) => (x.decision?.tag === 'ownPower' ? choose(x, `card:${leaderUid(x, 0)}`) : x);
  let r = counterGain(at(), 'OP12-018', (x) => yes(pickLeader(x)));
  assert.equal(r.gain, 2000);
  const ch = r.s.players[1].chars[0].uid;
  assert.equal(power(r.s, ch), 6000);
  // refusé : la puissance adverse ne change pas
  r = counterGain(at(), 'OP12-018', (x) => no(pickLeader(x)));
  assert.equal(r.gain, 2000);
  assert.equal(power(r.s, r.s.players[1].chars[0].uid), 7000);
});

test('Fluide offensif (OP12-019), Concassé (OP12-059), Je t’aime fort ! (OP12-115) : [Contre] des recettes', () => {
  const at = (leader: string, event: string, extra: (g: GameState) => void = () => {}) => scene([list(leader, [event, 'ST10-010'], 'ST-01'), OPP], (g) => {
    setHand(g, 0, [event]);
    setDon(g, 0, 5);
    oppLeaderDon(g, 3);
    extra(g);
  }, 1);
  const pickLeader = (x: GameState) => (x.decision?.tag === 'ownPower' ? choose(x, `card:${leaderUid(x, 0)}`) : x);
  assert.equal(counterGain(at('OP12-001', 'OP12-019'), 'OP12-019', pickLeader).gain, 2000);
  // Concassé : +4000 au Leader avec 4 Événements ou plus dans la Défausse (lui compris), rien sinon
  let r = counterGain(at('OP12-041', 'OP12-059', (g) => {
    const ev = g.players[0].deck.filter((c) => CARDS[c.num].category === 'EVENT').slice(0, 3);
    g.players[0].deck = g.players[0].deck.filter((c) => !ev.includes(c));
    g.players[0].trash.push(...ev);
  }), 'OP12-059', pickLeader);
  assert.equal(r.gain, 4000);
  r = counterGain(at('OP12-041', 'OP12-059'), 'OP12-059', pickLeader);
  assert.equal(r.gain, 0);
  // Je t'aime fort ! : +2000, puis avec 2 Vies ou moins, un [Trafalgar Law] de la Défausse en main
  const law = (g: GameState) => { g.players[0].trash.push(...g.players[0].deck.splice(g.players[0].deck.findIndex((c) => c.num === 'ST10-010'), 1)); };
  r = counterGain(at('OP12-061', 'OP12-115', (g) => { law(g); g.players[0].deck.push(...g.players[0].life.splice(2)); }), 'OP12-115', (x) => {
    let y = pickLeader(x);
    if (y.decision?.tag === 'trashToHand' || y.decision?.options.some((o) => o.num === 'ST10-010')) y = choose(y, (o) => o.num === 'ST10-010');
    return y;
  });
  assert.equal(r.gain, 2000);
  assert.ok(r.s.players[0].hand.some((c) => c.num === 'ST10-010'));
  r = counterGain(at('OP12-061', 'OP12-115', law), 'OP12-115', pickLeader);
  assert.ok(!r.s.players[0].hand.some((c) => c.num === 'ST10-010'), '5 Vies : rien de la Défausse');
});

test('Ipponmatsu (OP12-021) : Leader <Tranche> et 6 DON!! épuisées, pas épuisé par les effets adverses', () => {
  const at = (leader: string, rested: number) => scene([list(leader, ['OP12-021'], 'ST-01'), OPP], (g) => {
    setChars(g, 0, [{ num: 'OP12-021' }]);
    setDon(g, 0, 0, rested);
  });
  let s = at('OP12-020', 6);
  const u = charUid(s, 0, 'OP12-021');
  assert.equal(canBeRested(s, u, { player: 1, num: 'ST36-005' }), false);
  assert.equal(canBeRested(s, u, { player: 0, num: 'OP12-020' }), true, 'ses propres effets');
  s = at('OP12-020', 5);
  assert.equal(canBeRested(s, charUid(s, 0, 'OP12-021'), { player: 1, num: 'ST36-005' }), true);
  s = at('OP12-041', 6);
  assert.equal(canBeRested(s, charUid(s, 0, 'OP12-021'), { player: 1, num: 'ST36-005' }), true, 'Leader sans <Tranche>');
});

test('Sanji (Leader OP12-041) : DON!! −1 pour activer un Événement {Straw Hat Crew} de coût de base 3 ou moins ; [En attaquant] 1 DON!! épuisée', () => {
  const me = list('OP12-041', ['OP09-077', 'OP12-078'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP12-078']);
    setDon(g, 0, 3);
  });
  s = choose(s, `act:${leaderUid(s, 0)}`);
  assert.equal(s.players[0].donDeck, 8, 'DON!! −1');
  assert.ok(s.decision?.options.some((o) => o.num === 'OP12-078'));
  s = choose(s, (o) => o.num === 'OP12-078');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP12-078'));
  // [En attaquant] : autant ou moins de DON!! que l'adversaire, 1 DON!! épuisée en plus ; plus de DON!!, rien
  s = scene([me, OPP], (g) => { setDon(g, 0, 2); setDon(g, 1, 4); });
  s = attack(s, leaderUid(s, 0), leaderUid(s, 1));
  assert.equal(s.players[0].donRested, 1);
  s = scene([me, OPP], (g) => { setDon(g, 0, 5); setDon(g, 1, 4); });
  s = attack(s, leaderUid(s, 0), leaderUid(s, 1));
  assert.equal(s.players[0].donRested, 0);
});

test('Don Quijote Rosinante (Leader OP12-061) : Vie en main à la place du KO d’un [Trafalgar Law] ; prochain Law coûte 2 de moins', () => {
  const me = list('OP12-061', ['ST10-010', 'OP16-068'], 'ST-01');
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'ST10-010' }, { num: 'OP16-068' }]), 1);
  const lives = s.players[0].life.length;
  const ctx = ctxOf(s, 1, 'ST36-005');
  assert.equal(removeByEffect(ctx, charUid(s, 0, 'ST10-010'), 'ko'), false);
  assert.equal(s.players[0].life.length, lives - 1);
  assert.ok(s.players[0].chars.some((c) => c.num === 'ST10-010'));
  // une fois par tour : le second est mis KO
  assert.equal(removeByEffect(ctx, charUid(s, 0, 'OP16-068'), 'ko'), true);
  // réduction : DON!! −1, puis Law (coût 4) coûte 2
  s = scene([me, OPP], (g) => { setHand(g, 0, ['ST10-010', 'OP16-068']); setDon(g, 0, 5); });
  const law = s.players[0].hand.find((c) => c.num === 'ST10-010')!;
  assert.equal(handCost(s, 0, law), 4);
  s = choose(s, `act:${leaderUid(s, 0)}`);
  assert.equal(handCost(s, 0, law), 2);
  s = play(s, 'ST10-010');
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[0].donActive, 2, '5 − 1 (DON!! −1) − 2');
  const other = s.players[0].hand.find((c) => c.num === 'OP16-068')!;
  assert.equal(handCost(s, 0, other), 4, 'une seule fois');
  coherent(s);
});

test('Miss Allsunday (OP12-075) : KO d’un coût 3 ou moins, puis l’adversaire peut ajouter 1 DON!! redressée', () => {
  const me = list('OP12-041', ['OP12-075'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP12-075']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'ST36-004' }]);
    setDon(g, 1, 2);
  });
  s = play(s, 'OP12-075');
  if (s.decision?.tag === 'oppKo' || s.decision?.options.some((o) => o.id.startsWith('card:'))) s = choose(s, (o) => o.id.startsWith('card:'));
  assert.equal(s.players[1].chars.length, 0);
  assert.equal(s.decision?.player ?? 1, 1);
  s = yes(s);
  assert.equal(s.players[1].donActive, 3);
  coherent(s);
});

test('Technique du son (OP12-077) : un [Trafalgar Law] +2000 et imblocable ce tour-ci', () => {
  const me = list('OP12-061', ['OP12-077', 'ST10-010'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setHand(g, 0, ['OP12-077']);
    setChars(g, 0, [{ num: 'ST10-010' }]);
    setDon(g, 0, 3);
  });
  const law = charUid(s, 0, 'ST10-010');
  s = play(s, 'OP12-077');
  s = choose(s, `card:${law}`);
  assert.equal(power(s, law), 7000);
  assert.ok(hasKeyword(s, 0, s.players[0].chars[0], 'Unblockable'));
  coherent(s);
});

test('Koala (Leader OP12-081) : pioche en attaquant le Leader avec 2 Personnages de coût 8 ou plus ; Vie adverse en main quand l’adversaire joue un gros Personnage', () => {
  const me = list('OP12-081', ['EB03-062', 'OP17-047'], 'ST-01');
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'EB03-062' }, { num: 'OP17-047' }]));
  let hand = s.players[0].hand.length;
  s = attack(s, leaderUid(s, 0), leaderUid(s, 1));
  assert.equal(s.players[0].hand.length, hand + 1);
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'EB03-062' }]));
  hand = s.players[0].hand.length;
  s = attack(s, leaderUid(s, 0), leaderUid(s, 1));
  assert.equal(s.players[0].hand.length, hand);
  // l'adversaire joue un Personnage de coût 8 ou plus de sa main : sa Vie du dessus en main, une fois par tour
  const opp = list('OP17-001', ['OP17-047'], 'ST-01');
  s = scene([me, opp], (g) => { setHand(g, 1, ['OP17-047', 'OP17-047']); setDon(g, 1, 10); }, 1);
  const life = s.players[1].life.length;
  s = play(s, 'OP17-047', 1);
  while (s.decision?.inEffect) s = act(s, s.decision.options[0].id);
  assert.equal(s.players[1].life.length, life - 1);
  coherent(s);
});

test('Shirahoshi (OP12-102) : Vie retournée face visible à la place d’une sortie ; [Tour adverse] {Neptunian} +2000 sans autre Shirahoshi de coût 2', () => {
  const me = list('OP12-081', ['OP12-102', 'EB04-016'], 'ST-01');
  let s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP12-102' }, { num: 'EB04-016' }]), 1);
  const bird = charUid(s, 0, 'EB04-016');
  assert.equal(power(s, bird), 9000, 'tour adverse : +2000');
  const ctx = ctxOf(s, 1, 'ST36-005');
  assert.equal(removeByEffect(ctx, bird, 'hand'), false);
  assert.ok(s.players[0].life[0].faceUp);
  assert.ok(s.players[0].chars.some((c) => c.uid === bird));
  // la carte du dessus déjà face visible : plus de remplacement
  assert.equal(removeByEffect(ctx, bird, 'hand'), true);
  // à son tour : pas de bonus
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP12-102' }, { num: 'EB04-016' }]));
  assert.equal(power(s, charUid(s, 0, 'EB04-016')), 7000);
  // un autre Shirahoshi de coût 2 : pas de bonus
  s = scene([me, OPP], (g) => setChars(g, 0, [{ num: 'OP12-102' }, { num: 'OP12-102' }, { num: 'EB04-016' }]), 1);
  assert.equal(power(s, charUid(s, 0, 'EB04-016')), 7000);
});

test('Pacifista (OP12-109) : [Déclenchement] KO d’un coût 1 ou moins et la carte en main', () => {
  const me = list('OP12-081', ['OP12-109'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setLife(g, 0, ['OP12-109']);
    setChars(g, 1, [{ num: 'ST36-004' }]);
    oppLeaderDon(g, 2);
  }, 1);
  const target = s.players[1].chars[0].uid;
  assert.ok(fieldCost(s, target) <= 1, 'Personnage adverse de coût 1 ou moins');
  s = attack(s, leaderUid(s, 1), leaderUid(s, 0));
  while (s.decision?.kind === 'blocker' || s.decision?.kind === 'counter') s = act(s, s.decision.kind === 'blocker' ? 'noblock' : 'pass');
  s = choose(s, 'trigger');
  if (s.decision?.options.some((o) => o.id === `card:${target}`)) s = choose(s, `card:${target}`);
  assert.ok(!s.players[1].chars.some((c) => c.uid === target));
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP12-109'));
  assert.ok(!s.players[0].trash.some((c) => c.num === 'OP12-109'));
  coherent(s);
});

test('Crocodile et Mihawk (ST25-003) : piocher 2, défausser 1, jouer un {Cross Guild} ; défausser 1 carte à la place d’une sortie, une fois par tour', () => {
  const me = list('OP16-041', ['ST25-003', 'OP12-042'], 'ST-01');
  let s = scene([me, OPP], (g) => { setHand(g, 0, ['ST25-003', 'OP12-042']); setDon(g, 0, 10); });
  s = play(s, 'ST25-003');
  s = choose(s, (o) => o.num === 'OP12-042' || o.label.includes('Alvida') ? false : o.id.startsWith('card:'));
  if (s.decision?.options.some((o) => o.num === 'OP12-042')) s = choose(s, (o) => o.num === 'OP12-042');
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP12-042'));
  coherent(s);
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'ST25-003' }, { num: 'OP12-042' }]); setHand(g, 0, ['OP12-042', 'ST25-003']); }, 1);
  const ctx = ctxOf(s, 1, 'ST36-005');
  const hand = s.players[0].hand.length;
  assert.equal(removeByEffect(ctx, charUid(s, 0, 'OP12-042'), 'hand'), false);
  assert.equal(s.players[0].hand.length, hand - 1);
  assert.equal(removeByEffect(ctx, charUid(s, 0, 'OP12-042'), 'hand'), true, 'une fois par tour');
});

test('Momonosuké Kozuki (ST28-004) : Leader +1000 à son tour avec 2 Vies ou moins ; 2 DON!! données renvoyées pour [Initiative] et +1000', () => {
  const me = list('OP12-081', ['ST28-004'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    setChars(g, 0, [{ num: 'ST28-004', extra: { don: 2 } }]);
    g.players[0].donDeck -= 2;
    g.players[0].deck.push(...g.players[0].life.splice(2));
  });
  assert.equal(power(s, leaderUid(s, 0)), 6000);
  const m = charUid(s, 0, 'ST28-004');
  s = choose(s, `act:${m}`);
  assert.equal(s.players[0].chars[0].don, 0);
  assert.equal(power(s, m), 8000);
  assert.ok(hasKeyword(s, 0, s.players[0].chars[0], 'Rush'));
  assert.ok(!hasOption(s, `act:${m}`), 'une fois par tour');
  coherent(s);
  // 3 Vies, et une seule DON!! donnée : ni bonus, ni activation
  s = scene([me, OPP], (g) => { setChars(g, 0, [{ num: 'ST28-004', extra: { don: 1 } }]); g.players[0].donDeck -= 1; g.players[0].deck.push(...g.players[0].life.splice(3)); });
  assert.equal(power(s, leaderUid(s, 0)), 5000);
  assert.ok(!hasOption(s, `act:${charUid(s, 0, 'ST28-004')}`));
});

test('Baratie (OP12-080) : le Lieu sous le deck pour chercher un Événement avec un Leader Sanji ; Bœuf Burst (OP12-060) : piocher sans cible', () => {
  const me = list('OP12-041', ['OP12-080', 'OP12-078', 'OP12-060'], 'ST-01');
  let s = scene([me, OPP], (g) => {
    const P = g.players[0];
    const i = P.deck.findIndex((c) => c.num === 'OP12-080');
    const [b] = P.deck.splice(i, 1);
    P.stage = { uid: b.uid, num: b.num, rested: false, don: 0, playedTurn: 0, usedOpt: [] };
    setDeckTop(g, 0, ['OP12-078']);
  });
  const stage = s.players[0].stage!.uid;
  s = choose(s, `act:${stage}`);
  if (s.decision?.tag === 'may') s = yes(s);
  assert.equal(s.players[0].stage, null);
  s = choose(s, (o) => o.num === 'OP12-078');
  if (s.decision?.tag === 'bottomOrder') s = act(s, 'keep');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP12-078'));
  coherent(s);
  // Bœuf Burst (Leader multicolore) : sans Personnage adverse, piocher 2
  s = scene([me, OPP], (g) => { setHand(g, 0, ['OP12-060']); setDon(g, 0, 3); setChars(g, 1, []); });
  const hand = s.players[0].hand.length;
  s = play(s, 'OP12-060');
  if (s.decision?.tag === 'chooseOne') s = choose(s, (o) => o.id.startsWith('choice:'));
  assert.equal(s.players[0].hand.length, hand - 1 + 2);
});
