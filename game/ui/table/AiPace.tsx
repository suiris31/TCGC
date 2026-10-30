// Le rythme de l'IA sur le plateau : la bande centrale qui montre ses dernières décisions (‹ › pour revoir celles de son
// tour, une par une), et la barre d'action quand elle est en pause (« Une décision », « Reprendre »). La logique est dans
// pace.ts ; le bouton de pause est dans l'en-tête (TopBar).
import { useState } from 'react';
import type { AiMove } from './pace.ts';

// moves : les décisions à revoir (shownMoves), la plus récente en dernier ; name : l'IA dans la phrase (« IA »)
export function AiMovesBand({ moves, name }: { moves: AiMove[]; name: string }) {
  // back : combien de décisions on est remonté (0 : la plus récente) ; une nouvelle décision ramène à la plus récente
  const [view, setView] = useState({ count: 0, back: 0 });
  const n = moves.length;
  if (!n) return null;
  const back = view.count === n ? view.back : 0;
  const i = n - 1 - back;
  const go = (b: number) => setView({ count: n, back: b });
  return (
    <div className={`op-last-move op-ai-moves${n > 1 ? ' has-nav' : ''}`} data-ui="table.last-move">
      {n > 1 && (
        <button className="op-ai-nav" data-ui="table.ai-prev" onClick={() => go(back + 1)} disabled={i === 0}
          title="Décision précédente de l’IA" aria-label="Décision précédente de l’IA">‹</button>
      )}
      <span className="op-ai-move" title={moves[i].text}><b>{name}</b> {moves[i].text}</span>
      {n > 1 && (
        <>
          <span className="op-ai-count op-muted" aria-label={`décision ${i + 1} sur ${n} de ce tour`}>{i + 1}/{n}</span>
          <button className="op-ai-nav" data-ui="table.ai-next" onClick={() => go(back - 1)} disabled={back === 0}
            title="Décision suivante de l’IA" aria-label="Décision suivante de l’IA">›</button>
        </>
      )}
    </div>
  );
}

// La barre d'action pendant la pause, quand c'est à l'IA de décider : held, sa décision est prête
export function PausedBar({ held, onStep, onResume }: { held: boolean; onStep: () => void; onResume: () => void }) {
  return (
    <div className="action-bar op-paused-bar" data-ui="table.paused">
      <div className="bar-text">
        <strong>⏸ L’IA est en pause</strong>{' '}
        <span className="op-muted">{held ? 'Sa décision est prête : joue-la quand tu veux.' : <><span className="op-spinner" /> Elle réfléchit, puis attendra.</>}</span>
      </div>
      <div className="bar-buttons">
        <button className="op-btn op-btn-primary" data-ui="table.step" onClick={onStep} title="L’IA joue une seule décision, puis attend de nouveau">⏭ Une décision</button>
        <button className="op-btn op-btn-ghost" data-ui="table.resume-bar" onClick={onResume}>▶ Reprendre</button>
      </div>
    </div>
  );
}
