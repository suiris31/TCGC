// Decks préconstruits (decks pour débutant ST-xx) : ajouter toutes leurs cartes à la collection en une fois.
// La liste des cartes vient de la liste officielle française (série « ... [ST-35] »), qui comprend aussi les
// rééditions d'anciennes cartes ; Bandai ne publie pas les quantités, on les connaît pour certains decks seulement.
import { addToCollection, getCards, LANGS } from './cards.js';
import { db, transaction } from './db.js';

// Quantités par numéro de carte (Leader compris)
const DECKLISTS = {
  // https://x.com/OPMerchandise/status/2073454304040820780 : 51 cartes
  'ST-35': {
    'OP13-004': 1, 'ST35-001': 4, 'ST35-002': 2, 'ST35-003': 4, 'ST35-004': 2, 'ST35-005': 2, 'OP12-090': 4, 'OP12-093': 4,
    'OP12-098': 4, 'OP13-005': 4, 'OP13-008': 4, 'OP13-017': 4, 'OP13-019': 4, 'OP13-081': 4, 'P-105': 4,
  },
};

// Decks pour débutant du catalogue, du plus récent au plus ancien
export function starterDecks() {
  return db.prepare(`SELECT group_id, code, name, published_on FROM sets
    WHERE code GLOB 'ST-[0-9]*' OR code GLOB 'ST[0-9]*' ORDER BY published_on DESC, code DESC`).all()
    .map((s) => ({ id: s.group_id, code: s.code, name: s.name, releaseDate: s.published_on?.slice(0, 10) ?? null, known: Boolean(DECKLISTS[s.code]) }));
}

const TYPE_ORDER = { Leader: 0, Character: 1, Event: 2, Stage: 3 };

// Version d'une carte à ajouter pour un numéro : celle du deck (même extension), sinon celle rattachée au visuel
// français, sinon la version standard la plus ancienne
function productFor(number, groupId, frProduct) {
  const inSet = db.prepare(`SELECT product_id FROM cards WHERE number = ? AND group_id = ?
    ORDER BY variant IS NOT NULL, product_id LIMIT 1`).get(number, groupId);
  if (inSet) return inSet.product_id;
  if (frProduct) return frProduct;
  return db.prepare('SELECT product_id FROM cards WHERE number = ? ORDER BY variant IS NOT NULL, product_id LIMIT 1').get(number)?.product_id ?? null;
}

export function deckContents(viewer, groupId) {
  const set = db.prepare('SELECT group_id, code, name FROM sets WHERE group_id = ?').get(groupId);
  if (!set?.code) return null;
  const numbers = new Map(); // numéro -> produit du visuel français
  for (const r of db.prepare('SELECT number, product_id FROM fr_cards WHERE series LIKE ? ORDER BY image_id').all(`%[${set.code}]%`)) {
    if (!numbers.has(r.number) || (!numbers.get(r.number) && r.product_id)) numbers.set(r.number, r.product_id);
  }
  // Pas encore dans la liste française : les cartes de l'extension
  if (!numbers.size) {
    for (const r of db.prepare("SELECT DISTINCT number FROM cards WHERE group_id = ? AND number != 'DON!!'").all(groupId)) numbers.set(r.number, null);
  }
  const known = DECKLISTS[set.code] ?? null;
  const ids = [...numbers].map(([number, frProduct]) => productFor(number, groupId, frProduct)).filter(Boolean);
  const items = getCards(viewer, [...new Set(ids)])
    .map((card) => ({ card, quantity: known?.[card.number] ?? 1 }))
    .sort((a, b) => (TYPE_ORDER[a.card.type] ?? 9) - (TYPE_ORDER[b.card.type] ?? 9)
      || Number(a.card.cost ?? 99) - Number(b.card.cost ?? 99) || a.card.number.localeCompare(b.card.number));
  return { set: { id: set.group_id, code: set.code, name: set.name }, known: Boolean(known), items };
}

// Ajoute les cartes choisies (quantités ajoutées à celles déjà possédées)
export function addDeck(viewer, groupId, lang, items) {
  if (!LANGS.includes(lang)) throw Object.assign(new Error('Langue invalide'), { status: 400, expose: true, code: 'invalid_lang' });
  const contents = deckContents(viewer, groupId);
  if (!contents) return null;
  const allowed = new Set(contents.items.map((i) => i.card.id));
  const valid = (Array.isArray(items) ? items : [])
    .map((i) => ({ id: Number(i?.id), quantity: Number(i?.quantity) }))
    .filter((i) => allowed.has(i.id) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 20);
  transaction(() => {
    for (const { id, quantity } of valid) addToCollection(viewer, id, quantity, lang);
  });
  return { set: contents.set, cards: valid.length, copies: valid.reduce((sum, i) => sum + i.quantity, 0) };
}
