// Le deck d'aventure (tâche 1.18) : le deck avec lequel on joue les chapitres, construit avec les cartes de la Cale.
// L'écran montre le deck choisi et les autres decks d'aventure du joueur ; « Modifier » ouvre l'éditeur de decks
// (DeckBuilder.tsx) en mode « cartes de la Cale » : seules les cartes possédées sont proposées, au plus
// min(possédées, 4) par numéro, et le deck est enregistré en mode 'aventure'. Un deck jouable peut être choisi pour
// l'aventure (chooseAdventureDeck) ; rien ne change sans un appui sur « Choisir ».
import { useEffect, useMemo, useState } from 'react';
import { CARDS } from '../../engine/cards/index.ts';
import { def } from '../../engine/rules.ts';
import { DeckEditor, fits, LeaderPicker, MyDeckTile, playableNums, type Draft, type HoldMode } from '../DeckBuilder.tsx';
import { CostCurve } from '../DeckGuide.tsx';
import { isAdventureDeck, loadMyDecks, newDeckId, playable, useMyDecks, type MyDeck } from '../myDecks.ts';
import { useSettings } from '../settings.ts';
import { CardZoom, useCardZoom } from '../Zoom.tsx';
import { chooseAdventureDeck } from './api.ts';
import { holdLimit } from './hold.ts';
import { arcStarted, useHoldState } from './holdState.ts';

const draftOf = (d: MyDeck): Draft => ({ id: d.id, name: d.name, leader: d.leader, cards: { ...d.cards } });

// Exemplaires de la Cale qui pourraient encore rejoindre ce deck (cartes jouables, permises avec son Leader)
function roomInDeck(deck: MyDeck, hold: Record<string, number>): number {
  return playableNums().filter((n) => (hold[n] ?? 0) > 0 && fits(deck.leader, n))
    .reduce((sum, n) => sum + Math.max(0, holdLimit(hold, CARDS[n]) - (deck.cards[n] ?? 0)), 0);
}

export function AdventureDeckScreen({ onBack }: { onBack: () => void }) {
  const { data, error, reload, setAdventure } = useHoldState();
  const { decks, ready, error: decksError } = useMyDecks();
  const [settings] = useSettings();
  const zoom = useCardZoom(settings.zoomDelay);
  const [editing, setEditing] = useState<{ draft: Draft; existing: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // le deck de départ est créé par le serveur au début de l'aventure : relire mes decks
  useEffect(() => { void loadMyDecks(); }, []);

  const mine = decks.filter((d) => isAdventureDeck(d));
  const chosenId = data?.adventure.deckId ?? null;
  const chosen = mine.find((d) => d.id === chosenId);
  const others = mine.filter((d) => d.id !== chosenId);
  const room = useMemo(() => (chosen && data ? roomInDeck(chosen, data.byNumber) : 0), [chosen, data]);
  const holdCount = data ? Object.values(data.byNumber).reduce((a, b) => a + b, 0) : 0;

  const choose = (id: string) => {
    setBusy(true);
    setMessage(null);
    chooseAdventureDeck(id).then(setAdventure, (e: Error) => setMessage(e.message)).finally(() => setBusy(false));
  };
  const hold: HoldMode | null = data && {
    hold: data.byNumber,
    chosen: chosenId,
    onChoose: async (id) => {
      const s = await chooseAdventureDeck(id);
      setAdventure(s);
      return s.deckId;
    },
  };
  const close = () => { setEditing(null); zoom.close(); };

  return (
    <div className="setup op-adeck">
      <header className="op-adeck-head">
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour</button>
        <h1>🃏 Mon deck d’aventure</h1>
      </header>
      {!data && !error && <p className="op-muted"><span className="op-spinner" /> Chargement de ta Cale…</p>}
      {(error || decksError) && (
        <p className="danger">
          {error ?? 'Impossible de charger tes decks : vérifie ta connexion.'}{' '}
          <button className="op-btn op-btn-ghost btn-small" onClick={() => { void reload(); void loadMyDecks(); }}>Réessayer</button>
        </p>
      )}
      {data && !arcStarted(data.adventure) && (
        <div className="history-empty">
          <p>Ton aventure n’a pas encore commencé.</p>
          <p className="op-muted op-small">Prends la mer depuis la carte du monde : tu recevras ton deck de départ, et ses cartes rempliront ta Cale.</p>
        </div>
      )}
      {data && arcStarted(data.adventure) && (
        <>
          <p className="op-muted op-adeck-intro">
            Tu joues les chapitres avec le deck choisi. Améliore-le avec les cartes gagnées dans les boosters : ta Cale
            en contient {holdCount}.
          </p>
          <section className="op-adeck-current">
            <h2>Deck choisi</h2>
            {chosen ? (
              <div className="op-adeck-chosen">
                <MyDeckTile deck={chosen} chosen onOpen={() => setEditing({ draft: draftOf(chosen), existing: true })} />
                <div className="op-adeck-curve"><CostCurve deck={chosen} /></div>
                {!playable(chosen) && <p className="danger op-small">⚠ Ce deck n’est pas jouable (il faut 50 cartes qui respectent les règles) : complète-le pour combattre.</p>}
                <p className="op-small">{room > 0
                  ? <>🆕 <b>{room}</b> carte{room > 1 ? 's' : ''} de ta Cale pourrai{room > 1 ? 'ent' : 't'} rejoindre ce deck : appuie sur « Modifier ».</>
                  : <span className="op-muted">Toutes les cartes de ta Cale qui vont avec ce Leader y sont déjà.</span>}</p>
              </div>
            ) : ready ? (
              <p className="op-muted">Aucun deck choisi : choisis-en un ci-dessous, ou crée-en un.</p>
            ) : null}
          </section>
          <section>
            <h2>Mes autres decks d’aventure</h2>
            {others.length ? (
              <div className="db-list">
                {others.map((d) => (
                  <MyDeckTile key={d.id} deck={d} busy={busy} onOpen={() => setEditing({ draft: draftOf(d), existing: true })}
                    onChoose={playable(d) ? () => choose(d.id) : undefined} />
                ))}
              </div>
            ) : <p className="op-small op-muted">Pas d’autre deck pour l’instant. Pour essayer une autre idée sans toucher à ton deck, fais-en une copie.</p>}
            <div className="db-actions op-adeck-actions">
              <button className="op-btn op-btn-primary" onClick={() => setPicking(true)}>＋ Nouveau deck d’aventure</button>
              {chosen && (
                <button className="op-btn op-btn-ghost" onClick={() => setEditing({
                  draft: { ...draftOf(chosen), id: newDeckId(), name: `${chosen.name} (copie)`.slice(0, 40) }, existing: false,
                })}>Copier le deck choisi</button>
              )}
            </div>
          </section>
          {message && <p className="danger">{message}</p>}
        </>
      )}
      {editing && hold && (
        <DeckEditor key={editing.draft.id} initial={editing.draft} existing={editing.existing} hold={hold} onBack={close} onHover={zoom.onHover} />
      )}
      {picking && data && (
        <LeaderPicker only={data.byNumber} onClose={() => setPicking(false)} onHover={zoom.onHover} onPick={(leader) => {
          setPicking(false);
          setEditing({ draft: { id: newDeckId(), name: `Aventure : ${def(leader).name}`.slice(0, 40), leader, cards: {} }, existing: false });
        }} />
      )}
      {zoom.zoom && <CardZoom preview={zoom.zoom} onClose={zoom.close} />}
    </div>
  );
}
