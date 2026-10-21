// Arc East Blue (tâche 1.2) : de Shells Town à Loguetown, 6 chapitres et 2 défis bonus. Textes écrits par nous, sans
// citation du manga ni de l'anime ; scénario, choix des decks et récompenses : game/docs/aventure-east-blue.md.
// Les adversaires jouent leurs vrais decks (decks.ts, EAST_BLUE_REAL_DECKS ; branchés par la tâche 1.19, qui a mesuré la
// difficulté de chaque chapitre : scripts/game/adventure-balance.ts) ; le joueur part avec ST-01.
// Les identifiants des chapitres servent de clé en base : ne pas les changer.
import { ECONOMY } from '../economy/config.ts';
import type { Arc, Reward } from './types.ts';

const boosters = (count: number): Reward[] => [{ kind: 'booster', set: 'OP03', count }];
// Berry de la première victoire (étape 2, barème de game/economy/config.ts) : chapitre, dernier chapitre, défi bonus
const berry = (amount: number): Reward => ({ kind: 'berry', amount });
const { firstWin, firstWinFinal, firstWinBonus } = ECONOMY.adventure;
// Défi ultime (Mihawk, décision de l'utilisateur du 21 octobre 2026) : imbattable ou presque avec les decks de l'époque,
// il rapporte un display OP03 et de quoi en acheter un autre en boutique
const DISPLAY = ECONOMY.shop.OP03;
// Un membre d'équipage qui rejoint Luffy : une carte rouge, jouable tout de suite dans le deck de départ
const recruit = (number: string): Reward => ({ kind: 'card', number, count: 1 });

// Portraits des personnages (illustration d'une carte jouable, ou qui le sera à l'étape 1)
const LUFFY = 'ST01-001';
const ZORO = 'ST01-013';
const NAMI_ARLONG = 'OP03-030';   // Nami tant qu'elle travaille pour Arlong
const NAMI = 'ST01-007';
const USOPP = 'OP03-041';
const SANJI = 'ST01-004';
const BAGGY = 'OP03-008';

export const EAST_BLUE: Arc = {
  id: 'east-blue',
  title: 'East Blue',
  region: 'east-blue',
  boosterSet: 'OP03',
  starterDeck: 'ST-01',
  chapters: [
    {
      id: 'eb-1-shells-town',
      order: 1,
      title: 'Le chasseur de pirates',
      place: 'Shells Town',
      map: { x: 0.1, y: 0.62 },
      opponent: { name: 'Capitaine Morgan', deck: 'AV-EB-MORGAN', level: 1 },
      intro: [
        { who: '', text: 'Un petit bateau, un chapeau de paille et un rêve plus grand que l’océan : Luffy a pris la mer. Première escale, Shells Town et sa base de la Marine.' },
        { who: 'Kobby', card: 'OP15-009', text: 'Luffy, fais attention ! Ici, tout le monde obéit au capitaine Morgan. Même la Marine a peur de lui.' },
        { who: 'Luffy', card: LUFFY, text: 'Et le type attaché au poteau dans la cour ? Il a l’air drôlement costaud. Je le veux dans mon équipage !' },
        { who: 'Hermep', card: 'OP03-091', text: 'Tu parles à Roronoa Zoro ? Mon père va vous faire enfermer tous les deux, le gamin au chapeau !' },
        { who: 'Morgan', card: 'OP11-094', text: 'Un pirate dans ma ville ? Soldats, en rang ! Montrez-lui qui commande à Shells Town.' },
      ],
      victory: [
        { who: 'Morgan', card: 'OP11-094', text: 'Battu… par un pirate sans navire ni équipage ?' },
        { who: 'Luffy', card: LUFFY, text: 'La ville est tranquille, et toi, tu es libre ! Alors, tu viens ?' },
        { who: 'Zoro', card: ZORO, text: 'Un capitaine qui fonce sans réfléchir… Ça me va. Je monte à bord.' },
        { who: 'Kobby', card: 'OP15-009', text: 'Moi, je reste. Je vais m’engager dans la Marine, la vraie, celle qui protège les gens !' },
        { who: '', text: 'Roronoa Zoro rejoint l’équipage.' },
      ],
      defeat: [
        { who: 'Morgan', card: 'OP11-094', text: 'Voilà ce qui arrive à ceux qui défient la Marine de Shells Town.' },
        { who: 'Luffy', card: LUFFY, text: 'Aïe… Ça pique, mais je n’ai pas dit mon dernier mot !' },
        { who: 'Zoro', card: ZORO, text: 'Hé, chapeau de paille. Reviens quand tu veux : moi, je ne bouge pas d’ici.' },
      ],
      rewards: [...boosters(2), recruit('OP01-025'), berry(firstWin)],
    },
    {
      id: 'eb-2-orange-town',
      order: 2,
      title: 'Le clown d’Orange Town',
      place: 'Orange Town',
      map: { x: 0.24, y: 0.36 },
      opponent: { name: 'Baggy le Clown', deck: 'AV-EB-BAGGY', level: 1 },
      intro: [
        { who: '', text: 'Les rues d’Orange Town sont désertes : les habitants se cachent depuis que la bande de Baggy occupe la ville.' },
        { who: 'Nami', card: NAMI_ARLONG, text: 'Moi, je vole les pirates, nuance. Baggy garde une carte de Grand Line, et je compte bien la lui prendre.' },
        { who: 'Luffy', card: LUFFY, text: 'Une carte de Grand Line ? On t’aide ! Tu ferais une super navigatrice, d’ailleurs.' },
        { who: 'Baggy', card: BAGGY, text: 'Qui ose entrer dans MA ville sans saluer le grand capitaine Baggy ? Préparez le canon !' },
        { who: 'Cabaji', card: 'OP02-052', text: 'Laissez-moi faire, capitaine. Un numéro d’acrobate, et le rideau tombe.' },
        { who: 'Morge', card: 'OP02-060', text: 'Richie n’a pas mangé depuis ce matin. Ça tombe bien.' },
      ],
      victory: [
        { who: 'Baggy', card: BAGGY, text: 'Mes morceaux ! Revenez ici, mes morceaux !' },
        { who: 'Nami', card: NAMI_ARLONG, text: 'J’ai la carte. Bon… je reste avec vous encore un peu. Mais c’est pour le trésor, hein.' },
        { who: 'Luffy', card: LUFFY, text: 'Ha ha ! Allez, on lève l’ancre !' },
      ],
      defeat: [
        { who: 'Baggy', card: BAGGY, text: 'Ha ha ha ! Personne ne se moque du grand Baggy ! Un boulet spécial, et hop, au large !' },
        { who: 'Zoro', card: ZORO, text: 'Relève-toi, capitaine. Ce clown fait plus de bruit que de mal.' },
        { who: 'Luffy', card: LUFFY, text: 'On recommence ! Cette fois, je lui écrase son chapeau de clown.' },
      ],
      rewards: [...boosters(2), berry(firstWin)],
    },
    {
      id: 'eb-3-sirop',
      order: 3,
      title: 'Le majordome de Sirop',
      place: 'Village de Sirop',
      map: { x: 0.38, y: 0.7 },
      opponent: { name: 'Kuro', deck: 'AV-EB-KURO', level: 1 },
      intro: [
        { who: '', text: 'Au village de Sirop, un garçon au long nez annonce chaque matin l’arrivée des pirates. Plus personne ne l’écoute.' },
        { who: 'Usopp', card: USOPP, text: 'Cette fois, c’est vrai ! J’ai entendu le majordome de Kaya préparer une attaque pour demain matin !' },
        { who: 'Kaya', card: 'OP03-044', text: 'Klahadore me sert depuis trois ans… Usopp, ce ne peut pas être lui.' },
        { who: 'Kuro', card: 'OP03-021', text: 'Trois ans de patience pour un plan sans défaut. Un gamin au chapeau de paille ne va pas tout gâcher.' },
        { who: 'Jango', card: 'OP03-028', text: 'Les pirates du Chat Noir sont prêts, capitaine. Le village dort encore.' },
      ],
      victory: [
        { who: 'Kuro', card: 'OP03-021', text: 'Mon plan… était parfait…' },
        { who: 'Kaya', card: 'OP03-044', text: 'Usopp, merci pour tout. Prenez ce navire : il vous attendait au port.' },
        { who: 'Usopp', card: USOPP, text: 'Un vrai navire ? Alors je viens ! Le grand capitaine Usopp… euh, le canonnier Usopp embarque !' },
        { who: 'Luffy', card: LUFFY, text: 'Bienvenue à bord, Usopp !' },
        { who: '', text: 'Usopp rejoint l’équipage.' },
      ],
      defeat: [
        { who: 'Kuro', card: 'OP03-021', text: 'Tout s’est déroulé exactement selon mes calculs.' },
        { who: 'Usopp', card: USOPP, text: 'On ne peut pas abandonner le village… Luffy, on y retourne ?' },
        { who: 'Luffy', card: LUFFY, text: 'Évidemment ! Personne ne touche aux amis d’Usopp.' },
      ],
      rewards: [...boosters(2), recruit('ST21-002'), berry(firstWin)],
    },
    {
      id: 'eb-4-baratie',
      order: 4,
      title: 'Le restaurant sur la mer',
      place: 'Baratie',
      map: { x: 0.54, y: 0.44 },
      opponent: { name: 'Don Krieg', deck: 'AV-EB-KRIEG', level: 1 },
      intro: [
        { who: '', text: 'Le Baratie, restaurant flottant, sert tous les marins de passage. Même les pirates affamés.' },
        { who: 'Zeff', card: 'OP03-047', text: 'Ici, on nourrit quiconque a faim. Ce qui se passe après le dessert, c’est une autre histoire.' },
        { who: 'Sanji', card: SANJI, text: 'Un repas pour l’homme qui mourait de faim, une raclée pour qui abîme ma cuisine.' },
        { who: 'Gyn', card: 'OP03-024', text: 'Don Krieg, le restaurant est à nous. Ils n’ont que des cuisiniers.' },
        { who: 'Don Krieg', card: 'OP03-025', text: 'Je prends ce navire, ses vivres et ses cuisiniers. Mon armada repart pour Grand Line !' },
      ],
      victory: [
        { who: 'Don Krieg', card: 'OP03-025', text: 'Impossible… Mon armure, mes armes… tout ça contre un gamin ?' },
        { who: 'Gyn', card: 'OP03-024', text: 'C’est fini, Don Krieg. On rentre. Merci pour le repas, Sanji.' },
        { who: 'Zeff', card: 'OP03-047', text: 'Va, Sanji. Ce que tu cherches ne se trouve pas dans cette cuisine.' },
        { who: 'Sanji', card: SANJI, text: 'D’accord, Luffy. Je serai le cuisinier de ton navire. Et pas de pillage du garde-manger !' },
        { who: '', text: 'Sanji rejoint l’équipage.' },
      ],
      defeat: [
        { who: 'Don Krieg', card: 'OP03-025', text: 'Je suis le plus fort de l’East Blue ! Rien ne résiste à mon armada !' },
        { who: 'Sanji', card: SANJI, text: 'Il a de la ressource, le bonhomme. Il en faudra plus pour fermer ma cuisine.' },
        { who: 'Luffy', card: LUFFY, text: 'Je n’ai pas fini ! Et en plus, j’ai encore faim.' },
      ],
      rewards: [...boosters(2), recruit('OP10-005'), berry(firstWin)],
    },
    {
      id: 'eb-defi-mihawk',
      order: 5,
      title: 'Défi ultime : le plus grand épéiste',
      place: 'Baratie',
      map: { x: 0.62, y: 0.18 },
      opponent: { name: 'Mihawk', deck: 'META-MIHAWK-2026-10', level: 4 },
      optional: true,
      rules: { note: 'Défi ultime : Mihawk joue un deck d’aujourd’hui avec l’IA entraînée, bien plus fort que les decks d’OP03. Il est fait pour être presque imbattable : la victoire rapporte un display entier et de quoi en acheter un autre.' },
      intro: [
        { who: '', text: 'Un bateau minuscule glisse vers le Baratie. À son bord, un seul homme et une épée immense.' },
        { who: 'Zoro', card: ZORO, text: 'C’est lui, le meilleur épéiste du monde. Luffy, celui-là, je m’en occupe seul.' },
        { who: 'Mihawk', card: 'OP15-027', text: 'Tu as du cran, jeune épéiste. Voyons si ta lame en a autant.' },
        { who: 'Luffy', card: LUFFY, text: 'Vas-y, Zoro ! On est tous derrière toi.' },
      ],
      victory: [
        { who: 'Mihawk', card: 'OP15-027', text: 'Intéressant. Il y a longtemps que personne ne m’avait tenu tête ainsi.' },
        { who: 'Zoro', card: ZORO, text: 'Ce n’est qu’un début. Le jour où je te battrai pour de bon, toutes les mers le sauront.' },
        { who: 'Mihawk', card: 'OP15-027', text: 'Je t’attendrai au sommet. Ne me fais pas attendre trop longtemps.' },
      ],
      defeat: [
        { who: 'Mihawk', card: 'OP15-027', text: 'Reviens quand ta lame sera aussi solide que ta volonté.' },
        { who: 'Zoro', card: ZORO, text: 'Encore une fois. Je m’entraînerai jour et nuit s’il le faut.' },
        { who: 'Luffy', card: LUFFY, text: 'Il reviendra plus fort. Et nous aussi !' },
      ],
      rewards: [...boosters(DISPLAY.boostersPerDisplay), berry(DISPLAY.display)],
    },
    {
      id: 'eb-5-arlong-park',
      order: 6,
      title: 'Le parc des hommes-poissons',
      place: 'Arlong Park',
      map: { x: 0.74, y: 0.68 },
      opponent: { name: 'Arlong', deck: 'AV-EB-ARLONG', level: 1 },
      intro: [
        { who: '', text: 'Au village de Cocoyashi, chacun paie Arlong pour rester en vie. Nami paie depuis des années, en secret, pour racheter son village.' },
        { who: 'Nojiko', card: 'OP03-048', text: 'Ma sœur a tout porté seule. Elle ne vous demandera jamais d’aide : elle est bien trop fière.' },
        { who: 'Genzo', card: 'OP03-046', text: 'Aucun humain n’a jamais tenu tête à Arlong. Partez pendant qu’il est encore temps.' },
        { who: 'Luffy', card: LUFFY, text: 'Nami est notre amie. On ne repartira pas sans elle.' },
        { who: 'Arlong', card: 'OP03-022', text: 'Des humains qui viennent réclamer ma cartographe ? Hatchan, Kuroobi, Chew : accueillez-les.' },
      ],
      victory: [
        { who: 'Arlong', card: 'OP03-022', text: 'Mon parc… Mon empire…' },
        { who: 'Genzo', card: 'OP03-046', text: 'C’est fini ! Cocoyashi est libre !' },
        { who: 'Nami', card: NAMI, text: 'Je n’ai plus rien à racheter. Alors je viens avec vous, pour de bon cette fois.' },
        { who: 'Luffy', card: LUFFY, text: 'Évidemment que tu viens ! Tu es notre navigatrice.' },
        { who: '', text: 'Nami rejoint l’équipage.' },
      ],
      defeat: [
        { who: 'Arlong', card: 'OP03-022', text: 'Les humains sont faibles, et vous ne faites pas exception.' },
        { who: 'Usopp', card: USOPP, text: 'J’ai les jambes en compote… mais on ne peut pas laisser Nami ici !' },
        { who: 'Luffy', card: LUFFY, text: 'Debout, tout le monde. On y retourne.' },
      ],
      rewards: [...boosters(2), recruit('OP01-016'), berry(firstWin)],
    },
    {
      id: 'eb-defi-baggy',
      order: 7,
      title: 'Défi : l’échafaud de Loguetown',
      place: 'Loguetown',
      map: { x: 0.82, y: 0.14 },
      opponent: { name: 'Baggy et Alvida', deck: 'AV-EB-BAGGY-ALVIDA', level: 1 },
      optional: true,
      intro: [
        { who: '', text: 'Sur la grand-place de Loguetown se dresse l’échafaud où l’histoire des pirates a basculé. Luffy veut le voir de tout près.' },
        { who: 'Luffy', card: LUFFY, text: 'C’est d’ici qu’on voit Grand Line ? Je monte voir !' },
        { who: 'Baggy', card: BAGGY, text: 'Surprise, chapeau de paille ! Le grand Baggy n’oublie jamais une humiliation.' },
        { who: 'Alvida', card: 'OP01-064', text: 'Tu te souviens de moi ? Je suis devenue la plus belle des pirates… et la plus rancunière.' },
        { who: 'Zoro', card: ZORO, text: 'Encore ce clown ? Il ne lâche jamais l’affaire.' },
      ],
      victory: [
        { who: 'Baggy', card: BAGGY, text: 'Encore raté ! Je reviendrai, chapeau de paille, tu m’entends ?' },
        { who: 'Alvida', card: 'OP01-064', text: 'Baggy, tu m’avais promis une victoire facile.' },
        { who: 'Luffy', card: LUFFY, text: 'Ha ha ! Ce clown me fera toujours rire.' },
      ],
      defeat: [
        { who: 'Baggy', card: BAGGY, text: 'Ha ha ha ! Toute la ville est venue voir mon spectacle !' },
        { who: 'Sanji', card: SANJI, text: 'Tout le monde debout. On va chercher notre capitaine.' },
        { who: 'Luffy', card: LUFFY, text: 'Je ne m’arrête pas ici. Pas avant Grand Line !' },
      ],
      rewards: [...boosters(3), berry(firstWinBonus)],
    },
    {
      id: 'eb-6-loguetown',
      order: 8,
      title: 'Dernière escale avant Grand Line',
      place: 'Loguetown',
      map: { x: 0.92, y: 0.4 },
      opponent: { name: 'Smoker', deck: 'AV-EB-SMOKER', level: 1 },
      intro: [
        { who: '', text: 'Loguetown, dernière ville avant Grand Line. Le capitaine Smoker y veille, et aucun pirate ne lui a jamais échappé.' },
        { who: 'Smoker', card: 'OP02-093', text: 'Chapeau de paille. Ta prime ne m’intéresse pas. Simplement, aucun pirate ne passe par ici.' },
        { who: 'Tashigi', card: 'ST06-006', text: 'Capitaine, l’épéiste aux trois sabres est avec lui. Je m’en charge.' },
        { who: 'Zoro', card: ZORO, text: 'Une épéiste de la Marine ? Si tu veux mes sabres, viens les chercher.' },
        { who: 'Luffy', card: LUFFY, text: 'Grand Line est juste derrière toi. Pousse-toi, monsieur Fumée !' },
      ],
      victory: [
        { who: 'Smoker', card: 'OP02-093', text: 'Va, chapeau de paille. Je te retrouverai sur Grand Line.' },
        { who: 'Nami', card: NAMI, text: 'Une tempête se lève, c’est maintenant ou jamais ! Tout le monde à bord !' },
        { who: 'Luffy', card: LUFFY, text: 'En route pour Grand Line ! L’aventure ne fait que commencer !' },
        { who: '', text: 'L’East Blue est derrière eux. Devant, la mer la plus dangereuse du monde.' },
      ],
      defeat: [
        { who: 'Smoker', card: 'OP02-093', text: 'Fin du voyage, pirate. Ici, c’est moi qui décide qui prend la mer.' },
        { who: 'Tashigi', card: 'ST06-006', text: 'Ce n’était pas si difficile, capitaine.' },
        { who: 'Luffy', card: LUFFY, text: 'Ne crie pas victoire trop vite. Je reviens tout de suite !' },
      ],
      rewards: [...boosters(4), berry(firstWinFinal)],
    },
  ],
};
