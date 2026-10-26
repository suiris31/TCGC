// Decks personnalisés du compte (éditeur de decks) : gardés par le serveur (server/game-decks.js), copiés ici pour
// l'écran de départ, l'éditeur et le lancement d'une partie. Tous les écrans partagent la même copie.
import { useEffect, useState } from 'react';
import { call as api } from './api.ts';
import { playableErrors } from '../engine/deckRules.ts';
import type { DeckLooks } from '../data/looks.ts';
import { CUSTOM_PREFIX, DECKS, type DeckList } from '../engine/decks.ts';

export type { DeckLooks } from '../data/looks.ts';

// Mode d'un deck, choisi à sa création : 'libre' (toutes les cartes jouables) ou 'aventure' (seulement des cartes de la
// Cale du mode Aventure : le serveur refuse les autres)
export type DeckMode = 'libre' | 'aventure';

export interface MyDeck extends DeckList {
  updatedAt: string;
  mode?: DeckMode;   // absent des réponses d'avant le mode Aventure : 'libre'
  looks?: DeckLooks; // visuels choisis (version de chaque carte, DON!!) ; absent ou {} : visuels de base, DON!! standard
}

let decks: MyDeck[] = [];
let state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

const call = <T>(path: string, method = 'GET', body?: unknown) => api<T>(method, path, body);

export async function loadMyDecks(): Promise<MyDeck[]> {
  state = 'loading';
  try {
    decks = await call<MyDeck[]>('decks');
    state = 'ready';
  } catch {
    state = 'error';
  }
  notify();
  return decks;
}

// Mes decks (chargés au premier écran qui en a besoin), mis à jour à chaque changement
export function useMyDecks(): { decks: MyDeck[]; ready: boolean; error: boolean } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    if (state === 'idle') void loadMyDecks();
    return () => { listeners.delete(f); };
  }, []);
  return { decks, ready: state === 'ready', error: state === 'error' };
}

// Deck du registre ou de mes decks
export const deckInfo = (id: string): DeckList | undefined => DECKS[id] ?? decks.find((d) => d.id === id);
export const deckLabel = (id: string, fallback?: string) => deckInfo(id)?.name ?? fallback ?? id;
export const playable = (d: Pick<DeckList, 'leader' | 'cards'>) => playableErrors(d.leader, d.cards).length === 0;
// Deck d'aventure (construit avec les cartes de la Cale)
export const isAdventureDeck = (d: string | Pick<MyDeck, 'mode'> | undefined) =>
  (typeof d === 'string' ? decks.find((x) => x.id === d) : d)?.mode === 'aventure';

export function newDeckId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return CUSTOM_PREFIX + Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

// mode : à donner à la création d'un deck d'aventure (sans mode, un nouveau deck est libre ; ensuite le mode ne change plus)
// looks : visuels choisis ; sans looks, le deck garde les siens (le serveur retire ceux devenus impossibles)
export async function saveMyDeck(d: { id: string; name: string; leader: string; cards: Record<string, number>; mode?: DeckMode; looks?: DeckLooks }): Promise<MyDeck> {
  const saved = await call<MyDeck>(`decks/${encodeURIComponent(d.id)}`, 'PUT', {
    name: d.name, leader: d.leader, cards: d.cards, ...(d.mode ? { mode: d.mode } : {}), ...(d.looks ? { looks: d.looks } : {}),
  });
  decks = [saved, ...decks.filter((x) => x.id !== saved.id)];
  notify();
  return saved;
}

export async function deleteMyDeck(id: string) {
  await call(`decks/${encodeURIComponent(id)}`, 'DELETE');
  decks = decks.filter((x) => x.id !== id);
  notify();
}

// DON!! proposées pour un deck (la standard d'abord, choix par défaut) ; imageUrl relatif, à préfixer par BASE_URL
export interface DonChoice { id: string; label: string; imageUrl: string }
export const loadDons = () => call<{ dons: DonChoice[] }>('don');

// Lien avec la collection
export interface CardCollection { owned: number; wished: boolean; cheapest: { id: number; eur: number } | null }
export const ownedNumbers = () => call<Record<string, number>>('owned');
export const deckPrices = (numbers: string[]) => call<Record<string, CardCollection>>('decks-prices', 'POST', { numbers });
export const wishMissing = (missing: Record<string, number>, lang: 'fr' | 'en') => call<{ added: number }>('decks-wish', 'POST', { missing, lang });

export { deckText, parseDeckText } from './deckText.ts';
