// Client des routes de l'économie (server/game-economy.js) : les écrans passent par ces fonctions, ils n'appellent pas
// fetch eux-mêmes. Le serveur garde et calcule tout (solde, bonus, coffre, plafond, prix) : ces fonctions ne font que
// demander. Un refus arrive comme une AdventureApiError (game/ui/adventure/api.ts), avec le message du serveur (en
// français, à montrer tel quel) et son code ('insufficient_funds', 'hold_changed', 'not_found'...).
import { call } from '../adventure/api.ts';
import type {
  CounterOffer, CounterPurchase, DuplicatesExchange, DuplicatesPreview, GameReward, LedgerPage, Purchase, PurchaseKind,
  Shop, Wallet,
} from '../../economy/types.ts';

// ---------- Solde partagé entre les écrans ----------

// Chaque réponse qui contient un porte-monnaie le transmet aux écrans abonnés (le solde affiché en permanence dans
// l'aventure suit ainsi un achat, un gain de fin de partie ou un échange de doublons, sans recharger).
type WalletListener = (wallet: Wallet) => void;
const listeners = new Set<WalletListener>();

export function subscribeWallet(listener: WalletListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish<T extends { wallet: Wallet }>(result: T): T {
  for (const l of listeners) l(result.wallet);
  return result;
}

// Identifiant d'un achat ou d'un échange, tiré une fois par clic de confirmation : le renvoyer (connexion coupée,
// double clic) ne refait pas l'opération
export const newOperationId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

const post = <T extends { wallet: Wallet }>(path: string, body?: unknown) => call<T>(path, 'POST', body).then(publish);

// ---------- Routes ----------

// GET /api/game/wallet
export async function loadWallet(): Promise<Wallet> {
  const wallet = await call<Wallet>('wallet');
  publish({ wallet });
  return wallet;
}

// GET /api/game/wallet/history?before=<id> : du plus récent au plus ancien, par pages
export const loadHistory = (before?: number) =>
  call<LedgerPage>(before === undefined ? 'wallet/history' : `wallet/history?before=${encodeURIComponent(before)}`);

// GET /api/game/shop
export const loadShop = () => call<Shop>('shop');

// POST /api/game/shop/buy : purchaseId = newOperationId(), tiré au clic de confirmation
export const buy = (set: string, kind: PurchaseKind, purchaseId: string) => post<Purchase>('shop/buy', { set, kind, purchaseId });

// GET /api/game/shop/counter
export const loadCounter = () => call<CounterOffer>('shop/counter');

// POST /api/game/shop/counter : purchaseId = newOperationId()
export const buyAtCounter = (number: string, purchaseId: string) => post<CounterPurchase>('shop/counter', { number, purchaseId });

// GET /api/game/duplicates
export const previewDuplicates = (withVariants = false) => call<DuplicatesPreview>(`duplicates?withVariants=${withVariants ? 1 : 0}`);

// POST /api/game/duplicates/exchange : stateKey de l'aperçu, exchangeId = newOperationId()
export const exchangeDuplicates = (stateKey: string, exchangeId: string, withVariants = false) =>
  post<DuplicatesExchange>('duplicates/exchange', { stateKey, exchangeId, withVariants });

// POST /api/game/rewards/:recordId : à appeler quand la partie est finie ET enregistrée sur le serveur (après
// `await saveRecord(rec)`), pour toute partie contre l'IA (chapitres compris) ; pour une partie en ligne, avec
// l'identifiant de la partie rangée dans « Mes parties ». Une partie qui ne rapporte rien n'est pas une erreur : la
// réponse a `refused` (raison à montrer telle quelle). Réclamer deux fois la même partie renvoie le même détail.
export const claimGameReward = (recordId: string) => post<GameReward>(`rewards/${encodeURIComponent(recordId)}`);
