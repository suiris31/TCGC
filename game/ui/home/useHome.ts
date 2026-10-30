// Ce que l'accueil lit sur le serveur (tâche R3.1) : parties enregistrées (partie rapide ou chapitre interrompus, bilan),
// progression de l'aventure, partie ou salle en ligne en cours. Chaque lecture est indépendante : un échec n'empêche
// pas le reste de l'accueil (les boutons mènent toujours aux écrans, qui ont leurs propres messages d'erreur).
// L'accueil attend ces lectures (READY_MS au plus) avant de montrer ses boutons : arrivés après coup, la carte de
// l'aventure ou le bloc « Continuer » les feraient bouger sous le doigt.
import { useCallback, useEffect, useState } from 'react';
import { loadAdventure, type AdventureState } from '../adventure/api.ts';
import { flushQueue, loadSummaries, whenSaved } from '../archiveClient.ts';
import { currentMatches, type CurrentMatch } from '../online/api.ts';
import type { HomeGame } from './logic.ts';

// Parties interrompues écartées par « Ignorer » (sur cet appareil ; elles restent dans « Mes parties »)
const DISMISSED_KEY = 'tcgc.game.home.dismissed';
const READY_MS = 3000;

function readDismissed(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export interface HomeData {
  ready: boolean;                    // lectures finies (réussies ou non), ou attente dépassée
  games: HomeGame[] | null;          // null : pas encore lues (ou illisibles)
  adventure: AdventureState | null;
  adventureFailed: boolean;
  online: CurrentMatch | null;
  dismissed: string[];
  dismiss: (id: string) => void;
}

export function useHome(): HomeData {
  const [games, setGames] = useState<HomeGame[] | null>(null);
  const [adventure, setAdventure] = useState<AdventureState | null>(null);
  const [adventureFailed, setAdventureFailed] = useState(false);
  const [online, setOnline] = useState<CurrentMatch | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [settled, setSettled] = useState(0);
  const [late, setLate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setSettled((n) => n + 1); };
    const timer = setTimeout(() => { if (!cancelled) setLate(true); }, READY_MS);
    // une partie qu'on vient de quitter (ou restée dans le navigateur, onglet fermé) part d'abord sur le serveur
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      flushQueue();
      await whenSaved();
      const list = await loadSummaries();
      if (!cancelled) setGames(list);
    })().catch(() => undefined).finally(done);
    loadAdventure().then((adv) => { if (!cancelled) setAdventure(adv); }, () => { if (!cancelled) setAdventureFailed(true); }).finally(done);
    // une partie qui se joue passe avant une salle qui attend
    currentMatches().then((list) => { if (!cancelled) setOnline(list.find((m) => m.status === 'playing') ?? list[0] ?? null); }, () => undefined).finally(done);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((list) => {
      const next = [...list.filter((x) => x !== id), id].slice(-20);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible : écartée jusqu'au prochain affichage seulement
      }
      return next;
    });
  }, []);

  return { ready: settled >= 3 || late, games, adventure, adventureFailed, online, dismissed, dismiss };
}
