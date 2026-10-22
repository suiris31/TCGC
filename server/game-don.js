// DON!! proposées pour un deck (onglet Jouer, choix cosmétique d'un deck : looks.don, voir game-decks.js). Ce sont les
// cartes « DON!! » de la collection (table cards, synchronisée avec TCGplayer), dont les visuels sont relayés par
// /img/<id>.jpg comme dans la collection (coupés par TAKEDOWN_IMAGES, voir takedown.js).
//   GET /api/game/don    { dons: [{ id, label, imageUrl }] } : la DON!! standard d'abord (choix par défaut), puis les
//                        autres de la plus ancienne à la plus récente
// Les impressions d'un même visuel sont regroupées : la DON!! standard des decks de démarrage, ou une DON!! rééditée
// sous le même nom (« DON!! Card (Yamato) » des deux Premium Booster). Seules les DON!! « Alternate Art » des
// extensions portent le même nom pour des visuels différents : elles restent séparées par extension. L'identifiant d'un
// groupe est le plus petit numéro de produit de ses impressions (stable : les nouveaux produits ont des numéros plus
// grands).
import { db } from './db.js';
import { takedown } from './takedown.js';

const STANDARD = 'DON!! Card';
const PER_SET = /^DON!! Card \(Alternate Art\)( \(Gold\))?$/;

// Mots des noms TCGplayer traduits pour le libellé ; les noms propres restent tels quels
const WORDS = {
  'Alternate Art': 'illustration alternative', Gold: 'dorée', Silver: 'argentée', Bronze: 'bronze', Manga: 'manga',
  Red: 'rouge', Green: 'verte', Blue: 'bleue', Purple: 'violette', Yellow: 'jaune', Orange: 'orange', Pink: 'rose',
  Teal: 'turquoise', Color: 'couleurs', 'Black & White': 'noir et blanc', 'Black and Gold': 'noir et or',
  Silhouette: 'silhouette', 'Special Foil': 'brillante', Winner: 'vainqueur',
};

// « DON!! Card (Yamato) (Gold) » -> « Yamato · dorée » ; « DON!! Card // Green Compass » -> « Green Compass »
export function donLabel(fullName, setName) {
  const rest = fullName.slice(STANDARD.length).trim();
  const parts = [...rest.matchAll(/\(([^()]*)\)|\[([^\]]*)\]|\/\/\s*(.+)$/g)].map((m) => (m[1] ?? m[2] ?? m[3]).trim());
  const label = parts.map((p) => WORDS[p] ?? p).join(' · ');
  if (!label) return 'DON!! standard';
  const text = `${label[0].toUpperCase()}${label.slice(1)}`;
  return PER_SET.test(fullName) && setName ? `${text} · ${setName}` : text;
}

// Toutes les DON!! connues, regroupées par visuel, la standard d'abord
export function allDons() {
  const rows = db.prepare(`SELECT c.product_id, c.full_name, c.group_id, s.name AS set_name FROM cards c
    LEFT JOIN sets s ON s.group_id = c.group_id
    WHERE c.number = 'DON!!' AND c.name LIKE 'DON!! Card%' ORDER BY c.product_id`).all();
  const groups = new Map();
  for (const r of rows) {
    const key = PER_SET.test(r.full_name) ? `${r.full_name}|${r.group_id}` : r.full_name;
    if (!groups.has(key)) groups.set(key, { id: String(r.product_id), label: donLabel(r.full_name, r.set_name), imageUrl: `img/${r.product_id}.jpg`, standard: r.full_name === STANDARD });
  }
  const list = [...groups.values()];
  return [...list.filter((d) => d.standard), ...list.filter((d) => !d.standard)].map(({ standard, ...d }) => d);
}

export function isKnownDon(id) {
  return typeof id === 'string' && /^\d{1,12}$/.test(id) && allDons().some((d) => d.id === id);
}

export function donRoutes(app) {
  app.get('/api/game/don', (req, res) => {
    const dons = allDons();
    res.setHeader('Cache-Control', 'no-store');
    // visuels coupés : chaque DON!! serait la même face dessinée, seule la standard est proposée
    res.json({ dons: takedown.images ? dons.slice(0, 1) : dons });
  });
}
