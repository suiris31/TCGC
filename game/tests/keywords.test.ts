// Mots-clés gérés par le moteur pour toutes les cartes (lus dans le texte en VO) et [Déclenchement] génériques.
// Les mots-clés testés sont donnés pour l'occasion à des cartes qui ne les ont pas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CARDS, cardStatus, loadCardData } from '../engine/cards/index.ts';
import type { CardData, CardDef, GameState } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, hasOption, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

function withCards(changes: Record<string, Partial<CardDef>>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(changes).map((n) => [n, CARDS[n]]));
  try {
    for (const [n, c] of Object.entries(changes)) CARDS[n] = { ...CARDS[n], ...c };
    run();
  } finally {
    Object.assign(CARDS, saved);
  }
}

const MORLEY = 'OP12-093';   // 5000, aucun effet déclenché
const BETTY = 'OP12-090';    // 4000
const CORBEAU = 'ST35-003';
const HACK = 'ST35-001';     // [Bloqueur]

// Morley attaque le Leader adverse (Sabo, 5000 avec 3 Vies) ; l'adversaire n'a ni Personnage ni main
function morleyAttacks(lifeNums: string[]): GameState {
  let s = scenario(['ST-35', 'ST-35'], (g) => {
    setChars(g, 0, [{ num: MORLEY }]);
    setChars(g, 1, []);
    setHand(g, 1, []);
    setLife(g, 1, lifeNums);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  return s;
}

test('[Double attaque] : 2 dégâts au Leader', () => {
  withCards({ [MORLEY]: { keywords: ['Double Attack'] } }, () => {
    const s = morleyAttacks([BETTY, CORBEAU, MORLEY]);
    assert.equal(s.players[1].life.length, 1);
    assert.equal(s.players[1].hand.length, 2);
    coherent(s);
  });
  const s = morleyAttacks([BETTY, CORBEAU, MORLEY]);
  assert.equal(s.players[1].life.length, 2, 'sans le mot-clé : 1 dégât');
});

test('[Double attaque] avec 1 seule Vie : le Leader est touché sans Vie, défaite', () => {
  withCards({ [MORLEY]: { keywords: ['Double Attack'] } }, () => {
    const s = morleyAttacks([BETTY]);
    assert.equal(s.winner, 0);
  });
});

test('[Exil] : la carte de Vie va dans la Défausse, sans [Déclenchement]', () => {
  withCards({ [MORLEY]: { keywords: ['Banish'] }, [BETTY]: { trigger: 'Jouez cette carte.', triggerEn: 'Play this card.' } }, () => {
    const s = morleyAttacks([BETTY, CORBEAU, MORLEY]);
    assert.notEqual(s.decision?.tag, 'trigger');
    assert.equal(s.players[1].life.length, 2);
    assert.equal(s.players[1].hand.length, 0);
    assert.ok(s.players[1].trash.some((c) => c.num === BETTY));
    coherent(s);
  });
});

test('[Imblocable] : l’adversaire ne peut pas bloquer', () => {
  const setup = (g: GameState) => {
    setChars(g, 0, [{ num: MORLEY }]);
    setChars(g, 1, [{ num: HACK }]);
    setHand(g, 1, []);
  };
  let s = scenario(['ST-35', 'ST-35'], setup);
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  assert.equal(s.decision?.kind, 'blocker', 'sans le mot-clé, [Bloqueur] est proposé');
  withCards({ [MORLEY]: { keywords: ['Unblockable'] } }, () => {
    let t = scenario(['ST-35', 'ST-35'], setup);
    t = attack(t, t.players[0].chars[0].uid, t.players[1].leader.uid);
    assert.notEqual(t.decision?.kind, 'blocker');
    coherent(t);
  });
});

test('[Initiative] lue dans le texte : attaque le tour où il est joué', () => {
  withCards({ [BETTY]: { keywords: ['Rush'] } }, () => {
    let s = scenario(['ST-35', 'ST-35'], (g) => {
      setChars(g, 0, []);
      setHand(g, 0, [BETTY]);
      setDon(g, 0, 10);
    });
    s = play(s, BETTY);
    const betty = s.players[0].chars[0].uid;
    assert.ok(hasOption(s, `attack:${betty}`));
  });
});

test('[Déclenchement] « jouez cette carte » sans code propre : la carte est jouée depuis la Vie', () => {
  withCards({ [BETTY]: { trigger: 'Jouez cette carte.', triggerEn: 'Play this card.' } }, () => {
    let s = morleyAttacks([BETTY, CORBEAU, MORLEY]);
    expectTag(s, 'trigger');
    s = choose(s, 'trigger');
    assert.ok(s.players[1].chars.some((c) => c.num === BETTY));
    assert.equal(s.players[1].hand.length, 0);
    coherent(s);
  });
});

test('statut des cartes : codée, jouable d’office (mots-clés seuls, aucun effet) ou à faire', () => {
  const base: CardData = {
    number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Test', names: ['Test'], cost: 2, life: null,
    power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '', trigger: null,
    effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
  };
  loadCardData({
    'ZZ09-001': { ...base, number: 'ZZ09-001' },
    'ZZ09-002': { ...base, number: 'ZZ09-002', effectEn: '[Blocker] (After your opponent declares an attack, you may rest this card.)', keywords: ['Blocker'] },
    'ZZ09-003': { ...base, number: 'ZZ09-003', effectEn: '[Rush] [Banish]', keywords: ['Rush', 'Banish'], triggerEn: 'Play this card.' },
    'ZZ09-004': { ...base, number: 'ZZ09-004', effectEn: '[DON!! x1] This Character gains [Blocker].' },
    'ZZ09-005': { ...base, number: 'ZZ09-005', effectEn: '[Blocker]\n[On Play] Draw 1 card.', keywords: ['Blocker'] },
    'ZZ09-006': { ...base, number: 'ZZ09-006', triggerEn: 'Draw 1 card.' },
  });
  assert.equal(cardStatus('OP13-004'), 'coded');
  assert.equal(cardStatus('ZZ09-001'), 'auto', 'aucun effet');
  assert.equal(cardStatus('ZZ09-002'), 'auto', '[Bloqueur] seul');
  assert.equal(cardStatus('ZZ09-003'), 'auto', 'mots-clés et [Déclenchement] « jouez cette carte »');
  assert.equal(cardStatus('ZZ09-004'), 'todo', 'mot-clé sous condition');
  assert.equal(cardStatus('ZZ09-005'), 'todo', 'un effet en plus du mot-clé');
  assert.equal(cardStatus('ZZ09-006'), 'todo', '[Déclenchement] propre à la carte');
});
