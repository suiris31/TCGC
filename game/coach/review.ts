// Le coach : analyse après coup des décisions du joueur. Chaque décision est rejouée par simulation (Monte-Carlo,
// avec seulement les informations que le joueur avait) pour estimer ses chances de gagner avec chaque choix possible.
// Le récap en tire les erreurs, les bons choix, les tournants de la partie, des statistiques et des conseils.
import { uselessReason } from '../ai/prune.ts';
import type { Analysis, OptionStat } from '../ai/search.ts';
import { def, fieldCost, findField, handCost, hasType } from '../engine/rules.ts';
import type { GameState, LogEntry, PlayerId } from '../engine/types.ts';

// Une décision du joueur : l'état au moment de choisir (state.decision) et son choix
export interface Move {
  id: number;
  state: GameState;
  choice: string;
}

export interface MoveReview {
  id: number;
  turn: number;
  kind: string;
  tag?: string;
  prompt: string;
  choice: string;
  choiceLabel: string;
  chosenRate: number;
  best: string;
  bestLabel: string;
  bestRate: number;
  delta: number;       // points de victoire perdus par rapport au meilleur choix (0 à 1)
  spread: number;      // écart entre le meilleur choix et le choix médian : importance de la décision
  samples: number;
  stats: OptionStat[];
  useless?: string;    // le choix du joueur ne pouvait rien apporter (attaque trop faible...)
}

// Seuils du coach
export const MISTAKE = 0.1;      // une erreur coûte au moins 10 points de victoire
export const GOOD_SPREAD = 0.12; // un bon choix : la plupart des autres options étaient nettement moins bonnes

// Réglages des simulations du coach : analyse de tes décisions en arrière-plan, et conseil à la demande
export const REVIEW = { samples: 32, budgetMs: 1500, minSamples: 12, refineSamples: 48, refineBudgetMs: 1500, refineMin: 24 };
export const HINT = { samples: 48, budgetMs: 2000, minSamples: 16, refineSamples: 96, refineBudgetMs: 2000, refineMin: 32 };

// Décisions qui valent la peine d'être analysées : un vrai choix entre au moins deux options utiles, ou un choix sans
// intérêt alors qu'il y avait mieux (déclarer un coût est un pari)
export function isReviewable(m: Move, human: PlayerId): boolean {
  const d = m.state.decision;
  if (!d || d.player !== human || d.options.length < 2 || d.tag === 'declareCost') return false;
  const useful = d.options.filter((o) => !uselessReason(m.state, d, o)).length;
  return useful >= 2 || (useful >= 1 && uselessReason(m.state, d, d.options.find((o) => o.id === m.choice)!) !== null);
}

export function toReview(m: Move, a: Analysis): MoveReview {
  const d = m.state.decision!;
  const label = (id: string) => d.options.find((o) => o.id === id)?.label ?? id;
  const chosen = a.stats.find((x) => x.id === m.choice);
  const best = a.stats[0];
  const useless = uselessReason(m.state, d, d.options.find((o) => o.id === m.choice)!) ?? undefined;
  const rates = a.stats.map((x) => x.rate).sort((x, y) => x - y);
  const median = rates[Math.floor((rates.length - 1) / 2)];
  const chosenRate = chosen?.rate ?? 0;
  return {
    id: m.id,
    turn: m.state.turn,
    kind: d.kind,
    tag: d.tag,
    prompt: d.prompt,
    choice: m.choice,
    choiceLabel: label(m.choice),
    chosenRate,
    best: best.id,
    bestLabel: label(best.id),
    bestRate: best.rate,
    delta: Math.max(0, best.rate - chosenRate),
    spread: best.rate - median,
    samples: a.samples,
    stats: a.stats.slice(0, 6).map((x) => ({ ...x, label: label(x.id) })),
    useless,
  };
}

// ---------- Statistiques tirées du journal ----------

export interface SideStats {
  attacks: number;
  hits: number;        // attaques qui ont touché le Leader ou mis un Personnage KO
  repelled: number;
  lifeLost: number;
  counters: number;    // cartes utilisées pour contrer
  blocks: number;
  triggers: number;
  played: number;      // Personnages et Lieux joués
}

export interface GameStats {
  turns: number;
  me: SideStats;
  opp: SideStats;
  lifeByTurn: { turn: number; me: number; opp: number }[];  // Vies restantes à la fin de chaque tour
  unusedDon: { turn: number; don: number }[];               // DON!! non utilisées à la fin de tes tours
}

const emptySide = (): SideStats => ({ attacks: 0, hits: 0, repelled: 0, lifeLost: 0, counters: 0, blocks: 0, triggers: 0, played: 0 });

export function gameStats(final: GameState, moves: Move[], human: PlayerId): GameStats {
  const sides = [emptySide(), emptySide()];
  const life = [def(final.players[0].leader.num).life ?? 5, def(final.players[1].leader.num).life ?? 5];
  const lifeByTurn: GameStats['lifeByTurn'] = [];
  let turn = 0;
  const pushTurn = () => {
    if (turn > 0) lifeByTurn.push({ turn, me: life[human], opp: life[human === 0 ? 1 : 0] });
  };
  for (const l of final.log) {
    if (l.turn !== turn) {
      pushTurn();
      turn = l.turn;
    }
    if (l.player === null || l.only !== undefined) continue;
    const S = sides[l.player];
    const t = l.text;
    if (/\) attaque /.test(t)) S.attacks++;
    else if (t.startsWith("l'attaque touche") || t.startsWith("l'attaque gagne")) S.hits++;
    else if (t.startsWith("l'attaque est repoussée")) S.repelled++;
    if (t.startsWith('perd 1 Vie')) S.lifeLost++;
    if (t.startsWith('perd 1 Vie,')) life[l.player]--;
    const total = /Vie/.test(t) ? t.match(/\((?:il lui (?:en )?reste )?(\d+)(?: Vie)?\)$/) : null;
    if (total) life[l.player] = Number(total[1]);
    const oppLeft = t.match(/il lui reste (\d+) Vie$/);
    if (oppLeft) life[l.player === 0 ? 1 : 0] = Number(oppLeft[1]);
    if (/est ajouté face visible au-dess(us|ous) de la Vie/.test(t)) life[l.player]++;
    if (t.startsWith('contre avec') || / \[Contre\]$/.test(t)) S.counters++;
    if (t.startsWith('bloque avec')) S.blocks++;
    if (t.includes('active son [Déclenchement]')) S.triggers++;
    if (t.startsWith('joue ') && !t.startsWith('joue en premier')) S.played++;
  }
  pushTurn();
  const unusedDon = moves
    .filter((m) => m.state.decision?.kind === 'main' && m.choice === 'end' && m.state.players[human].donActive > 0)
    .map((m) => ({ turn: m.state.turn, don: m.state.players[human].donActive }));
  return { turns: final.turn, me: sides[human], opp: sides[human === 0 ? 1 : 0], lifeByTurn, unusedDon };
}

// ---------- Conseils (règles simples, en plus de l'analyse par simulation) ----------

const leaderName = (s: GameState, p: PlayerId) => def(s.players[p].leader.num).name;

// DON!! à garder pour payer jusqu'à 2 Événements [Contre] de sa main pendant le tour adverse
export function counterReserve(s: GameState, p: PlayerId) {
  const costs = s.players[p].hand.filter((c) => def(c.num).onCounter).map((c) => def(c.num).cost ?? 0).sort((a, b) => a - b);
  return costs.slice(0, 2).reduce((sum, c) => sum + c, 0);
}

export function tips(final: GameState, moves: Move[], human: PlayerId): string[] {
  const out: string[] = [];
  const mains = moves.filter((m) => m.state.decision?.kind === 'main');
  const turnsList = (turns: number[]) => [...new Set(turns)].slice(0, 4).map((t) => `tour ${t}`).join(', ');

  // DON!! laissées inutilisées alors qu'une carte était jouable, en plus de celles gardées pour payer des Événements
  // [Contre] pendant le tour adverse
  const wasted = mains.filter((m) => {
    if (m.choice !== 'end') return false;
    const s = m.state;
    const spare = s.players[human].donActive - counterReserve(s, human);
    if (spare < 2) return false;
    return s.decision!.options.some((o) => {
      const card = s.players[human].hand.find((c) => c.uid === o.uid);
      return (o.id.startsWith('play:') || o.id.startsWith('event:')) && card && handCost(s, human, card) <= spare && !uselessReason(s, s.decision!, o);
    });
  });
  if (wasted.length) {
    out.push(`Tu as fini des tours avec des DON!! inutilisées alors que tu pouvais encore jouer une carte, même en gardant de quoi payer tes Événements [Contre] (${turnsList(wasted.map((m) => m.state.turn))}). Les DON!! non dépensées ne servent qu'à payer des Contres pendant le tour adverse : au-delà, elles sont perdues.`);
  }

  // Leader qui n'attaque pas alors que son attaque pouvait réussir
  const idle = mains.filter((m) => m.choice === 'end' && m.state.decision!.options.some((o) =>
    o.id.startsWith(`attack:${m.state.players[human].leader.uid}:`) && !uselessReason(m.state, m.state.decision!, o)));
  if (idle.length) {
    out.push(`Ton Leader pouvait encore attaquer quand tu as fini ton tour (${turnsList(idle.map((m) => m.state.turn))}). Une attaque du Leader ne coûte rien et oblige l'adversaire à dépenser des Contres.`);
  }

  // Effet [Activation : Principale] du Leader proposé mais jamais utilisé pendant le tour
  const leaderUid = final.players[human].leader.uid;
  const offered = new Map<number, boolean>();
  for (const m of mains) {
    const can = m.state.decision!.options.some((o) => o.id === `act:${leaderUid}`);
    if (can && !offered.has(m.state.turn)) offered.set(m.state.turn, false);
    if (m.choice === `act:${leaderUid}`) offered.set(m.state.turn, true);
  }
  const unusedLeader = [...offered].filter(([, used]) => !used).map(([t]) => t);
  if (unusedLeader.length) {
    out.push(`L'effet de ton Leader ${leaderName(final, human)} était disponible sans être utilisé (${turnsList(unusedLeader)}). Relis-le : c'est souvent le moteur du deck.`);
  }

  // Contres dépensés pour protéger une Vie encore haute
  const lifeCounters = moves.filter((m) => {
    const d = m.state.decision!;
    const b = m.state.battle;
    return d.kind === 'counter' && m.choice !== 'pass' && b && findField(m.state, b.target)?.leader && m.state.players[human].life.length >= 4;
  });
  if (lifeCounters.length >= 3) {
    out.push(`Tu as utilisé ${lifeCounters.length} cartes en Contre pour protéger ta Vie alors qu'il t'en restait 4 ou plus. Au début, perdre une Vie te donne une carte : garde plutôt tes Contres pour la fin de partie ou pour sauver un Personnage important.`);
  }

  // Bloqueur pas utilisé alors que la dernière Vie était en jeu
  const noBlock = moves.filter((m) => m.state.decision?.kind === 'blocker' && m.choice === 'noblock' && m.state.players[human].life.length <= 1
    && findField(m.state, m.state.battle!.target)?.leader);
  if (noBlock.length) {
    out.push(`Avec ${noBlock[0].state.players[human].life.length} Vie, tu n'as pas bloqué une attaque sur ton Leader (tour ${noBlock[0].state.turn}). Quand la partie se joue sur un coup, un [Bloqueur] vaut plus qu'un Personnage.`);
  }

  // Sabo (Leader ST-35) : +1000 à tous avec 1 DON!! sur le Leader et un Personnage de coût 8 ou plus
  if (final.players[human].leader.num === 'OP13-004') {
    const missed = mains.filter((m) => {
      const s = m.state;
      const [kind, uid] = m.choice.split(':');
      return kind === 'attack' && Number(uid) !== s.players[human].leader.uid && s.players[human].leader.don === 0
        && s.players[human].chars.some((c) => hasType(c.num, 'Revolutionary Army') && fieldCost(s, c.uid) >= 8);
    });
    if (missed.length) {
      out.push(`Tu as attaqué avec des Personnages sans DON!! sur Sabo (Leader) alors que tu avais un Personnage de coût 8 (${turnsList(missed.map((m) => m.state.turn))}). Avec 1 DON!! sur Sabo, tous tes Personnages gagnent +1000.`);
    }
  }

  // Kidd (Leader ST-36) : l'effet de fin de tour refusé
  const kiddNo = moves.filter((m) => m.state.decision?.tag === 'mayKiddLeader' && m.choice === 'no');
  if (kiddNo.length) {
    out.push(`Tu as refusé l'effet de fin de tour de Kidd (Leader) (${turnsList(kiddNo.map((m) => m.state.turn))}) : redresser un Personnage qui gagne [Bloqueur] protège ta Vie pendant le tour adverse.`);
  }
  return out;
}

// ---------- Récap ----------

export interface TurningPoint {
  turn: number;
  from: number;
  to: number;
  events: string[];
}

export interface Recap {
  won: boolean;
  reason: string;
  reviewed: number;
  mistakes: MoveReview[];
  good: MoveReview[];
  turning: TurningPoint[];
  curve: { id: number; turn: number; rate: number }[];
  stats: GameStats;
  tips: string[];
}

const KEY_EVENT = /perd 1 Vie|mis KO|touche le Leader|Déclenchement|joue |active |placé|renvoyé|ajoute .* Vie/;

function eventsBetween(log: LogEntry[], from: number, to: number, final: GameState): string[] {
  return log.slice(from, to)
    .filter((l) => l.player !== null && l.only === undefined && KEY_EVENT.test(l.text))
    .slice(-6)
    .map((l) => `${final.players[l.player!].name} ${l.text}`);
}

export function buildRecap(final: GameState, moves: Move[], reviews: Map<number, MoveReview>, human: PlayerId): Recap {
  const done = moves.filter((m) => reviews.has(m.id));
  const list = done.map((m) => reviews.get(m.id)!);
  const mistakes = list.filter((r) => r.delta >= MISTAKE).sort((a, b) => b.delta - a.delta).slice(0, 8);
  const good = list.filter((r) => r.delta <= 0.02 && r.spread >= GOOD_SPREAD && r.samples >= 12).sort((a, b) => b.spread - a.spread).slice(0, 6);

  // Courbe : tes chances de gagner après chacun de tes choix
  const curve = list.map((r) => ({ id: r.id, turn: r.turn, rate: r.chosenRate }));

  // Tournants : grosses chutes de tes chances entre deux de tes décisions, causées par l'adversaire (ses coups, ses
  // Contres, un [Déclenchement]...)
  const turning: TurningPoint[] = [];
  for (let i = 0; i + 1 < done.length; i++) {
    const a = reviews.get(done[i].id)!;
    const b = reviews.get(done[i + 1].id)!;
    const drop = a.chosenRate - b.bestRate;
    const between = final.log.slice(done[i].state.log.length, done[i + 1].state.log.length);
    if (drop >= 0.2 && between.some((l) => l.player !== null && l.player !== human)) {
      turning.push({
        turn: b.turn,
        from: a.chosenRate,
        to: b.bestRate,
        events: eventsBetween(final.log, done[i].state.log.length, done[i + 1].state.log.length, final),
      });
    }
  }
  turning.sort((x, y) => (y.from - y.to) - (x.from - x.to));

  return {
    won: final.winner === human,
    reason: final.winReason ?? '',
    reviewed: list.length,
    mistakes,
    good,
    turning: turning.slice(0, 3),
    curve,
    stats: gameStats(final, moves, human),
    tips: tips(final, moves, human),
  };
}

// Analyse de toute une partie (utilisée par les tests ; l'interface analyse les décisions une à une pendant la partie)
export async function reviewMoves(
  moves: Move[],
  human: PlayerId,
  analyze: (m: Move) => Promise<Analysis>,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, MoveReview>> {
  const todo = moves.filter((m) => isReviewable(m, human));
  const reviews = new Map<number, MoveReview>();
  for (const [i, m] of todo.entries()) {
    reviews.set(m.id, toReview(m, await analyze(m)));
    onProgress?.(i + 1, todo.length);
  }
  return reviews;
}
