// Accueil de « Jouer » (tâche R3.1) : ce qu'il propose, calculé sans navigateur ni serveur (game/tests/home.test.ts).
// - le bloc « Continuer » : une partie en ligne ou une salle qui attend, une partie rapide interrompue, un chapitre
//   d'aventure interrompu ;
// - la carte de l'Aventure : arc en cours, chapitres gagnés, prochain chapitre de l'histoire ;
// - le bilan des parties rapides.
import { ARCS } from '../../adventure/arcs.ts';
import { arcFinished, currentChapter } from '../../adventure/progress.ts';
import type { Arc, Chapter } from '../../adventure/types.ts';
import { inQuickRecord, playMode, type GameSummary } from '../../coach/archive.ts';

// Ce que l'accueil lit des parties enregistrées (GameSummary en a davantage)
export type HomeGame = Pick<GameSummary, 'id' | 'status' | 'startedAt' | 'updatedAt' | 'turns' | 'config' | 'practice' | 'mode'>;

// Une partie laissée en route depuis plus longtemps n'est plus proposée (elle reste dans « Mes parties »)
export const RESUME_DAYS = 14;

const unfinished = (g: HomeGame) => g.status === 'playing' || g.status === 'abandoned';
const recent = (g: HomeGame, now: number) => now - Date.parse(g.updatedAt) <= RESUME_DAYS * 86_400_000;
// la dernière commencée (la date de mise à jour bouge encore après la fin, avec l'analyse du coach)
const latest = (games: HomeGame[]) => [...games].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

// Partie rapide contre l'IA interrompue : la dernière partie rapide (hors entraînement depuis un moment revu), si elle
// n'est pas finie, récente, et pas écartée par « Ignorer »
export function interruptedQuick(games: HomeGame[], now: number, dismissed: string[] = []): HomeGame | undefined {
  const last = latest(games.filter((g) => !g.practice && playMode(g) === 'solo'));
  return last && unfinished(last) && recent(last, now) && !dismissed.includes(last.id) ? last : undefined;
}

// Le chapitre d'une partie d'aventure : celui dont l'adversaire joue ce deck à ce niveau
export function chapterOf(game: Pick<HomeGame, 'config'>): { arc: Arc; chapter: Chapter } | undefined {
  for (const arc of ARCS) {
    const chapter = arc.chapters.find((c) => c.opponent.deck === game.config.aiDeck && c.opponent.level === game.config.level);
    if (chapter) return { arc, chapter };
  }
  return undefined;
}

// Chapitre d'aventure interrompu : la dernière partie d'aventure, pas finie, récente, jouée avec le deck d'aventure
// actuel (l'écran du chapitre ne propose de reprendre qu'avec lui) et pas écartée
export function interruptedChapter(games: HomeGame[], deckId: string | null, now: number, dismissed: string[] = []): { game: HomeGame; chapter: Chapter } | undefined {
  const last = latest(games.filter((g) => !g.practice && playMode(g) === 'aventure'));
  if (!last || !unfinished(last) || !recent(last, now) || dismissed.includes(last.id) || last.config.myDeck !== deckId) return undefined;
  const found = chapterOf(last);
  return found && { game: last, chapter: found.chapter };
}

// Bilan des parties rapides (mêmes parties que le tableau « Ton bilan » : finies, contre l'IA, hors entraînement)
export function quickRecord(games: HomeGame[]): { wins: number; played: number } {
  const counted = games.filter(inQuickRecord);
  return { wins: counted.filter((g) => g.status === 'won').length, played: counted.length };
}

// Progression de l'aventure, d'après les chapitres gagnés (GET /api/game/adventure)
export interface AdventureProgress {
  arc: Arc;
  started: boolean;
  won: number;                 // chapitres de l'histoire gagnés (sans les défis)
  total: number;
  next?: Chapter;              // prochain chapitre de l'histoire (absent quand l'arc est fini)
  nextNumber?: number;         // son rang dans l'histoire (« Chapitre 3 »), sans compter les défis
  finished: boolean;
  challengesLeft: number;      // défis bonus pas encore relevés
  boosters: number;            // boosters gagnés, pas encore ouverts
}

export function adventureProgress(adv: {
  arcs: Record<string, { started: boolean }>;
  chapters: Record<string, { wins: number }>;
  boosters: unknown[];
}): AdventureProgress {
  const wins = new Set(Object.entries(adv.chapters).filter(([, c]) => c.wins > 0).map(([id]) => id));
  // l'arc où l'on en est : le premier pas fini parmi ceux commencés, sinon le dernier commencé, sinon le premier
  const started = ARCS.filter((a) => adv.arcs[a.id]?.started || a.chapters.some((c) => wins.has(c.id)));
  const arc = started.find((a) => !arcFinished(a, wins)) ?? started[started.length - 1] ?? ARCS[0];
  const story = arc.chapters.filter((c) => !c.optional).sort((a, b) => a.order - b.order);
  const next = currentChapter(arc, wins);
  const index = story.findIndex((c) => c.id === next);
  return {
    arc,
    started: started.includes(arc),
    won: story.filter((c) => wins.has(c.id)).length,
    total: story.length,
    next: index >= 0 ? story[index] : undefined,
    nextNumber: index >= 0 ? index + 1 : undefined,
    finished: arcFinished(arc, wins),
    challengesLeft: arc.chapters.filter((c) => c.optional && !wins.has(c.id)).length,
    boosters: adv.boosters.length,
  };
}

// « tour 7 », « il y a 3 jours » : de quoi reconnaître une partie interrompue
export function since(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}
