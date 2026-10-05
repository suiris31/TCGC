import type { ReactNode } from 'react';
import { cardImage, cardName, type Card, type Lang } from '../api';
import { hideBroken } from './CardGrid';

type RowCard = Pick<Card, 'name' | 'nameFr' | 'image' | 'imageFr' | 'number' | 'variant' | 'setCode'>;

// Une carte sur une ligne : visuel, nom et langue, code / version / set, une étiquette, et à droite prix et détails
export function CardRow({ card, lang, onClick, chip, children }: {
  card: RowCard;
  lang: Lang;
  onClick: () => void;
  chip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li>
      <button className="card-row" onClick={onClick}>
        <img src={cardImage(card, lang)} alt="" loading="lazy" onError={hideBroken} />
        <span className="card-row-name">
          <span className="card-row-title">{cardName(card, lang)} <span className="muted">{lang.toUpperCase()}</span></span>
          <span className="muted small card-row-meta">{card.number}{card.variant && ` · ${card.variant}`}{card.setCode && ` · ${card.setCode}`}</span>
          {chip && <span>{chip}</span>}
        </span>
        <span className="card-row-side">{children}</span>
      </button>
    </li>
  );
}
