// Decks personnalisés du compte (éditeur de decks) : gardés par le serveur (server/game-decks.js), copiés ici pour
// l'écran de départ, l'éditeur et le lancement d'une partie. Tous les écrans partagent la même copie.
import { useEffect, useState } from 'react';
import { playableErrors } from '../engine/deckRules.ts';
import { CUSTOM_PREFIX, DECKS, type DeckList } from '../engine/decks.ts';

export interface MyDeck extends DeckList {
  updatedAt: string;
}

const BASE = import.meta.env.BASE_URL;
let decks: MyDeck[] = [];
let state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}api/game/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Le serveur a répondu ${res.status}`);
  return data as T;
}

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

export function newDeckId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return CUSTOM_PREFIX + Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export async function saveMyDeck(d: { id: string; name: string; leader: string; cards: Record<string, number> }): Promise<MyDeck> {
  const saved = await call<MyDeck>(`decks/${encodeURIComponent(d.id)}`, 'PUT', { name: d.name, leader: d.leader, cards: d.cards });
  decks = [saved, ...decks.filter((x) => x.id !== saved.id)];
  notify();
  return saved;
}

export async function deleteMyDeck(id: string) {
  await call(`decks/${encodeURIComponent(id)}`, 'DELETE');
  decks = decks.filter((x) => x.id !== id);
  notify();
}

// Lien avec la collection
export interface CardCollection { owned: number; wished: boolean; cheapest: { id: number; eur: number } | null }
export const ownedNumbers = () => call<Record<string, number>>('owned');
export const deckPrices = (numbers: string[]) => call<Record<string, CardCollection>>('decks-prices', 'POST', { numbers });
export const wishMissing = (missing: Record<string, number>, lang: 'fr' | 'en') => call<{ added: number }>('decks-wish', 'POST', { missing, lang });

export { deckText, parseDeckText } from './deckText.ts';
