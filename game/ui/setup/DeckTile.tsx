// La tuile d'un deck, la seule du jeu (tâche R3.4) : visuel du Leader, nom en entier, style de jeu (ou, pour un deck à
// moi, s'il est jouable), repère des decks d'aventure, accès au guide, et des boutons propres à l'écran (« Jouer » dans
// Mes decks, « Modifier » pour le deck d'aventure). Sert au choix d'un deck (DeckPicker), à Mes decks et au deck
// d'aventure. La tuile entière est le bouton principal (choisir, ou ouvrir l'éditeur) ; les autres boutons sont à côté,
// pas dedans.
import type { ReactNode } from 'react';
import { CARDS } from '../../engine/cards/index.ts';
import { DECK_SIZE } from '../../engine/deckRules.ts';
import { DECKS, deckSize } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import { GUIDES } from '../deckGuides.ts';
import { deckInfo, isAdventureDeck, playable, type MyDeck } from '../myDecks.ts';
import { ArtImg, deckArt } from '../table/CardArt.tsx';

export const COLOR: Record<string, string> = { Red: '#d9443a', Green: '#2f9e5b', Blue: '#2f6fd1', Purple: '#8a4fc9', Yellow: '#e2b623', Black: '#3a3a44' };

// État d'un deck à moi : jouable, incomplet (pas 50 cartes) ou à corriger
export function deckStatus(id: string): { ok: boolean; text: string } {
  const deck = deckInfo(id);
  if (!deck || !(deck.leader in CARDS)) return { ok: false, text: '✖ Leader inconnu' };
  if (playable(deck)) return { ok: true, text: '✔ Jouable' };
  const size = deckSize(deck);
  return { ok: false, text: size !== DECK_SIZE ? `✎ Incomplet · ${size}/${DECK_SIZE}` : '✖ À corriger' };
}

// selected : absent quand l'écran ne choisit pas de deck (Mes decks) ; chosen : le deck choisi pour l'aventure ;
// actions : boutons sous la tuile ; label : ce que fait la tuile, pour les lecteurs d'écran (« Modifier », « Choisir »)
export function DeckTile({ id, selected, onClick, note, onGuide, chosen, actions, label }: {
  id: string;
  selected?: boolean;
  onClick: () => void;
  note?: string;
  onGuide?: (id: string) => void;
  chosen?: boolean;
  actions?: ReactNode;
  label?: string;
}) {
  const deck = deckInfo(id);
  if (!deck || !(deck.leader in CARDS)) return null;
  const leader = def(deck.leader);
  const colors = leader.colors.map((c) => COLOR[c] ?? '#666');
  const mine = !DECKS[id];
  const adventure = isAdventureDeck(id);
  const status = mine ? deckStatus(id) : null;
  const styles = GUIDES[id]?.styles.slice(0, 2).join(' · ');
  const classes = ['deck-tile', selected ? 'on' : '', selected === undefined ? 'is-plain' : '', adventure ? 'op-deck-adventure' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] }}>
      <button className="deck-tile-main" data-ui={`deck.tile-${id}`} onClick={onClick} aria-pressed={selected}
        aria-label={label ? `${label} : ${deck.name}` : undefined}>
        <ArtImg art={deckArt(deck.leader, (deck as MyDeck).looks)} alt="" loading="lazy" />
        {adventure && (
          <span className={`op-deck-badge${chosen ? ' is-chosen' : ''}`}
            title={chosen ? 'Deck choisi : c’est avec lui que tu joues les chapitres' : 'Deck d’aventure : seulement des cartes gagnées dans l’Aventure'}>
            {chosen ? '✔ Choisi' : 'Deck d’aventure'}
          </span>
        )}
        <span className="deck-name">{deck.name}</span>
        <span className="deck-id">{mine ? leader.name : deck.id}{note ? ` · ${note}` : ''}</span>
        {status
          ? <span className={`deck-styles deck-status ${status.ok ? 'db-ok' : 'db-ko'}`}>{status.text}</span>
          : styles && <span className="deck-styles">{styles}</span>}
      </button>
      {(onGuide || actions) && (
        <div className="deck-tile-actions">
          {onGuide && (
            <button className="deck-guide-btn" data-ui="deck.guide" title="Voir le guide du deck : plan de jeu, combinaisons, cartes"
              aria-label={`Guide du deck ${deck.name}`} onClick={() => onGuide(id)}>📖 Guide</button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
