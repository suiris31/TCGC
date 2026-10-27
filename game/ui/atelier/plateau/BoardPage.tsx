// Une page « plateau » de l'atelier : le plateau de la partie contre l'IA (contrôleur commun, game/ui/table/), sur un
// état fixé (plateau/etats.ts), en plein écran. Ni IA, ni coach, ni enregistrement, ni serveur : tes choix sont joués
// sur place, le tour de l'IA attend. « Menu » revient à la liste des pages de l'atelier.
import { useCallback, useMemo, useState } from 'react';
import { LEVELS } from '../../../ai/search.ts';
import { buildRecap, isReviewable } from '../../../coach/review.ts';
import { act } from '../../../engine/engine.ts';
import type { GameState } from '../../../engine/types.ts';
import { EndScreen } from '../../Coach.tsx';
import { phaseLabel } from '../../decision.ts';
import { GameGain } from '../../economy/GameGain.tsx';
import { deckLabel } from '../../myDecks.ts';
import { CoachTab } from '../../table/SidePanel.tsx';
import { stop, TableScreen } from '../../table/TableScreen.tsx';
import { useGameKeys } from '../../table/useGameKeys.ts';
import { useTable } from '../../table/useTable.ts';
import { AI_DECK, boardState, MY_DECK, type BoardState } from './etats.ts';

const ME = 0;
const LEVEL = LEVELS[1].name;

export function BoardPage({ name }: { name: string }) {
  const fixed = useMemo(() => boardState(name), [name]);
  return (
    <div className="op-atelier-board" data-ui="atelier.board" data-state={name}>
      <FixedTable key={name} fixed={fixed} onLeave={() => { window.location.hash = '#play/atelier'; }} />
    </div>
  );
}

function FixedTable({ fixed, onLeave }: { fixed: BoardState; onLeave: () => void }) {
  const [game, setGame] = useState<GameState>(fixed.state);
  const [undo, setUndo] = useState<GameState[]>([]);
  const choose = useCallback((id: string) => {
    setUndo((u) => [...u, game]);
    setGame(act(game, id));
  }, [game]);
  const back = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setUndo(undo.slice(0, -1));
    setGame(previous);
    table.reset();
  };
  const active = game.decision?.player === ME && game.winner === null;
  const table = useTable({ state: game, seat: ME, active, choose, aids: true, recommended: null }, { aim: fixed.aim });
  useGameKeys(table, { undo: back });

  // le récap de fin : les décisions passées de l'état fixé, déjà analysées par le coach
  const moves = fixed.moves ?? [];
  const reviews = useMemo(() => new Map((fixed.reviews ?? []).map((r) => [r.id, r])), [fixed]);
  const reviewable = moves.filter((m) => isReviewable(m, ME));
  const done = reviewable.filter((m) => reviews.has(m.id)).length;
  const recap = game.winner !== null && done === reviewable.length ? buildRecap(game, moves, reviews, ME) : null;
  // « Revoir ce moment », « Rejouer » : le plateau revient à ce moment, ou à l'état fixé
  const goTo = (state: GameState) => {
    setUndo([]);
    setGame(state);
    table.restart();
  };
  const [mine, theirs] = [deckLabel(MY_DECK), deckLabel(AI_DECK)];
  return (
    <TableScreen
      table={table}
      opponent="L’IA"
      thinking={false}
      top={{
        brand: '☠ OP Coach',
        match: <>{mine} <span className="vs">contre</span> {theirs} · IA {LEVEL}</>,
        rival: 'IA',
        phase: phaseLabel(game, ME),
        undo: { onClick: back, disabled: !undo.length },
        leave: { label: 'Menu', onClick: onLeave },
      }}
      decks={{ mine: MY_DECK, theirs: AI_DECK, theirsName: 'l’IA' }}
      coach={<CoachTab table={table} analysis={null} loading={false} onAsk={() => undefined} />}
      hint={{ state: 'idle', ask: () => undefined }}
      end={(
        <div className="modal-wrap" onClick={stop}>
          <EndScreen won={game.winner === ME} reason={game.winReason ?? ''} turns={game.turn} matchup={`${mine} contre ${theirs} (${LEVEL})`}
            record={undefined} practice={false} gain={<GameGain gain={null} onRetry={() => undefined} />}
            progress={{ done, total: reviewable.length }} recap={recap}
            onReplay={(id) => { const m = moves.find((x) => x.id === id); if (m) goTo(m.state); }}
            onRestart={() => goTo(fixed.state)} onBoard={() => table.setShowEnd(false)} onMenu={onLeave} onHistory={onLeave} />
        </div>
      )}
    />
  );
}
