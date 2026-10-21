// Vérification d'une partie enregistrée (game_records), commune à l'aventure (game-adventure.js : victoire d'un
// chapitre) et à l'économie (game-economy.js : gain d'une partie). Le serveur ne croit pas l'enregistrement envoyé par
// le navigateur : il vérifie que la partie commence comme une vraie partie du moteur, la rejoue coup par coup et, pour
// les Berry, compare les coups de l'IA à ceux qu'aurait joués l'IA simple (étude 2.1, § 5.3).
import { isDeepStrictEqual } from 'node:util';
import zlib from 'node:zlib';
// Les cartes d'abord : rules.ts et les fichiers de cartes s'importent l'un l'autre, et les fichiers de cartes lisent
// des constantes de rules.ts dès leur chargement. Entrer par le moteur avant les cartes fait planter le démarrage du
// serveur quand ce module est le premier à charger le jeu.
import { cardData } from '../game/engine/cards/index.ts';
import { heuristicChooser } from '../game/ai/heuristic.ts';
import { CUSTOM_SERIES } from '../game/engine/decks.ts';
import { act, newGame } from '../game/engine/engine.ts';
import { RECORD_ID, recordBlob } from './game-records.js';

// Une partie normale fait quelques centaines de coups : au-delà, le rejeu coûterait trop cher au serveur
export const MAX_STEPS = 10_000;
const MAX_JSON = 20 * 1024 * 1024;

export function refuse(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, expose: true });
}

export function invalidGame(detail) {
  return refuse('invalid_game', `Partie invalide : ${detail}`);
}

export function requireCards() {
  if (!Object.keys(cardData()).length) {
    throw refuse('cards_loading', 'Informations des cartes en cours de téléchargement, réessaie dans un instant', 503);
  }
}

// La partie enregistrée du compte, décompressée
export function readRecord(userId, recordId) {
  const blob = typeof recordId === 'string' && RECORD_ID.test(recordId) ? recordBlob(userId, recordId) : null;
  if (!blob) throw refuse('unknown_record', 'Partie introuvable', 404);
  try {
    return JSON.parse(zlib.gunzipSync(blob, { maxOutputLength: MAX_JSON }).toString('utf8'));
  } catch {
    throw invalidGame('enregistrement illisible');
  }
}

export const validList = (list) => list && typeof list === 'object' && typeof list.leader === 'string' && list.cards
  && typeof list.cards === 'object' && Object.values(list.cards).every((n) => Number.isInteger(n) && n > 0 && n <= 50);

// Les champs dont le rejeu a besoin : deux joueurs, des coups, le joueur humain
export function checkShape(rec) {
  if (!rec || typeof rec !== 'object' || !rec.config || typeof rec.config !== 'object') throw invalidGame('enregistrement illisible');
  const { human } = rec;
  if ((human !== 0 && human !== 1) || !Array.isArray(rec.initial?.players) || rec.initial.players.length !== 2
    || !Array.isArray(rec.steps) || !Array.isArray(rec.decisions)) {
    throw invalidGame('enregistrement incomplet');
  }
  if (rec.steps.length > MAX_STEPS) throw invalidGame('trop de coups');
}

// La partie commence exactement comme une partie créée par le moteur avec ces decks : même ordre des cartes mélangées,
// mêmes mains, même premier joueur. Le hasard du moteur avance d'un pas fixe à chaque tirage, et le nombre de tirages
// avant la première décision ne dépend pas du mélange : l'état du hasard au départ donne la graine de la partie.
// aiDeck : identifiant d'un deck du registre, ou liste (deck personnalisé joué par l'IA).
export function freshStart(rec, aiDeck) {
  const { initial, human } = rec;
  const ai = human === 0 ? 1 : 0;
  const names = initial.players.map((p) => p?.name);
  if (!names.every((n) => typeof n === 'string' && n.length <= 40) || !Number.isInteger(initial.rng)) return false;
  const mine = initial.players[human];
  if (!validList(mine?.list)) return false;
  const decks = [];
  decks[human] = { id: mine.deckId, name: '', series: CUSTOM_SERIES, leader: mine.list.leader, cards: mine.list.cards };
  decks[ai] = aiDeck;
  const first = rec.config.first === 'me' ? human : rec.config.first === 'ai' ? ai : 'random';
  try {
    const probe = newGame({ decks, names, first, seed: 0 });
    const fresh = newGame({ decks, names, first, seed: (initial.rng - probe.rng) | 0 });
    return isDeepStrictEqual(JSON.parse(JSON.stringify(fresh)), initial);
  } catch {
    return false;
  }
}

// Rejoue la partie coup par coup (comme replayRecord de game/coach/archive.ts) et renvoie l'état final. Avec `aiLevel`,
// compare aussi chaque décision de l'IA (l'autre joueur que `rec.human`) au choix de l'IA simple :
// - `forced` : décisions qui devaient être celles de l'IA simple et ne le sont pas (toutes au niveau 1 ; aux niveaux 2
//   et 3, les décisions au milieu d'un effet, que l'IA laisse toujours à l'IA simple : voir App.tsx et mcChoose) ;
// - `free` / `agreed` : décisions avec un vrai choix, et parmi elles celles identiques à l'IA simple.
// Les décisions à une seule option ne comptent pas. Le niveau 4 (IA entraînée) n'est pas comparé.
export function replayGame(rec, aiLevel) {
  const ai = rec.human === 0 ? 1 : 0;
  const check = aiLevel === 1 || aiLevel === 2 || aiLevel === 3;
  const agreement = { forced: 0, free: 0, agreed: 0 };
  let s = rec.initial;
  for (const [i, h] of rec.steps.entries()) {
    const d = s.decision;
    if (!d || !h || d.player !== h.player || !d.options.some((o) => o.id === h.choice)) {
      throw invalidGame(`la partie ne se rejoue plus à l’identique à partir du coup ${i + 1} (le programme a changé depuis)`);
    }
    if (check && h.player === ai && d.options.length > 1) {
      const same = heuristicChooser(s, d) === h.choice;
      if (aiLevel === 1 || d.inEffect) {
        if (!same) agreement.forced++;
      } else {
        agreement.free++;
        if (same) agreement.agreed++;
      }
    }
    try {
      s = act(s, h.choice);
    } catch (err) {
      throw invalidGame(err.message);
    }
  }
  return { final: s, agreement };
}
