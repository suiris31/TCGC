// État du mode Aventure dont ont besoin la Cale et le deck d'aventure : cartes de la Cale (par version et par numéro)
// et état de l'aventure (deck choisi, arcs commencés, boosters à ouvrir), lus ensemble sur le serveur.
import { useCallback, useEffect, useRef, useState } from 'react';
import { holdByNumber, loadAdventure, loadHold, type AdventureState, type HoldCard } from './api.ts';

export interface HoldState {
  cards: HoldCard[];
  byNumber: Record<string, number>;   // ce qu'un deck d'aventure peut contenir
  adventure: AdventureState;
}

export async function fetchHoldState(): Promise<HoldState> {
  const [{ cards }, adventure] = await Promise.all([loadHold(), loadAdventure()]);
  return { cards, byNumber: holdByNumber(cards), adventure };
}

// data : null pendant le premier chargement ; error : message à montrer tel quel (le dernier état reste affiché)
export function useHoldState() {
  const [data, setData] = useState<HoldState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    try {
      const next = await fetchHoldState();
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; };
  }, [reload]);
  // réponse d'une route qui renvoie l'état de l'aventure (choix du deck...) : rien à relire
  const setAdventure = useCallback((adventure: AdventureState) => setData((d) => (d ? { ...d, adventure } : d)), []);
  return { data, error, reload, setAdventure };
}

export const arcStarted = (s: AdventureState) => Object.values(s.arcs).some((a) => a.started);
