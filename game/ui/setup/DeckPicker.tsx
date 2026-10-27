// Choix d'un deck : decks rangés par sorte (méta, pour débutant, du plus récent au plus ancien), filtre par couleur du
// Leader. L'ordre de DECKS ne change pas (il sert aux graines des parties de vérification). Les adversaires de l'aventure
// n'y sont pas. Sert à l'écran de départ et au salon en ligne.
import { useState } from 'react';
import { CARDS } from '../../engine/cards/index.ts';
import { DECKS, freeDeckIds } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import { deckInfo, isAdventureDeck, playable, useMyDecks } from '../myDecks.ts';
import { RANDOM_DECK } from './config.ts';
import { COLOR, DeckTile } from './DeckTile.tsx';

const DECK_GROUPS: { label: string; ids: () => string[] }[] = [
  { label: 'Decks du méta', ids: () => freeDeckIds().filter((id) => DECKS[id].series === 'META') },
  {
    label: 'Decks pour débutant',
    ids: () => freeDeckIds().filter((id) => DECKS[id].series !== 'META').sort((a, b) => b.localeCompare(a, 'fr', { numeric: true })),
  },
];
const COLOR_FILTERS: [string, string][] = [['', 'Toutes'], ['Red', 'Rouge'], ['Green', 'Vert'], ['Blue', 'Bleu'], ['Purple', 'Violet'], ['Black', 'Noir'], ['Yellow', 'Jaune']];

export function DeckPicker({ selected, onPick, onGuide, note, onBuilder, onRandom }: {
  selected: string;
  onPick: (id: string) => void;
  onGuide: (id: string) => void;
  note?: (id: string) => string | undefined;
  onBuilder?: () => void;  // ouvrir l'éditeur de decks
  onRandom?: () => void;   // proposer « Aléatoire » (deck tiré au sort au lancement)
}) {
  const [color, setColor] = useState('');
  const { decks } = useMyDecks();
  const shown = (id: string) => !color || def(deckInfo(id)!.leader).colors.includes(color as never);
  // mes decks jouables (les decks incomplets restent dans l'éditeur)
  const mine = decks.filter((d) => d.leader in CARDS && playable(d));
  const unfinished = decks.length - mine.length;
  // les decks de la Cale (decks d'aventure) à part : seulement des cartes gagnées dans l'Aventure
  const groups = [
    { label: 'Mes decks', ids: () => mine.filter((d) => !isAdventureDeck(d)).map((d) => d.id) },
    { label: '🧭 Mes decks de la Cale', ids: () => mine.filter((d) => isAdventureDeck(d)).map((d) => d.id) },
    ...DECK_GROUPS,
  ];
  return (
    <>
      <div className="deck-filter" role="group" aria-label="Couleur du Leader">
        {COLOR_FILTERS.map(([c, label]) => (
          <button key={c} className={`deck-chip ${color === c ? 'on' : ''}`} style={c ? { ['--c1' as string]: COLOR[c] } : undefined} onClick={() => setColor(c)}>{label}</button>
        ))}
      </div>
      {onBuilder && (
        <p className="op-small op-muted deck-mine-note">
          <button className="op-link" onClick={onBuilder}>🃏 Mes decks : créer ou modifier un deck</button>
          {unfinished > 0 ? ` · ${unfinished} deck${unfinished > 1 ? 's' : ''} à terminer dans l’éditeur` : ''}
        </p>
      )}
      {onRandom && (
        <div className="deck-group">
          <h3>Au hasard</h3>
          <div className="deck-grid">
            <button className={`deck-tile deck-random ${selected === RANDOM_DECK ? 'on' : ''}`} data-ui="deck.random" onClick={onRandom}>
              <span className="deck-random-dice" aria-hidden="true">🎲</span>
              <span className="deck-name">Aléatoire</span>
              <span className="deck-id">Un deck du méta ou pour débutant, tiré au sort à chaque partie</span>
            </button>
          </div>
        </div>
      )}
      {groups.map((g) => {
        const ids = g.ids().filter(shown);
        return ids.length ? (
          <div key={g.label} className="deck-group">
            <h3>{g.label}</h3>
            <div className="deck-grid">{ids.map((id) => <DeckTile key={id} id={id} selected={selected === id} note={note?.(id)} onClick={() => onPick(id)} onGuide={onGuide} />)}</div>
          </div>
        ) : null;
      })}
    </>
  );
}
