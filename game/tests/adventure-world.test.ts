// Carte du monde de l'aventure (tâche 1.3) : régions dans le cadre, chaque arc dans une région ouverte, îles assez
// espacées pour être touchées, route du voyage (départ, chapitres obligatoires dans l'ordre, suite « bientôt ») et
// détours vers les défis bonus
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARCS } from '../adventure/arcs.ts';
import type { Arc, Chapter } from '../adventure/types.ts';
import {
  LANDMARKS, REGIONS, ROUTE, WORLD_HEIGHT, WORLD_WIDTH, chapterPoint, findLandmark, findRegion, pointOnSegment, segmentLength,
  segmentsPath, sideTrips, smoothSegments, voyage,
} from '../adventure/world.ts';

const chapter = (id: string, order: number, x: number, y: number, more: Partial<Chapter> = {}): Chapter => ({
  id, order, title: id, place: id, map: { x, y }, opponent: { name: 'Adversaire', deck: 'ST-21', level: 1 },
  intro: [], victory: [], defeat: [], rewards: [], ...more,
});

// Un arc d'essai : trois chapitres et un défi bonus après le premier
const ESSAI: Arc = {
  id: 'essai', title: 'Essai', region: 'east-blue', boosterSet: 'OP03',
  chapters: [
    chapter('c-3', 3, 0.8, 0.5),
    chapter('c-1', 1, 0.2, 0.5),
    chapter('defi', 1.5, 0.3, 0.1, { optional: true, requires: ['c-1'] }),
    chapter('c-2', 2, 0.5, 0.5),
  ],
};

const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x - 1e-9 && p.x <= r.x + r.w + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.h + 1e-9;

test('carte du monde : régions uniques, dans le cadre, East Blue ouverte et les autres « bientôt »', () => {
  assert.equal(new Set(REGIONS.map((r) => r.id)).size, REGIONS.length);
  for (const { id, rect } of REGIONS) {
    assert.ok(rect.w > 0 && rect.h > 0, id);
    assert.ok(inside({ x: rect.x, y: rect.y }, { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT }), id);
    assert.ok(inside({ x: rect.x + rect.w, y: rect.y + rect.h }, { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT }), id);
  }
  assert.equal(findRegion('east-blue')?.open, true);
  for (const id of ['grand-line', 'nouveau-monde', 'north-blue', 'west-blue', 'south-blue']) assert.equal(findRegion(id)?.open, false, id);
  for (const l of LANDMARKS) assert.ok(inside(l, { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT }), l.id);
});

test('carte du monde : chaque arc est dans une région ouverte, ses îles dans sa zone et assez espacées', () => {
  for (const arc of ARCS) {
    const region = findRegion(arc.region);
    assert.ok(region?.open, `${arc.id} : région ${arc.region} absente ou fermée`);
    const points = arc.chapters.map((c) => {
      assert.ok(c.map.x >= 0 && c.map.x <= 1 && c.map.y >= 0 && c.map.y <= 1, `${c.id} : position hors de 0..1`);
      const p = chapterPoint(arc, c);
      assert.ok(inside(p, region.rect), c.id);
      return { id: c.id, ...p };
    });
    // une île fait 44 unités de large : deux îles (ou une île et un lieu fixe) ne doivent pas se chevaucher
    for (const [i, a] of points.entries()) {
      for (const b of points.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 50, `${a.id} et ${b.id} trop proches sur la carte`);
      for (const l of LANDMARKS) assert.ok(Math.hypot(a.x - l.x, a.y - l.y) >= 40, `${a.id} trop proche de ${l.name}`);
    }
  }
});

test('carte du monde : position d’un chapitre, bornée à sa zone', () => {
  const rect = findRegion('east-blue')!.rect;
  assert.deepEqual(chapterPoint(ESSAI, chapter('x', 1, 0, 1)), { x: rect.x, y: rect.y + rect.h });
  assert.deepEqual(chapterPoint(ESSAI, chapter('x', 1, 2, -1)), { x: rect.x + rect.w, y: rect.y });
  assert.deepEqual(chapterPoint({ ...ESSAI, region: 'mer-inconnue' }, chapter('x', 1, 0.5, 0.5)), { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
});

test('carte du monde : la route part de Fuchsia, suit les chapitres obligatoires dans l’ordre, puis continue « bientôt »', () => {
  for (const step of ROUTE) {
    if ('place' in step) assert.ok(findLandmark(step.place), step.place);
    if ('region' in step) assert.ok(findRegion(step.region), step.region);
  }
  const stops = voyage([ESSAI]);
  assert.equal(stops[0].id, 'fuchsia');
  assert.deepEqual(stops.filter((s) => s.chapter).map((s) => s.id), ['c-1', 'c-2', 'c-3']);
  const last = stops.findIndex((s) => s.id === 'c-3');
  assert.deepEqual(stops.map((s) => s.soon), stops.map((_, i) => i > last));
  assert.ok(stops.some((s) => s.id === 'reverse-mountain' && s.soon));
  assert.equal(new Set(stops.map((s) => s.id)).size, stops.length);

  // les vrais arcs : tous les chapitres obligatoires, aucun défi bonus
  const real = voyage(ARCS).filter((s) => s.chapter).map((s) => s.id);
  assert.deepEqual(real, ARCS.flatMap((a) => [...a.chapters].sort((x, y) => x.order - y.order).filter((c) => !c.optional).map((c) => c.id)));

  // sans arc, tout ce qui suit le départ est « bientôt »
  assert.deepEqual(voyage([]).map((s) => s.soon), voyage([]).map((_, i) => i > 0));
});

test('carte du monde : un défi bonus est un détour depuis le chapitre qu’il exige', () => {
  const trips = sideTrips([ESSAI]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].chapter, 'defi');
  assert.deepEqual(trips[0].from, chapterPoint(ESSAI, ESSAI.chapters[1]));
  assert.deepEqual(trips[0].to, chapterPoint(ESSAI, ESSAI.chapters[2]));
  // sans `requires` : le chapitre obligatoire qui le précède
  const sans = { ...ESSAI, chapters: ESSAI.chapters.map((c) => (c.id === 'defi' ? { ...c, order: 2.5, requires: undefined } : c)) };
  assert.deepEqual(sideTrips([sans])[0].from, chapterPoint(ESSAI, ESSAI.chapters[3]));
  for (const arc of ARCS) {
    for (const c of arc.chapters.filter((x) => x.optional)) assert.ok(sideTrips(ARCS).some((t) => t.chapter === c.id), c.id);
  }
});

test('carte du monde : la courbe de la route passe par chaque étape', () => {
  const points = voyage([ESSAI]);
  const segments = smoothSegments(points);
  assert.equal(segments.length, points.length - 1);
  segments.forEach((s, i) => {
    assert.deepEqual(pointOnSegment(s, 0), { x: points[i].x, y: points[i].y });
    const end = pointOnSegment(s, 1);
    assert.ok(Math.abs(end.x - points[i + 1].x) < 1e-9 && Math.abs(end.y - points[i + 1].y) < 1e-9);
    assert.ok(segmentLength(s) >= Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) - 1e-6);
  });
  assert.match(segmentsPath(segments), /^M[\d.]+ [\d.]+(C[\d. -]+)+$/);
  assert.equal(segmentsPath([]), '');
});
