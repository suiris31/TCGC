// Ouverture des boosters sans perte (tâche R3.6) : un seul code pour la Cale, la boutique et les récompenses d'un
// chapitre. La Cale est lue juste avant (« Nouveau ! »), puis l'écran d'ouverture (BoosterOpening) tire chaque booster
// sur le serveur (POST /api/game/boosters/:id/open) **au moment où on l'ouvre** : ceux qu'on n'a pas ouverts quand on
// s'arrête restent « à ouvrir » dans la Cale. « Tout ouvrir le reste » les tire tous, un par un.
//
//   const opening = useBoosterOpening({ onDone: () => reload() });
//   opening.start(boosters)                 // { id, set }[] : boosters gagnés ou achetés, pas encore ouverts
//   if (opening.props) return <BoosterOpening {...opening.props} />;
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BoosterContent } from '../../boosters/types.ts';
import { loadHold, openWonBooster } from '../adventure/api.ts';
import { ownedCounts, type BoosterOpeningProps, type OpeningResult } from '../adventure/BoosterOpening.tsx';

// Ce dont l'ouverture a besoin (le serveur ; l'atelier en donne un de démonstration)
export interface BoosterOpener {
  // exemplaires de la Cale avant l'ouverture, par clé ownedKey
  owned: () => Promise<Record<string, number>>;
  // tire un booster sur le serveur ; une nouvelle demande pour le même booster rend le même contenu (sans rien ajouter)
  open: (id: string) => Promise<BoosterContent>;
}

export const SERVER_OPENER: BoosterOpener = {
  owned: async () => ownedCounts((await loadHold()).cards),
  open: async (id) => (await openWonBooster(id)).content,
};

export interface BoosterToOpen { id: string; set: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// onDone : l'écran d'ouverture est refermé (opened : boosters ouverts, left : boosters laissés dans la Cale)
export function useBoosterOpening({ opener = SERVER_OPENER, onDone }: { opener?: BoosterOpener; onDone?: (result: OpeningResult) => void } = {}) {
  const [session, setSession] = useState<{ boosters: BoosterToOpen[]; owned?: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const done = useRef(onDone);
  done.current = onDone;

  // Lit la Cale puis montre l'écran d'ouverture ; rien n'est tiré à ce moment
  const start = useCallback(async (boosters: BoosterToOpen[]) => {
    if (!boosters.length) return;
    setBusy(true);
    setError(undefined);
    try {
      setSession({ boosters, owned: await opener.owned() });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [opener]);

  // Referme l'écran sans attendre la fin (l'écran d'en dessous disparaît) : les boosters pas encore tirés restent
  const close = useCallback(() => setSession(null), []);

  const props = useMemo<BoosterOpeningProps | null>(() => session && {
    boosters: session.boosters,
    owned: session.owned,
    draw: opener.open,
    onDone: (result: OpeningResult) => {
      setSession(null);
      done.current?.(result);
    },
  }, [session, opener]);

  return { start, close, busy, error, props };
}
