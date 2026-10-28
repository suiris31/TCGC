// Partie en ligne : salle d'attente (code à transmettre), puis plateau. Le plateau est celui de la partie contre l'IA
// (contrôleur commun, game/ui/table/), avec la vue envoyée par le serveur : pas de coach, pas de retour en arrière,
// pas de marques « sans intérêt » (aides désactivées), et chaque choix part au serveur, qui arbitre. En fin de partie,
// son gain en Berry (tâche 2.5).
import { useCallback, useEffect, useRef, useState } from 'react';
import { DECKS } from '../../engine/decks.ts';
import type { GameState } from '../../engine/types.ts';
import { loadSummaries } from '../archiveClient.ts';
import { useLeaveGuard } from '../routes.ts';
import { GameGain, useGameGain } from '../economy/GameGain.tsx';
import { LeaveDialog, stop, TableScreen } from '../table/TableScreen.tsx';
import { useGameKeys } from '../table/useGameKeys.ts';
import { useTable } from '../table/useTable.ts';
import { DonLooks } from '../table/DonArt.tsx';
import { resignMatch, sendChoice, useMatch, type LiveView } from './api.ts';
import { HoldMark, WaitingRoom } from './WaitingRoom.tsx';

// La partie finie telle que le serveur l'a rangée dans « Mes parties » (c'est elle qui se réclame) : la plus récente en
// ligne avec ces decks, ce résultat et ce nombre de tours
async function archivedId(view: LiveView, game: GameState): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const found = (await loadSummaries())
      .filter((g) => g.mode === 'online' && g.config.myDeck === view.you.deck && g.config.aiDeck === view.opponent?.deck
        && g.turns === game.turn && g.status === (game.winner === view.seat ? 'won' : 'lost'))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (found) return found.id;
    if (attempt >= 2) throw new Error('Ta partie n’est pas encore rangée dans « Mes parties »');
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export function OnlineMatch({ id, onLeave }: { id: string; onLeave: () => void }) {
  const { view, connected, error, refresh } = useMatch(id);
  if (!view) {
    return (
      <div className="setup lobby">
        {error ? <p className="danger">Impossible d’ouvrir la partie : {error}</p> : <p className="op-muted"><span className="op-spinner" /> Connexion à la partie…</p>}
        <button className="op-btn op-btn-ghost" onClick={onLeave}>Retour</button>
      </div>
    );
  }
  if (view.status === 'waiting') return <WaitingRoom view={view} onLeave={onLeave} />;
  if (view.status === 'cancelled' || view.status === 'expired' || !view.state) {
    return (
      <div className="setup lobby">
        <h2>{view.status === 'expired' ? 'La salle a expiré' : 'La salle est fermée'}</h2>
        <p className="op-muted">Personne ne l’a rejointe à temps. Crée une nouvelle salle et envoie son code à ton ami.</p>
        <button className="op-btn op-btn-primary" onClick={onLeave}>Retour</button>
      </div>
    );
  }
  // les DON!! de chaque joueur : celles de son deck, dites par le serveur (table/DonArt.tsx)
  return <DonLooks looks={view.looks}><OnlineBoard view={view} game={view.state} connected={connected} refresh={refresh} onLeave={onLeave} /></DonLooks>;
}

// ---------- Plateau ----------

function OnlineBoard({ view, game, connected, refresh, onLeave }: { view: LiveView; game: GameState; connected: boolean; refresh: () => void; onLeave: () => void }) {
  const { seat, you, opponent } = view;
  const oppName = opponent?.name ?? 'Adversaire';
  const over = game.winner !== null;
  const [leaving, setLeaving] = useState(false);
  const [sentSeq, setSentSeq] = useState<number | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  // Retour du navigateur pendant la partie : la même question que « Menu » (revenir plus tard, abandonner)
  useLeaveGuard(!over, () => setLeaving(true));
  // mon choix est parti, le serveur n'a pas encore répondu : la barre le dit, au lieu de redemander ce choix
  const sending = Boolean(game.decision?.player === seat && !over && sentSeq === view.seq);
  const send = useCallback((choice: string) => {
    setSentSeq(view.seq);
    sendChoice(view.id, view.seq, choice).catch((e: Error & { code?: string }) => {
      setSentSeq(null);
      if (e.code === 'stale' || e.code === 'not_your_turn') refresh();
      else setAlert(`Choix refusé : ${e.message}`);
    });
  }, [view.id, view.seq, refresh]);
  const active = Boolean(game.decision?.player === seat && !over && !sending);
  const table = useTable({ state: game, seat, active, choose: send, aids: false, recommended: null }, { intro: game.history.length === 0 });
  useGameKeys(table);

  // fin de partie : son gain, demandé une fois (une partie déjà réclamée renvoie le même détail)
  const { gain, claim, retry: retryGain } = useGameGain();
  const claimed = useRef(false);
  useEffect(() => {
    if (!over || claimed.current) return;
    claimed.current = true;
    claim(() => archivedId(view, game));
  }, [over, view, game, claim]);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(t);
  }, [alert]);

  const resign = async () => {
    setLeaving(false);
    await resignMatch(view.id).catch((e: Error) => setAlert(e.message));
  };
  const won = game.winner === seat;
  const myDeck = you.deckName ?? DECKS[you.deck]?.name;
  const oppDeck = opponent?.deckName ?? DECKS[opponent?.deck ?? '']?.name;
  return (
    <TableScreen
      table={table}
      opponent={oppName}
      thinking
      top={{
        brand: '🌐 En ligne',
        match: <>{myDeck}{you.hold && <> <HoldMark /></>} <span className="vs">contre</span> {oppName} · {oppDeck}{opponent?.hold && <> <HoldMark /></>}</>,
        matchTitle: `${myDeck}${you.hold ? ' (deck de la Cale)' : ''} contre ${oppName} · ${oppDeck}${opponent?.hold ? ' (deck de la Cale)' : ''}`,
        rival: oppName,
        status: <span className={view.opponentOnline ? 'presence presence-on' : 'presence'} title={view.opponentOnline ? `${oppName} est connecté` : `${oppName} n’est pas connecté en ce moment`}>●</span>,
        leave: { label: 'Menu', onClick: () => (over ? onLeave() : setLeaving(true)) },
      }}
      decks={{ mine: you.deck, theirs: DECKS[opponent?.deck ?? ''] ? opponent?.deck : undefined, theirsName: 'ton adversaire' }}
      sideNote={<p className="op-small op-muted online-note">Partie en ligne : le coach et les conseils sont désactivés, et tu ne vois que tes propres cartes.</p>}
      alert={(alert || !connected) && <div className="online-alert">{alert ?? 'Connexion perdue : reconnexion…'}</div>}
      center={!view.opponentOnline && !over && <div className="practice">{oppName} n’est pas connecté : la partie reprendra à son retour.</div>}
      sending={sending}
      reopenEnd
      celebration={won ? 'Bien joué, capitaine.' : `${oppName} remporte la partie.`}
      leave={leaving && (
        <LeaveDialog onStay={() => setLeaving(false)} text={`Tu peux revenir plus tard : la partie t’attend (Jouer → reprendre la partie en cours). Ou tu peux l’abandonner : ${oppName} gagne.`}>
          <button className="op-btn op-btn-ghost" data-ui="leave.yes" onClick={onLeave}>Revenir plus tard</button>
          <button className="op-btn op-btn-ghost danger" data-ui="leave.resign" onClick={resign}>Abandonner</button>
          <button className="op-btn op-btn-primary" data-ui="leave.no" onClick={() => setLeaving(false)}>Continuer</button>
        </LeaveDialog>
      )}
      end={(
        <div className="modal-box online-end" onClick={stop}>
          <h2 className={won ? 'good' : 'danger'}>{won ? 'Victoire !' : 'Défaite'}</h2>
          <p>{game.winReason} · {game.turn} tours{you.hold && opponent?.hold ? ' · 🧭 partie avec decks de la Cale' : ''}</p>
          <GameGain gain={gain} onRetry={retryGain} />
          <p className="op-small op-muted">La partie est rangée dans « Mes parties ». Le coach était désactivé pendant la partie ; depuis « Mes parties », tu peux la revoir et rejouer un moment contre l’IA.</p>
          <div className="modal-actions">
            <button className="op-btn op-btn-primary" onClick={onLeave}>Retour au menu</button>
            <button className="op-btn op-btn-ghost" onClick={() => table.setShowEnd(false)}>Voir le plateau</button>
          </div>
        </div>
      )}
    />
  );
}
