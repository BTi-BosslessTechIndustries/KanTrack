import { defineConfig } from 'vite';

export default defineConfig({
  // Cloudflare Pages serves from /, which is Vite's default — no base override needed.

  // jsPDF v4 bundles html2canvas and dompurify as optional deps with complex
  // ESM chunk structures that Vite's dep optimizer cannot pre-bundle correctly.
  // Excluding them makes Vite serve them directly from node_modules instead.
  optimizeDeps: {
    exclude: ['jspdf', 'html2canvas', 'dompurify'],
  },

  resolve: {
    // Strip .js from relative imports so Rollup can resolve the .ts equivalents.
    // Needed because .js files import converted modules using the original .js extension
    // (e.g. './kantrack-modules/store.js' resolves to store.ts).
    alias: [{ find: /^(\.\.?\/.*?)\.js$/, replacement: '$1' }],
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        privacy: 'privacy.html',
      },
    },
  },
});
