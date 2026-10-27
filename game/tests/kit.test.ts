// Kit du jeu (tâche R1.2) : fonctions pures des composants (pile des fenêtres, focus au clavier, menus, en-têtes,
// chargements), jeu d'icônes, et styles du kit rangés sous le conteneur du jeu
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ICON_LABELS, ICON_NAMES, ICONS } from '../ui/kit/icons.ts';
import { asyncView, createLayerStack, errorMessage, initialFocus, isTabbable, menuMove, nextFocus, splitActions, type FocusCandidate } from '../ui/kit/logic.ts';

const ROOT = join(import.meta.dirname, '..', '..');

test('pile des fenêtres : celle du dessus est la dernière ouverte et non réduite', () => {
  const s = createLayerStack();
  assert.equal(s.top(), null);
  s.push('a');
  s.push('b');
  assert.equal(s.top(), 'b');
  assert.ok(s.isTop('b') && !s.isTop('a'));
  // la fenêtre du dessus se ferme : celle du dessous reprend la main
  s.remove('b');
  assert.equal(s.top(), 'a');
  // une fenêtre fermée au milieu de la pile ne change pas celle du dessus
  s.push('b');
  s.push('c');
  s.remove('b');
  assert.deepEqual(s.ids(), ['a', 'c']);
  assert.equal(s.top(), 'c');
  s.remove('inconnue');
  assert.deepEqual(s.ids(), ['a', 'c']);
});

test('pile des fenêtres : une fenêtre réduite laisse la main, rouverte elle la reprend', () => {
  const s = createLayerStack();
  s.push('a');
  s.push('b');
  s.setReduced('b', true);
  assert.equal(s.top(), 'a');
  s.setReduced('a', true);
  assert.equal(s.top(), null);
  s.setReduced('a', false);
  assert.equal(s.top(), 'a');
  assert.deepEqual(s.ids(), ['b', 'a'], 'rouverte, elle repasse au-dessus');
  s.setReduced('inconnue', true);
  assert.equal(s.top(), 'a');
  // ouvrir deux fois la même fenêtre ne la duplique pas
  s.push('a');
  assert.deepEqual(s.ids(), ['b', 'a']);
});

test('focus : Tab et Maj+Tab circulent dans la fenêtre sans en sortir', () => {
  const items = ['nom', 'couleur', 'annuler', 'valider'];
  assert.equal(nextFocus(items, 'nom', false), 'couleur');
  assert.equal(nextFocus(items, 'valider', false), 'nom', 'du dernier au premier');
  assert.equal(nextFocus(items, 'nom', true), 'valider', 'Maj+Tab : du premier au dernier');
  assert.equal(nextFocus(items, 'couleur', true), 'nom');
  // focus hors de la fenêtre (ou sur la fenêtre elle-même)
  assert.equal(nextFocus(items, null, false), 'nom');
  assert.equal(nextFocus(items, 'ailleurs', false), 'nom');
  assert.equal(nextFocus(items, 'ailleurs', true), 'valider');
  // un seul élément : il garde le focus ; aucun : rien (la fenêtre le garde)
  assert.equal(nextFocus(['ok'], 'ok', false), 'ok');
  assert.equal(nextFocus([], null, false), null);
});

test('focus initial : élément marqué, sinon premier du contenu, sinon bouton de fermeture', () => {
  assert.equal(initialFocus('marqué', ['champ'], ['fermer', 'champ']), 'marqué');
  assert.equal(initialFocus(null, ['champ', 'ok'], ['fermer', 'champ', 'ok']), 'champ');
  assert.equal(initialFocus(null, [], ['fermer']), 'fermer');
  assert.equal(initialFocus(null, [], []), null);
});

test('focus : éléments atteints par Tab', () => {
  const el = (over: Partial<FocusCandidate> & { attrs?: Record<string, string> } = {}): FocusCandidate => {
    const attrs = over.attrs ?? {};
    return {
      tabIndex: over.tabIndex ?? 0,
      hidden: over.hidden ?? false,
      getAttribute: (n) => attrs[n] ?? null,
      hasAttribute: (n) => n in attrs,
      getClientRects: over.getClientRects ?? (() => ({ length: 1 })),
    };
  };
  assert.equal(isTabbable(el()), true);
  assert.equal(isTabbable(el({ tabIndex: -1 })), false, 'tabindex="-1"');
  assert.equal(isTabbable(el({ hidden: true })), false, 'caché');
  assert.equal(isTabbable(el({ hidden: 'until-found' })), true, 'caché jusqu’à la recherche : on peut l’atteindre');
  assert.equal(isTabbable(el({ attrs: { disabled: '' } })), false, 'désactivé');
  assert.equal(isTabbable(el({ attrs: { 'aria-hidden': 'true' } })), false);
  assert.equal(isTabbable(el({ attrs: { inert: '' } })), false);
  assert.equal(isTabbable(el({ getClientRects: () => ({ length: 0 }) })), false, 'non affiché');
});

test('menu : les flèches sautent les éléments désactivés et bouclent', () => {
  const off = [false, true, false, false];
  assert.equal(menuMove(off, -1, 'Home'), 0);
  assert.equal(menuMove(off, -1, 'End'), 3);
  assert.equal(menuMove(off, 0, 'ArrowDown'), 2, 'le 1 est désactivé');
  assert.equal(menuMove(off, 3, 'ArrowDown'), 0, 'boucle');
  assert.equal(menuMove(off, 2, 'ArrowUp'), 0);
  assert.equal(menuMove(off, 0, 'ArrowUp'), 3);
  assert.equal(menuMove(off, -1, 'ArrowDown'), 0);
  assert.equal(menuMove(off, -1, 'ArrowUp'), 3);
  assert.equal(menuMove(off, 2, 'a'), 2, 'autre touche : rien ne bouge');
  assert.equal(menuMove([true, true], -1, 'Home'), -1);
  assert.equal(menuMove([], -1, 'ArrowDown'), -1);
});

test('en-tête : 2 actions au plus, les autres dans le menu « ⋯ »', () => {
  assert.deepEqual(splitActions([]), { shown: [], menu: [] });
  assert.deepEqual(splitActions(['a', 'b']), { shown: ['a', 'b'], menu: [] });
  assert.deepEqual(splitActions(['a', 'b', 'c', 'd']), { shown: ['a', 'b'], menu: ['c', 'd'] });
  assert.deepEqual(splitActions(['a', 'b', 'c'], 0), { shown: [], menu: ['a', 'b', 'c'] });
});

test('chargement : chargement, puis erreur, puis vide, puis contenu', () => {
  assert.equal(asyncView({}), 'ready');
  assert.equal(asyncView({ loading: true, error: new Error('x'), empty: true }), 'loading', 'pendant « Réessayer »');
  assert.equal(asyncView({ error: new Error('x'), empty: true }), 'error');
  assert.equal(asyncView({ error: null, empty: true }), 'empty');
  assert.equal(asyncView({ error: false }), 'ready');
  assert.equal(asyncView({ error: '' }), 'error', 'une erreur sans texte reste une erreur');
});

test('chargement : le message du serveur est gardé tel quel', () => {
  assert.equal(errorMessage({ status: 409, code: 'not_enough_berry', message: 'Il te manque 300 ฿.' }), 'Il te manque 300 ฿.');
  assert.equal(errorMessage(new Error('Salle introuvable')), 'Salle introuvable');
  assert.equal(errorMessage('Hors ligne'), 'Hors ligne');
  assert.equal(errorMessage(''), 'Une erreur est survenue.');
  assert.equal(errorMessage({ message: 42 }), 'Une erreur est survenue.');
  assert.equal(errorMessage(undefined), 'Une erreur est survenue.');
});

test('icônes : environ 25 icônes, chacune avec son libellé et des tracés SVG valides', () => {
  assert.ok(ICON_NAMES.length >= 25, `${ICON_NAMES.length} icônes`);
  for (const name of [
    'back', 'close', 'settings', 'help', 'log', 'deck', 'hold', 'shop', 'purse', 'history', 'sound-on', 'sound-off',
    'undo', 'more', 'drag', 'rested', 'blocker', 'frozen', 'no-attack', 'no-block', 'no-ko', 'exile', 'returned',
    'attack', 'protection',
  ]) assert.ok(name in ICONS, `icône ${name} attendue (tâche R1.2)`);
  for (const name of ICON_NAMES) {
    assert.ok(ICON_LABELS[name]?.trim(), `${name} : libellé`);
    assert.ok(ICONS[name].length > 0, `${name} : au moins un tracé`);
    for (const d of ICONS[name]) {
      assert.match(d, /^M[\d\s.,MmLlHhVvCcSsQqTtAaZz-]+$/, `${name} : tracé ${d}`);
      assert.doesNotMatch(d, /NaN|undefined/, name);
    }
  }
  assert.equal(new Set(Object.values(ICON_LABELS)).size, ICON_NAMES.length, 'deux icônes ne portent pas le même libellé');
});

// ---------- Styles ----------

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const kitCss = strip(readFileSync(join(ROOT, 'game/ui/kit/kit.css'), 'utf8'));

// Les sélecteurs des règles (hors @media, @keyframes et de leurs étapes from / to / n %)
function selectors(css: string) {
  const out: string[] = [];
  const noFrames = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const [, sel] of noFrames.matchAll(/([^{}]+)\{/g)) {
    const s = sel.trim();
    if (!s.startsWith('@')) out.push(...s.split(',').map((x) => x.trim()).filter(Boolean));
  }
  return out;
}

test('styles du kit : tout est rangé sous .opc, classes préfixées op-', () => {
  const sels = selectors(kitCss);
  assert.ok(sels.length > 50);
  for (const s of sels) {
    assert.match(s, /^\.opc[.\s]/, `${s} : sous .opc`);
    for (const [, name] of s.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      assert.ok(name === 'opc' || name.startsWith('op-') || name.startsWith('is-'), `${s} : classe ${name} sans préfixe`);
    }
  }
  for (const [, name] of kitCss.matchAll(/@keyframes\s+([\w-]+)/g)) assert.ok(name.startsWith('op-kit-'), name);
});

test('styles du kit : aucune classe commune avec TCGC', () => {
  const tcgc = strip(readFileSync(join(ROOT, 'web/src/styles.css'), 'utf8'));
  const tcgcClasses = new Set([...tcgc.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const kitClasses = new Set([...kitCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((c) => c !== 'opc'));
  assert.deepEqual([...kitClasses].filter((c) => tcgcClasses.has(c)), []);
});

test('styles du kit : aucune couleur écrite en dur (seulement les variables du jeu)', () => {
  assert.doesNotMatch(kitCss, /#[0-9a-fA-F]{3,8}\b/, 'couleur hexadécimale');
  assert.doesNotMatch(kitCss, /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/, 'couleur rgb()/hsl()…');
  assert.doesNotMatch(kitCss, /:\s*(white|black|red|green|blue|yellow|gray|grey)\b/, 'couleur nommée');
});

test('styles du kit : les cibles font au moins 44 px', () => {
  for (const cls of ['op-kit-btn', 'op-kit-icon-btn', 'op-kit-menu-item']) {
    const rules = [...kitCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(',').some((s) => s.trim() === `.opc .${cls}`));
    assert.ok(rules.some(([, , body]) => /min-height:\s*max\(44px/.test(body)), `${cls} : min-height ≥ 44 px`);
  }
  assert.match(kitCss, /\.opc \.op-kit-icon-btn \{[^}]*width: max\(44px/, 'bouton-icône ≥ 44 px de large');
});
