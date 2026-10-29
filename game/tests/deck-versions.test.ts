// Visuels d'un deck, l'éditeur (tâche R3.12) : versions proposées pour une carte et leurs noms (game/ui/builder/
// versions.ts), versions permises dans un deck d'aventure, et visuel de chaque carte sur le plateau
// (game/ui/table/cardArt.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeckLooks } from '../data/looks.ts';
import type { Card, FieldCard, GameState } from '../engine/types.ts';
import { artPath, artVersions, canChoose, holdVariants, kindLabel } from '../ui/builder/versions.ts';
import { artChoice, cardOwner } from '../ui/table/cardArt.ts';

// Carte en VF, avec deux parallèles VF et des impressions VO (comme OP01-120 dans le catalogue)
const SHANKS = {
  imageId: 'OP01-120_p1', lang: 'fr' as const, versions: [
    { variant: 'base', imageId: 'OP01-120_p1', lang: 'fr' as const },
    { variant: 'parallele-fr-p2', imageId: 'OP01-120_p2', lang: 'fr' as const },
    { variant: 'parallele-fr-p3', imageId: 'OP01-120_p3', lang: 'fr' as const },
    { variant: 'normale-en', imageId: 'OP01-120', lang: 'en' as const },
    { variant: 'parallele-en-p1', imageId: 'OP01-120_p1', lang: 'en' as const },
    { variant: 'reedition-en-r1', imageId: 'OP01-120_r1', lang: 'en' as const },
    { variant: 'sp-fr-p4', imageId: 'OP01-120_p4', lang: 'fr' as const },
  ],
};

test('versions : la version de base d’abord, puis celles du catalogue, avec un nom lisible', () => {
  const list = artVersions('OP01-120', SHANKS);
  assert.deepEqual(list.map((v) => v.variant), ['base', 'parallele-fr-p2', 'parallele-fr-p3', 'normale-en', 'parallele-en-p1', 'reedition-en-r1', 'sp-fr-p4']);
  assert.deepEqual(list.map((v) => v.label), ['Par défaut', 'Parallèle 1', 'Parallèle 2', 'Normale · VO', 'Parallèle · VO', 'Réédition · VO', 'Carte SP'],
    'deux versions du même nom sont numérotées ; la langue n’est dite que pour l’autre langue');
  assert.equal(list[0].path, 'img-fr-hd/OP01-120_p1.webp');
  assert.equal(list[3].path, 'img-en-hd/OP01-120.webp');
});

test('versions : noms des genres, ceux des boosters compris', () => {
  assert.equal(kindLabel('manga'), 'Parallèle manga');
  assert.equal(kindLabel('sp'), 'Carte SP');
  assert.equal(kindLabel('tr-en-p5'), 'Treasure Rare');
  assert.equal(kindLabel('quelque-chose'), 'Autre version');
});

test('versions : une impression gagnée dans un booster reste proposée si le catalogue ne la connaît pas', () => {
  const list = artVersions('OP03-001', { imageId: 'OP03-001', lang: 'en' });
  assert.deepEqual(list.map((v) => [v.variant, v.label]), [['base', 'Par défaut'], ['parallele', 'Parallèle']]);
  assert.equal(list[1].path, 'img-en-hd/OP03-001_p1.webp');
  assert.equal(artVersions('OP03-001', undefined).length, 0, 'carte inconnue : rien');
  assert.equal(artVersions('ST01-001', { imageId: 'ST01-001', lang: 'fr' }).length, 1, 'une seule version : pas de choix');
});

test('versions : visuel d’une version choisie, la base pour une version absente ou inconnue', () => {
  assert.equal(artPath('OP01-120', SHANKS, 'parallele-fr-p2'), 'img-fr-hd/OP01-120_p2.webp');
  assert.equal(artPath('OP03-001', { imageId: 'OP03-001', lang: 'en' }, 'parallele'), 'img-en-hd/OP03-001_p1.webp');
  assert.equal(artPath('OP01-120', SHANKS, 'base'), null);
  assert.equal(artPath('OP01-120', SHANKS, undefined), null);
  assert.equal(artPath('OP01-120', SHANKS, 'manga'), null, 'version retirée du catalogue : visuel de base');
});

test('versions : un deck d’aventure ne choisit que les versions de la Cale ; un deck libre, toutes', () => {
  const hold = holdVariants([
    { number: 'OP03-001', variant: 'base', count: 1 },
    { number: 'OP03-001', variant: 'parallele', count: 2 },
    { number: 'OP03-122', variant: 'manga', count: 0 },
  ]);
  assert.equal(canChoose('parallele', hold['OP03-001'], true), true);
  assert.equal(canChoose('manga', hold['OP03-122'], true), false, 'pas dans la Cale : à trouver');
  assert.equal(canChoose('base', undefined, true), true, 'la version de base est le visuel par défaut');
  assert.equal(canChoose('manga', undefined, false), true, 'deck libre');
  assert.deepEqual(hold, { 'OP03-001': { base: 1, parallele: 2 } });
});

const card = (uid: number, num: string): Card => ({ uid, num }) as Card;
const field = (uid: number, num: string): FieldCard => ({ uid, num, rested: false, don: 0, playedTurn: 0, usedOpt: [] }) as FieldCard;
const player = (deckId: string, base: number) => ({
  deckId, leader: field(base, 'OP03-001'), chars: [field(base + 1, 'OP03-008')], stage: null,
  hand: [card(base + 2, 'OP03-013')], trash: [card(base + 3, 'OP03-010')], life: [card(base + 4, 'OP03-015')], deck: [card(base + 5, 'OP03-016')],
});
const state = (a: string, b: string) => ({ players: [player(a, 10), player(b, 20)] }) as unknown as GameState;

test('plateau : le propriétaire d’une carte, où qu’elle soit', () => {
  const s = state('my-deck', 'ST-01');
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((uid) => cardOwner(s, uid)), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([20, 21, 22, 23, 24, 25].map((uid) => cardOwner(s, uid)), [1, 1, 1, 1, 1, 1]);
  assert.equal(cardOwner(s, 99), undefined);
});

test('plateau : contre l’IA, la version de mon deck ; en ligne, celle que dit le serveur', () => {
  const MINE: Record<string, DeckLooks> = { 'my-deck': { arts: { 'OP03-001': 'parallele' } } };
  const mine = (id: string) => MINE[id];
  const s = state('my-deck', 'ST-01');
  assert.equal(artChoice(s, 0, 'OP03-001', null, mine), 'parallele');
  assert.equal(artChoice(s, 0, 'OP03-008', null, mine), undefined, 'carte sans version choisie : la base');
  assert.equal(artChoice(s, 1, 'OP03-001', null, mine), undefined, 'deck du registre : la base');
  assert.equal(artChoice(s, undefined, 'OP03-001', null, mine), undefined, 'propriétaire inconnu : la base');
  assert.equal(artChoice(s, 0, 'OP03-001', {}, mine), undefined, 'en ligne sans visuels : la base, même si le deck est à moi');
  assert.equal(artChoice(s, 1, 'OP03-001', { 1: { arts: { 'OP03-001': 'parallele' } } }, mine), 'parallele');
});
