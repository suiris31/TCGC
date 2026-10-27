// Le coach d'une partie contre l'IA : l'analyse de tes décisions en arrière-plan pendant la partie (pump, pour le récap
// de fin), et le conseil sur la décision en cours (hint : à la demande, ou à chaque décision avec « coach automatique »).
// Les décisions et leurs analyses sont celles de l'enregistrement (useGameRecording), qui les sauvegarde.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AiWorker } from '../../ai/client.ts';
import type { Analysis } from '../../ai/search.ts';
import { buildRecap, HINT, isReviewable, REVIEW, toReview, type Move, type MoveReview } from '../../coach/review.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';

// Fils de calcul séparés (créés au premier besoin) : l'analyse en arrière-plan, le conseil à la demande
let reviewWorker: AiWorker | null = null;
let hintWorker: AiWorker | null = null;
const coachWorker = () => (reviewWorker ??= new AiWorker());
const adviceWorker = () => (hintWorker ??= new AiWorker());

export interface CoachInput {
  game: GameState | null;
  human: PlayerId;
  humanTurn: boolean;
  autoCoach: boolean;
  moves: MutableRefObject<Move[]>;
  reviews: MutableRefObject<Map<number, MoveReview>>;
  reviewed: number;                    // nombre d'analyses faites (change à chaque nouvelle analyse)
  onReviewed: (count: number) => void;
}

export function useCoach({ game, human, humanTurn, autoCoach, moves, reviews, reviewed, onReviewed }: CoachInput) {
  const pumping = useRef(false);
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = moves.current.find((m) => isReviewable(m, human) && !reviews.current.has(m.id));
        if (!next) break;
        const analysis = await coachWorker().coach(next.state, { ...REVIEW, include: next.choice });
        if (!moves.current.includes(next)) continue;
        reviews.current.set(next.id, toReview(next, analysis));
        onReviewed(reviews.current.size);
      }
    } finally {
      pumping.current = false;
    }
  }, [moves, reviews, human, onReviewed]);

  // Conseil sur la décision en cours (gardé avec l'état pour lequel il a été demandé)
  const [hint, setHint] = useState<{ for: GameState; analysis: Analysis | null } | null>(null);
  const hintNow = hint && hint.for === game ? hint : null;
  const askHint = useCallback(() => {
    if (!game) return;
    const current = game;
    setHint({ for: current, analysis: null });
    adviceWorker().coach(current, HINT).then((analysis) => {
      setHint((h) => (h && h.for === current ? { for: current, analysis } : h));
    });
  }, [game]);
  const d = game?.decision ?? null;
  useEffect(() => {
    if (autoCoach && game && humanTurn && d && d.options.length > 1 && !(hint && hint.for === game)) askHint();
  }, [autoCoach, game, humanTurn, d, hint, askHint]);

  // Récap de fin : quand toutes tes décisions sont analysées
  const reviewable = game ? moves.current.filter((m) => isReviewable(m, human)) : [];
  const total = reviewable.length;
  const done = reviewable.filter((m) => reviews.current.has(m.id)).length;
  const over = game !== null && game.winner !== null;
  const recap = useMemo(
    () => (game && over && done === total ? buildRecap(game, moves.current, reviews.current, human) : null),
    [game, over, done, total, reviewed, moves, reviews, human],
  );

  return {
    pump, hintNow, askHint,
    clearHint: () => setHint(null),
    // conseil affiché au moment de ton choix (noté dans l'enregistrement)
    advice: hintNow?.analysis?.best,
    recommended: hintNow?.analysis?.best ?? null,
    recap, progress: { done, total },
  };
}

export type Coach = ReturnType<typeof useCoach>;
