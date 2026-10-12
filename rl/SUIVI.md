# IA entraînée : état du chantier et reprise

Document de passation : où en est l'IA par apprentissage par renforcement, ce qui a été décidé et pourquoi, comment
continuer. Le détail technique est dans `game/docs/ia-rl.md` (analyse, architecture, § 11 réalisation) et
`rl/README.md` (mode d'emploi).

## 1. En bref

- **Objectif** : une IA du simulateur One Piece TCG qui apprend seule (PPO, récompense +1 victoire / −1 défaite,
  rien d'autre), avec la seule information d'un joueur, entraînable sur le PC (`python train.py`), jouable dans le
  simulateur (niveau « IA entraînée », ONNX dans le navigateur).
- **Code** : branche `claude/awesome-hopper-nj0x4y` (commits depuis `553104f`). `main` a été avancé jusqu'à
  `4727d53` (mise en ligne). Seul `b56c2bd` (`evaluate.py`, sans effet sur le serveur) n'est pas encore sur `main`.
- **En ligne** : modèle exporté au début du niveau 3 (~62 % contre l'heuristique « Débutant »).
- **Entraînement en cours** sur le PC (RTX 2070, 8 cœurs) : entraînement `rtx2070-main`, niveau 3, ~7 400 mises à jour,
  ~1,8 million de parties, 8 decks depuis u7383, vrai catalogue (2 785 cartes), encodage `a0664ced` (version 4).

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
| 8 decks, Mihawk jamais vu (u7383, 12 octobre 2026) | 58,9 % (6 144 parties ; 13,7 % en jouant Mihawk) | — | — |

Le niveau 3 se valide à **55 % contre `mc:16` et 60 % contre l'heuristique dans la même évaluation**. Dans le
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
8. **Refusé ou reporté par l'utilisateur** : composition du deck adverse dans l'observation, masquage des coups
   inutiles (règle écrite à la main), démarrage par imitation de l'heuristique, opposants adaptatifs, modèles
   spécialisés par deck ou par confrontation, correction du proxy Vite (le lancement par `start.bat` suffit).

## 4. Commandes

Dans `rl/`, environnement activé (`.venv\Scripts\Activate.ps1`).

**Reprendre l'entraînement** : lancer la commande affichée à l'arrêt (« Pour reprendre : ... »). Attention : les
réglages `--set` ne sont pas gardés d'une reprise à l'autre ; la commande actuelle est
```powershell
python train.py --config gpu --run rtx2070-main --max-updates 7500 --set ppo.lr=0.0001 --set 'curriculum.levels.2.opponents=[{kind: self, weight: 0.5}, {kind: heuristic, weight: 0.45}, {kind: random, weight: 0.05}]' --set curriculum.levels.2.eval_every=100
```
Ne pas ajouter `--level` (remet le compteur du niveau à zéro) ni `--fresh` (recommence de zéro).

**Suivre** : `python report.py --run rtx2070-main --window 100 --evals 6` (texte à partager) ;
`tensorboard --logdir logs\rtx2070-main` (http://localhost:6006).

**Mesurer** : `python evaluate.py --checkpoint rtx2070-main --opponents heuristic mc:16 mc:48 --mc-pairs 12 --workers 2`
(~1 h pendant l'entraînement ; `mc:4`/`mc:8` correspondent aux niveaux du simulateur).

**Essayer dans le simulateur (local)** : `python export_onnx.py --checkpoint rtx2070-main --install`, puis à la racine
`npm run build` et `start.bat` (sans `npm run build`, la page reste l'ancienne : « Le jeu vient d'être mis à jour »).

**Mettre en ligne** : export avec `--install` ; `git add web/public/rl-model/model.onnx web/public/rl-model/model.json`
(et rien d'autre) ; commit ; `git push` ; `npm test` (doit passer) ; `git push origin HEAD:main` ; sur le serveur
`sudo bash /opt/tcgc/app/deploy/update.sh`. Chaque modèle commité ajoute ~7 Mo à l'historique : seulement aux étapes
marquantes. Facultatif : gzip pour `application/wasm` dans nginx (14 Mo → 3,7 Mo).

## 5. Prochaine étape

- **Reprise avec 8 decks** (12 octobre 2026, depuis u7383, `main` à jour dans le dossier de l'entraînement : Mihawk
  ajouté) : même commande. Les évaluations de passage portent sur 64 confrontations (49 de u6715 à u7383). À
  remesurer vers u8000 comme au § 3.7 : Mihawk joué par le modèle (13,7 % au départ).
- Point de contrôle vers **u6600–6700** (2–3 évaluations du niveau 3 avec self-play) : fait (§ 2) ; progression contre
  `mc:16` (~33 % → ~48 %), passage au niveau 4 pas encore atteint.
  Attendu : ~15–20 parties/s, `kl` 0,01–0,02 ; la mesure qui compte est **contre `mc:16`** (moyenne ~33 % au départ,
  évaluations de 24 parties, ±20 points chacune : lire la moyenne).
- Si l'IA progresse contre `mc:16` : continuer jusqu'au passage au niveau 4 (self-play + heuristique, juge : sa version
  de départ et l'heuristique), puis 5 (ligue d'anciennes versions, Elo).
- Si elle ne progresse pas : en reparler (pistes : plus de parties par mise à jour, Monte-Carlo léger réintroduit,
  autres pistes du § 3.8).

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
