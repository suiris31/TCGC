// Accueil de « Jouer » (#play, tâche R3.1 ; cadrage, § 2.3) : ce qu'il y a à faire, dans l'ordre où on le cherche.
// - en-tête : titre, bourse (mène à la boutique), aide, réglages ;
// - « Continuer » : ce qui est en cours (partie en ligne ou salle, partie rapide interrompue, chapitre interrompu) ;
// - l'Aventure en vedette (décision n° 1 de l'utilisateur), puis Partie rapide et Jouer avec un ami ;
// - les accès secondaires : Mes decks, Mes parties, Boutique.
// Rien ne se lance tout seul : une partie interrompue est proposée, et reprise seulement sur « Reprendre ».
import { useState, type ReactNode } from 'react';
import { LEVELS, type Level } from '../../ai/search.ts';
import { replayRecord, type Replayed } from '../../coach/archive.ts';
import type { HomeActions } from '../App.tsx';
import { loadRecord } from '../archiveClient.ts';
import { useWallet, WalletBadge } from '../economy/Wallet.tsx';
import { AsyncState, Button, Icon, IconButton, Screen, type IconName } from '../kit/index.ts';
import { deckLabel, useMyDecks } from '../myDecks.ts';
import type { CurrentMatch } from '../online/api.ts';
import { navigate } from '../routes.ts';
import { adventureProgress, interruptedChapter, interruptedQuick, quickRecord, since, type AdventureProgress, type HomeGame } from './logic.ts';
import { useHome } from './useHome.ts';

// resume : reprise d'une partie rapide interrompue (même enregistrement, à l'adresse de la partie) ; help, settings :
// l'aide et les réglages, ouverts par App (comme avec la touche « ? »)
export interface HomeProps extends HomeActions {
  notice?: string;
  // emplacement du classé (étape 3), entre les modes de jeu : rien ne le remplit aujourd'hui
  ranked?: ReactNode;
}

const levelName = (level: number) => LEVELS[level as Level]?.name ?? `niveau ${level}`;

export function Home({ notice, resume, help, settings, ranked }: HomeProps) {
  useMyDecks();   // noms de mes decks (parties interrompues avec un deck perso)
  const data = useHome();
  const { wallet } = useWallet();
  const now = Date.now();
  const games = data.games ?? [];
  const quick = interruptedQuick(games, now, data.dismissed);
  const chapter = data.adventure ? interruptedChapter(games, data.adventure.deckId, now, data.dismissed) : undefined;
  const progress = data.adventure ? adventureProgress(data.adventure) : null;
  const record = quickRecord(games);

  return (
    <Screen
      className="op-home"
      data-ui={data.ready ? 'home' : 'home.loading'}
      title="☠ OP Coach"
      extra={(
        <span className="op-home-wallet" data-ui="home.wallet">
          <WalletBadge wallet={wallet} onClick={() => navigate({ name: 'boutique' })} />
        </span>
      )}
      actions={[
        { id: 'help', label: 'Comment jouer ?', icon: 'help', onClick: help, 'data-ui': 'home.help' },
        { id: 'settings', label: 'Réglages', icon: 'settings', onClick: settings, 'data-ui': 'home.settings' },
      ]}
    >
      {!data.ready ? <AsyncState loading loadingText="Chargement de l’accueil…" /> : <div className="op-home-body">
        {notice && <p className="setup-notice">{notice}</p>}
        {(data.online || quick || chapter) && (
          <section className="op-home-continue" aria-labelledby="op-home-continue" data-ui="home.continue">
            <h2 id="op-home-continue" className="op-home-label">Continuer</h2>
            {data.online && <OnlineRow match={data.online} />}
            {quick && <QuickRow game={quick} now={now} onResume={resume} onDismiss={() => data.dismiss(quick.id)} />}
            {chapter && (
              <ContinueRow icon="🧭" data-ui="home.chapter"
                title={<>Aventure : {chapter.chapter.place}</>}
                detail={`Contre ${chapter.chapter.opponent.name} · tour ${chapter.game.turns} · ${since(chapter.game.updatedAt, now)}`}
                onDismiss={() => data.dismiss(chapter.game.id)}>
                <Button variant="primary" data-ui="home.chapter-resume"
                  onClick={() => navigate({ name: 'aventure', screen: { kind: 'chapter', id: chapter.chapter.id } })}>Reprendre</Button>
              </ContinueRow>
            )}
          </section>
        )}

        <AdventureCard progress={progress} failed={data.adventureFailed} />

        <div className="op-home-modes">
          <button type="button" className="op-home-mode" data-ui="home.quick" onClick={() => navigate({ name: 'rapide' })}>
            <span className="op-home-mode-icon" aria-hidden="true">⚔️</span>
            <span className="op-home-mode-title">Partie rapide</span>
            <span className="op-home-mode-text">
              {record.played ? `Contre l’IA · ${record.wins} victoire${record.wins > 1 ? 's' : ''} sur ${record.played}` : 'Contre l’IA, avec le deck de ton choix'}
            </span>
          </button>
          <button type="button" className="op-home-mode is-online" data-ui="home.online" onClick={() => navigate({ name: 'ami' })}>
            <span className="op-home-mode-icon" aria-hidden="true">🌐</span>
            <span className="op-home-mode-title">Jouer avec un ami</span>
            <span className="op-home-mode-text">En ligne : crée une salle et envoie son code</span>
          </button>
          {ranked}
        </div>

        <nav className="op-home-more" aria-label="Plus">
          <SecondaryLink icon="deck" label="Mes decks" data-ui="home.decks" onClick={() => navigate({ name: 'decks' })} />
          <SecondaryLink icon="history" label="Mes parties" data-ui="home.history" onClick={() => navigate({ name: 'parties' })} />
          <SecondaryLink icon="shop" label="Boutique" data-ui="home.shop" onClick={() => navigate({ name: 'boutique' })} />
        </nav>
        <p className="op-home-foot">
          <a className="op-link" href="#legal" title="Projet de fan non officiel : mentions légales et confidentialité">À propos</a>
        </p>
      </div>}
    </Screen>
  );
}

// ---------- Continuer ----------

function ContinueRow({ icon, title, detail, error, onDismiss, children, 'data-ui': dataUi }: {
  icon: string;
  title: ReactNode;
  detail: ReactNode;
  error?: string;
  onDismiss?: () => void;
  children: ReactNode;
  'data-ui'?: string;
}) {
  return (
    <div className="op-home-row" data-ui={dataUi}>
      <span className="op-home-row-icon" aria-hidden="true">{icon}</span>
      <div className="op-home-row-text">
        <strong>{title}</strong>
        <span className="op-home-row-detail">{detail}</span>
        {error && <span className="op-home-row-error" role="alert">{error}</span>}
      </div>
      <div className="op-home-row-actions">
        {children}
        {onDismiss && <IconButton icon="close" variant="quiet" label="Ignorer : ne plus la proposer ici (elle reste dans « Mes parties »)" onClick={onDismiss} data-ui={dataUi && `${dataUi}-dismiss`} />}
      </div>
    </div>
  );
}

function OnlineRow({ match }: { match: CurrentMatch }) {
  const playing = match.status === 'playing';
  return (
    <ContinueRow icon="🌐" data-ui="home.online-current"
      title={playing ? <>En ligne contre {match.opponent ?? 'ton ami'}</> : <>Ta salle {match.code} attend ton ami</>}
      detail={playing ? 'La partie t’attend.' : 'Envoie-lui le code, ou rouvre la salle.'}>
      <Button variant="primary" data-ui="home.online-resume" onClick={() => navigate({ name: 'partie', id: match.id })}>
        {playing ? 'Reprendre' : 'Ouvrir'}
      </Button>
    </ContinueRow>
  );
}

function QuickRow({ game, now, onResume, onDismiss }: { game: HomeGame; now: number; onResume: HomeActions['resume']; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { config } = game;
  const resume = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const rec = await loadRecord(game.id);
      let replayed: Replayed;
      try {
        replayed = replayRecord(rec);
      } catch {
        throw new Error('Cette partie ne peut plus être reprise : le jeu a été mis à jour depuis. Retrouve-la dans « Mes parties ».');
      }
      onResume(rec, replayed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <ContinueRow icon="⚔️" data-ui="home.resume" error={error} onDismiss={onDismiss}
      title={<>{deckLabel(config.myDeck, config.myDeckName)} <span className="op-home-vs">contre</span> {deckLabel(config.aiDeck, config.aiDeckName)}</>}
      detail={`Partie rapide · IA ${levelName(config.level)} · tour ${game.turns} · ${since(game.updatedAt, now)}`}>
      <Button variant="primary" busy={busy} onClick={() => void resume()} data-ui="home.resume-go">Reprendre</Button>
    </ContinueRow>
  );
}

// ---------- Aventure ----------

function AdventureCard({ progress, failed }: { progress: AdventureProgress | null; failed: boolean }) {
  const loading = !progress && !failed;
  const p = progress;
  const started = Boolean(p?.started);
  const title = !p || !started ? 'Prends la mer !'
    : p.finished || !p.next ? `${p.arc.title} : terminé !`
      : `Chapitre ${p.nextNumber} : ${p.next.place}`;
  const text = !p || !started
    ? 'Pars d’East Blue avec un deck de départ, affronte les adversaires de l’histoire et gagne des boosters pour améliorer ton deck.'
    : p.finished || !p.next
      ? (p.challengesLeft ? `Il te reste ${p.challengesLeft > 1 ? `${p.challengesLeft} défis` : 'un défi'} à relever. La suite du voyage arrive bientôt.` : 'Tous les adversaires sont battus. La suite du voyage arrive bientôt.')
      : `${p.next.title} · contre ${p.next.opponent.name}`;
  const open = () => {
    if (p && started && !p.finished && p.next) navigate({ name: 'aventure', screen: { kind: 'chapter', id: p.next.id } });
    else navigate({ name: 'aventure' });
  };
  return (
    <section className={`op-home-adv${loading ? ' is-loading' : ''}`} aria-labelledby="op-home-adv-title" data-ui="home.adventure-card">
      <div className="op-home-adv-sea" aria-hidden="true">
        <span className="op-home-adv-ship">⛵</span>
      </div>
      <div className="op-home-adv-body">
        <p className="op-home-label">Aventure{p ? ` · ${p.arc.title}` : ''}</p>
        <h2 id="op-home-adv-title" className="op-home-adv-title">{title}</h2>
        <p className="op-home-adv-text">{text}</p>
        {p && started && (
          <div className="op-home-adv-progress" role="img" aria-label={`${p.won} chapitre${p.won > 1 ? 's' : ''} gagné${p.won > 1 ? 's' : ''} sur ${p.total}`}>
            <span className="op-home-adv-dots" aria-hidden="true">
              {Array.from({ length: p.total }, (_, i) => <i key={i} className={i < p.won ? 'is-won' : i === p.won ? 'is-next' : undefined} />)}
            </span>
            <span className="op-home-adv-count">{p.won}/{p.total}</span>
          </div>
        )}
        <div className="op-home-adv-actions">
          <Button variant="primary" size="big" onClick={open} data-ui="home.adventure">
            {!started ? 'Partir à l’aventure' : p?.finished || !p?.next ? 'Ouvrir la carte' : 'Continuer l’aventure'}
          </Button>
          {started && p?.next && !p.finished && (
            <Button variant="quiet" onClick={() => navigate({ name: 'aventure' })} data-ui="home.adventure-map">Carte</Button>
          )}
          {p && p.boosters > 0 && (
            <Button variant="quiet" icon="hold" onClick={() => navigate({ name: 'aventure', screen: { kind: 'hold' } })} data-ui="home.adventure-hold">
              {p.boosters} booster{p.boosters > 1 ? 's' : ''} à ouvrir
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- Accès secondaires ----------

function SecondaryLink({ icon, label, onClick, 'data-ui': dataUi }: { icon: IconName; label: string; onClick: () => void; 'data-ui': string }) {
  return (
    <button type="button" className="op-home-link" onClick={onClick} data-ui={dataUi}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
