import { useEffect, useState } from 'react';
import { api, cardImage, cardName, formatDate, formatEur, type SharedCard, type SharedView } from '../api';
import { hideBroken } from '../components/CardGrid';
import { SearchInput } from '../components/Filters';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { t, type MessageKey } from '../i18n';
import { useApp } from '../store';

// Section de la page : les cartes proposées (doubles ou collection) et les cartes que le propriétaire cherche
type Section = 'offer' | 'wanted';
const keyOf = (section: Section, card: SharedCard) => `${section}:${card.id}:${card.lang}`;

function matches(card: SharedCard, q: string) {
  const text = `${card.name} ${card.nameFr ?? ''} ${card.number} ${card.setCode ?? ''} ${card.variant ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

const byNumber = (a: SharedCard, b: SharedCard) => a.number.localeCompare(b.number, 'en', { numeric: true }) || a.id - b.id;
const SORTS = {
  set: { label: 'sort.set', compare: (a: SharedCard, b: SharedCard) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || byNumber(a, b) },
  number: { label: 'sort.number', compare: byNumber },
  price: { label: 'sort.price', compare: (a: SharedCard, b: SharedCard) => (b.price ?? -1) - (a.price ?? -1) || byNumber(a, b) },
} satisfies Record<string, { label: MessageKey; compare: (a: SharedCard, b: SharedCard) => number }>;
type Sort = keyof typeof SORTS;

// Une carte dans le message envoyé : "OP14-018 Roronoa Zoro · Alternate Art (FR)"
function describe(card: SharedCard) {
  return `${card.number} ${cardName(card, card.lang)}${card.variant ? ` · ${card.variant}` : ''} (${card.lang.toUpperCase()})`;
}

// Page publique d'un lien de partage, sans compte : le visiteur coche les cartes qui l'intéressent (et celles qu'il a
// parmi les recherches du propriétaire), puis envoie sa sélection par le menu de partage du téléphone.
// Rien ne passe par le serveur.
export function SharedPage({ token }: { token: string }) {
  const { uiLang, setUiLang, toast } = useApp();
  const [view, setView] = useState<SharedView | 'missing' | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('set');
  const [manual, setManual] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    api.shared(token).then((v) => { if (!cancelled) setView(v); }).catch(() => { if (!cancelled) setView('missing'); });
    return () => { cancelled = true; };
  }, [token]);

  const header = (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">☠</span><span>{t('app.name')}</span></div>
      <LangSwitch value={uiLang} onChange={setUiLang} compact label={t('stats.uiLang')} />
    </header>
  );

  if (view === null) return <>{header}<div className="center"><div className="spinner" /></div></>;

  if (view === 'missing') {
    return (
      <>
        {header}
        <div className="page stack">
          <section className="panel stack-tight">
            <h3 className="flush">{t('shared.notFound.title')}</h3>
            <p className="muted flush">{t('shared.notFound.text')}</p>
          </section>
          <Cta />
        </div>
      </>
    );
  }

  const { pseudo } = view;
  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const offers = view.cards.filter((c) => matches(c, q)).sort(SORTS[sort].compare);
  const wanted = view.wanted.filter((c) => matches(c, q)).sort(SORTS[sort].compare);
  const pickedOffers = view.cards.filter((c) => selected.has(keyOf('offer', c)));
  const pickedWanted = view.wanted.filter((c) => selected.has(keyOf('wanted', c)));
  const pickedValue = view.showPrices ? pickedOffers.reduce((sum, c) => sum + (c.price ?? 0), 0) : null;

  // Message prêt à envoyer, dans la langue du visiteur
  const send = async () => {
    const lines: string[] = [];
    if (pickedOffers.length) {
      lines.push(t('shared.msg.intro', { pseudo }), ...pickedOffers.map((c) => `- ${describe(c)}`));
    }
    if (pickedWanted.length) {
      if (lines.length) lines.push('');
      lines.push(t(pickedOffers.length ? 'shared.msg.have' : 'shared.msg.haveOnly', { pseudo }), ...pickedWanted.map((c) => `- ${describe(c)}`));
    }
    const text = lines.join('\n');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('shared.copied', { pseudo }));
    } catch {
      setManual(text);
    }
  };

  const grid = (section: Section, cards: SharedCard[]) => (
    <div className="grid">
      {cards.map((c) => {
        const key = keyOf(section, c);
        return <SharedTile key={key} card={c} selected={selected.has(key)} showPrice={view.showPrices} onToggle={() => toggle(key)} />;
      })}
    </div>
  );

  return (
    <>
      {header}
      <div className={selected.size ? 'page stack shared shared-with-bar' : 'page stack shared'}>
        <div>
          <h2>{t(`shared.title.${view.scope}`, { pseudo })}</h2>
          <div className="muted small">
            {t('count.cards', { n: view.cards.reduce((sum, c) => sum + c.quantity, 0) })}
            {view.updatedAt && ` · ${t('shared.updated', { date: formatDate(view.updatedAt) })}`}
          </div>
          <p className="muted small">{t('shared.help', { pseudo })}</p>
        </div>

        {(view.cards.length > 0 || view.wanted.length > 0) ? (
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder={t('shared.search')} />
            <div className="toolbar-row">
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('common.sort')}>
                {Object.entries(SORTS).filter(([value]) => value !== 'price' || view.showPrices)
                  .map(([value, { label }]) => <option key={value} value={value}>{t(label)}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <p className="muted">{t('shared.empty')}</p>
        )}

        {wanted.length > 0 && (
          <section>
            <h3>{t('shared.wanted', { pseudo })}</h3>
            <p className="muted small shared-section-help">{t('shared.wantedHelp')}</p>
            {grid('wanted', wanted)}
          </section>
        )}

        {offers.length > 0 && (
          <section>
            <h3>{t(`shared.section.${view.scope}`)}</h3>
            {view.scope === 'doubles' && <p className="muted small shared-section-help">{t('shared.doublesHelp', { pseudo })}</p>}
            {grid('offer', offers)}
          </section>
        )}

        <Cta />
      </div>

      {selected.size > 0 && (
        <div className="shared-bar">
          <div className="small">
            <strong>{t('shared.selected', { n: selected.size })}</strong>
            {pickedValue != null && pickedOffers.length > 0 && <span className="muted"> · ≈ {formatEur(pickedValue)}</span>}
          </div>
          <div className="shared-bar-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>{t('shared.clear')}</button>
            <button className="btn btn-primary btn-sm" onClick={send}><Icon name="share" size={16} /> {t('shared.send')}</button>
          </div>
        </div>
      )}

      {manual && (
        <div className="sheet-backdrop" onClick={() => setManual(null)}>
          <div className="sheet manual-copy" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>{t('shared.copyManual', { pseudo })}</h3>
            <textarea readOnly value={manual} rows={Math.min(12, manual.split('\n').length + 1)} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-ghost btn-block" onClick={() => setManual(null)}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}

function SharedTile({ card, selected, showPrice, onToggle }: { card: SharedCard; selected: boolean; showPrice: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={selected ? 'tile shared-tile tile-selected' : 'tile shared-tile'} onClick={onToggle} aria-pressed={selected}>
      <div className="tile-img">
        <img src={cardImage(card, card.lang)} alt={cardName(card, card.lang)} loading="lazy" onError={hideBroken} />
        {card.quantity > 1 && <span className="badge-owned">×{card.quantity}</span>}
        <span className="badge-lang">{card.lang.toUpperCase()}</span>
        {selected && <span className="tile-check"><Icon name="check" size={18} /></span>}
      </div>
      <div className="tile-body">
        <div className="tile-name">{cardName(card, card.lang)}</div>
        <div className="tile-meta">
          <span>{card.number}</span>
          {card.variant && <span className="tile-variant">{card.variant}</span>}
        </div>
        {showPrice && <div className="tile-price">{formatEur(card.price)}</div>}
      </div>
    </button>
  );
}

// Invitation à découvrir l'appli : revient à l'accueil (connexion ou inscription)
function Cta() {
  return (
    <section className="panel stack-tight shared-cta">
      <p className="flush">{t('shared.cta')}</p>
      <a className="btn btn-ghost" href="#">{t('shared.ctaButton')}</a>
    </section>
  );
}
