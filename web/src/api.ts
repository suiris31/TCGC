import { hasMessage, locale, t } from './i18n';

export type PriceSource = 'cardmarket' | 'tcgplayer';

export interface User {
  id: number;
  pseudo: string;
  email: string;
  createdAt: string;
  priceSource: PriceSource;
  // exemplaires gardés par carte et par langue : au-delà, ce sont des doubles
  keepCopies: number;
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
    avg7: number | null;
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

// Bon moment pour acheter ? (calculé par le serveur, voir server/insight.js)
export type InsightKind = 'upcoming' | 'banned' | 'new' | 'new-falling' | 'rising' | 'falling' | 'good' | 'stable' | 'cheap';

// Statut en tournoi officiel : bannie, limitée, bannie en paire
export type RegulationStatus = 'banned' | 'restricted' | 'pair';

export interface Insight {
  kind: InsightKind | null;
  // variation récente du prix (−0,15 = −15 %) pour new-falling, rising, falling et good
  change: number | null;
  // semaines depuis la sortie du set (ou avant sa sortie)
  weeks: number | null;
  // bannissement récent : statut et date de l'annonce
  ban: { status: RegulationStatus; announced: string } | null;
  // prix cible proposé pour une liste de souhaits
  target: number | null;
}

// Carte dans les recherches (liste de souhaits)
export interface Wish {
  lang: Lang;
  targetEur: number | null;
  addedAt: string;
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
  insight: Insight | null;
  wish: Wish | null;
  regulation: { status: RegulationStatus; announced: string | null; effective: string | null } | null;
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
  // reached : cartes recherchées dont le prix est passé sous le prix cible
  wishlist: { count: number; reached: number };
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

// Doubles : exemplaires au-delà de ceux qu'on garde (extra), avec leur valeur
export interface Doubles {
  keep: number;
  copies: number;
  distinct: number;
  valueEur: number;
  cards: (Card & { extra: number })[];
}

export type ShareScope = 'doubles' | 'collection';

// Lien de partage de l'utilisateur connecté
export interface Share {
  token: string;
  scope: ShareScope;
  showPrices: boolean;
  showWishlist: boolean;
  createdAt: string;
}

// Page publique d'un lien de partage : cartes réduites à ce qui peut être montré
export interface SharedCard {
  id: number;
  name: string;
  nameFr: string | null;
  number: string;
  variant: string | null;
  rarity: string | null;
  setCode: string | null;
  setName: string;
  releaseDate: string | null;
  image: string;
  imageFr: string | null;
  lang: Lang;
  quantity: number;
  price: number | null;
}

export interface SharedView {
  pseudo: string;
  scope: ShareScope;
  showPrices: boolean;
  keep: number;
  updatedAt: string | null;
  cards: SharedCard[];
  wanted: SharedCard[];
}

// Types de notifications que l'utilisateur peut couper
export interface NotifyPrefs {
  targets: boolean;
  weekly: boolean;
  trades: boolean;
  bans: boolean;
}

// Échanges entre membres
export interface TradeSettings {
  enabled: boolean;
  contact: string;
  region: string;
}

// Carte d'un échange : langue de l'exemplaire et nombre de doubles disponibles
export type TradeCard = Card & { tradeLang: Lang; extra: number };

export interface TradeMatch {
  pseudo: string;
  contact: string;
  region: string;
  theyHave: TradeCard[];  // ses doubles que je cherche
  theyWant: TradeCard[];  // mes doubles qu'il cherche
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
  authConfig: () => request<{ passwordReset: boolean }>('api/auth/config'),
  forgotPassword: (email: string, lang: string) => request<{ ok: boolean }>('api/auth/forgot', json('POST', { email, lang })),
  resetPassword: (token: string, password: string) => request<{ user: User }>('api/auth/reset', json('POST', { token, password })),
  deleteAccount: (password: string) => request<{ ok: boolean }>('api/auth/account', json('DELETE', { password })),
  status: () => request<Status>('api/status'),
  sync: () => request<{ started: boolean }>('api/sync', { method: 'POST' }),
  setPriceSource: (priceSource: PriceSource) =>
    request<{ priceSource: PriceSource; totals: Totals }>('api/settings', json('PUT', { priceSource })),
  setKeepCopies: (keepCopies: number) => request<{ keepCopies: number }>('api/settings', json('PUT', { keepCopies })),
  doubles: () => request<Doubles>('api/doubles'),
  share: () => request<{ share: Share | null }>('api/share'),
  saveShare: (options: { scope?: ShareScope; showPrices?: boolean; showWishlist?: boolean }) =>
    request<{ share: Share }>('api/share', json('PUT', options)),
  regenerateShare: () => request<{ share: Share }>('api/share/regenerate', { method: 'POST' }),
  deleteShare: () => request<{ share: null }>('api/share', { method: 'DELETE' }),
  shared: (token: string) => request<SharedView>(`api/shared/${encodeURIComponent(token)}`),
  trades: () => request<{ settings: TradeSettings; matches: TradeMatch[] }>('api/trades'),
  setTradeSettings: (settings: Partial<TradeSettings>) =>
    request<{ settings: TradeSettings }>('api/trades/settings', json('PUT', settings)),
  push: () => request<{ publicKey: string; prefs: NotifyPrefs }>('api/push'),
  pushSubscribe: (subscription: PushSubscriptionJSON, lang: string) =>
    request<{ ok: boolean }>('api/push/subscribe', json('POST', { subscription, lang })),
  pushUnsubscribe: (endpoint: string) => request<{ ok: boolean }>('api/push/unsubscribe', json('POST', { endpoint })),
  pushTest: () => request<{ sent: number }>('api/push/test', { method: 'POST' }),
  setNotifyPrefs: (notify: Partial<NotifyPrefs>) => request<{ notify: NotifyPrefs }>('api/settings', json('PUT', { notify })),
  sets: () => request<SetInfo[]>('api/sets'),
  collectionSets: (all: boolean) => request<SetSummary[]>(`api/collection/sets${all ? '?all=1' : ''}`),
  cards: (query: CardQuery) => request<{ total: number; cards: Card[] }>(`api/cards?${qs({ ...query })}`),
  card: (id: number) => request<CardDetail>(`api/cards/${id}`),
  setQuantity: (id: number, quantity: number, lang: Lang) =>
    request<{ card: Card; totals: Totals }>(`api/collection/${id}`, json('PUT', { quantity, lang })),
  add: (id: number, delta: number, lang: Lang) =>
    request<{ card: Card; totals: Totals }>(`api/collection/${id}/add`, json('POST', { delta, lang })),
  stats: () => request<Stats>('api/stats'),
  wishlist: () => request<{ cards: Card[]; deals: Card[] }>('api/wishlist'),
  // targetEur absent : prix cible proposé ; null : aucun prix cible
  wish: (id: number, body: { lang?: Lang; targetEur?: number | null }) =>
    request<{ card: Card }>(`api/wishlist/${id}`, json('PUT', body)),
  unwish: (id: number) => request<{ card: Card }>(`api/wishlist/${id}`, { method: 'DELETE' }),
  wishMissing: (setId: number, lang: Lang) => request<{ added: number }>(`api/wishlist/missing/${setId}`, json('POST', { lang })),
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
export function cardName(card: Pick<Card, 'name' | 'nameFr'>, lang: Lang) {
  return lang === 'fr' ? (card.nameFr ?? card.name) : card.name;
}

export function cardImage(card: Pick<Card, 'image' | 'imageFr'>, lang: Lang) {
  return lang === 'fr' ? (card.imageFr ?? card.image) : card.image;
}

export function cardImageLarge(card: Card, lang: Lang) {
  return lang === 'fr' && card.imageFrLarge ? card.imageFrLarge : card.imageLarge;
}

// "−15 %" en français, "−15%" en anglais (signe toujours affiché)
export function formatPct(ratio: number) {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(ratio);
}

// Adresse d'un lien de partage (l'appli peut être dans un sous-dossier, ex. /tcgc/)
export function shareUrl(token: string) {
  return `${window.location.origin}${window.location.pathname}#partage/${token}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
