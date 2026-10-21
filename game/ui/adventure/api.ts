// Client des routes du mode Aventure (server/game-adventure.js) : les écrans passent par ces fonctions, ils n'appellent
// pas fetch eux-mêmes. Le serveur garde et vérifie tout (progression, Cale, boosters) : ces fonctions ne font que
// demander. Un refus arrive comme une AdventureApiError, avec le message du serveur (en français, à montrer tel quel)
// et son code (pour réagir : 'chapter_locked', 'wrong_deck'...).
import type { Reward } from '../../adventure/types.ts';
import type { BoosterContent } from '../../boosters/types.ts';

// Booster gagné, pas encore ouvert. source : ce qui l'a rapporté (« chapitre eb-2-orange-town », voir boosterChapter)
export interface WonBooster { id: string; set: string; source: string; createdAt: string }

export interface AdventureState {
  arcs: Record<string, { started: boolean }>;
  // tous les chapitres de l'aventure, gagnés ou non
  chapters: Record<string, { wins: number; firstWinAt: string | null }>;
  deckId: string | null;    // deck d'aventure choisi (deck « PERSO-... » en mode 'aventure'), null s'il n'y en a pas
  boosters: WonBooster[];   // boosters à ouvrir, du plus ancien au plus récent
}

// won : le serveur a rejoué la partie et le joueur l'a gagnée ; firstWin : première victoire du chapitre, avec ses
// récompenses (rewards : celles qui ont été données ; boosters : les boosters ajoutés, à ouvrir)
export interface ChapterResult { won: boolean; firstWin: boolean; rewards: Reward[]; boosters: WonBooster[] }

export interface HoldCard { number: string; variant: string; count: number }

// alreadyOpened : booster déjà ouvert avant (même contenu, rien de plus dans la Cale)
export interface OpenedBooster { content: BoosterContent; alreadyOpened?: boolean }

export class AdventureApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const BASE = import.meta.env.BASE_URL;

export async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}api/game/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new AdventureApiError('Le serveur ne répond pas : vérifie ta connexion', 'network', 0);
  }
  const data = await res.json().catch(() => null) as (T & { code?: string; error?: string }) | null;
  if (!res.ok) throw new AdventureApiError(data?.error ?? `Le serveur a répondu ${res.status}`, data?.code ?? 'server', res.status);
  return data as T;
}

// GET /api/game/adventure
export const loadAdventure = () => call<AdventureState>('adventure');

// POST /api/game/adventure/:arcId/start : une seule fois par arc (une nouvelle demande ne donne rien de plus)
export const startArc = (arcId: string) => call<AdventureState>(`adventure/${encodeURIComponent(arcId)}/start`, 'POST');

// PUT /api/game/adventure/deck : un deck en mode 'aventure', complet, avec seulement des cartes de la Cale
export const chooseAdventureDeck = (deckId: string) => call<AdventureState>('adventure/deck', 'PUT', { deckId });

// POST /api/game/adventure/chapters/:chapterId/result : à appeler quand la partie est finie ET enregistrée sur le
// serveur (après `await saveRecord(rec)` de archiveClient.ts, avec l'enregistrement final) ; recordId = rec.id.
// La partie doit avoir été lancée avec le deck d'aventure (config.myDeck = deckId), contre opponent.deck au niveau
// opponent.level du chapitre, sans reprise d'un moment revu. Renvoyer la même partie ne donne rien de plus.
export const sendChapterResult = (chapterId: string, recordId: string) =>
  call<ChapterResult>(`adventure/chapters/${encodeURIComponent(chapterId)}/result`, 'POST', { recordId });

// GET /api/game/inventory : la Cale, par numéro et par version
export const loadHold = () => call<{ cards: HoldCard[] }>('inventory');

// POST /api/game/boosters/:id/open : le tirage se fait sur le serveur, les cartes vont dans la Cale
export const openWonBooster = (id: string) => call<OpenedBooster>(`boosters/${encodeURIComponent(id)}/open`, 'POST');

// ---------- Aides pour les écrans ----------

// Chapitres gagnés (pour chapterStatuses, currentChapter... de game/adventure/progress.ts)
export const wonChapters = (state: AdventureState) =>
  new Set(Object.entries(state.chapters).filter(([, c]) => c.wins > 0).map(([id]) => id));

// Cartes de la Cale par numéro, toutes versions confondues : ce qu'un deck d'aventure peut contenir
export function holdByNumber(cards: HoldCard[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of cards) counts[c.number] = (counts[c.number] ?? 0) + c.count;
  return counts;
}

// Chapitre qui a rapporté un booster (undefined pour une autre source)
export const boosterChapter = (source: string) => (source.startsWith('chapitre ') ? source.slice('chapitre '.length) : undefined);
