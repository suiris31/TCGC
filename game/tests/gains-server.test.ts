// Gains de l'aventure côté serveur (tâche 2.5), sur une base temporaire : Berry de la première victoire d'un chapitre
// (raison « chapitre », une seule fois), premières victoires d'avant l'économie créditées une fois au démarrage, coups
// de l'IA d'une partie de chapitre comparés à ceux de son niveau, gain de la même partie réclamé à part (barème de l'IA)
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import type { GameConfig, GameRecord } from '../coach/archive.ts';
import type { GameStats } from '../coach/review.ts';
import { ECONOMY } from '../economy/config.ts';
import type { GameReward } from '../economy/types.ts';
import type { DeckList } from '../engine/decks.ts';
import { act, newGame } from '../engine/engine.ts';
import type { Decision, GameState, PlayerId } from '../engine/types.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-gains-'));
process.env.TCGC_DB = join(dir, 'essai.db');

// modules du serveur (JavaScript) : chemins dans des variables, comme dans decks-server.test.ts
const paths = { db: '../../server/db.js', decks: '../../server/game-decks.js', records: '../../server/game-records.js', economy: '../../server/game-economy.js', adventure: '../../server/game-adventure.js' };
const { db, setMeta } = await import(paths.db);
const decks = await import(paths.decks);
const records = await import(paths.records);
const eco = await import(paths.economy);
const adv = await import(paths.adventure);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const [A, B, C] = [1, 2, 3];
for (const id of [A, B, C]) {
  db.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `joueur${id}`, `joueur${id}@example.invalid`, 'scrypt$essai', '2026-09-01T10:00:00Z');
}
setMeta(eco.OPENED_KEY, '2026-10-15T08:00:00.000Z');

const HUMAN: PlayerId = 0;
const ARC = EAST_BLUE;
const [C1] = [...ARC.chapters].sort((a, b) => a.order - b.order).filter((c) => !c.optional);
const berryOf = (c: typeof C1) => c.rewards.reduce((n, r) => n + (r.kind === 'berry' ? r.amount : 0), 0);
const NOW = new Date('2026-10-20T11:00:00.000Z');

type AiChooser = (s: GameState, d: Decision) => string;
interface Game { initial: GameState; final: GameState }

// Partie jouée par l'IA simple pour le joueur ; l'IA adverse joue `ai` quand elle a le choix
function play(mine: DeckList, aiDeck: string, seed: number, ai: AiChooser): Game {
  const start = newGame({ decks: [mine, aiDeck], names: ['Toi', 'IA'], seed, first: 'random' });
  const initial = JSON.parse(JSON.stringify(start)) as GameState;
  let s = start;
  while (s.winner === null) {
    const d = s.decision!;
    s = act(s, d.player === HUMAN || d.options.length === 1 ? heuristicChooser(s, d) : ai(s, d));
  }
  return { initial, final: s };
}

// Victoire du joueur, l'IA jouant `ai()` (une nouvelle fonction par partie) ; `ok` filtre les parties
function win(mine: DeckList, aiDeck: string, ai: () => AiChooser = () => heuristicChooser, ok: (g: Game) => boolean = () => true, from = 1): Game {
  for (let seed = from; seed < from + 150; seed++) {
    const g = play(mine, aiDeck, seed, ai());
    if (g.final.winner === HUMAN && ok(g)) return g;
  }
  throw new Error('aucune partie gagnée trouvée');
}

// Décisions de l'IA adverse différentes de l'IA simple
function deviations(g: Game) {
  let n = 0;
  let s = g.initial;
  for (const h of g.final.history.slice(g.initial.history.length)) {
    const d = s.decision!;
    if (h.player !== HUMAN && d.options.length > 1 && heuristicChooser(s, d) !== h.choice) n++;
    s = act(s, h.choice);
  }
  return n;
}

let count = 0;
function store(userId: number, g: Game, config: Partial<GameConfig>): string {
  const id = `2026-10-20_12-00-${String(count++).padStart(3, '0')}_essai-gains`;
  const rec: GameRecord = {
    format: 1, id, engine: 'essai', startedAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:30:00.000Z',
    endedAt: '2026-10-20T10:30:00.000Z', status: g.final.winner === HUMAN ? 'won' : 'lost', turns: g.final.turn,
    config: { myDeck: '', aiDeck: C1.opponent.deck, level: C1.opponent.level, first: 'random', ...config },
    human: HUMAN, wentFirst: g.initial.first === HUMAN, initial: g.initial, steps: g.final.history.slice(g.initial.history.length),
    decisions: [], reviews: [], undos: [], stats: {} as GameStats, log: [],
  };
  records.saveRecord(userId, id, rec, JSON.stringify(rec));
  return id;
}

const chapterLines = (userId: number) => db.prepare("SELECT * FROM game_ledger WHERE user_id = ? AND reason = 'chapitre' ORDER BY id").all(userId);

test('gains : chaque chapitre d’East Blue rapporte ses Berry du barème à la première victoire', () => {
  const { firstWin, firstWinFinal, firstWinBonus } = ECONOMY.adventure;
  // défi ultime de Mihawk : le prix d'un display (décision de l'utilisateur, tâche 2.7)
  const expected: Record<string, number> = { 'eb-6-loguetown': firstWinFinal, 'eb-defi-mihawk': ECONOMY.shop.OP03.display, 'eb-defi-baggy': firstWinBonus };
  for (const c of ARC.chapters) {
    assert.deepEqual(c.rewards.filter((r) => r.kind === 'berry'), [{ kind: 'berry', amount: expected[c.id] ?? firstWin }], c.id);
  }
});

test('gains : la première victoire d’un chapitre crédite ses Berry une seule fois, la partie se réclame à part', () => {
  const deckId = adv.startArc(A, ARC.id, NOW).deckId;
  const mine = decks.deckOf(A, deckId);
  const before = eco.wallet(A, NOW).balance;
  const first = store(A, win(mine, C1.opponent.deck), { myDeck: deckId });
  const result = adv.chapterResult(A, C1.id, first, NOW);
  assert.equal(result.firstWin, true);
  assert.deepEqual(result.rewards.filter((r: { kind: string }) => r.kind === 'berry'), [{ kind: 'berry', amount: berryOf(C1) }]);
  const lines = chapterLines(A);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].ref, C1.id);
  assert.equal(lines[0].amount, berryOf(C1));
  assert.equal(JSON.parse(lines[0].detail).label, `Chapitre gagné : ${C1.title}`);
  assert.equal(eco.wallet(A, NOW).balance, before + berryOf(C1));
  // le gain de la partie elle-même : barème de l'IA du chapitre, plus le bonus du jour, indépendant du chapitre
  const reward: GameReward = eco.claimReward(A, first, NOW);
  assert.equal(reward.mode, 'chapitre');
  assert.equal(reward.refused, undefined);
  assert.equal(reward.base, ECONOMY.ai.win[C1.opponent.level]);
  assert.equal(reward.dailyBonus, ECONOMY.dailyBonus.amount);
  assert.equal(reward.wallet.balance, before + berryOf(C1) + reward.total);
  // une autre victoire du chapitre : comptée, sans nouveaux Berry de chapitre ; sa partie rapporte comme une autre
  const again = store(A, win(mine, C1.opponent.deck, undefined, undefined, 200), { myDeck: deckId });
  assert.equal(adv.chapterResult(A, C1.id, again, NOW).firstWin, false);
  assert.equal(chapterLines(A).length, 1);
  assert.equal(eco.claimReward(A, again, NOW).base, ECONOMY.ai.win[C1.opponent.level]);
});

test('gains : une partie de chapitre où l’IA n’a pas joué comme à son niveau ne compte pas', () => {
  const deckId = adv.startArc(B, ARC.id, NOW).deckId;
  const mine = decks.deckOf(B, deckId);
  assert.equal(C1.opponent.level, 1);
  // un seul coup de l'IA différent de l'IA simple (niveau 1 : toutes ses décisions doivent être les siennes)
  const oneOff = (): AiChooser => {
    let n = 0;
    return (s, d) => {
      const h = heuristicChooser(s, d);
      return !d.inEffect && n++ === 3 ? d.options.find((o) => o.id !== h)!.id : h;
    };
  };
  const changed = win(mine, C1.opponent.deck, oneOff, (g) => deviations(g) === 1);
  const id = store(B, changed, { myDeck: deckId });
  assert.throws(() => adv.chapterResult(B, C1.id, id, NOW), (err: { code?: string; message: string }) =>
    err.code === 'ai_mismatch' && /niveau Débutant/.test(err.message));
  assert.equal(adv.adventureState(B).chapters[C1.id].wins, 0);
  assert.equal(chapterLines(B).length, 0);
  assert.equal(adv.adventureState(B).boosters.length, 0);
});

test('gains : les premières victoires d’avant l’économie sont créditées une fois au démarrage', () => {
  // C a gagné deux chapitres avant l'étape 2 (progression sans ligne au journal), A a déjà ses Berry pour C1
  const mihawk = ARC.chapters.find((c) => c.id === 'eb-defi-mihawk')!;
  for (const c of [C1, mihawk]) {
    db.prepare('INSERT INTO game_progress (user_id, chapter, wins, first_win_at) VALUES (?, ?, 1, ?)').run(C, c.id, '2026-10-21T18:00:00.000Z');
  }
  db.prepare("INSERT INTO game_progress (user_id, chapter, wins, first_win_at) VALUES (?, 'chapitre-retire', 1, ?)").run(C, '2026-10-21T18:00:00.000Z');
  const balanceA = eco.wallet(A, NOW).balance;
  assert.equal(adv.creditEarlyChapters(NOW), 2);
  const lines = chapterLines(C);
  assert.deepEqual(lines.map((l: { ref: string; amount: number }) => [l.ref, l.amount]), [[C1.id, berryOf(C1)], [mihawk.id, berryOf(mihawk)]]);
  assert.match(JSON.parse(lines[0].detail).label, /avant l’ouverture de la boutique/);
  assert.equal(eco.wallet(C, NOW).balance, berryOf(C1) + berryOf(mihawk));
  assert.equal(eco.wallet(A, NOW).balance, balanceA);
  // un nouveau démarrage ne donne rien de plus
  assert.equal(adv.creditEarlyChapters(NOW), 0);
  assert.equal(chapterLines(C).length, 2);
});

test('gains : un serveur qui redémarre sur une base avec des victoires d’avant l’économie les crédite', async () => {
  // le crédit se fait au chargement du module (démarrage du serveur) : processus neuf sur une base préparée
  const { DatabaseSync } = await import('node:sqlite');
  const { spawnSync } = await import('node:child_process');
  const file = join(dir, 'demarrage.db');
  const load = `await import(${JSON.stringify(new URL(paths.adventure, import.meta.url).href)})`;
  const run = () => spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', load], { env: { ...process.env, TCGC_DB: file }, encoding: 'utf8' });
  let out = run();
  assert.equal(out.status, 0, out.stderr);
  const base = new DatabaseSync(file);
  base.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (1, ?, ?, ?, ?)').run('ancien', 'ancien@example.invalid', 'scrypt$essai', '2026-09-01T10:00:00Z');
  base.prepare('INSERT INTO game_progress (user_id, chapter, wins, first_win_at) VALUES (1, ?, 1, ?)').run(C1.id, '2026-10-21T18:00:00.000Z');
  out = run();
  assert.equal(out.status, 0, out.stderr);
  out = run();
  assert.equal(out.status, 0, out.stderr);
  const rows = base.prepare("SELECT amount FROM game_ledger WHERE user_id = 1 AND reason = 'chapitre'").all();
  assert.deepEqual(rows.map((r) => r.amount), [berryOf(C1)]);
  assert.equal(base.prepare('SELECT balance FROM game_wallet WHERE user_id = 1').get()?.balance, berryOf(C1));
  base.close();
});
