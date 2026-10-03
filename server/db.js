import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sets (
    group_id     INTEGER PRIMARY KEY,
    code         TEXT,
    name         TEXT NOT NULL,
    published_on TEXT,
    modified_on  TEXT
  );

  CREATE TABLE IF NOT EXISTS cards (
    product_id  INTEGER PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES sets(group_id),
    name        TEXT NOT NULL,  -- nom sans suffixes : "Roronoa Zoro"
    full_name   TEXT NOT NULL,  -- nom TCGplayer : "Roronoa Zoro (001) (Parallel)"
    variant     TEXT,           -- "Parallel", "Manga", ... NULL pour la version de base
    number      TEXT NOT NULL,  -- "OP01-001"
    rarity      TEXT,
    color       TEXT,
    card_type   TEXT,
    cost        TEXT,
    power       TEXT,
    counter     TEXT,
    life        TEXT,
    attribute   TEXT,
    subtypes    TEXT,
    description TEXT,
    image_url   TEXT,
    url         TEXT,
    modified_on TEXT
  );
  CREATE INDEX IF NOT EXISTS cards_number ON cards(number);
  CREATE INDEX IF NOT EXISTS cards_group ON cards(group_id);

  -- Prix TCGplayer en USD (le dernier connu)
  CREATE TABLE IF NOT EXISTS prices (
    product_id INTEGER PRIMARY KEY,
    sub_type   TEXT,
    market     REAL,
    low        REAL,
    mid        REAL,
    high       REAL,
    direct_low REAL,
    date       TEXT
  );

  CREATE TABLE IF NOT EXISTS price_history (
    product_id INTEGER NOT NULL,
    date       TEXT NOT NULL,
    market     REAL,
    low        REAL,
    PRIMARY KEY (product_id, date)
  ) WITHOUT ROWID;

  -- Comptes utilisateurs (mot de passe haché avec scrypt, voir auth.js)
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    pseudo        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    price_source  TEXT NOT NULL DEFAULT 'cardmarket',
    created_at    TEXT NOT NULL
  );

  -- Sessions de connexion : seul le hachage du jeton est stocké, le jeton lui-même est dans le cookie
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  -- Une ligne par utilisateur, carte et langue possédée (une même carte peut être en VF et en VO).
  -- user_id 0 : collection d'avant les comptes, attribuée au premier compte créé (voir auth.js)
  CREATE TABLE IF NOT EXISTS collection (
    user_id    INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES cards(product_id),
    lang       TEXT NOT NULL DEFAULT 'fr',
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    added_at   TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id, lang)
  );

  -- Valeur de la collection de chaque utilisateur, jour par jour, selon chaque source de prix
  -- (value_eur : ancienne colonne, source TCGplayer)
  CREATE TABLE IF NOT EXISTS value_history (
    user_id   INTEGER NOT NULL,
    date      TEXT NOT NULL,
    value_eur REAL NOT NULL,
    value_cm  REAL,
    value_tcg REAL,
    cards     INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Cartes de la liste officielle française (noms VF, visuels VF pour la reconnaissance)
  CREATE TABLE IF NOT EXISTS fr_cards (
    image_id TEXT PRIMARY KEY,  -- "OP14-001_p1" : code + suffixe de version, nom du visuel chez Bandai
    number   TEXT NOT NULL,     -- "OP14-001"
    name     TEXT NOT NULL,
    series   TEXT,
    product_id INTEGER          -- carte du catalogue représentée par ce visuel (rattachée par la reconnaissance)
  );
  CREATE INDEX IF NOT EXISTS fr_cards_number ON fr_cards(number);

  -- Prix Cardmarket en € (marché européen), rattachés aux cartes du catalogue (voir cardmarket.js)
  CREATE TABLE IF NOT EXISTS cm_prices (
    product_id INTEGER PRIMARY KEY,  -- carte du catalogue (id TCGplayer)
    cm_id      INTEGER NOT NULL,     -- produit Cardmarket
    trend      REAL,
    avg30      REAL,
    avg7       REAL,
    low        REAL,
    date       TEXT
  );
`);

// Migrations des bases créées par une version précédente
function addColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
addColumn('cards', 'name_fr', 'TEXT');
addColumn('price_history', 'cm', 'REAL'); // prix Cardmarket en €
// valeur de la collection selon chaque source de prix (value_eur : ancienne colonne, source TCGplayer)
addColumn('value_history', 'value_cm', 'REAL');
addColumn('value_history', 'value_tcg', 'REAL');
addColumn('fr_cards', 'product_id', 'INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS fr_cards_product ON fr_cards(product_id)');

// Collection sans langue (avant la gestion VF/VO) : les cartes déjà saisies sont considérées en VF
if (!db.prepare('PRAGMA table_info(collection)').all().some((c) => c.name === 'lang')) {
  db.exec(`
    BEGIN;
    CREATE TABLE collection_new (
      product_id INTEGER NOT NULL REFERENCES cards(product_id),
      lang       TEXT NOT NULL DEFAULT 'fr',
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      added_at   TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (product_id, lang)
    );
    INSERT INTO collection_new (product_id, lang, quantity, added_at, updated_at)
      SELECT product_id, 'fr', quantity, added_at, updated_at FROM collection;
    DROP TABLE collection;
    ALTER TABLE collection_new RENAME TO collection;
    COMMIT;
  `);
}

// Base d'avant les comptes : la collection et son historique passent sous l'utilisateur 0, en attendant
// d'être attribués au premier compte créé
export const LEGACY_USER = 0;

if (!db.prepare('PRAGMA table_info(collection)').all().some((c) => c.name === 'user_id')) {
  db.exec(`
    BEGIN;
    CREATE TABLE collection_new (
      user_id    INTEGER NOT NULL,
      product_id INTEGER NOT NULL REFERENCES cards(product_id),
      lang       TEXT NOT NULL DEFAULT 'fr',
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      added_at   TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, product_id, lang)
    );
    INSERT INTO collection_new (user_id, product_id, lang, quantity, added_at, updated_at)
      SELECT ${LEGACY_USER}, product_id, lang, quantity, added_at, updated_at FROM collection;
    DROP TABLE collection;
    ALTER TABLE collection_new RENAME TO collection;
    COMMIT;
  `);
}

if (!db.prepare('PRAGMA table_info(value_history)').all().some((c) => c.name === 'user_id')) {
  db.exec(`
    BEGIN;
    CREATE TABLE value_history_new (
      user_id   INTEGER NOT NULL,
      date      TEXT NOT NULL,
      value_eur REAL NOT NULL,
      value_cm  REAL,
      value_tcg REAL,
      cards     INTEGER NOT NULL,
      PRIMARY KEY (user_id, date)
    );
    INSERT INTO value_history_new (user_id, date, value_eur, value_cm, value_tcg, cards)
      SELECT ${LEGACY_USER}, date, value_eur, value_cm, value_tcg, cards FROM value_history;
    DROP TABLE value_history;
    ALTER TABLE value_history_new RENAME TO value_history;
    COMMIT;
  `);
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? null : String(value));
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
