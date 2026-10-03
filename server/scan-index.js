// Construit (ou complète) l'index de reconnaissance : `npm run index-images`
// Avec --rebuild, l'index existant est supprimé et recalculé entièrement.
import { buildIndex, deleteIndex } from './scan.js';

if (process.argv.includes('--rebuild')) deleteIndex();

await buildIndex();
