// Les vraies DON!! sur le plateau (tâche R2.11) : chaque DON!! d'un joueur (deck DON!!, zone de Coût, DON!! données)
// montre le visuel de la DON!! choisie pour son deck (looks.don, éditeur de decks), la DON!! standard sinon. Contre
// l'IA, le choix vient de mes decks (le deck de l'IA, du registre, n'en a pas) ; en ligne, de la vue du serveur
// (MatchView.looks, par siège), donnée par <DonLooks>. Sans visuel (retrait des images sur le serveur, liste des DON!!
// injoignable, image absente), on garde le dessin d'avant : des jetons dorés. Le choix : table/donLooks.ts.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { loadDons } from '../myDecks.ts';
import { donCatalog, donChoice, donImage, type DonCatalog, type SeatLooks } from './donLooks.ts';

// Visuels de chaque siège donnés par le serveur (partie en ligne) ; sans <DonLooks> : mes decks
const GivenLooks = createContext<SeatLooks | null>(null);
// Objet stable quand le serveur n'envoie rien : un {} neuf à chaque rendu redessinerait toutes les DON!! (R2.9)
const NO_LOOKS: SeatLooks = {};

export function DonLooks({ looks, children }: { looks: SeatLooks | undefined; children: ReactNode }) {
  return <GivenLooks.Provider value={looks ?? NO_LOOKS}>{children}</GivenLooks.Provider>;
}

// Visuels donnés par le serveur (partie en ligne) ; null hors de <DonLooks> : ceux de mes decks. Lu aussi pour les
// versions des cartes (table/CardArt.tsx)
export const useGivenLooks = () => useContext(GivenLooks);

// ---------- Liste des DON!! (lue une fois) et images qui n'ont pas pu se charger ----------

let catalog: DonCatalog | null = null;
let loading: Promise<void> | null = null;
const broken = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

function loadCatalog() {
  loading ??= loadDons()
    .then((r) => { catalog = donCatalog(r.dons, r.drawn === true, import.meta.env.BASE_URL); })
    .catch(() => { catalog = donCatalog([], true); })
    .finally(notify);
}

function useDonStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    loadCatalog();
    return () => { listeners.delete(f); };
  }, []);
}

// Le visuel des DON!! du joueur p ; null : on garde les jetons dorés
export function useDonArt(s: GameState, p: PlayerId): string | null {
  useDonStore();
  const url = donImage(catalog, donChoice(s, p, useContext(GivenLooks)));
  return url && !broken.has(url) ? url : null;
}

// Le visuel d'une DON!! (dans un jeton .don-card, la pile du deck DON!!, une petite carte sous une carte)
export function DonImg({ src }: { src: string }) {
  return (
    <img className="op-don-img" src={src} alt="" draggable={false}
      onError={() => { if (!broken.has(src)) { broken.add(src); notify(); } }} />
  );
}
