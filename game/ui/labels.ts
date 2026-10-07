// Libellés français des couleurs et des attributs (les cartes les donnent en VO, identiques dans toutes les langues)
import type { Color, Keyword } from '../engine/types.ts';

export const COLOR_LABEL: Record<Color, string> = { Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune' };

const ATTRIBUTE_LABEL: Record<string, string> = { Slash: 'Tranche', Strike: 'Frappe', Ranged: 'Distance', Special: 'Spécial', Wisdom: 'Sagesse' };

export const attributeLabel = (a: string) => ATTRIBUTE_LABEL[a] ?? a;

export const KEYWORD_LABEL: Record<Keyword, string> = {
  Blocker: 'Bloqueur', Rush: 'Initiative', 'Rush: Character': 'Initiative : Personnage', 'Double Attack': 'Double attaque',
  Banish: 'Exil', Unblockable: 'Imblocable',
};
