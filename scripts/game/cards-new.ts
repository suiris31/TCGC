// Chaîne « nouveau set » (tâche C1.5) : traduit les cartes d'un set qui ne sont ni codées ni déjà en recette, écrit
// recipes/sets/<set>.ts (niveau 'generated'), lance aller-retour, tests générés et parties au hasard, et fait le rapport.
//   npm run cards:new -- <set>
// Squelette de la tâche 0 (01-contrats.md § 15.5) : la commande existe, le travail est celui de C1.5.
import '../../game/data/load-local.ts';

const set = process.argv[2];
if (!set) {
  console.error('Usage : npm run cards:new -- <set>   (exemple : EB05)');
  process.exit(1);
}
console.log(`cards:new ${set} : pas encore écrit (tâche C1.5).`);
