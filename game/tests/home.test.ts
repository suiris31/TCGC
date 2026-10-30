// Accueil de « Jouer » (game/ui/home/logic.ts, tâche R3.1) : parties interrompues proposées dans « Continuer »,
// progression de l'aventure, bilan des parties rapides
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { adventureProgress, chapterOf, interruptedChapter, interruptedQuick, quickRecord, since, type HomeGame } from '../ui/home/logic.ts';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function game(over: Partial<HomeGame> & { at?: number } = {}): HomeGame {
  const { at = 1, ...rest } = over;
  n++;
  return {
    id: `g${n}`, status: 'abandoned', startedAt: hoursAgo(at + 1), updatedAt: hoursAgo(at), turns: 5,
    config: { myDeck: 'ST-01', aiDeck: 'ST-32', level: 2, first: 'random' }, ...rest,
  };
}

const story = EAST_BLUE.chapters.filter((c) => !c.optional).sort((a, b) => a.order - b.order);
const morgan = EAST_BLUE.chapters.find((c) => c.id === 'eb-1-shells-town')!;
const adventureGame = (over: Partial<HomeGame> & { at?: number } = {}) =>
  game({ mode: 'aventure', config: { myDeck: 'PERSO-a', aiDeck: morgan.opponent.deck, level: morgan.opponent.level, first: 'random' }, ...over });

test('partie rapide interrompue : la dernière partie rapide, si elle n’est pas finie', () => {
  const left = game({ at: 2 });
  assert.equal(interruptedQuick([left], NOW)?.id, left.id);
  assert.equal(interruptedQuick([game({ status: 'playing' })], NOW)?.status, 'playing');
  // une partie finie commencée après : plus rien à reprendre
  assert.equal(interruptedQuick([left, game({ status: 'won', at: 0.5, startedAt: hoursAgo(1) })], NOW), undefined);
  assert.equal(interruptedQuick([game({ status: 'lost' })], NOW), undefined);
  assert.equal(interruptedQuick([], NOW), undefined);
});

test('partie rapide interrompue : ni entraînement, ni aventure, ni en ligne, ni trop ancienne, ni écartée', () => {
  assert.equal(interruptedQuick([game({ practice: { from: 'x', turn: 3 } })], NOW), undefined);
  assert.equal(interruptedQuick([game({ mode: 'online' })], NOW), undefined);
  assert.equal(interruptedQuick([adventureGame()], NOW), undefined);
  // ancienne partie d'aventure, d'avant le champ mode : reconnue à son adversaire
  assert.equal(interruptedQuick([game({ config: { myDeck: 'ST-01', aiDeck: 'AV-EB-MORGAN', level: 1, first: 'random' } })], NOW), undefined);
  assert.equal(interruptedQuick([game({ at: 24 * 15 })], NOW), undefined);
  const left = game();
  assert.equal(interruptedQuick([left], NOW, [left.id]), undefined);
  // une partie d'aventure plus récente ne cache pas la partie rapide
  assert.equal(interruptedQuick([left, adventureGame({ at: 0.1, startedAt: hoursAgo(0.2) })], NOW)?.id, left.id);
});

test('chapitre interrompu : la dernière partie d’aventure, avec le deck d’aventure actuel', () => {
  const left = adventureGame();
  assert.equal(chapterOf(left)?.chapter.id, morgan.id);
  assert.equal(interruptedChapter([left], 'PERSO-a', NOW)?.chapter.id, morgan.id);
  assert.equal(interruptedChapter([left], 'PERSO-b', NOW), undefined);
  assert.equal(interruptedChapter([left], null, NOW), undefined);
  assert.equal(interruptedChapter([left], 'PERSO-a', NOW, [left.id]), undefined);
  assert.equal(interruptedChapter([adventureGame({ status: 'won' })], 'PERSO-a', NOW), undefined);
  // défi bonus (deck du méta au niveau 4, noté aventure)
  const mihawk = EAST_BLUE.chapters.find((c) => c.id === 'eb-defi-mihawk')!;
  const challenge = adventureGame({ config: { myDeck: 'PERSO-a', aiDeck: mihawk.opponent.deck, level: mihawk.opponent.level, first: 'random' } });
  assert.equal(interruptedChapter([challenge], 'PERSO-a', NOW)?.chapter.id, mihawk.id);
});

test('bilan des parties rapides : finies, contre l’IA, hors entraînement', () => {
  const games = [game({ status: 'won' }), game({ status: 'lost' }), game({ status: 'won' }), game(), game({ status: 'won', mode: 'aventure' }),
    game({ status: 'won', practice: { from: null, turn: 2 } })];
  assert.deepEqual(quickRecord(games), { wins: 2, played: 3 });
});

test('progression de l’aventure : pas commencée, en cours, finie', () => {
  const fresh = adventureProgress({ arcs: {}, chapters: {}, boosters: [] });
  assert.equal(fresh.started, false);
  assert.equal(fresh.won, 0);
  assert.equal(fresh.total, story.length);
  assert.equal(fresh.next?.id, story[0].id);
  assert.equal(fresh.nextNumber, 1);

  const chapters = { [story[0].id]: { wins: 1 }, [story[1].id]: { wins: 2 }, 'eb-defi-mihawk': { wins: 0 } };
  const going = adventureProgress({ arcs: { 'east-blue': { started: true } }, chapters, boosters: [{}, {}] });
  assert.equal(going.started, true);
  assert.equal(going.won, 2);
  assert.equal(going.next?.id, story[2].id);
  assert.equal(going.nextNumber, 3);
  assert.equal(going.finished, false);
  assert.equal(going.boosters, 2);

  const all = Object.fromEntries(story.map((c) => [c.id, { wins: 1 }]));
  const done = adventureProgress({ arcs: { 'east-blue': { started: true } }, chapters: all, boosters: [] });
  assert.equal(done.finished, true);
  assert.equal(done.next, undefined);
  assert.equal(done.won, done.total);
  assert.equal(done.challengesLeft, EAST_BLUE.chapters.filter((c) => c.optional).length);
});

test('depuis quand', () => {
  assert.equal(since(hoursAgo(0), NOW), 'à l’instant');
  assert.equal(since(hoursAgo(0.5), NOW), 'il y a 30 min');
  assert.equal(since(hoursAgo(5), NOW), 'il y a 5 h');
  assert.equal(since(hoursAgo(30), NOW), 'hier');
  assert.equal(since(hoursAgo(24 * 4), NOW), 'il y a 4 jours');
});
