// Atelier : lisibilité des cartes (tâche R2.5). Les mêmes cartes du plateau chargé (plateau/etats.ts), avec des états
// cumulés (pastilles d'état, DON!!, puissance et coût modifiés, lueurs), à plusieurs largeurs : 36 px (téléphone en
// paysage), 44 px (téléphone en portrait), 52 px (plus petite carte sur ordinateur) et 80 px.
import type { CSSProperties } from 'react';
import type { GameState, Modifier } from '../../engine/types.ts';
import { CardView, type CardLook } from '../CardView.tsx';
import { boardState } from './plateau/etats.ts';

export const title = 'Cartes : états cumulés';

const WIDTHS = [36, 44, 52, 80];

const mod = (uid: number, stat: Modifier['stat'], extra: Partial<Modifier> = {}): Modifier =>
  ({ uid, stat, amount: 0, until: 'turn', source: 'atelier', ...extra });

// Les Personnages du joueur dans le plateau chargé, enrichis d'états
function build(): { s: GameState; field: { uid: number; look: CardLook; note: string }[]; hand: { uid: number; look: CardLook }[] } {
  const s = boardState('charge').state;
  const me = s.players[0];
  const [a, b, c, d, e] = me.chars;
  // a : 5 états (vient d'être jouée, ne peut pas attaquer, effets annulés, Double attaque, Imblocable), 2 DON!!, +2000
  a.playedTurn = s.turn;
  s.mods.push(mod(a.uid, 'cantAttack'), mod(a.uid, 'negated'), mod(a.uid, 'keyword', { keyword: 'Double Attack' }), mod(a.uid, 'keyword', { keyword: 'Unblockable' }));
  // b : épuisée, 5 DON!!, puissance baissée, coût augmenté, 3 états
  b.rested = true;
  b.don = 5;
  s.mods.push(mod(b.uid, 'power', { amount: -3000 }), mod(b.uid, 'cost', { amount: 2 }), mod(b.uid, 'noRefresh'), mod(b.uid, 'cantBeKO', { scope: 'battle' }), mod(b.uid, 'blocker'));
  // c : 7 états (la dernière pastille devient « +3 »)
  s.mods.push(mod(c.uid, 'cantAttack'), mod(c.uid, 'cantRest'), mod(c.uid, 'noBlocker'), mod(c.uid, 'cantBeKO'),
    mod(c.uid, 'keyword', { keyword: 'Double Attack' }), mod(c.uid, 'keyword', { keyword: 'Banish' }), mod(c.uid, 'keyword', { keyword: 'Unblockable' }));
  // d : Bloqueur, +1000 (plateau chargé) ; e : épuisée, 1 DON!!
  s.mods.push(mod(d.uid, 'blocker'));
  return {
    s,
    field: [
      { uid: a.uid, look: { actionable: true, recommended: true }, note: 'conseillée, 5 états, 2 DON!!, +2000' },
      { uid: b.uid, look: { actionable: true }, note: 'jouable, épuisée, 5 DON!!, coût modifié' },
      { uid: c.uid, look: { target: true }, note: 'cible, 7 états' },
      { uid: d.uid, look: { target: true, recommended: true }, note: 'cible conseillée' },
      { uid: e.uid, look: { choose: true }, note: 'à choisir' },
      { uid: me.leader.uid, look: { actionable: true }, note: 'Leader jouable' },
    ],
    hand: me.hand.slice(0, 4).map((h, i) => ({ uid: h.uid, look: [{ actionable: true, badge: '+2000' }, { dim: true }, { actionable: true, recommended: true }, { choose: true }][i] })),
  };
}

export function render() {
  const { s, field, hand } = build();
  const me = s.players[0];
  const card = (uid: number) => [me.leader, ...me.chars, ...me.hand].find((x) => x.uid === uid)!;
  return (
    <div className="op-atelier-demo">
      <p className="op-muted op-small">
        Une seule lueur pulse : la carte conseillée par le coach. Les autres repères sont fixes. Survole une pastille pour
        lire son état.
      </p>
      {WIDTHS.map((w) => (
        <section key={w} style={{ '--cw': `${w}px`, '--ch': `${w * 1.396}px`, '--hw': `${w}px` } as CSSProperties}>
          <h2>Cartes de {w} px</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.6rem 1.2rem', alignItems: 'center', padding: '0.8rem 0.6rem' }}>
            {field.map((x) => (
              <figure key={x.uid} style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: '0.5rem' }} title={x.note}>
                <CardView s={s} card={card(x.uid)} owner={0} look={x.look} />
              </figure>
            ))}
            {hand.map((x) => <CardView key={x.uid} s={s} card={card(x.uid)} owner={0} size="hand" look={x.look} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
