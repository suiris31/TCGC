// Le plateau, en affichage pur, à partir de l'état vu et de ta place : la main adverse, les deux camps, le centre
// (combat en cours), ta main, la barre d'action et les effets. Avec ui (le contrôleur, useBoardInteraction), les
// cartes brillent et répondent ; sans, le plateau s'affiche en lecture seule (rejeu d'une partie, étape 4).
// Emplacements : l'en-tête (top), un bandeau d'alerte, un bandeau au centre, la barre d'action (bar).
// Sur ordinateur (op-wide), les camps sont en miroir : les Personnages côté centre, et chaque main dans la rangée
// du fond de son camp ; la bande centrale montre le combat, la prévision d'attaque et le dernier coup de l'adversaire.
import { useMemo, type ReactNode } from 'react';
import { playerNames, sayLog } from '../../coach/logText.ts';
import { other } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { Hand, OpponentHand, PlayerZone, type BoardUi } from '../Board.tsx';
import { useDevice } from '../device.ts';
import { FxLayer } from '../Fx.tsx';
import { BattlePanel } from '../Interaction.tsx';
import { lastMove } from './center.ts';

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
  const wide = !useDevice().compact;
  const last = wide && !state.battle && state.winner === null ? lastMove(state, seat) : null;
  const move = last === null ? null : sayLog({ player: opp, text: last }, seat, playerNames(state));
  // les mains, mémorisées : passées aux zones (memo), elles ne les font pas redessiner à chaque rendu de l'écran
  const oppHand = useMemo(() => <OpponentHand s={state} p={opp} />, [state, opp]);
  const myHand = useMemo(() => <Hand s={state} p={seat} ui={ui} />, [state, seat, ui]);
  return (
    <main className={wide ? 'table op-wide' : 'table'}>
      {top}
      {alert}
      {!wide && oppHand}
      <PlayerZone s={state} p={opp} me={false} ui={ui} hand={wide && oppHand} />
      <div className="op-center">
        {center}
        <BattlePanel s={state} human={seat} />
        {move && (
          <div className="op-last-move" data-ui="table.last-move">
            <b>{move.who}</b> {move.text}
          </div>
        )}
      </div>
      <PlayerZone s={state} p={seat} me ui={ui} hand={wide && myHand} />
      {!wide && myHand}
      {bar}
      <FxLayer game={state} human={seat} epoch={epoch} />
    </main>
  );
}
