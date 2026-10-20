// OP03 BLEUE (tâche 1.10 du plan « Aventure ») : les cartes bleues {East Blue} de Pillars of Strength et Sniperking
// (OP03-122). Autour du Leader Nami (OP03-040), qui gagne quand son deck est vide : beaucoup de cartes placent des
// cartes du dessus du deck dans la Défausse, d'autres deviennent plus fortes avec 20 cartes ou moins dans le deck.
// Codées d'après le texte officiel (VF quand elle existe, sinon VO) ; chaque condition se vérifie dans la partie, sans
// supposer le deck. Les choix d'interprétation sont dans game/docs/interpretations.md (numéros 290 et suivants).
import { findField, log, may, trashTopDeck } from '../rules.ts';
import type { CardBehavior, GameState, PlayerId } from '../types.ts';
import {
  afterDamage, all, anyChar, bottomOfDeck, bounce, card, deckAtMost, defenderPower, discard, discardCost,
  drawCards, effect, leaderNamed, leaderPower, mayTrashTop, oppChar, oppTurn, selfDon, seq, trashThis, trashToHand, when,
  withCost, type Effect,
} from './bricks.ts';

// « [DON!! x1] Quand l'attaque de ce Personnage inflige des dégâts à la Vie adverse, vous pouvez placer N cartes du
// dessus de votre deck dans votre Défausse » (Usopp, Zeff, Bell-mère ; Nami : 1 carte)
const millOnDamage = (n: number, source: string) => afterDamage('self', mayTrashTop(n, source), selfDon(1));

// Gaimon : « vous pouvez placer 3 cartes du dessus de votre deck dans votre Défausse. Si vous le faites, placez ce
// Personnage dans votre Défausse » ; il faut 3 cartes (interprétations 203 et 209). Question 'mayMill' : l'IA n'accepte
// qu'avec un Leader qui gagne à deck vide (Nami), sinon elle perdrait Gaimon et 3 cartes pour rien
const gaimon: Effect = effect((ctx) => {
  const P = ctx.s.players[ctx.me];
  if (P.deck.length < 3 || !findField(ctx.s, ctx.source)) return;
  if (!may(ctx, 'Gaimon : placer 3 cartes du dessus de ton deck dans ta Défausse, puis Gaimon dans ta Défausse ?', 'mayMill')) return;
  trashTopDeck(ctx.s, ctx.me, 3);
  log(ctx.s, ctx.me, `place 3 cartes du dessus de son deck dans sa Défausse (Gaimon, ${P.deck.length} restante${P.deck.length > 1 ? 's' : ''})`);
  trashThis().run(ctx);
});

// Gum Gum Super Marteau : +4000 au Leader seulement (interprétation 294) ; il faut une autre carte en main pour la défausse
const leaderAttacked = (s: GameState, p: PlayerId, target: number) => s.players[p].leader.uid === target;
const otherCardInHand = (s: GameState, p: PlayerId) => s.players[p].hand.length >= 2;

// San Zen Sekai : placer un de ses propres Personnages sous son deck ne sert presque jamais (l'effet le permet : l'IA et
// le coach ne le proposent que s'il y a un Personnage adverse visé)
const oppBottom5 = bottomOfDeck(oppChar({ costMax: 5 }), 'San Zen Sekai');

export const OP03_BLEUE: Record<string, CardBehavior> = {
  // Nami (Leader) : victoire à deck vide « selon les règles » (interprétation 290) ; [DON!! x1] 1 carte après des dégâts
  'OP03-040': { rules: { deckOut: 'win' }, when: [millOnDamage(1, 'Nami')] },
  // Usopp : [Initiative] d'office ; [DON!! x1] 7 cartes après des dégâts
  'OP03-041': card({}, { when: [millOnDamage(7, 'Usopp')] }),
  // Usopp's Pirate Crew : un [Usopp] bleu de sa Défausse (Sniperking compte, interprétation 291)
  'OP03-042': card({ onPlay: trashToHand({ color: 'Blue', name: 'Usopp' }, "Usopp's Pirate Crew") }),
  // Gaimon : quand vous infligez des dégâts (interprétation 292)
  'OP03-043': card({}, { when: [afterDamage('any', gaimon)] }),
  // Kaya : piocher 2, puis défausser 2
  'OP03-044': card({ onPlay: seq(drawCards(2), discard(2)) }),
  // Carne : [Bloqueur] d'office ; [Tour adverse] +3000 avec 20 cartes ou moins dans le deck
  'OP03-045': { selfPower: (s, p, self) => (all(oppTurn, deckAtMost(20))(s, p, self.uid) ? 3000 : 0) },
  // Zeff : [DON!! x1] 7 cartes après des dégâts ; [Jouée] renvoyer un Personnage de coût 3 ou moins, et 2 cartes
  'OP03-047': card({ onPlay: seq(bounce(anyChar({ costMax: 3 }), 'Zeff'), mayTrashTop(2, 'Zeff')) }, { when: [millOnDamage(7, 'Zeff')] }),
  // Nojiko : avec un Leader [Nami], renvoyer un Personnage adverse de coût 5 ou moins
  'OP03-048': card({ onPlay: when(leaderNamed('Nami'), bounce(oppChar({ costMax: 5 }), 'Nojiko')) }),
  // Patty : avec 20 cartes ou moins dans le deck, renvoyer un Personnage de coût 3 ou moins
  'OP03-049': card({ onPlay: when(deckAtMost(20), bounce(anyChar({ costMax: 3 }), 'Patty')) }),
  // Boodle : [Bloqueur] d'office ; [En cas de KO] 1 carte
  'OP03-050': card({ onKO: mayTrashTop(1, 'Boodle') }),
  // Bell-mère : [DON!! x1] 7 cartes après des dégâts ; [En cas de KO] 3 cartes
  'OP03-051': card({ onKO: mayTrashTop(3, 'Bell-mère') }, { when: [millOnDamage(7, 'Bell-mère')] }),
  // Yosaku & Johnny : [DON!! x1] +2000 avec 20 cartes ou moins dans le deck, aussi pendant le tour adverse
  // (interprétation 293)
  'OP03-053': { selfPower: (s, p, self) => (all(selfDon(1), deckAtMost(20))(s, p, self.uid) ? 2000 : 0) },
  // Usopp's Rubber Band of Doom!!! : [Contre] +2000 à la carte attaquée, puis 1 carte ; [Déclenchement] piocher 1, puis
  // 1 carte
  'OP03-054': card({
    onCounter: seq(defenderPower(2000, "Usopp's Rubber Band of Doom!!!"), mayTrashTop(1, "Usopp's Rubber Band of Doom!!!")),
    onTrigger: seq(drawCards(1), mayTrashTop(1, "Usopp's Rubber Band of Doom!!!")),
  }),
  // Gum Gum Super Marteau : [Contre] défausser 1 carte : +4000 à son Leader pour le combat, puis 2 cartes (tout dépend
  // de la défausse, interprétation 210) ; [Déclenchement] renvoyer un Personnage de coût 4 ou moins
  'OP03-055': card({
    onCounter: withCost(discardCost(1), seq(leaderPower(4000, 'battle', 'Gum Gum Super Marteau'), mayTrashTop(2, 'Gum Gum Super Marteau')), 'Gum Gum Super Marteau'),
    onTrigger: bounce(anyChar({ costMax: 4 }), 'Gum Gum Super Marteau'),
  }, {
    counterPower: (s, p, target) => (leaderAttacked(s, p, target) && otherCardInHand(s, p) ? 4000 : 0),
    counterUseful: leaderAttacked,
  }),
  // Riz pilaf de Sanji : [Principale] piocher 2 ; [Déclenchement] « activez l'effet [Principale] » (générique)
  'OP03-056': card({ onMain: drawCards(2) }),
  // San Zen Sekai : [Principale] un Personnage de coût 5 ou moins sous le deck de son propriétaire ; [Déclenchement]
  // coût 3 ou moins
  'OP03-057': card({
    onMain: bottomOfDeck(anyChar({ costMax: 5 }), 'San Zen Sekai'),
    onTrigger: bottomOfDeck(anyChar({ costMax: 3 }), 'San Zen Sekai'),
  }, { mainUseful: (s, p) => oppBottom5.useful(s, p, -1) }),
  // Sniperking (aussi [Usopp]) : renvoyer un Personnage de coût 6 ou moins, puis piocher 2 et défausser 2
  'OP03-122': card({ onPlay: seq(bounce(anyChar({ costMax: 6 }), 'Sniperking'), drawCards(2), discard(2)) }),
};
