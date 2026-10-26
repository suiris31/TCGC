// Économie des Berry côté serveur (server/game-economy.js), sur une base temporaire : porte-monnaie et journal (une
// raison et une référence ne comptent qu'une fois, solde jamais négatif), achats (double clic, solde insuffisant,
// achats simultanés), gain des parties contre l'IA et en ligne (vérifiées en les rejouant, coups de l'IA comparés à
// l'IA simple), plafond, bonus du jour gardé 3 jours, coffre de la semaine, gains décroissants, changement de jour et
// de semaine à l'heure de Paris, suppression du compte
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { after, test } from 'node:test';
import { EAST_BLUE } from '../adventure/east-blue.ts';
import { heuristicChooser } from '../ai/heuristic.ts';
import type { GameConfig, GameRecord } from '../coach/archive.ts';
import type { GameStats } from '../coach/review.ts';
import { ECONOMY } from '../economy/config.ts';
import type { GameReward, Purchase, Wallet } from '../economy/types.ts';
import { act, newGame } from '../engine/engine.ts';
import type { Decision, GameState, PlayerId } from '../engine/types.ts';
import { createMatch, joinMatch, play as playOnline, recordFor, resign, type Match } from '../online/match.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-economie-'));
process.env.TCGC_DB = join(dir, 'essai.db');

// modules du serveur (JavaScript) : chemins dans des variables, comme dans decks-server.test.ts
// (express n'a pas de types non plus)
const paths = { express: 'express', db: '../../server/db.js', records: '../../server/game-records.js', economy: '../../server/game-economy.js', adventure: '../../server/game-adventure.js' };
const { db, setMeta, transaction } = await import(paths.db);
const records = await import(paths.records);
const eco = await import(paths.economy);
const adv = await import(paths.adventure);
const { default: express } = await import(paths.express);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// A et B : comptes anciens ; Y : compte créé la veille des parties en ligne
const [A, B, C, Y] = [1, 2, 3, 4];
for (const [id, created] of [[A, '2026-09-01T10:00:00Z'], [B, '2026-09-01T10:00:00Z'], [C, '2026-09-01T10:00:00Z'], [Y, '2026-10-19T10:00:00Z']] as const) {
  db.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `joueur${id}`, `joueur${id}@example.invalid`, 'scrypt$essai', created);
}
// l'économie ouvre le 15 octobre 2026
setMeta(eco.OPENED_KEY, '2026-10-15T08:00:00.000Z');

const HUMAN: PlayerId = 0;
// un deck fort pour le joueur, des adversaires qu'il bat presque toujours (IA simple des deux côtés), un adversaire
// fort pour les défaites
const MINE = 'META-SABO-2026-10';
const FREE = ['ST-01', 'ST-22', 'ST-30', 'ST-34'];
const STRONG = 'META-MIHAWK-2026-10';
const CHAPTER = EAST_BLUE.chapters.find((c) => c.opponent.level === 1)!;
// le mardi 20 octobre 2026 (heure d'été de Paris : UTC+2)
const T = (iso: string) => new Date(iso);
const TUESDAY = '2026-10-20T10:00:00.000Z';

// Choix de l'IA adverse pendant une partie (une nouvelle fonction par partie : elle peut compter ses décisions)
type AiChooser = (s: GameState, d: Decision) => string;
const simple = (): AiChooser => (s, d) => heuristicChooser(s, d);
interface Game { initial: GameState; final: GameState }

// Partie jouée par l'IA simple pour le joueur ; l'IA adverse joue `ai` quand elle a le choix
function playGame(aiDeck: string, seed: number, ai: AiChooser): Game {
  const start = newGame({ decks: [MINE, aiDeck], names: ['Toi', 'IA'], seed, first: 'random' });
  const initial = JSON.parse(JSON.stringify(start)) as GameState;
  let s = start;
  while (s.winner === null) {
    const d = s.decision!;
    s = act(s, d.player === HUMAN || d.options.length === 1 ? heuristicChooser(s, d) : ai(s, d));
  }
  return { initial, final: s };
}

// Décisions de l'IA adverse différentes de l'IA simple (au milieu d'un effet, ou ailleurs)
function deviations(g: Game) {
  const out = { inEffect: 0, other: 0 };
  let s = g.initial;
  for (const h of g.final.history.slice(g.initial.history.length)) {
    const d = s.decision!;
    if (h.player !== HUMAN && d.options.length > 1 && heuristicChooser(s, d) !== h.choice) out[d.inEffect ? 'inEffect' : 'other']++;
    s = act(s, h.choice);
  }
  return out;
}

const seeds = new Map<string, number>();
// Une nouvelle partie (jamais la même graine pour un même deck adverse) gagnée ou perdue par le joueur, qui vérifie `ok`
function find(aiDeck: string, won: boolean, ai: () => AiChooser = simple, ok: (g: Game) => boolean = () => true): Game {
  for (let tries = 0; tries < 150; tries++) {
    const seed = (seeds.get(aiDeck) ?? 0) + 1;
    seeds.set(aiDeck, seed);
    const g = playGame(aiDeck, seed, ai());
    if ((g.final.winner === HUMAN) === won && ok(g)) return g;
  }
  throw new Error(`aucune partie ${won ? 'gagnée' : 'perdue'} trouvée`);
}
const winAgainst = (deck: string) => find(deck, true);

let count = 0;
function makeRecord(g: Game, config: Partial<GameConfig>, extra: Partial<GameRecord> = {}): GameRecord {
  const id = `2026-10-20_12-00-${String(count++).padStart(3, '0')}_essai-economie`;
  return {
    format: 1, id, engine: 'essai', startedAt: TUESDAY, updatedAt: '2026-10-20T10:30:00.000Z',
    endedAt: '2026-10-20T10:30:00.000Z', status: g.final.winner === HUMAN ? 'won' : 'lost', turns: g.final.turn,
    config: { myDeck: MINE, aiDeck: FREE[0], level: 1, first: 'random', ...config },
    human: HUMAN, wentFirst: g.initial.first === HUMAN, initial: g.initial, steps: g.final.history.slice(g.initial.history.length),
    decisions: [], reviews: [], undos: [], stats: {} as GameStats, log: [], ...extra,
  };
}

function store(userId: number, rec: GameRecord): string {
  records.saveRecord(userId, rec.id, rec, JSON.stringify(rec));
  return rec.id;
}

// Partie contre l'IA enregistrée dans le compte : identifiant de la partie
const solo = (userId: number, g: Game, config: Partial<GameConfig>, extra: Partial<GameRecord> = {}) => store(userId, makeRecord(g, config, extra));

const claim = (userId: number, recordId: string, at = '2026-10-20T11:00:00.000Z'): GameReward => eco.claimReward(userId, recordId, T(at));
const walletOf = (userId: number, at = '2026-10-20T11:00:00.000Z'): Wallet => eco.wallet(userId, T(at));
const ledgerSum = (userId: number) => db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM game_ledger WHERE user_id = ?').get(userId).n;
const rows = (table: string, userId: number) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
const boosterRows = (userId: number, source: string) => db.prepare('SELECT COUNT(*) AS n FROM game_boosters WHERE user_id = ? AND source = ?').get(userId, source).n;

test('économie (serveur) : jours et semaines à l’heure de Paris', () => {
  assert.equal(eco.parisDay(T('2026-10-20T21:59:59Z')), '2026-10-20');   // 23 h 59 à Paris
  assert.equal(eco.parisDay(T('2026-10-20T22:00:01Z')), '2026-10-21');   // minuit passé à Paris
  assert.equal(eco.parisDay(T('2026-10-25T22:59:59Z')), '2026-10-25');   // heure d'hiver depuis le 25 : UTC+1
  assert.equal(eco.parisDay(T('2026-10-25T23:00:00Z')), '2026-10-26');
  assert.equal(eco.weekStart('2026-10-19'), '2026-10-19');
  assert.equal(eco.weekStart('2026-10-25'), '2026-10-19');               // dimanche
  assert.equal(eco.weekStart('2026-10-26'), '2026-10-26');               // lundi
  assert.equal(eco.weekStart('2027-01-01'), '2026-12-28');
});

test('économie (serveur) : nouveau porte-monnaie, un seul chemin pour les Berry, jamais négatif', () => {
  assert.deepEqual(walletOf(C), {
    balance: 0,
    dailyBonus: { amount: ECONOMY.dailyBonus.amount, reserve: 1, keep: ECONOMY.dailyBonus.keepDays },
    chest: { wins: 0, needed: ECONOMY.weeklyChest.wins, boosters: ECONOMY.weeklyChest.boosters, set: ECONOMY.weeklyChest.set, given: false, weekStart: '2026-10-19' },
    today: { earned: 0, cap: ECONOMY.dailyCap },
  });
  assert.deepEqual(eco.history(C), { entries: [] });
  const first = eco.credit(C, 'correction', 'essai-1', 150, { label: 'Essai' }, T(TUESDAY));
  assert.equal(first.already, false);
  assert.equal(first.entry.amount, 150);
  assert.equal(first.entry.label, 'Essai');
  // même raison et même référence : rien de plus, la même ligne
  const again = eco.credit(C, 'correction', 'essai-1', 999, {}, T(TUESDAY));
  assert.equal(again.already, true);
  assert.deepEqual(again.entry, first.entry);
  assert.equal(walletOf(C).balance, 150);
  // le solde ne devient jamais négatif
  assert.throws(() => eco.credit(C, 'achat', 'essai-2', -151, {}, T(TUESDAY)), (err: { code: string; status: number; message: string }) =>
    err.code === 'insufficient_funds' && err.status === 409 && err.message === 'Il te manque 1 ฿');
  assert.throws(() => eco.credit(C, 'correction', 'essai-3', 1.5), /Montant/);
  eco.credit(C, 'achat', 'essai-4', -150, {}, T(TUESDAY));
  assert.equal(walletOf(C).balance, 0);
  assert.equal(ledgerSum(C), 0);
  // dans une transaction qui échoue, rien n'est écrit ; un refus rattrapé n'annule pas la transaction autour
  assert.throws(() => transaction(() => {
    eco.credit(C, 'correction', 'essai-5', 40, {}, T(TUESDAY));
    throw new Error('échec');
  }), /échec/);
  assert.equal(walletOf(C).balance, 0);
  transaction(() => {
    eco.credit(C, 'correction', 'essai-6', 40, {}, T(TUESDAY));
    assert.throws(() => eco.credit(C, 'achat', 'essai-7', -100, {}, T(TUESDAY)), /Il te manque 60/);
  });
  assert.equal(walletOf(C).balance, 40);
  assert.equal(ledgerSum(C), 40);
});

test('économie (serveur) : achats au prix du barème, un double clic n’achète pas deux fois', () => {
  const { booster, display, boostersPerDisplay } = ECONOMY.shop.OP03;
  assert.deepEqual(eco.shop(), { offers: [{ set: 'OP03', booster, display, boostersPerDisplay }] });
  eco.credit(A, 'correction', 'depart', display + booster + 50, {}, T(TUESDAY));
  const one: Purchase = eco.buy(A, 'OP03', 'booster', 'achat-0001', T(TUESDAY));
  assert.equal(one.spent, booster);
  assert.equal(one.boosters.length, 1);
  assert.deepEqual(one.boosters[0], { id: one.boosters[0].id, set: 'OP03', source: 'boutique', createdAt: TUESDAY });
  assert.equal(one.wallet.balance, display + 50);
  assert.equal(one.already, undefined);
  // le même identifiant : le même achat, rien de plus
  const twice: Purchase = eco.buy(A, 'OP03', 'display', 'achat-0001', T(TUESDAY));
  assert.equal(twice.already, true);
  assert.deepEqual(twice.boosters, one.boosters);
  assert.equal(twice.spent, booster);
  assert.equal(twice.wallet.balance, display + 50);
  // un display : 24 boosters, dans la Cale (à ouvrir)
  const box: Purchase = eco.buy(A, 'OP03', 'display', 'achat-0002', T(TUESDAY));
  assert.equal(box.boosters.length, boostersPerDisplay);
  assert.equal(box.wallet.balance, 50);
  assert.equal(boosterRows(A, 'boutique'), 1 + boostersPerDisplay);
  assert.ok(box.boosters.every((b) => adv.adventureState(A).boosters.some((x: { id: string }) => x.id === b.id)));
  // solde insuffisant : rien n'est débité, aucun booster
  assert.throws(() => eco.buy(A, 'OP03', 'booster', 'achat-0003', T(TUESDAY)), /Il te manque 50 ฿/);
  assert.equal(walletOf(A).balance, 50);
  assert.equal(boosterRows(A, 'boutique'), 1 + boostersPerDisplay);
  // refus
  assert.throws(() => eco.buy(A, 'OP99', 'booster', 'achat-0004'), (err: { code: string }) => err.code === 'not_found');
  assert.throws(() => eco.buy(A, 'OP03', 'carton', 'achat-0005'), (err: { code: string }) => err.code === 'bad_request');
  assert.throws(() => eco.buy(A, 'OP03', 'booster', 'court'), (err: { code: string }) => err.code === 'bad_request');
  assert.throws(() => eco.buy(A, 'OP03', 'booster', '../achat-0006'), (err: { code: string }) => err.code === 'bad_request');
  // l'historique : du plus récent au plus ancien, libellés du serveur
  const { entries } = eco.history(A);
  assert.deepEqual(entries.slice(0, 2).map((e: { label: string; amount: number; boosters?: number }) => [e.label, e.amount, e.boosters]),
    [['1 display OP03', -display, boostersPerDisplay], ['1 booster OP03', -booster, 1]]);
  assert.equal(ledgerSum(A), walletOf(A).balance);
});

test('économie (serveur) : achats simultanés par les routes, jamais au-delà du solde', async () => {
  const app = express();
  app.use(express.json());
  app.use((req: { user: { id: number } }, _res: unknown, next: () => void) => { req.user = { id: B }; next(); });
  eco.economyRoutes(app);
  app.use((err: { status?: number; code?: string; message: string }, _req: unknown, res: { status: (n: number) => { json: (body: unknown) => void } }, _next: unknown) => {
    res.status(err.status ?? 500).json({ code: err.code, error: err.message });
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/game`;
    const post = (path: string, body?: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    eco.credit(B, 'correction', 'depart', 250);
    // 5 achats différents en même temps avec de quoi en payer 2, et le même achat envoyé 3 fois
    const answers = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => post('shop/buy', { set: 'OP03', kind: 'booster', purchaseId: `simultane-${i}` })),
    ]);
    const statuses = answers.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 200, 409, 409, 409]);
    const refused = await answers.find((r) => r.status === 409)!.json();
    assert.equal(refused.code, 'insufficient_funds');
    const same = await Promise.all(Array.from({ length: 3 }, () => post('shop/buy', { set: 'OP03', kind: 'booster', purchaseId: 'simultane-0' })));
    const bodies = await Promise.all(same.map((r) => r.json()));
    assert.ok(bodies.every((b) => b.wallet.balance === 50));
    let wallet = await (await fetch(`${base}/wallet`)).json();
    assert.equal(wallet.balance, 50);
    assert.equal(boosterRows(B, 'boutique'), 2);
    // routes de lecture
    const shop = await (await fetch(`${base}/shop`)).json();
    assert.equal(shop.offers[0].booster, ECONOMY.shop.OP03.booster);
    const page = await (await fetch(`${base}/wallet/history`)).json();
    assert.equal(page.entries.length, 3);
    assert.equal((await fetch(`${base}/wallet/history?before=abc`)).status, 400);
    assert.equal((await post('rewards/inconnue')).status, 404);
    wallet = await (await fetch(`${base}/wallet`)).json();
    assert.equal(wallet.balance, 50);
  } finally {
    server.close();
  }
});

test('économie (serveur) : l’historique se lit par pages de 20', () => {
  // date fixée : sans elle, le porte-monnaie de C passerait au jour réel et le test des gains décroissants (bonus du
  // « lendemain », 22 octobre 2026) échouerait à partir de ce jour-là
  for (let i = 0; i < 25; i++) eco.credit(C, 'correction', `page-${i}`, 1, { label: `Ligne ${i}` }, T(TUESDAY));
  const first = eco.history(C);
  assert.equal(first.entries.length, 20);
  assert.equal(first.entries[0].label, 'Ligne 24');
  assert.ok(first.next);
  const second = eco.history(C, first.next);
  assert.equal(second.entries[0].label, 'Ligne 4');
  assert.equal(second.next, undefined);
  assert.equal(first.entries.length + second.entries.length, rows('game_ledger', C));
});

test('économie (serveur) : gain d’une partie contre l’IA, bonus du jour, réclamée une seule fois', () => {
  const played = winAgainst(FREE[0]);
  const won = solo(A, played, { aiDeck: FREE[0], level: 1 });
  const before = walletOf(A).balance;
  const r = claim(A, won);
  assert.equal(r.refused, undefined);
  assert.equal(r.mode, 'ia');
  assert.equal(r.won, true);
  assert.equal(r.base, ECONOMY.ai.win[1]);
  assert.equal(r.coefficient, 1);
  assert.equal(r.sameOpponent, 0);
  assert.equal(r.amount, ECONOMY.ai.win[1]);
  assert.equal(r.capped, false);
  assert.equal(r.dailyBonus, ECONOMY.dailyBonus.amount);
  assert.equal(r.total, ECONOMY.ai.win[1] + ECONOMY.dailyBonus.amount);
  assert.deepEqual(r.chest, []);
  assert.equal(r.wallet.balance, before + r.total);
  assert.equal(r.wallet.dailyBonus.reserve, 0);
  assert.equal(r.wallet.chest.wins, 1);
  assert.equal(r.wallet.today.earned, ECONOMY.ai.win[1]);
  // deux fois : le même détail, rien de plus
  const again = claim(A, won);
  assert.equal(again.already, true);
  assert.equal(again.total, r.total);
  assert.equal(again.wallet.balance, r.wallet.balance);
  assert.equal(again.wallet.chest.wins, 1);
  // la même partie copiée sous un autre identifiant : le même détail, rien de plus
  const copied = claim(A, solo(A, played, { aiDeck: FREE[0], level: 1 }));
  assert.equal(copied.already, true);
  assert.equal(copied.recordId, won);
  assert.equal(copied.wallet.balance, r.wallet.balance);
  // l'historique : la partie et le bonus
  const [bonus, game] = eco.history(A).entries;
  assert.deepEqual([bonus.reason, bonus.amount, bonus.ref, bonus.label], ['bonus-jour', ECONOMY.dailyBonus.amount, won, 'Bonus du jour']);
  assert.deepEqual([game.reason, game.amount, game.ref, game.label], ['partie', ECONOMY.ai.win[1], won, 'Victoire contre l’IA Débutant']);
  // une défaite : le gain d'une défaite, pas de bonus ni de victoire de la semaine
  const lost = claim(A, solo(A, find(STRONG, false), { aiDeck: STRONG, level: 1 }));
  assert.equal(lost.won, false);
  assert.equal(lost.amount, ECONOMY.ai.loss[1]);
  assert.equal(lost.dailyBonus, 0);
  assert.equal(lost.wallet.chest.wins, 1);
  assert.equal(ledgerSum(A), lost.wallet.balance);
  // l'adversaire d'un chapitre : mode « chapitre », barème de son niveau
  const chapter = claim(A, solo(A, find(CHAPTER.opponent.deck, true), { aiDeck: CHAPTER.opponent.deck, level: CHAPTER.opponent.level }));
  assert.equal(chapter.mode, 'chapitre');
  assert.equal(chapter.base, ECONOMY.ai.win[CHAPTER.opponent.level]);
  assert.match(eco.history(A).entries[0].label, new RegExp(`contre ${CHAPTER.opponent.name} \\(chapitre\\)`));
  // la partie d'un autre compte : introuvable
  assert.throws(() => claim(B, won), (err: { code: string; status: number }) => err.code === 'unknown_record' && err.status === 404);
  assert.throws(() => claim(A, '../x'), (err: { code: string }) => err.code === 'unknown_record');
});

test('économie (serveur) : parties refusées, sans rien écrire au journal', () => {
  const g = winAgainst(FREE[2]);
  const config = { aiDeck: FREE[2], level: 1 };
  const lines = rows('game_ledger', A);
  const refused = (id: string, at?: string) => claim(A, id, at).refused?.code;
  assert.equal(refused(solo(A, g, config, { status: 'playing', endedAt: undefined })), 'not_finished');
  assert.equal(refused(solo(A, g, config, { steps: g.final.history.slice(0, 40) })), 'not_finished');
  assert.equal(refused(solo(A, g, config, { status: 'abandoned' })), 'abandoned');
  assert.equal(refused(solo(A, g, config, { startedAt: '2026-10-14T10:00:00.000Z' })), 'before_economy');
  assert.equal(refused(solo(A, g, config), '2026-10-22T10:31:00.000Z'), 'too_old');   // 48 h et une minute
  assert.equal(refused(solo(A, g, config, { practice: { from: null, turn: 3 } })), 'not_verified');
  // partie truquée : deck adverse remélangé, coup inventé, autre deck adverse que celui déclaré
  const shuffled = structuredClone(g);
  shuffled.initial.players[1].deck.reverse();
  assert.equal(refused(solo(A, shuffled, config)), 'not_verified');
  const steps = g.final.history.map((h, i) => (i === 10 ? { ...h, choice: 'victoire' } : h));
  const invented = claim(A, solo(A, g, config, { steps }));
  assert.equal(invented.refused?.code, 'not_verified');
  assert.match(invented.refused!.message, /ne se rejoue plus/);
  assert.equal(refused(solo(A, g, { aiDeck: FREE[3], level: 1 })), 'not_verified');
  assert.equal(refused(solo(A, g, { aiDeck: FREE[2], level: 7 })), 'not_verified');
  // partie trop courte
  const minTurns = ECONOMY.rules.minTurns;
  ECONOMY.rules.minTurns = g.final.turn + 1;
  try {
    assert.equal(refused(solo(A, g, config)), 'too_short');
  } finally {
    ECONOMY.rules.minTurns = minTurns;
  }
  // un refus explique pourquoi, sans rien donner
  const r = claim(A, solo(A, g, config, { status: 'abandoned' }));
  assert.deepEqual([r.amount, r.dailyBonus, r.total, r.chest.length], [0, 0, 0, 0]);
  assert.equal(typeof r.refused?.message, 'string');
  assert.equal(r.wallet.balance, walletOf(A).balance);
  assert.equal(rows('game_ledger', A), lines);
  // une partie refusée peut être redemandée : les vérifications sont refaites (et la partie valide compte)
  const late = solo(A, g, config);
  assert.equal(refused(late, '2026-10-22T11:00:00.000Z'), 'too_old');
  assert.equal(claim(A, late).refused, undefined);
});

test('économie (serveur) : les coups de l’IA comparés à l’IA simple selon le niveau', () => {
  const deck = FREE[3];
  // niveau 1 : un seul coup différent de l'IA simple suffit à refuser la partie
  const oneOff = (): AiChooser => {
    let n = 0;
    return (s, d) => {
      const h = heuristicChooser(s, d);
      return !d.inEffect && n++ === 3 ? d.options.find((o) => o.id !== h)!.id : h;
    };
  };
  const changed = find(deck, true, oneOff, (g) => deviations(g).other === 1);
  const r1 = claim(A, solo(A, changed, { aiDeck: deck, level: 1 }));
  assert.equal(r1.refused?.code, 'ai_mismatch');
  assert.match(r1.refused!.message, /niveau Débutant/);
  // niveaux 2 et 3 : un coup différent de temps en temps passe (simulations), pas une IA qui joue au hasard
  assert.equal(claim(A, solo(A, changed, { aiDeck: deck, level: 2 })).refused, undefined);
  const random = (): AiChooser => {
    let k = 7;
    return (s, d) => (d.inEffect ? heuristicChooser(s, d) : d.options[(k = (k * 1103515245 + 12345) & 0x7fffffff) % d.options.length].id);
  };
  const sloppy = find(deck, true, random, (g) => deviations(g).other > 10);
  assert.equal(claim(A, solo(A, sloppy, { aiDeck: deck, level: 3 })).refused?.code, 'ai_mismatch');
  // niveaux 2 et 3 : les décisions au milieu d'un effet sont toujours celles de l'IA simple
  const inEffectOff = (): AiChooser => (s, d) => {
    const h = heuristicChooser(s, d);
    return d.inEffect ? d.options.find((o) => o.id !== h)!.id : h;
  };
  const effect = find(deck, true, inEffectOff, (g) => deviations(g).inEffect > 0);
  assert.equal(claim(A, solo(A, effect, { aiDeck: deck, level: 2 })).refused?.code, 'ai_mismatch');
  // niveau 4 (IA entraînée) : pas vérifiable, seul le plafond protège
  const r4 = claim(A, solo(A, sloppy, { aiDeck: deck, level: 4 }));
  assert.equal(r4.refused, undefined);
  assert.equal(r4.base, ECONOMY.ai.win[4]);
});

test('économie (serveur) : gains décroissants contre le même adversaire, plafond du jour, bonus hors plafond', () => {
  // compte neuf : 6 victoires contre le même deck au même niveau, le mercredi 21
  const day = '2026-10-21T09:00:00.000Z';
  const got = ECONOMY.diminishing.sameAi.map(() => claim(C, solo(C, winAgainst(FREE[0]), { aiDeck: FREE[0], level: 1 }), day));
  assert.deepEqual(got.map((r) => r.coefficient), ECONOMY.diminishing.sameAi);
  assert.deepEqual(got.map((r) => r.sameOpponent), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(got.map((r) => r.amount), ECONOMY.diminishing.sameAi.map((c) => Math.round(ECONOMY.ai.win[1] * c)));
  // un autre niveau ou un autre deck : un autre adversaire
  assert.equal(claim(C, solo(C, winAgainst(FREE[0]), { aiDeck: FREE[0], level: 2 }), day).coefficient, 1);
  // le plafond : il ne reste que quelques Berry à gagner aujourd'hui
  const earned = walletOf(C, day).today.earned;
  eco.credit(C, 'partie', 'essai-plafond', ECONOMY.dailyCap - earned - 4, { opponent: 'essai' }, T(day));
  const reserveBefore = walletOf(C, day).dailyBonus.reserve;
  const near = claim(C, solo(C, winAgainst(FREE[1]), { aiDeck: FREE[1], level: 1 }), day);
  assert.equal(near.amount, 4);
  assert.equal(near.capped, true);
  assert.equal(near.wallet.today.earned, ECONOMY.dailyCap);
  const capped = claim(C, solo(C, winAgainst(FREE[2]), { aiDeck: FREE[2], level: 1 }), day);
  assert.equal(capped.amount, 0);
  assert.equal(capped.capped, true);
  assert.equal(reserveBefore, 0);   // bonus pris par la première victoire du jour
  assert.match(eco.history(C).entries[0].label, /plafond du jour atteint/);
  assert.equal(capped.wallet.today.earned, ECONOMY.dailyCap);
  // le lendemain : plafond, gains décroissants et bonus repartent
  const next = claim(C, solo(C, winAgainst(FREE[0]), { aiDeck: FREE[0], level: 1 }, { startedAt: '2026-10-22T08:00:00.000Z', endedAt: '2026-10-22T08:30:00.000Z' }), '2026-10-22T09:00:00.000Z');
  assert.equal(next.coefficient, 1);
  assert.equal(next.amount, ECONOMY.ai.win[1]);
  assert.equal(next.dailyBonus, ECONOMY.dailyBonus.amount);
  assert.equal(next.wallet.today.earned, ECONOMY.ai.win[1]);
  assert.equal(ledgerSum(C), next.wallet.balance);
});

test('économie (serveur) : bonus du jour gardé 3 jours, au changement de jour de Paris', () => {
  const U = Y;
  // porte-monnaie créé le lundi 19 à 23 h 30 (Paris) : 1 bonus
  assert.equal(walletOf(U, '2026-10-19T21:30:00.000Z').dailyBonus.reserve, 1);
  assert.equal(walletOf(U, '2026-10-19T21:59:00.000Z').dailyBonus.reserve, 1);
  // minuit à Paris (22 h UTC) : un de plus
  assert.equal(walletOf(U, '2026-10-19T22:01:00.000Z').dailyBonus.reserve, 2);
  // plusieurs jours sans jouer : 3 au plus
  assert.equal(walletOf(U, '2026-10-24T10:00:00.000Z').dailyBonus.reserve, ECONOMY.dailyBonus.keepDays);
  // 3 victoires le même jour : 3 bonus, puis plus rien
  const at = '2026-10-24T11:00:00.000Z';
  const bonuses = [FREE[0], FREE[1], FREE[2], FREE[3]].map((deck) => claim(U, solo(U, winAgainst(deck), { aiDeck: deck, level: 1 }, { startedAt: '2026-10-24T10:00:00.000Z', endedAt: '2026-10-24T10:30:00.000Z' }), at).dailyBonus);
  assert.deepEqual(bonuses, [1, 1, 1, 0].map((n) => n * ECONOMY.dailyBonus.amount));
});

test('économie (serveur) : coffre de la semaine à la 3e victoire, une fois, et nouvelle semaine le lundi', () => {
  const U = B;
  const dated = (deck: string, day: string) => solo(U, winAgainst(deck), { aiDeck: deck, level: 1 }, { startedAt: `${day}T10:00:00.000Z`, endedAt: `${day}T10:30:00.000Z` });
  // la défaite ne compte pas, la victoire au plafond si
  const lost = claim(U, solo(U, find(STRONG, false), { aiDeck: STRONG, level: 1 }, { startedAt: '2026-10-22T10:00:00.000Z', endedAt: '2026-10-22T10:30:00.000Z' }), '2026-10-22T11:00:00.000Z');
  assert.equal(lost.wallet.chest.wins, 0);
  const first = claim(U, dated(FREE[0], '2026-10-22'), '2026-10-22T11:00:00.000Z');
  assert.equal(first.wallet.chest.wins, 1);
  eco.credit(U, 'partie', 'essai-plafond-b', ECONOMY.dailyCap, { opponent: 'essai' }, T('2026-10-23T09:00:00.000Z'));
  const second = claim(U, dated(FREE[1], '2026-10-23'), '2026-10-23T11:00:00.000Z');
  assert.equal(second.amount, 0);
  assert.equal(second.wallet.chest.wins, 2);
  assert.deepEqual(second.chest, []);
  // dimanche 25 à 23 h (Paris) : 3e victoire, le coffre
  const third = claim(U, dated(FREE[2], '2026-10-25'), '2026-10-25T22:00:00.000Z');
  assert.equal(third.chest.length, ECONOMY.weeklyChest.boosters);
  for (const b of third.chest) assert.deepEqual([b.set, b.source], [ECONOMY.weeklyChest.set, 'coffre']);
  assert.equal(third.wallet.chest.given, true);
  assert.equal(boosterRows(U, 'coffre'), ECONOMY.weeklyChest.boosters);
  const line = eco.history(U).entries.find((e: { reason: string }) => e.reason === 'coffre');
  assert.deepEqual([line.amount, line.ref, line.boosters], [0, '2026-10-19', ECONOMY.weeklyChest.boosters]);
  // 4e victoire : pas de deuxième coffre cette semaine
  const fourth = claim(U, dated(FREE[3], '2026-10-25'), '2026-10-25T22:30:00.000Z');
  assert.deepEqual(fourth.chest, []);
  assert.equal(boosterRows(U, 'coffre'), ECONOMY.weeklyChest.boosters);
  // lundi 26 (minuit passé à Paris, heure d'hiver) : nouvelle semaine
  const monday = walletOf(U, '2026-10-25T23:00:01.000Z');
  assert.deepEqual([monday.chest.wins, monday.chest.given, monday.chest.weekStart], [0, false, '2026-10-26']);
});

// ---------- En ligne ----------

let online = 0;
const ENGINE = 'essai';

// Partie en ligne jouée par l'IA simple des deux côtés, rangée comme le fait server/game-online.js : la partie
// arbitrée (game_matches) et l'enregistrement dans « Mes parties » de chaque joueur. resignAt : abandon de ce joueur
// au tour donné.
function onlineGame(host: number, guest: number, seed: number, start: string, resignAt?: { seat: PlayerId; turn: number }) {
  const t0 = new Date(start);
  const name = (id: number) => `joueur${id}`;
  const m: Match = createMatch(`match-${online++}`, 'ABCDEF', { userId: host, name: name(host), deck: MINE }, t0, ENGINE);
  joinMatch(m, { userId: guest, name: name(guest), deck: FREE[0] }, t0, seed);
  const end = new Date(t0.getTime() + 20 * 60_000);
  while (m.status === 'playing') {
    const s = m.state!;
    if (resignAt && s.turn >= resignAt.turn) {
      resign(m, resignAt.seat, end);
      break;
    }
    playOnline(m, s.decision!.player, s.history.length, heuristicChooser(s, s.decision!), end);
  }
  db.prepare(`INSERT INTO game_matches (id, code, host_id, guest_id, status, data, created_at, updated_at, expires_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL)`).run(m.id, host, guest, m.status, zlib.gzipSync(JSON.stringify(m)), m.createdAt, m.updatedAt);
  const ids = [0, 1].map((seat) => {
    const rec = recordFor(m, seat as PlayerId, end);
    store(seat === 0 ? host : guest, rec);
    return rec.id;
  });
  return { m, host: ids[0], guest: ids[1] };
}

test('économie (serveur) : partie en ligne, d’après la partie arbitrée par le serveur', () => {
  const at = '2026-10-21T12:00:00.000Z';
  // A contre B, plusieurs fois le même jour : gains décroissants par compte adverse
  const games = [1, 2, 3, 4, 5].map((seed, i) => onlineGame(A, B, seed, `2026-10-21T0${i + 1}:00:00.000Z`));
  for (const g of games) {
    const winner = g.m.state!.winner === 0 ? { user: A, rec: g.host } : { user: B, rec: g.guest };
    const loser = g.m.state!.winner === 0 ? { user: B, rec: g.guest } : { user: A, rec: g.host };
    const w = claim(winner.user, winner.rec, at);
    const l = claim(loser.user, loser.rec, at);
    assert.equal(w.mode, 'en-ligne');
    assert.equal(w.won, true);
    assert.equal(w.base, ECONOMY.online.win);
    assert.equal(l.won, false);
    assert.equal(l.base, ECONOMY.online.loss);
    assert.equal(l.dailyBonus, 0);
  }
  const ofA = eco.history(A, undefined).entries.filter((e: { reason: string; label: string }) => e.reason === 'partie' && /en ligne/.test(e.label));
  assert.equal(ofA.length, games.length);
  // coefficients de A, de la première à la dernière partie contre B
  const coefs = games.map((g) => claim(A, g.host, at).coefficient);
  assert.deepEqual(coefs, [0, 1, 2, 3, 4].map((i) => ECONOMY.diminishing.sameOnlineOpponent[Math.min(i, ECONOMY.diminishing.sameOnlineOpponent.length - 1)]));
  // l'enregistrement du navigateur ne compte pas : un statut changé n'y fait rien
  const g = onlineGame(A, B, 9, '2026-10-21T08:00:00.000Z');
  const loserSeat = g.m.state!.winner === 0 ? 1 : 0;
  const loserId = loserSeat === 0 ? A : B;
  const forged = { ...recordFor(g.m, loserSeat, new Date('2026-10-21T08:30:00.000Z')), id: `${g.host}-faux`, status: 'won' as const };
  store(loserId, forged);
  const r = claim(loserId, forged.id, at);
  assert.equal(r.won, false);
  assert.equal(r.base, ECONOMY.online.loss);
  // puis le vrai enregistrement de la même partie : déjà récompensée
  assert.equal(claim(loserId, loserSeat === 0 ? g.host : g.guest, at).already, true);
  // une partie en ligne inconnue du serveur
  const ghost = { ...forged, id: `${g.host}-fantome`, startedAt: '2026-10-21T08:00:01.000Z' };
  store(loserId, ghost);
  assert.equal(claim(loserId, ghost.id, at).refused?.code, 'not_verified');
});

test('économie (serveur) : en ligne, compte adverse trop jeune et abandons', () => {
  const at = '2026-10-21T12:00:00.000Z';
  // Y a son compte depuis 2 jours : la victoire contre lui ne rapporte rien, la défaite contre lui si
  let seen = false;
  for (let seed = 1; seed < 20 && !seen; seed++) {
    const g = onlineGame(C, Y, seed, `2026-10-21T09:${String(seed).padStart(2, '0')}:00.000Z`);
    const cWon = g.m.state!.winner === 0;
    const rc = claim(C, g.host, at);
    if (cWon) {
      assert.equal(rc.refused?.code, 'young_opponent');
      // Y, perdant, a le gain d'une défaite (C est un vieux compte)
      assert.equal(claim(Y, g.guest, at).base, ECONOMY.online.loss);
      seen = true;
    } else {
      assert.equal(rc.base, ECONOMY.online.loss);
    }
  }
  assert.ok(seen, 'aucune victoire contre le compte trop jeune');
  // abandon au 2e tour : rien pour celui qui abandonne, le gain d'une défaite pour l'autre (sans bonus ni coffre)
  const early = onlineGame(A, C, 3, '2026-10-21T10:00:00.000Z', { seat: 1, turn: 2 });
  assert.equal(claim(C, early.guest, at).refused?.code, 'abandoned');
  const quick = claim(A, early.host, at);
  assert.equal(quick.refused, undefined);
  assert.equal(quick.won, true);
  assert.equal(quick.base, ECONOMY.online.loss);
  assert.equal(quick.dailyBonus, 0);
  assert.match(eco.history(A).entries[0].label, /abandon rapide/);
  // abandon après le 6e tour : une vraie victoire pour l'autre
  let late = onlineGame(A, C, 4, '2026-10-21T10:30:00.000Z', { seat: 1, turn: ECONOMY.rules.minTurns + 1 });
  for (let seed = 5; !late.m.state!.winReason?.endsWith('abandonne la partie'); seed++) {
    late = onlineGame(A, C, seed, `2026-10-21T10:${30 + seed}:00.000Z`, { seat: 1, turn: ECONOMY.rules.minTurns + 1 });
  }
  const full = claim(A, late.host, at);
  assert.equal(full.base, ECONOMY.online.win);
  assert.equal(full.coefficient, ECONOMY.diminishing.sameOnlineOpponent[1]);   // 2e partie contre C aujourd'hui
  assert.equal(claim(C, late.guest, at).refused?.code, 'abandoned');
});

test('économie (serveur) : la suppression du compte efface le porte-monnaie et le journal', () => {
  assert.ok(rows('game_wallet', C) > 0 && rows('game_ledger', C) > 0);
  db.prepare('DELETE FROM users WHERE id = ?').run(C);
  assert.equal(rows('game_wallet', C), 0);
  assert.equal(rows('game_ledger', C), 0);
  assert.ok(rows('game_wallet', A) > 0 && rows('game_ledger', A) > 0);
});

test('économie (serveur) : le module se charge seul, comme module du jeu au démarrage du serveur', () => {
  // voir le même test de adventure-server.test.ts : les cartes avant le moteur
  const out = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `await import(${JSON.stringify(new URL(paths.economy, import.meta.url).href)})`], {
    env: { ...process.env, TCGC_DB: join(dir, 'chargement.db') },
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
});
