// Accessibilité du plateau (tâche R2.8) : ce que lit un lecteur d'écran d'une carte et d'une zone, le parcours des
// cartes au clavier, et ce qu'annonce la région aria-live (actions jouées, consigne)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { boardState } from '../ui/atelier/plateau/etats.ts';
import { cardLabel, moveIndex, newLogLines, promptText, tabStop, zoneLabel, zoneMove, type CardLabelInput } from '../ui/table/a11y.ts';

const base: CardLabelInput = { name: 'Nami', hand: false, power: null, basePower: 1000, cost: null, baseCost: 1, rested: false, don: 0, states: [], look: {} };

test('accessibilité : une carte est lue avec son nom, sa puissance, son coût et son état', () => {
  assert.equal(cardLabel(base), 'Nami');
  assert.equal(cardLabel({ ...base, power: 3000, don: 2, rested: true }), 'Nami, 3000 de puissance (augmenté de 2000), épuisée, 2 DON!! données');
  assert.equal(cardLabel({ ...base, power: 0 }), 'Nami, 0 de puissance (diminué de 1000)');
  assert.equal(cardLabel({ ...base, hand: true, cost: 1, look: { actionable: true, recommended: true } }), 'Nami, coût 1, actions possibles, conseillée par le coach');
  assert.equal(cardLabel({ ...base, hand: true, cost: 3, look: { dim: true } }), 'Nami, coût 3 (augmenté de 2), pas jouable maintenant');
  assert.equal(cardLabel({ ...base, power: 1000, states: ['[Bloqueur] : peut se mettre en travers d’une attaque adverse'], look: { target: true } }),
    'Nami, 1000 de puissance, [Bloqueur] : peut se mettre en travers d’une attaque adverse, cible possible de l’attaque');
  assert.equal(cardLabel({ ...base, hand: true, cost: 1, look: { actionable: true, badge: '+1000' } }), 'Nami, coût 1, actions possibles, Contre +1000');
  assert.equal(cardLabel({ ...base, look: { choose: true, badge: 'Contre' } }), 'Nami, à choisir, Contre');
});

test('accessibilité : un camp est lu avec ses Vies, son deck, sa Défausse et ses DON!!', () => {
  const { state: s } = boardState('charge');
  const me = s.players[0];
  assert.equal(zoneLabel(s, 0, true),
    `Ton camp : ${me.life.length} Vie${me.life.length > 1 ? 's' : ''}, ${me.deck.length} cartes dans le deck, ${me.trash.length} carte${me.trash.length > 1 ? 's' : ''} dans la Défausse, ${me.donActive} DON!! utilisable${me.donActive > 1 ? 's' : ''}`);
  assert.match(zoneLabel(s, 1, false), new RegExp(`^Camp de ${s.players[1].name} : `));
});

test('accessibilité : les flèches parcourent une zone (en rebouclant), Tab revient sur la dernière carte', () => {
  assert.equal(zoneMove('ArrowRight'), 'next');
  assert.equal(zoneMove('ArrowDown'), 'next');
  assert.equal(zoneMove('ArrowLeft'), 'prev');
  assert.equal(zoneMove('ArrowUp'), 'prev');
  assert.equal(zoneMove('Home'), 'first');
  assert.equal(zoneMove('End'), 'last');
  assert.equal(zoneMove('Enter'), null);
  assert.equal(zoneMove('Tab'), null);
  assert.equal(moveIndex(0, 4, 'next'), 1);
  assert.equal(moveIndex(3, 4, 'next'), 0);
  assert.equal(moveIndex(0, 4, 'prev'), 3);
  assert.equal(moveIndex(2, 4, 'first'), 0);
  assert.equal(moveIndex(1, 4, 'last'), 3);
  assert.equal(moveIndex(-1, 4, 'next'), 0);   // le focus n'est sur aucune carte de la zone
  assert.equal(moveIndex(-1, 4, 'prev'), 3);
  assert.equal(moveIndex(0, 0, 'next'), -1);
  assert.equal(tabStop([], 5), null);
  assert.equal(tabStop([4, 5, 6], 5), 5);
  assert.equal(tabStop([4, 5, 6], 9), 4);      // la carte a quitté la zone : la première
  assert.equal(tabStop([4, 5, 6], undefined), 4);
});

test('accessibilité : la région aria-live annonce les nouvelles lignes du journal, rien au premier affichage', () => {
  const { state: before } = boardState('bloqueur');
  const after = act(act(before, 'noblock'), 'pass');   // ni blocage ni contre : l'attaque touche
  assert.deepEqual(newLogLines(null, after, 0), []);
  assert.deepEqual(newLogLines(after, before, 0), []);   // retour en arrière : journal plus court
  const lines = newLogLines(before, after, 0);
  assert.ok(lines.length > 0 && lines.length <= 4, lines.join(' | '));
  const fresh = after.log.slice(before.log.length).filter((l) => l.only === undefined || l.only === 0);
  const last = fresh.at(-1)!;
  assert.equal(lines.at(-1), last.player === null ? last.text : `${after.players[last.player].name} ${last.text}`);
  // une information secrète de l'adversaire n'est pas lue
  const secret = { ...after, log: [...before.log, { turn: after.turn, player: 1 as const, text: 'regarde la carte X', only: 1 as const }] };
  assert.deepEqual(newLogLines(before, secret, 0), []);
});

test('accessibilité : la consigne dit qui doit faire quoi', () => {
  const opponent = 'L’IA';
  const say = (name: string) => promptText({ state: boardState(name).state, seat: 0, opponent, targeting: null, preview: null });
  assert.equal(say('mulligan'), 'Ta main de départ : garde-la ou repioche.');
  assert.equal(say('charge'), 'À toi de jouer.');
  assert.equal(say('bloqueur'), boardState('bloqueur').state.decision!.prompt);
  assert.match(say('contre'), / attaque .+\(\d+\)\. /);
  assert.match(say('victoire'), /^Victoire !/);
  assert.match(say('defaite'), /^Défaite\./);
  const { state, aim } = boardState('attaque');
  const targeting = { attacker: aim!.attacker };
  assert.match(promptText({ state, seat: 0, opponent, targeting, preview: null }), /^Choisis la cible de .+\(\d+\)\. Les flèches parcourent les cibles/);
  assert.match(promptText({ state, seat: 0, opponent, targeting, preview: { text: '6000 contre 5000 : ça passe' } }), /6000 contre 5000 : ça passe$/);
  assert.equal(promptText({ state, seat: 1, opponent, targeting: null, preview: null }), 'L’IA joue.');
});
