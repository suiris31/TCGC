// Briques de la famille « retraits » (étape C, tâche C2.1) : ce que les recettes demandent et que bricks.ts ne sait pas
// encore dire exactement. Les briques de bricks.ts restent celles des cibles « jusqu'à N » (mêmes questions, même jeu) ;
// celles-ci ajoutent :
// - la cible obligatoire (« Mettez KO 1 Personnage adverse ... », sans « jusqu'à ») : le joueur choisit sans pouvoir
//   refuser, et sans question s'il n'y a pas le choix (interprétation 1500) ;
// - « tous les ... » (mettre KO, renvoyer, placer sous le deck ou dans la Défausse, redresser) ;
// - placer dans la Défausse (pas un KO : ni [En cas de KO] ni « ne peut pas être mis KO ») ;
// - la Vie « au-dessus » seulement ;
// - la carte qui porte l'effet (« renvoyez ce Personnage dans la main de son propriétaire ») ;
// - quelques coûts (renvoyer N de ses Personnages, renvoyer cette carte).
//
// Questions : mêmes étiquettes que les briques de bricks.ts (l'IA les connaît déjà) ; une cible obligatoire de son
// propre camp prend l'étiquette 'trashOwn' (l'IA choisit la carte qui vaut le moins).
import {
  canBeKO, canBeRested, canLeaveByEffect, def, describe, emit, fieldCards, findField, isNegated, koCharacter, log, removeByEffect,
  removeFromField, restByEffect, setActive,
} from '../rules.ts';
import type { EffectCtx, GameState, Option, PlayerId } from '../types.ts';
import { candidates, describeSpec, effect, matches, type CharSpec, type Cost, type Effect, type Targets } from './bricks.ts';
import { isAll, pick, type Amount } from './bricks-choice.ts';

export { pick, type Amount };


// Où va la carte retirée du terrain
export type RemovalTo = 'ko' | 'hand' | 'deckBottom' | 'trash' | { life: 'top' | 'topOrBottom'; faceUp: boolean };

// Étiquette d'une question : celle de la brique « jusqu'à N » ; une cible obligatoire de son propre camp : la carte qui
// vaut le moins (comme un coût)
const tagFor = (t: Targets, amount: Amount, opp: string, own: string) =>
  (t.side === 'own' && !isAll(amount) && amount.forced ? 'trashOwn' : t.side === 'own' ? own : opp);

// Placer un Personnage dans la Défausse par un effet (pas un KO). Comme removeByEffect : « ne peut pas quitter le
// terrain à cause d'un effet adverse » et les effets de remplacement de son propriétaire (sauf ceux du seul KO) ; le
// moteur l'annonce comme une sortie du terrain ('leave').
export function trashByEffect(ctx: EffectCtx, uid: number): boolean {
  const { s } = ctx;
  const f = findField(s, uid);
  if (!f || f.leader || f.stage) return false;
  const owner = f.player;
  if (!canLeaveByEffect(s, uid, ctx.me)) {
    log(s, owner, `${def(f.card.num).name} ne peut pas quitter le terrain à cause d'un effet adverse`);
    return false;
  }
  if (owner !== ctx.me) {
    const options: Option[] = fieldCards(s, owner).flatMap((self) => {
      const r = def(self.num).replaceRemoval;
      if (!r || isNegated(s, self.uid) || r.onlyKo || (r.oncePerTurn && self.usedOpt.includes('replace')) || !r.condition(s, owner, self, f.card)) return [];
      return [{ id: `replace:${self.uid}`, label: r.label(s, self, f.card), uid: self.uid }];
    });
    if (options.length) {
      const answer = ctx.ask({
        player: owner,
        prompt: `${def(f.card.num).name} va quitter le terrain à cause d'un effet adverse. Utiliser un effet de remplacement ?`,
        options: [...options, { id: 'none', label: 'Non' }],
        tag: 'replace',
      });
      if (answer !== 'none') {
        const self = findField(s, Number(answer.split(':')[1]))!.card;
        const r = def(self.num).replaceRemoval!;
        if (r.oncePerTurn) self.usedOpt.push('replace');
        r.apply(s, owner, self, f.card, ctx);
        return false;
      }
    }
  }
  removeFromField(s, uid, 'trash');
  log(s, owner, `${def(f.card.num).name} est placé dans la Défausse de son propriétaire`);
  emit(s, { type: 'leave', player: owner, uid, num: f.card.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
  return true;
}

const VERB: Record<string, string> = {
  ko: 'mettre KO', hand: 'renvoyer dans la main de son propriétaire', deckBottom: 'placer au-dessous du deck de son propriétaire',
  trash: 'placer dans la Défausse de son propriétaire',
};

// Retirer du terrain des Personnages visés (pas un Leader) : obligatoires, tous, dans la Défausse ou dans la Vie
export const removeChars = (t: Targets, to: RemovalTo, source: string, amount: Amount): Effect => {
  const list = (s: GameState, p: PlayerId, self?: number) => candidates(s, p, t, (c) => !findField(s, c.uid)?.leader
    && (to !== 'ko' || canBeKO(s, c.uid, 'effect', p)) && canLeaveByEffect(s, c.uid, p), self);
  const life = typeof to === 'object' ? to : undefined;
  const verb = life ? `placer ${life.faceUp ? 'face visible' : 'face cachée'} ${life.life === 'top' ? 'au-dessus de' : 'dans'} la Vie de son propriétaire` : VERB[to as string];
  const tag = to === 'ko' ? tagFor(t, amount, 'oppKo', 'ko') : to === 'hand' ? tagFor(t, amount, 'bounce', 'bounce')
    : to === 'trash' ? tagFor(t, amount, 'oppKo', 'trashOwn') : life ? tagFor(t, amount, 'oppToLife', 'toLife') : tagFor(t, amount, 'oppRemove', 'oppRemove');
  return {
    run: (ctx) => {
      const chosen = pick(ctx, list(ctx.s, ctx.me, ctx.source), amount, `${source} : ${t.label} à ${verb} :`, tag);
      for (const uid of chosen) {
        if (!findField(ctx.s, uid)) continue;     // déjà parti (un effet [En cas de KO] ne se résout qu'après)
        if (to === 'trash') trashByEffect(ctx, uid);
        else if (!life) removeByEffect(ctx, uid, to as 'ko' | 'hand' | 'deckBottom');
        else {
          const top = life.life === 'top' || ctx.ask({
            prompt: `${source} : au-dessus ou au-dessous de sa Vie ?`,
            options: [{ id: 'lifeBottom', label: 'Au-dessous' }, { id: 'lifeTop', label: 'Au-dessus' }],
            tag: 'lifeSideOpp',
          }) === 'lifeTop';
          removeByEffect(ctx, uid, top ? (life.faceUp ? 'lifeTop' : 'lifeTopHidden') : (life.faceUp ? 'lifeBottom' : 'lifeBottomHidden'));
        }
      }
    },
    useful: (s, p, self) => list(s, p, self).length > 0,
  };
};

// Épuiser des cartes visées, obligatoires (« tous » : restAll de bricks.ts)
export const restTargets = (t: Targets, source: string, amount: Amount): Effect => {
  const list = (s: GameState, p: PlayerId, num?: string, self?: number) =>
    candidates(s, p, t, (c) => !c.rested && canBeRested(s, c.uid, num ? { player: p, num } : undefined), self);
  return {
    run: (ctx) => {
      const tag = t.side === 'own' ? (isAll(amount) || !amount.forced ? 'rest' : 'restCost') : 'oppRest';
      for (const uid of pick(ctx, list(ctx.s, ctx.me, ctx.num, ctx.source), amount, `${source} : ${t.label} à épuiser :`, tag)) restByEffect(ctx, uid);
    },
    useful: (s, p, self) => list(s, p, undefined, self).length > 0,
  };
};

// Redresser des cartes visées : obligatoires ou toutes
export const readyTargets = (t: Targets, source: string, amount: Amount): Effect => {
  const list = (s: GameState, p: PlayerId, self?: number) => candidates(s, p, t, (c) => c.rested, self);
  return {
    run: (ctx) => {
      for (const uid of pick(ctx, list(ctx.s, ctx.me, ctx.source), amount, `${source} : ${t.label} à redresser :`, 'ownReady')) setActive(ctx.s, ctx.me, uid);
    },
    useful: (s, p, self) => list(s, p, self).length > 0,
  };
};

// La carte qui porte l'effet quitte le terrain (« mettez KO / renvoyez / placez sous le deck ce Personnage ») : comme
// restThis et trashThis, l'effet ne sert à rien en soi (c'est l'effet qui l'accompagne qui décide)
export const removeSelf = (to: 'ko' | 'hand' | 'deckBottom'): Effect => effect((ctx) => {
  const f = findField(ctx.s, ctx.source);
  if (!f || f.leader || f.stage) return;
  removeByEffect(ctx, ctx.source, to);
}, () => false);

// ---------- Coûts ----------

// « Renvoyer cette carte dans la main de son propriétaire » (coût)
export const bounceSelfCost = (): Cost => ({
  label: 'renvoyer cette carte dans ta main',
  can: (s, _p, self) => { const f = findField(s, self); return Boolean(f && !f.leader); },
  pay: (ctx) => {
    const f = findField(ctx.s, ctx.source);
    if (!f || f.leader) return false;
    removeFromField(ctx.s, ctx.source, 'hand');
    log(ctx.s, ctx.me, `renvoie ${def(f.card.num).name} dans sa main`);
    if (!f.stage) emit(ctx.s, { type: 'leave', player: ctx.me, uid: ctx.source, num: f.card.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
    return true;
  },
});

// « Mettre KO N de vos Personnages ... » (coût) : un vrai KO (effets [En cas de KO], « ne peut pas être mis KO ») ; la
// carte qui porte l'effet comprise si elle correspond
export const koOwnCharCost = (spec: CharSpec, n = 1): Cost => {
  const list = (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => matches(s, c, spec) && canBeKO(s, c.uid, 'effect', p)).map((c) => c.uid);
  let label: string | undefined;
  return {
    get label() { return (label ??= `mettre KO ${n} de tes ${describeSpec(n > 1 ? 'Personnages' : 'Personnage', spec)}`); },
    can: (s, p) => list(s, p).length >= n,
    pay: (ctx) => {
      for (let i = 0; i < n; i++) {
        const options = list(ctx.s, ctx.me);
        if (!options.length) return false;
        const answer = ctx.ask({
          prompt: `Personnage à mettre KO${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
          options: options.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
          tag: 'trashOwn',
        });
        if (!koCharacter(ctx.s, Number(answer.split(':')[1]), 'effect', ctx.me, ctx.num)) return false;
      }
      return true;
    },
  };
};

// « Placer N de vos Personnages ... / 1 Lieu ... au-dessous du deck de son propriétaire » (coût) : ses propres cartes ;
// la carte devient publique (comme selfToDeckBottom)
export const bottomOwnCost = (n: number, what: 'CHARACTER' | 'STAGE', spec: CharSpec): Cost => {
  const list = (s: GameState, p: PlayerId) => (what === 'STAGE' ? (s.players[p].stage ? [s.players[p].stage!] : []) : s.players[p].chars)
    .filter((c) => matches(s, c, spec)).map((c) => c.uid);
  let label: string | undefined;
  return {
    get label() { return (label ??= `placer ${n} de tes ${describeSpec(what === 'STAGE' ? 'Lieu' : n > 1 ? 'Personnages' : 'Personnage', spec)} au-dessous de ton deck`); },
    can: (s, p) => list(s, p).length >= n,
    pay: (ctx) => {
      for (let i = 0; i < n; i++) {
        const options = list(ctx.s, ctx.me);
        if (!options.length) return false;
        const uid = options.length === 1 ? options[0] : Number(ctx.ask({
          prompt: `Carte à placer au-dessous de ton deck${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
          options: options.map((u) => ({ id: `card:${u}`, label: describe(ctx.s, u), uid: u })),
          tag: 'trashOwn',
        }).split(':')[1]);
        const f = removeFromField(ctx.s, uid, 'deckBottom');
        if (!f) return false;
        log(ctx.s, ctx.me, `place ${def(f.card.num).name} au-dessous de son deck`);
        if (!f.stage) emit(ctx.s, { type: 'leave', player: ctx.me, uid, num: f.card.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
      }
      return true;
    },
  };
};

// « Renvoyer N de vos Personnages ... dans la main de leur propriétaire » (coût ; la carte qui porte l'effet comprise si
// elle correspond). returnOwnChar de bricks.ts reste celle d'un Personnage sans filtre.
export const returnOwnChars = (n: number, spec: CharSpec): Cost => {
  const list = (s: GameState, p: PlayerId) => s.players[p].chars.filter((c) => matches(s, c, spec)).map((c) => c.uid);
  let label: string | undefined;
  return {
    get label() { return (label ??= `renvoyer ${n} de tes ${describeSpec(n > 1 ? 'Personnages' : 'Personnage', spec)} dans ta main`); },
    can: (s, p) => list(s, p).length >= n,
    pay: (ctx) => {
      for (let i = 0; i < n; i++) {
        const options = list(ctx.s, ctx.me);
        if (!options.length) return false;
        const answer = ctx.ask({
          prompt: `Personnage à renvoyer dans ta main${n > 1 ? ` (${i + 1}/${n})` : ''} :`,
          options: options.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })),
          tag: 'returnOwn',
        });
        if (!removeByEffect(ctx, Number(answer.split(':')[1]), 'hand')) return false;
      }
      return true;
    },
  };
};
