// Contrôleur commun du plateau (tâche R2.1) : ce que montre chaque carte pour des décisions types (phase principale,
// attaque, contre, choix d'un effet, mulligan), le même contre l'IA et en ligne, et les raccourcis clavier
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { counterValue } from '../engine/rules.ts';
import type { GameState } from '../engine/types.ts';
import { boardState } from '../ui/atelier/plateau/etats.ts';
import { readDecision } from '../ui/decision.ts';
import { boardLooks, hasUsefulAction, recommendedCard, type LooksInput } from '../ui/table/looks.ts';
import { gameKey } from '../ui/table/useGameKeys.ts';
import { expectTag, play, scenario, setChars, setDon, setHand } from './helpers.ts';

// Les looks de la décision en cours, vue par le joueur 0 (aids : marques « sans intérêt », comme contre l'IA)
function looksOf(s: GameState, extra: Partial<LooksInput> = {}, aids = true) {
  const view = readDecision(s, s.decision!, aids);
  return { view, looks: boardLooks({ state: s, seat: 0, view, targeting: null, aimed: null, menu: null, dragging: false, recommended: null, ...extra }) };
}
const uidIn = (cards: { uid: number; num: string }[], num: string) => cards.find((c) => c.num === num)!.uid;

test('plateau : phase principale, cartes jouables qui brillent, les autres grisées, menu, conseil, DON!! glissée', () => {
  const s = scenario(['ST-31', 'ST-35'], (g) => {
    setHand(g, 0, ['OP01-016', 'OP11-003']);
    setChars(g, 0, [{ num: 'OP11-009' }]);
    setChars(g, 1, [{ num: 'OP13-005', extra: { rested: true } }]);
    setDon(g, 0, 2);
  });
  const nami = uidIn(s.players[0].hand, 'OP01-016');
  const usopp = uidIn(s.players[0].hand, 'OP11-003');
  const robin = s.players[0].chars[0].uid;
  const { view, looks } = looksOf(s);
  assert.equal(looks.get(nami)?.actionable, true);
  assert.deepEqual(looks.get(usopp), { dim: true }, 'Usopp coûte 5 : grisé');
  assert.equal(looks.get(robin)?.actionable, true);
  assert.equal(looks.get(robin)?.selected, false);
  assert.equal(looks.get(s.players[1].chars[0].uid), undefined, 'les cartes adverses ne brillent pas');
  assert.ok(hasUsefulAction(view));

  // menu ouvert : la carte est sélectionnée
  assert.equal(looksOf(s, { menu: robin }).looks.get(robin)?.selected, true);
  // DON!! glissée : seules les cartes qui peuvent la recevoir l'acceptent
  const dragged = looksOf(s, { dragging: true }).looks;
  assert.equal(dragged.get(robin)?.drop, true);
  assert.equal(dragged.get(nami)?.drop, false);
  // conseil du coach : une attaque désigne l'attaquant, un autre choix la carte qui le porte
  const attackId = view.attacks.get(robin)![0].id;
  assert.equal(recommendedCard(view, attackId), robin);
  const playNami = view.byCard.get(nami)![0].option.id;
  assert.equal(recommendedCard(view, playNami), nami);
  assert.equal(looksOf(s, { recommended: playNami }).looks.get(nami)?.recommended, true);
  assert.equal(recommendedCard(view, 'end'), null);
  assert.equal(recommendedCard(null, playNami), null);
});

test('plateau : attaque, l’attaquant choisi, les cibles en rouge, la cible touchée sélectionnée', () => {
  const { state: s, aim } = boardState('attaque');
  const view = readDecision(s, s.decision!);
  const targets = view.attacks.get(aim!.attacker)!.map((o) => o.target!);
  assert.ok(targets.length >= 2 && targets.includes(aim!.target));
  const recommended = view.attacks.get(aim!.attacker)!.find((o) => o.target === aim!.target)!.id;
  const looks = boardLooks({ state: s, seat: 0, view, targeting: { attacker: aim!.attacker }, aimed: aim!.target, menu: null, dragging: false, recommended });
  assert.deepEqual(looks.get(aim!.attacker), { selected: true });
  for (const t of targets) {
    assert.deepEqual(looks.get(t), { target: true, recommended: t === aim!.target, selected: t === aim!.target });
  }
  // pendant le ciblage, seuls l'attaquant et ses cibles ont un look (ta main n'est pas grisée)
  assert.deepEqual([...looks.keys()].sort(), [aim!.attacker, ...targets].sort());
  // sans cible touchée : aucune n'est sélectionnée
  const free = boardLooks({ state: s, seat: 0, view, targeting: { attacker: aim!.attacker }, aimed: null, menu: null, dragging: false, recommended: null });
  assert.ok(targets.every((t) => free.get(t)?.selected === false && !free.get(t)?.recommended));
});

test('plateau : contre, les cartes de la main qui contrent brillent avec leur valeur', () => {
  const { state: s } = boardState('contre');
  assert.equal(s.decision?.kind, 'counter');
  const { view, looks } = looksOf(s);
  const hand = s.players[0].hand;
  let counters = 0;
  for (const c of hand) {
    const actions = view.byCard.get(c.uid);
    if (!actions) {
      assert.equal(looks.get(c.uid), undefined, 'hors phase principale, rien n’est grisé');
      continue;
    }
    const counter = actions.find((a) => a.kind === 'counter');
    if (counter) {
      counters++;
      assert.equal(looks.get(c.uid)?.badge, `+${counterValue(s, 0, c.num)}`);
    } else if (actions.some((a) => a.kind === 'cevent')) {
      assert.equal(looks.get(c.uid)?.badge, 'Contre');
    }
    assert.equal(looks.get(c.uid)?.actionable, actions.some((a) => !a.useless));
  }
  assert.ok(counters > 0, 'l’état « contre » a des cartes de Contre en main');
});

test('plateau : choix d’un effet, les cartes à choisir sur le terrain en bleu', () => {
  let s = scenario(['ST-01', 'ST-33'], (g) => {
    setHand(g, 0, ['ST01-015']);   // Gum-Gum Jet Pistol : KO d'un Personnage adverse de 6000 ou moins
    setDon(g, 0, 4);
    setChars(g, 1, [{ num: 'OP12-050' }, { num: 'ST33-001' }]);
  });
  s = play(s, 'ST01-015');
  expectTag(s, 'oppKo');
  const [sauro, kobby] = s.players[1].chars.map((c) => c.uid);
  const { view, looks } = looksOf(s);
  assert.deepEqual(looks.get(kobby), { actionable: false, choose: true, recommended: false, selected: false, drop: false, badge: undefined });
  assert.equal(looks.get(sauro), undefined, 'plus de 6000 : pas proposé');
  assert.deepEqual(view.buttons.map((o) => o.id), ['none']);
  assert.equal(hasUsefulAction(view), true);
});

test('plateau : mulligan et tour adverse, aucune carte ne brille (la décision est dans sa fenêtre)', () => {
  const { state: s } = boardState('mulligan');
  const { view, looks } = looksOf(s);
  assert.equal(view.special, 'mulligan');
  assert.equal(looks.size, 0);
  // pas ta décision (tour de l'IA, ou choix envoyé en ligne) : pas de vue, pas de looks
  assert.equal(boardLooks({ state: s, seat: 0, view: null, targeting: null, aimed: null, menu: null, dragging: false, recommended: null }).size, 0);
  assert.equal(hasUsefulAction(null), false);
});

test('plateau : en ligne (sans les aides), les mêmes cartes brillent que contre l’IA', () => {
  for (const name of ['tour-1', 'contre', 'charge', 'attaque']) {
    const { state: s } = boardState(name);
    if (s.decision?.player !== 0) continue;
    const local = looksOf(s).looks;
    const online = looksOf(s, {}, false).looks;
    assert.deepEqual([...online.keys()].sort(), [...local.keys()].sort(), name);
    for (const [uid, look] of online) {
      assert.equal(Boolean(look.choose), Boolean(local.get(uid)?.choose), name);
      assert.equal(look.badge, local.get(uid)?.badge, name);
      assert.equal(Boolean(look.dim), Boolean(local.get(uid)?.dim), name);
    }
  }
});

test('raccourcis : Échap, Entrée (fin du tour), Ctrl+Z, « ? », « P », et les touches gardées par un champ', () => {
  const key = (k: string, more: Record<string, unknown> = {}) => gameKey({ key: k, defaultPrevented: false, target: { tagName: 'BODY' }, ...more });
  assert.equal(key('Escape'), 'escape');
  assert.equal(key('Enter'), 'end-turn');
  assert.equal(key('Enter', { target: { tagName: 'BUTTON' } }), null, 'Entrée appartient au bouton qui a le focus');
  assert.equal(key('Enter', { repeat: true }), null);
  assert.equal(key('z', { ctrlKey: true }), 'undo');
  assert.equal(key('Z', { metaKey: true }), 'undo');
  assert.equal(key('?'), 'help');
  assert.equal(key('p'), 'pause');
  assert.equal(key('P'), 'pause');
  assert.equal(key('p', { ctrlKey: true }), null, 'Ctrl+P reste au navigateur (imprimer)');
  assert.equal(key('a'), null);
  assert.equal(key('Escape', { target: { tagName: 'SELECT' } }), null, 'une liste déroulante garde ses touches');
});
