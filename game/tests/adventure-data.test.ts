// Données de l'arc East Blue (tâche 1.2) : vrais decks des adversaires légaux et dans le budget des cartes à coder,
// correspondance chapitre -> vrai deck, dialogues, portraits et récompenses. Les decks ne sont pas encore jouables
// (cartes codées à la vague 1B) : on vérifie les règles de construction (deckErrors), pas playableErrors.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findChapter } from '../adventure/arcs.ts';
import { ADVENTURE_DECKS, EAST_BLUE_REAL_DECKS } from '../adventure/decks.ts';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { boosterSets } from '../boosters/open.ts';
import { ECONOMY } from '../economy/config.ts';
import { CARDS, cardStatus } from '../engine/cards/index.ts';
import { deckErrors } from '../engine/deckRules.ts';
import { DECKS, deckSize } from '../engine/decks.ts';

// OP03 et ST-01 sont entièrement codés à l'étape 1 (tâches 1.8 à 1.14)
const stepCard = (num: string) => num.startsWith('OP03-') || num.startsWith('ST01-');
const outside = (id: string) => {
  const d = ADVENTURE_DECKS[id];
  return [d.leader, ...Object.keys(d.cards)].filter((n) => !stepCard(n));
};

// Listes des cartes à coder hors OP03 et ST-01 (game/docs/aventure-east-blue.md) : A pour la tâche 1.15, B pour 1.16,
// chacune formée de decks entiers
const LIST_A = ['AV-EB-MORGAN', 'AV-EB-KURO', 'AV-EB-SMOKER'];
const LIST_B = ['AV-EB-BAGGY', 'AV-EB-BAGGY-ALVIDA', 'AV-EB-KRIEG', 'AV-EB-ARLONG'];

test('decks de l’aventure : légaux, 50 cartes, identifiants AV-EB, série AVENTURE, absents du registre', () => {
  const ids = Object.keys(ADVENTURE_DECKS);
  assert.ok(ids.length >= 6);
  for (const [id, d] of Object.entries(ADVENTURE_DECKS)) {
    assert.equal(d.id, id);
    assert.match(id, /^AV-EB-[A-Z-]+$/);
    assert.equal(d.series, 'AVENTURE');
    assert.equal(deckSize(d), 50, id);
    assert.deepEqual(deckErrors(d.leader, d.cards), [], id);
    // la tâche 1.19 les ajoute au registre : pas de collision avec un deck existant
    assert.ok(!DECKS[id] || DECKS[id] === d, `${id} existe déjà dans DECKS`);
  }
});

test('decks de l’aventure : 50 cartes au plus hors OP03 et ST-01, réparties en deux listes A et B sans carte commune', () => {
  assert.deepEqual([...LIST_A, ...LIST_B].sort(), Object.keys(ADVENTURE_DECKS).sort(), 'chaque deck est dans une liste');
  const a = new Set(LIST_A.flatMap(outside));
  const b = new Set(LIST_B.flatMap(outside));
  assert.ok(a.size + b.size <= 50, `${a.size + b.size} cartes hors OP03 et ST-01`);
  assert.deepEqual([...a].filter((n) => b.has(n)), [], 'carte à coder dans les deux listes');
});

test('vrais decks : chaque chapitre obligatoire en a un, ST-01 au départ, tous les decks de l’aventure servent', () => {
  assert.equal(EAST_BLUE_REAL_DECKS.starterDeck, 'ST-01');
  for (const c of EAST_BLUE.chapters.filter((ch) => !ch.optional)) {
    assert.ok(ADVENTURE_DECKS[EAST_BLUE_REAL_DECKS[c.id]], `${c.id} : pas de vrai deck`);
  }
  for (const [key, id] of Object.entries(EAST_BLUE_REAL_DECKS)) {
    if (key === 'starterDeck') continue;
    assert.ok(findChapter(key), `chapitre inconnu ${key}`);
    assert.ok(ADVENTURE_DECKS[id], `${key} : ${id} absent de ADVENTURE_DECKS`);
  }
  const used = new Set(Object.values(EAST_BLUE_REAL_DECKS));
  for (const id of Object.keys(ADVENTURE_DECKS)) assert.ok(used.has(id), `${id} n'est le vrai deck d'aucun chapitre`);
  // un défi sans vrai deck joue déjà un deck du registre, à son niveau (Mihawk : META-MIHAWK-2026-10)
  for (const c of EAST_BLUE.chapters.filter((ch) => ch.optional && !EAST_BLUE_REAL_DECKS[ch.id])) {
    assert.ok(DECKS[c.opponent.deck], c.id);
  }
});

test('East Blue : 6 chapitres obligatoires dans l’ordre de l’histoire, 1 ou 2 défis, identifiants du contrat', () => {
  const ids = EAST_BLUE.chapters.map((c) => c.id);
  for (const id of ['eb-1-shells-town', 'eb-2-orange-town', 'eb-3-sirop', 'eb-4-baratie', 'eb-defi-mihawk', 'eb-5-arlong-park', 'eb-6-loguetown']) {
    assert.ok(ids.includes(id), `identifiant du contrat absent : ${id}`);
  }
  const story = [...EAST_BLUE.chapters].sort((x, y) => x.order - y.order).filter((c) => !c.optional);
  assert.deepEqual(story.map((c) => c.place), ['Shells Town', 'Orange Town', 'Village de Sirop', 'Baratie', 'Arlong Park', 'Loguetown']);
  const challenges = EAST_BLUE.chapters.filter((c) => c.optional).length;
  assert.ok(challenges >= 1 && challenges <= 2, `${challenges} défis`);
  // difficulté croissante le long de l'histoire
  for (let i = 1; i < story.length; i++) assert.ok(story[i].opponent.level >= story[i - 1].opponent.level, story[i].id);
  // positions distinctes sur la carte
  assert.equal(new Set(EAST_BLUE.chapters.map((c) => `${c.map.x},${c.map.y}`)).size, EAST_BLUE.chapters.length);
});

test('East Blue : dialogues de 3 à 6 répliques, définitifs, portraits de cartes jouables à l’étape 1', () => {
  // un portrait doit pouvoir s'afficher dans le navigateur, qui ne reçoit que les cartes jouables
  const adventureCards = new Set(Object.values(ADVENTURE_DECKS).flatMap((d) => [d.leader, ...Object.keys(d.cards)]));
  for (const c of EAST_BLUE.chapters) {
    for (const [part, lines] of Object.entries({ intro: c.intro, victory: c.victory, defeat: c.defeat })) {
      assert.ok(lines.length >= 3 && lines.length <= 6, `${c.id} ${part} : ${lines.length} répliques`);
      for (const line of lines) {
        assert.ok(line.text.trim() && !/provisoire/i.test(line.text), `${c.id} ${part} : « ${line.text} »`);
        assert.ok(line.who || !line.card, `${c.id} : la narration n'a pas de portrait`);
        if (!line.card) continue;
        assert.ok(CARDS[line.card], `${c.id} : portrait ${line.card} absent du catalogue`);
        assert.ok(stepCard(line.card) || adventureCards.has(line.card) || cardStatus(line.card) !== 'todo', `${c.id} : portrait ${line.card} pas jouable`);
      }
    }
  }
});

test('East Blue : récompenses à la première victoire (boosters OP03, recrues jouables dans le deck de départ)', () => {
  let total = 0;
  for (const c of EAST_BLUE.chapters) {
    const packs = c.rewards.filter((r) => r.kind === 'booster');
    assert.ok(packs.length, `${c.id} : pas de booster`);
    for (const r of c.rewards) {
      if (r.kind === 'booster') {
        assert.ok(boosterSets().includes(r.set) && r.count > 0, `${c.id} : booster ${r.set}`);
        // le défi ultime de Mihawk vaut un display entier (décision de l'utilisateur, tâche 2.7) : compté à part
        if (c.id === 'eb-defi-mihawk') assert.equal(r.count, ECONOMY.shop.OP03.boostersPerDisplay, 'défi ultime : un display');
        else total += r.count;
      }
      if (r.kind === 'card') {
        assert.ok(CARDS[r.number] && r.count > 0, `${c.id} : carte ${r.number}`);
        assert.ok(stepCard(r.number) || cardStatus(r.number) !== 'todo', `${c.id} : recrue ${r.number} pas jouable`);
        // le deck de départ (ST-01) est rouge : une recrue doit pouvoir y entrer
        assert.deepEqual(CARDS[r.number].colors, ['Red'], `${c.id} : recrue ${r.number}`);
      }
    }
  }
  assert.ok(total >= 15 && total <= 20, `${total} boosters sur l'arc (hors défi ultime)`);
});
