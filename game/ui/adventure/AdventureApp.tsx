// Mode Aventure (tâche 1.17) : le parcours complet, de l'accueil à la fin de l'arc.
// - Premier passage : écran d'accueil, « Prendre la mer » donne le deck de départ (dans la Cale) et le deck d'aventure.
// - Carte du monde (WorldMap) avec la progression lue sur le serveur ; une île verrouillée s'explique, une île ouverte
//   ou gagnée ouvre son chapitre (ChapterScreen) ; « Ma Cale » et « Mon deck » ouvrent les écrans de la tâche 1.18 ;
//   le solde de la bourse et « Boutique » ouvrent la boutique (tâche 2.3).
// - « Combattre » lance la partie sur le plateau du jeu (App, partie imposée) : ton deck d'aventure contre le deck et le
//   niveau du chapitre. Une partie quittée ou coupée (onglet fermé) se reprend depuis le chapitre.
// - Fin de partie : l'enregistrement final est envoyé, puis le serveur rejoue la partie et donne les récompenses de la
//   première victoire (RewardsScreen), puis le gain de la partie en Berry (barème de l'IA du chapitre, bonus du jour,
//   coffre de la semaine), victoire ou défaite ; les boosters s'ouvrent tout de suite (BoosterOpening) ou plus tard. Le plateau
//   reste en place derrière l'écran de fin : le récap du coach reste accessible jusqu'au retour à la carte.
// Rien ne se lance sans un choix explicite ; les refus et erreurs du serveur s'affichent tels quels (en français).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ARCS, findChapter } from '../../adventure/arcs.ts';
import { arcFinished, chapterStatuses, currentChapter, requiredChapters } from '../../adventure/progress.ts';
import type { ChapterStatus } from '../../adventure/types.ts';
import { rlModelAvailable } from '../../ai/client.ts';
import type { BoosterContent } from '../../boosters/types.ts';
import { replayRecord, type GameRecord, type Replayed } from '../../coach/archive.ts';
import { DECKS } from '../../engine/decks.ts';
import { App } from '../App.tsx';
import { flushQueue, loadRecord, loadSummaries, whenSaved } from '../archiveClient.ts';
import { deckInfo, loadMyDecks, playable, useMyDecks } from '../myDecks.ts';
import { useSettings } from '../settings.ts';
import { useGameGain } from '../economy/GameGain.tsx';
import { ShopScreen } from '../economy/Shop.tsx';
import { refreshWallet, useWallet, WalletBadge } from '../economy/Wallet.tsx';
import { boosterSfx, setSoundEnabled } from '../sound.ts';
import { AdventureDeckScreen } from './AdventureDeck.tsx';
import { ArcSummary } from './ArcSummary.tsx';
import { AdventureApiError, loadAdventure, loadHold, openWonBooster, sendChapterResult, startArc, wonChapters, type AdventureState } from './api.ts';
import { BoosterOpening, ownedCounts } from './BoosterOpening.tsx';
import { ChapterScreen, type Interrupted } from './ChapterScreen.tsx';
import { HoldScreen } from './Hold.tsx';
import { PackIcon, RewardsScreen, type SendState } from './RewardsScreen.tsx';
import { WorldMap, forgetShip } from './WorldMap.tsx';

const ARC = ARCS[0];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Screen = { kind: 'map' } | { kind: 'chapter'; id: string } | { kind: 'hold' } | { kind: 'deck' } | { kind: 'shop' };

// Partie en cours ou finie (le plateau reste monté jusqu'au retour à la carte, pour le récap du coach)
interface Match {
  chapter: string;
  n: number;                                         // une nouvelle partie remonte le plateau
  resume?: { rec: GameRecord; replayed: Replayed };
}

// Fin de partie : dialogue, résultat envoyé au serveur, boosters à ouvrir
interface Outcome {
  chapter: string;
  won: boolean;
  recordId?: Promise<string>;
}

// Dernière partie commencée avec ce deck contre l'adversaire de ce chapitre (par date de début : la date de mise à jour
// bouge encore après la fin, avec l'analyse du coach) : interrompue, ou gagnée sans être comptée
async function findInterrupted(chapterId: string, deckId: string, won: boolean): Promise<(Interrupted & { id: string }) | undefined> {
  const found = findChapter(chapterId);
  if (!found) return undefined;
  const { opponent } = found.chapter;
  // une partie qu'on vient de quitter s'enregistre quand le plateau disparaît : on attend cet envoi
  await new Promise((resolve) => setTimeout(resolve, 50));
  flushQueue();
  await whenSaved();
  const list = (await loadSummaries())
    .filter((g) => !g.practice && g.mode !== 'online' && g.config.myDeck === deckId && g.config.aiDeck === opponent.deck && g.config.level === opponent.level)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last = list[0];
  if (!last) return undefined;
  if (last.status === 'playing' || last.status === 'abandoned') return { kind: 'resume', id: last.id, turns: last.turns, at: last.updatedAt };
  if (last.status === 'won' && !won) return { kind: 'unsent', id: last.id, at: last.updatedAt };
  return undefined;
}

export function AdventureApp({ onBack }: { onBack: () => void }) {
  const [settings] = useSettings();
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  useMyDecks();   // mes decks arrivent après coup : deckInfo (deck d'aventure) les relit à chaque affichage
  const [adv, setAdv] = useState<AdventureState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'map' });
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [interrupted, setInterrupted] = useState<(Interrupted & { id: string }) | undefined>();
  const [rlOk, setRlOk] = useState<boolean | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [board, setBoard] = useState(false);          // plateau affiché (partie en cours, ou récap du coach)
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sent, setSent] = useState<SendState>(null);
  const [opening, setOpening] = useState<{ contents: BoosterContent[]; owned: Record<string, number> } | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState<string>();
  const { gain, claim, retry: retryGain, reset: resetGain } = useGameGain();

  const reload = useCallback(async () => {
    try {
      setAdv(await loadAdventure());
      setLoadError(null);
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void loadMyDecks(); }, []);

  const wins = useMemo(() => (adv ? wonChapters(adv) : new Set<string>()), [adv]);
  const winsRef = useRef(wins);
  winsRef.current = wins;
  const [finale, setFinale] = useState(false);       // bilan de l'arc, montré à la carte après la victoire qui le termine
  const statuses = useMemo(() => chapterStatuses(ARC, wins) as Record<string, ChapterStatus>, [wins]);
  const current = currentChapter(ARC, wins);
  const started = Boolean(adv?.arcs[ARC.id]?.started);
  const deck = adv?.deckId ? deckInfo(adv.deckId) : undefined;

  // ---------- Départ ----------
  const setSail = async () => {
    setBusy('Préparation de ton navire…');
    setError(undefined);
    try {
      const state = await startArc(ARC.id);
      forgetShip();   // le bateau part du village de Fuchsia
      await loadMyDecks();
      setAdv(state);
      setScreen({ kind: 'map' });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(undefined);
    }
  };

  // ---------- Chapitre ----------
  const openChapter = (id: string) => {
    setScreen({ kind: 'chapter', id });
    setError(undefined);
    setInterrupted(undefined);
    const level = findChapter(id)?.chapter.opponent.level;
    if (level === 4 && rlOk === null) void rlModelAvailable().then(setRlOk);
    if (adv?.deckId) void findInterrupted(id, adv.deckId, wins.has(id)).then(setInterrupted, () => undefined);
  };

  const onPick = (id: string) => {
    setPicked(id);
    if (statuses[id] !== 'locked') openChapter(id);
  };

  const fight = (resume?: Match['resume']) => {
    if (screen.kind !== 'chapter') return;
    setMatch({ chapter: screen.id, n: Date.now(), resume });
    setBoard(true);
    setOutcome(null);
    setSent(null);
    resetGain();
  };

  const resume = async () => {
    if (!interrupted || interrupted.kind !== 'resume') return;
    setBusy('Chargement de la partie…');
    setError(undefined);
    try {
      const rec = await loadRecord(interrupted.id);
      let replayed: Replayed;
      try {
        replayed = replayRecord(rec);
      } catch {
        throw new Error('Cette partie ne peut plus être reprise : le jeu a été mis à jour depuis. Lance une nouvelle partie.');
      }
      fight({ rec, replayed });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(undefined);
    }
  };

  // ---------- Fin de partie ----------
  // then : après la réponse du serveur, réussie ou non (le gain de la partie se demande après le résultat du chapitre,
  // pour que le solde affiché compte déjà ses Berry)
  const send = useCallback((chapterId: string, recordId: Promise<string>, then?: () => void) => {
    setSent({ state: 'sending' });
    (async () => {
      const id = await recordId.catch(() => { throw new Error('La partie n’a pas pu être enregistrée'); });
      flushQueue();   // la partie a pu rester dans le navigateur (réseau coupé) : on la renvoie d'abord
      await whenSaved();
      return sendChapterResult(chapterId, id).catch((e: unknown) => {
        // enregistrement pas encore arrivé (envoi refusé ou coupé) : il reste dans le navigateur, un nouvel essai le renvoie
        if (e instanceof AdventureApiError && e.code === 'unknown_record') throw new Error('Ta partie n’est pas encore arrivée sur le serveur');
        throw e;
      });
    })().then(
      (value) => {
        setSent({ state: 'done', value });
        if (value.firstWin) {
          void refreshWallet();
          boosterSfx('shine');
          const after = new Set(winsRef.current).add(chapterId);
          if (!arcFinished(ARC, winsRef.current) && arcFinished(ARC, after)) setFinale(true);
        }
        void reload();
      },
      (e: unknown) => setSent({ state: 'error', message: e instanceof AdventureApiError ? e.message : `${message(e)}. Vérifie ta connexion, puis réessaie.` }),
    ).finally(then);
  }, [reload]);

  // La partie est finie (écran de victoire ou de défaite passé) : place au dialogue de fin et au résultat
  const onEnd = ({ won, saved }: { won: boolean; saved: Promise<string> }) => {
    if (!match) return;
    setOutcome({ chapter: match.chapter, won, recordId: saved });
    setOpenError(undefined);
    const gainOf = () => claim(() => saved.catch(() => { throw new Error('La partie n’a pas pu être enregistrée'); }));
    if (won) send(match.chapter, saved, gainOf);
    else {
      setSent(null);
      gainOf();
    }
    setBoard(false);
  };

  // « Quitter » pendant la partie : retour au chapitre (le plateau disparaît, la partie est enregistrée et reprenable) ;
  // « Suite » après la fin (ou après le récap) : retour à l'écran de fin
  const onLeaveBoard = () => {
    setBoard(false);
    if (!outcome && match) {
      setMatch(null);
      openChapter(match.chapter);
    }
  };

  const toMap = () => {
    setMatch(null);
    setOutcome(null);
    setSent(null);
    resetGain();
    setOpening(null);
    setPicked(undefined);
    setScreen({ kind: 'map' });
    void reload();
  };

  // ---------- Boosters ----------
  // La Cale est lue AVANT l'ouverture (« Nouveau ! ») ; chaque booster est tiré par le serveur
  const openBoosters = async (ids: string[]) => {
    setOpenBusy(true);
    setOpenError(undefined);
    const contents: BoosterContent[] = [];
    try {
      const owned = ownedCounts((await loadHold()).cards);
      try {
        for (const id of ids) contents.push((await openWonBooster(id)).content);
      } finally {
        if (contents.length) setOpening({ contents, owned });
      }
    } catch (e) {
      setOpenError(`${message(e)}${contents.length ? ' (les boosters non ouverts restent dans ta Cale)' : ''}`);
    } finally {
      setOpenBusy(false);
    }
  };

  // ---------- Affichage ----------
  const chapterOf = (id: string) => ARC.chapters.find((c) => c.id === id);

  let content: ReactNode;
  if (!adv) {
    content = loadError ? (
      <div className="opc-wait op-adv-wait">
        <span className="danger">{loadError}</span>
        <button className="op-btn op-btn-ghost" onClick={() => void reload()}>Réessayer</button>
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour au jeu</button>
      </div>
    ) : <div className="opc-wait"><span className="op-spinner" /> Chargement de ton aventure…</div>;
  } else if (!started) {
    content = <Welcome busy={busy} error={error} onSail={() => void setSail()} onBack={onBack} />;
  } else if (outcome && chapterOf(outcome.chapter)) {
    content = (
      <RewardsScreen chapter={chapterOf(outcome.chapter)!} won={outcome.won} result={sent} gain={gain} onRetryGain={retryGain}
        opening={openBusy} openError={openError}
        onOpen={(ids) => void openBoosters(ids)} onLater={toMap}
        onResend={() => outcome.recordId && send(outcome.chapter, outcome.recordId)}
        onRecap={match ? () => setBoard(true) : undefined}
        onRetry={() => { const id = outcome.chapter; toMap(); openChapter(id); }}
        onMap={toMap} />
    );
  } else if (screen.kind === 'hold') {
    content = <HoldScreen onBack={() => { setScreen({ kind: 'map' }); void reload(); }} />;
  } else if (screen.kind === 'shop') {
    content = <ShopScreen onBack={() => { setScreen({ kind: 'map' }); void reload(); }} />;
  } else if (screen.kind === 'deck') {
    content = <AdventureDeckScreen onBack={() => { setScreen({ kind: 'map' }); void reload(); void loadMyDecks(); }} />;
  } else if (screen.kind === 'chapter' && chapterOf(screen.id)) {
    const chapter = chapterOf(screen.id)!;
    const blocked = !adv.deckId ? 'Tu n’as pas de deck d’aventure : choisis-en un dans « Mon deck ».'
      : !deck ? 'Chargement de ton deck…'
        : !playable(deck) ? 'Ton deck d’aventure est incomplet : termine-le dans « Mon deck ».'
          : !DECKS[chapter.opponent.deck] ? 'Le deck de cet adversaire n’est pas encore jouable.'
            : chapter.opponent.level === 4 && rlOk === false ? 'Ce défi se joue contre l’IA entraînée, qui n’est pas installée sur ce serveur.'
              : chapter.opponent.level === 4 && rlOk === null ? 'Vérification de l’IA entraînée…'
                : undefined;
    content = (
      <ChapterScreen arc={ARC} chapter={chapter} status={statuses[chapter.id]} wins={adv.chapters[chapter.id]?.wins ?? 0}
        deckName={deck && playable(deck) ? deck.name : undefined} blocked={blocked} interrupted={interrupted} busy={busy} error={error}
        onFight={() => fight()} onResume={() => void resume()}
        onCount={() => {
          if (interrupted?.kind !== 'unsent') return;
          const id = interrupted.id;
          setOutcome({ chapter: chapter.id, won: true, recordId: Promise.resolve(id) });
          resetGain();
          send(chapter.id, Promise.resolve(id), () => claim(() => Promise.resolve(id)));
        }}
        onDeck={() => setScreen({ kind: 'deck' })} onBack={() => setScreen({ kind: 'map' })} />
    );
  } else {
    content = (
      <>
        <MapScreen adv={adv} statuses={statuses} current={current} picked={picked} onPick={onPick} busy={openBusy} error={openError}
          finished={arcFinished(ARC, wins)} onBack={onBack} onHold={() => setScreen({ kind: 'hold' })} onDeck={() => setScreen({ kind: 'deck' })}
          onShop={() => setScreen({ kind: 'shop' })}
          onChapter={openChapter} onOpenBoosters={() => void openBoosters(adv.boosters.map((b) => b.id))} onSummary={() => setFinale(true)} />
        {finale && !opening && <ArcSummary arc={ARC} adv={adv} onClose={() => setFinale(false)} />}
      </>
    );
  }

  const playing = match && adv?.deckId ? findChapter(match.chapter)?.chapter : undefined;
  return (
    <>
      <div className="op-adv-layer" hidden={board}>{content}</div>
      {match && playing && (
        <div className="op-adv-board" hidden={!board}>
          <App key={match.n} configured={{
            myDeck: match.resume?.rec.config.myDeck ?? adv!.deckId!,
            aiDeck: playing.opponent.deck,
            level: playing.opponent.level,
            opponentName: playing.opponent.name,
            resume: match.resume,
            onEnd,
            onLeave: onLeaveBoard,
          }} />
        </div>
      )}
      {opening && (
        <BoosterOpening content={opening.contents} owned={opening.owned} onDone={toMap} />
      )}
    </>
  );
}

function Welcome({ busy, error, onSail, onBack }: { busy?: string; error?: string; onSail: () => void; onBack: () => void }) {
  const starter = ARC.starterDeck ? DECKS[ARC.starterDeck] : undefined;
  return (
    <div className="setup op-adv op-adv-welcome">
      <header className="op-adv-head">
        <button className="op-btn op-btn-ghost btn-small" onClick={onBack}>← Jeu</button>
      </header>
      <div className="op-adv-welcome-body">
        <div className="op-adv-welcome-ship" aria-hidden="true">⛵</div>
        <h1>Ton aventure commence à East Blue</h1>
        <p>
          Un petit bateau, un chapeau de paille et un rêve immense. Pars du village de Fuchsia, affronte un à un les
          adversaires d’East Blue sur la carte, et gagne des boosters pour renforcer ton équipage.
        </p>
        {starter && (
          <p className="op-muted">
            Tu reçois le deck <strong>{starter.name}</strong> : ses cartes vont dans ta Cale et forment ton deck d’aventure.
            Chaque carte que tu gagneras pourra le rejoindre.
          </p>
        )}
        {error && <p className="danger">{error}</p>}
        <button className="op-btn op-btn-primary btn-big" disabled={Boolean(busy)} onClick={onSail}>
          {busy ? <><span className="op-spinner" /> {busy}</> : '⚓ Prendre la mer'}
        </button>
        <p className="op-small op-muted op-adv-fan">Projet de fan non officiel et gratuit, sans lien avec Bandai, Shueisha ou Toei Animation.</p>
      </div>
    </div>
  );
}

function MapScreen({ adv, statuses, current, picked, finished, busy, error, onPick, onBack, onHold, onDeck, onShop, onChapter, onOpenBoosters, onSummary }: {
  adv: AdventureState;
  statuses: Record<string, ChapterStatus>;
  current?: string;
  picked?: string;
  finished: boolean;
  busy: boolean;
  error?: string;
  onPick: (id: string) => void;
  onBack: () => void;
  onHold: () => void;
  onDeck: () => void;
  onShop: () => void;
  onChapter: (id: string) => void;
  onOpenBoosters: () => void;
  onSummary: () => void;
}) {
  const next = current ? ARC.chapters.find((c) => c.id === current) : undefined;
  const locked = picked && statuses[picked] === 'locked' ? ARC.chapters.find((c) => c.id === picked) : undefined;
  const needed = locked ? requiredChapters(ARC, locked).filter((id) => statuses[id] !== 'won').map((id) => ARC.chapters.find((c) => c.id === id)!) : [];
  const waiting = adv.boosters.length;
  const { wallet } = useWallet();
  return (
    <div className="setup op-adv op-adv-map">
      <header className="op-adv-head">
        <button className="op-btn op-btn-ghost btn-small" onClick={onBack}>← Jeu</button>
        <h1 className="op-adv-map-title">{ARC.title}</h1>
        <WalletBadge wallet={wallet} onClick={onShop} />
        <div className="op-adv-head-actions">
          {waiting > 0 && (
            <button className="op-btn btn-small op-adv-gift" disabled={busy} onClick={onOpenBoosters} title="Ouvrir tes boosters gagnés (ils restent aussi dans ta Cale)">
              {busy ? <span className="op-spinner" /> : <PackIcon set={adv.boosters[0].set} />} {waiting} booster{waiting > 1 ? 's' : ''}<span className="op-adv-wide"> à ouvrir</span>
            </button>
          )}
          <button className="op-btn op-btn-ghost btn-small" onClick={onHold}>🧰 Ma Cale</button>
          <button className="op-btn op-btn-ghost btn-small" onClick={onDeck}>🃏 Mon deck</button>
          <button className="op-btn op-btn-ghost btn-small" onClick={onShop}>🏪 Boutique</button>
        </div>
      </header>
      <WorldMap arcs={ARCS} statuses={statuses} current={current} onPick={onPick} selected={picked} />
      <div className="op-adv-strip">
        {error ? <span className="danger op-small">{error}</span>
          : locked ? (
            <span>🔒 <strong>{locked.place}</strong> n’est pas encore accessible : gagne d’abord {needed.map((c, i) => (
              <span key={c.id}>{i ? ' et ' : ''}« {c.title} » ({c.place})</span>
            ))}.</span>
          ) : finished ? (
            <span>🏴‍☠️ <strong>East Blue est terminé !</strong> La suite du voyage arrive bientôt. Tu peux rejouer chaque chapitre.</span>
          ) : next ? (
            <span>Prochaine étape : <strong>{next.place}</strong> · {next.title}</span>
          ) : null}
        {next && !locked && !error && (
          <button className="op-btn op-btn-primary" onClick={() => onChapter(next.id)}>⚓ Y aller</button>
        )}
        {finished && !locked && !error && <button className="op-btn op-btn-ghost" onClick={onSummary}>📜 Bilan</button>}
      </div>
    </div>
  );
}
