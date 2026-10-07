// Jouer avec un ami : créer une salle (le serveur donne un code à lui transmettre) ou rejoindre la sienne avec son
// code. Chacun choisit son deck.
import { useState } from 'react';
import { DECKS } from '../../engine/decks.ts';
import { DeckTile } from '../App.tsx';
import { DeckGuideModal } from '../DeckGuide.tsx';
import { CardZoom, useCardZoom } from '../Zoom.tsx';
import { createRoom, joinRoom } from './api.ts';

const DECK_KEY = 'tcgc.game.online-deck';

function lastDeck(): string {
  try {
    const d = localStorage.getItem(DECK_KEY);
    if (d && DECKS[d]) return d;
  } catch { /* stockage indisponible */ }
  return 'ST-35';
}

export function Lobby({ initialCode, onOpen, onBack }: { initialCode?: string; onOpen: (id: string) => void; onBack: () => void }) {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [code, setCode] = useState(initialCode ?? '');
  const [deck, setDeck] = useState(lastDeck);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const cardZoom = useCardZoom(1200);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const pick = (id: string) => {
    setDeck(id);
    try { localStorage.setItem(DECK_KEY, id); } catch { /* stockage indisponible */ }
  };

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = tab === 'create' ? await createRoom(deck) : await joinRoom(clean, deck);
      onOpen(v.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="setup lobby">
      <header className="setup-head">
        <h1>🌐 Jouer avec un ami</h1>
        <p className="op-muted">Crée une salle et envoie son code à ton ami, ou entre le code qu’il t’a donné.</p>
      </header>
      <div className="op-segmented lobby-tabs">
        <button className={tab === 'create' ? 'seg on' : 'seg'} onClick={() => setTab('create')}>Créer une salle</button>
        <button className={tab === 'join' ? 'seg on' : 'seg'} onClick={() => setTab('join')}>Rejoindre</button>
      </div>
      {tab === 'join' && (
        <section className="setup-section">
          <h2>Code de la salle</h2>
          <input className="room-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="EX. K7MQ2P"
            autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" aria-label="Code de la salle" />
        </section>
      )}
      <section className="setup-section">
        <h2>Ton deck</h2>
        <div className="deck-grid">{Object.keys(DECKS).map((id) => <DeckTile key={id} id={id} selected={deck === id} onClick={() => pick(id)} onGuide={setGuide} />)}</div>
      </section>
      {error && <p className="danger lobby-error">{error}</p>}
      <div className="setup-go">
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour</button>
        <button className="op-btn op-btn-primary btn-big" onClick={go} disabled={busy || (tab === 'join' && clean.length !== 6)}>
          {busy ? '…' : tab === 'create' ? 'Créer la salle' : 'Rejoindre la partie'}
        </button>
      </div>
      <p className="op-small op-muted">En ligne, le coach et ses conseils sont désactivés, et chacun ne voit que ses propres cartes. Une salle reste ouverte 15 minutes.</p>
      {guide && <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); }} onHover={cardZoom.onHover} />}
      {cardZoom.zoom && <CardZoom preview={cardZoom.zoom} onClose={cardZoom.close} />}
    </div>
  );
}
