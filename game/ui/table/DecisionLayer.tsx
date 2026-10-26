// Les fenêtres des décisions, par-dessus le plateau : le menu d'une carte, la main de départ (mulligan), le
// [Déclenchement], le coût à payer, le choix d'une carte hors du plateau, la confirmation de fin de tour, et la
// Défausse ouverte. Elles ne s'ouvrent que quand c'est à toi de choisir.
import { whyNot } from '../decision.ts';
import { ActionMenu } from '../Interaction.tsx';
import { ConfirmEndModal, CostModal, MulliganModal, PickerModal, TrashModal, TriggerModal } from '../Modals.tsx';
import type { BoardInteraction } from './useBoardInteraction.ts';

export function DecisionLayer({ board }: { board: BoardInteraction }) {
  const { state: s, seat, d, view, menu, menuActions, special, recommended } = board;
  if (!s) return null;
  const why = menu && d && !menuActions.length ? whyNot(s, d, menu.uid) : null;
  return (
    <>
      {menu && view && d && (menuActions.length > 0 || why) && (
        <ActionMenu s={s} uid={menu.uid} anchor={menu.rect} actions={menuActions} info={why} recommended={recommended}
          onAction={(a) => board.onAction(menu.uid, a)} onClose={board.closeMenu} sheet={board.compact} details={board.touch || board.compact} />
      )}
      {d && special === 'mulligan' && <MulliganModal s={s} p={seat} onChoose={board.pick} onHover={board.ui.onHover} />}
      {d && special === 'trigger' && <TriggerModal s={s} d={d} onChoose={board.pick} recommended={recommended} />}
      {d && special === 'declareCost' && <CostModal d={d} onChoose={board.pick} recommended={recommended} />}
      {d && view && board.pickerOpen && <PickerModal s={s} d={d} picks={view.picks} buttons={view.buttons} recommended={recommended} onChoose={board.pick} onHover={board.ui.onHover} />}
      {board.confirmEnd && d && (
        <ConfirmEndModal remaining={board.remaining} onConfirm={() => board.pick('end')} onCancel={board.cancelEnd} onNeverAsk={board.neverAskEnd} />
      )}
      {board.trashOf !== null && <TrashModal s={s} p={board.trashOf} onClose={board.closeTrash} onHover={board.ui.onHover} />}
    </>
  );
}
