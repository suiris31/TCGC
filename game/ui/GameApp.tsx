// Point d'entrée du jeu dans l'appli TCGC (onglet Jouer), chargé seulement quand on ouvre l'onglet : informations des
// cartes demandées au serveur, parties enregistrées sur le compte connecté, style isolé du reste de l'appli.
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';
import { App } from './App.tsx';
import { ApiError, call } from './api.ts';
import { setArchiveUser } from './archiveClient.ts';
import { currentMatches, type CurrentMatch } from './online/api.ts';
import { Lobby } from './online/Lobby.tsx';
import { OnlineMatch } from './online/OnlineMatch.tsx';
import { useSettings } from './settings.ts';
import './styles.css';

// Atelier des écrans du jeu (#play/atelier) : chargé seulement quand on l'ouvre
const Atelier = lazy(() => import('./atelier/Atelier.tsx').then((m) => ({ default: m.Atelier })));
// Mode Aventure (#play/aventure) : chargé quand on l'ouvre
const AdventureApp = lazy(() => import('./adventure/AdventureApp.tsx').then((m) => ({ default: m.AdventureApp })));

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

type Mode = { kind: 'solo' } | { kind: 'lobby'; code?: string } | { kind: 'match'; id: string } | { kind: 'atelier'; page?: string } | { kind: 'adventure' };

// Adresse de l'onglet : #play/salle/<code> (lien envoyé par un ami), #play/partie/<id> (partie en ligne ouverte) ou
// #play/atelier[/<page>] (essais des écrans de l'aventure, sans lien visible) ou #play/aventure (mode Aventure)
function modeFromHash(): Mode {
  if (/^#play\/aventure(?:\/|$)/.test(window.location.hash)) return { kind: 'adventure' };
  const atelier = window.location.hash.match(/^#play\/atelier(?:\/([\w-]+))?$/);
  if (atelier) return { kind: 'atelier', page: atelier[1] };
  const room = window.location.hash.match(/^#play\/salle\/([A-Za-z0-9-]+)/);
  if (room) return { kind: 'lobby', code: room[1].toUpperCase() };
  const match = window.location.hash.match(/^#play\/partie\/([\w-]+)/);
  if (match) return { kind: 'match', id: match[1] };
  return { kind: 'solo' };
}

function hashOf(mode: Mode): string {
  if (mode.kind === 'atelier') return mode.page ? `#play/atelier/${mode.page}` : '#play/atelier';
  if (mode.kind === 'adventure') return '#play/aventure';
  return mode.kind === 'match' ? `#play/partie/${mode.id}` : '#play';
}

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
  const [mode, setModeState] = useState<Mode>(modeFromHash);
  const [current, setCurrent] = useState<CurrentMatch | null>(null);
  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    // l'adresse suit la partie ouverte (un rechargement la rouvre), sans créer de page dans l'historique
    window.history.replaceState(null, '', hashOf(next));
  }, []);

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
  // l'interface choisie (--ui) s'applique dès l'ouverture, aventure comprise ; la partie et le salon la suivent ensuite
  useEffect(() => {
    document.documentElement.classList.add('opc-on');
    document.documentElement.style.setProperty('--ui', String(settings.uiScale));
    return () => {
      document.documentElement.classList.remove('opc-on');
      document.documentElement.style.removeProperty('--ui');
    };
  }, []);

  useEffect(() => () => onImmersive(false), [onImmersive]);

  // #play/atelier tapé dans la barre d'adresse alors que l'onglet est ouvert (la page n'est pas rechargée)
  useEffect(() => {
    const onHash = () => { if (window.location.hash.startsWith('#play/atelier')) setModeState(modeFromHash()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // partie en ligne ou salle en cours : proposée sur l'écran de départ
  useEffect(() => {
    if (mode.kind !== 'solo') return;
    let cancelled = false;
    currentMatches().then((list) => { if (!cancelled) setCurrent(list.find((m) => m.status === 'playing') ?? list[0] ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode]);

  // salon et partie en ligne : tout l'écran
  useEffect(() => {
    if (mode.kind === 'solo') return;
    setFull(true);
    onImmersive(true);
  }, [mode, onImmersive]);
  const immersive = useCallback((on: boolean) => {
    setFull(on);
    onImmersive(on);
  }, [onImmersive]);

  return (
    <div className={full ? 'opc opc-full' : 'opc'}>
      {state === 'ready' ? (
        mode.kind === 'lobby' ? (
          <Lobby initialCode={mode.code} onOpen={(id) => setMode({ kind: 'match', id })} onBack={() => setMode({ kind: 'solo' })} />
        ) : mode.kind === 'match' ? (
          <OnlineMatch key={mode.id} id={mode.id} onLeave={() => setMode({ kind: 'solo' })} />
        ) : mode.kind === 'adventure' ? (
          <Suspense fallback={<div className="opc-wait"><span className="op-spinner" /> Chargement de l’aventure…</div>}>
            <AdventureApp onBack={() => setMode({ kind: 'solo' })} />
          </Suspense>
        ) : mode.kind === 'atelier' ? (
          <Suspense fallback={<div className="opc-wait"><span className="op-spinner" /> Chargement de l’atelier…</div>}>
            <Atelier page={mode.page} onPage={(page) => setMode({ kind: 'atelier', page })} onBack={() => setMode({ kind: 'solo' })} />
          </Suspense>
        ) : (
          <App notice={notice} onImmersive={immersive} adventure={{ onOpen: () => setMode({ kind: 'adventure' }) }} online={{
            onOpen: () => setMode({ kind: 'lobby' }),
            resume: current ? {
              label: current.status === 'playing'
                ? `Partie en cours contre ${current.opponent} : elle t’attend.`
                : `Ta salle ${current.code} attend ton ami.`,
              onResume: () => setMode({ kind: 'match', id: current.id }),
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
