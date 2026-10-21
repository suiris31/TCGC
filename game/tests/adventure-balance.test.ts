// Vrais decks de l'aventure (tâche 1.19) : enregistrés à la fin du registre, jouables, réservés à l'aventure (ni choix
// libre, ni « Aléatoire », ni salon en ligne), branchés sur les chapitres d'East Blue ; aides à l'IA simple pour les
// cartes de l'étape.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADVENTURE_DECKS, EAST_BLUE_REAL_DECKS } from '../adventure/decks.ts';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import { BASE_STYLES } from '../ai/style.ts';
import { playableErrors } from '../engine/deckRules.ts';
import { DECKS, freeDeckIds, isAdventureOnly } from '../engine/decks.ts';
import { checkDeck, MatchError } from '../online/match.ts';
import { GUIDES } from '../ui/deckGuides.ts';
import { attack, choose, expectTag, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';
import type { GameState } from '../engine/types.ts';

const ids = Object.keys(ADVENTURE_DECKS);

test('decks de l’aventure : à la fin du registre, entièrement jouables', () => {
  const all = Object.keys(DECKS).filter((id) => !DECKS[id].series.startsWith('TEST'));
  // à la fin (l'ordre de DECKS sert aux graines des parties de vérification), et les mêmes listes que decks.ts
  assert.deepEqual(all.slice(-ids.length), ids);
  for (const id of ids) {
    assert.equal(DECKS[id], ADVENTURE_DECKS[id]);
    assert.deepEqual(playableErrors(DECKS[id].leader, DECKS[id].cards), [], id);
    assert.ok(BASE_STYLES[id], `${id} : pas de style d'IA`);
  }
});

test('decks de l’aventure : absents du choix libre et refusés en ligne', () => {
  for (const id of ids) {
    assert.ok(isAdventureOnly(id), id);
    assert.ok(!freeDeckIds().includes(id), id);
    assert.throws(() => checkDeck(id), MatchError, id);
  }
  // les autres decks du registre restent proposés, ST-01 compris (deck pour débutant)
  for (const id of ['ST-35', 'META-SABO-2026-10', 'ST-01']) {
    assert.ok(freeDeckIds().includes(id), id);
    assert.equal(checkDeck(id), id);
  }
});

test('East Blue : chaque chapitre joue son vrai deck, départ avec ST-01, Mihawk garde son deck du méta', () => {
  assert.equal(EAST_BLUE.starterDeck, EAST_BLUE_REAL_DECKS.starterDeck);
  for (const c of EAST_BLUE.chapters) {
    assert.equal(c.opponent.deck, EAST_BLUE_REAL_DECKS[c.id] ?? 'META-MIHAWK-2026-10', c.id);
    assert.ok(DECKS[c.opponent.deck], c.id);
  }
});

// ---------- Aides à l'IA simple ----------

const kuro = (leaderRested: boolean) => scenario(['AV-EB-KURO', 'ST-21'], (g) => {
  g.players[0].leader.rested = leaderRested;
  setHand(g, 0, []);
  setDon(g, 0, 3);
  setChars(g, 0, [{ num: 'OP03-023' }, { num: 'OP03-035' }]);
  setChars(g, 1, [{ num: 'ST21-006' }]);
});

test('IA : le Leader Kuro (OP03-021) ne se redresse qu’après avoir attaqué', () => {
  let s = kuro(false);
  assert.ok(s.decision!.options.some((o) => o.id.startsWith('act:')), 'effet proposé');
  assert.ok(!heuristicChooser(s, s.decision!).startsWith('act:'), 'Leader redressé : pas d’effet');
  s = kuro(true);
  assert.equal(heuristicChooser(s, s.decision!), `act:${s.players[0].leader.uid}`);
});

// L'adversaire (ST-21) attaque mon Leader : la carte de Vie révélée a un [Déclenchement]
function hitMe(deck: string, life: string[]): GameState {
  let s = scenario([deck, 'ST-21'], (g) => {
    setHand(g, 0, []);
    setChars(g, 0, []);
    setLife(g, 0, life);
    setChars(g, 1, [{ num: 'ST21-006' }]);
    setDon(g, 1, 0);
  }, 1);
  s = attack(s, s.players[1].chars[0].uid, s.players[0].leader.uid);
  if (s.decision?.kind === 'counter') s = choose(s, 'pass');
  return s;
}

test('IA : Hatchan (OP03-033) joué par son [Déclenchement] seulement avec un Leader {East Blue}', () => {
  let s = hitMe('AV-EB-ARLONG', ['OP03-033', 'OP03-035']);
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'trigger');
  // mêmes cartes avec le Leader Luffy de ST-01 (pas {East Blue})
  const DECK = 'TEST-1.19-LUFFY';
  DECKS[DECK] = { ...ADVENTURE_DECKS['AV-EB-ARLONG'], id: DECK, series: 'TEST', leader: 'ST01-001' };
  s = hitMe(DECK, ['OP03-033', 'OP03-035']);
  expectTag(s, 'trigger');
  assert.equal(heuristicChooser(s, s.decision!), 'hand');
  delete DECKS[DECK];
});

test('IA : Zambai (OP03-063) ne paie DON!! −1 qu’avec un Leader {Water Seven} (choix 211)', () => {
  const zambai = (deck: string) => {
    const s = scenario([deck, 'ST-21'], (g) => {
      setHand(g, 0, ['OP03-063']);
      setDon(g, 0, 5);
    });
    const play = s.decision!.options.find((o) => o.id.startsWith('play:') && s.players[0].hand.some((c) => c.uid === o.uid && c.num === 'OP03-063'))!;
    return choose(s, play.id);
  };
  // decks d'essai : les cartes de ST-34 et 4 Zambai, avec le Leader Iceburg ({Water Seven}) ou Katakuri
  const cards = { ...DECKS['ST-34'].cards, 'OP03-063': 4 };
  const DECK = 'TEST-1.19-ICEBURG';
  DECKS[DECK] = { id: DECK, name: 'Essai', series: 'TEST', leader: 'OP03-058', cards };
  let s = zambai(DECK);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'yes');
  const OTHER = 'TEST-1.19-KATAKURI';
  DECKS[OTHER] = { id: OTHER, name: 'Essai', series: 'TEST', leader: 'OP11-062', cards };
  s = zambai(OTHER);
  expectTag(s, 'may');
  assert.equal(heuristicChooser(s, s.decision!), 'no');
  delete DECKS[DECK];
  delete DECKS[OTHER];
});

test('guides des decks de l’aventure : les cartes des combinaisons sont dans le deck', () => {
  for (const id of ids) {
    const guide = GUIDES[id];
    assert.ok(guide, `${id} : pas de guide`);
    const deck = DECKS[id];
    for (const combo of guide.combos) {
      for (const num of combo.cards) assert.ok(num === deck.leader || deck.cards[num], `${id} « ${combo.title} » : ${num} absent du deck`);
    }
  }
});
