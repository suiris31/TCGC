// L'écran de la partie autour du plateau : le contrôleur des cartes (useBoardInteraction), le panneau (Journal, Coach,
// Tous les choix) et son tiroir sur téléphone, les fenêtres (aide, réglages, guide du deck), l'intro, puis l'écran de
// victoire ou de défaite et la fin de partie (refermable par « Voir le plateau »). Commun à la partie contre l'IA, à
// la partie en ligne et à l'atelier ; TableScreen l'affiche.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWakeLock } from '../device.ts';
import { useLayer } from '../routes.ts';
import { useBoardInteraction, type BoardSource } from './useBoardInteraction.ts';

export type SideTab = 'journal' | 'coach' | 'choix';

// intro : la partie commence par l'intro (les deux Leaders face à face) ; aim : voir useBoardInteraction
export function useTable(source: BoardSource, init: { intro?: boolean; aim?: { attacker: number; target: number } } = {}) {
  // Téléphone : le journal, le coach et tous les choix sont dans un tiroir, refermé à chaque choix envoyé
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<SideTab>('journal');
  const send = source.choose;
  const choose = useCallback((id: string) => {
    setPanel(false);
    send(id);
  }, [send]);
  const board = useBoardInteraction({ ...source, choose }, init);

  const [help, setHelp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guide, setGuide] = useState<string | null>(null);
  // anciennes fenêtres de l'aide et du guide : le Retour les ferme aussi (les réglages, fenêtre du kit, le font d'office)
  useLayer(help, () => setHelp(false));
  useLayer(guide !== null, () => setGuide(null));

  const [intro, setIntro] = useState(Boolean(init.intro));
  // les effets du plateau ne comparent pas deux états d'une époque à l'autre (nouvelle partie, retour en arrière)
  const [epoch, setEpoch] = useState(0);
  const s = source.state;
  const over = s !== null && s.winner !== null;
  useWakeLock(s !== null && !over);

  // Fin de partie : l'écran de victoire ou de défaite, une seule fois (pas pour une partie déjà finie à l'ouverture),
  // puis la fin de partie
  const [celebrate, setCelebrate] = useState(false);
  const [showEnd, setShowEnd] = useState(true);
  const celebrated = useRef(over);
  useEffect(() => {
    if (over && !celebrated.current) {
      celebrated.current = true;
      setCelebrate(true);
    }
  }, [over]);

  // Retour en arrière : plus de menu ni de ciblage, et pas d'effets entre les deux états
  const reset = () => {
    board.reset();
    setEpoch((e) => e + 1);
  };

  return {
    board, over, epoch,
    panel, setPanel, tab, setTab,
    help, setHelp, settingsOpen, setSettingsOpen, guide, setGuide,
    intro, setIntro,
    celebrate, setCelebrate, showEnd, setShowEnd,
    reset,
    // Nouvelle partie (ou reprise) : la fin de partie se rejouera
    restart: (opts: { intro?: boolean } = {}) => {
      reset();
      setCelebrate(false);
      celebrated.current = false;
      setShowEnd(true);
      if (opts.intro) setIntro(true);
    },
    // Échap : tout ce qui est ouvert sur le plateau se ferme
    closeAll: () => {
      board.cancel();
      setHelp(false);
      setSettingsOpen(false);
      setGuide(null);
      setPanel(false);
      board.zoom.close();
    },
  };
}

export type Table = ReturnType<typeof useTable>;
