# Validation des decks

148120 parties IA contre IA (280 par confrontation), 21760270 décisions, 1310 s.
Contrôles de cohérence à chaque décision : aucun problème.

## À examiner

- AV-EB-BAGGY Baggy (OP16-041) : effet effet « Quand ... » jamais déclenché
- AV-EB-BAGGY Baggy (OP16-048) : effet effet « Quand ... » jamais déclenché
- AV-EB-KURO Jango (OP15-026) : « effet activé » proposé 183127 fois, jamais choisi
- AV-EB-KURO Jango (OP15-026) : effet [Activation : Principale] jamais déclenché
- AV-EB-BAGGY-ALVIDA Baggy (OP16-041) : effet effet « Quand ... » jamais déclenché
- AV-EB-BAGGY-ALVIDA Baggy (OP16-048) : effet effet « Quand ... » jamais déclenché

## Jamais choisis, mais voulu

- ST-33 Ice Block, bec de faisan (OP12-057) : « [Déclenchement] choisi » proposé 3196 fois, jamais choisi — voulu : prendre Ice Block en main (Contre +4000) vaut mieux que son [Déclenchement]
- ST-33 Ice Block, bec de faisan (OP12-057) : effet [Déclenchement] jamais déclenché — voulu : idem
- ST-34 Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) : « [Déclenchement] choisi » proposé 4781 fois, jamais choisi — voulu : prendre la carte en main (Contre +5000) vaut mieux que piocher 1 carte
- ST-34 Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) : effet [Déclenchement] jamais déclenché — voulu : idem
- ST-36 Capone "Gang" Bege (OP10-103) : « jouée » proposé 95319 fois, jamais choisi — voulu : Capone Bege (0 de puissance) sert de Contre +2000
- META-XEBEC-2026-10 Buckin (OP08-051) : effet [Jouée] jamais utile (10365 déclenchement(s)) — voulu : Buckin ne renforce que [Edward Weevil], absent du Xebec du méta (il y sert de Personnage de coût 1 « Équipage de Rocks »)
- META-KAIDO-2026-10 Kaido (OP17-058) : effet [En attaquant] jamais utile (79914 déclenchement(s)) — voulu : l’IA simple ne prévoit que des attaques qui passent déjà : le −2000 du Leader Kaido sert en défense ([Attaque adverse])

## Victoires (IA simple contre IA simple)

- ST-35 Sabo (rouge/noir) : 67 %
- ST-31 Luffy (rouge) : 64 %
- ST-32 Zoro (vert) : 74 %
- ST-33 Kuzan (bleu) : 72 %
- ST-34 Katakuri (violet) : 48 %
- ST-36 Kid (jaune) : 65 %
- META-SABO-2026-10 Sabo (méta, octobre 2026) : 85 %
- META-MIHAWK-2026-10 Mihawk (méta, octobre 2026) : 80 %
- META-ROBIN-2026-10 Nico Robin (méta, octobre 2026) : 81 %
- META-XEBEC-2026-10 Rocks D. Xebec (méta, octobre 2026) : 73 %
- META-ENEL-2026-10 Ener (méta, octobre 2026) : 61 %
- META-KAIDO-2026-10 Kaido (méta, octobre 2026) : 61 %
- ST-21 Luffy Gear 5 (rouge) : 41 %
- ST-22 Ace et Newgate (bleu) : 39 %
- ST-30 Luffy et Ace (rouge/vert) : 56 %
- ST-01 Chapeaux de paille (rouge) : 19 %
- AV-EB-MORGAN Marine de Shells Town (Morgan) : 16 %
- AV-EB-BAGGY Bande de Baggy (Orange Town) : 20 %
- AV-EB-KURO Pirates du Chat Noir (Kuro) : 22 %
- AV-EB-KRIEG Armada de Don Krieg (Baratie) : 31 %
- AV-EB-ARLONG Pirates d’Arlong (Arlong Park) : 26 %
- AV-EB-BAGGY-ALVIDA Baggy et Alvida (Loguetown) : 25 %
- AV-EB-SMOKER Marine de Loguetown (Smoker) : 24 %

## ST-35 Sabo (rouge/noir)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Sabo (OP13-004) | effet permanent | | | |
| Emporio Ivankov (OP13-008) | remplacement | 872 | 872 | |
| Emporio Ivankov (OP13-008) | jouée | | | 49288 → 6550 (13 %) |
| Emporio Ivankov (OP13-008) | Contre (carte) | | | 40954 → 7082 (17 %) |
| Belo Betty (OP12-090) | [En attaquant] | 4861 | 1131 | |
| Belo Betty (OP12-090) | jouée | | | 50931 → 5254 (10 %) |
| Belo Betty (OP12-090) | Contre (carte) | | | 55869 → 8143 (15 %) |
| Corbeau (ST35-003) | [En attaquant] | 4724 | 437 | |
| Corbeau (ST35-003) | jouée | | | 51347 → 5171 (10 %) |
| Corbeau (ST35-003) | Contre (carte) | | | 55467 → 8167 (15 %) |
| Morley (OP12-093) | jouée | | | 43008 → 4914 (11 %) |
| Morley (OP12-093) | Contre (carte) | | | 59120 → 8956 (15 %) |
| Inazuma (OP13-005) | [Jouée] | 4073 | 4073 | |
| Inazuma (OP13-005) | jouée | | | 44489 → 4073 (9 %) |
| Inazuma (OP13-005) | Contre (carte) | | | 65241 → 9934 (15 %) |
| Sabo (P-105) | [Jouée] | 12112 | 5276 | |
| Sabo (P-105) | jouée | | | 46535 → 12112 (26 %) |
| Sabo (P-105) | bloque | | | 27913 → 8971 (32 %) |
| Hack (ST35-001) | [Jouée] | 10815 | 7320 | |
| Hack (ST35-001) | jouée | | | 30404 → 6649 (22 %) |
| Hack (ST35-001) | bloque | | | 44429 → 2734 (6 %) |
| Hack (ST35-001) | Contre (carte) | | | 38971 → 5745 (15 %) |
| Lindbergh (ST35-002) | [Jouée] | 2737 | 2734 | |
| Lindbergh (ST35-002) | jouée | | | 25839 → 1082 (4 %) |
| Lindbergh (ST35-002) | Contre (carte) | | | 36600 → 4929 (13 %) |
| Koala (OP13-081) | [Activation : Principale] | 16915 | 16915 | |
| Koala (OP13-081) | jouée | | | 22552 → 8841 (39 %) |
| Koala (OP13-081) | Contre (carte) | | | 31912 → 4282 (13 %) |
| Koala (OP13-081) | effet activé | | | 69526 → 16915 (24 %) |
| Bartholomew Kuma (ST35-005) | [Jouée] | 3554 | 3554 | |
| Bartholomew Kuma (ST35-005) | jouée | | | 13223 → 3554 (27 %) |
| Bartholomew Kuma (ST35-005) | Contre (carte) | | | 21154 → 3051 (14 %) |
| Monkey D. Dragon (OP13-017) | remplacement | 2024 | 2024 | |
| Monkey D. Dragon (OP13-017) | Contre (carte) | | | 29776 → 3643 (12 %) |
| Monkey D. Dragon (OP13-017) | jouée | | | 17271 → 9602 (56 %) |
| Koala (ST35-004) | [Jouée] | 5108 | 5108 | |
| Koala (ST35-004) | jouée | | | 6837 → 5108 (75 %) |
| Koala (ST35-004) | bloque | | | 11687 → 3294 (28 %) |
| Koala (ST35-004) | Contre (carte) | | | 15470 → 1647 (11 %) |
| Pointe dépilatoire (OP12-098) | [Contre] (Événement) | 7565 | 7565 | |
| Pointe dépilatoire (OP12-098) | [Déclenchement] | 3156 | 3156 | |
| Pointe dépilatoire (OP12-098) | Contre (Événement) | | | 33768 → 7565 (22 %) |
| Pointe dépilatoire (OP12-098) | [Déclenchement] choisi | | | 3156 → 3156 (100 %) |
| Les flammes d'Ace, elles, ne vous ont pas pardonnés ! (OP13-019) | [Principale] | 7749 | 7749 | |
| Les flammes d'Ace, elles, ne vous ont pas pardonnés ! (OP13-019) | [Contre] (Événement) | 2936 | 2936 | |
| Les flammes d'Ace, elles, ne vous ont pas pardonnés ! (OP13-019) | activée | | | 108145 → 7749 (7 %) |
| Les flammes d'Ace, elles, ne vous ont pas pardonnés ! (OP13-019) | Contre (Événement) | | | 33451 → 2936 (9 %) |

## ST-31 Luffy (rouge)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Monkey D. Luffy (ST21-001) | [Activation : Principale] | 77468 | 77468 | |
| Monkey D. Luffy (ST21-001) | effet activé | | | 100029 → 77468 (77 %) |
| Sanji (ST31-001) | [Jouée] | 4668 | 4668 | |
| Sanji (ST31-001) | jouée | | | 9237 → 4668 (51 %) |
| Sanji (ST31-001) | Contre (carte) | | | 14797 → 2352 (16 %) |
| Sanji (ST31-001) | attaque le tour où elle est jouée | | | 6548 → 393 (6 %) |
| Monkey D. Luffy (ST31-004) | [Jouée] | 9291 | 9289 | |
| Monkey D. Luffy (ST31-004) | jouée | | | 12722 → 9291 (73 %) |
| Monkey D. Luffy (ST31-004) | attaque le tour où elle est jouée | | | 63820 → 5972 (9 %) |
| Thousand Sunny (ST31-005) | [Jouée] | 6529 | 6529 | |
| Thousand Sunny (ST31-005) | [Activation : Principale] | 21345 | 21345 | |
| Thousand Sunny (ST31-005) | jouée | | | 22430 → 5418 (24 %) |
| Thousand Sunny (ST31-005) | effet activé | | | 27454 → 21345 (78 %) |
| Jinbe (ST31-002) | [Jouée] | 9700 | 9700 | |
| Jinbe (ST31-002) | Contre (carte) | | | 35176 → 6970 (20 %) |
| Jinbe (ST31-002) | jouée | | | 19964 → 7851 (39 %) |
| Jinbe (ST31-002) | bloque | | | 16252 → 5742 (35 %) |
| Brook (ST31-003) | jouée | | | 48196 → 6508 (14 %) |
| Brook (ST31-003) | bloque | | | 10427 → 4001 (38 %) |
| Brook (ST31-003) | Contre (carte) | | | 41819 → 7089 (17 %) |
| Nami (OP01-016) | [Jouée] | 16674 | 16674 | |
| Nami (OP01-016) | jouée | | | 81933 → 14150 (17 %) |
| Nami (OP01-016) | Contre (carte) | | | 45395 → 6793 (15 %) |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Contre] (Événement) | 11589 | 11589 | |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Déclenchement] | 5199 | 5199 | |
| Menu "Bonnes manières", Kick Course (OP04-016) | Contre (Événement) | | | 82713 → 11589 (14 %) |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Déclenchement] choisi | | | 5199 → 5199 (100 %) |
| Usopp (OP11-003) | jouée | | | 34618 → 7261 (21 %) |
| Usopp (OP11-003) | Contre (carte) | | | 73377 → 11528 (16 %) |
| Nico Robin (OP11-009) | [En attaquant] | 6247 | 4781 | |
| Nico Robin (OP11-009) | jouée | | | 38104 → 7059 (19 %) |
| Nico Robin (OP11-009) | Contre (carte) | | | 42943 → 7421 (17 %) |
| Franky (OP11-012) | effet « Quand ... » | 1833 | 1833 | |
| Franky (OP11-012) | jouée | | | 40384 → 6201 (15 %) |
| Franky (OP11-012) | Contre (carte) | | | 68346 → 10295 (15 %) |
| Gum Gum Rafale (OP13-021) | [Principale] | 7408 | 7408 | |
| Gum Gum Rafale (OP13-021) | [Déclenchement] | 3549 | 3529 | |
| Gum Gum Rafale (OP13-021) | activée | | | 81186 → 7408 (9 %) |
| Gum Gum Rafale (OP13-021) | [Déclenchement] choisi | | | 3549 → 3549 (100 %) |
| Roronoa Zoro (OP14-015) | [En attaquant] | 22751 | 22675 | |
| Roronoa Zoro (OP14-015) | jouée | | | 26581 → 13563 (51 %) |
| Roronoa Zoro (OP14-015) | attaque le tour où elle est jouée | | | 191726 → 12784 (7 %) |
| Tony-Tony Chopper (P-101) | [Jouée] | 8927 | 8927 | |
| Tony-Tony Chopper (P-101) | jouée | | | 24622 → 8015 (33 %) |
| Tony-Tony Chopper (P-101) | bloque | | | 19700 → 2622 (13 %) |
| Tony-Tony Chopper (P-101) | Contre (carte) | | | 35663 → 6459 (18 %) |
| Monkey D. Luffy (ST23-004) | [Activation : Principale] | 8243 | 8243 | |
| Monkey D. Luffy (ST23-004) | jouée | | | 47343 → 8454 (18 %) |
| Monkey D. Luffy (ST23-004) | effet activé | | | 50709 → 8243 (16 %) |
| Monkey D. Luffy (ST23-004) | Contre (carte) | | | 23511 → 3512 (15 %) |

## ST-32 Zoro (vert)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Roronoa Zoro (OP12-020) | [Activation : Principale] | 19921 | 19921 | |
| Roronoa Zoro (OP12-020) | effet activé | | | 20728 → 19921 (96 %) |
| Oden Kozuki (ST32-002) | [Jouée] | 19727 | 19727 | |
| Oden Kozuki (ST32-002) | Contre (carte) | | | 75792 → 15734 (21 %) |
| Oden Kozuki (ST32-002) | jouée | | | 38169 → 13243 (35 %) |
| Dracule Mihawk (ST32-003) | [Jouée] | 6943 | 6710 | |
| Dracule Mihawk (ST32-003) | effet « Quand ... » | 6186 | 6186 | |
| Dracule Mihawk (ST32-003) | jouée | | | 11031 → 6943 (63 %) |
| Roronoa Zoro (ST32-005) | [Jouée] | 5594 | 3001 | |
| Roronoa Zoro (ST32-005) | jouée | | | 22125 → 5549 (25 %) |
| Roronoa Zoro (ST32-005) | Contre (carte) | | | 12605 → 1816 (14 %) |
| Roronoa Zoro (ST32-005) | attaque le tour où elle est jouée | | | 25920 → 1197 (5 %) |
| Kinémon (ST32-001) | [Jouée] | 31837 | 25284 | |
| Kinémon (ST32-001) | jouée | | | 91317 → 30401 (33 %) |
| Kinémon (ST32-001) | Contre (carte) | | | 54385 → 10090 (19 %) |
| Silvers Rayleigh (ST32-004) | [Jouée] | 5957 | 3924 | |
| Silvers Rayleigh (ST32-004) | jouée | | | 26911 → 5581 (21 %) |
| Silvers Rayleigh (ST32-004) | Contre (carte) | | | 46281 → 8781 (19 %) |
| Silvers Rayleigh (ST32-004) | attaque le tour où elle est jouée | | | 37598 → 4244 (11 %) |
| Perona (OP10-036) | effet « Quand ... » | 2409 | 2389 | |
| Perona (OP10-036) | jouée | | | 28144 → 4179 (15 %) |
| Perona (OP10-036) | Contre (carte) | | | 48943 → 9618 (20 %) |
| Kawamatsu (OP12-023) | Contre (carte) | | | 145397 → 25657 (18 %) |
| Kawamatsu (OP12-023) | jouée | | | 62570 → 13005 (21 %) |
| Kuina (OP12-026) | [Activation : Principale] | 3269 | 3269 | |
| Kuina (OP12-026) | jouée | | | 28621 → 2558 (9 %) |
| Kuina (OP12-026) | Contre (carte) | | | 48837 → 9499 (19 %) |
| Kuina (OP12-026) | effet activé | | | 4515 → 3269 (72 %) |
| Koshiro (OP12-027) | remplacement | 502 | 502 | |
| Koshiro (OP12-027) | jouée | | | 34383 → 9846 (29 %) |
| Koshiro (OP12-027) | bloque | | | 30311 → 4927 (16 %) |
| Koshiro (OP12-027) | Contre (carte) | | | 26763 → 4061 (15 %) |
| Hiyori Kozuki (OP12-028) | [Activation : Principale] | 8877 | 8877 | |
| Hiyori Kozuki (OP12-028) | jouée | | | 43023 → 8359 (19 %) |
| Hiyori Kozuki (OP12-028) | Contre (carte) | | | 24107 → 3883 (16 %) |
| Hiyori Kozuki (OP12-028) | effet activé | | | 27574 → 8877 (32 %) |
| Tashigi (OP12-031) | [Jouée] | 13311 | 13311 | |
| Tashigi (OP12-031) | jouée | | | 25004 → 10812 (43 %) |
| Luffy deviendra un jour le roi des pirates !! (OP12-039) | [Déclenchement] | 3269 | 3269 | |
| Luffy deviendra un jour le roi des pirates !! (OP12-039) | [Principale] | 3533 | 3533 | |
| Luffy deviendra un jour le roi des pirates !! (OP12-039) | activée | | | 60137 → 3533 (6 %) |
| Luffy deviendra un jour le roi des pirates !! (OP12-039) | [Déclenchement] choisi | | | 3269 → 3269 (100 %) |
| Ryuma (OP15-036) | [Jouée] | 14458 | 7500 | |
| Ryuma (OP15-036) | [En attaquant] | 13459 | 6174 | |
| Ryuma (OP15-036) | jouée | | | 22093 → 14458 (65 %) |
| X-Drake (ST24-005) | [Jouée] | 4278 | 3467 | |
| X-Drake (ST24-005) | Contre (carte) | | | 67066 → 10949 (16 %) |
| X-Drake (ST24-005) | jouée | | | 26769 → 3435 (13 %) |

## ST-33 Kuzan (bleu)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Kuzan (OP12-040) | effet « Quand ... » | 68948 | 68948 | |
| Smoker (ST33-003) | [Jouée] | 6273 | 4999 | |
| Smoker (ST33-003) | jouée | | | 27188 → 6144 (23 %) |
| Smoker (ST33-003) | Contre (carte) | | | 30408 → 2693 (9 %) |
| Borsalino (ST33-004) | Contre (carte) | | | 55494 → 5108 (9 %) |
| Borsalino (ST33-004) | jouée | | | 23842 → 4746 (20 %) |
| Borsalino (ST33-004) | bloque | | | 10264 → 3074 (30 %) |
| Monkey D. Garp (ST33-005) | [Jouée] | 7758 | 7631 | |
| Monkey D. Garp (ST33-005) | jouée | | | 10672 → 7758 (73 %) |
| Monkey D. Garp (ST33-005) | Contre (carte) | | | 23013 → 2391 (10 %) |
| Kobby (ST33-001) | [Jouée] | 7287 | 6881 | |
| Kobby (ST33-001) | Contre (carte) | | | 39640 → 4068 (10 %) |
| Kobby (ST33-001) | jouée | | | 38626 → 7193 (19 %) |
| Kobby (ST33-001) | bloque | | | 23472 → 2672 (11 %) |
| Sakazuki (ST33-002) | [En attaquant] | 3059 | 213 | |
| Sakazuki (ST33-002) | [En cas de KO] | 1648 | 709 | |
| Sakazuki (ST33-002) | jouée | | | 40315 → 3341 (8 %) |
| Sakazuki (ST33-002) | Contre (carte) | | | 76613 → 12337 (16 %) |
| Bluegrass (EB04-026) | [Jouée] | 15819 | 7967 | |
| Bluegrass (EB04-026) | [En attaquant] | 25544 | 25544 | |
| Bluegrass (EB04-026) | jouée | | | 35505 → 14907 (42 %) |
| Ice Time (EB04-028) | [Déclenchement] | 3258 | 3061 | |
| Ice Time (EB04-028) | [Principale] | 424 | 424 | |
| Ice Time (EB04-028) | [Déclenchement] choisi | | | 3258 → 3258 (100 %) |
| Ice Time (EB04-028) | activée | | | 20987 → 424 (2 %) |
| Kuzan (OP12-043) | [Jouée] | 18458 | 18257 | |
| Kuzan (OP12-043) | jouée | | | 26558 → 15360 (58 %) |
| Jango (OP12-045) | jouée | | | 29013 → 5234 (18 %) |
| Jango (OP12-045) | Contre (carte) | | | 81636 → 14268 (17 %) |
| Zéphyr (OP12-046) | [Jouée] | 4839 | 4597 | |
| Zéphyr (OP12-046) | [Activation : Principale] | 4197 | 4197 | |
| Zéphyr (OP12-046) | jouée | | | 41566 → 4476 (11 %) |
| Zéphyr (OP12-046) | Contre (carte) | | | 101120 → 12626 (12 %) |
| Zéphyr (OP12-046) | effet activé | | | 13197 → 4197 (32 %) |
| Sengoku (OP12-047) | [Jouée] | 6315 | 5904 | |
| Sengoku (OP12-047) | jouée | | | 38141 → 6125 (16 %) |
| Sengoku (OP12-047) | Contre (carte) | | | 52526 → 6780 (13 %) |
| Haguar D. Sauro (OP12-050) | Contre (carte) | | | 68632 → 10454 (15 %) |
| Haguar D. Sauro (OP12-050) | jouée | | | 26863 → 8181 (30 %) |
| Haguar D. Sauro (OP12-050) | bloque | | | 16286 → 7673 (47 %) |
| Fullbody (OP12-052) | jouée | | | 41094 → 5891 (14 %) |
| Fullbody (OP12-052) | Contre (carte) | | | 77737 → 12998 (17 %) |
| Ice Block, bec de faisan (OP12-057) | [Contre] (Événement) | 2786 | 2786 | |
| Ice Block, bec de faisan (OP12-057) | [Déclenchement] choisi | | | 3196 → 0 (0 %) |
| Ice Block, bec de faisan (OP12-057) | Contre (Événement) | | | 22732 → 2786 (12 %) |
| Ice Block, bec de faisan (OP12-057) | [Déclenchement] | 0 | 0 | |

## ST-34 Katakuri (violet)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Charlotte Katakuri (OP11-062) | [En attaquant] | 82325 | 36250 | |
| Charlotte Katakuri (OP11-062) | [Attaque adverse] | 210497 | 53808 | |
| Charlotte Katakuri (ST34-001) | effet « Quand ... » | 14694 | 14694 | |
| Charlotte Katakuri (ST34-001) | [En cas de KO] | 3038 | 1268 | |
| Charlotte Katakuri (ST34-001) | jouée | | | 14691 → 6218 (42 %) |
| Charlotte Brûlée (ST34-003) | [Jouée] | 19316 | 19316 | |
| Charlotte Brûlée (ST34-003) | Contre (carte) | | | 55858 → 7924 (14 %) |
| Charlotte Brûlée (ST34-003) | jouée | | | 78694 → 19076 (24 %) |
| Charlotte Linlin (ST34-004) | [Jouée] | 14570 | 14126 | |
| Charlotte Linlin (ST34-004) | jouée | | | 20152 → 13442 (67 %) |
| Charlotte Linlin (ST34-004) | Contre (carte) | | | 26732 → 4412 (17 %) |
| Charlotte Cracker (ST34-002) | [Jouée] | 11692 | 10799 | |
| Charlotte Cracker (ST34-002) | jouée | | | 24612 → 11391 (46 %) |
| Charlotte Cracker (ST34-002) | Contre (carte) | | | 45180 → 5395 (12 %) |
| Baron Delœuf et Pekoms (ST34-005) | [En attaquant] | 8435 | 2751 | |
| Baron Delœuf et Pekoms (ST34-005) | Contre (carte) | | | 43030 → 7301 (17 %) |
| Baron Delœuf et Pekoms (ST34-005) | jouée | | | 31387 → 10840 (35 %) |
| Charlotte Flampée (EB03-032) | [Jouée] | 14055 | 13909 | |
| Charlotte Flampée (EB03-032) | jouée | | | 39558 → 13908 (35 %) |
| Charlotte Flampée (EB03-032) | Contre (carte) | | | 23199 → 2727 (12 %) |
| Charlotte Pudding (EB03-035) | [Jouée] | 7853 | 3983 | |
| Charlotte Pudding (EB03-035) | jouée | | | 29866 → 7512 (25 %) |
| Charlotte Pudding (EB03-035) | Contre (carte) | | | 60043 → 10397 (17 %) |
| Charlotte Pudding (EB03-035) | bloque | | | 21591 → 3788 (18 %) |
| Charlotte Ananas (OP11-065) | jouée | | | 47961 → 12613 (26 %) |
| Charlotte Ananas (OP11-065) | bloque | | | 43506 → 7042 (16 %) |
| Charlotte Ananas (OP11-065) | Contre (carte) | | | 28132 → 3403 (12 %) |
| Charlotte Oven (OP11-066) | [Activation : Principale] | 7476 | 7476 | |
| Charlotte Oven (OP11-066) | jouée | | | 31303 → 7441 (24 %) |
| Charlotte Oven (OP11-066) | Contre (carte) | | | 64964 → 8517 (13 %) |
| Charlotte Oven (OP11-066) | effet activé | | | 18347 → 7476 (41 %) |
| Charlotte Daifuku (OP11-068) | jouée | | | 15968 → 10599 (66 %) |
| Charlotte Daifuku (OP11-068) | Contre (carte) | | | 44010 → 6989 (16 %) |
| Charlotte Slurp (OP11-071) | [Activation : Principale] | 10273 | 10273 | |
| Charlotte Slurp (OP11-071) | jouée | | | 25419 → 12130 (48 %) |
| Charlotte Slurp (OP11-071) | effet activé | | | 119723 → 10273 (9 %) |
| Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) | [Contre] (Événement) | 7488 | 7488 | |
| Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) | Contre (Événement) | | | 44606 → 7488 (17 %) |
| Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) | [Déclenchement] choisi | | | 4781 → 0 (0 %) |
| Tes petits stratagèmes... n'ont pas leur place dans un combat d'hommes !! (OP11-079) | [Déclenchement] | 0 | 0 | |
| Sabre impérial, lame destructrice (OP11-081) | [Déclenchement] | 4480 | 4468 | |
| Sabre impérial, lame destructrice (OP11-081) | [Principale] | 2422 | 2422 | |
| Sabre impérial, lame destructrice (OP11-081) | [Déclenchement] choisi | | | 4480 → 4480 (100 %) |
| Sabre impérial, lame destructrice (OP11-081) | activée | | | 29033 → 2422 (8 %) |
| Charlotte Smoothie (P-090) | [En cas de KO] | 7005 | 4314 | |
| Charlotte Smoothie (P-090) | jouée | | | 14349 → 12333 (86 %) |
| Charlotte Smoothie (P-090) | Contre (carte) | | | 45682 → 4342 (10 %) |

## ST-36 Kid (jaune)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Eustass "Captain" Kidd (OP10-099) | [Fin de votre tour] | 79877 | 32211 | |
| Killer (ST36-002) | [Jouée] | 8710 | 7261 | |
| Killer (ST36-002) | [Déclenchement] | 1437 | 1437 | |
| Killer (ST36-002) | jouée | | | 9309 → 7261 (78 %) |
| Killer (ST36-002) | bloque | | | 8202 → 3066 (37 %) |
| Killer (ST36-002) | [Déclenchement] choisi | | | 2049 → 1437 (70 %) |
| Scratchmen Apoo (ST36-003) | [Déclenchement] | 1929 | 1929 | |
| Scratchmen Apoo (ST36-003) | [Déclenchement] choisi | | | 1929 → 1929 (100 %) |
| Scratchmen Apoo (ST36-003) | jouée | | | 23220 → 2723 (12 %) |
| Scratchmen Apoo (ST36-003) | Contre (carte) | | | 41640 → 5567 (13 %) |
| Scratchmen Apoo (ST36-003) | bloque | | | 1132 → 90 (8 %) |
| Eustass "Captain" Kidd (ST36-005) | [Activation : Principale] | 14357 | 14357 | |
| Eustass "Captain" Kidd (ST36-005) | [Attaque adverse] | 41863 | 9109 | |
| Eustass "Captain" Kidd (ST36-005) | jouée | | | 12061 → 7886 (65 %) |
| Eustass "Captain" Kidd (ST36-005) | effet activé | | | 15785 → 14357 (91 %) |
| Eustass "Captain" Kidd (ST36-005) | bloque | | | 574 → 236 (41 %) |
| Cavendish (ST36-001) | [En cas de KO] | 3970 | 2513 | |
| Cavendish (ST36-001) | jouée | | | 53185 → 6780 (13 %) |
| Cavendish (ST36-001) | Contre (carte) | | | 68733 → 10280 (15 %) |
| Cavendish (ST36-001) | bloque | | | 3463 → 185 (5 %) |
| Bartolomeo (ST36-004) | [Jouée] | 13221 | 12085 | |
| Bartolomeo (ST36-004) | jouée | | | 39343 → 13102 (33 %) |
| Bartolomeo (ST36-004) | Contre (carte) | | | 17581 → 2917 (17 %) |
| Urouge (OP10-101) | Contre (carte) | | | 49209 → 8939 (18 %) |
| Urouge (OP10-101) | jouée | | | 25083 → 13654 (54 %) |
| Urouge (OP10-101) | bloque | | | 10071 → 4312 (43 %) |
| Capone "Gang" Bege (OP10-103) | [Jouée] | 232 | 6 | |
| Capone "Gang" Bege (OP10-103) | Contre (carte) | | | 74021 → 11420 (15 %) |
| Capone "Gang" Bege (OP10-103) | jouée | | | 95319 → 0 (0 %) |
| Basil Hawkins (OP10-109) | [En cas de KO] | 3407 | 2866 | |
| Basil Hawkins (OP10-109) | [Déclenchement] | 4047 | 4047 | |
| Basil Hawkins (OP10-109) | jouée | | | 31288 → 5803 (19 %) |
| Basil Hawkins (OP10-109) | Contre (carte) | | | 51992 → 7839 (15 %) |
| Basil Hawkins (OP10-109) | [Déclenchement] choisi | | | 4047 → 4047 (100 %) |
| Basil Hawkins (OP10-109) | bloque | | | 3989 → 234 (6 %) |
| Monkey D. Luffy (OP10-111) | [Jouée] | 10423 | 10423 | |
| Monkey D. Luffy (OP10-111) | jouée | | | 48561 → 10305 (21 %) |
| Monkey D. Luffy (OP10-111) | Contre (carte) | | | 25971 → 4038 (16 %) |
| X-Drake (OP10-114) | [Activation : Principale] | 6556 | 6556 | |
| X-Drake (OP10-114) | jouée | | | 52561 → 6999 (13 %) |
| X-Drake (OP10-114) | Contre (carte) | | | 68343 → 10172 (15 %) |
| X-Drake (OP10-114) | effet activé | | | 24179 → 6556 (27 %) |
| X-Drake (OP10-114) | bloque | | | 3645 → 141 (4 %) |
| Roronoa Zoro (OP12-113) | [Déclenchement] | 4300 | 4300 | |
| Roronoa Zoro (OP12-113) | [En cas de KO] | 3868 | 1425 | |
| Roronoa Zoro (OP12-113) | jouée | | | 26717 → 9270 (35 %) |
| Roronoa Zoro (OP12-113) | Contre (carte) | | | 55214 → 8989 (16 %) |
| Roronoa Zoro (OP12-113) | [Déclenchement] choisi | | | 4300 → 4300 (100 %) |
| Roronoa Zoro (OP12-113) | bloque | | | 4857 → 1403 (29 %) |
| Le plus libre des hommes au monde, c'est le roi des pirates !! (OP13-116) | [Principale] | 9638 | 9638 | |
| Le plus libre des hommes au monde, c'est le roi des pirates !! (OP13-116) | [Déclenchement] | 4242 | 4242 | |
| Le plus libre des hommes au monde, c'est le roi des pirates !! (OP13-116) | activée | | | 30634 → 9638 (31 %) |
| Le plus libre des hommes au monde, c'est le roi des pirates !! (OP13-116) | [Déclenchement] choisi | | | 4242 → 4242 (100 %) |
| Jewelry Bonney (P-085) | [Jouée] | 11347 | 5267 | |
| Jewelry Bonney (P-085) | jouée | | | 23078 → 11347 (49 %) |
| Jewelry Bonney (P-085) | Contre (carte) | | | 45139 → 7197 (16 %) |
| Jewelry Bonney (P-085) | bloque | | | 6682 → 1824 (27 %) |
| Trafalgar Law (P-088) | [Déclenchement] | 2026 | 2026 | |
| Trafalgar Law (P-088) | jouée | | | 43527 → 10637 (24 %) |
| Trafalgar Law (P-088) | Contre (carte) | | | 72559 → 11929 (16 %) |
| Trafalgar Law (P-088) | bloque | | | 7799 → 470 (6 %) |
| Trafalgar Law (P-088) | [Déclenchement] choisi | | | 4100 → 2026 (49 %) |

## META-SABO-2026-10 Sabo (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Sabo (OP13-004) | effet permanent | | | |
| Nami (OP01-016) | [Jouée] | 16674 | 16674 | |
| Nami (OP01-016) | jouée | | | 81933 → 14150 (17 %) |
| Nami (OP01-016) | Contre (carte) | | | 45395 → 6793 (15 %) |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Contre] (Événement) | 11589 | 11589 | |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Déclenchement] | 5199 | 5199 | |
| Menu "Bonnes manières", Kick Course (OP04-016) | Contre (Événement) | | | 82713 → 11589 (14 %) |
| Menu "Bonnes manières", Kick Course (OP04-016) | [Déclenchement] choisi | | | 5199 → 5199 (100 %) |
| Ace, Sabo et Luffy (OP13-007) | [Activation : Principale] | 1516 | 1516 | |
| Ace, Sabo et Luffy (OP13-007) | jouée | | | 61926 → 2632 (4 %) |
| Ace, Sabo et Luffy (OP13-007) | Contre (carte) | | | 45987 → 6321 (14 %) |
| Ace, Sabo et Luffy (OP13-007) | effet activé | | | 6265 → 1516 (24 %) |
| Arrimage pirates 6 (OP15-088) | [Jouée] | 10740 | 10740 | |
| Arrimage pirates 6 (OP15-088) | jouée | | | 37752 → 10740 (28 %) |
| Usopp (OP17-080) | [Jouée] | 7788 | 7788 | |
| Usopp (OP17-080) | jouée | | | 47603 → 4947 (10 %) |
| Usopp (OP17-080) | Contre (carte) | | | 42368 → 7044 (17 %) |
| Sanji (OP17-082) | [Jouée] | 7792 | 7792 | |
| Sanji (OP17-082) | jouée | | | 49522 → 4885 (10 %) |
| Sanji (OP17-082) | Contre (carte) | | | 44347 → 7249 (16 %) |
| Jinbe (OP17-083) | jouée | | | 27803 → 1572 (6 %) |
| Jinbe (OP17-083) | Contre (carte) | | | 25573 → 4009 (16 %) |
| Jinbe (OP17-083) | bloque | | | 12329 → 841 (7 %) |
| Tony-Tony Chopper (OP17-084) | [Jouée] | 4492 | 1150 | |
| Tony-Tony Chopper (OP17-084) | jouée | | | 63723 → 4370 (7 %) |
| Tony-Tony Chopper (OP17-084) | Contre (carte) | | | 48250 → 7143 (15 %) |
| Nami (OP17-086) | [Jouée] | 3359 | 3256 | |
| Nami (OP17-086) | Contre (carte) | | | 33272 → 5331 (16 %) |
| Nami (OP17-086) | jouée | | | 48164 → 3237 (7 %) |
| Nico Robin (OP17-087) | [Jouée] | 8048 | 2275 | |
| Nico Robin (OP17-087) | jouée | | | 48433 → 4930 (10 %) |
| Nico Robin (OP17-087) | Contre (carte) | | | 43108 → 7037 (16 %) |
| Haguar D. Sauro (OP17-089) | [Jouée] | 9072 | 9072 | |
| Haguar D. Sauro (OP17-089) | jouée | | | 59754 → 9072 (15 %) |
| Monkey D. Luffy (OP17-093) | [Jouée] | 12165 | 12165 | |
| Monkey D. Luffy (OP17-093) | jouée | | | 16964 → 12165 (72 %) |
| Monkey D. Luffy (OP17-093) | attaque le tour où elle est jouée | | | 83113 → 9209 (11 %) |
| Roronoa Zoro (OP17-095) | remplacement | 880 | 880 | |
| Roronoa Zoro (OP17-095) | Contre (carte) | | | 72788 → 12241 (17 %) |
| Roronoa Zoro (OP17-095) | jouée | | | 71321 → 2506 (4 %) |
| Loki (OP17-119) | [Jouée] | 15134 | 14020 | |
| Loki (OP17-119) | jouée | | | 31701 → 15134 (48 %) |
| Brook (ST01-011) | [Jouée] | 19034 | 19034 | |
| Brook (ST01-011) | jouée | | | 57157 → 11926 (21 %) |
| Brook (ST01-011) | Contre (carte) | | | 44304 → 7363 (17 %) |

## META-MIHAWK-2026-10 Mihawk (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Dracule Mihawk (OP14-020) | [Activation : Principale] | 68401 | 68401 | |
| Dracule Mihawk (OP14-020) | effet activé | | | 313294 → 68401 (22 %) |
| Acceptez de devenir mes samouraïs !! (OP01-055) | [Principale] | 5941 | 5941 | |
| Acceptez de devenir mes samouraïs !! (OP01-055) | activée | | | 203103 → 5941 (3 %) |
| Vander Decken IX (OP06-033) | [Jouée] | 12038 | 2714 | |
| Vander Decken IX (OP06-033) | jouée | | | 32180 → 11649 (36 %) |
| Vander Decken IX (OP06-033) | Contre (carte) | | | 24145 → 4145 (17 %) |
| Ichidai San Zen Dai Sen Sekai (OP06-038) | [Contre] (Événement) | 11127 | 11127 | |
| Ichidai San Zen Dai Sen Sekai (OP06-038) | [Déclenchement] | 1867 | 708 | |
| Ichidai San Zen Dai Sen Sekai (OP06-038) | Contre (Événement) | | | 42407 → 11127 (26 %) |
| Ichidai San Zen Dai Sen Sekai (OP06-038) | [Déclenchement] choisi | | | 1867 → 1867 (100 %) |
| Otama (OP07-022) | [Jouée] | 15050 | 15050 | |
| Otama (OP07-022) | jouée | | | 69814 → 14330 (21 %) |
| Otama (OP07-022) | Contre (carte) | | | 52693 → 9550 (18 %) |
| Electrical Luna (OP08-036) | [Déclenchement] | 1851 | 1741 | |
| Electrical Luna (OP08-036) | [Principale] | 10065 | 10065 | |
| Electrical Luna (OP08-036) | [Déclenchement] choisi | | | 1851 → 1851 (100 %) |
| Electrical Luna (OP08-036) | activée | | | 39996 → 10065 (25 %) |
| Kawamatsu (OP12-023) | Contre (carte) | | | 145397 → 25657 (18 %) |
| Kawamatsu (OP12-023) | jouée | | | 62570 → 13005 (21 %) |
| Perona (OP12-034) | [Jouée] | 18377 | 18377 | |
| Perona (OP12-034) | jouée | | | 49354 → 17147 (35 %) |
| Perona (OP12-034) | Contre (carte) | | | 31128 → 5801 (19 %) |
| Trafalgar Law (OP13-031) | [Jouée] | 18925 | 17367 | |
| Trafalgar Law (OP13-031) | jouée | | | 33254 → 18925 (57 %) |
| Trafalgar Law (OP13-031) | bloque | | | 1450 → 1103 (76 %) |
| Si vous croyez que je me souviens de tous les minables dont je croise la route !! (OP14-038) | [Contre] (Événement) | 6887 | 6887 | |
| Si vous croyez que je me souviens de tous les minables dont je croise la route !! (OP14-038) | [Principale] | 3467 | 3461 | |
| Si vous croyez que je me souviens de tous les minables dont je croise la route !! (OP14-038) | activée | | | 239959 → 3467 (1 %) |
| Si vous croyez que je me souviens de tous les minables dont je croise la route !! (OP14-038) | Contre (Événement) | | | 71211 → 6887 (10 %) |
| Barque mortuaire (OP14-039) | [Jouée] | 9274 | 9274 | |
| Barque mortuaire (OP14-039) | [Fin de votre tour] | 43240 | 41096 | |
| Barque mortuaire (OP14-039) | jouée | | | 106513 → 9274 (9 %) |
| Shanks (OP17-022) | [Jouée] | 23773 | 23773 | |
| Shanks (OP17-022) | jouée | | | 25816 → 23773 (92 %) |
| Shanks (OP17-022) | attaque le tour où elle est jouée | | | 765728 → 22400 (3 %) |
| Yasopp (OP17-031) | [Jouée] | 12627 | 12627 | |
| Yasopp (OP17-031) | [Fin de votre tour] | 29344 | 25150 | |
| Yasopp (OP17-031) | Contre (carte) | | | 47127 → 8670 (18 %) |
| Yasopp (OP17-031) | jouée | | | 25220 → 7801 (31 %) |
| Kinémon (ST32-001) | [Jouée] | 31837 | 25284 | |
| Kinémon (ST32-001) | jouée | | | 91317 → 30401 (33 %) |
| Kinémon (ST32-001) | Contre (carte) | | | 54385 → 10090 (19 %) |
| Oden Kozuki (ST32-002) | [Jouée] | 19727 | 19727 | |
| Oden Kozuki (ST32-002) | Contre (carte) | | | 75792 → 15734 (21 %) |
| Oden Kozuki (ST32-002) | jouée | | | 38169 → 13243 (35 %) |

## META-ROBIN-2026-10 Nico Robin (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Nico Robin (OP09-062) | [En attaquant] | 68388 | 53978 | |
| Borsalino (EB04-058) | [Jouée] | 7098 | 2314 | |
| Borsalino (EB04-058) | jouée | | | 17253 → 7098 (41 %) |
| Borsalino (EB04-058) | Contre (carte) | | | 36971 → 5361 (15 %) |
| Borsalino (EB04-058) | bloque | | | 9860 → 4355 (44 %) |
| Miss Doublefinger (Zala) (OP05-073) | [Jouée] | 6293 | 6101 | |
| Miss Doublefinger (Zala) (OP05-073) | [Déclenchement] | 2585 | 2585 | |
| Miss Doublefinger (Zala) (OP05-073) | jouée | | | 11753 → 3637 (31 %) |
| Miss Doublefinger (Zala) (OP05-073) | Contre (carte) | | | 19921 → 1631 (8 %) |
| Miss Doublefinger (Zala) (OP05-073) | [Déclenchement] choisi | | | 2585 → 2585 (100 %) |
| Gum Gum Gigant (OP09-078) | [Contre] (Événement) | 6432 | 6432 | |
| Gum Gum Gigant (OP09-078) | Contre (Événement) | | | 29438 → 6432 (22 %) |
| Marshall D. Teach (OP16-119) | [Jouée] | 8233 | 8233 | |
| Marshall D. Teach (OP16-119) | [Déclenchement] | 5249 | 5232 | |
| Marshall D. Teach (OP16-119) | jouée | | | 16745 → 8233 (49 %) |
| Marshall D. Teach (OP16-119) | [Déclenchement] choisi | | | 5249 → 5249 (100 %) |
| Yamato (OP17-074) | [Jouée] | 18702 | 14519 | |
| Yamato (OP17-074) | jouée | | | 62376 → 18616 (30 %) |
| Yamato (OP17-074) | Contre (carte) | | | 93483 → 14484 (15 %) |
| Yamato (OP17-074) | bloque | | | 75228 → 7819 (10 %) |
| Charlotte Oven (OP17-102) | [En cas de KO] | 4418 | 4401 | |
| Charlotte Oven (OP17-102) | [Déclenchement] choisi | | | 4697 → 4697 (100 %) |
| Charlotte Oven (OP17-102) | jouée | | | 16276 → 3628 (22 %) |
| Charlotte Oven (OP17-102) | Contre (carte) | | | 21437 → 2876 (13 %) |
| Charlotte Smoothie (OP17-106) | [Jouée] | 7124 | 2495 | |
| Charlotte Smoothie (OP17-106) | [Déclenchement] choisi | | | 3375 → 3375 (100 %) |
| Charlotte Smoothie (OP17-106) | Contre (carte) | | | 15352 → 1852 (12 %) |
| Charlotte Smoothie (OP17-106) | jouée | | | 9295 → 3185 (34 %) |
| Charlotte Daifuku (OP17-107) | jouée | | | 34779 → 5280 (15 %) |
| Charlotte Daifuku (OP17-107) | Contre (carte) | | | 49670 → 5515 (11 %) |
| Charlotte Daifuku (OP17-107) | [Déclenchement] choisi | | | 5068 → 5068 (100 %) |
| Charlotte Pudding (OP17-109) | [Déclenchement] | 4625 | 4625 | |
| Charlotte Pudding (OP17-109) | [Jouée] | 8798 | 7607 | |
| Charlotte Pudding (OP17-109) | jouée | | | 18411 → 8572 (47 %) |
| Charlotte Pudding (OP17-109) | [Déclenchement] choisi | | | 4625 → 4625 (100 %) |
| Charlotte Pudding (OP17-109) | Contre (carte) | | | 17678 → 2265 (13 %) |
| Charlotte Slurp (OP17-110) | [Jouée] | 6029 | 1710 | |
| Charlotte Slurp (OP17-110) | Contre (carte) | | | 7473 → 815 (11 %) |
| Charlotte Slurp (OP17-110) | jouée | | | 4005 → 1692 (42 %) |
| Charlotte Slurp (OP17-110) | attaque le tour où elle est jouée | | | 14885 → 584 (4 %) |
| Charlotte Slurp (OP17-110) | [Déclenchement] choisi | | | 2265 → 2265 (100 %) |
| Charlotte Linlin (OP17-112) | [Jouée] | 21015 | 21015 | |
| Charlotte Linlin (OP17-112) | jouée | | | 22942 → 21015 (92 %) |
| Streusen (OP17-113) | [Jouée] | 12559 | 12559 | |
| Streusen (OP17-113) | jouée | | | 59044 → 12382 (21 %) |
| Streusen (OP17-113) | Contre (carte) | | | 45670 → 6334 (14 %) |
| Trois généraux sucrés (OP17-114) | [Jouée] | 10538 | 2509 | |
| Trois généraux sucrés (OP17-114) | jouée | | | 10843 → 4032 (37 %) |
| Trois généraux sucrés (OP17-114) | [Déclenchement] choisi | | | 4593 → 4593 (100 %) |
| Trois généraux sucrés (OP17-114) | Contre (carte) | | | 18290 → 2011 (11 %) |
| Charlotte Brûlée (ST34-003) | [Jouée] | 19316 | 19316 | |
| Charlotte Brûlée (ST34-003) | Contre (carte) | | | 55858 → 7924 (14 %) |
| Charlotte Brûlée (ST34-003) | jouée | | | 78694 → 19076 (24 %) |

## META-XEBEC-2026-10 Rocks D. Xebec (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Rocks D. Xebec (OP17-039) | [En attaquant] | 71241 | 67471 | |
| Quand les rêves de ses camarades ont été bafoués !! (EB02-030) | [Déclenchement] | 790 | 790 | |
| Quand les rêves de ses camarades ont été bafoués !! (EB02-030) | [Contre] (Événement) | 20 | 20 | |
| Quand les rêves de ses camarades ont été bafoués !! (EB02-030) | [Déclenchement] choisi | | | 790 → 790 (100 %) |
| Quand les rêves de ses camarades ont été bafoués !! (EB02-030) | Contre (Événement) | | | 501 → 20 (4 %) |
| Buckin (OP08-051) | [Jouée] | 10365 | 0 | |
| Buckin (OP08-051) | jouée | | | 34410 → 10365 (30 %) |
| Buckin (OP08-051) | Contre (carte) | | | 18875 → 4649 (25 %) |
| Edward Newgate (OP17-040) | [Jouée] | 16034 | 16034 | |
| Edward Newgate (OP17-040) | effet « Quand ... » | 64617 | 15908 | |
| Edward Newgate (OP17-040) | jouée | | | 33778 → 12883 (38 %) |
| Ochoku (OP17-041) | [Jouée] | 7642 | 7414 | |
| Ochoku (OP17-041) | jouée | | | 31835 → 6902 (22 %) |
| Ochoku (OP17-041) | bloque | | | 10043 → 3547 (35 %) |
| Kaido (OP17-042) | [Jouée] | 4897 | 4241 | |
| Kaido (OP17-042) | jouée | | | 23220 → 4346 (19 %) |
| Kaido (OP17-042) | bloque | | | 6951 → 2290 (33 %) |
| Captain John (OP17-044) | [Activation : Principale] | 5418 | 5418 | |
| Captain John (OP17-044) | jouée | | | 43433 → 5081 (12 %) |
| Captain John (OP17-044) | effet activé | | | 36038 → 5418 (15 %) |
| Kyo (OP17-045) | [Jouée] | 10480 | 10480 | |
| Kyo (OP17-045) | remplacement | 2837 | 2837 | |
| Kyo (OP17-045) | jouée | | | 35681 → 8409 (24 %) |
| Gloriosa (OP17-046) | [Jouée] | 2099 | 2035 | |
| Gloriosa (OP17-046) | jouée | | | 23523 → 1820 (8 %) |
| Gloriosa (OP17-046) | bloque | | | 6333 → 591 (9 %) |
| Shiki (OP17-048) | [En attaquant] | 40745 | 36733 | |
| Shiki (OP17-048) | [Attaque adverse] | 100237 | 39792 | |
| Shiki (OP17-048) | jouée | | | 26568 → 18694 (70 %) |
| Shiki (OP17-048) | attaque le tour où elle est jouée | | | 99689 → 10871 (11 %) |
| Charlotte Linlin (OP17-049) | [Jouée] | 10111 | 10111 | |
| Charlotte Linlin (OP17-049) | [Attaque adverse] | 50075 | 12746 | |
| Charlotte Linlin (OP17-049) | jouée | | | 38750 → 8893 (23 %) |
| Miss Buckingham Stussy (OP17-054) | [Jouée] | 8586 | 8055 | |
| Miss Buckingham Stussy (OP17-054) | [Activation : Principale] | 1 | 1 | |
| Miss Buckingham Stussy (OP17-054) | jouée | | | 39203 → 7200 (18 %) |
| Miss Buckingham Stussy (OP17-054) | effet activé | | | 19400 → 1 (0 %) |
| Aucun pouvoir n'est éternel !! (OP17-055) | [Contre] (Événement) | 5331 | 5331 | |
| Aucun pouvoir n'est éternel !! (OP17-055) | [Principale] | 1548 | 1548 | |
| Aucun pouvoir n'est éternel !! (OP17-055) | activée | | | 73269 → 1548 (2 %) |
| Aucun pouvoir n'est éternel !! (OP17-055) | Contre (Événement) | | | 11983 → 5331 (44 %) |
| Équipage de Rocks (OP17-056) | [Contre] (Événement) | 5248 | 5248 | |
| Équipage de Rocks (OP17-056) | [Principale] | 600 | 600 | |
| Équipage de Rocks (OP17-056) | activée | | | 71987 → 600 (1 %) |
| Équipage de Rocks (OP17-056) | Contre (Événement) | | | 12022 → 5248 (44 %) |
| Rocks D. Xebec (OP17-118) | [Jouée] | 11450 | 11450 | |
| Rocks D. Xebec (OP17-118) | Contre (carte) | | | 44782 → 11198 (25 %) |
| Rocks D. Xebec (OP17-118) | jouée | | | 13188 → 11450 (87 %) |

## META-ENEL-2026-10 Ener (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Ener (OP15-058) | [Activation : Principale] | 72611 | 72611 | |
| Ener (OP15-058) | effet activé | | | 151708 → 72611 (48 %) |
| Gamma Knife (OP05-077) | [Principale] | 7102 | 7102 | |
| Gamma Knife (OP05-077) | [Déclenchement] | 1636 | 1195 | |
| Gamma Knife (OP05-077) | activée | | | 64729 → 7102 (11 %) |
| Gamma Knife (OP05-077) | [Déclenchement] choisi | | | 1636 → 1636 (100 %) |
| Sanji (OP07-064) | Contre (carte) | | | 44317 → 5573 (13 %) |
| Sanji (OP07-064) | jouée | | | 19715 → 10128 (51 %) |
| Sanji (OP07-064) | bloque | | | 17626 → 5400 (31 %) |
| Gum Gum Foudre (OP09-077) | [Principale] | 4118 | 4118 | |
| Gum Gum Foudre (OP09-077) | [Déclenchement] | 812 | 589 | |
| Gum Gum Foudre (OP09-077) | activée | | | 27787 → 4118 (15 %) |
| Gum Gum Foudre (OP09-077) | [Déclenchement] choisi | | | 812 → 812 (100 %) |
| Señor Pink (OP10-067) | [Jouée] | 17186 | 17186 | |
| Señor Pink (OP10-067) | jouée | | | 24522 → 17186 (70 %) |
| Charlotte Pudding (OP12-071) | [Jouée] | 15822 | 15822 | |
| Charlotte Pudding (OP12-071) | jouée | | | 79828 → 15822 (20 %) |
| Charlotte Pudding (OP12-071) | Contre (carte) | | | 51788 → 7718 (15 %) |
| Trépas divin (OP13-076) | [Contre] (Événement) | 11459 | 11459 | |
| Trépas divin (OP13-076) | [Principale] | 2068 | 2068 | |
| Trépas divin (OP13-076) | activée | | | 164918 → 2068 (1 %) |
| Trépas divin (OP13-076) | Contre (Événement) | | | 59033 → 11459 (19 %) |
| Om (OP15-061) | [Jouée] | 15863 | 15863 | |
| Om (OP15-061) | [En attaquant] | 8732 | 7938 | |
| Om (OP15-061) | jouée | | | 79509 → 15863 (20 %) |
| Om (OP15-061) | Contre (carte) | | | 51259 → 7464 (15 %) |
| Satori (OP15-066) | [Jouée] | 8000 | 8000 | |
| Satori (OP15-066) | [En attaquant] | 4028 | 4028 | |
| Satori (OP15-066) | jouée | | | 42113 → 8000 (19 %) |
| Satori (OP15-066) | Contre (carte) | | | 26598 → 3768 (14 %) |
| Shura (OP15-067) | [Jouée] | 18115 | 18115 | |
| Shura (OP15-067) | jouée | | | 60439 → 18115 (30 %) |
| Shura (OP15-067) | attaque le tour où elle est jouée | | | 150749 → 869 (1 %) |
| Shura (OP15-067) | Contre (carte) | | | 40875 → 5524 (14 %) |
| Holy (OP15-071) | jouée | | | 40261 → 18027 (45 %) |
| Holy (OP15-071) | Contre (carte) | | | 54736 → 8000 (15 %) |
| Vally (OP15-074) | [Contre] (Événement) | 5953 | 5953 | |
| Vally (OP15-074) | [Principale] | 13993 | 13993 | |
| Vally (OP15-074) | activée | | | 163136 → 13993 (9 %) |
| Vally (OP15-074) | Contre (Événement) | | | 53014 → 5953 (11 %) |
| El Thor (OP15-075) | [Contre] (Événement) | 7275 | 7275 | |
| El Thor (OP15-075) | [Principale] | 23369 | 23369 | |
| El Thor (OP15-075) | activée | | | 169288 → 23369 (14 %) |
| El Thor (OP15-075) | Contre (Événement) | | | 51069 → 7275 (14 %) |
| Kiten (OP15-076) | [Contre] (Événement) | 4453 | 4453 | |
| Kiten (OP15-076) | [Principale] | 24729 | 24729 | |
| Kiten (OP15-076) | activée | | | 147470 → 24729 (17 %) |
| Kiten (OP15-076) | Contre (Événement) | | | 38898 → 4453 (11 %) |
| Djambuwal (OP15-077) | [Principale] | 22428 | 22428 | |
| Djambuwal (OP15-077) | activée | | | 219244 → 22428 (10 %) |
| Mamaragan (OP15-078) | [Principale] | 6264 | 6264 | |
| Mamaragan (OP15-078) | [Contre] (Événement) | 35031 | 35031 | |
| Mamaragan (OP15-078) | activée | | | 351000 → 6264 (2 %) |
| Mamaragan (OP15-078) | Contre (Événement) | | | 111268 → 35031 (31 %) |
| Ener (OP15-118) | [Jouée] | 5523 | 5523 | |
| Ener (OP15-118) | jouée | | | 5841 → 5523 (95 %) |
| Trafalgar Law (ST10-010) | [Jouée] | 9599 | 802 | |
| Trafalgar Law (ST10-010) | Contre (carte) | | | 59339 → 9340 (16 %) |
| Trafalgar Law (ST10-010) | jouée | | | 24736 → 9599 (39 %) |
| Trafalgar Law (ST10-010) | bloque | | | 16430 → 1810 (11 %) |

## META-KAIDO-2026-10 Kaido (méta, octobre 2026)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Kaido (OP17-058) | [En attaquant] | 79914 | 0 | |
| Kaido (OP17-058) | [Attaque adverse] | 195192 | 43392 | |
| King (EB04-031) | [Activation : Principale] | 24950 | 24950 | |
| King (EB04-031) | Contre (carte) | | | 21960 → 2261 (10 %) |
| King (EB04-031) | jouée | | | 27276 → 11084 (41 %) |
| King (EB04-031) | effet activé | | | 101794 → 24950 (25 %) |
| Queen (EB04-032) | [Jouée] | 13547 | 12708 | |
| Queen (EB04-032) | [Activation : Principale] | 2712 | 2712 | |
| Queen (EB04-032) | jouée | | | 39148 → 13547 (35 %) |
| Queen (EB04-032) | effet activé | | | 111642 → 2712 (2 %) |
| Queen (EB04-032) | Contre (carte) | | | 24109 → 3046 (13 %) |
| Torche du dragon (EB04-040) | [Contre] (Événement) | 1329 | 1329 | |
| Torche du dragon (EB04-040) | [Principale] | 877 | 643 | |
| Torche du dragon (EB04-040) | Contre (Événement) | | | 7125 → 1329 (19 %) |
| Torche du dragon (EB04-040) | activée | | | 24128 → 877 (4 %) |
| Ramollo Beam Sword (OP07-076) | [Déclenchement] | 3425 | 3090 | |
| Ramollo Beam Sword (OP07-076) | [Contre] (Événement) | 3722 | 3722 | |
| Ramollo Beam Sword (OP07-076) | Contre (Événement) | | | 11110 → 3722 (34 %) |
| Ramollo Beam Sword (OP07-076) | [Déclenchement] choisi | | | 3425 → 3425 (100 %) |
| We're Going to Claim the One Piece!!! (OP07-077) | [Principale] | 12302 | 12302 | |
| We're Going to Claim the One Piece!!! (OP07-077) | activée | | | 62982 → 7905 (13 %) |
| We're Going to Claim the One Piece!!! (OP07-077) | [Déclenchement] choisi | | | 4397 → 4397 (100 %) |
| Black Maria (OP08-074) | [Activation : Principale] | 11256 | 11256 | |
| Black Maria (OP08-074) | jouée | | | 24449 → 7242 (30 %) |
| Black Maria (OP08-074) | effet activé | | | 58547 → 11256 (19 %) |
| Black Maria (OP08-074) | Contre (carte) | | | 30058 → 6106 (20 %) |
| Trépas divin (OP13-076) | [Contre] (Événement) | 11459 | 11459 | |
| Trépas divin (OP13-076) | [Principale] | 2068 | 2068 | |
| Trépas divin (OP13-076) | activée | | | 164918 → 2068 (1 %) |
| Trépas divin (OP13-076) | Contre (Événement) | | | 59033 → 11459 (19 %) |
| Djambuwal (OP15-077) | [Principale] | 22428 | 22428 | |
| Djambuwal (OP15-077) | activée | | | 219244 → 22428 (10 %) |
| Mamaragan (OP15-078) | [Principale] | 6264 | 6264 | |
| Mamaragan (OP15-078) | [Contre] (Événement) | 35031 | 35031 | |
| Mamaragan (OP15-078) | activée | | | 351000 → 6264 (2 %) |
| Mamaragan (OP15-078) | Contre (Événement) | | | 111268 → 35031 (31 %) |
| Superstars (OP17-061) | [Jouée] | 5791 | 5791 | |
| Superstars (OP17-061) | [Activation : Principale] | 2096 | 2096 | |
| Superstars (OP17-061) | jouée | | | 19090 → 5791 (30 %) |
| Superstars (OP17-061) | Contre (carte) | | | 26288 → 3548 (13 %) |
| Superstars (OP17-061) | effet activé | | | 69199 → 2096 (3 %) |
| Kaido (OP17-062) | effet « Quand ... » | 4387 | 4379 | |
| Kaido (OP17-062) | jouée | | | 18336 → 5788 (32 %) |
| Kaido (OP17-062) | Contre (carte) | | | 37877 → 6638 (18 %) |
| Kaido (OP17-062) | bloque | | | 6765 → 4781 (71 %) |
| Kaido (OP17-063) | [Activation : Principale] | 10582 | 10582 | |
| Kaido (OP17-063) | jouée | | | 11438 → 10897 (95 %) |
| Kaido (OP17-063) | effet activé | | | 11791 → 10582 (90 %) |
| Kaido (OP17-063) | Contre (carte) | | | 13452 → 1449 (11 %) |
| Queen (OP17-065) | [Jouée] | 3926 | 3926 | |
| Queen (OP17-065) | jouée | | | 11914 → 1830 (15 %) |
| Queen (OP17-065) | Contre (carte) | | | 15399 → 1862 (12 %) |
| Sasaki (OP17-068) | [En attaquant] | 2456 | 1583 | |
| Sasaki (OP17-068) | jouée | | | 8017 → 3033 (38 %) |
| Sasaki (OP17-068) | Contre (carte) | | | 9790 → 1834 (19 %) |
| Basil Hawkins (OP17-073) | [Jouée] | 7731 | 6858 | |
| Basil Hawkins (OP17-073) | jouée | | | 34242 → 7731 (23 %) |
| Basil Hawkins (OP17-073) | Contre (carte) | | | 41657 → 8601 (21 %) |
| Yamato (OP17-074) | [Jouée] | 18702 | 14519 | |
| Yamato (OP17-074) | jouée | | | 62376 → 18616 (30 %) |
| Yamato (OP17-074) | Contre (carte) | | | 93483 → 14484 (15 %) |
| Yamato (OP17-074) | bloque | | | 75228 → 7819 (10 %) |
| Charlotte Linlin (ST34-004) | [Jouée] | 14570 | 14126 | |
| Charlotte Linlin (ST34-004) | jouée | | | 20152 → 13442 (67 %) |
| Charlotte Linlin (ST34-004) | Contre (carte) | | | 26732 → 4412 (17 %) |

## ST-21 Luffy Gear 5 (rouge)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Monkey D. Luffy (ST21-001) | [Activation : Principale] | 77468 | 77468 | |
| Monkey D. Luffy (ST21-001) | effet activé | | | 100029 → 77468 (77 %) |
| Usopp (ST21-002) | jouée | | | 38413 → 2442 (6 %) |
| Usopp (ST21-002) | Contre (carte) | | | 28041 → 4382 (16 %) |
| Sanji (ST21-003) | [Jouée] | 4568 | 1196 | |
| Sanji (ST21-003) | jouée | | | 26258 → 4514 (17 %) |
| Sanji (ST21-003) | Contre (carte) | | | 16695 → 2612 (16 %) |
| Jewelry Bonney (ST21-004) | [En cas de KO] | 1767 | 1767 | |
| Jewelry Bonney (ST21-004) | jouée | | | 96797 → 9359 (10 %) |
| Jinbe (ST21-005) | jouée | | | 61603 → 5672 (9 %) |
| Jinbe (ST21-005) | Contre (carte) | | | 45384 → 7678 (17 %) |
| Stussy (ST21-006) | Contre (carte) | | | 23187 → 3171 (14 %) |
| Stussy (ST21-006) | jouée | | | 27295 → 11253 (41 %) |
| Sentomaru (ST21-007) | jouée | | | 54285 → 7221 (13 %) |
| Sentomaru (ST21-007) | bloque | | | 24564 → 3934 (16 %) |
| Sentomaru (ST21-007) | Contre (carte) | | | 39251 → 6237 (16 %) |
| Tony-Tony Chopper (ST21-008) | jouée | | | 20800 → 11823 (57 %) |
| Tony-Tony Chopper (ST21-008) | Contre (carte) | | | 20928 → 2747 (13 %) |
| Nami (ST21-009) | [Activation : Principale] | 13725 | 12615 | |
| Nami (ST21-009) | jouée | | | 45851 → 5852 (13 %) |
| Nami (ST21-009) | effet activé | | | 41777 → 13725 (33 %) |
| Nami (ST21-009) | Contre (carte) | | | 44705 → 7479 (17 %) |
| Nico Robin (ST21-010) | [En attaquant] | 3902 | 2781 | |
| Nico Robin (ST21-010) | Contre (carte) | | | 19504 → 2759 (14 %) |
| Nico Robin (ST21-010) | jouée | | | 20351 → 4474 (22 %) |
| Franky (ST21-011) | Contre (carte) | | | 35068 → 5012 (14 %) |
| Franky (ST21-011) | jouée | | | 36729 → 8889 (24 %) |
| Brook (ST21-012) | [En attaquant] | 7618 | 4659 | |
| Brook (ST21-012) | jouée | | | 37058 → 8819 (24 %) |
| Brook (ST21-012) | Contre (carte) | | | 35318 → 5099 (14 %) |
| Végapunk (ST21-013) | jouée | | | 70066 → 7240 (10 %) |
| Végapunk (ST21-013) | Contre (carte) | | | 37293 → 5902 (16 %) |
| Monkey D. Luffy (ST21-014) | [En attaquant] | 11633 | 10516 | |
| Monkey D. Luffy (ST21-014) | jouée | | | 9029 → 7269 (81 %) |
| Monkey D. Luffy (ST21-014) | attaque le tour où elle est jouée | | | 68778 → 6715 (10 %) |
| Roronoa Zoro (ST21-015) | [En cas de KO] | 2732 | 1593 | |
| Roronoa Zoro (ST21-015) | jouée | | | 12567 → 5378 (43 %) |
| Roronoa Zoro (ST21-015) | Contre (carte) | | | 14563 → 1952 (13 %) |
| Gum Gum Dawn Whip (ST21-016) | [Déclenchement] | 2167 | 1614 | |
| Gum Gum Dawn Whip (ST21-016) | [Principale] | 5135 | 5135 | |
| Gum Gum Dawn Whip (ST21-016) | [Déclenchement] choisi | | | 2167 → 2167 (100 %) |
| Gum Gum Dawn Whip (ST21-016) | activée | | | 26716 → 5135 (19 %) |
| Gum Gum Taupe Bullet (ST21-017) | [Principale] | 4689 | 4689 | |
| Gum Gum Taupe Bullet (ST21-017) | [Déclenchement] | 2207 | 2196 | |
| Gum Gum Taupe Bullet (ST21-017) | activée | | | 22705 → 4689 (21 %) |
| Gum Gum Taupe Bullet (ST21-017) | [Déclenchement] choisi | | | 2207 → 2207 (100 %) |

## ST-22 Ace et Newgate (bleu)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Ace et Newgate (ST22-001) | [Activation : Principale] | 78134 | 78134 | |
| Ace et Newgate (ST22-001) | effet activé | | | 197426 → 78134 (40 %) |
| Izo (ST22-002) | [Jouée] | 4810 | 4810 | |
| Izo (ST22-002) | [Attaque adverse] | 4259 | 4259 | |
| Izo (ST22-002) | jouée | | | 26433 → 4810 (18 %) |
| Izo (ST22-002) | Contre (carte) | | | 17748 → 3616 (20 %) |
| Edward Newgate (ST22-003) | [Jouée] | 8413 | 8413 | |
| Edward Newgate (ST22-003) | jouée | | | 8833 → 8344 (94 %) |
| Elmy (ST22-004) | jouée | | | 23300 → 9699 (42 %) |
| Elmy (ST22-004) | Contre (carte) | | | 43122 → 9112 (21 %) |
| Oden Kozuki (ST22-005) | remplacement | 36 | 36 | |
| Oden Kozuki (ST22-005) | [Activation : Principale] | 37 | 37 | |
| Oden Kozuki (ST22-005) | jouée | | | 23192 → 13037 (56 %) |
| Oden Kozuki (ST22-005) | effet activé | | | 268 → 37 (14 %) |
| Joz (ST22-006) | [Jouée] | 8688 | 8688 | |
| Joz (ST22-006) | Contre (carte) | | | 47138 → 9983 (21 %) |
| Joz (ST22-006) | jouée | | | 10657 → 8688 (82 %) |
| Squardo (ST22-007) | [Activation : Principale] | 34987 | 34987 | |
| Squardo (ST22-007) | jouée | | | 39566 → 11606 (29 %) |
| Squardo (ST22-007) | effet activé | | | 114951 → 34987 (30 %) |
| Squardo (ST22-007) | Contre (carte) | | | 31080 → 6230 (20 %) |
| Les frères Decalvan (ST22-008) | jouée | | | 25920 → 10379 (40 %) |
| Les frères Decalvan (ST22-008) | Contre (carte) | | | 37088 → 7777 (21 %) |
| Vista (ST22-009) | jouée | | | 55519 → 14321 (26 %) |
| Vista (ST22-009) | bloque | | | 51264 → 7146 (14 %) |
| Portgas D. Ace (ST22-010) | Contre (carte) | | | 25746 → 5562 (22 %) |
| Portgas D. Ace (ST22-010) | jouée | | | 10549 → 4042 (38 %) |
| Whitey Bay (ST22-011) | [Jouée] | 11418 | 6277 | |
| Whitey Bay (ST22-011) | jouée | | | 38698 → 11418 (30 %) |
| Whitey Bay (ST22-011) | Contre (carte) | | | 28366 → 6982 (25 %) |
| Marco (ST22-012) | [En attaquant] | 8224 | 8224 | |
| Marco (ST22-012) | remplacement | 556 | 556 | |
| Marco (ST22-012) | jouée | | | 20562 → 6954 (34 %) |
| Marco (ST22-012) | Contre (carte) | | | 48095 → 10697 (22 %) |
| Little Oz Junior (ST22-013) | Contre (carte) | | | 44959 → 9392 (21 %) |
| Little Oz Junior (ST22-013) | jouée | | | 15254 → 8916 (58 %) |
| A.O (ST22-014) | jouée | | | 10260 → 4253 (41 %) |
| A.O (ST22-014) | Contre (carte) | | | 24315 → 5072 (21 %) |
| Je suis "Barbe Blanche" !! (ST22-015) | [Principale] | 1454 | 273 | |
| Je suis "Barbe Blanche" !! (ST22-015) | activée | | | 13520 → 1454 (11 %) |
| Retire immédiatement... ce que tu viens de dire !! (ST22-016) | [Contre] (Événement) | 2941 | 2941 | |
| Retire immédiatement... ce que tu viens de dire !! (ST22-016) | [Déclenchement] | 2235 | 2235 | |
| Retire immédiatement... ce que tu viens de dire !! (ST22-016) | Contre (Événement) | | | 8932 → 2941 (33 %) |
| Retire immédiatement... ce que tu viens de dire !! (ST22-016) | [Déclenchement] choisi | | | 2235 → 2235 (100 %) |
| Poing ardent (ST22-017) | [Principale] | 1498 | 711 | |
| Poing ardent (ST22-017) | [Déclenchement] | 2140 | 1858 | |
| Poing ardent (ST22-017) | activée | | | 16962 → 1498 (9 %) |
| Poing ardent (ST22-017) | [Déclenchement] choisi | | | 2140 → 2140 (100 %) |

## ST-30 Luffy et Ace (rouge/vert)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Luffy et Ace (ST30-001) | effet permanent | | | |
| Inazuma (ST30-002) | [Jouée] | 6790 | 6790 | |
| Inazuma (ST30-002) | jouée | | | 17975 → 6790 (38 %) |
| Inazuma (ST30-002) | Contre (carte) | | | 8393 → 1421 (17 %) |
| Edward Newgate (ST30-003) | jouée | | | 10797 → 9557 (89 %) |
| Edward Newgate (ST30-003) | Contre (carte) | | | 33304 → 6251 (19 %) |
| Emporio Ivankov (ST30-004) | [Jouée] | 6735 | 4076 | |
| Emporio Ivankov (ST30-004) | jouée | | | 17999 → 6735 (37 %) |
| Emporio Ivankov (ST30-004) | Contre (carte) | | | 8046 → 1376 (17 %) |
| Joz (ST30-005) | jouée | | | 27768 → 9238 (33 %) |
| Joz (ST30-005) | Contre (carte) | | | 55254 → 12174 (22 %) |
| Jinbe (ST30-006) | [Jouée] | 10687 | 8037 | |
| Jinbe (ST30-006) | jouée | | | 20427 → 10687 (52 %) |
| Jinbe (ST30-006) | Contre (carte) | | | 32930 → 6238 (19 %) |
| Portgas D. Ace (ST30-007) | [Jouée] | 5786 | 3154 | |
| Portgas D. Ace (ST30-007) | [En attaquant] | 10951 | 10891 | |
| Portgas D. Ace (ST30-007) | jouée | | | 16912 → 5786 (34 %) |
| Portgas D. Ace (ST30-007) | attaque le tour où elle est jouée | | | 48717 → 2908 (6 %) |
| Marco (ST30-008) | [En cas de KO] | 10912 | 3784 | |
| Marco (ST30-008) | jouée | | | 20665 → 10712 (52 %) |
| Marco (ST30-008) | Contre (carte) | | | 34089 → 6387 (19 %) |
| Marco (ST30-008) | bloque | | | 18896 → 2468 (13 %) |
| Little Oz Junior (ST30-009) | remplacement | 1417 | 1417 | |
| Little Oz Junior (ST30-009) | jouée | | | 41016 → 12233 (30 %) |
| Little Oz Junior (ST30-009) | Contre (carte) | | | 19590 → 3466 (18 %) |
| Crocodile (ST30-010) | [Jouée] | 12680 | 6907 | |
| Crocodile (ST30-010) | jouée | | | 16075 → 12680 (79 %) |
| Crocodile (ST30-010) | Contre (carte) | | | 27507 → 4841 (18 %) |
| Crocodile (ST30-010) | bloque | | | 22793 → 2430 (11 %) |
| Baggy (ST30-011) | remplacement | 548 | 548 | |
| Baggy (ST30-011) | jouée | | | 16773 → 5750 (34 %) |
| Baggy (ST30-011) | bloque | | | 17976 → 1758 (10 %) |
| Baggy (ST30-011) | Contre (carte) | | | 12955 → 2185 (17 %) |
| Monkey D. Luffy (ST30-012) | [Jouée] | 5727 | 3073 | |
| Monkey D. Luffy (ST30-012) | [En attaquant] | 10758 | 2236 | |
| Monkey D. Luffy (ST30-012) | jouée | | | 16734 → 5727 (34 %) |
| Monkey D. Luffy (ST30-012) | attaque le tour où elle est jouée | | | 47535 → 2818 (6 %) |
| Mr 2 Bonclay(Bentham) (ST30-013) | jouée | | | 30453 → 7100 (23 %) |
| Mr 2 Bonclay(Bentham) (ST30-013) | Contre (carte) | | | 44224 → 10311 (23 %) |
| Mr 3(Galdino) (ST30-014) | [Activation : Principale] | 7127 | 7127 | |
| Mr 3(Galdino) (ST30-014) | Contre (carte) | | | 10217 → 1945 (19 %) |
| Mr 3(Galdino) (ST30-014) | jouée | | | 15206 → 6426 (42 %) |
| Mr 3(Galdino) (ST30-014) | effet activé | | | 10077 → 7127 (71 %) |
| Cette ère... c'est celle de Barbe Blanche !! (ST30-015) | [Contre] (Événement) | 7839 | 7839 | |
| Cette ère... c'est celle de Barbe Blanche !! (ST30-015) | [Déclenchement] | 2655 | 2369 | |
| Cette ère... c'est celle de Barbe Blanche !! (ST30-015) | Contre (Événement) | | | 34315 → 7839 (23 %) |
| Cette ère... c'est celle de Barbe Blanche !! (ST30-015) | [Déclenchement] choisi | | | 2655 → 2655 (100 %) |
| Prêt à te battre, Luffy ?! Moi ? Toujours ! (ST30-016) | [Contre] (Événement) | 5275 | 5275 | |
| Prêt à te battre, Luffy ?! Moi ? Toujours ! (ST30-016) | Contre (Événement) | | | 17569 → 5275 (30 %) |
| Tu fonces toujours tête baissée vers le danger !! (ST30-017) | [Principale] | 11232 | 11232 | |
| Tu fonces toujours tête baissée vers le danger !! (ST30-017) | [Déclenchement] | 2591 | 2591 | |
| Tu fonces toujours tête baissée vers le danger !! (ST30-017) | activée | | | 33962 → 11232 (33 %) |
| Tu fonces toujours tête baissée vers le danger !! (ST30-017) | [Déclenchement] choisi | | | 2591 → 2591 (100 %) |

## ST-01 Chapeaux de paille (rouge)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Monkey.D.Luffy (ST01-001) | [Activation : Principale] | 77397 | 72818 | |
| Monkey.D.Luffy (ST01-001) | effet activé | | | 225001 → 77397 (34 %) |
| Usopp (ST01-002) | [En attaquant] | 2601 | 865 | |
| Usopp (ST01-002) | jouée | | | 35754 → 4967 (14 %) |
| Usopp (ST01-002) | Contre (carte) | | | 22105 → 5388 (24 %) |
| Usopp (ST01-002) | [Déclenchement] choisi | | | 4789 → 4789 (100 %) |
| Karoo (ST01-003) | Contre (carte) | | | 19800 → 4482 (23 %) |
| Karoo (ST01-003) | jouée | | | 50496 → 9671 (19 %) |
| Sanji (ST01-004) | jouée | | | 47284 → 13379 (28 %) |
| Sanji (ST01-004) | attaque le tour où elle est jouée | | | 17395 → 913 (5 %) |
| Jinbe (ST01-005) | [En attaquant] | 12541 | 4347 | |
| Jinbe (ST01-005) | jouée | | | 26610 → 14581 (55 %) |
| Tony-Tony Chopper (ST01-006) | jouée | | | 92717 → 10897 (12 %) |
| Tony-Tony Chopper (ST01-006) | bloque | | | 32392 → 5374 (17 %) |
| Nami (ST01-007) | [Activation : Principale] | 16020 | 13190 | |
| Nami (ST01-007) | jouée | | | 72686 → 6682 (9 %) |
| Nami (ST01-007) | Contre (carte) | | | 30750 → 6938 (23 %) |
| Nami (ST01-007) | effet activé | | | 58603 → 16020 (27 %) |
| Nico Robin (ST01-008) | jouée | | | 21744 → 11092 (51 %) |
| Nico Robin (ST01-008) | Contre (carte) | | | 17702 → 4098 (23 %) |
| Nefeltari Vivi (ST01-009) | jouée | | | 36012 → 9800 (27 %) |
| Nefeltari Vivi (ST01-009) | Contre (carte) | | | 21312 → 4952 (23 %) |
| Franky (ST01-010) | jouée | | | 15322 → 11799 (77 %) |
| Franky (ST01-010) | Contre (carte) | | | 15782 → 3707 (23 %) |
| Brook (ST01-011) | [Jouée] | 19034 | 19034 | |
| Brook (ST01-011) | jouée | | | 57157 → 11926 (21 %) |
| Brook (ST01-011) | Contre (carte) | | | 44304 → 7363 (17 %) |
| Monkey D. Luffy (ST01-012) | [En attaquant] | 10897 | 1125 | |
| Monkey D. Luffy (ST01-012) | jouée | | | 8549 → 7620 (89 %) |
| Monkey D. Luffy (ST01-012) | attaque le tour où elle est jouée | | | 89471 → 7391 (8 %) |
| Roronoa Zoro (ST01-013) | jouée | | | 14400 → 7261 (50 %) |
| Guard Point (ST01-014) | [Déclenchement] | 2357 | 2357 | |
| Guard Point (ST01-014) | [Contre] (Événement) | 5087 | 5087 | |
| Guard Point (ST01-014) | [Déclenchement] choisi | | | 2357 → 2357 (100 %) |
| Guard Point (ST01-014) | Contre (Événement) | | | 9889 → 5087 (51 %) |
| Gum-Gum Jet Pistol (ST01-015) | [Principale] | 6983 | 6846 | |
| Gum-Gum Jet Pistol (ST01-015) | activée | | | 24023 → 4594 (19 %) |
| Gum-Gum Jet Pistol (ST01-015) | [Déclenchement] choisi | | | 2389 → 2389 (100 %) |
| Diable Jambe (ST01-016) | [Principale] | 2472 | 2472 | |
| Diable Jambe (ST01-016) | [Déclenchement] | 2311 | 356 | |
| Diable Jambe (ST01-016) | activée | | | 85930 → 2472 (3 %) |
| Diable Jambe (ST01-016) | [Déclenchement] choisi | | | 2311 → 2311 (100 %) |
| Thousand Sunny (ST01-017) | [Activation : Principale] | 15762 | 15762 | |
| Thousand Sunny (ST01-017) | jouée | | | 28994 → 7018 (24 %) |
| Thousand Sunny (ST01-017) | effet activé | | | 62004 → 15762 (25 %) |

## AV-EB-MORGAN Marine de Shells Town (Morgan)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Kobby (OP11-001) | remplacement | 6940 | 6940 | |
| Helmeppo (OP03-091) | [Jouée] | 13757 | 4905 | |
| Helmeppo (OP03-091) | jouée | | | 146887 → 13757 (9 %) |
| Helmeppo (OP03-091) | Contre (carte) | | | 74552 → 14247 (19 %) |
| Ripper (OP11-096) | jouée | | | 60141 → 7127 (12 %) |
| Ripper (OP11-096) | Contre (carte) | | | 30893 → 6166 (20 %) |
| Ripper (OP11-096) | bloque | | | 18624 → 3744 (20 %) |
| Kobby (OP15-009) | remplacement | 1638 | 1638 | |
| Kobby (OP15-009) | jouée | | | 63304 → 8912 (14 %) |
| Kobby (OP15-009) | Contre (carte) | | | 26295 → 6212 (24 %) |
| Jango (ST06-003) | jouée | | | 108502 → 21176 (20 %) |
| Jango (ST06-003) | Contre (carte) | | | 52436 → 9724 (19 %) |
| Brandnew (OP03-089) | [Jouée] | 21262 | 21262 | |
| Brandnew (OP03-089) | jouée | | | 73823 → 21262 (29 %) |
| Brandnew (OP03-089) | Contre (carte) | | | 49709 → 8814 (18 %) |
| Doberman (OP02-107) | Contre (carte) | | | 23375 → 4921 (21 %) |
| Doberman (OP02-107) | jouée | | | 36038 → 12489 (35 %) |
| Monkey.D.Garp (OP03-014) | [En attaquant] | 14593 | 2673 | |
| Monkey.D.Garp (OP03-014) | jouée | | | 20753 → 15495 (75 %) |
| T-Bone (ST06-013) | jouée | | | 44112 → 28858 (65 %) |
| T-Bone (ST06-013) | Contre (carte) | | | 37641 → 8025 (21 %) |
| Morgan (OP11-094) | jouée | | | 6589 → 6116 (93 %) |
| Morgan (OP11-094) | Contre (carte) | | | 15909 → 3979 (25 %) |
| Quoi qu'il arrive... je deviendrai officier de la marine !! (OP11-099) | [Principale] | 14399 | 14399 | |
| Quoi qu'il arrive... je deviendrai officier de la marine !! (OP11-099) | [Déclenchement] choisi | | | 3893 → 3893 (100 %) |
| Quoi qu'il arrive... je deviendrai officier de la marine !! (OP11-099) | activée | | | 46311 → 10506 (23 %) |
| Ice Age (OP02-117) | [Principale] | 21340 | 21340 | |
| Ice Age (OP02-117) | [Déclenchement] | 8514 | 7284 | |
| Ice Age (OP02-117) | activée | | | 95855 → 21340 (22 %) |
| Ice Age (OP02-117) | [Déclenchement] choisi | | | 8514 → 8514 (100 %) |
| Koby (ST06-002) | [Jouée] | 20583 | 1781 | |
| Koby (ST06-002) | jouée | | | 106104 → 20583 (19 %) |
| Koby (ST06-002) | Contre (carte) | | | 51144 → 8928 (17 %) |
| Hermep (ST06-010) | [Jouée] | 21960 | 20345 | |
| Hermep (ST06-010) | jouée | | | 77359 → 21960 (28 %) |
| Hermep (ST06-010) | Contre (carte) | | | 51988 → 9650 (19 %) |

## AV-EB-BAGGY Bande de Baggy (Orange Town)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Baggy (OP16-041) | effet « Quand ... » | 0 | 0 | |
| Buggy (ST03-011) | jouée | | | 50140 → 11216 (22 %) |
| Buggy (ST03-011) | Contre (carte) | | | 29050 → 5298 (18 %) |
| Mohji (OP02-060) | jouée | | | 102554 → 21640 (21 %) |
| Mohji (OP02-060) | Contre (carte) | | | 61528 → 11562 (19 %) |
| Buggy (OP02-058) | [Jouée] | 21446 | 21446 | |
| Buggy (OP02-058) | jouée | | | 102208 → 21446 (21 %) |
| Buggy (OP02-058) | Contre (carte) | | | 61023 → 11300 (19 %) |
| Cabaji (OP02-052) | [Jouée] | 24523 | 6115 | |
| Cabaji (OP02-052) | jouée | | | 68040 → 24523 (36 %) |
| Cabaji (OP02-052) | Contre (carte) | | | 51563 → 9579 (19 %) |
| Richie (OP09-054) | jouée | | | 77605 → 17892 (23 %) |
| Richie (OP09-054) | bloque | | | 88007 → 13016 (15 %) |
| Richie (OP09-054) | Contre (carte) | | | 65593 → 12857 (20 %) |
| Cabaji (ST25-002) | jouée | | | 50981 → 18474 (36 %) |
| Cabaji (ST25-002) | bloque | | | 19170 → 5757 (30 %) |
| Cabaji (ST25-002) | Contre (carte) | | | 86145 → 16387 (19 %) |
| Baggy (ST25-004) | [Activation : Principale] | 6827 | 6827 | |
| Baggy (ST25-004) | Contre (carte) | | | 36697 → 7550 (21 %) |
| Baggy (ST25-004) | jouée | | | 24103 → 8517 (35 %) |
| Baggy (ST25-004) | effet activé | | | 13720 → 6827 (50 %) |
| Morge et Cabaji (OP12-055) | jouée | | | 37276 → 20322 (55 %) |
| Morge et Cabaji (OP12-055) | Contre (carte) | | | 78865 → 13614 (17 %) |
| Morge (OP09-053) | [Jouée] | 15568 | 15568 | |
| Morge (OP09-053) | jouée | | | 28241 → 15045 (53 %) |
| Morge (OP09-053) | Contre (carte) | | | 57925 → 9690 (17 %) |
| Baggy (OP16-048) | [Jouée] | 17925 | 17925 | |
| Baggy (OP16-048) | jouée | | | 23435 → 17925 (76 %) |
| Baggy (OP16-048) | Contre (carte) | | | 39968 → 6981 (17 %) |
| Baggy (OP16-048) | effet « Quand ... » | 0 | 0 | |
| Baggy (OP12-049) | jouée | | | 27066 → 25264 (93 %) |
| Baggy (OP12-049) | Contre (carte) | | | 59101 → 8478 (14 %) |
| Maggy Ball spéciale (OP09-058) | [Déclenchement] | 9279 | 7686 | |
| Maggy Ball spéciale (OP09-058) | [Principale] | 20480 | 20480 | |
| Maggy Ball spéciale (OP09-058) | activée | | | 81992 → 20480 (25 %) |
| Maggy Ball spéciale (OP09-058) | [Déclenchement] choisi | | | 9279 → 9279 (100 %) |
| Tour de passe-passe brouillard (OP09-059) | [Contre] (Événement) | 16899 | 16899 | |
| Tour de passe-passe brouillard (OP09-059) | [Déclenchement] | 9465 | 9465 | |
| Tour de passe-passe brouillard (OP09-059) | Contre (Événement) | | | 48978 → 16899 (35 %) |
| Tour de passe-passe brouillard (OP09-059) | [Déclenchement] choisi | | | 9465 → 9465 (100 %) |

## AV-EB-KURO Pirates du Chat Noir (Kuro)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Kuro (OP03-021) | [Activation : Principale] | 35 | 35 | |
| Kuro (OP03-021) | effet activé | | | 167181 → 35 (0 %) |
| Jango (OP15-026) | [Jouée] | 10616 | 10616 | |
| Jango (OP15-026) | jouée | | | 42250 → 10340 (24 %) |
| Jango (OP15-026) | effet activé | | | 183127 → 0 (0 %) |
| Jango (OP15-026) | Contre (carte) | | | 23603 → 4586 (19 %) |
| Jango (OP15-026) | [Activation : Principale] | 0 | 0 | |
| Les frères Nyaban (OP15-028) | [Jouée] | 11051 | 8125 | |
| Les frères Nyaban (OP15-028) | jouée | | | 42605 → 10757 (25 %) |
| Les frères Nyaban (OP15-028) | Contre (carte) | | | 22401 → 5739 (26 %) |
| Alvida (OP03-023) | Contre (carte) | | | 40297 → 8754 (22 %) |
| Alvida (OP03-023) | jouée | | | 81683 → 21780 (27 %) |
| One, Two, Jango (OP03-039) | [Déclenchement] | 8178 | 6551 | |
| One, Two, Jango (OP03-039) | [Principale] | 21064 | 21064 | |
| One, Two, Jango (OP03-039) | activée | | | 87862 → 21064 (24 %) |
| One, Two, Jango (OP03-039) | [Déclenchement] choisi | | | 8178 → 8178 (100 %) |
| Pearl (OP03-031) | Contre (carte) | | | 50552 → 10999 (22 %) |
| Pearl (OP03-031) | jouée | | | 68313 → 18431 (27 %) |
| Pearl (OP03-031) | bloque | | | 48018 → 8878 (18 %) |
| Momoo (OP03-035) | jouée | | | 104480 → 32020 (31 %) |
| Momoo (OP03-035) | Contre (carte) | | | 74056 → 15656 (21 %) |
| Sham (OP03-027) | [Jouée] | 11632 | 7047 | |
| Sham (OP03-027) | jouée | | | 22494 → 11040 (49 %) |
| Sham (OP03-027) | Contre (carte) | | | 23903 → 4998 (21 %) |
| Out-of-the-Bag (OP03-036) | [Déclenchement] | 4616 | 1260 | |
| Out-of-the-Bag (OP03-036) | [Principale] | 76 | 76 | |
| Out-of-the-Bag (OP03-036) | activée | | | 118176 → 76 (0 %) |
| Out-of-the-Bag (OP03-036) | [Déclenchement] choisi | | | 4616 → 4616 (100 %) |
| Buchi (OP03-034) | [Jouée] | 12095 | 3351 | |
| Buchi (OP03-034) | Contre (carte) | | | 24678 → 5151 (21 %) |
| Buchi (OP03-034) | jouée | | | 18606 → 10035 (54 %) |
| Gin (OP03-024) | [Jouée] | 12551 | 9885 | |
| Gin (OP03-024) | Contre (carte) | | | 23941 → 5258 (22 %) |
| Gin (OP03-024) | jouée | | | 19433 → 12117 (62 %) |
| Jango (OP03-028) | [Jouée] | 15132 | 13995 | |
| Jango (OP03-028) | jouée | | | 19679 → 13373 (68 %) |
| Kuro (OP04-023) | Contre (carte) | | | 26489 → 5269 (20 %) |
| Kuro (OP04-023) | jouée | | | 13477 → 10810 (80 %) |
| Kuro (OP14-025) | [Jouée] | 8230 | 7142 | |
| Kuro (OP14-025) | jouée | | | 8603 → 8230 (96 %) |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Principale] | 10786 | 10786 | |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Déclenchement] | 5925 | 5113 | |
| Deathly Poison Gas Bomb MH5 (OP03-038) | activée | | | 144095 → 10786 (7 %) |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Déclenchement] choisi | | | 5925 → 5925 (100 %) |

## AV-EB-KRIEG Armada de Don Krieg (Baratie)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Krieg (OP15-001) | [Activation : Principale] | 83786 | 4599 | |
| Krieg (OP15-001) | effet activé | | | 223588 → 83786 (37 %) |
| Alvida (OP03-023) | Contre (carte) | | | 40297 → 8754 (22 %) |
| Alvida (OP03-023) | jouée | | | 81683 → 21780 (27 %) |
| Pearl (OP03-031) | Contre (carte) | | | 50552 → 10999 (22 %) |
| Pearl (OP03-031) | jouée | | | 68313 → 18431 (27 %) |
| Pearl (OP03-031) | bloque | | | 48018 → 8878 (18 %) |
| Momoo (OP03-035) | jouée | | | 104480 → 32020 (31 %) |
| Momoo (OP03-035) | Contre (carte) | | | 74056 → 15656 (21 %) |
| Gin (OP03-024) | [Jouée] | 12551 | 9885 | |
| Gin (OP03-024) | Contre (carte) | | | 23941 → 5258 (22 %) |
| Gin (OP03-024) | jouée | | | 19433 → 12117 (62 %) |
| Pearl (OP15-011) | [En cas de KO] | 3726 | 3493 | |
| Pearl (OP15-011) | jouée | | | 10128 → 4982 (49 %) |
| Pearl (OP15-011) | bloque | | | 7762 → 4126 (53 %) |
| Pearl (OP15-011) | Contre (carte) | | | 12288 → 2951 (24 %) |
| Hatchan (OP03-033) | [Déclenchement] | 7349 | 7349 | |
| Hatchan (OP03-033) | jouée | | | 43792 → 19254 (44 %) |
| Hatchan (OP03-033) | [Déclenchement] choisi | | | 7349 → 7349 (100 %) |
| Hatchan (OP03-033) | Contre (carte) | | | 60581 → 11230 (19 %) |
| Chew (OP03-029) | [Jouée] | 15144 | 6535 | |
| Chew (OP03-029) | [Déclenchement] choisi | | | 5496 → 5496 (100 %) |
| Chew (OP03-029) | jouée | | | 28080 → 9356 (33 %) |
| Chew (OP03-029) | Contre (carte) | | | 38611 → 6913 (18 %) |
| Krieg (OP03-025) | [Jouée] | 8425 | 3612 | |
| Krieg (OP03-025) | jouée | | | 10144 → 8425 (83 %) |
| Buggy (OP03-032) | jouée | | | 31207 → 14784 (47 %) |
| Krieg (OP15-008) | [Jouée] | 8672 | 8672 | |
| Krieg (OP15-008) | [Activation : Principale] | 8642 | 8196 | |
| Krieg (OP15-008) | jouée | | | 9114 → 8672 (95 %) |
| Krieg (OP15-008) | effet activé | | | 21194 → 8642 (41 %) |
| Krieg (OP15-008) | attaque le tour où elle est jouée | | | 132903 → 8517 (6 %) |
| Car c'est la seule issue d'un combat qui distingue les forts des faibles (OP15-037) | [Principale] | 10269 | 10269 | |
| Car c'est la seule issue d'un combat qui distingue les forts des faibles (OP15-037) | [Déclenchement] | 3469 | 3469 | |
| Car c'est la seule issue d'un combat qui distingue les forts des faibles (OP15-037) | activée | | | 32913 → 10269 (31 %) |
| Car c'est la seule issue d'un combat qui distingue les forts des faibles (OP15-037) | [Déclenchement] choisi | | | 3469 → 3469 (100 %) |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Principale] | 10786 | 10786 | |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Déclenchement] | 5925 | 5113 | |
| Deathly Poison Gas Bomb MH5 (OP03-038) | activée | | | 144095 → 10786 (7 %) |
| Deathly Poison Gas Bomb MH5 (OP03-038) | [Déclenchement] choisi | | | 5925 → 5925 (100 %) |
| Et personne ne discute jamais mes ordres !! (OP15-038) | [Principale] | 4790 | 4790 | |
| Et personne ne discute jamais mes ordres !! (OP15-038) | [Contre] (Événement) | 6975 | 6975 | |
| Et personne ne discute jamais mes ordres !! (OP15-038) | activée | | | 144112 → 4790 (3 %) |
| Et personne ne discute jamais mes ordres !! (OP15-038) | Contre (Événement) | | | 24886 → 6975 (28 %) |
| Nami (OP03-030) | [Jouée] | 14600 | 14600 | |
| Nami (OP03-030) | jouée | | | 48088 → 8818 (18 %) |
| Nami (OP03-030) | Contre (carte) | | | 34556 → 6247 (18 %) |
| Nami (OP03-030) | [Déclenchement] choisi | | | 5494 → 5494 (100 %) |
| One, Two, Jango (OP03-039) | [Déclenchement] | 8178 | 6551 | |
| One, Two, Jango (OP03-039) | [Principale] | 21064 | 21064 | |
| One, Two, Jango (OP03-039) | activée | | | 87862 → 21064 (24 %) |
| One, Two, Jango (OP03-039) | [Déclenchement] choisi | | | 8178 → 8178 (100 %) |
| Tooth Attack (OP03-037) | [Déclenchement] | 3625 | 1210 | |
| Tooth Attack (OP03-037) | [Principale] | 5837 | 5837 | |
| Tooth Attack (OP03-037) | [Déclenchement] choisi | | | 3625 → 3625 (100 %) |
| Tooth Attack (OP03-037) | activée | | | 98716 → 5837 (6 %) |

## AV-EB-ARLONG Pirates d’Arlong (Arlong Park)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Arlong (OP03-022) | [En attaquant] | 63669 | 245 | |
| Arlong (OP16-023) | jouée | | | 44086 → 8661 (20 %) |
| Arlong (OP16-023) | Contre (carte) | | | 25241 → 3994 (16 %) |
| Nami (OP03-030) | [Jouée] | 14600 | 14600 | |
| Nami (OP03-030) | jouée | | | 48088 → 8818 (18 %) |
| Nami (OP03-030) | Contre (carte) | | | 34556 → 6247 (18 %) |
| Nami (OP03-030) | [Déclenchement] choisi | | | 5494 → 5494 (100 %) |
| Momoo (OP03-035) | jouée | | | 104480 → 32020 (31 %) |
| Momoo (OP03-035) | Contre (carte) | | | 74056 → 15656 (21 %) |
| Arlong (EB02-011) | [Jouée] | 7762 | 7762 | |
| Arlong (EB02-011) | jouée | | | 33097 → 7762 (23 %) |
| Arlong (EB02-011) | Contre (carte) | | | 37558 → 6737 (18 %) |
| Charlotte Praline (OP03-111) | jouée | | | 32554 → 7321 (22 %) |
| Charlotte Praline (OP03-111) | Contre (carte) | | | 37021 → 6146 (17 %) |
| Jinbe (OP07-027) | jouée | | | 19578 → 10298 (53 %) |
| Jinbe (OP07-027) | Contre (carte) | | | 24690 → 3682 (15 %) |
| Kuroobi (OP03-026) | [Jouée] | 8972 | 8464 | |
| Kuroobi (OP03-026) | jouée | | | 19941 → 5204 (26 %) |
| Kuroobi (OP03-026) | Contre (carte) | | | 29095 → 4852 (17 %) |
| Kuroobi (OP03-026) | [Déclenchement] choisi | | | 3584 → 3584 (100 %) |
| Chew (OP03-029) | [Jouée] | 15144 | 6535 | |
| Chew (OP03-029) | [Déclenchement] choisi | | | 5496 → 5496 (100 %) |
| Chew (OP03-029) | jouée | | | 28080 → 9356 (33 %) |
| Chew (OP03-029) | Contre (carte) | | | 38611 → 6913 (18 %) |
| Hatchan (OP03-033) | [Déclenchement] | 7349 | 7349 | |
| Hatchan (OP03-033) | jouée | | | 43792 → 19254 (44 %) |
| Hatchan (OP03-033) | [Déclenchement] choisi | | | 7349 → 7349 (100 %) |
| Hatchan (OP03-033) | Contre (carte) | | | 60581 → 11230 (19 %) |
| Arlong (OP06-023) | [Jouée] | 12179 | 9562 | |
| Arlong (OP06-023) | [Déclenchement] | 3802 | 3172 | |
| Arlong (OP06-023) | jouée | | | 15191 → 11963 (79 %) |
| Arlong (OP06-023) | [Déclenchement] choisi | | | 3802 → 3802 (100 %) |
| Jinbe (OP13-029) | jouée | | | 13240 → 12317 (93 %) |
| Jinbe (OP13-029) | Contre (carte) | | | 25367 → 2293 (9 %) |
| Tooth Attack (OP03-037) | [Déclenchement] | 3625 | 1210 | |
| Tooth Attack (OP03-037) | [Principale] | 5837 | 5837 | |
| Tooth Attack (OP03-037) | [Déclenchement] choisi | | | 3625 → 3625 (100 %) |
| Tooth Attack (OP03-037) | activée | | | 98716 → 5837 (6 %) |
| Térébration (OP03-118) | [Contre] (Événement) | 8149 | 8149 | |
| Térébration (OP03-118) | [Déclenchement] | 51 | 51 | |
| Térébration (OP03-118) | Contre (Événement) | | | 17129 → 8149 (48 %) |
| Térébration (OP03-118) | [Déclenchement] choisi | | | 3701 → 51 (1 %) |

## AV-EB-BAGGY-ALVIDA Baggy et Alvida (Loguetown)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Baggy (OP16-041) | effet « Quand ... » | 0 | 0 | |
| Mohji (OP02-060) | jouée | | | 102554 → 21640 (21 %) |
| Mohji (OP02-060) | Contre (carte) | | | 61528 → 11562 (19 %) |
| Buggy (OP02-058) | [Jouée] | 21446 | 21446 | |
| Buggy (OP02-058) | jouée | | | 102208 → 21446 (21 %) |
| Buggy (OP02-058) | Contre (carte) | | | 61023 → 11300 (19 %) |
| Cabaji (OP02-052) | [Jouée] | 24523 | 6115 | |
| Cabaji (OP02-052) | jouée | | | 68040 → 24523 (36 %) |
| Cabaji (OP02-052) | Contre (carte) | | | 51563 → 9579 (19 %) |
| Richie (OP09-054) | jouée | | | 77605 → 17892 (23 %) |
| Richie (OP09-054) | bloque | | | 88007 → 13016 (15 %) |
| Richie (OP09-054) | Contre (carte) | | | 65593 → 12857 (20 %) |
| Alvida (OP01-064) | [En attaquant] | 6677 | 2356 | |
| Alvida (OP01-064) | jouée | | | 45988 → 9765 (21 %) |
| Alvida (OP01-064) | Contre (carte) | | | 42368 → 8016 (19 %) |
| Cabaji (ST25-002) | jouée | | | 50981 → 18474 (36 %) |
| Cabaji (ST25-002) | bloque | | | 19170 → 5757 (30 %) |
| Cabaji (ST25-002) | Contre (carte) | | | 86145 → 16387 (19 %) |
| Alvida (OP12-042) | [Jouée] | 10796 | 5795 | |
| Alvida (OP12-042) | jouée | | | 21218 → 10796 (51 %) |
| Alvida (OP12-042) | Contre (carte) | | | 33483 → 6861 (20 %) |
| Morge et Cabaji (OP12-055) | jouée | | | 37276 → 20322 (55 %) |
| Morge et Cabaji (OP12-055) | Contre (carte) | | | 78865 → 13614 (17 %) |
| Baggy (OP16-048) | [Jouée] | 17925 | 17925 | |
| Baggy (OP16-048) | jouée | | | 23435 → 17925 (76 %) |
| Baggy (OP16-048) | Contre (carte) | | | 39968 → 6981 (17 %) |
| Baggy (OP16-048) | effet « Quand ... » | 0 | 0 | |
| Morge (OP09-053) | [Jouée] | 15568 | 15568 | |
| Morge (OP09-053) | jouée | | | 28241 → 15045 (53 %) |
| Morge (OP09-053) | Contre (carte) | | | 57925 → 9690 (17 %) |
| Baggy (OP12-049) | jouée | | | 27066 → 25264 (93 %) |
| Baggy (OP12-049) | Contre (carte) | | | 59101 → 8478 (14 %) |
| Maggy Ball spéciale (OP09-058) | [Déclenchement] | 9279 | 7686 | |
| Maggy Ball spéciale (OP09-058) | [Principale] | 20480 | 20480 | |
| Maggy Ball spéciale (OP09-058) | activée | | | 81992 → 20480 (25 %) |
| Maggy Ball spéciale (OP09-058) | [Déclenchement] choisi | | | 9279 → 9279 (100 %) |
| Tour de passe-passe brouillard (OP09-059) | [Contre] (Événement) | 16899 | 16899 | |
| Tour de passe-passe brouillard (OP09-059) | [Déclenchement] | 9465 | 9465 | |
| Tour de passe-passe brouillard (OP09-059) | Contre (Événement) | | | 48978 → 16899 (35 %) |
| Tour de passe-passe brouillard (OP09-059) | [Déclenchement] choisi | | | 9465 → 9465 (100 %) |

## AV-EB-SMOKER Marine de Loguetown (Smoker)

| Carte | Effet | Déclenché | Utile | Choix proposé → pris |
|---|---|---|---|---|
| Smoker (OP02-093) | [Activation : Principale] | 24066 | 23912 | |
| Smoker (OP02-093) | effet activé | | | 25012 → 24066 (96 %) |
| Koby (ST06-002) | [Jouée] | 20583 | 1781 | |
| Koby (ST06-002) | jouée | | | 106104 → 20583 (19 %) |
| Koby (ST06-002) | Contre (carte) | | | 51144 → 8928 (17 %) |
| Helmeppo (OP03-091) | [Jouée] | 13757 | 4905 | |
| Helmeppo (OP03-091) | jouée | | | 146887 → 13757 (9 %) |
| Helmeppo (OP03-091) | Contre (carte) | | | 74552 → 14247 (19 %) |
| Hermep (ST06-010) | [Jouée] | 21960 | 20345 | |
| Hermep (ST06-010) | jouée | | | 77359 → 21960 (28 %) |
| Hermep (ST06-010) | Contre (carte) | | | 51988 → 9650 (19 %) |
| Brandnew (OP03-089) | [Jouée] | 21262 | 21262 | |
| Brandnew (OP03-089) | jouée | | | 73823 → 21262 (29 %) |
| Brandnew (OP03-089) | Contre (carte) | | | 49709 → 8814 (18 %) |
| Tsuru (ST06-007) | jouée | | | 28347 → 3905 (14 %) |
| Tsuru (ST06-007) | Contre (carte) | | | 21156 → 3925 (19 %) |
| Tsuru (ST06-007) | bloque | | | 11504 → 2044 (18 %) |
| Tashigi (ST06-006) | [Activation : Principale] | 8000 | 8000 | |
| Tashigi (ST06-006) | jouée | | | 30451 → 12573 (41 %) |
| Tashigi (ST06-006) | effet activé | | | 116260 → 8000 (7 %) |
| Tashigi (ST06-006) | Contre (carte) | | | 29387 → 5642 (19 %) |
| Hina (ST06-008) | [Jouée] | 8261 | 7926 | |
| Hina (ST06-008) | jouée | | | 11641 → 8261 (71 %) |
| Smoker (OP02-102) | [En attaquant] | 10449 | 5046 | |
| Smoker (OP02-102) | jouée | | | 29795 → 11718 (39 %) |
| Smoker (OP02-102) | Contre (carte) | | | 28014 → 5419 (19 %) |
| Momonga (ST06-011) | jouée | | | 9641 → 7248 (75 %) |
| Momonga (ST06-011) | Contre (carte) | | | 10479 → 2041 (19 %) |
| Smoker (ST06-004) | jouée | | | 14782 → 13048 (88 %) |
| T-Bone (ST06-013) | jouée | | | 44112 → 28858 (65 %) |
| T-Bone (ST06-013) | Contre (carte) | | | 37641 → 8025 (21 %) |
| Jango (ST06-003) | jouée | | | 108502 → 21176 (20 %) |
| Jango (ST06-003) | Contre (carte) | | | 52436 → 9724 (19 %) |
| Fullbody (ST06-009) | jouée | | | 11928 → 2671 (22 %) |
| Fullbody (ST06-009) | Contre (carte) | | | 8344 → 1489 (18 %) |
| White Out (ST06-016) | [Déclenchement] | 4628 | 4628 | |
| White Out (ST06-016) | [Contre] (Événement) | 10208 | 10208 | |
| White Out (ST06-016) | Contre (Événement) | | | 28876 → 10208 (35 %) |
| White Out (ST06-016) | [Déclenchement] choisi | | | 4628 → 4628 (100 %) |
| Ice Age (OP02-117) | [Principale] | 21340 | 21340 | |
| Ice Age (OP02-117) | [Déclenchement] | 8514 | 7284 | |
| Ice Age (OP02-117) | activée | | | 95855 → 21340 (22 %) |
| Ice Age (OP02-117) | [Déclenchement] choisi | | | 8514 → 8514 (100 %) |

