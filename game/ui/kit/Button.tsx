// Boutons du jeu : quatre genres (principal, secondaire, discret, danger), toujours au moins 44 px de haut et de large
// pour le doigt. `IconButton` n'a qu'une icône : son libellé (`label`) est obligatoire, lu par les lecteurs d'écran et
// montré en bulle au survol.
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from './Icon.tsx';
import type { IconName } from './icons.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size = 'normal', icon, busy = false, wide = false, className, disabled, type = 'button', children, ref, ...rest }: NativeButton & {
  variant?: ButtonVariant;
  /** `big` : bouton principal d'un écran (Lancer, Combattre) */
  size?: 'normal' | 'big';
  /** icône placée avant le texte */
  icon?: IconName;
  /** action en cours : le bouton montre une roue, ne réagit plus, et le garde annoncé (aria-busy) */
  busy?: boolean;
  /** prend toute la largeur disponible */
  wide?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes('op-kit-btn', `op-kit-btn-${variant}`, size === 'big' && 'op-kit-btn-big', wide && 'op-kit-btn-wide', busy && 'is-busy', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="op-kit-spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      <span className="op-kit-btn-text">{children}</span>
    </button>
  );
}

export function IconButton({ icon, label, variant = 'secondary', pressed, badge, className, type = 'button', ref, ...rest }: Omit<NativeButton, 'aria-label' | 'title'> & {
  icon: IconName;
  /** ce que fait le bouton (« Réglages », « Fermer ») : obligatoire */
  label: string;
  variant?: ButtonVariant;
  /** bouton à bascule (son activé ou coupé…) : son état, annoncé par aria-pressed */
  pressed?: boolean;
  /** petite pastille (un nombre) en coin */
  badge?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  if (import.meta.env?.DEV && !label.trim()) console.error('IconButton : le libellé (label) est obligatoire');
  return (
    <button
      ref={ref}
      type={type}
      className={classes('op-kit-icon-btn', `op-kit-btn-${variant}`, pressed && 'is-pressed', className)}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} />
      {badge !== undefined && badge !== null && <span className="op-kit-badge" aria-hidden="true">{badge}</span>}
    </button>
  );
}
