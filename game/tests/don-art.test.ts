// Les vraies DON!! sur le plateau (tâche R2.11, game/ui/table/donLooks.ts) : quelle DON!! montrer pour chaque joueur,
// et quand garder les jetons dorés.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeckLooks } from '../data/looks.ts';
import type { GameState } from '../engine/types.ts';
import { donCatalog, donChoice, donImage, gameLooks } from '../ui/table/donLooks.ts';

const DONS = [
  { id: '434340', imageUrl: 'img/434340.jpg' },
  { id: '482236', imageUrl: 'img/482236.jpg' },
];
const state = (a: string, b: string) => ({ players: [{ deckId: a }, { deckId: b }] }) as unknown as GameState;
const MINE: Record<string, DeckLooks> = { 'my-gold': { don: '482236' }, 'my-arts': { arts: { 'OP03-001': 'parallele' } } };
const mine = (id: string) => MINE[id];

test('DON!! : le visuel choisi, la standard par défaut ou pour une DON!! inconnue', () => {
  const c = donCatalog(DONS, false, '/jeu/');
  assert.equal(donImage(c, '482236'), '/jeu/img/482236.jpg');
  assert.equal(donImage(c, undefined), '/jeu/img/434340.jpg', 'sans choix : la standard (la première)');
  assert.equal(donImage(c, '999'), '/jeu/img/434340.jpg', 'DON!! retirée depuis : la standard');
});

test('DON!! : pas de visuel sans liste, liste vide ou visuels coupés par le serveur', () => {
  assert.equal(donImage(null, '482236'), null, 'liste pas encore lue');
  assert.equal(donImage(donCatalog([]), undefined), null);
  assert.equal(donImage(donCatalog(DONS.slice(0, 1), true), undefined), null, 'retrait des images : jetons dorés');
});

test('DON!! : contre l’IA, celle de mon deck ; en ligne, celle que dit le serveur pour chaque siège', () => {
  const s = state('my-gold', 'ST-01');
  assert.equal(donChoice(s, 0, null, mine), '482236');
  assert.equal(donChoice(s, 1, null, mine), undefined, 'deck du registre : standard');
  assert.equal(donChoice(s, 0, {}, mine), undefined, 'en ligne sans visuels : standard, même si l’identifiant du deck est connu');
  assert.equal(donChoice(s, 1, { 1: { don: '482236' } }, mine), '482236');
});

test('DON!! : les visuels des decks sont gardés avec la partie (Mes parties)', () => {
  assert.deepEqual(gameLooks(state('my-gold', 'ST-01'), mine), { 0: { don: '482236' } });
  assert.deepEqual(gameLooks(state('ST-01', 'my-arts'), mine), { 1: { arts: { 'OP03-001': 'parallele' } } });
  assert.equal(gameLooks(state('ST-01', 'ST-32'), mine), undefined);
});
