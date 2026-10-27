// Réglages de l'interface, gardés dans le navigateur (tâche R1.3).
// - Un seul magasin pour toute la page : un réglage changé dans un écran s'applique tout de suite à tous les écrans
//   ouverts (plateau, aventure, boutique...), et aux autres onglets du navigateur (événement `storage`).
// - Même clé et même format qu'avant (`tcgc.game.settings`, un objet JSON) : les anciens réglages sont relus, un champ
//   abîmé reprend sa valeur par défaut, un champ inconnu est gardé.
// - « Animations réduites » (`reducedMotion`) : absent, il suit l'appareil (`prefers-reduced-motion`) ; useReducedMotion
//   donne la valeur à appliquer, GameApp en fait la classe `is-reduced-motion` de `.opc`.
// La mécanique (createSettingsStore) reçoit le stockage en paramètre : game/tests/settings.test.ts la teste sans
// navigateur.
import { useSyncExternalStore } from 'react';

export interface Settings {
  speed: number;          // délai minimum entre deux actions de l'IA (ms)
  sound: boolean;
  autoCoach: boolean;     // le coach calcule son conseil à chacune de tes décisions
  confirmEnd: boolean;    // demander confirmation avant de finir le tour s'il reste des actions utiles
  helpSeen: boolean;
  uiScale: number;        // taille de l'interface (1 : normale)
  zoomDelay: number;      // délai avant la fenêtre de détail d'une carte survolée (ms ; 0 : jamais)
  reducedMotion?: boolean; // animations réduites ; absent : comme le demande l'appareil
}

export const SETTINGS_KEY = 'tcgc.game.settings';
export const DEFAULTS: Settings = { speed: 900, sound: true, autoCoach: false, confirmEnd: true, helpSeen: false, uiScale: 1.15, zoomDelay: 1200 };

export const AI_SPEEDS: [number, string][] = [[1500, 'Lente'], [900, 'Normale'], [350, 'Rapide']];
export const UI_SCALES: [number, string][] = [[1, 'Normale'], [1.15, 'Grande'], [1.35, 'Très grande']];
export const ZOOM_DELAYS: [number, string][] = [[600, 'après 0,6 s'], [1200, 'après 1,2 s'], [2000, 'après 2 s'], [0, 'jamais']];

// Réglages écrits dans le stockage → réglages complets (valeurs par défaut pour ce qui manque ou est abîmé)
export function readSettings(raw: string | null): Settings {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? '{}');
  } catch {
    return { ...DEFAULTS };
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULTS };
  const out: Record<string, unknown> = { ...DEFAULTS, ...saved };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const v = out[key];
    if (typeof v !== typeof value || (typeof v === 'number' && !Number.isFinite(v))) out[key] = value;
  }
  if (out.reducedMotion !== undefined && typeof out.reducedMotion !== 'boolean') delete out.reducedMotion;
  return out as unknown as Settings;
}

// ---------- Magasin ----------

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SettingsStore {
  get(): Settings;
  /** change des réglages ; `reducedMotion: undefined` revient au choix de l'appareil */
  update(patch: Partial<Settings>): void;
  subscribe(listener: () => void): () => void;
  /** relit le stockage (un autre onglet l'a changé) */
  reload(): void;
}

export function createSettingsStore(storage: SettingsStorage | null): SettingsStore {
  const read = () => {
    try {
      return readSettings(storage?.getItem(SETTINGS_KEY) ?? null);
    } catch {
      return { ...DEFAULTS };
    }
  };
  let current = read();
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };
  return {
    get: () => current,
    update(patch) {
      const next: Settings = { ...current, ...patch };
      if (next.reducedMotion === undefined) delete next.reducedMotion;
      current = next;
      try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible : les réglages valent pour cette visite seulement
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reload() {
      const next = read();
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      current = next;
      notify();
    },
  };
}

// ---------- Magasin de la page ----------

let shared: SettingsStore | null = null;

function page(): SettingsStore {
  if (shared) return shared;
  let storage: SettingsStorage | null = null;
  try {
    storage = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // stockage interdit par le navigateur
  }
  const store = createSettingsStore(storage);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => { if (e.key === SETTINGS_KEY || e.key === null) store.reload(); });
  }
  return (shared = store);
}

export const getSettings = () => page().get();
export const updateSettings = (patch: Partial<Settings>) => page().update(patch);

// Réglages affichés ; l'écran se redessine quand l'un d'eux change, où que ce soit
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const store = page();
  return [useSyncExternalStore(store.subscribe, store.get), store.update];
}

// ---------- Animations réduites ----------

const REDUCE = '(prefers-reduced-motion: reduce)';
const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE) : null);

/** l'appareil demande-t-il moins d'animations ? */
export const systemReducedMotion = () => media()?.matches ?? false;

/** le réglage choisi, sinon celui de l'appareil */
export const reducedMotionOf = (settings: Settings, system: boolean) => settings.reducedMotion ?? system;

function subscribeSystem(listener: () => void) {
  const m = media();
  m?.addEventListener('change', listener);
  return () => m?.removeEventListener('change', listener);
}

// Animations réduites à appliquer (réglage du jeu, sinon l'appareil) ; suit les deux
export function useReducedMotion(): boolean {
  const [settings] = useSettings();
  const system = useSyncExternalStore(subscribeSystem, systemReducedMotion, () => false);
  return reducedMotionOf(settings, system);
}
