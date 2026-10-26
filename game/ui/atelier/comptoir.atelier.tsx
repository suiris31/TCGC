// Page d'atelier du comptoir et de l'échange des doublons (tâche 2.6). « Démonstration » et « Bourse presque vide » : la
// Cale avec ses boutons, le comptoir et l'échange, sur une Cale et une bourse inventées, gardées dans la page (achats
// qui débitent, doublons qui partent, Cale qui change : rien n'est enregistré). « Cale qui change » : la Cale change
// entre l'aperçu et l'échange (refus, nouvel aperçu). « Mon compte » : les vrais écrans, reliés au compte connecté (à
// n'utiliser que sur un serveur d'essai).
import { useMemo, useState } from 'react';
import { BOOSTER_SETS } from '../../boosters/sets/index.ts';
import { ECONOMY, type Rarity } from '../../economy/config.ts';
import type { CounterPurchase, DuplicateLine, DuplicatesExchange, DuplicatesPreview, Wallet } from '../../economy/types.ts';
import { cardData } from '../../engine/cards/index.ts';
import { CounterScreen, type CounterClient } from '../economy/Counter.tsx';
import { DuplicatesDialog, type DuplicatesClient } from '../economy/Duplicates.tsx';
import { AdventureApiError, type HoldCard } from '../adventure/api.ts';
import { HoldScreen, HoldView } from '../adventure/Hold.tsx';

export const title = 'Comptoir et doublons';

function wallet(balance: number): Wallet {
  return {
    balance,
    dailyBonus: { amount: ECONOMY.dailyBonus.amount, reserve: 1, keep: ECONOMY.dailyBonus.keepDays },
    chest: { wins: 1, needed: ECONOMY.weeklyChest.wins, boosters: ECONOMY.weeklyChest.boosters, set: ECONOMY.weeklyChest.set, given: false, weekStart: '2026-10-19' },
    today: { earned: 40, cap: ECONOMY.dailyCap },
  };
}

const OP03 = BOOSTER_SETS.OP03.cards;
const RARITY = new Map<string, Rarity>();
for (const r of Object.keys(OP03) as Rarity[]) for (const n of OP03[r]) RARITY.set(n, r);
const rarityOf = (n: string) => RARITY.get(n) ?? (cardData()[n]?.rarity as Rarity | undefined);

// Une Cale d'après quelques boosters : des communes en trop, une SR en version parallèle, une SEC, des cartes de départ
function demoHold(): HoldCard[] {
  const cards: HoldCard[] = [];
  OP03.C.slice(0, 14).forEach((number, i) => cards.push({ number, variant: 'base', count: 2 + (i % 6) }));
  OP03.UC.slice(0, 10).forEach((number, i) => cards.push({ number, variant: 'base', count: 1 + (i % 5) }));
  OP03.R.slice(0, 8).forEach((number, i) => cards.push({ number, variant: 'base', count: 1 + (i % 6) }));
  cards.push({ number: OP03.L[0], variant: 'base', count: 2 }, { number: OP03.L[1], variant: 'base', count: 1 });
  cards.push({ number: OP03.SR[0], variant: 'base', count: 3 }, { number: OP03.SR[0], variant: 'parallele', count: 2 });
  cards.push({ number: OP03.SR[1], variant: 'base', count: 1 }, { number: OP03.SEC[0], variant: 'base', count: 1 });
  cards.push({ number: 'ST01-001', variant: 'base', count: 1 }, { number: 'ST01-004', variant: 'base', count: 6 });
  return cards;
}

// Les clients de démonstration, sur une Cale et une bourse gardées dans la page, comme le serveur : comptoir réservé
// aux cartes trouvées d'OP03, 4 exemplaires au plus, versions de base échangées d'abord, Cale de l'aperçu
function useDemo(initialBalance: number, changing = false) {
  const [cards, setCards] = useState(demoHold);
  const state = useMemo(() => ({ cards: demoHold(), wallet: wallet(initialBalance), done: new Map<string, CounterPurchase | DuplicatesExchange>(), previews: 0 }), [initialBalance]);
  const wait = () => new Promise((r) => setTimeout(r, 300));
  const owned = (n: string) => state.cards.filter((c) => c.number === n).reduce((s, c) => s + c.count, 0);
  const sync = () => setCards(state.cards.map((c) => ({ ...c })));
  const key = (withVariants: boolean) => `${withVariants ? 1 : 0}:${JSON.stringify(state.cards.filter((c) => c.count > 0))}`;

  function plan(withVariants: boolean): DuplicatesPreview {
    const lines: DuplicateLine[] = [];
    for (const n of [...new Set(state.cards.map((c) => c.number))].sort()) {
      let extra = owned(n) - ECONOMY.duplicates.keep;
      const rarity = rarityOf(n);
      if (extra <= 0 || !rarity || !(rarity in ECONOMY.duplicates.value)) continue;
      for (const v of state.cards.filter((c) => c.number === n && c.count > 0).sort((a, b) => (a.variant === 'base' ? -1 : b.variant === 'base' ? 1 : 0))) {
        if (extra <= 0 || (v.variant !== 'base' && !withVariants)) break;
        const count = Math.min(extra, v.count);
        lines.push({ number: n, variant: v.variant, rarity, count, value: ECONOMY.duplicates.value[rarity] });
        extra -= count;
      }
    }
    const decks = lines.some((l) => l.number === 'ST01-004') ? [{ id: 'PERSO-demo', name: 'Mon deck d’aventure' }] : [];
    return { stateKey: key(withVariants), lines, total: lines.reduce((s, l) => s + l.count * l.value, 0), decks };
  }

  const counter: CounterClient = {
    loadWallet: async () => { await wait(); return structuredClone(state.wallet); },
    loadCounter: async () => {
      await wait();
      const numbers = [...new Set(state.cards.filter((c) => RARITY.has(c.number) && c.count > 0).map((c) => c.number))];
      return { cards: numbers.map((number) => {
        const rarity = RARITY.get(number)!;
        return { number, set: 'OP03', rarity, price: ECONOMY.counter.price[rarity], owned: owned(number), max: ECONOMY.counter.max };
      }) };
    },
    buyAtCounter: async (number, purchaseId) => {
      await wait();
      const done = state.done.get(purchaseId) as CounterPurchase | undefined;
      if (done) return { ...done, wallet: structuredClone(state.wallet), already: true };
      const rarity = RARITY.get(number);
      if (!rarity) throw new AdventureApiError('Cette carte n’est pas en vente au comptoir', 'not_found', 404);
      if (owned(number) >= ECONOMY.counter.max) throw new AdventureApiError(`Tu as déjà ${ECONOMY.counter.max} exemplaires de cette carte`, 'counter_max', 409);
      const price = ECONOMY.counter.price[rarity];
      if (state.wallet.balance < price) throw new AdventureApiError(`Il te manque ${price - state.wallet.balance} ฿ pour ${cardData()[number]?.name ?? number}`, 'insufficient_funds', 409);
      state.wallet.balance -= price;
      const line = state.cards.find((c) => c.number === number && c.variant === 'base');
      if (line) line.count++;
      else state.cards.push({ number, variant: 'base', count: 1 });
      sync();
      const result: CounterPurchase = { wallet: structuredClone(state.wallet), spent: price, card: { number, variant: 'base', count: 1 } };
      state.done.set(purchaseId, result);
      return result;
    },
  };

  const duplicates: DuplicatesClient = {
    previewDuplicates: async (withVariants = false) => {
      await wait();
      state.previews++;
      return plan(withVariants);
    },
    exchangeDuplicates: async (stateKey, exchangeId, withVariants = false) => {
      await wait();
      const done = state.done.get(exchangeId) as DuplicatesExchange | undefined;
      if (done) return { ...done, wallet: structuredClone(state.wallet), already: true };
      // « Cale qui change » : un booster ouvert ailleurs entre le premier aperçu et l'échange
      if (changing && state.previews === 1) state.cards.find((c) => c.number === OP03.C[0])!.count += 3;
      const p = plan(withVariants);
      if (p.stateKey !== stateKey) throw new AdventureApiError('Ta Cale a changé depuis l’aperçu : regarde le nouvel aperçu avant d’échanger', 'hold_changed', 409);
      for (const l of p.lines) state.cards.find((c) => c.number === l.number && c.variant === l.variant)!.count -= l.count;
      state.cards = state.cards.filter((c) => c.count > 0);
      state.wallet.balance += p.total;
      sync();
      const result: DuplicatesExchange = { wallet: structuredClone(state.wallet), lines: p.lines, total: p.total };
      state.done.set(exchangeId, result);
      return result;
    },
  };
  return { cards, counter, duplicates };
}

function Demo({ balance, changing }: { balance: number; changing?: boolean }) {
  const { cards, counter, duplicates } = useDemo(balance, changing);
  const [view, setView] = useState<{ counter?: string } | null>(null);
  const [dialog, setDialog] = useState(false);
  if (view) return <CounterScreen client={counter} focus={view.counter} onBack={() => setView(null)} />;
  return (
    <>
      <HoldView cards={cards} boosters={[]} onBack={() => {}} onOpen={() => {}} onDuplicates={() => setDialog(true)} onCounter={(focus) => setView({ counter: focus })} />
      {dialog && <DuplicatesDialog client={duplicates} onClose={() => setDialog(false)} onExchanged={() => {}} />}
    </>
  );
}

const VIEWS = {
  demo: 'Démonstration',
  poor: 'Bourse presque vide',
  changing: 'Cale qui change',
  hold: 'Ma Cale (mon compte)',
  counter: 'Comptoir (mon compte)',
} as const;

export function render() {
  const [view, setView] = useState<keyof typeof VIEWS>('demo');
  return (
    <div className="op-atelier-demo">
      <nav className="op-atelier-pages">
        {Object.entries(VIEWS).map(([k, label]) => (
          <button key={k} className={view === k ? 'deck-chip on' : 'deck-chip'} onClick={() => setView(k as keyof typeof VIEWS)}>{label}</button>
        ))}
      </nav>
      {view === 'demo' && <Demo key="demo" balance={1240} />}
      {view === 'poor' && <Demo key="poor" balance={45} />}
      {view === 'changing' && <Demo key="changing" balance={300} changing />}
      {view === 'hold' && <HoldScreen onBack={() => setView('demo')} />}
      {view === 'counter' && <CounterScreen onBack={() => setView('demo')} />}
    </div>
  );
}
