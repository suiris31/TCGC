// Une icône du jeu (icons.ts), à la taille et à la couleur du texte qui l'entoure. Décorative par défaut (cachée des
// lecteurs d'écran : le bouton qui la porte a son propre libellé) ; avec `label`, elle se lit seule.
import { ICONS, type IconName } from './icons.ts';

export function Icon({ name, label, size, className }: {
  name: IconName;
  /** texte lu par les lecteurs d'écran (et bulle au survol) quand l'icône n'accompagne aucun texte */
  label?: string;
  /** taille CSS (par défaut 1.25em : un peu plus grande que le texte) */
  size?: string;
  className?: string;
}) {
  return (
    <svg
      className={className ? `op-icon ${className}` : 'op-icon'}
      viewBox="0 0 24 24"
      width={size ?? '1.25em'}
      height={size ?? '1.25em'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {label && <title>{label}</title>}
      {ICONS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
