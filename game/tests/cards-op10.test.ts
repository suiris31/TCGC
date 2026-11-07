// OP10 (étape C, tâche S9) : un test par effet des cartes codées à la main (game/engine/cards/op10.ts), condition vraie
// et fausse, et les recettes que le banc d'essai ne sait pas mesurer ([Contre] « pendant ce combat », coût « épuisez ce
// Lieu »). Numéros et valeurs seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardStatus } from '../engine/cards/index.ts';
import { act } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { def, fieldCost, isNegated, removeByEffect } from '../engine/rules.ts';
import type { EffectCtx, FieldCard, GameState, PlayerId } from '../engine/types.ts';
import { choose, coherent, expectTag, play, setChars, setDeckTop, setDon, setHand, setLife, takeField } from './helpers.ts';
import { counterGain, leaderUid, list, oppLeaderDon, scene } from './eb-scene.ts';

const OPP = 'ST-36';
// Contexte d'un effet du joueur `me` : chaque question reçoit la réponse donnée (la première proposée par défaut)
const ctxOf = (s: GameState, me: PlayerId, num: string, pick: (ids: string[]) => string = (ids) => ids[0]): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: -1, num, pending: { kind: 'system', source: -1, num, controller: me, answers: [] } as unknown as EffectCtx['pending'],
  ask: (spec) => pick(spec.options.map((o) => o.id)),
});
// répond « oui » aux questions facultatives et prend la première carte proposée, jusqu'à la fin de l'effet
const resolve = (s: GameState) => {
  while (s.decision?.inEffect) {
    const d = s.decision;
    s = d.options.some((o) => o.id === 'yes') ? choose(s, 'yes') : d.options.some((o) => o.id.startsWith('card:')) ? choose(s, (o) => o.id.startsWith('card:')) : act(s, d.options[0].id);
  }
  return s;
};
const mine = (s: GameState, num: string, p: PlayerId = 0) => s.players[p].chars.find((c) => c.num === num)!;
const pickCard = (s: GameState) => (s.decision?.options.some((o) => o.id.startsWith('card:')) ? choose(s, (o) => o.id.startsWith('card:')) : s);

test('OP10 : les cartes codées à la main sont jouables ; recettes relues vérifiées', () => {
  for (const n of ['OP10-022', 'OP10-026', 'OP10-027', 'OP10-030', 'OP10-032', 'OP10-037', 'OP10-042', 'OP10-049', 'OP10-057',
    'OP10-058', 'OP10-074', 'OP10-098']) assert.equal(cardStatus(n), 'coded', n);
  for (const n of ['OP10-018', 'OP10-019', 'OP10-021', 'OP10-078', 'OP10-079', 'OP10-080', 'OP10-086']) assert.equal(confidence(n), 'verified', n);
});

// ---------- Recettes que le banc ne mesure pas ----------

test('Igloo renforcé (OP10-018) [Contre] : +3000 pour le combat, puis −2000 à une carte adverse', () => {
  const s0 = scene([list('EB01-001', ['OP10-018']), OPP], (g) => { setHand(g, 0, ['OP10-018']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  const { s, gain } = counterGain(s0, 'OP10-018', (t) => pickCard(pickCard(t)));
  assert.equal(gain, 3000);
  assert.ok(s.mods.some((m) => m.stat === 'power' && m.amount === -2000 && m.uid === leaderUid(s, 1)), '−2000 au Leader adverse');
});

test('Trépas divin (OP10-019) [Contre] : +3000 à son Leader pour le combat', () => {
  const s0 = scene([list('EB01-001', ['OP10-019']), OPP], (g) => { setHand(g, 0, ['OP10-019']); setDon(g, 0, 3); oppLeaderDon(g, 2); }, 1);
  assert.equal(counterGain(s0, 'OP10-019', pickCard).gain, 3000);
});

test('Little Black Bears (OP10-080) [Contre] : +4000, puis 1 carte piochée avec 7 DON!! et 5 cartes ou moins en main', () => {
  const deck = list('EB01-001', ['OP10-080']);
  let s0 = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-080']); setDon(g, 0, 7); oppLeaderDon(g, 2); }, 1);
  let r = counterGain(s0, 'OP10-080', pickCard);
  assert.equal(r.gain, 4000);
  assert.equal(r.s.players[0].hand.length, 1, 'piochée');
  s0 = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-080']); setDon(g, 0, 6); oppLeaderDon(g, 2); }, 1);
  r = counterGain(s0, 'OP10-080', pickCard);
  assert.equal(r.gain, 4000);
  assert.equal(r.s.players[0].hand.length, 0, '6 DON!! : pas de pioche');
});

test('OP10-078 [Contre] : une carte {Donquixote Pirates} des 3 du dessus ajoutée à la main', () => {
  const s0 = scene([list('EB01-001', ['OP10-078', 'OP02-108']), OPP], (g) => {
    setHand(g, 0, ['OP10-078']);
    setDeckTop(g, 0, ['OP02-108']);
    setDon(g, 0, 3);
    oppLeaderDon(g, 2);
  }, 1);
  const { s } = counterGain(s0, 'OP10-078', (t) => resolve(t));
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP02-108'));
});

test('Punk Hazard (OP10-021) : épuiser le Lieu, avec le Leader [Caesar Clown] : 1 DON!! épuisée donnée', () => {
  const setup = (g: GameState) => { g.players[0].stage = takeField(g, 0, 'OP10-021'); setDon(g, 0, 0, 2); };
  let s = scene([list('OP10-002', ['OP10-021']), OPP], setup);
  const stage = s.players[0].stage!;
  s = resolve(act(s, `act:${stage.uid}`));
  assert.ok(s.players[0].stage!.rested);
  assert.equal(s.players[0].donRested, 1);
  assert.equal(s.players[0].leader.don + s.players[0].chars.reduce((k, c) => k + c.don, 0), 1);
  s = scene([list('EB01-001', ['OP10-021']), OPP], setup);
  const id = `act:${s.players[0].stage!.uid}`;
  if (s.decision?.options.some((o) => o.id === id)) s = resolve(act(s, id));
  assert.equal(s.players[0].donRested, 2, 'autre Leader : aucune DON!! donnée');
});

// ---------- Cartes codées à la main ----------

test('Trafalgar Law (OP10-022, Leader) : renvoyer un Personnage, révéler la Vie du dessus, jouer un {Supernovas} de coût 5 ou moins', () => {
  const deck = list('OP10-022', ['ST02-004', 'OP04-089', 'OP05-052']);
  const setup = (lifeTop: string, chars: string[]) => (g: GameState) => {
    setChars(g, 0, chars.map((num) => ({ num })));
    setLife(g, 0, [lifeTop, 'OP05-052']);
    g.players[0].leader.don = 1;
    g.players[0].donDeck -= 1;
  };
  let s = scene([deck, OPP], setup('ST02-004', ['OP04-089', 'OP04-089']));
  const law = `act:${leaderUid(s, 0)}`;
  s = act(s, law);
  s = resolve(s);
  assert.ok(s.players[0].chars.some((c) => c.num === 'ST02-004'), 'Personnage {Supernovas} joué depuis la Vie');
  assert.equal(s.players[0].life.length, 1);
  assert.equal(s.players[0].chars.filter((c) => c.num === 'OP04-089').length, 1, 'un Personnage renvoyé en main');
  coherent(s);
  // carte d'un autre type : reste dans la Vie
  s = scene([deck, OPP], setup('OP05-052', ['OP04-089', 'OP04-089']));
  s = resolve(act(s, law));
  assert.equal(s.players[0].life.length, 2);
  // coût total 4 : pas activable
  s = scene([deck, OPP], setup('ST02-004', ['OP05-052', 'OP05-052']));
  assert.equal(fieldCost(s, s.players[0].chars[0].uid) + fieldCost(s, s.players[0].chars[1].uid), 4);
  assert.ok(!s.decision?.options.some((o) => o.id === law));
});

test('Kin’emon (OP10-026, OP10-027) : placer ce Personnage et le [Kin’emon] de l’autre puissance de la Défausse sous le deck, jouer un [Kin’emon] de coût 6', () => {
  for (const [num, partner] of [['OP10-026', 'OP10-027'], ['OP10-027', 'OP10-026']]) {
    const deck = list('EB01-001', [num, partner, 'OP01-040']);
    let s = scene([deck, OPP], (g) => {
      setChars(g, 0, [{ num }]);
      g.players[0].trash.push(...setHand(g, 0, [partner]).splice(0));
      setHand(g, 0, ['OP01-040']);
    });
    const self = mine(s, num);
    const deckBefore = s.players[0].deck.length;
    s = resolve(act(s, `act:${self.uid}`));
    assert.ok(s.players[0].chars.some((c) => c.num === 'OP01-040'), num);
    assert.ok(!s.players[0].chars.some((c) => c.num === num));
    assert.equal(s.players[0].deck.length, deckBefore + 2);
    assert.ok(!s.players[0].trash.some((c) => c.num === partner));
    coherent(s);
    // sans le bon [Kin'emon] dans la Défausse (le même numéro) : pas proposé
    s = scene([deck, OPP], (g) => {
      setChars(g, 0, [{ num }]);
      g.players[0].trash.push(...setHand(g, 0, [num]).splice(0));
      setHand(g, 0, ['OP01-040']);
    });
    assert.ok(!s.decision?.options.some((o) => o.id === `act:${mine(s, num).uid}`), `${num} : mauvaise puissance`);
  }
});

test('Smoker (OP10-030) : redresser 1 DON!!, puis plus de DON!! redressée par un effet de Personnage ce tour-ci', () => {
  let s = scene([list('EB01-001', ['OP10-030']), OPP], (g) => { setChars(g, 0, [{ num: 'OP10-030' }]); setDon(g, 0, 0, 3); });
  const smoker = mine(s, 'OP10-030');
  s = resolve(act(s, `act:${smoker.uid}`));
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].noCharDonReadyTurn, s.turn);
  assert.ok(!s.decision?.options.some((o) => o.id === `act:${smoker.uid}`), 'une deuxième activation ne redresserait rien');
});

// Remplacements : un effet adverse (joueur 1) retire un Personnage du joueur 0 ; ctxOf répond la première option
// (« utiliser le remplacement »), ou « none » avec refuse
const refuse = (ids: string[]) => (ids.includes('none') ? 'none' : ids.includes('no') ? 'no' : ids[0]);

test('Tashigi (OP10-032) : s’épuise à la place d’un autre Personnage vert retiré par un effet adverse', () => {
  const deck = list('EB01-001', ['OP10-032', 'OP06-032', 'OP05-052']);
  let s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP10-032' }, { num: 'OP06-032' }, { num: 'OP05-052' }]); });
  const [tashigi, green, blue] = s.players[0].chars;
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), green.uid, 'hand'), false);
  assert.ok(tashigi.rested && s.players[0].chars.includes(green));
  // déjà épuisée : plus de remplacement ; un Personnage bleu : jamais
  const r = def('OP10-032').replaceRemoval!;
  assert.ok(!r.condition(s, 0, tashigi, green));
  tashigi.rested = false;
  assert.ok(!r.condition(s, 0, tashigi, blue), 'pas vert');
  assert.ok(!r.condition(s, 0, tashigi, tashigi), 'pas elle-même');
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002', refuse), green.uid, 'hand'), true, 'remplacement refusé');
});

test('Lim (OP10-037) : [Une fois par tour] épuise un Personnage {ODYSSEY} au lieu de quitter le terrain ; [Fin de votre tour] en redresse un', () => {
  const deck = list('EB01-001', ['OP10-037', 'OP10-033']);
  let s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP10-037' }, { num: 'OP10-033' }]); });
  const [lim, nami] = s.players[0].chars;
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), lim.uid, 'ko'), false);
  assert.ok(lim.rested !== nami.rested, 'une carte {ODYSSEY} épuisée');
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), lim.uid, 'hand'), true, 'une fois par tour');
  // [Fin de votre tour]
  s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP10-037' }, { num: 'OP10-033', extra: { rested: true } }]); });
  s = resolve(act(s, 'end'));
  assert.equal(mine(s, 'OP10-033').rested, false);
});

test('Usopp (OP10-042, Leader) : +1 au coût de ses {Dressrosa} de coût 2 ou plus ; pioche quand l’un d’eux est mis KO au tour adverse', () => {
  const deck = list('OP10-042', ['OP04-077', 'OP10-057', 'OP04-089']);
  let s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP04-077' }, { num: 'OP10-057' }]); setChars(g, 1, [{ num: 'ST36-002' }]); });
  const [ideo, leo] = s.players[0].chars;
  assert.equal(fieldCost(s, ideo.uid), 3, 'coût 2 → 3');
  assert.equal(fieldCost(s, leo.uid), 1, 'coût 1 : rien');
  assert.equal(fieldCost(s, s.players[1].chars[0].uid), def('ST36-002').cost, 'adverse : rien');
  s.mods.push({ uid: ideo.uid, stat: 'cost', amount: -1, until: 'turn', source: 'essai' });
  assert.equal(fieldCost(s, ideo.uid), 1, 'coût 2 − 1 = 1 : plus de +1');
  // tour adverse : un {Dressrosa} mis KO par un effet → 1 carte piochée (5 cartes ou moins en main)
  s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP04-077' }, { num: 'OP04-089' }]); setHand(g, 0, []); }, 1);
  const w = def('OP10-042').when!;
  const leader = s.players[0].leader;
  const ko = { type: 'ko' as const, player: 0 as const, uid: 1, num: 'OP04-077', zone: 'character' as const, by: 1 as const, cause: 'effect' as const };
  assert.ok(w[0].if(s, 0, leader, ko));
  assert.ok(w[0].if(s, 0, leader, { ...ko, cause: 'battle' }), 'KO en combat aussi');
  assert.ok(!w[0].if(s, 0, leader, { ...ko, num: 'ST36-002' }), 'pas {Dressrosa}');
  const leave = { ...ko, type: 'leave' as const };
  assert.ok(w[1].if(s, 0, leader, leave));
  assert.ok(!w[1].if(s, 0, leader, { ...leave, by: 0 as const }), 'retiré par son propre effet');
  const hand = s.players[0].hand.length;
  w[0].run(ctxOf(s, 0, 'OP10-042'), ko);
  assert.equal(s.players[0].hand.length, hand + 1);
  setHand(s, 0, ['OP04-077', 'OP04-077', 'OP04-077', 'OP04-089', 'OP04-089', 'OP04-089']);
  w[0].run(ctxOf(s, 0, 'OP10-042'), ko);
  assert.equal(s.players[0].hand.length, 6, '6 cartes en main : pas de pioche');
  s.active = 0;
  assert.ok(!w[0].if(s, 0, leader, ko), 'pendant son tour : rien');
});

test('Sabo (OP10-049) : se renvoie en main à la place d’un de ses Personnages de coût de base 7 ou moins retiré par un effet adverse', () => {
  const deck = list('EB01-001', ['OP10-049', 'OP05-052', 'OP12-106']);
  let s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP10-049' }, { num: 'OP05-052' }]); });
  const [sabo, other] = s.players[0].chars;
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), other.uid, 'ko'), false);
  assert.ok(s.players[0].hand.some((c) => c.uid === sabo.uid) && s.players[0].chars.includes(other));
  const r = def('OP10-049').replaceRemoval!;
  s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'OP10-049' }, { num: 'OP10-049' }]); });
  assert.ok(!r.condition(s, 0, s.players[0].chars[0], s.players[0].chars[1]), 'un autre [Sabo]');
  assert.ok(r.condition(s, 0, s.players[0].chars[0], { ...s.players[0].chars[1], num: 'OP12-106' }), 'coût de base 6');
});

test('Léo (OP10-057) : épuiser le Leader : avec [Usopp], 2 cartes {Dressrosa} prises, puis 1 carte défaussée ; autre Leader : pas proposé', () => {
  const deck = list('OP10-042', ['OP10-057', 'OP04-077', 'OP04-089']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-057']); setDeckTop(g, 0, ['OP04-077', 'OP04-089']); setDon(g, 0, 1); });
  s = play(s, 'OP10-057');
  expectTag(s, 'may');
  s = resolve(s);
  assert.ok(s.players[0].leader.rested);
  assert.equal(s.players[0].hand.length, 1, '2 cartes prises, 1 défaussée');
  assert.equal(s.players[0].trash.length, 1);
  coherent(s);
  s = scene([list('EB01-001', ['OP10-057']), OPP], (g) => { setHand(g, 0, ['OP10-057']); setDon(g, 0, 1); });
  s = play(s, 'OP10-057');
  assert.ok(!s.players[0].leader.rested);
  assert.notEqual(s.decision?.tag, 'may');
});

test('Rebecca (OP10-058) : piocher s’il y a un coût 8 ; jouer 1 carte révélée et l’autre épuisée si son coût est de 4 ou moins', () => {
  const deck = list('EB01-001', ['OP10-058', 'OP04-089', 'OP12-106']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-058', 'OP12-106', 'OP04-089']); setDon(g, 0, 7); });
  const hand = s.players[0].hand.length;
  s = play(s, 'OP10-058');
  // pas de Personnage de coût 8 : pas de pioche ; révéler Law (6) puis Bartolomeo (3), jouer Law
  s = choose(s, (o) => o.num === 'OP12-106');
  s = choose(s, (o) => o.num === 'OP04-089');
  s = choose(s, (o) => o.num === 'OP12-106');
  assert.equal(mine(s, 'OP12-106').rested, false);
  assert.equal(mine(s, 'OP04-089').rested, true, 'coût 3 : jouée épuisée');
  assert.equal(s.players[0].hand.length, hand - 3);
  coherent(s);
  // l'autre carte coûte plus de 4 : elle reste en main
  s = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-058', 'OP12-106', 'OP04-089']); setDon(g, 0, 7); });
  s = play(s, 'OP10-058');
  s = choose(s, (o) => o.num === 'OP12-106');
  s = choose(s, (o) => o.num === 'OP04-089');
  s = choose(s, (o) => o.num === 'OP04-089');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP12-106'));
  // un Personnage de coût 8 sur le terrain (adverse) : 1 carte piochée
  s = scene([deck, OPP], (g) => { setHand(g, 0, ['OP10-058']); setChars(g, 1, [{ num: 'ST36-005' }]); setDon(g, 0, 7); });
  g8(s);
  const before = s.players[0].hand.length;
  s = resolve(play(s, 'OP10-058'));
  assert.equal(s.players[0].hand.length, before);   // −1 Rebecca jouée, +1 pioche
});
// Kidd (coût 6) passe à 8 pour le test
function g8(s: GameState) { s.mods.push({ uid: s.players[1].chars[0].uid, stat: 'cost', amount: 2, until: 'turn', source: 'essai' }); }

test('Pica (OP10-074) : [Une fois par tour] épuise 2 DON!! redressées au lieu d’être mis KO par un effet adverse (pas un autre retrait)', () => {
  let s = scene([list('EB01-001', ['OP10-074']), OPP], (g) => { setChars(g, 0, [{ num: 'OP10-074' }]); setDon(g, 0, 3); });
  const pica = mine(s, 'OP10-074');
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), pica.uid, 'ko'), false);
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].donRested, 2);
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), pica.uid, 'ko'), true, 'une fois par tour');
  s = scene([list('EB01-001', ['OP10-074']), OPP], (g) => { setChars(g, 0, [{ num: 'OP10-074' }]); setDon(g, 0, 3); });
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), mine(s, 'OP10-074').uid, 'hand'), true, 'renvoyé en main : pas de remplacement');
  s = scene([list('EB01-001', ['OP10-074']), OPP], (g) => { setChars(g, 0, [{ num: 'OP10-074' }]); setDon(g, 0, 1); });
  assert.equal(removeByEffect(ctxOf(s, 1, 'ST36-002'), mine(s, 'OP10-074').uid, 'ko'), true, '1 DON!! redressée seulement');
});

test('Libération (OP10-098) : 2 KO avec 2 Personnages de moins que l’adversaire ; [Déclenchement] Leader et Personnage adverses annulés', () => {
  const deck = list('EB01-001', ['OP10-098']);
  let s = scene([deck, OPP], (g) => {
    setHand(g, 0, ['OP10-098']);
    setChars(g, 1, [{ num: 'ST36-002' }, { num: 'ST36-004' }, { num: 'ST36-005' }]);
    setDon(g, 0, 6);
  });
  s = resolve(play(s, 'OP10-098'));
  assert.equal(s.players[1].chars.length, 1, 'coût de base 4 puis 1 mis KO ; Kidd (6) reste');
  coherent(s);
  s = scene([deck, OPP], (g) => {
    setHand(g, 0, ['OP10-098']);
    setChars(g, 0, []);
    setChars(g, 1, [{ num: 'ST36-002' }, { num: 'ST36-004' }]);
    setDon(g, 0, 6);
  });
  // 0 contre 2 : condition remplie ; avec 1 Personnage à soi : non
  assert.ok(def('OP10-098').mainUseful!(s, 0));
  s.players[0].chars.push({ uid: 9998, num: 'ST36-004', rested: false, don: 0, playedTurn: 0, usedOpt: [] } as FieldCard);
  assert.ok(!def('OP10-098').mainUseful!(s, 0));
  s.players[0].chars.pop();
  def('OP10-098').onTrigger!(ctxOf(s, 0, 'OP10-098'));
  assert.ok(isNegated(s, leaderUid(s, 1)) && isNegated(s, s.players[1].chars[0].uid));
});
