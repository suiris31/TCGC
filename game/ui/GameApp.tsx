// Point d'entrée du jeu dans l'appli TCGC (onglet Jouer), chargé seulement quand on ouvre l'onglet : informations des
// cartes demandées au serveur, parties enregistrées sur le compte connecté, style isolé du reste de l'appli.
import { useCallback, useEffect, useState } from 'react';
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';
import { App } from './App.tsx';
import { setArchiveUser } from './archiveClient.ts';
import { currentMatches, type CurrentMatch } from './online/api.ts';
import { Lobby } from './online/Lobby.tsx';
import { OnlineMatch } from './online/OnlineMatch.tsx';
import './styles.css';

// Informations des cartes : une fois par visite (les fils de calcul de l'IA les reçoivent du module chargé ici)
let cardsLoaded: Promise<void> | null = null;

async function fetchCards(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${import.meta.env.BASE_URL}api/game/cards`, { cache: 'no-cache' });
    if (res.ok) return loadCardData((await res.json()) as Record<string, CardData>);
    // 503 : le serveur vient de démarrer et télécharge encore les informations des cartes
    if (res.status !== 503 || attempt >= 40) throw new Error(`le serveur a répondu ${res.status}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

type Mode = { kind: 'solo' } | { kind: 'lobby'; code?: string } | { kind: 'match'; id: string };

// Adresse de l'onglet : #play/salle/<code> (lien envoyé par un ami) ou #play/partie/<id> (partie en ligne ouverte)
function modeFromHash(): Mode {
  const room = window.location.hash.match(/^#play\/salle\/([A-Za-z0-9-]+)/);
  if (room) return { kind: 'lobby', code: room[1].toUpperCase() };
  const match = window.location.hash.match(/^#play\/partie\/([\w-]+)/);
  if (match) return { kind: 'match', id: match[1] };
  return { kind: 'solo' };
}

function hashOf(mode: Mode): string {
  return mode.kind === 'match' ? `#play/partie/${mode.id}` : '#play';
}

export default function GameApp({ userId, notice, onImmersive }: { userId: number; notice?: string; onImmersive: (on: boolean) => void }) {
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');
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
    cardsLoaded.then(() => setState('ready'), (e: unknown) => setState(e instanceof Error ? e.message : String(e)));
  }, []);

  // Tailles du jeu en rem : la taille du texte de la page ne change que pendant que le jeu est affiché
  useEffect(() => {
    document.documentElement.classList.add('opc-on');
    return () => {
      document.documentElement.classList.remove('opc-on');
      document.documentElement.style.removeProperty('--ui');
    };
  }, []);

  useEffect(() => () => onImmersive(false), [onImmersive]);

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
        ) : (
          <App notice={notice} onImmersive={immersive} online={{
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
        <div className="opc-wait"><span className="op-spinner" /> Chargement du jeu…</div>
      ) : (
        <div className="opc-wait">Impossible de charger le jeu : {state}. Réessaie dans un moment.</div>
      )}
    </div>
  );
}
