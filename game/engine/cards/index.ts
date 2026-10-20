// Toutes les cartes connues : informations officielles + comportement codé.
// Les informations officielles (nom, coût, texte...) viennent des listes française et anglaise de Bandai. Elles ne sont
// pas dans le dépôt : le serveur les télécharge (game/data/catalog.ts) et chacun les charge au démarrage avec
// loadCardData (navigateur et fils de calcul : depuis l'API ; tests et scripts : game/data/node.ts).
import { DECKS } from '../decks.ts';
import { leadingKeywords, onlyGenericEffects } from '../keywords.ts';
import type { CardBehavior, CardData, CardDef } from '../types.ts';
import { FAM_KAIDO } from './fam-kaido.ts';
import { FAM_KATAKURI } from './fam-katakuri.ts';
import { FAM_KUZAN } from './fam-kuzan.ts';
import { FAM_LUFFY_ACE } from './fam-luffy-ace.ts';
import { FAM_ROBIN_PURPLE } from './fam-robin-purple.ts';
import { FAM_ROBIN_YELLOW } from './fam-robin-yellow.ts';
import { FAM_SH_RED } from './fam-sh-red.ts';
import { FAM_SN_GREEN } from './fam-sn-green.ts';
import { FAM_WB } from './fam-wb.ts';
import { FAM_ZORO } from './fam-zoro.ts';
import { FAM_KIDD } from './fam-kidd.ts';
import { FAM_META } from './fam-meta.ts';
import { FAM_SABO } from './fam-sabo.ts';
import { META_ENEL } from './meta-enel.ts';
import { META_KAIDO } from './meta-kaido.ts';
import { META_MIHAWK } from './meta-mihawk.ts';
import { META_ROBIN } from './meta-robin.ts';
import { META_SABO } from './meta-sabo.ts';
import { META_XEBEC } from './meta-xebec.ts';
import { OP03_ROUGE } from './op03-rouge.ts';
import { ST21 } from './st21.ts';
import { ST22 } from './st22.ts';
import { ST30 } from './st30.ts';
import { ST31 } from './st31.ts';
import { ST32 } from './st32.ts';
import { ST33 } from './st33.ts';
import { ST34 } from './st34.ts';
import { ST35 } from './st35.ts';
import { ST36 } from './st36.ts';

// Un fichier par deck : celui où ses cartes ont été codées (une carte reprise dans un autre deck n'est codée qu'une fois)
const BEHAVIORS: Record<string, CardBehavior> = {
  ...ST31, ...ST32, ...ST33, ...ST34, ...ST35, ...ST36, ...META_SABO, ...META_MIHAWK, ...META_ROBIN,
  ...META_XEBEC, ...META_ENEL, ...META_KAIDO, ...ST21, ...ST22, ...ST30, ...FAM_SABO, ...FAM_META, ...FAM_KIDD, ...FAM_KAIDO,
  ...FAM_KATAKURI, ...FAM_KUZAN, ...FAM_WB, ...FAM_SH_RED, ...FAM_ZORO, ...FAM_SN_GREEN,
  ...FAM_ROBIN_PURPLE, ...FAM_ROBIN_YELLOW, ...FAM_LUFFY_ACE,
  ...OP03_ROUGE,
};

// Carte cachée, telle qu'un joueur la voit dans une partie en ligne (main adverse, decks, Vies face cachée : voir
// view.ts). L'interface peut la lire sans erreur ; elle l'affiche de dos.
export const HIDDEN = '?';
const HIDDEN_CARD: CardDef = {
  number: HIDDEN, imageId: '', lang: 'fr', rarity: '', category: 'CHARACTER', name: 'Carte cachée', names: [], cost: null,
  life: null, power: null, counter: null, colors: [], types: [], typeLabels: [], attributes: [], effect: '', trigger: null,
  effectEn: '', triggerEn: null, keywords: [], blocks: [],
};

// Rempli par loadCardData (toujours le même objet : les modules qui l'importent voient les cartes chargées)
export const CARDS: Record<string, CardDef> = { [HIDDEN]: HIDDEN_CARD };
let raw: Record<string, CardData> = {};

// Visuel d'une carte d'un deck préconstruit : celui de ce deck (le premier deck qui la contient)
function deckImage(num: string, d: CardData): string {
  for (const deck of Object.values(DECKS)) {
    const art = d.deckArt?.[deck.series];
    if (art && (deck.leader === num || deck.cards[num])) return art;
  }
  return d.imageId;
}

// [Déclenchement] mal rangé par la liste officielle française (5 cartes en octobre 2026) : la VO dit si la carte en a
// un. OP09-062 : le mot « [Déclenchement] » au milieu du texte a été pris pour le début d'un [Déclenchement] ;
// OP07-114, OP06-059... : le [Déclenchement] est resté dans le texte.
function frTrigger(d: CardData): Pick<CardData, 'effect' | 'trigger'> {
  if (d.lang !== 'fr' || Boolean(d.trigger) === Boolean(d.triggerEn)) return { effect: d.effect, trigger: d.trigger };
  if (d.trigger) return { effect: `${d.effect} [Déclenchement] ${d.trigger}`, trigger: null };
  const at = d.effect.lastIndexOf('[Déclenchement]');
  if (at <= 0) return { effect: d.effect, trigger: d.trigger };
  return { effect: d.effect.slice(0, at).trim(), trigger: d.effect.slice(at + '[Déclenchement]'.length).trim() };
}

// Les mots-clés sont relus dans le texte au chargement : le catalogue a pu être téléchargé par une version précédente
export function loadCardData(data: Record<string, CardData>) {
  raw = { ...raw, ...data };
  for (const [num, d] of Object.entries(data)) {
    CARDS[num] = {
      ...d, ...frTrigger(d), keywords: leadingKeywords(d.effectEn), imageId: deckImage(num, d), ...BEHAVIORS[num],
    };
  }
}

// Carte jouable ? 'coded' : comportement codé et testé ; 'auto' : seulement des mots-clés et effets gérés par le moteur
// (ou aucun effet) ; 'todo' : pas encore codée
export type CardStatus = 'coded' | 'auto' | 'todo';

export function cardStatus(num: string): CardStatus {
  if (BEHAVIORS[num]) return 'coded';
  const d = CARDS[num];
  return d && num !== HIDDEN && onlyGenericEffects(d) ? 'auto' : 'todo';
}

// Données telles que chargées (à transmettre aux fils de calcul)
export function cardData(): Record<string, CardData> {
  return raw;
}

// Cartes dont l'interface et l'IA ont besoin : celles des decks jouables
export function neededCards(): string[] {
  return [...new Set(Object.values(DECKS).flatMap((deck) => [deck.leader, ...Object.keys(deck.cards)]))];
}

// Cartes jouables (codées ou gérées d'office) : celles que l'éditeur propose et qu'un deck personnalisé peut contenir.
// L'interface les reçoit toutes : un deck personnalisé adverse peut en contenir n'importe laquelle, et les envoyer
// toutes ne trahit pas sa liste.
export function playableCards(): string[] {
  return [...new Set([...neededCards(), ...Object.keys(CARDS).filter((n) => n !== HIDDEN && cardStatus(n) !== 'todo')])];
}

export function missingCards(data: Record<string, CardData>): string[] {
  return neededCards().filter((n) => !data[n]);
}
