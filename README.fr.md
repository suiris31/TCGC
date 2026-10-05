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

## Comptes

Chaque personne crée un compte (pseudo, e-mail, mot de passe) et a sa propre collection, privée. L'onglet
**Profil** affiche le compte, permet de changer la langue de l'interface, de se déconnecter et de **supprimer le
compte** : tout ce qui s'y rattache (collection, historique de valeur, sessions) est alors définitivement effacé,
après confirmation par mot de passe.

Si tu utilisais l'appli avant l'arrivée des comptes, **le premier compte créé récupère ta collection existante**.

### L'héberger en ligne

Des fichiers prêts à l'emploi sont dans [`deploy/`](deploy) : un service systemd (`tcgc.service`), un bloc nginx
pour servir l'appli dans un sous-dossier comme `https://exemple.fr/tcgc/` (`nginx-tcgc.conf`), une sauvegarde
quotidienne de la base (`tcgc.cron`, `npm run backup`) et un script de mise à jour (`update.sh`). Variables
d'environnement : `HOST` (`127.0.0.1` derrière un proxy), `PORT`, `PUBLIC_PATH` (ex. `/tcgc` pour un
sous-dossier), `TRUST_PROXY`.

- Place l'appli derrière un proxy **HTTPS** (Caddy, nginx...). Les cookies de session sont alors marqués `Secure`.
- Si le proxy est sur une autre machine, renseigne `TRUST_PROXY` (ex. `TRUST_PROXY=1`) pour que l'appli voie la
  vraie adresse IP et le protocole du visiteur. La valeur par défaut (`loopback`) convient à un proxy sur la même
  machine.
- Mots de passe hachés avec scrypt ; sessions = jetons aléatoires dans un cookie HttpOnly (seul leur hachage est
  stocké) ; tentatives de connexion et d'inscription limitées ; requêtes venant d'autres sites refusées.
- Pas encore disponible : vérification de l'adresse e-mail et réinitialisation du mot de passe par e-mail.
- Le catalogue et les prix sont communs à tous les comptes ; la mise à jour manuelle des prix est limitée à une
  fois par heure, et chaque compte peut scanner jusqu'à 60 cartes par minute.

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
- **Un set** : toutes ses cartes, en couleur si tu les as, grisées sinon (choix Toutes / Possédées /
  Manquantes). Le bouton + ajoute directement une carte manquante. En haut, le coût pour compléter le set
  (« Il te manque 23 cartes, ≈ 87 € au total », et sans les 3 plus chères) et un bouton pour ajouter toutes
  les manquantes à tes recherches.
- **Mes cartes** : tous les exemplaires, triables par valeur, numéro, set, couleur, rareté, nom ou
  date d'ajout, et filtrables par set, couleur et langue.
- **Doubles** : les exemplaires en plus de ceux que tu gardes (1 par carte et par langue pour une collection,
  jusqu'à 4 pour jouer), avec leur valeur : ta monnaie d'échange. Une hausse ou une baisse en cours est signalée.
- **Partager** (dans Doubles) : un lien secret à envoyer à un ami. Sans créer de compte, il voit tes doubles (ou
  toute ta collection, au choix) et tes recherches, coche les cartes qui l'intéressent et celles qu'il a parmi
  tes recherches, puis t'envoie sa sélection par le menu de partage du téléphone (WhatsApp, SMS...). Rien ne
  passe par le serveur. Tu choisis d'afficher ou non les prix ; ton e-mail et tes prix cibles n'apparaissent
  jamais. « Changer le lien » rend l'ancien inutilisable, « Désactiver » supprime la page.
- **Recherches** : les cartes que tu veux, chacune avec un **prix cible** (le prix maximum que tu veux
  payer, à reporter dans ta liste de souhaits Cardmarket). En haut, les cartes passées sous leur prix cible
  (pastille verte sur l'onglet Collection), puis les **bonnes affaires** parmi les cartes qui te manquent dans
  tes sets : au moins 10 % sous leur moyenne du mois, à un niveau confirmé sur la semaine. Une carte ajoutée
  à la collection dans la langue recherchée sort des recherches.

## Bon moment pour acheter ?

La fiche de chaque carte indique où en est son prix, à partir des prix Cardmarket (tendance, moyennes 7 et
30 jours), de l'historique enregistré chaque jour par l'appli et de la date de sortie du set
(`server/insight.js`) :

| Badge | Quand | Conseil |
|---|---|---|
| Patiente | set de moins de 5 mois dont le prix baisse encore | les cartes dans ce cas sont le plus souvent nettement moins chères 2 mois plus tard |
| Nouveauté | set sorti il y a moins de 8 semaines | les prix bougent beaucoup, rien ne presse |
| En hausse | +15 % ou plus récemment | le prix bouge vite, comparer les annonces |
| En baisse | −10 % ou plus et la baisse continue, ou chute brutale | rien ne presse |
| Bon prix | au moins 10 % sous la moyenne du mois, niveau confirmé sur la semaine | bon moment si on la veut |
| Prix stable / Petit prix | sinon / moins d'1 € | |

Ce sont des indications, pas des prédictions : les prix Cardmarket mélangent toutes les langues et tous les
états. Le prix cible proposé est environ 10 % sous les prix récents (20 % quand le prix baisse ou que le set
est récent) ; c'est toi qui le fixes.

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
| Historique des prix | Chaque jour, tous les champs du guide Cardmarket (tendance, moyennes 1, 7 et 30 jours, moyenne, prix le plus bas) et les prix TCGplayer (market, low, mid) : Cardmarket ne publie que les prix du jour |
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
