// Progression dans un arc : quels chapitres sont verrouillés, ouverts ou gagnés, d'après les chapitres déjà gagnés.
// Logique pure, la même pour le serveur (qui refuse un chapitre verrouillé) et pour l'interface (carte du monde).
import type { Arc, Chapter, ChapterStatus } from './types.ts';

const byOrder = (arc: Arc) => [...arc.chapters].sort((a, b) => a.order - b.order);

// Chapitres à gagner avant celui-ci : ceux de `requires`, sinon le chapitre obligatoire qui le précède (aucun pour le
// premier). Un défi bonus n'est jamais exigé par défaut : il ne bloque pas la suite de l'histoire.
export function requiredChapters(arc: Arc, chapter: Chapter): string[] {
  if (chapter.requires) return chapter.requires;
  const before = byOrder(arc).filter((c) => !c.optional && c.order < chapter.order);
  return before.length ? [before[before.length - 1].id] : [];
}

export function chapterStatuses(arc: Arc, wins: Set<string>): Record<string, ChapterStatus> {
  const statuses: Record<string, ChapterStatus> = {};
  for (const chapter of arc.chapters) {
    statuses[chapter.id] = wins.has(chapter.id) ? 'won'
      : requiredChapters(arc, chapter).every((id) => wins.has(id)) ? 'open'
      : 'locked';
  }
  return statuses;
}

// Prochaine étape de l'histoire : le premier chapitre obligatoire ouvert (undefined quand l'arc est fini)
export function currentChapter(arc: Arc, wins: Set<string>): string | undefined {
  const statuses = chapterStatuses(arc, wins);
  return byOrder(arc).find((c) => !c.optional && statuses[c.id] === 'open')?.id;
}

// Arc terminé : tous les chapitres obligatoires gagnés (les défis bonus ne comptent pas)
export const arcFinished = (arc: Arc, wins: Set<string>) => arc.chapters.every((c) => c.optional || wins.has(c.id));
