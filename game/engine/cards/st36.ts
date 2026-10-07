// DECK POUR DÉBUTANT -JAUNE Eustass "Captain" Kidd- [ST-36] : effets codés d'après le texte officiel français
import {
  addMod, addTopDeckToLife, canBeRested, chooseUpTo1, def, drawAndDiscard, fieldCards, fieldCost, giveRestedDon, hasType,
  leaderHasType, lifeToHand, log, lookTopPick, may, myChars, restByEffect, removeByEffect, setActive, uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import { costAtMost, drawLog, isCharacter, isNamed, koOpp, mayDiscard, playCharFromHand, playTriggerCard, restOpp } from './common.ts';

const SN = 'Supernovas';  // {Supernovae}
const KIDD = 'Eustass"Captain"Kid';
const snLeader = (s: GameState, p: PlayerId) => leaderHasType(s, p, SN);
const lifeLeq = (s: GameState, p: PlayerId) => s.players[p].life.length <= s.players[p === 0 ? 1 : 0].life.length;

// Cartes de Vie retournables : celle du dessus et/ou celle du dessous, face visible (faceUp) ou cachée
function lifeEnds(ctx: EffectCtx, faceUp: boolean): ('top' | 'bottom')[] {
  const life = ctx.s.players[ctx.me].life;
  if (!life.length) return [];
  const ends: ('top' | 'bottom')[] = [];
  if (Boolean(life[0].faceUp) === faceUp) ends.push('top');
  if (life.length > 1 && Boolean(life[life.length - 1].faceUp) === faceUp) ends.push('bottom');
  return ends;
}

// Coût « retournez 1 carte du dessus ou du dessous de votre Vie face visible / cachée » : renvoie false si non payé
function flipLife(ctx: EffectCtx, toFaceUp: boolean, prompt: string, tag: string): boolean {
  const ends = lifeEnds(ctx, !toFaceUp);
  if (!ends.length) return false;
  const label = (e: 'top' | 'bottom') => `Retourner la carte ${e === 'top' ? 'du dessus' : 'du dessous'} de ma Vie face ${toFaceUp ? 'visible' : 'cachée'}`;
  const answer = ctx.ask({ prompt, options: [...ends.map((e) => ({ id: e, label: label(e) })), { id: 'no', label: 'Non' }], tag });
  if (answer === 'no') return false;
  const life = ctx.s.players[ctx.me].life;
  const card = answer === 'top' ? life[0] : life[life.length - 1];
  card.faceUp = toFaceUp;
  log(ctx.s, ctx.me, `retourne la carte ${answer === 'top' ? 'du dessus' : 'du dessous'} de sa Vie face ${toFaceUp ? 'visible' : 'cachée'}${toFaceUp ? ` (${def(card.num).name})` : ''}`);
  return true;
}

const lookSupernovae = (ctx: EffectCtx) => {
  lookTopPick(ctx, 5, 1, (n) => isCharacter(n) && hasType(n, SN), 'un Personnage {Supernovae}');
};

export const ST36: Record<string, CardBehavior> = {
  // Leader Kidd : [Fin de votre tour] retourner la Vie du dessus face visible : redressez 1 Personnage {Supernovae} de
  // coût 3 à 8, qui gagne [Bloqueur] jusqu'à la fin du prochain tour adverse
  'OP10-099': {
    endOfTurn: (ctx) => {
      const { s } = ctx;
      const P = s.players[ctx.me];
      const candidates = myChars(ctx, (c) => hasType(c.num, SN) && fieldCost(s, c.uid) >= 3 && fieldCost(s, c.uid) <= 8);
      if (!P.life.length || P.life[0].faceUp || !candidates.length) return;
      if (!may(ctx, 'Kidd (Leader) : retourner face visible la carte du dessus de ta Vie pour redresser un Personnage {Supernovae} de coût 3 à 8, qui gagne [Bloqueur] ?', 'mayKiddLeader')) return;
      P.life[0].faceUp = true;
      log(s, ctx.me, `retourne la carte du dessus de sa Vie face visible (${def(P.life[0].num).name})`);
      const target = chooseUpTo1(ctx, candidates, 'Personnage à redresser (il gagne [Bloqueur] jusqu’à la fin du prochain tour adverse) :', 'ownReady');
      if (target === null) return;
      setActive(s, ctx.me, target);
      addMod(s, { uid: target, stat: 'blocker', amount: 0, until: s.turn + 1, source: 'Eustass "Captain" Kidd' });
    },
  },

  // Killer : [Votre tour] [Jouée] avec un Leader {Équipage de Kidd}, la carte du dessus du deck au-dessus de la Vie ;
  // [Déclenchement] si l'adversaire a 3 Vies ou moins, jouez cette carte
  'ST36-002': {
    onPlay: (ctx) => {
      if (ctx.s.active === ctx.me && leaderHasType(ctx.s, ctx.me, 'Kid Pirates')) addTopDeckToLife(ctx.s, ctx.me);
    },
    onTrigger: (ctx) => {
      if (ctx.s.players[ctx.opp].life.length <= 3) playTriggerCard(ctx);
    },
  },

  // Apoo : [Déclenchement] piochez 1 carte, puissance de base du Leader {Supernovae} à 7000 pour le tour
  'ST36-003': {
    onTrigger: (ctx) => {
      drawLog(ctx, 1);
      const leader = ctx.s.players[ctx.me].leader;
      if (hasType(leader.num, SN)) {
        addMod(ctx.s, { uid: leader.uid, stat: 'basePower', amount: 7000, until: 'turn', source: 'Scratchmen Apoo' });
        log(ctx.s, ctx.me, 'la puissance de base de son Leader passe à 7000 pour le tour');
      }
    },
  },

  // Kidd : [Attaque adverse] [Une fois par tour] retourner 1 Vie face cachée : l'attaque vise un de vos [Eustass "Captain"
  // Kidd] de 5000 de puissance de base ou plus ; [Activation : Principale] [Une fois par tour] retourner 1 Vie face
  // visible : 1 DON!! épuisée au Leader
  'ST36-005': {
    onOpponentAttack: {
      run: (ctx) => {
        const { s } = ctx;
        const self = s.players[ctx.me].chars.find((c) => c.uid === ctx.source);
        const b = s.battle;
        if (!self || !b || self.usedOpt.includes('kidd')) return;
        const targets = fieldCards(s, ctx.me).filter((c) => isNamed(c.num, KIDD) && (def(c.num).power ?? 0) >= 5000 && c.uid !== b.target);
        if (!targets.length || !lifeEnds(ctx, true).length) return;
        if (!flipLife(ctx, false, 'Kidd : retourner une carte de Vie face cachée pour que l’attaque vise un de tes Kidd ?', 'kiddRedirect')) return;
        self.usedOpt.push('kidd');
        const answer = targets.length === 1 ? targets[0].uid : Number(ctx.ask({
          prompt: 'Nouvelle cible de l’attaque :',
          options: targets.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
          tag: 'kiddTarget',
        }).split(':')[1]);
        b.target = answer;
        log(s, ctx.me, `Kidd : l'attaque vise maintenant ${def(fieldCards(s, ctx.me).find((c) => c.uid === answer)!.num).name}`);
      },
    },
    activateMain: {
      oncePerTurn: true,
      label: 'Kidd : retourner une carte de Vie face visible pour donner 1 DON!! épuisée au Leader',
      canActivate: (s, p) => {
        const life = s.players[p].life;
        return s.players[p].donRested > 0 && life.length > 0 && (!life[0].faceUp || !life[life.length - 1].faceUp);
      },
      run: (ctx, card) => {
        card.usedOpt.push('main');
        if (flipLife(ctx, true, 'Kidd : quelle carte de Vie retourner face visible ?', 'lifeSide')) {
          giveRestedDon(ctx.s, ctx.me, ctx.s.players[ctx.me].leader.uid);
        }
      },
    },
  },

  // Cavendish : [En cas de KO] défausser 1 carte : la carte du dessus du deck au-dessus de la Vie
  'ST36-001': {
    onKO: (ctx) => {
      if (mayDiscard(ctx, 'Cavendish : défausser 1 carte pour ajouter la carte du dessus de ton deck à ta Vie ?')) addTopDeckToLife(ctx.s, ctx.me);
    },
  },

  // Bartolomeo : [Jouée] défausser 1 carte {Supernovae} : piochez 2 cartes
  'ST36-004': {
    onPlay: (ctx) => {
      if (mayDiscard(ctx, 'Bartolomeo : défausser 1 carte {Supernovae} pour piocher 2 cartes ?', (n) => hasType(n, SN))) drawLog(ctx, 2);
    },
  },

  // Bege : [Jouée] ajouter à la main 1 carte du dessus ou du dessous de la Vie : 1 Personnage {Supernovae} de la main
  // face visible au-dessus de la Vie
  'OP10-103': {
    onPlay: (ctx) => {
      const { s } = ctx;
      const P = s.players[ctx.me];
      if (!P.life.length) return;
      const answer = ctx.ask({
        prompt: 'Capone Bege : ajouter à ta main une carte de ta Vie pour placer un Personnage {Supernovae} de ta main face visible sur ta Vie ?',
        options: [
          { id: 'top', label: 'Oui, la carte du dessus de ma Vie' },
          ...(P.life.length > 1 ? [{ id: 'bottom', label: 'Oui, la carte du dessous de ma Vie' }] : []),
          { id: 'no', label: 'Non' },
        ],
        tag: 'begeLife',
      });
      if (answer === 'no') return;
      lifeToHand(s, ctx.me, answer as 'top' | 'bottom');
      const candidates = uniqueByNum(P.hand.filter((c) => isCharacter(c.num) && hasType(c.num, SN)));
      const uid = chooseUpTo1(ctx, candidates.map((c) => c.uid), 'Personnage {Supernovae} à placer face visible au-dessus de ta Vie :', 'toLife');
      if (uid === null) return;
      const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === uid), 1);
      P.life.unshift({ ...card, faceUp: true } as Card);
      log(s, ctx.me, `place ${def(card.num).name} face visible au-dessus de sa Vie (${P.life.length} Vie)`);
    },
  },

  // Hawkins : [En cas de KO] la carte du dessus de la Vie adverse va dans sa Défausse ; [Déclenchement] pioche 2, défausse 1
  'OP10-109': {
    onKO: (ctx) => {
      const O = ctx.s.players[ctx.opp];
      const card = O.life.shift();
      if (!card) return;
      O.trash.push({ uid: card.uid, num: card.num });
      log(ctx.s, ctx.me, `place dans la Défausse adverse la carte du dessus de sa Vie (${def(card.num).name}) : il lui reste ${O.life.length} Vie`);
    },
    onTrigger: (ctx) => drawAndDiscard(ctx, 2, 1),
  },

  // Luffy : [Jouée] 5 cartes du dessus, 1 carte {Supernovae} autre que Luffy
  'OP10-111': {
    onPlay: (ctx) => { lookTopPick(ctx, 5, 1, (n) => hasType(n, SN) && !isNamed(n, 'Monkey.D.Luffy'), 'une carte {Supernovae} autre que Luffy'); },
  },

  // X-Drake : [Activation : Principale] s'épuiser : si vous n'avez pas plus de Vie que l'adversaire, épuisez 1 Personnage
  // adverse de coût 4 ou moins
  'OP10-114': {
    activateMain: {
      oncePerTurn: false,
      label: 'X-Drake : s’épuiser pour épuiser 1 Personnage adverse de coût 4 ou moins',
      canActivate: (s, p, card) => !card.rested && canBeRested(s, card.uid) && lifeLeq(s, p),
      run: (ctx, card) => {
        restByEffect(ctx, card.uid);
        if (lifeLeq(ctx.s, ctx.me)) restOpp(ctx, costAtMost(ctx, 4), 'X-Drake');
      },
    },
  },

  // Zoro : [En cas de KO] avec un Leader {Supernovae}, jouez épuisé 1 Personnage {Supernovae} de coût 4 ou moins ;
  // [Déclenchement] KO 1 Personnage adverse de coût 1 ou moins et ajoutez cette carte à votre main
  'OP12-113': {
    onKO: (ctx) => {
      if (!snLeader(ctx.s, ctx.me)) return;
      playCharFromHand(ctx, (c) => hasType(c.num, SN) && (def(c.num).cost ?? 0) <= 4, 'Zoro : jouer épuisé jusqu’à 1 Personnage {Supernovae} de coût 4 ou moins :', { rested: true });
    },
    onTrigger: (ctx) => {
      koOpp(ctx, costAtMost(ctx, 1), 'Roronoa Zoro');
      if (ctx.trigger) {
        ctx.trigger.moved = true;
        ctx.s.players[ctx.me].hand.push(ctx.trigger.card);
        log(ctx.s, ctx.me, 'ajoute Roronoa Zoro à sa main');
      }
    },
  },

  // « Le plus libre des hommes au monde... » : [Principale] 5 cartes du dessus, 1 Personnage {Supernovae} ;
  // [Déclenchement] activez l'effet [Principale]
  'OP13-116': {
    onMain: lookSupernovae,
    onTrigger: lookSupernovae,
  },

  // Bonney : [Jouée] avec un Leader {Supernovae} et pas plus de Vie que l'adversaire, 1 Personnage adverse de coût 4 ou
  // moins face visible au-dessus ou au-dessous de la Vie de son propriétaire
  'P-085': {
    onPlay: (ctx) => {
      const { s } = ctx;
      if (!snLeader(s, ctx.me) || !lifeLeq(s, ctx.me)) return;
      const target = chooseUpTo1(ctx, s.players[ctx.opp].chars.filter(costAtMost(ctx, 4)).map((c) => c.uid),
        'Jewelry Bonney : Personnage adverse à placer face visible dans la Vie de son propriétaire (il gagne 1 Vie) :', 'oppToLife');
      if (target === null) return;
      const side = ctx.ask({
        prompt: 'Placer ce Personnage au-dessus ou au-dessous de sa Vie ?',
        options: [{ id: 'lifeBottom', label: 'Au-dessous de sa Vie' }, { id: 'lifeTop', label: 'Au-dessus de sa Vie' }],
        tag: 'lifeSideOpp',
      });
      removeByEffect(ctx, target, side as 'lifeTop' | 'lifeBottom');
    },
  },

  // Law : [Déclenchement] avec un Leader {Supernovae} et 5 Vies ou moins au total, jouez cette carte
  'P-088': {
    onTrigger: (ctx) => {
      const { s } = ctx;
      if (snLeader(s, ctx.me) && s.players[0].life.length + s.players[1].life.length <= 5) playTriggerCard(ctx);
    },
  },
};
