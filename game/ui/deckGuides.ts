// Guides des decks : style, plan de jeu, combinaisons clés, main de départ, conseils. Écrits d'après le texte
// officiel des cartes ; les « leçons de l'IA » viennent de l'auto-apprentissage (game/docs/apprentissage.md).

export interface Combo {
  title: string;
  cards: string[];   // numéros des cartes concernées
  text: string;
}

export interface DeckGuide {
  styles: string[];       // étiquettes de style (Agressif, Contrôle...)
  summary: string;        // en une phrase
  plan: string[];         // déroulé d'une partie
  combos: Combo[];
  mulligan: string;
  strengths: string[];
  weaknesses: string[];
  aiLesson?: string;      // ce que l'auto-apprentissage a retenu pour ce deck
}

export const GUIDES: Record<string, DeckGuide> = {
  'ST-35': {
    styles: ['Montée en puissance', 'Protection', 'Rouge/Noir'],
    summary: 'Poser un Personnage de coût 8 pour réveiller le Leader Sabo (+1000 à toute l’équipe), protéger ses Personnages et rejouer gratuitement des petits Personnages depuis la main ou la Défausse.',
    plan: [
      'Tours 1 à 3 : développe-toi avec des Personnages bon marché (Inazuma, Belo Betty, Hack, Corbeau, Lindbergh). Avec 4 Vies ou plus, Sabo a −1000 : ne protège pas ta Vie à tout prix au début.',
      'Dès 4 DON!! : pose un « coût 8 » (Morley ou Sabo P-105 coûtent 4 mais valent 8 avec ton Leader) puis donne 1 DON!! à Sabo : ton Leader et tous tes Personnages gagnent +1000.',
      'Ensuite Kuma ou Koala (ST35-004) : chacun pose un deuxième Personnage gratuitement (4000 de puissance ou moins, depuis la main ou la Défausse).',
      'Fin de partie : Les flammes d’Ace et Lindbergh font de la place, Ivankov et Dragon protègent ton terrain contre les effets adverses.',
    ],
    combos: [
      { title: 'Le réveil de Sabo', cards: ['OP13-004', 'OP12-093', 'P-105'], text: 'Morley et Sabo (P-105) coûtent 4 mais comptent pour 8 avec un Leader {Armée révolutionnaire}. Pose l’un d’eux, donne 1 DON!! à Sabo : +1000 à ton Leader et à tous tes Personnages, tant que Sabo garde sa DON!! et que le coût 8 reste en jeu.' },
      { title: 'Deux Personnages pour le prix d’un', cards: ['ST35-005', 'ST35-004', 'ST35-001'], text: 'Kuma et Koala (ST35-004) donnent 1 DON!! à Sabo puis jouent gratuitement un {Armée révolutionnaire} de 4000 ou moins de ta main ou de ta Défausse. Hack est la meilleure cible : il met KO un Personnage adverse de 2000 de puissance de base ou moins. Kuma et Koala valent eux-mêmes 8 (réveil du Leader).' },
      { title: 'Remplir la Défausse', cards: ['OP12-090', 'ST35-003', 'ST35-005'], text: 'Belo Betty et Corbeau placent 2 cartes du deck dans ta Défausse en attaquant : autant de Personnages que Kuma et Koala pourront rejouer gratuitement.' },
      { title: 'Le mur révolutionnaire', cards: ['OP13-008', 'OP13-017'], text: 'Ivankov se sacrifie à la place d’un Personnage {Armée révolutionnaire} mis KO par un effet adverse ; Dragon, une fois par tour, prend −2000 à la place d’un Personnage qui allait quitter le terrain (KO, renvoi en main...).' },
      { title: 'Nettoyage', cards: ['ST35-002', 'OP13-019'], text: 'Lindbergh donne −3000 à un Personnage adverse ; Les flammes d’Ace (épuise 4 DON!! en plus de son coût) donnent encore −3000 puis mettent KO un Personnage de 3000 ou moins. Ensemble, ils abattent un Personnage de 9000.' },
      { title: 'Contres renforcés', cards: ['OP12-098', 'OP13-019'], text: 'Pointe dépilatoire : +2000, et +4000 si tu as un {Armée révolutionnaire} de coût 8 ou plus. Les flammes d’Ace en [Contre] : +3000 à ton Leader. Garde 1 ou 2 DON!! pour les payer pendant le tour adverse.' },
    ],
    mulligan: 'Garde une main avec un « coût 8 » à 4 DON!! (Morley, Sabo P-105) et un ou deux Personnages de coût 3-4. Repioche si tu n’as que des cartes chères (Dragon, Koala ST35-004).',
    strengths: ['Très solide en milieu de partie grâce au +1000 général', 'Beaucoup de protection contre les effets adverses', 'Rejoue ses Personnages depuis la Défausse'],
    weaknesses: ['Leader faible (4000) tant qu’il a 4 Vies ou plus', 'Dépend d’un Personnage de coût 8 pour son bonus', 'Peu de moyens de piocher'],
    aiLesson: 'L’IA a appris à n’attaquer qu’avec une vraie avance de puissance (environ +1500) pour ne pas se faire contrer facilement, et à épuiser en priorité les [Bloqueur] adverses.',
  },
  'ST-31': {
    styles: ['Agressif', 'DON!! sur les attaquants', 'Rouge'],
    summary: 'Mettre une pression constante sur le Leader adverse : beaucoup d’attaquants, des DON!! distribuées par le Leader Luffy, des malus de puissance pour passer les défenses.',
    plan: [
      'Tours 1 à 3 : pose des petits Personnages (Nami cherche une carte, Luffy ST23-004, Robin, Brook) et attaque dès que possible.',
      'Chaque tour : donne 1 DON!! au Leader pour activer son effet (2 DON!! épuisées à un Personnage), puis attaque avec tout le monde.',
      'Milieu de partie : Sanji et Jinbe piochent et jouent un autre Personnage gratuitement ; Zoro (OP14-015) attaque dès son arrivée.',
      'Finis avec Luffy (ST31-004) : 9000 de puissance, [Initiative] avec 3 DON!! données, et un gros malus sur un Personnage adverse.',
    ],
    combos: [
      { title: 'Le moteur du Leader', cards: ['ST21-001', 'ST31-003'], text: 'Donne 1 DON!! à Luffy (Leader) : son effet donne 2 DON!! épuisées à un Personnage (+2000 pour son attaque). Ces DON!! restent données pendant le tour adverse : avec 3 DON!! données au total, Brook devient [Bloqueur] avec +3000 (6000).' },
      { title: 'Le capitaine arrive', cards: ['ST31-004', 'ST21-001', 'ST31-005'], text: 'Avec 3 DON!! données sur ton terrain, Luffy (ST31-004) attaque dès qu’il est joué ; en entrant, il donne −1000 par carte {Équipage de Chapeau de paille} sur ton terrain à un Personnage adverse. Thousand Sunny (Lieu) compte aussi et donne une DON!! à un Luffy.' },
      { title: 'Renforts gratuits', cards: ['ST31-001', 'ST31-002', 'OP01-016'], text: 'Sanji pioche puis joue gratuitement un Personnage {Équipage de Chapeau de paille} de coût 5 ou moins ; Jinbe pioche puis joue une carte de coût 1 (Nami, Luffy ST23-004, Thousand Sunny). Deux cartes pour le prix d’une.' },
      { title: 'Passer les défenses', cards: ['OP11-009', 'OP14-015', 'ST23-004', 'OP13-021'], text: 'Robin ([DON!! x2]) : −2000 jusqu’à la fin du tour adverse ; Zoro : −1000 en attaquant ; Luffy ST23-004 : −1000 ; Gum Gum Rafale : −2000. Affaiblis un Personnage épuisé pour l’abattre, ou un attaquant adverse.' },
      { title: 'Punir les Contres', cards: ['OP11-012'], text: 'Pendant ton tour, quand l’adversaire joue un Événement (souvent un [Contre]), Franky donne +2000 à tous tes Personnages pour le reste du tour.' },
    ],
    mulligan: 'Garde des cartes de coût 1 à 3 (Nami, Luffy ST23-004, Robin, Brook) pour attaquer tôt. Ce deck aime presque toutes ses mains : l’IA a appris à garder sa main de départ.',
    strengths: ['Pression dès les premiers tours', 'Le Leader transforme chaque DON!! en +2000', 'Beaucoup de petits malus pour passer les Contres'],
    weaknesses: ['Peu de protection pour ses Personnages', 'S’essouffle si l’adversaire stabilise', 'Brook et Luffy ST31-004 demandent 3 DON!! données'],
    aiLesson: 'L’IA garde presque toujours sa main de départ et met surtout le paquet quand l’adversaire tombe à 2 Vies ou moins.',
  },
  'ST-32': {
    styles: ['Épuisement', 'Tempo', 'Double attaque', 'Vert'],
    summary: 'Épuiser les Personnages adverses pour neutraliser leurs [Bloqueur] et les rendre attaquables, puis frapper plusieurs fois avec le Leader Zoro.',
    plan: [
      'Tours 1 à 3 : Kinémon (pioche), Zoro ST32-005 et Koshiro ; épuise les petits Personnages adverses pour les abattre.',
      'Milieu de partie : Tashigi ou Kuina épuisent un Personnage adverse puis donnent 3 DON!! à ton Leader : il peut alors utiliser son effet.',
      'Le Leader Zoro attaque un Personnage épuisé, se redresse grâce à son effet, puis attaque le Leader adverse.',
      'Fin de partie (9 DON!! ou plus) : garde 3 DON!! pour « Luffy deviendra un jour le roi des pirates !! », qui redresse encore ton Leader : troisième attaque.',
    ],
    combos: [
      { title: 'La double attaque du Leader', cards: ['OP12-020', 'OP12-031', 'OP12-026'], text: 'Leader Zoro, [DON!! x3] : s’il a combattu un Personnage adverse ce tour, il se redresse. Tashigi et Kuina lui donnent justement 3 DON!! épuisées après avoir épuisé une cible. Attaque d’abord un Personnage épuisé, active l’effet, puis attaque le Leader (il ne peut plus viser les Personnages de coût de base 7 ou moins ce tour).' },
      { title: 'Troisième attaque', cards: ['OP12-039', 'OP12-020'], text: '« Luffy deviendra un jour le roi des pirates !! » (coût 3) redresse ton Leader Zoro : encore une attaque avec les mêmes DON!!. Garde 3 DON!! de côté en fin de partie.' },
      { title: 'Épuiser puis abattre', cards: ['OP12-031', 'ST32-004', 'OP15-036'], text: 'Seuls les Personnages épuisés peuvent être attaqués. Tashigi (coût de base 6 ou moins), Rayleigh (2 Personnages de coût 2 ou moins), Zoro ST32-005, X-Drake et Kuina épuisent, et Ryuma met KO un Personnage épuisé de coût 4 ou moins en entrant et en attaquant.' },
      { title: 'DON!! remboursées', cards: ['OP10-036', 'OP12-026', 'OP12-028'], text: 'Une fois par tour, quand un de tes effets épuise un Personnage (même Kuina ou Hiyori qui s’épuisent eux-mêmes), Perona redresse une DON!!.' },
      { title: 'Neutraliser un Bloqueur', cards: ['ST32-002'], text: 'Oden : le Personnage visé ne peut plus être épuisé jusqu’à la fin du prochain tour adverse : il ne peut ni attaquer ni bloquer.' },
      { title: 'Arrivées surprises', cards: ['ST32-003', 'ST32-004', 'ST32-005'], text: 'Mihawk joue gratuitement Perona ou un Personnage <Tranche> de coût 5 ou moins ; Rayleigh et Zoro ST32-005 ont [Initiative : Personnage] et peuvent attaquer un Personnage épuisé dès leur arrivée.' },
      { title: 'Protection <Tranche>', cards: ['OP12-027'], text: 'Koshiro s’épuise à la place d’un de tes Personnages <Tranche> de coût 5 ou moins mis KO par un effet adverse, et sert de [Bloqueur].' },
    ],
    mulligan: 'Garde Kinémon, Zoro ST32-005, Koshiro ou Hiyori pour les premiers tours, et une carte qui épuise (Tashigi, Rayleigh) pour la suite.',
    strengths: ['Neutralise les [Bloqueur] et les Personnages adverses', 'Le Leader attaque deux ou trois fois par tour', 'Bon contrôle du terrain adverse'],
    weaknesses: ['La double attaque demande 3 DON!! sur le Leader', 'Peu de protection pour la Vie', 'Les effets d’épuisement visent surtout des coûts moyens'],
    aiLesson: 'L’IA a appris que ce deck gagne en pressant le Leader adverse (2 DON!! de plus par attaque) plutôt qu’en abattant tous les Personnages, et à garder la double attaque pour la fin de partie (9 DON!! ou plus).',
  },
  'ST-33': {
    styles: ['Contrôle', 'Avantage de cartes', 'Bleu'],
    summary: 'Ralentir l’adversaire (Personnages qui ne peuvent plus attaquer, renvoyés en main ou sous le deck) tout en gardant une main pleine grâce au Leader Kuzan.',
    plan: [
      'Tours 1 à 3 : Kobby et Sengoku trient ta main ; Smoker et Bluegrass retirent les petits Personnages adverses.',
      'Chaque défausse par une carte {Marine} est remboursée par le Leader : défausse sans crainte.',
      'Milieu de partie : Kuzan et Ice Time empêchent les gros Personnages adverses d’attaquer ; Borsalino coûte 3 le tour où tu as défaussé.',
      'Fin de partie : Garp pose un deuxième gros Personnage gratuitement (Jango, Kuzan, Sauro), Zéphyr renvoie une menace en main.',
    ],
    combos: [
      { title: 'Défausser, c’est piocher', cards: ['OP12-040', 'ST33-001', 'OP12-047'], text: 'Quand un effet d’une de tes cartes {Marine} te fait défausser, le Leader Kuzan pioche autant de cartes, après la fin de l’effet. Kobby (défausse 1 : pioche 1) devient « pioche 2 », Sengoku cherche 2 cartes {Marine} gratuitement.' },
      { title: 'Borsalino à coût 3', cards: ['ST33-004', 'ST33-001', 'OP12-046'], text: 'Le tour où une carte de ta main a été défaussée par un effet, Borsalino coûte 3 de moins : un [Bloqueur] de 6000 pour 3 DON!!. Défausse d’abord (Kobby, Zéphyr, Smoker...), puis joue-le.' },
      { title: 'Personne n’attaque', cards: ['EB04-028', 'OP12-043'], text: 'Ice Time : jusqu’à 2 Personnages adverses de 10000 ou moins ne peuvent pas attaquer jusqu’à la fin du prochain tour adverse ; Kuzan (OP12-043) bloque un attaquant de plus. Idéal juste avant que l’adversaire ne lance son offensive.' },
      { title: 'Deux gros corps', cards: ['ST33-005', 'OP12-045', 'OP12-043'], text: 'Garp joue gratuitement un Personnage bleu {Marine} de 8000 ou moins : Jango ou Kuzan (8000). 14000 de puissance pour 6 DON!!.' },
      { title: 'Retirer les menaces', cards: ['ST33-003', 'EB04-026', 'OP12-046'], text: 'Smoker place 2 Personnages adverses de coût 2 ou moins sous le deck, Bluegrass un de coût 1 ou moins, Zéphyr se sacrifie pour renvoyer en main un Personnage de coût 5 ou moins.' },
      { title: 'Le mur', cards: ['ST33-001', 'OP12-050', 'ST33-004', 'OP12-057'], text: 'Trois [Bloqueur] (Kobby, Sauro, Borsalino) et Ice Block (+4000, puis défausse 1, remboursée par le Leader).' },
    ],
    mulligan: 'Garde Kobby, Smoker ou Sengoku pour les premiers tours ; les cartes chères (Garp, Jango, Kuzan) peuvent attendre.',
    strengths: ['Garde une main pleine', 'Beaucoup de [Bloqueur]', 'Empêche les attaques adverses'],
    weaknesses: ['Lent à tuer', 'Les retraits visent surtout des petits coûts', 'Peu de puissance avant 6 DON!!'],
    aiLesson: 'L’IA bloque souvent, même en perdant son bloqueur, dès qu’elle descend à 3 ou 4 Vies, et met le paquet quand l’adversaire a 2 Vies ou moins.',
  },
  'ST-34': {
    styles: ['Gestion des DON!!', 'Prédiction', 'Violet'],
    summary: 'Jouer avec les DON!! (en ajouter, en renvoyer pour des effets) et deviner le coût de la carte du dessus du deck adverse, que le Leader Katakuri permet de connaître à l’avance.',
    plan: [
      'Tours 1 à 3 : Brûlée cherche une carte, Pudding, Cracker et Oven ajoutent des DON!! : tu prends de l’avance en DON!!.',
      'Quand ton Leader attaque ou est attaqué : DON!! −1 pour regarder la carte du dessus du deck adverse (+1000 pour le combat).',
      'Tu connais alors son coût : Oven, Slurp, « Tes petits stratagèmes... » et Sabre impérial réussissent à coup sûr.',
      'Fin de partie : Linlin (coût 10) te rend une Vie et passe la puissance de base d’un Personnage adverse à 0.',
    ],
    combos: [
      { title: 'Lire puis deviner', cards: ['OP11-062', 'OP11-066', 'OP11-071', 'OP11-081'], text: 'Le Leader regarde la carte du dessus du deck adverse (DON!! −1, une fois par tour, en attaquant ou en défense). Tant qu’elle reste au-dessus, déclare son coût : Oven met KO un coût de base 3 ou moins, Slurp pioche et ajoute une DON!!, Sabre impérial met KO un coût de base 8 ou moins.' },
      { title: 'DON!! −X remboursées', cards: ['ST34-001', 'OP11-062', 'ST34-005', 'ST34-004'], text: 'Pendant ton tour, Katakuri (ST34-001) ajoute 2 DON!! épuisées la première fois que des DON!! retournent à ton deck DON!!. Le DON!! −1 du Leader ou de Pekoms, ou le DON!! −4 de Linlin, te rapporte alors des DON!! au lieu d’en coûter.' },
      { title: 'L’Impératrice', cards: ['ST34-004'], text: 'Linlin : DON!! −4 et défausse 1 : la carte du dessus de ton deck va sur ta Vie, puis la puissance de base d’un Personnage adverse passe à 0 pour le tour : attaque-le pour l’abattre.' },
      { title: 'Prendre de l’avance', cards: ['EB03-035', 'ST34-002', 'OP11-066'], text: 'Pudding (si tu n’as pas plus de DON!! que l’adversaire), Cracker et Oven ajoutent chacun une DON!! : tu peux jouer Linlin et Smoothie plus tôt.' },
      { title: 'Contre deviné', cards: ['OP11-079', 'OP11-062'], text: '« Tes petits stratagèmes... » : +5000 si tu devines le coût. Après le DON!! −1 de ton Leader en défense, tu connais la carte : Contre garanti.' },
      { title: 'Le relais', cards: ['P-090', 'ST34-001'], text: 'Smoothie mis KO pendant le tour adverse : DON!! −1 pour jouer un {Équipage de Big Mom} de coût au plus égal aux DON!! adverses. Katakuri (ST34-001) mis KO joue un Personnage de 8000 ou moins.' },
    ],
    mulligan: 'Garde Brûlée, Pudding, Cracker ou Oven : ils lancent ta rampe de DON!!. Linlin et Smoothie viennent plus tard.',
    strengths: ['Plus de DON!! que l’adversaire', 'Effets puissants quand le coût est connu', 'Linlin en fin de partie'],
    weaknesses: ['Les effets « déclarez un coût » ratent souvent sans le Leader', 'Le DON!! −1 du Leader coûte cher sans Katakuri (ST34-001)', 'Deck le plus difficile à jouer des six'],
    aiLesson: 'L’IA a appris à garder ses DON!! restantes au lieu de tout dépenser en attaque : elles lui permettent sans doute de payer le DON!! −1 du Leader et ses Contres pendant le tour adverse.',
  },
  'ST-36': {
    styles: ['Vie et Déclenchements', 'Milieu de partie', 'Jaune'],
    summary: 'Traiter la Vie comme une ressource : chaque carte de Vie perdue peut déclencher un effet, et le Leader Kidd transforme un attaquant en [Bloqueur] à la fin de ton tour.',
    plan: [
      'Tours 1 à 3 : Luffy (OP10-111) et « Le plus libre des hommes... » cherchent des {Supernovae} ; Bartolomeo pioche.',
      'Chaque tour : attaque avec un Personnage {Supernovae} de coût 3 à 8, puis l’effet de fin de tour du Leader le redresse avec [Bloqueur] pour le tour adverse.',
      'Ne contre pas trop pour protéger ta Vie : Killer, Law, Zoro, Hawkins et Apoo ont des [Déclenchement] qui te rapportent quand ta Vie baisse.',
      'Quand tu as moins de Vie que l’adversaire : Bonney envoie un Personnage adverse dans sa Vie, X-Drake (OP10-114) en épuise un.',
    ],
    combos: [
      { title: 'Attaquer puis défendre', cards: ['OP10-099', 'OP10-101', 'P-088'], text: 'Fin de ton tour : retourne la carte du dessus de ta Vie face visible pour redresser un {Supernovae} de coût 3 à 8 ; il gagne [Bloqueur] jusqu’à la fin du tour adverse. Il a attaqué, et il défend quand même.' },
      { title: 'Kidd détourne l’attaque', cards: ['ST36-005', 'OP10-099'], text: 'Une fois par tour, Kidd (ST36-005) retourne une Vie face visible face cachée pour que l’attaque adverse le vise à la place (7000). L’effet du Leader crée justement des Vies face visible. Il peut aussi retourner une Vie face visible pour donner une DON!! au Leader.' },
      { title: 'La Vie qui rapporte', cards: ['ST36-002', 'P-088', 'OP12-113', 'ST36-003', 'OP10-109'], text: 'Killer (si l’adversaire a 3 Vies ou moins) et Law (5 Vies ou moins au total) se jouent gratuitement depuis la Vie ; Zoro met KO un petit Personnage et revient en main ; Apoo pioche et passe ton Leader à 7000 ; Hawkins pioche 2 et défausse 1.' },
      { title: 'Choisir son prochain Déclenchement', cards: ['OP10-103', 'ST36-002', 'P-088'], text: 'Bege prend une carte de ta Vie en main et y place, face visible, un {Supernovae} de ta main : choisis Killer ou Law pour un [Déclenchement] garanti.' },
      { title: 'Regagner des Vies', cards: ['ST36-002', 'ST36-001'], text: 'Killer joué pendant ton tour ajoute la carte du dessus du deck à ta Vie ; Cavendish mis KO aussi (en défaussant une carte).' },
      { title: 'Retard de Vie = bonus', cards: ['P-085', 'OP10-114', 'OP10-109'], text: 'Avec autant de Vies que l’adversaire ou moins : Bonney place un Personnage adverse de coût 4 ou moins dans la Vie de son propriétaire, X-Drake (OP10-114) en épuise un. Hawkins mis KO défausse la carte du dessus de la Vie adverse.' },
    ],
    mulligan: 'Garde Luffy (OP10-111), Bartolomeo, X-Drake ou Cavendish, et un {Supernovae} de coût 4-5 pour lancer l’effet du Leader.',
    strengths: ['Les dégâts subis rapportent des cartes et des Personnages', 'Un [Bloqueur] de plus chaque tour grâce au Leader', 'Bonney et X-Drake punissent un adversaire en avance'],
    weaknesses: ['Joue avec le feu : la Vie descend vite', 'Les Vies face visible renseignent l’adversaire', 'Beaucoup d’effets dépendent du nombre de Vies'],
    aiLesson: 'L’IA ne contre presque jamais pour protéger sa Vie (elle compte sur les [Déclenchement]) mais contre volontiers quand l’écart de puissance est petit, et garde ses [Bloqueur] en défense.',
  },
  'META-SABO-2026-10': {
    styles: ['Coût 12 ou plus', 'Défausse utile', 'Rouge/Noir'],
    summary: 'Poser un géant d’Erbaf (Haguar D. Sauro ou Loki, qui valent 16 et 18) : tant qu’un Personnage de coût 12 ou plus est en jeu, tous les petits Chapeaux de paille gagnent +3000 et des pouvoirs, et le Leader Sabo donne +1000 à toute l’équipe.',
    plan: [
      'Tours 1 et 2 : cherche tes pièces avec Nami (OP01-016), Usopp et Sanji ; Nami (OP17-086) pioche 2 cartes contre une carte {Erbaf} de ta main.',
      'Dès 4 DON!! : Haguar D. Sauro (coût 4, mais 16 en jeu) cherche une carte {Erbaf} et allume tous les bonus « coût 12 ou plus ». Donne 1 DON!! à Sabo : +1000 à tout le monde.',
      'Dès 6 DON!! : Loki (18 en jeu, 11000 pendant le tour adverse) met KO des Personnages adverses pour un coût total de 4.',
      'Ensuite : Luffy (OP17-093) pioche, rejoue un petit Personnage de ta Défausse et attaque dès son arrivée ; Arrimage pirates 6 rejoue aussi un Chapeau de paille de coût 2.',
    ],
    combos: [
      { title: 'Le réveil d’Erbaf', cards: ['OP17-089', 'OP17-119', 'OP17-080', 'OP17-087', 'OP17-095', 'OP17-083'], text: 'Avec un Personnage de coût 12 ou plus en jeu, Usopp, Sanji, Robin et Zoro passent de 2000 à 5000, Jinbe devient [Bloqueur] à 5000, Luffy attaque dès son arrivée, Chopper rend un attaquant [Imblocable] et Robin donne −3000 en arrivant.' },
      { title: 'Le Leader', cards: ['OP13-004', 'OP17-089', 'OP17-093'], text: 'Sabo (Leader) : avec 1 DON!! et un Personnage de coût 8 ou plus (Sauro, Loki, Luffy, Arrimage pirates 6), ton Leader et tous tes Personnages gagnent +1000. Avec 4 Vies ou plus, il a −1000.' },
      { title: 'La Défausse comme réserve', cards: ['OP17-080', 'OP17-082', 'OP15-088', 'OP17-093'], text: 'Usopp et Sauro placent dans ta Défausse les cartes qu’ils ne prennent pas, Sanji en défausse 2 ; Arrimage pirates 6 et Luffy rejouent ensuite gratuitement un Personnage de coût 2 ou moins de ta Défausse.' },
      { title: 'Protéger le terrain', cards: ['OP17-095', 'OP04-016'], text: 'Zoro : quand un de tes Personnages va quitter le terrain à cause d’un effet adverse, place 3 cartes de ta Défausse sous ton deck pour le garder. Menu « Bonnes manières » : +3000 contre une carte de ta main.' },
      { title: 'Abattre une cible', cards: ['OP13-007', 'OP17-087', 'OP17-119'], text: 'Ace, Sabo et Luffy donne 1 DON!! redressée et se sacrifie pour −3000 ; Robin donne −3000 ; Loki met KO pour un coût total de 4.' },
    ],
    mulligan: 'Garde Haguar D. Sauro, ou de quoi le chercher (Usopp, Nami OP01-016), avec deux ou trois Personnages de coût 1 ou 2. Repioche une main sans petit Personnage.',
    strengths: ['Les petits Personnages deviennent très forts dès qu’un géant est en jeu', 'Recherche et pioche nombreuses', 'Rejoue ses Personnages depuis la Défausse'],
    weaknesses: ['Sans Personnage de coût 12 ou plus, les petits Personnages restent à 2000', 'Le deck se vide vite (cartes défaussées)', 'Leader faible tant qu’il a 4 Vies ou plus'],
  },
  'META-MIHAWK-2026-10': {
    styles: ['Contrôle', 'Épuiser', 'Vert'],
    summary: 'Épuiser les Personnages adverses (Shanks, Yasopp) et les empêcher de se redresser (Electrical Luna), puis les abattre ; une fois tes Personnages joués, le Leader Mihawk redresse 3 DON!! pour tes attaques et tes Événements.',
    plan: [
      'Tours 1 et 2 : Otama (une carte {Pays de Wano} verte) et Perona (une carte <Tranche> ou un Événement vert) cherchent tes cartes ; Kinémon pioche 2 cartes contre 1 DON!! ou ton Leader épuisé. Pose la Barque mortuaire : elle pioche 1 carte, puis redresse 1 DON!! à chaque fin de ton tour.',
      'Dès 5 DON!! : Oden (pioche 1, et un Personnage adverse ne pourra pas être épuisé, donc ni attaquer ni bloquer), Yasopp (pioche 1 et épuise un Personnage adverse de coût 8 ou moins) ou Kawamatsu (6000).',
      'Dès 6 DON!! : Trafalgar Law renvoie Otama ou Perona dans ta main et joue gratuitement, épuisé, un Personnage de coût 5 ou moins de ta main : son effet [Jouée] se déclenche.',
      'Dès 10 DON!! : Shanks redresse 2 DON!!, épuise tous les Personnages adverses et attaque tout de suite. Electrical Luna les empêche ensuite de se redresser.',
      'À chaque tour, après avoir joué tes Personnages : active le Leader (épuise la Barque mortuaire ou une DON!!) pour redresser 3 DON!!. Tu ne pourras plus jouer de Personnage ce tour-ci.',
    ],
    combos: [
      { title: 'Épuiser puis abattre', cards: ['OP17-022', 'OP17-031', 'OP06-033'], text: 'Shanks et Yasopp épuisent les Personnages adverses : tes attaquants peuvent alors les viser. Vander Decken IX met KO un Personnage adverse épuisé contre une carte {Hommes-poissons} de ta main (Kawamatsu ou un autre Vander Decken).' },
      { title: 'Les garder épuisés', cards: ['OP08-036', 'OP17-022', 'OP17-031'], text: 'Electrical Luna : tous les Personnages adverses épuisés de coût 7 ou moins ne se redressent pas au tour suivant. L’adversaire ne peut ni attaquer ni bloquer avec eux, et tu peux encore les attaquer.' },
      { title: 'Le Leader', cards: ['OP14-020', 'OP14-039'], text: 'Mihawk : +1000 contre un Leader <Tranche>. Une fois par tour, épuise 1 de tes cartes (la Barque mortuaire, une DON!!...) : avec un Personnage de coût 5 ou plus en jeu, redresse 3 DON!!. Ensuite, plus de Personnage joué ce tour-ci : joue-les avant.' },
      { title: 'Rejouer les effets', cards: ['OP13-031', 'OP07-022', 'OP12-034', 'ST32-002', 'OP17-031'], text: 'Trafalgar Law renvoie un de tes Personnages en main et joue gratuitement, épuisé, un Personnage de coût 5 ou moins de ta main (Oden, Yasopp, ou celui que tu viens de renvoyer) : son effet [Jouée] se déclenche à nouveau.' },
      { title: 'Défense', cards: ['OP06-038', 'OP14-038'], text: 'Ichidai San Zen Dai Sen Sekai : +2000, et encore +2000 si tu as 8 cartes épuisées (DON!! comprises). « Si vous croyez que je me souviens... » : +3000 à ton Leader ; en Principale, épuise 2 de tes cartes pour piocher 1 et épuiser un Personnage adverse.' },
    ],
    mulligan: 'Garde Otama ou Perona (recherche) avec un ou deux autres Personnages de coût 1 ou 2 ; Kinémon pioche aussi. Repioche une main sans petit Personnage ni recherche.',
    strengths: ['Épuise tout le terrain adverse et l’empêche de se redresser', 'Beaucoup de recherche et de pioche', 'Le Leader redresse 3 DON!! à chaque tour'],
    weaknesses: ['Un seul [Bloqueur] (Law, et seulement à 1 Vie ou moins)', 'Après l’effet du Leader, plus de Personnage joué ce tour-ci', 'Tes cartes épuisées pour payer des coûts restent épuisées, donc attaquables, pendant le tour adverse'],
  },
  'META-ROBIN-2026-10': {
    styles: ['Déclenchements', 'Vie', 'Violet/Jaune'],
    summary: 'Un Leader Nico Robin entouré de l’Équipage de Big Mom : presque tout le deck a un [Déclenchement] (souvent « jouez cette carte »), la Vie se reconstruit sans cesse (Teach, Linlin, Smoothie, Trois généraux sucrés), et Charlotte Linlin fait passer à 8000 tous les Personnages à 4000 qui ont un [Déclenchement].',
    plan: [
      'Tours 1 et 2 : Charlotte Brûlée et Streusen cherchent une carte {Équipage de Big Mom} ; Yamato ([Bloqueur]) ajoute 1 DON!! épuisée. Le Leader, en attaquant, défausse une carte à [Déclenchement] pour 1 DON!! de plus.',
      'Milieu de partie : Charlotte Pudding défausse une carte à [Déclenchement] pour piocher 3 cartes ; Charlotte Smoothie et les Trois généraux sucrés (en épuisant 2 DON!! de plus) ajoutent une Vie, font défausser l’adversaire ou donnent −3000 à deux Personnages.',
      'Dès 8 DON!! : Marshall D. Teach (10000) regarde 3 cartes et place la meilleure au-dessus de ta Vie, de préférence une carte à [Déclenchement].',
      'Dès 10 DON!! : Charlotte Linlin (12000) pioche, puis ajoute une Vie ou prend la carte du dessus de la Vie adverse ; pendant ton tour, Daifuku, Oven, Pudding, Smoothie, Slurp, Miss Doublefinger et les Trois généraux passent à 8000.',
      'En défense : quand l’adversaire touche ton Leader, beaucoup de cartes de Vie se jouent gratuitement grâce à leur [Déclenchement] ; Gum Gum Gigant donne +4000 et pioche 2 cartes.',
    ],
    combos: [
      { title: 'L’armée de Big Mom', cards: ['OP17-112', 'OP17-107', 'OP17-102', 'OP17-109', 'OP17-114'], text: 'Pendant ton tour, Charlotte Linlin fait passer à 8000 tous tes Personnages à 4000 qui ont un [Déclenchement] (Daifuku, Oven, Pudding, Smoothie, Slurp, Miss Doublefinger, Trois généraux sucrés). Deux Linlin ne cumulent pas.' },
      { title: 'La Vie comme réserve', cards: ['OP16-119', 'OP17-106', 'OP17-114', 'EB04-058'], text: 'Teach place au-dessus de ta Vie la carte de ton choix parmi 3 ; Smoothie, les Trois généraux sucrés et Borsalino (à 2 Vies ou moins) ajoutent une carte du dessus de ton deck à ta Vie. Chaque Vie perdue peut devenir un Personnage gratuit.' },
      { title: 'Le [Déclenchement] de Teach', cards: ['OP16-119'], text: 'Annule pour le tour les effets d’un Personnage adverse (bonus, [Bloqueur], coût augmenté...), puis met KO un Personnage adverse de coût 5 ou moins : un Haguar D. Sauro dont l’effet est annulé ne coûte plus que 4.' },
      { title: 'Défausser pour gagner', cards: ['OP09-062', 'OP17-109', 'OP05-073'], text: 'Le Leader et Pudding défaussent une carte à [Déclenchement] (pour une DON!! ou 3 cartes) ; Miss Doublefinger défausse n’importe quelle carte pour une DON!!, et se joue depuis la Vie contre DON!! −1.' },
      { title: 'Rejouer', cards: ['OP17-102', 'OP17-110'], text: 'Charlotte Oven mise KO rejoue de ta Défausse un Personnage de 4000 ou moins ; Charlotte Slurp joue un {Équipage de Big Mom} de coût 6 ou moins de ta main et attaque dès son arrivée.' },
    ],
    mulligan: 'Garde Charlotte Brûlée ou Streusen (recherche) avec Yamato ou un autre petit Personnage ; une main avec des cartes à [Déclenchement] nourrit le Leader et Pudding. Repioche une main sans Personnage de coût 3 ou moins.',
    strengths: ['Chaque Vie perdue peut se jouer gratuitement ([Déclenchement])', 'La Vie se reconstruit souvent', 'Gros Personnages à 8000 grâce à Charlotte Linlin'],
    weaknesses: ['Beaucoup de Personnages à 4000 sans Linlin en jeu', 'Les coûts « épuiser 2 DON!! » ralentissent le jeu', 'Gum Gum Gigant coûte cher (DON!! −2 et une carte)'],
  },
  'META-XEBEC-2026-10': {
    styles: ['Contrôle', 'Défense', 'Bleu'],
    summary: 'Un équipage de géants sans Contre : le Leader pioche en attaquant, Captain John épuisé oblige l’adversaire à n’attaquer que lui, et Rocks D. Xebec (Personnage) arrive avec deux autres membres de l’équipage, gratuitement.',
    plan: [
      'Tours 1 à 3 : Kyo (pioche 1) ; Miss Buckingham Stussy (5000) empêche un Personnage adverse d’attaquer. En attaquant, le Leader défausse 1 carte pour révéler la carte du dessus de ton deck : presque tout le deck est « Équipage de Rocks », il pioche alors 2 cartes.',
      'Dès 4 DON!! : Captain John (épuise-le en fin de tour : l’adversaire ne pourra attaquer que lui), Ochoku et Kaido ([Bloqueur]), Gloriosa (place sous le deck un Personnage de coût 5 ou moins).',
      'Dès 5 et 6 DON!! : Charlotte Linlin (l’adversaire choisit : tu pioches 2 cartes ou il en défausse 2) et Edward Newgate (8000, pioche 1 ; +3000 à ton Leader quand il attaque ou est attaqué).',
      'Dès 7 DON!! : Shiki attaque les Personnages dès son arrivée et donne −3000. Dès 10 : Rocks D. Xebec (12000) pioche et joue gratuitement 2 cartes de noms différents (coût total 9).',
    ],
    combos: [
      { title: 'La provocation', cards: ['OP17-044'], text: 'Captain John épuisé : l’adversaire ne peut attaquer aucune autre carte que lui. Ton Leader et tes autres Personnages sont à l’abri ; son [Activation : Principale] (s’épuiser pour piocher 1 carte et en défausser 1) le prépare en fin de tour.' },
      { title: 'Défendre sans Contre', cards: ['OP17-040', 'OP17-049', 'OP17-048', 'OP17-055', 'OP17-056'], text: 'Tes Personnages n’ont pas de Contre : la défense vient de Newgate (+3000 au Leader), Linlin (+1000), Shiki (−3000 à l’attaquant) et des deux Événements à coût 0 (+2000 à une carte « Équipage de Rocks »).' },
      { title: 'Le grand capitaine', cards: ['OP17-118', 'OP17-040', 'OP17-045'], text: 'Rocks D. Xebec pioche 1 carte et joue gratuitement 2 cartes {Équipage de Rocks} de noms différents pour un coût total de 9 (Newgate et Kyo, Linlin et Ochoku...). En main, il a Contre +2000 tant qu’aucun de tes Personnages n’a de Contre.' },
      { title: 'Protéger le terrain', cards: ['OP17-045', 'EB02-030'], text: 'Kyo : quand un de tes Personnages va quitter le terrain par un effet adverse, défausse 2 cartes pour le garder. « Quand les rêves de ses camarades ont été bafoués !! » : pour le tour, défausse 1 carte au lieu d’un KO en combat.' },
      { title: 'Contrôle', cards: ['OP17-046', 'OP17-041', 'OP17-056', 'OP17-054'], text: 'Gloriosa place sous le deck un Personnage de coût 5 ou moins ; Ochoku y envoie tous les Personnages adverses de coût de base 1 ; « Équipage de Rocks » renvoie en main un Personnage de coût 6 ou moins ; Stussy empêche d’attaquer.' },
    ],
    mulligan: 'Garde Kyo, Miss Buckingham Stussy ou Captain John, avec une carte de coût 4. Repioche une main sans Personnage de coût 4 ou moins.',
    strengths: ['Le Leader pioche presque à chaque attaque', 'Captain John protège tout le reste', 'Rocks D. Xebec arrive avec deux autres Personnages'],
    weaknesses: ['Presque aucun Personnage n’a de Contre', 'Beaucoup d’effets demandent de défausser', 'Plan subtil, plus difficile à jouer'],
  },
  'META-ENEL-2026-10': {
    styles: ['Agressif', 'DON!! −1', 'Violet'],
    summary: 'Seulement 6 cartes DON!! : le deck les dépense en DON!! −1 ou −2 pour piocher et contrôler, et le Leader Ener les remet en jeu à chaque tour. Petits Personnages agressifs (Shura attaque dès son arrivée, Holy donne [Double attaque] aux Om) et Événements qui servent aussi de Contre.',
    plan: [
      'Tours 1 et 2 : Om, Satori et Shura (coût 1) piochent 1 carte contre DON!! −1 ; Shura attaque dès son arrivée. Charlotte Pudding cherche un Événement ou Sanji.',
      'À partir de ton 2e tour : active le Leader au début du tour. Il remet en jeu les DON!! renvoyées (1 redressée, jusqu’à 4 épuisées) et en donne jusqu’à 4 épuisées à un Personnage : choisis-en un qui peut attaquer.',
      'Holy (coût 3) : tes Om et elle ont [Double attaque] ; pendant le tour adverse, leur puissance de base passe à 6000.',
      'Contrôle : Gamma Knife (−5000), Gum Gum Foudre (KO 6000 ou moins), El Thor (KO 3000 ou moins), Djambuwal (un Personnage épuisé ne se redresse pas), Mamaragan (épuiser un Personnage de 5000 ou moins).',
      'Défense : Vally, El Thor et Kiten donnent +2000 à ton Leader Ener en Contre, sans coût ; Trépas divin +3000 contre une carte défaussée.',
    ],
    combos: [
      { title: 'Les DON!! qui reviennent', cards: ['OP15-058', 'OP15-061', 'OP15-067', 'OP15-075'], text: 'Chaque DON!! −1 renvoie une DON!! au deck DON!! ; le Leader les remet en jeu au tour suivant. Avec 6 DON!! au plus sur ton terrain, les effets « 6 cartes DON!! ou moins » sont toujours actifs.' },
      { title: 'Double attaque', cards: ['OP15-071', 'OP15-061'], text: 'Holy donne [Double attaque] à chacun de tes Om et à elle-même : avec les DON!! données par le Leader, chaque attaque qui touche le Leader adverse lui retire 2 Vies.' },
      { title: 'Le grand Ener', cards: ['OP15-118'], text: 'Ener (Personnage) : 10000 et impossible à retirer du terrain par un effet adverse tant que tu as 6 DON!! ou moins ; en arrivant, DON!! −1 pour choisir 1 carte parmi les 5 du dessus de ton deck.' },
      { title: 'Récupérer les Événements', cards: ['OP10-067', 'OP12-071'], text: 'Señor Pink reprend de ta Défausse un Événement violet de coût 5 ou moins et redresse 1 DON!! ; Charlotte Pudding cherche un Événement ou Sanji.' },
      { title: 'Défense', cards: ['OP15-074', 'OP15-075', 'OP15-076', 'OP13-076', 'OP07-064'], text: 'Les Événements d’Ener ne coûtent rien en Contre (+2000 à ton Leader Ener). Sanji ([Bloqueur]) coûte 3 de moins quand tu as au moins 2 DON!! de moins que l’adversaire.' },
    ],
    mulligan: 'Garde deux ou trois Personnages de coût 1 (Om, Satori, Shura, Pudding), et Holy si possible. Repioche une main sans Personnage de coût 1.',
    strengths: ['Pioche et contrôle à chaque DON!! −1', 'Attaques tôt (Shura) et [Double attaque] (Holy et les Om)', 'Événements de Contre gratuits'],
    weaknesses: ['Seulement 6 DON!! : pas de gros Personnages', 'Petits Personnages faciles à abattre', 'Plan exigeant : l’ordre des actions compte beaucoup'],
  },
  'META-KAIDO-2026-10': {
    styles: ['DON!!', 'Contrôle', 'Violet'],
    summary: 'L’Équipage des cent bêtes joue avec les DON!! : King, Queen, Black Maria et Basil Hawkins en ajoutent, et chaque DON!! −1 se recharge grâce à Kaido (OP17-062). Deux Kaido à 12000, Queen à 10000 et Charlotte Linlin pour finir.',
    plan: [
      'Tours 1 à 3 : Queen (coût 1) pioche 2 cartes contre une carte {Équipage des cent bêtes} ; Yamato ([Bloqueur]) et Basil Hawkins ajoutent des DON!! ; « We’re Going to Claim the One Piece!!! » cherche une carte de l’équipage.',
      'Dès 3 DON!! : Black Maria ajoute 5 DON!! épuisées pour payer les DON!! −1 du tour ; à la fin du tour, tu reviens au même nombre de DON!! que l’adversaire.',
      'Dès 6 DON!! : King (7000) ajoute 2 DON!! par tour et se sauve d’un KO en renvoyant 1 DON!!.',
      'Dès 9 et 10 DON!! : les Superstars (11000, +1 Vie), Queen (10000, [Exil], 2 Personnages adverses ne peuvent plus attaquer), Kaido (12000) : celui d’OP17-062 ([Bloqueur]) rend une DON!! quand une autre est renvoyée, celui d’OP17-063 met KO un Personnage de coût 6 ou moins le tour où il arrive.',
      'Défense : le Leader donne −2000 à un attaquant (DON!! −1, une fois par tour) ; Torche du dragon (+4000 au Leader), Ramollo Beam Sword, Mamaragan et Trépas divin en Contre.',
    ],
    combos: [
      { title: 'Les DON!! qui reviennent', cards: ['OP17-062', 'OP17-065', 'OP17-058', 'OP08-074'], text: 'Avec Kaido (OP17-062) en jeu, la première DON!! renvoyée de ton tour revient redressée, et une autre se redresse : le DON!! −1 de Queen ou du Leader ne coûte presque rien. Black Maria donne de quoi payer.' },
      { title: 'Le roi des bêtes', cards: ['OP17-063'], text: 'Kaido (OP17-063) : le tour où il arrive, DON!! −1 pour annuler les effets d’un Personnage adverse de coût 6 ou moins et le mettre KO. En jeu, il donne Contre +1000 à tes Personnages sans Contre de ta main.' },
      { title: 'King', cards: ['EB04-031'], text: 'S’il devait être mis KO, en combat ou par un effet, renvoie 1 DON!! à la place. Une fois par tour, il ajoute 1 DON!! redressée et 1 épuisée.' },
      { title: 'Les Superstars', cards: ['OP17-061', 'OP17-065', 'EB04-031'], text: 'Elles ajoutent la carte du dessus de ton deck à ta Vie (DON!! −1) ; plus tard, place-les dans ta Défausse pour jouer gratuitement Queen (coût 9) ou King de ta main.' },
      { title: 'Contrôle', cards: ['OP17-065', 'OP15-077', 'OP15-078', 'ST34-004'], text: 'Queen empêche 2 Personnages de coût 5 ou moins d’attaquer ; Djambuwal et Mamaragan bloquent ou épuisent ; Charlotte Linlin met à 0 la puissance d’un Personnage adverse.' },
    ],
    mulligan: 'Garde Queen (coût 1), Yamato ou Basil Hawkins, et une carte de recherche (« We’re Going to Claim the One Piece!!! »). Repioche une main sans carte de coût 3 ou moins.',
    strengths: ['Beaucoup de DON!! en jeu tôt', 'Gros Personnages (Kaido 12000, Queen 10000) et contrôle', 'King très difficile à mettre KO'],
    weaknesses: ['Les DON!! −1 vident le terrain sans Kaido (OP17-062)', 'Démarrage lent sans petite carte en main', 'Black Maria oblige à revenir au niveau de DON!! de l’adversaire en fin de tour'],
  },
  'ST-21': {
    styles: ['Agressif', 'DON!!', 'Rouge'],
    summary: 'Le Luffy Gear 5 donne ses DON!! épuisées à ses Personnages : Nami, Brook et Luffy en ajoutent encore pour attaquer fort dès le milieu de partie.',
    plan: [
      'Tours 1 à 3 : pose des Personnages bon marché (Jewelry Bonney, Végapunk, Jinbe, Sentomaru) ; Nami arrive au tour 3.',
      'À chaque tour : 1 DON!! sur ton Leader, puis son effet donne 2 DON!! épuisées à un Personnage : il attaque avec +2000 sans dépenser de DON!! redressée.',
      'Nami (une fois par tour) et Brook (en attaquant) donnent encore 2 DON!! épuisées : un Personnage de 4000 attaque à 8000.',
      'Fin de partie : Luffy (ST21-014, [Initiative]) et Zoro (avec 2 DON!!) attaquent le tour où ils arrivent ; Gum Gum Taupe Bullet et Gum Gum Dawn Whip ouvrent le chemin.',
    ],
    combos: [
      { title: 'DON!! épuisées, attaques redressées', cards: ['ST21-001', 'ST21-009', 'ST21-012'], text: 'Le Leader (avec 1 DON!!), Nami et Brook donnent des DON!! déjà épuisées : tes DON!! redressées servent à jouer des cartes, les épuisées renforcent tes attaquants.' },
      { title: 'Les cartes à 2 DON!!', cards: ['ST21-010', 'ST21-015', 'ST21-002', 'ST21-011'], text: 'Avec 2 DON!! données : Robin met KO un Personnage de 4000 ou moins en attaquant, Zoro gagne [Initiative] ; pendant le tour adverse, Usopp gagne +2000 et Franky donne +1000 à tes petits {Équipage de Chapeau de paille}.' },
      { title: 'Personne ne bloque', cards: ['ST21-003', 'ST21-016'], text: 'Sanji empêche l’adversaire de bloquer un de tes Personnages de 6000 ou plus ce tour-ci ; Gum Gum Dawn Whip retire [Bloqueur] à un Personnage de 4000 ou moins.' },
      { title: 'Le relais de Zoro', cards: ['ST21-015', 'ST21-008'], text: 'Mis KO, Zoro joue gratuitement de ta main un Personnage rouge de 6000 ou moins (Tony-Tony Chopper, Luffy ST21-014).' },
    ],
    mulligan: 'Garde deux Personnages de coût 1 à 3 et Nami si possible. Repioche une main de cartes à 4 ou 5.',
    strengths: ['Beaucoup de DON!! sur les attaquants sans en dépenser', 'Attaques le tour même avec Luffy et Zoro', 'Effets qui empêchent de bloquer'],
    weaknesses: ['Personnages peu puissants sans DON!!', 'Peu de pioche', 'Peu de Contres forts'],
  },
  'ST-22': {
    styles: ['Milieu de partie', 'Avantage de cartes', 'Bleu'],
    summary: 'L’Équipage de Barbe Blanche révèle la carte du dessus de son deck : si elle est de l’équipage (presque toujours dans ce deck), Newgate et Joz piochent, Marco et Squardo se renforcent. Le Leader prépare la carte du dessus.',
    plan: [
      'Tours 1 à 3 : Izo cherche une carte de l’équipage, Vista bloque, Squardo et Whitey Bay préparent les attaques.',
      'À chaque tour : le Leader révèle une carte de ta main, pioche 1 carte et place la carte révélée au-dessus du deck. Tu la reprendras au tour suivant : choisis celle dont tu n’as pas besoin tout de suite.',
      'Milieu de partie : Marco, Ace, A.O et Little Oz Junior ; Joz (8000) pioche 2 cartes et en défausse 1.',
      'Fin de partie : Edward Newgate ([Double attaque], 10000) pioche 2 cartes en arrivant ; « Je suis "Barbe Blanche" !! » le joue gratuitement et donne +2000 au Leader.',
    ],
    combos: [
      { title: 'Révéler juste', cards: ['ST22-001', 'ST22-007', 'ST22-012', 'ST22-016'], text: 'Squardo (DON!! épuisée), Marco (+1000 jusqu’à la fin du prochain tour adverse) et « Retire immédiatement... » (+4000 en Contre) révèlent la carte du dessus : dans ce deck, presque toutes les cartes sont de l’équipage.' },
      { title: 'Protéger les gros', cards: ['ST22-005', 'ST22-012'], text: 'Oden reste sur le terrain si tu défausses 2 cartes à la place ; Marco, une fois par tour, défausse 1 carte au lieu d’être mis KO par un effet. Oden se redresse aussi en renvoyant un autre Personnage dans ta main.' },
      { title: 'Newgate gratuit', cards: ['ST22-015', 'ST22-003'], text: '« Je suis "Barbe Blanche" !! » joue Edward Newgate de ta main ; prends ensuite une carte de ta Vie pour donner +2000 au Leader jusqu’à la fin du prochain tour adverse.' },
      { title: 'Poing ardent', cards: ['ST22-017'], text: 'Révèle 2 cartes de l’équipage : pioche 1 carte et place un Personnage de coût 5 ou moins au-dessous du deck de son propriétaire. En [Déclenchement], renvoie un coût 3 ou moins dans la main de son propriétaire.' },
    ],
    mulligan: 'Garde Izo, Squardo ou Vista et une carte de coût 3-4. Repioche une main de cartes à 5 ou plus.',
    strengths: ['Beaucoup de pioche (Leader, Newgate, Joz)', 'Gros Personnages qui résistent aux effets', 'Newgate à [Double attaque]'],
    weaknesses: ['Leader à 5000 sans bonus', 'Démarrage lent', 'Peu de moyens de retirer les Personnages adverses'],
  },
  'ST-30': {
    styles: ['Milieu de partie', 'Protection', 'Rouge/Vert'],
    summary: 'Tout tourne autour des Personnages de 6000 de puissance : Inazuma et « Tu fonces toujours... » les cherchent, Newgate leur donne +1000 pendant ton tour, Little Oz Junior et Baggy les protègent. Pendant le tour adverse, le Leader donne +3000 à Ace et à Luffy.',
    plan: [
      'Tours 1 à 3 : Inazuma, Ivankov et Little Oz Junior ; Mr 3 et Baggy ([Bloqueur]) préparent la suite.',
      'Dès 4 DON!! : Ace et Luffy (ST-30) attaquent le tour où ils arrivent en épuisant 1 DON!! ; pendant le tour adverse ils valent 9000.',
      'Dès 5-6 DON!! : Jinbe pioche, Marco revient de la Défausse, Crocodile empêche un Personnage adverse de se redresser.',
      'Dès 8 DON!! : Edward Newgate donne +1000 à tous tes Personnages de 6000 pendant ton tour. Attention : un Personnage de 7000 de base ou plus fait perdre 2000 au Leader.',
    ],
    combos: [
      { title: 'Les frères', cards: ['ST30-001', 'ST30-007', 'ST30-012', 'ST30-016'], text: 'Pendant le tour adverse, Ace et Luffy gagnent +3000 grâce au Leader. « Prêt à te battre, Luffy ?! » (+3000 en Contre) pioche 1 carte quand ils sont tous les deux en jeu.' },
      { title: 'Le mur des 6000', cards: ['ST30-009', 'ST30-011', 'ST30-008'], text: 'Little Oz Junior (en piochant 1 carte) ou Baggy (en s’épuisant) restent à la place d’un Personnage de 6000 qui allait quitter le terrain à cause d’un effet adverse. Marco mis KO revient épuisé en défaussant un Personnage de 6000.' },
      { title: 'DON!! pour deux', cards: ['ST30-014', 'ST30-003'], text: 'Mr 3 s’épuise pour donner 2 DON!! épuisées à deux Personnages de 6000 ; avec Newgate, ils attaquent à 9000.' },
      { title: 'Chercher les 6000', cards: ['ST30-002', 'ST30-017', 'ST30-004', 'ST30-006'], text: 'Inazuma et « Tu fonces toujours... » trouvent un Personnage de 6000 ; Ivankov (en révélant 2) et Jinbe (en défaussant 1) transforment les doublons en pioche.' },
    ],
    mulligan: 'Garde Inazuma ou « Tu fonces toujours... » et un Personnage de 6000 à 4-5 DON!!. Repioche une main sans carte de coût 2 ou moins.',
    strengths: ['Personnages de 6000 solides et protégés', 'Ace et Luffy à 9000 en défense', 'Bonne recherche de cartes'],
    weaknesses: ['Leader à 6000, qui perd 2000 avec un Personnage de 7000 ou plus', 'Peu de moyens de retirer les gros Personnages adverses', 'Dépend des Personnages de 6000'],
  },
};
