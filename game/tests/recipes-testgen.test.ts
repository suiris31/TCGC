// Banc d'essai des recettes (tâche C1.3) : tests générés, comparaison « code à la main ↔ recette », parties au hasard.
// Les recettes sont écrites par le test (structure et valeurs seulement, aucun texte de carte). Tant que le compilateur
// de C1.1 n'est pas fusionné, un petit compilateur de test (quelques briques) sert de compilateur ; le vrai est essayé
// dès qu'il compile la recette.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS, cardStatus } from '../engine/cards/index.ts';
import * as B from '../engine/cards/bricks.ts';
import { currentBehavior, installBehavior } from '../engine/recipes/bench.ts';
import { compileRecipe } from '../engine/recipes/compile.ts';
import { compareBehaviors, mutateRecipe } from '../engine/recipes/crosscheck.ts';
import { fuzz } from '../engine/recipes/fuzz.ts';
import { formatReport, generateCases, runGeneratedTests } from '../engine/recipes/testgen.ts';
import type { Action, Cond, Filter, Recipe, Step, Target } from '../engine/recipes/types.ts';
import type { CardBehavior } from '../engine/types.ts';

// ---------- Petit compilateur de test (le vrai : tâche C1.1) ----------

function spec(f: Filter): B.CharSpec & { category?: 'CHARACTER' | 'EVENT' } {
  const s: B.CharSpec & { category?: 'CHARACTER' | 'EVENT' } = {};
  if (f.costMax !== undefined) s.costMax = f.costMax;
  if (f.costMin !== undefined) s.costMin = f.costMin;
  if (f.powerMax !== undefined) s.powerMax = f.powerMax;
  if (f.basePowerMax !== undefined) s.basePowerMax = f.basePowerMax;
  if (f.rested !== undefined) s.rested = f.rested;
  if (f.types) s.type = f.types[0];
  if (f.typeIncludes) s.typeIncludes = f.typeIncludes;
  if (f.notName) s.notName = f.notName;
  if (f.color) s.color = f.color[0];
  if (f.category) s.category = f.category[0] as 'CHARACTER';
  return s;
}
const targets = (t: Target): B.Targets => (t.leader && !t.characters ? (t.side === 'opp' ? B.oppLeader() : B.ownLeader()) : t.side === 'opp' ? B.oppChar(spec(t.filter)) : B.ownChar(spec(t.filter)));
const n = (t: Target) => (t.count === 'all' ? 5 : t.count);
function cond(c: Cond): B.Condition {
  switch (c.kind) {
    case 'life': return c.side === 'own' ? (c.cmp === 'le' ? B.lifeAtMost(c.n) : B.lifeAtLeast(c.n)) : c.cmp === 'le' ? B.oppLifeAtMost(c.n) : B.oppLifeAtLeast(c.n);
    case 'hand': return c.cmp === 'le' ? B.handAtMost(c.n) : B.handAtLeast(c.n);
    default: throw new Error(`condition ${c.kind}`);
  }
}
function action(a: Action, src: string): B.Effect {
  switch (a.kind) {
    case 'ko': return B.ko(targets(a.target), src, n(a.target));
    case 'rest': return B.rest(targets(a.target), src, n(a.target));
    case 'power': return a.target.leader && !a.target.characters && a.target.side === 'own'
      ? B.leaderPower(a.amount, a.until as 'turn', src) : B.powerMod(targets(a.target), a.amount, a.until as 'turn', src, n(a.target));
    case 'draw': return B.drawCards(a.n);
    case 'addDon': return B.addDon(a.n, a.state);
    case 'search': return B.searchTop(a.look, a.take, spec(a.filter), src, a.rest as 'bottom');
    default: throw new Error(`action ${a.kind}`);
  }
}
function steps(list: Step[], src: string): B.Effect {
  const parts = list.map((st) => {
    if (!('action' in st)) throw new Error('étape');
    const e = action(st.action, src);
    return st.cond ? B.when(cond(st.cond), e) : e;
  });
  return parts.length === 1 ? parts[0] : B.seq(...parts);
}
function testCompile(r: Recipe): CardBehavior {
  const src = CARDS[r.num].name;
  const out: B.CardSpec = {};
  for (const ab of r.abilities) {
    let e = steps(ab.steps, src);
    if (ab.cost) e = B.withCost(B.restDon((ab.cost[0] as { n: number }).n), e, src);
    if (ab.condition) e = B.when(cond(ab.condition), e);
    if (ab.timing === 'onPlay') out.onPlay = e;
    else if (ab.timing === 'main') out.onMain = e;
    else throw new Error(`moment ${ab.timing}`);
  }
  return B.card(out);
}

// ---------- Recettes types (cartes déjà codées à la main : la recette dit ce que le code fait) ----------

const opp = (count: number, filter: Filter): Target => ({ side: 'opp', zone: 'field', characters: true, count, upTo: true, filter });
const step = (action: Action, c?: Cond): Step => (c ? { action, cond: c } : { action });
const R: Record<string, Recipe> = {
  // [Jouée] piocher 2
  'OP13-041': { num: 'OP13-041', abilities: [{ timing: 'onPlay', steps: [step({ kind: 'draw', n: 2 })] }] },
  // [Principale] piocher 2
  'OP03-056': { num: 'OP03-056', abilities: [{ timing: 'main', steps: [step({ kind: 'draw', n: 2 })] }] },
  // [Jouée] KO jusqu'à 1 Personnage adverse épuisé de coût 4 ou moins
  'OP03-029': { num: 'OP03-029', abilities: [{ timing: 'onPlay', steps: [step({ kind: 'ko', target: opp(1, { rested: true, costMax: 4 }) })] }] },
  // [Jouée] épuiser jusqu'à 1 Personnage adverse de coût 2 ou moins
  'EB01-015': { num: 'EB01-015', abilities: [{ timing: 'onPlay', steps: [step({ kind: 'rest', target: opp(1, { costMax: 2 }) })] }] },
  // [Jouée] KO jusqu'à 2 Personnages adverses de puissance de base 2000 ou moins
  'OP17-016': { num: 'OP17-016', abilities: [{ timing: 'onPlay', steps: [step({ kind: 'ko', target: opp(2, { basePowerMax: 2000 }) })] }] },
  // [Jouée] ajouter 1 DON!! épuisée
  'OP17-074': { num: 'OP17-074', abilities: [{ timing: 'onPlay', steps: [step({ kind: 'addDon', n: 1, upTo: true, state: 'rested' })] }] },
};

const SYNTHETIC: Recipe = {
  // une carte quelconque (son code à la main est remplacé le temps du test) : si Vie ≤ 2, piocher 1 ; puis +1000 à 1
  // Personnage adverse de coût 3 ou moins pour le tour
  num: 'OP13-041',
  abilities: [{
    timing: 'onPlay',
    steps: [
      step({ kind: 'draw', n: 1 }, { kind: 'life', side: 'own', cmp: 'le', n: 2 }),
      step({ kind: 'power', target: opp(1, { costMax: 3 }), amount: -2000, until: 'turn' }),
    ],
  }],
};

function failing(r: Recipe, b: CardBehavior) {
  return runGeneratedTests(r, b).cases.filter((c) => c.status === 'fail');
}

// ---------- Tests générés ----------

test('tests générés : cas produits d’après la recette (effet, condition fausse, cible absente, jusqu’à 0)', () => {
  const labels = generateCases(SYNTHETIC).cases.map((c) => c.label);
  assert.ok(labels.includes('effet'));
  assert.ok(labels.some((l) => l.startsWith('condition 1 (life) fausse')));
  assert.ok(labels.some((l) => l.startsWith('cible absente')));
  assert.ok(labels.some((l) => l.startsWith('« jusqu’à »')));
});

test('tests générés : recettes types compilées, tous les cas passent', () => {
  for (const r of [...Object.values(R), SYNTHETIC]) {
    const rep = runGeneratedTests(r, testCompile(r));
    assert.ok(rep.ok, formatReport(rep));
    assert.ok(rep.cases.filter((c) => c.status === 'ok').length >= 1, formatReport(rep));
  }
});

test('tests générés : le code à la main jugé d’après sa recette', () => {
  for (const r of Object.values(R)) {
    const rep = runGeneratedTests(r, currentBehavior(r.num));
    assert.ok(rep.ok, formatReport(rep));
  }
});

test('tests générés : une erreur glissée dans le comportement est trouvée (nombre, borne, condition, cible)', () => {
  const wrong = (r: Recipe, edit: (x: Recipe) => void) => { const x = structuredClone(r); edit(x); return testCompile(x); };
  const at = (r: Recipe) => (r.abilities[0].steps[0] as { action: Action }).action;
  // un nombre faux
  assert.ok(failing(R['OP13-041'], wrong(R['OP13-041'], (x) => { (at(x) as { n: number }).n = 3; })).length);
  // une borne décalée d'un (coût 3 au lieu de 4 : la cible tout juste n'est plus visée ; 5 : le leurre l'est)
  for (const v of [3, 5]) assert.ok(failing(R['OP03-029'], wrong(R['OP03-029'], (x) => { (at(x) as { target: Target }).target.filter.costMax = v; })).length, `coût ${v}`);
  // l'état épuisé oublié : le leurre redressé est visé
  assert.ok(failing(R['OP03-029'], wrong(R['OP03-029'], (x) => { delete (at(x) as { target: Target }).target.filter.rested; })).length);
  // nombre de cibles
  assert.ok(failing(R['OP17-016'], wrong(R['OP17-016'], (x) => { (at(x) as { target: Target }).target.count = 1; })).length);
  // condition à la limite (Vie ≤ 3 au lieu de ≤ 2), montant et durée
  const syn = (edit: (x: Recipe) => void) => failing(SYNTHETIC, wrong(SYNTHETIC, edit)).length;
  assert.ok(syn((x) => { (x.abilities[0].steps[0].cond as { n: number }).n = 3; }));
  assert.ok(syn((x) => { (x.abilities[0].steps[1] as { action: { amount: number } }).action.amount = -1000; }));
  assert.ok(syn((x) => { (x.abilities[0].steps[1] as { action: { until: string } }).action.until = 'oppNextEnd'; }));
  // la condition oubliée
  assert.ok(syn((x) => { delete x.abilities[0].steps[0].cond; }));
});

test('tests générés : le vrai compilateur (C1.1), dès qu’il compile ces recettes', (t) => {
  let tried = 0;
  for (const r of [...Object.values(R), SYNTHETIC]) {
    const c = compileRecipe(r);
    if (!c.ok) continue;
    tried++;
    const rep = runGeneratedTests(r, c.behavior);
    assert.ok(rep.ok, formatReport(rep));
  }
  if (!tried) t.diagnostic('compilateur pas encore écrit (tâche C1.1) : seul le compilateur de test est essayé');
});

// ---------- Comparaison « code à la main ↔ recette compilée » ----------

test('comparaison : recette juste identique au code à la main, recette faussée d’un nombre différente', () => {
  for (const r of Object.values(R)) {
    const same = compareBehaviors(r.num, currentBehavior(r.num), testCompile(r), { situations: 12, timings: [r.abilities[0].timing] });
    assert.equal(same.differ.length, 0, `${r.num} : ${same.differ.join(' ; ')}`);
    assert.ok(same.compared > 0, `${r.num} : jamais jouée`);
  }
  // contrôle de sensibilité : chaque nombre décalé ; au moins les cartes à cible ou à pioche le voient
  let seen = 0;
  for (const r of Object.values(R)) {
    const res = compareBehaviors(r.num, currentBehavior(r.num), testCompile(mutateRecipe(r)), { situations: 12, timings: [r.abilities[0].timing] });
    if (res.differ.length) seen++;
  }
  assert.ok(seen >= 5, `seulement ${seen} recettes faussées vues`);
});

// ---------- Parties au hasard ----------

test('parties au hasard : version courte, aucune erreur ni incohérence', () => {
  const rep = fuzz({ games: 3, seed: 11 });
  assert.equal(rep.games, 3);
  assert.deepEqual(rep.failures.map((f) => f.message), []);
  assert.ok(Object.values(rep.cards).some((c) => c.triggered > 0), 'aucun effet déclenché');
});

test('parties au hasard : un effet qui casse la partie est trouvé et attribué à sa carte', () => {
  const num = 'OP13-041';
  assert.equal(cardStatus(num), 'coded');
  // effet faux : une carte de la main disparaît (incohérence) à chaque [Jouée]
  const restore = installBehavior(num, { ...currentBehavior(num), onPlay: (ctx) => { ctx.s.players[ctx.me].hand.pop(); } });
  try {
    const rep = fuzz({ games: 6, seed: 5, force: [num] });
    assert.ok(rep.failures.length > 0, 'erreur non vue');
    assert.ok(rep.cards[num]?.errors > 0, `erreur non attribuée : ${rep.failures.map((f) => `${f.message} [${f.suspects.join(',')}]`).join(' ; ')}`);
  } finally {
    restore();
  }
});
