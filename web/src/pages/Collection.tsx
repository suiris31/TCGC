import { useEffect, useState } from 'react';
import { api, formatEur, type Card, type Lang, type SetSummary } from '../api';
import { CardGrid, hideBroken } from '../components/CardGrid';
import { ColorSelect, SearchInput, SetSelect } from '../components/Filters';
import { Icon } from '../components/Icon';
import { locale, t, type MessageKey } from '../i18n';
import { readPref, writePref } from '../prefs';
import { useApp } from '../store';
import { useCards } from '../useCards';
import { Wishlist } from './Wishlist';

const VIEWS = ['sets', 'cards', 'wishlist'] as const;
type View = typeof VIEWS[number];

// Un set ouvert a sa propre adresse (#collection/set/<id>) : le bouton retour du téléphone ramène à la liste
function setFromHash() {
  const m = window.location.hash.match(/^#collection\/set\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function Collection({ onScan, onBrowse }: { onScan: () => void; onBrowse: () => void }) {
  const { totals, status } = useApp();
  const [view, setView] = useState<View>(() => readPref('tcgc.collectionView', VIEWS, 'sets'));
  const reached = status?.wishlist.reached ?? 0;
  const [setId, setSetId] = useState<number | null>(setFromHash);

  useEffect(() => {
    const onHash = () => setSetId(setFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (totals && totals.cards === 0 && setId === null) {
    return (
      <div className="empty">
        <div className="empty-art">☠</div>
        <h2>{t('collection.empty.title')}</h2>
        <p className="muted">{t('collection.empty.text')}</p>
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onScan}><Icon name="camera" size={18} /> {t('collection.empty.scan')}</button>
          <button className="btn btn-ghost" onClick={onBrowse}><Icon name="search" size={18} /> {t('collection.empty.browse')}</button>
        </div>
      </div>
    );
  }

  if (setId !== null) {
    return <SetDetail setId={setId} onBack={() => { window.location.hash = 'collection'; }} />;
  }

  const changeView = (next: View) => {
    setView(next);
    writePref('tcgc.collectionView', next);
  };

  return (
    <div className="page">
      <div className="segmented segmented-3 view-switch" role="tablist">
        {VIEWS.map((value) => (
          <button key={value} role="tab" aria-selected={view === value}
            className={view === value ? 'segment segment-on' : 'segment'} onClick={() => changeView(value)}>
            {t(`collection.view.${value}`)}
            {value === 'wishlist' && reached > 0 && <span className="segment-badge">{reached}</span>}
          </button>
        ))}
      </div>
      {view === 'sets' && <SetList onOpen={(id) => { window.location.hash = `collection/set/${id}`; }} />}
      {view === 'cards' && <AllCards />}
      {view === 'wishlist' && <Wishlist />}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span>{children}</span>
    </label>
  );
}

// "58 %" en français, "58%" en anglais
function formatPercent(ratio: number) {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}

function Progress({ owned, total }: { owned: number; total: number }) {
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={owned}>
      <div style={{ width: `${total ? (100 * owned) / total : 0}%` }} />
    </div>
  );
}

// ---------- Liste des sets ----------

const SET_LIST_SORTS = {
  recent: { label: 'sets.sort.recent', compare: (a: SetSummary, b: SetSummary) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') },
  code: { label: 'sets.sort.code', compare: (a: SetSummary, b: SetSummary) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'fr', { numeric: true }) },
  value: { label: 'sets.sort.value', compare: (a: SetSummary, b: SetSummary) => b.valueEur - a.valueEur },
  progress: { label: 'sets.sort.progress', compare: (a: SetSummary, b: SetSummary) => b.owned / Math.max(1, b.total) - a.owned / Math.max(1, a.total) },
} satisfies Record<string, { label: MessageKey; compare: (a: SetSummary, b: SetSummary) => number }>;
type SetListSort = keyof typeof SET_LIST_SORTS;

function SetList({ onOpen }: { onOpen: (id: number) => void }) {
  const { version } = useApp();
  const [showAll, setShowAll] = useState(() => readPref('tcgc.allSets', ['1', '0'] as const, '0') === '1');
  const [sort, setSort] = useState<SetListSort>(() =>
    readPref('tcgc.setSort', Object.keys(SET_LIST_SORTS) as SetListSort[], 'recent'));
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const sorted = sets && [...sets].sort(SET_LIST_SORTS[sort].compare);

  useEffect(() => {
    let cancelled = false;
    api.collectionSets(showAll).then((s) => { if (!cancelled) setSets(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [version, showAll]);

  return (
    <>
      <div className="list-head">
        <select className="select" value={sort} aria-label={t('sets.sort')}
          onChange={(e) => { setSort(e.target.value as SetListSort); writePref('tcgc.setSort', e.target.value); }}>
          {Object.entries(SET_LIST_SORTS).map(([value, { label }]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
        <Toggle checked={showAll} onChange={(v) => { setShowAll(v); writePref('tcgc.allSets', v ? '1' : '0'); }}>
          {t('sets.showAll')}
        </Toggle>
      </div>
      {!sets && <div className="center"><div className="spinner" /></div>}
      <div className="set-grid">
        {sorted?.map((s) => <SetTile key={s.id} set={s} onOpen={() => onOpen(s.id)} />)}
      </div>
    </>
  );
}

function SetTile({ set, onOpen }: { set: SetSummary; onOpen: () => void }) {
  const { lang } = useApp();
  const cover = set.cover;
  const coverLang: Lang = cover?.ownedLang ?? lang;
  const image = cover && (coverLang === 'fr' ? (cover.imageFr ?? cover.image) : cover.image);
  return (
    <button className="set-tile" onClick={onOpen}>
      <div className={cover?.ownedLang ? 'set-cover' : 'set-cover set-cover-missing'}>
        {image && <img src={image} alt="" loading="lazy" onError={hideBroken} />}
        <span className="set-code">{set.code ?? set.name}</span>
      </div>
      <div className="set-body">
        <div className="set-name">{set.name}</div>
        <div className="set-count">
          <strong>{set.owned}</strong><span className="muted"> / {set.total}</span>
          {set.owned === set.total && set.total > 0 && <span className="set-complete"> ✓</span>}
        </div>
        <Progress owned={set.owned} total={set.total} />
        <div className="set-value">{formatEur(set.valueEur)}</div>
      </div>
    </button>
  );
}

// ---------- Cartes d'un set ----------

const SET_SORTS = [
  ['number', 'sort.number'],
  ['price', 'sort.price'],
  ['price-asc', 'sort.priceAsc'],
  ['color', 'sort.color'],
  ['rarity', 'sort.rarity'],
  ['name', 'sort.name'],
] as const satisfies readonly (readonly [string, MessageKey])[];

const SET_FILTERS = ['all', 'owned', 'missing'] as const;
type SetFilter = typeof SET_FILTERS[number];

// Cartes affichées dans un set ; reprend l'ancien réglage « Cartes manquantes » (interrupteur) s'il existe
function readSetFilter(): SetFilter {
  const legacy = readPref('tcgc.showMissing', ['1', '0'] as const, '1') === '0' ? 'owned' : 'all';
  return readPref('tcgc.setFilter', SET_FILTERS, legacy);
}

// Nombre de cartes les plus chères mises à part dans le coût pour compléter un set
const TOP_MISSING = 3;

function SetDetail({ setId, onBack }: { setId: number; onBack: () => void }) {
  const { version, lang, toast, wishChanged } = useApp();
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [missing, setMissing] = useState<Card[] | null>(null);
  const [filter, setFilter] = useState<SetFilter>(readSetFilter);
  const [sort, setSort] = useState('number');
  const [wishing, setWishing] = useState(false);
  const { cards, total, loading, hasMore, loadMore } = useCards(
    { set: String(setId), sort, status: filter === 'all' ? undefined : filter },
    { pageSize: 250 },
  );

  useEffect(() => {
    let cancelled = false;
    api.collectionSets(true).then((list) => { if (!cancelled) setSummary(list.find((s) => s.id === setId) ?? null); }).catch(() => {});
    // Cartes manquantes, de la plus chère à la moins chère : coût pour compléter le set
    api.cards({ set: String(setId), status: 'missing', sort: 'price', limit: 500 })
      .then((res) => { if (!cancelled) setMissing(res.cards); }).catch(() => {});
    return () => { cancelled = true; };
  }, [setId, version]);

  const missingTotal = missing?.reduce((sum, c) => sum + (c.price.eur ?? 0), 0) ?? 0;
  const withoutTop = missing?.slice(TOP_MISSING).reduce((sum, c) => sum + (c.price.eur ?? 0), 0) ?? 0;
  const notWished = missing?.filter((c) => !c.wish).length ?? 0;

  const wishAll = async () => {
    setWishing(true);
    try {
      const { added } = await api.wishMissing(setId, lang);
      wishChanged();
      toast(t('set.wishedMissing', { n: added }));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setWishing(false);
    }
  };

  useEffect(() => { window.scrollTo(0, 0); }, [setId]);

  return (
    <div className="page">
      <div className="set-header">
        <button className="back-btn" onClick={onBack}><span aria-hidden="true">‹</span> {t('set.back')}</button>
        <h2>{summary?.code ?? '…'} <span className="muted set-header-name">{summary?.name}</span></h2>
        {summary && (
          <>
            <div className="set-header-stats">
              <span><strong>{summary.owned}</strong>{t('set.ofTotal', { total: summary.total })}</span>
              <span>{formatPercent(summary.owned / Math.max(1, summary.total))}</span>
              <span>{t('count.copies', { n: summary.copies })}</span>
              <span className="set-header-value">{formatEur(summary.valueEur)}</span>
            </div>
            <Progress owned={summary.owned} total={summary.total} />
          </>
        )}
        {missing && missing.length > 0 && (
          <div className="set-missing">
            <div>
              <strong>{t('set.missing', { n: missing.length })}</strong>
              <span className="muted"> · {t('set.missingValue', { value: formatEur(missingTotal, true) })}</span>
            </div>
            {missing.length > TOP_MISSING + 2 && (
              <div className="muted small">{t('set.missingWithoutTop', { value: formatEur(withoutTop, true), n: TOP_MISSING })}</div>
            )}
            {notWished > 0 ? (
              <button className="btn btn-ghost btn-sm" onClick={wishAll} disabled={wishing}>
                <span aria-hidden="true">☆</span> {t('set.wishMissing', { n: notWished })}
              </button>
            ) : (
              <div className="muted small"><span aria-hidden="true">★</span> {t('set.allWished')}</div>
            )}
          </div>
        )}
      </div>

      <div className="list-head">
        <select className="select" value={filter} aria-label={t('set.filter')}
          onChange={(e) => { setFilter(e.target.value as SetFilter); writePref('tcgc.setFilter', e.target.value); }}>
          {SET_FILTERS.map((value) => <option key={value} value={value}>{t(`set.filter.${value}`)}</option>)}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('common.sort')}>
          {SET_SORTS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </div>

      {loading && cards.length === 0 && <div className="center"><div className="spinner" /></div>}
      {!loading && total === 0 && filter === 'owned' && <p className="muted center-text">{t('set.empty')}</p>}
      <CardGrid cards={cards} quickAdd dimMissing langMode="owned" />
      {hasMore && <button className="btn btn-ghost btn-block" onClick={loadMore} disabled={loading}>{t('common.loadMore')}</button>}
    </div>
  );
}

// ---------- Toutes les cartes possédées ----------

const ALL_SORTS = [
  ['price', 'sort.price'],
  ['price-asc', 'sort.priceAsc'],
  ['number', 'sort.number'],
  ['set', 'sort.set'],
  ['color', 'sort.color'],
  ['rarity', 'sort.rarity'],
  ['name', 'sort.name'],
  ['added', 'sort.added'],
] as const satisfies readonly (readonly [string, MessageKey])[];

function AllCards() {
  const [q, setQ] = useState('');
  const [set, setSet] = useState('');
  const [color, setColor] = useState('');
  const [sort, setSort] = useState(() => readPref('tcgc.collectionSort', ALL_SORTS.map(([v]) => v), 'price'));
  const [lang, setLang] = useState<Lang | ''>('');
  const { cards, total, loading, hasMore, loadMore } = useCards({ owned: true, q, set, color, lang, sort }, { debounce: 250 });

  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder={t('collection.search')} />
        <div className="toolbar-row">
          <select className="select" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); writePref('tcgc.collectionSort', e.target.value); }}
            aria-label={t('common.sort')}>
            {ALL_SORTS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
          <SetSelect value={set} onChange={setSet} ownedOnly />
          <ColorSelect value={color} onChange={setColor} />
          <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang | '')} aria-label={t('lang.label')}>
            <option value="">{t('lang.all')}</option>
            <option value="fr">{t('lang.fr')}</option>
            <option value="en">{t('lang.en')}</option>
          </select>
        </div>
      </div>
      <div className="count muted small">{t('count.entries', { n: total })}</div>
      <CardGrid cards={cards} />
      {loading && cards.length === 0 && <div className="center"><div className="spinner" /></div>}
      {hasMore && <button className="btn btn-ghost btn-block" onClick={loadMore} disabled={loading}>{t('common.loadMore')}</button>}
    </>
  );
}
