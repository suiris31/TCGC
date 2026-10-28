// Atelier (tâche R3.3) : fin de partie en ligne, victoire (état construit dans plateau/etats.ts)
import { BoardPage } from './plateau/BoardPage.tsx';

export const title = 'Fin de partie en ligne : victoire';
export const render = () => <BoardPage name="victoire" mode="en-ligne" />;
