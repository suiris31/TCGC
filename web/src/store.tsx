import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, LOGGED_OUT_EVENT, type Card, type Lang, type Status, type Totals, type User } from './api';
import { getUiLang, setUiLang as applyUiLang, type UiLang } from './i18n';

// Langue de saisie des cartes (scan, ajout depuis le catalogue) : la dernière choisie est retenue,
// sinon celle de l'interface
const LANG_KEY = 'tcgc.lang';

function readLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch { /* stockage indisponible */ }
  return getUiLang();
}

export interface OpenedCard { id: number; lang: Lang }

interface AppState {
  // undefined : vérification de la session en cours ; null : déconnecté
  user: User | null | undefined;
  setUser: (user: User | null) => void;
  status: Status | null;
  totals: Totals | null;
  refreshStatus: () => void;
  // Incrémenté à chaque modification de la collection ou des prix : les listes l'utilisent pour se recharger
  version: number;
  cardChanged: (card: Card | null, totals: Totals) => void;
  // Recherches modifiées : les listes se rechargent et le compteur de cartes sous leur prix cible se met à jour
  wishChanged: () => void;
  // lang : langue dans laquelle afficher la carte (par défaut la langue de saisie)
  openCard: (id: number, lang?: Lang) => void;
  openedCard: OpenedCard | null;
  lang: Lang;
  setLang: (lang: Lang) => void;
  // Langue de l'interface (indépendante de la langue des cartes)
  uiLang: UiLang;
  setUiLang: (lang: UiLang) => void;
  closeCard: () => void;
  toast: (message: string) => void;
  toastMessage: string | null;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null | undefined>(undefined);
  const [status, setStatus] = useState<Status | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [version, setVersion] = useState(0);
  const [openedCard, setOpenedCard] = useState<OpenedCard | null>(null);
  const [lang, setLangState] = useState<Lang>(readLang);
  const [uiLang, setUiLangState] = useState<UiLang>(getUiLang);

  const setUiLang = useCallback((next: UiLang) => {
    applyUiLang(next);
    setUiLangState(next);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* stockage indisponible : choix gardé pour la session */ }
  }, []);

  const openCard = useCallback((id: number, cardLang?: Lang) => setOpenedCard({ id, lang: cardLang ?? lang }), [lang]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const refreshStatus = useCallback(() => {
    api.status().then((s) => {
      setStatus(s);
      setTotals(s.totals);
    }).catch(() => {});
  }, []);

  // Session : vérifiée au démarrage, perdue dès que le serveur répond « non connecté »
  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    setStatus(null);
    setTotals(null);
    setOpenedCard(null);
  }, []);

  useEffect(() => {
    api.me().then((res) => setUserState(res.user)).catch(() => setUserState(null));
    const onLoggedOut = () => setUser(null);
    window.addEventListener(LOGGED_OUT_EVENT, onLoggedOut);
    return () => window.removeEventListener(LOGGED_OUT_EVENT, onLoggedOut);
  }, [setUser]);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId === null) return;
    refreshStatus();
    // Pendant une synchro ou la construction de l'index, on rafraîchit l'état régulièrement
    const timer = window.setInterval(refreshStatus, 15000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, userId]);

  const cardChanged = useCallback((_card: Card | null, newTotals: Totals) => {
    setTotals(newTotals);
    setVersion((v) => v + 1);
  }, []);

  const wishChanged = useCallback(() => {
    setVersion((v) => v + 1);
    refreshStatus();
  }, [refreshStatus]);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2200);
  }, []);

  return (
    <Ctx.Provider value={{
      user, setUser, status, totals, refreshStatus, version, cardChanged, wishChanged,
      openCard, openedCard, closeCard: () => setOpenedCard(null), lang, setLang, uiLang, setUiLang,
      toast, toastMessage,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp hors de AppProvider');
  return ctx;
}
