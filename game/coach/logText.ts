// Le journal de la partie, dit à la deuxième personne.
//
// Le moteur écrit le journal à la troisième personne, au nom de chaque joueur : « Toi joue en premier », « Toi termine
// son tour », « IA touche le Leader de Toi ». On ne change pas ces phrases : le coach les lit (review.ts), et les
// parties enregistrées les gardent telles quelles. C'est l'affichage qui les tourne vers toi : « Tu joues en
// premier », « Tu termines ton tour », « IA touche ton Leader ». Les parties anciennes s'affichent donc de la même
// façon. Fonctions pures (game/tests/log-text.test.ts).
import type { GameState, LogEntry, PlayerId } from '../engine/types.ts';

export const playerNames = (s: Pick<GameState, 'players'>): string[] => s.players.map((p) => p.name);

// Une ligne prête à afficher : `who` en gras devant `text` (« Tu », le nom de l'adversaire), ou null si `text` est
// une phrase complète (« Ton Leader gagne +1000 de puissance pour le combat »)
export interface SaidLine {
  who: string | null;
  text: string;
}

// ---------- Tes actions : du « il » au « tu » ----------

const IRREGULAR: Record<string, string> = {
  a: 'as', est: 'es', va: 'vas', peut: 'peux', reçoit: 'reçois', perd: 'perds', reprend: 'reprends',
};

// les verbes par lesquels le moteur dit ce que fait un joueur (en tête de ligne, ou après « et », « , », « ne »)
const VERBS = new Set([
  'a', 'active', 'ajoute', 'bloque', 'contre', 'déclare', 'défausse', 'déplace', 'donne', 'épuise', 'gagne', 'garde',
  'inflige', 'joue', 'jouera', 'mélange', 'perd', 'peut', 'pioche', 'place', 'redresse', 'redressera', 'regarde',
  'rejoue', 'renvoie', 'repioche', 'reprend', 'retourne', 'révèle', 'termine', 'touche',
]);

function second(verb: string): string {
  return IRREGULAR[verb] ?? `${verb}s`;
}

// un verbe du joueur en tête de phrase (après « ne », « n' » ou un pronom : « et la place », « et en place »)
const CLAUSE = /(^|, (?:et )?| et )((?:ne |n['’])?(?:(?:la|les|en) |l['’])?)(\p{L}+)/gu;

function startsWithVerb(text: string): boolean {
  const m = /^(?:ne |n['’])?(\p{L}+)/u.exec(text);
  return !!m && VERBS.has(m[1]);
}

// « son », « sa », « ses » du joueur → « ton », « ta », « tes » : seulement devant ce qui est à lui, pour ne toucher ni
// à ceux d'une carte (« active son [Déclenchement] », « de son propriétaire ») ni aux noms des cartes (« Quand les
// rêves de ses camarades ont été bafoués !! »)
const OWN = '(?=(?:prochaine? )?(?:Leader|deck|tour|adversaire|Vie|main|Défausse|phase|Personnages?|effets(?! annulés)|DON!!|«|\\{))';
const OWNED: [RegExp, string][] = [
  [new RegExp(`(?<![\\p{L}'’])son ${OWN}`, 'gu'), 'ton '],
  [new RegExp(`(?<![\\p{L}'’])sa ${OWN}`, 'gu'), 'ta '],
  [new RegExp(`(?<![\\p{L}'’])ses ${OWN}`, 'gu'), 'tes '],
];

function yourThings(text: string): string {
  return OWNED.reduce((t, [from, to]) => t.replace(from, to), text)
    .replace(/il lui en reste/g, 'il t’en reste')
    .replace(/il lui reste/g, 'il te reste');
}

// ta ligne, sans le sujet : « termine son tour » → « termines ton tour »
function toYou(text: string): string {
  const verbs = text.replace(CLAUSE, (all, before: string, pre: string, word: string) => (VERBS.has(word) ? `${before}${pre}${second(word)}` : all));
  return yourThings(verbs);
}

// ---------- Les actions de l'adversaire : ce qui est « adverse », c'est à toi ----------

const YOURS: [RegExp, string][] = [
  [/tous les Personnages adverses/g, 'tous tes Personnages'],
  [/les Personnages adverses/g, 'tes Personnages'],
  [/un Personnage adverse/g, 'un de tes Personnages'],
  [/le Leader adverse/g, 'ton Leader'],
  [/la Vie adverse/g, 'ta Vie'],
  [/la Défausse adverse/g, 'ta Défausse'],
  [/du deck adverse/g, 'de ton deck'],
  [/1 DON!! épuisée adverse/g, '1 de tes DON!! épuisées'],
  [/1 DON!! adverse/g, '1 de tes DON!!'],
  [/du prochain tour adverse/g, 'de ton prochain tour'],
  [/la prochaine phase de Recharge adverse/g, 'ta prochaine phase de Recharge'],
];

function toOpponent(text: string): string {
  return YOURS.reduce((t, [from, to]) => t.replace(from, to), text);
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ton nom dans une phrase du moteur : « le Leader de Toi » ; dans une phrase du jeu (début et fin de partie), aussi
// en sujet : « Toi joue en premier » (pas dans une ligne de l'adversaire, qui peut commencer par une carte dont le nom
// commence comme ton pseudo)
function namedYou(text: string, me: string, subject: boolean): string {
  if (!me) return text;
  if (subject && text.startsWith(`${me} `)) return `Tu ${toYou(text.slice(me.length + 1))}`;
  return text.split(`le Leader de ${me}`).join('ton Leader');
}

// Hawkins (OP10-109) : « place dans la Défausse adverse la carte du dessus de sa Vie (…) : il lui reste N Vie », où
// « sa Vie » et « lui » sont ceux de l'adversaire
const HAWKINS = /^place dans la Défausse adverse la carte du dessus de sa Vie/;
// l'attaque : « Kaido (7000) attaque Monkey D. Luffy (Leader, 5000) »
const ATTACK = /^(.+?) \((-?\d+)\) attaque (.+)$/;

// ---------- Ce qu'on affiche ----------

// Une ligne du journal vue par `human` (son siège ; `names` : les noms des joueurs dans la partie)
export function sayLog(l: Pick<LogEntry, 'player' | 'text'>, human: PlayerId, names: readonly string[]): SaidLine {
  const me = names[human] ?? '';
  const t = l.text;
  if (t.startsWith('—')) return { who: null, text: me ? t.replace(` : ${me} —`, ' : à toi —') : t };
  if (l.player === null) return { who: null, text: namedYou(t, me, true) };
  const attack = ATTACK.exec(t);
  if (l.player === human) {
    if (attack) return { who: 'Tu', text: `attaques ${attack[3]} avec ${attack[1]} (${attack[2]})` };
    if (HAWKINS.test(t)) return { who: 'Tu', text: `places${t.slice('place'.length)}` };
    if (/^l['’]adversaire /.test(t)) return { who: null, text: `Ton adversaire${t.slice('l’adversaire'.length).replace('quand son Leader', 'quand ton Leader')}` };
    if (startsWithVerb(t)) return { who: 'Tu', text: toYou(t) };
    return { who: null, text: capital(yourThings(t)) };
  }
  const who = names[l.player] ?? '';
  if (attack) return { who, text: `attaque ${attack[3]} avec ${attack[1]} (${attack[2]})` };
  if (HAWKINS.test(t)) {
    return { who, text: t.replace('la Défausse adverse la carte du dessus de sa Vie', 'ta Défausse la carte du dessus de ta Vie').replace('il lui reste', 'il te reste') };
  }
  // « IA joue Kaido » ; une phrase qui a son propre sujet : « IA : l'attaque touche ton Leader »
  return { who: startsWithVerb(t) ? who : `${who} :`, text: toOpponent(namedYou(t, me, false)) };
}

// La même ligne en une seule phrase (annonces lues, récap du coach)
export function sayLogLine(l: Pick<LogEntry, 'player' | 'text'>, human: PlayerId, names: readonly string[]): string {
  const said = sayLog(l, human, names);
  return said.who ? `${said.who} ${said.text}` : said.text;
}

// Une phrase du moteur qui nomme les joueurs (la raison de la fin de partie : « IA touche le Leader de Toi, qui n'a
// plus de Vie » → « IA touche ton Leader, qui n'a plus de Vie »)
export function sayText(text: string, human: PlayerId, names: readonly string[]): string {
  return namedYou(text, names[human] ?? '', true);
}

// La raison de la fin de la partie, vue par `human`
export function sayReason(s: Pick<GameState, 'players' | 'winReason'>, human: PlayerId): string {
  return s.winReason ? sayText(s.winReason, human, playerNames(s)) : '';
}
