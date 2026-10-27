import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVELS, type Level } from '../ai/search.ts';
import { replayRecord, type GameRecord, type Replayed } from '../coach/archive.ts';
import { DECKS } from '../engine/decks.ts';
import { newGame } from '../engine/engine.ts';
import type { PlayerId } from '../engine/types.ts';
import { flushQueue, whenSaved } from './archiveClient.ts';
import { recordText } from './Coach.tsx';
import { phaseLabel } from './decision.ts';
import { currentRoute, goBack, HOME, navigate, useLeaveGuard, useRoute } from './routes.ts';
import { useSettings } from './settings.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { DeckBuilderScreen } from './DeckBuilder.tsx';
import { DeckGuideModal } from './DeckGuide.tsx';
import { deckInfo, deckLabel, playable } from './myDecks.ts';
import { CardZoom } from './Zoom.tsx';
import { HistoryScreen } from './History.tsx';
import { GameGain, useGameGain } from './economy/GameGain.tsx';
import { EndScreen } from './end/EndScreen.tsx';
import { useAiOpponent } from './game/useAiOpponent.ts';
import { useCoach } from './game/useCoach.ts';
import { useGameRecording, useRecordingEnd } from './game/useGameRecording.ts';
import { matchupName, RANDOM_DECK, randomDeck, recordKey, useRecords, type Config } from './setup/config.ts';
import { SetupScreen, type AdventureEntry, type OnlineEntry } from './setup/SetupScreen.tsx';
import { CoachTab } from './table/SidePanel.tsx';
import { LeaveDialog, TableScreen } from './table/TableScreen.tsx';
import { useGameKeys } from './table/useGameKeys.ts';
import { useTable } from './table/useTable.ts';

export type { AdventureEntry, OnlineEntry };

const HUMAN: PlayerId = 0;
const AI: PlayerId = 1;

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

// Réglages d'une partie enregistrée (reprise, moment revu)
const configOf = (rec: GameRecord): Config => ({
  myDeck: rec.config.myDeck, aiDeck: rec.config.aiDeck, level: rec.config.level as Level, first: rec.config.first,
  ...(rec.config.myDeckName ? { myDeckName: rec.config.myDeckName } : {}), ...(rec.config.aiDeckName ? { aiDeckName: rec.config.aiDeckName } : {}),
});

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
  // Gain de la partie libre (Berry) : demandé au serveur une fois la partie finie et enregistrée (l'aventure le demande
  // elle-même, avec le résultat du chapitre)
  const { gain, claim, retry: retryGain, reset: resetGain } = useGameGain();

  // La partie, son enregistrement, l'IA et le coach (game/). Chaque remise à zéro remet aussi le plateau, le conseil et
  // le gain à zéro (onBegin, appelé après le rendu : table et coach existent alors)
  const rec = useGameRecording({
    human: HUMAN, mode: configured?.mode,
    onBegin: ({ intro }) => { coach.clearHint(); resetGain(); table.restart({ intro }); void coach.pump(); },
  });
  const { game, practice } = rec;
  const session = rec.session ?? config;
  const thinking = useAiOpponent(game, rec.setGame, AI, session.level, settings.speed);
  const coach = useCoach({
    game, human: HUMAN, humanTurn: rec.humanTurn, autoCoach: settings.autoCoach,
    moves: rec.moves, reviews: rec.reviews, reviewed: rec.reviewed, onReviewed: rec.setReviewed,
  });
  const records = useRecords(game, rec.gameId, HUMAN, practice, session);

  // Ton choix : joué et enregistré, puis analysé par le coach
  const { play } = rec;
  const { advice, pump } = coach;
  const choose = useCallback((id: string) => {
    play(id, advice);
    void pump();
  }, [play, advice, pump]);

  // Le plateau (contrôleur commun, table/) : l'aide, les réglages, le guide et la carte en grand servent aussi à
  // l'écran de départ
  const table = useTable({ state: game, seat: HUMAN, active: rec.humanTurn, choose, aids: true, recommended: coach.recommended });
  const { help, setHelp, guide, setGuide } = table;
  const cardZoom = table.board.zoom;
  useRecordingEnd(rec, { human: HUMAN, celebrate: table.celebrate, claim, onEnd: configured?.onEnd });

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

  // une partie, ou une fenêtre ouverte sur l'écran de départ (guide, Mes parties, aide), occupe tout l'écran
  const fullScreen = game !== null || history || guide !== null || help;
  useEffect(() => onImmersive?.(fullScreen), [fullScreen, onImmersive]);

  // L'adresse quitte la partie (« Menu », Retour après la fin) : la partie se ferme comme avec « Menu ». #play/jeu
  // ouvert sans partie (rechargement) : l'écran de départ
  const shownRoute = useRef(route.name);
  useEffect(() => {
    if (!routed) return;
    const was = shownRoute.current;
    shownRoute.current = route.name;
    if (was === 'jeu' && route.name !== 'jeu' && rec.gameRef.current) rec.quit();
  });
  useEffect(() => {
    if (routed && currentRoute().name === 'jeu' && !rec.gameRef.current) navigate(HOME, { replace: true });
  }, []);

  const start = () => {
    const aiDeck = config.aiDeck === RANDOM_DECK ? randomDeck(config.myDeck) : config.aiDeck;
    if (![config.myDeck, aiDeck].every((id) => DECKS[id] || (deckInfo(id) && playable(deckInfo(id)!)))) return false;
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
    rec.begin({ state: initial, config: named, intro: true });
    if (routed) navigate({ name: 'jeu' });
    // première partie : une bulle courte mène à l'aide (elle ne s'ouvre plus en grand sur la main de départ)
    if (!settings.helpSeen) {
      table.setTip(true);
      updateSettings({ helpSeen: true });
    }
    return true;
  };

  // Retour en arrière (une partie imposée finie est déjà envoyée et comptée : on ne revient plus dessus)
  const back = () => {
    if (configured && game?.winner !== null) return;
    if (rec.back()) table.reset();
  };

  // Raccourcis clavier (Échap ferme aussi Mes parties et Mes decks)
  useGameKeys(table, { undo: back, escape: () => showScreen(null) });

  // Rejouer un moment d'une partie archivée (depuis « Mes parties ») : comme « Revoir ce moment » du récap
  const resumeArchived = (saved: GameRecord, moveId: number) => {
    const replayed = replayRecord(saved);
    const index = replayed.moves.findIndex((m) => m.id === moveId);
    if (index < 0) throw new Error('ce moment n’existe plus dans la partie');
    const state = replayed.moves[index].state;
    const cfg = configOf(saved);
    setConfig(cfg);
    if (routed) navigate({ name: 'jeu' }, { replace: true });
    rec.begin({ state, config: cfg, practice: { from: saved.id, turn: state.turn }, moves: replayed.moves.slice(0, index), reviews: saved.reviews });
  };

  // Partie interrompue (Aventure) : on reprend l'enregistrement là où il s'était arrêté, sous le même identifiant, avec
  // les décisions déjà analysées par le coach. Les retours en arrière d'avant l'interruption ne sont plus possibles.
  const resumeInterrupted = (saved: GameRecord, replayed: Replayed) => {
    const cfg = configOf(saved);
    setConfig(cfg);
    rec.begin({ state: replayed.final, config: cfg, moves: replayed.moves, reviews: saved.reviews, continues: saved });
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

  // « Revoir ce moment et le rejouer » (récap) : entraînement depuis ce moment, avec les décisions d'avant
  const replay = (id: number) => {
    const index = rec.moves.current.findIndex((m) => m.id === id);
    if (index < 0) return;
    const state = rec.moves.current[index].state;
    rec.begin({
      state, config: session, practice: { from: rec.gameId, turn: state.turn },
      moves: rec.moves.current.slice(0, index), reviews: [...rec.reviews.current.values()],
    });
  };

  // « Menu » : retour à l'écran d'avant la partie (l'adresse quitte #play/jeu, la partie se ferme alors)
  const leave = () => {
    if (routed && currentRoute().name === 'jeu') return goBack(HOME);
    rec.quit();
  };
  // « Mes parties » après la partie : son détail, une fois l'enregistrement sur le serveur (sinon la liste)
  const openHistory = () => {
    const id = rec.gameId;
    flushQueue();
    void whenSaved().then(() => true, () => false).then((saved) => {
      if (currentRoute().name === 'jeu') navigate(saved && id ? { name: 'parties', id } : { name: 'parties' }, { replace: true });
    });
  };
  const over = game.winner !== null;
  const won = game.winner === HUMAN;
  const { hintNow } = coach;

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
        undo: { onClick: back, disabled: !rec.canUndo || (Boolean(configured) && over) },
        leave: configured
          ? { label: over ? 'Suite →' : 'Quitter', title: over ? 'Suite de l’aventure' : 'Quitter la partie : tu pourras la reprendre depuis le chapitre', onClick: configured.onLeave }
          : { label: 'Menu', onClick: leave },
      }}
      decks={{ mine: session.myDeck, theirs: session.aiDeck, theirsName: 'l’IA' }}
      coach={<CoachTab table={table} analysis={hintNow?.analysis ?? null} loading={Boolean(hintNow && !hintNow.analysis)} onAsk={coach.askHint} />}
      center={practice && <div className="practice">Entraînement depuis un moment revu : cette partie ne compte pas dans ton bilan.</div>}
      hint={{ state: hintNow ? (hintNow.analysis ? 'ready' : 'loading') : 'idle', ask: coach.askHint }}
      leave={confirmLeave && !over && (
        <LeaveDialog onStay={() => setConfirmLeave(false)} text={configured
          ? 'La partie est enregistrée : tu pourras la reprendre depuis le chapitre.'
          : 'La partie est enregistrée : tu la retrouveras dans « Mes parties ».'}>
          <button className="op-btn op-btn-ghost" data-ui="leave.yes" onClick={() => { setConfirmLeave(false); if (configured) configured.onLeave(); else leave(); }}>Quitter</button>
          <button className="op-btn op-btn-primary" data-ui="leave.no" onClick={() => setConfirmLeave(false)}>Continuer la partie</button>
        </LeaveDialog>
      )}
      reopenEnd
      end={(
        <EndScreen
          mode={configured ? 'aventure' : 'ia'}
          won={won}
          reason={game.winReason ?? ''}
          turns={game.turn}
          matchup={configured ? undefined : <>Bilan {matchupName(session)} : {recordText(records[recordKey(session)])}</>}
          note={practice && (configured
            ? 'Partie reprise depuis un moment revu : elle ne compte pas pour l’aventure.'
            : 'Partie reprise depuis un moment revu : elle ne compte pas dans ton bilan.')}
          gain={configured ? undefined : <GameGain gain={gain} onRetry={retryGain} />}
          coach={{ recap: coach.recap, progress: coach.progress, onReplay: replay }}
          onRestart={configured ? undefined : start}
          // aventure : le récap, puis les récompenses (le résultat du chapitre et le gain sont déjà demandés au serveur)
          onNext={configured?.onLeave}
          nextLabel={won && !practice ? 'Récompenses →' : 'Suite de l’aventure →'}
          onHistory={configured ? undefined : openHistory}
          onHome={configured ? undefined : leave}
          onBoard={() => table.setShowEnd(false)}
        />
      )}
    />
  );
}
