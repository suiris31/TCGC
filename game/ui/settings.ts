// Réglages de l'interface, gardés dans le navigateur
import { useCallback, useState } from 'react';

export interface Settings {
  speed: number;          // délai minimum entre deux actions de l'IA (ms)
  sound: boolean;
  autoCoach: boolean;     // le coach calcule son conseil à chacune de tes décisions
  confirmEnd: boolean;    // demander confirmation avant de finir le tour s'il reste des actions utiles
  helpSeen: boolean;
  uiScale: number;        // taille de l'interface (1 : normale)
  zoomDelay: number;      // délai avant la fenêtre de détail d'une carte survolée (ms ; 0 : jamais)
}

const KEY = 'tcgc.game.settings';
const DEFAULTS: Settings = { speed: 900, sound: true, autoCoach: false, confirmEnd: true, helpSeen: false, uiScale: 1.15, zoomDelay: 1200 };

export const UI_SCALES: [number, string][] = [[1, 'Normale'], [1.15, 'Grande'], [1.35, 'Très grande']];
export const ZOOM_DELAYS: [number, string][] = [[600, 'après 0,6 s'], [1200, 'après 1,2 s'], [2000, 'après 2 s'], [0, 'jamais']];

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible : les réglages valent pour cette session seulement
      }
      return next;
    });
  }, []);
  return [settings, update];
}
