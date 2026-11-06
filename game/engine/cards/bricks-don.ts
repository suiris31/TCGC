// Briques de la famille « DON!! » (étape C, tâche C2.4) : ce que les recettes demandent et que bricks.ts ne sait pas
// encore dire exactement. Les briques de bricks.ts restent celles qu'utilisent les cartes codées à la main (addDon,
// readyDon, giveDon, giveRestedDonToOwner, restDon, donMinus, giveActiveDon, restOppCards) ; celles-ci ajoutent :
// - renvoyer N DON!! de son terrain, ou faire renvoyer N DON!! à l'adversaire (« Your opponent returns ... ») ;
// - épuiser N de ses propres DON!! (effet, pas coût) ; épuiser jusqu'à N DON!! adverses (sans Personnage) ;
// - donner des DON!! épuisées à la carte elle-même (« Give this Character up to 2 rested DON!! cards ») ;
// - le coût « donner 1 DON!! épuisée adverse à 1 Personnage adverse » (OP15).
//
// Questions : mêmes étiquettes que les briques de bricks.ts (l'IA les connaît déjà).
import { def, donOnField, emit, findField, giveRestedDon, log, other } from '../rules.ts';
import type { GameState, PlayerId } from '../types.ts';
import { candidates, type Cost, type Effect, type Targets } from './bricks.ts';

// Renvoie au deck DON!! jusqu'à N DON!! du terrain de `p`, dans l'ordre du moteur pour DON!! −X (rules.ts, returnDon) :
// d'abord les épuisées, puis les redressées, puis celles données (interprétation 1741). `by` : joueur dont l'effet est
// la cause (l'évènement donReturned le dit, comme Amazon, fam-meta.ts).
function returnUpTo(s: GameState, p: PlayerId, n: number, by: PlayerId, sourceNum: string, source: string): number {
  const P = s.players[p];
  let left = Math.min(n, donOnField(s, p));
  const k = left;
  if (k <= 0) return 0;
  const take = (available: number) => {
    const x = Math.min(available, left);
    left -= x;
    return x;
  };
  P.donRested -= take(P.donRested);
  P.donActive -= take(P.donActive);
  for (const c of [...P.chars, P.leader]) c.don -= take(c.don);
  P.donDeck += k;
  log(s, p, `renvoie ${k} DON!! dans son deck DON!! (${source})`);
  emit(s, { type: 'donReturned', player: p, count: k, by, cause: 'effect', sourceNum });
  return k;
}

// « Return N DON!! cards from your field to your DON!! deck » (effet ; le coût DON!! −N est B.donMinus) : autant que
// possible s'il y en a moins (interprétation 1742)
export const returnOwnDon = (n: number, source: string): Effect => ({
  run: (ctx) => { returnUpTo(ctx.s, ctx.me, n, ctx.me, ctx.num, source); },
  useful: (s, p) => donOnField(s, p) >= n,
});

// « Your opponent returns N DON!! cards from their field to their DON!! deck »
export const returnOppDon = (n: number, source: string): Effect => ({
  run: (ctx) => { returnUpTo(ctx.s, ctx.opp, n, ctx.me, ctx.num, source); },
  useful: (s, p) => donOnField(s, other(p)) > 0,
});

// « Rest N of your DON!! cards » (effet, souvent « you may ... If you do, ... ») : N DON!! redressées de la zone de Coût,
// autant que possible ; utile s'il y en a assez (une partie seulement ne « fait » pas l'effet demandé)
export const restOwnDon = (n: number, source: string): Effect => ({
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    const k = Math.min(n, P.donActive);
    if (k <= 0) return;
    P.donActive -= k;
    P.donRested += k;
    log(ctx.s, ctx.me, `épuise ${k} DON!! (${source})`);
  },
  useful: (s, p) => s.players[p].donActive >= n,
});

// « Rest up to N of your opponent's DON!! cards » : une à une, comme B.restOppCards (même question, même étiquette),
// mais sans Personnage (restOppCards propose toujours les Personnages adverses)
export const restOppDon = (n: number, source: string): Effect => ({
  run: (ctx) => {
    const O = ctx.s.players[ctx.opp];
    for (let i = 0; i < n && O.donActive > 0; i++) {
      const answer = ctx.ask({
        prompt: `${source} : carte adverse à épuiser${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
        options: [{ id: 'don', label: '1 DON!! redressée adverse' }, { id: 'none', label: 'Aucune' }],
        tag: 'oppRest',
      });
      if (answer !== 'don') return;
      O.donActive--;
      O.donRested++;
      log(ctx.s, ctx.me, `épuise 1 DON!! adverse (${source})`);
    }
  },
  useful: (s, p) => s.players[other(p)].donActive > 0,
});

// « Give this Character up to N rested DON!! cards » : la carte qui porte l'effet, sans choix de carte
export const giveDonToSelf = (n: number): Effect => ({
  run: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.player !== ctx.me || f.stage) return;
    giveRestedDon(ctx.s, ctx.me, ctx.source, n);   // écrit le journal
  },
  useful: (s, p, self) => s.players[p].donRested > 0 && findField(s, self)?.player === p,
});

// Coût « give 1 of your opponent's rested DON!! cards to 1 of your opponent's Characters » (OP15) : une DON!! épuisée
// de la zone de Coût adverse passe sur une carte adverse choisie (t : cible adverse)
export const giveOppRestedDonCost = (t: Targets, n: number): Cost => ({
  label: `donner ${n} DON!! épuisée${n > 1 ? 's' : ''} adverse${n > 1 ? 's' : ''} (${t.label})`,
  can: (s, p, self) => s.players[other(p)].donRested >= n && candidates(s, p, t, undefined, self).length > 0,
  pay: (ctx) => {
    const O = ctx.s.players[ctx.opp];
    const list = candidates(ctx.s, ctx.me, t, undefined, ctx.source);
    if (O.donRested < n || !list.length) return false;
    const uid = list.length === 1 ? list[0] : ctx.ask({
      prompt: `Carte adverse qui reçoit ${n} DON!! épuisée${n > 1 ? 's' : ''} adverse${n > 1 ? 's' : ''} :`,
      options: list.map((u) => ({ id: `card:${u}`, label: def(findField(ctx.s, u)!.card.num).name, uid: u })),
      tag: 'oppDonTarget',
    }).split(':').map(Number)[1];
    const f = findField(ctx.s, uid);
    if (!f) return false;
    O.donRested -= n;
    f.card.don += n;
    log(ctx.s, ctx.me, `donne ${n} DON!! épuisée${n > 1 ? 's' : ''} adverse${n > 1 ? 's' : ''} à ${def(f.card.num).name}`);
    return true;
  },
});
