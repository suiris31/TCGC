import { hasMessage, locale, t } from './i18n';

export type PriceSource = 'cardmarket' | 'tcgplayer';

export interface User {
  id: number;
  pseudo: string;
  email: string;
  createdAt: string;
  priceSource: PriceSource;
}

// Émis quand le serveur répond que la session n'est plus valide : l'appli revient à l'écran de connexion
export const LOGGED_OUT_EVENT = 'tcgc:logged-out';

// Langue d'un exemplaire possédé
export type Lang = 'fr' | 'en';

export interface Price {
  // Estimation retenue (source choisie dans les réglages, l'autre en secours)
  eur: number | null;
  source: PriceSource | null;
  cardmarket: {
    eur: number;
    basis: 'trend' | 'avg30' | 'avg7';
    trend: number | null;
    avg30: number | null;
    low: number | null;
    date: string | null;
  } | null;
  tcgplayer: {
    eur: number;
    usd: number;
    basis: 'market' | 'low' | 'mid';
    marketEur: number | null;
    lowEur: number | null;
    date: string | null;
  } | null;
}

export interface Card {
  id: number;
  name: string;
  nameFr: string | null;
  fullName: string;
  variant: string | null;
  number: string;
  rarity: string | null;
  color: string | null;
  type: string | null;
  cost: string | null;
  power: string | null;
  counter: string | null;
  life: string | null;
  attribute: string | null;
  subtypes: string | null;
  description: string | null;
  setCode: string | null;
  setName: string;
  releaseDate: string | null;
  image: string;
  imageLarge: string;
  imageFr: string | null;
  imageFrLarge: string | null;
  tcgplayerUrl: string | null;
  cardmarketUrl: string | null;
  price: Price;
  // Exemplaires possédés, toutes langues confondues et par langue
  owned: number;
  ownedByLang: Record<Lang, number>;
  // Vue collection : un exemplaire (carte + langue) et sa quantité
  entry: { lang: Lang; quantity: number } | null;
}

export interface CardDetail extends Card {
  versions: Card[];
  history: { date: string; eur: number | null }[];
}

export interface Totals {
  distinctCards: number;
  cards: number;
  valueEur: number | null;
  unpriced: number;
}

export interface Status {
  lastSync: string | null;
  priceDate: string | null;
  cmPriceDate: string | null;
  priceSource: PriceSource;
  usdPerEur: number | null;
  syncing: boolean;
  scan: { indexed: number; total: number; building: boolean };
  error: string | null;
  totals: Totals;
}

export interface SetInfo {
  id: number;
  code: string | null;
  name: string;
  releaseDate: string | null;
  cards: number;
  owned: number;
}

// Un set vu depuis la collection
export interface SetSummary {
  id: number;
  code: string | null;
  name: string;
  releaseDate: string | null;
  total: number;    // cartes du set (toutes versions)
  owned: number;    // cartes différentes possédées
  copies: number;   // exemplaires possédés
  valueEur: number;
  // carte d'illustration : la plus chère possédée, sinon la plus chère du set (ownedLang null)
  cover: { id: number; image: string; imageFr: string | null; ownedLang: Lang | null } | null;
}

export interface Stats {
  totals: Totals;
  bySet: { code: string | null; name: string; cards: number; valueEur: number }[];
  history: { date: string; valueEur: number; cards: number }[];
  top: Card[];
}

export interface ScanResult {
  ms: number;
  // Écart de score entre le meilleur résultat et le premier visuel différent
  margin: number;
  // sameArt : même visuel que le meilleur résultat (réimpression, version tamponnée...)
  candidates: { card: Card; score: number; sameArt: boolean }[];
}

export interface CardQuery {
  q?: string;
  set?: string;
  color?: string;
  rarity?: string;
  type?: string;
  owned?: boolean;
  lang?: Lang | '';
  status?: 'owned' | 'missing';
  sort?: string;
  limit?: number;
  offset?: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && body.code === 'unauthorized') window.dispatchEvent(new Event(LOGGED_OUT_EVENT));
    // Le serveur renvoie un code d'erreur traduit ici ; à défaut, son message tel quel
    const key = `error.${body.code}`;
    throw new Error(body.code && hasMessage(key) ? t(key, body) : body.error ?? t('error.http', { n: res.status }));
  }
  return body as T;
}

function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  return sp.toString();
}

// Les adresses de l'API sont relatives à la page : l'appli fonctionne aussi dans un sous-dossier (ex. /tcgc/)
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  me: () => request<{ user: User | null }>('api/auth/me'),
  signup: (pseudo: string, email: string, password: string) =>
    request<{ user: User }>('api/auth/signup', json('POST', { pseudo, email, password })),
  login: (identifier: string, password: string) =>
    request<{ user: User }>('api/auth/login', json('POST', { identifier, password })),
  logout: () => request<{ ok: boolean }>('api/auth/logout', { method: 'POST' }),
  deleteAccount: (password: string) => request<{ ok: boolean }>('api/auth/account', json('DELETE', { password })),
  status: () => request<Status>('api/status'),
  sync: () => request<{ started: boolean }>('api/sync', { method: 'POST' }),
  setPriceSource: (priceSource: PriceSource) =>
    request<{ priceSource: PriceSource; totals: Totals }>('api/settings', json('PUT', { priceSource })),
  sets: () => request<SetInfo[]>('api/sets'),
  collectionSets: (all: boolean) => request<SetSummary[]>(`api/collection/sets${all ? '?all=1' : ''}`),
  cards: (query: CardQuery) => request<{ total: number; cards: Card[] }>(`api/cards?${qs({ ...query })}`),
  card: (id: number) => request<CardDetail>(`api/cards/${id}`),
  setQuantity: (id: number, quantity: number, lang: Lang) =>
    request<{ card: Card; totals: Totals }>(`api/collection/${id}`, json('PUT', { quantity, lang })),
  add: (id: number, delta: number, lang: Lang) =>
    request<{ card: Card; totals: Totals }>(`api/collection/${id}/add`, json('POST', { delta, lang })),
  stats: () => request<Stats>('api/stats'),
  importCollection: (csv: string) =>
    request<{ cards: number; copies: number; skipped: number; totals: Totals }>('api/collection/import', {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv,
    }),
  scan: (image: Blob, mode: 'guide' | 'photo') =>
    request<ScanResult>(`api/scan?mode=${mode}`, { method: 'POST', headers: { 'Content-Type': image.type || 'image/jpeg' }, body: image }),
};

const eurFormats = new Map<string, Intl.NumberFormat>();

function eurFormat(round: boolean) {
  const key = `${locale()}|${round}`;
  if (!eurFormats.has(key)) {
    eurFormats.set(key, new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', ...(round ? { maximumFractionDigits: 0 } : {}) }));
  }
  return eurFormats.get(key)!;
}

export function formatEur(value: number | null | undefined, round = false) {
  if (value == null) return '—';
  return eurFormat(round && value >= 1000).format(value);
}

// Une carte s'affiche dans sa langue : nom et visuel VF pour une carte française (quand on les connaît),
// VO sinon
export function cardName(card: Card, lang: Lang) {
  return lang === 'fr' ? (card.nameFr ?? card.name) : card.name;
}

export function cardImage(card: Card, lang: Lang) {
  return lang === 'fr' ? (card.imageFr ?? card.image) : card.image;
}

export function cardImageLarge(card: Card, lang: Lang) {
  return lang === 'fr' && card.imageFrLarge ? card.imageFrLarge : card.imageLarge;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
