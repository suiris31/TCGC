// En-tête du plateau : la marque, les decks en présence, le tour et la phase, un emplacement d'état (présence de
// l'adversaire en ligne ; l'horloge du classé à l'étape 3), puis les boutons (retour en arrière, son, panneau,
// réglages, guide du deck, aide, quitter)
import type { ReactNode } from 'react';
import { useSettings } from '../settings.ts';
import type { Table } from './useTable.ts';

// Ce qui change selon le mode
export interface TopBarSlots {
  brand: string;                                         // « ☠ OP Coach », « 🌐 En ligne »
  match: ReactNode;                                      // les decks en présence
  matchTitle?: string;                                   // leur texte entier, au survol
  rival: string;                                         // l'adversaire en un mot, dans la pastille du tour (« IA »)
  phase?: string;                                        // la phase en mots, sur ordinateur (sinon : à qui le tour)
  status?: ReactNode;                                    // emplacement après la pastille du tour
  undo?: { onClick: () => void; disabled: boolean };     // retour en arrière (contre l'IA)
  leave: { label: string; title?: string; onClick: () => void };
}

// guideDeck : le deck dont le guide s'ouvre ; theirs : l'adversaire dans les phrases (« l’IA », « ton adversaire ») ;
// coach : le panneau a un onglet Coach
export function TopBar({ table, brand, match, matchTitle, rival, phase, status, undo, leave, guideDeck, theirs, coach }: TopBarSlots & {
  table: Table;
  guideDeck: string;
  theirs: string;
  coach: boolean;
}) {
  const [settings, updateSettings] = useSettings();
  const { board } = table;
  const s = board.state!;
  const turn = `${s.winner !== null ? 'fin' : s.active === board.seat ? 'à toi' : rival}${s.battle ? ' ⚔' : ''}`;
  return (
    <header className="op-topbar">
      <div className="op-brand">{brand}</div>
      <div className="match op-small op-muted" title={matchTitle}>{match}</div>
      <div className={`phase-pill ${s.active === board.seat ? 'pill-me' : 'pill-opp'}`}>
        Tour {s.turn || 1} · {board.compact || !phase ? turn : phase}
      </div>
      {status}
      <div className="top-actions">
        {undo && <button className="icon-btn" data-ui="table.undo" onClick={undo.onClick} disabled={undo.disabled} title="Revenir avant ton dernier choix (Ctrl+Z)">↶</button>}
        <button className="icon-btn hide-compact" data-ui="table.sound" onClick={() => updateSettings({ sound: !settings.sound })} title={settings.sound ? 'Couper le son' : 'Activer le son'}>{settings.sound ? '🔊' : '🔇'}</button>
        <button className={`icon-btn only-compact ${board.recommended ? 'icon-reco' : ''}`} data-ui="table.panel" onClick={(e) => { e.stopPropagation(); table.setPanel((o) => !o); }}
          title={coach ? 'Journal, coach et tous les choix' : 'Journal et tous les choix'}>📜</button>
        <button className="icon-btn" data-ui="table.settings" onClick={() => table.setSettingsOpen(true)} title="Réglages" aria-label="Réglages">⚙</button>
        <button className="icon-btn" data-ui="table.guide" onClick={() => table.setGuide(guideDeck)} title={`Guide de ton deck (et de celui de ${theirs})`}>📖</button>
        <button className="icon-btn hide-compact" data-ui="table.help" onClick={() => table.setHelp(true)} title="Aide et mots-clés (?)">?</button>
        <button className="op-btn op-btn-ghost btn-small" data-ui="table.leave" onClick={leave.onClick} title={leave.title}>{leave.label}</button>
      </div>
    </header>
  );
}
