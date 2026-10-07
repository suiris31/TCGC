// Fenêtre de détail d'une carte : apparaît quand la souris reste un moment sur une carte. Grand visuel, texte complet
// (mots-clés en couleur), et pour une carte en jeu son état : puissance, coût, DON!! données, bonus et malus en cours.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { def, fieldCost, findField, power } from '../engine/rules.ts';
import type { GameState, Modifier } from '../engine/types.ts';
import type { Preview } from './CardView.tsx';
import { cardImage } from './images.ts';
import { COLOR_LABEL, KEYWORD_LABEL, attributeLabel } from './labels.ts';

export function EffectText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]|<[^>]+>|\{[^}]+\})/g);
  return <>{parts.map((part, i) => (/^\[.+\]$/.test(part) ? <span key={i} className="kw">{part}</span> : /^[<{].+[>}]$/.test(part) ? <span key={i} className="kw-type">{part}</span> : part))}</>;
}

function modText(s: GameState, m: Modifier): string {
  const until = m.until === 'battle' ? 'pour le combat' : m.until === s.turn ? 'jusqu’à la fin du tour' : 'jusqu’à la fin du prochain tour adverse';
  switch (m.stat) {
    case 'power': return `${m.amount > 0 ? '+' : '−'}${Math.abs(m.amount)} de puissance ${until} (${m.source})`;
    case 'cost': return `${m.amount > 0 ? '+' : '−'}${Math.abs(m.amount)} de coût ${until} (${m.source})`;
    case 'basePower': return `puissance de base ${m.amount} ${until} (${m.source})`;
    case 'cantAttack': return `ne peut pas attaquer ${until} (${m.source})`;
    case 'cantRest': return `ne peut pas être épuisé ${until} (${m.source})`;
    case 'blocker': return `[Bloqueur] ${until} (${m.source})`;
    case 'keyword': return `[${KEYWORD_LABEL[m.keyword!]}] ${until} (${m.source})`;
    case 'noAttackLowCost': return `ne peut pas attaquer les Personnages de coût de base 7 ou moins ${until}`;
  }
}

// Contenu de la fiche d'une carte : grand visuel, texte complet et, pour une carte en jeu, son état actuel. Utilisé par
// la fenêtre de détail et par la fiche tactile (menu d'actions sur téléphone).
export function CardDetails({ s, num, uid }: { s?: GameState | null; num: string; uid?: number }) {
  const d = def(num);
  const f = s && uid !== undefined ? findField(s, uid) : null;
  const mods = f && s ? s.mods.filter((m) => m.uid === f.card.uid) : [];
  return (
    <>
      <img src={cardImage(d)} alt={d.name} />
      <div className="zoom-text">
        <strong className="zoom-name">{d.name}</strong>
        <div className="zoom-meta">
          {d.number} · {d.category === 'LEADER' ? 'Leader' : d.category === 'CHARACTER' ? 'Personnage' : d.category === 'EVENT' ? 'Événement' : 'Lieu'}
          {d.colors.length > 0 && ` · ${d.colors.map((c) => COLOR_LABEL[c]).join('/')}`}
        </div>
        <div className="zoom-stats">
          {d.category === 'LEADER' ? <span>Vie <b>{d.life}</b></span> : <span>Coût <b>{d.cost}</b></span>}
          {d.power !== null && <span>Puissance <b>{d.power}</b></span>}
          {d.counter ? <span>Contre <b>+{d.counter}</b></span> : null}
          {d.attributes.length > 0 && <span>&lt;{d.attributes.map(attributeLabel).join('/')}&gt;</span>}
        </div>
        <div className="zoom-types">{d.typeLabels.map((t) => `{${t}}`).join(' ')}</div>
        <p className="zoom-effect">{d.effect && d.effect !== '-' ? <EffectText text={d.effect} /> : <span className="op-muted">Pas d’effet.</span>}</p>
        {d.trigger && <p className="zoom-effect"><span className="kw">[Déclenchement]</span> <EffectText text={d.trigger} /></p>}
        {d.lang === 'en' && <p className="op-small op-muted">Texte anglais : cette carte n’existe pas en VF.</p>}
        {f && s && (
          <div className="zoom-state">
            <div className="zoom-state-title">En ce moment</div>
            {!f.stage && <div>Puissance <b>{power(s, f.card.uid)}</b>{power(s, f.card.uid) !== (d.power ?? 0) && <span className="op-muted"> (de base {d.power ?? 0})</span>}</div>}
            {!f.leader && !f.stage && fieldCost(s, f.card.uid) !== d.cost && <div>Coût <b>{Math.max(0, fieldCost(s, f.card.uid))}</b></div>}
            {f.card.don > 0 && <div>{f.card.don} DON!! donnée{f.card.don > 1 ? 's' : ''} (+{f.card.don * 1000} pendant le tour de son propriétaire)</div>}
            {f.card.rested && <div>Épuisée</div>}
            {mods.map((m, i) => <div key={i} className="zoom-mod">{modText(s, m)}</div>)}
          </div>
        )}
      </div>
    </>
  );
}

// Fenêtre de détail : à côté de la carte survolée (souris), ou épinglée après avoir touché une carte (écran tactile),
// jusqu'au toucher suivant
export function CardZoom({ s, preview, onClose }: { s?: GameState | null; preview: Preview & { rect?: DOMRect }; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const r = preview.rect;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r ? r.right + 14 : (window.innerWidth - w) / 2;
    if (r && left + w > window.innerWidth - 8) left = r.left - w - 14;
    if (left < 8) left = Math.max(8, (window.innerWidth - w) / 2);
    let top = r ? r.top + r.height / 2 - h / 2 : (window.innerHeight - h) / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    setPos({ left, top });
  }, [preview]);
  const box = (
    <div ref={ref} className={preview.pinned ? 'card-zoom zoom-pinned' : 'card-zoom'} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      <CardDetails s={s} num={preview.num} uid={preview.uid} />
    </div>
  );
  if (!preview.pinned) return box;
  return (
    <div className="zoom-backdrop" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
      {box}
      <span className="zoom-close">Touche pour fermer</span>
    </div>
  );
}

// Survol avec délai : la fenêtre de détail s'ouvre si la souris reste sur la même carte. Une carte touchée sur un
// écran tactile (pinned) s'ouvre tout de suite et reste ouverte jusqu'au toucher suivant.
export function useCardZoom(delay: number) {
  const [zoom, setZoom] = useState<(Preview & { rect?: DOMRect }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onHover = useCallback((p: (Preview & { rect?: DOMRect }) | null) => {
    clearTimeout(timer.current);
    if (p?.pinned) return setZoom(p);
    setZoom((z) => (z?.pinned ? z : null));
    if (p && delay > 0) timer.current = setTimeout(() => setZoom(p), delay);
  }, [delay]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { zoom, onHover, close: () => { clearTimeout(timer.current); setZoom(null); } };
}
