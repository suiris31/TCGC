# Boosters : composition et taux de tirage

Les boosters gagnés dans l'Aventure s'ouvrent **aux taux réels** de la version anglaise : gratuits, mais ni plus
généreux ni plus avares qu'un vrai display. Ce document explique d'où viennent les chiffres, ce qu'on a retenu quand
les sources se contredisent, et ce qui reste incertain. Code : `game/boosters/open.ts` (tirage),
`game/boosters/sets/op03.ts` (description d'OP03), `game/boosters/sets/index.ts` (versions et visuels) ; tests :
`game/tests/boosters.test.ts`.

Le tirage se fait sur le serveur avec un aléatoire cryptographique (tâche 1.4) ; le navigateur ne reçoit que le
résultat. Le générateur ne lit pas le catalogue : la liste des cartes de l'extension est dans sa description, et les
tests vérifient qu'elle correspond au catalogue téléchargé (mêmes numéros, mêmes raretés).

## En bref : OP03 (Pillars of Strength), version anglaise

**Un booster** : 12 cartes. **Un display** : 24 boosters.

| Dans un display (24 boosters) | En moyenne | Soit environ | Garanti |
|---|---|---|---|
| Communes (C) | 183 | 7 ou 8 par booster | 7 par booster |
| Peu communes (UC) | 72 | 3 par booster | 3 par booster |
| Rares (R) | 16,3 | 2 boosters sur 3 | — |
| Leaders (L) | 7 | 1 booster sur 3,4 | 6 à 8 |
| Super rares (SR) | 7 | 1 booster sur 3,4 | 6 à 8 |
| Secrètes (SEC) | 0,66 | 1 display sur 1,5 | 0 à 2 |
| **Surprises** (parallèles, SP, manga) | 1,83 | 1 booster sur 13 | — |
| dont SR parallèle | 0,76 | 1 display sur 1,3 | |
| dont R parallèle | 0,42 | 1 display sur 2,4 | |
| dont Leader parallèle | 0,32 | 1 display sur 3,1 | |
| dont carte SP (« Wanted ») | 0,17 | 1 display sur 6 | |
| dont SEC parallèle | 0,15 | 1 display sur 6,5 | |
| dont SEC manga (Sogeking) | 0,017 | 1 display sur 60 (1 booster sur 1 440) | |
| **SEC ou surprise** | 2,5 | | **2 à 4** |

Chaque booster a **une** R, SR ou SEC. Une carte précise est rare : une SR parallèle donnée sort une fois tous les 13
displays, un Leader parallèle donné tous les 25, la Sogeking manga tous les 60.

## Ce que contient OP03

Liste officielle anglaise (page produit et liste des cartes de la série OP-03, consultées le 19 octobre 2026) :
**127 sortes de cartes** (8 Leaders, 45 C, 32 UC, 26 R, 10 SR, 2 SEC et 4 cartes SP) et **154 impressions** :

| Version | Identifiant (`variant`) | Cartes | Visuel chez Bandai |
|---|---|---|---|
| Normale | `base` | les 123 cartes OP03-001 à OP03-123 | visuel du catalogue du jeu (VF si la carte existe en français) |
| Parallèle (illustration alternative) | `parallele` | les 8 Leaders, les 10 SR, les 2 SEC et 6 R (OP03-018, 024, 047, 081, 086, 112) | `<numéro>_p1` |
| Parallèle manga | `manga` | Sogeking (OP03-122) | `OP03-122_p2` |
| Carte SP (affiche « Wanted ») | `sp` | Kid (OP01-051), Luffy (ST01-012), Doflamingo (ST03-009), Kaido (ST04-003) | `OP01-051_p2`, `ST01-012_p1`, `ST03-009_p1`, `ST04-003_p1` |

Les 4 cartes SP portent des numéros d'autres extensions (ce sont des réimpressions spéciales glissées dans les
boosters d'OP03) ; leur rareté imprimée est « SP CARD ». La version de base de ces cartes n'est pas dans les boosters.

**Comment TCGC les identifie déjà :**

- **Collection** (onglet Cartes, table `cards`, données TCGplayer) : une ligne par impression, avec la colonne
  `variant` à `NULL` pour la version normale, « Alternate Art » pour les 26 parallèles, « Alternate Art · Manga » pour
  la Sogeking manga et « Wanted Poster » pour les 4 cartes SP (rangées dans l'extension OP03). Visuel :
  `img/<product_id>.jpg` (miniature TCGplayer en cache, `server/images.js`). La même extension contient aussi une
  carte DON!! parallèle.
- **Jeu** (catalogue `data/game-catalog.json`, listes officielles de Bandai) : une carte par numéro, avec le visuel
  de sa version normale (`imageId`) ; les visuels sont relayés par le serveur : `/img-fr-hd/<imageId>.webp` et
  `/img-en-hd/<imageId>.webp` (`server/game-cards.js`). Les suffixes `_p1`, `_p2` désignent les autres impressions,
  mais **leur numérotation diffère entre les listes française et anglaise** (en VF, `OP03-122_p1` est une réédition) :
  les versions des boosters prennent donc leur visuel dans la liste anglaise, celle de la version simulée.

Dans un booster tiré, une version spéciale porte `imageUrl` = `img-en-hd/<imageId>.webp` (chemin relatif, comme les
autres visuels de l'appli). La Cale ne garde que le numéro et la version : `versionImageUrl(numéro, variant)` et
`variantLabel(variant)` (`game/boosters/sets/index.ts`) redonnent le visuel et le nom de la version (« Parallèle »,
« Parallèle manga », « Carte SP »).

## Les sources

Bandai ne publie **aucun taux** (toutes les sources le rappellent). Les chiffres viennent de la communauté.

| Source | Date | Version | Ce qu'elle apporte |
|---|---|---|---|
| [Torecamap (トレカの地図), page OP-03](https://torecamap.co.jp/column/op03/) | article de février 2025, mis à jour le 19 oct. 2026 | japonaise | taux **par genre** et par display : SEC 33,1 %, SR parallèle 37,93 %, R parallèle 20,69 %, Leader parallèle 15,86 %, carte SP 8,28 %, SEC parallèle 7,59 %, manga 1,38 % |
| [Toreca-begin](https://toreca-begin.jp/box-enclosed-pattern/) | 2 mars 2026 | japonaise | « patterns » de display : une SEC (33 %), une parallèle (42 %), deux parallèles (25 %) ; toujours une SEC ou une parallèle ; par display : Leaders environ 4, SR 3 à 4, R 7 à 8 ; carte SP environ 1 display sur 12 ; une DON!! parallèle |
| [Numberlabo](https://numberlabo.com/posts/onepiece-card-pull-rates/) | 28 mars 2026, mis à jour le 11 sept. 2026 | japonaise | mêmes patterns (42 / 33 / 25 %), « une SEC ou une parallèle garantie » ; cite Torecamap et Toreca-begin |
| [Gamerch (wiki)](https://gamerch.com/onepiececard/491812) | 26 déc. 2023 | japonaise | par display : Leaders 3 à 4, SR 3 à 4, R 7 à 8, parallèles 0 à 2, SEC 0 à 1 |
| [Onehappy](https://www.onehappy.co.jp/blog/rarity/) | 17 oct. 2024 | japonaise (toutes extensions) | par booster de 6 cartes : 3 à 4 C, 1 à 2 UC ; par display : Leaders 3 à 4, SR 3 à 4 ; carte SP environ 1 par carton de 12 displays |
| [Anianitarou](https://anianitarou.com/onepiece-kyoudai-probability/) | 2023, mis à jour le 23 nov. 2025 | japonaise | par display : Leaders environ 4, SR 3 à 4, DON!! parallèle environ 1 ; manga « une pour 10 à 20 cartons » (estimation de l'auteur) |
| [Samurai Sword Tokyo](https://samuraiswordtokyo.com/blogs/news/op-03-pillars-of-strength-pull-rates-best-cards) | 8 oct. 2026 | les deux | 154 impressions en VO (127 sortes + 27 parallèles) ; manga environ une pour 10 cartons (120 displays) |
| [onepiece.app](https://onepiece.app/set/OP03) | taux revus en juillet 2026 | anglaise | estimations par display : SR 7, Leaders 5, parallèles 2, SEC 1 sur 3, carte SP 1 sur 6, manga 1 sur 36 |
| [one-piece-tcg.com, guide des raretés](https://one-piece-tcg.com/guides/card-rarity-guide) | non daté | anglaise (générique) | par display anglais : au moins 24 R, 4 à 6 Leaders, 8 à 10 SR, environ 1 SEC et 2 parallèles, 1 DON!! parallèle |
| [Ripster](https://www.ripster.gg/blog/one-piece-tcg-pull-rates-by-set) | 2026 | anglaise | environ 7 SR et 1 SEC par display, une carte SP par carton (page refusée à la lecture : chiffres lus dans un résumé de recherche) |
| [TCGtalk](https://tcgtalk.com/guides/one-piece-tcg-box-pull-rates) | avril 2026 | japonaise (générique) | environ 8 SR et 12 Leaders par display, chiffres incohérents entre eux (nombre de R, taille d'un carton) |
| Pages produit officielles [anglaise](https://en.onepiece-cardgame.com/products/boosters/op03.php) et [asiatique](https://asia-en.onepiece-cardgame.com/products/boosters/op03.php) | consultées le 19 oct. 2026 | | 127 sortes, 27 parallèles ; sortie anglaise le 30 juin 2023 ; 12 cartes par booster en anglais, 6 en Asie et au Japon ; aucun taux |

**La source la mieux documentée est Torecamap** : ses pourcentages sont exactement des fractions de 145
(48, 55, 30, 23, 12, 11 et 2 sur 145), c'est donc un **comptage de 145 displays japonais** (environ 12 cartons). Les
patterns de Toreca-begin et Numberlabo (33 / 42 / 25 %) retombent exactement sur le même comptage (48, 61 et 36
displays sur 145) : les sites japonais reprennent les mêmes données, cohérentes entre elles. Les chiffres anglais, eux,
sont des estimations génériques (souvent les mêmes pour toutes les extensions), sans comptage publié ni méthode, et
qui se contredisent (SEC « environ 1 par display » ou « 1 sur 3 », Leaders « 4 à 6 » ou « 5 », 12 chez TCGtalk).

## Ce qu'on a retenu, et pourquoi

1. **Un display anglais vaut deux displays japonais.** Un booster anglais a 12 cartes, un japonais 6, et les deux
   displays ont 24 boosters : 288 cartes contre 144. Les chiffres anglais les plus repris sont le double des chiffres
   japonais : 7 à 8 SR contre 3 à 4, environ 2 parallèles contre 0,9, carte SP 1 display sur 6 (onepiece.app) contre
   1 sur 12, manga 1 sur 36 (onepiece.app) contre 1 sur 72 (Torecamap). On tire donc chaque display anglais comme
   **deux lots de 12 boosters**, chaque lot suivant les comptages d'un display japonais.
2. **Composition d'un booster** : 7 communes, 3 peu communes, un emplacement « libre » et un emplacement « rare ».
   - L'emplacement rare reçoit une R, une SR ou une SEC. Par lot : 3 ou 4 SR (chacun une chance sur deux), une SEC dans
     un tiers des lots, des R ailleurs, soit 7 à 9 R : c'est bien « R 7 à 8, SR 3 à 4, SEC 0 à 1 » des sites japonais,
     et « une rare au moins par booster » des guides anglais.
   - L'emplacement libre reçoit une commune, sauf pour 3 ou 4 boosters du lot qui ont un Leader (« Leaders 3 à 4 » ou
     « environ 4 »), et 1 ou 2 qui ont une surprise. Un booster a donc 7 ou 8 communes : proportion cohérente avec
     « 3 à 4 C et 1 à 2 UC par booster de 6 cartes ».
3. **SEC ou surprises, par lot** : une SEC (48 fois sur 145), une surprise (61 fois), deux surprises (36 fois). Un lot
   n'a jamais ni SEC ni surprise, comme les displays japonais : un display anglais en a donc **2 à 4**.
4. **Genre d'une surprise** : poids 55 (SR parallèle), 30 (R parallèle), 23 (Leader parallèle), 12 (carte SP),
   11 (SEC parallèle), soit les 133 surprises comptées hors manga. Dans un genre, chaque carte a la même chance
   (Torecamap donne d'ailleurs la même chance par carte aux SR et aux SEC parallèles).
5. **La manga** : 2 seulement dans les 145 displays, trop peu pour mesurer (un taux réel entre 0,2 % et 5 % par display
   collerait aussi à ce comptage). Les autres estimations disent une pour 10 à 20 cartons japonais (120 à 240
   displays), ou une pour 10 cartons. On retient **une pour environ 120 displays japonais** (poids 1,2), soit une pour
   60 displays anglais : prudent sans la rendre introuvable.
6. **Un booster seul** (récompense d'un chapitre) est un booster pris au hasard dans un lot complet : il a exactement
   les taux d'un display, sans ses garanties, comme un booster acheté à l'unité.
7. **Ordre des cartes** : les communes d'abord, puis peu communes, Leader, R, SR, SEC, et la surprise en dernier, comme
   la carte rare au fond d'un vrai booster (l'écran d'ouverture les révèle dans cet ordre).

## Incertitudes et limites

- **Version anglaise déduite de la japonaise.** Aucun comptage anglais d'OP03 n'est publié ; l'hypothèse « un display
  anglais = deux japonais » colle aux chiffres anglais les plus repris (SR, parallèles, SP, manga), mais pas à tous :
  les guides anglais annoncent 4 à 6 Leaders (nous : 6 à 8) et parfois « une SEC par display » (nous : 0,66). Si un
  comptage anglais sérieux paraît, il suffit de changer `lot` et `hits` dans `sets/op03.ts`.
- **Répartition dans le display** : on sait combien de SR, Leaders, SEC et surprises contient un display, pas dans
  quels boosters. On les place au hasard (jamais deux SR dans le même booster, ni Leader et surprise ensemble).
- **Échantillon** : 145 displays donnent les taux des genres fréquents à environ 15 % près (un écart-type ; SR
  parallèle : 55 comptées), ceux des genres rares beaucoup moins bien (SEC parallèle : 11, carte SP : 12, environ 30 %).
- **3 ou 4** : les sites donnent « 3 à 4 » SR et Leaders par display japonais sans proportions ; on prend une chance sur
  deux pour chaque valeur.
- **Cartes DON!!** : les boosters contiennent parfois une carte DON!! parallèle (environ une par display japonais),
  à la place d'une commune. Ce ne sont pas des cartes du deck ni de la collection du jeu : on ne les simule pas, la
  commune reste.
- **Pas de doublon dans un booster** (même impression) ; d'un booster à l'autre, les doublons sont normaux.

## Ajouter une extension

1. Écrire `game/boosters/sets/<code>.ts` sur le modèle d'OP03 : numéros par rareté (liste officielle anglaise),
   emplacements, lot et surprises (genres, poids, versions avec leur visuel `_pN` de la liste anglaise), sources dans ce
   document.
2. L'ajouter à `BOOSTER_SETS` (`sets/index.ts`) : `boosterSets()` la propose alors.
3. Étendre `game/tests/boosters.test.ts` (catalogue, taux, garanties). Si une carte reçoit une deuxième version du même
   genre, son identifiant porte le code de l'extension (« sp-op05 ») pour ne pas confondre deux visuels dans la Cale.
