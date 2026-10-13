// Decks personnalisés tirés au hasard (phase 5) : pour chaque Leader jouable (ou ceux donnés), des decks de 50 cartes
// jouables à ses couleurs, joués par l'IA simple contre les decks du registre, avec contrôle de cohérence à chaque
// décision. Vérifie que n'importe quelle carte jouable marche dans n'importe quel deck (pas seulement celui pour lequel
// elle a été codée), et compte les cartes jamais jouées.
// Avec --hasard, les choix des effets (et une partie des autres) sont tirés au hasard pour explorer plus de chemins, et
// la réponse que donnerait l'IA est vérifiée à chaque décision (elle doit faire partie des choix proposés).
//   node --no-warnings scripts/game/custom-smoke.ts [decks par Leader] [parties par deck] [Leader,Leader...] [--hasard]
import '../../game/data/load-local.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { CARDS, cardStatus, HIDDEN } from '../../game/engine/cards/index.ts';
import { DECK_SIZE, MAX_COPIES, playableErrors } from '../../game/engine/deckRules.ts';
import { CUSTOM_SERIES, DECKS, type DeckList } from '../../game/engine/decks.ts';
import { newGame } from '../../game/engine/engine.ts';
import { invariantErrors } from '../../game/engine/invariants.ts';

const args = process.argv.slice(2);
const randomChoices = args.includes('--hasard');
const [decksArg = '4', gamesArg = '6', leadersArg] = args.filter((a) => a !== '--hasard');
const perLeader = Number(decksArg);
const games = Number(gamesArg);
const playable = Object.keys(CARDS).filter((n) => n !== HIDDEN && cardStatus(n) !== 'todo');
const leaders = leadersArg ? leadersArg.split(',') : playable.filter((n) => CARDS[n].category === 'LEADER');
const opponents = Object.keys(DECKS);

let seed = 20261013;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function randomDeck(leader: string, k: number): DeckList {
  const L = CARDS[leader];
  const pool = playable.filter((n) => {
    const d = CARDS[n];
    return d.category !== 'LEADER' && d.colors.length > 0 && d.colors.every((c) => L.colors.includes(c)) && !L.rules?.deckRestriction?.(d);
  });
  const cards: Record<string, number> = {};
  let total = 0;
  while (total < DECK_SIZE) {
    const n = pool[Math.floor(rand() * pool.length)];
    const add = Math.min(MAX_COPIES - (cards[n] ?? 0), 2 + Math.floor(rand() * 3), DECK_SIZE - total);
    if (add <= 0) continue;
    cards[n] = (cards[n] ?? 0) + add;
    total += add;
  }
  return { id: `PERSO-essai${leader.replace('-', '').toLowerCase()}${k}`, name: `Essai ${L.name} ${k}`, series: CUSTOM_SERIES, leader, cards };
}

const played = new Set<string>();
const inDecks = new Set<string>();
let total = 0;
let failures = 0;
const t0 = Date.now();
for (const leader of leaders) {
  for (let k = 0; k < perLeader; k++) {
    const deck = randomDeck(leader, k);
    const errors = playableErrors(deck.leader, deck.cards);
    if (errors.length) throw new Error(`${deck.name} : ${errors.join(' ; ')}`);
    for (const n of Object.keys(deck.cards)) inDecks.add(n);
    for (let g = 0; g < games; g++) {
      const opp = opponents[Math.floor(rand() * opponents.length)];
      const decks: [DeckList | string, DeckList | string] = g % 2 ? [opp, deck] : [deck, opp];
      const gameSeed = Math.floor(rand() * 2 ** 31);
      try {
        const s = newGame({ decks, names: ['A', 'B'], seed: gameSeed, first: g % 2 ? 1 : 0 }, (st, d) => {
          if (!d.inEffect) {
            const bad = invariantErrors(st);
            if (bad.length) throw new Error(bad.join(' ; '));
          }
          const ai = heuristicChooser(st, d);
          if (!randomChoices) return ai;
          if (!d.options.some((o) => o.id === ai)) throw new Error(`réponse de l'IA hors des choix : ${ai} (${d.tag ?? d.kind})`);
          return d.kind === 'effect' || rand() < 0.3 ? d.options[Math.floor(rand() * d.options.length)].id : ai;
        });
        total++;
        for (const l of s.log) {
          const m = l.text.match(/^(?:joue le Lieu|joue|active l'effet de|active) (.+?)(?: \[| \(|$)/);
          if (m) for (const n of Object.keys(deck.cards)) if (CARDS[n].name === m[1]) played.add(n);
        }
      } catch (err) {
        failures++;
        console.error(`${deck.name} contre ${opp} (graine ${gameSeed}) :`, err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : err);
        console.error(`  liste : ${JSON.stringify(deck.cards)}`);
      }
    }
  }
}
const never = [...inDecks].filter((n) => !played.has(n) && CARDS[n].category !== 'LEADER');
console.log(`${total} parties${randomChoices ? ' (choix au hasard)' : ''} (${leaders.length} Leaders × ${perLeader} decks × ${games} parties) en ${Math.round((Date.now() - t0) / 1000)} s, ${failures} problème(s)`);
console.log(`${inDecks.size} cartes différentes dans les decks, ${never.length} jamais jouées ni activées : ${never.slice(0, 40).join(' ')}`);
if (failures) process.exitCode = 1;
