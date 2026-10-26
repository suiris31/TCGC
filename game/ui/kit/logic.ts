// Fonctions pures du kit (sans React ni DOM réel), testées en Node : pile des fenêtres ouvertes, circulation du focus
// au clavier, répartition des actions d'un en-tête, état d'un chargement.

// ---------- Pile des fenêtres ----------
// Plusieurs fenêtres peuvent être ouvertes l'une sur l'autre : seule celle du dessus garde le focus et répond à Échap.
// Une fenêtre réduite (« Voir le plateau ») reste dans la pile mais ne garde plus le focus.

export interface LayerStack {
  /** la fenêtre s'ouvre (elle passe au-dessus) */
  push(id: string): void;
  /** la fenêtre se ferme, où qu'elle soit dans la pile */
  remove(id: string): void;
  /** la fenêtre est réduite (true) ou rouverte (false) : une fenêtre rouverte repasse au-dessus */
  setReduced(id: string, reduced: boolean): void;
  /** la fenêtre active : la plus haute qui n'est pas réduite */
  top(): string | null;
  isTop(id: string): boolean;
  ids(): string[];
}

export function createLayerStack(): LayerStack {
  let layers: { id: string; reduced: boolean }[] = [];
  const top = () => {
    for (let i = layers.length - 1; i >= 0; i--) if (!layers[i].reduced) return layers[i].id;
    return null;
  };
  return {
    push(id) {
      layers = [...layers.filter((l) => l.id !== id), { id, reduced: false }];
    },
    remove(id) {
      layers = layers.filter((l) => l.id !== id);
    },
    setReduced(id, reduced) {
      const layer = layers.find((l) => l.id === id);
      if (!layer) return;
      layers = reduced
        ? layers.map((l) => (l.id === id ? { id, reduced: true } : l))
        : [...layers.filter((l) => l.id !== id), { id, reduced: false }];
    },
    top,
    isTop: (id) => top() === id,
    ids: () => layers.map((l) => l.id),
  };
}

/** La pile de tout le jeu : fenêtres (`Dialog`) et menus ouverts (le menu « ⋯ » d'un en-tête) */
export const openLayers = createLayerStack();

// ---------- Focus ----------

/** Éléments qu'on atteint avec Tab (ceux qui sont cachés ou désactivés sont écartés par `isTabbable`) */
export const TABBABLE = [
  'a[href]', 'area[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'iframe', 'summary',
  '[tabindex]', '[contenteditable=""]', '[contenteditable="true"]',
].join(',');

/** Ce que `isTabbable` lit d'un élément (un vrai élément du DOM convient) */
export interface FocusCandidate {
  tabIndex: number;
  hidden?: boolean | string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  /** largeur et hauteur affichées : 0 × 0 = élément non affiché (display: none, ou dans un parent caché) */
  getClientRects(): { length: number };
}

export function isTabbable(el: FocusCandidate): boolean {
  if (el.tabIndex < 0 || el.hidden === true) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return false;
  return el.getClientRects().length > 0;
}

/**
 * Où va le focus quand on appuie sur Tab (ou Maj+Tab) dans une fenêtre : il circule parmi `items` et ne sort jamais.
 * `current` absent de la liste (focus hors de la fenêtre, ou sur la fenêtre elle-même) : premier élément (dernier
 * avec Maj). Renvoie null s'il n'y a rien à atteindre (le focus reste alors sur la fenêtre).
 */
export function nextFocus<T>(items: readonly T[], current: T | null, backwards: boolean): T | null {
  if (!items.length) return null;
  const i = current === null ? -1 : items.indexOf(current);
  if (i < 0) return backwards ? items[items.length - 1] : items[0];
  const n = items.length;
  return items[(i + (backwards ? n - 1 : 1)) % n];
}

/**
 * Le premier élément à recevoir le focus à l'ouverture d'une fenêtre : celui marqué `data-autofocus`, sinon le premier
 * élément du contenu, sinon le premier de toute la fenêtre (bouton de fermeture), sinon rien (la fenêtre elle-même).
 */
export function initialFocus<T>(marked: T | null, content: readonly T[], all: readonly T[]): T | null {
  return marked ?? content[0] ?? all[0] ?? null;
}

// ---------- Menus ----------

/** Élément suivant d'un menu au clavier (flèches, Début, Fin), en sautant les éléments désactivés */
export function menuMove(disabled: readonly boolean[], current: number, key: string): number {
  const n = disabled.length;
  if (!n || disabled.every(Boolean)) return -1;
  const step = (from: number, dir: 1 | -1) => {
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!disabled[i]) return i;
    }
    return -1;
  };
  if (key === 'Home') return step(-1, 1);
  if (key === 'End') return step(n, -1);
  if (key === 'ArrowDown') return step(current < 0 ? -1 : current, 1);
  if (key === 'ArrowUp') return step(current < 0 ? n : current, -1);
  return current;
}

// ---------- En-tête d'écran ----------

/** Les actions d'un en-tête : les `max` premières restent visibles, les autres passent dans le menu « ⋯ » */
export function splitActions<T>(actions: readonly T[], max = 2): { shown: T[]; menu: T[] } {
  const keep = Math.max(0, max);
  return { shown: actions.slice(0, keep), menu: actions.slice(keep) };
}

// ---------- Chargement ----------

export type AsyncView = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Ce que montre `AsyncState`. Un chargement en cours l'emporte (y compris pendant « Réessayer », alors que l'erreur
 * précédente est encore là), puis l'erreur, puis le vide.
 */
export function asyncView({ loading, error, empty }: { loading?: boolean; error?: unknown; empty?: boolean }): AsyncView {
  if (loading) return 'loading';
  if (error !== undefined && error !== null && error !== false) return 'error';
  if (empty) return 'empty';
  return 'ready';
}

/** Le message d'une erreur, tel que le serveur l'a écrit quand il y en a un (`ApiError.message`, R1.5) */
export function errorMessage(error: unknown): string {
  const fallback = 'Une erreur est survenue.';
  if (typeof error === 'string') return error.trim() || fallback;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}
