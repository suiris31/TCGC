// Carte du monde de l'aventure : les mers, la Red Line, Grand Line et les îles des chapitres, façon carte au trésor.
// Tout est dessiné par nous (aucune reprise d'une carte publiée) ; la géométrie est dans game/adventure/world.ts.
// - Chaque chapitre est une île avec son état : cadenas (verrouillé), drapeau (à jouer), coche (gagné). Les défis
//   bonus sont des îles rocheuses à l'écart de la route, reliées par un détour, avec des épées croisées.
// - Toucher ou cliquer une île la choisit (`onPick`) : rien ne se lance.
// - La carte s'ouvre sur la région de la prochaine étape ; on la fait glisser au doigt ou à la souris, on zoome avec
//   les boutons, deux doigts ou Ctrl + molette. Sur un petit écran, la vue est assez grande pour toucher les îles.
// - Quand un chapitre s'ouvre, le bateau navigue jusqu'à son île. Il garde sa dernière position dans le navigateur :
//   en revenant sur la carte après une victoire, on le voit partir de l'île gagnée (et du village de Fuchsia au tout
//   début). Un appui sur la carte l'amène tout de suite ; avec « Animations réduites » (réglage du jeu, par
//   défaut celui du système), il est posé directement. Les sons suivent le réglage du jeu.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Arc, Chapter, ChapterStatus } from '../../adventure/types.ts';
import {
  GRAND_LINE, LANDMARKS, RED_LINES, REGIONS, WORLD_HEIGHT, WORLD_WIDTH, chapterPoint, findRegion, pointOnSegment, segmentLength,
  segmentsPath, sideTrips, smoothSegments, voyage, type Point, type Rect, type Region, type Segment, type Stop,
} from '../../adventure/world.ts';
import { useDevice } from '../device.ts';
import { useReducedMotion, useSettings } from '../settings.ts';
import { sfx } from '../sound.ts';

export interface WorldMapProps {
  arcs: Arc[];
  statuses: Record<string, ChapterStatus>;   // état de chaque chapitre (chapterStatuses), tous arcs confondus
  current?: string;                          // la prochaine étape (currentChapter) : le bateau y est amarré
  onPick: (chapterId: string) => void;       // une île choisie : rien ne se lance
  selected?: string;                         // facultatif : l'île choisie, entourée
}

const R = 22;                 // rayon d'une île de chapitre, en unités du repère 1000 × 600
const COMFY = 1;              // échelle minimale d'une région sur petit écran (pixels par unité) : îles de 44 px
const SHIP_KEY = 'tcgc.game.adventure.ship';
const INK = '#5a3b1d';
const PAPER = '#f6e7c1';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f1 = (n: number) => Math.round(n * 10) / 10;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// Tirage pseudo-aléatoire fixe : le décor est le même à chaque affichage
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Formes ----------

// Contour fermé et doux qui passe par les points
function closedPath(points: Point[]): string {
  const n = points.length;
  let d = `M${f1(points[0].x)} ${f1(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n], p0 = points[i], p1 = points[(i + 1) % n], b = points[(i + 2) % n];
    d += `C${f1(p0.x + (p1.x - a.x) / 6)} ${f1(p0.y + (p1.y - a.y) / 6)} ${f1(p1.x - (b.x - p0.x) / 6)} ${f1(p1.y - (b.y - p0.y) / 6)} ${f1(p1.x)} ${f1(p1.y)}`;
  }
  return `${d}Z`;
}

// Silhouettes d'îles : rayons relatifs autour du centre, étirement et rotation
const SHAPES = [
  { radii: [1, 0.86, 0.95, 1.08, 0.9, 0.8, 0.97, 1.05, 0.88, 0.93], sx: 1.15, sy: 0.85, rot: 0.2 },
  { radii: [0.9, 1.1, 0.95, 0.78, 0.9, 1.06, 1, 0.85, 0.92, 1.02], sx: 1, sy: 0.92, rot: 1.1 },
  { radii: [1.05, 0.95, 0.8, 0.92, 1.1, 0.97, 0.84, 0.9, 1.04, 0.93], sx: 1.2, sy: 0.8, rot: -0.4 },
  { radii: [0.92, 0.98, 1.08, 0.96, 0.82, 0.9, 1.06, 1, 0.86, 0.97], sx: 0.95, sy: 1, rot: 0.7 },
  { radii: [1, 0.82, 0.9, 1.02, 0.97, 0.88, 0.8, 0.95, 1.1, 0.96], sx: 1.1, sy: 0.9, rot: 2 },
  { radii: [0.95, 1.04, 0.88, 0.84, 1, 1.08, 0.92, 0.82, 0.97, 1.03], sx: 1.05, sy: 0.88, rot: -1.2 },
];

function blob(shape: number, r: number, dx = 0, dy = 0): string {
  const s = SHAPES[shape % SHAPES.length];
  return closedPath(s.radii.map((k, i) => {
    const a = s.rot + (i / s.radii.length) * Math.PI * 2;
    return { x: dx + Math.cos(a) * k * r * s.sx, y: dy + Math.sin(a) * k * r * s.sy };
  }));
}

const ISLANDS = SHAPES.map((_, i) => ({ shore: blob(i, R + 6), land: blob(i, R), green: blob(i, R * 0.58, -R * 0.1, -R * 0.14) }));

// Bord déchiqueté d'une bande de la Red Line (du haut en bas de la carte)
function ridgePath(cx: number, w: number, seed: number): string {
  const rand = rng(seed);
  const left: Point[] = [], right: Point[] = [];
  for (let y = -30; y <= WORLD_HEIGHT + 30; y += 22) {
    left.push({ x: cx - w / 2 + (rand() - 0.5) * 9, y: y + (rand() - 0.5) * 6 });
    right.push({ x: cx + w / 2 + (rand() - 0.5) * 9, y: y + (rand() - 0.5) * 6 });
  }
  return `M${[...left, ...right.reverse()].map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L')}Z`;
}

// Nuages de brume sur une région pas encore ouverte : quelques nuages répartis, le milieu (son nom) restant libre
function clouds(rect: Rect, seed: number): { x: number; y: number; w: number }[] {
  const rand = rng(seed);
  const big = rect.h > 100;
  const w0 = big ? 80 : 34;
  const cols = Math.max(1, Math.round(rect.w / (w0 * 1.8)));
  const rows = big ? Math.max(1, Math.round(rect.h / (w0 * 1.05))) : 1;
  const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const out: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = rect.x + ((c + 0.5) * rect.w) / cols + (rand() - 0.5) * w0 * 0.6;
      const y = rect.y + ((r + 0.5) * rect.h) / rows + (rand() - 0.5) * w0 * 0.3;
      if (rand() < 0.3 || (Math.abs(x - mid.x) < w0 * 1.3 && Math.abs(y - mid.y) < (big ? 38 : 40))) continue;
      out.push({ x, y, w: w0 * (0.8 + rand() * 0.45) });
    }
  }
  return out;
}

// Un nuage : trois bulles sur une base plate, centré sur (x, y)
function Cloud({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g transform={`translate(${f1(x)} ${f1(y + w * 0.1)})`}>
      <circle cx={f1(-w * 0.27)} cy={f1(-w * 0.1)} r={f1(w * 0.19)} />
      <circle cx="0" cy={f1(-w * 0.2)} r={f1(w * 0.25)} />
      <circle cx={f1(w * 0.26)} cy={f1(-w * 0.1)} r={f1(w * 0.18)} />
      <rect x={f1(-w * 0.44)} y={f1(-w * 0.12)} width={f1(w * 0.88)} height={f1(w * 0.2)} rx={f1(w * 0.1)} />
    </g>
  );
}

// ---------- Géométrie de la carte pour des arcs donnés ----------

interface IslandInfo { arc: Arc; chapter: Chapter; p: Point; number?: number; shape: number }
interface Decor { waves: Point[]; islets: { p: Point; r: number; shape: number }[] }

function decor(avoid: Point[], route: Point[]): Decor {
  const rand = rng(2026);
  const counts: Record<string, number> = { 'east-blue': 12, 'grand-line': 9, 'nouveau-monde': 5, 'south-blue': 7, 'north-blue': 6, 'west-blue': 5 };
  const islets: Decor['islets'] = [];
  for (const region of REGIONS) {
    const n = counts[region.id] ?? 5;
    const { x, y, w, h } = region.rect;
    for (let tries = 0, placed = 0; tries < n * 14 && placed < n; tries++) {
      const r = h < 100 ? 3.5 + rand() * 3.5 : 4.5 + rand() * 6;
      const p = { x: x + r + 4 + rand() * (w - 2 * r - 8), y: y + r + 4 + rand() * (h - 2 * r - 8) };
      if (avoid.some((q) => dist(p, q) < R + r + 16) || LANDMARKS.some((l) => dist(p, l) < r + 26)) continue;
      if (route.some((q) => dist(p, q) < r + 9) || islets.some((o) => dist(p, o.p) < r + o.r + 10)) continue;
      islets.push({ p, r, shape: Math.floor(rand() * SHAPES.length) });
      placed++;
    }
  }
  const gl = GRAND_LINE;
  const waves: Point[] = [];
  for (let i = 0; i < 220 && waves.length < 75; i++) {
    const p = { x: 24 + rand() * (WORLD_WIDTH - 48), y: 24 + rand() * (WORLD_HEIGHT - 48) };
    if (p.y > gl.y - gl.calmBelt - 8 && p.y < gl.y + gl.h + gl.calmBelt + 8) continue;
    if (RED_LINES.some((l) => Math.abs(p.x - l.x) < l.w / 2 + 14)) continue;
    if (avoid.some((q) => dist(p, q) < R + 16) || LANDMARKS.some((l) => dist(p, l) < 28)) continue;
    if (islets.some((o) => dist(p, o.p) < o.r + 12) || waves.some((o) => dist(p, o) < 26)) continue;
    waves.push(p);
  }
  return { waves, islets };
}

function geometry(arcs: Arc[]) {
  const stops = voyage(arcs);
  const segments = smoothSegments(stops);
  let last = 0;
  stops.forEach((s, i) => { if (s.chapter) last = i; });
  const islands: IslandInfo[] = arcs.flatMap((arc) => {
    let n = 0;
    return [...arc.chapters].sort((a, b) => a.order - b.order).map((chapter) => ({
      arc, chapter, p: chapterPoint(arc, chapter), number: chapter.optional ? undefined : ++n, shape: hash(chapter.id) % SHAPES.length,
    }));
  });
  const trips = sideTrips(arcs);
  const route = [
    ...segments.flatMap((s) => [0.25, 0.5, 0.75, 1].map((t) => pointOnSegment(s, t))),
    ...trips.flatMap((t) => [0.25, 0.5, 0.75].map((u) => ({ x: t.from.x + (t.to.x - t.from.x) * u, y: t.from.y + (t.to.y - t.from.y) * u }))),
  ];
  return { stops, segments, last, islands, trips, decor: decor(islands.map((i) => i.p), route) };
}

// ---------- Vue (zoom et déplacement) ----------

interface Size { w: number; h: number }
interface View { cx: number; cy: number; s: number }   // centre visible (repère du monde) et échelle (pixels par unité)

function scaleLimits(size: Size) {
  const fit = Math.min(size.w / WORLD_WIDTH, size.h / WORLD_HEIGHT);
  return { min: fit, max: Math.max(fit * 2.5, 3.2) };
}

function clampView(v: View, size: Size): View {
  const { min, max } = scaleLimits(size);
  const s = clamp(v.s, min, max);
  const hw = size.w / (2 * s), hh = size.h / (2 * s);
  return {
    s,
    cx: hw * 2 >= WORLD_WIDTH ? WORLD_WIDTH / 2 : clamp(v.cx, hw, WORLD_WIDTH - hw),
    cy: hh * 2 >= WORLD_HEIGHT ? WORLD_HEIGHT / 2 : clamp(v.cy, hh, WORLD_HEIGHT - hh),
  };
}

const worldView = (size: Size) => clampView({ cx: WORLD_WIDTH / 2, cy: WORLD_HEIGHT / 2, s: 0 }, size);

// Une région qui remplit le cadre ; sur un petit écran, assez grande pour toucher les îles (on fait glisser la carte
// pour voir le reste), centrée sur `on`. La marge garde visibles les noms des îles du bord.
function regionView(region: Rect, on: Point | undefined, size: Size): View {
  const m = 28;
  const rect = { x: region.x - m, y: region.y - m, w: region.w + 2 * m, h: region.h + 2 * m };
  const fit = Math.min(size.w / rect.w, size.h / rect.h);
  const s = Math.max(fit, Math.min(COMFY, size.h / rect.h));
  const hw = size.w / (2 * s), hh = size.h / (2 * s);
  const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  return clampView({
    s,
    cx: hw * 2 >= rect.w ? mid.x : clamp(on?.x ?? mid.x, rect.x + hw, rect.x + rect.w - hw),
    cy: hh * 2 >= rect.h ? mid.y : clamp(on?.y ?? mid.y, rect.y + hh, rect.y + rect.h - hh),
  }, size);
}

const boxOf = (v: View, size: Size): Rect => ({ x: v.cx - size.w / (2 * v.s), y: v.cy - size.h / (2 * v.s), w: size.w / v.s, h: size.h / v.s });

function useSize(ref: RefObject<HTMLDivElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      setSize((s) => (s && Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// ---------- Position du bateau ----------

interface Sail { from: number; to: number; delay: number }
interface ShipState { at: number; sail?: Sail }

function readShip(): string | null {
  try {
    return localStorage.getItem(SHIP_KEY);
  } catch {
    return null;
  }
}

function writeShip(id: string) {
  try {
    localStorage.setItem(SHIP_KEY, id);
  } catch {
    // stockage indisponible : le bateau partira de l'île de départ la prochaine fois
  }
}

// Oublie la dernière position du bateau (le prochain affichage le fait partir du village de départ)
export function forgetShip() {
  try {
    localStorage.removeItem(SHIP_KEY);
  } catch {
    // rien à oublier
  }
}

// Où le bateau doit être : la prochaine étape, sinon le premier chapitre ouvert, sinon (arc fini) la suite de la route
function shipTarget(stops: Stop[], statuses: Record<string, ChapterStatus>, current?: string): number {
  const at = current ? stops.findIndex((s) => s.chapter === current) : -1;
  if (at >= 0) return at;
  const chapters = stops.flatMap((s, i) => (s.chapter ? [{ id: s.chapter, i }] : []));
  const open = chapters.find((c) => statuses[c.id] === 'open');
  if (open) return open.i;
  if (chapters.length && chapters.every((c) => statuses[c.id] === 'won')) {
    const end = stops.findIndex((s) => s.soon);
    return end >= 0 ? end : stops.length - 1;
  }
  return 0;
}

// D'où part le bateau : sa dernière position connue ; au tout début (rien en mémoire), le village de départ
function shipOrigin(stops: Stop[], target: number, fallback: number): number {
  const stored = readShip();
  if (stored === null) return target === stops.findIndex((s) => s.chapter) ? 0 : fallback;
  const i = stops.findIndex((s) => s.id === stored);
  return i >= 0 ? i : fallback;
}

// ---------- Étiquettes : sous l'île, sinon au-dessus, sinon cachée (visible au survol) ----------

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function placeLabels(items: { id: string; text: string; p: Point; r: number; rank: number }[], fs: number) {
  const out: Record<string, { dy: number; shown: boolean }> = {};
  const placed: Box[] = [];
  const bodies = items.map((i) => ({ id: i.id, box: { x: i.p.x - i.r, y: i.p.y - i.r, w: i.r * 2, h: i.r * 2 } }));
  for (const item of [...items].sort((a, b) => a.rank - b.rank)) {
    const w = item.text.length * fs * 0.53 + fs * 0.4, h = fs * 1.2;
    const below = item.r + fs * 1.05, above = -item.r - fs * 0.4;
    let chosen: number | undefined;
    for (const dy of [below, above]) {
      const box = { x: item.p.x - w / 2, y: item.p.y + dy - fs * 0.95, w, h };
      if (placed.some((b) => overlaps(b, box)) || bodies.some((b) => b.id !== item.id && overlaps(b.box, box))) continue;
      chosen = dy;
      placed.push(box);
      break;
    }
    out[item.id] = chosen === undefined ? { dy: below, shown: item.rank === 0 } : { dy: chosen, shown: true };
  }
  return out;
}

const islandLabel = (info: IslandInfo) => (info.chapter.optional ? `Défi · ${info.chapter.opponent.name}` : `${info.number} · ${info.chapter.place}`);
const STATE_TEXT: Record<ChapterStatus, string> = { locked: 'verrouillé', open: 'à jouer', won: 'gagné' };

// ---------- Composant ----------

export function WorldMap({ arcs, statuses, current, onPick, selected }: WorldMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useSize(frameRef);
  const reduced = useReducedMotion();
  const { touch } = useDevice();
  const [settings] = useSettings();
  const sound = useRef(settings.sound);
  sound.current = settings.sound;

  // La route ne se recalcule que si les chapitres changent (pas à chaque nouvel objet `arcs`)
  const arcsKey = arcs.map((a) => `${a.id}/${a.region}:${a.chapters.map((c) => `${c.id}@${c.order},${c.map.x},${c.map.y}${c.optional ? '*' : ''}${(c.requires ?? []).join('+')}`).join('|')}`).join(';');
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;
  const geo = useMemo(() => geometry(arcsRef.current), [arcsKey]);
  const { stops, segments } = geo;

  // Progression connue : au moins un chapitre ouvert ou gagné (sinon les états ne sont pas encore arrivés)
  const known = geo.islands.some((i) => statuses[i.chapter.id] === 'open' || statuses[i.chapter.id] === 'won');
  const target = known ? shipTarget(stops, statuses, current) : 0;
  const [ship, setShip] = useState<ShipState>(() => {
    if (!known) return { at: 0 };
    const from = shipOrigin(stops, target, target);
    return !reduced && from < target ? { at: from, sail: { from, to: target, delay: 700 } } : { at: target };
  });
  const [arrived, setArrived] = useState<string>();
  const [bubble, setBubble] = useState<{ text: string; p: Point }>();
  const [dragging, setDragging] = useState(false);
  const timers = useRef<{ arrive?: number; bubble?: number }>({});

  const [view, setView] = useState<View>();
  const viewRef = useRef<View | undefined>(undefined);
  const sizeRef = useRef<Size | null>(null);
  sizeRef.current = size;
  const touched = useRef(false);   // la vue a été déplacée par le joueur : on ne la recentre plus d'office
  const anim = useRef(0);

  const apply = useCallback((v: View) => {
    viewRef.current = v;
    setView(v);
  }, []);

  const animateTo = useCallback((goal: View, ms = 450) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    if (!from || reduced) {
      apply(goal);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      apply({ cx: from.cx + (goal.cx - from.cx) * e, cy: from.cy + (goal.cy - from.cy) * e, s: from.s * (goal.s / from.s) ** e });
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [apply, reduced]);

  // Région à montrer d'office : celle de la prochaine étape
  const focusArc = arcs.find((a) => a.chapters.some((c) => c.id === stops[target]?.chapter)) ?? arcs[arcs.length - 1];
  const focusRegion: Region = findRegion(focusArc?.region ?? '') ?? REGIONS.find((r) => r.open) ?? REGIONS[0];
  const focusView = (sz: Size) => regionView(focusRegion.rect, stops[target], sz);

  useLayoutEffect(() => {
    if (!size) return;
    const v = viewRef.current;
    apply(v && touched.current ? clampView(v, size) : focusView(size));
    // focusView change avec la cible, que l'effet de la cible gère ; ici seule la taille compte
  }, [size, apply]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une nouvelle étape (victoire) : le bateau part de sa dernière position
  const prevTarget = useRef(target);
  useEffect(() => {
    if (prevTarget.current === target) return;
    prevTarget.current = target;
    setShip((before) => {
      if (!known) return { at: 0 };
      const from = shipOrigin(stops, target, before.at);
      return !reduced && from < target ? { at: from, sail: { from, to: target, delay: 250 } } : { at: target };
    });
  }, [target, known, stops, reduced]);

  // Le bateau au repos : on retient où il est
  useEffect(() => {
    if (known && !ship.sail && stops[ship.at]) writeShip(stops[ship.at].id);
  }, [ship, stops, known]);

  const reveal = useCallback((p: Point) => {
    const v = viewRef.current, sz = sizeRef.current;
    if (!v || !sz) return;
    const box = boxOf(v, sz);
    const m = 40 / v.s;
    if (p.x > box.x + m && p.x < box.x + box.w - m && p.y > box.y + m && p.y < box.y + box.h - m) return;
    animateTo(clampView({ ...v, cx: p.x, cy: p.y }, sz));
  }, [animateTo]);

  // Au départ d'un voyage, la caméra montre l'île d'arrivée
  useEffect(() => {
    if (ship.sail) reveal(stops[ship.sail.to]);
  }, [ship.sail, stops, reveal]);

  const arrive = useCallback((to: number) => {
    setShip({ at: to });
    const id = stops[to]?.chapter;
    window.clearTimeout(timers.current.arrive);
    if (id) {
      setArrived(id);
      timers.current.arrive = window.setTimeout(() => setArrived(undefined), 1500);
    }
    if (sound.current) sfx('turn');
  }, [stops]);

  const showBubble = useCallback((text: string, p: Point) => {
    setBubble({ text, p });
    window.clearTimeout(timers.current.bubble);
    timers.current.bubble = window.setTimeout(() => setBubble(undefined), 2600);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(anim.current);
    window.clearTimeout(timers.current.arrive);
    window.clearTimeout(timers.current.bubble);
  }, []);

  const zoomAt = useCallback((s: number, at?: Point) => {
    const v = viewRef.current, sz = sizeRef.current;
    if (!v || !sz) return;
    const { min, max } = scaleLimits(sz);
    const ns = clamp(s, min, max);
    const c = at ?? { x: sz.w / 2, y: sz.h / 2 };
    const wx = v.cx + (c.x - sz.w / 2) / v.s, wy = v.cy + (c.y - sz.h / 2) / v.s;
    touched.current = true;
    return clampView({ s: ns, cx: wx - (c.x - sz.w / 2) / ns, cy: wy - (c.y - sz.h / 2) / ns }, sz);
  }, []);

  // Ctrl + molette (et le pincement du pavé tactile) : zoom sous le pointeur, sans faire défiler la page
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const v = viewRef.current;
      const r = svg.getBoundingClientRect();
      const next = v && zoomAt(v.s * Math.exp(-e.deltaY * 0.004), { x: e.clientX - r.left, y: e.clientY - r.top });
      if (next) {
        cancelAnimationFrame(anim.current);
        apply(next);
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt, apply]);

  // Glisser (un doigt ou la souris) et pincer (deux doigts). Un appui sans mouvement reste un clic sur l'île.
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ kind: 'pan'; start: Point; view: View } | { kind: 'pinch'; dist: number; mid: Point; view: View } | null>(null);
  const moved = useRef(false);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const capture = (e: ReactPointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché
    }
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ship.sail) arrive(ship.sail.to);
    const v = viewRef.current;
    if (!v) return;
    cancelAnimationFrame(anim.current);
    if (e.pointerType === 'mouse') pointers.current.clear();
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) {
      moved.current = false;
      gesture.current = { kind: 'pan', start: local(e), view: v };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', dist: Math.max(10, dist(a, b)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: v };
      moved.current = true;
      capture(e);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current, sz = sizeRef.current;
    if (!g || !sz) return;
    if (g.kind === 'pan') {
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      if (!moved.current) {
        if (Math.hypot(dx, dy) < 6) return;
        moved.current = true;
        setDragging(true);
        capture(e);
      }
      touched.current = true;
      apply(clampView({ s: g.view.s, cx: g.view.cx - dx / g.view.s, cy: g.view.cy - dy / g.view.s }, sz));
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const { min, max } = scaleLimits(sz);
      const s = clamp((g.view.s * Math.max(10, dist(a, b))) / g.dist, min, max);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wx = g.view.cx + (g.mid.x - sz.w / 2) / g.view.s, wy = g.view.cy + (g.mid.y - sz.h / 2) / g.view.s;
      touched.current = true;
      apply(clampView({ s, cx: wx - (mid.x - sz.w / 2) / s, cy: wy - (mid.y - sz.h / 2) / s }, sz));
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const v = viewRef.current;
    if (pointers.current.size === 1 && v) {
      gesture.current = { kind: 'pan', start: [...pointers.current.values()][0], view: v };
    } else if (!pointers.current.size) {
      gesture.current = null;
      setDragging(false);
    }
  };

  // Après un glissement, le relâchement n'est pas un clic
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!moved.current) return;
    e.stopPropagation();
    e.preventDefault();
  };

  const toWorld = (e: ReactMouseEvent): Point => {
    const v = viewRef.current, sz = sizeRef.current;
    if (!v || !sz) return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    const p = local(e);
    return { x: v.cx + (p.x - sz.w / 2) / v.s, y: v.cy + (p.y - sz.h / 2) / v.s };
  };

  // ----- Rendu -----
  const box = view && size ? boxOf(view, size) : { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };
  const s = view?.s ?? 1;
  const k = Math.max(0.05, Math.round((1 / s) * 20) / 20);   // unités par pixel (arrondi : moins de rendus pendant un zoom)
  const isWorld = !!(view && size) && view.s <= scaleLimits(size).min * 1.04;
  const isMax = !!(view && size) && view.s >= scaleLimits(size).max * 0.98;
  const pickable = R * s >= 10;   // îles trop petites (vue du monde sur téléphone) : un appui zoome sur la région

  const onRegion = (region: Region, e: ReactMouseEvent) => {
    const p = toWorld(e);
    if (!region.open) {
      showBubble(`${region.name}${region.subtitle ? ` (${region.subtitle})` : ''} : bientôt !`, p);
    } else if (size && (isWorld || !pickable)) {
      touched.current = true;
      animateTo(regionView(region.rect, p, size));
    }
  };

  const fs = clamp(12.5 * k, 8.5, 34);
  const labels = useMemo(() => placeLabels([
    ...geo.islands.map((info) => {
      const status = statuses[info.chapter.id] ?? 'locked';
      const rank = info.chapter.id === current || info.chapter.id === selected ? 0
        : status === 'open' ? (info.chapter.optional ? 2 : 1) : status === 'won' ? 3 : 4;
      return { id: info.chapter.id, text: islandLabel(info), p: info.p, r: R, rank };
    }),
    ...LANDMARKS.filter((l) => l.id === 'fuchsia').map((l) => ({ id: l.id, text: `${l.name.replace('Village de ', '')} (${l.note ?? ''})`, p: l, r: 13, rank: 5 })),
  ], fs), [geo, statuses, current, selected, fs]);

  const shipStop = stops[ship.at];
  const atEnd = !ship.sail && !!shipStop?.soon && known;

  return (
    <div className="op-wm">
      <div className="op-wm-frame" ref={frameRef}>
        <svg
          ref={svgRef}
          className={dragging ? 'op-wm-svg op-wm-dragging' : 'op-wm-svg'}
          viewBox={`${f1(box.x)} ${f1(box.y)} ${f1(box.w)} ${f1(box.h)}`}
          role="group"
          aria-label="Carte du monde de l’aventure"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !e.currentTarget.hasPointerCapture(e.pointerId)) onPointerEnd(e); }}
          onClickCapture={onClickCapture}
        >
          <MapDefs />
          <Ground />
          <DecorLayer decor={geo.decor} />
          <g>
            {REGIONS.map((region) => (
              <rect key={region.id} className="op-wm-region-hit" x={region.rect.x} y={region.rect.y} width={region.rect.w} height={region.rect.h} fill="transparent" onClick={(e) => onRegion(region, e)} />
            ))}
          </g>
          <Fog />
          <Overlay k={k} />
          <Route segments={segments} at={ship.at} last={geo.last} k={k} />
          <Trips trips={geo.trips} statuses={statuses} k={k} />
          <Landmarks labels={labels} fs={fs} />
          {geo.islands.map((info) => (
            <IslandView
              key={info.chapter.id}
              info={info}
              status={statuses[info.chapter.id] ?? 'locked'}
              isCurrent={known && info.chapter.id === stops[target]?.chapter}
              isSelected={info.chapter.id === selected}
              arrive={info.chapter.id === arrived}
              k={k}
              fs={fs}
              label={labels[info.chapter.id]}
              pickable={pickable}
              onPick={onPick}
              onFocus={reveal}
            />
          ))}
          <Ship stops={stops} segments={segments} at={ship.at} sail={ship.sail} k={k} sound={sound} onArrive={arrive} />
          {atEnd && shipStop && <Bubble text="La suite de l’aventure : bientôt !" p={{ x: shipStop.x - R, y: shipStop.y - 26 * k }} k={k} box={box} />}
          {bubble && <Bubble text={bubble.text} p={bubble.p} k={k} box={box} />}
          <Frame />
        </svg>
      </div>
      {/* hors du dessin (tâche R3.5) : les boutons ne cachent plus les noms des îles ni des régions */}
      <div className="op-wm-controls">
        <button
          className="op-wm-ctrl op-wm-ctrl-wide"
          data-ui="map.world"
          onClick={() => { if (!size) return; touched.current = !isWorld; animateTo(isWorld ? focusView(size) : worldView(size)); }}
          title={isWorld ? `Zoomer sur ${focusRegion.name}` : 'Voir tout le monde'}
        >
          {isWorld ? `⚓ ${focusRegion.name}` : '🌍 Le monde'}
        </button>
        <button className="op-wm-ctrl" data-ui="map.zoom-out" onClick={() => { const v = view && zoomAt(view.s / 1.5); if (v) animateTo(v, 250); }} disabled={isWorld} aria-label="Dézoomer" title="Dézoomer">−</button>
        <button className="op-wm-ctrl" data-ui="map.zoom-in" onClick={() => { const v = view && zoomAt(view.s * 1.5); if (v) animateTo(v, 250); }} disabled={isMax} aria-label="Zoomer" title="Zoomer">+</button>
      </div>
      <div className="op-wm-legend" aria-hidden="true">
        <span><svg viewBox="-11 -11 22 22"><Badge kind="flag" /></svg> À jouer</span>
        <span><svg viewBox="-11 -11 22 22"><Badge kind="check" /></svg> Gagné</span>
        <span><svg viewBox="-11 -11 22 22"><Badge kind="lock" /></svg> Verrouillé</span>
        <span><svg viewBox="-11 -11 22 22"><Badge kind="swords" /></svg> Défi bonus</span>
        <span className="op-wm-hint">
          {touch ? 'Touche une île pour la choisir · glisse pour te déplacer · pince pour zoomer' : 'Clique sur une île pour la choisir · fais glisser la carte · Ctrl + molette pour zoomer'}
        </span>
      </div>
    </div>
  );
}

// ---------- Couches du dessin ----------

function MapDefs() {
  return (
    <defs>
      <radialGradient id="op-wm-paper" cx="50%" cy="45%" r="75%">
        <stop offset="0" stopColor="#f8ebc9" />
        <stop offset="0.65" stopColor="#efdcab" />
        <stop offset="1" stopColor="#d9b878" />
      </radialGradient>
      <radialGradient id="op-wm-vignette" cx="50%" cy="50%" r="72%">
        <stop offset="0.62" stopColor="#7a4e22" stopOpacity="0" />
        <stop offset="1" stopColor="#7a4e22" stopOpacity="0.38" />
      </radialGradient>
      <radialGradient id="op-wm-stain">
        <stop offset="0" stopColor="#9a6a32" stopOpacity="0.16" />
        <stop offset="1" stopColor="#9a6a32" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="op-wm-ridge" x1="0" x2="1">
        <stop offset="0" stopColor="#9c4630" />
        <stop offset="0.5" stopColor="#c66d49" />
        <stop offset="1" stopColor="#9c4630" />
      </linearGradient>
      <pattern id="op-wm-hatch" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 7L7 0" stroke={INK} strokeWidth="0.8" opacity="0.45" />
      </pattern>
      <clipPath id="op-wm-clip">
        <rect x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} />
      </clipPath>
    </defs>
  );
}

// Voile grisé sur tout ce qui n'est pas encore ouvert : la carte entière moins les régions ouvertes (élargies jusqu'aux
// bords de leur mer, sous la Red Line et les lignes de Grand Line)
const CLOSED_SEAS = `M0 0H${WORLD_WIDTH}V${WORLD_HEIGHT}H0Z` + REGIONS.filter((r) => r.open).map(({ rect }) => {
  const x0 = Math.max(0, rect.x - 32), y0 = Math.max(0, rect.y - 32);
  const x1 = Math.min(WORLD_WIDTH, rect.x + rect.w + 32), y1 = Math.min(WORLD_HEIGHT, rect.y + rect.h + 32);
  return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
}).join('');

const STAINS = [{ x: 180, y: 130, rx: 120, ry: 70 }, { x: 760, y: 470, rx: 150, ry: 90 }, { x: 560, y: 90, rx: 90, ry: 50 }, { x: 250, y: 520, rx: 110, ry: 60 }];

// Le parchemin, Grand Line et ses Calm Belts, la Red Line, Reverse Mountain et Marie-Joie
const Ground = memo(function Ground() {
  const gl = GRAND_LINE;
  return (
    <g className="op-wm-deco" aria-hidden="true">
      <rect x={7} y={9} width={WORLD_WIDTH} height={WORLD_HEIGHT} rx="4" fill="#000" opacity="0.4" />
      <g clipPath="url(#op-wm-clip)">
        <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#op-wm-paper)" />
        {STAINS.map((st, i) => <ellipse key={i} cx={st.x} cy={st.y} rx={st.rx} ry={st.ry} fill="url(#op-wm-stain)" />)}
        <path d={CLOSED_SEAS} fill="#cfc6b2" fillRule="evenodd" opacity="0.4" />
        <rect x={-10} y={gl.y - gl.calmBelt} width={WORLD_WIDTH + 20} height={gl.calmBelt} fill="url(#op-wm-hatch)" />
        <rect x={-10} y={gl.y + gl.h} width={WORLD_WIDTH + 20} height={gl.calmBelt} fill="url(#op-wm-hatch)" />
        <rect x={-10} y={gl.y} width={WORLD_WIDTH + 20} height={gl.h} fill="#3f8796" opacity="0.14" />
        <path d={`M-10 ${gl.y}H${WORLD_WIDTH + 10}M-10 ${gl.y + gl.h}H${WORLD_WIDTH + 10}`} stroke={INK} strokeWidth="1.6" />
        <path d={`M-10 ${gl.y - gl.calmBelt}H${WORLD_WIDTH + 10}M-10 ${gl.y + gl.h + gl.calmBelt}H${WORLD_WIDTH + 10}`} stroke={INK} strokeWidth="0.8" opacity="0.7" />
        {RED_LINES.map((line, i) => <Ridge key={i} x={line.x} w={line.w} seed={i + 11} />)}
        <g>
          <path d="M944 254L966 204L984 172L1003 206L1026 254Z" fill="#a8492f" stroke="#5e2414" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M966 204L984 172L1003 206L995 200L988 208L981 198L974 207Z" fill="#fff6e4" stroke="#5e2414" strokeWidth="1" strokeLinejoin="round" />
          <path d="M984 252V214" stroke="#3f8796" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
        </g>
        <g stroke="#5e2414" strokeWidth="0.8" fill="#fff6e4">
          <rect x={350} y={212} width={5} height={12} />
          <rect x={357.5} y={206} width={5} height={18} />
          <rect x={365} y={212} width={5} height={12} />
          <path d="M349.5 212l3 -4l3 4M357 206l3 -5l3 5M364.5 212l3 -4l3 4" fill="#c4553a" strokeLinejoin="round" />
        </g>
      </g>
    </g>
  );
});

function Ridge({ x, w, seed }: { x: number; w: number; seed: number }) {
  const rand = rng(seed * 97);
  const marks: string[] = [];
  for (let y = 6; y < WORLD_HEIGHT; y += 30) {
    const mx = x + (rand() - 0.5) * w * 0.4, my = y + rand() * 10;
    marks.push(`M${f1(mx - 5)} ${f1(my + 3)}L${f1(mx)} ${f1(my - 4)}L${f1(mx + 5)} ${f1(my + 3)}`);
  }
  return (
    <g>
      <path d={ridgePath(x, w, seed)} fill="url(#op-wm-ridge)" stroke="#6b2c1a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={marks.join('')} stroke="#5e2414" strokeWidth="1.1" fill="none" opacity="0.7" />
    </g>
  );
}

// Vaguelettes et îlots (sans rôle dans l'aventure)
const DecorLayer = memo(function DecorLayer({ decor }: { decor: Decor }) {
  return (
    <g className="op-wm-deco" aria-hidden="true">
      <path d={decor.waves.map((p) => `M${f1(p.x - 7)} ${f1(p.y)}q3.5 -3.5 7 0t7 0`).join('')} fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" opacity="0.32" />
      {decor.islets.map((it, i) => (
        <g key={i} transform={`translate(${f1(it.p.x)} ${f1(it.p.y)})`}>
          <path d={blob(it.shape, it.r)} fill="#e6cb8a" stroke={INK} strokeWidth="0.9" />
          {it.r > 6 && <path d={blob(it.shape, it.r * 0.55, -it.r * 0.1, -it.r * 0.12)} fill="#9fb86c" />}
        </g>
      ))}
    </g>
  );
});

const FOG = REGIONS.filter((r) => !r.open).flatMap((r, i) => clouds(r.rect, 300 + i * 17));

// La brume sur les régions « bientôt » : le contour d'encre de chaque nuage, puis son blanc par-dessus (les bulles
// d'un même nuage se fondent)
const Fog = memo(function Fog() {
  return (
    <g className="op-wm-deco" aria-hidden="true">
      {FOG.map((c, i) => (
        <g key={i} opacity="0.9">
          <g fill="none" stroke={INK} strokeWidth="2" opacity="0.4"><Cloud {...c} /></g>
          <g fill="#fbf3dd"><Cloud {...c} /></g>
        </g>
      ))}
    </g>
  );
});

// Noms des mers, des lieux fixes, rose des vents et serpent de mer (au-dessus de la brume)
const Overlay = memo(function Overlay({ k }: { k: number }) {
  const gl = GRAND_LINE;
  const small = clamp(7.5 * k, 8, 13);
  const place = clamp(11 * k, 8, 28);
  return (
    <g className="op-wm-deco" aria-hidden="true">
      <Compass />
      <g transform="translate(150 470)" opacity="0.75">
        <path d="M-58 6h118" stroke={INK} strokeWidth="1" strokeDasharray="5 4" opacity="0.5" />
        <path d="M-46 4q8 -20 18 0M-20 4q9 -22 20 0M8 4q8 -18 17 0" fill="#86a77a" stroke={INK} strokeWidth="1.3" />
        <path d="M25 4q4 -26 16 -24q8 2 6 10q-6 -3 -10 2q-2 6 -2 12" fill="#86a77a" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="40" cy="-16" r="1.4" fill={INK} />
      </g>
      {REGIONS.map((region) => {
        const { x, y, w, h } = region.rect;
        if (region.open) {
          const size = clamp(15 * k, 13, 34);
          return <text key={region.id} className="op-wm-sea" x={x + w / 2} y={y + h - size * 0.25} textAnchor="middle" fontSize={size} letterSpacing={size * 0.35}>{region.name.toUpperCase()}</text>;
        }
        const size = Math.min(h * 0.3, clamp(13 * k, 11, 40));
        return (
          <g key={region.id}>
            <text className="op-wm-region" x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={size} strokeWidth={size * 0.3}>
              {region.name}{region.subtitle ? ` · ${region.subtitle}` : ''}
            </text>
            <text className="op-wm-soon" x={x + w / 2} y={y + h / 2 + size * 0.95} textAnchor="middle" fontSize={size * 0.72} strokeWidth={size * 0.22}>bientôt</text>
          </g>
        );
      })}
      <text className="op-wm-ridge-name" transform={`translate(${RED_LINES[0].x + 4} 470) rotate(-90)`} fontSize={Math.min(12, small + 2)} letterSpacing="3">RED LINE</text>
      <text className="op-wm-belt" x={660} y={gl.y - 5} textAnchor="middle" fontSize={small}>Calm Belt</text>
      <text className="op-wm-belt" x={660} y={gl.y + gl.h + gl.calmBelt - 5} textAnchor="middle" fontSize={small}>Calm Belt</text>
      <text className="op-wm-place" x={960} y={166} textAnchor="end" fontSize={place} strokeWidth={place * 0.3}>Reverse Mountain</text>
      <text className="op-wm-place" x={RED_LINES[0].x} y={gl.y + gl.h + gl.calmBelt + place * 1.1} textAnchor="middle" fontSize={place} strokeWidth={place * 0.3}>Marie-Joie</text>
    </g>
  );
});

const Compass = memo(function Compass() {
  return (
    <g transform="translate(72 84)">
      <circle r="34" fill="#fbf3dd" fillOpacity="0.65" stroke={INK} strokeWidth="1.2" />
      <circle r="28" fill="none" stroke={INK} strokeWidth="0.6" strokeDasharray="2 3" />
      {[45, 135, 225, 315].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -19L3.2 0H0Z" fill="#8a5a2b" />
          <path d="M0 -19L-3.2 0H0Z" fill="#e8d3a2" stroke={INK} strokeWidth="0.5" />
        </g>
      ))}
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -31L5 0H0Z" fill={INK} />
          <path d="M0 -31L-5 0H0Z" fill="#c9a86a" stroke={INK} strokeWidth="0.6" />
        </g>
      ))}
      <circle r="3" fill="#d23b2a" stroke={INK} strokeWidth="0.8" />
      <text y="-37" textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>N</text>
    </g>
  );
});

// La route : déjà parcourue (rouge sombre), à venir (encre), puis la suite du monde, pas encore ouverte (pointillés pâles)
const Route = memo(function Route({ segments, at, last, k }: { segments: Segment[]; at: number; last: number; k: number }) {
  const w = clamp(2.3 * k, 1.4, 5.5);
  const done = segmentsPath(segments.slice(0, at));
  const ahead = segmentsPath(segments.slice(at, Math.max(at, last)));
  const soon = segmentsPath(segments.slice(Math.max(at, last)));
  return (
    <g className="op-wm-deco" aria-hidden="true" fill="none" strokeLinecap="round">
      {soon && <path d={soon} stroke={INK} strokeWidth={w * 0.8} strokeDasharray={`0.1 ${f1(w * 3)}`} opacity="0.45" />}
      {ahead && <path d={ahead} stroke={INK} strokeWidth={w} strokeDasharray={`${f1(w * 2.6)} ${f1(w * 2.4)}`} opacity="0.7" />}
      {done && <path d={done} stroke="#8c2a17" strokeWidth={w * 1.1} strokeDasharray={`${f1(w * 2.8)} ${f1(w * 1.8)}`} />}
    </g>
  );
});

// Détours vers les défis bonus
function Trips({ trips, statuses, k }: { trips: { chapter: string; from: Point; to: Point }[]; statuses: Record<string, ChapterStatus>; k: number }) {
  const w = clamp(2 * k, 1.2, 5);
  return (
    <g className="op-wm-deco" aria-hidden="true" fill="none" strokeLinecap="round">
      {trips.map((t, i) => {
        const mx = (t.from.x + t.to.x) / 2, my = (t.from.y + t.to.y) / 2;
        const dx = t.to.x - t.from.x, dy = t.to.y - t.from.y;
        const d = `M${f1(t.from.x)} ${f1(t.from.y)}Q${f1(mx - dy * 0.18)} ${f1(my + dx * 0.18)} ${f1(t.to.x)} ${f1(t.to.y)}`;
        const won = statuses[t.chapter] === 'won';
        return <path key={i} d={d} stroke={won ? '#8c2a17' : '#b07a18'} strokeWidth={w} strokeDasharray={`${f1(w * 1.4)} ${f1(w * 2.6)}`} opacity={statuses[t.chapter] === 'locked' ? 0.45 : 0.9} />;
      })}
    </g>
  );
}

// Le village de départ
function Landmarks({ labels, fs }: { labels: Record<string, { dy: number; shown: boolean }>; fs: number }) {
  return (
    <g className="op-wm-deco" aria-hidden="true">
      {LANDMARKS.filter((l) => l.kind === 'village').map((l) => (
        <g key={l.id} transform={`translate(${l.x} ${l.y})`}>
          <path d={blob(3, 13)} fill="#e9cf8e" stroke={INK} strokeWidth="1.3" />
          <path d={blob(3, 7.5, -2, -3)} fill="#98b765" />
          <path d="M-4 -2h8v6h-8Z" fill="#fbf3dd" stroke={INK} strokeWidth="0.9" />
          <path d="M-5.5 -2L0 -7L5.5 -2Z" fill="#c4553a" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
          {labels[l.id]?.shown && (
            <text className="op-wm-label op-wm-label-place" y={f1(labels[l.id].dy)} textAnchor="middle" fontSize={f1(fs * 0.9)} strokeWidth={f1(fs * 0.27)}>
              {`${l.name.replace('Village de ', '')} (${l.note ?? ''})`}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

interface IslandProps {
  info: IslandInfo;
  status: ChapterStatus;
  isCurrent: boolean;
  isSelected: boolean;
  arrive: boolean;
  k: number;
  fs: number;
  label?: { dy: number; shown: boolean };
  pickable: boolean;
  onPick: (chapterId: string) => void;
  onFocus: (p: Point) => void;
}

function IslandView({ info, status, isCurrent, isSelected, arrive, k, fs, label, pickable, onPick, onFocus }: IslandProps) {
  const { chapter, p, shape } = info;
  const optional = !!chapter.optional;
  const locked = status === 'locked';
  const paths = ISLANDS[shape];
  const badge: BadgeKind = locked ? 'lock' : status === 'won' ? 'check' : optional ? 'swords' : 'flag';
  const br = clamp(8.5 * k, 6.5, 16);
  const name = islandLabel(info);
  const aria = `${name} : ${chapter.title}${optional ? ' (défi bonus)' : ''}, ${STATE_TEXT[status]}`;
  const sand = locked ? '#e3d6b4' : optional ? '#cbbd9f' : '#e9cf8e';
  const green = locked ? '#cfc6a3' : optional ? '#a1957f' : '#98b765';
  const labelClass = `op-wm-label${isCurrent ? ' op-wm-label-current' : ''}${locked ? ' op-wm-label-locked' : ''}${label?.shown === false ? ' op-wm-label-hidden' : ''}`;
  return (
    <g
      className={`op-wm-island op-wm-${status}`}
      transform={`translate(${f1(p.x)} ${f1(p.y)})`}
      role="button"
      tabIndex={0}
      aria-label={aria}
      style={pickable ? undefined : { pointerEvents: 'none' }}
      onClick={() => onPick(chapter.id)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPick(chapter.id);
      }}
      onFocus={(e) => {
        // au clavier seulement : à la souris, déplacer la carte sous le pointeur ferait manquer le clic
        if (e.currentTarget.matches(':focus-visible')) onFocus(p);
      }}
    >
      <title>{aria}</title>
      <circle r={Math.max(R + 6, 24 * k)} fill="transparent" />
      {isCurrent && <circle className="op-wm-pulse" r={R + 8} fill="none" stroke="#f0c04f" strokeWidth="3" />}
      {isSelected && <circle r={R + 12} fill="none" stroke="#1d6fd8" strokeWidth={clamp(2.4 * k, 2, 5)} strokeDasharray={`${f1(5 * k)} ${f1(3 * k)}`} />}
      {optional && <circle r={R + 7} fill="none" stroke="#b07a18" strokeWidth="1.6" strokeDasharray="5 4" opacity={locked ? 0.5 : 0.95} />}
      <circle className="op-wm-focus" r={R + 10} fill="none" stroke="#1d6fd8" strokeWidth={clamp(2.6 * k, 2, 5)} />
      <circle className="op-wm-hover" r={R + 5} fill="none" stroke="#fffaf0" strokeWidth="2.5" />
      <g className={arrive ? 'op-wm-land op-wm-arrive' : 'op-wm-land'}>
        <path d={paths.shore} fill="#4f9aa6" opacity={locked ? 0.1 : 0.22} />
        <path d={paths.land} fill={sand} stroke={INK} strokeWidth="1.6" strokeDasharray={locked ? '4 3' : undefined} />
        <path d={paths.green} fill={green} />
        {optional ? (
          <path d="M-9 4L-3 -9L2 0L6 -6L11 4Z" fill="#8f8574" stroke={INK} strokeWidth="1.1" strokeLinejoin="round" opacity={locked ? 0.6 : 1} />
        ) : !locked && (
          <g stroke={INK} strokeWidth="0.9" strokeLinejoin="round">
            <path d="M6 6q1 -7 -1 -12" fill="none" strokeWidth="1.4" />
            <path d="M5 -6q-6 -3 -10 1q5 -1 10 -1q-1 -6 -7 -7q5 3 7 7q4 -5 10 -4q-6 1 -10 4q7 -1 9 4q-5 -3 -9 -4Z" fill="#6f9a4a" />
          </g>
        )}
        <g transform={`translate(${f1(R * 0.78)} ${f1(-R * 0.72)}) scale(${f1(br / 10 * 100) / 100})`}><Badge kind={badge} /></g>
      </g>
      <text className={labelClass} y={f1(label?.dy ?? R + fs * 1.05)} textAnchor="middle" fontSize={fs} strokeWidth={f1(fs * 0.3)}>{name}</text>
    </g>
  );
}

type BadgeKind = 'lock' | 'flag' | 'check' | 'swords';

function Badge({ kind }: { kind: BadgeKind }) {
  switch (kind) {
    case 'lock':
      return (
        <g>
          <circle r="10" fill="#5a3b1d" stroke="#fbf3dd" strokeWidth="1.5" />
          <path d="M-3.4 -1V-3.6a3.4 3.4 0 0 1 6.8 0V-1" fill="none" stroke="#fbf3dd" strokeWidth="1.8" />
          <rect x="-5" y="-1.5" width="10" height="7.5" rx="1.3" fill="#fbf3dd" />
        </g>
      );
    case 'flag':
      return (
        <g>
          <circle r="10" fill="#fffaf0" stroke="#5a3b1d" strokeWidth="1.5" />
          <path d="M-3 6.5V-6.5" stroke="#5a3b1d" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M-3 -6.5L6.5 -3.2L-3 0Z" fill="#d23b2a" stroke="#8c1f14" strokeWidth="0.6" strokeLinejoin="round" />
        </g>
      );
    case 'check':
      return (
        <g>
          <circle r="10" fill="#2f9e62" stroke="#fffaf0" strokeWidth="1.5" />
          <path d="M-4.6 0.4L-1.3 3.8L4.9 -3.4" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'swords':
      return (
        <g>
          <circle r="10" fill="#e3a72f" stroke="#5a3b1d" strokeWidth="1.5" />
          <path d="M-5 5L5 -5M5 5L-5 -5" stroke="#3a2410" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M-6 2.2L-2.2 6M6 2.2L2.2 6" stroke="#3a2410" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
  }
}

// Le bateau (dessiné par nous) : la proue vers +x, la ligne de flottaison en y = 0
function ShipShape({ moving }: { moving: boolean }) {
  return (
    <g className="op-wm-bob">
      {moving && <path d="M-20 3q-6 -2.5 -12 0M-19 7.5q-6 -2.5 -12 0" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />}
      <ellipse cy="6" rx="17" ry="3" fill="#2a4a5c" opacity="0.22" />
      <path d="M-15 -1L15 -1L10 7Q0 9 -11 7Z" fill="#8a5428" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-13 1.8H13.2" stroke="#c98d4f" strokeWidth="1.2" />
      <path d="M0 -1V-27" stroke={INK} strokeWidth="1.6" />
      <path d="M-10 -24Q0 -20 10 -24V-7Q0 -4 -10 -7Z" fill="#fffaf0" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M-10 -17.5Q0 -13.8 10 -17.5V-13.2Q0 -9.6 -10 -13.2Z" fill="#d23b2a" />
      <path d="M0 -27L8 -25L0 -23Z" fill="#d23b2a" stroke={INK} strokeWidth="0.6" strokeLinejoin="round" />
    </g>
  );
}

const SHIP_OFFSET = { x: -R * 0.95, y: R * 0.5 };   // amarré en bas à gauche de l'île

interface ShipProps {
  stops: Stop[];
  segments: Segment[];
  at: number;
  sail?: Sail;
  k: number;
  sound: RefObject<boolean>;
  onArrive: (to: number) => void;
}

function Ship({ stops, segments, at, sail, k, sound, onArrive }: ShipProps) {
  const rest = (i: number): { p: Point; dir: number; tilt: number; moving: boolean } => ({ p: stops[i] ?? stops[0], dir: 1, tilt: 0, moving: false });
  const [pose, setPose] = useState(() => rest(sail ? sail.from : at));
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  useEffect(() => {
    if (!sail) {
      setPose(rest(at));
      return;
    }
    const segs = segments.slice(sail.from, sail.to);
    if (!segs.length) {
      arrive.current(sail.to);
      return;
    }
    const lengths = segs.map(segmentLength);
    const total = lengths.reduce((a, b) => a + b, 0);
    const duration = clamp(total * 7, 1500, 5200);   // environ 140 unités par seconde
    setPose(rest(sail.from));
    let raf = 0, t0 = 0, dir = 1;
    const step = (now: number) => {
      t0 ||= now;
      const t = Math.min(1, (now - t0) / duration);
      let d = (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) * total, i = 0;
      while (i < segs.length - 1 && d > lengths[i]) d -= lengths[i++];
      const u = lengths[i] ? Math.min(1, d / lengths[i]) : 1;
      const a = pointOnSegment(segs[i], Math.max(0, u - 0.03)), b = pointOnSegment(segs[i], Math.min(1, u + 0.03));
      if (Math.abs(b.x - a.x) > 0.05) dir = Math.sign(b.x - a.x);
      const tilt = clamp((Math.atan2(b.y - a.y, Math.abs(b.x - a.x)) * 180) / Math.PI * 0.35, -14, 14);
      setPose({ p: pointOnSegment(segs[i], u), dir, tilt, moving: t < 1 });
      if (t < 1) raf = requestAnimationFrame(step);
      else arrive.current(sail.to);
    };
    const timer = window.setTimeout(() => {
      if (sound.current) sfx('draw');
      raf = requestAnimationFrame(step);
    }, sail.delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [sail, at, segments, stops]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = clamp(1.05 * k, 0.85, 2.3);
  return (
    <g className="op-wm-deco op-wm-ship" aria-hidden="true" transform={`translate(${f1(pose.p.x + SHIP_OFFSET.x)} ${f1(pose.p.y + SHIP_OFFSET.y)})`}>
      <g transform={`scale(${f1(size * pose.dir * 100) / 100} ${f1(size * 100) / 100}) rotate(${f1(pose.tilt)})`}>
        <ShipShape moving={pose.moving} />
      </g>
    </g>
  );
}

// Une bulle d'information (région pas encore ouverte, fin de l'arc), gardée dans la partie visible
function Bubble({ text, p, k, box }: { text: string; p: Point; k: number; box: Rect }) {
  const fs = clamp(12 * k, 8, 34);
  const w = text.length * fs * 0.52 + fs * 1.4, h = fs * 2;
  const x = clamp(p.x, box.x + w / 2 + 4 * k, box.x + box.w - w / 2 - 4 * k);
  const y = Math.max(p.y, box.y + h + fs);
  return (
    <g className="op-wm-deco op-wm-bubble" transform={`translate(${f1(x)} ${f1(y)})`}>
      <rect x={f1(-w / 2)} y={f1(-h - fs * 0.6)} width={f1(w)} height={f1(h)} rx={f1(fs * 0.5)} fill="#fffaf0" stroke={INK} strokeWidth={f1(fs * 0.1)} />
      <path d={`M${f1(-fs * 0.5)} ${f1(-fs * 0.62)}L0 0L${f1(fs * 0.5)} ${f1(-fs * 0.62)}`} fill="#fffaf0" stroke={INK} strokeWidth={f1(fs * 0.1)} strokeLinejoin="round" />
      <text y={f1(-h / 2 - fs * 0.6 + fs * 0.36)} textAnchor="middle" fontSize={f1(fs)} fill="#3b2410">{text}</text>
    </g>
  );
}

// Le cadre de la carte et l'assombrissement des bords
const Frame = memo(function Frame() {
  return (
    <g className="op-wm-deco" aria-hidden="true" fill="none">
      <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#op-wm-vignette)" />
      <rect x="1.5" y="1.5" width={WORLD_WIDTH - 3} height={WORLD_HEIGHT - 3} stroke={INK} strokeWidth="3" />
      <rect x="8" y="8" width={WORLD_WIDTH - 16} height={WORLD_HEIGHT - 16} stroke={INK} strokeWidth="1" opacity="0.8" />
      {[[8, 8], [WORLD_WIDTH - 8, 8], [8, WORLD_HEIGHT - 8], [WORLD_WIDTH - 8, WORLD_HEIGHT - 8]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z`} fill={PAPER} stroke={INK} strokeWidth="1" />
      ))}
    </g>
  );
});
