// Client unique des routes du jeu (tâche R1.5) : une seule erreur, le message et le code du serveur gardés tels quels,
// et les clients de chaque domaine qui passent par lui sans changer d'adresse, de méthode ni de corps
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { AdventureApiError, call as adventureCall, loadHold } from '../ui/adventure/api.ts';
import { ApiError, apiUrl, call } from '../ui/api.ts';
import { loadSummaries } from '../ui/archiveClient.ts';
import { buy, loadWallet } from '../ui/economy/api.ts';
import { deleteMyDeck } from '../ui/myDecks.ts';
import { joinRoom, OnlineError, sendChoice } from '../ui/online/api.ts';

interface Sent { url: string; method: string; headers?: Record<string, string>; body?: unknown; cache?: string }

const realFetch = globalThis.fetch;
let sent: Sent[] = [];

// Faux serveur : répond `reply` (ou échoue comme une connexion coupée) et garde les demandes
function serve(reply: Response | 'network') {
  sent = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    sent.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body, cache: init.cache });
    if (reply === 'network') throw new TypeError('Failed to fetch');
    return reply.clone();
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { globalThis.fetch = realFetch; });

async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ApiError, `ApiError attendue, reçu ${String(e)}`);
    return e;
  }
  assert.fail('refus attendu');
}

test('réponse acceptée : le corps JSON, envoyé et reçu', async () => {
  serve(json({ ok: true }));
  assert.deepEqual(await call('POST', 'decks-wish', { missing: { 'OP01-001': 1 } }), { ok: true });
  assert.equal(sent[0].url, apiUrl('decks-wish'));
  assert.match(sent[0].url, /api\/game\/decks-wish$/);
  assert.equal(sent[0].method, 'POST');
  assert.deepEqual(sent[0].headers, { 'Content-Type': 'application/json' });
  assert.equal(sent[0].body, '{"missing":{"OP01-001":1}}');
  assert.equal(sent[0].cache, 'no-store');

  serve(json([]));
  await call('GET', 'catalog', undefined, { cache: 'no-cache' });
  assert.equal(sent[0].headers, undefined);
  assert.equal(sent[0].body, undefined);
  assert.equal(sent[0].cache, 'no-cache');
});

test('corps envoyé tel quel avec son type (partie compressée)', async () => {
  const blob = new Blob(['xx']);
  serve(json({ ok: true }));
  await call('PUT', 'records/abc', blob, { type: 'application/gzip' });
  assert.deepEqual(sent[0].headers, { 'Content-Type': 'application/gzip' });
  assert.equal(sent[0].body, blob);
});

test('refus du serveur : message et code gardés tels quels', async () => {
  serve(json({ code: 'insufficient_funds', error: 'Il te manque 120 ฿' }, 409));
  const e = await refusal(call('POST', 'shop/buy', {}));
  assert.equal(e.status, 409);
  assert.equal(e.code, 'insufficient_funds');
  assert.equal(e.message, 'Il te manque 120 ฿');
});

test('refus sans corps lisible, ou serveur injoignable', async () => {
  serve(new Response('<html>Bad Gateway</html>', { status: 502 }));
  let e = await refusal(call('GET', 'wallet'));
  assert.deepEqual([e.status, e.code, e.message], [502, 'server', 'Le serveur a répondu 502']);

  serve('network');
  e = await refusal(call('GET', 'wallet'));
  assert.deepEqual([e.status, e.code, e.message], [0, 'network', 'Le serveur ne répond pas : vérifie ta connexion']);
});

test('anciennes erreurs : AdventureApiError et OnlineError reconnaissent toute ApiError', async () => {
  serve(json({ code: 'unknown_room', error: 'Aucune salle avec ce code' }, 404));
  const e = await refusal(joinRoom('ZZZZZZ', 'ST01'));
  assert.ok(e instanceof OnlineError && e instanceof AdventureApiError);
  assert.equal(e.message, 'Aucune salle avec ce code');
  assert.ok(!(new Error('x') instanceof AdventureApiError) && !(new Error('x') instanceof OnlineError));

  // construites comme avant (l'atelier imite ainsi les refus du serveur)
  const a = new AdventureApiError('Il te manque 5 ฿', 'insufficient_funds', 409);
  assert.deepEqual([a.message, a.code, a.status], ['Il te manque 5 ฿', 'insufficient_funds', 409]);
  assert.ok(a instanceof ApiError && a instanceof Error);
  const o = new OnlineError('stale', 'Trop tard', 409);
  assert.deepEqual([o.message, o.code, o.status], ['Trop tard', 'stale', 409]);
});

test('les clients gardent leurs adresses, méthodes et corps', async () => {
  const cases: [() => Promise<unknown>, string, string, unknown][] = [
    [() => adventureCall('adventure/deck', 'PUT', { deckId: 'PERSO-x' }), 'adventure/deck', 'PUT', '{"deckId":"PERSO-x"}'],
    [loadHold, 'inventory', 'GET', undefined],
    [() => buy('OP03', 'booster', 'id-1'), 'shop/buy', 'POST', '{"set":"OP03","kind":"booster","purchaseId":"id-1"}'],
    [() => sendChoice('m 1', 3, 'pass'), 'matches/m%201/act', 'POST', '{"seq":3,"choice":"pass"}'],
    [() => joinRoom('ABC123', 'ST01'), 'matches/join', 'POST', '{"code":"ABC123","deck":"ST01"}'],
    [() => deleteMyDeck('PERSO-x'), 'decks/PERSO-x', 'DELETE', undefined],
    [loadSummaries, 'records', 'GET', undefined],
  ];
  for (const [run, path, method, body] of cases) {
    serve(json({ wallet: { balance: 0 } }));
    await run();
    assert.deepEqual([sent[0].url, sent[0].method, sent[0].body], [apiUrl(path), method, body]);
  }
  serve(json({ balance: 42 }));
  assert.deepEqual(await loadWallet(), { balance: 42 });
});
