// Choix des cartes visées par une brique de recette (étape C) : « jusqu'à N », N obligatoires, ou toutes. Partagé par les
// familles « retraits » (C2.1) et « puissance » (C2.2), qui l'avaient écrit chacune à l'identique (intégration C2).
import { chooseUpToN, describe } from '../rules.ts';
import type { EffectCtx } from '../types.ts';

// Combien de cartes : « jusqu'à N » (upTo), N obligatoires (forced) ou toutes
export type Amount = { n: number; forced?: boolean } | { all: true };

export const isAll = (a: Amount): a is { all: true } => 'all' in a;

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
