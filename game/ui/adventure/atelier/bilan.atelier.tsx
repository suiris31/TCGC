// Atelier du bilan de l'arc (tâche 1.21) : l'arc terminé avec tous ses défis, ou avec un défi manqué et des boosters
// encore à ouvrir. Données de démonstration, rien n'est lu ni envoyé au serveur.
import { useState } from 'react';
import { EAST_BLUE } from '../../../adventure/east-blue.ts';
import { ArcSummary } from '../ArcSummary.tsx';

export const title = 'Bilan de l’arc';

const at = new Date().toISOString();

const CASES: { name: string; skip: string[]; boosters: number }[] = [
  { name: 'Tout gagné', skip: [], boosters: 0 },
  { name: 'Un défi manqué, boosters en attente', skip: ['eb-defi-mihawk'], boosters: 3 },
];

export function render() {
  return <Demo />;
}

function Demo() {
  const [shown, setShown] = useState<number | null>(0);
  return (
    <div className="op-atelier-demo">
      <div className="op-atelier-pages">
        {CASES.map((c, i) => <button key={c.name} className={shown === i ? 'deck-chip on' : 'deck-chip'} onClick={() => setShown(i)}>{c.name}</button>)}
      </div>
      {shown !== null && (() => {
        const c = CASES[shown];
        const chapters = Object.fromEntries(EAST_BLUE.chapters.map((x, i) => [x.id, c.skip.includes(x.id) ? { wins: 0, firstWinAt: null } : { wins: 1 + (i % 3), firstWinAt: at }]));
        const boosters = Array.from({ length: c.boosters }, (_, i) => ({ id: `demo-${i}`, set: 'OP03', source: 'chapitre eb-6-loguetown', createdAt: at }));
        return <ArcSummary key={shown} arc={EAST_BLUE} adv={{ chapters, boosters }} holdCards={187} onClose={() => setShown(null)} />;
      })()}
    </div>
  );
}
