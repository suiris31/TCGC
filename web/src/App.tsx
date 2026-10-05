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
import { SharedPage } from './pages/Shared';
import { StatsPage } from './pages/Stats';
import { refreshPushSubscription } from './push';
import { AppProvider, useApp } from './store';

type Tab = 'collection' | 'scan' | 'catalog' | 'stats' | 'profile';

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'collection', icon: 'cards' },
  { id: 'scan', icon: 'camera' },
  { id: 'catalog', icon: 'search' },
  { id: 'stats', icon: 'chart' },
  { id: 'profile', icon: 'user' },
];

// "#stats", "#collection/wishlist"... : l'onglet est la première partie de l'adresse
function readTab(): Tab {
  const hash = window.location.hash.slice(1).split('/')[0] as Tab;
  return TABS.some((item) => item.id === hash) ? hash : 'collection';
}

function Shell() {
  const [tab, setTab] = useState<Tab>(readTab);
  const { totals, openedCard, status } = useApp();
  // Cartes recherchées passées sous leur prix cible : pastille sur l'onglet Collection
  const reached = status?.wishlist.reached ?? 0;

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    refreshPushSubscription();
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
            {item.id === 'collection' && reached > 0 && <span className="tab-badge">{reached}</span>}
          </button>
        ))}
      </nav>

      <CardDetailSheet />
    </div>
  );
}

// Lien de partage : #partage/<jeton>
function readShareToken() {
  const m = window.location.hash.match(/^#(?:partage|share)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Page publique d'un lien de partage (avec ou sans compte), sinon page d'accueil (connexion / inscription) tant qu'on
// n'est pas connecté, sinon l'appli. Changer de langue d'interface ou de compte redessine toute l'appli.
function Gate() {
  const { user, uiLang, toastMessage } = useApp();
  const [shareToken, setShareToken] = useState(readShareToken);

  useEffect(() => {
    const onHash = () => setShareToken(readShareToken());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      {shareToken ? (
        <SharedPage key={shareToken} token={shareToken} />
      ) : user === undefined ? (
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
