// Traducteur (tâche C1.4, familles en vague C2) : texte officiel anglais → recette. Le texte n'est lu que pendant le
// développement (cards:new, tests), jamais pendant la partie.
//
//   normalize.ts   normalisation, gabarits du rapport, « non compris » (Unknown)
//   structure.ts   lignes, capacités, phrases, enchaînements ; interface des familles (Family, Rule, Helpers)
//   target.ts      filtres, cibles et durées (communs à toutes les familles), garde-fous
//   <famille>.ts   règles d'une famille (vague C2 : removal, power, cards, don, life, play) ; <set>.ts (tâches « set »)
//
// Point d'enregistrement (01-contrats.md § 15.6) : une famille ajoute son import et son entrée dans FAMILIES, à la fin,
// sans réorganiser le reste. Les familles sont essayées dans l'ordre de la liste.
import type { Recipe } from '../types.ts';
import { normalize, reportLine } from './normalize.ts';
import { analyzeCard, isStructural, type Family } from './structure.ts';
import { REMOVAL } from './removal.ts';
import { POWER } from './power.ts';
import { LIFE } from './life.ts';

export type { Family, Helpers, Rule, Continuation } from './structure.ts';

// Familles de règles, dans l'ordre où elles sont essayées (vide tant que la vague C2 n'est pas fusionnée)
export const FAMILIES: Family[] = [
  REMOVAL,
  POWER,
  LIFE,
];

// ok : recette sans reste ; sinon, la recette partielle (ce qui est compris) et les morceaux non compris, normalisés
// (chiffres, {types}, [noms] remplacés : jamais une phrase de carte telle quelle dans un fichier du dépôt)
export type ParseResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; partial?: Recipe; unknown: string[] };

export interface ParseInput {
  num: string;
  effectEn: string;
  triggerEn: string | null;
}

// Rapport détaillé d'une carte (pour cards:new et game:coverage) : en plus du résultat, le nombre de capacités lues et
// les morceaux non compris qui viennent de la structure elle-même (0 attendu sur tout le catalogue)
export interface ParseReport {
  result: ParseResult;
  abilities: number;
  understood: number;
  structure: string[];
}

export function parseCardReport(input: ParseInput, families: readonly Family[] = FAMILIES): ParseReport {
  const a = analyzeCard(input.num, normalize(input.effectEn ?? ''), normalize(input.triggerEn ?? ''), families);
  const unknown = a.errors.map(reportLine);
  const r = a.recipe;
  const hasSomething = r.abilities.length > 0 || Boolean(r.trigger || r.keywords?.length || r.alsoNamed?.length);
  const result: ParseResult = unknown.length
    ? { ok: false, partial: hasSomething ? r : undefined, unknown }
    : { ok: true, recipe: r };
  return { result, abilities: a.abilities, understood: a.understood, structure: a.errors.filter(isStructural).map(reportLine) };
}

export function parseCard(input: ParseInput, families: readonly Family[] = FAMILIES): ParseResult {
  return parseCardReport(input, families).result;
}
