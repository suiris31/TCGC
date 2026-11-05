// Traducteur (tâche C1.4) : normalisation du texte officiel anglais, vocabulaire commun, erreurs « non compris » et
// gabarits du rapport. Ce module ne dépend de rien d'autre du traducteur (target.ts et structure.ts l'importent).
//
// Le texte n'est lu que pendant le développement (cards:new, tests), jamais pendant une partie. Rien de ce qui sort
// d'ici vers un fichier du dépôt ne contient une phrase de carte : le rapport passe par template().
import type { Keyword } from '../types.ts';

// ---------- Vocabulaire commun ----------

// Mots-clés lus par le moteur (« Rush: Character » avant « Rush » : la plus longue d'abord)
export const KEYWORDS: readonly Keyword[] = ['Rush: Character', 'Blocker', 'Rush', 'Double Attack', 'Banish', 'Unblockable'];
export const KEYWORD_RE = '(Rush: Character|Blocker|Rush|Double Attack|Banish|Unblockable)';

// Étiquettes entre crochets qui ne sont pas des noms de cartes (après normalisation : « On K.O. » devient « On KO »)
export const TAGS: readonly string[] = [
  'On Play', 'When Attacking', 'Activate: Main', 'Main', 'Counter', 'On KO', 'End of Your Turn',
  "End of Your Opponent's Turn", "On Your Opponent's Attack", 'On Block', 'Trigger',
  'Once Per Turn', 'Your Turn', "Opponent's Turn",
];
// Étiquettes qui ouvrent une capacité (pas [Trigger] : il peut être cité dans une phrase)
// (aucun caractère spécial des expressions régulières dans TAGS)
const STARTS = [...TAGS.filter((t) => t !== 'Trigger'), 'DON!! x\\d+'];
const isTag = (inner: string) => TAGS.includes(inner) || (KEYWORDS as readonly string[]).includes(inner) || /^DON!! x\d+$/.test(inner);

// ---------- « Non compris » ----------

// Un morceau que le traducteur ne sait pas lire. `part` : le morceau (texte de carte, à ne jamais écrire tel quel :
// passer par template()) ; `why` : la sorte de morceau, avec nos mots (« action », « condition », « filtre »...) ;
// `detail` : le reste en cause (texte de carte aussi, passé par template()).
export class Unknown extends Error {
  readonly part: string;
  readonly why: string;
  readonly detail?: string;
  constructor(part: string, why: string, detail?: string) {
    super(`${why} : ${part}`);
    this.part = part;
    this.why = why;
    this.detail = detail;
  }
}

export function fail(part: string, why: string, detail?: string): never {
  throw new Unknown(part, why, detail);
}

// Essaie fn ; un Unknown est rendu au lieu d'être levé (les autres erreurs remontent : ce sont des bugs du traducteur)
export function attempt<T>(fn: () => T): T | Unknown {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Unknown) return e;
    throw e;
  }
}

// Ligne du rapport : « sorte (« reste ») : « gabarit » », chiffres, {types}, [noms], <attributs> et "..." remplacés
export function reportLine(u: Unknown): string {
  const detail = u.detail && u.detail !== u.part ? ` (« ${template(u.detail)} »)` : '';
  return `${u.why}${detail} : « ${template(u.part)} »`;
}

// ---------- Normalisation ----------

// Caractères protégés à l'intérieur de [noms], {types} et <attributs> : un point, une virgule, une parenthèse ou un
// « and » dans un nom (« [Dr. Hogback] », « [Mr.3(Galdino)] ») ne doit couper ni une phrase ni une liste.
const PROTECT: Record<string, string> = { '.': '', ',': '', ' ': '', '(': '', ')': '', ':': '', ';': '', '"': '' };
const UNPROTECT: Record<string, string> = Object.fromEntries(Object.entries(PROTECT).map(([a, b]) => [b, a]));
const CLOSE: Record<string, string> = { '[': ']', '{': '}', '<': '>' };

export function protect(s: string): string {
  let out = '';
  let close = '';
  for (const ch of s) {
    if (!close && CLOSE[ch]) { close = CLOSE[ch]; out += ch; continue; }
    if (close && ch === close) { close = ''; out += ch; continue; }
    out += close && PROTECT[ch] ? PROTECT[ch] : ch;
  }
  return out;
}
export function unprotect(s: string): string {
  return s.replace(/[-]/g, (c) => UNPROTECT[c]);
}

// Texte officiel → texte normalisé : rappels de règle (entre parenthèses) retirés, « K.O. » → « KO » (le point ne doit
// pas couper la phrase), tirets, apostrophes, guillemets et chevrons unifiés, chiffres cerclés unifiés (➀ et ① :
// épuiser N DON!!), espaces nettoyés, lignes vides et lignes « - » (carte sans effet) retirées. Sert aussi à
// l'aller-retour (describe.ts produit un texte qui se compare à celui-ci).
export function normalize(text: string): string {
  let t = text
    .replace(/\r\n?/g, '\n')
    .replace(/[−－–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/＜/g, '<').replace(/＞/g, '>')
    .replace(/K\.O\./g, 'KO')
    .replace(/➀/g, '①').replace(/➁/g, '②').replace(/➂/g, '③').replace(/➃/g, '④').replace(/➄/g, '⑤');
  t = protect(t);
  // rappels de règle : (…) avec au plus un niveau de parenthèses dedans
  t = t.replace(/\((?:[^()]|\([^()]*\))*\)/g, '');
  t = unprotect(t);
  // une capacité collée à la précédente, sans retour à la ligne (« ...Characters.[On Your Opponent's Attack] », EB01-002)
  t = t.replace(new RegExp(`\\.[ \\t]*(?=\\[(?:${STARTS.join('|')})\\])`, 'g'), '.\n');
  return t
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/\s+([.,:;])/g, '$1'))
    .filter((l) => l && !/^-$/.test(l))
    .join('\n');
}

// ---------- Gabarits ----------

// Tournure d'un morceau : chiffres → N, {types} → {T}, <attributs> → <A>, "..." → "X", [noms] → [X] (les étiquettes
// et les mots-clés restent). Sert au rapport (tournures classées par fréquence) : jamais une phrase de carte telle
// quelle dans un fichier du dépôt.
export function template(part: string): string {
  return part
    .replace(/\{[^}]+\}/g, '{T}')
    .replace(/<[^>]+>/g, '<A>')
    .replace(/\[([^\]]+)\]/g, (m, inner: string) => (isTag(inner) ? m : '[X]'))
    .replace(/"[^"]+"/g, '"X"')
    .replace(/\d+/g, 'N')
    .replace(/[-]/g, (c) => UNPROTECT[c]);
}
