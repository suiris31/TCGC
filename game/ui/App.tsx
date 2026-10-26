import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiWorker, rlDeckModels, rlModelAvailable } from '../ai/client.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import { LEVELS, type Analysis, type Level } from '../ai/search.ts';
import { buildRecord, inQuickRecord, recordId, replayRecord, type GameRecord, type GameSummary, type Replayed } from '../coach/archive.ts';
import { buildRecap, HINT, isReviewable, REVIEW, toReview, type Move, type MoveReview } from '../coach/review.ts';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS, freeDeckIds } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import { def } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { EndScreen, RecapBody, recordText, type RecordLine } from './Coach.tsx';
import { phaseLabel } from './decision.ts';
import { HelpModal } from './Modals.tsx';
import { currentRoute, goBack, HOME, navigate, useLeaveGuard, useRoute } from './routes.ts';
import { useSettings } from './settings.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { DeckBuilderScreen } from './DeckBuilder.tsx';
import { DeckGuideModal } from './DeckGuide.tsx';
import { deckInfo, deckLabel, isAdventureDeck, playable, useMyDecks } from './myDecks.ts';
import { GUIDES } from './deckGuides.ts';
import { CardZoom } from './Zoom.tsx';
import { flushQueue, keepForLater, loadSummaries, saveRecord, whenSaved } from './archiveClient.ts';
import { HistoryScreen } from './History.tsx';
import { cardImage } from './images.ts';
import { GameGain, useGameGain } from './economy/GameGain.tsx';
import { CoachTab } from './table/SidePanel.tsx';
import { LeaveDialog, stop, TableScreen } from './table/TableScreen.tsx';
import { useGameKeys } from './table/useGameKeys.ts';
import { useTable } from './table/useTable.ts';

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
  // deck personnalisé : son nom au moment de la partie (gardé dans « Mes parties »)
  myDeckName?: string;
  aiDeckName?: string;
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

// Adversaire « Aléatoire » : un deck du registre (méta ou pour débutant) tiré au sort au lancement de chaque partie,
// autre que le sien quand c'est possible (jamais un adversaire de l'aventure)
const RANDOM_DECK = 'random';
function randomDeck(myDeck: string) {
  const pool = freeDeckIds().filter((id) => id !== myDeck);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Bilan victoires / défaites par confrontation et niveau
type Records = Record<string, RecordLine>;
const recordKey = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) => `${c.myDeck}|${c.aiDeck}|${c.level}`;
const matchupName = (c: Pick<Config, 'myDeck' | 'aiDeck' | 'level'>) =>
  `${deckLabel(c.myDeck)} contre ${deckLabel(c.aiDeck)} (${LEVELS[c.level].name})`;

// Calculé à partir des parties enregistrées sur le compte : parties terminées contre l'IA, hors entraînement (ni
// l'aventure, ni le jeu en ligne)
function recordsOf(list: GameSummary[]): Records {
  const out: Records = {};
  for (const g of list) {
    if (!inQuickRecord(g)) continue;
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

// Partie lancée par un autre écran (mode Aventure) : decks et niveau imposés, pas d'écran de départ. La partie commence
// dès l'affichage (le joueur l'a demandée), ou reprend une partie interrompue (resume, déjà rejouée). onEnd : la partie
// est finie (après l'écran de victoire ou de défaite) ; saved donne l'identifiant de l'enregistrement final une fois
// qu'il est sur le serveur. onLeave : « Quitter » pendant la partie, « Suite » après ; l'écran appelant décide (une
// partie quittée en cours est enregistrée comme abandonnée quand App disparaît, et peut être reprise).
export interface ConfiguredGame {
  myDeck: string;
  aiDeck: string;
  level: Level;
  opponentName: string;
  resume?: { rec: GameRecord; replayed: Replayed };
  mode?: 'aventure';   // noté dans les parties enregistrées (« Mes parties » les range à part)
  onEnd: (end: { won: boolean; saved: Promise<string> }) => void;
  onLeave: () => void;
}

// Accès au mode Aventure depuis l'écran de départ
export interface AdventureEntry { onOpen: () => void }

// notice : message affiché sur l'écran de départ ; onImmersive : une partie occupe tout l'écran (TCGC masque alors sa
// barre d'onglets) ; configured : partie imposée par le mode Aventure (voir ConfiguredGame)
export function App({ notice, onImmersive, online, adventure, configured }: {
  notice?: string;
  onImmersive?: (on: boolean) => void;
  online?: OnlineEntry;
  adventure?: AdventureEntry;
  configured?: ConfiguredGame;
}) {
  const [settings, updateSettings] = useSettings();
  const [config, setConfig] = useState<Config>(() => configured
    ? { myDeck: configured.myDeck, aiDeck: configured.aiDeck, first: 'random', level: configured.level }
    : { myDeck: 'ST-35', aiDeck: 'ST-32', first: 'random', level: 2 });
  const [session, setSession] = useState<Config>(config);
  const [thinking, setThinking] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [undo, setUndo] = useState<GameState[]>([]);
  const [records, setRecords] = useState<Records>({});
  const [practice, setPractice] = useState(false);
  const [hint, setHint] = useState<{ for: GameState; analysis: Analysis | null } | null>(null);

  // Décisions du joueur et leur analyse par le coach, faite en arrière-plan pendant la partie
  const moves = useRef<Move[]>([]);
  const reviews = useRef(new Map<number, MoveReview>());
  const nextMove = useRef(1);
  const pumping = useRef(false);
  const recorded = useRef(false);
  const ended = useRef(false);
  const [reviewed, setReviewed] = useState(0);
  // Gain de la partie libre (Berry) : demandé au serveur une fois la partie finie et enregistrée (l'aventure le demande
  // elle-même, avec le résultat du chapitre)
  const { gain, claim, retry: retryGain, reset: resetGain } = useGameGain();
  const claimed = useRef<string | null>(null);

  // Sauvegarde de la partie dans le dossier parties/ : mise à jour au fil des coups, puis à la fin quand le coach a
  // analysé tes décisions. Si l'onglet se ferme, une copie attend dans le navigateur jusqu'au lancement suivant.
  const recording = useRef<Recording | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const shownAt = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordMode = useRef(configured?.mode);
  // Mes parties (#play/parties), Mes decks (#play/decks) et la partie (#play/jeu) ont leur adresse, sauf pour une
  // partie imposée (aventure), qui garde celle de son écran
  const routed = !configured;
  const route = useRoute();
  const history = routed && route.name === 'parties';
  const builder = routed && route.name === 'decks';
  const showScreen = (name: 'parties' | 'decks' | null) => {
    if (!routed) return;
    const now = currentRoute().name;
    if (name) {
      if (now !== name) navigate({ name });
    } else if (now === 'parties' || now === 'decks') goBack(HOME);
  };
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Retour du navigateur pendant la partie : « Quitter la partie ? » (la partie est enregistrée)
  useLeaveGuard(game !== null && game.winner === null, () => setConfirmLeave(true));

  const snapshot = useCallback((abandoned = false): GameRecord | null => {
    const r = recording.current;
    const current = gameRef.current;
    if (!r || !current) return null;
    const rec = buildRecord({
      id: r.id, engine: ENGINE, startedAt: r.startedAt, now: new Date().toISOString(), endedAt: r.endedAt,
      config: r.config, human: HUMAN, practice: r.practice, initial: r.initial, current,
      moves: moves.current, reviews: reviews.current, extra: r.extra, undos: r.undos, abandoned,
      mode: recordMode.current,
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

  // L'adresse quitte la partie (« Menu », Retour après la fin) : la partie se ferme comme avec « Menu ». #play/jeu
  // ouvert sans partie (rechargement) : l'écran de départ
  const shownRoute = useRef(route.name);
  useEffect(() => {
    if (!routed) return;
    const was = shownRoute.current;
    shownRoute.current = route.name;
    if (was === 'jeu' && route.name !== 'jeu' && gameRef.current) {
      closeRecording();
      setGame(null);
    }
  }, [routed, route.name, closeRecording]);
  useEffect(() => {
    if (routed && currentRoute().name === 'jeu' && !gameRef.current) navigate(HOME, { replace: true });
  }, []);

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

  const d = game?.decision ?? null;
  const humanTurn = Boolean(game && d && d.player === HUMAN && game.winner === null);
  const hintNow = hint && hint.for === game ? hint : null;
  useEffect(() => {
    if (humanTurn) shownAt.current = Date.now();
  }, [game, humanTurn]);
  const recommended = hintNow?.analysis?.best ?? null;

  // Ton choix : joué par le moteur, noté pour le récap (temps de réflexion, conseil affiché), puis analysé par le coach
  const choose = useCallback((id: string) => {
    if (!game) return;
    const moveId = nextMove.current++;
    const advice = hint && hint.for === game && hint.analysis ? hint.analysis.best : undefined;
    recording.current?.extra.set(moveId, { ms: Date.now() - shownAt.current, hint: advice });
    moves.current = [...moves.current, { id: moveId, state: game, choice: id }];
    setUndo((u) => [...u.slice(-80), game]);
    setGame(act(game, id));
    void pump();
  }, [game, pump, hint]);

  // Le plateau (contrôleur commun, table/) : l'aide, les réglages, le guide et la carte en grand servent aussi à
  // l'écran de départ
  const table = useTable({ state: game, seat: HUMAN, active: humanTurn, choose, aids: true, recommended });
  const { help, setHelp, guide, setGuide } = table;
  const cardZoom = table.board.zoom;

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

  // L'IA joue ses décisions (calculées dans un fil séparé), avec un délai minimum pour qu'on puisse suivre
  useEffect(() => {
    if (!game || game.winner !== null || game.decision?.player !== AI) return;
    const current = game;
    const d = current.decision!;
    const started = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setThinking(true);
    // IA entraînée : toutes ses décisions (y compris au milieu d'un effet) viennent du modèle
    const pick = session.level === 4 && d.options.length > 1
      ? worker().chooseRl(current)
      : d.inEffect || session.level === 1 || session.level === 4 || d.options.length === 1
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

  // Fin de partie : le résultat compte dans le bilan (sauf une partie reprise depuis un moment revu) ; l'écran de
  // victoire ou de défaite, puis le récap, sont ceux du plateau (useTable)
  useEffect(() => {
    if (!game || game.winner === null) return;
    if (recorded.current || practice) return;
    recorded.current = true;
    const won = game.winner === HUMAN;
    setRecords((all) => {
      const key = recordKey(session);
      const line = all[key] ?? { wins: 0, losses: 0 };
      return { ...all, [key]: won ? { ...line, wins: line.wins + 1 } : { ...line, losses: line.losses + 1 } };
    });
  }, [game, practice, session]);

  // Partie libre finie : enregistrée tout de suite, puis son gain est demandé au serveur (une fois par partie ; pas une
  // partie reprise depuis un moment revu, qui ne rapporte rien)
  useEffect(() => {
    const r = recording.current;
    if (configured || !game || game.winner === null || practice || !r || claimed.current === r.id) return;
    claimed.current = r.id;
    clearTimeout(saveTimer.current);
    const rec = snapshot();
    if (!rec) return;
    const saved = saveRecord(rec).then(() => rec.id);
    claim(() => saved);
  }, [configured, game, practice, snapshot, claim]);

  // Partie imposée (Aventure) : finie et vue (écran de victoire ou de défaite passé), elle est enregistrée sur le serveur
  // puis signalée, une seule fois (pas une partie reprise depuis un moment revu, qui ne compte pas)
  const { celebrate } = table;
  useEffect(() => {
    if (!configured || !game || game.winner === null || celebrate || practice || ended.current) return;
    ended.current = true;
    clearTimeout(saveTimer.current);
    const rec = snapshot();
    const saved = rec ? saveRecord(rec).then(() => rec.id) : Promise.reject(new Error('partie vide'));
    configured.onEnd({ won: game.winner === HUMAN, saved });
  }, [configured, game, celebrate, practice, snapshot]);

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

  const reviewable = game ? moves.current.filter((m) => isReviewable(m, HUMAN)) : [];
  const total = reviewable.length;
  const done = reviewable.filter((m) => reviews.current.has(m.id)).length;
  const over = game !== null && game.winner !== null;
  const recap = useMemo(
    () => (game && over && done === total ? buildRecap(game, moves.current, reviews.current, HUMAN) : null),
    [game, over, done, total, reviewed],
  );

  const start = () => {
    const aiDeck = config.aiDeck === RANDOM_DECK ? randomDeck(config.myDeck) : config.aiDeck;
    if (![config.myDeck, aiDeck].every((id) => DECKS[id] || (deckInfo(id) && playable(deckInfo(id)!)))) return false;
    closeRecording();
    const first = config.first === 'me' ? HUMAN : config.first === 'ai' ? AI : 'random';
    // deck personnalisé : sa liste complète (le moteur ne connaît que les decks du registre par leur identifiant)
    const source = (id: string) => (DECKS[id] ? id : deckInfo(id)!);
    const named: Config = {
      ...config,
      aiDeck,
      ...(DECKS[config.myDeck] ? {} : { myDeckName: deckLabel(config.myDeck) }),
      ...(DECKS[aiDeck] ? {} : { aiDeckName: deckLabel(aiDeck) }),
    };
    const initial = newGame({ decks: [source(config.myDeck), source(aiDeck)], names: ['Toi', configured?.opponentName ?? 'IA'], first });
    setSession(named);
    setGame(initial);
    startRecording(initial, named);
    resetGain();
    setUndo([]);
    setPractice(false);
    setHint(null);
    moves.current = [];
    reviews.current = new Map();
    recorded.current = false;
    ended.current = false;
    setReviewed(0);
    table.restart({ intro: true });
    if (routed) navigate({ name: 'jeu' });
    if (!settings.helpSeen) {
      setHelp(true);
      updateSettings({ helpSeen: true });
    }
    return true;
  };

  const back = useCallback(() => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    // partie imposée (Aventure) finie : elle est déjà envoyée et comptée, on ne revient plus dessus
    if (configured && game?.winner !== null) return;
    if (game) recording.current?.undos.push({ turn: game.turn, undone: game.history.length - previous.history.length });
    const last = moves.current[moves.current.length - 1];
    if (last) reviews.current.delete(last.id);
    moves.current = moves.current.slice(0, -1);
    setUndo(undo.slice(0, -1));
    setGame(previous);
    table.reset();
  }, [undo, game, configured, table]);

  // Raccourcis clavier (Échap ferme aussi Mes parties et Mes decks)
  useGameKeys(table, { undo: back, escape: () => showScreen(null) });

  // Rejouer un moment d'une partie archivée (depuis « Mes parties ») : comme « Revoir ce moment » du récap
  const resumeArchived = (rec: GameRecord, moveId: number) => {
    const replayed = replayRecord(rec);
    const index = replayed.moves.findIndex((m) => m.id === moveId);
    if (index < 0) throw new Error('ce moment n’existe plus dans la partie');
    closeRecording();
    const state = replayed.moves[index].state;
    const cfg: Config = {
      myDeck: rec.config.myDeck, aiDeck: rec.config.aiDeck, level: rec.config.level as Level, first: rec.config.first,
      ...(rec.config.myDeckName ? { myDeckName: rec.config.myDeckName } : {}), ...(rec.config.aiDeckName ? { aiDeckName: rec.config.aiDeckName } : {}),
    };
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
    if (routed) navigate({ name: 'jeu' }, { replace: true });
    resetGain();
    startRecording(state, cfg, { from: rec.id, turn: state.turn });
    setGame(state);
    table.restart();
  };

  // Partie interrompue (Aventure) : on reprend l'enregistrement là où il s'était arrêté, sous le même identifiant, avec
  // les décisions déjà analysées par le coach. Les retours en arrière d'avant l'interruption ne sont plus possibles.
  const resumeInterrupted = (rec: GameRecord, replayed: Replayed) => {
    const cfg: Config = {
      myDeck: rec.config.myDeck, aiDeck: rec.config.aiDeck, level: rec.config.level as Level, first: rec.config.first,
      ...(rec.config.myDeckName ? { myDeckName: rec.config.myDeckName } : {}), ...(rec.config.aiDeckName ? { aiDeckName: rec.config.aiDeckName } : {}),
    };
    const extra = new Map(rec.decisions.map((x) => [x.move, { ms: x.ms, hint: x.hint }]));
    recording.current = { id: rec.id, startedAt: rec.startedAt, initial: rec.initial, config: cfg, undos: [...rec.undos], extra };
    moves.current = replayed.moves;
    nextMove.current = Math.max(nextMove.current, ...replayed.moves.map((m) => m.id + 1));
    reviews.current = new Map(rec.reviews.map((r) => [r.id, r]));
    setReviewed(reviews.current.size);
    setConfig(cfg);
    setSession(cfg);
    setPractice(false);
    setUndo([]);
    setHint(null);
    recorded.current = false;
    ended.current = false;
    setGame(replayed.final);
    table.restart();
    void pump();
  };

  // Partie imposée : lancée (ou reprise) dès l'affichage
  const launched = useRef(false);
  const [launchError, setLaunchError] = useState(false);
  useEffect(() => {
    if (!configured || launched.current) return;
    launched.current = true;
    if (configured.resume) resumeInterrupted(configured.resume.rec, configured.resume.replayed);
    else if (!start()) setLaunchError(true);
  });

  if (!game) {
    if (configured) {
      return (
        <div className="opc-wait">
          {launchError
            ? <>Ton deck n’est pas jouable : complète-le dans « Mon deck ». <button className="op-btn op-btn-ghost" onClick={configured.onLeave}>Retour</button></>
            : <><span className="op-spinner" /> Préparation de la partie…</>}
        </div>
      );
    }
    return (
      <>
        <SetupScreen notice={notice} online={online} adventure={adventure} config={config} records={records} onChange={setConfig} onStart={start} onHelp={() => setHelp(true)} help={help} closeHelp={() => setHelp(false)}
          onSettings={() => table.setSettingsOpen(true)} onGuide={setGuide} onHistory={() => showScreen('parties')} onBuilder={() => showScreen('decks')} />
        {guide && <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); }} onHover={cardZoom.onHover} />}
        {history && <HistoryScreen onClose={() => { showScreen(null); cardZoom.close(); }} onResume={resumeArchived} onHover={cardZoom.onHover} />}
        {builder && (
          <DeckBuilderScreen onClose={() => { showScreen(null); cardZoom.close(); }} onHover={cardZoom.onHover}
            onPlay={(id) => { showScreen(null); cardZoom.close(); setConfig((c) => ({ ...c, myDeck: id })); }} />
        )}
        {cardZoom.zoom && <CardZoom preview={cardZoom.zoom} onClose={cardZoom.close} />}
        {table.settingsOpen && <SettingsPanel onClose={() => table.setSettingsOpen(false)} onHelp={() => setHelp(true)} />}
      </>
    );
  }

  // Replay depuis le récap
  const replay = (id: number) => {
    const index = moves.current.findIndex((m) => m.id === id);
    if (index < 0) return;
    const state = moves.current[index].state;
    const from = recording.current?.id ?? null;
    closeRecording();
    resetGain();
    startRecording(state, session, { from, turn: state.turn });
    moves.current = moves.current.slice(0, index);
    for (const key of [...reviews.current.keys()]) if (!moves.current.some((m) => m.id === key)) reviews.current.delete(key);
    setReviewed(reviews.current.size);
    setPractice(true);
    setUndo([]);
    setHint(null);
    setGame(state);
    table.restart();
  };

  // « Menu » : retour à l'écran d'avant la partie (l'adresse quitte #play/jeu, la partie se ferme alors)
  const leave = () => {
    if (routed && currentRoute().name === 'jeu') return goBack(HOME);
    closeRecording();
    setGame(null);
  };
  const won = game.winner === HUMAN;

  return (
    <TableScreen
      table={table}
      opponent="L’IA"
      thinking={thinking}
      top={{
        brand: '☠ OP Coach',
        match: <>{deckLabel(session.myDeck, session.myDeckName)} <span className="vs">contre</span> {deckLabel(session.aiDeck, session.aiDeckName)} · IA {LEVELS[session.level].name}</>,
        rival: 'IA',
        phase: phaseLabel(game, HUMAN),
        undo: { onClick: back, disabled: !undo.length || (Boolean(configured) && over) },
        leave: configured
          ? { label: over ? 'Suite →' : 'Quitter', title: over ? 'Suite de l’aventure' : 'Quitter la partie : tu pourras la reprendre depuis le chapitre', onClick: configured.onLeave }
          : { label: 'Menu', onClick: leave },
      }}
      decks={{ mine: session.myDeck, theirs: session.aiDeck, theirsName: 'l’IA' }}
      coach={<CoachTab table={table} analysis={hintNow?.analysis ?? null} loading={Boolean(hintNow && !hintNow.analysis)} onAsk={askHint} />}
      center={practice && <div className="practice">Entraînement depuis un moment revu : cette partie ne compte pas dans ton bilan.</div>}
      hint={{ state: hintNow ? (hintNow.analysis ? 'ready' : 'loading') : 'idle', ask: askHint }}
      leave={confirmLeave && !over && (
        <LeaveDialog onStay={() => setConfirmLeave(false)} text={configured
          ? 'La partie est enregistrée : tu pourras la reprendre depuis le chapitre.'
          : 'La partie est enregistrée : tu la retrouveras dans « Mes parties ».'}>
          <button className="op-btn op-btn-ghost" data-ui="leave.yes" onClick={() => { setConfirmLeave(false); if (configured) configured.onLeave(); else leave(); }}>Quitter</button>
          <button className="op-btn op-btn-primary" data-ui="leave.no" onClick={() => setConfirmLeave(false)}>Continuer la partie</button>
        </LeaveDialog>
      )}
      end={(
        <div className="modal-wrap" onClick={stop}>
          {configured ? (
            <div className="modal-box recap">
              <div className="recap-top">
                <h2 className={won ? 'win' : 'loss'}>{won ? 'Victoire !' : 'Défaite'}</h2>
                <p>{game.winReason ?? ''} · {game.turn} tours</p>
                {practice && <p className="op-small op-muted">Partie reprise depuis un moment revu : elle ne compte pas pour l’aventure.</p>}
              </div>
              {recap ? <RecapBody recap={recap} onReplay={replay} /> : (
                <div className="progress">
                  <div className="op-small">Le coach analyse tes décisions… {done}/{total}</div>
                  <div className="progress-bar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                </div>
              )}
              <div className="end-actions">
                <button className="op-btn op-btn-primary" data-ui="end.next" onClick={configured.onLeave}>Suite de l’aventure →</button>
                <button className="op-btn op-btn-ghost" data-ui="end.board" onClick={() => table.setShowEnd(false)}>Voir le plateau</button>
              </div>
            </div>
          ) : <EndScreen
            won={won}
            reason={game.winReason ?? ''}
            turns={game.turn}
            matchup={matchupName(session)}
            record={records[recordKey(session)]}
            practice={practice}
            gain={<GameGain gain={gain} onRetry={retryGain} />}
            progress={{ done, total }}
            recap={recap}
            onReplay={replay}
            onRestart={start}
            onBoard={() => table.setShowEnd(false)}
            onMenu={leave}
            onHistory={() => (routed ? navigate({ name: 'parties' }, { replace: true }) : leave())}
          />}
        </div>
      )}
    />
  );
}

const COLOR: Record<string, string> = { Red: '#d9443a', Green: '#2f9e5b', Blue: '#2f6fd1', Purple: '#8a4fc9', Yellow: '#e2b623', Black: '#3a3a44' };

export function DeckTile({ id, selected, onClick, note, onGuide }: { id: string; selected: boolean; onClick: () => void; note?: string; onGuide: (id: string) => void }) {
  const deck = deckInfo(id);
  if (!deck) return null;
  const leader = def(deck.leader);
  const colors = leader.colors.map((c) => COLOR[c] ?? '#666');
  const hold = isAdventureDeck(id);
  return (
    <button className={`deck-tile ${selected ? 'on' : ''}${hold ? ' op-deck-hold' : ''}`} data-ui={`deck.tile-${id}`} onClick={onClick} style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] }}>
      <img src={cardImage(leader)} alt="" />
      {hold && <span className="op-hold-badge" title="Deck de la Cale : seulement des cartes gagnées dans l’Aventure">🧭 Cale</span>}
      <span className="deck-name">{deck.name}</span>
      <span className="deck-id">{DECKS[id] ? deck.id : leader.name}{note ? ` · ${note}` : ''}</span>
      <span className="deck-styles">{GUIDES[id]?.styles.slice(0, 2).join(' · ') ?? (hold ? 'Deck de la Cale (cartes de l’Aventure)' : 'Deck perso')}</span>
      <span className="deck-guide-btn" data-ui="deck.guide" role="button" tabIndex={0} title="Voir le guide du deck : plan de jeu, combinaisons, cartes"
        onClick={(e) => { e.stopPropagation(); onGuide(id); }}>📖 Guide</span>
    </button>
  );
}

// Choix d'un deck : decks rangés par sorte (méta, pour débutant, du plus récent au plus ancien), filtre par couleur du
// Leader. L'ordre de DECKS ne change pas (il sert aux graines des parties de vérification). Les adversaires de l'aventure
// n'y sont pas.
const DECK_GROUPS: { label: string; ids: () => string[] }[] = [
  { label: 'Decks du méta', ids: () => freeDeckIds().filter((id) => DECKS[id].series === 'META') },
  {
    label: 'Decks pour débutant',
    ids: () => freeDeckIds().filter((id) => DECKS[id].series !== 'META').sort((a, b) => b.localeCompare(a, 'fr', { numeric: true })),
  },
];
const COLOR_FILTERS: [string, string][] = [['', 'Toutes'], ['Red', 'Rouge'], ['Green', 'Vert'], ['Blue', 'Bleu'], ['Purple', 'Violet'], ['Black', 'Noir'], ['Yellow', 'Jaune']];

export function DeckPicker({ selected, onPick, onGuide, note, onBuilder, onRandom }: {
  selected: string;
  onPick: (id: string) => void;
  onGuide: (id: string) => void;
  note?: (id: string) => string | undefined;
  onBuilder?: () => void;  // ouvrir l'éditeur de decks
  onRandom?: () => void;   // proposer « Aléatoire » (deck tiré au sort au lancement)
}) {
  const [color, setColor] = useState('');
  const { decks } = useMyDecks();
  const shown = (id: string) => !color || def(deckInfo(id)!.leader).colors.includes(color as never);
  // mes decks jouables (les decks incomplets restent dans l'éditeur)
  const mine = decks.filter((d) => d.leader in CARDS && playable(d));
  const unfinished = decks.length - mine.length;
  // les decks de la Cale (decks d'aventure) à part : seulement des cartes gagnées dans l'Aventure
  const groups = [
    { label: 'Mes decks', ids: () => mine.filter((d) => !isAdventureDeck(d)).map((d) => d.id) },
    { label: '🧭 Mes decks de la Cale', ids: () => mine.filter((d) => isAdventureDeck(d)).map((d) => d.id) },
    ...DECK_GROUPS,
  ];
  return (
    <>
      <div className="deck-filter" role="group" aria-label="Couleur du Leader">
        {COLOR_FILTERS.map(([c, label]) => (
          <button key={c} className={`deck-chip ${color === c ? 'on' : ''}`} style={c ? { ['--c1' as string]: COLOR[c] } : undefined} onClick={() => setColor(c)}>{label}</button>
        ))}
      </div>
      {onBuilder && (
        <p className="op-small op-muted deck-mine-note">
          <button className="op-link" onClick={onBuilder}>🃏 Mes decks : créer ou modifier un deck</button>
          {unfinished > 0 ? ` · ${unfinished} deck${unfinished > 1 ? 's' : ''} à terminer dans l’éditeur` : ''}
        </p>
      )}
      {onRandom && (
        <div className="deck-group">
          <h3>Au hasard</h3>
          <div className="deck-grid">
            <button className={`deck-tile deck-random ${selected === RANDOM_DECK ? 'on' : ''}`} data-ui="deck.random" onClick={onRandom}>
              <span className="deck-random-dice" aria-hidden="true">🎲</span>
              <span className="deck-name">Aléatoire</span>
              <span className="deck-id">Un deck du méta ou pour débutant, tiré au sort à chaque partie</span>
            </button>
          </div>
        </div>
      )}
      {groups.map((g) => {
        const ids = g.ids().filter(shown);
        return ids.length ? (
          <div key={g.label} className="deck-group">
            <h3>{g.label}</h3>
            <div className="deck-grid">{ids.map((id) => <DeckTile key={id} id={id} selected={selected === id} note={note?.(id)} onClick={() => onPick(id)} onGuide={onGuide} />)}</div>
          </div>
        ) : null;
      })}
    </>
  );
}

function SetupScreen({ notice, online, adventure, config, records, onChange, onStart, onHelp, help, closeHelp, onSettings, onGuide, onHistory, onBuilder }: {
  notice?: string;
  online?: OnlineEntry;
  adventure?: AdventureEntry;
  config: Config;
  records: Records;
  onChange: (c: Config) => void;
  onStart: () => void;
  onHelp: () => void;
  help: boolean;
  closeHelp: () => void;
  onSettings: () => void;
  onGuide: (id: string) => void;
  onHistory: () => void;
  onBuilder: () => void;
}) {
  // decks choisis : du registre, ou mes decks jouables (un deck supprimé ou rendu incomplet dans l'éditeur ne l'est plus)
  const usable = (id: string) => Boolean(DECKS[id]) || Boolean(deckInfo(id) && playable(deckInfo(id)!));
  const random = config.aiDeck === RANDOM_DECK;
  const ready = usable(config.myDeck) && (random || usable(config.aiDeck));
  // niveau « IA entraînée » : seulement si un modèle compatible est installé (web/public/rl-model/, voir rl/README.md) ;
  // sinon un réglage resté sur ce niveau (partie reprise, modèle retiré ou d'un ancien encodage) redevient « Débutant »,
  // pour ne pas compter sous ce nom des parties jouées par l'IA simple
  const [rlReady, setRlReady] = useState<boolean | null>(null);
  const [deckAi, setDeckAi] = useState<Set<string>>(new Set());
  useEffect(() => { rlModelAvailable().then(setRlReady); rlDeckModels().then(setDeckAi); }, []);
  useEffect(() => {
    if (rlReady === false && config.level === 4) onChange({ ...config, level: 1 });
  }, [rlReady, config, onChange]);
  const played = Object.entries(records)
    .map(([key, line]) => {
      const [myDeck, aiDeck, level] = key.split('|');
      return { key, line, myDeck, aiDeck, level: Number(level) as Level };
    })
    .filter((r) => deckInfo(r.myDeck) && deckInfo(r.aiDeck) && LEVELS[r.level])
    .sort((a, b) => (b.line.wins + b.line.losses) - (a.line.wins + a.line.losses));
  const rec = (aiDeck: string) => {
    const r = records[recordKey({ ...config, aiDeck })];
    return r && r.wins + r.losses ? `${r.wins}V ${r.losses}D` : undefined;
  };
  return (
    <div className="setup" data-ui="home">
      <header className="setup-head">
        <h1>☠ OP Coach</h1>
        <p className="op-muted">Entraîne-toi contre l’IA, et laisse le coach t’aider à progresser.</p>
        <div className="setup-links">
          <button className="op-link" data-ui="home.history" onClick={onHistory}>📈 Mes parties</button>
          <button className="op-link" data-ui="home.decks" onClick={onBuilder}>🃏 Mes decks</button>
          <button className="op-link" data-ui="home.help" onClick={onHelp}>Comment jouer ?</button>
          <a className="op-link" href="#legal" title="Projet de fan non officiel : mentions légales et confidentialité">À propos</a>
          <button className="op-link" data-ui="home.settings" onClick={onSettings}>⚙ Réglages</button>
        </div>
        {notice && <p className="setup-notice">{notice}</p>}
      </header>
      {adventure && (
        <section className="online-entry op-adv-entry">
          <div>
            <h2>🗺️ Aventure</h2>
            <p className="op-muted">Prends la mer à East Blue avec un deck de départ, affronte les adversaires de l’histoire et gagne des boosters pour améliorer ton deck.</p>
          </div>
          <button className="op-btn op-btn-primary" data-ui="home.adventure" onClick={adventure.onOpen}>Partir à l’aventure</button>
        </section>
      )}
      {online && (
        <section className="online-entry">
          <div>
            <h2>🌐 Jouer avec un ami</h2>
            {online.resume
              ? <p className="op-muted">{online.resume.label}</p>
              : <p className="op-muted">Une partie en ligne contre un ami : crée une salle et envoie-lui son code, ou rejoins la sienne.</p>}
          </div>
          {online.resume
            ? <button className="op-btn op-btn-primary" data-ui="home.online-resume" onClick={online.resume.onResume}>Reprendre</button>
            : <button className="op-btn op-btn-primary" data-ui="home.online" onClick={online.onOpen}>Jouer en ligne</button>}
        </section>
      )}
      <section className="setup-section">
        <h2>Ton deck</h2>
        <DeckPicker selected={config.myDeck} onPick={(id) => onChange({ ...config, myDeck: id })} onGuide={onGuide} onBuilder={onBuilder} />
      </section>
      <section className="setup-section">
        <h2>Ton adversaire</h2>
        <DeckPicker selected={config.aiDeck} note={rec} onPick={(id) => onChange({ ...config, aiDeck: id })} onGuide={onGuide}
          onRandom={() => onChange({ ...config, aiDeck: RANDOM_DECK })} />
      </section>
      <section className="setup-row">
        <div>
          <h2>Niveau de l’IA</h2>
          <div className="op-segmented">
            {([1, 2, 3, ...(rlReady ? [4] : [])] as Level[]).map((level) => (
              <button key={level} className={config.level === level ? 'seg on' : 'seg'} data-ui={`home.level-${level}`} onClick={() => onChange({ ...config, level })}>{LEVELS[level].name}</button>
            ))}
          </div>
          <p className="op-muted op-small">
            {config.level === 1 ? 'Joue le plan de son deck, sans calculer à l’avance.'
              : config.level === 2 ? 'Simule la suite de la partie avant chaque choix.'
                : config.level === 3 ? 'Simule beaucoup plus de parties avant chaque choix (jusqu’à 2 secondes).'
                  : `Modèle entraîné par apprentissage par renforcement : ses choix viennent de l’expérience de ses parties, sans règle écrite à la main.${
                    deckAi.has(config.aiDeck) ? ' Avec ce deck, c’est une IA spécialisée : entraînée en ne jouant que lui.'
                      : random && deckAi.size ? ' IA spécialisée quand le deck tiré au sort en a une.' : ''}`}
          </p>
        </div>
        <div>
          <h2>Qui commence ?</h2>
          <div className="op-segmented">
            {([['random', 'Au hasard'], ['me', 'Moi'], ['ai', 'L’IA']] as const).map(([value, label]) => (
              <button key={value} className={config.first === value ? 'seg on' : 'seg'} data-ui={`home.first-${value}`} onClick={() => onChange({ ...config, first: value })}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <div className="setup-go">
        {ready
          ? <span className="op-muted op-small">{random ? 'Ton adversaire sera tiré au sort au lancement de la partie.' : <>Ton bilan dans cette confrontation : {recordText(records[recordKey(config)])}</>}</span>
          : <span className="danger op-small">Choisis deux decks jouables (un deck perso incomplet se termine dans l’éditeur).</span>}
        <button className="op-btn op-btn-primary btn-big" data-ui="home.start" onClick={onStart} disabled={!ready}>Lancer la partie</button>
      </div>
      {played.length > 0 && (
        <section className="setup-section">
          <h2>Ton bilan</h2>
          <table className="op-stats">
            <thead><tr><th>Toi</th><th>IA</th><th>Niveau</th><th>Victoires</th></tr></thead>
            <tbody>
              {played.map((r) => (
                <tr key={r.key}>
                  <td>{deckLabel(r.myDeck)}</td>
                  <td>{deckLabel(r.aiDeck)}</td>
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
