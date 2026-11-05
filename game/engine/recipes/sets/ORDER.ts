// Ordre des sets de l'étape C (tâche 0, d'après l'étude C0 § 7) : du plus récent au plus ancien, décision de
// l'utilisateur du 5 novembre 2026. Une tâche « set » (S1 à S20) traite les préfixes de numéros de sa ligne ; les
// petits ST sont regroupés, les promos (P) sont à la fin. Les sets sans carte à faire (ST31 à ST36, ST30, ST22, ST21,
// OP03, ST01 : tout codé ou géré d'office) sont rangés avec la tâche voisine, pour que chaque préfixe ait une tâche.
// Un nouveau set s'ajoute EN TÊTE (tâche suivante), sans renuméroter les autres.

export interface SetTask {
  task: string;      // 'S1'
  wave: number;      // vague S : 1 (S1-S5), 2 (S6-S10), 3 (S11-S15), 4 (S16-S20)
  port: number;      // 3640 + numéro
  sets: string[];    // préfixes des numéros de cartes ('EB05' pour EB05-001), du plus récent au plus ancien
}

const TASKS: [string[], number][] = [
  [['EB05', 'OP17', 'ST36', 'ST35', 'ST34', 'ST33', 'ST32', 'ST31'], 1],
  [['OP16', 'ST30'], 1],
  [['OP15'], 1],
  [['EB03', 'EB04'], 1],
  [['OP14', 'ST29'], 1],
  [['OP13', 'PRB02'], 2],
  [['ST22', 'OP12', 'ST28', 'ST27', 'ST26', 'ST25', 'ST24', 'ST23'], 2],
  [['OP11'], 2],
  [['EB02', 'OP10', 'ST21'], 2],
  [['OP09', 'PRB01', 'ST20', 'ST19', 'ST18', 'ST17', 'ST16', 'ST15'], 2],
  [['OP08', 'ST14'], 3],
  [['OP07'], 3],
  [['EB01', 'ST13'], 3],
  [['OP06', 'ST12', 'ST11'], 3],
  [['OP05', 'ST10'], 3],
  [['OP04'], 4],
  [['ST09', 'ST08', 'OP03', 'ST07', 'ST06', 'ST05', 'ST04', 'ST03', 'ST02'], 4],
  [['OP02'], 4],
  [['OP01', 'ST01'], 4],
  [['P'], 4],
];

export const SET_TASKS: SetTask[] = TASKS.map(([sets, wave], i) => ({ task: `S${i + 1}`, wave, port: 3641 + i, sets }));

// Tous les préfixes, du plus récent au plus ancien (ordre de traitement)
export const SET_ORDER: string[] = SET_TASKS.flatMap((t) => t.sets);

// Préfixe de set d'un numéro de carte : 'OP17-001' → 'OP17', 'P-042' → 'P'
export const setOf = (num: string): string => num.split('-')[0];

export function taskOfSet(set: string): SetTask | undefined {
  return SET_TASKS.find((t) => t.sets.includes(set));
}
