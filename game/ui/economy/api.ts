// Client des routes de l'économie (server/game-economy.js) : les écrans passent par ces fonctions, ils n'appellent pas
// fetch eux-mêmes. Le serveur garde et calcule tout (solde, bonus, coffre, plafond, prix) : ces fonctions ne font que
// demander. Un refus arrive comme une AdventureApiError (game/ui/adventure/api.ts), avec le message du serveur (en
// français, à montrer tel quel) et son code ('insufficient_funds', 'hold_changed', 'not_found'...).
//
// VERSION PROVISOIRE (tâche 0 de l'étape 2) : les réponses sont des données de démonstration gardées en mémoire, sans
// serveur, pour que la boutique (tâche 2.3) avance avant la tâche 2.2. La tâche 2.2 remplace le corps des fonctions
// par les appels au serveur en gardant leurs signatures et `subscribeWallet`.
import { AdventureApiError, type WonBooster } from '../adventure/api.ts';
import { ECONOMY, type Rarity } from '../../economy/config.ts';
import type {
  CounterOffer, CounterPurchase, DuplicatesExchange, DuplicatesPreview, GameReward, LedgerEntry, LedgerPage,
  Purchase, PurchaseKind, Shop, Wallet,
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

// ---------- Données de démonstration (version provisoire) ----------

const wait = () => new Promise((r) => setTimeout(r, 250));
const copy = <T>(v: T): T => structuredClone(v);
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const demo = {
  wallet: {
    balance: 2340,
    dailyBonus: { amount: ECONOMY.dailyBonus.amount, reserve: 2, keep: ECONOMY.dailyBonus.keepDays },
    chest: { wins: 2, needed: ECONOMY.weeklyChest.wins, boosters: ECONOMY.weeklyChest.boosters, set: ECONOMY.weeklyChest.set, given: false, weekStart: '2026-10-19' },
    today: { earned: 55, cap: ECONOMY.dailyCap },
  } as Wallet,
  ledger: [
    { id: 6, amount: 45, reason: 'partie', ref: 'demo-3', at: iso(30), label: "Victoire contre l'IA Expert" },
    { id: 5, amount: 60, reason: 'bonus-jour', ref: 'demo-3', at: iso(30), label: 'Bonus du jour' },
    { id: 4, amount: 10, reason: 'partie', ref: 'demo-2', at: iso(90), label: "Victoire contre l'IA Débutant" },
    { id: 3, amount: -2000, reason: 'achat', ref: 'demo-achat', at: iso(60 * 26), label: '1 display OP03', boosters: 24 },
    { id: 2, amount: 400, reason: 'chapitre', ref: 'eb-6-loguetown', at: iso(60 * 27), label: 'Chapitre gagné : Loguetown' },
    { id: 1, amount: 3825, reason: 'chapitre', ref: 'demo-debut', at: iso(60 * 50), label: 'Premiers chapitres d’East Blue' },
  ] as LedgerEntry[],
  operations: new Map<string, unknown>(),
  nextId: 7,
  nextBooster: 1,
};

function record(amount: number, reason: LedgerEntry['reason'], ref: string, label: string, boosters?: number) {
  demo.wallet.balance += amount;
  demo.ledger.unshift({ id: demo.nextId++, amount, reason, ref, at: new Date().toISOString(), label, ...(boosters ? { boosters } : {}) });
}

function boostersFor(set: string, count: number, source: string): WonBooster[] {
  const createdAt = new Date().toISOString();
  return Array.from({ length: count }, () => ({ id: `demo-${demo.nextBooster++}`, set, source, createdAt }));
}

function debit(price: number) {
  if (demo.wallet.balance < price) {
    throw new AdventureApiError(`Il te manque ${price - demo.wallet.balance} ฿`, 'insufficient_funds', 409);
  }
}

// Cartes du comptoir de démonstration (OP03 : un Leader, une commune, une SR, une SEC)
const DEMO_COUNTER: { number: string; rarity: Rarity; owned: number }[] = [
  { number: 'OP03-076', rarity: 'L', owned: 1 },
  { number: 'OP03-053', rarity: 'C', owned: 3 },
  { number: 'OP03-078', rarity: 'SR', owned: 1 },
  { number: 'OP03-123', rarity: 'SEC', owned: 4 },
];

// ---------- Routes ----------

// GET /api/game/wallet
export async function loadWallet(): Promise<Wallet> {
  await wait();
  return copy(demo.wallet);
}

// GET /api/game/wallet/history?before=<id> : du plus récent au plus ancien, par pages
export async function loadHistory(before?: number): Promise<LedgerPage> {
  await wait();
  const all = demo.ledger.filter((e) => before === undefined || e.id < before);
  const entries = all.slice(0, 20);
  return copy(all.length > entries.length ? { entries, next: entries[entries.length - 1].id } : { entries });
}

// GET /api/game/shop
export async function loadShop(): Promise<Shop> {
  await wait();
  return { offers: Object.entries(ECONOMY.shop).map(([set, o]) => ({ set, ...o })) };
}

// POST /api/game/shop/buy : purchaseId = newOperationId(), tiré au clic de confirmation
export async function buy(set: string, kind: PurchaseKind, purchaseId: string): Promise<Purchase> {
  await wait();
  const done = demo.operations.get(purchaseId) as Purchase | undefined;
  if (done) return publish({ ...copy(done), wallet: copy(demo.wallet), already: true });
  const offer = ECONOMY.shop[set];
  if (!offer) throw new AdventureApiError('Extension pas en vente', 'not_found', 404);
  const price = kind === 'display' ? offer.display : offer.booster;
  debit(price);
  const count = kind === 'display' ? offer.boostersPerDisplay : 1;
  record(-price, 'achat', purchaseId, kind === 'display' ? `1 display ${set}` : `1 booster ${set}`, count);
  const result: Purchase = { wallet: copy(demo.wallet), spent: price, boosters: boostersFor(set, count, 'boutique') };
  demo.operations.set(purchaseId, result);
  return publish(copy(result));
}

// GET /api/game/shop/counter
export async function loadCounter(): Promise<CounterOffer> {
  await wait();
  const max = ECONOMY.counter.max;
  return { cards: DEMO_COUNTER.map((c) => ({ ...c, set: 'OP03', price: ECONOMY.counter.price[c.rarity], max })) };
}

// POST /api/game/shop/counter : purchaseId = newOperationId()
export async function buyAtCounter(number: string, purchaseId: string): Promise<CounterPurchase> {
  await wait();
  const done = demo.operations.get(purchaseId) as CounterPurchase | undefined;
  if (done) return publish({ ...copy(done), wallet: copy(demo.wallet), already: true });
  const card = DEMO_COUNTER.find((c) => c.number === number);
  if (!card) throw new AdventureApiError("Tu n'as pas encore trouvé cette carte", 'not_found_yet', 409);
  if (card.owned >= ECONOMY.counter.max) throw new AdventureApiError(`Tu as déjà ${ECONOMY.counter.max} exemplaires de cette carte`, 'counter_max', 409);
  const price = ECONOMY.counter.price[card.rarity];
  debit(price);
  card.owned++;
  record(-price, 'comptoir', purchaseId, `Comptoir : ${number}`);
  const result: CounterPurchase = { wallet: copy(demo.wallet), spent: price, card: { number, variant: 'base', count: 1 } };
  demo.operations.set(purchaseId, result);
  return publish(copy(result));
}

// GET /api/game/duplicates
export async function previewDuplicates(withVariants = false): Promise<DuplicatesPreview> {
  await wait();
  const v = ECONOMY.duplicates.value;
  const lines = [
    { number: 'OP03-053', variant: 'base', rarity: 'C' as const, count: 3, value: v.C },
    { number: 'OP03-070', variant: 'base', rarity: 'R' as const, count: 1, value: v.R },
    ...(withVariants ? [{ number: 'OP03-078', variant: 'parallele', rarity: 'SR' as const, count: 1, value: v.SR }] : []),
  ];
  return { stateKey: `demo-${withVariants ? 1 : 0}`, lines, total: lines.reduce((s, l) => s + l.count * l.value, 0), decks: [] };
}

// POST /api/game/duplicates/exchange : stateKey de l'aperçu, exchangeId = newOperationId()
export async function exchangeDuplicates(stateKey: string, exchangeId: string, withVariants = false): Promise<DuplicatesExchange> {
  const preview = await previewDuplicates(withVariants);
  const done = demo.operations.get(exchangeId) as DuplicatesExchange | undefined;
  if (done) return publish({ ...copy(done), wallet: copy(demo.wallet), already: true });
  if (stateKey !== preview.stateKey) throw new AdventureApiError('Ta Cale a changé : regarde le nouvel aperçu', 'hold_changed', 409);
  record(preview.total, 'doublons', exchangeId, 'Échange de doublons');
  const result: DuplicatesExchange = { wallet: copy(demo.wallet), lines: preview.lines, total: preview.total };
  demo.operations.set(exchangeId, result);
  return publish(copy(result));
}

// POST /api/game/rewards/:recordId : à appeler quand la partie est finie ET enregistrée sur le serveur (après
// `await saveRecord(rec)`), pour toute partie contre l'IA (chapitres compris) ; pour une partie en ligne, avec
// l'identifiant de la partie rangée dans « Mes parties ». La démonstration fait gagner 45 ฿ contre l'IA Expert.
export async function claimGameReward(recordId: string): Promise<GameReward> {
  await wait();
  const done = demo.operations.get(recordId) as GameReward | undefined;
  if (done) return publish({ ...copy(done), wallet: copy(demo.wallet), already: true });
  const base = ECONOMY.ai.win[3];
  const amount = Math.min(base, Math.max(0, demo.wallet.today.cap - demo.wallet.today.earned));
  const bonus = demo.wallet.dailyBonus.reserve > 0 ? demo.wallet.dailyBonus.amount : 0;
  record(amount, 'partie', recordId, "Victoire contre l'IA Expert");
  demo.wallet.today.earned += amount;
  if (bonus) {
    record(bonus, 'bonus-jour', recordId, 'Bonus du jour');
    demo.wallet.dailyBonus.reserve--;
  }
  let chest: WonBooster[] = [];
  const c = demo.wallet.chest;
  if (!c.given && ++c.wins >= c.needed) {
    c.given = true;
    chest = boostersFor(c.set, c.boosters, 'coffre');
    record(0, 'coffre', c.weekStart, 'Coffre de la semaine', c.boosters);
  }
  const result: GameReward = {
    recordId, mode: 'ia', won: true, base, coefficient: 1, sameOpponent: 0, amount, capped: amount < base,
    dailyBonus: bonus, chest, total: amount + bonus, wallet: copy(demo.wallet),
  };
  demo.operations.set(recordId, result);
  return publish(copy(result));
}
