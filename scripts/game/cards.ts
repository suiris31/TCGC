// Télécharge le catalogue des cartes (listes officielles française et anglaise) dans data/game-catalog.json, utilisé
// par les tests et les scripts ; le serveur fait la même chose tout seul à son démarrage.
//   npm run game:cards [fichier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchCatalog } from '../../game/data/catalog.ts';
import { CATALOG_FILE } from '../../game/data/node.ts';
import { missingCards } from '../../game/engine/cards/index.ts';

const file = process.argv[2] ?? CATALOG_FILE;
const catalog = await fetchCatalog(console.log);
const missing = missingCards(catalog.cards);
if (missing.length) throw new Error(`cartes des decks absentes du catalogue : ${missing.join(', ')}`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(catalog)}\n`);
console.log(`${Object.keys(catalog.cards).length} cartes enregistrées dans ${file}`);
