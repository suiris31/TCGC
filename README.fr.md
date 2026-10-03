# Ma Collection One Piece (TCGC)

[English](README.md) · **Français**

Appli pour gérer une collection de cartes **One Piece Card Game** : scan par la caméra du téléphone,
inventaire par set, cartes VF et VO, et estimation de la valeur en euros. Elle tourne sur ton PC et
s'utilise depuis le téléphone via le réseau local (Wi-Fi). Gratuite, sans compte, sans service payant :
la reconnaissance des cartes tourne en local.

L'interface existe en **français et en anglais** : elle suit la langue du téléphone et se change dans l'onglet
Stats.

> Projet communautaire non officiel, sans lien avec Bandai, TCGplayer ou Cardmarket.
> One Piece Card Game est une marque de Bandai.

## Démarrer

Prérequis : [Node.js](https://nodejs.org) 22.13 ou plus récent.

Double-clic sur `start.bat`, ou :

```bash
npm install
npm run build
npm start
```

Le terminal affiche l'adresse à ouvrir sur le téléphone, par exemple `http://192.168.1.42:3000`.
Le téléphone doit être sur le même Wi-Fi que le PC. Au premier lancement, Windows demande d'autoriser
Node.js sur le pare-feu : coche **Réseaux privés**.

Le premier démarrage prend une dizaine de minutes, le temps de :
1. télécharger le catalogue et les prix (environ 7 000 cartes, quelques secondes) ;
2. télécharger les visuels des cartes (~150 Mo de visuels VO et ~90 Mo de visuels VF dans `data/`) ;
3. télécharger le modèle de vision (~90 Mo) et analyser chaque visuel pour la reconnaissance.

Les fois suivantes, c'est immédiat. Les prix se mettent à jour tout seuls une fois par jour.

## Caméra en direct sur Android

Chrome n'autorise la caméra en direct que sur une adresse sécurisée (https ou localhost). Sans réglage, le
scan marche quand même en passant par l'appli appareil photo. Pour avoir la visée en direct et pouvoir
installer l'appli sur l'écran d'accueil :

1. Dans Chrome sur le téléphone, ouvre `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Passe le réglage sur **Enabled** et saisis l'adresse de l'appli (ex. `http://192.168.1.42:3000`)
3. Appuie sur **Relaunch**
4. Ouvre l'appli, puis menu ⋮ ▸ **Installer l'application**

Astuce : donne une IP fixe au PC dans ta box (bail DHCP statique) pour que l'adresse ne change pas.

## Collection

- **Par set** : chaque extension avec sa carte la plus chère en illustration, le nombre de cartes
  possédées sur le total (toutes versions : normale, parallèle, manga...), la progression et la valeur.
  « Tous les sets » affiche aussi ceux dont tu n'as encore rien.
- **Un set** : toutes ses cartes, en couleur si tu les as, grisées sinon (interrupteur « Cartes manquantes »
  pour les masquer). Le bouton + ajoute directement une carte manquante.
- **Toutes mes cartes** : tous les exemplaires, triables par valeur, numéro, set, couleur, rareté, nom ou
  date d'ajout, et filtrables par set, couleur et langue.

## Langues (VF / VO)

Chaque exemplaire de la collection a une langue : une même carte peut être possédée en français et en
anglais, avec une quantité pour chacune. Une carte française s'affiche avec son nom et son visuel VF,
une carte anglaise avec ceux de la VO.

- **Scanner** et **Catalogue** : sélecteur FR / EN, français par défaut. La dernière langue choisie est
  retenue (sur chaque téléphone).
- **Fiche d'une carte** : bascule FR / EN de l'affichage, et une quantité par langue.
- Le prix ne dépend pas de la langue (Cardmarket ne sépare pas les langues dans ses prix publics).

## Bien scanner

- **Caméra en direct (cadre de visée)** : le mode le plus fiable. Aligne la carte sur le cadre, bien à plat.
- **Photo** (sans le réglage ci-dessus) : la carte doit être au centre et occuper au moins la moitié de la photo.
- Évite les reflets (pochettes brillantes, lampe juste au-dessus).
- Choisis la **langue** de la carte scannée (FR / EN, français par défaut, la dernière choisie est retenue) et
  le **nombre d'exemplaires** avant de l'ajouter.
- Carte non reconnue ? Tape son code (`OP14-018`, `op1418`...) ou son nom.
- Quand plusieurs versions ont **exactement le même visuel** (réimpression, version tournoi tamponnée...),
  l'appli les liste avec leur prix : vérifie le code d'extension ou le tampon sur ta carte. Par défaut elle
  propose la version standard, la plus courante.

Mesures sur des photos simulées (inclinaison, reflet, flou, fond) : la bonne carte arrive en premier dans
~99 % des cas avec le cadre de visée, ~94 % en mode photo, et figure presque toujours dans les propositions.

## Comment ça marche

| Partie | Source / technique |
|---|---|
| Catalogue (cartes, variantes, visuels) | TCGplayer, via le miroir public quotidien [tcgcsv.com](https://tcgcsv.com) |
| Cartes VF | Liste officielle française [fr.onepiece-cardgame.com](https://fr.onepiece-cardgame.com/cardlist/) : noms français et visuels VF (actualisés chaque semaine) |
| Prix (par défaut) | **Cardmarket**, tendance des prix en € (fichiers publics quotidiens). C'est le marché de référence en Europe, mais il ne sépare pas les langues : VF et VO sont mélangées. |
| Prix (secours ou au choix) | « Market price » TCGplayer (moyenne des ventes aux USA, cartes anglaises), converti en € au taux BCE du jour |
| Reconnaissance | Modèle de vision DINOv2 exécuté en local (aucun service payant) : chaque visuel (VO TCGplayer + VF officiel) est transformé en vecteur, la photo est comparée à tous ces vecteurs. La bande où les visuels officiels portent le filigrane « SAMPLE » est floutée des deux côtés, sinon les vraies cartes (sans filigrane) sont mal reconnues. |
| Stockage | SQLite (`data/tcgc.db`), intégré à Node.js |

La source de prix se choisit dans l'onglet Stats ; si elle n'a pas de prix pour une carte, l'autre prend le relais.

Les fichiers publics de Cardmarket ne disent ni la variante (normale, parallèle, manga...) ni la langue de
chaque produit. L'appli les rattache au catalogue (voir `server/cardmarket.js`) : les extensions japonaises
sont repérées grâce aux noms des produits scellés (« Non-English », « Asia Region Legal »), puis les variantes
sont appariées par ordre d'ajout en vérifiant que les prix des deux marchés restent cohérents. Environ 85 %
des cartes ont un prix Cardmarket ; les autres (surtout des promos) restent sur TCGplayer.

## Développement

```bash
npm run dev            # serveur (port 3000) + interface Vite avec rechargement (port 5173)
npm run sync           # forcer la mise à jour du catalogue et des prix
npm run index-images   # compléter l'index de reconnaissance (ajoute -- --rebuild pour tout recalculer)
```

- `server/` : API Express, synchro des données, reconnaissance d'image
- `web/` : interface React (PWA)
- `data/` : base, visuels, modèle et index (non versionné, recréé automatiquement)

Ta collection est uniquement dans `data/tcgc.db` : sauvegarde ce fichier (ou utilise l'export CSV dans
l'onglet Stats).

## Contribuer

Les suggestions et pull requests sont les bienvenues : ouvre une issue pour discuter d'une idée ou d'un bug,
ou propose directement une modification.

```bash
npm install
npm run dev                 # serveur + interface avec rechargement automatique
npx tsc -p tsconfig.json    # vérification des types de l'interface
```

Le code et les commentaires sont en français. Les textes de l'interface sont dans `web/src/i18n.ts` (français et
anglais) : ajouter une langue y est une contribution bienvenue.

## Licence

[MIT](LICENSE). Les données (catalogue, prix, visuels) ne font pas partie du dépôt : elles sont téléchargées
par l'appli depuis leurs sources publiques et restent soumises aux conditions de ces sources.
