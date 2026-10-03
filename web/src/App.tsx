import { useEffect, useState } from 'react';
import { formatEur } from './api';
import { CardDetailSheet } from './components/CardDetail';
import { Icon, type IconName } from './components/Icon';
import { Catalog } from './pages/Catalog';
import { Collection } from './pages/Collection';
import { Scanner } from './pages/Scanner';
import { StatsPage } from './pages/Stats';
import { AppProvider, useApp } from './store';

type Tab = 'collection' | 'scan' | 'catalog' | 'stats';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'collection', label: 'Collection', icon: 'cards' },
  { id: 'scan', label: 'Scanner', icon: 'camera' },
  { id: 'catalog', label: 'Catalogue', icon: 'search' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
];

function readTab(): Tab {
  const hash = window.location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === hash) ? hash : 'collection';
}

function Shell() {
  const [tab, setTab] = useState<Tab>(readTab);
  const { totals, toastMessage, openedCard } = useApp();

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    window.location.hash = t;
    setTab(t);
  };

  return (
    <div className="app">
      {tab !== 'scan' && (
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">☠</span>
            <span>Ma Collection</span>
          </div>
          {totals && (
            <button className="value-pill" onClick={() => go('stats')} title="Valeur estimée de la collection">
              <span className="value-pill-amount">{formatEur(totals.valueEur, true)}</span>
              <span className="value-pill-count">{totals.cards} carte{totals.cards > 1 ? 's' : ''}</span>
            </button>
          )}
        </header>
      )}

      <main className={tab === 'scan' ? 'main main-full' : 'main'}>
        {tab === 'collection' && <Collection onScan={() => go('scan')} onBrowse={() => go('catalog')} />}
        {tab === 'scan' && <Scanner active={tab === 'scan' && openedCard === null} />}
        {tab === 'catalog' && <Catalog />}
        {tab === 'stats' && <StatsPage />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'tab tab-active' : 'tab'} onClick={() => go(t.id)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <CardDetailSheet />
      {toastMessage && <div className="toast" role="status">{toastMessage}</div>}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
