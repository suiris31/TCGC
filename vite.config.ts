import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Version du programme enregistrée avec chaque partie du jeu (pour pouvoir la rejouer avec le même moteur)
function engineVersion() {
  try {
    return execSync('git describe --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'inconnue';
  }
}

export default defineConfig({
  root: 'web',
  // chemins relatifs : l'appli peut être servie à la racine d'un site ou dans un sous-dossier (ex. /tcgc/)
  base: './',
  plugins: [react()],
  define: { __ENGINE__: JSON.stringify(engineVersion()) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true, // accessible depuis le téléphone pendant le développement
    port: 5173,
    // le jeu (dossier game/) est en dehors de la racine web/
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3000',
      '/img': 'http://localhost:3000',
    },
  },
});
