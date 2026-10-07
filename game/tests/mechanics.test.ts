// Mécanismes de règles ajoutés pour les cartes à venir (phase 4A.4) : moments de début de partie, de tour et de phase
// principale, [En bloquant], protections contre la mise KO et la sortie du terrain, effets permanents sur les cartes
// adverses, règles changées par un Leader (deck DON!!, deck vide), règles de construction d'un deck.
// Les effets testés sont donnés pour l'occasion à des cartes qui ne les ont pas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CARDS, loadCardData } from '../engine/cards/index.ts';
import { deckErrors } from '../engine/deckRules.ts';
import { DECKS } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { addMod, koByEffect, log, power, removeByEffect } from '../engine/rules.ts';
import type { CardData, CardDef, EffectCtx, GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, scenario, setChars, setHand, setLife } from './helpers.ts';

function withCards(changes: Record<string, Partial<CardDef>>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(changes).map((n) => [n, CARDS[n]]));
  try {
    for (const [n, c] of Object.entries(changes)) CARDS[n] = { ...CARDS[n], ...c };
    run();
  } finally {
    Object.assign(CARDS, saved);
  }
}

const SABO = 'OP13-004';     // Leader de ST-35
const MORLEY = 'OP12-093';   // 5000
const BETTY = 'OP12-090';    // 4000
const CORBEAU = 'ST35-003';
const HACK = 'ST35-001';     // [Bloqueur]
const lineOf = (s: GameState, text: string) => s.log.findIndex((l) => l.text.includes(text));

// Effet joué par le joueur `me` (sans question : aucune réponse attendue)
const effectOf = (s: GameState, me: PlayerId): EffectCtx => ({
  s, me, opp: me === 0 ? 1 : 0, source: s.players[me].leader.uid, num: s.players[me].leader.num,
  pending: { kind: 'system', source: 0, num: '', controller: me, answers: [] },
  ask: () => { throw new Error('question inattendue'); },
});

test('« au début de la partie » : avant les mains de départ, le premier joueur d’abord', () => {
  withCards({ [SABO]: { when: [{ on: 'gameStart', if: (s, owner, self) => self.uid === s.players[owner].leader.uid, run: (ctx) => log(ctx.s, ctx.me, 'début de partie') }] } }, () => {
    const s = newGame({ decks: ['ST-35', 'ST-35'], names: ['A', 'B'], seed: 3, first: 1 });
    const starts = s.log.flatMap((l, i) => (l.text === 'début de partie' ? [l.player] : []));
    assert.deepEqual(starts, [1, 0]);
    assert.ok(lineOf(s, 'début de partie') < lineOf(s, 'joue en premier'));
    assert.equal(s.players[0].hand.length, 5);
    assert.equal(s.decision?.kind, 'mulligan');
  });
});

test('« au début de votre tour » : avant le retour des DON!! et le redressement (6-2) ; « au début de la phase principale »', () => {
  const seen: { rested: boolean; don: number }[] = [];
  withCards({
    [BETTY]: {
      when: [
        { on: 'turnStart', if: (_s, owner, _self, e) => e.player === owner, run: (ctx) => { const c = ctx.s.players[ctx.me].chars[0]; seen.push({ rested: c.rested, don: c.don }); } },
        { on: 'mainStart', if: (_s, owner, _self, e) => e.player === owner, run: (ctx) => log(ctx.s, ctx.me, 'phase principale') },
      ],
    },
  }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 1, [{ num: BETTY, extra: { rested: true, don: 1 } }]);
      g.players[1].donDeck -= 1;
    });
    s = act(s, 'end');
    assert.deepEqual(seen, [{ rested: true, don: 1 }]);
    assert.equal(s.players[1].chars[0].rested, false);
    assert.equal(s.players[1].chars[0].don, 0);
    assert.ok(lineOf(s, 'phase principale') > lineOf(s, '— Tour 6'));
    assert.equal(s.decision?.kind, 'main');
    coherent(s);
  });
});

test('[En bloquant] : l’effet du bloqueur se résout avant l’étape de Contre', () => {
  withCards({ [HACK]: { when: [{ on: 'block', if: (_s, _owner, self, e) => e.uid === self.uid, run: (ctx) => log(ctx.s, ctx.me, 'Hack bloque') }] } }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setChars(g, 1, [{ num: HACK }]);
      setHand(g, 1, [CORBEAU]);
    });
    s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
    s = choose(s, 'block');
    assert.ok(lineOf(s, 'Hack bloque') > lineOf(s, 'bloque avec'));
    assert.equal(s.decision?.kind, 'counter');
  });
});

test('« ne peut pas être mis KO en combat »', () => {
  withCards({ [BETTY]: { cantBeKO: (_s, _o, _self, cause) => cause === 'battle' } }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setChars(g, 1, [{ num: BETTY, extra: { rested: true } }]);
      setHand(g, 1, []);
    });
    s = attack(s, s.players[0].chars[0].uid, s.players[1].chars[0].uid);
    assert.equal(s.players[1].chars.length, 1);
    assert.ok(lineOf(s, 'ne peut pas être mis KO') >= 0);
    // par un effet, il peut l'être
    assert.equal(koByEffect(effectOf(s, 0), s.players[1].chars[0].uid), true);
    assert.equal(s.players[1].chars.length, 0);
    coherent(s);
  });
});

test('protections accordées par un effet : mise KO par un effet adverse, sortie du terrain par un effet adverse', () => {
  const s = scenario(['ST-35', 'ST-35'], (g) => setChars(g, 1, [{ num: BETTY }, { num: CORBEAU }]));
  const [betty, corbeau] = s.players[1].chars.map((c) => c.uid);
  addMod(s, { uid: betty, stat: 'cantBeKO', scope: 'oppEffect', amount: 0, until: 'turn', source: 'test' });
  addMod(s, { uid: corbeau, stat: 'cantLeave', amount: 0, until: 'turn', source: 'test' });
  assert.equal(koByEffect(effectOf(s, 0), betty), false, 'effet adverse');
  assert.equal(removeByEffect(effectOf(s, 0), corbeau, 'hand'), false, 'effet adverse');
  assert.equal(s.players[1].chars.length, 2);
  assert.equal(koByEffect(effectOf(s, 1), betty), true, 'effet de son propriétaire');
  assert.equal(removeByEffect(effectOf(s, 1), corbeau, 'hand'), true, 'effet de son propriétaire');
  coherent(s);
});

test('effet permanent sur les cartes adverses', () => {
  withCards({ [MORLEY]: { oppAura: () => -1000 } }, () => {
    const s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setChars(g, 1, [{ num: BETTY }]);
    });
    assert.equal(power(s, s.players[1].chars[0].uid), 3000);
    assert.equal(power(s, s.players[0].chars[0].uid), 5000, 'pas sur ses propres cartes');
  });
});

test('Leader : deck DON!! de 6 cartes', () => {
  withCards({ [SABO]: { rules: { donDeck: 6 } } }, () => {
    let s = newGame({ decks: ['ST-35', 'ST-35'], names: ['A', 'B'], seed: 5, first: 0 });
    s = act(act(s, 'keep'), 'keep');
    assert.equal(s.players[0].donDeck + s.players[0].donActive, 6);
    coherent(s);
  });
});

test('Leader : victoire à deck vide, ou défaite seulement à la fin du tour', () => {
  const emptyDeck = (g: GameState) => {
    g.players[0].trash.push(...g.players[0].deck);
    g.players[0].deck = [];
  };
  assert.equal(scenario(['ST-35', 'ST-35'], emptyDeck).winner, 1, 'règle normale : défaite');
  withCards({ [SABO]: { rules: { deckOut: 'win' } } }, () => {
    assert.equal(scenario(['ST-35', 'ST-32'], emptyDeck).winner, 0);
  });
  withCards({ [SABO]: { rules: { deckOut: 'loseAtEndOfTurn' } } }, () => {
    let s = scenario(['ST-35', 'ST-32'], emptyDeck);
    assert.equal(s.winner, null);
    assert.equal(s.decision?.kind, 'main');
    s = act(s, 'end');
    assert.equal(s.winner, 1);
  });
});

test('construction d’un deck : les 6 decks sont valides, et chaque règle est vérifiée', () => {
  for (const deck of Object.values(DECKS)) assert.deepEqual(deckErrors(deck.leader, deck.cards), [], deck.id);
  const kuzan = DECKS['ST-33'];
  // 5 exemplaires
  const five = { ...kuzan.cards, 'ST33-003': 5, 'OP12-057': 3 };
  assert.match(deckErrors(kuzan.leader, five).join(' ; '), /5 exemplaires/);
  // carte autorisée en autant d'exemplaires qu'on veut (Pacifista OP01-075, bleu)
  const pacifista = { ...kuzan.cards, 'OP12-057': 0, 'OP12-052': 2, 'OP01-075': 6 };
  delete (pacifista as Record<string, number>)['OP12-057'];
  assert.deepEqual(deckErrors(kuzan.leader, pacifista), []);
  // couleurs : une carte multicolore doit avoir toutes ses couleurs sur le Leader
  const base: CardData = {
    number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Test', names: ['Test'], cost: 2, life: null,
    power: 3000, counter: 1000, colors: [], types: [], typeLabels: [], attributes: [], effect: '', trigger: null, effectEn: '-',
    triggerEn: null, keywords: [], blocks: ['5'],
  };
  loadCardData({
    'ZZ09-010': { ...base, number: 'ZZ09-010', colors: ['Red', 'Green'] },
    'ZZ09-011': { ...base, number: 'ZZ09-011', colors: ['Red', 'Black'] },
  });
  const sabo = DECKS['ST-35'];
  const swap = (num: string) => ({ ...sabo.cards, 'OP13-019': 3, [num]: 1 });
  assert.match(deckErrors(sabo.leader, swap('ZZ09-010')).join(' ; '), /couleur absente du Leader/);
  assert.deepEqual(deckErrors(sabo.leader, swap('ZZ09-011')), []);
  assert.match(deckErrors(sabo.leader, { ...sabo.cards, 'OP13-019': 3 }).join(' ; '), /49 cartes/);
  // restriction d'un Leader (comme Rayleigh OP12-001 : aucune carte de coût 5 ou plus)
  withCards({ [SABO]: { rules: { deckRestriction: (d) => ((d.cost ?? 0) >= 5 ? 'coût 5 ou plus interdit par le Leader' : null) } } }, () => {
    const errors = deckErrors(sabo.leader, sabo.cards);
    assert.ok(errors.length >= 3 && errors.every((e) => e.includes('coût 5 ou plus interdit')));
  });
});

test('[Double attaque] et [Exil] : la Vie touchée par une attaque ordinaire va toujours en main', () => {
  let s = scenario(['ST-35', 'ST-35'], (g) => {
    setChars(g, 0, [{ num: MORLEY }]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setLife(g, 1, [BETTY, CORBEAU, MORLEY]);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(s.players[1].life.length, 2);
});
