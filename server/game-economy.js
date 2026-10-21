// Économie des Berry (onglet Jouer, étape 2 du plan « Aventure ») : porte-monnaie, journal, boutique et gain des
// parties. Tout est calculé ici, d'après le journal (game_ledger) et le barème (game/economy/config.ts) : le navigateur
// ne fait que demander, il n'envoie jamais ni prix ni gain. Jours et semaines : heure de Paris, semaine du lundi.
//   GET  /api/game/wallet                    mon porte-monnaie : solde, bonus du jour, coffre de la semaine, plafond
//   GET  /api/game/wallet/history?before=    mon historique, 20 lignes par page, de la plus récente
//   GET  /api/game/shop                      la vitrine (prix du barème)
//   POST /api/game/shop/buy                  acheter un booster ou un display { set, kind, purchaseId }
//   POST /api/game/rewards/:recordId         le gain d'une partie finie et enregistrée (vérifiée en la rejouant)
import crypto from 'node:crypto';
import zlib from 'node:zlib';
// Les cartes avant le moteur (voir game-verify.js)
import '../game/engine/cards/index.ts';
import { ARCS } from '../game/adventure/arcs.ts';
import { LEVELS } from '../game/ai/search.ts';
import { ECONOMY } from '../game/economy/config.ts';
import { deckErrors } from '../game/engine/deckRules.ts';
import { CUSTOM_SERIES, DECKS, isCustomDeck } from '../game/engine/decks.ts';
import { act } from '../game/engine/engine.ts';
import { rateLimit } from './auth.js';
import { db, getMeta, setMeta, transaction } from './db.js';
import { RECORD_ID } from './game-records.js';
import { checkShape, freshStart, readRecord, refuse, replayGame, requireCards, validList } from './game-verify.js';
import { ENGINE } from './version.js';

// Identifiant d'achat ou d'échange, tiré par le navigateur au clic de confirmation (newOperationId)
export const OPERATION_ID = /^[\w-]{8,64}$/;
const PAGE = 20;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// Ouverture de l'économie : les parties commencées avant ne rapportent rien (pas de rattrapage des anciennes parties)
export const OPENED_KEY = 'economy_opened_at';
if (!getMeta(OPENED_KEY)) setMeta(OPENED_KEY, new Date().toISOString());

// Limites de fréquence de auth.js, avec le refus du contrat de l'économie
function limit(key, max, windowMs) {
  try {
    rateLimit(key, max, windowMs);
  } catch {
    throw refuse('rate_limited', 'Trop de demandes : réessaie dans quelques minutes', 429);
  }
}

// ---------- Jours et semaines (heure de Paris) ----------

const dayParts = new Intl.DateTimeFormat('en-GB', { timeZone: ECONOMY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

// Jour de Paris d'une date : « 2026-10-21 »
export function parisDay(date) {
  const p = Object.fromEntries(dayParts.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const dayIndex = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY;
const dayOf = (index) => new Date(index * DAY).toISOString().slice(0, 10);

// Lundi de la semaine d'un jour
export function weekStart(day) {
  const i = dayIndex(day);
  return dayOf(i - ((new Date(i * DAY).getUTCDay() + 6) % 7));
}

// ---------- Porte-monnaie ----------

// Le porte-monnaie du joueur, créé au premier besoin, mis à jour pour aujourd'hui : la réserve du bonus gagne 1 par
// jour écoulé (ECONOMY.dailyBonus.keepDays au plus), le coffre repart à zéro chaque lundi. À appeler dans une transaction.
function walletRow(userId, now) {
  const day = parisDay(now);
  const week = weekStart(day);
  const at = now.toISOString();
  let row = db.prepare('SELECT * FROM game_wallet WHERE user_id = ?').get(userId);
  if (!row) {
    // un nouveau porte-monnaie commence avec un bonus en réserve
    db.prepare(`INSERT INTO game_wallet (user_id, balance, bonus_reserve, bonus_day, week, week_wins, chest_given, updated_at)
      VALUES (?, 0, 1, ?, ?, 0, 0, ?)`).run(userId, day, week, at);
    return db.prepare('SELECT * FROM game_wallet WHERE user_id = ?').get(userId);
  }
  let changed = false;
  if (row.bonus_day < day) {
    const reserve = Math.min(ECONOMY.dailyBonus.keepDays, row.bonus_reserve + dayIndex(day) - dayIndex(row.bonus_day));
    row = { ...row, bonus_reserve: Math.max(row.bonus_reserve, reserve), bonus_day: day };
    changed = true;
  }
  if (row.week !== week) {
    row = { ...row, week, week_wins: 0, chest_given: 0 };
    changed = true;
  }
  if (changed) {
    db.prepare('UPDATE game_wallet SET bonus_reserve = ?, bonus_day = ?, week = ?, week_wins = ?, chest_given = ?, updated_at = ? WHERE user_id = ?')
      .run(row.bonus_reserve, row.bonus_day, row.week, row.week_wins, row.chest_given, at, userId);
  }
  return row;
}

// Gains de parties du jour (ce que compte le plafond)
const earnedToday = (userId, day) =>
  db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM game_ledger WHERE user_id = ? AND day = ? AND reason = 'partie'").get(userId, day).n;

function walletView(userId, row, now) {
  const { dailyBonus, weeklyChest } = ECONOMY;
  return {
    balance: row.balance,
    dailyBonus: { amount: dailyBonus.amount, reserve: row.bonus_reserve, keep: dailyBonus.keepDays },
    chest: {
      wins: Math.min(row.week_wins, weeklyChest.wins), needed: weeklyChest.wins, boosters: weeklyChest.boosters,
      set: weeklyChest.set, given: Boolean(row.chest_given), weekStart: row.week,
    },
    today: { earned: earnedToday(userId, parisDay(now)), cap: ECONOMY.dailyCap },
  };
}

export function wallet(userId, now = new Date()) {
  return transaction(() => walletView(userId, walletRow(userId, now), now));
}

// ---------- Journal ----------

// Libellé d'une ligne écrite sans libellé
const LABELS = {
  partie: 'Partie', 'bonus-jour': 'Bonus du jour', coffre: 'Coffre de la semaine', chapitre: 'Chapitre gagné',
  doublons: 'Échange de doublons', achat: 'Achat à la boutique', comptoir: 'Comptoir', saison: 'Fin de saison',
  partage: 'Partage', parrainage: 'Parrainage', correction: 'Correction',
};

function toEntry(row) {
  const detail = JSON.parse(row.detail);
  return {
    id: row.id, amount: row.amount, reason: row.reason, ref: row.ref, at: row.at,
    label: typeof detail.label === 'string' ? detail.label : LABELS[row.reason] ?? row.reason,
    ...(detail.boosters ? { boosters: detail.boosters } : {}),
  };
}

const ledgerRow = (userId, reason, ref) =>
  db.prepare('SELECT * FROM game_ledger WHERE user_id = ? AND reason = ? AND ref = ?').get(userId, reason, ref);

// Le seul chemin des Berry : une ligne au journal et le solde qui suit, dans la même transaction. Une raison et une
// référence déjà au journal ne comptent qu'une fois : rien de plus, la ligne existante est renvoyée (already: true).
// Refus 'insufficient_funds' si le solde deviendrait négatif. detail : JSON gardé avec la ligne (label : libellé de
// l'historique, à montrer tel quel ; boosters : boosters donnés par ce mouvement). Renvoie { entry, already }.
export function credit(userId, reason, ref, amount, detail = {}, now = new Date()) {
  if (!Number.isInteger(amount)) throw new Error(`Montant de Berry invalide : ${amount}`);
  if (typeof reason !== 'string' || typeof ref !== 'string' || !reason || !ref) throw new Error('Raison ou référence manquante');
  return transaction(() => {
    const existing = ledgerRow(userId, reason, ref);
    if (existing) return { entry: toEntry(existing), already: true };
    const row = walletRow(userId, now);
    if (row.balance + amount < 0) throw refuse('insufficient_funds', `Il te manque ${-(row.balance + amount)} ฿`, 409);
    const at = now.toISOString();
    const { lastInsertRowid } = db.prepare('INSERT INTO game_ledger (user_id, amount, reason, ref, day, at, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, amount, reason, ref, parisDay(now), at, JSON.stringify(detail));
    db.prepare('UPDATE game_wallet SET balance = balance + ?, updated_at = ? WHERE user_id = ?').run(amount, at, userId);
    return { entry: toEntry(db.prepare('SELECT * FROM game_ledger WHERE id = ?').get(lastInsertRowid)), already: false };
  });
}

export function history(userId, before) {
  const rows = before === undefined
    ? db.prepare('SELECT * FROM game_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, PAGE + 1)
    : db.prepare('SELECT * FROM game_ledger WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(userId, before, PAGE + 1);
  const entries = rows.slice(0, PAGE).map(toEntry);
  return rows.length > PAGE ? { entries, next: entries[PAGE - 1].id } : { entries };
}

// ---------- Boosters donnés (boutique, coffre) ----------

const newBoosterId = () => crypto.randomBytes(12).toString('base64url');

// Boosters de game_boosters (comme ceux des chapitres : ouverts par POST /api/game/boosters/:id/open)
function addBoosters(userId, set, source, ids, at) {
  const insert = db.prepare('INSERT INTO game_boosters (id, user_id, set_code, source, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const id of ids) insert.run(id, userId, set, source, at);
  return ids.map((id) => ({ id, set, source, createdAt: at }));
}

function boostersOf(userId, ids) {
  const get = db.prepare('SELECT * FROM game_boosters WHERE id = ? AND user_id = ?');
  return ids.map((id) => get.get(id, userId)).filter(Boolean)
    .map((row) => ({ id: row.id, set: row.set_code, source: row.source, createdAt: row.created_at }));
}

// ---------- Boutique ----------

export function shop() {
  return { offers: Object.entries(ECONOMY.shop).map(([set, o]) => ({ set, booster: o.booster, display: o.display, boostersPerDisplay: o.boostersPerDisplay })) };
}

// Achat d'un booster ou d'un display : débit et boosters (source « boutique ») dans la même transaction, prix du barème.
// Le même purchaseId renvoie le même achat (already: true), sans rien refaire.
export function buy(userId, set, kind, purchaseId, now = new Date()) {
  if (typeof purchaseId !== 'string' || !OPERATION_ID.test(purchaseId)) throw refuse('bad_request', 'Identifiant d’achat invalide');
  return transaction(() => {
    const done = ledgerRow(userId, 'achat', purchaseId);
    if (done) {
      const detail = JSON.parse(done.detail);
      return { wallet: walletView(userId, walletRow(userId, now), now), spent: -done.amount, boosters: boostersOf(userId, detail.boosterIds ?? []), already: true };
    }
    if (kind !== 'booster' && kind !== 'display') throw refuse('bad_request', 'Achat inconnu : un booster ou un display');
    const offer = typeof set === 'string' && Object.hasOwn(ECONOMY.shop, set) ? ECONOMY.shop[set] : undefined;
    if (!offer) throw refuse('not_found', 'Cette extension n’est pas en vente', 404);
    const price = kind === 'display' ? offer.display : offer.booster;
    const count = kind === 'display' ? offer.boostersPerDisplay : 1;
    const ids = Array.from({ length: count }, newBoosterId);
    const label = kind === 'display' ? `1 display ${set}` : `1 booster ${set}`;
    credit(userId, 'achat', purchaseId, -price, { label, boosters: count, set, kind, boosterIds: ids }, now);
    const boosters = addBoosters(userId, set, 'boutique', ids, now.toISOString());
    return { wallet: walletView(userId, walletRow(userId, now), now), spent: price, boosters };
  });
}

// ---------- Gain d'une partie ----------

const REFUSALS = {
  not_finished: 'Partie pas finie : elle ne rapporte rien pour l’instant',
  too_short: `Partie trop courte (moins de ${ECONOMY.rules.minTurns} tours) : elle ne rapporte rien`,
  too_old: `Partie terminée il y a plus de ${ECONOMY.rules.claimWithinHours} h : elle ne rapporte plus rien`,
  before_economy: 'Partie commencée avant l’ouverture de la boutique : elle ne rapporte rien',
  abandoned: 'Partie abandonnée : elle ne rapporte rien',
  young_opponent: `Le compte de ton adversaire a moins de ${ECONOMY.rules.onlineOpponentMinDays} jours : cette victoire ne rapporte rien`,
};

const refusal = (code, message = REFUSALS[code]) => ({ refused: { code, message } });

// Adversaire d'un chapitre de l'aventure (deck et niveau) : une partie contre lui est une partie « chapitre »
const chapterOpponent = (deck, level) => ARCS.flatMap((arc) => arc.chapters).find((c) => c.opponent.deck === deck && c.opponent.level === level);

// Le deck joué par l'IA : un deck du registre, ou un deck personnalisé dont la liste est dans l'état de départ
function aiSource(rec) {
  const id = rec.config.aiDeck;
  if (typeof id !== 'string') return null;
  if (DECKS[id]) return id;
  const list = rec.initial.players[rec.human === 0 ? 1 : 0]?.list;
  if (!isCustomDeck(id) || !validList(list) || deckErrors(list.leader, list.cards).length) return null;
  return { id, name: '', series: CUSTOM_SERIES, leader: list.leader, cards: list.cards };
}

// Début et fin de partie (dates ISO) : avant l'ouverture de l'économie, ou réclamée trop tard
function datesRefusal(startedAt, endedAt, now) {
  const opened = Date.parse(getMeta(OPENED_KEY));
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started) || started < opened) return refusal('before_economy');
  const ended = Date.parse(endedAt);
  if (!Number.isFinite(ended) || now.getTime() - ended > ECONOMY.rules.claimWithinHours * HOUR) return refusal('too_old');
  return null;
}

// Partie contre l'IA (libre ou chapitre) : rejouée depuis l'enregistrement, coups de l'IA comparés à ceux de son niveau.
// Dates, statut et début sont ceux de l'enregistrement du navigateur : seul le rejeu est sûr (le plafond borne le reste).
function judgeSolo(rec, now) {
  checkShape(rec);
  const { config, human } = rec;
  const level = config.level;
  const chapter = chapterOpponent(config.aiDeck, level);
  const head = { mode: chapter ? 'chapitre' : 'ia', won: rec.status === 'won' };
  if (!LEVELS[level]) return { ...head, ...refusal('not_verified', 'Niveau de l’IA inconnu : partie non vérifiable') };
  if (rec.practice) return { ...head, ...refusal('not_verified', 'Partie reprise d’un moment revu : elle ne rapporte rien') };
  if (rec.status === 'abandoned') return { ...head, ...refusal('abandoned') };
  if (rec.status === 'playing') return { ...head, ...refusal('not_finished') };
  const late = datesRefusal(rec.startedAt, rec.endedAt ?? rec.updatedAt, now);
  if (late) return { ...head, ...late };
  const source = aiSource(rec);
  if (!source || !freshStart(rec, source)) return { ...head, ...refusal('not_verified', 'Partie invalide : elle ne commence pas comme une partie du jeu') };
  const { final, agreement } = replayGame(rec, level);
  const won = final.winner === human;
  if (final.winner === null) return { ...head, won: false, ...refusal('not_finished') };
  if (final.turn < ECONOMY.rules.minTurns) return { ...head, won, ...refusal('too_short') };
  const min = ECONOMY.rules.aiAgreementMin[level];
  if (agreement.forced > 0 || (agreement.free > 0 && agreement.agreed / agreement.free < min)) {
    const changed = rec.engine !== ENGINE ? ' (le programme a peut-être changé depuis la partie)' : '';
    return { ...head, won, ...refusal('ai_mismatch', `Les coups de l’IA ne sont pas ceux du niveau ${LEVELS[level].name} : partie non comptée${changed}`) };
  }
  const against = chapter ? `${chapter.opponent.name} (chapitre)` : `l’IA ${LEVELS[level].name}`;
  return {
    ...head, won, victory: won,
    // le départ d'une partie est unique (mélange tiré au hasard) : la même partie sous un autre identifiant ne
    // rapporte pas deux fois
    game: `depart:${crypto.createHash('sha256').update(JSON.stringify(rec.initial)).digest('base64url')}`,
    base: won ? ECONOMY.ai.win[level] : ECONOMY.ai.loss[level],
    opponent: `ia:${config.aiDeck}:${level}`,
    diminishing: ECONOMY.diminishing.sameAi,
    label: `${won ? 'Victoire' : 'Défaite'} contre ${against}`,
  };
}

// La partie en ligne arbitrée par le serveur (game_matches) qui correspond à l'enregistrement rangé dans « Mes parties »
function findMatch(userId, startedAt) {
  if (typeof startedAt !== 'string') return null;
  const rows = db.prepare(`SELECT data FROM game_matches WHERE (host_id = ? OR guest_id = ?) AND status = 'over'
    AND created_at <= ? AND updated_at >= ?`).all(userId, userId, startedAt, startedAt);
  for (const row of rows) {
    const m = JSON.parse(zlib.gunzipSync(Buffer.from(row.data)).toString('utf8'));
    if (m.startedAt === startedAt && m.initial && m.state) return m;
  }
  return null;
}

// Joueur qui a abandonné (null : partie allée à son terme). Un abandon n'ajoute pas de coup : rejouée, la partie n'a
// pas de vainqueur.
function resignedSeat(m) {
  let natural;
  try {
    let s = m.initial;
    for (const h of m.state.history.slice(m.initial.history.length)) s = act(s, h.choice);
    natural = s.winner !== null;
  } catch {
    natural = !/abandonne la partie$/.test(m.state.winReason ?? '');
  }
  return natural ? null : (m.state.winner === 0 ? 1 : 0);
}

// Partie en ligne : la partie arbitrée par le serveur fait foi, pas l'enregistrement
function judgeOnline(userId, rec, now) {
  const head = { mode: 'en-ligne', won: rec.status === 'won' };
  const m = findMatch(userId, rec.startedAt);
  if (!m) return { ...head, ...refusal('not_verified', 'Partie en ligne introuvable sur le serveur : elle ne rapporte rien') };
  const seat = m.host.userId === userId ? 0 : 1;
  const opp = seat === 0 ? m.guest : m.host;
  const late = datesRefusal(m.startedAt, m.endedAt, now);
  if (late) return { ...head, ...late };
  const won = m.state.winner === seat;
  const resigned = resignedSeat(m);
  if (resigned === seat) return { ...head, won: false, ...refusal('abandoned') };
  const long = m.state.turn >= ECONOMY.rules.minTurns;
  if (resigned === null && !long) return { ...head, won, ...refusal('too_short') };
  if (won) {
    const account = db.prepare('SELECT created_at FROM users WHERE id = ?').get(opp.userId);
    const age = account ? now.getTime() - Date.parse(account.created_at) : 0;
    if (!(age >= ECONOMY.rules.onlineOpponentMinDays * DAY)) return { ...head, won, ...refusal('young_opponent') };
  }
  // l'adversaire a abandonné avant minTurns tours : le gain d'une défaite, sans bonus ni coffre
  const victory = won && long;
  return {
    ...head, won, victory,
    game: `en-ligne:${m.id}`,
    base: victory ? ECONOMY.online.win : ECONOMY.online.loss,
    opponent: `en-ligne:${opp.userId}`,
    diminishing: ECONOMY.diminishing.sameOnlineOpponent,
    label: `${won ? 'Victoire' : 'Défaite'} en ligne contre ${opp.name}${won && !victory ? ' (abandon rapide)' : ''}`,
  };
}

function judge(userId, recordId, now) {
  let rec;
  try {
    rec = readRecord(userId, recordId);
    requireCards();
    return rec?.mode === 'online' ? judgeOnline(userId, rec, now) : judgeSolo(rec, now);
  } catch (err) {
    if (err.code !== 'invalid_game') throw err;
    return { mode: rec?.mode === 'online' ? 'en-ligne' : 'ia', won: rec?.status === 'won', ...refusal('not_verified', err.message) };
  }
}

// Partie déjà récompensée sous un autre identifiant (enregistrement copié)
const sameGame = (userId, game) => db.prepare(`SELECT * FROM game_ledger
  WHERE user_id = ? AND reason = 'partie' AND json_extract(detail, '$.game') = ?`).get(userId, game);

const sameOpponentToday = (userId, day, opponent) => db.prepare(`SELECT COUNT(*) AS n FROM game_ledger
  WHERE user_id = ? AND day = ? AND reason = 'partie' AND json_extract(detail, '$.opponent') = ?`).get(userId, day, opponent).n;

// Gain d'une partie finie : vérifiée, puis barème × gains décroissants, plafond du jour, bonus du jour et coffre de la
// semaine, tous calculés d'après le journal. Une partie refusée n'écrit rien (une nouvelle demande refait les
// vérifications) ; une partie déjà récompensée renvoie le même détail (already: true).
export function claimReward(userId, recordId, now = new Date()) {
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId)) throw refuse('unknown_record', 'Partie introuvable', 404);
  const done = ledgerRow(userId, 'partie', recordId);
  if (done) return { ...JSON.parse(done.detail).reward, wallet: wallet(userId, now), already: true };
  const j = judge(userId, recordId, now);
  const empty = { recordId, mode: j.mode, won: j.won, base: 0, coefficient: 0, sameOpponent: 0, amount: 0, capped: false, dailyBonus: 0, chest: [], total: 0 };
  if (j.refused) return { ...empty, refused: j.refused, wallet: wallet(userId, now) };
  return transaction(() => {
    const again = ledgerRow(userId, 'partie', recordId) ?? sameGame(userId, j.game);
    if (again) return { ...JSON.parse(again.detail).reward, wallet: walletView(userId, walletRow(userId, now), now), already: true };
    const day = parisDay(now);
    const row = walletRow(userId, now);
    const sameOpponent = sameOpponentToday(userId, day, j.opponent);
    const coefficient = j.diminishing[Math.min(sameOpponent, j.diminishing.length - 1)];
    const full = Math.round(j.base * coefficient);
    const room = Math.max(0, ECONOMY.dailyCap - earnedToday(userId, day));
    const amount = Math.min(full, room);
    // bonus du jour et coffre : chaque victoire, même au plafond
    const dailyBonus = j.victory && row.bonus_reserve > 0 ? ECONOMY.dailyBonus.amount : 0;
    const weekWins = row.week_wins + (j.victory ? 1 : 0);
    const chestNow = j.victory && !row.chest_given && weekWins >= ECONOMY.weeklyChest.wins && !ledgerRow(userId, 'coffre', row.week);
    const chestIds = chestNow ? Array.from({ length: ECONOMY.weeklyChest.boosters }, newBoosterId) : [];
    const reward = {
      recordId, mode: j.mode, won: j.won, base: j.base, coefficient, sameOpponent, amount, capped: amount < full,
      dailyBonus, chest: [], total: amount + dailyBonus,
    };
    const at = now.toISOString();
    if (chestNow) {
      reward.chest = addBoosters(userId, ECONOMY.weeklyChest.set, 'coffre', chestIds, at);
      credit(userId, 'coffre', row.week, 0, { label: 'Coffre de la semaine', boosters: chestIds.length, boosterIds: chestIds, record: recordId }, now);
    }
    const label = amount < full ? `${j.label} (plafond du jour atteint)` : j.label;
    credit(userId, 'partie', recordId, amount, { label, opponent: j.opponent, game: j.game, reward }, now);
    if (dailyBonus) credit(userId, 'bonus-jour', recordId, dailyBonus, { label: 'Bonus du jour' }, now);
    db.prepare('UPDATE game_wallet SET bonus_reserve = ?, week_wins = ?, chest_given = ?, updated_at = ? WHERE user_id = ?')
      .run(row.bonus_reserve - (dailyBonus ? 1 : 0), weekWins, row.chest_given || chestNow ? 1 : 0, at, userId);
    return { ...reward, wallet: walletView(userId, walletRow(userId, now), now) };
  });
}

// ---------- Routes (le compte est déjà vérifié par requireUser) ----------

export function economyRoutes(app) {
  app.get('/api/game/wallet', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(wallet(req.user.id));
  });
  app.get('/api/game/wallet/history', (req, res) => {
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (before !== undefined && !(Number.isSafeInteger(before) && before > 0)) throw refuse('bad_request', 'Page d’historique invalide');
    res.setHeader('Cache-Control', 'no-store');
    res.json(history(req.user.id, before));
  });
  app.get('/api/game/shop', (req, res) => {
    res.json(shop());
  });
  app.post('/api/game/shop/buy', (req, res) => {
    limit(`shop-buy:${req.user.id}`, 60, 60_000);
    res.json(buy(req.user.id, req.body?.set, req.body?.kind, req.body?.purchaseId));
  });
  // une réclamation par partie pour un navigateur honnête ; le rejeu occupe le serveur une fraction de seconde
  app.post('/api/game/rewards/:recordId', (req, res) => {
    limit(`rewards:${req.user.id}`, 40, HOUR);
    res.json(claimReward(req.user.id, req.params.recordId));
  });
}
