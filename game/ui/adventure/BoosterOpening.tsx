// Ouverture des boosters (tâche 1.6) : un paquet dessiné par nous, qu'on déchire d'un geste ou qu'on ouvre d'un clic ;
// les cartes sortent face cachée et se retournent une à une, avec un effet selon leur rareté ; puis un récapitulatif
// trié par rareté (« Nouveau ! », doubles). Plusieurs boosters (un display) : « Un par un » ou « Tout ouvrir », avec un
// récapitulatif groupé.
// Ni appel au serveur ni Cale : l'écran reçoit le contenu déjà tiré (le tirage se fait sur le serveur) et les cartes que
// le joueur avait avant l'ouverture. Il respecte le réglage des sons du jeu et « Animations réduites ».
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { DISPLAY_SIZE } from '../../boosters/open.ts';
import type { BoosterContent, PulledCard } from '../../boosters/types.ts';
import { cardData } from '../../engine/cards/index.ts';
import { useDevice } from '../device.ts';
import { cardImage } from '../images.ts';
import { useReducedMotion, useSettings } from '../settings.ts';
import { boosterSfx, setSoundEnabled, type BoosterSfx } from '../sound.ts';

export interface BoosterOpeningProps {
  content: BoosterContent | BoosterContent[];
  // exemplaires que le joueur avait dans sa Cale AVANT l'ouverture, par clé ownedKey (voir ownedCounts) ; sans cette
  // information, aucune carte n'est marquée « Nouveau ! »
  owned?: Record<string, number>;
  onDone: () => void;
  // false : ouverture sobre, sans mouvement, comme avec « Animations réduites »
  animations?: boolean;
}

// Clé d'une impression dans `owned` : le numéro pour la version de base, « numéro|version » pour les autres (une
// parallèle d'une carte déjà possédée est donc une nouvelle carte)
export const ownedKey = (c: { number: string; variant: string }) => (c.variant === 'base' ? c.number : `${c.number}|${c.variant}`);

// `owned` à partir du contenu de la Cale (GET /api/game/inventory)
export function ownedCounts(cards: { number: string; variant: string; count: number }[]): Record<string, number> {
  const owned: Record<string, number> = {};
  for (const c of cards) owned[ownedKey(c)] = (owned[ownedKey(c)] ?? 0) + c.count;
  return owned;
}

// Durées des animations (ms), accordées à celles de styles.css
const OPENING = 900;    // le paquet se déchire
const RISE = 380;       // la première carte sort du paquet
const SUSPENSE = 750;   // une belle carte tremble avant de se retourner
const FLIP = 520;       // une carte se retourne
const CASCADE = 70;     // « Tout révéler » : écart entre deux cartes de la bande
const BURST = 1300;     // « Tout ouvrir » : les paquets s'ouvrent ensemble

// ---------- Raretés et versions ----------

// Force de l'effet : sobre (C, UC), lueur (R), grand effet (Leader, SR, versions spéciales), le plus grand (SEC, manga)
type Tier = 'common' | 'rare' | 'leader' | 'super' | 'secret';

const special = (c: PulledCard) => c.variant !== 'base' || c.rarity === 'SP CARD';

function tierOf(c: PulledCard): Tier {
  if (c.rarity === 'SEC' || c.variant === 'manga') return 'secret';
  if (c.rarity === 'SR' || special(c)) return 'super';
  if (c.rarity === 'L') return 'leader';
  return c.rarity === 'C' || c.rarity === 'UC' ? 'common' : 'rare';
}

const isBig = (t: Tier) => t === 'leader' || t === 'super' || t === 'secret';

function revealSound(c: PulledCard): BoosterSfx | null {
  const t = tierOf(c);
  if (t === 'secret') return 'secret';
  if (special(c)) return 'special';
  if (isBig(t)) return 'super';
  return t === 'rare' ? 'shine' : null;
}

// Classement pour le récapitulatif (les plus belles d'abord) et le choix de la carte mise en avant ; versions connues
// du générateur (game/boosters, tâche 1.5), une version inconnue compte comme une parallèle
const RARITIES = ['C', 'UC', 'R', 'L', 'SR', 'SEC', 'SP CARD'];
const VARIANTS = ['base', 'parallele', 'sp', 'manga'];
const rank = (list: string[], value: string, unknown: number) => (list.includes(value) ? list.indexOf(value) : unknown);
const score = (c: PulledCard) => rank(VARIANTS, c.variant, 1) * 10 + rank(RARITIES, c.rarity, 2);

const RARITY_LABELS: Record<string, string> = {
  C: 'Commune', UC: 'Peu commune', R: 'Rare', L: 'Leader', SR: 'Super rare', SEC: 'Secrète rare', 'SP CARD': 'Carte SP',
};
const VARIANT_LABELS: Record<string, string> = { parallele: 'Parallèle', manga: 'Parallèle manga', sp: 'Carte SP' };

function rarityText(c: PulledCard): string {
  const rarity = RARITY_LABELS[c.rarity] ?? c.rarity;
  const variant = c.variant === 'base' ? '' : VARIANT_LABELS[c.variant] ?? 'Version spéciale';
  return variant && variant !== rarity ? `${rarity} · ${variant}` : rarity;
}

// Nom affiché : celui du catalogue chargé dans le navigateur (cartes jouables), sinon le numéro
const cardName = (c: PulledCard) => cardData()[c.number]?.name ?? c.number;
// Numéro et rareté, sans répéter le numéro quand il tient lieu de nom
const details = (c: PulledCard) => (cardName(c) === c.number ? rarityText(c) : `${c.number} · ${rarityText(c)}`);

// Rubriques du récapitulatif, dans l'ordre (une carte va dans la première qui lui correspond)
const SECTIONS: { title: string; short: string; tier: string; test: (c: PulledCard) => boolean }[] = [
  { title: 'Versions spéciales', short: 'Spéciales', tier: 'op-bo-t-super op-bo-foil', test: special },
  { title: 'Secrètes rares', short: 'SEC', tier: 'op-bo-t-secret', test: (c) => c.rarity === 'SEC' },
  { title: 'Super rares', short: 'SR', tier: 'op-bo-t-super', test: (c) => c.rarity === 'SR' },
  { title: 'Leaders', short: 'Leaders', tier: 'op-bo-t-leader', test: (c) => c.rarity === 'L' },
  { title: 'Rares', short: 'R', tier: 'op-bo-t-rare', test: (c) => c.rarity === 'R' },
  { title: 'Peu communes', short: 'UC', tier: 'op-bo-t-common', test: (c) => c.rarity === 'UC' },
  { title: 'Communes', short: 'C', tier: 'op-bo-t-common', test: (c) => c.rarity === 'C' },
  { title: 'Autres', short: 'Autres', tier: 'op-bo-t-rare', test: () => true },
];
const sectionOf = (c: PulledCard) => SECTIONS.findIndex((s) => s.test(c));

const tierClass = (c: PulledCard) => `op-bo-t-${tierOf(c)}${special(c) ? ' op-bo-foil' : ''}`;

// ---------- Visuels ----------

const BASE = import.meta.env.BASE_URL;
const withBase = (url: string) => (/^([a-z]+:|\/)/i.test(url) ? url : `${BASE}${url}`);

// Visuels à essayer dans l'ordre : celui de la version tirée, celui du catalogue (VF si elle existe), puis le visuel de
// base de la liste officielle anglaise relayé par l'appli (toutes les cartes y sont, même celles que le navigateur
// n'a pas chargées)
function sources(c: PulledCard): string[] {
  const d = cardData()[c.number];
  return [...new Set([...(c.imageUrl ? [withBase(c.imageUrl)] : []), ...(d ? [cardImage(d)] : []), `${BASE}img-en-hd/${c.number}.webp`])];
}

function preload(cards: PulledCard[]) {
  for (const c of cards) new Image().src = sources(c)[0];
}

function CardFace({ card, lazy = false }: { card: PulledCard; lazy?: boolean }) {
  const list = useMemo(() => sources(card), [card]);
  const [failed, setFailed] = useState(0);
  if (failed >= list.length) {
    return <span className="op-bo-blank"><b>{card.number}</b><small>{rarityText(card)}</small></span>;
  }
  return <img src={list[failed]} alt={cardName(card)} draggable={false} loading={lazy ? 'lazy' : undefined} onError={() => setFailed((n) => n + 1)} />;
}

// Couleurs du paquet d'une extension ; une extension sans couleurs choisies en reçoit d'après son code
const PACK_COLORS: Record<string, [string, string]> = { OP03: ['#b3122e', '#1c2a63'] };

function packColors(set: string): CSSProperties {
  let [p1, p2] = PACK_COLORS[set] ?? ['', ''];
  if (!p1) {
    const h = [...set].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
    p1 = `hsl(${h} 62% 38%)`;
    p2 = `hsl(${(h + 200) % 360} 50% 20%)`;
  }
  return { '--p1': p1, '--p2': p2 } as CSSProperties;
}

// Rose des vents dorée (dessin original)
function Emblem() {
  const id = useId();
  return (
    <svg className="op-bo-emblem" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.5" stopColor="#f0c04f" />
          <stop offset="1" stopColor="#a8741a" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="none" stroke={`url(#${id})`} strokeWidth="3" />
      <circle cx="50" cy="50" r="37" fill="none" stroke={`url(#${id})`} strokeWidth="1.2" strokeDasharray="2 3" />
      <path d="M50 22 L54 46 L78 50 L54 54 L50 78 L46 54 L22 50 L46 46 Z" transform="rotate(45 50 50)" fill="#fff6d0" opacity="0.8" />
      <path d="M50 3 L57 43 L97 50 L57 57 L50 97 L43 57 L3 50 L43 43 Z" fill={`url(#${id})`} />
      <circle cx="50" cy="50" r="5" fill="#1a1405" />
    </svg>
  );
}

function PackArt({ set, cards }: { set: string; cards: number }) {
  return (
    <>
      <span className="op-bo-pack-top" />
      <span className="op-bo-pack-body">
        <Emblem />
        <span className="op-bo-pack-set">{set}</span>
        <span className="op-bo-pack-kind">Booster</span>
        <span className="op-bo-pack-count">{cards} cartes</span>
      </span>
      <span className="op-bo-pack-light" />
    </>
  );
}

// Le paquet à ouvrir : un clic (ou Entrée), ou un geste qui fait glisser la bande du haut jusqu'à la déchirer
function Pack({ set, cards, opening, onOpen }: { set: string; cards: number; opening: boolean; onOpen: () => void }) {
  const drag = useRef<{ id: number; x: number; w: number } | null>(null);
  const tearRef = useRef(0);
  const skipClick = useRef(false);
  const [tear, setTearState] = useState(0);
  const setTear = (t: number) => {
    tearRef.current = t;
    setTearState(t);
  };

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    skipClick.current = false;
    if (opening) return;
    drag.current = { id: e.pointerId, x: e.clientX, w: e.currentTarget.getBoundingClientRect().width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const t = Math.min(1, Math.abs(e.clientX - d.x) / (d.w * 0.7));
    setTear(t);
    if (t >= 1) {
      drag.current = null;
      skipClick.current = true;
      onOpen();
    }
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    if (tearRef.current < 0.08) return setTear(0);   // un simple clic : le clic qui suit ouvre le paquet
    skipClick.current = true;
    if (tearRef.current >= 0.5) onOpen();
    else setTear(0);
  };
  const click = () => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    onOpen();
  };

  return (
    <button type="button" className={`op-bo-pack${opening ? ' is-opening' : ''}${tear > 0 ? ' is-tearing' : ''}`}
      style={{ ...packColors(set), '--tear': opening ? 0 : tear } as CSSProperties} aria-label={`Ouvrir le booster ${set}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setTear(0); }} onClick={click}>
      <PackArt set={set} cards={cards} />
    </button>
  );
}

// Plusieurs paquets en éventail (display), qui s'ouvrent tous ensemble avec « Tout ouvrir »
function Fan({ set, count, cards, bursting = false }: { set: string; count: number; cards: number; bursting?: boolean }) {
  const m = Math.min(count, 5);
  return (
    <div className={`op-bo-fan${bursting ? ' is-bursting' : ''}`}>
      {Array.from({ length: m }, (_, i) => (
        <span key={i} className="op-bo-pack op-bo-mini" style={{ ...packColors(set), '--k': i - (m - 1) / 2, '--j': i } as CSSProperties}>
          <PackArt set={set} cards={cards} />
        </span>
      ))}
      {count > 1 && <span className="op-bo-fan-count">×{count}</span>}
    </div>
  );
}

// ---------- Révélation ----------

// Étincelles autour d'une belle carte : direction, distance, retard
const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  '--a': `${i * 20 + (i % 3) * 6}deg`, '--d': `${8 + ((i * 7) % 5) * 1.8}rem`, '--t': `${(i % 4) * 0.06}s`,
}) as CSSProperties);

// La carte mise en avant, en grand : elle sort du paquet (première carte), tremble si elle est belle, se retourne,
// puis son effet (halo, rayons, étincelles, éclair pour une SEC)
function Show({ card, fresh, lead, rise, calm, isNew, onClick }: {
  card: PulledCard; fresh: boolean; lead: number; rise: boolean; calm: boolean; isNew: boolean; onClick: () => void;
}) {
  const t = tierOf(card);
  const big = isBig(t);
  const wait = fresh && big && !calm ? SUSPENSE : 0;
  const style = {
    '--lead': `${lead}ms`, '--suspense': `${wait}ms`, '--delay': `${lead + wait}ms`, '--fx': `${lead + wait + FLIP / 2}ms`,
  } as CSSProperties;
  const classes = ['op-bo-show', tierClass(card), fresh ? 'is-fresh' : 'is-still', fresh && rise && 'is-rise', wait > 0 && 'is-suspense'];
  return (
    <div className={classes.filter(Boolean).join(' ')} style={style}>
      <div className="op-bo-stage">
        <span className="op-bo-halo" />
        {big && <span className="op-bo-rays" />}
        <button type="button" className="op-bo-big" onClick={onClick} aria-label={`${cardName(card)}, ${rarityText(card)}`}>
          <span className="op-bo-flip-inner">
            <span className="op-bo-face op-bo-front"><CardFace card={card} />{special(card) && <i className="op-bo-holo" />}</span>
            <span className="op-bo-face op-bo-back" />
          </span>
        </button>
        {fresh && big && <span className="op-bo-sparks">{SPARKS.map((s, i) => <i key={i} style={s} />)}</span>}
        {isNew && <span className="op-bo-new">Nouveau !</span>}
      </div>
      <p className="op-bo-caption" aria-live="polite"><b>{cardName(card)}</b> <span>{rarityText(card)}</span></p>
      {fresh && t === 'secret' && <span className="op-bo-flash" />}
    </div>
  );
}

// Les cartes du booster en petit : face cachée, puis retournées (en cascade avec « Tout révéler », la carte mise en
// avant en même temps que la grande, `flipAt` ms après) ; on en touche une pour la revoir en grand
function Strip({ cards, shown, featured, batch, fresh, flipAt, isNew, onPick }: {
  cards: PulledCard[]; shown: number; featured: number; batch: [number, number]; fresh: boolean; flipAt: number;
  isNew: (i: number) => boolean; onPick: (i: number) => void;
}) {
  return (
    <div className="op-bo-strip" style={{ '--n': Math.min(cards.length, 12) } as CSSProperties}>
      {cards.map((c, i) => {
        const up = i < shown;
        const flipping = fresh && up && i >= batch[0] && i < batch[1];
        const classes = ['op-bo-thumb', tierClass(c), up ? 'is-up' : 'is-down', up && i === featured && 'is-on', flipping && 'is-flipping'];
        return (
          <button key={i} type="button" className={classes.filter(Boolean).join(' ')} style={{ '--wait': `${i === featured ? flipAt : (i - batch[0]) * CASCADE}ms` } as CSSProperties}
            disabled={!up} onClick={() => onPick(i)} aria-label={up ? `${cardName(c)}, ${rarityText(c)}` : 'Carte pas encore retournée'}>
            <span className="op-bo-flip-inner">
              <span className="op-bo-face op-bo-front">{up && <CardFace card={c} />}</span>
              <span className="op-bo-face op-bo-back" />
            </span>
            {up && isNew(i) && <span className="op-bo-dot" title="Nouveau !" />}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Récapitulatif ----------

interface Entry { card: PulledCard; key: string; count: number; had: number; isNew: boolean }

function group(cards: PulledCard[], owned?: Record<string, number>): Entry[] {
  const map = new Map<string, Entry>();
  for (const card of cards) {
    const key = ownedKey(card);
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { card, key, count: 1, had: owned?.[key] ?? 0, isNew: owned !== undefined && !((owned[key] ?? 0) > 0) });
  }
  return [...map.values()].sort((a, b) => score(b.card) - score(a.card) || a.card.number.localeCompare(b.card.number));
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;

function Recap({ entries, known }: { entries: Entry[]; known: boolean }) {
  const [filter, setFilter] = useState<'all' | 'new' | 'double'>('all');
  const [zoom, setZoom] = useState<Entry | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const close = (e: { key: string }) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [zoom]);

  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const fresh = entries.filter((e) => e.isNew).length;
  const doubles = entries.filter((e) => e.count > 1).length;
  const visible = entries.filter((e) => filter === 'all' || (filter === 'new' ? e.isNew : e.count > 1));
  const sections = SECTIONS.map((s) => ({ ...s, entries: [] as Entry[], cards: 0 }));
  for (const e of entries) sections[sectionOf(e.card)].cards += e.count;
  for (const e of visible) sections[sectionOf(e.card)].entries.push(e);
  const filters: [typeof filter, string][] = [['all', `Toutes (${entries.length})`]];
  if (known) filters.push(['new', `Nouvelles (${fresh})`]);
  if (doubles) filters.push(['double', `En double (${doubles})`]);
  let index = 0;

  return (
    <div className="op-bo-recap">
      <div className="op-bo-recap-head">
        <h2>Récapitulatif</h2>
        <p>
          {plural(total, 'carte')} · {plural(entries.length, 'différente')}
          {known && <> · <b className="good">{plural(fresh, 'nouvelle')}</b></>}
        </p>
        <div className="op-bo-chips">
          {sections.filter((s) => s.cards > 0).map((s) => <span key={s.title} className={`op-chip op-bo-chip ${s.tier}`}>{s.short} {s.cards}</span>)}
        </div>
        {filters.length > 1 && (
          <div className="op-segmented op-bo-filter" style={{ '--n': filters.length } as CSSProperties}>
            {filters.map(([id, text]) => <button key={id} type="button" className={filter === id ? 'seg on' : 'seg'} onClick={() => setFilter(id)}>{text}</button>)}
          </div>
        )}
      </div>
      {visible.length === 0 && <p className="op-muted op-bo-empty">{entries.length ? 'Aucune carte dans ce filtre.' : 'Aucune carte.'}</p>}
      <div className="op-bo-sections">
        {sections.filter((s) => s.entries.length > 0).map((s) => (
        <section key={s.title} className="op-bo-section">
          <h3>{s.title} <span>{s.entries.reduce((sum, e) => sum + e.count, 0)}</span></h3>
          <div className="op-bo-grid">
            {s.entries.map((e) => (
              <button key={e.key} type="button" className={`op-bo-tile ${tierClass(e.card)}`} style={{ '--i': index++ } as CSSProperties} onClick={() => setZoom(e)}>
                <span className="op-bo-tile-card">
                  <CardFace card={e.card} lazy />
                  {special(e.card) && <i className="op-bo-holo" />}
                  {e.count > 1 && <span className="op-bo-count">×{e.count}</span>}
                </span>
                {e.isNew && <span className="op-bo-new">Nouveau !</span>}
                <span className="op-bo-tile-text"><b>{cardName(e.card)}</b><small>{details(e.card)}</small></span>
              </button>
            ))}
          </div>
        </section>
        ))}
      </div>
      {zoom && (
        <div className={`op-bo-zoom ${tierClass(zoom.card)}`} onClick={() => setZoom(null)} role="dialog" aria-label={cardName(zoom.card)}>
          <span className="op-bo-zoom-card"><CardFace card={zoom.card} />{special(zoom.card) && <i className="op-bo-holo" />}</span>
          <p><b>{cardName(zoom.card)}</b> · {details(zoom.card)}</p>
          <p className="op-muted op-small">
            {zoom.count > 1 ? `${zoom.count} exemplaires dans cette ouverture` : 'Un exemplaire dans cette ouverture'}
            {known && (zoom.had ? ` · tu en avais déjà ${zoom.had}` : ' · nouvelle dans ta Cale')}
          </p>
          <p className="op-muted op-small">Touche l’écran pour fermer</p>
        </div>
      )}
    </div>
  );
}

// ---------- L'écran ----------

type Stage =
  | { kind: 'choose' }                                    // plusieurs boosters : un par un, ou tout ouvrir
  | { kind: 'pack'; booster: number; opening: boolean }   // paquet fermé (ou en train de se déchirer)
  // cartes retournées une à une : `shown` retournées, `featured` en grand ; `fresh` : elle vient d'être retournée (avec
  // ses effets, après `lead` ms) ; `batch` : cartes retournées par la dernière action
  | { kind: 'reveal'; booster: number; shown: number; featured: number; fresh: boolean; batch: [number, number]; lead: number; rise: boolean }
  | { kind: 'burst'; packs: number }                      // « Tout ouvrir » : les paquets s'ouvrent ensemble
  | { kind: 'recap' };

interface Action { label: string; run: () => void; disabled?: boolean }

// Minuteries de l'écran (sons et étapes à venir), annulées quand on passe à la suite ou qu'on quitte l'écran
function useTimers() {
  const ids = useRef(new Set<number>());
  useEffect(() => {
    const pending = ids.current;
    return () => pending.forEach((id) => clearTimeout(id));
  }, []);
  return useMemo(() => ({
    later(fn: () => void, ms: number) {
      const id = window.setTimeout(() => {
        ids.current.delete(id);
        fn();
      }, ms);
      ids.current.add(id);
    },
    clear() {
      ids.current.forEach((id) => clearTimeout(id));
      ids.current.clear();
    },
  }), []);
}

export function BoosterOpening({ content, owned, onDone, animations = true }: BoosterOpeningProps) {
  const boosters = useMemo(() => (Array.isArray(content) ? content : [content]).filter((b) => b.cards.length > 0), [content]);
  const total = boosters.length;
  const multi = total > 1;
  const set = boosters.every((b) => b.set === boosters[0].set) ? boosters[0]?.set ?? '' : '';
  const size = boosters[0]?.cards.length ?? 0;
  const [settings, updateSettings] = useSettings();
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  const reduced = useReducedMotion();
  const calm = !animations || reduced;
  const { touch } = useDevice();
  const timers = useTimers();
  const [stage, setStage] = useState<Stage>(() => (total === 0 ? { kind: 'recap' } : multi ? { kind: 'choose' } : { kind: 'pack', booster: 0, opening: false }));
  const primaryRef = useRef<HTMLButtonElement>(null);

  // « Nouveau ! » : première fois qu'une carte absente de la Cale sort pendant cette ouverture
  const newAt = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<string>();
    boosters.forEach((b, i) => b.cards.forEach((c, j) => {
      const key = ownedKey(c);
      if (owned && !((owned[key] ?? 0) > 0) && !seen.has(key)) result.add(`${i}:${j}`);
      seen.add(key);
    }));
    return result;
  }, [boosters, owned]);
  const entries = useMemo(() => group(boosters.flatMap((b) => b.cards), owned), [boosters, owned]);

  // Sons d'une carte qui se retourne dans `lead` ms : montée pour les belles cartes, puis son de sa rareté
  const playReveal = (c: PulledCard, lead: number) => {
    const wait = isBig(tierOf(c)) && !calm ? SUSPENSE : 0;
    const sound = revealSound(c);
    if (wait) timers.later(() => boosterSfx('suspense'), lead);
    timers.later(() => boosterSfx('flip'), lead + wait);
    if (sound) timers.later(() => boosterSfx(sound), lead + wait + 180);
  };

  // Moment où la carte mise en avant se retourne (après sa sortie du paquet et son suspense)
  const flipAt = (s: Extract<Stage, { kind: 'reveal' }>) => (
    s.fresh ? s.lead + (isBig(tierOf(boosters[s.booster].cards[s.featured])) && !calm ? SUSPENSE : 0) : 0
  );

  const start = (b: number) => {
    const lead = calm ? 0 : RISE;
    setStage({ kind: 'reveal', booster: b, shown: 1, featured: 0, fresh: true, batch: [0, 1], lead, rise: !calm });
    playReveal(boosters[b].cards[0], lead);
  };

  const openPack = () => {
    if (stage.kind !== 'pack' || stage.opening) return;
    const b = stage.booster;
    timers.clear();
    preload(boosters[b].cards);
    boosterSfx('tear');
    if (calm) return start(b);
    setStage({ kind: 'pack', booster: b, opening: true });
    timers.later(() => start(b), OPENING);
  };

  const next = () => {
    if (stage.kind !== 'reveal') return;
    const cards = boosters[stage.booster].cards;
    if (stage.shown >= cards.length) return;
    timers.clear();
    setStage({ ...stage, shown: stage.shown + 1, featured: stage.shown, fresh: true, batch: [stage.shown, stage.shown + 1], lead: 0, rise: false });
    playReveal(cards[stage.shown], 0);
  };

  // Toutes les cartes restantes se retournent en cascade dans la bande ; la plus belle est mise en avant
  const revealAll = () => {
    if (stage.kind !== 'reveal') return;
    const cards = boosters[stage.booster].cards;
    const from = stage.shown;
    if (from >= cards.length) return;
    let best = from;
    for (let i = from + 1; i < cards.length; i++) if (score(cards[i]) >= score(cards[best])) best = i;
    const lead = calm ? 0 : Math.min(700, (cards.length - from) * CASCADE);
    timers.clear();
    setStage({ ...stage, shown: cards.length, featured: best, fresh: true, batch: [from, cards.length], lead, rise: false });
    if (!calm) for (let i = 0; i < Math.min(5, cards.length - from); i++) timers.later(() => boosterSfx('flip'), i * 110);
    playReveal(cards[best], lead);
  };

  const pick = (i: number) => {
    if (stage.kind !== 'reveal' || i >= stage.shown) return;
    timers.clear();
    setStage({ ...stage, featured: i, fresh: false });
  };

  const goPack = (b: number) => {
    timers.clear();
    setStage({ kind: 'pack', booster: b, opening: false });
  };

  const toRecap = () => {
    timers.clear();
    setStage({ kind: 'recap' });
  };

  // Premier booster pas encore ouvert
  const rest = stage.kind === 'choose' ? 0
    : stage.kind === 'pack' ? stage.booster + (stage.opening ? 1 : 0)
    : stage.kind === 'reveal' ? stage.booster + 1
    : total;

  // Tous les boosters restants d'un coup, puis le récapitulatif (et le son de la plus belle carte qu'ils contenaient)
  const openAll = () => {
    timers.clear();
    const hidden = boosters.slice(rest).flatMap((b) => b.cards);
    const best = hidden.reduce<PulledCard | null>((a, c) => (!a || score(c) > score(a) ? c : a), null);
    const sound = best && isBig(tierOf(best)) ? revealSound(best) : null;
    if (calm || !hidden.length) {
      setStage({ kind: 'recap' });
      if (sound) boosterSfx(sound);
      return;
    }
    setStage({ kind: 'burst', packs: total - rest });
    for (let i = 0; i < 3; i++) timers.later(() => boosterSfx('tear'), i * 170);
    timers.later(() => setStage({ kind: 'recap' }), BURST);
    if (sound) timers.later(() => boosterSfx(sound), BURST + 150);
  };

  let primary: Action | null = null;
  let secondary: Action | null = null;
  let progress = '';
  const allLabel = rest === 0 ? 'Tout ouvrir' : 'Tout ouvrir le reste';
  if (stage.kind === 'choose') {
    primary = { label: 'Un par un', run: () => goPack(0) };
    secondary = { label: 'Tout ouvrir', run: openAll };
  } else if (stage.kind === 'pack') {
    primary = { label: 'Ouvrir le booster', run: openPack, disabled: stage.opening };
    if (multi) secondary = { label: allLabel, run: openAll, disabled: stage.opening };
    if (multi) progress = `Booster ${stage.booster + 1}/${total}`;
  } else if (stage.kind === 'reveal') {
    const n = boosters[stage.booster].cards.length;
    progress = `${multi ? `Booster ${stage.booster + 1}/${total} · carte` : 'Carte'} ${stage.shown}/${n}`;
    if (stage.shown < n) {
      primary = { label: 'Suivante', run: next };
      secondary = { label: 'Tout révéler', run: revealAll };
    } else if (stage.booster < total - 1) {
      primary = { label: `Booster suivant (${stage.booster + 2}/${total})`, run: () => goPack(stage.booster + 1) };
      secondary = { label: allLabel, run: openAll };
    } else {
      primary = { label: 'Récapitulatif', run: toRecap };
    }
  } else if (stage.kind === 'recap') {
    primary = { label: 'Terminer', run: onDone };
    progress = plural(entries.reduce((sum, e) => sum + e.count, 0), 'carte');
  }

  // Le bouton principal garde le clavier (Entrée ou Espace pour continuer)
  const primaryLabel = primary?.label;
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [primaryLabel]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' && primary && !primary.disabled && stage.kind !== 'recap') {
      e.preventDefault();
      primary.run();
    }
  };

  const title = !multi ? `Booster ${set}`.trim() : total === DISPLAY_SIZE && set ? `Display ${set}` : `${total} boosters ${set}`.trim();

  return (
    <div className={`op-bo${calm ? ' op-bo-calm' : ''}`} role="dialog" aria-modal="true" aria-label="Ouverture des boosters" onKeyDown={onKey}>
      <header className="op-bo-head">
        <div className="op-bo-title">
          <strong>{title}</strong>
          {progress && <span className="op-muted op-small">{progress}</span>}
        </div>
        <button type="button" className="icon-btn" onClick={() => updateSettings({ sound: !settings.sound })}
          title={settings.sound ? 'Couper le son' : 'Activer le son'} aria-label={settings.sound ? 'Couper le son' : 'Activer le son'}>
          {settings.sound ? '🔊' : '🔇'}
        </button>
      </header>
      <div className={`op-bo-body op-bo-at-${stage.kind}`}>
        {stage.kind === 'choose' && (
          <div className="op-bo-main">
            <Fan set={set} count={total} cards={size} />
            <p className="op-bo-hint">
              {total} boosters à ouvrir, soit {boosters.reduce((sum, b) => sum + b.cards.length, 0)} cartes : un par un pour
              savourer chaque paquet, ou tous d’un coup pour voir tout de suite le récapitulatif.
            </p>
          </div>
        )}
        {stage.kind === 'pack' && (
          <div className="op-bo-main">
            <Pack key={stage.booster} set={boosters[stage.booster].set} cards={boosters[stage.booster].cards.length} opening={stage.opening} onOpen={openPack} />
            <p className="op-bo-hint">
              {touch ? 'Touche le paquet, ou fais glisser ton doigt dessus pour le déchirer.' : 'Clique sur le paquet, ou fais-le glisser de côté pour le déchirer.'}
            </p>
          </div>
        )}
        {stage.kind === 'burst' && (
          <div className="op-bo-main">
            <Fan set={set} count={stage.packs} cards={size} bursting />
            <p className="op-bo-hint">Ouverture de {plural(stage.packs, 'booster')}…</p>
          </div>
        )}
        {stage.kind === 'reveal' && (
          <>
            <Show key={`${stage.booster}-${stage.featured}-${stage.fresh ? stage.shown : 'vu'}`} card={boosters[stage.booster].cards[stage.featured]}
              fresh={stage.fresh} lead={stage.lead} rise={stage.rise} calm={calm} isNew={newAt.has(`${stage.booster}:${stage.featured}`)}
              onClick={() => primary && !primary.disabled && primary.run()} />
            <Strip key={stage.booster} cards={boosters[stage.booster].cards} shown={stage.shown} featured={stage.featured} batch={stage.batch}
              fresh={stage.fresh} flipAt={flipAt(stage)} isNew={(i) => newAt.has(`${stage.booster}:${i}`)} onPick={pick} />
          </>
        )}
        {stage.kind === 'recap' && <Recap entries={entries} known={owned !== undefined} />}
        {(primary || secondary) && (
          <div className="op-bo-actions">
            {secondary && <button type="button" className="op-btn op-btn-ghost btn-big" onClick={secondary.run} disabled={secondary.disabled}>{secondary.label}</button>}
            {primary && <button ref={primaryRef} type="button" className="op-btn op-btn-primary btn-big" onClick={primary.run} disabled={primary.disabled}>{primary.label}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
