import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { itunesProxyPlugin } from './server/itunesProxy';

export default defineConfig({
  plugins: [react(), itunesProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5184,
  },
});