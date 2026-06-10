import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['jspdf', 'pptxgenjs', 'html-to-image'],
  },
  server: {
    port: 5190,
    watch: {
      // Server-side and data files: the node backend rewrites some of these
      // at runtime (presetBlocks cache, users/sessions fallbacks) and tools
      // edit server.js/prompts.js while the app is open. None of them are
      // frontend modules, but a write to any watched root file forces a full
      // page reload (visible flash + lost app state) via Tailwind v4's
      // whole-root source scanning. Keep them out of the watcher entirely.
      ignored: [
        '**/server.js',
        '**/prompts.js',
        '**/presetBlocks.json',
        '**/.write-test',
        '**/*.log',
        '**/users.json',
        '**/sessions.json',
        '**/social.json',
        '**/textbooks.json',
        '**/parties.json',
        '**/data/**',
        '**/scripts/**',
        '**/uploads/**',
        '**/electron/**',
        '**/build/**',
        '**/games/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        // Required for SSE streaming
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Ensure no buffering for SSE
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes) => {
            // Disable response buffering for SSE
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
