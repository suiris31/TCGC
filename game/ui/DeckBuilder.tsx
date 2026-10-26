// Éditeur de decks (phase 5) : mes decks (créer, copier un deck préconstruit, importer une liste), et l'éditeur d'un
// deck : cartes jouables compatibles avec le Leader (filtres, cartes possédées), liste du deck, bilan (courbe des
// coûts, règles de construction, tournoi officiel, cartes manquantes de ma collection et leur prix). Téléphone d'abord :
// sur un écran étroit, catalogue, deck et bilan sont trois onglets ; sur un grand écran, trois colonnes.
// Mode « cartes de la Cale » (deck d'aventure, HoldMode) : le même éditeur ne propose que les cartes possédées dans la
// Cale du mode Aventure, au plus min(possédées, 4) par numéro, et enregistre le deck en mode 'aventure'.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, cardStatus, HIDDEN } from '../engine/cards/index.ts';
import { anyNumber, DECK_SIZE, formatIssues, MAX_COPIES, playableErrors, type Regulations } from '../engine/deckRules.ts';
import { DECKS, deckSize, isAdventureOnly, type DeckList } from '../engine/decks.ts';
import { def } from '../engine/rules.ts';
import type { CardDef, Color } from '../engine/types.ts';
import { chooseAdventureDeck } from './adventure/api.ts';
import { holdLimit, holdProblems } from './adventure/hold.ts';
import { fetchHoldState } from './adventure/holdState.ts';
import type { Preview } from './CardView.tsx';
import { CardThumb, CostCurve, DeckStats } from './DeckGuide.tsx';
import { cardImage } from './images.ts';
import { isTouch } from './device.ts';
import {
  deckPrices, deckText, deleteMyDeck, isAdventureDeck, newDeckId, ownedNumbers, parseDeckText, playable, saveMyDeck, useMyDecks, wishMissing,
  type CardCollection, type MyDeck,
} from './myDecks.ts';

type Hover = (p: (Preview & { rect?: DOMRect }) | null) => void;
export interface Draft { id: string; name: string; leader: string; cards: Record<string, number> }

// Mode « cartes de la Cale » : l'éditeur d'un deck d'aventure
export interface HoldMode {
  hold: Record<string, number>;               // cartes de la Cale par numéro, toutes versions confondues (holdByNumber)
  chosen: string | null;                      // deck d'aventure choisi à l'ouverture de l'éditeur
  // choisir ce deck pour l'aventure ; renvoie le deck choisi (une erreur est montrée telle quelle)
  onChoose: (id: string) => Promise<string | null>;
}

// Mode « cartes de la Cale », lu sur le serveur (pour ouvrir un deck d'aventure depuis « Mes decks »)
export async function loadHoldMode(): Promise<HoldMode> {
  const { byNumber, adventure } = await fetchHoldState();
  return { hold: byNumber, chosen: adventure.deckId, onChoose: async (id) => (await chooseAdventureDeck(id)).deckId };
}

const COLOR_HEX: Record<string, string> = { Red: '#d9443a', Green: '#2f9e5b', Blue: '#2f6fd1', Purple: '#8a4fc9', Yellow: '#e2b623', Black: '#55556a' };
const COLOR_FR: Record<Color, string> = { Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune' };
const CATEGORY_FR: Record<string, string> = { CHARACTER: 'Personnages', EVENT: 'Événements', STAGE: 'Lieux' };
const euros = (x: number) => x.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const playableNums = () => Object.keys(CARDS).filter((n) => n !== HIDDEN && cardStatus(n) !== 'todo');
const maxCopies = (d: CardDef) => (anyNumber(d) ? DECK_SIZE : MAX_COPIES);

// Carte permise avec ce Leader : toutes ses couleurs sur le Leader, et pas interdite par lui
export function fits(leader: string, num: string): boolean {
  const L = def(leader);
  const d = def(num);
  return d.category !== 'LEADER' && d.colors.length > 0 && d.colors.every((c) => L.colors.includes(c)) && !L.rules?.deckRestriction?.(d);
}

let regsCache: Regulations | null = null;
function useRegulations(): Regulations {
  const [regs, setRegs] = useState<Regulations>(regsCache ?? {});
  useEffect(() => {
    if (regsCache) return;
    fetch(`${import.meta.env.BASE_URL}api/game/regulations`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((x: Regulations) => { regsCache = x; setRegs(x); }, () => {});
  }, []);
  return regs;
}

export function DeckBuilderScreen({ onClose, onHover, onPlay }: { onClose: () => void; onHover: Hover; onPlay: (id: string) => void }) {
  const { decks, ready, error } = useMyDecks();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState<'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [holdMode, setHoldMode] = useState<HoldMode | null>(null);
  const [loadingHold, setLoadingHold] = useState(false);
  const open = (d: Draft) => { setNotice(null); setHoldMode(null); setDraft(d); };
  // un deck d'aventure s'ouvre en mode « cartes de la Cale »
  const openAdventure = (d: MyDeck) => {
    setNotice(null);
    setLoadingHold(true);
    loadHoldMode().then(
      (m) => { setHoldMode(m); setDraft({ id: d.id, name: d.name, leader: d.leader, cards: { ...d.cards } }); },
      (e: Error) => setNotice(`Impossible d’ouvrir ce deck d’aventure : ${e.message}`),
    ).finally(() => setLoadingHold(false));
  };
  const free = decks.filter((d) => !isAdventureDeck(d));
  const adventure = decks.filter((d) => isAdventureDeck(d));

  if (draft) {
    return <DeckEditor key={draft.id} initial={draft} existing={decks.some((d) => d.id === draft.id)} hold={holdMode ?? undefined}
      onBack={() => { setDraft(null); setHoldMode(null); }} onHover={onHover} onPlay={onPlay} />;
  }
  const copy = (id: string) => {
    if (!id) return;
    const src = DECKS[id] ?? decks.find((d) => d.id === id);
    if (src) open({ id: newDeckId(), name: `${src.name} (copie)`.slice(0, 40), leader: src.leader, cards: { ...src.cards } });
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box history db" data-ui="decks" onClick={(e) => e.stopPropagation()}>
        <header className="history-head">
          <h2>🃏 Mes decks</h2>
          <span className="db-grow" />
          <button className="icon-btn" data-ui="decks.close" onClick={onClose} title="Fermer (Échap)">✕</button>
        </header>
        <div className="history-body">
          <div className="db-actions">
            <button className="op-btn op-btn-primary" data-ui="decks.new" onClick={() => setPicking('new')}>＋ Nouveau deck</button>
            <label className="db-copy">
              <span className="op-small op-muted">Copier un deck</span>
              <select value="" onChange={(e) => copy(e.target.value)}>
                <option value="">Choisir…</option>
                <optgroup label="Decks du méta">{Object.values(DECKS).filter((d) => d.series === 'META').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                <optgroup label="Decks pour débutant">{Object.values(DECKS).filter((d) => d.series !== 'META' && !isAdventureOnly(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}</optgroup>
                {free.length > 0 && <optgroup label="Mes decks">{free.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
                {adventure.length > 0 && <optgroup label="Mes decks d’aventure">{adventure.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
              </select>
            </label>
            <button className="op-btn op-btn-ghost" data-ui="decks.import" onClick={() => setImporting(true)}>Importer une liste</button>
          </div>
          {notice && <p className="db-notice">{notice}</p>}
          {error && <p className="danger">Impossible de charger tes decks : vérifie ta connexion.</p>}
          {ready && !free.length && (
            <div className="history-empty">
              <p>{adventure.length ? 'Tu n’as pas encore de deck libre (avec toutes les cartes).' : 'Tu n’as pas encore de deck à toi.'}</p>
              <p className="op-muted op-small">Crée-en un à partir d’un Leader, copie un deck préconstruit pour le modifier, ou colle une liste trouvée sur un site de decks. L’éditeur ne propose que les cartes que le jeu sait déjà jouer.</p>
            </div>
          )}
          <div className="db-list">
            {free.map((d) => <MyDeckTile key={d.id} deck={d} onOpen={() => open({ id: d.id, name: d.name, leader: d.leader, cards: { ...d.cards } })} onPlay={() => onPlay(d.id)} />)}
          </div>
          {adventure.length > 0 && (
            <section className="op-db-adventure">
              <h3>🧭 Mes decks d’aventure</h3>
              <p className="op-small op-muted">Construits avec les cartes gagnées dans l’Aventure (ta Cale) : on n’y ajoute que des cartes de la Cale. Pour un deck avec toutes les cartes, copie-le : la copie sera un deck libre.</p>
              <div className="db-list">
                {adventure.map((d) => <MyDeckTile key={d.id} deck={d} busy={loadingHold} onOpen={() => openAdventure(d)} onPlay={() => onPlay(d.id)} />)}
              </div>
            </section>
          )}
        </div>
        {picking && (
          <LeaderPicker onClose={() => setPicking(null)} onHover={onHover}
            onPick={(leader) => { setPicking(null); open({ id: newDeckId(), name: `Mon ${def(leader).name}`.slice(0, 40), leader, cards: {} }); }} />
        )}
        {importing && (
          <ImportBox onClose={() => setImporting(false)}
            onImport={(d, unknown) => {
              setImporting(false);
              open(d);
              if (unknown.length) setNotice(`Lignes ignorées : ${unknown.join(', ')}`);
            }} />
        )}
      </div>
    </div>
  );
}

export function MyDeckTile({ deck, onOpen, onPlay, busy, chosen, onChoose }: {
  deck: MyDeck; onOpen: () => void; onPlay?: () => void; busy?: boolean;
  chosen?: boolean; onChoose?: () => void;   // deck d'aventure : choisi pour l'aventure, ou le choisir
}) {
  const L = CARDS[deck.leader];
  const size = deckSize(deck);
  const ok = L && playable(deck);
  return (
    <div className={`db-tile${chosen ? ' op-db-chosen' : ''}`}>
      {L && <img src={cardImage(L)} alt="" />}
      <div className="db-tile-text">
        <strong>{deck.name}</strong>
        <span className="op-small op-muted">{L?.name ?? deck.leader} · {size}/{DECK_SIZE} cartes</span>
        <span className={`op-small ${ok ? 'db-ok' : 'db-ko'}`}>{ok ? '✔ Jouable' : size !== DECK_SIZE ? '✎ Incomplet' : '✖ À corriger'}</span>
        {isAdventureDeck(deck) && <span className="op-chip op-db-tag">{chosen ? '⚓ Deck de l’aventure' : '🧭 Aventure'}</span>}
      </div>
      <div className="db-tile-actions">
        <button className="op-btn op-btn-ghost btn-small" data-ui="decks.edit" onClick={onOpen} disabled={busy}>Modifier</button>
        {ok && onChoose && !chosen && <button className="op-btn op-btn-primary btn-small" onClick={onChoose} disabled={busy}>Choisir</button>}
        {ok && onPlay && <button className="op-btn op-btn-primary btn-small" onClick={onPlay}>Jouer</button>}
      </div>
    </div>
  );
}

// only : Leaders proposés seulement s'ils sont dans la Cale (mode « cartes de la Cale »)
export function LeaderPicker({ onPick, onClose, onHover, only }: { onPick: (num: string) => void; onClose: () => void; onHover: Hover; only?: Record<string, number> }) {
  const leaders = useMemo(() => playableNums().filter((n) => CARDS[n].category === 'LEADER' && (!only || (only[n] ?? 0) > 0))
    .sort((a, b) => CARDS[a].colors.join().localeCompare(CARDS[b].colors.join()) || CARDS[a].name.localeCompare(CARDS[b].name)), [only]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box db-leaders" data-ui="leaders" onClick={(e) => e.stopPropagation()}>
        <header className="db-row"><h3>Choisis ton Leader</h3><span className="db-grow" /><button className="icon-btn" data-ui="leaders.close" onClick={onClose}>✕</button></header>
        <p className="op-small op-muted">{only
          ? 'Seuls les Leaders de ta Cale que le jeu sait déjà jouer sont proposés : gagne des boosters pour en trouver d’autres.'
          : 'Seuls les Leaders que le jeu sait déjà jouer sont proposés.'}</p>
        <div className="db-leader-grid">
          {leaders.map((n) => (
            <button key={n} className="db-leader" data-ui="leaders.item" onClick={() => onPick(n)}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ num: n, rect: e.currentTarget.getBoundingClientRect() }); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover(null); }}>
              <img src={cardImage(CARDS[n])} alt="" />
              <span>{CARDS[n].name}</span>
              <span className="op-small op-muted">{CARDS[n].colors.map((c) => COLOR_FR[c]).join('/')} · {n}</span>
            </button>
          ))}
        </div>
        {!leaders.length && <p className="op-muted">Aucun Leader jouable dans ta Cale pour l’instant.</p>}
      </div>
    </div>
  );
}

function ImportBox({ onImport, onClose }: { onImport: (d: Draft, unknown: string[]) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const parsed = parseDeckText(text, (n) => CARDS[n]?.category === 'LEADER');
    if (!parsed.leader) return setError('Aucun Leader reconnu : la liste doit contenir son Leader (par exemple « 1xOP13-004 »).');
    const unknown = [...parsed.unknown, ...Object.keys(parsed.cards).filter((n) => !CARDS[n])];
    const cards = Object.fromEntries(Object.entries(parsed.cards).filter(([n]) => CARDS[n]));
    onImport({ id: newDeckId(), name: `Import ${CARDS[parsed.leader]?.name ?? parsed.leader}`.slice(0, 40), leader: parsed.leader, cards }, unknown);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box db-import" onClick={(e) => e.stopPropagation()}>
        <header className="db-row"><h3>Importer une liste</h3><span className="db-grow" /><button className="icon-btn" onClick={onClose}>✕</button></header>
        <p className="op-small op-muted">Colle une liste au format courant des sites de decks : une carte par ligne, « 4xOP13-008 », Leader compris.</p>
        <textarea className="db-text" rows={12} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} placeholder={'1xOP13-004\n4xOP13-008\n4xOP12-090\n…'} />
        {error && <p className="danger op-small">{error}</p>}
        <div className="db-row"><span className="db-grow" /><button className="op-btn op-btn-primary" onClick={go} disabled={!text.trim()}>Importer</button></div>
      </div>
    </div>
  );
}

// ---------- Éditeur d'un deck ----------

type Pane = 'cards' | 'deck' | 'check';

// existing : deck déjà enregistré ; un deck neuf n'est enregistré qu'à sa première carte (pas de deck vide oublié).
// hold : mode « cartes de la Cale » (deck d'aventure) ; onPlay : bouton « Jouer » (partie libre)
export function DeckEditor({ initial, existing, hold, onBack, onHover, onPlay }: {
  initial: Draft; existing: boolean; hold?: HoldMode; onBack: () => void; onHover: Hover; onPlay?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pane, setPane] = useState<Pane>(Object.keys(initial.cards).length ? 'deck' : 'cards');
  const [save, setSave] = useState<'saved' | 'saving' | 'pending' | 'error'>('pending');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changeLeader, setChangeLeader] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [owned, setOwned] = useState<Record<string, number> | null>(hold ? hold.hold : null);
  const [chosen, setChosen] = useState(hold?.chosen ?? null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const first = useRef(true);
  const stored = useRef(existing);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // enregistrement prévu mais pas encore parti : fait tout de suite si l'éditeur se ferme (fond, Échap, changement
  // d'onglet) ou si la page passe en arrière-plan, pour ne pas perdre la dernière modification
  const pending = useRef<(() => void) | null>(null);
  const regs = useRegulations();
  const limit = (d: CardDef) => (hold ? holdLimit(hold.hold, d) : maxCopies(d));

  // cartes possédées : de la collection (deck libre), ou de la Cale (deck d'aventure)
  useEffect(() => { if (!hold) ownedNumbers().then(setOwned, () => setOwned({})); }, []);
  // enregistrement automatique, un instant après la dernière modification (le deck est enregistré dès son ouverture)
  useEffect(() => {
    clearTimeout(timer.current);
    pending.current = null;
    if (!draft.name.trim()) {
      setSave('error');
      setSaveError('Donne un nom à ton deck pour l’enregistrer.');
      return;
    }
    // ouverture d'un deck déjà enregistré : rien à enregistrer
    if (first.current && existing) {
      first.current = false;
      setSave('saved');
      return;
    }
    setSave('pending');
    if (!stored.current && !Object.keys(draft.cards).length) return;
    const run = () => {
      pending.current = null;
      setSave('saving');
      saveMyDeck(hold ? { ...draft, mode: 'aventure' } : draft)
        .then(() => { stored.current = true; setSave('saved'); setSaveError(null); }, (e: Error) => { setSave('error'); setSaveError(e.message); });
    };
    pending.current = run;
    timer.current = setTimeout(run, first.current ? 0 : 700);
    first.current = false;
    return () => clearTimeout(timer.current);
  }, [draft]);
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      pending.current?.();
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  const size = deckSize(draft);
  const holdIssues = hold ? holdProblems(hold.hold, draft.leader, draft.cards) : [];
  const rules = playableErrors(draft.leader, draft.cards);
  const errors = [...rules, ...holdIssues];
  const official = formatIssues(draft.leader, draft.cards, regs);
  const setCount = (num: string, n: number) => setDraft((d) => {
    const cards = { ...d.cards };
    if (n <= 0) delete cards[num];
    else cards[num] = n;
    return { ...d, cards };
  });
  const add = (num: string, delta: number) => {
    const n = (draft.cards[num] ?? 0) + delta;
    if (delta > 0 && (size >= DECK_SIZE || n > limit(def(num)))) return;
    setCount(num, n);
  };
  const choose = () => {
    if (!hold) return;
    setChoosing('…');
    hold.onChoose(draft.id).then((id) => { setChosen(id); setChoosing(null); }, (e: Error) => setChoosing(e.message));
  };
  const isChosen = Boolean(hold) && chosen === draft.id;
  const pickLeader = (leader: string) => {
    setChangeLeader(false);
    setDraft((d) => ({ ...d, leader, cards: Object.fromEntries(Object.entries(d.cards).filter(([n]) => fits(leader, n))) }));
  };
  const remove = async () => {
    clearTimeout(timer.current);
    pending.current = null;
    await deleteMyDeck(draft.id).catch(() => {});
    onBack();
  };
  const L = def(draft.leader);
  const saveText = { saved: 'Enregistré', saving: 'Enregistrement…', pending: stored.current ? 'Modifié' : 'Pas encore enregistré', error: 'Pas enregistré' }[save];
  return (
    <div className="modal" onClick={onBack}>
      <div className="modal-box history db db-editor" data-ui="editor" onClick={(e) => e.stopPropagation()}
        style={{ ['--c1' as string]: COLOR_HEX[L.colors[0]] ?? '#666', ['--c2' as string]: COLOR_HEX[L.colors[1] ?? L.colors[0]] ?? '#666' }}>
        <header className="history-head db-head">
          <button className="op-btn op-btn-ghost btn-small" data-ui="editor.back" onClick={onBack}>← Mes decks</button>
          <input className="db-name" value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-label="Nom du deck" />
          <span className={`op-small ${save === 'error' ? 'danger' : 'op-muted'}`} title={saveError ?? undefined}>{saveText}</span>
        </header>
        <div className="db-summary">
          <span onClick={() => setChangeLeader(true)} className="db-leader-mini" title="Changer de Leader">
            <CardThumb num={draft.leader} size="mini" onHover={onHover} />
          </span>
          <div className="db-summary-text">
            <strong>{L.name}</strong>
            <span className="op-small op-muted">{L.colors.map((c) => COLOR_FR[c]).join('/')} · {L.life} Vies · <button className="op-link op-small" onClick={() => setChangeLeader(true)}>changer</button></span>
          </div>
          <span className={`db-count ${size === DECK_SIZE ? 'db-ok' : ''}`}>{size}/{DECK_SIZE}</span>
          <button className={`db-status ${errors.length ? 'db-ko' : 'db-ok'}`} onClick={() => setPane('check')}>
            {errors.length ? `✖ ${errors.length} à corriger` : '✔ Jouable'}
          </button>
          {hold && (isChosen
            ? <span className="op-chip op-db-tag" title="C’est avec ce deck que tu joues les chapitres de l’aventure">⚓ Deck de l’aventure</span>
            : !errors.length && save === 'saved' && <button className="op-btn op-btn-primary btn-small" onClick={choose} disabled={choosing === '…'}>Choisir pour l’aventure</button>)}
          {onPlay && !errors.length && save === 'saved' && <button className={`op-btn ${hold ? 'op-btn-ghost' : 'op-btn-primary'} btn-small`} onClick={() => onPlay(draft.id)}>Jouer</button>}
        </div>
        {hold && (
          <p className="op-small op-muted op-db-holdnote">
            🧰 Deck d’aventure : seules les cartes de ta Cale sont proposées, autant d’exemplaires que tu en as (4 au plus).
            {!isChosen && errors.length > 0 && ' Pour le choisir, il doit être jouable (voir le bilan).'}
            {choosing && choosing !== '…' && <span className="danger"> {choosing}</span>}
          </p>
        )}
        <nav className="history-tabs db-tabs">
          {([['cards', 'Ajouter des cartes'], ['deck', `Deck (${size})`], ['check', 'Bilan']] as [Pane, string][]).map(([p, label]) => (
            <button key={p} className={pane === p ? 'seg on' : 'seg'} data-ui={`editor.pane-${p}`} onClick={() => setPane(p)}>{label}</button>
          ))}
        </nav>
        <div className="db-panes">
          <section className={`db-pane ${pane === 'cards' ? 'on' : ''}`}>
            <CardBrowser leader={draft.leader} cards={draft.cards} full={size >= DECK_SIZE} owned={owned} hold={hold?.hold} limit={limit} onAdd={add} onHover={onHover} />
          </section>
          <section className={`db-pane ${pane === 'deck' ? 'on' : ''}`}>
            <DeckContents cards={draft.cards} owned={owned} inHold={Boolean(hold)} limit={limit} onAdd={add} onHover={onHover} full={size >= DECK_SIZE} />
          </section>
          <section className={`db-pane ${pane === 'check' ? 'on' : ''}`}>
            <DeckCheck draft={draft} errors={rules} official={official} holdIssues={hold ? holdIssues : undefined} />
            <div className="db-row db-danger-zone">
              {isChosen
                ? <span className="op-small op-muted">C’est ton deck d’aventure : choisis-en un autre avant de le supprimer.</span>
                : confirmDelete
                ? <><span className="op-small">Supprimer ce deck ?</span><button className="op-btn op-btn-ghost btn-small" onClick={() => setConfirmDelete(false)}>Non</button><button className="op-btn btn-small db-delete" onClick={remove}>Oui, supprimer</button></>
                : <button className="op-btn op-btn-ghost btn-small" onClick={() => setConfirmDelete(true)}>Supprimer ce deck</button>}
            </div>
          </section>
        </div>
        {changeLeader && <LeaderPicker onClose={() => setChangeLeader(false)} onPick={pickLeader} onHover={onHover} only={hold?.hold} />}
      </div>
    </div>
  );
}

// Image d'une carte avec ses boutons − et +
function CardPick({ num, count, canAdd, owned, inHold, onAdd, onHover }: { num: string; count: number; canAdd: boolean; owned?: number; inHold?: boolean; onAdd: (num: string, delta: number) => void; onHover: Hover }) {
  const d = def(num);
  return (
    <div className={`db-card ${count ? 'in' : ''}`}>
      <div className="db-card-img"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ num, rect: e.currentTarget.getBoundingClientRect() }); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover(null); }}
        onClick={(e) => { if (isTouch()) onHover({ num, rect: e.currentTarget.getBoundingClientRect(), pinned: true }); else if (canAdd) onAdd(num, 1); }}>
        <img src={cardImage(d)} alt={d.name} loading="lazy" draggable={false} />
        {count > 0 && <span className="db-badge">×{count}</span>}
        {owned !== undefined && owned > 0 && <span className="db-owned" title={`${owned} exemplaire${owned > 1 ? 's' : ''} dans ta ${inHold ? 'Cale' : 'collection'}`}>{inHold ? '🧰' : '✓'}{owned}</span>}
      </div>
      <div className="db-card-btns">
        <button className="icon-btn" disabled={!count} onClick={() => onAdd(num, -1)} aria-label={`Retirer ${d.name}`}>−</button>
        <button className="icon-btn" disabled={!canAdd} onClick={() => onAdd(num, 1)} aria-label={`Ajouter ${d.name}`}>＋</button>
      </div>
    </div>
  );
}

const COSTS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// hold : seulement les cartes de la Cale (deck d'aventure) ; limit : exemplaires permis d'une carte
function CardBrowser({ leader, cards, full, owned, hold, limit: copies, onAdd, onHover }: {
  leader: string; cards: Record<string, number>; full: boolean; owned: Record<string, number> | null; hold?: Record<string, number>;
  limit: (d: CardDef) => number; onAdd: (num: string, delta: number) => void; onHover: Hover;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [limit, setLimit] = useState(60);
  const pool = useMemo(() => playableNums().filter((n) => fits(leader, n) && (!hold || (hold[n] ?? 0) > 0)), [leader, hold]);
  // cartes de la Cale que le jeu ne sait pas encore jouer (elles ne peuvent pas aller dans un deck)
  const waiting = useMemo(() => (hold ? Object.keys(hold).filter((n) => hold[n] > 0 && !(n in CARDS && cardStatus(n) !== 'todo')).length : 0), [hold]);
  const text = q.trim().toLowerCase();
  const shown = pool
    .filter((n) => {
      const d = CARDS[n];
      if (category && d.category !== category) return false;
      if (cost && (cost === '10' ? (d.cost ?? 0) < 10 : (d.cost ?? 0) !== Number(cost))) return false;
      if (onlyOwned && !(owned?.[n])) return false;
      return !text || n.toLowerCase().includes(text) || d.name.toLowerCase().includes(text) || d.names.some((x) => x.toLowerCase().includes(text))
        || d.typeLabels.some((t) => t.toLowerCase().includes(text)) || d.effect.toLowerCase().includes(text);
    })
    .sort((a, b) => (CARDS[a].cost ?? 0) - (CARDS[b].cost ?? 0) || CARDS[a].name.localeCompare(CARDS[b].name) || a.localeCompare(b));
  return (
    <>
      <div className="db-filters">
        <input className="db-search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="Nom, numéro, type, mot de l’effet…" aria-label="Rechercher une carte" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes</option>
          {Object.entries(CATEGORY_FR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Coût">
          {COSTS.map((c) => <option key={c} value={c}>{c === '' ? 'Tout coût' : c === '10' ? 'Coût 10+' : `Coût ${c}`}</option>)}
        </select>
        {!hold && <label className="db-check"><input type="checkbox" checked={onlyOwned} disabled={!owned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Possédées</label>}
      </div>
      <p className="op-small op-muted">{shown.length} carte{shown.length > 1 ? 's' : ''}{full ? ' · deck complet (50 cartes)' : ''} · {hold
        ? `cartes de ta Cale permises avec ce Leader${waiting ? ` ; ${waiting} sorte${waiting > 1 ? 's' : ''} de ta Cale pas encore jouable${waiting > 1 ? 's' : ''} par le jeu` : ''}.`
        : 'seules les cartes que le jeu sait déjà jouer sont proposées ; il y en aura de plus en plus.'}</p>
      <div className="db-grid">
        {shown.slice(0, limit).map((n) => {
          const count = cards[n] ?? 0;
          return <CardPick key={n} num={n} count={count} canAdd={!full && count < copies(CARDS[n])} owned={owned?.[n]} inHold={Boolean(hold)} onAdd={onAdd} onHover={onHover} />;
        })}
      </div>
      {hold && !pool.length && <p className="op-muted">Aucune carte de ta Cale ne va avec ce Leader : ouvre des boosters pour en gagner.</p>}
      {shown.length > limit && <button className="op-btn op-btn-ghost db-more" onClick={() => setLimit((l) => l + 60)}>Afficher plus ({shown.length - limit})</button>}
    </>
  );
}

function DeckContents({ cards, owned, inHold, limit, onAdd, onHover, full }: {
  cards: Record<string, number>; owned: Record<string, number> | null; inHold: boolean; limit: (d: CardDef) => number;
  onAdd: (num: string, delta: number) => void; onHover: Hover; full: boolean;
}) {
  const list = Object.entries(cards).map(([num, n]) => ({ num, n, d: def(num) }));
  if (!list.length) return <p className="op-muted db-empty">Ton deck est vide : ajoute des cartes depuis l’onglet « Ajouter des cartes ».</p>;
  return (
    <>
      {Object.entries(CATEGORY_FR).map(([cat, label]) => {
        const group = list.filter((c) => c.d.category === cat).sort((a, b) => (a.d.cost ?? 0) - (b.d.cost ?? 0) || a.d.name.localeCompare(b.d.name));
        if (!group.length) return null;
        return (
          <div key={cat} className="db-group">
            <h3>{label} ({group.reduce((s, c) => s + c.n, 0)})</h3>
            {group.map(({ num, n, d }) => (
              <div key={num} className="db-line">
                <CardThumb num={num} size="mini" onHover={onHover} />
                <div className="db-line-text">
                  <span>{d.name}</span>
                  <span className="op-small op-muted">{num} · coût {d.cost ?? 0}{d.power !== null ? ` · ${d.power}` : ''}{d.counter ? ` · Contre +${d.counter}` : ''}
                    {owned ? <> · <span className={(owned[num] ?? 0) >= n ? 'db-ok' : 'db-ko'}>{inHold
                      ? `${owned[num] ?? 0} dans ta Cale`
                      : `${Math.min(owned[num] ?? 0, n)}/${n} possédée${n > 1 ? 's' : ''}`}</span></> : null}</span>
                </div>
                <div className="db-line-btns">
                  <button className="icon-btn" onClick={() => onAdd(num, -1)} aria-label={`Retirer ${d.name}`}>−</button>
                  <b>{n}</b>
                  <button className="icon-btn" disabled={full || n >= limit(d)} onClick={() => onAdd(num, 1)} aria-label={`Ajouter ${d.name}`}>＋</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// holdIssues : deck d'aventure (le tournoi officiel et la collection réelle ne le concernent pas)
function DeckCheck({ draft, errors, official, holdIssues }: { draft: Draft; errors: string[]; official: ReturnType<typeof formatIssues>; holdIssues?: string[] }) {
  const [prices, setPrices] = useState<Record<string, CardCollection> | null>(null);
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [wished, setWished] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const numbers = Object.keys(draft.cards).join();
  useEffect(() => {
    setPrices(null);
    if (holdIssues) return;
    const nums = [draft.leader, ...Object.keys(draft.cards)];
    const t = setTimeout(() => { deckPrices(nums).then(setPrices, () => setPrices({})); }, 500);
    return () => clearTimeout(t);
  }, [draft.leader, numbers]);
  const deck: DeckList = { id: draft.id, name: draft.name, series: 'PERSO', leader: draft.leader, cards: draft.cards };
  const needed: [string, number][] = [[draft.leader, 1], ...Object.entries(draft.cards)];
  const missing = prices ? needed.map(([num, n]) => [num, Math.max(0, n - (prices[num]?.owned ?? 0))] as [string, number]).filter(([, m]) => m > 0) : [];
  const missingCount = missing.reduce((s, [, m]) => s + m, 0);
  const cost = missing.reduce((s, [num, m]) => s + m * (prices?.[num]?.cheapest?.eur ?? 0), 0);
  const unpriced = missing.filter(([num]) => !prices?.[num]?.cheapest).length;
  const toWish = Object.fromEntries(missing.filter(([num]) => !prices?.[num]?.wished));
  const text = deckText(draft);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="db-check-body">
      <section className="hist-section">
        <h3>Règles du jeu</h3>
        {errors.length
          ? <ul className="db-issues">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          : <p className="db-ok">✔ Ce deck est jouable dans l’appli, contre l’IA et en ligne{holdIssues ? ', et peut servir pour l’aventure' : ''}.</p>}
      </section>
      {holdIssues && (
        <section className="hist-section">
          <h3>Avec ta Cale</h3>
          {holdIssues.length
            ? <ul className="db-issues">{holdIssues.map((e) => <li key={e}>{e}</li>)}</ul>
            : <p className="db-ok">✔ Toutes ses cartes sont dans ta Cale.</p>}
        </section>
      )}
      <section className="hist-section">
        <h3>Courbe des coûts</h3>
        <CostCurve deck={deck} />
        <DeckStats deck={deck} />
      </section>
      {!holdIssues && <>
      <section className="hist-section">
        <h3>Tournoi officiel</h3>
        {official.errors.length
          ? <ul className="db-issues">{official.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          : <p className="db-ok">✔ Aucune carte bannie ni limitée au-delà d’un exemplaire.</p>}
        {official.standard.length > 0 && (
          <>
            <p className="op-small">Format Standard (blocs 2 à 5) : à vérifier, une réédition récente peut rendre ces cartes permises.</p>
            <ul className="db-issues db-warn">{official.standard.map((e) => <li key={e}>{e}</li>)}</ul>
          </>
        )}
        {official.pairs.length > 0 && <ul className="db-issues db-warn">{official.pairs.map((e) => <li key={e}>{e}</li>)}</ul>}
      </section>
      <section className="hist-section">
        <h3>Avec ma collection</h3>
        {!prices ? <p className="op-muted op-small">Calcul…</p> : !missingCount ? <p className="db-ok">✔ Tu as toutes les cartes pour le construire en vrai.</p> : (
          <>
            <p>Il te manque <b>{missingCount} carte{missingCount > 1 ? 's' : ''}</b> pour le construire en vrai : environ <b>{euros(cost)}</b>{unpriced ? ` (sans ${unpriced} carte${unpriced > 1 ? 's' : ''} au prix inconnu)` : ''}, en prenant la version la moins chère.</p>
            <ul className="db-missing">
              {missing.map(([num, m]) => <li key={num}>{m}× {def(num).name} <span className="op-muted">({num}{prices[num]?.cheapest ? `, ${euros(prices[num].cheapest!.eur)}` : ''}{prices[num]?.wished ? ', déjà dans tes recherches' : ''})</span></li>)}
            </ul>
            {Object.keys(toWish).length > 0 && (
              <div className="db-row">
                <select value={lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')} aria-label="Langue des cartes recherchées">
                  <option value="fr">en français</option>
                  <option value="en">en anglais</option>
                </select>
                <button className="op-btn op-btn-ghost btn-small" onClick={() => wishMissing(toWish, lang).then((r) => { setWished(`${r.added} carte${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''} à tes recherches`); setPrices(null); deckPrices([draft.leader, ...Object.keys(draft.cards)]).then(setPrices, () => {}); }, (e: Error) => setWished(e.message))}>
                  Ajouter les manquantes à mes recherches
                </button>
              </div>
            )}
            {wished && <p className="op-small">{wished}</p>}
          </>
        )}
      </section>
      </>}
      <section className="hist-section">
        <h3>Exporter</h3>
        <textarea className="db-text" rows={6} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
        <div className="db-row"><button className="op-btn op-btn-ghost btn-small" onClick={copy}>{copied ? '✔ Copiée' : 'Copier la liste'}</button></div>
      </section>
    </div>
  );
}
