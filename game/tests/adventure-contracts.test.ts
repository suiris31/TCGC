// Contrats du mode Aventure (tâche 0 de l'étape 1) : données des arcs cohérentes avec le registre des decks, logique
// de progression (verrouillé / ouvert / gagné, défis bonus) et générateur de boosters provisoire
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARCS, findArc, findChapter } from '../adventure/arcs.ts';
import { ADVENTURE_DECKS, EAST_BLUE_REAL_DECKS } from '../adventure/decks.ts';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { arcFinished, chapterStatuses, currentChapter, requiredChapters } from '../adventure/progress.ts';
import type { Arc, Chapter } from '../adventure/types.ts';
import { LEVELS } from '../ai/search.ts';
import { BOOSTER_SIZE, boosterSets, DISPLAY_SIZE, openBooster, openDisplay } from '../boosters/open.ts';
import type { Rand } from '../boosters/types.ts';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';

// Tirage reproductible (mulberry32), comme le hasard des parties
function seeded(seed: number): Rand {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chapters = ARCS.flatMap((arc) => arc.chapters);

test('aventure : identifiants des arcs et des chapitres uniques, findArc et findChapter', () => {
  assert.equal(new Set(ARCS.map((a) => a.id)).size, ARCS.length);
  assert.equal(new Set(chapters.map((c) => c.id)).size, chapters.length);
  for (const arc of ARCS) {
    assert.equal(findArc(arc.id), arc);
    assert.equal(new Set(arc.chapters.map((c) => c.order)).size, arc.chapters.length, `${arc.id} : deux chapitres au même rang`);
    for (const chapter of arc.chapters) assert.deepEqual(findChapter(chapter.id), { arc, chapter });
  }
  assert.equal(findChapter('chapitre-inconnu'), undefined);
  assert.equal(findArc('mer-inconnue'), undefined);
});

test('aventure : decks des chapitres et de départ jouables (registre), niveaux, positions, récompenses', () => {
  for (const arc of ARCS) {
    if (arc.starterDeck) assert.ok(DECKS[arc.starterDeck], `${arc.id} : deck de départ ${arc.starterDeck} absent de DECKS`);
    assert.ok(boosterSets().includes(arc.boosterSet), `${arc.id} : pas de booster ${arc.boosterSet}`);
    const ids = new Set(arc.chapters.map((c) => c.id));
    for (const c of arc.chapters) {
      assert.ok(DECKS[c.opponent.deck], `${c.id} : deck ${c.opponent.deck} absent de DECKS`);
      assert.ok(LEVELS[c.opponent.level], `${c.id} : niveau ${c.opponent.level}`);
      assert.ok(c.map.x >= 0 && c.map.x <= 1 && c.map.y >= 0 && c.map.y <= 1, `${c.id} : position hors de la zone`);
      assert.ok(c.intro.length && c.victory.length && c.defeat.length, `${c.id} : dialogue manquant`);
      for (const id of c.requires ?? []) assert.ok(ids.has(id) && id !== c.id, `${c.id} : chapitre requis inconnu ${id}`);
      for (const r of c.rewards) {
        if (r.kind === 'booster') assert.ok(boosterSets().includes(r.set) && r.count > 0, `${c.id} : booster ${r.set}`);
        if (r.kind === 'card') assert.ok(CARDS[r.number] && r.count > 0, `${c.id} : carte ${r.number}`);
        if (r.kind === 'deck') assert.ok(DECKS[r.deck], `${c.id} : deck ${r.deck}`);
      }
    }
  }
  assert.ok(EAST_BLUE.chapters.some((c) => !c.optional), 'East Blue sans chapitre obligatoire');
  // les vrais decks (tâche 1.2) existent dans ADVENTURE_DECKS
  for (const [key, deck] of Object.entries(EAST_BLUE_REAL_DECKS)) {
    assert.ok(key === 'starterDeck' || findChapter(key), `chapitre inconnu ${key}`);
    if (key !== 'starterDeck') assert.ok(ADVENTURE_DECKS[deck], `${key} : vrai deck ${deck} absent de ADVENTURE_DECKS`);
  }
});

// Arc de test : 1 -> 2 -> (défi après 2) -> 3, et un dernier chapitre qui demande 3 et le défi
const chapter = (id: string, order: number, extra: Partial<Chapter> = {}): Chapter => ({
  id, order, title: id, place: id, map: { x: 0.5, y: 0.5 }, opponent: { name: id, deck: 'ST-31', level: 1 },
  intro: [], victory: [], defeat: [], rewards: [], ...extra,
});
const ARC: Arc = {
  id: 'test', title: 'Test', region: 'test', boosterSet: 'OP03',
  // dans le désordre : seul `order` compte
  chapters: [chapter('c3', 4), chapter('c1', 1), chapter('defi', 3, { optional: true }), chapter('c2', 2), chapter('fin', 5, { requires: ['c3', 'defi'] })],
};

test('progression : premier chapitre ouvert, la suite verrouillée', () => {
  assert.deepEqual(chapterStatuses(ARC, new Set()), { c1: 'open', c2: 'locked', defi: 'locked', c3: 'locked', fin: 'locked' });
  assert.equal(currentChapter(ARC, new Set()), 'c1');
  assert.deepEqual(requiredChapters(ARC, ARC.chapters[1]), []);
});

test('progression : une victoire ouvre le chapitre suivant, le défi bonus ne bloque pas l’histoire', () => {
  assert.deepEqual(chapterStatuses(ARC, new Set(['c1'])), { c1: 'won', c2: 'open', defi: 'locked', c3: 'locked', fin: 'locked' });
  // après c2 : le défi et c3 s'ouvrent (c3 suit le dernier chapitre obligatoire, pas le défi)
  const afterC2 = chapterStatuses(ARC, new Set(['c1', 'c2']));
  assert.equal(afterC2.defi, 'open');
  assert.equal(afterC2.c3, 'open');
  assert.equal(currentChapter(ARC, new Set(['c1', 'c2'])), 'c3');
  assert.deepEqual(requiredChapters(ARC, ARC.chapters[0]), ['c2']);
  // `requires` remplace la règle par défaut : la fin demande aussi le défi
  assert.equal(chapterStatuses(ARC, new Set(['c1', 'c2', 'c3'])).fin, 'locked');
  assert.equal(chapterStatuses(ARC, new Set(['c1', 'c2', 'c3', 'defi'])).fin, 'open');
  assert.equal(arcFinished(ARC, new Set(['c1', 'c2', 'c3', 'defi'])), false);
  assert.equal(arcFinished(ARC, new Set(['c1', 'c2', 'c3', 'fin'])), true);
  assert.equal(currentChapter(ARC, new Set(['c1', 'c2', 'c3', 'defi', 'fin'])), undefined);
});

test('progression d’East Blue : l’histoire se gagne dans l’ordre sans les défis, qui s’ouvrent en chemin', () => {
  const order = [...EAST_BLUE.chapters].sort((a, b) => a.order - b.order);
  const story = order.filter((c) => !c.optional).map((c) => c.id);
  const wins = new Set<string>();
  for (const id of story) {
    assert.equal(currentChapter(EAST_BLUE, wins), id);
    assert.equal(chapterStatuses(EAST_BLUE, wins)[id], 'open');
    wins.add(id);
  }
  assert.equal(arcFinished(EAST_BLUE, wins), true);
  // un défi qui ne demande que des chapitres de l'histoire est ouvert à la fin de l'arc
  for (const c of order.filter((c) => c.optional && requiredChapters(EAST_BLUE, c).every((id) => story.includes(id)))) {
    assert.equal(chapterStatuses(EAST_BLUE, wins)[c.id], 'open', c.id);
  }
});

// Ce que tout générateur doit respecter (le provisoire comme celui de la tâche 1.5, qui ajoute ses propres tests)
test('boosters : 12 cartes du catalogue, même tirage = même booster', () => {
  assert.ok(boosterSets().includes('OP03'));
  const a = openBooster('OP03', seeded(42));
  assert.deepEqual(openBooster('OP03', seeded(42)), a);
  assert.notDeepEqual(openBooster('OP03', seeded(43)), a);
  assert.equal(a.set, 'OP03');
  assert.equal(a.cards.length, BOOSTER_SIZE);
  for (const c of a.cards) {
    assert.ok(CARDS[c.number], `${c.number} absent du catalogue`);
    assert.ok(c.rarity && c.variant, `${c.number} : rareté ou version vide`);
  }
  assert.throws(() => openBooster('OP99', seeded(1)));
});

test('boosters : un display de 24, les cartes communes plus fréquentes que les rares', () => {
  const display = openDisplay('OP03', seeded(7));
  assert.equal(display.length, DISPLAY_SIZE);
  assert.deepEqual(openDisplay('OP03', seeded(7)), display);
  const count: Record<string, number> = {};
  for (const card of display.flatMap((b) => b.cards)) count[card.rarity] = (count[card.rarity] ?? 0) + 1;
  assert.ok(count.C > count.UC && count.UC > (count.SR ?? 0), JSON.stringify(count));
});
