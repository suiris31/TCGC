import { useEffect, useState } from 'react';
import { formatEur } from './api';
import { CardDetailSheet } from './components/CardDetail';
import { Icon, type IconName } from './components/Icon';
import { Catalog } from './pages/Catalog';
import { Collection } from './pages/Collection';
import { Scanner } from './pages/Scanner';
import { t } from './i18n';
import { StatsPage } from './pages/Stats';
import { AppProvider, useApp } from './store';

type Tab = 'collection' | 'scan' | 'catalog' | 'stats';

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'collection', icon: 'cards' },
  { id: 'scan', icon: 'camera' },
  { id: 'catalog', icon: 'search' },
  { id: 'stats', icon: 'chart' },
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
            <span>{t('app.name')}</span>
          </div>
          {totals && (
            <button className="value-pill" onClick={() => go('stats')} title={t('app.valueTitle')}>
              <span className="value-pill-amount">{formatEur(totals.valueEur, true)}</span>
              <span className="value-pill-count">{t('count.cards', { n: totals.cards })}</span>
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
        {TABS.map((item) => (
          <button key={item.id} className={item.id === tab ? 'tab tab-active' : 'tab'} onClick={() => go(item.id)}>
            <Icon name={item.icon} />
            <span>{t(`tab.${item.id}`)}</span>
          </button>
        ))}
      </nav>

      <CardDetailSheet />
      {toastMessage && <div className="toast" role="status">{toastMessage}</div>}
    </div>
  );
}

// Changer la langue de l'interface redessine toute l'appli
function LocalizedShell() {
  const { uiLang } = useApp();
  return <Shell key={uiLang} />;
}

export function App() {
  return (
    <AppProvider>
      <LocalizedShell />
    </AppProvider>
  );
}
