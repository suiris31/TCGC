// Fenêtre du jeu, pour toutes les fenêtres de la refonte :
// - `role="dialog"`, `aria-modal`, titre relié (`aria-labelledby`) ;
// - focus posé à l'ouverture (élément marqué `data-autofocus`, sinon le premier du contenu), piégé dans la fenêtre
//   (Tab et Maj+Tab y circulent), rendu à la fermeture à l'élément qui l'avait ;
// - Échap ferme (seulement la fenêtre du dessus quand plusieurs sont ouvertes) ;
// - `reducible` : un bouton « Voir le plateau » la réduit en un bandeau en bas de l'écran, d'où on la rouvre (son
//   contenu reste monté : rien n'est perdu) ;
// - sur téléphone (`useDevice().compact`), elle devient une fiche qui monte du bas ;
// - `history` : point d'accroche du Retour du navigateur (R1.3 le branche sur `pushLayer` / `popLayer` de R1.4).
// Sans `onClose`, la fenêtre ne se ferme pas d'elle-même (ni Échap, ni fond, ni Retour) : la décision est attendue.
// Elle est rendue dans le conteneur du jeu (`.opc`), au-dessus de tout ; les événements React remontent quand même
// au composant qui l'ouvre (comme pour tout portail).
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDevice } from '../device.ts';
import { Button, IconButton } from './Button.tsx';
import { initialFocus, isTabbable, nextFocus, openLayers as layers, TABBABLE } from './logic.ts';

/** Lien avec l'historique du navigateur : une fenêtre ouverte y ajoute une entrée, que le Retour retire */
export interface DialogHistory {
  /** la fenêtre s'ouvre : ajoute une entrée ; `onBack` sera appelé si le Retour du navigateur la retire */
  push(onBack: () => void): void;
  /** la fenêtre se ferme autrement (bouton, Échap, fond) : retire son entrée */
  pop(): void;
}

const tabbables = (root: HTMLElement | null) =>
  root ? [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(isTabbable) : [];

function focusFirst(panel: HTMLElement | null) {
  if (!panel) return;
  const body = panel.querySelector<HTMLElement>('.op-kit-dialog-body');
  const marked = panel.querySelector<HTMLElement>('[data-autofocus]');
  const target = initialFocus(marked && isTabbable(marked) ? marked : null, tabbables(body), tabbables(panel)) ?? panel;
  target.focus({ preventScroll: true });
}

export function Dialog({ title, onClose, children, actions, size = 'normal', reducible = false, reducedText, closeOnBackdrop = true, alert = false, history, className, ...rest }: {
  title: ReactNode;
  /** ferme la fenêtre (bouton ✕, Échap, clic sur le fond, Retour) ; absent = fenêtre qui attend une décision */
  onClose?: () => void;
  children: ReactNode;
  /** boutons du bas (collés en bas sur téléphone) */
  actions?: ReactNode;
  size?: 'small' | 'normal' | 'wide';
  /** true (« Voir le plateau ») ou le libellé du bouton qui réduit la fenêtre en un bandeau */
  reducible?: boolean | string;
  /** texte du bandeau de la fenêtre réduite (par défaut : le titre) */
  reducedText?: ReactNode;
  closeOnBackdrop?: boolean;
  /** fenêtre qui demande une confirmation (`role="alertdialog"`) */
  alert?: boolean;
  history?: DialogHistory;
  className?: string;
  'data-ui'?: string;
}) {
  const id = useId();
  const titleId = `${id}-titre`;
  const panel = useRef<HTMLDivElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const [reduced, setReduced] = useState(false);
  const { compact } = useDevice();
  const close = useRef(onClose);
  close.current = onClose;
  const closable = Boolean(onClose);

  // Ouverture : la fenêtre passe au-dessus et prend le focus ; fermeture : le focus revient d'où il venait
  useLayoutEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    layers.push(id);
    focusFirst(panel.current);
    const node = panel.current;
    return () => {
      layers.remove(id);
      const active = document.activeElement;
      const lost = !active || active === document.body || Boolean(node?.contains(active));
      if (lost && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [id]);

  // Réduite : le bandeau prend le focus ; rouverte : la fenêtre le reprend
  const firstRender = useRef(true);
  useLayoutEffect(() => {
    layers.setReduced(id, reduced);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reduced) reopen.current?.focus({ preventScroll: true });
    else focusFirst(panel.current);
  }, [id, reduced]);

  // Clavier : Échap ferme, Tab circule dans la fenêtre ; seulement pour la fenêtre du dessus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!layers.isTop(id) || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        // même sans onClose, Échap ne doit pas atteindre l'écran sous la fenêtre
        e.preventDefault();
        e.stopPropagation();
        close.current?.();
      } else if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const items = tabbables(panel.current);
        const active = document.activeElement as HTMLElement | null;
        const next = nextFocus(items, active && items.includes(active) ? active : null, e.shiftKey);
        (next ?? panel.current)?.focus({ preventScroll: true });
      }
    };
    // le focus ne sort pas de la fenêtre (clic hors d'elle, lecteur d'écran, programme)
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (!layers.isTop(id) || !panel.current || (target && panel.current.contains(target))) return;
      focusFirst(panel.current);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [id]);

  // Historique : une entrée tant que la fenêtre est ouverte ; le Retour la ferme. Lu à l'ouverture seulement (un
  // objet `history` recréé à chaque rendu n'ajoute pas d'entrée)
  const hist = useRef(history);
  hist.current = history;
  const linked = Boolean(history) && closable;
  useEffect(() => {
    const h = hist.current;
    if (!linked || !h) return;
    let backed = false;
    h.push(() => {
      backed = true;
      close.current?.();
    });
    return () => {
      if (!backed) h.pop();
    };
  }, [linked]);

  // Clic sur le fond : seulement si l'appui a commencé sur le fond (pas une sélection de texte qui déborde)
  const downOnBackdrop = useRef(false);
  const backdropProps = closable && closeOnBackdrop ? {
    onPointerDown: (e: PointerEvent) => { downOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e: MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) close.current?.();
      downOnBackdrop.current = false;
    },
  } : {};

  const reduceLabel = typeof reducible === 'string' ? reducible : 'Voir le plateau';
  const root = document.querySelector<HTMLElement>('.opc') ?? document.body;
  return createPortal(
    <div className={`op-kit-layer${compact ? ' is-sheet' : ''}${reduced ? ' is-reduced' : ''}`} data-ui={rest['data-ui']}>
      <div className="op-kit-backdrop" hidden={reduced} {...backdropProps} />
      <div
        ref={panel}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        hidden={reduced}
        className={`op-kit-dialog op-kit-dialog-${size}${className ? ` ${className}` : ''}`}
      >
        <header className="op-kit-dialog-head">
          <h2 id={titleId} className="op-kit-dialog-title">{title}</h2>
          {reducible && <Button variant="quiet" icon="power-down" onClick={() => setReduced(true)} data-ui="dialog.reduce">{reduceLabel}</Button>}
          {closable && <IconButton icon="close" label="Fermer" variant="quiet" onClick={() => close.current?.()} data-ui="dialog.close" />}
        </header>
        <div className="op-kit-dialog-body">{children}</div>
        {actions && <footer className="op-kit-dialog-actions">{actions}</footer>}
      </div>
      {reduced && (
        <div className="op-kit-reduced" role="region" aria-label="Fenêtre réduite">
          <span className="op-kit-reduced-text">{reducedText ?? title}</span>
          <Button ref={reopen} variant="primary" icon="power-up" onClick={() => setReduced(false)} data-ui="dialog.reopen">Rouvrir</Button>
        </div>
      )}
    </div>,
    root,
  );
}
