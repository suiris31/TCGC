// L'écran de la partie : l'en-tête, le plateau et sa barre d'action, le panneau, les fenêtres des décisions, l'aide,
// les réglages, le guide du deck, la carte en grand, l'intro, l'écran de victoire ou de défaite et la fin de partie.
// Le mode (contre l'IA, en ligne, atelier ; le classé à l'étape 3) donne le contrôleur (useTable) et remplit les
// emplacements : ce qui est écrit dans l'en-tête, l'onglet Coach, les bandeaux, la fin de partie, « Quitter ».
import { useRef, type ReactNode } from 'react';
import { def, findField, power } from '../../engine/rules.ts';
import { DeckGuideModal } from '../DeckGuide.tsx';
import { Celebration, Intro } from '../Fx.tsx';
import { ActionBar } from '../Interaction.tsx';
import { FirstGameTip, HelpModal } from '../Modals.tsx';
import { SettingsPanel } from '../SettingsPanel.tsx';
import { sfx } from '../sound.ts';
import { CardZoom } from '../Zoom.tsx';
import { useAnnouncement, useBoardFocus } from './a11y.ts';
import { verdict } from './center.ts';
import { DecisionLayer } from './DecisionLayer.tsx';
import { GameTable } from './GameTable.tsx';
import { SidePanel, useSideCollapsed } from './SidePanel.tsx';
import { TopBar, type TopBarSlots } from './TopBar.tsx';
import type { Table } from './useTable.ts';

export interface TableScreenProps {
  table: Table;
  opponent: string;              // l'adversaire dans la barre d'action (« L’IA réfléchit… »)
  thinking: boolean;             // il réfléchit (sinon : il joue)
  top: TopBarSlots;
  // les decks des guides : le tien, celui de l'adversaire (s'il a un guide) et son nom dans les phrases (« l’IA »)
  decks: { mine: string; theirs?: string; theirsName: string };
  coach?: ReactNode;             // l'onglet Coach du panneau (absent : pas d'onglet)
  sideNote?: ReactNode;          // une note en bas du panneau
  alert?: ReactNode;             // bandeau d'alerte sous l'en-tête
  center?: ReactNode;            // bandeau au centre du plateau
  lastMove?: ReactNode;          // le dernier coup de l'adversaire, au centre (sinon : lu dans le journal, sur ordinateur)
  bar?: ReactNode;               // une barre à la place de la barre d'action (l'IA en pause)
  hint?: { state: 'idle' | 'loading' | 'ready'; ask: () => void };  // bouton « Conseil » de la barre d'action
  sending?: boolean;             // ton choix est parti, la réponse est attendue (en ligne) : « Envoi… »
  reopenEnd?: boolean;           // après « Voir le plateau », la barre propose « Voir le résultat » (tous les modes)
  celebration?: string;          // la phrase sous « Victoire ! » ou « Défaite »
  end?: ReactNode;               // la fin de partie (EndScreen, end/ ; son contenu arrête le clic, qui sinon la referme)
  leave?: ReactNode;             // la fenêtre « Quitter la partie ? », quand elle est ouverte (LeaveDialog)
}

export function TableScreen({ table, opponent, thinking, top, decks, coach, sideNote, alert, center, lastMove, bar: barSlot, hint, sending, reopenEnd, celebration, end, leave }: TableScreenProps) {
  const { board } = table;
  // au clavier : les flèches dans une zone, Tab d'une zone à l'autre ; la consigne et les actions jouées sont lues
  const root = useRef<HTMLDivElement>(null);
  useBoardFocus(root, board);
  const announcement = useAnnouncement(board, opponent, table.epoch);
  const s = board.state;
  if (!s) return null;
  const won = s.winner === board.seat;
  const { aimedOption } = board;
  // ordinateur : le panneau replié laisse la place au plateau
  const [collapsed, setCollapsed] = useSideCollapsed();
  const folded = collapsed && !board.compact;
  // prévision d'attaque, au centre du plateau (ordinateur) : la cible survolée, sinon l'attaquant choisi
  const attacker = board.targeting ? findField(s, board.targeting.attacker) : null;
  const aim = !board.compact && board.targeting && !s.battle && (board.targetPreview ? (
    <div className={`op-aim ${board.targetPreview.ok ? 'is-ok' : 'is-ko'}`} data-ui="table.aim">{verdict(board.targetPreview.text)}</div>
  ) : attacker && (
    <div className="op-aim" data-ui="table.aim">
      Attaque de <b>{def(attacker.card.num).name}</b> ({power(s, attacker.card.uid)}) : {board.touch ? 'touche' : 'survole'} une cible pour voir le résultat.
    </div>
  ));
  const bar = sending ? (
    <div className="action-bar bar-wait" data-ui="table.sending">
      <div className="bar-text"><span className="op-spinner" /> <strong>Envoi…</strong></div>
    </div>
  ) : reopenEnd && table.over && !table.celebrate && !table.showEnd ? (
    <div className="action-bar">
      <div className="bar-text"><strong>{won ? 'Victoire !' : 'Défaite.'}</strong> <span className="op-muted">{s.winReason}</span></div>
      <div className="bar-buttons">
        <button data-ui="table.reopen-end" className="op-btn op-btn-primary" onClick={() => table.setShowEnd(true)}>Voir le résultat</button>
      </div>
    </div>
  ) : barSlot ?? (
    <ActionBar
      s={s}
      d={s.decision}
      human={board.seat}
      thinking={thinking}
      aiName={opponent}
      targeting={board.targeting}
      preview={board.targetPreview}
      hasCardActions={board.hasCardActions}
      buttons={board.buttons}
      recommended={board.recommended}
      onButton={(id) => { sfx('click'); board.pick(id); }}
      onCancelTargeting={board.cancelTargeting}
      onEndTurn={board.requestEnd}
      onHint={hint && (() => { table.setTab('coach'); if (board.compact) table.setPanel(true); else setCollapsed(false); if (hint.state === 'idle') hint.ask(); })}
      hintState={hint?.state}
      touch={board.touch}
      onConfirmAttack={aimedOption ? () => { sfx('click'); board.pick(aimedOption.id); } : undefined}
    />
  );
  const mine = table.guide === decks.mine;
  return (
    <div className={folded ? 'game op-side-collapsed' : 'game'} data-ui="table" ref={root}>
      <div className="op-sr-only" aria-live="polite" aria-atomic="true" data-ui="table.live">{announcement}</div>
      <GameTable state={s} seat={board.seat} ui={board.ui} epoch={table.epoch} alert={alert} center={<>{aim}{center}</>} bar={bar} lastMove={lastMove}
        top={<TopBar table={table} {...top} guideDeck={decks.mine} theirs={decks.theirsName} coach={Boolean(coach)} />} />
      <SidePanel table={table} coach={coach} footer={sideNote} collapsed={folded} onCollapse={board.compact ? undefined : setCollapsed} />
      <DecisionLayer board={board} />
      {table.tip && !table.intro && s.winner === null && <FirstGameTip onHelp={() => { table.setTip(false); table.setHelp(true); }} onClose={() => table.setTip(false)} />}
      {table.help && !table.intro && <HelpModal onClose={() => table.setHelp(false)} />}
      {table.settingsOpen && <SettingsPanel onClose={() => table.setSettingsOpen(false)} onHelp={() => table.setHelp(true)} />}
      {table.guide && (
        <DeckGuideModal deckId={table.guide} onClose={() => { table.setGuide(null); board.zoom.close(); }} onHover={board.zoom.onHover}
          alt={mine ? decks.theirs : decks.mine} altLabel={mine ? `Voir le deck de ${decks.theirsName}` : 'Voir ton deck'} onSwitch={table.setGuide} />
      )}
      {board.zoom.zoom && <CardZoom s={s} preview={board.zoom.zoom} onClose={board.zoom.close} />}
      {table.intro && <Intro s={s} onDone={() => table.setIntro(false)} />}
      {leave}
      {table.over && table.celebrate && <Celebration won={won} onDone={() => table.setCelebrate(false)} sub={celebration} />}
      {table.over && !table.celebrate && table.showEnd && end && (
        <div className="modal" data-ui="end" onClick={() => table.setShowEnd(false)}>{end}</div>
      )}
    </div>
  );
}

// « Quitter la partie ? » : text explique ce que devient la partie ; children : les boutons (leave.yes, leave.no...)
export function LeaveDialog({ text, onStay, children }: { text: string; onStay: () => void; children: ReactNode }) {
  return (
    <div className="modal" data-ui="leave" onClick={onStay}>
      <div className="modal-box modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h3>Quitter la partie ?</h3>
        <p>{text}</p>
        <div className="modal-actions">{children}</div>
      </div>
    </div>
  );
}
