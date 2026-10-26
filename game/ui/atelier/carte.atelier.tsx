// Atelier de la carte du monde (tâche 1.3) : la carte avec des progressions de démonstration. « Gagner la prochaine
// étape » simule une première victoire : l'île suivante s'ouvre et le bateau y navigue. Rien n'est enregistré, sauf
// la dernière position du bateau dans le navigateur (comme sur la vraie carte).
import { useMemo, useState } from 'react';
import { ARCS } from '../../adventure/arcs.ts';
import { chapterStatuses, currentChapter } from '../../adventure/progress.ts';
import type { ChapterStatus } from '../../adventure/types.ts';
import { WorldMap, forgetShip } from '../adventure/WorldMap.tsx';

export const title = 'Carte du monde';

const STATE: Record<ChapterStatus, string> = { locked: '🔒 verrouillé', open: '🚩 à jouer', won: '✅ gagné' };

export function render() {
  return <MapDemo />;
}

function MapDemo() {
  const chapters = useMemo(() => ARCS.flatMap((arc) => [...arc.chapters].sort((a, b) => a.order - b.order)), []);
  const story = chapters.filter((c) => !c.optional).map((c) => c.id);
  const bonus = chapters.filter((c) => c.optional);
  // Chapitres obligatoires gagnés avant le premier défi : le défi est alors ouvert
  const beforeBonus = bonus.length ? chapters.filter((c) => !c.optional && c.order < bonus[0].order).map((c) => c.id) : story;
  const presets: { name: string; wins: string[] }[] = [
    { name: 'Départ', wins: [] },
    { name: 'Deux chapitres gagnés', wins: story.slice(0, 2) },
    { name: 'Défi bonus ouvert', wins: beforeBonus },
    { name: 'Défi gagné', wins: [...beforeBonus, ...bonus.map((c) => c.id)] },
    { name: 'Arc terminé', wins: [...story, ...bonus.map((c) => c.id)] },
  ];

  const [wins, setWins] = useState<Set<string>>(() => new Set());
  const [picked, setPicked] = useState<string>();
  const statuses = useMemo(() => Object.assign({}, ...ARCS.map((arc) => chapterStatuses(arc, wins))) as Record<string, ChapterStatus>, [wins]);
  const current = ARCS.map((arc) => currentChapter(arc, wins)).find(Boolean);
  const pickedChapter = chapters.find((c) => c.id === picked);
  const same = (list: string[]) => list.length === wins.size && list.every((id) => wins.has(id));

  return (
    <div className="op-atelier-demo">
      <p className="op-muted op-small">
        Progression simulée (game/adventure/progress.ts). Revenir en arrière pose le bateau sans animation ; avancer le fait
        naviguer. « Revoir le départ » oublie sa position : il repart du village de Fuchsia.
      </p>
      <div className="op-atelier-pages">
        {presets.map((p) => (
          <button key={p.name} className={same(p.wins) ? 'deck-chip on' : 'deck-chip'} onClick={() => setWins(new Set(p.wins))}>{p.name}</button>
        ))}
      </div>
      <div className="op-atelier-pages">
        <button className="op-btn" disabled={!current} onClick={() => current && setWins(new Set([...wins, current]))}>⛵ Gagner la prochaine étape</button>
        <button className="op-btn op-btn-ghost" onClick={() => { forgetShip(); setWins(new Set()); }}>↺ Revoir le départ</button>
      </div>
      <WorldMap arcs={ARCS} statuses={statuses} current={current} onPick={setPicked} selected={picked} />
      <p className="op-small">
        {pickedChapter
          ? <>Île choisie : <strong>{pickedChapter.place}</strong> · {pickedChapter.title} · {pickedChapter.opponent.name} · {STATE[statuses[pickedChapter.id]]}{pickedChapter.optional ? ' · défi bonus' : ''}</>
          : <span className="op-muted">Touche une île : son chapitre s’affiche ici (rien ne se lance).</span>}
      </p>
    </div>
  );
}
