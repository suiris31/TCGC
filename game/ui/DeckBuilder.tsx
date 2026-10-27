// Éditeur de decks (phase 5, refait par R3.4) : mes decks (créer, copier un deck, importer une liste), et l'éditeur d'un
// deck : cartes jouables compatibles avec le Leader (filtres, cartes possédées), liste du deck, bilan (courbe des
// coûts, règles de construction, tournoi officiel, cartes manquantes de ma collection et leur prix). Téléphone d'abord :
// sur un écran étroit, catalogue, deck et bilan sont trois onglets ; sur un grand écran, trois colonnes.
// Mode « cartes de la Cale » (deck d'aventure, HoldMode) : le même éditeur ne propose que les cartes possédées dans la
// Cale du mode Aventure, au plus min(possédées, 4) par numéro, et enregistre le deck en mode 'aventure'.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, cardStatus, HIDDEN } from '../engine/cards/index.ts';
import { anyNumber, DECK_SIZE, formatIssues, MAX_COPIES, playableErrors, type Regulations } from '../engine/deckRules.ts';
import { deckSize, type DeckList } from '../engine/decks.ts';
import { def } from '../engine/rules.ts';
import type { CardDef, Color } from '../engine/types.ts';
import { chooseAdventureDeck } from './adventure/api.ts';
import { ApiError, call } from './api.ts';
import { holdLimit, holdProblems } from './adventure/hold.ts';
import { fetchHoldState } from './adventure/holdState.ts';
import type { Preview } from './CardView.tsx';
import { CardThumb, CostCurve, DeckStats } from './DeckGuide.tsx';
import { cardImage } from './images.ts';
import { isTouch } from './device.ts';
import { Button, Dialog } from './kit/index.ts';
import { openLayers } from './kit/logic.ts';
import {
  deckInfo, deckPrices, deckText, deleteMyDeck, isAdventureDeck, newDeckId, ownedNumbers, parseDeckText, playable, saveMyDeck, useMyDecks, wishMissing,
  type CardCollection, type MyDeck,
} from './myDecks.ts';
import { goUp, navigate, useLayer, useLeaveGuard, useRoute } from './routes.ts';
import { DeckPicker } from './setup/DeckPicker.tsx';

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
    // refus du serveur : aucune carte signalée ; serveur injoignable : redemandé à la prochaine ouverture
    call<Regulations>('GET', 'regulations')
      .catch((e: unknown) => { if (e instanceof ApiError && e.status) return {}; throw e; })
      .then((x) => { regsCache = x; setRegs(x); }, () => {});
  }, []);
  return regs;
}

const draftOf = (d: MyDeck): Draft => ({ id: d.id, name: d.name, leader: d.leader, cards: { ...d.cards } });

// Mes decks (#play/decks) : une fenêtre du kit avec mes decks (le même sélecteur que pour jouer) ; un deck s'ouvre dans
// l'éditeur à sa propre adresse (#play/decks/<id>) : le Retour revient à la liste. Un deck neuf n'a son adresse que
// dans cet écran (un rechargement avant sa première carte revient à la liste).
export function DeckBuilderScreen({ onClose, onHover, onPlay }: { onClose: () => void; onHover: Hover; onPlay: (id: string) => void }) {
  const { decks, ready, error } = useMyDecks();
  const route = useRoute();
  const editing = route.name === 'decks' ? route.id : undefined;
  const [fresh, setFresh] = useState<Draft | null>(null);   // deck neuf, pas encore enregistré
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [holdMode, setHoldMode] = useState<HoldMode | null>(null);
  const stored = editing ? decks.find((d) => d.id === editing) : undefined;
  const draft = editing ? (fresh?.id === editing ? fresh : stored ? draftOf(stored) : null) : null;
  const adventure = Boolean(stored && isAdventureDeck(stored));

  // un deck d'aventure s'ouvre en mode « cartes de la Cale », lue à chaque ouverture (des boosters ont pu s'ouvrir)
  useEffect(() => {
    if (!adventure) return;
    let cancelled = false;
    setHoldMode(null);
    loadHoldMode().then(
      (m) => { if (!cancelled) setHoldMode(m); },
      (e: Error) => {
        if (cancelled) return;
        setNotice(`Impossible d’ouvrir ce deck d’aventure : ${e.message}`);
        goUp({ name: 'decks' });
      },
    );
    return () => { cancelled = true; };
  }, [adventure, editing]);
  // adresse d'un deck inconnu (supprimé, ou deck neuf avant un rechargement) : la liste
  const found = Boolean(draft);
  useEffect(() => {
    if (editing && ready && !found) navigate({ name: 'decks' }, { replace: true });
  }, [editing, ready, found]);

  const open = (d: Draft, isNew = false) => {
    setNotice(null);
    setFresh(isNew ? d : null);
    navigate({ name: 'decks', id: d.id });
  };
  const back = () => {
    setFresh(null);
    goUp({ name: 'decks' });
  };
  const copy = (id: string) => {
    setCopying(false);
    const src = deckInfo(id);
    // la copie d'un deck d'aventure est un deck libre (toutes les cartes)
    if (src) open({ id: newDeckId(), name: `${src.name} (copie)`.slice(0, 40), leader: src.leader, cards: { ...src.cards } }, true);
  };

  if (editing) {
    if (!draft || (adventure && !holdMode)) {
      return <div className="opc-wait" data-ui="editor-loading"><span className="op-spinner" /> Ouverture du deck…</div>;
    }
    return <DeckEditor key={draft.id} initial={draft} existing={Boolean(stored)} hold={adventure ? holdMode ?? undefined : undefined}
      onBack={back} onHover={onHover} onPlay={onPlay} />;
  }
  return (
    <Dialog title="🃏 Mes decks" onClose={onClose} size="wide" history={false} className="db db-list-dialog" data-ui="decks">
      <div className="db-actions">
        <Button variant="primary" data-ui="decks.new" onClick={() => setPicking(true)}>＋ Nouveau deck</Button>
        <Button data-ui="decks.copy" onClick={() => setCopying(true)}>Copier un deck</Button>
        <Button data-ui="decks.import" onClick={() => setImporting(true)}>Importer une liste</Button>
      </div>
      {notice && <p className="db-notice">{notice}</p>}
      {error && <p className="danger">Impossible de charger tes decks : vérifie ta connexion.</p>}
      {!ready && !error && <p className="op-muted"><span className="op-spinner" /> Chargement de tes decks…</p>}
      {ready && (
        <DeckPicker source="mine" label="Modifier" onPick={(id) => { const d = decks.find((x) => x.id === id); if (d) open(draftOf(d)); }}
          actions={(id) => {
            const d = decks.find((x) => x.id === id);
            if (!d) return null;
            return <>
              <button className="deck-guide-btn" data-ui="decks.copy-one" onClick={() => copy(id)} aria-label={`Copier ${d.name}`}>Copier</button>
              {playable(d) && <button className="deck-guide-btn deck-play-btn" data-ui="decks.play" onClick={() => onPlay(id)} aria-label={`Jouer avec ${d.name}`}>▶ Jouer</button>}
            </>;
          }}
          empty={(
            <div className="history-empty">
              <p>Tu n’as pas encore de deck à toi.</p>
              <p className="op-muted op-small">Crée-en un à partir d’un Leader, copie un deck préconstruit pour le modifier, ou colle une liste trouvée sur un site de decks. L’éditeur ne propose que les cartes que le jeu sait déjà jouer.</p>
            </div>
          )} />
      )}
      {ready && decks.some((d) => isAdventureDeck(d)) && (
        <p className="op-small op-muted">Un deck d’aventure ne contient que des cartes gagnées dans l’Aventure (ta Cale). Pour un deck avec toutes les cartes, copie-le : la copie sera un deck libre.</p>
      )}
      {picking && (
        <LeaderPicker onClose={() => setPicking(false)} onHover={onHover}
          onPick={(leader) => { setPicking(false); open({ id: newDeckId(), name: `Mon ${def(leader).name}`.slice(0, 40), leader, cards: {} }, true); }} />
      )}
      {copying && (
        <Dialog title="Copier un deck" onClose={() => setCopying(false)} size="wide" data-ui="decks.copy-dialog">
          <p className="op-small op-muted">Choisis le deck à copier : la copie s’ouvre dans l’éditeur, l’original ne change pas.</p>
          <DeckPicker onPick={copy} label="Copier" />
        </Dialog>
      )}
      {importing && (
        <ImportBox onClose={() => setImporting(false)}
          onImport={(d, unknown) => {
            setImporting(false);
            open(d, true);
            if (unknown.length) setNotice(`Lignes ignorées : ${unknown.join(', ')}`);
          }} />
      )}
    </Dialog>
  );
}

// only : Leaders proposés seulement s'ils sont dans la Cale (mode « cartes de la Cale »)
export function LeaderPicker({ onPick, onClose, onHover, only }: { onPick: (num: string) => void; onClose: () => void; onHover: Hover; only?: Record<string, number> }) {
  const leaders = useMemo(() => playableNums().filter((n) => CARDS[n].category === 'LEADER' && (!only || (only[n] ?? 0) > 0))
    .sort((a, b) => CARDS[a].colors.join().localeCompare(CARDS[b].colors.join()) || CARDS[a].name.localeCompare(CARDS[b].name)), [only]);
  return (
    <Dialog title="Choisis ton Leader" onClose={() => { onHover(null); onClose(); }} size="wide" className="db-leaders" data-ui="leaders">
      <p className="op-small op-muted">{only
        ? 'Seuls les Leaders de ta Cale que le jeu sait déjà jouer sont proposés : gagne des boosters pour en trouver d’autres.'
        : 'Seuls les Leaders que le jeu sait déjà jouer sont proposés.'}</p>
      <div className="db-leader-grid">
        {leaders.map((n) => (
          <button key={n} className="db-leader" data-ui="leaders.item" onClick={() => { onHover(null); onPick(n); }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ num: n, rect: e.currentTarget.getBoundingClientRect() }); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover(null); }}>
            <img src={cardImage(CARDS[n])} alt="" loading="lazy" />
            <span>{CARDS[n].name}</span>
            <span className="op-small op-muted">{CARDS[n].colors.map((c) => COLOR_FR[c]).join('/')} · {n}</span>
          </button>
        ))}
      </div>
      {!leaders.length && <p className="op-muted">Aucun Leader jouable dans ta Cale pour l’instant.</p>}
    </Dialog>
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
  // une liste collée ne se perd pas d'un clic à côté de la fenêtre
  return (
    <Dialog title="Importer une liste" onClose={onClose} className="db-import" data-ui="import" closeOnBackdrop={!text.trim()}
      actions={<Button variant="primary" data-ui="import.go" onClick={go} disabled={!text.trim()}>Importer</Button>}>
      <p className="op-small op-muted">Colle une liste au format courant des sites de decks : une carte par ligne, « 4xOP13-008 », Leader compris.</p>
      <textarea className="db-text" rows={12} data-autofocus value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
        placeholder={'1xOP13-004\n4xOP13-008\n4xOP12-090\n…'} aria-label="Liste du deck" />
      {error && <p className="danger op-small">{error}</p>}
    </Dialog>
  );
}

// ---------- Éditeur d'un deck ----------

type Pane = 'cards' | 'deck' | 'check';
type SaveState = 'saved' | 'saving' | 'pending' | 'error';

// existing : deck déjà enregistré ; un deck neuf n'est enregistré qu'à sa première carte (pas de deck vide oublié).
// hold : mode « cartes de la Cale » (deck d'aventure) ; onPlay : bouton « Jouer » (partie rapide avec ce deck).
// Quitter (« ← », Échap, clic à côté, Retour du navigateur) n'est jamais une perte : l'enregistrement en attente part
// tout de suite et l'éditeur attend sa réponse ; s'il échoue (ou que le deck n'a pas de nom), il demande avant de
// quitter sans enregistrer. layered : l'éditeur n'a pas sa propre adresse (deck d'aventure) ; il ajoute une entrée
// d'historique, que le Retour du navigateur referme (comme une fenêtre).
export function DeckEditor({ initial, existing, hold, layered = false, onBack, onHover, onPlay }: {
  initial: Draft; existing: boolean; hold?: HoldMode; layered?: boolean; onBack: () => void; onHover: Hover; onPlay?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pane, setPane] = useState<Pane>(Object.keys(initial.cards).length ? 'deck' : 'cards');
  const [save, setSaveState] = useState<SaveState>('pending');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changeLeader, setChangeLeader] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [owned, setOwned] = useState<Record<string, number> | null>(hold ? hold.hold : null);
  const [chosen, setChosen] = useState(hold?.chosen ?? null);
  const [choosing, setChoosing] = useState<string | null>(null);
  // quitter : en attente de l'enregistrement, ou question « Quitter sans enregistrer ? »
  const [leaving, setLeaving] = useState<null | 'wait' | 'ask'>(null);
  const first = useRef(true);
  const stored = useRef(existing);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // enregistrement prévu mais pas encore parti : fait tout de suite si l'éditeur se ferme (changement d'onglet de
  // TCGC) ou si la page passe en arrière-plan, pour ne pas perdre la dernière modification
  const pending = useRef<(() => void) | null>(null);
  // enregistrement parti (sa réponse : enregistré ou non), et état lu par les gestionnaires
  const saving = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<SaveState>('pending');
  const setSave = (s: SaveState) => { saveRef.current = s; setSaveState(s); };
  const regs = useRegulations();
  const limit = (d: CardDef) => (hold ? holdLimit(hold.hold, d) : maxCopies(d));

  const send = (d: Draft) => {
    pending.current = null;
    setSave('saving');
    const p = saveMyDeck(hold ? { ...d, mode: 'aventure' } : d).then(
      () => { stored.current = true; if (saving.current === p) { setSave('saved'); setSaveError(null); } return true; },
      (e: Error) => { if (saving.current === p) { setSave('error'); setSaveError(e.message); } return false; },
    );
    saving.current = p;
    return p;
  };

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
    const run = () => { void send(draft); };
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

  // il y a une modification à perdre : un deck neuf vide, sans enregistrement, n'en a pas
  const atRisk = () => stored.current || Object.keys(draft.cards).length > 0;
  // « ← Mes decks », Échap, clic à côté, Retour du navigateur
  const requestLeave = async () => {
    if (leaving) return;
    clearTimeout(timer.current);
    pending.current?.();
    if (saveRef.current === 'saving' && saving.current) {
      setLeaving('wait');
      await saving.current;
    }
    if (saveRef.current === 'error' && atRisk()) setLeaving('ask');
    else onBack();
  };
  const leaveRef = useRef(requestLeave);
  leaveRef.current = requestLeave;
  useLayer(layered, () => void leaveRef.current());
  // un deck qui ne s'enregistre pas : le Retour du navigateur (ou un onglet de TCGC) demande d'abord
  useLeaveGuard(save === 'error' && atRisk(), () => void leaveRef.current());
  // la page se ferme pendant un enregistrement, ou avec un deck pas enregistré : le navigateur demande
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saveRef.current === 'saving' || (saveRef.current === 'error' && atRisk())) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  });
  // Échap : quitter l'éditeur (une fenêtre ouverte dessus, comme le choix du Leader, se ferme d'abord, par le kit)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || openLayers.top()) return;
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      e.preventDefault();
      e.stopPropagation();
      void leaveRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    saving.current = null;
    await deleteMyDeck(draft.id).catch(() => {});
    onBack();
  };
  const retry = () => {
    setLeaving('wait');
    void send(draft).then((ok) => { if (ok) onBack(); else setLeaving('ask'); });
  };
  const L = def(draft.leader);
  const saveText = { saved: 'Enregistré', saving: 'Enregistrement…', pending: stored.current ? 'Modifié' : 'Pas encore enregistré', error: 'Pas enregistré' }[save];
  return (
    <div className="modal" onClick={() => void requestLeave()}>
      <div className="modal-box history db db-editor" data-ui="editor" onClick={(e) => e.stopPropagation()}
        style={{ ['--c1' as string]: COLOR_HEX[L.colors[0]] ?? '#666', ['--c2' as string]: COLOR_HEX[L.colors[1] ?? L.colors[0]] ?? '#666' }}>
        <header className="history-head db-head">
          <Button variant="quiet" icon="back" className="db-back" data-ui="editor.back" busy={leaving === 'wait'} onClick={() => void requestLeave()}>Mes decks</Button>
          <textarea className="db-name" rows={1} value={draft.name} maxLength={40} aria-label="Nom du deck" spellCheck={false}
            onChange={(e) => { const name = e.target.value.replace(/\s*\n\s*/g, ' '); setDraft((d) => ({ ...d, name })); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          <span className={`op-small db-save ${save === 'error' ? 'danger' : 'op-muted'}`} title={saveError ?? undefined} data-ui="editor.save">{saveText}</span>
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
            ? <span className="op-chip op-db-tag" title="C’est avec ce deck que tu joues les chapitres de l’aventure">✔ Choisi pour l’aventure</span>
            : !errors.length && save === 'saved' && <button className="op-btn op-btn-primary btn-small" onClick={choose} disabled={choosing === '…'}>Choisir pour l’aventure</button>)}
          {onPlay && !errors.length && save === 'saved' && <button className={`op-btn ${hold ? 'op-btn-ghost' : 'op-btn-primary'} btn-small`} data-ui="editor.play" onClick={() => onPlay(draft.id)}>▶ Jouer</button>}
        </div>
        {hold && (
          <p className="op-small op-muted op-db-holdnote">
            Deck d’aventure : seules les cartes de ta Cale sont proposées, autant d’exemplaires que tu en as (4 au plus).
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
        {leaving === 'ask' && (
          <Dialog title="Ce deck n’est pas enregistré" alert size="small" onClose={() => setLeaving(null)} history={false} data-ui="editor.unsaved"
            actions={<>
              <Button variant="danger" data-ui="editor.discard" onClick={() => { setLeaving(null); onBack(); }}>Quitter sans enregistrer</Button>
              {draft.name.trim() && <Button data-ui="editor.retry" onClick={retry}>Réessayer</Button>}
              <Button variant="primary" data-ui="editor.stay" data-autofocus onClick={() => setLeaving(null)}>Rester</Button>
            </>}>
            <p>{saveError ?? 'La dernière modification n’a pas pu être enregistrée.'}</p>
            <p className="op-small op-muted">Si tu quittes maintenant, {stored.current ? 'tes dernières modifications seront perdues' : 'ce deck ne sera pas gardé'}.</p>
          </Dialog>
        )}
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
