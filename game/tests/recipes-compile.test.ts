// Recettes compilées et niveau de confiance (étape C, tâche C1.1). Les recettes sont écrites ici, comme dans un fichier
// de set (recipes/sets/<set>.ts) : des numéros et des valeurs, aucun texte de carte. Les cartes réelles utilisées sont
// « à faire » au catalogue ; leurs recettes décrivent leur effet (relu sur le texte officiel pendant le développement).
// Des cartes inventées (ZZ19-...) servent aux conventions du compilateur.
import assert from 'node:assert/strict';
import test from 'node:test';
import { OP03_ROUGE } from '../engine/cards/op03-rouge.ts';
import {
  addRecipeSet, CARDS, cardStatus, handCoded, loadCardData, neededCards, notYetPlayable, playableCards, recipeCompiled,
  setWaitingCards, waitingCards, waitingLeader,
} from '../engine/cards/index.ts';
import { playableErrors } from '../engine/deckRules.ts';
import { DECKS } from '../engine/decks.ts';
import { act } from '../engine/engine.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { confidence, isPlayableLevel } from '../engine/recipes/confidence.ts';
import type { Ability, Recipe, RecipeSet, Target } from '../engine/recipes/types.ts';
import { def, fieldCost, hasKeyword, power } from '../engine/rules.ts';
import type { CardData, GameState, PlayerId } from '../engine/types.ts';
import { attack, choose, coherent, expectTag, logHas, play, scenario, setChars, setDon, setHand, setLife } from './helpers.ts';

// Cartes réelles « à faire » (avant ce test)
const KO2 = 'EB01-049';        // Personnage coût 5 : [Jouée] KO adverse coût 2 ou moins
const BOUNCE = 'OP08-042';     // Personnage coût 4 : [DON!! x1] [En attaquant] renvoie en main un Personnage coût 3 ou moins
const VIVI_COUNTER = 'OP11-115'; // Événement coût 1 : [Contre] sous condition de Leader ; [Déclenchement] KO adverse (EB03-011 jusqu'à S4)
const MINUS_COST = 'EB01-048'; // Personnage coût 4 : [Activation : Principale] épuiser cette carte : coût adverse
const MINUS_POWER = 'OP13-020'; // Événement coût 3 : [Principale] puissance adverse ; [Déclenchement] son effet [Principale]
const RESTED_POWER = 'OP01-039'; // Personnage (recette d'essai : [Tour adverse] épuisé, +2000) ; OP14-026, jouable depuis S5, remplacé
const VIVI_L = 'OP11-022';     // un Leader [Shirahoshi] (le nom VIVI est resté de l'exemple EB03-011, jouable depuis S4)
// adversaire ST-21
const O_BONNEY = 'ST21-004';   // coût 1, 3000
const O_STUSSY = 'ST21-006';   // coût 3, 5000
const O_CHOPPER = 'ST21-008';  // coût 4, 6000

// Cartes inventées (conventions du compilateur)
const FAKE_EVENT = 'ZZ19-001';
const FAKE_BLOCKER = 'ZZ19-002';
const FAKE_MANUAL = 'ZZ19-003';
const FAKE_CHOICE = 'ZZ19-004';
const FAKE_GROUP = 'ZZ19-005';
const FAKE_THEN = 'ZZ19-006';
const base: CardData = {
  number: '', imageId: '', lang: 'en', rarity: 'C', category: 'CHARACTER', name: 'Essai', names: ['Essai'], cost: 2, life: null,
  power: 3000, counter: 1000, colors: ['Red'], types: [], typeLabels: [], attributes: [], effect: '-', trigger: null,
  effectEn: '-', triggerEn: null, keywords: [], blocks: ['5'],
};
loadCardData({
  [FAKE_EVENT]: { ...base, number: FAKE_EVENT, category: 'EVENT', power: null, counter: null, cost: 1 },
  [FAKE_BLOCKER]: { ...base, number: FAKE_BLOCKER },
  [FAKE_MANUAL]: { ...base, number: FAKE_MANUAL },
  [FAKE_CHOICE]: { ...base, number: FAKE_CHOICE },
  [FAKE_GROUP]: { ...base, number: FAKE_GROUP },
  [FAKE_THEN]: { ...base, number: FAKE_THEN },
});

const oppChar = (filter: Target['filter'], count = 1): Target => ({ side: 'opp', zone: 'field', characters: true, count, upTo: true, filter });
const self: Target = { side: 'own', zone: 'field', self: true, characters: true, count: 1, upTo: false, filter: {} };
const ability = (a: Partial<Ability> & Pick<Ability, 'timing' | 'steps'>): Ability => a;

// Recettes des cartes réelles, écrites comme dans un fichier de set
const REAL: RecipeSet = {
  set: 'EB01',
  entries: {
    [KO2]: { level: 'verified', recipe: { num: KO2, abilities: [ability({ timing: 'onPlay', steps: [{ action: { kind: 'ko', target: oppChar({ costMax: 2 }) } }] })] } },
    [MINUS_COST]: {
      level: 'verified',
      recipe: { num: MINUS_COST, abilities: [ability({ timing: 'activateMain', cost: [{ kind: 'restSelf' }], steps: [{ action: { kind: 'cost', target: oppChar({}), amount: -4, until: 'turn' } }] })] },
    },
  },
};
const OTHERS: RecipeSet = {
  set: 'OP08',
  entries: {
    [BOUNCE]: {
      level: 'verified',
      recipe: {
        num: BOUNCE,
        abilities: [ability({ timing: 'whenAttacking', don: 1, steps: [{ action: { kind: 'bounce', target: { side: 'any', zone: 'field', characters: true, count: 1, upTo: true, filter: { costMax: 3 } } } }] })],
      },
    },
    [VIVI_COUNTER]: {
      level: 'verified',
      recipe: {
        num: VIVI_COUNTER,
        abilities: [ability({
          timing: 'counter', condition: { kind: 'leaderIs', names: ['Shirahoshi'] },
          steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', leader: true, characters: true, count: 1, upTo: true, filter: {} }, amount: 4000, until: 'battle' } }],
        })],
        trigger: ability({ timing: 'trigger', steps: [{ action: { kind: 'ko', target: oppChar({ costMax: 2 }) } }] }),
      },
    },
    [MINUS_POWER]: {
      level: 'verified',
      recipe: {
        num: MINUS_POWER,
        abilities: [ability({ timing: 'main', steps: [{ action: { kind: 'power', target: oppChar({}), amount: -5000, until: 'turn' } }] })],
        trigger: ability({ timing: 'trigger', steps: [{ action: { kind: 'activate', which: 'main' } }] }),
      },
    },
    [RESTED_POWER]: {
      level: 'verified',
      recipe: {
        num: RESTED_POWER,
        abilities: [ability({ timing: 'static', oppTurn: true, condition: { kind: 'selfState', rested: true }, steps: [{ action: { kind: 'power', target: self, amount: 2000, until: 'permanent' } }] })],
      },
    },
  },
};
const REAL_NUMS = [...Object.keys(REAL.entries), ...Object.keys(OTHERS.entries)];

// Un deck d'essai : ST-21 plus les cartes des recettes (et l'inventée qui pourrait être piochée)
const MINE = 'TEST-RECETTES';
const VIVI = 'TEST-RECETTES-VIVI';
const cards = { ...DECKS['ST-21'].cards, ...Object.fromEntries(REAL_NUMS.map((n) => [n, 4])), [FAKE_EVENT]: 4, [FAKE_BLOCKER]: 4, [FAKE_MANUAL]: 4, [FAKE_CHOICE]: 4, [FAKE_GROUP]: 4, [FAKE_THEN]: 4 };
// déclarés après le premier test (un deck connu rend ses cartes « nécessaires », donc proposées : neededCards)
const addDecks = () => {
  DECKS[MINE] = { id: MINE, name: 'Essai', series: 'TEST', leader: 'ST21-001', cards };
  DECKS[VIVI] = { id: VIVI, name: 'Essai', series: 'TEST', leader: VIVI_L, cards };
};
const notHandled = (leader: string, list: Record<string, number>) => playableErrors(leader, list).filter((e) => e.includes('pas encore'));

const mine = (s: GameState, num: string) => s.players[0].chars.find((c) => c.num === num)!;
const theirs = (s: GameState, num: string) => s.players[1].chars.find((c) => c.num === num)!;
const leader = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
const optionUids = (s: GameState) => s.decision!.options.filter((o) => o.id.startsWith('card:')).map((o) => o.uid);
const ST21_CHARS = (g: GameState) => setChars(g, 1, [{ num: O_BONNEY }, { num: O_STUSSY }, { num: O_CHOPPER }]);

test('recettes : avant leur chargement, les cartes réelles des exemples sont « à faire » et non proposées', () => {
  const playable = new Set(playableCards());
  for (const n of REAL_NUMS) {
    assert.equal(confidence(n), 'todo', n);
    assert.equal(cardStatus(n), 'todo', n);
    assert.ok(!playable.has(n), n);
    assert.ok(!neededCards().includes(n), `${n} : carte d'un deck préconstruit, mauvais exemple`);
    assert.ok(notYetPlayable(n));
  }
  assert.ok(waitingCards().cards.includes(KO2));
  assert.ok(notHandled('ST21-001', { [KO2]: 1 }).some((e) => e.includes(KO2)));
});

test('recettes : une recette vérifiée rend la carte jouable (niveau verified, statut coded, proposée par l\'éditeur)', () => {
  addRecipeSet(REAL);
  addRecipeSet(OTHERS);
  addDecks();
  const playable = new Set(playableCards());
  for (const n of REAL_NUMS) {
    assert.ok(recipeCompiled(n)?.ok, n);
    assert.equal(confidence(n), 'verified', n);
    assert.equal(cardStatus(n), 'coded', n);
    assert.ok(isPlayableLevel(confidence(n)));
    assert.ok(playable.has(n), n);
    assert.ok(!notYetPlayable(n), n);
    assert.ok(!waitingCards().cards.includes(n), n);
  }
  assert.deepEqual(notHandled('ST21-001', { [KO2]: 1 }), []);
});

test('recettes : [Jouée] KO jusqu\'à 1 Personnage adverse de coût 2 ou moins (nom de la carte dans la question)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [KO2]); ST21_CHARS(g); setDon(g, 0, 6); });
  s = play(s, KO2);
  expectTag(s, 'oppKo');
  assert.ok(s.decision!.prompt.startsWith(def(KO2).name), s.decision!.prompt);
  assert.deepEqual(optionUids(s), [theirs(s, O_BONNEY).uid], 'coût 2 ou moins seulement');
  s = choose(s, (o) => o.uid === theirs(s, O_BONNEY).uid);
  assert.ok(s.players[1].trash.some((c) => c.num === O_BONNEY));
  assert.ok(mine(s, KO2));
  coherent(s);

  // aucune cible : aucune question
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [KO2]); setChars(g, 1, [{ num: O_STUSSY }]); setDon(g, 0, 6); });
  s = play(s, KO2);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[1].chars.length, 1);
  coherent(s);
});

test('recettes : [DON!! x1] [En attaquant] renvoyer en main un Personnage (les siens aussi), rien sans DON!!', () => {
  let s = scenario([MINE, 'ST-21'], (g) => {
    setChars(g, 0, [{ num: BOUNCE, extra: { don: 1 } }]); setDon(g, 0, 1); ST21_CHARS(g); setHand(g, 1, []); setLife(g, 1, ['ST21-013', 'ST21-005']);
  });
  const atk = mine(s, BOUNCE);
  assert.equal(def(BOUNCE).attackUseful!(s, 0, atk, leader(s, 1)), true);
  s = attack(s, atk.uid, leader(s, 1));
  expectTag(s, 'bounce');
  const uids = optionUids(s);
  assert.ok(uids.includes(theirs(s, O_STUSSY).uid) && uids.includes(theirs(s, O_BONNEY).uid) && !uids.includes(theirs(s, O_CHOPPER).uid));
  s = choose(s, (o) => o.uid === theirs(s, O_STUSSY).uid);
  assert.ok(s.players[1].hand.some((c) => c.num === O_STUSSY));
  coherent(s);

  // sans DON!! donnée : l'effet ne fait rien, l'IA le sait
  s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: BOUNCE }]); ST21_CHARS(g); setHand(g, 1, []); });
  assert.equal(def(BOUNCE).attackUseful!(s, 0, mine(s, BOUNCE), leader(s, 1)), false);
  s = attack(s, mine(s, BOUNCE).uid, leader(s, 1));
  assert.notEqual(s.decision?.tag, 'bounce');
  coherent(s);
});

test('recettes : [Contre] sous condition de Leader, puissance connue de l\'IA ; [Déclenchement] compilé', () => {
  // Leader [Shirahoshi] : +4000 à la carte attaquée
  let s = scenario([VIVI, 'ST-21'], (g) => { setHand(g, 0, [VIVI_COUNTER]); setChars(g, 0, []); setDon(g, 0, 2); }, 1);
  s = attack(s, leader(s, 1), leader(s, 0));
  assert.equal(def(VIVI_COUNTER).counterPower!(s, 0, leader(s, 0)), 4000);
  const life = s.players[0].life.length;
  s = choose(s, (o) => o.id.startsWith('cevent:'));
  // plus rien à contrer : le combat se résout, l'attaque est repoussée
  assert.ok(logHas(s, 'repoussée'));
  assert.equal(s.players[0].life.length, life);
  coherent(s);

  // un autre Leader : rien
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [VIVI_COUNTER]); setChars(g, 0, []); setDon(g, 0, 2); }, 1);
  s = attack(s, leader(s, 1), leader(s, 0));
  assert.equal(def(VIVI_COUNTER).counterPower!(s, 0, leader(s, 0)), 0);
  assert.ok(def(VIVI_COUNTER).onTrigger, '[Déclenchement] propre à la carte');
});

test('recettes : [Activation : Principale] coût « épuiser cette carte », −4 de coût pour le tour', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: MINUS_COST }]); ST21_CHARS(g); });
  const me = mine(s, MINUS_COST);
  assert.ok(s.decision!.options.some((o) => o.id === `act:${me.uid}`));
  s = act(s, `act:${me.uid}`);
  expectTag(s, 'oppCost');
  s = choose(s, (o) => o.uid === theirs(s, O_CHOPPER).uid);
  assert.equal(fieldCost(s, theirs(s, O_CHOPPER).uid), 0);
  assert.equal(mine(s, MINUS_COST).rested, true, 'coût payé');
  assert.ok(!s.decision!.options.some((o) => o.id === `act:${me.uid}`), 'épuisée : plus activable');
  coherent(s);
});

test('recettes : Événement [Principale], et [Déclenchement] « activez l\'effet [Principale] »', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [MINUS_POWER]); ST21_CHARS(g); setDon(g, 0, 3); });
  assert.equal(def(MINUS_POWER).mainUseful!(s, 0), true);
  s = play(s, MINUS_POWER);
  expectTag(s, 'oppPower');
  s = choose(s, (o) => o.uid === theirs(s, O_STUSSY).uid);
  assert.equal(power(s, theirs(s, O_STUSSY).uid), 0);
  coherent(s);
  assert.equal(def(MINUS_POWER).onTrigger, def(MINUS_POWER).onMain);
  s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 1, []); });
  assert.equal(def(MINUS_POWER).mainUseful!(s, 0), false, 'aucune cible : inutile');
});

test('recettes : effet permanent [Tour adverse] sous condition (épuisé : +2000)', () => {
  const base = def(RESTED_POWER).power!;
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: RESTED_POWER, extra: { rested: true } }]); }, 1);
  assert.equal(power(s, mine(s, RESTED_POWER).uid), base + 2000);
  s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: RESTED_POWER }]); }, 1);
  assert.equal(power(s, mine(s, RESTED_POWER).uid), base, 'redressé');
  s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: RESTED_POWER, extra: { rested: true } }]); }, 0);
  assert.equal(power(s, mine(s, RESTED_POWER).uid), base, 'son propre tour');
});

test('recettes : le code à la main l\'emporte sur une recette', () => {
  const IZO = 'OP03-003';
  assert.ok(handCoded(IZO));
  addRecipeSet({ set: 'OP03', entries: { [IZO]: { level: 'verified', recipe: { num: IZO, abilities: [ability({ timing: 'onPlay', steps: [{ action: { kind: 'draw', n: 3 } }] })] } } } });
  assert.equal(confidence(IZO), 'coded');
  assert.equal(CARDS[IZO].onPlay, OP03_ROUGE[IZO].onPlay);
});

test('recettes : une carte generated ou doubt n\'est jamais jouable ; un doute l\'emporte aussi sur le code à la main', () => {
  const GEN = 'OP01-029';   // Événement « à faire » (OP14-059, jouable depuis S5, remplacé)
  const DOUBT = 'OP04-056';
  assert.equal(confidence(GEN), 'todo');
  addRecipeSet({
    set: 'OP01',
    entries: {
      [GEN]: { level: 'generated', recipe: { num: GEN, abilities: [ability({ timing: 'main', steps: [{ action: { kind: 'draw', n: 2 } }] })] } },
      [DOUBT]: {
        level: 'doubt',
        recipe: { num: DOUBT, abilities: [ability({ timing: 'main', steps: [{ action: { kind: 'bottom', target: { side: 'any', zone: 'field', characters: true, count: 1, upTo: true, filter: {} } } }] })] },
        doubt: { question: 'Question d\'essai ?', readings: ['première lecture', 'seconde lecture'] },
      },
    },
  });
  assert.equal(confidence(GEN), 'generated');
  assert.equal(confidence(DOUBT), 'doubt');
  const playable = new Set(playableCards());
  for (const n of [GEN, DOUBT]) {
    assert.equal(cardStatus(n), 'todo', n);
    assert.ok(!playable.has(n), n);
    assert.ok(notHandled('ST21-001', { [n]: 1 }).some((e) => e.includes(n)), n);
    assert.ok(CARDS[n].onMain, `${n} : la recette compilée reste essayable (tests, parties au hasard)`);
  }

  // doute sur une carte codée à la main (hors decks préconstruits) : plus jouable, son code reste
  const coded = Object.keys(OP03_ROUGE).find((n) => !neededCards().includes(n) && OP03_ROUGE[n].onPlay)!;
  assert.ok(coded);
  addRecipeSet({ set: 'OP03', entries: { [coded]: { level: 'doubt', handCoded: true, doubt: { question: 'Question d\'essai ?', readings: ['a', 'b'] } } } });
  assert.equal(confidence(coded), 'doubt');
  assert.equal(cardStatus(coded), 'todo');
  assert.ok(!playableCards().includes(coded));
  assert.equal(CARDS[coded].onPlay, OP03_ROUGE[coded].onPlay);
});

test('recettes : une recette vérifiée qui ne se compile pas reste « à faire », avec ce qui manque', () => {
  const NUM = 'OP15-051';
  addRecipeSet({
    set: 'OP15',
    entries: {
      [NUM]: { level: 'verified', recipe: { num: NUM, abilities: [ability({ timing: 'onPlay', steps: [{ action: { kind: 'activate', which: 'onKO' } }] })] } },
    },
  });
  assert.equal(confidence(NUM), 'todo');
  assert.equal(cardStatus(NUM), 'todo');
  const r = recipeCompiled(NUM)!;
  // (durée nextTurn compilée depuis C2.2 : l'exemple est une action qu'aucune famille ne compile)
  assert.ok(!r.ok && r.missing.some((m) => m.includes('activate')));
  assert.equal(CARDS[NUM].onPlay, undefined);
});

test('compilateur : ce qui n\'est pas exact est signalé, jamais approché', () => {
  const missing = (r: Recipe) => {
    const c = compileRecipe(r);
    assert.ok(!c.ok, JSON.stringify(r));
    return c.missing.join(' | ');
  };
  const on = (steps: Ability['steps'], extra: Partial<Ability> = {}): Recipe => ({ num: 'ZZ19-099', abilities: [ability({ timing: 'onPlay', steps, ...extra })] });
  // (cibles obligatoires et « tous » : compilés depuis C2.1 pour les retraits, C2.2 pour les modifications)
  // « If you do » se compile depuis C2.6 ; sans étape avant, il n'a rien à suivre
  assert.match(missing(on([{ link: 'ifYouDo', action: { kind: 'draw', n: 1 } }])), /lien ifYouDo sans étape avant/);
  // (sans coût sur une carte du terrain : compilé depuis C2.2 ; sur un [Contre], la carte n'est pas sur le terrain)
  assert.match(missing({ num: 'ZZ19-099', abilities: [ability({ timing: 'counter', oncePerTurn: true, steps: [{ action: { kind: 'draw', n: 1 } }] })] }), /Une fois par tour/);
  assert.match(missing(on([{ action: { kind: 'manual', reason: 'absente' } }])), /manual:absente/);
  assert.match(missing({ num: 'ZZ19-099', abilities: [ability({ timing: 'when', event: { on: 'lifeRemoved' }, steps: [{ action: { kind: 'draw', n: 1 } }] })] }), /évènement lifeRemoved/);
  assert.match(missing(on([{ action: { kind: 'toLife', target: oppChar({}), faceUp: true } }])), /toLife/);
  assert.match(missing(on([{ action: { kind: 'play', from: 'hand', count: 1, upTo: true, filter: { category: ['STAGE'] } } }])), /autre chose qu'un Personnage/);
  // tout ce qui manque est listé (pas seulement le premier)
  const all = compileRecipe(on([{ action: { kind: 'activate', which: 'onKO' } }, { action: { kind: 'cantAttack', target: oppChar({}), until: 'turn', what: 'leader' } }]));
  assert.ok(!all.ok && all.missing.length === 2);
  // une recette comprise
  assert.ok(compileRecipe(on([{ action: { kind: 'draw', n: 1 } }, { link: 'then', action: { kind: 'discard', n: 1 } }])).ok);
});

// ---------- Conventions (cartes inventées) ----------

const FAKES: RecipeSet = {
  set: 'ZZ19',
  entries: {
    // « Vous pouvez défausser 1 carte : KO jusqu'à 1 Personnage adverse de coût 2 ou moins »
    [FAKE_EVENT]: { level: 'verified', recipe: { num: FAKE_EVENT, abilities: [ability({ timing: 'main', cost: [{ kind: 'discard', n: 1 }], steps: [{ action: { kind: 'ko', target: oppChar({ costMax: 2 }) } }] })] } },
    // [DON!! x1] gagne [Bloqueur] ; [Votre tour] tous vos Personnages {Straw Hat Crew} +1000
    [FAKE_BLOCKER]: {
      level: 'verified',
      recipe: {
        num: FAKE_BLOCKER,
        abilities: [
          ability({ timing: 'static', don: 1, steps: [{ action: { kind: 'keyword', target: self, keyword: 'Blocker', until: 'permanent' } }] }),
          ability({ timing: 'static', yourTurn: true, steps: [{ action: { kind: 'power', target: { side: 'own', zone: 'field', characters: true, count: 'all', upTo: false, filter: { types: ['Straw Hat Crew'] } }, amount: 1000, until: 'permanent' } }] }),
        ],
      },
    },
    [FAKE_MANUAL]: { level: 'verified', recipe: { num: FAKE_MANUAL, abilities: [ability({ timing: 'onPlay', steps: [{ cond: { kind: 'manual', reason: 'pair' }, action: { kind: 'manual', reason: 'note' } }] })] } },
    [FAKE_CHOICE]: {
      level: 'verified',
      recipe: { num: FAKE_CHOICE, abilities: [ability({ timing: 'onPlay', steps: [{ chooseOne: [[{ action: { kind: 'draw', n: 1 } }], [{ action: { kind: 'ko', target: oppChar({ costMax: 3 }) } }]] }] })] },
    },
    // « Si vous avez 2 Vies ou moins, piochez 1 carte et KO ... » (la condition couvre les deux)
    [FAKE_GROUP]: {
      level: 'verified',
      recipe: { num: FAKE_GROUP, abilities: [ability({ timing: 'onPlay', steps: [{ cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 }, group: [{ action: { kind: 'draw', n: 1 } }, { link: 'and', action: { kind: 'ko', target: oppChar({ costMax: 3 }) } }] }] })] },
    },
    // « Si vous avez 2 Vies ou moins, piochez 1 carte. Puis, KO ... » (la condition ne couvre pas le « Puis »)
    [FAKE_THEN]: {
      level: 'verified',
      recipe: { num: FAKE_THEN, abilities: [ability({ timing: 'onPlay', steps: [{ cond: { kind: 'life', side: 'own', cmp: 'le', n: 2 }, action: { kind: 'draw', n: 1 } }, { link: 'then', action: { kind: 'ko', target: oppChar({ costMax: 3 }) } }] })] },
    },
  },
};
const notes: number[] = [];
addRecipeSet(FAKES, {
  [FAKE_MANUAL]: {
    conds: { pair: (ctx) => ctx.s.players[ctx.me].hand.length % 2 === 0 },
    steps: { note: (ctx) => { notes.push(ctx.s.players[ctx.me].hand.length); } },
  },
});

test('convention : un coût facultatif n\'est proposé que si l\'effet peut servir', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_EVENT, O_BONNEY]); setChars(g, 1, [{ num: O_STUSSY }]); setDon(g, 0, 2); });
  s = play(s, FAKE_EVENT);
  assert.equal(s.decision?.kind, 'main', 'aucune cible : pas de question');
  assert.equal(s.players[0].hand.length, 1, 'rien défaussé');
  coherent(s);

  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_EVENT, O_BONNEY]); ST21_CHARS(g); setDon(g, 0, 2); });
  s = play(s, FAKE_EVENT);
  expectTag(s, 'may');
  s = choose(s, 'yes');  // la seule carte de la main est défaussée
  expectTag(s, 'oppKo');
  s = choose(s, (o) => o.uid === theirs(s, O_BONNEY).uid);
  assert.equal(s.players[1].chars.length, 2);
  assert.equal(s.players[0].hand.length, 0);
  coherent(s);
});

test('convention : effets permanents (mot-clé sous [DON!! x1], bonus à des Personnages d\'un type pendant son tour)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setChars(g, 0, [{ num: FAKE_BLOCKER }, { num: 'ST21-010' }]); });
  const me = mine(s, FAKE_BLOCKER);
  assert.equal(hasKeyword(s, 0, me, 'Blocker'), false);
  me.don = 1;
  assert.equal(hasKeyword(s, 0, me, 'Blocker'), true);
  const straw = s.players[0].chars.find((c) => def(c.num).types.includes('Straw Hat Crew'))!;
  assert.ok(straw, 'un Personnage {Straw Hat Crew} de ST-21');
  assert.equal(power(s, straw.uid), def(straw.num).power! + 1000);
  me.don = 0;
  assert.equal(power(s, me.uid), def(FAKE_BLOCKER).power!, 'pas du type');
  s.active = 1;
  assert.equal(power(s, straw.uid), def(straw.num).power!, 'tour adverse');
});

test('convention : code à la main d\'une recette (condition et action « manual »)', () => {
  notes.length = 0;
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_MANUAL, O_BONNEY, O_STUSSY]); setDon(g, 0, 2); });
  s = play(s, FAKE_MANUAL);
  assert.deepEqual(notes, [2], 'main paire après avoir joué la carte : l\'action est lancée');
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_MANUAL, O_BONNEY]); setDon(g, 0, 2); });
  s = play(s, FAKE_MANUAL);
  assert.deepEqual(notes, [2], 'main impaire : rien');
  coherent(s);
});

test('convention : « Choisissez un » avec des libellés lisibles ; portée d\'une condition (groupe ou « Puis »)', () => {
  let s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_CHOICE]); ST21_CHARS(g); setDon(g, 0, 2); });
  s = play(s, FAKE_CHOICE);
  expectTag(s, 'chooseOne');
  assert.deepEqual(s.decision!.options.map((o) => o.label), ['1. Piocher 1 carte', '2. Mettre KO : Personnage adverse de coût 3 ou moins']);
  s = choose(s, 'choice:1');
  expectTag(s, 'oppKo');

  // 5 Vies : la condition est fausse ; elle couvre le KO du groupe, pas celui qui suit « Puis »
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_GROUP]); ST21_CHARS(g); setDon(g, 0, 2); });
  const hand = s.players[0].hand.length;
  s = play(s, FAKE_GROUP);
  assert.equal(s.decision?.kind, 'main');
  assert.equal(s.players[0].hand.length, hand - 1);
  s = scenario([MINE, 'ST-21'], (g) => { setHand(g, 0, [FAKE_THEN]); ST21_CHARS(g); setDon(g, 0, 2); });
  s = play(s, FAKE_THEN);
  expectTag(s, 'oppKo');
  assert.ok(!logHas(s, 'pioche'));
});

test('interface : numéros des cartes pas encore jouables (import d\'une liste)', () => {
  const w = waitingCards();
  assert.ok(w.cards.includes('OP15-051') && !w.cards.includes(KO2));
  assert.ok(w.leaders.every((n) => CARDS[n].category === 'LEADER' && w.cards.includes(n)));
  assert.ok(w.leaders.includes('OP13-100'));   // un Leader pas encore jouable (EB03-001 jusqu'à S4)
  // côté navigateur : ces cartes ne sont pas chargées, seulement leurs numéros
  setWaitingCards({ cards: ['ZZ29-001', 'ZZ29-002'], leaders: ['ZZ29-002'] });
  assert.ok(notYetPlayable('ZZ29-001') && !waitingLeader('ZZ29-001'));
  assert.ok(waitingLeader('ZZ29-002'));
  assert.ok(!notYetPlayable('ZZ29-003'), 'numéro inconnu');
  assert.ok(!notYetPlayable(KO2));
  setWaitingCards({ cards: [], leaders: [] });
});

test('recettes : « jouez jusqu\'à 1 [Nom] » refusé quand le nom n\'est porté par aucun Personnage (garde-fou de la vague S-1)', () => {
  const playNamed = (name: string): Recipe => ({
    num: 'EB03-013',
    abilities: [ability({ timing: 'onPlay', steps: [{ action: { kind: 'play', from: 'hand', count: 1, upTo: true, filter: { name: [name] } } }] })],
  });
  // [Zou] n'est qu'un Lieu (OP08-039) : la brique « jouer un Personnage » ne le proposerait jamais
  const stage = compileRecipe(playNamed('Zou'));
  assert.equal(stage.ok, false);
  assert.ok(!stage.ok && stage.missing.some((m) => m.includes('Lieu')));
  // un nom de Personnage se compile toujours
  assert.equal(compileRecipe(playNamed('Nefertari Vivi')).ok, true);
});
