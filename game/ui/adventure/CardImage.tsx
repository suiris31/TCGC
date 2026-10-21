// Visuel d'une impression de la Cale (numéro et version), pour la Cale, le comptoir et l'échange des doublons. Une carte
// peut manquer du catalogue du navigateur (cartes SP d'autres extensions, cartes pas encore jouables) : son visuel vient
// alors du relais de l'appli (img-en-hd/<numéro>.webp), comme dans BoosterOpening.
import type { SyntheticEvent } from 'react';
import { versionImageUrl } from '../../boosters/sets/index.ts';
import { cardData } from '../../engine/cards/index.ts';
import { cardImage } from '../images.ts';

const BASE = import.meta.env.BASE_URL;

// Visuels à essayer, dans l'ordre : celui de la version, celui du catalogue, celui du relais de l'appli
function imageSources(number: string, variant: string): string[] {
  const version = versionImageUrl(number, variant);
  const d = cardData()[number];
  return [...new Set([...(version ? [BASE + version] : []), ...(d ? [cardImage(d)] : []), `${BASE}img-en-hd/${number}.webp`])];
}

export function CardImage({ entry, className }: { entry: { number: string; variant: string; name: string }; className?: string }) {
  const sources = imageSources(entry.number, entry.variant);
  // visuel introuvable : le suivant de la liste
  const next = (ev: SyntheticEvent<HTMLImageElement>) => {
    const img = ev.currentTarget;
    const i = Number(img.dataset.i ?? 0) + 1;
    if (i < sources.length) {
      img.dataset.i = String(i);
      img.src = sources[i];
    } else img.classList.add('op-hold-noimg');
  };
  return <img className={className} src={sources[0]} alt={entry.name} loading="lazy" draggable={false} onError={next} />;
}
