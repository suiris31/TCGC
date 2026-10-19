// Description des extensions dont on simule les boosters (composition, taux, versions spéciales) et identifiants des
// versions d'une carte. Les choix et les sources des taux sont expliqués dans game/docs/boosters.md.
import { OP03 } from './op03.ts';

// Version d'une carte : 'base' (impression normale), 'parallele' (illustration alternative), 'manga' (parallèle à fond
// de planche de manga), 'sp' (carte spéciale d'une autre extension glissée dans les boosters : affiches « Wanted »
// d'OP03). Le couple (numéro, version) désigne une impression : c'est la clé de la Cale (game_inventory). Si une même
// carte reçoit plus tard une deuxième version du même genre dans une autre extension, son identifiant portera le code
// de l'extension (« sp-op05 »), pour ne jamais confondre deux visuels.
export type Variant = 'base' | 'parallele' | 'manga' | 'sp';

export const VARIANT_LABELS: Record<Variant, string> = {
  base: 'Normale', parallele: 'Parallèle', manga: 'Parallèle manga', sp: 'Carte SP',
};

// Une impression spéciale : rareté imprimée et nom du visuel chez Bandai (relayé par l'appli : /img-en-hd/<id>.webp)
export interface Version {
  number: string;
  variant: Exclude<Variant, 'base'>;
  rarity: string;       // rareté imprimée : celle de la carte (L, R, SR, SEC), « SP CARD » pour une carte SP
  imageId: string;      // « OP03-001_p1 »
}

// Genre de « surprise » d'un booster (parallèle de Leader, de SR... carte SP, manga) et son poids dans le tirage
export interface HitKind {
  id: string;
  label: string;
  weight: number;       // poids relatif entre les genres (comptages publiés, voir boosters.md)
  versions: Version[];  // tirées au hasard, chacune avec la même chance
}

// Un « lot » : 12 boosters, soit autant de cartes qu'un display japonais (24 boosters de 6 cartes), l'unité dans
// laquelle les taux d'OP03 ont été comptés. Un display anglais (24 boosters de 12 cartes) en contient deux.
export interface LotRules {
  boosters: number;
  superRares: number[];  // nombre de SR du lot : une valeur de la liste, chacune avec la même chance
  leaders: number[];     // nombre de Leaders du lot, de même
  // Ce que contient le lot en plus, avec les poids observés : une SEC, une surprise, ou deux surprises
  patterns: { sec: number; oneHit: number; twoHits: number };
}

export interface BoosterSet {
  set: string;                         // 'OP03'
  lang: 'en';                          // version simulée : anglaise (visuels des versions spéciales)
  commons: number;                     // emplacements de communes (C) dans chaque booster
  uncommons: number;                   // emplacements de peu communes (UC)
  // Les deux derniers emplacements : un « libre » (commune, Leader ou surprise) et un « rare » (R, SR ou SEC)
  cards: Record<'L' | 'C' | 'UC' | 'R' | 'SR' | 'SEC', string[]>;   // numéros de la version de base, par rareté
  lot: LotRules;
  hits: HitKind[];
}

export const BOOSTER_SETS: Record<string, BoosterSet> = { OP03 };

// Toutes les versions spéciales connues, par numéro puis par identifiant de version
const VERSIONS = new Map<string, Version>();
for (const s of Object.values(BOOSTER_SETS)) {
  for (const v of s.hits.flatMap((h) => h.versions)) VERSIONS.set(`${v.number}|${v.variant}`, v);
}

export function findVersion(number: string, variant: string): Version | undefined {
  return VERSIONS.get(`${number}|${variant}`);
}

// Visuel d'une version spéciale, relayé par l'appli (chemin relatif, comme les autres visuels) : liste officielle
// anglaise, celle des versions simulées
export const versionImage = (v: Version) => `img-en-hd/${v.imageId}.webp`;

// Visuel d'une impression de la Cale ; undefined pour la version de base, dont le visuel est celui du catalogue
// (cardImage de game/ui/images.ts)
export function versionImageUrl(number: string, variant: string): string | undefined {
  const v = findVersion(number, variant);
  return v && versionImage(v);
}

export function variantLabel(variant: string): string {
  return VARIANT_LABELS[variant as Variant] ?? variant;
}
