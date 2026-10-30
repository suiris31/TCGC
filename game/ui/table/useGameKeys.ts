// Raccourcis clavier de la partie : Échap ferme ce qui est ouvert, Entrée finit le tour, Ctrl+Z revient avant ton
// dernier choix (contre l'IA seulement), « ? » ouvre ou ferme l'aide, « P » met l'IA en pause ou la reprend (contre l'IA)
import { useEffect, useRef } from 'react';
import { isEndTurnKey, type KeyInput } from '../keys.ts';
import type { Table } from './useTable.ts';

export type GameKey = 'escape' | 'end-turn' | 'undo' | 'help' | 'pause';

// La touche, en geste de la partie (fonction pure, testée par game/tests/table.test.ts). Une liste déroulante garde
// ses touches.
export function gameKey(e: KeyInput): GameKey | null {
  if ((e.target as { tagName?: string } | null)?.tagName === 'SELECT') return null;
  if (e.key === 'Escape') return 'escape';
  if (isEndTurnKey(e)) return 'end-turn';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') return 'undo';
  if (e.key === '?') return 'help';
  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) return 'pause';
  return null;
}

// undo : retour en arrière (absent : Ctrl+Z ne fait rien) ; escape : ce que l'écran ferme en plus du plateau ;
// pause : met l'IA en pause ou la reprend (absent : « P » ne fait rien)
export function useGameKeys(table: Table, extra: { undo?: () => void; escape?: () => void; pause?: () => void } = {}) {
  const latest = useRef({ table, extra });
  latest.current = { table, extra };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { table: t, extra: x } = latest.current;
      switch (gameKey(e)) {
        case 'escape':
          t.closeAll();
          x.escape?.();
          break;
        case 'end-turn':
          if (t.board.canEndTurn) t.board.requestEnd();
          break;
        case 'undo':
          x.undo?.();
          break;
        case 'help':
          t.setHelp((h) => !h);
          break;
        case 'pause':
          x.pause?.();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
