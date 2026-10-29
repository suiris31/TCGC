// Table des routes du jeu et bouton Retour (game/ui/routes.ts, tâche R1.4) : adresses lues et écrites, anciennes
// adresses reconnues, puis la mécanique d'historique sur un faux navigateur (Retour, fenêtres, garde de partie)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNavigator, format, parse, type HistoryWindow, type Route } from '../ui/routes.ts';

const ROUTES: Route[] = [
  { name: 'home' },
  { name: 'rapide' },
  { name: 'jeu' },
  { name: 'ami' },
  { name: 'salle', code: 'ABC123' },
  { name: 'salle', code: 'K7-2Q' },
  { name: 'partie', id: 'm_8f3a-21' },
  { name: 'aventure' },
  { name: 'aventure', screen: { kind: 'chapter', id: 'eb-1-shells-town' } },
  { name: 'aventure', screen: { kind: 'hold' } },
  { name: 'aventure', screen: { kind: 'deck' } },
  { name: 'aventure', screen: { kind: 'shop' } },
  { name: 'boutique' },
  { name: 'decks' },
  { name: 'decks', id: 'custom-42' },
  { name: 'decks', id: 'un deck/étrange' },
  { name: 'parties' },
  { name: 'parties', id: '2026-10-26T10-00-00-ST01-ST32' },
  { name: 'atelier' },
  { name: 'atelier', page: 'plateau-attaque' },
];

test('parse(format(r)) redonne r pour toutes les routes', () => {
  for (const r of ROUTES) assert.deepEqual(parse(format(r)), r, format(r));
  assert.equal(new Set(ROUTES.map(format)).size, ROUTES.length, 'deux routes ont la même adresse');
});

test('les adresses du contrat (§ 14.2) s’écrivent comme prévu', () => {
  assert.equal(format({ name: 'home' }), '#play');
  assert.equal(format({ name: 'rapide' }), '#play/rapide');
  assert.equal(format({ name: 'jeu' }), '#play/jeu');
  assert.equal(format({ name: 'ami' }), '#play/ami');
  assert.equal(format({ name: 'salle', code: 'ABC123' }), '#play/salle/ABC123');
  assert.equal(format({ name: 'partie', id: 'x1' }), '#play/partie/x1');
  assert.equal(format({ name: 'aventure' }), '#play/aventure');
  assert.equal(format({ name: 'aventure', screen: { kind: 'chapter', id: 'eb-2' } }), '#play/aventure/chapitre/eb-2');
  assert.equal(format({ name: 'aventure', screen: { kind: 'hold' } }), '#play/aventure/cale');
  assert.equal(format({ name: 'aventure', screen: { kind: 'deck' } }), '#play/aventure/deck');
  assert.equal(format({ name: 'aventure', screen: { kind: 'shop' } }), '#play/aventure/boutique');
  assert.equal(format({ name: 'boutique' }), '#play/boutique');
  assert.equal(format({ name: 'decks', id: 'd1' }), '#play/decks/d1');
  assert.equal(format({ name: 'parties', id: 'p1' }), '#play/parties/p1');
  assert.equal(format({ name: 'atelier', page: 'kit' }), '#play/atelier/kit');
});

test('les anciennes adresses sont toutes reconnues', () => {
  assert.deepEqual(parse('#play'), { name: 'home' });
  assert.deepEqual(parse('#play/'), { name: 'home' });
  // lien d'un ami : code en minuscules, ou suivi d'autre chose
  assert.deepEqual(parse('#play/salle/ABC123'), { name: 'salle', code: 'ABC123' });
  assert.deepEqual(parse('#play/salle/abc123'), { name: 'salle', code: 'ABC123' });
  assert.deepEqual(parse('#play/salle/ABC123/suite'), { name: 'salle', code: 'ABC123' });
  assert.deepEqual(parse('#play/partie/m_8f3a-21'), { name: 'partie', id: 'm_8f3a-21' });
  assert.deepEqual(parse('#play/aventure'), { name: 'aventure' });
  assert.deepEqual(parse('#play/aventure/'), { name: 'aventure' });
  assert.deepEqual(parse('#play/aventure/autre-chose'), { name: 'aventure' });
  assert.deepEqual(parse('#play/atelier'), { name: 'atelier' });
  assert.deepEqual(parse('#play/atelier/plateau-fin-gagnee'), { name: 'atelier', page: 'plateau-fin-gagnee' });
  assert.deepEqual(parse('play/aventure'), { name: 'aventure' }, 'sans dièse');
});

test('une adresse inconnue sous #play mène à l’accueil du jeu', () => {
  for (const hash of ['#play/inconnu', '#play/classe', '#play/joueur/zoro', '#play/partie/', '#play/atelier/a/b', '#play/atelier/é', '#play/decks/%E0']) {
    const r = parse(hash);
    assert.ok(r.name === 'home' || (r.name === 'decks' && !r.id), `${hash} → ${JSON.stringify(r)}`);
  }
  assert.deepEqual(parse('#play/salle/'), { name: 'ami' }, 'salle sans code : le salon');
  assert.deepEqual(parse('#play/aventure/chapitre/'), { name: 'aventure' }, 'chapitre sans id : la carte');
  assert.deepEqual(parse('#collection'), { name: 'home' });
});

// ---------- Faux navigateur : une pile d'entrées, popstate puis hashchange comme dans Chrome ----------

interface Fake extends HistoryWindow {
  entries: { hash: string; state: unknown }[];
  index: number;
  back(): void;
  typeHash(hash: string): void;
  settle(): Promise<void>;
}

function fakeWindow(start = '#play'): Fake {
  const listeners: Record<string, (() => void)[]> = { popstate: [], hashchange: [] };
  const pending: (() => void)[] = [];
  const w: Fake = {
    entries: [{ hash: '#collection', state: null }, { hash: start, state: null }],
    index: 1,
    location: { get hash() { return w.entries[w.index].hash; } } as { hash: string },
    history: {
      get state() { return w.entries[w.index].state; },
      pushState(state, _u, url) {
        w.entries = [...w.entries.slice(0, w.index + 1), { hash: url ?? w.location.hash, state: structuredClone(state) }];
        w.index++;
      },
      replaceState(state, _u, url) {
        w.entries[w.index] = { hash: url ?? w.location.hash, state: structuredClone(state) };
      },
      go(delta) {
        // comme un navigateur : la traversée se fait plus tard
        pending.push(() => {
          const to = Math.min(Math.max(w.index + delta, 0), w.entries.length - 1);
          if (to === w.index) return;
          const before = w.location.hash;
          w.index = to;
          for (const l of listeners.popstate) l();
          if (w.location.hash !== before) for (const l of listeners.hashchange) l();
        });
      },
    },
    addEventListener(type, listener) { listeners[type].push(listener); },
    back() { w.history.go(-1); },
    typeHash(hash) {
      w.history.pushState(null, '', hash);
      for (const l of listeners.popstate) l();
      for (const l of listeners.hashchange) l();
    },
    async settle() {
      while (pending.length) pending.shift()!();
      await Promise.resolve();
    },
  };
  return w;
}

test('navigate empile les écrans et le Retour revient à l’écran précédent', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  let changes = 0;
  nav.subscribe(() => changes++);
  nav.navigate({ name: 'aventure' });
  nav.navigate({ name: 'aventure', screen: { kind: 'hold' } });
  assert.equal(w.location.hash, '#play/aventure/cale');
  assert.equal(changes, 2);
  // Retour depuis la Cale : la carte
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'aventure' });
  // Retour depuis la carte : l'accueil du jeu
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'home' });
  // Retour depuis l'accueil : l'onglet précédent (la route du jeu ne change plus, l'appli change d'onglet)
  w.back();
  await w.settle();
  assert.equal(w.location.hash, '#collection');
  assert.deepEqual(nav.current(), { name: 'home' });
  assert.equal(changes, 4);
});

test('replace remplace l’entrée, et naviguer vers l’écran affiché ne crée rien', () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'ami' });
  nav.navigate({ name: 'partie', id: 'p1' }, { replace: true });
  assert.deepEqual(w.entries.map((e) => e.hash), ['#collection', '#play', '#play/partie/p1']);
  nav.navigate({ name: 'partie', id: 'p1' });
  assert.equal(w.entries.length, 3);
});

test('les boutons « ← » reviennent en arrière quand l’écran précédent est le bon, sinon remplacent l’adresse', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'aventure' });
  nav.navigate({ name: 'aventure', screen: { kind: 'chapter', id: 'c1' } });
  nav.navigate({ name: 'aventure', screen: { kind: 'deck' } });
  // retour depuis le deck : le chapitre d'où l'on vient
  nav.goBack({ name: 'aventure' });
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'aventure', screen: { kind: 'chapter', id: 'c1' } });
  // « ← Carte » du chapitre : la carte est l'écran précédent
  nav.goUp({ name: 'aventure' });
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'aventure' });
  assert.equal(w.index, 2);

  // adresse ouverte directement (rechargement, lien) : pas d'écran précédent du jeu, on remplace
  const w2 = fakeWindow('#play/aventure/cale');
  const nav2 = createNavigator(w2);
  nav2.goBack({ name: 'aventure' });
  assert.deepEqual(nav2.current(), { name: 'aventure' });
  assert.deepEqual(w2.entries.map((e) => e.hash), ['#collection', '#play/aventure']);
  // le parent n'est pas l'écran précédent : remplacé, pas d'entrée de plus
  nav2.navigate({ name: 'aventure', screen: { kind: 'chapter', id: 'c2' } });
  nav2.navigate({ name: 'aventure', screen: { kind: 'deck' } });
  nav2.goUp({ name: 'aventure' });
  assert.deepEqual(w2.entries.map((e) => e.hash), ['#collection', '#play/aventure', '#play/aventure/chapitre/c2', '#play/aventure']);
});

test('une fenêtre ouverte ajoute une entrée : le Retour la ferme, sans changer d’écran', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'parties' });
  const closed: string[] = [];
  nav.pushLayer(() => closed.push('réglages'));
  nav.pushLayer(() => closed.push('aide'));
  assert.equal(w.entries.length, 5);
  assert.equal(w.location.hash, '#play/parties');
  w.back();
  await w.settle();
  assert.deepEqual(closed, ['aide']);
  w.back();
  await w.settle();
  assert.deepEqual(closed, ['aide', 'réglages']);
  assert.deepEqual(nav.current(), { name: 'parties' });
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'home' });
});

test('une fenêtre fermée par l’écran retire son entrée, sans rappeler sa fermeture', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'aventure' });
  let calls = 0;
  const id = nav.pushLayer(() => calls++);
  nav.popLayer(id);
  await w.settle();
  assert.equal(calls, 0);
  assert.equal(w.index, 2);
  assert.deepEqual(nav.current(), { name: 'aventure' });
  nav.popLayer(id);   // deux fois : sans effet
  await w.settle();
  assert.equal(w.index, 2);
  // puis le Retour quitte bien l'écran
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'home' });
});

test('une fenêtre qui mène à un autre écran : le Retour ramène à l’écran d’en dessous', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'aventure' });
  nav.pushLayer(() => assert.fail('la fenêtre a déjà mené ailleurs'));
  nav.navigate({ name: 'aventure', screen: { kind: 'shop' } });
  assert.deepEqual(w.entries.map((e) => e.hash), ['#collection', '#play', '#play/aventure', '#play/aventure/boutique']);
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'aventure' });
});

test('une fenêtre rechargée n’est plus comptée comme ouverte', async () => {
  const w = fakeWindow('#play/aventure');
  w.entries[1].state = { opc: 1, layer: 1 };
  const nav = createNavigator(w);
  assert.equal((w.history.state as { layer: number }).layer, 0);
  nav.navigate({ name: 'aventure', screen: { kind: 'hold' } });
  w.back();
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'aventure' });
});

test('pendant une partie, le Retour reste sur la partie et demande confirmation', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'jeu' });
  let asked = 0;
  const release = nav.setGuard(() => asked++);
  w.back();
  await w.settle();
  assert.equal(asked, 1);
  assert.equal(w.location.hash, '#play/jeu');
  assert.deepEqual(nav.current(), { name: 'jeu' });
  // une fenêtre ouverte sur la partie se ferme d'abord, sans demander
  let closed = 0;
  nav.pushLayer(() => closed++);
  w.back();
  await w.settle();
  assert.equal(closed, 1);
  assert.equal(asked, 1);
  // adresse tapée à la main : confirmation aussi
  w.typeHash('#collection');
  assert.equal(asked, 2);
  assert.equal(w.location.hash, '#play/jeu');
  // « Quitter » : l'écran revient à l'accueil, la garde ne l'arrête pas
  nav.goUp({ name: 'home' });
  await w.settle();
  assert.deepEqual(nav.current(), { name: 'home' });
  assert.equal(asked, 2);
  release();
  // la garde retirée : le Retour suivant n'est plus arrêté
  w.back();
  await w.settle();
  assert.equal(w.location.hash, '#collection');
});

test('une garde retirée ne retire pas celle posée ensuite, et quitter l’écran par navigate la lève', async () => {
  const w = fakeWindow();
  const nav = createNavigator(w);
  nav.navigate({ name: 'partie', id: 'a' });
  const first = nav.setGuard(() => assert.fail('ancienne garde'));
  let asked = 0;
  nav.setGuard(() => asked++);
  first();
  w.back();
  await w.settle();
  assert.equal(asked, 1);
  nav.navigate(HOME_ROUTE, { replace: true });
  nav.navigate({ name: 'ami' });
  w.back();
  await w.settle();
  assert.equal(asked, 1);
  assert.deepEqual(nav.current(), { name: 'home' });
});

const HOME_ROUTE: Route = { name: 'home' };
