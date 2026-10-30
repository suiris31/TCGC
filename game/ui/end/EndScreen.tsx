// Écran de fin de partie, le même pour tous les modes (tâche R3.3) : contre l'IA, aventure, en ligne, et le classé à
// l'étape 3 (emplacement `result`, pour la variation de la prime). De haut en bas :
// - le résultat (Victoire ! ou Défaite), sa raison, le nombre de tours, la confrontation ;
// - l'emplacement de résultat, puis ce que la partie rapporte (gain en Berry, GameGain) ;
// - l'analyse du coach : sa progression, puis le récap complet avec « Revoir ce moment » (absente en ligne) ;
// - les suites du mode, collées en bas : « Rejouer » (contre l'IA), « Suite de l'aventure → » (aventure), « Mes
//   parties », « Accueil », et « Voir le plateau », qui le referme (la barre d'action propose alors « Voir le
//   résultat », qui le rouvre).
// Il est rendu dans l'emplacement `end` de TableScreen ; un clic à côté le referme aussi. Rien ne se lance sans un
// bouton.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Recap } from '../../coach/review.ts';
import { RecapBody } from '../Coach.tsx';
import { Button } from '../kit/index.ts';

export type EndMode = 'ia' | 'aventure' | 'en-ligne';

// L'analyse du coach : le récap une fois toutes les décisions analysées, sinon la progression
export interface EndCoach {
  recap: Recap | null;
  progress: { done: number; total: number };
  onReplay?: (moveId: number) => void;   // « Revoir ce moment et le rejouer »
}

export interface EndScreenProps {
  mode: EndMode;
  won: boolean;
  reason: string;
  turns: number;
  matchup?: ReactNode;         // la confrontation, le bilan
  note?: ReactNode;            // une remarque (partie d'entraînement, partie en ligne sans coach)
  result?: ReactNode;          // emplacement de résultat (étape 3 : variation de la prime)
  gain?: ReactNode;            // ce que la partie rapporte (GameGain)
  coach?: EndCoach;            // absent : pas d'analyse (en ligne)
  onRestart?: () => void;      // « Rejouer »
  onNext?: () => void;         // « Suite de l'aventure → »
  nextLabel?: string;
  onHistory?: () => void;      // « Mes parties »
  onHome?: () => void;         // « Accueil »
  onBoard: () => void;         // « Voir le plateau »
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function EndScreen(p: EndScreenProps) {
  const { mode, won, coach } = p;
  const titleId = `${useId()}-titre`;
  const panel = useRef<HTMLDivElement>(null);
  // le focus passe sur l'écran (lu par les lecteurs d'écran), sans appuyer sur un bouton
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  const turns = `${p.turns} tour${p.turns > 1 ? 's' : ''}`;
  return (
    <div ref={panel} className={`op-end ${won ? 'is-won' : 'is-lost'}`} data-mode={mode} role="dialog" aria-modal="true" aria-labelledby={titleId}
      tabIndex={-1} onClick={stop}>
      <div className="op-end-body">
        <header className="op-end-head">
          <h2 id={titleId} className="op-end-title">{won ? 'Victoire !' : 'Défaite'}</h2>
          <p className="op-end-reason">{p.reason ? `${p.reason} · ` : ''}{turns}</p>
          {p.matchup && <p className="op-end-matchup op-small op-muted">{p.matchup}</p>}
          {p.note && <p className="op-end-note op-small op-muted">{p.note}</p>}
        </header>

        {p.result && <div className="op-end-result" data-ui="end.result">{p.result}</div>}
        {p.gain}

        {coach && (coach.recap ? (
          <div className="recap op-end-recap" data-ui="end.recap"><RecapBody recap={coach.recap} onReplay={coach.onReplay} /></div>
        ) : (
          <div className="progress op-end-progress" data-ui="end.progress">
            <div className="op-small">Le coach analyse tes décisions… {coach.progress.done}/{coach.progress.total}</div>
            <div className="progress-bar"><span style={{ width: `${coach.progress.total ? (coach.progress.done / coach.progress.total) * 100 : 0}%` }} /></div>
          </div>
        ))}
      </div>

      <footer className="op-end-actions">
        {p.onNext && <Button variant="primary" data-ui="end.next" onClick={p.onNext}>{p.nextLabel ?? 'Suite de l’aventure →'}</Button>}
        {p.onRestart && <Button variant="primary" icon="retry" data-ui="end.restart" onClick={p.onRestart}>Rejouer</Button>}
        <Button variant="secondary" data-ui="end.board" onClick={p.onBoard}>Voir le plateau</Button>
        {p.onHistory && <Button variant="secondary" icon="history" data-ui="end.history" onClick={p.onHistory}>Mes parties</Button>}
        {p.onHome && <Button variant={p.onNext || p.onRestart ? 'secondary' : 'primary'} data-ui="end.home" onClick={p.onHome}>Accueil</Button>}
      </footer>
    </div>
  );
}
