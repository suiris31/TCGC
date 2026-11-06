// Outils des tests d'EB03 et EB04 (tâche S4) : ces cartes ne sont dans aucun deck du registre, les tests construisent
// des listes (Leader et cartes du set à 4 exemplaires, complétées par un deck existant) et partent de la même situation
// que scenario() de helpers.ts (tour 5, phase principale)
import assert from 'node:assert/strict';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS, type DeckList } from '../engine/decks.ts';
import { act, advance, newGame } from '../engine/engine.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { attack, choose } from './helpers.ts';

let n = 0;
// Une liste de 50 cartes : celles données (4 de chaque), puis des cartes de `filler` jusqu'à 50
export function list(leader: string, nums: string[], filler = 'ST-36'): DeckList {
  const cards: Record<string, number> = {};
  for (const num of nums) cards[num] = 4;
  let total = nums.length * 4;
  for (const [num, k] of Object.entries(DECKS[filler].cards)) {
    if (total >= 50) break;
    if (cards[num] || num === leader) continue;
    const take = Math.min(k, 50 - total);
    cards[num] = take;
    total += take;
  }
  return { id: `PERSO-s4-${n++}`, name: 'Essai S4', series: 'PERSO', leader, cards };
}

export function scene(decks: [DeckList | string, DeckList | string], setup: (s: GameState) => void, active: PlayerId = 0): GameState {
  const s = act(act(newGame({ decks, names: ['Moi', 'IA'], seed: 13, first: 0 }), 'keep'), 'keep');
  s.players[0].turns = 3;
  s.players[1].turns = 3;
  s.turn = 5;
  s.active = active;
  s.decision = null;
  s.flow = { stage: 'main' };
  setup(s);
  return advance(s);
}

export const leaderUid = (s: GameState, p: PlayerId) => s.players[p].leader.uid;
export const charUid = (s: GameState, p: PlayerId, num: string) => {
  const c = s.players[p].chars.find((x) => x.num === num);
  assert.ok(c, `${num} absent du terrain du joueur ${p}`);
  return c.uid;
};

// L'adversaire (joueur 1, actif) attaque mon Leader avec le sien ; je joue l'Événement [Contre] `event` : puissance gagnée
// pour le combat par mes cartes (lue au journal : le combat peut finir aussitôt)
export function counterGain(s0: GameState, event: string, answer?: (s: GameState) => GameState): { s: GameState; gain: number } {
  let s = attack(s0, leaderUid(s0, 1), leaderUid(s0, 0));
  while (s.decision?.kind === 'blocker') s = choose(s, 'noblock');
  assert.equal(s.decision?.kind, 'counter', `décision attendue : counter, obtenue ${s.decision?.kind} (${s.decision?.prompt})`);
  const from = s.log.length;
  const opt = s.decision!.options.find((o) => o.id.startsWith('cevent:') && s.players[0].hand.some((c) => c.uid === o.uid && c.num === event));
  assert.ok(opt, `${event} absent des [Contre] proposés`);
  s = act(s, opt.id);
  if (answer) s = answer(s);
  // le combat peut se terminer aussitôt (plus de [Contre] possible) : gains « pour le combat » notés au journal
  const gain = s.log.slice(from).reduce((sum, l) => sum + [...l.text.matchAll(/gagne \+(\d+) de puissance pour le combat/g)].reduce((t, m) => t + Number(m[1]), 0), 0);
  return { s, gain };
}

// Un Leader du catalogue portant ce nom (Sanji, Perona, Boa Hancock...)
export function leaderNamed(name: string): string {
  const num = Object.keys(CARDS).sort().find((n) => CARDS[n].category === 'LEADER' && CARDS[n].names.includes(name));
  assert.ok(num, `pas de Leader ${name}`);
  return num;
}

// DON!! données au Leader adverse (prises dans son deck DON!!)
export function oppLeaderDon(s: GameState, k: number) {
  s.players[1].leader.don += k;
  s.players[1].donDeck -= k;
}

// Un Leader du catalogue dont un type est (ou contient, avec includes) celui donné
export function leaderTyped(type: string, includes = false): string {
  const num = Object.keys(CARDS).sort().find((n) => CARDS[n].category === 'LEADER' && CARDS[n].types.some((t) => (includes ? t.includes(type) : t === type)));
  assert.ok(num, `pas de Leader ${type}`);
  return num;
}
