// Briques de la famille « jouer » (tâche C2.6) : « Si vous le faites » / « Sinon », choix laissé à l'adversaire, et
// effets dont une valeur est calculée au moment où ils se résolvent. bricks.ts n'est pas modifié.
import { canPlayCharacters, def, knownFirst, playableByEffect, playCharacter, uniqueByNum } from '../rules.ts';
import type { Card, GameState, PlayerId } from '../types.ts';
import { cardMatches, describeSpec, type CharSpec, type Effect } from './bricks.ts';

// Ce qu'un effet peut changer à la partie : les deux joueurs (zones, DON!!, état des cartes), les modifications en
// cours et les effets différés. Le journal, les questions et la file d'attente n'en font pas partie.
function footprint(s: GameState): string {
  return JSON.stringify([s.players, s.mods, s.delayed]);
}

// « A. Si vous le faites, B » (wanted true) ; « A. Sinon, B » (wanted false) : B dépend de ce que A a vraiment fait
// (interprétation n° 1900 : A est « fait » quand il a changé la partie ; un « jusqu'à 1 » où l'on ne choisit rien, un
// « vous pouvez » refusé, ou une action sans cible ne font rien)
export const ifDone = (first: Effect, then: Effect, wanted: boolean): Effect => ({
  run: (ctx) => {
    const before = footprint(ctx.s);
    first.run(ctx);
    const done = footprint(ctx.s) !== before;
    if (done === wanted) then.run(ctx);
  },
  // « Si vous le faites » : rien ne sert si A ne peut pas servir ; « Sinon » : B peut servir même quand A ne sert pas
  useful: (s, p, self) => (wanted ? first.useful(s, p, self) : first.useful(s, p, self) || then.useful(s, p, self)),
});

// « Votre adversaire choisit un effet : • A • B » : l'adversaire choisit parmi tous les effets, même un effet qui ne
// ferait rien (c'est son intérêt), et le joueur de la carte le fait (interprétation n° 1901)
export const oppChooseOne = (source: string, choices: { label: string; effect: Effect }[]): Effect => ({
  run: (ctx) => {
    const options = choices.map((c, i) => ({ id: `choice:${i}`, label: c.label }));
    if (!options.length) return;
    const answer = ctx.ask({ player: ctx.opp, prompt: `${source} : choisis l'effet que ton adversaire applique`, options, tag: 'oppChooseOne' });
    choices[Number(answer.split(':')[1])].effect.run(ctx);
  },
  useful: (s, p, self) => choices.some((c) => c.effect.useful(s, p, self)),
});

// Un effet construit au moment où il sert, d'après une valeur calculée (borne de coût égale à un compte, puissance
// multipliée par un compte)
export const computedEffect = (build: (s: GameState, p: PlayerId, self: number) => Effect): Effect => ({
  run: (ctx) => build(ctx.s, ctx.me, ctx.source).run(ctx),
  useful: (s, p, self) => build(s, p, self).useful(s, p, self),
});

// « Jouez jusqu'à 1 carte Personnage ... de votre main ou de votre Défausse » (sans payer son coût) : les cartes des deux
// zones sont proposées ensemble ; une carte de la main qui ne peut pas être jouée par un effet est écartée, comme dans
// playFromHand
export const playFromHandOrTrash = (spec: CharSpec, source: string, opts: { rested?: boolean } = {}): Effect => {
  const fits = (c: Card) => def(c.num).category === 'CHARACTER' && cardMatches(c.num, spec);
  const list = (s: GameState, p: PlayerId) => [
    ...s.players[p].hand.filter((c) => fits(c) && playableByEffect(c.num)).map((c) => ({ c, zone: 'hand' as const })),
    ...s.players[p].trash.filter(fits).map((c) => ({ c, zone: 'trash' as const })),
  ];
  return {
    run: (ctx) => {
      if (!canPlayCharacters(ctx.s, ctx.me)) return;
      const P = ctx.s.players[ctx.me];
      const ok = list(ctx.s, ctx.me).filter((x) => canPlayCharacters(ctx.s, ctx.me, x.c.num));
      const hand = uniqueByNum(knownFirst(ctx.s, ctx.me, ok.filter((x) => x.zone === 'hand').map((x) => x.c)));
      const trash = uniqueByNum(ok.filter((x) => x.zone === 'trash').map((x) => x.c));
      if (!hand.length && !trash.length) return;
      const answer = ctx.ask({
        prompt: `${source} : jouer${opts.rested ? ' épuisé' : ''} jusqu’à 1 ${describeSpec('Personnage', spec)} de ta main ou de ta Défausse :`,
        options: [
          ...hand.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost}, main)`, uid: c.uid, num: c.num })),
          ...trash.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost}, Défausse)`, uid: c.uid, num: c.num })),
          { id: 'none', label: 'Aucun' },
        ],
        tag: 'playFree',
      });
      if (answer === 'none') return;
      const uid = Number(answer.split(':')[1]);
      const zone = P.hand.some((c) => c.uid === uid) ? P.hand : P.trash;
      const [card] = zone.splice(zone.findIndex((c) => c.uid === uid), 1);
      playCharacter(ctx, ctx.me, card, { ...opts, from: zone === P.trash ? 'trash' : 'hand' });
    },
    useful: (s, p) => canPlayCharacters(s, p) && list(s, p).length > 0,
  };
};
