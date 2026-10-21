// Le comptoir (tâche 2.6) : acheter un exemplaire de plus d'une carte déjà trouvée (dans la Cale, toutes versions
// comptées), jusqu'à ECONOMY.counter.max, pour les extensions en vente à la boutique. Les cartes jamais tirées n'y sont
// pas : la découverte reste celle des boosters. Achat avec une confirmation explicite ; le prix vient du barème
// (game/economy/config.ts), le serveur le recalcule et ajoute la carte (version normale) à la Cale.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BOOSTER_SETS } from '../../boosters/sets/index.ts';
import { ECONOMY, type Rarity } from '../../economy/config.ts';
import type { CounterCard, CounterOffer, CounterPurchase, Wallet } from '../../economy/types.ts';
import { cardData } from '../../engine/cards/index.ts';
import { AdventureApiError } from '../adventure/api.ts';
import { CardImage } from '../adventure/CardImage.tsx';
import { RARITIES, RARITY_LABELS } from '../adventure/hold.ts';
import * as api from './api.ts';
import { berry, showWallet, useWallet, WalletBadge } from './Wallet.tsx';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const nameOf = (number: string) => cardData()[number]?.name ?? number;

// Ce dont le comptoir a besoin (le client du serveur ; l'atelier en donne un de démonstration)
export interface CounterClient {
  loadWallet: () => Promise<Wallet>;
  loadCounter: () => Promise<CounterOffer>;
  buyAtCounter: (number: string, purchaseId: string) => Promise<CounterPurchase>;
}

export const COUNTER_SERVER: CounterClient = { loadWallet: api.loadWallet, loadCounter: api.loadCounter, buyAtCounter: api.buyAtCounter };

// Prix d'une carte au comptoir (undefined : pas au comptoir), comme le serveur : cartes de la description des boosters
// d'une extension en vente
export function counterPrice(number: string): number | undefined {
  for (const set of Object.keys(ECONOMY.shop)) {
    const cards = BOOSTER_SETS[set]?.cards;
    const rarity = cards && (Object.keys(cards) as Rarity[]).find((r) => cards[r].includes(number));
    if (rarity) return ECONOMY.counter.price[rarity];
  }
  return undefined;
}

// « Commune 10 ฿ · Peu commune 25 ฿ · ... », des plus courantes aux plus rares
const PRICE_LIST = RARITIES.filter((r): r is Rarity => r in ECONOMY.counter.price)
  .map((r) => `${RARITY_LABELS[r]} ${berry(ECONOMY.counter.price[r])}`).join(' · ');

// confirm : la question (purchaseId gardé après une coupure : le serveur ne refait pas un achat déjà fait) ; buying :
// envoyé ; done : acheté
type Step =
  | { kind: 'confirm'; card: CounterCard; purchaseId?: string; error?: string; retry?: boolean }
  | { kind: 'buying'; card: CounterCard; purchaseId: string }
  | { kind: 'done'; card: CounterCard; purchase: CounterPurchase };

// focus : carte cherchée en arrivant (depuis une carte de la Cale)
export function CounterScreen({ onBack, client = COUNTER_SERVER, focus }: { onBack: () => void; client?: CounterClient; focus?: string }) {
  const { wallet, reload: reloadWallet } = useWallet(client.loadWallet);
  const [offer, setOffer] = useState<CounterOffer | null>(null);
  const [error, setError] = useState<string>();
  const [q, setQ] = useState(focus ?? '');
  const [rarity, setRarity] = useState('');
  // seulement les cartes qu'on peut encore compléter (sauf en arrivant sur une carte précise)
  const [open, setOpen] = useState(!focus);
  const [step, setStep] = useState<Step | null>(null);

  const load = useCallback(() => {
    setError(undefined);
    client.loadCounter().then(setOffer, (e: unknown) => setError(message(e)));
  }, [client]);
  useEffect(load, [load]);

  const cards = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (offer?.cards ?? [])
      .filter((c) => (!open || c.owned < c.max) && (!rarity || c.rarity === rarity)
        && (!text || c.number.toLowerCase().includes(text) || nameOf(c.number).toLowerCase().includes(text)))
      .sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
  }, [offer, q, rarity, open]);
  const rarities = RARITIES.filter((r) => offer?.cards.some((c) => c.rarity === r));
  const toComplete = offer?.cards.filter((c) => c.owned < c.max).length ?? 0;

  const confirm = async () => {
    if (step?.kind !== 'confirm') return;
    const { card } = step;
    const purchaseId = step.purchaseId ?? api.newOperationId();
    setStep({ kind: 'buying', card, purchaseId });
    try {
      const purchase = await client.buyAtCounter(card.number, purchaseId);
      showWallet(purchase.wallet);
      setStep({ kind: 'done', card, purchase });
      load();
    } catch (e) {
      // refus du serveur (solde, déjà 4...) : rien n'est acheté, un nouvel essai est un nouvel achat ; coupure : on ne
      // sait pas, le même identifiant est renvoyé
      const refused = e instanceof AdventureApiError && e.status >= 400 && e.status < 500;
      setStep({ kind: 'confirm', card, purchaseId: refused ? undefined : purchaseId, error: message(e), retry: !refused });
      if (refused) { reloadWallet(); load(); }
    }
  };

  const balance = wallet?.balance;
  const sets = Object.keys(ECONOMY.shop).join(', ');
  return (
    <div className="setup op-counter">
      <header className="op-shop-head">
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour</button>
        <h1>🏪 Comptoir</h1>
        <WalletBadge wallet={wallet} />
      </header>

      <section className="op-counter-intro">
        <p>
          Il te manque un exemplaire ? Le comptoir vend <strong>un exemplaire de plus</strong> de chaque carte {sets} que
          tu as <strong>déjà trouvée</strong>, jusqu’à {ECONOMY.counter.max} (toutes versions comptées). Les cartes jamais
          tirées n’y sont pas : il faut d’abord les trouver dans un booster.
        </p>
        <p className="op-small op-muted">Prix : {PRICE_LIST}. La carte achetée arrive dans ta Cale, en version normale.</p>
      </section>

      {offer ? (
        offer.cards.length === 0 ? (
          <div className="history-empty">
            <p>Tu n’as encore trouvé aucune carte {sets}.</p>
            <p className="op-muted op-small">Ouvre des boosters (gagnés dans l’aventure ou achetés à la boutique) : chaque carte trouvée apparaîtra ici.</p>
          </div>
        ) : (
          <section className="op-hold-cards">
            <div className="db-filters op-hold-filters">
              <input className="db-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou numéro" aria-label="Rechercher une carte" />
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rareté">
                <option value="">Toutes raretés</option>
                {rarities.map((r) => <option key={r} value={r}>{RARITY_LABELS[r] ?? r} ({r})</option>)}
              </select>
              <label className="op-counter-open">
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
                <span>Seulement celles à compléter ({toComplete})</span>
              </label>
            </div>
            {cards.length > 0 ? (
              <div className="op-hold-grid">
                {cards.map((c) => (
                  <CounterTile key={c.number} card={c} balance={balance} onBuy={() => setStep({ kind: 'confirm', card: c })} />
                ))}
              </div>
            ) : (
              <p className="op-muted">{open && toComplete === 0
                ? `Toutes tes cartes trouvées sont déjà à ${ECONOMY.counter.max} exemplaires.`
                : 'Aucune carte du comptoir ne correspond à ces filtres.'}</p>
            )}
          </section>
        )
      ) : error ? (
        <p className="danger">{error} <button className="op-btn op-btn-ghost btn-small" onClick={load}>Réessayer</button></p>
      ) : <p className="op-muted"><span className="op-spinner" /> Ouverture du comptoir…</p>}

      {step && <CounterDialog step={step} balance={balance} onConfirm={() => void confirm()} onClose={() => setStep(null)} />}
    </div>
  );
}

// Une carte du comptoir : visuel, exemplaires possédés, prix, ou « encore 140 ฿ » quand le solde ne suffit pas
function CounterTile({ card, balance, onBuy }: { card: CounterCard; balance?: number; onBuy: () => void }) {
  const name = nameOf(card.number);
  const full = card.owned >= card.max;
  const missing = balance === undefined ? 0 : card.price - balance;
  return (
    <div className={`op-counter-card${full ? ' is-full' : ''}`}>
      <span className="op-hold-img">
        <CardImage entry={{ number: card.number, variant: 'base', name }} />
        <span className="op-hold-count">×{card.owned}</span>
      </span>
      <span className="op-hold-name" title={name}>{name}</span>
      <span className="op-small op-muted op-counter-meta" title={RARITY_LABELS[card.rarity]}>{card.number} · {card.rarity}</span>
      <span className="op-counter-pips" aria-label={`${card.owned} sur ${card.max}`}>
        {Array.from({ length: card.max }, (_, i) => <i key={i} className={i < card.owned ? 'on' : undefined} />)}
      </span>
      {full ? (
        <span className="op-counter-full">✓ {card.max} sur {card.max}</span>
      ) : (
        <>
          <button className="op-btn op-btn-primary btn-small" disabled={balance === undefined || missing > 0} onClick={onBuy}
            title={missing > 0 ? `Encore ${berry(missing)} pour ${name}` : `Acheter un exemplaire de ${name}`}>
            {berry(card.price)}
          </button>
          {missing > 0 && <span className="op-small op-muted op-counter-missing">encore {berry(missing)}</span>}
        </>
      )}
    </div>
  );
}

function CounterDialog({ step, balance, onConfirm, onClose }: { step: Step; balance?: number; onConfirm: () => void; onClose: () => void }) {
  const { card } = step;
  const name = nameOf(card.number);
  const busy = step.kind === 'buying';
  const image = <CardImage entry={{ number: card.number, variant: 'base', name }} className="op-counter-dialog-img" />;
  let body;
  if (step.kind === 'done') {
    body = (
      <>
        <span className="op-counter-dialog-art is-fresh">{image}</span>
        <h3 className="good">{name} rejoint ta Cale !</h3>
        <p>
          Tu en as maintenant <strong>{card.owned + 1}</strong>
          {step.purchase.spent > 0 && <> · {berry(-step.purchase.spent, true)}</>}.
        </p>
        <div className="modal-actions">
          <button className="op-btn op-btn-primary" onClick={onClose}>Continuer</button>
        </div>
      </>
    );
  } else {
    const after = balance === undefined ? undefined : balance - card.price;
    const missing = after !== undefined && after < 0;
    body = (
      <>
        <span className="op-counter-dialog-art">{image}</span>
        <h3>Acheter un exemplaire de {name} pour {berry(card.price)} ?</h3>
        <p>
          {card.number} · {RARITY_LABELS[card.rarity] ?? card.rarity}. Tu en auras <strong>{card.owned + 1}</strong> sur {card.max}.
          {after !== undefined && after >= 0 && <> Il te restera <strong>{berry(after)}</strong>.</>}
        </p>
        {missing && !(step.kind === 'confirm' && step.error) && <p className="danger">Encore {berry(-after)} pour {name}.</p>}
        {step.kind === 'confirm' && step.error && <p className="danger">{step.error}</p>}
        <div className="modal-actions">
          <button className="op-btn op-btn-ghost" disabled={busy} onClick={onClose}>Annuler</button>
          <button className="op-btn op-btn-primary" disabled={busy || (missing && !(step.kind === 'confirm' && step.retry))} onClick={onConfirm}>
            {busy ? <><span className="op-spinner" /> Achat…</> : step.kind === 'confirm' && step.retry ? 'Réessayer' : `Acheter pour ${berry(card.price)}`}
          </button>
        </div>
      </>
    );
  }
  return (
    <div className="modal" onClick={busy ? undefined : onClose}>
      <div className="modal-box op-shop-dialog op-counter-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
}
