// Parcours de référence de l'onglet « Jouer » (tâche R0.1) : un serveur d'essai sur une copie de la base, un compte de
// test créé sur cette copie, puis les parcours joués dans Chrome sans écran, dans 3 formats. Chaque écran donne une
// capture et une ligne du rapport (erreurs, défilement horizontal, cibles < 44 px, textes < 11 px).
//
//   npm run ui:tour -- --port 3501 [--db data/tcgc-test.db] [--out <dossier>] [--only partie,aventure]
//   npm run ui:tour -- --compare <dossier avant> <dossier après> [--out <dossier>]
//
// Mode d'emploi : scripts/ui/README.md.
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './cdp.mjs';
import { compare } from './compare.mjs';
import { measure } from './mesures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Formats d'écran : ordinateur, téléphone en portrait et en paysage (toucher, facteur 3)
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const FORMATS = {
  desktop: { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false, touch: false, userAgent: DESKTOP_UA },
  portrait: { name: 'portrait', width: 390, height: 844, scale: 3, mobile: true, touch: true, userAgent: PHONE_UA },
  paysage: { name: 'paysage', width: 844, height: 390, scale: 3, mobile: true, touch: true, userAgent: PHONE_UA },
};

// Graine des parties : Math.random de la page est remplacé par un tirage fixé, remis à cette graine juste avant de
// lancer une partie (le moteur tire la graine de la partie avec Math.random)
const SEED = 20261022;
// La partie rapide : mon deck contre celui de l'IA (niveau Débutant : l'IA joue sans fil de calcul, donc sans hasard)
const MY_DECK = 'ST-01';
const AI_DECK = 'ST-32';

// Réglages du jeu posés avant la première ouverture (localStorage) : IA rapide, sans son, sans fenêtre d'aide au
// premier lancement, sans fenêtre de détail au survol (elle s'ouvrirait selon le temps passé sur une carte)
const SETTINGS = { speed: 350, sound: false, autoCoach: false, confirmEnd: true, helpSeen: true, zoomDelay: 0 };

// Exécuté au début de chaque page, avant son code
const INIT = `(() => {
  let s = ${SEED} >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = next;
  window.__uiTourSeed = (seed) => { s = seed >>> 0; };
  try {
    if (!localStorage.getItem('tcgc.uiTour')) {
      localStorage.setItem('tcgc.uiTour', '1');
      localStorage.setItem('tcgc.uiLang', 'fr');
      localStorage.setItem('tcgc.game.settings', JSON.stringify(${JSON.stringify(SETTINGS)}));
    }
  } catch {}
  // animations et transitions coupées par une classe posée par le script (pas par le jeu)
  const style = () => {
    if (document.getElementById('ui-tour-still')) return;
    const el = document.createElement('style');
    el.id = 'ui-tour-still';
    el.textContent = 'html.ui-tour-still *, html.ui-tour-still *::before, html.ui-tour-still *::after { animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; scroll-behavior: auto !important; }';
    document.head.appendChild(el);
    document.documentElement.classList.add('ui-tour-still');
  };
  if (document.head) style(); else document.addEventListener('DOMContentLoaded', style, { once: true });
})();`;

// ---------- Les écrans du parcours ----------
// Numéros fixes : un écran garde son numéro même quand on ne joue qu'une partie des parcours (--only)
const SCREENS = {
  '01-accueil': 'Accueil de « Jouer »',
  '02-partie-mulligan': 'Partie rapide : main de départ',
  '03-partie-mon-tour': 'Partie rapide : début de mon tour',
  '04-partie-carte-jouee': 'Partie rapide : une carte jouée',
  '05-partie-don': 'Partie rapide : une DON!! donnée au Leader',
  '06-partie-fin-du-tour': 'Partie rapide : confirmation de la fin du tour',
  '07-partie-defense': 'Partie rapide : l’IA attaque (blocage ou contre)',
  '08-partie-tour-suivant': 'Partie rapide : mon tour suivant',
  '09-partie-attaque-cible': 'Partie rapide : choix de la cible d’une attaque',
  '10-partie-attaque-faite': 'Partie rapide : attaque résolue',
  '11-aventure-accueil': 'Aventure : accueil',
  '12-aventure-carte': 'Aventure : carte d’East Blue',
  '13-aventure-chapitre': 'Aventure : un chapitre',
  '14-aventure-cale': 'Aventure : la Cale',
  '15-aventure-mon-deck': 'Aventure : mon deck d’aventure',
  '16-boutique': 'Boutique',
  '17-mes-decks': 'Mes decks',
  '18-choix-du-leader': 'Mes decks : choix du Leader',
  '19-editeur': 'Éditeur de deck',
  '20-mes-parties': 'Mes parties',
  '21-salon': 'Salon en ligne',
};
const PARCOURS = ['accueil', 'partie', 'aventure', 'decks', 'parties', 'salon'];

const ui = (name) => `[data-ui="${name}"]`;

// ---------- Une session de parcours, dans un format ----------
class Tour {
  constructor(page, format, base, out, log) {
    this.page = page;
    this.format = format;
    this.base = base;
    this.out = out;
    this.log = log;
    this.screens = [];
    this.steps = [];      // ce qui a été fait (sans durée : identique d'un lancement à l'autre)
    this.warnings = [];
    this.failures = [];
    this.durations = {};
  }

  note(text) {
    this.steps.push(text);
    this.log(`  ${this.format.name} · ${text}`);
  }

  // L'élément visible n° index qui répond au sélecteur : amené à l'écran, son point central renvoyé
  async locate(sel, index = 0) {
    return this.page.call((sel, index) => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
      const el = [...document.querySelectorAll(sel)].filter(vis)[index];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const x = (Math.max(0, r.left) + Math.min(innerWidth, r.right)) / 2;
      const y = (Math.max(0, r.top) + Math.min(innerHeight, r.bottom)) / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, onTop: Boolean(hit && (hit === el || el.contains(hit))), disabled: Boolean(el.disabled) };
    }, sel, index);
  }

  async count(sel) {
    return this.page.call((sel) => [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0).length, sel);
  }

  async has(sel) {
    return (await this.count(sel)) > 0;
  }

  // Touche (ou clique) l'élément comme un vrai doigt (ou une vraie souris). S'il est caché par un autre élément, le
  // clic part quand même (et c'est noté dans le rapport) : le parcours continue
  async tap(sel, index = 0) {
    const at = await this.locate(sel, index);
    if (!at) throw new Error(`introuvable : ${sel}`);
    if (at.onTop) await this.page.pointAt(at.x, at.y);
    else {
      this.warnings.push(`${sel} caché par un autre élément : clic direct`);
      await this.page.call((sel, index) => [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0)[index].click(), sel, index);
    }
    await sleep(200);
  }

  async waitUi(sel, what = sel, timeout = 20000) {
    await this.page.waitFor((sel) => [...document.querySelectorAll(sel)].some((el) => el.getBoundingClientRect().width > 0), [sel], { timeout, what });
  }

  async waitGone(sel, timeout = 20000) {
    await this.page.waitFor((sel) => ![...document.querySelectorAll(sel)].some((el) => el.getBoundingClientRect().width > 0), [sel], { timeout, what: `disparition de ${sel}` });
  }

  // Capture de l'écran et ses mesures ; les erreurs relevées depuis l'écran précédent lui sont rattachées
  async capture(id, { pause = 300, keepMouse = false } = {}) {
    await this.page.settle();
    if (!keepMouse) await this.page.mouseAway();
    await sleep(pause);
    const m = await this.page.call(measure, {});
    const errors = this.page.drain().map((e) => errorText(e, this.base));
    await this.page.screenshot(path.join(this.out, `${id}-${this.format.name}.png`));
    this.screens.push({ id, titre: SCREENS[id], ...m, erreurs: errors });
    this.log(`  ${this.format.name} · capture ${id}`);
  }

  async home() {
    await this.page.navigate('about:blank');
    await this.page.navigate(`${this.base}/#play`);
    await this.waitUi(ui('home'), 'écran de départ du jeu', 60000);
  }

  // ---------- Parcours ----------

  async accueil() {
    await this.page.clearCache();
    await this.page.navigate('about:blank');
    const t0 = Date.now();
    await this.page.navigate(`${this.base}/#play`);
    await this.waitUi(ui('home'), 'écran de départ du jeu', 60000);
    this.durations.ouvertureOngletMs = Date.now() - t0;
    await this.capture('01-accueil');
  }

  async partie() {
    await this.home();
    // decks fixés (ceux par défaut peuvent changer) : les Personnages de ST-01 coûtent peu, il en a dès le premier tour.
    // Chaque deck est dans les deux listes (« Ton deck » d'abord, puis « Ton adversaire »)
    await this.tap(ui(`deck.tile-${MY_DECK}`), 0);
    await this.tap(ui(`deck.tile-${AI_DECK}`), 1);
    await this.tap(ui('home.level-1'));
    await this.tap(ui('home.first-ai'));
    await this.page.evaluate(`window.__uiTourSeed(${SEED})`);
    await this.tap(ui('home.start'));
    await this.waitUi(ui('mulligan.keep'), 'main de départ', 60000);
    await this.waitGone(ui('table.intro'));
    await this.capture('02-partie-mulligan');
    await this.tap(ui('mulligan.keep'));
    await this.untilMyTurn();
    await this.capture('03-partie-mon-tour');

    // une carte jouée : la première de la main qui laisse une DON!! à donner, sinon la première jouable
    const hand = `${ui('table.hand')} ${ui('table.card')}`;
    const free = await this.page.call((sel) => Number(document.querySelector(sel)?.querySelector('b')?.textContent ?? 0), `${ui('table.zone-me')} ${ui('table.don')}`);
    const n = await this.count(hand);
    const costs = [];
    for (let i = 0; i < n; i++) {
      await this.tap(hand, i);
      const cost = await this.page.call((sel) => {
        const b = document.querySelector(sel);
        return b ? Number(b.textContent.match(/coût (\d+)/)?.[1] ?? 0) : null;
      }, ui('menu.play'));
      costs.push(cost);
      await this.page.key('Escape', 'Escape', 27);
      await sleep(150);
    }
    const playable = costs.map((c, i) => ({ c, i })).filter((x) => x.c !== null);
    const pick = playable.find((x) => x.c < free) ?? playable[0];
    if (pick) {
      const name = await this.page.call((sel, i) => [...document.querySelectorAll(sel)][i]?.querySelector('img')?.alt ?? '?', hand, pick.i);
      await this.tap(hand, pick.i);
      await this.tap(ui('menu.play'));
      this.note(`carte jouée : ${name} (coût ${pick.c})`);
      await this.untilMyTurn();
      await this.capture('04-partie-carte-jouee');
    } else this.note('aucune carte jouable');

    // une DON!! donnée au Leader (le menu reste ouvert pour en donner d'autres)
    const leader = `${ui('table.zone-me')} ${ui('table.leader')} ${ui('table.card')}`;
    await this.tap(leader);
    if (await this.has(ui('menu.don'))) {
      await this.tap(ui('menu.don'));
      this.note('DON!! donnée au Leader');
      await this.untilMyTurn();
      await this.capture('05-partie-don');
    } else this.note('pas de DON!! à donner');
    await this.page.key('Escape', 'Escape', 27);
    await sleep(200);

    // fin du tour, tour de l'IA (on ne bloque pas et on ne contre pas), retour à mon tour
    await this.tap(ui('table.end-turn'));
    await sleep(300);
    if (await this.has(ui('confirm-end.ok'))) {
      await this.capture('06-partie-fin-du-tour');
      await this.tap(ui('confirm-end.ok'));
    } else this.note('fin du tour sans confirmation');
    await this.untilMyTurn({ defense: true });
    await this.capture('08-partie-tour-suivant');

    // une attaque du Leader sur le Leader adverse (personne n’attaque à son premier tour)
    await this.tap(leader);
    if (await this.has(ui('menu.attack'))) {
      await this.tap(ui('menu.attack'));
      const target = `${ui('table.zone-opp')} ${ui('table.leader')} ${ui('table.card')}`;
      if (this.format.touch) await this.tap(target);   // premier toucher : résultat prévu, « Attaquer » confirme
      else {
        const at = await this.locate(target);
        await this.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      }
      await this.capture('09-partie-attaque-cible', { keepMouse: true });
      if (this.format.touch) await this.tap(ui('table.confirm-attack'));
      else await this.tap(target);
      this.note('attaque du Leader adverse');
      await this.untilMyTurn();
      await this.capture('10-partie-attaque-faite');
    } else {
      this.note('pas d’attaque possible');
      await this.page.key('Escape', 'Escape', 27);
    }

    await this.tap(ui('table.leave'));
    await this.waitUi(ui('home'), 'retour à l’écran de départ');
  }

  // Avance jusqu'à ma prochaine décision principale : garde la main de départ, refuse les choix facultatifs, ne bloque
  // pas et ne contre pas. defense : capture la première décision de défense (attaque de l'IA)
  async untilMyTurn({ defense = false, timeout = 120000 } = {}) {
    const end = Date.now() + timeout;
    let defended = false;
    const PASS = ['noblock', 'pass', 'none', 'no'];
    while (Date.now() < end) {
      const state = await this.page.call(() => {
        const vis = (sel) => [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0);
        if (vis('[data-ui="table.intro"], [data-ui="table.celebration"]').length) return { kind: 'wait' };
        if (vis('[data-ui="mulligan.keep"]').length) return { kind: 'mulligan' };
        if (vis('[data-ui="trigger.hand"]').length) return { kind: 'trigger' };
        if (vis('[data-ui="confirm-end.ok"]').length) return { kind: 'confirm' };
        if (vis('[data-ui="cost.option"]').length) return { kind: 'cost' };
        const pickerOptions = vis('[data-ui^="picker.option-"]').map((el) => el.getAttribute('data-ui').slice('picker.option-'.length));
        if (pickerOptions.length || vis('[data-ui="picker.choose"]').length) return { kind: 'picker', options: pickerOptions };
        const options = vis('[data-ui^="table.option-"]').map((el) => el.getAttribute('data-ui').slice('table.option-'.length));
        if (options.length) return { kind: 'option', options };
        if (vis('[data-ui="table.end-turn"]').length) return { kind: 'main' };
        return { kind: 'wait' };
      }).catch(() => ({ kind: 'wait' }));
      if (state.kind === 'main') return;
      if (state.kind === 'wait') await sleep(200);
      else if (state.kind === 'mulligan') await this.tap(ui('mulligan.keep'));
      else if (state.kind === 'trigger') { this.note('[Déclenchement] : carte prise en main'); await this.tap(ui('trigger.hand')); }
      else if (state.kind === 'confirm') await this.tap(ui('confirm-end.ok'));
      else if (state.kind === 'cost') { this.note('coût déclaré : le premier proposé'); await this.tap(ui('cost.option')); }
      else if (state.kind === 'picker') {
        const id = state.options.find((o) => PASS.includes(o)) ?? state.options[0];
        this.note(id ? `choix d’effet : ${id}` : 'choix d’effet : la première carte');
        await this.tap(id ? ui(`picker.option-${id}`) : ui('picker.choose'));
      } else if (state.kind === 'option') {
        if (defense && !defended) {
          defended = true;
          await this.capture('07-partie-defense');
        }
        const id = state.options.find((o) => PASS.includes(o)) ?? state.options[0];
        this.note(`décision : ${id}`);
        await this.tap(ui(`table.option-${id}`));
      }
      await sleep(150);
    }
    throw new Error('délai dépassé en attendant mon tour');
  }

  async aventure() {
    await this.home();
    await this.tap(ui('home.adventure'));
    await this.page.waitFor(() => Boolean(document.querySelector('[data-ui="adventure.welcome"], [data-ui="adventure.map"]')), [], { what: 'accueil de l’aventure', timeout: 30000 });
    if (await this.has(ui('adventure.welcome'))) {
      await this.capture('11-aventure-accueil');
      await this.tap(ui('adventure.sail'));
    } else this.note('aventure déjà commencée : pas d’accueil');
    await this.waitUi(ui('adventure.map'), 'carte de l’aventure', 30000);
    await sleep(3500);   // le bateau et sa bulle (animations de la carte, en JavaScript)
    await this.capture('12-aventure-carte');
    await this.tap(ui('adventure.go'));
    await this.waitUi(ui('chapter'), 'écran du chapitre');
    await this.capture('13-aventure-chapitre');
    await this.tap(ui('chapter.back'));
    await this.waitUi(ui('adventure.map'));
    await this.tap(ui('adventure.hold'));
    await this.waitUi(ui('hold'), 'la Cale');
    await this.capture('14-aventure-cale');
    await this.tap(ui('hold.back'));
    await this.waitUi(ui('adventure.map'));
    await this.tap(ui('adventure.deck'));
    await this.waitUi(ui('adventure-deck'), 'mon deck d’aventure');
    await this.capture('15-aventure-mon-deck');
    await this.tap(ui('adventure-deck.back'));
    await this.waitUi(ui('adventure.map'));
    await this.tap(ui('adventure.shop'));
    await this.waitUi(ui('shop'), 'la boutique');
    await this.capture('16-boutique');
    await this.tap(ui('shop.back'));
    await this.waitUi(ui('adventure.map'));
    await this.tap(ui('adventure.back'));
    await this.waitUi(ui('home'));
  }

  async decks() {
    await this.home();
    await this.tap(ui('home.decks'));
    await this.waitUi(ui('decks'), 'Mes decks');
    await this.capture('17-mes-decks');
    await this.tap(ui('decks.new'));
    await this.waitUi(ui('leaders'), 'choix du Leader');
    await this.capture('18-choix-du-leader');
    await this.tap(ui('leaders.item'));
    await this.waitUi(ui('editor'), 'éditeur de deck');
    await this.capture('19-editeur');
    await this.tap(ui('editor.back'));
    await this.waitUi(ui('decks'));
    await this.tap(ui('decks.close'));
    await this.waitUi(ui('home'));
  }

  async parties() {
    await this.home();
    await this.tap(ui('home.history'));
    await this.waitUi(ui('history'), 'Mes parties');
    await this.capture('20-mes-parties', { pause: 800 });
    await this.tap(ui('history.close'));
    await this.waitUi(ui('home'));
  }

  async salon() {
    await this.home();
    await this.tap(ui('home.online'));
    await this.waitUi(ui('lobby'), 'salon en ligne');
    await this.capture('21-salon');
    await this.tap(ui('lobby.back'));
    await this.waitUi(ui('home'));
  }
}

// Erreur relevée, sans l'adresse du serveur ni les chiffres variables (pour comparer deux lancements)
function errorText(e, base) {
  const strip = (s) => String(s ?? '').split(base).join('').replace(/\d+/g, '#');
  if (e.kind === 'http') return `HTTP ${e.status} ${strip(e.url)}`;
  return `${e.kind === 'exception' ? 'exception' : e.kind === 'network' ? 'réseau' : 'console'} : ${strip(e.text).slice(0, 300)}`;
}

// ---------- Serveur d'essai ----------

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(true));
  });
}

async function startServer({ port, db, logFile }) {
  if (!(await portFree(port))) throw new Error(`le port ${port} est déjà occupé : choisis-en un autre avec --port`);
  const fd = fs.openSync(logFile, 'w');
  const proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, TCGC_DB: db, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', fd, fd],
  });
  const base = `http://127.0.0.1:${port}`;
  const end = Date.now() + 180000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`le serveur d'essai s'est arrêté (voir ${logFile})`);
    try {
      const r = await fetch(`${base}/api/auth/config`);
      if (r.ok) break;
    } catch {
      // pas encore prêt
    }
    if (Date.now() > end) {
      proc.kill();
      throw new Error(`le serveur d'essai ne répond pas (voir ${logFile})`);
    }
    await sleep(500);
  }
  const stop = async () => {
    if (proc.exitCode === null) {
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await Promise.race([exited, sleep(5000)]);
    }
    fs.closeSync(fd);
  };
  return { proc, base, stop };
}

// Compte de test sur la copie de la base : identifiants inventés, jamais affichés
async function signup(page, base, format) {
  await page.navigate(`${base}/`);
  const pseudo = `tour-${format}`;
  const password = crypto.randomBytes(18).toString('base64url');
  const r = await page.call(async (pseudo, password) => {
    const res = await fetch('api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pseudo, email: `${pseudo}@exemple.invalid`, password }) });
    return res.status;
  }, pseudo, password);
  if (r !== 200 && r !== 201) throw new Error(`création du compte de test refusée (HTTP ${r})`);
}

// ---------- Programme ----------

function parseArgs(argv) {
  const a = { port: 3500, db: 'data/tcgc-test.db', only: PARCOURS, formats: Object.keys(FORMATS), headed: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      if (i + 1 >= argv.length) throw new Error(`valeur manquante après ${k}`);
      return argv[++i];
    };
    if (k === '--port') a.port = Number(v());
    else if (k === '--db') a.db = v();
    else if (k === '--out') a.out = v();
    else if (k === '--only') a.only = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--formats') a.formats = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--headed') a.headed = true;
    else if (k === '--compare') a.compare = [v(), v()];
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`option inconnue : ${k} (voir scripts/ui/README.md)`);
  }
  for (const p of a.only) if (!PARCOURS.includes(p)) throw new Error(`parcours inconnu : ${p} (parcours : ${PARCOURS.join(', ')})`);
  for (const f of a.formats) if (!FORMATS[f]) throw new Error(`format inconnu : ${f} (formats : ${Object.keys(FORMATS).join(', ')})`);
  if (!Number.isInteger(a.port) || a.port < 1024) throw new Error('--port : un numéro de port (par exemple 3501)');
  return a;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function commit() {
  try {
    return execSync('git describe --always --dirty', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'inconnu';
  }
}

// Le build est-il plus ancien que le code de l'interface ? (on oublie facilement « npm run build »)
function newestMtime(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) t = Math.max(t, newestMtime(p));
    else if (/\.(tsx?|css)$/.test(e.name)) t = Math.max(t, fs.statSync(p).mtimeMs);
  }
  return t;
}

function summary(reports) {
  const lines = ['# Parcours `ui:tour`', ''];
  const first = Object.values(reports)[0];
  lines.push(`Commit : \`${first.commit}\` · lancé le ${first.lanceLe}`, '');
  lines.push(`| Écran | ${Object.keys(reports).map((f) => `${f} : cibles < 44 px · textes < 11 px · erreurs`).join(' | ')} |`);
  lines.push(`|---|${Object.keys(reports).map(() => '---').join('|')}|`);
  for (const id of Object.keys(SCREENS)) {
    const cells = Object.values(reports).map((r) => {
      const s = r.ecrans.find((e) => e.id === id);
      return s ? `${s.cibles.petites} · ${s.textes.petits} · ${s.erreurs.length}${s.defilementHorizontal ? ' · ↔ défilement' : ''}` : '—';
    });
    if (cells.some((c) => c !== '—')) lines.push(`| ${id} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  for (const [f, r] of Object.entries(reports)) {
    lines.push(`- **${f}** : ouverture de l’onglet en ${r.durees.ouvertureOngletMs ?? '?'} ms, parcours en ${Math.round(r.durees.totalMs / 1000)} s` +
      `${r.echecs.length ? ` ; **échecs** : ${r.echecs.join(' ; ')}` : ''}${r.avertissements.length ? ` ; avertissements : ${r.avertissements.length}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(path.join(ROOT, 'scripts/ui/README.md'), 'utf8'));
    return 0;
  }
  if (args.compare) {
    const out = path.resolve(args.out ?? path.join(args.compare[1], 'comparaison'));
    const result = compare(path.resolve(args.compare[0]), path.resolve(args.compare[1]), out);
    console.log(result.text);
    console.log(`\nComparaison écrite dans ${out}`);
    return 0;
  }

  // la copie de la base : jamais la vraie base, et une nouvelle copie à chaque lancement (même point de départ)
  const source = path.resolve(ROOT, args.db);
  if (!fs.existsSync(source)) throw new Error(`base introuvable : ${source} (préparée par outils/preparer-worktree.ps1)`);
  if (path.basename(source).toLowerCase() === 'tcgc.db') throw new Error('refusé : tcgc.db est la vraie base ; donne une copie avec --db (par exemple data/tcgc-test.db)');
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('interface non construite : lance d’abord « npm run build »');
  const code = Math.max(newestMtime(path.join(ROOT, 'game/ui')), newestMtime(path.join(ROOT, 'web/src')));
  if (fs.statSync(path.join(ROOT, 'dist/index.html')).mtimeMs < code) console.warn('⚠ Le build est plus ancien que le code de l’interface : relance « npm run build » pour capturer la version actuelle.');

  const out = path.resolve(args.out ?? path.join(os.tmpdir(), `ui-tour-${stamp()}`));
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-tour-travail-'));
  const db = path.join(work, 'base.db');
  fs.copyFileSync(source, db);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, db + ext);

  const journal = fs.createWriteStream(path.join(out, 'journal.txt'));
  const log = (s) => { console.log(s); journal.write(`${s}\n`); };
  log(`Parcours ${args.only.join(', ')} · formats ${args.formats.join(', ')} · sortie ${out}`);

  let server;
  let browser;
  const reports = {};
  let failed = false;
  try {
    server = await startServer({ port: args.port, db, logFile: path.join(out, 'serveur.log') });
    log(`Serveur d'essai prêt sur ${server.base} (copie de ${path.relative(ROOT, source)})`);
    browser = await launchBrowser({ profileDir: path.join(work, 'chrome'), headless: !args.headed });
    for (const name of args.formats) {
      const format = FORMATS[name];
      const started = Date.now();
      const page = await browser.newPage();
      await page.setFormat(format);
      await page.addInitScript(INIT);
      const tour = new Tour(page, format, server.base, out, log);
      log(`— ${name} (${format.width}×${format.height})`);
      try {
        await signup(page, server.base, name);
        page.drain();
        for (const p of PARCOURS.filter((x) => args.only.includes(x))) {
          const t = Date.now();
          try {
            await tour[p]();
          } catch (e) {
            failed = true;
            tour.failures.push(`${p} : ${e.message}`);
            log(`  ✗ ${name} · ${p} : ${e.message}`);
            await page.screenshot(path.join(out, `echec-${p}-${name}.png`)).catch(() => {});
          }
          tour.durations[`${p}Ms`] = Date.now() - t;
        }
      } catch (e) {
        failed = true;
        tour.failures.push(e.message);
        log(`  ✗ ${name} : ${e.message}`);
      }
      await page.close();
      reports[name] = {
        outil: 'ui:tour',
        version: 1,
        commit: commit(),
        format: { nom: name, largeur: format.width, hauteur: format.height, facteur: format.scale, toucher: format.touch },
        parcours: args.only,
        ecrans: tour.screens,
        etapes: tour.steps,
        avertissements: tour.warnings,
        echecs: tour.failures,
        totaux: {
          ecrans: tour.screens.length,
          ciblesPetites: tour.screens.reduce((n, s) => n + s.cibles.petites, 0),
          textesPetits: tour.screens.reduce((n, s) => n + s.textes.petits, 0),
          erreurs: tour.screens.reduce((n, s) => n + s.erreurs.length, 0),
          defilementHorizontal: tour.screens.filter((s) => s.defilementHorizontal).map((s) => s.id),
        },
        // seule partie qui change d'un lancement à l'autre
        lanceLe: new Date().toISOString(),
        durees: { ...tour.durations, totalMs: Date.now() - started },
      };
      fs.writeFileSync(path.join(out, `rapport-${name}.json`), `${JSON.stringify(reports[name], null, 2)}\n`);
    }
  } finally {
    await browser?.close();
    await server?.stop();
    try {
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (e) {
      console.warn(`⚠ Dossier de travail non supprimé (${work}) : ${e.message}`);
    }
  }
  if (Object.keys(reports).length) fs.writeFileSync(path.join(out, 'rapport.md'), summary(reports));
  log(`\nCaptures et rapports : ${out}`);
  journal.end();
  return failed ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  console.error(`ui:tour : ${e.message}`);
  process.exitCode = 2;
});
