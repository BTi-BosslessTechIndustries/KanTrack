# config/

Build tool and linter configuration files. All npm scripts reference these via `--config config/<file>`.

---

## Files

### `vite.config.js`

Vite build configuration.

- Entry point: `index.html` (project root)
- Output: `dist/`
- Resolve alias: strips `.js` from relative imports so Rollup can find the `.ts` equivalents (e.g. `./store.js` → resolves `store.ts`)
- `optimizeDeps.exclude`: `['jspdf', 'html2canvas', 'dompurify']` — jsPDF v4 bundles these with complex ESM chunk structures that Vite's dep optimizer cannot pre-bundle; excluding them makes Vite serve them directly from `node_modules`
- No base-path override needed — Cloudflare Pages serves from `/` by default

Relevant scripts: `npm run dev` · `npm run build` · `npm run preview`

---

### `vitest.config.js`

Vitest unit test configuration.

- Environment: Node (no DOM — unit tests mock browser APIs with `fake-indexeddb`)
- Root set explicitly to the project root (one level up) so path patterns resolve correctly
- `setupFiles`: runs `tests/setup.js` before every test file (mocks IDB, localStorage, crypto)
- `include`: only `tests/**/*.{test,spec}.*` — the `tests/e2e/` subdirectory is excluded so Playwright specs are never picked up by Vitest
- Module isolation enabled between test files

Relevant scripts: `npm run test:run` · `npm run test` · `npm run test:ui`

---

### `playwright.config.js`

Playwright E2E test configuration.

- Tests in `../tests/e2e/` (relative to this config file)
- Browser: Chromium only (single-browser smoke tests)
- `webServer`: builds the app (`npm run build`) then starts `vite preview` before tests run
- Screenshots and traces captured only on failure
- 1 retry in CI to handle IDB timing variance
- Workers: 1 (sequential) — app is single-user local-first, no parallelism benefit

Relevant scripts: `npm run e2e` · `npm run e2e:ui`

---

### `eslint.config.js`

ESLint flat config (v9 format).

- `scripts/**`: browser globals, ES2022 modules, `no-unused-vars` as warning
- `tests/**`: adds Node + Vitest globals (`describe`, `it`, `expect`, `vi`, etc.)
- `config/*.config.js`: Node globals (these config files themselves)
- TypeScript files excluded — `tsc` (via `npm run typecheck`) handles type checking
- Prettier conflicts disabled via `eslint-config-prettier`

> **Path note:** Because this file lives in `config/`, all `files` and `ignores` patterns use `../` to reference the project root. This is expected ESLint flat config behaviour when a config is not at the project root.

Relevant scripts: `npm run lint` · `npm run lint:fix`

---

## Adding a new tool config

1. Create `config/<toolname>.config.js`
2. Update the relevant `npm run` script in `package.json` to add `--config config/<toolname>.config.js`
3. Add a section here explaining what it does
