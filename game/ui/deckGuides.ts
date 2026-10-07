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
};
