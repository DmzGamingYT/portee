import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { itunesProxyPlugin } from './server/itunesProxy.ts';
import { spotifyProxyPlugin } from './server/spotifyProxy.ts';

// `VITE_BASE` permet de servir le build sous un sous-chemin (GitHub Pages :
// `/spotifycraft/`). En local, la racine reste `/`.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), itunesProxyPlugin(), spotifyProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5184,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5185,
    strictPort: true,
  },
});
