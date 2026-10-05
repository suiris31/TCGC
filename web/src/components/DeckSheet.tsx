import { useEffect, useState } from 'react';
import { api, cardImage, cardName, formatDate, type DeckContents, type Lang, type StarterDeck } from '../api';
import { hasMessage, t } from '../i18n';
import { useApp } from '../store';
import { hideBroken } from './CardGrid';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';

// "Character" -> "Personnage"
function typeLabel(type: string | null) {
  const key = `cardtype.${type}`;
  return hasMessage(key) ? t(key) : type;
}

// Ajout d'un deck préconstruit (deck pour débutant) : choix du deck, quantités pré-remplies quand la liste est
// connue, langue des cartes, puis ajout de toutes les cartes à la collection
export function DeckSheet({ initialDeck = null, onClose }: { initialDeck?: number | null; onClose: () => void }) {
  const { lang: inputLang, cardChanged, toast } = useApp();
  const [decks, setDecks] = useState<StarterDeck[] | null>(null);
  const [deckId, setDeckId] = useState<number | null>(initialDeck);
  const [deck, setDeck] = useState<DeckContents | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [lang, setLang] = useState<Lang>(inputLang);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (deckId !== null || decks) return;
    api.decks().then(setDecks).catch(() => setDecks([]));
  }, [deckId, decks]);

  useEffect(() => {
    if (deckId === null) return;
    let cancelled = false;
    setDeck(null);
    api.deck(deckId).then((d) => {
      if (cancelled) return;
      setDeck(d);
      setQuantities(Object.fromEntries(d.items.map((i) => [i.card.id, i.quantity])));
    }).catch((err) => toast((err as Error).message));
    return () => { cancelled = true; };
  }, [deckId, toast]);

  const total = Object.values(quantities).reduce((sum, n) => sum + n, 0);
  const setQty = (id: number, n: number) => setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(20, n)) }));

  const add = async () => {
    if (!deck) return;
    setBusy(true);
    try {
      const items = Object.entries(quantities).filter(([, n]) => n > 0).map(([id, quantity]) => ({ id: Number(id), quantity }));
      const res = await api.addDeck(deck.set.id, lang, items);
      cardChanged(null, res.totals);
      toast(t('deck.added', { code: deck.set.code, n: res.copies }));
      onClose();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="sheet-close" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
        <div className="recap-body">
          <h2>{t('deck.title')}</h2>

          {deckId === null ? (
            <>
              <p className="muted small flush">{t('deck.pick')}</p>
              {!decks && <div className="center"><div className="spinner" /></div>}
              <ul className="card-list">
                {decks?.map((d) => (
                  <li key={d.id}>
                    <button className="deck-pick" onClick={() => setDeckId(d.id)}>
                      <span className="deck-pick-code">{d.code}</span>
                      <span className="deck-pick-name">
                        <span>{d.name.replace(/^ST-?\d+:\s*/, '')}</span>
                        <span className="muted small">{formatDate(d.releaseDate)}{d.known && ` · ${t('deck.fullList')}`}</span>
                      </span>
                      <span aria-hidden="true" className="muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : !deck ? (
            <div className="center"><div className="spinner" /></div>
          ) : (
            <>
              <div>
                <strong>{deck.set.code}</strong> <span className="muted">{deck.set.name.replace(/^ST-?\d+:\s*/, '')}</span>
              </div>
              <p className="muted small flush">{t(deck.known ? 'deck.knownList' : 'deck.unknownList')}</p>
              <div className="wish-row">
                <span>{t('deck.lang')}</span>
                <LangSwitch value={lang} onChange={setLang} compact label={t('deck.lang')} />
              </div>
              <ul className="card-list">
                {deck.items.map(({ card }) => {
                  const n = quantities[card.id] ?? 0;
                  return (
                    <li key={card.id} className={n ? 'deck-row' : 'deck-row deck-row-off'}>
                      <img src={cardImage(card, lang)} alt="" loading="lazy" onError={hideBroken} />
                      <span className="card-row-name">
                        <span className="card-row-title">{cardName(card, lang)}</span>
                        <span className="muted small card-row-meta">
                          {card.number} · {typeLabel(card.type)}
                          {card.cost && ` · ${t('stat.cost')} ${card.cost}`}
                        </span>
                      </span>
                      <div className="stepper stepper-sm">
                        <button onClick={() => setQty(card.id, n - 1)} disabled={n === 0} aria-label={t('scan.lessAria')}><Icon name="minus" size={16} /></button>
                        <span className="stepper-value">{n}</span>
                        <button onClick={() => setQty(card.id, n + 1)} aria-label={t('scan.moreAria')}><Icon name="plus" size={16} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="muted small">{t('count.cards', { n: total })}</div>
              <div className="panel-actions">
                {initialDeck === null && <button className="btn btn-ghost" onClick={() => setDeckId(null)}>{t('deck.back')}</button>}
                <button className="btn btn-primary" onClick={add} disabled={busy || total === 0}>
                  <Icon name="plus" size={18} /> {t('deck.submit', { n: total })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
