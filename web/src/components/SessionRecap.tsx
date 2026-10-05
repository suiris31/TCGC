import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cardImage, cardName, formatEur, type Card, type Lang } from '../api';
import { locale, t } from '../i18n';
import { useApp } from '../store';
import { hideBroken } from './CardGrid';
import { Icon } from './Icon';
import { inputEur, parseEur } from './WishBox';

export interface SessionEntry { card: Card; quantity: number; lang: Lang }

// Raretés comptées comme « rares » dans le récap d'une ouverture
const HIT_RARITIES = new Set(['SR', 'SEC', 'TR', 'SP', 'L']);

// Récap d'une session de scan (ouverture de boosters ou de display) : valeur, cartes rares, meilleures cartes,
// et bilan face au prix payé s'il est indiqué. Rien n'est enregistré côté serveur.
export function SessionRecap({ entries, paid, onPaid, onClose, onReset }: {
  entries: SessionEntry[];
  paid: number | null;
  onPaid: (value: number | null) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const { openCard, toast } = useApp();
  const [paidText, setPaidText] = useState(inputEur(paid));
  const count = entries.reduce((sum, e) => sum + e.quantity, 0);
  const value = entries.reduce((sum, e) => sum + (e.card.price.eur ?? 0) * e.quantity, 0);
  const hits = entries.filter((e) => HIT_RARITIES.has(e.card.rarity ?? '')).reduce((sum, e) => sum + e.quantity, 0);
  const special = entries.filter((e) => e.card.variant).reduce((sum, e) => sum + e.quantity, 0);
  const best = [...entries].sort((a, b) => (b.card.price.eur ?? 0) - (a.card.price.eur ?? 0)).slice(0, 5);

  const share = async () => {
    const top = best[0];
    const text = t('recap.shareText', {
      n: count,
      value: formatEur(value),
      best: top ? `${cardName(top.card, top.lang)} ${top.card.number}` : '—',
      price: formatEur(top?.card.price.eur),
    });
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text }); } catch { /* partage annulé */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('recap.copied'));
    } catch { /* presse-papiers indisponible */ }
  };

  // Rendue au niveau de la page : le scanner (position fixe) passerait sinon sous la barre d'onglets
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet recap" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="sheet-close" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
        <div className="recap-body">
          <h2>{t('recap.title')}</h2>
          <div className="recap-hero">
            <div className="hero-value">{formatEur(value)}</div>
            <div className="muted">{t('count.cards', { n: count })} · {t('recap.average', { value: formatEur(count ? value / count : 0) })}</div>
          </div>
          <dl className="kv">
            <div><dt>{t('recap.hits')}</dt><dd>{hits}</dd></div>
            <div><dt>{t('recap.special')}</dt><dd>{special}</dd></div>
          </dl>

          <form className="wish-row" onSubmit={(e) => { e.preventDefault(); const v = parseEur(paidText); if (v !== undefined) onPaid(v); }}>
            <label htmlFor="recap-paid">{t('recap.paid')}</label>
            <div className="wish-target">
              <input id="recap-paid" className="wish-input" type="text" inputMode="decimal" autoComplete="off" value={paidText}
                placeholder={t('recap.paidHint')} onChange={(e) => setPaidText(e.target.value)}
                onBlur={() => { const v = parseEur(paidText); if (v !== undefined) onPaid(v); }}
                aria-invalid={parseEur(paidText) === undefined} />
              <span className="muted">€</span>
            </div>
          </form>
          {paid != null && (
            <div className={value >= paid ? 'recap-balance wish-ok' : 'recap-balance recap-loss'}>
              {t('recap.balance', { value: new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' }).format(value - paid) })}
            </div>
          )}

          {best.length > 0 && (
            <section>
              <h3>{t('recap.best')}</h3>
              <ol className="toplist">
                {best.map((e) => (
                  <li key={`${e.card.id}-${e.lang}`}>
                    <button onClick={() => openCard(e.card.id, e.lang)}>
                      <img src={cardImage(e.card, e.lang)} alt="" loading="lazy" onError={hideBroken} />
                      <span className="toplist-name">
                        <span>{cardName(e.card, e.lang)}<span className="muted"> {e.lang.toUpperCase()}{e.quantity > 1 && ` ×${e.quantity}`}</span></span>
                        <span className="muted small">{e.card.number}{e.card.variant && ` · ${e.card.variant}`}{e.card.rarity && ` · ${e.card.rarity}`}</span>
                      </span>
                      <span className="toplist-price">{formatEur(e.card.price.eur)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="muted small flush">{t('recap.note')}</p>
          <div className="panel-actions">
            <button className="btn btn-ghost" onClick={share}><Icon name="share" size={18} /> {t('recap.share')}</button>
            <button className="btn btn-ghost" onClick={() => window.confirm(t('recap.newConfirm')) && onReset()}>
              <Icon name="refresh" size={18} /> {t('recap.new')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
