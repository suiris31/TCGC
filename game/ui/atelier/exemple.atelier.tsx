// Page d'exemple de l'atelier (tâche 0) : les chapitres des arcs et leur état, d'après des victoires simulées. Sert de
// modèle aux fichiers d'atelier des autres tâches : exporter `title` et `render`.
import { useState } from 'react';
import { ARCS } from '../../adventure/arcs.ts';
import { chapterStatuses, currentChapter, requiredChapters } from '../../adventure/progress.ts';
import type { ChapterStatus, Reward } from '../../adventure/types.ts';
import { LEVELS } from '../../ai/search.ts';
import { DECKS } from '../../engine/decks.ts';

export const title = 'Chapitres (exemple)';

const STATUS: Record<ChapterStatus, string> = { locked: '🔒 Verrouillé', open: '⚓ Ouvert', won: '✅ Gagné' };

const rewardText = (r: Reward) => (
  r.kind === 'booster' ? `${r.count} booster${r.count > 1 ? 's' : ''} ${r.set}`
    : r.kind === 'card' ? `${r.count} × ${r.number}`
    : r.kind === 'deck' ? `les cartes du deck ${r.deck}`
    : `${r.amount} Berry`
);

export function render() {
  return <Chapters />;
}

function Chapters() {
  const [wins, setWins] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setWins((before) => {
    const next = new Set(before);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return (
    <div className="op-atelier-demo">
      <p className="op-muted op-small">« Gagner » simule une première victoire : les chapitres suivants s’ouvrent (game/adventure/progress.ts).</p>
      {ARCS.map((arc) => {
        const statuses = chapterStatuses(arc, wins);
        const current = currentChapter(arc, wins);
        return (
          <section key={arc.id}>
            <h2>{arc.title} · boosters {arc.boosterSet} · deck de départ {arc.starterDeck ?? 'aucun'}</h2>
            <ol className="op-atelier-chapters">
              {[...arc.chapters].sort((a, b) => a.order - b.order).map((c) => (
                <li key={c.id} className={`op-atelier-chapter op-atelier-${statuses[c.id]}`}>
                  <div className="op-atelier-chapter-text">
                    <strong>{c.title}</strong>
                    {c.optional && <span className="op-chip">Défi bonus</span>}
                    {current === c.id && <span className="op-chip">Prochaine étape</span>}
                    <div className="op-small op-muted">
                      {c.place} · {c.opponent.name} · {DECKS[c.opponent.deck]?.name ?? c.opponent.deck} · niveau {LEVELS[c.opponent.level].name}
                    </div>
                    <div className="op-small">{c.intro[0] && `${c.intro[0].who || 'Narration'} : ${c.intro[0].text}`}</div>
                    <div className="op-small op-muted">
                      Récompenses : {c.rewards.map(rewardText).join(', ') || 'aucune'} · Après : {requiredChapters(arc, c).join(', ') || 'rien'}
                    </div>
                  </div>
                  <span className="op-atelier-status">{STATUS[statuses[c.id]]}</span>
                  <button className="op-btn op-btn-ghost" disabled={statuses[c.id] === 'locked'} onClick={() => toggle(c.id)}>
                    {wins.has(c.id) ? 'Annuler' : 'Gagner'}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
