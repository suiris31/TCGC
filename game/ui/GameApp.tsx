// Point d'entrée du jeu dans l'appli TCGC (onglet Jouer), chargé seulement quand on ouvre l'onglet : informations des
// cartes demandées au serveur, parties enregistrées sur le compte connecté, style isolé du reste de l'appli.
import { useCallback, useEffect, useState } from 'react';
import { loadCardData } from '../engine/cards/index.ts';
import type { CardData } from '../engine/types.ts';
import { App } from './App.tsx';
import { setArchiveUser } from './archiveClient.ts';
import './styles.css';

// Informations des cartes : une fois par visite (les fils de calcul de l'IA les reçoivent du module chargé ici)
let cardsLoaded: Promise<void> | null = null;

async function fetchCards(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${import.meta.env.BASE_URL}api/game/cards`, { cache: 'no-cache' });
    if (res.ok) return loadCardData((await res.json()) as Record<string, CardData>);
    // 503 : le serveur vient de démarrer et télécharge encore les informations des cartes
    if (res.status !== 503 || attempt >= 20) throw new Error(`le serveur a répondu ${res.status}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export default function GameApp({ userId, notice, onImmersive }: { userId: number; notice?: string; onImmersive: (on: boolean) => void }) {
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');
  const [full, setFull] = useState(false);

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
  const immersive = useCallback((on: boolean) => {
    setFull(on);
    onImmersive(on);
  }, [onImmersive]);

  return (
    <div className={full ? 'opc opc-full' : 'opc'}>
      {state === 'ready' ? (
        <App notice={notice} onImmersive={immersive} />
      ) : state === 'loading' ? (
        <div className="opc-wait"><span className="op-spinner" /> Chargement du jeu…</div>
      ) : (
        <div className="opc-wait">Impossible de charger le jeu : {state}. Réessaie dans un moment.</div>
      )}
    </div>
  );
}
