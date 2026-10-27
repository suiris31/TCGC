import type { MouseEvent, PointerEvent } from 'react';
import { def, fieldCost, findField, handCost, hasBlocker, hasKeyword, hasMod, power } from '../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { HIDDEN } from '../engine/cards/index.ts';
import { justPlayed } from './decision.ts';
import { isTouch } from './device.ts';
import { cardImage } from './images.ts';
import { Icon, type IconName } from './kit/index.ts';
import type { GestureSource } from './table/gestures.ts';

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
  grab?: boolean;         // se saisit pour un glisser-déposer (jouer, attaquer)
  selected?: boolean;     // carte dont le menu est ouvert ou qui attaque
  badge?: string;         // pastille (valeur de Contre...)
}

// États d'une carte du terrain, montrés en pastilles (icônes du kit) le long de son bord gauche. Ton : ce que la carte
// sait faire en plus (« atout »), ce qui lui est interdit (« entrave »), ou un état passager (« info »).
export interface CardState {
  icon: IconName;
  label: string;
  tone: 'atout' | 'entrave' | 'info';
}

// Pastilles montrées : 5 au plus, 2 sur une carte de moins de 52 px (téléphone ; choisi par card.css selon la largeur
// de la carte). Au-delà, la dernière devient « +N » (le détail de la carte les donne toutes).
const MAX_STATES = 5;
const MAX_STATES_SMALL = 2;
const shownStates = (n: number, max: number) => (n > max ? max - 1 : n);

export function cardStates(s: GameState, uid: number): CardState[] {
  const f = findField(s, uid);
  if (!f || f.stage) return [];
  const out: CardState[] = [];
  const add = (icon: IconName, label: string, tone: CardState['tone']) => out.push({ icon, label, tone });
  if (!f.leader) {
    if (justPlayed(s, f.player, uid)) add('asleep', 'Joué ce tour : ne peut pas encore attaquer', 'info');
    if (hasBlocker(s, f.player, f.card)) add('blocker', '[Bloqueur] : peut se mettre en travers d’une attaque adverse', 'atout');
    if (hasMod(s, uid, 'cantAttack')) add('no-attack', 'Ne peut pas attaquer', 'entrave');
    if (hasMod(s, uid, 'cantRest')) add('no-rest', 'Ne peut pas être épuisé (ni attaquer ni bloquer)', 'entrave');
    if (hasMod(s, uid, 'negated')) add('negated', 'Effets annulés pour le tour', 'entrave');
    if (hasMod(s, uid, 'noBlocker')) add('no-block', 'Ne peut pas activer [Bloqueur] pour le tour', 'entrave');
    if (f.card.rested && hasMod(s, uid, 'noRefresh')) add('frozen', 'Ne sera pas redressé lors de la prochaine phase de Recharge de son propriétaire', 'entrave');
    if (hasMod(s, uid, 'cantBeKO')) add('no-ko', 'Ne peut pas être mis KO (voir le détail de la carte)', 'atout');
  }
  if (hasKeyword(s, f.player, f.card, 'Double Attack')) add('double-attack', '[Double attaque] : inflige 2 dégâts au Leader adverse', 'atout');
  if (hasKeyword(s, f.player, f.card, 'Banish')) add('exile', '[Exil] : les cartes de Vie touchées vont dans la Défausse, sans [Déclenchement]', 'atout');
  if (hasKeyword(s, f.player, f.card, 'Unblockable')) add('unblockable', '[Imblocable] : ne peut pas être bloqué', 'atout');
  if (f.leader && hasMod(s, uid, 'noAttackLowCost')) add('no-attack', 'Ne peut plus attaquer les Personnages de coût de base 7 ou moins ce tour', 'entrave');
  return out;
}

// Légende des pastilles (aide du plateau)
export const STATE_LEGEND: { icon: IconName; text: string; tone: CardState['tone'] }[] = [
  { icon: 'asleep', text: 'vient d’être joué', tone: 'info' },
  { icon: 'blocker', text: '[Bloqueur]', tone: 'atout' },
  { icon: 'no-attack', text: 'ne peut pas attaquer', tone: 'entrave' },
  { icon: 'double-attack', text: '[Double attaque]', tone: 'atout' },
  { icon: 'unblockable', text: '[Imblocable]', tone: 'atout' },
];

// Une valeur plus haute ou plus basse que celle imprimée : la couleur (classe), et une flèche pour qui ne voit pas
// la couleur (le libellé de la pastille le dit aussi)
const trend = (now: number, base: number | null) => (now > (base ?? 0) ? 'up' : now < (base ?? 0) ? 'down' : '');
const trendText = (now: number, base: number | null) => (now > (base ?? 0) ? ` (augmenté de ${now - (base ?? 0)})` : now < (base ?? 0) ? ` (diminué de ${(base ?? 0) - now})` : '');

function Arrow({ now, base }: { now: number; base: number | null }) {
  if (now === (base ?? 0)) return null;
  return <Icon name={now > (base ?? 0) ? 'power-up' : 'power-down'} className="op-card-arrow" size="0.8em" />;
}

// Une carte : visuel officiel, puissance et coût actuels (en couleur s'ils sont modifiés), DON!! données, état
export function CardView({ s, card, owner, size = 'field', hidden = false, look = {}, onClick, onHover, onGrab }: {
  s: GameState;
  card: Card;
  owner?: PlayerId;
  size?: 'field' | 'hand' | 'small' | 'life' | 'pick' | 'big';
  hidden?: boolean;
  look?: CardLook;
  onClick?: (uid: number, el: HTMLElement, num: string) => void;
  onHover?: (p: Preview | null) => void;
  onGrab?: (source: GestureSource, e: PointerEvent<HTMLElement>) => void;
}) {
  if (hidden || card.num === HIDDEN) return <div className={`card card-${size} card-back`} data-ui="table.card" data-uid={card.uid} />;
  const d = def(card.num);
  const f = findField(s, card.uid);
  const rested = f?.card.rested ?? false;
  const p = f && !f.stage ? power(s, card.uid) : null;
  const cost = f && !f.leader && !f.stage ? Math.max(0, fieldCost(s, card.uid)) : null;
  const inHand = owner !== undefined && s.players[owner].hand.some((c) => c.uid === card.uid);
  const playCost = inHand && d.category !== 'LEADER' ? handCost(s, owner!, card) : null;
  const states = size === 'life' ? [] : cardStates(s, card.uid);
  // La pastille du coût modifié occupe le haut de la carte : les pastilles d'état commencent plus bas
  const topBusy = cost !== null && cost !== d.cost;
  const classes = [
    'card', `card-${size}`,
    rested && 'card-rested',
    look.actionable && 'is-actionable',
    look.recommended && 'is-recommended',
    look.target && 'is-target',
    look.choose && 'is-choose',
    look.dim && 'is-dim',
    look.drop && 'is-drop',
    look.selected && 'is-selected',
    look.grab && 'is-grab',
    onClick && 'is-clickable',
  ].filter(Boolean).join(' ');
  // Sur un écran tactile, une carte sans action s'ouvre en grand quand on la touche (pas de survol possible)
  const click = onClick
    ? (e: MouseEvent<HTMLDivElement>) => { e.stopPropagation(); onClick(card.uid, e.currentTarget, card.num); }
    : onHover && isTouch()
      ? (e: MouseEvent<HTMLDivElement>) => { e.stopPropagation(); onHover({ num: card.num, uid: card.uid, rect: e.currentTarget.getBoundingClientRect(), pinned: true }); }
      : undefined;
  // Glisser-déposer : une carte de ta main (jouer) ou un attaquant (attaquer)
  const grab = look.grab && onGrab ? (e: PointerEvent<HTMLElement>) => onGrab(inHand ? { from: 'hand', uid: card.uid } : { from: 'field', uid: card.uid }, e) : undefined;
  return (
    <div className={classes} data-ui="table.card" data-uid={card.uid} onClick={click} onPointerDown={grab}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover?.({ num: card.num, uid: card.uid, rect: e.currentTarget.getBoundingClientRect() }); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHover?.(null); }}>
      <img src={cardImage(d)} alt={d.name} draggable={false} />
      {p !== null && size !== 'life' && (
        <span className={`badge badge-power ${trend(p, d.power)}`} title={`Puissance actuelle${trendText(p, d.power)}`}><Arrow now={p} base={d.power} />{p}</span>
      )}
      {cost !== null && cost !== d.cost && size !== 'life' && (
        <span className={`badge badge-cost ${cost > (d.cost ?? 0) ? 'up' : 'down'}`} title={`Coût actuel${trendText(cost, d.cost)}`}>{cost}<Arrow now={cost} base={d.cost} /></span>
      )}
      {playCost !== null && size === 'hand' && (
        <span className={`badge badge-cost ${playCost < (d.cost ?? 0) ? 'cheaper' : ''} ${look.dim ? 'too-expensive' : ''}`} title={`Coût à payer pour la jouer${trendText(playCost, d.cost)}`}>{playCost}<Arrow now={playCost} base={d.cost} /></span>
      )}
      {f && f.card.don > 0 && (
        <span className="don-chips" title={`${f.card.don} DON!! donnée${f.card.don > 1 ? 's' : ''} : +${f.card.don * 1000} pendant le tour de son propriétaire`}>
          {Array.from({ length: Math.min(f.card.don, 5) }, (_, i) => <i key={i} />)}
          {f.card.don > 5 && <b>+{f.card.don - 5}</b>}
        </span>
      )}
      {states.length > 0 && (
        <span className={topBusy ? 'op-card-states is-low' : 'op-card-states'}>
          {states.slice(0, shownStates(states.length, MAX_STATES)).map((x, i) => (
            <span key={x.label} className={`op-card-state is-${x.tone}${i >= shownStates(states.length, MAX_STATES_SMALL) ? ' is-extra' : ''}`}>
              <Icon name={x.icon} label={x.label} size="78%" />
            </span>
          ))}
          {[MAX_STATES_SMALL, MAX_STATES].filter((max) => states.length > max).map((max) => (
            <span key={max} className={`op-card-state op-card-state-more ${max === MAX_STATES ? 'is-more' : 'is-more-small'}`}
              title={states.slice(max - 1).map((x) => x.label).join(' · ')}>+{states.length - max + 1}</span>
          ))}
        </span>
      )}
      {look.badge && <span className="badge badge-counter">{look.badge}</span>}
      {look.recommended && <span className="badge badge-star" title="Le coach conseille cette carte">★</span>}
    </div>
  );
}
