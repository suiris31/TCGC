// game/economy/config.ts : le barème des Berry (étude 2.1 du plan « Aventure », validée par l'utilisateur).
// Un seul endroit pour tous les chiffres de l'économie. Montants en Berry (฿), toujours entiers.
import type { Level } from '../ai/search.ts';

export type Rarity = 'L' | 'C' | 'UC' | 'R' | 'SR' | 'SEC';

export interface EconomyConfig {
  version: number;
  /** Les « jours » (bonus, plafond, gains décroissants) et les « semaines » (coffre, du lundi au dimanche). */
  timeZone: string;
  /** Boutique, par extension : prix d'un booster, d'un display, et nombre de boosters d'un display. */
  shop: Record<string, { booster: number; display: number; boostersPerDisplay: number }>;
  /** Partie contre l'IA (partie libre, ou chapitre d'aventure déjà gagné), selon le niveau de l'IA. */
  ai: { win: Record<Level, number>; loss: Record<Level, number> };
  /** Partie en ligne (libre ; le classé de l'étape 3 rapporte la même chose, plus les récompenses de saison). */
  online: { win: number; loss: number };
  /** Première victoire d'un chapitre, en plus de ses boosters et recrues (étape 1). */
  adventure: { firstWin: number; firstWinFinal: number; firstWinBonus: number };
  /** Bonus de la première victoire du jour ; chaque jour en ajoute un à la réserve, qui en garde au plus `keepDays`. */
  dailyBonus: { amount: number; keepDays: number };
  /** Coffre de la semaine : `wins` victoires dans la semaine (tous modes) donnent `boosters` boosters de `set`. */
  weeklyChest: { wins: number; boosters: number; set: string };
  /** Plafond par jour des gains de parties (IA, en ligne, chapitres rejoués). Hors bonus du jour, coffre, premières
   *  victoires de l'aventure, doublons et récompenses de saison. */
  dailyCap: number;
  /** Gains décroissants dans la journée : coefficient selon le nombre de parties déjà récompensées contre le même
   *  adversaire (IA : même deck et même niveau ; en ligne : même compte). Le dernier coefficient vaut pour la suite. */
  diminishing: { sameAi: number[]; sameOnlineOpponent: number[] };
  rules: {
    /** Une partie ne rapporte que si elle a duré au moins ce nombre de tours (les deux joueurs comptés). */
    minTurns: number;
    /** Délai pour réclamer la récompense d'une partie, après sa fin. */
    claimWithinHours: number;
    /** En ligne : l'adversaire doit avoir un compte d'au moins ce nombre de jours pour que la victoire rapporte. */
    onlineOpponentMinDays: number;
    /** Contre l'IA : part minimale des décisions de l'IA identiques à celles de l'IA simple (vérification au rejeu). */
    aiAgreementMin: Record<Level, number>;
  };
  /** Doublons : au-delà de `keep` exemplaires d'une carte (toutes versions), échangés sur demande contre des Berry. */
  duplicates: { keep: number; value: Record<Rarity, number> };
  /** Comptoir : acheter un exemplaire de plus d'une carte déjà trouvée (`onlyFound`), jusqu'à `max` exemplaires. */
  counter: { onlyFound: boolean; max: number; price: Record<Rarity, number> };
  /** Étapes suivantes : montants provisoires, à confirmer par l'étude 3.1 et la tâche 0 de l'étape 4. */
  later: {
    seasonEnd: { kingOfPirates: number; emperor: number; supernova: number; warlord: number; tenRankedGames: number };
    share: { amount: number; perDay: number };
    referral: { amount: number; perMonth: number };
  };
}

export const ECONOMY: EconomyConfig = {
  version: 1,
  timeZone: 'Europe/Paris',
  shop: {
    OP03: { booster: 100, display: 2000, boostersPerDisplay: 24 },
  },
  ai: {
    win: { 1: 10, 2: 25, 3: 45, 4: 70 },
    loss: { 1: 3, 2: 8, 3: 12, 4: 15 },
  },
  online: { win: 90, loss: 30 },
  adventure: { firstWin: 200, firstWinFinal: 400, firstWinBonus: 300 },
  dailyBonus: { amount: 60, keepDays: 3 },
  weeklyChest: { wins: 3, boosters: 2, set: 'OP03' },
  dailyCap: 300,
  diminishing: {
    sameAi: [1, 1, 1, 0.5, 0.5, 0.25],
    sameOnlineOpponent: [1, 0.5, 0.25, 0],
  },
  rules: {
    minTurns: 6,
    claimWithinHours: 48,
    onlineOpponentMinDays: 3,
    aiAgreementMin: { 1: 1, 2: 0.6, 3: 0.6, 4: 0 },
  },
  duplicates: { keep: 4, value: { L: 3, C: 1, UC: 1, R: 3, SR: 30, SEC: 100 } },
  counter: { onlyFound: true, max: 4, price: { L: 150, C: 10, UC: 25, R: 60, SR: 500, SEC: 1500 } },
  later: {
    seasonEnd: { kingOfPirates: 3000, emperor: 2000, supernova: 1200, warlord: 800, tenRankedGames: 300 },
    share: { amount: 20, perDay: 1 },
    referral: { amount: 500, perMonth: 5 },
  },
};
