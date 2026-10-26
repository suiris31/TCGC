// Atelier du parcours de l'aventure (tâche 1.17) : l'écran d'un chapitre et l'écran de fin de partie, avec les données
// d'East Blue et des résultats de démonstration. Rien n'est envoyé au serveur et aucune partie ne se lance.
import { useState } from 'react';
import { EAST_BLUE } from '../../adventure/east-blue.ts';
import type { ChapterResult } from '../adventure/api.ts';
import { ChapterScreen, type Interrupted } from '../adventure/ChapterScreen.tsx';
import { RewardsScreen, type SendState } from '../adventure/RewardsScreen.tsx';

export const title = 'Parcours (chapitre, fin de partie)';

const chapters = [...EAST_BLUE.chapters].sort((a, b) => a.order - b.order);
const at = new Date(Date.now() - 3 * 3600_000).toISOString();

const CHAPTER_CASES: { name: string; interrupted?: Interrupted; blocked?: string; won?: boolean; error?: string }[] = [
  { name: 'À jouer' },
  { name: 'Partie interrompue', interrupted: { kind: 'resume', turns: 6, at } },
  { name: 'Victoire pas comptée', interrupted: { kind: 'unsent', at } },
  { name: 'Déjà gagné', won: true },
  { name: 'Deck incomplet', blocked: 'Ton deck d’aventure est incomplet : termine-le dans « Mon deck ».' },
  { name: 'Erreur', error: 'Cette partie ne peut plus être reprise : le jeu a été mis à jour depuis. Lance une nouvelle partie.' },
];

function firstWin(chapterIndex: number): ChapterResult {
  const c = chapters[chapterIndex];
  const boosters = c.rewards.flatMap((r) => (r.kind === 'booster' ? Array.from({ length: r.count }, (_, i) => ({ id: `demo-${i}`, set: r.set, source: `chapitre ${c.id}`, createdAt: at })) : []));
  return { won: true, firstWin: true, rewards: c.rewards, boosters };
}

const END_CASES: { name: string; won: boolean; result: (i: number) => SendState }[] = [
  { name: 'Vérification', won: true, result: () => ({ state: 'sending' }) },
  { name: 'Première victoire', won: true, result: (i) => ({ state: 'done', value: firstWin(i) }) },
  { name: 'Déjà gagné', won: true, result: () => ({ state: 'done', value: { won: true, firstWin: false, rewards: [], boosters: [] } }) },
  { name: 'Erreur réseau', won: true, result: () => ({ state: 'error', message: 'Le serveur ne répond pas : vérifie ta connexion' }) },
  { name: 'Défaite', won: false, result: () => null },
];

export function render() {
  return <Demo />;
}

function Demo() {
  const [chapter, setChapter] = useState(0);
  const [view, setView] = useState<{ end: boolean; i: number }>({ end: false, i: 0 });
  const [log, setLog] = useState('');
  const c = chapters[chapter];
  const say = (what: string) => () => setLog(`${what} (démonstration : rien ne se lance)`);
  const chapterCase = CHAPTER_CASES[view.i];
  const endCase = END_CASES[view.i];
  return (
    <div className="op-atelier-demo">
      <div className="op-atelier-pages">
        {chapters.map((x, i) => (
          <button key={x.id} className={i === chapter ? 'deck-chip on' : 'deck-chip'} onClick={() => setChapter(i)}>{x.optional ? `Défi : ${x.opponent.name}` : x.place}</button>
        ))}
      </div>
      <div className="op-atelier-pages">
        {CHAPTER_CASES.map((x, i) => (
          <button key={x.name} className={!view.end && view.i === i ? 'deck-chip on' : 'deck-chip'} onClick={() => setView({ end: false, i })}>Chapitre : {x.name}</button>
        ))}
        {END_CASES.map((x, i) => (
          <button key={x.name} className={view.end && view.i === i ? 'deck-chip on' : 'deck-chip'} onClick={() => setView({ end: true, i })}>Fin : {x.name}</button>
        ))}
      </div>
      {log && <p className="op-small op-muted">{log}</p>}
      {view.end ? (
        <RewardsScreen key={`${c.id}-${view.i}`} chapter={c} won={endCase.won} result={endCase.result(chapter)}
          onOpen={say('Ouvrir maintenant')} onLater={say('Plus tard')} onResend={say('Réessayer')} onRecap={say('Récap du coach')}
          onRetry={say('Retenter')} onMap={say('Retour à la carte')} />
      ) : (
        <ChapterScreen key={`${c.id}-${view.i}`} arc={EAST_BLUE} chapter={c} status={chapterCase.won ? 'won' : 'open'} wins={chapterCase.won ? 2 : 0}
          deckName={chapterCase.blocked ? undefined : 'Aventure : deck de démonstration'} blocked={chapterCase.blocked}
          interrupted={chapterCase.interrupted} error={chapterCase.error}
          onFight={say('Combattre')} onResume={say('Reprendre')} onCount={say('Faire compter')} onDeck={say('Mon deck')} onBack={say('Carte')} />
      )}
    </div>
  );
}
