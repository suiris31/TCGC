// Règles de construction d'un deck (5-1-2) : 1 Leader, 50 cartes (Personnages, Événements, Lieux), seulement des
// couleurs du Leader (une carte multicolore compte comme chacune de ses couleurs : toutes doivent être sur le Leader,
// 2-3-5), 4 exemplaires au plus d'un même numéro. Des effets peuvent changer ces règles (5-1-2-4) : carte autorisée en
// autant d'exemplaires qu'on veut, restrictions d'un Leader (Rayleigh, Imu...).
// Les formats (Standard, Extra) et les cartes bannies sont vérifiés à part.
import { CARDS, cardStatus } from './cards/index.ts';
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

// Pour jouer un deck dans l'appli : les règles de construction, et des cartes dont l'effet est géré par le moteur
export function playableErrors(leader: string, cards: Record<string, number>): string[] {
  const errors = deckErrors(leader, cards);
  for (const num of [leader, ...Object.keys(cards)]) {
    if (CARDS[num] && cardStatus(num) === 'todo') errors.push(`${CARDS[num].name} (${num}) : effet pas encore géré par le jeu`);
  }
  return errors;
}

// ---------- Formats officiels ----------

// Standard (depuis le 1er avril 2026) : blocs 2 à 5. En avril 2027, le bloc 2 sortira à son tour.
export const STANDARD_BLOCKS = ['2', '3', '4', '5'];

// Un numéro est permis en Standard si au moins une de ses impressions est d'un bloc permis ; une impression au bloc
// inconnu (réédition récente mal renseignée) compte comme permise
export const standardLegal = (d: Pick<CardData, 'blocks'>) => !d.blocks.length || d.blocks.some((b) => STANDARD_BLOCKS.includes(b) || !/^\d+$/.test(b));

// Cartes bannies ou limitées (table regulations de TCGC : liste officielle française)
export type Regulations = Record<string, 'banned' | 'restricted' | 'pair'>;

// Ce qui empêche de jouer le deck en tournoi officiel : cartes bannies, limitées au-delà d'1 exemplaire (Standard et
// Extra). Avertissements seulement : les cartes dont aucune impression connue n'est du Standard (le catalogue ne connaît
// pas toutes les rééditions : Brook ST01-011, rééditée depuis, y figure au bloc 1) et les paires bannies (la liste
// officielle ne dit pas ici quelles cartes vont ensemble).
export function formatIssues(leader: string, cards: Record<string, number>, regs: Regulations = {}) {
  const errors: string[] = [];
  const standard: string[] = [];
  const pairs: string[] = [];
  for (const [num, n] of [[leader, 1] as const, ...Object.entries(cards)]) {
    const d = CARDS[num];
    if (!d) continue;
    const label = `${d.name} (${num})`;
    if (!standardLegal(d)) standard.push(`${label} : bloc ${d.blocks.join(', ')} seulement d’après le catalogue`);
    if (regs[num] === 'banned') errors.push(`${label} : bannie`);
    else if (regs[num] === 'restricted' && n > 1) errors.push(`${label} : limitée à 1 exemplaire`);
    else if (regs[num] === 'pair') pairs.push(`${label} : fait partie d’une paire bannie`);
  }
  return { errors, standard, pairs };
}
