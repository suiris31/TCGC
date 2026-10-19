// Carte du monde de l'aventure : les régions, quelques lieux fixes et la route du voyage, dans un repère de 1000 × 600
// (x vers la droite, y vers le bas). Données pures, sans dessin : l'écran est game/ui/adventure/WorldMap.tsx.
//
// Dessin original, pas de reprise d'une carte publiée. Le monde est déplié comme un globe : la Red Line fait le tour du
// monde du nord au sud, elle apparaît donc deux fois (au tiers gauche, et sur les bords droit et gauche, qui se
// rejoignent) ; Grand Line la coupe à l'horizontale. Les quatre mers sont entre les deux. East Blue, la mer de départ, a
// la plus grande place (en bas à droite) : on y entre par le village de Fuchsia et on en sort par Reverse Mountain.
//
// Un chapitre se place dans le rectangle de sa région avec `map: { x, y }` entre 0 et 1 (Plan-aventure/01-contrats.md,
// § 8) : les données d'un arc n'ont pas besoin de connaître la géométrie. Le village de départ est dans le coin en bas à
// gauche d'East Blue (vers x 0,04, y 0,9) et la sortie vers Reverse Mountain à droite (vers x 0,99, y 0,05) : mieux vaut
// ne pas y mettre de chapitre.
import { requiredChapters } from './progress.ts';
import type { Arc, Chapter } from './types.ts';

export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 600;

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Region {
  id: string;           // 'east-blue' : c'est le `region` des arcs
  name: string;
  subtitle?: string;    // « Paradis »
  rect: Rect;           // la zone où se placent les chapitres de ses arcs
  open: boolean;        // false : « bientôt » (aucun arc jouable)
}

// Grand Line (bande horizontale) et ses deux Calm Belts ; les deux passages de la Red Line (bandes verticales)
export const GRAND_LINE = { y: 190, h: 60, calmBelt: 18 };
export const RED_LINES = [
  { x: 360, w: 34 },    // traversée de Marie-Joie
  { x: 1000, w: 60 },   // traversée de Reverse Mountain : à cheval sur le bord droit…
  { x: 0, w: 32 },      // … et sur le bord gauche, puisque les deux bords se rejoignent
];

export const REGIONS: Region[] = [
  { id: 'east-blue', name: 'East Blue', rect: { x: 392, y: 284, w: 560, h: 300 }, open: true },
  { id: 'grand-line', name: 'Grand Line', subtitle: 'Paradis', rect: { x: 380, y: 190, w: 580, h: 60 }, open: false },
  { id: 'nouveau-monde', name: 'Nouveau Monde', rect: { x: 20, y: 190, w: 322, h: 60 }, open: false },
  { id: 'south-blue', name: 'South Blue', rect: { x: 392, y: 16, w: 560, h: 150 }, open: false },
  { id: 'north-blue', name: 'North Blue', rect: { x: 30, y: 284, w: 300, h: 300 }, open: false },
  { id: 'west-blue', name: 'West Blue', rect: { x: 30, y: 16, w: 300, h: 150 }, open: false },
];

export interface Landmark extends Point {
  id: string;
  name: string;
  kind: 'village' | 'mountain' | 'city';
  note?: string;        // ce que le lieu représente dans l'aventure
}

export const LANDMARKS: Landmark[] = [
  { id: 'fuchsia', name: 'Village de Fuchsia', kind: 'village', x: 414, y: 554, note: 'Départ' },
  { id: 'reverse-mountain', name: 'Reverse Mountain', kind: 'mountain', x: 984, y: 220, note: 'Entrée de Grand Line' },
  { id: 'marie-joie', name: 'Marie-Joie', kind: 'city', x: 360, y: 220 },
];

// La route du voyage, dans l'ordre : des lieux fixes (`place`), des points de passage, et `{ region }` là où
// s'intercalent les chapitres obligatoires des arcs de cette région (dans l'ordre des chapitres). Quand un arc ouvrira
// dans une autre région, remplace ses points de passage par `{ region: '<id>' }`.
export type RouteStep = { place: string } | { region: string } | Point;

export const ROUTE: RouteStep[] = [
  { place: 'fuchsia' },
  { region: 'east-blue' },
  { x: 950, y: 300 },
  { place: 'reverse-mountain' },
  { x: 900, y: 212 }, { x: 790, y: 228 }, { x: 680, y: 212 }, { x: 570, y: 228 }, { x: 460, y: 214 },
  { place: 'marie-joie' },
  { x: 250, y: 212 }, { x: 140, y: 228 }, { x: 34, y: 220 },
];

export const findRegion = (id: string): Region | undefined => REGIONS.find((r) => r.id === id);
export const findLandmark = (id: string): Landmark | undefined => LANDMARKS.find((l) => l.id === id);

// Position d'un chapitre sur la carte (milieu du monde si la région est inconnue)
export function chapterPoint(arc: Arc, chapter: Chapter): Point {
  const region = findRegion(arc.region);
  if (!region) return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  const { x, y, w, h } = region.rect;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: x + clamp(chapter.map.x) * w, y: y + clamp(chapter.map.y) * h };
}

export interface Stop extends Point {
  id: string;           // identifiant du chapitre, du lieu fixe, ou 'route-<n>' pour un point de passage
  chapter?: string;
  landmark?: string;
  soon: boolean;        // après le dernier chapitre des arcs : la route continue, l'aventure pas encore
}

const byOrder = (arc: Arc) => [...arc.chapters].sort((a, b) => a.order - b.order);

// Les étapes du voyage dans l'ordre, pour les arcs donnés : le départ, les chapitres obligatoires, puis la suite de la
// route. Les défis bonus n'y sont pas : ce sont des détours (`sideTrips`).
export function voyage(arcs: Arc[]): Stop[] {
  const stops: Stop[] = [];
  ROUTE.forEach((step, n) => {
    if ('place' in step) {
      const landmark = findLandmark(step.place);
      if (landmark) stops.push({ id: landmark.id, x: landmark.x, y: landmark.y, landmark: landmark.id, soon: false });
    } else if ('region' in step) {
      for (const arc of arcs.filter((a) => a.region === step.region)) {
        for (const chapter of byOrder(arc).filter((c) => !c.optional)) {
          stops.push({ id: chapter.id, ...chapterPoint(arc, chapter), chapter: chapter.id, soon: false });
        }
      }
    } else {
      stops.push({ id: `route-${n}`, x: step.x, y: step.y, soon: false });
    }
  });
  let last = -1;
  stops.forEach((s, i) => { if (s.chapter) last = i; });
  stops.forEach((s, i) => { s.soon = i > Math.max(last, 0); });
  return stops;
}

// Les détours vers les défis bonus : de chaque chapitre exigé (ou du départ) jusqu'au défi
export function sideTrips(arcs: Arc[]): { chapter: string; from: Point; to: Point }[] {
  const trips: { chapter: string; from: Point; to: Point }[] = [];
  const start = findLandmark('fuchsia')!;
  for (const arc of arcs) {
    for (const chapter of arc.chapters.filter((c) => c.optional)) {
      const to = chapterPoint(arc, chapter);
      const before = requiredChapters(arc, chapter);
      if (!before.length) trips.push({ chapter: chapter.id, from: start, to });
      for (const id of before) {
        const c = arc.chapters.find((x) => x.id === id);
        if (c) trips.push({ chapter: chapter.id, from: chapterPoint(arc, c), to });
      }
    }
  }
  return trips;
}

// Courbe douce qui passe par les points (Catmull-Rom) : un segment de Bézier cubique entre deux points voisins
export interface Segment { p0: Point; c1: Point; c2: Point; p1: Point }

export function smoothSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[Math.max(0, i - 1)], p0 = points[i], p1 = points[i + 1], b = points[Math.min(points.length - 1, i + 2)];
    segments.push({
      p0,
      c1: { x: p0.x + (p1.x - a.x) / 6, y: p0.y + (p1.y - a.y) / 6 },
      c2: { x: p1.x - (b.x - p0.x) / 6, y: p1.y - (b.y - p0.y) / 6 },
      p1,
    });
  }
  return segments;
}

export function pointOnSegment(s: Segment, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p1.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y,
  };
}

// Longueur approchée d'un segment (pour une vitesse régulière du bateau)
export function segmentLength(s: Segment): number {
  let length = 0;
  let prev = s.p0;
  for (let i = 1; i <= 16; i++) {
    const p = pointOnSegment(s, i / 16);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

// Attribut `d` d'un chemin SVG fait de segments qui se suivent
export function segmentsPath(segments: Segment[]): string {
  if (!segments.length) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(segments[0].p0.x)} ${f(segments[0].p0.y)}` + segments
    .map((s) => `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.p1.x)} ${f(s.p1.y)}`).join('');
}
