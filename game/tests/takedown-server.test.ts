// Interrupteur de retrait (server/takedown.js), sur une base temporaire : chaque variable coupe ce qu'elle doit et rien
// d'autre, rien n'est coupé par défaut, et la collection ne l'est jamais
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'tcgc-takedown-'));
process.env.TCGC_DB = join(dir, 'essai.db');
delete process.env.TAKEDOWN_IMAGES;
delete process.env.TAKEDOWN_GAME;
delete process.env.TAKEDOWN_PUBLIC;
// adresses en variables : le serveur (JavaScript) et express n'ont pas de types
const expressModule = 'express';
const dbModule = '../../server/db.js';
const takedownModule = '../../server/takedown.js';
const { db } = await import(dbModule);
const server = await import(takedownModule);
const { default: express } = await import(expressModule);

db.prepare("INSERT INTO sets (group_id, code, name) VALUES (1, 'OP03', 'Pillars of Strength')").run();
const card = db.prepare('INSERT INTO cards (product_id, group_id, name, full_name, variant, number, color) VALUES (?, 1, ?, ?, ?, ?, ?)');
card.run(497932, 'Portgas.D.Ace', 'Portgas.D.Ace (001)', null, 'OP03-001', 'Red');
card.run(497934, 'Portgas.D.Ace', 'Portgas.D.Ace (001) (Alternate Art)', 'Alternate Art', 'OP03-001', null);
card.run(498100, 'Nami & <Usopp>', 'Nami & <Usopp>', null, 'OP03-099', 'Green;Yellow');
db.prepare("INSERT INTO fr_cards (image_id, number, name) VALUES ('OP03-001_p1', 'OP03-001', 'Portgas D. Ace')").run();

// Les routes réelles qu'un interrupteur peut couper, et d'autres qu'il ne doit jamais toucher : chacune répond « vrai »
const PATHS = {
  images: ['/img/497932.jpg', '/img-fr/OP03-001_p1.jpg', '/img-fr-hd/OP03-001_p1.webp', '/img-en-hd/OP03-001.webp'],
  game: ['/api/game/catalog', '/api/game/adventure', '/api/game/records/abc', '/api/game/matches/xyz/events'],
  publicPages: ['/api/shared/jeton123'],
  never: ['/api/collection/sets', '/api/cards', '/api/legal', '/api/auth/me', '/api/wishlist', '/api/scan', '/'],
};

async function serve(flags: { images: boolean; game: boolean; publicPages: boolean }) {
  const app = express();
  server.takedownRoutes(app, { flags, log: () => {} });
  app.all('/{*splat}', (_req: unknown, res: { type: (t: string) => { send: (body: string) => void } }) => res.type('text/plain').send('vrai'));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => listener.once('listening', resolve));
  const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  return { get: (path: string) => fetch(base + path), close: () => listener.close() };
}

const NONE = { images: false, game: false, publicPages: false };

test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('interrupteur : lecture des variables, rien de coupé par défaut', () => {
  assert.deepEqual(server.takedown, NONE, 'état de ce processus, sans variable');
  assert.deepEqual(server.readTakedown({}), NONE);
  assert.deepEqual(server.readTakedown({ TAKEDOWN_IMAGES: '0', TAKEDOWN_GAME: '', TAKEDOWN_PUBLIC: 'non' }), NONE);
  assert.deepEqual(server.readTakedown({ TAKEDOWN_IMAGES: '1' }), { ...NONE, images: true });
  assert.deepEqual(server.readTakedown({ TAKEDOWN_GAME: ' true ' }), { ...NONE, game: true });
  assert.deepEqual(server.readTakedown({ TAKEDOWN_PUBLIC: 'Oui' }), { ...NONE, publicPages: true });
  assert.deepEqual(server.readTakedown({ TAKEDOWN_IMAGES: 'on', TAKEDOWN_GAME: 'yes', TAKEDOWN_PUBLIC: '1' }), { images: true, game: true, publicPages: true });
});

test('interrupteur : sans variable, toutes les routes répondent normalement', async () => {
  const app = await serve(NONE);
  try {
    for (const path of Object.values(PATHS).flat()) assert.equal(await (await app.get(path)).text(), 'vrai', path);
  } finally {
    app.close();
  }
});

for (const flag of ['images', 'game', 'publicPages'] as const) {
  test(`interrupteur : ${flag} coupe ses routes et seulement elles`, async () => {
    const app = await serve({ ...NONE, [flag]: true });
    try {
      for (const [group, paths] of Object.entries(PATHS)) {
        for (const path of paths) {
          const res = await app.get(path);
          const body = await res.text();
          if (group !== flag) {
            assert.equal(body, 'vrai', `${path} ne doit pas être coupé par ${flag}`);
          } else if (flag === 'images') {
            assert.equal(res.status, 200, path);
            assert.match(res.headers.get('content-type') ?? '', /^image\/svg\+xml/, path);
            assert.equal(res.headers.get('cache-control'), 'no-store', path);
            assert.match(body, /OP03-001/, path);
          } else {
            assert.equal(res.status, 503, path);
            assert.equal((JSON.parse(body) as { code: string }).code, flag === 'game' ? 'game_closed' : 'public_closed', path);
          }
        }
      }
    } finally {
      app.close();
    }
  });
}

test('interrupteur : la face dessinée porte le nom, le numéro et la couleur de la carte', async () => {
  const app = await serve({ ...NONE, images: true });
  try {
    const face = async (path: string) => {
      const res = await app.get(path);
      assert.equal(res.status, 200, path);
      return res.text();
    };
    // miniature TCGplayer (numéro de produit) : nom anglais, rouge
    const thumb = await face('/img/497932.jpg');
    assert.match(thumb, /Portgas\.D\.Ace/);
    assert.match(thumb, /#c0392b/);
    // version parallèle sans couleur chez TCGplayer : couleur de la version de base
    assert.match(await face('/img/497934.jpg'), /#c0392b/);
    // visuel VF : nom français
    assert.match(await face('/img-fr-hd/OP03-001_p1.webp'), /Portgas D\. Ace/);
    // visuel VO du jeu, deux couleurs, nom échappé
    const two = await face('/img-en-hd/OP03-099.webp');
    assert.match(two, /OP03-099/);
    assert.match(two, /#24865a[\s\S]*#c99a0e/);
    assert.match(two, /Nami &amp; &lt;Usopp&gt;/);
    assert.doesNotMatch(two, /<Usopp>/);
    // carte inconnue de la base : numéro seul, sans erreur ; adresse invalide refusée
    assert.match(await face('/img-en-hd/ST99-001.webp'), /ST99-001/);
    assert.match(await face('/img/123.jpg'), /<svg/);
    assert.equal((await app.get('/img-en-hd/..%2Fx.webp')).status, 400);
  } finally {
    app.close();
  }
});
