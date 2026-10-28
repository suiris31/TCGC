// Écran d'un chapitre de l'aventure (tâche 1.17) : le dialogue d'introduction (une réplique à la fois, avec le portrait
// de celui qui parle), l'adversaire (son Leader, son deck, son niveau), les récompenses de la première victoire et le
// bouton « Combattre ». Écran sans appel au serveur : AdventureApp lui donne l'état et reçoit les choix du joueur.
// Rien ne se lance sans un appui sur « Combattre » (ou « Reprendre » pour une partie interrompue).
// Depuis la tâche R3.5 : gabarit `Screen` du kit (« ← Carte »), « Combattre » dans la barre collée en bas (toujours
// visible), guide du deck adverse (DeckGuideModal) ouvert depuis le panneau de l'adversaire.
import { useEffect, useMemo, useState } from 'react';
import type { Arc, Chapter, ChapterStatus, DialogueLine } from '../../adventure/types.ts';
import { LEVELS } from '../../ai/search.ts';
import { cardData } from '../../engine/cards/index.ts';
import { DECKS } from '../../engine/decks.ts';
import { DeckGuideModal } from '../DeckGuide.tsx';
import { GUIDES } from '../deckGuides.ts';
import { cardImage } from '../images.ts';
import { Button, Screen } from '../kit/index.ts';
import { useLayer } from '../routes.ts';
import { sfx } from '../sound.ts';
import { CardZoom, useCardZoom } from '../Zoom.tsx';
import { RewardList } from './RewardsScreen.tsx';

const BASE = import.meta.env.BASE_URL;

// Visuels possibles d'une carte, du meilleur au repli : celui du catalogue (langue affichée), puis le visuel anglais
// relayé par l'appli (une carte de l'aventure peut manquer du catalogue du navigateur)
export function cardSources(number: string): string[] {
  const d = cardData()[number];
  return [...new Set([...(d ? [cardImage(d)] : []), `${BASE}img-en-hd/${number}.webp`])];
}

export const cardName = (number: string) => cardData()[number]?.name ?? number;

// Illustration d'une carte, avec repli si un visuel manque ; sans aucun visuel, la première lettre du nom
export function CardArt({ number, className, fallback }: { number: string; className?: string; fallback?: string }) {
  const sources = useMemo(() => cardSources(number), [number]);
  const [n, setN] = useState(0);
  useEffect(() => setN(0), [number]);
  if (n >= sources.length) return <span className={`${className ?? ''} op-adv-art-none`} aria-hidden="true">{(fallback ?? cardName(number)).slice(0, 1)}</span>;
  return <img className={className} src={sources[n]} alt="" draggable={false} onError={() => setN(n + 1)} />;
}

// Dialogue : une réplique à la fois (appui sur la bulle ou « Suivant »), « Passer » pour tout sauter. Une fois fini, il se
// replie et peut être relu.
export function Dialogue({ lines, onDone }: { lines: DialogueLine[]; onDone?: () => void }) {
  const [at, setAt] = useState(0);
  const [over, setOver] = useState(lines.length === 0);
  const finish = () => {
    setOver(true);
    onDone?.();
  };
  const next = () => {
    sfx('click');
    if (at + 1 < lines.length) setAt(at + 1);
    else finish();
  };
  if (over) {
    return lines.length ? (
      <div className="op-adv-dlg op-adv-dlg-over">
        <span className="op-muted op-small">💬 Dialogue terminé</span>
        <button className="op-link" onClick={() => { setAt(0); setOver(false); }}>Relire</button>
      </div>
    ) : null;
  }
  const line = lines[at];
  const narration = !line.who;
  return (
    <div className={`op-adv-dlg ${narration ? 'op-adv-dlg-narration' : ''}`}>
      <button key={at} className="op-adv-bubble" data-ui="chapter.bubble" onClick={next} aria-label="Réplique suivante">
        {!narration && (
          <span className="op-adv-portrait">
            {line.card ? <CardArt number={line.card} className="op-adv-portrait-img" fallback={line.who} /> : <span className="op-adv-art-none">{line.who.slice(0, 1)}</span>}
          </span>
        )}
        <span className="op-adv-say">
          {!narration && <strong className="op-adv-who">{line.who}</strong>}
          <span className="op-adv-text">{line.text}</span>
        </span>
      </button>
      <div className="op-adv-dlg-bar">
        <span className="op-adv-dots" aria-label={`Réplique ${at + 1} sur ${lines.length}`}>
          {lines.map((_, i) => <i key={i} className={i <= at ? 'on' : ''} />)}
        </span>
        <button className="op-btn op-btn-ghost btn-small" data-ui="chapter.skip" onClick={finish}>Passer</button>
        <button className="op-btn btn-small" data-ui="chapter.next" onClick={next}>{at + 1 < lines.length ? 'Suivant ▸' : 'Terminer'}</button>
      </div>
    </div>
  );
}

// Le Leader du deck adverse et ce qu'il faut savoir de l'adversaire
export function OpponentCard({ chapter }: { chapter: Chapter }) {
  const deck = DECKS[chapter.opponent.deck];
  return (
    <div className="op-adv-opponent">
      {deck && <CardArt number={deck.leader} className="op-adv-leader" />}
      <div className="op-adv-opponent-text">
        <strong className="op-adv-opponent-name">{chapter.opponent.name}</strong>
        {deck && <span className="op-small op-muted">Leader : {cardName(deck.leader)}</span>}
        <span className="op-chip op-adv-level">IA {LEVELS[chapter.opponent.level].name}</span>
      </div>
    </div>
  );
}

// Partie déjà commencée contre cet adversaire : interrompue (à reprendre) ou gagnée mais pas encore comptée
export type Interrupted = { kind: 'resume'; turns: number; at: string } | { kind: 'unsent'; at: string };

export interface ChapterScreenProps {
  arc: Arc;
  chapter: Chapter;
  status: ChapterStatus;
  wins: number;                  // victoires déjà comptées dans ce chapitre
  deckName?: string;             // ton deck d'aventure, s'il est jouable
  blocked?: string;              // ce qui empêche de combattre (pas de deck, IA entraînée absente...)
  interrupted?: Interrupted;
  busy?: string;                 // action en cours (« Chargement de la partie… »)
  error?: string;
  onFight: () => void;           // nouvelle partie
  onResume: () => void;          // reprendre la partie interrompue
  onCount: () => void;           // faire compter la victoire pas encore comptée
  onDeck: () => void;            // ouvrir « Mon deck »
  onBack: () => void;            // retour à la carte
}

const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function ChapterScreen(p: ChapterScreenProps) {
  const { chapter } = p;
  const can = !p.blocked && !p.busy;
  const story = [...p.arc.chapters].filter((c) => !c.optional).sort((a, b) => a.order - b.order);
  const step = story.findIndex((c) => c.id === chapter.id);
  // guide du deck adverse : fenêtre liée au Retour et à Échap ; le survol d'une carte l'agrandit
  const [guide, setGuide] = useState(false);
  const cardZoom = useCardZoom(1200);
  const closeGuide = () => { setGuide(false); cardZoom.close(); };
  useLayer(guide, closeGuide);
  useEffect(() => {
    if (!guide) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGuide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide]);
  const hasGuide = Boolean(DECKS[chapter.opponent.deck]);
  const fightVariant = p.interrupted ? 'secondary' : 'primary';
  return (
    <Screen
      className="op-adv-screen op-adv-chapter"
      data-ui="chapter"
      back={{ label: 'Carte', onBack: p.onBack, 'data-ui': 'chapter.back' }}
      title={chapter.title}
      subtitle={`${chapter.optional ? '⚔ Défi bonus' : `Chapitre ${step + 1} sur ${story.length}`} · ${chapter.place}`}
      extra={p.status === 'won' ? <span className="op-chip op-adv-won">✓ Gagné{p.wins > 1 ? ` ${p.wins} fois` : ''}</span> : undefined}
      footer={(
        <div className="op-adv-go">
          <div className="op-adv-go-text op-small">
            {p.deckName && <span>Ton deck : <strong>{p.deckName}</strong> · <button className="op-link" data-ui="chapter.deck" onClick={p.onDeck}>Changer</button></span>}
            {p.blocked && <span className="op-warn">{p.blocked}</span>}
            {p.interrupted?.kind === 'resume' && <span className="op-muted">Partie interrompue {when(p.interrupted.at)} (tour {p.interrupted.turns || 1}) : tu peux la reprendre.</span>}
            {p.interrupted?.kind === 'unsent' && <span className="op-muted">Ta victoire du {when(p.interrupted.at)} n’a pas encore été comptée.</span>}
            {p.error && <span className="danger">{p.error}</span>}
            {p.busy && <span className="op-muted"><span className="op-spinner" /> {p.busy}</span>}
          </div>
          <div className="op-adv-go-actions">
            {p.interrupted?.kind === 'unsent' && <Button variant="primary" data-ui="chapter.count" disabled={Boolean(p.busy)} onClick={p.onCount}>Faire compter ma victoire</Button>}
            {p.interrupted?.kind === 'resume' && <Button variant="primary" data-ui="chapter.resume" disabled={!can} onClick={p.onResume}>▶ Reprendre la partie</Button>}
            <Button variant={fightVariant} size={p.interrupted ? 'normal' : 'big'} data-ui="chapter.fight" disabled={!can} onClick={p.onFight}>
              ⚔ {p.interrupted?.kind === 'resume' ? 'Nouvelle partie' : 'Combattre'}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="op-adv-page">
        <Dialogue key={chapter.id} lines={chapter.intro} />

        <div className="op-adv-grid">
          <section className="op-adv-panel">
            <h2>Ton adversaire</h2>
            <OpponentCard chapter={chapter} />
            {chapter.rules?.note && <p className="op-small op-adv-note">⚠ {chapter.rules.note}</p>}
            {hasGuide && (
              <Button variant="secondary" icon="deck" className="op-adv-guide" data-ui="chapter.guide" onClick={() => setGuide(true)}>
                {GUIDES[chapter.opponent.deck] ? 'Guide de son deck' : 'Voir son deck'}
              </Button>
            )}
          </section>
          <section className="op-adv-panel">
            <h2>{p.status === 'won' ? 'Récompenses (déjà gagnées)' : 'Première victoire'}</h2>
            <RewardList rewards={chapter.rewards} dim={p.status === 'won'} />
            {p.status === 'won' && <p className="op-small op-muted">Tu peux rejouer ce chapitre pour t’entraîner : les récompenses ne se gagnent qu’une fois.</p>}
          </section>
        </div>
      </div>
      {guide && <DeckGuideModal deckId={chapter.opponent.deck} onClose={closeGuide} onHover={cardZoom.onHover} />}
      {cardZoom.zoom && <CardZoom preview={cardZoom.zoom} onClose={cardZoom.close} />}
    </Screen>
  );
}
