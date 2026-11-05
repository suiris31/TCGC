// Briques de la famille « puissance » (étape C, tâche C2.2) : ce que les recettes demandent et que bricks.ts ne sait pas
// encore dire exactement. Les briques de bricks.ts restent celles des cas qu'elles savent faire (« jusqu'à N » pour le
// combat, le tour ou jusqu'à la fin du prochain tour adverse : mêmes questions, même jeu) ; celles-ci ajoutent :
// - la durée « jusqu'à la fin de votre prochain tour » (`nextTurn`) ;
// - la cible obligatoire (sans « jusqu'à ») et « tous les ... » pour une modification (puissance, coût, mot-clé,
//   interdit, protection) ;
// - n'importe quelle modification sur la carte elle-même ou sur le Leader du joueur (avec ou sans filtre : « votre
//   Leader {Marine} gagne ... » ne vaut que si le Leader a ce type) ;
// - [Une fois par tour] sans coût sur un effet déclenché ;
// - le coût « donner −N de puissance à votre Leader redressé pour tout le tour ».
//
// Questions : mêmes étiquettes que les briques de bricks.ts (oppPower, ownPower, oppCost, ownCost, oppLock, ownGrant :
// l'IA les connaît déjà). Une cible obligatoire est choisie sans « Aucune », et sans question si le choix est imposé.
import { addMod, chooseUpToN, def, describe, findField, log, untilOpponentsNextEnd } from '../rules.ts';
import type { EffectCtx, GameState, Modifier, PlayerId } from '../types.ts';
import { candidates, effect, matches, untilMyNextEnd, type CharSpec, type Cost, type Effect, type Targets } from './bricks.ts';

// Durées d'une modification : celles de bricks.ts, plus « jusqu'à la fin de votre prochain tour »
export type Until = 'battle' | 'turn' | 'oppNextEnd' | 'nextTurn';

// Combien de cartes : « jusqu'à N » (upTo), N obligatoires (forced) ou toutes
export type Amount = { n: number; forced?: boolean } | { all: true };

// Ce que la modification change (stat, mot-clé, portée, valeur)
export type Mod = Pick<Modifier, 'stat' | 'amount' | 'keyword' | 'scope'>;

// Fin de la modification, en tours de jeu (Modifier.until)
export function untilOf(s: GameState, me: PlayerId, u: Until): Modifier['until'] {
  if (u === 'oppNextEnd') return untilOpponentsNextEnd(s, me);
  if (u === 'nextTurn') return untilMyNextEnd(s, me);
  return u;
}

const UNTIL_TEXT: Record<Until, string> = {
  battle: 'pour le combat', turn: 'pour le tour', oppNextEnd: 'jusqu’à la fin du prochain tour adverse', nextTurn: 'jusqu’à la fin de son prochain tour',
};

const isAll = (a: Amount): a is { all: true } => 'all' in a;

// Choix des cartes : toutes, N obligatoires (sans « Aucune » ; sans question si le choix est imposé), ou « jusqu'à N »
export function pick(ctx: EffectCtx, list: number[], amount: Amount, prompt: string, tag: string): number[] {
  if (isAll(amount)) return list;
  if (!amount.forced) return chooseUpToN(ctx, list, amount.n, prompt, tag);
  if (list.length <= amount.n) return list;
  const chosen: number[] = [];
  for (let i = 0; i < amount.n; i++) {
    const left = list.filter((uid) => !chosen.includes(uid));
    const answer = ctx.ask({
      prompt: amount.n > 1 ? `${prompt} (${i + 1}/${amount.n})` : prompt,
      options: left.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
      tag,
    });
    chosen.push(Number(answer.split(':')[1]));
  }
  return chosen;
}

// Étiquette d'une question, comme les briques de bricks.ts
function tagOf(t: Targets, mod: Mod): string {
  const opp = t.side === 'opp';
  if (mod.stat === 'power') return opp ? 'oppPower' : 'ownPower';
  if (mod.stat === 'cost') return opp ? 'oppCost' : 'ownCost';
  return opp ? 'oppLock' : 'ownGrant';
}

const name = (s: GameState, uid: number) => def(findField(s, uid)!.card.num).name;

function apply(ctx: EffectCtx, uid: number, mod: Mod, u: Until, source: string, text: string) {
  addMod(ctx.s, { uid, ...mod, until: untilOf(ctx.s, ctx.me, u), source });
  log(ctx.s, ctx.me, `${name(ctx.s, uid)} ${text} ${UNTIL_TEXT[u]} (${source})`);
}

// Une modification sur des cartes visées (« jusqu'à N », N obligatoires, toutes)
export const modTargets = (t: Targets, mod: Mod, u: Until, source: string, text: string, amount: Amount): Effect => ({
  run: (ctx) => {
    const list = candidates(ctx.s, ctx.me, t, undefined, ctx.source);
    for (const uid of pick(ctx, list, amount, `${source} : ${t.label} qui ${text} :`, tagOf(t, mod))) apply(ctx, uid, mod, u, source, text);
  },
  useful: (s, p, self) => candidates(s, p, t, undefined, self).length > 0,
});

// La carte qui porte l'effet (Leader ou Personnage), sans choix
export const modSelf = (mod: Mod, u: Until, source: string, text: string): Effect => effect((ctx) => {
  const f = findField(ctx.s, ctx.source);
  if (!f || f.stage) return;
  apply(ctx, ctx.source, mod, u, source, text);
}, (s, _p, self) => Boolean(findField(s, self)));

// Le Leader du joueur, sans choix ; avec un filtre (« votre Leader {Marine} »), seulement s'il y correspond
export const modOwnLeader = (spec: CharSpec, mod: Mod, u: Until, source: string, text: string): Effect => {
  const ok = (s: GameState, p: PlayerId) => matches(s, s.players[p].leader, spec);
  return effect((ctx) => {
    if (!ok(ctx.s, ctx.me)) return;
    apply(ctx, ctx.s.players[ctx.me].leader.uid, mod, u, source, text);
  }, (s, p) => ok(s, p));
};

// [Une fois par tour] sans coût, sur un effet déclenché d'une carte du terrain : compte comme utilisé quand l'effet se
// résout (comme les cartes codées à la main, fam-luffy-ace.ts) ; plusieurs moments d'une carte partagent la même clé
export const oncePerTurn = (key: string, then: Effect): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.card.usedOpt.includes(key)) return;
    f.card.usedOpt.push(key);
    then.run(ctx);
  },
  useful: (s, p, self) => !findField(s, self)?.card.usedOpt.includes(key) && then.useful(s, p, self),
});

// Coût « donner −N de puissance à votre Leader redressé pour tout le tour » (comme Nami EB03-006 codée à la main)
export const activeLeaderMinus = (n: number, source: string): Cost => ({
  label: `donner −${n} pour le tour à ton Leader redressé`,
  can: (s, p) => !s.players[p].leader.rested,
  pay: (ctx) => {
    const leader = ctx.s.players[ctx.me].leader;
    if (leader.rested) return false;
    addMod(ctx.s, { uid: leader.uid, stat: 'power', amount: -n, until: 'turn', source });
    log(ctx.s, ctx.me, `son Leader reçoit −${n} de puissance pour le tour (${source})`);
    return true;
  },
});
