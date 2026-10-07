// Briques d'effets fréquentes, partagées par les fichiers de cartes
import {
  addMod, baseCost, canBeRested, chooseUpTo1, chooseUpToN, def, discardFromHand, draw, fieldCards, fieldCost, findField,
  giveRestedDon, hasType, log, may, oppChars, playCharacter, playFromHandFree, removeByEffect, restByEffect,
  untilOpponentsNextEnd,
} from '../rules.ts';
import type { Card, EffectCtx, FieldCard, Modifier } from '../types.ts';

export const isNamed = (num: string, cardName: string) => def(num).names.includes(cardName);
export const isCharacter = (num: string) => def(num).category === 'CHARACTER';
export const hasAttribute = (num: string, attribute: string) => def(num).attributes.includes(attribute);

// « Jusqu'à 1 Personnage adverse reçoit −X de puissance » (le Leader adverse aussi si includeLeader)
export function oppPowerDown(ctx: EffectCtx, amount: number, until: Modifier['until'], source: string, includeLeader = false) {
  const candidates = [...(includeLeader ? [ctx.s.players[ctx.opp].leader.uid] : []), ...oppChars(ctx)];
  const target = chooseUpTo1(ctx, candidates, `${source} : ${includeLeader ? 'Leader ou Personnage' : 'Personnage'} adverse qui reçoit −${amount} de puissance :`, 'oppPower');
  if (target === null) return null;
  addMod(ctx.s, { uid: target, stat: 'power', amount: -amount, until, source });
  log(ctx.s, ctx.me, `${def(findField(ctx.s, target)!.card.num).name} reçoit −${amount} de puissance (${source})`);
  return target;
}

// « Jusqu'à 1 de vos Leaders ou Personnages gagne +X de puissance »
export function ownPowerUp(ctx: EffectCtx, amount: number, until: Modifier['until'], source: string, candidates?: number[]) {
  const list = candidates ?? fieldCards(ctx.s, ctx.me).map((c) => c.uid);
  const target = chooseUpTo1(ctx, list, `${source} : carte qui gagne +${amount} de puissance :`, 'ownPower');
  if (target === null) return null;
  addMod(ctx.s, { uid: target, stat: 'power', amount, until, source });
  log(ctx.s, ctx.me, `${def(findField(ctx.s, target)!.card.num).name} gagne +${amount} de puissance (${source})`);
  return target;
}

// [Contre] « jusqu'à 1 de vos Leaders ou Personnages gagne +X pour tout le combat » : la carte attaquée
export function counterBoost(ctx: EffectCtx, amount: number, source: string) {
  const target = Number(ctx.pending.data?.target);
  const f = findField(ctx.s, target);
  if (!f || f.player !== ctx.me) return;
  addMod(ctx.s, { uid: target, stat: 'power', amount, until: 'battle', source });
  log(ctx.s, ctx.me, `${def(f.card.num).name} gagne +${amount} de puissance pour le combat (${source})`);
}

// « Donnez jusqu'à N cartes DON!! épuisées à » une carte choisie parmi les candidates
export function restedDonTo(ctx: EffectCtx, candidates: FieldCard[], n = 1, prompt = 'Donner des DON!! épuisées à :') {
  if (ctx.s.players[ctx.me].donRested <= 0 || !candidates.length) return;
  const target = candidates.length === 1 ? candidates[0].uid : chooseUpTo1(ctx, candidates.map((c) => c.uid), prompt, 'donTarget');
  if (target !== null) giveRestedDon(ctx.s, ctx.me, target, n);
}

// « Vous pouvez défausser 1 carte de votre main : » (coût facultatif)
export function mayDiscard(ctx: EffectCtx, prompt: string, filter?: (num: string) => boolean): boolean {
  const P = ctx.s.players[ctx.me];
  if (!P.hand.some((c) => !filter || filter(c.num))) return false;
  if (!may(ctx, prompt, 'mayDiscard')) return false;
  return discardFromHand(ctx, ctx.me, 1, 'Carte à défausser :', filter ? (c) => filter(c.num) : undefined) === 1;
}

export function drawLog(ctx: EffectCtx, n: number) {
  const before = ctx.s.players[ctx.me].hand.length;
  draw(ctx.s, ctx.me, n);
  const k = ctx.s.players[ctx.me].hand.length - before;
  if (k) log(ctx.s, ctx.me, `pioche ${k} carte${k > 1 ? 's' : ''}`);
}

// [Déclenchement] « jouez cette carte »
export function playTriggerCard(ctx: EffectCtx, opts: { rested?: boolean } = {}) {
  if (!ctx.trigger) return;
  ctx.trigger.moved = true;
  playCharacter(ctx, ctx.me, ctx.trigger.card, opts);
}

// ---------- Effets sur les Personnages adverses ----------

type CharFilter = (c: FieldCard) => boolean;

export const costAtMost = (ctx: EffectCtx, n: number): CharFilter => (c) => fieldCost(ctx.s, c.uid) <= n;
export const baseCostAtMost = (n: number): CharFilter => (c) => baseCost(c.num) <= n;

// « Épuisez jusqu'à N Personnages adverses ... »
export function restOpp(ctx: EffectCtx, filter: CharFilter, source: string, n = 1) {
  const candidates = oppChars(ctx, (c) => !c.rested && canBeRested(ctx.s, c.uid) && filter(c));
  const chosen = chooseUpToN(ctx, candidates, n, `${source} : Personnage adverse à épuiser :`, 'oppRest');
  for (const uid of chosen) restByEffect(ctx, uid);
  return chosen;
}

// « Mettez KO jusqu'à 1 Personnage adverse ... »
export function koOpp(ctx: EffectCtx, filter: CharFilter, source: string) {
  const target = chooseUpTo1(ctx, oppChars(ctx, filter), `${source} : Personnage adverse à mettre KO :`, 'oppKo');
  if (target !== null) removeByEffect(ctx, target, 'ko');
  return target;
}

// « Placez au-dessous du deck de son propriétaire jusqu'à N Personnages adverses ... »
export function bottomOpp(ctx: EffectCtx, filter: CharFilter, source: string, n = 1) {
  const chosen = chooseUpToN(ctx, oppChars(ctx, filter), n, `${source} : Personnage adverse à placer au-dessous de son deck :`, 'oppRemove');
  for (const uid of chosen) removeByEffect(ctx, uid, 'deckBottom');
  return chosen;
}

// « Renvoyez à la main de son propriétaire jusqu'à 1 Personnage ... » (n'importe quel Personnage, les siens compris)
export function bounceAny(ctx: EffectCtx, filter: CharFilter, source: string) {
  const candidates = [...oppChars(ctx, filter), ...ctx.s.players[ctx.me].chars.filter(filter).map((c) => c.uid)];
  const target = chooseUpTo1(ctx, candidates, `${source} : Personnage à renvoyer dans la main de son propriétaire :`, 'bounce');
  if (target !== null) removeByEffect(ctx, target, 'hand');
  return target;
}

// « Jusqu'à N Personnages adverses ne peuvent pas attaquer / être épuisés jusqu'à la fin du prochain tour adverse »
export function lockOpp(ctx: EffectCtx, stat: 'cantAttack' | 'cantRest', filter: CharFilter, source: string, n = 1) {
  const candidates = oppChars(ctx, filter);
  const what = stat === 'cantAttack' ? 'qui ne pourra pas attaquer' : 'qui ne pourra pas être épuisé';
  const chosen = chooseUpToN(ctx, candidates, n, `${source} : Personnage adverse ${what} :`, 'oppLock');
  for (const uid of chosen) {
    addMod(ctx.s, { uid, stat, amount: 0, until: untilOpponentsNextEnd(ctx.s, ctx.me), source });
    log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} ${stat === 'cantAttack' ? 'ne peut pas attaquer' : 'ne peut pas être épuisé'} jusqu'à la fin du prochain tour adverse (${source})`);
  }
  return chosen;
}

// « Jouez jusqu'à 1 carte Personnage ... de votre main »
export function playCharFromHand(ctx: EffectCtx, filter: (c: Card) => boolean, prompt: string, opts: { rested?: boolean } = {}) {
  return playFromHandFree(ctx, (c) => isCharacter(c.num) && filter(c), prompt, opts);
}

export const typed = (type: string) => (c: Card) => hasType(c.num, type);
