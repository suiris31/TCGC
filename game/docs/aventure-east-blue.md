# Aventure : l'arc East Blue

Scénario, adversaires, decks et récompenses du premier arc du mode Aventure (tâche 1.2 du plan « Aventure »).
Données : `game/adventure/east-blue.ts` (chapitres, dialogues, récompenses) et `game/adventure/decks.ts` (vrais decks
des adversaires, correspondance chapitre → vrai deck). Test : `game/tests/adventure-data.test.ts`.

Tous les textes (dialogues, titres, résumés) sont **écrits par nous**, sans citation du manga ni de l'anime : on suit
les grandes étapes de l'histoire avec nos mots. Les noms des personnages et des lieux désignent les cartes et
l'histoire, comme partout dans l'appli.

## Synopsis

Luffy prend la mer seul, avec un chapeau de paille et l'idée fixe de devenir le plus grand pirate. Le joueur incarne
Luffy et son deck de départ, **ST-01**.

1. **Shells Town** : la Marine du capitaine Morgan tient la ville par la peur ; son fils Hermep fait le fanfaron, le
   jeune Kobby rêve d'entrer dans la Marine, et un épéiste, Zoro, est attaché dans la cour. Victoire : **Zoro** rejoint
   l'équipage, Kobby s'engage dans la Marine.
2. **Orange Town** : la bande de Baggy le Clown (Cabaji l'acrobate, Morge et son lion Richie) occupe la ville. Une
   voleuse, Nami, veut la carte de Grand Line que garde Baggy. Victoire : Nami suit l'équipage, « pour le trésor ».
3. **Village de Sirop** : Usopp annonce une attaque de pirates que personne ne croit ; le majordome de Kaya n'est autre
   que Kuro, capitaine du Chat Noir, qui prépare son coup depuis trois ans. Victoire : Kaya offre un navire, **Usopp**
   rejoint l'équipage.
4. **Baratie** : le restaurant flottant de Zeff et Sanji est attaqué par Don Krieg et son armada affamée. Victoire :
   **Sanji** devient le cuisinier du navire.
   - **Défi** : Mihawk, le meilleur épéiste du monde, arrive au Baratie ; Zoro veut l'affronter.
5. **Arlong Park** : Arlong et ses hommes-poissons rançonnent Cocoyashi ; Nami travaille pour lui en secret pour
   racheter son village. Victoire : le village est libre, **Nami** rejoint l'équipage pour de bon.
   - **Défi** : à Loguetown, Baggy et Alvida, alliés, guettent Luffy près de l'échafaud.
6. **Loguetown** : dernière ville avant Grand Line, gardée par le capitaine Smoker et Tashigi. Victoire : une tempête
   ouvre la route de Grand Line, l'arc est terminé.

## Chapitres

| Ordre | Identifiant | Titre | Lieu | Adversaire | Niveau | Deck provisoire | Vrai deck | Récompenses |
|---|---|---|---|---|---|---|---|---|
| 1 | `eb-1-shells-town` | Le chasseur de pirates | Shells Town | Capitaine Morgan | 1 Débutant | ST-33 | `AV-EB-MORGAN` | 2 boosters, Zoro (OP01-025) |
| 2 | `eb-2-orange-town` | Le clown d'Orange Town | Orange Town | Baggy le Clown | 1 Débutant | ST-36 | `AV-EB-BAGGY` | 2 boosters |
| 3 | `eb-3-sirop` | Le majordome de Sirop | Village de Sirop | Kuro | 2 Confirmé | ST-32 | `AV-EB-KURO` | 2 boosters, Usopp (ST21-002) |
| 4 | `eb-4-baratie` | Le restaurant sur la mer | Baratie | Don Krieg | 2 Confirmé | ST-34 | `AV-EB-KRIEG` | 2 boosters, Sanji (OP10-005) |
| 5 | `eb-defi-mihawk` | Défi : le plus grand épéiste | Baratie | Mihawk | 4 IA entraînée | — | META-MIHAWK-2026-10 (déjà le vrai) | 3 boosters |
| 6 | `eb-5-arlong-park` | Le parc des hommes-poissons | Arlong Park | Arlong | 3 Expert | ST-31 | `AV-EB-ARLONG` | 2 boosters, Nami (OP01-016) |
| 7 | `eb-defi-baggy` | Défi : l'échafaud de Loguetown | Loguetown | Baggy et Alvida | 3 Expert | ST-22 | `AV-EB-BAGGY-ALVIDA` | 3 boosters |
| 8 | `eb-6-loguetown` | Dernière escale avant Grand Line | Loguetown | Smoker | 3 Expert | META-SABO-2026-10 | `AV-EB-SMOKER` | 4 boosters |

- **Déblocage** (règle par défaut de `progress.ts`) : chaque chapitre demande le chapitre obligatoire précédent. Le
  défi de Mihawk s'ouvre après le Baratie, celui de Baggy et Alvida après Arlong Park, en même temps que Loguetown :
  le joueur peut y gagner 3 boosters de plus avant d'affronter Smoker. Les défis ne bloquent jamais l'histoire.
- **Positions sur la carte** (`map`, de 0 à 1 dans la zone East Blue) : d'ouest en est dans l'ordre du voyage, en
  zigzag ; chaque défi est placé près du lieu de son chapitre (au nord du Baratie, au nord de Loguetown).
- **Deck de départ** : `starterDeck` reste ST-21 (jouable) jusqu'à ce que ST-01 le soit (tâche 1.14) ;
  `EAST_BLUE_REAL_DECKS.starterDeck` vaut `'ST-01'`.
- **Decks provisoires** : ceux de la tâche 0 sont gardés ; le nouveau défi joue ST-22 (bleu, comme Baggy) en attendant.
- **Règles spéciales** (`rules`) : aucune, le moteur ne sait pas encore les appliquer.

## Dialogues

Pour chaque chapitre : une introduction, une scène de victoire et une scène de défaite, de 3 à 6 répliques (24 scènes).
Le ton suit la série : l'appétit et l'entêtement de Luffy, l'humour (Baggy et ses morceaux, Usopp et ses mensonges),
les rencontres de l'équipage. Les scènes célèbres sont évoquées sans en reprendre les répliques (pas de serment de
Zoro, pas d'appel à l'aide de Nami, pas d'adieux de Sanji à Zeff mot pour mot).

**Portraits** (`card`) : l'illustration d'une carte du personnage, toujours une carte d'OP03, de ST-01, d'un deck de
l'aventure ou déjà jouable (le navigateur ne reçoit que les cartes jouables). Luffy ST01-001, Zoro ST01-013, Sanji
ST01-004 ; Nami OP03-030 (version « Arlong Pirates ») tant qu'elle travaille pour Arlong, puis ST01-007 ; Usopp
OP03-041 ; Baggy OP03-008 ; les adversaires et les habitants : leur carte d'OP03 quand elle existe (Kuro, Jango, Kaya,
Zeff, Gyn, Don Krieg, Arlong, Nojiko, Genzo, Hermep), sinon celle de leur deck (Kobby OP15-009, Morgan OP11-094,
Cabaji OP02-052, Morge OP02-060, Alvida OP01-064, Smoker OP02-093, Tashigi ST06-006) ; Mihawk OP15-027 (déjà jouable).

## Les decks des adversaires

Tous légaux (50 cartes, couleurs du Leader, 4 exemplaires au plus), à thème, de difficulté croissante. On a préféré
les cartes d'OP03, codées de toute façon à l'étape 1, sauf quand elles trahissaient le thème. Le détail des listes est
dans `decks.ts`.

| Deck | Leader | Thème et plan de jeu | Cartes d'OP03 |
|---|---|---|---|
| `AV-EB-MORGAN` | Kobby OP11-001 (rouge/noir) | La Marine de Shells Town : Morgan, Hermep, Ripper, Kobby. **Volontairement simple** : beaucoup de Personnages sans effet (Doberman, T-Bone, Momonga, Morgan 8000), deux contres simples. | 18 / 50 |
| `AV-EB-BAGGY` | Baggy OP16-041 (bleu) | La bande de Baggy : Baggy, Cabaji, Morge et Richie, les boulets Baggy (renvoi en main). Simple. | 0 / 50 (voir plus bas) |
| `AV-EB-KURO` | Kuro OP03-021 (vert) | L'équipage du Chat Noir (Jango, Sham, Buchi, les frères Nyaban, trois Kuro) : épuiser les Personnages adverses, puis mettre KO ceux qui sont épuisés. Que des Personnages {East Blue}, pour l'effet du Leader. | 36 / 50 |
| `AV-EB-KRIEG` | Krieg OP15-001 (rouge/vert) | L'armada de Don Krieg (Gin, Pearl, deux Krieg en vert et en rouge, la bombe de gaz) : seulement des Personnages {East Blue}, pour que le Leader affaiblisse l'adversaire pendant son tour. | 32 / 50 |
| `AV-EB-ARLONG` | Arlong OP03-022 (vert/jaune) | Les hommes-poissons d'Arlong Park (Hatchan, Kuroobi, Chew, Momoo, trois Arlong) et Nami : des Personnages à [Déclenchement] de coût 4 au plus, que le Leader pose en attaquant ; des sirènes jaunes en soutien. Solide. | 40 / 50 |
| `AV-EB-BAGGY-ALVIDA` | Baggy OP16-041 (bleu) | La bande de Baggy renforcée par Alvida (deux versions) et plus de Baggy de coût 5. Joué au niveau Expert. | 0 / 50 |
| `AV-EB-SMOKER` | Smoker OP02-093 (noir) | La Marine de Loguetown : Smoker (trois versions), Tashigi, Hina, Hermep, Kobby. Baisser les coûts adverses puis mettre KO les Personnages de coût 0 ; contres et Issho. **Le plus solide**. | 12 / 50 |

Choix et limites :

- **Morgan n'a pas de carte Leader** : le deck est mené par **Kobby OP11-001** (rouge/noir, {Navy}), présent à Shells
  Town. Autre possibilité : Garp OP02-002 (rouge/noir), sans lien avec Shells Town.
- **Baggy** : deux Leaders existent, tous deux bleus et d'époques plus tardives. **OP16-041** a le type {Buggy
  Pirates} ; son effet (jouer un [Prisonnier d'Impel Down]) ne sert pas dans ces decks, ce qui le rend simple pour un
  chapitre 2. Autre possibilité : OP09-042 ({Cross Guild}), dont l'effet jouerait avec Richie, Morge et Cabaji.
- **Pas de cartes d'OP03 chez Baggy** : les cartes bleues d'OP03 sont toutes des alliés de Luffy (Usopp, Kaya, Zeff,
  Nojiko, Genzo...). Les mettre chez Baggy aurait trahi l'histoire.
- **Cartes {East Blue} d'autres équipages** chez Kuro et Krieg (Alvida, Momoo, Hatchan, Chew, Pearl...) : leurs
  Leaders demandent des Personnages {East Blue}, et l'équipage du Chat Noir ou de Krieg seul ne remplit pas 50 cartes.
- **Mihawk** joue le deck méta déjà jouable `META-MIHAWK-2026-10` au niveau 4 (IA entraînée), qui a son modèle
  spécialisé. C'est le défi le plus dur de l'arc, pour les joueurs qui en veulent.
- **Équilibrage** : pas mesuré, les cartes n'étant pas encore codées. La tâche 1.19 le fait quand les decks sont
  jouables (parties contre ST-01 et contre un deck amélioré par les boosters).

## Cartes à coder hors OP03 et ST-01 : listes A et B

**49 cartes différentes** en tout (dont 4 Leaders), 12 déjà jouables (rien à faire, à part vérifier qu'elles le sont
toujours) et **37 à coder**. Chaque liste est formée de decks entiers et n'a aucune carte en commun avec l'autre.

- **Liste A** (tâche 1.15, `game/engine/cards/aventure-a.ts`) : la Marine et Kuro, decks `AV-EB-MORGAN`,
  `AV-EB-KURO`, `AV-EB-SMOKER`. **24 cartes, dont 18 à coder.**
- **Liste B** (tâche 1.16, `game/engine/cards/aventure-b.ts`) : Baggy, Krieg et Arlong, decks `AV-EB-BAGGY`,
  `AV-EB-BAGGY-ALVIDA`, `AV-EB-KRIEG`, `AV-EB-ARLONG`. **25 cartes, dont 19 à coder.**

Les cartes d'OP03 et de ST-01 de ces decks sont codées par les tâches 1.8 à 1.14 : les tâches 1.15 et 1.16 n'y
touchent pas. Nom affiché d'après le catalogue ; les longs titres d'Événements sont remplacés par une description.

### Liste A

| Numéro | Carte | Catégorie | Couleur | Decks (exemplaires) | À faire |
|---|---|---|---|---|---|
| OP02-093 | Smoker | Leader | noir | Smoker (Leader) | **à coder** |
| OP02-102 | Smoker | Personnage | noir | Smoker ×4 | **à coder** |
| OP02-117 | Ice Age | Événement | noir | Smoker ×2 | **à coder** |
| OP11-001 | Kobby | Leader | rouge/noir | Morgan (Leader) | **à coder** |
| OP11-096 | Ripper | Personnage | noir | Morgan ×4 | **à coder** |
| OP11-099 | Événement de Kobby (recherche {Navy}) | Événement | noir | Morgan ×4 | **à coder** |
| OP14-025 | Kuro | Personnage | vert | Kuro ×2 | **à coder** |
| OP15-009 | Kobby | Personnage | rouge | Morgan ×4 | **à coder** |
| OP15-026 | Jango | Personnage | vert | Kuro ×4 | **à coder** |
| OP15-028 | Les frères Nyaban | Personnage | vert | Kuro ×4 | **à coder** |
| ST06-002 | Kobby | Personnage | noir | Smoker ×4 | **à coder** |
| ST06-004 | Smoker | Personnage | noir | Smoker ×4 | **à coder** |
| ST06-006 | Tashigi | Personnage | noir | Smoker ×4 | **à coder** |
| ST06-008 | Hina | Personnage | noir | Smoker ×4 | **à coder** |
| ST06-010 | Hermep | Personnage | noir | Smoker ×4 | **à coder** |
| ST06-012 | Monkey D. Garp | Personnage | noir | Smoker ×2 | **à coder** |
| ST06-014 | Onde de choc | Événement | noir | Smoker ×4 | **à coder** |
| ST06-016 | White Out | Événement | noir | Morgan ×4, Smoker ×2 | **à coder** |
| OP02-107 | Doberman | Personnage | noir | Morgan ×4 | déjà jouable |
| OP04-023 | Kuro | Personnage | vert | Kuro ×4 | déjà jouable |
| OP11-094 | Morgan | Personnage | noir | Morgan ×4 | déjà jouable |
| ST06-007 | Tsuru | Personnage | noir | Smoker ×2 | déjà jouable |
| ST06-011 | Momonga | Personnage | noir | Morgan ×4, Smoker ×2 | déjà jouable |
| ST06-013 | T-Bone | Personnage | noir | Morgan ×4 | déjà jouable |

### Liste B

| Numéro | Carte | Catégorie | Couleur | Decks (exemplaires) | À faire |
|---|---|---|---|---|---|
| EB02-011 | Arlong | Personnage | vert | Arlong ×4 | **à coder** |
| OP01-064 | Alvida | Personnage | bleu | Baggy et Alvida ×4 | **à coder** |
| OP02-052 | Cabaji | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | **à coder** |
| OP02-058 | Baggy | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | **à coder** |
| OP06-023 | Arlong | Personnage | vert | Arlong ×4 | **à coder** |
| OP09-053 | Morge | Personnage | bleu | Baggy ×4, Baggy et Alvida ×2 | **à coder** |
| OP09-058 | Maggy Ball spéciale | Événement | bleu | Baggy ×4, Baggy et Alvida ×4 | **à coder** |
| OP09-059 | Tour de passe-passe brouillard | Événement | bleu | Baggy ×4, Baggy et Alvida ×4 | **à coder** |
| OP12-042 | Alvida | Personnage | bleu | Baggy et Alvida ×4 | **à coder** |
| OP15-001 | Krieg | Leader | rouge/vert | Krieg (Leader) | **à coder** |
| OP15-007 | Gyn | Personnage | rouge | Krieg ×4 | **à coder** |
| OP15-008 | Krieg | Personnage | rouge | Krieg ×2 | **à coder** |
| OP15-011 | Pearl | Personnage | rouge | Krieg ×4 | **à coder** |
| OP15-037 | Événement de Krieg (recherche {East Blue}) | Événement | vert | Krieg ×4 | **à coder** |
| OP15-038 | Événement de Krieg (verrou ou contre pour Krieg) | Événement | vert | Krieg ×4 | **à coder** |
| OP16-041 | Baggy | Leader | bleu | Baggy (Leader), Baggy et Alvida (Leader) | **à coder** |
| OP16-048 | Baggy | Personnage | bleu | Baggy ×2, Baggy et Alvida ×4 | **à coder** |
| ST25-002 | Cabaji | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | **à coder** |
| ST25-004 | Baggy | Personnage | bleu | Baggy ×4 | **à coder** |
| OP02-060 | Morge | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | déjà jouable |
| OP09-054 | Richie | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | déjà jouable |
| OP12-049 | Baggy | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | déjà jouable |
| OP12-055 | Morge et Cabaji | Personnage | bleu | Baggy ×4, Baggy et Alvida ×4 | déjà jouable |
| OP16-023 | Arlong | Personnage | vert | Arlong ×2 | déjà jouable |
| ST03-011 | Baggy | Personnage | bleu | Baggy ×4 | déjà jouable |

## Récompenses

Données à la **première victoire** de chaque chapitre (contrat, § 5).

- **Boosters OP03** : 2 par chapitre, 3 par défi, 4 pour Smoker, soit **20 boosters** sur l'arc (14 sans les défis).
- **Recrues** : quand un membre de l'équipage rejoint Luffy, le joueur reçoit **1 carte rouge de ce personnage**,
  jouable tout de suite dans son deck de départ, et qu'il n'a pas déjà :
  - Zoro, après Shells Town : **OP01-025** (Super Rare, [Initiative]) ;
  - Usopp, après Sirop : **ST21-002** (contre 2000) ;
  - Sanji, après le Baratie : **OP10-005** (Super Rare, +3000 pendant ton tour) ;
  - Nami, après Arlong Park : **OP01-016** (va chercher une carte {Équipage de Chapeau de paille}).

  Pourquoi pas les cartes d'OP03 ou de ST-01 proposées par le plan : ST-01 contient déjà ces quatre personnages
  (probablement en 4 exemplaires, un cinquième ne servirait à rien dans un deck), et les versions d'OP03 d'Usopp
  (OP03-041) et de Nami (OP03-030, OP03-040) sont bleues ou vertes, inutilisables avec Luffy rouge. Les quatre recrues
  choisies sont déjà jouables (rien à coder) et le test vérifie qu'elles sont rouges.

## Pour la tâche 1.19 (brancher les vrais decks)

- Enregistrer les 7 decks de `ADVENTURE_DECKS` dans `game/engine/decks.ts` quand leurs cartes sont jouables
  (`playableErrors` vide), puis remplacer `opponent.deck` de chaque chapitre par `EAST_BLUE_REAL_DECKS[id]`, et
  `starterDeck` par `EAST_BLUE_REAL_DECKS.starterDeck` (`ST-01`). Le défi de Mihawk n'a pas d'entrée : il garde
  `META-MIHAWK-2026-10`.
- Équilibrer : niveaux d'IA, quelques exemplaires, éventuellement les recrues (nombre d'exemplaires) d'après ST-01
  (tâche 1.14).

## Questions ouvertes

1. **Leader du chapitre 1** : Kobby OP11-001 faute de Leader Morgan. Garder, ou Garp OP02-002 ?
2. **Leader de Baggy** : OP16-041 ({Buggy Pirates}, effet inutilisé) ou OP09-042 ({Cross Guild}, effet utile avec
   Richie, Morge et Cabaji) ?
3. **Recrues** : cartes rouges utiles tout de suite (choix actuel), ou versions d'OP03 plus fidèles à l'époque mais
   d'une autre couleur (Usopp OP03-041, Nami Leader OP03-040, qui ouvrirait un deck East Blue bleu) ?
4. **Défi de Mihawk au niveau 4** (IA entraînée) : à garder si l'IA entraînée est bien plus forte que l'Expert avec ce
   deck ; sinon niveau 3.
5. **Second défi** (Baggy et Alvida à Loguetown) : le plan demandait 1 ou 2 défis ; celui-ci rejoue la bande de Baggy
   au niveau Expert, avec deux Alvida en plus (2 cartes à coder). À retirer si l'on veut alléger la liste B.
6. **Règles spéciales** : un chapitre 1 avec moins de Vies pour Morgan (`rules.aiLife`) aiderait les débutants, quand
   le moteur saura l'appliquer.
