// Famille du Leader Zoro (phase 4E) : cartes vertes {Équipage de Chapeau de paille}, qui épuisent (cartes adverses,
// DON!! comprises), redressent leurs DON!! et leurs Personnages, et se protègent. Decks d'essai aux Leaders Zoro, Luffy
// {ODYSSEY} (multicolore) et Kaido pour les conditions fausses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { FAM_ZORO } from '../engine/cards/fam-zoro.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { attackAbility, canBeKO, canPlayCharacters, donOnField, power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import {
  aiAnswers, attack, choose, coherent, expectTag, play, scenario, setChars, setDon, setHand, setLife, take,
} from './helpers.ts';

const FAMILY = Object.keys(FAM_ZORO);
const cards = { ...Object.fromEntries(FAMILY.map((n) => [n, 2])), 'EB01-039': 2, 'OP05-051': 2 };
const ZORO = 'TEST-ZORO';
const ODY = 'TEST-ZORO-ODYSSEY';
const KAIDO = 'TEST-ZORO-KAIDO';
DECKS[ZORO] = { id: ZORO, name: 'Essai', series: 'TEST', leader: 'OP12-020', cards };
DECKS[ODY] = { id: ODY, name: 'Essai', series: 'TEST', leader: 'OP09-022', cards };
DECKS[KAIDO] = { id: KAIDO, name: 'Essai', series: 'TEST', leader: 'OP17-058', cards };

// adversaire ST-21
const O_SENTOMARU = 'ST21-007';  // coût 2, 2000, [Bloqueur]
const O_JINBE = 'ST21-005';      // coût 2, 4000
const O_STUSSY = 'ST21-006';     // coût 3, 5000
const O_CHOPPER = 'ST21-008';    // coût 4, 6000
const O_LUFFY = 'ST21-014';      // coût 5, 6000

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const noCounter = (s: GameState) => (s.decision?.kind === 'counter' ? choose(s, 'pass') : s);
const toCounter = (s: GameState) => {
  while (s.decision && s.decision.kind !== 'counter') s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : 'no');
  return s;
};
const toMain = (s: GameState) => {
  for (let i = 0; i < 30 && s.decision && s.decision.kind !== 'main'; i++) {
    const d = s.decision;
    s = choose(s, d.kind === 'blocker' ? 'noblock' : d.kind === 'counter' ? 'pass' : d.options.some((o) => o.id === 'no') ? 'no' : d.options[0].id);
  }
  return s;
};

test('Brook (OP15-032) : épuiser une carte adverse, DON!! comprise ; Monkey D. Luffy (OP09-036) : avec 2 Personnages épuisés', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP15-032']); setDon(g, 0, 6); setDon(g, 1, 3); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = play(s, 'OP15-032');
  aiAnswers(s);
  assert.ok(s.decision!.options.some((o) => o.id === `card:${s.players[1].leader.uid}`), 'le Leader adverse');
  s = choose(s, 'don');
  assert.equal(s.players[1].donActive, 2);
  coherent(s);
  for (const rested of [2, 1]) {
    let t = scenario([ZORO, 'ST-21'], (g) => {
      setHand(g, 0, ['OP09-036']);
      setChars(g, 0, [{ num: 'OP13-030', extra: { rested: true } }, { num: 'OP13-034', extra: { rested: rested >= 2 } }]);
      setDon(g, 0, 5);
      setDon(g, 1, 3);
      setChars(g, 1, [{ num: O_CHOPPER }]);
    });
    t = play(t, 'OP09-036');
    if (rested >= 2) t = choose(t, `card:${theirs(t, O_CHOPPER).uid}`);
    assert.equal(theirs(t, O_CHOPPER).rested, rested >= 2);
  }
});

test('Roronoa Zoro (EB02-019) : attaque des Personnages dès son tour si l’adversaire en a 2 ; [Jouée] Leader {Équipage de Chapeau de paille} : épuiser de coût 4 ou moins', () => {
  for (const [deck, oppChars] of [[ZORO, 2], [KAIDO, 1]] as const) {
    let s = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['EB02-019']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_JINBE }].slice(0, oppChars)); });
    s = play(s, 'EB02-019');
    if (deck === ZORO) s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
    assert.equal(theirs(s, O_CHOPPER).rested, deck === ZORO);
    assert.deepEqual(attackAbility(s, 0, mine(s, 'EB02-019')), oppChars >= 2 ? { can: true, charsOnly: true } : { can: false, charsOnly: false });
  }
});

test('Gum Gum Gigant Pistol : +6000 et pas redressé à la prochaine Recharge ; You Ain’t Even Worth Killing Time!! : au choix', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['EB02-021']); setDon(g, 0, 3); setChars(g, 0, [{ num: 'OP13-030' }]); });
  s = choose(play(s, 'EB02-021'), `card:${mine(s, 'OP13-030').uid}`);
  assert.equal(power(s, mine(s, 'OP13-030').uid), 12000);
  mine(s, 'OP13-030').rested = true;
  s = toMain(act(s, 'end'));
  s = toMain(act(s, 'end'));
  assert.equal(s.active, 0);
  assert.ok(mine(s, 'OP13-030').rested, 'pas redressé');
  s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP06-039']); setDon(g, 0, 4); setChars(g, 1, [{ num: O_CHOPPER, extra: { rested: true } }]); });
  s = play(s, 'OP06-039');
  expectTag(s, 'oppKo');  // déjà épuisé : seul le choix « KO » sert, il est pris d'office
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
});

test('Roronoa Zoro (OP06-118) : [En attaquant] [Une fois par tour] épuiser 1 DON!! : se redresser ; Ashura, neuf éclairs démoniaques', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP06-118' }]); setDon(g, 0, 2); });
  s = choose(attack(s, mine(s, 'OP06-118').uid, s.players[1].leader.uid), 'yes');
  s = toMain(s);
  assert.equal(mine(s, 'OP06-118').rested, false);
  s = attack(s, mine(s, 'OP06-118').uid, s.players[1].leader.uid);
  assert.notEqual(s.decision?.tag, 'may', 'une fois par tour');
  coherent(toMain(s));
  s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP07-036']); setDon(g, 0, 2); setChars(g, 0, [{ num: 'OP13-030' }, { num: 'OP13-034' }]); setChars(g, 1, [{ num: O_LUFFY }]); });
  s = choose(play(s, 'OP07-036'), `card:${s.players[0].leader.uid}`);
  s = choose(s, 'yes');
  s = choose(s, `card:${mine(s, 'OP13-030').uid}`);
  s = choose(s, `card:${theirs(s, O_LUFFY).uid}`);
  assert.ok(mine(s, 'OP13-030').rested);
  assert.ok(theirs(s, O_LUFFY).rested);
  assert.equal(power(s, s.players[0].leader.uid), 8000);
  coherent(s);
});

test('Usopp (OP09-024) : avec 2 Personnages épuisés, piocher 2 et défausser 2 ; Sanji (OP09-028) : [En cas de KO] Vie en main : jouer de la Défausse', () => {
  for (const rested of [true, false]) {
    let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP09-024']); setDon(g, 0, 4); setChars(g, 0, [{ num: 'OP13-030', extra: { rested: true } }, { num: 'OP13-034', extra: { rested } }]); });
    s = play(s, 'OP09-024');
    while (s.decision?.tag === 'discard') s = choose(s, (o) => o.id.startsWith('card:'));
    assert.equal(s.players[1 - 1].hand.length, 0);
    assert.equal(s.players[0].trash.length, rested ? 2 : 0);
  }
  let s = scenario([ZORO, ZORO], (g) => {
    setChars(g, 0, [{ num: 'OP09-028' }]);
    g.players[0].trash.push(take(g, 0, 'OP13-034'));
    setHand(g, 1, ['EB01-039']);
    setDon(g, 1, 6);
  }, 1);
  const life = s.players[0].life.length;
  s = choose(play(s, 'EB01-039', 1), 'yes');
  if (s.decision?.player === 1) s = choose(s, `card:${mine(s, 'OP09-028').uid}`);
  s = choose(s, 'yes');
  s = choose(s, 'top');
  s = choose(s, (o) => o.num === 'OP13-034');
  assert.ok(mine(s, 'OP13-034').rested);
  assert.equal(s.players[0].life.length, life - 1);
  coherent(s);
});

test('Nico Robin (OP09-033) : avec 2 Personnages épuisés, ses Personnages ne peuvent pas être mis KO par des effets ; Franky (OP10-034) : KO en combat remplacé par une Vie', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP09-033']); setDon(g, 0, 4); setChars(g, 0, [{ num: 'OP13-030', extra: { rested: true } }, { num: 'OP13-034', extra: { rested: true } }]); });
  s = play(s, 'OP09-033');
  assert.equal(canBeKO(s, mine(s, 'OP13-030').uid, 'effect', 1), false);
  assert.equal(canBeKO(s, mine(s, 'OP13-030').uid, 'battle', 1), true);
  coherent(s);
  s = scenario([ZORO, 'ST-21'], (g) => { setChars(g, 0, [{ num: 'OP10-034', extra: { rested: true } }]); setHand(g, 0, []); setChars(g, 1, [{ num: O_LUFFY, extra: { don: 1 } }]); setDon(g, 1, 0); }, 1);
  const life = s.players[0].life.length;
  s = attack(s, theirs(s, O_LUFFY).uid, mine(s, 'OP10-034').uid);
  while (s.decision && s.decision.tag !== 'replace' && s.decision.kind !== 'main') s = choose(s, s.decision.kind === 'blocker' ? 'noblock' : s.decision.kind === 'counter' ? 'pass' : 'no');
  expectTag(s, 'replace');
  s = choose(s, 'yes');
  assert.ok(mine(s, 'OP10-034'));
  assert.equal(s.players[0].life.length, life - 1);
  coherent(toMain(s));
});

test('Ashura, sabres au clair : épuiser 3 DON!! : 2 Personnages ou DON!! adverses ; Gum Gum Elephant Gun et Nami (OP14-031) : DON!! redressées à la fin du tour', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP12-037']); setDon(g, 0, 4); setDon(g, 1, 2); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = choose(play(s, 'OP12-037'), 'yes');
  s = choose(choose(s, `card:${theirs(s, O_CHOPPER).uid}`), 'don');
  assert.ok(theirs(s, O_CHOPPER).rested);
  assert.equal(s.players[1].donActive, 1);
  coherent(s);
  s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP14-031']); setDon(g, 0, 6); setChars(g, 1, [{ num: O_CHOPPER }, { num: O_LUFFY }]); });
  s = play(s, 'OP14-031');
  s = choose(choose(s, `card:${theirs(s, O_CHOPPER).uid}`), `card:${theirs(s, O_LUFFY).uid}`);
  assert.equal(s.players[0].donActive, 2);
  s = act(s, 'end');
  assert.ok(s.log.some((l) => /redresse 4 DON/.test(l.text)), 'les 4 épuisées sont redressées en fin de tour');
});

test('Monkey D. Luffy (OP14-034) : [Votre tour] +1000 aux verts {Équipage de Chapeau de paille} de coût de base 4 ou plus ; KO par effet adverse remplacé', () => {
  let s = scenario([ZORO, ZORO], (g) => {
    setChars(g, 0, [{ num: 'OP14-034' }, { num: 'OP13-030' }, { num: 'OP13-034' }]);
    setHand(g, 1, ['EB01-039']);
    setDon(g, 1, 6);
  });
  assert.equal(power(s, mine(s, 'OP13-030').uid), 7000, 'coût 5');
  assert.equal(power(s, mine(s, 'OP13-034').uid), 4000, 'coût 3');
  s = scenario([ZORO, ZORO], (g) => {
    setChars(g, 0, [{ num: 'OP14-034' }, { num: 'OP13-030' }, { num: 'OP13-034' }]);
    setHand(g, 1, ['EB01-039']);
    setDon(g, 1, 6);
  }, 1);
  assert.equal(power(s, mine(s, 'OP13-030').uid), 6000, 'tour adverse');
  s = choose(play(s, 'EB01-039', 1), 'yes');
  s = choose(s, `card:${mine(s, 'OP13-030').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  s = choose(s, `card:${mine(s, 'OP13-034').uid}`);
  assert.ok(mine(s, 'OP13-030'));
  assert.ok(mine(s, 'OP13-034').rested);
  coherent(s);
});

test('Nico Robin (P-111) : épuiser 1 DON!! à la place ; Roronoa Zoro (OP16-035) : épuiser une carte adverse, défausser 1 : 3 DON!! au Leader', () => {
  let s = scenario([ZORO, ZORO], (g) => { setChars(g, 0, [{ num: 'P-111' }, { num: 'OP13-030' }]); setDon(g, 0, 1); setHand(g, 1, ['OP05-051']); setDon(g, 1, 7); }, 1);
  s = play(s, 'OP05-051', 1);
  s = choose(s, `card:${mine(s, 'P-111').uid}`);
  s = choose(s, (o) => o.id.startsWith('replace:'));
  assert.ok(mine(s, 'P-111'));
  assert.equal(s.players[0].donActive, 0);
  coherent(s);
  s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP16-035', 'OP13-030']); setDon(g, 0, 7, 3); setChars(g, 1, [{ num: O_CHOPPER }]); });
  s = play(s, 'OP16-035');
  s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  s = choose(s, 'yes');
  assert.equal(s.players[0].leader.don, 3);
  coherent(s);
});

test('Monkey D. Luffy (OP13-118) : Leader multicolore : 4 DON!! redressées, plus de Personnage de coût 5 ou plus ; Luffy (OP16-034) ; Sanji (EB01-014)', () => {
  for (const deck of [ODY, ZORO]) {
    let s = scenario([deck, 'ST-21'], (g) => { setHand(g, 0, ['OP13-118']); setDon(g, 0, 6, 4); });
    s = play(s, 'OP13-118');
    assert.equal(s.players[0].donActive, deck === ODY ? 4 : 0);
    assert.equal(canPlayCharacters(s, 0, 'OP13-030'), false, 'coût 5');
    assert.equal(canPlayCharacters(s, 0, 'OP13-034'), true, 'coût 3');
  }
  const s = scenario([ZORO, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: 'OP16-034', extra: { don: 1 } }, { num: 'OP13-030' }, { num: 'OP13-034' }, { num: 'EB01-014', extra: { don: 1 } }]);
    setDon(g, 0, 0, 6);
  });
  assert.equal(power(s, mine(s, 'OP16-034').uid), 1000 + 4000);
  assert.equal(power(s, mine(s, 'EB01-014').uid), 5000 + 1000 + 2000);
  assert.equal(donOnField(s, 0), 8);
});

test('Gum Gum Snake Shot : [Contre] KO de l’attaquant épuisé de coût 4 ou moins (l’IA le joue) ; Lion Strike', () => {
  let s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['OP13-039']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_CHOPPER }]); }, 1);
  s = toCounter(attack(s, theirs(s, O_CHOPPER).uid, s.players[0].leader.uid));
  assert.ok(heuristicChooser(s, s.decision!).startsWith('cevent:'));
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  if (s.decision?.kind === 'effect') s = choose(s, `card:${theirs(s, O_CHOPPER).uid}`);
  s = noCounter(s);
  assert.equal(s.players[1].chars.length, 0);
  coherent(s);
  s = scenario([ZORO, 'ST-21'], (g) => { setHand(g, 0, ['ST12-016']); setDon(g, 0, 2); setChars(g, 1, [{ num: O_SENTOMARU }]); });
  s = play(s, 'ST12-016');
  s = choose(s, `card:${theirs(s, O_SENTOMARU).uid}`);
  assert.ok(theirs(s, O_SENTOMARU).rested);
  void setLife;
  void O_STUSSY;
});
