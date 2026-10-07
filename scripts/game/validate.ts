// Validation en masse : parties IA contre IA sur toutes les confrontations, avec contrôle de cohérence à chaque
// décision, et rapport d'utilisation de chaque effet de carte (déclenché, utile, jamais vu...).
//   node --no-warnings scripts/game/validate.ts [parties par confrontation] [fichier du rapport]
import '../../game/data/load-local.ts';
import fs from 'node:fs';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { CARDS } from '../../game/engine/cards/index.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { newGame } from '../../game/engine/engine.ts';
import { invariantErrors } from '../../game/engine/invariants.ts';
import { def, findField } from '../../game/engine/rules.ts';
import type { CardDef, GameState } from '../../game/engine/types.ts';

const games = Number(process.argv[2] ?? 100);
const reportFile = process.argv[3] ?? 'game/docs/validation.md';

// ---------- Compteurs d'utilisation des effets ----------

interface Use { calls: number; effective: number }
const uses = new Map<string, Use>(); // clé : numéro|capacité
const bump = (num: string, what: string, effective: boolean) => {
  const key = `${num}|${what}`;
  const u = uses.get(key) ?? { calls: 0, effective: 0 };
  u.calls++;
  if (effective) u.effective++;
  uses.set(key, u);
};

// Chaque effet codé est enveloppé : il compte comme « utile » s'il a écrit quelque chose dans le journal
type Fn = (...args: unknown[]) => unknown;
const stateOf = (arg: unknown): GameState => ((arg as { s?: GameState }).s ?? arg) as GameState;
function wrap(num: string, what: string, fn: Fn): Fn {
  return (...args: unknown[]) => {
    const s = stateOf(args[0]);
    const before = s.log.length;
    const result = fn(...args);
    bump(num, what, s.log.length > before);
    return result;
  };
}
const HOOKS = ['onPlay', 'whenAttacking', 'onKO', 'endOfTurn', 'onMain', 'onCounter', 'onTrigger'] as const;
for (const [num, d] of Object.entries(CARDS) as [string, CardDef & Record<string, unknown>][]) {
  for (const h of HOOKS) if (typeof d[h] === 'function') d[h] = wrap(num, h, d[h] as Fn);
  if (d.when) d.when = d.when.map((w) => ({ ...w, run: wrap(num, 'when', w.run as Fn) as never }));
  if (d.activateMain) d.activateMain = { ...d.activateMain, run: wrap(num, 'activateMain', d.activateMain.run as Fn) as never };
  if (d.onOpponentAttack) d.onOpponentAttack = { ...d.onOpponentAttack, run: wrap(num, 'onOpponentAttack', d.onOpponentAttack.run as Fn) as never };
  if (d.replaceRemoval) d.replaceRemoval = { ...d.replaceRemoval, apply: wrap(num, 'replaceRemoval', d.replaceRemoval.apply as Fn) as never };
}

// ---------- Décisions proposées / prises ----------

const offers = new Map<string, Use>(); // clé : numéro|action ; calls = proposée, effective = choisie
const offer = (num: string, what: string, chosen: boolean) => {
  const key = `${num}|${what}`;
  const u = offers.get(key) ?? { calls: 0, effective: 0 };
  u.calls++;
  if (chosen) u.effective++;
  offers.set(key, u);
};

const errors: string[] = [];
const broken = new Set<string>();
const ids = Object.keys(DECKS);
const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
const played: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
let decisions = 0;
const t0 = Date.now();

for (const a of ids) {
  for (const b of ids) {
    for (let g = 0; g < games; g++) {
      const seed = 7000 + g * 7919 + ids.indexOf(a) * 131 + ids.indexOf(b) * 17;
      const where = `${a} contre ${b}, graine ${seed}`;
      try {
        const s = newGame({ decks: [a, b], names: [a, b], seed, first: g % 2 === 0 ? 0 : 1 }, (st, d) => {
          decisions++;
          if (!d.inEffect) {
            for (const e of invariantErrors(st)) {
              if (!broken.has(e)) errors.push(`${where}, tour ${st.turn} : ${e}`);
              broken.add(e);
            }
          }
          const choice = heuristicChooser(st, d);
          for (const o of d.options) {
            const [kind] = o.id.split(':');
            const card = o.uid !== undefined ? findField(st, o.uid)?.card ?? st.players[d.player].hand.find((c) => c.uid === o.uid) : undefined;
            if (!card) continue;
            if (kind === 'play' || kind === 'event' || kind === 'act' || kind === 'block' || kind === 'counter' || kind === 'cevent') offer(card.num, kind, o.id === choice);
            if (kind === 'attack') {
              const f = findField(st, o.uid!)!;
              if (f.card.playedTurn === st.turn && !f.leader) offer(card.num, 'attaque [Initiative]', o.id === choice);
            }
          }
          if (d.tag === 'trigger') offer(d.options.find((o) => o.id === 'trigger')!.num!, 'trigger', choice === 'trigger');
          return choice;
        });
        for (const e of invariantErrors(s)) if (!broken.has(e)) { errors.push(`${where}, fin de partie : ${e}`); broken.add(e); }
        played[a]++;
        played[b]++;
        wins[s.winner === 0 ? a : b]++;
      } catch (err) {
        errors.push(`${where} : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

// ---------- Rapport ----------

const WHAT: Record<string, string> = {
  onPlay: '[Jouée]', whenAttacking: '[En attaquant]', onKO: '[En cas de KO]', endOfTurn: '[Fin de votre tour]',
  onMain: '[Principale]', onCounter: '[Contre] (Événement)', onTrigger: '[Déclenchement]',
  activateMain: '[Activation : Principale]', when: 'effet « Quand ... »', onOpponentAttack: '[Attaque adverse]', replaceRemoval: 'remplacement',
  play: 'jouée', event: 'activée', act: 'effet activé', block: 'bloque', counter: 'Contre (carte)', cevent: 'Contre (Événement)',
  trigger: '[Déclenchement] choisi', 'attaque [Initiative]': 'attaque le tour où elle est jouée',
};
const lines: string[] = [];
const total = ids.length * ids.length * games;
lines.push('# Validation des decks', '');
lines.push(`${total} parties IA contre IA (${games} par confrontation), ${decisions} décisions, ${Math.round((Date.now() - t0) / 1000)} s.`);
lines.push(`Contrôles de cohérence à chaque décision : ${errors.length ? `**${errors.length} problème(s)**` : 'aucun problème'}.`, '');
if (errors.length) {
  lines.push('## Problèmes', '');
  for (const e of errors.slice(0, 60)) lines.push(`- ${e}`);
  lines.push('');
}
lines.push('## Victoires (IA simple contre IA simple)', '');
for (const id of ids) lines.push(`- ${id} ${DECKS[id].name} : ${Math.round((wins[id] / Math.max(1, played[id])) * 100)} %`);
lines.push('');
const alerts: string[] = [];
// choix jamais pris, mais c'est voulu (l'IA a une bonne raison)
const EXPECTED: Record<string, string> = {
  'OP12-057|trigger': 'prendre Ice Block en main (Contre +4000) vaut mieux que son [Déclenchement]',
  'OP12-057|onTrigger': 'idem',
  'OP11-079|trigger': 'prendre la carte en main (Contre +5000) vaut mieux que piocher 1 carte',
  'OP11-079|onTrigger': 'idem',
  'OP10-103|play': 'Capone Bege (0 de puissance) sert de Contre +2000',
};
const expected: string[] = [];
const alert = (num: string, what: string, text: string) => {
  const why = EXPECTED[`${num}|${what}`];
  if (why) expected.push(`${text} — voulu : ${why}`);
  else alerts.push(text);
};
for (const id of ids) {
  const deck = DECKS[id];
  lines.push(`## ${id} ${deck.name}`, '', '| Carte | Effet | Déclenché | Utile | Choix proposé → pris |', '|---|---|---|---|---|');
  for (const num of [deck.leader, ...Object.keys(deck.cards)]) {
    const d = def(num);
    const rows: string[] = [];
    for (const [key, u] of uses) {
      if (!key.startsWith(`${num}|`)) continue;
      const what = key.split('|')[1];
      rows.push(`| ${d.name} (${num}) | ${WHAT[what] ?? what} | ${u.calls} | ${u.effective} | |`);
      if (u.effective === 0) alert(num, what, `${id} ${d.name} (${num}) : effet ${WHAT[what] ?? what} jamais utile (${u.calls} déclenchement(s))`);
    }
    for (const [key, u] of offers) {
      if (!key.startsWith(`${num}|`)) continue;
      const what = key.split('|')[1];
      rows.push(`| ${d.name} (${num}) | ${WHAT[what] ?? what} | | | ${u.calls} → ${u.effective} (${Math.round((u.effective / u.calls) * 100)} %) |`);
      if (u.effective === 0 && what !== 'counter') alert(num, what, `${id} ${d.name} (${num}) : « ${WHAT[what] ?? what} » proposé ${u.calls} fois, jamais choisi`);
    }
    // effets codés jamais déclenchés
    for (const h of [...HOOKS, 'activateMain', 'onOpponentAttack', 'replaceRemoval', 'when']) {
      if ((d as unknown as Record<string, unknown>)[h] && !uses.has(`${num}|${h}`)) {
        rows.push(`| ${d.name} (${num}) | ${WHAT[h] ?? h} | 0 | 0 | |`);
        alert(num, h, `${id} ${d.name} (${num}) : effet ${WHAT[h] ?? h} jamais déclenché`);
      }
    }
    if (!rows.length) rows.push(`| ${d.name} (${num}) | ${d.effect === '-' ? 'aucun effet' : 'effet permanent'} | | | |`);
    lines.push(...rows);
  }
  lines.push('');
}
lines.splice(lines.indexOf('## Victoires (IA simple contre IA simple)'), 0, '## À examiner', '', ...(alerts.length ? alerts.map((a) => `- ${a}`) : ['- rien']), '', '## Jamais choisis, mais voulu', '', ...expected.map((a) => `- ${a}`), '');
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(reportFile, `${lines.join('\n')}\n`);
console.log(`${total} parties, ${errors.length} problème(s) de cohérence, ${alerts.length} point(s) à examiner (${expected.length} voulu(s)) → ${reportFile}`);
for (const e of errors.slice(0, 15)) console.log('  !', e);
for (const a of alerts) console.log('  ?', a);
