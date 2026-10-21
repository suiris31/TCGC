// Contrats de l'économie des Berry (tâche 0 de l'étape 2) : ce que renvoient les routes du serveur
// (server/game-economy.js, tâche 2.2) et qu'utilisent les écrans (boutique 2.3, gains 2.5, doublons et comptoir 2.6).
// Les montants sont en Berry (฿), toujours entiers ; les chiffres du barème sont dans config.ts, jamais ailleurs.
// Les « jours » et les « semaines » sont ceux de Paris (ECONOMY.timeZone), la semaine commence le lundi.
import type { Rarity } from './config.ts';
import type { WonBooster } from '../ui/adventure/api.ts';

// Raison d'un mouvement du journal (game_ledger). Une même raison et une même référence ne comptent qu'une fois.
//   partie      gain d'une partie (référence : identifiant de la partie enregistrée)
//   bonus-jour  bonus de la première victoire du jour (référence : la partie qui l'a touché)
//   coffre      coffre de la semaine, 0 ฿ et 2 boosters (référence : lundi de la semaine, « 2026-10-19 »)
//   chapitre    première victoire d'un chapitre (référence : identifiant du chapitre)
//   doublons    échange des doublons (référence : identifiant d'échange choisi par le navigateur)
//   achat       booster ou display (référence : identifiant d'achat choisi par le navigateur), montant négatif
//   comptoir    carte achetée au comptoir (référence : identifiant d'achat), montant négatif
// Plus tard : saison (étape 3), partage et parrainage (étape 4), correction (administrateur).
export type LedgerReason =
  | 'partie' | 'bonus-jour' | 'coffre' | 'chapitre' | 'doublons' | 'achat' | 'comptoir'
  | 'saison' | 'partage' | 'parrainage' | 'correction';

// Le porte-monnaie du joueur, tel que le serveur le calcule maintenant
export interface Wallet {
  balance: number;
  // Bonus de la première victoire du jour : `reserve` bonus attendent (de 0 à `keep`), chacun donne `amount` ฿ à une
  // prochaine victoire. Affichage : « +60 ฿ sur ta prochaine victoire (×2 en réserve) ».
  dailyBonus: { amount: number; reserve: number; keep: number };
  // Coffre de la semaine : `wins` victoires sur `needed` ; `given` : déjà donné cette semaine. weekStart : lundi
  // (« 2026-10-19 »). Affichage : « 2/3 victoires cette semaine ».
  chest: { wins: number; needed: number; boosters: number; set: string; given: boolean; weekStart: string };
  // Gains de parties du jour (ce que compte le plafond) et le plafond
  today: { earned: number; cap: number };
}

// Une ligne de l'historique (du plus récent au plus ancien)
export interface LedgerEntry {
  id: number;
  amount: number;          // positif : gain ; négatif : dépense
  reason: LedgerReason;
  ref: string;
  at: string;              // date ISO
  label: string;           // écrit par le serveur, à montrer tel quel : « Victoire contre l'IA Expert », « 1 display OP03 »
  boosters?: number;       // boosters donnés par ce mouvement (achat, coffre)
}

// GET /api/game/wallet/history?before=<id> : `next` à passer en `before` pour la page suivante (absent : fin)
export interface LedgerPage { entries: LedgerEntry[]; next?: number }

// ---------- Boutique ----------

// GET /api/game/shop : la vitrine, prix lus dans ECONOMY.shop
export interface ShopOffer { set: string; booster: number; display: number; boostersPerDisplay: number }
export interface Shop { offers: ShopOffer[] }

export type PurchaseKind = 'booster' | 'display';

// POST /api/game/shop/buy { set, kind, purchaseId } : les boosters achetés attendent dans la Cale (source « boutique »).
// Le même purchaseId renvoie le même achat avec `already: true` (un double clic n'achète pas deux fois).
export interface Purchase { wallet: Wallet; spent: number; boosters: WonBooster[]; already?: boolean }

// ---------- Comptoir (un exemplaire de plus d'une carte déjà trouvée, jusqu'à ECONOMY.counter.max) ----------

// GET /api/game/shop/counter : les cartes des extensions en vente que le joueur possède déjà (toutes versions
// comptées), avec leur prix ; `owned` >= max : plus rien à acheter pour cette carte
export interface CounterCard { number: string; set: string; rarity: Rarity; price: number; owned: number; max: number }
export interface CounterOffer { cards: CounterCard[] }

// POST /api/game/shop/counter { number, purchaseId } : la carte (version de base) va dans la Cale
export interface CounterPurchase { wallet: Wallet; spent: number; card: { number: string; variant: string; count: number }; already?: boolean }

// ---------- Doublons (au-delà de ECONOMY.duplicates.keep exemplaires, toutes versions) ----------

// Une version échangée : `count` exemplaires de `number` / `variant`, `value` ฿ chacun. Les versions de base partent
// d'abord ; les autres versions (parallèles...) ne partent que si `withVariants` a été demandé.
export interface DuplicateLine { number: string; variant: string; rarity: Rarity; count: number; value: number }

// GET /api/game/duplicates?withVariants=0|1 : aperçu. `stateKey` résume la Cale lue : l'échange le renvoie, et le
// serveur refuse (code 'hold_changed') si la Cale a changé depuis. `decks` : decks d'aventure du joueur qui
// deviendraient incomplets (à dire avant de confirmer).
export interface DuplicatesPreview {
  stateKey: string;
  lines: DuplicateLine[];
  total: number;
  decks: { id: string; name: string }[];
}

// POST /api/game/duplicates/exchange { stateKey, exchangeId, withVariants }
export interface DuplicatesExchange { wallet: Wallet; lines: DuplicateLine[]; total: number; already?: boolean }

// ---------- Gain d'une partie ----------

// Pourquoi une partie ne rapporte rien (ou moins) : le message de `refused` est à montrer tel quel
export type RewardRefusal =
  | 'not_finished'      // partie pas finie
  | 'too_short'         // moins de ECONOMY.rules.minTurns tours
  | 'too_old'           // réclamée plus de ECONOMY.rules.claimWithinHours après sa fin
  | 'before_economy'    // jouée avant l'ouverture de l'économie
  | 'not_verified'      // le rejeu ne donne pas la même partie (ou le programme a changé depuis)
  | 'ai_mismatch'       // les coups de l'IA ne sont pas ceux de son niveau (étude 2.1, § 5.3)
  | 'abandoned'         // le joueur a abandonné
  | 'young_opponent';   // en ligne : compte adverse de moins de ECONOMY.rules.onlineOpponentMinDays jours

// POST /api/game/rewards/:recordId : le détail pour l'écran de fin (« +45 ฿ · bonus du jour +60 ฿ · coffre : 2
// boosters ! »). Réclamer deux fois la même partie renvoie le même détail avec `already: true`, sans rien de plus.
export interface GameReward {
  recordId: string;
  mode: 'ia' | 'chapitre' | 'en-ligne';   // chapitre : partie contre l'adversaire d'un chapitre (barème de l'IA)
  won: boolean;
  base: number;              // barème de la partie (victoire ou défaite, selon le niveau ou le mode)
  coefficient: number;       // gains décroissants (1, 0.5, 0.25, 0)
  sameOpponent: number;      // parties déjà récompensées aujourd'hui contre le même adversaire, avant celle-ci
  amount: number;            // gain de la partie : base × coefficient, arrondi, puis limité par le plafond
  capped: boolean;           // le plafond du jour a réduit ou annulé le gain
  dailyBonus: number;        // bonus du jour touché par cette partie (0 ou ECONOMY.dailyBonus.amount)
  chest: WonBooster[];       // boosters du coffre de la semaine donnés par cette partie (vide le plus souvent)
  total: number;             // amount + dailyBonus
  refused?: { code: RewardRefusal; message: string };   // rien gagné (amount, dailyBonus et total à 0)
  wallet: Wallet;
  already?: boolean;
}
