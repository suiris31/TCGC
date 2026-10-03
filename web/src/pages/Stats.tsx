import { useEffect, useState } from 'react';
import { api, cardImage, cardName, formatDate, formatEur, type PriceSource, type Stats } from '../api';
import { Icon } from '../components/Icon';
import { LineChart } from '../components/LineChart';
import { useApp } from '../store';

export function StatsPage() {
  const { status, refreshStatus, version, toast, openCard, cardChanged } = useApp();
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
    toast('Mise à jour des prix lancée');
    window.setTimeout(refreshStatus, 1500);
  };

  const maxSet = Math.max(1, ...(stats?.bySet.map((s) => s.valueEur) ?? [1]));
  const origin = window.location.origin;

  return (
    <div className="page stats">
      <section className="panel hero-panel">
        <div className="muted small">Valeur estimée de la collection</div>
        <div className="hero-value">{formatEur(stats?.totals.valueEur)}</div>
        <div className="hero-sub">
          <span><strong>{stats?.totals.cards ?? 0}</strong> carte{(stats?.totals.cards ?? 0) > 1 ? 's' : ''}</span>
          <span><strong>{stats?.totals.distinctCards ?? 0}</strong> différente{(stats?.totals.distinctCards ?? 0) > 1 ? 's' : ''}</span>
          {(stats?.totals.unpriced ?? 0) > 0 && <span>{stats!.totals.unpriced} sans prix</span>}
        </div>
        {stats && (
          <LineChart points={stats.history.map((h) => ({ date: h.date, value: h.valueEur }))} />
        )}
      </section>

      {stats && stats.top.length > 0 && (
        <section className="panel">
          <h3>Mes cartes les plus chères</h3>
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
          <h3>Valeur par extension</h3>
          <ul className="bars">
            {stats.bySet.map((s) => (
              <li key={`${s.code}-${s.name}`}>
                <div className="bar-label">
                  <span>{s.code ?? s.name} <span className="muted small">· {s.cards} carte{s.cards > 1 ? 's' : ''}</span></span>
                  <span>{formatEur(s.valueEur, true)}</span>
                </div>
                <div className="bar"><div style={{ width: `${(100 * s.valueEur) / maxSet}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>Source des prix</h3>
        <div className="segmented" role="radiogroup" aria-label="Source des prix">
          {([['cardmarket', 'Cardmarket (Europe)'], ['tcgplayer', 'TCGplayer (USA)']] as const).map(([value, label]) => (
            <button key={value} role="radio" aria-checked={status?.priceSource === value}
              className={status?.priceSource === value ? 'segment segment-on' : 'segment'} onClick={() => changeSource(value)}>
              {label}
            </button>
          ))}
        </div>
        <p className="muted small">
          {status?.priceSource === 'tcgplayer'
            ? 'Prix des cartes anglaises aux États-Unis (moyenne des ventes), convertis en euros au taux BCE du jour.'
            : 'Tendance des prix sur Cardmarket, le marché de référence en Europe. Cardmarket ne sépare pas les langues : VF et VO sont mélangées.'}
          {' '}Si la source choisie n'a pas de prix pour une carte, l'autre prend le relais.
        </p>
      </section>

      <section className="panel">
        <h3>Données</h3>
        <dl className="kv">
          <div><dt>Prix Cardmarket du</dt><dd>{formatDate(status?.cmPriceDate)}</dd></div>
          <div><dt>Prix TCGplayer du</dt><dd>{formatDate(status?.priceDate)}</dd></div>
          <div><dt>Taux BCE</dt><dd>{status?.usdPerEur ? `1 € = ${status.usdPerEur.toLocaleString('fr-FR', { minimumFractionDigits: 4 })} $` : '—'}</dd></div>
          <div><dt>Dernière synchro</dt><dd>{status?.lastSync ? new Date(status.lastSync).toLocaleString('fr-FR') : '—'}</dd></div>
          <div><dt>Reconnaissance</dt><dd>{status ? `${status.scan.indexed} / ${status.scan.total} cartes${status.scan.building ? ' (en cours)' : ''}` : '—'}</dd></div>
        </dl>
        {status?.error && <p className="warn small">Dernière erreur : {status.error}</p>}
        <div className="panel-actions">
          <button className="btn btn-ghost" onClick={sync} disabled={status?.syncing}>
            <Icon name="refresh" size={18} /> {status?.syncing ? 'Mise à jour...' : 'Mettre à jour les prix'}
          </button>
          <a className="btn btn-ghost" href="/api/export.csv" download>
            <Icon name="download" size={18} /> Exporter (CSV)
          </a>
        </div>
      </section>

      <section className="panel">
        <button className="collapse" onClick={() => setShowCameraHelp(!showCameraHelp)}>
          <h3>Caméra en direct sur Android</h3>
          <span>{showCameraHelp ? '−' : '+'}</span>
        </button>
        {showCameraHelp && (
          <div className="help">
            <p>
              Chrome n'autorise la caméra en direct (et l'installation comme appli) que sur une adresse sécurisée.
              Comme l'appli tourne sur ton PC en <code>http://</code>, il faut déclarer cette adresse comme sûre, une seule fois :
            </p>
            <ol>
              <li>Dans Chrome sur le téléphone, ouvre <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
              <li>Mets le réglage sur <b>Enabled</b> et écris dans le champ : <code>{origin}</code></li>
              <li>Appuie sur <b>Relaunch</b> en bas de l'écran</li>
              <li>Reviens ici : l'onglet Scanner affiche la caméra. Menu ⋮ ▸ <b>Installer l'application</b> pour l'avoir sur l'écran d'accueil.</li>
            </ol>
            <p className="muted small">Sans ça, le scan marche quand même : il passe par l'appareil photo du téléphone.</p>
          </div>
        )}
      </section>
    </div>
  );
}
