// Jouer avec un ami (#play/ami, tâche R3.7) : « Créer une salle » en haut, avec le deck rappelé (« Changer » ouvre le
// sélecteur commun, en fenêtre) ; en dessous, rejoindre la salle d'un ami avec son code. Le lien d'un ami
// (#play/salle/<CODE>) met « Rejoindre » en haut, code rempli : rien ne part sans un appui. Un deck d'aventure se joue
// si son joueur possède encore toutes ses cartes de la Cale : le serveur le vérifie en entrant dans la partie ; l'écran
// prévient avant, d'après la Cale.
import { useEffect, useState } from 'react';
import { CARDS } from '../../engine/cards/index.ts';
import { DECKS, isAdventureOnly, isCustomDeck } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import { holdByNumber, loadHold } from '../adventure/api.ts';
import { holdProblems } from '../adventure/hold.ts';
import { DeckGuideModal } from '../DeckGuide.tsx';
import { GUIDES } from '../deckGuides.ts';
import { cardImage } from '../images.ts';
import { Button, Dialog, Screen } from '../kit/index.ts';
import { deckInfo, isAdventureDeck, useMyDecks } from '../myDecks.ts';
import { navigate } from '../routes.ts';
import { DeckPicker } from '../setup/DeckPicker.tsx';
import { COLOR } from '../setup/DeckTile.tsx';
import { CardZoom, useCardZoom } from '../Zoom.tsx';
import { createRoom, joinRoom } from './api.ts';
import { cleanCode, CODE_LENGTH } from './room.ts';

const DECK_KEY = 'tcgc.game.online-deck';

function lastDeck(): string {
  try {
    const d = localStorage.getItem(DECK_KEY);
    if (d && ((DECKS[d] && !isAdventureOnly(d)) || isCustomDeck(d))) return d;  // deck perso : vérifié par le serveur
  } catch { /* stockage indisponible */ }
  return 'ST-35';
}

export function Lobby({ initialCode, onOpen, onBack }: { initialCode?: string; onOpen: (id: string) => void; onBack: () => void }) {
  const [code, setCode] = useState(cleanCode(initialCode ?? ''));
  const [deck, setDeck] = useState(lastDeck);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<{ on: 'create' | 'join'; text: string } | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const cardZoom = useCardZoom(1200);
  const myDecks = useMyDecks();  // pour savoir si le deck choisi est un deck d'aventure, et le nommer
  // deck perso effacé depuis : il faut en choisir un autre
  const lost = myDecks.ready && !deckInfo(deck);
  const holdDeck = isAdventureDeck(deck);
  const [hold, setHold] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!holdDeck || hold) return;
    let cancelled = false;
    loadHold().then((r) => { if (!cancelled) setHold(holdByNumber(r.cards)); }).catch(() => { /* le serveur vérifiera */ });
    return () => { cancelled = true; };
  }, [holdDeck, hold]);
  const chosen = holdDeck ? deckInfo(deck) : undefined;
  const missing = chosen && hold ? holdProblems(hold, chosen.leader, chosen.cards) : [];
  // le lien d'un ami : rejoindre sa salle d'abord
  const invited = Boolean(initialCode);

  const pick = (id: string) => {
    setDeck(id);
    setPicking(false);
    setError(null);
    try { localStorage.setItem(DECK_KEY, id); } catch { /* stockage indisponible */ }
  };

  const go = async (what: 'create' | 'join') => {
    setBusy(what);
    setError(null);
    try {
      const v = what === 'create' ? await createRoom(deck) : await joinRoom(code, deck);
      onOpen(v.id);
    } catch (e) {
      setError({ on: what, text: e instanceof Error ? e.message : String(e) });
      setBusy(null);
    }
  };
  const blocked = busy !== null || missing.length > 0 || lost;

  const deckLine = (
    <DeckLine id={deck} onChange={() => setPicking(true)} missing={missing} hold={holdDeck} loading={!myDecks.ready} />
  );
  const create = (
    <section className={`op-lobby-card${invited ? ' is-second' : ' is-main'}`} aria-labelledby="op-lobby-create" data-ui="lobby.create-card">
      <div className="op-lobby-card-head">
        <h2 id="op-lobby-create">{invited ? 'Ou crée ta propre salle' : 'Créer une salle'}</h2>
        <p>Le serveur te donne un code : envoie-le à ton ami, la partie commence dès qu’il entre.</p>
      </div>
      {!invited && deckLine}
      {error?.on === 'create' && <p className="op-lobby-error" role="alert">{error.text}</p>}
      <Button variant={invited ? 'secondary' : 'primary'} size={invited ? 'normal' : 'big'} wide={!invited} busy={busy === 'create'}
        disabled={blocked} onClick={() => void go('create')} data-ui="lobby.create">
        Créer une salle
      </Button>
    </section>
  );
  const join = (
    <section className={`op-lobby-card${invited ? ' is-main' : ''}`} aria-labelledby="op-lobby-join" data-ui="lobby.join-card">
      <div className="op-lobby-card-head">
        <h2 id="op-lobby-join">{invited ? `Rejoindre la salle ${code}` : 'Rejoindre un ami'}</h2>
        <p>{invited ? 'Ton ami t’a invité : choisis ton deck, puis entre dans sa salle.' : 'Ton ami a créé une salle ? Entre le code qu’il t’a donné.'}</p>
      </div>
      {invited && deckLine}
      <form className="op-lobby-join" onSubmit={(e) => { e.preventDefault(); if (code.length === CODE_LENGTH && !blocked) void go('join'); }}>
        <input className="room-input" data-ui="lobby.code" value={code} onChange={(e) => { setCode(cleanCode(e.target.value)); if (error?.on === 'join') setError(null); }}
          placeholder="EX. K7MQ2P" autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text"
          aria-label="Code de la salle" enterKeyHint="go" />
        <Button type="submit" variant={invited ? 'primary' : 'secondary'} size={invited ? 'big' : 'normal'} busy={busy === 'join'}
          disabled={blocked || code.length !== CODE_LENGTH} data-ui="lobby.join">
          Rejoindre
        </Button>
      </form>
      {error?.on === 'join' && <p className="op-lobby-error" role="alert">{error.text}</p>}
    </section>
  );

  return (
    <Screen
      className="op-lobby"
      data-ui="lobby"
      title="Jouer avec un ami"
      subtitle="En ligne, avec le code d’une salle"
      back={{ label: 'Accueil', onBack, 'data-ui': 'lobby.back' }}
    >
      <div className="op-lobby-body">
        {invited ? <>{join}{create}</> : <>{create}{join}</>}
        <p className="op-lobby-foot">En ligne, le coach et ses conseils sont désactivés, et chacun ne voit que ses propres cartes. Une salle reste ouverte 15 minutes.</p>
      </div>
      {picking && (
        <Dialog title="Choisis ton deck" onClose={() => setPicking(false)} size="wide" className="op-lobby-decks" data-ui="lobby.decks">
          <DeckPicker selected={deck} onPick={pick} label="Choisir" onBuilder={() => navigate({ name: 'decks' })}
            onGuide={(id) => { setPicking(false); setGuide(id); }} />
        </Dialog>
      )}
      {/* le guide (ancienne fenêtre) remplace le choix le temps de le lire, puis le choix revient */}
      {guide && <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); setPicking(true); }} onHover={cardZoom.onHover} />}
      {cardZoom.zoom && <CardZoom preview={cardZoom.zoom} onClose={cardZoom.close} />}
    </Screen>
  );
}

// Le deck choisi, rappelé dans la carte du haut : Leader, nom, style ; « Changer » ouvre le sélecteur
function DeckLine({ id, onChange, missing, hold, loading }: { id: string; onChange: () => void; missing: string[]; hold: boolean; loading: boolean }) {
  const deck = deckInfo(id);
  const known = deck && deck.leader in CARDS;
  const leader = known ? def(deck.leader) : null;
  const colors = leader ? leader.colors.map((c) => COLOR[c] ?? '#666') : [];
  const styles = GUIDES[id]?.styles.slice(0, 2).join(' · ');
  return (
    <div className="op-lobby-deck-wrap">
      <div className="op-lobby-deck" style={colors.length ? { ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] } : undefined} data-ui="lobby.deck-line">
        {leader && <img src={cardImage(leader)} alt="" />}
        <div className="op-lobby-deck-text">
          <span className="op-lobby-deck-label">Ton deck</span>
          <strong>{deck?.name ?? (loading ? 'Chargement…' : 'Deck introuvable')}</strong>
          <span className="op-lobby-deck-detail">{hold ? 'Deck d’aventure' : styles ?? (leader ? leader.name : loading ? '' : 'Choisis-en un autre')}</span>
        </div>
        <Button variant="secondary" icon="deck" onClick={onChange} data-ui="lobby.deck">Changer</Button>
      </div>
      {hold && (
        <div className={`op-hold-note${missing.length ? ' op-hold-note-bad' : ''}`} role="status">
          {missing.length
            ? <><b>Il manque des cartes dans ta Cale pour ce deck</b> : {missing.slice(0, 3).join(' ; ')}{missing.length > 3 ? ` (et ${missing.length - 3} autres)` : ''}. Corrige-le dans « Mes decks » ou choisis-en un autre.</>
            : <><b>Deck d’aventure</b> : seulement des cartes gagnées dans l’Aventure. Ton ami le verra, et le serveur vérifie au début de la partie que tu les as toujours.</>}
        </div>
      )}
    </div>
  );
}
