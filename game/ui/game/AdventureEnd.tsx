// Fin d'une partie imposée par l'aventure : le résultat, le récap du coach (ou sa progression), puis la suite de
// l'aventure (le gain est montré par l'aventure, avec le résultat du chapitre)
import type { Recap } from '../../coach/review.ts';
import type { GameState } from '../../engine/types.ts';
import { RecapBody } from '../Coach.tsx';

export function AdventureEnd({ game, won, practice, recap, progress: { done, total }, onReplay, onNext, onBoard }: {
  game: GameState;
  won: boolean;
  practice: boolean;
  recap: Recap | null;
  progress: { done: number; total: number };
  onReplay: (id: number) => void;
  onNext: () => void;
  onBoard: () => void;
}) {
  return (
    <div className="modal-box recap">
      <div className="recap-top">
        <h2 className={won ? 'win' : 'loss'}>{won ? 'Victoire !' : 'Défaite'}</h2>
        <p>{game.winReason ?? ''} · {game.turn} tours</p>
        {practice && <p className="op-small op-muted">Partie reprise depuis un moment revu : elle ne compte pas pour l’aventure.</p>}
      </div>
      {recap ? <RecapBody recap={recap} onReplay={onReplay} /> : (
        <div className="progress">
          <div className="op-small">Le coach analyse tes décisions… {done}/{total}</div>
          <div className="progress-bar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        </div>
      )}
      <div className="end-actions">
        <button className="op-btn op-btn-primary" data-ui="end.next" onClick={onNext}>Suite de l’aventure →</button>
        <button className="op-btn op-btn-ghost" data-ui="end.board" onClick={onBoard}>Voir le plateau</button>
      </div>
    </div>
  );
}
