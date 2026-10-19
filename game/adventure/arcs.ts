// Les arcs de l'aventure, dans l'ordre du voyage. Un nouvel arc (Alabasta...) s'ajoute à la fin de ARCS.
import { EAST_BLUE } from './east-blue.ts';
import type { Arc, Chapter } from './types.ts';

export const ARCS: Arc[] = [EAST_BLUE];

export const findArc = (id: string): Arc | undefined => ARCS.find((arc) => arc.id === id);

// Un chapitre et son arc, d'après l'identifiant du chapitre (unique dans toute l'aventure)
export function findChapter(id: string): { arc: Arc; chapter: Chapter } | undefined {
  for (const arc of ARCS) {
    const chapter = arc.chapters.find((c) => c.id === id);
    if (chapter) return { arc, chapter };
  }
  return undefined;
}
