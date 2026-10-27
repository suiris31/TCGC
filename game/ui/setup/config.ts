// Partie rapide contre l'IA : les réglages choisis sur l'écran de départ, et le bilan victoires / défaites par
// confrontation et niveau (relu sur le serveur, mis à jour à la fin de chaque partie qui compte).
import { useEffect, useRef, useState } from 'react';
import { LEVELS, type Level } from '../../ai/search.ts';
import { inQuickRecord, type GameSummary } from '../../coach/archive.ts';
import { freeDeckIds } from '../../engine/decks.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import type { RecordLine } from '../Coach.tsx';
import { loadSummaries, whenSaved } from '../archiveClient.ts';
import { deckLabel } from '../myDecks.ts';

export type First = 'random' | 'me' | 'ai';

export interface Config {
  myDeck: string;
  aiDeck: string;
  first: First;
  level: Level;
  // deck personnalisé : son nom au moment de la partie (gardé dans « Mes parties »)
  myDeckName?: string;
  aiDeckName?: string;
}

// Adversaire « Aléatoire » : un deck du registre (méta ou pour débutant) tiré au sort au lancement de chaque partie,
// autre que le sien quand c'est possible (jamais un adversaire de l'aventure)
export const RANDOM_DECK = 'random';
export function randomDeck(myDeck: string) {
  const pool = freeDeckIds().filter((id) => id !== myDeck);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Bilan victoires / défaites par confrontation et niveau
export type Records = Record<string, RecordLine>;
export const recordKey = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) => `${c.myDeck}|${c.aiDeck}|${c.level}`;
export const matchupName = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) =>
  `${deckLabel(c.myDeck)} contre ${deckLabel(c.aiDeck)} (${LEVELS[c.level].name})`;

// Calculé à partir des parties enregistrées sur le compte : parties terminées contre l'IA, hors entraînement (ni
// l'aventure, ni le jeu en ligne)
function recordsOf(list: GameSummary[]): Records {
  const out: Records = {};
  for (const g of list) {
    if (!inQuickRecord(g)) continue;
    const key = recordKey({ myDeck: g.config.myDeck, aiDeck: g.config.aiDeck, level: g.config.level as Level });
    const line = out[key] ?? { wins: 0, losses: 0 };
    out[key] = g.status === 'won' ? { ...line, wins: line.wins + 1 } : { ...line, losses: line.losses + 1 };
  }
  return out;
}

const counted = (line: RecordLine | undefined, won: boolean) => {
  const l = line ?? { wins: 0, losses: 0 };
  return won ? { ...l, wins: l.wins + 1 } : { ...l, losses: l.losses + 1 };
};

// Le bilan : relu sur le serveur sur l'écran de départ (une fois la dernière partie enregistrée) ; une partie finie y
// compte tout de suite, une seule fois (gameId : son enregistrement), sauf une partie reprise depuis un moment revu
export function useRecords(game: GameState | null, gameId: string | null, human: PlayerId, practice: boolean, session: Config) {
  const [records, setRecords] = useState<Records>({});
  const inGame = game !== null;
  useEffect(() => {
    if (inGame) return;
    let cancelled = false;
    whenSaved().then(loadSummaries).then((list) => { if (!cancelled) setRecords(recordsOf(list)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [inGame]);

  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!game || game.winner === null || practice || !gameId || done.current === gameId) return;
    done.current = gameId;
    const won = game.winner === human;
    setRecords((all) => ({ ...all, [recordKey(session)]: counted(all[recordKey(session)], won) }));
  }, [game, gameId, human, practice, session]);
  return records;
}
