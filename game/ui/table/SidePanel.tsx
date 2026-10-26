// Panneau à côté du plateau (tiroir sur téléphone) : l'aperçu de la carte survolée, puis les onglets Journal, Coach
// (contre l'IA) et Tous les choix. Emplacements : le contenu de l'onglet Coach, et une note en bas.
import type { ReactNode } from 'react';
import type { Analysis } from '../../ai/search.ts';
import { CoachHint } from '../Coach.tsx';
import { CardPreview, DecisionBox, GameLog } from '../Panel.tsx';
import type { Table } from './useTable.ts';

export function SidePanel({ table, coach, footer }: { table: Table; coach?: ReactNode; footer?: ReactNode }) {
  const { board, panel, setPanel, tab, setTab } = table;
  const s = board.state!;
  return (
    <aside className={panel ? 'side side-open' : 'side'}>
      <div className="side-head only-compact">
        <strong>{coach ? 'Journal et coach' : 'Journal'}</strong>
        <button className="icon-btn" data-ui="table.panel-close" onClick={() => setPanel(false)} title="Fermer">✕</button>
      </div>
      <CardPreview s={s} preview={board.preview} />
      <div className="tabs">
        <button className={tab === 'journal' ? 'op-tab on' : 'op-tab'} data-ui="table.tab-journal" onClick={() => setTab('journal')}>Journal</button>
        {coach && <button className={tab === 'coach' ? 'op-tab on' : 'op-tab'} data-ui="table.tab-coach" onClick={() => setTab('coach')}>Coach{board.recommended ? ' ★' : ''}</button>}
        <button className={tab === 'choix' ? 'op-tab on' : 'op-tab'} data-ui="table.tab-choix" onClick={() => setTab('choix')}>Tous les choix</button>
      </div>
      {tab === 'journal' && <GameLog s={s} human={board.seat} />}
      {tab === 'coach' && coach}
      {tab === 'choix' && (
        <div className="tab-body">
          {board.d ? <DecisionBox decision={board.d} focus={null} notes={{}} onChoose={board.pick} onClearFocus={() => undefined} /> : <p className="op-muted op-small">Pas de décision à prendre pour l’instant.</p>}
        </div>
      )}
      {footer}
    </aside>
  );
}

// L'onglet Coach de la partie contre l'IA : le conseil pour ta décision (analysis : celui du coach, loading : en
// calcul), ou le récap une fois la partie finie
export function CoachTab({ table, analysis, loading, onAsk }: { table: Table; analysis: Analysis | null; loading: boolean; onAsk: () => void }) {
  const { board } = table;
  return (
    <div className="tab-body">
      {table.over ? (
        <button className="op-btn op-btn-primary" onClick={() => table.setShowEnd(true)}>Voir le récap du coach</button>
      ) : board.d ? (
        <CoachHint decision={board.d} analysis={analysis} loading={loading} onAsk={onAsk} onChoose={board.pick} />
      ) : (
        <p className="op-muted op-small">Le coach t’aide pendant tes décisions. Active le conseil automatique dans les réglages (⚙) pour voir une ★ sur le meilleur choix.</p>
      )}
      <p className="op-small op-muted">Le coach analyse aussi chacune de tes décisions en arrière-plan : le récap de fin de partie te montrera tes erreurs et tes meilleurs coups.</p>
    </div>
  );
}
