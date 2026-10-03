import { api, cardImage, cardName, formatEur, type Card } from '../api';
import { t } from '../i18n';
import { useApp } from '../store';
import { Icon } from './Icon';

// Visuel indisponible : on masque l'image, le fond de la vignette prend le relais
export function hideBroken(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.visibility = 'hidden';
}

interface TileOptions {
  quickAdd?: boolean;
  // grise les cartes non possédées
  dimMissing?: boolean;
  // 'owned' : une carte possédée s'affiche dans la langue de ses exemplaires (VF en priorité)
  langMode?: 'input' | 'owned';
}

export function CardTile({ card, quickAdd = false, dimMissing = false, langMode = 'input' }: TileOptions & { card: Card }) {
  const { openCard, cardChanged, toast, lang: inputLang } = useApp();
  // Collection : chaque exemplaire s'affiche dans sa langue ; catalogue : dans la langue de saisie
  const ownedLang = card.ownedByLang.fr > 0 ? 'fr' : card.ownedByLang.en > 0 ? 'en' : null;
  const lang = card.entry?.lang ?? (langMode === 'owned' && ownedLang ? ownedLang : inputLang);
  const count = card.entry ? card.entry.quantity : card.owned;
  const missing = dimMissing && card.owned === 0;

  const add = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { card: updated, totals } = await api.add(card.id, 1, inputLang);
    cardChanged(updated, totals);
    toast(t('card.added', { name: cardName(card, inputLang), lang: inputLang.toUpperCase(), n: updated.ownedByLang[inputLang] }));
  };

  return (
    <div className={missing ? 'tile tile-missing' : 'tile'} onClick={() => openCard(card.id, lang)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openCard(card.id, lang)}>
      <div className="tile-img">
        <img src={cardImage(card, lang)} alt={card.fullName} loading="lazy" onError={hideBroken} />
        {count > 0 && <span className="badge-owned">×{count}</span>}
        {card.entry && <span className="badge-lang">{card.entry.lang.toUpperCase()}</span>}
        {quickAdd && (
          <button className="tile-add" onClick={add} aria-label={t('card.addAria', { name: card.fullName, lang: inputLang.toUpperCase() })}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      <div className="tile-body">
        <div className="tile-name">{cardName(card, lang)}</div>
        <div className="tile-meta">
          <span>{card.number}</span>
          {card.variant && <span className="tile-variant">{card.variant}</span>}
        </div>
        <div className="tile-price">{formatEur(card.price.eur)}</div>
      </div>
    </div>
  );
}

export function CardGrid({ cards, ...options }: TileOptions & { cards: Card[] }) {
  return (
    <div className="grid">
      {cards.map((c) => <CardTile key={`${c.id}-${c.entry?.lang ?? ''}`} card={c} {...options} />)}
    </div>
  );
}
