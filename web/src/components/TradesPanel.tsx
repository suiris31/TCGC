import { useEffect, useState } from 'react';
import { api, cardImage, cardName, formatEur, type TradeCard, type TradeMatch, type TradeSettings } from '../api';
import { t } from '../i18n';
import { useApp } from '../store';
import { hideBroken } from './CardGrid';
import { Icon } from './Icon';

// Doubles : échanges entre membres qui participent (cartes recherchées par l'un, en double chez l'autre)
export function TradesPanel() {
  const { version, toast } = useApp();
  const [settings, setSettings] = useState<TradeSettings | null>(null);
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState('');
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.trades().then((res) => {
    setSettings(res.settings);
    setMatches(res.matches);
    setContact(res.settings.contact);
    setRegion(res.settings.region);
  });

  useEffect(() => { load().catch(() => {}); }, [version]);

  const save = async (enabled: boolean) => {
    setBusy(true);
    try {
      await api.setTradeSettings({ enabled, contact, region });
      await load();
      setEditing(false);
      toast(t(enabled ? 'trade.saved' : 'trade.left'));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return null;

  const form = (
    <form className="stack-tight" onSubmit={(e) => { e.preventDefault(); save(true); }}>
      <label className="field">
        <span>{t('trade.contact')}</span>
        <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100} placeholder={t('trade.contactHint')} />
      </label>
      <label className="field">
        <span>{t('trade.region')}</span>
        <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={60} placeholder={t('trade.regionHint')} />
      </label>
      <p className="muted small flush">{t('trade.privacy')}</p>
      <div className="panel-actions">
        {settings.enabled && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('profile.cancel')}</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{t(settings.enabled ? 'wish.save' : 'trade.join')}</button>
      </div>
    </form>
  );

  if (!settings.enabled) {
    return (
      <section className="panel stack-tight">
        <h3 className="flush">{t('trade.title')}</h3>
        <p className="muted small flush">{t('trade.intro')}</p>
        {editing ? form : (
          <button className="btn btn-primary" onClick={() => setEditing(true)}><Icon name="cards" size={18} /> {t('trade.join')}</button>
        )}
      </section>
    );
  }

  return (
    <section className="panel stack-tight">
      <div className="wish-head">
        <h3>{t('trade.title')}</h3>
        {!editing && <button className="link" onClick={() => setEditing(true)}>{t('trade.edit')}</button>}
      </div>
      {editing ? (
        <>
          {form}
          <button className="link link-danger" disabled={busy} onClick={() => save(false)}>{t('trade.leave')}</button>
        </>
      ) : matches.length === 0 ? (
        <p className="muted small flush">{t('trade.none')}</p>
      ) : (
        matches.map((m) => (
          <div key={m.pseudo} className="trade-match">
            <div className="trade-who">
              <strong>{m.pseudo}</strong>
              {m.region && <span className="muted small"> · {m.region}</span>}
            </div>
            {m.contact ? (
              <div className="small trade-contact">{t('trade.contactLabel')} <span className="trade-contact-value">{m.contact}</span></div>
            ) : (
              <div className="small muted">{t('trade.noContact')}</div>
            )}
            {m.theyHave.length > 0 && <TradeStrip title={t('trade.theyHave', { n: m.theyHave.length })} cards={m.theyHave} />}
            {m.theyWant.length > 0 && <TradeStrip title={t('trade.theyWant', { n: m.theyWant.length })} cards={m.theyWant} />}
          </div>
        ))
      )}
    </section>
  );
}

function TradeStrip({ title, cards }: { title: string; cards: TradeCard[] }) {
  const { openCard } = useApp();
  return (
    <div>
      <div className="small muted trade-strip-title">{title}</div>
      <div className="versions">
        {cards.map((c) => (
          <button key={`${c.id}-${c.tradeLang}`} className="version" onClick={() => openCard(c.id, c.tradeLang)}>
            <img src={cardImage(c, c.tradeLang)} alt={cardName(c, c.tradeLang)} loading="lazy" onError={hideBroken} />
            {c.extra > 1 && <span className="badge-owned">×{c.extra}</span>}
            <span className="version-label">{cardName(c, c.tradeLang)}</span>
            <span className="version-set muted">{c.number} · {c.tradeLang.toUpperCase()}</span>
            <span className="version-price">{formatEur(c.price.eur)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
