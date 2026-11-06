// Briques de la famille « Vie » du traducteur (étape C, tâche C2.5) : ce que les briques de bricks.ts ne savent pas
// encore faire avec la Vie. Elles ne servent qu'aux recettes compilées (recipes/compile.ts) : aucune carte codée à la
// main ne les utilise, le jeu des decks existants ne change pas.
//
// Conventions (game/docs/interpretations.md, section « Traducteur, famille « Vie » (tâche C2.5) ») :
// - ajouter des cartes du deck à sa Vie, prendre ou défausser la Vie ADVERSE : « jusqu'à N » se fait sans question,
//   comme les cartes codées à la main (n° 381 ; Charlotte Linlin OP03-114, Eustass Kidd OP10-112) ;
// - prendre ou défausser SA PROPRE Vie « jusqu'à N » : une question par carte (le joueur peut s'arrêter) ;
// - « du dessus ou du dessous » : une question par carte, dessus en premier ;
// - « ajouter à votre main » depuis sa propre Vie respecte « vous ne pouvez pas ajouter de carte de Vie à votre main par
//   vos propres effets » (Atmos ST15-001) ; prendre la Vie adverse n'est pas concerné.
import {
  addTopDeckToLife, canTakeLife, def, knownFirst, lifeToHand, log, other, privateLog, reveal, uniqueByNum,
} from '../rules.ts';
import type { Card, EffectCtx, PlayerId } from '../types.ts';
import { cardMatches, effect, type CharSpec, type Effect } from './bricks.ts';

type Spec = CharSpec & { category?: 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE' };
export type LifeEnd = 'top' | 'topOrBottom';

// Quelle carte de la Vie : le dessus, ou au choix le dessus ou le dessous (dessus proposé en premier)
function pickEnd(ctx: EffectCtx, life: Card[], from: LifeEnd, prompt: string): 'top' | 'bottom' {
  if (from === 'top' || life.length < 2) return 'top';
  return ctx.ask({
    prompt,
    options: [{ id: 'top', label: 'La carte du dessus' }, { id: 'bottom', label: 'La carte du dessous' }],
    tag: 'lifeSide',
  }) as 'top' | 'bottom';
}

// « Jusqu'à N » sur sa propre Vie : continuer ? (une question par carte)
function goOn(ctx: EffectCtx, prompt: string, tag: string): boolean {
  return ctx.ask({ prompt, options: [{ id: 'yes', label: 'Oui' }, { id: 'none', label: 'Non, s’arrêter' }], tag }) === 'yes';
}

// « Ajoutez (jusqu'à) N cartes du dessus de votre deck au-dessus de votre Vie (face visible) » : sans question (en-tête)
export const lifeFromDeckN = (n: number, faceUp: boolean, source: string): Effect => effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  for (let i = 0; i < n && P.deck.length; i++) {
    addTopDeckToLife(ctx.s, ctx.me);
    if (faceUp) {
      const top = P.life[0];
      top.faceUp = true;
      reveal(ctx.s, [top.uid], 'both');
      log(ctx.s, ctx.me, `la carte ajoutée à sa Vie est face visible : ${def(top.num).name} (${source})`);
    }
  }
}, (s, p) => s.players[p].deck.length > 0);

// « Ajoutez à votre main (jusqu'à) N cartes du dessus (ou du dessous) de votre Vie » ; side 'opp' : « ... de la Vie
// adverse à la main de son propriétaire » / « votre adversaire ajoute à sa main ... » (sans question, en-tête)
export const lifeToHandN = (side: 'own' | 'opp', n: number, from: LifeEnd, upTo: boolean, source: string): Effect => effect((ctx) => {
  const owner = side === 'own' ? ctx.me : ctx.opp;
  const life = ctx.s.players[owner].life;
  for (let i = 0; i < n && life.length; i++) {
    if (side === 'own' && !canTakeLife(ctx.s, ctx.me)) {
      log(ctx.s, ctx.me, 'ne peut pas ajouter de carte de Vie à sa main ce tour-ci');
      return;
    }
    if (side === 'own' && upTo && !goOn(ctx, `${source} : ajouter à ta main une carte de ta Vie (${life.length} Vie) ?`, 'lifeToHandUpTo')) return;
    const end = pickEnd(ctx, life, from, side === 'own' ? `${source} : carte de ta Vie à ajouter à ta main :` : `${source} : carte de la Vie adverse à ajouter à sa main :`);
    lifeToHand(ctx.s, owner, end, ctx.me);
  }
}, (s, p) => {
  const owner = side === 'own' ? p : other(p);
  return s.players[owner].life.length > 0 && (side === 'opp' || canTakeLife(s, p));
});

// « Placez dans la Défausse (jusqu'à) N cartes du dessus (ou du dessous) de votre Vie / de la Vie adverse » : pas des
// dégâts (pas de [Déclenchement]) ; la carte devient publique
export const trashLifeN = (side: 'own' | 'opp', n: number, from: LifeEnd, upTo: boolean, source: string): Effect => effect((ctx) => {
  const owner = side === 'own' ? ctx.me : ctx.opp;
  const P = ctx.s.players[owner];
  for (let i = 0; i < n && P.life.length; i++) {
    if (side === 'own' && upTo && !goOn(ctx, `${source} : placer dans ta Défausse une carte de ta Vie (${P.life.length} Vie) ?`, 'trashLifeUpTo')) return;
    const end = pickEnd(ctx, P.life, from, side === 'own' ? `${source} : carte de ta Vie à placer dans ta Défausse :` : `${source} : carte de la Vie adverse à placer dans sa Défausse :`);
    const card = end === 'top' ? P.life.shift()! : P.life.pop()!;
    P.trash.push({ uid: card.uid, num: card.num });
    log(ctx.s, owner, `la carte ${end === 'top' ? 'du dessus' : 'du dessous'} de sa Vie va dans sa Défausse : ${def(card.num).name} (${P.life.length} Vie) (${source})`);
  }
}, (s, p) => s.players[side === 'own' ? p : other(p)].life.length > 0);

// « Ajoutez au-dessus de votre Vie (jusqu'à) N [cartes ...] de votre main (face visible) » : le joueur choisit chaque
// carte (« Aucune » si « jusqu'à ») ; face cachée, seul lui la connaît
export const handToLifeN = (n: number, spec: Spec, faceUp: boolean, upTo: boolean, source: string): Effect => {
  const fits = (num: string) => cardMatches(num, spec);
  return effect((ctx) => {
    const P = ctx.s.players[ctx.me];
    for (let i = 0; i < n; i++) {
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => fits(c.num))));
      if (!options.length) return;
      const answer = ctx.ask({
        prompt: `${source} : carte de ta main à placer au-dessus de ta Vie${faceUp ? ' face visible' : ''} :`,
        options: [...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), ...(upTo ? [{ id: 'none', label: 'Aucune' }] : [])],
        tag: 'toLife',
      });
      if (answer === 'none') return;
      const [c] = P.hand.splice(P.hand.findIndex((x) => x.uid === Number(answer.split(':')[1])), 1);
      P.life.unshift(faceUp ? { ...c, faceUp: true } : c);
      reveal(ctx.s, [c.uid], faceUp ? 'both' : ctx.me);
      log(ctx.s, ctx.me, faceUp ? `place ${def(c.num).name} face visible au-dessus de sa Vie (${source})` : `place 1 carte de sa main au-dessus de sa Vie (${source})`);
    }
  }, (s, p) => s.players[p].hand.some((c) => fits(c.num)));
};

// « Vous ne pouvez pas ajouter de carte de Vie à votre main par vos propres effets pour tout le tour » (comme Atmos
// ST15-001) : une contrainte, jamais « utile »
export const noLifeToHandThisTurn = (source: string): Effect => effect((ctx) => {
  ctx.s.players[ctx.me].noLifeToHandTurn = ctx.s.turn;
  log(ctx.s, ctx.me, `ne peut plus ajouter de carte de Vie à sa main par ses effets ce tour-ci (${source})`);
}, () => false);

// « Regardez toutes vos cartes de Vie (toutes celles de votre adversaire) et replacez-les dans l'ordre de votre choix » :
// le joueur choisit la carte du dessus, puis la suivante... ; il connaît ensuite chaque carte (et sa place), pas
// l'autre joueur (sauf les cartes face visible, déjà publiques)
export const reorderLife = (side: 'own' | 'opp', source: string): Effect => effect((ctx) => {
  const owner: PlayerId = side === 'own' ? ctx.me : ctx.opp;
  const P = ctx.s.players[owner];
  if (!P.life.length) return;
  const rest = P.life.splice(0, P.life.length);
  const whose = side === 'own' ? 'ta Vie' : 'la Vie adverse';
  privateLog(ctx.s, ctx.me, `cartes regardées (${whose}) : ${rest.map((c) => def(c.num).name).join(', ')}`);
  const ordered: Card[] = [];
  while (rest.length >= 2) {
    const answer = ctx.ask({
      prompt: `${source} : carte à placer ${ordered.length ? 'ensuite' : 'tout en haut de ' + whose} :`,
      options: rest.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name}${c.faceUp ? ' (face visible)' : ''}`, uid: c.uid, num: c.num })),
      tag: 'lifeOrder',
      cards: rest.map((c) => ({ uid: c.uid, num: c.num, owner })),
    });
    ordered.push(...rest.splice(rest.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1));
  }
  P.life.push(...ordered, ...rest);
  reveal(ctx.s, P.life.map((c) => c.uid), ctx.me);
  log(ctx.s, ctx.me, `regarde ${side === 'own' ? 'toutes ses cartes de Vie' : 'toutes les cartes de Vie adverses'} et les replace dans l'ordre de son choix (${source})`);
}, (s, p) => s.players[side === 'own' ? p : other(p)].life.length > 1);
