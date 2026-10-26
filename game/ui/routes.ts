// Table des routes du jeu (onglet Jouer, adresses #play/...) et bouton Retour (tâche R1.4, 01-contrats.md § 14.2).
// - parse(hash) et format(route) : fonctions pures ; toutes les anciennes adresses sont acceptées, une adresse inconnue
//   sous #play/ mène à l'accueil du jeu.
// - navigate(route) passe d'un écran à l'autre avec pushState : le Retour du navigateur (ou d'Android) revient à
//   l'écran précédent, un rechargement rouvre le même écran. useRoute() donne la route affichée.
// - goBack(repli) et goUp(parent) : boutons « ← » des écrans, qui reviennent en arrière dans l'historique quand l'écran
//   précédent est le bon (sinon ils remplacent l'adresse, pour ne pas empiler d'entrées).
// - Couche des fenêtres : pushLayer(onBack) ajoute une entrée (même adresse), le Retour ferme la fenêtre ; popLayer(id)
//   retire l'entrée quand la fenêtre est fermée autrement (bouton, Échap). C'est ce que R1.3 branche sur le Dialog.
// - Garde de partie : useLeaveGuard(actif, onBack). Tant qu'une partie est en cours, le Retour ne quitte pas l'écran :
//   l'entrée est remise et onBack ouvre « Quitter la partie ? ».
// La mécanique d'historique (createNavigator) reçoit la fenêtre en paramètre : game/tests/routes.test.ts la teste avec
// un faux historique.
import { useEffect, useRef, useSyncExternalStore } from 'react';

// Sous-écrans de l'aventure (absent = la carte)
export type AdventureScreen = { kind: 'chapter'; id: string } | { kind: 'hold' } | { kind: 'deck' } | { kind: 'shop' };

export type Route =
  | { name: 'home' }                                   // #play : accueil du jeu (jusqu'à R3.1 : l'écran de départ)
  | { name: 'rapide' }                                 // #play/rapide : partie rapide (R3.2)
  | { name: 'jeu' }                                    // #play/jeu : partie contre l'IA en cours
  | { name: 'ami' }                                    // #play/ami : salon en ligne
  | { name: 'salle'; code: string }                    // #play/salle/<CODE> : salon, code prérempli (lien d'un ami)
  | { name: 'partie'; id: string }                     // #play/partie/<id> : partie en ligne
  | { name: 'aventure'; screen?: AdventureScreen }     // #play/aventure[/chapitre/<id>|/cale|/deck|/boutique]
  | { name: 'boutique' }                               // #play/boutique
  | { name: 'decks'; id?: string }                     // #play/decks[/<id>] : Mes decks, éditeur
  | { name: 'parties'; id?: string }                   // #play/parties[/<id>] : Mes parties, détail
  | { name: 'atelier'; page?: string };                // #play/atelier[/<page>] : atelier (caché)

export const HOME: Route = { name: 'home' };

const ADVENTURE_PAGES: Record<string, AdventureScreen> = { cale: { kind: 'hold' }, deck: { kind: 'deck' }, boutique: { kind: 'shop' } };

const decode = (part: string | undefined): string | undefined => {
  if (!part) return undefined;
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
};

// Adresse → route. Les anciennes adresses : #play/salle/<code> (code en minuscules accepté, suite ignorée),
// #play/partie/<id>, #play/aventure/<n'importe quoi> (la carte), #play/atelier[/<page>].
export function parse(hash: string): Route {
  const path = hash.replace(/^#/, '').split(/[?#]/)[0];
  const [root, name, ...rest] = path.split('/');
  if (root !== 'play') return HOME;
  const first = decode(rest[0]);
  switch (name) {
    case 'rapide': return { name: 'rapide' };
    case 'jeu': return { name: 'jeu' };
    case 'ami': return { name: 'ami' };
    case 'salle': {
      const code = rest[0]?.match(/^[A-Za-z0-9-]+/)?.[0];
      return code ? { name: 'salle', code: code.toUpperCase() } : { name: 'ami' };
    }
    case 'partie': {
      const id = rest[0]?.match(/^[\w-]+/)?.[0];
      return id ? { name: 'partie', id } : HOME;
    }
    case 'aventure': {
      if (rest[0] === 'chapitre') {
        const id = decode(rest[1]);
        return id ? { name: 'aventure', screen: { kind: 'chapter', id } } : { name: 'aventure' };
      }
      const page = rest[0] ? ADVENTURE_PAGES[rest[0]] : undefined;
      return page ? { name: 'aventure', screen: page } : { name: 'aventure' };
    }
    case 'boutique': return { name: 'boutique' };
    case 'decks': return first ? { name: 'decks', id: first } : { name: 'decks' };
    case 'parties': return first ? { name: 'parties', id: first } : { name: 'parties' };
    case 'atelier': {
      if (!rest.length) return { name: 'atelier' };
      return rest.length === 1 && /^[\w-]+$/.test(rest[0]) ? { name: 'atelier', page: rest[0] } : HOME;
    }
    default: return HOME;
  }
}

// Route → adresse (#play/...)
export function format(route: Route): string {
  const part = (s: string) => encodeURIComponent(s);
  switch (route.name) {
    case 'home': return '#play';
    case 'salle': return `#play/salle/${route.code}`;
    case 'partie': return `#play/partie/${route.id}`;
    case 'aventure': {
      const s = route.screen;
      if (!s) return '#play/aventure';
      if (s.kind === 'chapter') return `#play/aventure/chapitre/${part(s.id)}`;
      return `#play/aventure/${s.kind === 'hold' ? 'cale' : s.kind === 'deck' ? 'deck' : 'boutique'}`;
    }
    case 'decks':
    case 'parties': return route.id ? `#play/${route.name}/${part(route.id)}` : `#play/${route.name}`;
    case 'atelier': return route.page ? `#play/atelier/${route.page}` : '#play/atelier';
    default: return `#play/${route.name}`;
  }
}

export const isPlayHash = (hash: string) => /^#play(?:[/?#]|$)/.test(hash);

// ---------- Historique ----------

// Ce dont la mécanique a besoin de la fenêtre (window convient tel quel)
export interface HistoryWindow {
  location: { hash: string };
  history: {
    readonly state: unknown;
    pushState(state: unknown, unused: string, url?: string): void;
    replaceState(state: unknown, unused: string, url?: string): void;
    go(delta: number): void;
  };
  addEventListener(type: 'popstate' | 'hashchange', listener: () => void): void;
}

// Ce qu'on range dans history.state pour les entrées créées par le jeu : from = adresse de l'écran précédent (pour que
// « ← » revienne en arrière), layer = nombre de fenêtres ouvertes sur cette entrée
interface EntryState { opc: 1; from?: string; layer: number }

const entryOf = (state: unknown): EntryState | null =>
  state && typeof state === 'object' && (state as { opc?: unknown }).opc === 1 ? (state as EntryState) : null;

export interface Navigator {
  current(): Route;
  subscribe(listener: () => void): () => void;
  navigate(route: Route, options?: { replace?: boolean }): void;
  goBack(fallback: Route): void;
  goUp(parent: Route): void;
  pushLayer(onBack: () => void): number;
  popLayer(id: number): void;
  setGuard(onBack: () => void): () => void;
}

export function createNavigator(win: HistoryWindow): Navigator {
  const listeners = new Set<() => void>();
  let hash = win.location.hash;
  let route = parse(isPlayHash(hash) ? hash : '#play');
  let layers: { id: number; onBack: () => void }[] = [];
  let nextLayer = 1;
  // retours en arrière demandés par le jeu lui-même : ni la garde ni les fenêtres ne les arrêtent
  let ownMoves = 0;
  let guard: { hash: string; onBack: () => void } | null = null;

  // une entrée de fenêtre rechargée : la fenêtre n'est plus ouverte
  const initial = entryOf(win.history.state);
  if (initial?.layer) win.history.replaceState({ ...initial, layer: 0 }, '', hash);

  const notify = () => { for (const l of listeners) l(); };
  const sync = () => {
    hash = win.location.hash;
    if (!isPlayHash(hash)) return;   // un autre onglet de l'appli : le jeu va disparaître, la route reste la dernière
    const next = parse(hash);
    if (format(next) !== format(route)) {
      route = next;
      notify();
    }
  };

  const onHistory = () => {
    const entry = entryOf(win.history.state);
    const depth = entry?.layer ?? 0;
    if (ownMoves > 0) {
      ownMoves--;
      layers = layers.slice(0, depth);
      sync();
      return;
    }
    if (win.location.hash === hash && depth < layers.length) {
      // Retour avec une fenêtre ouverte : elle se ferme (la plus haute d'abord)
      const closed = layers.slice(depth).reverse();
      layers = layers.slice(0, depth);
      for (const l of closed) l.onBack();
      return;
    }
    if (win.location.hash === hash && depth === layers.length) return;   // hashchange après popstate : déjà traité
    layers = [];
    if (guard && win.location.hash !== guard.hash) {
      // partie en cours : on remet son entrée et on demande confirmation
      const back = win.location.hash;
      win.history.pushState({ opc: 1, from: isPlayHash(back) ? back : undefined, layer: 0 } satisfies EntryState, '', guard.hash);
      hash = guard.hash;
      guard.onBack();
      return;
    }
    sync();
  };
  win.addEventListener('popstate', onHistory);
  win.addEventListener('hashchange', onHistory);

  const navigate: Navigator['navigate'] = (to, options) => {
    const target = format(to);
    const here = entryOf(win.history.state);
    if (layers.length) {
      // une fenêtre ouverte mène ailleurs : l'adresse remplace son entrée (le Retour ramène à l'écran d'en dessous)
      layers = [];
      win.history.replaceState({ opc: 1, from: hash, layer: 0 } satisfies EntryState, '', target);
    } else if (target === hash) {
      return;
    } else if (options?.replace) {
      win.history.replaceState({ opc: 1, from: here?.from, layer: 0 } satisfies EntryState, '', target);
    } else {
      win.history.pushState({ opc: 1, from: hash, layer: 0 } satisfies EntryState, '', target);
    }
    hash = target;
    if (guard && guard.hash !== target) guard = null;
    route = parse(target);
    notify();
  };

  const back = () => {
    ownMoves++;
    guard = null;
    win.history.go(-1);
  };

  return {
    current: () => route,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    navigate,
    // « ← Retour » : l'écran précédent s'il est du jeu, sinon le repli
    goBack(fallback) {
      if (!layers.length && entryOf(win.history.state)?.from) back();
      else navigate(fallback, { replace: true });
    },
    // « ← <parent> » : revient en arrière si l'écran précédent est le parent, sinon remplace l'adresse par le parent
    goUp(parent) {
      if (!layers.length && entryOf(win.history.state)?.from === format(parent)) back();
      else navigate(parent, { replace: true });
    },
    pushLayer(onBack) {
      const id = nextLayer++;
      layers.push({ id, onBack });
      win.history.pushState({ opc: 1, from: entryOf(win.history.state)?.from, layer: layers.length } satisfies EntryState, '', hash);
      return id;
    },
    // la fenêtre id est fermée par un bouton ou Échap : on retire son entrée (et celles des fenêtres ouvertes dessus)
    popLayer(id) {
      const at = layers.findIndex((l) => l.id === id);
      if (at < 0) return;   // déjà fermée par le Retour
      const count = layers.length - at;
      layers = layers.slice(0, at);
      ownMoves++;
      win.history.go(-count);
    },
    // garde posée sur l'écran affiché ; la fonction rendue la retire (si elle est encore là)
    setGuard(onBack) {
      const mine = { hash: win.location.hash, onBack };
      guard = mine;
      return () => { if (guard === mine) guard = null; };
    },
  };
}

// ---------- Navigateur de la page ----------

let shared: Navigator | null = null;
const page = (): Navigator => (shared ??= createNavigator(window));

export const currentRoute = () => page().current();
export const navigate = (route: Route, options?: { replace?: boolean }) => page().navigate(route, options);
export const goBack = (fallback: Route) => page().goBack(fallback);
export const goUp = (parent: Route) => page().goUp(parent);
export const pushLayer = (onBack: () => void) => page().pushLayer(onBack);
export const popLayer = (id: number) => page().popLayer(id);

// Route affichée ; l'écran se redessine quand elle change
export function useRoute(): Route {
  const nav = page();
  return useSyncExternalStore(nav.subscribe, nav.current);
}

// Partie en cours : tant que active est vrai, le Retour reste sur l'écran et appelle onBack (« Quitter la partie ? »).
// Pour quitter ensuite, l'écran utilise goBack / goUp / navigate, que la garde n'arrête pas.
export function useLeaveGuard(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return page().setGuard(() => ref.current());
  }, [active]);
}

// Fenêtre liée au Retour (pour R1.3 et le Dialog du kit) : tant que open est vrai, une entrée d'historique existe ; le
// Retour appelle onClose, et une fermeture par l'écran retire l'entrée
export function useLayer(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = pushLayer(() => ref.current());
    return () => popLayer(id);
  }, [open]);
}
