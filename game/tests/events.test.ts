// Effets « quand ... » : événements annoncés par le moteur, condition vérifiée au moment de l'événement, [Une fois par
// tour], effets du joueur actif d'abord (8-6-1), ordre au choix du joueur pour ses effets déclenchés ensemble (8-6-1-1).
// Les effets testés sont ajoutés pour l'occasion à des cartes qui n'en ont pas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CARDS } from '../engine/cards/index.ts';
import { log } from '../engine/rules.ts';
import type { GameEvent, GameState, WhenEffect } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, play, scenario, setChars, setDon, setHand } from './helpers.ts';

function withWhen(effects: Record<string, WhenEffect[]>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(effects).map((n) => [n, CARDS[n]]));
  try {
    for (const [n, when] of Object.entries(effects)) CARDS[n] = { ...CARDS[n], when };
    run();
  } finally {
    Object.assign(CARDS, saved);
  }
}

const say = (text: string): WhenEffect['run'] => (ctx) => log(ctx.s, ctx.me, text);
const lines = (s: GameState, text: string) => s.log.flatMap((l, i) => (l.text.includes(text) ? [i] : []));

// Morley (OP12-093) et Belo Betty (OP12-090) n'ont pas d'effet déclenché ; Inazuma (OP13-005) a un effet [Jouée]
const MORLEY = 'OP12-093';
const BETTY = 'OP12-090';
const INAZUMA = 'OP13-005';

test('quand l’adversaire joue un Personnage : condition vraie au moment de l’événement, une fois par tour', () => {
  withWhen({ [MORLEY]: [{ on: 'play', once: 'test', if: (_s, owner, _self, e) => e.player !== owner, run: say('Morley réagit') }] }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setHand(g, 1, [INAZUMA, BETTY]);
      setDon(g, 1, 10);
    }, 1);
    s = play(s, INAZUMA, 1);
    assert.equal(lines(s, 'Morley réagit').length, 1);
    // le joueur actif résout ses effets d'abord (8-6-1) : [Jouée] d'Inazuma, puis Morley
    assert.ok(lines(s, 'effet [Jouée] de Inazuma')[0] < lines(s, 'Morley réagit')[0]);
    s = play(s, BETTY, 1);
    assert.equal(lines(s, 'Morley réagit').length, 1, '[Une fois par tour]');
    coherent(s);
  });
});

test('condition fausse : l’effet ne se déclenche pas', () => {
  withWhen({ [MORLEY]: [{ on: 'play', if: (_s, owner, _self, e) => e.player !== owner, run: say('Morley réagit') }] }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setHand(g, 0, [BETTY]);
      setDon(g, 0, 10);
    });
    s = play(s, BETTY);
    assert.equal(lines(s, 'Morley réagit').length, 0);
    assert.equal(s.decision?.kind, 'main');
  });
});

test('plusieurs effets différents du même joueur déclenchés ensemble : il choisit l’ordre (8-6-1-1)', () => {
  withWhen({ [MORLEY]: [{ on: 'play', if: (_s, owner, self, e) => e.player === owner && e.uid !== self.uid, run: say('Morley réagit') }] }, () => {
    const start = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setHand(g, 0, [INAZUMA]);
      setDon(g, 0, 10);
    });
    let s = play(start, INAZUMA);
    expectTag(s, 'order');
    assert.deepEqual(s.decision!.options.map((o) => o.id).sort(), [`first:${INAZUMA}`, `first:${MORLEY}`].sort());
    s = choose(s, `first:${MORLEY}`);
    assert.ok(lines(s, 'Morley réagit')[0] < lines(s, 'effet [Jouée] de Inazuma')[0], 'Morley d’abord, comme choisi');

    s = choose(play(start, INAZUMA), `first:${INAZUMA}`);
    assert.ok(lines(s, 'effet [Jouée] de Inazuma')[0] < lines(s, 'Morley réagit')[0], 'Inazuma d’abord, comme choisi');
    coherent(s);
  });
});

test('plusieurs exemplaires d’une même carte : pas de question d’ordre', () => {
  withWhen({ [MORLEY]: [{ on: 'play', if: (_s, owner, self, e) => e.player === owner && e.uid !== self.uid, run: say('Morley réagit') }] }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }, { num: MORLEY }]);
      setHand(g, 0, [BETTY]);
      setDon(g, 0, 10);
    });
    s = play(s, BETTY);
    assert.equal(s.decision?.kind, 'main');
    assert.equal(lines(s, 'Morley réagit').length, 2);
  });
});

test('mise KO en combat : l’événement dit qui, comment et par qui', () => {
  const seen: GameEvent[] = [];
  withWhen({ [MORLEY]: [{ on: 'ko', if: () => true, run: (_ctx, e) => { seen.push(e); } }] }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, [{ num: MORLEY }]);
      setChars(g, 1, [{ num: BETTY, extra: { rested: true } }]);
      setHand(g, 1, []);
    });
    const morley = s.players[0].chars[0].uid;
    const betty = s.players[1].chars[0].uid;
    s = attack(s, morley, betty);
    while (s.decision && s.decision.player === 1) s = choose(s, (o) => o.id === 'noblock' || o.id === 'pass');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].player, 1);
    assert.equal(seen[0].uid, betty);
    assert.equal(seen[0].cause, 'battle');
    assert.equal(seen[0].by, 0);
    coherent(s);
  });
});
