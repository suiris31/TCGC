// Parcours complets de l'étape R (tâche R4.1), ajoutés à la classe Tour de tour.mjs : parties jouées jusqu'au bout
// (partie rapide, chapitre d'aventure gagné, partie en ligne à deux comptes), achat et ouverture d'un display, visuels
// choisis dans l'éditeur, Retour d'Android à chaque niveau, mouvements réduits. Ils ne sont joués que quand --only
// les demande (ou --only tout) : la référence de l'étape (scripts/ui/reference) ne les contient pas.
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ui = (name) => `[data-ui="${name}"]`;

// Numéros fixes, à la suite de ceux de tour.mjs (30 est pris par l'atelier)
export const COMPLETE_SCREENS = {
  '27-accueil-continuer': 'Accueil : « Continuer » une partie rapide interrompue',
  '28-partie-reprise': 'Partie rapide reprise depuis l’accueil',
  '29-partie-fin': 'Partie rapide jouée jusqu’au bout : écran de fin',
  '31-partie-recap': 'Partie rapide : récapitulatif du coach',
  '32-partie-detail': 'Partie rapide : son détail dans « Mes parties »',
  '33-ia-pause': 'Tour de l’IA en pause',
  '34-ia-pas-a-pas': 'Tour de l’IA : une décision de plus (pas à pas)',
  '35-chapitre-victoire': 'Chapitre d’aventure gagné : écran de fin',
  '36-chapitre-recompenses': 'Chapitre d’aventure gagné : récompenses',
  '37-accueil-apres-chapitre': 'Accueil après la victoire (aventure en cours)',
  '38-boutique-display': 'Boutique : achat d’un display (confirmation)',
  '39-ouverture': 'Ouverture d’un display : un booster révélé',
  '40-ouverture-arretee': 'Ouverture arrêtée (« Finir plus tard »)',
  '41-cale-a-ouvrir': 'La Cale : les boosters restants, après rechargement',
  '42-ouverture-finie': 'Ouverture reprise et finie : récapitulatif',
  '43-editeur-versions': 'Éditeur : choix de la version du Leader',
  '44-editeur-don': 'Éditeur : choix de la DON!! du deck',
  '45-editeur-visuels': 'Éditeur : version et DON!! choisies',
  '46-plateau-visuels': 'Plateau : la version et la DON!! choisies',
  '47-en-ligne-plateau': 'Partie en ligne à deux comptes : plateau',
  '48-en-ligne-fin': 'Partie en ligne jouée jusqu’au bout : écran de fin',
  '49-retour-quitter': 'Retour d’Android pendant une partie : « Quitter la partie ? »',
  '50-mouvements-reduits': 'Réglage « Animations réduites » : plateau sans animation en boucle',
};

export const COMPLETE_PARCOURS = ['continuer', 'fin', 'chapitre', 'boosters', 'visuels', 'en-ligne', 'retour', 'mouvements'];

// ---------- Joueur automatique (exécuté dans la page) ----------
// Politique simple qui finit une partie : garder sa main, jouer ses cartes, donner ses DON!!, attaquer le Leader
// adverse, ne pas bloquer ni contrer, finir son tour. Renvoie ce qu'il faut toucher (ou 'end', 'wait', 'sending').
function decide(tried) {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const q = (sel) => [...document.querySelectorAll(sel)].filter(vis);
  const at = (el, what) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { what, x: r.left + r.width / 2, y: r.top + r.height / 2, uid: el.dataset.uid ? Number(el.dataset.uid) : undefined };
  };
  const first = (sel, what = sel) => { const el = q(sel)[0]; return el ? at(el, what) : null; };
  if (q('[data-ui="end"]').length) return { what: 'end' };
  const modal = first('[data-ui="table.celebration"]') ?? first('[data-ui="table.intro"]') ?? first('[data-ui="help.close"]')
    ?? first('[data-ui="tip.close"]') ?? first('[data-ui="mulligan.keep"]') ?? first('[data-ui="trigger.activate"]')
    ?? first('[data-ui="cost.option"]') ?? first('[data-ui="picker.choose"]') ?? first('[data-ui^="picker.option-"]')
    ?? first('[data-ui="confirm-end.ok"]');
  if (modal) return modal;
  if (q('[data-ui="menu"]').length) {
    return first('[data-ui="menu.attack"]') ?? first('[data-ui="menu.choose"]') ?? first('[data-ui="menu.play"]') ?? first('[data-ui="menu.event"]')
      ?? first('[data-ui="menu.don"]') ?? first('[data-ui="menu.act"]') ?? first('[data-ui="menu.close"]');
  }
  if (q('[data-ui="table.sending"]').length) return { what: 'sending' };
  // ciblage d'une attaque : le Leader adverse s'il est ciblable (au doigt : toucher, puis « Attaquer »)
  if (q('[data-ui="table.cancel-target"]').length) {
    return first('[data-ui="table.confirm-attack"]')
      ?? first('[data-ui="table.zone-opp"] [data-ui="table.leader"] .is-target', 'cible-leader')
      ?? first('.table .is-target', 'cible');
  }
  if (q('[data-ui="table.end-turn"]').length) {
    const cards = [...q('[data-ui="table.zone-me"] .is-actionable'), ...q('[data-ui="table.hand"] .is-actionable')]
      .filter((el) => !tried.includes(Number(el.dataset.uid)));
    return cards.length ? at(cards[0], 'carte') : first('[data-ui="table.end-turn"]', 'fin-du-tour');
  }
  // autre décision : un bouton (Ne pas bloquer, Ne plus contrer...), sinon une carte à choisir pour un effet
  const option = first('[data-ui^="table.option-"]');
  if (option) return option;
  const choose = q('.table .is-choose')[0];
  if (choose) return at(choose, 'carte-effet');
  return { what: 'wait' };
}

// Suit le conseil du coach à chaque décision du plateau (onglet Coach du panneau, ouvert au besoin) ; 'rien' : la politique simple prend la main
function coached() {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const q = (sel) => [...document.querySelectorAll(sel)].filter(vis);
  if (q('[data-ui="end"]').length) return 'end';
  if (q('[data-ui="table.celebration"], [data-ui="table.intro"]').length) return 'fx';
  // toute décision du plateau (phase principale, défense) ; les fenêtres et le menu restent à la politique simple
  if (q('[data-ui="menu"], [role="dialog"]').length) return 'rien';
  if (!q('[data-ui="table.end-turn"], [data-ui^="table.option-"]').length) return 'rien';
  const best = q('.hint-best')[0];
  if (best) { best.click(); return 'conseil'; }
  const ask = q('.coach-ask')[0];
  if (ask) { if (!ask.disabled) ask.click(); return ask.disabled ? 'attente' : 'demande'; }
  const tab = q('[data-ui="table.tab-coach"]')[0] ?? q('[data-ui="table.rail-coach"]')[0];
  if (tab && !tab.classList.contains('on')) { tab.click(); return 'onglet'; }
  const panel = q('[data-ui="table.panel"]')[0];
  if (!tab && panel) { panel.click(); return 'onglet'; }
  return 'rien';
}

// Exécuté dans la page : les animations en boucle qui tournent (copie de celle de tour.mjs, qui ne s'importe pas)
function runningLoops() {
  const where = (el) => (el ? `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').trim().split(/\s+/).join('.')}` : '?');
  return document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
    .map((a) => `${a.animationName ?? '?'} sur ${where(a.effect?.target)}`);
}

// ---------- Les parcours, ajoutés à Tour ----------
export function installComplete(Tour, { SEED, MY_DECK, AI_DECK, FORMATS }) {
  const methods = {
    async hash(page = this.page) {
      return page.call(() => location.hash);
    },

    // Vérifie l'écran et l'adresse ; sinon le parcours échoue en disant ce qu'on voit
    async expect(sel, hash, what) {
      await this.waitUi(sel, what);
      const h = await this.hash();
      if (hash !== undefined && (hash instanceof RegExp ? !hash.test(h) : h !== hash)) throw new Error(`${what} : adresse ${h}, attendue ${hash}`);
    },

    // Le bouton Retour d'Android (ou du navigateur)
    async back() {
      await this.page.call(() => history.back());
      await sleep(600);
    },

    // Joue un coup de la politique simple sur la page
    async step(page, tried) {
      const d = await page.call(decide, [...tried]);
      d.what = d.what.replace(/^\[data-ui\^?="([^"]+)"\]$/, '$1');
      if (d.what === 'end' || d.what === 'wait' || d.what === 'sending') return d.what;
      if (d.what === 'fin-du-tour') tried.clear();
      if (d.uid !== undefined && d.what === 'carte') tried.add(d.uid);
      await page.pointAt(d.x, d.y);
      return d.what;
    },

    // Joue jusqu'à l'écran de fin. coach : suit le conseil du coach à chaque décision de ma phase principale.
    // onTick(page) : appelé à chaque tour de boucle (pause de l'IA)
    async playToEnd({ page = this.page, coach = false, timeout = 900000, onTick } = {}) {
      const tried = new Set();
      const counts = {};
      this.played = counts;
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (onTick) await onTick();
        if (coach) {
          const w = await page.call(coached).catch(() => 'rien');
          counts[w] = (counts[w] ?? 0) + 1;
          if (w === 'end') return;
          if (w !== 'rien' && w !== 'fx') { await sleep(w === 'attente' ? 150 : 250); continue; }
        }
        const what = await this.step(page, tried).catch(() => 'wait');
        if (what === 'end') return;
        await sleep(what === 'wait' || what === 'sending' ? 120 : 60);
      }
      throw new Error('partie pas finie dans le temps imparti');
    },

    // L'écran de fin : titre et boutons
    async endInfo(page = this.page) {
      await sleep(600);
      return page.call(() => {
        const e = document.querySelector('[data-ui="end"] .op-end');
        if (!e) return null;
        return { mode: e.dataset.mode, title: e.querySelector('.op-end-title')?.innerText.trim(), buttons: [...e.querySelectorAll('.op-end-actions button')].map((b) => b.dataset.ui) };
      });
    },

    async waitRecap() {
      const end = Date.now() + 300000;
      while (Date.now() < end) {
        if (await this.has(ui('end.recap'))) return;
        if (!(await this.has(ui('end')))) throw new Error('écran de fin fermé avant le récapitulatif');
        await sleep(1000);
      }
      throw new Error('récapitulatif du coach pas arrivé');
    },

    // Une partie rapide lancée (mes decks fixés, IA Débutant qui commence, graine fixe), main de départ gardée
    async startQuick() {
      await this.quick();
      await this.quickDecks();
      await this.tap(ui('home.level-1'));
      await this.tap(ui('home.first-ai'));
      await this.page.evaluate(`window.__uiTourSeed(${SEED})`);
      await this.tap(ui('home.start'));
      await this.waitUi(ui('mulligan.keep'), 'main de départ', 60000);
      await this.waitGone(ui('table.intro'));
    },

    // L'aventure commencée (accueil de l'aventure passé) : la carte
    async adventureMap() {
      await this.home();
      // aventure commencée : « Carte » (le gros bouton « Continuer l'aventure » ouvre le chapitre en cours)
      await this.tap((await this.has(ui('home.adventure-map'))) ? ui('home.adventure-map') : ui('home.adventure'));
      await this.page.waitFor(() => Boolean(document.querySelector('[data-ui="adventure.welcome"], [data-ui="adventure.map"]')), [], { what: 'aventure', timeout: 30000 });
      if (await this.has(ui('adventure.welcome'))) await this.tap(ui('adventure.sail'));
      await this.waitUi(ui('adventure.map'), 'carte de l’aventure', 30000);
      await sleep(3500);   // le bateau et sa bulle
    },

    // Mouvements réduits : aucune animation en boucle à l'écran
    async noLoops(where) {
      const loops = await this.page.call(runningLoops);
      if (loops.length) throw new Error(`animations réduites, ${where} : animations en boucle : ${loops.join(', ')}`);
    },

    // ---------- accueil : « Continuer » ----------
    // Une partie rapide laissée en cours (celle du parcours partie, sinon une nouvelle) se reprend depuis l'accueil
    async continuer() {
      await this.home();
      if (!(await this.has(ui('home.resume')))) {
        await this.startQuick();
        await this.tap(ui('mulligan.keep'));
        await this.untilMyTurn();
        await this.tap(ui('table.leave'));
        await this.waitUi(ui('quick'), 'retour à la partie rapide');
        await this.home();
      }
      await this.waitUi(ui('home.resume'), '« Continuer » : la partie interrompue');
      await this.capture('27-accueil-continuer');
      await this.tap(ui('home.resume-go'));
      await this.waitUi(ui('table'), 'partie reprise', 60000);
      await this.untilMyTurn();
      await this.capture('28-partie-reprise');
      // reprise depuis l'accueil : « Quitter » y revient
      await this.tap(ui('table.leave'));
      await this.expect(ui('home'), '#play', 'retour à l’accueil');
    },

    // ---------- partie rapide complète (et pause de l'IA) ----------
    async fin() {
      await this.startQuick();
      // un tour de l'IA : pause, une décision pas à pas, puis reprise. Le pas à pas n'existe que quand c'est à l'IA de
      // décider (pas pendant ma défense) : sinon la pause est levée et retentée plus tard
      let paused = false;
      let tries = 0;
      const pause = async () => {
        if (paused || tries >= 20 || !(await this.has(ui('table.pause')))) return;
        // pas à travers une fenêtre (main de départ, défense...)
        if (!(await this.locate(ui('table.pause')))?.onTop) return;
        tries++;
        await this.tap(ui('table.pause'));
        await this.waitUi(ui('table.resume'), 'IA en pause');
        const ready = await this.page.waitFor(() => Boolean(document.querySelector('[data-ui="table.step"]')), [], { timeout: 4000 }).catch(() => false);
        if (!ready) {
          await this.tap(ui('table.resume'));
          return;
        }
        paused = true;
        await this.capture('33-ia-pause');
        const before = await this.page.call(() => document.querySelector('[data-ui="table.last-move"]')?.innerText ?? '');
        await this.tap(ui('table.step'));
        await this.page.waitFor((b) => (document.querySelector('[data-ui="table.last-move"]')?.innerText ?? '') !== b || !document.querySelector('[data-ui="table.step"]'), [before], { what: 'une décision de l’IA (pas à pas)', timeout: 15000 });
        await this.capture('34-ia-pas-a-pas');
        if (await this.has(ui('table.resume'))) await this.tap(ui('table.resume'));
        this.note('IA : pause, pas à pas, reprise');
      };
      await this.playToEnd({ onTick: pause });
      if (!paused) this.note('IA : bouton pause jamais vu');
      const info = await this.endInfo();
      if (info?.mode !== 'ia') throw new Error(`écran de fin : ${JSON.stringify(info)}`);
      this.note(`partie rapide finie : ${info.title}`);
      await this.capture('29-partie-fin');
      await this.waitRecap();
      await this.capture('31-partie-recap');
      // « Voir le plateau » puis « Voir le résultat » ; « Mes parties » ouvre le détail de la partie
      await this.tap(ui('end.board'));
      await this.waitUi(ui('table.reopen-end'), '« Voir le résultat »');
      await this.tap(ui('table.reopen-end'));
      await this.waitUi(ui('end.history'));
      await this.tap(ui('end.history'));
      await this.expect(ui('history'), /^#play\/parties\/.+/, 'détail de la partie');
      await this.capture('32-partie-detail', { pause: 800 });
      await this.tap(`${ui('history')} ${ui('dialog.close')}`);
      await this.expect(ui('home'), '#play', 'accueil après Mes parties');
    },

    // ---------- chapitre d'aventure gagné ----------
    async chapitre() {
      await this.adventureMap();
      await this.tap(ui('adventure.go'));
      await this.waitUi(ui('chapter.fight'), 'écran du chapitre');
      while (await this.has(ui('chapter.skip'))) await this.tap(ui('chapter.skip'));
      await this.page.evaluate(`window.__uiTourSeed(${SEED})`);
      await this.tap(ui('chapter.fight'));
      let won = false;
      for (let n = 1; n <= 4 && !won; n++) {
        await this.waitUi(ui('table'), 'plateau d’aventure', 60000);
        await this.playToEnd({ coach: true });
        const info = await this.endInfo();
        if (info?.mode !== 'aventure') throw new Error(`écran de fin : ${JSON.stringify(info)}`);
        won = info.title === 'Victoire !';
        this.note(`chapitre, partie ${n} : ${info.title} (coach : ${this.played.conseil ?? 0} conseils suivis)`);
        if (won) await this.capture('35-chapitre-victoire');
        await this.tap(ui('end.next'));
        await this.waitUi(ui('rewards'), 'récompenses');
        if (!won) {
          await this.tap(ui('rewards.retry'));
          await sleep(800);
        }
      }
      if (!won) throw new Error('chapitre 1 perdu 4 fois');
      await this.page.waitFor(() => /฿/.test(document.querySelector('[data-ui="rewards"]')?.innerText ?? ''), [], { what: 'gain des récompenses', timeout: 40000 });
      await this.capture('36-chapitre-recompenses', { pause: 1500 });
      await this.tap((await this.has(ui('rewards.later'))) ? ui('rewards.later') : ui('rewards.map'));
      await this.waitUi(ui('adventure.map'), 'retour à la carte', 30000);
      await this.tap(ui('adventure.back'));
      await this.expect(ui('home'), '#play', 'accueil');
      await this.waitUi(ui('home.adventure-card'));
      await this.capture('37-accueil-apres-chapitre');
    },

    // ---------- display acheté, ouverture interrompue puis reprise ----------
    async boosters() {
      await this.adventureMap();
      // des Berry sur la copie de la base, pour un display
      await this.page.call(async () => (await fetch('api/game/wallet')).status);
      const db = new DatabaseSync(this.db);
      db.prepare('UPDATE game_wallet SET balance = 2500 WHERE user_id = (SELECT id FROM users WHERE pseudo = ?)').run(`tour-${this.format.name}`);
      db.close();
      const left = async () => (await this.page.call(async () => (await (await fetch('api/game/adventure')).json()).boosters.length));
      const before = await left();

      await this.home();
      await this.tap(ui('home.shop'));
      await this.waitUi(ui('shop'), 'la boutique');
      await this.page.waitFor(() => document.querySelector('[data-ui="shop.buy-display"]')?.disabled === false, [], { what: 'display à acheter' });
      await this.tap(ui('shop.buy-display'));
      await this.waitUi(ui('shop.confirm-buy'), 'confirmation de l’achat');
      await this.capture('38-boutique-display');
      await this.tap(ui('shop.confirm-buy'));
      await this.waitUi(ui('shop.open'), 'display acheté');
      if ((await left()) !== before + 24) throw new Error(`display acheté : ${await left()} boosters à ouvrir (avant : ${before})`);
      await this.tap(ui('shop.open'));
      await this.waitUi(ui('opening'), 'ouverture');

      // deux boosters « un par un », puis « Finir plus tard »
      const stage = (s) => this.page.waitFor((s) => document.querySelector('[data-ui="opening"] [data-stage]')?.dataset.stage === s, [s], { what: `ouverture : étape ${s}` });
      await stage('choose');
      await this.tap(ui('opening.primary'));   // Un par un
      for (let k = 1; k <= 2; k++) {
        await stage('pack');
        await this.tap(ui('opening.pack'));
        await stage('reveal');
        await this.tap(ui('opening.secondary'));   // Tout révéler
        await this.page.waitFor(() => /Booster suivant/.test(document.querySelector('[data-ui="opening.primary"]')?.textContent ?? ''), [], { what: 'booster révélé' });
        if (k === 1) {
          await this.capture('39-ouverture', { pause: 1200 });
          await this.tap(ui('opening.primary'));   // Booster suivant
        }
      }
      await this.tap(ui('opening.stop'));
      await this.waitUi(ui('opening.left'), 'récapitulatif de l’ouverture arrêtée');
      await this.capture('40-ouverture-arretee', { pause: 800 });
      if ((await left()) !== before + 22) throw new Error(`ouverture arrêtée : ${await left()} boosters à ouvrir (attendu ${before + 22})`);
      await this.tap(ui('opening.primary'));   // Terminer
      await this.waitGone(ui('opening'));

      // la page rechargée : la Cale garde les boosters restants ; « Tout ouvrir » reprend
      await this.adventureMap();
      await this.tap(ui('adventure.hold'));
      await this.waitUi(ui('hold.open-all'), 'la Cale et ses boosters');
      await this.capture('41-cale-a-ouvrir');
      await this.tap(ui('hold.open-all'));
      await stage('choose');
      await this.tap(ui('opening.secondary'));   // Tout ouvrir
      await stage('recap');
      await this.capture('42-ouverture-finie', { pause: 800 });
      if ((await left()) !== 0) throw new Error(`ouverture reprise : ${await left()} boosters encore à ouvrir`);
      await this.tap(ui('opening.primary'));   // Terminer
      await this.waitGone(ui('opening'));
      await this.tap(ui('hold.back'));
      await this.waitUi(ui('adventure.map'));
      this.note(`display acheté et ouvert : 2 boosters, arrêt, rechargement, ${before + 22} boosters ouverts depuis la Cale`);
    },

    // ---------- éditeur : version du Leader et DON!! du deck, vues sur le plateau ----------
    async visuels() {
      await this.home();
      await this.tap(ui('home.decks'));
      await this.waitUi(ui('decks'), 'Mes decks');
      await this.tap(ui('decks.copy'));
      await this.waitUi(`${ui('decks.copy-dialog')} ${ui(`deck.tile-${AI_DECK}`)}`, 'copie d’un deck');
      await this.tap(`${ui('decks.copy-dialog')} ${ui(`deck.tile-${AI_DECK}`)}`);
      await this.waitUi(ui('editor'), 'éditeur');
      const saved = () => this.page.waitFor(() => document.querySelector('[data-ui="editor.save"]')?.textContent === 'Enregistré', [], { timeout: 15000, what: 'deck enregistré' });
      await saved();
      if (this.format.touch) await this.tap(ui('editor.pane-deck'));
      await this.waitUi(ui('editor.don'));
      const src = (sel) => this.page.call((sel) => document.querySelector(sel)?.getAttribute('src') ?? null, sel);

      await this.tap(`.op-db-looks ${ui('editor.art')}`);
      await this.waitUi(`${ui('looks.versions')} [role="dialog"]`, 'versions du Leader');
      await this.capture('43-editeur-versions', { pause: 800 });
      await this.tap('[data-ui^="looks.version-"]:not([data-ui="looks.version-base"])');
      await this.waitGone(`${ui('looks.versions')} [role="dialog"]`);
      await saved();
      const leader = await src('.op-db-looks .op-db-art img');

      const don0 = await src('.op-db-don-img img');
      await this.tap(ui('editor.don'));
      await this.waitUi(ui('looks.don-item'), 'DON!! proposées');
      await this.capture('44-editeur-don', { pause: 800 });
      await this.tap(ui('looks.don-item'), 1);
      await this.waitGone(`${ui('looks.don')} [role="dialog"]`);
      await saved();
      const don = await src('.op-db-don-img img');
      if (!leader || !don || don === don0) throw new Error(`visuels choisis : Leader ${leader}, DON!! ${don0} → ${don}`);
      await this.capture('45-editeur-visuels', { pause: 800 });

      // « Jouer » avec ce deck : le plateau montre la version et la DON!!
      await this.tap(ui('editor.play'));
      await this.waitUi(ui('home.start'), 'partie rapide avec le deck');
      await this.tap(ui('home.start'));
      await this.waitUi(ui('mulligan.keep'), 'main de départ', 60000);
      await this.waitGone(ui('table.intro'));
      await this.tap(ui('mulligan.keep'));
      await this.untilMyTurn();
      const board = await this.page.call(() => [...document.querySelectorAll('[data-ui="table.zone-me"] img')].map((i) => i.getAttribute('src')));
      const tail = (s) => s.replace(/^.*\//, '');
      if (!board.some((s) => tail(s) === tail(leader))) throw new Error(`plateau : le Leader n’est pas dans sa version (${tail(leader)})`);
      if (!board.some((s) => tail(s) === tail(don))) throw new Error(`plateau : la DON!! choisie manque (${tail(don)})`);
      this.note(`visuels : Leader ${tail(leader)}, DON!! ${tail(don)}, vus sur le plateau`);
      await this.capture('46-plateau-visuels');
      await this.tap(ui('table.leave'));
      await this.waitUi(ui('quick'), 'retour à la partie rapide');
    },

    // ---------- partie en ligne à deux comptes, jusqu'au bout ----------
    // Moi dans le format du parcours, l'ami sur ordinateur, dans un contexte à part (son propre compte)
    async 'en-ligne'() {
      const friend = await this.page.browser.newPage();
      try {
        await friend.setFormat(FORMATS.desktop);
        await friend.addInitScript(this.init);
        await friend.navigate(`${this.base}/`);
        const pseudo = `tour-${this.format.name}-ami`;
        const password = crypto.randomBytes(18).toString('base64url');
        const st = await friend.call(async (pseudo, password) => (await fetch('api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pseudo, email: `${pseudo}@exemple.invalid`, password }) })).status, pseudo, password);
        if (st !== 200 && st !== 201) throw new Error(`compte de l’ami refusé (HTTP ${st})`);
        friend.drain();

        // je crée la salle avec mon deck, l'ami la rejoint par le lien (code prérempli)
        await this.home();
        await this.tap(ui('home.online'));
        await this.waitUi(ui('lobby'), 'salon');
        await this.tap(ui('lobby.create'));
        await this.waitUi(ui('room.code'), 'salle d’attente');
        const code = (await this.page.call(() => document.querySelector('[data-ui="room.code"]').textContent)).replace(/[^A-Z0-9]/gi, '');
        await friend.navigate('about:blank');
        await friend.navigate(`${this.base}/#play/salle/${code}`);
        await friend.waitFor(() => Boolean(document.querySelector('[data-ui="lobby.join"]')), [], { what: 'salon de l’ami', timeout: 60000 });
        const at = await friend.call(() => { const r = document.querySelector('[data-ui="lobby.join"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await friend.pointAt(at.x, at.y);
        await this.waitUi(ui('table'), 'plateau en ligne', 60000);
        await friend.waitFor(() => Boolean(document.querySelector('[data-ui="table"]')), [], { what: 'plateau de l’ami', timeout: 60000 });

        // les deux joueurs jouent chacun leur tour, jusqu'à la fin
        const tried = new Map([[this.page, new Set()], [friend, new Set()]]);
        const done = new Set();
        let shot = false;
        const end = Date.now() + 25 * 60000;
        while (done.size < 2) {
          if (Date.now() > end) throw new Error('partie en ligne trop longue');
          if (!shot && await this.has(ui('table.end-turn'))) {
            shot = true;
            await this.capture('47-en-ligne-plateau');
          }
          for (const p of [this.page, friend]) {
            if (done.has(p)) continue;
            if ((await this.step(p, tried.get(p)).catch(() => 'wait')) === 'end') done.add(p);
          }
          await sleep(60);
        }
        const info = await this.endInfo();
        if (info?.mode !== 'en-ligne') throw new Error(`écran de fin en ligne : ${JSON.stringify(info)}`);
        this.note(`partie en ligne finie : ${info.title}`);
        await this.page.waitFor(() => /฿|rien|trop/i.test(document.querySelector('[data-ui="end"] .op-gain')?.innerText ?? ''), [], { what: 'gain de la partie en ligne', timeout: 40000 }).catch(() => this.note('en ligne : gain pas affiché'));
        await this.capture('48-en-ligne-fin');
        const errors = friend.drain();
        if (errors.length) this.warnings.push(`en ligne, page de l’ami : ${errors.length} erreur(s) : ${errors.map((e) => e.text ?? `HTTP ${e.status}`).join(' ; ').replace(/\d+/g, '#').slice(0, 300)}`);
        await this.tap(ui('end.home'));
        await this.expect(ui('home'), '#play', 'accueil après la partie en ligne');
      } catch (e) {
        await friend.screenshot(path.join(this.out, `echec-en-ligne-ami-${this.format.name}.png`)).catch(() => {});
        throw e;
      } finally {
        await friend.close();
      }
    },

    // ---------- le Retour d'Android à chaque niveau ----------
    async retour() {
      // partie rapide → choix d'un deck → Retour → Retour
      await this.quick();
      await this.tap(ui('quick.my-deck'));
      await this.waitUi(ui('quick.picker'), 'choix d’un deck');
      await this.back();
      await this.expect(ui('home.start'), '#play/rapide', 'Retour depuis le choix d’un deck');
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis la partie rapide');

      // réglages (fenêtre) → Retour
      await this.tap(ui('home.settings'));
      await this.waitUi(ui('settings.panel'), 'réglages');
      await this.back();
      await this.waitGone(ui('settings.panel'));
      await this.expect(ui('home'), '#play', 'Retour depuis les réglages');

      // aventure : carte → chapitre → Retour ; Cale → Retour ; deck d'aventure → Retour ; carte → Retour
      await this.adventureMap();
      for (const [open, screen] of [['adventure.go', 'chapter'], ['adventure.hold', 'hold'], ['adventure.deck', 'adventure-deck']]) {
        await this.tap(ui(open));
        await this.waitUi(ui(screen), screen);
        await this.back();
        await this.expect(ui('adventure.map'), '#play/aventure', `Retour depuis ${screen}`);
      }
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis la carte');

      // boutique → Retour
      await this.tap(ui('home.shop'));
      await this.waitUi(ui('shop'), 'boutique');
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis la boutique');

      // Mes decks → choix du Leader → Retour ; éditeur d'un nouveau deck → Retour (la question s'il ne s'enregistre
      // pas : « Abandonner ») ; Retour
      await this.tap(ui('home.decks'));
      await this.waitUi(ui('decks'), 'Mes decks');
      await this.tap(ui('decks.new'));
      await this.waitUi(ui('leaders'), 'choix du Leader');
      await this.back();
      await this.waitGone(ui('leaders'));
      await this.expect(ui('decks'), '#play/decks', 'Retour depuis le choix du Leader');
      await this.tap(ui('decks.new'));
      await this.waitUi(ui('leaders.item'), 'choix du Leader');
      await this.tap(ui('leaders.item'));
      await this.waitUi(ui('editor'), 'éditeur');
      await this.back();
      await this.page.waitFor(() => Boolean(document.querySelector('[data-ui="editor.unsaved"], [data-ui="decks"]')) && !document.querySelector('[data-ui="editor"]:not(:has([data-ui="editor.unsaved"]))'), [], { what: 'Retour depuis l’éditeur' }).catch(() => {});
      if (await this.has(ui('editor.unsaved'))) await this.tap(ui('editor.discard'));
      await this.expect(ui('decks'), '#play/decks', 'Retour depuis l’éditeur');
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis Mes decks');

      // Mes parties → Retour
      await this.tap(ui('home.history'));
      await this.waitUi(ui('history'), 'Mes parties');
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis Mes parties');

      // salon → choix du deck (fenêtre) → Retour → Retour
      await this.tap(ui('home.online'));
      await this.waitUi(ui('lobby'), 'salon');
      await this.tap(ui('lobby.deck'));
      await this.waitUi(ui('lobby.decks'), 'choix du deck du salon');
      await this.back();
      await this.waitGone(ui('lobby.decks'));
      await this.expect(ui('lobby'), '#play/ami', 'Retour depuis le choix du deck du salon');
      await this.back();
      await this.expect(ui('home'), '#play', 'Retour depuis le salon');

      // pendant une partie : Retour → « Quitter la partie ? » → Non, la partie reste ; Retour → Oui
      await this.startQuick();
      await this.tap(ui('mulligan.keep'));
      await this.untilMyTurn();
      await this.back();
      await this.waitUi(ui('leave'), 'Retour pendant la partie : « Quitter la partie ? »');
      await this.capture('49-retour-quitter');
      await this.tap(ui('leave.no'));
      await this.waitGone(ui('leave'));
      await this.expect(ui('table.end-turn'), '#play/jeu', 'la partie continue');
      await this.back();
      await this.waitUi(ui('leave'));
      await this.tap(ui('leave.yes'));
      await this.waitGone(ui('table'));
      this.note(`Retour à chaque niveau : partie quittée vers ${await this.hash()}`);
    },

    // ---------- réglage « Animations réduites », dans les 3 formats ----------
    async mouvements() {
      const motion = async () => {
        await this.home();
        await this.tap(ui('home.settings'));
        await this.waitUi(ui('settings.motion'), 'réglage des animations');
        await this.tap(ui('settings.motion'));
        await this.tap(ui('settings.done'));
        await this.waitGone(ui('settings.panel'));
      };
      await motion();
      if (!(await this.has('.opc.is-reduced-motion'))) throw new Error('« Animations réduites » : la classe is-reduced-motion manque');
      // les animations du jeu ne sont plus coupées par le script : c'est le réglage qui doit les arrêter
      await this.page.call(() => document.documentElement.classList.remove('ui-tour-still'));
      try {
        await sleep(500);
        await this.noLoops('accueil');
        await this.startQuick();
        await this.noLoops('main de départ');
        await this.tap(ui('mulligan.keep'));
        await this.untilMyTurn();
        await sleep(500);
        await this.noLoops('plateau');
        await this.capture('50-mouvements-reduits');
        await this.tap(ui('table.leave'));
        await this.waitUi(ui('quick'));
        await this.adventureMap();
        await this.noLoops('carte de l’aventure');
      } finally {
        await this.page.call(() => document.documentElement.classList.add('ui-tour-still')).catch(() => {});
      }
      await motion();
      if (await this.has('.opc.is-reduced-motion')) throw new Error('« Animations réduites » : réglage pas retiré');
    },
  };
  Object.assign(Tour.prototype, methods);
}
