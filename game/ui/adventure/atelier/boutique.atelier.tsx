// Page d'atelier de la boutique (tâche 2.3). « Démonstration », « Bourse presque vide », « Nouveau joueur » : la
// boutique avec un client inventé, gardé dans la page (achats qui débitent, historique, boosters ouverts sur place avec
// le générateur, sans serveur : rien n'est enregistré). « Solde qui change » : la pastille du solde et son animation.
// « Ma boutique (mon compte) » : le vrai écran, relié au compte connecté (à n'utiliser que sur un serveur d'essai).
import { useMemo, useState } from 'react';
import { openBooster } from '../../../boosters/open.ts';
import { ECONOMY } from '../../../economy/config.ts';
import type { LedgerEntry, Purchase, Wallet } from '../../../economy/types.ts';
import { AdventureApiError } from '../api.ts';
import { ShopScreen, type ShopClient } from '../../economy/Shop.tsx';
import { showWallet, useWallet, WalletBadge, WalletDetails } from '../../economy/Wallet.tsx';

export const title = 'Boutique et bourse';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function wallet(balance: number, reserve: number, wins: number, given: boolean, earned: number): Wallet {
  return {
    balance,
    dailyBonus: { amount: ECONOMY.dailyBonus.amount, reserve, keep: ECONOMY.dailyBonus.keepDays },
    chest: { wins, needed: ECONOMY.weeklyChest.wins, boosters: ECONOMY.weeklyChest.boosters, set: ECONOMY.weeklyChest.set, given, weekStart: '2026-10-19' },
    today: { earned, cap: ECONOMY.dailyCap },
  };
}

// Un long historique pour essayer « Voir plus »
function longHistory(): LedgerEntry[] {
  const list: LedgerEntry[] = [];
  let id = 40;
  for (let i = 0; i < 12; i++) {
    list.push({ id: id--, amount: 25, reason: 'partie', ref: `p${i}`, at: ago(60 * 6 * i + 20), label: "Victoire contre l'IA Confirmé" });
    if (i % 3 === 0) list.push({ id: id--, amount: 60, reason: 'bonus-jour', ref: `p${i}`, at: ago(60 * 6 * i + 20), label: 'Bonus du jour' });
    if (i % 4 === 1) list.push({ id: id--, amount: 8, reason: 'partie', ref: `d${i}`, at: ago(60 * 6 * i + 40), label: "Défaite contre l'IA Confirmé" });
  }
  list.push({ id: id--, amount: 0, reason: 'coffre', ref: '2026-10-19', at: ago(60 * 30), label: 'Coffre de la semaine', boosters: 2 });
  list.push({ id: id--, amount: -2000, reason: 'achat', ref: 'a1', at: ago(60 * 50), label: '1 display OP03', boosters: 24 });
  list.push({ id: id--, amount: 400, reason: 'chapitre', ref: 'eb-6-loguetown', at: ago(60 * 51), label: 'Chapitre gagné : Loguetown' });
  list.push({ id: id--, amount: 200, reason: 'chapitre', ref: 'eb-1-shells-town', at: ago(60 * 24 * 9), label: 'Chapitre gagné : Shells Town' });
  return list;
}

// Client de démonstration : comme le serveur, il refuse un achat sans assez de Berry et ne refait pas un achat déjà fait
function demoClient(start: Wallet, history: LedgerEntry[]): ShopClient {
  const state = { wallet: structuredClone(start), history: [...history], done: new Map<string, Purchase>(), booster: 1, id: 100 };
  const wait = () => new Promise((r) => setTimeout(r, 300));
  return {
    loadWallet: async () => { await wait(); return structuredClone(state.wallet); },
    loadShop: async () => { await wait(); return { offers: Object.entries(ECONOMY.shop).map(([set, o]) => ({ set, ...o })) }; },
    loadHistory: async (before) => {
      await wait();
      const all = state.history.filter((e) => before === undefined || e.id < before);
      const entries = all.slice(0, 20);
      return all.length > entries.length ? { entries, next: entries[entries.length - 1].id } : { entries };
    },
    buy: async (set, kind, purchaseId) => {
      await wait();
      const done = state.done.get(purchaseId);
      if (done) return { ...done, wallet: structuredClone(state.wallet), already: true };
      const offer = ECONOMY.shop[set];
      const price = kind === 'display' ? offer.display : offer.booster;
      if (state.wallet.balance < price) throw new AdventureApiError(`Il te manque ${price - state.wallet.balance} ฿`, 'insufficient_funds', 409);
      const n = kind === 'display' ? offer.boostersPerDisplay : 1;
      state.wallet.balance -= price;
      state.history.unshift({ id: state.id++, amount: -price, reason: 'achat', ref: purchaseId, at: new Date().toISOString(), label: `1 ${kind} ${set}`, boosters: n });
      const createdAt = new Date().toISOString();
      const result: Purchase = {
        wallet: structuredClone(state.wallet), spent: price,
        boosters: Array.from({ length: n }, () => ({ id: `demo-${state.booster++}`, set, source: 'boutique', createdAt })),
      };
      state.done.set(purchaseId, result);
      return result;
    },
    openBoosters: async (ids, progress) => {
      const contents = [];
      for (const _ of ids) {
        await new Promise((r) => setTimeout(r, 40));
        contents.push(openBooster('OP03', Math.random));
        progress(contents.length);
      }
      return { contents, owned: {} };
    },
  };
}

const SHORT: LedgerEntry[] = [
  { id: 3, amount: 45, reason: 'partie', ref: 'demo-3', at: ago(30), label: "Victoire contre l'IA Expert" },
  { id: 2, amount: 60, reason: 'bonus-jour', ref: 'demo-3', at: ago(30), label: 'Bonus du jour' },
  { id: 1, amount: -100, reason: 'achat', ref: 'demo-a', at: ago(60 * 26), label: '1 booster OP03', boosters: 1 },
];

const VIEWS = {
  demo: 'Démonstration',
  poor: 'Bourse presque vide',
  new: 'Nouveau joueur',
  badge: 'Solde qui change',
  mine: 'Ma boutique (mon compte)',
} as const;

// La pastille seule : chaque bouton change le solde (sans serveur) pour voir l'animation et entendre le son d'un gain
function BadgeDemo() {
  const start = useMemo(() => wallet(2340, 2, 2, false, 55), []);
  const load = useMemo(() => async () => start, [start]);
  const { wallet: w } = useWallet(load);
  const move = (amount: number) => w && showWallet({ ...w, balance: Math.max(0, w.balance + amount) });
  return (
    <div className="op-atelier-demo">
      <p className="op-muted op-small">La pastille du solde telle qu’elle apparaît sur la carte (un appui ouvre la boutique). Les sons suivent le réglage du jeu.</p>
      <div className="deck-filter">
        <WalletBadge wallet={w} onClick={() => {}} />
        <WalletBadge wallet={w} />
      </div>
      <div className="deck-filter">
        {[10, 45, 105, 400].map((n) => <button key={n} className="op-btn op-btn-primary" onClick={() => move(n)}>+{n} ฿</button>)}
        {[100, 2000].map((n) => <button key={n} className="op-btn op-btn-ghost" onClick={() => move(-n)}>−{n} ฿</button>)}
      </div>
      {w && <div style={{ maxWidth: '26rem' }}><WalletDetails wallet={w} /></div>}
    </div>
  );
}

export function render() {
  const [view, setView] = useState<keyof typeof VIEWS>('demo');
  // un client par vue, gardé tant que la page est ouverte
  const clients = useMemo(() => ({
    demo: demoClient(wallet(2340, 2, 2, false, 55), longHistory()),
    poor: demoClient(wallet(150, 0, 3, true, 300), SHORT),
    new: demoClient(wallet(0, 1, 0, false, 0), []),
  }), []);
  return (
    <div className="op-atelier-demo">
      <nav className="op-atelier-pages">
        {Object.entries(VIEWS).map(([k, label]) => (
          <button key={k} className={view === k ? 'deck-chip on' : 'deck-chip'} onClick={() => setView(k as keyof typeof VIEWS)}>{label}</button>
        ))}
      </nav>
      {(view === 'demo' || view === 'poor' || view === 'new') && <ShopScreen key={view} client={clients[view]} onBack={() => setView('badge')} />}
      {view === 'badge' && <BadgeDemo />}
      {view === 'mine' && <ShopScreen onBack={() => setView('demo')} />}
    </div>
  );
}
