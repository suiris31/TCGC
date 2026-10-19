// Ouverture des boosters : VERSION PROVISOIRE (tâche 0), sans les vrais taux. Chaque booster contient 12 cartes
// différentes de l'extension, tirées dans le catalogue avec des poids simples par rareté. La tâche 1.5 la remplace par
// le vrai générateur (taux mesurés, versions parallèles, garanties par display) en gardant ces signatures.
// Le tirage se fait sur le serveur, avec un aléatoire cryptographique : le navigateur ne reçoit que le résultat.
import { cardData } from '../engine/cards/index.ts';
import type { BoosterContent, PulledCard, Rand } from './types.ts';

const SETS = ['OP03'];
export const BOOSTER_SIZE = 12;
export const DISPLAY_SIZE = 24;

// Poids d'une carte selon sa rareté (une C sort 8 fois plus souvent qu'une SR) ; rareté inconnue : comme une SR
const WEIGHTS: Record<string, number> = { C: 8, UC: 4, R: 2, L: 1, SR: 1, SEC: 0.25 };
const weight = (rarity: string) => WEIGHTS[rarity] ?? 1;
// Ordre des cartes dans le paquet : les plus rares à la fin, comme dans un vrai booster
const RANK = ['C', 'UC', 'R', 'L', 'SR', 'SEC'];
const rank = (rarity: string) => (RANK.includes(rarity) ? RANK.indexOf(rarity) : RANK.length);

export const boosterSets = (): string[] => [...SETS];

// Cartes de l'extension (numéros « OP03-... »), dans un ordre fixe pour qu'un même tirage donne le même booster
function pool(set: string): { number: string; rarity: string }[] {
  if (!SETS.includes(set)) throw new Error(`Pas de booster pour l’extension ${set}`);
  const cards = Object.values(cardData()).filter((d) => d.number.startsWith(`${set}-`))
    .map(({ number, rarity }) => ({ number, rarity }))
    .sort((a, b) => a.number.localeCompare(b.number));
  if (!cards.length) throw new Error(`Aucune carte de ${set} : le catalogue des cartes n’est pas chargé`);
  return cards;
}

export function openBooster(set: string, rand: Rand): BoosterContent {
  const left = pool(set);
  const cards: PulledCard[] = [];
  while (cards.length < BOOSTER_SIZE && left.length) {
    let r = rand() * left.reduce((sum, d) => sum + weight(d.rarity), 0);
    let k = 0;
    for (; k < left.length - 1; k++) {
      r -= weight(left[k].rarity);
      if (r < 0) break;
    }
    const [d] = left.splice(k, 1);
    cards.push({ number: d.number, rarity: d.rarity, variant: 'base' });
  }
  cards.sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.number.localeCompare(b.number));
  return { set, cards };
}

export function openDisplay(set: string, rand: Rand): BoosterContent[] {
  return Array.from({ length: DISPLAY_SIZE }, () => openBooster(set, rand));
}
