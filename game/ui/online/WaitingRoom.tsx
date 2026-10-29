// Partie en ligne, avant que l'ami arrive (tâche R3.7) : le code de la salle, « Envoyer le code » (partage du
// téléphone, sinon copie) et « Copier le lien », l'attente avec le temps qui reste. « ← Accueil » laisse la salle
// ouverte (l'accueil la propose dans « Continuer ») ; « Fermer la salle » l'annule.
import { useEffect, useState } from 'react';
import { DECKS } from '../../engine/decks.ts';
import { Button, Screen } from '../kit/index.ts';
import { cancelRoom, type LiveView } from './api.ts';
import { minutesLeft, roomLink } from './room.ts';

export function WaitingRoom({ view, onLeave }: { view: LiveView; onLeave: () => void }) {
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const code = view.code ?? '';
  const link = roomLink(code, window.location);
  const text = `Rejoins-moi pour une partie de ONE PIECE CARD GAME sur Ma Collection One Piece : code ${code}`;
  const copy = async (what: string) => {
    try {
      await navigator.clipboard.writeText(what);
      setSaid({ good: true, text: 'Lien et code copiés : colle-les dans un message à ton ami.' });
    } catch {
      setSaid({ good: false, text: 'Copie impossible ici : recopie le code à la main.' });
    }
  };
  // partage du système (téléphone, et certains ordinateurs) ; sinon la copie fait l'affaire
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try {
      await navigator.share({ title: 'Partie en ligne', text, url: link });
    } catch {
      // partage annulé
    }
  };
  const close = async () => {
    setClosing(true);
    await cancelRoom(view.id).catch(() => {});
    onLeave();
  };
  const minutes = minutesLeft(view.expiresAt, now);
  return (
    <Screen
      className="op-lobby op-room"
      data-ui="room"
      title="Ta salle est ouverte"
      subtitle="Jouer avec un ami"
      back={{ label: 'Accueil', onBack: onLeave, 'data-ui': 'room.back' }}
    >
      <div className="op-lobby-body">
        <section className="op-lobby-card is-main op-room-card" aria-labelledby="op-room-code-label">
          <p id="op-room-code-label" className="op-room-label">Code de la salle</p>
          <div className="room-code" data-ui="room.code" aria-label={`Code de la salle : ${code.split('').join(' ')}`}>{code}</div>
          <div className="op-room-actions">
            {canShare && <Button variant="primary" size="big" onClick={() => void share()} data-ui="room.share">Envoyer le code</Button>}
            <Button variant={canShare ? 'secondary' : 'primary'} size={canShare ? 'normal' : 'big'} onClick={() => void copy(`${text}\n${link}`)} data-ui="room.copy">
              {canShare ? 'Copier le lien' : 'Copier le code et le lien'}
            </Button>
          </div>
          {said && <p className={said.good ? 'good op-room-said' : 'danger op-room-said'} role="status">{said.text}</p>}
          <p className="op-room-wait" role="status">
            <span className="op-spinner" aria-hidden="true" /> En attente de ton ami… La partie commence dès qu’il entre dans la salle
            {minutes !== null ? ` (encore ${minutes} min)` : ''}.
          </p>
        </section>
        <section className="op-lobby-card op-room-help">
          <p>Ton ami ouvre le lien que tu lui envoies, ou entre le code dans <b>Jouer → Jouer avec un ami → Rejoindre</b>.</p>
          <p className="op-room-deck">Ton deck : <b>{view.you.deckName ?? DECKS[view.you.deck]?.name ?? view.you.deck}</b>{view.you.hold && <> <HoldMark /></>}</p>
          <Button variant="quiet" busy={closing} onClick={() => void close()} data-ui="room.close">Fermer la salle</Button>
        </section>
      </div>
    </Screen>
  );
}

// Repère d'un deck de la Cale (cartes gagnées dans l'Aventure, vérifiées par le serveur au début de la partie)
export function HoldMark() {
  return <span className="op-hold-mark" title="Deck de la Cale : seulement des cartes gagnées dans l’Aventure, vérifiées au début de la partie">🧭 Cale</span>;
}
