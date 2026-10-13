// FAMILLE DU LEADER SABO (phase 4E) : cartes rouges et noires {Armée révolutionnaire} et {Dressrosa} jouables en format
// Standard, codées d'après leur texte officiel (VF, ou VO pour celles qui n'existent qu'en anglais), pour donner de vrais
// choix à l'éditeur de decks. Chaque condition se vérifie dans la partie (n'importe quel Leader). Les choix
// d'interprétation sont dans game/docs/interpretations.md.
import {
  RA, addMod, canPlayCharacters, chooseUpTo1, def, discardFromHand, drawAndDiscard, fieldCost, findField, hasType, knownFirst,
  log, lookTopPick, playCharacter, playFromHandFree, power, uniqueByNum,
} from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, GameState, PlayerId } from '../types.ts';
import {
  activateEventFromHand, all, bothCosts, card, chooseOne, costMod, discardCost, drawCards, effect, giveDon, ko, koOppStage, koTotalPower,
  keepRested, leaderType, lifeAtMost, lookTopPlay, oppChar, oppDiscards, oppHandAtLeast, ownChar, ownLeader, ownLeaderOrChar,
  playFromHand, playFromTrash, powerMod, restDon, restLeaderOrStage, restSelf, searchTop, selfToDeckBottom, seq, trashAtLeast,
  trashSelf, trashToBottomCost, trashToHand, trashTop, untilMyNextEnd, when, withCost, type Effect,
} from './bricks.ts';
import { counterBoost } from './common.ts';

const DR = 'Dressrosa';  // {Dressrosa}
const raLeader = leaderType(RA);
const raBonus = (n: number) => (s: GameState, p: PlayerId) => (raLeader(s, p, -1) ? n : 0);
const eventsInTrash = (s: GameState, p: PlayerId) => s.players[p].trash.filter((c) => def(c.num).category === 'EVENT').length;
const counterOn = (amount: number, source: string): Effect => effect((ctx) => counterBoost(ctx, amount, source));

// « Jouez jusqu'à 1 carte Personnage ... de votre main ou de votre Défausse » (Koala EB03-042)
function playFromHandOrTrash(ctx: EffectCtx, eligible: (c: Card) => boolean, prompt: string) {
  if (!canPlayCharacters(ctx.s, ctx.me)) return;
  const P = ctx.s.players[ctx.me];
  const ok = (c: Card) => eligible(c) && canPlayCharacters(ctx.s, ctx.me, c.num);
  const fromHand = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter(ok)));
  const fromTrash = uniqueByNum(P.trash.filter(ok));
  if (!fromHand.length && !fromTrash.length) return;
  const answer = ctx.ask({
    prompt,
    options: [
      ...fromHand.map((c) => ({ id: `hand:${c.uid}`, label: `${def(c.num).name} (main)`, uid: c.uid, num: c.num })),
      ...fromTrash.map((c) => ({ id: `trash:${c.uid}`, label: `${def(c.num).name} (Défausse)`, uid: c.uid, num: c.num })),
      { id: 'none', label: 'Aucun' },
    ],
    tag: 'playFree',
  });
  if (answer === 'none') return;
  const zone = answer.startsWith('hand:') ? P.hand : P.trash;
  const [picked] = zone.splice(zone.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
  playCharacter(ctx, ctx.me, picked);
}

// « Jusqu'à 1 de vos Personnages {Armée révolutionnaire} gagne +2000 jusqu'à la fin de votre prochain tour » (KEEP OUT)
const keepOut: Effect = {
  run: (ctx) => {
    const list = ctx.s.players[ctx.me].chars.filter((c) => hasType(c.num, RA)).map((c) => c.uid);
    const uid = chooseUpTo1(ctx, list, 'KEEP OUT : Personnage {Armée révolutionnaire} qui gagne +2000 jusqu’à la fin de ton prochain tour :', 'ownPower');
    if (uid === null) return;
    addMod(ctx.s, { uid, stat: 'power', amount: 2000, until: untilMyNextEnd(ctx.s, ctx.me), source: 'KEEP OUT' });
    log(ctx.s, ctx.me, `${def(findField(ctx.s, uid)!.card.num).name} gagne +2000 de puissance jusqu’à la fin de son prochain tour (KEEP OUT)`);
  },
  useful: (s, p) => s.players[p].chars.some((c) => hasType(c.num, RA)),
};

// Galaxy Wink : +2000 à un {Armée révolutionnaire}, puis −1000 à un Personnage adverse
const galaxyWink = seq(powerMod(ownChar({ type: RA }), 2000, 'turn', 'Galaxy Wink'), powerMod(oppChar(), -1000, 'turn', 'Galaxy Wink'));
// Souffle du dragon : KO d'un Personnage de 3000 ou moins et d'un Lieu de coût 1 ou moins
const dragonBreath = seq(ko(oppChar({ powerMax: 3000 }), 'Souffle du dragon'), koOppStage(1, 'Souffle du dragon'));
// Fire Fist (OP05-019) : −4000, puis avec 2 Vies ou moins, KO d'un Personnage de 0 ou moins
const fireFist = seq(powerMod(oppChar(), -4000, 'turn', 'Fire Fist'), when(lifeAtMost(2), ko(oppChar({ powerMax: 0 }), 'Fire Fist')));
// Commandants réunis : 3 cartes, 1 {Armée révolutionnaire} autre que lui, le reste dans la Défausse
const captains = searchTop(3, 1, { type: RA, notName: 'Captains Assembled' }, 'une carte {Armée révolutionnaire} autre que [Commandants réunis]', 'trash');
// « Épuisez ce Personnage et 1 de vos Leaders ou Lieux {Dressrosa} » (Momonosuké, Chopper, Nami, Brook OP10)
const restWithDressrosa = () => bothCosts(restSelf(), restLeaderOrStage(DR));

export const FAM_SABO: Record<string, CardBehavior> = {
  // ---------- Rouge ----------

  // Sabo (EB02-002) : [Activation : Principale] s'épuiser : un autre {Armée révolutionnaire} +2000 pour le tour
  'EB02-002': card({
    activateMain: {
      label: 'Sabo : s’épuiser pour donner +2000 à un autre Personnage {Armée révolutionnaire}',
      cost: restSelf(),
      effect: powerMod(ownChar({ type: RA, notName: 'Sabo' }), 2000, 'turn', 'Sabo'),
    },
  }),

  // Emporio Ivankov (OP05-004) : [Activation : Principale] [Une fois par tour] avec 7000 de puissance ou plus, jouer de sa
  // main un {Armée révolutionnaire} de 5000 ou moins autre que lui
  'OP05-004': card({
    activateMain: {
      label: 'Emporio Ivankov : jouer un Personnage {Armée révolutionnaire} de 5000 ou moins de ta main',
      once: true,
      condition: (s, _p, self) => power(s, self) >= 7000,
      effect: playFromHand({ type: RA, powerMax: 5000, notName: 'Emporio.Ivankov' }, 'Emporio Ivankov'),
    },
  }),

  // Koala (OP05-006) : [Jouée] avec un Leader {Armée révolutionnaire}, −3000 à un Personnage adverse
  'OP05-006': card({ onPlay: when(raLeader, powerMod(oppChar(), -3000, 'turn', 'Koala')) }),

  // Sabo (OP05-007) : [Jouée] KO de jusqu'à 2 Personnages adverses de 4000 de puissance au total ou moins
  'OP05-007': card({ onPlay: koTotalPower(oppChar(), 4000, 2, 'Sabo') }),

  // Belo Betty (OP05-015) : [Jouée] 5 cartes du dessus, 1 {Armée révolutionnaire} autre qu'elle
  'OP05-015': card({ onPlay: searchTop(5, 1, { type: RA, notName: 'Belo Betty' }, 'une carte {Armée révolutionnaire} autre que [Belo Betty]') }),

  // Emporio Energy Hormone : [Contre] +3000, puis jouer un {Armée révolutionnaire} de 5000 ou moins de sa main ;
  // [Déclenchement] ce dernier seulement
  'OP05-018': card({
    onCounter: seq(counterOn(3000, 'Emporio Energy Hormone'), playFromHand({ type: RA, powerMax: 5000 }, 'Emporio Energy Hormone')),
    onTrigger: playFromHand({ type: RA, powerMax: 5000 }, 'Emporio Energy Hormone'),
  }),

  // Fire Fist (OP05-019) : [Principale] et [Déclenchement]
  'OP05-019': card({ onMain: fireFist, onTrigger: fireFist }),

  // Four Thousand-Brick Fist : [Principale] +2000 à son Leader ou un Personnage, puis KO d'un Personnage adverse de 2000 ou
  // moins ; [Déclenchement] +1000
  'OP05-020': card({
    onMain: seq(powerMod(ownLeaderOrChar(), 2000, 'turn', 'Four Thousand-Brick Fist'), ko(oppChar({ powerMax: 2000 }), 'Four Thousand-Brick Fist')),
    onTrigger: powerMod(ownLeaderOrChar(), 1000, 'turn', 'Four Thousand-Brick Fist'),
  }),

  // Quartier général de l'Armée révolutionnaire (Lieu) : [Activation : Principale] défausser 1 carte et épuiser ce Lieu :
  // 3 cartes du dessus, 1 {Armée révolutionnaire}
  'OP05-021': card({
    activateMain: {
      label: 'Quartier général : défausser 1 carte et épuiser ce Lieu pour chercher une carte {Armée révolutionnaire}',
      cost: bothCosts(discardCost(1), restSelf()),
      effect: searchTop(3, 1, { type: RA }, 'une carte {Armée révolutionnaire}'),
    },
  }),

  // Inazuma (OP06-002) : [Exil] avec 7000 de puissance ou plus
  'OP06-002': { keywordAura: (s, _p, src, target, k) => k === 'Banish' && target.uid === src.uid && power(s, src.uid) >= 7000 },

  // Emporio Ivankov (OP06-003) : [Jouée] 3 cartes du dessus, jouer un {Armée révolutionnaire} de 5000 ou moins
  'OP06-003': card({ onPlay: lookTopPlay(3, { type: RA, powerMax: 5000 }, 'Emporio Ivankov') }),

  // Raise Max : [Activation : Principale] se placer au-dessous du deck : −3000 à un Personnage adverse
  'OP06-016': card({
    activateMain: {
      label: 'Raise Max : se placer au-dessous de ton deck pour donner −3000 à un Personnage adverse',
      cost: selfToDeckBottom(),
      effect: powerMod(oppChar(), -3000, 'turn', 'Raise Max'),
    },
  }),

  // Monkey D. Dragon (OP07-015) : [Initiative] ; [Jouée] jusqu'à 2 DON!! épuisées à son Leader ou un Personnage
  'OP07-015': card({ onPlay: giveDon(ownLeaderOrChar(), 2, 'Monkey D. Dragon') }),

  // Galaxy Wink : [Principale] et [Déclenchement]
  'OP07-016': card({ onMain: galaxyWink, onTrigger: galaxyWink }),

  // Souffle du dragon : [Principale] et [Déclenchement]
  'OP07-017': card({ onMain: dragonBreath, onTrigger: dragonBreath }),

  // KEEP OUT : [Contre] et [Déclenchement]
  'OP07-018': card({ onCounter: keepOut, onTrigger: keepOut }, {
    counterUseful: (s, p, target) => s.players[p].chars.some((c) => c.uid === target && hasType(c.num, RA)),
  }),

  // Cavendish (OP14-004) : [Initiative] avec 5000 de puissance ou plus
  'OP14-004': { rush: (s, _p, c) => power(s, c.uid) >= 5000 },

  // Bartolomeo (OP14-011) : [DON!! x2] [Bloqueur]
  'OP14-011': { blocker: (_s, _p, c) => c.don >= 2 },

  // Cavendish (OP15-006) : +2000 avec 4 Événements ou plus dans sa Défausse
  'OP15-006': { selfPower: (s, p) => (eventsInTrash(s, p) >= 4 ? 2000 : 0) },

  // Bartolomeo (OP15-014) : s'il devait être mis KO, défausser 1 Événement à la place ; [Jouée] activer un Événement
  // {Dressrosa} de coût de base 3 ou moins de sa main
  'OP15-014': card({ onPlay: activateEventFromHand({ type: DR, baseCostMax: 3 }, 'Bartolomeo') }, {
    koReplace: {
      label: 'Défausser 1 Événement de ta main',
      condition: (s, p) => s.players[p].hand.some((c) => def(c.num).category === 'EVENT'),
      apply: (s, p, self, ctx) => {
        if (discardFromHand(ctx, p, 1, 'Bartolomeo : Événement à défausser à la place du KO :', (c) => def(c.num).category === 'EVENT')) {
          log(s, p, `${def(self.num).name} n'est pas mis KO (Événement défaussé à la place)`);
        }
      },
    },
  }),

  // Barrier Bulls : [Principale] piocher 1 et Leader +1000 jusqu'à la fin du prochain tour adverse ; [Déclenchement]
  // −4000 à un Personnage adverse
  'OP15-019': card({
    onMain: seq(drawCards(1), powerMod(ownLeader(), 1000, 'oppNextEnd', 'Barrier Bulls')),
    onTrigger: powerMod(oppChar(), -4000, 'turn', 'Barrier Bulls'),
  }),

  // Poing ardent (OP15-020) : [Principale] Leader +3000, −8000 à un Personnage adverse jusqu'à la fin du prochain tour
  // adverse, puis défausser 2 cartes : KO d'un Personnage adverse de 0 ou moins
  'OP15-020': card({
    onMain: seq(
      powerMod(ownLeader(), 3000, 'turn', 'Poing ardent'),
      powerMod(oppChar(), -8000, 'oppNextEnd', 'Poing ardent'),
      withCost(discardCost(2), ko(oppChar({ powerMax: 0 }), 'Poing ardent'), 'Poing ardent'),
    ),
  }),

  // « Regarde-moi bien, Ace !! » : −3 de coût en main avec 4 Événements ou plus dans sa Défausse ; [Principale] et
  // [Contre] −3000 à un Personnage adverse
  'OP15-021': card({
    onMain: powerMod(oppChar(), -3000, 'turn', 'Regarde-moi bien, Ace !!'),
    onCounter: powerMod(oppChar(), -3000, 'turn', 'Regarde-moi bien, Ace !!'),
  }, {
    handCost: (s, p) => (eventsInTrash(s, p) >= 4 ? -3 : 0),
    counterUseful: (s, p, target) => {
      const b = s.battle;
      return Boolean(b && b.target === target && findField(s, b.attacker)?.player !== p && !findField(s, b.attacker)?.leader);
    },
  }),

  // Sabo (P-044) : [DON!! x1] +2000 avec 4 cartes ou moins en main
  'P-044': { selfPower: (s, p, c) => (c.don >= 1 && s.players[p].hand.length <= 4 ? 2000 : 0) },

  // Koala (P-069) : [Activation : Principale] [Une fois par tour] 1 DON!! épuisée à son Leader ou un Personnage
  'P-069': card({
    activateMain: { label: 'Koala : donner 1 DON!! épuisée à ton Leader ou à 1 de tes Personnages', once: true, effect: giveDon(ownLeaderOrChar(), 1, 'Koala') },
  }),

  // ---------- Noir ----------

  // Scarlet : [Activation : Principale] se placer dans la Défausse : jouer épuisé un {Dressrosa} de coût 3 ou moins autre
  // qu'elle, puis −2 de coût à un Personnage adverse
  'EB01-042': card({
    activateMain: {
      label: 'Scarlet : se placer dans ta Défausse pour jouer un {Dressrosa} de coût 3 ou moins, puis −2 de coût à un Personnage adverse',
      cost: trashSelf(),
      effect: seq(playFromHand({ type: DR, costMax: 3, notName: 'Scarlet' }, 'Scarlet', { rested: true }), costMod(oppChar(), -2, 'turn', 'Scarlet')),
    },
  }),

  // Trafalgar Law (EB02-045) : [Bloqueur] ; [Jouée] placer 2 cartes de sa Défausse sous son deck : au choix, piocher 1
  // carte, ou (adversaire à 5 cartes ou plus) l'adversaire défausse 1 carte
  'EB02-045': card({
    onPlay: withCost(trashToBottomCost(2), chooseOne('Trafalgar Law', [
      { label: 'Piocher 1 carte', effect: drawCards(1) },
      { label: 'Ton adversaire (5 cartes ou plus en main) défausse 1 carte', effect: when(oppHandAtLeast(5), oppDiscards(1)) },
    ]), 'Trafalgar Law'),
  }),

  // Koala (EB03-042) : +4 de coût avec un Leader {Armée révolutionnaire} ; [Tour adverse] [En cas de KO] jouer de sa main
  // ou de sa Défausse un {Armée révolutionnaire} de coût 6 ou moins autre qu'elle, ou une [Nico Robin] de coût 6 ou moins
  'EB03-042': card({
    onKO: effect((ctx) => playFromHandOrTrash(ctx, (c) => {
      const d = def(c.num);
      return d.category === 'CHARACTER' && (d.cost ?? 0) <= 6 && ((d.types.includes(RA) && !d.names.includes('Koala')) || d.names.includes('Nico Robin'));
    }, 'Koala : jouer un {Armée révolutionnaire} de coût 6 ou moins (ou une [Nico Robin]) de ta main ou de ta Défausse :')),
  }, { selfCost: raBonus(4), onKOCondition: (s, owner) => s.active !== owner }),

  // Rebecca (EB03-048) : [Bloqueur] ; [Jouée] 5 cartes du dessus, 1 Lieu {Dressrosa}, puis jouer de sa main un Lieu
  // {Dressrosa} de coût 1
  'EB03-048': card({
    onPlay: seq(
      searchTop(5, 1, { type: DR, category: 'STAGE' }, 'un Lieu {Dressrosa}'),
      effect((ctx) => {
        playFromHandFree(ctx, (c) => def(c.num).category === 'STAGE' && hasType(c.num, DR) && def(c.num).cost === 1, 'Rebecca : jouer un Lieu {Dressrosa} de coût 1 de ta main :');
      }),
    ),
  }),

  // Ginney : [Activation : Principale] s'épuiser : avec 2 Personnages de coût 8 ou plus en jeu, +1000 à un Leader ou
  // Personnage {Armée révolutionnaire}
  'EB04-045': card({
    activateMain: {
      label: 'Ginney : s’épuiser pour donner +1000 à ton Leader ou un Personnage {Armée révolutionnaire} (2 Personnages de coût 8 ou plus en jeu)',
      cost: restSelf(),
      effect: when(
        (s) => s.players.flatMap((P) => P.chars).filter((c) => fieldCost(s, c.uid) >= 8).length >= 2,
        powerMod(ownLeaderOrChar({ type: RA }), 1000, 'turn', 'Ginney'),
      ),
    },
  }),

  // Soldat unijambiste : [Activation : Principale] se placer dans la Défausse : −3 de coût à un Personnage adverse
  'OP05-081': card({
    activateMain: { label: 'Soldat unijambiste : se placer dans ta Défausse pour donner −3 de coût à un Personnage adverse', cost: trashSelf(), effect: costMod(oppChar(), -3, 'turn', 'Soldat unijambiste') },
  }),

  // Mansherry : [Activation : Principale] ➀, s'épuiser et placer 2 cartes de sa Défausse sous son deck : ajouter à sa main
  // un Personnage noir de coût 3 à 5 de sa Défausse
  'OP05-088': card({
    activateMain: {
      label: 'Mansherry : épuiser 1 DON!!, s’épuiser et placer 2 cartes de ta Défausse sous ton deck pour reprendre un Personnage noir de coût 3 à 5',
      cost: bothCosts(restDon(1), restSelf(), trashToBottomCost(2)),
      effect: trashToHand({ color: 'Black', category: 'CHARACTER', costMin: 3, costMax: 5 }, 'Mansherry'),
    },
  }),

  // Rebecca (OP05-091) : [Bloqueur] ; [Jouée] ajouter à sa main un Personnage noir de coût 3 à 7 autre qu'elle de sa
  // Défausse, puis jouer épuisé un Personnage noir de coût 3 ou moins de sa main
  'OP05-091': card({
    onPlay: seq(
      trashToHand({ color: 'Black', category: 'CHARACTER', costMin: 3, costMax: 7, notName: 'Rebecca' }, 'Rebecca'),
      playFromHand({ color: 'Black', costMax: 3 }, 'Rebecca', { rested: true }),
    ),
  }),

  // Haute Couture Patch★Work : [Principale] −3 de coût à un Personnage adverse, puis un Personnage adverse de coût 0 ne se
  // redressera pas ; [Déclenchement] piocher 2, défausser 1
  'OP05-094': card({
    onMain: seq(costMod(oppChar(), -3, 'turn', 'Haute Couture Patch★Work'), keepRested(oppChar({ costMax: 0 }), 'Haute Couture Patch★Work', 1)),
    onTrigger: effect((ctx) => drawAndDiscard(ctx, 2, 1)),
  }),

  // Dragon Claw : [Contre] +4000, puis avec 15 cartes ou plus dans sa Défausse, KO d'un Personnage adverse de coût 4 ou
  // moins
  'OP05-095': card({ onCounter: seq(counterOn(4000, 'Dragon Claw'), when(trashAtLeast(15), ko(oppChar({ costMax: 4 }), 'Dragon Claw'))) }),

  // Sai : +2000 avec un Leader {Dressrosa} redressé
  'OP06-088': { selfPower: (s, p) => (def(s.players[p].leader.num).types.includes(DR) && !s.players[p].leader.rested ? 2000 : 0) },

  // Sabo (OP07-118) : [Jouée] défausser 1 carte : KO d'un Personnage adverse de coût 5 ou moins et d'un de coût 3 ou moins
  'OP07-118': card({
    onPlay: withCost(discardCost(1), seq(ko(oppChar({ costMax: 5 }), 'Sabo'), ko(oppChar({ costMax: 3 }), 'Sabo')), 'Sabo'),
  }),

  // Usopp (OP10-081) : [Jouée] épuiser son Leader ou Lieu {Dressrosa} : KO d'un Personnage adverse de coût 2 ou moins, puis
  // 2 cartes du dessus de son deck dans sa Défausse
  'OP10-081': card({ onPlay: withCost(restLeaderOrStage(DR), seq(ko(oppChar({ costMax: 2 }), 'Usopp'), trashTop(2)), 'Usopp') }),

  // Momonosuké Kozuki (OP10-083) : [Activation : Principale] s'épuiser avec son Leader ou Lieu {Dressrosa} : −2 de coût
  'OP10-083': card({
    activateMain: { label: 'Momonosuké : s’épuiser avec ton Leader ou Lieu {Dressrosa} pour donner −2 de coût à un Personnage adverse', cost: restWithDressrosa(), effect: costMod(oppChar(), -2, 'turn', 'Momonosuké Kozuki') },
  }),

  // Jesus Burgess (OP10-085) : [DON!! x1] [Initiative] avec 8 cartes ou plus dans sa Défausse
  'OP10-085': { rush: (s, p, c) => c.don >= 1 && s.players[p].trash.length >= 8 },

  // Tony-Tony Chopper (OP10-087) : [Activation : Principale] s'épuiser avec son Leader ou Lieu {Dressrosa} : l'adversaire
  // (5 cartes ou plus en main) défausse 1 carte, puis 2 cartes du dessus de son deck dans sa Défausse
  'OP10-087': card({
    activateMain: { label: 'Chopper : s’épuiser avec ton Leader ou Lieu {Dressrosa} pour faire défausser 1 carte', cost: restWithDressrosa(), effect: seq(when(oppHandAtLeast(5), oppDiscards(1)), trashTop(2)) },
  }),

  // Nami (OP10-088) : idem, piocher 1 carte
  'OP10-088': card({
    activateMain: { label: 'Nami : s’épuiser avec ton Leader ou Lieu {Dressrosa} pour piocher 1 carte', cost: restWithDressrosa(), effect: seq(drawCards(1), trashTop(2)) },
  }),

  // Franky (OP10-090) : [Bloqueur] ; [En cas de KO] jouer épuisé un {Dressrosa} de coût 3 ou moins de sa Défausse
  'OP10-090': card({ onKO: playFromTrash({ type: DR, costMax: 3 }, 'Franky', { rested: true }) }),

  // Brook (OP10-091) : idem, KO d'un Personnage adverse de coût 1 ou moins
  'OP10-091': card({
    activateMain: { label: 'Brook : s’épuiser avec ton Leader ou Lieu {Dressrosa} pour mettre KO un Personnage adverse de coût 1 ou moins', cost: restWithDressrosa(), effect: seq(ko(oppChar({ costMax: 1 }), 'Brook'), trashTop(2)) },
  }),

  // Roronoa Zoro (OP10-095) : [Jouée] épuiser son Leader ou Lieu {Dressrosa} : KO d'un Personnage adverse de coût 4 ou
  // moins, puis 2 cartes du dessus de son deck dans sa Défausse
  'OP10-095': card({ onPlay: withCost(restLeaderOrStage(DR), seq(ko(oppChar({ costMax: 4 }), 'Roronoa Zoro'), trashTop(2)), 'Roronoa Zoro') }),

  // Gum Gum Rhino Schneider : [Principale] un {Dressrosa} +2000, puis avec 10 cartes ou plus dans sa Défausse, il gagne
  // [Exil] ; [Déclenchement] piocher 2, défausser 1
  'OP10-097': card({
    onMain: {
      run: (ctx) => {
        const list = ctx.s.players[ctx.me].chars.filter((c) => hasType(c.num, DR)).map((c) => c.uid);
        const uid = chooseUpTo1(ctx, list, 'Gum Gum Rhino Schneider : Personnage {Dressrosa} qui gagne +2000 pour le tour :', 'ownPower');
        if (uid === null) return;
        const who = def(findField(ctx.s, uid)!.card.num).name;
        addMod(ctx.s, { uid, stat: 'power', amount: 2000, until: 'turn', source: 'Gum Gum Rhino Schneider' });
        log(ctx.s, ctx.me, `${who} gagne +2000 de puissance pour le tour (Gum Gum Rhino Schneider)`);
        if (ctx.s.players[ctx.me].trash.length >= 10) {
          addMod(ctx.s, { uid, stat: 'keyword', keyword: 'Banish', amount: 0, until: 'turn', source: 'Gum Gum Rhino Schneider' });
          log(ctx.s, ctx.me, `${who} gagne [Exil] pour le tour (Gum Gum Rhino Schneider)`);
        }
      },
      useful: (s, p) => s.players[p].chars.some((c) => hasType(c.num, DR)),
    },
    onTrigger: effect((ctx) => drawAndDiscard(ctx, 2, 1)),
  }),

  // Monkey D. Luffy (OP10-118) : une fois par tour, pas mis KO par un effet adverse ; [En attaquant] placer 3 cartes de sa
  // Défausse sous son deck : l'adversaire (5 cartes ou plus en main) défausse 1 carte
  'OP10-118': card({
    whenAttacking: withCost(trashToBottomCost(3), when(oppHandAtLeast(5), oppDiscards(1)), 'Monkey D. Luffy'),
  }, {
    attackUseful: () => false,
    replaceRemoval: {
      oncePerTurn: true,
      onlyKo: true,
      label: () => 'Monkey D. Luffy : ne pas être mis KO (une fois par tour)',
      condition: (_s, _p, self, victim) => victim.uid === self.uid,
      apply: (s, p, self) => { log(s, p, `${def(self.num).name} n'est pas mis KO (une fois par tour)`); },
    },
  }),

  // Emporio Ivankov (OP12-084) : [Bloqueur] ; [Jouée] avec un Leader {Armée révolutionnaire}, 3 cartes du dessus de son
  // deck dans sa Défausse
  'OP12-084': card({ onPlay: when(raLeader, trashTop(3)) }),

  // Corbeau (OP12-085) : +3 de coût avec un Leader {Armée révolutionnaire} ; [En attaquant] dans ce cas, l'adversaire (5
  // cartes ou plus en main) défausse 1 carte
  'OP12-085': card({ whenAttacking: when(all(raLeader, oppHandAtLeast(5)), oppDiscards(1)) }, { selfCost: raBonus(3) }),

  // Koala (OP12-086) : [Jouée] avec un Leader {Armée révolutionnaire}, 3 cartes du dessus, 1 {Armée révolutionnaire} autre
  // qu'elle ou 1 [Nico Robin], le reste dans la Défausse
  'OP12-086': card({
    onPlay: when(raLeader, effect((ctx) => {
      lookTopPick(ctx, 3, 1, (n) => (def(n).types.includes(RA) && !def(n).names.includes('Koala')) || def(n).names.includes('Nico Robin'),
        'une carte {Armée révolutionnaire} autre que [Koala], ou une [Nico Robin]', 'trash');
    }, (s, p) => s.players[p].deck.length > 0)),
  }),

  // Hack (OP12-089) : avec un Leader {Armée révolutionnaire}, [Bloqueur] et +4 de coût ; [En cas de KO] dans ce cas, KO
  // d'un Personnage adverse de coût de base 4 ou moins
  'OP12-089': card({ onKO: when(raLeader, ko(oppChar({ baseCostMax: 4 }), 'Hack')) }, {
    blocker: (s, p) => raLeader(s, p, -1),
    selfCost: raBonus(4),
  }),

  // Monkey D. Dragon (OP12-094) : [Jouée] placer 3 cartes {Armée révolutionnaire} de sa Défausse sous son deck : avec un
  // Leader {Armée révolutionnaire}, jouer un Personnage de coût 6 ou moins de sa Défausse
  'OP12-094': card({
    onPlay: withCost(trashToBottomCost(3, { type: RA }), when(raLeader, playFromTrash({ costMax: 6 }, 'Monkey D. Dragon')), 'Monkey D. Dragon'),
  }),

  // Lindbergh (OP12-095) : +4 de coût avec un Leader {Armée révolutionnaire} ; [Jouée] piocher 1, défausser 1
  'OP12-095': card({ onPlay: effect((ctx) => drawAndDiscard(ctx, 1, 1)) }, { selfCost: raBonus(4) }),

  // Ursus Shock : [Principale] KO d'un Personnage adverse de coût 4 ou moins (6 ou moins avec un Personnage de coût 8 ou
  // plus) ; [Déclenchement] piocher 1, et 1 carte du dessus du deck dans la Défausse
  'OP12-096': card({
    onMain: when((s, p) => s.players[p].chars.some((c) => fieldCost(s, c.uid) >= 8), ko(oppChar({ costMax: 6 }), 'Ursus Shock'), ko(oppChar({ costMax: 4 }), 'Ursus Shock')),
    onTrigger: seq(drawCards(1), trashTop(1)),
  }),

  // Commandants réunis : [Principale] et [Déclenchement]
  'OP12-097': card({ onMain: captains, onTrigger: captains }),

  // Sabo (OP13-120) : [Bloqueur] ; [Activation : Principale] [Une fois par tour] un de ses Personnages +2 de coût jusqu'à
  // la fin du prochain tour adverse, puis 1 DON!! épuisée à son Leader
  'OP13-120': card({
    activateMain: {
      label: 'Sabo : +2 de coût à un de tes Personnages, puis 1 DON!! épuisée à ton Leader',
      once: true,
      effect: seq(costMod(ownChar(), 2, 'oppNextEnd', 'Sabo'), giveDon(ownLeader(), 1, 'Sabo')),
    },
  }),

  // Bartholomew Kuma (OP16-093) : [Jouée] piocher 2, défausser 2, puis 1 DON!! épuisée à son Leader ou un Personnage
  'OP16-093': card({ onPlay: seq(effect((ctx) => drawAndDiscard(ctx, 2, 2)), giveDon(ownLeaderOrChar(), 1, 'Bartholomew Kuma')) }),

  // Sabo (PRB02-014) : −3 de coût en main avec 15 cartes ou plus dans sa Défausse ; [Bloqueur]
  'PRB02-014': { handCost: (s, p) => (s.players[p].trash.length >= 15 ? -3 : 0) },
};

