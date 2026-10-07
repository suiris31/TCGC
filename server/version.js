// Version du programme (commit git) : notée avec chaque partie du jeu, et envoyée avec les cartes pour que l'interface
// d'un navigateur resté ouvert sur une version plus ancienne propose de se recharger
import { execSync } from 'node:child_process';
import { config } from './config.js';

export const ENGINE = (() => {
  try {
    return execSync('git describe --always --dirty', { cwd: config.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'inconnue';
  }
})();
