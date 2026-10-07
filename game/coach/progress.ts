// Progression sur l'ensemble de tes parties : résultats, précision de tes décisions (d'après le coach), erreurs
// récurrentes classées par thème, cartes et habitudes. Utilisé par l'écran « Mes parties » et par `npm run game:analyse`.
//
// Les estimations du coach sont des simulations : une décision isolée peut être mal jugée, mais sur des dizaines de
// parties les tendances (thèmes qui reviennent, précision qui monte ou baisse) sont fiables.
import type { GameSummary, HumanDecision } from './archive.ts';
import { MISTAKE, type MoveReview } from './review.ts';

export const BIG = 0.25;  // grosse erreur : au moins 25 points de victoire perdus

export interface GameRow {
  id: string;
  date: string;
  myDeck: string;
  aiDeck: string;
  level: number;
  wentFirst: boolean;
  status: GameSummary['status'];
  practice: boolean;
  turns: number;
  minutes: number | null;
  reviewed: number;
  mistakes: number;
  big: number;
  accuracy: number | null;  // part de tes décisions analysées sans erreur
  loss: number | null;      // points de victoire perdus en moyenne par décision analysée (0 à 1)
  undos: number;
  mulligan: boolean | null;
}

export function gameRow(r: GameSummary): GameRow {
  const n = r.reviews.length;
  const mistakes = r.reviews.filter((x) => x.delta >= MISTAKE).length;
  const end = r.endedAt ?? r.updatedAt;
  const mulligan = r.decisions.find((d) => d.kind === 'mulligan');
  return {
    id: r.id,
    date: r.startedAt,
    myDeck: r.config.myDeck,
    aiDeck: r.config.aiDeck,
    level: r.config.level,
    wentFirst: r.wentFirst,
    status: r.status,
    practice: Boolean(r.practice),
    turns: r.turns,
    minutes: end ? Math.max(0, (Date.parse(end) - Date.parse(r.startedAt)) / 60000) : null,
    reviewed: n,
    mistakes,
    big: r.reviews.filter((x) => x.delta >= BIG).length,
    accuracy: n ? 1 - mistakes / n : null,
    loss: n ? r.reviews.reduce((s, x) => s + x.delta, 0) / n : null,
    undos: r.undos.length,
    mulligan: mulligan ? mulligan.choice === 'mulligan' : null,
  };
}

// ---------- Thèmes d'erreur ----------

export const AXES = {
  mulligan: {
    title: 'Main de départ',
    advice: 'Garde une main qui pose des Personnages dès tes premiers tours (au moins deux de coût 4 ou moins) ; le guide de ton deck dit quoi viser.',
  },
  endEarly: {
    title: 'Tour terminé trop tôt',
    advice: 'Avant « Fin du tour » : ton Leader peut-il encore attaquer ? Reste-t-il une carte jouable, ou des DON!! qui feraient passer une attaque ?',
  },
  extra: {
    title: 'Action de trop',
    advice: 'Parfois il vaut mieux s’arrêter : garder une carte pour contrer, ne pas épuiser un Bloqueur, ne pas attaquer quand l’attaque ne peut pas passer.',
  },
  attackChoice: {
    title: 'Choix des attaques',
    advice: 'Choisis l’attaquant et la cible : un Personnage épuisé qui menace, ou le Leader quand l’adversaire manque de Contres. Regarde ce que le coach aurait attaqué.',
  },
  donChoice: {
    title: 'Répartition des DON!!',
    advice: 'Donne tes DON!! là où elles font passer une attaque ou activent un effet [DON!! x1], pas là où l’attaque passerait de toute façon.',
  },
  playChoice: {
    title: 'Choix de la carte à jouer',
    advice: 'Pense au tour suivant : quelle carte protège le mieux, laquelle prépare un gros tour, laquelle garder en main pour contrer.',
  },
  order: {
    title: 'Ordre des actions',
    advice: 'L’ordre compte : effets [Jouée] et DON!! avant les attaques qui en profitent, attaques avant de jouer ce qui ne sert qu’en défense.',
  },
  counterMissing: {
    title: 'Contres manquants',
    advice: 'Une attaque qu’il valait mieux contrer : un Personnage important mis KO, ou une Vie perdue quand il en reste peu.',
  },
  counterWasted: {
    title: 'Contres gaspillés',
    advice: 'Tu as contré alors qu’il valait mieux encaisser : tant que ta Vie est haute, perdre une Vie te donne une carte. Garde tes Contres pour la fin.',
  },
  counterChoice: {
    title: 'Choix des cartes de Contre',
    advice: 'Contre avec la carte la moins utile et la valeur juste suffisante ; garde les Personnages que tu voudras jouer.',
  },
  block: {
    title: 'Bloqueurs',
    advice: 'Bloquer protège ta Vie mais expose ton Bloqueur : bloque surtout quand chaque Vie compte, ou pour sauver un Personnage clé.',
  },
  trigger: {
    title: '[Déclenchement]',
    advice: 'Activer l’effet ou prendre la carte en main : regarde ce que l’effet change tout de suite par rapport à une carte de plus en main.',
  },
  effect: {
    title: 'Choix dans les effets',
    advice: 'Cible à mettre KO, carte à chercher ou à défausser : relis l’effet et pense à ce qui menace le plus au tour suivant.',
  },
} as const;

export type AxisKey = keyof typeof AXES;

const typeOf = (id: string) => id.split(':')[0];
const PLAYS = ['play', 'event'];

export function mistakeKind(r: Pick<MoveReview, 'kind' | 'tag' | 'choice' | 'best'>): AxisKey {
  switch (r.kind) {
    case 'mulligan': return 'mulligan';
    case 'counter': return r.choice === 'pass' ? 'counterMissing' : r.best === 'pass' ? 'counterWasted' : 'counterChoice';
    case 'blocker': return 'block';
    case 'effect': return r.tag === 'trigger' ? 'trigger' : 'effect';
    default: {
      const c = typeOf(r.choice);
      const b = typeOf(r.best);
      if (c === 'end') return 'endEarly';
      if (b === 'end') return 'extra';
      if (c === 'attack' && b === 'attack') return 'attackChoice';
      if (c === 'don' && b === 'don') return 'donChoice';
      if (PLAYS.includes(c) && PLAYS.includes(b)) return 'playChoice';
      return 'order';
    }
  }
}

export interface Example {
  game: string;
  date: string;
  myDeck: string;
  aiDeck: string;
  move: number;
  turn: number;
  choice: string;
  best: string;
  delta: number;
  context: string;
}

export interface Axis {
  key: AxisKey;
  title: string;
  advice: string;
  count: number;
  games: number;                 // parties où c'est arrivé
  perGame: number;
  loss: number;                  // total des points de victoire perdus
  recentPerGame: number | null;  // fréquence sur tes dernières parties
  beforePerGame: number | null;  // fréquence sur les précédentes
  examples: Example[];
}

export function situationText(d: HumanDecision | undefined): string {
  if (!d) return '';
  const s = d.sit;
  const parts = [
    `Vies ${s.life[0]} contre ${s.life[1]}`,
    `${s.hand[0]} carte${s.hand[0] > 1 ? 's' : ''} en main`,
    `${s.don[0]} DON!! utilisable${s.don[0] > 1 ? 's' : ''}`,
  ];
  if (s.battle) parts.push(`attaque ${s.battle}`);
  return parts.join(' · ');
}

// ---------- Vue d'ensemble ----------

export interface Group {
  key: string;
  games: number;
  wins: number;
  accuracy: number | null;
}

export interface Period {
  games: number;
  winRate: number | null;
  accuracy: number | null;
  mistakesPerGame: number | null;
}

export interface Habits {
  thinkSec: number | null;          // temps de réflexion médian par décision
  thinkMistakeSec: number | null;   // ... sur tes erreurs
  thinkOtherSec: number | null;     // ... sur tes autres décisions analysées
  undosPerGame: number | null;
  hintShare: number | null;         // part de tes décisions prises avec le conseil du coach affiché
  hintFollow: number | null;        // part des conseils suivis
  mulliganRate: number | null;
  winAfterMulligan: number | null;
  winAfterKeep: number | null;
  unusedDonPerTurn: number | null;  // DON!! laissées inutilisées en fin de tour
  countersPerGame: number | null;
  lifeLostPerGame: number | null;
  lifeTakenPerGame: number | null;
  hitRate: number | null;           // part de tes attaques qui ont réussi
  turnsPerGame: number | null;
  minutesPerGame: number | null;
}

export interface Progress {
  rows: GameRow[];       // toutes les parties, les plus récentes d'abord
  finished: GameRow[];   // parties terminées hors entraînement, dans l'ordre chronologique
  analysed: GameRow[];   // parties avec des décisions analysées hors entraînement, dans l'ordre chronologique
  totals: {
    games: number;
    wins: number;
    losses: number;
    unfinished: number;
    practice: number;
    winRate: number | null;
    accuracy: number | null;
    loss: number | null;
    mistakesPerGame: number | null;
    decisions: number;
  };
  recent: Period | null;  // tes dernières parties...
  before: Period | null;  // ... comparées aux précédentes
  series: { win: number[]; winRolling: number[]; accuracy: number[]; accuracyRolling: number[]; mistakes: number[] };
  matchups: Group[];
  decks: Group[];
  levels: Group[];
  first: Group[];
  axes: Axis[];
  cards: { num: string; count: number; loss: number }[];
  habits: Habits;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ratio = (a: number, b: number) => (b ? a / b : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function rolling(xs: number[], w: number): number[] {
  return xs.map((_, i) => mean(xs.slice(Math.max(0, i - w + 1), i + 1))!);
}

// Dernières parties (jusqu'à 10, la moitié au plus) et parties précédentes, à partir de 6 parties
function split<T>(xs: T[]): { before: T[]; recent: T[] } | null {
  if (xs.length < 6) return null;
  const k = Math.min(10, Math.floor(xs.length / 2));
  return { before: xs.slice(0, -k), recent: xs.slice(-k) };
}

function pooledAccuracy(rows: GameRow[]): number | null {
  const n = rows.reduce((s, r) => s + r.reviewed, 0);
  return n ? 1 - rows.reduce((s, r) => s + r.mistakes, 0) / n : null;
}

function groups(rows: GameRow[], analysed: GameRow[], key: (r: GameRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const g = map.get(key(r)) ?? { key: key(r), games: 0, wins: 0, accuracy: null };
    g.games++;
    if (r.status === 'won') g.wins++;
    map.set(g.key, g);
  }
  for (const g of map.values()) g.accuracy = pooledAccuracy(analysed.filter((r) => key(r) === g.key));
  return [...map.values()].sort((a, b) => b.games - a.games);
}

export function progress(records: GameSummary[]): Progress {
  const byDate = [...records].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const rowOf = new Map(byDate.map((r) => [r.id, gameRow(r)]));
  const rows = byDate.map((r) => rowOf.get(r.id)!);
  const real = byDate.filter((r) => !r.practice);
  const finishedRecs = real.filter((r) => r.status === 'won' || r.status === 'lost');
  const analysedRecs = real.filter((r) => r.reviews.length > 0);
  const finished = finishedRecs.map((r) => rowOf.get(r.id)!);
  const analysed = analysedRecs.map((r) => rowOf.get(r.id)!);
  const wins = finished.filter((r) => r.status === 'won').length;
  const decisions = analysed.reduce((s, r) => s + r.reviewed, 0);
  const mistakes = analysed.reduce((s, r) => s + r.mistakes, 0);

  const period = (fin: GameRow[], ana: GameRow[]): Period => ({
    games: Math.max(fin.length, ana.length),
    winRate: ratio(fin.filter((r) => r.status === 'won').length, fin.length),
    accuracy: pooledAccuracy(ana),
    mistakesPerGame: mean(ana.map((r) => r.mistakes)),
  });
  const fs = split(finished);
  const as = split(analysed);
  const recent = fs || as ? period(fs?.recent ?? [], as?.recent ?? []) : null;
  const before = fs || as ? period(fs?.before ?? [], as?.before ?? []) : null;

  const win = finished.map((r) => (r.status === 'won' ? 1 : 0));
  const accuracy = analysed.map((r) => r.accuracy!);

  // Thèmes d'erreur
  const recentIds = new Set((as?.recent ?? []).map((r) => r.id));
  const beforeIds = new Set((as?.before ?? []).map((r) => r.id));
  const acc = new Map<AxisKey, { count: number; loss: number; games: Set<string>; recent: number; before: number; examples: Example[] }>();
  const cards = new Map<string, { count: number; loss: number }>();
  for (const r of analysedRecs) {
    const byMove = new Map(r.decisions.map((d) => [d.move, d]));
    for (const rv of r.reviews) {
      if (rv.delta < MISTAKE) continue;
      const key = mistakeKind(rv);
      const a = acc.get(key) ?? { count: 0, loss: 0, games: new Set<string>(), recent: 0, before: 0, examples: [] };
      const d = byMove.get(rv.id);
      a.count++;
      a.loss += rv.delta;
      a.games.add(r.id);
      if (recentIds.has(r.id)) a.recent++;
      if (beforeIds.has(r.id)) a.before++;
      a.examples.push({
        game: r.id, date: r.startedAt, myDeck: r.config.myDeck, aiDeck: r.config.aiDeck, move: rv.id, turn: rv.turn,
        choice: rv.choiceLabel, best: rv.bestLabel, delta: rv.delta, context: situationText(d),
      });
      acc.set(key, a);
      const num = d?.card ?? d?.bestCard;
      if (num) {
        const c = cards.get(num) ?? { count: 0, loss: 0 };
        c.count++;
        c.loss += rv.delta;
        cards.set(num, c);
      }
    }
  }
  const axes: Axis[] = [...acc].map(([key, a]) => {
    // exemples : les erreurs les plus coûteuses, une par partie d'abord, les plus récentes à coût égal
    const sorted = [...a.examples].sort((x, y) => y.delta - x.delta || y.date.localeCompare(x.date));
    const seen = new Set<string>();
    const firsts = sorted.filter((e) => !seen.has(e.game) && Boolean(seen.add(e.game)));
    const examples = [...firsts, ...sorted.filter((e) => !firsts.includes(e))].slice(0, 3);
    return {
      key,
      ...AXES[key],
      count: a.count,
      games: a.games.size,
      perGame: a.count / analysed.length,
      loss: a.loss,
      recentPerGame: as ? a.recent / as.recent.length : null,
      beforePerGame: as ? a.before / as.before.length : null,
      examples,
    };
  }).sort((x, y) => y.loss - x.loss);

  // Habitudes
  const own = real.flatMap((r) => r.decisions.map((d) => ({ d, rv: r.reviews.find((x) => x.id === d.move) })));
  const think = own.filter((x) => x.d.ms !== undefined).map((x) => ({ ms: Math.min(x.d.ms!, 300_000), rv: x.rv }));
  const reviewedOwn = own.filter((x) => x.rv);
  const hinted = reviewedOwn.filter((x) => x.d.hint);
  const mulled = finished.filter((r) => r.mulligan === true);
  const kept = finished.filter((r) => r.mulligan === false);
  const myTurns = finishedRecs.reduce((s, r) => s + (r.wentFirst ? Math.ceil(r.turns / 2) : Math.floor(r.turns / 2)), 0);
  const attacks = finishedRecs.reduce((s, r) => s + r.stats.me.attacks, 0);
  const habits: Habits = {
    thinkSec: median(think.map((x) => x.ms / 1000)),
    thinkMistakeSec: median(think.filter((x) => x.rv && x.rv.delta >= MISTAKE).map((x) => x.ms / 1000)),
    thinkOtherSec: median(think.filter((x) => x.rv && x.rv.delta < MISTAKE).map((x) => x.ms / 1000)),
    undosPerGame: mean(real.map((r) => r.undos.length)),
    hintShare: ratio(hinted.length, reviewedOwn.length),
    hintFollow: ratio(hinted.filter((x) => x.d.hint === x.d.choice).length, hinted.length),
    mulliganRate: ratio(mulled.length, mulled.length + kept.length),
    winAfterMulligan: ratio(mulled.filter((r) => r.status === 'won').length, mulled.length),
    winAfterKeep: ratio(kept.filter((r) => r.status === 'won').length, kept.length),
    unusedDonPerTurn: ratio(finishedRecs.reduce((s, r) => s + r.stats.unusedDon.reduce((n, u) => n + u.don, 0), 0), myTurns),
    countersPerGame: mean(finishedRecs.map((r) => r.stats.me.counters)),
    lifeLostPerGame: mean(finishedRecs.map((r) => r.stats.me.lifeLost)),
    lifeTakenPerGame: mean(finishedRecs.map((r) => r.stats.opp.lifeLost)),
    hitRate: ratio(finishedRecs.reduce((s, r) => s + r.stats.me.hits, 0), attacks),
    turnsPerGame: mean(finished.map((r) => r.turns)),
    minutesPerGame: mean(finished.filter((r) => r.minutes !== null).map((r) => r.minutes!)),
  };

  const levelName = ['', 'Débutant', 'Confirmé', 'Expert'];
  return {
    rows: [...rows].reverse(),
    finished,
    analysed,
    totals: {
      games: finished.length,
      wins,
      losses: finished.length - wins,
      unfinished: real.length - finished.length,
      practice: byDate.length - real.length,
      winRate: ratio(wins, finished.length),
      accuracy: ratio(decisions - mistakes, decisions),
      loss: decisions ? analysed.reduce((s, r) => s + r.loss! * r.reviewed, 0) / decisions : null,
      mistakesPerGame: mean(analysed.map((r) => r.mistakes)),
      decisions,
    },
    recent,
    before,
    series: { win, winRolling: rolling(win, 10), accuracy, accuracyRolling: rolling(accuracy, 5), mistakes: analysed.map((r) => r.mistakes) },
    matchups: groups(finished, analysed, (r) => `${r.myDeck}|${r.aiDeck}`),
    decks: groups(finished, analysed, (r) => r.myDeck),
    levels: groups(finished, analysed, (r) => levelName[r.level] ?? String(r.level)),
    first: groups(finished, analysed, (r) => (r.wentFirst ? 'Tu commences' : 'L’IA commence')),
    axes,
    cards: [...cards].map(([num, c]) => ({ num, ...c })).sort((a, b) => b.loss - a.loss).slice(0, 8),
    habits,
  };
}
