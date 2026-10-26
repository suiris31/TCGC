// Kit du jeu (tâche R1.2) : les composants de base de la refonte. Tout nouvel écran ou nouvelle fenêtre les utilise
// (01-contrats.md, § 14.4). Importer depuis ce fichier charge aussi leurs styles (kit.css).
import './kit.css';

export { AsyncState } from './AsyncState.tsx';
export { Button, IconButton, type ButtonVariant } from './Button.tsx';
export { Dialog, type DialogHistory } from './Dialog.tsx';
export { Icon } from './Icon.tsx';
export { ICON_LABELS, ICON_NAMES, type IconName } from './icons.ts';
export { MoreMenu, Screen, ScreenHeader, type ScreenAction, type ScreenBack, type ScreenHeaderProps } from './Screen.tsx';
