// OP17 (tâche S1 de l'étape C) : cartes que le traducteur ne comprend pas, codées à la main d'après le texte officiel,
// et morceaux « code à la main » des recettes de recipes/sets/op17.ts (MANUAL_OP17). Les autres cartes d'OP17 codées
// avant l'étape C restent dans leurs fichiers (fam-*.ts, meta-*.ts). Aucun texte de carte ici.
import {
  chooseUpTo1, def, discardFromHand, fieldCost, log, other, power, removeFromField,
} from '../rules.ts';
import type { CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import type { ManualRegistry } from '../recipes/types.ts';
import {
  card, characterCostAtLeast, charsAtLeast, defenderPower, discard, discardCost, effect, ko, lifeFromDeck, oppChar, ownLeaderOrChar, powerMod,
  restCost, restDon, seq, trashFromOppHand, when, withCost, type Cost, type Effect,
} from './bricks.ts';
import { oppChooseOne } from './bricks-play.ts';

// « Vous pouvez [coût] : [effet] » : proposé seulement si l'effet peut servir (convention n° 1000 des recettes)
const mayPay = (cost: Cost, then: Effect, source: string): Effect => when((s, p, self) => then.useful(s, p, self), withCost(cost, then, source));

// Fulgora (OP17-116) : mettre KO jusqu'à 1 Lieu adverse (sans condition de coût)
const koOppStageAny = (source: string): Effect => effect((ctx) => {
  const stage = ctx.s.players[ctx.opp].stage;
  if (!stage) return;
  const uid = chooseUpTo1(ctx, [stage.uid], `${source} : Lieu adverse à mettre KO :`, 'oppKo');
  if (uid === null) return;
  const f = removeFromField(ctx.s, uid, 'trash');
  if (f) log(ctx.s, ctx.opp, `le Lieu ${def(f.card.num).name} est mis KO (${source})`);
}, (s, p) => Boolean(s.players[other(p)].stage));

// Sabre Maser (OP17-117) [Déclenchement] : l'adversaire peut défausser 3 cartes de sa main ; s'il ne le fait pas (ou
// ne le peut pas : moins de 3 cartes), mettre KO jusqu'à 1 de ses Personnages de coût 6 ou moins
const oppMayDiscard3 = (source: string): Effect => {
  const then = ko(oppChar({ costMax: 6 }), source);
  return effect((ctx) => {
    if (ctx.s.players[ctx.opp].hand.length >= 3) {
      const answer = ctx.ask({
        player: ctx.opp,
        prompt: `${source} : défausser 3 cartes de ta main ? Sinon, ton adversaire peut mettre KO 1 de tes Personnages de coût 6 ou moins.`,
        options: [{ id: 'yes', label: 'Défausser 3 cartes' }, { id: 'no', label: 'Non' }],
        tag: 'oppMayDiscard',
      });
      if (answer === 'yes' && discardFromHand(ctx, ctx.opp, 3, 'Carte à défausser :') === 3) {
        log(ctx.s, ctx.opp, `défausse 3 cartes de sa main pour éviter l'effet (${source})`);
        return;
      }
    }
    then.run(ctx);
  }, (s, p, self) => s.players[other(p)].hand.length >= 3 || then.useful(s, p, self));
};

// Mamie Olly (OP17-021) : si un de ses Personnages dont un type inclut « Red-Haired Pirates » devait quitter le terrain
// à cause d'un effet adverse, elle peut épuiser 1 de ses cartes à la place (Leader, Personnage, Lieu ou DON!!)
const REST_ONE = restCost(1, 'cards');
const ownerCtx = (ctx: EffectCtx, owner: PlayerId): EffectCtx => ({
  ...ctx, me: owner, opp: other(owner), ask: (q) => ctx.ask({ ...q, player: q.player ?? owner }),
});
const MAMIE: CardBehavior = {
  replaceRemoval: {
    oncePerTurn: false,
    onlyKo: false,
    label: (_s, _self, victim) => `Mamie Olly : épuiser 1 de tes cartes pour que ${def(victim.num).name} reste sur le terrain`,
    condition: (s, owner, _self, victim) => def(victim.num).types.some((t) => t.includes('Red-Haired Pirates')) && REST_ONE.can(s, owner, -1),
    apply: (_s, owner, _self, _victim, ctx) => {
      REST_ONE.pay(ownerCtx(ctx, owner));
      log(ctx.s, owner, 'Mamie Olly : une carte épuisée à la place');
    },
  },
};

// Monkey D. Luffy (OP17-079, Leader) : ses Personnages de coût 12 ou plus ont [Bloqueur] (coût du moment : le calcul du
// coût ne lit pas les mots-clés, l'effet ne tourne pas en rond)
const LUFFY: CardBehavior = {
  keywordAura: (s: GameState, p: PlayerId, _src, target, k) => k === 'Blocker' && s.players[p].chars.some((c) => c.uid === target.uid)
    && fieldCost(s, target.uid) >= 12,
};

const LINLIN = 'Charlotte Linlin';
export const OP17: Record<string, CardBehavior> = {
  // Mamie Olly : remplacement ci-dessus
  'OP17-021': MAMIE,
  // Monkey D. Luffy (Leader) : effet permanent ci-dessus
  'OP17-079': LUFFY,
  // Charlotte Linlin (Leader) : [En attaquant] défausser 1 carte : l'adversaire choisit l'effet appliqué
  'OP17-099': card({
    whenAttacking: mayPay(discardCost(1), oppChooseOne(LINLIN, [
      { label: '1. Il défausse 1 carte de sa main, puis ajoute jusqu’à 1 carte du dessus de son deck à sa Vie', effect: seq(discard(1), lifeFromDeck()) },
      { label: '2. Il défausse 1 carte de ta main (au hasard)', effect: trashFromOppHand(1, LINLIN) },
    ]), LINLIN),
  }),
  // Fulgora : [Principale] épuiser 2 DON!! : mettre KO jusqu'à 1 Lieu adverse ; [Contre] avec 2 Personnages ou plus ayant
  // un [Déclenchement], la carte attaquée gagne +4000 pour le combat
  'OP17-116': card({
    onMain: mayPay(restDon(2), koOppStageAny('Fulgora'), 'Fulgora'),
    onCounter: when(charsAtLeast(2, { trigger: true }), defenderPower(4000, 'Fulgora')),
  }),
  // Sabre Maser : [Contre] jusqu'à 1 de ses [Charlotte Linlin] gagne +3000 pour le combat ; [Déclenchement] ci-dessus
  'OP17-117': card({
    onCounter: powerMod(ownLeaderOrChar({ name: LINLIN }), 3000, 'battle', 'Sabre Maser'),
    onTrigger: oppMayDiscard3('Sabre Maser'),
  }),
};

// ---------- Morceaux « code à la main » des recettes (recipes/sets/op17.ts) ----------

export const MANUAL_OP17: ManualRegistry = {
  // Shanks (OP17-020, Leader) : coût « défausser 1 carte de sa main ou épuiser 1 de ses DON!! » (au choix)
  'OP17-020': {
    costs: {
      discardOrRestDon: {
        canPay: (ctx: EffectCtx) => discardCost(1).can(ctx.s, ctx.me, ctx.source) || restDon(1).can(ctx.s, ctx.me, ctx.source),
        pay: (ctx: EffectCtx) => {
          const options = [
            ...(discardCost(1).can(ctx.s, ctx.me, ctx.source) ? [{ id: 'discard', label: 'Défausser 1 carte de ta main' }] : []),
            ...(restDon(1).can(ctx.s, ctx.me, ctx.source) ? [{ id: 'don', label: 'Épuiser 1 DON!!' }] : []),
          ];
          if (!options.length) return false;
          const answer = options.length === 1 ? options[0].id : ctx.ask({ prompt: 'Shanks : quel coût payer ?', options, tag: 'costChoice' });
          return answer === 'discard' ? discardCost(1).pay(ctx) : restDon(1).pay(ctx);
        },
      },
    },
  },
  // Rockstar (OP17-034) : le Leader adverse a 6000 de puissance ou plus
  'OP17-034': {
    conds: { oppLeader6000: (ctx: EffectCtx) => power(ctx.s, ctx.s.players[ctx.opp].leader.uid) >= 6000 },
  },
  // Franky (OP17-090), Brook (OP17-091) : « s'il y a un Personnage de coût 12 ou plus » (sur l'un ou l'autre terrain). Lu
  // sur le coût seulement : la condition de la recette (filtre de Personnages) calcule aussi la puissance de chaque
  // Personnage, la carte comprise, dont l'effet permanent relirait la condition (la partie tournait en rond)
  'OP17-090': { conds: { cost12: (ctx: EffectCtx) => characterCostAtLeast(12)(ctx.s, ctx.me, ctx.source) } },
  'OP17-091': { conds: { cost12: (ctx: EffectCtx) => characterCostAtLeast(12)(ctx.s, ctx.me, ctx.source) } },
};
