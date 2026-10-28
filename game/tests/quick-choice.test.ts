// Choix de la partie rapide gardés dans le navigateur (tâche R3.2) : relecture prudente de ce qui est enregistré
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, readQuickChoice, RANDOM_DECK } from '../ui/setup/config.ts';

test('partie rapide : des choix enregistrés sont relus tels quels', () => {
  const saved = { myDeck: 'PERSO-abc123', aiDeck: RANDOM_DECK, first: 'ai', level: 3 };
  assert.deepEqual(readQuickChoice(JSON.stringify(saved)), saved);
});

test('partie rapide : rien d’enregistré ou illisible → les choix par défaut', () => {
  assert.deepEqual(readQuickChoice(null), DEFAULT_CONFIG);
  assert.deepEqual(readQuickChoice('{pas du json'), DEFAULT_CONFIG);
  assert.deepEqual(readQuickChoice('42'), DEFAULT_CONFIG);
});

test('partie rapide : un champ invalide reprend sa valeur par défaut, les autres sont gardés', () => {
  const read = readQuickChoice(JSON.stringify({ myDeck: 'ST-01', aiDeck: '', first: 'souvent', level: 9 }));
  assert.deepEqual(read, { ...DEFAULT_CONFIG, myDeck: 'ST-01' });
  // les noms des decks perso ne sont pas gardés : ils sont relus au lancement de la partie
  assert.equal('myDeckName' in readQuickChoice(JSON.stringify({ myDeck: 'PERSO-abc123', myDeckName: 'Mon deck' })), false);
});
