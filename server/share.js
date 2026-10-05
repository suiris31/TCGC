// Lien de partage : une page publique, en lecture seule et sans compte, qui montre les doubles (ou toute la
// collection) et les recherches d'un utilisateur, pour organiser des échanges.
// - le lien contient un jeton aléatoire impossible à deviner ; le changer remplace l'ancien, qui ne marche plus
// - l'e-mail et les prix cibles ne sont jamais montrés ; les prix seulement si le propriétaire le veut
import crypto from 'node:crypto';
import { collectionEntries, wishlistCards } from './cards.js';
import { db } from './db.js';

const SCOPES = ['doubles', 'collection'];
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function newToken() {
  return crypto.randomBytes(16).toString('base64url');
}

function formatShare(row) {
  if (!row) return null;
  return { token: row.token, scope: row.scope, showPrices: Boolean(row.show_prices), showWishlist: Boolean(row.show_wishlist), createdAt: row.created_at };
}

export function getShare(userId) {
  return formatShare(db.prepare('SELECT * FROM shares WHERE user_id = ?').get(userId));
}

// Crée le lien s'il n'existe pas, ou change ce qu'il montre
export function saveShare(userId, { scope, showPrices, showWishlist } = {}) {
  if (scope !== undefined && !SCOPES.includes(scope)) {
    throw Object.assign(new Error('Partage invalide'), { status: 400, expose: true, code: 'invalid_share' });
  }
  const current = db.prepare('SELECT * FROM shares WHERE user_id = ?').get(userId);
  const next = {
    scope: scope ?? current?.scope ?? 'doubles',
    showPrices: showPrices === undefined ? (current ? current.show_prices : 1) : Number(Boolean(showPrices)),
    showWishlist: showWishlist === undefined ? (current ? current.show_wishlist : 1) : Number(Boolean(showWishlist)),
  };
  db.prepare(`INSERT INTO shares (user_id, token, scope, show_prices, show_wishlist, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET scope = excluded.scope, show_prices = excluded.show_prices, show_wishlist = excluded.show_wishlist`)
    .run(userId, newToken(), next.scope, next.showPrices, next.showWishlist, new Date().toISOString());
  return getShare(userId);
}

// Nouveau jeton : l'ancien lien ne marche plus
export function regenerateShare(userId) {
  db.prepare('UPDATE shares SET token = ?, created_at = ? WHERE user_id = ?').run(newToken(), new Date().toISOString(), userId);
  return getShare(userId);
}

export function deleteShare(userId) {
  db.prepare('DELETE FROM shares WHERE user_id = ?').run(userId);
}

// Contenu de la page publique : seulement ce que le propriétaire a choisi de montrer
export function sharedView(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const share = db.prepare(`
    SELECT s.*, u.pseudo, u.price_source, u.keep_copies FROM shares s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`).get(token);
  if (!share) return null;
  const viewer = { userId: share.user_id, source: share.price_source };
  const keep = share.keep_copies;
  const onlyDoubles = share.scope === 'doubles';

  const publicCard = (card, lang, quantity) => ({
    id: card.id,
    name: card.name,
    nameFr: card.nameFr,
    number: card.number,
    variant: card.variant,
    rarity: card.rarity,
    setCode: card.setCode,
    setName: card.setName,
    releaseDate: card.releaseDate,
    image: card.image,
    imageFr: card.imageFr,
    lang,
    quantity,
    price: share.show_prices ? card.price.eur : null,
  });

  const cards = collectionEntries(viewer, onlyDoubles ? keep + 1 : 1)
    .map((c) => publicCard(c, c.entry.lang, onlyDoubles ? c.entry.quantity - keep : c.entry.quantity));
  const wanted = share.show_wishlist ? wishlistCards(viewer).map((c) => publicCard(c, c.wish.lang, 1)) : [];
  const updatedAt = db.prepare('SELECT MAX(updated_at) AS d FROM collection WHERE user_id = ?').get(share.user_id).d;
  return { pseudo: share.pseudo, scope: share.scope, showPrices: Boolean(share.show_prices), keep, updatedAt, cards, wanted };
}
