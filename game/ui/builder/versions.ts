// Versions d'une carte au choix d'un deck (tâche R3.12) : la version de base (le visuel montré jusqu'ici), puis celles
// du catalogue (CardData.versions, tâche R3.11 : parallèles, manga, SP, rééditions, VF et VO) et celles des boosters
// simulés que le catalogue ne connaîtrait pas encore. Fonctions pures : les adresses sont relatives (à préfixer par
// import.meta.env.BASE_URL), comme versionImage des boosters.
import { findVersion } from '../../boosters/sets/index.ts';
import type { CardData } from '../../engine/types.ts';

export interface ArtVersion {
  variant: string;      // nom gardé dans le deck (DeckLooks.arts) ; 'base' : le visuel par défaut
  label: string;        // nom montré : « Normale », « Parallèle 2 », « Carte SP · VO »...
  path: string;         // visuel, relatif : « img-en-hd/OP03-001_p1.webp »
  lang: 'fr' | 'en';
}

type Art = Pick<CardData, 'imageId' | 'lang' | 'versions'>;

const imagePath = (imageId: string, lang: 'fr' | 'en') => `img-${lang}-hd/${imageId}.webp`;

// Genre d'une version, d'après son nom (« parallele-en-p2 » : parallèle ; « manga », « sp » : noms des boosters). La
// version de base est « Par défaut » : c'est parfois une parallèle (illustration d'un deck pour débutant, OP12-020)
const KIND_LABELS: Record<string, string> = {
  base: 'Par défaut', normale: 'Normale', parallele: 'Parallèle', manga: 'Parallèle manga', sp: 'Carte SP',
  reedition: 'Réédition', tr: 'Treasure Rare',
};
export const kindLabel = (variant: string) => KIND_LABELS[variant.split('-')[0]] ?? 'Autre version';

const BOOSTER_VARIANTS = ['parallele', 'manga', 'sp'] as const;

// Toutes les versions d'une carte, la version de base d'abord. La langue n'est dite que pour celles qui ne sont pas
// dans la langue du visuel de base ; deux versions du même genre sont numérotées (« Parallèle 1 », « Parallèle 2 »).
export function artVersions(num: string, card: Art | undefined): ArtVersion[] {
  if (!card) return [];
  const list: Omit<ArtVersion, 'label'>[] = [{ variant: 'base', path: imagePath(card.imageId, card.lang), lang: card.lang }];
  for (const v of card.versions ?? []) {
    if (v.variant !== 'base') list.push({ variant: v.variant, path: imagePath(v.imageId, v.lang), lang: v.lang });
  }
  // une impression gagnée dans un booster reste choisissable même si le catalogue ne la connaît pas encore
  for (const variant of BOOSTER_VARIANTS) {
    const v = findVersion(num, variant);
    if (v && !list.some((x) => x.variant === variant)) list.push({ variant, path: imagePath(v.imageId, 'en'), lang: 'en' });
  }
  const names = list.map((v) => `${kindLabel(v.variant)}${v.lang !== card.lang ? ` · ${v.lang === 'fr' ? 'VF' : 'VO'}` : ''}`);
  const seen = new Map<string, number>();
  return list.map((v, i) => {
    const same = names.filter((n) => n === names[i]).length;
    const rank = (seen.get(names[i]) ?? 0) + 1;
    seen.set(names[i], rank);
    return { ...v, label: same > 1 ? names[i].replace(/^([^·]+?)( ·|$)/, `$1 ${rank}$2`) : names[i] };
  });
}

// Visuel d'une version choisie ; null pour la version de base ou une version inconnue (on montre alors le visuel de base)
export function artPath(num: string, card: Art | undefined, variant: string | undefined): string | null {
  if (!variant || variant === 'base' || !card) return null;
  const v = card.versions?.find((x) => x.variant === variant);
  if (v) return imagePath(v.imageId, v.lang);
  const won = findVersion(num, variant);
  return won ? imagePath(won.imageId, 'en') : null;
}

// Versions de chaque carte dans la Cale : { numéro: { version: exemplaires } }
export function holdVariants(cards: { number: string; variant: string; count: number }[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const c of cards) {
    if (c.count > 0) (out[c.number] ??= {})[c.variant] = (out[c.number]?.[c.variant] ?? 0) + c.count;
  }
  return out;
}

// Une version se choisit-elle ? Deck libre : toutes ; deck d'aventure : la version de base (le visuel par défaut), et
// les autres seulement si la Cale en a un exemplaire (le serveur refuse les autres : version_not_in_hold)
export function canChoose(variant: string, owned: Record<string, number> | undefined, adventure: boolean): boolean {
  return !adventure || variant === 'base' || (owned?.[variant] ?? 0) > 0;
}
