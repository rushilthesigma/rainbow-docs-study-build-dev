import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import desktopConfig from './vite.config.js';

export default defineConfig(() => mergeConfig(desktopConfig, {
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./mobile.html', import.meta.url)),
      },
    },
  },
}));
