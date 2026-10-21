// Bilan d'un arc de l'aventure (tâche 1.21) : montré une fois, au retour à la carte après la victoire qui termine l'arc,
// puis à la demande (« Bilan » de la carte). Chapitres et défis gagnés, victoires comptées, taille de la Cale.
import { useEffect, useRef, useState } from 'react';
import type { Arc } from '../../adventure/types.ts';
import { sfx } from '../sound.ts';
import { loadHold, type AdventureState } from './api.ts';

// holdCards : taille de la Cale déjà connue (atelier) ; sinon elle est lue sur le serveur
export function ArcSummary({ arc, adv, holdCards, onClose }: {
  arc: Arc;
  adv: Pick<AdventureState, 'chapters' | 'boosters'>;
  holdCards?: number;
  onClose: () => void;
}) {
  const [hold, setHold] = useState<number | null>(holdCards ?? null);
  const ok = useRef<HTMLButtonElement>(null);
  // le clavier va sur « Continuer » sans faire défiler la fenêtre (le haut du bilan reste visible)
  useEffect(() => ok.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    sfx('win');
    if (holdCards === undefined) loadHold().then(({ cards }) => setHold(cards.reduce((n, c) => n + c.count, 0)), () => undefined);
  }, [holdCards]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const chapters = [...arc.chapters].sort((a, b) => a.order - b.order);
  const wins = (id: string) => adv.chapters[id]?.wins ?? 0;
  const story = chapters.filter((c) => !c.optional);
  const challenges = chapters.filter((c) => c.optional);
  const total = chapters.reduce((n, c) => n + wins(c.id), 0);
  const missed = challenges.filter((c) => !wins(c.id));
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box op-adv-finale" role="dialog" aria-modal="true" aria-labelledby="op-adv-finale-title" onClick={(e) => e.stopPropagation()}>
        <div className="op-adv-finale-flag" aria-hidden="true">🏴‍☠️</div>
        <h2 id="op-adv-finale-title">{arc.title} est terminé !</h2>
        <p>
          De {story[0].place} à {story[story.length - 1].place}, tu as battu tous les adversaires de l’histoire. Ton équipage a fait
          ses preuves : au loin se dresse Reverse Mountain, porte de la suite du voyage, qui arrive bientôt.
        </p>
        <div className="op-adv-finale-stats">
          <span><b>{story.filter((c) => wins(c.id)).length}/{story.length}</b> chapitres</span>
          <span><b>{challenges.filter((c) => wins(c.id)).length}/{challenges.length}</b> défis</span>
          <span><b>{total}</b> victoire{total > 1 ? 's' : ''}</span>
          <span><b>{hold ?? '…'}</b> cartes dans ta Cale</span>
        </div>
        <ul className="op-adv-finale-list">
          {chapters.map((c) => (
            <li key={c.id} className={wins(c.id) ? 'is-won' : ''}>
              <span aria-hidden="true">{wins(c.id) ? '✓' : c.optional ? '⚔' : '·'}</span>
              <span><strong>{c.place}</strong> · {c.title}</span>
              <span className="op-muted op-small">{wins(c.id) ? `gagné${wins(c.id) > 1 ? ` ${wins(c.id)} fois` : ''}` : 'pas encore relevé'}</span>
            </li>
          ))}
        </ul>
        {missed.length > 0 && <p className="op-small op-muted">Il te reste {missed.length > 1 ? 'des défis' : 'un défi'} à relever : {missed.map((c) => c.opponent.name).join(' et ')}. Tu peux aussi rejouer chaque chapitre.</p>}
        {adv.boosters.length > 0 && <p className="op-small">🎁 {adv.boosters.length} booster{adv.boosters.length > 1 ? 's' : ''} t’attend{adv.boosters.length > 1 ? 'ent' : ''} encore dans ta Cale.</p>}
        <button ref={ok} className="op-btn op-btn-primary btn-big" onClick={onClose}>Continuer</button>
      </div>
    </div>
  );
}
