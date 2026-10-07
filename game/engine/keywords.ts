// Mots-clés et effets génériques, lus dans le texte officiel en VO des cartes : le moteur les gère pour toutes les
// cartes, sans code propre à chacune.
import type { CardData, Keyword } from './types.ts';

export const KEYWORDS: Keyword[] = ['Blocker', 'Rush', 'Rush: Character', 'Double Attack', 'Banish', 'Unblockable'];

// Texte sans les rappels de règle entre parenthèses ; « - » : la carte n'a pas d'effet
export const withoutReminders = (t: string) => t.replace(/\((?:[^()]|\([^()]*\))*\)/g, '').replace(/^\s*-\s*$/, '');

// Mots-clés toujours actifs : ceux qui ouvrent le texte de la carte (« [Bloqueur] [Jouée] ... »). Un mot-clé donné
// sous condition (« [DON!! x1] ce Personnage gagne [Bloqueur] ») est codé avec la carte.
export function leadingKeywords(effectEn: string): Keyword[] {
  const out: Keyword[] = [];
  let rest = withoutReminders(effectEn).trim();
  for (let m = rest.match(/^\[([^\]]+)\]\s*/); m && (KEYWORDS as string[]).includes(m[1]); m = rest.match(/^\[([^\]]+)\]\s*/)) {
    out.push(m[1] as Keyword);
    rest = rest.slice(m[0].length);
  }
  return out;
}

// [Déclenchement] générique : « jouez cette carte » ou « activez l'effet [Principale] de cette carte »
export function genericTrigger(d: Pick<CardData, 'triggerEn'>): 'play' | 'main' | null {
  const t = withoutReminders(d.triggerEn ?? '').trim();
  if (/^Play this card\.?$/i.test(t)) return 'play';
  if (/^Activate this card's \[Main\] effect\.?$/i.test(t)) return 'main';
  return null;
}

// La carte n'a que des mots-clés gérés par le moteur (ou aucun effet), et au plus un [Déclenchement] « jouez cette
// carte » : elle est jouable sans code propre
export function onlyGenericEffects(d: Pick<CardData, 'category' | 'effectEn' | 'triggerEn' | 'keywords'>): boolean {
  const rest = d.keywords.reduce((t, k) => t.replace(`[${k}]`, ''), withoutReminders(d.effectEn)).trim();
  if (rest) return false;
  if (!d.triggerEn) return true;
  return genericTrigger(d) === 'play' && (d.category === 'CHARACTER' || d.category === 'STAGE');
}
