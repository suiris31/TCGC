// Décisions non bloquantes (tâche R2.6) : après un contre suffisant, les cartes de Contre ne sont plus entourées et la
// barre propose « Ne plus contrer » ; la barre d'action dit toujours qui doit faire quoi ; les états de l'atelier des
// fenêtres de décision (Déclenchement, choix, coût) existent
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from '../engine/engine.ts';
import { power } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { boardState } from '../ui/atelier/plateau/etats.ts';
import { attackRepelled, readDecision } from '../ui/decision.ts';
import { barButton, barText, type BarInput } from '../ui/table/barText.ts';
import { boardLooks, hasUsefulAction } from '../ui/table/looks.ts';

const looksOf = (s: GameState, aids = true) => {
  const view = readDecision(s, s.decision!, aids);
  return { view, looks: boardLooks({ state: s, seat: 0, view, targeting: null, aimed: null, menu: null, dragging: false, recommended: null }) };
};
const bar = (s: GameState, extra: Partial<BarInput> = {}) => barText({
  state: s, decision: s.decision, human: 0, opponent: 'L’IA', thinking: false, touch: false,
  hasCardActions: s.decision?.player === 0 ? hasUsefulAction(readDecision(s, s.decision, true)) : false, ...extra,
});

// Contre l'attaque de l'état « contre » avec les cartes de la main, la plus forte d'abord, jusqu'à la repousser
function counterUntilRepelled(s: GameState): GameState {
  for (let i = 0; i < 10 && s.decision?.kind === 'counter' && !attackRepelled(s); i++) {
    const options = s.decision.options.filter((o) => o.id.startsWith('counter:'));
    assert.ok(options.length, 'plus de carte de Contre avant de repousser l’attaque');
    s = act(s, options[0].id);
  }
  return s;
}

test('décisions : après un contre suffisant, les cartes de Contre ne sont plus entourées, « Ne plus contrer »', () => {
  const { state: start } = boardState('contre');
  assert.equal(start.decision?.kind, 'counter');
  assert.equal(attackRepelled(start), false);
  const before = looksOf(start);
  assert.ok([...before.looks.values()].some((l) => l.actionable), 'avant : des cartes de Contre entourées');
  const pass = start.decision!.options.find((o) => o.id === 'pass')!;
  assert.deepEqual(barButton(start, start.decision!, pass), { label: 'Laisser passer l’attaque', primary: false });
  assert.match(bar(start).title, /^À toi de défendre : contrer/);
  assert.match(bar(start).help, /entourée d’or pour contrer, ou laisse passer/);

  const s = counterUntilRepelled(start);
  assert.equal(s.decision?.kind, 'counter', 'il reste des cartes de Contre en main : la question est reposée');
  const b = s.battle!;
  assert.ok(power(s, b.target) > power(s, b.attacker));
  assert.equal(attackRepelled(s), true);
  for (const aids of [true, false]) {
    const { view, looks } = looksOf(s, aids);
    for (const [uid, actions] of view.byCard) {
      for (const a of actions.filter((x) => x.kind === 'counter')) assert.equal(a.useless, 'l’attaque est déjà repoussée');
      if (actions.every((a) => a.kind === 'counter')) assert.equal(looks.get(uid)?.actionable, false, `aids ${aids} : plus entourée`);
    }
  }
  const after = s.decision!.options.find((o) => o.id === 'pass')!;
  assert.deepEqual(barButton(s, s.decision!, after), { label: 'Ne plus contrer', primary: true });
  assert.match(bar(s).title, /^Attaque repoussée/);
  assert.match(bar(s).help, /Ne plus contrer/);
});

test('décisions : la barre dit qui doit faire quoi', () => {
  // ta phase principale : les cartes entourées d'or (et plus « qui brille »)
  const tour = boardState('tour-1').state;
  assert.equal(bar(tour).title, 'À toi de jouer');
  assert.match(bar(tour).help, /entourée d’or/);
  assert.match(bar(tour, { touch: true }).help, /^Touche une carte entourée d’or/);
  for (const name of ['tour-1', 'charge', 'contre', 'bloqueur', 'declenchement', 'recherche', 'cout', 'mulligan', 'contre-repousse']) {
    const { state: s } = boardState(name);
    const text = bar(s);
    assert.equal(text.mine, true, name);
    assert.match(text.title, /^(À toi|Attaque repoussée)/, `${name} : ${text.title}`);
    assert.doesNotMatch(`${text.title} ${text.help}`, /brille/, name);
  }
  assert.equal(bar(boardState('bloqueur').state).title, 'À toi de défendre : bloquer ?');
  assert.equal(bar(boardState('declenchement').state).title, 'À toi : carte de Vie révélée');
  assert.equal(bar(boardState('cout').state).title, 'À toi : déclare un coût');
  assert.equal(bar(boardState('contre-repousse').state).title, 'Attaque repoussée : tu peux arrêter de contrer');
  const recherche = boardState('recherche').state;
  assert.deepEqual(bar(recherche), { title: 'À toi de choisir', help: recherche.decision!.prompt.replace(/\s*:\s*$/, ''), mine: true }, 'la consigne du moteur en dessous');

  // la décision de l'adversaire : son nom et ce qu'il choisit
  const mull = boardState('mulligan').state;
  assert.equal(bar(mull, { human: 1, opponent: 'Zoro' }).title, 'Zoro choisit sa main de départ…');
  const contre = boardState('contre').state;
  assert.deepEqual(bar(contre, { human: 1 }), { title: 'L’IA choisit de contrer ou non…', help: '', mine: false });
  assert.equal(bar(contre, { human: 1, decision: null, thinking: true }).title, 'L’IA réfléchit…');
});

test('décisions : l’atelier a les états des fenêtres de décision (Déclenchement, choix, coût, mulligan)', () => {
  assert.equal(readDecision(boardState('declenchement').state, boardState('declenchement').state.decision!).special, 'trigger');
  assert.equal(readDecision(boardState('cout').state, boardState('cout').state.decision!).special, 'declareCost');
  assert.equal(readDecision(boardState('mulligan').state, boardState('mulligan').state.decision!).special, 'mulligan');
  const r = boardState('recherche').state;
  const view = readDecision(r, r.decision!);
  assert.equal(view.special, null);
  assert.ok(view.picks.length > 0, 'recherche : des cartes à choisir dans une fenêtre');
  // la déclaration d'un coût se joue jusqu'au bout
  const c = boardState('cout').state;
  const next = act(c, 'cost:3');
  assert.equal(next.decision?.player, 0);
  assert.equal(next.decision?.kind, 'main');
});
