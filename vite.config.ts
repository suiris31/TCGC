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
  // fil de calcul de l'IA en module ES : il charge onnxruntime-web à la demande (niveau « IA entraînée »)
  worker: { format: 'es' },
  define: { __ENGINE__: JSON.stringify(engineVersion()) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true, // accessible depuis le téléphone pendant le développement
    port: 5173,
    // le jeu (dossier game/) est en dehors de la racine web/
    fs: { allow: ['..'] },
    // changeOrigin: false : le serveur reçoit l'adresse de la page (Host), comme en production ; sinon sa protection
    // contre les requêtes d'un autre site refuse connexion et inscription (Vite 8 réécrit Host par défaut)
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/img': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
