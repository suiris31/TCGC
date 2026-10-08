# IA One Piece TCG entraînée par apprentissage par renforcement

Ce dossier entraîne une IA qui apprend à jouer au simulateur **par l'expérience de ses parties** : elle ne reçoit
aucune règle stratégique écrite à la main, seulement +1 quand elle gagne et −1 quand elle perd.

- Le **moteur de règles** est celui du simulateur (`game/engine/`, TypeScript) : des processus Node.js font tourner les
  parties (`game/rl/server.ts`), rien n'est réécrit en Python.
- L'IA ne voit **que ce que voit un joueur** : son observation est construite à partir de `viewFor()` (sa vue de la
  partie, sans aucune carte cachée de l'adversaire ni l'ordre des decks), et un test le vérifie.
- L'entraînement (PyTorch) tourne sur ton ordinateur, sur GPU s'il y en a un, sinon sur le processeur.
- Le modèle entraîné s'exporte en ONNX et devient un niveau « IA entraînée » dans le simulateur.

Sommaire : [Prérequis](#1-prérequis) · [Installation](#2-installation) · [Matériel](#3-matériel-gpu-ou-processeur) ·
[Entraîner](#4-lancer-un-entraînement) · [Suivre](#5-suivre-lentraînement) · [Reprendre](#6-interrompre-et-reprendre) ·
[Niveaux](#7-les-5-niveaux-et-leurs-critères) · [Évaluer](#8-évaluer) · [Analyser une partie](#9-analyser-une-partie) ·
[Réglages](#10-modifier-les-paramètres) · [Exporter](#11-exporter-le-modèle-onnx) ·
[Simulateur](#12-utiliser-le-modèle-dans-le-simulateur) · [Tests](#13-tests) · [Fonctionnement](#14-comment-ça-marche) ·
[Dépannage](#15-dépannage)

---

## 1. Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| [Node.js](https://nodejs.org) | **22.18 ou plus récent** | fait tourner le moteur du jeu (TypeScript exécuté directement) |
| [Python](https://www.python.org/downloads/) | 3.10 ou plus récent (3.12 conseillé) | entraînement |
| Accès Internet (une fois) | | télécharger les dépendances et le catalogue des cartes (listes officielles Bandai) |
| GPU NVIDIA (facultatif) | pilote récent | entraînement plus rapide ; sinon le processeur suffit |

Le dossier `rl/` fait partie du dépôt TCGC : récupère tout le dépôt (`git clone`, ou `git pull` si tu l'as déjà), car
l'entraînement utilise le moteur du jeu qui est dans `game/`.

## 2. Installation

### Installation automatique

Windows (PowerShell, depuis le dossier `rl\`) :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1
.venv\Scripts\Activate.ps1
```

Linux / macOS (depuis le dossier `rl/`) :

```bash
bash scripts/setup_unix.sh
source .venv/bin/activate
```

Le script crée l'environnement Python `rl/.venv`, installe PyTorch (avec CUDA si une carte NVIDIA est détectée),
les autres dépendances (`requirements.txt`), les dépendances Node du simulateur (`npm install`) et télécharge le
catalogue des cartes (`npm run game:cards` → `data/game-catalog.json`).

### Installation manuelle (équivalente)

```bash
# 1. à la racine du dépôt : dépendances du simulateur et catalogue des cartes
npm install
npm run game:cards

# 2. dans rl/ : environnement Python
cd rl
python -m venv .venv
# Windows : .venv\Scripts\Activate.ps1      Linux/macOS : source .venv/bin/activate

# 3. PyTorch
#    - GPU NVIDIA sous Windows : la version de PyPI n'a PAS le GPU, prends celle de pytorch.org :
pip install torch --index-url https://download.pytorch.org/whl/cu126
#    - sinon (processeur, Linux avec CUDA, Mac) :
pip install torch

# 4. le reste
pip install -r requirements.txt
```

### Vérifier l'installation

```bash
python -m pytest -q tests          # tests Python (moteur, réseau, GAE, Elo...)
python benchmark.py                # ce que ton ordinateur peut faire (voir § 3)
python train.py --config smoke     # toute la chaîne en quelques minutes (essai, pas un vrai entraînement)
```

## 3. Matériel (GPU ou processeur)

Le matériel est **détecté automatiquement** (`device: auto`) : GPU NVIDIA (CUDA), sinon GPU Apple (MPS), sinon
processeur. Le début de chaque entraînement l'affiche, par exemple :

```
Matériel : GPU CUDA 0 : NVIDIA GeForce RTX 3060, 12.0 Gio (11.2 Gio libres), PyTorch 2.x, CUDA 12.6
Matériel : processeur : x86_64, 8 cœurs logiques, PyTorch 2.x (4 fils de calcul) — aucun GPU compatible détecté
```

Sur GPU, la mémoire utilisée est affichée à chaque mise à jour (`GPU 0.31 Gio`) et enregistrée dans les mesures.

Les parties sont simulées par les processus Node sur le **processeur**, même avec un GPU : le nombre de cœurs fixe
le nombre de parties par seconde, le GPU accélère l'apprentissage.

**Mesure ton ordinateur avant un long entraînement** :

```bash
python benchmark.py                 # réglages par défaut
python benchmark.py --config cpu    # réglages pour processeur seul
```

Il affiche les parties et décisions par seconde, la vitesse d'apprentissage, et estime le temps par mise à jour et
le nombre de parties d'entraînement par heure.

Réglages qui dépendent du matériel (dans un fichier de `config/` ou avec `--set`) :

| Réglage | Défaut | Effet |
|---|---|---|
| `device` | `auto` | `cpu`, `cuda`, `cuda:1`, `mps` pour forcer |
| `env.workers` | `auto` (cœurs − 1 ; moitié des cœurs sans GPU) | processus Node qui simulent les parties |
| `env.envs_per_worker` | 16 | parties simultanées par processus (plus = lots plus gros pour le réseau) |
| `ppo.steps_per_update` | 8192 | décisions collectées par mise à jour |
| `ppo.minibatch_size` | 1024 | taille des lots d'apprentissage (réduis-la si la mémoire du GPU manque) |
| `model.d_model`, `model.layers` | 128, 3 | taille du modèle (64/2 : petit ; 192/4 : grand) |
| `train.checkpoint_every` | 10 | fréquence des points de sauvegarde |
| `torch_threads` | `auto` | fils de calcul de PyTorch sur processeur |

Fichiers prêts à l'emploi : `config/cpu.yaml` (sans GPU), `config/gpu.yaml` (avec GPU), `config/smoke.yaml` (essai).

## 4. Lancer un entraînement

```bash
python train.py                    # entraînement « opcg », réglages par défaut (config/default.yaml)
python train.py --config cpu       # ordinateur sans GPU
python train.py --config gpu       # ordinateur avec GPU
```

Chaque mise à jour affiche une ligne :

```
[  120 | 2-heuristique] parties 8840 (+76) | victoires heuristic 54 %, random 97 % | tours 14.1 | tronquées 0.0 % |
entropie 1.12 | valeur +0.21 (var. expl. 0.61) | π -0.004 v 0.031 kl 0.0091 | 1900 décisions/s, 4.6 parties/s
(Node 40 %, réseau 58 %, apprentissage 6.2 s)
```

- **victoires** : taux de victoire des parties d'entraînement, par adversaire ;
- **tours** : durée moyenne des parties ; **tronquées** : parties arrêtées par le plafond de sécurité (doit rester à 0) ;
- **entropie** : hésitation de la politique (baisse quand l'IA devient sûre d'elle ; une chute à 0 très tôt est
  suspecte) ; **valeur** : chances estimées (−1 à +1) ; **var. expl.** : qualité de cette estimation (vers 1 = bonne) ;
- **π / v / kl** : pertes de la politique et de la valeur, écart entre deux politiques successives ;
- **décisions/s, parties/s** : débit ; part du temps passée dans Node (simulation) et dans le réseau.

Plusieurs entraînements peuvent coexister : `python train.py --run essai2`. Tout est rangé dans
`checkpoints/<run>/` et `logs/<run>/`.

## 5. Suivre l'entraînement

- Console et `logs/<run>/train.log` : une ligne par mise à jour, les évaluations, les changements de niveau.
- `logs/<run>/metrics.jsonl` : toutes les mesures (une ligne JSON par mise à jour ou évaluation).
- **TensorBoard** (courbes) : dans un autre terminal, `tensorboard --logdir logs` puis ouvre http://localhost:6006.
  Courbes `train/winrate/<adversaire>`, `train/mean_turns`, `train/truncated_rate`, `train/entropy`, `train/value_mean`,
  `train/value_loss`, `train/policy_loss`, `train/approx_kl`, `train/decisions_per_s`, `eval/<adversaire>/winrate`,
  `eval/elo`...
- `logs/<run>/eval/` : rapport de chaque évaluation (markdown).
- `logs/<run>/trajectories/` : 1 partie d'entraînement sur 1000, rejouable (§ 9) ; `logs/<run>/anomalies/` : toute
  partie tronquée ou arrêtée par une erreur du moteur.

## 6. Interrompre et reprendre

**Ctrl+C** : la mise à jour en cours se termine, un point de sauvegarde est écrit, puis le programme s'arrête
(Ctrl+C une seconde fois : arrêt immédiat, avec quand même une tentative de sauvegarde).

**Reprendre** : relance exactement la même commande. `train.py` reprend automatiquement le dernier point de
sauvegarde de l'entraînement (`checkpoints/<run>/latest.pt`) :

```bash
python train.py                                             # reprend « opcg »
python train.py --run essai2                                # reprend « essai2 »
python train.py --resume checkpoints/opcg/ckpt_0000500.pt   # reprend un point de sauvegarde précis
python train.py --fresh                                     # recommence de zéro (l'ancien dossier est mis de côté)
```

Un point de sauvegarde contient : les poids du modèle, l'état de l'optimiseur, le nombre de mises à jour, de parties
et de décisions, le niveau en cours et l'historique de ses évaluations, la ligue (anciennes versions), le compteur des
graines, l'état des générateurs aléatoires, la configuration complète et l'empreinte de l'encodage. Il est écrit tous
les `train.checkpoint_every` mises à jour, à chaque changement de niveau et à l'arrêt ; les 5 derniers sont gardés
(`train.keep_checkpoints`), plus un jalon par niveau validé (`niveau-<nom>-valide.pt`).

## 7. Les 5 niveaux et leurs critères

L'entraînement suit un programme progressif (`curriculum` dans `config/default.yaml`). Chaque niveau a ses
adversaires et une **évaluation de passage** sur des parties d'évaluation (graines séparées, jamais apprises,
chaque graine jouée aux deux sièges, sur toutes les confrontations de decks) :

| Niveau | Adversaires d'entraînement | Passage au suivant |
|---|---|---|
| 1. Aléatoire | IA aléatoire | ≥ 95 % contre l'aléatoire, 2 évaluations de suite |
| 2. Heuristique | IA actuelle du simulateur (85 %), aléatoire (15 %) | ≥ 60 % contre l'heuristique et ≥ 95 % contre l'aléatoire, 2 fois de suite |
| 3. Monte-Carlo | Monte-Carlo (2 tirages), heuristique, aléatoire | ≥ 55 % contre le Monte-Carlo 16 tirages (niveau « Confirmé ») et ≥ 60 % contre l'heuristique |
| 4. Self-play | lui-même (70 %), heuristique, Monte-Carlo, aléatoire | ≥ 58 % contre sa version du début du niveau, sans redescendre sous 60 % contre l'heuristique, 2 fois de suite |
| 5. Ligue | lui-même, **anciennes versions** (choisies parmi celles qu'il bat le moins), IA intégrées | dernier niveau : évaluations de suivi et Elo |

**Niveau non validé** : si le critère n'est pas atteint après `max_updates` mises à jour du niveau,
l'entraînement **s'arrête sans passer au niveau suivant** (code de sortie 3) et le dit. Regarde les évaluations
(`logs/<run>/eval/`) puis, au choix :

```bash
python train.py --set curriculum.levels.1.max_updates=6000   # prolonger le niveau 2 (les niveaux sont numérotés à partir de 0)
python train.py --level 3                                    # passer outre en connaissance de cause (forcer le niveau 3)
```

Pourquoi ne pas commencer directement en self-play : contre lui-même dès le départ, un agent qui joue au hasard
apprend lentement et peut s'enfermer dans des stratégies que personne d'autre ne jouerait. Les adversaires fixes
donnent d'abord un signal clair, la ligue empêche ensuite de ne savoir battre que sa propre version actuelle.

## 8. Évaluer

L'évaluation est **séparée de l'entraînement** : graines d'évaluation (intervalle disjoint de celles de
l'entraînement), aucune donnée apprise, chaque graine jouée deux fois (le modèle à chaque siège, donc une fois
premier joueur et une fois second).

```bash
python evaluate.py --checkpoint opcg                                   # dernier point de sauvegarde de « opcg »
python evaluate.py --checkpoint opcg --opponents random heuristic mc:16 mc:48
python evaluate.py --checkpoint checkpoints/opcg/ckpt_0000500.pt --decks ST-31,ST-35 --seeds 10
python evaluate.py --compare checkpoints/opcg/ckpt_0000200.pt checkpoints/opcg/latest.pt   # versions entre elles + Elo
python evaluate.py --checkpoint opcg --greedy                          # toujours l'option la plus probable
```

Adversaires : `random`, `heuristic` (IA « Débutant »), `mc:N` (Monte-Carlo à N tirages ; 16 ≈ « Confirmé », 48 ≈
« Expert », sans limite de temps pour être reproductible ; lent : `--mc-pairs` limite les confrontations jouées),
`model:<chemin.pt>`.

Le rapport (console + `logs/<run>/eval/*.md` et `.json`) donne pour chaque adversaire : taux de victoire avec
intervalle de confiance à 95 %, résultats premier / second joueur, durée moyenne des parties, parties tronquées ou en
erreur, résultats par deck du modèle, par deck adverse et par confrontation (tableau 6 × 6) ; avec `--compare`, un
classement Elo (heuristique = 1000).

**Savoir si l'IA progresse vraiment** : compare des évaluations faites avec les mêmes options à différents moments
(mêmes graines d'évaluation, donc mêmes parties) ; un écart plus petit que la largeur de l'intervalle de confiance
n'est pas significatif : augmente `--seeds`.

## 9. Analyser une partie

```bash
# faire jouer le modèle et voir chacune de ses décisions avec la probabilité de chaque option
python play.py --checkpoint opcg --opponent heuristic --deck ST-31 --opp-deck ST-35
python play.py --checkpoint opcg --opponent mc:16 --seed 1234 --greedy

# rejouer une partie enregistrée (entraînement, évaluation avec --record N, anomalie)
python play.py --replay logs/opcg/trajectories/<fichier>.json
python play.py --replay logs/opcg/anomalies/<fichier>.json --record partie.json
```

Une trajectoire contient la graine, les decks, le premier joueur, les contrôleurs des sièges, la version du moteur,
le modèle, chaque décision (et, pour celles du modèle, la probabilité de chaque option et la valeur estimée) et le
résultat. Le moteur étant déterministe, la partie se rejoue exactement : le récit affiche le journal complet et, à
chaque décision du modèle, ses options triées par probabilité :

```
> J1 décide (main) : Phase principale : que fais-tu ?  [valeur estimée 0.34]
    →  61.2 %  Jouer Nami (coût 1)
       20.4 %  Luffy (5000) attaque Sabo (Leader, 5000)
        9.9 %  Fin du tour
```

`--record partie.json` écrit la partie au format du simulateur : dans le simulateur, **Jouer → Mes parties →
importer**, pour la revoir coup par coup sur le plateau.

## 10. Modifier les paramètres

Tous les réglages sont dans `config/default.yaml` (commentés). Ne modifie pas ce fichier : crée le tien avec
seulement ce qui change, par exemple `config/mon-pc.yaml` :

```yaml
env:
  workers: 6
  envs_per_worker: 24
model:
  d_model: 160
ppo:
  lr: 0.0002
  entropy_coef: 0.005
```

puis `python train.py --config mon-pc`. Ou en ligne de commande : `python train.py --set ppo.lr=0.0002 --set
env.workers=6`. Les fichiers et `--set` s'appliquent dans l'ordre (le dernier gagne).

Réglages d'apprentissage principaux (`ppo`) : `lr` (vitesse d'apprentissage), `entropy_coef` (exploration),
`clip` (amplitude des mises à jour PPO), `gae_lambda` (répartition du mérite dans le temps), `epochs`,
`target_kl`. `gamma` est fixé à 1 : seule l'issue de la partie compte.

Changer la taille du modèle (`model.*`) n'est possible qu'au début d'un entraînement (`--fresh` ou `--run`).

## 11. Exporter le modèle (ONNX)

```bash
python export_onnx.py --checkpoint opcg               # rl/models/opcg/model.onnx + model.json
python export_onnx.py --checkpoint opcg --install     # et installation dans le simulateur
```

L'export vérifie l'équivalence avant d'installer :

1. PyTorch contre ONNX Runtime sur 300 observations de vraies parties : écart des probabilités et de la valeur
   (< 0,0001) et même option préférée ;
2. le **code du navigateur** (`game/ai/rl.ts` + onnxruntime-web, exécuté dans Node par `game/rl/check-onnx.ts`) joue
   quelques parties ; les mêmes parties sont rejouées avec PyTorch : mêmes options, mêmes probabilités.

`model.json` accompagne le modèle : nom, date, empreinte de l'encodage (un modèle n'est jamais utilisé avec un
encodage différent de celui de son entraînement), vocabulaire des cartes, configuration, point de sauvegarde
d'origine, résultats des vérifications.

## 12. Utiliser le modèle dans le simulateur

`python export_onnx.py --checkpoint opcg --install` copie `model.onnx` et `model.json` dans `web/public/rl-model/`.
Le simulateur propose alors un 4ᵉ niveau d'IA, **« IA entraînée »**, à côté de Débutant, Confirmé et Expert :

- en développement (`npm run dev`) : immédiatement ;
- en production : `npm run build` (le modèle est copié dans `dist/`), ou committer `web/public/rl-model/` pour qu'il
  soit déployé avec l'application (`deploy/update.sh`).

Le modèle tourne dans le navigateur, dans le fil de calcul de l'IA (onnxruntime-web, WebAssembly, chargé seulement
quand ce niveau est choisi : ~3,7 Mo compressés + le modèle). Il reçoit la même vue du joueur que pendant
l'entraînement et choisit selon ses probabilités. Si le modèle manque ou ne correspond plus au code (encodage
modifié), l'IA simple joue à sa place et la console du navigateur l'explique. Les niveaux existants ne changent pas.

## 13. Tests

```bash
# à la racine du dépôt : moteur, vue d'un joueur (aucune information cachée), environnement RL, serveur
npm test
# dans rl/ : client Python, réseau (masquage, pointeurs, invariances), GAE, Elo, parties complètes, et la chaîne
# complète en petit (entraînement, reprise, évaluation, export ONNX vérifié : ~2 minutes)
python -m pytest -q tests
```

Tests de l'environnement (`game/tests/rl-env.test.ts`) : déterminisme (même graine + mêmes choix = même partie),
parties complètes au hasard sur les 36 confrontations avec contrôles de cohérence, **étanchéité des observations**
(redistribuer au hasard toutes les cartes que le joueur ne peut pas connaître ne change rien à son observation),
pointeurs des options, plafond de sécurité, adversaires reproductibles, trajectoires rejouées à l'identique,
équivalence `act` / `actInPlace` / fonction de choix, serveur pour Python.

## 14. Comment ça marche

```
Moteur de jeu (game/engine)                    règles du simulateur, inchangées
      ↓ newGame / act / viewFor
Environnement RL (game/rl/env.ts)              reset, step, options légales, fin, gagnant, graine, plafond
      ↓
Observation / actions (game/rl/encode.ts)      vue du joueur → cartes, état global, options avec pointeurs
      ↓ serveur Node (game/rl/server.ts) ⇄ Python (opcg_rl/envpool.py), plusieurs processus en parallèle
Agent PPO (opcg_rl/model.py, ppo.py)           politique stochastique + valeur, avantages GAE, γ = 1
      ↓
Entraînement (train.py)                        niveaux 1 à 5, ligue, points de sauvegarde
      ↓
Évaluation (evaluate.py)                       graines séparées, deux sièges, intervalles de confiance, Elo
      ↓
Export ONNX (export_onnx.py) → navigateur (game/ai/rl.ts dans le Worker) → niveau « IA entraînée »
```

**Information cachée.** L'observation est construite uniquement à partir de `viewFor(état, joueur)`, la vue que le
serveur envoie déjà à un joueur en ligne : main adverse, decks et Vies face cachée y sont masqués. L'audit fait pour
ce chantier y a corrigé des fuites indirectes (un coût déclaré montrait des cartes cachées ; l'existence des
décisions de Contre de l'adversaire trahissait qu'il avait des Contres en main ; l'ordre de sa main ; l'exemplaire
« connu » d'une carte en double...) : voir `game/docs/ia-rl.md`. Le test d'étanchéité redistribue les cartes cachées et
vérifie que l'observation ne change pas.

**Cartes nouvelles.** Une carte est décrite par ses caractéristiques (catégorie, coût, puissance, Contre, couleurs,
attributs, mots-clés, moments de ses effets lus dans le texte officiel, mots du texte, types) et non par son seul
numéro ; un identifiant appris s'y ajoute, « oublié » une fois sur quatre pendant l'entraînement pour que le modèle
sache jouer une carte qu'il n'a jamais vue. Une carte dont l'effet n'est pas codé dans le moteur est signalée comme
telle au modèle (son effet ne s'applique pas).

**Actions.** Le moteur pose déjà chaque décision comme un choix parmi des options (une DON!! à la fois, un Contre à
la fois, les cibles une par une...) : le réseau donne un score à chaque option légale et choisit parmi elles
seulement. Aucune liste de toutes les combinaisons n'est construite.

**Récompense.** +1 victoire, −1 défaite, rien d'autre (ni dégâts, ni cartes, ni board). **Plafond de sécurité**
(`env.max_decisions`, 3000 décisions ; une partie normale en compte 120 à 300) : une partie qui l'atteint est
**tronquée**, sans récompense ; l'apprentissage complète avec sa propre estimation de la valeur de la dernière
position. Ainsi, faire durer la partie jusqu'au plafond ne rapporte ni ne coûte rien de plus que de continuer à
jouer : aucun comportement « jouer la montre » n'est récompensé (avec une récompense de 0 comme pour une égalité, un
joueur en train de perdre aurait intérêt à faire traîner). Les parties tronquées sont comptées et enregistrées.

**Algorithme.** PPO acteur-critique avec avantages GAE (λ = 0,95), politique stochastique (indispensable en
information imparfaite : une politique déterministe est prévisible et exploitable), entropie, arrêt anticipé sur la
divergence KL. Les parties continuent d'une mise à jour à l'autre ; PPO tient compte de la version qui a vraiment
joué. Ligue : anciennes versions tirées en privilégiant celles que le modèle bat le moins (PFSP).

## 15. Dépannage

| Problème | Solution |
|---|---|
| `Catalogue des cartes absent` | à la racine : `npm run game:cards` (Internet nécessaire), ou `--set env.catalog=chemin` |
| `Node.js introuvable` / `trop ancien` | installe Node.js 22.18+, ou `--set env.node=C:/chemin/node.exe` / variable `OPCG_NODE` |
| Pas de GPU détecté alors qu'il y en a un | PyTorch sans CUDA : `pip install torch --index-url https://download.pytorch.org/whl/cu126 --force-reinstall` ; vérifier avec `python -c "import torch; print(torch.cuda.is_available())"` |
| Mémoire GPU insuffisante | réduis `ppo.minibatch_size` (512, 256) ou `model.d_model` |
| Ordinateur qui rame | réduis `env.workers` |
| `encodage différent` à la reprise | le code de `game/rl/` a changé depuis l'entraînement : nouvel entraînement (`--fresh` ou `--run`) |
| `CATALOGUE SYNTHÉTIQUE` | catalogue de test (cartes inventées) : utilise le vrai (`npm run game:cards`) |
| Niveau non validé (code 3) | voir § 7 |
| Parties tronquées ou en erreur | `logs/<run>/anomalies/` : `python play.py --replay <fichier>` pour voir où ça bloque |
