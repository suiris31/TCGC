// Réglages partagés (tâche R1.3) : anciens réglages relus, même clé et même format à l'écriture, un seul magasin pour
// tous les écrans, « Animations réduites » qui suit l'appareil tant qu'on ne l'a pas choisi
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSettingsStore, DEFAULTS, readSettings, reducedMotionOf, SETTINGS_KEY, type SettingsStorage } from '../ui/settings.ts';

function memory(initial?: Record<string, string>): SettingsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

test('anciens réglages relus : les champs écrits gardent leur valeur, les nouveaux prennent la leur par défaut', () => {
  // ce qu'écrivait la version d'avant R1.3 (sans « Animations réduites »)
  const old = JSON.stringify({ speed: 350, sound: false, autoCoach: true, confirmEnd: false, helpSeen: true, uiScale: 1.35, zoomDelay: 0 });
  const store = createSettingsStore(memory({ [SETTINGS_KEY]: old }));
  const s = store.get();
  assert.deepEqual(s, { speed: 350, sound: false, autoCoach: true, confirmEnd: false, helpSeen: true, uiScale: 1.35, zoomDelay: 0 });
  assert.equal(s.reducedMotion, undefined);
  // une version plus ancienne encore, qui n'avait que quelques réglages
  assert.deepEqual(readSettings(JSON.stringify({ speed: 1500, sound: false })), { ...DEFAULTS, speed: 1500, sound: false });
});

test('réglages absents ou abîmés : valeurs par défaut, champ par champ', () => {
  assert.deepEqual(readSettings(null), DEFAULTS);
  assert.deepEqual(readSettings('pas du JSON'), DEFAULTS);
  assert.deepEqual(readSettings('[1, 2]'), DEFAULTS);
  assert.deepEqual(readSettings('null'), DEFAULTS);
  const s = readSettings(JSON.stringify({ speed: 'vite', sound: 0, uiScale: 1, zoomDelay: null, reducedMotion: 'oui' }));
  assert.deepEqual(s, { ...DEFAULTS, uiScale: 1 });
  assert.ok(!('reducedMotion' in s));
  // un champ inconnu (écrit par une version plus récente, dans un autre onglet) est gardé
  assert.equal((readSettings(JSON.stringify({ futur: 3 })) as unknown as { futur: number }).futur, 3);
});

test('un changement est écrit sous la même clé, au même format, et prévient tous les écrans abonnés', () => {
  const storage = memory();
  const store = createSettingsStore(storage);
  let plateau = 0;
  let aventure = 0;
  const stopPlateau = store.subscribe(() => plateau++);
  store.subscribe(() => aventure++);
  store.update({ sound: false });
  assert.equal(store.get().sound, false);
  assert.equal(plateau, 1);
  assert.equal(aventure, 1);
  assert.deepEqual(JSON.parse(storage.data.get(SETTINGS_KEY)!), { ...DEFAULTS, sound: false });
  // relu par un nouveau magasin (rechargement de la page) : rien n'est perdu
  assert.deepEqual(createSettingsStore(storage).get(), { ...DEFAULTS, sound: false });
  stopPlateau();
  store.update({ uiScale: 1 });
  assert.equal(plateau, 1);
  assert.equal(aventure, 2);
  // l'objet change à chaque mise à jour (useSyncExternalStore redessine)
  const before = store.get();
  store.update({ speed: 1500 });
  assert.notEqual(store.get(), before);
});

test('« Animations réduites » : suit l’appareil tant qu’on ne l’a pas choisi, et revient à l’appareil sur demande', () => {
  const storage = memory();
  const store = createSettingsStore(storage);
  assert.equal(reducedMotionOf(store.get(), true), true);
  assert.equal(reducedMotionOf(store.get(), false), false);
  store.update({ reducedMotion: false });
  assert.equal(reducedMotionOf(store.get(), true), false);
  store.update({ reducedMotion: true });
  assert.equal(reducedMotionOf(store.get(), false), true);
  assert.equal(JSON.parse(storage.data.get(SETTINGS_KEY)!).reducedMotion, true);
  store.update({ reducedMotion: undefined });
  assert.ok(!('reducedMotion' in JSON.parse(storage.data.get(SETTINGS_KEY)!)));
  assert.equal(reducedMotionOf(store.get(), true), true);
});

test('un autre onglet change les réglages : reload les relit et prévient seulement s’ils ont changé', () => {
  const storage = memory();
  const store = createSettingsStore(storage);
  let calls = 0;
  store.subscribe(() => calls++);
  store.reload();
  assert.equal(calls, 0);
  storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULTS, zoomDelay: 600 }));
  store.reload();
  assert.equal(calls, 1);
  assert.equal(store.get().zoomDelay, 600);
});

test('stockage indisponible : les réglages marchent pour la visite', () => {
  const broken: SettingsStorage = {
    getItem: () => { throw new Error('interdit'); },
    setItem: () => { throw new Error('plein'); },
  };
  const store = createSettingsStore(broken);
  assert.deepEqual(store.get(), DEFAULTS);
  store.update({ sound: false });
  assert.equal(store.get().sound, false);
  const none = createSettingsStore(null);
  none.update({ speed: 350 });
  assert.equal(none.get().speed, 350);
});
