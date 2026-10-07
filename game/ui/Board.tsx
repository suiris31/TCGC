// Le plateau : pour chaque joueur, ses piles (deck, Défausse), sa Vie, son Leader, son Lieu, ses 5 places de
// Personnage et ses DON!! ; ta main en éventail en bas, la main adverse (cachée) en haut.
import type { DragEvent } from 'react';
import { def } from '../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../engine/types.ts';
import { CardView, type CardLook, type Preview } from './CardView.tsx';
import { cardImage } from './images.ts';

export interface BoardUi {
  looks: Map<number, CardLook>;
  onCard: (uid: number, el: HTMLElement, num: string) => void;
  onHover: (p: Preview | null) => void;
  onTrash: (p: PlayerId) => void;
  onDropDon: (uid: number) => void;
  donDraggable: boolean;
  onDonDrag: (dragging: boolean) => void;
}

function Pile({ label, count, onClick, top }: { label: string; count: number; onClick?: () => void; top?: string }) {
  return (
    <button className={`pile ${onClick ? 'pile-click' : ''} ${count === 0 ? 'pile-empty' : ''}`} onClick={onClick} disabled={!onClick}
      title={onClick ? `${label} : voir les cartes` : label}>
      {top ? <img src={cardImage(def(top))} alt="" /> : <span className="pile-back" />}
      <span className="pile-count">{count}</span>
      <span className="pile-label">{label}</span>
    </button>
  );
}

function DonPool({ s, p, ui, me }: { s: GameState; p: PlayerId; ui: BoardUi; me: boolean }) {
  const P = s.players[p];
  const drag = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', 'don');
    e.dataTransfer.effectAllowed = 'move';
    ui.onDonDrag(true);
  };
  return (
    <div className="don-pool" title={`DON!! : ${P.donActive} redressées (utilisables), ${P.donRested} épuisées, ${P.donDeck} dans le deck DON!!`}>
      <div className="don-cards">
        {Array.from({ length: P.donActive }, (_, i) => (
          <span key={`a${i}`} className={`don-card ${me && ui.donDraggable ? 'don-drag' : ''}`} draggable={me && ui.donDraggable}
            onDragStart={drag} onDragEnd={() => ui.onDonDrag(false)}>DON!!</span>
        ))}
        {Array.from({ length: P.donRested }, (_, i) => <span key={`r${i}`} className="don-card don-rested">DON!!</span>)}
      </div>
      <div className="don-legend">
        <b>{P.donActive}</b> utilisable{P.donActive > 1 ? 's' : ''}
        {P.donRested > 0 && <> · {P.donRested} épuisée{P.donRested > 1 ? 's' : ''}</>}
        <span className="op-muted"> · réserve {P.donDeck}</span>
      </div>
    </div>
  );
}

export function PlayerZone({ s, p, me, ui }: { s: GameState; p: PlayerId; me: boolean; ui: BoardUi }) {
  const P = s.players[p];
  const view = (card: Card, size: 'field' | 'life' = 'field') => (
    <CardView key={card.uid} s={s} card={card} owner={p} size={size} look={ui.looks.get(card.uid)}
      onClick={ui.onCard} onHover={ui.onHover} onDropDon={ui.onDropDon} />
  );
  const slots = Array.from({ length: Math.max(0, 5 - P.chars.length) });
  return (
    <section className={`zone ${me ? 'zone-me' : 'zone-opp'} ${s.active === p && s.winner === null ? 'zone-active' : ''}`} data-zone={p}>
      <div className="zone-row">
        <div className="piles">
          <Pile label="Deck" count={P.deck.length} />
          <Pile label="Défausse" count={P.trash.length} top={P.trash.at(-1)?.num} onClick={P.trash.length ? () => ui.onTrash(p) : undefined} />
        </div>
        <div className="life-col" title="Vie : quand le Leader est touché, la carte du dessus va dans la main. À 0 Vie, le coup suivant fait perdre la partie.">
          <div className="life-stack">
            {P.life.map((c) => (c.faceUp ? view(c, 'life') : <div key={c.uid} className="card card-life card-back" data-uid={c.uid} />))}
            {!P.life.length && <div className="life-empty">0</div>}
          </div>
          <span className="zone-label"><b className={P.life.length <= 2 ? 'danger' : ''}>{P.life.length}</b> Vie{P.life.length > 1 ? 's' : ''}</span>
        </div>
        <div className="leader-col">
          {view(P.leader)}
          <span className="zone-label">Leader</span>
        </div>
        <div className="stage-col">
          {P.stage ? view(P.stage) : <div className="slot slot-stage">Lieu</div>}
        </div>
        <div className="chars">
          {P.chars.map((c) => view(c))}
          {slots.map((_, i) => <div key={i} className="slot">{i === 0 && !P.chars.length ? 'Personnages' : ''}</div>)}
        </div>
        <DonPool s={s} p={p} ui={ui} me={me} />
      </div>
    </section>
  );
}

// Ta main, en éventail (les cartes se chevauchent quand il y en a beaucoup)
export function Hand({ s, p, ui }: { s: GameState; p: PlayerId; ui: BoardUi }) {
  const cards = s.players[p].hand;
  const overlap = cards.length > 7 ? Math.min(60, (cards.length - 7) * 9 + 18) : 0;
  return (
    <div className="hand" style={{ ['--overlap' as string]: `${overlap}px`, ['--n' as string]: cards.length }}>
      {cards.map((c, i) => (
        <div key={c.uid} className="hand-slot" style={{ ['--i' as string]: i - (cards.length - 1) / 2 }}>
          <CardView s={s} card={c} owner={p} size="hand" look={ui.looks.get(c.uid)} onClick={ui.onCard} onHover={ui.onHover} />
        </div>
      ))}
      {!cards.length && <div className="hand-empty">Main vide</div>}
    </div>
  );
}

// Main adverse : le dos des cartes et leur nombre
export function OpponentHand({ s, p }: { s: GameState; p: PlayerId }) {
  const n = s.players[p].hand.length;
  return (
    <div className="opp-hand" title={`${s.players[p].name} a ${n} carte${n > 1 ? 's' : ''} en main`}>
      {s.players[p].hand.map((c) => <div key={c.uid} className="card card-back card-opp-hand" />)}
      <span className="opp-hand-count">{n} en main</span>
    </div>
  );
}
