import { useEffect, useState, type ReactNode } from 'react';
import { api, formatEur, formatPct, type Card } from '../api';
import { CardRow } from '../components/CardRow';
import { InsightChip } from '../components/Insight';
import { wishGap } from '../components/WishBox';
import { t, type MessageKey } from '../i18n';
import { readPref, writePref } from '../prefs';
import { useApp } from '../store';

const byPrice = (a: Card, b: Card) => (a.price.eur ?? Infinity) - (b.price.eur ?? Infinity);
const gapOf = (card: Card) => wishGap(card)?.gap ?? Infinity;

const SORTS = {
  gap: { label: 'wishlist.sort.gap', compare: (a: Card, b: Card) => gapOf(a) - gapOf(b) || byPrice(a, b) },
  'price-asc': { label: 'sort.priceAsc', compare: byPrice },
  price: { label: 'sort.price', compare: (a: Card, b: Card) => (b.price.eur ?? -1) - (a.price.eur ?? -1) },
  number: { label: 'sort.number', compare: (a: Card, b: Card) => a.number.localeCompare(b.number, 'en', { numeric: true }) || a.id - b.id },
  added: { label: 'sort.added', compare: (a: Card, b: Card) => (b.wish?.addedAt ?? '').localeCompare(a.wish?.addedAt ?? '') },
} satisfies Record<string, { label: MessageKey; compare: (a: Card, b: Card) => number }>;
type Sort = keyof typeof SORTS;

// Recherches : cartes voulues avec leur prix cible, et bonnes affaires parmi les cartes manquantes des sets commencés
export function Wishlist() {
  const { version, lang } = useApp();
  const [data, setData] = useState<{ cards: Card[]; deals: Card[] } | null>(null);
  const [sort, setSort] = useState<Sort>(() => readPref('tcgc.wishSort', Object.keys(SORTS) as Sort[], 'gap'));

  useEffect(() => {
    let cancelled = false;
    api.wishlist().then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [version]);

  if (!data) return <div className="center"><div className="spinner" /></div>;

  const reached = data.cards.filter((c) => wishGap(c)?.reached);
  const others = data.cards.filter((c) => !wishGap(c)?.reached).sort(SORTS[sort].compare);
  const total = data.cards.reduce((sum, c) => sum + (c.price.eur ?? 0), 0);

  return (
    <div className="stack">
      {data.cards.length === 0 ? (
        <section className="panel">
          <h3>{t('wishlist.empty.title')}</h3>
          <p className="muted small">{t('wishlist.empty.text')}</p>
        </section>
      ) : (
        <section className="panel wish-summary">
          <div>
            <strong>{t('wishlist.count', { n: data.cards.length })}</strong>
            <span className="muted"> · {t('wishlist.total', { value: formatEur(total, true) })}</span>
          </div>
          {reached.length > 0 && <div className="wish-ok">{t('wishlist.reachedCount', { n: reached.length })}</div>}
          <p className="muted small">{t('wishlist.help')}</p>
        </section>
      )}

      {reached.length > 0 && (
        <section>
          <h3 className="wish-ok">{t('wishlist.reached')}</h3>
          <ul className="card-list">{reached.sort(SORTS.gap.compare).map((c) => <WishRow key={c.id} card={c} />)}</ul>
        </section>
      )}

      {data.deals.length > 0 && (
        <section>
          <h3>{t('wishlist.deals')}</h3>
          <p className="muted small wish-section-help">{t('wishlist.dealsHelp')}</p>
          <ul className="card-list">
            {data.deals.map((c) => (
              <WishRow key={c.id} card={c} lang={lang}
                extra={c.insight?.change != null && <span className="small wish-ok">{t('wishlist.vsAvg', { pct: formatPct(c.insight.change) })}</span>} />
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <div className="list-head">
            <h3>{t('wishlist.all')}</h3>
            <select className="select" value={sort} aria-label={t('common.sort')}
              onChange={(e) => { setSort(e.target.value as Sort); writePref('tcgc.wishSort', e.target.value); }}>
              {Object.entries(SORTS).map(([value, { label }]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
          <ul className="card-list">{others.map((c) => <WishRow key={c.id} card={c} />)}</ul>
        </section>
      )}
    </div>
  );
}

// Une ligne : visuel, nom, lecture du prix, prix actuel et prix cible (ou écart à la moyenne pour une bonne affaire)
function WishRow({ card, lang, extra }: { card: Card; lang?: 'fr' | 'en'; extra?: ReactNode }) {
  const { openCard } = useApp();
  const shown = card.wish?.lang ?? lang ?? 'fr';
  const status = wishGap(card);
  return (
    <CardRow card={card} lang={shown} onClick={() => openCard(card.id, shown)}
      chip={card.insight?.kind && <InsightChip kind={card.insight.kind} />}>
      <span className="toplist-price">{formatEur(card.price.eur)}</span>
      {card.wish ? (
        <span className={status?.reached ? 'small wish-ok' : 'small muted'}>
          {card.wish.targetEur != null ? t('wish.target.short', { price: formatEur(card.wish.targetEur) }) : t('wish.noTarget')}
        </span>
      ) : extra}
    </CardRow>
  );
}
