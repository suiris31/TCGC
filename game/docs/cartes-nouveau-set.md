# Intégrer un nouveau set

Marche à suivre quand Bandai sort une nouvelle extension (ou un deck de démarrage, ou des promos). Le but : chaque carte
du set **jouable avec une confiance élevée** (`verified`, `coded` ou `auto`), ou marquée `doubt` avec sa question. Les
règles de fond (niveaux de confiance, preuves, aucun texte de carte dans le dépôt) sont dans
`Plan-aventure/01-contrats.md` § 15 et `Plan-aventure/etape-C-toutes-les-cartes.md`.

## 1. Catalogue et ordre des sets

1. `npm run game:cards` télécharge le catalogue officiel. Si le nouveau set n'y est pas rangé à sa date, ajouter son
   code à `RELEASES` (`game/data/catalog.ts`, à la fin : le plus récent).
2. `npm test` signale un set du catalogue qui n'a pas de tâche (diagnostic de `recipes-contracts.test.ts`) : l'ajouter
   **en tête** de `TASKS` dans `game/engine/recipes/sets/ORDER.ts`, sans renuméroter les autres.

## 2. Traduire : `npm run cards:new -- <set>`

```
npm run cards:new -- EB06            un set (préfixe des numéros : EB06 pour EB06-001 ; « EB-06 » est accepté)
npm run cards:new -- EB06,ST37       plusieurs sets
npm run cards:new -- S1              les sets d'une tâche « set » (ORDER.ts)
npm run cards:new -- tout --essai    tout le catalogue, sans rien écrire (mesure du traducteur)
```

La commande :
- laisse de côté les cartes déjà jouables (codées à la main, ou seulement des mots-clés) et celles qui ont déjà une
  entrée dans le fichier du set (une relecture n'est jamais écrasée) ;
- **reprend les réimpressions** : une carte dont le texte anglais (effet et [Déclenchement], rappels de règle retirés)
  est celui d'une carte qui a déjà une recette reçoit la même recette, au même niveau, avec la note
  « réimpression de … » ; tant qu'elle n'est pas relue, elle suit sa source à chaque relance. Si la carte au même texte
  est codée à la main, le rapport le dit : reprendre son comportement dans `game/engine/cards/<set>.ts` ;
- traduit les autres (`recipes/parse/`) et écrit celles qui se traduisent sans reste dans
  `game/engine/recipes/sets/<set>.ts`, au niveau `generated`, une entrée par ligne, au-dessus du repère de fin ; crée le
  fichier et l'enregistre dans `recipes/sets/index.ts` s'il n'existe pas ;
- puis, dans un processus neuf qui charge les fichiers comme le jeu, vérifie chaque recette du set : compilation
  (C1.1), description et aller-retour avec le texte officiel (C1.2), tests générés (C1.3), et lance des parties au
  hasard avec les recettes du set (`cards:fuzz`, `--parties N`, 20 par défaut).

Options : `--essai` (rien n'est écrit), `--verifier` (rien n'est traduit : seulement vérifier et refaire le rapport, après
une relecture par exemple), `--regenerer` (retraduire les entrées encore `generated` restées sur une ligne, après un
progrès du traducteur ; jamais `verified` ni `doubt`), `--rapport f`, `--json f`.

## 3. Lire le rapport

À l'écran :
- **Bilan** par set : cartes, jouables, et combien à chaque niveau ; les vérifications pas encore disponibles.
- **À relire** : les recettes générées, celles dont une vérification échoue (avec le détail) et les **formulations à
  risque** (remplacement, valeur calculée, « When … », « If you do », annulation…) à confronter aux Q&A officielles.
- **Tournures inconnues** classées par nombre de cartes : une tournure qui revient vaut une règle du traducteur
  (`recipes/parse/<set>.ts`, remontée dans sa famille par le chef de projet) plutôt que du code à la main.
- **À coder à la main** : les cartes non comprises, regroupées quand plusieurs ont le même texte (à coder une fois).
- **Doutes** : les questions ouvertes.

Le **rapport complet** (chemin affiché à la fin, dans le dossier temporaire) met pour chaque carte le texte officiel
(VO et VF) à côté de la recette relue en phrase : c'est le support de la relecture. Il ne va jamais dans le dépôt.

## 4. Relire, coder, lever les doutes

Dans `game/engine/recipes/sets/<set>.ts` :
- une recette relue contre le texte (VO et VF), dont l'aller-retour, les tests et les parties au hasard passent, passe
  `level: 'verified'` à la main (on peut la remettre en forme sur plusieurs lignes : cards:new n'y touchera plus) ;
- une recette fausse se corrige à la main, ou devient du code : `{ kind: 'manual', reason: 'clé' }` dans la recette, et
  le code dans `MANUAL` de `game/engine/cards/<set>.ts` (une carte peut être à 90 % recette) ;
- une carte que le traducteur ne comprend pas se code à la main dans `game/engine/cards/<set>.ts` (style des fichiers
  existants, briques de `bricks.ts`), avec un test par effet, condition vraie et fausse
  (`game/tests/cards-<set>.test.ts`) ;
- une lecture douteuse (deux lectures raisonnables, deux jeux différents) : chercher la réponse officielle (règles
  complètes, Q&A par carte, errata : lus, jamais recopiés) ; si elle est claire, l'appliquer et la noter dans
  `game/docs/interpretations.md` ; sinon `level: 'doubt'` avec `doubt: { question, readings: [lecture 1, lecture 2] }`,
  écrits avec nos mots, et la question va à l'utilisateur.

Aucun texte de carte dans le dépôt : ni dans les recettes, ni dans les notes, ni dans les tests (`npm test` le vérifie).

## 5. Vérifier et conclure

```
npm run cards:new -- <set> --verifier      plus rien « à relire » ni « à coder à la main »
npm run game:coverage                      le set à 100 % (colonne « Jouables »), ou le reste en « Doutes »
npm run typecheck
npm test
npm run game:fingerprint -- 200 "" <référence>   0 partie différente pour les decks existants
```

`npm run game:coverage` donne aussi, par set et au total, le nombre de cartes à chaque niveau ; `-- --json f` pour le
suivi, `-- --traducteur` pour mesurer le traducteur sur tout ce qui n'est pas encore jouable (part traduite sans reste,
tournures inconnues par fréquence).
