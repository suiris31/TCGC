import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  // chemins relatifs : l'appli peut être servie à la racine d'un site ou dans un sous-dossier (ex. /tcgc/)
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true, // accessible depuis le téléphone pendant le développement
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/img': 'http://localhost:3000',
    },
  },
});
