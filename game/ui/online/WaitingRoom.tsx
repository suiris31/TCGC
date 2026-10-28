// Partie en ligne, avant que l'ami arrive : le code de la salle à lui envoyer, et l'attente
import { useState } from 'react';
import { DECKS } from '../../engine/decks.ts';
import { ADVENTURE_DECK } from '../texts.ts';
import { cancelRoom, type LiveView } from './api.ts';

export function WaitingRoom({ view, onLeave }: { view: LiveView; onLeave: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const code = view.code ?? '';
  const link = `${window.location.origin}${window.location.pathname}#play/salle/${code}`;
  const share = async () => {
    const text = `Rejoins-moi pour une partie de ONE PIECE CARD GAME sur Ma Collection One Piece : code ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Partie en ligne', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setCopied('Lien et code copiés : colle-les dans un message à ton ami.');
      }
    } catch {
      // partage annulé
    }
  };
  const close = async () => {
    await cancelRoom(view.id).catch(() => {});
    onLeave();
  };
  const minutes = view.expiresAt ? Math.max(0, Math.round((new Date(view.expiresAt).getTime() - Date.now()) / 60_000)) : null;
  return (
    <div className="setup lobby">
      <header className="setup-head">
        <h1>🌐 Ta salle est ouverte</h1>
        <p className="op-muted">Donne ce code à ton ami. Il l’entre dans <b>Jouer → Jouer avec un ami → Rejoindre</b>, ou ouvre le lien que tu lui envoies.</p>
      </header>
      <div className="room-code" aria-label="Code de la salle">{code}</div>
      <div className="lobby-actions">
        <button className="op-btn op-btn-primary btn-big" onClick={share}>Envoyer le code</button>
        <button className="op-btn op-btn-ghost" onClick={close}>Fermer la salle</button>
      </div>
      {copied && <p className="good">{copied}</p>}
      <p className="op-muted"><span className="op-spinner" /> En attente de ton ami… La partie commence dès qu’il rejoint la salle{minutes !== null ? ` (encore ${minutes} min)` : ''}.</p>
      <p className="op-small op-muted">Ton deck : {view.you.deckName ?? DECKS[view.you.deck]?.name ?? view.you.deck}{view.you.hold && <> <HoldMark /></>}</p>
    </div>
  );
}

// Repère d'un deck d'aventure (cartes gagnées dans l'Aventure, vérifiées par le serveur au début de la partie)
export function HoldMark() {
  return <span className="op-hold-mark" title={`${ADVENTURE_DECK.markHelp}, vérifiées au début de la partie`}>{ADVENTURE_DECK.mark}</span>;
}
