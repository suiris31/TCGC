// Validation de masse des cartes d'une étape du plan « Aventure » (tâche 1.20) : chaque effet des cartes de l'étape
// (OP03, ST-01, cartes des decks de l'aventure) est-il déclenché au moins une fois, et utile ? Parties de l'IA simple,
// contrôle de cohérence à chaque décision, sur trois sortes de decks :
//   - les decks de l'aventure (ADVENTURE_DECKS) et ST-01 contre eux et contre le registre ;
//   - pour chaque Leader jouable, des decks tirés au hasard parmi les cartes de l'étape à ses couleurs (complétés par
//     d'autres cartes jouables s'il en manque) : synergies de l'étape entre elles, et cartes hors de leur deck ;
//   - les mêmes avec --hasard : choix des effets (et 30 % des autres) tirés au hasard, réponse de l'IA vérifiée.
// Le rapport donne, carte par carte, chaque effet codé : déclenché, utile (a écrit dans le journal ; pour un effet
// permanent : a changé quelque chose), et les choix proposés et pris.
//   node --no-warnings scripts/game/validate-stage.ts [decks par Leader] [parties par deck] [options]
//     --graines 1,2,3      graines des tirages (une passe par graine ; défaut 1)
//     --modes ia,hasard    passes sans et avec choix au hasard (défaut : les deux)
//     --aventure N         parties par confrontation des decks de l'aventure (défaut 20)
//     --rapport fichier    rapport Markdown (défaut : rien d'écrit, résumé seulement)
//     --avec L:c,c;L:c     cartes hors de l'étape mises à 4 exemplaires dans les decks tirés du Leader L (effet qui
//                          demande une carte d'ailleurs : OP11-001:OP11-017, Kobby et un Personnage {SWORD})
//     --leaders L,L        seulement ces Leaders pour les decks tirés
import '../../game/data/load-local.ts';
import fs from 'node:fs';
import { ADVENTURE_DECKS } from '../../game/adventure/decks.ts';
import { heuristicChooser } from '../../game/ai/heuristic.ts';
import { AVENTURE_A } from '../../game/engine/cards/aventure-a.ts';
import { AVENTURE_B } from '../../game/engine/cards/aventure-b.ts';
import { CARDS, cardStatus, HIDDEN } from '../../game/engine/cards/index.ts';
import { DECK_SIZE, MAX_COPIES, playableErrors } from '../../game/engine/deckRules.ts';
import { CUSTOM_SERIES, DECKS, type DeckList } from '../../game/engine/decks.ts';
import { newGame } from '../../game/engine/engine.ts';
import { invariantErrors } from '../../game/engine/invariants.ts';
import { findField } from '../../game/engine/rules.ts';
import type { CardDef, Decision, GameState } from '../../game/engine/types.ts';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const perLeader = Number(positional[0] ?? 4);
const games = Number(positional[1] ?? 6);
const seeds = (opt('--graines') ?? '1').split(',').map(Number);
const modes = (opt('--modes') ?? 'ia,hasard').split(',');
const adventureGames = Number(opt('--aventure') ?? 20);
const reportFile = opt('--rapport');
const extras = new Map((opt('--avec') ?? '').split(';').filter(Boolean).map((x) => {
  const [leader, list] = x.split(':');
  return [leader, list.split(',')] as [string, string[]];
}));

// ---------- Cartes de l'étape ----------

const playable = Object.keys(CARDS).filter((n) => n !== HIDDEN && cardStatus(n) !== 'todo');
const adventureDecks = [...Object.values(ADVENTURE_DECKS), DECKS['ST-01']].filter(Boolean);
const stage = new Set<string>([
  ...Object.keys(CARDS).filter((n) => /^(OP03|ST01)-/.test(n)),
  ...Object.keys(AVENTURE_A), ...Object.keys(AVENTURE_B),
  ...adventureDecks.flatMap((d) => [d.leader, ...Object.keys(d.cards)]),
]);
const todo = [...stage].filter((n) => cardStatus(n) === 'todo');
const stageNums = [...stage].filter((n) => cardStatus(n) !== 'todo').sort();

// ---------- Compteurs ----------

interface Use { calls: number; effective: number }
const uses = new Map<string, Use>(); // clé : numéro|capacité
const bump = (map: Map<string, Use>, key: string, effective: boolean) => {
  const u = map.get(key) ?? { calls: 0, effective: 0 };
  u.calls++;
  if (effective) u.effective++;
  map.set(key, u);
};
const offers = new Map<string, Use>(); // clé : numéro|action ; calls = proposée, effective = choisie

type Fn = (...args: unknown[]) => unknown;
const stateOf = (arg: unknown): GameState => ((arg as { s?: GameState }).s ?? arg) as GameState;
// effet qui agit : utile s'il a écrit dans le journal
const wrapAction = (num: string, what: string, fn: Fn): Fn => (...a: unknown[]) => {
  const s = stateOf(a[0]);
  const before = s.log.length;
  const result = fn(...a);
  bump(uses, `${num}|${what}`, s.log.length > before);
  return result;
};
// effet permanent ou condition : compté quand il change quelque chose (vrai, non nul)
const wrapStatic = (num: string, what: string, fn: Fn, neutral: unknown): Fn => (...a: unknown[]) => {
  const result = fn(...a);
  if (result !== neutral && result !== undefined) bump(uses, `${num}|${what}`, true);
  return result;
};

const ACTIONS = ['onPlay', 'whenAttacking', 'onKO', 'endOfTurn', 'onMain', 'onCounter', 'onTrigger'] as const;
const STATICS: Record<string, unknown> = {
  blocker: false, rush: false, rushChar: false, handCost: 0, selfPower: 0, selfCost: 0, handCounter: undefined,
  keywordAura: false, handCounterOverride: null, handCounterAura: 0, koShield: false, cantBeRestedBy: false, taunt: false,
  aura: 0, oppAura: 0, costAura: 0, oppCostAura: 0, cantAttack: false, cantAttackLeader: false, cantBeKO: false,
  cantLeave: false, onKOCondition: false,
};
const REPLACEMENTS = ['koReplace', 'koReplaceAlly', 'restReplace', 'replaceRemoval'] as const;
const expectedEffects = new Map<string, string[]>(); // numéro -> capacités codées
for (const num of stageNums) {
  const d = CARDS[num] as CardDef & Record<string, unknown>;
  const list: string[] = [];
  for (const h of ACTIONS) if (typeof d[h] === 'function') { d[h] = wrapAction(num, h, d[h] as Fn); list.push(h); }
  for (const [h, neutral] of Object.entries(STATICS)) if (typeof d[h] === 'function') { d[h] = wrapStatic(num, h, d[h] as Fn, neutral); list.push(h); }
  if (d.when) {
    d.when = d.when.map((w, i) => {
      const what = d.when!.length > 1 ? `when${i + 1}` : 'when';
      list.push(what);
      return { ...w, run: wrapAction(num, what, w.run as Fn) as never };
    });
  }
  if (d.activateMain) { d.activateMain = { ...d.activateMain, run: wrapAction(num, 'activateMain', d.activateMain.run as Fn) as never }; list.push('activateMain'); }
  if (d.onOpponentAttack) { d.onOpponentAttack = { ...d.onOpponentAttack, run: wrapAction(num, 'onOpponentAttack', d.onOpponentAttack.run as Fn) as never }; list.push('onOpponentAttack'); }
  for (const r of REPLACEMENTS) {
    const x = d[r] as { apply: Fn } | undefined;
    if (x) { (d as Record<string, unknown>)[r] = { ...x, apply: wrapAction(num, r, x.apply) }; list.push(r); }
  }
  if (d.rules) list.push('rules');
  expectedEffects.set(num, list);
}

// ---------- Parties ----------

let rngState = 0;
const rand = () => {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const fits = (leader: string, n: string) => {
  const L = CARDS[leader];
  const d = CARDS[n];
  return d.category !== 'LEADER' && d.colors.length > 0 && d.colors.every((c) => L.colors.includes(c)) && !L.rules?.deckRestriction?.(d);
};
function randomDeck(leader: string, k: number): DeckList {
  let pool = stageNums.filter((n) => fits(leader, n));
  if (pool.length < Math.ceil(DECK_SIZE / MAX_COPIES) + 2) pool = [...pool, ...playable.filter((n) => !stage.has(n) && fits(leader, n))];
  const cards: Record<string, number> = {};
  let total = 0;
  for (const n of extras.get(leader) ?? []) { cards[n] = MAX_COPIES; total += MAX_COPIES; }
  while (total < DECK_SIZE) {
    const n = pool[Math.floor(rand() * pool.length)];
    const add = Math.min(MAX_COPIES - (cards[n] ?? 0), 2 + Math.floor(rand() * 3), DECK_SIZE - total);
    if (add <= 0) continue;
    cards[n] = (cards[n] ?? 0) + add;
    total += add;
  }
  return { id: `PERSO-etape${leader.replace('-', '').toLowerCase()}${k}`, name: `Essai ${CARDS[leader].name} ${k}`, series: CUSTOM_SERIES, leader, cards };
}

const problems: string[] = [];
let total = 0;
let decisions = 0;
const wins = new Map<string, [number, number]>(); // deck de l'aventure -> [victoires, parties]

function play(a: DeckList | string, b: DeckList | string, seed: number, first: 0 | 1, randomChoices: boolean) {
  const name = (d: DeckList | string) => (typeof d === 'string' ? d : d.id);
  const where = `${name(a)} contre ${name(b)} (graine ${seed}, ${randomChoices ? 'hasard' : 'IA'})`;
  try {
    const s = newGame({ decks: [a, b], names: ['A', 'B'], seed, first }, (st: GameState, d: Decision) => {
      decisions++;
      if (!d.inEffect) {
        const bad = invariantErrors(st);
        if (bad.length) throw new Error(bad.join(' ; '));
      }
      const ai = heuristicChooser(st, d);
      if (!d.options.some((o) => o.id === ai)) throw new Error(`réponse de l'IA hors des choix : ${ai} (${d.tag ?? d.kind})`);
      const choice = randomChoices && (d.kind === 'effect' || rand() < 0.3) ? d.options[Math.floor(rand() * d.options.length)].id : ai;
      for (const o of d.options) {
        const [kind] = o.id.split(':');
        if (o.uid === undefined) continue;
        const card = findField(st, o.uid)?.card ?? st.players[d.player].hand.find((c) => c.uid === o.uid);
        if (!card || !stage.has(card.num)) continue;
        if (['play', 'event', 'act', 'block', 'counter', 'cevent'].includes(kind)) bump(offers, `${card.num}|${kind}`, o.id === choice);
        if (kind === 'attack') {
          const f = findField(st, o.uid)!;
          if (f.card.playedTurn === st.turn && !f.leader) bump(offers, `${card.num}|attaque [Initiative]`, o.id === choice);
        }
      }
      if (d.tag === 'trigger') {
        const num = d.options.find((o) => o.id === 'trigger')?.num;
        if (num && stage.has(num)) bump(offers, `${num}|trigger`, choice === 'trigger');
      }
      return choice;
    });
    const end = invariantErrors(s);
    if (end.length) throw new Error(`fin de partie : ${end.join(' ; ')}`);
    total++;
    return s.winner;
  } catch (err) {
    problems.push(`${where} : ${err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' / ') : String(err)}`);
    return undefined;
  }
}

const t0 = Date.now();
const leaders = opt('--leaders')?.split(',') ?? playable.filter((n) => CARDS[n].category === 'LEADER');
const registry = Object.keys(DECKS);
for (const seed of seeds) {
  for (const mode of modes) {
    const randomChoices = mode === 'hasard';
    rngState = seed * 1000003 + (randomChoices ? 7 : 0);
    // 1. decks de l'aventure et ST-01 contre eux et contre le registre
    const opponents: (DeckList | string)[] = [...adventureDecks, ...registry.filter((id) => id !== 'ST-01')];
    for (const deck of adventureDecks) {
      for (const opp of opponents) {
        for (let g = 0; g < adventureGames; g++) {
          const first = (g % 2) as 0 | 1;
          const winner = play(deck, opp, Math.floor(rand() * 2 ** 31), first, randomChoices);
          if (!randomChoices && winner !== undefined) {
            const w = wins.get(deck.id) ?? [0, 0];
            wins.set(deck.id, [w[0] + (winner === 0 ? 1 : 0), w[1] + 1]);
          }
        }
      }
    }
    // 2. decks tirés parmi les cartes de l'étape, pour chaque Leader jouable
    for (const leader of leaders) {
      for (let k = 0; k < perLeader; k++) {
        const deck = randomDeck(leader, k);
        const errors = playableErrors(deck.leader, deck.cards);
        if (errors.length) { problems.push(`${deck.name} : ${errors.join(' ; ')}`); continue; }
        for (let g = 0; g < games; g++) {
          const opp = rand() < 0.5 ? adventureDecks[Math.floor(rand() * adventureDecks.length)] : registry[Math.floor(rand() * registry.length)];
          const seedGame = Math.floor(rand() * 2 ** 31);
          if (g % 2) play(opp, deck, seedGame, 1, randomChoices);
          else play(deck, opp, seedGame, 0, randomChoices);
        }
      }
    }
    console.log(`graine ${seed}, ${mode} : ${total} parties en tout, ${problems.length} problème(s), ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}

// ---------- Rapport ----------

const WHAT: Record<string, string> = {
  onPlay: '[Jouée]', whenAttacking: '[En attaquant]', onKO: '[En cas de KO]', endOfTurn: '[Fin de votre tour]',
  onMain: '[Principale]', onCounter: '[Contre] (Événement)', onTrigger: '[Déclenchement] (codé)',
  activateMain: '[Activation : Principale]', when: 'effet « Quand ... »', onOpponentAttack: '[Attaque adverse]',
  koReplace: 'remplacement du KO', koReplaceAlly: 'remplacement du KO d’un allié', restReplace: 'remplacement de l’épuisement',
  replaceRemoval: 'remplacement d’une sortie', rules: 'règle du Leader (permanente)',
  blocker: '[Bloqueur] sous condition', rush: '[Initiative] sous condition', rushChar: '[Initiative : Personnage] sous condition',
  handCost: 'coût en main modifié', selfPower: 'puissance modifiée', selfCost: 'coût modifié', handCounter: 'Contre en main modifié',
  keywordAura: 'mot-clé donné', handCounterOverride: 'Contre de la main remplacé', handCounterAura: 'Contre donné à la main',
  koShield: 'protection contre le KO donnée', cantBeRestedBy: 'ne peut pas être épuisé', taunt: 'attaques imposées',
  aura: 'puissance donnée', oppAura: 'puissance adverse modifiée', costAura: 'coût donné', oppCostAura: 'coût adverse modifié',
  cantAttack: 'ne peut pas attaquer', cantAttackLeader: 'ne peut pas attaquer de Leader', cantBeKO: 'ne peut pas être mis KO',
  cantLeave: 'ne peut pas quitter le terrain', onKOCondition: 'condition du [En cas de KO] vraie',
  play: 'jouée', event: 'activée', act: 'effet activé proposé', block: 'bloque', counter: 'Contre (carte)', cevent: 'Contre (Événement)',
  trigger: '[Déclenchement] proposé', 'attaque [Initiative]': 'attaque le tour où elle est jouée',
};
const label = (what: string) => WHAT[what] ?? (what.startsWith('when') ? `effet « Quand ... » n° ${what.slice(4)}` : what);
const never: string[] = [];
const useless: string[] = [];
const rows: string[] = [];
for (const num of stageNums) {
  const d = CARDS[num];
  const cells: string[] = [];
  for (const what of expectedEffects.get(num)!) {
    if (what === 'rules') { cells.push(label(what)); continue; }
    const u = uses.get(`${num}|${what}`);
    if (!u) { never.push(`${num} ${d.name} : ${label(what)}`); cells.push(`**${label(what)} : jamais**`); continue; }
    if (u.effective === 0 && !(what in STATICS)) useless.push(`${num} ${d.name} : ${label(what)} (${u.calls} fois)`);
    cells.push(what in STATICS ? `${label(what)} ${u.calls}` : `${label(what)} ${u.calls} (utile ${u.effective})`);
  }
  const trig = offers.get(`${num}|trigger`);
  if (d.trigger && d.trigger !== '-' && !d.onTrigger) {
    if (!trig?.effective) never.push(`${num} ${d.name} : [Déclenchement] (générique) ${trig ? `proposé ${trig.calls} fois, jamais choisi` : 'jamais proposé'}`);
  }
  const choices = [...offers].filter(([k]) => k.startsWith(`${num}|`)).map(([k, u]) => `${label(k.split('|')[1])} ${u.effective}/${u.calls}`);
  const playedAtAll = [...offers].some(([k, u]) => k.startsWith(`${num}|`) && u.effective > 0 && /\|(play|event|cevent|counter|block)$/.test(k));
  if (d.category !== 'LEADER' && !playedAtAll) never.push(`${num} ${d.name} : jamais jouée (ni Contre, ni blocage)`);
  if (!cells.length) cells.push(d.keywords?.length ? `mots-clés seulement (${d.keywords.join(', ')})` : 'aucun effet codé (effet générique ou vanille)');
  rows.push(`| ${num} | ${d.name} | ${cells.join(' ; ')} | ${choices.join(' ; ') || '—'} |`);
}
const winLines = [...wins].map(([id, [w, n]]) => `- ${id} : ${Math.round((w / n) * 100)} % (${n} parties, IA simple)`);
const secs = Math.round((Date.now() - t0) / 1000);
const summary = [
  `${total} parties (${seeds.length} graine(s) × ${modes.join(' et ')}, ${leaders.length} Leaders × ${perLeader} decks × ${games} parties, decks de l'aventure ${adventureGames} par confrontation), ${decisions} décisions, ${secs} s.`,
  `Cartes de l'étape : ${stage.size} (${stageNums.length} jouables${todo.length ? `, à faire : ${todo.join(' ')}` : ''}).`,
  `Contrôles de cohérence et réponses de l'IA : ${problems.length ? `**${problems.length} problème(s)**` : 'aucun problème'}.`,
];
console.log(summary.join('\n'));
for (const p of problems.slice(0, 20)) console.log('  !', p);
console.log(`${never.length} effet(s) ou carte(s) jamais vus :`);
for (const n of never) console.log('  -', n);
console.log(`${useless.length} effet(s) déclenché(s) mais jamais utile(s) :`);
for (const n of useless) console.log('  ?', n);
if (reportFile) {
  const lines = [
    ...summary, '',
    '### Problèmes', '', ...(problems.length ? problems.slice(0, 60).map((p) => `- ${p}`) : ['- aucun']), '',
    '### Jamais vus', '', ...(never.length ? never.map((n) => `- ${n}`) : ['- rien']), '',
    '### Déclenchés mais jamais utiles (rien écrit dans le journal)', '', ...(useless.length ? useless.map((n) => `- ${n}`) : ['- rien']), '',
    '### Victoires des decks de l’aventure (passes sans hasard)', '', ...winLines, '',
    '### Carte par carte', '',
    'Effets codés : nombre de déclenchements (utile : a écrit dans le journal ; effet permanent : nombre de fois où il a changé quelque chose). Choix : pris / proposés.', '',
    '| Carte | Nom | Effets codés | Choix |', '|---|---|---|---|', ...rows, '',
  ];
  fs.writeFileSync(reportFile, `${lines.join('\n')}\n`);
  console.log(`rapport → ${reportFile}`);
}
if (problems.length) process.exitCode = 1;
