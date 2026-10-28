// Point d'entrée du jeu dans l'appli TCGC (onglet Jouer), chargé seulement quand on ouvre l'onglet : informations des
// cartes demandées au serveur, parties enregistrées sur le compte connecté, style isolé du reste de l'appli.
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';
import { App } from './App.tsx';
import { Home } from './home/Home.tsx';
import { ApiError, call } from './api.ts';
import { setArchiveUser } from './archiveClient.ts';
import { deviceClasses, useDevice } from './device.ts';
import { currentMatches, type CurrentMatch } from './online/api.ts';
import { Lobby } from './online/Lobby.tsx';
import { OnlineMatch } from './online/OnlineMatch.tsx';
import { goBack, goUp, HOME, navigate, useRoute } from './routes.ts';
import { useReducedMotion, useSettings } from './settings.ts';
import { setSoundEnabled } from './sound.ts';
// Styles du jeu, un fichier par sujet ; l'ordre compte (cascade) : tokens et base d'abord
import './styles/tokens.css';
import './styles/base.css';
import './styles/setup.css';
import './styles/table.css';
import './styles/card.css';
import './styles/fx.css';
import './styles/modals.css';
import './styles/guide.css';
import './styles/coach.css';
import './styles/history.css';
import './styles/builder.css';
import './styles/online.css';
import './styles/map.css';
import './styles/boosters.css';
import './styles/adventure.css';
import './styles/shop.css';
import './styles/atelier.css';
import './styles/settings.css';
import './styles/a11y.css';
import './styles/gestures.css';
import './styles/home.css';
import './styles/table-compact.css';
import './styles/don.css';

// Atelier des écrans du jeu (#play/atelier) : chargé seulement quand on l'ouvre
const Atelier = lazy(() => import('./atelier/Atelier.tsx').then((m) => ({ default: m.Atelier })));
// Mode Aventure (#play/aventure) : chargé quand on l'ouvre
const AdventureApp = lazy(() => import('./adventure/AdventureApp.tsx').then((m) => ({ default: m.AdventureApp })));
// Boutique (#play/boutique, la même que dans l'aventure) : chargée quand on l'ouvre
const ShopScreen = lazy(() => import('./economy/Shop.tsx').then((m) => ({ default: m.ShopScreen })));

// Version du programme de cette page ; celle du serveur arrive avec les cartes
const ENGINE = typeof __ENGINE__ === 'string' ? __ENGINE__ : 'inconnue';

// Le serveur a été mis à jour depuis l'ouverture de la page : ses cartes et son arbitre peuvent ne plus correspondre
// au code de la page
class Outdated extends Error {}
// Le jeu est fermé par l'interrupteur de retrait du serveur (server/takedown.js)
class Closed extends Error {}

// Informations des cartes : une fois par visite (les fils de calcul de l'IA les reçoivent du module chargé ici)
let cardsLoaded: Promise<void> | null = null;

async function fetchCards(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { engine, cards } = await call<{ engine: string; cards: Record<string, CardData> }>('GET', 'catalog', undefined, { cache: 'no-cache' });
      if (engine !== ENGINE && engine !== 'inconnue' && ENGINE !== 'inconnue') throw new Outdated(engine);
      return loadCardData(cards);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      // 503 : le serveur vient de démarrer et télécharge encore les informations des cartes, ou le jeu est fermé
      if (e.status === 503 && e.code === 'game_closed') throw new Closed();
      if (e.status !== 503 || attempt >= 40) throw new Error(e.status ? `le serveur a répondu ${e.status}` : 'le serveur ne répond pas');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// Écrans portés par App : accueil (home/Home.tsx), partie rapide, partie contre l'IA, Mes decks, Mes parties
const SOLO = new Set(['home', 'rapide', 'jeu', 'decks', 'parties']);

type GameAppProps = { userId: number; notice?: string; onImmersive: (on: boolean) => void };

// Limite d'erreur : une erreur d'affichage dans le jeu laisse un message et « Recharger », au lieu d'effacer tout l'onglet
// (et le reste de l'appli avec lui)
class GameErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="opc">
        <div className="opc-wait">
          Le jeu a rencontré un problème.{' '}
          <button className="op-btn op-btn-primary" onClick={() => window.location.reload()}>Recharger</button>
        </div>
      </div>
    );
  }
}

export default function GameApp(props: GameAppProps) {
  return <GameErrorBoundary><GameShell {...props} /></GameErrorBoundary>;
}

function GameShell({ userId, notice, onImmersive }: GameAppProps) {
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');
  const [attempt, setAttempt] = useState(0);
  const [settings] = useSettings();
  const [full, setFull] = useState(false);
  // l'écran suit l'adresse (routes.ts) : chaque écran a la sienne, le Retour revient au précédent, un rechargement le
  // rouvre
  const route = useRoute();
  const solo = SOLO.has(route.name);
  const [current, setCurrent] = useState<CurrentMatch | null>(null);

  setArchiveUser(userId);

  useEffect(() => {
    cardsLoaded ??= fetchCards().catch((e: unknown) => {
      cardsLoaded = null;
      throw e;
    });
    cardsLoaded.then(() => setState('ready'), (e: unknown) => setState(e instanceof Outdated ? 'outdated' : e instanceof Closed ? 'closed' : e instanceof Error ? e.message : String(e)));
  }, [attempt]);
  const retry = () => {
    setState('loading');
    setAttempt((n) => n + 1);
  };

  // Tailles du jeu en rem : la taille du texte de la page ne change que pendant que le jeu est affiché. La taille de
  // l'interface choisie (--ui) s'applique à tous les écrans du jeu, et change dès qu'on la règle
  useEffect(() => {
    document.documentElement.classList.add('opc-on');
    return () => {
      document.documentElement.classList.remove('opc-on');
      document.documentElement.style.removeProperty('--ui');
    };
  }, []);
  useEffect(() => { document.documentElement.style.setProperty('--ui', String(settings.uiScale)); }, [settings.uiScale]);
  // son et animations réduites : réglés une fois pour tout le jeu (styles/settings.css)
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  const reducedMotion = useReducedMotion();
  // téléphone en portrait ou en paysage : .is-compact, .is-portrait, .is-landscape (seule source pour les styles)
  const device = useDevice();

  useEffect(() => () => onImmersive(false), [onImmersive]);

  // partie en ligne ou salle en cours : proposée sur l'écran de la partie rapide (l'accueil la cherche lui-même)
  useEffect(() => {
    if (route.name !== 'rapide') return;
    let cancelled = false;
    currentMatches().then((list) => { if (!cancelled) setCurrent(list.find((m) => m.status === 'playing') ?? list[0] ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [route.name]);

  // salon, partie en ligne, aventure, boutique, atelier : tout l'écran
  useEffect(() => {
    if (solo) return;
    setFull(true);
    onImmersive(true);
  }, [solo, onImmersive]);
  const immersive = useCallback((on: boolean) => {
    setFull(on);
    onImmersive(on);
  }, [onImmersive]);

  return (
    <div className={`opc${full ? ' opc-full' : ''}${reducedMotion ? ' is-reduced-motion' : ''}${deviceClasses(device)}`}>
      {state === 'ready' ? (
        route.name === 'ami' || route.name === 'salle' ? (
          // la partie ouverte remplace le salon dans l'historique : le Retour depuis la partie ramène à l'accueil
          <Lobby key={route.name === 'salle' ? route.code : ''} initialCode={route.name === 'salle' ? route.code : undefined}
            onOpen={(id) => navigate({ name: 'partie', id }, { replace: true })} onBack={() => goUp(HOME)} />
        ) : route.name === 'partie' ? (
          <OnlineMatch key={route.id} id={route.id} onLeave={() => goUp(HOME)} />
        ) : route.name === 'aventure' ? (
          <Suspense fallback={<div className="opc-wait"><span className="op-spinner" /> Chargement de l’aventure…</div>}>
            <AdventureApp onBack={() => goUp(HOME)} />
          </Suspense>
        ) : route.name === 'boutique' ? (
          <Suspense fallback={<div className="opc-wait"><span className="op-spinner" /> Chargement de la boutique…</div>}>
            <div className="op-adv-layer"><ShopScreen onBack={() => goBack(HOME)} /></div>
          </Suspense>
        ) : route.name === 'atelier' ? (
          <Suspense fallback={<div className="opc-wait"><span className="op-spinner" /> Chargement de l’atelier…</div>}>
            <Atelier page={route.page} onPage={(page) => navigate({ name: 'atelier', page })} onBack={() => goUp(HOME)} />
          </Suspense>
        ) : (
          <App notice={notice} onImmersive={immersive} home={(actions) => <Home notice={notice} {...actions} />} adventure={{ onOpen: () => navigate({ name: 'aventure' }) }} online={{
            onOpen: () => navigate({ name: 'ami' }),
            resume: current ? {
              label: current.status === 'playing'
                ? `Partie en cours contre ${current.opponent} : elle t’attend.`
                : `Ta salle ${current.code} attend ton ami.`,
              onResume: () => navigate({ name: 'partie', id: current.id }),
            } : undefined,
          }} />
        )
      ) : state === 'loading' ? (
        <div className="opc-wait" data-ui="game.loading"><span className="op-spinner" /> Chargement du jeu…</div>
      ) : state === 'outdated' ? (
        <div className="opc-wait">
          Le jeu vient d’être mis à jour. Recharge la page pour jouer avec la nouvelle version.{' '}
          <button className="op-btn op-btn-primary" onClick={() => window.location.reload()}>Recharger</button>
        </div>
      ) : state === 'closed' ? (
        <div className="opc-wait">
          <p>Le jeu est fermé pour le moment. Ta collection reste disponible, et tes parties, tes decks, ta Cale et ta
            progression sont gardés. <a className="op-link" href="#legal">En savoir plus</a></p>
        </div>
      ) : (
        <div className="opc-wait">
          Impossible de charger le jeu : {state}. Réessaie dans un moment.{' '}
          <button className="op-btn op-btn-primary" onClick={retry}>Réessayer</button>
        </div>
      )}
    </div>
  );
}
