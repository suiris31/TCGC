// Une page « plateau » de l'atelier : le plateau de la partie contre l'IA (contrôleur commun, game/ui/table/), sur un
// état fixé (plateau/etats.ts), en plein écran. Ni IA, ni coach, ni enregistrement, ni serveur : tes choix sont joués
// sur place, le tour de l'IA attend. « Quitter » revient à la liste des pages de l'atelier. Une partie finie montre l'écran
// de fin du mode demandé (contre l'IA, aventure, en ligne), avec un gain de démonstration.
import { useCallback, useMemo, useState } from 'react';
import { LEVELS } from '../../../ai/search.ts';
import { sayReason } from '../../../coach/logText.ts';
import { buildRecap, isReviewable } from '../../../coach/review.ts';
import { act } from '../../../engine/engine.ts';
import type { GameState } from '../../../engine/types.ts';
import { phaseLabel } from '../../decision.ts';
import { EndScreen, type EndMode } from '../../end/EndScreen.tsx';
import { GameGain, type GainState } from '../../economy/GameGain.tsx';
import type { GameReward } from '../../../economy/types.ts';
import { deckLabel } from '../../myDecks.ts';
import { CoachTab } from '../../table/SidePanel.tsx';
import { TableScreen } from '../../table/TableScreen.tsx';
import { useGameKeys } from '../../table/useGameKeys.ts';
import { useTable } from '../../table/useTable.ts';
import { LEAVE_GAME } from '../../texts.ts';
import { AI_DECK, boardState, MY_DECK, type BoardState } from './etats.ts';

const ME = 0;
const LEVEL = LEVELS[1].name;

// Gain de démonstration (rien n'est réclamé) : comme une réponse du serveur
function demoGain(won: boolean, mode: EndMode): GainState {
  const base = won ? 45 : 12;
  const reward: GameReward = {
    recordId: 'atelier', mode: mode === 'en-ligne' ? 'en-ligne' : 'ia', won, base, coefficient: 1, sameOpponent: 0, amount: base, capped: false,
    dailyBonus: won ? 60 : 0, chest: [], total: base + (won ? 60 : 0),
    wallet: {
      balance: 1_245, dailyBonus: { amount: 60, reserve: 0, keep: 3 },
      chest: { wins: 2, needed: 5, boosters: 2, set: 'OP03', given: false, weekStart: '2026-10-26' },
      today: { earned: 120, cap: 600 },
    },
  };
  return { state: 'done', reward };
}

export function BoardPage({ name, mode = 'ia' }: { name: string; mode?: EndMode }) {
  const fixed = useMemo(() => boardState(name), [name]);
  return (
    <div className="op-atelier-board" data-ui="atelier.board" data-state={name} data-mode={mode}>
      <FixedTable key={name} fixed={fixed} mode={mode} onLeave={() => { window.location.hash = '#play/atelier'; }} />
    </div>
  );
}

function FixedTable({ fixed, mode, onLeave }: { fixed: BoardState; mode: EndMode; onLeave: () => void }) {
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
  const won = game.winner === ME;
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
        leave: { ...LEAVE_GAME, onClick: onLeave },
      }}
      decks={{ mine: MY_DECK, theirs: AI_DECK, theirsName: 'l’IA' }}
      coach={<CoachTab table={table} analysis={null} loading={false} onAsk={() => undefined} />}
      hint={{ state: 'idle', ask: () => undefined }}
      reopenEnd
      end={(
        <EndScreen mode={mode} won={won} reason={sayReason(game, ME)} turns={game.turn}
          matchup={mode === 'ia' ? `Bilan ${mine} contre ${theirs} (${LEVEL}) : aucune partie` : `${mine} contre ${theirs}`}
          note={mode === 'en-ligne' ? 'Le coach était désactivé pendant la partie. Elle est rangée dans « Mes parties » : tu peux l’y revoir et rejouer un moment contre l’IA.' : undefined}
          gain={mode === 'aventure' ? undefined : <GameGain gain={demoGain(won, mode)} onRetry={() => undefined} />}
          coach={mode === 'en-ligne' ? undefined : {
            recap, progress: { done, total: reviewable.length },
            onReplay: (id) => { const m = moves.find((x) => x.id === id); if (m) goTo(m.state); },
          }}
          onRestart={mode === 'ia' ? () => goTo(fixed.state) : undefined}
          onNext={mode === 'aventure' ? onLeave : undefined} nextLabel={won ? 'Récompenses →' : 'Suite de l’aventure →'}
          onHistory={mode === 'aventure' ? undefined : onLeave} onHome={mode === 'aventure' ? undefined : onLeave}
          onBoard={() => table.setShowEnd(false)} />
      )}
    />
  );
}
