// La boutique (tâche 2.3) : la bourse (solde, bonus du jour, coffre de la semaine), la vitrine (boosters et displays de
// chaque extension en vente, avec ce qu'ils contiennent), l'achat avec une confirmation explicite, puis « Ouvrir
// maintenant » (écran d'ouverture de l'étape 1 ; depuis R3.6, chaque booster est tiré au moment où on l'ouvre, voir
// useBoosterOpening.ts) ou « Plus tard » (les boosters attendent dans la Cale), et l'historique des gains et des dépenses. Les prix viennent du serveur (game/economy/config.ts), jamais du navigateur ; le serveur
// tire les cartes à l'ouverture. Le comptoir a son propre écran (tâche 2.6, Counter.tsx), ouvert depuis la vitrine.
import { useCallback, useEffect, useState } from 'react';
import { BOOSTER_SETS } from '../../boosters/sets/index.ts';
import type { LedgerEntry, LedgerReason, Purchase, PurchaseKind, Shop, ShopOffer, Wallet } from '../../economy/types.ts';
import { ApiError } from '../api.ts';
import type { WonBooster } from '../adventure/api.ts';
import { BoosterOpening } from '../adventure/BoosterOpening.tsx';
import { boosterRates, chanceText } from '../adventure/hold.ts';
import { BOOSTER_NOTICE, PackIcon } from '../adventure/RewardsScreen.tsx';
import { Button, Dialog } from '../kit/index.ts';
import { BACK, backText } from '../texts.ts';
import * as api from './api.ts';
import { CounterScreen, type CounterClient } from './Counter.tsx';
import { useBoosterOpening, type BoosterOpener } from './useBoosterOpening.ts';
import { berry, EarnHelp, showWallet, useWallet, WalletBadge, WalletDetails } from './Wallet.tsx';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Ce dont la boutique a besoin (le client du serveur ; l'atelier en donne un de démonstration)
export interface ShopClient {
  loadWallet: () => Promise<Wallet>;
  loadShop: () => Promise<Shop>;
  loadHistory: (before?: number) => Promise<{ entries: LedgerEntry[]; next?: number }>;
  buy: (set: string, kind: PurchaseKind, purchaseId: string) => Promise<Purchase>;
  opener?: BoosterOpener;    // ouverture des boosters achetés (useBoosterOpening.ts) ; par défaut, celle du serveur
  counter?: CounterClient;   // comptoir (tâche 2.6) ; par défaut, celui du serveur
}

export const SERVER_CLIENT: ShopClient = {
  loadWallet: api.loadWallet, loadShop: api.loadShop, loadHistory: api.loadHistory, buy: api.buy,
};

// ---------- Achat ----------

// confirm : la question ; buying : envoyé (purchaseId tiré au clic de confirmation, gardé pour un nouvel essai : le
// serveur ne refait pas un achat déjà fait) ; done : acheté
type Step =
  | { kind: 'confirm'; offer: ShopOffer; what: PurchaseKind; purchaseId?: string; error?: string; retry?: boolean }
  | { kind: 'buying'; offer: ShopOffer; what: PurchaseKind; purchaseId: string }
  | { kind: 'done'; offer: ShopOffer; what: PurchaseKind; purchase: Purchase };

const price = (o: ShopOffer, what: PurchaseKind) => (what === 'display' ? o.display : o.booster);
const count = (o: ShopOffer, what: PurchaseKind) => (what === 'display' ? o.boostersPerDisplay : 1);
const itemName = (o: ShopOffer, what: PurchaseKind) => `1 ${what} ${o.set}`;

// ---------- L'écran ----------

// back : l'écran où l'on revient (« ← Accueil » depuis #play/boutique, « ← Carte » dans l'aventure)
export function ShopScreen({ onBack, back = BACK.home, client = SERVER_CLIENT }: { onBack: () => void; back?: string; client?: ShopClient }) {
  const { wallet, error: walletError, reload: reloadWallet } = useWallet(client.loadWallet);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopError, setShopError] = useState<string>();
  const [step, setStep] = useState<Step | null>(null);
  // « Ouvrir maintenant » : la fenêtre d'achat se ferme quand l'écran d'ouverture paraît ; ce qui n'est pas ouvert reste
  // dans la Cale
  const opening = useBoosterOpening({ opener: client.opener });
  const [contents, setContents] = useState<string | null>(null);   // extension dont on montre le contenu
  const [historyKey, setHistoryKey] = useState(0);
  const [counter, setCounter] = useState(false);

  const loadShop = useCallback(() => {
    setShopError(undefined);
    client.loadShop().then(setShop, (e: unknown) => setShopError(message(e)));
  }, [client]);
  useEffect(loadShop, [loadShop]);

  const ask = (offer: ShopOffer, what: PurchaseKind) => setStep({ kind: 'confirm', offer, what });

  const confirm = async () => {
    if (step?.kind !== 'confirm') return;
    const { offer, what } = step;
    const purchaseId = step.purchaseId ?? api.newOperationId();
    setStep({ kind: 'buying', offer, what, purchaseId });
    try {
      const purchase = await client.buy(offer.set, what, purchaseId);
      showWallet(purchase.wallet);
      setStep({ kind: 'done', offer, what, purchase });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      // refus du serveur (solde, extension) : l'achat n'a pas eu lieu, un nouvel essai est un nouvel achat ; coupure :
      // on ne sait pas, le même identifiant est renvoyé
      const refused = e instanceof ApiError && e.status >= 400 && e.status < 500;
      setStep({ kind: 'confirm', offer, what, purchaseId: refused ? undefined : purchaseId, error: message(e), retry: !refused });
      if (refused) reloadWallet();
    }
  };

  const openNow = async () => {
    if (step?.kind !== 'done') return;
    await opening.start(step.purchase.boosters);
  };
  // l'écran d'ouverture a paru : la fenêtre d'achat n'a plus lieu d'être
  useEffect(() => { if (opening.props) setStep(null); }, [opening.props]);

  if (opening.props) return <BoosterOpening {...opening.props} />;

  if (counter) return <CounterScreen client={client.counter} onBack={() => { setCounter(false); setHistoryKey((k) => k + 1); }} />;

  const balance = wallet?.balance;
  return (
    <div className="setup op-shop" data-ui="shop">
      <header className="op-shop-head">
        <button className="op-btn op-btn-ghost" data-ui="shop.back" onClick={onBack}>{backText(back)}</button>
        <h1>🏪 Boutique</h1>
        <WalletBadge wallet={wallet} />
      </header>

      <div className="op-shop-main">
        <section className="op-shop-purse" aria-label="Ta bourse">
          <h2>👛 Ta bourse</h2>
          {wallet ? (
            <>
              <p className="op-shop-balance">{berry(wallet.balance)}</p>
              <WalletDetails wallet={wallet} />
              <EarnHelp />
            </>
          ) : walletError ? (
            <p className="danger op-small">{walletError} <button className="op-btn op-btn-ghost btn-small" onClick={reloadWallet}>Réessayer</button></p>
          ) : <p className="op-muted"><span className="op-spinner" /> Lecture de ta bourse…</p>}
        </section>

        <section className="op-shop-window" aria-label="Vitrine">
          <h2>Vitrine</h2>
          {shop ? (
            shop.offers.length ? shop.offers.map((o) => (
              <ShopShelf key={o.set} offer={o} balance={balance} onBuy={ask} onContents={() => setContents(o.set)} />
            )) : <p className="op-muted">Rien en vente pour le moment.</p>
          ) : shopError ? (
            <p className="danger op-small">{shopError} <button className="op-btn op-btn-ghost btn-small" onClick={loadShop}>Réessayer</button></p>
          ) : <p className="op-muted"><span className="op-spinner" /> Ouverture de la vitrine…</p>}
          <button className="op-shop-counter-link" onClick={() => setCounter(true)}>
            <span aria-hidden="true">🏪</span>
            <span><strong>Comptoir</strong><span className="op-small op-muted">Un exemplaire de plus d’une carte déjà trouvée, jusqu’à 4</span></span>
            <span aria-hidden="true">→</span>
          </button>
          <p className="op-small op-muted">{BOOSTER_NOTICE} Les Berry ne s’achètent pas : ils se gagnent en jouant.</p>
        </section>
      </div>

      <History key={historyKey} load={client.loadHistory} />

      {step && <PurchaseDialog step={step} balance={balance} opening={opening.busy} openError={opening.error}
        onConfirm={() => void confirm()} onOpen={() => void openNow()} onClose={() => setStep(null)} />}
      {contents && <ContentsDialog set={contents} offer={shop?.offers.find((o) => o.set === contents)} onClose={() => setContents(null)} />}
    </div>
  );
}

// ---------- Vitrine ----------

function ShopShelf({ offer, balance, onBuy, onContents }: {
  offer: ShopOffer;
  balance?: number;
  onBuy: (offer: ShopOffer, what: PurchaseKind) => void;
  onContents: () => void;
}) {
  const saving = offer.boostersPerDisplay * offer.booster - offer.display;
  const desc = BOOSTER_SETS[offer.set];
  const cards = desc ? desc.commons + desc.uncommons + 2 : undefined;
  const item = (what: PurchaseKind) => {
    const cost = price(offer, what);
    const missing = balance === undefined ? 0 : cost - balance;
    return (
      <div className={`op-shop-item op-shop-${what}`}>
        <span className="op-shop-art" aria-hidden="true">
          {what === 'display'
            ? <span className="op-shop-box"><PackIcon set={offer.set} /><PackIcon set={offer.set} /><PackIcon set={offer.set} count={offer.boostersPerDisplay} /></span>
            : <PackIcon set={offer.set} />}
        </span>
        <span className="op-shop-item-text">
          <strong>{what === 'display' ? `Display ${offer.set}` : `Booster ${offer.set}`}</strong>
          <span className="op-small op-muted">
            {what === 'display'
              ? `${offer.boostersPerDisplay} boosters${cards ? ` · ${offer.boostersPerDisplay * cards} cartes` : ''}`
              : cards ? `${cards} cartes` : '1 booster'}
          </span>
          {what === 'display' && saving > 0 && <span className="op-shop-saving">{berry(saving)} de moins que {offer.boostersPerDisplay} boosters</span>}
        </span>
        <span className="op-shop-buy">
          <span className="op-shop-price">{berry(cost)}</span>
          <button className="op-btn op-btn-primary" disabled={balance === undefined || missing > 0} onClick={() => onBuy(offer, what)}>Acheter</button>
          {missing > 0 && <span className="op-small op-muted">Il te manque {berry(missing)}</span>}
        </span>
      </div>
    );
  };
  return (
    <div className="op-shop-shelf">
      <div className="op-shop-shelf-head">
        <h3>Extension {offer.set}</h3>
        {boosterRates(offer.set) && <button className="op-link op-small" onClick={onContents}>Que contient un booster, un display ?</button>}
      </div>
      {item('booster')}
      {item('display')}
    </div>
  );
}

// Ce que contient un booster (chances) et un display (moyennes), calculé depuis la description des boosters
function ContentsDialog({ set, offer, onClose }: { set: string; offer?: ShopOffer; onClose: () => void }) {
  const r = boosterRates(set);
  const perDisplay = offer?.boostersPerDisplay ?? 0;
  // « ≈ 7 », « ≈ 1,8 », « 0,66 · 1 display sur 1,5 », « 0,017 · 1 display sur 60 »
  const decimal = (x: number, digits: number) => String(Number(x.toFixed(digits))).replace('.', ',');
  const mean = (chance: number) => {
    const n = chance * perDisplay;
    if (n >= 1) return `≈ ${n >= 10 ? Math.round(n) : decimal(n, 1)}`;
    const one = 1 / n;
    return `${decimal(n, n >= 0.1 ? 2 : 3)} · 1 display sur ${one >= 10 ? Math.round(one) : decimal(one, 1)}`;
  };
  return (
    <Dialog title={`Que contient un booster ${set} ?`} onClose={onClose} className="op-rates op-shop-contents" data-ui="shop.contents">
      {r ? (
        <>
          <p className="op-small">Un booster : {r.composition}.{perDisplay > 0 && <> Un display : <strong>{perDisplay} boosters</strong>.</>}</p>
          <table className="op-rates-table">
            <thead><tr><th>Carte</th><th>Dans un booster</th>{perDisplay > 0 && <th>Dans un display (en moyenne)</th>}</tr></thead>
            <tbody>
              {r.rates.map((x) => (
                <tr key={x.label} className={x.label.startsWith('dont ') ? 'op-rates-sub' : undefined}>
                  <td>{x.label}</td><td>{chanceText(x.chance)}</td>{perDisplay > 0 && <td>{mean(x.chance)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="op-small op-muted">
            Ce sont les taux d’un vrai booster en anglais, estimés d’après des comptages publiés par des joueurs. Le tirage
            se fait sur le serveur au moment d’ouvrir, au hasard : personne ne peut le choisir ni le prévoir.
          </p>
        </>
      ) : <p className="op-muted">Pas encore de description pour cette extension.</p>}
      <p className="op-small op-muted">{BOOSTER_NOTICE}</p>
    </Dialog>
  );
}

// ---------- Confirmation, achat, ouverture ----------

// opening : la Cale est lue avant l'écran d'ouverture ; openError : elle n'a pas pu l'être
function PurchaseDialog({ step, balance, opening, openError, onConfirm, onOpen, onClose }: {
  step: Step;
  balance?: number;
  opening: boolean;
  openError?: string;
  onConfirm: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { offer, what } = step;
  const cost = price(offer, what);
  const n = count(offer, what);
  const busy = step.kind === 'buying' || opening;
  if (step.kind === 'confirm' || step.kind === 'buying') {
    const after = balance === undefined ? undefined : balance - cost;
    return (
      <Dialog title={`Acheter ${itemName(offer, what)} pour ${berry(cost)} ?`} size="small" onClose={busy ? undefined : onClose}
        className="op-shop-dialog" data-ui="shop.confirm"
        actions={<>
          <Button variant="quiet" disabled={busy} onClick={onClose}>Annuler</Button>
          <Button variant="primary" busy={step.kind === 'buying'} data-autofocus data-ui="shop.confirm-buy"
            disabled={after !== undefined && after < 0 && !(step.kind === 'confirm' && step.retry)} onClick={onConfirm}>
            {step.kind === 'buying' ? 'Achat…' : step.kind === 'confirm' && step.retry ? 'Réessayer' : `Acheter pour ${berry(cost)}`}
          </Button>
        </>}>
        <PackStack set={offer.set} n={n} />
        <p>
          {what === 'display' ? `${n} boosters` : 'Un booster'} {offer.set}, à ouvrir tout de suite ou plus tard depuis ta Cale.
          {after !== undefined && after >= 0 && <> Il te restera <strong>{berry(after)}</strong>.</>}
        </p>
        {step.kind === 'confirm' && step.error && <p className="danger" role="alert">{step.error}</p>}
      </Dialog>
    );
  }
  const boosters: WonBooster[] = step.purchase.boosters;
  return (
    <Dialog title={<span className="good">C’est acheté !</span>} size="small" onClose={busy ? undefined : onClose}
      className="op-shop-dialog" data-ui="shop.bought"
      actions={<>
        <Button variant="quiet" disabled={busy} onClick={onClose} data-ui="shop.later">Plus tard</Button>
        <Button variant="primary" busy={opening} disabled={!boosters.length} data-autofocus onClick={onOpen} data-ui="shop.open">
          {opening ? 'Ouverture…' : 'Ouvrir maintenant'}
        </Button>
      </>}>
      <PackStack set={offer.set} n={boosters.length} fresh />
      <p>
        {boosters.length > 1 ? `${boosters.length} boosters ${offer.set} t’attendent` : `Un booster ${offer.set} t’attend`} dans ta Cale
        {step.purchase.spent > 0 && <> · {berry(-step.purchase.spent, true)}</>}.
      </p>
      {openError && <p className="danger op-small" role="alert">{openError}</p>}
    </Dialog>
  );
}

function PackStack({ set, n, fresh }: { set: string; n: number; fresh?: boolean }) {
  return (
    <span className={`op-shop-stack${fresh ? ' is-fresh' : ''}`} aria-hidden="true">
      {n > 1 && <PackIcon set={set} />}
      <PackIcon set={set} count={n} />
    </span>
  );
}

// ---------- Historique ----------

const REASON_ICONS: Record<LedgerReason, string> = {
  partie: '⚔️', 'bonus-jour': '☀️', coffre: '🎁', chapitre: '🏝️', doublons: '♻️', achat: '🛍️', comptoir: '🏪',
  saison: '🏆', partage: '🔗', parrainage: '🤝', correction: '✏️',
};

// « aujourd’hui 14:05 », « hier 09:12 », « lun. 19 oct. »
export function when(at: string, now = new Date()): string {
  const d = new Date(at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `aujourd’hui ${time}`;
  if (diff === 1) return `hier ${time}`;
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

function History({ load }: { load: ShopClient['loadHistory'] }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [next, setNext] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const more = useCallback(async (before?: number) => {
    setBusy(true);
    setError(undefined);
    try {
      const page = await load(before);
      setEntries((list) => (before === undefined ? page.entries : [...(list ?? []), ...page.entries]));
      setNext(page.next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [load]);
  useEffect(() => { void more(); }, [more]);

  return (
    <section className="op-shop-history" aria-label="Historique">
      <h2>Historique</h2>
      {entries === null ? (
        error ? <p className="danger op-small">{error} <button className="op-btn op-btn-ghost btn-small" onClick={() => void more()}>Réessayer</button></p>
          : <p className="op-muted"><span className="op-spinner" /> Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="op-muted op-small">Rien pour l’instant : tes gains et tes achats s’inscriront ici.</p>
      ) : (
        <>
          <ul className="op-shop-ledger">
            {entries.map((e) => (
              <li key={e.id}>
                <span className="op-shop-ledger-icon" aria-hidden="true">{REASON_ICONS[e.reason] ?? '•'}</span>
                <span className="op-shop-ledger-text">
                  <span>{e.label}{e.boosters ? <span className="op-muted"> · {plural(e.boosters, 'booster')}</span> : null}</span>
                  <span className="op-small op-muted">{when(e.at)}</span>
                </span>
                <span className={`op-shop-ledger-amount ${e.amount > 0 ? 'good' : e.amount < 0 ? 'is-spent' : 'op-muted'}`}>
                  {e.amount === 0 ? '—' : berry(e.amount, true)}
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="danger op-small">{error}</p>}
          {next !== undefined && (
            <button className="op-btn op-btn-ghost op-shop-more" disabled={busy} onClick={() => void more(next)}>
              {busy ? <><span className="op-spinner" /> Chargement…</> : 'Voir plus'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
