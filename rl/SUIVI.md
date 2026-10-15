# IA entraînée : état du chantier et reprise

Document de passation : où en est l'IA par apprentissage par renforcement, ce qui a été décidé et pourquoi, comment
continuer. Le détail technique est dans `game/docs/ia-rl.md` (analyse, architecture, § 11 réalisation) et
`rl/README.md` (mode d'emploi).

## 1. En bref

- **Objectif** : une IA du simulateur One Piece TCG qui apprend seule (PPO, récompense +1 victoire / −1 défaite,
  rien d'autre), avec la seule information d'un joueur, entraînable sur le PC (`python train.py`), jouable dans le
  simulateur (niveau « IA entraînée », ONNX dans le navigateur).
- **Code** : sur `main` (le dossier de l'entraînement, `TCGC/`, suit `main` sur la branche `claude/awesome-hopper-nj0x4y`).
- **En ligne** : modèle u7713 (12 octobre 2026, niveau 5, commit `da638e7`), mis en ligne par l'utilisateur.
- **Entraînement général terminé** (14 octobre 2026) : `rtx2070-main` arrêté à **u8959** (niveau 5, ligue, ~2,04 millions
  de parties, 12 decks), vrai catalogue (2 785 cartes), encodage `a0664ced` (version 4). Il est figé et sert de
  départ aux **IA spécialisées par deck** (décision 15, `rl/README.md` § 16) : une IA par deck, entraînée sur le PC
  en ne jouant que ce deck.

## 2. Où en est l'IA (mesures)

| Moment | Contre l'heuristique (évaluation) | Contre `mc:16` | Elo (heuristique = 1000) |
|---|---|---|---|
| Fin du niveau 2 sans comparaisons (u3000) | 22 % | — | 784 |
| Après comparaisons par option (u4300) | ~50 % | — | ~1000 |
| Évaluation complète (u5530, `evaluate.py`) | 51 % | 21 % ; `mc:48` 12,5 % | 1010 (mc16 1238, mc48 1342) |
| Niveau 2 validé (u5875) | 62–66 % | — | ~1110 |
| Niveau 3 (u5900–6300) | 56–76 % | 12,5–50 %, moyenne ~33 % | 1030–1160 |
| Niveau 3 avec self-play (u6400–6700) | 62–69 % | 42–54 %, moyenne ~48 % | 1098–1165 |
| Évaluation complète, 7 decks (u6715, 12 octobre 2026) | 64,8 % (4 704 parties) | 54,5 % (112 parties) | 1098 (mc16 1067) |
| **Niveau 3 validé (u7200)** | 73,5 % | 62,5 % | 1197 |
| Niveau 4, juge : la version u7200 (u7250–7350) | 69–80 % | contre u7200 : 51–52 % | 1170–1225 |
| 8 decks, Mihawk jamais vu (u7383, 12 octobre 2026) | 58,9 % (6 144 parties ; 13,7 % en jouant Mihawk) | — | — |
| **Niveau 4 validé (u7650)** | 65,6 % | contre u7200 : 61,7 % (59,4 % à u7600) | 1154 |
| Niveau 5, ligue (u7700) | 63,3 % | contre les 4 dernières versions : 48–57 % | 1123 |
| 9 decks, Robin jamais vu (u7713, 12 octobre 2026) | 57,5 % (7 776 parties ; 39,6 % en jouant Robin, 39,7 % Mihawk) | — | — |
| 10 decks, Xebec jamais vu (u7713, même modèle) | 54,0 % (9 600 parties ; 31,2 % en jouant Xebec) | — | — |
| 11 decks, Ener jamais vu (u7754, 13 octobre 2026) | 51,5 % (11 616 parties ; 8,2 % en jouant Ener) | — | — |
| 12 decks, Kaido jamais vu (u7815, 13 octobre 2026) | 48,9 % (13 824 parties ; 11,0 % en jouant Kaido) | — | — |

Le niveau 3 se valide à **55 % contre `mc:16` et 60 % contre l'heuristique dans la même évaluation** (fait à u7200).
Le niveau 4 se valide à **58 % contre sa version de départ (u7200) et 60 % contre l'heuristique, deux évaluations de
suite** (une toutes les 50 mises à jour). Dans le
simulateur, Confirmé et Expert sont limités en temps (0,5 s / 1,8 s, ~4 à 10 tirages) : bien plus faibles que
`mc:16`/`mc:48`. L'IA entraînée bat déjà l'Expert du simulateur (impression de jeu confirmée par les mesures).

## 3. Décisions et enseignements (dans l'ordre)

1. **Plateau du niveau 2 (8 % puis 22 %)** : enquête sur 4 angles. L'heuristique ne triche pas (0 décision différente
   sur 49 848 entre état complet et vue du joueur), les options ne sont pas ambiguës. Cause : une option ne disait
   jamais si l'attaquant était plus fort que la cible, si un Contre suffisait... → **encodage 4 : 15 comparaisons par
   option** (calculées sur la vue, ce sont des faits, pas des règles), modèle prolongé sans rien perdre
   (`rl/opcg_rl/migrate.py`). Effet : 22 % → ~50 % contre l'heuristique.
2. **Niveau 2 gradué** : heuristique « bruitée » (une décision sur 2, 4 ou 10 jouée au hasard) pour donner des
   victoires, donc un signal, à chaque marche. La récompense ne change pas.
3. **Plateau à ~54 %, `kl` au plafond** : `ppo.lr` 0,0003 → **0,0001** ; le niveau 2 est validé ~100 mises à jour
   après.
4. **GPU** : apprentissage irrégulier (10 à 384 s) dû au débordement de la mémoire du GPU sous Windows → micro-lots
   (`ppo.microbatch_size`, même calcul) et attention SDPA.
5. **Niveau 3 lent (2,8 parties/s)** : le coût vient du calcul du Monte-Carlo (`mc2`) lui-même, pas de l'attente entre
   processus (une collecte asynchrone ne gagnerait que ~1,3×). Décision : **Monte-Carlo retiré de l'entraînement du
   niveau 3, remplacé par du self-play ; il reste le juge du passage** (option 1, relancée vers u6304).
6. **Nouveau deck : généralisation mesurée, puis deck inclus dans l'entraînement** (12 octobre 2026). Le premier
   deck du méta (`META-SABO-2026-10`, phase 4 des cartes) a été évalué avec le modèle u6715, qui ne l'avait jamais vu :
   contre l'heuristique, 672 parties par deck joué par le modèle, comparées à l'heuristique jouant le même deck
   (1 400 parties par deck).

   | Deck joué | Modèle | Heuristique | Gain |
   |---|---|---|---|
   | META-SABO-2026-10 (nouveau) | 73,7 % | 74,0 % | −0,3 |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 67,0 / 74,1 / 63,4 / 33,5 / 73,2 / 72,0 % | 48,1 / 57,4 / 54,1 / 23,6 / 51,9 / 42,5 % | +9 à +30 (moyenne +18) |

   Face au nouveau deck, le modèle garde son avance habituelle (~+15 points) ; en le jouant, aucun gain (moins bien que
   l'heuristique dans 3 confrontations). Sans identifiants de cartes (`--no-card-ids`), il garde l'essentiel de son
   avance sur les decks connus (+14) : ce n'est pas l'identité des cartes qui manque, mais la pratique du plan de jeu
   du deck. **Décision de l'utilisateur : inclure le deck dès la reprise** (configuration `decks: all` ; le vocabulaire
   reste de 90 cartes, les 13 nouvelles sont « inconnues »). Les évaluations de passage portent désormais sur 49
   confrontations au lieu de 36. Les nouveaux decks de la phase 4 (Mihawk ensuite) suivront le même chemin : mesurer
   la généralisation, puis décider de l'inclusion.
   Même mise à jour : règles du moteur version 2 (ordre au choix des cartes remises sous le deck, question `bottomOrder`,
   rangée dans la famille `trashToDeck` ; encodage inchangé `a0664ced`).
7. **Deuxième deck du méta (Mihawk) : mesuré, puis inclus** (12 octobre 2026). Modèle u7383 (Sabo inclus depuis
   u6715) contre l'heuristique : 768 parties par deck joué par le modèle, comparées à l'heuristique jouant le même deck
   (1 600 parties par deck, toutes les confrontations).

   | Deck joué | Modèle | Heuristique | Écart |
   |---|---|---|---|
   | META-MIHAWK-2026-10 (nouveau) | 13,7 % | 70,7 % | −57 |
   | META-SABO-2026-10 (inclus depuis u6715) | 89,5 % | 74,1 % | +15 (−0,3 avant l'inclusion) |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 67,1 / 66,4 / 58,5 / 30,7 / 70,8 / 74,2 % | 43,3 / 50,3 / 52,0 / 21,5 / 46,9 / 40,0 % | +6 à +34 (moyenne +19) |

   Face à Mihawk, le modèle garde son avance (+21 points en moyenne avec les 7 autres decks). En le jouant, il
   s'effondre : il active l'effet du Leader dès le tour 1 (99,9 %), qui redresse 3 DON!! mais interdit ensuite de
   jouer des Personnages pour le tour ; il ne développe plus son terrain. Aucun deck connu ne lui a appris ce revers
   (l'interdiction n'est pas encodée : il ne la voit qu'à la disparition des options « jouer »). Le moteur n'est pas en
   cause (parties enregistrées relues coup par coup). Inclure le Sabo a suffi pour passer de −0,3 à +15 points en ~670
   mises à jour. **Décision de l'utilisateur : Mihawk inclus dès la reprise** (8 decks, évaluations de passage sur 64
   confrontations, vocabulaire toujours de 90 cartes). Nouvelles questions (`restCost`, `returnOwn`) rangées dans la
   famille `discard` ; encodage inchangé `a0664ced`.
8. **Niveau 4 sans Monte-Carlo à l'entraînement** (12 octobre 2026, validé par l'utilisateur). Le niveau 4 remettait
   `mc2` parmi les adversaires d'entraînement (5 % des parties) : 2 à 8 parties par mise à jour suffisaient à faire
   tomber la collecte de ~5 500 à ~800–1 900 décisions/s (12 → 5,6 parties/s ; part du temps dans Node 35 % → 75 %),
   comme au niveau 3 (décision 5). Le niveau 4 n'est pas jugé par le Monte-Carlo : ses 5 % passent au self-play
   (self 0,75, heuristique 0,2, hasard 0,05). Même reprise : `--max-updates` 7500 → 9000.
9. **Troisième deck du méta (Nico Robin) : mesuré, puis inclus** (12 octobre 2026, à la demande de l'utilisateur).
   Modèle u7713 (Mihawk inclus depuis u7383) contre l'heuristique : 864 parties par deck joué par le modèle, comparées
   à l'heuristique jouant le même deck (1 800 parties par deck).

   | Deck joué | Modèle | Heuristique | Écart |
   |---|---|---|---|
   | META-ROBIN-2026-10 (nouveau) | 39,6 % | 68,6 % | −29 |
   | META-MIHAWK-2026-10 (inclus depuis u7383) | 39,7 % | 66,8 % | −27 (−57 à u7383) |
   | META-SABO-2026-10 (inclus depuis u6715) | 86,2 % | 72,2 % | +14 |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 61,5 / 62,7 / 57,4 / 29,7 / 68,8 / 71,6 % | 40,2 / 48,2 / 49,4 / 20,2 / 43,9 / 38,8 % | +8 à +33 (moyenne +18) |

   Face à Robin, le modèle garde une avance plus faible qu'avec les autres decks (~+9 points avec les 7 decks qu'il
   joue bien). En le jouant, parties relues : il garde souvent en main une carte de Vie dont le [Déclenchement] la
   jouerait gratuitement, joue les Trois généraux sucrés sans les 2 DON!! de leur effet, et n'a pas le plan « Linlin
   fait passer les Personnages à 4000 à 8000 ». Le moteur n'est pas en cause. Mihawk progresse (13,7 % → 39,7 % en 330
   mises à jour) sans avoir rattrapé l'heuristique. **Robin inclus dès la reprise** (9 decks, évaluations de passage sur
   81 confrontations, vocabulaire toujours de 90 cartes). Nouvelles questions (`lookToLife`) rangées dans la famille
   `life`, « annulez les effets » non encodé ; encodage inchangé `a0664ced`.
10. **Niveau 5 sans Monte-Carlo à l'entraînement** (12 octobre 2026, même règle que la décision 8, appliquée dans la
   commande de reprise, gardée par l'utilisateur). Le niveau 5 remet lui aussi `mc2` (5 %) parmi les
   adversaires d'entraînement : 7,5 puis 3,3 parties/s (u7600–7713). Il n'est pas jugé par le Monte-Carlo : ses 5 %
   passent au self-play (self 0,4, ligue 0,4, heuristique 0,15, hasard 0,05).
11. **Quatrième deck du méta (Rocks D. Xebec) : mesuré, puis inclus** (12 octobre 2026, à la demande de
   l'utilisateur). Même modèle u7713 que pour Robin : la reprise lancée après la mise en ligne du modèle n'a pas
   démarré (aucune ligne dans `train.log`, aucun point de sauvegarde après 20 h 46). 960 parties par deck joué par le
   modèle contre l'heuristique, comparées à l'heuristique jouant le même deck (2 000 parties par deck).

   | Deck joué | Modèle | Heuristique | Écart |
   |---|---|---|---|
   | META-XEBEC-2026-10 (nouveau) | 31,2 % | 52,1 % | −21 |
   | META-ROBIN-2026-10 (inclus, pas encore entraîné) | 37,0 % | 68,7 % | −32 |
   | META-MIHAWK-2026-10 (inclus depuis u7383) | 43,6 % | 68,7 % | −25 |
   | META-SABO-2026-10 | 86,0 % | 72,2 % | +14 |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 58,4 / 61,8 / 56,8 / 30,6 / 68,1 / 66,1 % | 39,5 / 50,1 / 46,8 / 18,7 / 43,6 / 37,9 % | +10 à +28 (moyenne +18) |

   Face à Xebec, le modèle garde son avance avec les 7 decks qu'il joue bien (~+15 points). Xebec est aussi le moins
   bon des decks du méta pour l'heuristique (52 %) : son plan (Captain John qui attire les attaques, défausses pour
   payer les effets, Personnages sans Contre) lui est difficile. **Xebec inclus dès la reprise** (10 decks,
   évaluations sur 100 confrontations, vocabulaire toujours de 90 cartes). Nouvelles questions rangées dans les familles
   existantes (`revealCost` → `discard`, `koGuard` → `replace`, `oppChoice` → `chooseOne`) ; « l'adversaire ne peut
   attaquer que Captain John » et la valeur de Contre variable de Xebec ne sont pas encodées (le modèle les voit par les
   options proposées) ; encodage inchangé `a0664ced`.
12. **Cinquième deck du méta (Ener / Enel) : mesuré, puis inclus** (13 octobre 2026, à la demande de l'utilisateur).
   Modèle u7754 : la reprise de 22 h 27 n'a fait que 41 mises à jour avec 10 decks (~4 parties/s au niveau 5, adversaires
   de la ligue). 1 056 parties par deck joué par le modèle contre l'heuristique, comparées à l'heuristique jouant le
   même deck (2 200 parties par deck).

   | Deck joué | Modèle | Heuristique | Écart |
   |---|---|---|---|
   | META-ENEL-2026-10 (nouveau) | 8,2 % | 35,7 % | −27,5 |
   | META-XEBEC-2026-10 (inclus depuis u7713) | 38,3 % | 54,5 % | −16 (−21 à u7713) |
   | META-ROBIN-2026-10 (inclus depuis u7713) | 47,4 % | 69,0 % | −22 (−32 à u7713) |
   | META-MIHAWK-2026-10 (inclus depuis u7383) | 42,5 % | 69,2 % | −27 |
   | META-SABO-2026-10 | 87,3 % | 73,3 % | +14 |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 59,0 / 59,4 / 57,3 / 29,9 / 68,7 / 68,9 % | 41,2 / 52,0 / 49,5 / 20,2 / 45,3 / 39,2 % | +7 à +30 (moyenne +16) |

   Face à Ener, l'avance du modèle est faible (+6 points avec les 7 decks qu'il joue bien). En jouant Ener, parties
   relues : il active des Événements à coût 0 (Djambuwal, Trépas divin) puis refuse d'en payer le coût DON!! −1 ou
   l'épuisement de 5 DON!!, et la carte part pour rien ; aucun deck connu n'avait d'Événements dont le seul coût est un
   « vous pouvez ». Ener est aussi le deck du méta que l'heuristique joue le moins bien (35,7 %). Robin et Xebec
   progressent déjà après 41 mises à jour. **Ener inclus dès la reprise** (11 decks, évaluations sur 121
   confrontations, vocabulaire toujours de 90 cartes). Nouvelle question `scry` → famille `trashToDeck` ; « 6 DON!! ou
   moins » se lit dans les DON!! du terrain (déjà encodées) ; encodage inchangé `a0664ced`.
13. **Sixième deck du méta (Kaido) : mesuré, puis inclus** (13 octobre 2026, à la demande de l'utilisateur).
   Modèle u7815 : 61 mises à jour avec 11 decks depuis u7754 (~4,5 parties/s). 1 152 parties par deck joué par le
   modèle contre l'heuristique, comparées à l'heuristique jouant le même deck (2 400 parties par deck, 12 decks).

   | Deck joué | Modèle | Heuristique | Écart |
   |---|---|---|---|
   | META-KAIDO-2026-10 (nouveau) | 11,0 % | 45,4 % | −34 |
   | META-ENEL-2026-10 (inclus depuis u7754) | 10,1 % | 36,3 % | −26 (−27,5 à u7754) |
   | META-XEBEC-2026-10 (inclus depuis u7713) | 45,5 % | 54,5 % | −9 (−16 à u7754) |
   | META-ROBIN-2026-10 (inclus depuis u7713) | 55,0 % | 67,4 % | −12 (−22 à u7754) |
   | META-MIHAWK-2026-10 (inclus depuis u7383) | 40,1 % | 66,7 % | −27 |
   | META-SABO-2026-10 | 85,2 % | 74,1 % | +11 |
   | ST-31 / 32 / 33 / 34 / 35 / 36 | 55,7 / 63,6 / 56,9 / 29,1 / 64,9 / 69,6 % | 41,6 / 54,0 / 49,5 / 21,1 / 47,4 / 40,3 % | +7 à +29 (moyenne +14) |

   Face à Kaido, l'avance du modèle est plus faible qu'ailleurs (+10 points avec les 7 decks qu'il joue bien, contre
   +14 face aux autres decks). En jouant Kaido, parties relues : il refuse presque toujours l'effet du Leader (DON!! −1
   pour −2000), même en défense, pose peu de Personnages dans les premiers tours (souvent rien au tour 1) et perd vite
   sa Vie. Comme Ener, Kaido paie ses effets en renvoyant des DON!!, ce que les decks connus faisaient peu. Ener
   progresse à peine en 61 mises à jour (8,2 → 10,1 %) ; Robin et Xebec continuent de progresser. **Kaido inclus dès
   la reprise** (12 decks, évaluations sur 144 confrontations, vocabulaire toujours de 90 cartes). La question du
   remplacement de King (renvoyer 1 DON!! au lieu d'être mis KO) va dans la famille existante `replace` ; encodage
   inchangé `a0664ced`.
14. **Refusé ou reporté par l'utilisateur** : composition du deck adverse dans l'observation, masquage des coups
   inutiles (règle écrite à la main), démarrage par imitation de l'heuristique, opposants adaptatifs, modèles
   spécialisés par confrontation, correction du proxy Vite (le lancement par `start.bat` suffit). Modèles
   spécialisés par deck : repris le 14 octobre 2026 (décision 15).
15. **Entraînement général figé, une IA spécialisée par deck** (14 octobre 2026, demande de l'utilisateur). Les decks
   ont des mécaniques trop différentes (violet : DON!! −1 ; jaune : Vie et Déclenchements) pour qu'un seul réseau les
   joue tous bien : l'utilisateur juge l'entraînement général suffisant et veut une IA par deck, entraînée sur son PC
   une à une ou plusieurs à la fois. Decks et cartes figés à l'état de `main` du 14 octobre 2026 (15 decks du registre :
   6 du méta, ST-31 à ST-36, ST-21, ST-22, ST-30 ; familles 4E). Réalisation (`rl/README.md` § 16) : `python train.py
   --config gpu --deck <deck>` part de u8959 (poids et optimiseur), vocabulaire prolongé de 90 à 225 cartes (toutes
   celles du registre, même jeu au départ), adversaires : modèle général figé 50 %, heuristique 35 %, miroir 15 % ;
   évaluation de départ puis toutes les 50 mises à jour (ce deck contre les 15 decks, 240 parties contre
   l'heuristique, 240 contre le modèle général). `train_decks.py` enchaîne plusieurs decks (`--parallel 2` : deux à la
   fois). Dans le simulateur, l'IA entraînée prend le modèle du deck qu'elle joue (`web/public/rl-model/decks/`), sinon
   le modèle général. Vitesse sur le PC : ~13 parties/s seul, ~145 mises à jour par heure (300 en ~2 h) ; deux à la
   fois, ~1,1 fois ce débit au total. Références mesurées par les essais (modèle général u8959 jouant le deck, avant
   spécialisation) :

   | Deck joué | Contre l'heuristique | Contre le modèle général |
   |---|---|---|
   | META-ROBIN-2026-10 | 72,1 % | 55,8 % |
   | META-ENEL-2026-10 | 41,2 % | 48,3 % |
   | META-KAIDO-2026-10 | 39,2 % | 24,6 % |

   Première file finie le 15 octobre 2026 à 1 h 38 (15 decks × 300 mises à jour, deux à la fois, ~1 h 56 par paire,
   aucune erreur). Évaluation de départ (modèle général u8959 jouant le deck) → évaluation à u300, 240 parties chacune :

   | Deck | Contre l'heuristique | Contre le modèle général |
   |---|---|---|
   | META-KAIDO-2026-10 | 39,2 → 70,0 % | 24,6 → 62,1 % |
   | META-MIHAWK-2026-10 | 56,7 → 77,9 % | 38,3 → 63,3 % |
   | META-ENEL-2026-10 | 41,2 → 65,8 % | 48,3 → 66,7 % |
   | META-ROBIN-2026-10 | 77,9 → 85,4 % | 55,8 → 78,8 % |
   | META-XEBEC-2026-10 | 69,6 → 82,9 % | 60,8 → 78,3 % |
   | META-SABO-2026-10 | 89,2 → 94,6 % | 80,4 → 88,3 % |
   | ST-21 (jamais vu par le modèle général) | 28,7 → 57,1 % | 24,2 → 43,8 % |
   | ST-22 (jamais vu) | 40,0 → 57,9 % | 28,3 → 42,1 % |
   | ST-30 (jamais vu) | 63,7 → 75,8 % | 45,0 → 71,2 % |
   | ST-31 | 65,8 → 77,5 % | 50,0 → 67,9 % |
   | ST-32 | 65,8 → 74,6 % (palier dès ~u150) | 60,0 → 71,7 % |
   | ST-33 | 65,8 → 67,5 % (meilleur à u150 : 75,4 %) | 54,2 → 68,3 % |
   | ST-34 | 37,9 → 46,2 % | 27,1 → 40,0 % |
   | ST-35 | 70,4 → 80,4 % | 66,2 → 74,2 % |
   | ST-36 | 66,2 → 83,3 % | 66,7 → 72,5 % |

   Tous progressent contre le modèle général ; les plus grands gains sur les decks qu'il jouait le moins bien (Kaido,
   Mihawk, Ener, ST-21, ST-22). Plus faible : ST-34 (Katakuri, gestion des DON!!), déjà le point faible de l'IA. Lecture
   de l'utilisateur : les decks de contrôle (Zoro épuise les cartes adverses pour un gros finisher, Kuzan contrôle le
   terrain), à Déclenchements (jaune) ou à gestion des DON!! (violet) doivent « oublier » le jeu rouge du modèle
   général et réapprendre leurs mécaniques : une baisse passagère n'est pas un problème, il faut leur laisser du temps.
16. **Ligue des spécialistes** (14 octobre 2026, proposée après les premiers résultats, l'utilisateur ayant demandé des
   idées pour améliorer l'entraînement) :
   chaque IA de deck s'entraînait surtout contre le modèle général, qui joue tous les decks « à la rouge » ; Kuzan
   n'apprenait pas à affronter un Zoro qui épuise vraiment ses cartes. Les autres IA spécialisées deviennent des
   adversaires (`experts`, 35 % ; base 25 %, heuristique 30 %, miroir 10 %), quatre par mise à jour, relues à chaque
   évaluation ; nouvelle évaluation `experts`. Prévu pour la prolongation : à installer dans `TCGC/` (avec l'accord de
   l'utilisateur) une fois la première file (15 decks, 300 mises à jour) finie ; vitesse à mesurer au premier lancement.
   `TCGC/` avancé à `main` (1ed63a7, ligue et paliers) le 15 octobre 2026 au matin, file finie : les 15 IA (u300) se
   chargent comme adversaires. Prolongation proposée : `train_decks.py --config gpu --decks all --parallel 2
   --max-updates 900 --step 100` (paliers de 100, ~5 h le palier ; l'utilisateur voulait que tous les decks évoluent
   ensemble : `--parallel 15` ne tient pas dans le GPU, d'où les paliers).

## 4. Commandes

Dans `rl/`, environnement activé (`.venv\Scripts\Activate.ps1`).

**Reprendre l'entraînement général** (arrêté et figé à u8959 depuis le 14 octobre 2026) : lancer la commande affichée à l'arrêt (« Pour reprendre : ... »). Attention : les
réglages `--set` ne sont pas gardés d'une reprise à l'autre ; la commande actuelle est
```powershell
python train.py --config gpu --run rtx2070-main --max-updates 9000 --set ppo.lr=0.0001 --set 'curriculum.levels.2.opponents=[{kind: self, weight: 0.5}, {kind: heuristic, weight: 0.45}, {kind: random, weight: 0.05}]' --set curriculum.levels.2.eval_every=100 --set 'curriculum.levels.3.opponents=[{kind: self, weight: 0.75}, {kind: heuristic, weight: 0.2}, {kind: random, weight: 0.05}]' --set 'curriculum.levels.4.opponents=[{kind: self, weight: 0.4}, {kind: pool, weight: 0.4}, {kind: heuristic, weight: 0.15}, {kind: random, weight: 0.05}]'
```
(`levels.2`, `levels.3`, `levels.4` sont les niveaux 3, 4 et 5 ; les deux premiers ne servent plus depuis u7650 :
gardés par sécurité)
Ne pas ajouter `--level` (remet le compteur du niveau à zéro) ni `--fresh` (recommence de zéro).

**Suivre** : `python report.py --run rtx2070-main --window 100 --evals 6` (texte à partager) ;
`tensorboard --logdir logs\rtx2070-main` (http://localhost:6006).

**Mesurer** : `python evaluate.py --checkpoint rtx2070-main --opponents heuristic mc:16 mc:48 --mc-pairs 12 --workers 2`
(~1 h pendant l'entraînement ; `mc:4`/`mc:8` correspondent aux niveaux du simulateur).

**Essayer dans le simulateur (local)** : `python export_onnx.py --checkpoint rtx2070-main --install`, puis à la racine
`npm run build` et `start.bat` (sans `npm run build`, la page reste l'ancienne : « Le jeu vient d'être mis à jour »).

**IA spécialisée par deck** (décision 15, `rl/README.md` § 16) :
```powershell
python train.py --config gpu --deck META-ROBIN-2026-10                   # un deck, 300 mises à jour (~2 h)
python train.py --config gpu --deck META-ROBIN-2026-10 --max-updates 600 # prolonger
python train_decks.py --config gpu --decks meta --parallel 2             # les 6 decks du méta, deux à la fois
python report.py --run deck-META-ROBIN-2026-10                           # suivre
python export_onnx.py --checkpoint deck-META-ROBIN-2026-10 --install     # installer (web/public/rl-model/decks/)
```
Mise en ligne d'une IA spécialisée : comme le modèle général ci-dessous, en ajoutant
`web/public/rl-model/decks.json web/public/rl-model/decks/<deck>` (et rien d'autre).

**Mettre en ligne** : export avec `--install` ; `git add web/public/rl-model/model.onnx web/public/rl-model/model.json`
(et rien d'autre) ; commit ; `git push` ; `npm test` (doit passer) ; `git push origin HEAD:main` ; sur le serveur
`sudo bash /opt/tcgc/app/deploy/update.sh`. Chaque modèle commité ajoute ~7 Mo à l'historique : seulement aux étapes
marquantes. Facultatif : gzip pour `application/wasm` dans nginx (14 Mo → 3,7 Mo).

## 5. Prochaine étape

- **IA spécialisées** (décision 15) : l'utilisateur les entraîne sur le PC, depuis `TCGC\rl` (commandes du § 4).
  Suivre leurs évaluations (`report.py --run deck-<deck>`) : prolonger tant qu'elles progressent contre
  l'heuristique et contre le modèle général ; mettre en ligne celles qui jouent nettement mieux leur deck que le
  modèle général (référence : l'évaluation de départ).
- L'entraînement général `rtx2070-main` ne reprend pas ; sa commande de reprise reste au § 4 au cas où. S'il reprenait,
  les IA spécialisées déjà commencées gardent leur point de départ (`base.pt`), les nouvelles partiraient du nouveau.

## 6. Points ouverts et pièges connus

- **Taux d'apprentissage et réglages `--set` non conservés à la reprise** : toujours relancer avec la commande
  complète. Amélioration proposée, pas faite : conserver `ppo.lr` dans le point de sauvegarde.
- **Évaluation de passage du niveau 3** (`train.py`) : 12 confrontations tirées au hasard parmi 36 ; `evaluate.py`
  les répartit déjà sur tous les decks (`b56c2bd`), `train.py` pas encore (proposé).
- **`model.id_dropout`** ne peut pas être changé à la reprise ; carte source d'un effet non marquée quand elle est
  déjà en Défausse (~2 % des décisions) : petites corrections identifiées, non faites.
- **Tests** : dans l'environnement cloud, seul le catalogue synthétique est disponible ; 77 tests de cartes y
  échouent pour cette raison. Sur le PC (vrai catalogue), `npm test` passe en entier (vérifié avant la mise en ligne).
- Point faible de l'IA : le deck ST-34 (29 % contre l'heuristique, 0 % contre le Monte-Carlo à u5530).
