// EB02 (étape C, tâche S9) : les cartes que le traducteur ne comprend pas, ou qu'il comprend mal, codées à la main
// d'après le texte officiel (VO et VF, jamais recopié). Le reste du set est en recettes (recipes/sets/eb02.ts). Choix
// d'interprétation : game/docs/interpretations.md, section « EB02 et OP10 (tâche S9) ».
import { canPlayCharacters, def, discardFromHand, donOnField, may, other, playCharacter, playFromHandFree, uniqueByNum } from '../rules.ts';
import type { Card, CardBehavior, EffectCtx, FieldCard, GameEvent, GameState, PlayerId } from '../types.ts';
import {
  card, donOnFieldAtLeast, effect, leaderKeyword, lookTopArrange, oppChar, rest, searchTop, seq, when, type Effect,
} from './bricks.ts';
import { isNamed } from './common.ts';

// « Jouez jusqu'à 1 [nom] de votre main » quand ce nom est celui d'un Lieu (Zou, Galley-La Company) : le traducteur lit
// « Personnage » (le compilateur refuse ce nom, garde-fou de la vague S-1), d'où le code à la main (comme EB03-013)
const playNamedFromHand = (name: string, source: string): Effect => effect((ctx) => {
  playFromHandFree(ctx, (c) => isNamed(c.num, name), `${source} : jouer jusqu’à 1 [${name}] de ta main :`);
}, (s, p) => s.players[p].hand.some((c) => isNamed(c.num, name)));

// « Si vous avez 3 cartes DON!! ou plus, regardez 7 cartes, révélez jusqu'à 1 [Lieu] et ajoutez-la à votre main. Puis,
// placez le reste au-dessous et jouez jusqu'à 1 [Lieu] de votre main » : la condition ne couvre pas le « Puis »
// (règle de portée des conditions, interprétations « Vérifiés avec le texte anglais »)
const searchThenPlayStage = (name: string, source: string): Effect => seq(
  when(donOnFieldAtLeast(3), searchTop(7, 1, { name }, `un [${name}]`)),
  playNamedFromHand(name, source),
);

// GERMA 66 : « Personnage {GERMA 66} de 4000 de puissance ou moins » à défausser, puis un Personnage de 5000 à 7000 de
// puissance portant le même nom dans la Défausse
const GERMA = 'GERMA 66';
const germaInHand = (c: Card) => def(c.num).category === 'CHARACTER' && def(c.num).types.includes(GERMA) && (def(c.num).power ?? 0) <= 4000;
const sameNameTarget = (trashed: string) => (c: Card) => {
  const d = def(c.num);
  return d.category === 'CHARACTER' && (d.power ?? 0) >= 5000 && (d.power ?? 0) <= 7000 && d.names.some((n) => def(trashed).names.includes(n));
};
const germaDon = (s: GameState, p: PlayerId) => donOnField(s, p) <= donOnField(s, other(p));
// l'effet peut-il servir ? (convention n° 1000 : le coût n'est proposé que si un Personnage peut être joué)
const germaUseful = (s: GameState, p: PlayerId) => germaDon(s, p) && canPlayCharacters(s, p)
  && s.players[p].hand.some((h) => germaInHand(h) && s.players[p].trash.some((t) => sameNameTarget(h.num)(t) && canPlayCharacters(s, p, t.num)));
const germa66: Effect = effect((ctx) => {
  const { s, me } = ctx;
  const P = s.players[me];
  if (!germaUseful(s, me)) return;
  if (!may(ctx, 'GERMA 66 : défausser 1 carte Personnage {GERMA 66} de 4000 de puissance ou moins de ta main ?')) return;
  const before = new Set(P.trash.map((c) => c.uid));
  if (!discardFromHand(ctx, me, 1, 'GERMA 66 : carte Personnage {GERMA 66} de 4000 de puissance ou moins à défausser :', germaInHand)) return;
  const trashed = P.trash.find((c) => !before.has(c.uid))!;
  if (!germaDon(s, me) || !canPlayCharacters(s, me)) return;
  const fits = sameNameTarget(trashed.num);
  const options = uniqueByNum(P.trash.filter((c) => fits(c) && canPlayCharacters(s, me, c.num)));
  if (!options.length) return;
  const pick = ctx.ask({
    prompt: `GERMA 66 : jouer jusqu’à 1 Personnage [${def(trashed.num).name}] de 5000 à 7000 de puissance de ta Défausse :`,
    options: [...options.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (${def(c.num).power})`, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucun' }],
    tag: 'playFree',
  });
  if (pick === 'none') return;
  const [played] = P.trash.splice(P.trash.findIndex((c) => c.uid === Number(pick.split(':')[1])), 1);
  playCharacter(ctx, me, played, { from: 'trash' });
}, germaUseful);

// Crocodile : « quand un Personnage adverse est renvoyé dans la main de son propriétaire par un de vos effets » (l'annonce
// « leave » ne dit pas où la carte est allée : elle est alors dans la main de son propriétaire)
const crocodileIf = (s: GameState, owner: PlayerId, _self: FieldCard, e: GameEvent) =>
  s.active === owner && e.player === other(owner) && e.zone === 'character' && e.by === owner && e.cause === 'effect'
  && s.players[e.player].hand.some((c) => c.uid === e.uid);

export const EB02: Record<string, CardBehavior> = {
  // Carrot : [Jouée] avec 3 DON!! ou plus, chercher un [Zou] dans les 7 cartes du dessus ; puis jouer un [Zou] (Lieu) de
  // sa main
  'EB02-013': card({ onPlay: searchThenPlayStage('Zou', 'Carrot') }),

  // Baggy : [Jouée] sans autre Personnage [Baggy], son Leader gagne [Double attaque] pour le tour ; [Déclenchement]
  // épuiser jusqu'à 1 Personnage adverse de coût 4 ou moins
  'EB02-018': card({
    onPlay: when((s, p, self) => !s.players[p].chars.some((c) => c.uid !== self && isNamed(c.num, 'Buggy')),
      leaderKeyword('Double Attack', 'turn', 'Baggy')),
    onTrigger: rest(oppChar({ costMax: 4 }), 'Baggy'),
  }),

  // Crocodile : [Votre tour] [Une fois par tour] quand un de ses effets renvoie un Personnage adverse dans la main de son
  // propriétaire : regarder les 3 cartes du dessus de son deck, les placer au-dessus ou au-dessous dans l'ordre choisi
  'EB02-023': {
    when: [{ on: 'leave', once: 'EB02-023:look', if: crocodileIf, run: (ctx: EffectCtx) => lookTopArrange(3, 'Crocodile').run(ctx) }],
  },

  // Icebarg : comme Carrot, avec [Galley-La Company] (Lieu)
  'EB02-032': card({ onPlay: searchThenPlayStage('Galley-La Company', 'Icebarg') }),

  // Klabautermann : [Bloqueur] s'il a un [Merry Go] (Lieu) sur son terrain. Codé à la main : le traducteur cherche
  // [Merry Go] parmi les Personnages (la recette n'aurait jamais donné [Bloqueur])
  'EB02-033': { blocker: (s, p) => Boolean(s.players[p].stage && isNamed(s.players[p].stage!.num, 'Merry Go')) },

  // GERMA 66 : [Principale] défausser 1 Personnage {GERMA 66} de 4000 de puissance ou moins : avec autant de DON!! ou moins
  // que l'adversaire sur le terrain, jouer de sa Défausse un Personnage de 5000 à 7000 de puissance portant le même nom
  'EB02-039': card({ onMain: germa66 }),
};

// Rien de codé à la main n'est appelé par une recette d'EB02 (sortie « manual », 01-contrats.md § 15.2)
export const MANUAL_EB02 = {};
