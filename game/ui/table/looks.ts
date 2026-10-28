// Ce que montre chaque carte du plateau selon la décision en cours (fonctions pures, sans React ni DOM, testées par
// game/tests/table.test.ts) : utilisé par le contrôleur du plateau (useBoardInteraction)
import { counterValue } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import type { CardLook } from '../CardView.tsx';
import type { DecisionView } from '../decision.ts';

// La carte dont une action est conseillée par le coach
export function recommendedCard(view: DecisionView | null, recommended: string | null): number | null {
  if (!recommended || !view) return null;
  if (recommended.startsWith('attack:')) return Number(recommended.split(':')[1]);
  for (const [uid, actions] of view.byCard) if (actions.some((a) => a.option.id === recommended)) return uid;
  return null;
}

export interface LooksInput {
  state: GameState;
  seat: PlayerId;
  view: DecisionView | null;                 // décision lue (seulement quand c'est à toi de choisir)
  targeting: { attacker: number } | null;    // attaque choisie, cible pas encore
  aimed: number | null;                      // cible touchée (écran tactile) : résultat prévu, attaque pas partie
  menu: number | null;                       // carte dont le menu est ouvert
  dragging: boolean;                         // une DON!! est glissée
  recommended: string | null;
}

// Ce que chaque carte montre : brille (actions), cible d'attaque (rouge), carte à choisir pour un effet (bleu), conseil
// du coach (★), grisée (pas jouable), pastille de Contre
export function boardLooks({ state, seat, view, targeting, aimed, menu, dragging, recommended }: LooksInput): Map<number, CardLook> {
  const looks = new Map<number, CardLook>();
  if (!view) return looks;
  if (targeting) {
    looks.set(targeting.attacker, { selected: true });
    for (const o of view.attacks.get(targeting.attacker) ?? []) {
      looks.set(o.target!, { target: true, recommended: recommended === o.id, selected: aimed === o.target });
    }
    return looks;
  }
  const best = recommendedCard(view, recommended);
  const hand = state.players[seat].hand;
  for (const [uid, actions] of view.byCard) {
    const useful = actions.some((a) => !a.useless);
    const choosing = actions.every((a) => a.kind === 'choose');
    const counter = actions.find((a) => a.kind === 'counter' || a.kind === 'cevent');
    const num = hand.find((c) => c.uid === uid)?.num;
    looks.set(uid, {
      actionable: useful && !choosing,
      choose: choosing,
      recommended: best === uid,
      selected: menu === uid,
      drop: dragging && actions.some((a) => a.kind === 'don'),
      badge: counter && num ? (counter.kind === 'counter' ? `+${counterValue(state, seat, num)}` : 'Contre') : undefined,
    });
  }
  if (state.decision?.kind === 'main') {
    for (const c of hand) if (!view.byCard.has(c.uid)) looks.set(c.uid, { dim: true });
  }
  return looks;
}

// Reste-t-il une action utile (sinon la barre d'action propose de finir le tour)
export function hasUsefulAction(view: DecisionView | null): boolean {
  return Boolean(view && [...view.byCard.values()].some((acts) => acts.some((a) => !a.useless)));
}

// Les looks du rendu précédent gardés quand ils n'ont pas changé : une carte dont le look est le même reçoit le même
// objet, et sa vue (memo) n'est pas redessinée
export function keepLooks(prev: Map<number, CardLook>, next: Map<number, CardLook>): Map<number, CardLook> {
  const same = (a: CardLook, b: CardLook) => {
    const ka = Object.keys(a) as (keyof CardLook)[];
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
  };
  for (const [uid, look] of next) {
    const old = prev.get(uid);
    if (old && old !== look && same(old, look)) next.set(uid, old);
  }
  return next;
}
