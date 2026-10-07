import type { DragEvent, MouseEvent } from 'react';
import { def, fieldCost, findField, handCost, hasBlocker, hasKeyword, hasMod, power } from '../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { justPlayed } from './decision.ts';
import { isTouch } from './device.ts';
import { cardImage } from './images.ts';

export interface Preview {
  num: string;
  uid?: number;
  rect?: DOMRect;   // position de la carte survolée (fenêtre de détail)
  pinned?: boolean; // carte touchée sur un écran tactile : la fenêtre de détail reste ouverte
}

export interface CardLook {
  actionable?: boolean;   // a des actions (brille en doré)
  target?: boolean;       // cible d'attaque possible (rouge)
  choose?: boolean;       // carte à choisir pour un effet (bleu)
  recommended?: boolean;  // conseil du coach (étoile)
  dim?: boolean;          // pas jouable maintenant
  drop?: boolean;         // on peut y déposer une DON!!
  selected?: boolean;     // carte dont le menu est ouvert ou qui attaque
  badge?: string;         // pastille (valeur de Contre...)
}

// Une carte : visuel officiel, puissance et coût actuels (en couleur s'ils sont modifiés), DON!! données, état
export function CardView({ s, card, owner, size = 'field', hidden = false, look = {}, onClick, onHover, onDropDon }: {
  s: GameState;
  card: Card;
  owner?: PlayerId;
  size?: 'field' | 'hand' | 'small' | 'life' | 'pick' | 'big';
  hidden?: boolean;
  look?: CardLook;
  onClick?: (uid: number, el: HTMLElement, num: string) => void;
  onHover?: (p: Preview | null) => void;
  onDropDon?: (uid: number) => void;
}) {
  if (hidden || card.num === HIDDEN) return <div className={`card card-${size} card-back`} data-uid={card.uid} />;
  const d = def(card.num);
  const f = findField(s, card.uid);
  const rested = f?.card.rested ?? false;
  const p = f && !f.stage ? power(s, card.uid) : null;
  const cost = f && !f.leader && !f.stage ? Math.max(0, fieldCost(s, card.uid)) : null;
  const inHand = owner !== undefined && s.players[owner].hand.some((c) => c.uid === card.uid);
  const playCost = inHand && d.category !== 'LEADER' ? handCost(s, owner!, card) : null;
  const icons: { icon: string; title: string }[] = [];
  if (f && !f.leader && !f.stage) {
    if (justPlayed(s, f.player, card.uid)) icons.push({ icon: '💤', title: 'Joué ce tour : ne peut pas encore attaquer' });
    if (hasBlocker(s, f.player, f.card)) icons.push({ icon: '🛡', title: '[Bloqueur] : peut se mettre en travers d’une attaque adverse' });
    if (hasMod(s, card.uid, 'cantAttack')) icons.push({ icon: '🔒', title: 'Ne peut pas attaquer' });
    if (hasMod(s, card.uid, 'cantRest')) icons.push({ icon: '⛓', title: 'Ne peut pas être épuisé (ni attaquer ni bloquer)' });
  }
  if (f && !f.stage) {
    if (hasKeyword(s, f.player, f.card, 'Double Attack')) icons.push({ icon: '⚔', title: '[Double attaque] : inflige 2 dégâts au Leader adverse' });
    if (hasKeyword(s, f.player, f.card, 'Banish')) icons.push({ icon: '🗑', title: '[Exil] : les cartes de Vie touchées vont dans la Défausse, sans [Déclenchement]' });
    if (hasKeyword(s, f.player, f.card, 'Unblockable')) icons.push({ icon: '👻', title: '[Imblocable] : ne peut pas être bloqué' });
  }
  if (f?.leader && hasMod(s, card.uid, 'noAttackLowCost')) icons.push({ icon: '🔒', title: 'Ne peut plus attaquer les Personnages de coût de base 7 ou moins ce tour' });
  const classes = [
    'card', `card-${size}`,
    rested && 'card-rested',
    look.actionable && 'is-actionable',
    look.target && 'is-target',
    look.choose && 'is-choose',
    look.dim && 'is-dim',
    look.drop && 'is-drop',
    look.selected && 'is-selected',
    onClick && 'is-clickable',
  ].filter(Boolean).join(' ');
  // Sur un écran tactile, une carte sans action s'ouvre en grand quand on la touche (pas de survol possible)
  const click = onClick
    ? (e: MouseEvent<HTMLDivElement>) => { e.stopPropagation(); onClick(card.uid, e.currentTarget, card.num); }
    : onHover && isTouch()
      ? (e: MouseEvent<HTMLDivElement>) => { e.stopPropagation(); onHover({ num: card.num, uid: card.uid, rect: e.currentTarget.getBoundingClientRect(), pinned: true }); }
      : undefined;
  const dragOver = look.drop && onDropDon ? (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined;
  const drop = look.drop && onDropDon ? (e: DragEvent) => { e.preventDefault(); onDropDon(card.uid); } : undefined;
  return (
    <div className={classes} data-uid={card.uid} onClick={click} onDragOver={dragOver} onDrop={drop}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover?.({ num: card.num, uid: card.uid, rect: e.currentTarget.getBoundingClientRect() }); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover?.(null); }}>
      <img src={cardImage(d)} alt={d.name} draggable={false} />
      {p !== null && size !== 'life' && (
        <span className={`badge badge-power ${p > (d.power ?? 0) ? 'up' : p < (d.power ?? 0) ? 'down' : ''}`} title="Puissance actuelle">{p}</span>
      )}
      {cost !== null && cost !== d.cost && size !== 'life' && <span className={`badge badge-cost ${cost > (d.cost ?? 0) ? 'up' : 'down'}`} title="Coût actuel">{cost}</span>}
      {playCost !== null && size === 'hand' && (
        <span className={`badge badge-cost ${playCost < (d.cost ?? 0) ? 'cheaper' : ''} ${look.dim ? 'too-expensive' : ''}`} title="Coût à payer pour la jouer">{playCost}</span>
      )}
      {f && f.card.don > 0 && (
        <span className="don-chips" title={`${f.card.don} DON!! donnée${f.card.don > 1 ? 's' : ''} : +${f.card.don * 1000} pendant le tour de son propriétaire`}>
          {Array.from({ length: Math.min(f.card.don, 5) }, (_, i) => <i key={i} />)}
          {f.card.don > 5 && <b>+{f.card.don - 5}</b>}
        </span>
      )}
      {icons.length > 0 && size !== 'life' && (
        <span className="status-icons">{icons.map((x) => <span key={x.icon} title={x.title}>{x.icon}</span>)}</span>
      )}
      {look.badge && <span className="badge badge-counter">{look.badge}</span>}
      {look.recommended && <span className="badge badge-star" title="Le coach conseille cette carte">★</span>}
    </div>
  );
}
