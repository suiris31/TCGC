// Panneau à côté du plateau (tiroir sur téléphone) : les onglets Journal, Coach (contre l'IA) et Tous les choix.
// Emplacements : le contenu de l'onglet Coach, et une note en bas. Sur ordinateur, il se replie en un rail étroit (le
// plateau s'élargit alors) ; le détail d'une carte se lit dans la fiche qui s'ouvre au survol.
import { useState, type ReactNode } from 'react';
import type { Analysis } from '../../ai/search.ts';
import { CoachHint } from '../Coach.tsx';
import { IconButton } from '../kit/index.ts';
import { DecisionBox, GameLog } from '../Panel.tsx';
import type { SideTab, Table } from './useTable.ts';

const COLLAPSED_KEY = 'tcgc.game.side-collapsed';

// Panneau replié ou déplié (ordinateur), retenu d'une partie à l'autre
export function useSideCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const set = (value: boolean) => {
    setCollapsed(value);
    try { localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* stockage indisponible : le choix vaut pour la partie */ }
  };
  return [collapsed, set] as const;
}

export function SidePanel({ table, coach, footer, collapsed = false, onCollapse }: {
  table: Table;
  coach?: ReactNode;
  footer?: ReactNode;
  collapsed?: boolean;                       // replié en rail (ordinateur)
  onCollapse?: (collapsed: boolean) => void;  // absent : le panneau ne se replie pas
}) {
  const { board, panel, setPanel, tab, setTab } = table;
  const s = board.state!;
  if (collapsed && onCollapse) {
    const open = (t: SideTab) => { setTab(t); onCollapse(false); };
    return (
      <aside className="side op-side-rail" data-ui="table.side">
        <IconButton icon="panel-show" label="Déplier le panneau" variant="quiet" data-ui="table.side-expand" onClick={() => onCollapse(false)} />
        <IconButton icon="log" label="Journal" variant="quiet" data-ui="table.rail-journal" onClick={() => open('journal')} />
        {coach && (
          <IconButton icon="help" label={board.recommended ? 'Coach : un conseil est prêt' : 'Coach'} variant="quiet" data-ui="table.rail-coach"
            badge={board.recommended ? '★' : undefined} onClick={() => open('coach')} />
        )}
      </aside>
    );
  }
  return (
    <aside className={panel ? 'side side-open' : 'side'} data-ui="table.side">
      <div className="side-head only-compact">
        <strong>{coach ? 'Journal et coach' : 'Journal'}</strong>
        <button className="icon-btn" data-ui="table.panel-close" onClick={() => setPanel(false)} title="Fermer">✕</button>
      </div>
      {onCollapse && (
        <div className="op-side-head">
          <strong>{coach ? 'Journal et coach' : 'Journal'}</strong>
          <IconButton icon="panel-hide" label="Replier le panneau" variant="quiet" data-ui="table.side-collapse" onClick={() => onCollapse(true)} />
        </div>
      )}
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
