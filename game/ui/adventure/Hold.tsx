// La Cale (tâche 1.18) : les cartes gagnées dans l'aventure, en grille (filtres par couleur, type, rareté, extension et
// version ; tris), avec le nombre d'exemplaires et le visuel de chaque version ; les boosters gagnés pas encore ouverts,
// à ouvrir d'un appui (tirage sur le serveur, puis l'écran d'ouverture) ; un résumé des taux de tirage. Depuis la tâche
// 2.6 : « Échanger mes doublons » (game/ui/economy/Duplicates.tsx) et le comptoir (Counter.tsx), aussi depuis une carte.
// Une carte de la Cale peut manquer du catalogue du navigateur (cartes SP d'autres extensions, cartes pas encore
// jouables) : son visuel vient alors du relais de l'appli (img-en-hd/<numéro>.webp), comme dans BoosterOpening.
// Depuis la tâche R3.5 : gabarit `Screen` du kit (« ← Carte »), lien vers la boutique quand aucun booster n'attend,
// filtres et tri repliés sur téléphone (« Filtres et tri »).
import { useMemo, useState, type ReactNode } from 'react';
import { findChapter } from '../../adventure/arcs.ts';
import { BOOSTER_SETS } from '../../boosters/sets/index.ts';
import { ECONOMY } from '../../economy/config.ts';
import { cardData } from '../../engine/cards/index.ts';
import type { Category, Color } from '../../engine/types.ts';
import { useDevice } from '../device.ts';
import { CounterScreen, counterPrice } from '../economy/Counter.tsx';
import { DuplicatesDialog, duplicateCount } from '../economy/Duplicates.tsx';
import { berry } from '../economy/Wallet.tsx';
import { useBoosterOpening } from '../economy/useBoosterOpening.ts';
import { Button, Screen } from '../kit/index.ts';
import { BACK } from '../texts.ts';
import { EffectText } from '../Zoom.tsx';
import { boosterChapter, holdByNumber, type HoldCard, type WonBooster } from './api.ts';
import { BoosterOpening } from './BoosterOpening.tsx';
import { CardImage } from './CardImage.tsx';
import {
  boosterRates, chanceText, filterChoices, filterHold, holdEntries, holdSummary, NO_FILTER, RARITY_LABELS, SORT_LABELS, sortHold, versionName,
  type HoldEntry, type HoldFilter, type HoldSort,
} from './hold.ts';
import { useHoldState } from './holdState.ts';

const COLORS: [Color, string][] = [['Red', 'Rouge'], ['Green', 'Vert'], ['Blue', 'Bleu'], ['Purple', 'Violet'], ['Black', 'Noir'], ['Yellow', 'Jaune']];
const CATEGORIES: [Category, string][] = [['LEADER', 'Leaders'], ['CHARACTER', 'Personnages'], ['EVENT', 'Événements'], ['STAGE', 'Lieux']];
const CATEGORY_ONE: Record<Category, string> = { LEADER: 'Leader', CHARACTER: 'Personnage', EVENT: 'Événement', STAGE: 'Lieu' };
const COLOR_FR = Object.fromEntries(COLORS) as Record<Color, string>;
const PAGE = 90;
export const FREE_NOTICE = 'Boosters virtuels gratuits, sans valeur réelle, ni échangeables ni revendables.';

// D'où vient un booster gagné (« Gagné à Orange Town »)
function boosterOrigin(b: WonBooster): string {
  const chapter = boosterChapter(b.source);
  const found = chapter ? findChapter(chapter) : undefined;
  return found ? `Gagné à ${found.chapter.place}` : b.source;
}

// ---------- L'écran, relié au serveur ----------

// onShop : ouvre la boutique (lien du message « Pas de booster à ouvrir »)
export function HoldScreen({ onBack, onShop }: { onBack: () => void; onShop?: () => void }) {
  const { data, error, reload } = useHoldState();
  // Ouverture (tâche R3.6) : chaque booster est tiré sur le serveur au moment où on l'ouvre ; ceux qu'on n'ouvre pas
  // restent ici. La Cale est relue après.
  const opening = useBoosterOpening({ onDone: () => void reload() });
  // comptoir ouvert (focus : la carte d'où l'on vient) ; fenêtre d'échange des doublons
  const [counter, setCounter] = useState<{ focus?: string } | null>(null);
  const [duplicates, setDuplicates] = useState(false);

  if (opening.props) return <BoosterOpening {...opening.props} />;
  if (counter) return <CounterScreen focus={counter.focus} back={BACK.hold} onBack={() => { setCounter(null); void reload(); }} />;
  if (!data) {
    return (
      <HoldFrame onBack={onBack}>
        {error
          ? <p className="danger">{error} <Button variant="secondary" icon="retry" onClick={() => void reload()}>Réessayer</Button></p>
          : <p className="op-muted"><span className="op-spinner" /> Chargement de ta Cale…</p>}
      </HoldFrame>
    );
  }
  return (
    <>
      <HoldView cards={data.cards} boosters={data.adventure.boosters} onBack={onBack} onShop={onShop} opening={opening.busy}
        onOpen={(ids) => void opening.start(data.adventure.boosters.filter((b) => ids.includes(b.id)))}
        notice={opening.error ?? error} onDuplicates={() => setDuplicates(true)} onCounter={(focus) => setCounter({ focus })} />
      {duplicates && <DuplicatesDialog onClose={() => setDuplicates(false)} onExchanged={() => void reload()} />}
    </>
  );
}

// L'écran de la Cale : en-tête du kit (retour à la carte, résumé du contenu en sous-titre), contenu qui défile
function HoldFrame({ onBack, summary, children }: { onBack: () => void; summary?: string; children: ReactNode }) {
  return (
    <Screen className="op-adv-screen" data-ui="hold" title="Ma Cale" subtitle={summary}
      back={{ label: BACK.map, onBack, 'data-ui': 'hold.back' }}>
      <div className="op-adv-page op-hold">{children}</div>
    </Screen>
  );
}

// ---------- L'écran, sans serveur (aussi pour l'atelier) ----------

// onDuplicates : bouton « Échanger mes doublons » ; onCounter : comptoir (focus : carte à y chercher) ; onShop : boutique
export function HoldView({ cards, boosters, onBack, onShop, onOpen, opening = false, notice, onDuplicates, onCounter }: {
  cards: HoldCard[];
  boosters: WonBooster[];
  onBack: () => void;
  onShop?: () => void;
  onOpen: (ids: string[]) => void;
  opening?: boolean;
  notice?: string | null;
  onDuplicates?: () => void;
  onCounter?: (focus?: string) => void;
}) {
  const entries = useMemo(() => holdEntries(cards), [cards]);
  const owned = useMemo(() => holdByNumber(cards), [cards]);
  const extra = useMemo(() => duplicateCount(cards), [cards]);
  const choices = useMemo(() => filterChoices(entries), [entries]);
  const [filter, setFilter] = useState<HoldFilter>(NO_FILTER);
  const [sort, setSort] = useState<HoldSort>('number');
  const [limit, setLimit] = useState(PAGE);
  const [zoom, setZoom] = useState<HoldEntry | null>(null);
  const [rates, setRates] = useState(false);
  // téléphone : les filtres et le tri sont repliés derrière un bouton (la recherche reste visible)
  const { compact } = useDevice();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const shown = sortHold(filterHold(entries, filter), sort);
  const sum = holdSummary(entries);
  const set = (patch: Partial<HoldFilter>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const filtered = Object.entries(filter).some(([, v]) => v !== '');
  const active = Object.entries(filter).filter(([k, v]) => k !== 'q' && v !== '').length + (sort !== 'number' ? 1 : 0);
  const folded = compact && !filtersOpen;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

  return (
    <HoldFrame onBack={onBack} summary={sum.cards
      ? `${plural(sum.cards, 'carte')} · ${plural(sum.kinds, 'sorte')}${sum.special ? ` · ${plural(sum.special, 'version')} spéciale${sum.special > 1 ? 's' : ''}` : ''}`
      : undefined}>

      <section className="op-hold-boosters">
        {boosters.length > 0 ? (
          <>
            <div className="op-hold-boosters-head">
              <h2>{boosters.length > 1 ? `${boosters.length} boosters à ouvrir` : 'Un booster à ouvrir'}</h2>
              {boosters.length > 1 && (
                <button className="op-btn op-btn-primary" disabled={opening} onClick={() => onOpen(boosters.map((b) => b.id))} data-ui="hold.open-all">
                  {opening ? 'Ouverture…' : `Tout ouvrir (${boosters.length})`}
                </button>
              )}
            </div>
            <div className="op-hold-packs">
              {boosters.map((b) => (
                <div key={b.id} className="op-hold-pack">
                  <span className="op-hold-pack-art" aria-hidden="true"><span>{b.set}</span></span>
                  <span className="op-hold-pack-text">
                    <strong>Booster {b.set}</strong>
                    <span className="op-small op-muted">{boosterOrigin(b)}</span>
                  </span>
                  <button className="op-btn op-btn-ghost btn-small" disabled={opening} onClick={() => onOpen([b.id])}>Ouvrir</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="op-small op-muted op-hold-noboosters">
            Pas de booster à ouvrir : chaque première victoire d’un chapitre en rapporte, ou{' '}
            {onShop ? <button className="op-link op-small" data-ui="hold.shop" onClick={onShop}>achète-en à la boutique</button> : 'achète-en à la boutique'}.
          </p>
        )}
        <p className="op-small op-muted op-hold-legal">
          {FREE_NOTICE} <button className="op-link op-small" onClick={() => setRates(true)}>Taux de tirage</button>
        </p>
        {notice && <p className="danger op-small">{notice}</p>}
      </section>

      <section className="op-hold-cards">
        {(onDuplicates || onCounter) && entries.length > 0 && (
          <div className="op-hold-actions">
            {onDuplicates && (
              <button className="op-btn op-btn-ghost" onClick={onDuplicates} disabled={extra === 0}
                aria-label={extra ? `Échanger mes doublons : ${plural(extra, 'exemplaire')} en trop` : undefined}
                title={extra ? `${plural(extra, 'exemplaire')} au-delà de ${ECONOMY.duplicates.keep} : à échanger contre des Berry` : `Aucune carte en plus de ${ECONOMY.duplicates.keep} exemplaires`}>
                ♻️ Échanger mes doublons{extra > 0 && <> <span className="op-hold-actions-count" aria-hidden="true">{extra}</span></>}
              </button>
            )}
            {onCounter && (
              <button className="op-btn op-btn-ghost" onClick={() => onCounter()} title="Un exemplaire de plus d’une carte déjà trouvée">
                🏪 Comptoir
              </button>
            )}
          </div>
        )}
        {entries.length > 0 && <div className={`db-filters op-hold-filters${folded ? ' is-folded' : ''}`}>
          <input className="db-search" value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Nom ou numéro" aria-label="Rechercher une carte" />
          {compact && (
            <Button variant="secondary" className="op-hold-filters-toggle" aria-expanded={filtersOpen} data-ui="hold.filters"
              onClick={() => setFiltersOpen((o) => !o)}>
              {filtersOpen ? 'Masquer les filtres' : `Filtres et tri${active ? ` (${active})` : ''}`}
            </Button>
          )}
          {!folded && <>
            <select value={filter.color} onChange={(e) => set({ color: e.target.value as Color | '' })} aria-label="Couleur">
              <option value="">Toutes couleurs</option>
              {COLORS.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
            </select>
            <select value={filter.category} onChange={(e) => set({ category: e.target.value as Category | '' })} aria-label="Type de carte">
              <option value="">Tous types</option>
              {CATEGORIES.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
            </select>
            <select value={filter.rarity} onChange={(e) => set({ rarity: e.target.value })} aria-label="Rareté">
              <option value="">Toutes raretés</option>
              {choices.rarities.map((r) => <option key={r} value={r}>{RARITY_LABELS[r] ?? r} ({r})</option>)}
            </select>
            <select value={filter.set} onChange={(e) => set({ set: e.target.value })} aria-label="Extension">
              <option value="">Toutes extensions</option>
              {choices.sets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filter.version} onChange={(e) => set({ version: e.target.value as HoldFilter['version'] })} aria-label="Version">
              <option value="">Toutes versions</option>
              <option value="base">Normales</option>
              <option value="special">Spéciales (parallèles, SP)</option>
            </select>
            <label className="op-hold-sort">
              <span className="op-small op-muted">Tri</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as HoldSort)} aria-label="Trier par">
                {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          </>}
        </div>}
        {entries.length === 0 ? (
          <div className="history-empty">
            <p>Ta Cale est vide.</p>
            <p className="op-muted op-small">Prends la mer depuis la carte du monde : ton deck de départ et les cartes de tes boosters arriveront ici.</p>
          </div>
        ) : (
          <>
            <p className="op-small op-muted">
              {shown.length === entries.length ? plural(shown.length, 'impression') : `${shown.length} sur ${entries.length} impressions`}
              {filtered && <> · <button className="op-link op-small" onClick={() => set(NO_FILTER)}>tout afficher</button></>}
            </p>
            <div className="op-hold-grid">
              {shown.slice(0, limit).map((e) => (
                <button key={`${e.number}|${e.variant}`} className={`op-hold-card${e.variant !== 'base' ? ' is-special' : ''}`} onClick={() => setZoom(e)}
                  title={`${e.name} · ${e.number}${e.variant !== 'base' ? ` · ${versionName(e.variant)}` : ''}`}>
                  <span className="op-hold-img">
                    <CardImage entry={e} />
                    <span className="op-hold-count">×{e.count}</span>
                    {e.variant !== 'base' && <span className="op-hold-variant">✦ {versionName(e.variant)}</span>}
                    {!e.playable && <span className="op-hold-todo" title="Le jeu ne sait pas encore la jouer">⏳ bientôt</span>}
                  </span>
                  <span className="op-hold-name">{e.name}</span>
                  <span className="op-small op-muted">{e.known ? `${e.number} · ${e.rarity}` : e.rarity}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <p className="op-muted">Aucune carte de ta Cale ne correspond à ces filtres.</p>}
            {shown.length > limit && <button className="op-btn op-btn-ghost db-more" onClick={() => setLimit((l) => l + PAGE)}>Afficher plus ({shown.length - limit})</button>}
          </>
        )}
      </section>

      {zoom && <HoldCardZoom entry={zoom} owned={owned[zoom.number] ?? 0} onClose={() => setZoom(null)}
        onCounter={onCounter && (() => { setZoom(null); onCounter(zoom.number); })} />}
      {rates && <BoosterRates sets={[...new Set(boosters.map((b) => b.set))]} onClose={() => setRates(false)} />}
    </HoldFrame>
  );
}

// ---------- Une carte en grand ----------

// owned : exemplaires de la carte, toutes versions ; onCounter : en acheter un de plus au comptoir
function HoldCardZoom({ entry, owned, onClose, onCounter }: { entry: HoldEntry; owned: number; onClose: () => void; onCounter?: () => void }) {
  const d = cardData()[entry.number];
  const price = counterPrice(entry.number);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box op-hold-zoom" onClick={(e) => e.stopPropagation()}>
        <CardImage entry={entry} className="op-hold-zoom-img" />
        <div className="op-hold-zoom-text">
          <header className="db-row"><h3>{entry.name}</h3><span className="db-grow" /><button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button></header>
          <p className="op-small op-muted">
            {entry.known && `${entry.number} · `}{RARITY_LABELS[entry.rarity] ?? entry.rarity}
            {entry.category && ` · ${CATEGORY_ONE[entry.category]}`}
            {entry.colors.length > 0 && ` · ${entry.colors.map((c) => COLOR_FR[c]).join('/')}`}
            {entry.cost !== null && entry.category !== 'LEADER' && ` · coût ${entry.cost}`}
          </p>
          <p><b>×{entry.count}</b> dans ta Cale{entry.variant !== 'base' && <> · version <b>{versionName(entry.variant)}</b></>}</p>
          {d && d.effect && d.effect !== '-' && <p className="zoom-effect"><EffectText text={d.effect} /></p>}
          {d?.trigger && <p className="zoom-effect"><span className="kw">[Déclenchement]</span> <EffectText text={d.trigger} /></p>}
          <p className="op-small op-muted">{entry.playable
            ? 'Elle peut aller dans ton deck d’aventure (toutes versions confondues, 4 exemplaires au plus).'
            : 'Le jeu ne sait pas encore la jouer : elle ne peut pas encore aller dans un deck.'}</p>
          {onCounter && price !== undefined && owned < ECONOMY.counter.max && (
            <button className="op-btn op-btn-ghost op-hold-zoom-counter" onClick={onCounter}>
              🏪 Un exemplaire de plus au comptoir · {berry(price)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Taux de tirage (résumé de game/docs/boosters.md, calculé depuis la description des boosters) ----------

export function BoosterRates({ sets, onClose }: { sets: string[]; onClose: () => void }) {
  const list = (sets.length ? sets : Object.keys(BOOSTER_SETS)).filter((s) => BOOSTER_SETS[s]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box op-rates" onClick={(e) => e.stopPropagation()}>
        <header className="db-row"><h3>Taux de tirage</h3><span className="db-grow" /><button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button></header>
        {list.map((s) => {
          const r = boosterRates(s)!;
          return (
            <section key={s} className="op-rates-set">
              <h4>Booster {s}</h4>
              <p className="op-small">{r.composition}.</p>
              <table className="op-rates-table">
                <thead><tr><th>Dans un booster</th><th>Chance</th></tr></thead>
                <tbody>
                  {r.rates.map((x) => (
                    <tr key={x.label} className={x.label.startsWith('dont ') ? 'op-rates-sub' : undefined}><td>{x.label}</td><td>{chanceText(x.chance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        <p className="op-small op-muted">
          Ce sont les taux d’un vrai booster en anglais : Bandai ne les publie pas, ils sont estimés d’après des comptages
          publiés par des joueurs. Le tirage se fait sur le serveur, au hasard : personne ne peut le choisir ni le prévoir.
        </p>
        <p className="op-small op-muted">{FREE_NOTICE}</p>
      </div>
    </div>
  );
}
