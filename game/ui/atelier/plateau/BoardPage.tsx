// Une page « plateau » de l'atelier : le vrai plateau de la partie contre l'IA (App), sur un état fixé
// (plateau/etats.ts), en plein écran. « Menu » revient à la liste des pages de l'atelier.
import { useMemo } from 'react';
import { App, type BoardFixture } from '../../App.tsx';
import { boardState } from './etats.ts';

export function BoardPage({ name }: { name: string }) {
  const fixture = useMemo<BoardFixture>(() => ({ ...boardState(name), onLeave: () => { window.location.hash = '#play/atelier'; } }), [name]);
  return (
    <div className="op-atelier-board" data-ui="atelier.board" data-state={name}>
      <App fixture={fixture} />
    </div>
  );
}
