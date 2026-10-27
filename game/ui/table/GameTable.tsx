// Le plateau, en affichage pur, à partir de l'état vu et de ta place : la main adverse, les deux camps, le centre
// (combat en cours), ta main, la barre d'action et les effets. Avec ui (le contrôleur, useBoardInteraction), les
// cartes brillent et répondent ; sans, le plateau s'affiche en lecture seule (rejeu d'une partie, étape 4).
// Emplacements : l'en-tête (top), un bandeau d'alerte, un bandeau au centre, la barre d'action (bar).
import type { ReactNode } from 'react';
import { other } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { Hand, OpponentHand, PlayerZone, type BoardUi } from '../Board.tsx';
import { FxLayer } from '../Fx.tsx';
import { BattlePanel } from '../Interaction.tsx';

const noop = () => {};
const READ_ONLY: BoardUi = { looks: new Map(), onCard: noop, onHover: noop, onTrash: noop, donDraggable: false };

// epoch : les effets ne comparent pas deux états d'époques différentes (nouvelle partie, retour en arrière)
export function GameTable({ state, seat, ui = READ_ONLY, epoch = 0, top, alert, center, bar }: {
  state: GameState;
  seat: PlayerId;
  ui?: BoardUi;
  epoch?: number;
  top?: ReactNode;
  alert?: ReactNode;
  center?: ReactNode;
  bar?: ReactNode;
}) {
  const opp = other(seat);
  return (
    <main className="table">
      {top}
      {alert}
      <OpponentHand s={state} p={opp} />
      <PlayerZone s={state} p={opp} me={false} ui={ui} />
      <div className="op-center">
        {center}
        <BattlePanel s={state} human={seat} />
      </div>
      <PlayerZone s={state} p={seat} me ui={ui} />
      <Hand s={state} p={seat} ui={ui} />
      {bar}
      <FxLayer game={state} human={seat} epoch={epoch} />
    </main>
  );
}
