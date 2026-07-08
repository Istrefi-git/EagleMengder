import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serverer prosjektet under /EagleMengder/. Basen sørger for at
  // alle bygde ressurser (JS/CSS/PDF-worker) lastes fra riktig sti.
  base: '/EagleMengder/',
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});
