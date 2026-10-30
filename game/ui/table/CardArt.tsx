// Le visuel choisi d'une carte (tâche R3.12) : sur le plateau, la version choisie pour le deck de son propriétaire
// (table/cardArt.ts) ; ailleurs (tuile d'un deck, éditeur), celle des visuels du deck. Une version dont l'image ne se
// charge pas retombe sur le visuel de base.
import type { ImgHTMLAttributes } from 'react';
import type { DeckLooks } from '../../data/looks.ts';
import { CARDS } from '../../engine/cards/index.ts';
import { def } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { artPath } from '../builder/versions.ts';
import { cardImage } from '../images.ts';
import { artChoice } from './cardArt.ts';
import { useGivenLooks } from './DonArt.tsx';

export interface Art { src: string; base: string }

const withBase = (path: string) => `${import.meta.env.BASE_URL}${path}`;

// Visuel d'une version d'une carte (absente ou 'base' : le visuel de base)
export function versionArt(num: string, variant: string | undefined): Art {
  const base = cardImage(def(num));
  const path = artPath(num, CARDS[num], variant);
  return { src: path ? withBase(path) : base, base };
}

// Visuel d'une carte d'un deck, selon ses visuels choisis
export const deckArt = (num: string, looks: DeckLooks | undefined): Art => versionArt(num, looks?.arts?.[num]);

// Visuel d'une carte d'une partie, selon le deck de son propriétaire (sans partie ni propriétaire : le visuel de base)
export function useCardArt(s: GameState | null | undefined, owner: PlayerId | undefined, num: string): Art {
  const given = useGivenLooks();
  return versionArt(num, s ? artChoice(s, owner, num, given) : undefined);
}

// Image d'un visuel choisi : l'image de base si celle de la version ne se charge pas
export function ArtImg({ art, ...props }: { art: Art } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return (
    <img {...props} src={art.src}
      onError={art.src === art.base ? undefined : (e) => { if (!e.currentTarget.src.endsWith(art.base)) e.currentTarget.src = art.base; }} />
  );
}
