// OP03 ROUGE (tâche 1.8 du plan « Aventure ») : les cartes rouges d'OP03 « Pillars of Strength », autour du Leader
// Portgas.D.Ace et de l'« Équipage de Barbe Blanche ». OP03 n'a pas de version française complète : le texte de référence
// est l'anglais officiel (effectEn), relu avec le texte français quand il existe. Chaque condition se vérifie dans la
// partie. Speed Jill, Namur et Fossa n'ont que des mots-clés (jouables d'office). Les choix d'interprétation sont dans
// game/docs/interpretations.md (section « OP03 rouge »).
import { addMod, attackAbility, def, emit, findField, knownFirst, log, uniqueByNum } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId, WhenEffect } from '../types.ts';
import {
  blockerBan, bothCosts, card, discardCost, drawCards, giveDon, ko, koImmuneInBattle, leaderKeyword, leaderNamed, leaderPower,
  leaderTypeIncludes, myTurn, oppChar, oppLeaderOrChar, ownLeaderOrChar, playFromHand, playSelfFromTrash, powerMod, restDon,
  restSelf, searchTop, selfDon, selfPowerMod, seq, trashAtEndOfTurn, trashOwnCharCost, when, withCost, type Cost, type Effect,
} from './bricks.ts';

const WB = 'Whitebeard Pirates';  // type incluant « Équipage de Barbe Blanche »
const aceLeader = leaderNamed('Portgas.D.Ace');
const wbLeader = leaderTypeIncludes(WB);
const eventOrStage = (num: string) => def(num).category === 'EVENT' || def(num).category === 'STAGE';

// Son Leader peut-il encore attaquer ce tour-ci ? (un bonus « pour le tour » ne sert qu'à ça pendant son tour)
const leaderCanAttack = (s: GameState, p: PlayerId) => s.active === p && attackAbility(s, p, s.players[p].leader).can;

// Un effet qui ne sert qu'à faire attaquer plus fort son Leader : utile seulement s'il peut encore attaquer
const forLeaderAttack = (e: Effect): Effect => ({ run: e.run, useful: (s, p) => leaderCanAttack(s, p) });

// Leader Portgas.D.Ace : quand il attaque ou est attaqué, défausser autant d'Événements et de Lieux qu'on veut, un par
// un (« Aucun autre » pour s'arrêter), +1000 pour le combat par carte défaussée. Le bonus compte dès chaque carte : la
// puissance affichée pendant les questions est à jour.
const aceTrash: WhenEffect = {
  on: 'attack',
  if: (s, owner, self, e) => (e.uid === self.uid || e.target === self.uid) && s.players[owner].hand.some((c) => eventOrStage(c.num)),
  run: (ctx) => {
    const P = ctx.s.players[ctx.me];
    let n = 0;
    for (;;) {
      const options = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter((c) => eventOrStage(c.num))));
      if (!options.length) break;
      const answer = ctx.ask({
        prompt: `Portgas.D.Ace : défausser un Événement ou un Lieu de ta main pour +1000 de puissance pendant ce combat${n ? ` (déjà +${n * 1000})` : ''} ?`,
        options: [
          ...options.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })),
          { id: 'none', label: n ? 'Aucun autre' : 'Aucun' },
        ],
        tag: 'discard',
      });
      if (answer === 'none') break;
      const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
      P.trash.push(card);
      n++;
      addMod(ctx.s, { uid: ctx.source, stat: 'power', amount: 1000, until: 'battle', source: 'Portgas.D.Ace' });
      log(ctx.s, ctx.me, `défausse ${def(card.num).name} : Portgas.D.Ace gagne +1000 de puissance pour le combat`);
    }
    if (!n) return;
    P.discardedTurn = ctx.s.turn;
    if (n > 1) log(ctx.s, ctx.me, `Portgas.D.Ace gagne +${n * 1000} de puissance pour le combat (${n} cartes défaussées)`);
    emit(ctx.s, { type: 'discard', player: ctx.me, count: n, by: ctx.me, sourceNum: ctx.num });
  },
};

// Coût « placer 1 de vos Personnages ... dans votre Défausse » : le Personnage quitte le terrain par un effet de son
// joueur, annoncé comme tel (Moby Dick OP08-056 y réagit, comme avec Marshall D. Teach OP13-053)
const announcingLeave = (cost: Cost): Cost => ({
  get label() { return cost.label; },
  can: cost.can,
  pay: (ctx) => {
    const before = ctx.s.players[ctx.me].chars.map((c) => ({ uid: c.uid, num: c.num }));
    const paid = cost.pay(ctx);
    for (const c of before) {
      if (findField(ctx.s, c.uid)) continue;
      emit(ctx.s, { type: 'leave', player: ctx.me, uid: c.uid, num: c.num, zone: 'character', by: ctx.me, cause: 'effect', sourceNum: ctx.num });
    }
    return paid;
  },
});

// Personnage qui sera placé dans la Défausse à la fin du tour (Thatch) : le donner en coût ne coûte rien
const expendable = (s: GameState, uid: number) => s.delayed.some((d) => d.action === 'trashChar' && d.uid === uid && d.turn === s.turn);

// Thatch : +2000 pour le tour, puis dans la Défausse à la fin du tour ; seulement s'il peut encore attaquer
const thatchBoost: Effect = {
  run: seq(selfPowerMod(2000, 'turn', 'Thatch'), trashAtEndOfTurn('Thatch')).run,
  useful: (s, p, self) => {
    const f = findField(s, self);
    return Boolean(f && s.active === p && attackAbility(s, p, f.card).can);
  },
};

// Flame Emperor : KO d'un Personnage adverse de 8000 ou moins, et son Leader gagne [Double attaque] et +3000 pour le tour
const flameEmperor: Effect = seq(
  ko(oppChar({ powerMax: 8000 }), 'Flame Emperor'),
  forLeaderAttack(seq(leaderKeyword('Double Attack', 'turn', 'Flame Emperor'), leaderPower(3000, 'turn', 'Flame Emperor'))),
);

// Fire Fist : KO d'un Personnage adverse de 5000 ou moins et d'un (autre) de 4000 ou moins
const fireFistKo = seq(ko(oppChar({ powerMax: 5000 }), 'Fire Fist'), ko(oppChar({ powerMax: 4000 }), 'Fire Fist'));

// Cross Fire : −4000 à un Personnage adverse pour le tour, avec un Leader « Équipage de Barbe Blanche »
const crossFire = when(wbLeader, powerMod(oppChar(), -4000, 'turn', 'Cross Fire'));
// en [Contre], il protège la carte attaquée seulement si l'attaquant est un Personnage (il reçoit le −4000)
const attackerIsChar = (s: GameState) => Boolean(s.battle && findField(s, s.battle.attacker) && !findField(s, s.battle.attacker)!.leader);

export const OP03_ROUGE: Record<string, CardBehavior> = {
  // Leader Portgas.D.Ace : quand il attaque ou est attaqué, défausser des Événements et des Lieux, +1000 par carte
  'OP03-001': { when: [aceTrash] },

  // Adio : [DON!! x1] [En attaquant] l'adversaire ne peut pas activer le [Bloqueur] d'un Personnage de 2000 ou moins
  'OP03-002': card({ whenAttacking: when(selfDon(1), blockerBan({ powerMax: 2000 }, 'Adio')) }, { attackUseful: () => false }),

  // Izo : [Jouée] 5 cartes du dessus, une carte « Équipage de Barbe Blanche » autre que [Izo] en main, le reste dessous
  'OP03-003': card({ onPlay: searchTop(5, 1, { typeIncludes: WB, notName: 'Izo' }, 'une carte dont le type contient « Équipage de Barbe Blanche » autre que [Izo]') }),

  // Curiel : n'attaque pas de Leader le tour où il est joué ; [DON!! x1] [Initiative]
  'OP03-004': {
    rush: (_s, _p, self) => self.don >= 1,
    cantAttackLeader: (s, _p, self) => self.playedTurn === s.turn,
  },

  // Thatch : [Activation : Principale] [Une fois par tour] +2000 pour le tour, puis dans la Défausse à la fin du tour
  'OP03-005': card({ activateMain: { label: 'Thatch : +2000 pour le tour (il ira dans ta Défausse à la fin du tour)', once: true, effect: thatchBoost } }),

  // Baggy : pas mis KO en combat par une carte <Tranche> ; [Jouée] 5 cartes du dessus, un Événement rouge en main
  'OP03-008': card({ onPlay: searchTop(5, 1, { color: 'Red', category: 'EVENT' }, 'un Événement rouge') }, {
    cantBeKO: koImmuneInBattle({ attribute: 'Slash' }),
  }),

  // Haruta : [Activation : Principale] [Une fois par tour] 1 DON!! épuisée à son Leader ou un de ses Personnages
  'OP03-009': card({
    activateMain: { label: 'Haruta : donner 1 DON!! épuisée à ton Leader ou à un de tes Personnages', once: true, effect: giveDon(ownLeaderOrChar(), 1, 'Haruta') },
  }),

  // Blamenco : [DON!! x1] [En attaquant] −2000 à un Personnage adverse pour le tour
  'OP03-011': card({ whenAttacking: when(selfDon(1), powerMod(oppChar(), -2000, 'turn', 'Blamenco')) }),

  // Marshall.D.Teach : [En attaquant] placer un de ses Personnages rouges de 4000 ou plus dans la Défausse : piocher 1,
  // puis +1000 pour le combat
  'OP03-012': card({
    whenAttacking: withCost(
      announcingLeave(trashOwnCharCost({ color: 'Red', powerMin: 4000 })),
      seq(drawCards(1), selfPowerMod(1000, 'battle', 'Marshall.D.Teach')),
      'Marshall.D.Teach',
    ),
  }, {
    // une attaque vouée à l'échec ne sert que pour piocher en donnant un Personnage qui partira de toute façon (Thatch)
    attackUseful: (s, p, self) => s.players[p].chars.some((c) => c.uid !== self.uid && expendable(s, c.uid) && def(c.num).colors.includes('Red')),
  }),

  // Marco : [Votre tour] [Jouée] KO d'un Personnage adverse de 3000 ou moins ; [En cas de KO] défausser 1 Événement : se
  // jouer épuisé depuis la Défausse
  'OP03-013': card({
    onPlay: when(myTurn, ko(oppChar({ powerMax: 3000 }), 'Marco')),
    onKO: withCost(discardCost(1, { category: 'EVENT' }), playSelfFromTrash('Marco', { rested: true }), 'Marco'),
  }),

  // Monkey.D.Garp : [En attaquant] jouer un Personnage rouge de coût 1 de sa main
  'OP03-014': card({ whenAttacking: playFromHand({ color: 'Red', costMin: 1, costMax: 1 }, 'Monkey.D.Garp') }),

  // Lim : [Bloqueur] ; [Tour adverse] mis KO : −2000 à un Leader ou Personnage adverse pour le tour
  'OP03-015': card({ onKO: powerMod(oppLeaderOrChar(), -2000, 'turn', 'Lim') }, { onKOCondition: (s, owner) => s.active !== owner }),

  // Flame Emperor : [Principale] avec le Leader [Portgas.D.Ace], KO d'un Personnage adverse de 8000 ou moins, et le Leader
  // gagne [Double attaque] et +3000 pour le tour ; [Déclenchement] KO d'un Personnage adverse de 6000 ou moins
  'OP03-016': card({ onMain: when(aceLeader, flameEmperor), onTrigger: ko(oppChar({ powerMax: 6000 }), 'Flame Emperor') }),

  // Cross Fire : [Principale] / [Contre] avec un Leader « Équipage de Barbe Blanche », −4000 à un Personnage adverse pour
  // le tour ; [Déclenchement] son effet [Principale] (générique)
  'OP03-017': card({ onMain: crossFire, onCounter: crossFire }, {
    counterPower: (s, p) => (wbLeader(s, p, -1) && attackerIsChar(s) ? 4000 : 0),
    counterUseful: (s, p) => wbLeader(s, p, -1) && attackerIsChar(s),
  }),

  // Fire Fist : [Principale] défausser 1 Événement : KO d'un Personnage adverse de 5000 ou moins et d'un de 4000 ou moins ;
  // [Déclenchement] KO d'un Personnage adverse de 5000 ou moins
  'OP03-018': card({
    onMain: withCost(discardCost(1, { category: 'EVENT' }), fireFistKo, 'Fire Fist'),
    onTrigger: ko(oppChar({ powerMax: 5000 }), 'Fire Fist'),
  }, {
    // Fire Fist est encore dans la main quand on se demande s'il servirait : il faut un autre Événement à défausser
    mainUseful: (s, p) => s.players[p].hand.filter((c) => def(c.num).category === 'EVENT').length >= 2 && fireFistKo.useful(s, p, -1),
  }),

  // Fiery Doll : [Principale] son Leader +4000 pour le tour ; [Déclenchement] −10000 à un Leader ou Personnage adverse
  'OP03-019': card({
    onMain: forLeaderAttack(leaderPower(4000, 'turn', 'Fiery Doll')),
    onTrigger: powerMod(oppLeaderOrChar(), -10000, 'turn', 'Fiery Doll'),
  }),

  // Striker (Lieu) : [Activation : Principale] ② et épuiser ce Lieu : avec le Leader [Portgas.D.Ace], 5 cartes du dessus,
  // un Événement en main, le reste dessous
  'OP03-020': card({
    activateMain: {
      label: 'Striker : épuiser 2 DON!! et ce Lieu pour prendre un Événement parmi les 5 cartes du dessus de ton deck',
      cost: bothCosts(restDon(2), restSelf()),
      effect: when(aceLeader, searchTop(5, 1, { category: 'EVENT' }, 'un Événement')),
    },
  }),
};
