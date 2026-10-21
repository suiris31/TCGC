// Comptoir et doublons côté serveur (server/game-economy.js, tâche 2.6), sur une base temporaire : le comptoir ne vend
// que des cartes déjà trouvées des extensions en vente, jusqu'à 4 exemplaires, au prix du barème ; l'échange des doublons
// prend d'abord les versions de base, garde les versions spéciales sauf demande, se fait sur la Cale de l'aperçu, ne
// compte qu'une fois, et signale les decks d'aventure qui deviendraient incomplets
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ECONOMY } from '../economy/config.ts';
import type { CounterOffer, DuplicatesPreview } from '../economy/types.ts';
import { cardData } from '../engine/cards/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-comptoir-'));
process.env.TCGC_DB = join(dir, 'essai.db');

// modules du serveur (JavaScript) : chemins dans des variables, comme dans decks-server.test.ts
const paths = { express: 'express', db: '../../server/db.js', economy: '../../server/game-economy.js' };
const { db } = await import(paths.db);
const eco = await import(paths.economy);
const { default: express } = await import(paths.express);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const [A, B, C, D] = [1, 2, 3, 4];
for (const id of [A, B, C, D]) {
  db.prepare('INSERT INTO users (id, pseudo, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `joueur${id}`, `joueur${id}@example.invalid`, 'scrypt$essai', '2026-09-01T10:00:00Z');
}

// Cartes d'OP03 d'après la description de ses boosters, et des cartes d'ailleurs
const LEADER = 'OP03-001';        // L
const COMMON = 'OP03-004';        // C
const UNCOMMON = 'OP03-002';      // UC
const RARE = 'OP03-003';          // R
const SUPER = 'OP03-013';         // SR (a une version parallèle)
const SECRET = 'OP03-123';        // SEC
const STARTER = 'ST01-001';       // pas d'une extension en vente
const PROMO = 'P-044';            // sans valeur au barème
const price = ECONOMY.counter.price;
const value = ECONOMY.duplicates.value;

function hold(userId: number, cards: [string, string, number][]) {
  const put = db.prepare(`INSERT INTO game_inventory (user_id, number, variant, count) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, number, variant) DO UPDATE SET count = excluded.count`);
  for (const [number, variant, count] of cards) put.run(userId, number, variant, count);
}
const holdOf = (userId: number) => Object.fromEntries(
  (db.prepare('SELECT number, variant, count FROM game_inventory WHERE user_id = ?').all(userId) as { number: string; variant: string; count: number }[])
    .map((r) => [`${r.number}|${r.variant}`, r.count]));
const balance = (userId: number) => eco.wallet(userId).balance as number;
const ledgerSum = (userId: number) => (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM game_ledger WHERE user_id = ?').get(userId) as { n: number }).n;
const ledgerRows = (userId: number, reason: string) => (db.prepare('SELECT COUNT(*) AS n FROM game_ledger WHERE user_id = ? AND reason = ?').get(userId, reason) as { n: number }).n;

function refused(fn: () => unknown, code: string, status: number, message?: RegExp) {
  assert.throws(fn, (err: { code?: string; status?: number; message: string }) => {
    assert.equal(err.code, code);
    assert.equal(err.status, status);
    if (message) assert.match(err.message, message);
    return true;
  });
}

test('comptoir (serveur) : seulement les cartes déjà trouvées des extensions en vente, au prix du barème', () => {
  hold(A, [[LEADER, 'base', 1], [SUPER, 'base', 1], [SUPER, 'parallele', 1], [SECRET, 'base', 4], [STARTER, 'base', 1], [PROMO, 'base', 2]]);
  const offer: CounterOffer = eco.counterOffer(A);
  const byNumber = Object.fromEntries(offer.cards.map((c) => [c.number, c]));
  assert.deepEqual(Object.keys(byNumber).sort(), [LEADER, SUPER, SECRET].sort());
  assert.deepEqual(byNumber[LEADER], { number: LEADER, set: 'OP03', rarity: 'L', price: price.L, owned: 1, max: ECONOMY.counter.max });
  // toutes versions comptées
  assert.equal(byNumber[SUPER].owned, 2);
  assert.equal(byNumber[SUPER].price, price.SR);
  assert.equal(byNumber[SECRET].owned, 4);
  assert.deepEqual(eco.counterOffer(B).cards, []);
});

test('comptoir (serveur) : achat, refus, et un double clic n’achète pas deux fois', () => {
  const name = cardData()[SUPER]?.name ?? SUPER;
  // pas assez de Berry : le message dit combien il manque et pour quelle carte
  eco.credit(A, 'correction', 'comptoir-depart', price.SR - 140);
  refused(() => eco.buyAtCounter(A, SUPER, 'achat-sr-1'), 'insufficient_funds', 409, new RegExp(`Il te manque 140 ฿ pour ${name}`));
  eco.credit(A, 'correction', 'comptoir-suite', 140 + price.L);
  const bought = eco.buyAtCounter(A, SUPER, 'achat-sr-2');
  assert.equal(bought.spent, price.SR);
  assert.deepEqual(bought.card, { number: SUPER, variant: 'base', count: 1 });
  assert.equal(bought.wallet.balance, price.L);
  assert.equal(holdOf(A)[`${SUPER}|base`], 2);
  // le même identifiant : le même achat, rien de plus
  const again = eco.buyAtCounter(A, SUPER, 'achat-sr-2');
  assert.equal(again.already, true);
  assert.equal(again.spent, price.SR);
  assert.equal(holdOf(A)[`${SUPER}|base`], 2);
  assert.equal(balance(A), price.L);
  // jamais trouvée, pas en vente, déjà 4, identifiant invalide
  refused(() => eco.buyAtCounter(A, COMMON, 'achat-commune'), 'not_found_yet', 409);
  refused(() => eco.buyAtCounter(A, STARTER, 'achat-depart'), 'not_found', 404);
  refused(() => eco.buyAtCounter(A, PROMO, 'achat-promo'), 'not_found', 404);
  refused(() => eco.buyAtCounter(A, 'OP03-999', 'achat-inconnu'), 'not_found', 404);
  refused(() => eco.buyAtCounter(A, SECRET, 'achat-sec'), 'counter_max', 409);
  refused(() => eco.buyAtCounter(A, LEADER, 'court'), 'bad_request', 400);
  // un refus n'écrit rien
  assert.equal(ledgerRows(A, 'comptoir'), 1);
  // jusqu'à 4 exemplaires, toutes versions comptées (2 de base + 1 parallèle : encore un)
  eco.credit(A, 'correction', 'comptoir-fin', price.SR);
  eco.buyAtCounter(A, SUPER, 'achat-sr-3');
  refused(() => eco.buyAtCounter(A, SUPER, 'achat-sr-4'), 'counter_max', 409);
  const { entries } = eco.history(A);
  assert.equal(entries[0].label, `Comptoir : ${name} (${SUPER})`);
  assert.equal(entries[0].amount, -price.SR);
  assert.equal(ledgerSum(A), balance(A));
});

test('doublons (serveur) : au-delà de 4 exemplaires, versions de base d’abord, versions spéciales gardées', () => {
  hold(B, [
    [COMMON, 'base', 7], [UNCOMMON, 'base', 4], [RARE, 'base', 5],
    // 3 de base et 3 parallèles : 2 de trop, mais seulement 2 de base peuvent partir sans les versions spéciales
    [SUPER, 'base', 3], [SUPER, 'parallele', 3],
    // aucune de base : rien ne part sans les versions spéciales
    [SECRET, 'manga', 1], [SECRET, 'parallele', 5],
    [PROMO, 'base', 9],
  ]);
  const plain: DuplicatesPreview = eco.previewDuplicates(B, false);
  // 4 exemplaires de la peu commune : aucun de trop ; la promo n'a pas de valeur au barème
  assert.deepEqual(plain.lines, [
    { number: RARE, variant: 'base', rarity: 'R', count: 1, value: value.R },
    { number: COMMON, variant: 'base', rarity: 'C', count: 3, value: value.C },
    { number: SUPER, variant: 'base', rarity: 'SR', count: 2, value: value.SR },
  ]);
  assert.equal(plain.total, value.R + 3 * value.C + 2 * value.SR);
  assert.deepEqual(plain.decks, []);
  const all: DuplicatesPreview = eco.previewDuplicates(B, true);
  const secret = all.lines.filter((l) => l.number === SECRET);
  // les parallèles partent avant la version manga
  assert.deepEqual(secret, [{ number: SECRET, variant: 'parallele', rarity: 'SEC', count: 2, value: value.SEC }]);
  assert.equal(all.total, plain.total + 2 * value.SEC);
  assert.notEqual(all.stateKey, plain.stateKey);
});

test('doublons (serveur) : l’échange se fait sur la Cale de l’aperçu, une seule fois', () => {
  eco.credit(B, 'correction', 'doublons-depart', 5);
  const before = balance(B);
  const preview: DuplicatesPreview = eco.previewDuplicates(B, false);
  // l'aperçu sans les versions spéciales ne sert pas à échanger avec
  refused(() => eco.exchangeDuplicates(B, preview.stateKey, 'echange-mauvais-choix', true), 'hold_changed', 409);
  // la Cale change entre l'aperçu et l'échange
  hold(B, [[COMMON, 'base', 8]]);
  refused(() => eco.exchangeDuplicates(B, preview.stateKey, 'echange-cale-changee', false), 'hold_changed', 409);
  assert.equal(ledgerRows(B, 'doublons'), 0);
  const fresh: DuplicatesPreview = eco.previewDuplicates(B, false);
  const done = eco.exchangeDuplicates(B, fresh.stateKey, 'echange-1', false);
  assert.equal(done.total, fresh.total);
  assert.deepEqual(done.lines, fresh.lines);
  assert.equal(done.wallet.balance, before + fresh.total);
  const after = holdOf(B);
  assert.equal(after[`${COMMON}|base`], 4);
  assert.equal(after[`${RARE}|base`], 4);
  assert.equal(after[`${SUPER}|base`], 1);
  assert.equal(after[`${SUPER}|parallele`], 3);
  assert.equal(after[`${SECRET}|parallele`], 5);
  assert.equal(after[`${PROMO}|base`], 9);
  // le même identifiant : le même échange, rien de plus
  const again = eco.exchangeDuplicates(B, fresh.stateKey, 'echange-1', false);
  assert.equal(again.already, true);
  assert.equal(again.total, fresh.total);
  assert.equal(balance(B), before + fresh.total);
  // plus rien à échanger sans les versions spéciales
  const empty: DuplicatesPreview = eco.previewDuplicates(B, false);
  assert.deepEqual(empty.lines, []);
  refused(() => eco.exchangeDuplicates(B, empty.stateKey, 'echange-vide', false), 'bad_request', 400);
  // avec les versions spéciales : une ligne vidée disparaît de la Cale
  hold(B, [[SECRET, 'manga', 5], [SECRET, 'parallele', 1]]);
  const variants: DuplicatesPreview = eco.previewDuplicates(B, true);
  assert.deepEqual(variants.lines.filter((l) => l.number === SECRET).map((l) => [l.variant, l.count]), [['parallele', 1], ['manga', 1]]);
  eco.exchangeDuplicates(B, variants.stateKey, 'echange-2', true);
  assert.equal(holdOf(B)[`${SECRET}|manga`], 4);
  assert.equal(holdOf(B)[`${SECRET}|parallele`], undefined);
  const { entries } = eco.history(B);
  assert.match(entries[0].label, /^Échange de \d+ doublons?$/);
  assert.equal(ledgerSum(B), balance(B));
});

test('doublons (serveur) : les decks d’aventure qui deviendraient incomplets sont signalés', () => {
  hold(C, [[LEADER, 'base', 6], [COMMON, 'base', 6], [RARE, 'base', 5]]);
  const deck = db.prepare(`INSERT INTO game_decks (user_id, id, name, leader, cards, mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '2026-10-20T10:00:00Z', '2026-10-20T10:00:00Z')`);
  // 6 exemplaires (comme une carte permise en autant d'exemplaires) : l'échange lui en prendrait
  deck.run(C, 'PERSO-aventure1', 'Mon deck', LEADER, JSON.stringify({ [COMMON]: 6 }), 'aventure');
  // 4 exemplaires : il en reste assez
  deck.run(C, 'PERSO-aventure2', 'Deck tranquille', LEADER, JSON.stringify({ [RARE]: 4 }), 'aventure');
  // déjà incomplet avant, ou deck libre : rien à signaler
  deck.run(C, 'PERSO-aventure3', 'Déjà incomplet', LEADER, JSON.stringify({ [COMMON]: 7 }), 'aventure');
  deck.run(C, 'PERSO-libre1', 'Deck libre', LEADER, JSON.stringify({ [COMMON]: 6 }), 'libre');
  const preview: DuplicatesPreview = eco.previewDuplicates(C, false);
  assert.deepEqual(preview.decks, [{ id: 'PERSO-aventure1', name: 'Mon deck' }]);
  // rien à échanger : rien à signaler
  assert.deepEqual(eco.previewDuplicates(D, false), { stateKey: eco.previewDuplicates(D, false).stateKey, lines: [], total: 0, decks: [] });
});

test('comptoir et doublons (serveur) : les routes, et deux échanges simultanés n’en font qu’un', async () => {
  const app = express();
  app.use(express.json());
  app.use((req: { user: { id: number } }, _res: unknown, next: () => void) => { req.user = { id: D }; next(); });
  eco.economyRoutes(app);
  app.use((err: { status?: number; code?: string; message: string }, _req: unknown, res: { status: (n: number) => { json: (body: unknown) => void } }, _next: unknown) => {
    res.status(err.status ?? 500).json({ code: err.code, error: err.message });
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/game`;
    const post = (path: string, body?: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    hold(D, [[COMMON, 'base', 2], [RARE, 'base', 7], [SUPER, 'parallele', 6]]);
    eco.credit(D, 'correction', 'routes-depart', price.C);
    const offer = await (await fetch(`${base}/shop/counter`)).json();
    assert.deepEqual(offer.cards.map((c: { number: string }) => c.number).sort(), [COMMON, RARE, SUPER].sort());
    let r = await post('shop/counter', { number: COMMON, purchaseId: 'route-achat-1' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).wallet.balance, 0);
    r = await post('shop/counter', { number: COMMON, purchaseId: 'route-achat-2' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).code, 'insufficient_funds');
    assert.equal((await post('shop/counter', { number: COMMON })).status, 400);
    const plain = await (await fetch(`${base}/duplicates?withVariants=0`)).json();
    const all = await (await fetch(`${base}/duplicates?withVariants=1`)).json();
    assert.equal(plain.total, 3 * value.R);
    assert.equal(all.total, 3 * value.R + 2 * value.SR);
    // le même aperçu envoyé deux fois avec deux identifiants : un seul échange
    const answers = await Promise.all([
      post('duplicates/exchange', { stateKey: all.stateKey, exchangeId: 'route-echange-1', withVariants: true }),
      post('duplicates/exchange', { stateKey: all.stateKey, exchangeId: 'route-echange-2', withVariants: true }),
    ]);
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
    assert.equal((await answers.find((a) => a.status === 409)!.json()).code, 'hold_changed');
    assert.equal(balance(D), all.total);
    assert.equal(ledgerRows(D, 'doublons'), 1);
    assert.equal((await post('duplicates/exchange', { stateKey: all.stateKey, exchangeId: '!' })).status, 400);
  } finally {
    server.close();
  }
});
