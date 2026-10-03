// Traductions de l'interface (français / anglais).
// Une entrée est un texte, ou une paire [singulier, pluriel] choisie selon la variable `n`.
// Les variables s'écrivent {nom} dans le texte : t('scan.noMatch', { q: 'OP14' }).

export type UiLang = 'fr' | 'en';
type Entry = string | readonly [string, string];

const fr = {
  'app.name': 'Ma Collection',
  'app.valueTitle': 'Valeur estimée de la collection',
  'tab.collection': 'Collection',
  'tab.scan': 'Scanner',
  'tab.catalog': 'Catalogue',
  'tab.stats': 'Stats',

  'common.loadMore': 'Voir plus',
  'common.sort': 'Trier',
  'common.clear': 'Effacer',
  'common.close': 'Fermer',
  'common.standard': 'Standard',
  'word.card': ['carte', 'cartes'],
  'word.distinct': ['différente', 'différentes'],
  'count.cards': ['{n} carte', '{n} cartes'],
  'count.copies': ['{n} exemplaire', '{n} exemplaires'],
  'count.entries': ['{n} exemplaire différent', '{n} exemplaires différents'],

  'lang.label': 'Langue',
  'lang.fr': 'Français',
  'lang.en': 'Anglais',
  'lang.all': 'Toutes langues',

  'error.http': 'Erreur {n}',
  'error.unknown_card': 'Carte inconnue',
  'error.invalid_quantity': 'Quantité invalide',
  'error.invalid_lang': 'Langue invalide',
  'error.no_image': 'Aucune image reçue',
  'error.index_building': 'La reconnaissance est en cours de préparation ({indexed}/{total})',
  'error.server': 'Erreur interne du serveur',

  'filter.allSets': 'Toutes les extensions',
  'filter.color': 'Couleur',
  'filter.rarity': 'Rareté',
  'color.Red': 'Rouge',
  'color.Green': 'Vert',
  'color.Blue': 'Bleu',
  'color.Purple': 'Violet',
  'color.Black': 'Noir',
  'color.Yellow': 'Jaune',

  'sort.number': 'Par numéro',
  'sort.code': 'Par code',
  'sort.price': 'Plus chères',
  'sort.priceAsc': 'Moins chères',
  'sort.set': 'Par set',
  'sort.color': 'Par couleur',
  'sort.rarity': 'Par rareté',
  'sort.name': 'Par nom',
  'sort.added': 'Derniers ajouts',
  'sort.recent': 'Plus récentes',

  'collection.empty.title': 'Ta collection est vide',
  'collection.empty.text': "Scanne tes cartes avec l'appareil photo ou cherche-les dans le catalogue.",
  'collection.empty.scan': 'Scanner une carte',
  'collection.empty.browse': 'Parcourir le catalogue',
  'collection.view.sets': 'Par set',
  'collection.view.cards': 'Toutes mes cartes',
  'collection.search': 'Chercher dans ma collection',
  'sets.sort': 'Trier les sets',
  'sets.sort.recent': 'Plus récents',
  'sets.sort.code': 'Par code',
  'sets.sort.value': 'Plus de valeur',
  'sets.sort.progress': 'Plus complets',
  'sets.showAll': 'Tous les sets',
  'set.back': 'Sets',
  'set.ofTotal': ' / {total} cartes',
  'set.showMissing': 'Cartes manquantes',
  'set.empty': 'Aucune carte de ce set dans ta collection.',

  'catalog.search': 'Nom, code (OP01-001), équipage...',
  'catalog.addLang': 'Langue des cartes ajoutées',
  'catalog.searching': 'Recherche...',

  'card.added': '{name} ajoutée en {lang} (×{n})',
  'card.addAria': 'Ajouter {name} en {lang}',

  'chart.empty': "L'historique se construit jour après jour, à chaque mise à jour des prix.",
  'chart.aria': 'Évolution de la valeur',

  'price.cm.trend': 'Tendance Cardmarket (Europe)',
  'price.cm.avg30': 'Cardmarket : moyenne des ventes sur 30 jours',
  'price.cm.avg7': 'Cardmarket : moyenne des ventes sur 7 jours',
  'price.tcg.market': 'TCGplayer (USA) : moyenne des ventes récentes',
  'price.tcg.low': 'TCGplayer (USA) : pas de vente récente, annonce la moins chère',
  'price.tcg.mid': 'TCGplayer (USA) : pas de vente récente, prix médian des annonces',
  'price.none': 'Aucun prix connu',
  'price.line.cmTrend': 'Cardmarket tendance',
  'price.line.cmAvg30': 'Cardmarket moyenne 30 j',
  'price.line.tcg': 'TCGplayer (USA)',
  'price.mixedLangs': 'Cardmarket ne distingue pas les langues : sa tendance mélange VF et VO.',

  'detail.displayLang': "Langue d'affichage",
  'detail.noFrImage': 'Visuel VF indisponible, visuel anglais affiché',
  'detail.inCollection': 'Dans ma collection',
  'detail.removeCopy': 'Retirer un exemplaire {lang}',
  'detail.addCopy': 'Ajouter un exemplaire {lang}',
  'detail.removed': 'Exemplaire {lang} retiré de la collection',
  'detail.total': 'Total : {value}',
  'detail.priceHistory': 'Évolution du prix',
  'detail.otherVersions': 'Autres versions de {code}',
  'detail.characteristics': 'Caractéristiques',
  'stat.rarity': 'Rareté',
  'stat.type': 'Type',
  'stat.color': 'Couleur',
  'stat.cost': 'Coût',
  'stat.power': 'Puissance',
  'stat.counter': 'Counter',
  'stat.life': 'Vie',
  'stat.attribute': 'Attribut',

  'stats.unpriced': '{n} sans prix',
  'stats.top': 'Mes cartes les plus chères',
  'stats.bySet': 'Valeur par extension',
  'stats.uiLang': "Langue de l'interface",
  'stats.priceSource': 'Source des prix',
  'stats.source.cm': 'Cardmarket (Europe)',
  'stats.source.tcg': 'TCGplayer (USA)',
  'stats.source.cmHelp': 'Tendance des prix sur Cardmarket, le marché de référence en Europe. Cardmarket ne sépare pas les langues : VF et VO sont mélangées.',
  'stats.source.tcgHelp': 'Prix des cartes anglaises aux États-Unis (moyenne des ventes), convertis en euros au taux BCE du jour.',
  'stats.source.fallback': "Si la source choisie n'a pas de prix pour une carte, l'autre prend le relais.",
  'stats.data': 'Données',
  'stats.cmDate': 'Prix Cardmarket du',
  'stats.tcgDate': 'Prix TCGplayer du',
  'stats.rate': 'Taux BCE',
  'stats.lastSync': 'Dernière synchro',
  'stats.recognition': 'Reconnaissance',
  'stats.recognitionValue': '{indexed} / {total} cartes',
  'stats.inProgress': ' (en cours)',
  'stats.lastError': 'Dernière erreur : {error}',
  'stats.update': 'Mettre à jour les prix',
  'stats.updating': 'Mise à jour...',
  'stats.updateStarted': 'Mise à jour des prix lancée',
  'stats.export': 'Exporter (CSV)',

  'cam.title': 'Caméra en direct sur Android',
  'cam.intro': "Chrome n'autorise la caméra en direct (et l'installation comme appli) que sur une adresse sécurisée. Comme l'appli tourne sur ton PC en http://, il faut déclarer cette adresse comme sûre, une seule fois :",
  'cam.step1': 'Dans Chrome sur le téléphone, ouvre',
  'cam.step2a': 'Mets le réglage sur',
  'cam.step2b': 'et écris dans le champ :',
  'cam.step3a': 'Appuie sur',
  'cam.step3b': "en bas de l'écran",
  'cam.step4a': "Reviens ici : l'onglet Scanner affiche la caméra. Menu ⋮ ▸",
  'cam.install': "Installer l'application",
  'cam.step4b': "pour l'avoir sur l'écran d'accueil.",
  'cam.note': "Sans ça, le scan marche quand même : il passe par l'appareil photo du téléphone.",

  'scan.insecure': 'Le navigateur bloque la caméra en direct sur une adresse http:// locale.',
  'scan.insecureHelp': "Tu peux quand même scanner avec l'appareil photo ci-dessous. Pour avoir la visée en direct, voir le guide dans l'onglet Stats ▸ « Caméra en direct ».",
  'scan.denied': 'Accès à la caméra refusé. Autorise-le dans les réglages du site, ou prends une photo.',
  'scan.noCamera': 'Aucune caméra détectée sur cet appareil.',
  'scan.cameraError': 'Caméra indisponible ({error}).',
  'scan.tip': 'Cadre la carte bien à plat, en grand, sans reflet.',
  'scan.hint': 'Place la carte dans le cadre',
  'scan.langAria': 'Langue des cartes scannées',
  'scan.previewAlt': 'Photo analysée',
  'scan.analyzing': 'Analyse...',
  'scan.sessionCards': ['carte ajoutée', 'cartes ajoutées'],
  'scan.undo': 'Annuler « {what} »',
  'scan.takePhoto': 'Prendre une photo',
  'scan.shutter': 'Scanner',
  'scan.torch': 'Lampe',
  'scan.manualLink': 'Saisir un code à la main',
  'scan.preparing': 'Préparation de la reconnaissance : {indexed}/{total} cartes analysées',
  'scan.manualIntro': 'Ajoute une carte à partir de son code.',
  'scan.backToScan': 'Retour au scan',
  'scan.alreadyOwned': 'Déjà dans ta collection : {list}',
  'scan.unsure': 'Pas sûr de moi : vérifie dans les propositions',
  'scan.cardLang': 'Langue de la carte',
  'scan.copies': 'Exemplaires',
  'scan.lessAria': 'Un exemplaire de moins',
  'scan.moreAria': 'Un exemplaire de plus',
  'scan.qtyAria': "Nombre d'exemplaires",
  'scan.rescan': 'Rescanner',
  'scan.add': 'Ajouter',
  'scan.addN': 'Ajouter ×{n}',
  'scan.twins': "{n} versions ont ce visuel : vérifie l'extension ou le tampon sur ta carte",
  'scan.results': ['{n} résultat pour « {q} »', '{n} résultats pour « {q} »'],
  'scan.allSuggestions': 'Toutes les propositions',
  'scan.notRight': 'Pas la bonne carte ?',
  'scan.less': 'Moins',
  'scan.seeAll': 'Tout voir',
  'scan.stillNot': 'Toujours pas ? ',
  'scan.manualLabel': 'Tape le code imprimé en bas à droite de la carte (ou son nom)',
  'scan.search': 'Chercher',
  'scan.noMatch': 'Aucune carte trouvée pour « {q} »',
  'scan.added': ['{name} ajoutée en {lang}', '{n} × {name} ajoutées en {lang}'],
  'scan.addedTotal': '{what} (×{n} au total)',
  'scan.undone': 'Ajout annulé',
} as const satisfies Record<string, Entry>;

export type MessageKey = keyof typeof fr;

const en: { [K in MessageKey]: Entry } = {
  'app.name': 'My Collection',
  'app.valueTitle': 'Estimated collection value',
  'tab.collection': 'Collection',
  'tab.scan': 'Scan',
  'tab.catalog': 'Catalog',
  'tab.stats': 'Stats',

  'common.loadMore': 'Show more',
  'common.sort': 'Sort',
  'common.clear': 'Clear',
  'common.close': 'Close',
  'common.standard': 'Standard',
  'word.card': ['card', 'cards'],
  'word.distinct': ['unique', 'unique'],
  'count.cards': ['{n} card', '{n} cards'],
  'count.copies': ['{n} copy', '{n} copies'],
  'count.entries': ['{n} different card', '{n} different cards'],

  'lang.label': 'Language',
  'lang.fr': 'French',
  'lang.en': 'English',
  'lang.all': 'All languages',

  'error.http': 'Error {n}',
  'error.unknown_card': 'Unknown card',
  'error.invalid_quantity': 'Invalid quantity',
  'error.invalid_lang': 'Invalid language',
  'error.no_image': 'No image received',
  'error.index_building': 'Card recognition is still being prepared ({indexed}/{total})',
  'error.server': 'Internal server error',

  'filter.allSets': 'All sets',
  'filter.color': 'Color',
  'filter.rarity': 'Rarity',
  'color.Red': 'Red',
  'color.Green': 'Green',
  'color.Blue': 'Blue',
  'color.Purple': 'Purple',
  'color.Black': 'Black',
  'color.Yellow': 'Yellow',

  'sort.number': 'By number',
  'sort.code': 'By code',
  'sort.price': 'Most valuable',
  'sort.priceAsc': 'Least valuable',
  'sort.set': 'By set',
  'sort.color': 'By color',
  'sort.rarity': 'By rarity',
  'sort.name': 'By name',
  'sort.added': 'Recently added',
  'sort.recent': 'Newest',

  'collection.empty.title': 'Your collection is empty',
  'collection.empty.text': 'Scan your cards with the camera or look them up in the catalog.',
  'collection.empty.scan': 'Scan a card',
  'collection.empty.browse': 'Browse the catalog',
  'collection.view.sets': 'By set',
  'collection.view.cards': 'All my cards',
  'collection.search': 'Search my collection',
  'sets.sort': 'Sort sets',
  'sets.sort.recent': 'Newest',
  'sets.sort.code': 'By code',
  'sets.sort.value': 'Most valuable',
  'sets.sort.progress': 'Most complete',
  'sets.showAll': 'All sets',
  'set.back': 'Sets',
  'set.ofTotal': ' / {total} cards',
  'set.showMissing': 'Missing cards',
  'set.empty': 'No cards from this set in your collection.',

  'catalog.search': 'Name, code (OP01-001), crew...',
  'catalog.addLang': 'Language of added cards',
  'catalog.searching': 'Searching...',

  'card.added': '{name} added in {lang} (×{n})',
  'card.addAria': 'Add {name} in {lang}',

  'chart.empty': 'The history builds up day by day, with each price update.',
  'chart.aria': 'Value over time',

  'price.cm.trend': 'Cardmarket price trend (Europe)',
  'price.cm.avg30': 'Cardmarket: 30-day average sale price',
  'price.cm.avg7': 'Cardmarket: 7-day average sale price',
  'price.tcg.market': 'TCGplayer (USA): average of recent sales',
  'price.tcg.low': 'TCGplayer (USA): no recent sale, lowest listing',
  'price.tcg.mid': 'TCGplayer (USA): no recent sale, median listing price',
  'price.none': 'No known price',
  'price.line.cmTrend': 'Cardmarket trend',
  'price.line.cmAvg30': 'Cardmarket 30-day average',
  'price.line.tcg': 'TCGplayer (USA)',
  'price.mixedLangs': "Cardmarket doesn't separate languages: its trend mixes French and English printings.",

  'detail.displayLang': 'Display language',
  'detail.noFrImage': 'No French artwork available, showing the English one',
  'detail.inCollection': 'In my collection',
  'detail.removeCopy': 'Remove one {lang} copy',
  'detail.addCopy': 'Add one {lang} copy',
  'detail.removed': '{lang} copy removed from the collection',
  'detail.total': 'Total: {value}',
  'detail.priceHistory': 'Price history',
  'detail.otherVersions': 'Other printings of {code}',
  'detail.characteristics': 'Details',
  'stat.rarity': 'Rarity',
  'stat.type': 'Type',
  'stat.color': 'Color',
  'stat.cost': 'Cost',
  'stat.power': 'Power',
  'stat.counter': 'Counter',
  'stat.life': 'Life',
  'stat.attribute': 'Attribute',

  'stats.unpriced': '{n} without a price',
  'stats.top': 'My most valuable cards',
  'stats.bySet': 'Value by set',
  'stats.uiLang': 'Interface language',
  'stats.priceSource': 'Price source',
  'stats.source.cm': 'Cardmarket (Europe)',
  'stats.source.tcg': 'TCGplayer (USA)',
  'stats.source.cmHelp': "Price trend on Cardmarket, the reference market in Europe. Cardmarket doesn't separate languages: French and English printings are mixed.",
  'stats.source.tcgHelp': 'Prices of English cards in the US (average sales), converted to euros at the daily ECB rate.',
  'stats.source.fallback': 'When the chosen source has no price for a card, the other one is used.',
  'stats.data': 'Data',
  'stats.cmDate': 'Cardmarket prices from',
  'stats.tcgDate': 'TCGplayer prices from',
  'stats.rate': 'ECB rate',
  'stats.lastSync': 'Last sync',
  'stats.recognition': 'Recognition',
  'stats.recognitionValue': '{indexed} / {total} cards',
  'stats.inProgress': ' (in progress)',
  'stats.lastError': 'Last error: {error}',
  'stats.update': 'Update prices',
  'stats.updating': 'Updating...',
  'stats.updateStarted': 'Price update started',
  'stats.export': 'Export (CSV)',

  'cam.title': 'Live camera on Android',
  'cam.intro': 'Chrome only allows the live camera (and installing the app) on a secure address. Since the app runs on your PC over http://, you need to mark this address as safe, once:',
  'cam.step1': 'In Chrome on your phone, open',
  'cam.step2a': 'Set it to',
  'cam.step2b': 'and enter in the field:',
  'cam.step3a': 'Tap',
  'cam.step3b': 'at the bottom of the screen',
  'cam.step4a': 'Come back here: the Scan tab now shows the camera. Menu ⋮ ▸',
  'cam.install': 'Install app',
  'cam.step4b': 'to add it to your home screen.',
  'cam.note': "Without it, scanning still works through your phone's camera app.",

  'scan.insecure': 'The browser blocks the live camera on a local http:// address.',
  'scan.insecureHelp': 'You can still scan with the camera button below. For the live viewfinder, see the guide in the Stats tab ▸ "Live camera".',
  'scan.denied': 'Camera access denied. Allow it in the site settings, or take a photo.',
  'scan.noCamera': 'No camera found on this device.',
  'scan.cameraError': 'Camera unavailable ({error}).',
  'scan.tip': 'Keep the card flat, filling the picture, without glare.',
  'scan.hint': 'Place the card in the frame',
  'scan.langAria': 'Language of scanned cards',
  'scan.previewAlt': 'Analyzed photo',
  'scan.analyzing': 'Analyzing...',
  'scan.sessionCards': ['card added', 'cards added'],
  'scan.undo': 'Undo "{what}"',
  'scan.takePhoto': 'Take a photo',
  'scan.shutter': 'Scan',
  'scan.torch': 'Flashlight',
  'scan.manualLink': 'Enter a code manually',
  'scan.preparing': 'Preparing recognition: {indexed}/{total} cards analyzed',
  'scan.manualIntro': 'Add a card from its code.',
  'scan.backToScan': 'Back to scanning',
  'scan.alreadyOwned': 'Already in your collection: {list}',
  'scan.unsure': 'Not sure: check the suggestions',
  'scan.cardLang': 'Card language',
  'scan.copies': 'Copies',
  'scan.lessAria': 'One copy less',
  'scan.moreAria': 'One more copy',
  'scan.qtyAria': 'Number of copies',
  'scan.rescan': 'Scan again',
  'scan.add': 'Add',
  'scan.addN': 'Add ×{n}',
  'scan.twins': '{n} printings share this artwork: check the set code or stamp on your card',
  'scan.results': ['{n} result for "{q}"', '{n} results for "{q}"'],
  'scan.allSuggestions': 'All suggestions',
  'scan.notRight': 'Wrong card?',
  'scan.less': 'Less',
  'scan.seeAll': 'See all',
  'scan.stillNot': 'Still not it? ',
  'scan.manualLabel': 'Type the code printed at the bottom right of the card (or its name)',
  'scan.search': 'Search',
  'scan.noMatch': 'No card found for "{q}"',
  'scan.added': ['{name} added in {lang}', '{n} × {name} added in {lang}'],
  'scan.addedTotal': '{what} (×{n} in total)',
  'scan.undone': 'Addition undone',
};

const MESSAGES: Record<UiLang, { [K in MessageKey]: Entry }> = { fr, en };
const STORAGE_KEY = 'tcgc.uiLang';

// Langue mémorisée, sinon celle du navigateur (français pour un téléphone en français, anglais sinon)
export function detectUiLang(): UiLang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch { /* stockage indisponible */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let current: UiLang = detectUiLang();
applyToDocument();

function applyToDocument() {
  document.documentElement.lang = current;
  document.title = current === 'fr' ? 'Ma Collection OP' : 'My OP Collection';
}

export function getUiLang() {
  return current;
}

export function setUiLang(lang: UiLang) {
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* stockage indisponible */ }
  applyToDocument();
}

// Locale des nombres, montants et dates
export function locale() {
  return current === 'fr' ? 'fr-FR' : 'en-GB';
}

export function hasMessage(key: string): key is MessageKey {
  return key in fr;
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}) {
  const entry = MESSAGES[current][key];
  let text: string;
  if (typeof entry === 'string') {
    text = entry;
  } else {
    const n = Number(vars.n ?? 0);
    // français : 0 et 1 au singulier ; anglais : seulement 1
    const singular = current === 'fr' ? n <= 1 : n === 1;
    text = singular ? entry[0] : entry[1];
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
