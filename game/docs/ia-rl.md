# IA par apprentissage par renforcement — étape 1 : analyse et architecture

Document de référence du chantier « IA entraînée par RL ». Rien n'est encore codé : ce document fixe l'analyse,
les difficultés, l'architecture et les choix, à valider avant l'étape 2 (environnement).

## 1. Analyse du projet

### Architecture générale

| Dossier | Rôle |
|---|---|
| `server/` | Express : collection de cartes, comptes, parties enregistrées, parties en ligne (`game-online.js`), catalogue du jeu (`game-cards.js`) |
| `web/` | Interface React/Vite de la collection |
| `game/engine/` | Moteur de règles (TypeScript, aucune dépendance) |
| `game/ai/` | IA actuelle : heuristique, Monte-Carlo, styles appris, Worker navigateur |
| `game/coach/` | Analyse des décisions du joueur, archive et rejeu des parties |
| `game/online/` | Arbitrage des parties en ligne (vue expurgée par joueur) |
| `game/ui/` | Interface du jeu |
| `game/tests/` | 165 tests (`node --test`) |
| `scripts/game/` | Outils en ligne de commande : `smoke`, `validate`, `bench`, `duel`, `train` |

Le moteur tourne tel quel dans Node ≥ 22 (exécution directe du TypeScript) et dans le navigateur.

### Moteur de jeu (`game/engine/engine.ts`, `rules.ts`)

- **État** : un objet JSON simple (`GameState`), copiable et sérialisable. Le générateur aléatoire (mulberry32) fait
  partie de l'état : **graine + liste des choix = partie rejouée à l'identique** (déjà utilisé par l'archive et les
  parties en ligne).
- **Boucle** : le moteur avance seul jusqu'à la prochaine décision (`state.decision`).
  - `act(state, choix)` : applique un choix et renvoie un nouvel état (l'ancien n'est pas modifié) ;
  - `advance(state, chooser)` : joue toutes les décisions par une fonction (simulations, sur place).
- **Décisions** : toujours de la forme `Decision { player, kind, tag, options[] }`, avec
  `kind` ∈ `mulligan | main | blocker | counter | effect`. Chaque option a un identifiant stable (`play:12`,
  `attack:3:7`, `don:5`, `counter:40`, `card:18`, `yes`, `none`, `cost:4`…) et désigne ses cartes (`uid`, `target`,
  `num`).
- **Effets** : les choix successifs d'un effet sont posés un par un (`ctx.ask`). Pour une partie interactive, une
  décision au milieu d'un effet est résolue en rejouant l'effet depuis un instantané JSON avec les réponses déjà
  données.
- **Règles couvertes** (règles complètes v1.2.1) : préparation, mulligan, Vie, phases Recharge/Pioche/DON!!/
  Principale/Fin, combat (Attaque → Blocage → Contre → Dégâts), [Déclenchement], mots-clés (Bloqueur, Initiative,
  Initiative : Personnage, Double attaque, Exil, Imblocable), effets « quand … » et leur ordre (8-6-1-1), effets de
  remplacement, modifications temporaires et différées, règles changées par un Leader (taille du deck DON!!, deck vide).
- **Fin de partie** : dégâts sans Vie ; deck vide (avec les variantes de Leader). **Aucune égalité** n'existe dans le
  moteur. Garde-fou : 50 000 itérations sans décision → erreur.
- **Contrôles de cohérence** (`invariants.ts`) : conservation des cartes, total de DON!!, zones, puissances.

### Ressources et DON!!

`donDeck`, `donActive`, `donRested` par joueur, `don` par carte du terrain ; +1000 par DON!! donnée pendant le tour de
son propriétaire ; DON!! −X, ajout depuis le deck DON!!, redressement différé. Donner des DON!! = une décision `don:uid`
**par DON!!** (pas de combinaison à énumérer).

### Cartes et decks

- Informations officielles (`CardData`) : téléchargées depuis les listes Bandai FR/EN (`game/data/catalog.ts`), **pas
  dans le dépôt** (`data/game-catalog.json`).
- Comportement codé à la main (`cards/st31.ts` … `st36.ts`), briques d'effets assemblables (`cards/bricks.ts`),
  mots-clés génériques lus dans le texte (`keywords.ts`).
- **6 decks préconstruits** (ST-31 à ST-36), environ 90 cartes codées. Le « jeu complet » accessible au RL est
  exactement ce que le moteur sait jouer.

### Information cachée

- `viewFor(state, siège)` (`engine/view.ts`) produit **déjà** la vue d'un joueur sans aucune information cachée
  (main adverse, decks, Vies face cachée, graine, instantanés d'effets, journal secret, choix adverses), avec des
  identifiants opaques pour les cartes cachées. Elle est vérifiée sur des parties complètes (`view.test.ts`).
- `known` / `peek` suivent les cartes révélées ou regardées, tant qu'elles restent dans leur zone.
- Deux réserves pour le RL : la vue garde `deckId` de l'adversaire (qui donne sa liste pour un deck préconstruit) et
  l'IA actuelle lit la liste adverse (`likelyTopCost`). L'agent RL n'utilisera ni l'un ni l'autre : seulement le
  Leader adverse et les cartes vues.

### IA actuelle

- **Niveau 1 (heuristique, `heuristic.ts`)** : ~600 lignes de règles écrites à la main + 20 réglages de « style » par
  deck, ajustés par un algorithme d'évolution (`scripts/game/train.ts` → `styles.json`). Ce n'est pas du RL : un
  petit nombre de paramètres sur une politique fixée par l'humain.
- **Niveaux 2-3 (Monte-Carlo à informations cachées, `search.ts`)** : pour chaque option, redistribution aléatoire
  des cartes inconnues puis partie jouée jusqu'au bout par l'heuristique ; 16 tirages / 0,5 s ou 48 / 1,8 s par
  décision.
- Le coach réutilise cette analyse ; les calculs tournent dans un Worker (`ai/worker.ts`, `ai/client.ts`).
- Mesures existantes (`validation.md`) : heuristique contre heuristique, de 25 % (ST-34) à 62 % (ST-32) de victoires ;
  **~148 décisions par partie** (deux joueurs) ; ~28 600 décisions/s sur un fil (moteur sur place + heuristique +
  contrôles).

### Réutilisable directement

Moteur (`newGame`, `act`, `advance`), `viewFor`, `invariants`, graines, format des décisions et options, IA
heuristique et Monte-Carlo (adversaires et références d'évaluation), `replayRecord`/`GameRecord` (rejeu, affichage
dans l'interface), outils de tests (`scenario`, `choose`…), infrastructure Worker.

### À adapter ou créer

| Élément | Pourquoi |
|---|---|
| Encodage des observations | Nouveau : tenseurs construits uniquement à partir de `viewFor` |
| Encodage des options | Nouveau : caractéristiques de chaque option légale |
| Environnement + serveur par lots | Nouveau : interface `reset/step` pour l'entraînement en Python |
| Coût de `act` | Clone complet de l'état + instantané JSON qui contiennent journal et historique, qui grossissent pendant la partie (coût quadratique). L'environnement les videra (les règles ne les lisent pas). Mesure d'abord ; si nécessaire, variante sur place testée par équivalence. Aucune règle modifiée. |
| Plafond de sécurité | Nombre maximal de décisions par partie (partie tronquée = 0, signalée et comptée) |
| Catalogue des cartes | Indispensable pour lancer le moteur (voir § 10) |

## 2. Difficultés techniques

1. **Horizon long, récompense uniquement finale** : ~74 décisions par joueur et par partie, 10 à 20 tours ; le
   mérite d'un choix se révèle plusieurs tours plus tard.
2. **Information imparfaite + hasard** (mélanges, Vies, [Déclenchement]) : une décision s'évalue en espérance sur ce
   qu'on ne voit pas ; certains choix optimaux sont **mixtes** (garder ou non un Contre, cacher ses ressources). Une
   politique déterministe est exploitable.
3. **Actions variables et séquentielles** : jusqu'à ~60 options en phase principale (estimation) ; options qui désignent des
   cartes (pas un index fixe) ; effets à choix successifs ; cartes « en suspens » pendant un effet (cartes regardées,
   dans aucune zone).
4. **Self-play non transitif** : risque de cycles (A bat B, B bat C, C bat A) et de sur-spécialisation contre soi-même.
5. **Asymétries** : decks de forces différentes, avantage du premier joueur → un taux de victoire brut ne se compare
   qu'à une référence par confrontation.
6. **Débit de simulation** : inconnu pour le chemin `act` + encodage + réseau ; à mesurer avant de dimensionner.
7. **Généralisation** : un plongement appris par numéro de carte ne se transfère pas à une carte nouvelle ; il faut
   des caractéristiques de carte (coût, puissance, types, mots-clés…, plus tard le texte).
8. **Couverture des cartes** : le RL ne peut pas dépasser les cartes codées dans le moteur.
9. **Environnement cloud actuel** : catalogue non téléchargeable (domaines Bandai bloqués), pas de GPU, 4 cœurs.

## 3. Architecture RL proposée

```
game/engine/   règles (inchangées)
      │  newGame / act / viewFor
game/rl/       TypeScript, partagé entre entraînement et navigateur
   env.ts        reset(graine, decks, premier) · options légales · step(choix) · fin · récompense
   observe.ts    viewFor(état, siège) → tenseurs        (seule entrée du modèle)
   options.ts    options légales → caractéristiques
   record.ts     trajectoires + rejeu exact
   opponents.ts  aléatoire, heuristique, Monte-Carlo
   server.ts     serveur de parties par lots (stdin/stdout) pour Python
rl/            Python (PyTorch) : entraînement
   envpool.py    N processus Node × M parties
   model.py      réseau
   ppo.py        apprentissage
   league.py     pool d'adversaires
   evaluate.py   évaluation séparée
   export.py     export ONNX
models/        modèles entraînés + fiche (version du moteur, entraînement, résultats)
game/ai/rl.ts  inférence (onnxruntime-web dans le Worker existant) → nouveau niveau « IA entraînée »
```

**Pourquoi TypeScript pour l'environnement et Python pour l'entraînement** : le moteur est réutilisé à 100 % (aucun
second moteur) ; PyTorch fournit l'apprentissage, l'optimisation et l'export ONNX ; le même encodage TypeScript sert
à l'entraînement et au navigateur (aucun écart entre les deux). Écartés : tout en TypeScript (pas de bibliothèque
d'entraînement fiable), moteur réécrit en Python (second moteur à maintenir).

### 3.1 Environnement

- `reset(graine, decks, premier)` → première décision de l'agent ; `step(idOption)` → `act`, puis avance seul :
  décisions à une seule option (aucun apprentissage possible), décisions d'un adversaire intégré (aléatoire,
  heuristique, Monte-Carlo) ; rend la main au contrôleur pour chaque décision d'un joueur piloté par le réseau
  (self-play : les deux sièges).
- Retourne : observation du joueur qui décide, options légales, fin, récompense (+1 / −1 en fin de partie).
- Graine déterministe ; trajectoire rejouable.

### 3.2 Représentation de l'état (uniquement depuis `viewFor`)

- **Un jeton par carte visible** (≈ 20 à 100) : Leaders, Personnages, Lieux, sa main, les Défausses, Vies face
  visible, cartes révélées (main adverse connue, dessus du deck adverse regardé), cartes montrées par la décision en
  cours (cartes regardées pendant un effet).
  - Statique (catalogue) : catégorie, coût, puissance, Contre, Vie, couleurs, types (multi-hot), attributs,
    mots-clés, présence d'un [Déclenchement] ; plongement appris par numéro (+ case « carte inconnue ») ; plus tard,
    plongement du texte de l'effet pour les cartes nouvelles.
  - Dynamique (calculé par les fonctions du moteur sur la vue) : zone et propriétaire, épuisée, DON!! données,
    puissance et coût actuels, jouée ce tour, peut attaquer, effets [Une fois par tour] utilisés, modifications
    actives (puissance, ne peut pas attaquer / être épuisé / être mis KO, mots-clés accordés, durée), rôle dans le
    combat (attaquant, cible), position.
- **Jeton global** : tour, joueur actif, premier joueur, phase, type et étiquette de la décision, étape et puissances
  du combat, Vies / main / deck / Défausse des deux joueurs, DON!! (deck, redressées, épuisées, données), carte source
  de l'effet en cours, **cartes restantes de son propre deck** (sa liste moins les cartes vues : information
  légitime).
- Jamais : `deckId` adverse, `uid` comme caractéristique, graine, instantanés.
- **Historique** : d'abord aucun au-delà des zones publiques (la Défausse garde les cartes jouées et les Contres
  utilisés ; `known` garde les cartes révélées). Une mémoire (récurrente ou liste d'événements publics) sera ajoutée
  seulement si l'évaluation montre qu'elle manque.

### 3.3 Espace d'actions : pointeur sur les options légales

Le moteur décompose **déjà** toute action composée en suite de choix simples : 1 DON!! à la fois, 1 carte de Contre à
la fois puis « ne pas contrer davantage », cibles « jusqu'à N » une par une avec « aucune », ordre des effets
simultanés, coûts facultatifs oui/non, coût déclaré 0 à 10. C'est exactement la factorisation autorégressive voulue :
**aucune liste géante de combinaisons**.

- Chaque option est décrite par : son type (préfixe de l'identifiant : `play`, `event`, `act`, `don`, `attack`, `end`,
  `block`, `counter`, `cevent`, `pass`, `card`, `none`, `yes`, `no`, `trigger`, `hand`, `cost`, `first`, `choice`,
  `replace`, `trash`…), la ou les cartes désignées (pointeur vers leur jeton, ou caractéristiques de la carte si elle
  est en suspens), un argument numérique (`cost:n`), l'étiquette de la décision.
- Score = petit réseau(option ⊕ jetons des cartes désignées ⊕ contexte) ; softmax **sur les seules options légales**
  → politique légale par construction, taille variable, indépendante des decks.
- Décisions à une seule option : jouées automatiquement, jamais présentées à l'agent.

### 3.4 Réseau

Transformeur sur l'ensemble des jetons (2-3 couches, dimension 128, 4 têtes, ≈ 0,5 M paramètres) : ensemble de
taille variable, sans ordre, cartes en interaction (attaquant / bloqueurs / auras). Deux têtes : score des options
(politique) et valeur (probabilité de victoire). Taille visée < 5 Mo, inférence de quelques ms sur CPU (à mesurer).

### 3.5 Récompense

- Victoire +1, défaite −1, γ = 1. **Aucune récompense intermédiaire.**
- Le moteur n'a pas d'égalité ; une partie tronquée par le plafond de sécurité vaut 0, est signalée et comptée
  (attendu : ~0 %).
- Toute récompense auxiliaire éventuelle : justifiée par écrit, mesurée par comparaison A/B, retirée si elle n'apporte
  rien.

## 4. Choix de l'algorithme

Caractéristiques : 2 joueurs, somme nulle, information imparfaite, hasard, états très nombreux, actions variables et
séquentielles, horizon long, récompense finale, self-play.

| Famille | Pour | Contre | Décision |
|---|---|---|---|
| AlphaZero / MuZero (MCTS) | Très fort en information parfaite | Information cachée → recherche sur tirages (fusion de stratégies) ; coût d'un arbre × vitesse du moteur ; modèle de dynamique difficile avec des cartes cachées | Non comme base ; peut-être plus tard comme recherche au moment de jouer |
| CFR / Deep CFR / ReBeL / Student of Games | Garanties d'équilibre en information imparfaite | Arbre et états de croyance publics hors de portée (decks de 50 cartes, ~150 décisions) | Non |
| NFSP | Approche un équilibre | Basé sur DQN : lent, instable avec des actions de taille variable | Non |
| DMC (DouZero) | Simple ; éprouvé sur un jeu de cartes à récompense finale et grand espace d'actions | Politique gloutonne déterministe (exploitable) ; retours Monte-Carlo très bruités sur ~74 décisions ; milliards d'exemples sur GPU | Référence de secours |
| Acteur-critique PPO + GAE + ligue (AlphaStar, OpenAI Five) | Politique stochastique ; la valeur répartit le mérite sur l'horizon long ; stable ; s'adapte au pointeur ; tourne sur CPU ; la ligue limite les cycles | Pas de garantie d'équilibre seul | **Base** |
| + régularisation vers une politique « aimant » (MMD, Sokota et al. ; R-NaD / DeepNash, Perolat et al., Stratego) | Converge vers un équilibre approché en information imparfaite à 2 joueurs ; petit ajout à la perte PPO | Hyperparamètres en plus | **Ajoutée aux niveaux 4-5, mesurée** |

Choix :

- **Phase A (niveaux 1-3, adversaires fixes)** : contre un adversaire fixe, le problème est un apprentissage à un
  agent ; acteur-critique PPO, GAE (λ ≈ 0,95), γ = 1, bonus d'entropie.
- **Phase B (niveaux 4-5)** : ligue = version courante + anciennes versions + heuristique + aléatoire, tirage des
  adversaires selon la difficulté (PFSP) ; régularisation MMD ; agents « exploiteurs » entraînés contre une version
  figée pour mesurer ce qu'elle laisse exploiter.
- **Phase C (option, mesurée)** : recherche au moment de jouer, en réutilisant le Monte-Carlo existant avec la
  politique et la valeur apprises à la place de l'heuristique.

Options qui demandent ton accord (non activées par défaut) :

- **Critique « oracle »** : pendant l'entraînement seulement, le critique (valeur) verrait les cartes cachées ; la
  politique ne les voit jamais et le critique n'est pas livré. Réduit beaucoup le bruit d'apprentissage (pratique
  courante, ex. PerfectDou). Par défaut : critique limité à l'observation.
- **Démarrage par imitation de l'heuristique** : accélère, mais importe des règles humaines. Par défaut : non ;
  seulement si l'apprentissage depuis zéro bloque.

## 5. Progression

Chaque niveau a un critère chiffré ; on ne passe au suivant qu'une fois le critère atteint sur les parties
d'évaluation.

| Niveau | Contenu | Critère |
|---|---|---|
| 0 | Tests de l'environnement | Déterminisme, 100 000 parties aléatoires sans erreur ni incohérence, observation identique quand on redistribue les cartes cachées, débit mesuré |
| 1 | 1 deck en miroir, contre l'aléatoire | ≥ 95 % |
| 2 | 6 decks (36 confrontations), contre l'aléatoire | ≥ 95 % sur chaque confrontation |
| 3 | Contre l'IA heuristique | Au-dessus de la référence heuristique-contre-heuristique sur chaque confrontation, puis ≥ 55 % global ; contrôle contre le Monte-Carlo niveau 2 |
| 4 | Self-play | Progrès contre les versions précédentes sans recul contre l'heuristique |
| 5 | Ligue (anciennes versions, exploiteurs) | Exploiteurs < 60 % contre la version figée ; Elo croissant |
| 6 | Nouveaux decks / cartes | Dépend des cartes codées dans le moteur ; test sur un deck tenu à l'écart, puis ajustement |

## 6. Évaluation

- **Graines séparées** : l'entraînement tire ses graines d'une suite ; l'évaluation utilise un ensemble fixe distinct,
  dans un processus séparé, sans aucune écriture vers les données d'entraînement.
- **Parties dupliquées** : chaque graine jouée deux fois en échangeant les sièges (annule la chance du mélange et
  l'avantage du premier joueur).
- Mesures : taux de victoire avec intervalle de confiance (Wilson) ; par deck et par confrontation (6 × 6) ; premier
  / second joueur ; contre aléatoire, heuristique, Monte-Carlo 2 (et 3 sur moins de parties), anciennes versions ;
  nombre moyen de tours et de décisions ; Elo des versions ; taux de parties tronquées ; entropie de la politique ;
  calibration de la valeur. Rapport en markdown dans `game/docs/`, courbes à partir d'un journal JSONL.

## 7. Reproductibilité et analyse

- **Trajectoire** : version du moteur (`git describe`), modèle (nom + empreinte sha256), graine, decks, premier
  joueur, adversaires, liste des choix ; pour chaque décision de l'agent : probabilité de chaque option et valeur
  estimée ; résultat, tours. Rejeu exact par `newGame(graine)` + `act` (comme `replayRecord`).
- Conversion en `GameRecord` pour revoir une partie dans l'interface existante (« Mes parties »).
- Outil d'inspection en ligne de commande : options, probabilités et valeur à chaque décision ; plus tard dans le
  panneau du coach (même structure `Analysis.stats`).

## 8. Intégration au simulateur

- Séparation : moteur (inchangé) · `game/rl/` (environnement, encodage) · `rl/` (entraînement Python) · `models/`
  (modèles) · `game/ai/rl.ts` (inférence) · interface.
- Inférence dans le navigateur, dans le Worker existant, via onnxruntime-web (WebAssembly) : nouveau niveau « IA
  entraînée » à côté des niveaux 1-3, qui restent inchangés. Pas de service serveur nécessaire au départ ; une route
  d'API reste possible ensuite.

## 9. Modifications prévues du moteur

Aucune modification des règles. Éventuellement, après mesure : ne pas accumuler journal et historique pendant
l'entraînement, et une variante sur place de `act` testée par équivalence sur des parties complètes.

## 10. Points bloquants et décisions

1. **Catalogue des cartes** : `fr.onepiece-cardgame.com` et `en.onepiece-cardgame.com` sont refusés par la politique
   réseau de cet environnement cloud ; sans `data/game-catalog.json`, ni le moteur ni les tests ne tournent ici.
2. **Machine d'entraînement** (GPU ? nombre de cœurs ?) : détermine la taille des lots et la durée.
3. Critique oracle : oui / non.
4. Modèles entraînés dans le dépôt (quelques Mo) ou à part.
