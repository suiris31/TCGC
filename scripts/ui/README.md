# Parcours de l'interface : `npm run ui:tour`

Une seule commande lance un serveur d'essai sur une **copie** de la base, crée un compte de test sur cette copie, joue
les parcours de l'onglet « Jouer » dans Chrome sans écran, dans **3 formats**, puis arrête le serveur et Chrome. Elle
produit une capture par écran et par format, et un rapport par format. Les tâches de l'étape R comparent leurs captures
et leurs rapports à ceux du commit de départ.

Aucune dépendance npm : le navigateur est piloté par le protocole DevTools (`cdp.mjs`).

## Lancer

```bash
npm run build
npm run ui:tour -- --port 3501 --out C:/chemin/vers/dossier-avant
```

| Option | Rôle | Par défaut |
|---|---|---|
| `--port <n>` | port du serveur d'essai (celui de ta tâche, `01-contrats.md` § 14.1) | 3500 |
| `--db <fichier>` | base dont on fait une copie (jamais `tcgc.db`, refusée) | `data/tcgc-test.db` |
| `--out <dossier>` | dossier des captures et rapports | dossier temporaire daté (affiché) |
| `--only <a,b>` | seulement ces parcours : `accueil`, `partie`, `aventure`, `decks`, `parties`, `salon`, `atelier` | tous sauf `atelier` |
| `--formats <a,b>` | seulement ces formats : `desktop`, `portrait`, `paysage` | les 3 |
| `--headed` | Chrome visible (pour regarder un parcours) | sans écran |
| `--compare <avant> <après>` | compare deux dossiers (voir plus bas) | |

- **Lance `npm run build` avant** : le serveur d'essai sert l'interface construite (`dist/`). L'outil prévient si le
  build est plus ancien que le code de `game/ui` ou `web/src`.
- Chrome ou Edge est cherché dans les dossiers habituels de Windows ; sinon, donne son chemin dans `CHROME_PATH`.
- Durée : environ 4 minutes pour les 3 formats.
- Code de sortie : 0 si tout s'est joué, 1 si un parcours a échoué (il est noté dans le rapport, avec une capture
  `echec-<parcours>-<format>.png`, et les autres parcours continuent), 2 si l'outil n'a pas pu démarrer.

## Ce que fait l'outil

1. Copie la base dans un dossier de travail temporaire (une nouvelle copie à chaque lancement : même point de départ),
   lance `server/index.js` dessus sur `127.0.0.1:<port>`.
2. Pour chaque format, ouvre un onglet dans un **contexte vierge** (cookies, stockage et cache à part) et crée un compte
   de test `tour-<format>` sur la copie (mot de passe tiré au hasard, jamais affiché).
3. Joue les parcours. Chaque parcours repart de l'écran de départ (`#play`, page rechargée).
4. Arrête Chrome et le serveur, supprime le dossier de travail.

| Format | Taille | Particularités |
|---|---|---|
| `desktop` | 1440 × 900 | souris |
| `portrait` | 390 × 844 | toucher, facteur 3, `hover: none`, téléphone Android |
| `paysage` | 844 × 390 | idem |

### Les écrans

Les numéros sont fixes : un écran garde le sien même avec `--only`.

| Parcours | Écrans |
|---|---|
| `accueil` | 01 accueil de « Jouer » (et temps d'ouverture de l'onglet, cache vidé) |
| `partie` | 02 main de départ · 03 début de mon tour · 04 une carte jouée · 05 une DON!! donnée au Leader · 06 confirmation de fin de tour (s'il reste des actions) · 07 l'IA attaque (blocage ou contre ; on laisse passer) · 08 mon tour suivant · 09 choix de la cible d'une attaque · 10 attaque résolue |
| `aventure` | 11 accueil · 12 carte d'East Blue · 13 un chapitre · 14 la Cale · 15 mon deck d'aventure · 16 boutique |
| `decks` | 17 Mes decks · 18 choix du Leader · 19 éditeur (deck vide, non enregistré) |
| `parties` | 20 Mes parties (la partie rapide abandonnée y figure si `partie` a été joué) |
| `salon` | 21 salon en ligne |
| `atelier` | 30 chaque page « plateau » de l'atelier (`#play/atelier/plateau-<état>`, états fixés de `game/ui/atelier/plateau/etats.ts`) : `30-plateau-<état>-<format>.png`. **Seulement avec `--only atelier`** (hors de la référence de l'étape) |

La partie rapide : ST-01 contre ST-32, IA « Débutant », l'IA commence. Les écrans 06 et 07 n'existent que si la partie
passe par là (elle est toujours la même, voir « Stabilité »).

### Le rapport

Dans le dossier de sortie :

- `NN-écran-<format>.png` : ce qu'on voit à l'écran (pas toute la page) ;
- `rapport-<format>.json` : un objet par écran :
  - `erreurs` : erreurs de la console, exceptions, réponses HTTP ≥ 400 et échecs réseau survenus depuis l'écran
    précédent ;
  - `defilementHorizontal` et `debordements` (éléments qui dépassent à droite) ;
  - `cibles` : nombre de cibles cliquables visibles, et la liste de celles de moins de 44 px de large ou de haut ;
  - `textes` : nombre de textes visibles, taille minimale, et la liste de ceux de moins de 11 px ;
  - `page` : largeur et hauteur de la page (une page de 4 000 px de haut se voit ici) ;
  - en fin de rapport : `etapes` (ce qui a été joué), `avertissements` (un clic qui n'a pas pu se faire au doigt parce
    qu'un autre élément couvrait la cible), `echecs`, `totaux`, puis `lanceLe` et `durees` (temps d'ouverture de
    l'onglet, durée de chaque parcours) ;
- `rapport.md` : le résumé des 3 formats ;
- `journal.txt` et `serveur.log`.

**Ce qui est compté :** seulement ce qui est dans la fenêtre et au premier plan (pas sous une fenêtre ouverte
par-dessus). Les cibles : boutons, liens, champs, éléments à rôle de bouton ou d'onglet, et éléments au curseur en
main ; une case à cocher compte par son libellé. Les visuels des cartes ne comptent pas comme cibles (carte du plateau,
vignette faite d'une image sans texte) ; les textes posés sur les cartes (puissance, coût) comptent. La taille d'un
texte tient compte des agrandissements (`transform`, cartes SVG).

## Stabilité : deux lancements, deux rapports identiques

- `Math.random` de la page est remplacé par un tirage à graine fixe, remis à la graine juste avant « Lancer la
  partie » : la partie (mains, pioches) est toujours la même. L'IA « Débutant » joue dans la page, sans fil de calcul,
  donc sans hasard.
- Réglages posés avant la première ouverture : IA « rapide », sans son, pas d'aide au premier lancement, pas de fenêtre
  de détail au survol (elle dépendrait du temps passé sur une carte).
- Animations et transitions coupées par une classe `ui-tour-still` posée sur `<html>` par le script (pas par le jeu).
  Les animations faites en JavaScript (bateau de la carte) ont le temps de finir avant la capture.
- La souris est éloignée de la page avant chaque capture (sauf la cible d'attaque, survolée exprès).
- Les chiffres des libellés et des erreurs sont remplacés par `#` (dates, identifiants) ; l'adresse du serveur est
  retirée.
- Les clics passent par les attributs `data-ui` (jamais par un texte), à la position réelle de l'élément.

Seuls `lanceLe` et `durees` changent d'un lancement à l'autre. Pour le vérifier :

```bash
npm run ui:tour -- --port 3501 --out C:/tmp-a
npm run ui:tour -- --port 3501 --out C:/tmp-b
npm run ui:tour -- --compare C:/tmp-a C:/tmp-b
```

La comparaison écrit « identiques, hors date et durées » pour chaque format.

## Comparer deux dossiers (avant / après ta tâche)

```bash
npm run ui:tour -- --port <ton port> --out <avant>     # sur le commit de départ (ou la référence de l'étape)
# ... ton travail, puis npm run build
npm run ui:tour -- --port <ton port> --out <après>
npm run ui:tour -- --compare <avant> <après> [--out <dossier>]
```

La comparaison (`<après>/comparaison/` par défaut) contient :

- `comparaison.md` : pour chaque format, les totaux avant → après (cibles < 44 px, textes < 11 px, erreurs, défilement
  horizontal, temps d'ouverture), les écrans dont les mesures ont changé, les nouvelles erreurs ; puis, pour chaque
  capture, la part de pixels changés ;
- `diff/<capture>.png` : les pixels changés en rouge sur l'image « après » assombrie.

Pour la PR : joins les captures « après » (au moins celles qui changent) et explique chaque écart : un changement
voulu, ou une régression corrigée. Le nombre de cibles < 44 px et de textes < 11 px ne doit pas augmenter.

Pour regarder deux captures côte à côte, ouvre-les dans deux onglets ; l'image `diff/` montre où chercher.

## La référence de l'étape R

`reference/` contient les rapports du commit de départ de l'étape (`refonte/etape-R` + repères `data-ui`, sans
changement visible) : `rapport-<format>.json` et `rapport.md`. Les captures n'y sont pas (elles montrent les visuels
des cartes, qui ne vont pas dans le dépôt) : pour comparer des images, refais un dossier « avant » sur le commit de
départ de ta tâche. Les rapports, eux, se comparent directement :

```bash
npm run ui:tour -- --compare scripts/ui/reference <après>
```

(la partie « Captures » de la comparaison est alors vide).

## Les repères `data-ui`

Convention `data-ui="<écran>.<élément>"` (`01-contrats.md`, § 14.4). On ne les renomme pas sans mettre à jour
`tour.mjs`. Repères utilisés par les parcours :

| Écran | Repères |
|---|---|
| départ (`home`) | `home`, `home.history`, `home.decks`, `home.help`, `home.settings`, `home.adventure`, `home.online`, `home.online-resume`, `home.level-<1..4>`, `home.first-<random\|me\|ai>`, `home.start` ; tuiles `deck.tile-<id du deck>`, `deck.random`, `deck.guide` |
| plateau (`table`) | `table`, `table.zone-me`, `table.zone-opp`, `table.leader`, `table.hand`, `table.opp-hand`, `table.card` (toute carte), `table.don`, `table.pile`, `table.undo`, `table.sound`, `table.panel`, `table.panel-close`, `table.settings`, `table.guide`, `table.help`, `table.leave`, `table.tab-<journal\|coach\|choix>`, `table.end-turn`, `table.option-<id de l'option>`, `table.hint`, `table.confirm-attack`, `table.cancel-target`, `table.intro`, `table.celebration` ; « Quitter la partie ? » : `leave`, `leave.yes`, `leave.no` ; en ligne (même plateau, contrôleur commun `game/ui/table/`, R2.1) : `table.sending` (choix envoyé, réponse attendue), `table.reopen-end` (rouvrir la fin de partie), `leave.resign` (abandonner) |
| menu d'une carte | `menu`, `menu.<play\|event\|act\|don\|attack\|block\|counter\|cevent\|choose>`, `menu.close` |
| fenêtres du plateau | `mulligan.keep`, `mulligan.redraw`, `picker.choose`, `picker.option-<id>`, `trigger.activate`, `trigger.hand`, `cost.option`, `confirm-end.ok`, `confirm-end.cancel`, `confirm-end.never`, `trash.close`, `help.close`, `zoom.close`, fin d'une partie d'aventure `end`, `end.next`, `end.board` |
| aventure | `adventure.welcome`, `adventure.sail`, `adventure.map`, `adventure.back`, `adventure.settings`, `adventure.boosters`, `adventure.hold`, `adventure.deck`, `adventure.shop`, `adventure.go`, `adventure.summary` ; `chapter`, `chapter.back`, `chapter.bubble`, `chapter.skip`, `chapter.next`, `chapter.deck`, `chapter.fight`, `chapter.resume`, `chapter.count` ; `hold`, `hold.back` ; `adventure-deck`, `adventure-deck.back` ; `shop`, `shop.back` |
| decks | `decks`, `decks.close`, `decks.new`, `decks.import`, `decks.edit`, `leaders`, `leaders.item`, `leaders.close`, `editor`, `editor.back`, `editor.pane-<…>` |
| parties | `history` (fenêtre du kit, fermée par son `dialog.close`), `history.tab-<progress\|axes\|games>`, `history.mode-<all\|solo\|aventure\|online>` |
| réglages (`SettingsPanel`, R1.3) | `settings.panel`, `settings.sound`, `settings.scale`, `settings.motion`, `settings.speed`, `settings.confirm-end`, `settings.coach`, `settings.zoom`, `settings.help`, `settings.done` ; fenêtres du kit : `dialog.close`, `dialog.reduce`, `dialog.reopen` |
| salon | `lobby`, `lobby.tab-create`, `lobby.tab-join`, `lobby.code`, `lobby.back`, `lobby.go` |
| atelier | `atelier.board` (page « plateau », avec `data-state="<état>"` ; prête quand elle contient `.game`) |
| chargement | `game.loading` |

Un nouvel écran ou un écran refait garde ces repères (ou met `tour.mjs` à jour dans la même PR). Pour ajouter un
écran au parcours : un `data-ui` sur ce qu'on touche, une entrée dans `SCREENS` (numéro suivant), et quelques lignes
dans le parcours qui l'ouvre.

## Fichiers

- `tour.mjs` : options, serveur d'essai, compte de test, parcours, rapports ;
- `cdp.mjs` : le pilote de Chrome (lancement, onglet isolé, formats, clics et touchers, captures, erreurs) ;
- `mesures.mjs` : les mesures d'un écran, exécutées dans la page ;
- `compare.mjs` et `png.mjs` : la comparaison de deux dossiers (lecture et écriture PNG sans dépendance).
