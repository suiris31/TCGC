// Ce qu'affiche un écran qui attend le serveur : un chargement, une erreur avec « Réessayer », ou un contenu vide ;
// sinon son contenu. L'ordre : chargement, erreur, vide (logic.ts, `asyncView`).
import type { ReactNode } from 'react';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { asyncView, errorMessage } from './logic.ts';

export function AsyncState({ loading, error, onRetry, empty, loadingText = 'Chargement…', emptyTitle, emptyText, emptyAction, children }: {
  loading?: boolean;
  /** l'erreur (une `ApiError`, une `Error` ou un texte) : son message est affiché tel quel */
  error?: unknown;
  /** relance le chargement : sans elle, l'erreur n'a pas de bouton */
  onRetry?: () => void;
  empty?: boolean;
  loadingText?: string;
  emptyTitle?: ReactNode;
  emptyText?: ReactNode;
  /** un bouton qui mène à la suite (« Créer un deck ») */
  emptyAction?: ReactNode;
  children?: ReactNode;
}) {
  const view = asyncView({ loading, error, empty });
  if (view === 'loading') {
    return (
      <div className="op-kit-async" role="status" aria-live="polite">
        <span className="op-kit-spinner op-kit-spinner-big" aria-hidden="true" />
        <p>{loadingText}</p>
      </div>
    );
  }
  if (view === 'error') {
    return (
      <div className="op-kit-async op-kit-async-error" role="alert">
        <Icon name="alert" size="2rem" />
        <p>{errorMessage(error)}</p>
        {onRetry && <Button variant="primary" icon="retry" onClick={onRetry}>Réessayer</Button>}
      </div>
    );
  }
  if (view === 'empty') {
    return (
      <div className="op-kit-async op-kit-async-empty">
        {emptyTitle && <p className="op-kit-async-title">{emptyTitle}</p>}
        {emptyText && <p className="op-kit-async-text">{emptyText}</p>}
        {emptyAction}
      </div>
    );
  }
  return <>{children}</>;
}
