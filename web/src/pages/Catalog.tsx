import { useState } from 'react';
import { CardGrid } from '../components/CardGrid';
import { ColorSelect, RaritySelect, SearchInput, SetSelect } from '../components/Filters';
import { LangSwitch } from '../components/LangSwitch';
import { useApp } from '../store';
import { useCards } from '../useCards';

export function Catalog() {
  const [q, setQ] = useState('');
  const [set, setSet] = useState('');
  const [color, setColor] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState('number');
  // Même langue que le scanner : affichage des cartes et ajout avec le bouton +
  const { lang, setLang } = useApp();
  const { cards, total, loading, hasMore, loadMore } = useCards({ q, set, color, rarity, sort }, { debounce: 300 });

  return (
    <div className="page">
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, code (OP01-001), équipage..." />
        <div className="toolbar-row">
          <LangSwitch value={lang} onChange={setLang} compact label="Langue des cartes ajoutées" />
          <SetSelect value={set} onChange={setSet} />
          <ColorSelect value={color} onChange={setColor} />
          <RaritySelect value={rarity} onChange={setRarity} />
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier">
            <option value="number">Par code</option>
            <option value="price">Plus chères</option>
            <option value="name">Par nom</option>
            <option value="recent">Plus récentes</option>
          </select>
        </div>
      </div>
      <div className="count muted small">{loading && !cards.length ? 'Recherche...' : `${total} carte${total > 1 ? 's' : ''}`}</div>
      <CardGrid cards={cards} quickAdd />
      {hasMore && <button className="btn btn-ghost btn-block" onClick={loadMore} disabled={loading}>Voir plus</button>}
    </div>
  );
}
