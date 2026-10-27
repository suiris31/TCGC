// Atelier (tâche R3.3) : fin de partie en ligne, défaite (état construit dans plateau/etats.ts)
import { BoardPage } from './plateau/BoardPage.tsx';

export const title = 'Fin de partie en ligne : défaite';
export const render = () => <BoardPage name="defaite" mode="en-ligne" />;
