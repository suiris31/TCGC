# Validation de masse de l'étape 1 (tâche 1.20)

Bilan de la validation des cartes de l'étape 1 du plan « Aventure » : les 123 cartes d'OP03, les 17 de ST-01 et les
cartes des decks de l'aventure (listes A et B), soit **189 cartes, toutes jouables**. Fait le 21 octobre 2026 sur
`aventure/etape-1` (tête 3d6c99f, vague 1B fusionnée, avant la tâche 1.19).

## En bref

- **Aucun bug trouvé dans les fichiers de cartes de l'étape** : aucun contrôle de cohérence en défaut, aucune réponse
  de l'IA hors des choix proposés, aucune anomalie d'après le texte des cartes, sur plus de 200 000 parties. Aucune
  correction n'a donc été faite dans `op03-*.ts`, `st01.ts`, `aventure-a.ts` ou `aventure-b.ts`.
- **Chaque effet codé a été déclenché en partie**, sauf 6 qui ne peuvent pas l'être avec les cartes jouables
  aujourd'hui (justifiés plus bas, et vérifiés par les tests dédiés des tâches de cartes).
- **Étanchéité** : le test existant ne jouait aucun deck de l'aventure ; un test dédié aux cartes de l'étape a été
  ajouté (`game/tests/view-etape-1.test.ts`), vert.
- **Empreinte contre `main`** : 0 partie différente sur 45 000. **Vitesse de l'IA** : les decks de l'aventure sont
  aussi rapides que ceux du registre.
- Remarques pour la tâche 1.19 et pour l'utilisateur à la fin (IA simple, Prisonniers d'Impel Down).

## Ce qui a été lancé

| Vérification | Résultat |
|---|---|
| `scripts/game/validate-stage.ts 10 25 --aventure 20 --graines 1,2,3` (nouveau, voir plus bas) | 61 080 parties, 8,4 millions de décisions : **aucun problème**, 0 anomalie d'après le texte |
| même script, graine 4, sans choix au hasard (`--modes ia`) | 10 180 parties, aucun problème (sert à séparer ce que fait l'IA de ce que fait le hasard) |
| même script, Leader Kobby avec un Personnage {SWORD} (`--leaders OP11-001 --avec OP11-001:OP11-017`) | 500 parties, aucun problème ; l'effet de Kobby vu 5 372 fois |
| `npm run game:validate` (registre, ST-01 compris, rapport dans un dossier temporaire) | 71 680 parties, 0 problème de cohérence, 0 point à examiner (7 voulus) |
| `npm run game:custom-smoke -- 10 25` | 6 500 parties, 0 problème |
| `npm run game:custom-smoke -- 50 25 --hasard` | 32 500 parties, 0 problème |
| `npm run game:fingerprint -- 200` contre une référence prise sur `main` (ede366f) | 51 200 parties (45 000 comparées), **0 partie différente** ; empreinte de `main` 63ada76ee4700c62, identique à celle des vagues 1A et 1B |
| `npm run game:coverage` | OP03 123/123, ST-01 17/17, les 16 decks du registre complets |
| `npm test` | 702 tests verts avant l'ajout du test d'étanchéité de l'étape (2 tests de plus, verts) |
| vitesse de l'IA (mesure ci-dessous) | decks de l'aventure aussi rapides que ceux du registre |

`custom-smoke` ne fixe qu'une graine ; les « plusieurs graines » demandées sont dans `validate-stage.ts`
(`--graines`). Dans `custom-smoke -- 10 25`, OP03-036 (Out-of-the-Bag) et OP03-094 (Air Door) restent « jamais
jouées » : c'est un effet de la façon dont ce script fabrique ses decks (au hasard, sans le Leader qui leur sert). Dans
leurs vrais decks, l'IA les joue sans hasard (Out-of-the-Bag 85 fois et Air Door 13 fois en une passe `--modes ia`,
leur [Déclenchement] choisi à chaque fois qu'il est proposé).

## Le script `scripts/game/validate-stage.ts`

`validate.ts` ne joue que les decks du registre, où presque aucune carte de l'étape ne figure ; `custom-smoke` ne dit
que « jouée ou non ». Le nouveau script, réutilisable aux étapes suivantes, joue les cartes de l'étape :

1. dans les decks de l'aventure (`ADVENTURE_DECKS`) et ST-01, contre eux et contre tout le registre ;
2. dans des decks tirés au hasard pour **chaque Leader jouable** (26), faits des cartes de l'étape à ses couleurs
   (complétés par d'autres cartes s'il en manque) : synergies de l'étape entre elles, et cartes hors de leur deck ;
3. avec et sans choix au hasard (`--hasard` de `custom-smoke` : choix des effets et 30 % des autres au hasard, la
   réponse de l'IA vérifiée à chaque décision), sur plusieurs graines.

Il enveloppe chaque effet codé des cartes de l'étape et rapporte, carte par carte, combien de fois il s'est déclenché
et combien de fois il a servi (écrit dans le journal ; pour un effet permanent : changé quelque chose), et les choix
proposés et pris. Il fait aussi trois **contrôles d'après le texte anglais** des cartes : un effet « [DON!! xN] » qui
agit avec moins de N DON!! données (13 effets contrôlés), un effet « [Une fois par tour] » qui agit deux fois dans le
tour (10), un effet permanent « [Votre tour] » ou « [Tour adverse] » qui compte pendant l'autre tour (5).

Le seul signalement de ces contrôles (Haruta OP03-009, une fois sur 61 080 parties) était une fausse alerte : une
Haruta rejouée après avoir quitté le terrain est une nouvelle carte, son [Une fois par tour] repart à zéro (le moteur
lui donne un nouvel état, `rules.ts` `playCharacter`). Le contrôle en tient compte depuis.

## Effets jamais déclenchés en partie (justifiés)

| Carte | Effet | Pourquoi | Vu dans |
|---|---|---|---|
| Baggy OP16-041 (Leader) | les deux effets « quand un Personnage {Impel Down} quitte le terrain : jouer un [Prisonniers d'Impel Down] » | il faut un [Prisonniers d'Impel Down] (OP16-042) en main, et cette carte n'est **pas jouable** (sa règle « autant d'exemplaires que vous voulez » n'est pas prise en charge par les règles de construction des decks) | `cards-aventure-b.test.ts` |
| Baggy OP16-048 | [Bloqueur] donné à un [Prisonniers d'Impel Down] quand l'adversaire attaque | même raison | `cards-aventure-b.test.ts` |
| Minozebra OP03-068, Minorhinoceros OP03-069 | [En cas de KO] « si votre Leader est {Impel Down} » : déclenchés 1 739 et 3 072 fois, jamais utiles | aucun Leader {Impel Down} violet n'est jouable (Magellan OP02-071 et Hannyabal EB01-021 sont à faire ; les Leaders {Impel Down} jouables, Baggy OP16-041 (bleu) et Luffy et Ace ST30-001 (rouge/vert), ne sont pas violets) : la condition est toujours fausse, comme il se doit | `cards-op03-violette.test.ts` |

L'effet du Leader Kobby OP11-001 (« vos Personnages {SWORD} peuvent attaquer un Personnage le tour où ils sont joués »)
n'apparaît pas dans la passe principale : le seul Personnage {SWORD} jouable est X-Drake OP11-017, qui n'est pas une
carte de l'étape. Vu en partie avec `--avec OP11-001:OP11-017` (5 372 fois, aucun problème).

Seulement avec des choix au hasard (jamais avec l'IA seule), mais vus : l'[Initiative] de Curiel OP03-004 (avec 1 DON!!)
et de Sanji ST01-004 (avec 2 DON!!) — l'IA simple ne donne pas de DON!! à un Personnage qu'elle vient de jouer pour lui
donner l'[Initiative] (voir les remarques) ; le +3000 de Carne OP03-045 (20 cartes ou moins dans le deck pendant le tour
adverse : les parties de l'IA finissent avant).

## Remarques (pas des bugs de cartes)

Pour la **tâche 1.19** (elle a `game/ai/` dans ses fichiers ; rien n'a été changé ici) :

- **IA simple et effets [Activation : Principale] inutiles** : le moteur propose l'activation même quand l'effet ne
  peut rien faire (c'est permis : « jusqu'à 1 »), l'élagage des niveaux 2 et 3 l'écarte (`prune.ts`, `useful`), mais
  l'IA simple l'active quand même en fin de tour (`abilityTiming`, `'late'` par défaut). Le Leader Krieg OP15-001
  (« épuiser un Personnage adverse ayant 2 DON!! données ou plus ») est activé 47 625 fois pour 1 952 effets réels :
  même cas que le Leader Kuro OP03-021 déjà noté pour 1.19. Peu de conséquences (c'est la fin du tour), mais une
  correction dans `chooseMain` (ignorer un `act:` dont `useful` est faux) servirait aux deux.
- **[Initiative] sous condition de DON!!** : Curiel OP03-004 (1 DON!!) n'a pas d'entrée `RUSH_DON` dans `prune.ts`
  (Sanji ST01-004 est déjà dans la liste de 1.19).
- Victoires des decks de l'aventure contre l'ensemble des adversaires (decks de l'aventure et registre, IA simple des
  deux côtés, 1 380 parties chacun, simple indication pour l'équilibrage) : Morgan 25 %, Baggy 20 %, Kuro **6 %**,
  Krieg 41 %, Arlong 18 %, Baggy et Alvida 24 %, Smoker 28 %, ST-01 28 %.
- Le Leader Baggy et Baggy OP16-048 ne servent jamais faute de [Prisonniers d'Impel Down] jouable (question 2 de
  l'utilisateur ; point 7 de la tâche 1.19).

Pour l'utilisateur (limite du moteur, pas des fichiers de cartes) : un Personnage **placé dans la Défausse pour payer
un coût** (briques `trashSelf`, `trashOwnCharCost`) ou **faute de place** (6e Personnage) n'est pas annoncé comme
« quittant le terrain » ; seules quelques cartes l'annoncent elles-mêmes (Marshall D. Teach OP03-012, cartes de
Barbe Blanche). Dans l'étape, aucune carte ne place un Personnage {Impel Down} dans la Défausse pour payer un coût : le
Leader Baggy n'en est pas privé en pratique. Annoncer ces sorties dans le moteur changerait le jeu de decks existants
(Moby Dick OP08-056 réagit à ces annonces pendant le tour de son joueur) : à décider plus tard, avec une nouvelle empreinte.

## Étanchéité

`game/tests/view.test.ts` vérifie à chaque coup qu'aucune carte cachée ne fuit dans la vue d'un joueur, mais seulement
sur les decks du registre : aucun deck de l'aventure, et parmi les cartes de l'étape seulement celles de ST-01. Le
nouveau test `game/tests/view-etape-1.test.ts` fait les mêmes contrôles sur les 7 decks de l'aventure et ST-01 les uns
contre les autres (64 parties), et sur deux decks par Leader d'OP03 et de ST-01 faits des cartes de l'étape (36
parties). Vert ; des cartes regardées ou révélées y sont bien montrées au seul joueur qui y a droit.

## Vitesse de l'IA

Mesure faite avec un script hors dépôt (même principe que `scripts/game/bench.ts`, qui ne connaît que les decks du
registre) : 100 parties IA simple contre ST-01 par deck, puis le niveau Expert (48 tirages, 1 800 ms au plus) sur 12
décisions de ces parties. Le PC était chargé par d'autres sessions : une première mesure, faussée par cette charge,
donnait Baggy 6 fois plus lent ; refaite seule, elle est normale (le profil d'une partie de Baggy ne montre rien de
particulier, 10 ms par partie).

| Deck | Parties par seconde | IA simple (ms par décision) | Expert : tirages faits dans le budget |
|---|---|---|---|
| ST-31 (registre) | 118 | 0,025 | 32 |
| ST-35 (registre) | 79 | 0,042 | 29 |
| META-MIHAWK-2026-10 (registre, défi de Mihawk) | 67 | 0,034 | 29 |
| ST-01 | 103 | 0,027 | 42 |
| AV-EB-MORGAN | 77 | 0,041 | 41 |
| AV-EB-BAGGY | 105 | 0,025 | 39 |
| AV-EB-KURO | 109 | 0,023 | 36 |
| AV-EB-KRIEG | 164 | 0,018 | 48 |
| AV-EB-ARLONG | 180 | 0,018 | 48 |
| AV-EB-BAGGY-ALVIDA | 180 | 0,014 | 43 |
| AV-EB-SMOKER | 202 | 0,016 | 43 |

Les decks de l'aventure ne ralentissent pas l'IA : le niveau Expert y fait même plus de tirages que dans les decks du
méta.

## Pour refaire la validation

```bash
node --no-warnings scripts/game/validate-stage.ts 10 25 --aventure 20 --graines 1,2,3 --rapport <fichier>
node --no-warnings scripts/game/validate-stage.ts 10 25 --aventure 20 --graines 4 --modes ia --rapport <fichier>
node --no-warnings scripts/game/validate-stage.ts 10 25 --aventure 0 --leaders OP11-001 --avec OP11-001:OP11-017
```

(Environ 20 minutes pour la première sur le PC, 3 pour la deuxième.) Les numéros des decks de l'aventure et leurs
listes viennent de `game/adventure/decks.ts` : après les changements de la tâche 1.19, le rapport change un peu.

## Rapport carte par carte

Passe principale (3 graines, avec et sans choix au hasard, 61 080 parties). Effets codés : nombre de déclenchements
(utile : a écrit dans le journal ; effet permanent : nombre de fois où il a changé quelque chose). Choix : pris /
proposés. Un effet « [En attaquant] » ou « [Jouée] » se déclenche à chaque attaque ou à chaque fois que la carte est
jouée, même quand sa condition est fausse : un « utile » bas n'est pas un défaut en soi (voir les remarques). Les cartes
sans effet codé ont des mots-clés seulement ou un effet traité d'office par le moteur ([Déclenchement] « jouez cette
carte »...).

| Carte | Nom | Effets codés | Choix |
|---|---|---|---|
| EB02-011 | Arlong | [Jouée] 7555 (utile 7129) | Contre (carte) 4307/19609 ; jouée 7521/22798 |
| OP01-064 | Alvida | [En attaquant] 6083 (utile 1267) | jouée 7458/32316 ; Contre (carte) 4528/23944 |
| OP02-052 | Cabaji | [Jouée] 14709 (utile 3380) | jouée 14709/44119 ; Contre (carte) 5449/26679 |
| OP02-058 | Buggy | [Jouée] 13003 (utile 13003) | jouée 13003/63064 ; Contre (carte) 6258/31157 |
| OP02-060 | Mohji | aucun effet codé (effet générique ou vanille) | jouée 13335/64228 ; Contre (carte) 6447/31687 |
| OP02-093 | Smoker | [Activation : Principale] 12792 (utile 11026) | effet activé proposé 12792/19347 |
| OP02-102 | Smoker | [En attaquant] 4703 (utile 1159) ; ne peut pas être mis KO 2517 | jouée 5206/19484 ; Contre (carte) 4404/17396 |
| OP02-107 | Doberman | aucun effet codé (effet générique ou vanille) | jouée 6027/22416 ; Contre (carte) 3854/16239 |
| OP02-117 | Ice Age | [Principale] 3988 (utile 3237) ; [Déclenchement] (codé) 1202 (utile 902) | activée 3988/19054 ; [Déclenchement] proposé 1202/1555 |
| OP03-001 | Portgas.D.Ace | effet « Quand ... » 6802 (utile 1902) | — |
| OP03-002 | Adio | [En attaquant] 1357 (utile 582) | Contre (carte) 1172/5605 ; jouée 1772/4686 |
| OP03-003 | Izo | [Jouée] 2227 (utile 2227) | Contre (carte) 652/3175 ; jouée 2193/9003 |
| OP03-004 | Curiel | [Initiative] sous condition 2228 ; ne peut pas attaquer de Leader 1136 | jouée 1855/6529 ; Contre (carte) 1061/4734 ; attaque le tour où elle est jouée 43/825 |
| OP03-005 | Thatch | [Activation : Principale] 1127 (utile 1127) | jouée 1892/10376 ; effet activé proposé 1127/21965 ; Contre (carte) 811/3872 |
| OP03-006 | Speed Jill | aucun effet codé (effet générique ou vanille) | jouée 1748/3875 ; Contre (carte) 960/4589 |
| OP03-007 | Namur | aucun effet codé (effet générique ou vanille) | jouée 1888/5385 ; Contre (carte) 785/3564 |
| OP03-008 | Baggy | [Jouée] 2777 (utile 2777) ; ne peut pas être mis KO 798 | jouée 2732/12261 |
| OP03-009 | Haruta | [Activation : Principale] 3783 (utile 3262) | jouée 1683/8989 ; Contre (carte) 1280/5966 ; effet activé proposé 3783/12015 |
| OP03-010 | Fossa | mots-clés seulement (Blocker) | jouée 1627/7936 ; Contre (carte) 1149/5014 ; bloque 827/4238 |
| OP03-011 | Blamenco | [En attaquant] 1154 (utile 522) | jouée 1578/9211 ; Contre (carte) 1345/5812 |
| OP03-012 | Marshall.D.Teach | [En attaquant] 2364 (utile 713) | jouée 2587/5496 |
| OP03-013 | Marco | [Jouée] 3026 (utile 1415) ; [En cas de KO] 1728 (utile 684) | jouée 2338/3557 ; Contre (carte) 723/3586 |
| OP03-014 | Monkey.D.Garp | [En attaquant] 9547 (utile 814) | jouée 9509/25059 |
| OP03-015 | Lim | [En cas de KO] 2053 (utile 1869) ; condition du [En cas de KO] vraie 2053 | jouée 2419/7418 ; bloque 1314/6723 |
| OP03-016 | Flame Emperor | [Principale] 308 (utile 213) ; [Déclenchement] (codé) 519 (utile 439) | [Déclenchement] proposé 519/702 ; activée 308/8581 |
| OP03-017 | Cross Fire | [Principale] 1149 (utile 431) ; [Contre] (Événement) 230 (utile 43) | activée 538/25837 ; [Déclenchement] proposé 611/782 ; Contre (Événement) 230/4246 |
| OP03-018 | Fire Fist | [Principale] 1238 (utile 853) ; [Déclenchement] (codé) 663 (utile 536) | activée 1238/13925 ; [Déclenchement] proposé 663/831 |
| OP03-019 | Fiery Doll | [Principale] 1144 (utile 1144) ; [Déclenchement] (codé) 663 (utile 631) | [Déclenchement] proposé 663/871 ; activée 1144/20014 |
| OP03-020 | Striker | [Activation : Principale] 788 (utile 788) | jouée 2571/9070 ; effet activé proposé 788/28491 |
| OP03-021 | Kuro | [Activation : Principale] 22681 (utile 22681) | effet activé proposé 22681/80958 |
| OP03-022 | Arlong | [En attaquant] 38643 (utile 76) | — |
| OP03-023 | Alvida | aucun effet codé (effet générique ou vanille) | jouée 13270/51393 ; Contre (carte) 5579/24806 |
| OP03-024 | Gin | [Jouée] 10680 (utile 6049) | Contre (carte) 4915/22348 ; jouée 10081/20570 |
| OP03-025 | Krieg | [Jouée] 10397 (utile 3919) ; mot-clé donné 1128 | jouée 10281/17367 |
| OP03-026 | Kuroobi | [Jouée] 7861 (utile 5073) | Contre (carte) 3354/16881 ; jouée 5754/14606 ; [Déclenchement] proposé 1984/2630 |
| OP03-027 | Sham | [Jouée] 8104 (utile 3239) | jouée 7796/18882 ; Contre (carte) 3961/17066 |
| OP03-028 | Jango | [Jouée] 11162 (utile 9928) | jouée 10426/17762 |
| OP03-029 | Chew | [Jouée] 12532 (utile 4426) | jouée 8907/25674 ; Contre (carte) 6091/29906 ; [Déclenchement] proposé 3101/4047 |
| OP03-030 | Nami | [Jouée] 7720 (utile 7720) | jouée 5541/26150 ; [Déclenchement] proposé 2067/2726 ; Contre (carte) 3083/15157 |
| OP03-031 | Pearl | mots-clés seulement (Blocker) | jouée 11432/43504 ; bloque 4717/25119 ; Contre (carte) 6879/30752 |
| OP03-032 | Buggy | ne peut pas être mis KO 2012 | jouée 3428/9345 |
| OP03-033 | Hatchan | [Déclenchement] (codé) 3180 (utile 2798) | Contre (carte) 6417/31133 ; jouée 10094/26643 ; [Déclenchement] proposé 3180/4151 |
| OP03-034 | Buchi | [Jouée] 8674 (utile 1886) | Contre (carte) 4371/19074 ; jouée 7949/16584 |
| OP03-035 | Momoo | aucun effet codé (effet générique ou vanille) | jouée 18443/60297 ; Contre (carte) 8181/36088 |
| OP03-036 | Out-of-the-Bag | [Principale] 3130 (utile 1135) ; [Déclenchement] (codé) 2554 (utile 766) | activée 3130/86227 ; [Déclenchement] proposé 2554/3378 |
| OP03-037 | Tooth Attack | [Principale] 5716 (utile 3327) ; [Déclenchement] (codé) 2042 (utile 480) | activée 5716/67821 ; [Déclenchement] proposé 2042/2692 |
| OP03-038 | Deathly Poison Gas Bomb MH5 | [Principale] 8841 (utile 6122) ; [Déclenchement] (codé) 2628 (utile 2039) | activée 8841/90419 ; [Déclenchement] proposé 2628/3488 |
| OP03-039 | One, Two, Jango | [Principale] 9244 (utile 7985) ; [Déclenchement] (codé) 2406 (utile 1674) | activée 9244/41369 ; [Déclenchement] proposé 2406/3245 |
| OP03-040 | Nami | effet « Quand ... » 968 (utile 740) ; règle du Leader (permanente) | — |
| OP03-041 | Usopp | effet « Quand ... » 239 (utile 109) | jouée 3477/7981 ; attaque le tour où elle est jouée 2889/40751 |
| OP03-042 | Usopp's Pirate Crew | [Jouée] 2282 (utile 299) | jouée 2282/11944 ; Contre (carte) 1043/4908 |
| OP03-043 | Gaimon | effet « Quand ... » 1476 (utile 436) | jouée 1486/10531 ; Contre (carte) 1517/7313 |
| OP03-044 | Kaya | [Jouée] 2249 (utile 2249) | jouée 2249/12511 ; Contre (carte) 1114/5258 |
| OP03-045 | Carne | puissance modifiée 717 | jouée 2755/6257 ; bloque 1411/7091 ; Contre (carte) 992/4919 |
| OP03-046 | Genzo | aucun effet codé (effet générique ou vanille) | Contre (carte) 1095/5439 ; jouée 2735/8047 |
| OP03-047 | Zeff | [Jouée] 2790 (utile 2416) ; effet « Quand ... » 207 (utile 89) | jouée 2790/4257 ; Contre (carte) 882/4741 |
| OP03-048 | Nojiko | [Jouée] 2111 (utile 229) | jouée 2111/10915 ; Contre (carte) 1458/7314 |
| OP03-049 | Patty | [Jouée] 3744 (utile 12) | jouée 3744/7429 |
| OP03-050 | Boodle | [En cas de KO] 1668 (utile 602) | Contre (carte) 1370/6995 ; jouée 1952/10166 ; bloque 1200/5223 |
| OP03-051 | Bell-mère | [En cas de KO] 1065 (utile 383) ; effet « Quand ... » 128 (utile 56) | jouée 2051/4881 ; Contre (carte) 1208/6037 |
| OP03-052 | Merry | aucun effet codé (effet générique ou vanille) | jouée 2953/11647 ; Contre (carte) 1011/5166 |
| OP03-053 | Yosaku & Johnny | puissance modifiée 756 | jouée 3554/14403 |
| OP03-054 | Usopp's Rubber Band of Doom!!! | [Contre] (Événement) 1932 (utile 1932) ; [Déclenchement] (codé) 823 (utile 823) | [Déclenchement] proposé 823/1079 ; Contre (Événement) 1932/6099 |
| OP03-055 | Gum Gum Super Marteau | [Contre] (Événement) 1166 (utile 678) ; [Déclenchement] (codé) 746 (utile 657) | Contre (Événement) 1166/7552 ; [Déclenchement] proposé 746/972 |
| OP03-056 | Riz pilaf de Sanji | [Principale] 2872 (utile 2872) | [Déclenchement] proposé 769/1009 ; activée 2103/11022 |
| OP03-057 | San Zen Sekai | [Principale] 1896 (utile 1693) ; [Déclenchement] (codé) 790 (utile 621) | activée 1896/10357 ; [Déclenchement] proposé 790/1029 |
| OP03-058 | Iceburg | ne peut pas attaquer 53456 ; [Activation : Principale] 5435 (utile 5435) | effet activé proposé 5435/12809 |
| OP03-059 | Kaku | [En attaquant] 3791 (utile 2765) | jouée 2576/5595 ; Contre (carte) 2505/12691 |
| OP03-060 | Kalifa | [En attaquant] 2622 (utile 1904) | Contre (carte) 2995/13260 ; jouée 2408/7101 |
| OP03-061 | Kiwi & Mozu | aucun effet codé (effet générique ou vanille) | jouée 3716/13543 ; Contre (carte) 2909/13663 |
| OP03-062 | Kokoro | [Jouée] 4628 (utile 4628) | jouée 4628/13327 ; Contre (carte) 1490/7458 |
| OP03-063 | Zambai | [Jouée] 4596 (utile 3428) | jouée 4596/16347 ; bloque 2523/13315 |
| OP03-064 | Tilestone | [En cas de KO] 1765 (utile 616) | jouée 2438/5474 ; Contre (carte) 2537/12800 |
| OP03-065 | Chimney & Gonbe | mots-clés seulement (Blocker) | jouée 3293/14789 ; bloque 1838/9352 ; Contre (carte) 3179/14961 |
| OP03-066 | Paulie | [Jouée] 5150 (utile 1028) | jouée 4316/6785 |
| OP03-067 | Peepley Lulu | [En attaquant] 2318 (utile 243) | jouée 1842/5972 ; Contre (carte) 2929/14464 |
| OP03-068 | Minozebra | [En cas de KO] 1739 (utile 0) | Contre (carte) 2823/13457 ; jouée 2814/6818 |
| OP03-069 | Minorhinoceros | [En cas de KO] 3072 (utile 0) | jouée 4996/13428 |
| OP03-070 | Monkey.D.Luffy | [Jouée] 4597 (utile 2018) | jouée 4597/5721 ; attaque le tour où elle est jouée 1909/14831 |
| OP03-071 | Rob Lucci | [En attaquant] 3973 (utile 2879) | jouée 2403/5458 ; Contre (carte) 2441/12827 |
| OP03-072 | Gum Gum Jet Rafale | [Contre] (Événement) 3718 (utile 2555) ; [Déclenchement] (codé) 1224 (utile 909) | Contre (Événement) 3718/14466 ; [Déclenchement] proposé 1224/1599 |
| OP03-073 | Hull Dismantler Slash | [Principale] 2725 (utile 1746) | activée 1506/36292 ; [Déclenchement] proposé 1219/1691 |
| OP03-074 | Top Knot | [Principale] 3960 (utile 2789) | [Déclenchement] proposé 1230/1622 ; activée 2730/18704 |
| OP03-075 | Galley-La Company | [Activation : Principale] 1218 (utile 1218) | jouée 3053/19082 ; effet activé proposé 1218/3009 |
| OP03-076 | Rob Lucci | effet « Quand ... » 3574 (utile 781) | — |
| OP03-077 | Charlotte Linlin | [En attaquant] 7689 (utile 29) | — |
| OP03-078 | Issho | [Jouée] 9011 (utile 485) ; coût adverse modifié 223506 | jouée 9011/12310 |
| OP03-079 | Vergo | ne peut pas être mis KO 3104 | Contre (carte) 5764/28379 ; jouée 7998/16875 |
| OP03-080 | Kaku | [Jouée] 1391 (utile 339) | jouée 1378/2234 ; Contre (carte) 547/2615 |
| OP03-081 | Kalifa | [Jouée] 1363 (utile 1363) | Contre (carte) 966/4462 ; jouée 1257/3249 |
| OP03-082 | Kumadori | aucun effet codé (effet générique ou vanille) | jouée 1126/2796 ; Contre (carte) 801/3656 |
| OP03-083 | Corgy | [Jouée] 1449 (utile 1449) | jouée 1440/6818 ; Contre (carte) 645/2782 |
| OP03-084 | Jerry | aucun effet codé (effet générique ou vanille) | jouée 1075/4639 ; Contre (carte) 766/3365 |
| OP03-085 | Jabra | aucun effet codé (effet générique ou vanille) | jouée 1313/2229 ; Contre (carte) 574/2694 |
| OP03-086 | Spandam | [Jouée] 1306 (utile 450) | jouée 1246/5052 ; Contre (carte) 413/1880 |
| OP03-087 | Nero | aucun effet codé (effet générique ou vanille) | jouée 1586/4187 ; Contre (carte) 733/3202 |
| OP03-088 | Fukurou | ne peut pas être mis KO 434 | jouée 1229/4044 ; bloque 672/3659 ; Contre (carte) 732/3333 |
| OP03-089 | Brandnew | [Jouée] 9871 (utile 9871) | jouée 9854/39248 ; Contre (carte) 6091/26673 |
| OP03-090 | Blueno | [En cas de KO] 741 (utile 373) ; [Bloqueur] sous condition 12303 | Contre (carte) 736/3568 ; jouée 1387/2822 ; bloque 41/100 |
| OP03-091 | Helmeppo | [Jouée] 9636 (utile 2428) | jouée 9628/57792 ; Contre (carte) 6238/27405 |
| OP03-092 | Rob Lucci | [Jouée] 1969 (utile 632) | jouée 1969/3008 ; attaque le tour où elle est jouée 585/7897 |
| OP03-093 | Wanze | [Jouée] 1905 (utile 157) | jouée 1845/6440 |
| OP03-094 | Air Door | [Principale] 377 (utile 287) ; [Déclenchement] (codé) 454 (utile 318) | [Déclenchement] proposé 454/586 ; activée 377/9349 |
| OP03-095 | Soap Sheep | [Principale] 1596 (utile 1324) ; [Déclenchement] (codé) 572 (utile 471) | activée 1596/7266 ; [Déclenchement] proposé 572/737 |
| OP03-096 | Tempest Kick Sky Slicer | [Principale] 553 (utile 234) ; [Déclenchement] (codé) 476 (utile 476) | activée 553/15052 ; [Déclenchement] proposé 476/631 |
| OP03-097 | Six Pouvoirs Gun | [Contre] (Événement) 1309 (utile 920) ; [Déclenchement] (codé) 494 (utile 494) | Contre (Événement) 1309/5263 ; [Déclenchement] proposé 494/628 |
| OP03-098 | Enies Lobby | [Activation : Principale] 3823 (utile 3823) | jouée 1357/6178 ; effet activé proposé 3823/11880 ; [Déclenchement] proposé 489/625 |
| OP03-099 | Charlotte Katakuri | [En attaquant] 8447 (utile 2782) | — |
| OP03-100 | Kingbaum | [Déclenchement] (codé) 371 (utile 273) | jouée 2102/5355 ; [Déclenchement] proposé 371/714 |
| OP03-101 | Camie | aucun effet codé (effet générique ou vanille) | jouée 6955/33672 ; Contre (carte) 3042/15007 |
| OP03-102 | Sanji | [En attaquant] 1226 (utile 406) | Contre (carte) 1800/7566 ; jouée 1636/9841 |
| OP03-103 | Bobbin the Disposer | aucun effet codé (effet générique ou vanille) | jouée 1747/8322 ; Contre (carte) 1451/6228 |
| OP03-104 | Shirley | [Jouée] 4303 (utile 3542) | Contre (carte) 2098/10892 ; jouée 4303/12512 ; bloque 2172/10435 |
| OP03-105 | Charlotte Oven | [En attaquant] 1705 (utile 133) | jouée 1935/6427 ; Contre (carte) 1394/5742 |
| OP03-106 | Charlotte Opéra | aucun effet codé (effet générique ou vanille) | Contre (carte) 1497/6295 ; jouée 2509/4978 |
| OP03-107 | Charlotte Galette | mots-clés seulement (Blocker) | jouée 1832/9663 ; Contre (carte) 1617/7000 ; bloque 1009/4771 |
| OP03-108 | Charlotte Cracker | [Déclenchement] (codé) 543 (utile 427) ; puissance modifiée 22777 ; mot-clé donné 70 | Contre (carte) 1105/4767 ; jouée 1672/3711 ; [Déclenchement] proposé 543/801 |
| OP03-109 | Charlotte Chiffon | [Jouée] 2457 (utile 1723) | jouée 2457/10825 |
| OP03-110 | Charlotte Smoothie | [En attaquant] 2001 (utile 413) ; [Déclenchement] (codé) 583 (utile 463) | Contre (carte) 1157/5178 ; [Déclenchement] proposé 583/871 ; jouée 1815/3959 |
| OP03-111 | Charlotte Praline | aucun effet codé (effet générique ou vanille) | Contre (carte) 3695/17961 ; jouée 6771/20368 |
| OP03-112 | Charlotte Pudding | [Jouée] 2370 (utile 2370) | jouée 2370/9275 ; Contre (carte) 927/4144 |
| OP03-113 | Charlotte Slurp | [En cas de KO] 1985 (utile 1985) ; [Déclenchement] (codé) 604 (utile 498) | jouée 2650/6466 ; [Déclenchement] proposé 604/862 |
| OP03-114 | Charlotte Linlin | [Jouée] 2169 (utile 1003) | jouée 2169/2890 |
| OP03-115 | Streusen | [Jouée] 2209 (utile 637) | jouée 2209/10277 ; Contre (carte) 1138/4618 |
| OP03-116 | Shirahoshi | [Jouée] 3698 (utile 3698) | Contre (carte) 2285/11554 ; jouée 2525/7847 ; [Déclenchement] proposé 1176/1583 |
| OP03-117 | Napoleon | [Activation : Principale] 1963 (utile 1963) | Contre (carte) 1109/4926 ; jouée 1495/5663 ; effet activé proposé 1963/10482 ; [Déclenchement] proposé 624/836 |
| OP03-118 | Térébration | [Contre] (Événement) 6115 (utile 6115) ; [Déclenchement] (codé) 621 (utile 178) | [Déclenchement] proposé 621/2533 ; Contre (Événement) 6115/12544 |
| OP03-119 | Buzz Cut Mochi | [Principale] 1392 (utile 978) ; [Déclenchement] (codé) 320 (utile 116) | activée 1392/18479 ; [Déclenchement] proposé 320/852 |
| OP03-120 | Tropical Torment | [Principale] 1249 (utile 963) | activée 843/15978 ; [Déclenchement] proposé 406/919 |
| OP03-121 | Colonne foudroyante | [Principale] 1739 (utile 1186) ; [Déclenchement] (codé) 711 (utile 638) | activée 1739/13111 ; [Déclenchement] proposé 711/972 |
| OP03-122 | Sniperking | [Jouée] 2630 (utile 2630) | Contre (carte) 1167/6485 ; jouée 2630/3491 |
| OP03-123 | Charlotte Katakuri | [Jouée] 3368 (utile 3058) | jouée 3368/4946 |
| OP04-023 | Kuro | aucun effet codé (effet générique ou vanille) | Contre (carte) 4699/20782 ; jouée 7925/11579 |
| OP06-023 | Arlong | [Jouée] 9664 (utile 5352) ; [Déclenchement] (codé) 2026 (utile 1457) | jouée 9500/14155 ; [Déclenchement] proposé 2026/2671 |
| OP09-053 | Morge | [Jouée] 10281 (utile 10281) | Contre (carte) 5705/34151 ; jouée 10025/21118 |
| OP09-054 | Richie | mots-clés seulement (Blocker) | jouée 12107/51104 ; bloque 7302/41805 ; Contre (carte) 7065/33913 |
| OP09-058 | Maggy Ball spéciale | [Principale] 14325 (utile 12015) ; [Déclenchement] (codé) 3838 (utile 3103) | activée 14325/63090 ; [Déclenchement] proposé 3838/5082 |
| OP09-059 | Tour de passe-passe brouillard | [Contre] (Événement) 9415 (utile 9415) ; [Déclenchement] (codé) 3588 (utile 3588) | Contre (Événement) 9415/27658 ; [Déclenchement] proposé 3588/4715 |
| OP11-001 | Kobby | **mot-clé donné : jamais** ; remplacement d’une sortie 2976 (utile 2976) | — |
| OP11-094 | Morgan | aucun effet codé (effet générique ou vanille) | jouée 5975/8953 ; Contre (carte) 4685/18890 |
| OP11-096 | Ripper | [Bloqueur] sous condition 141650 | jouée 6027/30021 ; bloque 2772/15376 ; Contre (carte) 3371/14623 |
| OP11-099 | Quoi qu'il arrive... je deviendrai officier de la marine !! | [Principale] 8764 (utile 8764) | activée 7147/28863 ; [Déclenchement] proposé 1617/2107 |
| OP12-042 | Alvida | [Jouée] 8020 (utile 3216) ; coût modifié 107537 | jouée 8020/16916 ; Contre (carte) 4226/20809 |
| OP12-049 | Baggy | aucun effet codé (effet générique ou vanille) | Contre (carte) 5371/34091 ; jouée 14243/19033 |
| OP12-055 | Morge et Cabaji | aucun effet codé (effet générique ou vanille) | Contre (carte) 7463/44219 ; jouée 12491/25690 |
| OP14-025 | Kuro | [Jouée] 7988 (utile 3513) | jouée 7988/10128 |
| OP15-001 | Krieg | puissance adverse modifiée 1664248 ; [Activation : Principale] 47625 (utile 1952) | effet activé proposé 47625/137904 |
| OP15-007 | Gyn | [Jouée] 5965 (utile 2603) | jouée 5965/10482 ; Contre (carte) 4280/19342 |
| OP15-008 | Krieg | [Jouée] 5794 (utile 5794) ; [Activation : Principale] 5535 (utile 4546) | jouée 5794/7577 ; effet activé proposé 5535/13915 ; attaque le tour où elle est jouée 5090/80119 |
| OP15-009 | Kobby | remplacement d’une sortie 1563 (utile 1563) | jouée 6854/32825 ; Contre (carte) 3333/14477 |
| OP15-011 | Pearl | [En cas de KO] 3274 (utile 2059) ; [Bloqueur] sous condition 61822 ; puissance modifiée 297933 | jouée 5149/17034 ; bloque 3327/7414 ; Contre (carte) 4403/20141 |
| OP15-026 | Jango | [Jouée] 8600 (utile 8600) ; [Activation : Principale] 2682 (utile 2682) | jouée 8407/31498 ; Contre (carte) 3420/15795 ; effet activé proposé 2682/104880 |
| OP15-028 | Les frères Nyaban | [Jouée] 8813 (utile 4916) | Contre (carte) 3910/15807 ; jouée 8621/31971 |
| OP15-037 | Car c'est la seule issue d'un combat qui distingue les forts des faibles | [Principale] 7897 (utile 7897) ; [Déclenchement] (codé) 1803 (utile 1803) | activée 7897/28080 ; [Déclenchement] proposé 1803/2372 |
| OP15-038 | Et personne ne discute jamais mes ordres !! | [Principale] 4316 (utile 2322) ; [Contre] (Événement) 3233 (utile 2391) | activée 4316/98849 ; Contre (Événement) 3233/18381 |
| OP16-023 | Arlong | aucun effet codé (effet générique ou vanille) | jouée 4843/21388 ; Contre (carte) 1809/9080 |
| OP16-041 | Baggy | **effet « Quand ... » n° 1 : jamais** ; **effet « Quand ... » n° 2 : jamais** | — |
| OP16-048 | Baggy | [Jouée] 10908 (utile 8809) ; **effet « Quand ... » : jamais** | Contre (carte) 4756/24950 ; jouée 10908/17619 |
| ST01-001 | Monkey.D.Luffy | [Activation : Principale] 52783 (utile 43829) | effet activé proposé 52783/172917 |
| ST01-002 | Usopp | [En attaquant] 5184 (utile 2637) | jouée 4866/31322 ; Contre (carte) 4323/17964 ; [Déclenchement] proposé 2387/3115 |
| ST01-003 | Karoo | aucun effet codé (effet générique ou vanille) | jouée 7990/38962 ; Contre (carte) 3389/14239 |
| ST01-004 | Sanji | [Initiative] sous condition 2920 | jouée 10388/38241 ; attaque le tour où elle est jouée 135/1788 |
| ST01-005 | Jinbe | [En attaquant] 10252 (utile 2851) | jouée 10905/24576 |
| ST01-006 | Tony-Tony Chopper | mots-clés seulement (Blocker) | jouée 9188/65428 ; bloque 4185/22841 |
| ST01-007 | Nami | [Activation : Principale] 15491 (utile 12290) | jouée 6196/51407 ; Contre (carte) 4677/19798 ; effet activé proposé 15491/59428 |
| ST01-008 | Nico Robin | aucun effet codé (effet générique ou vanille) | Contre (carte) 3609/14737 ; jouée 7872/19095 |
| ST01-009 | Nefeltari Vivi | aucun effet codé (effet générique ou vanille) | jouée 7660/28583 ; Contre (carte) 3648/15735 |
| ST01-010 | Franky | aucun effet codé (effet générique ou vanille) | jouée 8478/14291 ; Contre (carte) 3256/13760 |
| ST01-011 | Brook | [Jouée] 6488 (utile 5770) | jouée 5804/24415 ; Contre (carte) 2940/14374 |
| ST01-012 | Monkey D. Luffy | [En attaquant] 11382 (utile 1051) | jouée 7345/10971 ; attaque le tour où elle est jouée 6190/77285 |
| ST01-013 | Roronoa Zoro | puissance modifiée 253975 | jouée 6646/17642 |
| ST01-014 | Guard Point | [Contre] (Événement) 4664 (utile 4664) ; [Déclenchement] (codé) 1465 (utile 1381) | Contre (Événement) 4664/10851 ; [Déclenchement] proposé 1465/1923 |
| ST01-015 | Gum-Gum Jet Pistol | [Principale] 6045 (utile 5087) | activée 4573/26366 ; [Déclenchement] proposé 1472/1932 |
| ST01-016 | Diable Jambe | [Principale] 2818 (utile 2232) ; [Déclenchement] (codé) 1516 (utile 248) | activée 2818/85619 ; [Déclenchement] proposé 1516/1971 |
| ST01-017 | Thousand Sunny | [Activation : Principale] 14504 (utile 14504) | jouée 6519/28787 ; effet activé proposé 14504/62012 |
| ST03-011 | Buggy | aucun effet codé (effet générique ou vanille) | Contre (carte) 3446/17154 ; jouée 7990/35413 |
| ST06-002 | Koby | [Jouée] 6382 (utile 608) | jouée 6367/29677 ; Contre (carte) 2702/12079 |
| ST06-004 | Smoker | mot-clé donné 232 ; ne peut pas être mis KO 498 | jouée 8872/14123 |
| ST06-006 | Tashigi | [Activation : Principale] 3389 (utile 3389) | Contre (carte) 4319/19168 ; jouée 5569/20307 ; effet activé proposé 3389/54708 |
| ST06-007 | Tsuru | mots-clés seulement (Blocker) | Contre (carte) 2659/11672 ; jouée 2888/17396 ; bloque 1479/7630 |
| ST06-008 | Hina | [Jouée] 8726 (utile 7034) | jouée 8692/20536 |
| ST06-010 | Hermep | [Jouée] 5386 (utile 3993) | Contre (carte) 3590/15341 ; jouée 5378/23592 |
| ST06-011 | Momonga | aucun effet codé (effet générique ou vanille) | Contre (carte) 5446/22841 ; jouée 9048/18866 |
| ST06-012 | Monkey.D.Garp | [Activation : Principale] 7783 (utile 7783) | jouée 5073/11276 ; effet activé proposé 7783/14517 |
| ST06-013 | T-Bone | aucun effet codé (effet générique ou vanille) | jouée 5988/16275 ; Contre (carte) 4013/16462 |
| ST06-014 | Onde de choc | [Contre] (Événement) 4306 (utile 4306) ; [Déclenchement] (codé) 1888 (utile 1570) | [Déclenchement] proposé 1888/2527 ; Contre (Événement) 4306/10295 |
| ST06-016 | White Out | [Contre] (Événement) 7690 (utile 7690) ; [Déclenchement] (codé) 2367 (utile 2367) | Contre (Événement) 7690/20917 ; [Déclenchement] proposé 2367/3103 |
| ST25-002 | Cabaji | [Bloqueur] sous condition 171968 ; puissance modifiée 830254 ; coût modifié 223484 | jouée 11716/34952 ; Contre (carte) 8596/46459 ; bloque 3244/10320 |
| ST25-004 | Baggy | [Activation : Principale] 5302 (utile 5302) | Contre (carte) 4967/24032 ; jouée 6579/20471 ; effet activé proposé 5302/13445 |
