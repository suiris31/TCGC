// Règles de construction d'un deck (5-1-2) : 1 Leader, 50 cartes (Personnages, Événements, Lieux), seulement des
// couleurs du Leader (une carte multicolore compte comme chacune de ses couleurs : toutes doivent être sur le Leader,
// 2-3-5), 4 exemplaires au plus d'un même numéro. Des effets peuvent changer ces règles (5-1-2-4) : carte autorisée en
// autant d'exemplaires qu'on veut, restrictions d'un Leader (Rayleigh, Imu...).
// Les formats (Standard, Extra) et les cartes bannies sont vérifiés à part.
import { CARDS } from './cards/index.ts';
import type { CardData } from './types.ts';

export const DECK_SIZE = 50;
export const MAX_COPIES = 4;

// « Selon les règles du jeu, vous pouvez avoir autant d'exemplaires que vous voulez de cette carte dans votre deck »
export const anyNumber = (d: Pick<CardData, 'effectEn'>) => /you may have any number of this card in your deck/i.test(d.effectEn);

// Problèmes d'une liste de deck, en français (aucun : deck valide)
export function deckErrors(leader: string, cards: Record<string, number>): string[] {
  const errors: string[] = [];
  const L = CARDS[leader];
  if (!L) return [`Leader inconnu : ${leader}`];
  if (L.category !== 'LEADER') errors.push(`${L.name} (${leader}) n'est pas un Leader`);
  const total = Object.values(cards).reduce((sum, n) => sum + n, 0);
  if (total !== DECK_SIZE) errors.push(`${total} cartes au lieu de ${DECK_SIZE}`);
  for (const [num, n] of Object.entries(cards)) {
    const d = CARDS[num];
    if (!d) {
      errors.push(`carte inconnue : ${num}`);
      continue;
    }
    const label = `${d.name} (${num})`;
    if (d.category === 'LEADER') errors.push(`${label} : un Leader ne va pas dans le deck`);
    const missing = d.colors.filter((c) => !L.colors.includes(c));
    if (missing.length) errors.push(`${label} : couleur absente du Leader`);
    if (n > MAX_COPIES && !anyNumber(d)) errors.push(`${label} : ${n} exemplaires (${MAX_COPIES} au plus)`);
    const forbidden = L.rules?.deckRestriction?.(d);
    if (forbidden) errors.push(`${label} : ${forbidden}`);
  }
  return errors;
}
