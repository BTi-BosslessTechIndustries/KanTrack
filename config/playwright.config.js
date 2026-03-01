import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // testDir is relative to this config file's location (config/).
  // tests/e2e/ is one level up and then into tests/e2e/.
  testDir: '../tests/e2e',

  // Run tests sequentially — the app is a single-user local-first app
  fullyParallel: false,
  // Retry once on CI to handle flakiness from IDB timing
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    // Base URL set by the webServer below
    baseURL: 'http://localhost:4173',
    // Capture screenshots and traces only on failure
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite preview server before running tests.
  // The build command uses the config path from package.json scripts.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
