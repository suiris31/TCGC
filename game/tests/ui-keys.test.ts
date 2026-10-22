// Raccourci « Entrée = fin du tour » : un seul appui ne doit jamais jouer deux choix (game/ui/keys.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEndTurnKey, ownsEnter, type KeyInput, type KeyTarget } from '../ui/keys.ts';

const el = (tagName: string, attrs: Record<string, string> = {}, editable = false): KeyTarget => ({
  tagName, isContentEditable: editable, getAttribute: (name) => attrs[name] ?? null,
});
const enter = (over: Partial<KeyInput> = {}): KeyInput => ({ key: 'Enter', defaultPrevented: false, target: el('BODY'), ...over });

test('Entrée finit le tour quand le focus est sur la page', () => {
  assert.equal(isEndTurnKey(enter()), true);
  assert.equal(isEndTurnKey(enter({ target: el('DIV') })), true);
  assert.equal(isEndTurnKey(enter({ target: null })), true);
});

test('Entrée est ignorée quand un bouton, un champ ou une liste a le focus', () => {
  for (const tag of ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'button']) {
    assert.equal(isEndTurnKey(enter({ target: el(tag) })), false, tag);
  }
  assert.equal(isEndTurnKey(enter({ target: el('DIV', { role: 'button' }) })), false, 'carte cliquable');
  assert.equal(isEndTurnKey(enter({ target: el('UL', { role: 'listbox' }) })), false, 'liste');
  assert.equal(isEndTurnKey(enter({ target: el('DIV', {}, true) })), false, 'texte modifiable');
  assert.equal(isEndTurnKey(enter({ target: el('DIV', { role: 'dialog' }) })), true, 'une fenêtre ne garde pas Entrée');
});

test('Entrée est ignorée quand l’événement est déjà traité, répété ou avec un modificateur', () => {
  assert.equal(isEndTurnKey(enter({ defaultPrevented: true })), false);
  assert.equal(isEndTurnKey(enter({ repeat: true })), false);
  assert.equal(isEndTurnKey(enter({ ctrlKey: true })), false);
  assert.equal(isEndTurnKey(enter({ metaKey: true })), false);
  assert.equal(isEndTurnKey(enter({ altKey: true })), false);
  assert.equal(isEndTurnKey(enter({ shiftKey: true })), false);
});

test('les autres touches ne finissent pas le tour', () => {
  for (const key of ['Escape', ' ', 'e', 'NumpadEnter']) assert.equal(isEndTurnKey(enter({ key })), false, key);
});

test('ownsEnter : éléments qui se servent eux-mêmes de la touche', () => {
  assert.equal(ownsEnter(el('BUTTON')), true);
  assert.equal(ownsEnter(el('SPAN')), false);
  assert.equal(ownsEnter(el('SPAN', { role: 'Menuitem' })), true);
  assert.equal(ownsEnter({}), false);
  assert.equal(ownsEnter(null), false);
});
