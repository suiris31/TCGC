# Aide-mémoire : commandes de l'entraînement

Toutes les commandes se lancent dans **PowerShell**, depuis le dossier de l'entraînement, environnement activé :

```powershell
cd C:\Users\nicol\Desktop\ProjectTCGC\TCGC\rl
.venv\Scripts\Activate.ps1
```

Toujours depuis `TCGC\rl` (une commande lancée depuis `TCGC\` ne démarre pas). Détails : `README.md` (§ 16 pour les
IA par deck) ; état du chantier et décisions : `SUIVI.md`.

## Les 15 decks

| Deck | Nom | | Deck | Nom |
|---|---|---|---|---|
| `META-SABO-2026-10` | Sabo (méta) | | `ST-31` | Luffy (rouge) |
| `META-MIHAWK-2026-10` | Mihawk (méta) | | `ST-32` | Zoro (vert) |
| `META-ROBIN-2026-10` | Nico Robin (méta) | | `ST-33` | Kuzan (bleu) |
| `META-XEBEC-2026-10` | Rocks D. Xebec (méta) | | `ST-34` | Katakuri (violet) |
| `META-ENEL-2026-10` | Ener (méta) | | `ST-35` | Sabo (rouge/noir) |
| `META-KAIDO-2026-10` | Kaido (méta) | | `ST-36` | Kid (jaune) |
| | | | `ST-21` | Luffy Gear 5 (rouge) |
| | | | `ST-22` | Ace et Newgate (bleu) |
| | | | `ST-30` | Luffy et Ace (rouge/vert) |

Groupes pour `train_decks.py --decks` : `meta` (les 6 du méta), `starter` (les 9 pour débutant), `all` (les 15), ou
une liste séparée par des virgules.

## Entraîner une IA par deck

| Je veux... | Commande |
|---|---|
| Entraîner un deck (300 mises à jour, ~1 h 10) | `python train.py --config gpu --deck META-ROBIN-2026-10` |
| Prolonger un deck déjà entraîné | `python train.py --config gpu --deck META-ROBIN-2026-10 --max-updates 600` |
| Reprendre après un arrêt | la même commande qu'au départ |
| Les 6 decks du méta, l'un après l'autre | `python train_decks.py --config gpu --decks meta` |
| Les 15 decks, trois à la fois (le plus rapide) | `python train_decks.py --config gpu --decks all --parallel 3` |
| Quelques decks choisis | `python train_decks.py --config gpu --decks META-KAIDO-2026-10,META-ENEL-2026-10` |
| Une file avec plus de mises à jour par deck | `python train_decks.py --config gpu --decks meta --max-updates 500` |
| Tous les decks ensemble, par paliers de 100 (~3 h le palier) | `python train_decks.py --config gpu --decks all --parallel 3 --max-updates 900 --step 100` |
| Arrêter proprement | **Ctrl+C** une fois (finit la mise à jour, sauvegarde) ; une 2ᵉ fois : tout de suite |

Ordre conseillé (decks que le modèle général joue le moins bien d'abord) :

```powershell
python train_decks.py --config gpu --decks META-KAIDO-2026-10,META-ENEL-2026-10,META-MIHAWK-2026-10,META-XEBEC-2026-10,META-ROBIN-2026-10,META-SABO-2026-10
```

Bon à savoir :

- Le plus rapide sur le PC : **`--parallel 3`** (~20,5 s par mise à jour chacun, 3,5 fois le débit d'avant
  l'optimisation). Seul : ~14 s par mise à jour. À 4 : pas mieux qu'à 3. Les 15 à la fois ne tiennent pas dans le
  GPU. En parallèle, les messages vont dans `console.txt`.
- Pour que tous les decks avancent ensemble : `--step` (par paliers), pas `--parallel 15`.
- Un deck qui a déjà fait son nombre de mises à jour est passé (« rien à faire ») : relancer une file la reprend là
  où elle en était.
- Chaque deck a ses dossiers : `checkpoints\deck-<deck>\` et `logs\deck-<deck>\`.
- Au départ, une évaluation de référence (le modèle général qui joue ce deck), puis une évaluation toutes les 100 mises
  à jour (~1 à 2 min).
- **Ligue des spécialistes** : chaque IA de deck affronte aussi les IA des autres decks déjà entraînées (dernier point
  de sauvegarde, relu à chaque évaluation). Plus il y a de decks entraînés, plus les adversaires jouent leur deck comme
  il faut (60 % des parties ; 2 IA adverses par mise à jour, tirées au sort à chaque fois).

## Suivre

| Je veux... | Commande |
|---|---|
| Le résumé d'un deck (évaluations, tendances) | `python report.py --run deck-META-ROBIN-2026-10` |
| Les 10 dernières évaluations seulement | `python report.py --run deck-META-ROBIN-2026-10 --evals 10` |
| Voir le journal défiler (autre fenêtre) | `Get-Content logs\deck-META-ROBIN-2026-10\train.log -Wait -Tail 20` |
| Les messages d'un deck lancé avec `--parallel` | `Get-Content logs\deck-META-ROBIN-2026-10\console.txt -Wait -Tail 20` |
| Les courbes (puis http://localhost:6006) | `tensorboard --logdir logs` |
| L'occupation du GPU | `nvidia-smi` |

À lire dans les évaluations : la ligne « Évaluation » donne le taux de victoire de ce deck contre `heuristic`, contre
`base` (le modèle général) et contre `experts` (les autres IA spécialisées). Les deux premiers sont des repères fixes :
ça progresse s'ils montent par rapport à l'évaluation de départ. `experts` monte moins vite, ou baisse, quand les
autres IA progressent : c'est normal. Un écart plus petit que l'intervalle entre crochets n'est pas significatif.

## Mesurer à part

```powershell
# ce deck contre les 15 decks, contre l'heuristique et contre le modèle général (graines d'évaluation)
python evaluate.py --checkpoint deck-META-ROBIN-2026-10 --deck META-ROBIN-2026-10 --opponents heuristic model:rtx2070-main --seeds 8
# plus fort : contre le Monte-Carlo (lent)
python evaluate.py --checkpoint deck-META-ROBIN-2026-10 --deck META-ROBIN-2026-10 --opponents mc:16 --seeds 2
```

## Regarder l'IA jouer

```powershell
# une partie, chaque décision affichée avec la probabilité de chaque option
python play.py --checkpoint deck-META-ROBIN-2026-10 --deck META-ROBIN-2026-10 --opp-deck META-KAIDO-2026-10 --opponent heuristic
# même partie, enregistrée pour le simulateur (Jouer → Mes parties → importer)
python play.py --checkpoint deck-META-ROBIN-2026-10 --deck META-ROBIN-2026-10 --opp-deck META-KAIDO-2026-10 --seed 1234 --record partie.json
```

## Essayer dans le simulateur (sur le PC)

```powershell
python export_onnx.py --checkpoint deck-META-ROBIN-2026-10 --install
cd ..
npm run build
.\start.bat
```

Puis Jouer → adversaire Robin → niveau « IA entraînée » (l'écran indique « IA spécialisée »).

## Mettre en ligne

**L'IA d'un deck** (remplacer le deck et le numéro de mise à jour) :

```powershell
python export_onnx.py --checkpoint deck-META-ROBIN-2026-10 --install
cd ..
git add web/public/rl-model/decks.json web/public/rl-model/decks/META-ROBIN-2026-10
git diff --cached --stat
git commit -m "IA entraînée : IA spécialisée Robin, mise à jour <numéro>"
git push
git push origin HEAD:main
```

**Le modèle général** (u8959, figé) :

```powershell
python export_onnx.py --checkpoint rtx2070-main --install
cd ..
git add web/public/rl-model/model.onnx web/public/rl-model/model.json
git diff --cached --stat
git commit -m "IA entraînée : modèle mise à jour <numéro>"
git push
git push origin HEAD:main
```

Puis, sur le serveur :

```bash
sudo bash /opt/tcgc/app/deploy/update.sh
```

Si le dernier `git push` est refusé (main a avancé entre-temps) : `git pull --rebase origin main`, puis les deux
`git push` à nouveau. Chaque modèle ajoute ~6,7 Mo à l'historique du dépôt : ne mettre en ligne que les IA qui battent
nettement leur évaluation de départ.

## Entraînement général (figé à u8959)

Il ne reprend pas. Au cas où, la commande de reprise est dans `SUIVI.md` § 4 (« Reprendre l'entraînement général »).
S'il reprenait, les IA de deck déjà commencées gardent leur point de départ (`base.pt`) ; les nouvelles partiraient du
nouveau modèle général.

## En cas de souci

| Message ou problème | Solution |
|---|---|
| `rien à faire` | le deck a fait son maximum : ajouter `--max-updates` avec un nombre plus grand |
| `Deck inconnu` | vérifier l'identifiant dans le tableau des decks (majuscules, tirets) |
| `ajoute --deck <deck>` | l'entraînement `deck-<deck>` se relance avec `--deck <deck>` |
| `out of memory` ou apprentissage très irrégulier | un seul entraînement à la fois, ou `--set ppo.microbatch_size=256` |
| Ordinateur qui rame | moins de processus Node : `--workers 4` |
| Une commande ne démarre pas | vérifier qu'on est dans `TCGC\rl` et que l'environnement est activé (`(.venv)` devant l'invite) |
| Tests de l'installation | `python -m pytest -q` (~2 min) |
