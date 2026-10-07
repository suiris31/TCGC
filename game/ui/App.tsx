import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiWorker } from '../ai/client.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import { LEVELS, type Analysis, type Level } from '../ai/search.ts';
import { buildRecord, recordId, replayRecord, type GameRecord, type GameSummary } from '../coach/archive.ts';
import { buildRecap, HINT, isReviewable, REVIEW, toReview, type Move, type MoveReview } from '../coach/review.ts';
import { DECKS } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { def } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { Hand, OpponentHand, PlayerZone, type BoardUi } from './Board.tsx';
import { type CardLook, type Preview } from './CardView.tsx';
import { CoachHint, EndScreen, recordText, type RecordLine } from './Coach.tsx';
import { attackPreview, phaseLabel, readDecision, remainingActions, whyNot, type CardAction } from './decision.ts';
import { Celebration, FxLayer, Intro } from './Fx.tsx';
import { ActionBar, ActionMenu, BattlePanel } from './Interaction.tsx';
import { ConfirmEndModal, CostModal, HelpModal, MulliganModal, PickerModal, TrashModal, TriggerModal } from './Modals.tsx';
import { CardPreview, DecisionBox, GameLog } from './Panel.tsx';
import { UI_SCALES, ZOOM_DELAYS, useSettings, type Settings } from './settings.ts';
import { DeckGuideModal } from './DeckGuide.tsx';
import { GUIDES } from './deckGuides.ts';
import { CardZoom, useCardZoom } from './Zoom.tsx';
import { setSoundEnabled, sfx } from './sound.ts';
import { flushQueue, keepForLater, loadSummaries, saveRecord, whenSaved } from './archiveClient.ts';
import { HistoryScreen } from './History.tsx';
import { useDevice, useWakeLock } from './device.ts';
import { cardImage } from './images.ts';

const HUMAN: PlayerId = 0;
const AI: PlayerId = 1;
// Version du programme enregistrée avec chaque partie
const ENGINE = typeof __ENGINE__ === 'string' ? __ENGINE__ : 'inconnue';

// Fils de calcul séparés (créés au premier besoin) : l'IA, l'analyse du coach en arrière-plan, le conseil à la demande
let aiWorker: AiWorker | null = null;
let reviewWorker: AiWorker | null = null;
let hintWorker: AiWorker | null = null;
const worker = () => (aiWorker ??= new AiWorker());
const coachWorker = () => (reviewWorker ??= new AiWorker());
const adviceWorker = () => (hintWorker ??= new AiWorker());

type First = 'random' | 'me' | 'ai';

interface Config {
  myDeck: string;
  aiDeck: string;
  first: First;
  level: Level;
}

// Partie en cours d'enregistrement (voir game/coach/archive.ts)
interface Recording {
  id: string;
  startedAt: string;
  initial: GameState;
  config: Config;
  practice?: { from: string | null; turn: number };
  undos: { turn: number; undone: number }[];
  extra: Map<number, { ms?: number; hint?: string }>;  // temps de réflexion et conseil affiché, par décision
  endedAt?: string;
}

// Bilan victoires / défaites par confrontation et niveau
type Records = Record<string, RecordLine>;
const recordKey = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) => `${c.myDeck}|${c.aiDeck}|${c.level}`;
const matchupName = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) =>
  `${DECKS[c.myDeck].name} contre ${DECKS[c.aiDeck].name} (${LEVELS[c.level].name})`;

// Calculé à partir des parties enregistrées sur le compte : parties terminées, hors entraînement
function recordsOf(list: GameSummary[]): Records {
  const out: Records = {};
  for (const g of list) {
    if (g.practice || g.mode === 'online' || (g.status !== 'won' && g.status !== 'lost')) continue;
    const key = recordKey({ myDeck: g.config.myDeck, aiDeck: g.config.aiDeck, level: g.config.level as Level });
    const line = out[key] ?? { wins: 0, losses: 0 };
    out[key] = g.status === 'won' ? { ...line, wins: line.wins + 1 } : { ...line, losses: line.losses + 1 };
  }
  return out;
}

// Accès aux parties en ligne depuis l'écran de départ : ouvrir le salon, reprendre une partie ou une salle en cours
export interface OnlineEntry {
  onOpen: () => void;
  resume?: { label: string; onResume: () => void };
}

// notice : message affiché sur l'écran de départ ; onImmersive : une partie occupe tout l'écran (TCGC masque alors sa
// barre d'onglets)
export function App({ notice, onImmersive, online }: { notice?: string; onImmersive?: (on: boolean) => void; online?: OnlineEntry }) {
  const [settings, updateSettings] = useSettings();
  const [config, setConfig] = useState<Config>({ myDeck: 'ST-35', aiDeck: 'ST-32', first: 'random', level: 2 });
  const [session, setSession] = useState<Config>(config);
  const [thinking, setThinking] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [undo, setUndo] = useState<GameState[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [trashOf, setTrashOf] = useState<PlayerId | null>(null);
  const [showEnd, setShowEnd] = useState(true);
  const [records, setRecords] = useState<Records>({});
  const [practice, setPractice] = useState(false);
  const [hint, setHint] = useState<{ for: GameState; analysis: Analysis | null } | null>(null);
  const [menu, setMenu] = useState<{ uid: number; rect: DOMRect } | null>(null);
  const [targeting, setTargeting] = useState<{ attacker: number } | null>(null);
  const [hoverUid, setHoverUid] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [help, setHelp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [intro, setIntro] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [tab, setTab] = useState<'journal' | 'coach' | 'choix'>('journal');
  const keepMenu = useRef<number | null>(null);
  // Téléphone : le journal, le coach et tous les choix sont dans un tiroir (panel) ; sur écran tactile, la cible
  // d'attaque touchée (aimed) montre le résultat prévu et attend la confirmation
  const { compact, touch } = useDevice();
  const [panel, setPanel] = useState(false);
  const [aimed, setAimed] = useState<number | null>(null);
  useEffect(() => setAimed(null), [targeting]);
  useWakeLock(game !== null && game.winner === null);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  useEffect(() => { document.documentElement.style.setProperty('--ui', String(settings.uiScale)); }, [settings.uiScale]);
  const cardZoom = useCardZoom(settings.zoomDelay);
  const [guide, setGuide] = useState<string | null>(null);

  // Décisions du joueur et leur analyse par le coach, faite en arrière-plan pendant la partie
  const moves = useRef<Move[]>([]);
  const reviews = useRef(new Map<number, MoveReview>());
  const nextMove = useRef(1);
  const pumping = useRef(false);
  const recorded = useRef(false);
  const celebrated = useRef(false);
  const [reviewed, setReviewed] = useState(0);

  // Sauvegarde de la partie dans le dossier parties/ : mise à jour au fil des coups, puis à la fin quand le coach a
  // analysé tes décisions. Si l'onglet se ferme, une copie attend dans le navigateur jusqu'au lancement suivant.
  const recording = useRef<Recording | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const shownAt = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [history, setHistory] = useState(false);

  const snapshot = useCallback((abandoned = false): GameRecord | null => {
    const r = recording.current;
    const current = gameRef.current;
    if (!r || !current) return null;
    const rec = buildRecord({
      id: r.id, engine: ENGINE, startedAt: r.startedAt, now: new Date().toISOString(), endedAt: r.endedAt,
      config: r.config, human: HUMAN, practice: r.practice, initial: r.initial, current,
      moves: moves.current, reviews: reviews.current, extra: r.extra, undos: r.undos, abandoned,
    });
    return rec.decisions.length ? rec : null; // quittée avant ton premier choix : rien à garder
  }, []);

  // Fin de l'enregistrement (nouvelle partie, menu) : une partie pas finie est notée abandonnée
  const closeRecording = useCallback(() => {
    clearTimeout(saveTimer.current);
    const rec = snapshot(gameRef.current?.winner === null);
    if (rec) void saveRecord(rec);
    recording.current = null;
  }, [snapshot]);

  const startRecording = (initial: GameState, cfg: Config, practice?: Recording['practice']) => {
    const now = new Date();
    recording.current = { id: recordId(now, cfg, Boolean(practice)), startedAt: now.toISOString(), initial, config: cfg, practice, undos: [], extra: new Map() };
  };

  useEffect(() => {
    gameRef.current = game;
    const r = recording.current;
    if (!r || !game) return;
    if (game.winner !== null && !r.endedAt) r.endedAt = new Date().toISOString();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const rec = snapshot();
      if (rec) void saveRecord(rec);
    }, game.winner !== null ? 300 : 2500);
  }, [game, reviewed, snapshot]);

  // Partie en cours quand on quitte le jeu (autre page de l'appli) : enregistrée comme abandonnée
  useEffect(() => () => closeRecording(), [closeRecording]);

  // Écran de départ : bilan relu sur le serveur, une fois la dernière partie enregistrée
  const inGame = game !== null;
  // une partie, ou une fenêtre ouverte sur l'écran de départ (guide, Mes parties, aide), occupe tout l'écran
  const fullScreen = inGame || history || guide !== null || help;
  useEffect(() => onImmersive?.(fullScreen), [fullScreen, onImmersive]);
  useEffect(() => {
    if (inGame) return;
    let cancelled = false;
    whenSaved().then(loadSummaries).then((list) => { if (!cancelled) setRecords(recordsOf(list)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [inGame]);

  useEffect(() => {
    flushQueue();
    const onHide = () => {
      const rec = snapshot();
      if (rec) keepForLater(rec);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [snapshot]);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = moves.current.find((m) => isReviewable(m, HUMAN) && !reviews.current.has(m.id));
        if (!next) break;
        const analysis = await coachWorker().coach(next.state, { ...REVIEW, include: next.choice });
        if (!moves.current.includes(next)) continue;
        reviews.current.set(next.id, toReview(next, analysis));
        setReviewed(reviews.current.size);
      }
    } finally {
      pumping.current = false;
    }
  }, []);

  // L'IA joue ses décisions (calculées dans un fil séparé), avec un délai minimum pour qu'on puisse suivre
  useEffect(() => {
    if (!game || game.winner !== null || game.decision?.player !== AI) return;
    const current = game;
    const d = current.decision!;
    const started = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setThinking(true);
    const pick = d.inEffect || session.level === 1 || d.options.length === 1
      ? Promise.resolve(heuristicChooser(current, d))
      : worker().choose(current, session.level);
    pick.then((choice) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        setThinking(false);
        setGame((g) => (g === current ? act(g, choice) : g));
      }, Math.max(0, settings.speed - (Date.now() - started)));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setThinking(false);
    };
  }, [game, settings.speed, session.level]);

  // Fin de partie : le résultat compte dans le bilan (sauf une partie reprise depuis un moment revu), puis l'écran
  // de victoire ou de défaite avant le récap
  useEffect(() => {
    if (!game || game.winner === null) return;
    if (!celebrated.current) {
      celebrated.current = true;
      setCelebrate(true);
    }
    if (recorded.current || practice) return;
    recorded.current = true;
    const won = game.winner === HUMAN;
    setRecords((all) => {
      const key = recordKey(session);
      const line = all[key] ?? { wins: 0, losses: 0 };
      return { ...all, [key]: won ? { ...line, wins: line.wins + 1 } : { ...line, losses: line.losses + 1 } };
    });
  }, [game, practice, session]);

  const d = game?.decision ?? null;
  const humanTurn = Boolean(game && d && d.player === HUMAN && game.winner === null);
  const view = useMemo(() => (game && d && humanTurn ? readDecision(game, d) : null), [game, d, humanTurn]);
  const hintNow = hint && hint.for === game ? hint : null;
  useEffect(() => {
    if (humanTurn) shownAt.current = Date.now();
  }, [game, humanTurn]);
  const recommended = hintNow?.analysis?.best ?? null;

  // Conseil automatique du coach à chacune de tes décisions
  const askHint = useCallback(() => {
    if (!game) return;
    const current = game;
    setHint({ for: current, analysis: null });
    adviceWorker().coach(current, HINT).then((analysis) => {
      setHint((h) => (h && h.for === current ? { for: current, analysis } : h));
    });
  }, [game]);
  useEffect(() => {
    if (settings.autoCoach && game && humanTurn && d && d.options.length > 1 && !(hint && hint.for === game)) askHint();
  }, [settings.autoCoach, game, humanTurn, d, hint, askHint]);

  // Après avoir donné une DON!!, le menu de la carte reste ouvert pour en donner d'autres
  useEffect(() => {
    const uid = keepMenu.current;
    keepMenu.current = null;
    if (uid === null || !view?.byCard.has(uid)) return;
    const el = document.querySelector<HTMLElement>(`.table [data-uid="${uid}"]`);
    if (el) setMenu({ uid, rect: el.getBoundingClientRect() });
  }, [view]);

  // la fenêtre de détail se ferme si la carte survolée a disparu
  useEffect(() => {
    const z = cardZoom.zoom;
    if (z?.uid !== undefined && !document.querySelector(`[data-uid="${z.uid}"]`)) cardZoom.close();
  }, [game, cardZoom]);

  const reviewable = game ? moves.current.filter((m) => isReviewable(m, HUMAN)) : [];
  const total = reviewable.length;
  const done = reviewable.filter((m) => reviews.current.has(m.id)).length;
  const over = game !== null && game.winner !== null;
  const recap = useMemo(
    () => (game && over && done === total ? buildRecap(game, moves.current, reviews.current, HUMAN) : null),
    [game, over, done, total, reviewed],
  );

  const resetUi = () => {
    setMenu(null);
    setTargeting(null);
    setHoverUid(null);
    setConfirmEnd(false);
    setEpoch((e) => e + 1);
  };

  const start = () => {
    closeRecording();
    const first = config.first === 'me' ? HUMAN : config.first === 'ai' ? AI : 'random';
    const initial = newGame({ decks: [config.myDeck, config.aiDeck], names: ['Toi', 'IA'], first });
    setSession(config);
    setGame(initial);
    startRecording(initial, config);
    setUndo([]);
    setShowEnd(true);
    setPractice(false);
    setHint(null);
    setCelebrate(false);
    moves.current = [];
    reviews.current = new Map();
    recorded.current = false;
    celebrated.current = false;
    setReviewed(0);
    resetUi();
    setIntro(true);
    if (!settings.helpSeen) {
      setHelp(true);
      updateSettings({ helpSeen: true });
    }
  };

  const choose = useCallback((id: string) => {
    if (!game) return;
    const moveId = nextMove.current++;
    const advice = hint && hint.for === game && hint.analysis ? hint.analysis.best : undefined;
    recording.current?.extra.set(moveId, { ms: Date.now() - shownAt.current, hint: advice });
    moves.current = [...moves.current, { id: moveId, state: game, choice: id }];
    setUndo((u) => [...u.slice(-80), game]);
    setGame(act(game, id));
    setMenu(null);
    setTargeting(null);
    setHoverUid(null);
    setPanel(false);
    void pump();
  }, [game, pump, hint]);

  const back = useCallback(() => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    if (game) recording.current?.undos.push({ turn: game.turn, undone: game.history.length - previous.history.length });
    const last = moves.current[moves.current.length - 1];
    if (last) reviews.current.delete(last.id);
    moves.current = moves.current.slice(0, -1);
    setUndo(undo.slice(0, -1));
    setGame(previous);
    resetUi();
  }, [undo, game]);

  const requestEnd = useCallback(() => {
    if (!game || !d || d.kind !== 'main') return;
    const remaining = remainingActions(game, d);
    if (settings.confirmEnd && remaining.length) setConfirmEnd(true);
    else choose('end');
  }, [game, d, settings.confirmEnd, choose]);

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        setMenu(null);
        setTargeting(null);
        setConfirmEnd(false);
        setHelp(false);
        setSettingsOpen(false);
        setGuide(null);
        setHistory(false);
        setPanel(false);
        cardZoom.close();
      } else if (e.key === 'Enter' && humanTurn && d?.kind === 'main' && !menu && !targeting && !confirmEnd) {
        requestEnd();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        back();
      } else if (e.key === '?') {
        setHelp((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [humanTurn, d, menu, targeting, confirmEnd, requestEnd, back, cardZoom]);

  // Rejouer un moment d'une partie archivée (depuis « Mes parties ») : comme « Revoir ce moment » du récap
  const resumeArchived = (rec: GameRecord, moveId: number) => {
    const replayed = replayRecord(rec);
    const index = replayed.moves.findIndex((m) => m.id === moveId);
    if (index < 0) throw new Error('ce moment n’existe plus dans la partie');
    closeRecording();
    const state = replayed.moves[index].state;
    const cfg: Config = { myDeck: rec.config.myDeck, aiDeck: rec.config.aiDeck, level: rec.config.level as Level, first: rec.config.first };
    const earlier = replayed.moves.slice(0, index);
    moves.current = earlier;
    nextMove.current = Math.max(nextMove.current, ...replayed.moves.map((m) => m.id + 1));
    reviews.current = new Map(rec.reviews.filter((r) => earlier.some((m) => m.id === r.id)).map((r) => [r.id, r]));
    setReviewed(reviews.current.size);
    setConfig(cfg);
    setSession(cfg);
    setPractice(true);
    setUndo([]);
    setHint(null);
    setShowEnd(true);
    setCelebrate(false);
    celebrated.current = false;
    setHistory(false);
    startRecording(state, cfg, { from: rec.id, turn: state.turn });
    setGame(state);
    resetUi();
  };

  if (!game) {
    return (
      <>
        <SetupScreen notice={notice} online={online} config={config} records={records} onChange={setConfig} onStart={start} onHelp={() => setHelp(true)} help={help} closeHelp={() => setHelp(false)}
          settings={settings} updateSettings={updateSettings} onGuide={setGuide} onHistory={() => setHistory(true)} />
        {guide && <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); }} onHover={cardZoom.onHover} />}
        {history && <HistoryScreen onClose={() => { setHistory(false); cardZoom.close(); }} onResume={resumeArchived} onHover={cardZoom.onHover} />}
        {cardZoom.zoom && <CardZoom preview={cardZoom.zoom} onClose={cardZoom.close} />}
      </>
    );
  }

  // ---------- Apparence des cartes : ce qu'on peut en faire, cibles, conseils ----------
  const looks = new Map<number, CardLook>();
  const recommendedUid = (() => {
    if (!recommended || !view) return null;
    if (recommended.startsWith('attack:')) return Number(recommended.split(':')[1]);
    for (const [uid, actions] of view.byCard) if (actions.some((a) => a.option.id === recommended)) return uid;
    return null;
  })();
  if (view && humanTurn) {
    if (targeting) {
      looks.set(targeting.attacker, { selected: true });
      for (const o of view.attacks.get(targeting.attacker) ?? []) {
        looks.set(o.target!, { target: true, recommended: recommended === o.id, selected: aimed === o.target });
      }
    } else {
      for (const [uid, actions] of view.byCard) {
        const useful = actions.some((a) => !a.useless);
        const choosing = actions.every((a) => a.kind === 'choose');
        const counter = actions.find((a) => a.kind === 'counter' || a.kind === 'cevent');
        const num = game.players[HUMAN].hand.find((c) => c.uid === uid)?.num;
        looks.set(uid, {
          actionable: useful && !choosing,
          choose: choosing,
          recommended: recommendedUid === uid,
          selected: menu?.uid === uid,
          drop: dragging && actions.some((a) => a.kind === 'don'),
          badge: counter && num ? (counter.kind === 'counter' ? `+${def(num).counter}` : 'Contre') : undefined,
        });
      }
      if (d?.kind === 'main') {
        for (const c of game.players[HUMAN].hand) if (!view.byCard.has(c.uid)) looks.set(c.uid, { dim: true });
      }
    }
  }

  const onCard = (uid: number, el: HTMLElement, num: string) => {
    if (view && humanTurn && targeting) {
      const option = (view.attacks.get(targeting.attacker) ?? []).find((o) => o.target === uid);
      if (option && touch && aimed !== uid) {
        // écran tactile : premier toucher sur une cible = résultat prévu, l'attaque part avec « Attaquer »
        sfx('click');
        setAimed(uid);
      } else if (option) {
        sfx('click');
        choose(option.id);
      } else if (uid === targeting.attacker) {
        setTargeting(null);
      }
      return;
    }
    if (view && humanTurn && (view.byCard.has(uid) || (d && whyNot(game, d, uid)))) {
      sfx('click');
      cardZoom.close();
      setMenu({ uid, rect: el.getBoundingClientRect() });
      return;
    }
    // écran tactile : toute autre carte (adversaire, carte sans action) s'ouvre en grand
    if (touch) cardZoom.onHover({ num, uid, rect: el.getBoundingClientRect(), pinned: true });
  };

  const onAction = (uid: number, a: CardAction) => {
    if (a.kind === 'attack') {
      setMenu(null);
      setTargeting({ attacker: uid });
      return;
    }
    if (a.kind === 'don') keepMenu.current = uid;
    choose(a.option.id);
  };

  const onHover = (p: Preview | null) => {
    setPreview(p);
    setHoverUid(p?.uid ?? null);
    cardZoom.onHover(p);
  };

  const ui: BoardUi = {
    looks,
    onCard,
    onHover,
    onTrash: setTrashOf,
    onDropDon: (uid) => {
      setDragging(false);
      if (d?.options.some((o) => o.id === `don:${uid}`)) choose(`don:${uid}`);
    },
    donDraggable: Boolean(humanTurn && d?.kind === 'main' && d.options.some((o) => o.id.startsWith('don:'))),
    onDonDrag: setDragging,
  };

  const aimUid = touch ? aimed : hoverUid;
  const targetPreview = targeting && aimUid !== null && (view?.attacks.get(targeting.attacker) ?? []).some((o) => o.target === aimUid)
    ? attackPreview(game, targeting.attacker, aimUid)
    : null;
  const aimedOption = targeting && aimed !== null ? (view?.attacks.get(targeting.attacker) ?? []).find((o) => o.target === aimed) : undefined;

  // Replay depuis le récap
  const replay = (id: number) => {
    const index = moves.current.findIndex((m) => m.id === id);
    if (index < 0) return;
    const state = moves.current[index].state;
    const from = recording.current?.id ?? null;
    closeRecording();
    startRecording(state, session, { from, turn: state.turn });
    moves.current = moves.current.slice(0, index);
    for (const key of [...reviews.current.keys()]) if (!moves.current.some((m) => m.id === key)) reviews.current.delete(key);
    setReviewed(reviews.current.size);
    setPractice(true);
    setUndo([]);
    setHint(null);
    setShowEnd(true);
    setCelebrate(false);
    celebrated.current = false;
    setGame(state);
    resetUi();
  };

  const special = view?.special;
  const leave = () => {
    closeRecording();
    setGame(null);
  };
  const pickerOpen = Boolean(view && view.picks.length && !special);
  const menuActions = menu && view ? view.byCard.get(menu.uid) ?? [] : [];

  return (
    <div className="game" onClick={() => setSettingsOpen(false)}>
      <main className="table">
        <header className="op-topbar">
          <div className="op-brand">☠ OP Coach</div>
          <div className="match op-small op-muted">{DECKS[session.myDeck].name} <span className="vs">contre</span> {DECKS[session.aiDeck].name} · IA {LEVELS[session.level].name}</div>
          <div className={`phase-pill ${game.active === HUMAN ? 'pill-me' : 'pill-opp'}`}>
            Tour {game.turn || 1} · {compact ? `${game.winner !== null ? 'fin' : game.active === HUMAN ? 'à toi' : 'IA'}${game.battle ? ' ⚔' : ''}` : phaseLabel(game, HUMAN)}
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={back} disabled={!undo.length} title="Revenir avant ton dernier choix (Ctrl+Z)">↶</button>
            <button className="icon-btn hide-compact" onClick={() => updateSettings({ sound: !settings.sound })} title={settings.sound ? 'Couper le son' : 'Activer le son'}>{settings.sound ? '🔊' : '🔇'}</button>
            <button className={`icon-btn only-compact ${recommended ? 'icon-reco' : ''}`} onClick={(e) => { e.stopPropagation(); setPanel((o) => !o); }} title="Journal, coach et tous les choix">📜</button>
            <div className="settings-wrap" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" onClick={() => setSettingsOpen((o) => !o)} title="Réglages">⚙</button>
              {settingsOpen && (
                <div className="settings-menu">
                  <label>Vitesse de l’IA
                    <select value={settings.speed} onChange={(e) => updateSettings({ speed: Number(e.target.value) })}>
                      <option value={1500}>lente</option>
                      <option value={900}>normale</option>
                      <option value={350}>rapide</option>
                    </select>
                  </label>
                  <label>Taille de l’interface
                    <select value={settings.uiScale} onChange={(e) => updateSettings({ uiScale: Number(e.target.value) })}>
                      {UI_SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  {!touch && (
                    <label>Détail d’une carte survolée
                      <select value={settings.zoomDelay} onChange={(e) => updateSettings({ zoomDelay: Number(e.target.value) })}>
                        {ZOOM_DELAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="op-toggle"><input type="checkbox" checked={settings.autoCoach} onChange={(e) => updateSettings({ autoCoach: e.target.checked })} /> Conseil du coach automatique (★)</label>
                  <label className="op-toggle"><input type="checkbox" checked={settings.confirmEnd} onChange={(e) => updateSettings({ confirmEnd: e.target.checked })} /> Confirmer la fin du tour s’il reste des actions</label>
                  <label className="op-toggle"><input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Sons</label>
                  <button className="op-link only-compact" onClick={() => { setSettingsOpen(false); setHelp(true); }}>Comment jouer ? (aide et mots-clés)</button>
                </div>
              )}
            </div>
            <button className="icon-btn" onClick={() => setGuide(session.myDeck)} title="Guide de ton deck (et de celui de l’IA)">📖</button>
            <button className="icon-btn hide-compact" onClick={() => setHelp(true)} title="Aide et mots-clés (?)">?</button>
            <button className="op-btn op-btn-ghost btn-small" onClick={leave}>Menu</button>
          </div>
        </header>

        <OpponentHand s={game} p={AI} />
        <PlayerZone s={game} p={AI} me={false} ui={ui} />
        <div className="op-center">
          {practice && <div className="practice">Entraînement depuis un moment revu : cette partie ne compte pas dans ton bilan.</div>}
          <BattlePanel s={game} human={HUMAN} />
        </div>
        <PlayerZone s={game} p={HUMAN} me ui={ui} />
        <Hand s={game} p={HUMAN} ui={ui} />
        <ActionBar
          s={game}
          d={d}
          human={HUMAN}
          thinking={thinking}
          aiName="L’IA"
          targeting={targeting}
          preview={targetPreview}
          hasCardActions={Boolean(view && [...view.byCard.values()].some((acts) => acts.some((a) => !a.useless)))}
          buttons={view && !special && !pickerOpen ? view.buttons : []}
          recommended={recommended}
          onButton={(id) => { sfx('click'); choose(id); }}
          onCancelTargeting={() => setTargeting(null)}
          onEndTurn={requestEnd}
          onHint={() => { setTab('coach'); if (compact) setPanel(true); if (!hintNow) askHint(); }}
          hintState={hintNow ? (hintNow.analysis ? 'ready' : 'loading') : 'idle'}
          touch={touch}
          onConfirmAttack={aimedOption ? () => { sfx('click'); choose(aimedOption.id); } : undefined}
        />
        <FxLayer game={game} human={HUMAN} epoch={epoch} />
      </main>

      <aside className={panel ? 'side side-open' : 'side'}>
        <div className="side-head only-compact">
          <strong>Journal et coach</strong>
          <button className="icon-btn" onClick={() => setPanel(false)} title="Fermer">✕</button>
        </div>
        <CardPreview s={game} preview={preview} />
        <div className="tabs">
          <button className={tab === 'journal' ? 'op-tab on' : 'op-tab'} onClick={() => setTab('journal')}>Journal</button>
          <button className={tab === 'coach' ? 'op-tab on' : 'op-tab'} onClick={() => setTab('coach')}>Coach{recommended ? ' ★' : ''}</button>
          <button className={tab === 'choix' ? 'op-tab on' : 'op-tab'} onClick={() => setTab('choix')}>Tous les choix</button>
        </div>
        {tab === 'journal' && <GameLog s={game} human={HUMAN} />}
        {tab === 'coach' && (
          <div className="tab-body">
            {over ? (
              <button className="op-btn op-btn-primary" onClick={() => setShowEnd(true)}>Voir le récap du coach</button>
            ) : humanTurn && d ? (
              <CoachHint decision={d} analysis={hintNow?.analysis ?? null} loading={Boolean(hintNow && !hintNow.analysis)} onAsk={askHint} onChoose={choose} />
            ) : (
              <p className="op-muted op-small">Le coach t’aide pendant tes décisions. Active le conseil automatique dans les réglages (⚙) pour voir une ★ sur le meilleur choix.</p>
            )}
            <p className="op-small op-muted">Le coach analyse aussi chacune de tes décisions en arrière-plan : le récap de fin de partie te montrera tes erreurs et tes meilleurs coups.</p>
          </div>
        )}
        {tab === 'choix' && (
          <div className="tab-body">
            {humanTurn && d ? <DecisionBox decision={d} focus={null} notes={{}} onChoose={choose} onClearFocus={() => undefined} /> : <p className="op-muted op-small">Pas de décision à prendre pour l’instant.</p>}
          </div>
        )}
      </aside>

      {menu && view && d && (menuActions.length > 0 || whyNot(game, d, menu.uid)) && (
        <ActionMenu s={game} uid={menu.uid} anchor={menu.rect} actions={menuActions} info={menuActions.length ? null : whyNot(game, d, menu.uid)} recommended={recommended}
          onAction={(a) => onAction(menu.uid, a)} onClose={() => setMenu(null)} sheet={compact} details={touch || compact} />
      )}
      {humanTurn && special === 'mulligan' && <MulliganModal s={game} p={HUMAN} onChoose={choose} onHover={onHover} />}
      {humanTurn && special === 'trigger' && d && <TriggerModal s={game} d={d} onChoose={choose} recommended={recommended} />}
      {humanTurn && special === 'declareCost' && d && <CostModal d={d} onChoose={choose} recommended={recommended} />}
      {humanTurn && pickerOpen && d && view && <PickerModal s={game} d={d} picks={view.picks} buttons={view.buttons} recommended={recommended} onChoose={choose} onHover={onHover} />}
      {confirmEnd && d && (
        <ConfirmEndModal remaining={remainingActions(game, d)} onConfirm={() => { setConfirmEnd(false); choose('end'); }} onCancel={() => setConfirmEnd(false)}
          onNeverAsk={() => { updateSettings({ confirmEnd: false }); setConfirmEnd(false); choose('end'); }} />
      )}
      {trashOf !== null && <TrashModal s={game} p={trashOf} onClose={() => setTrashOf(null)} onHover={onHover} />}
      {help && !intro && <HelpModal onClose={() => setHelp(false)} />}
      {guide && (
        <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); }} onHover={cardZoom.onHover}
          alt={guide === session.myDeck ? session.aiDeck : session.myDeck} altLabel={guide === session.myDeck ? 'Voir le deck de l’IA' : 'Voir ton deck'} onSwitch={setGuide} />
      )}
      {cardZoom.zoom && <CardZoom s={game} preview={cardZoom.zoom} onClose={cardZoom.close} />}
      {intro && <Intro s={game} onDone={() => setIntro(false)} />}
      {over && celebrate && <Celebration won={game.winner === HUMAN} onDone={() => setCelebrate(false)} />}
      {over && !celebrate && showEnd && (
        <div className="modal" onClick={() => setShowEnd(false)}>
          <div className="modal-wrap" onClick={(e) => e.stopPropagation()}>
            <EndScreen
              won={game.winner === HUMAN}
              reason={game.winReason ?? ''}
              turns={game.turn}
              matchup={matchupName(session)}
              record={records[recordKey(session)]}
              practice={practice}
              progress={{ done, total }}
              recap={recap}
              onReplay={replay}
              onRestart={start}
              onBoard={() => setShowEnd(false)}
              onMenu={leave}
              onHistory={() => { leave(); setHistory(true); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const COLOR: Record<string, string> = { Rouge: '#d9443a', Vert: '#2f9e5b', Bleu: '#2f6fd1', Violet: '#8a4fc9', Jaune: '#e2b623', Noir: '#3a3a44' };

export function DeckTile({ id, selected, onClick, note, onGuide }: { id: string; selected: boolean; onClick: () => void; note?: string; onGuide: (id: string) => void }) {
  const deck = DECKS[id];
  const leader = def(deck.leader);
  const colors = leader.colors.map((c) => COLOR[c] ?? '#666');
  return (
    <button className={`deck-tile ${selected ? 'on' : ''}`} onClick={onClick} style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] }}>
      <img src={cardImage(leader.imageId)} alt="" />
      <span className="deck-name">{deck.name}</span>
      <span className="deck-id">{deck.id}{note ? ` · ${note}` : ''}</span>
      <span className="deck-styles">{GUIDES[id]?.styles.slice(0, 2).join(' · ')}</span>
      <span className="deck-guide-btn" role="button" tabIndex={0} title="Voir le guide du deck : plan de jeu, combinaisons, cartes"
        onClick={(e) => { e.stopPropagation(); onGuide(id); }}>📖 Guide</span>
    </button>
  );
}

function SetupScreen({ notice, online, config, records, onChange, onStart, onHelp, help, closeHelp, settings, updateSettings, onGuide, onHistory }: {
  notice?: string;
  online?: OnlineEntry;
  config: Config;
  records: Records;
  onChange: (c: Config) => void;
  onStart: () => void;
  onHelp: () => void;
  help: boolean;
  closeHelp: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onGuide: (id: string) => void;
  onHistory: () => void;
}) {
  const ids = Object.keys(DECKS);
  const played = Object.entries(records)
    .map(([key, line]) => {
      const [myDeck, aiDeck, level] = key.split('|');
      return { key, line, myDeck, aiDeck, level: Number(level) as Level };
    })
    .filter((r) => DECKS[r.myDeck] && DECKS[r.aiDeck] && LEVELS[r.level])
    .sort((a, b) => (b.line.wins + b.line.losses) - (a.line.wins + a.line.losses));
  const rec = (aiDeck: string) => {
    const r = records[recordKey({ ...config, aiDeck })];
    return r && r.wins + r.losses ? `${r.wins}V ${r.losses}D` : undefined;
  };
  return (
    <div className="setup">
      <header className="setup-head">
        <h1>☠ OP Coach</h1>
        <p className="op-muted">Entraîne-toi contre l’IA, et laisse le coach t’aider à progresser.</p>
        <div className="setup-links">
          <button className="op-link" onClick={onHistory}>📈 Mes parties</button>
          <button className="op-link" onClick={onHelp}>Comment jouer ?</button>
          <label className="op-small op-muted">Taille de l’interface{' '}
            <select value={settings.uiScale} onChange={(e) => updateSettings({ uiScale: Number(e.target.value) })}>
              {UI_SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        {notice && <p className="setup-notice">{notice}</p>}
      </header>
      {online && (
        <section className="online-entry">
          <div>
            <h2>🌐 Jouer avec un ami</h2>
            {online.resume
              ? <p className="op-muted">{online.resume.label}</p>
              : <p className="op-muted">Une partie en ligne contre un ami : crée une salle et envoie-lui son code, ou rejoins la sienne.</p>}
          </div>
          {online.resume
            ? <button className="op-btn op-btn-primary" onClick={online.resume.onResume}>Reprendre</button>
            : <button className="op-btn op-btn-primary" onClick={online.onOpen}>Jouer en ligne</button>}
        </section>
      )}
      <section className="setup-section">
        <h2>Ton deck</h2>
        <div className="deck-grid">{ids.map((id) => <DeckTile key={id} id={id} selected={config.myDeck === id} onClick={() => onChange({ ...config, myDeck: id })} onGuide={onGuide} />)}</div>
      </section>
      <section className="setup-section">
        <h2>Ton adversaire</h2>
        <div className="deck-grid">{ids.map((id) => <DeckTile key={id} id={id} selected={config.aiDeck === id} note={rec(id)} onClick={() => onChange({ ...config, aiDeck: id })} onGuide={onGuide} />)}</div>
      </section>
      <section className="setup-row">
        <div>
          <h2>Niveau de l’IA</h2>
          <div className="op-segmented">
            {([1, 2, 3] as Level[]).map((level) => (
              <button key={level} className={config.level === level ? 'seg on' : 'seg'} onClick={() => onChange({ ...config, level })}>{LEVELS[level].name}</button>
            ))}
          </div>
          <p className="op-muted op-small">
            {config.level === 1 ? 'Joue le plan de son deck, sans calculer à l’avance.'
              : config.level === 2 ? 'Simule la suite de la partie avant chaque choix.'
                : 'Simule beaucoup plus de parties avant chaque choix (jusqu’à 2 secondes).'}
          </p>
        </div>
        <div>
          <h2>Qui commence ?</h2>
          <div className="op-segmented">
            {([['random', 'Au hasard'], ['me', 'Moi'], ['ai', 'L’IA']] as const).map(([value, label]) => (
              <button key={value} className={config.first === value ? 'seg on' : 'seg'} onClick={() => onChange({ ...config, first: value })}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <div className="setup-go">
        <span className="op-muted op-small">Ton bilan dans cette confrontation : {recordText(records[recordKey(config)])}</span>
        <button className="op-btn op-btn-primary btn-big" onClick={onStart}>Lancer la partie</button>
      </div>
      {played.length > 0 && (
        <section className="setup-section">
          <h2>Ton bilan</h2>
          <table className="op-stats">
            <thead><tr><th>Toi</th><th>IA</th><th>Niveau</th><th>Victoires</th></tr></thead>
            <tbody>
              {played.map((r) => (
                <tr key={r.key}>
                  <td>{DECKS[r.myDeck].name}</td>
                  <td>{DECKS[r.aiDeck].name}</td>
                  <td>{LEVELS[r.level].name}</td>
                  <td>{r.line.wins}/{r.line.wins + r.line.losses} ({Math.round((r.line.wins / Math.max(1, r.line.wins + r.line.losses)) * 100)} %)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {help && <HelpModal onClose={closeHelp} />}
    </div>
  );
}
