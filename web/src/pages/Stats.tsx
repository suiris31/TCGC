import { useEffect, useState } from 'react';
import { api, cardImage, cardName, formatDate, formatEur, type PriceSource, type Stats } from '../api';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { LineChart } from '../components/LineChart';
import { getUiLang, locale, t } from '../i18n';
import { useApp } from '../store';

export function StatsPage() {
  const { status, refreshStatus, version, toast, openCard, cardChanged, uiLang, setUiLang } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [showCameraHelp, setShowCameraHelp] = useState(false);

  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, [version, status?.priceDate, status?.priceSource]);

  const changeSource = async (source: PriceSource) => {
    const res = await api.setPriceSource(source);
    refreshStatus();
    cardChanged(null, res.totals); // recharge toutes les listes avec la nouvelle estimation
  };

  const sync = async () => {
    await api.sync();
    toast(t('stats.updateStarted'));
    window.setTimeout(refreshStatus, 1500);
  };

  const maxSet = Math.max(1, ...(stats?.bySet.map((s) => s.valueEur) ?? [1]));
  const origin = window.location.origin;

  return (
    <div className="page stats">
      <section className="panel hero-panel">
        <div className="muted small">{t('app.valueTitle')}</div>
        <div className="hero-value">{formatEur(stats?.totals.valueEur)}</div>
        <div className="hero-sub">
          <span><strong>{stats?.totals.cards ?? 0}</strong> {t('word.card', { n: stats?.totals.cards ?? 0 })}</span>
          <span><strong>{stats?.totals.distinctCards ?? 0}</strong> {t('word.distinct', { n: stats?.totals.distinctCards ?? 0 })}</span>
          {(stats?.totals.unpriced ?? 0) > 0 && <span>{t('stats.unpriced', { n: stats!.totals.unpriced })}</span>}
        </div>
        {stats && (
          <LineChart points={stats.history.map((h) => ({ date: h.date, value: h.valueEur }))} />
        )}
      </section>

      {stats && stats.top.length > 0 && (
        <section className="panel">
          <h3>{t('stats.top')}</h3>
          <ol className="toplist">
            {stats.top.map((c) => {
              const lang = c.entry?.lang ?? 'fr';
              const quantity = c.entry?.quantity ?? c.owned;
              return (
              <li key={`${c.id}-${lang}`}>
                <button onClick={() => openCard(c.id, lang)}>
                  <img src={cardImage(c, lang)} alt="" loading="lazy" />
                  <span className="toplist-name">
                    <span>
                      {cardName(c, lang)}
                      <span className="muted"> {lang.toUpperCase()}{quantity > 1 && ` ×${quantity}`}</span>
                    </span>
                    <span className="muted small">{c.number}{c.variant && ` · ${c.variant}`}</span>
                  </span>
                  <span className="toplist-price">{formatEur(c.price.eur)}</span>
                </button>
              </li>
              );
            })}
          </ol>
        </section>
      )}

      {stats && stats.bySet.length > 0 && (
        <section className="panel">
          <h3>{t('stats.bySet')}</h3>
          <ul className="bars">
            {stats.bySet.map((s) => (
              <li key={`${s.code}-${s.name}`}>
                <div className="bar-label">
                  <span>{s.code ?? s.name} <span className="muted small">· {t('count.cards', { n: s.cards })}</span></span>
                  <span>{formatEur(s.valueEur, true)}</span>
                </div>
                <div className="bar"><div style={{ width: `${(100 * s.valueEur) / maxSet}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>{t('stats.uiLang')}</h3>
        {/* chaque langue est écrite dans sa propre langue, pour être reconnue quelle que soit la langue actuelle */}
        <LangSwitch value={uiLang} onChange={setUiLang} label={t('stats.uiLang')} names={{ fr: 'Français', en: 'English' }} />
      </section>

      <section className="panel">
        <h3>{t('stats.priceSource')}</h3>
        <div className="segmented" role="radiogroup" aria-label={t('stats.priceSource')}>
          {([['cardmarket', t('stats.source.cm')], ['tcgplayer', t('stats.source.tcg')]] as const).map(([value, label]) => (
            <button key={value} role="radio" aria-checked={status?.priceSource === value}
              className={status?.priceSource === value ? 'segment segment-on' : 'segment'} onClick={() => changeSource(value)}>
              {label}
            </button>
          ))}
        </div>
        <p className="muted small">
          {status?.priceSource === 'tcgplayer' ? t('stats.source.tcgHelp') : t('stats.source.cmHelp')}
          {' '}{t('stats.source.fallback')}
        </p>
      </section>

      <section className="panel">
        <h3>{t('stats.data')}</h3>
        <dl className="kv">
          <div><dt>{t('stats.cmDate')}</dt><dd>{formatDate(status?.cmPriceDate)}</dd></div>
          <div><dt>{t('stats.tcgDate')}</dt><dd>{formatDate(status?.priceDate)}</dd></div>
          <div><dt>{t('stats.rate')}</dt><dd>{status?.usdPerEur ? `1 € = ${status.usdPerEur.toLocaleString(locale(), { minimumFractionDigits: 4 })} $` : '—'}</dd></div>
          <div><dt>{t('stats.lastSync')}</dt><dd>{status?.lastSync ? new Date(status.lastSync).toLocaleString(locale()) : '—'}</dd></div>
          <div>
            <dt>{t('stats.recognition')}</dt>
            <dd>{status ? `${t('stats.recognitionValue', { indexed: status.scan.indexed, total: status.scan.total })}${status.scan.building ? t('stats.inProgress') : ''}` : '—'}</dd>
          </div>
        </dl>
        {status?.error && <p className="warn small">{t('stats.lastError', { error: status.error })}</p>}
        <div className="panel-actions">
          <button className="btn btn-ghost" onClick={sync} disabled={status?.syncing}>
            <Icon name="refresh" size={18} /> {status?.syncing ? t('stats.updating') : t('stats.update')}
          </button>
          <a className="btn btn-ghost" href={`/api/export.csv?lang=${getUiLang()}`} download>
            <Icon name="download" size={18} /> {t('stats.export')}
          </a>
        </div>
      </section>

      <section className="panel">
        <button className="collapse" onClick={() => setShowCameraHelp(!showCameraHelp)}>
          <h3>{t('cam.title')}</h3>
          <span>{showCameraHelp ? '−' : '+'}</span>
        </button>
        {showCameraHelp && (
          <div className="help">
            <p>{t('cam.intro')}</p>
            <ol>
              <li>{t('cam.step1')} <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
              <li>{t('cam.step2a')} <b>Enabled</b> {t('cam.step2b')} <code>{origin}</code></li>
              <li>{t('cam.step3a')} <b>Relaunch</b> {t('cam.step3b')}</li>
              <li>{t('cam.step4a')} <b>{t('cam.install')}</b> {t('cam.step4b')}</li>
            </ol>
            <p className="muted small">{t('cam.note')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
