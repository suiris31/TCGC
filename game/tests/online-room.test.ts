// Salon et salle d'attente (game/ui/online/room.ts, tâche R3.7) : code tapé ou collé, temps restant, lien d'invitation
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanCode, minutesLeft, roomLink } from '../ui/online/room.ts';
import { format, parse } from '../ui/routes.ts';

test('le code se nettoie : majuscules, sans espace ni tiret, 6 caractères au plus', () => {
  assert.equal(cleanCode('k7mq2p'), 'K7MQ2P');
  assert.equal(cleanCode(' K7-MQ 2P '), 'K7MQ2P');
  assert.equal(cleanCode('K7MQ2PXYZ'), 'K7MQ2P');
  assert.equal(cleanCode(''), '');
  assert.equal(cleanCode('k7m'), 'K7M');
});

test('un lien ou le message envoyé, collés dans le champ, donnent le code', () => {
  assert.equal(cleanCode('https://exemple.invalid/tcgc/#play/salle/K7MQ2P'), 'K7MQ2P');
  assert.equal(cleanCode('#play/salle/ab12cd'), 'AB12CD');
  const message = 'Rejoins-moi pour une partie de ONE PIECE CARD GAME sur Ma Collection One Piece : code Q2W3E4\nhttps://exemple.invalid/#play/salle/Q2W3E4';
  assert.equal(cleanCode(message), 'Q2W3E4');
  assert.equal(cleanCode('Rejoins-moi : code Z9Y8X7'), 'Z9Y8X7');
});

test('le lien d’invitation ouvre le salon avec le code (adresse #play/salle/<CODE> gardée)', () => {
  const link = roomLink('K7MQ2P', { origin: 'https://exemple.invalid', pathname: '/tcgc/' });
  assert.equal(link, 'https://exemple.invalid/tcgc/#play/salle/K7MQ2P');
  const route = parse(link.slice(link.indexOf('#')));
  assert.deepEqual(route, { name: 'salle', code: 'K7MQ2P' });
  assert.equal(format(route), '#play/salle/K7MQ2P');
});

test('le temps restant d’une salle est arrondi au-dessus, jamais négatif', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(minutesLeft(null, now), null);
  assert.equal(minutesLeft(undefined, now), null);
  assert.equal(minutesLeft('2026-10-28T12:15:00Z', now), 15);
  assert.equal(minutesLeft('2026-10-28T12:00:20Z', now), 1);
  assert.equal(minutesLeft('2026-10-28T11:59:00Z', now), 0);
});
