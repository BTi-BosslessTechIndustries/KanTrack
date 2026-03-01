import { defineConfig } from 'vite';

export default defineConfig({
  // Cloudflare Pages serves from /, which is Vite's default — no base override needed.

  resolve: {
    // Strip .js from relative imports so Rollup can resolve the .ts equivalents.
    // Needed because .js files import converted modules using the original .js extension
    // (e.g. './kantrack-modules/store.js' resolves to store.ts).
    alias: [{ find: /^(\.\.?\/.*?)\.js$/, replacement: '$1' }],
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
