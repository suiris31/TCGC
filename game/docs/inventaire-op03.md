# Inventaire d'OP03 et de ST-01 (tâche 1.1 du plan « Aventure »)

Inventaire du 19 octobre 2026, fait sur le catalogue téléchargé (`data/game-catalog.json`). OP03 n'a pas de version
française officielle complète : le texte de référence est l'anglais du catalogue (`effectEn`), relu avec les règles
complètes officielles (version du 28 août 2026). Les remarques sont écrites avec nos mots, sans recopier le texte des
cartes : lis la carte (`effectEn`, `triggerEn`, et le texte français quand il existe) avant de la coder.

**À lire par les tâches 1.8 à 1.14** (et 1.15, 1.16 pour la dernière partie). Les mécaniques nouvelles sont faites et
testées (`game/tests/mechanics-op03.test.ts`) : aucune carte d'OP03 ni de ST-01 ne demande de toucher au moteur.

## Classement

| Classement | Sens |
|---|---|
| d'office | jouable sans code (aucun effet, ou seulement des mots-clés gérés par le moteur) : rien à faire |
| déjà codée | codée dans un autre fichier (réédition) : rien à faire |
| briques | se code avec les briques qui existaient déjà (`cards/bricks.ts`, crochets de `CardBehavior`) |
| briques 1.1 | se code avec des briques ou des mécanismes ajoutés par la tâche 1.1 (liste ci-dessous) |
| sur mesure | demande un peu de code propre à la carte, en réutilisant les briques (la remarque dit quoi) |

Bilan : **140 cartes**, 24 d'office, 1 déjà codée, **115 à faire** (61 briques, 51 briques 1.1, 3 sur mesure).

| Tâche | Cartes | D'office / déjà codées | À faire | Briques | Briques 1.1 | Sur mesure |
|---|---|---|---|---|---|---|
| 1.8 OP03 rouge | 20 | 3 | 17 | 9 | 7 | 1 (Ace Leader) |
| 1.9 OP03 verte (avec Arlong OP03-022) | 19 | 3 | 16 | 9 | 7 | 0 |
| 1.10 OP03 bleue (avec Sniperking OP03-122) | 19 | 2 | 17 | 7 | 10 | 0 |
| 1.11 OP03 violette | 18 | 2 | 16 | 13 | 3 | 0 |
| 1.12 OP03 noire (avec Linlin OP03-077) | 23 | 4 | 19 | 12 | 6 | 1 (Tempest Kick) |
| 1.13 OP03 jaune (avec Katakuri OP03-123) | 24 | 5 | 19 | 4 | 14 | 1 (Pudding) |
| 1.14 ST-01 | 17 | 6 (dont Brook, déjà codée) | 11 | 7 | 4 | 0 |

## Mécaniques et briques ajoutées par la tâche 1.1

Toutes sont décrites en commentaire dans le code et testées avec des cartes de test.

| Nom | Où | Ce que c'est | Cartes |
|---|---|---|---|
| événement `damage` | `types.ts`, `engine.ts` | des dégâts ont été infligés à la Vie d'un Leader : un seul événement par traitement des dégâts (une [Double attaque] fait un événement de 2 dégâts, règles 4-6-2-2 et 10-1-2) ; `by` : qui inflige, `uid` : la carte qui attaque (`cause: 'attack'`) | Nami L, Usopp, Gaimon, Zeff, Bell-mère |
| `afterDamage(who, effet, condition?, once?)` | `bricks.ts` | effet « quand » prêt à mettre dans `when: [...]` : `'self'` « quand l'attaque de cette carte inflige des dégâts », `'any'` « quand vous infligez des dégâts » ; condition lue au moment des dégâts (`selfDon(1)` pour [DON!! x1]) | idem |
| modification `blockerBan` + `blockerBan(limite, source)` | `types.ts`, `rules.ts` (`blockerAllowed`), `engine.ts`, `bricks.ts` | « l'adversaire ne peut pas activer le [Bloqueur] d'un Personnage de X de puissance ou moins / ou plus (ou de coût X ou moins) pendant ce combat », à mettre dans [En attaquant] | Adio, Usopp ST01-002 (Strawberry OP02-101) |
| retrait différé `trashChar` / `bottomChar` + `trashAtEndOfTurn(source)` | `types.ts`, `engine.ts`, `rules.ts` | « placez ce Personnage dans votre Défausse à la fin de ce tour » ; oublié si la carte quitte le terrain avant ; `addDelayed(..., { action: 'bottomChar', uid })` pour « au-dessous du deck à la fin du tour » | Thatch (Helmeppo OP11-092) |
| `CardBehavior.oppCostAura` / `costAura` | `types.ts`, `rules.ts` (`fieldCost`) | modification de coût permanente donnée par une carte aux Personnages adverses / aux siens (comme `oppAura` / `aura` pour la puissance) | Issho (Doll EB04-046, Sengoku P-032, Issho OP04-020) |
| `CardBehavior.cantAttack` | `types.ts`, `rules.ts` (`attackAbility`) | « ce Leader / Personnage ne peut pas attaquer » (permanent, sous condition) | Iceburg L |
| `CardBehavior.cantAttackLeader` | `types.ts`, `rules.ts` (`attackTargets`) | « ne peut pas attaquer de Leader ... » (Curiel : le tour où il est joué) | Curiel |
| modification `attackActive` | `types.ts`, `rules.ts` (`attackTargets`) | « peut aussi attaquer les Personnages redressés », à donner avec `grant(..., { stat: 'attackActive' }, ...)` | (Marine : EB04-050, OP11-082, OP11-084, OP11-119) |
| `CharSpec.vanilla`, `noBaseEffect(d)` | `bricks.ts` | « sans effet de base » : aucun texte de carte, [Déclenchement] compris (règles 2-8-5, 2-11-2) ; un effet annulé ne rend pas une carte « sans effet » (8-2-2) | Helmeppo OP03-091 |
| `CharSpec.donMin` | `bricks.ts` | « ayant N DON!! données ou plus » | (Krieg OP15-001, OP15-038, Mohji OP15-018) |
| `otherThanSelf(cibles)` | `bricks.ts` | « ... autre que celui-ci » pour toutes les briques de cible (`powerMod`, `ko`, `rest`, `giveDon`...) | Jinbe ST01-005 |
| `readySelf()`, `restThis()`, `trashThis()` | `bricks.ts` | effets sur la carte qui porte l'effet : la redresser, l'épuiser, la placer dans la Défausse (les deux derniers « ne servent à rien » seuls : l'IA juge l'effet sur le reste) | Kuro L, Lucci L, Jango, Gaimon |
| `selfPowerMod(X, durée, source)` | `bricks.ts` | « cette carte gagne +X » (sans question ; Leader ou Personnage) | Teach, Thatch, Katakuri L, Oven, Smoothie |
| `selfKeyword(mot-clé, source, 'battle')` | `bricks.ts` | troisième paramètre facultatif : « pendant ce combat » | Kaku OP03-059, Luffy ST01-012 |
| `leaderKeyword(mot-clé, durée, source)` | `bricks.ts` | « votre Leader gagne [Double attaque] » sans question | Flame Emperor |
| `defenderPower(X, source)` | `bricks.ts`, `CardBehavior.counterPower`, IA | [Contre] « jusqu'à 1 de vos Leader ou Personnages gagne +X pendant ce combat » : la carte attaquée, sans question ; **l'IA connaît d'office la valeur de l'Événement** (transmise par `seq`, `when`, `withCost`). Pour un autre [Contre], déclare `counterPower` dans le 2e paramètre de `card()` | Rubber Band, Jet Rafale, Six Pouvoirs Gun, Térébration, Guard Point |
| `mayTrashTop(N, source)` | `bricks.ts`, IA | « vous pouvez placer N cartes du dessus de votre deck dans votre Défausse » (autant qu'il en reste) ; question `mayMill` : l'IA accepte seulement si son Leader gagne à deck vide | bleues |
| `lookTopTrash(N, M, source)` | `bricks.ts` | « regardez N cartes, placez-en jusqu'à M dans la Défausse, le reste au-dessous dans l'ordre de votre choix » | Corgy |
| `lookTopPlay(..., { rest: 'trash' })` | `bricks.ts` | option : les cartes restantes vont dans la Défausse | Air Door |
| `trashOppLife(N)` | `bricks.ts` | « placez dans sa Défausse la carte du dessus de la Vie adverse » (pas des dégâts) | Linlin OP03-114, Tropical Torment |
| `lookLifeArrange(source)` | `bricks.ts`, IA | « regardez la carte du dessus de votre Vie ou de la Vie adverse, laissez-la ou placez-la dessous » ; seul celui qui regarde la connaît ensuite (vue en ligne testée) | Katakuri L, Shirley |
| `toOwnersLife(cibles, source, faceVisible?)` | `bricks.ts` | « ajoutez jusqu'à 1 Personnage ... au-dessus ou au-dessous de la Vie de son propriétaire » | Katakuri OP03-123 |
| `costToZero(cibles, durée, source)` | `bricks.ts` | « le coût de ... devient 0 » (baisse égale au coût du moment) | Helmeppo OP03-091 |
| `playThis(opts?)` | `bricks.ts` | [Déclenchement] « jouez cette carte » sous condition (`when`) ou avec un coût (`withCost`) | Hatchan, Kingbaum, Cracker, Smoothie, Slurp |
| `playSelfFromTrash(source, opts?)` | `bricks.ts` | [En cas de KO] « jouez cette carte depuis votre Défausse (épuisée) » | Marco OP03-013 |
| `keywordWhile(mot-clé, condition)` | `bricks.ts` | pour `CardBehavior.keywordAura` : « [DON!! x1] cette carte gagne [Double attaque] » | Krieg OP03-025, Cracker |
| `koImmuneInBattle({ attribute, without, characters }, condition?)` | `bricks.ts` | pour `CardBehavior.cantBeKO` : « ne peut pas être mis KO en combat par des cartes <Tranche> » (ou « par des Personnages sans <Spécial> ») | Buggy ×2 (Smoker P-025) |
| `giveRestedDonToOwner(cibles, N, source)` | `bricks.ts` | DON!! épuisées données à une carte depuis la zone de Coût de son propriétaire, y compris adverse | (Krieg OP15-008, Buggy OP15-012) |
| coûts `restCost(N, 'characters', spec)`, `trashOwnCharCost(spec, N?)`, `trashLifeCost('top' \| 'both')` | `bricks.ts` | « épuiser N de vos Personnages {East Blue} », « placer 1 de vos Personnages ... dans la Défausse », « placer dans la Défausse la carte du dessus (ou du dessous) de votre Vie » | Kuro L, Out-of-the-Bag, Tooth Attack, Teach, Kingbaum, Chiffon, Colonne foudroyante |
| conditions `deckAtMost`, `deckAtLeast`, `oppLifeAtLeast`, `lessLifeThanOpp`, `characterCostAtMost` | `bricks.ts` | deck de N cartes ou moins, Vie adverse, moins de Vie que l'adversaire, « s'il y a un Personnage de coût 0 » | Carne, Patty, Yosaku & Johnny, Buzz Cut Mochi, Tropical Torment (Marine noire) |

Aides à l'IA ajoutées (`game/ai/`) : réponses aux questions `mayMill`, `lifeLook`, `lifeArrange`, `trashOwn`,
`oppDonTarget` ; `oppToLife` ne vise plus ses propres cartes ; valeur de [Contre] lue dans `counterPower` ; DON!! utiles
sans attaquer pour Curiel, Sanji ST01-004 et Issho, et pendant le tour adverse pour Vergo et Blueno (`prune.ts`). Les
nouvelles étiquettes sont rangées dans `TAG_FAMILY` (`game/rl/features.ts`).

### Conseils communs

- **[Contre] « +X à l'un de vos Leader ou Personnages pendant ce combat »** : `defenderPower(X, source)` (valeur connue de
  l'IA). Un [Contre] qui donne autre chose (« −4000 à un Personnage adverse ») : `powerMod(...)` et `counterPower` dans
  le 2e paramètre de `card()`, sinon l'IA l'estime à 2000.
- **[DON!! xN] [En attaquant]** : `whenAttacking: when(selfDon(N), ...)` ; **[DON!! xN] permanent** : la condition dans
  `selfPower` / `blocker` / `rush` / `keywordAura` (`keywordWhile`) / `cantBeKO`.
- **« [Votre tour] [Jouée] »** : `onPlay: when(myTurn, ...)` (joué par un effet pendant le tour adverse : rien).
- **Nom double** (Sniperking OP03-122 est aussi [Usopp]) : le catalogue donne déjà les deux noms (`names`).
- Un effet qui ne sert qu'à attaquer (« +2000 pour le tour ») : vérifie que son `useful` ne le propose pas quand la carte
  ne peut plus attaquer (Thatch).

## OP03 rouge (tâche 1.8)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-001 | Portgas.D.Ace | Leader | sur mesure | `when` sur `attack` (`e.uid` ou `e.target` = ce Leader), `addMod` pour le combat | quand il attaque ou est attaqué : défausser autant d'Événements et de Lieux qu'on veut (questions successives avec « Aucune autre »), +1000 par carte pour le combat ; aide à l'IA à écrire (combien défausser) |
| OP03-002 | Adio | Personnage | briques 1.1 | `whenAttacking: when(selfDon(1), blockerBan({ powerMax: 2000 }))` | interprétation 201 |
| OP03-003 | Izo | Personnage | briques | `searchTop(5, 1, { typeIncludes: 'Whitebeard Pirates', notName: 'Izo' })` | |
| OP03-004 | Curiel | Personnage | briques 1.1 | `rush` (1 DON!!), `cantAttackLeader` (le tour où il est joué) | |
| OP03-005 | Thatch | Personnage | briques 1.1 | `activateMain` une fois : `seq(selfPowerMod(2000, 'turn'), trashAtEndOfTurn())` | `useful` sur mesure : seulement s'il peut encore attaquer ; interprétation 202 |
| OP03-006 | Speed Jill | Personnage | d'office | | |
| OP03-007 | Namur | Personnage | d'office | | |
| OP03-008 | Baggy | Personnage | briques 1.1 | `cantBeKO: koImmuneInBattle({ attribute: 'Slash' })`, `searchTop(5, 1, { color: 'Red', category: 'EVENT' })` | |
| OP03-009 | Haruta | Personnage | briques | `activateMain` une fois : `giveDon(ownLeaderOrChar(), 1)` | |
| OP03-010 | Fossa | Personnage | d'office | | [Bloqueur] |
| OP03-011 | Blamenco | Personnage | briques | `when(selfDon(1), powerMod(oppChar(), -2000, 'turn'))` en attaquant | |
| OP03-012 | Marshall.D.Teach | Personnage | briques 1.1 | `withCost(trashOwnCharCost({ color: 'Red', powerMin: 4000 }), seq(drawCards(1), selfPowerMod(1000, 'battle')))` | interprétation 206 : il peut se choisir lui-même |
| OP03-013 | Marco | Personnage | briques 1.1 | `onPlay: when(myTurn, ko(oppChar({ powerMax: 3000 })))`, `onKO: withCost(discardCost(1, { category: 'EVENT' }), playSelfFromTrash(..., { rested: true }))` | |
| OP03-014 | Monkey.D.Garp | Personnage | briques | en attaquant `playFromHand({ color: 'Red', costMin: 1, costMax: 1 })` | |
| OP03-015 | Lim | Personnage | briques | `onKO` + `onKOCondition` (tour adverse), `powerMod(oppLeaderOrChar(), -2000, 'turn')` | [Bloqueur] d'office |
| OP03-016 | Flame Emperor | Événement | briques 1.1 | `when(leaderNamed('Portgas.D.Ace'), seq(ko(...8000), leaderKeyword('Double Attack', 'turn'), leaderPower(3000, 'turn')))` ; [Déclenchement] `ko` 6000 | |
| OP03-017 | Cross Fire | Événement | briques | `onMain` et `onCounter` : `when(leaderTypeIncludes('Whitebeard Pirates'), powerMod(oppChar(), -4000, 'turn'))` ; [Déclenchement] générique | `counterPower` : 4000 si l'attaquant est un Personnage |
| OP03-018 | Fire Fist | Événement | briques | `withCost(discardCost(1, { category: 'EVENT' }), seq(ko(...5000), ko(...4000)))` ; [Déclenchement] `ko` 5000 | |
| OP03-019 | Fiery Doll | Événement | briques | `leaderPower(4000, 'turn')` ; [Déclenchement] `powerMod(oppLeaderOrChar(), -10000, 'turn')` | |
| OP03-020 | Striker | Lieu | briques | `activateMain` coût `bothCosts(restDon(2), restSelf())`, `when(leaderNamed('Portgas.D.Ace'), searchTop(5, 1, { category: 'EVENT' }))` | |

## OP03 verte (tâche 1.9)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-021 | Kuro | Leader | briques 1.1 | `activateMain` (pas une fois par tour) coût `bothCosts(restDon(3), restCost(2, 'characters', { type: 'East Blue' }))`, `seq(readySelf(), rest(oppChar({ costMax: 5 })))` | |
| OP03-022 | Arlong | Leader | briques | en attaquant `when(selfDon(2), withCost(restDon(1), playFromHand({ costMax: 4, trigger: true })))` | vert/jaune |
| OP03-023 | Alvida | Personnage | d'office | | |
| OP03-024 | Gin | Personnage | briques | `when(leaderType('East Blue'), rest(oppChar({ costMax: 4 }), ..., 2))` | |
| OP03-025 | Krieg | Personnage | briques 1.1 | `withCost(discardCost(1), ko(oppChar({ rested: true, costMax: 4 }), ..., 2))`, `keywordAura: keywordWhile('Double Attack', selfDon(1))` | |
| OP03-026 | Kuroobi | Personnage | briques | `when(leaderType('East Blue'), rest(oppChar()))` ; [Déclenchement] générique | |
| OP03-027 | Sham | Personnage | briques | `when(leaderType('East Blue'), seq(rest(...2), when(not(charsAtLeast(1, { name: 'Buchi' })), playFromHand({ name: 'Buchi' }))))` | interprétation 207 |
| OP03-028 | Jango | Personnage | briques 1.1 | `chooseOne` : `setActiveTargets(ownLeaderOrChar({ type: 'East Blue', costMax: 6 }))` ou `seq(restThis(), rest(oppChar()))` | interprétation 208 (le Leader peut être redressé) |
| OP03-029 | Chew | Personnage | briques | `ko(oppChar({ rested: true, costMax: 4 }))` ; [Déclenchement] générique | |
| OP03-030 | Nami | Personnage | briques | `searchTop(5, 1, { color: 'Green', type: 'East Blue', notName: 'Nami' })` ; [Déclenchement] générique | |
| OP03-031 | Pearl | Personnage | d'office | | [Bloqueur] |
| OP03-032 | Buggy | Personnage | briques 1.1 | `cantBeKO: koImmuneInBattle({ attribute: 'Slash' })` | |
| OP03-033 | Hatchan | Personnage | briques 1.1 | `onTrigger: when(leaderType('East Blue'), playThis())` | n'est pas « sans effet de base » : il a un [Déclenchement] |
| OP03-034 | Buchi | Personnage | briques | `ko(oppChar({ rested: true, costMax: 2 }))` | |
| OP03-035 | Momoo | Personnage | d'office | | |
| OP03-036 | Out-of-the-Bag | Événement | briques 1.1 | `withCost(restCost(1, 'characters', { type: 'East Blue' }), setActiveTargets(ownLeaderOrChar({ name: 'Kuro' })))` ; [Déclenchement] `ko` épuisé 3 | |
| OP03-037 | Tooth Attack | Événement | briques 1.1 | `withCost(restCost(1, 'characters', { type: 'East Blue' }), ko(oppChar({ rested: true, costMax: 3 })))` ; [Déclenchement] `playFromHand({ costMax: 4, trigger: true })` | |
| OP03-038 | Deathly Poison Gas Bomb MH5 | Événement | briques | `rest(oppChar({ costMax: 2 }), ..., 2)` ; [Déclenchement] `rest` 5 | |
| OP03-039 | One, Two, Jango | Événement | briques | `seq(rest(oppChar({ costMax: 1 })), powerMod(ownChar(), 1000, 'turn'))` ; [Déclenchement] `rest` 4 | |

## OP03 bleue (tâche 1.10)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-040 | Nami | Leader | briques 1.1 | `rules: { deckOut: 'win' }`, `when: [afterDamage('self', mayTrashTop(1), selfDon(1))]` | la victoire à deck vide existait déjà ; interprétation 200 |
| OP03-041 | Usopp | Personnage | briques 1.1 | [Initiative] d'office ; `afterDamage('self', mayTrashTop(7), selfDon(1))` | |
| OP03-042 | Usopp's Pirate Crew | Personnage | briques | `trashToHand({ color: 'Blue', name: 'Usopp' })` | Sniperking compte comme [Usopp] |
| OP03-043 | Gaimon | Personnage | briques 1.1 | `afterDamage('any', withCost(trashTopCost(3), trashThis()))` | interprétations 203 et 209 ; aide à l'IA à affiner (accepter seulement avec un Leader qui gagne à deck vide) |
| OP03-044 | Kaya | Personnage | briques | `seq(drawCards(2), discard(2))` | |
| OP03-045 | Carne | Personnage | briques 1.1 | `selfPower` : +3000 au tour adverse avec `deckAtMost(20)` | [Bloqueur] d'office |
| OP03-046 | Genzo | Personnage | d'office | | |
| OP03-047 | Zeff | Personnage | briques 1.1 | `afterDamage('self', mayTrashTop(7), selfDon(1))` ; `onPlay: seq(bounce(anyChar({ costMax: 3 })), mayTrashTop(2))` | |
| OP03-048 | Nojiko | Personnage | briques | `when(leaderNamed('Nami'), bounce(oppChar({ costMax: 5 })))` | |
| OP03-049 | Patty | Personnage | briques 1.1 | `when(deckAtMost(20), bounce(anyChar({ costMax: 3 })))` | |
| OP03-050 | Boodle | Personnage | briques 1.1 | `onKO: mayTrashTop(1)` | [Bloqueur] d'office |
| OP03-051 | Bell-mère | Personnage | briques 1.1 | `afterDamage('self', mayTrashTop(7), selfDon(1))` ; `onKO: mayTrashTop(3)` | |
| OP03-052 | Merry | Personnage | d'office | | |
| OP03-053 | Yosaku & Johnny | Personnage | briques 1.1 | `selfPower` : +2000 avec 1 DON!! et `deckAtMost(20)` | |
| OP03-054 | Usopp's Rubber Band of Doom!!! | Événement | briques 1.1 | `onCounter: seq(defenderPower(2000), mayTrashTop(1))` ; [Déclenchement] `seq(drawCards(1), mayTrashTop(1))` | |
| OP03-055 | Gum Gum Super Marteau | Événement | briques | `onCounter: withCost(discardCost(1), seq(leaderPower(4000, 'battle'), mayTrashTop(2)))` ; [Déclenchement] `bounce(anyChar({ costMax: 4 }))` | interprétation 210 ; `counterPower` : 4000 seulement si le Leader est attaqué |
| OP03-056 | Riz pilaf de Sanji | Événement | briques | `drawCards(2)` ; [Déclenchement] générique | |
| OP03-057 | San Zen Sekai | Événement | briques | `bottomOfDeck(anyChar({ costMax: 5 }))` ; [Déclenchement] coût 3 | |
| OP03-122 | Sniperking | Personnage | briques | `seq(bounce(anyChar({ costMax: 6 })), drawCards(2), discard(2))` | |

## OP03 violette (tâche 1.11)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-058 | Iceburg | Leader | briques 1.1 | `cantAttack: () => true` ; `activateMain` coût `bothCosts(donMinus(1), restSelf())`, `playFromHand({ type: 'Galley-La Company', costMax: 5 })` | |
| OP03-059 | Kaku | Personnage | briques 1.1 | en attaquant `withCost(donMinus(1), selfKeyword('Banish', ..., 'battle'))` | |
| OP03-060 | Kalifa | Personnage | briques | en attaquant `withCost(donMinus(1), seq(drawCards(2), discard(1)))` | |
| OP03-061 | Kiwi & Mozu | Personnage | d'office | | |
| OP03-062 | Kokoro | Personnage | briques | `searchTop(5, 1, { type: 'Water Seven', notName: 'Kokoro' })` | |
| OP03-063 | Zambai | Personnage | briques | `withCost(donMinus(1), when(leaderType('Water Seven'), drawCards(1)))` | [Bloqueur] d'office ; interprétation 211 |
| OP03-064 | Tilestone | Personnage | briques | `onKO: when(leaderType('Galley-La Company'), addDon(1, 'rested'))` | |
| OP03-065 | Chimney & Gonbe | Personnage | d'office | | [Bloqueur] |
| OP03-066 | Paulie | Personnage | briques | `withCost(restDon(2), seq(addDon(1, 'active'), when(donOnFieldAtLeast(8), ko(oppChar({ costMax: 4 })))))` | |
| OP03-067 | Peepley Lulu | Personnage | briques | en attaquant `when(all(selfDon(1), leaderType('Galley-La Company')), addDon(1, 'rested'))` | |
| OP03-068 | Minozebra | Personnage | briques | [Exil] d'office ; `onKO: when(leaderType('Impel Down'), addDon(1, 'rested'))` | |
| OP03-069 | Minorhinoceros | Personnage | briques | `onKO: when(leaderType('Impel Down'), seq(drawCards(2), discard(1)))` | |
| OP03-070 | Monkey.D.Luffy | Personnage | briques | `withCost(bothCosts(donMinus(1), discardCost(1, { category: 'CHARACTER', costMin: 5, costMax: 5 })), selfKeyword('Rush'))` | |
| OP03-071 | Rob Lucci | Personnage | briques | en attaquant `withCost(donMinus(1), rest(oppChar({ costMax: 5 })))` | |
| OP03-072 | Gum Gum Jet Rafale | Événement | briques 1.1 | `onCounter: withCost(discardCost(1), defenderPower(3000))` ; [Déclenchement] `addDon(1, 'active')` | coût « - » : 0 |
| OP03-073 | Hull Dismantler Slash | Événement | briques | `withCost(donMinus(1), when(leaderType('Water Seven'), ko(oppChar({ costMax: 2 }))))` ; [Déclenchement] générique | |
| OP03-074 | Top Knot | Événement | briques | `withCost(donMinus(2), bottomOfDeck(oppChar({ costMax: 4 })))` ; [Déclenchement] générique | |
| OP03-075 | Galley-La Company | Lieu | briques | `activateMain` coût `restSelf()`, `when(leaderNamed('Iceburg'), addDon(1, 'rested'))` | |

## OP03 noire (tâche 1.12)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-076 | Rob Lucci | Leader | briques 1.1 | `when` sur `ko` (Personnage adverse, son tour, Leader épuisé) : `onceWithCost(clé, discardCost(2), readySelf())` | [Une fois par tour] compté quand le coût est payé |
| OP03-077 | Charlotte Linlin | Leader | briques | en attaquant `when(selfDon(2), withCost(bothCosts(restDon(2), discardCost(1)), when(lifeAtMost(1), lifeFromDeck())))` | noir/jaune |
| OP03-078 | Issho | Personnage | briques 1.1 | `oppCostAura` : −3 pendant son tour avec 1 DON!! ; `when(oppHandAtLeast(6), trashFromOppHand(2))` | interprétation 212 |
| OP03-079 | Vergo | Personnage | briques | `cantBeKO` en combat avec 1 DON!! | |
| OP03-080 | Kaku | Personnage | briques | `withCost(trashToBottomCost(2, { typeIncludes: 'CP' }), ko(oppChar({ costMax: 3 })))` | |
| OP03-081 | Kalifa | Personnage | briques | `seq(drawCards(2), discard(2), costMod(oppChar(), -2, 'turn'))` | |
| OP03-082 | Kumadori | Personnage | d'office | | |
| OP03-083 | Corgy | Personnage | briques 1.1 | `lookTopTrash(5, 2)` | |
| OP03-084 | Jerry | Personnage | d'office | | |
| OP03-085 | Jabra | Personnage | d'office | | |
| OP03-086 | Spandam | Personnage | briques | `when(leaderTypeIncludes('CP'), searchTop(3, 1, { typeIncludes: 'CP', notName: 'Spandam' }, ..., 'trash'))` | |
| OP03-087 | Nero | Personnage | d'office | | |
| OP03-088 | Fukurou | Personnage | briques | `cantBeKO` par un effet | [Bloqueur] d'office |
| OP03-089 | Brandnew | Personnage | briques | `searchTop(3, 1, { type: 'Navy', notName: 'Brannew' }, ..., 'trash')` | nom VO : Brannew |
| OP03-090 | Blueno | Personnage | briques | `blocker` avec 1 DON!! ; `onKO: playFromTrash({ typeIncludes: 'CP', costMax: 4 }, ..., { rested: true })` | |
| OP03-091 | Helmeppo | Personnage | briques 1.1 | `costToZero(oppChar({ vanilla: true }), 'turn')` | interprétations 204 et 205 |
| OP03-092 | Rob Lucci | Personnage | briques | `withCost(trashToBottomCost(2, { typeIncludes: 'CP' }), selfKeyword('Rush'))` | |
| OP03-093 | Wanze | Personnage | briques | `withCost(discardCost(1), when(leaderTypeIncludes('CP'), ko(oppChar({ costMax: 1 }))))` | |
| OP03-094 | Air Door | Événement | briques 1.1 | `when(leaderTypeIncludes('CP'), lookTopPlay(5, { typeIncludes: 'CP', costMax: 5 }, ..., { rest: 'trash' }))` ; [Déclenchement] `playFromTrash({ color: 'Black', costMax: 3 })` | |
| OP03-095 | Soap Sheep | Événement | briques | `costMod(oppChar(), -2, 'turn', ..., 2)` ; [Déclenchement] `oppDiscards(1)` | |
| OP03-096 | Tempest Kick Sky Slicer | Événement | sur mesure | un seul choix parmi les Personnages adverses de coût 0 et le Lieu adverse de coût 3 ou moins (`koOppStage` pour le Lieu) ; [Déclenchement] `drawCards(2)` | |
| OP03-097 | Six Pouvoirs Gun | Événement | briques 1.1 | `onCounter: withCost(discardCost(1), defenderPower(3000))` ; [Déclenchement] `seq(drawCards(1), ko(oppChar({ costMax: 1 })))` | coût « - » : 0 |
| OP03-098 | Enies Lobby | Lieu | briques | `activateMain` coût `restSelf()`, `when(leaderTypeIncludes('CP'), costMod(oppChar(), -2, 'turn'))` ; [Déclenchement] générique | |

## OP03 jaune (tâche 1.13)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| OP03-099 | Charlotte Katakuri | Leader | briques 1.1 | en attaquant `when(selfDon(1), seq(lookLifeArrange(), selfPowerMod(1000, 'battle')))` | interprétation 216 |
| OP03-100 | Kingbaum | Personnage | briques 1.1 | `onTrigger: withCost(trashLifeCost('both'), playThis())` | interprétation 213 |
| OP03-101 | Camie | Personnage | d'office | | |
| OP03-102 | Sanji | Personnage | briques | en attaquant `when(selfDon(2), withCost(lifeToHandCost('both'), lifeFromDeck()))` | |
| OP03-103 | Bobbin the Disposer | Personnage | d'office | | |
| OP03-104 | Shirley | Personnage | briques 1.1 | `onPlay: lookLifeArrange()` | [Bloqueur] d'office ; interprétation 216 |
| OP03-105 | Charlotte Oven | Personnage | briques 1.1 | en attaquant `when(selfDon(1), withCost(discardCost(1, { trigger: true }), selfPowerMod(3000, 'battle')))` | |
| OP03-106 | Charlotte Opéra | Personnage | d'office | | |
| OP03-107 | Charlotte Galette | Personnage | d'office | | [Bloqueur] |
| OP03-108 | Charlotte Cracker | Personnage | briques 1.1 | `selfPower` +1000 et `keywordWhile('Double Attack', ...)` avec 1 DON!! et `lessLifeThanOpp` ; `onTrigger: withCost(discardCost(1), playThis())` | |
| OP03-109 | Charlotte Chiffon | Personnage | briques 1.1 | `withCost(trashLifeCost('both'), lifeFromDeck())` | |
| OP03-110 | Charlotte Smoothie | Personnage | briques 1.1 | en attaquant `withCost(lifeToHandCost('both'), selfPowerMod(2000, 'battle'))` ; `onTrigger: withCost(discardCost(1), playThis())` | |
| OP03-111 | Charlotte Praline | Personnage | d'office | | |
| OP03-112 | Charlotte Pudding | Personnage | sur mesure | `effect` avec `lookTopPick(ctx, 4, 1, filtre)` : [Sanji] **ou** {Big Mom Pirates}, autre que Pudding | `CharSpec` ne sait pas dire « ou » |
| OP03-113 | Charlotte Slurp | Personnage | briques 1.1 | `onKO: searchTop(3, 1, { type: 'Big Mom Pirates' })` ; `onTrigger: withCost(discardCost(1), playThis())` | (Perospero en VO) |
| OP03-114 | Charlotte Linlin | Personnage | briques 1.1 | `when(leaderType('Big Mom Pirates'), seq(lifeFromDeck(), trashOppLife()))` | interprétation 214 |
| OP03-115 | Streusen | Personnage | briques | `withCost(discardCost(1, { trigger: true }), ko(oppChar({ costMax: 1 })))` | |
| OP03-116 | Shirahoshi | Personnage | briques | `seq(drawCards(3), discard(2))` ; [Déclenchement] générique | |
| OP03-117 | Napoleon | Personnage | briques | `activateMain` coût `restSelf()`, `powerMod(ownLeaderOrChar({ name: 'Charlotte Linlin' }), 1000, 'oppNextEnd')` ; [Déclenchement] générique | « jusqu'au début de votre prochain tour » = `oppNextEnd` |
| OP03-118 | Térébration | Événement | briques 1.1 | `onCounter: defenderPower(5000)` ; [Déclenchement] `withCost(discardCost(2), lifeFromDeck())` | |
| OP03-119 | Buzz Cut Mochi | Événement | briques 1.1 | `when(lessLifeThanOpp, ko(oppChar({ costMax: 4 })))` ; [Déclenchement] `playFromHand({ costMax: 4, trigger: true })` | |
| OP03-120 | Tropical Torment | Événement | briques 1.1 | `when(oppLifeAtLeast(4), trashOppLife())` ; [Déclenchement] générique | |
| OP03-121 | Colonne foudroyante | Événement | briques 1.1 | `withCost(trashLifeCost('top'), ko(oppChar({ costMax: 5 })))` ; [Déclenchement] `ko` 5 | |
| OP03-123 | Charlotte Katakuri | Personnage | briques 1.1 | `toOwnersLife(anyChar({ costMax: 8 }))` | n'importe quel Personnage, les siens compris |

## ST-01 (tâche 1.14)

| Numéro | Nom | Catégorie | Classement | Briques ou mécanismes | Remarque |
|---|---|---|---|---|---|
| ST01-001 | Monkey.D.Luffy | Leader | briques | `activateMain` une fois : `giveDon(ownLeaderOrChar(), 1)` | |
| ST01-002 | Usopp | Personnage | briques 1.1 | en attaquant `when(selfDon(2), blockerBan({ powerMin: 5000 }))` ; [Déclenchement] générique | |
| ST01-003 | Karoo | Personnage | d'office | | |
| ST01-004 | Sanji | Personnage | briques | `rush` avec 2 DON!! | |
| ST01-005 | Jinbe | Personnage | briques 1.1 | en attaquant `when(selfDon(1), powerMod(otherThanSelf(ownLeaderOrChar()), 1000, 'turn'))` | |
| ST01-006 | Tony-Tony Chopper | Personnage | d'office | | [Bloqueur] |
| ST01-007 | Nami | Personnage | briques | `activateMain` une fois : `giveDon(ownLeaderOrChar(), 1)` | |
| ST01-008 | Nico Robin | Personnage | d'office | | |
| ST01-009 | Nefeltari Vivi | Personnage | d'office | | |
| ST01-010 | Franky | Personnage | d'office | | |
| ST01-011 | Brook | Personnage | déjà codée | `meta-sabo.ts` | |
| ST01-012 | Monkey D. Luffy | Personnage | briques 1.1 | [Initiative] d'office ; en attaquant `when(selfDon(2), selfKeyword('Unblockable', ..., 'battle'))` | « ne peut pas activer [Bloqueur] pendant ce combat » = [Imblocable] pour le combat |
| ST01-013 | Roronoa Zoro | Personnage | briques | `selfPower` +1000 avec 1 DON!! | |
| ST01-014 | Guard Point | Événement | briques 1.1 | `onCounter: defenderPower(3000)` ; [Déclenchement] `powerMod(ownLeaderOrChar(), 1000, 'turn')` | |
| ST01-015 | Gum-Gum Jet Pistol | Événement | briques | `ko(oppChar({ powerMax: 6000 }))` ; [Déclenchement] générique | |
| ST01-016 | Diable Jambe | Événement | briques | `grant(ownLeaderOrChar({ type: 'Straw Hat Crew' }), { stat: 'keyword', keyword: 'Unblockable' }, 'turn', ...)` ; [Déclenchement] `ko(oppChar({ keyword: 'Blocker', costMax: 3 }))` | interprétation 215 |
| ST01-017 | Thousand Sunny | Lieu | briques | `activateMain` coût `restSelf()`, `powerMod(ownLeaderOrChar({ type: 'Straw Hat Crew' }), 1000, 'turn')` | |

## Pour information : cartes probables des adversaires (tâches 1.15 et 1.16)

Les listes A et B sont choisies par la tâche 1.2 (`game/docs/aventure-east-blue.md`) ; voici le classement des cartes
de leurs familles, hors OP03 et ST-01. Les mécaniques **non faites** sont en fin de section.

### Équipage de Baggy (`Buggy Pirates`) et de Krieg (`Krieg Pirates`)

| Numéro | Nom | Classement | Remarque |
|---|---|---|---|
| EB02-018 | Buggy | briques 1.1 | `leaderKeyword('Double Attack', 'turn')` si aucun autre [Buggy] (compter les siens sauf lui) ; [Déclenchement] `rest` 4 |
| OP01-064 | Alvida | briques | [DON!! x1] en attaquant, défausser 1 : `bounce` 3 |
| OP02-052 | Cabaji | briques | avec [Mohji] : piocher 2, défausser 1 |
| OP02-058 | Buggy | briques | `searchTop` bleue {Impel Down} |
| OP02-060 | Mohji | d'office | |
| OP09-058 | Special Muggy Ball | briques | `bounce` adverse 6 ; [Déclenchement] `bounce` 3 |
| OP09-059 | Murder at the Steam Bath | sur mesure | `defenderPower(3000)` puis défausser jusqu'à 2 cartes et autant du deck |
| OP15-005 | Cabaji | briques 1.1 | condition sur mesure « l'adversaire a des DON!! données » ; `selfPowerMod(2000, 'turn')` |
| OP15-012 | Buggy | briques 1.1 | en attaquant `giveRestedDonToOwner(cibles, 1)`, cibles : Leader et Personnages des deux joueurs (`side: 'any'`, `leader: true`) ; `onKO: drawCards(1)` |
| OP15-018 | Mohji | briques 1.1 | `ko(oppChar({ powerMax: 3000, donMin: 1 }))` en attaquant |
| OP16-031 | Buggy | déjà codée | |
| OP16-041 | Buggy (Leader) | sur mesure | `when` sur `ko` et `leave` d'un de ses {Impel Down}, [DON!! x1], une fois par tour : jouer [Prisoner of Impel Down] |
| OP16-048 | Buggy | sur mesure | `when` sur `attack` adverse, une fois par tour : [Bloqueur] à un [Prisoner of Impel Down] |
| OP16-059 | We'll Change This Mission... | sur mesure | coût « épuiser 7 DON!! », jouer jusqu'à 2 Personnages regardés ; [Contre] `leaderPower` |
| ST30-011 | Baggy | déjà codée | |
| OP01-066 | Krieg | d'office | |
| OP12-068 | Gin | d'office | |
| OP15-001 | Krieg (Leader) | briques 1.1 | `oppAura` −2000 au tour adverse avec 1 DON!! si tous ses Personnages sont {East Blue} ; `activateMain` une fois `rest(oppChar({ donMin: 2 }))` |
| OP15-007 | Gin | briques | `when(leaderType('East Blue'), playFromHand({ costMax: 5 }))` |
| OP15-008 | Krieg | briques 1.1 + sur mesure | `giveRestedDonToOwner(oppChar(), 3)` puis [Initiative] ; l'effet « −1000 par DON!! donnée » est sur mesure (mémoriser la cible) |
| OP15-011 | Pearl | briques | `blocker` et `selfPower` au tour adverse ; `onKO` `ko` puissance de base 6000 |
| OP15-037 | The Outcome Will Tell Us... | briques | `searchTop` {East Blue} ; [Déclenchement] `drawCards(1)` |
| OP15-038 | It's an Order! Do Not Defy Me!!! | briques 1.1 | `keepRested(oppChar({ rested: true, costMax: 8, donMin: 2 }), ..., 1)` ; [Contre] `powerMod` [Krieg] +4000 |

### Smoker et la Marine noire (`Navy`)

Jouables d'office (18) : EB02-042, EB02-043, OP02-097, OP02-104, OP02-107, OP02-108, OP02-109, OP02-116, OP11-093,
OP11-094, OP12-082, OP12-088, ST06-003, ST06-007, ST06-009, ST06-011, ST06-013, ST08-010.

| Numéro | Nom | Classement | Remarque |
|---|---|---|---|
| OP02-093 | Smoker (Leader) | briques 1.1 | `activateMain` une fois, condition `selfDon(1)` : `seq(costMod(oppChar(), -1, 'turn'), when(characterCostAtMost(0), selfPowerMod(1000, 'turn')))` |
| EB01-049 | T-Bone | briques | `ko` 2 |
| EB02-044 | Sengoku | briques | `playFromTrash` noir {Navy} 4 épuisé |
| EB02-049 | Monkey.D.Garp | briques | `giveDon` au Leader ; `activateMain` coût `restSelf()` si Leader [Garp] |
| EB03-041 | Kujyaku | briques | `aura` au tour adverse ; défausser 1 {Navy} : piocher 2 |
| EB04-044 | Koby | sur mesure | remplacement « s'il devait quitter le terrain » (modèle : Oden ST22-005) ; `when` sur `ko` adverse |
| EB04-046 | Doll | briques 1.1 | `costAura` +2 aux {Navy} au tour adverse ; [Bloqueur] d'office |
| EB04-047 | Helmeppo | sur mesure | jouer {SWORD} 3 « de la main ou de la Défausse » |
| EB04-050 | I'll Whip You Into Shape. ♡ | briques 1.1 | `grant(..., { stat: 'attackActive' })` ; [Contre] `leaderPower` |
| OP02-002 | Monkey.D.Garp (Leader) | **mécanique manquante** | « quand une DON!! est donnée » (voir plus bas) |
| OP02-094 | Isuka | sur mesure | `when` sur `ko` en combat de l'attaquant (`s.battle.attacker`), [DON!! x1], une fois par tour : `readySelf()` |
| OP02-095 | Onigumo | briques 1.1 | `keywordWhile('Banish', characterCostAtMost(0))` |
| OP02-096 | Kuzan | briques | piocher 1 ; en attaquant `costMod` −4 |
| OP02-098 / OP02-099 | Koby / Sakazuki | briques | défausser 1 : `ko` 3 / 5 |
| OP02-100 | Jango | briques | `cantBeKO` en combat avec [Fullbody] |
| OP02-101 | Strawberry | briques 1.1 | `when(characterCostAtMost(0), blockerBan({ costMax: 5 }))` en attaquant |
| OP02-102 | Smoker | briques 1.1 | `cantBeKO` par effet ; `when(characterCostAtMost(0), selfPowerMod(2000, 'battle'))` |
| OP02-103 / OP02-105 / OP02-106 | Sengoku / Tashigi / Tsuru | briques | `costMod` |
| OP02-110 | Hina | briques | `when` sur `block` : `grant(oppChar({ costMax: 6 }), { stat: 'cantAttack' }, 'turn')` |
| OP02-111 | Fullbody | briques 1.1 | avec [Jango] : `selfPowerMod(3000, 'battle')` |
| OP02-112 | Bell-mère | briques | `activateMain` coût `restSelf()` : `costMod` puis `powerMod` |
| OP02-113 | Helmeppo | briques 1.1 | `costMod` −2 puis `when(characterCostAtMost(0), selfPowerMod(2000, 'battle'))` |
| OP02-114 | Borsalino | briques | `selfPower` et `cantBeKO` par effet au tour adverse |
| OP02-115 | Monkey.D.Garp | briques | [DON!! x2] en attaquant `ko(oppChar({ costMax: 0 }))` |
| OP02-117 / OP02-119 | Ice Age / Meteor Volcano | briques | `costMod` −5 / `ko` 1 |
| OP02-118 | Yasakani Sacred Jewel | briques | [Contre] défausser 1 : `grant(ownChar(), { stat: 'cantBeKO', scope: 'battle' }, 'battle')` ; [Déclenchement] `koOppStage(3)` |
| OP04-020 | Issho (Leader) | briques 1.1 | `oppCostAura` −1 ; [Fin de votre tour] `withCost(restDon(1), setActiveTargets(ownChar({ costMax: 5 })))` |
| OP05-041 / P-076 / ST06-001 | Sakazuki (Leaders) | briques | `activateMain` une fois |
| OP08-093 | X.Drake | briques | `selfCost` +2 avec 1 DON!! |
| OP10-096 | There's No Longer Any Need... | briques | `ko` {The Seven Warlords of the Sea} |
| OP11-001 | Koby (Leader) | sur mesure | `keywordAura` [Initiative : Personnage] aux {SWORD} ; remplacement (3 cartes de la Défausse sous le deck) |
| OP11-082 / OP11-084 / OP11-119 | Aramaki / Kuzan / Koby | briques 1.1 | `attackActive` ; le reste en briques (`trashThis`, `trashTop`, `trashToBottomCost`) |
| OP11-088 | Shu | briques 1.1 | `when` sur `attack` d'un Personnage <Tranche>, une fois par tour : `selfPowerMod(5000, 'battle')` |
| OP11-091 | Berry Good | sur mesure | l'adversaire place 3 Événements de sa Défausse sous son deck (modèle : Mont d'or, `fam-katakuri.ts`) |
| OP11-092 | Helmeppo | sur mesure | `addDelayed({ action: 'bottomChar', uid })` pour le Personnage joué |
| OP11-095 | Monkey.D.Garp | briques | `trashToBottomCost(3, { type: 'Navy' })`, `characterCostAtLeast(9)` |
| OP11-096 | Ripper | briques | `blocker` sous condition |
| OP11-097 | After All These Years... | briques 1.1 | `defenderPower(1000)` puis `when(trashAtLeast(10), trashToHand(...))` |
| OP11-098 / OP11-099 | Blue Hole / I'm Gonna Be a Navy Officer!!! | briques | |
| P-025 | Smoker | briques 1.1 | `koImmuneInBattle({ without: 'Special', characters: true }, selfDon(1))` |
| P-026 / P-032 | Morgan / Sengoku | briques / briques 1.1 | `costMod` en attaquant / `oppCostAura` −2 |
| ST06-002, -005, -006, -008, -010, -012, -015, -017 ; ST08-004 ; ST19-001, -002, -004, -005 | Marine | briques | |
| ST06-004 | Smoker | briques 1.1 | `cantBeKO` par effet ; `keywordWhile('Double Attack', all(selfDon(1), characterCostAtMost(0)))` |
| ST06-014 | Shockwave | briques 1.1 | `seq(defenderPower(4000), ko(oppChar({ rested: false, costMax: 3 })))` |
| ST06-016 | White Out | briques 1.1 + **mécanique manquante** | `defenderPower(2000)` ; [Déclenchement] « aucun de vos Personnages ne peut être mis KO pour le tour » |
| ST19-003 | Tashigi | sur mesure | « placez dans sa Défausse » un Personnage adverse de coût 0 (pas un KO : `removeFromField`) ; « joué ce tour-ci » : `playedTurn` |

### Mécaniques non faites (à ajouter par 1.15 ou 1.16 si leur liste les retient)

- **« Quand ce Leader ou un de vos Personnages reçoit une DON!! »** (Garp OP02-002) : un événement `donGiven` à annoncer
  dans `engine.ts` (DON!! donnée par le joueur) et dans les briques qui donnent des DON!!.
- **« Aucun de vos Personnages ne peut être mis KO pour le tour »** (White Out ST06-016) : une protection du joueur
  (comme `koGuardTurn`), lue par `canBeKO`, pour les Personnages joués ensuite aussi.

## Interprétations

Les choix de la tâche 1.1 sont dans `game/docs/interpretations.md`, section « OP03 et ST-01 : mécanismes (tâche
1.1) », numéros 200 à 216.
