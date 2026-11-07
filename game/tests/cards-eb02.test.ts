// EB02 (étape C, tâche S9) : un test par effet des cartes codées à la main (game/engine/cards/eb02.ts), condition vraie
// et fausse, et les recettes que le banc d'essai ne sait pas mesurer (choix d'un effet dont les leurres de l'un sont des
// cibles de l'autre). Numéros et valeurs seulement, aucun texte de carte.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardStatus } from '../engine/cards/index.ts';
import { act } from '../engine/engine.ts';
import { confidence } from '../engine/recipes/confidence.ts';
import { def, fieldCost, hasBlocker, hasKeyword } from '../engine/rules.ts';
import type { EffectCtx, GameState } from '../engine/types.ts';
import { choose, coherent, expectTag, play, setChars, setDeckTop, setDon, setHand, takeField } from './helpers.ts';
import { list, scene } from './eb-scene.ts';

const OPP = 'ST-36';
// Contexte minimal d'un effet du joueur `me` : chaque question reçoit la première réponse proposée
const ctxOf = (s: GameState, me: 0 | 1, num: string): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: -1, num, pending: { kind: 'system', source: -1, num, controller: me, answers: [] } as unknown as EffectCtx['pending'],
  ask: (spec) => spec.options[0].id,
});
// répond « oui » aux questions facultatives et prend la première carte proposée, jusqu'à la fin de l'effet
const resolve = (s: GameState) => {
  while (s.decision?.inEffect) {
    const d = s.decision;
    s = d.options.some((o) => o.id === 'yes') ? choose(s, 'yes') : d.options.some((o) => o.id.startsWith('card:')) ? choose(s, (o) => o.id.startsWith('card:')) : act(s, d.options[0].id);
  }
  return s;
};

test('EB02 : les cartes codées à la main sont jouables, le Leader EB02-010 est en doute', () => {
  for (const n of ['EB02-013', 'EB02-018', 'EB02-023', 'EB02-032', 'EB02-033', 'EB02-039']) assert.equal(cardStatus(n), 'coded', n);
  assert.equal(confidence('EB02-010'), 'doubt');
  for (const n of ['EB02-012', 'EB02-026', 'EB02-051', 'EB02-057']) assert.equal(confidence(n), 'verified', n);
});

test('Carrot (EB02-013) : avec 3 DON!!, [Zou] cherché dans les 7 cartes du dessus puis joué ; avec 2 DON!!, [Zou] de la main joué quand même', () => {
  const deck = list('EB01-001', ['EB02-013', 'OP08-039']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-013']); setDeckTop(g, 0, ['OP08-039']); setDon(g, 0, 3); });
  s = resolve(play(s, 'EB02-013'));
  assert.equal(s.players[0].stage?.num, 'OP08-039', '[Zou] cherché puis joué');
  coherent(s);
  s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-013', 'OP08-039']); setDon(g, 0, 1, 1); });
  const top = s.players[0].deck[0].uid;
  s = resolve(play(s, 'EB02-013'));
  assert.equal(s.players[0].deck[0].uid, top, 'pas de recherche avec 2 DON!!');
  assert.equal(s.players[0].stage?.num, 'OP08-039', 'le [Zou] de la main est joué (la condition ne couvre pas le « Puis »)');
});

test('Icebarg (EB02-032) : [Galley-La Company] cherché puis joué (Lieu)', () => {
  const deck = list('EB01-001', ['EB02-032', 'OP03-075']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-032']); setDeckTop(g, 0, ['OP03-075']); setDon(g, 0, 3); });
  s = resolve(play(s, 'EB02-032'));
  assert.equal(s.players[0].stage?.num, 'OP03-075');
});

test('Baggy (EB02-018) : [Double attaque] au Leader sans autre Personnage [Baggy] ; [Déclenchement] épuise un Personnage adverse de coût 4 ou moins', () => {
  const deck = list('EB01-001', ['EB02-018', 'OP03-008']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-018']); setDon(g, 0, 4); });
  s = resolve(play(s, 'EB02-018'));
  assert.ok(hasKeyword(s, 0, s.players[0].leader, 'Double Attack'));
  s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-018']); setChars(g, 0, [{ num: 'OP03-008' }]); setDon(g, 0, 4); });
  s = resolve(play(s, 'EB02-018'));
  assert.ok(!hasKeyword(s, 0, s.players[0].leader, 'Double Attack'), 'un autre [Baggy] sur le terrain');
  s = scene([deck, OPP], (g) => { setChars(g, 1, [{ num: 'ST36-002' }]); });
  const target = s.players[1].chars[0];
  assert.ok((def(target.num).cost ?? 0) <= 4);
  def('EB02-018').onTrigger!(ctxOf(s, 0, 'EB02-018'));
  assert.ok(target.rested);
});

test('Crocodile (EB02-023) : [Votre tour] [Une fois par tour] un Personnage adverse renvoyé en main par son effet : regarder 3 cartes', () => {
  const deck = list('EB01-001', ['EB02-023', 'OP10-046', 'OP06-064']);
  let s = scene([deck, OPP], (g) => {
    setChars(g, 0, [{ num: 'EB02-023' }]);
    setChars(g, 1, [{ num: 'ST36-002' }, { num: 'ST36-002' }]);
    setHand(g, 0, ['OP10-046', 'OP10-046']);
    setDon(g, 0, 10);
  });
  s = play(s, 'OP10-046');
  s = choose(s, (o) => o.uid === s.players[1].chars[0].uid);
  expectTag(s, 'scry');
  s = resolve(s);
  coherent(s);
  // [Une fois par tour] : la clé est prise (emit ne le redéclenche plus ce tour-ci)
  assert.ok(s.players[0].chars.find((c) => c.num === 'EB02-023')!.usedOpt.includes('EB02-023:look'));
  // renvoyer un de ses propres Personnages : rien
  s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'EB02-023' }, { num: 'OP06-064' }]); setHand(g, 0, ['OP10-046']); setDon(g, 0, 7); });
  s = play(s, 'OP10-046');
  s = choose(s, (o) => o.uid === s.players[0].chars[1].uid);
  assert.notEqual(s.decision?.tag, 'scry');
  // pendant le tour adverse : rien ([Votre tour])
  const w = def('EB02-023').when![0];
  const opp = s.players[1].chars[0] ?? s.players[1].leader;
  s.players[1].hand.push({ uid: 9999, num: opp.num });
  const e = { type: 'leave' as const, player: 1 as const, uid: 9999, num: opp.num, zone: 'character' as const, by: 0 as const, cause: 'effect' as const };
  assert.ok(w.if(s, 0, s.players[0].chars[0], e));
  s.active = 1;
  assert.ok(!w.if(s, 0, s.players[0].chars[0], e));
  s.players[1].hand.pop();
});

test('Klabautermann (EB02-033) : [Bloqueur] seulement avec un [Merry Go] (Lieu) sur son terrain', () => {
  const deck = list('EB01-001', ['EB02-033', 'EB02-041']);
  let s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'EB02-033' }]); });
  assert.ok(!hasBlocker(s, 0, s.players[0].chars[0]));
  s = scene([deck, OPP], (g) => { setChars(g, 0, [{ num: 'EB02-033' }]); g.players[0].stage = takeField(g, 0, 'EB02-041'); });
  assert.ok(hasBlocker(s, 0, s.players[0].chars[0]));
});

test('GERMA 66 (EB02-039) : défausser [Niji] de 3000, jouer [Niji] de 6000 de la Défausse ; rien avec plus de DON!! que l’adversaire', () => {
  const deck = list('EB01-001', ['EB02-039', 'OP06-064', 'OP06-065']);
  const setup = (don: number) => (g: GameState) => {
    setHand(g, 0, ['EB02-039', 'OP06-064']);
    g.players[0].trash.push(...setHand(g, 0, ['OP06-065']).splice(0));
    setHand(g, 0, ['EB02-039', 'OP06-064']);
    setDon(g, 0, don);
    setDon(g, 1, 6);
  };
  let s = scene([deck, OPP], setup(6));
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP06-065'));
  s = resolve(play(s, 'EB02-039'));
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP06-065'), '[Niji] de 6000 joué');
  assert.ok(s.players[0].trash.some((c) => c.num === 'OP06-064'), '[Niji] de 3000 défaussé');
  coherent(s);
  s = scene([deck, OPP], setup(7));
  s = resolve(play(s, 'EB02-039'));
  assert.ok(!s.players[0].chars.some((c) => c.num === 'OP06-065'), 'plus de DON!! que l’adversaire');
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP06-064'), 'coût pas proposé (convention n° 1000)');
});

test('Song Slash (EB02-051) : au choix, KO (coût 2 ou moins) ou −4 de coût pour le tour', () => {
  const deck = list('EB01-001', ['EB02-051']);
  let s = scene([deck, OPP], (g) => { setHand(g, 0, ['EB02-051']); setChars(g, 1, [{ num: 'ST36-005' }, { num: 'ST36-004' }]); setDon(g, 0, 5); });
  const target = s.players[1].chars[0].uid;
  const before = fieldCost(s, target);
  s = play(s, 'EB02-051');
  expectTag(s, 'chooseOne');
  s = choose(s, 'choice:1');
  s = choose(s, (o) => o.uid === target);
  assert.equal(fieldCost(s, target), before - 4);
  coherent(s);
});

test('Nefertari Vivi (EB02-026, recette) : 2 cartes piochées avec un Leader multicolore (correction de S6 reprise), rien avec un Leader d’une couleur', () => {
  for (const [leader, drawn] of [['EB01-001', 2], ['OP09-081', 0]] as const) {
    let s = scene([list(leader, ['EB02-026']), OPP], (g) => { setHand(g, 0, ['EB02-026']); setDon(g, 0, 5); });
    const hand = s.players[0].hand.length;
    s = resolve(play(s, 'EB02-026'));
    assert.equal(s.players[0].hand.length, hand - 1 + drawn, leader);
  }
});
