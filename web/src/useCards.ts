import { useEffect, useRef, useState } from 'react';
import { api, type Card, type CardQuery } from './api';
import { useApp } from './store';

const PAGE = 60;

// Liste paginée de cartes, rechargée quand les filtres ou la collection changent
export function useCards(query: CardQuery, { debounce = 0, pageSize = PAGE } = {}) {
  const { version } = useApp();
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState(1);
  const key = JSON.stringify(query);
  const lastKey = useRef(key);

  useEffect(() => {
    // Nouveaux filtres : on repart de la première page ; simple mise à jour de la collection : on garde la pagination
    const filtersChanged = lastKey.current !== key;
    lastKey.current = key;
    const pageCount = filtersChanged ? 1 : pages;
    if (filtersChanged && pages !== 1) setPages(1);

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.cards({ ...query, limit: pageSize * pageCount, offset: 0 })
        .then((res) => {
          if (cancelled) return;
          setCards(res.cards);
          setTotal(res.total);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, filtersChanged ? debounce : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, pages]);

  return {
    cards,
    total,
    loading,
    hasMore: cards.length < total,
    loadMore: () => setPages((p) => p + 1),
  };
}
