// ST-32 Zoro (vert) : un test par carte à effet, d'après le texte officiel
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { power } from '../engine/rules.ts';
import {
  attack, choose, coherent, expectTag, hasOption, logHas, play, scenario, setChars, setDeckTop, setDon, setHand, setLife,
} from './helpers.ts';

const D: [string, string] = ['ST-32', 'ST-35'];

test('Perona : quand un Personnage est épuisé par mes effets, redresse 1 DON!! (une fois par tour) ; Kuina', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP10-036' }, { num: 'OP12-026' }]);
    setDon(g, 0, 0, 4);
    setChars(g, 1, [{ num: 'OP13-005' }]);
  });
  const kuina = s.players[0].chars[1].uid;
  const target = s.players[1].chars[0].uid;
  s = choose(s, `act:${kuina}`);
  expectTag(s, 'oppRest');
  s = choose(s, `card:${target}`);
  // l'effet de Kuina se termine (3 DON!! au Leader), puis Perona redresse la dernière DON!! épuisée (une seule fois)
  assert.equal(s.players[0].leader.don, 3);
  assert.ok(logHas(s, 'Perona'));
  assert.equal(s.players[0].donActive, 1);
  assert.equal(s.players[0].donRested, 0);
  assert.ok(s.log.findIndex((l) => l.text.startsWith('donne 3 DON!!')) < s.log.findIndex((l) => l.text === 'Perona :'));
  assert.equal(s.players[1].chars[0].rested, true);
  assert.equal(s.players[0].chars[1].rested, true);
  coherent(s);
});

test('Hiyori : épuiser 1 DON!! et Hiyori, 5 cartes du dessus, 1 carte <Tranche> ou 1 Événement vert', () => {
  let s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP12-028' }]);
    setDon(g, 0, 1);
    setDeckTop(g, 0, ['OP12-023', 'OP12-039', 'OP12-028', 'OP10-036', 'ST32-002']);
  });
  s = choose(s, `act:${s.players[0].chars[0].uid}`);
  expectTag(s, 'pick');
  const labels = s.decision!.options.map((o) => o.label);
  assert.ok(labels.includes('Kawamatsu') && labels.includes('Oden Kozuki') && labels.some((l) => l.startsWith('Luffy deviendra')));
  assert.ok(!labels.includes('Hiyori Kozuki') && !labels.includes('Perona'));
  s = choose(s, /Luffy deviendra/);
  assert.ok(s.players[0].hand.some((c) => c.num === 'OP12-039'));
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
});

test('Tashigi : épuise un Personnage adverse de coût de base 6 ou moins, puis 3 DON!! épuisées au Leader Zoro', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP12-031']);
    setDon(g, 0, 5, 0);
    setChars(g, 1, [{ num: 'OP12-093' }]); // Morley : coût 8 sur le terrain, coût de base 4
  });
  const morley = s.players[1].chars[0].uid;
  s = play(s, 'OP12-031');
  s = choose(s, `card:${morley}`);
  assert.equal(s.players[1].chars[0].rested, true);
  assert.equal(s.players[0].leader.don, 3);
  coherent(s);
});

test('« Luffy deviendra un jour le roi des pirates !! » : redresse le Leader Zoro ; [Déclenchement] +1000', () => {
  let s = scenario(D, (g) => {
    g.players[0].leader.rested = true;
    setHand(g, 0, ['OP12-039']);
    setDon(g, 0, 3);
  });
  s = play(s, 'OP12-039');
  assert.equal(s.players[0].leader.rested, false);
  coherent(s);
  // [Déclenchement] : Sabo touche le Leader Zoro dont la Vie du dessus est l'Événement
  s = scenario(['ST-35', 'ST-32'], (g) => {
    g.players[0].leader.don = 2;
    setDon(g, 0, 0);
    setHand(g, 1, []);
    setLife(g, 1, ['OP12-039', 'OP12-023']);
  });
  s = attack(s, s.players[0].leader.uid, s.players[1].leader.uid);
  s = choose(s, 'trigger');
  expectTag(s, 'ownPower');
  s = choose(s, `card:${s.players[1].leader.uid}`);
  assert.equal(power(s, s.players[1].leader.uid), 6000);
  coherent(s);
});

test('Ryuma : [Jouée] et [En attaquant] mettent KO un Personnage adverse épuisé de coût 4 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['OP15-036']);
    setDon(g, 0, 6);
    setChars(g, 1, [{ num: 'OP13-005', extra: { rested: true } }, { num: 'ST35-003' }, { num: 'OP12-093', extra: { rested: true } }]);
  });
  const [inazuma, corbeau, morley] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'OP15-036');
  expectTag(s, 'oppKo');
  const ids = s.decision!.options.map((o) => o.id);
  assert.ok(ids.includes(`card:${inazuma}`));
  assert.ok(!ids.includes(`card:${corbeau}`), 'redressé');
  assert.ok(!ids.includes(`card:${morley}`), 'coût 8 sur le terrain');
  s = choose(s, `card:${inazuma}`);
  assert.ok(s.players[1].trash.some((c) => c.uid === inazuma));
  coherent(s);

  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'OP15-036' }]);
    setDon(g, 0, 0);
    setChars(g, 1, [{ num: 'OP13-005', extra: { rested: true } }]);
  });
  const victim = s.players[1].chars[0].uid;
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'oppKo');
  s = choose(s, `card:${victim}`);
  assert.ok(s.players[1].trash.some((c) => c.uid === victim));
});

test('X-Drake (ST24-005) : avec un Leader {Supernovae}, épuise un coût 5 ou moins, puis redresse 1 DON!! en fin de tour', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST24-005']);
    setDon(g, 0, 5);
    setChars(g, 1, [{ num: 'OP13-005' }]);
  });
  const target = s.players[1].chars[0].uid;
  s = play(s, 'ST24-005');
  s = choose(s, `card:${target}`);
  assert.equal(s.players[1].chars[0].rested, true);
  assert.equal(s.players[0].donActive, 0);
  s = act(s, 'end');
  assert.equal(s.active, 1);
  assert.equal(s.players[0].donActive, 1, 'une DON!! redressée pour le tour adverse');
  coherent(s);
});

test('Kinémon : épuiser 1 DON!! (ou le Leader <Tranche>) pour piocher 2 cartes et en défausser 1', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST32-001', 'OP12-023']);
    setDon(g, 0, 2);
    setDeckTop(g, 0, ['ST32-002', 'OP12-031']);
  });
  s = play(s, 'ST32-001');
  expectTag(s, 'kinemonCost');
  assert.ok(hasOption(s, 'leader') && hasOption(s, 'don'));
  s = choose(s, 'don');
  expectTag(s, 'discard');
  s = choose(s, /Kawamatsu/);
  assert.deepEqual(s.players[0].hand.map((c) => c.num).sort(), ['OP12-031', 'ST32-002']);
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
});

test('Mihawk : [Jouée] joue [Perona] ou un Personnage <Tranche> de coût 5 ou moins ; épuisé pendant mon tour : pioche 1, défausse 1', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST32-003', 'OP10-036', 'OP12-023', 'OP15-036']);
    setDon(g, 0, 6);
  });
  s = play(s, 'ST32-003');
  expectTag(s, 'playFree');
  const labels = s.decision!.options.map((o) => o.label);
  assert.ok(labels.some((l) => l.startsWith('Perona')) && labels.some((l) => l.startsWith('Kawamatsu')));
  assert.ok(!labels.some((l) => l.startsWith('Ryuma')), 'coût 6');
  s = choose(s, /Perona/);
  assert.ok(s.players[0].chars.some((c) => c.num === 'OP10-036'));
  coherent(s);

  s = scenario(D, (g) => {
    setChars(g, 0, [{ num: 'ST32-003' }]);
    setHand(g, 0, ['OP12-023']);
    setDeckTop(g, 0, ['ST32-002']);
    setDon(g, 0, 0);
  });
  s = attack(s, s.players[0].chars[0].uid, s.players[1].leader.uid);
  expectTag(s, 'discard');
  s = choose(s, /Kawamatsu/);
  assert.deepEqual(s.players[0].hand.map((c) => c.num), ['ST32-002']);
});

test('Rayleigh : [Initiative : Personnage] avec un Leader <Tranche> ; [Jouée] épuise 2 Personnages adverses de coût 2 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST32-004']);
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'OP13-008' }, { num: 'OP12-090' }]);
  });
  const [ivankov, betty] = s.players[1].chars.map((c) => c.uid);
  s = play(s, 'ST32-004');
  expectTag(s, 'oppRest');
  assert.ok(!s.decision!.options.some((o) => o.id === `card:${betty}`), 'Belo Betty coûte 3');
  s = choose(s, `card:${ivankov}`);
  const rayleigh = s.players[0].chars.find((c) => c.num === 'ST32-004')!.uid;
  assert.ok(hasOption(s, `attack:${rayleigh}:${ivankov}`));
  assert.ok(!hasOption(s, `attack:${rayleigh}:${s.players[1].leader.uid}`));
  coherent(s);
});

test('Roronoa Zoro (ST32-005) : [Jouée] épuise un Personnage adverse de coût 2 ou moins', () => {
  let s = scenario(D, (g) => {
    setHand(g, 0, ['ST32-005']);
    setDon(g, 0, 1);
    setChars(g, 1, [{ num: 'OP13-008' }]);
  });
  const ivankov = s.players[1].chars[0].uid;
  s = play(s, 'ST32-005');
  s = choose(s, `card:${ivankov}`);
  assert.equal(s.players[1].chars[0].rested, true);
  coherent(s);
});
