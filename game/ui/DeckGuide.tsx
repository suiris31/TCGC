// Guide d'un deck : style, plan de jeu, combinaisons clés (avec les cartes), main de départ, forces et faiblesses,
// liste complète des cartes et statistiques
import type { ReactNode } from 'react';
import { DECKS } from '../engine/decks.ts';
import { def } from '../engine/rules.ts';
import type { Preview } from './CardView.tsx';
import { GUIDES } from './deckGuides.ts';
import { cardImage } from './images.ts';
import { isTouch } from './device.ts';

const COLOR: Record<string, string> = { Rouge: '#d9443a', Vert: '#2f9e5b', Bleu: '#2f6fd1', Violet: '#8a4fc9', Jaune: '#e2b623', Noir: '#55556a' };

export function CardThumb({ num, count, size = 'thumb', onHover }: { num: string; count?: number; size?: 'thumb' | 'mini'; onHover: (p: (Preview & { rect?: DOMRect }) | null) => void }) {
  const d = def(num);
  return (
    <div className={`thumb thumb-${size}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ num, rect: e.currentTarget.getBoundingClientRect() }); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover(null); }}
      onClick={(e) => { if (isTouch()) onHover({ num, rect: e.currentTarget.getBoundingClientRect(), pinned: true }); }}>
      <img src={cardImage(d.imageId)} alt={d.name} draggable={false} />
      {count !== undefined && <span className="thumb-count">×{count}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="guide-section"><h3>{title}</h3>{children}</section>;
}

export function DeckGuideModal({ deckId, onClose, onHover, alt, altLabel, onSwitch }: {
  deckId: string;
  onClose: () => void;
  onHover: (p: (Preview & { rect?: DOMRect }) | null) => void;
  alt?: string;
  altLabel?: string;
  onSwitch?: (id: string) => void;
}) {
  const deck = DECKS[deckId];
  const guide = GUIDES[deckId];
  const leader = def(deck.leader);
  const cards = Object.entries(deck.cards).map(([num, n]) => ({ num, n, d: def(num) }));
  const chars = cards.filter((c) => c.d.category === 'CHARACTER').sort((a, b) => (a.d.cost ?? 0) - (b.d.cost ?? 0) || a.d.name.localeCompare(b.d.name));
  const events = cards.filter((c) => c.d.category === 'EVENT').sort((a, b) => (a.d.cost ?? 0) - (b.d.cost ?? 0));
  const stages = cards.filter((c) => c.d.category === 'STAGE');
  // statistiques
  const curve = Array.from({ length: 11 }, (_, cost) => cards.filter((c) => (c.d.cost ?? 0) === cost).reduce((s, c) => s + c.n, 0));
  const maxCurve = Math.max(...curve, 1);
  const sum = (pred: (c: (typeof cards)[number]) => boolean) => cards.filter(pred).reduce((s, c) => s + c.n, 0);
  const stats = [
    { label: 'Personnages', value: sum((c) => c.d.category === 'CHARACTER') },
    { label: 'Événements', value: sum((c) => c.d.category === 'EVENT') },
    { label: 'Contre +1000', value: sum((c) => c.d.counter === 1000) },
    { label: 'Contre +2000', value: sum((c) => c.d.counter === 2000) },
    { label: 'Événements [Contre]', value: sum((c) => Boolean(c.d.onCounter)) },
    { label: '[Bloqueur]', value: sum((c) => /\[Bloqueur\]/.test(c.d.effect)) },
    { label: '[Déclenchement]', value: sum((c) => Boolean(c.d.trigger)) },
  ];
  const colors = leader.colors.map((c) => COLOR[c] ?? '#666');
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box modal-guide" onClick={(e) => e.stopPropagation()} style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] }}>
        <header className="guide-head">
          <CardThumb num={deck.leader} onHover={onHover} />
          <div className="guide-title">
            <h2>{deck.name} <span className="op-muted">· {deck.id}</span></h2>
            <div className="guide-styles">{guide.styles.map((s) => <span key={s} className="style-chip">{s}</span>)}</div>
            <p>{guide.summary}</p>
            <p className="op-small op-muted"><b>Leader {leader.name}</b> ({leader.life} Vies, {leader.power}) : {leader.effect}</p>
          </div>
          <div className="guide-actions">
            {alt && onSwitch && alt !== deckId && <button className="op-btn op-btn-ghost btn-small" onClick={() => onSwitch(alt)}>{altLabel}</button>}
            <button className="icon-btn" onClick={onClose} title="Fermer (Échap)">✕</button>
          </div>
        </header>
        <div className="guide-body">
          <div className="guide-col">
            <Section title="Plan de jeu">
              <ol className="guide-plan">{guide.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </Section>
            <Section title="Combinaisons clés">
              {guide.combos.map((c) => (
                <div key={c.title} className="combo">
                  <div className="combo-cards">{c.cards.map((num) => <CardThumb key={num} num={num} size="mini" onHover={onHover} />)}</div>
                  <div className="combo-text"><strong>{c.title}</strong><p>{c.text}</p></div>
                </div>
              ))}
            </Section>
            <Section title="Main de départ"><p>{guide.mulligan}</p></Section>
            <div className="guide-pros">
              <Section title="Points forts"><ul>{guide.strengths.map((s) => <li key={s}>{s}</li>)}</ul></Section>
              <Section title="Points faibles"><ul>{guide.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul></Section>
            </div>
            {guide.aiLesson && <Section title="Ce que l’IA a appris en s’entraînant"><p>{guide.aiLesson}</p></Section>}
          </div>
          <div className="guide-col">
            <Section title={`Les 50 cartes (${isTouch() ? 'touche' : 'survole'} une carte pour la lire)`}>
              <div className="guide-group-title">Personnages</div>
              <div className="thumb-grid">{chars.map((c) => <CardThumb key={c.num} num={c.num} count={c.n} onHover={onHover} />)}</div>
              {events.length > 0 && <div className="guide-group-title">Événements</div>}
              <div className="thumb-grid">{events.map((c) => <CardThumb key={c.num} num={c.num} count={c.n} onHover={onHover} />)}</div>
              {stages.length > 0 && <div className="guide-group-title">Lieu</div>}
              <div className="thumb-grid">{stages.map((c) => <CardThumb key={c.num} num={c.num} count={c.n} onHover={onHover} />)}</div>
            </Section>
            <Section title="Courbe des coûts">
              <div className="curve-bars">
                {curve.map((n, cost) => (
                  <div key={cost} className="curve-bar" title={`${n} carte${n > 1 ? 's' : ''} de coût ${cost}`}>
                    <span className="curve-n">{n || ''}</span>
                    <span className="curve-fill" style={{ height: `${(n / maxCurve) * 100}%` }} />
                    <span className="curve-cost">{cost}</span>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="En chiffres">
              <div className="guide-stats">{stats.map((s) => <div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}</div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
