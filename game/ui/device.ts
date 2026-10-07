// L'appareil : écran tactile ou souris, petit écran (téléphone) ou grand, et mise en veille de l'écran.
// Les requêtes ci-dessous correspondent aux @media de styles.css (mise en page « compacte »).
import { useEffect, useState } from 'react';

// Téléphone (ou tablette en portrait), ou téléphone tenu en paysage
export const COMPACT = '(max-width: 900px) and (orientation: portrait), (max-height: 520px) and (orientation: landscape)';
// Écran tactile sans souris : pas de survol, on touche les cartes pour les lire
const TOUCH = '(hover: none)';

const query = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

export function isTouch(): boolean {
  return query(TOUCH)?.matches ?? false;
}

function useMedia(q: string): boolean {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? false);
  useEffect(() => {
    const m = query(q);
    if (!m) return;
    const update = () => setMatches(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [q]);
  return matches;
}

export function useDevice(): { compact: boolean; touch: boolean } {
  return { compact: useMedia(COMPACT), touch: useMedia(TOUCH) };
}

// Pendant une partie, l'écran du téléphone ne se met pas en veille (quand le navigateur le permet)
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!active || !wl) return;
    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wl.request('screen').then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      }).catch(() => {});
    };
    acquire();
    // le verrou saute quand l'appli passe en arrière-plan : on le reprend au retour
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
