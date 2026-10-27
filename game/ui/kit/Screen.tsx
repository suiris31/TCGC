// Gabarit des écrans hors partie (cadrage, § 2.5) :
// - en-tête : bouton de retour en haut à gauche (« ← <écran parent> »), titre, 2 actions au plus, les autres dans un
//   menu « ⋯ » ;
// - contenu qui défile (l'en-tête et la barre d'action restent en place) ;
// - barre d'action en bas (`footer`) : le bouton principal de l'écran (Lancer, Combattre, Créer) reste toujours
//   visible ; sur téléphone, elle prend toute la largeur, sous le pouce.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDevice } from '../device.ts';
import { Button, IconButton } from './Button.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './icons.ts';
import { menuMove, openLayers, splitActions } from './logic.ts';

export interface ScreenAction {
  id: string;
  label: string;
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  'data-ui'?: string;
}

export interface ScreenBack {
  /** l'écran où l'on revient (« Accueil », « Carte ») : le bouton dit « ← Accueil » */
  label: string;
  onBack: () => void;
  'data-ui'?: string;
}

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: ScreenBack;
  /** les 2 premières sont affichées, les autres vont dans le menu « ⋯ » */
  actions?: ScreenAction[];
  /** à droite du titre, avant les actions (la bourse, par exemple) */
  extra?: ReactNode;
}

export function ScreenHeader({ title, subtitle, back, actions = [], extra }: ScreenHeaderProps) {
  const { compact } = useDevice();
  const { shown, menu } = splitActions(actions);
  return (
    <header className="op-kit-screen-head">
      {back && (
        <Button variant="quiet" icon="back" className="op-kit-back" onClick={back.onBack} data-ui={back['data-ui']}>
          {back.label}
        </Button>
      )}
      <div className="op-kit-screen-titles">
        <h1 className="op-kit-screen-title">{title}</h1>
        {subtitle && <p className="op-kit-screen-subtitle">{subtitle}</p>}
      </div>
      {extra}
      {(shown.length > 0 || menu.length > 0) && (
        <div className="op-kit-screen-actions">
          {shown.map((a) => (
            a.icon && compact
              ? <IconButton key={a.id} icon={a.icon} label={a.label} variant={a.danger ? 'danger' : 'quiet'} disabled={a.disabled} onClick={a.onClick} data-ui={a['data-ui']} />
              : <Button key={a.id} icon={a.icon} variant={a.danger ? 'danger' : 'quiet'} disabled={a.disabled} onClick={a.onClick} data-ui={a['data-ui']}>{a.label}</Button>
          ))}
          {menu.length > 0 && <MoreMenu items={menu} />}
        </div>
      )}
    </header>
  );
}

export function Screen({ children, footer, className, 'data-ui': dataUi, ...header }: ScreenHeaderProps & {
  children: ReactNode;
  /** barre d'action du bas : le bouton principal de l'écran, et au besoin un résumé */
  footer?: ReactNode;
  className?: string;
  'data-ui'?: string;
}) {
  const { compact } = useDevice();
  return (
    <div className={`op-kit-screen${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`} data-ui={dataUi}>
      <ScreenHeader {...header} />
      <div className="op-kit-screen-body">{children}</div>
      {footer && <div className="op-kit-screen-bar">{footer}</div>}
    </div>
  );
}

// Le menu « ⋯ » : s'ouvre au clic, se parcourt aux flèches, se ferme par Échap, Tab, un choix ou un clic ailleurs
export function MoreMenu({ items, label = 'Plus d’actions', 'data-ui': dataUi = 'screen.more' }: { items: ScreenAction[]; label?: string; 'data-ui'?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = useRef<boolean[]>([]);
  disabled.current = items.map((a) => Boolean(a.disabled));

  const shut = (refocus: boolean) => {
    setOpen(false);
    setActive(-1);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };

  // ouvert : le menu passe au-dessus de la pile (une fenêtre qui le contient ne prend plus Échap ni Tab)
  useEffect(() => {
    if (!open) return;
    openLayers.push(id);
    setActive(menuMove(disabled.current, -1, 'Home'));
    const onKey = (e: KeyboardEvent) => {
      if (!openLayers.isTop(id)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        shut(true);
      } else if (e.key === 'Tab') {
        // le focus revient au bouton « ⋯ » (il ne s'échappe pas d'une fenêtre qui contiendrait le menu)
        e.preventDefault();
        shut(true);
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        setActive((i) => menuMove(disabled.current, i, e.key));
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) shut(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      openLayers.remove(id);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, id]);

  useEffect(() => {
    if (open && active >= 0) refs.current[active]?.focus({ preventScroll: true });
  }, [open, active]);

  return (
    <div className="op-kit-menu-wrap" ref={wrap}>
      <IconButton
        ref={trigger}
        icon="more"
        label={label}
        variant="quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? shut(false) : setOpen(true))}
        data-ui={dataUi}
      />
      {open && (
        <div className="op-kit-menu" role="menu" id={`${id}-menu`} aria-label={label}>
          {items.map((a, i) => (
            <button
              key={a.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              disabled={a.disabled}
              className={`op-kit-menu-item${a.danger ? ' is-danger' : ''}`}
              onClick={() => {
                shut(true);
                a.onClick();
              }}
              data-ui={a['data-ui']}
            >
              {a.icon ? <Icon name={a.icon} /> : <span className="op-kit-menu-pad" aria-hidden="true" />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
