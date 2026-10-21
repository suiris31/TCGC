// Interrupteur de retrait : de quoi obéir en quelques minutes à une demande des ayants droit (Bandai, Shueisha, Toei
// Animation), sans toucher au code. Trois variables d'environnement, lues au démarrage (voir deploy/tcgc.env.example) :
//   TAKEDOWN_IMAGES=1  les visuels des cartes ne sont plus servis : chaque route de visuel (img/, img-fr/, img-fr-hd/,
//                      img-en-hd/) renvoie une face de carte dessinée ici (nom, numéro, couleur), les écrans ne changent
//                      pas ; les grands visuels VO ne sont plus chargés chez TCGplayer (server/cards.js) ;
//   TAKEDOWN_GAME=1    le jeu (onglet Jouer, toutes les routes /api/game/) est fermé : l'onglet affiche un message,
//                      les parties, decks, la Cale et la progression restent dans la base ;
//   TAKEDOWN_PUBLIC=1  les pages publiques (lien de partage, sans compte) sont fermées.
// La collection des membres n'est jamais coupée. Rien n'est coupé par défaut ; « 1 », « true », « oui »... coupent.
import { db } from './db.js';

const ON = /^(1|true|yes|oui|on)$/i;

export function readTakedown(env = process.env) {
  const on = (name) => ON.test((env[name] ?? '').trim());
  return { images: on('TAKEDOWN_IMAGES'), game: on('TAKEDOWN_GAME'), publicPages: on('TAKEDOWN_PUBLIC') };
}

// État de ce serveur, lu une fois au démarrage
export const takedown = readTakedown();

// ---------- Face de carte dessinée (à la place d'un visuel) ----------

const COLORS = { Red: '#c0392b', Green: '#24865a', Blue: '#2a6cb0', Purple: '#7b3f98', Black: '#3b3f46', Yellow: '#c99a0e' };
const NEUTRAL = '#6b7280';

const escapeXml = (text) => text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// Nom coupé en lignes d'au plus `width` caractères (3 lignes au plus, la dernière abrégée)
function wrap(text, width = 16, max = 3) {
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length > max) lines.splice(max - 1, lines.length, `${lines[max - 1]}…`);
  return lines;
}

// Face 63 × 88 (proportions d'une carte) : cadre de la couleur de la carte, numéro, nom, gouvernail dessiné par nous
export function cardFace({ number = '', name = '', colors = [] } = {}) {
  const fills = colors.map((c) => COLORS[c]).filter(Boolean);
  const [a, b] = [fills[0] ?? NEUTRAL, fills[1] ?? fills[0] ?? NEUTRAL];
  const lines = wrap(name);
  const size = lines.some((l) => l.length > 12) ? 44 : 52;
  const top = 470 - ((lines.length - 1) * size * 1.15) / 2;
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const r = (i * Math.PI) / 4;
    return `<line x1="${(315 + 34 * Math.cos(r)).toFixed(1)}" y1="${(250 + 34 * Math.sin(r)).toFixed(1)}" x2="${(315 + 92 * Math.cos(r)).toFixed(1)}" y2="${(250 + 92 * Math.sin(r)).toFixed(1)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="630" height="880" viewBox="0 0 630 880">
<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="630" height="880" rx="34" fill="url(#c)"/>
<rect x="26" y="26" width="578" height="828" rx="22" fill="#f4efe4"/>
<g fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round" opacity="0.35"><circle cx="315" cy="250" r="72"/><circle cx="315" cy="250" r="22"/>${spokes}</g>
<g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" text-anchor="middle" fill="#22252b">
<text x="315" y="104" font-size="40" font-weight="700" letter-spacing="2">${escapeXml(number)}</text>
${lines.map((l, i) => `<text x="315" y="${(top + i * size * 1.15).toFixed(0)}" font-size="${size}" font-weight="700">${escapeXml(l)}</text>`).join('\n')}
</g>
<rect x="26" y="760" width="578" height="94" rx="22" fill="url(#c)" opacity="0.9"/>
</svg>`;
}

// Nom, numéro et couleurs de la carte d'un visuel. kind : 'product' (miniature TCGplayer, id = numéro de produit),
// 'fr' (visuel VF, id = « OP03-001_p1 »), 'en' (visuel VO du jeu, même forme)
function cardOf(kind, id) {
  if (kind === 'product') {
    const row = db.prepare('SELECT name, number, color FROM cards WHERE product_id = ?').get(Number(id));
    return row ? { number: row.number, name: row.name, colors: colorsOf(row.number, row.color) } : { number: '', name: '' };
  }
  const number = id.split('_')[0].toUpperCase();
  const fr = kind === 'fr' ? db.prepare('SELECT name FROM fr_cards WHERE image_id = ? OR number = ? ORDER BY image_id = ? DESC').get(id, number, id) : null;
  const en = db.prepare('SELECT name, color FROM cards WHERE number = ? ORDER BY variant IS NOT NULL').get(number);
  return { number, name: fr?.name ?? en?.name ?? '', colors: colorsOf(number, en?.color) };
}

// Les versions parallèles n'ont pas toujours de couleur chez TCGplayer : celle de la version de base
function colorsOf(number, color) {
  const value = color ?? db.prepare('SELECT color FROM cards WHERE number = ? AND color IS NOT NULL').get(number)?.color;
  return value ? value.split(';') : [];
}

// ---------- Routes ----------

const IMAGE_ROUTES = [
  { path: '/img/:id.jpg', kind: 'product' },
  { path: '/img-fr/:id.jpg', kind: 'fr' },
  { path: '/img-fr-hd/:id.webp', kind: 'fr' },
  { path: '/img-en-hd/:id.webp', kind: 'en' },
];
const IMAGE_ID = /^[A-Z0-9]+(-[A-Z0-9]+)?(_[a-z]\d+)?$/i;

// À brancher avant les routes des visuels, du lien de partage et du jeu (server/index.js)
export function takedownRoutes(app, { flags = takedown, log = console.log } = {}) {
  const cut = [flags.images && 'visuels des cartes', flags.game && 'jeu', flags.publicPages && 'pages publiques'].filter(Boolean);
  if (cut.length) log(`Interrupteur de retrait : coupé(s) : ${cut.join(', ')}`);

  if (flags.images) {
    for (const { path, kind } of IMAGE_ROUTES) {
      app.get(path, (req, res) => {
        if (!IMAGE_ID.test(req.params.id)) return res.sendStatus(400);
        const face = cardFace(cardOf(kind, req.params.id));
        // jamais gardée en cache (navigateur, service worker) : les vrais visuels reviennent dès la remise en route
        res.setHeader('Cache-Control', 'no-store');
        res.type('image/svg+xml').send(face);
      });
    }
  }

  if (flags.game) {
    app.use('/api/game', (req, res) => {
      res.status(503).json({ code: 'game_closed', error: 'Le jeu est fermé pour le moment. Ta collection reste disponible ; tes parties, tes decks, ta Cale et ta progression sont gardés.' });
    });
  }

  if (flags.publicPages) {
    app.use('/api/shared', (req, res) => {
      res.status(503).json({ code: 'public_closed', error: 'Les pages publiques sont fermées pour le moment.' });
    });
  }
}
