import { useEffect, useState } from 'react';
import { formatEur } from './api';
import { CardDetailSheet } from './components/CardDetail';
import { Icon, type IconName } from './components/Icon';
import { t } from './i18n';
import { AuthPage } from './pages/Auth';
import { Catalog } from './pages/Catalog';
import { Collection } from './pages/Collection';
import { ProfilePage } from './pages/Profile';
import { Scanner } from './pages/Scanner';
import { StatsPage } from './pages/Stats';
import { AppProvider, useApp } from './store';

type Tab = 'collection' | 'scan' | 'catalog' | 'stats' | 'profile';

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'collection', icon: 'cards' },
  { id: 'scan', icon: 'camera' },
  { id: 'catalog', icon: 'search' },
  { id: 'stats', icon: 'chart' },
  { id: 'profile', icon: 'user' },
];

function readTab(): Tab {
  const hash = window.location.hash.slice(1) as Tab;
  return TABS.some((item) => item.id === hash) ? hash : 'collection';
}

function Shell() {
  const [tab, setTab] = useState<Tab>(readTab);
  const { totals, openedCard } = useApp();

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Tab) => {
    window.location.hash = next;
    setTab(next);
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
        {tab === 'profile' && <ProfilePage />}
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
    </div>
  );
}

// Page d'accueil (connexion / inscription) tant qu'on n'est pas connecté, sinon l'appli.
// Changer de langue d'interface ou de compte redessine toute l'appli.
function Gate() {
  const { user, uiLang, toastMessage } = useApp();
  return (
    <>
      {user === undefined ? (
        <div className="center splash"><div className="spinner" /></div>
      ) : user === null ? (
        <AuthPage key={uiLang} />
      ) : (
        <Shell key={`${uiLang}-${user.id}`} />
      )}
      {toastMessage && <div className="toast" role="status">{toastMessage}</div>}
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
