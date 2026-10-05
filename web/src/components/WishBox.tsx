import { useEffect, useState } from 'react';
import { api, formatEur, formatPct, type Card, type Lang } from '../api';
import { getUiLang, t } from '../i18n';
import { useApp } from '../store';
import { LangSwitch } from './LangSwitch';

// "12,5" ou "12.5" -> 12.5 ; vide -> null (pas de montant) ; invalide -> undefined
export function parseEur(text: string): number | null | undefined {
  const s = text.trim().replace(',', '.').replace(/\s|€/g, '');
  if (!s) return null;
  const value = Number(s);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined;
}

// Montant affiché dans un champ de saisie (virgule décimale en français)
export function inputEur(value: number | null | undefined) {
  if (value == null) return '';
  return getUiLang() === 'fr' ? String(value).replace('.', ',') : String(value);
}

// Prix actuel par rapport au prix cible : atteint, ou écart restant
export function wishGap(card: Card) {
  const target = card.wish?.targetEur;
  if (target == null || card.price.eur == null) return null;
  return { reached: card.price.eur <= target, gap: card.price.eur / target - 1 };
}

// Fiche d'une carte : ajout aux recherches, prix cible et langue recherchée
export function WishBox({ card, lang }: { card: Card; lang: Lang }) {
  const { wishChanged, toast } = useApp();
  const [target, setTarget] = useState(inputEur(card.wish?.targetEur));
  const [busy, setBusy] = useState(false);
  const saved = card.wish?.targetEur ?? null;
  const suggested = card.insight?.target ?? null;

  useEffect(() => { setTarget(inputEur(saved)); }, [saved, card.id]);

  const run = async (action: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await action();
      wishChanged();
      if (message) toast(message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!card.wish) {
    return (
      <section className="wish-box">
        <button className="btn btn-ghost btn-wish" disabled={busy}
          onClick={() => run(() => api.wish(card.id, { lang }), t('wish.added'))}>
          <span aria-hidden="true">☆</span> {t('wish.add')}
          {suggested != null && <span className="muted small"> · {t('wish.target.short', { price: formatEur(suggested) })}</span>}
        </button>
      </section>
    );
  }

  const parsed = parseEur(target);
  const changed = parsed !== undefined && parsed !== saved;
  const status = wishGap(card);
  const save = (value: number | null) => run(() => api.wish(card.id, { targetEur: value }), t('wish.saved'));

  return (
    <section className="wish-box wish-box-on">
      <div className="wish-head">
        <h3><span aria-hidden="true">★</span> {t('wish.title')}</h3>
        <button className="link" disabled={busy} onClick={() => run(() => api.unwish(card.id), t('wish.removed'))}>{t('wish.remove')}</button>
      </div>
      {status && (
        status.reached
          ? <div className="wish-status wish-status-ok">{t('wish.reached')}</div>
          : <div className="wish-status">{t('wish.gap', { pct: formatPct(status.gap) })}</div>
      )}
      <form className="wish-row" onSubmit={(e) => { e.preventDefault(); if (changed) save(parsed); }}>
        <label htmlFor="wish-target">{t('wish.target')}</label>
        <div className="wish-target">
          <input id="wish-target" className="wish-input" type="text" inputMode="decimal" autoComplete="off"
            value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t('wish.noTarget')}
            aria-label={t('wish.targetAria')} aria-invalid={parsed === undefined} />
          <span className="muted">€</span>
          <button className="btn btn-ghost btn-sm" type="submit" disabled={!changed || busy}>{t('wish.save')}</button>
        </div>
      </form>
      {suggested != null && suggested !== saved && (
        <div className="small muted wish-suggested">
          {t('wish.suggested', { price: formatEur(suggested) })}{' '}
          <button className="link" disabled={busy} onClick={() => save(suggested)}>{t('wish.useSuggested')}</button>
        </div>
      )}
      <div className="wish-row">
        <span>{t('wish.lang')}</span>
        <LangSwitch value={card.wish.lang} compact label={t('wish.lang')}
          onChange={(next) => next !== card.wish?.lang && run(() => api.wish(card.id, { lang: next }))} />
      </div>
      <p className="muted small wish-help">{t('wish.help')}</p>
    </section>
  );
}
