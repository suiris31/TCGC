// Télécharge les informations officielles des cartes jouables dans data/game-cards.json (utilisé par les tests et les
// scripts ; le serveur fait la même chose tout seul à son démarrage).
//   npm run game:cards [fichier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchCardData } from '../../game/data/fetch.ts';
import { CARDS_FILE } from '../../game/data/node.ts';

const file = process.argv[2] ?? CARDS_FILE;
const data = await fetchCardData(console.log);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
console.log(`${Object.keys(data).length} cartes enregistrées dans ${file}`);
