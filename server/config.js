import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  root,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.join(root, 'data'),
  dbPath: process.env.TCGC_DB ?? path.join(root, 'data', 'tcgc.db'),
  imagesDir: path.join(root, 'data', 'images'),
  modelsDir: path.join(root, 'data', 'models'),
  distDir: path.join(root, 'dist'),

  // Catalogue + prix TCGplayer (miroir quotidien public de tcgcsv.com)
  tcgcsvBase: 'https://tcgcsv.com/tcgplayer',
  tcgplayerCategory: 68, // One Piece Card Game (anglais)
  ecbRatesUrl: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',

  // Re-synchronise automatiquement si les données ont plus de X heures
  syncMaxAgeHours: 20,
};
