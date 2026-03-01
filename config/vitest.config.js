import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

// Vitest defaults root to the config file's directory.
// Explicitly set it to the project root so that setupFiles and include
// patterns resolve correctly from <project>/ instead of <project>/config/.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  resolve: {
    // Strip .js from relative imports so Vite can resolve the .ts equivalents.
    // Needed because Vitest's Node environment doesn't auto-remap .js → .ts.
    alias: [{ find: /^(\.\.?\/.*?)\.js$/, replacement: '$1' }],
  },
  test: {
    globals: true,
    environment: 'node',
    root: projectRoot,
    setupFiles: ['./tests/setup.js'],
    // Isolate modules between test files so module-level state doesn't bleed
    isolate: true,
    // Only pick up unit tests in /tests — exclude Playwright e2e specs
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
