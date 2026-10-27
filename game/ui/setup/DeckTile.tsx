// Tuile d'un deck dans le choix d'un deck : visuel du Leader, nom, style de jeu, accès à son guide
import { DECKS } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import { GUIDES } from '../deckGuides.ts';
import { cardImage } from '../images.ts';
import { deckInfo, isAdventureDeck } from '../myDecks.ts';

export const COLOR: Record<string, string> = { Red: '#d9443a', Green: '#2f9e5b', Blue: '#2f6fd1', Purple: '#8a4fc9', Yellow: '#e2b623', Black: '#3a3a44' };

export function DeckTile({ id, selected, onClick, note, onGuide }: { id: string; selected: boolean; onClick: () => void; note?: string; onGuide: (id: string) => void }) {
  const deck = deckInfo(id);
  if (!deck) return null;
  const leader = def(deck.leader);
  const colors = leader.colors.map((c) => COLOR[c] ?? '#666');
  const hold = isAdventureDeck(id);
  return (
    <button className={`deck-tile ${selected ? 'on' : ''}${hold ? ' op-deck-hold' : ''}`} data-ui={`deck.tile-${id}`} onClick={onClick} style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] }}>
      <img src={cardImage(leader)} alt="" />
      {hold && <span className="op-hold-badge" title="Deck de la Cale : seulement des cartes gagnées dans l’Aventure">🧭 Cale</span>}
      <span className="deck-name">{deck.name}</span>
      <span className="deck-id">{DECKS[id] ? deck.id : leader.name}{note ? ` · ${note}` : ''}</span>
      <span className="deck-styles">{GUIDES[id]?.styles.slice(0, 2).join(' · ') ?? (hold ? 'Deck de la Cale (cartes de l’Aventure)' : 'Deck perso')}</span>
      <span className="deck-guide-btn" data-ui="deck.guide" role="button" tabIndex={0} title="Voir le guide du deck : plan de jeu, combinaisons, cartes"
        onClick={(e) => { e.stopPropagation(); onGuide(id); }}>📖 Guide</span>
    </button>
  );
}
