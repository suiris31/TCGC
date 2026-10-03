import { useEffect, useState } from 'react';
import { api, cardImage, cardImageLarge, cardName, formatDate, formatEur, type CardDetail, type Lang } from '../api';
import { t } from '../i18n';
import { useApp } from '../store';
import { hideBroken } from './CardGrid';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';
import { LineChart } from './LineChart';

export function CardDetailSheet() {
  const { openedCard, closeCard, openCard, cardChanged, toast, version } = useApp();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [zoom, setZoom] = useState(false);
  // Langue d'affichage : celle de l'exemplaire ouvert, modifiable sur la fiche
  const [lang, setLang] = useState<Lang>('fr');
  const openedId = openedCard?.id ?? null;

  useEffect(() => {
    if (openedCard) setLang(openedCard.lang);
  }, [openedCard]);

  useEffect(() => {
    if (openedId === null) {
      setCard(null);
      setZoom(false);
      return;
    }
    let cancelled = false;
    api.card(openedId).then((c) => { if (!cancelled) setCard(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [openedId, version]);

  useEffect(() => {
    if (openedCard === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCard();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openedCard, closeCard]);

  if (openedCard === null) return null;

  const setQty = async (qtyLang: Lang, quantity: number) => {
    if (!card) return;
    const res = await api.setQuantity(card.id, Math.max(0, quantity), qtyLang);
    cardChanged(res.card, res.totals);
    if (quantity <= 0) toast(t('detail.removed', { lang: qtyLang.toUpperCase() }));
  };

  const stats = card ? [
    [t('stat.rarity'), card.rarity],
    [t('stat.type'), card.type],
    [t('stat.color'), card.color],
    [t('stat.cost'), card.cost],
    [t('stat.power'), card.power],
    [t('stat.counter'), card.counter],
    [t('stat.life'), card.life],
    [t('stat.attribute'), card.attribute],
  ].filter(([, v]) => v) : [];

  return (
    <div className="sheet-backdrop" onClick={closeCard}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="sheet-close" onClick={closeCard} aria-label={t('common.close')}><Icon name="close" /></button>
        {!card ? (
          <div className="sheet-loading"><div className="spinner" /></div>
        ) : (
          <>
            <div className="detail-hero">
              <img key={lang} className={zoom ? 'detail-img detail-img-zoom' : 'detail-img'} src={cardImageLarge(card, lang)}
                alt={card.fullName} onClick={() => setZoom(!zoom)}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const fallback = cardImage(card, lang);
                  if (!img.src.endsWith(fallback)) img.src = fallback;
                }} />
            </div>

            <div className="detail-body">
              <div className="detail-title">
                <div className="detail-title-row">
                  <h2>{cardName(card, lang)}</h2>
                  <LangSwitch value={lang} onChange={setLang} compact label={t('detail.displayLang')} />
                </div>
                {cardName(card, lang === 'fr' ? 'en' : 'fr') !== cardName(card, lang) && (
                  <div className="muted small">{cardName(card, lang === 'fr' ? 'en' : 'fr')}</div>
                )}
                {lang === 'fr' && !card.imageFr && (
                  <div className="muted small">{t('detail.noFrImage')}</div>
                )}
                <div className="detail-sub">
                  <span className="chip chip-code">{card.number}</span>
                  {card.variant && <span className="chip chip-variant">{card.variant}</span>}
                  {card.rarity && <span className="chip">{card.rarity}</span>}
                </div>
                <div className="muted small">{card.setName}{card.releaseDate && ` · ${formatDate(card.releaseDate)}`}</div>
              </div>

              <div className="price-box">
                <div className="price-head">
                  <div className="price-main">{formatEur(card.price.eur)}</div>
                  <div className="muted small">
                    {card.price.source === 'cardmarket' ? t(`price.cm.${card.price.cardmarket!.basis}`)
                      : card.price.source === 'tcgplayer' ? t(`price.tcg.${card.price.tcgplayer!.basis}`)
                        : t('price.none')}
                  </div>
                </div>
                <dl className="price-lines">
                  {card.price.cardmarket && (
                    <>
                      <div><dt>{t('price.line.cmTrend')}</dt><dd>{formatEur(card.price.cardmarket.trend)}</dd></div>
                      <div><dt>{t('price.line.cmAvg30')}</dt><dd>{formatEur(card.price.cardmarket.avg30)}</dd></div>
                    </>
                  )}
                  {card.price.tcgplayer && (
                    <div><dt>{t('price.line.tcg')}</dt><dd>{formatEur(card.price.tcgplayer.eur)}</dd></div>
                  )}
                </dl>
                {card.price.cardmarket && (
                  <p className="muted small price-note">
                    {t('price.mixedLangs')}
                  </p>
                )}
              </div>

              <section className="owned-langs">
                <h3>{t('detail.inCollection')}</h3>
                {(['fr', 'en'] as const).map((l) => (
                  <div key={l} className="qty-row">
                    <span>{t(`lang.${l}`)}</span>
                    <div className="stepper">
                      <button onClick={() => setQty(l, card.ownedByLang[l] - 1)} disabled={card.ownedByLang[l] === 0}
                        aria-label={t('detail.removeCopy', { lang: l.toUpperCase() })}>
                        <Icon name="minus" size={18} />
                      </button>
                      <span className="stepper-value">{card.ownedByLang[l]}</span>
                      <button onClick={() => setQty(l, card.ownedByLang[l] + 1)} aria-label={t('detail.addCopy', { lang: l.toUpperCase() })}>
                        <Icon name="plus" size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </section>
              {card.owned > 1 && card.price.eur != null && (
                <div className="muted small right">{t('detail.total', { value: formatEur(card.price.eur * card.owned) })}</div>
              )}

              {card.history.length > 1 && (
                <section>
                  <h3>{t('detail.priceHistory')}</h3>
                  <LineChart points={card.history.filter((h) => h.eur != null).map((h) => ({ date: h.date, value: h.eur! }))} height={110} />
                </section>
              )}

              {card.versions.length > 0 && (
                <section>
                  <h3>{t('detail.otherVersions', { code: card.number })}</h3>
                  <div className="versions">
                    {card.versions.map((v) => (
                      <button key={v.id} className="version" onClick={() => openCard(v.id, lang)}>
                        <img src={cardImage(v, lang)} alt={v.fullName} loading="lazy" onError={hideBroken} />
                        {v.owned > 0 && <span className="badge-owned">×{v.owned}</span>}
                        <span className="version-label">{v.variant ?? t('common.standard')}</span>
                        <span className="version-set muted">{v.setCode}</span>
                        <span className="version-price">{formatEur(v.price.eur)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {stats.length > 0 && (
                <section>
                  <h3>{t('detail.characteristics')}</h3>
                  <dl className="stats-grid">
                    {stats.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
                  </dl>
                  {card.subtypes && <p className="muted small">{card.subtypes}</p>}
                  {card.description && <p className="card-text">{card.description}</p>}
                </section>
              )}

              <div className="links">
                {card.cardmarketUrl && (
                  <a href={card.cardmarketUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Cardmarket <Icon name="external" size={16} />
                  </a>
                )}
                {card.tcgplayerUrl && (
                  <a href={card.tcgplayerUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    TCGplayer <Icon name="external" size={16} />
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
