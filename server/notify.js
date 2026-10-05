// Notifications sur le téléphone (Web Push) : carte recherchée passée sous son prix cible, résumé de la semaine.
// - les clés VAPID, qui identifient ce serveur auprès des services de notification des navigateurs, sont créées au
//   premier démarrage et gardées dans la base (table meta)
// - chaque appareil abonné est une ligne de push_subscriptions, avec la langue de l'interface au moment de l'abonnement
// - les notifications partent après la mise à jour quotidienne des prix (voir index.js)
import webpush from 'web-push';
import { db, getMeta, setMeta } from './db.js';
import { estimateEurSql, priceJoins, toEur, valueHistory } from './valuation.js';

// Types de notifications, tous activés par défaut ; chaque utilisateur peut les couper (colonne users.notify_prefs)
export const NOTIFY_TYPES = ['targets', 'weekly'];

const MESSAGES = {
  fr: {
    targetOneTitle: 'Prix cible atteint',
    targetOneBody: '{name} ({number}) est à {price}, sous ton prix cible de {target}.',
    targetManyTitle: '{n} cartes sous ton prix cible',
    weeklyTitle: 'Ta semaine',
    weeklyBody: 'Ta collection vaut {value} ({delta} en 7 jours).',
    weeklyTop: ' Plus forte hausse : {name} ({gain}).',
    testTitle: 'Notifications activées',
    testBody: 'Tu recevras ici les alertes de tes recherches et le résumé de ta semaine.',
  },
  en: {
    targetOneTitle: 'Target price reached',
    targetOneBody: '{name} ({number}) is at {price}, below your target of {target}.',
    targetManyTitle: '{n} cards below your target',
    weeklyTitle: 'Your week',
    weeklyBody: 'Your collection is worth {value} ({delta} over 7 days).',
    weeklyTop: ' Biggest rise: {name} ({gain}).',
    testTitle: 'Notifications enabled',
    testBody: "You'll get your wishlist alerts and your weekly summary here.",
  },
};

function text(lang, key, vars = {}) {
  const template = (MESSAGES[lang] ?? MESSAGES.fr)[key];
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

function eur(lang, value, signed = false) {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency: 'EUR', ...(signed ? { signDisplay: 'exceptZero' } : {}),
  }).format(value);
}

// ---------- Clés et abonnements ----------

function vapidKeys() {
  let publicKey = getMeta('vapid_public');
  let privateKey = getMeta('vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    setMeta('vapid_public', publicKey);
    setMeta('vapid_private', privateKey);
  }
  return { publicKey, privateKey };
}

let configured = false;
function configure() {
  if (configured) return;
  const { publicKey, privateKey } = vapidKeys();
  // contact demandé par les services de notification : une adresse mailto: ou https:
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'https://github.com/suiris31/TCGC', publicKey, privateKey);
  configured = true;
}

export function pushPublicKey() {
  return vapidKeys().publicKey;
}

function invalid() {
  return Object.assign(new Error('Abonnement invalide'), { status: 400, expose: true, code: 'invalid_subscription' });
}

// Un appareil s'abonne (ou renouvelle son abonnement) ; un appareil passé d'un compte à l'autre change de propriétaire
export function subscribe(userId, subscription, lang) {
  const endpoint = String(subscription?.endpoint ?? '');
  const { p256dh, auth } = subscription?.keys ?? {};
  if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000 || typeof p256dh !== 'string' || typeof auth !== 'string'
    || p256dh.length > 200 || auth.length > 100) throw invalid();
  db.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang`)
    .run(endpoint, userId, p256dh, auth, lang === 'en' ? 'en' : 'fr', new Date().toISOString());
}

export function unsubscribe(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint ?? ''));
}

export function notifyPrefs(user) {
  let stored = {};
  try { stored = JSON.parse(user.notify_prefs ?? '{}') ?? {}; } catch { /* réglage illisible : valeurs par défaut */ }
  return Object.fromEntries(NOTIFY_TYPES.map((type) => [type, stored[type] !== false]));
}

export function setNotifyPrefs(user, changes) {
  const prefs = notifyPrefs(user);
  for (const type of NOTIFY_TYPES) if (typeof changes?.[type] === 'boolean') prefs[type] = changes[type];
  db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(JSON.stringify(prefs), user.id);
  return prefs;
}

// Envoie une notification à tous les appareils d'un utilisateur ; message(lang) donne { title, body, url, tag }.
// Un abonnement expiré ou révoqué (404 / 410) est supprimé ; l'échec d'un appareil n'empêche pas l'envoi aux autres
// (si aucun appareil n'a pu être joint, l'erreur remonte).
export async function sendToUser(userId, message) {
  configure();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  let sent = 0;
  let failure = null;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message(sub.lang)),
        { TTL: 24 * 3600 },
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      } else {
        failure ??= err;
      }
    }
  }
  if (!sent && failure) throw failure;
  return sent;
}

export function sendTest(userId) {
  return sendToUser(userId, (lang) => ({ title: text(lang, 'testTitle'), body: text(lang, 'testBody'), url: '#profile', tag: 'test' }));
}

// ---------- Après la mise à jour des prix ----------

// Cartes recherchées passées sous leur prix cible depuis la dernière alerte. Une carte repassée au-dessus est
// « réarmée » : elle sera signalée de nouveau si elle redescend.
async function notifyTargets(user) {
  const rows = db.prepare(`
    SELECT w.product_id, w.lang, w.target_eur, w.notified_at, ${estimateEurSql(user.price_source)} AS price,
           c.name, c.name_fr, c.number
    FROM wishlist w JOIN cards c ON c.product_id = w.product_id ${priceJoins('w.product_id')}
    WHERE w.user_id = ? AND w.target_eur IS NOT NULL`).all(user.id);
  const reached = (r) => r.price != null && r.price <= r.target_eur;
  const rearm = db.prepare('UPDATE wishlist SET notified_at = NULL WHERE user_id = ? AND product_id = ?');
  for (const r of rows) if (r.notified_at && !reached(r)) rearm.run(user.id, r.product_id);

  const fresh = rows.filter((r) => reached(r) && !r.notified_at).sort((a, b) => b.target_eur - a.target_eur);
  if (!fresh.length) return 0;
  const name = (r) => (r.lang === 'fr' ? r.name_fr ?? r.name : r.name);
  const sent = await sendToUser(user.id, (lang) => (fresh.length === 1
    ? {
      title: text(lang, 'targetOneTitle'),
      body: text(lang, 'targetOneBody', { name: name(fresh[0]), number: fresh[0].number, price: eur(lang, fresh[0].price), target: eur(lang, fresh[0].target_eur) }),
      url: '#collection/wishlist',
      tag: 'targets',
    }
    : {
      title: text(lang, 'targetManyTitle', { n: fresh.length }),
      body: fresh.slice(0, 5).map((r) => `${name(r)} ${r.number} (${eur(lang, r.price)})`).join(', ') + (fresh.length > 5 ? '…' : ''),
      url: '#collection/wishlist',
      tag: 'targets',
    }));
  if (sent) {
    const mark = db.prepare('UPDATE wishlist SET notified_at = ? WHERE user_id = ? AND product_id = ?');
    const now = new Date().toISOString();
    for (const r of fresh) mark.run(now, user.id, r.product_id);
  }
  return sent;
}

// Résumé de la semaine : une fois tous les 7 jours, valeur de la collection et plus forte hausse.
// Le premier résumé arrive une semaine après l'activation.
async function weeklyDigest(user) {
  const now = Date.now();
  if (!user.last_digest_at) {
    db.prepare('UPDATE users SET last_digest_at = ? WHERE id = ?').run(new Date(now).toISOString(), user.id);
    return 0;
  }
  if (now - Date.parse(user.last_digest_at) < 6.5 * 86_400_000) return 0;

  const history = valueHistory(user.id, user.price_source);
  if (history.length < 2) return 0;
  const latest = history[history.length - 1];
  const weekAgo = new Date(Date.parse(latest.date) - 7 * 86_400_000).toISOString().slice(0, 10);
  const before = [...history].reverse().find((h) => h.date <= weekAgo);
  if (!before) return 0;

  // Plus forte hausse en € (prix × exemplaires) parmi les cartes possédées, sur l'historique des prix
  const column = user.price_source === 'tcgplayer' ? 'market' : 'cm';
  const movers = db.prepare(`
    SELECT c.name, c.name_fr, SUM(col.quantity) AS quantity,
      (SELECT h.${column} FROM price_history h WHERE h.product_id = c.product_id AND h.${column} IS NOT NULL ORDER BY h.date DESC LIMIT 1) AS now_price,
      (SELECT h.${column} FROM price_history h WHERE h.product_id = c.product_id AND h.${column} IS NOT NULL AND h.date <= ?
        ORDER BY h.date DESC LIMIT 1) AS old_price
    FROM collection col JOIN cards c ON c.product_id = col.product_id
    WHERE col.user_id = ? GROUP BY c.product_id`).all(weekAgo, user.id);
  const toEurs = (v) => (column === 'market' ? toEur(v) : v);
  let top = null;
  for (const m of movers) {
    if (m.now_price == null || m.old_price == null) continue;
    const gain = (toEurs(m.now_price) - toEurs(m.old_price)) * m.quantity;
    if (gain >= 0.5 && (!top || gain > top.gain)) top = { ...m, gain };
  }

  const sent = await sendToUser(user.id, (lang) => ({
    title: text(lang, 'weeklyTitle'),
    body: text(lang, 'weeklyBody', { value: eur(lang, latest.valueEur), delta: eur(lang, latest.valueEur - before.valueEur, true) })
      + (top ? text(lang, 'weeklyTop', { name: lang === 'fr' ? top.name_fr ?? top.name : top.name, gain: eur(lang, top.gain, true) }) : ''),
    url: '#stats',
    tag: 'weekly',
  }));
  db.prepare('UPDATE users SET last_digest_at = ? WHERE id = ?').run(new Date(now).toISOString(), user.id);
  return sent;
}

// Appelé après chaque mise à jour des prix, pour chaque utilisateur qui a au moins un appareil abonné
export async function notifyAfterSync({ log = console.log } = {}) {
  const users = db.prepare('SELECT * FROM users WHERE id IN (SELECT user_id FROM push_subscriptions)').all();
  let sent = 0;
  for (const user of users) {
    const prefs = notifyPrefs(user);
    try {
      if (prefs.targets) sent += await notifyTargets(user);
      if (prefs.weekly) sent += await weeklyDigest(user);
    } catch (err) {
      log(`Notifications de ${user.pseudo} : ${err.message}`);
    }
  }
  if (sent) log(`${sent} notification(s) envoyée(s)`);
  return sent;
}
