// L'appareil : écran tactile ou souris, petit écran (téléphone) ou grand, et mise en veille de l'écran.
// Seule source de la mise en page « compacte » : GameApp pose les classes de deviceClasses() sur .opc (.is-compact,
// .is-portrait, .is-landscape), que les feuilles de styles/ lisent au lieu de répéter ces requêtes en @media.
import { useEffect, useState } from 'react';

// Téléphone (ou tablette) en portrait ; téléphone tenu en paysage ; « compact » : l'un ou l'autre
export const PORTRAIT = '(max-width: 900px) and (orientation: portrait)';
export const LANDSCAPE = '(max-height: 520px) and (orientation: landscape)';
export const COMPACT = `${PORTRAIT}, ${LANDSCAPE}`;
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

export interface Device {
  compact: boolean;     // portrait ou paysage
  portrait: boolean;    // téléphone (ou tablette) en portrait
  landscape: boolean;   // téléphone en paysage
  touch: boolean;
}

export function useDevice(): Device {
  const portrait = useMedia(PORTRAIT);
  const landscape = useMedia(LANDSCAPE);
  return { compact: portrait || landscape, portrait, landscape, touch: useMedia(TOUCH) };
}

// Les classes à poser sur .opc (aucune sur ordinateur)
export function deviceClasses(d: Pick<Device, 'portrait' | 'landscape'>): string {
  return d.portrait ? ' is-compact is-portrait' : d.landscape ? ' is-compact is-landscape' : '';
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
