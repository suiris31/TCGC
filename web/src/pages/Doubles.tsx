import { useEffect, useRef, useState } from 'react';
import { api, formatDate, formatEur, shareUrl, type Doubles, type Share, type ShareScope } from '../api';
import { CardRow } from '../components/CardRow';
import { Icon } from '../components/Icon';
import { InsightChip } from '../components/Insight';
import { Toggle } from '../components/Toggle';
import { TradesPanel } from '../components/TradesPanel';
import { t, type MessageKey } from '../i18n';
import { readPref, writePref } from '../prefs';
import { useApp } from '../store';

// Choix proposés pour le nombre d'exemplaires gardés par carte et par langue
const KEEP_CHOICES = [1, 2, 3, 4];

type Entry = Doubles['cards'][number];
const extraValue = (c: Entry) => c.extra * (c.price.eur ?? 0);

const SORTS = {
  value: { label: 'doubles.sort.value', compare: (a: Entry, b: Entry) => extraValue(b) - extraValue(a) },
  extra: { label: 'doubles.sort.extra', compare: (a: Entry, b: Entry) => b.extra - a.extra || extraValue(b) - extraValue(a) },
  number: { label: 'sort.number', compare: (a: Entry, b: Entry) => a.number.localeCompare(b.number, 'en', { numeric: true }) || a.id - b.id },
} satisfies Record<string, { label: MessageKey; compare: (a: Entry, b: Entry) => number }>;
type Sort = keyof typeof SORTS;

// Doubles : exemplaires en plus de ceux qu'on garde, la monnaie d'échange, et le lien pour les partager
export function DoublesView() {
  const { version, openCard, toast } = useApp();
  const [data, setData] = useState<Doubles | null>(null);
  const [sort, setSort] = useState<Sort>(() => readPref('tcgc.doublesSort', Object.keys(SORTS) as Sort[], 'value'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.doubles().then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [version]);

  const changeKeep = async (keep: number) => {
    setBusy(true);
    try {
      await api.setKeepCopies(keep);
      setData(await api.doubles());
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="center"><div className="spinner" /></div>;
  const cards = [...data.cards].sort(SORTS[sort].compare);

  return (
    <div className="stack">
      <section className="panel stack-tight">
        {data.copies > 0 ? (
          <div>
            <strong>{t('doubles.count', { n: data.copies })}</strong>
            <span className="muted"> · {t('doubles.distinct', { n: data.distinct })} · ≈ {formatEur(data.valueEur, true)}</span>
          </div>
        ) : (
          <div className="muted">{t('doubles.empty', { n: data.keep })}</div>
        )}
        <div className="wish-row">
          <span>{t('doubles.keep')}</span>
          <div className="lang-switch" role="radiogroup" aria-label={t('doubles.keep')}>
            {KEEP_CHOICES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={data.keep === n} disabled={busy}
                className={data.keep === n ? 'lang-opt lang-opt-on' : 'lang-opt'} onClick={() => n !== data.keep && changeKeep(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small flush">{t('doubles.keepHelp')}</p>
      </section>

      <TradesPanel />
      <SharePanel />

      {cards.length > 0 && (
        <section>
          <div className="list-head">
            <h3 className="flush">{t('doubles.list')}</h3>
            <select className="select" value={sort} aria-label={t('common.sort')}
              onChange={(e) => { setSort(e.target.value as Sort); writePref('tcgc.doublesSort', e.target.value); }}>
              {Object.entries(SORTS).map(([value, { label }]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
          <ul className="card-list">
            {cards.map((c) => {
              const lang = c.entry?.lang ?? 'fr';
              // pour un double, une hausse ou une baisse en cours est utile pour choisir le moment d'échanger
              const kind = c.insight?.kind;
              return (
                <CardRow key={`${c.id}-${lang}`} card={c} lang={lang} onClick={() => openCard(c.id, lang)}
                  chip={(kind === 'rising' || kind === 'falling') && <InsightChip kind={kind} />}>
                  <span className="toplist-price">{formatEur(c.price.eur)}</span>
                  <span className="small muted">{t('doubles.extra', { n: c.extra })}</span>
                </CardRow>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// Lien de partage : création, envoi, ce qu'il montre, changement et désactivation
function SharePanel() {
  const { toast } = useApp();
  const [share, setShare] = useState<Share | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.share().then((res) => setShare(res.share)).catch(() => setShare(null));
  }, []);

  const run = async (action: () => Promise<{ share: Share | null }>, message?: MessageKey) => {
    setBusy(true);
    try {
      setShare((await action()).share);
      if (message) toast(t(message));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (share === undefined) return null;

  if (!share) {
    return (
      <section className="panel stack-tight">
        <h3 className="flush">{t('share.title')}</h3>
        <p className="muted small flush">{t('share.intro')}</p>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.saveShare({}), 'share.created')}>
          <Icon name="link" size={18} /> {t('share.create')}
        </button>
      </section>
    );
  }

  const url = shareUrl(share.token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied'));
    } catch {
      // presse-papiers indisponible (adresse http:// locale) : le lien est sélectionné pour être copié à la main
      linkRef.current?.select();
    }
  };

  // Menu de partage du téléphone (WhatsApp, SMS...), sinon copie du lien
  const send = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('app.name'), text: t(`share.text.${share.scope}`), url });
      } catch { /* partage annulé */ }
      return;
    }
    copy();
  };

  const setScope = (scope: ShareScope) => scope !== share.scope && run(() => api.saveShare({ scope }));

  return (
    <section className="panel stack-tight">
      <h3 className="flush">{t('share.title')}</h3>
      <input ref={linkRef} className="share-link" readOnly value={url} aria-label={t('share.link')}
        onFocus={(e) => e.currentTarget.select()} />
      <div className="share-actions">
        <button className="btn btn-primary" onClick={send}><Icon name="share" size={18} /> {t('share.send')}</button>
        <button className="btn btn-ghost" onClick={copy}>{t('share.copy')}</button>
      </div>

      <div className="small muted">{t('share.scope')}</div>
      <div className="segmented flush" role="radiogroup" aria-label={t('share.scope')}>
        {(['doubles', 'collection'] as const).map((scope) => (
          <button key={scope} role="radio" aria-checked={share.scope === scope} disabled={busy}
            className={share.scope === scope ? 'segment segment-on' : 'segment'} onClick={() => setScope(scope)}>
            {t(`share.scope.${scope}`)}
          </button>
        ))}
      </div>
      <Toggle checked={share.showPrices} disabled={busy} onChange={(v) => run(() => api.saveShare({ showPrices: v }))}>
        {t('share.showPrices')}
      </Toggle>
      <Toggle checked={share.showWishlist} disabled={busy} onChange={(v) => run(() => api.saveShare({ showWishlist: v }))}>
        {t('share.showWishlist')}
      </Toggle>

      <p className="muted small flush">{t('share.privacy')}</p>
      <div className="share-footer small">
        <a href={url} target="_blank" rel="noreferrer" className="link">{t('share.preview')}</a>
        <button className="link" disabled={busy}
          onClick={() => window.confirm(t('share.regenerateConfirm')) && run(() => api.regenerateShare(), 'share.regenerated')}>
          {t('share.regenerate')}
        </button>
        <button className="link link-danger" disabled={busy}
          onClick={() => window.confirm(t('share.disableConfirm')) && run(() => api.deleteShare(), 'share.disabled')}>
          {t('share.disable')}
        </button>
      </div>
      <div className="muted small">{t('share.since', { date: formatDate(share.createdAt) })}</div>
    </section>
  );
}
