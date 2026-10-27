// En-tête du plateau : la marque, les decks en présence, le tour et la phase, un emplacement d'état (présence de
// l'adversaire en ligne ; l'horloge du classé à l'étape 3), puis les boutons (retour en arrière, son, panneau,
// réglages, guide du deck, aide, quitter). Sur téléphone, les boutons font 44 px : le retour en arrière, le panneau et
// « Quitter » restent en vue, le son, les réglages, le guide et l'aide passent dans le menu « ⋯ ».
import type { ReactNode } from 'react';
import { MoreMenu, type ScreenAction } from '../kit/index.ts';
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
  const sound = { label: settings.sound ? 'Couper le son' : 'Activer le son', onClick: () => updateSettings({ sound: !settings.sound }) };
  const openGuide = () => table.setGuide(guideDeck);
  const guideTitle = `Guide de ton deck (et de celui de ${theirs})`;
  // téléphone : le menu « ⋯ »
  const more: ScreenAction[] = [
    { id: 'sound', label: sound.label, icon: settings.sound ? 'sound-off' : 'sound-on', onClick: sound.onClick, 'data-ui': 'table.sound' },
    { id: 'settings', label: 'Réglages', icon: 'settings', onClick: () => table.setSettingsOpen(true), 'data-ui': 'table.settings' },
    { id: 'guide', label: 'Guide de ton deck', icon: 'deck', onClick: openGuide, 'data-ui': 'table.guide' },
    { id: 'help', label: 'Aide et mots-clés', icon: 'help', onClick: () => table.setHelp(true), 'data-ui': 'table.help' },
  ];
  return (
    <header className="op-topbar">
      <div className="op-brand">{brand}</div>
      <div className="match op-small op-muted" title={matchTitle}>{match}</div>
      <div className={`phase-pill ${s.active === board.seat ? 'pill-me' : 'pill-opp'}`}>
        Tour {s.turn || 1} · {board.compact || !phase ? turn : phase}
      </div>
      {status}
      <div className="top-actions">
        {undo && <button className="icon-btn" data-ui="table.undo" onClick={undo.onClick} disabled={undo.disabled} title="Revenir avant ton dernier choix (Ctrl+Z)" aria-label="Revenir avant ton dernier choix">↶</button>}
        {board.compact ? (
          <>
            <button className={`icon-btn ${board.recommended ? 'icon-reco' : ''}`} data-ui="table.panel" onClick={(e) => { e.stopPropagation(); table.setPanel((o) => !o); }}
              title={coach ? 'Journal, coach et tous les choix' : 'Journal et tous les choix'} aria-label={coach ? 'Journal, coach et tous les choix' : 'Journal et tous les choix'}>📜</button>
            <MoreMenu items={more} label="Son, réglages, guide et aide" data-ui="table.more" />
          </>
        ) : (
          <>
            <button className="icon-btn" data-ui="table.sound" onClick={sound.onClick} title={sound.label} aria-label={sound.label}>{settings.sound ? '🔊' : '🔇'}</button>
            <button className="icon-btn" data-ui="table.settings" onClick={() => table.setSettingsOpen(true)} title="Réglages" aria-label="Réglages">⚙</button>
            <button className="icon-btn" data-ui="table.guide" onClick={openGuide} title={guideTitle} aria-label={guideTitle}>📖</button>
            <button className="icon-btn" data-ui="table.help" onClick={() => table.setHelp(true)} title="Aide et mots-clés (?)" aria-label="Aide et mots-clés">?</button>
          </>
        )}
        <button className="op-btn op-btn-ghost btn-small" data-ui="table.leave" onClick={leave.onClick} title={leave.title}>{leave.label}</button>
      </div>
    </header>
  );
}
